"""WhatsApp — opt-in, via the open-wa sidecar (whatsapp-sidecar/).

Unofficial WhatsApp automation can get the number banned, so:
  * off by default (AppSettings.whatsapp_enabled);
  * EVERY message needs a human approval (approve_message) — never auto-approved,
    even when email follow-ups are;
  * drain_whatsapp() sends only inside the email sending window, under
    whatsapp_daily_cap, 60–240 s apart, re-checking the phone Suppression and
    the follow-up enrollment right before sending;
  * sidecar unreachable → the message stays queued with a clear error and is
    retried later; nothing raises.
The zero-risk fallback is wa_me_link(): a click-to-chat link the user opens
themselves (works with the sidecar off)."""

import logging
import random
import re
from datetime import timedelta
from urllib.parse import quote

import requests
from django.utils import timezone

from .models import AppSettings, Suppression, WhatsAppMessage

log = logging.getLogger(__name__)

W = WhatsAppMessage.Statuses
TIMEOUT = 15
JITTER_MIN, JITTER_MAX = 60, 240
RETRY_AFTER = timedelta(minutes=10)
SECRET_HEADER = 'X-Sidecar-Secret'
DISABLED_ERROR = 'WhatsApp sending is turned off in Settings → WhatsApp.'
UNREACHABLE_ERROR = 'WhatsApp helper is not reachable — will retry. Check Settings → WhatsApp.'

COUNTRY_CODES = {
    'india': '91', 'in': '91', 'united states': '1', 'usa': '1', 'us': '1', 'canada': '1',
    'united kingdom': '44', 'uk': '44', 'england': '44', 'united arab emirates': '971',
    'uae': '971', 'singapore': '65', 'australia': '61', 'germany': '49', 'france': '33',
    'saudi arabia': '966', 'qatar': '974', 'malaysia': '60', 'sri lanka': '94',
    'nepal': '977', 'bangladesh': '880', 'south africa': '27', 'new zealand': '64',
}
DEFAULT_CC = '91'


class SidecarError(Exception):
    pass


def country_code(country='', state=''):
    key = (country or '').strip().lower()
    if key in COUNTRY_CODES:
        return COUNTRY_CODES[key]
    return DEFAULT_CC  # India default (also covers an Indian state with no country)


def normalize_phone(raw, country='', state=''):
    """E.164 ('+919876543210') or '' when it can't be a real number."""
    raw = (raw or '').strip()
    if not raw:
        return ''
    raw = re.split(r'(?i)\s*(?:ext\.?|x|/|,)\s*\d', raw)[0]
    plus = raw.startswith('+') or raw.startswith('00')
    digits = re.sub(r'\D', '', raw)
    if raw.startswith('00'):
        digits = digits[2:]
    if not plus:
        cc = country_code(country, state)
        digits = digits.lstrip('0')
        if not (digits.startswith(cc) and len(digits) >= len(cc) + 8 and
                (cc != '91' or len(digits) == 12)):
            digits = cc + digits
    if not 8 <= len(digits) <= 15:
        return ''
    if digits.startswith('91') and len(digits) != 12:
        return ''
    return '+' + digits


def wa_me_link(phone, text):
    """Click-to-chat link with the message pre-filled (no automation)."""
    return f'https://wa.me/{phone.lstrip("+")}?text={quote(text or "")}'


# ------------------------------------------------------------------
# Sidecar client
# ------------------------------------------------------------------

def _call(method, path, s=None, **kw):
    s = s or AppSettings.load()
    base = (s.whatsapp_sidecar_url or '').rstrip('/')
    if not base:
        raise SidecarError('No WhatsApp helper address set.')
    try:
        resp = requests.request(method, base + path, headers={SECRET_HEADER: s.whatsapp_secret or ''},
                                timeout=TIMEOUT, **kw)
    except requests.RequestException as exc:
        raise SidecarError(UNREACHABLE_ERROR) from exc
    if resp.status_code == 401:
        raise SidecarError('The WhatsApp helper refused our secret — check it in Settings.')
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if resp.status_code >= 400:
        raise SidecarError((data.get('error') if isinstance(data, dict) else '') or
                           f'WhatsApp helper error ({resp.status_code}).')
    return data


def sidecar_status(s=None):
    """{'reachable', 'state', 'connected', 'error'} — never raises."""
    try:
        data = _call('GET', '/status', s)
        return {'reachable': True, 'state': data.get('state', ''),
                'connected': bool(data.get('connected')), 'error': ''}
    except SidecarError as exc:
        return {'reachable': False, 'state': '', 'connected': False, 'error': str(exc)}


def sidecar_qr(s=None):
    """{'qr': data-url or '', 'error'} — the login QR to scan with the phone."""
    try:
        data = _call('GET', '/qr', s)
        return {'qr': data.get('qr') or '', 'error': ''}
    except SidecarError as exc:
        return {'qr': '', 'error': str(exc)}


def sidecar_send(to, text, s=None):
    data = _call('POST', '/send', s, json={'to': to, 'text': text})
    if not data.get('ok', True):
        raise SidecarError(data.get('error') or 'WhatsApp did not accept the message.')
    return data


# ------------------------------------------------------------------
# Approve → queue → drain (mirrors the email outbox)
# ------------------------------------------------------------------

def sent_today(now=None):
    from .outbox import day_bounds, local
    start, end = day_bounds(local(now or timezone.now()).date())
    return WhatsAppMessage.objects.filter(status=W.SENT, sent_at__gte=start, sent_at__lt=end).count()


