"""Ordered diagnostic ladder for mailbox connections.

Runs one check at a time and stops at the first blocking failure. Reporting
six problems at once is how you get a user to fix none of them.

See docs/superpowers/specs/2026-08-19-self-hosted-mailbox-preflight-design.md
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

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
