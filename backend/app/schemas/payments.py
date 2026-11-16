"""Pydantic v2 schemas for dummy payment flows.

We accept raw card details on the wire (matching what a real gateway form
would collect), immediately strip PAN/CVC in the service layer, and persist
only the last 4 digits. This lets us swap in a real gateway later without
changing callers or DB shape.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.auth import UserResponse

# ---------- requests ----------


CardNumber = Annotated[str, StringConstraints(min_length=13, max_length=19)]
Cvc = Annotated[str, StringConstraints(min_length=3, max_length=4)]
ExpiryMmYy = Annotated[str, StringConstraints(pattern=r"^\d{2}/\d{2}$")]
CardholderName = Annotated[str, StringConstraints(min_length=1, max_length=128)]
CountryCode = Annotated[
    str, StringConstraints(min_length=2, max_length=2, to_upper=True)
]
# VPA = "<handle>@<provider>", e.g. "alice@okaxis", "9876543210@ybl".
# NPCI's spec is loose; we accept the same charset most aggregators do
# (alnum + dot/dash/underscore on either side).
UpiVpa = Annotated[
    str,
    StringConstraints(
        min_length=5, max_length=255, pattern=r"^[A-Za-z0-9._\-]{2,}@[A-Za-z0-9.\-]{2,}$"
    ),
]


class DummyPaymentRequest(BaseModel):
    """Fake card intake. PAN + CVC are dropped immediately in the service."""

    plan_id: uuid.UUID
    card_number: CardNumber
    cvc: Cvc
    expiry_mmyy: ExpiryMmYy
    cardholder_name: CardholderName
    country: CountryCode


class UpiPaymentRequest(BaseModel):
    """Fake UPI intake. The VPA is persisted (no PII beyond what the user typed)."""

    plan_id: uuid.UUID
    vpa: UpiVpa


# ---------- responses ----------


class PaymentOut(BaseModel):
    """Projection for both /payments/me and /admin/payments."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: str | None = None
    user_email: str | None = None
    amount_cents: int
    status: str
    dummy_card_last4: str | None = None
    dummy_upi_vpa: str | None = None
    payment_method: str | None = None
    created_at: datetime


class DummyPaymentResponse(BaseModel):
    """What POST /payments/dummy and /payments/upi return — row + refreshed user."""

    payment: PaymentOut
    user: UserResponse


class PaymentListResponse(BaseModel):
    """Paginated admin list response."""

    items: list[PaymentOut]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)


# ---------- payment methods ----------


PaymentMethodKind = Annotated[str, StringConstraints(pattern=r"^(card|upi)$")]


class AddPaymentMethodRequest(BaseModel):
    """Payload for ``POST /payments/methods``.

    Only one of ``card_number`` / ``upi_vpa`` is required, picked by ``kind``.
    PAN + CVC are dropped in the service the same way they are for
    ``/payments/dummy`` — only ``last4`` ever reaches the database.
    """

    model_config = ConfigDict(extra="forbid")

    kind: PaymentMethodKind
    label: Annotated[str, StringConstraints(max_length=128)] | None = None
    # Card fields (required when kind == 'card').
    card_number: CardNumber | None = None
    cvc: Cvc | None = None
    expiry_mmyy: ExpiryMmYy | None = None
    cardholder_name: CardholderName | None = None
    country: CountryCode | None = None
    # UPI field (required when kind == 'upi').
    upi_vpa: UpiVpa | None = None


class PaymentMethodOut(BaseModel):
    """Single payment-method projection.

    Methods are derived from the payment history — we never persist
    free-floating cards. The id is a deterministic synthesis of
    ``kind:identifier`` so the client can compare across refetches.
    """

    id: str
    kind: str  # "card" | "upi"
    label: str
    sub: str | None = None
    is_default: bool


class PaymentMethodsResponse(BaseModel):
    items: list[PaymentMethodOut]


# ---------- Cashfree ----------


class CashfreeOrderRequest(BaseModel):
    """Body for ``POST /payments/cashfree/order`` (one-time charge)."""

    model_config = ConfigDict(extra="forbid")

    plan_id: uuid.UUID


class CashfreeSubscriptionRequest(BaseModel):
    """Body for ``POST /payments/cashfree/subscription`` (auto-pay)."""

    model_config = ConfigDict(extra="forbid")

    plan_id: uuid.UUID


class CashfreeVerifyRequest(BaseModel):
    """Body for ``POST /payments/cashfree/verify`` — the client confirm."""

    model_config = ConfigDict(extra="forbid")

    order_id: str


class CashfreeOrderOut(BaseModel):
    """What ``POST /payments/cashfree/order`` returns — Checkout open params."""

    payment_session_id: str
    order_id: str


class CashfreeSubscriptionOut(BaseModel):
    """What ``POST /payments/cashfree/subscription`` returns — Checkout params."""

    payment_session_id: str
    subscription_id: str


# ---------- admin edit ----------


class PaymentUpdate(BaseModel):
    """PATCH /admin/payments/{payment_id} — both fields optional, at least one required."""

    model_config = ConfigDict(extra="forbid")

    status: str | None = None  # PaymentStatus value string
    amount_cents: int | None = Field(default=None, ge=0)

    def has_any(self) -> bool:
        return self.status is not None or self.amount_cents is not None
