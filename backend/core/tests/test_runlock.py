"""One pipeline cycle at a time — API, chat and worker share one lock."""
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import runlock
from core.models import AppSettings, PipelineRun, User
from core.pipeline import PipelineBusy, pipeline_status, run_pipeline, start_pipeline_async


def quiet_cycle():
    return [mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]),
            mock.patch('core.pipeline.gmaps_available', return_value=False),
            mock.patch('core.pipeline.apify_maps_available', return_value=False),
            mock.patch('core.pipeline.llm_available', return_value=False)]


class RunLockTests(TestCase):
    def test_second_acquire_fails_until_release(self):
        self.assertTrue(runlock.acquire_run_lock())
        self.assertFalse(runlock.acquire_run_lock())
        runlock.release_run_lock()
        self.assertTrue(runlock.acquire_run_lock())

    def test_stale_lock_is_reclaimed(self):
        s = AppSettings.load()
        s.pipeline_running_since = timezone.now() - timedelta(hours=2)
        s.save()
        self.assertTrue(runlock.acquire_run_lock())

    def test_run_pipeline_raises_when_busy(self):
        runlock.acquire_run_lock()
        with self.assertRaises(PipelineBusy):
            run_pipeline(triggered_by='test')

    def test_lock_released_and_started_at_is_cycle_start(self):
        patches = quiet_cycle()
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        before = timezone.now()
        run = run_pipeline(triggered_by='test')
        self.assertIsNone(runlock.running_since())
        run.refresh_from_db()
        self.assertGreaterEqual(run.started_at, before)
        self.assertLessEqual(run.started_at, run.finished_at)

    def test_lock_released_when_cycle_crashes(self):
        with mock.patch('core.pipeline._run_cycle', side_effect=RuntimeError('boom')):
            with self.assertRaises(RuntimeError):
                run_pipeline(triggered_by='test')
        self.assertIsNone(runlock.running_since())

    def test_stale_lock_is_not_reported_as_running(self):
        s = AppSettings.load()
        s.pipeline_running_since = timezone.now() - timedelta(hours=2)
        s.save()
        self.assertIsNone(runlock.running_since())
        self.assertFalse(pipeline_status()['cycleRunning'])

    def test_status_reports_cycle_running(self):
        self.assertFalse(pipeline_status()['cycleRunning'])
        runlock.acquire_run_lock()
        status = pipeline_status()
        self.assertTrue(status['cycleRunning'])
        self.assertIsNotNone(status['cycleStartedAt'])
        self.assertIn('autopilot', status)
        self.assertIn('workerOnline', status)

    def test_status_next_run_is_null_when_autopilot_off(self):
        s = AppSettings.load()
        s.runs_enabled = False
        s.save()
        PipelineRun.objects.create(triggered_by='test')
        status = pipeline_status()
        self.assertFalse(status['autopilot'])
        self.assertFalse(status['running'])  # legacy name mirrors autopilot
        self.assertIsNone(status['nextRunInMinutes'])
        self.assertEqual(status['lastRun']['draftsCreated'], 0)
        self.assertIn('finishedAt', status['lastRun'])


class StartAsyncTests(TestCase):
    def test_returns_false_when_busy(self):
        runlock.acquire_run_lock()
        with mock.patch('core.pipeline.threading.Thread') as thread:
            self.assertFalse(start_pipeline_async(triggered_by='test'))
        thread.assert_not_called()

    def test_takes_the_lock_and_starts_a_thread(self):
        with mock.patch('core.pipeline.threading.Thread') as thread:
            self.assertTrue(start_pipeline_async(triggered_by='test'))
        thread.return_value.start.assert_called_once()
        self.assertIsNotNone(runlock.running_since())  # held until the thread finishes

    def test_thread_target_releases_lock_and_closes_connection(self):
        with mock.patch('core.pipeline.threading.Thread') as thread:
            start_pipeline_async(triggered_by='test')
        target = thread.call_args.kwargs['target']
        with mock.patch('core.pipeline._run_cycle', side_effect=RuntimeError('boom')), \
                mock.patch('django.db.connection.close') as close, \
                self.assertLogs('core.pipeline', level='ERROR'):
            target()  # a crashing cycle must not escape the thread
        self.assertIsNone(runlock.running_since())
        close.assert_called_once()

    def test_lock_released_when_thread_cannot_start(self):
        with mock.patch('threading.Thread.start', side_effect=RuntimeError("can't start new thread")):
            with self.assertRaises(RuntimeError):
                start_pipeline_async(triggered_by='test')
        self.assertIsNone(runlock.running_since())  # not stranded until STALE_AFTER

    def test_thread_target_closes_connection_even_if_release_fails(self):
        with mock.patch('core.pipeline.threading.Thread') as thread:
            start_pipeline_async(triggered_by='test')
        target = thread.call_args.kwargs['target']
        with mock.patch('core.pipeline._run_cycle', return_value=None),                 mock.patch('core.pipeline.release_run_lock', side_effect=RuntimeError('db down')),                 mock.patch('django.db.connection.close') as close:
            with self.assertRaises(RuntimeError):
                target()
        close.assert_called_once()

    def test_failing_release_does_not_mask_the_cycle_error(self):
        with mock.patch('core.pipeline._run_cycle', side_effect=ValueError('cycle broke')),                 mock.patch('core.pipeline.release_run_lock', side_effect=RuntimeError('db down')),                 self.assertLogs('core.pipeline', level='ERROR'):
            with self.assertRaises(ValueError):  # the original, not the release error
                run_pipeline(triggered_by='test')


class RunEndpointTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')

    def test_busy_is_409(self):
        runlock.acquire_run_lock()
        self.assertEqual(self.client.post('/api/pipeline/run/', {}, format='json').status_code, 409)

    def test_starts_in_background(self):
        with mock.patch('core.views.start_pipeline_async', return_value=True) as start:
            resp = self.client.post('/api/pipeline/run/', {}, format='json')
        self.assertEqual(resp.status_code, 202)
        self.assertTrue(resp.json()['started'])
        self.assertIn('cycleRunning', resp.json()['status'])
        start.assert_called_once()

    def test_wait_runs_synchronously(self):
        patches = quiet_cycle()
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        resp = self.client.post('/api/pipeline/run/?wait=1', {}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(runlock.running_since())

    def test_wait_busy_is_409(self):
        runlock.acquire_run_lock()
        resp = self.client.post('/api/pipeline/run/?wait=1', {}, format='json')
        self.assertEqual(resp.status_code, 409)


class SettingsSaveKeepsLockTests(TestCase):
    def test_settings_put_does_not_clobber_a_live_run_lock(self):
        user = User.objects.create_user(username='o2', password='pass12345', role='owner')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        stale = AppSettings.load()  # the view loaded this BEFORE the cycle took the lock
        self.assertTrue(runlock.acquire_run_lock())
        with mock.patch.object(AppSettings, 'load', return_value=stale):
            resp = client.put('/api/settings/', {'company': {'name': 'Renamed Co'}}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(AppSettings.objects.get(pk=1).company_name, 'Renamed Co')
        self.assertIsNotNone(runlock.running_since())  # the cycle still holds it


class ChatActionTests(TestCase):
    def test_run_pipeline_action_starts_background_cycle(self):
        from core import actions
        with mock.patch('core.pipeline.start_pipeline_async', return_value=True) as start:
            reply = actions.execute({'action': 'run_pipeline'}, username='ann')
        start.assert_called_once_with('chat:ann')
        self.assertIn('background', reply)

    def test_run_pipeline_action_reports_busy(self):
        from core import actions
        with mock.patch('core.pipeline.start_pipeline_async', return_value=False):
            reply = actions.execute({'action': 'run_pipeline'}, username='ann')
        self.assertIn('already running', reply)


class StaleHolderReleaseTests(TestCase):
    def test_late_release_by_first_holder_keeps_second_lock(self):
        first = runlock.acquire_run_lock()
        self.assertTrue(first)
        AppSettings.objects.filter(pk=1).update(
            pipeline_running_since=timezone.now() - timedelta(hours=2))
        second = runlock.acquire_run_lock()  # stale lock taken over
        self.assertTrue(second)
        runlock.release_run_lock(first)  # the slow first cycle finally ends
        self.assertEqual(runlock.running_since(), second)
        self.assertFalse(runlock.acquire_run_lock())  # no third cycle alongside
        runlock.release_run_lock(second)
        self.assertIsNone(runlock.running_since())

    def test_forced_release_still_clears(self):
        runlock.acquire_run_lock()
        runlock.release_run_lock()
        self.assertIsNone(runlock.running_since())
