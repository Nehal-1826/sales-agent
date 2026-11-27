"""Changing a role (core.roles): Member, Admin, Owner or Super admin — what is
refused, what each change does, and that nothing changes when the warmup
service cannot be reached.

The warmup service is never asked for real: core.roles' two doors to it
(warmup_accounts.set_paused and set_role) are replaced."""

from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import Plan, PlatformAuditLog
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from core import roles, warmup_accounts
from core.models import AppSettings, ImpersonationTicket, User, Workspace
from core.warmup_accounts import WarmupAccountsError

PW = 'pw12345678'
ADMIN_PW = 'pass12345-x'


def stray(username='stray'):
    """An account with no company and not a super admin (made by hand)."""
    u = User.objects.create_user(username=username, password=PW)
    User.objects.filter(pk=u.pk).update(workspace=None)
    return User.objects.get(pk=u.pk)


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()          # the platform API is rate-limited per user (the limits live in the cache)
        self.admin, self.admin_u, _ = make_admin()
        self.calls = mock.Mock()          # the order in which the warmup service is asked
        for name in ('set_paused', 'set_role'):
            patcher = mock.patch.object(roles.warmup_accounts, name, return_value=0)
            self.calls.attach_mock(patcher.start(), name)
            self.addCleanup(patcher.stop)
        self.paused, self.mirrored = self.calls.set_paused, self.calls.set_role

    def company(self, slug='acme', name='Acme Journals'):
        """A set-up company on the large plan (seats for several people)."""
        ws = make_ws(slug, plan='enterprise')
        Workspace.all_tenants.filter(pk=ws.pk).update(name=name)
        row, _ = AppSettings.all_tenants.get_or_create(workspace=ws)
        AppSettings.all_tenants.filter(pk=row.pk).update(company_name=name)
        ws.refresh_from_db()
        return ws

    def person(self, ws, username, email, role='member'):
        u = User.objects.create_user(username=username, password=PW, workspace=ws, role=role, email=email)
        User.objects.filter(pk=u.pk).update(email_verified_at=timezone.now())
        return User.objects.get(pk=u.pk)

    def change(self, target, role, reason='Moving teams', workspace=None, client=None):
        body = {'role': role, 'reason': reason}
        if workspace is not None:
            body['workspace'] = workspace.pk
        return (client or self.admin).post(f'/api/platform/users/{target.pk}/role/', body, format='json')

    def company_with_owner(self, slug='acme', name='Acme Journals'):
        """A set-up company whose owner exists, so the next accounts are Members
        (the first account of a company is always made its owner)."""
        ws = self.company(slug, name)
        self.person(ws, 'bo', f'bo@{slug}.test', role='owner')
        return ws

    def fresh(self, target):
        return User.objects.get(pk=target.pk)

    def sign_in(self, door, username, password):
        return APIClient().post(f'/api/auth/{door}/', {'username': username, 'password': password}, format='json')


