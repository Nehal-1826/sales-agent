"""Timing helpers — random human-like delays + schedule-window checks.

Spec (architecture.html ~ line 463-520): actions are spaced 30 s – 5 min apart
so the outbound pattern reads like a human, not a bot. When a schedule window
is attached to a mailbox, sends only fire during those local-time hours.

Weekday bit layout (matches ``ScheduleWindow.weekday_mask``):
    Mon=bit0 (1), Tue=bit1 (2), Wed=bit2 (4), Thu=bit3 (8),
    Fri=bit4 (16), Sat=bit5 (32), Sun=bit6 (64).
    Default 31 (= 0b0011111) means Mon-Fri.
"""
from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.schedule_windows import ScheduleWindow
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog


def random_human_delay_seconds() -> float:
    """Random 30 s – 5 min delay between consecutive warmup actions."""
    return random.uniform(30.0, 300.0)


def _now_in_tz(tz: ZoneInfo) -> datetime:
    """Seam for tests — patch this to freeze "now" in any zone."""
    return datetime.now(tz)


async def within_schedule_window(mailbox, db: AsyncSession) -> bool:
    """Return True if the mailbox is allowed to send *right now*.

    Mailboxes with no attached window default to True (always-on).
    """
    if not mailbox.schedule_window_id:
        return True

    window = await db.get(ScheduleWindow, mailbox.schedule_window_id)
    if window is None:
        # Orphaned FK — don't block sends on a missing window row.
        return True

    tz = ZoneInfo(window.tz)
    now_local = _now_in_tz(tz)
    weekday_bit = 1 << now_local.weekday()  # Mon=0 -> bit0, ..., Sun=6 -> bit6
    if not (window.weekday_mask & weekday_bit):
        return False
    return window.start_hour <= now_local.hour < window.end_hour


async def today_count_utc(mailbox_id: uuid.UUID, db: AsyncSession) -> int:
    """Count outbound *sent* warmup actions logged for this mailbox today (UTC).

    The ramp compares this to ``ramp_target`` to decide whether to enqueue
    another send. UTC is the right boundary because the beat-scheduled daily
    rollup is also UTC-aligned.
    """
    start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
    stmt = (
        select(func.count())
        .select_from(WarmupLog)
        .where(
            WarmupLog.mailbox_id == mailbox_id,
            WarmupLog.direction == WarmupDirection.outbound,
            WarmupLog.action == WarmupAction.sent,
            WarmupLog.created_at >= start,
        )
    )
    result = await db.scalar(stmt)
    return int(result or 0)
