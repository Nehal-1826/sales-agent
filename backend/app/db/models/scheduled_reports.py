"""scheduled_reports — weekly digest / scheduled PDF configs."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    frequency: Mapped[str] = mapped_column(String(32), nullable=False, default="weekly")
    recipients: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