class RefusedTests(Base):
    def test_an_unknown_account_is_404(self):
        r = self.admin.post('/api/platform/users/987654/role/', {'role': 'admin', 'reason': 'x'}, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (404, 'not_found'))

    def test_nobody_changes_their_own_role(self):
        r = self.change(self.admin_u, 'owner')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_change_role'))

    def test_a_deleted_account_waits_for_its_restore(self):
        ws = self.company()
        ada = self.person(ws, 'ada', 'ada@acme.test', role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        r = self.admin.post(f'/api/platform/users/{ada.pk}/delete/',
                            {'reason': 'gone', 'confirmEmail': 'ada@acme.test'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        r = self.change(ada, 'member')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_change_role'))
        self.assertIn('Restore it first', r.json()['detail'])

    def test_the_role_it_already_has(self):
        ws = self.company()
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        max_ = self.person(ws, 'max', 'max@acme.test')
        r = self.change(max_, 'member')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'already_has_role'))

    def test_an_unknown_role(self):
        ws = self.company()
        max_ = self.person(ws, 'max', 'max@acme.test')
        self.assertEqual(self.change(max_, 'president').json()['error'], 'bad_role')

    def test_a_reason_is_required(self):
        ws = self.company()
        max_ = self.person(ws, 'max', 'max@acme.test')
        self.assertEqual(self.change(max_, 'admin', reason='   ').json()['error'], 'reason_required')

    def test_the_only_owner_cannot_be_lowered(self):
        ws = self.company('solo', 'Solo Co')
        ada = self.person(ws, 'ada', 'ada@acme.test', role='owner')
        self.person(ws, 'max', 'max@solo.test', role='admin')
        for role in ('admin', 'member'):
            r = self.change(ada, role)
            self.assertEqual((r.status_code, r.json()['error']), (400, 'last_owner'), role)
            self.assertIn('the only owner of Solo Co', r.json()['detail'])
        self.assertEqual(self.fresh(ada).role, 'owner')

    def test_the_only_owner_cannot_be_made_a_super_admin_either(self):
        ws = self.company('solo', 'Solo Co')
        ada = self.person(ws, 'ada', 'ada@acme.test', role='owner')
        r = self.change(ada, 'super_admin')
        self.assertEqual(r.json()['error'], 'last_owner')
        self.assertEqual(self.fresh(ada).workspace_id, ws.pk)

    def test_an_admin_cannot_leave_a_company_with_no_owner(self):
        ws = self.company()
        ali = self.person(ws, 'ali', 'ali@acme.test', role='admin')
        User.objects.filter(pk=ali.pk).update(role='admin')       # the first account is made the owner: undo it
        r = self.change(ali, 'member')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'last_owner'))
        self.assertIn('left to run', r.json()['detail'])

    def test_an_account_without_a_company_needs_one_chosen(self):
        lost = stray()
        r = self.change(lost, 'admin')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'workspace_required'))

    def test_an_unknown_company_is_404(self):
        lost = stray()
        body = {'role': 'admin', 'reason': 'x', 'workspace': 987654}
        r = self.admin.post(f'/api/platform/users/{lost.pk}/role/', body, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (404, 'not_found'))

    def test_a_stopped_company_cannot_be_joined(self):
        ws = self.company()
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False)
        r = self.change(stray(), 'admin', workspace=ws)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'workspace_stopped'))

    def test_a_super_admin_needs_an_e_mail(self):
        ws = self.company()
        ada = self.person(ws, 'ada', '')
        r = self.change(ada, 'super_admin')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'no_email'))

    # (Two accounts with one e-mail address cannot exist any more: the
    #  database refuses them — core.tests.test_identity.)

    def test_a_change_inside_a_company_asks_the_warmup_service_nothing(self):
        ws = self.company_with_owner()
        max_ = self.person(ws, 'max', 'max@acme.test')
        r = self.change(max_, 'admin')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((self.fresh(max_).role, self.fresh(max_).workspace_id), ('admin', ws.pk))
        self.assertEqual(self.calls.mock_calls, [])

    def test_two_accounts_with_no_address_at_all_are_allowed(self):
        ws = self.company()
        self.person(ws, 'ada', '', role='owner')
        bea = self.person(ws, 'bea', '')
        r = self.change(bea, 'super_admin')
        self.assertEqual(r.json()['error'], 'no_email')          # the rule for no address

    def test_nothing_changes_on_a_refusal(self):
        ws = self.company('keep', 'Keep Co')
        ada = self.person(ws, 'ada', 'ada@keep.test', role='owner')
        for role in ('admin', 'member', 'super_admin'):
            self.change(ada, role)
        ada = self.fresh(ada)
        self.assertEqual((ada.role, ada.workspace_id, ada.is_staff), ('owner', ws.pk, False))
        self.assertEqual(self.calls.mock_calls, [])
        self.assertEqual(PlatformAuditLog.objects.filter(action='platform.user.role').count(), 0)

    def test_only_a_platform_admin_may_change_roles(self):
        ws = self.company()
        ali = self.person(ws, 'ali', 'ali@acme.test', role='owner')
        max_ = self.person(ws, 'max', 'max@acme.test')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=ali).key}')
        self.assertEqual(self.change(max_, 'admin', client=c).status_code, 403)
        self.assertEqual(APIClient().post(f'/api/platform/users/{max_.pk}/role/',
                                          {'role': 'admin', 'reason': 'x'}, format='json').status_code, 401)
        self.assertEqual(self.fresh(max_).role, 'member')


