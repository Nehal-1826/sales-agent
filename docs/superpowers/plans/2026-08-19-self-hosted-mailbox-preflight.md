# Self-Hosted Mailbox Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `self_hosted` mailbox provider and a backend preflight diagnostic that tells a self-hosting user exactly which one thing is wrong with their mail server, instead of always blaming their password.

**Architecture:** A new `mailbox_preflight` service runs an ordered ladder of twelve checks against user-supplied connection details, stopping at the first blocking failure. Every rung maps to a stable `id` and a concrete remedy. All outbound sockets go through an SSRF guard that resolves, validates and pins the target IP. The existing `test_connection` endpoint is re-implemented on the same ladder so the two paths cannot diverge.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Alembic, `aiosmtplib`, `aioimaplib`, `dnspython`, pytest + pytest-asyncio (in-memory SQLite), React + TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-08-19-self-hosted-mailbox-preflight-design.md`

## Global Constraints

- Run all backend commands from `backend/`. Test command is `pytest`; the full suite is `cd backend && pytest`.
- `conftest.py` sets `MAILBOX_PROBES_DUMMY=false`. The preflight service must ignore that setting entirely in all environments — a diagnostic that returns unconditional success is worse than none.
- Tests use in-memory SQLite. They cannot exercise PostgreSQL enum DDL; the migration in Task 1 is verified by review and a staging run, not by unit test.
- Never interpolate a raw exception message, hostname credential, or password into a response or log line. Map to a stable `id` and write your own `detail`.
- `auth_failed` may only be returned when a connection succeeded, `AUTH` was advertised, and the server rejected the credentials.
- Allowed probe ports, everywhere: `25, 143, 465, 587, 993, 2525`. Nothing else.
- Timeouts: 3s per TCP connect, 10s per rung total.
- New user-facing copy goes in `frontend/src/lib/locales/onboarding.ts`, keyed by check `id`.
- No new runtime dependencies. `dnspython`, `aiosmtplib`, `aioimaplib` are already present.

---

### Task 1: Add the `self_hosted` provider enum value

**Files:**
- Modify: `backend/app/db/models/mailboxes.py:25-29`
- Create: `backend/alembic/versions/0042_self_hosted_provider.py`
- Test: `backend/tests/test_mailbox_provider_enum.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `MailboxProvider.self_hosted` with value `"self_hosted"`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_provider_enum.py`:

```python
from app.db.models.mailboxes import MailboxProvider


def test_self_hosted_provider_exists():
    assert MailboxProvider.self_hosted.value == "self_hosted"


def test_self_hosted_is_distinct_from_smtp():
    assert MailboxProvider.self_hosted != MailboxProvider.smtp
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_provider_enum.py -v`
Expected: FAIL with `AttributeError: self_hosted`

- [ ] **Step 3: Add the enum value**

In `backend/app/db/models/mailboxes.py`, add to `MailboxProvider`:

```python
class MailboxProvider(str, enum.Enum):
    gmail = "gmail"
    outlook = "outlook"
    yahoo = "yahoo"
    smtp = "smtp"
    self_hosted = "self_hosted"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_provider_enum.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Write the migration**

Create `backend/alembic/versions/0042_self_hosted_provider.py`. `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on PostgreSQL < 12, so commit first. The downgrade is a documented no-op because PostgreSQL cannot remove an enum value.

```python
"""add self_hosted to mailboxprovider enum

Revision ID: 0042_self_hosted_provider
Revises: 0041_crm_body_text
"""
from alembic import op

revision = "0042_self_hosted_provider"
down_revision = "0041_crm_body_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    op.execute("COMMIT")
    op.execute("ALTER TYPE mailboxprovider ADD VALUE IF NOT EXISTS 'self_hosted'")


def downgrade() -> None:
    # PostgreSQL cannot drop a value from an enum type. Removing it would
    # require recreating the type and rewriting every dependent column, which
    # is not worth it for an additive value. Intentional no-op.
    pass
```

- [ ] **Step 6: Verify the revision chain**

Run: `cd backend && alembic heads`
Expected: exactly one head, `0042_self_hosted_provider`. If `0041_crm_body_text` is not the current head, set `down_revision` to whatever `alembic heads` reported before this migration was added.

- [ ] **Step 7: Commit**

```bash
git add backend/app/db/models/mailboxes.py backend/alembic/versions/0042_self_hosted_provider.py backend/tests/test_mailbox_provider_enum.py
git commit -m "feat(mailboxes): add self_hosted provider enum value"
```

---

### Task 2: SSRF-safe address resolution guard

**Files:**
- Create: `backend/app/services/net_guard.py`
- Test: `backend/tests/test_net_guard.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ALLOWED_PROBE_PORTS: frozenset[int]`
  - `class BlockedAddressError(Exception)` with attribute `reason: str`
  - `async def resolve_public_ips(host: str) -> list[str]` — returns validated public IP strings, raises `BlockedAddressError` if any resolved address is private/loopback/link-local/multicast or if nothing resolves.
  - `def is_port_allowed(port: int) -> bool`

This is the foundation for every network rung. Resolving once here and connecting to the returned IP is what closes the DNS-rebinding hole — later tasks must never re-resolve the hostname.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_net_guard.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_net_guard.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.net_guard'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/net_guard.py`:

```python
"""SSRF guard for user-supplied mail hosts.

The preflight opens sockets to addresses a user typed into a form. That is a
server-side request forgery primitive unless every target is validated first.
Resolve here, validate here, and connect to the *returned IP* — re-resolving
the hostname at connect time reopens the DNS-rebinding hole this module exists
to close.
"""
from __future__ import annotations

import asyncio
import ipaddress

import dns.exception
import dns.resolver

ALLOWED_PROBE_PORTS: frozenset[int] = frozenset({25, 143, 465, 587, 993, 2525})

_RESOLVE_TIMEOUT_S = 5.0


class BlockedAddressError(Exception):
    """Raised when a host does not resolve to a usable public address."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def is_port_allowed(port: int) -> bool:
    return port in ALLOWED_PROBE_PORTS


async def _lookup_a_records(host: str) -> list[str]:
    """Resolve A and AAAA records. Returns [] on any DNS failure."""
    def _query() -> list[str]:
        out: list[str] = []
        for rdtype in ("A", "AAAA"):
            try:
                answers = dns.resolver.resolve(host, rdtype, lifetime=_RESOLVE_TIMEOUT_S)
                out.extend(str(r) for r in answers)
            except dns.exception.DNSException:
                continue
        return out

    return await asyncio.to_thread(_query)


def _is_public(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    # link_local covers 169.254.0.0/16, i.e. the cloud metadata endpoint.
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def resolve_public_ips(host: str) -> list[str]:
    """Resolve ``host`` and return its addresses, or raise BlockedAddressError.

    Blocks if *any* resolved address is non-public: a host that returns one
    public and one private address is an attack, not a misconfiguration.
    """
    addrs = await _lookup_a_records(host)
    if not addrs:
        raise BlockedAddressError("no_dns_record")
    for addr in addrs:
        if not _is_public(addr):
            raise BlockedAddressError("non_public_address")
    return addrs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_net_guard.py -v`
Expected: PASS (11 passed — 7 parametrised cases plus 4)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/net_guard.py backend/tests/test_net_guard.py
git commit -m "feat(preflight): SSRF guard for user-supplied mail hosts"
```

---

### Task 3: Preflight result model and host-shape rungs 1–2

**Files:**
- Create: `backend/app/services/mailbox_preflight.py`
- Test: `backend/tests/test_mailbox_preflight_host.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class PreflightCheck(BaseModel)` with fields `id: str`, `status: Literal["pass","fail","warn","skipped"]`, `detail: str`, `remedy: str | None = None`, `docs_anchor: str | None = None`
  - `def check_host_shape(host: str) -> PreflightCheck` — rung 1, id `host_invalid`
  - `def check_not_container_name(host: str) -> PreflightCheck` — rung 2, id `host_docker_internal`

Rung 2 is the check that would have caught the original incident: the user typed `mail`, straight from their own `docker-compose` service name.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_host.py`:

```python
import pytest

from app.services.mailbox_preflight import check_host_shape, check_not_container_name


@pytest.mark.parametrize("host", ["edgyy.in/login", "https://mail.edgyy.in",
                                  "user@mail.edgyy.in", "mail edgyy in"])
def test_host_shape_rejects_non_hostnames(host):
    result = check_host_shape(host)
    assert result.status == "fail"
    assert result.id == "host_invalid"
    assert result.remedy


def test_host_shape_accepts_plain_hostname():
    assert check_host_shape("mail.edgyy.in").status == "pass"


@pytest.mark.parametrize("host", ["mail", "mailserver", "smtp", "localhost", "127.0.0.1"])
def test_container_names_rejected(host):
    result = check_not_container_name(host)
    assert result.status == "fail"
    assert result.id == "host_docker_internal"
    assert "Docker" in result.remedy


def test_fqdn_passes_container_check():
    assert check_not_container_name("mail.edgyy.in").status == "pass"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_host.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.mailbox_preflight'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/mailbox_preflight.py`:

