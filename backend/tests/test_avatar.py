"""Tests for the profile-picture (avatar) feature.

Covers the workspace-settings avatar endpoints (upload happy path, MIME
rejection, size rejection, GET round-trip, DELETE), the ProfileOut.has_avatar
flip, and the admin-guarded streaming route. Uses the same tiny in-memory
SQLite pattern as tests/test_workspace_settings.py — LargeBinary maps to BLOB
on SQLite so the new columns create cleanly.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# A minimal 1x1 PNG (real bytes — exercises the binary round-trip).
PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000"
    "00907753de0000000c4944415408d763f8cfc0000003010100"
    "18dd8db00000000049454e44ae426082"
)


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


async def _make_user(maker, *, email: str, role=None):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=role or UserRole.client,
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


# ── Upload happy path + ProfileOut.has_avatar flip ─────────────────────


async def test_upload_avatar_happy_path_and_profile_flips(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # Before upload: has_avatar is False, avatar_url None.
        r0 = await c.get("/api/workspace/settings", headers=_auth(user))
        assert r0.status_code == 200, r0.text
        assert r0.json()["profile"]["has_avatar"] is False
        assert r0.json()["profile"]["avatar_url"] is None

        r = await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(user),
            files={"file": ("me.png", PNG_1PX, "image/png")},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["has_avatar"] is True
        assert body["avatar_url"].startswith(
            "/api/workspace/settings/profile/avatar?v="
        )

        # After upload: profile reflects it.
        r2 = await c.get("/api/workspace/settings", headers=_auth(user))
    assert r2.status_code == 200, r2.text
    prof = r2.json()["profile"]
    assert prof["has_avatar"] is True
    assert prof["avatar_url"] and "v=" in prof["avatar_url"]


# ── GET returns the bytes + correct content-type ───────────────────────


async def test_get_avatar_returns_bytes_and_content_type(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(user),
            files={"file": ("me.png", PNG_1PX, "image/png")},
        )
        r = await c.get(
            "/api/workspace/settings/profile/avatar", headers=_auth(user)
        )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.content == PNG_1PX


async def test_get_avatar_404_when_none(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            "/api/workspace/settings/profile/avatar", headers=_auth(user)
        )
    assert r.status_code == 404, r.text


# ── Rejections: bad mime + too large ───────────────────────────────────


async def test_upload_rejects_bad_mime(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(user),
            files={"file": ("evil.svg", b"<svg/>", "image/svg+xml")},
        )
    assert r.status_code == 415, r.text


async def test_upload_rejects_too_large(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    # 512KB + 1 byte of valid-typed payload.
    big = b"\x89PNG" + b"\x00" * (512 * 1024)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(user),
            files={"file": ("big.png", big, "image/png")},
        )
    assert r.status_code == 413, r.text


# ── DELETE clears it ───────────────────────────────────────────────────


async def test_delete_avatar_clears(app_and_maker) -> None:
    app, maker = app_and_maker
    user = await _make_user(maker, email="owner@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(user),
            files={"file": ("me.png", PNG_1PX, "image/png")},
        )
        r = await c.delete(
            "/api/workspace/settings/profile/avatar", headers=_auth(user)
        )
        assert r.status_code == 204, r.text

        r2 = await c.get(
            "/api/workspace/settings/profile/avatar", headers=_auth(user)
        )
        assert r2.status_code == 404, r2.text

        r3 = await c.get("/api/workspace/settings", headers=_auth(user))
    assert r3.json()["profile"]["has_avatar"] is False


# ── Admin streaming route (super_admin only) ───────────────────────────


async def test_admin_can_fetch_other_users_avatar(app_and_maker) -> None:
    from app.db.models.users import UserRole

    app, maker = app_and_maker
    admin = await _make_user(
        maker, email="admin@warmpulse.io", role=UserRole.super_admin
    )
    client_user = await _make_user(maker, email="client@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # Client uploads their own avatar.
        await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(client_user),
            files={"file": ("me.png", PNG_1PX, "image/png")},
        )
        # Admin streams it by id.
        r = await c.get(
            f"/api/admin/users/{client_user.id}/avatar", headers=_auth(admin)
        )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.content == PNG_1PX


async def test_admin_avatar_route_requires_super_admin(app_and_maker) -> None:
    app, maker = app_and_maker
    client_user = await _make_user(maker, email="client@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get(
            f"/api/admin/users/{client_user.id}/avatar",
            headers=_auth(client_user),
        )
    assert r.status_code in (401, 403), r.text


async def test_admin_users_list_includes_avatar_url(app_and_maker) -> None:
    from app.db.models.users import UserRole

    app, maker = app_and_maker
    admin = await _make_user(
        maker, email="admin@warmpulse.io", role=UserRole.super_admin
    )
    client_user = await _make_user(maker, email="client@acme.com")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # No avatar yet → avatar_url is None.
        r0 = await c.get("/api/admin/users", headers=_auth(admin))
        assert r0.status_code == 200, r0.text
        rows = {u["email"]: u for u in r0.json()["items"]}
        assert rows["client@acme.com"]["avatar_url"] is None
        # The frontend Joined column reads `joined_at` — it must be present
        # alongside the back-compat `created_at` key.
        assert rows["client@acme.com"]["joined_at"] is not None
        assert (
            rows["client@acme.com"]["joined_at"]
            == rows["client@acme.com"]["created_at"]
        )

        await c.post(
            "/api/workspace/settings/profile/avatar",
            headers=_auth(client_user),
            files={"file": ("me.png", PNG_1PX, "image/png")},
        )
        r1 = await c.get("/api/admin/users", headers=_auth(admin))
    assert r1.status_code == 200, r1.text
    rows = {u["email"]: u for u in r1.json()["items"]}
    assert (
        rows["client@acme.com"]["avatar_url"]
        == f"/api/admin/users/{client_user.id}/avatar"
    )
