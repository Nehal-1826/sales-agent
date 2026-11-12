"""Reply + bounce ingestion (core.inbox).  No network: imaplib is fully
mocked with a fake IMAP server; the LLM is off unless a test patches it."""

from datetime import datetime, timedelta
from email.message import EmailMessage
from unittest import mock
from zoneinfo import ZoneInfo

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import inbox, mailer
from core.models import (AppSettings, EmailDraft, Lead, Mailbox, Potential, Reply, Suppression,
                         User, Workspace)
from core.tenancy import workspace_context

from .base import TenantTestCase

IST = ZoneInfo('Asia/Kolkata')
WED_10 = datetime(2026, 11, 4, 10, 0, tzinfo=IST)
OUR_ID = '<cold-1@sender.com>'
S = EmailDraft.Statuses


class FakeIMAP:
    """Minimal imaplib.IMAP4_SSL stand-in: {uid: raw bytes}."""

    def __init__(self, messages, validity='1'):
        self.messages = dict(messages)
        self.validity = validity
        self.fetched, self.calls = [], []

    def login(self, user, password):
        self.calls.append(('login', user))

    def select(self, mailbox, readonly=False):
        self.calls.append(('select', mailbox, readonly))
        return 'OK', [str(len(self.messages)).encode()]

    def response(self, code):
        return code, [self.validity.encode()]

    def uid(self, command, *args):
        self.calls.append((command,) + args)
        if command == 'SEARCH':
            crit = args[1:]
            uids = sorted(self.messages)
            if crit and crit[0] == 'UID':
                lo = int(crit[1].split(':')[0])
                # like a real server: N:* always includes the highest UID
                uids = [u for u in uids if u >= lo] or uids[-1:]
            return 'OK', [' '.join(map(str, uids)).encode()]
        if command == 'FETCH':
            assert 'PEEK' in args[1], 'must never mark mail as read'
            uid = int(args[0])
            self.fetched.append(uid)
            return 'OK', [(f'{uid} (UID {uid} BODY[] {{1}}'.encode(), self.messages[uid]), b')']
        raise AssertionError(f'unexpected IMAP command {command}')  # no STORE/COPY/EXPUNGE

    def logout(self):
        self.calls.append(('logout',))


def mail(frm='Jane Doe <lead@prospect.com>', subject='Re: Hi', body='Sounds good',
         in_reply_to=OUR_ID, msg_id='<their-1@prospect.com>', **headers):
    m = EmailMessage()
    m['From'] = frm
    m['To'] = 'a@sender.com'
    m['Subject'] = subject
    m['Message-ID'] = msg_id
    m['Date'] = 'Wed, 04 Nov 2026 09:00:00 +0000'
    if in_reply_to:
        m['In-Reply-To'] = in_reply_to
        m['References'] = in_reply_to
    for k, v in headers.items():
        m[k.replace('_', '-')] = v
    m.set_content(body)
    return m.as_bytes()


def dsn(recipient='lead@prospect.com', status='5.1.1', ref=OUR_ID):
    return (
        'From: Mail Delivery System <MAILER-DAEMON@mx.sender.com>\r\n'
        'To: a@sender.com\r\nSubject: Undelivered Mail Returned to Sender\r\n'
        'Message-ID: <dsn-1@mx.sender.com>\r\nAuto-Submitted: auto-replied\r\n'
        'MIME-Version: 1.0\r\n'
        'Content-Type: multipart/report; report-type=delivery-status; boundary="B"\r\n\r\n'
        '--B\r\nContent-Type: text/plain\r\n\r\nDelivery failed.\r\n'
        '--B\r\nContent-Type: message/delivery-status\r\n\r\n'
        'Reporting-MTA: dns; mx.sender.com\r\n\r\n'
        f'Final-Recipient: rfc822; {recipient}\r\nAction: failed\r\nStatus: {status}\r\n\r\n'
        '--B\r\nContent-Type: text/rfc822-headers\r\n\r\n'
        f'Message-ID: {ref}\r\nSubject: Hi\r\n\r\n--B--\r\n').encode()


