"""Pydantic v2 schemas for the audit-log viewer (super_admin)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntryOut(BaseModel):
    id: int
    actor_user_id: uuid.UUID | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    action: str
    target_type: str | None = None
    target_id: uuid.UUID | None = None
    payload: dict[str, Any] | None = None
    ip: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntryOut]
    page: int
    page_size: int
    total: int


class ActionCount(BaseModel):
    action: str
    count: int


class DayCount(BaseModel):
    date: date
    count: int


class AuditStatsResponse(BaseModel):
    by_action: list[ActionCount]
    by_day: list[DayCount]
