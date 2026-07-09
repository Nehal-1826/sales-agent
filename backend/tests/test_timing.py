"""Tests for timing helpers."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services.warmup import timing
from app.services.warmup.timing import (
    random_human_delay_seconds,
    today_count_utc,
    within_schedule_window,
)

# ---------------- shared in-memory DB ----------------

@pytest_asyncio.fixture
async def db_session():
    from app.db import models  # noqa: F401
    from app.db.base import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


# ---------------- delay bounds ----------------

def test_random_human_delay_bounds() -> None:
    """500 samples all land in [30, 300] seconds (spec: 30 s – 5 min)."""
    for _ in range(500):
        d = random_human_delay_seconds()
        assert 30.0 <= d <= 300.0


# ---------------- schedule window ----------------

@pytest.mark.asyncio
async def test_within_schedule_window_tz_aware(db_session: AsyncSession) -> None:
    """Mon–Fri 9–18 IST window; simulate various local times."""
    from app.db.models.schedule_windows import ScheduleWindow

    window = ScheduleWindow(
        workspace_id=uuid.uuid4(),
        name="ist-biz-hours",
        tz="Asia/Kolkata",
        weekday_mask=0b0011111,  # Mon-Fri
        start_hour=9,
        end_hour=18,
    )
    db_session.add(window)
    await db_session.flush()
    mailbox = SimpleNamespace(schedule_window_id=window.id)

    ist = ZoneInfo("Asia/Kolkata")

    # Mon 3am IST -> False (outside 9-18 window).
    mon_3am = datetime(2026, 4, 20, 3, 0, tzinfo=ist)  # Apr 20 2026 = Monday
    with patch.object(timing, "_now_in_tz", return_value=mon_3am):
        assert await within_schedule_window(mailbox, db_session) is False

    # Mon 11am IST -> True.
    mon_11am = datetime(2026, 4, 20, 11, 0, tzinfo=ist)
    with patch.object(timing, "_now_in_tz", return_value=mon_11am):
        assert await within_schedule_window(mailbox, db_session) is True

    # Sat 11am IST -> False (weekday_mask excludes Sat/Sun).
    sat_11am = datetime(2026, 4, 25, 11, 0, tzinfo=ist)  # Apr 25 2026 = Saturday
    with patch.object(timing, "_now_in_tz", return_value=sat_11am):
        assert await within_schedule_window(mailbox, db_session) is False


@pytest.mark.asyncio
async def test_within_schedule_window_no_window_returns_true(db_session: AsyncSession) -> None:
    """Mailbox with no attached schedule window is always allowed."""
    mailbox = SimpleNamespace(schedule_window_id=None)
    assert await within_schedule_window(mailbox, db_session) is True


# ---------------- today_count_utc ----------------

@pytest.mark.asyncio
async def test_today_count_utc(db_session: AsyncSession) -> None:
    """Three sends today, two yesterday: returns 3."""
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    mailbox_id = uuid.uuid4()
    peer_id = uuid.uuid4()
    today_start = datetime.combine(
        datetime.now(UTC).date(), datetime.min.time(), tzinfo=UTC
    )
    yesterday_start = today_start - timedelta(days=1)

    # SQLite + BigInteger doesn't autoincrement, so assign ids explicitly.
    counter = {"n": 0}

    def _log(created_at, direction=WarmupDirection.outbound, action=WarmupAction.sent):
        counter["n"] += 1
        row = WarmupLog(
            id=counter["n"],
            mailbox_id=mailbox_id,
            peer_inbox_id=peer_id,
            direction=direction,
            action=action,
            created_at=created_at,
        )
        db_session.add(row)
        return row

    _log(today_start + timedelta(hours=1))
    _log(today_start + timedelta(hours=3))
    _log(today_start + timedelta(hours=5))
    _log(yesterday_start + timedelta(hours=10))
    _log(yesterday_start + timedelta(hours=22))
    _log(today_start + timedelta(hours=2), direction=WarmupDirection.inbound)
    _log(today_start + timedelta(hours=4), action=WarmupAction.opened)
    await db_session.flush()

    count = await today_count_utc(mailbox_id, db_session)
    assert count == 3
