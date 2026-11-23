"""
LLM helper — OpenAI-compatible chat completions.

Works with any provider that speaks the /chat/completions dialect
(OpenAI, GLM/Zhipu, DeepSeek, Groq, local Ollama, …).  Everything
degrades gracefully: with no key configured, callers get None and
fall back to built-in templates.
"""

import json
import logging
import os
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
    # Alibaba Qwen via DashScope's OpenAI-compatible endpoint (intl)
    'qwen': 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    'dashscope': 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
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
    'qwen': 'qwen3-1.7b',
    'dashscope': 'qwen3-1.7b',
    'ollama': 'qwen3:1.7b',
}

# Model-id prefixes each provider serves; an empty tuple = hosts many families,
# so accept whatever is configured.
MODEL_FAMILIES = {
    'openai': ('gpt-', 'o1', 'o3', 'o4', 'chatgpt'),
    'glm': ('glm',), 'zhipu': ('glm',),
    'deepseek': ('deepseek',),
    'mistral': ('mistral', 'open-mistral', 'codestral', 'ministral', 'pixtral'),
    'gemini': ('gemini',), 'google': ('gemini',),
    'qwen': ('qwen',), 'dashscope': ('qwen',),
    'groq': (), 'ollama': (),   # host many families — accept whatever is set
}

# Self-hosted providers need NO API key — the model runs on our own metal.
LOCAL_PROVIDERS = {'ollama'}


def resolve_provider(provider):
    """Free-text provider name (e.g. 'Google AI') → known provider key; None when
    we don't know where it lives (never fall back to OpenAI — that would send
    someone else's key there). Blank means the default, OpenAI."""
    key = (provider or '').strip().lower()
    if not key:
        return 'openai'
    for name in PROVIDER_BASE_URLS:
        if name in key:
            return name
    return None


def model_for(provider, requested):
    """The agent's configured model when it belongs to this provider, else
    the provider default (a GLM id sent to Gemini fails every call)."""
    requested = (requested or '').strip()
    families = MODEL_FAMILIES.get(provider, ())
    if requested and (not families or requested.lower().startswith(families)):
        return requested
    return DEFAULT_MODELS[provider]


def provider_base_url(provider):
    p = resolve_provider(provider) or 'openai'
    if p == 'ollama':   # local runtime — its address depends on the deployment
        return os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434/v1')
    return PROVIDER_BASE_URLS[p]


def llm_ready_for(settings):
    """(Key set OR a self-hosted provider) AND the provider is known — an
    unknown provider is keyless mode, so the strict AI gate in the pipeline
    doesn't hold every lead forever."""
    provider = resolve_provider(settings.ai_provider)
    return (bool(settings.ai_key) or provider in LOCAL_PROVIDERS) and provider is not None


def llm_available():
    return llm_ready_for(AppSettings.load())


def default_ai_provider():
    """Provider a NEW workspace starts on. The self-hosted runtime is a
    platform capability, not a secret each company brings: when this
    deployment runs one (AI_PROVIDER names it — the VPS runs Ollama) every
    new workspace starts there and needs no key. Anything else keeps the
    plain default (OpenAI, the workspace's own key)."""
    provider = resolve_provider(os.environ.get('AI_PROVIDER', ''))
    return 'Ollama' if provider in LOCAL_PROVIDERS else 'OpenAI'


def llm_complete(prompt, system='', model='', timeout=45, temperature=0.7):
    """One chat completion. Returns the text, or None when unavailable/failed.
    Vetting/classification callers should pass temperature=0 so verdicts are
    deterministic instead of creative."""
    settings = AppSettings.load()
    provider = resolve_provider(settings.ai_provider)
    if provider is None:
        log.warning('Unsupported AI provider %r — AI disabled', settings.ai_provider)
        return None
    if not settings.ai_key and provider not in LOCAL_PROVIDERS:
        return None
    # local CPU inference: the first call after idle pays a model load (~90s
    # for a 1.4GB model on 2 cores) — never let a remote-shaped timeout kill it
    if provider in LOCAL_PROVIDERS:
        timeout = max(timeout, 180)
    base = provider_base_url(provider)
    body = {
        'model': model_for(provider, model),
        'messages': ([{'role': 'system', 'content': system}] if system else [])
        + [{'role': 'user', 'content': prompt}],
        'temperature': temperature,
        'max_tokens': 700,
    }
    # Gemini's free tier intermittently answers 429/503 under load — retry once.
    headers = {'Content-Type': 'application/json'}
    if settings.ai_key:
        headers['Authorization'] = f'Bearer {settings.ai_key}'
    for attempt in (1, 2):
        try:
            resp = requests.post(
                f'{base}/chat/completions',
                headers=headers,
                json=body,
                timeout=timeout,
            )
            # 404 = Ollama cold-start (model loading); 429/503 = throttled
            if resp.status_code in (404, 429, 503) and attempt == 1:
                time.sleep(60 if provider in LOCAL_PROVIDERS else 2)
                continue
            resp.raise_for_status()
            data = resp.json()
            return (data['choices'][0]['message']['content'] or '').strip()
        except Exception as exc:
            log.warning('LLM call failed (%s): %s', base, exc)
            return None
    log.warning('LLM call failed (%s): still throttled after retry', base)
    return None


def llm_json(system, prompt, schema, max_tokens=256, timeout=240):
    """Schema-constrained JSON object from the LOCAL runtime. Uses Ollama's
    native API: `format` binds the reply to the schema's grammar, so the
    answer always parses — a small model cannot drift off-format. Cloud
    providers are never asked (returns None for them, and for any failure;
    never raises)."""
    try:
        settings = AppSettings.load()
        provider = resolve_provider(settings.ai_provider)
        if provider not in LOCAL_PROVIDERS:
            return None
        base = provider_base_url(provider).rstrip('/')
        if base.endswith('/v1'):        # native routes live beside the /v1 shim
            base = base[:-3]
        resp = requests.post(
            f'{base}/api/chat',
            headers={'Content-Type': 'application/json'},
            json={'model': DEFAULT_MODELS[provider],
                  'messages': [{'role': 'system', 'content': system},
                               {'role': 'user', 'content': prompt}],
                  'format': schema, 'stream': False, 'think': False,
                  'options': {'temperature': 0, 'num_predict': max_tokens}},
            timeout=timeout)
        resp.raise_for_status()
        out = json.loads(resp.json().get('message', {}).get('content') or '')
    except Exception as exc:
        log.warning('LLM JSON call failed: %s', exc)
        return None
    return out if isinstance(out, dict) else None
