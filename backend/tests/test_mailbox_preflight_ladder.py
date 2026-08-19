import pytest

from app.services import mailbox_preflight as mp


@pytest.mark.asyncio
async def test_the_edgyy_incident_is_not_an_auth_failure():
    """Regression: host 'mail' with valid credentials must never say auth_failed."""
    result = await mp.run_preflight(
        mp.PreflightRequest(
            smtp_host="mail", smtp_port=587,
            username="sathya@edgyy.in", password="correct-password",
        )
    )
    assert result.ok is False
    assert result.blocking.id == "host_docker_internal"
    assert all(c.id != "auth_failed" for c in result.checks)


@pytest.mark.asyncio
async def test_ladder_stops_at_first_failure():
    """A host failing several rungs reports only the earliest."""
    result = await mp.run_preflight(
        mp.PreflightRequest(smtp_host="edgyy.in/login", smtp_port=587, username="u@x.com")
    )
    assert result.blocking.id == "host_invalid"
    failures = [c for c in result.checks if c.status == "fail"]
    assert len(failures) == 1


@pytest.mark.asyncio
async def test_all_pass_yields_ok(monkeypatch):
    ok = mp.PreflightCheck(id="stub", status="pass", detail="ok")

    async def a_pass(*a, **k):
        return ok

    async def dns_pass(host):
        return ok, ["209.182.233.86"]

    async def ehlo_pass(*a, **k):
        return ok, {"STARTTLS", "AUTH PLAIN"}

    monkeypatch.setattr(mp, "check_dns", dns_pass)
    monkeypatch.setattr(mp, "check_not_wildcard", a_pass)
    monkeypatch.setattr(mp, "check_tcp", a_pass)
    monkeypatch.setattr(mp, "read_ehlo", ehlo_pass)
    monkeypatch.setattr(mp, "check_tls", a_pass)
    monkeypatch.setattr(mp, "check_smtp_auth", a_pass)

    result = await mp.run_preflight(
        mp.PreflightRequest(
            smtp_host="mail.edgyy.in", smtp_port=587,
            username="sathya@edgyy.in", password="pw",
        )
    )
    assert result.ok is True
    assert result.blocking is None
