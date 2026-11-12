"""Long-running loop that executes pipeline cycles on the configured schedule.

    python manage.py pipeline_loop

Honors each active workspace's Settings → FREQUENT RUNS (enabled + frequency).
One cycle runs synchronously; the process sleeps in short slices so frequency
changes and the enable/disable toggle take effect without a restart.
"""

import time

from django.core.management.base import BaseCommand

from core.models import AppSettings, PipelineRun, Workspace
from core.pipeline import FREQUENCY_MINUTES, PipelineBusy, run_pipeline
from core.tenancy import workspace_context


class Command(BaseCommand):
    help = 'Run pipeline cycles automatically on each workspace\'s FREQUENT RUNS schedule.'

    def handle(self, *args, **options):
        self.stdout.write('Pipeline loop started (Ctrl+C to stop).')
        while True:
            for ws in Workspace.all_tenants.filter(is_active=True).order_by('id'):
                try:
                    with workspace_context(ws):
                        self._tick_workspace(ws)
                except Exception as exc:
                    # one tenant failing must not stop the others or the loop
                    self.stderr.write(f'Pipeline cycle failed [{ws.slug}]: {exc}')
            time.sleep(30)

    def _tick_workspace(self, ws):
        from billing.entitlements import BillingError
        from core.pipeline import check_run_quota
        try:
            check_run_quota()
        except BillingError:
            return  # unpaid, runs/day or lead quota reached: skip quietly
        settings = AppSettings.load()
        if not settings.runs_enabled:
            return
        last = PipelineRun.objects.first()
        interval = FREQUENCY_MINUTES.get(settings.run_frequency, 60) * 60
        elapsed = (time.time() - last.started_at.timestamp()) if last else interval
        if elapsed < interval:
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
