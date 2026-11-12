"""Per-workspace state: settings, env secrets, run lock, uniques, owner logic."""

import os
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import TestCase

from core import runlock
from core.models import AgentConfig, AppSettings, SearchProfile, User, Workspace
from core.tenancy import current_workspace, workspace_context


class PerWorkspaceStateTests(TestCase):
    def setUp(self):
        self.a = Workspace.all_tenants.create(slug='a-co', name='A Co')
        self.b = Workspace.all_tenants.create(slug='b-co', name='B Co')

    def test_app_settings_independent(self):
        with workspace_context(self.a):
            s = AppSettings.load()
            s.company_name = 'Alpha'
            s.save(update_fields=['company_name'])
        with workspace_context(self.b):
            self.assertEqual(AppSettings.load().company_name, '')
        with workspace_context(self.a):
            self.assertEqual(AppSettings.load().company_name, 'Alpha')
        self.assertEqual(AppSettings.all_tenants.filter(workspace__in=[self.a, self.b]).count(), 2)

    def test_env_secrets_only_for_default_tenant(self):
        env = {'DEFAULT_TENANT_SLUG': 'a-co', 'AI_KEY': 'k-env', 'AI_PROVIDER': 'Gemini',
               'SCALELIST_API_KEY': 'sl', 'APIFY_API_KEY': 'ap'}
        with mock.patch.dict(os.environ, env):
            with workspace_context(self.a):
                s = AppSettings.load()
                self.assertEqual((s.ai_key, s.scalelist_api_key, s.apify_api_key), ('k-env', 'sl', 'ap'))
            with workspace_context(self.b):
                s = AppSettings.load()
                self.assertEqual((s.ai_key, s.scalelist_api_key, s.apify_api_key), ('', '', ''))

    def test_default_tenant_slug_falls_back_to_shailog(self):
        shailog = Workspace.all_tenants.get(slug='shailog')  # created by migration 0022
        env = {k: v for k, v in os.environ.items() if k != 'DEFAULT_TENANT_SLUG'}
        env['AI_KEY'] = 'k-env'
        with mock.patch.dict(os.environ, env, clear=True):
            with workspace_context(shailog):
                self.assertEqual(AppSettings.load().ai_key, 'k-env')
            with workspace_context(self.a):
                self.assertEqual(AppSettings.load().ai_key, '')

    def test_enrichment_keys_come_from_the_workspace(self):
        from core.apify_maps import apify_available
        from core.scalelist import scalelist_available
        with mock.patch.dict(os.environ, {'DEFAULT_TENANT_SLUG': 'zzz'}):
            with workspace_context(self.a):
                s = AppSettings.load()
                s.scalelist_api_key = 'x'
                s.apify_api_key = 'y'
                s.save(update_fields=['scalelist_api_key', 'apify_api_key'])
                self.assertTrue(scalelist_available() and apify_available())
            with workspace_context(self.b):
                self.assertFalse(scalelist_available() or apify_available())

    def test_run_lock_independent(self):
        with workspace_context(self.a):
            token_a = runlock.acquire_run_lock()
            self.assertTrue(token_a)
            self.assertIsNone(runlock.acquire_run_lock())
        with workspace_context(self.b):
            self.assertIsNone(runlock.running_since())
            self.assertTrue(runlock.acquire_run_lock())
        with workspace_context(self.a):
            self.assertEqual(runlock.running_since(), token_a)

    def test_same_agent_in_two_workspaces(self):
        with workspace_context(self.a):
            AgentConfig.objects.create(agent='search')
            with self.assertRaises(IntegrityError), transaction.atomic():
                AgentConfig.objects.create(agent='search')
            SearchProfile.objects.create(name='P')
        with workspace_context(self.b):
            AgentConfig.objects.create(agent='search')
            SearchProfile.objects.create(name='P')

    def test_first_user_in_workspace_is_owner(self):
        with workspace_context(self.a):
            first = User.objects.create_user(username='u1', password='x')
            second = User.objects.create_user(username='u2', password='x')
        with workspace_context(self.b):
            other = User.objects.create_user(username='u3', password='x')
        self.assertEqual((first.role, second.role, other.role), ('owner', 'member', 'owner'))
        self.assertEqual(first.workspace, self.a)
        su = User.objects.create_superuser(username='root', password='x')
        self.assertIsNone(su.workspace)

    def test_context_restored(self):
        self.assertIsNone(current_workspace())
        with workspace_context(self.a):
            self.assertEqual(current_workspace(), self.a)
        self.assertIsNone(current_workspace())


class CreateWorkspaceCommandTests(TestCase):
    def test_creates_workspace_owner_and_settings(self):
        out = StringIO()
        call_command('create_workspace', '--name', 'New Co', '--slug', 'new-co',
                     '--owner-username', 'boss', '--owner-password', 'Pw-for-test-1',
                     stdout=out)
        self.assertNotIn('Pw-for-test-1', out.getvalue())
        ws = Workspace.all_tenants.get(slug='new-co')
        boss = User.objects.get(username='boss')
        self.assertEqual((boss.workspace, boss.role), (ws, 'owner'))
        self.assertEqual(AppSettings.all_tenants.filter(workspace=ws).count(), 1)

    def test_duplicate_slug_refused(self):
        Workspace.all_tenants.create(slug='dup', name='Dup')
        with self.assertRaises(CommandError):
            call_command('create_workspace', '--name', 'X', '--slug', 'dup',
                         '--owner-username', 'o', '--owner-password', 'p')
        self.assertFalse(User.objects.filter(username='o').exists())
