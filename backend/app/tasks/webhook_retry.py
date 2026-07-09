"""Celery retry task for the webhook dispatcher.

Scheduled by ``services.webhook_dispatcher._schedule_retry`` with a
countdown matching the retry-backoff ladder (60s → 300s → 1800s). The
task re-loads the webhook by id and calls ``send`` again with the
incremented attempt number. The dispatcher itself decides whether to
schedule yet another retry or mark the delivery ``dead_letter``.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from app.celery_app import celery_app
from app.db.models.webhooks import Webhook
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


async def _run(
    *,
    webhook_id: str,
    event: str,
    payload: dict[str, Any],
    attempt: int,
) -> dict[str, Any]:
    from app.services.webhook_dispatcher import send

    async with SessionLocal() as session:
        wh = await session.get(Webhook, uuid.UUID(webhook_id))
        if wh is None or not wh.is_active:
            return {"status": "skipped", "reason": "webhook missing or inactive"}
        delivery = await send(
            wh,
            event,
            payload,
            attempt=attempt,
            session=session,
        )
        return {"status": delivery.status, "attempt": attempt}


@celery_app.task(name="app.tasks.webhook_retry.retry_delivery", queue="default")
def retry_delivery(
    *,
    webhook_id: str,
    event: str,
    payload: dict[str, Any],
    attempt: int,
) -> dict[str, Any]:
    try:
        return asyncio.run(
            _run(
                webhook_id=webhook_id,
                event=event,
                payload=payload,
                attempt=attempt,
            )
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("webhook_retry.failed err=%s", exc)
        return {"status": "error", "error": str(exc)}
