"""Pro Honesty Pass — background task tests (D1 peer health check, D3 purge).

Uses a hand-built in-memory SQLite harness similar to ``test_peer_inboxes`` so
we can monkeypatch the tasks' ``SessionLocal`` to point at the test DB without
spinning up the full FastAPI app.
"""
from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
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
    from app.db import models  # noqa: F401 — register all models
    from app.db.base import Base
    from app.db.models.app_settings import AppSetting
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
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
        for t in (User, Plan, Mailbox, PeerInbox, WarmupLog, AuditLog, AppSetting)
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def maker_and_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    maker, engine = await _setup_db()

    # Point both task modules' SessionLocal at our test maker. They each
    # imported it at module scope so patch both module references.
    from app.tasks import history_purge as hp_mod
    from app.tasks import peer_health_check as phc_mod

    monkeypatch.setattr(phc_mod, "SessionLocal", maker)
    monkeypatch.setattr(hp_mod, "SessionLocal", maker)

    try:
        yield maker
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _make_peer(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str = "peer@example.com",
    is_active: bool = True,
    reputation_score: float = 1.0,
    reputation_score_updated_at: datetime | None = None,
) -> uuid.UUID:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    async with maker() as s:
        p = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            reputation_score=reputation_score,
            reputation_score_updated_at=reputation_score_updated_at,
            is_active=is_active,
        )
        s.add(p)
        await s.commit()
        await s.refresh(p)
        return p.id


async def _make_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    email: str = "mb@example.com",
) -> uuid.UUID:
    from app.db.models.mailboxes import Mailbox, MailboxProvider

    async with maker() as s:
        mb = Mailbox(
            user_id=user_id,
            workspace_id=workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
        )
        s.add(mb)
        await s.commit()
        await s.refresh(mb)
        return mb.id


