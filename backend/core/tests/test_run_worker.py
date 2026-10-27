"""run_worker — scheduler loop backoff / busy handling and the heartbeat thread."""
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.management.commands import run_worker
from core.pipeline import PipelineBusy

MODULE = 'core.management.commands.run_worker'


class StopLoop(Exception):
    """Raised by the patched time.sleep to break out of the endless loops."""


def stop_after(n):
    """A time.sleep stand-in: returns for the first n-1 calls, raises StopLoop on the nth."""
    calls = {'n': 0}

    def fake_sleep(_seconds):
        calls['n'] += 1
        if calls['n'] >= n:
            raise StopLoop()
    return fake_sleep


class WorkerLoopTests(TestCase):
    """Drives Command.handle for a bounded number of 30 s ticks."""

    def run_ticks(self, ticks, run_pipeline):
        out, err = StringIO(), StringIO()
        # close_old_connections would close the test transaction's connection;
        # patched so the loop can be asserted to call it once per tick
        with mock.patch(f'{MODULE}.start_report_scheduler'), \
                mock.patch(f'{MODULE}._heartbeat_forever'), \
                mock.patch(f'{MODULE}.close_old_connections') as close_old, \
                mock.patch(f'{MODULE}.run_pipeline', run_pipeline), \
                mock.patch(f'{MODULE}.time.sleep', side_effect=stop_after(ticks)):
            with self.assertRaises(StopLoop):
                call_command('run_worker', stdout=out, stderr=err)
        return out.getvalue(), err.getvalue(), close_old

    def test_failed_cycle_backs_off_instead_of_retrying_next_tick(self):
        run_pipeline = mock.Mock(side_effect=RuntimeError('bad api key'))
        _, err, _ = self.run_ticks(2, run_pipeline)
        # tick 1 ran (and failed); tick 2 is still inside the retry backoff
        self.assertEqual(run_pipeline.call_count, 1)
        self.assertIn('Pipeline cycle failed: bad api key', err)

    def test_busy_cycle_is_skipped_quietly_and_retried_next_tick(self):
        run_pipeline = mock.Mock(side_effect=PipelineBusy('already running'))
        out, err, _ = self.run_ticks(2, run_pipeline)
        self.assertEqual(err, '')  # not reported as an error
        self.assertEqual(run_pipeline.call_count, 2)  # no backoff — the lock may free up

    def test_loop_drops_stale_db_connections_every_tick(self):
        run_pipeline = mock.Mock(side_effect=PipelineBusy('already running'))
        _, _, close_old = self.run_ticks(3, run_pipeline)
        self.assertEqual(close_old.call_count, 3)

    def _last_run(self, started_ago, finished_ago):
        from datetime import timedelta
        from django.utils import timezone
        from core.models import PipelineRun
        run = PipelineRun.objects.create()
        now = timezone.now()
        PipelineRun.objects.filter(pk=run.pk).update(
            started_at=now - timedelta(minutes=started_ago),
            finished_at=now - timedelta(minutes=finished_ago))

    def test_long_cycle_is_not_due_the_moment_it_ends(self):
        # started 3 h ago (interval 60 min) but only finished 1 min ago
        self._last_run(started_ago=180, finished_ago=1)
        run_pipeline = mock.Mock()
        self.run_ticks(2, run_pipeline)
        run_pipeline.assert_not_called()

    def test_cycle_is_due_once_the_interval_passed_since_it_ended(self):
        self._last_run(started_ago=300, finished_ago=120)
        run_pipeline = mock.Mock(side_effect=PipelineBusy('x'))
        self.run_ticks(1, run_pipeline)
        self.assertEqual(run_pipeline.call_count, 1)

    def test_idle_worker_does_not_run_a_cycle_when_autopilot_is_off(self):
        from core.models import AppSettings
        s = AppSettings.load()
        s.runs_enabled = False
        s.save()
        run_pipeline = mock.Mock()
        self.run_ticks(2, run_pipeline)
        run_pipeline.assert_not_called()


class HeartbeatThreadTests(TestCase):
    def test_heartbeat_thread_survives_errors(self):
        with mock.patch(f'{MODULE}.close_old_connections'), \
                mock.patch(f'{MODULE}.beat', side_effect=RuntimeError('db down')) as beat, \
                mock.patch(f'{MODULE}.time.sleep', side_effect=[None, StopLoop()]):
            with self.assertRaises(StopLoop):  # only the sleep stand-in ends it
                run_worker._heartbeat_forever()
        self.assertEqual(beat.call_count, 2)  # kept beating after the first failure

    def test_heartbeat_thread_survives_close_old_connections_failure(self):
        with mock.patch(f'{MODULE}.close_old_connections', side_effect=RuntimeError('boom')), \
                mock.patch(f'{MODULE}.beat') as beat, \
                mock.patch(f'{MODULE}.time.sleep', side_effect=StopLoop()):
            with self.assertRaises(StopLoop):
                run_worker._heartbeat_forever()
        beat.assert_not_called()
