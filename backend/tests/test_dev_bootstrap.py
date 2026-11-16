"""Dev bootstrap — env-gated sqlite create_all + demo warmup seed.

The bootstrap exists because alembic migrations are Postgres-only: on the
local (Docker-less) sqlite stack the authed warmup endpoints 500 with
"no such table". Guarded by WARMUP_DEV_BOOTSTRAP=1 and refused outright
in production; alembic/prod paths untouched.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.mailboxes import Mailbox
from app.db.models.notifications import Notification
from app.db.models.users import User
from app.db.models.daily_metrics import DailyMetric
from app.db.models.warmup_logs import WarmupLog

from scripts.dev_bootstrap import (
    BootstrapRefused,
    DEFAULT_BRIDGE_EMAIL,
    ensure_bootstrap_allowed,
    run_bootstrap,
)

GOOD_SECRET = "x" * 48


def _dev_settings() -> "Settings":  # type: ignore[name-defined]
    from app.config import Settings

    return Settings(
        _env_file=None,
        APP_ENV="development",
        JWT_SECRET=GOOD_SECRET,
        warmup_dev_bootstrap=True,
        # The bootstrap is sqlite-only (create_all vs alembic); without this
        # the Settings default (Postgres) trips the non-sqlite refusal.
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
    )


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def maker(engine):
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


# --------------------------------------------------------------------------- #
# Guards                                                                      #
# --------------------------------------------------------------------------- #


def test_refused_without_flag():
    from app.config import Settings

    s = Settings(_env_file=None, APP_ENV="development", JWT_SECRET=GOOD_SECRET)
    assert s.warmup_dev_bootstrap is False
    with pytest.raises(BootstrapRefused):
        ensure_bootstrap_allowed(s)


def test_refused_in_production_even_with_flag():
    from app.config import Settings

    s = Settings(
        _env_file=None,
        APP_ENV="production",
        JWT_SECRET=GOOD_SECRET,
        warmup_dev_bootstrap=True,
    )
    with pytest.raises(BootstrapRefused, match="production"):
        ensure_bootstrap_allowed(s)


def test_allowed_in_dev_with_flag():
    assert ensure_bootstrap_allowed(_dev_settings()) is None


def _pg_settings() -> "Settings":  # type: ignore[name-defined]
    from app.config import Settings

    return Settings(
        _env_file=None,
        APP_ENV="development",
        JWT_SECRET=GOOD_SECRET,
        warmup_dev_bootstrap=True,
        DATABASE_URL="postgresql+asyncpg://u:p@localhost:5432/warmpulse_db",
    )


def test_refused_on_non_sqlite_database_url():
    """create_all must never run against a non-sqlite database: off-sqlite,
    alembic migrations own the schema and a create_all would fight them
    (dev-Postgres drift, or worse). Same refusal class as the prod guard."""
    with pytest.raises(BootstrapRefused, match="sqlite"):
        ensure_bootstrap_allowed(_pg_settings())


async def test_run_bootstrap_refuses_non_sqlite_without_create_all(engine):
    """End-to-end guard: run_bootstrap raises BEFORE create_all touches the
    engine — the sqlite target must stay empty."""
    from sqlalchemy import inspect as sa_inspect

    with pytest.raises(BootstrapRefused):
        await run_bootstrap(engine, settings=_pg_settings())

    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda c: sa_inspect(c).get_table_names())
    assert tables == []


# --------------------------------------------------------------------------- #
# Schema + seed                                                               #
# --------------------------------------------------------------------------- #


async def _count(maker, model) -> int:
    async with maker() as s:
        return int((await s.execute(select(func.count()).select_from(model))).scalar_one())


async def test_creates_schema_and_seeds(engine, maker):
    await run_bootstrap(engine, settings=_dev_settings())

    user = None
    async with maker() as s:
        user = (
            await s.execute(select(User).where(User.email == DEFAULT_BRIDGE_EMAIL))
        ).scalar_one()
    assert user is not None
    assert user.hashed_password is None  # passwordless bridge user
    assert user.email_verified is True

    assert await _count(maker, Mailbox) == 3
    # 30 days of warmth history per mailbox.
    assert await _count(maker, DailyMetric) == 3 * 30
    # Today activity + previous days for feed depth.
    assert await _count(maker, WarmupLog) >= 3 * 10
    # 2 alerts for the bridge user.
    assert await _count(maker, Notification) == 2
    async with maker() as s:
        alerts = (
            await s.execute(select(Notification).where(Notification.user_id == user.id))
        ).all()
        assert len(alerts) == 2
        assert all(a[0].read_at is None for a in alerts)


async def test_seed_feeds_real_dashboard_services(engine, maker):
    """The seed must satisfy the actual consumers: today-stats counts,
    30-day warmth history and the summary hero all come back non-empty."""
    from app.services import activity_service, analytics_service

    await run_bootstrap(engine, settings=_dev_settings())
    async with maker() as s:
        user = (
            await s.execute(select(User).where(User.email == DEFAULT_BRIDGE_EMAIL))
        ).scalar_one()
        stats = await activity_service.today_stats(
            s, workspace_id=user.workspace_id, mailbox_id=None
        )
        assert stats["sent"] > 0
        assert stats["opens"] > 0
        assert stats["replies"] > 0

        summary = await analytics_service.dashboard_summary(
            s, workspace_id=user.workspace_id
        )
        assert summary["total_mailboxes"] == 3
        assert summary["active_mailboxes"] >= 2
        assert len(summary["warmth_30d"]) == 30
        assert summary["mean_warmth_score"] > 0
        assert stats["sent"] == summary["today"]["sent"]


async def test_seed_serializes_through_mailbox_service(engine, maker):
    """The mailboxes list route 500s if a provider falls outside the
    MailboxOut response enum (the response enum now covers every DB value —
    pinned by tests/test_mailbox_provider_enum.py)."""
    from app.services.mailbox_service import mailbox_to_out

    await run_bootstrap(engine, settings=_dev_settings())
    async with maker() as s:
        mailboxes = (await s.execute(select(Mailbox))).scalars().all()
        assert len(mailboxes) == 3
        for mb in mailboxes:
            out = mailbox_to_out(mb)  # raises ValidationError on a bad provider
            assert out.provider in {"gmail", "outlook", "yahoo", "smtp"}


async def test_idempotent_rerun(engine, maker):
    await run_bootstrap(engine, settings=_dev_settings())
    counts1 = {
        "mailboxes": await _count(maker, Mailbox),
        "metrics": await _count(maker, DailyMetric),
        "logs": await _count(maker, WarmupLog),
        "alerts": await _count(maker, Notification),
        "users": await _count(maker, User),
    }
    await run_bootstrap(engine, settings=_dev_settings())
    counts2 = {
        "mailboxes": await _count(maker, Mailbox),
        "metrics": await _count(maker, DailyMetric),
        "logs": await _count(maker, WarmupLog),
        "alerts": await _count(maker, Notification),
        "users": await _count(maker, User),
    }
    assert counts1 == counts2


async def test_reuses_bridge_user_provisioned_first(engine, maker):
    """Bridge login may happen BEFORE the bootstrap runs: the provisioning
    path then created the user with a random workspace_id. Re-running the
    bootstrap must seed into THAT workspace, never create a second user."""
    from app.db.base import Base
    from app.db.models.users import OnboardingStatus, UserRole

    # Bridge login happened first — tables already existed (provisioning
    # itself never creates them; in the live stack this state comes from a
    # previous bootstrap run or a fresh create_all).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    existing_ws = uuid.uuid4()
    async with maker() as s:
        s.add(
            User(
                email=DEFAULT_BRIDGE_EMAIL,
                hashed_password=None,
                workspace_id=existing_ws,
                role=UserRole.client,
                onboarding_status=OnboardingStatus.mailbox_pending,
                email_verified=True,
            )
        )
        await s.commit()

    await run_bootstrap(engine, settings=_dev_settings())

    async with maker() as s:
        users = (
            await s.execute(select(User).where(User.email == DEFAULT_BRIDGE_EMAIL))
        ).scalars().all()
        assert len(users) == 1
        assert users[0].workspace_id == existing_ws
        mailboxes = (
            await s.execute(select(Mailbox).where(Mailbox.workspace_id == existing_ws))
        ).scalars().all()
        assert len(mailboxes) == 3


async def test_run_bootstrap_enforces_guards(engine):
    from app.config import Settings

    s = Settings(
        _env_file=None,
        APP_ENV="production",
        JWT_SECRET=GOOD_SECRET,
        warmup_dev_bootstrap=True,
    )
    with pytest.raises(BootstrapRefused):
        await run_bootstrap(engine, settings=s)
