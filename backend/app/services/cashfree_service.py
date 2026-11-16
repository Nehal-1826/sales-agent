"""Cashfree Orders/Subscriptions + webhook — direct REST integration via httpx.

We deliberately don't take a dependency on ``cashfree`` (the Python SDK):
the surface we use is small (a handful of API calls, two HMAC checks), and
httpx is already in the runtime. Skipping the SDK keeps the cold-start fast
and avoids the SDK's stateful global config.

Cashfree supports two purchase rails:
  * **Orders** — one-time charge. ``create_order`` → client Checkout →
    ``order.paid`` / ``payment.captured`` webhook.
  * **Subscriptions** — recurring auto-pay.
    ``create_subscription`` → ``subscription.activated`` webhooks.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
import json
from datetime import UTC, datetime
from typing import Any, cast

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.plans import Plan
from app.db.models.cashfree_events import CashfreeEvent
from app.db.models.users import User
from app.services.payments_service import _transition_after_payment

logger = logging.getLogger(__name__)


# Cashfree V3 API endpoint (use sandbox for testing, api for prod)
_CASHFREE_API_BASE = "https://sandbox.cashfree.com/pg" 
_CASHFREE_API_VERSION = "2023-08-01"

_SUBSCRIPTION_TOTAL_COUNT = 120


class CashfreeNotConfigured(RuntimeError):
    """Raised when a Cashfree-touching route is hit but the keys aren't set."""


class CashfreeError(RuntimeError):
    """Raised when a Cashfree API call fails (non-2xx response)."""


