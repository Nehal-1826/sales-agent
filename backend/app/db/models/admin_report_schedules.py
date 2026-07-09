"""admin_report_schedules — platform-level recurring report schedules.

These are NOT workspace-scoped: they are owned by the super-admin and
describe cross-workspace reports that run on a cadence (daily / weekly /
monthly), fan out CSV / PDF / XLSX exports, and email them to a list of
recipients.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import JSON as PGJSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class AdminReportSchedule(Base):
    __tablename__ = "admin_report_schedules"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[str] = mapped_column(String(50), nullable=False)
    cadence: Mapped[str] = mapped_column(String(20), nullable=False)        # daily|weekly|monthly
    recipients: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="csv")   # csv|pdf|xlsx
    filters: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
