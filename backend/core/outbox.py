"""Outbox — approved cold email waits here and leaves slowly.

Approving a draft never sends inline any more.  enqueue_draft() claims it
(mailer.claim_draft_for_send, the atomic conditional UPDATE) and parks it as
QUEUED with an assigned Mailbox and a scheduled_for time:

  * rotation — the active, unpaused mailbox with the most capacity left today
  * spacing  — 45–180 s random jitter after that mailbox's previous slot
  * window   — only inside AppSettings.send_window_start..end (Asia/Kolkata),
               weekdays only unless send_weekdays_only is off
  * cap      — Mailbox.effective_cap(): warmup ramp 5 → daily_cap over 14 days

drain_outbox() (run_worker every ~30 s per workspace, the `drain_outbox`
command, and a best-effort kick after an API approve) sends what is due:
claim_queued() is a second atomic UPDATE (QUEUED → APPROVED), so two drains
can never send the same draft, and send_draft() re-checks Suppression and the
recipient right before SMTP.  One SMTP login per mailbox per drain.

Crash safety: a draft is always QUEUED (picked up by the next drain) or
APPROVED (being sent).  An APPROVED draft untouched for mailer.STUCK_AFTER is
put back in the queue by recover_stuck().

Auto-pause: SMTP auth failure, or > 3 % bounces over the last 50 sends, pause
a mailbox for 24 h; its queued drafts move to another mailbox or wait.

Console mode (no mailbox, no SMTP): drafts are due immediately and are only
logged — sent_via='console' is NOT delivered."""

import logging
import random
import smtplib
from datetime import datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from .mailer import (STUCK_AFTER, SUPPRESSED_ERROR, claim_draft_for_send, open_mailbox_connection,
                     send_draft, smtp_configured, upsert_mailbox)
from .models import AppSettings, EmailDraft, Mailbox, Suppression

log = logging.getLogger(__name__)

TZ = ZoneInfo('Asia/Kolkata')
JITTER_MIN, JITTER_MAX = 45, 180          # seconds between two sends of one mailbox
RAMP_DAYS, RAMP_FLOOR = 14, 5             # warmup: 5/day → daily_cap over 14 days
PAUSE_FOR = timedelta(hours=24)
BOUNCE_WINDOW, BOUNCE_LIMIT = 50, 0.03
OVERDUE_RESPACE = timedelta(minutes=2)    # backlog older than this is re-spaced
DRAIN_LIMIT = 100                         # drafts looked at per drain
AUTH_PAUSE_REASON = 'The mailbox rejected our login — check its password / app password.'
BOUNCE_PAUSE_REASON = 'Too many emails bounced (over 3% of the last 50) — check your list.'

Q_ = EmailDraft.Statuses


# ------------------------------------------------------------------
# Time: the sending day and window are Asia/Kolkata
# ------------------------------------------------------------------

def local(dt):
    return timezone.localtime(dt, TZ)


def day_bounds(day):
    """(start, end) aware datetimes of one Asia/Kolkata calendar day."""
    start = datetime.combine(day, dtime.min, tzinfo=TZ)
    return start, start + timedelta(days=1)


def _window(s):
    start = min(max(int(s.send_window_start), 0), 23)
    end = min(max(int(s.send_window_end), 1), 24)
    if end <= start:  # nonsense setting — fall back to the default 9–18
        start, end = 9, 18
    return start, end


def _sending_day(day, s):
    return not (s.send_weekdays_only and day.weekday() >= 5)


def in_window(dt, s):
    start, end = _window(s)
    ldt = local(dt)
    return _sending_day(ldt.date(), s) and start <= ldt.hour < end


def next_window_start(dt, s, skip_today=False):
    """Earliest in-window moment at or after dt (the next day when skip_today)."""
    start, _end = _window(s)
    ldt = local(dt)
    day = ldt.date()
    for i in range(0, 15):
        d = day + timedelta(days=i)
        if i == 0 and skip_today:
            continue
        if not _sending_day(d, s):
            continue
        opening = datetime.combine(d, dtime(hour=start), tzinfo=TZ)
        if i == 0:
            if in_window(dt, s):
                return dt
            if ldt < opening:
                return opening
            continue
        return opening
    return dt + timedelta(days=1)  # unreachable with a sane window


