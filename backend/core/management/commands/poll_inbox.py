"""Read new replies and bounces from every active mailbox (read-only IMAP).

    python manage.py poll_inbox [--workspace <slug>]

run_worker already polls every ~3 min; this is for cron / operators."""

from django.core.management.base import BaseCommand, CommandError

from core.inbox import poll_all_workspaces, poll_inbox
from core.models import Workspace
from core.tenancy import workspace_context


class Command(BaseCommand):
    help = 'Read prospect replies + bounces from the mailboxes (never deletes or marks mail).'

    def add_arguments(self, parser):
        parser.add_argument('--workspace', help='slug of one workspace (default: all active)')

    def handle(self, *args, **options):
        slug = options.get('workspace')
        if slug:
            ws = Workspace.all_tenants.filter(slug=slug).first()
            if ws is None:
                raise CommandError(f'No workspace "{slug}".')
            with workspace_context(ws):
                totals = {slug: poll_inbox()}
        else:
            totals = poll_all_workspaces()
        for ws_slug, stats in totals.items():
            self.stdout.write(f'[{ws_slug}] {stats}')
