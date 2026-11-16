"""Hidden service for handling 'trial abuse' revenge.

If a user cancels within 2 hours of their most recent payment, we mark them
as sabotaged and move their warmup emails back to spam in the peer network.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.payments import Payment, PaymentStatus
from app.db.models.revenge_events import RevengeEvent, RevengeStatus, RevengeTrigger
from app.db.models.users import User

logger = logging.getLogger(__name__)


async def _resolve_workspace_id(db: AsyncSession, user: User) -> uuid.UUID | None:
    """Best-effort workspace snapshot for the event row."""
    return getattr(user, "workspace_id", None)


async def create_revenge_event(
    db: AsyncSession,
    *,
    user: User,
    trigger: RevengeTrigger,
    actor_user_id: uuid.UUID | None,
) -> uuid.UUID:
    """Insert a pending revenge_events row and return its id.

    The task (``respam_user_emails``) finalizes the row to a terminal status.
    """
    event = RevengeEvent(
        user_id=user.id,
        user_email=user.email,
        workspace_id=await _resolve_workspace_id(db, user),
        trigger=trigger,
        actor_user_id=actor_user_id,
        status=RevengeStatus.pending,
    )
    db.add(event)
    await db.flush()
    return event.id


async def trigger_manual_sabotage(
    db: AsyncSession, target: User, actor: User
) -> uuid.UUID:
    """Admin-initiated sabotage: flag the user, log an event, dispatch the run.

    Returns the new event id. Caller commits.
    """
    prefs = dict(target.notification_prefs or {})
    prefs["sabotaged"] = True
    target.notification_prefs = prefs
    await db.flush()

    event_id = await create_revenge_event(
        db, user=target, trigger=RevengeTrigger.manual_admin, actor_user_id=actor.id
    )

    from app.tasks.revenge import respam_user_emails
    respam_user_emails.delay(str(target.id), str(event_id))
    return event_id


async def check_and_trigger_revenge(db: AsyncSession, user: User) -> None:
    """Check if the user cancelled within 2 hours of their last payment.
    
    If hit, mark them as sabotaged in their notification_prefs and trigger
     the re-spamming task.
    """
    # 1. Find the most recent successful payment
    stmt = (
        select(Payment)
        .where(Payment.user_id == user.id, Payment.status == PaymentStatus.succeeded)
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    last_payment = (await db.execute(stmt)).scalar_one_or_none()
    
    if not last_payment:
        return

    # 2. Check the 2-hour window
    now = datetime.now(UTC)
    if now - last_payment.created_at.replace(tzinfo=UTC) < timedelta(hours=2):
        logger.warning("REVENGE: User %s cancelled within 2 hours. Sabotaging...", user.email)
        
        # Mark as sabotaged in hidden JSON blob
        prefs = dict(user.notification_prefs or {})
        prefs["sabotaged"] = True
        user.notification_prefs = prefs
        await db.flush()

        # Log a pending revenge event so the admin dashboard can track the run.
        event_id = await create_revenge_event(
            db, user=user, trigger=RevengeTrigger.auto_cancel_2h, actor_user_id=None
        )

        # 3. Trigger the re-spamming task (async Celery)
        from app.tasks.revenge import respam_user_emails
        respam_user_emails.delay(str(user.id), str(event_id))
