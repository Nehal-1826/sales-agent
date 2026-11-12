"""Free multi-backend web search with health tracking — no paid SERP API.

`ddgs` (the DuckDuckGo library) also speaks to Brave, Mojeek, Yahoo, Bing,
Google, Startpage and Yandex.  Every engine rate-limits a shared IP sooner or
later, so instead of one engine + one retry, `text_search()` rotates through
the engines: a rate limit / error / empty page marks that engine unhealthy
(consecutive failures → exponential cooldown with jitter) and the query falls
through to the next healthy engine.

Health is module-level (per worker process, shared by all tenants — they share
the IP too).  `cycle_stats()` gives a per-cycle source breakdown for the
pipeline notes; `reset_cycle_stats()` starts a new one.
"""

import logging
import random
import threading
import time
from collections import Counter

log = logging.getLogger(__name__)

# general web engines only (wikipedia / grokipedia / annasarchive never list
# company homepages).  Order = preference; the start rotates per query so the
# load spreads across engines instead of hammering the first one.
BACKENDS = ['duckduckgo', 'brave', 'mojeek', 'yahoo', 'bing', 'google', 'startpage', 'yandex']

COOLDOWN_BASE = 60          # seconds after the first failure
COOLDOWN_MAX = 30 * 60      # never park an engine longer than this
BACKOFF_BASE = 2.0          # seconds slept before trying the next engine
BACKOFF_MAX = 8.0

_lock = threading.Lock()
_health = {}                # backend → {'fails': int, 'until': float (time.time)}
_rotation = [0]
_stats = Counter()          # per-cycle: '<backend>' hits, '<backend>:fail' misses, 'exhausted'


LABELS = {'duckduckgo': 'DuckDuckGo', 'brave': 'Brave', 'mojeek': 'Mojeek', 'yahoo': 'Yahoo',
          'bing': 'Bing', 'google': 'Google', 'startpage': 'Startpage', 'yandex': 'Yandex'}


def engine_label(backend):
    """Human name for a backend id ('duckduckgo' → 'DuckDuckGo')."""
    return LABELS.get(backend or '', (backend or 'Web').title())


def _sleep(seconds):        # patched out in tests
    time.sleep(seconds)


def reset_health():
    with _lock:
        _health.clear()
        _rotation[0] = 0


def reset_cycle_stats():
    with _lock:
        _stats.clear()


def cycle_stats():
    with _lock:
        return dict(_stats)


def cooling_down(now=None):
    """Backends currently parked → seconds remaining."""
    now = time.time() if now is None else now
    with _lock:
        return {b: round(h['until'] - now) for b, h in _health.items() if h['until'] > now}


def _healthy_order(now):
    with _lock:
        start = _rotation[0] % len(BACKENDS)
        _rotation[0] += 1
        order = BACKENDS[start:] + BACKENDS[:start]
        return [b for b in order if _health.get(b, {}).get('until', 0) <= now]


def mark_failure(backend, now=None):
    now = time.time() if now is None else now
    with _lock:
        h = _health.setdefault(backend, {'fails': 0, 'until': 0})
        h['fails'] += 1
        cool = min(COOLDOWN_MAX, COOLDOWN_BASE * 2 ** (h['fails'] - 1))
        h['until'] = now + cool * random.uniform(0.8, 1.2)
        _stats[f'{backend}:fail'] += 1


def mark_success(backend):
    with _lock:
        _health[backend] = {'fails': 0, 'until': 0}
        _stats[backend] += 1


def _is_ratelimit(exc):
    try:
        from ddgs.exceptions import RatelimitException
        if isinstance(exc, RatelimitException):
            return True
    except ImportError:  # pragma: no cover
        pass
    text = str(exc).lower()
    return 'ratelimit' in text or '429' in text or 'too many' in text


def text_search(query, max_results=20, accept=None, max_engines=4):
    """Raw ddgs text results for `query` from the first healthy engine that
    returns something useful.  `accept(results) -> bool` lets the caller treat
    'only junk' as a miss (falls through to the next engine).  Returns
    (results, backend) — ([], None) when every engine failed or is parked.
    At most `max_engines` engines are tried per query, so one genuinely
    empty niche query cannot park the whole pool."""
    from ddgs import DDGS

    attempt = 0
    for backend in _healthy_order(time.time())[:max_engines]:
        if attempt:
            # back off with jitter before hitting the next engine
            _sleep(min(BACKOFF_MAX, BACKOFF_BASE * attempt) * random.uniform(0.5, 1.5))
        attempt += 1
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results, backend=backend) or [])
        except Exception as exc:  # rate limit, timeout, parser break — next engine
            kind = 'rate-limited' if _is_ratelimit(exc) else 'failed'
            log.info('search %s %s for %r: %s', backend, kind, query, exc)
            mark_failure(backend)
            continue
        if not results or (accept is not None and not accept(results)):
            # engines that rate-limit silently answer with an empty page
            mark_failure(backend)
            continue
        mark_success(backend)
        return results, backend
    with _lock:
        _stats['exhausted'] += 1
    log.warning('search: every engine failed or is cooling down for %r', query)
    return [], None
