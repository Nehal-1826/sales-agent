"""Tests for workspace team / sub-clients / api keys routes."""
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
    from app.db.models.plans import Plan
    from app.db.models.sub_clients import SubClient
    from app.db.models.team_members import TeamMember
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__ for t in (User, Plan, AuditLog, TeamMember, SubClient, ApiKey)
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[tuple[object, async_sessionmaker[AsyncSession]]]:
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


async def _seed_plan(maker, *, name: str, caps: dict) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as s:
        p = Plan(
            name=name,
            price_cents=0,
            max_mailboxes=1,
            daily_email_cap=50,
            token_cap_per_month=0,
            capabilities=caps,
            is_active=True,
        )
        s.add(p)
        await s.commit()
        await s.refresh(p)
        return p.id


async def _make_user(maker, *, email: str, plan_id: uuid.UUID | None = None):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            plan_id=plan_id,
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


# ------------------ team invites ------------------


@pytest.mark.asyncio
async def test_invite_requires_can_invite_capability(app_and_maker) -> None:
    app, maker = app_and_maker
    starter = await _seed_plan(maker, name="Starter", caps={})
    user = await _make_user(maker, email="a@example.com", plan_id=starter)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/team-members",
            json={"invited_email": "b@example.com", "role_in_workspace": "member"},
            headers=_auth(user),
        )
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_invite_creates_pending_row(app_and_maker) -> None:
    app, maker = app_and_maker
    pro = await _seed_plan(maker, name="Pro", caps={"can_invite_team_members": True})
    user = await _make_user(maker, email="owner@example.com", plan_id=pro)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/team-members",
            json={"invited_email": "new@example.com", "role_in_workspace": "member"},
            headers=_auth(user),
        )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["invited_email"] == "new@example.com"
    assert body["accepted_at"] is None


@pytest.mark.asyncio
async def test_accept_invite_sets_accepted_at(app_and_maker) -> None:
    app, maker = app_and_maker
    pro = await _seed_plan(maker, name="Pro", caps={"can_invite_team_members": True})
    owner = await _make_user(maker, email="own@example.com", plan_id=pro)
    invited_email = "invited@example.com"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/team-members",
            json={"invited_email": invited_email, "role_in_workspace": "member"},
            headers=_auth(owner),
        )
        member_id = r.json()["id"]
        # The invited user accepts. We need a user with that email.
        invited_user = await _make_user(maker, email=invited_email)
        r2 = await c.post(
            f"/api/workspace/team-members/{member_id}/accept",
            headers=_auth(invited_user),
        )
    assert r2.status_code == 200, r2.text
    assert r2.json()["accepted_at"] is not None


# ------------------ sub-clients ------------------


@pytest.mark.asyncio
async def test_sub_clients_agency_only(app_and_maker) -> None:
    app, maker = app_and_maker
    starter = await _seed_plan(maker, name="Starter", caps={})
    user = await _make_user(maker, email="s@example.com", plan_id=starter)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/sub-clients", headers=_auth(user))
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_create_sub_client_creates_workspace(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency", caps={"can_create_sub_clients": True})
    user = await _make_user(maker, email="ag@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/sub-clients",
            json={"name": "Acme", "contact_email": "ops@acme.io"},
            headers=_auth(user),
        )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Acme"
    assert body["parent_workspace_id"] == str(user.workspace_id)


# ------------------ api keys ------------------


@pytest.mark.asyncio
async def test_api_key_generated_and_hashed(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency", caps={"can_issue_api_keys": True})
    user = await _make_user(maker, email="k@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/api-keys",
            json={"name": "CI token"},
            headers=_auth(user),
        )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["key"].startswith("wp_live_")
    assert body["prefix"].startswith("wp_live_")
    assert len(body["key"]) > 30
    # Confirm hash lives in DB and raw does not match plaintext.
    from sqlalchemy import select

    from app.db.models.api_keys import ApiKey

    async with maker() as s:
        row = (await s.execute(select(ApiKey))).scalars().one()
        assert row.key_hash != body["key"]
        assert "wp_live_" not in row.key_hash  # bcrypt-format hash


@pytest.mark.asyncio
async def test_api_key_raw_never_returned_on_list(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency", caps={"can_issue_api_keys": True})
    user = await _make_user(maker, email="kk@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        await c.post(
            "/api/workspace/api-keys",
            json={"name": "CI token"},
            headers=_auth(user),
        )
        r = await c.get("/api/workspace/api-keys", headers=_auth(user))
    assert r.status_code == 200
    for item in r.json():
        assert "key" not in item
        assert "key_hash" not in item
        assert item["masked"].endswith("***")


@pytest.mark.asyncio
async def test_revoke_api_key_sets_revoked_at(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency", caps={"can_issue_api_keys": True})
    user = await _make_user(maker, email="rev@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        create = await c.post(
            "/api/workspace/api-keys",
            json={"name": "temp"},
            headers=_auth(user),
        )
        key_id = create.json()["id"]
        revoke = await c.delete(
            f"/api/workspace/api-keys/{key_id}", headers=_auth(user)
        )
        assert revoke.status_code == 204
        listed = await c.get("/api/workspace/api-keys", headers=_auth(user))
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["revoked_at"] is not None
