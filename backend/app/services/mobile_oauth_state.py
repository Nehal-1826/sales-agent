"""Short-lived Redis store binding a mobile OAuth ``state`` nonce to the user who
started the flow.

The provider callback (``/mailbox-callback``) is unauthenticated — Google /
Microsoft hit it directly. For the mobile flow we need to know which logged-in
user the consent belongs to so we can create the mailbox for the right account.
We stash ``{user_id, provider, daily_target}`` under the random ``state`` nonce
at start time and pop it (single-use) when the callback fires.

Single-use, 10-minute TTL. Mirrors the Redis access pattern in
``branding_service`` (sync client, best-effort, key-prefixed for the shared
Redis isolation documented in CLAUDE.md).
"""
from __future__ import annotations

import json
import logging
import secrets
import urllib.parse
import uuid

from app.config import get_settings

logger = logging.getLogger(__name__)

_TTL_S = 600
_STATE_MARKER = "mobile"  # encoded into the OAuth `state` so the callback branches
_APP_REDIRECT = "warmpulse://oauth-done"  # deep link the in-app browser returns to


def app_redirect_url(status_: str, *, email: str | None = None, reason: str | None = None) -> str:
    """Build the ``warmpulse://oauth-done?...`` deep link the mobile in-app
    browser closes on. Carries only non-secret status + the user's own email."""
    params = {"status": status_}
    if email:
        params["email"] = email
    if reason:
        params["reason"] = reason
    return f"{_APP_REDIRECT}?{urllib.parse.urlencode(params)}"


def _redis_client_or_none():
    try:
        import redis  # type: ignore

        settings = get_settings()
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    except Exception as exc:  # pragma: no cover
        logger.debug("mobile_oauth.redis_unavailable err=%s", exc)
        return None


def _key(nonce: str) -> str:
    prefix = get_settings().redis_key_prefix or ""
    return f"{prefix}oauth:mobile:{nonce}"


def is_mobile_state(state: str | None) -> bool:
    """True when an OAuth ``state`` string was minted for the mobile flow."""
    return bool(state) and f":{_STATE_MARKER}:" in state


def begin(*, user_id: uuid.UUID, provider: str, daily_target: int) -> str:
    """Mint a single-use ``state`` nonce, persist the context, return the state.

    Returns a state of the form ``mailbox:mobile:<nonce>``. Raises if Redis is
    unavailable — without the store the callback can't resolve the user, so we
    fail fast at start rather than dead-ending after consent.
    """
    client = _redis_client_or_none()
    if client is None:
        raise RuntimeError("redis_unavailable")
    nonce = secrets.token_urlsafe(24)
    state = f"mailbox:{_STATE_MARKER}:{nonce}"
    payload = json.dumps(
        {"user_id": str(user_id), "provider": provider, "daily_target": int(daily_target)}
    )
    client.setex(_key(nonce), _TTL_S, payload)
    return state


def pop(state: str) -> dict | None:
    """Resolve + delete the context for a mobile ``state`` (single-use).

    Returns ``{user_id, provider, daily_target}`` or None if missing/expired.
    """
    client = _redis_client_or_none()
    if client is None:
        return None
    try:
        nonce = state.rsplit(":", 1)[-1]
        key = _key(nonce)
        raw = client.get(key)
        if raw is None:
            return None
        client.delete(key)
        return json.loads(raw)
    except Exception as exc:  # pragma: no cover
        logger.debug("mobile_oauth.pop_err err=%s", exc)
        return None
