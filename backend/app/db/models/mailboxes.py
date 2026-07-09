"""Mailboxes — a client's outbound inbox under warmup."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class MailboxProvider(str, enum.Enum):
    gmail = "gmail"
    outlook = "outlook"
    yahoo = "yahoo"
    smtp = "smtp"


class WarmupStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    paused = "paused"
    completed = "completed"


class ContentMode(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class Mailbox(Base):
    __tablename__ = "mailboxes"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)

    email_address: Mapped[str] = mapped_column(String(320), nullable=False)
    provider: Mapped[MailboxProvider] = mapped_column(
        SAEnum(MailboxProvider, name="mailbox_provider"),
        nullable=False,
    )

    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    imap_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    imap_port: Mapped[int | None] = mapped_column(Integer, nullable=True)

    oauth_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    spf_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dkim_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dmarc_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    warmup_status: Mapped[WarmupStatus] = mapped_column(
        SAEnum(WarmupStatus, name="warmup_status"),
        nullable=False,
        default=WarmupStatus.pending,
    )
    daily_target: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    current_day: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warmth_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    content_mode: Mapped[ContentMode] = mapped_column(
        SAEnum(ContentMode, name="content_mode"),
        nullable=False,
        default=ContentMode.A,
    )
    schedule_window_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("schedule_windows.id", ondelete="SET NULL"), nullable=True
    )
    # Per-mailbox peer-pool pin. Overrides the workspace's ClientPoolAssignment
    # in pairing. NULL = inherit the workspace assignment (default behaviour).
    pool_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("peer_pools.id", ondelete="SET NULL"), nullable=True
    )
    is_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Inbound CRM capture watermark — highest INBOX UID already scanned, scoped
    # by UIDVALIDITY so a folder reset forces a clean re-scan. Lets the capture
    # job classify each message exactly once instead of re-scanning the window.
    last_inbound_capture_uid: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    last_inbound_uidvalidity: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    __table_args__ = ()
