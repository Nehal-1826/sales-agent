"""Free discovery hardening: multi-engine search with health tracking, query
expansion + adaptive widening, run-lock heartbeat + cycle budget, and stale
lead re-profiling.  ddgs is fully mocked — no network."""
from datetime import timedelta
from unittest import mock

from django.test import SimpleTestCase
from django.utils import timezone

from core import discovery, runlock, search_backends
from core.models import AppSettings, EmailDraft, Lead
from core.pipeline import reprofile_candidates, run_pipeline
from core.scraper import _serp_companies, search_companies
from core.tests.base import TenantTestCase


def _row(url, title='Acme Plumbing | Home'):
    return {'href': url, 'title': title, 'body': 'local plumber'}


class FakeDDGS:
    """Stands in for ddgs.DDGS: `plan` maps backend → list | Exception."""
    plan = {}
    calls = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def text(self, query, max_results=10, backend='auto'):
        FakeDDGS.calls.append(backend)
        outcome = FakeDDGS.plan.get(backend, [])
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class EngineRotationTests(SimpleTestCase):
    def setUp(self):
        search_backends.reset_health()
        search_backends.reset_cycle_stats()
        FakeDDGS.calls = []
        patches = [mock.patch('ddgs.DDGS', FakeDDGS),
                   mock.patch.object(search_backends, '_sleep', lambda s: None)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_ratelimit_falls_through_to_next_engine(self):
        from ddgs.exceptions import RatelimitException
        FakeDDGS.plan = {'duckduckgo': RatelimitException('202 Ratelimit'),
                         'brave': [_row('https://www.acmeplumbing.com/')]}
        results, backend = search_companies('plumber in Salem', n=10, with_source=True)
        self.assertEqual(backend, 'brave')
        self.assertEqual(results[0]['website'], 'acmeplumbing.com')
        self.assertEqual(results[0]['source'], 'brave')
        self.assertEqual(FakeDDGS.calls[:2], ['duckduckgo', 'brave'])
        self.assertIn('duckduckgo', search_backends.cooling_down())
        stats = search_backends.cycle_stats()
        self.assertEqual(stats['brave'], 1)
        self.assertEqual(stats['duckduckgo:fail'], 1)

    def test_empty_page_counts_as_a_miss(self):
        FakeDDGS.plan = {'duckduckgo': [], 'brave': [], 'mojeek': [_row('https://acme.in/')]}
        results, backend = search_companies('x in y', with_source=True)
        self.assertEqual(backend, 'mojeek')
        self.assertEqual(len(results), 1)

    def test_all_engines_fail_returns_empty_not_error(self):
        FakeDDGS.plan = {b: RuntimeError('down') for b in search_backends.BACKENDS}
        self.assertEqual(search_companies('x in y'), [])
        # bounded: one query never tries more than max_engines engines
        self.assertEqual(len(FakeDDGS.calls), 4)
        self.assertEqual(search_backends.cycle_stats()['exhausted'], 1)

    def test_cooldown_is_exponential_and_expires(self):
        with mock.patch('core.search_backends.random.uniform', return_value=1.0):
            search_backends.mark_failure('bing', now=1000)
            first = search_backends._health['bing']['until'] - 1000
            search_backends.mark_failure('bing', now=1000)
            second = search_backends._health['bing']['until'] - 1000
        self.assertEqual(first, search_backends.COOLDOWN_BASE)
        self.assertEqual(second, 2 * search_backends.COOLDOWN_BASE)
        self.assertNotIn('bing', search_backends._healthy_order(1001))
        self.assertIn('bing', search_backends._healthy_order(1000 + second + 1))
        search_backends.mark_success('bing')
        self.assertEqual(search_backends._health['bing']['fails'], 0)

    def test_cooldown_is_capped(self):
        for _ in range(30):
            search_backends.mark_failure('google', now=0)
        self.assertLessEqual(search_backends._health['google']['until'],
                             search_backends.COOLDOWN_MAX * 1.2)

    def test_rotation_spreads_the_first_engine(self):
        firsts = {search_backends._healthy_order(0)[0] for _ in range(len(search_backends.BACKENDS))}
        self.assertEqual(firsts, set(search_backends.BACKENDS))


class DedupeTests(SimpleTestCase):
    def test_registrable_domain_dedupe(self):
        rows = [_row('https://www.acme.co.uk/'), _row('https://shop.acme.co.uk/'),
                _row('https://acme.co.uk/about'), _row('https://other.com/', 'Other Ltd')]
        out = _serp_companies(rows, 'plumber in Leeds', 10)
        self.assertEqual([r['website'] for r in out], ['acme.co.uk', 'other.com'])


class QueryExpansionTests(SimpleTestCase):
    BASE = [('dental clinic in Salem', 'dental clinic'), ('gym in Chennai', 'gym')]

    def test_base_first_then_variants(self):
        out = discovery.expand_queries(self.BASE, cycle=0, level=0)
        self.assertEqual(out[:2], self.BASE)
        self.assertEqual(len(out), 4)  # +1 variant per slice at level 0
        for q, ind in out[2:]:
            self.assertIn(ind, q)
            self.assertNotIn(' in ', q)  # never the base phrasing again

    def test_variants_rotate_across_cycles(self):
        a = discovery.expand_queries(self.BASE, cycle=0, level=0)[2:]
        b = discovery.expand_queries(self.BASE, cycle=1, level=0)[2:]
        self.assertNotEqual(a, b)

    def test_place_parsing(self):
        self.assertEqual(discovery.place_of('best gym Salem', 'gym'), 'Salem')
        self.assertEqual(discovery.place_of('gym in Pune, India', 'gym'), 'Pune, India')

    def test_neighbouring_cities_at_high_level(self):
        out = discovery.expand_queries(self.BASE, cycle=0, level=2)
        neighbours = discovery.neighbours('Salem', 1)
        self.assertTrue(neighbours)
        self.assertIn((f'dental clinic in {neighbours[0]}', 'dental clinic'), out)

    def test_hard_cap(self):
        base = [(f'gym in City{i}', 'gym') for i in range(50)]
        out = discovery.expand_queries(base, cycle=0, level=3, cap=60)
        self.assertEqual(len(out), 60)
        self.assertEqual(len({q for q, _ in out}), 60)


class AdaptiveWideningTests(SimpleTestCase):
    def test_widens_when_mostly_known_and_is_bounded(self):
        level = 0
        for _ in range(10):
            level = discovery.next_widen_level(
                {'widen_level': level, 'candidates': 200, 'new': 5})
        self.assertEqual(level, discovery.MAX_WIDEN_LEVEL)

    def test_narrows_when_new_leads_flow(self):
        self.assertEqual(discovery.next_widen_level(
            {'widen_level': 2, 'candidates': 100, 'new': 80}), 1)

    def test_steady_in_between(self):
        self.assertEqual(discovery.next_widen_level(
            {'widen_level': 1, 'candidates': 100, 'new': 40}), 1)

    def test_first_cycle(self):
        self.assertEqual(discovery.next_widen_level({}), 0)


def _quiet():
    return [mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]),
            mock.patch('core.pipeline.gmaps_available', return_value=False),
            mock.patch('core.pipeline.apify_maps_available', return_value=False),
            mock.patch('core.pipeline.llm_available', return_value=False),
            mock.patch('core.pipeline.time.sleep', lambda *_: None)]


