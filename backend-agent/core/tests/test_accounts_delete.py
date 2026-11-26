"""Delete an account and bring it back (core.accounts): what is refused, what
a deletion does to the account and its workspace, and what a restore undoes.

The warmup service is never asked for real: core.accounts' one door to it
(warmup_accounts.set_paused) is replaced. The console's lists are in
billing.tests.test_platform_users."""

from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import PlatformAuditLog
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from core import accounts
from core.models import ImpersonationTicket, User, Workspace
from core.warmup_accounts import WarmupAccountsError

PW = 'pw12345678'
EMAIL = 'ada@acme.test'


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()          # the platform API is rate-limited per user (the limits live in the cache)
        self.admin, self.admin_u, _ = make_admin()
        patcher = mock.patch.object(accounts.warmup_accounts, 'set_paused', return_value=0)
        self.paused = patcher.start()
        self.addCleanup(patcher.stop)

    def company(self, slug='acme', name='Acme Journals'):
        # the large plan: enough seats for the tests that add several people
        ws = make_ws(slug, plan='enterprise')
        Workspace.all_tenants.filter(pk=ws.pk).update(name=name)
        ws.refresh_from_db()
        return ws

    def person(self, ws, username, email, role='member', **extra):
        u = User.objects.create_user(username=username, password=PW, workspace=ws, role=role, email=email)
        fields = {'email_verified_at': timezone.now()}
        fields.update(extra)
        User.objects.filter(pk=u.pk).update(**fields)      # a plain UPDATE: save() re-applies the active workspace
        u.refresh_from_db()
        return u

    def delete(self, target, reason='Customer asked us to', confirm=EMAIL, client=None):
        return (client or self.admin).post(f'/api/platform/users/{target.pk}/delete/',
                                           {'reason': reason, 'confirmEmail': confirm}, format='json')

    def restore(self, target, reason='Deleted by mistake'):
        return self.admin.post(f'/api/platform/users/{target.pk}/restore/', {'reason': reason}, format='json')

    def sign_in(self, username, password=PW):
        return APIClient().post('/api/auth/login/', {'username': username, 'password': password}, format='json')

    def actions(self):
        return list(PlatformAuditLog.objects.order_by('id').values_list('action', flat=True))

    def running(self):
        """The workspaces the worker, the outbox and the inbox look at."""
        return [w.pk for w in Workspace.all_tenants.filter(is_active=True)]

    def user(self, username):
        u = User.objects.get(username=username)
        u.refresh_from_db()
        return u


