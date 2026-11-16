"""LlmContentGenerator — LLM-backed warmup content with static fallback.

Implements the ``ContentGenerator`` Protocol (same shape as
``StaticTemplateGenerator``). Behavior:

* Mode A / D — plain 2-4 sentence conversational email
* Mode B     — branded HTML (colored header band + body + plain signature)
* Mode C     — random 50/50 pick of A or B per call

On any non-retryable ``LLMError`` OR ``hard_cap``, the generator silently
falls back to the injected static generator so the caller never sees an
exception — it just gets a slightly duller email. Retryable errors
propagate; the Celery task layer decides whether to retry.
"""
from __future__ import annotations

import logging
import random
import uuid
from typing import Any

from app.services.llm.provider import LLMError, LLMProvider, LLMRequest
from app.services.llm.usage_tracker import check_cap, record_usage
from app.services.warmup.content import ContentGenerator, StaticTemplateGenerator

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_A = (
    "Write a plain, human email. No marketing language, no calls to action, "
    "no links, no emojis. 2-4 sentences. Casual colleague tone. "
    "Put the subject on the very first line prefixed 'Subject: ', then a "
    "blank line, then the body."
)
_SYSTEM_PROMPT_B = (
    "Write a short email with minimal branded HTML. Structure: one colored "
    "header band (hex #2563eb), body text in paragraph tags, a plain text "
    "signature. No marketing language, no links, no emojis. 2-4 sentences. "
    "Put the subject on the very first line prefixed 'Subject: ', then a "
    "blank line, then the HTML body."
)


class LlmContentGenerator:
    """Generates warmup thread content via an injected ``LLMProvider``.

    Kept thin: heavy lifting lives in the provider and the static fallback.
    """

    def __init__(
        self,
        *,
        provider: LLMProvider,
        settings,
        fallback: ContentGenerator | None = None,
    ) -> None:
        self.provider = provider
        self.settings = settings
        self.fallback = fallback or StaticTemplateGenerator()

    async def generate_thread_message(
        self,
        mode: str,
        prior_messages: list[str],
        sender_name: str,
        recipient_name: str,
        *,
        db: Any = None,
        user_id: uuid.UUID | None = None,
        mailbox_id: uuid.UUID | None = None,
        user: Any = None,
        plan: Any = None,
    ) -> dict:
        resolved_mode = self._resolve_mode(mode)

        # Cap check first — avoid a paid call we can't charge.
        if db is not None and user is not None and plan is not None:
            bucket = await check_cap(db, user, plan)
            if bucket == "hard_cap":
                logger.info("llm.hard_cap user=%s falling back to static", user_id)
                return await self.fallback.generate_thread_message(
                    resolved_mode, prior_messages, sender_name, recipient_name
                )

        system = self._build_system_prompt(resolved_mode)
        user_msg = self._build_user_prompt(
            prior_messages, sender_name, recipient_name, resolved_mode
        )
        req = LLMRequest(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            model=self._provider_model(),
            temperature=0.9,
            max_tokens=400,
        )
        try:
            resp = await self.provider.complete(req)
        except LLMError as exc:
            # If a live provider is next in the chain (e.g. Groq behind a
            # rate-limited Gemini), drop to it immediately rather than retrying
            # this provider — that's the whole point of the fallback chain.
            if isinstance(self.fallback, LlmContentGenerator):
                logger.warning(
                    "llm.%s status=%s falling back to %s",
                    self.provider.name, exc.status, self.fallback.provider.name,
                )
                return await self.fallback.generate_thread_message(
                    resolved_mode, prior_messages, sender_name, recipient_name,
                    db=db, user_id=user_id, mailbox_id=mailbox_id, user=user, plan=plan,
                )
            if exc.retryable:
                raise  # only static remains — let the Celery wrapper retry
            logger.warning("llm.non_retryable status=%s falling back", exc.status)
            return await self.fallback.generate_thread_message(
                resolved_mode, prior_messages, sender_name, recipient_name
            )

        if db is not None and user_id is not None:
            await record_usage(
                db,
                user_id=user_id,
                mailbox_id=mailbox_id,
                mode=resolved_mode,
                usage=resp.usage,
                settings=self.settings,
            )

        return self._parse_response(resp.content, resolved_mode)

    # --------------------------- internals ---------------------------------

    def _provider_model(self) -> str:
        """Pick the model name from settings keyed off the provider's name.

        Falls back to whatever default the provider was constructed with by
        returning an empty string (the provider treats empty as 'use default').
        """
        name = getattr(self.provider, "name", "")
        if name == "gemini":
            return getattr(self.settings, "gemini_model", "")
        if name == "claude":
            return getattr(self.settings, "anthropic_model", "")
        return ""

    @staticmethod
    def _resolve_mode(mode: str | None) -> str:
        normalized = (mode or "A").upper()
        if normalized == "C":
            return random.choice(["A", "B"])
        if normalized not in ("A", "B", "D"):
            return "A"
        return normalized

    @staticmethod
    def _build_system_prompt(mode: str) -> str:
        if mode == "B":
            return _SYSTEM_PROMPT_B
        # A and D share the plain system prompt.
        return _SYSTEM_PROMPT_A

    @staticmethod
    def _build_user_prompt(
        prior: list[str],
        sender: str,
        recipient: str,
        mode: str,
    ) -> str:
        continuation = bool(prior)
        bits = [
            f"Sender first name: {sender or 'Alex'}",
            f"Recipient first name: {recipient or 'Jordan'}",
            "New thread." if not continuation else "This is a reply in an ongoing thread.",
        ]
        if continuation:
            last = prior[-1][:400]
            bits.append(f"Prior message tail: {last}")
        bits.append(
            "Write an email. Keep it generic — no specific dates, companies, or projects."
        )
        return "\n".join(bits)

    @staticmethod
    def _parse_response(content: str, mode: str) -> dict:
        """Extract ``Subject:`` line; rest is the body."""
        text = content.strip()
        subject = ""
        body = text
        lines = text.splitlines()
        if lines:
            first = lines[0].strip()
            if first.lower().startswith("subject:"):
                subject = first.split(":", 1)[1].strip()
                body = "\n".join(lines[1:]).lstrip("\n").strip()
        if not subject:
            subject = "quick note"
        is_html = mode == "B"
        return {"subject": subject, "body_text": body, "is_html": is_html}