class LockHeartbeatTests(TenantTestCase):
    def _since(self):
        return AppSettings.objects.values_list('pipeline_running_since', flat=True).first()

    def test_heartbeat_keeps_a_long_cycle_fresh(self):
        token = runlock.acquire_run_lock()
        start = timezone.now()
        for minutes in (30, 60, 90):  # a 90-minute cycle beating every 30 min
            with mock.patch('core.runlock.timezone.now', return_value=start + timedelta(minutes=minutes)):
                self.assertTrue(runlock.heartbeat_run_lock(token))
                self.assertIsNotNone(runlock.running_since())
                # nobody can take the lock over while it beats
                self.assertIsNone(runlock.acquire_run_lock())
        self.assertGreater(self._since(), token)
        runlock.release_run_lock(token)  # original token still releases it
        self.assertIsNone(self._since())

    def test_non_owner_cannot_refresh(self):
        token = runlock.acquire_run_lock()
        stranger = token - timedelta(seconds=5)
        later = timezone.now() + timedelta(minutes=10)
        with mock.patch('core.runlock.timezone.now', return_value=later):
            self.assertFalse(runlock.heartbeat_run_lock(stranger))
        self.assertEqual(self._since(), token)
        self.assertFalse(runlock.heartbeat_run_lock(None))

    def test_heartbeat_fails_after_takeover(self):
        token = runlock.acquire_run_lock()
        AppSettings.objects.update(pipeline_running_since=timezone.now() - timedelta(hours=2))
        new = runlock.acquire_run_lock()  # stale → taken over
        self.assertIsNotNone(new)
        self.assertFalse(runlock.heartbeat_run_lock(token))
        runlock.release_run_lock(token)  # the old owner can't clear the new lock
        self.assertIsNotNone(self._since())

    def test_cycle_beats_its_own_lock(self):
        with mock.patch('core.pipeline.heartbeat_run_lock', return_value=True) as beat:
            ps = _quiet()
            for p in ps:
                p.start()
            try:
                run_pipeline(triggered_by='test')
            finally:
                for p in ps:
                    p.stop()
        self.assertTrue(beat.called)
        self.assertIsNotNone(beat.call_args[0][0])


