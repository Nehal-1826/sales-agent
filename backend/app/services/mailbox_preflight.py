"""Ordered diagnostic ladder for mailbox connections.

Runs one check at a time and stops at the first blocking failure. Reporting
six problems at once is how you get a user to fix none of them.

See docs/superpowers/specs/2026-08-19-self-hosted-mailbox-preflight-design.md
"""
from __future__ import annotations

import asyncio
import contextlib
import re
import ssl as _ssl
import uuid
from typing import Literal

from pydantic import BaseModel

from app.services.cdn_ranges import is_cdn_ip
from app.services.net_guard import BlockedAddressError, is_port_allowed, resolve_public_ips

_CONNECT_TIMEOUT_S = 3.0
_RUNG_TIMEOUT_S = 10.0

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

    # Container check runs FIRST, before the generic shape check. A bare label
    # like "mail" fails both — it has no dot, so the hostname regex rejects it
    # too — and in a stop-at-first-failure ladder whichever runs first is the
    # only message the user ever sees. "That's a Docker service name" is the
    # useful one; "that's not a hostname" is not. Ordering is the whole fix.
    container_check = check_not_container_name(host)
    if container_check.status == "fail":
        return _stop(container_check)
    checks.append(container_check)

    shape_check = check_host_shape(host)
    if shape_check.status == "fail":
        return _stop(shape_check)
    checks.append(shape_check)

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

    domain = req.username.split("@")[-1] if "@" in req.username else host
    checks.append(build_spf_advice(domain, ips[0]))

    return PreflightResult(ok=True, checks=checks, blocking=None)


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
