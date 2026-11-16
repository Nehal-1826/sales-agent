from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_merge_20261010_1621'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsettings',
            name='target_industries',
            field=models.TextField(blank=True, default=''),
        ),
    ]
