"""CRM reply detection — IMAP-scan sending mailboxes for replies to sequence sends.

Every CRM sequence step is sent with a deterministic Message-Id
(:func:`crm_tracking.sequence_message_id`). When a prospect replies, their mail
client quotes that id in the ``In-Reply-To`` / ``References`` headers. This
module logs into the workspace's sending mailbox over IMAP, scans recent INBOX
messages for those headers, and records a deduped ``email_replied`` activity so
``reply_rate`` auto-populates in campaign analytics.

Only SMTP-capable mailboxes (a real password, not OAuth-only) that also carry an
``imap_host`` are scanned — the SMTP password is reused for IMAP, which is how
generic providers (cPanel, Hostinger, custom domains) are configured.
OAuth-only mailboxes have no password and are skipped (XOAUTH2 is a later wave);
the scan degrades gracefully rather than crashing on them.
"""
from __future__ import annotations

import contextlib
import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import aioimaplib
from sqlalchemy import select

from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.session import SessionLocal
from app.services import crm_tracking
from app.services.crypto import FernetService, get_fernet_service

logger = logging.getLogger(__name__)

# How far back each scan looks. Replies usually land within days; 14 gives slack
# for weekend sends without rescanning the whole mailbox.
_LOOKBACK_DAYS = 14
# Cap messages inspected per mailbox per run so a huge INBOX can't stall the tick.
_MAX_MESSAGES = 300
_IMAP_TIMEOUT = 20


def _decode(line: object) -> str:
    if isinstance(line, (bytes, bytearray)):
        return line.decode(errors="replace")
    return str(line)


async def _open_inbox(
    host: str, port: int, username: str, password: str
) -> aioimaplib.IMAP4_SSL:
    """Connect + login + SELECT INBOX. Caller scrubs the password afterward."""
    client = aioimaplib.IMAP4_SSL(host=host, port=port, timeout=_IMAP_TIMEOUT)
    await client.wait_hello_from_server()
    await client.login(username, password)
    await client.select("INBOX")
    return client


async def scan_mailbox_replies(
    mailbox: object, since: datetime, fernet: FernetService
) -> int:
    """Scan one mailbox's INBOX for replies to CRM sequence sends.

    Returns the number of NEW ``email_replied`` activities recorded (dedup means
    a thread already credited returns 0). Skips (returns 0) when the mailbox has
    no ``imap_host`` or no SMTP password to reuse for IMAP.
    """
    host = getattr(mailbox, "imap_host", None)
    username = getattr(mailbox, "smtp_username", None)
    pw_blob = getattr(mailbox, "smtp_password_encrypted", None)
    if not host or not username or not pw_blob:
        return 0
    port = int(getattr(mailbox, "imap_port", None) or 993)

    password = fernet.decrypt(pw_blob).decode()
    try:
        client = await _open_inbox(host, port, username, password)
    finally:
        password = "REDACTED"  # noqa: F841 — scrub regardless of login outcome
        del password

    recorded = 0
    try:
        date_str = since.strftime("%d-%b-%Y")
        # uid_search => UID SEARCH; .uid("search",…) raises Abort in aioimaplib.
        resp = await client.uid_search("SINCE", date_str)
        if resp.result != "OK":
            return 0
        uids: list[str] = []
        for line in resp.lines:
            uids.extend(_decode(line).split())

        for uid in uids[:_MAX_MESSAGES]:
            fetch = await client.uid(
                "fetch", uid, "(BODY.PEEK[HEADER.FIELDS (IN-REPLY-TO REFERENCES)])"
            )
            if fetch.result != "OK":
                continue
            blob = " ".join(_decode(line) for line in fetch.lines)
            match = crm_tracking.parse_sequence_message_id(blob)
            if match is None:
                continue
            enrollment_id, step = match
            async with SessionLocal() as db:
                status = await crm_tracking.record_reply(
                    db, enrollment_id=enrollment_id, step=step
                )
            if status == "recorded":
                recorded += 1
    finally:
        with contextlib.suppress(Exception):
            await client.logout()
    return recorded


async def scan_all_replies() -> dict:
    """System-wide: scan every SMTP-capable, IMAP-reachable sending mailbox.

    One bad mailbox (auth failure, unreachable IMAP) is logged and skipped — it
    never stops the others. Mailbox attributes are captured into plain values
    while the session is open so no lazy-load fires during the network I/O.
    """
    fernet = get_fernet_service()
    since = datetime.now(UTC) - timedelta(days=_LOOKBACK_DAYS)

    async with SessionLocal() as db:
        rows = (
            await db.scalars(
                select(Mailbox).where(
                    Mailbox.warmup_status == WarmupStatus.active,
                    Mailbox.is_paused.is_(False),
                    Mailbox.smtp_password_encrypted.is_not(None),
                    Mailbox.imap_host.is_not(None),
                )
            )
        ).all()
        mailboxes = [
            SimpleNamespace(
                id=m.id,
                imap_host=m.imap_host,
                imap_port=m.imap_port,
                smtp_username=m.smtp_username,
                smtp_password_encrypted=m.smtp_password_encrypted,
            )
            for m in rows
        ]

    total = 0
    scanned = 0
    for mb in mailboxes:
        try:
            total += await scan_mailbox_replies(mb, since, fernet)
            scanned += 1
        except Exception as exc:  # noqa: BLE001 — one bad mailbox can't stop the rest
            logger.warning("crm reply scan failed mailbox=%s: %s", mb.id, exc)
    return {"scanned_mailboxes": scanned, "replies_recorded": total}
