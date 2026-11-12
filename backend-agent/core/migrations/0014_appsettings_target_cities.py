from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_appsettings_target_industries'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='target_cities',
            field=models.TextField(blank=True, default=''),
        ),
    ]
