"""Subscription state machine + invoicing.  Everything here runs inside
workspace_context(ws) and transaction.atomic, with the Subscription row locked."""

from datetime import timedelta

from django.db import transaction
from django.db.models import F  # noqa: F401
from django.utils import timezone

from .entitlements import _add_months
from .models import Invoice, InvoiceCounter, Payment, PlatformAuditLog, Refund, Subscription

GST_BP = 1800


def audit(action, ws=None, meta=None, actor=None, ip=None):
    PlatformAuditLog.objects.create(actor=actor, action=action, target_workspace=ws,
                                    meta=meta or {}, ip=ip)


def next_invoice_number(now=None):
    year = (now or timezone.now()).year
    with transaction.atomic():
        InvoiceCounter.objects.get_or_create(year=year)
        c = InvoiceCounter.objects.select_for_update().get(year=year)
        c.last_number += 1
        c.save(update_fields=['last_number'])
    return f'SHL-{year}-{c.last_number:06d}'


def split_tax(total, currency):
    """The gateway-charged amount is the truth: total = subtotal + tax.
    INR carries 18 % GST on top of the list price; USD is an export (0 %)."""
    if currency != 'INR':
        return total, 0, 0
    tax = (total * GST_BP + (10000 + GST_BP) // 2) // (10000 + GST_BP)
    return total - tax, GST_BP, tax


def expected_amount(plan, interval, currency):
    """Minor units the gateway must charge: list price, plus 18 % GST for INR."""
    base = getattr(plan, f'price_{currency.lower()}_{interval}', 0)
    if currency == 'INR':
        return (base * (10000 + GST_BP) + 5000) // 10000
    return base


def _gateway_plan_ok(plan, interval, ev):
    """Gateway object must name the plan we expect (fail closed when it does not say)."""
    if ev.gateway == 'razorpay':
        want = (plan.razorpay_plan_ids or {}).get(interval)
        return bool(want) and ev.extra.get('plan_id') == want
    want = (plan.stripe_price_ids or {}).get(interval)
    return not want or ev.extra.get('price_id') == want


def verify_charge(sub, ev):
    """(ok, reason).  Activation must match the stored pending checkout; a renewal
    must cover the current plan (or the scheduled downgrade)."""
    S = Subscription.Statuses
    if ev.currency and sub.currency and ev.currency != sub.currency:
        return False, 'currency_mismatch'
    if sub.pending_checkout_id or sub.status not in (S.ACTIVE, S.PAST_DUE):
        plan = sub.pending_plan
        if not sub.pending_checkout_id or plan is None:
            return False, 'no_pending_checkout'
        if ev.extra.get('checkout_id') and ev.extra['checkout_id'] != sub.pending_checkout_id:
            return False, 'checkout_mismatch'
        if ev.amount < sub.pending_amount or sub.pending_amount <= 0:
            return False, 'amount_mismatch'
        if not _gateway_plan_ok(plan, sub.pending_interval, ev):
            return False, 'plan_mismatch'
        return True, 'activation'
    plans = [sub.plan]
    if sub.pending_plan_code:
        from .models import Plan
        plans += list(Plan.objects.filter(code=sub.pending_plan_code))
    need = min(expected_amount(p, sub.interval, sub.currency) for p in plans)
    if ev.amount < need:
        return False, 'amount_mismatch'
    return True, 'renewal'


def lock_subscription(sub_id):
    return Subscription.objects.select_for_update().select_related('plan', 'pending_plan').get(pk=sub_id)


def record_charge(sub, ev, now=None):
    """A paid charge: Invoice + Payment, period roll-forward, first-payment bonus.
    Idempotent on the gateway payment id.  Returns the Invoice or None (duplicate)."""
    now = now or timezone.now()
    if not ev.payment_id or ev.amount <= 0:
        return None
    if Payment.all_tenants.filter(gateway_payment_id=ev.payment_id).exists():
        return None
    currency = ev.currency or sub.currency
    start = ev.period_start or now
    months = 12 if sub.interval == 'year' else 1
    end = ev.period_end or _add_months(start, months)
    subtotal, rate, tax = split_tax(ev.amount, currency)
    inv = Invoice.objects.create(
        workspace=sub.workspace, number=next_invoice_number(now), subscription=sub,
        status=Invoice.Statuses.PAID, currency=currency, subtotal=subtotal, tax_rate_bp=rate,
        tax_amount=tax, total=ev.amount, period_start=start, period_end=end,
        billing_name=sub.billing_name or sub.workspace.name,
        billing_email=sub.billing_email or sub.workspace.billing_email,
        billing_address=sub.billing_address, gstin=sub.gstin,
        gateway_payment_id=ev.payment_id, issued_at=now, paid_at=now)
    pay = Payment.objects.create(workspace=sub.workspace, invoice=inv, gateway=ev.gateway,
                           gateway_payment_id=ev.payment_id, amount=ev.amount, currency=currency)
    first = sub.first_paid_at is None
    if first:
        sub.first_paid_at = now
        end = end + timedelta(days=sub.bonus_days)   # bonus once, on the first paid period only
    sub.current_period_start = start if first or not sub.current_period_start else max(start, sub.current_period_start)
    sub.current_period_end = max(end, sub.current_period_end) if sub.current_period_end else end
    if sub.pending_checkout_id and sub.pending_plan_id:   # verified activation: adopt the paid plan
        sub.plan, sub.interval = sub.pending_plan, sub.pending_interval
        sub.pending_plan_code = ''
        sub.cycle_first_payment_id = pay.pk
        sub.pending_checkout_id, sub.pending_plan, sub.pending_interval, sub.pending_amount = '', None, '', 0
    elif not first and sub.pending_plan_code:   # scheduled downgrade takes effect on renewal
        from .models import Plan
        newp = Plan.objects.filter(code=sub.pending_plan_code).first()
        if newp is not None:
            sub.plan = newp
        sub.pending_plan_code = ''
    sub.status = Subscription.Statuses.ACTIVE
    sub.currency = currency
    sub.save()
    audit('billing.charge', sub.workspace, {'invoice': inv.number, 'amount': ev.amount,
                                            'currency': currency, 'first': first})
    return inv


def _bind_ids(sub, ev):
    changed = []
    if ev.subscription_id and not sub.gateway_subscription_id:
        sub.gateway_subscription_id = ev.subscription_id
        changed.append('gateway_subscription_id')
    if ev.customer_id and not sub.gateway_customer_id:
        sub.gateway_customer_id = ev.customer_id
        changed.append('gateway_customer_id')
    if changed:
        sub.save(update_fields=changed + ['updated_at'])


def apply_refund_event(sub, ev, now=None):
    """Gateway-reported refund.  Razorpay sends the refund amount, Stripe the
    cumulative amount_refunded; both are folded in as a capped difference."""
    pay = Payment.objects.select_for_update().filter(gateway_payment_id=ev.payment_id).first()
    if pay is None:
        return
    rid = ev.extra.get('refund_id', '')
    if rid and Refund.objects.filter(gateway_refund_id=rid).exists():
        Refund.objects.filter(gateway_refund_id=rid).update(status='processed')
        return
    inv = Invoice.objects.select_for_update().get(pk=pay.invoice_id)
    target = inv.amount_refunded + ev.amount if ev.gateway == 'razorpay' else ev.amount
    target = min(target, inv.total)
    diff = target - inv.amount_refunded
    if diff <= 0:
        return
    Refund.objects.create(workspace=sub.workspace, payment=pay, amount=diff, gateway_refund_id=rid,
                          reason='gateway refund', status='processed')
    mark_refunded(inv, pay, target)
    audit('billing.refund_event', sub.workspace, {'invoice': inv.number, 'amount': diff})


def mark_refunded(inv, pay, total_refunded):
    inv.amount_refunded = total_refunded
    inv.status = (Invoice.Statuses.REFUNDED if total_refunded >= inv.total
                  else Invoice.Statuses.PARTIALLY_REFUNDED)
    inv.save(update_fields=['amount_refunded', 'status'])
    if total_refunded >= inv.total:
        pay.status = Payment.Statuses.REFUNDED
        pay.save(update_fields=['status'])


def apply_event(sub, ev, now=None):
    """Dispatch one verified, workspace-resolved event.  Caller holds the lock."""
    now = now or timezone.now()
    S = Subscription.Statuses
    if ev.type in ('activated', 'charged'):
        if ev.extra.get('checkout_id') and ev.extra['checkout_id'] != sub.pending_checkout_id:
            audit('billing.activation_rejected', sub.workspace, {'reason': 'checkout_mismatch'})
            return 'rejected'
        if ev.payment_id and ev.amount > 0:   # only a real charge activates
            if Payment.all_tenants.filter(gateway_payment_id=ev.payment_id).exists():
                return None
            ok, why = verify_charge(sub, ev)
            if not ok:
                audit('billing.activation_rejected', sub.workspace,
                      {'reason': why, 'payment': ev.payment_id, 'amount': ev.amount})
                return 'rejected'
            _bind_ids(sub, ev)
            record_charge(sub, ev, now)
        else:
            _bind_ids(sub, ev)
        return None
    _bind_ids(sub, ev)
    if ev.type == 'payment_failed':
        if sub.status in (S.ACTIVE, S.PAST_DUE):
            sub.status = S.PAST_DUE   # 3-day grace beyond period_end is in entitlements
            sub.save(update_fields=['status', 'updated_at'])
            audit('billing.payment_failed', sub.workspace, {'payment': ev.payment_id})
    elif ev.type == 'halted':
        sub.status = S.EXPIRED
        sub.save(update_fields=['status', 'updated_at'])
        audit('billing.halted', sub.workspace)
    elif ev.type == 'cancelled':
        sub.status = S.CANCELED
        sub.canceled_at = sub.canceled_at or now
        sub.save(update_fields=['status', 'canceled_at', 'updated_at'])
        audit('billing.canceled', sub.workspace)
    elif ev.type == 'refunded':
        apply_refund_event(sub, ev, now)


# ---------------------------------------------------------------- cancel / refund
REFUND_WINDOW = timedelta(days=10)


def refund_fee_pct():
    import os
    try:
        v = float(os.environ.get('REFUND_FEE_PCT', '10'))
    except ValueError:
        v = 10.0
    return min(max(v, 0.0), 100.0)


def cycle_payments(sub):
    """Captured payments of the current paid cycle (from its activation payment on)."""
    qs = Payment.objects.filter(invoice__subscription=sub, status=Payment.Statuses.CAPTURED)
    if sub.cycle_first_payment_id:
        qs = qs.filter(pk__gte=sub.cycle_first_payment_id)
    return qs.select_related('invoice').order_by('id')


def first_payment(sub):
    """First payment of the current paid cycle (anchors the refund window)."""
    return cycle_payments(sub).first()


def latest_payment(sub):
    return cycle_payments(sub).last()


def refund_window_start(sub):
    p = first_payment(sub)
    return p.created_at if p else None


def in_refund_window(sub, now):
    start = refund_window_start(sub)
    return bool(start and sub.refund_used_at is None and sub.status in ('active', 'past_due')
                and now - start <= REFUND_WINDOW)


def refund_preview(sub, now=None):
    """(amount, payment) a cancel right now would refund; (0, None) outside the window.
    Only the latest captured payment of the current cycle, once per workspace ever.
    refund = total * unused_paid_days / paid_days * (1 - fee); bonus days excluded."""
    now = now or timezone.now()
    if not in_refund_window(sub, now):
        return 0, None
    pay = latest_payment(sub)
    if pay is None:
        return 0, None
    inv = pay.invoice
    paid_secs = (inv.period_end - inv.period_start).total_seconds()
    if paid_secs <= 0:
        return 0, pay
    unused = min(max((inv.period_end - now).total_seconds(), 0), paid_secs)
    amount = round(inv.total * (unused / paid_secs) * (1 - refund_fee_pct() / 100))
    return min(amount, max(inv.total - inv.amount_refunded, 0)), pay


def cancel_subscription(sub_id, user=None, now=None, ip=None):
    """Owner cancel.  Caller wraps in workspace_context.  Raises GatewayError
    when the gateway rejects the cancel (nothing is changed then)."""
    from .gateways import GatewayError, gateway_by_name
    now = now or timezone.now()
    with transaction.atomic():
        sub = lock_subscription(sub_id)
        if sub.status not in ('active', 'past_due'):
            return {'error': 'not_active'}
        amount, pay = refund_preview(sub, now)
        immediate = amount > 0
        gw = gateway_by_name(sub.gateway) if sub.gateway != 'manual' and sub.gateway_subscription_id else None
        if gw:
            gw.cancel(sub.gateway_subscription_id, at_period_end=not immediate)
        out = {'currency': sub.currency, 'refunded': 0, 'canceled_immediately': immediate,
               'cancel_at_period_end': not immediate}
        if immediate:
            inv = Invoice.objects.select_for_update().get(pk=pay.invoice_id)
            amount = min(amount, inv.total - inv.amount_refunded)   # cap under lock
            rf = Refund.objects.create(workspace=sub.workspace, payment=pay, amount=amount,
                                       reason='cancel within 10 days', requested_by=user, status='pending')
            if amount > 0 and gw:
                try:
                    rf.gateway_refund_id = gw.refund(pay.gateway_payment_id, amount, inv.currency)
                    rf.status = 'processed'
                except GatewayError:
                    rf.status = 'failed'
            else:
                rf.status = 'processed'
            rf.save()
            if rf.status == 'processed':
                mark_refunded(inv, pay, inv.amount_refunded + amount)
                out['refunded'] = amount
            else:
                out['refund_failed'] = True
            sub.status = Subscription.Statuses.CANCELED
            sub.current_period_end = now
            sub.cancel_at_period_end = False
            sub.canceled_at = now
            if out['refunded']:
                sub.refund_used_at = now   # one cancel-refund per workspace, ever
        else:
            sub.cancel_at_period_end = True
        sub.save()
        audit('billing.cancel', sub.workspace, {'refunded': out['refunded'], 'immediate': immediate,
                                                'refund_status': 'failed' if out.get('refund_failed') else 'ok'},
              actor=user, ip=ip)
    return out


def platform_refund(payment_id, amount, reason, actor=None, ip=None):
    """Operator refund of a captured payment, capped at invoice total - already
    refunded under select_for_update.  Caller wraps in workspace_context.
    Returns ({...}, http_status); nothing changes when the gateway rejects."""
    from .gateways import GatewayError, GatewayNotConfigured, gateway_by_name
    with transaction.atomic():
        pay = Payment.objects.select_for_update().filter(pk=payment_id).first()
        if pay is None:
            return {'error': 'not_found'}, 404
        inv = Invoice.objects.select_for_update().get(pk=pay.invoice_id)
        if pay.status != Payment.Statuses.CAPTURED:
            return {'error': 'not_refundable'}, 400
        room = inv.total - inv.amount_refunded
        if amount <= 0 or amount > room:
            return {'error': 'amount_invalid', 'refundable': room}, 400
        rf = Refund.objects.create(workspace=pay.workspace, payment=pay, amount=amount,
                                   reason=reason[:200], requested_by=actor, status='pending')
        if pay.gateway in ('razorpay', 'stripe'):
            try:
                rf.gateway_refund_id = gateway_by_name(pay.gateway).refund(
                    pay.gateway_payment_id, amount, inv.currency)
            except (GatewayError, GatewayNotConfigured):
                transaction.set_rollback(True)   # drop the pending Refund row too
                return {'error': 'gateway_error'}, 502
        rf.status = 'processed'
        rf.save()
        mark_refunded(inv, pay, inv.amount_refunded + amount)
        audit('platform.refund', pay.workspace, {'payment': pay.pk, 'invoice': inv.number, 'amount': amount,
                                                 'currency': inv.currency, 'reason': reason},
              actor=actor, ip=ip)
    return {'refunded': amount, 'currency': inv.currency, 'refundable': room - amount}, 200
