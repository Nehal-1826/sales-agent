"""Seed the three plans and give every pre-existing workspace a `manual`
Enterprise subscription (active, period_end 2099-12-31) so nothing breaks."""

from datetime import datetime, timezone

from django.db import migrations

# prices are integer minor units (paise / cents); -1 = unlimited
PLANS = [
    dict(code='startups', name='Startups', sort=1,
         price_inr_month=299900, price_usd_month=3900,
         price_inr_year=2999000, price_usd_year=39000,
         limits=dict(leads=500, emails=3000, mailboxes=2, seats=2, sequences=5,
                     runs_day=2, ai_msgs=300),
         features=dict(whatsapp=False)),
    dict(code='business', name='Business', sort=2,
         price_inr_month=799900, price_usd_month=9900,
         price_inr_year=7999000, price_usd_year=99000,
         limits=dict(leads=2000, emails=15000, mailboxes=5, seats=5, sequences=25,
                     runs_day=6, ai_msgs=2000),
         features=dict(whatsapp=True)),
    dict(code='enterprise', name='Enterprise', sort=3,
         price_inr_month=1999900, price_usd_month=24900,
         price_inr_year=19999000, price_usd_year=249000,
         limits=dict(leads=8000, emails=60000, mailboxes=20, seats=20, sequences=-1,
                     runs_day=24, ai_msgs=10000),
         features=dict(whatsapp=True)),
]


def seed(apps, schema_editor):
    Plan = apps.get_model('billing', 'Plan')
    Subscription = apps.get_model('billing', 'Subscription')
    Workspace = apps.get_model('core', 'Workspace')
    for spec in PLANS:
        Plan.objects.update_or_create(code=spec['code'], defaults=spec)
    enterprise = Plan.objects.get(code='enterprise')
    now = datetime.now(timezone.utc)
    end = datetime(2099, 12, 31, tzinfo=timezone.utc)
    for ws in Workspace.objects.all():
        if Subscription._default_manager.filter(workspace_id=ws.pk).exists():
            continue
        Subscription._default_manager.create(
            workspace_id=ws.pk, plan=enterprise, interval='year', currency='INR',
            gateway='manual', status='active', current_period_start=now,
            current_period_end=end, bonus_days=0)


class Migration(migrations.Migration):
    dependencies = [('billing', '0001_initial'), ('core', '0032_saas_fields')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
