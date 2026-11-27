"""One person, one e-mail; one company, one name (core.identity, migration 0051).

Every door asks core.identity first and answers in plain words, and the
database holds the same rules as unique indexes — so a door that forgets, a
command, the Django admin or a restored dump is stopped by the database
itself. (Live, 26 Nov 2026: two super admins shared one address.)"""

import os
from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import CommandError, call_command
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from core import identity
from core.models import AppSettings, User, Workspace
from core.tenancy import workspace_context
from core.tests.base import MigrationCase

PW = 'Zq7-hollow-River-93'


def body(**over):
    """A sign-up body that succeeds on its own."""
    d = {'company': 'Acme Rockets', 'name': 'Ann Lee', 'email': 'Ann@Acme.test', 'password': PW,
         'country': 'IN', 'plan_code': 'business', 'interval': 'month'}
    d.update(over)
    return d


def account(username, email='', **extra):
    return User.objects.create_user(username=username, password=PW, email=email, **extra)


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.c = APIClient()

    def sign_up(self, **over):
        return self.c.post('/api/auth/signup/', body(**over), format='json')


class HelpersTests(TestCase):
    def test_an_address_is_trimmed_and_lower_cased(self):
        self.assertEqual(identity.normalize_email('  Ann@Acme.TEST '), 'ann@acme.test')
        self.assertEqual(identity.normalize_email('ada@acme.test'), 'ada@acme.test')
        for nothing in (None, '', '   ', 5, {'email': 'x'}):
            self.assertEqual(identity.normalize_email(nothing), '')

    def test_a_company_key_ignores_case_and_spaces(self):
        self.assertEqual(identity.company_key('  Acme   Rockets '), 'acme rockets')
        self.assertEqual(identity.company_key('ACME rockets'), identity.company_key('acme rockets'))
        self.assertEqual(identity.company_key('Straße GmbH'), 'strasse gmbh')       # case-folded, not only lower-cased
        self.assertEqual(identity.company_key('   '), '')
        self.assertEqual(identity.company_key(None), '')
        self.assertLessEqual(len(identity.company_key('x' * 500)), 200)


class TakenTests(Base):
    def test_an_address_is_taken_by_any_account_whatever_its_case(self):
        self.assertFalse(identity.email_is_taken(' ada@acme.test '))
        account('ada', 'Ada@Acme.Test')
        self.assertTrue(identity.email_is_taken(' ada@acme.test '))
        self.assertTrue(identity.email_is_taken('ADA@ACME.TEST'))
        self.assertFalse(identity.email_is_taken('ada@acme.test', excluding=User.objects.get(username='ada').pk))
        self.assertFalse(identity.email_is_taken(''))

    def test_a_deleted_account_keeps_its_address(self):
        gone = account('gone', 'gone@acme.test')
        User.objects.filter(pk=gone.pk).update(deleted_at=timezone.now(), is_active=False)
        self.assertTrue(identity.email_is_taken('gone@acme.test'))

    def test_a_username_is_taken_ignoring_case(self):
        self.assertFalse(identity.username_is_taken('Admin'))
        account('admin')
        self.assertTrue(identity.username_is_taken(' Admin '))
        self.assertTrue(identity.username_is_taken('ADMIN'))
        self.assertFalse(identity.username_is_taken('admin', excluding=User.objects.get(username='admin').pk))
        self.assertFalse(identity.username_is_taken(''))


