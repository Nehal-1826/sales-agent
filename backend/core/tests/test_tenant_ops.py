"""Tenant operations: per-workspace worker, reports, provisioning, commands."""
import os
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError

from core.management.commands.run_worker import Command as WorkerCommand
from core.models import AgentConfig, AppSettings, Lead, User, Workspace
from core.pipeline import PipelineBusy
from core.tenancy import current_workspace, workspace_context
from core.tests.base import TenantTestCase
from core.workspaces import provision_workspace, resolve_workspace, WorkspaceChoiceError

WORKER = 'core.management.commands.run_worker'


class Stop(Exception):
    pass


class TwoTenantBase(TenantTestCase):
    def _make(self, slug, **settings):
        ws = Workspace.all_tenants.create(slug=slug, name=slug.title())
        provision_workspace(ws)
        with workspace_context(ws):
            row = AppSettings.load()
            for k, v in settings.items():
                setattr(row, k, v)
            row.save(update_fields=list(settings) or None)
        return ws

    def only_active(self, *workspaces):
        keep = [w.pk for w in workspaces]
        Workspace.all_tenants.exclude(pk__in=keep).update(is_active=False)


class WorkerPerWorkspaceTests(TwoTenantBase):
    def test_only_due_tenant_runs_and_failing_tenant_backs_off(self):
        a = self._make('a')
        b = self._make('b', runs_enabled=False)
        c = self._make('c')
        self.only_active(a, b, c)
        seen = []

        def fake_run(triggered_by):
            seen.append(current_workspace().slug)
            if current_workspace().slug == 'c':
                raise RuntimeError('bad key')
            raise PipelineBusy('lock')  # no PipelineRun written: A stays due

        err = StringIO()
        with mock.patch(f'{WORKER}.start_report_scheduler'), \
                mock.patch(f'{WORKER}._heartbeat_forever'), \
                mock.patch(f'{WORKER}.close_old_connections'), \
                mock.patch(f'{WORKER}.run_pipeline', fake_run), \
                mock.patch(f'{WORKER}.time.sleep', side_effect=[None, None, Stop()]):
            with self.assertRaises(Stop):
                call_command('run_worker', stdout=StringIO(), stderr=err)
        self.assertEqual(seen.count('a'), 3)  # due every tick
        self.assertEqual(seen.count('c'), 1)  # one failure, then backoff
        self.assertNotIn('b', seen)  # paused tenant untouched
        self.assertIn('[c]', err.getvalue())

    def test_one_tenants_exception_does_not_stop_the_loop(self):
        a = self._make('a')
        b = self._make('b')
        self.only_active(a, b)
        ran = []
        original = WorkerCommand._tick_workspace

        def flaky(cmd, ws, last_failure):
            if ws.slug == 'a':
                raise RuntimeError('db hiccup')
            ran.append(ws.slug)
        with mock.patch(f'{WORKER}.start_report_scheduler'), \
                mock.patch(f'{WORKER}._heartbeat_forever'), \
                mock.patch(f'{WORKER}.close_old_connections'), \
                mock.patch.object(WorkerCommand, '_tick_workspace', flaky), \
                mock.patch(f'{WORKER}.time.sleep', side_effect=[None, Stop()]):
            with self.assertRaises(Stop):
                call_command('run_worker', stdout=StringIO(), stderr=StringIO())
        self.assertEqual(ran, ['b', 'b'])
        self.assertTrue(original)


class ReportIsolationTests(TwoTenantBase):
    def test_each_tenant_reports_only_its_own_data_to_its_own_recipient(self):
        a = self._make('a', report_email='a@a.test')
        b = self._make('b', report_email='b@b.test')
        c = self._make('c')  # no recipients -> skipped, not an error
        self.only_active(a, b, c)
        with workspace_context(a):
            Lead.objects.create(company='AlphaCorp')
        with workspace_context(b):
            Lead.objects.create(company='BetaCorp')
        sent = []
        with mock.patch('core.reports.smtp_configured', return_value=True), \
                mock.patch('core.reports.send_email_message',
                           side_effect=lambda subj, body, rcpt, s, html=None:
                           sent.append((rcpt, body))):
            call_command('daily_report', stdout=StringIO(), stderr=StringIO())
        by_rcpt = {tuple(r): body for r, body in sent}
        self.assertEqual(set(by_rcpt), {('a@a.test',), ('b@b.test',)})
        self.assertIn('AlphaCorp', by_rcpt[('a@a.test',)])
        self.assertNotIn('BetaCorp', by_rcpt[('a@a.test',)])
        self.assertIn('BetaCorp', by_rcpt[('b@b.test',)])
        self.assertNotIn('AlphaCorp', by_rcpt[('b@b.test',)])

    def test_workspace_flag_limits_to_one_tenant(self):
        a = self._make('a', report_email='a@a.test')
        b = self._make('b', report_email='b@b.test')
        self.only_active(a, b)
        sent = []
        with mock.patch('core.reports.smtp_configured', return_value=True), \
                mock.patch('core.reports.send_email_message',
                           side_effect=lambda subj, body, rcpt, s, html=None: sent.append(rcpt)):
            call_command('daily_report', '--workspace', 'b', stdout=StringIO())
        self.assertEqual(sent, [['b@b.test']])


