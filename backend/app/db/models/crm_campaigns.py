"""crm_campaigns — a workspace's CRM campaign (groups leads under a pipeline).

Tier-gated: Starter cannot host a campaign; Pro=3, Pro Plus=10, Agency=unlimited.
Cap enforcement lives in :mod:`app.services.crm_service`, not here.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum as SAEnum
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class CrmCampaignStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class CrmCampaign(Base):
    __tablename__ = "crm_campaigns"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[CrmCampaignStatus] = mapped_column(
        SAEnum(CrmCampaignStatus, name="crm_campaign_status"),
        nullable=False,
        default=CrmCampaignStatus.active,
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