# ------------------------------------------------------------------
# Capacity: warmup ramp, sent today, rotation
# ------------------------------------------------------------------

def ramp_cap(daily_cap, ramp_start, today, keep_ramp=False):
    """Linear warmup: RAMP_FLOOR on day 0 → daily_cap on day RAMP_DAYS.
    keep_ramp (WarmPulse says still warming / low health) holds the cap
    below daily_cap even after the 14 days."""
    daily_cap = max(int(daily_cap or 0), 0)
    if daily_cap <= RAMP_FLOOR:
        return daily_cap
    if ramp_start is None and not keep_ramp:
        return daily_cap
    day = max((today - ramp_start).days, 0) if ramp_start else 0
    if keep_ramp:
        day = min(day, RAMP_DAYS - 1)
    if day >= RAMP_DAYS:
        return daily_cap
    return RAMP_FLOOR + (daily_cap - RAMP_FLOOR) * day // RAMP_DAYS


def effective_cap(mailbox, today=None):
    from .warmpulse import still_warming
    today = today or local(timezone.now()).date()
    return ramp_cap(mailbox.daily_cap, mailbox.ramp_start, today, keep_ramp=still_warming(mailbox))


def sent_on(mailbox, day):
    start, end = day_bounds(day)
    return EmailDraft.objects.filter(mailbox=mailbox, status=Q_.SENT,
                                     sent_at__gte=start, sent_at__lt=end).count()


def booked_on(mailbox, day):
    """Sent + still queued for that Asia/Kolkata day (capacity already used)."""
    start, end = day_bounds(day)
    queued = EmailDraft.objects.filter(
        mailbox=mailbox, status__in=[Q_.QUEUED, Q_.APPROVED],
        scheduled_for__gte=start, scheduled_for__lt=end).count()
    return sent_on(mailbox, day) + queued


def is_paused(mailbox, now=None):
    now = now or timezone.now()
    return bool(mailbox.paused_until and mailbox.paused_until > now)


def usable_mailboxes(now=None):
    now = now or timezone.now()
    return [mb for mb in Mailbox.objects.filter(is_active=True)
            if mb.configured() and not is_paused(mb, now)]


def remaining_today(mailbox, now=None):
    today = local(now or timezone.now()).date()
    return max(effective_cap(mailbox, today) - booked_on(mailbox, today), 0)


def pick_mailbox(now=None, exclude=()):
    """Rotation: the usable mailbox with the most capacity left today
    (ties → least recently used id order).  None when there is none."""
    candidates = [mb for mb in usable_mailboxes(now) if mb.pk not in exclude]
    if not candidates:
        return None
    return max(candidates, key=lambda mb: (remaining_today(mb, now), -mb.pk))


def ensure_legacy_mailbox(s=None):
    """A workspace with SMTP in AppSettings but no Mailbox yet (settings saved
    by hand) gets one, so the outbox always has a mailbox to cap and pace."""
    s = s or AppSettings.load()
    if not smtp_configured(s) or Mailbox.objects.exists():
        return None
    return upsert_mailbox(s.smtp_host, s.smtp_port or 587, s.smtp_user, s.smtp_password,
                          from_email=s.from_email or s.smtp_user, ramp=False)


def console_mode():
    """No mailbox and no SMTP: approvals are only console-logged."""
    return not Mailbox.objects.filter(is_active=True).exists() and not smtp_configured()


# ------------------------------------------------------------------
# Scheduling + enqueue (the approve paths)
# ------------------------------------------------------------------

def _jitter():
    return timedelta(seconds=random.randint(JITTER_MIN, JITTER_MAX))


def _latest_booking(mailbox, day):
    """Latest queued slot or send of this mailbox on one Asia/Kolkata day."""
    start, end = day_bounds(day)
    q = (EmailDraft.objects.filter(mailbox=mailbox, status__in=[Q_.QUEUED, Q_.APPROVED],
                                   scheduled_for__gte=start, scheduled_for__lt=end)
         .order_by('-scheduled_for').values_list('scheduled_for', flat=True).first())
    sent = (EmailDraft.objects.filter(mailbox=mailbox, status=Q_.SENT,
                                      sent_at__gte=start, sent_at__lt=end)
            .order_by('-sent_at').values_list('sent_at', flat=True).first())
    return max([t for t in (q, sent) if t], default=None)


