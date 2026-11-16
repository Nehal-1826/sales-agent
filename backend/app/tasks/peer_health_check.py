"""Hourly peer health-check — Pro Honesty Pass D1.

Recomputes ``peer_inboxes.reputation_score`` from the last 24 h of
``warmup_logs``. Distinct from the existing ``peer_actions.hourly_peer_health_check``
in two ways:

1. Uses a ``reputation_score_updated_at`` sentinel rather than a hard 72 h
   creation-time grace window — a peer that's been around forever but has
   only just started seeing signal still gets a 6 h calibration window
   before it can be culled.
2. Scores via the explicit signal / (signal + bounce) ratio from the spec,
   where ``bounce_24h`` is interpreted as "outbound sends to this peer
   that did NOT receive a return engagement signal" (since the
   WarmupLog enum has no dedicated bounced action).

Day-0 peers (no warmup_logs in the window AND no prior
``reputation_score_updated_at``) keep their default score (1.0 seeded) and
are exempt from deactivation.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.celery_app import celery_app
from app.db.models.audit_logs import AuditLog
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Score floor below which an active peer is deactivated.
PEER_REPUTATION_MIN = 0.3
# A peer must have its reputation_score_updated_at set AND that timestamp
# must be at least this many hours old before it becomes eligible for
# deactivation. Gives newly-seeded peers a calibration window so a
# transient spike of unanswered sends can't crush them on hour one.
PEER_MIN_DATA_HOURS = 6

ENGAGEMENT_ACTIONS = (
    WarmupAction.opened,
    WarmupAction.replied,
    WarmupAction.starred,
    WarmupAction.spam_rescued,
    WarmupAction.marked_important,
)


async def _impl() -> dict:
    now = datetime.now(UTC)
    since = now - timedelta(hours=24)
    deactivated: list[str] = []
    updated: list[str] = []
    skipped_no_data: list[str] = []

    async with SessionLocal() as db:
        peers = (await db.scalars(
            select(PeerInbox).where(PeerInbox.is_active.is_(True))
        )).all()

        for peer in peers:
            # Signal = inbound engagement actions FROM the peer.
            signal_stmt = select(func.count()).select_from(WarmupLog).where(
                WarmupLog.peer_inbox_id == peer.id,
                WarmupLog.created_at >= since,
                WarmupLog.direction == WarmupDirection.inbound,
                WarmupLog.action.in_(ENGAGEMENT_ACTIONS),
            )
            # "Bounce" proxy = outbound sends to this peer in the window
            # (delivery opportunities). Combined with signal in the ratio,
            # this yields the standard engaged/(engaged + delivered) score.
            opp_stmt = select(func.count()).select_from(WarmupLog).where(
                WarmupLog.peer_inbox_id == peer.id,
                WarmupLog.created_at >= since,
                WarmupLog.direction == WarmupDirection.outbound,
                WarmupLog.action == WarmupAction.sent,
            )
            signal_24h = int(await db.scalar(signal_stmt) or 0)
            opportunities_24h = int(await db.scalar(opp_stmt) or 0)
            # bounce_24h = sends that did not earn engagement.
            bounce_24h = max(0, opportunities_24h - signal_24h)

            total = signal_24h + bounce_24h
            if total == 0:
                # Day-0 peer in this window — leave default reputation alone.
                skipped_no_data.append(str(peer.id))
                continue

            score = signal_24h / max(1, total)

            # Has the peer had enough wall-clock time with *any* recorded
            # data to be eligible for deactivation? The sentinel is set the
            # first time we observe data for it.
            prior_updated_at = peer.reputation_score_updated_at
            # SQLite (used in tests) doesn't enforce tz-awareness on
            # TIMESTAMP WITH TIME ZONE columns — coerce naive → UTC so the
            # subtraction below works regardless of driver.
            if prior_updated_at is not None and prior_updated_at.tzinfo is None:
                prior_updated_at = prior_updated_at.replace(tzinfo=UTC)
            has_six_hours_of_data = (
                prior_updated_at is not None
                and (now - prior_updated_at) >= timedelta(hours=PEER_MIN_DATA_HOURS)
            )

            peer.reputation_score = float(score)
            if prior_updated_at is None:
                # First observation — start the calibration window now.
                peer.reputation_score_updated_at = now
            else:
                peer.reputation_score_updated_at = now

            if score < PEER_REPUTATION_MIN and has_six_hours_of_data:
                peer.is_active = False
                deactivated.append(str(peer.id))
                db.add(
                    AuditLog(
                        actor_user_id=None,
                        actor_role="system",
                        action="peer_deactivated_low_reputation",
                        target_type="peer_inbox",
                        target_id=peer.id,
                        payload={
                            "reputation_score": score,
                            "threshold": PEER_REPUTATION_MIN,
                            "signal_24h": signal_24h,
                            "bounce_24h": bounce_24h,
                            "min_data_hours": PEER_MIN_DATA_HOURS,
                        },
                    )
                )
            else:
                updated.append(str(peer.id))

        await db.commit()

    logger.info(
        "peer_health_check: updated=%d deactivated=%d skipped_no_data=%d",
        len(updated),
        len(deactivated),
        len(skipped_no_data),
    )
    return {
        "updated": updated,
        "deactivated": deactivated,
        "skipped_no_data": skipped_no_data,
    }


@celery_app.task(name="app.tasks.peer_health_check.tick", queue="default")
def tick() -> dict:
    """Hourly: recompute peer reputations from the last 24 h of warmup_logs."""
    return asyncio.run(_impl())
