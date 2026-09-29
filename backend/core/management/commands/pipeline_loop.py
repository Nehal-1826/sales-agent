"""Long-running loop that executes pipeline cycles on the configured schedule.

    python manage.py pipeline_loop

Honors Settings → FREQUENT RUNS (enabled + frequency).  One cycle runs
synchronously; the process sleeps in short slices so frequency changes and
the enable/disable toggle take effect without a restart.
"""

import time

from django.core.management.base import BaseCommand

from core.models import AppSettings, PipelineRun
from core.pipeline import FREQUENCY_MINUTES, run_pipeline


class Command(BaseCommand):
    help = 'Run pipeline cycles automatically on the configured FREQUENT RUNS schedule.'

    def handle(self, *args, **options):
        self.stdout.write('Pipeline loop started (Ctrl+C to stop).')
        while True:
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
            time.sleep(30)
