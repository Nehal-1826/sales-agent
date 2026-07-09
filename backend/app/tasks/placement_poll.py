"""Placement Tester — IMAP polling task.

Self-rescheduling Celery task that searches each seed inbox for the probe
Message-Id and records the landing folder. Reschedules itself every 60s
until every seed has a terminal status or the 15-minute window expires,
then calls ``placement_service.finalize_test``.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.placement_test_seeds import PlacementTestSeed
from app.db.models.placement_tests import PlacementTest
from app.db.session import SessionLocal
from app.services import placement_service
from app.services.crypto import get_fernet_service
from app.services.warmup.imap_watcher import find_message_in_any_folder

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {"inbox", "promotions", "spam", "other", "timeout"}
ACTIVE_STATUSES = {"sent", "pending_check", "pending"}


async def _impl(test_id: str) -> dict:
    fernet = get_fernet_service()
    test_uuid = uuid.UUID(test_id)
    async with SessionLocal() as db:
        test = await db.get(PlacementTest, test_uuid)
        if test is None:
            return {"status": "test_not_found"}

        seeds = (
            await db.execute(
                select(PlacementTestSeed).where(
                    PlacementTestSeed.test_id == test_uuid
                )
            )
        ).scalars().all()

        now = datetime.now(UTC)
        # test.created_at may be naive when SQLite is the backend.
        created = test.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        elapsed = (now - created) if created else placement_service.TEST_TIMEOUT
        timed_out = elapsed >= placement_service.TEST_TIMEOUT

        for seed in seeds:
            if seed.status not in ACTIVE_STATUSES:
                continue
            if not seed.message_id:
                # Send hasn't completed yet — try again next cycle.
                continue
            peer = await db.get(PeerInbox, seed.seed_peer_id)
            if peer is None:
                seed.status = "other"
                continue
            try:
                hit = await find_message_in_any_folder(
                    peer, seed.message_id, fernet
                )
            except Exception as exc:  # noqa: BLE001
                logger.debug(
                    "placement_poll.imap_err seed=%s err=%s", seed.id, exc
                )
                hit = None
            if hit is not None:
                folder, _uid = hit
                bucket = placement_service.folder_to_bucket(folder)
                seed.status = bucket
                seed.landed_folder = folder
                seed.landed_at = now

        if timed_out:
            for seed in seeds:
                if seed.status in ACTIVE_STATUSES:
                    seed.status = "timeout"

        await db.commit()

        # Re-read terminal state after updates.
        unresolved = [s for s in seeds if s.status in ACTIVE_STATUSES]
        finalize = (not unresolved) or timed_out

    if finalize:
        await placement_service.finalize_test(test_uuid)
        return {"status": "finalized", "seeds": len(seeds)}

    # Reschedule.
    try:
        poll.apply_async(args=[test_id], countdown=60)
    except Exception as exc:  # noqa: BLE001
        logger.warning("placement_poll.reschedule_failed test_id=%s err=%s", test_id, exc)
    return {"status": "polling", "unresolved": len(unresolved)}


@celery_app.task(
    name="app.tasks.placement_poll.poll",
    queue="default",
    bind=True,
    max_retries=0,
)
def poll(self, test_id: str) -> dict:  # noqa: ARG001
    return asyncio.run(_impl(test_id))
