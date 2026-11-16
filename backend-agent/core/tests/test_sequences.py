"""Follow-up sequences: enrollment on send, due-step materialization,
threading, stop rules (reply / bounce / unsubscribe / won / manual), the
reply-vs-queued race, OOO shift, assisted tasks and tenant isolation.
No network: SMTP is mocked."""

from datetime import timedelta
from unittest import mock

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import outbox, sequences
from core.models import (AppSettings, EmailDraft, Enrollment, Lead, OutreachTask, Potential, Reply,
                         SequenceStep, Suppression, User, Workspace)
from core.tenancy import workspace_context

from .test_deliverability import WED_10, Clock, OutboxBase

D = EmailDraft.Statuses
E = Enrollment.Statuses


class SeqBase(OutboxBase):
    def setUp(self):
        super().setUp()
        p = mock.patch('core.mailer.send_email_message')
        self.smtp = p.start()
        self.addCleanup(p.stop)
        self.mb = self.mailbox()
        self.lead = Lead.objects.create(company='Acme', website='acme.com',
                                        contact_email='ceo@acme.com', contact_phone='98765 43210',
                                        country='India')

    def send_cold(self):
        d = self.draft(to='ceo@acme.com', lead=self.lead)
        EmailDraft.objects.filter(pk=d.pk).update(subject='Quick idea for Acme')
        outbox.enqueue_draft(d.pk)
        self.clock.advance(minutes=10)
        outbox.drain_outbox()
        d.refresh_from_db()
        self.assertEqual(d.status, D.SENT)
        return d

    def enrollment(self):
        return Enrollment.objects.get(lead=self.lead)

    def due(self):
        """Jump to the enrollment's next_due_at and tick."""
        self.clock.now = self.enrollment().next_due_at + timedelta(minutes=1)
        sequences.tick()

    def followup(self):
        return EmailDraft.objects.filter(enrollment__lead=self.lead, sequence_step__gt=0).order_by('-id').first()


class EnrollAndMaterializeTests(SeqBase):
    def test_cold_send_enrolls_with_business_day_delay(self):
        d = self.send_cold()
        enr = self.enrollment()
        self.assertEqual(enr.status, E.ACTIVE)
        self.assertEqual(enr.first_draft_id, d.pk)
        self.assertEqual(enr.last_message_id, d.message_id)
        # sent Wed → +3 business days = Mon
        self.assertEqual(outbox.local(enr.next_due_at).weekday(), 0)

    def test_no_enrollment_when_disabled(self):
        AppSettings.objects.update(followups_enabled=False)
        self.send_cold()
        self.assertFalse(Enrollment.objects.exists())

    def test_not_due_yet_creates_nothing(self):
        self.send_cold()
        self.clock.advance(days=2)
        sequences.tick()
        self.assertIsNone(self.followup())

    def test_due_step_is_threaded_draft_awaiting_approval(self):
        cold = self.send_cold()
        self.due()
        f = self.followup()
        self.assertEqual(f.status, D.DRAFT)  # auto-approve is OFF by default
        self.assertEqual(f.subject, 'Re: Quick idea for Acme')
        self.assertEqual(f.in_reply_to, cold.message_id)
        self.assertIn(cold.message_id, f.references)
        self.assertEqual(f.mailbox_id, self.mb.pk)
        self.assertIn('Acme', f.body)
        self.assertEqual(self.enrollment().pending_step, 1)
        sequences.tick()  # idempotent while pending
        self.assertEqual(EmailDraft.objects.filter(sequence_step=1).count(), 1)

    def test_auto_approve_queues_and_send_advances(self):
        AppSettings.objects.update(followups_auto_approve=True)
        self.send_cold()
        self.due()
        f = self.followup()
        self.assertEqual(f.status, D.QUEUED)
        self.clock.advance(minutes=10)
        outbox.drain_outbox()
        f.refresh_from_db()
        self.assertEqual(f.status, D.SENT)
        enr = self.enrollment()
        self.assertEqual(enr.current_step, 1)
        self.assertEqual(enr.last_message_id, f.message_id)
        self.due()  # step 2 replies to the follow-up, references the whole thread
        f2 = self.followup()
        self.assertEqual(f2.sequence_step, 2)
        self.assertEqual(f2.in_reply_to, f.message_id)
        self.assertEqual(len(f2.references.split()), 2)

    def test_rejected_followup_skips_to_next_step(self):
        self.send_cold()
        self.due()
        EmailDraft.objects.filter(pk=self.followup().pk).update(status=D.REJECTED)
        sequences.tick()
        enr = self.enrollment()
        self.assertEqual(enr.current_step, 1)
        self.assertIsNotNone(enr.next_due_at)

    def test_sequence_completes(self):
        AppSettings.objects.update(followups_auto_approve=True)
        self.send_cold()
        for _ in range(2):
            self.due()
            self.clock.advance(minutes=10)
            outbox.drain_outbox()
        self.assertEqual(self.enrollment().status, E.COMPLETED)

    def test_suppressed_address_never_gets_followup(self):
        self.send_cold()
        Suppression.objects.create(email='ceo@acme.com', reason=Suppression.Reasons.MANUAL)
        self.assertEqual(self.enrollment().status, E.STOPPED)
        self.clock.advance(days=30)
        sequences.tick()
        self.assertIsNone(self.followup())

    def test_add_delay_business_days(self):
        fri = WED_10 + timedelta(days=2)
        self.assertEqual(outbox.local(sequences.add_delay(fri, 1)).weekday(), 0)
        self.assertEqual((sequences.add_delay(fri, 1, business=False) - fri).days, 1)


