"""Outreach safety: no fabricated recipients, no double sends, recipient edits stick."""
from unittest import mock

from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.mailer import claim_draft_for_send, send_draft, valid_recipient
from core.models import EmailDraft, Lead, User
from core.pipeline import run_pipeline


class DraftSafetyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')
        self.lead = Lead.objects.create(company='Harbor Co', website='harborco.com', profiled=True)
        self.draft = EmailDraft.objects.create(lead=self.lead, company='Harbor Co',
                                               to_email='', subject='Hi', body='Body')

    def test_valid_recipient(self):
        self.assertTrue(valid_recipient('info@harborco.com'))
        for bad in ('', '   ', 'not-an-email', 'contact@'):
            self.assertFalse(valid_recipient(bad))

    def test_send_never_fabricates_an_address(self):
        send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.to_email, '')
        self.assertEqual(self.draft.status, EmailDraft.Statuses.FAILED)
        self.assertIn('No recipient', self.draft.error)

    def test_approve_without_recipient_is_400(self):
        resp = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(resp.status_code, 400)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.DRAFT)

    def test_recipient_edit_accepts_camel_case(self):
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'info@harborco.com'},
                               format='json')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.to_email, 'info@harborco.com')

    def test_recipient_edit_rejects_invalid(self):
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'nope'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_failed_drafts_are_editable(self):
        self.draft.status = EmailDraft.Statuses.FAILED
        self.draft.save()
        resp = self.client.put(f'/api/drafts/{self.draft.id}/', {'toEmail': 'a@harborco.com'},
                               format='json')
        self.assertEqual(resp.status_code, 200)

    def test_claim_is_single_use(self):
        self.assertIsNotNone(claim_draft_for_send(self.draft.id))
        self.assertIsNone(claim_draft_for_send(self.draft.id))

    def test_fresh_approved_not_claimable_but_stuck_one_is(self):
        from datetime import timedelta
        from django.utils import timezone
        from core.mailer import STUCK_AFTER
        self.assertIsNotNone(claim_draft_for_send(self.draft.id))  # now APPROVED, fresh
        self.assertIsNone(claim_draft_for_send(self.draft.id))
        EmailDraft.objects.filter(pk=self.draft.id).update(
            updated_at=timezone.now() - STUCK_AFTER - timedelta(minutes=1))
        self.assertIsNotNone(claim_draft_for_send(self.draft.id))  # recovered
        self.assertIsNone(claim_draft_for_send(self.draft.id))  # and fresh again

    def test_second_approve_is_409(self):
        self.draft.to_email = 'info@harborco.com'
        self.draft.save()
        first = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(first.status_code, 200)
        second = self.client.post(f'/api/drafts/{self.draft.id}/approve/')
        self.assertEqual(second.status_code, 409)

    def test_bulk_reports_missing_recipient_per_item(self):
        resp = self.client.post('/api/drafts/bulk_approve/', {'ids': [self.draft.id]}, format='json')
        self.assertEqual(resp.json()['failed'], 1)
        self.assertIn('recipient', resp.json()['results'][0]['error'].lower())

    def test_copywright_never_redrafts_a_rejected_lead(self):
        self.lead.contact_email = 'info@harborco.com'
        self.lead.save()
        self.draft.status = EmailDraft.Statuses.REJECTED
        self.draft.save()
        with mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]), \
             mock.patch('core.pipeline.gmaps_available', return_value=False), \
             mock.patch('core.pipeline.apify_maps_available', return_value=False), \
             mock.patch('core.pipeline.llm_available', return_value=False):
            run_pipeline(triggered_by='test')
        self.assertEqual(EmailDraft.objects.filter(lead=self.lead).count(), 1)


