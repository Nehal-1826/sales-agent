"""warmup_logs — every discrete warmup action (send/open/reply/star/spam_rescue)."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col


class WarmupDirection(str, enum.Enum):
    outbound = "outbound"
    inbound = "inbound"


class WarmupAction(str, enum.Enum):
    sent = "sent"
    opened = "opened"
    replied = "replied"
    starred = "starred"
    spam_rescued = "spam_rescued"
    marked_important = "marked_important"


class WarmupLog(Base):
    __tablename__ = "warmup_logs"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    mailbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False
    )
    peer_inbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("peer_inboxes.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[WarmupDirection] = mapped_column(
        SAEnum(WarmupDirection, name="warmup_direction"),
        nullable=False,
    )
    action: Mapped[WarmupAction] = mapped_column(
        SAEnum(WarmupAction, name="warmup_action"),
        nullable=False,
    )
    message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject_snippet: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    __table_args__ = (
        # Composite: per-mailbox recent-activity queries.
        Index(
            "ix_warmup_logs_mailbox_created",
            "mailbox_id",
            "created_at",
            postgresql_ops={"created_at": "DESC"},
        ),
    )
