"""placement_test_seeds — child rows tracking each seed inbox in a placement test."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class PlacementTestSeed(Base):
    __tablename__ = "placement_test_seeds"

    id: Mapped[uuid.UUID] = uuid_pk()
    test_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("placement_tests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    seed_peer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_inboxes.id", ondelete="CASCADE"),
        nullable=False,
    )
    message_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    landed_folder: Mapped[str | None] = mapped_column(String(128), nullable=True)
    landed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        Index("ix_placement_test_seeds_test_status", "test_id", "status"),
    )
