"""Security proof: one company's API user can never see or touch another's data.

Two workspaces (A, B) each get an owner + member and a full set of rows.  The
base class deliberately is NOT a TenantTestCase: no ambient context is set, so
every request must establish its own tenant from the token, exactly as in
production."""

import csv
import io
import threading
from unittest import mock

from django.test import TestCase, TransactionTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import (
    AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead,
    PipelineRun, Potential, Reply, SearchProfile, User, Workspace,
)
from core.tenancy import current_workspace, workspace_context


def _client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
    return c


def _seed(ws, tag):
    """One of everything, every string carries `tag` so leaks are greppable."""
    with workspace_context(ws):
        lead = Lead.objects.create(company=f'{tag} Lead Co', contact_email=f'{tag.lower()}@lead.test',
                                   findings=[{'issue': tag}])
        draft = EmailDraft.objects.create(lead=lead, company=lead.company,
                                          to_email=f'{tag.lower()}@lead.test',
                                          subject=f'{tag} subject', body=f'{tag} body')
        pot = Potential.objects.create(company=f'{tag} Pot Co', opportunity=f'{tag} deal', lead=lead)
        reply = Reply.objects.create(company=f'{tag} Reply Co', summary=f'{tag} reply')
        tpl = EmailTemplate.objects.create(name=f'{tag} tpl', subject='s', body='b', is_default=True)
        prof = SearchProfile.objects.create(name=f'{tag} profile', target_countries=f'{tag}land')
        cfg = AgentConfig.objects.create(agent='search', system_prompt=f'{tag} prompt')
        run = PipelineRun.objects.create(summary={'tag': tag})
        s = AppSettings.load()
        s.company_name = f'{tag} Inc'
        # apollo key: a secret that triggers no outbound call in any test
        s.apollo_api_key = f'{tag}-secret-key'
        s.save(update_fields=['company_name', 'apollo_api_key'])
    return {'lead': lead, 'draft': draft, 'pot': pot, 'reply': reply, 'tpl': tpl,
            'profile': prof, 'cfg': cfg, 'run': run}


class IsolationBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.wa = Workspace.all_tenants.create(name='Alpha', slug='alpha')
        cls.wb = Workspace.all_tenants.create(name='Beta', slug='beta')
        cls.a_owner = User.objects.create_user(username='a_owner', password='pass12345',
                                               role='owner', workspace=cls.wa)
        cls.a_member = User.objects.create_user(username='a_member', password='pass12345',
                                                role='member', workspace=cls.wa)
        cls.b_owner = User.objects.create_user(username='b_owner', password='pass12345',
                                               role='owner', workspace=cls.wb)
        cls.b_member = User.objects.create_user(username='b_member', password='pass12345',
                                                role='member', workspace=cls.wb)
        cls.operator = User.objects.create_superuser(username='root', password='pass12345',
                                                     email='root@x.test')
        cls.A = _seed(cls.wa, 'ALPHA')
        cls.B = _seed(cls.wb, 'BETA')

    def setUp(self):
        self.ca = _client(self.a_owner)      # A's owner
        self.cam = _client(self.a_member)    # A's member
        self.cb = _client(self.b_owner)

    def b_snapshot(self):
        """Everything B owns, to compare before/after A acts."""
        with workspace_context(self.wb):
            s = AppSettings.load()
            return {
                'leads': list(Lead.objects.values_list('id', 'company', 'score')),
                'drafts': list(EmailDraft.objects.values_list('id', 'status', 'subject', 'body')),
                'pots': list(Potential.objects.values_list('id', 'company')),
                'replies': list(Reply.objects.values_list('id', 'company')),
                'tpls': list(EmailTemplate.objects.values_list('id', 'name', 'is_default')),
                'profiles': list(SearchProfile.objects.values_list('id', 'name', 'is_active')),
                'cfg': list(AgentConfig.objects.values_list('id', 'system_prompt')),
                'runs': list(PipelineRun.objects.values_list('id', 'summary')),
                'settings': (s.company_name, s.apollo_api_key, s.runs_enabled, s.target_countries,
                             s.pipeline_running_since),
            }

    def assertNoBeta(self, response):
        body = response.content.decode('utf-8', 'replace')
        self.assertNotIn('BETA', body)
        self.assertNotIn('beta@', body)


