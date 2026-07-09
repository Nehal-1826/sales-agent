"""Tests for workspace + admin analytics endpoints (spec §5.1 items 1/4, §5.2 item 5).

Mirrors the harness in ``test_peer_inboxes`` / ``test_mailboxes``: a fresh
in-memory SQLite with ``StaticPool`` + ``get_db`` overridden at the app
level, with only the tables the analytics module touches registered.

All endpoints are read-only — we verify via row-count snapshots that no
writes have landed on any table.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
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
    from app.db import models  # noqa: F401 — register all models on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.mailboxes import Mailbox
    from app.db.models.payments import Payment
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.warmup_threads import WarmupThread

    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            Mailbox,
            PeerInbox,
            DailyMetric,
            WarmupLog,
            WarmupThread,
            Payment,
            AuditLog,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> (
    AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]
):
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


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


async def _make_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str = "Starter",
    price_cents: int = 1500,
) -> object:
    from app.db.models.plans import Plan

    async with maker() as session:
        p = Plan(
            name=name,
            price_cents=price_cents,
            max_mailboxes=10,
            daily_email_cap=100,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)
        return p


async def _make_user(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    role: str = "client",
    plan_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=workspace_id or uuid.uuid4(),
            role=UserRole(role),
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
            plan_id=plan_id,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    email: str,
    warmup_status: str = "active",
    is_paused: bool = False,
    warmth_score: float = 50.0,
) -> object:
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    async with maker() as session:
        m = Mailbox(
            user_id=user_id,
            workspace_id=workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username=email,
            smtp_password_encrypted=b"x",
            imap_host="imap.example.com",
            imap_port=993,
            warmup_status=WarmupStatus(warmup_status),
            is_paused=is_paused,
            warmth_score=warmth_score,
            daily_target=50,
        )
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return m


async def _make_peer(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str = "peer@example.com",
    is_active: bool = True,
) -> object:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    async with maker() as session:
        p = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            reputation_score=0.8,
            daily_capacity=50,
            used_today=0,
            is_active=is_active,
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)
        return p


async def _seed_daily_metrics(
    maker: async_sessionmaker[AsyncSession],
    *,
    mailbox_id: uuid.UUID,
    days: int = 7,
    base_sent: int = 10,
    warmth_start: float = 40.0,
) -> None:
    from app.db.models.daily_metrics import DailyMetric

    today = datetime.now(UTC).date()
    async with maker() as session:
        for i in range(days):
            d = today - timedelta(days=(days - 1 - i))
            row = DailyMetric(
                mailbox_id=mailbox_id,
                date=d,
                emails_sent=base_sent + i,
                emails_received=base_sent // 2 + i,
                opens=(base_sent + i) // 2,
                replies=(base_sent + i) // 4,
                spam_rescues=1,
                bounce_count=0,
                inbox_placement_pct=85.0 + i,
                warmth_score=warmth_start + i * 2,
            )
            session.add(row)
        await session.commit()


async def _seed_today_sent(
    maker: async_sessionmaker[AsyncSession],
    *,
    mailbox_id: uuid.UUID,
    peer_id: uuid.UUID,
    count: int,
) -> None:
    """Seed N outbound ``sent`` warmup_log rows dated today (UTC).

    Used by tests that exercise dashboard ``today.sent`` which reads from
    warmup_logs in real time (not the end-of-day daily_metrics rollup).
    """
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    now = datetime.now(UTC)
    async with maker() as session:
        for i in range(count):
            session.add(
                WarmupLog(
                    mailbox_id=mailbox_id,
                    peer_inbox_id=peer_id,
                    direction=WarmupDirection.outbound,
                    action=WarmupAction.sent,
                    message_id=f"today-msg-{mailbox_id}-{i}@example.com",
                    subject_snippet=f"Today subject {i}",
                    created_at=now - timedelta(minutes=i),
                )
            )
        await session.commit()


async def _seed_warmup_logs(
    maker: async_sessionmaker[AsyncSession],
    *,
    mailbox_id: uuid.UUID,
    peer_id: uuid.UUID,
    count: int = 50,
) -> list[int]:
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    now = datetime.now(UTC)
    ids: list[int] = []
    async with maker() as session:
        actions = [
            WarmupAction.sent,
            WarmupAction.opened,
            WarmupAction.replied,
            WarmupAction.starred,
            WarmupAction.spam_rescued,
        ]
        for i in range(count):
            log = WarmupLog(
                mailbox_id=mailbox_id,
                peer_inbox_id=peer_id,
                direction=WarmupDirection.outbound
                if i % 2 == 0
                else WarmupDirection.inbound,
                action=actions[i % len(actions)],
                message_id=f"msg-{i}@example.com",
                subject_snippet=f"Subject {i}",
                created_at=now - timedelta(hours=i),
            )
            session.add(log)
        await session.commit()
        # Pull IDs for the first-inserted log.
        result = await session.execute(select(WarmupLog.id).order_by(WarmupLog.id))
        ids = [int(r[0]) for r in result.all()]
    return ids


async def _count_rows(
    maker: async_sessionmaker[AsyncSession], model: type
) -> int:
    from sqlalchemy import func

    async with maker() as session:
        result = await session.execute(select(func.count()).select_from(model))
        return int(result.scalar_one())


# --------------------------------------------------------------------------- #
# Tests — Dashboard summary                                                   #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_dashboard_summary_aggregates_correctly(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="u@example.com", plan_id=plan.id, workspace_id=ws
    )
    m1 = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="m1@example.com"
    )
    m2 = await _make_mailbox(
        maker,
        user_id=user.id,
        workspace_id=ws,
        email="m2@example.com",
        is_paused=True,
    )
    await _seed_daily_metrics(maker, mailbox_id=m1.id, days=30, base_sent=5)
    await _seed_daily_metrics(maker, mailbox_id=m2.id, days=30, base_sent=3)

    # The dashboard reads today's send count from warmup_logs (real-time)
    # rather than daily_metrics (rolled up at end-of-day) — seed today's
    # outbound `sent` rows so the assertion matches.
    peer = await _make_peer(maker, email="peer-dash@example.com")
    await _seed_today_sent(maker, mailbox_id=m1.id, peer_id=peer.id, count=5 + 29)
    await _seed_today_sent(maker, mailbox_id=m2.id, peer_id=peer.id, count=3 + 29)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/dashboard/summary",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_mailboxes"] == 2
    assert body["active_mailboxes"] == 1  # m2 paused
    # 30 days, one row per date aggregated.
    assert len(body["warmth_30d"]) == 30
    # Today sent = today's warmup_logs sent rows: m1 (5+29) + m2 (3+29) = 66.
    assert body["today"]["sent"] == (5 + 29) + (3 + 29)
    # Mean warmth averages both mailboxes' today's warmth.
    assert body["mean_warmth_score"] > 0
    # Delta = today - yesterday, non-zero since warmth ladders up.
    assert body["warmth_delta_24h"] != 0
    split = body["placement_split"]
    assert 0 <= split["inbox_pct"] <= 100
    assert 0 <= split["spam_pct"] <= 100


@pytest.mark.asyncio
async def test_dashboard_summary_empty_workspace(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    user = await _make_user(maker, email="empty@example.com", plan_id=plan.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/dashboard/summary",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_mailboxes"] == 0
    assert body["active_mailboxes"] == 0
    assert body["mean_warmth_score"] == 0.0
    assert body["warmth_delta_24h"] == 0.0
    assert body["today"]["sent"] == 0
    assert body["warmth_30d"] == []
    # Placement split defaults: no data → inbox=100, spam=0, promotions=0.
    assert body["placement_split"]["inbox_pct"] == 100.0
    assert body["placement_split"]["spam_pct"] == 0.0


# --------------------------------------------------------------------------- #
# Tests — Daily metrics                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_daily_metrics_range_filter(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="dm@example.com", plan_id=plan.id, workspace_id=ws
    )
    m = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="dm-m@example.com"
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=7)

    today = datetime.now(UTC).date()
    frm = (today - timedelta(days=2)).isoformat()
    to = today.isoformat()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            f"/api/workspace/analytics/daily-metrics?from={frm}&to={to}",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    # 2 days + today = 3 rows
    assert len(rows) == 3
    for r in rows:
        assert r["emails_sent"] > 0


@pytest.mark.asyncio
async def test_daily_metrics_mailbox_filter(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="f@example.com", plan_id=plan.id, workspace_id=ws
    )
    m1 = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="m1@example.com"
    )
    m2 = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="m2@example.com"
    )
    await _seed_daily_metrics(maker, mailbox_id=m1.id, days=3, base_sent=10)
    await _seed_daily_metrics(maker, mailbox_id=m2.id, days=3, base_sent=100)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r_all = await c.get(
            "/api/workspace/analytics/daily-metrics",
            headers=_auth_for(user),
        )
        r_m1 = await c.get(
            f"/api/workspace/analytics/daily-metrics?mailbox_id={m1.id}",
            headers=_auth_for(user),
        )
    assert r_all.status_code == 200
    assert r_m1.status_code == 200
    # Single-mailbox sums much smaller than workspace total.
    total_sum_all = sum(r["emails_sent"] for r in r_all.json())
    total_sum_m1 = sum(r["emails_sent"] for r in r_m1.json())
    assert total_sum_m1 < total_sum_all
    # Expected: m1 only = 10+11+12 = 33
    assert total_sum_m1 == 10 + 11 + 12


# --------------------------------------------------------------------------- #
# Tests — Placement trend                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_placement_trend_fallback_when_no_placement_tests(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="pt@example.com", plan_id=plan.id, workspace_id=ws
    )
    m = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="pt-m@example.com"
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=5)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/placement-trend",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 5
    for r in rows:
        # inbox_pct + promotions_pct + spam_pct ~= 100 (rounding tolerance).
        total = r["inbox_pct"] + r["promotions_pct"] + r["spam_pct"]
        assert abs(total - 100.0) < 0.5
        # Fallback: inbox_pct should match daily_metrics.inbox_placement_pct (~85+i).
        assert r["inbox_pct"] >= 85.0


# --------------------------------------------------------------------------- #
# Tests — Engagement                                                          #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_engagement_rates_bounded_0_to_1(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="eng@example.com", plan_id=plan.id, workspace_id=ws
    )
    m = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="eng-m@example.com"
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=5)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/engagement",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200
    for r in resp.json():
        assert 0.0 <= r["open_rate"] <= 1.0
        assert 0.0 <= r["reply_rate"] <= 1.0
        assert 0.0 <= r["star_rate"] <= 1.0
        assert 0.0 <= r["spam_rescue_rate"] <= 1.0


# --------------------------------------------------------------------------- #
# Tests — Warmth heatmap                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_warmth_heatmap_cells_cover_7x24(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="hm@example.com", plan_id=plan.id, workspace_id=ws
    )
    m = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="hm-m@example.com"
    )
    peer = await _make_peer(maker, email="peer-hm@example.com")
    await _seed_warmup_logs(maker, mailbox_id=m.id, peer_id=peer.id, count=10)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/warmth-heatmap",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200
    cells = resp.json()["cells"]
    assert len(cells) == 7 * 24
    weekdays = {c_["weekday"] for c_ in cells}
    hours = {c_["hour"] for c_ in cells}
    assert weekdays == set(range(7))
    assert hours == set(range(24))


# --------------------------------------------------------------------------- #
# Tests — Bounce / spam                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_bounce_spam_trend_returns_rows(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    ws = uuid.uuid4()
    user = await _make_user(
        maker, email="bs@example.com", plan_id=plan.id, workspace_id=ws
    )
    m = await _make_mailbox(
        maker, user_id=user.id, workspace_id=ws, email="bs-m@example.com"
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=5)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/bounce-spam",
            headers=_auth_for(user),
        )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 5
    for r in rows:
        assert 0.0 <= r["bounce_rate"] <= 1.0
        assert 0.0 <= r["spam_rate"] <= 1.0


# --------------------------------------------------------------------------- #
# Tests — Admin platform analytics                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_admin_platform_overview_requires_super_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    client_user = await _make_user(maker, email="c@example.com", plan_id=plan.id)
    admin = await _make_user(maker, email="a@example.com", role="super_admin")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r_client = await c.get(
            "/api/admin/platform-analytics/overview",
            headers=_auth_for(client_user),
        )
        r_admin = await c.get(
            "/api/admin/platform-analytics/overview",
            headers=_auth_for(admin),
        )
    assert r_client.status_code == 403
    assert r_admin.status_code == 200, r_admin.text
    body = r_admin.json()
    assert "total_users" in body
    assert "mrr_cents" in body


@pytest.mark.asyncio
async def test_admin_warmth_distribution_bins(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    admin = await _make_user(maker, email="wd-admin@example.com", role="super_admin")
    user = await _make_user(maker, email="wd-u@example.com", plan_id=plan.id)

    # Seed mailboxes with diverse warmth scores.
    for score in (5.0, 15.0, 25.0, 55.0, 95.0):
        await _make_mailbox(
            maker,
            user_id=user.id,
            workspace_id=user.workspace_id,
            email=f"warm-{int(score)}@example.com",
            warmth_score=score,
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/admin/platform-analytics/warmth-distribution",
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    bins = resp.json()["bins"]
    assert len(bins) == 10
    ranges = [b["range"] for b in bins]
    assert ranges == [
        "0-10",
        "10-20",
        "20-30",
        "30-40",
        "40-50",
        "50-60",
        "60-70",
        "70-80",
        "80-90",
        "90-100",
    ]
    # Check buckets landed: 5→"0-10", 15→"10-20", 25→"20-30", 55→"50-60", 95→"90-100".
    by_range = {b["range"]: b["count"] for b in bins}
    assert by_range["0-10"] == 1
    assert by_range["10-20"] == 1
    assert by_range["20-30"] == 1
    assert by_range["50-60"] == 1
    assert by_range["90-100"] == 1


@pytest.mark.asyncio
async def test_admin_plan_distribution_sums_correctly(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    starter = await _make_plan(maker, name="Starter", price_cents=1500)
    pro = await _make_plan(maker, name="Pro", price_cents=4900)
    admin = await _make_user(maker, email="pd-admin@example.com", role="super_admin")

    u1 = await _make_user(maker, email="s1@example.com", plan_id=starter.id)
    u2 = await _make_user(maker, email="s2@example.com", plan_id=starter.id)
    u3 = await _make_user(maker, email="p1@example.com", plan_id=pro.id)

    # Users u1 and u3 have active mailboxes.
    await _make_mailbox(
        maker,
        user_id=u1.id,
        workspace_id=u1.workspace_id,
        email="mb-u1@example.com",
    )
    await _make_mailbox(
        maker,
        user_id=u3.id,
        workspace_id=u3.workspace_id,
        email="mb-u3@example.com",
    )
    _ = u2

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/admin/platform-analytics/plan-distribution",
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    by_plan = {row["plan_name"]: row for row in resp.json()["by_plan"]}
    assert by_plan["Starter"]["user_count"] == 2
    assert by_plan["Starter"]["active_mailboxes"] == 1
    assert by_plan["Starter"]["mrr_cents"] == 2 * 1500
    assert by_plan["Pro"]["user_count"] == 1
    assert by_plan["Pro"]["active_mailboxes"] == 1
    assert by_plan["Pro"]["mrr_cents"] == 4900


@pytest.mark.asyncio
async def test_send_volume_weekly_buckets(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    admin = await _make_user(maker, email="sv-admin@example.com", role="super_admin")
    user = await _make_user(maker, email="sv-u@example.com", plan_id=plan.id)
    m = await _make_mailbox(
        maker,
        user_id=user.id,
        workspace_id=user.workspace_id,
        email="sv-m@example.com",
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=14)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r_day = await c.get(
            "/api/admin/platform-analytics/send-volume",
            headers=_auth_for(admin),
        )
        r_week = await c.get(
            "/api/admin/platform-analytics/send-volume?granularity=week",
            headers=_auth_for(admin),
        )
    assert r_day.status_code == 200
    assert r_week.status_code == 200
    # Weekly has fewer rows than daily (14 days of data → <= 3 week-buckets).
    assert len(r_week.json()) <= len(r_day.json())


# --------------------------------------------------------------------------- #
# Read-only invariant                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_all_analytics_reads_are_read_only(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Hit every analytics endpoint once and verify zero writes occurred."""
    from app.db.models.audit_logs import AuditLog
    from app.db.models.daily_metrics import DailyMetric
    from app.db.models.mailboxes import Mailbox
    from app.db.models.payments import Payment
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.warmup_threads import WarmupThread

    app, maker, _ = app_and_maker
    plan = await _make_plan(maker)
    admin = await _make_user(maker, email="ro-admin@example.com", role="super_admin")
    user = await _make_user(maker, email="ro@example.com", plan_id=plan.id)
    m = await _make_mailbox(
        maker,
        user_id=user.id,
        workspace_id=user.workspace_id,
        email="ro-m@example.com",
    )
    await _seed_daily_metrics(maker, mailbox_id=m.id, days=3)

    before = {
        "users": await _count_rows(maker, User),
        "plans": await _count_rows(maker, Plan),
        "mailboxes": await _count_rows(maker, Mailbox),
        "peers": await _count_rows(maker, PeerInbox),
        "metrics": await _count_rows(maker, DailyMetric),
        "logs": await _count_rows(maker, WarmupLog),
        "threads": await _count_rows(maker, WarmupThread),
        "payments": await _count_rows(maker, Payment),
        "audits": await _count_rows(maker, AuditLog),
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # Workspace endpoints.
        for path in (
            "/api/workspace/analytics/dashboard/summary",
            "/api/workspace/analytics/daily-metrics",
            "/api/workspace/analytics/placement-trend",
            "/api/workspace/analytics/engagement",
            "/api/workspace/analytics/warmth-heatmap",
            "/api/workspace/analytics/bounce-spam",
        ):
            resp = await c.get(path, headers=_auth_for(user))
            assert resp.status_code == 200, (path, resp.text)
        # Admin endpoints.
        for path in (
            "/api/admin/platform-analytics/overview",
            "/api/admin/platform-analytics/warmth-distribution",
            "/api/admin/platform-analytics/send-volume",
            "/api/admin/platform-analytics/plan-distribution",
            "/api/admin/platform-analytics/signup-rate",
            "/api/admin/platform-analytics/top-clients",
        ):
            resp = await c.get(path, headers=_auth_for(admin))
            assert resp.status_code == 200, (path, resp.text)

    after = {
        "users": await _count_rows(maker, User),
        "plans": await _count_rows(maker, Plan),
        "mailboxes": await _count_rows(maker, Mailbox),
        "peers": await _count_rows(maker, PeerInbox),
        "metrics": await _count_rows(maker, DailyMetric),
        "logs": await _count_rows(maker, WarmupLog),
        "threads": await _count_rows(maker, WarmupThread),
        "payments": await _count_rows(maker, Payment),
        "audits": await _count_rows(maker, AuditLog),
    }
    assert after == before, f"Unexpected writes: before={before} after={after}"
