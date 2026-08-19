import asyncio

import pytest

from app.services import mailbox_preflight as mp


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
