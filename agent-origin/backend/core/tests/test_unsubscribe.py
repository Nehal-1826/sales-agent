"""Compliance: every cold email carries an opt-out, and an opt-out is permanent."""
from unittest import mock

from django.test import Client

from core.mailer import (SUPPRESSED_ERROR, read_unsubscribe_token, send_draft,
                         unsubscribe_token, unsubscribe_url)
from core.models import AppSettings, EmailDraft, Suppression, Workspace
from core.tenancy import workspace_context
from core.tests.base import TenantTestCase


def _smtp_capture():
    """Patch the SMTP connection; returns (patcher, list of sent messages)."""
    sent = []
    server = mock.MagicMock()
    server.__enter__.return_value = server
    server.send_message.side_effect = sent.append
    return mock.patch('core.mailer._open_smtp', return_value=server), sent


class UnsubscribeTokenTests(TenantTestCase):
    def test_roundtrip_normalizes_email(self):
        token = unsubscribe_token('  Info@Harbor.COM ', self.workspace.pk)
        self.assertEqual(read_unsubscribe_token(token), (self.workspace.pk, 'info@harbor.com'))

    def test_tampered_token_is_rejected(self):
        token = unsubscribe_token('a@b.com', self.workspace.pk)
        self.assertIsNone(read_unsubscribe_token(token[:-2] + 'xx'))
        self.assertIsNone(read_unsubscribe_token('garbage'))


class ColdEmailComplianceTests(TenantTestCase):
    def setUp(self):
        s = AppSettings.load()
        s.smtp_host, s.smtp_user, s.smtp_password = 'smtp.test', 'me@seller.com', 'pw'
        s.company_name, s.company_address = 'Seller Co', '1 Main St, Salem 636004, India'
        s.save(update_fields=['smtp_host', 'smtp_user', 'smtp_password',
                              'company_name', 'company_address'])
        self.draft = EmailDraft.objects.create(company='Harbor', to_email='info@harbor.com',
                                               subject='Hi', body='Hello there.\n\nBest,\nSeller Co')

    def test_sent_email_has_one_click_headers_and_footer(self):
        patcher, sent = _smtp_capture()
        with patcher:
            send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.SENT)
        msg = sent[0]
        url = unsubscribe_url('info@harbor.com', self.workspace.pk)
        self.assertEqual(msg['List-Unsubscribe'], f'<{url}>')
        self.assertEqual(msg['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
        text = msg.get_body(('plain',)).get_content()
        html = msg.get_body(('html',)).get_content()
        for part in (text, html):
            self.assertIn('1 Main St, Salem 636004, India', part)
            self.assertIn('Unsubscribe', part)
        self.assertIn(url, text)

    def test_suppressed_recipient_is_never_sent(self):
        Suppression.add('INFO@harbor.com')
        patcher, sent = _smtp_capture()
        with patcher:
            send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(sent, [])
        self.assertEqual(self.draft.status, EmailDraft.Statuses.REJECTED)
        self.assertEqual(self.draft.error, SUPPRESSED_ERROR)

    def test_daily_report_path_has_no_unsubscribe_footer(self):
        from core.mailer import branded_email_html
        self.assertNotIn('Unsubscribe', branded_email_html('<p>report</p>'))


class UnsubscribeEndpointTests(TenantTestCase):
    def setUp(self):
        self.client = Client()
        self.url = f'/api/unsubscribe/{unsubscribe_token("info@harbor.com", self.workspace.pk)}/'
        self.pending = EmailDraft.objects.create(company='Harbor', to_email='Info@Harbor.com',
                                                 subject='Hi', body='x')

    def test_get_only_confirms_never_writes(self):
        # link scanners prefetch GET — it must not unsubscribe anyone
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '<form method="post">')
        self.assertFalse(Suppression.is_suppressed('info@harbor.com'))

    def test_post_suppresses_and_rejects_pending_drafts(self):
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Suppression.is_suppressed('info@harbor.com'))
        self.pending.refresh_from_db()
        self.assertEqual(self.pending.status, EmailDraft.Statuses.REJECTED)
        self.assertEqual(Suppression.objects.get().source, 'link')

    def test_rfc8058_one_click_post(self):
        resp = self.client.post(self.url, 'List-Unsubscribe=One-Click',
                                content_type='application/x-www-form-urlencoded')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Suppression.objects.get().source, 'one-click')

    def test_repeat_post_is_idempotent(self):
        self.client.post(self.url)
        self.client.post(self.url)
        self.assertEqual(Suppression.objects.count(), 1)

    def test_bad_token_is_400_and_writes_nothing(self):
        resp = self.client.post('/api/unsubscribe/not-a-token/')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Suppression.objects.count(), 0)

    def test_suppression_stays_in_its_own_workspace(self):
        other = Workspace.all_tenants.create(slug='other', name='Other Co')
        with workspace_context(other):
            other_draft = EmailDraft.objects.create(company='Harbor', to_email='info@harbor.com',
                                                    subject='Hi', body='x')
        self.client.post(self.url)  # token belongs to self.workspace
        with workspace_context(other):
            self.assertFalse(Suppression.is_suppressed('info@harbor.com'))
            other_draft.refresh_from_db()
            self.assertEqual(other_draft.status, EmailDraft.Statuses.DRAFT)
        self.assertTrue(Suppression.is_suppressed('info@harbor.com'))
