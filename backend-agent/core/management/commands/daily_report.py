"""Daily lead report — send now, or loop and send at 20:00 IST every day.

    python manage.py daily_report            # build + send immediately (test / cron)
    python manage.py daily_report --workspace acme   # one tenant only (default: all active)
    python manage.py daily_report --loop     # stay running, send daily at 8 PM IST

The loop looks after a missed 20:00 itself: when it starts and the most
recent 20:00 IST has passed without a round going out (the worker was down —
a deploy, a crash), that round is sent at once, and once only
(core.reports.missed_report_round). A round covers everything since the
previous one — the 24 hours up to its own 20:00, longer after an outage —
not "all time" (core.reports.report_window_ist).
"""

import time
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from core.health import beat
from core.models import Workspace
from core.reports import (
    last_report_round,
    missed_report_round,
    next_report_time_ist,
    note_report_round,
    now_ist,
    report_time_ist,
    report_window_ist,
    send_daily_report,
)
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

    def _send_all(self, day=None, slug='', window=None):
        """Each active workspace gets ITS OWN report (data, recipients, SMTP).
        One tenant failing or having no recipients never blocks the others.
        `window` is what a 20:00 round covers (report_window_ist); `day` is a
        calendar day asked for by hand."""
        workspaces = Workspace.all_tenants.filter(is_active=True).order_by('id')
        if slug:
            workspaces = workspaces.filter(slug=slug)
            if not workspaces.exists():
                raise CommandError(f'No active workspace with slug "{slug}".')
        from billing.entitlements import has_paid_access
        for ws in workspaces:
            if not has_paid_access(ws):
                continue  # unpaid / expired workspace: no daily report
            try:
                with workspace_context(ws):
                    status, subject = send_daily_report(day, window)
                self.stdout.write(self.style.SUCCESS(f'[{ws.slug}] {status}: {subject}'))
            except Exception as exc:
                self.stderr.write(f'Daily report failed [{ws.slug}]: {exc}')

    def _round(self, day, slug=''):
        """One 20:00 round: send everything since the previous round, and —
        when it is the full one — remember the day, so a worker restarted
        afterwards does not send it twice."""
        previous = last_report_round()
        window = report_window_ist(day, since=report_time_ist(previous) if previous else None)
        self._send_all(slug=slug, window=window)
        if not slug:
            note_report_round(day)

    def _catch_up(self, slug=''):
        """A worker that was down at 20:00 IST and came back later sends the
        round it missed the moment this loop starts."""
        day = missed_report_round()
        if day is None:
            return
        self.stdout.write(self.style.WARNING(
            f'The {day:%d %b} report could not go out at 20:00 IST — sending it now.'))
        self._round(day, slug)

    def handle(self, *args, **options):
        if not options['loop']:
            day = date.fromisoformat(options['day']) if options['day'] else None
            self._send_all(day, options['workspace'])
            # a full round sent by hand at or after 20:00 IST is the day's round
            now = now_ist()
            if day is None and not options['workspace'] and now >= report_time_ist(now.date()):
                note_report_round(now.date())
            return

        self.stdout.write('Daily report loop started — sending at 20:00 IST every day (Ctrl+C to stop).')
        sent_on = None
        while True:
            self._catch_up(options['workspace'])
            due = next_report_time_ist(now_ist())
            self.stdout.write(f'Next report at {due:%d %b %Y %H:%M} IST')
            # sleep in short slices so Ctrl+C / exit stays responsive
            while (n := now_ist()) < due:
                beat('report')  # /api/health/ liveness for the report scheduler
                time.sleep(min(60, max(1, (due - n).total_seconds())))
            if sent_on != due.date():
                self._round(due.date(), options['workspace'])
                sent_on = due.date()
