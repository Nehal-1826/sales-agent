"""Single-cycle lock — the API's Run button, chat "run a cycle" and the
worker's schedule all share it, so two cycles never scrape, enrich (paid
credits) or draft at the same time.

Stored on the workspace's AppSettings row (one lock per tenant, so one
company's cycle never blocks another's): a conditional UPDATE is atomic on both
SQLite and PostgreSQL, so no extra infrastructure is needed.  A lock older
than STALE_AFTER belongs to a crashed process and may be taken over."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import AppSettings
from .tenancy import current_workspace

STALE_AFTER = timedelta(minutes=45)


def acquire_run_lock():
    """Take the lock.  Returns the timestamp written (the holder's token for
    release_run_lock) or None when another cycle holds it."""
    AppSettings.load()  # make sure this workspace's row exists
    now = timezone.now()
    taken = (AppSettings.objects.filter(workspace=current_workspace())
             .filter(Q(pipeline_running_since__isnull=True)
                     | Q(pipeline_running_since__lt=now - STALE_AFTER))
             .update(pipeline_running_since=now))
    return now if taken == 1 else None


def release_run_lock(token=None):
    """Release the lock.  With a token (from acquire_run_lock) only clears it
    while it is still OURS — a cycle that outlived STALE_AFTER must not wipe the
    lock a newer cycle legitimately took.  No token = forced release."""
    qs = AppSettings.objects.filter(workspace=current_workspace())
    if token is not None:
        qs = qs.filter(pipeline_running_since=token)
    qs.update(pipeline_running_since=None)


def running_since():
    since = AppSettings.objects.filter(workspace=current_workspace()).values_list('pipeline_running_since', flat=True).first()
    if since and since < timezone.now() - STALE_AFTER:
        return None
    return since
