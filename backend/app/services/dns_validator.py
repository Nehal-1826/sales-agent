"""DNS (SPF / DKIM / DMARC) validator.

Hand-parses TXT records via ``dnspython`` for full control over warnings and
error messages. ``dnspython`` is synchronous, so every resolve is wrapped in
``asyncio.to_thread`` and the full three-record check is bounded with
``asyncio.wait_for(timeout=20s)``.

Fix instructions (``*_FIX``) are returned only for records that fail, so the
frontend can render actionable guidance alongside the error.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime

import dns.resolver
from dns.exception import DNSException

logger = logging.getLogger(__name__)

# Order matters: try the caller-supplied selector first, then walk these.
DEFAULT_DKIM_SELECTORS: tuple[str, ...] = (
    "default",
    "dkim",               # Bare "dkim" — common on self-signed apps + iRedMail
    "google",
    "selector1",          # Microsoft 365 / Outlook
    "selector2",          # Microsoft 365 / Outlook
    "hostingermail-a",    # Hostinger default
    "hostingermail-b",    # Hostinger rotating
    "mta",                # MailerLite / some transactional senders
    "k1",                 # Mandrill / Mailchimp
    "s1",                 # SendGrid
    "mail",
    "20210112",           # Gmail date-based selectors
)

# Per-query DNS timeout. Real-world public resolvers (1.1.1.1, 8.8.8.8) answer
# in <100ms; 1.5s gives generous headroom for a slow query while keeping the
# worst-case wait short.
RESOLVE_TIMEOUT_S = 1.5
# Overall ceiling for the SPF + DKIM + DMARC fan-out. With parallel DKIM
# selector probing all three records resolve in roughly one RESOLVE_TIMEOUT_S
# window, so 3s comfortably bounds the worst case.
TOTAL_TIMEOUT_S = 3.0

# In-process result cache. Onboarding may re-issue the same /dns/check call
# (page remounts, navigation back, retry) and there's no reason to hit DNS
# twice within a short window. Keyed by (domain, dkim_selector); entries
# evicted after CACHE_TTL_S.
CACHE_TTL_S = 30.0
_check_cache: dict[tuple[str, str], tuple[float, "FullDnsResult"]] = {}


# --------------------------------------------------------------------------- #
# Fix instructions                                                             #
# --------------------------------------------------------------------------- #

SPF_FIX = (
    "Add a TXT record at your root domain:\n"
    "  Name: @   Type: TXT\n"
    "  Value: v=spf1 include:_spf.google.com ~all\n"
    "Replace the include with your mail provider (Outlook: include:spf.protection.outlook.com).\n"
    "Propagation: 1-4 hours."
)

DKIM_FIX = (
    "Generate a DKIM key pair from your mail provider.\n"
    "  Google Workspace: Apps - Google Workspace - Gmail - Authenticate email.\n"
    "  Outlook: Microsoft Defender - Email & collaboration - DKIM.\n"
    "Publish the provided TXT record at <selector>._domainkey.yourdomain.com.\n"
    "Keep the private key secret; only the public key goes in DNS."
)

DMARC_FIX = (
    "Start with a monitoring policy:\n"
    "  Name: _dmarc   Type: TXT\n"
    "  Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com\n"
    "After 2-4 weeks of reports, tighten to p=quarantine, then p=reject.\n"
    "Never use 'p=reject' without monitoring first - legitimate mail can fail."
)


# --------------------------------------------------------------------------- #
# Result dataclasses (internal; route layer converts to Pydantic)              #
# --------------------------------------------------------------------------- #


@dataclass
class SpfResultData:
    valid: bool
    record: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class DkimResultData:
    valid: bool
    selector: str
    record: str | None = None
    errors: list[str] = field(default_factory=list)


@dataclass
class DmarcResultData:
    valid: bool
    record: str | None = None
    policy: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class FullDnsResult:
    domain: str
    spf: SpfResultData
    dkim: DkimResultData
    dmarc: DmarcResultData
    checked_at: datetime
    timed_out: bool = False


# --------------------------------------------------------------------------- #
# TXT helpers                                                                  #
# --------------------------------------------------------------------------- #


def _decode_txt(rdata) -> str:
    """Join multi-string TXT records (some providers split > 255 char values)."""
    parts = []
    for s in rdata.strings:
        if isinstance(s, bytes):
            parts.append(s.decode("utf-8", errors="replace"))
        else:
            parts.append(str(s))
    return "".join(parts)


async def _resolve_txt(name: str) -> list[str]:
    """Resolve TXT records for ``name``. Raises dnspython exceptions on failure."""
    answers = await asyncio.to_thread(
        dns.resolver.resolve, name, "TXT", lifetime=RESOLVE_TIMEOUT_S
    )
    return [_decode_txt(r) for r in answers]


def _friendly_dns_error(exc: Exception) -> str:
    if isinstance(exc, dns.resolver.NXDOMAIN):
        return "Domain does not exist (NXDOMAIN)"
    if isinstance(exc, dns.resolver.NoAnswer):
        return "No TXT records returned"
    if isinstance(exc, dns.resolver.NoNameservers):
        return "No authoritative nameservers could answer"
    if isinstance(exc, dns.exception.Timeout):
        return "DNS query timed out"
    return f"DNS error: {type(exc).__name__}"


# --------------------------------------------------------------------------- #
# SPF                                                                          #
# --------------------------------------------------------------------------- #


async def check_spf(domain: str) -> SpfResultData:
    logger.info("DNS check: SPF for domain=%s", domain)
    try:
        records = await _resolve_txt(domain)
    except DNSException as exc:
        return SpfResultData(valid=False, errors=[_friendly_dns_error(exc)])

    spf_records = [r for r in records if r.lower().startswith("v=spf1")]
    if not spf_records:
        return SpfResultData(
            valid=False, errors=["No SPF record found at root domain"]
        )
    if len(spf_records) > 1:
        return SpfResultData(
            valid=False,
            record=spf_records[0],
            errors=["Multiple SPF records found (RFC 7208 allows only one)"],
        )

    record = spf_records[0]
    result = SpfResultData(valid=True, record=record)
    trimmed = record.strip().lower()
    if trimmed.endswith("-all") or trimmed.endswith("~all"):
        return result
    if trimmed.endswith("+all"):
        result.warnings.append("+all permits any sender - critically insecure")
        return result
    if trimmed.endswith("?all"):
        result.warnings.append("neutral or missing `all` mechanism")
        return result
    # No `all` at all.
    result.warnings.append("neutral or missing `all` mechanism")
    return result


# --------------------------------------------------------------------------- #
# DMARC                                                                        #
# --------------------------------------------------------------------------- #


async def check_dmarc(domain: str) -> DmarcResultData:
    logger.info("DNS check: DMARC for domain=%s", domain)
    name = f"_dmarc.{domain}"
    try:
        records = await _resolve_txt(name)
    except DNSException as exc:
        return DmarcResultData(valid=False, errors=[_friendly_dns_error(exc)])

    dmarc_records = [r for r in records if r.lower().startswith("v=dmarc1")]
    if not dmarc_records:
        return DmarcResultData(valid=False, errors=["No DMARC record found"])

    record = dmarc_records[0]
    policy_match = re.search(r"p=(none|quarantine|reject)", record, re.IGNORECASE)
    policy = policy_match.group(1).lower() if policy_match else None
    has_rua = bool(re.search(r"\brua=", record, re.IGNORECASE))

    result = DmarcResultData(record=record, policy=policy, valid=False)
    if policy is None:
        result.errors.append("DMARC record is missing required `p=` tag")
        return result

    if policy in ("quarantine", "reject"):
        result.valid = True
    else:  # p=none
        result.warnings.append(
            "Policy 'none' only monitors; emails failing DMARC still deliver"
        )
        # valid stays False — spec treats p=none as monitoring-only.

    if not has_rua:
        result.warnings.append(
            "No aggregate reporting address - you won't see DMARC reports"
        )
    return result


# --------------------------------------------------------------------------- #
# DKIM                                                                         #
# --------------------------------------------------------------------------- #


def _build_selector_list(user_selector: str) -> list[str]:
    ordered = [user_selector]
    for s in DEFAULT_DKIM_SELECTORS:
        if s not in ordered:
            ordered.append(s)
    return ordered


async def _probe_dkim_selector(domain: str, sel: str) -> DkimResultData | None:
    """Probe a single DKIM selector. Returns a valid result on hit, None on miss."""
    name = f"{sel}._domainkey.{domain}"
    try:
        records = await _resolve_txt(name)
    except DNSException:
        return None
    for record in records:
        if not re.search(r"v=DKIM1", record, re.IGNORECASE):
            continue
        p_match = re.search(r"p=([A-Za-z0-9+/=]+)", record)
        if p_match and p_match.group(1):
            return DkimResultData(valid=True, selector=sel, record=record)
    return None


async def check_dkim(domain: str, selector: str = "default") -> DkimResultData:
    """Probe every candidate DKIM selector in parallel and return the first hit.

    Previously this walked the selector list serially, so a domain with no
    DKIM (e.g. a fresh `warmpulse.dev`) took N × per-query-timeout seconds
    before declaring "no record found". With parallel probing it now resolves
    in a single per-query-timeout window regardless of how many selectors
    are configured.
    """
    logger.info("DNS check: DKIM for domain=%s selector=%s", domain, selector)
    selectors = _build_selector_list(selector)

    # Kick off all selector lookups concurrently. asyncio.gather preserves
    # selector order, so when multiple selectors happen to have DKIM records
    # (rare) we still prefer the caller-supplied one.
    results = await asyncio.gather(
        *(_probe_dkim_selector(domain, sel) for sel in selectors),
        return_exceptions=False,
    )
    for r in results:
        if r is not None:
            return r

    return DkimResultData(
        valid=False,
        selector=selector,
        errors=[f"No DKIM record found at any of: {', '.join(selectors)}"],
    )


# --------------------------------------------------------------------------- #
# Orchestration                                                                #
# --------------------------------------------------------------------------- #


async def _run_all(domain: str, dkim_selector: str) -> tuple[
    SpfResultData, DkimResultData, DmarcResultData
]:
    spf, dkim, dmarc = await asyncio.gather(
        check_spf(domain),
        check_dkim(domain, dkim_selector),
        check_dmarc(domain),
    )
    return spf, dkim, dmarc


async def check_domain(domain: str, dkim_selector: str = "default") -> FullDnsResult:
    """Run SPF + DKIM + DMARC against ``domain`` with a 20s overall timeout.

    TEMPORARY: when ``settings.mailbox_probes_dummy`` is True, return a
    pre-fabricated "all green" result without touching DNS. Same env flag
    as the SMTP/IMAP probes so flipping ``MAILBOX_PROBES_DUMMY=false``
    (or removing the dummy code per Option B) restores all live checks
    in one go.
    """
    from app.config import get_settings

    checked_at = datetime.now(UTC)

    # In-process cache — short TTL so onboarding's auto-rerun is instant
    # without serving stale data on a real refresh-after-fix flow.
    cache_key = (domain, dkim_selector)
    cached = _check_cache.get(cache_key)
    if cached is not None:
        ts, result = cached
        if time.monotonic() - ts < CACHE_TTL_S:
            logger.info("DNS check: cache hit for domain=%s", domain)
            return result
        # Stale — drop so we don't leak.
        _check_cache.pop(cache_key, None)

    if get_settings().mailbox_probes_dummy:
        logger.info("[probe-dummy] skipping DNS check for domain=%s", domain)
        return FullDnsResult(
            domain=domain,
            spf=SpfResultData(valid=True, record="v=spf1 ~all"),
            dkim=DkimResultData(
                valid=True,
                selector=dkim_selector,
                record="v=DKIM1; k=rsa; p=DUMMY",
            ),
            dmarc=DmarcResultData(
                valid=True,
                record="v=DMARC1; p=none; rua=mailto:dmarc@example.com",
                policy="none",
            ),
            checked_at=checked_at,
        )

    try:
        spf, dkim, dmarc = await asyncio.wait_for(
            _run_all(domain, dkim_selector), timeout=TOTAL_TIMEOUT_S
        )
    except TimeoutError:
        logger.warning("DNS check timed out for domain=%s after %ss", domain, TOTAL_TIMEOUT_S)
        err = f"DNS check timed out after {TOTAL_TIMEOUT_S:.0f}s"
        timeout_result = FullDnsResult(
            domain=domain,
            spf=SpfResultData(valid=False, errors=[err]),
            dkim=DkimResultData(valid=False, selector=dkim_selector, errors=[err]),
            dmarc=DmarcResultData(valid=False, errors=[err]),
            checked_at=checked_at,
            timed_out=True,
        )
        # Cache the timeout briefly too — a refresh in the next 30s would
        # otherwise re-run the same slow query for no benefit.
        _check_cache[cache_key] = (time.monotonic(), timeout_result)
        return timeout_result
    result = FullDnsResult(
        domain=domain, spf=spf, dkim=dkim, dmarc=dmarc, checked_at=checked_at
    )
    _check_cache[cache_key] = (time.monotonic(), result)
    return result


def extract_domain(email_or_domain: str) -> str:
    """Return the domain part from an email, or the input unchanged."""
    if "@" in email_or_domain:
        return email_or_domain.rsplit("@", 1)[1].strip().lower()
    return email_or_domain.strip().lower()
