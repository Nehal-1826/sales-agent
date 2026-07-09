"""revenge_events — one row per revenge (re-spam) run.

Created ``pending`` at trigger time (auto cancel-within-2h or manual admin
sabotage), updated to a terminal status by ``tasks.revenge`` when the run
finishes. Powers the admin Revenge Activity dashboard. ``user_email`` /
``workspace_id`` are denormalized snapshots so the audit row survives user
deletion.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.db.base import Base, created_at_col, uuid_pk


class _JSONBOrJSON(TypeDecorator):
    """JSONB on Postgres; JSON on SQLite. Test suite uses SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class RevengeTrigger(str, enum.Enum):
    auto_cancel_2h = "auto_cancel_2h"
    manual_admin = "manual_admin"


class RevengeStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    no_candidates = "no_candidates"


class RevengeEvent(Base):
    __tablename__ = "revenge_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    user_email: Mapped[str] = mapped_column(String(320), nullable=False)
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)

    trigger: Mapped[RevengeTrigger] = mapped_column(
        SAEnum(RevengeTrigger, name="revenge_trigger"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[RevengeStatus] = mapped_column(
        SAEnum(RevengeStatus, name="revenge_status"),
        nullable=False,
        default=RevengeStatus.pending,
    )

    candidates_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    detail: Mapped[dict[str, Any] | None] = mapped_column(_JSONBOrJSON, nullable=True)

    created_at: Mapped[datetime] = created_at_col()
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __table_args__ = (
        Index("ix_revenge_events_created", "created_at"),
    )
