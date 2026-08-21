"""Tests for admin user actions — bulk pause/resume of client mailboxes.

Shares the fixture style with ``test_peer_pools`` — an in-memory SQLite
with ``StaticPool`` and only the tables this feature touches.

pytest-asyncio is in auto mode, so no @pytest.mark.asyncio needed.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# Harness                                                                     #
# --------------------------------------------------------------------------- #


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
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, Mailbox, AuditLog)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]:
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


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _make_user(
    maker: async_sessionmaker[AsyncSession],
    *,
    role: str,
    email: str | None = None,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email or f"u-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole(role),
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _seed_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    user: object,
    status: str,
    is_paused: bool = False,
) -> uuid.UUID:
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )

    async with maker() as session:
        mbx = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address=f"mbx-{uuid.uuid4().hex[:8]}@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus(status),
            daily_target=50,
            current_day=1,
            warmth_score=0.0,
            content_mode=ContentMode.A,
            is_paused=is_paused,
        )
        session.add(mbx)
        await session.commit()
        return mbx.id


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


async def _get_mailbox(maker: async_sessionmaker[AsyncSession], mailbox_id: uuid.UUID) -> object:
    from app.db.models.mailboxes import Mailbox

    async with maker() as session:
        mbx = await session.get(Mailbox, mailbox_id)
        assert mbx is not None
        return mbx


def _status_of(mbx: object) -> str:
    return (
        mbx.warmup_status.value if hasattr(mbx.warmup_status, "value") else str(mbx.warmup_status)
    )


# --------------------------------------------------------------------------- #
# Tests                                                                       #
# --------------------------------------------------------------------------- #


async def test_bulk_pause_explicit_ids_skips_super_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Explicit ids pause only client mailboxes; super_admin ids are skipped."""
    from app.db.models.audit_logs import AuditLog

    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    c1 = await _make_user(maker, role="client")
    c2 = await _make_user(maker, role="client")
    admin_mbx = await _seed_mailbox(maker, user=admin, status="active")
    c1_mbx = await _seed_mailbox(maker, user=c1, status="active")
    c2_mbx = await _seed_mailbox(maker, user=c2, status="active")
    # A pending mailbox in a target workspace — bulk pause must leave it
    # untouched (pausing it would destroy its pre-warmup lifecycle status).
    c1_pending_mbx = await _seed_mailbox(maker, user=c1, status="pending")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/users/bulk-pause-mailboxes",
            json={"user_ids": [str(c1.id), str(c2.id), str(admin.id)], "action": "pause"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200
    body = resp.json()
    # Only the two active mailboxes updated — the pending row is out of scope.
    assert body == {
        "users_affected": 2,
        "mailboxes_updated": 2,
        "skipped_super_admin": 1,
    }

    # Client mailboxes paused, admin mailbox untouched.
    for mbx_id in (c1_mbx, c2_mbx):
        mbx = await _get_mailbox(maker, mbx_id)
        assert mbx.is_paused is True
        assert _status_of(mbx) == "paused"
    admin_row = await _get_mailbox(maker, admin_mbx)
    assert admin_row.is_paused is False
    assert _status_of(admin_row) == "active"

    # Pending mailbox survives the bulk pause UNCHANGED.
    pending_row = await _get_mailbox(maker, c1_pending_mbx)
    assert pending_row.is_paused is False
    assert _status_of(pending_row) == "pending"

    # Exactly one audit row for the bulk action.
    async with maker() as session:
        result = await session.execute(
            select(AuditLog).where(AuditLog.action == "admin_bulk_mailbox_pause")
        )
        rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].actor_user_id == admin.id
    assert rows[0].target_type == "mailbox"
    assert rows[0].payload["users_affected"] == 2
    assert rows[0].payload["skipped_super_admin"] == 1


async def test_bulk_pause_empty_ids_targets_all_clients(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Empty user_ids means every client user's mailboxes; admin untouched."""
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    c1 = await _make_user(maker, role="client")
    c2 = await _make_user(maker, role="client")
    admin_mbx = await _seed_mailbox(maker, user=admin, status="active")
    c1_mbx_a = await _seed_mailbox(maker, user=c1, status="active")
    c1_mbx_b = await _seed_mailbox(maker, user=c1, status="active")
    c2_mbx = await _seed_mailbox(maker, user=c2, status="active")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/users/bulk-pause-mailboxes",
            json={"user_ids": [], "action": "pause"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"users_affected": 2, "mailboxes_updated": 3, "skipped_super_admin": 0}

    for mbx_id in (c1_mbx_a, c1_mbx_b, c2_mbx):
        mbx = await _get_mailbox(maker, mbx_id)
        assert mbx.is_paused is True
        assert _status_of(mbx) == "paused"
    admin_row = await _get_mailbox(maker, admin_mbx)
    assert admin_row.is_paused is False
    assert _status_of(admin_row) == "active"


async def test_bulk_resume_never_activates_pending(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Resume flips paused→active but leaves pending (and active) rows alone."""
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    client = await _make_user(maker, role="client")
    paused_mbx = await _seed_mailbox(maker, user=client, status="paused", is_paused=True)
    pending_mbx = await _seed_mailbox(maker, user=client, status="pending", is_paused=False)
    active_mbx = await _seed_mailbox(maker, user=client, status="active", is_paused=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/users/bulk-pause-mailboxes",
            json={"user_ids": [str(client.id)], "action": "resume"},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"users_affected": 1, "mailboxes_updated": 1, "skipped_super_admin": 0}

    resumed = await _get_mailbox(maker, paused_mbx)
    assert resumed.is_paused is False
    assert _status_of(resumed) == "active"
    pending = await _get_mailbox(maker, pending_mbx)
    assert pending.is_paused is False
    assert _status_of(pending) == "pending"
    active = await _get_mailbox(maker, active_mbx)
    assert active.is_paused is False
    assert _status_of(active) == "active"


async def test_bulk_pause_rejects_extra_fields(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Unknown fields are rejected with 422 (extra='forbid')."""
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/users/bulk-pause-mailboxes",
            json={"user_ids": [], "action": "pause", "oops": True},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 422
