"""Single-cycle lock — the API's Run button, chat "run a cycle" and the
worker's schedule all share it, so two cycles never scrape, enrich (paid
credits) or draft at the same time.

Stored on the workspace's AppSettings row (one lock per tenant, so one
company's cycle never blocks another's): a conditional UPDATE is atomic on both
SQLite and PostgreSQL, so no extra infrastructure is needed.  A lock older
than STALE_AFTER belongs to a crashed process and may be taken over."""

import threading
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import AppSettings
from .tenancy import current_workspace

STALE_AFTER = timedelta(minutes=45)

# heartbeat_run_lock() moves the stored timestamp forward, so the value in the
# DB drifts away from the token the holder got from acquire_run_lock().  This
# maps the ORIGINAL token → the latest value we wrote, per workspace, so
# release / later heartbeats still match only our own lock.
_latest = {}
_latest_guard = threading.Lock()


def _key(token):
    ws = current_workspace()
    return (getattr(ws, 'pk', None), token)


def _current_value(token):
    with _latest_guard:
        return _latest.get(_key(token), token)


def acquire_run_lock():
    """Take the lock.  Returns the timestamp written (the holder's token for
    release_run_lock) or None when another cycle holds it."""
    AppSettings.load()  # make sure this workspace's row exists
    now = timezone.now()
    taken = (AppSettings.objects.filter(workspace=current_workspace())
             .filter(Q(pipeline_running_since__isnull=True)
                     | Q(pipeline_running_since__lt=now - STALE_AFTER))
             .update(pipeline_running_since=now))
    if taken != 1:
        return None
    with _latest_guard:
        _latest[_key(now)] = now
    return now


def heartbeat_run_lock(token):
    """Refresh the lock's timestamp so a long cycle never looks stale.  A
    conditional UPDATE keyed on the value WE last wrote: only the owner can
    refresh, and a lock someone else took over (after a real stall) is left
    alone.  Returns True while we still own the lock."""
    if token is None:
        return False
    current = _current_value(token)
    now = timezone.now()
    if now <= current:
        return True  # same tick — nothing to move forward
    moved = (AppSettings.objects.filter(workspace=current_workspace())
             .filter(pipeline_running_since=current)
             .update(pipeline_running_since=now))
    if moved == 1:
        with _latest_guard:
            _latest[_key(token)] = now
        return True
    return False


def release_run_lock(token=None):
    """Release the lock.  With a token (from acquire_run_lock) only clears it
    while it is still OURS — a cycle that outlived STALE_AFTER must not wipe the
    lock a newer cycle legitimately took.  No token = forced release."""
    qs = AppSettings.objects.filter(workspace=current_workspace())
    if token is not None:
        qs = qs.filter(pipeline_running_since=_current_value(token))
        with _latest_guard:
            _latest.pop(_key(token), None)
    qs.update(pipeline_running_since=None)


def running_since():
    since = AppSettings.objects.filter(workspace=current_workspace()).values_list('pipeline_running_since', flat=True).first()
    if since and since < timezone.now() - STALE_AFTER:
        return None
    return since
