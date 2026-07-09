"""Daily peer-counter reset task.

Standalone in-memory SQLite harness (mirrors ``test_pro_honesty_tasks``) so we
can point the task's ``SessionLocal`` at a test DB without the full app.
"""
from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
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
async def maker(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    from app.db import models  # noqa: F401 — register all models
    from app.db.base import Base
    from app.db.models.peer_inboxes import PeerInbox

    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=[PeerInbox.__table__])

    m = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    from app.tasks import peer_counter_reset as mod

    monkeypatch.setattr(mod, "SessionLocal", m)
    try:
        yield m
    finally:
        await engine.dispose()


async def _make_peer(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    used_today: int,
    capacity: int = 50,
    is_active: bool = True,
):
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    async with maker() as s:
        p = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            daily_capacity=capacity,
            used_today=used_today,
            is_active=is_active,
        )
        s.add(p)
        await s.commit()
        await s.refresh(p)
        return p.id


async def test_reset_zeroes_saturated_peers(maker):
    """A peer stuck at used_today == capacity is zeroed and re-eligible."""
    from app.db.models.peer_inboxes import PeerInbox
    from app.tasks.peer_counter_reset import _reset_impl

    saturated = await _make_peer(maker, email="sat@example.com", used_today=50, capacity=50)
    partial = await _make_peer(maker, email="part@example.com", used_today=32, capacity=40)

    result = await _reset_impl()

    # Only the two non-zero peers were updated.
    assert result == {"reset": 2}
    async with maker() as s:
        rows = {p.email_address: p.used_today for p in (await s.scalars(select(PeerInbox))).all()}
    assert rows["sat@example.com"] == 0
    assert rows["part@example.com"] == 0


async def test_reset_includes_inactive_peers(maker):
    """Inactive peers are reset too — reactivation shouldn't inherit a stale count."""
    from app.db.models.peer_inboxes import PeerInbox
    from app.tasks.peer_counter_reset import _reset_impl

    await _make_peer(maker, email="off@example.com", used_today=40, is_active=False)

    await _reset_impl()

    async with maker() as s:
        p = (await s.scalars(select(PeerInbox))).one()
    assert p.used_today == 0


async def test_reset_noop_when_all_zero(maker):
    """Nothing to update when every peer is already at 0."""
    from app.tasks.peer_counter_reset import _reset_impl

    await _make_peer(maker, email="fresh@example.com", used_today=0)

    result = await _reset_impl()
    assert result == {"reset": 0}
