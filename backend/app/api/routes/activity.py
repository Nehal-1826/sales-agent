"""Warmup-activity feed + threads routes (spec §5.1 item 3).

JWT-scoped; read-only. Cursor-based pagination: ``warmup_logs.id`` is a
BIGSERIAL so descending-by-id gives us a natural, stable ordering. For
threads we use a numeric offset encoded as the cursor.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_or_api_key as get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.activity import (
    ActivityFeedResponse,
    ActivityItem,
    ThreadListResponse,
    ThreadMessage,
    ThreadSummary,
)
from app.services import activity_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/workspace/warmup-activity", tags=["workspace-warmup-activity"]
)


# --------------------------------------------------------------------------- #
# 7. Activity feed                                                            #
# --------------------------------------------------------------------------- #


@router.get("", response_model=ActivityFeedResponse)
async def activity_feed(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    action: Literal[
        "sent", "opened", "replied", "starred", "spam_rescued", "marked_important"
    ]
    | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: int | None = Query(None),
) -> ActivityFeedResponse:
    payload = await activity_service.activity_feed(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        action=action,
        limit=limit,
        cursor=cursor,
    )
    return ActivityFeedResponse(
        items=[ActivityItem(**r) for r in payload["items"]],
        next_cursor=payload["next_cursor"],
    )


# --------------------------------------------------------------------------- #
# 8. Today stats                                                              #
# --------------------------------------------------------------------------- #


@router.get("/today-stats")
async def today_stats(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
) -> dict[str, int]:
    return await activity_service.today_stats(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )


# --------------------------------------------------------------------------- #
# 9. Warmup threads list                                                      #
# --------------------------------------------------------------------------- #


@router.get("/warmup-threads", response_model=ThreadListResponse)
async def warmup_threads(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor: int | None = Query(None),
) -> ThreadListResponse:
    payload = await activity_service.list_threads(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        limit=limit,
        cursor=cursor,
    )
    return ThreadListResponse(
        items=[ThreadSummary(**t) for t in payload["items"]],
        next_cursor=payload["next_cursor"],
    )


# --------------------------------------------------------------------------- #
# 10. Thread messages                                                         #
# --------------------------------------------------------------------------- #


@router.get("/warmup-threads/{thread_id}/messages", response_model=list[ThreadMessage])
async def thread_messages(
    thread_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ThreadMessage]:
    rows = await activity_service.thread_messages(
        session, workspace_id=user.workspace_id, thread_id=thread_id
    )
    return [ThreadMessage(**r) for r in rows]
