"""CRM email-sequence tick — beat-scheduled every 5 minutes.

Walks every due, active enrollment one step forward (see
:func:`app.services.crm_sequence_service.process_due_enrollments`). System-wide:
the scan is not request-scoped, it spans all workspaces.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.services import crm_sequence_service

logger = logging.getLogger(__name__)


async def _tick_impl() -> dict:
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        result = await crm_sequence_service.process_due_enrollments(db, now)
    payload = result.model_dump()
    logger.info(
        "crm_sequence_tick processed=%s advanced=%s completed=%s",
        payload["processed"],
        payload["advanced"],
        payload["completed"],
    )
    return payload


@celery_app.task(name="app.tasks.crm_sequence_tick.tick", queue="default")
def tick() -> dict:
    """Every 5 min: advance all due CRM sequence enrollments by one step."""
    return asyncio.run(_tick_impl())