def next_slot(mailbox, now=None, s=None):
    """When this mailbox can send its next queued email: the first sending
    day with capacity left, at least a jitter after that day's latest slot /
    send, inside the window.  None when no day in two weeks has room."""
    now = now or timezone.now()
    s = s or AppSettings.load()
    candidate = next_window_start(now, s)
    for _ in range(15):
        day = local(candidate).date()
        if booked_on(mailbox, day) < effective_cap(mailbox, day):
            previous = _latest_booking(mailbox, day)
            slot = candidate
            if previous and previous + timedelta(seconds=JITTER_MIN) > slot:
                slot = previous + _jitter()
            elif slot != now:  # a fresh window opening — don't fire on the dot
                slot += timedelta(seconds=random.randint(0, JITTER_MAX))
            if in_window(slot, s) and local(slot).date() == day:
                return slot
        candidate = next_window_start(candidate, s, skip_today=True)
    return None


def assign(now=None, s=None, exclude=()):
    """(mailbox, scheduled_for) for one new queued email.  Console mode →
    (None, now).  Mailboxes exist but all paused / full → (None, None):
    the draft waits queued and a later drain assigns it."""
    now = now or timezone.now()
    s = s or AppSettings.load()
    ensure_legacy_mailbox(s)
    if console_mode():
        return None, now
    best = None
    for mb in sorted(usable_mailboxes(now), key=lambda m: -remaining_today(m, now)):
        if mb.pk in exclude:
            continue
        slot = next_slot(mb, now, s)
        if slot is not None and (best is None or slot < best[1]):
            best = (mb, slot)
            if remaining_today(mb, now) > 0:
                break  # most capacity today wins (rotation)
    return best or (None, None)


def enqueue_draft(draft_id, from_statuses=(Q_.DRAFT, Q_.FAILED), prefer_mailbox=None):
    """Approve = claim + queue.  Returns the QUEUED draft, or None when the
    claim lost (already approved/queued/sent by another request).

    `prefer_mailbox` (an answer to a prospect's reply, core.inbox) keeps the
    thread on the mailbox they wrote to when it is usable and has a slot;
    otherwise normal rotation applies."""
    claimed = claim_draft_for_send(draft_id, from_statuses=from_statuses)
    if claimed is None:
        return None
    now = timezone.now()
    if prefer_mailbox is None and claimed.enrollment_id and claimed.mailbox_id:
        prefer_mailbox = claimed.mailbox  # a follow-up stays on the cold email's mailbox
    try:
        mailbox, slot = None, None
        if (prefer_mailbox is not None and not console_mode()
                and prefer_mailbox.pk in {mb.pk for mb in usable_mailboxes(now)}):
            slot = next_slot(prefer_mailbox, now)
            if slot is not None:
                mailbox = prefer_mailbox
        if mailbox is None:
            mailbox, slot = assign(now)
    except Exception as exc:  # never leave the claim dangling in APPROVED
        log.warning('Outbox assignment failed for draft %s: %s', draft_id, exc)
        mailbox, slot = None, None
    EmailDraft.objects.filter(pk=draft_id, status=Q_.APPROVED).update(
        status=Q_.QUEUED, mailbox=mailbox, scheduled_for=slot or now + timedelta(minutes=5),
        error='', updated_at=timezone.now())
    return EmailDraft.objects.filter(pk=draft_id).first()


def claim_queued(draft_id, now=None):
    """Atomic QUEUED → APPROVED for a due draft: two drains racing for the
    same draft — exactly one wins."""
    now = now or timezone.now()
    return bool(EmailDraft.objects.filter(pk=draft_id, status=Q_.QUEUED, scheduled_for__lte=now)
                .update(status=Q_.APPROVED, updated_at=now))


# ------------------------------------------------------------------
# Auto-pause
# ------------------------------------------------------------------

def pause_mailbox(mailbox, reason, now=None):
    now = now or timezone.now()
    mailbox.paused_until = now + PAUSE_FOR
    mailbox.paused_reason = reason[:300]
    mailbox.save(update_fields=['paused_until', 'paused_reason', 'updated_at'])
    log.warning('Mailbox %s paused: %s', mailbox.from_email, reason)