class CompanyRoleTests(Base):
    def test_member_to_admin(self):
        ws = self.company_with_owner()
        max_ = self.person(ws, 'max', 'max@acme.test')
        self.assertEqual(max_.role, 'member')
        r = self.change(max_, 'admin')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), {'changed': True, 'from': 'member', 'to': 'admin',
                                    'workspace_left': None, 'workspace_joined': None})
        max_ = self.fresh(max_)
        self.assertEqual((max_.role, max_.workspace_id, max_.is_staff), ('admin', ws.pk, False))
        # a set-up company: not sent into the setup wizard (its finish flips the autopilot)
        self.assertTrue(max_.onboarding.get('done'))
        self.assertEqual(self.calls.mock_calls, [])          # a company role is nothing the warmup side knows

    def test_an_owner_may_only_be_lowered_while_another_is_made(self):
        ws = self.company()
        ada = self.person(ws, 'ada', 'ada@acme.test', role='owner')
        ali = self.person(ws, 'ali', 'ali@acme.test', role='admin')
        self.assertEqual(self.change(ada, 'admin').json()['error'], 'last_owner')     # ali is only an admin
        self.assertEqual(self.change(ali, 'owner').status_code, 200)
        self.assertEqual(self.change(ada, 'admin').status_code, 200)                  # ali is an owner now
        self.assertEqual(self.change(ali, 'member').json()['error'], 'last_owner')    # ada is only an admin now
        self.assertEqual((self.fresh(ada).role, self.fresh(ali).role), ('admin', 'owner'))

    def test_a_member_promoted_in_an_unset_company_keeps_the_wizard(self):
        ws = make_ws('fresh', plan='enterprise')            # no company name yet: somebody has to set it up
        self.person(ws, 'bo', 'bo@fresh.test', role='owner')
        max_ = self.person(ws, 'max', 'max@fresh.test')
        self.assertEqual(self.change(max_, 'admin').status_code, 200)
        self.assertFalse(self.fresh(max_).onboarding.get('done'))

    def test_what_the_person_had_in_their_onboarding_is_kept(self):
        ws = self.company_with_owner()
        max_ = self.person(ws, 'max', 'max@acme.test')
        User.objects.filter(pk=max_.pk).update(onboarding={'tour_done': True, 'step': 2})
        self.change(max_, 'admin')
        self.assertEqual(self.fresh(max_).onboarding, {'tour_done': True, 'step': 2, 'done': True})

    def test_a_change_inside_a_company_leaves_the_person_in_it(self):
        # the request carries a company only when one is JOINED; inside a company that field is empty
        ws = self.company_with_owner()
        max_ = self.person(ws, 'max', 'max@acme.test')
        self.assertEqual(self.change(max_, 'admin').status_code, 200)
        max_ = self.fresh(max_)
        self.assertEqual((max_.workspace_id, max_.role), (ws.pk, 'admin'))

    def test_the_change_is_recorded(self):
        ws = self.company_with_owner()
        max_ = self.person(ws, 'max', 'max@acme.test')
        self.change(max_, 'admin', reason='Moving teams')
        row = PlatformAuditLog.objects.get(action='platform.user.role')
        self.assertEqual((row.actor, row.target_workspace), (self.admin_u, ws))
        self.assertEqual((row.meta['from'], row.meta['to'], row.meta['reason']), ('member', 'admin', 'Moving teams'))
        self.assertEqual(row.meta['target_user_id'], max_.pk)
        self.assertEqual((row.meta['workspace_left'], row.meta['workspace_joined']), (None, None))


