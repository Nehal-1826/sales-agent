"""One person, one e-mail; one company, one name — the database holds the rules.

Before anything is built the migration LOOKS: two rows that share a company
name or an e-mail address stop it here, and their ids are said. A clash is
resolved by a person, never by a migration (the owner's rule, 27 Nov 2026).

Django writes the e-mail rule as a unique index on LOWER(TRIM(email)) — on
PostgreSQL and on SQLite alike — so the dev and test databases enforce what
the live one does.
"""

from django.db import migrations, models
from django.db.models import Q
from django.db.models.functions import Lower, Trim


def company_key(name):
    """core.identity.company_key, as it is on the day of this migration."""
    return ' '.join((name or '').split()).casefold()[:200]


def report_duplicates(apps, schema_editor):
    Workspace = apps.get_model('core', 'Workspace')
    User = apps.get_model('core', 'User')
    problems = []
    names = {}
    for ws in Workspace.objects.order_by('pk'):
        names.setdefault(company_key(ws.name), []).append(ws.pk)
    for key, pks in names.items():
        if key and len(pks) > 1:
            problems.append(f'company name "{key}" is on workspaces {pks}')
    emails = {}
    for user in User.objects.order_by('pk'):
        email = (user.email or '').strip().lower()
        if email:
            emails.setdefault(email, []).append(user.pk)
    for email, pks in emails.items():
        if len(pks) > 1:
            problems.append(f'e-mail {email} is on accounts {pks}')
    if problems:
        raise RuntimeError('Migration 0051 stopped: these rows clash, and a clash is resolved by a '
                           'person, not by a migration:\n  ' + '\n  '.join(problems))


def fill_name_keys(apps, schema_editor):
    Workspace = apps.get_model('core', 'Workspace')
    for ws in Workspace.objects.all():
        key = company_key(ws.name)
        if ws.name_key != key:
            ws.name_key = key
            ws.save(update_fields=['name_key'])


class Migration(migrations.Migration):
    dependencies = [('core', '0050_user_format_clock')]

    operations = [
        migrations.RunPython(report_duplicates, migrations.RunPython.noop),
        migrations.AddField(
            model_name='workspace',
            name='name_key',
            field=models.CharField(blank=True, editable=False, max_length=200),
        ),
        migrations.RunPython(fill_name_keys, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='workspace',
            constraint=models.UniqueConstraint(condition=~Q(name_key=''), fields=('name_key',),
                                               name='uniq_workspace_name_key'),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(Lower(Trim('email')), condition=~Q(email=''),
                                               name='uniq_user_email_ci'),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.UniqueConstraint(Lower('username'), name='uniq_user_username_ci'),
        ),
    ]
