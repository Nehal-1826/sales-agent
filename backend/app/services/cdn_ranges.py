"""Published CDN edge ranges.

A CDN proxy carries HTTP/HTTPS only, so a mail hostname resolving into one of
these ranges can never accept SMTP or IMAP — the connection reaches an edge
server that does not speak the protocol.

Vendored from https://www.cloudflare.com/ips/ as of 2026-08-19. Cloudflare
does add ranges; refresh this list periodically or rung 5 silently stops
detecting proxied hosts.
"""
from __future__ import annotations

import ipaddress

CLOUDFLARE_V4: tuple[str, ...] = (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
)

_NETWORKS = tuple(
    (name, ipaddress.ip_network(cidr))
    for name, cidrs in (("Cloudflare", CLOUDFLARE_V4),)
    for cidr in cidrs
)


def is_cdn_ip(addr: str) -> str | None:
    """Return the CDN name if ``addr`` sits in a known edge range, else None."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return None
    for name, net in _NETWORKS:
        if ip.version == net.version and ip in net:
            return name
    return None
