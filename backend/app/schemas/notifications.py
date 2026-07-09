"""Pydantic v2 schemas for notification settings."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EventType = Literal[
    "warmth_drop",
    "mailbox_paused",
    "dns_broken",
    "plan_limit_approaching",
    "peer_health_alert",
]
Channel = Literal["email", "slack", "webhook"]


class NotificationSettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    channel: Channel
    target: str
    event_types: list[str]
    created_at: datetime | None = None


class NotificationSettingCreate(BaseModel):
    channel: Channel
    target: str = Field(min_length=1, max_length=512)
    event_types: list[EventType] = Field(default_factory=list)


class NotificationSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: str | None = Field(default=None, min_length=1, max_length=512)
    event_types: list[EventType] | None = None


class NotificationTestResponse(BaseModel):
    sent: bool
    note: str