class InboxBase(TenantTestCase):
    def setUp(self):
        p = mock.patch('django.utils.timezone.now', return_value=WED_10)
        p.start()
        self.addCleanup(p.stop)
        AppSettings.load()
        self.mb = Mailbox.objects.create(from_email='a@sender.com', smtp_host='smtp.zoho.in',
                                         smtp_user='a@sender.com', smtp_password='pw',
                                         ramp_start=None)
        self.lead = Lead.objects.create(company='Prospect', contact_email='lead@prospect.com')
        self.draft = EmailDraft.objects.create(
            company='Prospect', to_email='lead@prospect.com', subject='Hi', body='Hello',
            status=S.SENT, mailbox=self.mb, message_id=OUR_ID, lead=self.lead,
            sent_at=WED_10 - timedelta(days=1))

    def poll(self, messages, mailbox=None):
        self.imap = FakeIMAP(messages)
        with mock.patch('core.inbox.imaplib.IMAP4_SSL', return_value=self.imap):
            return inbox.poll_mailbox(mailbox or self.mb)


class MatchingTests(InboxBase):
    def test_reply_matched_by_in_reply_to(self):
        stats = self.poll({5: mail(frm='Other Name <someone.else@prospect.com>',
                                   body='Yes, interested. Let us talk.')})
        self.assertEqual(stats['replies'], 1)
        r = Reply.objects.get()
        self.assertEqual((r.draft, r.lead, r.mailbox), (self.draft, self.lead, self.mb))
        self.assertEqual(r.from_email, 'someone.else@prospect.com')
        self.assertEqual(r.message_id, '<their-1@prospect.com>')

    def test_fallback_by_sender_address(self):
        self.poll({5: mail(frm='LEAD@Prospect.com', in_reply_to=None, body='Interested!')})
        self.assertEqual(Reply.objects.get().draft, self.draft)

    def test_unrelated_mail_ignored(self):
        stats = self.poll({5: mail(frm='news@random.com', in_reply_to=None, body='Newsletter')})
        self.assertEqual(stats['ignored'], 1)
        self.assertFalse(Reply.objects.exists())

    def test_quoted_history_stripped(self):
        body = 'Interested, call me.\n\nOn Tue, 3 Nov 2026 at 10:00, A <a@sender.com> wrote:\n> Hello'
        self.poll({5: mail(body=body)})
        self.assertEqual(Reply.objects.get().body_text, 'Interested, call me.')

    def test_read_only_peek_and_imap_host_derived(self):
        self.poll({5: mail()})
        self.assertIn(('select', 'INBOX', True), self.imap.calls)
        self.assertEqual(inbox.imap_host_for(self.mb), 'imap.zoho.in')
        self.mb.smtp_host = 'smtp.gmail.com'
        self.assertEqual(inbox.imap_host_for(self.mb), 'imap.gmail.com')
        self.mb.imap_host = 'mail.custom.com'
        self.assertEqual(inbox.imap_host_for(self.mb), 'mail.custom.com')


