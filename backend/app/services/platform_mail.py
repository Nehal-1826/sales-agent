r"""Platform Mail — the full mail system for WarmPulse's own account.

Where ``admin_mail_viewer`` is a strictly read-only inspector into *other*
people's mailboxes (client mailboxes + peer inboxes), this module gives the
super_admin a real mail client for the platform's own transactional account
(the one configured under Admin → Settings → Transactional SMTP): folders
with unread counts, message listing with seen state, full-message opens that
mark the mail read, flag toggles, delete-with-move-to-Trash, and
compose/reply sending over SMTP with an IMAP APPEND into Sent.

Differences from the viewer, on purpose:

* folders are opened with SELECT (read-write), not EXAMINE — we own this
  account and legitimately mutate flags / expunge;
* opening a message sets ``\\Seen`` (silent STORE) like any mail client;
* sending goes out through the transactional SMTP config (same resolver as
  ``transactional_mail``), single attempt, no retry loop — errors surface
  as ``OSError`` → HTTP 502.

Credential handling follows the house rules (see ``warmup/smtp_sender``):
plaintext passwords exist only between decrypt and LOGIN/send, are re-bound
to ``"REDACTED"`` and deleted afterwards, and never reach logs, audit
payloads, or responses.

Audit: ``platform_mail_send`` / ``platform_mail_delete`` /
``platform_mail_flag`` always; among reads only full-message opens log
(``platform_mail_read``) — folder listings are cheap and non-sensitive.
"""

from __future__ import annotations

import asyncio
import contextlib
import email
import email.policy
import logging
import re
import uuid
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formatdate
from typing import Any

import aioimaplib
import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.users import User
from app.services import transactional_mail
from app.services.admin_mail_viewer import (
    _HEADER_PARTS,
    _IMAP_TIMEOUT,
    _TEXT_PARTS,
    _TOTAL_BUDGET,
    _body_text,
    _connect,
    _decode_header,
    _line_text,
    _list_folders,
    _parse_fetch_lines,
    _platform_imap_config,
    _resolve_folder,
    _search_all_numbers,
    _snippet,
    _write_audit,
)
from app.services.transactional_mail import _SmtpConfig

logger = logging.getLogger(__name__)

_SMTP_TIMEOUT = 15.0
# Whole-request ceiling for one send (Cloudflare-safe).
_SEND_DEADLINE_S = 45.0

# Aliases we report unread counts for in list_folders(). Keyed by the
# _FOLDER_ALIASES names (resolved against the account's real LIST response).
_UNREAD_ALIASES = ("inbox", "sent", "junk", "trash")

_UNSEEN_RE = re.compile(r"\bUNSEEN\s+(\d+)")


# --------------------------------------------------------------------------- #
# Plumbing                                                                    #
# --------------------------------------------------------------------------- #


async def _connect_platform():
    """Open + authenticate an IMAP session on the platform account.

    Returns ``(client, account_email)``. The caller MUST logout in a
    ``finally`` — password redaction happens here, immediately after LOGIN.
    """
    host, port, username, password, account_email = await _platform_imap_config()
    try:
        client = await _connect(host, port, username, password)
    finally:
        password = "REDACTED"  # noqa: F841 — defensive overwrite
        del password
    return client, account_email


async def _resolve_or_400(client, folder: str) -> tuple[str, list[str]]:
    """LIST + alias-resolve ``folder`` (ValueError when it doesn't exist)."""
    folders = await _list_folders(client)
    actual = _resolve_folder(folder, folders)
    if actual is None:
        raise ValueError(
            f"folder '{folder}' not found on the platform account "
            f"(available: {', '.join(folders) if folders else 'none'})"
        )
    return actual, folders


async def _select_read_write(client, actual: str) -> None:
    """SELECT (read-write) — the platform account is ours to mutate."""
    resp = await client.select(actual)
    if resp.result != "OK":
        raise ValueError(f"folder '{actual}' could not be opened ({resp.result})")


def _flags_seen(flags: str | None) -> bool:
    return "\\Seen" in (flags or "")