```python
"""Ordered diagnostic ladder for mailbox connections.

Runs one check at a time and stops at the first blocking failure. Reporting
six problems at once is how you get a user to fix none of them.

See docs/superpowers/specs/2026-08-19-self-hosted-mailbox-preflight-design.md
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

CheckStatus = Literal["pass", "fail", "warn", "skipped"]

# Compose service names and loopback aliases a self-hoster copies out of their
# own .env without realising WarmPulse connects from outside their network.
_CONTAINER_NAMES = frozenset({
    "mail", "mailserver", "smtp", "imap", "postfix", "dovecot",
    "localhost", "127.0.0.1", "::1", "0.0.0.0",
})

_VALID_HOSTNAME = re.compile(
    r"^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+\.?$",
    re.IGNORECASE,
)


class PreflightCheck(BaseModel):
    id: str
    status: CheckStatus
    detail: str
    remedy: str | None = None
    docs_anchor: str | None = None


def check_host_shape(host: str) -> PreflightCheck:
    """Rung 1 — is this even a hostname?"""
    raw = (host or "").strip()
    if _VALID_HOSTNAME.match(raw):
        return PreflightCheck(
            id="host_shape", status="pass", detail=f"{raw} is a valid hostname."
        )
    return PreflightCheck(
        id="host_invalid",
        status="fail",
        detail=f"'{raw}' is not a hostname.",
        remedy=(
            "Enter just the mail server's hostname — for example "
            "mail.yourdomain.com. Not a URL, not an email address, and no "
            "https:// prefix or /path on the end."
        ),
        docs_anchor="self-hosted#hostname",
    )


def check_not_container_name(host: str) -> PreflightCheck:
    """Rung 2 — is this a Docker service name or a loopback alias?"""
    raw = (host or "").strip().lower().rstrip(".")
    if raw in _CONTAINER_NAMES or ("." not in raw and raw != ""):
        return PreflightCheck(
            id="host_docker_internal",
            status="fail",
            detail=f"'{raw}' only resolves inside your own network.",
            remedy=(
                "That looks like a Docker service name or a local alias. "
                "WarmPulse connects from the public internet, so it needs a "
                "publicly resolvable hostname such as mail.yourdomain.com. "
                "Your application's own config can keep using the internal "
                "name."
            ),
            docs_anchor="self-hosted#docker",
        )
    return PreflightCheck(
        id="host_reachable_name", status="pass", detail=f"{raw} is publicly addressable."
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_preflight_host.py -v`
Expected: PASS (11 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_host.py
git commit -m "feat(preflight): host shape and container-name checks"
```

---

### Task 4: DNS rungs 3–5 — resolution, wildcard, CDN proxy

**Files:**
- Modify: `backend/app/services/mailbox_preflight.py`
- Create: `backend/app/services/cdn_ranges.py`
- Test: `backend/tests/test_mailbox_preflight_dns.py`

**Interfaces:**
- Consumes: `net_guard.resolve_public_ips`, `net_guard.BlockedAddressError` (Task 2); `PreflightCheck` (Task 3).
- Produces:
  - `cdn_ranges.CLOUDFLARE_V4: tuple[str, ...]` and `cdn_ranges.is_cdn_ip(addr: str) -> str | None` returning the CDN name or `None`
  - `async def check_dns(host: str) -> tuple[PreflightCheck, list[str]]` — rung 3, returns the check plus resolved IPs (empty on failure)
  - `async def check_not_wildcard(host: str, resolved: list[str]) -> PreflightCheck` — rung 4
  - `def check_not_cdn_proxied(resolved: list[str]) -> PreflightCheck` — rung 5

Rung 4 works by resolving a random label under the same registrable domain: if `<uuid4>.example.com` returns the same addresses as `mail.example.com`, then `mail` was never a real record.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_dns.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_dns.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.cdn_ranges'`

- [ ] **Step 3: Write the CDN range list**

Create `backend/app/services/cdn_ranges.py`:

```python
"""Published CDN edge ranges.

A CDN proxy carries HTTP/HTTPS only, so a mail hostname resolving into one of
these ranges can never accept SMTP or IMAP — the connection reaches an edge
server that does not speak the protocol.

Vendored from https://www.cloudflare.com/ips/ as of 2026-08-19. Cloudflare
does add ranges; refresh this list periodically or rung 5 silently stops
detecting proxied hosts.
"""
from __future__ import annotations

import ipaddress

CLOUDFLARE_V4: tuple[str, ...] = (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
)

_NETWORKS = tuple(
    (name, ipaddress.ip_network(cidr))
    for name, cidrs in (("Cloudflare", CLOUDFLARE_V4),)
    for cidr in cidrs
)


def is_cdn_ip(addr: str) -> str | None:
    """Return the CDN name if ``addr`` sits in a known edge range, else None."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return None
    for name, net in _NETWORKS:
        if ip.version == net.version and ip in net:
            return name
    return None
```

- [ ] **Step 4: Write the DNS rungs**

Append to `backend/app/services/mailbox_preflight.py` (and add the imports at the top of the file):

```python
import uuid

from app.services.cdn_ranges import is_cdn_ip
from app.services.net_guard import BlockedAddressError, resolve_public_ips


async def check_dns(host: str) -> tuple[PreflightCheck, list[str]]:
    """Rung 3 — does the hostname resolve to a usable public address?"""
    try:
        ips = await resolve_public_ips(host)
    except BlockedAddressError as exc:
        if exc.reason == "non_public_address":
            return PreflightCheck(
                id="dns_private_address",
                status="fail",
                detail=f"{host} resolves to a private or reserved address.",
                remedy=(
                    "WarmPulse connects from the public internet and cannot "
                    "reach private addresses. Point this hostname at your "
                    "server's public IP."
                ),
                docs_anchor="self-hosted#dns",
            ), []
        return PreflightCheck(
            id="dns_no_record",
            status="fail",
            detail=f"{host} does not resolve.",
            remedy=(
                "Add a DNS A record for this hostname pointing at your mail "
                "server's public IP address."
            ),
            docs_anchor="self-hosted#dns",
        ), []
    return PreflightCheck(
        id="dns_resolves", status="pass", detail=f"{host} resolves to {', '.join(ips)}."
    ), ips


async def check_not_wildcard(host: str, resolved: list[str]) -> PreflightCheck:
    """Rung 4 — did this hostname only resolve because of a ``*`` record?"""
    parts = host.strip().rstrip(".").split(".")
    if len(parts) < 2:
        return PreflightCheck(
            id="dns_wildcard_skipped", status="skipped", detail="Host has no parent domain."
        )
    parent = ".".join(parts[1:])
    probe = f"{uuid.uuid4().hex}.{parent}"
    try:
        probe_ips = await resolve_public_ips(probe)
    except BlockedAddressError:
        return PreflightCheck(
            id="dns_real_record",
            status="pass",
            detail=f"{host} is a real record, not a wildcard match.",
        )
    if set(probe_ips) == set(resolved):
        return PreflightCheck(
            id="dns_wildcard",
            status="fail",
            detail=(
                f"{host} is not a real DNS record — a wildcard (*.{parent}) is "
                f"answering for it."
            ),
            remedy=(
                f"Create an explicit A record for {host} pointing at your mail "
                f"server's IP. An explicit record takes precedence over the "
                f"wildcard."
            ),
            docs_anchor="self-hosted#wildcard",
        )
    return PreflightCheck(
        id="dns_real_record", status="pass", detail=f"{host} is a real record."
    )


def check_not_cdn_proxied(resolved: list[str]) -> PreflightCheck:
    """Rung 5 — is the hostname pointed at a CDN edge instead of the server?"""
    for addr in resolved:
        cdn = is_cdn_ip(addr)
        if cdn:
            return PreflightCheck(
                id="cdn_proxied",
                status="fail",
                detail=f"{addr} is a {cdn} edge address, not your mail server.",
                remedy=(
                    f"{cdn}'s proxy only carries HTTP and HTTPS — it cannot "
                    f"carry SMTP or IMAP. In your DNS dashboard, set this "
                    f"record to DNS only (grey cloud) so it points straight at "
                    f"your server."
                ),
                docs_anchor="self-hosted#cdn",
            )
    return PreflightCheck(
        id="direct_to_origin", status="pass", detail="Hostname points directly at a server."
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_preflight_dns.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cdn_ranges.py backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_dns.py
git commit -m "feat(preflight): DNS resolution, wildcard and CDN-proxy checks"
```

---

### Task 5: Transport rungs 6–8 — TCP reachability and EHLO capabilities

**Files:**
- Modify: `backend/app/services/mailbox_preflight.py`
- Test: `backend/tests/test_mailbox_preflight_transport.py`

**Interfaces:**
- Consumes: `PreflightCheck` (Task 3), `net_guard.is_port_allowed` (Task 2).
- Produces:
  - `async def check_tcp(ip: str, port: int) -> PreflightCheck` — rung 6
  - `async def read_ehlo(ip: str, port: int, hostname: str) -> tuple[PreflightCheck, set[str]]` — opens a raw connection, reads the banner, sends `EHLO`, returns the advertised capability keywords uppercased
  - `def check_starttls(caps: set[str]) -> PreflightCheck` — rung 7
  - `def check_auth_advertised(caps: set[str]) -> PreflightCheck` — rung 8

Use raw `asyncio.open_connection` rather than `aiosmtplib` here. `aiosmtplib` upgrades to STARTTLS automatically, which would hide exactly the condition rung 7 exists to detect.

**Rung 6 is the highest-value check in the ladder.** A timeout and a refusal are one letter apart in a log and mean opposite things: timeout means a firewall is dropping packets; refusal means nothing is listening. Catch `TimeoutError` and `ConnectionRefusedError` separately.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_transport.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_transport.py -v`
Expected: FAIL with `AttributeError: module 'app.services.mailbox_preflight' has no attribute 'check_tcp'`

- [ ] **Step 3: Write the implementation**

Append to `backend/app/services/mailbox_preflight.py` (add `import asyncio` and `contextlib` at the top):

```python
import asyncio
import contextlib

from app.services.net_guard import is_port_allowed

_CONNECT_TIMEOUT_S = 3.0
_RUNG_TIMEOUT_S = 10.0


async def check_tcp(ip: str, port: int) -> PreflightCheck:
    """Rung 6 — can we open a TCP connection, and if not, why not?"""
    if not is_port_allowed(port):
        return PreflightCheck(
            id="port_not_allowed",
            status="fail",
            detail=f"Port {port} is not a mail port.",
            remedy="Use 587 (submission), 465 (implicit TLS) or 993 (IMAPS).",
            docs_anchor="self-hosted#ports",
        )
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=_CONNECT_TIMEOUT_S
        )
    except (TimeoutError, asyncio.TimeoutError):
        return PreflightCheck(
            id="port_filtered",
            status="fail",
            detail=f"Port {port} on {ip} timed out.",
            remedy=(
                f"The packets are being dropped, which means a firewall is "
                f"blocking port {port}. Allow it on the server "
                f"(ufw allow {port}/tcp) and in your hosting provider's "
                f"firewall or security group."
            ),
            docs_anchor="self-hosted#firewall",
        )
    except (ConnectionRefusedError, OSError):
        return PreflightCheck(
            id="port_closed",
            status="fail",
            detail=f"Port {port} on {ip} refused the connection.",
            remedy=(
                f"Nothing is listening on port {port}. If your mail server "
                f"runs in Docker, publish the port "
                f"(ports: - \"{port}:{port}\") and restart the container."
            ),
            docs_anchor="self-hosted#ports",
        )
    writer.close()
    with contextlib.suppress(Exception):
        await writer.wait_closed()
    return PreflightCheck(
        id="port_open", status="pass", detail=f"Port {port} on {ip} accepted a connection."
    )


