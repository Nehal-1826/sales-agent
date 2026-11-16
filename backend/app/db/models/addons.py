"""addons — purchasable add-on catalogue + per-workspace ownership.

The catalogue (``addons``) is admin-managed like ``plans``. Ownership
(``workspace_addons``) records which workspace bought which add-on, with a
back-reference to the dummy Payment row. The ``crm`` add-on additionally
flips ``workspace_settings.crm_addon_enabled`` for back-compat with the
existing CRM gating.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class Addon(Base):
    __tablename__ = "addons"

    id: Mapped[uuid.UUID] = uuid_pk()
    key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = created_at_col()


class WorkspaceAddon(Base):
    __tablename__ = "workspace_addons"
    __table_args__ = (
        UniqueConstraint("workspace_id", "addon_id", name="uq_workspace_addon"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    addon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("addons.id", ondelete="RESTRICT"), nullable=False
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = created_at_col()
