"""Daily ramp advance — beat-scheduled at 00:00 UTC.

Every active, non-paused mailbox gets ``current_day += 1``. When
``current_day`` crosses the ramp tail (day 29+) it stays on its daily_target
forever; warmup_status flips to ``completed`` at a configurable threshold
(Wave 4 — the spec doesn't yet define when "graduation" happens).
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


async def _advance_impl() -> dict:
    advanced: list[str] = []
    async with SessionLocal() as db:
        stmt = select(Mailbox).where(
            Mailbox.warmup_status == WarmupStatus.active,
            Mailbox.is_paused.is_(False),
        )
        mailboxes = (await db.scalars(stmt)).all()
        for mb in mailboxes:
            mb.current_day = (mb.current_day or 0) + 1
            advanced.append(str(mb.id))
        await db.commit()
    return {"advanced": len(advanced), "mailbox_ids": advanced}


@celery_app.task(name="app.tasks.ramp_advance.advance_all_mailboxes", queue="default")
def advance_all_mailboxes() -> dict:
    """Midnight UTC: bump every active mailbox's current_day by 1."""
    return asyncio.run(_advance_impl())
