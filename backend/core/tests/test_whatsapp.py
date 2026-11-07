"""WhatsApp: approval always required, daily cap + window, phone
normalization, sidecar-down = pending, wa.me fallback, opt-out, tenancy.
The sidecar is mocked — no network."""

from datetime import timedelta
from unittest import mock

import requests
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import sequences, whatsapp
from core.models import (AppSettings, Enrollment, Lead, OutreachTask, Suppression, User,
                         WhatsAppMessage, Workspace)
from core.tenancy import workspace_context

from .test_deliverability import WED_10, Clock
from .base import TenantTestCase

W = WhatsAppMessage.Statuses


def ok_response(payload=None, code=200):
    r = mock.MagicMock(status_code=code)
    r.json.return_value = payload or {'ok': True}
    return r


class PhoneTests(TenantTestCase):
    def test_normalize(self):
        n = whatsapp.normalize_phone
        self.assertEqual(n('98765 43210'), '+919876543210')            # India default
        self.assertEqual(n('098765-43210', 'India'), '+919876543210')  # trunk 0
        self.assertEqual(n('+91 98765 43210'), '+919876543210')
        self.assertEqual(n('91 98765 43210', 'India'), '+919876543210')
        self.assertEqual(n('0044 20 7946 0958'), '+442079460958')
        self.assertEqual(n('(415) 555-0100', 'United States'), '+14155550100')
        self.assertEqual(n('044 2345 6789', '', 'Tamil Nadu'), '+914423456789')
        self.assertEqual(n('12345'), '')
        self.assertEqual(n(''), '')

    def test_wa_me_link(self):
        self.assertEqual(whatsapp.wa_me_link('+919876543210', 'Hi & bye'),
                         'https://wa.me/919876543210?text=Hi%20%26%20bye')


class WhatsAppBase(TenantTestCase):
    def setUp(self):
        self.clock = Clock(self, WED_10)
        AppSettings.load()
        AppSettings.objects.update(whatsapp_enabled=True, whatsapp_secret='s3cret',
                                   whatsapp_sidecar_url='http://sidecar:8002')
        p = mock.patch('core.whatsapp.requests.request', return_value=ok_response())
        self.req = p.start()
        self.addCleanup(p.stop)
        self.lead = Lead.objects.create(company='Acme', contact_phone='98765 43210', country='India')

    def msg(self, **kw):
        return WhatsAppMessage.objects.create(lead=self.lead, company='Acme',
                                              to_phone=kw.pop('to', '+919876543210'), text='Hi', **kw)

    def approve_and_drain(self, m):
        whatsapp.approve_message(m.pk)
        self.clock.advance(minutes=5)
        whatsapp.drain_whatsapp()
        m.refresh_from_db()
        return m


