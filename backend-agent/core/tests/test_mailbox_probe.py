"""Mailbox wizard — real test-connection probe + the "saves, never works"
fix.  No network: imaplib / smtplib are mocked at the module boundary.

Root cause covered here (see the Task 5 report):
  1. the wizard saved host/port/password with NO verification —
     Mailbox.configured() only checks the fields are non-empty, so a typo'd
     host or app password still showed "Sending";
  2. at send time a NON-auth connection failure (wrong host, blocked port,
     no-STARTTLS server) deferred the drafts forever with no pause, no
     mailbox error, nothing visible — "saves fine, never works".
"""

import imaplib
import socket
import smtplib
from unittest import mock

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import outbox
from core.mailbox_probe import probe_mailbox
from core.mailer import _open_smtp
from core.models import EmailDraft, Mailbox, User

from .base import TenantTestCase
from .test_deliverability import OutboxBase


def probe_body(**over):
    body = {'imapHost': 'imap.gmail.com', 'imapPort': 993,
            'smtpHost': 'smtp.gmail.com', 'smtpPort': 587,
            'username': 'sales@sender.com', 'password': 'app-password-123'}
    body.update(over)
    return body


class ProbeUnitTests(TenantTestCase):
    """probe_mailbox() — per-leg IMAP + SMTP verification, mocked stdlib."""

    def test_success_both_legs(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            imap_cls.return_value.login.return_value = ('OK', [b'Logged in'])
            smtp_cls.return_value.has_extn.return_value = True
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.gmail.com', smtp_port=587,
                              username='sales@sender.com', password='app-password-123')
        self.assertTrue(r['imap']['ok'], r)
        self.assertTrue(r['smtp']['ok'], r)
        self.assertIn('TLS', r['imap']['detail'])
        self.assertIn('TLS', r['smtp']['detail'])
        imap_cls.return_value.login.assert_called_once_with('sales@sender.com', 'app-password-123')
        smtp_cls.return_value.login.assert_called_once_with('sales@sender.com', 'app-password-123')
        smtp_cls.return_value.starttls.assert_called_once()

    def test_imap_auth_fail(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP'):
            imap_cls.return_value.login.side_effect = imaplib.IMAP4.error('AUTHENTICATIONFAILED')
            r = probe_mailbox(imap_host='imap.zoho.in', imap_port=993,
                              smtp_host='smtp.zoho.in', smtp_port=587,
                              username='sales@sender.com', password='wrong')
        self.assertFalse(r['imap']['ok'])
        self.assertIn('rejected', r['imap']['detail'].lower())

    def test_smtp_auth_fail(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL'), \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            smtp_cls.return_value.has_extn.return_value = True
            smtp_cls.return_value.login.side_effect = smtplib.SMTPAuthenticationError(
                535, b'Invalid credentials')
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.gmail.com', smtp_port=587,
                              username='sales@sender.com', password='wrong')
        self.assertFalse(r['smtp']['ok'])
        self.assertIn('rejected', r['smtp']['detail'].lower())

    def test_smtp_unreachable(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL'), \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            smtp_cls.side_effect = ConnectionRefusedError('refused')
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.ty.po', smtp_port=587,
                              username='sales@sender.com', password='x')
        self.assertFalse(r['smtp']['ok'])
        self.assertIn('could not reach', r['smtp']['detail'].lower())

    def test_both_fail(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            imap_cls.side_effect = OSError('no route')
            smtp_cls.side_effect = ConnectionRefusedError('refused')
            r = probe_mailbox(imap_host='imap.ty.po', imap_port=993,
                              smtp_host='smtp.ty.po', smtp_port=587,
                              username='sales@sender.com', password='x')
        self.assertFalse(r['imap']['ok'])
        self.assertFalse(r['smtp']['ok'])

    def test_timeout_is_reported_not_raised(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            imap_cls.side_effect = socket.timeout('timed out')
            smtp_cls.side_effect = socket.timeout('timed out')
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.gmail.com', smtp_port=587,
                              username='sales@sender.com', password='x',
                              timeout=8)
        self.assertFalse(r['imap']['ok'])
        self.assertFalse(r['smtp']['ok'])
        self.assertIn('timed out', r['imap']['detail'].lower())
        self.assertIn('timed out', r['smtp']['detail'].lower())

    def test_smtp_plain_fallback_flagged(self):
        """Server without STARTTLS still verifies — flagged as unencrypted."""
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL'), \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            smtp_cls.return_value.has_extn.return_value = False
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.plain.test', smtp_port=587,
                              username='sales@sender.com', password='x')
        self.assertTrue(r['smtp']['ok'], r)
        smtp_cls.return_value.starttls.assert_not_called()
        smtp_cls.return_value.login.assert_called_once()
        self.assertIn('not encrypted', r['smtp']['detail'].lower())

    def test_smtp_465_uses_ssl(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL'), \
                mock.patch('core.mailbox_probe.smtplib.SMTP_SSL') as smtp_ssl_cls:
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.gmail.com', smtp_port=465,
                              username='sales@sender.com', password='x')
        smtp_ssl_cls.assert_called_once()
        self.assertTrue(r['smtp']['ok'], r)

    def test_password_never_in_result(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            imap_cls.side_effect = OSError('boom app-password-123')
            smtp_cls.side_effect = smtplib.SMTPAuthenticationError(535, b'bad app-password-123')
            r = probe_mailbox(imap_host='imap.gmail.com', imap_port=993,
                              smtp_host='smtp.gmail.com', smtp_port=587,
                              username='sales@sender.com', password='app-password-123')
        dumped = repr(r)
        self.assertNotIn('app-password-123', dumped)


class ProbeEndpointTests(OutboxBase):
    """POST /api/mailboxes/test — token auth, per-leg result, no password echo."""

    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_user(username='own', password='pw123456', role='owner')
        self.member = User.objects.create_user(username='mem', password='pw123456', role='member')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')
        self.mclient = APIClient()
        self.mclient.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.member).key}')

    def test_endpoint_shape_and_no_password_echo(self):
        with mock.patch('core.mailbox_probe.imaplib.IMAP4_SSL') as imap_cls, \
                mock.patch('core.mailbox_probe.smtplib.SMTP') as smtp_cls:
            imap_cls.return_value.login.return_value = ('OK', [b'Logged in'])
            smtp_cls.return_value.has_extn.return_value = True
            r = self.client.post('/api/mailboxes/test/', probe_body(), format='json')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(set(body), {'imap', 'smtp'})
        for leg in ('imap', 'smtp'):
            self.assertEqual(set(body[leg]), {'ok', 'detail'}, body)
            self.assertIsInstance(body[leg]['ok'], bool)
            self.assertTrue(body[leg]['ok'], body)
        self.assertNotIn('app-password-123', r.content.decode())

    def test_endpoint_requires_login(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.post('/api/mailboxes/test/', probe_body(), format='json').status_code, 401)

    def test_endpoint_member_forbidden(self):
        self.assertEqual(self.mclient.post('/api/mailboxes/test/', probe_body(), format='json').status_code, 403)

    def test_endpoint_requires_credentials(self):
        r = self.client.post('/api/mailboxes/test/', probe_body(password=''), format='json')
        self.assertEqual(r.status_code, 400)


