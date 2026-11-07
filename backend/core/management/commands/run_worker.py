"""The always-on agent worker — runs the pipeline on schedule + the daily report.

    python manage.py run_worker

This is the container command on the VPS (and can be used locally instead of
`pipeline_loop` + the dev-server report thread). It combines:

  1. Pipeline cycles — for EACH active workspace, honors its Settings → FREQUENT
     RUNS (enabled + frequency), one orchestrator cycle (Search → Profile → Copywright → Responder) when due.
  2. Daily report thread — sends the 8 PM IST lead report (core.scheduler).
  3. Outbox thread — every ~30 s, per workspace, sends due queued cold
     email (core.outbox: caps, sending window, rotation, auto-pause).
  3b. Inbox thread — every ~3 min, per workspace, reads replies + bounces
     from each mailbox over IMAP (core.inbox, read-only; never auto-answers).
  4. Liveness heartbeats — a thread beats('worker') every 30 s (even while a
     cycle is mid-run) so GET /api/health/ can prove the worker is alive. The
     report thread beats as 'report'.

A cycle holds the shared run lock (core.runlock): if the API or chat already
started one, the worker skips quietly; after a failed cycle it waits before
retrying so a broken API key doesn't get hammered every 30 s.
"""

import threading
import time

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from core.health import beat
from core.models import AppSettings, PipelineRun, Workspace
from core.inbox import POLL_EVERY, poll_all_workspaces
from core.outbox import drain_all_workspaces
from core.pipeline import FREQUENCY_MINUTES, PipelineBusy, run_pipeline
from core.scheduler import start_report_scheduler
from core.tenancy import workspace_context

RETRY_BACKOFF_MAX = 900  # seconds — longest wait after a failed cycle


def _heartbeat_forever():
    while True:
        try:
            close_old_connections()  # long-lived thread — drop a dead DB connection
            beat('worker')
        except Exception:
            pass  # never let the thread die — the next beat retries
        time.sleep(30)


def _drain_forever():
    """Outbox thread: a pipeline cycle can run for many minutes, so sending
    must not wait behind it.  Each workspace drains in its own context."""
    while True:
        try:
            close_old_connections()
            drain_all_workspaces()
        except Exception:
            pass  # drain_all_workspaces logs per tenant; never let the thread die
        try:  # follow-up sequences: materialize due steps (core.sequences)
            from core.sequences import tick_all_workspaces
            tick_all_workspaces()
        except Exception:
            pass
        try:  # approved WhatsApp messages via the opt-in sidecar (core.whatsapp)
            from core.whatsapp import drain_all_workspaces as drain_whatsapp_all
            drain_whatsapp_all()
        except Exception:
            pass
        time.sleep(30)


def _inbox_forever():
    """Inbox thread: IMAP can be slow — never block the pipeline or sending."""
    while True:
        try:
            close_old_connections()
            poll_all_workspaces()
        except Exception:
            pass  # poll_all_workspaces logs per tenant; never let the thread die
        time.sleep(POLL_EVERY)


class Command(BaseCommand):
    help = ('Agent worker: pipeline cycles on the FREQUENT RUNS schedule, the '
            'daily 8 PM IST report thread, and /api/health/ heartbeats.')

    def handle(self, *args, **options):
        self.stdout.write('Agent worker started — pipeline scheduler + daily report thread.')
        start_report_scheduler()  # beats as 'report' from its own thread
        threading.Thread(target=_heartbeat_forever, name='worker-heartbeat',
                         daemon=True).start()
        threading.Thread(target=_drain_forever, name='worker-outbox', daemon=True).start()
        threading.Thread(target=_inbox_forever, name='worker-inbox', daemon=True).start()

        # failure backoff is tracked per workspace: one tenant's broken API key
        # must never delay another tenant's cycle
        last_failure = {}
        while True:
            # drop a dead/stale DB connection (e.g. after a DB restart) so the
            # loop recovers — otherwise it would stay wedged while the separate
            # heartbeat thread kept reporting the worker as online
            close_old_connections()
            try:
                workspaces = list(Workspace.all_tenants.filter(is_active=True).order_by('id'))
            except Exception as exc:
                self.stderr.write(f'Worker loop error: {exc}')
                workspaces = []
            for ws in workspaces:
                try:
                    with workspace_context(ws):
                        self._tick_workspace(ws, last_failure)
                except Exception as exc:
                    # one tenant's error is logged and the others still run
                    self.stderr.write(f'Worker loop error [{ws.slug}]: {exc}')
            time.sleep(30)

    def _tick_workspace(self, ws, last_failure):
        settings = AppSettings.load()
        if not settings.runs_enabled:
            return
        last = PipelineRun.objects.first()
        interval = FREQUENCY_MINUTES.get(settings.run_frequency, 60) * 60
        # measure from the run's END: started_at is the real cycle start,
        # so a cycle longer than the interval would otherwise be "due"
        # the instant it finishes (back-to-back scraping, no gap)
        anchor = (last.finished_at or last.created_at) if last else None
        elapsed = (time.time() - anchor.timestamp()) if anchor else interval
        # a failed cycle writes no PipelineRun, so without this wait
        # it would count as "due" again on the very next 30 s tick
        cooled_down = time.time() - last_failure.get(ws.pk, 0.0) >= min(interval, RETRY_BACKOFF_MAX)
        if elapsed < interval or not cooled_down:
            return
        self.stdout.write(f'[{ws.slug}] Cycle due — running pipeline…')
        try:
            run = run_pipeline(triggered_by='scheduler')
            self.stdout.write(self.style.SUCCESS(
                f'[{ws.slug}] Run #{run.id}: {run.leads_created} lead(s), '
                f'{run.potentials_created} potential(s), '
                f'{run.summary.get("drafts_created", 0)} draft(s)'))
        except PipelineBusy:
            pass  # the API or chat is already running one — next tick
        except Exception as exc:
            last_failure[ws.pk] = time.time()
            self.stderr.write(f'Pipeline cycle failed [{ws.slug}]: {exc}')
