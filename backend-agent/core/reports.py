"""Daily lead report — a brief email of today's scraping + potentials.

Sent every day at 20:00 IST (Asia/Kolkata) to AppSettings.report_email,
falling back to all superuser/staff emails.  Uses the same delivery policy
as mailer.py: real SMTP when configured in Settings, console delivery
(prints to the Django server log) when not.
"""

import logging
import re
from datetime import datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from . import formatting
from .mailer import branded_email_html, send_email_message, smtp_configured, text_to_email_html
from .models import AppSettings, Lead, PipelineRun, Potential, ReportRound, User
from .tenancy import current_workspace

log = logging.getLogger(__name__)

IST = ZoneInfo('Asia/Kolkata')
REPORT_HOUR = 20  # 8 PM IST


def now_ist():
    return timezone.now().astimezone(IST)


def today_window_ist():
    """[start, end) datetimes for 'today' in IST, regardless of server timezone."""
    start = datetime.combine(now_ist().date(), dtime.min, tzinfo=IST)
    return start, start + timedelta(days=1)


def report_time_ist(day):
    """20:00 IST on `day`."""
    return datetime.combine(day, dtime(hour=REPORT_HOUR), tzinfo=IST)


def next_report_time_ist(after=None):
    """The next 20:00 IST moment at or after `after` (defaults to now)."""
    now = after or now_ist()
    candidate = report_time_ist(now.date())
    if now > candidate:
        candidate += timedelta(days=1)
    return candidate


def last_report_round():
    """The IST day of the newest 20:00 round that went out — None when none is recorded."""
    row = ReportRound.objects.order_by('-day').first()
    return row.day if row else None


def note_report_round(day):
    """Remember that the 20:00 round for IST day `day` went out."""
    ReportRound.objects.get_or_create(day=day)


def missed_report_round(now=None):
    """The 20:00 IST round that should have gone out and has not — its IST day, else None.

    The worker may be down at 20:00 (a deploy, a crash) and come back later:
    that round is sent the moment the report loop starts again. Only the most
    recent 20:00 that has passed counts — an older one a day late is noise.
    With no record at all (a first start, or the upgrade from before records
    existed) only TODAY'S is claimed: a routine first start in the morning
    sends nothing."""
    now = now or now_ist()
    last = last_report_round()
    passed = next_report_time_ist(now) - timedelta(days=1)      # the most recent 20:00 that has passed
    if last is not None and last >= passed.date():
        return None
    if last is None and passed.date() != now.date():
        return None
    return passed.date()


def _resolve_recipients():
    s = AppSettings.load()
    explicit = [e.strip() for e in (s.report_email or '').split(',') if e.strip()]
    if explicit:
        return explicit
    # THIS workspace's owners/admins only: a report must never reach another
    # company's staff or the platform operator
    staff = User.objects.filter(workspace=current_workspace(), role__in=('owner', 'admin'))
    return sorted({u.email for u in staff if u.email})


def _value_number(p):
    """Numeric worth of a Potential.value string for sorting.

    Values are free text ('$36,000', '$50k', '$1.2M', '$5,000-$10,000'), so
    take the FIRST number and apply its suffix — concatenating every digit
    would rank '$5,000-$10,000' above every real deal."""
    m = re.search(r'(\d[\d,.]*)\s*([kKmM]|lakh|crore)?', p.value or '')
    if not m:
        return 0
    try:
        amount = float(m.group(1).replace(',', ''))
    except ValueError:
        return 0
    suffix = (m.group(2) or '').lower()
    multiplier = {'k': 1_000, 'm': 1_000_000, 'lakh': 100_000, 'crore': 10_000_000}
    return int(amount * multiplier.get(suffix, 1))


def report_window_ist(day, since=None):
    """The stretch the 20:00 round for IST day `day` covers: from the previous
    round (`since` — its 20:00) up to its own 20:00, or the 24 hours before it
    when there was none. Everything since the last report, in one report and
    in no report twice: a calendar day would leave a lead found at 21:00 out
    of every report (today's went out at 20:00, tomorrow's starts at midnight)."""
    end = report_time_ist(day)
    if since is None or since >= end:        # a wrong clock must not give an empty or backwards window
        since = end - timedelta(days=1)
    return since, end