class ProvisionAndCommandTests(TwoTenantBase):
    def test_provision_creates_four_agents_and_neutral_settings_idempotently(self):
        ws = Workspace.all_tenants.create(slug='p', name='P')
        provision_workspace(ws)
        provision_workspace(ws)
        agents = AgentConfig.all_tenants.filter(workspace=ws)
        self.assertEqual(
            sorted(agents.values_list('agent', flat=True)),
            ['copywright', 'profile', 'responder', 'search'])
        row = AppSettings.all_tenants.get(workspace=ws)
        self.assertEqual(row.company_name, '')
        self.assertEqual(row.ai_key, '')

    def test_create_workspace_provisions_and_rejects_duplicate_slug(self):
        call_command('create_workspace', '--name', 'Acme', '--slug', 'acme',
                     '--owner-username', 'acme_owner', '--owner-password', 'pw-123456-x',
                     stdout=StringIO())
        ws = Workspace.all_tenants.get(slug='acme')
        self.assertEqual(AgentConfig.all_tenants.filter(workspace=ws).count(), 4)
        with self.assertRaises(CommandError):
            call_command('create_workspace', '--name', 'Acme2', '--slug', 'acme',
                         '--owner-username', 'other', '--owner-password', 'pw-123456-x',
                         stdout=StringIO())

    def test_bootstrap_admin_is_idempotent(self):
        env = {'DEFAULT_TENANT_SLUG': 'boot', 'DEFAULT_TENANT_NAME': 'Boot Co',
               'ADMIN_USERNAME': 'boss', 'ADMIN_PASSWORD': 'pw-123456-x'}
        with mock.patch.dict(os.environ, env):
            out = StringIO()
            call_command('bootstrap_admin', stdout=out)
            call_command('bootstrap_admin', stdout=out)
        ws = Workspace.all_tenants.get(slug='boot')
        self.assertEqual(ws.name, 'Boot Co')
        self.assertEqual(User.objects.filter(workspace=ws, username='boss').count(), 1)
        self.assertEqual(User.objects.get(username='boss').role, User.Roles.OWNER)
        self.assertEqual(AgentConfig.all_tenants.filter(workspace=ws).count(), 4)
        self.assertNotIn('pw-123456-x', out.getvalue())
        self.assertIn('nothing to do', out.getvalue())

    def test_seed_demo_works_without_prior_context(self):
        from core.tenancy import reset_workspace, set_workspace
        token = set_workspace(None)
        try:
            call_command('seed_demo', '--demo-crm', stdout=StringIO())
            call_command('seed_demo', '--demo-crm', stdout=StringIO())  # idempotent
        finally:
            reset_workspace(token)
        demo = Workspace.all_tenants.get(slug='demo')
        self.assertEqual(AgentConfig.all_tenants.filter(workspace=demo).count(), 4)
        self.assertTrue(Lead.all_tenants.filter(workspace=demo).exists())
        self.assertFalse(Lead.all_tenants.exclude(workspace=demo).filter(
            company='Acme Robotics').exists())
        self.assertTrue(User.objects.filter(workspace=demo, username='operator').exists())

    def test_resolve_workspace_requires_slug_when_several(self):
        self._make('x')
        with self.assertRaises(WorkspaceChoiceError):
            resolve_workspace('')
        self.assertEqual(resolve_workspace('x').slug, 'x')


