"""Peer inboxes — system-owned mailboxes that form the warmup network."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, LargeBinary, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class PeerProvider(str, enum.Enum):
    google_ws = "google_ws"
    office365 = "office365"
    yahoo = "yahoo"


class PeerInbox(Base):
    __tablename__ = "peer_inboxes"

    id: Mapped[uuid.UUID] = uuid_pk()
    email_address: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    provider: Mapped[PeerProvider] = mapped_column(
        SAEnum(PeerProvider, name="peer_provider"),
        nullable=False,
    )
    smtp_creds_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    imap_creds_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    reputation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    daily_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    used_today: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_seed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reputation_score_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        # Partial index — fast lookup for active peers (spec §8.3).
        Index(
            "ix_peer_inboxes_active",
            "is_active",
            postgresql_where="is_active = true",
        ),
    )
