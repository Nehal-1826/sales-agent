"""Tests for the schedule-window enforcement + PATCH endpoint (Round 3).

* ``within_schedule_window`` returns False outside the configured local
  hour range, True inside.
* ``PATCH /api/workspace/mailboxes/{id}/schedule`` creates a fresh window
  on first call, updates it on subsequent calls, validates inputs, and
  echoes back the embedded ``schedule_window`` so the SchedulePanel
  re-renders without a follow-up GET.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _dedupe_metadata_indexes(base: object) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        to_remove = []
        for idx in list(table.indexes):
            if idx.name in seen:
                to_remove.append(idx)
            else:
                seen.add(idx.name)
        for idx in to_remove:
            table.indexes.discard(idx)


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.plans import Plan
    from app.db.models.schedule_windows import ScheduleWindow
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (User, Plan, Mailbox, ScheduleWindow, WarmupLog, AuditLog)
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[
    tuple[object, async_sessionmaker[AsyncSession], object]
]:
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker, engine
    finally:
        await engine.dispose()


async def _make_user_and_mailbox(
    maker: async_sessionmaker[AsyncSession],
) -> tuple[object, uuid.UUID]:
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.users import OnboardingStatus, User, UserRole

    workspace_id = uuid.uuid4()
    async with maker() as db:
        user = User(
            email="owner@example.com",
            hashed_password=None,
            workspace_id=workspace_id,
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        mbx = Mailbox(
            user_id=user.id,
            workspace_id=workspace_id,
            email_address="warm@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=10,
        )
        db.add(mbx)
        await db.commit()
        await db.refresh(mbx)
    return user, mbx.id


def _auth(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return {
        "Authorization": "Bearer "
        + create_access_token(
            subject=str(user.id), role=role, workspace_id=str(user.workspace_id)
        )
    }


# --------------------------------------------------------------------------- #
# within_schedule_window                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_within_schedule_window_blocks_outside_hours(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:

    from app.db.models.schedule_windows import ScheduleWindow
    from app.services.warmup import timing as t

    _, maker, _ = app_and_maker

    workspace_id = uuid.uuid4()
    async with maker() as db:
        win = ScheduleWindow(
            workspace_id=workspace_id,
            name="Mon-Fri 9-17 UTC",
            tz="UTC",
            weekday_mask=31,  # Mon-Fri
            start_hour=9,
            end_hour=17,
        )
        db.add(win)
        await db.commit()
        await db.refresh(win)

        # Plain object (not ORM) carrying schedule_window_id is enough — the
        # helper only reads that one attribute and the linked row.
        class _MboxStub:
            schedule_window_id = win.id

        mbox = _MboxStub()

        # Wednesday at 12:00 UTC → inside the window.
        with patch.object(t, "_now_in_tz", lambda tz: datetime(2026, 4, 29, 12, 0, tzinfo=tz)):
            assert await t.within_schedule_window(mbox, db) is True

        # Wednesday at 22:00 UTC → outside the hour range.
        with patch.object(t, "_now_in_tz", lambda tz: datetime(2026, 4, 29, 22, 0, tzinfo=tz)):
            assert await t.within_schedule_window(mbox, db) is False

        # Saturday at 12:00 UTC → weekday_mask excludes weekend.
        with patch.object(t, "_now_in_tz", lambda tz: datetime(2026, 5, 2, 12, 0, tzinfo=tz)):
            assert await t.within_schedule_window(mbox, db) is False


@pytest.mark.asyncio
async def test_within_schedule_window_no_window_means_always_on(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Mailboxes without an attached window aren't gated — schedule is opt-in."""
    from app.services.warmup import timing as t

    _, maker, _ = app_and_maker

    class _MboxStub:
        schedule_window_id = None

    async with maker() as db:
        assert await t.within_schedule_window(_MboxStub(), db) is True


# --------------------------------------------------------------------------- #
# PATCH /api/workspace/mailboxes/{id}/schedule                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_schedule_patch_creates_then_updates(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, mailbox_id = await _make_user_and_mailbox(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # First PATCH — creates a fresh window.
        resp = await c.patch(
            f"/api/workspace/mailboxes/{mailbox_id}/schedule",
            json={
                "tz": "America/Los_Angeles",
                "weekday_mask": 62,  # Tue-Sat
                "start_hour": 8,
                "end_hour": 18,
            },
            headers=_auth(user),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["schedule_window_id"] is not None
        assert body["schedule_window"] == {
            "tz": "America/Los_Angeles",
            "weekday_mask": 62,
            "start_hour": 8,
            "end_hour": 18,
        }
        first_window_id = body["schedule_window_id"]

        # Second PATCH — updates the existing window in place.
        resp2 = await c.patch(
            f"/api/workspace/mailboxes/{mailbox_id}/schedule",
            json={
                "tz": "Europe/London",
                "weekday_mask": 31,
                "start_hour": 9,
                "end_hour": 17,
            },
            headers=_auth(user),
        )
        assert resp2.status_code == 200, resp2.text
        body2 = resp2.json()
        assert body2["schedule_window_id"] == first_window_id  # same row reused
        assert body2["schedule_window"]["tz"] == "Europe/London"
        assert body2["schedule_window"]["weekday_mask"] == 31


@pytest.mark.asyncio
async def test_schedule_patch_rejects_inverted_hours(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, mailbox_id = await _make_user_and_mailbox(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.patch(
            f"/api/workspace/mailboxes/{mailbox_id}/schedule",
            json={"tz": "UTC", "weekday_mask": 31, "start_hour": 17, "end_hour": 9},
            headers=_auth(user),
        )
    assert resp.status_code == 400
    assert "start_hour" in resp.text


@pytest.mark.asyncio
async def test_schedule_patch_rejects_invalid_timezone(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, mailbox_id = await _make_user_and_mailbox(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.patch(
            f"/api/workspace/mailboxes/{mailbox_id}/schedule",
            json={
                "tz": "Mars/Olympus",
                "weekday_mask": 31,
                "start_hour": 9,
                "end_hour": 17,
            },
            headers=_auth(user),
        )
    assert resp.status_code == 400
    assert "Invalid timezone" in resp.text
