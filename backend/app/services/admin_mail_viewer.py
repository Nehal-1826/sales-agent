r"""Admin Mail Viewer — super_admin IMAP access into any account.

Purpose: support/debug tooling. A super_admin picks a client mailbox or a
peer inbox and lists / reads its recent mail by logging into that account's
IMAP server with the credentials already stored (Fernet-encrypted) in the
DB. Nothing is mutated — folders are opened read-only via ``EXAMINE`` and
bodies fetched with ``BODY.PEEK`` (no ``\Seen`` flags are ever set).

The platform's OWN transactional account is deliberately NOT viewable here —
it has a full mail client instead (``services/platform_mail``: read + mark
seen + compose/reply + delete). This module stays a strictly read-only
inspector for mail we don't own. ``_platform_imap_config`` remains here and
is imported by platform_mail (single source of truth for the account's
credentials).

Credential handling follows the house rules (see ``warmup/smtp_sender``):
plaintext passwords exist only as a local between decrypt and LOGIN, are
re-bound to ``"REDACTED"`` and deleted afterwards, and never reach logs,
audit payloads, or responses.

Every read is audited (``admin_mail_view``) via the SAVEPOINT pattern so an
audit failure can never poison the surrounding transaction.
"""

from __future__ import annotations

import asyncio
import contextlib
import email
import email.header
import json
import logging
import re
import uuid
from typing import Any

import aioimaplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox, MailboxProvider
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.users import User
from app.services.crypto import get_fernet_service
from app.services.warmup import peer_endpoints

logger = logging.getLogger(__name__)

_IMAP_TIMEOUT = 15.0  # per-command (aioimaplib) — connection + each op
_TOTAL_BUDGET = 45.0  # whole listing/read must finish within this

# Providers whose mailboxes authenticate via OAuth (XOAUTH2) — password login
# is impossible, and XOAUTH2 IMAP is not implemented yet.
_OAUTH_PROVIDERS = frozenset({MailboxProvider.gmail.value, MailboxProvider.outlook.value})

_DEFAULT_IMAP_PORT = 993

# Header slice for the listing — everything the viewer list row shows.
_HEADER_PARTS = "BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID)]"
# First 600 bytes of the body — enough for a ≤500-char snippet, small enough
# that one batched FETCH of 50 messages stays a single cheap round trip.
_TEXT_PARTS = "BODY.PEEK[TEXT]<0.600>"

# Folder-name normalization. Servers disagree on Sent/Spam names, so a
# requested alias is resolved against the account's actual LIST response.
_FOLDER_ALIASES: dict[str, tuple[str, ...]] = {
    "inbox": ("INBOX",),
    "sent": (
        "Sent",
        "Sent Items",
        "Sent Messages",
        "Sent Mail",
        "[Gmail]/Sent Mail",
    ),
    "junk": ("Junk", "Junk E-mail", "Spam", "[Gmail]/Spam", "Bulk Mail"),
    "spam": ("Junk", "Junk E-mail", "Spam", "[Gmail]/Spam", "Bulk Mail"),
    "trash": ("Trash", "Deleted Items", "[Gmail]/Trash"),
}


def _provider_value(provider: object) -> str:
    return provider.value if hasattr(provider, "value") else str(provider)


# --------------------------------------------------------------------------- #
# Audit (savepointed best-effort — mirrors mailbox_service._write_audit)      #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    actor: User | None,
    action: str,
    target_type: str,
    target_id: uuid.UUID | None,
    payload: dict[str, Any],
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id if actor is not None else None,
        actor_role=(actor.role.value if hasattr(actor.role, "value") else str(actor.role))
        if actor is not None
        else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover — audit failures never 500
        logger.warning("audit write failed action=%s: %s", action, exc)


# --------------------------------------------------------------------------- #
# Account resolution                                                          #
# --------------------------------------------------------------------------- #


