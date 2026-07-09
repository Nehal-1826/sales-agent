"""Tests for the spam-rescue wiring in ``tasks/peer_actions``.

These tests stub out the IMAP layer (``imap_watcher.find_in_spam`` /
``mark_flagged`` / ``move_to_inbox``) so no real network calls happen.
The DB is an in-memory SQLite; the Redis client is patched to an in-memory
fake so we can assert on the auth-fail circuit-breaker key + TTL without
spinning up a real Redis.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.daily_metrics import DailyMetric
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog


# --------------------------------------------------------------------------- #
# Harness — minimal in-memory SQLite with only the tables we touch.            #
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
    from app.db import models  # noqa: F401 — register all models on Base.metadata
    from app.db.base import Base
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.warmup_logs import WarmupLog

    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (PeerInbox, DailyMetric, WarmupLog)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


class _FakeRedis:
    """Just enough of the redis.Redis API for the circuit breaker tests."""

    def __init__(self) -> None:
        self.store: dict[str, tuple[str, int | None]] = {}

    def get(self, key: str):
        entry = self.store.get(key)
        return entry[0] if entry else None

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = (value, ex)


@pytest_asyncio.fixture
async def harness() -> AsyncIterator[tuple[async_sessionmaker[AsyncSession], _FakeRedis]]:
    """Patches SessionLocal + the redis factory in ``peer_actions``."""
    maker, engine = await _setup_db()

    from app.db import session as session_mod
    from app.tasks import peer_actions as pa_mod

    original_session = session_mod.SessionLocal
    original_pa_session = pa_mod.SessionLocal
    session_mod.SessionLocal = maker  # type: ignore[assignment]
    pa_mod.SessionLocal = maker  # type: ignore[assignment]

    fake = _FakeRedis()
    redis_patch = patch.object(pa_mod, "_redis_client_or_none", return_value=fake)
    redis_patch.start()
    try:
        yield (maker, fake)
    finally:
        redis_patch.stop()
        session_mod.SessionLocal = original_session
        pa_mod.SessionLocal = original_pa_session
        await engine.dispose()


async def _seed_peer_and_outbound(
    maker: async_sessionmaker[AsyncSession],
) -> tuple[str, str, uuid.UUID]:
    """Insert a peer + an outbound warmup_log so the rescue path can resolve
    the originating mailbox. Returns (peer_id, message_id, mailbox_id)."""
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    mailbox_id = uuid.uuid4()
    message_id = f"<{uuid.uuid4()}@warmup.test>"

    async with maker() as db:
        peer = PeerInbox(
            email_address="rescue-peer@example.com",
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=b"x",
            daily_capacity=50,
            used_today=0,
            reputation_score=0.5,
            is_active=True,
        )
        db.add(peer)
        await db.commit()
        await db.refresh(peer)

        db.add(
            WarmupLog(
                mailbox_id=mailbox_id,
                peer_inbox_id=peer.id,
                direction=WarmupDirection.outbound,
                action=WarmupAction.sent,
                message_id=message_id,
                subject_snippet="hello",
            )
        )
        await db.commit()
        return str(peer.id), message_id, mailbox_id


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_spam_rescue_moves_message_when_found(
    harness: tuple[async_sessionmaker[AsyncSession], _FakeRedis],
) -> None:
    maker, _fake = harness
    peer_id, message_id, mailbox_id = await _seed_peer_and_outbound(maker)

    from app.tasks import peer_actions

    find_mock = AsyncMock(return_value=("[Gmail]/Spam", "42"))
    flag_mock = AsyncMock(return_value=True)
    move_mock = AsyncMock(return_value=True)
    crypto_mock = MagicMock()

    with (
        patch("app.tasks.peer_actions.imap_watcher.find_in_spam", new=find_mock),
        patch("app.tasks.peer_actions.imap_watcher.mark_flagged", new=flag_mock),
        patch("app.tasks.peer_actions.imap_watcher.move_to_inbox", new=move_mock),
        patch(
            "app.tasks.peer_actions.get_fernet_service",
            return_value=crypto_mock,
        ),
    ):
        result = await peer_actions._peer_spam_rescue_impl(peer_id, message_id)

    assert result == {"status": "rescued"}
    flag_mock.assert_awaited_once()
    move_mock.assert_awaited_once()

    # WarmupLog written with result=ok (i.e. no error: prefix on snippet) +
    # daily_metrics.spam_rescues bumped.
    async with maker() as db:
        rows = (
            await db.execute(
                select(WarmupLog).where(
                    WarmupLog.action == WarmupAction.spam_rescued,
                    WarmupLog.direction == WarmupDirection.inbound,
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].mailbox_id == mailbox_id
        # ok-path leaves subject_snippet None (no error: prefix).
        assert not (rows[0].subject_snippet or "").startswith("error:")

        metrics = (await db.execute(select(DailyMetric))).scalars().all()
        assert len(metrics) == 1
        assert metrics[0].spam_rescues == 1
        assert metrics[0].bounce_count == 0


@pytest.mark.asyncio
async def test_spam_rescue_handles_message_not_found(
    harness: tuple[async_sessionmaker[AsyncSession], _FakeRedis],
) -> None:
    maker, _fake = harness
    peer_id, message_id, mailbox_id = await _seed_peer_and_outbound(maker)

    from app.tasks import peer_actions

    find_mock = AsyncMock(return_value=None)
    flag_mock = AsyncMock(return_value=True)
    move_mock = AsyncMock(return_value=True)

    with (
        patch("app.tasks.peer_actions.imap_watcher.find_in_spam", new=find_mock),
        patch("app.tasks.peer_actions.imap_watcher.mark_flagged", new=flag_mock),
        patch("app.tasks.peer_actions.imap_watcher.move_to_inbox", new=move_mock),
        patch(
            "app.tasks.peer_actions.get_fernet_service",
            return_value=MagicMock(),
        ),
    ):
        result = await peer_actions._peer_spam_rescue_impl(peer_id, message_id)

    assert result == {"status": "error", "error_kind": "not_found"}
    flag_mock.assert_not_awaited()
    move_mock.assert_not_awaited()

    # Error WarmupLog written with the not_found marker on subject_snippet,
    # bounce_count bumped.
    async with maker() as db:
        rows = (
            await db.execute(
                select(WarmupLog).where(
                    WarmupLog.action == WarmupAction.spam_rescued,
                    WarmupLog.direction == WarmupDirection.inbound,
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].mailbox_id == mailbox_id
        assert rows[0].subject_snippet == "error:not_found"

        metric = (await db.execute(select(DailyMetric))).scalar_one()
        assert metric.bounce_count == 1
        assert metric.spam_rescues == 0


@pytest.mark.asyncio
async def test_spam_rescue_handles_imap_auth_failure(
    harness: tuple[async_sessionmaker[AsyncSession], _FakeRedis],
) -> None:
    maker, fake = harness
    peer_id, message_id, _ = await _seed_peer_and_outbound(maker)

    from app.tasks import peer_actions

    class _AuthError(Exception):
        pass

    find_mock = AsyncMock(side_effect=_AuthError("AUTHENTICATIONFAILED bad password"))

    with (
        patch("app.tasks.peer_actions.imap_watcher.find_in_spam", new=find_mock),
        patch(
            "app.tasks.peer_actions.get_fernet_service",
            return_value=MagicMock(),
        ),
    ):
        result = await peer_actions._peer_spam_rescue_impl(peer_id, message_id)

    assert result == {"status": "error", "error_kind": "auth_failure"}

    # Bounce counter bumped on the mailbox.
    async with maker() as db:
        metric = (await db.execute(select(DailyMetric))).scalar_one()
        assert metric.bounce_count == 1

        rows = (await db.execute(select(WarmupLog).where(
            WarmupLog.action == WarmupAction.spam_rescued
        ))).scalars().all()
        assert len(rows) == 1
        assert rows[0].subject_snippet == "error:auth_failure"

    # Redis circuit-breaker key set with 1h TTL.
    key = peer_actions._authfail_key(peer_id)
    assert key in fake.store
    value, ttl = fake.store[key]
    assert value == "1"
    assert ttl == 3600


@pytest.mark.asyncio
async def test_spam_rescue_short_circuits_when_auth_breaker_open(
    harness: tuple[async_sessionmaker[AsyncSession], _FakeRedis],
) -> None:
    """When the auth-fail Redis flag is set, the impl must not call IMAP."""
    maker, fake = harness
    peer_id, message_id, _ = await _seed_peer_and_outbound(maker)
    fake.set(
        f"warmpulse:spam_rescue:authfail:{peer_id}",
        "1",
        ex=3600,
    )

    from app.tasks import peer_actions

    find_mock = AsyncMock(return_value=("[Gmail]/Spam", "1"))
    with (
        patch("app.tasks.peer_actions.imap_watcher.find_in_spam", new=find_mock),
        patch(
            "app.tasks.peer_actions.get_fernet_service",
            return_value=MagicMock(),
        ),
    ):
        result = await peer_actions._peer_spam_rescue_impl(peer_id, message_id)

    assert result == {"status": "skipped_auth_circuit"}
    find_mock.assert_not_awaited()
