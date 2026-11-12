import django.db.models.deletion
from django.db import migrations, models

TENANT_MODELS = ['lead', 'emaildraft', 'emailtemplate', 'potential', 'reply', 'agentconfig', 'searchprofile', 'chatmessage', 'pipelinerun']


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_assign_default_workspace'),
    ]

    operations = [
        migrations.AlterField(
            model_name='appsettings',
            name='workspace',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+', to='core.workspace'),
        ),
        migrations.AlterUniqueTogether(
            name='agentconfig', unique_together={('workspace', 'agent')}),
        migrations.AlterUniqueTogether(
            name='searchprofile', unique_together={('workspace', 'name')}),
    ] + [
        migrations.AlterField(
            model_name=m,
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='+', to='core.workspace'),
        )
        for m in TENANT_MODELS
    ]
