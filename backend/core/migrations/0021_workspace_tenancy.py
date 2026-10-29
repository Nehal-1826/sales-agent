import django.db.models.deletion
from django.db import migrations, models

# Tenant models get a NULLABLE workspace first: existing rows are assigned in
# 0022 and the column becomes NOT NULL in 0023 (safe on a populated DB).
TENANT_MODELS = [
    'lead', 'emaildraft', 'emailtemplate', 'potential', 'reply',
    'agentconfig', 'searchprofile', 'chatmessage', 'pipelinerun',
]


def _fk():
    return models.ForeignKey(
        null=True, on_delete=django.db.models.deletion.CASCADE,
        related_name='+', to='core.workspace')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_seed_saas_builds_profile'),
    ]

    operations = [
        migrations.CreateModel(
            name='Workspace',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=60, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddField(
            model_name='user',
            name='workspace',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='users', to='core.workspace'),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='workspace',
            field=models.OneToOneField(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='+', to='core.workspace'),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='scalelist_api_key',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='appsettings',
            name='apify_api_key',
            field=models.CharField(blank=True, max_length=200),
        ),
        # drop the old global uniques before per-workspace ones arrive in 0023
        migrations.AlterField(
            model_name='agentconfig',
            name='agent',
            field=models.CharField(
                choices=[('search', 'Search (Scrape)'), ('profile', 'Profile'),
                         ('copywright', 'Copywright'), ('responder', 'Responder (Chatbot)')],
                max_length=20),
        ),
        migrations.AlterField(
            model_name='searchprofile',
            name='name',
            field=models.CharField(max_length=200),
        ),
    ] + [
        migrations.AddField(model_name=m, name='workspace', field=_fk())
        for m in TENANT_MODELS
    ]
