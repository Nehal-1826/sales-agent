"""domain_credentials — per-workspace credentials for external reputation feeds.

One row per ``(workspace_id, domain, provider)``. Two providers are supported:

* ``postmaster`` — Google Postmaster Tools. ``refresh_token_encrypted``
  holds the Fernet-encrypted OAuth refresh token (we exchange for a fresh
  access token on every pull). ``access_key_encrypted`` is unused.
* ``snds`` — Microsoft SNDS. ``access_key_encrypted`` holds the
  user-provided access key (no OAuth flow exists). ``refresh_token_encrypted``
  is unused.

``last_pulled_at`` + ``last_status`` are denormalised projections of the
most recent ingest attempt; the daily ingest task updates them on every
run regardless of success.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class DomainCredential(Base):
    __tablename__ = "domain_credentials"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    refresh_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    access_key_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    last_pulled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "domain", "provider", name="uq_domain_credentials_ws_domain_provider"
        ),
    )
