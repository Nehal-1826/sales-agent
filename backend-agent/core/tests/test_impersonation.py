"""Enter as user (impersonation): a platform admin opens a customer's
workspace through a 60-minute ticket.

The ticket is stored hashed, starts exactly once (within 10 minutes of being
issued) and is the credential of ONE tab. Inside that tab every request runs
as the target user in the target's workspace; a small list of paths is
refused; start and end are recorded under the admin's name."""

import hashlib
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import PlatformAuditLog
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import SECRET, code_now, make_admin
from core.models import ImpersonationTicket, Lead, User, Workspace
from core.tenancy import workspace_context

ENDED = 'This session has ended — close this tab.'
REFUSED = 'Not available while you are inside as another user.'


def make_target(slug='imp1', two_factor=False):
    """A workspace owner with a company and one lead."""
    ws = make_ws(slug)
    Workspace.all_tenants.filter(pk=ws.pk).update(name=f'{slug.title()} Co')
    ws.refresh_from_db()
    u = User.objects.create_user(username=f'{slug}-owner', password='pw12345678',
                                 workspace=ws, role='owner', email=f'owner@{slug}.test')
    if two_factor:
        User.objects.filter(pk=u.pk).update(totp_secret=SECRET)
        u.refresh_from_db()
    with workspace_context(ws):
        Lead.objects.create(company=f'{slug.title()} Dental', website=f'{slug}-dental.test', industry='dental')
    return u, ws


def issue(admin_client, user_id, reason='Helping a customer'):
    return admin_client.post(f'/api/platform/users/{user_id}/impersonate/', {'reason': reason}, format='json')


def start(ticket):
    return APIClient().post('/api/auth/impersonate/start/', {'ticket': ticket}, format='json')


def entered(ticket):
    """A client that behaves like the impersonated tab."""
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Impersonation {ticket}')
    return c


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()          # the platform API is rate-limited per user (the limits live in the cache)

    def enter(self, target):
        """Issue + start; returns the impersonated client and the ticket row."""
        admin = make_admin()[0]
        r = issue(admin, target.pk)
        self.assertEqual(r.status_code, 200, r.content)
        ticket = r.json()['ticket']
        self.assertEqual(start(ticket).status_code, 200)
        return entered(ticket), ImpersonationTicket.objects.get(
            key_hash=hashlib.sha256(ticket.encode()).hexdigest())


class IssuingTests(Base):
    def test_a_reason_is_required(self):
        admin = make_admin()[0]
        target, _ = make_target()
        r = issue(admin, target.pk, reason='   ')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'reason_required'))

    def test_a_platform_admin_cannot_be_entered(self):
        admin = make_admin()[0]
        _, other, _ = make_admin('other')
        r = issue(admin, other.pk)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_impersonate'))

    def test_nobody_can_enter_themselves(self):
        admin, admin_u, _ = make_admin()
        r = issue(admin, admin_u.pk)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_impersonate'))

    def test_an_unknown_account_is_404(self):
        admin = make_admin()[0]
        r = issue(admin, 987654)
        self.assertEqual((r.status_code, r.json()['error']), (404, 'not_found'))

    def test_only_a_platform_admin_can_issue(self):
        target, _ = make_target()
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=target).key}')
        self.assertEqual(issue(c, target.pk).status_code, 403)

    def test_a_stopped_workspace_cannot_be_entered(self):
        admin = make_admin()[0]
        target, ws = make_target()
        ws.is_active = False
        ws.save(update_fields=['is_active'])
        r = issue(admin, target.pk)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_impersonate'))

    def test_an_account_without_a_workspace_is_refused_not_crashed(self):
        admin = make_admin()[0]
        stray = User.objects.create_user(username='stray', password='pw12345678')   # made by hand: no company, not staff
        User.objects.filter(pk=stray.pk).update(workspace=None)
        r = issue(admin, stray.pk)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'cannot_impersonate'))

    def test_the_answer_holds_a_ticket_and_the_limits(self):
        admin = make_admin()[0]
        target, ws = make_target()
        r = issue(admin, target.pk)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['starts_within_minutes'], 10)
        self.assertEqual(body['lasts_minutes'], 60)
        self.assertEqual(body['user'], {'id': target.pk, 'username': target.username, 'email': target.email})
        self.assertEqual(body['workspace'], {'id': ws.pk, 'name': ws.name, 'slug': ws.slug})
        self.assertTrue(body['ticket'])

    def test_the_raw_ticket_is_never_stored(self):
        admin = make_admin()[0]
        target, _ = make_target()
        ticket = issue(admin, target.pk).json()['ticket']
        row = ImpersonationTicket.objects.get()
        self.assertNotEqual(row.key_hash, ticket)
        self.assertEqual(row.key_hash, hashlib.sha256(ticket.encode()).hexdigest())
        self.assertNotIn(ticket, str(PlatformAuditLog.objects.values('meta')))


