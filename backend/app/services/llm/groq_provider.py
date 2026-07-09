"""GroqProvider — Groq OpenAI-compatible Chat Completions client.

Groq exposes an OpenAI-compatible endpoint at
``{base_url}/chat/completions`` with ``Authorization: Bearer <key>``. We map
the shared ``LLMRequest`` straight onto the OpenAI body shape and read
``choices[0].message.content`` + ``usage`` back out.

Used as the free fallback when Gemini is rate-limited (429) or unconfigured.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.services.llm.provider import (
    LLMError,
    LLMRequest,
    LLMResponse,
    TokenUsage,
)

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BASE_BACKOFF_SECONDS = 0.5
_TIMEOUT_SECONDS = 30.0
_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"


class GroqProvider:
    """Implements ``LLMProvider`` against Groq's OpenAI-compatible API."""

    def __init__(self, *, api_key: str, default_model: str, base_url: str | None = None):
        if not api_key:
            raise LLMError("GroqProvider requires an API key", retryable=False)
        self._api_key = api_key
        self._default_model = default_model
        self._base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")

    @property
    def name(self) -> str:
        return "groq"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self._default_model
        url = f"{self._base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self._api_key}"}
        body: dict[str, Any] = {
            "model": model,
            # Groq accepts OpenAI-style messages verbatim (system/user/assistant).
            "messages": request.messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            **({"stop": request.stop} if request.stop else {}),
        }

        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                    resp = await client.post(url, json=body, headers=headers)
                if resp.status_code >= 500 or resp.status_code == 429:
                    if attempt < _MAX_RETRIES - 1:
                        wait = _BASE_BACKOFF_SECONDS * (2 ** attempt)
                        logger.warning(
                            "groq retry: status=%s attempt=%s wait=%.2fs",
                            resp.status_code, attempt + 1, wait,
                        )
                        await asyncio.sleep(wait)
                        continue
                    raise LLMError(
                        f"Groq {resp.status_code}: {resp.text[:200]}",
                        status=resp.status_code,
                        retryable=True,
                    )
                if resp.status_code >= 400:
                    raise LLMError(
                        f"Groq {resp.status_code}: {resp.text[:200]}",
                        status=resp.status_code,
                        retryable=False,
                    )
                return self._parse_response(resp.json(), model)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < _MAX_RETRIES - 1:
                    wait = _BASE_BACKOFF_SECONDS * (2 ** attempt)
                    logger.warning("groq network retry: %s wait=%.2fs", exc, wait)
                    await asyncio.sleep(wait)
                    continue
                raise LLMError(f"Groq network error: {exc}", retryable=True) from exc
        raise LLMError("Groq exhausted retries", retryable=True) from last_exc

    @staticmethod
    def _parse_response(raw: dict[str, Any], model: str) -> LLMResponse:
        choices = raw.get("choices") or []
        text = ""
        finish_reason: str | None = None
        if choices:
            c0 = choices[0]
            finish_reason = c0.get("finish_reason")
            text = ((c0.get("message") or {}).get("content")) or ""
        usage = raw.get("usage") or {}
        return LLMResponse(
            content=text,
            usage=TokenUsage(
                prompt_tokens=int(usage.get("prompt_tokens", 0)),
                completion_tokens=int(usage.get("completion_tokens", 0)),
            ),
            model=raw.get("model", model),
            finish_reason=finish_reason,
            raw=raw,
        )
