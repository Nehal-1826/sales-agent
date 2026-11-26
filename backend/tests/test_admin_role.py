"""Tests for the admin route that changes a copy's role.

The warmup service keeps its own copy of everyone who signs in through the
bridge. Signing in never flips the role of an existing copy
(``test_bridge_auth`` pins that); this route is the one door that does, and
only the main system uses it (a super admin changed the account's role in
the console).

Harness copied from ``test_admin_users``: in-memory SQLite with ``StaticPool``
and only the tables this feature touches. pytest-asyncio is in auto mode.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
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


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan)]
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


async def _make_user(maker: async_sessionmaker[AsyncSession], *, role: str) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=f"u-{uuid.uuid4().hex[:8]}@example.com",
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


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(subject=str(user.id), role=role, workspace_id=str(user.workspace_id))
    return {"Authorization": f"Bearer {token}"}


async def _role_of(maker: async_sessionmaker[AsyncSession], user_id: uuid.UUID) -> str:
    from app.db.models.users import User

    async with maker() as session:
        row = await session.get(User, user_id)
        assert row is not None
        return str(row.role.value if hasattr(row.role, "value") else row.role)


def _client(app: object) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


# --------------------------------------------------------------------------- #
# Tests                                                                       #
# --------------------------------------------------------------------------- #


async def test_the_route_makes_a_client_a_super_admin(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    mate = await _make_user(maker, role="client")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{mate.id}/role", json={"role": "super_admin"}, headers=_auth_for(admin))
    assert resp.status_code == 204
    assert await _role_of(maker, mate.id) == "super_admin"


async def test_and_back_again(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    ex = await _make_user(maker, role="super_admin")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{ex.id}/role", json={"role": "client"}, headers=_auth_for(admin))
    assert resp.status_code == 204
    assert await _role_of(maker, ex.id) == "client"


async def test_nobody_changes_their_own_copy(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{admin.id}/role", json={"role": "client"}, headers=_auth_for(admin))
    assert resp.status_code == 400
    assert "your own role" in resp.json()["detail"]
    assert await _role_of(maker, admin.id) == "super_admin"


async def test_an_unknown_account_is_404(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{uuid.uuid4()}/role", json={"role": "client"}, headers=_auth_for(admin))
    assert resp.status_code == 404


async def test_an_id_that_is_not_a_uuid_is_400(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    async with _client(app) as c:
        resp = await c.post("/api/admin/users/not-a-uuid/role", json={"role": "client"}, headers=_auth_for(admin))
    assert resp.status_code == 400


async def test_a_client_token_cannot_use_it(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    mate = await _make_user(maker, role="client")
    other = await _make_user(maker, role="client")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{other.id}/role", json={"role": "super_admin"}, headers=_auth_for(mate))
    assert resp.status_code == 403
    assert await _role_of(maker, other.id) == "client"


async def test_a_signed_out_caller_is_refused(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    mate = await _make_user(maker, role="client")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{mate.id}/role", json={"role": "super_admin"})
    assert resp.status_code == 401
    assert await _role_of(maker, mate.id) == "client"


async def test_only_the_two_roles_are_accepted(app_and_maker) -> None:
    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    mate = await _make_user(maker, role="client")
    async with _client(app) as c:
        resp = await c.post(f"/api/admin/users/{mate.id}/role", json={"role": "owner"}, headers=_auth_for(admin))
    assert resp.status_code == 422
    assert await _role_of(maker, mate.id) == "client"
