"""Config-level security hardening: JWT-secret validation + prod docs-off.

Covers the final-review fixes in app/config.py and app/main.py:
  * placeholder/short JWT_SECRET refused outside development
  * interactive docs (/docs, /redoc, /openapi.json) disabled in production
"""
from __future__ import annotations

import pytest


GOOD_SECRET = "unit-test-secret-" + "x" * 32   # 32+ chars, not a placeholder


class TestStrongJwtSecretValidator:
    def test_production_accepts_long_random_secret(self):
        from app.config import Settings

        s = Settings(APP_ENV="production", JWT_SECRET=GOOD_SECRET)
        assert s.jwt_secret == GOOD_SECRET

    @pytest.mark.parametrize(
        "bad",
        [
            "",                                   # unset
            "change-me-in-production",            # legacy placeholder
            "replace_me_random_64_bytes",         # .env.example placeholder
            "GENERATE_ME",                        # .env.docker.example placeholder
        ],
    )
    def test_production_refuses_placeholder_secrets(self, bad):
        from app.config import Settings

        with pytest.raises(ValueError, match="strong random value"):
            Settings(APP_ENV="production", JWT_SECRET=bad)

    def test_production_refuses_short_secret(self):
        from app.config import Settings

        with pytest.raises(ValueError, match="at least 32 characters"):
            Settings(APP_ENV="production", JWT_SECRET="short-but-real-secret-123")

    def test_development_allows_short_placeholder_secret(self):
        from app.config import Settings

        # dev/test keeps booting with weak secrets (local iteration speed)
        s = Settings(APP_ENV="development", JWT_SECRET="change-me-in-production")
        assert s.jwt_secret == "change-me-in-production"


class TestDocsDisabledInProduction:
    def test_docs_enabled_property_tracks_app_env(self):
        from app.config import Settings

        assert Settings(APP_ENV="development", JWT_SECRET=GOOD_SECRET).docs_enabled is True
        assert Settings(APP_ENV="test", JWT_SECRET=GOOD_SECRET).docs_enabled is True
        assert Settings(APP_ENV="production", JWT_SECRET=GOOD_SECRET).docs_enabled is False
        assert Settings(APP_ENV="staging", JWT_SECRET=GOOD_SECRET).docs_enabled is False

    def test_create_app_mounts_no_docs_routes_in_production(self, monkeypatch):
        """The app factory must pass docs_url/redoc_url/openapi_url=None in prod."""
        from app.config import get_settings
        from app.main import create_app

        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET", GOOD_SECRET)
        get_settings.cache_clear()
        try:
            app = create_app()
            assert app.docs_url is None
            assert app.redoc_url is None
            assert app.openapi_url is None
        finally:
            get_settings.cache_clear()   # re-read restored env for other tests