def build_daily_report(day=None, window=None):
    """(subject, body) — brief summary: leads scraped, potentials, cycles.
    window=(start, end) → that stretch (the 20:00 round: everything since the
    previous one); day=<date> → that calendar day in IST; neither → ALL TIME
    (for on-demand reports from the Leads & Reports page)."""
    # a report is a document: always in Indian format (core.formatting)
    if window is not None:
        start, end = window
        label = f'{formatting.datetime_label(start)} – {formatting.datetime_label(end)}'
        heads = ('LEADS FOUND', 'NEW POTENTIALS', 'PIPELINE CYCLES')
    elif day:
        start = datetime.combine(day, dtime.min, tzinfo=IST)
        end = start + timedelta(days=1)
        label = formatting.date(day)
        heads = ('LEADS SCRAPED TODAY', 'NEW POTENTIALS TODAY', 'PIPELINE CYCLES TODAY')
    else:
        start = end = None
        label = 'all time'
        heads = ('LEADS IN CRM', 'POTENTIALS', 'PIPELINE CYCLES TOTAL')

    def between(queryset, field):
        if start is None:
            return queryset
        return queryset.filter(**{f'{field}__gte': start, f'{field}__lt': end})

    leads = list(between(Lead.objects.order_by('-score'), 'created_at'))
    potentials = list(between(Potential.objects.all(), 'created_at'))
    runs = list(between(PipelineRun.objects.all(), 'started_at'))
    # biggest opportunities first — a report leads with the largest deals
    potentials.sort(key=_value_number, reverse=True)  # numeric, not text

    def where(l):
        return ', '.join(p for p in (l.state, l.country) if p) or '—'

    lines = [
        f'Lead report — {label}' + (' (IST)' if day else ''),
        '=' * 52,
        '',
        f'{heads[0]}: {len(leads)}',
    ]
    for l in leads[:15]:
        flag = 'no website' if not l.has_website else f'{len(l.findings)} flaw(s)'
        lines.append(f'  • {l.company} — {l.industry or "?"} | {where(l)} | score {l.score}/100 | {flag}')
        # contact details on their own line — email and phone as separate fields
        lines.append(f'      email: {l.contact_email or "—"} | phone: {l.contact_phone or "—"}')
    if len(leads) > 15:
        lines.append(f'  … and {len(leads) - 15} more')

    lines += ['', f'{heads[1]}: {len(potentials)}']
    for p in potentials[:10]:
        lines.append(f'  • {p.company} — {p.opportunity} | {p.stage} | {p.value}')
    if len(potentials) > 10:
        lines.append(f'  … and {len(potentials) - 10} more')
    if not potentials:
        lines.append('  (none crossed the opportunity threshold)')

    lines += ['', f'{heads[2]}: {len(runs)}']
    for r in runs:
        line = (f'  • Run #{r.id} ({r.triggered_by}): {r.leads_created} lead(s), '
                f'{r.potentials_created} potential(s)')
        if (r.summary or {}).get('searchPaused'):   # "0 leads" had a reason
            line += ' — search paused (search engines were rate-limiting us)'
        lines.append(line)

    totals = (Lead.objects.count(), Potential.objects.count())
    brand = (AppSettings.load().company_name or 'WarmPulse').strip()
    lines += ['', f'TOTALS: {totals[0]} leads · {totals[1]} potentials in CRM',
              '', f'— {brand} · Marketing & Sales AI (Search · Profile · Copywright · Responder)']

    subject = f'[{brand.split()[0]}] Lead report — {label}'
    return subject, '\n'.join(lines)


def send_daily_report(day=None, window=None):
    """Build + deliver the report. Returns (status, subject) — status: smtp|console|skipped.
    `window` is the 20:00 round's stretch (report_window_ist); `day` a calendar day;
    neither → all time."""
    subject, body = build_daily_report(day, window)
    recipients = _resolve_recipients()
    if not recipients:
        log.warning('Daily report has no recipient — set Settings.report_email or a '
                    'superuser email. Skipping.')
        return 'skipped', subject

    s = AppSettings.load()
    from_email = s.from_email or s.smtp_user or 'noreply@warmpulse.tech'

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
