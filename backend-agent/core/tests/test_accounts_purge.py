"""Removed for good (core.accounts.purge_deleted, `manage.py purge_deleted`).

The warmup service is never asked for real: core.accounts' one door to it
(warmup_accounts.remove) is replaced. Nothing here may call a payment gateway."""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from billing.models import Invoice, Payment, PlatformAuditLog, Refund, Subscription
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_platform_base import make_admin
from core import accounts
from core.models import Lead, User, Workspace
from core.tenancy import workspace_context
from core.warmup_accounts import WarmupAccountsError
from core.workspaces import provision_workspace

PW = 'pw12345678'
EMAIL = 'ada@acme.test'
THE_SEVENTEEN = ['Lead', 'EmailDraft', 'Mailbox', 'EmailTemplate', 'Potential', 'Reply', 'Suppression',
                 'AgentConfig', 'AppSettings', 'SearchProfile', 'ChatMessage', 'PipelineRun', 'Sequence',
                 'SequenceStep', 'Enrollment', 'OutreachTask', 'WhatsAppMessage']


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        _, self.admin_u, _ = make_admin()
        # the deletion in the set-up pauses mailboxes; the purge removes the copy — both faked
        pause = mock.patch.object(accounts.warmup_accounts, 'set_paused', return_value=0)
        pause.start()
        self.addCleanup(pause.stop)
        patcher = mock.patch.object(accounts.warmup_accounts, 'remove', return_value=1)
        self.remove = patcher.start()
        self.addCleanup(patcher.stop)
        # the owner's own cancel and refund move money: a purge never does
        for name in ('cancel_subscription', 'platform_refund'):
            gate = mock.patch(f'billing.payments.{name}', side_effect=AssertionError('a gateway was called'))
            gate.start()
            self.addCleanup(gate.stop)

    def company(self, slug='acme'):
        ws = Workspace.all_tenants.create(slug=slug, name=slug.title())       # make_ws's subscription, no rows yet
        from billing.models import Plan
        Subscription.all_tenants.create(workspace=ws, plan=Plan.objects.get(code='enterprise'),
                                        status=Subscription.Statuses.ACTIVE, gateway='stripe')
        provision_workspace(ws)            # 4 agent rows, the settings row, the base e-mail template
        return ws

    def person(self, ws, username, email, role='member', password=PW):
        u = User.objects.create_user(username=username, password=password, workspace=ws, role=role, email=email)
        User.objects.filter(pk=u.pk).update(email_verified_at=timezone.now())
        return User.objects.get(pk=u.pk)

    def stop_by_deleting(self, ws, days=31, who='ada'):
        """Delete the owner for real (the workspace stops), `days` days ago."""
        out = accounts.delete_account(self.admin_u, User.objects.get(username='ada', workspace=ws), reason='gone')
        User.objects.filter(workspace=ws).update(deleted_at=timezone.now() - timedelta(days=days))
        return out

    def purge(self, days=30, dry_run=False):
        out = StringIO()
        call_command('purge_deleted', '--days', str(days), *( ['--dry-run'] if dry_run else [] ), stdout=out)
        return out.getvalue()

    def rows_left(self, ws):
        return {m.__name__: m.all_tenants.filter(workspace=ws).count() for m in accounts.workspace_models()
                if m.all_tenants.filter(workspace=ws).count()}

    def purges(self):
        return PlatformAuditLog.objects.filter(action='platform.user.purge')


class TheRowsTests(Base):
    def test_the_workspace_rows_are_exactly_the_seventeen(self):
        self.assertEqual(sorted(m.__name__ for m in accounts.workspace_models()), sorted(THE_SEVENTEEN))

    def test_the_billing_rows_are_not_among_them(self):
        self.assertFalse(any(m.__name__ in ('Subscription', 'Invoice', 'Payment', 'Refund')
                             for m in accounts.workspace_models()))


