"""When every search engine is rate-limiting us, the person is told so — and
roughly when the engines open up again — instead of just seeing "0 leads".

A rate-limited engine is parked for a minute after its first failure, doubling
each time to a 30-minute cap (core.search_backends). The owner asked for the
app to mention that wait, with its approximate timing."""

import time
from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase
from django.utils import timezone

from core import search_backends
from core.models import PipelineRun
from core.pipeline import pipeline_status, run_pipeline
from core.reports import build_daily_report
from core.tests.base import TenantTestCase
from core.tests.test_discovery_hardening import FakeDDGS, _row
from core.tests.test_pipeline_icp import fake_audit

ENGINES = search_backends.BACKENDS


class PauseTests(SimpleTestCase):
    """search_backends.pause(): how long the pool is still parked."""

    def setUp(self):
        search_backends.reset_health()

    def test_it_names_the_engines_still_parked_and_the_longest_wait_left(self):
        with mock.patch('core.search_backends.random.uniform', return_value=1.0):
            search_backends.mark_failure('bing', now=1000)        # 60 s
            search_backends.mark_failure('brave', now=1000)
            search_backends.mark_failure('brave', now=1000)       # 120 s
            search_backends.mark_failure('mojeek', now=1000)
            search_backends.mark_success('mojeek')                # answered again: not parked
        self.assertEqual(search_backends.pause(now=1010), (2, 110))
        self.assertEqual(search_backends.pause(now=1119), (1, 1))
        self.assertEqual(search_backends.pause(now=1121), (0, 0))

    def test_a_healthy_pool_has_no_pause(self):
        self.assertEqual(search_backends.pause(now=1000), (0, 0))

    def test_the_wait_is_said_in_whole_minutes(self):
        self.assertEqual(search_backends.wait_phrase(1800), 'in about 30 minutes')
        self.assertEqual(search_backends.wait_phrase(61), 'in about 2 minutes')
        self.assertEqual(search_backends.wait_phrase(60), 'in about a minute')
        self.assertEqual(search_backends.wait_phrase(59), 'in about a minute')   # never promised too early
        self.assertEqual(search_backends.wait_phrase(0), 'any moment now')
        self.assertEqual(search_backends.minutes_left(1799), 30)
        self.assertEqual(search_backends.minutes_left(1), 1)
        self.assertEqual(search_backends.minutes_left(-1), 0)


def cycle_patches():
    """Every network touchpoint faked EXCEPT the web search, which goes
    through the real engine rotation against FakeDDGS."""
    return [
        mock.patch('ddgs.DDGS', FakeDDGS),
        mock.patch.object(search_backends, '_sleep', lambda s: None),
        mock.patch('core.pipeline.analyze_website', side_effect=fake_audit),
        mock.patch('core.pipeline.discover_no_website_places', return_value=[]),
        mock.patch('core.pipeline.discover_places_with_website', return_value=[]),
        mock.patch('core.pipeline.enrich_leads_via_gmaps', return_value=[]),
        mock.patch('core.pipeline.gmaps_available', return_value=False),
        mock.patch('core.pipeline.llm_available', return_value=False),
        mock.patch('core.pipeline.scalelist_phone_find', return_value=''),
        mock.patch('core.pipeline.apollo_enrich_domain', return_value={}),
        mock.patch('core.pipeline.apify_maps_available', return_value=False),
        mock.patch('core.pipeline.time.sleep', lambda *_: None),
        mock.patch('core.search_backends.random.uniform', return_value=1.0),
    ]


