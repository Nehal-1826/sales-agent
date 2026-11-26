"""Weekly admin-slug security digest — wrong-slug hits from the last 7 days.

    python manage.py send_slug_report            # digest of the last 7 days
    python manage.py send_slug_report --days 30  # custom window

Runs from the VPS cron every Monday 09:00 IST (see root crontab). Always
sends — a "0 hits" email confirms the monitor is alive. Sent from the
PLATFORM SMTP (noreply@warmpulse.tech — product mail, not a tenant mailbox);
falls back to the tenant AppSettings SMTP when that isn't configured.
"""

import os
from datetime import timedelta
from email.utils import parseaddr

from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from core import formatting
from core.models import AppSettings, SlugAttempt, User


class _PlatformSmtp:
    """Duck-typed Mailbox for send_email_message(mailbox=…) — sends through
    the PLATFORM_SMTP_* env vars without creating a connected Mailbox row
    (which would show up in webmail / cold-outreach sending)."""

    def __init__(self):
        self.smtp_host = os.environ.get('PLATFORM_SMTP_HOST', '').strip()
        self.smtp_port = int(os.environ.get('PLATFORM_SMTP_PORT', '587') or 587)
        self.smtp_user = os.environ.get('PLATFORM_SMTP_USER', '').strip()
        self.smtp_password = os.environ.get('PLATFORM_SMTP_PASSWORD', '')
        raw_from = os.environ.get('PLATFORM_SMTP_FROM', '').strip()
        name, addr = parseaddr(raw_from) if raw_from else ('', '')
        self.from_email = addr or self.smtp_user
        self.from_name = name or 'WarmPulse'


class Command(BaseCommand):
    help = 'Email a weekly digest of wrong admin-slug hits (sent by the VPS cron).'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7,
                            help='Window in days (default: 7).')

    def handle(self, *args, **options):
        days = options['days']
        since = timezone.now() - timedelta(days=days)
        attempts = SlugAttempt.objects.filter(created_at__gte=since)

        total = attempts.count()
        by_slug = (attempts.values('slug')
                   .annotate(n=Count('id')).order_by('-n'))
        by_ip = (attempts.exclude(ip='')
                 .values('ip').annotate(n=Count('id')).order_by('-n'))
        latest = attempts[:10]  # Meta ordering = newest first

        lines = [
            f'WarmPulse admin-slug security digest — last {days} day(s)',
            '',
            f'Total wrong-slug hits: {total}',
            '',
        ]
        if total:
            lines.append('By slug tried:')
            lines += [f'  /{row["slug"]}  ×{row["n"]}' for row in by_slug]
            lines.append('')
            if by_ip:
                lines.append('By IP:')
                lines += [f'  {row["ip"]}  ×{row["n"]}' for row in by_ip]
                lines.append('')
            lines.append('Most recent hits:')
            for a in latest:
                ts = formatting.datetime_label(a.created_at)           # 26/11/2026, 2:05 PM IST
                lines.append(f'  {ts}  /{a.slug}  from {a.ip or "unknown"}')
            lines.append('')
            lines.append('If you do not recognize this activity, rotate the slug:')
            lines.append('  python manage.py set_admin_slug')
        else:
            lines.append('No wrong admin-slug hits in this window. All quiet.')

        s = AppSettings.all_tenants.first()
        recipients = [e.strip() for e in (s.report_email or '').split(',') if e.strip()] \
            if s else []
        if not recipients:
            recipients = list(User.objects.filter(is_staff=True, is_active=True)
                              .exclude(email='').values_list('email', flat=True)[:3])
        if not recipients:
            self.stderr.write('No report recipients configured '
                              '(AppSettings.report_email or staff user emails).')
            return

        from core.mailer import send_email_message
        subject = (f'WarmPulse weekly slug report — {total} hit(s)'
                   if total else 'WarmPulse weekly slug report — all quiet')
        platform = _PlatformSmtp()
        if platform.smtp_host and platform.from_email:
            send_email_message(subject, '\n'.join(lines), recipients,
                               s=s, mailbox=platform)
            sender = platform.from_email
        else:  # local dev without PLATFORM_SMTP_* — tenant SMTP
            send_email_message(subject, '\n'.join(lines), recipients, s=s)
            sender = (s.from_email or s.smtp_user) if s else 'tenant SMTP'
        self.stdout.write(self.style.SUCCESS(
            f'Slug report sent from {sender} to {", ".join(recipients)} '
            f'— {total} hit(s) in {days} day(s).'))