class PurgeWorkspaceTests(Base):
    def full_stopped_company(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        with workspace_context(ws):
            Lead.objects.create(company='Acme Dental', website='acme-dental.test', industry='dental')
        sub = Subscription.all_tenants.get(workspace=ws)
        inv = Invoice.all_tenants.create(workspace=ws, number='SHL-2026-900001', subscription=sub,
                                         currency='INR', total=1000)
        pay = Payment.all_tenants.create(workspace=ws, invoice=inv, gateway='stripe',
                                         gateway_payment_id='pi_purge_1', amount=1000, currency='INR')
        Refund.all_tenants.create(workspace=ws, payment=pay, amount=1000)
        self.stop_by_deleting(ws)
        return ws, sub

    def test_a_dry_run_changes_nothing_and_says_what_would_go(self):
        ws, _ = self.full_stopped_company()
        before = self.rows_left(ws)
        self.assertTrue(before)                                          # there is something to remove
        out = self.purge(dry_run=True)
        self.assertIn('acme', out)
        self.assertIn('Would remove', out)
        self.assertEqual(self.rows_left(ws), before)
        self.assertEqual(User.objects.filter(workspace=ws).count(), 2)
        ws.refresh_from_db()
        self.assertEqual((ws.name, ws.is_active), ('Acme', False))
        self.assertEqual(self.purges().count(), 0)
        self.remove.assert_not_called()

    def test_a_stopped_workspace_goes_with_everything_in_it(self):
        ws, sub = self.full_stopped_company()
        token = Token.objects.create(user=User.objects.get(username='max'))
        out = self.purge()
        self.assertIn('acme', out)
        self.assertFalse(User.objects.filter(workspace=ws).exists())
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())
        self.assertEqual(self.rows_left(ws), {})
        # the workspace row stays — the billing rows point at it — under a name that says what happened
        ws.refresh_from_db()
        self.assertEqual((ws.name, ws.is_active), (f'Deleted account {ws.pk}', False))
        # …and so does every billing row
        self.assertEqual([Subscription.all_tenants.filter(workspace=ws).count(),
                          Invoice.all_tenants.filter(workspace=ws).count(),
                          Payment.all_tenants.filter(workspace=ws).count(),
                          Refund.all_tenants.filter(workspace=ws).count()], [1, 1, 1, 1])
        sub.refresh_from_db()
        self.assertEqual(sub.status, Subscription.Statuses.CANCELED)
        self.assertIsNotNone(sub.canceled_at)

    def test_nobody_else_is_touched(self):
        ws, _ = self.full_stopped_company()
        other = self.company('other')
        bo = self.person(other, 'bo', 'bo@other.test', role='owner')
        with workspace_context(other):
            Lead.objects.create(company='Other Dental', website='other.test', industry='dental')
        self.purge()
        self.assertIsNone(User.objects.get(pk=bo.pk).deleted_at)
        self.assertEqual(self.rows_left(other), {'AgentConfig': 4, 'AppSettings': 1, 'EmailTemplate': 1, 'Lead': 1})
        other.refresh_from_db()
        self.assertEqual(other.name, 'Other')

    def test_a_second_run_touches_nothing(self):
        ws, _ = self.full_stopped_company()
        self.purge()
        self.remove.reset_mock()
        out = self.purge()
        self.assertNotIn('Removed for good', out)
        self.assertEqual(self.purges().count(), 1)                      # no repeated audit rows
        self.remove.assert_not_called()

    def test_the_days_are_respected(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        self.stop_by_deleting(ws, days=29)
        self.purge(days=30)
        self.assertTrue(User.objects.filter(workspace=ws).exists())
        self.purge(days=29)
        self.assertFalse(User.objects.filter(workspace=ws).exists())

    def test_it_waits_for_the_last_one_inside_the_thirty_days(self):
        # the owner is past 30 days, the member is not: they go together, so
        # nobody is brought back into a workspace that can never start again
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.stop_by_deleting(ws, days=31)
        User.objects.filter(username='max').update(deleted_at=timezone.now() - timedelta(days=5))
        self.purge()
        self.assertEqual(User.objects.filter(workspace=ws).count(), 2)
        self.assertEqual(self.purges().count(), 0)
        self.remove.assert_not_called()

    def test_the_warmup_copy_goes_before_the_rows(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'max', 'max@acme.test')
        self.stop_by_deleting(ws)
        still_there = {}

        def remove(email, admin):
            still_there[email] = User.objects.filter(workspace=ws).count()
            self.assertEqual(admin, self.admin_u)
            return 1
        self.remove.side_effect = remove
        self.purge()
        self.assertEqual(still_there, {EMAIL: 2, 'max@acme.test': 2})

    def test_a_warmup_service_that_cannot_be_reached_keeps_it_for_the_next_day(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        self.stop_by_deleting(ws)
        self.remove.side_effect = WarmupAccountsError('Could not reach the warmup service.')
        self.purge()
        self.assertTrue(User.objects.filter(workspace=ws).exists())
        ws.refresh_from_db()
        self.assertEqual(ws.name, 'Acme')
        self.assertEqual(self.purges().count(), 0)

    def test_when_the_admin_who_deleted_it_is_gone_the_copy_is_left_and_logged(self):
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        _, temp_admin, _ = make_admin('temp-admin')
        accounts.delete_account(temp_admin, User.objects.get(username='ada', workspace=ws), reason='gone')
        User.objects.filter(workspace=ws).update(deleted_at=timezone.now() - timedelta(days=31))
        User.objects.filter(pk=temp_admin.pk).delete()                  # takes the name off deleted_by
        self.assertIsNone(User.objects.get(username='ada').deleted_by)
        # (logging is switched off for a test: the logger itself is watched)
        with mock.patch.object(accounts.log, 'warning') as warning:
            self.purge()
        self.remove.assert_not_called()
        self.assertFalse(User.objects.filter(username='ada').exists())  # the purge went on
        self.assertTrue(any(EMAIL in str(c.args) for c in warning.call_args_list),
                        [str(c.args) for c in warning.call_args_list])

    def test_the_purge_is_recorded(self):
        ws, _ = self.full_stopped_company()
        self.purge()
        row = self.purges().get()
        self.assertEqual((row.actor, row.target_workspace), (None, ws))
        self.assertEqual(sorted(row.meta['users']), sorted([EMAIL, 'max@acme.test']))


class PurgeAccountTests(Base):
    def test_an_account_of_a_running_workspace_goes_on_its_own(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        token = Token.objects.create(user=ada)
        accounts.delete_account(self.admin_u, ada, reason='gone')
        User.objects.filter(pk=ada.pk).update(deleted_at=timezone.now() - timedelta(days=31))
        self.purge()
        self.assertEqual([u.username for u in User.objects.filter(workspace=ws)], ['bo'])
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())
        ws.refresh_from_db()
        self.assertEqual((ws.name, ws.is_active), ('Acme', True))
        self.assertEqual(self.rows_left(ws), {'AgentConfig': 4, 'AppSettings': 1, 'EmailTemplate': 1})
        row = self.purges().get()
        self.assertEqual((row.meta['users'], row.target_workspace), ([EMAIL], ws))

    def test_an_account_inside_its_thirty_days_stays(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        accounts.delete_account(self.admin_u, ada, reason='gone')
        User.objects.filter(pk=ada.pk).update(deleted_at=timezone.now() - timedelta(days=30) + timedelta(minutes=5))
        self.purge()
        self.assertTrue(User.objects.filter(pk=ada.pk).exists())

    def test_a_workspace_stopped_by_hand_with_nobody_left_goes_too(self):
        # stopped from Tenants, then its last account deleted: nothing can ever come back
        ws = self.company()
        self.person(ws, 'ada', EMAIL, role='owner')
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False)
        self.stop_by_deleting(ws)
        ws.refresh_from_db()
        self.assertIsNone(ws.deleted_at)
        self.purge()
        self.assertFalse(User.objects.filter(workspace=ws).exists())
        self.assertEqual(self.rows_left(ws), {})

    def test_a_workspace_stopped_by_hand_with_living_accounts_stays(self):
        ws = self.company()
        ada = self.person(ws, 'ada', EMAIL, role='owner')
        self.person(ws, 'bo', 'bo@acme.test', role='owner')
        Workspace.all_tenants.filter(pk=ws.pk).update(is_active=False)
        accounts.delete_account(self.admin_u, ada, reason='gone')
        User.objects.filter(pk=ada.pk).update(deleted_at=timezone.now() - timedelta(days=31))
        self.purge()
        self.assertEqual([u.username for u in User.objects.filter(workspace=ws)], ['bo'])
        self.assertEqual(self.rows_left(ws), {'AgentConfig': 4, 'AppSettings': 1, 'EmailTemplate': 1})


class WorkerTests(Base):
    def test_the_agent_worker_runs_it_once_a_day(self):
        from core.management.commands import run_worker
        with mock.patch.object(run_worker, 'call_command') as call:
            run_worker.purge_once()
        call.assert_called_once_with('purge_deleted')
