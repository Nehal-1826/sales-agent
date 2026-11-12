"""Deliverability: outbox queue, caps, warmup ramp, sending window, rotation,
auto-pause, DNS check and WarmPulse sync.  No network: SMTP, DNS and
WarmPulse are mocked."""

import smtplib
from datetime import date, datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import outbox
from core.models import AppSettings, EmailDraft, Mailbox, Suppression, User, Workspace
from core.serializers import MASK
from core.tenancy import workspace_context

from .base import TenantTestCase

IST = ZoneInfo('Asia/Kolkata')
WED_10 = datetime(2026, 11, 4, 10, 0, tzinfo=IST)  # a Wednesday, inside 9–18


class Clock:
    """Patches django.utils.timezone.now (every module calls it through the
    timezone module, auto_now fields too)."""

    def __init__(self, testcase, start):
        self.now = start
        p = mock.patch('django.utils.timezone.now', side_effect=lambda: self.now)
        p.start()
        testcase.addCleanup(p.stop)

    def advance(self, **kw):
        self.now = self.now + timedelta(**kw)
        return self.now


class OutboxBase(TenantTestCase):
    def setUp(self):
        self.clock = Clock(self, WED_10)
        AppSettings.load()
        self.conn = mock.MagicMock()
        p = mock.patch('core.outbox.open_mailbox_connection', return_value=self.conn)
        self.open_conn = p.start()
        self.addCleanup(p.stop)

    def mailbox(self, email='a@sender.com', cap=30, ramp_start=None, **kw):
        return Mailbox.objects.create(from_email=email, daily_cap=cap, ramp_start=ramp_start,
                                      smtp_host='smtp.sender.com', smtp_user=email,
                                      smtp_password='secret-pass', **kw)

    def draft(self, to='lead@prospect.com', status=EmailDraft.Statuses.DRAFT, **kw):
        return EmailDraft.objects.create(company='Prospect', to_email=to, subject='Hi',
                                         body='Hello there', status=status, **kw)

    def sent(self, mb, n, at=None, bounced=0):
        at = at or self.clock.now
        for i in range(n):
            self.draft(to=f's{i}@x.com', status=EmailDraft.Statuses.SENT, mailbox=mb,
                       sent_at=at, bounced_at=at if i < bounced else None)


class RampAndWindowTests(OutboxBase):
    def test_ramp_math(self):
        d0 = date(2026, 11, 1)
        self.assertEqual(outbox.ramp_cap(30, d0, d0), 5)
        self.assertEqual(outbox.ramp_cap(30, d0, d0 + timedelta(days=7)), 5 + 25 * 7 // 14)
        self.assertEqual(outbox.ramp_cap(30, d0, d0 + timedelta(days=14)), 30)
        self.assertEqual(outbox.ramp_cap(30, d0, d0 + timedelta(days=40)), 30)
        self.assertEqual(outbox.ramp_cap(30, None, d0), 30)  # no ramp = full cap
        self.assertEqual(outbox.ramp_cap(3, d0, d0), 3)      # cap below the floor
        # still warming (WarmPulse) holds the ramp below the full cap
        self.assertLess(outbox.ramp_cap(30, d0, d0 + timedelta(days=40), keep_ramp=True), 30)
        self.assertEqual(outbox.ramp_cap(30, None, d0, keep_ramp=True), 5)

    def test_sending_window(self):
        s = AppSettings.load()
        self.assertTrue(outbox.in_window(WED_10, s))
        self.assertFalse(outbox.in_window(WED_10.replace(hour=8), s))
        self.assertFalse(outbox.in_window(WED_10.replace(hour=18), s))  # end exclusive
        saturday = datetime(2026, 11, 7, 10, 0, tzinfo=IST)
        self.assertFalse(outbox.in_window(saturday, s))
        self.assertEqual(outbox.next_window_start(WED_10.replace(hour=20), s),
                         datetime(2026, 11, 5, 9, 0, tzinfo=IST))
        friday_late = datetime(2026, 11, 6, 19, 0, tzinfo=IST)
        self.assertEqual(outbox.next_window_start(friday_late, s),
                         datetime(2026, 11, 9, 9, 0, tzinfo=IST))  # Monday
        s.send_weekdays_only = False
        self.assertTrue(outbox.in_window(saturday, s))

    def test_drain_outside_window_sends_nothing(self):
        mb = self.mailbox()
        d = self.draft(status=EmailDraft.Statuses.QUEUED, mailbox=mb,
                       scheduled_for=self.clock.now)
        self.clock.now = WED_10.replace(hour=21)
        outbox.drain_outbox()
        self.conn.send_message.assert_not_called()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.QUEUED)


