"""daily_metrics upsert helper.

The inbound engagement loop produces real-time signals (open / reply /
spam-rescue) that the dashboard's daily counters care about — waiting until
the 00:05 UTC daily-rollup beat task would mean today's column on the
admin dashboard always reads zero.

We use the standard ``INSERT … ON CONFLICT (mailbox_id, date) DO UPDATE``
syntax which both Postgres 9.5+ and SQLite 3.24+ support — that covers
production and the test harness with no dialect branching.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Uuid

from app.db.models.warmup_logs import WarmupAction

# Map a peer-side action to the daily_metrics column it bumps.
_ACTION_COLUMN: dict[WarmupAction, str] = {
    WarmupAction.opened: "opens",
    WarmupAction.replied: "replies",
    WarmupAction.spam_rescued: "spam_rescues",
    WarmupAction.starred: "opens",  # treat star as a strong open signal
    WarmupAction.marked_important: "opens",
}


def _utc_today() -> date:
    return datetime.now(UTC).date()


async def bump_daily_counter(
    db: AsyncSession,
    *,
    mailbox_id: uuid.UUID,
    action: WarmupAction,
    by: int = 1,
    on_date: date | None = None,
) -> None:
    """Increment ``daily_metrics.{column}`` for ``(mailbox_id, on_date)`` by ``by``.

    Inserts a fresh row with the increment if the (mailbox, date) pair doesn't
    exist yet, otherwise atomically adds to the existing column. No-op for
    actions that aren't tracked in daily_metrics (e.g. ``sent`` — the
    outbound rollup handles those via its own column).
    """
    column = _ACTION_COLUMN.get(action)
    if column is None:
        return

    target_date = on_date or _utc_today()

    # Prepare a positional insert with the target column populated and all
    # other counters at zero. ON CONFLICT clauses only the target column.
    # The UUID bindparam is typed explicitly so SQLAlchemy's per-dialect
    # adapter formats it consistently — Postgres stores UUIDs natively,
    # SQLite as CHAR(32) without hyphens. Without this, raw text() would
    # emit ``str(uuid)`` (hyphenated) while the ORM stores no-hyphens, so
    # the conflict target never matches and we'd insert duplicate rows.
    sql = text(
        f"""
        INSERT INTO daily_metrics
            (mailbox_id, date, emails_sent, emails_received, opens, replies,
             spam_rescues, bounce_count, inbox_placement_pct, warmth_score)
        VALUES
            (:mailbox_id, :date,
             :emails_sent, :emails_received, :opens, :replies,
             :spam_rescues, :bounce_count, 0, 0)
        ON CONFLICT (mailbox_id, date) DO UPDATE SET
            {column} = daily_metrics.{column} + EXCLUDED.{column}
        """
    ).bindparams(bindparam("mailbox_id", type_=Uuid()))
    params = {
        "mailbox_id": mailbox_id,
        "date": target_date,
        "emails_sent": 0,
        "emails_received": 0,
        "opens": by if column == "opens" else 0,
        "replies": by if column == "replies" else 0,
        "spam_rescues": by if column == "spam_rescues" else 0,
        "bounce_count": 0,
    }
    await db.execute(sql, params)
