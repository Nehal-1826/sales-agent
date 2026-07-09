"""webhooks — outbound HTTP webhook subscriptions + delivery audit.

Two tables:

* ``webhooks`` — one row per registered destination URL in a workspace.
  Each row holds a Fernet-encrypted shared secret (used to HMAC-SHA256-sign
  the body) and a list of event keys it subscribes to. ``last_delivery_at``
  + ``last_status`` are denormalised projections of the most recent
  ``WebhookDelivery`` row, refreshed on every send.
* ``webhook_deliveries`` — append-only delivery log. One row per attempt
  (so retries get distinct rows). Status is ``ok`` / ``failed`` /
  ``dead_letter`` / ``rate_limited`` / ``ssrf_blocked``. The HTTP response
  code is captured when we made a real request; ``error_text`` captures
  the failure reason when we didn't (SSRF refusal, timeout class, etc).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    secret_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    events: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = created_at_col()
    last_delivery_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status: Mapped[str | None] = mapped_column(String(32), nullable=True)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = uuid_pk()
    webhook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at_col()
