"""Every workspace with SMTP configured in AppSettings gets one Mailbox built
from it.  AppSettings.smtp_* stay (backward compat); once a Mailbox exists the
outbox sends from it.  An established account starts without a warmup ramp
(ramp_start NULL = full daily_cap)."""

from django.db import migrations


def forwards(apps, schema_editor):
    AppSettings = apps.get_model('core', 'AppSettings')
    Mailbox = apps.get_model('core', 'Mailbox')
    for s in AppSettings.objects.all():
        if not (s.smtp_host and s.smtp_user and s.smtp_password):
            continue
        address = (s.from_email or s.smtp_user).strip()
        if Mailbox.objects.filter(workspace_id=s.workspace_id, from_email__iexact=address).exists():
            continue
        Mailbox.objects.create(
            workspace_id=s.workspace_id, label=address, from_email=address,
            from_name=s.company_name or '', smtp_host=s.smtp_host, smtp_port=s.smtp_port or 587,
            smtp_user=s.smtp_user, smtp_password=s.smtp_password, ramp_start=None)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0027_deliverability_outbox'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
