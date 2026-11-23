from django.db import migrations


def responder_is_the_assistant(apps, schema_editor):
    """Rows seeded with the old lead-reply-bot default get the Assistant's
    real job description; anything a workspace changed itself stays."""
    from core.workspaces import fix_responder_prompt
    fix_responder_prompt(apps.get_model('core', 'AgentConfig'))


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0043_user_chat_memory'),
    ]

    operations = [
        migrations.RunPython(responder_is_the_assistant, migrations.RunPython.noop),
    ]
