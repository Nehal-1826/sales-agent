"""Transient-SMTP retry for transactional mail.

The platform mail server intermittently answers
``451 4.3.5 ... Server configuration problem`` while its backing database is
briefly unavailable. A 4xx is retryable by definition, but the service used to
treat every exception as fatal, so a few seconds of database trouble
permanently dropped a user's signup / login / 2FA email.

These tests pin the retry policy: 4xx and connection errors retry, 5xx does
not, and the backoff tuple can never be indexed past its end.
"""
from __future__ import annotations

import asyncio

import pytest

from app.services import transactional_mail as tm


class _Refused(Exception):
    """Mimics aiosmtplib.SMTPRecipientsRefused: carries a `recipients` dict."""

    def __init__(self, code: int) -> None:
        super().__init__(f"{code} refused")

        class _R:
            def __init__(self, c: int) -> None:
                self.code = c

        self.recipients = {"someone@example.com": _R(code)}


class _Coded(Exception):
    """Mimics a plain SMTPResponseException: carries a `code`."""

    def __init__(self, code: int) -> None:
        super().__init__(f"{code}")
        self.code = code


# --------------------------------------------------------------------------- #
# classifier                                                                  #
# --------------------------------------------------------------------------- #


def test_451_recipient_refusal_is_transient() -> None:
    """The exact production failure must be classified retryable."""
    assert tm._is_transient_smtp_error(_Refused(451)) is True


def test_550_recipient_refusal_is_permanent() -> None:
    """A real 'no such mailbox' must NOT be retried."""
    assert tm._is_transient_smtp_error(_Refused(550)) is False


def test_4xx_response_code_is_transient() -> None:
    assert tm._is_transient_smtp_error(_Coded(421)) is True


def test_5xx_response_code_is_permanent() -> None:
    assert tm._is_transient_smtp_error(_Coded(535)) is False


def test_connection_errors_are_transient() -> None:
    """No SMTP verdict at all — worth another attempt."""
    assert tm._is_transient_smtp_error(ConnectionRefusedError()) is True
    assert tm._is_transient_smtp_error(asyncio.TimeoutError()) is True


def test_unknown_error_without_code_is_not_retried() -> None:
    assert tm._is_transient_smtp_error(ValueError("nope")) is False


# --------------------------------------------------------------------------- #
# retry loop                                                                  #
# --------------------------------------------------------------------------- #


def test_backoff_table_covers_every_retry() -> None:
    """Guards the off-by-one that would IndexError on the final attempt.

    The loop sleeps once per retry, i.e. _MAX_SEND_ATTEMPTS - 1 times, so the
    backoff tuple must be at least that long.
    """
    assert len(tm._RETRY_BACKOFF_SECONDS) >= tm._MAX_SEND_ATTEMPTS - 1


@pytest.fixture
def _no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the retry tests instant."""

    async def _instant(_seconds: float) -> None:
        return None

    monkeypatch.setattr(tm.asyncio, "sleep", _instant)


@pytest.fixture
def _smtp_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force a configured (non-dry-run) SMTP config."""

    async def _cfg() -> tm._SmtpConfig:
        return tm._SmtpConfig(
            host="mail.example.com",
            port=587,
            username="u",
            password="p",
            from_addr="WarmPulse <noreply@example.com>",
            starttls=True,
            source="env",
        )

    monkeypatch.setattr(tm, "_resolve_smtp_config", _cfg)


async def test_recovers_when_a_transient_failure_clears(
    monkeypatch: pytest.MonkeyPatch, _no_sleep: None, _smtp_configured: None
) -> None:
    """Two 451s then success — the user still gets their email."""
    calls = {"n": 0}

    async def _send(*_a, **_kw) -> None:
        calls["n"] += 1
        if calls["n"] < 3:
            raise _Refused(451)

    monkeypatch.setattr(tm.aiosmtplib, "send", _send)

    result = await tm.send_transactional(
        to="user@example.com", subject="Welcome", body_text="hi"
    )

    assert result == {"status": "sent"}
    assert calls["n"] == 3


async def test_gives_up_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch, _no_sleep: None, _smtp_configured: None
) -> None:
    """A sustained outage fails cleanly — and never IndexErrors."""
    calls = {"n": 0}

    async def _send(*_a, **_kw) -> None:
        calls["n"] += 1
        raise _Refused(451)

    monkeypatch.setattr(tm.aiosmtplib, "send", _send)

    result = await tm.send_transactional(
        to="user@example.com", subject="Welcome", body_text="hi"
    )

    assert result == {"status": "failed"}
    assert calls["n"] == tm._MAX_SEND_ATTEMPTS


async def test_permanent_failure_is_not_retried(
    monkeypatch: pytest.MonkeyPatch, _no_sleep: None, _smtp_configured: None
) -> None:
    """A 550 should cost exactly one attempt — retrying looks like spam."""
    calls = {"n": 0}

    async def _send(*_a, **_kw) -> None:
        calls["n"] += 1
        raise _Refused(550)

    monkeypatch.setattr(tm.aiosmtplib, "send", _send)

    result = await tm.send_transactional(
        to="user@example.com", subject="Welcome", body_text="hi"
    )

    assert result == {"status": "failed"}
    assert calls["n"] == 1


async def test_happy_path_sends_once(
    monkeypatch: pytest.MonkeyPatch, _no_sleep: None, _smtp_configured: None
) -> None:
    calls = {"n": 0}

    async def _send(*_a, **_kw) -> None:
        calls["n"] += 1

    monkeypatch.setattr(tm.aiosmtplib, "send", _send)

    result = await tm.send_transactional(
        to="user@example.com", subject="Welcome", body_text="hi"
    )

    assert result == {"status": "sent"}
    assert calls["n"] == 1
