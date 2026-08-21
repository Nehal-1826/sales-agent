"""Tests for the inbound engagement loop (Round 2).

Covers:
* ``bump_daily_counter`` upsert correctness across opens/replies/spam_rescues
  including the conflict path so two consecutive bumps land on one row.
* ``warmup_receive._poll_impl`` orchestrator dispatching the right per-action
  celery task by sampling the spec's distribution. Mocks IMAP so no network.
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
from app.services.warmup.metrics_upsert import bump_daily_counter

# --------------------------------------------------------------------------- #
# Harness — minimal in-memory SQLite with the tables we touch.                 #
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
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog

    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Mailbox (+ User for the sabotage gate's workspace lookup) are needed
    # by the pause/sabotage gates in _poll_impl.
    tables = [
        t.__table__ for t in (PeerInbox, DailyMetric, WarmupLog, Mailbox, User)
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
    """The orchestrator opens its own SessionLocal — patch every module
    that has imported it so tests share the same in-memory DB."""
    maker, engine = await _setup_db()
    from app.db import session as session_mod
    from app.tasks import warmup_receive as wr_mod

    originals = {
        ("app.db.session", "SessionLocal"): session_mod.SessionLocal,
        ("app.tasks.warmup_receive", "SessionLocal"): wr_mod.SessionLocal,
    }
    session_mod.SessionLocal = maker  # type: ignore[assignment]
    wr_mod.SessionLocal = maker  # type: ignore[assignment]
    try:
        yield (None, maker, engine)
    finally:
        session_mod.SessionLocal = originals[("app.db.session", "SessionLocal")]
        wr_mod.SessionLocal = originals[("app.tasks.warmup_receive", "SessionLocal")]
        await engine.dispose()


# --------------------------------------------------------------------------- #
# bump_daily_counter                                                          #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_bump_daily_counter_inserts_then_updates_same_row(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    _, maker, _ = app_and_maker
    mid = uuid.uuid4()
    async with maker() as db:
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.opened)
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.opened)
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.replied)
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.spam_rescued)
        await db.commit()

        rows = (await db.execute(select(DailyMetric))).scalars().all()
    # Single row — the ON CONFLICT branch fired three times.
    assert len(rows) == 1
    row = rows[0]
    assert row.mailbox_id == mid
    assert row.opens == 2
    assert row.replies == 1
    assert row.spam_rescues == 1
    assert row.emails_sent == 0


@pytest.mark.asyncio
async def test_bump_daily_counter_starred_increments_opens(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """``starred`` is treated as a strong open signal and lands in opens."""
    _, maker, _ = app_and_maker
    mid = uuid.uuid4()
    async with maker() as db:
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.starred)
        await db.commit()
        row = (await db.execute(select(DailyMetric))).scalar_one()
    assert row.opens == 1
    assert row.replies == 0


@pytest.mark.asyncio
async def test_bump_daily_counter_unmapped_action_is_noop(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """``sent`` isn't tracked in daily_metrics — bump should silently noop."""
    _, maker, _ = app_and_maker
    mid = uuid.uuid4()
    async with maker() as db:
        await bump_daily_counter(db, mailbox_id=mid, action=WarmupAction.sent)
        await db.commit()
        rows = (await db.execute(select(DailyMetric))).scalars().all()
    assert rows == []