async def read_ehlo(ip: str, port: int, hostname: str) -> tuple[PreflightCheck, set[str]]:
    """Open a plain session, read the banner, send EHLO, collect capabilities.

    Deliberately raw rather than via aiosmtplib: that library negotiates
    STARTTLS on its own, which would mask the very condition rung 7 detects.
    """
    caps: set[str] = set()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=_CONNECT_TIMEOUT_S
        )
    except Exception:
        return PreflightCheck(
            id="ehlo_unreachable", status="fail", detail="Could not open an SMTP session.",
            remedy="Re-run the check once the port is reachable.",
        ), caps

    async def _session() -> None:
        await reader.readline()  # 220 banner
        writer.write(f"EHLO {hostname}\r\n".encode())
        await writer.drain()
        while True:
            line = await reader.readline()
            if not line:
                break
            text = line.decode("utf-8", "replace").strip()
            if len(text) >= 4:
                caps.add(text[4:].upper())
            if len(text) >= 4 and text[3] == " ":
                break

    try:
        await asyncio.wait_for(_session(), timeout=_RUNG_TIMEOUT_S)
    except Exception:
        return PreflightCheck(
            id="ehlo_failed", status="fail", detail="The server did not complete an EHLO.",
            remedy="Confirm the port is an SMTP port and the service is healthy.",
        ), caps
    finally:
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()

    return PreflightCheck(
        id="ehlo_ok", status="pass", detail=f"Server advertised {len(caps)} capabilities."
    ), caps


def check_starttls(caps: set[str]) -> PreflightCheck:
    """Rung 7 — will the server encrypt the session?"""
    if any(c.startswith("STARTTLS") for c in caps):
        return PreflightCheck(id="starttls_ok", status="pass", detail="STARTTLS advertised.")
    return PreflightCheck(
        id="no_starttls",
        status="fail",
        detail="The server does not advertise STARTTLS.",
        remedy=(
            "Your mail server has no TLS configured, so credentials would "
            "cross the internet in clear text. Configure a certificate for "
            "this hostname — on docker-mailserver set SSL_TYPE=letsencrypt and "
            "mount /etc/letsencrypt into the container."
        ),
        docs_anchor="self-hosted#tls",
    )


