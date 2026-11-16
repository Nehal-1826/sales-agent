"""Payments — dummy gateway + admin reporting.

 * ``POST /api/payments/dummy`` — client hands us (fake) card details, we
   record a succeeded row and bump onboarding.
 * ``GET  /api/payments/me`` — the signed-in user's history.
 * ``GET  /api/admin/payments`` — super_admin list w/ filters.
 * ``GET  /api/admin/payments/export.csv`` — streaming CSV export.

Handlers stay ≤40 lines — all logic lives in ``payments_service``.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_super_admin
from app.config import get_settings
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.payments import (
    AddPaymentMethodRequest,
    DummyPaymentRequest,
    DummyPaymentResponse,
    PaymentListResponse,
    PaymentMethodOut,
    PaymentMethodsResponse,
    PaymentOut,
    PaymentUpdate,
    CashfreeOrderOut,
    CashfreeOrderRequest,
    CashfreeSubscriptionOut,
    CashfreeSubscriptionRequest,
    CashfreeVerifyRequest,
    UpiPaymentRequest,
)
from app.schemas.addons import AddonOut, AutoPayUpdate
from app.services import (
    addons_service,
    auth_service,
    payments_service,
    cashfree_service,
    stripe_service,
)

router = APIRouter(prefix="/api", tags=["payments"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


def _payment_out(payment, plan_name: str | None, user_email: str | None) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        user_id=payment.user_id,
        plan_id=payment.plan_id,
        plan_name=plan_name,
        user_email=user_email,
        amount_cents=payment.amount_cents,
        status=payment.status.value if hasattr(payment.status, "value") else str(payment.status),
        dummy_card_last4=payment.dummy_card_last4,
        dummy_upi_vpa=payment.dummy_upi_vpa,
        payment_method=payment.payment_method,
        created_at=payment.created_at,
    )


@router.post("/payments/cancel", status_code=204)
async def cancel_subscription(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Cancel the current user's subscription (dummy logic for all plans).
    
    This suspends the user and explicitly triggers the revenge check logic.
    """
    user.is_suspended = True
    from app.services.revenge_service import check_and_trigger_revenge
    await check_and_trigger_revenge(session, user)
    await session.commit()