def _parse_unseen(lines: list[Any]) -> int | None:
    """Extract the UNSEEN count from a STATUS response (None when absent)."""
    for line in lines:
        m = _UNSEEN_RE.search(_line_text(line))
        if m:
            return int(m.group(1))
    return None


# --------------------------------------------------------------------------- #
# Public API — reads                                                          #
# --------------------------------------------------------------------------- #


async def list_folders(session: AsyncSession, *, actor: User | None) -> dict[str, Any]:
    """All folders + unread counts for INBOX/Sent/Junk/Trash (when present).

    STATUS is skipped for aliases the account doesn't have (e.g. no Junk on
    some servers) — they simply don't appear in ``unread``.
    """
    client, _account_email = await _connect_platform()
    try:
        folders = await _list_folders(client)
        unread: dict[str, int] = {}
        for alias in _UNREAD_ALIASES:
            actual = _resolve_folder(alias, folders)
            if actual is None or actual in unread:
                continue
            try:
                resp = await asyncio.wait_for(client.status(actual, "(UNSEEN)"), _IMAP_TIMEOUT)
            except (OSError, aioimaplib.Abort) as exc:
                logger.warning("platform_mail.status_failed folder=%s: %s", actual, exc)
                continue
            if resp.result != "OK":
                continue
            count = _parse_unseen(resp.lines)
            if count is not None:
                unread[actual] = count
    finally:
        with contextlib.suppress(Exception):
            await client.logout()
    return {"folders": folders, "unread": unread}


async def list_messages(
    session: AsyncSession,
    *,
    actor: User | None,
    folder: str = "INBOX",
    limit: int = 50,
) -> dict[str, Any]:
    """Newest-first message summaries for ``folder`` incl. ``seen`` state.

    Same shape as the admin viewer's listing plus ``seen: bool``, parsed from
    the FETCH FLAGS. Read-only (EXAMINE + BODY.PEEK) — marking read happens
    only on full-message opens.
    """
    client, _account_email = await _connect_platform()
    try:
        result = await asyncio.wait_for(
            _list_messages_on(client, folder=folder, limit=limit),
            timeout=_TOTAL_BUDGET,
        )
    except TimeoutError as exc:
        raise TimeoutError("IMAP timeout") from exc
    finally:
        with contextlib.suppress(Exception):
            await client.logout()
    return result


async def _list_messages_on(client, *, folder: str, limit: int) -> dict[str, Any]:
    folders = await _list_folders(client)
    actual = _resolve_folder(folder, folders)
    if actual is None:
        raise ValueError(
            f"folder '{folder}' not found on the platform account "
            f"(available: {', '.join(folders) if folders else 'none'})"
        )
    # select(), NOT examine() — aioimaplib's examine() never flips the client
    # FSM to SELECTED and the following SEARCH aborts ("illegal in state
    # AUTH"). BODY.PEEK in the fetch keeps listing non-marking.
    resp = await client.select(actual)
    if resp.result != "OK":
        raise ValueError(f"folder '{actual}' could not be opened ({resp.result})")
    numbers = await _search_all_numbers(client)
    chosen = [n for n in numbers[-limit:][::-1] if n.isdigit()]
    messages: list[dict[str, Any]] = []
    if chosen:
        fetch = await client.fetch(",".join(chosen), f"(UID FLAGS {_HEADER_PARTS} {_TEXT_PARTS})")
        if fetch.result != "OK":
            raise aioimaplib.Abort(f"FETCH failed: {fetch.result}")
        parsed = _parse_fetch_lines(fetch.lines)
        for seq in chosen:
            entry = parsed.get(int(seq))
            if entry is None or not entry["literals"]:
                continue
            header_msg = email.message_from_bytes(entry["literals"][0])
            text_raw = entry["literals"][1] if len(entry["literals"]) > 1 else b""
            messages.append(
                {
                    "uid": entry["uid"] or str(seq),
                    "from": _decode_header(header_msg.get("From")),
                    "to": _decode_header(header_msg.get("To")),
                    "subject": _decode_header(header_msg.get("Subject")),
                    "date": _decode_header(header_msg.get("Date")),
                    "snippet": _snippet(text_raw),
                    "seen": _flags_seen(entry.get("flags")),
                }
            )
    return {"folder": actual, "folders": folders, "messages": messages}