def resume_mailbox(mailbox, now=None):
    mailbox.paused_until = None
    mailbox.paused_reason = ''
    mailbox.resumed_at = now or timezone.now()
    mailbox.save(update_fields=['paused_until', 'paused_reason', 'resumed_at', 'updated_at'])


def bounce_rate(mailbox):
    """(bounced, sends) over the mailbox's last BOUNCE_WINDOW sends since its
    last manual resume.  Bounce processing sets EmailDraft.bounced_at."""
    sends = EmailDraft.objects.filter(mailbox=mailbox, status=Q_.SENT, sent_at__isnull=False)
    if mailbox.resumed_at:
        sends = sends.filter(sent_at__gt=mailbox.resumed_at)
    recent = list(sends.order_by('-sent_at').values_list('bounced_at', flat=True)[:BOUNCE_WINDOW])
    return sum(1 for b in recent if b), len(recent)


def check_bounce_pause(mailbox, now=None):
    """Pause when bounces exceed 3 % of the last 50 sends.  True if paused."""
    if is_paused(mailbox, now):
        return False
    bounced, total = bounce_rate(mailbox)
    if total and bounced / total > BOUNCE_LIMIT:
        pause_mailbox(mailbox, BOUNCE_PAUSE_REASON, now)
        return True
    return False


# ------------------------------------------------------------------
# Drain
# ------------------------------------------------------------------

def recover_stuck(now=None):
    """APPROVED and untouched for STUCK_AFTER = its sender died; requeue."""
    now = now or timezone.now()
    return EmailDraft.objects.filter(status=Q_.APPROVED, updated_at__lt=now - STUCK_AFTER).update(
        status=Q_.QUEUED, scheduled_for=now, updated_at=now)


def _reschedule(draft, now, s, exclude=()):
    mailbox, slot = assign(now, s, exclude=exclude)
    EmailDraft.objects.filter(pk=draft.pk, status=Q_.QUEUED).update(
        mailbox=mailbox, scheduled_for=slot or now + timedelta(minutes=15), updated_at=now)


def _respace_backlog(mailbox, now, s):
    """A backlog (worker was down, window just opened) must not burst out in
    one drain: re-space every overdue draft of this mailbox from now."""
    overdue = list(EmailDraft.objects.filter(mailbox=mailbox, status=Q_.QUEUED,
                                             scheduled_for__lt=now - OVERDUE_RESPACE)
                   .order_by('scheduled_for', 'id'))
    if len(overdue) < 2:
        return
    # park them, then hand out fresh slots one by one (next_slot sees each)
    EmailDraft.objects.filter(pk__in=[d.pk for d in overdue]).update(scheduled_for=None)
    for i, d in enumerate(overdue):
        slot = now if i == 0 else next_slot(mailbox, now, s)
        EmailDraft.objects.filter(pk=d.pk, status=Q_.QUEUED).update(
            scheduled_for=slot or now + timedelta(minutes=15), updated_at=now)


def _send_batch(mailbox, drafts, now, s, stats):
    """Send due drafts of one mailbox over one SMTP login, up to its cap."""
    today = local(now).date()
    room = effective_cap(mailbox, today) - sent_on(mailbox, today)
    if room <= 0:
        for d in drafts:  # cap hit — wait for the next sending day
            _reschedule(d, now, s)
            stats['deferred'] += 1
        return
    connection = None
    try:
        connection = open_mailbox_connection(mailbox)
    except smtplib.SMTPAuthenticationError:
        pause_mailbox(mailbox, AUTH_PAUSE_REASON, now)
        for d in drafts:  # hand the work to another mailbox, or wait
            _reschedule(d, now, s, exclude=(mailbox.pk,))
            stats['deferred'] += 1
        return
    except Exception as exc:  # unreachable server — try again next drain
        log.warning('Outbox: cannot connect %s: %s', mailbox.from_email, exc)
        EmailDraft.objects.filter(pk__in=[d.pk for d in drafts], status=Q_.QUEUED).update(
            scheduled_for=now + timedelta(minutes=5), updated_at=now)
        stats['deferred'] += len(drafts)
        return
    try:
        for d in drafts:
            if room <= 0:
                _reschedule(d, now, s)
                stats['deferred'] += 1
                continue
            if not claim_queued(d.pk, now):
                continue  # another drain (or a reject) got it first
            d.refresh_from_db()
            try:
                connection.noop()
            except Exception:  # dropped session — one fresh login
                connection = open_mailbox_connection(mailbox)
            send_draft(d, mailbox=mailbox, connection=connection)
            stats[d.status] = stats.get(d.status, 0) + 1
            if d.status == Q_.SENT:
                room -= 1
    finally:
        try:
            connection.quit()
        except Exception:
            pass
    check_bounce_pause(mailbox, now)


