"""Tests for the Plans router and service.

Strategy: build a FastAPI app with ``get_db`` overridden to yield from a
per-test in-memory SQLite session, and override ``require_super_admin``
where we need to exercise the admin-only endpoints with a fake admin.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], AsyncSession]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.payments import Payment
    from app.db.models.plans import Plan
    from app.db.models.users import User

    # Other models (e.g. mailboxes) carry duplicate-index definitions that trip
    # SQLite's CREATE INDEX. Creating only the plans subsystem tables avoids
    # tripping over those pre-existing quirks.
    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, Payment, AuditLog)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


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
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession]]]:
    """FastAPI app wired to a fresh in-memory SQLite via dependency override."""
    maker, engine = await _setup_db()

    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker
    finally:
        await engine.dispose()


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str,
    price_cents: int,
    active: bool = True,
    public: bool = True,
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=price_cents,
            max_mailboxes=1,
            daily_email_cap=50,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=active,
            is_public=public,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_client_user(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email="client@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_super_admin(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email="admin@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.super_admin,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# ---------- tests ----------


@pytest.mark.asyncio
async def test_list_plans_public_no_auth(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    await _seed_plan(maker, name="Starter", price_cents=1500)
    await _seed_plan(maker, name="Pro", price_cents=3900)
    await _seed_plan(maker, name="Agency", price_cents=9900)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/plans")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    # Sorted by price_cents asc
    names = [p["name"] for p in data]
    assert names == ["Starter", "Pro", "Agency"]
    # Computed price_display is present
    assert data[0]["price_display"] == "$15"


@pytest.mark.asyncio
async def test_list_plans_hides_inactive(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    await _seed_plan(maker, name="Starter", price_cents=1500, active=True)
    await _seed_plan(maker, name="Retired", price_cents=9999, active=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/plans")

    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "Retired" not in names
    assert "Starter" in names


@pytest.mark.asyncio
async def test_list_plans_hides_non_public(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    await _seed_plan(maker, name="Starter", price_cents=1500, public=True)
    await _seed_plan(maker, name="Agency", price_cents=9900, public=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/plans")

    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "Agency" not in names  # hidden from the public pricing page
    assert "Starter" in names


@pytest.mark.asyncio
async def test_admin_list_all_includes_hidden(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    admin = await _make_super_admin(maker)
    await _seed_plan(maker, name="Starter", price_cents=1500, public=True)
    await _seed_plan(maker, name="Agency", price_cents=9900, public=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/plans/all", headers=_auth_header_for(admin))

    assert resp.status_code == 200
    by_name = {p["name"]: p for p in resp.json()}
    assert "Agency" in by_name  # admin still sees hidden plans
    assert by_name["Agency"]["is_public"] is False
    assert by_name["Starter"]["is_public"] is True


@pytest.mark.asyncio
async def test_admin_list_all_requires_super_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    client_user = await _make_client_user(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/plans/all", headers=_auth_header_for(client_user))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_toggle_visibility(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    admin = await _make_super_admin(maker)
    pid = await _seed_plan(maker, name="Agency", price_cents=9900, public=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.patch(
            f"/api/plans/{pid}",
            json={"is_public": False},
            headers=_auth_header_for(admin),
        )
        assert resp.status_code == 200
        assert resp.json()["is_public"] is False

        # Now hidden from the public list.
        pub = await c.get("/api/plans")
        assert "Agency" not in [p["name"] for p in pub.json()]


@pytest.mark.asyncio
async def test_create_plan_requires_super_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    client_user = await _make_client_user(maker)

    payload = {
        "name": "HackerTier",
        "price_cents": 1,
        "max_mailboxes": 1,
        "daily_email_cap": 1,
        "token_cap_per_month": 1,
        "capabilities": {},
        "is_active": True,
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post("/api/plans", json=payload, headers=_auth_header_for(client_user))

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_super_admin_can_create_plan(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    admin = await _make_super_admin(maker)

    payload = {
        "name": "Enterprise",
        "price_cents": 49900,
        "max_mailboxes": 50,
        "daily_email_cap": 500,
        "token_cap_per_month": 2_000_000,
        "capabilities": {"can_issue_api_keys": True},
        "is_active": True,
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post("/api/plans", json=payload, headers=_auth_header_for(admin))

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Enterprise"
    assert body["price_display"] == "$499"


@pytest.mark.asyncio
async def test_super_admin_can_soft_delete_plan(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession]],
) -> None:
    app, maker = app_and_maker
    admin = await _make_super_admin(maker)
    pid = await _seed_plan(maker, name="Killable", price_cents=1000)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.delete(f"/api/plans/{pid}", headers=_auth_header_for(admin))

    assert resp.status_code == 200
    assert resp.json()["is_active"] is False
