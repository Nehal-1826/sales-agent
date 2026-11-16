"""ClaudeProvider — optional swap target using anthropic SDK.

Not wired by default. If ``ANTHROPIC_API_KEY`` is empty OR the ``anthropic``
package isn't installed, calling ``complete`` raises ``NotImplementedError``.
The import of ``anthropic`` is deferred to inside ``complete`` so this module
remains importable on installations that haven't added the optional dep.
"""
from __future__ import annotations

import logging

from app.services.llm.provider import (
    LLMError,
    LLMRequest,
    LLMResponse,
    TokenUsage,
)

logger = logging.getLogger(__name__)


class ClaudeProvider:
    """Stub-friendly Anthropic provider. Real calls only when key + sdk present."""

    def __init__(self, *, api_key: str | None = None, default_model: str = "claude-sonnet-4-5") -> None:
        self._api_key = api_key or ""
        self._default_model = default_model

    @property
    def name(self) -> str:
        return "claude"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        if not self._api_key:
            raise NotImplementedError("Claude provider not configured")
        try:
            import anthropic  # type: ignore[import-not-found]
        except ImportError as exc:
            raise NotImplementedError(
                "anthropic package not installed; add to deps to enable Claude provider"
            ) from exc

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        model = request.model or self._default_model

        # Anthropic messages API separates system prompt from role messages.
        system_parts: list[str] = []
        chat_messages: list[dict[str, str]] = []
        for msg in request.messages:
            role = msg.get("role")
            content = msg.get("content", "")
            if role == "system":
                system_parts.append(content)
            elif role in ("user", "assistant"):
                chat_messages.append({"role": role, "content": content})
            else:
                chat_messages.append({"role": "user", "content": content})

        try:
            resp = await client.messages.create(
                model=model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                system="\n\n".join(system_parts) if system_parts else None,
                messages=chat_messages,
            )
        except Exception as exc:  # noqa: BLE001 — wrap SDK errors uniformly
            retryable = "rate" in str(exc).lower() or "overloaded" in str(exc).lower()
            raise LLMError(f"claude error: {exc}", retryable=retryable) from exc

        text = ""
        for block in getattr(resp, "content", []) or []:
            text += getattr(block, "text", "") or ""
        usage = TokenUsage(
            prompt_tokens=getattr(resp.usage, "input_tokens", 0),
            completion_tokens=getattr(resp.usage, "output_tokens", 0),
        )
        logger.info(
            "claude.complete model=%s prompt_tokens=%d completion_tokens=%d",
            model,
            usage.prompt_tokens,
            usage.completion_tokens,
        )
        return LLMResponse(
            content=text,
            usage=usage,
            model=getattr(resp, "model", model),
            finish_reason=getattr(resp, "stop_reason", None),
            raw=None,
        )
