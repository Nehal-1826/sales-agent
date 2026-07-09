"""crm_lead_activities — append-only timeline of events for a CRM lead."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class CrmActivityKind(str, enum.Enum):
    created = "created"
    note = "note"
    stage_change = "stage_change"
    email_sent = "email_sent"
    email_opened = "email_opened"
    email_replied = "email_replied"


class CrmLeadActivity(Base):
    __tablename__ = "crm_lead_activities"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    lead_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_leads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[CrmActivityKind] = mapped_column(
        SAEnum(CrmActivityKind, name="crm_activity_kind"),
        nullable=False,
        default=CrmActivityKind.note,
    )
    body: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = created_at_col()
