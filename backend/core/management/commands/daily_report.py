"""Daily lead report — send now, or loop and send at 20:00 IST every day.

    python manage.py daily_report            # build + send immediately (test / cron)
    python manage.py daily_report --loop     # stay running, send daily at 8 PM IST
"""

import time

from django.core.management.base import BaseCommand

from core.health import beat
from core.reports import next_report_time_ist, now_ist, send_daily_report


class Command(BaseCommand):
    help = ('Send the daily lead report (leads scraped + potentials) — '
            'once now, or daily at 8 PM IST with --loop.')

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true',
                            help='Keep running and send every day at 20:00 IST.')
        parser.add_argument('--day', type=str, default='',
                            help='Optional YYYY-MM-DD day to report on (single-shot mode).')

    def handle(self, *args, **options):
        if not options['loop']:
            day = options['day'] or None
            status, subject = send_daily_report(day)
            self.stdout.write(self.style.SUCCESS(f'{status}: {subject}'))
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
                try:
                    status, subject = send_daily_report()
                    self.stdout.write(self.style.SUCCESS(f'{status}: {subject}'))
                except Exception as exc:
                    self.stderr.write(f'Daily report failed: {exc}')
                sent_on = now_ist().date()
