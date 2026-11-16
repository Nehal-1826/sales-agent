"""daily_metrics — per-mailbox per-day rollup for charts."""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import BigInteger, Date, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    mailbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)

    emails_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    emails_received: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    opens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    replies: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spam_rescues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bounce_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inbox_placement_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    warmth_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint("mailbox_id", "date", name="uq_daily_metrics_mailbox_date"),
    )