class QueueAndCapTests(OutboxBase):
    def test_approve_queues_with_mailbox_and_spacing(self):
        mb = self.mailbox()
        a, b = self.draft(), self.draft(to='two@prospect.com')
        qa, qb = outbox.enqueue_draft(a.pk), outbox.enqueue_draft(b.pk)
        self.assertEqual(qa.status, EmailDraft.Statuses.QUEUED)
        self.assertEqual(qa.mailbox_id, mb.pk)
        gap = (qb.scheduled_for - qa.scheduled_for).total_seconds()
        self.assertGreaterEqual(gap, outbox.JITTER_MIN)
        self.assertLessEqual(gap, outbox.JITTER_MAX)
        self.assertIsNone(outbox.enqueue_draft(a.pk))  # already claimed: no second queue

    def test_cap_respected_and_overflow_waits_for_next_day(self):
        mb = self.mailbox(cap=2)
        drafts = [self.draft(to=f'p{i}@prospect.com') for i in range(4)]
        for d in drafts:
            outbox.enqueue_draft(d.pk)
        for _ in range(10):  # many drains over the day
            self.clock.advance(minutes=10)
            outbox.drain_outbox()
        self.assertEqual(self.conn.send_message.call_count, 2)
        self.assertEqual(outbox.sent_on(mb, WED_10.date()), 2)
        waiting = EmailDraft.objects.filter(status=EmailDraft.Statuses.QUEUED)
        self.assertEqual(waiting.count(), 2)
        for d in waiting:
            self.assertGreater(outbox.local(d.scheduled_for).date(), WED_10.date())

    def test_drain_never_exceeds_cap_even_if_overbooked(self):
        mb = self.mailbox(cap=1)
        self.sent(mb, 1)
        d = self.draft(status=EmailDraft.Statuses.QUEUED, mailbox=mb, scheduled_for=self.clock.now)
        outbox.drain_outbox()
        self.conn.send_message.assert_not_called()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.QUEUED)
        self.assertGreater(outbox.local(d.scheduled_for).date(), WED_10.date())

    def test_one_smtp_login_per_mailbox_per_drain(self):
        mb = self.mailbox()
        for i in range(3):
            self.draft(to=f'p{i}@prospect.com', status=EmailDraft.Statuses.QUEUED, mailbox=mb,
                       scheduled_for=self.clock.now)
        outbox.drain_outbox()
        self.assertEqual(self.open_conn.call_count, 1)
        self.assertEqual(self.conn.send_message.call_count, 3)
        sent = EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT, mailbox=mb).first()
        self.assertTrue(sent.message_id.endswith('@sender.com>'))

    def test_backlog_is_respaced_not_burst(self):
        mb = self.mailbox()
        for i in range(5):
            self.draft(to=f'p{i}@prospect.com', status=EmailDraft.Statuses.QUEUED, mailbox=mb,
                       scheduled_for=self.clock.now - timedelta(hours=3))
        outbox.drain_outbox()
        self.assertEqual(self.conn.send_message.call_count, 1)

    def test_rotation_picks_most_capacity(self):
        small = self.mailbox('small@sender.com', cap=10)
        big = self.mailbox('big@sender.com', cap=30)
        self.assertEqual(outbox.pick_mailbox().pk, big.pk)
        self.sent(big, 25)  # 5 left vs 10 left
        self.assertEqual(outbox.pick_mailbox().pk, small.pk)
        d = outbox.enqueue_draft(self.draft().pk)
        self.assertEqual(d.mailbox_id, small.pk)

    def test_legacy_appsettings_smtp_becomes_a_mailbox(self):
        s = AppSettings.load()
        s.smtp_host, s.smtp_user, s.smtp_password = 'smtp.old.com', 'me@old.com', 'pw'
        s.save(update_fields=['smtp_host', 'smtp_user', 'smtp_password'])
        d = outbox.enqueue_draft(self.draft().pk)
        mb = Mailbox.objects.get()
        self.assertEqual(d.mailbox_id, mb.pk)
        self.assertIsNone(mb.ramp_start)  # established account: no ramp

    def test_console_mode_queues_then_logs_not_delivers(self):
        d = outbox.enqueue_draft(self.draft().pk)
        self.assertIsNone(d.mailbox_id)
        with mock.patch('core.mailer._log_console_delivery') as logged:
            outbox.drain_outbox()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.SENT)
        self.assertEqual(d.sent_via, EmailDraft.Via.CONSOLE)
        logged.assert_called_once()


