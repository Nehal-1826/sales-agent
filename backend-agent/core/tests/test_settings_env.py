"""Settings env parsing — CSRF_TRUSTED_ORIGINS (C3 infra hardening).

The setting is read from the ``CSRF_TRUSTED_ORIGINS`` env var (comma
separated, whitespace stripped, empty default) via ``agentic.settings._env_csv``.
Bad-input choice: TOLERATED — scheme-less entries pass through verbatim and
Django itself rejects them at request time, instead of the settings module
refusing to boot.
"""

import importlib
import os
from unittest import mock

from django.test import SimpleTestCase

from agentic import settings as agentic_settings


class EnvCsvHelperTests(SimpleTestCase):
    """agentic.settings._env_csv — the parse behind CSRF_TRUSTED_ORIGINS."""

    def test_missing_env_is_empty_list(self):
        env = os.environ.pop('CSRF_TRUSTED_ORIGINS', None)
        try:
            self.assertEqual(agentic_settings._env_csv('CSRF_TRUSTED_ORIGINS'), [])
        finally:
            if env is not None:
                os.environ['CSRF_TRUSTED_ORIGINS'] = env

    def test_parses_scheme_host_list_stripping_whitespace_and_empties(self):
        with mock.patch.dict(os.environ, {
            'CSRF_TRUSTED_ORIGINS': ' https://a.example.com , https://b.example.com ,, ,',
        }):
            self.assertEqual(
                agentic_settings._env_csv('CSRF_TRUSTED_ORIGINS'),
                ['https://a.example.com', 'https://b.example.com'],
            )

    def test_scheme_less_entry_tolerated_verbatim(self):
        # Picked behaviour: tolerate at parse time; Django rejects scheme-less
        # origins at request time, so the failure surfaces on the exact request.
        with mock.patch.dict(os.environ, {'CSRF_TRUSTED_ORIGINS': 'myagent.com'}):
            self.assertEqual(
                agentic_settings._env_csv('CSRF_TRUSTED_ORIGINS'),
                ['myagent.com'],
            )


class CsrfTrustedOriginsWiringTests(SimpleTestCase):
    """The SETTING itself is wired to the env var (not just the helper)."""

    def tearDown(self):
        # leave sys.modules holding a module matching the real environment
        importlib.reload(agentic_settings)

    def test_env_override_parses_into_setting(self):
        with mock.patch.dict(os.environ, {
            'CSRF_TRUSTED_ORIGINS': 'https://a.example.com,https://b.example.com',
            'PUBLIC_BASE_URL': '',
        }):
            reloaded = importlib.reload(agentic_settings)
            self.assertEqual(
                reloaded.CSRF_TRUSTED_ORIGINS,
                ['https://a.example.com', 'https://b.example.com'],
            )
            # PUBLIC_BASE_URL falls back to the first trusted origin
            self.assertEqual(reloaded.PUBLIC_BASE_URL, 'https://a.example.com')
