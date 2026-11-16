"""Plans — admin-editable tiers backing the public pricing page and gating capabilities."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_mailboxes: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    daily_email_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    token_cap_per_month: Mapped[int] = mapped_column(Integer, nullable=False, default=30_000)
    capabilities: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Public visibility. ``is_active`` soft-deletes (kills the plan for everyone);
    # ``is_public=False`` keeps the plan live for existing subscribers + admins
    # but hides it from the public pricing page / sign-up / onboarding picker.
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    # Display order on the public pricing page / onboarding picker. Lower shows
    # first. Admin-editable on /admin/plans; ties broken by price ascending.
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    # Cached Cashfree Plan id — created lazily on the first subscription for
    # this tier (see services/cashfree_service.create_subscription) so we don't
    # re-create a Cashfree plan on every checkout.
    cashfree_plan_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = created_at_col()