class SearchPausedTests(TenantTestCase):
    def setUp(self):
        self.lead_ready()
        search_backends.reset_health()
        search_backends.reset_cycle_stats()
        FakeDDGS.plan = {}
        FakeDDGS.calls = []

    def _cycle(self):
        patches = cycle_patches()
        for p in patches:
            p.start()
        try:
            return run_pipeline(triggered_by='test')
        finally:
            for p in reversed(patches):
                p.stop()
            search_backends.reset_health()

    def _park_every_engine(self, failures):
        """6 failures in a row = the 30-minute cap."""
        with mock.patch('core.search_backends.random.uniform', return_value=1.0):
            for backend in ENGINES:
                for _ in range(failures):
                    search_backends.mark_failure(backend, now=time.time())

    def test_a_fully_rate_limited_search_says_so_and_when_it_opens_up(self):
        self._park_every_engine(failures=6)
        run = self._cycle()
        self.assertEqual(run.leads_created, 0)
        notes = run.summary['notes']
        # the plain explanation leads the run's notes, ahead of the technical lines
        self.assertTrue(notes[0].startswith('Search paused:'), notes[0])
        self.assertIn('rate-limiting us', notes[0])
        self.assertIn(f'{len(ENGINES)} of {len(ENGINES)} resting', notes[0])
        self.assertIn('in about 30 minutes', notes[0])
        paused = run.summary['searchPaused']
        self.assertEqual(paused['engines'], len(ENGINES))
        left = (timezone.datetime.fromisoformat(paused['until']) - timezone.now()).total_seconds()
        self.assertGreater(left, 29 * 60)
        self.assertLessEqual(left, 30 * 60)

    def test_the_live_status_carries_the_wait_while_it_lasts(self):
        self._park_every_engine(failures=6)
        run = self._cycle()
        cooldown = pipeline_status()['searchCooldown']
        self.assertEqual(cooldown['inMinutes'], 30)
        self.assertEqual(cooldown['until'], run.summary['searchPaused']['until'])

    def test_the_wait_ends_by_itself(self):
        self._park_every_engine(failures=6)
        run = self._cycle()
        over = (timezone.now() - timedelta(seconds=1)).isoformat()
        PipelineRun.objects.filter(pk=run.pk).update(
            summary={**run.summary, 'searchPaused': {**run.summary['searchPaused'], 'until': over}})
        self.assertIsNone(pipeline_status()['searchCooldown'])

    def test_a_search_that_worked_has_no_pause(self):
        FakeDDGS.plan = {b: [_row('https://www.smiledental.in/', 'Smile Dental Clinic | Home')]
                         for b in ENGINES}
        run = self._cycle()
        self.assertNotIn('searchPaused', run.summary)
        self.assertFalse(any(n.startswith('Search paused') for n in run.summary['notes']))
        self.assertIsNone(pipeline_status()['searchCooldown'])

    def test_a_partly_rate_limited_search_is_not_called_paused(self):
        """Some engines resting, others answering: the search worked."""
        for i, backend in enumerate(ENGINES):
            FakeDDGS.plan[backend] = (RuntimeError('429 Too Many Requests') if i % 2
                                      else [_row('https://www.smiledental.in/', 'Smile Dental Clinic | Home')])
        run = self._cycle()
        self.assertGreater(run.summary['discovery']['sources'].get('duckduckgo', 0)
                           + run.summary['discovery']['sources'].get('brave', 0), 0)
        self.assertNotIn('searchPaused', run.summary)

    def test_runs_recorded_before_this_change_have_no_wait(self):
        PipelineRun.objects.create(triggered_by='manual', leads_created=0,
                                   summary={'notes': ['Search sources: none answered query(s)']})
        self.assertIsNone(pipeline_status()['searchCooldown'])

    def test_the_evening_report_marks_a_paused_run(self):
        self._park_every_engine(failures=6)
        run = self._cycle()
        _, body = build_daily_report()
        self.assertRegex(body, rf'Run #{run.id} \(test\): 0 lead\(s\), 0 potential\(s\) — search paused'
                         r' \(search engines were rate-limiting us\)')


class OlderRunTests(TenantTestCase):
    def test_the_wait_counts_down_between_two_looks(self):
        """`inMinutes` is computed when the person looks, not when the cycle ended."""
        self.lead_ready()
        until = timezone.now() + timedelta(minutes=12, seconds=30)
        PipelineRun.objects.create(
            triggered_by='scheduler', leads_created=0,
            summary={'notes': [], 'searchPaused': {'until': until.isoformat(), 'engines': 8}})
        self.assertEqual(pipeline_status()['searchCooldown']['inMinutes'], 13)
