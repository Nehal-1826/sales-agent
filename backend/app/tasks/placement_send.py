"""Placement Tester — per-seed send task.

Runs once per (test, seed) pair. Sends a deterministic probe email from
the user's mailbox to the seed inbox, then writes the Message-Id back to
the matching ``PlacementTestSeed`` row so the poller can search for it.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.placement_test_seeds import PlacementTestSeed
from app.db.models.placement_tests import PlacementTest
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup.content_factory import generate_placement_probe
from app.services.warmup.smtp_sender import send_email

logger = logging.getLogger(__name__)


async def _impl(test_id: str, seed_peer_id: str) -> dict:
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        test = await db.get(PlacementTest, uuid.UUID(test_id))
        if test is None:
            return {"status": "test_not_found"}
        mailbox = await db.get(Mailbox, test.mailbox_id)
        if mailbox is None:
            return {"status": "mailbox_not_found"}
        peer = await db.get(PeerInbox, uuid.UUID(seed_peer_id))
        if peer is None:
            return {"status": "peer_not_found"}

        seed_row = (
            await db.execute(
                select(PlacementTestSeed).where(
                    PlacementTestSeed.test_id == test.id,
                    PlacementTestSeed.seed_peer_id == peer.id,
                )
            )
        ).scalar_one_or_none()
        if seed_row is None:
            return {"status": "seed_row_missing"}

        sender_domain = (mailbox.email_address or "").split("@", 1)[-1] or "warmpulse.io"
        subject, body = generate_placement_probe(str(test.id), sender_domain)
        message_id = f"<placement-{test.id}-{peer.id}@warmpulse.io>"

        try:
            await send_email(
                mailbox=mailbox,
                peer=peer,
                subject=subject,
                body=body,
                is_html=False,
                fernet=fernet,
                custom_message_id=message_id,
            )
            seed_row.message_id = message_id
            seed_row.status = "sent"
            await db.commit()
            return {"status": "sent", "message_id": message_id}
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "placement_send.failed test_id=%s seed_peer_id=%s err=%s",
                test_id,
                seed_peer_id,
                exc,
            )
            seed_row.status = "other"
            await db.commit()
            return {"status": "error", "error": str(exc)}


@celery_app.task(
    name="app.tasks.placement_send.send_probe",
    queue="smtp",
    bind=True,
    max_retries=0,
)
def send_probe(self, test_id: str, seed_peer_id: str) -> dict:  # noqa: ARG001
    return asyncio.run(_impl(test_id, seed_peer_id))
