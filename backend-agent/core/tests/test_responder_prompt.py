"""The Responder IS the Assistant: its seeded job description must say so."""

from core.models import AgentConfig
from core.tests.base import TenantTestCase
from core.workspaces import (OLD_RESPONDER_NEGATIVE, OLD_RESPONDER_PROMPT, RESPONDER_NEGATIVE,
                             RESPONDER_PROMPT, AGENT_DEFAULTS, fix_responder_prompt)


class ResponderPromptTests(TenantTestCase):
    def test_new_workspaces_seed_the_assistants_real_job(self):
        self.assertEqual(AGENT_DEFAULTS['responder']['system_prompt'], RESPONDER_PROMPT)
        self.assertNotIn('book meetings', RESPONDER_PROMPT.lower())
        self.assertIn('never with a customer', RESPONDER_PROMPT)

    def test_rows_still_on_the_old_default_are_pointed_at_the_real_job(self):
        stale = AgentConfig.objects.create(agent='responder', system_prompt=OLD_RESPONDER_PROMPT,
                                           negative_prompt=OLD_RESPONDER_NEGATIVE)
        AgentConfig.objects.create(agent='search', system_prompt=OLD_RESPONDER_PROMPT)
        self.assertEqual(fix_responder_prompt(), 2)
        stale.refresh_from_db()
        self.assertEqual(stale.system_prompt, RESPONDER_PROMPT)
        self.assertEqual(stale.negative_prompt, RESPONDER_NEGATIVE)
        self.assertEqual(AgentConfig.objects.get(agent='search').system_prompt, OLD_RESPONDER_PROMPT)

    def test_a_prompt_the_workspace_wrote_itself_is_untouched(self):
        own = AgentConfig.objects.create(agent='responder', system_prompt='Answer in a pirate voice.',
                                         negative_prompt=OLD_RESPONDER_NEGATIVE)
        fix_responder_prompt()
        own.refresh_from_db()
        self.assertEqual(own.system_prompt, 'Answer in a pirate voice.')
        self.assertEqual(own.negative_prompt, RESPONDER_NEGATIVE)      # only the untouched part moves

    def test_running_twice_changes_nothing_the_second_time(self):
        AgentConfig.objects.create(agent='responder', system_prompt=OLD_RESPONDER_PROMPT,
                                   negative_prompt=OLD_RESPONDER_NEGATIVE)
        fix_responder_prompt()
        self.assertEqual(fix_responder_prompt(), 0)
