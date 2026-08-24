"""Transactional outbound email — welcome / mailbox / 2FA / billing.

Deliberately separate from the warmup-engine SMTP path:
* warmup mail goes out from each customer's connected mailbox using their
  encrypted SMTP creds (see services/warmup/smtp_sender.py).
* transactional mail goes out from a single platform-controlled address
  (configured by TRANSACTIONAL_SMTP_* env vars).

When ``TRANSACTIONAL_SMTP_HOST`` is empty the service runs in **dry-run
mode** — every call logs the message at INFO and returns success. This
keeps signup / alert flows working on a fresh install with no SMTP creds
yet, and gives operators a clear log line when they're investigating
"why didn't the welcome email arrive".

All HTML rendering lives in ``mail_templates.render`` so every send
shares the WarmPulse brand shell. Per-template functions just supply
the headline / intro / detail rows / CTA, never raw HTML.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from email.message import EmailMessage

import aiosmtplib
from sqlalchemy import select

from app.config import get_settings
from app.services.mail_templates import render

logger = logging.getLogger(__name__)

# Retry policy for transient SMTP failures.
#
# The platform mail server can answer 4xx — most often
# "451 4.3.5 Recipient address rejected: Server configuration problem".
# Postfix emits that for EVERY recipient whenever a policy service listed in
# smtpd_recipient_restrictions is unreachable; on 2026-08-03 the iredapd
# daemon died and every outbound mail was rejected for a day. A 4xx is by
# definition RETRYABLE: a normal mail server would queue and try again.
#
# We previously treated every exception as fatal and returned
# {"status": "failed"}, so a few seconds of database unavailability
# permanently dropped a user's signup, login or 2FA email with no second
# attempt. These retries close that gap without touching the mail server.
#
# Permanent 5xx failures (unknown mailbox, blocked sender) are NOT retried
# — retrying those just delays the inevitable and looks like spam.
_MAX_SEND_ATTEMPTS = 4
_RETRY_BACKOFF_SECONDS = (2.0, 8.0, 20.0)


def _is_transient_smtp_error(exc: BaseException) -> bool:
    """True when ``exc`` looks worth retrying.

    Transient means either an SMTP 4xx response, or a connection-level
    failure (DNS blip, refused socket, timeout) where we never got a verdict
    from the server at all.
    """
    # Per-recipient refusals: aiosmtplib reports these as a dict of
    # {recipient: SMTPResponse}. Retry only if EVERY refusal was a 4xx.
    recipients = getattr(exc, "recipients", None)
    if recipients:
        codes = [
            getattr(r, "code", None)
            for r in (
                recipients.values() if isinstance(recipients, dict) else recipients
            )
        ]
        known = [c for c in codes if isinstance(c, int)]
        return bool(known) and all(400 <= c < 500 for c in known)

    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return 400 <= code < 500

    # No SMTP code at all — connection/timeout territory. Worth another go.
    return isinstance(exc, (asyncio.TimeoutError, ConnectionError, OSError))


@dataclass
class _SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    from_addr: str
    starttls: bool
    source: str  # "admin" | "env" | "" (dry-run)
    # IMAP endpoint for the platform inbox (admin Mail Viewer). Derived from
    # the SMTP host when not explicitly configured: smtp.* → imap.*, else the
    # same host (iRedMail-style servers serve both on one hostname).
    imap_host: str = ""
    imap_port: int = 993


def _derive_imap_host(smtp_host: str) -> str:
    if smtp_host.startswith("smtp."):
        return "imap." + smtp_host[len("smtp.") :]
    return smtp_host


def _imap_endpoint(cfg: dict, settings) -> tuple[str, int]:
    """(imap_host, imap_port) — explicit config wins, else derived."""
    host = str(cfg.get("imap_host") or "") or settings.transactional_imap_host
    port = int(cfg.get("imap_port") or 0) or settings.transactional_imap_port
    smtp_host = str(cfg.get("host") or settings.transactional_smtp_host or "")
    return (host or _derive_imap_host(smtp_host), port or 993)


async def _resolve_smtp_config() -> _SmtpConfig:
    """Admin-panel SMTP settings win; TRANSACTIONAL_SMTP_* env vars are the
    fallback; neither set means dry-run.

    Admin settings live in the ``app_settings`` row keyed
    ``transactional_smtp`` (managed from /admin/settings); the password is
    Fernet-encrypted at rest and decrypted only for the duration of a send.
    """
    settings = get_settings()
    cfg: dict = {}
    try:
        from app.db.models.app_settings import AppSetting
        from app.db.session import SessionLocal

        async with SessionLocal() as session:
            row = (
                await session.execute(
                    select(AppSetting).where(AppSetting.key == "transactional_smtp")
                )
            ).scalar_one_or_none()
            if row is not None:
                cfg = dict(row.value or {})
    except Exception:  # noqa: BLE001 — a config lookup failure must not block mail
        logger.exception("transactional_mail.config_lookup_failed — falling back to env")
        cfg = {}

    if cfg.get("host"):
        password = ""
        if cfg.get("password_encrypted"):
            try:
                from app.services.crypto import get_fernet_service

                password = (
                    get_fernet_service()
                    .decrypt(str(cfg["password_encrypted"]).encode())
                    .decode()
                )
            except Exception:  # noqa: BLE001
                logger.exception("transactional_mail.password_decrypt_failed")
        imap_host, imap_port = _imap_endpoint(cfg, settings)
        return _SmtpConfig(
            host=str(cfg["host"]),
            port=int(cfg.get("port") or 587),
            username=str(cfg.get("username") or ""),
            password=password,
            from_addr=str(cfg.get("from_addr") or settings.transactional_smtp_from),
            starttls=bool(cfg.get("starttls", True)),
            source="admin",
            imap_host=imap_host,
            imap_port=imap_port,
        )
    imap_host, imap_port = _imap_endpoint(cfg, settings)
    return _SmtpConfig(
        host=settings.transactional_smtp_host or "",
        port=settings.transactional_smtp_port,
        username=settings.transactional_smtp_username or "",
        password=settings.transactional_smtp_password or "",
        from_addr=settings.transactional_smtp_from,
        starttls=settings.transactional_smtp_starttls,
        source="env" if settings.transactional_smtp_host else "",
        imap_host=imap_host,
        imap_port=imap_port,
    )


async def send_transactional(
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> dict[str, str]:
    """Deliver one transactional email.

    Returns a small dict like ``{"status": "sent"}`` or ``{"status": "dry_run"}``
    so callers can audit-log the outcome without re-implementing the
    mode-detection logic.
    """
    cfg = await _resolve_smtp_config()
    if not cfg.host:
        logger.info(
            "transactional_mail.dry_run to=%s subject=%r "
            "(no SMTP configured — admin settings or TRANSACTIONAL_SMTP_HOST)",
            to, subject,
        )
        return {"status": "dry_run"}

    # Testing mode: redirect all emails to dvshrdd@gmail.com
    s = get_settings()
    if s.transactional_test_mode:
        original_to = to
        to = "dvshrdd@gmail.com"
        logger.info(
            "transactional_mail.test_mode redirected original_to=%s to=%s subject=%r",
            original_to, to, subject,
        )

    msg = EmailMessage()
    msg["From"] = cfg.from_addr
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        attempt = 0
        while True:
            attempt += 1
            try:
                await aiosmtplib.send(
                    msg,
                    hostname=cfg.host,
                    port=cfg.port,
                    start_tls=cfg.starttls,
                    username=cfg.username or None,
                    password=cfg.password or None,
                    timeout=20,
                )
                break
            except Exception as exc:  # noqa: BLE001
                if attempt >= _MAX_SEND_ATTEMPTS or not _is_transient_smtp_error(exc):
                    raise
                delay = _RETRY_BACKOFF_SECONDS[attempt - 1]
                logger.warning(
                    "transactional_mail.transient_retry attempt=%d/%d in %.0fs "
                    "to=%s subject=%r err=%s",
                    attempt, _MAX_SEND_ATTEMPTS, delay, to, subject, exc,
                )
                await asyncio.sleep(delay)
    except Exception:  # noqa: BLE001 — never let mail failures crash callers
        logger.exception("transactional_mail.failed to=%s subject=%r", to, subject)
        return {"status": "failed"}
    finally:
        cfg.password = "REDACTED"
        del cfg
    logger.info("transactional_mail.sent to=%s subject=%r", to, subject)
    return {"status": "sent"}


async def send_transactional_with_attachment(
    *,
    to: str,
    subject: str,
    body_text: str,
    attachment_filename: str,
    attachment_bytes: bytes,
    attachment_content_type: str = "application/octet-stream",
    body_html: str | None = None,
) -> dict[str, str]:
    """Variant of ``send_transactional`` that attaches a file.

    Mirrors the dry-run behaviour so a fresh install without
    ``TRANSACTIONAL_SMTP_HOST`` ack-logs and returns ``{"status": "dry_run"}``
    instead of failing — the Pro Reports "Email to me" flow uses this and we
    need it to always give the UI a clean confirmation.
    """
    cfg = await _resolve_smtp_config()
    size_kb = max(1, round(len(attachment_bytes) / 1024))
    if not cfg.host:
        logger.info(
            "transactional_mail.dry_run to=%s subject=%r attachment=%s (%dKB)",
            to, subject, attachment_filename, size_kb,
        )
        return {"status": "dry_run"}

    msg = EmailMessage()
    msg["From"] = cfg.from_addr
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    # Parse content type into maintype/subtype for EmailMessage's API.
    base_ct = (attachment_content_type or "application/octet-stream").split(";", 1)[0].strip()
    if "/" in base_ct:
        maintype, subtype = base_ct.split("/", 1)
    else:
        maintype, subtype = "application", "octet-stream"
    msg.add_attachment(
        attachment_bytes,
        maintype=maintype,
        subtype=subtype,
        filename=attachment_filename,
    )

    try:
        await aiosmtplib.send(
            msg,
            hostname=cfg.host,
            port=cfg.port,
            start_tls=cfg.starttls,
            username=cfg.username or None,
            password=cfg.password or None,
            timeout=30,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "transactional_mail.failed to=%s subject=%r attachment=%s",
            to, subject, attachment_filename,
        )
        return {"status": "failed"}
    finally:
        cfg.password = "REDACTED"
        del cfg
    logger.info(
        "transactional_mail.sent to=%s subject=%r attachment=%s (%dKB)",
        to, subject, attachment_filename, size_kb,
    )
    return {"status": "sent"}


# --------------------------------------------------------------------------- #
# Templates                                                                    #
# --------------------------------------------------------------------------- #


async def send_verification_email(*, to: str, verify_url: str) -> dict[str, str]:
    display = to.split("@", 1)[0]
    text, html = render(
        headline=f"Verify your email, {display}.",
        intro=(
            "Thanks for signing up for WarmPulse. Click the button below to "
            "verify your email address and activate your account."
        ),
        detail_rows={
            "Link expires": "24 hours from now.",
            "Didn't sign up?": "You can safely ignore this email.",
        },
        cta_label="Verify email address",
        cta_url=verify_url,
        footer_note="If the button doesn't work, paste this link into your browser: " + verify_url,
    )
    return await send_transactional(
        to=to,
        subject="Verify your WarmPulse email address",
        body_text=text,
        body_html=html,
    )


async def send_welcome(*, to: str, name: str | None = None) -> dict[str, str]:
    display = name or to.split("@", 1)[0]
    text, html = render(
        headline=f"Welcome to WarmPulse, {display}.",
        intro=(
            "Your warmup engine is ready to spin up the moment you connect a "
            "mailbox. Three quick steps and you're live."
        ),
        detail_rows={
            "Step 1": "Connect a mailbox (Gmail, Outlook, or SMTP).",
            "Step 2": "Run the DNS checker — clean SPF / DKIM / DMARC.",
            "Step 3": "Pick a content mode and we start sending today.",
        },
        cta_label="Start onboarding",
        cta_url="https://warmpulse.tech/onboarding",
        footer_note="Reply to this email if anything's unclear — a real human reads it.",
    )
    return await send_transactional(
        to=to,
        subject="Welcome to WarmPulse",
        body_text=text,
        body_html=html,
    )


async def send_mailbox_disconnect_alert(
    *, to: str, mailbox_email: str, reason: str
) -> dict[str, str]:
    text, html = render(
        headline=f"Mailbox {mailbox_email} disconnected.",
        intro=(
            "Warmup mail won't go out from this mailbox until it's reconnected. "
            "If this is unexpected, the most common causes are app-password "
            "rotation, a revoked OAuth grant, or the provider rate-limiting us."
        ),
        detail_rows={
            "Mailbox": mailbox_email,
            "Reason": reason,
        },
        cta_label="Open mailbox settings",
        cta_url="https://warmpulse.tech/app/mailboxes",
    )
    return await send_transactional(
        to=to,
        subject=f"Mailbox disconnected: {mailbox_email}",
        body_text=text,
        body_html=html,
    )


async def send_payment_failed_alert(
    *, to: str, amount_usd: float, plan: str
) -> dict[str, str]:
    text, html = render(
        headline="Your last payment failed.",
        intro=(
            f"We couldn't charge your card for the {plan} plan. Warmup will keep "
            "running for the next 5 days while you sort it out — after that the "
            "engine pauses until billing succeeds."
        ),
        detail_rows={
            "Plan": plan,
            "Amount": f"${amount_usd:.2f}",
        },
        cta_label="Update payment method",
        cta_url="https://warmpulse.tech/app/billing",
        footer_note="If you've already updated your card, ignore this — the next retry will pick it up.",
    )
    return await send_transactional(
        to=to,
        subject="Payment failed — please update your card",
        body_text=text,
        body_html=html,
    )


# --------------------------------------------------------------------------- #
# Generic action notification — keeps user-action emails one-liners            #
# instead of needing a bespoke template per action.                            #
# --------------------------------------------------------------------------- #


async def send_action_notice(
    *, to: str, action: str, summary: str, details: dict[str, str] | None = None,
) -> dict[str, str]:
    """Lightweight templated notification for ad-hoc account events.

    Used for "you did X" confirmations (password changed, 2FA enabled,
    mailbox connected, etc.) where a bespoke template would be overkill.
    The subject is "WarmPulse · {action}" and the body shares the brand
    shell with every other transactional template.

    Caller should keep the action label short ("Password changed",
    "Mailbox connected") and the summary one sentence.
    """
    text, html = render(
        headline=action,
        intro=summary,
        detail_rows=details or {},
        cta_label="Open Activity Log",
        cta_url="https://warmpulse.tech/app/settings#activity",
        footer_note=(
            "If this wasn't you, change your password immediately and check the "
            "Activity Log under Settings → Activity Log."
        ),
    )
    return await send_transactional(
        to=to,
        subject=f"WarmPulse · {action}",
        body_text=text,
        body_html=html,
    )


# --------------------------------------------------------------------------- #
# Billing: renewal reminder + post-payment invoice                            #
# --------------------------------------------------------------------------- #


async def send_payment_reminder(
    *, to: str, plan_name: str, amount_cents: int, due_date: str, auto_pay: bool
) -> dict[str, str]:
    """Renewal reminder, sent ~3 days before ``due_date`` (dummy beta).

    Copy differs for auto-pay (heads-up that we'll charge) vs manual
    (action needed to renew). Dry-run when SMTP is unconfigured.
    """
    amount = f"₹{amount_cents / 100:.0f}"
    if auto_pay:
        intro = (
            f"Your {plan_name} plan renews on {due_date}. We'll automatically "
            f"charge your saved payment method {amount} — no action needed."
        )
        cta_label = "Manage billing"
        footer = "Want to turn off auto-renew? Toggle it under Billing before the renewal date."
    else:
        intro = (
            f"Your {plan_name} plan is up for renewal on {due_date}. Renew before "
            "then to keep your warmup running without interruption."
        )
        cta_label = "Renew now"
        footer = "Turn on auto-renew under Billing so you never have to think about this again."
    text, html = render(
        headline="Your plan renews soon.",
        intro=intro,
        detail_rows={"Plan": plan_name, "Amount": amount, "Renews on": due_date},
        cta_label=cta_label,
        cta_url="https://warmpulse.tech/app/billing",
        footer_note=footer,
    )
    return await send_transactional(
        to=to,
        subject=f"Reminder: your {plan_name} plan renews on {due_date}",
        body_text=text,
        body_html=html,
    )


async def send_invoice_email(
    *,
    to: str,
    item_label: str,
    amount_cents: int,
    invoice_number: str,
    attachment_filename: str,
    attachment_bytes: bytes,
    attachment_content_type: str = "application/pdf",
) -> dict[str, str]:
    """Post-payment invoice with the generated PDF/CSV attached.

    Caller builds the invoice bytes (payments_service.build_invoice_pdf/csv).
    Dry-run when SMTP is unconfigured.
    """
    amount = f"₹{amount_cents / 100:.0f}"
    text, html = render(
        headline="Payment received — thank you.",
        intro=(
            f"We've received your payment for {item_label}. Your invoice "
            f"{invoice_number} is attached."
        ),
        detail_rows={"Item": item_label, "Amount": amount, "Invoice": invoice_number},
        cta_label="View billing",
        cta_url="https://warmpulse.tech/app/billing",
        footer_note="This is a billing confirmation for your records.",
    )
    return await send_transactional_with_attachment(
        to=to,
        subject=f"Your WarmPulse invoice {invoice_number}",
        body_text=text,
        attachment_filename=attachment_filename,
        attachment_bytes=attachment_bytes,
        attachment_content_type=attachment_content_type,
        body_html=html,
    )
