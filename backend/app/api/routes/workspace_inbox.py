"""Workspace — in-app notifications inbox at /api/workspace/notifications.

Distinct from ``workspace_notifications`` (which manages the per-channel
routing config). This file backs the bell icon + /app/notifications page:
list, mark-one-read, mark-all-read.
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_or_api_key
from app.db.models.users import User
from app.db.session import get_db
from app.services import notification_inbox_service, push_service

router = APIRouter(prefix="/api/workspace/notifications-inbox", tags=["workspace-inbox"])


class DeviceRegisterIn(BaseModel):
    token: str = Field(..., min_length=8, max_length=255)
    platform: str = Field("android", max_length=16)


class DeviceUnregisterIn(BaseModel):
    token: str = Field(..., min_length=8, max_length=255)


def _to_dict(n: Any) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "payload": n.payload or {},
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    user: Annotated[User, Depends(get_current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_db)],
    only_unread: bool = Query(False, alias="unread"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Return the user's most-recent notifications + an unread counter.

    Wire shape: ``{items: [...], unread: int}``. The dashboard nav bar
    polls ``unread`` on a 60s interval to drive the badge; the
    /app/notifications page reads ``items`` directly.
    """
    rows = await notification_inbox_service.list_for_user(
        session, user_id=user.id, only_unread=only_unread, limit=limit
    )
    unread = await notification_inbox_service.unread_count(session, user_id=user.id)
    return {"items": [_to_dict(n) for n in rows], "unread": unread}


@router.post("/{notification_id}/read")
async def mark_one_read(
    notification_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    row = await notification_inbox_service.mark_read(
        session, user_id=user.id, notification_id=notification_id
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return _to_dict(row)


@router.post("/read-all")
async def mark_all_read(
    user: Annotated[User, Depends(get_current_user_or_api_key)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, int]:
    n = await notification_inbox_service.mark_all_read(session, user_id=user.id)
    return {"marked": n}


@router.post("/devices", status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegisterIn,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Register this device's Expo push token so it receives notifications.

    Idempotent: re-registering the same token re-binds it to the caller.
    """
    row = await push_service.register_device(
        session, user_id=user.id, token=payload.token, platform=payload.platform
    )
    return {"id": str(row.id), "registered": True}


@router.delete("/devices")
async def unregister_device(
    payload: DeviceUnregisterIn,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, int]:
    """Drop this device's push token (logout / disable notifications)."""
    n = await push_service.unregister_device(
        session, user_id=user.id, token=payload.token
    )
    return {"removed": n}
