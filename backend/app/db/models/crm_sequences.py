"""crm_sequences — an automated follow-up sequence attached to a CRM campaign.

A sequence is an ordered list of :class:`~app.db.models.crm_sequence_steps.CrmSequenceStep`
rows; leads are enrolled (one
:class:`~app.db.models.crm_sequence_enrollments.CrmSequenceEnrollment` per lead)
and the beat-scheduled tick in
:mod:`app.services.crm_sequence_service.process_due_enrollments` walks each
enrollment through the steps, "sending" the due step by logging a
``CrmLeadActivity(kind=email_sent)``.

Only ``active`` sequences are advanced by the scheduler — ``paused`` halts all
enrollments without losing their position; ``archived`` is a soft retire.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class CrmSequenceStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class CrmSequence(Base):
    __tablename__ = "crm_sequences"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[CrmSequenceStatus] = mapped_column(
        SAEnum(CrmSequenceStatus, name="crm_sequence_status"),
        nullable=False,
        default=CrmSequenceStatus.active,
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
