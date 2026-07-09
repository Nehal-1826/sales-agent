"""workspace_branding — Agency tier white-label branding overrides.

One row per workspace (unique constraint on ``workspace_id``). Resolution
falls back from own → parent workspace → WarmPulse defaults; the optional
``parent_workspace_id`` column captures the inheritance pointer used by
sub-client workspaces created by an Agency.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class WorkspaceBranding(Base):
    __tablename__ = "workspace_branding"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        nullable=False, unique=True, index=True
    )
    parent_workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True, index=True
    )
    brand_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    logo_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    logo_mime: Mapped[str | None] = mapped_column(String(50), nullable=True)
    accent_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    footer_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email_footer_text: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
