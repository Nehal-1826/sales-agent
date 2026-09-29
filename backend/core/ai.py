"""
LLM helper — OpenAI-compatible chat completions.

Works with any provider that speaks the /chat/completions dialect
(OpenAI, GLM/Zhipu, DeepSeek, Groq, local Ollama, …).  Everything
degrades gracefully: with no key configured, callers get None and
fall back to built-in templates.
"""

import logging

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
    'ollama': 'http://localhost:11434/v1',
}

DEFAULT_MODELS = {
    'openai': 'gpt-4o-mini',
    'glm': 'glm-4-flash',
    'zhipu': 'glm-4-flash',
    'deepseek': 'deepseek-chat',
    'groq': 'llama-3.3-70b-versatile',
    'mistral': 'mistral-small-latest',
    'ollama': 'llama3.1',
}


def provider_base_url(provider):
    key = (provider or '').strip().lower()
    for name, base in PROVIDER_BASE_URLS.items():
        if name in key:
            return base
    return PROVIDER_BASE_URLS['openai']


def llm_available():
    return bool(AppSettings.load().ai_key)


def llm_complete(prompt, system='', model='', timeout=45):
    """One chat completion. Returns the text, or None when unavailable/failed."""
    settings = AppSettings.load()
    if not settings.ai_key:
        return None
    base = provider_base_url(settings.ai_provider)
    try:
        resp = requests.post(
            f'{base}/chat/completions',
            headers={'Authorization': f'Bearer {settings.ai_key}',
                     'Content-Type': 'application/json'},
            json={
                'model': model or DEFAULT_MODELS.get(base, 'gpt-4o-mini'),
                'messages': ([{'role': 'system', 'content': system}] if system else [])
                + [{'role': 'user', 'content': prompt}],
                'temperature': 0.7,
                'max_tokens': 700,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return (data['choices'][0]['message']['content'] or '').strip()
    except Exception as exc:
        log.warning('LLM call failed (%s): %s', base, exc)
        return None
