"""GET /api/platform/users/ — the console's Users page lists the REAL accounts
(everyone who can sign in), not the warmup side's copies."""

from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from core.models import User, Workspace

ROW_KEYS = {'id', 'email', 'username', 'name', 'role', 'is_platform_admin', 'workspace',
            'workspace_admins', 'workspace_accounts', 'plan', 'plan_code', 'plan_status', 'status', 'two_factor',
            'last_login', 'joined', 'deleted_at', 'deleted_by', 'purges_at'}


def company(slug, name):
    # the large plan: its seats are enough for the tests that add several people
    ws = make_ws(slug, plan='enterprise')
    Workspace.all_tenants.filter(pk=ws.pk).update(name=name)
    ws.refresh_from_db()
    return ws


class AccountsBase(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()          # the platform API is rate-limited per user, and the limits live in the cache
        self.admin, _, _ = make_admin()

    def list(self, **params):
        r = self.admin.get('/api/platform/users/', params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def row(self, email):
        return next(r for r in self.list()['results'] if r['email'] == email)


def person(ws, username, email, role='member', **extra):
    """A workspace user whose email is verified unless the test says otherwise.
    (A plain UPDATE: save() would re-apply the active workspace.)"""
    u = User.objects.create_user(username=username, password='pw12345678', workspace=ws,
                                 role=role, email=email)
    fields = {'email_verified_at': timezone.now()}
    fields.update(extra)
    User.objects.filter(pk=u.pk).update(**fields)
    u.refresh_from_db()
    return u


class AccountsListTests(AccountsBase):
    def test_a_row_says_everything_the_console_needs(self):
        ws = company('acc1', 'Acme Journals')
        u = person(ws, 'acme-owner', 'owner@acme.test', role='owner')
        row = next(x for x in self.list()['results'] if x['id'] == u.pk)
        self.assertEqual(set(row), ROW_KEYS)
        self.assertEqual((row['username'], row['name'], row['role'], row['is_platform_admin']),
                         ('acme-owner', '', 'owner', False))
        self.assertEqual(row['workspace'], {'id': ws.pk, 'name': 'Acme Journals', 'slug': 'acc1'})
        self.assertEqual(row['workspace_admins'], 1)
        self.assertEqual(row['status'], 'active')
        self.assertEqual(row['two_factor'], False)
        self.assertEqual((row['deleted_at'], row['deleted_by'], row['purges_at']), (None, None, None))
        self.assertTrue(row['joined'])

    def test_the_full_name_is_shown(self):
        ws = company('acc2', 'acc2')
        person(ws, 'named', 'named@acme.test', first_name='Ada', last_name='Lovelace')
        self.assertEqual(self.row('named@acme.test')['name'], 'Ada Lovelace')

    def test_a_platform_admin_is_listed_as_one_without_a_workspace(self):
        admin_u = User.objects.get(username='root')
        row = next(x for x in self.list()['results'] if x['id'] == admin_u.pk)
        self.assertEqual((row['role'], row['is_platform_admin'], row['workspace']),
                         ('platform_admin', True, None))

    def test_owners_and_admins_are_counted_for_the_workspace(self):
        ws = company('acc3', 'acc3')
        person(ws, 'o1', 'o1@acme.test', role='owner')
        person(ws, 'a1', 'a1@acme.test', role='admin')
        person(ws, 'm1', 'm1@acme.test', role='member')
        self.assertEqual(self.row('m1@acme.test')['workspace_admins'], 2)

    def test_an_unverified_email_is_pending_and_a_switched_off_account_is_suspended(self):
        ws = company('acc4', 'acc4')
        unverified = person(ws, 'new', 'new@acme.test', email_verified_at=None)
        self.assertIsNone(unverified.email_verified_at)
        self.assertEqual(self.row('new@acme.test')['status'], 'pending')
        person(ws, 'off', 'off@acme.test', is_active=False)
        self.assertEqual(self.row('off@acme.test')['status'], 'suspended')
        person(ws, 'ok', 'ok@acme.test')
        self.assertEqual(self.row('ok@acme.test')['status'], 'active')

    def test_an_account_of_a_stopped_workspace_is_suspended(self):
        ws = company('acc5', 'acc5')
        person(ws, 'stuck', 'stuck@acme.test')
        ws.is_active = False
        ws.save(update_fields=['is_active'])
        self.assertEqual(self.row('stuck@acme.test')['status'], 'suspended')

    def test_two_factor_is_reported(self):
        ws = company('acc6', 'acc6')
        person(ws, 'locked', 'locked@acme.test', totp_secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
        self.assertTrue(self.row('locked@acme.test')['two_factor'])

    def test_search_covers_email_username_name_and_company(self):
        ws = company('acc7', 'Zeppelin Studios')
        person(ws, 'zelda', 'zelda@zeppelin.test', first_name='Zelda', last_name='Q')
        for q in ('zelda@zeppelin', 'zelda', 'Zelda Q', 'zeppelin studios'):
            rows = self.list(q=q)['results']
            self.assertEqual([r['username'] for r in rows if r['workspace']], ['zelda'], q)
        self.assertEqual([r for r in self.list(q='no-such-thing')['results'] if r['workspace']], [])

    def test_role_and_status_filters(self):
        ws = company('acc8', 'acc8')
        person(ws, 'o', 'o@acme.test', role='owner')
        person(ws, 'm', 'm@acme.test', role='member', email_verified_at=None)
        owners = self.list(role='owner')['results']
        self.assertEqual(sorted(r['username'] for r in owners), ['o'])
        self.assertEqual(sorted(r['username'] for r in self.list(status='pending')['results']), ['m'])
        self.assertEqual(sorted(r['username'] for r in self.list(role='platform_admin')['results']), ['root'])

    def test_an_unknown_status_filter_is_refused_not_ignored(self):
        # ignored, "Deleted" would quietly list every account
        ws = company('acc8b', 'acc8b')
        person(ws, 'm', 'm@acme.test')
        r = self.admin.get('/api/platform/users/?status=nonsense')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'bad_status'))

    def test_signing_in_is_remembered(self):
        # nothing ever wrote last_login before the Users page read it: "Never" for everyone
        ws = company('acc8b', 'acc8b')
        person(ws, 'inout', 'inout@acme.test')
        self.assertIsNone(self.row('inout@acme.test')['last_login'])
        r = APIClient().post('/api/auth/login/', {'username': 'inout', 'password': 'pw12345678'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(self.row('inout@acme.test')['last_login'])

    def test_signing_in_to_the_console_is_remembered_too(self):
        admin_u = User.objects.get(username='root')
        self.assertIsNone(self.row(admin_u.email)['last_login'])
        r = APIClient().post('/api/auth/admin-login/', {'username': 'root', 'password': 'pass12345-x'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        # read from the row: a fresh login makes the admin's own session pass the code again
        self.assertIsNotNone(User.objects.get(pk=admin_u.pk).last_login)

    def test_the_answer_is_a_page(self):
        ws = company('acc9', 'acc9')
        from billing.models import Plan
        Plan.objects.filter(code='enterprise').update(
            limits={**Plan.objects.get(code='enterprise').limits, 'seats': 100})
        for i in range(27):
            person(ws, f'u{i:02d}', f'u{i:02d}@acme.test')
        body = self.list()
        self.assertEqual(set(body), {'count', 'next', 'previous', 'results'})
        self.assertGreaterEqual(body['count'], 27)
        self.assertEqual(len(body['results']), 25)
        self.assertTrue(body['next'])
        page2 = self.admin.get('/api/platform/users/?page=2').json()
        self.assertFalse(page2['next'])

    def test_only_a_platform_admin_may_list(self):
        ws = company('acc10', 'acc10')
        u = person(ws, 'snooper', 'snooper@acme.test', role='owner')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=u).key}')
        self.assertEqual(c.get('/api/platform/users/').status_code, 403)
        self.assertEqual(APIClient().get('/api/platform/users/').status_code, 401)


class DeletedAccountsTests(AccountsBase):
    """A deleted account is on the page only under "Deleted" — and says when
    it goes for good. A workspace stopped by a deletion is not on Tenants."""

    def gone(self, ws, username, email, days=3, deleted_by=None):
        """An account deleted `days` days ago (what core.accounts does to it)."""
        return person(ws, username, email, is_active=False,
                      deleted_at=timezone.now() - timedelta(days=days), deleted_by=deleted_by)

    def usernames(self, **params):
        return sorted(r['username'] for r in self.list(**params)['results'] if r['workspace'])

    def tenant_ids(self):
        r = self.admin.get('/api/platform/tenants/')
        self.assertEqual(r.status_code, 200, r.content)
        return [row['id'] for row in r.json()['results']]

    def test_a_deleted_account_is_listed_only_under_deleted(self):
        ws = company('del1', 'Acme')
        self.gone(ws, 'ada', 'ada@acme.test')
        self.assertEqual(self.usernames(q='ada@acme'), [])
        self.assertEqual(self.usernames(status='deleted', q='ada@acme'), ['ada'])
        for status in ('active', 'suspended', 'pending'):
            self.assertEqual(self.usernames(status=status, q='ada@acme'), [], status)

    def test_the_row_says_when_it_goes_for_good_and_who_deleted_it(self):
        ws = company('del2', 'Acme')
        ada = self.gone(ws, 'ada', 'ada@acme.test', days=3, deleted_by=User.objects.get(username='root'))
        row = next(r for r in self.list(status='deleted')['results'] if r['username'] == 'ada')
        self.assertEqual(row['status'], 'deleted')
        self.assertEqual(row['deleted_by'], 'root')
        self.assertEqual(parse_datetime(row['deleted_at']), ada.deleted_at)
        self.assertEqual(parse_datetime(row['purges_at']), ada.deleted_at + timedelta(days=30))

    def test_an_account_that_was_not_deleted_has_no_dates(self):
        ws = company('del3', 'Acme')
        person(ws, 'ok', 'ok@acme.test')
        row = self.row('ok@acme.test')
        self.assertEqual((row['deleted_at'], row['deleted_by'], row['purges_at']), (None, None, None))

    def test_the_row_counts_the_accounts_of_the_workspace(self):
        ws = company('del4', 'Acme')
        person(ws, 'a', 'a@acme.test')
        person(ws, 'b', 'b@acme.test')
        self.gone(ws, 'c', 'c@acme.test')
        self.assertEqual(self.row('a@acme.test')['workspace_accounts'], 2)      # the deleted one is not counted

    def test_a_workspace_stopped_by_a_deletion_is_not_on_the_tenants_page(self):
        ws = company('del5', 'Acme')
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False, deleted_at=timezone.now())
        self.assertNotIn(ws.pk, self.tenant_ids())

    def test_a_workspace_stopped_by_hand_stays_on_the_tenants_page(self):
        ws = company('del6', 'Acme')
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False)
        self.assertIn(ws.pk, self.tenant_ids())
