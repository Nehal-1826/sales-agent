"""DNSBL (blacklist) checker.

Queries a domain's sending IP and the domain itself against a fixed set of
public DNS blocklists (DNSBLs / RBLs). Mirrors ``services/dns_validator.py``:
``dnspython`` is synchronous, so every lookup is wrapped in
``asyncio.to_thread`` and bounded with a short per-query lifetime. When
``settings.mailbox_probes_dummy`` is True (dev default) the checker returns a
clean "no hits" result without touching the network — same env flag that
gates the SMTP/IMAP/DNS probes — so flipping ``MAILBOX_PROBES_DUMMY=false``
turns on live checks across the whole platform in one go.

DNSBL mechanics:
  * IP-based lists (e.g. Spamhaus ZEN): reverse the dotted-quad and query an
    ``A`` record at ``<d.c.b.a>.<zone>``. A 127.0.0.0/8 answer means *listed*;
    NXDOMAIN means *clear*.
  * Domain-based lists (e.g. Spamhaus DBL): query ``<domain>.<zone>``.
  * 127.255.255.0/24 answers are provider *error* codes (query blocked / rate
    limited via a public resolver), NOT a listing — treated as clear.

The single network seam is ``_resolve_a`` so unit tests can monkeypatch it
with a deterministic mapping instead of hitting real resolvers.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import dns.resolver
from dns.exception import DNSException

from app.config import get_settings

logger = logging.getLogger(__name__)

# Per-query DNS timeout. Public resolvers answer DNSBL queries in well under a
# second; 1.5s gives headroom while keeping the worst case short.
RESOLVE_TIMEOUT_S = 1.5

# Cache the latest per-domain hit list so the (frequently polled) reputation
# overview can render real blacklist state without doing live DNS on every
# request. The hourly alert scan refreshes it; on-demand checks refresh it too.
_CACHE_TTL_S = 25 * 3600

# Safety cap: a single hourly scan won't run live DNS against more than this
# many distinct domains. Anything beyond is logged and skipped rather than
# silently dropped.
MAX_DOMAINS_PER_SCAN = 250


@dataclass(frozen=True)
class Provider:
    name: str
    zone: str
    kind: str  # "ip" or "domain"


# Public DNSBLs. Display names are surfaced verbatim in the UI's blacklist
# card, so keep them human-readable.
PROVIDERS: tuple[Provider, ...] = (
    Provider("Spamhaus ZEN", "zen.spamhaus.org", "ip"),
    Provider("Spamhaus DBL", "dbl.spamhaus.org", "domain"),
    Provider("Barracuda", "b.barracudacentral.org", "ip"),
    Provider("SpamCop", "bl.spamcop.net", "ip"),
    Provider("SORBS", "dnsbl.sorbs.net", "ip"),
    Provider("UCEPROTECT-1", "dnsbl-1.uceprotect.net", "ip"),
    Provider("Lashback UBL", "ubl.unsubscore.com", "ip"),
)


@dataclass
class ProviderResult:
    name: str
    zone: str
    kind: str
    listed: bool


@dataclass
class DomainBlacklistResult:
    domain: str
    checked_ip: str | None
    providers: list[ProviderResult]
    hits: list[str]
    checked_at: datetime

    def to_envelope(self) -> dict:
        """Wire shape consumed by the reputation route + frontend.

        Keeps the original stub's keys (``domain`` / ``checked_against`` /
        ``hits`` / ``checked_at``) for backwards compatibility and adds the
        richer ``checked_ip`` / ``providers`` fields.
        """
        return {
            "domain": self.domain,
            "checked_ip": self.checked_ip,
            "checked_against": [p.name for p in self.providers],
            "providers": [{"name": p.name, "listed": p.listed} for p in self.providers],
            "hits": self.hits,
            "checked_at": self.checked_at.isoformat(),
        }


# --------------------------------------------------------------------------- #
# DNS primitives (the single network seam — monkeypatched in tests)            #
# --------------------------------------------------------------------------- #


async def _resolve_a(name: str) -> list[str]:
    """Resolve ``A`` records for ``name``. Returns [] on NXDOMAIN/NoAnswer/timeout."""
    try:
        answers = await asyncio.to_thread(
            dns.resolver.resolve, name, "A", lifetime=RESOLVE_TIMEOUT_S
        )
    except DNSException:
        return []
    out: list[str] = []
    for r in answers:
        addr = getattr(r, "address", None)
        out.append(str(addr) if addr is not None else str(r))
    return out


def _reverse_ipv4(ip: str) -> str | None:
    parts = ip.split(".")
    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        return None
    return ".".join(reversed(parts))


def _listed_from_answers(answers: list[str]) -> bool:
    """A DNSBL hit is any 127.0.0.0/8 answer except the 127.255.255.0/24
    error/blocked range that public resolvers return when a query is rejected."""
    for ip in answers:
        if ip.startswith("127.") and not ip.startswith("127.255.255."):
            return True
    return False


# --------------------------------------------------------------------------- #
# Core check                                                                   #
# --------------------------------------------------------------------------- #


def _clean_result(domain: str, checked_ip: str | None, when: datetime) -> DomainBlacklistResult:
    providers = [ProviderResult(p.name, p.zone, p.kind, False) for p in PROVIDERS]
    return DomainBlacklistResult(domain, checked_ip, providers, [], when)


async def check_domain_blacklists(domain: str) -> DomainBlacklistResult:
    """Check ``domain`` (and its first IPv4) against every provider in PROVIDERS.

    Returns a clean (no-hits) result without touching the network when
    ``MAILBOX_PROBES_DUMMY`` is on, so dev/test default to "no false alarms".
    """
    domain = domain.strip().lower().rstrip(".")
    checked_at = datetime.now(UTC)

    if get_settings().mailbox_probes_dummy:
        logger.info("[probe-dummy] skipping blacklist check for domain=%s", domain)
        return _clean_result(domain, None, checked_at)

    # Resolve the domain's sending IP for the IP-based lists.
    ips = await _resolve_a(domain)
    ipv4 = next((ip for ip in ips if _reverse_ipv4(ip) is not None), None)
    reversed_ip = _reverse_ipv4(ipv4) if ipv4 else None

    async def _check(p: Provider) -> ProviderResult:
        if p.kind == "ip":
            if reversed_ip is None:
                # No resolvable IP → can't evaluate IP-based lists; report clear.
                return ProviderResult(p.name, p.zone, p.kind, False)
            qname = f"{reversed_ip}.{p.zone}"
        else:
            qname = f"{domain}.{p.zone}"
        try:
            answers = await _resolve_a(qname)
        except Exception as exc:  # noqa: BLE001 — never let one list break the rest
            logger.debug("dnsbl query failed q=%s err=%s", qname, exc)
            return ProviderResult(p.name, p.zone, p.kind, False)
        return ProviderResult(p.name, p.zone, p.kind, _listed_from_answers(answers))

    results = list(await asyncio.gather(*(_check(p) for p in PROVIDERS)))
    hits = [r.name for r in results if r.listed]
    return DomainBlacklistResult(domain, ipv4, results, hits, checked_at)


# --------------------------------------------------------------------------- #
# Best-effort Redis cache (so the overview can render hits without live DNS)   #
# --------------------------------------------------------------------------- #


def _redis_or_none():
    """Best-effort Redis client; ``None`` when Redis is unreachable. The cache
    is purely an optimisation — every caller degrades to a live check or an
    empty list when it's absent (mirrors tasks/peer_actions)."""
    try:
        import redis  # local import keeps cold-start cheap

        return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("blacklist redis client unavailable: %s", exc)
        return None


def _cache_key(domain: str) -> str:
    return f"{get_settings().redis_key_prefix}blacklist:hits:{domain.strip().lower()}"


def cache_hits_get(domain: str) -> list[str] | None:
    """Latest known hit list for ``domain``; ``None`` on miss / no Redis."""
    client = _redis_or_none()
    if client is None:
        return None
    try:
        raw = client.get(_cache_key(domain))
        if raw is None:
            return None
        parsed = json.loads(raw)
        return [str(x) for x in parsed] if isinstance(parsed, list) else None
    except Exception as exc:  # noqa: BLE001
        logger.debug("blacklist cache get failed domain=%s err=%s", domain, exc)
        return None


def cache_hits_put(domain: str, hits: list[str]) -> None:
    client = _redis_or_none()
    if client is None:
        return
    try:
        client.setex(_cache_key(domain), _CACHE_TTL_S, json.dumps(list(hits)))
    except Exception as exc:  # noqa: BLE001
        logger.debug("blacklist cache put failed domain=%s err=%s", domain, exc)
