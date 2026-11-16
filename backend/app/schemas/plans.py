"""Pydantic v2 schemas for Plan CRUD endpoints.

Plans back the public pricing page and gate capabilities. Only super_admins
can create, update, or (soft) delete plans — all other reads are public.
"""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field


class PlanBase(BaseModel):
    """Fields common to create/update payloads."""

    name: str = Field(min_length=1, max_length=64)
    price_cents: int = Field(ge=0)
    max_mailboxes: int = Field(ge=1)
    daily_email_cap: int = Field(ge=1)
    token_cap_per_month: int = Field(ge=0)
    capabilities: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    is_public: bool = True
    sort_order: int = Field(default=0, ge=0)


class PlanCreate(PlanBase):
    """All fields required to spin up a new plan."""


class PlanUpdate(BaseModel):
    """Partial update — everything optional so PATCH can target single fields."""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    price_cents: int | None = Field(default=None, ge=0)
    max_mailboxes: int | None = Field(default=None, ge=1)
    daily_email_cap: int | None = Field(default=None, ge=1)
    token_cap_per_month: int | None = Field(default=None, ge=0)
    capabilities: dict[str, Any] | None = None
    is_active: bool | None = None
    is_public: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


class PlanOut(BaseModel):
    """Public plan projection — used by landing page + admin list."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    price_cents: int
    max_mailboxes: int
    daily_email_cap: int
    token_cap_per_month: int
    capabilities: dict[str, Any]
    is_active: bool
    is_public: bool
    sort_order: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def price_display(self) -> str:
        return f"${self.price_cents / 100:.0f}"
