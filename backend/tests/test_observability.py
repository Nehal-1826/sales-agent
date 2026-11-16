"""Tests for the Sentry init seam.

The init helper is gated on ``SENTRY_DSN`` and must be a complete no-op
when the DSN is unset — including not raising if ``sentry_sdk`` itself
isn't installed in the environment. Both branches are tested.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app import observability
from app.config import Settings


@pytest.fixture(autouse=True)
def _reset_init_guard() -> None:
    observability.reset_for_tests()


def _settings(**overrides: object) -> Settings:
    """Build a minimal Settings object for the helper without touching env."""
    base: dict[str, object] = {
        "sentry_dsn": "",
        "sentry_environment": "",
        "sentry_traces_sample_rate": 0.0,
        "app_env": "test",
    }
    base.update(overrides)

    class _StubSettings:
        sentry_dsn = base["sentry_dsn"]
        sentry_environment = base["sentry_environment"]
        sentry_traces_sample_rate = base["sentry_traces_sample_rate"]
        app_env = base["app_env"]

    return _StubSettings()  # type: ignore[return-value]


def test_init_sentry_noop_without_dsn() -> None:
    assert observability.init_sentry(_settings(sentry_dsn="")) is False


def test_init_sentry_initializes_when_dsn_present() -> None:
    """A valid DSN flips the guard to True even with traces disabled."""
    pytest.importorskip("sentry_sdk")
    import sentry_sdk

    with patch.object(sentry_sdk, "init") as init_call:
        ok = observability.init_sentry(
            _settings(sentry_dsn="https://public@sentry.example/1")
        )
    assert ok is True
    assert init_call.call_count == 1
    kwargs = init_call.call_args.kwargs
    assert kwargs["dsn"] == "https://public@sentry.example/1"
    assert kwargs["send_default_pii"] is False


def test_init_sentry_idempotent() -> None:
    """Repeat calls don't re-bind the SDK — the guard short-circuits."""
    pytest.importorskip("sentry_sdk")
    import sentry_sdk

    with patch.object(sentry_sdk, "init") as init_call:
        observability.init_sentry(
            _settings(sentry_dsn="https://public@sentry.example/2")
        )
        observability.init_sentry(
            _settings(sentry_dsn="https://public@sentry.example/2")
        )
    assert init_call.call_count == 1


def test_init_sentry_swallows_missing_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    """If sentry_sdk isn't importable, init logs and returns False — not raises."""
    # Pretend sentry_sdk failed to import. We can't actually unimport it cleanly
    # in tests, so we monkeypatch the import inside the helper to raise.
    real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__  # type: ignore[index]

    def _fake_import(name: str, *args: object, **kwargs: object):
        if name == "sentry_sdk" or name.startswith("sentry_sdk."):
            raise ModuleNotFoundError(f"forced for test: {name}")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", _fake_import)
    assert (
        observability.init_sentry(
            _settings(sentry_dsn="https://public@sentry.example/3")
        )
        is False
    )


def test_capture_exception_noop_when_uninitialized() -> None:
    """Should never raise even when Sentry is off."""
    observability.capture_exception(RuntimeError("ignored"))
