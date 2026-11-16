import os

from django.db import migrations

TENANT_MODELS = [
    'Lead', 'EmailDraft', 'EmailTemplate', 'Potential', 'Reply', 'AgentConfig',
    'AppSettings', 'SearchProfile', 'ChatMessage', 'PipelineRun',
]


def assign(apps, schema_editor):
    # Production ran one shared workspace: everything existing becomes Shailog's
    # (split_tenants later moves other companies' rows out).
    Workspace = apps.get_model('core', 'Workspace')
    slug = os.environ.get('DEFAULT_TENANT_SLUG', '').strip() or 'shailog'
    ws, _ = Workspace.objects.get_or_create(
        slug=slug, defaults={'name': 'Shailog Technologies'})
    for name in TENANT_MODELS:
        apps.get_model('core', name).objects.filter(workspace__isnull=True).update(workspace=ws)
    # platform operators (superusers) stay workspace-less
    apps.get_model('core', 'User').objects.filter(
        workspace__isnull=True, is_superuser=False).update(workspace=ws, is_staff=False)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_workspace_tenancy'),
    ]

    operations = [
        migrations.RunPython(assign, migrations.RunPython.noop),
    ]
