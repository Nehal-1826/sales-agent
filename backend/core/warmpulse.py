"""WarmPulse — optional per-workspace warmup-status sync.

WarmPulse (sibling product) warms mailboxes up.  With an API key in
Settings (AppSettings.warmpulse_api_key, created in WarmPulse under
Workspace → API keys, format ``wp_live_…``) we read

    GET {warmpulse_api_url}/api/workspace/mailboxes?page=N&page_size=100
    Authorization: Bearer wp_live_…

→ {items: [{email_address, warmup_status, warmth_score, ...}], total, ...}
and copy warmup_status / warmth_score onto our Mailbox rows matched by email.
A mailbox still warming (status pending/active) or with warmth < 70 keeps
the outbox's warmup ramp cap even after 14 days (core.outbox.effective_cap).

Blank key = feature off; every function here is a no-op and never raises.
If WarmPulse is served under a path prefix (e.g. /warmpulse), put it in the
base URL setting."""

import logging
from datetime import timedelta

import requests
from django.utils import timezone

from .models import AppSettings, Mailbox

log = logging.getLogger(__name__)

DEFAULT_URL = 'https://warmpulse.tech'
TIMEOUT = 8
SYNC_EVERY = timedelta(hours=1)
MAX_PAGES = 20
# WarmPulse warmup_status values: pending | active | paused | completed.
# pending/active = the warmup schedule is still running.
WARMING_STATUSES = {'pending', 'active', 'warming'}
LOW_HEALTH = 70.0


def enabled(s=None):
    s = s or AppSettings.load()
    return bool((s.warmpulse_api_key or '').strip())


def still_warming(mailbox):
    """True when WarmPulse says this mailbox should stay on the ramp cap."""
    if (mailbox.warmup_status or '').lower() in WARMING_STATUSES:
        return True
    return mailbox.health_score is not None and mailbox.health_score < LOW_HEALTH


def fetch_mailboxes(s=None):
    """[{email, warmup_status, health_score}] from WarmPulse, or None on any
    failure (bad key, network, unexpected shape)."""
    s = s or AppSettings.load()
    key = (s.warmpulse_api_key or '').strip()
    if not key:
        return None
    base = (s.warmpulse_api_url or DEFAULT_URL).strip().rstrip('/')
    out, page = [], 1
    try:
        while page <= MAX_PAGES:
            resp = requests.get(f'{base}/api/workspace/mailboxes',
                                params={'page': page, 'page_size': 100},
                                headers={'Authorization': f'Bearer {key}',
                                         'Accept': 'application/json'},
                                timeout=TIMEOUT)
            if resp.status_code != 200:
                log.warning('WarmPulse sync: HTTP %s', resp.status_code)
                return None
            data = resp.json()
            items = data.get('items') if isinstance(data, dict) else data
            if not isinstance(items, list):
                return None
            for item in items:
                if not isinstance(item, dict):
                    continue
                email = (item.get('email_address') or item.get('email') or '').strip().lower()
                if not email:
                    continue
                score = item.get('warmth_score', item.get('health_score'))
                try:
                    score = float(score) if score is not None else None
                except (TypeError, ValueError):
                    score = None
                out.append({'email': email,
                            'warmup_status': str(item.get('warmup_status') or '')[:30],
                            'health_score': score})
            total = data.get('total') if isinstance(data, dict) else None
            if not items or not isinstance(total, int) or len(out) >= total:
                break
            page += 1
    except Exception as exc:  # network / JSON — sync is best effort
        log.warning('WarmPulse sync failed: %s', exc.__class__.__name__)
        return None
    return out


def sync(force=False):
    """Update Mailbox.warmup_status/health_score from WarmPulse, at most
    hourly unless forced.  Returns the number of mailboxes matched, or None
    when skipped / failed.  Never raises."""
    try:
        s = AppSettings.load()
        if not enabled(s):
            return None
        now = timezone.now()
        if not force and s.warmpulse_synced_at and now - s.warmpulse_synced_at < SYNC_EVERY:
            return None
        # stamp first so a failing WarmPulse is retried hourly, not every drain
        s.warmpulse_synced_at = now
        s.save(update_fields=['warmpulse_synced_at', 'updated_at'])
        remote = fetch_mailboxes(s)
        if remote is None:
            return None
        by_email = {r['email']: r for r in remote}
        matched = 0
        for mb in Mailbox.objects.all():
            r = by_email.get((mb.from_email or '').strip().lower())
            if r is None:
                continue
            mb.warmup_status = r['warmup_status']
            mb.health_score = r['health_score']
            mb.warmpulse_synced_at = now
            mb.save(update_fields=['warmup_status', 'health_score', 'warmpulse_synced_at', 'updated_at'])
            matched += 1
        return matched
    except Exception as exc:
        log.warning('WarmPulse sync error: %s', exc)
        return None
