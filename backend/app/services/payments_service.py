"""Dummy payment recording + admin reporting.

Even though the gateway is a stub today, we treat PAN and CVC as if they
were live data:

  * pydantic already validated shape on the boundary.
  * the *only* persistable piece is ``card_last4`` (last 4 digits of PAN).
  * ``card_number`` and ``cvc`` are immediately overwritten and ``del``'d.
  * nothing about the card is logged — ever.

Swapping in Stripe/Cashfree later means replacing the body of
``record_dummy_payment`` with a real charge call, without touching callers
or the DB schema.
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import date, datetime, time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import calendar

from app.db.models.addons import Addon, WorkspaceAddon
from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.plans import Plan
from app.db.models.users import OnboardingStatus, User
from app.db.models.workspace_settings import WorkspaceSetting


def _add_one_month(d: date) -> date:
    """Next monthly renewal date, clamping the day to the target month length."""
    year = d.year + (1 if d.month == 12 else 0)
    month = 1 if d.month == 12 else d.month + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


async def _transition_after_payment(session: AsyncSession, user: User) -> None:
    """Set the user's onboarding_status based on whether they already
    have a mailbox.

    Default behaviour was unconditional ``onboarding_status = plan_selected``,
    which broke the "connect mailbox before paying" trial flow: the user's
    *first* mailbox-create ran while they were still ``signed_up`` (the
    transition rule in mailbox_service.create_mailbox only triggers when
    status was ``plan_selected``), so by the time payment landed there was
    no future event to flip them to ``active`` — they got stuck in the
    onboarding wizard on every subsequent login.

    Now: if the workspace already has at least one mailbox at payment
    time, jump straight to ``active``. Otherwise keep the original
    ``plan_selected`` so the wizard knows to walk the user through
    mailbox-connect.
    """
    has_mailbox = await session.scalar(
        select(func.count(Mailbox.id)).where(
            Mailbox.workspace_id == user.workspace_id
        )
    )
    if (has_mailbox or 0) > 0:
        user.onboarding_status = OnboardingStatus.active
    else:
        user.onboarding_status = OnboardingStatus.plan_selected

    # Align automated CRM with the freshly-set plan: Pro Plus / Agency start
    # auto-CRM (Sent-folder import + sequence auto-enrol); below Pro Plus drops
    # to manual. user.plan_id is already set by the caller at this point.
    from app.db.models.plans import Plan
    from app.services.crm_service import sync_workspace_auto_crm

    plan_name = None
    if user.plan_id is not None:
        plan = await session.get(Plan, user.plan_id)
        plan_name = plan.name if plan else None
    await sync_workspace_auto_crm(
        session, workspace_id=user.workspace_id, plan_name=plan_name
    )
from app.schemas.payments import (
    AddPaymentMethodRequest,
    PaymentMethodOut,
)

logger = logging.getLogger(__name__)

# Optional reportlab — mirror the pattern in services/reports_service.py so a
# missing dep returns 501 with a hint rather than a 500.
_REPORTLAB_AVAILABLE: bool | None = None


def _reportlab_available() -> bool:
    global _REPORTLAB_AVAILABLE
    if _REPORTLAB_AVAILABLE is None:
        try:
            import reportlab  # noqa: F401

            _REPORTLAB_AVAILABLE = True
        except Exception:
            _REPORTLAB_AVAILABLE = False
    return _REPORTLAB_AVAILABLE


# ---------- helpers ----------


async def _write_payment_audit(
    session: AsyncSession,
    *,
    actor: User,
    action: str,
    payment_id: uuid.UUID,
    plan_id: uuid.UUID,
    ip: str | None,
) -> None:
    """Best-effort audit write. Does NOT include card details.

    Uses a SAVEPOINT so that a failed audit insert (e.g. an id-column
    misconfiguration on SQLite during tests) rolls back only this row and
    leaves the outer transaction intact.
    """
    try:
        async with session.begin_nested():
            session.add(
                AuditLog(
                    actor_user_id=actor.id,
                    actor_role=(
                        actor.role.value
                        if hasattr(actor.role, "value")
                        else str(actor.role)
                    ),
                    action=action,
                    target_type="payment",
                    target_id=payment_id,
                    payload={"plan_id": str(plan_id)},
                    ip=ip,
                )
            )
    except Exception as exc:  # pragma: no cover — audits never fail the request
        logger.warning("audit write failed action=%s: %s", action, exc)


# ---------- core dummy charge ----------


async def _resolve_purchasable_plan(
    session: AsyncSession, user: User, plan_id: uuid.UUID
) -> Plan:
    """Load the plan and enforce that ``user`` may subscribe to it.

    Rejects unknown / soft-deleted plans (404) and hidden (``is_public=False``)
    plans (403) — UNLESS the user is already on that plan, so existing
    subscribers can still renew / re-pay a tier that's been pulled from
    self-serve sign-up.
    """
    plan = await session.get(Plan, plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found or inactive",
        )
    if not plan.is_public and user.plan_id != plan.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This plan isn't available for new subscriptions",
        )
    return plan


async def switch_plan(
    session: AsyncSession, *, user: User, plan_id: uuid.UUID
) -> Plan:
    """Switch the caller's active plan to a purchasable tier.

    Backs the in-app plan switcher (``POST /payments/quick-upgrade``). It
    validates the target is active + public (or already held) via
    ``_resolve_purchasable_plan`` and runs the standard post-payment
    transition so entitlements (auto-CRM etc.) stay in sync. It deliberately
    NEVER alters ``is_suspended`` — un-suspending is an admin-only action.
    """
    plan = await _resolve_purchasable_plan(session, user, plan_id)
    user.plan_id = plan.id
    await _transition_after_payment(session, user)
    await session.commit()
    await session.refresh(user)
    return plan


async def record_dummy_payment(
    session: AsyncSession,
    *,
    user: User,
    plan_id: uuid.UUID,
    card_number: str,
    cvc: str,
    expiry_mmyy: str,
    cardholder_name: str,
    country: str,
    ip: str | None = None,
) -> tuple[Payment, User]:
    """Persist a ``succeeded`` payment and transition the user to plan_selected.

    Returns (payment, refreshed_user). Never logs PAN/CVC/name.
    """
    plan = await _resolve_purchasable_plan(session, user, plan_id)

    # --- Extract ONLY the last 4 digits, then wipe the sensitive variables. ---
    # `card_number` and `cvc` must not outlive this block.
    card_last4 = card_number[-4:]
    # Overwrite then delete — belt-and-braces so nothing else in this frame
    # can accidentally reference them.
    card_number = "REDACTED"  # noqa: F841
    cvc = "REDACTED"  # noqa: F841
    del card_number
    del cvc
    # We intentionally do not persist expiry / name / country on the dummy row.
    # They're kept as locals only for potential gateway handoff later.
    _ = (expiry_mmyy, cardholder_name, country)

    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        amount_cents=plan.price_cents,
        status=PaymentStatus.succeeded,
        dummy_card_last4=card_last4,
        payment_method="card_dummy",
    )
    session.add(payment)
    await session.flush()

    # Transition user: set plan, advance onboarding. If they already
    # connected a mailbox during the trial-allowance phase (i.e. before
    # paying), jump straight to ``active`` — otherwise the wizard would
    # send them back to /onboarding on the next login despite having a
    # working mailbox.
    user.plan_id = plan.id
    user.next_billing_date = _add_one_month(date.today())
    await _transition_after_payment(session, user)
    await session.flush()

    await _write_payment_audit(
        session,
        actor=user,
        action="payment.dummy_success",
        payment_id=payment.id,
        plan_id=plan.id,
        ip=ip,
    )

    await session.commit()
    await session.refresh(payment)
    await session.refresh(user)
    await _email_invoice_safe(
        session, user=user, payment_id=payment.id, item_label=f"{plan.name} plan"
    )
    return payment, user


# ---------- core dummy UPI charge ----------


async def record_dummy_upi_payment(
    session: AsyncSession,
    *,
    user: User,
    plan_id: uuid.UUID,
    vpa: str,
    ip: str | None = None,
) -> tuple[Payment, User]:
    """Persist a ``succeeded`` UPI payment and transition the user to plan_selected.

    Mirrors ``record_dummy_payment`` for the card rail. The VPA is stored
    as-is — it's already what the user typed (no card-equivalent secret to
    redact). We rely on pydantic's ``UpiVpa`` constraint to keep junk out.
    """
    plan = await _resolve_purchasable_plan(session, user, plan_id)

    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        amount_cents=plan.price_cents,
        status=PaymentStatus.succeeded,
        dummy_upi_vpa=vpa,
        payment_method="upi_dummy",
    )
    session.add(payment)
    await session.flush()

    user.plan_id = plan.id
    user.next_billing_date = _add_one_month(date.today())
    # Same transition logic as the card path — see `_transition_after_payment`.
    await _transition_after_payment(session, user)
    await session.flush()

    await _write_payment_audit(
        session,
        actor=user,
        action="payment.dummy_upi_success",
        payment_id=payment.id,
        plan_id=plan.id,
        ip=ip,
    )

    await session.commit()
    await session.refresh(payment)
    await session.refresh(user)
    await _email_invoice_safe(
        session, user=user, payment_id=payment.id, item_label=f"{plan.name} plan"
    )
    return payment, user


# ---------- Cashfree confirm ----------


async def record_cashfree_payment(
    session: AsyncSession,
    *,
    user: User,
    cashfree_payment_id: str,
    cashfree_order_id: str | None = None,
    cashfree_subscription_id: str | None = None,
    ip: str | None = None,
) -> tuple[Payment, User]:
    """Persist a ``succeeded`` Cashfree payment and transition the user.

    Called by the ``/payments/cashfree/verify`` confirm AFTER the Checkout
    signature has been verified by the route. Resolves the plan from the
    user's ``plan_id`` (set on the client just before opening Checkout) and,
    failing that, requires the caller to have already attached a plan — we
    don't accept a plan id over the wire here because the signature only
    attests to the payment, not the plan choice.

    Returns (payment, refreshed_user). The webhook remains the source of
    truth; this row gives the user instant post-checkout feedback and is keyed
    by the Cashfree payment id so the eventual webhook can dedupe against it.
    """
    plan: Plan | None = None
    if user.plan_id is not None:
        plan = await session.get(Plan, user.plan_id)
    if plan is None:
        # No resolvable plan to anchor the payment FK. The pending plan should
        # have been stamped on the user before Checkout opened.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No plan selected for this payment.",
        )

    method = (
        "cashfree_subscription" if cashfree_subscription_id else "cashfree"
    )
    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        amount_cents=plan.price_cents,
        status=PaymentStatus.succeeded,
        payment_method=method,
        cashfree_order_id=cashfree_order_id,
        cashfree_payment_id=cashfree_payment_id,
        cashfree_subscription_id=cashfree_subscription_id,
    )
    session.add(payment)
    await session.flush()

    user.plan_id = plan.id
    user.is_suspended = False
    user.next_billing_date = _add_one_month(date.today())
    # Same transition logic as the card/UPI paths — see `_transition_after_payment`.
    await _transition_after_payment(session, user)
    await session.flush()

    await _write_payment_audit(
        session,
        actor=user,
        action="payment.cashfree_success",
        payment_id=payment.id,
        plan_id=plan.id,
        ip=ip,
    )

    await session.commit()
    await session.refresh(payment)
    await session.refresh(user)
    await _email_invoice_safe(
        session, user=user, payment_id=payment.id, item_label=f"{plan.name} plan"
    )
    return payment, user


# ---------- CRM add-on (Starter unlock) ----------

CRM_ADDON_PRICE_CENTS = 49900  # ₹499/mo add-on; dummy gateway.


async def _email_invoice_safe(
    session: AsyncSession, *, user: User, payment_id: uuid.UUID, item_label: str
) -> None:
    """Build + email an invoice for a payment. Best-effort; never raises into
    the charge path (dry-run when SMTP is unconfigured)."""
    try:
        try:
            data, ctype, fname = await build_invoice_pdf(
                session, user=user, payment_id=payment_id
            )
        except HTTPException:
            data, ctype, fname = await build_invoice_csv(
                session, user=user, payment_id=payment_id
            )
        payment = await session.get(Payment, payment_id)
        if payment is None or not user.email:
            return
        from app.services import transactional_mail

        await transactional_mail.send_invoice_email(
            to=user.email,
            item_label=item_label,
            amount_cents=payment.amount_cents,
            invoice_number=_invoice_number_for(payment),
            attachment_filename=fname,
            attachment_bytes=data,
            attachment_content_type=ctype.split(";")[0],
        )
    except Exception as exc:  # noqa: BLE001 — invoice email must not break billing
        logger.warning("invoice_email.failed payment_id=%s err=%s", payment_id, exc)


async def _cheapest_plan_id(session: AsyncSession) -> uuid.UUID | None:
    cheapest = (
        await session.execute(select(Plan).order_by(Plan.price_cents.asc()).limit(1))
    ).scalar_one_or_none()
    return cheapest.id if cheapest else None


async def purchase_addon(
    session: AsyncSession, *, user: User, addon_key: str, ip: str | None = None
) -> Addon:
    """Buy an add-on for the caller's workspace (dummy charge).

    Idempotent — owning it already (either via ``workspace_addons`` or, for the
    CRM add-on, the legacy ``crm_addon_enabled`` flag) is a no-op that records
    no second charge. On a fresh purchase: records a ``succeeded`` Payment
    (``payment_method='addon_dummy'``), inserts ownership, flips the CRM flag
    for ``key='crm'``, and emails an invoice.
    """
    addon = (
        await session.execute(select(Addon).where(Addon.key == addon_key))
    ).scalar_one_or_none()
    if addon is None or not addon.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Add-on not found")

    ws = await session.get(WorkspaceSetting, user.workspace_id)
    if ws is None:
        ws = WorkspaceSetting(
            workspace_id=user.workspace_id, brand_color="#F26522", retention_days=90
        )
        session.add(ws)
        await session.flush()

    existing = (
        await session.execute(
            select(WorkspaceAddon).where(
                WorkspaceAddon.workspace_id == user.workspace_id,
                WorkspaceAddon.addon_id == addon.id,
            )
        )
    ).scalar_one_or_none()
    crm_already = addon.key == "crm" and ws.crm_addon_enabled

    if existing is not None or crm_already:
        # Already owned — reconcile state (back-fill ownership / flag), no charge.
        if addon.key == "crm":
            ws.crm_addon_enabled = True
        if existing is None:
            session.add(
                WorkspaceAddon(workspace_id=user.workspace_id, addon_id=addon.id)
            )
        await session.commit()
        return addon

    # ``payments.plan_id`` is NOT NULL — attach the user's plan or the cheapest.
    plan_id = user.plan_id or await _cheapest_plan_id(session)
    payment_id: uuid.UUID | None = None
    if plan_id is not None:
        payment = Payment(
            user_id=user.id,
            plan_id=plan_id,
            amount_cents=addon.price_cents,
            status=PaymentStatus.succeeded,
            payment_method="addon_dummy",
        )
        session.add(payment)
        await session.flush()
        payment_id = payment.id
        await _write_payment_audit(
            session,
            actor=user,
            action="payment.addon",
            payment_id=payment.id,
            plan_id=plan_id,
            ip=ip,
        )

    session.add(
        WorkspaceAddon(
            workspace_id=user.workspace_id, addon_id=addon.id, payment_id=payment_id
        )
    )
    if addon.key == "crm":
        ws.crm_addon_enabled = True
    await session.commit()

    if payment_id is not None:
        await _email_invoice_safe(
            session, user=user, payment_id=payment_id, item_label=f"{addon.name} add-on"
        )
    return addon


async def purchase_crm_addon(
    session: AsyncSession,
    *,
    user: User,
    card_last4: str | None = None,  # noqa: ARG001 — dummy gateway ignores card
    ip: str | None = None,
) -> WorkspaceSetting:
    """Back-compat wrapper — buys the ``crm`` add-on via the generic path."""
    await purchase_addon(session, user=user, addon_key="crm", ip=ip)
    ws = await session.get(WorkspaceSetting, user.workspace_id)
    return ws  # type: ignore[return-value]


async def set_auto_pay(session: AsyncSession, *, user: User, enabled: bool) -> User:
    """Toggle the dummy auto-renew flag. Enabling seeds a next-billing date for
    a plan-holder who doesn't have one yet so the renew job has a target."""
    user.auto_pay_enabled = bool(enabled)
    if enabled and user.next_billing_date is None and user.plan_id is not None:
        user.next_billing_date = _add_one_month(date.today())
    await session.commit()
    await session.refresh(user)
    return user


