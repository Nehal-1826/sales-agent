"""
Tests for core.serializers — verifies JSON shapes match frontend expectations.
"""
from django.test import TestCase

from core.models import AgentConfig, AppSettings, EmailDraft, Lead, Potential, Reply
from core.serializers import (
    AgentConfigSerializer,
    EmailDraftSerializer,
    LeadSerializer,
    PotentialSerializer,
    ReplySerializer,
    SettingsSerializer,
)


class LeadSerializerTests(TestCase):
    def test_output_shape(self):
        lead = Lead.objects.create(
            company='SerCo', industry='SaaS', website='serco.com',
            score=75, has_website=True, contact_email='hi@serco.com',
            findings=[{'area': 'SEO', 'severity': 'high', 'issue': 'Bad', 'recommendation': 'Fix'}],
        )
        data = LeadSerializer(lead).data
        self.assertEqual(data['company'], 'SerCo')
        self.assertTrue(data['hasWebsite'])
        self.assertEqual(data['contactEmail'], 'hi@serco.com')
        self.assertIn('discovered', data)
        self.assertEqual(len(data['findings']), 1)

    def test_discovered_is_relative_time(self):
        lead = Lead.objects.create(company='TimeCo', score=50)
        data = LeadSerializer(lead).data
        self.assertIn('discovered', data)
        self.assertIsInstance(data['discovered'], str)


class EmailDraftSerializerTests(TestCase):
    def test_output_shape(self):
        draft = EmailDraft.objects.create(
            company='DraftCo', to_email='x@y.com', subject='Hi', body='Body',
        )
        data = EmailDraftSerializer(draft).data
        self.assertEqual(data['company'], 'DraftCo')
        self.assertEqual(data['toEmail'], 'x@y.com')
        self.assertIn('lastActivity', data)
        self.assertIn('status', data)


class PotentialSerializerTests(TestCase):
    def test_stage_is_display(self):
        pot = Potential.objects.create(
            company='PotCo', opportunity='Deal', value='$5k', stage='qualified',
        )
        data = PotentialSerializer(pot).data
        self.assertEqual(data['stage'], 'Qualified')
        self.assertIn('owner', data)


class ReplySerializerTests(TestCase):
    def test_channel_and_status_display(self):
        reply = Reply.objects.create(
            company='RepCo', contact='J', channel='email', status='meeting',
        )
        data = ReplySerializer(reply).data
        self.assertEqual(data['channel'], 'Email')
        self.assertEqual(data['status'], 'Meeting booked')


class AgentConfigSerializerTests(TestCase):
    def test_nested_structure(self):
        cfg = AgentConfig.objects.create(
            agent='search', db_provider='postgresql', db_name='test',
            api_url='https://api.test', system_prompt='SP', model='GPT-4o',
        )
        data = AgentConfigSerializer(cfg).data
        self.assertEqual(data['db']['provider'], 'postgresql')
        self.assertEqual(data['api']['url'], 'https://api.test')
        self.assertEqual(data['systemPrompt'], 'SP')
        self.assertEqual(data['model'], 'GPT-4o')


class SettingsSerializerTests(TestCase):
    def test_api_key_masked(self):
        s = AppSettings.load()
        s.ai_key = 'sk-1234567890abcdef'
        s.save()
        data = SettingsSerializer(s).data
        self.assertTrue(data['aiKey']['apiKey'].startswith('••••'))
        self.assertNotIn('1234567890', data['aiKey']['apiKey'])

    def test_smtp_password_masked(self):
        s = AppSettings.load()
        s.smtp_password = 'mysecretpass'
        s.save()
        data = SettingsSerializer(s).data
        self.assertTrue(data['smtp']['password'].startswith('••••'))

    def test_company_fields(self):
        s = AppSettings.load()
        s.company_name = 'TestCorp'
        s.services = ['SEO', 'Web']
        s.save()
        data = SettingsSerializer(s).data
        self.assertEqual(data['company']['name'], 'TestCorp')
        self.assertEqual(data['company']['services'], ['SEO', 'Web'])