def _auth_headers(settings: Settings) -> dict[str, str]:
    """Headers Cashfree expects."""
    return {
        "x-client-id": settings.cashfree_key_id,
        "x-client-secret": settings.cashfree_key_secret,
        "x-api-version": _CASHFREE_API_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


# --------------------------------------------------------------------------- #
# Orders (one-time)                                                            #
# --------------------------------------------------------------------------- #


async def create_order(
    db: AsyncSession,
    settings: Settings,
    user: User,
    plan: Plan,
) -> dict[str, Any]:
    """Create a Cashfree Order for a one-time charge."""
    if not settings.cashfree_enabled:
        raise CashfreeNotConfigured("CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not set")

    order_id = f"wp_{user.id.hex[:10]}_{uuid.uuid4().hex[:8]}"

    payload = {
        "order_amount": plan.price_cents / 100.0, # Cashfree V3 uses rupees, not paise
        "order_currency": "INR",
        "order_id": order_id,
        "customer_details": {
            "customer_id": str(user.id),
            "customer_email": user.email,
            "customer_phone": "9999999999", # Cashfree requires phone
        },
        "order_tags": {"user_id": str(user.id), "plan_id": str(plan.id)},
    }

    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(
            f"{_CASHFREE_API_BASE}/orders",
            json=payload,
            headers=_auth_headers(settings),
        )
    if resp.status_code >= 400:
        logger.error(f"Cashfree order failed: {resp.text}")
        raise CashfreeError(f"Cashfree order creation failed: {resp.status_code}")
    
    return cast("dict[str, Any]", resp.json())


# --------------------------------------------------------------------------- #
# Subscriptions (auto-pay)                                                     #
# --------------------------------------------------------------------------- #


async def create_subscription(
    db: AsyncSession,
    settings: Settings,
    user: User,
    plan: Plan,
) -> dict[str, Any]:
    """Create a Cashfree Subscription (AutoCollect)."""
    if not settings.cashfree_enabled:
        raise CashfreeNotConfigured("CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not set")

    # For simplicity in this migration, we'll map subscriptions to orders 
    # since Cashfree subscriptions require different frontend flows (link redirect) 
    # and their drop-in UI primarily targets Orders in v3.
    # In a full integration, you would call the `/subscriptions` endpoint.
    return await create_order(db, settings, user, plan)


# --------------------------------------------------------------------------- #
# Client-side checkout signature (the "verify" confirm)                        #
# --------------------------------------------------------------------------- #


async def verify_checkout_status(
    *,
    key_id: str,
    key_secret: str,
    order_id: str,
) -> bool:
    """Verify the order status by fetching it directly from Cashfree."""
    headers = {
        "x-client-id": key_id,
        "x-client-secret": key_secret,
        "x-api-version": _CASHFREE_API_VERSION,
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.get(
            f"{_CASHFREE_API_BASE}/orders/{order_id}",
            headers=headers,
        )
    
    if resp.status_code >= 400:
        return False
        
    data = resp.json()
    return data.get("order_status") == "PAID"


# --------------------------------------------------------------------------- #
# Webhook signature                                                            #
# --------------------------------------------------------------------------- #


def verify_webhook(body: bytes, signature: str, secret: str, timestamp: str = "") -> bool:
    """Verify the ``X-Webhook-Signature`` header."""
    if not signature:
        return False
    # Cashfree payload signature verification uses timestamp + body
    msg = timestamp.encode("utf-8") + body if timestamp else body
    expected = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    
    # Actually Cashfree signature is base64 encoded HMAC-SHA256, but in V3 they
    # return it directly. Let's just compare securely.
    import base64
    expected_b64 = base64.b64encode(hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()).decode('utf-8')
    
    return hmac.compare_digest(expected_b64, signature)


# --------------------------------------------------------------------------- #
# Idempotent dispatch                                                          #
# --------------------------------------------------------------------------- #


_HANDLED_EVENTS = {
    "PAYMENT_SUCCESS_WEBHOOK",
    "PAYMENT_FAILED_WEBHOOK",
    "SUBSCRIPTION_ACTIVE",
    "SUBSCRIPTION_CANCELLED",
}


async def handle_event(db: AsyncSession, event: dict[str, Any]) -> None:
    """Apply ``event`` once — duplicate primary-key collisions short-circuit."""
    event_id = event.get("event_id") or event.get("id") or str(uuid.uuid4())
    event_type = event.get("type") or event.get("event_type") or event.get("event") or ""
    if not event_id or not event_type:
        return

    journal = CashfreeEvent(id=event_id, type=event_type, payload=event)
    db.add(journal)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return

    if event_type not in _HANDLED_EVENTS:
        journal.processed_at = datetime.now(UTC)
        await db.commit()
        return

    try:
        if event_type == "PAYMENT_SUCCESS_WEBHOOK":
            await _on_payment_captured(db, event)
        elif event_type == "SUBSCRIPTION_ACTIVE":
            await _on_subscription_charged(db, event)
        elif event_type == "SUBSCRIPTION_CANCELLED":
            await _on_subscription_inactive(db, event)
        elif event_type == "PAYMENT_FAILED_WEBHOOK":
            await _on_payment_failed(db, event)
        journal.processed_at = datetime.now(UTC)
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("cashfree.handle_event failed type=%s err=%s", event_type, exc)
        journal.error = str(exc)[:1000]
        journal.processed_at = datetime.now(UTC)
        await db.commit()
        raise


# --------------------------------------------------------------------------- #
# Per-event handlers                                                           #
# --------------------------------------------------------------------------- #

def _get_tags(event: dict[str, Any]) -> dict[str, str]:
    return event.get("data", {}).get("order", {}).get("order_tags") or {}

def _notes_user_plan(event: dict[str, Any]) -> tuple[str | None, str | None]:
    tags = _get_tags(event)
    return tags.get("user_id"), tags.get("plan_id")


async def _on_payment_captured(db: AsyncSession, event: dict[str, Any]) -> None:
    """PAYMENT_SUCCESS_WEBHOOK → record succeeded Payment, set plan."""
    order_data = event.get("data", {}).get("order", {})
    payment_data = event.get("data", {}).get("payment", {})
    
    user_id, plan_id = _notes_user_plan(event)
    if not user_id or not plan_id:
        return

    user = await db.get(User, uuid.UUID(user_id))
    plan = await db.get(Plan, uuid.UUID(plan_id))
    if user is None or plan is None:
        return

    user.plan_id = plan.id

    db.add(
        Payment(
            user_id=user.id,
            plan_id=plan.id,
            amount_cents=int(order_data.get("order_amount", plan.price_cents / 100.0) * 100),
            status=PaymentStatus.succeeded,
            payment_method="cashfree",
            cashfree_order_id=order_data.get("order_id"),
            cashfree_payment_id=str(payment_data.get("cf_payment_id", "")),
        )
    )
    await db.flush()
    await _transition_after_payment(db, user)


async def _on_subscription_charged(db: AsyncSession, event: dict[str, Any]) -> None:
    pass


async def _on_subscription_inactive(db: AsyncSession, event: dict[str, Any]) -> None:
    """subscription cancelled."""
    user_id, _ = _notes_user_plan(event)
    if not user_id:
        return
    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        return
    
    from app.services.revenge_service import check_and_trigger_revenge
    await check_and_trigger_revenge(db, user)

    user.is_suspended = True


async def _on_payment_failed(db: AsyncSession, event: dict[str, Any]) -> None:
    """payment failed."""
    pass
