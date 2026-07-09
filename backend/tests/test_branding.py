"""Tests for the white-label workspace branding routes/service."""
from __future__ import annotations

import struct
import uuid
import zlib
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
    from app.db.models.audit_logs import AuditLog
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.workspace_branding import WorkspaceBranding

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__ for t in (User, Plan, AuditLog, WorkspaceBranding)
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


def _tiny_png() -> bytes:
    """Build a minimal valid PNG (1×1 transparent pixel)."""
    sig = b"\x89PNG\r\n\x1a\n"

    def _chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = _chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
    raw = b"\x00\x00\x00\x00\x00"  # filter byte + RGBA(0,0,0,0)
    idat = _chunk(b"IDAT", zlib.compress(raw))
    iend = _chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_branding_returns_defaults_for_workspace_without_row(
    app_and_maker,
) -> None:
    app, maker = app_and_maker
    pro = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="x@example.com", plan_id=pro)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/branding", headers=_auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["brand_name"] == "WarmPulse"
    assert body["accent_color"] == "#F26522"
    assert body["footer_text"] == "Powered by WarmPulse"
    assert body["has_logo"] is False
    assert body["is_inherited"] is False


@pytest.mark.asyncio
async def test_get_branding_inherits_from_parent_workspace(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    parent = await _make_user(maker, email="agency@example.com", plan_id=agency)
    # Create the parent branding row directly.
    from app.db.models.workspace_branding import WorkspaceBranding

    async with maker() as s:
        s.add(
            WorkspaceBranding(
                workspace_id=parent.workspace_id,
                brand_name="Acme Agency",
                accent_color="#ff00aa",
                footer_text="Powered by Acme",
            )
        )
        await s.commit()

    # Sub-client user lives in a different workspace whose branding row points
    # at the parent. Plan doesn't matter for read.
    child = await _make_user(maker, email="sub@acme.io", plan_id=agency)
    async with maker() as s:
        s.add(
            WorkspaceBranding(
                workspace_id=child.workspace_id,
                parent_workspace_id=parent.workspace_id,
            )
        )
        await s.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/workspace/branding", headers=_auth(child))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["brand_name"] == "Acme Agency"
    assert body["accent_color"] == "#ff00aa"
    assert body["footer_text"] == "Powered by Acme"
    assert body["is_inherited"] is True


@pytest.mark.asyncio
async def test_patch_branding_requires_agency_tier_returns_402(
    app_and_maker,
) -> None:
    app, maker = app_and_maker
    pro = await _seed_plan(maker, name="Pro")
    user = await _make_user(maker, email="pro@example.com", plan_id=pro)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.patch(
            "/api/workspace/branding",
            json={"brand_name": "Should Fail"},
            headers=_auth(user),
        )
    assert r.status_code == 402, r.text
    assert "Agency" in r.json()["detail"]


@pytest.mark.asyncio
async def test_upload_logo_rejects_oversize_file(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="ag@example.com", plan_id=agency)
    # 1.5 MB blob — PNG magic bytes so MIME sniff passes, then size check fails.
    huge = b"\x89PNG" + b"\x00" * (1_500_000)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/branding/logo",
            files={"logo": ("logo.png", huge, "image/png")},
            headers=_auth(user),
        )
    assert r.status_code == 400, r.text


@pytest.mark.asyncio
async def test_upload_logo_accepts_valid_png_and_stores_blob(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="ag2@example.com", plan_id=agency)
    png = _tiny_png()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/branding/logo",
            files={"logo": ("logo.png", png, "image/png")},
            headers=_auth(user),
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"success": True}

        r2 = await c.get("/api/workspace/branding/logo", headers=_auth(user))
    assert r2.status_code == 200, r2.text
    assert r2.headers["content-type"].startswith("image/png")
    assert r2.content == png


@pytest.mark.asyncio
async def test_svg_with_script_is_rejected(app_and_maker) -> None:
    app, maker = app_and_maker
    agency = await _seed_plan(maker, name="Agency")
    user = await _make_user(maker, email="svg@example.com", plan_id=agency)
    bad_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/workspace/branding/logo",
            files={"logo": ("logo.svg", bad_svg, "image/svg+xml")},
            headers=_auth(user),
        )
    assert r.status_code == 400, r.text
