import pytest

from app.services import net_guard


def test_allowed_ports():
    assert net_guard.is_port_allowed(587)
    assert net_guard.is_port_allowed(993)
    assert not net_guard.is_port_allowed(22)
    assert not net_guard.is_port_allowed(80)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "addr",
    ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1",
     "169.254.169.254", "0.0.0.0", "224.0.0.1"],
)
async def test_rejects_non_public_addresses(monkeypatch, addr):
    async def fake_lookup(host: str) -> list[str]:
        return [addr]

    monkeypatch.setattr(net_guard, "_lookup_a_records", fake_lookup)
    with pytest.raises(net_guard.BlockedAddressError):
        await net_guard.resolve_public_ips("evil.example.com")


@pytest.mark.asyncio
async def test_accepts_public_address(monkeypatch):
    async def fake_lookup(host: str) -> list[str]:
        return ["209.182.233.86"]

    monkeypatch.setattr(net_guard, "_lookup_a_records", fake_lookup)
    assert await net_guard.resolve_public_ips("mail.example.com") == ["209.182.233.86"]


@pytest.mark.asyncio
async def test_rejects_when_any_address_is_private(monkeypatch):
    """A host resolving to one public and one private IP is still blocked."""
    async def fake_lookup(host: str) -> list[str]:
        return ["209.182.233.86", "127.0.0.1"]

    monkeypatch.setattr(net_guard, "_lookup_a_records", fake_lookup)
    with pytest.raises(net_guard.BlockedAddressError):
        await net_guard.resolve_public_ips("rebind.example.com")


@pytest.mark.asyncio
async def test_rejects_empty_resolution(monkeypatch):
    async def fake_lookup(host: str) -> list[str]:
        return []

    monkeypatch.setattr(net_guard, "_lookup_a_records", fake_lookup)
    with pytest.raises(net_guard.BlockedAddressError):
        await net_guard.resolve_public_ips("nxdomain.example.com")
