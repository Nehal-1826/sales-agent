"""AI email generation for CRM sequences.

Used in two places:

* **Build-time draft** — the "Generate with AI" button in the step editor;
  the user gives a prompt, we return a ``(subject, body)`` they can edit.
* **Per-lead send** — a step in ``ai`` mode generates a fresh email for each
  lead at send time from its ``ai_prompt`` + the lead's data.

Provider selection mirrors ``content_factory`` (Gemini → Claude). When no key
is configured (or the call fails) generation returns ``None`` so callers fall
back to deterministic copy — the engine never blocks on the LLM.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.services.llm.claude_provider import ClaudeProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.provider import LLMError, LLMRequest, TokenUsage

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You write short, friendly B2B cold-outreach emails that land in the inbox. "
    "Keep it under 120 words, plain text (no markdown, no HTML), one clear ask, "
    "no spammy phrasing or ALL CAPS. Use the recipient context provided. "
    "Output the subject on the very first line prefixed exactly 'Subject: ', "
    "then a blank line, then the email body."
)


@dataclass
class GeneratedEmail:
    subject: str
    body: str
    usage: TokenUsage | None = None


# Healthy Gemini fallbacks tried in order — a single model's free-tier daily
# quota (429) or transient overload (503) shouldn't break generation. The
# configured model is tried first, then these.
_GEMINI_FALLBACKS = (
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
)


def get_provider(
    settings,
    *,
    gemini_api_key: str | None = None,
    anthropic_api_key: str | None = None,
) -> tuple[Any | None, list[str]]:
    """Return ``(provider, [models to try in order])``, or ``(None, [])``.

    ``gemini_api_key`` / ``anthropic_api_key`` override the env keys when not
    ``None`` (admin-card key wins). Model names always come from ``settings``.
    """
    gemini_key = (
        gemini_api_key
        if gemini_api_key is not None
        else getattr(settings, "gemini_api_key", "")
    )
    anthropic_key = (
        anthropic_api_key
        if anthropic_api_key is not None
        else getattr(settings, "anthropic_api_key", "")
    )
    if gemini_key:
        models: list[str] = []
        for m in (settings.gemini_model, *_GEMINI_FALLBACKS):
            if m and m not in models:
                models.append(m)
        return (
            GeminiProvider(
                api_key=gemini_key,
                default_model=settings.gemini_model,
                base_url=settings.gemini_base_url,
            ),
            models,
        )
    if anthropic_key:
        model = getattr(settings, "anthropic_model", "claude-sonnet-4-5")
        return (
            ClaudeProvider(api_key=anthropic_key, default_model=model),
            [model],
        )
    return (None, [])


def _parse_subject_body(content: str) -> tuple[str, str]:
    """Split 'Subject: ...\\n\\n body' into (subject, body), tolerating drift."""
    text = (content or "").strip()
    subject = ""
    body = text
    lines = text.splitlines()
    if lines and lines[0].lower().startswith("subject:"):
        subject = lines[0].split(":", 1)[1].strip()
        body = "\n".join(lines[1:]).lstrip("\n")
    return subject, body.strip()


def _context_block(variables: dict[str, str]) -> str:
    keys = ("first_name", "name", "company", "title", "sender_name")
    pairs = [f"- {k}: {variables[k]}" for k in keys if variables.get(k)]
    return "Recipient context:\n" + ("\n".join(pairs) if pairs else "- (none)")


async def generate_email(
    *, prompt: str, variables: dict[str, str], settings, session=None
) -> GeneratedEmail | None:
    """Generate one email from ``prompt`` + recipient ``variables``.

    Returns ``None`` when no provider is configured or the call fails — callers
    must fall back to their stored copy. The caller records usage.

    When ``session`` is supplied, the admin-saved LLM key (if any) takes
    precedence over the env key; without a session, env keys are used.
    """
    if session is not None:
        from app.services.llm.llm_config import resolve_llm_keys

        resolved = await resolve_llm_keys(session, settings)
        provider, models = get_provider(
            settings,
            gemini_api_key=resolved.gemini_api_key,
            anthropic_api_key=resolved.anthropic_api_key,
        )
    else:
        provider, models = get_provider(settings)
    if provider is None or not models:
        return None

    user_msg = f"{prompt.strip()}\n\n{_context_block(variables)}"

    # Try each candidate model until one returns usable content. A 429/503 on
    # one model (quota/overload) falls through to the next rather than failing.
    for model in models:
        req = LLMRequest(
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model=model,
            temperature=0.8,
            max_tokens=400,
        )
        try:
            resp = await provider.complete(req)
        except (LLMError, Exception) as exc:  # noqa: BLE001 — never break caller
            logger.warning("crm ai generation failed model=%s: %s", model, exc)
            continue

        subject, body = _parse_subject_body(resp.content)
        if not body:
            continue
        if not subject:
            subject = "Quick question"
        return GeneratedEmail(subject=subject, body=body, usage=resp.usage)

    return None