class HighWaterMarkTests(InboxBase):
    def test_uid_mark_prevents_reprocessing(self):
        msgs = {5: mail(body='Interested')}
        self.poll(msgs)
        self.mb.refresh_from_db()
        self.assertEqual(self.mb.imap_last_uid, 5)
        self.poll(msgs, self.mb)  # server still returns UID 5 for "6:*"
        self.assertEqual(self.imap.fetched, [])
        self.assertEqual(Reply.objects.count(), 1)

    def test_cap_per_poll(self):
        msgs = {u: mail(msg_id=f'<m{u}@p.com>', in_reply_to=None, frm=f'x{u}@n.com')
                for u in range(1, 8)}
        with mock.patch.object(inbox, 'POLL_CAP', 3):
            self.imap = FakeIMAP(msgs)
            with mock.patch('core.inbox.imaplib.IMAP4_SSL', return_value=self.imap):
                inbox.poll_mailbox(self.mb, cap=3)
        self.mb.refresh_from_db()
        self.assertEqual(self.mb.imap_last_uid, 3)

    def test_connection_error_recorded_not_raised(self):
        with mock.patch('core.inbox.imaplib.IMAP4_SSL', side_effect=OSError('refused')):
            stats = inbox.poll_mailbox(self.mb)
        self.mb.refresh_from_db()
        self.assertIn('refused', stats['error'])
        self.assertIn('refused', self.mb.imap_error)
        self.assertIsNotNone(self.mb.imap_checked_at)


class BounceTests(InboxBase):
    def test_hard_bounce_suppresses_and_marks(self):
        with mock.patch('core.outbox.check_bounce_pause') as pause:
            stats = self.poll({7: dsn()})
        self.assertEqual(stats['bounces'], 1)
        self.draft.refresh_from_db()
        self.lead.refresh_from_db()
        self.assertIsNotNone(self.draft.bounced_at)
        self.assertEqual(Suppression.objects.get().reason, Suppression.Reasons.BOUNCE)
        self.assertTrue(self.lead.analysis['email_bounced'])
        self.assertEqual(self.lead.contact_email, 'lead@prospect.com')  # kept, but suppressed
        pause.assert_called_once()
        self.assertFalse(Reply.objects.exists())

    def test_hard_bounces_trigger_mailbox_pause(self):
        self.poll({7: dsn()})  # 1 bounce of 1 send = 100 % > 3 %
        self.mb.refresh_from_db()
        self.assertIsNotNone(self.mb.paused_until)

    def test_soft_bounce_only_logged(self):
        self.poll({7: dsn(status='4.2.2')})
        self.draft.refresh_from_db()
        self.assertIsNone(self.draft.bounced_at)
        self.assertIn('4.2.2', self.draft.error)
        self.assertFalse(Suppression.objects.exists())

    def test_bounce_matched_by_recipient_when_no_reference(self):
        self.poll({7: dsn(ref='<unknown@x>')})
        self.draft.refresh_from_db()
        self.assertIsNotNone(self.draft.bounced_at)


