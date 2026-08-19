import pytest

from app.services import mailbox_preflight as mp
from app.services.cdn_ranges import is_cdn_ip


def test_cloudflare_ranges_detected():
    assert is_cdn_ip("104.21.79.66") == "Cloudflare"
    assert is_cdn_ip("172.67.142.144") == "Cloudflare"


def test_origin_ip_not_flagged_as_cdn():
    assert is_cdn_ip("209.182.233.86") is None


@pytest.mark.asyncio
async def test_dns_failure_reported(monkeypatch):
    async def boom(host):
        raise mp.BlockedAddressError("no_dns_record")

    monkeypatch.setattr(mp, "resolve_public_ips", boom)
    check, ips = await mp.check_dns("mail.example.com")
    assert check.status == "fail"
    assert check.id == "dns_no_record"
    assert ips == []


@pytest.mark.asyncio
async def test_wildcard_detected(monkeypatch):
    """A random label resolving to the same IPs means the host is a wildcard."""
    async def same(host):
        return ["104.21.79.66", "172.67.142.144"]

    monkeypatch.setattr(mp, "resolve_public_ips", same)
    check = await mp.check_not_wildcard("mail.edgyy.in", ["104.21.79.66", "172.67.142.144"])
    assert check.status == "fail"
    assert check.id == "dns_wildcard"


@pytest.mark.asyncio
async def test_real_record_not_flagged_as_wildcard(monkeypatch):
    async def nxdomain(host):
        raise mp.BlockedAddressError("no_dns_record")

    monkeypatch.setattr(mp, "resolve_public_ips", nxdomain)
    check = await mp.check_not_wildcard("mail.edgyy.in", ["209.182.233.86"])
    assert check.status == "pass"


def test_cdn_proxied_reported():
    check = mp.check_not_cdn_proxied(["104.21.79.66"])
    assert check.status == "fail"
    assert check.id == "cdn_proxied"
    assert "DNS only" in check.remedy


def test_direct_ip_passes_cdn_check():
    assert mp.check_not_cdn_proxied(["209.182.233.86"]).status == "pass"


@pytest.mark.asyncio
async def test_wildcard_probe_skipped_for_two_label_host(monkeypatch):
    """edgyy.in has no parent domain below a public suffix — probing <uuid>.in
    would be a query against a public-suffix nameserver, not a useful check."""
    async def boom(host):
        raise AssertionError("resolve_public_ips must not be called")

    monkeypatch.setattr(mp, "resolve_public_ips", boom)
    check = await mp.check_not_wildcard("edgyy.in", ["1.2.3.4"])
    assert check.status == "skipped"
    assert check.id == "dns_wildcard_skipped"
