"""Read + re-run service for the admin Revenge Activity dashboard.

Routes stay thin; all DB access and dispatch live here. Sabotaged-roster
filtering is done in Python (not a JSONB predicate) for SQLite/Postgres
portability, matching ``services/warmup/sabotage.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.revenge_events import RevengeEvent, RevengeStatus, RevengeTrigger
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog


def _event_to_dict(ev: RevengeEvent) -> dict[str, Any]:
    return {
        "id": str(ev.id),
        "user_id": str(ev.user_id) if ev.user_id else None,
        "user_email": ev.user_email,
        "workspace_id": str(ev.workspace_id) if ev.workspace_id else None,
        "trigger": ev.trigger.value,
        "actor_user_id": str(ev.actor_user_id) if ev.actor_user_id else None,
        "status": ev.status.value,
        "candidates_count": ev.candidates_count,
        "moved_count": ev.moved_count,
        "failed_count": ev.failed_count,
        "detail": ev.detail,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
        "completed_at": ev.completed_at.isoformat() if ev.completed_at else None,
    }


async def get_kpis(db: AsyncSession) -> dict[str, Any]:
    total_runs = await db.scalar(select(func.count()).select_from(RevengeEvent)) or 0
    total_moved = await db.scalar(
        select(func.coalesce(func.sum(RevengeEvent.moved_count), 0))
    ) or 0
    last_run_at = await db.scalar(select(func.max(RevengeEvent.created_at)))

    rows = (await db.execute(select(User.notification_prefs))).all()
    sabotaged_users = sum(
        1 for (prefs,) in rows if prefs and prefs.get("sabotaged")
    )

    return {
        "sabotaged_users": sabotaged_users,
        "total_runs": int(total_runs),
        "total_moved": int(total_moved),
        "last_run_at": last_run_at.isoformat() if last_run_at else None,
    }


async def list_events(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
    trigger: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    """Paginated run feed, newest first, with optional filters.

    status/trigger are matched against the enum values; q is a case-insensitive
    substring match on the target user's email. Unknown enum values yield an
    empty result rather than erroring.
    """
    filters = []
    if status:
        try:
            filters.append(RevengeEvent.status == RevengeStatus(status))
        except ValueError:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
    if trigger:
        try:
            filters.append(RevengeEvent.trigger == RevengeTrigger(trigger))
        except ValueError:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
    if q:
        filters.append(RevengeEvent.user_email.ilike(f"%{q.strip()}%"))

    total = (
        await db.scalar(
            select(func.count()).select_from(RevengeEvent).where(*filters)
        )
        or 0
    )
    events = (
        await db.scalars(
            select(RevengeEvent)
            .where(*filters)
            .order_by(RevengeEvent.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return {
        "items": [_event_to_dict(e) for e in events],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


async def list_sabotaged_users(db: AsyncSession) -> list[dict[str, Any]]:
    users = (await db.scalars(select(User))).all()
    out: list[dict[str, Any]] = []
    for u in users:
        if u.notification_prefs and u.notification_prefs.get("sabotaged"):
            out.append(
                {
                    "id": str(u.id),
                    "email": u.email,
                    "display_name": getattr(u, "display_name", None),
                    "workspace_id": str(u.workspace_id) if u.workspace_id else None,
                }
            )
    return out


async def get_recipients(
    db: AsyncSession, *, event_id: uuid.UUID
) -> dict[str, Any] | None:
    """Per-recipient (peer inbox) breakdown for a run: whom + how many.

    Prefers the breakdown captured at run time (``detail.recipients``). For
    older runs without it (e.g. the backfilled run), reconstructs the candidate
    recipients from ``warmup_logs`` — that shows whom the user sent to, grouped
    by peer inbox, with the sent count.
    """
    ev = await db.get(RevengeEvent, event_id)
    if ev is None:
        return None

    if ev.detail and isinstance(ev.detail.get("recipients"), list):
        return {"source": "run", "recipients": ev.detail["recipients"]}

    if ev.user_id is None:
        return {"source": "run", "recipients": []}

    # Reconstruct from warmup history: the user's outbound sends grouped by peer.
    ws_subq = (
        select(Mailbox.workspace_id)
        .where(Mailbox.user_id == ev.user_id)
        .limit(1)
        .scalar_subquery()
    )
    mailbox_ids = (
        await db.scalars(select(Mailbox.id).where(Mailbox.workspace_id == ws_subq))
    ).all()
    if not mailbox_ids:
        return {"source": "reconstructed", "recipients": []}

    rows = (
        await db.execute(
            select(PeerInbox.email_address, func.count(WarmupLog.id))
            .join(PeerInbox, PeerInbox.id == WarmupLog.peer_inbox_id)
            .where(
                WarmupLog.mailbox_id.in_(list(mailbox_ids)),
                WarmupLog.direction == WarmupDirection.outbound,
                WarmupLog.action == WarmupAction.sent,
                WarmupLog.message_id.is_not(None),
            )
            .group_by(PeerInbox.email_address)
            .order_by(func.count(WarmupLog.id).desc())
        )
    ).all()
    return {
        "source": "reconstructed",
        "recipients": [{"email": email, "sent": int(n)} for email, n in rows],
    }


async def rerun(
    db: AsyncSession, *, event_id: uuid.UUID, actor: User
) -> dict[str, Any] | None:
    """Re-trigger the re-spam for the user behind an event.

    Creates a NEW pending event (history is immutable) and dispatches the task.
    Returns the new event dict, or None if the source event / user is gone.
    """
    src = await db.get(RevengeEvent, event_id)
    if src is None or src.user_id is None:
        return None
    target = await db.get(User, src.user_id)
    if target is None:
        return None

    from app.services.revenge_service import create_revenge_event

    new_id = await create_revenge_event(
        db, user=target, trigger=RevengeTrigger.manual_admin, actor_user_id=actor.id
    )
    await db.commit()

    from app.tasks.revenge import respam_user_emails
    respam_user_emails.delay(str(target.id), str(new_id))

    new_ev = await db.get(RevengeEvent, new_id)
    return _event_to_dict(new_ev) if new_ev else None
