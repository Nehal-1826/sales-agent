"""aiosmtplib wrapper used by the outbound warmup worker.

Retries up to 3 times on transient (4xx) SMTP responses with exponential
backoff. 5xx responses raise immediately so the Celery task surfaces the
failure.

Credential handling:
    SMTP passwords are pulled from ``mailbox.smtp_password_encrypted`` via the
    injected FernetService, bound to a local variable for the length of the
    login call, then overwritten with the literal string ``"REDACTED"`` and
    deleted. The plaintext never reaches logs, repr, or exception strings.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from datetime import UTC, datetime
from email.message import EmailMessage

import aiosmtplib

from app.config import get_settings
from app.services.crypto import FernetService
from app.services.warmup.oauth_token import gmail_api_send, google_access_token

logger = logging.getLogger(__name__)


def _build_message(
    mailbox,
    peer,
    subject: str,
    body: str,
    is_html: bool,
    in_reply_to: str | None,
    references: list[str] | None,
    warmup_id: str | None = None,
    custom_message_id: str | None = None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = mailbox.email_address
    msg["To"] = peer.email_address
    msg["Subject"] = subject
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = " ".join(references)
    if custom_message_id:
        # Override Message-Id directly — used by Placement Tester so IMAP
        # search can find this exact message by header on the peer side.
        msg["Message-Id"] = custom_message_id
    if warmup_id:
        # Custom header so the peer-side IMAP poller can identify and engage
        # with warmup mail (vs the peer's own non-warmup correspondence) in
        # one search rather than full-body inspection. We also override the
        # Message-Id to embed the same id, so peers can trace the action
        # back to the originating outbound row when the search returns a hit.
        msg["X-Warmup-Id"] = warmup_id
        msg["Message-Id"] = f"<warmpulse-{warmup_id}@warmpulse.app>"

    if is_html:
        # Minimal plaintext fallback so receiving clients with HTML disabled
        # don't see an empty body. Strip tags crudely — Wave 4 can do better.
        msg.set_content("(This message is best viewed in an HTML-capable client.)")
        msg.add_alternative(body, subtype="html")
    else:
        msg.set_content(body)
    return msg


async def _deliver(
    msg: EmailMessage,
    *,
    host: str,
    port: int,
    username: str,
    password: str | None = None,
    xoauth2_token: str | None = None,
) -> dict:
    """Open an SMTP session and send ``msg``, with retry + permissive TLS.

    Shared by :func:`send_email` (sender = user mailbox) and
    :func:`send_peer_reply` (sender = peer inbox) so both paths use identical
    connection handling and can never drift apart.

    Permissive TLS context — see ``mailbox_service._permissive_tls_context()``
    for rationale. Encryption stays on; chain/hostname check off so shared mail
    hosts with messy certs (Hostinger, default cPanel) don't block sends; auth
    still genuinely runs. Retries up to 3x on transient 4xx with exponential
    backoff; 5xx raises immediately.

    The plaintext ``password`` is owned by the caller, which scrubs its own copy
    in a ``finally``; it never appears in exception strings (only the server's
    own message does), so refusal/auth errors stay safe to log.
    """
    import ssl as _ssl

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            _tls = _ssl.create_default_context()
            _tls.check_hostname = False
            _tls.verify_mode = _ssl.CERT_NONE
            async with aiosmtplib.SMTP(
                hostname=host,
                port=port,
                use_tls=(port == 465),
                start_tls=(port == 587),
                tls_context=_tls,
                validate_certs=False,
                timeout=20,
            ) as smtp:
                if xoauth2_token is not None:
                    # SASL XOAUTH2: Gmail/Outlook OAuth-connected mailboxes have
                    # no password — authenticate with a Bearer access token.
                    # EHLO + STARTTLS already ran inside the connect (start_tls
                    # for :587), so the session is ready for AUTH.
                    sasl = (
                        f"user={username}\x01"
                        f"auth=Bearer {xoauth2_token}\x01\x01"
                    )
                    tok_b64 = base64.b64encode(sasl.encode()).decode()
                    code, message = await smtp.execute_command(
                        b"AUTH", b"XOAUTH2", tok_b64.encode()
                    )
                    if code == 334:
                        # Gmail emits a 334 base64 error challenge on failure;
                        # reply empty to drive it to the final status code.
                        code, message = await smtp.execute_command(b"")
                    if code != 235:
                        raise aiosmtplib.SMTPAuthenticationError(
                            code,
                            message if isinstance(message, str) else str(message),
                        )
                else:
                    await smtp.login(username, password)
                response = await smtp.send_message(msg)
                return {
                    "message_id": msg["Message-Id"],
                    "sent_at": datetime.now(UTC),
                    "smtp_response": str(response),
                }
        except aiosmtplib.SMTPResponseException as e:
            last_exc = e
            if 400 <= e.code < 500 and attempt < 2:
                await asyncio.sleep(2 ** attempt)
                continue
            raise

    # Should be unreachable — loop always returns or raises.
    if last_exc:
        raise last_exc
    raise RuntimeError("_deliver exited loop without result")


async def send_email(
    mailbox,
    peer,
    subject: str,
    body: str,
    is_html: bool,
    fernet: FernetService,
    *,
    in_reply_to: str | None = None,
    references: list[str] | None = None,
    warmup_id: str | None = None,
    custom_message_id: str | None = None,
) -> dict:
    """Send one warmup email from ``mailbox`` to ``peer``.

    ``warmup_id`` is a UUID-string the caller generates; we tag the message
    with ``X-Warmup-Id: <warmup_id>`` and embed it in the Message-Id. The
    peer-side IMAP poller searches this header to find unread warmup mail
    and dispatch engagement actions (open / star / reply / spam-rescue).

    Returns ``{message_id, sent_at, smtp_response}`` on success. Raises on
    permanent failure (5xx) after all retries exhausted.
    """
    msg = _build_message(
        mailbox, peer, subject, body, is_html, in_reply_to, references,
        warmup_id=warmup_id,
        custom_message_id=custom_message_id,
    )

    # Auth-mode selection:
    #   1. password present       → classic SMTP AUTH LOGIN (unchanged path).
    #   2. oauth token + gmail/outlook → mint an access token, SMTP XOAUTH2.
    #   3. neither                 → no usable credentials.
    if mailbox.smtp_password_encrypted:
        smtp_pw = fernet.decrypt(mailbox.smtp_password_encrypted).decode()
        try:
            return await _deliver(
                msg,
                host=mailbox.smtp_host,
                port=mailbox.smtp_port,
                username=mailbox.smtp_username,
                password=smtp_pw,
            )
        finally:
            # Scrub the plaintext regardless of success / 4xx-retry / 5xx-raise.
            smtp_pw = "REDACTED"  # noqa: F841 — defensive overwrite
            del smtp_pw

    provider = (
        mailbox.provider.value
        if hasattr(mailbox.provider, "value")
        else str(mailbox.provider)
    ) if getattr(mailbox, "provider", None) is not None else ""

    oauth_enc = getattr(mailbox, "oauth_token_encrypted", None)
    # OAuth Gmail sends through the Gmail REST API, not SMTP. The mailbox-connect
    # flow grants ``gmail.send`` (which authorizes the API) but NOT the full
    # ``https://mail.google.com/`` scope that Gmail's SMTP XOAUTH2 requires — so
    # SMTP XOAUTH2 returns 535 BadCredentials. The API path works with the scope
    # we actually have. (OAuth Outlook needs a Microsoft token minter — deferred.)
    if oauth_enc and provider == "gmail":
        refresh_token = fernet.decrypt(oauth_enc).decode()
        access_token = ""
        try:
            access_token = await google_access_token(
                refresh_token, settings=get_settings()
            )
            gmail_id = await gmail_api_send(access_token, msg.as_bytes())
            return {
                "message_id": msg["Message-Id"],
                "sent_at": datetime.now(UTC),
                "smtp_response": f"gmail-api:{gmail_id}",
            }
        finally:
            # Scrub both secrets — refresh token (long-lived) and access token.
            refresh_token = "REDACTED"  # noqa: F841 — defensive overwrite
            access_token = "REDACTED"  # noqa: F841 — defensive overwrite
            del refresh_token
            del access_token

    raise RuntimeError("mailbox has no usable SMTP credentials")


async def send_peer_reply(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    from_addr: str,
    to_addr: str,
    subject: str,
    body: str,
    in_reply_to: str | None = None,
    references: list[str] | None = None,
) -> dict:
    """Send a warmup *reply* from a peer inbox back to a user mailbox.

    Unlike :func:`send_email` (sender = a user mailbox), here the sender is a
    peer, so the SMTP endpoint and credentials are the peer's. Threading the
    reply correctly (``In-Reply-To`` / ``References`` pointing at the original
    outbound Message-Id, ``Subject: Re: …``) is what makes it read as a genuine
    human reply to the receiving provider — the highest-value warmup signal
    after spam-rescue.

    The caller owns the plaintext ``password``; this function scrubs its own
    parameter copy in ``finally``.
    """
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = " ".join(references)
    msg.set_content(body)
    try:
        return await _deliver(
            msg, host=host, port=port, username=username, password=password
        )
    finally:
        password = "REDACTED"  # noqa: F841 — defensive overwrite
        del password