class DatabaseRulesTests(Base):
    """The database holds the rules itself. These write rows the way a command,
    a shell or a restored dump would — without the app's help — and it still
    refuses. (PostgreSQL live, SQLite here: Django builds the same unique
    indexes on both.)"""

    def test_an_address_is_stored_in_one_form(self):
        ada = account('ada', '  Ada@Acme.Test ')
        self.assertEqual(User.objects.get(pk=ada.pk).email, 'ada@acme.test')

    def test_two_accounts_cannot_share_an_address_whatever_its_case(self):
        account('ada', 'ada@acme.test')
        with transaction.atomic(), self.assertRaises(IntegrityError):
            User.objects.create_user(username='twin', password=PW, email=' ADA@Acme.Test ')
        self.assertEqual(User.objects.count(), 1)

    def test_a_write_the_app_did_not_normalise_is_stopped_too(self):
        account('ada', 'ada@acme.test')
        account('bea')
        with transaction.atomic(), self.assertRaises(IntegrityError):
            User.objects.filter(username='bea').update(email=' ADA@ACME.TEST ')
        self.assertEqual(User.objects.get(username='bea').email, '')

    def test_no_address_is_not_a_clash(self):
        account('a')
        account('b')
        self.assertEqual(User.objects.filter(email='').count(), 2)

    def test_a_deleted_account_keeps_its_address_reserved(self):
        gone = account('gone', 'gone@acme.test')
        User.objects.filter(pk=gone.pk).update(deleted_at=timezone.now(), is_active=False)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            account('again', 'gone@acme.test')

    def test_usernames_are_one_ignoring_case(self):
        account('admin')
        with transaction.atomic(), self.assertRaises(IntegrityError):
            account('Admin')

    def test_a_company_key_follows_its_name_however_it_is_written(self):
        ws = Workspace.all_tenants.create(name='  Acme   Rockets ', slug='acme')
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name_key, 'acme rockets')
        Workspace.all_tenants.filter(pk=ws.pk).update(name='ACME rockets')       # a name changed without save()
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name_key, 'acme rockets')

    def test_two_companies_cannot_share_a_name(self):
        make_ws('acme')                                                            # named "acme"
        for slug, name in (('acme-2', ' acme  '), ('acme-3', 'ACME')):
            with transaction.atomic(), self.assertRaises(IntegrityError):
                Workspace.all_tenants.create(name=name, slug=slug)
        self.assertEqual(Workspace.all_tenants.filter(name_key='acme').count(), 1)     # only the first one

    def test_a_stopped_company_keeps_its_name(self):
        make_ws('acme')
        Workspace.all_tenants.update(is_active=False)
        self.assertTrue(identity.company_name_is_taken(' ACME '))
        self.assertFalse(identity.company_name_is_taken('acme', excluding=Workspace.all_tenants.get(slug='acme').pk))
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Workspace.all_tenants.create(name='acme', slug='acme-2')


class MigrationReportTests(MigrationCase):
    def test_the_migration_stops_and_lists_what_clashes(self):
        """Two rows that share a name or an address are resolved by a person:
        migration 0051 refuses to run past them and says which rows."""
        old = self.state('0050_user_format_clock')
        OldWorkspace, OldUser = old.get_model('core', 'Workspace'), old.get_model('core', 'User')
        first = OldWorkspace.objects.create(name='Acme', slug='acme')
        second = OldWorkspace.objects.create(name=' acme ', slug='acme-2')
        people = [OldUser.objects.create(username='a', email='x@y.test'),
                  OldUser.objects.create(username='b', email=' X@Y.Test ')]
        try:
            with self.assertRaises(RuntimeError) as stopped:
                call_command('migrate', 'core', '0051_identity_uniqueness', verbosity=0)
            said = str(stopped.exception)
            self.assertIn(f'company name "acme" is on workspaces {[first.pk, second.pk]}', said)
            self.assertIn(f'e-mail x@y.test is on accounts {[u.pk for u in people]}', said)
            self.assertIn('resolved by a person', said)
            # nothing was built: the column the migration adds is not there
            with connection.cursor() as cursor:
                columns = [c.name for c in connection.introspection.get_table_description(cursor, 'core_workspace')]
            self.assertNotIn('name_key', columns)
        finally:
            OldUser.objects.filter(pk__in=[u.pk for u in people]).delete()
            OldWorkspace.objects.filter(pk__in=[first.pk, second.pk]).delete()


