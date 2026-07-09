"""team_members — workspace-level seat invites (feature 7)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    invited_email: Mapped[str] = mapped_column(String(320), nullable=False)
    role_in_workspace: Mapped[str] = mapped_column(String(64), nullable=False, default="member")
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created_at_col()
