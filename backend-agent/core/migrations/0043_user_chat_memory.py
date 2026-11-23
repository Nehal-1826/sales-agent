from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0042_openwa_default_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='chat_memory',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