async def _platform_imap_config() -> tuple[str, int, str, str, str]:
    """(imap_host, imap_port, username, password, email) for the platform's
    own transactional mail account, or ValueError when unconfigured.

    Kept here (next to the viewer's other credential resolution) but
    consumed by ``services/platform_mail`` — the platform account's full
    mail system. Reuses transactional_mail's resolver so admin-panel
    settings, env vars and the encrypted password are handled identically
    to sending.
    """
    from app.services import transactional_mail

    cfg = await transactional_mail._resolve_smtp_config()
    if not cfg.host or not cfg.username or not cfg.password:
        raise ValueError(
            "platform mail server not configured (Admin → Settings → Transactional SMTP)"
        )
    email = cfg.from_addr or cfg.username
    # from_addr may carry a display name ("WarmPulse <hello@…>") — strip it.
    if "<" in email and email.endswith(">"):
        email = email[email.rindex("<") + 1 : -1]
    return cfg.imap_host, cfg.imap_port, cfg.username, cfg.password, email


async def list_viewable_accounts(session: AsyncSession) -> list[dict[str, Any]]:
    """Every account a super_admin can inspect: client mailboxes + peers.

    The platform's own transactional inbox is NOT here — it's served by the
    full Platform Mail system (``/api/admin/platform-mail``) since it needs
    read/write, not inspection. Client mailboxes carry ``owner_email`` (the
    earliest-created user of the owning workspace — same owner-resolution
    rule as ``julex_service.get_public_status``). Peers are capped at the
    newest-ish 200 by email order to keep the dropdown sane.
    """
    accounts: list[dict[str, Any]] = []
    owner_email_sq = (
        select(User.email)
        .where(User.workspace_id == Mailbox.workspace_id)
        .order_by(User.created_at.asc())
        .limit(1)
        .scalar_subquery()
        .label("owner_email")
    )
    mailbox_rows = (
        await session.execute(select(Mailbox, owner_email_sq).order_by(Mailbox.email_address.asc()))
    ).all()

    for mbx, owner_email in mailbox_rows:
        provider = _provider_value(mbx.provider)
        accounts.append(
            {
                "source": "mailbox",
                "id": str(mbx.id),
                "email": mbx.email_address,
                "provider": provider,
                # OAuth providers can't do password IMAP at all; password
                # providers additionally need an explicit imap_host.
                "imap_supported": (provider not in _OAUTH_PROVIDERS and bool(mbx.imap_host)),
                "owner_email": owner_email,
            }
        )

    peers = (
        (
            await session.execute(
                select(PeerInbox).order_by(PeerInbox.email_address.asc()).limit(200)
            )
        )
        .scalars()
        .all()
    )
    for peer in peers:
        accounts.append(
            {
                "source": "peer",
                "id": str(peer.id),
                "email": peer.email_address,
                "provider": "peer",
                "imap_supported": bool(peer.imap_creds_encrypted),
                "owner_email": None,
            }
        )
    return accounts


async def _resolve_creds(
    session: AsyncSession, *, source: str, account_id: str | uuid.UUID
) -> tuple[str, int, str, str, str, str, uuid.UUID | None]:
    """Return ``(host, port, username, password, email, target_type, id)``.

    The password is plaintext — it must only live in the caller's frame
    between here and LOGIN (callers re-bind to ``"REDACTED"`` after).

    Raises ``ValueError`` (→ HTTP 400) for every config problem: unknown
    account, OAuth provider, missing imap_host / password / peer creds.
    """
    try:
        account_uuid = (
            account_id if isinstance(account_id, uuid.UUID) else uuid.UUID(str(account_id))
        )
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError(f"invalid account id: {account_id}") from exc

    if source == "peer":
        peer = (
            await session.execute(select(PeerInbox).where(PeerInbox.id == account_uuid))
        ).scalar_one_or_none()
        if peer is None:
            raise ValueError(f"peer inbox {account_id} not found")
        if not peer.imap_creds_encrypted:
            raise ValueError("peer inbox has no IMAP credentials configured")
        data = json.loads(get_fernet_service().decrypt(peer.imap_creds_encrypted).decode())
        default_host, default_port = peer_endpoints.imap_endpoint(peer.provider)
        host = data.get("host") or default_host
        port = int(data.get("port") or default_port)
        username = data["username"]
        password = data["password"]
        return (
            host,
            port,
            username,
            password,
            peer.email_address,
            "peer_inbox",
            peer.id,
        )

    if source == "mailbox":
        mbx = (
            await session.execute(select(Mailbox).where(Mailbox.id == account_uuid))
        ).scalar_one_or_none()
        if mbx is None:
            raise ValueError(f"mailbox {account_id} not found")
        provider = _provider_value(mbx.provider)
        if provider in _OAUTH_PROVIDERS:
            raise ValueError("OAuth mailboxes need XOAUTH2 — not supported yet")
        if not mbx.imap_host:
            raise ValueError(f"mailbox {mbx.email_address} has no imap_host configured")
        if not mbx.smtp_password_encrypted:
            raise ValueError(f"mailbox {mbx.email_address} has no stored password credentials")
        password = get_fernet_service().decrypt(mbx.smtp_password_encrypted).decode("utf-8")
        return (
            mbx.imap_host,
            int(mbx.imap_port or _DEFAULT_IMAP_PORT),
            mbx.smtp_username or mbx.email_address,
            password,
            mbx.email_address,
            "mailbox",
            mbx.id,
        )

    raise ValueError(f"unknown source: {source!r} (expected 'mailbox' or 'peer')")


