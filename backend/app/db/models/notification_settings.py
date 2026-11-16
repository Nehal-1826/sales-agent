"""notification_settings — per-user notification channels (Slack/webhook/email)."""
from __future__ import annotations

import enum
import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class NotificationChannel(str, enum.Enum):
    email = "email"
    slack = "slack"
    webhook = "webhook"


class NotificationSetting(Base):
    __tablename__ = "notification_settings"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        SAEnum(NotificationChannel, name="notification_channel"),
        nullable=False,
    )
    target: Mapped[str] = mapped_column(String(512), nullable=False)
    event_types: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
