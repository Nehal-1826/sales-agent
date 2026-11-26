"""Enter as user: the ticket and what may be done inside the impersonated tab.

A platform admin opens a customer's workspace in a new tab through a ticket.
The ticket is random and stored only as its SHA-256; it starts exactly once,
within 10 minutes of being issued, and lasts 60 minutes once started. Inside
the tab every request runs as the target user in the target's workspace —
except for a few paths, refused where every request is authenticated
(core.authentication.ImpersonationAuthentication): hiding buttons is not a
control.
"""

import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from .models import ImpersonationTicket

START_WITHIN = timedelta(minutes=10)
LASTS = timedelta(minutes=60)

ENDED_DETAIL = 'This session has ended — close this tab.'
REFUSED_DETAIL = 'Not available while you are inside as another user.'

# The person's own sign-in, security and screen format (password, username,
# two-factor, how dates and numbers read on their screens), the warmup bridge
# token, and every platform-admin API (which is also where account deletion
# lives).
REFUSED_PREFIXES = (
    '/api/auth/password/',
    '/api/auth/change-username/',
    '/api/auth/2fa/',
    '/api/auth/preferences/',
    '/api/auth/warmup-token/',
    '/api/platform/',
)


def hash_ticket(ticket):
    return hashlib.sha256(ticket.encode()).hexdigest()


def new_ticket():
    return secrets.token_urlsafe(32)


def is_refused(path):
    return any(path.startswith(prefix) for prefix in REFUSED_PREFIXES)


def _row(key_hash):
    return (ImpersonationTicket.objects.select_related('target', 'workspace', 'admin')
            .filter(key_hash=key_hash).first())


def lookup(ticket):
    """The ticket row a raw ticket may be used for right now, else None."""
    try:
        row = _row(hash_ticket(ticket))
    except (TypeError, ValueError):      # not a string
        return None
    if row is None or row.started_at is None or row.ended_at is not None:
        return None
    return row if timezone.now() < row.ends_at else None


def start(ticket, now=None):
    """Start a ticket: returns (row, None) or (None, (error_code, detail))."""
    try:
        row = _row(hash_ticket(ticket)) if isinstance(ticket, str) and ticket else None
    except (TypeError, ValueError):
        row = None
    if row is None:
        return None, ('bad_ticket', 'This link is not valid.')
    now = now or timezone.now()
    if row.started_at is not None:
        return None, ('ticket_used', 'This link was already used. Each link opens one session.')
    if now > row.created_at + START_WITHIN:
        return None, ('ticket_expired', 'This link has expired. Start again from the console.')
    row.started_at, row.ends_at = now, now + LASTS
    row.save(update_fields=['started_at', 'ends_at'])
    return row, None


def end(row, now=None):
    """End a ticket (idempotent)."""
    if row.ended_at is None:
        row.ended_at = now or timezone.now()
        ImpersonationTicket.objects.filter(pk=row.pk).update(ended_at=row.ended_at)


def touch(row, now=None):
    """Remember it was used — written at most once a minute."""
    now = now or timezone.now()
    if row.last_used_at is None or now - row.last_used_at >= timedelta(minutes=1):
        ImpersonationTicket.objects.filter(pk=row.pk).update(last_used_at=now)
        row.last_used_at = now


def info(row):
    """What /api/auth/me/ says about the session inside the tab. `name` is
    the person's own name for the bar on top of the tab — the profile itself
    carries no name, so without one it is the username."""
    target = row.target
    return {'admin': row.admin.username,
            'name': f'{target.first_name} {target.last_name}'.strip() or target.username,
            'workspace': {'id': row.workspace.pk, 'name': row.workspace.name, 'slug': row.workspace.slug},
            'started_at': row.started_at.isoformat(),
            'ends_at': row.ends_at.isoformat()}