async def get_message(
    session: AsyncSession,
    *,
    actor: User | None,
    folder: str,
    uid: str,
) -> dict[str, Any]:
    """Fetch one full message by UID — and mark it seen (our account, our mail).

    This is the KEY difference from the read-only viewer: the folder is
    SELECTed read-write and a silent ``+FLAGS (\\Seen)`` STORE follows the
    fetch, so opening platform mail in the admin UI reads like any client.
    Audited as ``platform_mail_read``.
    """
    client, account_email = await _connect_platform()
    try:
        result = await asyncio.wait_for(
            _get_message_on(client, folder=folder, uid=uid),
            timeout=_TOTAL_BUDGET,
        )
    except TimeoutError as exc:
        raise TimeoutError("IMAP timeout") from exc
    finally:
        with contextlib.suppress(Exception):
            await client.logout()

    await _write_audit(
        session,
        actor=actor,
        action="platform_mail_read",
        target_type="platform",
        target_id=None,
        payload={"account_email": account_email, "folder": result["folder"], "uid": uid},
    )
    await session.commit()
    return result


async def _get_message_on(client, *, folder: str, uid: str) -> dict[str, Any]:
    actual, _folders = await _resolve_or_400(client, folder)
    await _select_read_write(client, actual)
    fetch = await client.uid("fetch", str(uid), "(UID FLAGS BODY.PEEK[])")
    if fetch.result != "OK":
        raise aioimaplib.Abort(f"FETCH failed: {fetch.result}")
    parsed = _parse_fetch_lines(fetch.lines)
    body_bytes = b""
    flags: str | None = None
    for entry in parsed.values():
        body_bytes = b"".join(entry["literals"])
        flags = entry.get("flags")
        break
    if not body_bytes:
        raise ValueError(f"message {uid} not found in folder '{actual}'")
    seen_before = _flags_seen(flags)

    store = await client.uid("store", str(uid), "+FLAGS.SILENT", "(\\Seen)")
    if store.result != "OK":
        logger.warning("platform_mail.mark_seen_failed uid=%s folder=%s", uid, actual)

    msg = email.message_from_bytes(body_bytes)
    headers: dict[str, str] = {"message_id": _decode_header(msg.get("Message-ID")) or ""}
    for source_key, out_key in (
        ("X-Warmup-Id", "x_warmup_id"),
        ("In-Reply-To", "in_reply_to"),
        ("References", "references"),
    ):
        value = _decode_header(msg.get(source_key))
        if value:
            headers[out_key] = value
    return {
        "uid": str(uid),
        "folder": actual,
        "from": _decode_header(msg.get("From")),
        "to": _decode_header(msg.get("To")),
        "cc": _decode_header(msg.get("Cc")),
        "subject": _decode_header(msg.get("Subject")),
        "date": _decode_header(msg.get("Date")),
        "text_body": _body_text(msg),
        "headers": headers,
        # State as it was on open — the silent STORE above already marked the
        # mail read for every future listing.
        "seen": seen_before,
    }


# --------------------------------------------------------------------------- #
# Public API — mutations                                                      #
# --------------------------------------------------------------------------- #


async def set_seen(
    session: AsyncSession,
    *,
    actor: User | None,
    folder: str,
    uid: str,
    seen: bool,
) -> None:
    """Set / clear ``\\Seen`` on one message (silent STORE by UID)."""
    client, account_email = await _connect_platform()
    try:
        actual, _folders = await _resolve_or_400(client, folder)
        await _select_read_write(client, actual)
        mode = "+FLAGS.SILENT" if seen else "-FLAGS.SILENT"
        resp = await client.uid("store", str(uid), mode, "(\\Seen)")
        if resp.result != "OK":
            raise aioimaplib.Abort(f"STORE failed: {resp.result}")
    finally:
        with contextlib.suppress(Exception):
            await client.logout()

    await _write_audit(
        session,
        actor=actor,
        action="platform_mail_flag",
        target_type="platform",
        target_id=None,
        payload={"account_email": account_email, "folder": folder, "uid": uid, "seen": seen},
    )
    await session.commit()


