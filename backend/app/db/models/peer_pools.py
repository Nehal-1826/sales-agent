"""Peer pools + M2M membership table."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class PeerPool(Base):
    __tablename__ = "peer_pools"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    daily_send_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = created_at_col()


class PeerPoolMember(Base):
    __tablename__ = "peer_pool_members"

    peer_inbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_inboxes.id", ondelete="CASCADE"), primary_key=True
    )
    pool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_pools.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (
        Index("ix_peer_pool_members_pool_id", "pool_id"),
    )
