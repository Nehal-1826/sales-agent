"""Pydantic v2 schemas for the warmup activity feed + threads.

Spec §5.1 item 3. Cursor pagination because ``warmup_logs`` grows
unbounded — offsets would get slower as the table grows.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityItem(BaseModel):
    """Wire shape for /workspace/warmup-activity items.

    Names mirror the frontend `ActivityItem` type so the table renders
    without an adapter layer. `created_at` is kept alongside `ts` for
    backward compatibility with any older consumer that still reads it.
    """

    id: str
    mailbox_id: uuid.UUID
    mailbox_email: str
    peer_email: str
    direction: str
    action: str
    message_id: str | None = None
    subject: str | None = None
    ts: datetime
    created_at: datetime
    result: str = "ok"


class ActivityFeedResponse(BaseModel):
    items: list[ActivityItem]
    next_cursor: int | None


class ThreadSummary(BaseModel):
    id: uuid.UUID
    mailbox_id: uuid.UUID
    peer_email: str
    subject: str
    started_at: datetime
    last_action_at: datetime
    message_count: int


class ThreadListResponse(BaseModel):
    items: list[ThreadSummary]
    next_cursor: int | None


class ThreadMessage(BaseModel):
    id: int
    direction: str
    action: str
    message_id: str | None
    subject_snippet: str | None
    created_at: datetime
