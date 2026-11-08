"""Public gateway webhooks.  No auth, no CSRF: the HMAC signature is the only
credential, and the workspace comes from OUR stored ids, never from the caller."""

import hashlib
import logging

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import (api_view, authentication_classes, permission_classes,
                                       throttle_classes)
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle

from core.tenancy import workspace_context

from .gateways import GatewayNotConfigured, gateway_by_name
from .models import Payment, Subscription, WebhookEvent
from .payments import apply_event, lock_subscription

log = logging.getLogger(__name__)


def resolve_subscription(ev):
    """Subscription this event belongs to, or None (reject).  A claimed
    workspace_id (metadata/notes) must agree with every stored id we hold."""
    qs = Subscription.all_tenants.select_related('workspace')
    sub = None
    if ev.subscription_id:
        sub = qs.filter(gateway=ev.gateway, gateway_subscription_id=ev.subscription_id).first()
    if sub is None and ev.customer_id:
        sub = qs.filter(gateway=ev.gateway, gateway_customer_id=ev.customer_id).first()
    if sub is None and ev.payment_id and ev.type == 'refunded':
        p = Payment.all_tenants.filter(gateway_payment_id=ev.payment_id).first()
        if p is not None:
            sub = qs.filter(workspace_id=p.workspace_id).first()
    if sub is None and ev.gateway == 'stripe' and ev.workspace_id.isdigit():
        # first contact (checkout completed / first invoice): trust the claim only
        # while our stored ids are still empty
        sub = qs.filter(workspace_id=int(ev.workspace_id), gateway='stripe').first()
    if sub is None:
        return None
    if ev.workspace_id and str(sub.workspace_id) != ev.workspace_id:
        return None
    if ev.subscription_id and sub.gateway_subscription_id and sub.gateway_subscription_id != ev.subscription_id:
        return None
    if ev.customer_id and sub.gateway_customer_id and sub.gateway_customer_id != ev.customer_id:
        return None
    return sub


def process(gateway_name, request):
    raw = request.body                      # raw bytes BEFORE any parsing
    try:
        gw = gateway_by_name(gateway_name)
        if not gw.verify_webhook(raw, request.headers):
            return JsonResponse({'error': 'bad_signature'}, status=400)
    except GatewayNotConfigured:
        return JsonResponse({'error': 'gateway_not_configured'}, status=503)
    try:
        ev = gw.parse_event(raw, request.headers)
    except (ValueError, KeyError, TypeError):
        return JsonResponse({'error': 'bad_payload'}, status=400)
    if not ev.event_id:
        return JsonResponse({'error': 'bad_payload'}, status=400)
    try:
        with transaction.atomic():
            row = WebhookEvent.objects.create(
                gateway=gateway_name, event_id=ev.event_id, type=ev.raw_type[:100],
                payload_hash=hashlib.sha256(raw).hexdigest())
    except IntegrityError:
        return JsonResponse({'status': 'duplicate'}, status=200)
    if ev.type == 'ignored':
        row.status, row.processed_at = 'ignored', timezone.now()
        row.save(update_fields=['status', 'processed_at'])
        return JsonResponse({'status': 'ignored'})
    sub = resolve_subscription(ev)
    if sub is None:
        row.status, row.error = 'rejected', 'unresolved workspace'
        row.save(update_fields=['status', 'error'])
        return JsonResponse({'status': 'rejected'}, status=200)   # 200: never retried, never an oracle
    try:
        with workspace_context(sub.workspace), transaction.atomic():
            apply_event(lock_subscription(sub.pk), ev)
        row.status = 'processed'
    except Exception as e:  # noqa: BLE001 — recorded, gateway retries on 500
        log.exception('webhook processing failed')
        row.status, row.error = 'error', type(e).__name__
        row.save(update_fields=['status', 'error'])
        WebhookEvent.objects.filter(pk=row.pk).delete()   # let the gateway's retry re-run it
        return JsonResponse({'error': 'processing_failed'}, status=500)
    row.processed_at = timezone.now()
    row.save(update_fields=['status', 'processed_at'])
    return JsonResponse({'status': 'ok'})


def _hook(name):
    @csrf_exempt
    @api_view(['POST'])
    @authentication_classes([])
    @permission_classes([AllowAny])
    @throttle_classes([ScopedRateThrottle])
    def view(request):
        return process(name, request)
    view.cls.throttle_scope = 'webhook'
    view.__name__ = f'{name}_webhook'
    return view


razorpay_webhook = _hook('razorpay')
stripe_webhook = _hook('stripe')
