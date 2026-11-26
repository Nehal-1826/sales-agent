"""The warmup service's copies of an account, reached by e-mail (core.warmup_accounts).

The service is never asked for real here: every HTTP call goes through a
replaced `requests.request`. One rule above all: "could not look" must never
read as "nothing there" — an account whose copy cannot be checked is not
deleted (core.accounts)."""

import os
from unittest import mock

from django.utils import timezone

import requests
from django.core.cache import cache
from django.test import TestCase

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_platform_base import make_admin
from core import warmup_accounts
from core.models import User

SECRET = 'unit-test-bridge-secret-0123456789abcdef'      # 32+ characters, like the real one


def answer(status=200, body=None):
    r = mock.Mock(status_code=status)
    r.json.return_value = body if body is not None else {}
    return r


def copies(*ids):
    return answer(200, {'items': [{'id': i, 'email': 'ada@acme.test'} for i in ids]})


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        os.environ['WARMUP_JWT_SECRET'] = SECRET
        self.addCleanup(os.environ.pop, 'WARMUP_JWT_SECRET', None)
        _, self.admin, _ = make_admin()      # the admin USER: the bridge token is minted for them


class CopiesTests(Base):
    def test_only_an_exact_e_mail_match_counts(self):
        body = answer(200, {'items': [{'id': 'a', 'email': 'ada@acme.test'},
                                      {'id': 'b', 'email': 'xada@acme.test'},
                                      {'id': 'c', 'email': 'Ada@Acme.Test '}]})
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=body) as http:
            found = warmup_accounts.copies_for(' Ada@acme.test ', self.admin)
        self.assertEqual([c['id'] for c in found], ['a', 'c'])
        self.assertEqual(http.call_args.args, ('GET', f'{warmup_accounts.warmup_api_base()}/api/admin/users'))
        self.assertEqual(http.call_args.kwargs['params'], {'search': 'Ada@acme.test', 'page_size': 200})
        self.assertTrue(http.call_args.kwargs['headers']['Authorization'].startswith('Bearer '))

    def test_no_copy_is_an_empty_list(self):
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=copies()):
            self.assertEqual(warmup_accounts.copies_for('ada@acme.test', self.admin), [])

    def test_an_address_with_nothing_in_it_is_not_even_asked_for(self):
        with mock.patch.object(warmup_accounts.requests, 'request') as http:
            self.assertEqual(warmup_accounts.copies_for('   ', self.admin), [])
        self.assertEqual(http.call_count, 0)

    def test_a_service_that_cannot_be_reached_is_an_error_never_no_copy(self):
        for failure in (requests.ConnectionError('down'), requests.Timeout('slow')):
            with mock.patch.object(warmup_accounts.requests, 'request', side_effect=failure):
                with self.assertRaises(warmup_accounts.WarmupAccountsError) as caught:
                    warmup_accounts.copies_for('ada@acme.test', self.admin)
            self.assertEqual(caught.exception.status_code, 502)

    def test_a_service_that_answers_oddly_is_an_error(self):
        bad_json = mock.Mock(status_code=200)
        bad_json.json.side_effect = ValueError('not json')
        shape = answer(200, {'items': 'no list here'})
        for body in (answer(500), bad_json, shape):
            with mock.patch.object(warmup_accounts.requests, 'request', return_value=body):
                with self.assertRaises(warmup_accounts.WarmupAccountsError):
                    warmup_accounts.copies_for('ada@acme.test', self.admin)

    def test_a_service_that_does_not_accept_our_sign_in_is_our_side(self):
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=answer(401)):
            with self.assertRaises(warmup_accounts.WarmupAccountsError) as caught:
                warmup_accounts.copies_for('ada@acme.test', self.admin)
        self.assertEqual(caught.exception.status_code, 503)

    def test_an_unconfigured_bridge_is_an_error(self):
        os.environ.pop('WARMUP_JWT_SECRET')
        with mock.patch.object(warmup_accounts.requests, 'request') as http:
            with self.assertRaises(warmup_accounts.WarmupAccountsError) as caught:
                warmup_accounts.copies_for('ada@acme.test', self.admin)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(http.call_count, 0)


