"""Tests for the Pro Settings backend wiring.

Covers the workspace_settings table CRUD, the notification events matrix,
the sessions endpoint, and the CSV export. Each test stands up a tiny
in-memory SQLite database with just the tables it needs, mirroring the
pattern used by tests/test_team.py.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

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


async def _setup_db():
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.api_keys import ApiKey
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.workspace_settings import WorkspaceSetting

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
            AuditLog,
            ApiKey,
            Mailbox,
            PeerInbox,
            WarmupLog,
            WorkspaceSetting,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[
    tuple[object, async_sessionmaker[AsyncSession]]
]:
    maker, engine = await _setup_db()
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


async def _make_user(maker, *, email: str):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


def _auth(user) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    tok = create_access_token(
        subject=str(user.id), role=role, workspace_id=str(user.workspace_id)
    )
    return {"Authorization": f"Bearer {tok}"}


# ── Workspace profile ──────────────────────────────────────────────────


async def test_get_workspace_profile_returns_defaults(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/settings/workspace", headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    # Defaults come from the user when no row exists yet.
    assert body["default_sender"] == "owner@acme.com"
    assert body["brand_color"] == "#F26522"
    assert body["retention_days"] == 90
    assert "name" in body and body["name"]


async def test_patch_workspace_profile_persists(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/settings/workspace",
            json={
                "name": "Acme · WarmPulse",
                "slug": "ACME-Co",  # exercises normalisation
                "brand_color": "#3b82f6",
                "retention_days": 180,
            },
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Acme · WarmPulse"
        assert body["slug"] == "acme-co"
        assert body["brand_color"] == "#3b82f6"
        assert body["retention_days"] == 180

        # Re-fetch to confirm persistence across requests.
        r2 = await c.get("/api/workspace/settings/workspace", headers=_auth(user))
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["name"] == "Acme · WarmPulse"
    assert body2["retention_days"] == 180


async def test_patch_workspace_rejects_extra_fields(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/settings/workspace",
            json={"name": "Acme", "unknown_field": "x"},
            headers=_auth(user),
        )
    assert r.status_code == 422, r.text


async def test_patch_workspace_validates_retention_bounds(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/settings/workspace",
            json={"retention_days": 5},  # below 30 day floor
            headers=_auth(user),
        )
    assert r.status_code == 422, r.text


# ── Notification events matrix ────────────────────────────────────────


async def test_get_notification_events_returns_defaults(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            "/api/workspace/settings/notifications/events", headers=_auth(user)
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "mailbox_paused" in body["events"]
    row = body["events"]["mailbox_paused"]
    assert row["email"] is True
    assert row["in_app"] is True
    assert row["push"] is False


async def test_patch_notification_event_persists(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/settings/notifications/events",
            json={"key": "weekly_digest", "channel": "push", "enabled": True},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text
        assert r.json()["events"]["weekly_digest"]["push"] is True

        r2 = await c.get(
            "/api/workspace/settings/notifications/events", headers=_auth(user)
        )
    assert r2.json()["events"]["weekly_digest"]["push"] is True


async def test_patch_notification_event_rejects_unknown_key(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/settings/notifications/events",
            json={"key": "definitely_not_real", "channel": "email", "enabled": True},
            headers=_auth(user),
        )
    assert r.status_code == 400, r.text


# ── Sessions ─────────────────────────────────────────────────────────


async def test_sessions_returns_current_jwt(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/settings/sessions", headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) >= 1
    current = [s for s in body if s["is_current"]]
    assert len(current) == 1
    assert current[0]["kind"] == "jwt"


async def test_revoke_current_session_is_rejected(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(
            "/api/workspace/settings/sessions/current", headers=_auth(user)
        )
    assert r.status_code == 400, r.text


async def test_revoke_api_key_session(app_and_maker) -> None:
    from app.db.models.api_keys import ApiKey

    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    async with maker() as s:
        ak = ApiKey(
            workspace_id=user.workspace_id,
            key_hash="$2b$10$invalidhashforfixture",
            prefix="wp_live_xx",
            name="CI key",
        )
        s.add(ak)
        await s.commit()
        await s.refresh(ak)
        key_id = str(ak.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(
            f"/api/workspace/settings/sessions/{key_id}", headers=_auth(user)
        )
    assert r.status_code == 204, r.text


# ── Data export ──────────────────────────────────────────────────────


async def test_export_returns_csv_even_when_empty(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            "/api/workspace/settings/data/export", headers=_auth(user)
        )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    # First line is the header row.
    text = r.text
    assert text.startswith("created_at,mailbox_id,peer_inbox_id,direction,action")


# ── GDPR + deletion request ───────────────────────────────────────────


async def test_gdpr_request_accepts_payload(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/settings/data/gdpr-request",
            json={"subject_email": "victim@acme.com"},
            headers=_auth(user),
        )
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["subject_email"] == "victim@acme.com"


async def test_delete_workspace_returns_queued(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.delete(
            "/api/workspace/settings/workspace", headers=_auth(user)
        )
    assert r.status_code == 202, r.text
    body = r.json()
    assert "queued_at" in body
    assert "expected_completion" in body
