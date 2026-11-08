"""Small subscription helpers shared by operator tools and tests."""

from datetime import datetime, timezone as dt_timezone

from django.utils import timezone

from core.tenancy import workspace_context

from .models import Plan, Subscription

FAR_FUTURE = datetime(2099, 12, 31, tzinfo=dt_timezone.utc)


def ensure_manual_subscription(ws, plan_code='enterprise', period_end=FAR_FUTURE):
    """Give `ws` an active `manual` subscription (idempotent: an existing one
    is left alone).  Used for legacy / operator workspaces and test fixtures."""
    existing = Subscription.all_tenants.filter(workspace_id=ws.pk).first()
    if existing is not None:
        return existing
    plan = Plan.objects.filter(code=plan_code).first()
    if plan is None:
        # seed rows are gone after a TransactionTestCase flush: re-seed from the migration
        import importlib
        for spec in importlib.import_module('billing.migrations.0002_seed_plans_backfill').PLANS:
            Plan.objects.update_or_create(code=spec['code'], defaults=spec)
        plan = Plan.objects.get(code=plan_code)
    with workspace_context(ws):
        return Subscription.objects.create(
            workspace=ws, plan=plan, interval='year', currency='INR', gateway='manual',
            status='active', current_period_start=timezone.now(),
            current_period_end=period_end, bonus_days=0)