class PausingTests(Base):
    def test_with_no_copy_nothing_further_is_asked(self):
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=copies()) as http:
            self.assertEqual(warmup_accounts.set_paused('ada@acme.test', self.admin, True), 0)
        self.assertEqual(http.call_count, 1)          # the look-up only

    def test_every_copy_is_paused_in_one_call(self):
        done = answer(200, {'mailboxes_updated': 3, 'users_affected': 2, 'skipped_super_admin': 0})
        with mock.patch.object(warmup_accounts.requests, 'request',
                               side_effect=[copies('a', 'b'), done]) as http:
            self.assertEqual(warmup_accounts.set_paused('ada@acme.test', self.admin, True), 3)
        args, kwargs = http.call_args_list[1]
        self.assertEqual(args, ('POST', f'{warmup_accounts.warmup_api_base()}/api/admin/users/bulk-pause-mailboxes'))
        self.assertEqual(kwargs['json'], {'user_ids': ['a', 'b'], 'action': 'pause'})

    def test_letting_them_run_again_asks_for_resume(self):
        with mock.patch.object(warmup_accounts.requests, 'request',
                               side_effect=[copies('a'), answer(200, {'mailboxes_updated': 1})]) as http:
            self.assertEqual(warmup_accounts.set_paused('ada@acme.test', self.admin, False), 1)
        self.assertEqual(http.call_args.kwargs['json'], {'user_ids': ['a'], 'action': 'resume'})

    def test_a_refusal_is_an_error(self):
        for status in (500, 403, 404):
            with mock.patch.object(warmup_accounts.requests, 'request',
                                   side_effect=[copies('a'), answer(status)]):
                with self.assertRaises(warmup_accounts.WarmupAccountsError):
                    warmup_accounts.set_paused('ada@acme.test', self.admin, True)


class RemovingTests(Base):
    def test_every_copy_is_deleted_and_counted(self):
        with mock.patch.object(warmup_accounts.requests, 'request',
                               side_effect=[copies('a', 'b'), answer(204), answer(204)]) as http:
            self.assertEqual(warmup_accounts.remove('ada@acme.test', self.admin), 2)
        self.assertEqual([c.args for c in http.call_args_list[1:]],
                         [('DELETE', f'{warmup_accounts.warmup_api_base()}/api/admin/users/a'),
                          ('DELETE', f'{warmup_accounts.warmup_api_base()}/api/admin/users/b')])

    def test_a_copy_that_is_already_gone_counts_as_removed(self):
        with mock.patch.object(warmup_accounts.requests, 'request', side_effect=[copies('a'), answer(404)]):
            self.assertEqual(warmup_accounts.remove('ada@acme.test', self.admin), 1)

    def test_anything_else_is_an_error(self):
        with mock.patch.object(warmup_accounts.requests, 'request', side_effect=[copies('a'), answer(500)]):
            with self.assertRaises(warmup_accounts.WarmupAccountsError):
                warmup_accounts.remove('ada@acme.test', self.admin)

    def test_no_copy_deletes_nothing(self):
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=copies()) as http:
            self.assertEqual(warmup_accounts.remove('ada@acme.test', self.admin), 0)
        self.assertEqual(http.call_count, 1)


class RoleTests(Base):
    """Telling the warmup service a copy's role changed (core.roles)."""

    def test_every_copy_is_told(self):
        with mock.patch.object(warmup_accounts.requests, 'request',
                               side_effect=[copies('a', 'b'), answer(204), answer(204)]) as http:
            self.assertEqual(warmup_accounts.set_role('ada@acme.test', self.admin, 'super_admin'), 2)
        args, kwargs = http.call_args_list[1]
        self.assertEqual(args, ('POST', f'{warmup_accounts.warmup_api_base()}/api/admin/users/a/role'))
        self.assertEqual(kwargs['json'], {'role': 'super_admin'})
        self.assertEqual(http.call_args_list[2].args[1],
                         f'{warmup_accounts.warmup_api_base()}/api/admin/users/b/role')

    def test_back_to_a_client(self):
        with mock.patch.object(warmup_accounts.requests, 'request',
                               side_effect=[copies('a'), answer(204)]) as http:
            self.assertEqual(warmup_accounts.set_role('ada@acme.test', self.admin, 'client'), 1)
        self.assertEqual(http.call_args.kwargs['json'], {'role': 'client'})

    def test_no_copy_asks_nothing_further(self):
        with mock.patch.object(warmup_accounts.requests, 'request', return_value=copies()) as http:
            self.assertEqual(warmup_accounts.set_role('ada@acme.test', self.admin, 'client'), 0)
        self.assertEqual(http.call_count, 1)          # the look-up only

    def test_an_account_without_an_e_mail_address_asks_nothing(self):
        with mock.patch.object(warmup_accounts.requests, 'request') as http:
            self.assertEqual(warmup_accounts.set_role('', self.admin, 'client'), 0)
        self.assertEqual(http.call_count, 0)

    def test_a_refusal_is_an_error(self):
        for status in (500, 403, 404, 400):
            with mock.patch.object(warmup_accounts.requests, 'request', side_effect=[copies('a'), answer(status)]):
                with self.assertRaises(warmup_accounts.WarmupAccountsError):
                    warmup_accounts.set_role('ada@acme.test', self.admin, 'super_admin')


