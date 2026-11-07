"""Django admin is the platform operator's tool: superusers only, and it must
work across tenants without an ambient workspace."""

import sys
import unittest
from unittest import mock

from django.test import TestCase

from core.models import EmailDraft, Lead, User, Workspace
from core.tenancy import workspace_context


class AdminTenancyTests(TestCase):
    def setUp(self):
        # Django's test client copies the template context, which breaks on
        # Python 3.14; the admin pages here only need their status/body.
        patch = mock.patch('django.test.client.store_rendered_templates', lambda *a, **k: None)
        patch.start()
        self.addCleanup(patch.stop)
        self.a = Workspace.all_tenants.create(slug='adm-a', name='A')
        self.b = Workspace.all_tenants.create(slug='adm-b', name='B')
        with workspace_context(self.b):
            lead = Lead.objects.create(company='B Lead', contact_email='x@b.test')
            self.draft = EmailDraft.objects.create(
                lead=lead, company='B Lead', to_email='x@b.test', subject='s', body='b')
        self.root = User.objects.create_superuser('root', 'r@x.test', 'pw-root-123')
        self.staff = User.objects.create_user('staffer', password='pw-staff-123',
                                              workspace=self.a, role='owner', is_staff=True)

    @unittest.skipIf(sys.version_info >= (3, 13),
                     'Django 4.2 template contexts cannot be copied on Python >= 3.13 (prod: 3.11)')
    def test_superuser_sees_every_tenant_and_change_form_loads(self):
        self.client.force_login(self.root)
        r = self.client.get('/admin/core/emaildraft/')
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, 'B Lead')
        r = self.client.get(f'/admin/core/emaildraft/{self.draft.pk}/change/')
        self.assertEqual(r.status_code, 200)

    def test_unscoped_queryset_and_fk_picker_need_no_context(self):
        from django.contrib import admin
        from core.admin import EmailDraftAdmin
        ma = EmailDraftAdmin(EmailDraft, admin.site)
        self.assertEqual(list(ma.get_queryset(None).values_list('pk', flat=True)), [self.draft.pk])
        field = ma.get_form(mock.Mock(user=self.root), obj=self.draft)().fields['lead']
        self.assertEqual(field.queryset.count(), 1)

    def test_tenant_staff_user_is_locked_out(self):
        self.client.force_login(self.staff)
        for url in ('/admin/', '/admin/core/emaildraft/', '/admin/core/appsettings/'):
            r = self.client.get(url)
            self.assertEqual(r.status_code, 302, url)
            self.assertIn('/admin/login/', r['Location'])

    def test_admin_send_runs_in_the_drafts_own_workspace(self):
        from django.contrib import admin
        from core.admin import EmailDraftAdmin
        seen = []

        from core.outbox import enqueue_draft

        def spy_enqueue(draft_id, *args, **kwargs):
            from core.tenancy import current_workspace
            seen.append(current_workspace().pk)
            return enqueue_draft(draft_id, *args, **kwargs)

        ma = EmailDraftAdmin(EmailDraft, admin.site)
        with mock.patch('core.admin.enqueue_draft', spy_enqueue), \
                mock.patch.object(ma, 'message_user'):
            ma.approve_and_send(None, EmailDraft.all_tenants.filter(pk=self.draft.pk))
        self.assertEqual(seen, [self.b.pk])
