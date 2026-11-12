"""Tenant isolation foundation: strict manager, stamping, per-workspace state."""

import os
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from core import runlock
from core.models import AgentConfig, AppSettings, EmailDraft, Lead, Potential, SearchProfile, User, Workspace
from core.tenancy import TenantContextMissing, current_workspace, workspace_context


class TenancyBase(TestCase):
    """Two workspaces, NO ambient context — each test enters its own."""

    def setUp(self):
        self.a = Workspace.all_tenants.create(slug='a-co', name='A Co')
        self.b = Workspace.all_tenants.create(slug='b-co', name='B Co')


class StrictManagerTests(TenancyBase):
    def test_raises_without_context(self):
        with self.assertRaises(TenantContextMissing):
            list(Lead.objects.all())
        with self.assertRaises(TenantContextMissing):
            Lead.objects.create(company='x')
        with self.assertRaises(TenantContextMissing):
            AppSettings.load()

    def test_scoped_queries_see_only_own_rows(self):
        with workspace_context(self.a):
            Lead.objects.create(company='A1')
        with workspace_context(self.b):
            Lead.objects.create(company='B1')
            self.assertEqual([x.company for x in Lead.objects.all()], ['B1'])
            self.assertEqual(Lead.objects.filter(company='A1').count(), 0)
        self.assertEqual(Lead.all_tenants.count(), 2)

    def test_create_stamps_workspace(self):
        with workspace_context(self.a):
            lead = Lead.objects.create(company='A1')
            self.assertEqual(lead.workspace, self.a)
            Lead(company='A2').save()
            self.assertEqual(Lead.objects.get(company='A2').workspace, self.a)

    def test_explicit_matching_workspace_ok_mismatch_raises(self):
        with workspace_context(self.a):
            Lead.objects.create(company='ok', workspace=self.a)
            with self.assertRaises(ValueError):
                Lead.objects.create(company='bad', workspace=self.b)
            with self.assertRaises(ValueError):
                Lead(company='bad2', workspace=self.b).save()

    def test_bulk_helpers_stay_scoped(self):
        with workspace_context(self.a):
            Lead.objects.bulk_create([Lead(company='A1')])
        with workspace_context(self.b):
            Lead.objects.create(company='B1')
            Lead.objects.all().update(score=9)
            Lead.objects.all().delete()
        with workspace_context(self.a):
            lead = Lead.objects.get()
            self.assertEqual(lead.score, 0)

    def test_fk_parent_in_other_workspace_raises(self):
        with workspace_context(self.a):
            lead = Lead.objects.create(company='A1')
        with workspace_context(self.b):
            with self.assertRaises(ValueError):
                EmailDraft.objects.create(company='x', lead=lead)
            with self.assertRaises(ValueError):
                Potential.objects.create(company='x', opportunity='o', lead=lead)
        with workspace_context(self.a):
            EmailDraft.objects.create(company='x', lead=lead)
