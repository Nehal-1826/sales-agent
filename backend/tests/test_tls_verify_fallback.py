"""The probes must verify TLS certificates first and downgrade only for a
certificate problem.

The danger this guards against is the fallback quietly widening into "retry
everything without verification" — which would be the same blanket posture as
the old unconditional ``validate_certs=False``, just harder to notice.
"""
from __future__ import annotations

import ssl

import pytest

from app.services import mailbox_service as ms


def _cert_error() -> ssl.SSLCertVerificationError:
    return ssl.SSLCertVerificationError("hostname mismatch")


def test_strict_context_actually_verifies():
    ctx = ms._strict_tls_context()
    assert ctx.check_hostname is True
    assert ctx.verify_mode == ssl.CERT_REQUIRED


def test_permissive_context_is_still_encrypted_but_unverified():
    ctx = ms._permissive_tls_context()
    assert ctx.check_hostname is False
    assert ctx.verify_mode == ssl.CERT_NONE


def test_cert_error_detected_directly():
    assert ms._is_cert_verification_error(_cert_error()) is True


def test_cert_error_detected_when_wrapped():
    """aiosmtplib/aioimaplib wrap the ssl error — the cause must still match."""
    wrapper = RuntimeError("tls failed")
    wrapper.__cause__ = _cert_error()
    assert ms._is_cert_verification_error(wrapper) is True


@pytest.mark.parametrize(
    "exc",
    [
        RuntimeError("535 authentication failed"),
        ConnectionRefusedError("refused"),
        TimeoutError("timed out"),
        OSError("network unreachable"),
    ],
)
def test_non_cert_errors_never_trigger_the_downgrade(exc):
    """An auth rejection must NOT be retried without verification."""
    assert ms._is_cert_verification_error(exc) is False


@pytest.mark.asyncio
async def test_smtp_auth_failure_is_not_retried_unverified(monkeypatch):
    """A rejected password must fail outright, not silently retry unverified."""
    attempts: list[bool] = []

    class FakeSMTP:
        def __init__(self, **kw):
            attempts.append(kw.get("validate_certs"))

        async def connect(self):
            return None

        async def login(self, u, p):
            raise RuntimeError("535 authentication failed")

        async def quit(self):
            return None

    import aiosmtplib

    monkeypatch.setattr(aiosmtplib, "SMTP", FakeSMTP)
    ok, err = await ms._probe_smtp("mail.example.com", 587, "u@example.com", "pw")

    assert ok is False
    # Exactly one attempt, and it was the verifying one.
    assert attempts == [True]


@pytest.mark.asyncio
async def test_smtp_cert_failure_retries_once_unverified(monkeypatch):
    """A certificate problem — and only that — earns a second attempt."""
    attempts: list[bool] = []

    class FakeSMTP:
        def __init__(self, **kw):
            self.verify = kw.get("validate_certs")
            attempts.append(self.verify)

        async def connect(self):
            if self.verify:
                raise _cert_error()

        async def login(self, u, p):
            return None

        async def quit(self):
            return None

    import aiosmtplib

    monkeypatch.setattr(aiosmtplib, "SMTP", FakeSMTP)
    ok, err = await ms._probe_smtp("mail.example.com", 587, "u@example.com", "pw")

    assert ok is True
    assert err is None
    assert attempts == [True, False]
