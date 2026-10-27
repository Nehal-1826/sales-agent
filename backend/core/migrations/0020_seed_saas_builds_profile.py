from django.db import migrations

NAME = 'Shailog \u2014 SaaS Builds (high level)'


def seed(apps, schema_editor):
    SearchProfile = apps.get_model('core', 'SearchProfile')
    SearchProfile.objects.get_or_create(
        name=NAME,
        defaults={
            'description': 'High-level clients for custom SaaS builds: funded startups, '
                           'B2B SaaS, fintech/healthtech/edtech/AI companies and technology '
                           'operators \u2014 businesses that need a real platform, not a brochure.',
            'target_countries': 'United States, United Kingdom, Germany',
            'target_industries': 'SaaS startup, B2B SaaS company, fintech startup, '
                                 'healthtech startup, edtech startup, AI startup, '
                                 'e-commerce brand, logistics technology company, '
                                 'proptech startup, marketplace startup',
            'target_cities': '',
            'icp_mode': 'buyer',
            'is_active': False,
        },
    )


def unseed(apps, schema_editor):
    apps.get_model('core', 'SearchProfile').objects.filter(name=NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_user_pending_action'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
