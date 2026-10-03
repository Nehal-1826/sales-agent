"""MongoDB is the only DB provider — change the default and migrate existing rows."""

from django.db import migrations, models


def forwards(apps, schema_editor):
    AgentConfig = apps.get_model('core', 'AgentConfig')
    AgentConfig.objects.exclude(db_provider='mongodb').update(db_provider='mongodb')
    # nothing to set in the UI anymore — drop leftover connection strings
    AgentConfig.objects.exclude(db_connection='').update(db_connection='', db_name='')


def backwards(apps, schema_editor):
    pass  # no useful reverse — postgres defaults were never real connections


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_healthbeat'),
    ]

    operations = [
        migrations.AlterField(
            model_name='agentconfig',
            name='db_provider',
            field=models.CharField(default='mongodb', max_length=20),
        ),
        migrations.RunPython(forwards, backwards),
    ]
