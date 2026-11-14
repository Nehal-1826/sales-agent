"""C10 — verified sending mailboxes auto-enroll into WarmPulse.

Covers the auto-enroll hook on the mailbox save views (POST /mailboxes/ and
PATCH /mailboxes/{id}/ gated on the wizard's ``loginVerified`` flag), the
per-mailbox ``warmup_enrolled`` toggle, non-blocking failure handling, and
the C6 retry endpoint ``POST /mailboxes/{id}/enroll_warmup/`` including the
permission cases the C6 review flagged as untested (member 403,
cross-workspace 404, unconfigured mailbox 400).

All enrollment HTTP is mocked: tests patch ``core.warmup_enroll.enroll_mailbox``
(the symbol both the hook and the retry endpoint call late-bound).
"""

from unittest import mock

import requests
from rest_framework.authtoken.models import Token

from core import warmup_enroll
from core.models import Mailbox, User, Workspace
from core.tenancy import reset_workspace, set_workspace
from core.tests.base import TenantTestCase
from core.warmup_enroll import WarmupEnrollError

ENROLL_RESULT = {'status': 'enrolled', 'mailbox': {'id': 'wm-1', 'email_address': 'warm@x.test'}}


def mailbox_payload(**over):
    payload = {
        'fromEmail': 'warm@x.test',
        'smtpHost': 'smtp.x.test', 'smtpPort': 587,
        'smtpUser': 'warm@x.test', 'smtpPassword': 'app-secret',
        'imapHost': 'imap.x.test', 'imapPort': 993,
        'dailyCap': 30, 'isActive': True,
    }
    payload.update(over)
    return payload


