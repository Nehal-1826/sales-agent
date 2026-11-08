"""Billing models.  Plan / WebhookEvent / PlatformAuditLog / InvoiceCounter are
platform-level (no workspace).  Subscription / Invoice / Payment / Refund are
tenant-owned (core.tenancy.TenantOwned): the default manager is scoped to the
active workspace and raises when none is active."""

from django.conf import settings
from django.db import models

from core.tenancy import TenantOwned


class Plan(models.Model):
    code = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    sort = models.PositiveSmallIntegerField(default=0)
    # integer minor units (paise / cents)
    price_inr_month = models.PositiveIntegerField(default=0)
    price_usd_month = models.PositiveIntegerField(default=0)
    price_inr_year = models.PositiveIntegerField(default=0)
    price_usd_year = models.PositiveIntegerField(default=0)
    # meter -> int, -1 = unlimited (see billing.entitlements.METERS)
    limits = models.JSONField(default=dict, blank=True)
    features = models.JSONField(default=dict, blank=True)
    razorpay_plan_ids = models.JSONField(default=dict, blank=True)
    stripe_price_ids = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['sort', 'id']

    def __str__(self):
        return self.name


class WebhookEvent(models.Model):
    gateway = models.CharField(max_length=20)
    event_id = models.CharField(max_length=200)
    type = models.CharField(max_length=100, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    payload_hash = models.CharField(max_length=64, blank=True)  # sha256; raw payload is PII, never stored
    status = models.CharField(max_length=20, default='received')
    error = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['gateway', 'event_id'],
                                               name='uniq_webhook_event')]


class PlatformAuditLog(models.Model):
    """Append-only trail of platform-admin writes and billing state changes."""

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                              on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=80)
    target_workspace = models.ForeignKey('core.Workspace', null=True, blank=True,
                                         on_delete=models.SET_NULL, related_name='+')
    meta = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']


class InvoiceCounter(models.Model):
    """One row per year; allocated under select_for_update."""

    year = models.PositiveIntegerField(unique=True)
    last_number = models.PositiveIntegerField(default=0)


class Subscription(TenantOwned):
    class Intervals(models.TextChoices):
        MONTH = 'month', 'Monthly'
        YEAR = 'year', 'Yearly'

    class Currencies(models.TextChoices):
        INR = 'INR', 'INR'
        USD = 'USD', 'USD'

    class Gateways(models.TextChoices):
        RAZORPAY = 'razorpay', 'Razorpay'
        STRIPE = 'stripe', 'Stripe'
        MANUAL = 'manual', 'Manual'

    class Statuses(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACTIVE = 'active', 'Active'
        PAST_DUE = 'past_due', 'Past due'
        CANCELED = 'canceled', 'Canceled'
        EXPIRED = 'expired', 'Expired'

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    interval = models.CharField(max_length=10, choices=Intervals.choices, default=Intervals.MONTH)
    currency = models.CharField(max_length=3, choices=Currencies.choices, default=Currencies.INR)
    gateway = models.CharField(max_length=10, choices=Gateways.choices, default=Gateways.MANUAL)
    gateway_customer_id = models.CharField(max_length=120, blank=True)
    gateway_subscription_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=Statuses.choices, default=Statuses.PENDING)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    bonus_days = models.PositiveSmallIntegerField(default=10)
    first_paid_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)
    # invoice recipient (tenant-editable via /api/billing/billing_details/)
    billing_name = models.CharField(max_length=200, blank=True)
    billing_email = models.EmailField(blank=True)
    billing_address = models.TextField(blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    # downgrade requested mid-period: applied when the next renewal charge lands
    pending_plan_code = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(TenantOwned.Meta):
        # exactly one subscription per workspace
        constraints = [models.UniqueConstraint(fields=['workspace'], name='uniq_subscription_workspace')]

    def __str__(self):
        return f'{self.workspace_id}:{self.plan_id}:{self.status}'


class Invoice(TenantOwned):
    class Statuses(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PAID = 'paid', 'Paid'
        REFUNDED = 'refunded', 'Refunded'
        PARTIALLY_REFUNDED = 'partially_refunded', 'Partially refunded'
        VOID = 'void', 'Void'

    number = models.CharField(max_length=30, unique=True)
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name='invoices')
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.DRAFT)
    currency = models.CharField(max_length=3)
    subtotal = models.PositiveIntegerField(default=0)
    tax_rate_bp = models.PositiveIntegerField(default=0)  # 1800 = 18 %
    tax_amount = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField(default=0)
    amount_refunded = models.PositiveIntegerField(default=0)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    billing_name = models.CharField(max_length=200, blank=True)
    billing_email = models.EmailField(blank=True)
    billing_address = models.TextField(blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    gateway_payment_id = models.CharField(max_length=120, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-id']

    def __str__(self):
        return self.number


class Payment(TenantOwned):
    class Statuses(models.TextChoices):
        CAPTURED = 'captured', 'Captured'
        FAILED = 'failed', 'Failed'
        REFUNDED = 'refunded', 'Refunded'

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    gateway = models.CharField(max_length=20)
    gateway_payment_id = models.CharField(max_length=120, unique=True)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=10, choices=Statuses.choices, default=Statuses.CAPTURED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-id']


class Refund(TenantOwned):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='refunds')
    amount = models.PositiveIntegerField()
    reason = models.CharField(max_length=200, blank=True)
    gateway_refund_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, default='pending')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-id']