class RefusalTests(Base):
    """Why the warmup service did not do it (warmup_accounts._refused): a
    refusal ON PURPOSE keeps its own words and its own status; a service that
    is down, or that fails, is "could not be reached" in ours."""

    def told(self, last):
        with mock.patch.object(warmup_accounts.requests, 'request', side_effect=[copies('a'), last]):
            with self.assertRaises(warmup_accounts.WarmupAccountsError) as caught:
                warmup_accounts.set_role('ada@acme.test', self.admin, 'super_admin')
        return caught.exception

    def test_a_refusal_with_its_reason_keeps_its_words_and_its_status(self):
        err = self.told(answer(400, {'detail': 'You cannot change your own role'}))
        self.assertEqual((err.detail, err.status_code, err.unchanged),
                         ('The warmup service refused: You cannot change your own role', 400, True))

    def test_a_refusal_with_no_reason_keeps_our_words_and_its_status(self):
        err = self.told(answer(403, {'detail': ''}))
        self.assertEqual((err.detail, err.status_code), ('The warmup service did not change the account role.', 403))

    def test_a_service_that_fails_is_unreachable(self):
        err = self.told(answer(500, {'detail': 'boom'}))
        self.assertEqual((err.detail, err.status_code), ('The warmup service did not change the account role.', 502))


class UndoTests(Base):
    """A step that was done on the warmup side, taken back (warmup_accounts.undo)."""

    def test_the_step_is_taken_back(self):
        done = mock.Mock()
        warmup_accounts.undo(done, ('ada@acme.test', self.admin, False), 'the mailboxes are paused')
        done.assert_called_once_with('ada@acme.test', self.admin, False)

    def test_when_it_cannot_be_the_error_says_what_stayed(self):
        done = mock.Mock(side_effect=warmup_accounts.WarmupAccountsError('Could not reach the warmup service.'))
        with mock.patch.object(warmup_accounts.log, 'error') as logged:
            with self.assertRaises(warmup_accounts.WarmupAccountsError) as caught:
                warmup_accounts.undo(done, (), 'the mailboxes are paused')
        self.assertEqual((caught.exception.detail, caught.exception.status_code, caught.exception.unchanged),
                         ('the mailboxes are paused', 502, False))          # never "Nothing was changed" then
        self.assertTrue(logged.called)


class TwinTests(Base):
    """Two accounts with one e-mail address are ONE person on the warmup side."""

    def account(self, username, email):
        u = User.objects.create_user(username=username, password='pw12345678', email=email)
        User.objects.filter(pk=u.pk).update(workspace=None)
        return User.objects.get(pk=u.pk)

    def test_another_account_with_the_same_address(self):
        ada = self.account('ada', 'ada@acme.test')
        self.assertIsNone(warmup_accounts.twin_of(ada))
        self.account('twin', 'ADA@acme.test')               # the same address, written differently
        self.assertEqual(warmup_accounts.twin_of(ada).username, 'twin')

    def test_no_address_no_twin(self):
        ada = self.account('ada', '')
        self.account('twin', '')
        self.assertIsNone(warmup_accounts.twin_of(ada))

    def test_a_deleted_twin_does_not_count(self):
        ada = self.account('ada', 'ada@acme.test')
        gone = self.account('gone', 'ada@acme.test')
        User.objects.filter(pk=gone.pk).update(deleted_at=timezone.now(), is_active=False)
        self.assertIsNone(warmup_accounts.twin_of(ada))

    def test_the_words_name_the_other_account(self):
        ada = self.account('ada', 'ada@acme.test')
        twin = self.account('twin', 'ada@acme.test')
        self.assertEqual(
            warmup_accounts.shared_email(ada, twin, self.admin, 'this cannot be done.'),
            'ada has the same e-mail address as another account (twin) (ada@acme.test). The warmup service tells '
            'people apart by e-mail address, so it counts them as one person and this cannot be done. '
            'Give one of the two accounts a different e-mail address first.')

    def test_and_your_own_account_when_it_is_yours(self):
        me = self.account('me', self.admin.email)          # its twin IS the signed-in admin
        said = warmup_accounts.shared_email(me, warmup_accounts.twin_of(me), self.admin, 'no.')
        self.assertIn(f'me has the same e-mail address as your account ({self.admin.email})', said)

