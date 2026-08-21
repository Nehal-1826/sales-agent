"""Tests for the public (unauthenticated) add-on listing: GET /api/addons.

Covers:
  - active add-ons only (inactive rows never leak), correct public shape
    (id/key/name/description/price_cents/price_display — no owned/admin fields)
  - empty catalogue → empty list (never 500 / never null)

Harness mirrors tests/test_julex_integration.py — in-memory SQLite with an
explicit table list (addons only; the route touches nothing else) and
``get_db`` overridden at the app level.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# Harness (mirrors tests/test_julex_integration.py)                           #
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


async def _setup_db():
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.addons import Addon

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (Addon,)]
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


async def _seed_addons(maker) -> None:
    from app.db.models.addons import Addon

    async with maker() as session:
        session.add_all(
            [
                Addon(
                    key="julex_mail",
                    name="Store Mailbox — Julex",
                    description="Professional mailbox with AI warmup for your Julex store domain.",
                    price_cents=29900,
                    is_active=True,
                    sort_order=20,
                ),
                Addon(
                    key="retired_pack",
                    name="Retired Pack",
                    description="must never leak to the public listing",
                    price_cents=9900,
                    is_active=False,
                    sort_order=30,
                ),
            ]
        )
        await session.commit()


# --------------------------------------------------------------------------- #
# GET /api/addons (public, no auth)                                            #
# --------------------------------------------------------------------------- #


async def test_public_addons_active_only_no_auth(app_and_maker) -> None:
    app, maker = app_and_maker
    await _seed_addons(maker)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/addons")  # deliberately NO auth header
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list) and len(body) == 1

    addon = body[0]
    assert set(addon.keys()) == {
        "id",
        "key",
        "name",
        "description",
        "price_cents",
        "price_display",
    }
    assert addon["key"] == "julex_mail"
    assert addon["name"] == "Store Mailbox — Julex"
    assert addon["price_cents"] == 29900
    assert addon["price_display"] == "₹299"
    assert isinstance(addon["id"], str) and len(addon["id"]) == 36  # uuid str


async def test_public_addons_empty_catalog_returns_empty_list(app_and_maker) -> None:
    app, maker = app_and_maker
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/addons")
    assert r.status_code == 200, r.text
    assert r.json() == []
