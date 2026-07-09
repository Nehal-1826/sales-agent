"""Auto-detect mailbox provider + SMTP/IMAP defaults from a domain's MX records.

Used by the onboarding wizard so the user doesn't have to know that their
Zoho mailbox is in the India data centre (smtp.zoho.in) rather than the
global one (smtp.zoho.com). The MX record is authoritative — whatever
Zoho/Google/Microsoft/Yahoo tells the world is *the* server those
providers are willing to deliver to.

The lookup is best-effort: a DNS failure returns ``provider="unknown"``
rather than raising, so the frontend can still render its manual
fall-through (region picker + plain host fields).
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal

import dns.exception
import dns.resolver
from pydantic import BaseModel

logger = logging.getLogger(__name__)

RESOLVE_TIMEOUT_S = 5.0

ProviderKey = Literal[
    "gmail", "outlook", "yahoo", "zoho", "icloud", "unknown"
]


class ProviderDetection(BaseModel):
    """Result of MX-based provider detection.

    ``zoho_region`` is only populated when the provider is Zoho. Examples:
    ``"com"`` (global / US), ``"in"`` (India), ``"eu"`` (Europe),
    ``"com.au"``, ``"jp"``, ``"com.cn"``.
    """

    domain: str
    provider: ProviderKey
    zoho_region: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    mx_records: list[str] = []
    note: str | None = None


# Zoho's MX records always end in ``mx.zoho.<region>`` (or mx2/mx3 prefix).
# The capture group pulls the TLD-ish suffix so we can mirror it into
# smtp.zoho.<region> / imap.zoho.<region>.
_ZOHO_MX_RE = re.compile(r"^(?:mx2?|mx3)\.zoho\.([a-z.]+)\.?$", re.IGNORECASE)


def _classify_mx(mx_hosts: list[str]) -> ProviderDetection:
    """Inspect a sorted list of MX hostnames and produce a detection."""
    lowered = [h.lower().rstrip(".") for h in mx_hosts]

    # --- Zoho (regions matter) ---
    for host in lowered:
        m = _ZOHO_MX_RE.match(host)
        if m:
            region = m.group(1)
            return ProviderDetection(
                domain="",
                provider="zoho",
                zoho_region=region,
                smtp_host=f"smtp.zoho.{region}",
                smtp_port=587,
                imap_host=f"imap.zoho.{region}",
                imap_port=993,
                mx_records=mx_hosts,
            )

    # --- Google Workspace / consumer Gmail ---
    for host in lowered:
        if (
            host.endswith(".google.com")
            or host.endswith(".googlemail.com")
            or host == "smtp.gmail.com"
            or host.endswith(".l.google.com")
        ):
            return ProviderDetection(
                domain="",
                provider="gmail",
                smtp_host="smtp.gmail.com",
                smtp_port=587,
                imap_host="imap.gmail.com",
                imap_port=993,
                mx_records=mx_hosts,
            )

    # --- Microsoft 365 / Outlook ---
    for host in lowered:
        if (
            host.endswith(".outlook.com")
            or host.endswith(".protection.outlook.com")
            or host.endswith(".mail.protection.outlook.com")
        ):
            return ProviderDetection(
                domain="",
                provider="outlook",
                smtp_host="smtp.office365.com",
                smtp_port=587,
                imap_host="outlook.office365.com",
                imap_port=993,
                mx_records=mx_hosts,
            )

    # --- Yahoo ---
    for host in lowered:
        if host.endswith(".yahoodns.net") or host.endswith(".yahoo.com"):
            return ProviderDetection(
                domain="",
                provider="yahoo",
                smtp_host="smtp.mail.yahoo.com",
                smtp_port=587,
                imap_host="imap.mail.yahoo.com",
                imap_port=993,
                mx_records=mx_hosts,
            )

    # --- iCloud ---
    for host in lowered:
        if host.endswith(".mail.icloud.com") or host.endswith(".icloud.com"):
            return ProviderDetection(
                domain="",
                provider="icloud",
                smtp_host="smtp.mail.me.com",
                smtp_port=587,
                imap_host="imap.mail.me.com",
                imap_port=993,
                mx_records=mx_hosts,
            )

    return ProviderDetection(
        domain="",
        provider="unknown",
        mx_records=mx_hosts,
        note="MX records did not match any known managed-mail provider.",
    )


async def detect_from_email(email_address: str) -> ProviderDetection:
    """Resolve MX for the domain part of ``email_address`` and classify it.

    Returns a ``ProviderDetection`` with provider="unknown" on any DNS
    failure rather than raising. The frontend treats "unknown" as
    "user picks manually".
    """
    if "@" not in email_address:
        return ProviderDetection(
            domain="", provider="unknown", note="No domain part in email."
        )
    domain = email_address.rsplit("@", 1)[1].strip().lower()
    if not domain:
        return ProviderDetection(
            domain="", provider="unknown", note="Empty domain."
        )

    try:
        answers = await asyncio.to_thread(
            dns.resolver.resolve, domain, "MX", lifetime=RESOLVE_TIMEOUT_S
        )
    except (
        dns.resolver.NXDOMAIN,
        dns.resolver.NoAnswer,
        dns.resolver.NoNameservers,
        dns.exception.Timeout,
        Exception,
    ) as exc:
        logger.info("mx_lookup_failed domain=%s err=%s", domain, type(exc).__name__)
        return ProviderDetection(
            domain=domain,
            provider="unknown",
            note=f"DNS lookup failed ({type(exc).__name__}); pick the provider manually.",
        )

    # dnspython returns MX records as (preference, exchange) — sort by preference
    sorted_records = sorted(answers, key=lambda r: r.preference)
    mx_hosts = [str(r.exchange).rstrip(".") for r in sorted_records]

    result = _classify_mx(mx_hosts)
    result.domain = domain
    return result