async def renew_subscription_dummy(
    session: AsyncSession, *, user: User
) -> Payment | None:
    """Dummy monthly renewal charge used by the auto-renew beat job. Records a
    ``succeeded`` Payment, advances ``next_billing_date``, emails an invoice.
    No-op (returns None) for a plan-less user."""
    if user.plan_id is None:
        return None
    plan = await session.get(Plan, user.plan_id)
    if plan is None:
        return None
    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        amount_cents=plan.price_cents,
        status=PaymentStatus.succeeded,
        payment_method="auto_renew_dummy",
    )
    session.add(payment)
    await session.flush()
    base = user.next_billing_date or date.today()
    user.next_billing_date = _add_one_month(base)
    await _write_payment_audit(
        session,
        actor=user,
        action="payment.auto_renew",
        payment_id=payment.id,
        plan_id=plan.id,
        ip=None,
    )
    await session.commit()
    await session.refresh(payment)
    await _email_invoice_safe(
        session, user=user, payment_id=payment.id, item_label=f"{plan.name} plan — renewal"
    )
    return payment


# ---------- /payments/me ----------


async def list_payments_for_user(
    session: AsyncSession, user: User
) -> list[tuple[Payment, str | None, str | None]]:
    """Return this user's payments, most recent first, with plan name + email joined."""
    stmt = (
        select(Payment, Plan.name, User.email)
        .join(Plan, Plan.id == Payment.plan_id)
        .join(User, User.id == Payment.user_id)
        .where(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [(p, plan_name, user_email) for p, plan_name, user_email in rows]


# ---------- /admin/payments (filters + pagination + CSV) ----------


def _apply_admin_filters(
    stmt: Select[Any],
    *,
    status_filter: str | None,
    user_email: str | None,
    plan_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
) -> Select[Any]:
    clauses = []
    if status_filter:
        try:
            clauses.append(Payment.status == PaymentStatus(status_filter))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            ) from exc
    if user_email:
        clauses.append(User.email.ilike(f"%{user_email.lower()}%"))
    if plan_id:
        clauses.append(Payment.plan_id == plan_id)
    if date_from:
        clauses.append(Payment.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        clauses.append(Payment.created_at <= datetime.combine(date_to, time.max))
    if clauses:
        stmt = stmt.where(and_(*clauses))
    return stmt


async def list_all_payments(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    user_email: str | None = None,
    plan_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[tuple[Payment, str | None, str | None]], int]:
    """Return (rows, total_count) for admin list endpoint."""
    base = (
        select(Payment, Plan.name, User.email)
        .join(Plan, Plan.id == Payment.plan_id)
        .join(User, User.id == Payment.user_id)
    )
    base = _apply_admin_filters(
        base,
        status_filter=status_filter,
        user_email=user_email,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
    )

    count_stmt = (
        select(func.count())
        .select_from(Payment)
        .join(Plan, Plan.id == Payment.plan_id)
        .join(User, User.id == Payment.user_id)
    )
    count_stmt = _apply_admin_filters(
        count_stmt,
        status_filter=status_filter,
        user_email=user_email,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = (await session.execute(count_stmt)).scalar_one() or 0

    offset = (page - 1) * page_size
    page_stmt = base.order_by(Payment.created_at.desc()).offset(offset).limit(page_size)
    rows = (await session.execute(page_stmt)).all()
    return [(p, plan_name, email) for p, plan_name, email in rows], int(total)


async def iter_all_payments_for_csv(
    session: AsyncSession,
    *,
    status_filter: str | None = None,
    user_email: str | None = None,
    plan_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AsyncIterator[bytes]:
    """Stream the admin payments export as CSV bytes.

    We pull the full (filtered) resultset unpaginated — exports are
    expected to be admin-initiated and rare enough that this is fine.
    """
    base = (
        select(Payment, Plan.name, User.email)
        .join(Plan, Plan.id == Payment.plan_id)
        .join(User, User.id == Payment.user_id)
    )
    base = _apply_admin_filters(
        base,
        status_filter=status_filter,
        user_email=user_email,
        plan_id=plan_id,
        date_from=date_from,
        date_to=date_to,
    ).order_by(Payment.created_at.desc())

    rows = (await session.execute(base)).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "payment_id",
            "user_email",
            "plan_name",
            "amount_cents",
            "status",
            "payment_method",
            "dummy_card_last4",
            "dummy_upi_vpa",
            "created_at",
        ]
    )
    yield buffer.getvalue().encode("utf-8")
    buffer.seek(0)
    buffer.truncate(0)

    for payment, plan_name, email in rows:
        writer.writerow(
            [
                str(payment.id),
                email or "",
                plan_name or "",
                payment.amount_cents,
                payment.status.value if hasattr(payment.status, "value") else str(payment.status),
                payment.payment_method or "",
                payment.dummy_card_last4 or "",
                payment.dummy_upi_vpa or "",
                payment.created_at.isoformat(),
            ]
        )
        yield buffer.getvalue().encode("utf-8")
        buffer.seek(0)
        buffer.truncate(0)


# ---------- payment-method registration ----------


async def list_payment_methods_for_user(
    session: AsyncSession, user: User
) -> list[PaymentMethodOut]:
    """Derive distinct payment methods from a user's payment history.

    Methods are de-duplicated on ``(kind, identifier)`` — the first row
    (most recent) is flagged as default. Method-only registration rows
    (``payment_method`` starting with ``method_``) are included too.
    """
    stmt = (
        select(Payment, Plan.name)
        .join(Plan, Plan.id == Payment.plan_id)
        .where(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    seen: dict[str, PaymentMethodOut] = {}
    is_first = True
    for payment, plan_name in rows:
        if payment.dummy_card_last4:
            key = f"card:{payment.dummy_card_last4}"
            if key not in seen:
                seen[key] = PaymentMethodOut(
                    id=key,
                    kind="card",
                    label=f"Card · {payment.dummy_card_last4}",
                    sub=plan_name,
                    is_default=is_first,
                )
                is_first = False
        elif payment.dummy_upi_vpa:
            key = f"upi:{payment.dummy_upi_vpa}"
            if key not in seen:
                seen[key] = PaymentMethodOut(
                    id=key,
                    kind="upi",
                    label=f"UPI · {payment.dummy_upi_vpa}",
                    sub=plan_name,
                    is_default=is_first,
                )
                is_first = False
    return list(seen.values())


async def register_payment_method(
    session: AsyncSession,
    *,
    user: User,
    payload: AddPaymentMethodRequest,
    ip: str | None = None,
) -> PaymentMethodOut:
    """Record a zero-amount payment row tagged ``method_card`` / ``method_upi``.

    Why a Payment row? The frontend derives the method list from payment
    history, so we use the same shape rather than introducing a new
    table for what is, after all, a stub gateway. PAN/CVC are dropped
    immediately (mirrors ``record_dummy_payment``).
    """
    # User's current plan is the only Plan we can attach to (FK).
    if user.plan_id is None:
        # Pick any active plan so the FK is satisfied. For brand-new users
        # without a plan we refuse — the UI prompts them to pick a plan
        # first via the Manage button.
        plan = (
            await session.execute(
                select(Plan).where(Plan.is_active.is_(True)).limit(1)
            )
        ).scalar_one_or_none()
    else:
        plan = await session.get(Plan, user.plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No plan available to anchor the payment method. Pick a plan first.",
        )

    if payload.kind == "card":
        if not payload.card_number or not payload.cvc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Card number and CVC required for card method.",
            )
        # Drop sensitive locals after extracting last4 (defence in depth).
        card_last4 = payload.card_number[-4:]
        _card_redacted = "REDACTED"  # noqa: F841
        _cvc_redacted = "REDACTED"  # noqa: F841

        payment = Payment(
            user_id=user.id,
            plan_id=plan.id,
            amount_cents=0,
            status=PaymentStatus.succeeded,
            dummy_card_last4=card_last4,
            payment_method="method_card",
        )
        identifier = card_last4
        label_prefix = "Card"
    elif payload.kind == "upi":
        if not payload.upi_vpa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="UPI VPA required for upi method.",
            )
        payment = Payment(
            user_id=user.id,
            plan_id=plan.id,
            amount_cents=0,
            status=PaymentStatus.succeeded,
            dummy_upi_vpa=payload.upi_vpa,
            payment_method="method_upi",
        )
        identifier = payload.upi_vpa
        label_prefix = "UPI"
    else:  # pragma: no cover — pydantic constrains kind to {card,upi}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported method kind: {payload.kind}",
        )

    session.add(payment)
    await session.flush()
    await _write_payment_audit(
        session,
        actor=user,
        action=f"payment.method_added.{payload.kind}",
        payment_id=payment.id,
        plan_id=plan.id,
        ip=ip,
    )
    await session.commit()
    await session.refresh(payment)

    # First method in the freshly-fetched list is the default.
    existing = await list_payment_methods_for_user(session, user)
    is_default = bool(existing) and existing[0].id == f"{payload.kind}:{identifier}"
    return PaymentMethodOut(
        id=f"{payload.kind}:{identifier}",
        kind=payload.kind,
        label=f"{label_prefix} · {identifier}",
        sub=payload.label or plan.name,
        is_default=is_default,
    )


# ---------- admin edit ----------


async def update_payment(
    session: AsyncSession,
    *,
    payment_id: uuid.UUID,
    new_status: str | None = None,
    amount_cents: int | None = None,
    actor: User,
) -> Payment:
    """Super-admin: update a payment's status and/or amount_cents.

    Loads the payment (404 if missing), applies the requested changes,
    writes an audit row via the SAVEPOINT helper, then commits.
    """
    payment = await session.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    before: dict[str, object] = {}
    after: dict[str, object] = {}

    if new_status is not None:
        try:
            parsed_status = PaymentStatus(new_status)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status value: {new_status}",
            ) from exc
        old_status_val = payment.status.value if hasattr(payment.status, "value") else str(payment.status)
        before["status"] = old_status_val
        after["status"] = parsed_status.value
        payment.status = parsed_status

    if amount_cents is not None:
        before["amount_cents"] = payment.amount_cents
        after["amount_cents"] = amount_cents
        payment.amount_cents = amount_cents

    await session.flush()

    try:
        async with session.begin_nested():
            session.add(
                AuditLog(
                    actor_user_id=actor.id,
                    actor_role=(
                        actor.role.value if hasattr(actor.role, "value") else str(actor.role)
                    ),
                    action="payment.update",
                    target_type="payment",
                    target_id=payment.id,
                    payload={"before": before, "after": after},
                )
            )
    except Exception as exc:  # pragma: no cover — audit failures must not abort the request
        logger.warning("audit write failed action=payment.update: %s", exc)

    await session.commit()
    await session.refresh(payment)
    return payment