class SafetyTests(OutboxBase):
    def test_auth_failure_pauses_mailbox_and_reassigns(self):
        bad = self.mailbox('bad@sender.com')
        good = self.mailbox('good@sender.com')
        d = self.draft(status=EmailDraft.Statuses.QUEUED, mailbox=bad, scheduled_for=self.clock.now)

        def open_conn(mb):
            if mb.pk == bad.pk:
                raise smtplib.SMTPAuthenticationError(535, b'bad credentials')
            return self.conn
        self.open_conn.side_effect = open_conn
        outbox.drain_outbox()
        bad.refresh_from_db()
        self.assertTrue(outbox.is_paused(bad))
        self.assertEqual(bad.paused_reason, outbox.AUTH_PAUSE_REASON)
        d.refresh_from_db()
        # never failed or lost: handed to the healthy mailbox (which may send it
        # in the same drain)
        self.assertIn(d.status, (EmailDraft.Statuses.QUEUED, EmailDraft.Statuses.SENT))
        self.assertEqual(d.mailbox_id, good.pk)
        self.assertEqual(self.conn.send_message.call_count,
                         1 if d.status == EmailDraft.Statuses.SENT else 0)
        # paused mailboxes get no new assignments
        self.assertEqual(outbox.pick_mailbox().pk, good.pk)

    def test_bounce_rate_over_3_percent_pauses(self):
        mb = self.mailbox(cap=100)
        self.sent(mb, 50, at=self.clock.now - timedelta(days=1), bounced=1)  # 2 %
        self.assertFalse(outbox.check_bounce_pause(mb))
        extra = EmailDraft.objects.filter(mailbox=mb, bounced_at__isnull=True).first()
        extra.bounced_at = self.clock.now  # 2 of 50 = 4 %
        extra.save(update_fields=['bounced_at'])
        self.assertEqual(outbox.bounce_rate(mb), (2, 50))
        self.assertTrue(outbox.check_bounce_pause(mb))
        mb.refresh_from_db()
        self.assertEqual(mb.paused_reason, outbox.BOUNCE_PAUSE_REASON)
        self.assertIsNone(outbox.pick_mailbox())
        outbox.resume_mailbox(mb)  # resume restarts the bounce window
        self.assertEqual(outbox.bounce_rate(mb), (0, 0))

    def test_suppression_rechecked_at_drain(self):
        self.mailbox()
        d = outbox.enqueue_draft(self.draft().pk)
        Suppression.add('LEAD@prospect.com')  # unsubscribed after approval
        self.clock.advance(hours=1)
        outbox.drain_outbox()
        self.conn.send_message.assert_not_called()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.REJECTED)

    def test_two_drains_never_double_send(self):
        mb = self.mailbox()
        d = self.draft(status=EmailDraft.Statuses.QUEUED, mailbox=mb, scheduled_for=self.clock.now)
        self.assertTrue(outbox.claim_queued(d.pk))
        self.assertFalse(outbox.claim_queued(d.pk))  # second drain loses the claim
        EmailDraft.objects.filter(pk=d.pk).update(status=EmailDraft.Statuses.QUEUED)
        # a second drain starting while the first is mid-send finds nothing to send
        nested = []
        real_send = self.conn.send_message

        def send_and_drain(msg):
            if not nested:
                nested.append(outbox.drain_outbox())
            return real_send(msg)
        self.conn.send_message = mock.MagicMock(side_effect=send_and_drain)
        outbox.drain_outbox()
        self.assertEqual(self.conn.send_message.call_count, 1)
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.SENT)

    def test_crashed_sender_is_requeued_not_stuck(self):
        mb = self.mailbox()
        d = self.draft(status=EmailDraft.Statuses.APPROVED, mailbox=mb, scheduled_for=self.clock.now)
        self.clock.advance(minutes=20)  # past STUCK_AFTER
        outbox.drain_outbox()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.SENT)

    def test_assignment_error_still_leaves_draft_queued(self):
        self.mailbox()
        with mock.patch('core.outbox.assign', side_effect=RuntimeError('boom')):
            d = outbox.enqueue_draft(self.draft().pk)
        self.assertEqual(d.status, EmailDraft.Statuses.QUEUED)
        self.clock.advance(minutes=10)
        outbox.drain_outbox()  # orphan gets a mailbox, then goes out
        self.clock.advance(minutes=5)
        outbox.drain_outbox()
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.SENT)

    def test_queued_draft_can_be_rejected_before_it_leaves(self):
        user = User.objects.create_user(username='own', password='pw123456', role='owner')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        self.mailbox()
        d = outbox.enqueue_draft(self.draft().pk)
        self.assertEqual(client.post(f'/api/drafts/{d.pk}/reject/').status_code, 200)
        self.clock.advance(hours=1)
        outbox.drain_outbox()
        self.conn.send_message.assert_not_called()


