"""Daily peer-counter reset — beat-scheduled at 00:01 UTC.

``peer_inboxes.used_today`` is incremented on every successful warmup send
(``warmup_send`` :: ``peer.used_today += 1``) and gates peer eligibility in
``pairing.pick_peer_inbox`` via ``used_today < daily_capacity``. Without a
daily reset the counter behaves as a *lifetime* total: once a peer's cumulative
send count crosses its capacity it falls out of rotation permanently, the pool
collapses onto whichever peer is still under cap, and that peer's reputation is
destroyed by the unnatural traffic concentration.

This task zeroes ``used_today`` across the whole pool once per UTC day so each
peer's capacity is a genuine per-day budget again. It runs just after
``ramp-advance-daily`` (00:00) so the new day starts with fresh counters.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import update

from app.celery_app import celery_app
from app.db.models.peer_inboxes import PeerInbox
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)


async def _reset_impl() -> dict:
    async with SessionLocal() as db:
        result = await db.execute(
            update(PeerInbox)
            .where(PeerInbox.used_today != 0)
            .values(used_today=0)
        )
        await db.commit()
    reset = result.rowcount or 0
    logger.info("peer_counter_reset: zeroed used_today on %d peers", reset)
    return {"reset": reset}


@celery_app.task(name="app.tasks.peer_counter_reset.reset_used_today", queue="default")
def reset_used_today() -> dict:
    """Midnight UTC: reset every peer's per-day send counter to 0."""
    return asyncio.run(_reset_impl())
