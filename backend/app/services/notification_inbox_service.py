"""Notification inbox — write/read primitives.

``notify_user`` is the canonical entry point: any caller (auth flow, stripe
webhook, mailbox delete, beat task) drops a row here and the inbox UI
picks it up at /app/notifications. The service stays thin; routes layer
adapts to FastAPI shapes.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.notifications import Notification
from app.services import push_service

logger = logging.getLogger(__name__)


async def notify_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str = "",
    payload: dict[str, Any] | None = None,
    commit: bool = True,
    push: bool = True,
) -> Notification:
    """Insert a notification row for ``user_id`` and optionally commit.

    Most callers pass ``commit=True`` (the default); webhook/celery code
    that's already orchestrating its own transaction passes ``commit=False``
    and folds the insert into the surrounding unit of work.

    When ``push`` is set (default) and the row is committed, the same
    title/body is mirrored to the user's mobile devices via Expo push —
    best-effort, so a push failure never affects the inbox write.
    """
    # Set ``created_at`` Python-side at microsecond resolution. The ORM
    # default is ``server_default=func.now()``, which on SQLite resolves
    # only to the second — two notifications written in quick succession
    # (welcome + warmth_drop landing in the same beat tick, say) would
    # tie and the inbox sort would be non-deterministic.
    row = Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        payload=payload or {},
        created_at=datetime.now(UTC),
    )
    db.add(row)
    if commit:
        await db.commit()
        await db.refresh(row)
        if push:
            # Mirror to mobile devices. Best-effort — a push failure must not
            # surface to the caller that just successfully wrote the inbox row.
            try:
                await push_service.send_push_to_user(
                    db,
                    user_id=user_id,
                    title=title,
                    body=body,
                    data={"kind": kind, "notification_id": str(row.id), **(payload or {})},
                )
            except Exception:  # noqa: BLE001
                logger.warning("notify_user: push delivery failed for %s", user_id)
    else:
        await db.flush()
    return row


async def list_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    limit: int = 50,
    only_unread: bool = False,
) -> list[Notification]:
    """Return the most recent notifications for ``user_id``."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if only_unread:
        stmt = stmt.where(Notification.read_at.is_(None))
    return list((await db.execute(stmt)).scalars().all())


async def unread_count(db: AsyncSession, *, user_id: uuid.UUID) -> int:
    """Count unread notifications — backs the nav-bar badge."""
    stmt = (
        select(func.count(Notification.id))
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return int((await db.execute(stmt)).scalar_one() or 0)


async def mark_read(
    db: AsyncSession, *, user_id: uuid.UUID, notification_id: uuid.UUID
) -> Notification | None:
    """Mark one notification as read. Returns ``None`` when not found or
    when the row belongs to a different user — both cases the route
    converts to 404 so we don't leak existence to other workspaces.
    """
    row = await db.get(Notification, notification_id)
    if row is None or row.user_id != user_id:
        return None
    if row.read_at is None:
        row.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(row)
    return row


async def mark_all_read(db: AsyncSession, *, user_id: uuid.UUID) -> int:
    """Mark every unread notification for ``user_id`` as read at once.

    Returns the number of rows affected. Implemented as a single UPDATE
    so a thousand-row backlog isn't a thousand round-trips.
    """
    now = datetime.now(UTC)
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()
    return int(getattr(result, "rowcount", 0) or 0)
