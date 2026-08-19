"""SSRF guard for user-supplied mail hosts.

The preflight opens sockets to addresses a user typed into a form. That is a
server-side request forgery primitive unless every target is validated first.
Resolve here, validate here, and connect to the *returned IP* — re-resolving
the hostname at connect time reopens the DNS-rebinding hole this module exists
to close.
"""
from __future__ import annotations

import asyncio
import ipaddress

import dns.exception
import dns.resolver

ALLOWED_PROBE_PORTS: frozenset[int] = frozenset({25, 143, 465, 587, 993, 2525})

_RESOLVE_TIMEOUT_S = 5.0


class BlockedAddressError(Exception):
    """Raised when a host does not resolve to a usable public address."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def is_port_allowed(port: int) -> bool:
    return port in ALLOWED_PROBE_PORTS


async def _lookup_a_records(host: str) -> list[str]:
    """Resolve A and AAAA records. Returns [] on any DNS failure."""
    def _query() -> list[str]:
        out: list[str] = []
        for rdtype in ("A", "AAAA"):
            try:
                answers = dns.resolver.resolve(host, rdtype, lifetime=_RESOLVE_TIMEOUT_S)
                out.extend(str(r) for r in answers)
            except dns.exception.DNSException:
                continue
        return out

    return await asyncio.to_thread(_query)


def _is_public(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    # link_local covers 169.254.0.0/16, i.e. the cloud metadata endpoint.
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def resolve_public_ips(host: str) -> list[str]:
    """Resolve ``host`` and return its addresses, or raise BlockedAddressError.

    Blocks if *any* resolved address is non-public: a host that returns one
    public and one private address is an attack, not a misconfiguration.
    """
    addrs = await _lookup_a_records(host)
    if not addrs:
        raise BlockedAddressError("no_dns_record")
    for addr in addrs:
        if not _is_public(addr):
            raise BlockedAddressError("non_public_address")
    return addrs