def drain_outbox(now=None, limit=DRAIN_LIMIT):
    """Send every due QUEUED draft of the ACTIVE workspace (call inside
    workspace_context).  Returns counts.  Never raises for one bad draft."""
    from . import warmpulse
    now = now or timezone.now()
    s = AppSettings.load()
    stats = {'sent': 0, 'failed': 0, 'rejected': 0, 'deferred': 0}
    ensure_legacy_mailbox(s)
    warmpulse.sync()
    recover_stuck(now)

    # pre-send suppression sweep: an unsubscribe since approval wins
    for d in EmailDraft.objects.filter(status=Q_.QUEUED).only('pk', 'to_email'):
        if Suppression.is_suppressed(d.to_email):
            stats['rejected'] += EmailDraft.objects.filter(pk=d.pk, status=Q_.QUEUED).update(
                status=Q_.REJECTED, error=SUPPRESSED_ERROR, updated_at=now)

    if console_mode():
        for d in EmailDraft.objects.filter(status=Q_.QUEUED, scheduled_for__lte=now)[:limit]:
            if claim_queued(d.pk, now):
                d.refresh_from_db()
                send_draft(d)  # console log — NOT delivered
                stats[d.status] = stats.get(d.status, 0) + 1
        return stats

    usable = {mb.pk: mb for mb in usable_mailboxes(now)}
    # drafts with no / paused / removed mailbox get a new one (or keep waiting)
    orphans = EmailDraft.objects.filter(status=Q_.QUEUED).filter(
        Q(mailbox__isnull=True) | ~Q(mailbox_id__in=list(usable)))
    for d in orphans.filter(scheduled_for__lte=now + timedelta(minutes=1)):
        _reschedule(d, now, s)

    if not in_window(now, s):
        return stats
    for mb in usable.values():
        _respace_backlog(mb, now, s)
        due = list(EmailDraft.objects.filter(status=Q_.QUEUED, mailbox=mb, scheduled_for__lte=now)
                   .order_by('scheduled_for', 'id')[:limit])
        if due:
            _send_batch(mb, due, now, s, stats)
    return stats


def drain_all_workspaces():
    """Operator/worker entry: drain each active workspace in its own context."""
    from .models import Workspace
    from .tenancy import workspace_context
    totals = {}
    for ws in Workspace.all_tenants.filter(is_active=True).order_by('id'):
        try:
            with workspace_context(ws):
                totals[ws.slug] = drain_outbox()
        except Exception as exc:
            log.warning('Outbox drain failed [%s]: %s', ws.slug, exc)
    return totals


def kick_drain():
    """Best-effort drain right after an API approve, so a due email (or a
    console-mode draft) leaves now instead of at the worker's next tick.
    Background thread with the workspace passed explicitly; never raises.
    Off when settings.OUTBOX_API_DRAIN is false (tests)."""
    import threading

    from django.conf import settings as django_settings
    from django.db import close_old_connections

    from .tenancy import current_workspace, workspace_context
    if not getattr(django_settings, 'OUTBOX_API_DRAIN', True):
        return False
    ws = current_workspace()
    if ws is None:
        return False

    def run():
        try:
            with workspace_context(ws):
                drain_outbox()
        except Exception as exc:
            log.warning('API outbox drain failed: %s', exc)
        finally:
            close_old_connections()

    threading.Thread(target=run, name='outbox-kick', daemon=True).start()
    return True


def queued_phrase(draft):
    """Plain-language 'when does it go out' for chat replies."""
    if draft.mailbox_id is None and console_mode():
        return ('no mailbox is connected, so it will only be logged on the server '
                '(not delivered)')
    if not draft.scheduled_for:
        return 'it is queued and goes out at the next free sending slot'
    when = local(draft.scheduled_for)
    today = local(timezone.now()).date()
    day = '' if when.date() == today else f' on {when:%a %d %b}'
    return f'it is queued and goes out at about {when:%H:%M}{day} (IST)'
