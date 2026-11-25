from django.db import migrations


class Migration(migrations.Migration):
    """One authenticator per account (owner's order, 2026-11-25): the extra
    devices of migration 0038 are gone. There were none on the live server
    when this shipped (0 rows), so nobody loses a way in."""

    dependencies = [
        ('core', '0045_autopilot_needs_proper_data'),
    ]

    operations = [
        migrations.DeleteModel('TotpDevice'),
    ]
