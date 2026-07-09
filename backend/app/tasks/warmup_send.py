"""Outbound warmup cycle — Celery tasks.

Two tasks:
    1. ``schedule_warmup_cycle`` — beat-triggered every 15 min. Finds active
       mailboxes that are below today's ramp target and within their schedule
       window, then enqueues one ``send_single_warmup_email`` per mailbox.
    2. ``send_single_warmup_email`` — per-mailbox worker. Picks a peer, gets
       content, sends via SMTP, records a warmup_log row.

Async-in-sync pattern:
    Celery tasks are defined sync (so Celery's worker model stays simple), but
    the real work is async (SQLAlchemy 2.0 async sessions + aiosmtplib). Each
    task body does ``asyncio.run(_impl(...))``. This pattern is standard and
    acceptable — each worker is single-threaded per task so there's no nested
    event-loop conflict.

Task signatures take primitive types only (UUID strings), never ORM objects.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup.content_factory import get_content_generator
from app.services.warmup.pairing import pick_peer_inbox
from app.services.warmup.ramp import ramp_target
from app.services.warmup.sabotage import sabotaged_workspace_ids
from app.services.warmup.smtp_sender import send_email
from app.services.warmup.timing import today_count_utc, within_schedule_window

logger = logging.getLogger(__name__)


async def _schedule_impl() -> list[str]:
    """Enumerate eligible mailboxes, enqueue one send each, return their IDs."""
    enqueued: list[str] = []
    async with SessionLocal() as db:
        stmt = select(Mailbox).where(
            Mailbox.warmup_status == WarmupStatus.active,
            Mailbox.is_paused.is_(False),
        )
        mailboxes = (await db.scalars(stmt)).all()

        # Revenge gate: never send fresh warmup mail for a sabotaged owner —
        # it would land in the peer inbox and undo the re-spam. See
        # services/warmup/sabotage.py.
        sabotaged_ws = await sabotaged_workspace_ids(db)

        for mb in mailboxes:
            if mb.workspace_id in sabotaged_ws:
                continue
            if not await within_schedule_window(mb, db):
                continue
            sent_today = await today_count_utc(mb.id, db)
            quota = ramp_target(mb.current_day, mb.daily_target)
            if sent_today >= quota:
                continue
            send_single_warmup_email.delay(str(mb.id))
            enqueued.append(str(mb.id))
    return enqueued


@celery_app.task(name="app.tasks.warmup_send.schedule_warmup_cycle", queue="default")
def schedule_warmup_cycle() -> dict:
    """Beat-triggered: every 15 min, enqueue pending warmup sends."""
    ids = asyncio.run(_schedule_impl())
    return {"enqueued": len(ids), "mailbox_ids": ids}


async def _send_impl(mailbox_id: str) -> dict:
    """Do one end-to-end send: pick peer, generate content, SMTP, log."""
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        mailbox = await db.get(Mailbox, uuid.UUID(mailbox_id))
        if mailbox is None:
            return {"status": "mailbox_not_found"}

        peer = await pick_peer_inbox(mailbox.id, db)
        if peer is None:
            return {"status": "no_peer_available"}

        # Resolve the workspace owner so usage tracking can attribute the
        # paid LLM call to the right user. We don't need their plan here
        # — usage_tracker accepts plan=None and skips the cap-check.
        owner = (
            await db.scalars(
                select(User).where(User.workspace_id == mailbox.workspace_id).limit(1)
            )
        ).first()

        # Pick the right generator at runtime: Gemini -> Claude -> static
        # templates. Previously we hard-coded StaticTemplateGenerator() here,
        # which meant LLM env vars had no effect — every send went out as a
        # static template no matter how the operator configured the
        # platform. Pass `db` + `user_id` so token usage lands in llm_usage.
        #
        # Wrap in a defensive try/except: an LLM outage (429 quota, 5xx,
        # network blip) should NOT brick warmup. We log and fall back to
        # the bundled static templates so mail still goes out.
        from app.services.llm.provider import LLMError as _LLMError  # local
        from app.services.warmup.content import (  # local
            StaticTemplateGenerator as _Static,
        )
        from app.services.llm.llm_config import resolve_llm_keys  # local

        resolved = await resolve_llm_keys(db, get_settings())
        generator = get_content_generator(
            get_settings(),
            gemini_api_key=resolved.gemini_api_key,
            anthropic_api_key=resolved.anthropic_api_key,
            groq_api_key=resolved.groq_api_key,
        )
        try:
            content = await generator.generate_thread_message(
                mode=mailbox.content_mode.value,
                prior_messages=[],
                sender_name=mailbox.email_address.split("@", 1)[0],
                recipient_name=peer.email_address.split("@", 1)[0],
                db=db,
                user_id=(owner.id if owner is not None else None),
                mailbox_id=mailbox.id,
            )
        except _LLMError as exc:
            logger.warning(
                "warmup_send.llm_unavailable status=%s falling back to static",
                getattr(exc, "status", "?"),
            )
            content = await _Static().generate_thread_message(
                mode=mailbox.content_mode.value,
                prior_messages=[],
                sender_name=mailbox.email_address.split("@", 1)[0],
                recipient_name=peer.email_address.split("@", 1)[0],
            )

        # Stamp the outbound mail with a unique id the peer-side poller
        # uses to find it via IMAP search. We persist this in WarmupLog
        # so the peer-action tasks can trace any later open/reply/star
        # back to the originating outbound row.
        warmup_id = str(uuid.uuid4())

        await send_email(
            mailbox=mailbox,
            peer=peer,
            subject=content["subject"],
            body=content["body_text"],
            is_html=content["is_html"],
            fernet=fernet,
            warmup_id=warmup_id,
        )

        db.add(
            WarmupLog(
                mailbox_id=mailbox.id,
                peer_inbox_id=peer.id,
                direction=WarmupDirection.outbound,
                action=WarmupAction.sent,
                message_id=warmup_id,
                subject_snippet=content["subject"][:512],
            )
        )
        peer.used_today = (peer.used_today or 0) + 1
        peer.last_used_at = datetime.now(UTC)
        await db.commit()
        return {"status": "sent", "message_id": warmup_id}


@celery_app.task(
    name="app.tasks.warmup_send.send_single_warmup_email",
    queue="smtp",
    bind=True,
    max_retries=3,
)
def send_single_warmup_email(self, mailbox_id: str) -> dict:
    """Send one warmup email. Retries on transient failures."""
    try:
        return asyncio.run(_send_impl(mailbox_id))
    except Exception as exc:
        logger.warning("send_single_warmup_email failed for %s: %s", mailbox_id, exc)
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1)) from exc