# --------------------------------------------------------------------------- #
# IMAP plumbing                                                               #
# --------------------------------------------------------------------------- #


async def _connect(host: str, port: int, username: str, password: str):
    """Open + authenticate an IMAP4_SSL session (lax TLS, as imap_watcher)."""
    import ssl as _ssl

    tls = _ssl.create_default_context()
    tls.check_hostname = False
    tls.verify_mode = _ssl.CERT_NONE

    try:
        client = aioimaplib.IMAP4_SSL(host=host, port=port, timeout=_IMAP_TIMEOUT, ssl_context=tls)
        await asyncio.wait_for(client.wait_hello_from_server(), timeout=_IMAP_TIMEOUT)
        await asyncio.wait_for(client.login(username, password), timeout=_IMAP_TIMEOUT)
    except aioimaplib.Abort as exc:
        # Connection-level failure — carry host:port so the 502 detail tells
        # the admin WHICH server was unreachable (no credentials included).
        with contextlib.suppress(Exception):
            await client.logout()
        raise OSError(f"{host}:{port} — {exc}") from exc
    except aioimaplib.Error as exc:
        # The server answered but refused us — LOGIN rejected, TLS mismatch.
        with contextlib.suppress(Exception):
            await client.logout()
        raise ValueError(f"{host}:{port} rejected the login — {exc}") from exc
    except BaseException as exc:
        with contextlib.suppress(Exception):
            await client.logout()
        raise OSError(f"{host}:{port} — {exc.__class__.__name__}: {exc}") from exc
    return client


def _line_text(line: object) -> str:
    """aioimaplib mixes bytes / bytearray / str in ``Response.lines``."""
    if isinstance(line, (bytes, bytearray)):
        return bytes(line).decode(errors="replace")
    return str(line)


async def _list_folders(client) -> list[str]:
    """LIST all folders, returning display names (unquoted)."""
    resp = await client.list('""', "*")
    if resp.result != "OK":
        return []
    names: list[str] = []
    for line in resp.lines:
        text = _line_text(line).strip()
        if not text.startswith("("):
            continue  # tagged / noise lines
        # "(\\HasNoChildren) "/" "INBOX""  or  (...) NIL INBOX
        m = re.search(r'\)\s+(?:"[^"]*"|NIL)\s+(.+)$', text)
        if not m:
            continue
        raw = m.group(1).strip()
        if raw.startswith('"'):
            end = raw.find('"', 1)
            name = raw[1:end] if end > 0 else raw.strip('"')
        else:
            name = raw
        if name:
            names.append(name)
    return names


def _resolve_folder(requested: str, folders: list[str]) -> str | None:
    """Exact (case-insensitive) match first, then common-name aliases."""
    lowered = {f.lower(): f for f in folders}
    key = requested.strip().lower()
    if key in lowered:
        return lowered[key]
    for candidate in _FOLDER_ALIASES.get(key, ()):
        if candidate.lower() in lowered:
            return lowered[candidate.lower()]
    return None


async def _open_folder(client, folder: str) -> tuple[str, list[str]]:
    """LIST + resolve + EXAMINE ``folder`` read-only. Returns (actual, all)."""
    folders = await _list_folders(client)
    actual = _resolve_folder(folder, folders)
    if actual is None:
        raise ValueError(
            f"folder '{folder}' not found on this account "
            f"(available: {', '.join(folders) if folders else 'none'})"
        )
    # select(), NOT examine(): aioimaplib's examine() is a raw command that
    # never transitions the client state machine to SELECTED, so the next
    # SEARCH aborts with "illegal in state AUTH" against real servers.
    # Read-safety is preserved by BODY.PEEK in every fetch — nothing gets
    # marked \Seen. (Same pattern as imap_watcher.)
    resp = await client.select(actual)
    if resp.result != "OK":
        raise ValueError(f"folder '{actual}' could not be opened ({resp.result})")
    return actual, folders