def check_auth_advertised(caps: set[str]) -> PreflightCheck:
    """Rung 8 — is there a submission service to authenticate against at all?"""
    if any(c.startswith("AUTH") for c in caps):
        return PreflightCheck(id="auth_ok", status="pass", detail="AUTH advertised.")
    return PreflightCheck(
        id="no_auth",
        status="fail",
        detail="The server does not advertise AUTH, so no login is possible.",
        remedy=(
            "This port accepts mail but offers no authenticated submission. "
            "Enable the submission service — in Postfix, uncomment the "
            "'submission' entry in master.cf with smtpd_sasl_auth_enable=yes "
            "— then re-run this check."
        ),
        docs_anchor="self-hosted#submission",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_preflight_transport.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_transport.py
git commit -m "feat(preflight): TCP reachability and EHLO capability checks"
```

---

### Task 6: Credential rungs 9–11 — TLS validity, SMTP AUTH, IMAP

**Files:**
- Modify: `backend/app/services/mailbox_preflight.py`
- Test: `backend/tests/test_mailbox_preflight_auth.py`

**Interfaces:**
- Consumes: `PreflightCheck` (Task 3).
- Produces:
  - `async def check_tls(ip: str, port: int, hostname: str) -> PreflightCheck` — rung 9
  - `async def check_smtp_auth(ip: str, port: int, hostname: str, username: str, password: str) -> PreflightCheck` — rung 10
  - `async def check_imap(ip: str, port: int, hostname: str, username: str, password: str) -> PreflightCheck` — rung 11

Unlike `_probe_smtp`, which passes `validate_certs=False`, rung 9 must validate. That is the whole point of the rung — the existing permissive posture is why a broken certificate is currently invisible.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_auth.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_auth.py -v`
Expected: FAIL with `AttributeError: module 'app.services.mailbox_preflight' has no attribute 'check_tls'`

- [ ] **Step 3: Write the implementation**

Append to `backend/app/services/mailbox_preflight.py`:

```python
import ssl as _ssl


def _smtp_client(**kwargs):
    """Indirection so tests can substitute a fake client."""
    import aiosmtplib

    return aiosmtplib.SMTP(**kwargs)


async def check_tls(ip: str, port: int, hostname: str) -> PreflightCheck:
    """Rung 9 — is the certificate valid and does it cover this hostname?"""
    ctx = _ssl.create_default_context()
    ctx.check_hostname = True
    ctx.verify_mode = _ssl.CERT_REQUIRED
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port, ssl=ctx, server_hostname=hostname),
            timeout=_CONNECT_TIMEOUT_S,
        )
    except _ssl.SSLCertVerificationError:
        return PreflightCheck(
            id="tls_invalid",
            status="fail",
            detail=f"The certificate presented on port {port} is not valid for {hostname}.",
            remedy=(
                f"Issue a certificate that covers {hostname} — for example "
                f"certbot certonly --nginx -d {hostname} — and point your mail "
                f"server at it. A CDN proxy must be off for the issuance to "
                f"succeed."
            ),
            docs_anchor="self-hosted#tls",
        )
    except Exception:
        return PreflightCheck(
            id="tls_handshake_failed",
            status="fail",
            detail=f"TLS handshake failed on port {port}.",
            remedy="Confirm the port serves implicit TLS, or use 587 with STARTTLS.",
            docs_anchor="self-hosted#tls",
        )
    writer.close()
    with contextlib.suppress(Exception):
        await writer.wait_closed()
    return PreflightCheck(
        id="tls_ok", status="pass", detail=f"Valid certificate for {hostname}."
    )


async def check_smtp_auth(
    ip: str, port: int, hostname: str, username: str, password: str
) -> PreflightCheck:
    """Rung 10 — the ONLY rung permitted to return auth_failed."""
    if not password:
        return PreflightCheck(
            id="auth_skipped", status="skipped", detail="No password supplied."
        )
    ctx = _ssl.create_default_context()
    kwargs = dict(hostname=ip, port=port, timeout=_RUNG_TIMEOUT_S, tls_context=ctx)
    if port == 465:
        kwargs["use_tls"] = True
    else:
        kwargs["start_tls"] = True
    client = _smtp_client(**kwargs)
    try:
        await client.connect()
        try:
            await client.login(username, password)
        finally:
            with contextlib.suppress(Exception):
                await client.quit()
    except Exception:
        return PreflightCheck(
            id="auth_failed",
            status="fail",
            detail="The server rejected these credentials.",
            remedy=(
                "The server is reachable and offers authentication, so this is "
                "genuinely a username or password problem. Use the mailbox's "
                "own password — a control-panel or admin login usually cannot "
                "authenticate for SMTP."
            ),
            docs_anchor="self-hosted#credentials",
        )
    return PreflightCheck(
        id="auth_ok_verified", status="pass", detail="SMTP authentication succeeded."
    )


async def check_imap(
    ip: str, port: int, hostname: str, username: str, password: str
) -> PreflightCheck:
    """Rung 11 — same story on the IMAP side."""
    if not password:
        return PreflightCheck(
            id="imap_skipped", status="skipped", detail="No password supplied."
        )
    import aioimaplib

    try:
        client = aioimaplib.IMAP4_SSL(
            host=ip, port=port, timeout=_RUNG_TIMEOUT_S,
            ssl_context=_ssl.create_default_context(),
        )

        async def _go() -> None:
            await client.wait_hello_from_server()
            resp = await client.login(username, password)
            result = getattr(resp, "result", None)
            if result is not None and str(result).upper() != "OK":
                raise RuntimeError("imap login rejected")
            with contextlib.suppress(Exception):
                await client.logout()

        await asyncio.wait_for(_go(), timeout=_RUNG_TIMEOUT_S)
    except Exception:
        return PreflightCheck(
            id="imap_failed",
            status="fail",
            detail=f"Could not sign in to IMAP on port {port}.",
            remedy=(
                "Check that IMAP is published on 993 with TLS and that this "
                "mailbox's password is correct. Port 143 is plain-text IMAP "
                "and should stay internal to your network."
            ),
            docs_anchor="self-hosted#imap",
        )
    return PreflightCheck(
        id="imap_ok", status="pass", detail="IMAP authentication succeeded."
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_preflight_auth.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_auth.py
git commit -m "feat(preflight): TLS validation, SMTP AUTH and IMAP checks"
```

---

### Task 7: The ladder orchestrator

**Files:**
- Modify: `backend/app/services/mailbox_preflight.py`
- Test: `backend/tests/test_mailbox_preflight_ladder.py`

**Interfaces:**
- Consumes: every `check_*` from Tasks 3–6.
- Produces:
  - `class PreflightRequest(BaseModel)` — `smtp_host: str`, `smtp_port: int`, `username: str`, `password: str | None = None`, `imap_host: str | None = None`, `imap_port: int | None = None`
  - `class PreflightResult(BaseModel)` — `ok: bool`, `checks: list[PreflightCheck]`, `blocking: PreflightCheck | None`
  - `async def run_preflight(req: PreflightRequest) -> PreflightResult`

Rungs 1–11 are blocking: stop at the first `fail`, mark the rest `skipped`. Rung 12 is advisory and is added in Task 8.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_ladder.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_ladder.py -v`
Expected: FAIL with `AttributeError: module 'app.services.mailbox_preflight' has no attribute 'run_preflight'`

- [ ] **Step 3: Write the orchestrator**

Append to `backend/app/services/mailbox_preflight.py`:

```python
class PreflightRequest(BaseModel):
    smtp_host: str
    smtp_port: int
    username: str
    password: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None


class PreflightResult(BaseModel):
    ok: bool
    checks: list[PreflightCheck]
    blocking: PreflightCheck | None = None


async def run_preflight(req: PreflightRequest) -> PreflightResult:
    """Run rungs 1-11 in order, stopping at the first blocking failure."""
    checks: list[PreflightCheck] = []
    host = req.smtp_host.strip()
    password = req.password or ""

    def _stop(check: PreflightCheck) -> PreflightResult:
        checks.append(check)
        return PreflightResult(ok=False, checks=checks, blocking=check)

    for check in (check_host_shape(host), check_not_container_name(host)):
        if check.status == "fail":
            return _stop(check)
        checks.append(check)

    dns_check, ips = await check_dns(host)
    if dns_check.status == "fail":
        return _stop(dns_check)
    checks.append(dns_check)

    # Evaluated one at a time on purpose. Building a tuple of awaited calls
    # would run every probe before the loop inspected any of them, so a host
    # that fails the wildcard check would still be port-scanned.
    wildcard_check = await check_not_wildcard(host, ips)
    if wildcard_check.status == "fail":
        return _stop(wildcard_check)
    checks.append(wildcard_check)

    cdn_check = check_not_cdn_proxied(ips)
    if cdn_check.status == "fail":
        return _stop(cdn_check)
    checks.append(cdn_check)

    tcp_check = await check_tcp(ips[0], req.smtp_port)
    if tcp_check.status == "fail":
        return _stop(tcp_check)
    checks.append(tcp_check)

    ehlo_check, caps = await read_ehlo(ips[0], req.smtp_port, host)
    if ehlo_check.status == "fail":
        return _stop(ehlo_check)
    checks.append(ehlo_check)

    for check in (check_starttls(caps), check_auth_advertised(caps)):
        if check.status == "fail":
            return _stop(check)
        checks.append(check)

    tls_check = await check_tls(ips[0], req.smtp_port, host)
    if tls_check.status == "fail":
        return _stop(tls_check)
    checks.append(tls_check)

    auth_check = await check_smtp_auth(ips[0], req.smtp_port, host, req.username, password)
    if auth_check.status == "fail":
        return _stop(auth_check)
    checks.append(auth_check)

    if req.imap_host and req.imap_port:
        imap_ips = ips if req.imap_host.strip() == host else None
        if imap_ips is None:
            imap_dns, imap_ips = await check_dns(req.imap_host.strip())
            if imap_dns.status == "fail":
                return _stop(imap_dns)
            checks.append(imap_dns)
        imap_check = await check_imap(
            imap_ips[0], req.imap_port, req.imap_host.strip(), req.username, password
        )
        if imap_check.status == "fail":
            return _stop(imap_check)
        checks.append(imap_check)

    return PreflightResult(ok=True, checks=checks, blocking=None)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_mailbox_preflight_ladder.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_ladder.py
git commit -m "feat(preflight): ordered ladder orchestrator, stops at first failure"
```

---

### Task 8: Advisory DNS-alignment rung and IP-specific SPF text

**Files:**
- Modify: `backend/app/services/mailbox_preflight.py`
- Test: `backend/tests/test_mailbox_preflight_spf.py`

**Interfaces:**
- Consumes: `PreflightResult` (Task 7).
- Produces: `def build_spf_advice(domain: str, sending_ip: str) -> PreflightCheck` — always `warn` or `pass`, never `fail`.

Rung 12 never blocks. A misaligned SPF record does not stop a mailbox connecting, and the existing "Verify domain records (DNS)" onboarding step remains the one place a user resolves DNS problems. This rung exists solely to produce the IP-specific record the generic `SPF_FIX` constant cannot.

Emit `~all`, not `-all`: a hard fail on a freshly configured server that later adds a second sender causes silent mail loss.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_spf.py`:

```python
from app.services.mailbox_preflight import build_spf_advice


def test_spf_advice_names_the_real_sending_ip():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert "v=spf1 ip4:209.182.233.86 ~all" in check.remedy


def test_spf_advice_is_never_blocking():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert check.status == "warn"


def test_spf_advice_uses_softfail_not_hardfail():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert "-all" not in check.remedy
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_spf.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_spf_advice'`

- [ ] **Step 3: Write the implementation**

Append to `backend/app/services/mailbox_preflight.py`:

```python
def build_spf_advice(domain: str, sending_ip: str) -> PreflightCheck:
    """Rung 12 (advisory) — the SPF record only we can compute.

    Never blocking: a misaligned SPF record does not stop a mailbox from
    connecting, and the standalone DNS step owns the pass/fail gate. Softfail
    (~all) rather than hardfail (-all): a self-hoster who later adds a second
    sender should not silently lose mail.
    """
    return PreflightCheck(
        id="spf_advice",
        status="warn",
        detail=(
            f"Mail for {domain} will be sent from {sending_ip}. Confirm your "
            f"SPF record authorises that address."
        ),
        remedy=f"v=spf1 ip4:{sending_ip} ~all",
        docs_anchor="dns#spf",
    )
```

- [ ] **Step 4: Wire it into the orchestrator**

In `run_preflight`, immediately before the final `return PreflightResult(ok=True, ...)`, add:

```python
    domain = req.username.split("@")[-1] if "@" in req.username else host
    checks.append(build_spf_advice(domain, ips[0]))
```

- [ ] **Step 5: Run the full preflight suite**

Run: `cd backend && pytest tests/test_mailbox_preflight_spf.py tests/test_mailbox_preflight_ladder.py -v`
Expected: PASS (6 passed). `test_all_pass_yields_ok` must still report `ok is True` — a `warn` never sets `blocking`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/mailbox_preflight.py backend/tests/test_mailbox_preflight_spf.py
git commit -m "feat(preflight): advisory SPF rung with IP-specific record"
```

---

### Task 9: API endpoint and `test_connection` re-implementation

**Files:**
- Modify: `backend/app/api/routes/mailboxes.py:283-290`
- Modify: `backend/app/schemas/mailboxes.py:232-241`
- Modify: `backend/app/services/mailbox_service.py:973` (`test_connection`)
- Test: `backend/tests/test_mailbox_preflight_api.py`

**Interfaces:**
- Consumes: `run_preflight`, `PreflightRequest`, `PreflightResult` (Tasks 7–8).
- Produces: `POST /api/v1/mailboxes/preflight` returning `PreflightResult`.

`test_connection` keeps its existing `TestConnectionResponse` shape so no caller breaks, but derives it from the ladder. That is what stops the two paths diverging.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mailbox_preflight_api.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_preflight_endpoint_rejects_docker_host(auth_client):
    resp = await auth_client.post(
        "/api/v1/mailboxes/preflight",
        json={"smtp_host": "mail", "smtp_port": 587, "username": "u@x.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["blocking"]["id"] == "host_docker_internal"


@pytest.mark.asyncio
async def test_preflight_requires_auth(client):
    resp = await client.post(
        "/api/v1/mailboxes/preflight",
        json={"smtp_host": "mail.x.com", "smtp_port": 587, "username": "u@x.com"},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_preflight_never_echoes_the_password(auth_client):
    resp = await auth_client.post(
        "/api/v1/mailboxes/preflight",
        json={"smtp_host": "mail", "smtp_port": 587,
              "username": "u@x.com", "password": "hunter2"},
    )
    assert "hunter2" not in resp.text
```

Use whichever authenticated-client fixture `backend/tests/conftest.py` already provides; read it first and match the existing name rather than inventing `auth_client` if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_mailbox_preflight_api.py -v`
Expected: FAIL with 404 (route not registered)

- [ ] **Step 3: Add the route**

In `backend/app/api/routes/mailboxes.py`, above the existing `test-connection` route:

```python
from app.services.mailbox_preflight import PreflightRequest, PreflightResult, run_preflight


@router.post("/preflight", response_model=PreflightResult)
async def preflight(
    payload: PreflightRequest,
    user: User = Depends(get_current_user),
) -> PreflightResult:
    """Diagnose an unsaved mailbox connection, one blocking failure at a time."""
    return await run_preflight(payload)
```

Match the existing dependency names in this file for the authenticated user — read the neighbouring routes and copy their `Depends(...)` exactly rather than assuming `get_current_user`.

- [ ] **Step 4: Re-implement `test_connection` on the ladder**

In `backend/app/services/mailbox_service.py`, replace the body of `test_connection` after the OAuth short-circuit and the missing-config guard so it delegates:

```python
    fernet = get_fernet_service()
    password = fernet.decrypt(mbx.smtp_password_encrypted).decode("utf-8")
    try:
        result = await run_preflight(
            PreflightRequest(
                smtp_host=mbx.smtp_host,
                smtp_port=mbx.smtp_port,
                username=mbx.smtp_username,
                password=password,
                imap_host=mbx.imap_host,
                imap_port=mbx.imap_port,
            )
        )
    finally:
        password = ""

    blocking = result.blocking
    smtp_failed = blocking is not None and not blocking.id.startswith("imap_")
    imap_failed = blocking is not None and blocking.id.startswith("imap_")
    return TestConnectionResponse(
        smtp_ok=not smtp_failed,
        imap_ok=None if not (mbx.imap_host and mbx.imap_port) else not imap_failed,
        smtp_error=f"{blocking.id}: {blocking.detail}" if smtp_failed else None,
        imap_error=f"{blocking.id}: {blocking.detail}" if imap_failed else None,
        note=blocking.remedy if blocking else None,
    )
```

Add `from app.services.mailbox_preflight import PreflightRequest, run_preflight` to the imports.

- [ ] **Step 5: Narrow the blanket handlers in `_probe_smtp` / `_probe_imap`**

Spec §3 requires the generic fallback to carry a stable id and the exception class name only — never the exception message, which is what produced the misleading `authentication_failed` string. `test_connection` no longer routes through these functions after Step 4, but the live warmup send path still does, so their logging must stop asserting a cause it did not establish. In `backend/app/services/mailbox_service.py`, change both trailing handlers from:

```python
    except Exception as exc:  # noqa: BLE001 — sanitized on the way out
        return False, _sanitize_exception(exc)
```

to:

```python
    except Exception as exc:  # noqa: BLE001 — class name only, never the message
        return False, f"probe_unknown: {type(exc).__name__}"
```

Do not add per-exception branches here. Detailed classification lives in the preflight ladder; this path only needs to stop claiming an authentication failure it never observed.

- [ ] **Step 6: Add the rate limit**

The endpoint opens sockets to user-supplied addresses, so it must not become a port scanner. Read `mailboxes.py` first and apply whatever rate-limit dependency its other write routes already use, with a ceiling of 10 preflights per minute per workspace. If the file has no limiter pattern at all, stop and report that rather than inventing one — an unlimited version of this endpoint must not ship.

- [ ] **Step 7: Run the tests**

Run: `cd backend && pytest tests/test_mailbox_preflight_api.py tests/test_mailboxes.py -v`
Expected: PASS. The existing mailbox tests must still pass — `TestConnectionResponse`'s shape did not change.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/routes/mailboxes.py backend/app/services/mailbox_service.py backend/tests/test_mailbox_preflight_api.py
git commit -m "feat(mailboxes): preflight endpoint, test_connection now uses the ladder"
```

---

### Task 10: Frontend — provider card, check step, inline validation

**Files:**
- Modify: `frontend/src/pages/onboarding/steps/Step2Provider.tsx:6`
- Create: `frontend/src/pages/onboarding/steps/Step2bServerCheck.tsx`
- Modify: `frontend/src/pages/onboarding/steps/Step3Credentials.tsx`
- Modify: `frontend/src/pages/onboarding/OnboardingWizard.tsx`
- Modify: `frontend/src/lib/locales/onboarding.ts`

**Interfaces:**
- Consumes: `POST /api/v1/mailboxes/preflight` returning `{ ok, checks, blocking }` (Task 9).
- Produces: a `self_hosted` provider option and a check step rendered between provider selection and credentials.

- [ ] **Step 1: Add the provider to the union and the card list**

In `Step2Provider.tsx`, extend the type on line 6 and add a card matching the shape of the existing entries:

```tsx
type Provider = 'gmail' | 'outlook' | 'outlook_oauth' | 'yahoo' | 'zoho' | 'smtp' | 'self_hosted';
```

```tsx
  {
    id: 'self_hosted',
    titleKey: 'onb.prov.title.self_hosted',
    subtitleKey: 'onb.prov.sub.self_hosted',
    auth: 'smtp',
  },
```

- [ ] **Step 2: Add the copy**

In `frontend/src/lib/locales/onboarding.ts`, add keys for the card and one per check `id`. Keying by `id` means translations track the taxonomy instead of drifting from it:

```ts
'onb.prov.title.self_hosted': 'Self-hosted mail server',
'onb.prov.sub.self_hosted': 'Postfix, docker-mailserver, Mailcow, Mail-in-a-Box',
'onb.pf.host_invalid': "That's not a hostname",
'onb.pf.host_docker_internal': "That's an internal name",
'onb.pf.dns_no_record': 'That hostname does not resolve',
'onb.pf.dns_wildcard': 'That hostname is a wildcard match',
'onb.pf.cdn_proxied': 'Your DNS points at a CDN, not your server',
'onb.pf.port_filtered': 'A firewall is blocking the port',
'onb.pf.port_closed': 'Nothing is listening on that port',
'onb.pf.no_starttls': 'Your server has no TLS configured',
'onb.pf.no_auth': 'Your server has no submission service',
'onb.pf.tls_invalid': 'The certificate does not match',
'onb.pf.auth_failed': 'Those credentials were rejected',
'onb.pf.imap_failed': 'IMAP sign-in failed',
'onb.pf.spf_advice': 'Check your SPF record',
```

- [ ] **Step 3: Build the check step**

Create `Step2bServerCheck.tsx`. It posts host and port only — no password — so the user can fix infrastructure before they have credentials to hand. Render **only `blocking`**, never the whole `checks` array: showing six problems at once is the failure mode this feature exists to avoid.

```tsx
const res = await api.post('/mailboxes/preflight', {
  smtp_host: host,
  smtp_port: port,
  username: email,
});
if (res.data.ok) { onNext(); return; }
setBlocking(res.data.blocking);
```

The remedy card shows `t('onb.pf.' + blocking.id)` as the heading, `blocking.detail` as the observed fact, and `blocking.remedy` in a copy-to-clipboard `<pre>` when it contains a command or a DNS record.

- [ ] **Step 4: Insert the step into the wizard**

In `OnboardingWizard.tsx`, render `Step2bServerCheck` between the provider and credentials steps **only** when the selected provider is `self_hosted`. Every other provider keeps its current step sequence unchanged.

- [ ] **Step 5: Add inline container-name validation**

In `Step3Credentials.tsx`, reject a host with no dot, or one of `mail`/`mailserver`/`smtp`/`localhost`, at the field level with the `onb.pf.host_docker_internal` copy — no round trip needed for a fault we can see in the input.

- [ ] **Step 6: Verify in the browser**

Run the frontend dev server. Select **Self-hosted mail server**, enter host `mail`, and confirm the inline error fires without a network call. Then enter `mail.edgyy.in` with port 587 and confirm the check step renders exactly one remedy card.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/onboarding frontend/src/lib/locales/onboarding.ts
git commit -m "feat(onboarding): self-hosted provider and server check step"
```

---

## Final verification

- [ ] Run the full backend suite: `cd backend && pytest`
- [ ] Confirm `alembic heads` reports exactly one head
- [ ] Confirm `MAILBOX_PROBES_DUMMY` is `false` in production config — the preflight ignores it, but `_probe_smtp` in the live send path does not
- [ ] Manually confirm the regression case end to end: provider `self_hosted`, host `mail`, port 587, a real password ⇒ the UI says "That's an internal name", never "authentication failed"
