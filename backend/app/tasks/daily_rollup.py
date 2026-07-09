"""Daily warmup metrics rollup — beat-scheduled at 00:05 UTC.

For each active mailbox, aggregate yesterday's warmup_logs into a row in
``daily_metrics`` (upsert on (mailbox_id, date)), recompute warmth_score from
that row, then write the new score back to the mailbox for dashboard reads.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.celery_app import celery_app
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal
from app.services.warmup.metrics import warmth_score

logger = logging.getLogger(__name__)


def _yesterday_bounds() -> tuple[datetime, datetime]:
    today = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    start = datetime.combine(yesterday, time.min, tzinfo=UTC)
    end = datetime.combine(today, time.min, tzinfo=UTC)
    return start, end


async def _count_action(
    db, mailbox_id, direction: WarmupDirection, action: WarmupAction, start, end
) -> int:
    stmt = select(func.count()).select_from(WarmupLog).where(
        WarmupLog.mailbox_id == mailbox_id,
        WarmupLog.direction == direction,
        WarmupLog.action == action,
        WarmupLog.created_at >= start,
        WarmupLog.created_at < end,
    )
    return int(await db.scalar(stmt) or 0)


async def _rollup_impl() -> dict:
    start, end = _yesterday_bounds()
    rolled: list[str] = []
    async with SessionLocal() as db:
        mailboxes = (await db.scalars(
            select(Mailbox).where(Mailbox.warmup_status == WarmupStatus.active)
        )).all()

        for mb in mailboxes:
            emails_sent = await _count_action(
                db, mb.id, WarmupDirection.outbound, WarmupAction.sent, start, end
            )
            emails_received = await _count_action(
                db, mb.id, WarmupDirection.inbound, WarmupAction.sent, start, end
            )
            opens = await _count_action(
                db, mb.id, WarmupDirection.inbound, WarmupAction.opened, start, end
            )
            replies = await _count_action(
                db, mb.id, WarmupDirection.inbound, WarmupAction.replied, start, end
            )
            spam_rescues = await _count_action(
                db, mb.id, WarmupDirection.inbound, WarmupAction.spam_rescued, start, end
            )
            # Bounces come from placement_tests in Wave 4; default to 0 now.
            bounce_count = 0
            placement_pct = None  # Wave 4: join placement_tests

            score = warmth_score(
                emails_sent=emails_sent,
                opens=opens,
                replies=replies,
                spam_rescues=spam_rescues,
                bounces=bounce_count,
                placement_pct=placement_pct,
            )

            row = {
                "mailbox_id": mb.id,
                "date": start.date(),
                "emails_sent": emails_sent,
                "emails_received": emails_received,
                "opens": opens,
                "replies": replies,
                "spam_rescues": spam_rescues,
                "bounce_count": bounce_count,
                "inbox_placement_pct": placement_pct or 0.0,
                "warmth_score": score,
            }

            # Cross-dialect upsert. Postgres prod, SQLite in tests.
            bind = db.get_bind() if hasattr(db, "get_bind") else None
            dialect = getattr(getattr(bind, "dialect", None), "name", "") if bind else ""
            stmt: Any
            if dialect == "postgresql":
                stmt = pg_insert(DailyMetric).values(**row)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["mailbox_id", "date"],
                    set_={k: v for k, v in row.items() if k not in ("mailbox_id", "date")},
                )
            else:
                stmt = sqlite_insert(DailyMetric).values(**row)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["mailbox_id", "date"],
                    set_={k: v for k, v in row.items() if k not in ("mailbox_id", "date")},
                )
            await db.execute(stmt)

            # Preserve accumulated warmth on a zero-send day. A single quiet day
            # (or an upstream send outage) must NOT reset the column to 0 and
            # erase weeks of reputation — that's what made every mailbox read
            # "warmth 0.00 / At Risk". The daily_metrics row still records the
            # real 0 for the day; only the live warmth_score is held steady.
            if emails_sent > 0:
                mb.warmth_score = score
            rolled.append(str(mb.id))

        await db.commit()
    return {"rolled": len(rolled), "mailbox_ids": rolled}


@celery_app.task(name="app.tasks.daily_rollup.rollup_yesterday", queue="default")
def rollup_yesterday() -> dict:
    """00:05 UTC: aggregate yesterday's warmup_logs + refresh warmth_score."""
    return asyncio.run(_rollup_impl())
