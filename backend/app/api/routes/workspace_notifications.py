"""Workspace — notification settings CRUD + test-send (§5.1 #10)."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.notifications import (
    NotificationSettingCreate,
    NotificationSettingOut,
    NotificationSettingUpdate,
    NotificationTestResponse,
)
from app.services import notifications_service

router = APIRouter(
    prefix="/api/workspace/notifications/settings", tags=["notifications"]
)


@router.get("/", response_model=list[NotificationSettingOut])
async def list_settings(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[NotificationSettingOut]:
    rows = await notifications_service.list_settings(session, user=user)
    out: list[NotificationSettingOut] = []
    for r in rows:
        channel = r.channel.value if hasattr(r.channel, "value") else str(r.channel)
        out.append(
            NotificationSettingOut(
                id=r.id,
                channel=channel,  # type: ignore[arg-type]
                target=r.target,
                event_types=list(r.event_types or []),
                created_at=None,
            )
        )
    return out


@router.post(
    "/",
    response_model=NotificationSettingOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_setting(
    payload: NotificationSettingCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationSettingOut:
    row = await notifications_service.create_setting(session, user=user, payload=payload)
    channel = row.channel.value if hasattr(row.channel, "value") else str(row.channel)
    return NotificationSettingOut(
        id=row.id,
        channel=channel,  # type: ignore[arg-type]
        target=row.target,
        event_types=list(row.event_types or []),
        created_at=None,
    )


@router.patch("/{setting_id}", response_model=NotificationSettingOut)
async def update_setting(
    setting_id: uuid.UUID,
    payload: NotificationSettingUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationSettingOut:
    row = await notifications_service.update_setting(
        session, user=user, setting_id=setting_id, payload=payload
    )
    channel = row.channel.value if hasattr(row.channel, "value") else str(row.channel)
    return NotificationSettingOut(
        id=row.id,
        channel=channel,  # type: ignore[arg-type]
        target=row.target,
        event_types=list(row.event_types or []),
        created_at=None,
    )


@router.delete("/{setting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_setting(
    setting_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await notifications_service.delete_setting(session, user=user, setting_id=setting_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{setting_id}/test", response_model=NotificationTestResponse)
async def test_setting(
    setting_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationTestResponse:
    return await notifications_service.test_setting(
        session, user=user, setting_id=setting_id
    )
