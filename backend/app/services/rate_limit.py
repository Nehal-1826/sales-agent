"""Generic fixed-window rate limiter over Redis.

Mirrors the ``INCR`` + ``EXPIRE``-on-first-hit pattern used by
``app.services.webhook_dispatcher.check_and_increment_rate_limit`` and the
Redis access conventions in ``app.services.mobile_oauth_state`` /
``app.services.branding_service`` (best-effort sync client, key-prefixed
via ``settings.redis_key_prefix`` for the shared Redis isolation documented
in CLAUDE.md).

The INCR and the EXPIRE are issued as a single pipelined round-trip so a
crash or timeout between the two calls can't leave a counter key behind
with no TTL — a key that never expires would lock the caller out forever,
which is a worse failure mode than the rate limit itself.

Fails OPEN, not closed: if Redis is unreachable for any reason, we log a
warning and return True (request allowed). A diagnostic/utility endpoint
that stops working because Redis blipped is worse than one that is
briefly unlimited.
"""
from __future__ import annotations

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


def _redis_client_or_none():
    try:
        import redis  # local import keeps cold-start cheap

        settings = get_settings()
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:  # pragma: no cover
        logger.debug("rate_limit.redis_unavailable err=%s", exc)
        return None


def _key(key: str) -> str:
    prefix = get_settings().redis_key_prefix or ""
    return f"{prefix}ratelimit:{key}"


async def check_rate_limit(key: str, *, limit: int, window_seconds: int) -> bool:
    """Return True if the call under ``key`` is allowed; False if it would
    exceed ``limit`` within the current ``window_seconds`` fixed window.

    Atomically increments the counter and — only on the first increment of
    a window — sets its expiry, using a Redis pipeline so the two commands
    execute as one round-trip and can't race (which would otherwise risk a
    counter key with no TTL, permanently stuck over the limit).

    Fails open: any Redis error (including "unreachable") is logged as a
    warning and treated as "allowed". Never raises for that reason.
    """
    client = _redis_client_or_none()
    if client is None:
        logger.warning("rate_limit.redis_unavailable key=%s — failing open", key)
        return True

    try:
        redis_key = _key(key)
        pipe = client.pipeline()
        pipe.incr(redis_key)
        pipe.ttl(redis_key)
        count, ttl = pipe.execute()
        count = int(count)
        if ttl is None or int(ttl) < 0:
            # First increment (or a key that somehow lost its TTL) — set it
            # now, still inside the same guarded block, before we ever
            # return to the caller.
            client.expire(redis_key, window_seconds)
        return count <= limit
    except Exception as exc:  # noqa: BLE001
        logger.warning("rate_limit.redis_error key=%s err=%s — failing open", key, exc)
        return True