_FETCH_MARKER_RE = re.compile(r"^\*\s+(\d+)\s+FETCH\b", re.IGNORECASE)
# Tagged command status lines ("TAG4 OK FETCH completed") — protocol, not literal.
_TAGGED_STATUS_RE = re.compile(r"^[A-Za-z0-9._+-]+\s+(?:OK|NO|BAD|BYE|PREAUTH)\b")
# Literal size announcements ("BODY[TEXT] {64}") — protocol, not literal.
_LITERAL_ANNOUNCE_RE = re.compile(r"\{\d+\}$")


def _parse_fetch_lines(lines: list[Any]) -> dict[int, dict[str, Any]]:
    """Split a (possibly multi-message) FETCH response per sequence number.

    aioimaplib's ``Response.lines`` mixes types: protocol lines (the untagged
    ``* N FETCH (…`` markers, ``)``, tagged status) arrive as ``bytes`` /
    ``str``, while literal payloads are appended as ``bytearray`` (see
    ``imap_watcher``'s bytearray note). Walk in order and bucket every
    ``bytearray`` literal under the most recent marker.
    """
    out: dict[int, dict[str, Any]] = {}
    current: int | None = None
    for line in lines:
        if isinstance(line, (bytes, bytearray)):
            # bytearray is always a literal. Plain bytes is AMBIGUOUS: some
            # aioimaplib versions / servers deliver literals as bytes, and
            # protocol lines are bytes too. Classify by shape — a protocol
            # line is a FETCH marker, a bare ")", or a tagged status
            # ("TAG OK FETCH completed"); anything else (headers, bodies)
            # is a literal payload.
            stripped = bytes(line).strip()
            text = _line_text(stripped)
            if isinstance(line, bytearray) or not (
                _FETCH_MARKER_RE.match(text)
                or stripped in (b")", b"")
                or _TAGGED_STATUS_RE.match(text)
                or _LITERAL_ANNOUNCE_RE.search(text)
            ):
                if current is not None:
                    out[current]["literals"].append(bytes(line))
                continue
        else:
            text = _line_text(line)
        m = _FETCH_MARKER_RE.match(text.strip())
        if m:
            current = int(m.group(1))
            entry = out.setdefault(current, {"uid": None, "literals": []})
            um = re.search(r"\bUID\s+(\d+)", text)
            if um:
                entry["uid"] = um.group(1)
            # FLAGS (\Seen …) on the same line — only requested by callers
            # that ask for them (platform_mail); absent → key stays unset.
            fm = re.search(r"\bFLAGS\s+\(([^)]*)\)", text)
            if fm:
                entry["flags"] = fm.group(1)
    return out


def _decode_header(value: str | None) -> str | None:
    """RFC2047-decode a header value ("=?utf-8?q?...?=" → readable text)."""
    if not value:
        return None
    chunks: list[str] = []
    try:
        for chunk, charset in email.header.decode_header(value):
            if isinstance(chunk, bytes):
                chunks.append(chunk.decode(charset or "utf-8", errors="replace"))
            else:
                chunks.append(chunk)
    except Exception:  # noqa: BLE001 — a broken header must not 500 the viewer
        return str(value)
    return "".join(chunks)


_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _snippet(raw: bytes, max_chars: int = 500) -> str:
    """Decode a partial body into a one-line snippet (HTML stripped)."""
    text = raw.decode("utf-8", errors="replace")
    if "<" in text and ">" in text:
        text = _HTML_TAG_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def _body_text(msg: email.message.Message) -> str:
    """Full body text — text/plain part preferred, else HTML stripped."""
    plain_part: email.message.Message | None = None
    html_part: email.message.Message | None = None
    for part in msg.walk():
        if part.is_multipart():
            continue
        disposition = str(part.get("Content-Disposition") or "").lower()
        if "attachment" in disposition:
            continue
        ctype = part.get_content_type()
        if ctype == "text/plain" and plain_part is None:
            plain_part = part
        elif ctype == "text/html" and html_part is None:
            html_part = part
    chosen = plain_part or html_part
    if chosen is None:
        return ""
    payload = chosen.get_payload(decode=True)
    if payload is None:
        return ""
    charset = chosen.get_content_charset() or "utf-8"
    try:
        text = payload.decode(charset, errors="replace")
    except LookupError:  # unknown charset name
        text = payload.decode("utf-8", errors="replace")
    if chosen.get_content_type() == "text/html":
        text = _HTML_TAG_RE.sub(" ", text)
    return text.strip()