class ClassificationTests(InboxBase):
    def test_out_of_office_not_counted_as_reply(self):
        stats = self.poll({5: mail(subject='Out of Office: Re: Hi', body='I am away until Monday',
                                   Auto_Submitted='auto-replied')})
        self.assertEqual(stats['ooo'], 1)
        r = Reply.objects.get()
        self.assertEqual(r.classification, Reply.Classes.OUT_OF_OFFICE)
        self.assertTrue(r.handled)
        self.assertFalse(r.needs_attention)
        self.assertFalse(Suppression.objects.exists())

    def test_unsubscribe_reply_suppresses_and_rejects_queued(self):
        queued = EmailDraft.objects.create(company='Prospect', to_email='Lead@Prospect.com',
                                           subject='Follow up', body='b', status=S.QUEUED)
        pending = EmailDraft.objects.create(company='Prospect', to_email='lead@prospect.com',
                                            subject='Another', body='b', status=S.DRAFT)
        self.poll({5: mail(body='Please remove me from your list.')})
        r = Reply.objects.get()
        self.assertEqual(r.classification, Reply.Classes.UNSUBSCRIBE)
        self.assertTrue(r.handled)
        sup = Suppression.objects.get(email='lead@prospect.com')
        self.assertEqual((sup.reason, sup.source), (Suppression.Reasons.UNSUBSCRIBE, 'reply'))
        for d in (queued, pending):
            d.refresh_from_db()
            self.assertEqual(d.status, S.REJECTED)

    def test_unsubscribe_wins_even_if_llm_says_interested(self):
        with mock.patch('core.ai.llm_available', return_value=True), \
                mock.patch('core.ai.llm_complete',
                           return_value='{"classification": "interested", "confidence": 0.9}'):
            self.assertEqual(inbox.classify('stop emailing me')[0], Reply.Classes.UNSUBSCRIBE)

    def test_interested_gets_suggestion_and_advances_potential(self):
        self.poll({5: mail(body='Interested — can we set up a call next week?')})
        r = Reply.objects.get()
        self.assertEqual(r.classification, Reply.Classes.INTERESTED)
        self.assertIn('Hi Jane', r.suggested_reply)
        self.assertTrue(r.needs_attention)
        self.assertEqual(Potential.objects.get(lead=self.lead).stage, Potential.Stages.QUALIFIED)
        self.assertFalse(EmailDraft.objects.exclude(pk=self.draft.pk).exists())  # never auto-sent

    def test_existing_potential_moves_forward_never_back(self):
        pot = Potential.objects.create(company='Prospect', opportunity='x', lead=self.lead)
        self.poll({5: mail(body='Interested')})
        pot.refresh_from_db()
        self.assertEqual(pot.stage, Potential.Stages.QUALIFIED)
        pot.stage = Potential.Stages.PROPOSAL
        pot.save()
        inbox.advance_potential(self.lead, 'Prospect')
        pot.refresh_from_db()
        self.assertEqual(pot.stage, Potential.Stages.PROPOSAL)

    def test_keyless_heuristics(self):
        cases = {'What does it cost?': Reply.Classes.QUESTION,
                 'Not interested, thanks.': Reply.Classes.NOT_INTERESTED,
                 'Maybe next quarter.': Reply.Classes.NOT_NOW,
                 'Unsubscribe': Reply.Classes.UNSUBSCRIBE,
                 'ok': Reply.Classes.OTHER}
        for text, label in cases.items():
            self.assertEqual(inbox.classify(text)[0], label, text)

    def test_llm_json_used_when_available(self):
        with mock.patch('core.ai.llm_available', return_value=True), \
                mock.patch('core.ai.llm_complete', return_value=(
                    'Sure: {"classification": "not_now", "confidence": 0.8, "summary": "Later"}')):
            self.assertEqual(inbox.classify('we will see'), ('not_now', 0.8, 'Later'))
        with mock.patch('core.ai.llm_available', return_value=True), \
                mock.patch('core.ai.llm_complete', return_value='garbage'):
            self.assertEqual(inbox.classify('Not interested')[0], Reply.Classes.NOT_INTERESTED)

    def test_duplicate_message_id_not_stored_twice(self):
        inbox.process_message(mail(body='Interested'), self.mb)
        self.assertEqual(inbox.process_message(mail(body='Interested'), self.mb), 'duplicate')
        self.assertEqual(Reply.objects.count(), 1)

    def test_malformed_mail_does_not_crash(self):
        junk = {1: b'\xff\xfe\x00garbage', 2: b'From: =?bad?=\r\nContent-Type: multipart/mixed\r\n\r\n',
                3: b'', 4: mail(body='Interested')}
        stats = self.poll(junk)
        self.assertEqual(stats['error'], '')
        self.assertEqual(Reply.objects.count(), 1)
        self.mb.refresh_from_db()
        self.assertEqual(self.mb.imap_last_uid, 4)


