"""cashfree_events — webhook idempotency journal.

Cashfree (like Stripe) can deliver the same webhook more than once. We
INSERT into this table before doing any side effects; a primary-key collision
is the signal to short-circuit and return the same 2xx the original handler
returned. The PK is the Cashfree event id.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col


class CashfreeEvent(Base):
    __tablename__ = "cashfree_events"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    received_at: Mapped[datetime] = created_at_col()
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
