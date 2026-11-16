"""Users — platform actors (super_admin or client)."""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, LargeBinary, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk

_DEFAULT_NOTIFICATION_PREFS: dict[str, Any] = {
    "slack_webhook": None,
    "email_digest_enabled": True,
    "alerts": {"warmth_drop": True, "bounce_spike": True, "dns_break": True},
}


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    client = "client"


class OnboardingStatus(str, enum.Enum):
    signed_up = "signed_up"
    plan_selected = "plan_selected"
    mailbox_pending = "mailbox_pending"
    active = "active"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True, default=uuid.uuid4)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.client,
    )
    onboarding_status: Mapped[OnboardingStatus] = mapped_column(
        SAEnum(OnboardingStatus, name="onboarding_status"),
        nullable=False,
        default=OnboardingStatus.signed_up,
    )
    totp_secret_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_verification_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    is_suspended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Billing (dummy gateway): auto-renew toggle + the next monthly renewal
    # date. ``next_billing_date`` is stamped today+1mo on every successful plan
    # payment; the daily billing beat jobs read these.
    auto_pay_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    next_billing_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Profile picture stored as raw bytes (NOT Fernet-encrypted — an avatar is
    # not a secret). Capped at ~512KB by the upload endpoint; served back via
    # GET /api/workspace/settings/profile/avatar and the admin avatar route.
    avatar_image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en-US")
    notification_prefs: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=lambda: dict(_DEFAULT_NOTIFICATION_PREFS)
    )
    tour_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
