"""The always-on agent worker — runs the pipeline on schedule + the daily report.

    python manage.py run_worker

This is the container command on the VPS (and can be used locally instead of
`pipeline_loop` + the dev-server report thread). It combines:

  1. Pipeline cycles — honors Settings → FREQUENT RUNS (enabled + frequency),
     one orchestrator cycle (Search → Profile → Copywright → Responder) when due.
  2. Daily report thread — sends the 8 PM IST lead report (core.scheduler).
  3. Liveness heartbeats — beats('worker') every iteration so GET /api/health/
     can prove the worker is alive. The report thread beats as 'report'.
"""

import threading
import time

from django.core.management.base import BaseCommand

from core.health import beat
from core.models import AppSettings, PipelineRun
from core.pipeline import FREQUENCY_MINUTES, run_pipeline
from core.scheduler import start_report_scheduler


class Command(BaseCommand):
    help = ('Agent worker: pipeline cycles on the FREQUENT RUNS schedule, the '
            'daily 8 PM IST report thread, and /api/health/ heartbeats.')

    def handle(self, *args, **options):
        self.stdout.write('Agent worker started — pipeline scheduler + daily report thread.')
        start_report_scheduler()  # beats as 'report' from its own thread

        while True:
            beat('worker')
            try:
                settings = AppSettings.load()
                if settings.runs_enabled:
                    last = PipelineRun.objects.first()
                    interval = FREQUENCY_MINUTES.get(settings.run_frequency, 60) * 60
                    elapsed = (time.time() - last.started_at.timestamp()) if last else interval
                    if elapsed >= interval:
                        self.stdout.write('Cycle due — running pipeline…')
                        try:
                            run = run_pipeline(triggered_by='scheduler')
                            self.stdout.write(self.style.SUCCESS(
                                f'Run #{run.id}: {run.leads_created} lead(s), '
                                f'{run.potentials_created} potential(s), '
                                f'{run.summary.get("drafts_created", 0)} draft(s)'))
                        except Exception as exc:
                            self.stderr.write(f'Pipeline cycle failed: {exc}')
            except Exception as exc:
                self.stderr.write(f'Worker loop error: {exc}')
            time.sleep(30)