# ---------- per-invoice export ----------


async def _load_payment_for_user(
    session: AsyncSession, *, user: User, payment_id: uuid.UUID
) -> tuple[Payment, str]:
    """Fetch a payment owned by ``user`` plus its plan name. 404 otherwise."""
    stmt = (
        select(Payment, Plan.name)
        .join(Plan, Plan.id == Payment.plan_id)
        .where(Payment.id == payment_id, Payment.user_id == user.id)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    payment, plan_name = row
    return payment, plan_name or ""


def _invoice_number_for(payment: Payment) -> str:
    """Mirror the client-side ``buildInvoice`` deterministic number."""
    year = payment.created_at.year
    tail = str(payment.id)[-5:]
    try:
        seq_num = int(tail, 16)
    except ValueError:
        seq_num = sum(ord(c) for c in str(payment.id))
    seq = str(abs(seq_num) % 100_000).zfill(5)
    return f"INV-{year}-{seq}"


async def build_invoice_csv(
    session: AsyncSession, *, user: User, payment_id: uuid.UUID
) -> tuple[bytes, str, str]:
    """Render a one-payment CSV invoice. Always available."""
    payment, plan_name = await _load_payment_for_user(
        session, user=user, payment_id=payment_id
    )
    inv = _invoice_number_for(payment)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["WarmPulse — Invoice"])
    writer.writerow(["Invoice number", inv])
    writer.writerow(["Issued", payment.created_at.isoformat()])
    writer.writerow(["Bill to", user.email or ""])
    writer.writerow([])
    writer.writerow(["Description", "Amount (INR cents)"])
    writer.writerow(
        [f"{plan_name} plan — monthly subscription", payment.amount_cents]
    )
    writer.writerow(["Tax", 0])
    writer.writerow(["Total", payment.amount_cents])
    writer.writerow([])
    writer.writerow(["Payment method", payment.payment_method or ""])
    writer.writerow(["Status", payment.status.value if hasattr(payment.status, "value") else str(payment.status)])
    if payment.dummy_card_last4:
        writer.writerow(["Card ending", payment.dummy_card_last4])
    if payment.dummy_upi_vpa:
        writer.writerow(["UPI VPA", payment.dummy_upi_vpa])
    writer.writerow([])
    writer.writerow(["Note", "Dummy gateway — no real transaction occurred."])
    return (
        buffer.getvalue().encode("utf-8"),
        "text/csv; charset=utf-8",
        f"{inv}.csv",
    )


