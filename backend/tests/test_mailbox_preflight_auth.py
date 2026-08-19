import ssl

import pytest

from app.services import mailbox_preflight as mp


@pytest.mark.asyncio
async def test_cert_name_mismatch_reported(monkeypatch):
    async def bad_cert(*a, **k):
        raise ssl.SSLCertVerificationError("hostname mismatch")

    monkeypatch.setattr(mp.asyncio, "open_connection", bad_cert)
    check = await mp.check_tls("209.182.233.86", 465, "mail.edgyy.in")
    assert check.status == "fail"
    assert check.id == "tls_invalid"
    assert "certificate" in check.remedy.lower()


@pytest.mark.asyncio
async def test_auth_rejected_is_the_only_auth_failure(monkeypatch):
    class FakeSMTP:
        def __init__(self, **kw):
            pass

        async def connect(self):
            return None

        async def login(self, u, p):
            raise RuntimeError("535 authentication failed")

        async def quit(self):
            return None

    monkeypatch.setattr(mp, "_smtp_client", lambda **kw: FakeSMTP())
    check = await mp.check_smtp_auth("1.2.3.4", 587, "mail.x.com", "u@x.com", "pw")
    assert check.status == "fail"
    assert check.id == "auth_failed"


@pytest.mark.asyncio
async def test_auth_success(monkeypatch):
    class FakeSMTP:
        def __init__(self, **kw):
            pass

        async def connect(self):
            return None

        async def login(self, u, p):
            return None

        async def quit(self):
            return None

    monkeypatch.setattr(mp, "_smtp_client", lambda **kw: FakeSMTP())
    check = await mp.check_smtp_auth("1.2.3.4", 587, "mail.x.com", "u@x.com", "pw")
    assert check.status == "pass"


@pytest.mark.asyncio
async def test_no_password_skips_auth():
    check = await mp.check_smtp_auth("1.2.3.4", 587, "mail.x.com", "u@x.com", "")
    assert check.status == "skipped"
