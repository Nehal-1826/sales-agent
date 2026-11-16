"""Tests for the dedicated peer-pool enforcement (Agency tier).

Two surfaces under test:

* ``services/warmup/pairing.pick_peer_inbox`` honours the workspace's
  ``ClientPoolAssignment`` and falls back to the default pool (with audit)
  when the dedicated pool is starved.
* ``GET /api/workspace/dedicated-pool`` returns the pool-status projection.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
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


@pytest_asyncio.fixture
async def db_full() -> AsyncIterator[AsyncSession]:
    """Full schema — needed for pairing (mailboxes, peer_inboxes, ...)."""
    from app.db import models  # noqa: F401
    from app.db.base import Base

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    async with maker() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession]]]:
    """FastAPI app + session maker for the dedicated-pool route tests."""
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import create_app

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Builders                                                                     #
# --------------------------------------------------------------------------- #


async def _mk_pool(db, *, name: str, is_default: bool = False):
    from app.db.models.peer_pools import PeerPool

    p = PeerPool(name=name, is_default=is_default)
    db.add(p)
    await db.flush()
    return p


async def _mk_peer(
    db,
    pool,
    *,
    provider=None,
    reputation: float = 0.8,
    capacity: int = 50,
    used: int = 0,
    active: bool = True,
):
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.peer_pools import PeerPoolMember

    peer = PeerInbox(
        email_address=f"peer+{uuid.uuid4().hex[:10]}@example.com",
        provider=provider or PeerProvider.google_ws,
        reputation_score=reputation,
        daily_capacity=capacity,
        used_today=used,
        is_active=active,
    )
    db.add(peer)
    await db.flush()
    db.add(PeerPoolMember(peer_inbox_id=peer.id, pool_id=pool.id))
    await db.flush()
    return peer


async def _mk_mailbox(db, *, workspace_id=None):
    from app.db.models.mailboxes import (
        ContentMode,
        Mailbox,
        MailboxProvider,
        WarmupStatus,
    )
    from app.db.models.users import OnboardingStatus, User, UserRole

    ws = workspace_id or uuid.uuid4()
    user = User(
        email=f"u+{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        role=UserRole.client,
        onboarding_status=OnboardingStatus.signed_up,
        workspace_id=ws,
    )
    db.add(user)
    await db.flush()
    mb = Mailbox(
        user_id=user.id,
        workspace_id=ws,
        email_address=f"m+{uuid.uuid4().hex[:8]}@example.com",
        provider=MailboxProvider.smtp,
        warmup_status=WarmupStatus.active,
        daily_target=50,
        current_day=5,
        content_mode=ContentMode.A,
    )
    db.add(mb)
    await db.flush()
    return mb


async def _assign(db, *, workspace_id, pool_id):
    from app.db.models.client_pool_assignments import ClientPoolAssignment

    db.add(ClientPoolAssignment(workspace_id=workspace_id, pool_id=pool_id))
    await db.flush()


async def _seed_plan(maker, *, name: str) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as s:
        plan = Plan(
            name=name,
            price_cents=0,
            max_mailboxes=10,
            daily_email_cap=100,
            token_cap_per_month=0,
            capabilities={},
            is_active=True,
        )
        s.add(plan)
        await s.commit()
        await s.refresh(plan)
        return plan.id


async def _mk_user(maker, *, email: str, plan_id: uuid.UUID, workspace_id=None):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=workspace_id or uuid.uuid4(),
            plan_id=plan_id,
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


def _auth(user) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    tok = create_access_token(
        subject=str(user.id), role=role, workspace_id=str(user.workspace_id)
    )
    return {"Authorization": f"Bearer {tok}"}


# --------------------------------------------------------------------------- #
# pairing.pick_peer_inbox                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pick_peer_inbox_uses_dedicated_pool_when_assigned(db_full: AsyncSession):
    from app.services.warmup.pairing import pick_peer_inbox

    default_pool = await _mk_pool(db_full, name="default", is_default=True)
    dedicated = await _mk_pool(db_full, name="agency-acme", is_default=False)

    # 2 peers in the default pool (must NOT be picked).
    default_a = await _mk_peer(db_full, default_pool)
    default_b = await _mk_peer(db_full, default_pool)
    # 3 peers in the dedicated pool (one of these must always be picked).
    ded_ids: set[uuid.UUID] = set()
    for _ in range(3):
        p = await _mk_peer(db_full, dedicated)
        ded_ids.add(p.id)

    mb = await _mk_mailbox(db_full)
    await _assign(db_full, workspace_id=mb.workspace_id, pool_id=dedicated.id)

    picks: set[uuid.UUID] = set()
    for _ in range(40):
        picked = await pick_peer_inbox(mb.id, db_full)
        # First pick will record a WarmupLog only via the engine, not here —
        # so we can re-run pick_peer_inbox cleanly. We DO need to keep
        # capturing every pick id.
        assert picked is not None, "dedicated pool has peers; pick must succeed"
        picks.add(picked.id)

    assert picks <= ded_ids, (
        f"LEAK: pick returned a non-dedicated peer. picks={picks} dedicated={ded_ids}"
    )
    assert default_a.id not in picks
    assert default_b.id not in picks


@pytest.mark.asyncio
async def test_pick_peer_inbox_falls_back_to_default_when_no_assignment(
    db_full: AsyncSession,
):
    from app.services.warmup.pairing import pick_peer_inbox

    default_pool = await _mk_pool(db_full, name="default", is_default=True)
    dedicated = await _mk_pool(db_full, name="someone-elses-pool")
    default_peer = await _mk_peer(db_full, default_pool)
    other = await _mk_peer(db_full, dedicated)

    mb = await _mk_mailbox(db_full)  # no assignment

    picks: set[uuid.UUID] = set()
    for _ in range(30):
        picked = await pick_peer_inbox(mb.id, db_full)
        assert picked is not None
        picks.add(picked.id)
    assert picks == {default_peer.id}
    assert other.id not in picks


@pytest.mark.asyncio
async def test_pick_peer_inbox_falls_back_to_default_when_dedicated_pool_empty_and_audits(
    db_full: AsyncSession,
):
    from app.db.models.audit_logs import AuditLog
    from app.services.warmup.pairing import pick_peer_inbox

    default_pool = await _mk_pool(db_full, name="default", is_default=True)
    empty_dedicated = await _mk_pool(db_full, name="empty-agency")
    # No peers in `empty_dedicated`. Default pool has one peer to fall back on.
    safety_peer = await _mk_peer(db_full, default_pool)

    mb = await _mk_mailbox(db_full)
    await _assign(db_full, workspace_id=mb.workspace_id, pool_id=empty_dedicated.id)

    picked = await pick_peer_inbox(mb.id, db_full)
    assert picked is not None, "expected fallback to default pool, not None"
    assert picked.id == safety_peer.id

    # One audit row must have been written.
    rows = (
        await db_full.execute(
            select(AuditLog).where(AuditLog.action == "peer_pool.dedicated_starved")
        )
    ).scalars().all()
    assert len(rows) >= 1, "expected an audit row for the starved dedicated pool"
    payload = rows[0].payload or {}
    assert payload.get("workspace_id") == str(mb.workspace_id)
    assert payload.get("dedicated_pool_id") == str(empty_dedicated.id)


# --------------------------------------------------------------------------- #
# GET /api/workspace/dedicated-pool                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_dedicated_pool_status_endpoint_returns_member_count(app_and_maker):
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.peer_pools import PeerPool, PeerPoolMember

    app, maker = app_and_maker
    agency_plan = await _seed_plan(maker, name="Agency")
    user = await _mk_user(maker, email="ag@example.com", plan_id=agency_plan)

    # Seed a dedicated pool with 3 peers: 2 Gmail + 1 Outlook.
    async with maker() as s:
        pool = PeerPool(name="agency-pool", is_default=False)
        default_pool = PeerPool(name="default", is_default=True)
        s.add_all([pool, default_pool])
        await s.flush()
        peers = [
            PeerInbox(
                email_address=f"g{i}@warmpulse.io",
                provider=PeerProvider.google_ws,
                reputation_score=0.8,
                daily_capacity=50,
                used_today=0,
                is_active=True,
            )
            for i in range(2)
        ] + [
            PeerInbox(
                email_address="o1@warmpulse.io",
                provider=PeerProvider.office365,
                reputation_score=0.8,
                daily_capacity=50,
                used_today=0,
                is_active=True,
            )
        ]
        for p in peers:
            s.add(p)
        await s.flush()
        for p in peers:
            s.add(PeerPoolMember(peer_inbox_id=p.id, pool_id=pool.id))
        s.add(ClientPoolAssignment(workspace_id=user.workspace_id, pool_id=pool.id))
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/dedicated-pool", headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_dedicated"] is True
    assert body["pool_name"] == "agency-pool"
    assert body["member_count"] == 3
    mix = body["provider_mix"]
    assert mix["gmail"] == 2
    assert mix["outlook"] == 1
    assert mix.get("yahoo", 0) == 0


@pytest.mark.asyncio
async def test_dedicated_pool_status_endpoint_402_for_non_agency(app_and_maker):
    app, maker = app_and_maker
    pro_plan = await _seed_plan(maker, name="Pro")
    user = await _mk_user(maker, email="pro@example.com", plan_id=pro_plan)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/dedicated-pool", headers=_auth(user))
    assert r.status_code == 402, r.text
    assert "Agency" in r.json()["detail"]


@pytest.mark.asyncio
async def test_dedicated_pool_status_endpoint_returns_false_when_unassigned(
    app_and_maker,
):
    app, maker = app_and_maker
    plan = await _seed_plan(maker, name="Agency")
    user = await _mk_user(maker, email="ag2@example.com", plan_id=plan)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/dedicated-pool", headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_dedicated"] is False
    assert body["pool_id"] is None
    assert body["member_count"] == 0
