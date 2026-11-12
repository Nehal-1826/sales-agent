import os

from django.db import migrations

NAME = 'Shailog — Dubai Real Estate (WhatsApp CRM)'


def _default_workspace(apps):
    Workspace = apps.get_model('core', 'Workspace')
    slug = os.environ.get('DEFAULT_TENANT_SLUG', '').strip() or 'shailog'
    return Workspace.objects.filter(slug=slug).first()


def seed(apps, schema_editor):
    ws = _default_workspace(apps)
    if ws is None:  # fresh install: no default tenant yet, nothing to seed
        return
    apps.get_model('core', 'SearchProfile').objects.get_or_create(
        workspace=ws, name=NAME,
        defaults={
            'description': 'Dubai real-estate agencies and brokerages: lead-heavy sales teams '
                           'that live on WhatsApp — ideal for WhatsApp automation + CRM.',
            'target_countries': 'UAE',
            'target_industries': 'real estate agency, property brokerage, real estate developer, '
                                 'property management company, off-plan property sales, '
                                 'holiday home rental company',
            'target_cities': 'Dubai',
            'icp_mode': 'buyer',
            'is_active': False,
        },
    )


def unseed(apps, schema_editor):
    ws = _default_workspace(apps)
    if ws is not None:
        apps.get_model('core', 'SearchProfile').objects.filter(workspace=ws, name=NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_tenant_manager_options'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