@router.post("/payments/quick-upgrade", status_code=204)
async def quick_upgrade(
    plan_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Switch the signed-in user's plan via the in-app plan switcher.

    Validates the target is a purchasable (active + public, or already-held)
    tier and runs the standard plan transition. It does NOT touch suspension
    state — a suspended user can't reach this route at all (deps blocks them),
    and un-suspending is admin-only.
    """
    try:
        plan_uuid = uuid.UUID(plan_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid plan id") from exc

    await payments_service.switch_plan(session, user=user, plan_id=plan_uuid)


@router.post("/payments/dummy", response_model=DummyPaymentResponse)
async def dummy_payment(
    payload: DummyPaymentRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DummyPaymentResponse:
    payment, refreshed_user = await payments_service.record_dummy_payment(
        session,
        user=user,
        plan_id=payload.plan_id,
        card_number=payload.card_number,
        cvc=payload.cvc,
        expiry_mmyy=payload.expiry_mmyy,
        cardholder_name=payload.cardholder_name,
        country=payload.country,
        ip=_client_ip(request),
    )
    user_resp = await auth_service.build_me_response(session, refreshed_user)
    out = _payment_out(payment, plan_name=user_resp.plan, user_email=refreshed_user.email)
    return DummyPaymentResponse(payment=out, user=user_resp)


class CrmAddonRequest(BaseModel):
    """Optional dummy card for the CRM add-on checkout (last4 only is kept)."""

    model_config = ConfigDict(extra="forbid")

    card_number: str | None = None


class CrmAddonResponse(BaseModel):
    crm_addon: bool


@router.post("/payments/crm-addon", response_model=CrmAddonResponse)
async def purchase_crm_addon(
    payload: CrmAddonRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CrmAddonResponse:
    """Unlock the CRM add-on for the caller's workspace via the dummy gateway."""
    last4 = payload.card_number[-4:] if payload.card_number else None
    ws = await payments_service.purchase_crm_addon(
        session, user=user, card_last4=last4, ip=_client_ip(request)
    )
    return CrmAddonResponse(crm_addon=bool(ws.crm_addon_enabled))


class BillingStatusResponse(BaseModel):
    auto_pay_enabled: bool
    next_billing_date: str | None


@router.get("/payments/billing-status", response_model=BillingStatusResponse)
async def billing_status(
    user: Annotated[User, Depends(get_current_user)],
) -> BillingStatusResponse:
    return BillingStatusResponse(
        auto_pay_enabled=bool(user.auto_pay_enabled),
        next_billing_date=user.next_billing_date.isoformat() if user.next_billing_date else None,
    )


@router.patch("/payments/auto-pay", response_model=BillingStatusResponse)
async def set_auto_pay(
    payload: AutoPayUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BillingStatusResponse:
    """Toggle dummy auto-renew for the signed-in user."""
    updated = await payments_service.set_auto_pay(session, user=user, enabled=payload.enabled)
    return BillingStatusResponse(
        auto_pay_enabled=bool(updated.auto_pay_enabled),
        next_billing_date=updated.next_billing_date.isoformat() if updated.next_billing_date else None,
    )


@router.get("/payments/addons", response_model=list[AddonOut])
async def list_addons(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[AddonOut]:
    """Active add-on catalogue with a per-caller ``owned`` flag."""
    addons = await addons_service.list_active_addons(session)
    owned = await addons_service.owned_addon_ids(session, user.workspace_id)
    return [AddonOut.model_validate(a).model_copy(update={"owned": a.id in owned}) for a in addons]


@router.post("/payments/addons/{key}", response_model=AddonOut)
async def buy_addon(
    key: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AddonOut:
    """Buy an add-on via the dummy gateway (idempotent if already owned)."""
    addon = await payments_service.purchase_addon(
        session, user=user, addon_key=key, ip=_client_ip(request)
    )
    return AddonOut.model_validate(addon).model_copy(update={"owned": True})


@router.post("/payments/upi", response_model=DummyPaymentResponse)
async def dummy_upi_payment(
    payload: UpiPaymentRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DummyPaymentResponse:
    payment, refreshed_user = await payments_service.record_dummy_upi_payment(
        session,
        user=user,
        plan_id=payload.plan_id,
        vpa=payload.vpa,
        ip=_client_ip(request),
    )
    user_resp = await auth_service.build_me_response(session, refreshed_user)
    out = _payment_out(payment, plan_name=user_resp.plan, user_email=refreshed_user.email)
    return DummyPaymentResponse(payment=out, user=user_resp)


@router.get("/payments/me", response_model=list[PaymentOut])
async def my_payments(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[PaymentOut]:
    rows = await payments_service.list_payments_for_user(session, user)
    return [_payment_out(p, plan_name, email) for p, plan_name, email in rows]


@router.get("/admin/payments", response_model=PaymentListResponse)
async def admin_list_payments(
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    user_email: str | None = None,
    plan_id: uuid.UUID | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> PaymentListResponse:
    rows, total = await payments_service.list_all_payments(
        session,
        status_filter=status_filter,
        user_email=user_email,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    items = [_payment_out(p, plan_name, email) for p, plan_name, email in rows]
    return PaymentListResponse(items=items, page=page, page_size=page_size, total=total)


@router.patch("/admin/payments/{payment_id}", response_model=PaymentOut)
async def admin_update_payment(
    payment_id: uuid.UUID,
    body: PaymentUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> PaymentOut:
    """Update a payment's status and/or amount_cents (super_admin only).

    At least one of ``status`` or ``amount_cents`` must be present.
    Returns the updated payment projection.
    """
    if not body.has_any():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one of 'status' or 'amount_cents' must be provided.",
        )
    payment = await payments_service.update_payment(
        session,
        payment_id=payment_id,
        new_status=body.status,
        amount_cents=body.amount_cents,
        actor=actor,
    )
    return _payment_out(payment, plan_name=None, user_email=None)


# --------------------------------------------------------------------------- #
# Stripe checkout + webhook                                                    #
# --------------------------------------------------------------------------- #


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: uuid.UUID


class CheckoutResponse(BaseModel):
    url: str
    session_id: str


@router.post("/payments/checkout", response_model=CheckoutResponse)
async def start_checkout(
    payload: CheckoutRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CheckoutResponse:
    """Create a Stripe Checkout session and return its redirect URL.

    Returns 503 when Stripe isn't configured on this deployment so the
    frontend can fall through to the dummy-payment path.
    """
    plan = await session.get(Plan, payload.plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=404, detail="Plan not found")

    settings = get_settings()
    try:
        sess = await stripe_service.create_checkout_session(
            settings, user=user, plan=plan
        )
    except stripe_service.StripeNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except stripe_service.StripeWebhookError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CheckoutResponse(
        url=str(sess.get("url") or ""), session_id=str(sess.get("id") or "")
    )


@router.post("/payments/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, object]:
    """Stripe webhook receiver. Always returns 2xx unless the signature is bad.

    No auth — the signature is the auth. Idempotency is enforced by the
    ``stripe_events`` table (primary key = Stripe event id).
    """
    settings = get_settings()
    if not settings.stripe_enabled:
        # Don't 200 a misconfigured deployment; Stripe will retry, surfacing
        # the issue in the dashboard quickly.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhook secret is not configured",
        )

    body = await request.body()
    try:
        event = stripe_service.verify_webhook(
            body=body,
            signature_header=stripe_signature,
            secret=settings.stripe_webhook_secret,
        )
    except stripe_service.StripeWebhookError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await stripe_service.handle_event(session, event)


# --------------------------------------------------------------------------- #
# Cashfree — Orders (one-time) + Subscriptions (auto-pay) + verify + webhook   #
# --------------------------------------------------------------------------- #


@router.post("/payments/cashfree/order", response_model=CashfreeOrderOut)
async def cashfree_order(
    payload: CashfreeOrderRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CashfreeOrderOut:
    """Create a Cashfree Order for a one-time charge and return Checkout params.

    Returns 503 when Cashfree isn't configured on this deployment so the
    frontend can fall through to the dummy-payment path.
    """
    settings = get_settings()
    if not settings.cashfree_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cashfree is not configured",
        )
    plan = await payments_service._resolve_purchasable_plan(
        session, user, payload.plan_id
    )
    try:
        order = await cashfree_service.create_order(session, settings, user, plan)
    except cashfree_service.CashfreeNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except cashfree_service.CashfreeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CashfreeOrderOut(
        payment_session_id=str(order.get("payment_session_id") or ""),
        order_id=str(order.get("order_id") or ""),
    )


@router.post("/payments/cashfree/subscription", response_model=CashfreeSubscriptionOut)
async def cashfree_subscription(
    payload: CashfreeSubscriptionRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> CashfreeSubscriptionOut:
    """Create a Cashfree Subscription (auto-pay) and return Checkout params.

    Returns 503 when Cashfree isn't configured so the frontend can fall
    through to the dummy-payment path.
    """
    settings = get_settings()
    if not settings.cashfree_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cashfree is not configured",
        )
    plan = await payments_service._resolve_purchasable_plan(
        session, user, payload.plan_id
    )
    try:
        sub = await cashfree_service.create_subscription(
            session, settings, user, plan
        )
    except cashfree_service.CashfreeNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except cashfree_service.CashfreeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # The lazily-created Cashfree Plan id was flushed onto the plan row inside
    # create_subscription; commit it so it survives.
    await session.commit()

    return CashfreeSubscriptionOut(
        payment_session_id=str(sub.get("payment_session_id") or ""),
        subscription_id=str(sub.get("subscription_id") or ""),
    )


@router.post("/payments/cashfree/verify", response_model=DummyPaymentResponse)
async def cashfree_verify(
    payload: CashfreeVerifyRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DummyPaymentResponse:
    """Client confirm after the Cashfree Checkout modal closes."""
    settings = get_settings()
    if not settings.cashfree_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cashfree is not configured",
        )

    ok = await cashfree_service.verify_checkout_status(
        key_id=settings.cashfree_key_id,
        key_secret=settings.cashfree_key_secret,
        order_id=payload.order_id,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment not verified",
        )

    payment, refreshed_user = await payments_service.record_cashfree_payment(
        session,
        user=user,
        cashfree_payment_id="dummy_" + payload.order_id,
        cashfree_order_id=payload.order_id,
        cashfree_subscription_id=None,
        ip=_client_ip(request),
    )
    user_resp = await auth_service.build_me_response(session, refreshed_user)
    out = _payment_out(payment, plan_name=user_resp.plan, user_email=refreshed_user.email)
    return DummyPaymentResponse(payment=out, user=user_resp)


@router.post("/payments/cashfree/webhook", include_in_schema=False)
async def cashfree_webhook(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
    cashfree_signature: Annotated[
        str | None, Header(alias="X-Cashfree-Signature")
    ] = None,
) -> dict[str, object]:
    """Cashfree webhook receiver. The signature is the auth (no bearer token).

    Returns 503 when the webhook secret isn't configured (so Cashfree retries
    and the misconfiguration surfaces), 400 on a bad signature. Idempotency is
    enforced by the ``cashfree_events`` table (primary key = event id).
    """
    settings = get_settings()
    if not settings.cashfree_enabled or not settings.cashfree_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cashfree webhook secret is not configured",
        )

    body = await request.body()
    if not cashfree_service.verify_webhook(
        body, cashfree_signature or "", settings.cashfree_webhook_secret
    ):
        raise HTTPException(status_code=400, detail="Invalid Cashfree signature")

    import json as _json

    try:
        event = _json.loads(body.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400, detail="Webhook body is not valid JSON"
        ) from exc

    await cashfree_service.handle_event(session, event)
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# Payment methods (derived from payment history; dummy gateway)                #
# --------------------------------------------------------------------------- #


@router.get("/payments/methods", response_model=PaymentMethodsResponse)
async def list_payment_methods(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentMethodsResponse:
    """Methods on file for the signed-in user, derived from payment history.

    The first row in the response is flagged as the default.
    """
    items = await payments_service.list_payment_methods_for_user(session, user)
    return PaymentMethodsResponse(items=items)


@router.post(
    "/payments/methods",
    response_model=PaymentMethodOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_payment_method(
    payload: AddPaymentMethodRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentMethodOut:
    """Register a payment method on the user's account.

    Records a zero-amount payment row tagged ``payment_method=method_*`` so
    the existing payment-history scan picks it up as a derived method. PAN
    and CVC are dropped immediately (same handling as ``/payments/dummy``).
    Returns the synthesised :class:`PaymentMethodOut` projection so the
    frontend can append it to the list without a refetch.
    """
    return await payments_service.register_payment_method(
        session,
        user=user,
        payload=payload,
        ip=_client_ip(request),
    )


# --------------------------------------------------------------------------- #
# Invoice download (PDF / CSV)                                                  #
# --------------------------------------------------------------------------- #


@router.get("/payments/{payment_id}/invoice.pdf")
async def download_invoice_pdf(
    payment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stream a one-page PDF invoice for a single payment.

    Requires the optional ``reportlab`` dependency. When it's missing we
    return 501 with a hint so the caller can fall back to the CSV path.
    """
    body, content_type, filename = await payments_service.build_invoice_pdf(
        session, user=user, payment_id=payment_id
    )
    return Response(
        content=body,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payments/{payment_id}/invoice.csv")
async def download_invoice_csv(
    payment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stream a CSV invoice for a single payment.

    Always available — no third-party deps. Useful as the fallback when
    the PDF endpoint returns 501.
    """
    body, content_type, filename = await payments_service.build_invoice_csv(
        session, user=user, payment_id=payment_id
    )
    return Response(
        content=body,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/payments/export.csv")
async def admin_export_payments(
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    user_email: str | None = None,
    plan_id: uuid.UUID | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> StreamingResponse:
    generator = payments_service.iter_all_payments_for_csv(
        session,
        status_filter=status_filter,
        user_email=user_email,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
    )
    return StreamingResponse(
        generator,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="payments.csv"'},
    )
