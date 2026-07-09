"""LLMProvider Protocol + shared Pydantic types (spec §6).

Providers (Gemini, Claude, mocks) all satisfy the same ``complete`` surface so
downstream callers never branch on which vendor is live. ``LLMError`` carries
``status`` + ``retryable`` so the Celery wrapper knows whether to back off
and retry or fall through to static templates immediately.
"""
from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, Field


class TokenUsage(BaseModel):
    """Token counts returned by the provider after a completion."""

    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class LLMRequest(BaseModel):
    """OpenAI-compatible request envelope (Claude/Gemini are adapted to fit)."""

    messages: list[dict[str, Any]]  # [{role:'system'|'user'|'assistant', content:str}]
    model: str | None = None
    temperature: float = 0.8
    max_tokens: int = 400
    stop: list[str] | None = None


class LLMResponse(BaseModel):
    """Normalized response across providers."""

    content: str
    usage: TokenUsage
    model: str
    finish_reason: str | None = None
    # Provider-specific raw body for debugging. ``raw`` is intentionally a
    # loose dict so we don't have to model every vendor's wrapper fields.
    raw: dict[str, Any] | None = None


class LLMError(Exception):
    """Unified error type. ``retryable=True`` triggers Celery retry."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.retryable = retryable


class LLMProvider(Protocol):
    """Minimal contract. Keep this surface stable — adding methods is a BC break."""

    async def complete(self, request: LLMRequest) -> LLMResponse: ...

    @property
    def name(self) -> str: ...
