"""Single source of truth for picking a ``ContentGenerator`` at runtime.

Priority: Gemini (if ``GEMINI_API_KEY`` set) -> Claude (if
``ANTHROPIC_API_KEY`` set and the ``anthropic`` package is installed) ->
static templates. The warmup engine imports ``get_content_generator(settings)``
and calls it once per send.
"""
from __future__ import annotations

from app.services.llm.claude_provider import ClaudeProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.groq_provider import GroqProvider
from app.services.llm.provider import LLMProvider
from app.services.warmup.content import ContentGenerator, StaticTemplateGenerator
from app.services.warmup.llm_content_generator import LlmContentGenerator


def get_content_generator(
    settings,
    *,
    gemini_api_key: str | None = None,
    anthropic_api_key: str | None = None,
    groq_api_key: str | None = None,
) -> ContentGenerator:
    """Return an LLM-backed generator if a key is configured, else static.

    Providers are chained in priority order Gemini -> Groq -> Claude, each
    wrapping the next as its fallback so that when one is rate-limited /
    errors at send time, the engine drops to the next provider before finally
    falling back to static templates. Keys passed explicitly (not ``None``)
    override env — callers pass the admin-resolved keys (see
    ``services/llm/llm_config.resolve_llm_keys``) so the admin card wins.
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
    groq_key = (
        groq_api_key
        if groq_api_key is not None
        else getattr(settings, "groq_api_key", "")
    )

    providers: list[LLMProvider] = []
    if gemini_key:
        providers.append(GeminiProvider(
            api_key=gemini_key,
            default_model=settings.gemini_model,
            base_url=settings.gemini_base_url,
        ))
    if groq_key:
        providers.append(GroqProvider(
            api_key=groq_key,
            default_model=getattr(settings, "groq_model", "llama-3.3-70b-versatile"),
            base_url=getattr(settings, "groq_base_url", "https://api.groq.com/openai/v1"),
        ))
    if anthropic_key:
        providers.append(ClaudeProvider(
            api_key=anthropic_key,
            default_model=getattr(settings, "anthropic_model", "claude-sonnet-4-5"),
        ))

    if not providers:
        return StaticTemplateGenerator()

    # Build the chain back-to-front: the last provider falls back to static,
    # each earlier provider falls back to the next generator.
    generator: ContentGenerator = StaticTemplateGenerator()
    for provider in reversed(providers):
        generator = LlmContentGenerator(
            provider=provider,
            settings=settings,
            fallback=generator,
        )
    return generator


def generate_placement_probe(
    test_id: str, sender_domain: str = "warmpulse.io"
) -> tuple[str, str]:
    """Build the deterministic subject + plain-text body for a placement probe.

    Kept intentionally short, URL-less, image-less and template-stable so
    the probe doesn't look like marketing mail and ESPs route it on content
    + domain reputation alone.
    """
    test_id_short = (test_id or "")[:8]
    subject = f"[WP-PT-{test_id_short}] Deliverability probe"
    body = (
        "Hi,\n"
        "\n"
        "This is an automated deliverability probe sent by WarmPulse on behalf\n"
        f"of {sender_domain}. It confirms inbox placement and reputation across\n"
        "providers. No reply needed — the system will discard this message\n"
        "after analysis.\n"
        "\n"
        f"Test reference: {test_id_short}\n"
    )
    return subject, body