class ApprovalAndSendTests(WhatsAppBase):
    def test_draft_never_sends_without_approval(self):
        m = self.msg()
        self.clock.advance(days=1)
        whatsapp.drain_whatsapp()
        m.refresh_from_db()
        self.assertEqual(m.status, W.DRAFT)
        self.req.assert_not_called()

    def test_approve_then_send_with_secret(self):
        m = self.approve_and_drain(self.msg())
        self.assertEqual(m.status, W.SENT)
        _method, url = self.req.call_args.args
        self.assertEqual(url, 'http://sidecar:8002/send')
        self.assertEqual(self.req.call_args.kwargs['headers'][whatsapp.SECRET_HEADER], 's3cret')
        self.assertEqual(self.req.call_args.kwargs['json'], {'to': '+919876543210', 'text': 'Hi'})

    def test_step_needs_approval_even_with_auto_approve(self):
        AppSettings.objects.update(followups_auto_approve=True)
        seq = sequences.ensure_default_sequence()
        seq.steps.exclude(channel='whatsapp').update(enabled=False)
        seq.steps.filter(channel='whatsapp').update(enabled=True)
        enr = Enrollment.objects.create(lead=self.lead, sequence=seq, next_due_at=self.clock.now)
        sequences.tick()
        m = WhatsAppMessage.objects.get(enrollment=enr)
        self.assertEqual(m.status, W.DRAFT)
        self.assertEqual(m.to_phone, '+919876543210')

    def test_sidecar_down_stays_pending(self):
        self.req.side_effect = requests.ConnectionError('refused')
        m = self.approve_and_drain(self.msg())
        self.assertEqual(m.status, W.QUEUED)
        self.assertIn('not reachable', m.error)
        self.assertGreater(m.scheduled_for, self.clock.now)
        st = whatsapp.sidecar_status()
        self.assertFalse(st['reachable'])

    def test_outside_window_waits(self):
        self.clock.now = WED_10.replace(hour=20)
        m = self.approve_and_drain(self.msg())
        self.assertEqual(m.status, W.QUEUED)
        self.req.assert_not_called()

    def test_daily_cap(self):
        AppSettings.objects.update(whatsapp_daily_cap=2)
        for i in range(2):
            self.msg(status=W.SENT, sent_at=self.clock.now - timedelta(minutes=30 + i))
        m = self.approve_and_drain(self.msg())
        self.assertEqual(m.status, W.QUEUED)
        self.assertIn('limit', m.error)
        self.req.assert_not_called()

    def test_disabled_keeps_queue_with_error(self):
        AppSettings.objects.update(whatsapp_enabled=False)
        m = self.approve_and_drain(self.msg())
        self.assertEqual(m.status, W.QUEUED)
        self.assertEqual(m.error, whatsapp.DISABLED_ERROR)
        self.req.assert_not_called()

    def test_opted_out_number_rejected(self):
        m = self.msg()
        whatsapp.approve_message(m.pk)
        Suppression.add_phone('+919876543210')
        self.clock.advance(minutes=5)
        whatsapp.drain_whatsapp()
        m.refresh_from_db()
        self.assertEqual(m.status, W.REJECTED)
        self.req.assert_not_called()

    def test_stopped_enrollment_rejected_before_send(self):
        seq = sequences.ensure_default_sequence()
        enr = Enrollment.objects.create(lead=self.lead, sequence=seq)
        m = self.msg(enrollment=enr)
        whatsapp.approve_message(m.pk)
        Enrollment.objects.filter(pk=enr.pk).update(status='stopped')
        self.clock.advance(minutes=5)
        whatsapp.drain_whatsapp()
        m.refresh_from_db()
        self.assertEqual(m.status, W.REJECTED)
        self.req.assert_not_called()


class FallbackAndApiTests(WhatsAppBase):
    def test_sidecar_off_creates_wa_me_task(self):
        AppSettings.objects.update(whatsapp_enabled=False)
        seq = sequences.ensure_default_sequence()
        seq.steps.exclude(channel='whatsapp').update(enabled=False)
        seq.steps.filter(channel='whatsapp').update(enabled=True)
        Enrollment.objects.create(lead=self.lead, sequence=seq, next_due_at=self.clock.now)
        sequences.tick()
        self.assertFalse(WhatsAppMessage.objects.exists())
        t = OutreachTask.objects.get(channel=OutreachTask.Channels.WHATSAPP)
        self.assertTrue(t.url.startswith('https://wa.me/919876543210?text='))

    def api(self):
        user = User.objects.create_user('o', password='pw-12345678', role='owner', workspace=self.workspace)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key)
        return c

    def test_api_approve_optout_and_masked_secret(self):
        c = self.api()
        m = self.msg()
        url = '/api/whatsapp/messages/%d/approve/' % m.pk
        r = c.post(url)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], 'queued')
        r = c.post('/api/whatsapp/opt_out/', {'leadId': self.lead.pk}, format='json')
        self.assertEqual(r.json()['phone'], '+919876543210')
        m.refresh_from_db()
        self.assertEqual(m.status, W.REJECTED)
        s = c.get('/api/settings/').json()['whatsapp']
        self.assertNotIn('s3cret', s['secret'])
        c.put('/api/settings/', {'whatsapp': {'secret': s['secret'], 'dailyCap': 5}}, format='json')
        self.assertEqual(AppSettings.load().whatsapp_secret, 's3cret')
        self.assertEqual(AppSettings.load().whatsapp_daily_cap, 5)

    def test_status_and_qr(self):
        self.req.return_value = ok_response({'state': 'CONNECTED', 'connected': True, 'qr': 'data:x'})
        c = self.api()
        self.assertTrue(c.get('/api/whatsapp/status/').json()['connected'])
        self.assertEqual(c.get('/api/whatsapp/qr/').json()['qr'], 'data:x')

    def test_tenant_isolation(self):
        self.msg()
        other = Workspace.all_tenants.create(slug='other-wa', name='Other')
        with workspace_context(other):
            self.assertFalse(WhatsAppMessage.objects.exists())
            AppSettings.load()
            whatsapp.drain_whatsapp()
        self.req.assert_not_called()
