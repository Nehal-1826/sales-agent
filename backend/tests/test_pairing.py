"""Tests for peer-inbox pairing."""
from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services.warmup.pairing import pick_peer_inbox


@pytest_asyncio.fixture
async def db():
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


# ---------------- fixtures ----------------

async def _mk_mailbox(db, workspace_id=None):
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.users import OnboardingStatus, User, UserRole

    user = User(
        email=f"u+{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        role=UserRole.client,
        onboarding_status=OnboardingStatus.signed_up,
    )
    db.add(user)
    await db.flush()
    mb = Mailbox(
        user_id=user.id,
        workspace_id=workspace_id or user.workspace_id,
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


async def _mk_pool(db, name: str, is_default: bool = False):
    from app.db.models.peer_pools import PeerPool

    p = PeerPool(name=name, is_default=is_default)
    db.add(p)
    await db.flush()
    return p


async def _mk_peer(db, pool, *, reputation=0.8, capacity=50, used=0, active=True):
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.peer_pools import PeerPoolMember

    peer = PeerInbox(
        email_address=f"peer+{uuid.uuid4().hex[:10]}@example.com",
        provider=PeerProvider.google_ws,
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


# ---------------- tests ----------------

@pytest.mark.asyncio
async def test_pick_falls_back_to_default_pool_when_unassigned(db: AsyncSession):
    pool = await _mk_pool(db, "default-pool", is_default=True)
    peer = await _mk_peer(db, pool)
    mb = await _mk_mailbox(db)  # no client_pool_assignment

    picked = await pick_peer_inbox(mb.id, db)
    assert picked is not None
    assert picked.id == peer.id


@pytest.mark.asyncio
async def test_pick_excludes_peers_used_in_last_24h(db: AsyncSession):
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    pool = await _mk_pool(db, "pool-24h", is_default=True)
    peer_a = await _mk_peer(db, pool)
    peer_b = await _mk_peer(db, pool)
    mb = await _mk_mailbox(db)

    # Log an outbound send to peer_a 2 hours ago. BigInteger id needs manual
    # value on SQLite (autoincrement doesn't apply).
    log = WarmupLog(
        id=1,
        mailbox_id=mb.id,
        peer_inbox_id=peer_a.id,
        direction=WarmupDirection.outbound,
        action=WarmupAction.sent,
        created_at=datetime.now(UTC) - timedelta(hours=2),
    )
    db.add(log)
    await db.flush()

    picks = set()
    for _ in range(20):
        p = await pick_peer_inbox(mb.id, db)
        picks.add(p.id if p else None)
    assert peer_a.id not in picks
    assert peer_b.id in picks


@pytest.mark.asyncio
async def test_pick_excludes_at_daily_capacity(db: AsyncSession):
    pool = await _mk_pool(db, "pool-cap", is_default=True)
    full = await _mk_peer(db, pool, capacity=10, used=10)
    open_peer = await _mk_peer(db, pool, capacity=10, used=0)
    mb = await _mk_mailbox(db)

    picks = set()
    for _ in range(20):
        p = await pick_peer_inbox(mb.id, db)
        picks.add(p.id if p else None)
    assert full.id not in picks
    assert open_peer.id in picks


@pytest.mark.asyncio
async def test_pick_excludes_inactive(db: AsyncSession):
    pool = await _mk_pool(db, "pool-inactive", is_default=True)
    off = await _mk_peer(db, pool, active=False)
    on = await _mk_peer(db, pool, active=True)
    mb = await _mk_mailbox(db)

    picks = set()
    for _ in range(20):
        p = await pick_peer_inbox(mb.id, db)
        picks.add(p.id if p else None)
    assert off.id not in picks
    assert on.id in picks


@pytest.mark.asyncio
async def test_pick_returns_none_when_pool_empty(db: AsyncSession):
    _ = await _mk_pool(db, "empty", is_default=True)
    mb = await _mk_mailbox(db)
    assert await pick_peer_inbox(mb.id, db) is None


@pytest.mark.asyncio
async def test_pick_weighted_by_reputation(db: AsyncSession):
    """High-reputation peer should be picked far more often than low-rep peer."""
    pool = await _mk_pool(db, "pool-rep", is_default=True)
    hi = await _mk_peer(db, pool, reputation=0.9)
    lo = await _mk_peer(db, pool, reputation=0.1)
    mb = await _mk_mailbox(db)

    counts = Counter()
    for _ in range(1000):
        p = await pick_peer_inbox(mb.id, db)
        if p:
            counts[p.id] += 1

    # Expected ratio ~ 9:1. Assert hi is clearly ahead with generous tolerance.
    hi_count = counts[hi.id]
    lo_count = counts[lo.id]
    assert hi_count + lo_count > 900
    # Allow loose bound — hi should be at least 5x lo.
    assert hi_count > lo_count * 5


@pytest.mark.asyncio
async def test_pick_lru_fallback_when_pool_fully_dedup_exhausted(db: AsyncSession):
    """When every capacity-eligible peer was contacted in the last 24h (pool
    smaller than the daily send volume), pairing must NOT return None — it
    falls back to the least-recently-contacted peer so a small pool keeps
    warming."""
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    pool = await _mk_pool(db, "pool-exhausted", is_default=True)
    peer_old = await _mk_peer(db, pool)   # contacted 20h ago (least recent)
    peer_new = await _mk_peer(db, pool)   # contacted 1h ago (most recent)
    mb = await _mk_mailbox(db)

    db.add(WarmupLog(
        id=1, mailbox_id=mb.id, peer_inbox_id=peer_old.id,
        direction=WarmupDirection.outbound, action=WarmupAction.sent,
        created_at=datetime.now(UTC) - timedelta(hours=20),
    ))
    db.add(WarmupLog(
        id=2, mailbox_id=mb.id, peer_inbox_id=peer_new.id,
        direction=WarmupDirection.outbound, action=WarmupAction.sent,
        created_at=datetime.now(UTC) - timedelta(hours=1),
    ))
    await db.flush()

    # Both peers are within the 24h dedup window, so the old behaviour returned
    # None. Now it returns the least-recently-contacted peer (peer_old).
    picks = {(await pick_peer_inbox(mb.id, db)) and (await pick_peer_inbox(mb.id, db)).id for _ in range(5)}
    p = await pick_peer_inbox(mb.id, db)
    assert p is not None
    assert p.id == peer_old.id