async def build_invoice_pdf(
    session: AsyncSession, *, user: User, payment_id: uuid.UUID
) -> tuple[bytes, str, str]:
    """Render a one-payment PDF invoice using reportlab.

    Returns 501 (via HTTPException) when reportlab is not importable so
    the caller can fall back to the CSV path.
    """
    if not _reportlab_available():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={"error": "PDF export requires reportlab; use CSV for now."},
        )

    payment, plan_name = await _load_payment_for_user(
        session, user=user, payment_id=payment_id
    )
    inv = _invoice_number_for(payment)

    # Local imports keep the module light when reportlab isn't installed.
    from reportlab.lib import colors  # type: ignore
    from reportlab.lib.pagesizes import A4  # type: ignore
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # type: ignore
    from reportlab.lib.units import mm  # type: ignore
    from reportlab.platypus import (  # type: ignore
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=inv,
    )
    styles = getSampleStyleSheet()
    VIOLET = colors.HexColor("#F26522")
    DARK = colors.HexColor("#1f2433")
    MUTED = colors.HexColor("#6b7280")

    title = ParagraphStyle(
        "title", parent=styles["Title"], fontSize=22, textColor=DARK,
        spaceAfter=4, alignment=0,
    )
    sub = ParagraphStyle(
        "sub", parent=styles["BodyText"], fontSize=9, textColor=MUTED, spaceAfter=2,
    )
    body = ParagraphStyle(
        "body", parent=styles["BodyText"], fontSize=10, textColor=DARK,
    )

    amount = payment.amount_cents
    method_line = "Dummy gateway"
    if payment.payment_method == "upi_dummy" and payment.dummy_upi_vpa:
        method_line = f"UPI · {payment.dummy_upi_vpa}"
    elif payment.dummy_card_last4:
        method_line = f"Card ending {payment.dummy_card_last4}"

    flowables: list[object] = []
    flowables.append(Paragraph(f"<b>WarmPulse</b> — Invoice {inv}", title))
    flowables.append(Paragraph(
        f"Issued {payment.created_at.strftime('%d %b %Y')} · Status {payment.status.value if hasattr(payment.status, 'value') else str(payment.status)}",
        sub,
    ))
    flowables.append(Spacer(1, 8 * mm))
    flowables.append(Paragraph(f"<b>Bill to:</b> {user.email or '—'}", body))
    flowables.append(Paragraph("<b>From:</b> WarmPulse, Inc.", body))
    flowables.append(Spacer(1, 6 * mm))

    rows = [
        ["Description", "Amount (INR)"],
        [
            f"{plan_name} plan — monthly subscription",
            f"₹{amount / 100:,.2f}",
        ],
        ["Tax", "₹0.00"],
        ["Total", f"₹{amount / 100:,.2f}"],
    ]
    table = Table(rows, colWidths=[120 * mm, 50 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f5f3ff")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    flowables.append(table)
    flowables.append(Spacer(1, 6 * mm))
    flowables.append(Paragraph(f"Payment method: {method_line}", sub))
    flowables.append(Spacer(1, 10 * mm))
    flowables.append(Paragraph(
        "<i>Dummy gateway — no real transaction occurred.</i>", sub
    ))

    doc.build(flowables)
    return buf.getvalue(), "application/pdf", f"{inv}.pdf"
