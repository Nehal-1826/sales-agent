"""Pytest fixtures.

Unit tests use in-memory SQLite via aiosqlite so they don't require Postgres.
Integration tests that need enum types or Postgres-specific features can be
marked with ``@pytest.mark.integration`` and skipped here.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure any imported settings pick up test-safe values before they're cached.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod")
os.environ.setdefault("APP_ENV", "test")
# Tests exercise real SMTP/IMAP/DNS code paths (via mocks) — keep the dummy
# bypass off so the patched dependencies actually fire. Production / dev
# default this to True; tests override here.
os.environ.setdefault("MAILBOX_PROBES_DUMMY", "false")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Fresh in-memory SQLite database per test, with all tables created."""
    # Lazy imports so env vars above take effect before anything touches settings.
    from app.db import models  # noqa: F401  — register models on Base.metadata
    from app.db.base import Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """httpx AsyncClient bound to the FastAPI app via ASGI transport."""
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"
