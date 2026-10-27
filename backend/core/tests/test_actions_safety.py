"""Chat actions: questions never act, destructive actions need an explicit yes."""
from django.test import TestCase

from core.actions import detect_action_regex, handle_command, is_question_or_negation
from core.models import AppSettings, EmailDraft, Lead, SearchProfile, User


class GuardTests(TestCase):
    def test_questions_and_negations(self):
        for text in ('should I send all the drafts?', "don't send all the emails yet",
                     'what happens if I stop the runs?', 'when will the next run of the pipeline start?'):
            self.assertTrue(is_question_or_negation(text), text)
        for text in ('Approve all drafts', 'Run a cycle', 'pause the runs'):
            self.assertFalse(is_question_or_negation(text), text)


class ConfirmFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.d1 = EmailDraft.objects.create(company='Acme', to_email='a@acme.com', subject='s', body='b')
        self.d2 = EmailDraft.objects.create(company='Beta', to_email='b@beta.com', subject='s', body='b')

    def test_question_does_nothing(self):
        self.assertEqual(handle_command('should I send all the drafts?', self.user), '')
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)

    def test_approve_all_asks_then_sends_on_yes(self):
        reply = handle_command('approve all drafts', self.user)
        self.assertIn('yes', reply.lower())
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)
        handle_command('yes', self.user)
        self.assertEqual(EmailDraft.objects.filter(status='sent').count(), 2)

    def test_no_cancels(self):
        handle_command('approve all drafts', self.user)
        self.assertIn('cancel', handle_command('no', self.user).lower())
        self.user.refresh_from_db()
        self.assertEqual(self.user.pending_action, {})
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 2)

    def test_delete_lead_with_empty_name_never_deletes(self):
        Lead.objects.create(company='Only Lead')
        handle_command('delete the lead', self.user)
        handle_command('yes', self.user)
        self.assertEqual(Lead.objects.count(), 1)

    def test_delete_lead_rejects_its_drafts_and_blacklists(self):
        lead = Lead.objects.create(company='Gone Co', website='gone.co')
        d = EmailDraft.objects.create(lead=lead, company='Gone Co', to_email='x@gone.co', subject='s', body='b')
        from core.actions import execute
        execute({'action': 'delete_lead', 'company': 'Gone Co'})
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.REJECTED)
        self.assertIn('gone.co', AppSettings.load().rejected_domains)

    def test_regex_no_longer_reads_approve_n_drafts_as_all(self):
        spec = detect_action_regex('approve the drafts for Acme') or {}
        self.assertNotEqual(spec.get('action'), 'approve_all')


class ChatWiringTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        EmailDraft.objects.create(company='Acme', to_email='a@acme.com', subject='s', body='b')

    def test_prompt_verbatim_and_ambiguous_delete(self):
        from unittest import mock
        from core.chat import responder_reply
        with mock.patch('core.chat.llm_available', return_value=True), \
                mock.patch('core.chat.llm_complete', side_effect=AssertionError('must not rephrase')):
            reply = responder_reply('approve all drafts', 1, self.user)
        self.assertIn('Reply "yes"', reply)
        Lead.objects.create(company='Acme One')
        Lead.objects.create(company='Acme Two')
        self.assertIn('Which one?', handle_command('delete lead Acme', self.user))
        self.assertEqual(Lead.objects.count(), 2)

    def test_api_returns_pending_action(self):
        from rest_framework.test import APIClient
        from core.models import User as U
        U.objects.filter(pk=self.user.pk).update(onboarding={'done': True})
        self.user.refresh_from_db()
        c = APIClient()
        c.force_authenticate(self.user)
        r = c.post('/api/chat/', {'text': 'approve all drafts'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.data['pendingAction'], str)
        self.assertTrue(r.data['pendingAction'])


class PendingHardeningTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        EmailDraft.objects.create(company='Acme', to_email='a@acme.com', subject='s', body='b')

    def _client(self, done=True):
        from rest_framework.test import APIClient
        User.objects.filter(pk=self.user.pk).update(onboarding={'done': done})
        self.user.refresh_from_db()
        c = APIClient()
        c.force_authenticate(self.user)
        return c

    def test_yes_after_ttl_does_nothing_and_says_so(self):
        from datetime import timedelta
        from django.utils import timezone
        handle_command('approve all drafts', self.user)
        self.user.pending_action['expires'] = (timezone.now() - timedelta(minutes=1)).isoformat()
        self.user.save(update_fields=['pending_action'])
        reply = handle_command('yes', self.user)
        self.assertIn('expired', reply.lower())
        self.assertIn('nothing', reply.lower())
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 1)

    def test_delete_chat_clears_pending(self):
        c = self._client()
        c.post('/api/chat/', {'text': 'approve all drafts'}, format='json')
        self.assertEqual(c.delete('/api/chat/').status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.pending_action, {})
        c.post('/api/chat/', {'text': 'yes'}, format='json')
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 1)

    def test_onboarding_clears_pending(self):
        handle_command('approve all drafts', self.user)
        c = self._client(done=False)
        c.post('/api/chat/', {'text': 'hello'}, format='json')
        self.user.refresh_from_db()
        self.assertEqual(self.user.pending_action, {})

    def test_yes_please_confirms(self):
        handle_command('approve all drafts', self.user)
        handle_command('Yes, please', self.user)
        self.assertEqual(EmailDraft.objects.filter(status='sent').count(), 1)

    def test_no_thanks_cancels_and_no_never_means_yes(self):
        from core.actions import _NO, _YES
        handle_command('approve all drafts', self.user)
        self.assertIn('cancel', handle_command('no thanks', self.user).lower())
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 1)
        self.assertFalse(_YES.match('no do it'))
        self.assertFalse(_YES.match('no, wait'))
        self.assertFalse(_YES.match('yes, wait'))
        self.assertTrue(_NO.match('no, wait'))
        self.assertFalse(_NO.match('yes please'))

    def test_yes_with_nothing_pending_is_harmless(self):
        self.assertEqual(handle_command('yes', self.user), '')
        self.assertEqual(EmailDraft.objects.filter(status='draft').count(), 1)

    def test_short_company_name_does_not_match_any_phrase(self):
        from core.actions import _match_company
        self.assertEqual(_match_company('delete the big acme account', ['A', 'Acme']), ['Acme'])
        self.assertEqual(_match_company('delete the big acme account', ['A']), [])

    def test_get_returns_pending_until_confirmed(self):
        c = self._client()
        handle_command('approve all drafts', self.user)
        r = c.get('/api/chat/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['pendingAction'])
        handle_command('yes', self.user)
        self.assertIsNone(c.get('/api/chat/').data['pendingAction'])


class PostSetupRedactionTests(TestCase):
    """Secrets pasted into the Assistant after setup must not be stored raw."""

    def setUp(self):
        from rest_framework.test import APIClient
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        User.objects.filter(pk=self.user.pk).update(onboarding={'done': True})
        self.user.refresh_from_db()
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def _stored(self):
        from core.models import ChatMessage
        return ChatMessage.objects.filter(user=self.user, role='user').first().text

    def test_api_key_not_stored(self):
        self.c.post('/api/chat/', {'text': 'AIzaSyD-1234567890abcdefghijkl'}, format='json')
        self.assertNotIn('AIzaSyD', self._stored())

    def test_mailbox_password_not_stored(self):
        self.c.post('/api/chat/', {'text': 'hello@x.com:apppassword'}, format='json')
        self.assertNotIn('apppassword', self._stored())

    def test_ordinary_message_unchanged(self):
        self.c.post('/api/chat/', {'text': 'how many leads today?'}, format='json')
        self.assertEqual(self._stored(), 'how many leads today?')


class DraftRejectRaceTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def _draft(self, status):
        return EmailDraft.objects.create(company='Acme', to_email='a@acme.com', subject='s',
                                         body='b', status=status)

    def test_mid_send_draft_cannot_be_rejected(self):
        d = self._draft(EmailDraft.Statuses.APPROVED)
        r = self.c.post(f'/api/drafts/{d.id}/reject/')
        self.assertEqual(r.status_code, 409)
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.APPROVED)

    def test_draft_still_rejects(self):
        d = self._draft(EmailDraft.Statuses.DRAFT)
        r = self.c.post(f'/api/drafts/{d.id}/reject/')
        self.assertEqual(r.status_code, 200)
        d.refresh_from_db()
        self.assertEqual(d.status, EmailDraft.Statuses.REJECTED)