class ConnectNeverWorksFixTests(OutboxBase):
    """Root-cause fix: a mailbox whose server cannot be reached pauses with a
    visible reason instead of deferring its drafts forever in silence."""

    def setUp(self):
        super().setUp()
        # base patches open_mailbox_connection to a MagicMock — tests here
        # set its side_effect to the failure they exercise

    def test_drain_pauses_mailbox_on_unreachable_host(self):
        mb = Mailbox.objects.create(from_email='down@sender.com', daily_cap=30, ramp_start=None,
                                    smtp_host='smtp.nowhere.invalid', smtp_user='down@sender.com',
                                    smtp_password='secret-pass')
        d = self.draft()  # DRAFT — the approve path claims it
        queued = outbox.enqueue_draft(d.pk)
        self.assertEqual(queued.status, EmailDraft.Statuses.QUEUED)
        EmailDraft.objects.filter(pk=d.pk).update(scheduled_for=self.clock.now)

        self.open_conn.side_effect = ConnectionRefusedError('refused')
        with self.assertLogs('core.outbox', level='WARNING'):
            stats = outbox.drain_outbox()
        self.assertEqual(stats['deferred'], 1)
        mb.refresh_from_db()
        self.assertTrue(outbox.is_paused(mb), 'unreachable server must pause the mailbox')
        self.assertIn('could not reach', mb.paused_reason.lower())
        # the draft is NOT stuck claiming the dead mailbox forever: it gets
        # re-assigned away from it (or waits) instead of silently retrying
        d.refresh_from_db()
        self.assertNotEqual(d.status, EmailDraft.Statuses.SENT)

    def test_open_smtp_plain_fallback_when_no_starttls(self):
        """587 without STARTTLS must still log in (flagged in the log)."""
        server = mock.MagicMock()
        server.has_extn.return_value = False  # no STARTTLS advertised
        with mock.patch('core.mailer.smtplib.SMTP', return_value=server):
            with self.assertLogs('core.mailer', level='WARNING'):
                conn = _open_smtp(type('S', (), {'smtp_host': 'smtp.plain.test', 'smtp_port': 587,
                                                 'smtp_user': 'u@x.com', 'smtp_password': 'p'})())
        self.assertIs(conn, server)
        server.starttls.assert_not_called()
        server.login.assert_called_once_with('u@x.com', 'p')

    def test_open_smtp_starttls_when_available(self):
        server = mock.MagicMock()
        server.has_extn.return_value = True
        with mock.patch('core.mailer.smtplib.SMTP', return_value=server):
            conn = _open_smtp(type('S', (), {'smtp_host': 'smtp.tls.test', 'smtp_port': 587,
                                             'smtp_user': 'u@x.com', 'smtp_password': 'p'})())
        self.assertIs(conn, server)
        server.starttls.assert_called_once()