class SplitTenantsTests(TwoTenantBase):
    FLIP = '2026-10-27T05:49:00+00:00'

    def setUp(self):
        import datetime
        from core.models import ChatMessage, EmailDraft, PipelineRun, Potential
        self.before = datetime.datetime(2026, 10, 1, tzinfo=datetime.timezone.utc)
        self.after = datetime.datetime(2026, 10, 28, tzinfo=datetime.timezone.utc)
        s = AppSettings.load()
        s.company_name = 'Supporticon'
        s.ai_key = 'SECRET-KEY'
        s.smtp_password = 'SMTP-PW'
        s.report_email = 'boss@x.test'
        s.save(update_fields=['company_name', 'ai_key', 'smtp_password', 'report_email'])
        mk = Lead.objects.create
        self.l1, self.l2, self.l3 = mk(company='L1'), mk(company='L2'), mk(company='L3')
        self.l4, self.l5 = mk(company='L4'), mk(company='L5')
        Lead.all_tenants.filter(pk=self.l4.pk).update(created_at=self.after)
        Lead.all_tenants.filter(pk=self.l5.pk).update(created_at=self.before)
        self.d1 = EmailDraft.objects.create(lead=self.l2, company='L2', subject='s', body='b')
        self.p1 = Potential.objects.create(lead=self.l3, company='L3')
        self.u = User.objects.create_user(username='sup_user', password='pw-123456-x')
        self.u.pending_action = {'spec': 'x'}
        self.u.save()
        self.chat = ChatMessage.objects.create(user=self.u, role='user', text='hi')
        self.run1 = PipelineRun.objects.create()
        self.run2 = PipelineRun.objects.create()
        PipelineRun.all_tenants.filter(pk=self.run1.pk).update(started_at=self.before)
        PipelineRun.all_tenants.filter(pk=self.run2.pk).update(started_at=self.after)
        self.map = {
            'flip': self.FLIP,
            'leads': {str(self.l1.pk): 'test', str(self.l2.pk): 'supporticon',
                      str(self.l3.pk): 'shrifragrance'},
            'emaildrafts': {str(self.d1.pk): 'supporticon'},
            'potentials': {str(self.p1.pk): 'shrifragrance'},
            'chatmessages': {},
            'pipelineruns': {str(self.run1.pk): 'test'},
            'user_workspace': {str(self.u.pk): 'supporticon'},
        }

    def _path(self, data=None):
        import json
        import tempfile
        f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        json.dump(data or self.map, f)
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def _run(self, *extra, data=None):
        out = StringIO()
        call_command('split_tenants', '--map', self._path(data), *extra,
                     stdout=out, stderr=StringIO())
        return out.getvalue()

    def _ws(self, model, pk):
        return model.all_tenants.get(pk=pk).workspace.slug

    def test_dry_run_changes_nothing_and_lists_users(self):
        out = self._run()
        self.assertIn('DRY RUN', out)
        self.assertIn('sup_user', out)
        self.assertEqual(Workspace.all_tenants.filter(slug='supporticon').count(), 0)
        self.assertEqual(self._ws(Lead, self.l2.pk), 'test')
        self.assertEqual(User.objects.get(pk=self.u.pk).workspace.slug, 'test')

    def test_apply_moves_as_mapped_and_children_follow_leads(self):
        from core.models import ChatMessage, EmailDraft, PipelineRun, Potential
        self._run('--apply', '--names', 'shrifragrance=Shri Fragrance')
        self.assertEqual(self._ws(Lead, self.l1.pk), 'test')
        self.assertEqual(self._ws(Lead, self.l2.pk), 'supporticon')
        self.assertEqual(self._ws(Lead, self.l3.pk), 'shrifragrance')
        self.assertEqual(self._ws(EmailDraft, self.d1.pk), 'supporticon')
        self.assertEqual(self._ws(Potential, self.p1.pk), 'shrifragrance')
        # unmapped: flip rule for leads/runs, user's workspace for chat
        self.assertEqual(self._ws(Lead, self.l4.pk), 'supporticon')
        self.assertEqual(self._ws(Lead, self.l5.pk), 'test')
        self.assertEqual(self._ws(PipelineRun, self.run2.pk), 'supporticon')
        self.assertEqual(self._ws(ChatMessage, self.chat.pk), 'supporticon')
        user = User.objects.get(pk=self.u.pk)
        self.assertEqual(user.workspace.slug, 'supporticon')
        self.assertEqual(user.pending_action, {'spec': 'x'})
        self.assertEqual(Workspace.all_tenants.get(slug='shrifragrance').name, 'Shri Fragrance')
        self.assertEqual(Workspace.all_tenants.get(slug='supporticon').name, 'Supporticon')

    def test_second_apply_is_a_no_op(self):
        self._run('--apply')
        out = self._run('--apply')
        self.assertNotIn('row(s) to move', out)
        self.assertNotIn('would create', out)
        self.assertEqual(self._ws(Lead, self.l2.pk), 'supporticon')

    def test_profile_copied_without_secrets(self):
        self._run('--apply')
        for slug in ('supporticon', 'shrifragrance'):
            row = AppSettings.all_tenants.get(workspace__slug=slug)
            self.assertEqual(row.company_name, 'Supporticon')
            self.assertEqual(row.ai_key, '')
            self.assertEqual(row.smtp_password, '')
            self.assertEqual(row.report_email, '')
        # default tenant untouched without --restore-default-profile
        self.assertEqual(AppSettings.all_tenants.get(workspace=self.workspace).ai_key, 'SECRET-KEY')
        self.assertEqual(AppSettings.all_tenants.get(workspace=self.workspace).company_name,
                         'Supporticon')

    def test_restore_default_profile_is_opt_in(self):
        self._run('--apply', '--restore-default-profile',
                  '--default-name', 'Shailog', '--default-website', 'https://shailog.com')
        row = AppSettings.all_tenants.get(workspace=self.workspace)
        self.assertEqual((row.company_name, row.company_website), ('Shailog', 'https://shailog.com'))
        self.assertEqual(row.ai_key, 'SECRET-KEY')  # secrets never touched

    def test_inconsistent_map_aborts_and_rolls_back(self):
        bad = dict(self.map)
        bad['emaildrafts'] = {str(self.d1.pk): 'shrifragrance'}  # lead L2 goes to supporticon
        with self.assertRaises(CommandError):
            self._run('--apply', data=bad)
        self.assertEqual(self._ws(Lead, self.l2.pk), 'test')
        self.assertEqual(Workspace.all_tenants.filter(slug='supporticon').count(), 0)
