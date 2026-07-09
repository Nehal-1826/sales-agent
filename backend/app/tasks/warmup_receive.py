"""Inbound engagement loop — peers act on warmup mail they received.

Wave 4 implementation of spec §5.1 #4 (bidirectional engagement).

Pipeline (every 3 minutes via celery beat):

1. ``schedule_inbound_cycle`` fans out one ``poll_peer_inbox`` task per
   active peer. Spreading the work across the worker pool means a single
   slow IMAP server can't stall the cycle.

2. ``poll_peer_inbox`` connects to one peer's IMAP, scans Spam first then
   INBOX for UNSEEN messages tagged with ``X-Warmup-Id``, samples an
   action per message from the spec's distribution, and dispatches to
   the existing per-action celery tasks (``peer_open_email`` /
   ``peer_star_email`` / ``peer_spam_rescue`` / ``peer_reply_email``)
   with random 30-300 s countdowns so the engagement looks human.

Action distribution (from spec):
* Spam folder: 80% spam-rescue (the highest-signal action), 20% open
* Inbox folder: 50% open+reply, 25% star, 15% mark-important, 10% open-only

Real-time mailbox metrics: each per-action task writes a WarmupLog row
*and* upserts ``daily_metrics`` so today's counts surface on the
dashboard immediately.
"""
from __future__ import annotations

import asyncio
import logging
import random
import uuid

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.peer_inboxes import PeerInbox
from app.db.session import SessionLocal
from app.services.crypto import get_fernet_service
from app.services.warmup import imap_watcher
from app.services.warmup.sabotage import is_mailbox_sabotaged

logger = logging.getLogger(__name__)


# Per-message countdown range — keeps engagement looking human.
_DELAY_MIN_SECONDS = 30
_DELAY_MAX_SECONDS = 300


def _human_delay() -> int:
    return random.randint(_DELAY_MIN_SECONDS, _DELAY_MAX_SECONDS)


# --------------------------------------------------------------------------- #
# Beat fan-out                                                                #
# --------------------------------------------------------------------------- #


async def _schedule_impl() -> dict:
    """Enqueue one ``poll_peer_inbox`` task per active peer."""
    enqueued: list[str] = []
    async with SessionLocal() as db:
        peers = (
            await db.scalars(select(PeerInbox).where(PeerInbox.is_active.is_(True)))
        ).all()
    for p in peers:
        poll_peer_inbox.delay(str(p.id))
        enqueued.append(str(p.id))
    return {"enqueued": len(enqueued), "peer_ids": enqueued}


@celery_app.task(name="app.tasks.warmup_receive.schedule_inbound_cycle", queue="default")
def schedule_inbound_cycle() -> dict:
    """Beat-triggered: every 3 min, fan out IMAP polling per active peer."""
    return asyncio.run(_schedule_impl())


# --------------------------------------------------------------------------- #
# Per-peer poll                                                               #
# --------------------------------------------------------------------------- #


# Lazily imported inside _poll_impl so a missing import path doesn't
# wedge the beat fan-out at module load.
def _peer_action_tasks():
    from app.tasks import peer_actions
    return peer_actions


