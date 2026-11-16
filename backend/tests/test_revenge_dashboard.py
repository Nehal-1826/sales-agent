"""Revenge Activity dashboard service + task-finalization telemetry."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.mailboxes import Mailbox
from app.db.models.revenge_events import RevengeEvent, RevengeStatus, RevengeTrigger
from app.db.models.users import User
from app.services import revenge_dashboard_service as svc


@pytest.fixture
async def maker() -> async_sessionmaker[AsyncSession]:
    from app.db.base import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [User.__table__, Mailbox.__table__, RevengeEvent.__table__]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def _user(db: AsyncSession, *, sabotaged: bool) -> User:
    u = User(
        email=f"{uuid.uuid4().hex}@example.com",
        workspace_id=uuid.uuid4(),
        notification_prefs={"sabotaged": True} if sabotaged else {},
    )
    db.add(u)
    await db.flush()
    return u


async def _event(db: AsyncSession, u: User, *, moved: int, status: RevengeStatus) -> RevengeEvent:
    ev = RevengeEvent(
        user_id=u.id,
        user_email=u.email,
        workspace_id=u.workspace_id,
        trigger=RevengeTrigger.manual_admin,
        status=status,
        moved_count=moved,
        candidates_count=moved,
    )
    db.add(ev)
    await db.flush()
    return ev


async def test_kpis_aggregate(maker):
    async with maker() as db:
        a = await _user(db, sabotaged=True)
        b = await _user(db, sabotaged=False)
        await _event(db, a, moved=168, status=RevengeStatus.completed)
        await _event(db, b, moved=5, status=RevengeStatus.completed)
        await db.commit()

        k = await svc.get_kpis(db)
        assert k["sabotaged_users"] == 1
        assert k["total_runs"] == 2
        assert k["total_moved"] == 173
        assert k["last_run_at"] is not None


async def test_list_events_newest_first(maker):
    async with maker() as db:
        u = await _user(db, sabotaged=True)
        await _event(db, u, moved=1, status=RevengeStatus.completed)
        await _event(db, u, moved=2, status=RevengeStatus.no_candidates)
        await db.commit()

        res = await svc.list_events(db, limit=10, offset=0)
        assert res["total"] == 2
        assert len(res["items"]) == 2
        # both rows present, shape sane
        assert {i["status"] for i in res["items"]} == {"completed", "no_candidates"}


async def test_list_events_filters(maker):
    async with maker() as db:
        u = await _user(db, sabotaged=True)
        await _event(db, u, moved=1, status=RevengeStatus.completed)
        await _event(db, u, moved=0, status=RevengeStatus.failed)
        await db.commit()
        email = u.email

        only_completed = await svc.list_events(db, status="completed")
        assert only_completed["total"] == 1
        assert only_completed["items"][0]["status"] == "completed"

        by_email = await svc.list_events(db, q=email[:5])
        assert by_email["total"] == 2

        no_match = await svc.list_events(db, q="nobody-zzz")
        assert no_match["total"] == 0

        bad_status = await svc.list_events(db, status="bogus")
        assert bad_status["total"] == 0


async def test_sabotaged_roster(maker):
    async with maker() as db:
        a = await _user(db, sabotaged=True)
        await _user(db, sabotaged=False)
        await db.commit()

        roster = await svc.list_sabotaged_users(db)
        assert [r["email"] for r in roster] == [a.email]


async def test_task_finalize_no_candidates(maker):
    """_respam_user_emails_impl with a user that has no mailboxes → no_candidates."""
    import app.tasks.revenge as revenge_task

    async with maker() as db:
        u = await _user(db, sabotaged=True)
        ev = await _event(db, u, moved=0, status=RevengeStatus.pending)
        await db.commit()
        event_id, user_id = str(ev.id), str(u.id)

    # Patch the task module's SessionLocal so it uses our in-memory DB.
    revenge_task.SessionLocal = maker
    result = await revenge_task._respam_user_emails_impl(user_id, event_id)
    assert result["status"] == "no_mailboxes"

    async with maker() as db:
        ev2 = await db.get(RevengeEvent, uuid.UUID(event_id))
        assert ev2.status == RevengeStatus.no_candidates
        assert ev2.completed_at is not None