class CycleBudgetTests(TenantTestCase):
    def test_budget_stops_profiling_and_leaves_leads_for_next_cycle(self):
        for i in range(3):
            Lead.objects.create(company=f'Shop {i}', website=f'shop{i}.com')
        ps = _quiet() + [mock.patch('core.pipeline.CYCLE_BUDGET_SECONDS', -1),
                         mock.patch('core.pipeline.analyze_website')]
        mocks = [p.start() for p in ps]
        try:
            run = run_pipeline(triggered_by='test')
        finally:
            for p in ps:
                p.stop()
        self.assertFalse(mocks[-1].called)
        self.assertEqual(Lead.objects.filter(profiled=False).count(), 3)
        self.assertTrue(any('time budget reached' in n for n in run.summary['notes']))


class ReprofileTests(TenantTestCase):
    def _lead(self, name, days_old, **kw):
        lead = Lead.objects.create(company=name, website=f'{name}.com', profiled=True,
                                   contact_email=f'info@{name}.com', **kw)
        stamp = timezone.now() - timedelta(days=days_old)
        Lead.objects.filter(pk=lead.pk).update(updated_at=stamp)
        return lead

    def test_selection(self):
        old = self._lead('old', 120)
        self._lead('fresh', 10)
        emailed = self._lead('emailed', 200)
        EmailDraft.objects.create(lead=emailed, to_email='info@emailed.com', subject='s',
                                  body='b', status=EmailDraft.Statuses.SENT)
        rejected = self._lead('rejected', 150)
        EmailDraft.objects.create(lead=rejected, to_email='info@rejected.com', subject='s',
                                  body='b', status=EmailDraft.Statuses.REJECTED)
        stamped = self._lead('stamped', 200)
        Lead.objects.filter(pk=stamped.pk).update(
            analysis={'profiled_at': timezone.now().isoformat()})  # recent audit wins
        picked = {lead.pk for lead in reprofile_candidates(10)}
        self.assertEqual(picked, {old.pk, rejected.pk})
        self.assertEqual(len(reprofile_candidates(1)), 1)

    def test_reprofile_refreshes_but_never_redrafts(self):
        rejected = self._lead('rejected', 150)
        EmailDraft.objects.create(lead=rejected, to_email='info@rejected.com', subject='s',
                                  body='b', status=EmailDraft.Statuses.REJECTED)
        audit = {'has_website': True, 'findings': [], 'score': 77, 'contact_email': 'new@x.com',
                 'contact_phone': '', 'analysis': {'https': True}}
        ps = _quiet() + [mock.patch('core.pipeline.analyze_website', return_value=audit)]
        for p in ps:
            p.start()
        try:
            run = run_pipeline(triggered_by='test')
        finally:
            for p in ps:
                p.stop()
        rejected.refresh_from_db()
        self.assertEqual(rejected.score, 77)
        self.assertEqual(rejected.contact_email, 'info@rejected.com')  # never overwritten
        self.assertIn('profiled_at', rejected.analysis)
        self.assertEqual(EmailDraft.objects.filter(lead=rejected).count(), 1)
        self.assertTrue(any('refreshed 1 lead' in n for n in run.summary['notes']))