# --------------------------------------------------------------------------- #
# warmup_receive orchestrator                                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_poll_peer_inbox_dispatches_actions_for_unread_warmup_mail(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """End-to-end smoke: a peer with one Spam and one Inbox unread warmup
    message produces dispatches via the per-action celery tasks (mocked)."""
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.tasks import warmup_receive

    _, maker, _ = app_and_maker

    # Seed a mailbox-side warmup_log + peer + matching outbound logs.
    mailbox_id = uuid.uuid4()

    async with maker() as db:
        # The dispatch loop now gates on the origin mailbox's pause state —
        # seed an active (non-paused) mailbox so actions are dispatched.
        db.add(
            Mailbox(
                id=mailbox_id,
                user_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
                email_address="engage-client@example.com",
                provider=MailboxProvider.smtp,
                warmup_status=WarmupStatus.active,
            )
        )
        peer = PeerInbox(
            email_address="peer-engage@example.com",
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=b"x",
            daily_capacity=50,
            used_today=0,
            reputation_score=0.8,
            is_active=True,
        )
        db.add(peer)
        await db.commit()
        await db.refresh(peer)

        # Two outbound logs the peer can engage with.
        spam_warmup_id = str(uuid.uuid4())
        inbox_warmup_id = str(uuid.uuid4())
        for wid in (spam_warmup_id, inbox_warmup_id):
            db.add(
                WarmupLog(
                    mailbox_id=mailbox_id,
                    peer_inbox_id=peer.id,
                    direction=WarmupDirection.outbound,
                    action=WarmupAction.sent,
                    message_id=wid,
                    subject_snippet=f"Subject {wid[:6]}",
                )
            )
        await db.commit()
        peer_id = str(peer.id)

    spam_msgs = [{"uid": "1", "warmup_id": spam_warmup_id}]
    inbox_msgs = [{"uid": "2", "warmup_id": inbox_warmup_id}]

    pa_mock_open = MagicMock()
    pa_mock_star = MagicMock()
    pa_mock_rescue = MagicMock()
    pa_mock_reply = MagicMock()

    class _Apply:
        def __init__(self, fn):
            self._fn = fn

        def apply_async(self, *, args, countdown=0):
            self._fn(*args)

    fake_pa = type("FakePA", (), {})()
    fake_pa.peer_open_email = _Apply(pa_mock_open)
    fake_pa.peer_star_email = _Apply(pa_mock_star)
    fake_pa.peer_spam_rescue = _Apply(pa_mock_rescue)
    fake_pa.peer_reply_email = _Apply(pa_mock_reply)

    with (
        patch.object(warmup_receive, "_peer_action_tasks", return_value=fake_pa),
        patch(
            "app.services.warmup.imap_watcher.list_unread_warmup_spam",
            new=AsyncMock(return_value=spam_msgs),
        ),
        patch(
            "app.services.warmup.imap_watcher.list_unread_warmup_inbox",
            new=AsyncMock(return_value=inbox_msgs),
        ),
    ):
        result = await warmup_receive._poll_impl(peer_id)

    assert result["status"] == "ok"
    assert result["spam_seen"] == 1
    assert result["inbox_seen"] == 1
    # Each warmup message dispatched at least one peer-action task.
    total_dispatches = (
        pa_mock_open.call_count
        + pa_mock_star.call_count
        + pa_mock_rescue.call_count
        + pa_mock_reply.call_count
    )
    # Every spam message produces 1 dispatch (rescue or open). Every inbox
    # message produces 1 or 2 (open+reply, or open+star, or just one).
    # Two messages → between 2 and 4 dispatches.
    assert 2 <= total_dispatches <= 4


@pytest.mark.asyncio
async def test_poll_peer_inbox_skips_messages_we_didnt_send(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A warmup_id with no matching outbound row must not produce dispatches."""
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.tasks import warmup_receive

    _, maker, _ = app_and_maker
    async with maker() as db:
        peer = PeerInbox(
            email_address="peer-skip@example.com",
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
        peer_id = str(peer.id)

    pa_mock = MagicMock()
    fake_pa = type("FakePA", (), {})()
    for name in (
        "peer_open_email", "peer_star_email", "peer_spam_rescue", "peer_reply_email"
    ):
        setattr(
            fake_pa, name,
            type("X", (), {"apply_async": staticmethod(lambda *, args, countdown=0: pa_mock(args))})(),
        )

    spurious = [{"uid": "9", "warmup_id": str(uuid.uuid4())}]

    with (
        patch.object(warmup_receive, "_peer_action_tasks", return_value=fake_pa),
        patch(
            "app.services.warmup.imap_watcher.list_unread_warmup_spam",
            new=AsyncMock(return_value=spurious),
        ),
        patch(
            "app.services.warmup.imap_watcher.list_unread_warmup_inbox",
            new=AsyncMock(return_value=[]),
        ),
    ):
        result = await warmup_receive._poll_impl(peer_id)

    assert result["status"] == "ok"
    assert pa_mock.call_count == 0
