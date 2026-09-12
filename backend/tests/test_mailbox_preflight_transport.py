import asyncio

import pytest

from app.services import mailbox_preflight as mp


class _FakeReader:
    def __init__(self, lines: list[bytes]):
        self._lines = list(lines)

    async def readline(self) -> bytes:
        if not self._lines:
            return b""
        return self._lines.pop(0)


class _FakeWriter:
    def __init__(self):
        self.written: list[bytes] = []
        self.closed = False

    def write(self, data: bytes) -> None:
        self.written.append(data)

    async def drain(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


@pytest.mark.asyncio
async def test_timeout_reports_filtered(monkeypatch):
    async def hang(*a, **k):
        raise TimeoutError

    monkeypatch.setattr(mp.asyncio, "open_connection", hang)
    check = await mp.check_tcp("209.182.233.86", 587)
    assert check.status == "fail"
    assert check.id == "port_filtered"
    assert "firewall" in check.remedy.lower()


@pytest.mark.asyncio
async def test_refused_reports_closed(monkeypatch):
    async def refuse(*a, **k):
        raise ConnectionRefusedError

    monkeypatch.setattr(mp.asyncio, "open_connection", refuse)
    check = await mp.check_tcp("209.182.233.86", 587)
    assert check.status == "fail"
    assert check.id == "port_closed"
    assert "listening" in check.remedy.lower()


@pytest.mark.asyncio
async def test_disallowed_port_rejected():
    check = await mp.check_tcp("209.182.233.86", 22)
    assert check.status == "fail"
    assert check.id == "port_not_allowed"


def test_missing_starttls_detected():
    check = mp.check_starttls({"PIPELINING", "SIZE", "8BITMIME"})
    assert check.status == "fail"
    assert check.id == "no_starttls"


def test_starttls_present_passes():
    assert mp.check_starttls({"STARTTLS", "SIZE"}).status == "pass"


def test_missing_auth_detected():
    """This is the edgyy.in case: a server with no submission service."""
    check = mp.check_auth_advertised({"PIPELINING", "SIZE", "ETRN", "CHUNKING"})
    assert check.status == "fail"
    assert check.id == "no_auth"


def test_auth_present_passes():
    assert mp.check_auth_advertised({"AUTH PLAIN LOGIN", "STARTTLS"}).status == "pass"


@pytest.mark.asyncio
async def test_multiline_greeting_still_finds_capabilities(monkeypatch):
    reader = _FakeReader([
        b"220-mail.example.com\r\n",
        b"220 Ready\r\n",
        b"250-mail.example.com\r\n",
        b"250-STARTTLS\r\n",
        b"250 AUTH PLAIN LOGIN\r\n",
    ])
    writer = _FakeWriter()

    async def fake_open_connection(*a, **k):
        return reader, writer

    monkeypatch.setattr(mp.asyncio, "open_connection", fake_open_connection)
    check, caps = await mp.read_ehlo("209.182.233.86", 587, "mail.example.com")
    assert check.status == "pass"
    assert "STARTTLS" in caps
    assert any(c.startswith("AUTH") for c in caps)
    assert "READY" not in caps


@pytest.mark.asyncio
async def test_singleline_greeting_still_works(monkeypatch):
    reader = _FakeReader([
        b"220 mail.example.com Ready\r\n",
        b"250-mail.example.com\r\n",
        b"250-STARTTLS\r\n",
        b"250 AUTH PLAIN LOGIN\r\n",
    ])
    writer = _FakeWriter()

    async def fake_open_connection(*a, **k):
        return reader, writer

    monkeypatch.setattr(mp.asyncio, "open_connection", fake_open_connection)
    check, caps = await mp.read_ehlo("209.182.233.86", 587, "mail.example.com")
    assert check.status == "pass"
    assert "STARTTLS" in caps
    assert any(c.startswith("AUTH") for c in caps)
