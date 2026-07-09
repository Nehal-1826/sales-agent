"""Tests for workspace notification settings."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _dedupe_indexes(base) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        drops = []
        for idx in list(table.indexes):
            if idx.name in seen:
                drops.append(idx)
            else:
                seen.add(idx.name)
        for idx in drops:
            table.indexes.discard(idx)


async def _setup():
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.notification_settings import NotificationSetting
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, AuditLog, NotificationSetting)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession]]]:
    maker, engine = await _setup()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker
    finally:
        await engine.dispose()


async def _user(maker):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email="n@example.com",
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


def _auth(u):
    from app.services.security import create_access_token

    role = u.role.value if hasattr(u.role, "value") else str(u.role)
    tok = create_access_token(
        subject=str(u.id), role=role, workspace_id=str(u.workspace_id)
    )
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.asyncio
async def test_notification_crud(app_and_maker) -> None:
    app, maker = app_and_maker
    u = await _user(maker)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        create = await c.post(
            "/api/workspace/notifications/settings/",
            json={
                "channel": "slack",
                "target": "https://hooks.slack.com/services/abc",
                "event_types": ["warmth_drop", "mailbox_paused"],
            },
            headers=_auth(u),
        )
        assert create.status_code == 201, create.text
        sid = create.json()["id"]

        listing = await c.get("/api/workspace/notifications/settings/", headers=_auth(u))
        assert listing.status_code == 200
        assert len(listing.json()) == 1

        patch = await c.patch(
            f"/api/workspace/notifications/settings/{sid}",
            json={"event_types": ["dns_broken"]},
            headers=_auth(u),
        )
        assert patch.status_code == 200
        assert patch.json()["event_types"] == ["dns_broken"]

        delete = await c.delete(
            f"/api/workspace/notifications/settings/{sid}", headers=_auth(u)
        )
        assert delete.status_code == 204


@pytest.mark.asyncio
async def test_event_types_validated(app_and_maker) -> None:
    app, maker = app_and_maker
    u = await _user(maker)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/notifications/settings/",
            json={
                "channel": "email",
                "target": "ops@example.com",
                "event_types": ["not_a_real_event"],
            },
            headers=_auth(u),
        )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_test_notification_stub(app_and_maker) -> None:
    app, maker = app_and_maker
    u = await _user(maker)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        create = await c.post(
            "/api/workspace/notifications/settings/",
            json={
                "channel": "webhook",
                "target": "https://webhook.example/hook",
                "event_types": ["dns_broken"],
            },
            headers=_auth(u),
        )
        sid = create.json()["id"]
        test = await c.post(
            f"/api/workspace/notifications/settings/{sid}/test", headers=_auth(u)
        )
    assert test.status_code == 200, test.text
    assert test.json()["sent"] is True
    assert "webhook" in test.json()["note"]
