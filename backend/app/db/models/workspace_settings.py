"""workspace_settings — workspace-scoped Pro Settings persistence.

One row per ``workspace_id``. The workspace identifier itself remains the
UUID stamped on each user/mailbox; this table carries the editable
workspace fields the Pro Settings UI exposes.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col


class WorkspaceSetting(Base):
    __tablename__ = "workspace_settings"

    workspace_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_sender: Mapped[str | None] = mapped_column(String(320), nullable=True)
    brand_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    auto_crm_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Starter (and unknown-plan) workspaces unlock the full CRM by purchasing
    # the CRM add-on. Pro/Pro Plus/Agency include CRM regardless of this flag.
    crm_addon_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