class WarmupEnrollTestBase(TenantTestCase):
    """Owner + DRF token; helper to mock the enroll call itself."""

    def setUp(self):
        self.user = User.objects.create_user(workspace=self.workspace, username='warmowner',
                                             password='pass12345', role='owner',
                                             email='warmowner@x.test')
        self.token = Token.objects.create(user=self.user)
        self.auth = {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

    def make_mailbox(self, **over):
        fields = {
            'label': 'warm@x.test', 'from_email': 'warm@x.test',
            'smtp_host': 'smtp.x.test', 'smtp_port': 587,
            'smtp_user': 'warm@x.test', 'smtp_password': 'app-secret',
        }
        fields.update(over)
        return Mailbox.objects.create(**fields)


class AutoEnrollOnVerifiedSaveTests(WarmupEnrollTestBase):
    """The hook: save-with-verified-state enrolls once; plain edits never do."""

    def test_verified_create_enrolls_once(self):
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        return_value=ENROLL_RESULT) as enroll:
            res = self.client.post('/api/mailboxes/', mailbox_payload(loginVerified=True),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        enroll.assert_called_once()
        kwargs = enroll.call_args.kwargs
        self.assertEqual(kwargs['user'], self.user)
        self.assertEqual(kwargs['workspace_slug'], self.workspace.slug)
        self.assertEqual(kwargs['mailbox'].from_email, 'warm@x.test')
        mb = Mailbox.objects.get(from_email='warm@x.test')
        self.assertTrue(mb.warmup_enrolled)
        self.assertEqual(mb.warmup_enroll_error, '')
        self.assertEqual(res.json()['warmupEnrolled'], True)      # serializer exposes the flag
        self.assertEqual(res.json()['warmupEnrollError'], '')

    def test_unverified_create_does_not_enroll(self):
        # save without the wizard's Test-Connection proof → no enrollment
        with mock.patch('core.warmup_enroll.enroll_mailbox') as enroll:
            res = self.client.post('/api/mailboxes/', mailbox_payload(),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        enroll.assert_not_called()

    def test_plain_edit_does_not_enroll(self):
        # a field tweak (cap, pause, …) must not re-fire enrollment
        mb = self.make_mailbox()
        with mock.patch('core.warmup_enroll.enroll_mailbox') as enroll:
            res = self.client.patch(f'/api/mailboxes/{mb.id}/', {'dailyCap': 20},
                                    content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 200)
        enroll.assert_not_called()

    def test_verified_update_retries_and_clears_error(self):
        # re-tested login saved again → enrollment retried, stale error cleared
        mb = self.make_mailbox(warmup_enroll_error='warmup service was down')
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        return_value=ENROLL_RESULT) as enroll:
            res = self.client.patch(f'/api/mailboxes/{mb.id}/',
                                    {'smtpPassword': 'new-secret', 'loginVerified': True},
                                    content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 200)
        enroll.assert_called_once()
        mb.refresh_from_db()
        self.assertEqual(mb.warmup_enroll_error, '')

    def test_flag_off_skips_enrollment(self):
        with mock.patch('core.warmup_enroll.enroll_mailbox') as enroll:
            res = self.client.post('/api/mailboxes/',
                                   mailbox_payload(loginVerified=True, warmupEnrolled=False),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        enroll.assert_not_called()
        mb = Mailbox.objects.get(from_email='warm@x.test')
        self.assertFalse(mb.warmup_enrolled)

    def test_enroll_failure_stored_save_succeeds(self):
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        side_effect=WarmupEnrollError('warmup service unreachable', 502)):
            res = self.client.post('/api/mailboxes/', mailbox_payload(loginVerified=True),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)                     # never blocks the save
        mb = Mailbox.objects.get(from_email='warm@x.test')
        self.assertIn('warmup service unreachable', mb.warmup_enroll_error)
        self.assertIn('warmup service unreachable', res.json()['warmupEnrollError'])

    def test_unexpected_failure_stored_save_succeeds(self):
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        side_effect=RuntimeError('kaboom')):
            res = self.client.post('/api/mailboxes/', mailbox_payload(loginVerified=True),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        mb = Mailbox.objects.get(from_email='warm@x.test')
        self.assertIn('kaboom', mb.warmup_enroll_error)


class HookTimeoutTests(WarmupEnrollTestBase):
    """The save hook is capped at 5 s per HTTP call; the retry endpoint is not."""

    def test_hook_passes_short_timeout(self):
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        return_value=ENROLL_RESULT) as enroll:
            res = self.client.post('/api/mailboxes/', mailbox_payload(loginVerified=True),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(enroll.call_args.kwargs['timeout'], 5)

    def test_retry_endpoint_keeps_interactive_timeouts(self):
        mb = self.make_mailbox()
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        return_value=ENROLL_RESULT) as enroll:
            res = self.client.post(f'/api/mailboxes/{mb.id}/enroll_warmup/', **self.auth)
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('timeout', enroll.call_args.kwargs)

    def test_timeout_reaches_every_http_call(self):
        # timeout= caps both the list probe and the create; None keeps the
        # interactive per-call defaults
        mb = self.make_mailbox()
        listing = mock.Mock(status_code=200)
        listing.json.return_value = {'items': []}
        created = mock.Mock(status_code=201)
        created.json.return_value = {'id': 'wm-1', 'email_address': 'warm@x.test'}
        with mock.patch('core.warmup_enroll.mint_warmup_token', return_value='tok'), \
                mock.patch('core.warmup_enroll.requests.get', return_value=listing) as get, \
                mock.patch('core.warmup_enroll.requests.post', return_value=created) as post:
            warmup_enroll.enroll_mailbox(user=self.user, workspace_slug='test', mailbox=mb,
                                         timeout=5)
            self.assertEqual(get.call_args.kwargs['timeout'], 5)
            self.assertEqual(post.call_args.kwargs['timeout'], 5)
            warmup_enroll.enroll_mailbox(user=self.user, workspace_slug='test', mailbox=mb)
            self.assertEqual(get.call_args.kwargs['timeout'], warmup_enroll.LIST_TIMEOUT)
            self.assertEqual(post.call_args.kwargs['timeout'], warmup_enroll.TIMEOUT)

    def test_hook_timeout_stored_save_succeeds(self):
        # real enroll_mailbox, warmup service hangs → error stored, 201 anyway
        with mock.patch('core.warmup_enroll.mint_warmup_token', return_value='tok'), \
                mock.patch('core.warmup_enroll.requests.get',
                           side_effect=requests.Timeout('read timed out')):
            res = self.client.post('/api/mailboxes/', mailbox_payload(loginVerified=True),
                                   content_type='application/json', **self.auth)
        self.assertEqual(res.status_code, 201)
        mb = Mailbox.objects.get(from_email='warm@x.test')
        self.assertEqual(mb.warmup_enroll_error, 'Timed out contacting warmup service')

    def test_create_call_timeout_maps_to_error(self):
        mb = self.make_mailbox()
        listing = mock.Mock(status_code=200)
        listing.json.return_value = {'items': []}
        with mock.patch('core.warmup_enroll.mint_warmup_token', return_value='tok'), \
                mock.patch('core.warmup_enroll.requests.get', return_value=listing), \
                mock.patch('core.warmup_enroll.requests.post',
                           side_effect=requests.Timeout('read timed out')):
            with self.assertRaises(WarmupEnrollError) as ctx:
                warmup_enroll.enroll_mailbox(user=self.user, workspace_slug='test', mailbox=mb,
                                             timeout=5)
        self.assertEqual(ctx.exception.detail, 'Timed out contacting warmup service')
        self.assertEqual(ctx.exception.status_code, 504)


