"""Ordered diagnostic ladder for mailbox connections.

Runs one check at a time and stops at the first blocking failure. Reporting
six problems at once is how you get a user to fix none of them.

See docs/superpowers/specs/2026-08-19-self-hosted-mailbox-preflight-design.md
"""
from __future__ import annotations

import re
import uuid
from typing import Literal

from pydantic import BaseModel

from app.services.cdn_ranges import is_cdn_ip
from app.services.net_guard import BlockedAddressError, resolve_public_ips

CheckStatus = Literal["pass", "fail", "warn", "skipped"]

# Compose service names and loopback aliases a self-hoster copies out of their
# own .env without realising WarmPulse connects from outside their network.
_CONTAINER_NAMES = frozenset({
    "mail", "mailserver", "smtp", "imap", "postfix", "dovecot",
    "localhost", "127.0.0.1", "::1", "0.0.0.0",
})

_VALID_HOSTNAME = re.compile(
    r"^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+\.?$",
    re.IGNORECASE,
)


class PreflightCheck(BaseModel):
    id: str
    status: CheckStatus
    detail: str
    remedy: str | None = None
    docs_anchor: str | None = None


def check_host_shape(host: str) -> PreflightCheck:
    """Rung 1 — is this even a hostname?"""
    raw = (host or "").strip()
    if _VALID_HOSTNAME.match(raw):
        return PreflightCheck(
            id="host_shape", status="pass", detail=f"{raw} is a valid hostname."
        )
    return PreflightCheck(
        id="host_invalid",
        status="fail",
        detail=f"'{raw}' is not a hostname.",
        remedy=(
            "Enter just the mail server's hostname — for example "
            "mail.yourdomain.com. Not a URL, not an email address, and no "
            "https:// prefix or /path on the end."
        ),
        docs_anchor="self-hosted#hostname",
    )


def check_not_container_name(host: str) -> PreflightCheck:
    """Rung 2 — is this a Docker service name or a loopback alias?"""
    raw = (host or "").strip().lower().rstrip(".")
    if raw in _CONTAINER_NAMES or ("." not in raw and raw != ""):
        return PreflightCheck(
            id="host_docker_internal",
            status="fail",
            detail=f"'{raw}' only resolves inside your own network.",
            remedy=(
                "That looks like a Docker service name or a local alias. "
                "WarmPulse connects from the public internet, so it needs a "
                "publicly resolvable hostname such as mail.yourdomain.com. "
                "Your application's own config can keep using the internal "
                "name."
            ),
            docs_anchor="self-hosted#docker",
        )
    return PreflightCheck(
        id="host_reachable_name", status="pass", detail=f"{raw} is publicly addressable."
    )


async def check_dns(host: str) -> tuple[PreflightCheck, list[str]]:
    """Rung 3 — does the hostname resolve to a usable public address?"""
    try:
        ips = await resolve_public_ips(host)
    except BlockedAddressError as exc:
        if exc.reason == "non_public_address":
            return PreflightCheck(
                id="dns_private_address",
                status="fail",
                detail=f"{host} resolves to a private or reserved address.",
                remedy=(
                    "WarmPulse connects from the public internet and cannot "
                    "reach private addresses. Point this hostname at your "
                    "server's public IP."
                ),
                docs_anchor="self-hosted#dns",
            ), []
        return PreflightCheck(
            id="dns_no_record",
            status="fail",
            detail=f"{host} does not resolve.",
            remedy=(
                "Add a DNS A record for this hostname pointing at your mail "
                "server's public IP address."
            ),
            docs_anchor="self-hosted#dns",
        ), []
    return PreflightCheck(
        id="dns_resolves", status="pass", detail=f"{host} resolves to {', '.join(ips)}."
    ), ips


async def check_not_wildcard(host: str, resolved: list[str]) -> PreflightCheck:
    """Rung 4 — did this hostname only resolve because of a ``*`` record?"""
    parts = host.strip().rstrip(".").split(".")
    if len(parts) < 2:
        return PreflightCheck(
            id="dns_wildcard_skipped", status="skipped", detail="Host has no parent domain."
        )
    parent = ".".join(parts[1:])
    probe = f"{uuid.uuid4().hex}.{parent}"
    try:
        probe_ips = await resolve_public_ips(probe)
    except BlockedAddressError:
        return PreflightCheck(
            id="dns_real_record",
            status="pass",
            detail=f"{host} is a real record, not a wildcard match.",
        )
    if set(probe_ips) == set(resolved):
        return PreflightCheck(
            id="dns_wildcard",
            status="fail",
            detail=(
                f"{host} is not a real DNS record — a wildcard (*.{parent}) is "
                f"answering for it."
            ),
            remedy=(
                f"Create an explicit A record for {host} pointing at your mail "
                f"server's IP. An explicit record takes precedence over the "
                f"wildcard."
            ),
            docs_anchor="self-hosted#wildcard",
        )
    return PreflightCheck(
        id="dns_real_record", status="pass", detail=f"{host} is a real record."
    )


def check_not_cdn_proxied(resolved: list[str]) -> PreflightCheck:
    """Rung 5 — is the hostname pointed at a CDN edge instead of the server?"""
    for addr in resolved:
        cdn = is_cdn_ip(addr)
        if cdn:
            return PreflightCheck(
                id="cdn_proxied",
                status="fail",
                detail=f"{addr} is a {cdn} edge address, not your mail server.",
                remedy=(
                    f"{cdn}'s proxy only carries HTTP and HTTPS — it cannot "
                    f"carry SMTP or IMAP. In your DNS dashboard, set this "
                    f"record to DNS only (grey cloud) so it points straight at "
                    f"your server."
                ),
                docs_anchor="self-hosted#cdn",
            )
    return PreflightCheck(
        id="direct_to_origin", status="pass", detail="Hostname points directly at a server."
    )