class ListEndpointTests(IsolationBase):
    LISTS = ['/api/leads/', '/api/potential/', '/api/replies/', '/api/drafts/',
             '/api/templates/', '/api/profiles/', '/api/settings/',
             '/api/agents/', '/api/agents/search/config/', '/api/pipeline/status/',
             '/api/pipeline/runs/', '/api/outreach/status/', '/api/chat/',
             '/api/leads/export/', '/api/auth/me/', '/api/onboarding/']

    def test_every_list_contains_only_alpha(self):
        for url in self.LISTS:
            r = self.ca.get(url)
            self.assertEqual(r.status_code, 200, url)
            self.assertNoBeta(r)

    def test_member_reads_are_scoped_too(self):
        for url in ['/api/leads/', '/api/potential/', '/api/replies/', '/api/drafts/',
                    '/api/pipeline/runs/', '/api/outreach/status/', '/api/chat/']:
            r = self.cam.get(url)
            self.assertEqual(r.status_code, 200, url)
            self.assertNoBeta(r)

    def test_lists_have_exactly_alphas_rows(self):
        self.assertEqual([x['id'] for x in self.ca.get('/api/leads/').json()],
                         [self.A['lead'].id])
        self.assertEqual([x['id'] for x in self.ca.get('/api/drafts/').json()],
                         [self.A['draft'].id])
        self.assertEqual([x['id'] for x in self.ca.get('/api/templates/').json()],
                         [self.A['tpl'].id])
        self.assertEqual([x['id'] for x in self.ca.get('/api/profiles/').json()],
                         [self.A['profile'].id])
        self.assertEqual([x['id'] for x in self.ca.get('/api/pipeline/runs/').json()],
                         [self.A['run'].id])

    def test_outreach_status_counts_only_alpha(self):
        with workspace_context(self.wb):
            for _ in range(3):
                EmailDraft.objects.create(company='extra', subject='x')
        self.assertEqual(self.ca.get('/api/outreach/status/').json()['drafts'], 1)

    def test_csv_export_only_alpha(self):
        r = self.ca.get('/api/leads/export/')
        rows = list(csv.reader(io.StringIO(r.content.decode('utf-8'))))
        self.assertEqual([row[0] for row in rows[1:]], ['ALPHA Lead Co'])

    def test_report_generate_only_alpha(self):
        for scope in ('today', 'all'):
            r = self.ca.post('/api/report/generate/', {'scope': scope}, format='json')
            self.assertEqual(r.status_code, 200)
            self.assertNoBeta(r)
        self.assertIn('ALPHA', self.ca.post('/api/report/generate/', {'scope': 'all'},
                                            format='json').json()['text'])

    def test_chat_history_is_per_workspace(self):
        with workspace_context(self.wb):
            ChatMessage.objects.create(user=self.b_owner, role='user', text='BETA secret chat')
        r = self.ca.get('/api/chat/')
        self.assertNoBeta(r)
        self.assertEqual(r.json()['messages'], [])

    def test_me_returns_workspace_name_and_slug_only(self):
        ws = self.ca.get('/api/auth/me/').json()['workspace']
        self.assertEqual(ws, {'name': 'Alpha', 'slug': 'alpha'})
        self.assertEqual(self.ca.get('/api/auth/me/').json()['username'], 'a_owner')

    def test_settings_payload_never_includes_workspace_field(self):
        for url in ('/api/settings/', '/api/leads/', '/api/drafts/', '/api/templates/',
                    '/api/profiles/', '/api/pipeline/runs/'):
            self.assertNotIn('"workspace', self.ca.get(url).content.decode())


