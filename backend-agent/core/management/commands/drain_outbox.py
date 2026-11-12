"""Send every due queued cold email now (all active workspaces, or one).

    python manage.py drain_outbox [--workspace <slug>]

run_worker already drains every ~30 s; this is for cron / operators."""

from django.core.management.base import BaseCommand, CommandError

from core.models import Workspace
from core.outbox import drain_all_workspaces, drain_outbox
from core.tenancy import workspace_context


class Command(BaseCommand):
    help = 'Send due queued cold emails (respects caps, sending window and pauses).'

    def add_arguments(self, parser):
        parser.add_argument('--workspace', help='slug of one workspace (default: all active)')

    def handle(self, *args, **options):
        slug = options.get('workspace')
        if slug:
            ws = Workspace.all_tenants.filter(slug=slug).first()
            if ws is None:
                raise CommandError(f'No workspace "{slug}".')
            with workspace_context(ws):
                totals = {slug: drain_outbox()}
        else:
            totals = drain_all_workspaces()
        for ws_slug, stats in totals.items():
            self.stdout.write(f'[{ws_slug}] {stats}')
