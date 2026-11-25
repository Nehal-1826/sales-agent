"""Test base for tenant-scoped code: every test runs inside a workspace.

The workspace is activated in _pre_setup (before setUp), so subclasses may
override setUp() freely without calling super().setUp().

`workspace_slug = 'shailog'` on a subclass selects the workspace the data
migrations seeded (profiles from 0015/0020), for tests that rely on those rows."""

import os
from unittest import mock

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase

from core.models import AppSettings, Workspace
from billing.services import ensure_manual_subscription
from core.tenancy import reset_workspace, set_workspace


def lead_ready(**overrides):
    """Give the current workspace proper data so lead finding is allowed
    (core.lead_gate): a company name, something it sells and who to find.
    A test that starts a cycle on a fresh workspace calls this first — the
    gate refuses to run on an empty one, as it should."""
    s = AppSettings.load()
    s.company_name = 'Acme Journals'
    s.services = ['Journal publishing']
    s.icp_mode = 'buyer'
    s.target_industries = 'university'
    for field, value in overrides.items():
        setattr(s, field, value)
    s.save()
    return s


class TenantTestCase(TestCase):
    workspace_slug = 'test'

    def lead_ready(self, **overrides):
        return lead_ready(**overrides)

    def _pre_setup(self):
        super()._pre_setup()
        self.workspace, _ = Workspace.all_tenants.get_or_create(
            slug=self.workspace_slug, defaults={'name': 'Test Co'})
        ensure_manual_subscription(self.workspace)  # paid access; the paywall stays strict
        token = set_workspace(self.workspace)
        self.addCleanup(reset_workspace, token)
        # Env secrets are absorbed only for the default tenant; existing tests
        # that patch AI_KEY / APIFY_API_KEY exercise the default-tenant path.
        env = mock.patch.dict(os.environ, {'DEFAULT_TENANT_SLUG': self.workspace_slug})
        env.start()
        self.addCleanup(env.stop)


class MigrationCase(TransactionTestCase):
    """A test that drives the REAL migrations. `state(name)` takes the schema
    to one migration and returns that migration's app registry.

    When the test is over the schema is back at the newest migration, whatever
    the test did. Test classes do not run in migration order: a test that
    stops at an old migration leaves every class that runs after it on that
    old schema — unnoticed until one of them needs a newer column (the day
    `Workspace.deleted_at` arrived, three thread tests broke)."""

    app = 'core'

    def setUp(self):
        super().setUp()
        self.addCleanup(self.to_newest)

    def to_newest(self):
        call_command('migrate', self.app, verbosity=0)

    def state(self, name):
        call_command('migrate', self.app, name, verbosity=0)
        return MigrationExecutor(connection).loader.project_state([(self.app, name)]).apps
