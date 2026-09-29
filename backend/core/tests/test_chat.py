"""
Tests for core.chat — Responder reply generation.

Verifies the keyword fallback always works and that the LLM path
is attempted when available (mocked).
"""
from unittest.mock import patch

from django.test import TestCase

from core.chat import responder_reply, _keyword_reply, _crm_snapshot
from core.models import AppSettings, Lead, Potential, Reply


class KeywordReplyTests(TestCase):
    """Keyword-based fallback replies — no LLM needed."""

    def test_greeting(self):
        reply = _keyword_reply('hello')
        self.assertIn('Hello', reply)
        self.assertIn('leads', reply)

    def test_lead_query_no_data(self):
        reply = _keyword_reply('show me the leads')
        self.assertIn('No leads yet', reply)

    def test_lead_query_with_data(self):
        Lead.objects.create(company='TestCo', score=90)
        reply = _keyword_reply('what leads do we have')
        self.assertIn('TestCo', reply)

    def test_email_query(self):
        Lead.objects.create(company='EmailCo', industry='Tech', score=80, profiled=True)
        reply = _keyword_reply('draft an email')
        self.assertIn('EmailCo', reply)

    def test_reply_query_no_data(self):
        reply = _keyword_reply('any replies?')
        self.assertIn('all caught up', reply)

    def test_reply_query_with_data(self):
        Reply.objects.create(company='ReplyCo', contact='J', channel='email', status='awaiting')
        reply = _keyword_reply('check replies')
        self.assertIn('ReplyCo', reply)

    def test_schedule_query(self):
        AppSettings.load()  # ensure settings exist
        reply = _keyword_reply('when is the next run')
        self.assertIn('orchestrator', reply)

    def test_potential_query_no_data(self):
        reply = _keyword_reply('what potential deals')
        self.assertIn('No potential', reply)

    def test_potential_query_with_data(self):
        Potential.objects.create(company='BigDeal', opportunity='Website', value='$10,000', stage='qualified')
        reply = _keyword_reply('show pipeline value')
        self.assertIn('BigDeal', reply)

    def test_fallback(self):
        reply = _keyword_reply('random gibberish 12345')
        # should return one of the FALLBACK_REPLIES
        self.assertTrue(len(reply) > 20)


class CrmSnapshotTests(TestCase):
    """CRM snapshot string generation for LLM context."""

    def test_snapshot_empty(self):
        snapshot = _crm_snapshot()
        self.assertIn('CRM SNAPSHOT', snapshot)
        self.assertIn('0 leads', snapshot)

    def test_snapshot_with_data(self):
        Lead.objects.create(company='SnapCo', industry='Tech', score=85)
        snapshot = _crm_snapshot()
        self.assertIn('SnapCo', snapshot)
        self.assertIn('1 leads', snapshot)


class ResponderReplyIntegrationTests(TestCase):
    """Test responder_reply() dispatches correctly."""

    def test_falls_back_to_keyword_when_no_key(self):
        """Without an AI key, keyword logic is used."""
        reply = responder_reply('hello', turn=0)
        self.assertIn('Hello', reply)

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', return_value='LLM says hello')
    def test_uses_llm_when_available(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertEqual(reply, 'LLM says hello')
        mock_llm.assert_called_once()

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', return_value=None)
    def test_falls_back_when_llm_returns_none(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertIn('Hello', reply)  # keyword fallback

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', side_effect=Exception('API error'))
    def test_falls_back_on_llm_exception(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertIn('Hello', reply)  # keyword fallback