class DraftSafetyFlowTests(TestCase):
    """Retry endpoint, chat actions and manual re-draft use the same guards."""

    def setUp(self):
        self.user = User.objects.create_user(username='o2', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')
        self.lead = Lead.objects.create(company='Harbor Co', website='harborco.com', profiled=True,
                                        contact_email='info@harborco.com')

    def _draft(self, to_email='info@harborco.com', status=EmailDraft.Statuses.DRAFT):
        return EmailDraft.objects.create(lead=self.lead, company='Harbor Co', to_email=to_email,
                                         subject='Hi', body='Body', status=status)

    def test_retry_only_failed_with_recipient(self):
        approved = self._draft(status=EmailDraft.Statuses.APPROVED)
        self.assertEqual(self.client.post(f'/api/drafts/{approved.id}/send/').status_code, 409)
        failed = self._draft(to_email='', status=EmailDraft.Statuses.FAILED)
        self.assertEqual(self.client.post(f'/api/drafts/{failed.id}/send/').status_code, 400)
        failed.to_email = 'info@harborco.com'
        failed.save()
        resp = self.client.post(f'/api/drafts/{failed.id}/send/')
        self.assertEqual(resp.status_code, 200)
        failed.refresh_from_db()
        self.assertEqual(failed.status, EmailDraft.Statuses.SENT)

    def test_chat_approve_without_recipient_sends_nothing(self):
        from core.actions import execute
        draft = self._draft(to_email='')
        result = execute({'action': 'approve_draft', 'company': 'Harbor Co'})
        self.assertIn('recipient', result)
        draft.refresh_from_db()
        self.assertEqual(draft.status, EmailDraft.Statuses.DRAFT)

    def test_chat_approve_all_skips_missing_recipient(self):
        from core.actions import execute
        blank = self._draft(to_email='')
        ready = self._draft()
        result = execute({'action': 'approve_all'})
        self.assertIn('Skipped 1', result)
        blank.refresh_from_db()
        ready.refresh_from_db()
        self.assertEqual(blank.status, EmailDraft.Statuses.DRAFT)
        self.assertEqual(ready.status, EmailDraft.Statuses.SENT)

    def test_manual_redraft_allowed_after_sent_but_not_while_waiting(self):
        self._draft(status=EmailDraft.Statuses.SENT)
        resp = self.client.post(f'/api/leads/{self.lead.pk}/draft_email/')
        self.assertEqual(resp.status_code, 201)
        again = self.client.post(f'/api/leads/{self.lead.pk}/draft_email/')
        self.assertFalse(again.json()['ok'])
        self.assertIn('waiting for approval', again.json()['detail'])


class DraftFixRound1Tests(TestCase):
    """Edit race, send-path hardening, admin action, pipeline candidate query."""

    def setUp(self):
        self.user = User.objects.create_user(username='o3', password='pass12345', role='owner')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')
        self.lead = Lead.objects.create(company='Harbor Co', website='harborco.com', profiled=True,
                                        contact_email='info@harborco.com')
        self.draft = EmailDraft.objects.create(lead=self.lead, company='Harbor Co',
                                               to_email='info@harborco.com', subject='Hi', body='Body')

    # -- 1. PUT must not resurrect a draft that was claimed/sent meanwhile ----
    def test_put_race_does_not_overwrite_a_sent_draft(self):
        stale = EmailDraft.objects.get(pk=self.draft.pk)  # what the view read: status 'draft'
        EmailDraft.objects.filter(pk=self.draft.pk).update(status=EmailDraft.Statuses.SENT)
        with mock.patch('core.views._get_draft', return_value=stale):
            resp = self.client.put(f'/api/drafts/{self.draft.pk}/',
                                   {'toEmail': 'other@harborco.com', 'subject': 'Changed'},
                                   format='json')
        self.assertEqual(resp.status_code, 409)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.SENT)
        self.assertEqual(self.draft.to_email, 'info@harborco.com')
        self.assertEqual(self.draft.subject, 'Hi')

    def test_put_updates_only_the_sent_fields(self):
        resp = self.client.put(f'/api/drafts/{self.draft.pk}/', {'subject': ' New '}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['subject'], 'New')
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.subject, 'New')
        self.assertEqual(self.draft.body, 'Body')
        self.assertEqual(self.draft.status, EmailDraft.Statuses.DRAFT)

    def test_put_rejects_non_string_fields_with_400(self):
        for payload in ({'toEmail': 5}, {'to_email': ['a@b.com']}, {'toEmail': None},
                        {'subject': 7}, {'body': {'x': 1}}, {'subject': None}):
            resp = self.client.put(f'/api/drafts/{self.draft.pk}/', payload, format='json')
            self.assertEqual(resp.status_code, 400, payload)
        self.draft.refresh_from_db()
        self.assertEqual((self.draft.to_email, self.draft.subject, self.draft.body),
                         ('info@harborco.com', 'Hi', 'Body'))

    # -- 2. send_draft: normalize + never stuck in APPROVED -------------------
    def test_send_strips_whitespace_around_recipient(self):
        self.draft.to_email = '  info@harborco.com \n'
        self.draft.save()
        send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.to_email, 'info@harborco.com')
        self.assertEqual(self.draft.status, EmailDraft.Statuses.SENT)

    def test_unexpected_error_in_console_delivery_ends_failed_not_approved(self):
        claimed = claim_draft_for_send(self.draft.pk)
        self.assertEqual(claimed.status, EmailDraft.Statuses.APPROVED)
        with mock.patch('core.mailer._log_console_delivery', side_effect=RuntimeError('print boom')):
            send_draft(claimed)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.FAILED)
        self.assertIn('print boom', self.draft.error)

    def test_unexpected_error_loading_settings_ends_failed(self):
        with mock.patch('core.mailer.AppSettings.load', side_effect=RuntimeError('settings boom')):
            send_draft(self.draft)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.FAILED)
        self.assertIn('settings boom', self.draft.error)

    # -- 3. admin action uses the same guards as the API ----------------------
    def _run_admin_approve(self, *drafts):
        from django.contrib import admin
        from core.admin import EmailDraftAdmin
        model_admin = EmailDraftAdmin(EmailDraft, admin.site)
        with mock.patch.object(model_admin, 'message_user'):
            model_admin.approve_and_send(None, EmailDraft.objects.filter(pk__in=[d.pk for d in drafts]))

    def test_admin_action_skips_non_sendable_and_blank_recipient(self):
        blank = EmailDraft.objects.create(lead=self.lead, company='Harbor Co', to_email='',
                                          subject='Hi', body='Body')
        approved = EmailDraft.objects.create(lead=self.lead, company='Harbor Co',
                                             to_email='info@harborco.com', subject='Hi', body='Body',
                                             status=EmailDraft.Statuses.APPROVED)
        rejected = EmailDraft.objects.create(lead=self.lead, company='Harbor Co',
                                             to_email='info@harborco.com', subject='Hi', body='Body',
                                             status=EmailDraft.Statuses.REJECTED)
        with mock.patch('core.mailer._log_console_delivery') as delivered:
            self._run_admin_approve(self.draft, blank, approved, rejected)
        self.assertEqual(delivered.call_count, 1)  # only the sendable draft went out
        for d in (self.draft, blank, approved, rejected):
            d.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.SENT)
        self.assertEqual(blank.status, EmailDraft.Statuses.DRAFT)
        self.assertEqual(blank.to_email, '')
        self.assertEqual(approved.status, EmailDraft.Statuses.APPROVED)
        self.assertEqual(rejected.status, EmailDraft.Statuses.REJECTED)

    def test_admin_action_does_not_send_when_claim_is_lost(self):
        with mock.patch('core.admin.claim_draft_for_send', return_value=None), \
             mock.patch('core.mailer._log_console_delivery') as delivered:
            self._run_admin_approve(self.draft)
        delivered.assert_not_called()
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.DRAFT)

    # -- 4. Copywright candidate query ----------------------------------------
    def _run_copywright(self):
        with mock.patch('core.pipeline.search_queries_for_cycle', return_value=[]), \
             mock.patch('core.pipeline.gmaps_available', return_value=False), \
             mock.patch('core.pipeline.apify_maps_available', return_value=False), \
             mock.patch('core.pipeline.llm_available', return_value=False):
            run_pipeline(triggered_by='test')

    def _lead(self, company, **kw):
        return Lead.objects.create(company=company, website=f'{company.lower()}.com', profiled=True,
                                   contact_email=f'info@{company.lower()}.com',
                                   contact_phone='+911234567890', **kw)

    def _drop_setup_lead(self):
        EmailDraft.objects.filter(lead=self.lead).delete()
        self.lead.delete()

    def test_copywright_skips_blocked_leads_in_the_query(self):
        self._drop_setup_lead()
        blocked = self._lead('Blocked', score=99, analysis={'blocked': True})
        clear = self._lead('Clear', score=10, analysis={})
        self._run_copywright()
        self.assertFalse(EmailDraft.objects.filter(lead=blocked).exists())
        self.assertTrue(EmailDraft.objects.filter(lead=clear).exists())

    def test_copywright_ties_break_by_id(self):
        self._drop_setup_lead()
        leads = [self._lead(f'Tie{i}', score=50) for i in range(5)]
        self._run_copywright()
        drafted = set(EmailDraft.objects.values_list('lead_id', flat=True))
        self.assertEqual(drafted, {l.pk for l in leads[:3]})  # 3 per cycle, lowest ids first

    # -- 5. lost claim: nothing is sent ---------------------------------------
    def test_approve_with_lost_claim_is_409_and_sends_nothing(self):
        with mock.patch('core.views.claim_draft_for_send', return_value=None), \
             mock.patch('core.views.send_draft') as send:
            resp = self.client.post(f'/api/drafts/{self.draft.pk}/approve/')
        self.assertEqual(resp.status_code, 409)
        send.assert_not_called()
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.DRAFT)
