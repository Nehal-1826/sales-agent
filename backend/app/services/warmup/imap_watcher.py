"""aioimaplib wrapper — peer-side inbound actions.

Each helper:
    1. Decrypts the peer's IMAP credentials into a local string.
    2. Opens an ``IMAP4_SSL`` session, selects the right mailbox folder.
    3. Executes a single STORE / MOVE / SEARCH+FETCH operation.
    4. Overwrites the password variable and closes the session.

Wave 4 will add: OAuth2 token refresh for Gmail/Outlook peers, folder-name
auto-detection (Junk vs Spam vs Bulk), and actual message-body parsing. For
now these helpers take an explicit ``message_id`` (RFC 822 Message-ID header
value) and search for it.

Peer credentials are assumed to be stored as JSON-encoded bytes:
    b'{"username": "...", "password": "..."}'
Wave 4 schema review may move this to per-column fields.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import aioimaplib

from app.services.crypto import FernetService
from app.services.warmup import peer_endpoints

logger = logging.getLogger(__name__)


def _decrypt_imap_creds(peer, fernet: FernetService) -> tuple[str, str, str, int]:
    """Return (host, username, password, port). Password is plaintext — handle with care.

    Raises ``ValueError`` with a clear message when the peer was added
    without IMAP credentials at all (the ``imap_creds_encrypted`` column is
    NULL / empty). The watcher's caller catches this and skips the peer
    instead of crashing the polling loop.

    ``host`` / ``port`` come from the stored blob when present, else fall back
    to the provider's standard IMAP endpoint. The fallback is essential:
    blobs written before host/port were persisted carry only username +
    password, and without it ``data["host"]`` raised ``KeyError`` on every
    real peer — silently killing the entire engagement pipeline.
    """
    if not getattr(peer, "imap_creds_encrypted", None):
        raise ValueError(
            f"peer {peer.id} ({getattr(peer, 'email_address', '?')}) has no "
            "IMAP credentials configured — engagement signal will never "
            "accumulate. Add IMAP host / username / app-password via "
            "/admin/peer-inboxes/{id} (PATCH)."
        )
    blob = fernet.decrypt(peer.imap_creds_encrypted)
    data = json.loads(blob.decode())
    default_host, default_port = peer_endpoints.imap_endpoint(getattr(peer, "provider", None))
    return (
        data.get("host") or default_host,
        data["username"],
        data["password"],
        int(data.get("port") or default_port),
    )


def decrypt_smtp_creds(peer, fernet: FernetService) -> tuple[str, str, str, int]:
    """Return (host, username, password, port) for the peer's SMTP server.

    Mirror of :func:`_decrypt_imap_creds` for the peer-reply path — the peer
    is the *sender* of a warmup reply, so it needs its own SMTP endpoint.
    Falls back to the provider's standard SMTP endpoint when the stored blob
    predates host/port persistence.
    """
    if not getattr(peer, "smtp_creds_encrypted", None):
        raise ValueError(
            f"peer {peer.id} ({getattr(peer, 'email_address', '?')}) has no "
            "SMTP credentials configured — the peer cannot send warmup "
            "replies. Add SMTP host / username / app-password via the admin "
            "peer-inbox editor."
        )
    blob = fernet.decrypt(peer.smtp_creds_encrypted)
    data = json.loads(blob.decode())
    default_host, default_port = peer_endpoints.smtp_endpoint(getattr(peer, "provider", None))
    return (
        data.get("host") or default_host,
        data["username"],
        data["password"],
        int(data.get("port") or default_port),
    )


async def _find_uid(client: aioimaplib.IMAP4_SSL, message_id: str) -> str | None:
    """Search the selected folder for the given RFC822 Message-ID, return UID."""
    # HEADER Message-ID <id>  — aioimaplib auto-quotes.
    # Use uid_search (UID SEARCH): aioimaplib's .uid() only permits
    # COPY/FETCH/EXPUNGE/STORE and raises Abort on "search".
    resp = await client.uid_search("HEADER", "Message-ID", message_id)
    if resp.result != "OK":
        return None
    # resp.lines is [b'<uid> <uid> ...', b'...']; we want the first uid.
    for line in resp.lines:
        parts = line.decode().split()
        if parts:
            return str(parts[0])
    return None


async def _find_uid_by_warmup_id(
    client: aioimaplib.IMAP4_SSL, warmup_id: str
) -> str | None:
    """Search the selected folder for a message by its ``X-Warmup-Id`` header.

    The engagement pipeline identifies warmup mail by the ``X-Warmup-Id``
    header we stamp at send time — NOT the RFC822 Message-ID. The peer-side
    open/star/spam-rescue actions are handed that same warmup id, so they
    must search the custom header (``_find_uid`` searches Message-ID and
    would never match, leaving every open/star reporting "not_found").
    """
    resp = await client.uid_search("HEADER", "X-Warmup-Id", warmup_id)
    if resp.result != "OK":
        return None
    for line in resp.lines:
        parts = line.decode().split()
        if parts:
            return str(parts[0])
    return None


async def _open(peer, fernet: FernetService, folder: str = "INBOX") -> aioimaplib.IMAP4_SSL:
    import ssl as _ssl
    host, username, password, port = _decrypt_imap_creds(peer, fernet)
    
    _tls = _ssl.create_default_context()
    _tls.check_hostname = False
    _tls.verify_mode = _ssl.CERT_NONE

    client = aioimaplib.IMAP4_SSL(host=host, port=port, timeout=20, ssl_context=_tls)
    await client.wait_hello_from_server()
    await client.login(username, password)
    # Redact after auth.
    password = "REDACTED"
    del password
    # SELECT a non-existent folder returns NO without raising — the client
    # then stays in AUTH state and any later SEARCH/FETCH dies with
    # "command … illegal in state AUTH". Folder names vary by provider
    # (Gmail uses "[Gmail]/Spam"), so treat a failed SELECT as a missing
    # folder by raising Abort, which every caller already handles as "[]".
    resp = await client.select(folder)
    if resp.result != "OK":
        with contextlib.suppress(Exception):
            await client.logout()
        raise aioimaplib.Abort(f"SELECT {folder} failed: {resp.result}")
    return client


_SPAM_FOLDER_CANDIDATES = (
    "[Gmail]/Spam",
    "Junk",
    "Junk E-mail",
    "Spam",
    "Bulk Mail",
)


async def mark_seen(peer, message_id: str, fernet: FernetService) -> bool:
    # message_id here is the X-Warmup-Id we stamped at send time.
    client = await _open(peer, fernet)
    try:
        uid = await _find_uid_by_warmup_id(client, message_id)
        if not uid:
            return False
        resp = await client.uid("store", uid, "+FLAGS", "(\\Seen)")
        return bool(resp.result == "OK")
    finally:
        await client.logout()


async def mark_flagged(peer, message_id: str, fernet: FernetService) -> bool:
    """Star / flag the message — IMAP \\Flagged."""
    # message_id here is the X-Warmup-Id we stamped at send time.
    client = await _open(peer, fernet)
    try:
        uid = await _find_uid_by_warmup_id(client, message_id)
        if not uid:
            return False
        resp = await client.uid("store", uid, "+FLAGS", "(\\Flagged)")
        return bool(resp.result == "OK")
    finally:
        await client.logout()


async def find_in_spam(
    peer, message_id: str, fernet: FernetService
) -> tuple[str, str] | None:
    """Locate the warmup message in any of the known Spam-folder names.

    Returns ``(folder, uid)`` on first hit, ``None`` if the message is not in
    any of the candidate folders. Used by the spam-rescue action so the caller
    can FLAG + MOVE the message in the right folder context without re-opening
    the IMAP session per helper call.

    The lookup key is the ``X-Warmup-Id`` header we stamp at send time —
    that's what the inbound-engagement dispatcher hands us. (It is NOT the
    RFC822 Message-ID; searching Message-ID never matched, so spam-rescue
    silently found nothing.)
    """
    for folder in _SPAM_FOLDER_CANDIDATES:
        try:
            client = await _open(peer, fernet, folder=folder)
        except aioimaplib.Abort:
            continue
        try:
            uid = await _find_uid_by_warmup_id(client, message_id)
            if uid:
                return (folder, uid)
        finally:
            with contextlib.suppress(Exception):
                await client.logout()
    return None


async def move_to_inbox(peer, message_id: str, fernet: FernetService) -> bool:
    """Spam-rescue: find the message in Junk/Spam and MOVE to INBOX.

    This is the highest-signal peer action — ESPs weight "user pulled it out
    of spam" extremely heavily.
    """
    # Try common junk folder names in order. Stop at the first that hits.
    for folder in ("[Gmail]/Spam", "Junk", "Junk E-mail", "Spam", "Bulk Mail"):
        try:
            client = await _open(peer, fernet, folder=folder)
        except aioimaplib.Abort:
            continue  # folder doesn't exist on this provider
        try:
            uid = await _find_uid_by_warmup_id(client, message_id)
            if not uid:
                continue
            resp = await client.uid("move", uid, "INBOX")
            if resp.result == "OK":
                return True
        except aioimaplib.Abort:
            continue  # folder doesn't exist on this provider
        finally:
            with contextlib.suppress(Exception):
                await client.logout()
    return False


async def move_to_spam(peer, message_id: str, fernet: FernetService) -> bool:
    """Revenge: find the message in INBOX and MOVE to Junk/Spam."""
    client = await _open(peer, fernet, folder="INBOX")
    try:
        uid = await _find_uid_by_warmup_id(client, message_id)
        if not uid:
            return False

        # Try common junk folder names as MOVE targets.
        for folder in _SPAM_FOLDER_CANDIDATES:
            try:
                resp = await client.uid("move", uid, folder)
                if resp.result == "OK":
                    return True
            except (aioimaplib.Abort, Exception):
                continue
        return False
    finally:
        await client.logout()


async def list_unread_warmup_in_folder(
    peer,
    folder: str,
    fernet: FernetService,
    *,
    limit: int = 50,
    max_age_days: int = 7,
) -> list[dict[str, str]]:
    """Return ``[{uid, warmup_id}]`` for UNSEEN messages in ``folder`` that
    carry an ``X-Warmup-Id`` header.

    Used by the inbound engagement orchestrator to find warmup mail to act
    on. Returns ``[]`` when the folder doesn't exist (mostly relevant for
    Spam folders whose names vary by provider).

    ``max_age_days`` filters on the message's IMAP INTERNALDATE: a peer
    mailbox can carry weeks of UNSEEN warmup backlog, and acting on ancient
    mail looks robotic. Messages whose INTERNALDATE can't be parsed are
    kept (fail open — never drop warmup mail over a date quirk).
    """
    try:
        client = await _open(peer, fernet, folder=folder)
    except aioimaplib.Abort:
        return []
    except Exception as exc:  # noqa: BLE001
        logger.debug("imap_open failed peer=%s folder=%s err=%s", peer.id, folder, exc)
        return []
    try:
        # Why not `HEADER X-Warmup-Id ""`? RFC 3501's HEADER search with an
        # empty substring is "match all messages where the field exists",
        # but Gmail/Yahoo/Outlook implementations diverge — Gmail's IMAP
        # in particular returns zero hits, which silently kills the entire
        # engagement pipeline. Search UNSEEN, then filter on the header
        # in app code via the FETCH below.
        # uid_search => UID SEARCH; .uid("search",…) raises Abort in aioimaplib.
        resp = await client.uid_search("UNSEEN")
        if resp.result != "OK":
            return []
        uids: list[str] = []
        for line in resp.lines:
            uids.extend(line.decode().split())
        # Take the NEWEST `limit` uids, not the oldest. UID SEARCH returns
        # ascending uids; a peer mailbox can carry a large UNSEEN backlog,
        # and slicing [:limit] grabs the oldest — so a freshly-delivered
        # warmup message at the tail would never be examined and engagement
        # would silently never fire. Process newest-first instead.
        uids = uids[-limit:]
        if not uids:
            return []

        out: list[dict[str, str]] = []
        cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
        for uid in uids:
            fetch = await client.uid(
                "fetch",
                uid,
                "(BODY.PEEK[HEADER.FIELDS (X-WARMUP-ID)] INTERNALDATE)",
            )
            if fetch.result != "OK":
                continue
            warmup_id: str | None = None
            internal_date: datetime | None = None
            for line in fetch.lines:
                # aioimaplib hands header literals back as bytearray, not
                # bytes. `isinstance(bytearray, bytes)` is False, so the old
                # code fell through to str(line) -> "bytearray(b'X-Warmup-Id:
                # …')", which never matches the prefix below — silently
                # dropping every warmup message. Decode both bytes types.
                text = (
                    line.decode(errors="replace")
                    if isinstance(line, (bytes, bytearray))
                    else str(line)
                )
                lower = text.lower()
                if lower.startswith("x-warmup-id:"):
                    warmup_id = text.split(":", 1)[1].strip()
                elif "internaldate" in lower:
                    m = re.search(r'INTERNALDATE "(.+?)"', text, re.IGNORECASE)
                    if m:
                        with contextlib.suppress(ValueError):
                            internal_date = datetime.strptime(
                                m.group(1), "%d-%b-%Y %H:%M:%S %z"
                            )
            if not warmup_id:
                continue
            if internal_date is not None and internal_date < cutoff:
                continue  # older than the engagement window — ignore
            out.append({"uid": uid, "warmup_id": warmup_id})
        return out
    finally:
        with contextlib.suppress(Exception):
            await client.logout()


async def list_unread_warmup_inbox(peer, fernet: FernetService) -> list[dict[str, str]]:
    return await list_unread_warmup_in_folder(peer, "INBOX", fernet)


async def list_unread_warmup_spam(peer, fernet: FernetService) -> list[dict[str, str]]:
    """Walk the standard Spam folder candidates; return the first that hits."""
    for folder in _SPAM_FOLDER_CANDIDATES:
        rows = await list_unread_warmup_in_folder(peer, folder, fernet)
        if rows:
            return rows
    return []


_PLACEMENT_FOLDER_CANDIDATES: tuple[str, ...] = (
    "INBOX",
    "[Gmail]/Spam",
    "Spam",
    "Junk",
    "Junk E-mail",
    "[Gmail]/Promotions",
    "Promotions",
    "[Gmail]/Updates",
    "[Gmail]/Forums",
    "[Gmail]/Social",
    "Bulk Mail",
)


async def find_message_in_any_folder(
    peer, message_id: str, fernet: FernetService | None = None
) -> tuple[str, int] | None:
    """Search a battery of folders for ``message_id`` and return (folder, uid).

    Used by the Placement Tester poll task to detect which folder a probe
    landed in. Folders that don't exist on the peer's provider are silently
    skipped (SELECT raises NO/BAD). Returns None when no folder had the
    message.
    """
    if fernet is None:
        from app.services.crypto import get_fernet_service

        fernet = get_fernet_service()

    for folder in _PLACEMENT_FOLDER_CANDIDATES:
        try:
            client = await asyncio.wait_for(
                _open(peer, fernet, folder=folder), timeout=5.0
            )
        except (TimeoutError, aioimaplib.Abort):
            continue
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "placement.imap_open_failed peer=%s folder=%s err=%s",
                getattr(peer, "id", "?"),
                folder,
                exc,
            )
            continue
        try:
            uid = await asyncio.wait_for(
                _find_uid(client, message_id), timeout=5.0
            )
            if uid:
                try:
                    return (folder, int(uid))
                except (TypeError, ValueError):
                    return (folder, 0)
        except TimeoutError:
            continue
        finally:
            with contextlib.suppress(Exception):
                await client.logout()
    return None


async def fetch_new_since(
    peer, since: datetime, fernet: FernetService
) -> list[dict[str, Any]]:
    """Return lightweight header summaries of INBOX messages newer than ``since``.

    Each entry: ``{uid, message_id, subject, from, date}``.
    """
    client = await _open(peer, fernet)
    try:
        # IMAP SINCE uses DD-Mon-YYYY.
        date_str = since.strftime("%d-%b-%Y")
        resp = await client.uid_search("SINCE", date_str)
        if resp.result != "OK":
            return []

        uids: list[str] = []
        for line in resp.lines:
            uids.extend(line.decode().split())

        results: list[dict[str, Any]] = []
        for uid in uids:
            fetch = await client.uid(
                "fetch", uid, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM DATE)])"
            )
            if fetch.result != "OK":
                continue
            headers = {"uid": uid, "message_id": None, "subject": None, "from": None, "date": None}
            for line in fetch.lines:
                # bytearray is not bytes — decode both (see list_unread note).
                text = (
                    line.decode(errors="replace")
                    if isinstance(line, (bytes, bytearray))
                    else str(line)
                )
                for field in ("Message-ID", "Subject", "From", "Date"):
                    prefix = f"{field}:"
                    if text.lower().startswith(prefix.lower()):
                        headers[field.lower().replace("-id", "_id")] = text[len(prefix):].strip()
            results.append(headers)
        return results
    finally:
        await client.logout()