class TicketLifeTests(Base):
    def test_a_ticket_starts_exactly_once(self):
        admin = make_admin()[0]
        target, _ = make_target()
        ticket = issue(admin, target.pk).json()['ticket']
        self.assertEqual(start(ticket).status_code, 200)
        again = start(ticket)
        self.assertEqual((again.status_code, again.json()['error']), (400, 'ticket_used'))

    def test_a_ticket_that_is_not_started_within_ten_minutes_is_dead(self):
        admin = make_admin()[0]
        target, _ = make_target()
        ticket = issue(admin, target.pk).json()['ticket']
        ImpersonationTicket.objects.update(created_at=timezone.now() - timedelta(minutes=11))
        r = start(ticket)
        self.assertEqual((r.status_code, r.json()['error']), (400, 'ticket_expired'))

    def test_a_started_ticket_lasts_sixty_minutes(self):
        admin = make_admin()[0]
        target, _ = make_target()
        ticket = issue(admin, target.pk).json()['ticket']
        self.assertEqual(start(ticket).status_code, 200)
        ago = timezone.now() - timedelta(minutes=61)
        ImpersonationTicket.objects.update(started_at=ago, ends_at=ago + timedelta(minutes=60))
        r = entered(ticket).get('/api/auth/me/')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()['detail'], ENDED)
        # one minute less and it is still good
        ImpersonationTicket.objects.update(started_at=ago + timedelta(minutes=2),
                                           ends_at=ago + timedelta(minutes=62))
        self.assertEqual(entered(ticket).get('/api/auth/me/').status_code, 200)

    def test_a_garbage_ticket_cannot_start(self):
        r = start('not-a-real-ticket')
        self.assertEqual((r.status_code, r.json()['error']), (400, 'bad_ticket'))