class StopRuleTests(SeqBase):
    def pending(self):
        self.send_cold()
        self.due()
        return self.followup()

    def assert_stopped(self, f, reason_part=''):
        enr = self.enrollment()
        self.assertEqual(enr.status, E.STOPPED)
        self.assertIn(reason_part, enr.stop_reason)
        f.refresh_from_db()
        self.assertEqual(f.status, D.REJECTED)

    def test_human_reply_stops(self):
        f = self.pending()
        Reply.objects.create(company='Acme', lead=self.lead, classification=Reply.Classes.NOT_NOW)
        self.assert_stopped(f, 'replied')

    def test_reply_matched_only_by_email_stops(self):
        f = self.pending()
        Reply.objects.create(company='Acme', from_email='CEO@acme.com',
                             classification=Reply.Classes.QUESTION)
        self.assert_stopped(f)

    def test_ooo_shifts_instead_of_stopping(self):
        self.send_cold()
        before = self.enrollment().next_due_at
        Reply.objects.create(company='Acme', lead=self.lead, classification=Reply.Classes.OUT_OF_OFFICE)
        enr = self.enrollment()
        self.assertEqual(enr.status, E.ACTIVE)
        self.assertEqual(enr.next_due_at, before + sequences.OOO_SHIFT)

    def test_bounce_and_unsubscribe_stop(self):
        f = self.pending()
        Suppression.add('ceo@acme.com', reason=Suppression.Reasons.BOUNCE, source='bounce')
        self.assert_stopped(f, 'bounced')

    def test_unsubscribe_stops(self):
        f = self.pending()
        Suppression.add('ceo@acme.com')
        self.assert_stopped(f, 'unsubscribed')

    def test_won_and_do_not_contact_stop(self):
        f = self.pending()
        Potential.objects.create(company='Acme', opportunity='x', lead=self.lead,
                                 stage=Potential.Stages.WON)
        self.assert_stopped(f, 'won')

    def test_do_not_contact_stops(self):
        f = self.pending()
        self.lead.do_not_contact = True
        self.lead.save()
        self.assert_stopped(f)

    def test_race_reply_after_followup_queued(self):
        """Follow-up already queued; a reply lands → it never leaves."""
        AppSettings.objects.update(followups_auto_approve=True)
        f = self.pending()
        self.assertEqual(f.status, D.QUEUED)
        sends = self.smtp.call_count
        Reply.objects.create(company='Acme', lead=self.lead, classification=Reply.Classes.INTERESTED)
        self.clock.advance(minutes=10)
        outbox.drain_outbox()
        f.refresh_from_db()
        self.assertEqual(f.status, D.REJECTED)
        self.assertEqual(self.smtp.call_count, sends)

    def test_race_stop_after_claim_rejected_in_send_path(self):
        """Claimed (APPROVED) a moment before the stop: send_draft re-checks."""
        AppSettings.objects.update(followups_auto_approve=True)
        f = self.pending()
        self.clock.advance(minutes=10)
        self.assertTrue(outbox.claim_queued(f.pk))
        Enrollment.objects.filter(pk=f.enrollment_id).update(status=E.STOPPED)
        sends = self.smtp.call_count
        from core.mailer import send_draft
        f.refresh_from_db()
        send_draft(f)
        self.assertEqual(f.status, D.REJECTED)
        self.assertEqual(self.smtp.call_count, sends)

    def test_manual_stop_api(self):
        f = self.pending()
        user = User.objects.create_user('o', password='pw-12345678', role='owner', workspace=self.workspace)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key)
        r = c.post(f'/api/enrollments/{self.enrollment().pk}/stop/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assert_stopped(f, 'Stopped by')


class AssistedStepTests(SeqBase):
    def test_linkedin_and_call_tasks(self):
        seq = sequences.ensure_default_sequence()
        seq.steps.filter(channel__in=['email']).update(enabled=False)
        seq.steps.filter(channel__in=['linkedin_task', 'call_task']).update(enabled=True)
        self.send_cold()
        self.due()
        t = OutreachTask.objects.get(channel=OutreachTask.Channels.LINKEDIN)
        self.assertIn('linkedin.com/search/results/people/?keywords=Acme', t.url)
        self.assertLessEqual(len(t.message), 300)
        self.due()
        call = OutreachTask.objects.get(channel=OutreachTask.Channels.CALL)
        self.assertEqual(call.phone, '98765 43210')
        self.assertEqual(self.enrollment().status, E.COMPLETED)


class SequenceTenantTests(SeqBase):
    def test_other_workspace_untouched(self):
        self.send_cold()
        other = Workspace.all_tenants.create(slug='other', name='Other')
        with workspace_context(other):
            self.assertFalse(Enrollment.objects.exists())
            AppSettings.load()
            self.clock.advance(days=30)
            sequences.tick()
            self.assertFalse(EmailDraft.objects.exists())
            # a reply in the other workspace never stops ours
            Reply.objects.create(company='Acme', from_email='ceo@acme.com',
                                 classification=Reply.Classes.INTERESTED)
        self.assertEqual(self.enrollment().status, E.ACTIVE)
