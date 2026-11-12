"""Failure lockout (login + OTP) + client IP.

10 failures per (lowercased name, IP) in 15 min -> locked (even the right
password is refused until the window ends).  State lives in the DB
(core.LoginAttempt, keyed by a hash) so it holds across gunicorn workers.

Client IP: REMOTE_ADDR only.  Behind a reverse proxy set TRUSTED_PROXY_COUNT=N
(Cloudflare tunnel -> 1): the client is then the Nth-from-right entry of
X-Forwarded-For.  Never set it when Django is directly reachable (spoofable).
"""

import hashlib
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

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
    raw = f'{(username or "").strip().lower()[:150]}|{ip}'
    return hashlib.sha256(raw.encode()).hexdigest()


def _cutoff():
    return timezone.now() - timedelta(seconds=WINDOW)


def is_locked(username, ip):
    from .models import LoginAttempt
    return LoginAttempt.objects.filter(key=_key(username, ip), window_start__gt=_cutoff(),
                                       count__gte=MAX_FAILS).exists()


def record_failure(username, ip):
    from .models import LoginAttempt
    k = _key(username, ip)
    now = timezone.now()
    with transaction.atomic():
        # in-window row: atomic increment; otherwise start a fresh window
        if LoginAttempt.objects.filter(key=k, window_start__gt=_cutoff()).update(count=F('count') + 1):
            return
        if LoginAttempt.objects.filter(key=k).update(count=1, window_start=now):
            return
        try:
            with transaction.atomic():
                LoginAttempt.objects.create(key=k, count=1, window_start=now)
        except IntegrityError:   # another process created it first
            LoginAttempt.objects.filter(key=k).update(count=F('count') + 1)


def clear(username, ip):
    from .models import LoginAttempt
    LoginAttempt.objects.filter(key=_key(username, ip)).delete()
