"""Daily lead report — send now, or loop and send at 20:00 IST every day.

    python manage.py daily_report            # build + send immediately (test / cron)
    python manage.py daily_report --workspace acme   # one tenant only (default: all active)
    python manage.py daily_report --loop     # stay running, send daily at 8 PM IST
"""

import time
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from core.health import beat
from core.models import Workspace
from core.reports import next_report_time_ist, now_ist, send_daily_report
from core.tenancy import workspace_context


class Command(BaseCommand):
    help = ('Send the daily lead report (leads scraped + potentials) — '
            'once now, or daily at 8 PM IST with --loop.')

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true',
                            help='Keep running and send every day at 20:00 IST.')
        parser.add_argument('--workspace', type=str, default='',
                            help='Only this workspace slug (default: every active workspace).')
        parser.add_argument('--day', type=str, default='',
                            help='Optional YYYY-MM-DD day to report on (single-shot mode).')

    def _send_all(self, day=None, slug=''):
        """Each active workspace gets ITS OWN report (data, recipients, SMTP).
        One tenant failing or having no recipients never blocks the others."""
        workspaces = Workspace.all_tenants.filter(is_active=True).order_by('id')
        if slug:
            workspaces = workspaces.filter(slug=slug)
            if not workspaces.exists():
                raise CommandError(f'No active workspace with slug "{slug}".')
        for ws in workspaces:
            try:
                with workspace_context(ws):
                    status, subject = send_daily_report(day)
                self.stdout.write(self.style.SUCCESS(f'[{ws.slug}] {status}: {subject}'))
            except Exception as exc:
                self.stderr.write(f'Daily report failed [{ws.slug}]: {exc}')

    def handle(self, *args, **options):
        if not options['loop']:
            day = date.fromisoformat(options['day']) if options['day'] else None
            self._send_all(day, options['workspace'])
            return

        self.stdout.write('Daily report loop started — sending at 20:00 IST every day (Ctrl+C to stop).')
        sent_on = None
        while True:
            now = now_ist()
            due = next_report_time_ist(now)
            self.stdout.write(f'Next report at {due:%d %b %Y %H:%M} IST')
            # sleep in short slices so Ctrl+C / exit stays responsive
            while (n := now_ist()) < due:
                beat('report')  # /api/health/ liveness for the report scheduler
                time.sleep(min(60, max(1, (due - n).total_seconds())))
            if sent_on != now_ist().date():
                self._send_all(slug=options['workspace'])
                sent_on = now_ist().date()
