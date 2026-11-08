"""Login lockout + client IP.

10 failed logins per (lowercased username, IP) in 15 min -> locked (even the
right password is refused until the window ends).  Django cache; use a shared
backend (Redis/DB) if you run several web processes.

Client IP: REMOTE_ADDR only.  Behind a reverse proxy set TRUSTED_PROXY_COUNT=N
(Cloudflare tunnel -> 1): the client is then the Nth-from-right entry of
X-Forwarded-For.  Never set it when Django is directly reachable (spoofable).
"""

from django.conf import settings
from django.core.cache import cache

MAX_FAILS = 10
WINDOW = 15 * 60


def client_ip(request):
    n = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    remote = request.META.get('REMOTE_ADDR', '') or ''
    xff = [p.strip() for p in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if p.strip()]
    if n > 0 and len(xff) >= n:
        return xff[-n]
    return remote


def _key(username, ip):
    return f'login-fail:{(username or "").strip().lower()[:150]}:{ip}'


def is_locked(username, ip):
    return cache.get(_key(username, ip), 0) >= MAX_FAILS


def record_failure(username, ip):
    k = _key(username, ip)
    if cache.add(k, 1, WINDOW):
        return
    try:
        cache.incr(k)
    except ValueError:
        cache.set(k, 1, WINDOW)


def clear(username, ip):
    cache.delete(_key(username, ip))
