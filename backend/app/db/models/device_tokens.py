"""device_tokens — Expo push tokens for the WarmPulse mobile app.

One row per (device, install). The mobile app registers its Expo push token
after login; ``push_service`` reads these to fan a notification out to a user's
devices. Token is unique — a re-register from the same device upserts the
owning ``user_id`` (handles a phone shared/handed between accounts).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Expo push token, e.g. "ExponentPushToken[xxxxxxxx]".
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="android")
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
