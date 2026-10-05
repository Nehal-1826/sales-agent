"""Daily lead report — a brief email of today's scraping + potentials.

Sent every day at 20:00 IST (Asia/Kolkata) to AppSettings.report_email,
falling back to all superuser/staff emails.  Uses the same delivery policy
as mailer.py: real SMTP when configured in Settings, console delivery
(prints to the Django server log) when not.
"""

import logging
from datetime import datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from .mailer import branded_email_html, send_email_message, smtp_configured, text_to_email_html
from .models import AppSettings, Lead, PipelineRun, Potential, User

log = logging.getLogger(__name__)

IST = ZoneInfo('Asia/Kolkata')
REPORT_HOUR = 20  # 8 PM IST


def now_ist():
    return timezone.now().astimezone(IST)


def today_window_ist():
    """[start, end) datetimes for 'today' in IST, regardless of server timezone."""
    start = datetime.combine(now_ist().date(), dtime.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def next_report_time_ist(after=None):
    """The next 20:00 IST moment at or after `after` (defaults to now)."""
    now = after or now_ist()
    candidate = datetime.combine(now.date(), dtime(hour=REPORT_HOUR), tzinfo=IST)
    if now > candidate:
        candidate += timedelta(days=1)
    return candidate


def _resolve_recipients():
    s = AppSettings.load()
    explicit = [e.strip() for e in (s.report_email or '').split(',') if e.strip()]
    if explicit:
        return explicit
    staff = User.objects.filter(is_superuser=True) | User.objects.filter(is_staff=True)
    return sorted({u.email for u in staff if u.email})


def build_daily_report(day=None):
    """(subject, body) — brief summary of one IST day: leads scraped, potentials, cycles.
    day=None → ALL TIME (for on-demand reports from the Leads & Reports page)."""
    if day:
        start = datetime.combine(day, dtime.min, tzinfo=IST)
        end = start + timedelta(days=1)
        leads = list(Lead.objects.filter(created_at__gte=start, created_at__lt=end).order_by('-score'))
        potentials = list(Potential.objects.filter(created_at__gte=start, created_at__lt=end).order_by('-value'))
        runs = list(PipelineRun.objects.filter(started_at__gte=start, started_at__lt=end))
        label = day.strftime('%d %b %Y')
    else:
        leads = list(Lead.objects.order_by('-score'))
        potentials = list(Potential.objects.order_by('-created_at'))
        runs = list(PipelineRun.objects.all())
        label = 'all time'
    start_aware, end_aware = None, None  # kept for clarity — filters applied above

    def where(l):
        return ', '.join(p for p in (l.state, l.country) if p) or '—'

    lines = [
        f'Lead report — {label}' + (' (IST)' if day else ''),
        '=' * 52,
        '',
        f'LEADS {"SCRAPED TODAY" if day else "IN CRM"}: {len(leads)}',
    ]
    for l in leads[:15]:
        flag = 'no website' if not l.has_website else f'{len(l.findings)} flaw(s)'
        lines.append(f'  • {l.company} — {l.industry or "?"} | {where(l)} | score {l.score}/100 | {flag}')
    if len(leads) > 15:
        lines.append(f'  … and {len(leads) - 15} more')

    lines += ['', f'{"NEW POTENTIALS TODAY" if day else "POTENTIALS"}: {len(potentials)}']
    for p in potentials[:10]:
        lines.append(f'  • {p.company} — {p.opportunity} | {p.stage} | {p.value}')
    if len(potentials) > 10:
        lines.append(f'  … and {len(potentials) - 10} more')
    if not potentials:
        lines.append('  (none crossed the opportunity threshold)')

    lines += ['', f'PIPELINE CYCLES {"TODAY" if day else "TOTAL"}: {len(runs)}']
    for r in runs:
        lines.append(
            f'  • Run #{r.id} ({r.triggered_by}): {r.leads_created} lead(s), '
            f'{r.potentials_created} potential(s)')

    totals = (Lead.objects.count(), Potential.objects.count())
    brand = (AppSettings.load().company_name or 'Shailog Technologies').strip()
    lines += ['', f'TOTALS: {totals[0]} leads · {totals[1]} potentials in CRM',
              '', f'— {brand} · Marketing & Sales AI (Search · Profile · Copywright · Responder)']

    subject = f'[{brand.split()[0]}] Lead report — {label}'
    return subject, '\n'.join(lines)


def send_daily_report(day=None):
    """Build + deliver the report. Returns (status, subject) — status: smtp|console|skipped."""
    subject, body = build_daily_report(day)
    recipients = _resolve_recipients()
    if not recipients:
        log.warning('Daily report has no recipient — set Settings.report_email or a '
                    'superuser email. Skipping.')
        return 'skipped', subject

    s = AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'reports@agentic-ai.local'

    if smtp_configured(s):
        send_email_message(
            subject, body, recipients, s,
            html=branded_email_html(text_to_email_html(body), s),
        )
        log.info('Daily report emailed to %s', ', '.join(recipients))
        return 'smtp', subject

    line = '-' * 62
    print(f'\n{line}\n[DAILY REPORT — console delivery, SMTP not configured]\n{line}')
    print(f'From:    {from_email}\nTo:      {", ".join(recipients)}\nSubject: {subject}\n')
    print(f'{body}\n{line}\n')
    log.info('Console-delivered daily report (recipients: %s)', ', '.join(recipients))
    return 'console', subject