class ApproveSuggestionTests(InboxBase):
    def setUp(self):
        super().setUp()
        inbox.process_message(mail(body='Interested — what does it cost?'), self.mb)
        self.reply = Reply.objects.get()
        owner = User.objects.create_user(username='own', password='pw123456', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=owner).key}')

    def test_approve_creates_threaded_queued_draft_and_mime_headers(self):
        res = self.client.post(f'/api/replies/{self.reply.pk}/approve_suggestion/',
                               {'text': 'Edited answer'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['handled'])
        answer = EmailDraft.objects.exclude(pk=self.draft.pk).get()
        self.assertEqual(answer.status, S.QUEUED)
        self.assertEqual(answer.mailbox, self.mb)  # same mailbox as the thread
        self.assertEqual(answer.subject, 'Re: Hi')
        self.assertEqual(answer.body, 'Edited answer')
        self.assertEqual(answer.in_reply_to, '<their-1@prospect.com>')
        self.assertIn(OUR_ID, answer.references)
        # the real MIME that leaves carries the threading headers
        conn = mock.MagicMock()
        mailer.send_draft(answer, mailbox=self.mb, connection=conn)
        sent = conn.send_message.call_args[0][0]
        self.assertEqual(sent['In-Reply-To'], '<their-1@prospect.com>')
        self.assertIn(OUR_ID, sent['References'])
        self.assertIn('<their-1@prospect.com>', sent['References'])
        self.assertIn('List-Unsubscribe', sent)

    def test_cold_email_has_no_thread_headers(self):
        self.assertEqual(mailer.thread_headers(self.draft), {})

    def test_approve_refused_for_suppressed_and_twice(self):
        self.client.post(f'/api/replies/{self.reply.pk}/approve_suggestion/', {}, format='json')
        res = self.client.post(f'/api/replies/{self.reply.pk}/approve_suggestion/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        Suppression.add('lead@prospect.com')
        self.reply.answer_draft = None
        self.reply.save()
        res = self.client.post(f'/api/replies/{self.reply.pk}/approve_suggestion/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_member_cannot_approve(self):
        member = User.objects.create_user(username='mem', password='pw123456', role='member')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=member).key}')
        res = c.post(f'/api/replies/{self.reply.pk}/approve_suggestion/', {}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(c.get('/api/replies/').status_code, 200)

    def test_mark_handled_and_status_count(self):
        self.assertEqual(self.client.get('/api/outreach/status/').json()['repliesNeedingAttention'], 1)
        res = self.client.post(f'/api/replies/{self.reply.pk}/mark_handled/', {}, format='json')
        self.assertTrue(res.json()['handled'])
        self.assertEqual(self.client.get('/api/outreach/status/').json()['repliesNeedingAttention'], 0)

    def test_serializer_camel_case(self):
        row = self.client.get('/api/replies/').json()
        row = (row['results'] if isinstance(row, dict) else row)[0]
        for key in ('fromEmail', 'bodyText', 'classification', 'classificationLabel',
                    'suggestedReply', 'needsAttention', 'receivedAt', 'answer'):
            self.assertIn(key, row)

    def test_poll_endpoint(self):
        with mock.patch('core.inbox.poll_inbox', return_value={}) as poll:
            res = self.client.post('/api/inbox/poll/')
        self.assertEqual(res.status_code, 200)
        poll.assert_called_once()


class TenantIsolationTests(InboxBase):
    def test_other_workspace_draft_never_matched(self):
        other = Workspace.all_tenants.create(slug='other', name='Other')
        with workspace_context(other):
            mb2 = Mailbox.objects.create(from_email='b@other.com', smtp_host='smtp.other.com',
                                         smtp_user='b@other.com', smtp_password='pw')
            # a reply in the other workspace's inbox referencing OUR draft's id
            self.assertEqual(inbox.process_message(mail(body='Interested'), mb2), 'ignored')
            self.assertFalse(Reply.objects.exists())
        self.assertFalse(Reply.objects.exists())
        self.draft.refresh_from_db()

    def test_poll_all_workspaces_runs_each_in_context(self):
        seen = []
        with mock.patch('core.inbox.poll_inbox', side_effect=lambda: seen.append(
                __import__('core.tenancy', fromlist=['x']).current_workspace().slug) or {}):
            inbox.poll_all_workspaces()
        self.assertIn(self.workspace.slug, seen)
