"""Test base for tenant-scoped code: every test runs inside a workspace.

The workspace is activated in _pre_setup (before setUp), so subclasses may
override setUp() freely without calling super().setUp().

`workspace_slug = 'shailog'` on a subclass selects the workspace the data
migrations seeded (profiles from 0015/0020), for tests that rely on those rows."""

import os
from unittest import mock

from django.test import TestCase

from core.models import Workspace
from billing.services import ensure_manual_subscription
from core.tenancy import reset_workspace, set_workspace


class TenantTestCase(TestCase):
    workspace_slug = 'test'

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