class SignupDoorTests(Base):
    def test_a_taken_address_in_another_case_or_with_spaces(self):
        self.assertEqual(self.sign_up().status_code, 201)
        for email in ('ANN@acme.test', ' ann@acme.test ', 'Ann@Acme.Test'):
            r = self.sign_up(email=email, company='Other Co')
            self.assertEqual((r.status_code, r.json()), (400, {'email': [identity.TAKEN_EMAIL]}), email)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Workspace.all_tenants.filter(name_key='other co').count(), 0)      # nothing half-made

    def test_a_taken_company_name(self):
        self.assertEqual(self.sign_up().status_code, 201)
        for company in ('acme rockets', ' ACME  ROCKETS ', 'Acme Rockets'):
            r = self.sign_up(email='bea@x.test', company=company)
            self.assertEqual((r.status_code, r.json()), (400, {'company': [identity.TAKEN_COMPANY]}), company)
        self.assertEqual(User.objects.count(), 1)

    def test_two_sign_ups_at_once_with_one_address(self):
        """The second passed its checks before the first was written: the
        database stops it, and the answer is the same words."""
        self.assertEqual(self.sign_up().status_code, 201)
        # the check saw nothing (first answer), the write met the database's rule, and the answer is read from what is held now (second)
        with mock.patch.object(identity, 'signup_address_in_use', side_effect=[False, True]):
            r = self.sign_up(email='ann@acme.test', company='Other Co')
        self.assertEqual((r.status_code, r.json()), (400, {'email': [identity.TAKEN_EMAIL]}))
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(Workspace.all_tenants.filter(name_key='other co').count(), 0)      # one transaction: nothing half-made

    def test_two_sign_ups_at_once_with_one_company_name(self):
        self.sign_up()
        with mock.patch.object(identity, 'company_name_is_taken', side_effect=[False, True]):
            r = self.sign_up(email='bea@x.test', company='ACME ROCKETS')
        self.assertEqual((r.status_code, r.json()), (400, {'company': [identity.TAKEN_COMPANY]}))
        self.assertEqual(User.objects.count(), 1)

    def test_an_error_that_is_not_ours_is_not_answered_with_a_guess(self):
        self.sign_up()
        with mock.patch.object(identity, 'signup_address_in_use', return_value=False), \
                mock.patch.object(identity, 'company_name_is_taken', return_value=False):
            with self.assertRaises(IntegrityError):
                self.sign_up(email='bea@x.test', company='ACME ROCKETS')
        self.assertEqual(User.objects.count(), 1)


