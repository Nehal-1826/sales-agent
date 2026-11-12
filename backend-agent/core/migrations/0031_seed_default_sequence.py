"""Seed the default follow-up sequence for every workspace: two email
follow-ups (on), and LinkedIn / WhatsApp / call assisted steps (off).
core.sequences.ensure_default_sequence() creates the same lazily."""

from django.db import migrations

STEPS = (
    (1, 'email', 3, True,
     'Hi {{company}} team,\n\nJust bumping this up in case it got buried. Would a short '
     'call this week be useful? Happy to share the ideas I mentioned.\n\n{{sender_name}}'),
    (2, 'email', 4, True,
     "Hi {{company}} team,\n\nI haven't heard back, so I'll assume the timing isn't right "
     "and close the loop for now. If it becomes a priority later, just reply to this "
     "email and I'll pick it up.\n\nThanks,\n{{sender_name}}"),
    (3, 'linkedin_task', 1, False,
     'Hi, I emailed {{company}} recently about a few quick wins for {{website}}. '
     'Happy to connect here. {{sender_name}}'),
    (4, 'whatsapp', 2, False,
     'Hi, this is {{sender_name}}. I emailed {{company}} a few ideas for {{website}} — '
     'is this the right number to share them? Reply STOP and I will not message again.'),
    (5, 'call_task', 2, False, 'Call {{company}} about the email from {{sender_name}}.'),
)


def seed(apps, schema_editor):
    Workspace = apps.get_model('core', 'Workspace')
    Sequence = apps.get_model('core', 'Sequence')
    Step = apps.get_model('core', 'SequenceStep')
    for ws in Workspace.objects.all():
        if Sequence.objects.filter(workspace=ws, is_default=True).exists():
            continue
        seq = Sequence.objects.create(workspace=ws, name='Standard follow-up', is_default=True, active=True)
        for order, channel, delay, enabled, body in STEPS:
            Step.objects.create(workspace=ws, sequence=seq, order=order, channel=channel,
                                delay_days=delay, business_days=True, enabled=enabled, body=body)


class Migration(migrations.Migration):
    dependencies = [('core', '0030_sequences_whatsapp')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