class SuperAdminTests(Base):
    def two_owner_company(self):
        ws = self.company()
        ada = self.person(ws, 'ada', 'ada@acme.test', role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        return ws, ada

    def test_making_a_super_admin(self):
        ws, ada = self.two_owner_company()
        now = timezone.now()
        ticket = ImpersonationTicket.objects.create(
            key_hash='k' * 64, admin=self.admin_u, target=ada, workspace=ws, reason='helping',
            started_at=now, ends_at=now + timedelta(hours=1))
        r = self.change(ada, 'super_admin')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['workspace_left'], {'id': ws.pk, 'name': 'Acme Journals', 'slug': 'acme'})
        ada = self.fresh(ada)
        self.assertEqual((ada.workspace_id, ada.is_staff, ada.is_superuser), (None, True, False))
        self.assertIsNotNone(ImpersonationTicket.objects.get(pk=ticket.pk).ended_at)
        # the warmup service FIRST: the mailboxes are paused while its copy is still a client, then the role is told
        self.assertEqual([name for name, _a, _k in self.calls.mock_calls], ['set_paused', 'set_role'])
        self.assertEqual(self.paused.call_args.args, ('ada@acme.test', self.admin_u, True))
        self.assertEqual(self.mirrored.call_args.args, ('ada@acme.test', self.admin_u, 'super_admin'))
        # the doors follow: the console lets them in, the workspace door does not
        self.assertEqual(self.sign_in('admin-login', 'ada', PW).status_code, 200)
        r = self.sign_in('login', 'ada', PW)
        self.assertEqual((r.status_code, r.json().get('admin_only')), (403, True))
        row = PlatformAuditLog.objects.get(action='platform.user.role')
        self.assertEqual((row.meta['from'], row.meta['to'], row.meta['workspace_left']['name']),
                         ('owner', 'super_admin', 'Acme Journals'))

    def test_the_warmup_service_must_answer(self):
        ws, ada = self.two_owner_company()
        self.mirrored.side_effect = WarmupAccountsError('Could not reach the warmup service.')
        r = self.change(ada, 'super_admin')
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'))
        self.assertTrue(r.json()['detail'].startswith('Nothing was changed.'))
        ada = self.fresh(ada)
        self.assertEqual((ada.workspace_id, ada.is_staff, ada.role), (ws.pk, False, 'owner'))

    # …and "Nothing was changed" has to be TRUE when the warmup service is
    #    reached and then fails halfway: the step that was done is undone.
    def test_when_the_role_cannot_be_told_its_mailboxes_run_again(self):
        ws, ada = self.two_owner_company()
        self.mirrored.side_effect = WarmupAccountsError('The warmup service refused: not allowed')
        r = self.change(ada, 'super_admin')
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'), r.content)
        self.assertEqual([c.args for c in self.calls.mock_calls],
                         [('ada@acme.test', self.admin_u, True),          # paused while its copy is still a client
                          ('ada@acme.test', self.admin_u, 'super_admin'),  # refused
                          ('ada@acme.test', self.admin_u, False)])         # so they run again
        self.assertEqual((self.fresh(ada).workspace_id, self.fresh(ada).is_staff), (ws.pk, False))

    def test_when_its_mailboxes_cannot_run_again_the_role_is_put_back(self):
        ws = self.company()
        _, leaver, _ = make_admin('leaver')
        self.paused.side_effect = WarmupAccountsError('Could not reach the warmup service.')
        r = self.change(leaver, 'member', workspace=ws)
        self.assertEqual(r.status_code, 502, r.content)
        self.assertEqual([c.args[2] for c in self.calls.mock_calls], ['client', False, 'super_admin'])
        self.assertIsNone(self.fresh(leaver).workspace_id)

    def test_when_the_first_step_cannot_be_undone_it_says_so(self):
        ws, ada = self.two_owner_company()
        self.mirrored.side_effect = WarmupAccountsError('The warmup service refused: not allowed')
        self.paused.side_effect = [0, WarmupAccountsError('Could not reach the warmup service.')]   # paused, and could not run again
        with mock.patch.object(warmup_accounts.log, 'error') as logged:
            r = self.change(ada, 'super_admin')
        self.assertEqual(r.status_code, 502, r.content)
        self.assertNotIn('Nothing was changed', r.json()['detail'])       # it would not be true
        self.assertIn('could not finish', r.json()['detail'])
        self.assertTrue(logged.called)

    def test_a_super_admin_back_into_a_company(self):
        ws = self.company()
        _, leaver, _ = make_admin('leaver')
        User.objects.filter(pk=leaver.pk).update(is_superuser=True)          # even a Django superuser becomes a company user
        r = self.change(leaver, 'owner', workspace=ws)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['workspace_joined'], {'id': ws.pk, 'name': 'Acme Journals', 'slug': 'acme'})
        leaver = self.fresh(leaver)
        self.assertEqual((leaver.workspace_id, leaver.role, leaver.is_staff, leaver.is_superuser),
                         (ws.pk, 'owner', False, False))
        self.assertTrue(leaver.onboarding.get('done'))                          # a set-up company: no wizard
        # the copy is a client again first, then what the promotion paused runs again
        self.assertEqual([name for name, _a, _k in self.calls.mock_calls], ['set_role', 'set_paused'])
        self.assertEqual(self.mirrored.call_args.args, (leaver.email, self.admin_u, 'client'))
        self.assertEqual(self.paused.call_args.args, (leaver.email, self.admin_u, False))
        self.assertEqual(self.sign_in('login', 'leaver', ADMIN_PW).status_code, 200)

    def test_the_last_super_admin_stays(self):
        # through the endpoint this cannot happen — the acting admin always stays —
        # so the rule is asked directly. 'root' (the acting admin of the other tests) is
        # removed first: then only one super admin is left.
        ws = self.company_with_owner()
        _, only, _ = make_admin('only-admin')
        User.objects.filter(username='root').delete()
        someone = self.person(ws, 'max', 'max@acme.test')
        problem = roles.can_change(someone, only, 'admin', ws)
        self.assertEqual(problem[:2], ('last_super_admin', 'At least one super admin must remain.'))
        _, second, _ = make_admin('second-admin')
        self.assertIsNone(roles.can_change(second, only, 'admin', ws))     # second stays: allowed

    def test_a_company_with_no_seat_left(self):
        Plan.objects.filter(code='enterprise').update(
            limits={**Plan.objects.get(code='enterprise').limits, 'seats': 1})
        ws = self.company()
        self.person(ws, 'ada', 'ada@acme.test')                                  # the one seat
        _, leaver, _ = make_admin('leaver')
        r = self.change(leaver, 'member', workspace=ws)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'seat_limit'))
        self.assertIsNone(self.fresh(leaver).workspace_id)
        self.assertEqual(self.calls.mock_calls, [])


