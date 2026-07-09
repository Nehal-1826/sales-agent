"""Pydantic schemas for the add-on catalogue + purchase responses."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field


class AddonOut(BaseModel):
    """Public add-on projection (catalogue + per-caller ``owned`` flag)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    description: str
    price_cents: int
    is_active: bool
    sort_order: int
    owned: bool = False

    @computed_field  # type: ignore[prop-decorator]
    @property
    def price_display(self) -> str:
        return f"₹{self.price_cents / 100:.0f}"


class AddonCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    price_cents: int = Field(ge=0)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)


class AddonUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    price_cents: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


class AutoPayUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
