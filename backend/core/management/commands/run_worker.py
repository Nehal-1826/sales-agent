"""The always-on agent worker — runs the pipeline on schedule + the daily report.

    python manage.py run_worker

This is the container command on the VPS (and can be used locally instead of
`pipeline_loop` + the dev-server report thread). It combines:

  1. Pipeline cycles — honors Settings → FREQUENT RUNS (enabled + frequency),
     one orchestrator cycle (Search → Profile → Copywright → Responder) when due.
  2. Daily report thread — sends the 8 PM IST lead report (core.scheduler).
  3. Liveness heartbeats — a thread beats('worker') every 30 s (even while a
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
from core.models import AppSettings, PipelineRun
from core.pipeline import FREQUENCY_MINUTES, PipelineBusy, run_pipeline
from core.scheduler import start_report_scheduler

RETRY_BACKOFF_MAX = 900  # seconds — longest wait after a failed cycle


def _heartbeat_forever():
    while True:
        try:
            close_old_connections()  # long-lived thread — drop a dead DB connection
            beat('worker')
        except Exception:
            pass  # never let the thread die — the next beat retries
        time.sleep(30)


class Command(BaseCommand):
    help = ('Agent worker: pipeline cycles on the FREQUENT RUNS schedule, the '
            'daily 8 PM IST report thread, and /api/health/ heartbeats.')

    def handle(self, *args, **options):
        self.stdout.write('Agent worker started — pipeline scheduler + daily report thread.')
        start_report_scheduler()  # beats as 'report' from its own thread
        threading.Thread(target=_heartbeat_forever, name='worker-heartbeat',
                         daemon=True).start()

        last_failure = 0.0
        while True:
            # drop a dead/stale DB connection (e.g. after a DB restart) so the
            # loop recovers — otherwise it would stay wedged while the separate
            # heartbeat thread kept reporting the worker as online
            close_old_connections()
            try:
                settings = AppSettings.load()
                if settings.runs_enabled:
                    last = PipelineRun.objects.first()
                    interval = FREQUENCY_MINUTES.get(settings.run_frequency, 60) * 60
                    # measure from the run's END: started_at is the real cycle start,
                    # so a cycle longer than the interval would otherwise be "due"
                    # the instant it finishes (back-to-back scraping, no gap)
                    anchor = (last.finished_at or last.created_at) if last else None
                    elapsed = (time.time() - anchor.timestamp()) if anchor else interval
                    # a failed cycle writes no PipelineRun, so without this wait
                    # it would count as "due" again on the very next 30 s tick
                    cooled_down = time.time() - last_failure >= min(interval, RETRY_BACKOFF_MAX)
                    if elapsed >= interval and cooled_down:
                        self.stdout.write('Cycle due — running pipeline…')
                        try:
                            run = run_pipeline(triggered_by='scheduler')
                            self.stdout.write(self.style.SUCCESS(
                                f'Run #{run.id}: {run.leads_created} lead(s), '
                                f'{run.potentials_created} potential(s), '
                                f'{run.summary.get("drafts_created", 0)} draft(s)'))
                        except PipelineBusy:
                            pass  # the API or chat is already running one — next tick
                        except Exception as exc:
                            last_failure = time.time()
                            self.stderr.write(f'Pipeline cycle failed: {exc}')
            except Exception as exc:
                self.stderr.write(f'Worker loop error: {exc}')
            time.sleep(30)