def next_slot(now=None, s=None):
    """In-window time after the last booked/sent message + 60–240 s jitter."""
    from .outbox import next_window_start
    now = now or timezone.now()
    s = s or AppSettings.load()
    last = (WhatsAppMessage.objects.filter(status__in=[W.QUEUED, W.SENDING, W.SENT])
            .exclude(scheduled_for__isnull=True).order_by('-scheduled_for')
            .values_list('scheduled_for', flat=True).first())
    base = max(now, last + timedelta(seconds=random.randint(JITTER_MIN, JITTER_MAX))) if last else now
    return next_window_start(base, s)


def approve_message(msg_id, text=None):
    """Human approval — the ONLY way a WhatsApp message gets queued."""
    if text is not None:
        WhatsAppMessage.objects.filter(pk=msg_id, status__in=[W.DRAFT, W.FAILED]).update(text=text)
    slot = next_slot()
    n = WhatsAppMessage.objects.filter(pk=msg_id, status__in=[W.DRAFT, W.FAILED]).update(
        status=W.QUEUED, scheduled_for=slot, error='', updated_at=timezone.now())
    return WhatsAppMessage.objects.filter(pk=msg_id).first() if n else None


def reject_message(msg_id):
    return bool(WhatsAppMessage.objects.filter(pk=msg_id, status__in=[W.DRAFT, W.QUEUED, W.FAILED])
                .update(status=W.REJECTED, updated_at=timezone.now()))


def _defer(msg, error, when):
    WhatsAppMessage.objects.filter(pk=msg.pk, status__in=[W.QUEUED, W.SENDING]).update(
        status=W.QUEUED, error=error[:500], scheduled_for=when, updated_at=timezone.now())


def send_message(msg, s, now):
    """Claim (QUEUED → SENDING) + final checks + sidecar.  Returns status."""
    from .sequences import STOPPED_ERROR, enrollment_allows_send
    if not WhatsAppMessage.objects.filter(pk=msg.pk, status=W.QUEUED).update(
            status=W.SENDING, updated_at=now):
        return None  # another drain / a reject got it first
    if Suppression.is_phone_suppressed(msg.to_phone):
        WhatsAppMessage.objects.filter(pk=msg.pk).update(
            status=W.REJECTED, error='This number opted out of WhatsApp messages.')
        return W.REJECTED
    if msg.enrollment_id and not enrollment_allows_send(msg.enrollment_id):
        WhatsAppMessage.objects.filter(pk=msg.pk).update(status=W.REJECTED, error=STOPPED_ERROR)
        return W.REJECTED
    from billing.entitlements import BillingError, check
    from .tenancy import current_workspace
    try:
        check(current_workspace(), 'whatsapp')   # billing: plan feature + paid access, fail closed
    except BillingError:
        _defer(msg, 'WhatsApp is not included in your plan, or the subscription is inactive.',
               now + RETRY_AFTER)
        return W.QUEUED
    try:
        sidecar_send(msg.to_phone, msg.text, s)
    except SidecarError as exc:
        _defer(msg, str(exc), now + RETRY_AFTER)  # stays pending, never crashes
        return W.QUEUED
    except Exception as exc:
        log.warning('WhatsApp send %s failed: %s', msg.pk, exc)
        _defer(msg, UNREACHABLE_ERROR, now + RETRY_AFTER)
        return W.QUEUED
    WhatsAppMessage.objects.filter(pk=msg.pk).update(status=W.SENT, sent_at=timezone.now(), error='')
    return W.SENT


def drain_whatsapp(now=None, limit=20):
    """Send due approved WhatsApp messages of the ACTIVE workspace."""
    from .outbox import in_window, next_window_start
    now = now or timezone.now()
    s = AppSettings.load()
    stats = {'sent': 0, 'deferred': 0, 'rejected': 0}
    due = list(WhatsAppMessage.objects.filter(status=W.QUEUED, scheduled_for__lte=now)
               .order_by('scheduled_for', 'id')[:limit])
    if not due:
        return stats
    if not s.whatsapp_enabled:
        WhatsAppMessage.objects.filter(pk__in=[m.pk for m in due]).update(error=DISABLED_ERROR)
        stats['deferred'] = len(due)
        return stats
    if not in_window(now, s):
        return stats
    room = int(s.whatsapp_daily_cap or 0) - sent_today(now)
    for i, msg in enumerate(due):
        if room <= 0:
            nxt = next_window_start(now, s, skip_today=True)
            for m in due[i:]:
                _defer(m, 'Daily WhatsApp limit reached — goes out next sending day.', nxt)
            stats['deferred'] += len(due) - i
            break
        result = send_message(msg, s, now)
        if result == W.SENT:
            stats['sent'] += 1
            room -= 1
            # one message per drain keeps the 60–240 s spacing between sends
            for m in due[i + 1:]:
                WhatsAppMessage.objects.filter(pk=m.pk, status=W.QUEUED).update(
                    scheduled_for=now + timedelta(seconds=random.randint(JITTER_MIN, JITTER_MAX)))
            break
        if result == W.REJECTED:
            stats['rejected'] += 1
        elif result == W.QUEUED:
            stats['deferred'] += 1
            break  # sidecar down — don't hammer it
    return stats


def drain_all_workspaces():
    from .models import Workspace
    from .tenancy import workspace_context
    for ws in Workspace.all_tenants.filter(is_active=True).order_by('id'):
        from billing.entitlements import has_paid_access
        if not has_paid_access(ws):
            continue  # unpaid / expired workspace: workers skip it (billing)
        try:
            with workspace_context(ws):
                drain_whatsapp()
        except Exception as exc:
            log.warning('WhatsApp drain failed [%s]: %s', ws.slug, exc)