class RetryEndpointTests(WarmupEnrollTestBase):
    """POST /api/mailboxes/{id}/enroll_warmup/ — the visible retry state."""

    def retry(self, mb):
        return self.client.post(f'/api/mailboxes/{mb.id}/enroll_warmup/', **self.auth)

    def test_retry_enrolls_and_clears_error(self):
        mb = self.make_mailbox(warmup_enroll_error='old failure')
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        return_value=ENROLL_RESULT) as enroll:
            res = self.retry(mb)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'enrolled')
        enroll.assert_called_once()
        mb.refresh_from_db()
        self.assertEqual(mb.warmup_enroll_error, '')

    def test_retry_failure_stores_error(self):
        mb = self.make_mailbox()
        with mock.patch('core.warmup_enroll.enroll_mailbox',
                        side_effect=WarmupEnrollError('SMTP probe rejected the login', 400)):
            res = self.retry(mb)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['detail'], 'SMTP probe rejected the login')
        mb.refresh_from_db()
        self.assertIn('SMTP probe rejected the login', mb.warmup_enroll_error)


class EnrollEndpointPermissionTests(WarmupEnrollTestBase):
    """C6 endpoint guards the review flagged as untested."""

    def test_member_gets_403(self):
        member = User.objects.create_user(workspace=self.workspace, username='warmmember',
                                          password='pass12345', role='member',
                                          email='warmmember@x.test')
        tok = Token.objects.create(user=member)
        mb = self.make_mailbox()
        res = self.client.post(f'/api/mailboxes/{mb.id}/enroll_warmup/',
                               HTTP_AUTHORIZATION=f'Token {tok.key}')
        self.assertEqual(res.status_code, 403)

    def test_cross_workspace_mailbox_404(self):
        wb = Workspace.all_tenants.create(name='Beta', slug='beta-warm')
        ctx = set_workspace(wb)
        try:
            other = Mailbox.objects.create(label='b@x.test', from_email='b@x.test',
                                           smtp_host='smtp.x.test', smtp_port=587,
                                           smtp_user='b@x.test', smtp_password='s')
        finally:
            reset_workspace(ctx)
        res = self.client.post(f'/api/mailboxes/{other.id}/enroll_warmup/', **self.auth)
        self.assertEqual(res.status_code, 404)

    def test_unconfigured_mailbox_400(self):
        # no stored SMTP password → enroll_mailbox refuses before any HTTP call
        mb = self.make_mailbox(smtp_password='')
        with mock.patch('core.warmup_enroll.enroll_mailbox') as enroll:
            res = self.client.post(f'/api/mailboxes/{mb.id}/enroll_warmup/', **self.auth)
        self.assertEqual(res.status_code, 400)
        self.assertIn('not fully configured', res.json()['detail'])
        enroll.assert_not_called()
