"""client_pool_assignments — each workspace is assigned to exactly one pool."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class ClientPoolAssignment(Base):
    __tablename__ = "client_pool_assignments"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, unique=True)
    pool_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_pools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
