"""workspace_custom_domains — Agency tier custom-domain registry.

One row per workspace (unique on ``workspace_id``). The ``domain`` column is
globally unique — a given hostname can only ever resolve to one workspace.

TLS provisioning is intentionally out of scope here; the reverse proxy
handles Let's Encrypt automation once a domain is marked verified.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class WorkspaceCustomDomain(Base):
    __tablename__ = "workspace_custom_domains"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        nullable=False, unique=True, index=True
    )
    domain: Mapped[str] = mapped_column(
        String(253), nullable=False, unique=True, index=True
    )
    verification_code: Mapped[str] = mapped_column(String(32), nullable=False)
    verification_method: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )  # "txt" or "cname"
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending | verified | failed
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_check_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = created_at_col()
