"""Async SQLAlchemy engine + session factory + FastAPI dependency."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

_settings = get_settings()

# Pool tuning only applies to "real" pool dialects (Postgres etc.). SQLite via
# aiosqlite uses StaticPool which doesn't accept pool_size/max_overflow — so
# guard the kwargs to keep the test suite (in-memory SQLite) working.
_engine_kwargs: dict[str, Any] = {
    "echo": False,
    "pool_pre_ping": True,
    "future": True,
}
if not _settings.database_url.startswith("sqlite"):
    # Admin dashboard pages fan out 4–6 parallel queries on mount; default
    # pool_size=5 serialises the tail. 20 + 30 overflow lets everything run
    # concurrently without ballooning idle PG connections. Recycle idle
    # connections every 30 min so the pool doesn't accumulate zombies that
    # fail pre_ping under Windows socket-buffer churn.
    _engine_kwargs["pool_size"] = 20
    _engine_kwargs["max_overflow"] = 30
    _engine_kwargs["pool_recycle"] = 1800

engine = create_async_engine(_settings.database_url, **_engine_kwargs)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async session that auto-closes on request end."""
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
