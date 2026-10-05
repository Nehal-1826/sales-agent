"""
LLM helper — OpenAI-compatible chat completions.

Works with any provider that speaks the /chat/completions dialect
(OpenAI, GLM/Zhipu, DeepSeek, Groq, local Ollama, …).  Everything
degrades gracefully: with no key configured, callers get None and
fall back to built-in templates.
"""

import logging
import time

import requests

from .models import AppSettings

log = logging.getLogger(__name__)

PROVIDER_BASE_URLS = {
    'openai': 'https://api.openai.com/v1',
    'glm': 'https://open.bigmodel.cn/api/paas/v4',
    'zhipu': 'https://open.bigmodel.cn/api/paas/v4',
    'deepseek': 'https://api.deepseek.com/v1',
    'groq': 'https://api.groq.com/openai/v1',
    'mistral': 'https://api.mistral.ai/v1',
    # Gemini's OpenAI-compatible dialect ('gemini' and 'Google AI' both match)
    'gemini': 'https://generativelanguage.googleapis.com/v1beta/openai',
    'google': 'https://generativelanguage.googleapis.com/v1beta/openai',
    'ollama': 'http://localhost:11434/v1',
}

DEFAULT_MODELS = {
    'openai': 'gpt-4o-mini',
    'glm': 'glm-4-flash',
    'zhipu': 'glm-4-flash',
    'deepseek': 'deepseek-chat',
    'groq': 'llama-3.3-70b-versatile',
    'mistral': 'mistral-small-latest',
    # free-tier Gemini throttles the bigger flash/pro tiers; the lite alias is the reliable default
    'gemini': 'gemini-flash-lite-latest',
    'google': 'gemini-flash-lite-latest',
    'ollama': 'llama3.1',
}


def resolve_provider(provider):
    """Map a free-text provider name (e.g. 'Google AI') to a known provider key."""
    key = (provider or '').strip().lower()
    for name in PROVIDER_BASE_URLS:
        if name in key:
            return name
    return 'openai'


def provider_base_url(provider):
    return PROVIDER_BASE_URLS[resolve_provider(provider)]


def llm_available():
    return bool(AppSettings.load().ai_key)


def llm_complete(prompt, system='', model='', timeout=45):
    """One chat completion. Returns the text, or None when unavailable/failed."""
    settings = AppSettings.load()
    if not settings.ai_key:
        return None
    provider = resolve_provider(settings.ai_provider)
    base = PROVIDER_BASE_URLS[provider]
    body = {
        'model': model or DEFAULT_MODELS[provider],
        'messages': ([{'role': 'system', 'content': system}] if system else [])
        + [{'role': 'user', 'content': prompt}],
        'temperature': 0.7,
        'max_tokens': 700,
    }
    # Gemini's free tier intermittently answers 429/503 under load — retry once.
    for attempt in (1, 2):
        try:
            resp = requests.post(
                f'{base}/chat/completions',
                headers={'Authorization': f'Bearer {settings.ai_key}',
                         'Content-Type': 'application/json'},
                json=body,
                timeout=timeout,
            )
            if resp.status_code in (429, 503) and attempt == 1:
                time.sleep(2)
                continue
            resp.raise_for_status()
            data = resp.json()
            return (data['choices'][0]['message']['content'] or '').strip()
        except Exception as exc:
            log.warning('LLM call failed (%s): %s', base, exc)
            return None
    log.warning('LLM call failed (%s): still throttled after retry', base)
    return None