async def delete_message(
    session: AsyncSession,
    *,
    actor: User | None,
    folder: str,
    uid: str,
) -> None:
    """Delete one message: COPY to Trash when it exists, then ``\\Deleted`` +
    EXPUNGE. Deleting from Trash itself skips the self-copy.
    """
    client, account_email = await _connect_platform()
    try:
        actual, folders = await _resolve_or_400(client, folder)
        trash = _resolve_folder("trash", folders)
        await _select_read_write(client, actual)
        if trash and trash != actual:
            try:
                resp = await client.uid("copy", str(uid), trash)
                if resp.result != "OK":
                    logger.warning(
                        "platform_mail.copy_to_trash_failed uid=%s trash=%s: %s",
                        uid,
                        trash,
                        resp.result,
                    )
            except Exception as exc:  # noqa: BLE001 — copy is best-effort
                logger.warning("platform_mail.copy_to_trash_failed uid=%s: %s", uid, exc)
        resp = await client.uid("store", str(uid), "+FLAGS.SILENT", "(\\Deleted)")
        if resp.result != "OK":
            raise aioimaplib.Abort(f"STORE failed: {resp.result}")
        resp = await client.expunge()
        if resp.result != "OK":
            raise aioimaplib.Abort(f"EXPUNGE failed: {resp.result}")
    finally:
        with contextlib.suppress(Exception):
            await client.logout()

    await _write_audit(
        session,
        actor=actor,
        action="platform_mail_delete",
        target_type="platform",
        target_id=None,
        payload={"account_email": account_email, "folder": folder, "uid": uid},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Public API — compose / send                                                 #
# --------------------------------------------------------------------------- #


def _build_message(
    *,
    from_addr: str,
    to: str,
    cc: str | None,
    subject: str,
    body_text: str,
    body_html: str | None,
    in_reply_to: str | None,
    references: str | None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject
    msg["Date"] = formatdate()
    msg["Message-ID"] = f"<warmpulse-{uuid.uuid4()}@warmpulse.tech>"
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    return msg


async def _smtp_send(cfg: _SmtpConfig, msg: EmailMessage) -> None:
    """Single-attempt send, mirroring transactional_mail's connect logic.

    STARTTLS when configured, LOGIN with username/password, 15s timeout.
    Any failure is re-raised as ``OSError`` so routes map it to 502.
    """
    try:
        smtp = aiosmtplib.SMTP(hostname=cfg.host, port=cfg.port, timeout=_SMTP_TIMEOUT)
        async with smtp:
            if cfg.starttls:
                try:
                    await smtp.starttls()
                except aiosmtplib.SMTPException as exc:
                    # Some relays present implicit TLS on 587 (wrappermode) —
                    # the socket is ALREADY encrypted, so STARTTLS is refused
                    # with "Connection already using TLS". The connection is
                    # safe to authenticate on as-is.
                    if "already using TLS" not in str(exc):
                        raise
                    logger.info(
                        "platform_mail.starttls_skipped — %s:%s already implicit TLS",
                        cfg.host,
                        cfg.port,
                    )
            if cfg.username:
                await smtp.login(cfg.username, cfg.password)
            await smtp.send_message(msg)
    except (OSError, aiosmtplib.SMTPException) as exc:
        raise OSError(f"{cfg.host}:{cfg.port} — {exc}") from exc


_append_tasks: set[asyncio.Task] = set()


def schedule_sent_append(message_bytes: bytes) -> None:
    """Schedule the Sent-folder APPEND off the request path.

    The API must answer quickly (Cloudflare kills origin responses around
    100s); the IMAP round-trip happens in the background. Failures are
    logged inside the task and never propagate.
    """
    task = asyncio.create_task(_append_to_sent_quiet(message_bytes))
    _append_tasks.add(task)
    task.add_done_callback(_append_tasks.discard)


async def wait_for_appends() -> None:
    """Await all in-flight appends (tests)."""
    while _append_tasks:
        await asyncio.gather(*list(_append_tasks), return_exceptions=True)


async def _append_to_sent_quiet(message_bytes: bytes) -> None:
    try:
        await _append_to_sent(message_bytes)
    except Exception as exc:  # noqa: BLE001 — background, never raises
        logger.warning("platform_mail.sent_append_failed: %s", exc)


async def _append_to_sent(message_bytes: bytes) -> None:
    """Best-effort APPEND of the sent message into the account's Sent folder.

    Never raises: a missing Sent folder or a flaky IMAP must not fail an
    already-delivered send — it's logged and skipped.
    """
    client, _account_email = await _connect_platform()
    try:
        folders = await _list_folders(client)
        sent = _resolve_folder("sent", folders)
        if sent is None:
            logger.info("platform_mail.sent_append_skipped — no Sent folder on account")
            return
        date_time = datetime.now(UTC).strftime("%d-%b-%Y %H:%M:%S +0000")
        resp = await client.append(message_bytes, mailbox=sent, flags="(\\Seen)", date=date_time)
        if resp.result != "OK":
            logger.warning("platform_mail.sent_append_failed: %s", resp.result)
    finally:
        with contextlib.suppress(Exception):
            await client.logout()


async def send_mail(
    session: AsyncSession,
    *,
    actor: User | None,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    cc: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> dict[str, Any]:
    """Send one mail from the platform account and APPEND it to Sent.

    Raises ``ValueError`` (→ 400) when the transactional SMTP settings are
    unconfigured; SMTP/IMAP failures surface as ``OSError`` (→ 502). The
    Sent APPEND is best-effort and never fails the request.
    """
    cfg = await transactional_mail._resolve_smtp_config()
    if not cfg.host or not cfg.username or not cfg.password:
        raise ValueError(
            "platform mail server not configured (Admin → Settings → Transactional SMTP)"
        )
    from_addr = cfg.from_addr or cfg.username
    msg = _build_message(
        from_addr=from_addr,
        to=to,
        cc=cc,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        in_reply_to=in_reply_to,
        references=references,
    )
    message_id = str(msg["Message-ID"])
    # CRLF-terminated RFC822 — required by IMAP APPEND.
    message_bytes = msg.as_bytes(policy=email.policy.SMTP)

    logger.info(
        "platform_mail.send_start host=%s port=%s starttls=%s to=%s",
        cfg.host, cfg.port, cfg.starttls, to,
    )
    try:
        # Hard ceiling: the request MUST answer with real JSON well inside
        # Cloudflare's ~100s origin window — a stalled DNS/connect that
        # per-command timeouts miss still gets cut off here with a 502.
        await asyncio.wait_for(_smtp_send(cfg, msg), timeout=_SEND_DEADLINE_S)
        logger.info("platform_mail.smtp_accepted to=%s message_id=%s", to, message_id)
    except TimeoutError as exc:
        logger.warning("platform_mail.send_deadline host=%s port=%s", cfg.host, cfg.port)
        raise OSError(f"{cfg.host}:{cfg.port} — send deadline exceeded") from exc
    finally:
        cfg.password = "REDACTED"  # noqa: F841 — defensive overwrite
        del cfg

    # Sent-folder copy runs in the background — never on the request path.
    schedule_sent_append(message_bytes)

    await _write_audit(
        session,
        actor=actor,
        action="platform_mail_send",
        target_type="platform",
        target_id=None,
        payload={
            "to": to,
            "cc": cc,
            "subject": subject,
            "message_id": message_id,
            "in_reply_to": in_reply_to,
        },
    )
    await session.commit()
    logger.info("platform_mail.sent to=%s subject=%r message_id=%s", to, subject, message_id)
    return {"status": "sent", "to": to, "message_id": message_id}
