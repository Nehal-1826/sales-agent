"""Pydantic v2 schemas for scheduled reports + on-demand export."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Legacy scheduled-report types (kept for back-compat with existing tests and
# the v0 scheduled-digest tooling) plus the modern content kinds the Pro Reports
# UI uses ('warmth' | 'engagement' | 'placement' | 'white_label').
ReportType = Literal[
    "weekly_digest",
    "monthly_summary",
    "warmth",
    "engagement",
    "placement",
    "white_label",
]
Frequency = Literal["daily", "weekly", "monthly"]
ExportFormat = Literal["pdf", "csv"]


class ScheduledReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    type: ReportType
    frequency: Frequency
    recipients: list[str]
    last_sent_at: datetime | None = None


class ScheduledReportCreate(BaseModel):
    type: ReportType
    frequency: Frequency
    recipients: list[EmailStr] = Field(min_length=1, max_length=50)
    # Optional preferred format for the digest — currently informational only;
    # the scheduled-report runner can read this when it ships.
    format: ExportFormat | None = None


class ScheduledReportUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ReportType | None = None
    frequency: Frequency | None = None
    recipients: list[EmailStr] | None = None


class ReportExportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    format: ExportFormat
    mailbox_ids: list[uuid.UUID] | None = None
    from_: date = Field(alias="from")
    to: date


class ReportsHistoryEntry(BaseModel):
    """Derived record — one row per scheduled report + last_sent_at signal."""

    id: uuid.UUID
    type: ReportType
    frequency: Frequency
    recipients: list[str]
    last_sent_at: datetime | None = None
    status: str