class RefusedTests(Base):
    def test_a_platform_admin_cannot_be_deleted(self):
        _, other, _ = make_admin('other')
        r = self.delete(other)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_delete'))

    def test_nobody_can_delete_themselves(self):
        r = self.delete(self.admin_u)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_delete'))

    def test_an_unknown_account_is_404(self):
        r = self.admin.post('/api/platform/users/987654/delete/',
                            {'reason': 'x', 'confirmEmail': EMAIL}, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (404, 'not_found'))

    def test_an_account_without_a_workspace_is_refused_not_crashed(self):
        stray = User.objects.create_user(username='stray', password=PW)   # made by hand: no company, not staff
        User.objects.filter(pk=stray.pk).update(workspace=None)
        r = self.delete(stray, confirm='')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_delete'))

    def test_a_reason_is_required(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        r = self.delete(owner, reason='   ')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'reason_required'))

    def test_the_e_mail_must_be_typed(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        for typed in ('nope@acme.test', '', None, 'ada'):
            r = self.delete(owner, confirm=typed)
            self.assertEqual((r.status_code, r.json()['error']), (400, 'email_mismatch'), typed)

    def test_the_typed_e_mail_forgives_case_and_spaces(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        r = self.delete(self.user('ada'), confirm='  ADA@acme.TEST ')
        self.assertEqual(r.status_code, 200, r.content)

    def test_an_account_that_is_already_deleted(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.assertEqual(self.delete(owner).status_code, 200)
        r = self.delete(owner)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'already_deleted'))
        self.assertEqual(self.paused.call_count, 1)        # asked once, for the one real deletion

    def test_nothing_changes_on_a_refusal(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        Token.objects.create(user=owner)
        self.delete(owner, reason='   ')
        self.delete(owner, confirm='nope@acme.test')
        self.delete(self.admin_u)
        owner.refresh_from_db()
        ws.refresh_from_db()
        self.assertEqual((owner.deleted_at, owner.is_active, ws.is_active, ws.deleted_at), (None, True, True, None))
        self.assertTrue(Token.objects.filter(user=owner).exists())
        self.assertEqual(self.paused.call_count, 0)
        self.assertEqual(self.actions(), [])

    # ── two accounts with one e-mail address have ONE copy on the warmup side
    #    (it tells people apart by e-mail): deleting one of them would stop the
    #    other one's mailboxes too, so it is refused before anything is asked
    def test_an_account_that_shares_its_e_mail_cannot_be_deleted(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        User.objects.create_user(username='twin', password=PW, email=EMAIL)
        r = self.delete(ada)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'shared_email'), r.content)
        self.assertIn('ada has the same e-mail address as another account (twin) (ada@acme.test)', r.json()['detail'])
        self.assertIn("deleting this account would stop the other one's warmup mailboxes too", r.json()['detail'])
        self.assertEqual(self.paused.mock_calls, [])
        self.assertIsNone(self.user('ada').deleted_at)
        self.assertEqual(self.actions(), [])

    def test_a_twin_that_is_deleted_does_not_count(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        gone = User.objects.create_user(username='twin', password=PW, email=EMAIL)
        User.objects.filter(pk=gone.pk).update(deleted_at=timezone.now(), is_active=False)
        self.assertEqual(self.delete(ada).status_code, 200)

    def test_only_a_platform_admin_can_delete(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}')
        self.assertEqual(self.delete(owner, client=c).status_code, 403)
        self.assertEqual(APIClient().post(f'/api/platform/users/{owner.pk}/delete/',
                                          {'reason': 'x', 'confirmEmail': EMAIL}, format='json').status_code, 401)


class DeletingTests(Base):
    def test_the_last_owner_takes_the_workspace_down_with_everyone_in_it(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        member = self.person(ws, 'max', 'max@acme.test')
        other = self.company('other', 'Other Co')
        stays = self.person(other, 'bo', 'bo@other.test', role='owner')
        token = Token.objects.create(user=member)
        self.assertIn(ws.pk, self.running())

        r = self.delete(owner)

        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), {'deleted': True, 'workspace_stopped': True, 'deleted_accounts': ['ada', 'max']})
        owner.refresh_from_db()
        member.refresh_from_db()
        ws.refresh_from_db()
        self.assertEqual((owner.deleted_at is not None, owner.deleted_by, owner.is_active), (True, self.admin_u, False))
        # the accounts inside went with it — each one bring-back-able on its own
        self.assertEqual((member.deleted_at is not None, member.deleted_by, member.is_active), (True, self.admin_u, False))
        self.assertFalse(Token.objects.filter(user=member).exists())
        self.assertEqual((ws.is_active, ws.deleted_at is not None), (False, True))
        self.assertNotIn(ws.pk, self.running())
        # …and nobody else's
        self.assertEqual((other.is_active, other.deleted_at), (True, None))
        self.assertIsNone(stays.deleted_at)
        # sign-in is over for them, and says why
        self.assertEqual((self.sign_in('ada').status_code, self.sign_in('ada').json()['detail']),
                         (403, accounts.DELETED_DETAIL))
        self.assertEqual(self.sign_in('max').status_code, 403)

    def test_warmup_is_paused_for_everyone_who_goes(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.person(ws, 'bo', 'bo@acme.test')
        self.delete(owner)
        self.assertEqual(sorted((c.args[0], c.args[2]) for c in self.paused.call_args_list),
                         sorted([('bo@acme.test', True), ('max@acme.test', True), (EMAIL, True)]))
        self.assertTrue(all(c.args[1] == self.admin_u for c in self.paused.call_args_list))

    def test_one_of_two_owners_leaves_the_workspace_running(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        r = self.delete(ada)
        self.assertEqual(r.json(), {'deleted': True, 'workspace_stopped': False, 'deleted_accounts': ['ada']})
        ws.refresh_from_db()
        self.assertEqual((ws.is_active, ws.deleted_at), (True, None))
        self.assertIn(ws.pk, self.running())
        self.assertIsNone(self.user('bo').deleted_at)
        # the other owner still signs in
        r = self.sign_in('bo')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.paused.call_args.args, (EMAIL, self.admin_u, True))

    def test_a_member_does_not_take_the_workspace_down(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        member = self.person(ws, 'max', 'max@acme.test')
        r = self.delete(member, confirm='max@acme.test')
        self.assertEqual(r.json(), {'deleted': True, 'workspace_stopped': False, 'deleted_accounts': ['max']})
        self.assertIsNone(self.user('ada').deleted_at)
        self.assertIn(ws.pk, self.running())

    def test_a_failing_warmup_call_refuses_the_deletion_and_changes_nothing(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        Token.objects.create(user=owner)
        self.paused.side_effect = WarmupAccountsError('Could not reach the warmup service.')
        r = self.delete(owner)
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'))
        self.assertEqual(r.json()['detail'], 'Nothing was changed. Could not reach the warmup service.')
        owner.refresh_from_db()
        ws.refresh_from_db()
        self.assertEqual((owner.deleted_at, owner.is_active, ws.is_active), (None, True, True))
        self.assertTrue(Token.objects.filter(user=owner).exists())
        self.assertEqual(self.actions(), [])

    def test_a_failing_warmup_call_for_the_second_account_changes_nothing_either(self):
        # the first account's mailboxes were already paused: they run again, so
        # that "Nothing was changed" is true on the warmup side as well
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.paused.side_effect = [0, WarmupAccountsError('Could not reach the warmup service.'), 0]
        r = self.delete(owner)
        self.assertEqual((r.status_code, r.json()['detail']), (502, 'Nothing was changed. Could not reach the warmup service.'))
        self.assertEqual([(c.args[0], c.args[2]) for c in self.paused.call_args_list],
                         [(EMAIL, True), ('max@acme.test', True), (EMAIL, False)])
        self.assertIsNone(self.user('ada').deleted_at)
        self.assertEqual(self.actions(), [])

    def test_when_they_cannot_run_again_the_admin_is_told_they_are_paused(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.paused.side_effect = [0, WarmupAccountsError('Could not reach the warmup service.'),
                                   WarmupAccountsError('Could not reach the warmup service.')]
        with mock.patch.object(accounts.log, 'error') as logged:
            r = self.delete(owner)
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'), r.content)
        self.assertNotIn('Nothing was changed', r.json()['detail'])        # it would not be true
        self.assertIn('the warmup mailboxes of ada are paused', r.json()['detail'])
        self.assertTrue(logged.called)
        self.assertIsNone(self.user('ada').deleted_at)

    def test_a_ticket_into_the_account_is_ended(self):
        # an admin who is inside the workspace as this person is out with it
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        now = timezone.now()
        ticket = ImpersonationTicket.objects.create(
            key_hash='k' * 64, admin=self.admin_u, target=owner, workspace=ws, reason='helping',
            started_at=now, ends_at=now + timedelta(hours=1))
        self.delete(owner)
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.ended_at)

    def test_the_deletion_is_recorded(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.delete(owner, reason='Customer asked us to')
        row = PlatformAuditLog.objects.get(action='platform.user.delete')
        self.assertEqual((row.actor, row.target_workspace), (self.admin_u, ws))
        self.assertEqual(row.meta['target_user_id'], owner.pk)
        self.assertEqual(row.meta['target_email'], EMAIL)
        self.assertEqual(row.meta['reason'], 'Customer asked us to')
        self.assertTrue(row.meta['workspace_stopped'])
        self.assertEqual(row.meta['deleted_accounts'], ['ada', 'max'])


class RestoringTests(Base):
    def stopped_company(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        member = self.person(ws, 'max', 'max@acme.test')
        self.assertEqual(self.delete(owner).status_code, 200)
        self.paused.reset_mock()
        return ws, owner, member

    def test_an_account_that_is_not_deleted_cannot_be_restored(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        r = self.restore(owner)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'not_deleted'))
        self.assertEqual(APIClient().post(f'/api/platform/users/{owner.pk}/restore/',
                                          {'reason': 'x'}, format='json').status_code, 401)

    def test_an_unknown_account_is_404(self):
        r = self.admin.post('/api/platform/users/987654/restore/', {'reason': 'x'}, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (404, 'not_found'))

    def test_a_reason_is_required_too(self):
        ws = self.company()
        owner = self.person(ws, 'ada', EMAIL, role='owner')
        self.delete(owner)
        r = self.admin.post(f'/api/platform/users/{owner.pk}/restore/', {'reason': ' '}, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'reason_required'))

    def test_a_restored_owner_signs_in_again_and_the_workspace_runs_again(self):
        ws, owner, _ = self.stopped_company()
        r = self.restore(owner, reason='Deleted by mistake')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), {'restored': True, 'workspace_started': True})
        owner.refresh_from_db()
        ws.refresh_from_db()
        self.assertEqual((owner.deleted_at, owner.deleted_by, owner.is_active), (None, None, True))
        self.assertEqual((ws.is_active, ws.deleted_at), (True, None))
        self.assertEqual(self.paused.call_args.args, (EMAIL, self.admin_u, False))
        r = self.sign_in('ada')
        self.assertEqual(r.status_code, 200, r.content)
        row = PlatformAuditLog.objects.get(action='platform.user.restore')
        self.assertEqual((row.actor, row.target_workspace, row.meta['reason'], row.meta['workspace_started']),
                         (self.admin_u, ws, 'Deleted by mistake', True))

    def test_a_restored_member_alone_does_not_start_the_workspace(self):
        ws, owner, member = self.stopped_company()
        r = self.restore(member)
        self.assertEqual(r.json(), {'restored': True, 'workspace_started': False})
        member.refresh_from_db()
        ws.refresh_from_db()
        self.assertIsNone(member.deleted_at)
        self.assertEqual((ws.is_active, ws.deleted_at is not None), (False, True))
        self.assertNotIn(ws.pk, self.running())
        # the workspace is waiting for whoever can run it
        self.restore(owner)
        ws.refresh_from_db()
        self.assertEqual((ws.is_active, ws.deleted_at), (True, None))

    def test_a_restored_owner_of_a_running_workspace_starts_nothing(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        self.delete(ada)
        r = self.restore(ada)
        self.assertEqual(r.json(), {'restored': True, 'workspace_started': False})

    def test_a_workspace_stopped_by_hand_is_not_started_by_a_restore(self):
        # the admin stopped it themselves (Tenants): a restore never undoes that
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False)       # the Tenants page's own stop
        self.delete(ada)
        ws.refresh_from_db()
        self.assertEqual((ws.is_active, ws.deleted_at), (False, None))       # still theirs, not the deletion's
        r = self.restore(ada)
        self.assertEqual(r.json(), {'restored': True, 'workspace_started': False})
        self.assertNotIn(ws.pk, self.running())

    def test_a_warmup_service_that_cannot_resume_leaves_the_account_deleted(self):
        ws, owner, _ = self.stopped_company()
        self.paused.side_effect = WarmupAccountsError('Could not reach the warmup service.')
        r = self.restore(owner)
        self.assertEqual((r.status_code, r.json()['error']), (502, 'warmup_unavailable'))
        self.assertTrue(r.json()['detail'].startswith('Nothing was changed.'))
        self.assertIsNotNone(User.objects.get(pk=owner.pk).deleted_at)
        self.assertEqual([a for a in self.actions() if a == 'platform.user.restore'], [])