class WarmupWordsTests(TestCase):
    """What the warmup service says when it refuses ON PURPOSE (a 4xx with a
    reason) is passed on as it said it, with its own status. "Could not be
    reached" (502) is for a service that is down: said for a refusal, it sent
    the owner looking for an outage that was not there (26 Nov 2026). The
    service itself is never asked: warmup_accounts._call is answered by hand."""

    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.admin, self.admin_u, _ = make_admin()

    @staticmethod
    def answer(status, body):
        resp = mock.Mock(status_code=status)
        resp.json.return_value = body
        return resp

    def member(self):
        ws = make_ws('acme', plan='enterprise')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')          # the first account is always made the owner
        return self.person(ws, 'max', 'max@acme.test')

    @staticmethod
    def person(ws, username, email, role='member'):
        return User.objects.create_user(username=username, password=PW, workspace=ws, role=role, email=email)

    def answers(self, last):
        """The six answers of a promotion that fails on its 4th call (the role), by hand:
        look, pause — look, `last` — look, let run again."""
        found = self.answer(200, {'items': [{'id': 'u-1', 'email': 'max@acme.test'}]})
        paused = self.answer(200, {'mailboxes_updated': 0})
        return [found, paused, found, last, found, paused]

    def ask(self, max_, last):
        with mock.patch.object(warmup_accounts, '_call', side_effect=self.answers(last)) as asked:
            r = self.admin.post(f'/api/platform/users/{max_.pk}/role/',
                                {'role': 'super_admin', 'reason': 'x'}, format='json')
        self.assertEqual(asked.call_count, 6)          # the pause was undone: the account is as it was
        return r

    def test_its_refusal_keeps_its_words_and_its_status(self):
        max_ = self.member()
        r = self.ask(max_, self.answer(400, {'detail': 'You cannot change your own role'}))
        self.assertEqual((r.status_code, r.json()['error']), (400, 'warmup_refused'), r.content)
        self.assertEqual(r.json()['detail'],
                         'Nothing was changed. The warmup service refused: You cannot change your own role')
        self.assertEqual(User.objects.get(pk=max_.pk).is_staff, False)

    def test_a_refusal_with_no_reason_keeps_our_words(self):
        max_ = self.member()
        r = self.ask(max_, self.answer(403, {'detail': ''}))
        self.assertEqual((r.status_code, r.json()['error']), (403, 'warmup_refused'), r.content)
        self.assertEqual(r.json()['detail'],
                         'Nothing was changed. The warmup service did not change the account role.')

    def test_a_service_that_fails_is_still_unreachable(self):
        max_ = self.member()
        r = self.ask(max_, self.answer(500, {'detail': 'boom'}))
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'), r.content)
        self.assertEqual(r.json()['detail'],
                         'Nothing was changed. The warmup service did not change the account role.')

