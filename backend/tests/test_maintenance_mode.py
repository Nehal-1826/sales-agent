"""Tests for the real maintenance-mode middleware.

Seeds ``app_settings.danger.maintenance_mode`` via the maintenance service,
then drives the ASGI app: client workspace APIs must 503, while the admin
surface, login and health stay reachable (the admin needs them to toggle
maintenance back off). Also pins the fail-open rule: a broken DB read must
never block traffic.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
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
    tables = [t.__table__ for t in (User, Plan, Mailbox, WarmupLog, AuditLog, AppSetting)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]:
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app
    from app.services import maintenance

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    # The middleware reads the flag through SessionLocal (it has no request
    # session) — point that at the test DB so the cache refresh sees the
    # seeded app_settings row.
    monkeypatch.setattr("app.db.session.SessionLocal", maker)
    # Don't inherit a stale on/off from a previous test's 10s cache window.
    maintenance.force_refresh()
    try:
        yield app, maker, engine
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _make_user(maker: async_sessionmaker[AsyncSession], *, role: str) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=f"{role}-{uuid.uuid4().hex[:8]}@example.com",
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
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# 1. block / allow matrix + toggle-off recovery                               #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_maintenance_blocks_clients_allows_admin_and_login(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.services import maintenance

    app, maker, _ = app_and_maker
    admin = await _make_user(maker, role="super_admin")
    client_user = await _make_user(maker, role="client")

    async with maker() as session:
        await maintenance.set_maintenance_mode(session, enabled=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # Client workspace API → 503 maintenance.
        resp = await c.get("/api/workspace/mailboxes", headers=_auth_for(client_user))
        assert resp.status_code == 503, resp.text
        body = resp.json()
        assert body["detail"] == "maintenance"
        assert "maintenance" in body["message"].lower()

        # Login stays reachable (wrong creds → 401, never 503).
        resp = await c.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrong"},
        )
        assert resp.status_code != 503, resp.text
        assert resp.status_code == 401

        # Health + admin surface stay reachable for the admin.
        resp = await c.get("/health")
        assert resp.status_code == 200, resp.text
        resp = await c.get("/api/admin/users", headers=_auth_for(admin))
        assert resp.status_code != 503, resp.text

    # Toggle off → client API recovers (force_refresh runs inside the setter).
    async with maker() as session:
        await maintenance.set_maintenance_mode(session, enabled=False)

    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/workspace/mailboxes", headers=_auth_for(client_user))
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 0


# --------------------------------------------------------------------------- #
# 2. fail-open: a broken DB read never blocks traffic                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_middleware_fails_open_on_db_error(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import maintenance

    app, maker, _ = app_and_maker
    client_user = await _make_user(maker, role="client")

    async with maker() as session:
        await maintenance.set_maintenance_mode(session, enabled=True)

    def _broken_session_factory():
        raise RuntimeError("db down")

    monkeypatch.setattr("app.db.session.SessionLocal", _broken_session_factory)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/api/workspace/mailboxes", headers=_auth_for(client_user))
    assert resp.status_code != 503, resp.text
    assert resp.status_code == 200
