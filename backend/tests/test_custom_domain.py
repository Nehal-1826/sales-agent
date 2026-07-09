"""Tests for the Agency-tier custom-domain routes/service."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

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
    from app.db.models.audit_logs import AuditLog
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.workspace_custom_domains import WorkspaceCustomDomain

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, AuditLog, WorkspaceCustomDomain)]
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


async def _seed_plan(maker, *, name: str) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as s:
        p = Plan(
            name=name, price_cents=0, max_mailboxes=1,
            daily_email_cap=50, token_cap_per_month=0,
            capabilities={}, is_active=True,
        )
        s.add(p)
        await s.commit()
        await s.refresh(p)
        return p.id


async def _make_user(
    maker, *, email: str, plan_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
):
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=workspace_id or uuid.uuid4(),
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


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_start_requires_agency_tier_returns_402(app_and_maker) -> None:
    app, maker = app_and_maker
    pro = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="pro@example.com", plan_id=pro)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/custom-domain",
            json={"domain": "clients.acme.com"},
            headers=_auth(user),
        )
    assert r.status_code == 402, r.text
    assert "Agency" in r.json()["detail"]


@pytest.mark.asyncio
async def test_start_rejects_invalid_domain_format(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="ag@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    bad = ["not a domain", "localhost", "warmpulse.io", "*.acme.com"]
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        for d in bad:
            r = await c.post(
                "/api/workspace/custom-domain",
                json={"domain": d},
                headers=_auth(user),
            )
            assert r.status_code == 400, f"{d!r} → {r.status_code} {r.text}"


@pytest.mark.asyncio
async def test_start_rejects_duplicate_domain_with_409(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user_a = await _make_user(maker, email="a@example.com", plan_id=agency)
    user_b = await _make_user(maker, email="b@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/custom-domain",
            json={"domain": "clients.acme.com"},
            headers=_auth(user_a),
        )
        assert r.status_code == 200, r.text
        r2 = await c.post(
            "/api/workspace/custom-domain",
            json={"domain": "clients.acme.com"},
            headers=_auth(user_b),
        )
    assert r2.status_code == 409, r2.text
    assert "already registered" in r2.json()["detail"].lower()


class _FakeTxtRdata:
    def __init__(self, value: str) -> None:
        self.strings = (value.encode("utf-8"),)


@pytest.mark.asyncio
async def test_verify_succeeds_with_valid_txt_record(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="ag2@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/custom-domain",
            json={"domain": "clients.acme.com"},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text
        code = r.json()["verification_code"]

        async def fake_resolve(name, rdtype, *args, **kwargs):
            assert rdtype == "TXT"
            return [_FakeTxtRdata(f"warmpulse-verify-{code}")]

        with patch(
            "dns.asyncresolver.resolve", new=AsyncMock(side_effect=fake_resolve)
        ):
            r2 = await c.post(
                "/api/workspace/custom-domain/verify",
                headers=_auth(user),
            )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["verified"] is True
    assert body["status"] == "verified"
    assert body["verification_method"] == "txt"


@pytest.mark.asyncio
async def test_verify_fails_with_clear_reason_when_no_record(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="ag3@example.com", plan_id=agency)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/custom-domain",
            json={"domain": "clients.acme.com"},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text

        import dns.resolver

        try:
            no_answer_exc: Exception = dns.resolver.NoAnswer()
        except TypeError:
            # Newer dnspython requires a response kwarg; fall back to a stub.
            no_answer_exc = type("NoAnswer", (Exception,), {})()

        async def fake_resolve(name, rdtype, *args, **kwargs):
            raise no_answer_exc

        with patch(
            "dns.asyncresolver.resolve", new=AsyncMock(side_effect=fake_resolve)
        ):
            r2 = await c.post(
                "/api/workspace/custom-domain/verify",
                headers=_auth(user),
            )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["verified"] is False
    assert body["status"] == "failed"
    assert body["last_check_error"]
    assert "NoAnswer" in body["last_check_error"] or "No matching" in body["last_check_error"]