class FakeTxt:
    def __init__(self, text):
        self.strings = [text.encode()]


class FakeMx:
    def __init__(self, host):
        self.exchange = host + '.'


class FakeResolver:
    def __init__(self, records):
        self.records = records

    def resolve(self, name, rtype, lifetime=None):
        key = (name, rtype)
        if key not in self.records:
            raise Exception('NXDOMAIN')
        if rtype == 'MX':
            return [FakeMx(h) for h in self.records[key]]
        return [FakeTxt(t) for t in self.records[key]]


class DnsCheckTests(OutboxBase):
    def test_all_records_found(self):
        from core.dns_check import check_domain
        resolver = FakeResolver({
            ('sender.com', 'TXT'): ['v=spf1 include:_spf.google.com ~all', 'google-site=x'],
            ('_dmarc.sender.com', 'TXT'): ['v=DMARC1; p=quarantine; rua=mailto:d@sender.com'],
            ('google._domainkey.sender.com', 'TXT'): ['v=DKIM1; k=rsa; p=MIIB'],
            ('sender.com', 'MX'): ['aspmx.l.google.com'],
        })
        with mock.patch('core.dns_check._resolver', return_value=resolver):
            r = check_domain('sender.com')
        self.assertTrue(r['spf']['ok'])
        self.assertTrue(r['dmarc']['ok'])
        self.assertEqual(r['dmarc']['policy'], 'quarantine')
        self.assertEqual(r['dkim']['selectors'], ['google'])
        self.assertTrue(r['mx']['ok'])

    def test_missing_records_give_hints_and_never_raise(self):
        from core.dns_check import check_domain
        with mock.patch('core.dns_check._resolver', return_value=FakeResolver({})):
            r = check_domain('sender.com')
        for key in ('spf', 'dkim', 'dmarc', 'mx'):
            self.assertFalse(r[key]['ok'])
            self.assertTrue(r[key]['hint'])
        with mock.patch('core.dns_check._resolver', side_effect=RuntimeError('no dns')):
            self.assertIn('error', check_domain('sender.com'))
        self.assertIn('error', check_domain(''))

    def test_endpoint_stores_result(self):
        user = User.objects.create_user(username='own', password='pw123456', role='owner')
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        mb = self.mailbox()
        with mock.patch('core.dns_check._resolver', return_value=FakeResolver({})):
            r = client.post(f'/api/mailboxes/{mb.pk}/dns_check/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['dns']['spf']['ok'])
        mb.refresh_from_db()
        self.assertIsNotNone(mb.dns_checked_at)


class WarmPulseTests(OutboxBase):
    def _resp(self, items):
        resp = mock.MagicMock(status_code=200)
        resp.json.return_value = {'items': items, 'page': 1, 'page_size': 100, 'total': len(items)}
        return resp

    def test_blank_key_is_a_noop(self):
        from core import warmpulse
        with mock.patch('core.warmpulse.requests.get') as get:
            self.assertIsNone(warmpulse.sync(force=True))
        get.assert_not_called()

    def test_sync_matches_by_email_and_holds_ramp(self):
        from core import warmpulse
        s = AppSettings.load()
        s.warmpulse_api_key = 'wp_live_abc'
        s.save(update_fields=['warmpulse_api_key'])
        mb = self.mailbox('Warm@Sender.com', cap=30)
        other = self.mailbox('cold@sender.com', cap=30)
        items = [{'email_address': 'warm@sender.com', 'warmup_status': 'active', 'warmth_score': 55.0},
                 {'email_address': 'unknown@x.com', 'warmup_status': 'completed', 'warmth_score': 99}]
        with mock.patch('core.warmpulse.requests.get', return_value=self._resp(items)) as get:
            self.assertEqual(warmpulse.sync(force=True), 1)
            self.assertIsNone(warmpulse.sync())  # hourly throttle
        self.assertEqual(get.call_count, 1)
        self.assertEqual(get.call_args.kwargs['headers']['Authorization'], 'Bearer wp_live_abc')
        self.assertTrue(get.call_args.args[0].endswith('/api/workspace/mailboxes'))
        mb.refresh_from_db()
        self.assertEqual(mb.warmup_status, 'active')
        self.assertTrue(warmpulse.still_warming(mb))
        self.assertEqual(outbox.effective_cap(mb), 5)      # still warming → ramp cap
        self.assertEqual(outbox.effective_cap(other), 30)  # unmatched → unaffected

    def test_http_error_never_raises(self):
        from core import warmpulse
        s = AppSettings.load()
        s.warmpulse_api_key = 'wp_live_abc'
        s.save(update_fields=['warmpulse_api_key'])
        with mock.patch('core.warmpulse.requests.get', side_effect=OSError('down')):
            self.assertIsNone(warmpulse.sync(force=True))


class MailboxApiTests(OutboxBase):
    def setUp(self):
        super().setUp()
        self.owner = User.objects.create_user(username='own', password='pw123456', role='owner')
        self.member = User.objects.create_user(username='mem', password='pw123456', role='member')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')
        self.mclient = APIClient()
        self.mclient.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.member).key}')

    def test_crud_masks_password(self):
        r = self.client.post('/api/mailboxes/', {
            'fromEmail': 'Sales@Sender.com', 'smtpHost': 'smtp.sender.com', 'smtpPort': 587,
            'smtpUser': 'sales@sender.com', 'smtpPassword': 'topsecret99', 'dailyCap': 25,
        }, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body['fromEmail'], 'sales@sender.com')
        self.assertEqual(body['smtpPassword'], MASK + 'et99')
        self.assertNotIn('topsecret99', r.content.decode())
        self.assertEqual(body['effectiveCap'], 5)  # new mailbox starts on the ramp
        mb_id = body['id']
        r = self.client.patch(f'/api/mailboxes/{mb_id}/', {'smtpPassword': MASK + 'et99',
                                                           'dailyCap': 40}, format='json')
        self.assertEqual(r.status_code, 200)
        mb = Mailbox.objects.get(pk=mb_id)
        self.assertEqual(mb.smtp_password, 'topsecret99')  # masked echo never overwrites
        self.assertEqual(mb.daily_cap, 40)
        self.assertEqual(self.client.delete(f'/api/mailboxes/{mb_id}/').status_code, 204)

    def test_member_reads_but_cannot_write(self):
        mb = self.mailbox()
        self.assertEqual(self.mclient.get('/api/mailboxes/').status_code, 200)
        self.assertEqual(self.mclient.post('/api/mailboxes/', {'fromEmail': 'x@y.com'},
                                           format='json').status_code, 403)
        self.assertEqual(self.mclient.post(f'/api/mailboxes/{mb.pk}/resume/').status_code, 403)

    def test_resume_unpauses(self):
        mb = self.mailbox()
        outbox.pause_mailbox(mb, 'test')
        r = self.client.post(f'/api/mailboxes/{mb.pk}/resume/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['paused'])

    def test_approve_returns_queued_and_status_counts(self):
        mb = self.mailbox(cap=10)
        d = self.draft()
        r = self.client.post(f'/api/drafts/{d.pk}/approve/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['status'], 'Queued')
        self.assertTrue(r.json()['scheduledFor'])
        self.assertEqual(r.json()['mailbox'], mb.from_email)
        st = self.client.get('/api/outreach/status/').json()
        self.assertEqual(st['queued'], 1)
        self.assertEqual(st['mailboxes'][0]['sentToday'], 0)
        self.assertEqual(st['mailboxes'][0]['cap'], 10)

    def test_settings_outbox_window_and_warmpulse_key_masked(self):
        r = self.client.put('/api/settings/', {
            'outbox': {'windowStart': 10, 'windowEnd': 17, 'weekdaysOnly': False},
            'warmpulse': {'apiKey': 'wp_live_secretkey'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['outbox'], {'windowStart': 10, 'windowEnd': 17, 'weekdaysOnly': False})
        self.assertEqual(r.json()['warmpulse']['apiKey'], MASK + 'tkey')
        bad = self.client.put('/api/settings/', {'outbox': {'windowStart': 18, 'windowEnd': 9}},
                              format='json')
        self.assertEqual(bad.status_code, 400)
        self.client.put('/api/settings/', {'warmpulse': {'apiKey': MASK + 'tkey'}}, format='json')
        self.assertEqual(AppSettings.load().warmpulse_api_key, 'wp_live_secretkey')

    def test_connect_mailbox_creates_mailbox(self):
        with mock.patch('core.mailer.verify_smtp', return_value=''):
            r = self.client.post('/api/settings/smtp_connect/', {
                'provider': 'gmail', 'user': 'me@sender.com', 'password': 'app-pw'}, format='json')
        self.assertTrue(r.json()['ok'], r.content)
        mb = Mailbox.objects.get(from_email='me@sender.com')
        self.assertEqual(mb.smtp_host, 'smtp.gmail.com')


class TenantIsolationTests(OutboxBase):
    def setUp(self):
        super().setUp()
        self.other = Workspace.all_tenants.create(slug='other', name='Other Co')
        with workspace_context(self.other):
            self.foreign = Mailbox.objects.create(from_email='them@other.com', smtp_host='h',
                                                  smtp_user='u', smtp_password='p')
        owner = User.objects.create_user(username='own', password='pw123456', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}')

    def test_other_workspace_mailbox_invisible_and_unusable(self):
        self.assertEqual(self.client.get('/api/mailboxes/').json(), [])
        self.assertEqual(self.client.get(f'/api/mailboxes/{self.foreign.pk}/').status_code, 404)
        for path in ('dns_check/', 'resume/'):
            self.assertEqual(self.client.post(f'/api/mailboxes/{self.foreign.pk}/{path}').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/mailboxes/{self.foreign.pk}/', {'dailyCap': 1},
                                           format='json').status_code, 404)
        self.assertIsNone(outbox.pick_mailbox())
        d = outbox.enqueue_draft(self.draft().pk)
        self.assertIsNone(d.mailbox_id)  # console mode here, never the other tenant's box


class DataMigrationTests(TenantTestCase):
    def test_migration_creates_mailbox_from_appsettings(self):
        import importlib

        from django.apps import apps
        mig = importlib.import_module('core.migrations.0028_mailbox_from_appsettings')
        s = AppSettings.load()
        s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_password = 'smtp.zoho.in', 587, 'me@co.com', 'pw'
        s.from_email = 'sales@co.com'
        s.save(update_fields=['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'from_email'])
        mig.forwards(apps, None)
        mig.forwards(apps, None)  # idempotent
        mb = Mailbox.objects.get()
        self.assertEqual((mb.from_email, mb.smtp_host, mb.smtp_password),
                         ('sales@co.com', 'smtp.zoho.in', 'pw'))
        self.assertIsNone(mb.ramp_start)
