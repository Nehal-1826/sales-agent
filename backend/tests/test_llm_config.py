"""Tests for ``resolve_llm_keys`` — admin-saved LLM key wins over env.

The admin Settings → AI Provider card persists a Fernet-encrypted key in
``app_settings['llm'].api_key_encrypted``. The resolver must prefer it over
``settings.gemini_api_key``, and fall back to env on any missing/undecryptable
value. conftest seeds FERNET_KEY so ``get_fernet_service`` works.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.app_settings import AppSetting
from app.services.crypto import get_fernet_service
from app.services.llm.llm_config import resolve_llm_keys


class _Settings:
    gemini_api_key = "env-gemini-key"
    gemini_model = "gemini-flash-latest"
    gemini_base_url = "https://example.test"
    anthropic_api_key = "env-anthropic-key"
    anthropic_model = "claude-sonnet-4-5"


@pytest_asyncio.fixture
async def maker() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(AppSetting.metadata.create_all, tables=[AppSetting.__table__])
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def _seed_llm(session: AsyncSession, value: dict) -> None:
    session.add(AppSetting(key="llm", value=value, updated_at=datetime.now(UTC)))
    await session.commit()


async def test_admin_key_overrides_env(maker) -> None:
    async with maker() as session:
        enc = get_fernet_service().encrypt(b"admin-saved-key").decode()
        await _seed_llm(session, {"api_key_encrypted": enc, "api_key_tail": "-key"})

        resolved = await resolve_llm_keys(session, _Settings())

    assert resolved.gemini_api_key == "admin-saved-key"
    # Models / base url / anthropic still come from env.
    assert resolved.gemini_model == "gemini-flash-latest"
    assert resolved.gemini_base_url == "https://example.test"
    assert resolved.anthropic_api_key == "env-anthropic-key"


async def test_falls_back_to_env_when_no_row(maker) -> None:
    async with maker() as session:
        resolved = await resolve_llm_keys(session, _Settings())
    assert resolved.gemini_api_key == "env-gemini-key"


async def test_falls_back_to_env_when_empty_encrypted(maker) -> None:
    async with maker() as session:
        await _seed_llm(session, {"api_key_encrypted": None, "api_key_tail": ""})
        resolved = await resolve_llm_keys(session, _Settings())
    assert resolved.gemini_api_key == "env-gemini-key"


async def test_falls_back_to_env_on_bad_ciphertext(maker) -> None:
    async with maker() as session:
        await _seed_llm(session, {"api_key_encrypted": "garbage-not-a-token"})
        resolved = await resolve_llm_keys(session, _Settings())
    assert resolved.gemini_api_key == "env-gemini-key"
