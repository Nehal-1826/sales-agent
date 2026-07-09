"""Notification settings CRUD + stubbed test-send.

We stay out of the outbound delivery business in MVP — ``send_test`` just
returns a shape saying "we pretended to hit {channel}". Real Slack/webhook
delivery lands in a later wave.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.notification_settings import NotificationSetting
from app.db.models.users import User
from app.schemas.notifications import (
    NotificationSettingCreate,
    NotificationSettingUpdate,
    NotificationTestResponse,
)

logger = logging.getLogger(__name__)


async def _audit(
    session: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    actor_role: str | None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("audit write failed action=%s: %s", action, exc)


async def list_settings(
    session: AsyncSession, *, user: User
) -> list[NotificationSetting]:
    result = await session.execute(
        select(NotificationSetting).where(NotificationSetting.user_id == user.id)
    )
    return list(result.scalars().all())


async def create_setting(
    session: AsyncSession, *, user: User, payload: NotificationSettingCreate
) -> NotificationSetting:
    row = NotificationSetting(
        user_id=user.id,
        channel=payload.channel,
        target=payload.target,
        event_types=list(payload.event_types),
    )
    session.add(row)
    await session.flush()
    await _audit(
        session,
        action="notification_setting.created",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="notification_setting",
        target_id=row.id,
        payload={"channel": payload.channel},
    )
    await session.commit()
    await session.refresh(row)
    return row


async def update_setting(
    session: AsyncSession,
    *,
    user: User,
    setting_id: uuid.UUID,
    payload: NotificationSettingUpdate,
) -> NotificationSetting:
    row = await session.get(NotificationSetting, setting_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification setting not found")
    data = payload.model_dump(exclude_unset=True)
    for field, val in data.items():
        setattr(row, field, val)
    await session.flush()
    await _audit(
        session,
        action="notification_setting.updated",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="notification_setting",
        target_id=row.id,
        payload=data,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def delete_setting(
    session: AsyncSession, *, user: User, setting_id: uuid.UUID
) -> None:
    row = await session.get(NotificationSetting, setting_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification setting not found")
    await session.delete(row)
    await _audit(
        session,
        action="notification_setting.deleted",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="notification_setting",
        target_id=setting_id,
    )
    await session.commit()


async def test_setting(
    session: AsyncSession, *, user: User, setting_id: uuid.UUID
) -> NotificationTestResponse:
    row = await session.get(NotificationSetting, setting_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification setting not found")
    channel = row.channel.value if hasattr(row.channel, "value") else str(row.channel)
    await _audit(
        session,
        action="notification_setting.test_sent",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="notification_setting",
        target_id=row.id,
        payload={"channel": channel},
    )
    await session.commit()
    return NotificationTestResponse(
        sent=True, note=f"Stubbed test for channel={channel}; real delivery lands later."
    )
