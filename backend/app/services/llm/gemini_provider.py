"""GeminiProvider — Google Generative Language API client.

Uses the REST endpoint ``/v1beta/models/{model}:generateContent`` with the API
key passed as ``?key=...`` query param (Google's standard auth for this API;
no bearer header).

Maps OpenAI-style ``messages`` to Gemini's ``contents`` shape:
- system messages become a ``system_instruction`` block
- user/assistant messages become ``contents[].role = user|model`` with text parts

Returns usage via ``usageMetadata`` when present.
"""
from __future__ import annotations

import asyncio
import logging
import re
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
_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _redact_key(url: str) -> str:
    return re.sub(r"key=[^&]+", "key=***", url)


class GeminiProvider:
    """Implements ``LLMProvider`` against Google's Gemini API."""

    def __init__(self, *, api_key: str, default_model: str, base_url: str | None = None):
        if not api_key:
            raise LLMError("GeminiProvider requires an API key", retryable=False)
        self._api_key = api_key
        self._default_model = default_model
        self._base_url = (base_url or _DEFAULT_BASE_URL).rstrip("/")

    @property
    def name(self) -> str:
        return "gemini"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self._default_model
        url = f"{self._base_url}/models/{model}:generateContent?key={self._api_key}"
        body = self._build_body(request)

        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                    resp = await client.post(url, json=body)
                if resp.status_code >= 500 or resp.status_code == 429:
                    retry_after = self._parse_retry_after(resp)
                    if attempt < _MAX_RETRIES - 1:
                        wait = retry_after or _BASE_BACKOFF_SECONDS * (2 ** attempt)
                        logger.warning(
                            "gemini retry: status=%s attempt=%s wait=%.2fs url=%s",
                            resp.status_code, attempt + 1, wait, _redact_key(url),
                        )
                        await asyncio.sleep(wait)
                        continue
                    raise LLMError(
                        f"Gemini {resp.status_code}: {resp.text[:200]}",
                        status=resp.status_code,
                        retryable=True,
                    )
                if resp.status_code >= 400:
                    raise LLMError(
                        f"Gemini {resp.status_code}: {resp.text[:200]}",
                        status=resp.status_code,
                        retryable=False,
                    )
                return self._parse_response(resp.json(), model)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < _MAX_RETRIES - 1:
                    wait = _BASE_BACKOFF_SECONDS * (2 ** attempt)
                    logger.warning("gemini network retry: %s wait=%.2fs", exc, wait)
                    await asyncio.sleep(wait)
                    continue
                raise LLMError(f"Gemini network error: {exc}", retryable=True) from exc
        raise LLMError("Gemini exhausted retries", retryable=True) from last_exc

    @staticmethod
    def _parse_retry_after(resp: httpx.Response) -> float | None:
        ra = resp.headers.get("retry-after")
        if not ra:
            return None
        try:
            return float(ra)
        except ValueError:
            return None

    @staticmethod
    def _build_body(request: LLMRequest) -> dict[str, Any]:
        contents: list[dict[str, Any]] = []
        system_text: list[str] = []
        for msg in request.messages:
            role = msg.get("role")
            content = msg.get("content", "")
            if role == "system":
                system_text.append(str(content))
            elif role in ("user", "assistant"):
                contents.append({
                    "role": "user" if role == "user" else "model",
                    "parts": [{"text": str(content)}],
                })
        body: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
                # Gemini 2.5 flash models "think" by default, which silently
                # eats the maxOutputTokens budget and truncates short replies to
                # a greeting. We don't need chain-of-thought for email copy, so
                # disable it. (flash / flash-latest / flash-lite / 2.0-flash all
                # accept thinkingBudget=0.)
                "thinkingConfig": {"thinkingBudget": 0},
                **({"stopSequences": request.stop} if request.stop else {}),
            },
        }
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_text)}]}
        return body

    @staticmethod
    def _parse_response(raw: dict[str, Any], model: str) -> LLMResponse:
        candidates = raw.get("candidates") or []
        text = ""
        finish_reason: str | None = None
        if candidates:
            c0 = candidates[0]
            finish_reason = c0.get("finishReason")
            parts = (c0.get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts)
        usage_meta = raw.get("usageMetadata") or {}
        return LLMResponse(
            content=text,
            usage=TokenUsage(
                prompt_tokens=int(usage_meta.get("promptTokenCount", 0)),
                completion_tokens=int(usage_meta.get("candidatesTokenCount", 0)),
            ),
            model=model,
            finish_reason=finish_reason,
            raw=raw,
        )