async def _resolve_outbound_log(
    db, peer_id: uuid.UUID, warmup_id: str
) -> tuple[uuid.UUID, str] | None:
    """Find the outbound WarmupLog for this peer + warmup_id.

    Returns ``(mailbox_id, subject_snippet)`` so the caller can chain a
    reply task that needs both. ``None`` if no matching outbound row
    exists (the message in the peer's inbox isn't ours, or was sent by
    a different peer's path).
    """
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    stmt = (
        select(WarmupLog.mailbox_id, WarmupLog.subject_snippet)
        .where(
            WarmupLog.peer_inbox_id == peer_id,
            WarmupLog.message_id == warmup_id,
            WarmupLog.direction == WarmupDirection.outbound,
            WarmupLog.action == WarmupAction.sent,
        )
        .limit(1)
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        return None
    return row[0], (row[1] or "")


async def _dispatch_inbox_action(
    peer_id: str, mailbox_id: str, warmup_id: str, subject: str
) -> str:
    """Sample an INBOX-folder action and enqueue the matching peer_actions task.

    Returns the action label so the caller can roll up totals.
    """
    pa = _peer_action_tasks()
    roll = random.random()
    if roll < 0.50:
        # Open then reply — chain via delayed apply_async so the open
        # lands before the reply, with a small inter-action gap.
        pa.peer_open_email.apply_async(
            args=[peer_id, warmup_id], countdown=_human_delay()
        )
        pa.peer_reply_email.apply_async(
            args=[peer_id, mailbox_id, warmup_id, subject, warmup_id],
            countdown=_human_delay() + 30,
        )
        return "open+reply"
    if roll < 0.75:
        pa.peer_star_email.apply_async(
            args=[peer_id, warmup_id], countdown=_human_delay()
        )
        return "star"
    if roll < 0.90:
        # Mark-important is just an open + a star semantically — IMAP
        # doesn't have a separate flag. Treat as star + open.
        pa.peer_open_email.apply_async(
            args=[peer_id, warmup_id], countdown=_human_delay()
        )
        pa.peer_star_email.apply_async(
            args=[peer_id, warmup_id], countdown=_human_delay() + 15
        )
        return "marked_important"
    pa.peer_open_email.apply_async(
        args=[peer_id, warmup_id], countdown=_human_delay()
    )
    return "open"


async def _dispatch_spam_action(
    peer_id: str, mailbox_id: str, warmup_id: str, db
) -> str:
    """Sample a SPAM-folder action — heavily weighted toward spam-rescue.

    Revenge gate: if the mailbox owner is sabotaged, leave the message in Spam.
    Rescuing it (move_to_inbox) would undo the revenge re-spam, so we skip the
    action entirely rather than enqueue a rescue. See services/warmup/sabotage.
    """
    if await is_mailbox_sabotaged(uuid.UUID(mailbox_id), db):
        return "sabotaged_hold"
    pa = _peer_action_tasks()
    if random.random() < 0.80:
        pa.peer_spam_rescue.apply_async(
            args=[peer_id, warmup_id], countdown=_human_delay()
        )
        return "spam_rescue"
    pa.peer_open_email.apply_async(
        args=[peer_id, warmup_id], countdown=_human_delay()
    )
    return "open"


async def _poll_impl(peer_id: str) -> dict:
    """Scan one peer's INBOX + Spam and dispatch engagement actions."""
    fernet = get_fernet_service()
    async with SessionLocal() as db:
        peer = await db.get(PeerInbox, uuid.UUID(peer_id))
        if peer is None:
            return {"status": "peer_not_found"}
        if not peer.is_active or not peer.imap_creds_encrypted:
            return {"status": "peer_inactive"}

        # Spam first — highest-signal actions, and rescue removes the
        # message from the Spam folder so it won't be re-sampled next tick.
        spam_msgs = await imap_watcher.list_unread_warmup_spam(peer, fernet)
        inbox_msgs = await imap_watcher.list_unread_warmup_inbox(peer, fernet)

        actions: dict[str, int] = {}
        for msg in spam_msgs:
            warmup_id = msg["warmup_id"]
            resolved = await _resolve_outbound_log(db, peer.id, warmup_id)
            if resolved is None:
                continue
            mailbox_id, _subject = resolved
            label = await _dispatch_spam_action(
                str(peer.id), str(mailbox_id), warmup_id, db
            )
            actions[label] = actions.get(label, 0) + 1

        for msg in inbox_msgs:
            warmup_id = msg["warmup_id"]
            resolved = await _resolve_outbound_log(db, peer.id, warmup_id)
            if resolved is None:
                continue
            mailbox_id, subject = resolved
            label = await _dispatch_inbox_action(
                str(peer.id), str(mailbox_id), warmup_id, subject
            )
            actions[label] = actions.get(label, 0) + 1

    return {
        "status": "ok",
        "peer_id": peer_id,
        "spam_seen": len(spam_msgs),
        "inbox_seen": len(inbox_msgs),
        "actions": actions,
    }


@celery_app.task(
    name="app.tasks.warmup_receive.poll_peer_inbox",
    queue="smtp",
    bind=True,
    max_retries=2,
)
def poll_peer_inbox(self, peer_id: str) -> dict:
    """Poll one peer's IMAP and enqueue engagement actions."""
    try:
        return asyncio.run(_poll_impl(peer_id))
    except Exception as exc:  # noqa: BLE001
        logger.warning("poll_peer_inbox failed peer=%s: %s", peer_id, exc)
        # IMAP servers are flaky; one retry with backoff is enough.
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1)) from exc


# --------------------------------------------------------------------------- #
# Backwards-compat                                                            #
# --------------------------------------------------------------------------- #
# The old scaffolding task names are kept as no-op stubs so any in-flight
# beat schedule entries (in customers' redis from before the upgrade) don't
# break the worker. They simply log and return — celery_beat will replace
# the schedule entry on its next start.

@celery_app.task(name="app.tasks.warmup_receive.send_peer_to_mailbox", queue="smtp")
def send_peer_to_mailbox(_mailbox_id: str) -> dict:
    """Deprecated. The inbound loop now polls IMAP rather than sending phantom mail."""
    return {"status": "deprecated"}


# Backwards-compat alias for callers still referencing the old name.
_send_peer_to_mailbox = send_peer_to_mailbox
