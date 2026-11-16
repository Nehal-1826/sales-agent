"""Expo push notifications — device registration + best-effort send.

The mobile app registers its Expo push token after login; we fan a
notification's title/body out to every device a user owns via Expo's push
API (https://exp.host/--/api/v2/push/send). Sending is BEST-EFFORT: a network
hiccup or an expired token must never break the surrounding request or task,
so every send is wrapped and failures are logged at WARNING, not raised.

Invalid tokens reported by Expo (``DeviceNotRegistered``) are pruned so the
table self-heals as users uninstall.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.device_tokens import DeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_EXPO_TOKEN_PREFIXES = ("ExponentPushToken[", "ExpoPushToken[")


def _looks_like_expo_token(token: str) -> bool:
    return token.startswith(_EXPO_TOKEN_PREFIXES) and token.endswith("]")


async def register_device(
    db: AsyncSession, *, user_id: uuid.UUID, token: str, platform: str = "android"
) -> DeviceToken:
    """Upsert a device token, re-binding it to ``user_id`` if seen before.

    A device that logs into a different account re-registers the same Expo
    token; we move ownership rather than duplicate (token is unique).
    """
    existing = (
        await db.execute(select(DeviceToken).where(DeviceToken.token == token))
    ).scalar_one_or_none()
    if existing is not None:
        existing.user_id = user_id
        existing.platform = platform
        await db.commit()
        await db.refresh(existing)
        return existing
    row = DeviceToken(user_id=user_id, token=token, platform=platform)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def unregister_device(db: AsyncSession, *, user_id: uuid.UUID, token: str) -> int:
    """Drop a device token (logout / disable). Scoped to the owner."""
    result = await db.execute(
        delete(DeviceToken).where(
            DeviceToken.token == token, DeviceToken.user_id == user_id
        )
    )
    await db.commit()
    return int(getattr(result, "rowcount", 0) or 0)


async def tokens_for_user(db: AsyncSession, *, user_id: uuid.UUID) -> list[str]:
    rows = (
        await db.execute(
            select(DeviceToken.token).where(DeviceToken.user_id == user_id)
        )
    ).scalars().all()
    return [t for t in rows if _looks_like_expo_token(t)]


async def _prune_tokens(db: AsyncSession, tokens: list[str]) -> None:
    if not tokens:
        return
    try:
        await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(tokens)))
        await db.commit()
    except Exception:  # noqa: BLE001 — pruning is best-effort housekeeping
        logger.warning("push: failed to prune %d dead tokens", len(tokens))


async def send_push_to_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str,
    body: str = "",
    data: dict[str, Any] | None = None,
) -> int:
    """Send a push to every device of ``user_id``. Returns # accepted.

    Best-effort: returns 0 on any failure without raising. Prunes tokens
    Expo reports as ``DeviceNotRegistered``.
    """
    tokens = await tokens_for_user(db, user_id=user_id)
    if not tokens:
        return 0

    messages = [
        {
            "to": tok,
            "title": title,
            "body": body,
            "sound": "default",
            "channelId": "default",
            "priority": "high",
            **({"data": data} if data else {}),
        }
        for tok in tokens
    ]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — push must never break the caller
        logger.warning("push: Expo send failed for user %s: %s", user_id, exc)
        return 0

    # Expo returns {"data": [{"status": "ok"|"error", "details": {...}}, ...]}
    receipts = payload.get("data", []) if isinstance(payload, dict) else []
    dead: list[str] = []
    accepted = 0
    for tok, receipt in zip(tokens, receipts):
        if not isinstance(receipt, dict):
            continue
        if receipt.get("status") == "ok":
            accepted += 1
            continue
        details = receipt.get("details") or {}
        if details.get("error") == "DeviceNotRegistered":
            dead.append(tok)
    await _prune_tokens(db, dead)
    return accepted