class InsideTests(Base):
    def test_inside_you_are_that_person_in_their_workspace(self):
        target, _ = make_target()
        c, row = self.enter(target)
        me = c.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200, me.content)
        self.assertEqual((me.json()['username'], me.json()['role']), (target.username, 'owner'))
        self.assertEqual(me.json()['impersonation']['admin'], 'root')
        self.assertEqual(me.json()['impersonation']['workspace']['name'], 'Imp1 Co')
        # no name was ever given: the bar on top of the tab falls back to the username
        self.assertEqual(me.json()['impersonation']['name'], target.username)
        self.assertIsNotNone(me.json()['impersonation']['ends_at'])
        leads = c.get('/api/leads/')
        self.assertEqual(leads.status_code, 200, leads.content)
        self.assertIn('Imp1 Dental', leads.content.decode())

    def test_the_bar_says_the_persons_name_when_they_gave_one(self):
        target, _ = make_target()
        User.objects.filter(pk=target.pk).update(first_name='Ada', last_name='Lovelace')
        c, _ = self.enter(target)
        self.assertEqual(c.get('/api/auth/me/').json()['impersonation']['name'], 'Ada Lovelace')

    def test_another_workspaces_lead_is_invisible(self):
        target, _ = make_target('imp1')
        make_target('imp2')                      # someone else's company and lead
        c, _ = self.enter(target)
        body = c.get('/api/leads/').content.decode()
        self.assertIn('Imp1 Dental', body)
        self.assertNotIn('Imp2 Dental', body)

    def test_a_ticket_is_never_a_token_and_a_token_is_never_a_ticket(self):
        target, _ = make_target()
        admin, admin_u, admin_tok = make_admin()
        r = issue(admin, target.pk)
        ticket = r.json()['ticket']
        self.assertEqual(start(ticket).status_code, 200)
        as_token = APIClient()
        as_token.credentials(HTTP_AUTHORIZATION=f'Token {ticket}')
        self.assertEqual(as_token.get('/api/auth/me/').status_code, 401)
        as_ticket = APIClient()
        as_ticket.credentials(HTTP_AUTHORIZATION=f'Impersonation {admin_tok.key}')
        self.assertEqual(as_ticket.get('/api/auth/me/').status_code, 401)

    def test_the_password_the_username_and_two_factor_cannot_be_changed_inside(self):
        target, _ = make_target()
        c, _ = self.enter(target)
        for path in ('/api/auth/password/', '/api/auth/change-username/', '/api/auth/2fa/setup/'):
            r = c.post(path, {'code': '000000'}, format='json')
            self.assertEqual((r.status_code, r.json()['detail']), (403, REFUSED), path)
        self.assertEqual(c.get('/api/auth/2fa/status/').status_code, 403)

    def test_the_warmup_bridge_token_is_not_minted_inside(self):
        import os
        os.environ['WARMUP_JWT_SECRET'] = 'unit-test-bridge-secret-0123456789abcdef'
        self.addCleanup(os.environ.pop, 'WARMUP_JWT_SECRET', None)
        target, _ = make_target()
        c, _ = self.enter(target)
        r = c.post('/api/auth/warmup-token/', {}, format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (403, REFUSED))

    def test_the_platform_apis_are_closed_inside(self):
        target, _ = make_target()
        c, _ = self.enter(target)
        self.assertEqual((c.get('/api/platform/overview/').status_code,
                          c.get('/api/platform/overview/').json()['detail']), (403, REFUSED))

    def test_refused_paths_are_refused_before_any_view_is_reached(self):
        # not only through a view's authentication, which runs once an address
        # has resolved: an address with nothing behind it is refused all the same
        target, _ = make_target()
        c, _ = self.enter(target)
        for path in ('/api/auth/2fa/', '/api/platform/', '/api/platform/nowhere/'):
            r = c.get(path)
            self.assertEqual((r.status_code, r.json().get('detail')), (403, REFUSED), path)

    def test_signing_out_inside_only_ends_the_ticket(self):
        target, _ = make_target()
        own = Token.objects.create(user=target)
        c, _ = self.enter(target)
        r = c.post('/api/auth/logout/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(c.get('/api/auth/me/').status_code, 401)
        self.assertTrue(Token.objects.filter(pk=own.pk).exists())       # the person's own session is untouched
        still = APIClient()
        still.credentials(HTTP_AUTHORIZATION=f'Token {own.key}')
        self.assertEqual(still.get('/api/auth/me/').status_code, 200)

    def test_exiting_ends_the_ticket(self):
        target, _ = make_target()
        c, row = self.enter(target)
        r = c.post('/api/auth/impersonate/end/', {}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'ended': True}))
        row.refresh_from_db()
        self.assertIsNotNone(row.ended_at)
        self.assertEqual(c.get('/api/auth/me/').status_code, 401)

    def test_a_person_with_two_factor_is_entered_without_a_code(self):
        target, _ = make_target('imp3', two_factor=True)
        c, _ = self.enter(target)
        me = c.get('/api/auth/me/').json()
        self.assertEqual((me['totp_enabled'], me['otp_required']), (True, False))
        self.assertEqual(c.get('/api/leads/').status_code, 200)

    def test_a_stopped_workspace_cannot_be_entered_even_with_a_live_ticket(self):
        target, ws = make_target()
        c, _ = self.enter(target)
        ws.is_active = False
        ws.save(update_fields=['is_active'])
        self.assertEqual(c.get('/api/leads/').status_code, 403)


class RecordingTests(Base):
    def test_everything_is_recorded_under_the_admins_name(self):
        target, ws = make_target()
        admin, admin_u, _ = make_admin()
        r = issue(admin, target.pk, reason='Customer asked for help with imports')
        self.assertEqual(r.status_code, 200, r.content)
        ticket = r.json()['ticket']
        start(ticket)
        entered(ticket).post('/api/auth/impersonate/end/', {}, format='json')
        rows = {a.action: a for a in PlatformAuditLog.objects.filter(action__startswith='platform.impersonate.')}
        self.assertEqual(set(rows), {'platform.impersonate.issue', 'platform.impersonate.start',
                                    'platform.impersonate.end'})
        for action, row in rows.items():
            self.assertEqual(row.actor, admin_u, action)
            self.assertEqual(row.target_workspace, ws, action)
            self.assertEqual(row.meta['target_email'], target.email, action)
        self.assertEqual(rows['platform.impersonate.issue'].meta['reason'], 'Customer asked for help with imports')
        self.assertIn('duration_seconds', rows['platform.impersonate.end'].meta)
