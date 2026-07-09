"""crm_sequence_enrollments — a single lead's progress through a sequence.

``current_step`` is the index of the NEXT step to send; ``next_send_at`` is when
that step is due. The scheduler scans ``(status, next_send_at)`` for active,
due enrollments — that composite index is the hot path. The
``(sequence_id, lead_id)`` index is intentionally non-unique: a lead may be
re-enrolled after a previous enrollment is stopped or completed.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class CrmEnrollmentStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    stopped = "stopped"


class CrmSequenceEnrollment(Base):
    __tablename__ = "crm_sequence_enrollments"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    sequence_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_sequences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_leads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[CrmEnrollmentStatus] = mapped_column(
        SAEnum(CrmEnrollmentStatus, name="crm_enrollment_status"),
        nullable=False,
        default=CrmEnrollmentStatus.active,
        index=True,
    )
    next_send_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    enrolled_at: Mapped[datetime] = created_at_col()
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index(
            "ix_crm_seq_enrollments_status_next",
            "status",
            "next_send_at",
        ),
        Index(
            "ix_crm_seq_enrollments_sequence_lead",
            "sequence_id",
            "lead_id",
        ),
    )
