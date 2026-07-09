"""warmup_threads — groups warmup_logs into conversations (feature 5)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class WarmupThread(Base):
    __tablename__ = "warmup_threads"

    id: Mapped[uuid.UUID] = uuid_pk()
    mailbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False
    )
    peer_inbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_inboxes.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_action_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "ix_warmup_threads_mailbox_last_action",
            "mailbox_id",
            "last_action_at",
            postgresql_ops={"last_action_at": "DESC"},
        ),
    )
