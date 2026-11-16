"""LLM provider abstraction.

Single-import entry point for warmup content generation. The concrete
provider is selected at runtime via env (Gemini when ``GEMINI_API_KEY`` is
set, Claude when ``ANTHROPIC_API_KEY`` is set, else no LLM and the engine
falls back to static templates).

See ``content_factory.py`` for the engine-facing factory; this package only
exposes raw providers + types.
"""
from __future__ import annotations

from app.services.llm.provider import (
    LLMError,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    TokenUsage,
)

__all__ = [
    "LLMError",
    "LLMProvider",
    "LLMRequest",
    "LLMResponse",
    "TokenUsage",
]