class CrossTenantObjectTests(IsolationBase):
    """A addressing B's ids must look exactly like a missing row: 404."""

    def setUp(self):
        super().setUp()
        self.before = self.b_snapshot()

    def tearDown(self):
        self.assertEqual(self.b_snapshot(), self.before, 'B data changed')

    def test_lead_viewset_all_verbs_404(self):
        url = f'/api/leads/{self.B["lead"].id}/'
        self.assertEqual(self.ca.get(url).status_code, 404)
        self.assertEqual(self.ca.put(url, {'company': 'pwn'}, format='json').status_code, 404)
        self.assertEqual(self.ca.patch(url, {'company': 'pwn'}, format='json').status_code, 404)
        self.assertEqual(self.ca.delete(url).status_code, 404)

    def test_potential_and_reply_404(self):
        for base, key in (('potential', 'pot'), ('replies', 'reply')):
            url = f'/api/{base}/{self.B[key].id}/'
            self.assertEqual(self.ca.get(url).status_code, 404, base)
            self.assertEqual(self.ca.patch(url, {'company': 'pwn'}, format='json').status_code, 404)
            self.assertEqual(self.ca.delete(url).status_code, 404, base)

    def test_draft_actions_404(self):
        d = self.B['draft'].id
        self.assertEqual(self.ca.get(f'/api/drafts/{d}/').status_code, 404)
        self.assertEqual(self.ca.put(f'/api/drafts/{d}/', {'subject': 'pwn'},
                                     format='json').status_code, 404)
        for action in ('approve', 'reject', 'send'):
            r = self.ca.post(f'/api/drafts/{d}/{action}/')
            self.assertEqual(r.status_code, 404, action)

    def test_bulk_approve_mixed_ids_only_touches_alpha(self):
        from core.outbox import drain_outbox
        with mock.patch('core.outbox.send_draft') as send:
            r = self.ca.post('/api/drafts/bulk_approve/',
                             {'ids': [self.A['draft'].id, self.B['draft'].id]}, format='json')
            with workspace_context(self.wa):
                drain_outbox()
        self.B['draft'].refresh_from_db()
        self.assertEqual(self.B['draft'].status, EmailDraft.Statuses.DRAFT)
        self.assertEqual(r.status_code, 200)
        by_id = {x['id']: x for x in r.json()['results']}
        self.assertEqual(by_id[self.B['draft'].id], {'id': self.B['draft'].id, 'ok': False,
                                                     'error': 'not found'})
        for call in send.call_args_list:
            self.assertEqual(call.args[0].workspace_id, self.wa.pk)

    def test_lead_draft_email_404(self):
        with mock.patch('core.pipeline._draft_email') as d:
            r = self.ca.post(f'/api/leads/{self.B["lead"].id}/draft_email/')
        self.assertEqual(r.status_code, 404)
        d.assert_not_called()

    def test_template_404(self):
        url = f'/api/templates/{self.B["tpl"].id}/'
        self.assertEqual(self.ca.put(url, {'name': 'pwn'}, format='json').status_code, 404)
        self.assertEqual(self.ca.delete(url).status_code, 404)

    def test_profile_activate_404(self):
        r = self.ca.post(f'/api/profiles/{self.B["profile"].id}/activate/')
        self.assertEqual(r.status_code, 404)

    def test_agent_config_is_alphas_own(self):
        # keyed by agent name, never by id: A can only ever reach A's row
        r = self.ca.put('/api/agents/search/config/', {'systemPrompt': 'A edit'}, format='json')
        self.assertEqual(r.status_code, 200)
        with workspace_context(self.wa):
            self.assertEqual(AgentConfig.objects.get(agent='search').system_prompt, 'A edit')
        # B has no 'profile' config; A must not borrow one from elsewhere
        with workspace_context(self.wa):
            AgentConfig.objects.all().delete()
        self.assertEqual(self.ca.get('/api/agents/search/config/').status_code, 404)

    def test_settings_put_by_alpha_never_changes_beta(self):
        r = self.ca.put('/api/settings/', {'company': {'name': 'Hacked'},
                                           'runs': {'enabled': False}}, format='json')
        self.assertEqual(r.status_code, 200)
        with workspace_context(self.wa):
            self.assertEqual(AppSettings.load().company_name, 'Hacked')

    def test_alpha_creates_land_in_alpha_only(self):
        r = self.ca.post('/api/leads/', {'company': 'New A', 'hasWebsite': False,
                                         'workspace': self.wb.pk}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.ca.post('/api/templates/', {'name': 'tA', 'subject': 's', 'body': 'b'}, format='json')
        self.ca.post('/api/profiles/', {'name': 'pA'}, format='json')
        with workspace_context(self.wa):
            self.assertTrue(Lead.objects.filter(company='New A').exists())
        self.assertFalse(Lead.all_tenants.filter(company='New A', workspace=self.wb).exists())
        self.assertFalse(EmailTemplate.all_tenants.filter(name='tA', workspace=self.wb).exists())
        self.assertFalse(SearchProfile.all_tenants.filter(name='pA', workspace=self.wb).exists())


def _fake_cycle(triggered_by):
    """Stands in for the real cycle: writes through the scoped manager, so it
    lands in whatever workspace the (background) thread has active."""
    ws = current_workspace()
    Lead.objects.create(company=f'cycle-by-{ws.slug}')
    PipelineRun.objects.create(triggered_by=triggered_by, summary={'ws': ws.slug})
    return PipelineRun.objects.first()


class PipelineIsolationTests(IsolationBase):
    def test_sync_run_by_alpha_leaves_beta_untouched_and_unlocked(self):
        before = self.b_snapshot()
        with mock.patch('core.pipeline._run_cycle', _fake_cycle):
            r = self.ca.post('/api/pipeline/run/?wait=1', {}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.b_snapshot(), before)
        with workspace_context(self.wb):
            from core.runlock import running_since
            self.assertIsNone(running_since())
        self.assertTrue(Lead.all_tenants.filter(company='cycle-by-alpha',
                                                workspace=self.wa).exists())

    def test_alpha_lock_does_not_block_beta(self):
        from core.runlock import acquire_run_lock, release_run_lock
        with workspace_context(self.wa):
            token = acquire_run_lock()
            self.assertTrue(token)
        with mock.patch('core.pipeline._run_cycle', _fake_cycle):
            busy = self.ca.post('/api/pipeline/run/?wait=1', {}, format='json')
            free = self.cb.post('/api/pipeline/run/?wait=1', {}, format='json')
        self.assertEqual(busy.status_code, 409)
        self.assertEqual(free.status_code, 201)
        with workspace_context(self.wa):
            release_run_lock(token)

    def test_member_cannot_run_pipeline(self):
        self.assertEqual(self.cam.post('/api/pipeline/run/', {}, format='json').status_code, 403)

    def test_status_shows_only_own_runs(self):
        with workspace_context(self.wb):
            PipelineRun.objects.create(summary={'tag': 'BETA-new'})
        self.assertNoBeta(self.ca.get('/api/pipeline/status/'))


class BackgroundThreadTests(TransactionTestCase):
    """Real threads (own DB connection) need committed data, hence the
    TransactionTestCase.  A thread does not inherit the ContextVar, so this
    proves start_pipeline_async re-enters the CAPTURED workspace."""

    def setUp(self):
        self.wa = Workspace.all_tenants.create(name='Alpha', slug='alpha')
        self.wb = Workspace.all_tenants.create(name='Beta', slug='beta')
        with workspace_context(self.wb):
            Lead.objects.create(company='B-existing')

    def _join_cycle_threads(self):
        for t in threading.enumerate():
            if t.name == 'pipeline-cycle':
                t.join(10)

    def test_background_cycle_started_by_alpha_writes_only_to_alpha(self):
        from core.pipeline import start_pipeline_async
        from core.runlock import running_since
        # ambient context of the CALLER is alpha; the thread must not need it
        with mock.patch('core.pipeline._run_cycle', _fake_cycle):
            with workspace_context(self.wa):
                self.assertTrue(start_pipeline_async('manual'))
            self._join_cycle_threads()
        self.assertEqual(current_workspace(), None)
        companies_a = list(Lead.all_tenants.filter(workspace=self.wa).values_list('company', flat=True))
        self.assertEqual(companies_a, ['cycle-by-alpha'])
        self.assertEqual(list(Lead.all_tenants.filter(workspace=self.wb)
                              .values_list('company', flat=True)), ['B-existing'])
        self.assertEqual(PipelineRun.all_tenants.filter(workspace=self.wb).count(), 0)
        with workspace_context(self.wa):
            self.assertIsNone(running_since())     # released on alpha's row
        with workspace_context(self.wb):
            self.assertIsNone(running_since())

    def test_thread_releases_the_lock_of_the_right_workspace(self):
        from core.pipeline import start_pipeline_async
        from core.runlock import running_since
        gate = threading.Event()

        def slow_cycle(triggered_by):
            gate.wait(10)

        with mock.patch('core.pipeline._run_cycle', slow_cycle):
            with workspace_context(self.wa):
                self.assertTrue(start_pipeline_async('manual'))
                self.assertIsNotNone(running_since())
            with workspace_context(self.wb):
                self.assertIsNone(running_since())   # B's lock untouched meanwhile
            gate.set()
            self._join_cycle_threads()
        with workspace_context(self.wa):
            self.assertIsNone(running_since())

    def test_thread_exception_still_releases_lock(self):
        from core.pipeline import start_pipeline_async
        from core.runlock import running_since

        def boom(triggered_by):
            raise RuntimeError('boom')

        with mock.patch('core.pipeline._run_cycle', boom):
            with workspace_context(self.wa):
                start_pipeline_async('manual')
            self._join_cycle_threads()
        with workspace_context(self.wa):
            self.assertIsNone(running_since())


class ChatActionIsolationTests(IsolationBase):
    def setUp(self):
        super().setUp()
        # wizard done, so chat goes through the responder/actions path
        User.objects.filter(pk=self.a_owner.pk).update(onboarding={'done': True})
        self.before = self.b_snapshot()

    def _say(self, text):
        return self.ca.post('/api/chat/', {'text': text}, format='json')

    def test_approve_all_drafts_by_alpha_never_sends_betas(self):
        with mock.patch('core.mailer.send_draft') as send_a, \
                mock.patch('core.actions.send_draft', create=True) as send_b:
            self._say('approve all drafts')
            self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)
        with workspace_context(self.wa):   # positive control: the action did run for A
            self.assertNotEqual(EmailDraft.objects.get(pk=self.A['draft'].pk).status, 'draft')

    def test_switch_profile_by_alpha_leaves_beta_settings(self):
        self._say('switch profile to BETA profile')
        self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)

    def test_delete_lead_of_beta_by_name_does_nothing(self):
        r = self._say('delete lead BETA Lead Co')
        self.assertEqual(r.json()['reply']['text'], 'No matching lead.')
        self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)

    def test_delete_lead_of_alpha_does_not_touch_beta(self):
        self._say('delete lead ALPHA Lead Co')
        self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)

    def test_guide_by_alpha_is_scoped(self):
        r = self.ca.post('/api/guide/', {'text': 'approve all drafts'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.ca.post('/api/guide/', {'text': 'yes'}, format='json')
        self.assertNoBeta(r)
        self.assertEqual(self.b_snapshot(), self.before)

    def test_chat_run_pipeline_uses_alphas_workspace(self):
        with mock.patch('core.pipeline.start_pipeline_async', return_value=True) as start:
            self._say('run a cycle now')
            self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)

    def test_pending_action_cannot_be_planted_with_betas_draft_ids(self):
        # even a forged stored spec only reaches rows visible to A
        spec = {'action': 'approve_all', 'draft_ids': [self.B['draft'].id]}
        User.objects.filter(pk=self.a_owner.pk).update(pending_action={
            'spec': spec, 'summary': 's', 'expires': '2999-01-01T00:00:00+00:00'})
        with mock.patch('core.mailer.send_draft'):
            self._say('yes')
        self.assertEqual(self.b_snapshot(), self.before)


ENV_SECRETS = {'AI_KEY': 'ENV-AI', 'APOLLO_API_KEY': 'ENV-APOLLO', 'SCALELIST_API_KEY': 'ENV-SL',
               'APIFY_API_KEY': 'ENV-APIFY', 'SMTP_HOST': 'smtp.env.test',
               'SMTP_USER': 'env@x.test', 'SMTP_PASSWORD': 'ENV-PW'}


class SecretsPerTenantTests(IsolationBase):
    def test_keyless_tenant_gets_no_other_tenants_key_and_no_env(self):
        from core import ai, apify_maps, enrichment, mailer, scalelist
        env = dict(ENV_SECRETS, DEFAULT_TENANT_SLUG='alpha')   # env belongs to alpha only
        AppSettings.all_tenants.filter(workspace=self.wb).update(apollo_api_key='')
        with mock.patch.dict('os.environ', env):
            with workspace_context(self.wa):
                self.assertTrue(enrichment.apollo_available())
                self.assertTrue(mailer.smtp_configured())       # absorbed from env for the default tenant
            with workspace_context(self.wb):
                self.assertFalse(enrichment.apollo_available())
                self.assertFalse(ai.llm_available())
                self.assertFalse(scalelist.scalelist_available())
                self.assertFalse(apify_maps._api_key())
                self.assertFalse(mailer.smtp_configured())
                s = AppSettings.load()
                self.assertEqual((s.ai_key, s.smtp_host, s.apollo_api_key), ('', '', ''))

    def test_betas_own_key_is_used_for_beta_only(self):
        from core import enrichment
        with workspace_context(self.wa):
            self.assertEqual(AppSettings.load().apollo_api_key, 'ALPHA-secret-key')
        with workspace_context(self.wb):
            self.assertEqual(AppSettings.load().apollo_api_key, 'BETA-secret-key')
            with mock.patch('core.enrichment.requests.post') as post:
                post.return_value.status_code = 200
                post.return_value.json.return_value = {'organization': {}}
                enrichment.apollo_enrich_domain('x.test')
            sent = repr(post.call_args)
            self.assertIn('BETA-secret-key', sent)
            self.assertNotIn('ALPHA', sent)


class AuthAndContextTests(IsolationBase):
    def test_inactive_workspace_blocks_login(self):
        Workspace.all_tenants.filter(pk=self.wb.pk).update(is_active=False)
        r = APIClient().post('/api/auth/login/', {'username': 'b_owner', 'password': 'pass12345'},
                             format='json')
        self.assertEqual(r.status_code, 403)
        self.assertNotIn('token', r.json())

    def test_inactive_workspace_blocks_existing_token(self):
        Workspace.all_tenants.filter(pk=self.wb.pk).update(is_active=False)
        self.assertEqual(self.cb.get('/api/leads/').status_code, 403)
        self.assertEqual(self.ca.get('/api/leads/').status_code, 200)   # A unaffected

    def test_active_login_response_shape_unchanged(self):
        r = APIClient().post('/api/auth/login/', {'username': 'a_owner', 'password': 'pass12345'},
                             format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), {'token', 'user'})
        self.assertEqual({'id', 'username', 'role'} <= set(r.json()['user']), True)
        self.assertEqual(r.json()['user']['workspace']['slug'], 'alpha')

    def test_operator_gets_403_on_tenant_endpoints(self):
        op = _client(self.operator)
        for url in ('/api/leads/', '/api/potential/', '/api/replies/', '/api/drafts/',
                    '/api/templates/', '/api/profiles/', '/api/settings/', '/api/agents/',
                    '/api/agents/search/config/', '/api/pipeline/status/', '/api/pipeline/runs/',
                    '/api/outreach/status/', '/api/chat/', '/api/leads/export/',
                    '/api/onboarding/'):
            r = op.get(url)
            self.assertEqual(r.status_code, 403, url)
            self.assertIn('admin console', r.json()['detail'])
        for url in ('/api/pipeline/run/', '/api/report/generate/', '/api/guide/'):
            r = op.post(url, {'text': 'hi'}, format='json')
            self.assertEqual(r.status_code, 403, url)

    def test_operator_can_still_read_me_with_null_workspace(self):
        r = _client(self.operator).get('/api/auth/me/')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()['workspace'])

    def test_forged_workspace_inputs_are_ignored(self):
        by_header = APIClient()
        by_header.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.get(user=self.a_owner).key}',
                              HTTP_X_WORKSPACE='beta', HTTP_X_WORKSPACE_ID=str(self.wb.pk),
                              HTTP_X_TENANT='beta')
        r = by_header.get(f'/api/leads/?workspace={self.wb.pk}&workspace_id={self.wb.pk}&ws=beta')
        self.assertEqual([x['id'] for x in r.json()], [self.A['lead'].id])
        self.assertEqual(by_header.get(f'/api/leads/{self.B["lead"].id}/').status_code, 404)
        # body field on create/update is not a field at all
        r = self.ca.post('/api/templates/', {'name': 'f', 'subject': 's', 'body': 'b',
                                             'workspace': self.wb.pk, 'workspace_id': self.wb.pk,
                                             'X-Workspace': 'beta'}, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertNotIn('workspace', r.json())
        tpl = EmailTemplate.all_tenants.get(pk=r.json()['id'])
        self.assertEqual(tpl.workspace_id, self.wa.pk)

    def test_register_stays_closed(self):
        r = APIClient().post('/api/auth/register/', {'username': 'new', 'password': 'pass12345'},
                             format='json')
        self.assertEqual(r.status_code, 403)

    def test_unauthenticated_requests_get_401_not_data(self):
        self.assertEqual(APIClient().get('/api/leads/').status_code, 401)

    def test_middleware_leaves_no_context_after_request(self):
        self.assertIsNone(current_workspace())
        self.assertEqual(self.ca.get('/api/leads/').status_code, 200)
        self.assertIsNone(current_workspace())
        # also after a view that raises / is rejected
        self.assertEqual(self.ca.get(f'/api/leads/{self.B["lead"].id}/').status_code, 404)
        self.assertIsNone(current_workspace())
        self.assertEqual(self.cb.get('/api/leads/').status_code, 200)
        self.assertIsNone(current_workspace())

    def test_middleware_restores_even_when_view_raises(self):
        from django.test import RequestFactory
        from core.middleware import TenantContextMiddleware
        from core.tenancy import set_workspace

        def boom(request):
            set_workspace(self.wa)
            raise RuntimeError('x')

        with self.assertRaises(RuntimeError):
            TenantContextMiddleware(boom)(RequestFactory().get('/'))
        self.assertIsNone(current_workspace())

    def test_stale_context_does_not_serve_the_next_request(self):
        # a context left behind on this thread must be wiped at request start
        seen = {}

        def view(request):
            seen['ws'] = current_workspace()
            from django.http import HttpResponse
            return HttpResponse('ok')

        from django.test import RequestFactory
        from core.middleware import TenantContextMiddleware
        with workspace_context(self.wb):
            TenantContextMiddleware(view)(RequestFactory().get('/'))
            self.assertEqual(current_workspace(), self.wb)   # caller's own context restored
        self.assertIsNone(seen['ws'])

    def test_middleware_is_first_in_settings(self):
        from django.conf import settings
        self.assertEqual(settings.MIDDLEWARE[0], 'core.middleware.TenantContextMiddleware')

    def test_context_is_not_shared_across_threads(self):
        seen = []
        with workspace_context(self.wa):
            t = threading.Thread(target=lambda: seen.append(current_workspace()))
            t.start()
            t.join()
        self.assertEqual(seen, [None])
