"""Single source of truth for the engine's LLM API keys at runtime.

The admin **Settings → AI Provider** card persists a Fernet-encrypted key in
``app_settings`` (row key=``'llm'``, field ``api_key_encrypted``). That key
must take precedence over the ``GEMINI_API_KEY`` / ``ANTHROPIC_API_KEY`` env
vars so the card is the operator's single point of control; env is the
fallback.

``resolve_llm_keys`` reads the DB once and returns a ``ResolvedLlm`` the
provider-selection sites build their provider from. The admin card stores one
provider-agnostic key — we treat it as the **Gemini** key (Gemini is the
engine's first-choice provider). Model names and base URLs always come from
env settings. The resolver never raises: any error falls back to env values.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.app_settings import AppSetting

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResolvedLlm:
    gemini_api_key: str
    gemini_model: str
    gemini_base_url: str
    anthropic_api_key: str
    anthropic_model: str
    groq_api_key: str
    groq_model: str
    groq_base_url: str


async def resolve_llm_keys(session: AsyncSession, settings) -> ResolvedLlm:
    """Resolve effective LLM keys: admin-saved DB key wins over env.

    The admin card's key (decrypted from ``app_settings['llm']``) is used as
    the Gemini key when present and decryptable; otherwise we fall back to
    ``settings.gemini_api_key``. Model names / base URLs / the Anthropic key
    always come from env settings.
    """
    gemini_api_key = getattr(settings, "gemini_api_key", "") or ""

    try:
        row = (
            await session.execute(
                select(AppSetting).where(AppSetting.key == "llm")
            )
        ).scalar_one_or_none()
        stored = (row.value or {}).get("api_key_encrypted") if row else None
        if stored:
            from app.services.crypto import get_fernet_service

            decrypted = get_fernet_service().decrypt(stored.encode()).decode()
            if decrypted:
                gemini_api_key = decrypted
    except Exception as exc:  # noqa: BLE001 — never break the engine on key resolution
        logger.warning("resolve_llm_keys: falling back to env (%s)", exc)

    return ResolvedLlm(
        gemini_api_key=gemini_api_key,
        gemini_model=getattr(settings, "gemini_model", ""),
        gemini_base_url=getattr(settings, "gemini_base_url", ""),
        anthropic_api_key=getattr(settings, "anthropic_api_key", "") or "",
        anthropic_model=getattr(settings, "anthropic_model", "claude-sonnet-4-5"),
        groq_api_key=getattr(settings, "groq_api_key", "") or "",
        groq_model=getattr(settings, "groq_model", "llama-3.3-70b-versatile"),
        groq_base_url=getattr(settings, "groq_base_url", "https://api.groq.com/openai/v1"),
    )
