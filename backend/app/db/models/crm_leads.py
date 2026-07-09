"""crm_leads — a contact tracked inside a CRM campaign's pipeline."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class CrmLeadStage(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    replied = "replied"
    interested = "interested"
    won = "won"
    lost = "lost"


class CrmLead(Base):
    __tablename__ = "crm_leads"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stage: Mapped[CrmLeadStage] = mapped_column(
        SAEnum(CrmLeadStage, name="crm_lead_stage"),
        nullable=False,
        default=CrmLeadStage.new,
        index=True,
    )
    value_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    __table_args__ = (
        Index("ix_crm_leads_workspace_campaign", "workspace_id", "campaign_id"),
        Index("ix_crm_leads_campaign_stage", "campaign_id", "stage"),
    )