async def _make_user_with_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    plan_name: str,
    retention_days: int,
    email: str,
    workspace_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Create a plan + user; returns (user_id, workspace_id)."""
    from app.db.models.plans import Plan
    from app.db.models.users import OnboardingStatus, User, UserRole

    ws = workspace_id or uuid.uuid4()
    async with maker() as s:
        # Plans.capabilities is JSON; SQLite stores as TEXT but SA serialises.
        plan = Plan(
            name=plan_name,
            price_cents=0,
            max_mailboxes=10,
            daily_email_cap=100,
            token_cap_per_month=30_000,
            capabilities={"retention_days": retention_days},
            is_active=True,
        )
        s.add(plan)
        await s.commit()
        await s.refresh(plan)

        u = User(
            email=email,
            hashed_password=None,
            plan_id=plan.id,
            workspace_id=ws,
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u.id, ws


async def _add_log(
    maker: async_sessionmaker[AsyncSession],
    *,
    mailbox_id: uuid.UUID,
    peer_id: uuid.UUID,
    direction,
    action,
    age_hours: float = 0.0,
) -> None:
    from app.db.models.warmup_logs import WarmupLog

    async with maker() as s:
        log = WarmupLog(
            mailbox_id=mailbox_id,
            peer_inbox_id=peer_id,
            direction=direction,
            action=action,
        )
        s.add(log)
        await s.commit()
        # Backdate created_at via direct UPDATE (server default is now()).
        if age_hours > 0:
            from sqlalchemy import update

            new_ts = datetime.now(UTC) - timedelta(hours=age_hours)
            await s.execute(
                update(WarmupLog).where(WarmupLog.id == log.id).values(created_at=new_ts)
            )
            await s.commit()


# --------------------------------------------------------------------------- #
# Tests — peer_health_check                                                   #
# --------------------------------------------------------------------------- #


async def test_peer_health_check_recomputes_score(
    maker_and_engine: async_sessionmaker[AsyncSession],
) -> None:
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection
    from app.tasks.peer_health_check import _impl

    maker = maker_and_engine
    # Peer with a healthy mix — calibration sentinel is recent (1h ago) so
    # it's NOT yet eligible for deactivation regardless of score.
    sentinel = datetime.now(UTC) - timedelta(hours=1)
    peer_id = await _make_peer(
        maker, reputation_score_updated_at=sentinel
    )
    user_id, ws_id = await _make_user_with_plan(
        maker,
        plan_name="Starter-rec",
        retention_days=7,
        email="rec@example.com",
    )
    mailbox_id = await _make_mailbox(
        maker, workspace_id=ws_id, user_id=user_id
    )

    # 10 outbound sends + 6 inbound engagement (opened) → score ≈ 0.6.
    for _ in range(10):
        await _add_log(
            maker,
            mailbox_id=mailbox_id,
            peer_id=peer_id,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=2.0,
        )
    for _ in range(6):
        await _add_log(
            maker,
            mailbox_id=mailbox_id,
            peer_id=peer_id,
            direction=WarmupDirection.inbound,
            action=WarmupAction.opened,
            age_hours=2.0,
        )

    result = await _impl()

    async with maker() as s:
        peer = await s.get(PeerInbox, peer_id)
        assert peer is not None
        # signal=6, bounce=10-6=4, total=10, score=0.6
        assert peer.reputation_score == pytest.approx(0.6, abs=1e-6)
        assert peer.is_active is True
    assert str(peer_id) in result["updated"]


async def test_peer_health_check_deactivates_below_threshold(
    maker_and_engine: async_sessionmaker[AsyncSession],
) -> None:
    from app.db.models.audit_logs import AuditLog
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection
    from app.tasks.peer_health_check import _impl

    maker = maker_and_engine
    # Sentinel 7 h ago → past the 6 h calibration window.
    sentinel = datetime.now(UTC) - timedelta(hours=7)
    peer_id = await _make_peer(
        maker, email="bad@example.com", reputation_score_updated_at=sentinel
    )
    user_id, ws_id = await _make_user_with_plan(
        maker,
        plan_name="Starter-bad",
        retention_days=7,
        email="bad@u.example.com",
    )
    mailbox_id = await _make_mailbox(
        maker, workspace_id=ws_id, user_id=user_id, email="badmb@example.com"
    )

    # 20 outbound sends, 0 engagement → score = 0.
    for _ in range(20):
        await _add_log(
            maker,
            mailbox_id=mailbox_id,
            peer_id=peer_id,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=3.0,
        )

    result = await _impl()

    async with maker() as s:
        peer = await s.get(PeerInbox, peer_id)
        assert peer is not None
        assert peer.is_active is False
        assert peer.reputation_score == pytest.approx(0.0, abs=1e-6)

        audits = (await s.scalars(
            select(AuditLog).where(AuditLog.action == "peer_deactivated_low_reputation")
        )).all()
        assert len(audits) == 1
        assert audits[0].target_id == peer_id
    assert str(peer_id) in result["deactivated"]


async def test_peer_health_check_skips_day_zero_peers(
    maker_and_engine: async_sessionmaker[AsyncSession],
) -> None:
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection
    from app.tasks.peer_health_check import _impl

    maker = maker_and_engine

    # Case A: peer with no warmup_logs at all → no data → exempt.
    peer_a = await _make_peer(maker, email="dayzero-a@example.com")

    # Case B: peer with bad ratio but sentinel only 2 h old → still in
    # calibration window → score updates but peer stays active.
    sentinel_recent = datetime.now(UTC) - timedelta(hours=2)
    peer_b = await _make_peer(
        maker,
        email="dayzero-b@example.com",
        reputation_score_updated_at=sentinel_recent,
    )
    user_id, ws_id = await _make_user_with_plan(
        maker,
        plan_name="Starter-dz",
        retention_days=7,
        email="dz@u.example.com",
    )
    mailbox_id = await _make_mailbox(
        maker, workspace_id=ws_id, user_id=user_id, email="dzmb@example.com"
    )
    for _ in range(15):
        await _add_log(
            maker,
            mailbox_id=mailbox_id,
            peer_id=peer_b,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=1.0,
        )

    result = await _impl()

    async with maker() as s:
        a = await s.get(PeerInbox, peer_a)
        b = await s.get(PeerInbox, peer_b)
        assert a is not None and b is not None
        # Peer A: untouched (default 1.0, still active, sentinel still None).
        assert a.is_active is True
        assert a.reputation_score == pytest.approx(1.0, abs=1e-6)
        assert a.reputation_score_updated_at is None
        # Peer B: score updated to 0 but NOT deactivated (within calibration).
        assert b.is_active is True
        assert b.reputation_score == pytest.approx(0.0, abs=1e-6)

    assert str(peer_a) in result["skipped_no_data"]
    assert str(peer_b) not in result["deactivated"]


# --------------------------------------------------------------------------- #
# Tests — history_purge                                                       #
# --------------------------------------------------------------------------- #


async def test_history_purge_deletes_per_plan_retention(
    maker_and_engine: async_sessionmaker[AsyncSession],
) -> None:
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
    from app.tasks.history_purge import _impl

    maker = maker_and_engine

    # Workspace 1: Starter plan, retention=7 days.
    ws1_user, ws1 = await _make_user_with_plan(
        maker,
        plan_name="Starter-purge",
        retention_days=7,
        email="ws1@example.com",
    )
    # Workspace 2: Pro plan, retention=90 days.
    ws2_user, ws2 = await _make_user_with_plan(
        maker,
        plan_name="Pro-purge",
        retention_days=90,
        email="ws2@example.com",
    )

    # A shared peer (workspace doesn't matter on peers).
    peer_id = await _make_peer(maker, email="purge-peer@example.com")

    mb1 = await _make_mailbox(
        maker, workspace_id=ws1, user_id=ws1_user, email="mb1@example.com"
    )
    mb2 = await _make_mailbox(
        maker, workspace_id=ws2, user_id=ws2_user, email="mb2@example.com"
    )

    # ws1 (starter, 7d cutoff): 3 fresh (1d), 2 old (10d) → 2 deleted.
    for _ in range(3):
        await _add_log(
            maker,
            mailbox_id=mb1,
            peer_id=peer_id,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=24.0,
        )
    for _ in range(2):
        await _add_log(
            maker,
            mailbox_id=mb1,
            peer_id=peer_id,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=24.0 * 10,
        )

    # ws2 (pro, 90d cutoff): 4 fresh (10d), 1 old (100d) → 1 deleted.
    for _ in range(4):
        await _add_log(
            maker,
            mailbox_id=mb2,
            peer_id=peer_id,
            direction=WarmupDirection.outbound,
            action=WarmupAction.sent,
            age_hours=24.0 * 10,
        )
    await _add_log(
        maker,
        mailbox_id=mb2,
        peer_id=peer_id,
        direction=WarmupDirection.outbound,
        action=WarmupAction.sent,
        age_hours=24.0 * 100,
    )

    result = await _impl()

    async with maker() as s:
        ws1_logs = (await s.scalars(
            select(WarmupLog).where(WarmupLog.mailbox_id == mb1)
        )).all()
        ws2_logs = (await s.scalars(
            select(WarmupLog).where(WarmupLog.mailbox_id == mb2)
        )).all()
        assert len(ws1_logs) == 3
        assert len(ws2_logs) == 4

    by_ws = {entry["workspace_id"]: entry for entry in result["workspaces"]}
    assert by_ws[str(ws1)]["purged"] == 2
    assert by_ws[str(ws1)]["retention_days"] == 7
    assert by_ws[str(ws2)]["purged"] == 1
    assert by_ws[str(ws2)]["retention_days"] == 90