class DoorsTests(Base):
    """The commands, the startup bootstrap, the Django admin and the rename door."""

    def test_create_platform_admin_refuses_a_taken_address(self):
        account('ada', 'ada@acme.test')
        with mock.patch('getpass.getpass', return_value=PW):
            for username, email in (('boss', ' ADA@ACME.TEST '), ('ADA', 'boss@acme.test')):
                with self.assertRaises(CommandError) as stopped:
                    call_command('create_platform_admin', username=username, email=email)
                self.assertIn('already', str(stopped.exception), (username, email))
        self.assertEqual(User.objects.count(), 1)

    def test_create_workspace_refuses_a_taken_name_username_or_address(self):
        ws = make_ws('acme')                                                   # named "acme"
        with workspace_context(ws):
            account('ada', 'ada@acme.test', workspace=ws)
        tries = (
            (('ACME', 'o1', 'bea', ''), 'company named'),
            (('Other', 'o2', 'ADA', ''), 'already exists'),
            (('Other', 'o3', 'bea', 'ADA@ACME.TEST'), 'already belongs'),
        )
        for (name, slug, owner, email), words in tries:
            with self.assertRaises(CommandError) as stopped:
                call_command('create_workspace', name=name, slug=slug, owner_username=owner,
                             owner_password=PW, owner_email=email)
            self.assertIn(words, str(stopped.exception), (name, slug, owner, email))
        self.assertFalse(Workspace.all_tenants.filter(slug__in=['o1', 'o2', 'o3']).exists())
        self.assertEqual(User.objects.count(), 1)

    def test_the_startup_bootstrap_never_makes_a_second_account(self):
        """It used to crash on a username taken elsewhere — taking the
        container down on every start — and never looked at the address."""
        other = make_ws('other')
        with workspace_context(other):
            account('someone', 'x@y.test', workspace=other)        # the default workspace stays empty: the bootstrap wants to make its owner
        for username, email in (('someone', 'fresh@y.test'), ('fresh', ' X@Y.TEST ')):
            out = StringIO()
            env = {'DEFAULT_TENANT_SLUG': 'bootstrap-co', 'DEFAULT_TENANT_NAME': 'Bootstrap Co',
                   'ADMIN_USERNAME': username, 'ADMIN_EMAIL': email, 'ADMIN_PASSWORD': PW}
            with mock.patch.dict(os.environ, env):
                call_command('bootstrap_admin', stdout=out)
            self.assertIn('already exists elsewhere — nothing to do', out.getvalue(), (username, email))
        self.assertEqual(User.objects.count(), 1)
        # with nothing taken it makes the owner once (the address in its one form), and no API token goes to the log
        out = StringIO()
        env = {'DEFAULT_TENANT_SLUG': 'bootstrap-co', 'DEFAULT_TENANT_NAME': 'Bootstrap Co',
               'ADMIN_USERNAME': 'fresh', 'ADMIN_EMAIL': ' Fresh@Y.test ', 'ADMIN_PASSWORD': PW}
        with mock.patch.dict(os.environ, env):
            call_command('bootstrap_admin', stdout=out)
            call_command('bootstrap_admin', stdout=StringIO())
        made = User.objects.get(username='fresh')
        self.assertEqual((made.email, made.role, made.workspace.slug), ('fresh@y.test', 'owner', 'bootstrap-co'))
        self.assertEqual(User.objects.count(), 2)
        self.assertNotIn('API token', out.getvalue())

    def test_the_startup_bootstrap_takes_no_other_companys_name(self):
        make_ws('other')                                                       # named "other"
        out = StringIO()
        with mock.patch.dict(os.environ, {'DEFAULT_TENANT_SLUG': 'bootstrap-co', 'DEFAULT_TENANT_NAME': 'Other',
                                          'ADMIN_USERNAME': 'fresh', 'ADMIN_PASSWORD': PW}):
            call_command('bootstrap_admin', stdout=out)
        self.assertIn('another company already has the name "Other"', out.getvalue())
        self.assertFalse(Workspace.all_tenants.filter(slug='bootstrap-co').exists())

    def test_the_django_admin_forms_refuse_a_taken_value(self):
        from core.admin import UserAdminForm, WorkspaceAdminForm
        ada = account('ada', 'ada@acme.test')
        make_ws('acme')
        form = UserAdminForm()
        form.cleaned_data = {'email': ' ADA@acme.test '}
        with self.assertRaises(ValidationError) as refused:
            form.clean_email()
        self.assertIn(identity.TAKEN_EMAIL, str(refused.exception))
        form.cleaned_data = {'username': 'ADA'}
        with self.assertRaises(ValidationError) as refused:
            form.clean_username()
        self.assertIn(identity.TAKEN_USERNAME, str(refused.exception))
        # a row's own value is not "taken" by itself
        form = UserAdminForm(instance=ada)
        form.cleaned_data = {'email': ' ada@acme.test '}
        self.assertEqual(form.clean_email(), 'ada@acme.test')
        form.cleaned_data = {'username': 'Ada'}
        self.assertEqual(form.clean_username(), 'Ada')
        form = WorkspaceAdminForm()
        form.cleaned_data = {'name': ' ACME '}
        with self.assertRaises(ValidationError) as refused:
            form.clean_name()
        self.assertIn(identity.TAKEN_COMPANY, str(refused.exception))
        form = WorkspaceAdminForm(instance=Workspace.all_tenants.get(slug='acme'))
        form.cleaned_data = {'name': 'ACME'}
        self.assertEqual(form.clean_name(), 'ACME')

    def test_a_rename_that_loses_a_race_gets_the_same_words(self):
        u = account('ada')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=u).key}')
        account('taken')
        r = c.post('/api/auth/change-username/', {'username': 'Taken'}, format='json')
        self.assertEqual((r.status_code, r.json()), (409, {'detail': identity.TAKEN_USERNAME}))
        with mock.patch.object(identity, 'username_is_taken', return_value=False):     # the check saw nothing, the save met the database's rule
            r = c.post('/api/auth/change-username/', {'username': 'Taken'}, format='json')
        self.assertEqual((r.status_code, r.json()), (409, {'detail': identity.TAKEN_USERNAME}))
        self.assertEqual(User.objects.get(pk=u.pk).username, 'ada')
        r = c.post('/api/auth/change-username/', {'username': 'ADA'}, format='json')    # its own name in another case
        self.assertEqual(r.status_code, 200)


