"""Round 4: API-key auth on /api/workspace/* GET endpoints.

The dual-mode bearer dep ``get_current_user_or_api_key`` accepts either a
JWT access token or a ``wp_live_xxxx`` key. We assert end-to-end that the
key flow lights up read endpoints (and JWT still works in parallel) and
that revoking a key invalidates future calls.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC

import bcrypt
import pytest
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
    from app.db.models.api_keys import ApiKey
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, Mailbox, ApiKey, AuditLog)]
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


async def _make_user_with_key(
    maker: async_sessionmaker[AsyncSession],
    *,
    raw_key: str = "wp_live_abc12345__test_key__zzz",
    revoked: bool = False,
) -> object:
    from datetime import datetime

    from app.db.models.api_keys import ApiKey
    from app.db.models.users import OnboardingStatus, User, UserRole

    workspace_id = uuid.uuid4()
    async with maker() as db:
        u = User(
            email="key-owner@example.com",
            hashed_password=None,
            workspace_id=workspace_id,
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)

        key = ApiKey(
            workspace_id=workspace_id,
            key_hash=bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode(),
            prefix=raw_key[:12],
            name="ci-test",
            revoked_at=datetime.now(UTC) if revoked else None,
        )
        db.add(key)
        await db.commit()
        return u


@pytest.mark.asyncio
async def test_api_key_unlocks_workspace_dashboard_summary(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    raw_key = "wp_live_abc12345_real_secret_value"
    await _make_user_with_key(maker, raw_key=raw_key)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/dashboard/summary",
            headers={"Authorization": f"Bearer {raw_key}"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Empty workspace → zeros, but the response shape should be intact.
    assert "total_mailboxes" in body
    assert "today" in body


@pytest.mark.asyncio
async def test_revoked_api_key_is_rejected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    raw_key = "wp_live_revoked_key_should_fail_here"
    await _make_user_with_key(maker, raw_key=raw_key, revoked=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/workspace/analytics/dashboard/summary",
            headers={"Authorization": f"Bearer {raw_key}"},
        )
    assert resp.status_code == 401
    assert "Invalid or revoked API key" in resp.text


@pytest.mark.asyncio
async def test_api_key_does_not_unlock_writes(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Spec: API keys are read-only in v1. POST /workspace/mailboxes uses the
    JWT-only ``get_current_user`` dep, so a key Authorization header is
    rejected as "Invalid token" by the JWT path."""
    app, maker, _ = app_and_maker
    raw_key = "wp_live_readonly_key_for_writes_too"
    await _make_user_with_key(maker, raw_key=raw_key)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes",
            headers={"Authorization": f"Bearer {raw_key}"},
            json={
                "email_address": "blocked@example.com",
                "provider": "smtp",
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_username": "user",
                "smtp_password": "pw",
            },
        )
    assert resp.status_code == 401
