"""domain_reputation_snapshots — daily per-domain metrics from Postmaster / SNDS.

One row per ``(workspace_id, domain, provider, date)``. Idempotent
on-conflict update so daily ingest tasks can be re-run safely. The ``raw``
column stores the full upstream payload so we can re-derive fields later
without re-pulling.
"""
from __future__ import annotations

import uuid
from datetime import date as date_t
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Date, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.db.base import Base, created_at_col, uuid_pk


class _JSONBOrJSON(TypeDecorator):
    """JSONB on Postgres; JSON on SQLite. Test suite uses SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class DomainReputationSnapshot(Base):
    __tablename__ = "domain_reputation_snapshots"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    date: Mapped[date_t] = mapped_column(Date, nullable=False)
    spam_rate: Mapped[float | None] = mapped_column(Numeric(8, 5), nullable=True)
    complaint_rate: Mapped[float | None] = mapped_column(Numeric(8, 5), nullable=True)
    ip_reputation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    domain_reputation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auth_pass_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    raw: Mapped[dict[str, Any]] = mapped_column(_JSONBOrJSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "domain",
            "provider",
            "date",
            name="uq_domain_reputation_snapshots_ws_dom_prov_date",
        ),
    )
