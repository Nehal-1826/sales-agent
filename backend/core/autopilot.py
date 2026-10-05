"""AI Autopilot — after explicit user consent, the orchestrator runs the
whole product autonomously: pipeline cycles, draft approval and sending.

Guard rails (all enforced in `autopilot_tick`):
- disabled by default; only runs while AppSettings.autopilot_enabled
- auto-approves ONLY drafts whose recipient was genuinely scraped from the
  lead's own site (lead.contact_email) — derived/best-guess addresses stay
  for human review
- hard daily cap on auto-sends (AppSettings.autopilot_daily_limit)
- recipients of previously FAILED sends are never retried automatically
- every decision lands in ActivityLog, visible live in the UI
"""

import logging

from django.utils import timezone

from .models import ActivityLog, AppSettings, EmailDraft, Lead

log = logging.getLogger(__name__)


def log_activity(action, detail='', actor='autopilot'):
    ActivityLog.objects.create(actor=actor, action=action, detail=detail[:500])
    log.info('[autopilot] %s — %s', action, detail[:200])


def _sent_today():
    """Auto-sends since midnight (server time) — the daily cap counter."""
    midnight = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return EmailDraft.objects.filter(auto_sent=True, sent_at__gte=midnight).count()


def autopilot_status():
    s = AppSettings.load()
    sent = _sent_today()
    return {
        'enabled': s.autopilot_enabled,
        'sentToday': sent,
        'dailyLimit': s.autopilot_daily_limit,
        'activity': [
            {'time': a.created_at.isoformat(), 'action': a.action, 'detail': a.detail}
            for a in ActivityLog.objects.all()[:12]
        ],
    }


def set_autopilot(enabled, daily_limit=None):
    s = AppSettings.load()
    s.autopilot_enabled = bool(enabled)
    if daily_limit:
        s.autopilot_daily_limit = max(1, min(100, int(daily_limit)))
    s.save(update_fields=['autopilot_enabled', 'autopilot_daily_limit', 'updated_at'])
    log_activity('autopilot_on' if enabled else 'autopilot_off',
                 f'User {"accepted" if enabled else "revoked"} autopilot control'
                 + (f' (daily send cap: {s.autopilot_daily_limit})' if enabled else ''))
    return autopilot_status()


def _eligible(draft):
    """A draft the AI may send on its own: real scraped recipient, and that
    recipient never bounced before. Anything else waits for the human."""
    lead = draft.lead
    if not draft.to_email or '@' not in draft.to_email or '.' not in draft.to_email.split('@')[-1]:
        return False, 'no usable recipient'
    # only genuinely scraped addresses (a derived contact@domain is a guess)
    if not (lead and lead.contact_email and draft.to_email.lower() == lead.contact_email.lower()):
        return False, 'recipient was not scraped from their site — human review'
    if EmailDraft.objects.filter(to_email__iexact=draft.to_email,
                                 status=EmailDraft.Statuses.FAILED).exists():
        return False, 'a previous send to this address failed — human review'
    return True, ''


def autopilot_tick():
    """Run after each pipeline cycle: auto-approve + send eligible drafts
    within the daily cap. Returns the number sent."""
    s = AppSettings.load()
    if not s.autopilot_enabled:
        return 0

    from .mailer import send_draft  # late import — keeps module load light

    sent = 0
    for draft in EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).order_by('created_at'):
        if _sent_today() + sent >= s.autopilot_daily_limit:
            log_activity('cap_reached',
                         f'Daily auto-send cap hit ({s.autopilot_daily_limit}) — '
                         f'remaining drafts wait for human approval')
            break
        ok, reason = _eligible(draft)
        if not ok:
            log_activity('skipped', f'{draft.company}: {reason}')
            continue
        draft.status = EmailDraft.Statuses.APPROVED
        draft.auto_sent = True
        draft.save(update_fields=['status', 'auto_sent', 'updated_at'])
        draft = send_draft(draft)
        if draft.status == EmailDraft.Statuses.SENT:
            sent += 1
            via = 'console' if draft.sent_via == EmailDraft.Via.CONSOLE else 'SMTP'
            log_activity('email_sent', f'{draft.company} → {draft.to_email} ({via})')
        else:
            log_activity('send_failed', f'{draft.company} → {draft.to_email}: {draft.error[:120]}')
    return sent