class CompanyNameTests(Base):
    """One company, one name: a name another company has is refused at the
    door, and the workspace row takes the name that is saved."""

    def owner(self, slug='acme'):
        ws = make_ws(slug)                                                   # named "acme"
        with workspace_context(ws):
            u = account(f'{slug}-owner', workspace=ws, role='owner')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=u).key}')
        return ws, u, c

    def row(self, ws):
        with workspace_context(ws):
            return AppSettings.load()

    def test_settings_refuses_another_companys_name_and_renames_on_its_own(self):
        ws, _u, c = self.owner()
        make_ws('other')                                                     # named "other"
        r = c.put('/api/settings/', {'company': {'name': ' OTHER '}}, format='json')
        self.assertEqual((r.status_code, r.json()), (400, {'detail': identity.TAKEN_COMPANY}))
        r = c.put('/api/settings/', {'company': {'name': '  Acme   Rockets '}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(AppSettings.all_tenants.get(workspace=ws).company_name, 'Acme Rockets')
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name, 'Acme Rockets')      # the console shows the same name
        r = c.put('/api/settings/', {'company': {'name': 'ACME ROCKETS'}}, format='json')     # its own name, written another way
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name, 'ACME ROCKETS')

    def test_settings_changes_nothing_when_the_new_name_loses_a_race(self):
        ws, _u, c = self.owner()
        make_ws('other')
        with mock.patch.object(identity, 'company_name_is_taken', return_value=False):   # the check saw nothing, the rename met the database's rule
            r = c.put('/api/settings/', {'company': {'name': 'Other', 'website': 'https://other.test'}}, format='json')
        self.assertEqual((r.status_code, r.json()), (400, {'detail': identity.TAKEN_COMPANY}))
        row = AppSettings.all_tenants.get(workspace=ws)
        self.assertEqual((Workspace.all_tenants.get(pk=ws.pk).name, row.company_name, row.company_website), ('acme', '', ''))

    def test_a_typed_name_that_has_long_equalled_another_companys_name_blocks_nothing(self):
        """The name was typed before the rule existed. Re-saving it unchanged
        must go through (it would block every other setting otherwise), and
        it never renames the workspace onto another company."""
        ws, _u, c = self.owner()                                               # named "acme"
        make_ws('other')
        row = self.row(ws)
        row.company_name = 'Other'
        row.save(update_fields=['company_name'])
        r = c.put('/api/settings/', {'company': {'name': 'Other', 'website': 'https://acme.example'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(AppSettings.all_tenants.get(workspace=ws).company_website, 'https://acme.example')
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name, 'acme')

    def test_the_profile_fetch_keeps_the_current_name_when_the_new_one_is_taken(self):
        from core.business_profile import apply_profile
        ws, _u, _c = self.owner()
        make_ws('other')
        row = self.row(ws)
        row.company_name = 'Acme Rockets'
        row.save(update_fields=['company_name'])
        lines = apply_profile(row, {'name': 'Other', 'domain': 'other.example', 'services': ['Journals']})
        self.assertEqual(AppSettings.all_tenants.get(workspace=ws).company_name, 'Acme Rockets')
        self.assertTrue(lines[0].startswith('company name: kept "Acme Rockets"'), lines[0])
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name, 'acme')              # nothing moved
        lines = apply_profile(row, {'name': '  Acme   Industries ', 'domain': 'acme.example'})
        self.assertEqual(AppSettings.all_tenants.get(workspace=ws).company_name, 'Acme Industries')
        self.assertEqual(Workspace.all_tenants.get(pk=ws.pk).name, 'Acme Industries')