async def _search_all_numbers(client) -> list[str]:
    """SEARCH ALL → ascending sequence numbers as strings."""
    resp = await client.search("ALL", charset=None)
    if resp.result != "OK":
        raise aioimaplib.Abort(f"SEARCH failed: {resp.result}")
    numbers: list[str] = []
    for line in resp.lines:
        numbers.extend(_line_text(line).split())
    return numbers


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #


async def list_messages(
    session: AsyncSession,
    *,
    actor: User | None,
    source: str,
    account_id: str | uuid.UUID,
    folder: str = "INBOX",
    limit: int = 50,
) -> dict[str, Any]:
    """Newest-first message summaries for ``folder`` of a mailbox/peer.

    ``ValueError`` → caller maps to 400; ``TimeoutError`` / connection /
    aioimaplib errors → 502. The IMAP work runs under a total-budget
    ``wait_for`` so a stalled server can't hang the request.
    """
    host, port, username, password, account_email, target_type, target_id = await _resolve_creds(
        session, source=source, account_id=account_id
    )
    try:
        client = await _connect(host, port, username, password)
    finally:
        password = "REDACTED"  # noqa: F841 — defensive overwrite
        del password

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

    await _write_audit(
        session,
        actor=actor,
        action="admin_mail_view",
        target_type=target_type,
        target_id=target_id,
        payload={"account_email": account_email, "folder": result["folder"]},
    )
    await session.commit()
    return result


async def _list_messages_on(client, *, folder: str, limit: int) -> dict[str, Any]:
    actual, folders = await _open_folder(client, folder)
    numbers = await _search_all_numbers(client)
    # Sequence numbers are ascending; the newest mail has the highest number.
    chosen = [n for n in numbers[-limit:][::-1] if n.isdigit()]
    messages: list[dict[str, Any]] = []
    if chosen:
        fetch = await client.fetch(",".join(chosen), f"(UID {_HEADER_PARTS} {_TEXT_PARTS})")
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
                }
            )
    return {"folder": actual, "folders": folders, "messages": messages}


async def get_message(
    session: AsyncSession,
    *,
    actor: User | None,
    source: str,
    account_id: str | uuid.UUID,
    folder: str,
    uid: str,
) -> dict[str, Any]:
    """Fetch one full message (BODY.PEEK[] — read-only) by UID."""
    host, port, username, password, account_email, target_type, target_id = await _resolve_creds(
        session, source=source, account_id=account_id
    )
    try:
        client = await _connect(host, port, username, password)
    finally:
        password = "REDACTED"  # noqa: F841 — defensive overwrite
        del password

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
        action="admin_mail_view",
        target_type=target_type,
        target_id=target_id,
        payload={"account_email": account_email, "folder": result["folder"], "uid": uid},
    )
    await session.commit()
    return result


async def _get_message_on(client, *, folder: str, uid: str) -> dict[str, Any]:
    actual, _folders = await _open_folder(client, folder)
    fetch = await client.uid("fetch", str(uid), "(BODY.PEEK[])")
    if fetch.result != "OK":
        raise aioimaplib.Abort(f"FETCH failed: {fetch.result}")
    parsed = _parse_fetch_lines(fetch.lines)
    body_bytes = b""
    for entry in parsed.values():
        body_bytes = b"".join(entry["literals"])
        break
    if not body_bytes:
        raise ValueError(f"message {uid} not found in folder '{actual}'")
    msg = email.message_from_bytes(body_bytes)
    headers: dict[str, str] = {"message_id": _decode_header(msg.get("Message-ID")) or ""}
    warmup_id = _decode_header(msg.get("X-Warmup-Id"))
    if warmup_id:
        headers["x_warmup_id"] = warmup_id
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
    }
