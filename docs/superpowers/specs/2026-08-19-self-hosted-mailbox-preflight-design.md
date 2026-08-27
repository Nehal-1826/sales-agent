# Self-hosted mailbox provider + connection preflight

**Date:** 2026-08-19
**Status:** Design — approved in principle, not yet planned
**Scope:** `backend/app/services/`, `backend/app/api/routes/mailboxes.py`, mailbox provider enum + migration, onboarding frontend

## Problem

A real onboarding failure drove this design. A user (`sathya@edgyy.in`) runs a
self-hosted mail stack — `docker-mailserver` behind nginx on a single VPS — and
could not connect a mailbox. WarmPulse told them:

```
SMTPConnectError: authentication_failed. Verify host/port ... that it's an
App Password generated with 2FA enabled (not your normal account password).
```

Every part of that message was wrong. Their password was fine. The real chain
of faults, in the order they had to be fixed:

1. `EMAIL_HOST=mail` — a **Docker Compose service name**, meaningless outside
   the container network. The user copied it from their own `.env`.
2. `*.edgyy.in` is a **wildcard** record, so `mail.edgyy.in` resolved even
   though no such host was ever configured.
3. That wildcard is **Cloudflare-proxied**, and the Cloudflare proxy carries
   only HTTP/HTTPS. Port 443 connected; port 587 timed out.
4. Ports 587/465/993 were **never published** from the mail container, and were
   additionally dropped by the host firewall.
5. The mail server advertised **neither `STARTTLS` nor `AUTH`** — no submission
   service existed to authenticate against.
6. SPF authorised an unrelated IP with `-all`; there was no DMARC record and no
   DKIM key.

Diagnosing that took a long back-and-forth with an expert. None of it was
visible to the user, and our error message actively pointed away from the
cause.

### Why our code produced that message

`app/services/mailbox_service.py::_probe_smtp` ends with:

```python
except Exception as exc:  # noqa: BLE001 — sanitized on the way out
    return False, _sanitize_exception(exc)
```

One blanket handler collapses DNS failure, TCP timeout, connection refused, TLS
failure and genuine auth rejection into a single opaque string. The same
pattern exists in `_probe_imap`.

`app/services/provider_detector.py` classifies by MX and returns
`gmail | outlook | yahoo | zoho | icloud | unknown`. A self-hosted domain
matches nothing, returns `unknown`, and — per its own docstring — the frontend
falls through to bare host fields with no defaults and no guidance.

## Goals

- Tell a self-hosting user exactly which of the six faults above they have, one
  at a time, in the order they must be fixed.
- Never report an authentication failure unless authentication was attempted.
- Reuse the existing SPF/DKIM/DMARC validator rather than duplicating it, but
  make its remediation text specific to the user's real sending IP.

## Non-goals

- Fixing the user's server for them. We diagnose and instruct; we never connect
  over SSH or mutate their infrastructure.
- OAuth providers. `gmail`/`outlook` keep their current XOAUTH2 short-circuit in
  `test_connection`.
- Replacing the existing `smtp` provider. `smtp` stays for users who know their
  settings; `self_hosted` is for users who run the box.

## Design

### 1. New provider value

Add `self_hosted = "self_hosted"` to `MailboxProvider` in
`backend/app/db/models/mailboxes.py`. This is a PostgreSQL enum, so it needs an
Alembic migration in `backend/alembic/versions/` using `ALTER TYPE ... ADD
VALUE`. That statement cannot run inside a transaction block on older
PostgreSQL — the migration must set `op.execute("COMMIT")` first or be marked
non-transactional. The downgrade cannot remove an enum value; document that the
downgrade is a no-op rather than faking one.

UI label: **"Self-hosted mail server"**, subtitle *"Postfix, docker-mailserver,
Mailcow, Mail-in-a-Box"*.

### 2. `mailbox_preflight` service

New module `backend/app/services/mailbox_preflight.py`. It runs as an ordered
ladder and **stops at the first failure** — reporting six problems at once is
how you get a user to fix none of them.

Each rung returns a `PreflightCheck`:

```python
class PreflightCheck(BaseModel):
    id: str            # stable key, e.g. "cdn_proxied"
    status: Literal["pass", "fail", "warn", "skipped"]
    detail: str        # what we observed, with the real values
    remedy: str | None # what the user must do
    docs_anchor: str | None
```

The ladder:

| # | Check | Detection | `id` on failure |
|---|---|---|---|
| 1 | Host shape | contains `/`, `@`, a scheme, or no dot | `host_invalid` |
| 2 | Container name | matches `mail`, `mailserver`, `smtp`, `localhost`, `127.0.0.1`, or any single-label name | `host_docker_internal` |
| 3 | Resolves | A/AAAA lookup succeeds | `dns_no_record` |
| 4 | Wildcard | a random `<uuid4>.<domain>` label resolves to the same address set | `dns_wildcard` |
| 5 | CDN proxy | resolved IP falls in a published Cloudflare/Fastly range | `cdn_proxied` |
| 6 | TCP reach | connect to the submission port | `port_filtered` (timeout) or `port_closed` (RST) |
| 7 | EHLO capabilities | response advertises `STARTTLS` | `no_starttls` |
| 8 | EHLO capabilities | response advertises `AUTH` | `no_auth` |
| 9 | TLS | certificate is valid and covers the hostname | `tls_invalid` / `tls_name_mismatch` |
| 10 | SMTP AUTH | credentials accepted | `auth_failed` |
| 11 | IMAP | same ladder against the IMAP port | `imap_*` mirrors of 6–10 |
| 12 | DNS alignment | delegate to the existing validator (see §4) | `spf_*` / `dkim_*` / `dmarc_*` |

Rungs 1–11 are **blocking**: the ladder stops at the first failure and the
remaining rungs are reported `skipped`. Rung 12 is **advisory** — it runs only
once 1–11 have passed, and a failure there is `warn`, never `blocking`, because
a misaligned SPF record does not stop a mailbox from connecting. It is the one
rung that cannot set `PreflightResult.blocking`.

When the request carries no password, rungs 10 and 11 are `skipped` and rung 12
still runs, so a user can get their DNS advice before they have finished setting
up a mailbox password.

**Rung 6 is the highest-value check in the ladder.** A timeout and a refusal are
one letter apart in a log and mean opposite things: *filtered* means a firewall
is dropping packets (`ufw allow 587/tcp`); *closed* means nothing is listening
(publish the container port). Distinguish them by catching `TimeoutError`
separately from `ConnectionRefusedError`.

**Rungs 7 and 8 must run before any credential is used.** A server with no
`AUTH` capability cannot be authenticated against, and telling the user their
password is wrong in that situation is the exact bug this design exists to fix.

Rung 9 requires real certificate validation. `_probe_smtp` currently passes
`validate_certs=False` with a `_permissive_tls_context()`, so a broken or
mismatched certificate is silently accepted today. The preflight must do its own
**validating** TLS handshake to report rung 9 honestly. Whether the live warmup
path should also start validating is a separate decision — flagged in Risks, not
settled here.

### 3. Error taxonomy

Replace the blanket handlers in `_probe_smtp` and `_probe_imap` with explicit
mapping to the `id` values above. Rules:

- `auth_failed` is returned **only** when the server accepted a connection,
  advertised `AUTH`, and rejected the credentials.
- Sanitisation stays. We map exceptions to a stable `id` and write our own
  `detail` string; we never interpolate a raw exception or echo a password.
- The generic fallback becomes `probe_unknown` and includes the exception class
  name only, never its message.

### 4. DNS alignment — reuse, don't rebuild

`backend/app/api/routes/dns.py` already exposes a full validator producing
`FullDnsResult` with `SpfResult` / `DkimResult` / `DmarcResult`, plus static
remediation constants `SPF_FIX`, `DKIM_FIX`, `DMARC_FIX`. Rung 12 calls that
service rather than reimplementing it.

The one change: for `self_hosted` mailboxes those static fixes are too generic.
Once the ladder has resolved the mail host, we know the actual sending IP, so
the remedy becomes a literal record the user can paste:

```
v=spf1 ip4:<resolved_ip> ~all
```

Emit `~all` rather than `-all`. A hard fail on a freshly-configured self-hosted
server that later adds a second sender causes silent mail loss; softfail plus a
DMARC `p=none` reporting period is the safe order, and the UI should say so.

### 5. SSRF hardening — required, not optional

Active probing means an unauthenticated-ish user supplies a hostname and our
backend opens a socket to it. This is a server-side request forgery primitive
and must be constrained before the feature ships:

- **Resolve first, then validate the resolved IPs.** Reject loopback, RFC1918,
  RFC4193, link-local (`169.254.0.0/16` — this covers the cloud metadata
  endpoint `169.254.169.254`), `0.0.0.0/8`, and multicast.
- **Pin the connection to the validated IP.** Resolving once for the check and
  again for the connect is a DNS-rebinding hole; connect to the exact address
  that passed validation.
- **Ports are allow-listed**: 25, 465, 587, 143, 993, 2525. Nothing else.
- **Hard timeout** per rung (3s connect, 10s total) and a **per-workspace rate
  limit** on the preflight endpoint, so it cannot be used as a port scanner.
- Probe results are returned to the requesting workspace only, and never
  include raw socket errors.

Rung 2's rejection of single-label hosts is a usability feature *and* a small
part of this defence.

### 6. API surface

```
POST /api/v1/mailboxes/preflight
```

Runs the ladder against **unsaved** form input, so the user can iterate before a
mailbox row exists. Body carries host/port/username plus an optional password;
when the password is absent, rungs 10 and 11 are `skipped` and rung 12 still
runs (see §2). Response:

```python
class PreflightResult(BaseModel):
    ok: bool
    checks: list[PreflightCheck]   # every rung run, in order
    blocking: PreflightCheck | None # the first failure, if any
```

The existing `POST /{mailbox_id}/test-connection` stays for saved mailboxes and
is re-implemented on top of the same ladder, so the two cannot diverge.

### 7. Frontend

- Provider picker gains the **Self-hosted mail server** card.
- Choosing it inserts a **"Check your server"** step *before* the credentials
  step. That step calls `/preflight` with host and port only, and renders the
  blocking check as a single remedy card with a copy-paste command.
- Field-level validation rejects Docker service names inline (rung 2) without a
  round trip.
- New copy lives in `frontend/src/lib/locales/onboarding.ts`, keyed by check
  `id` so translations track the taxonomy.

## Testing

- Unit tests per rung with the network faked at the socket layer: DNS failure,
  wildcard hit, Cloudflare-range IP, timeout vs refused, EHLO lacking
  `STARTTLS`, EHLO lacking `AUTH`, cert name mismatch, auth rejection.
- A regression test asserting the original incident's shape: host `mail`,
  port 587, valid credentials ⇒ `host_docker_internal`, **never** `auth_failed`.
- SSRF tests: `127.0.0.1`, `169.254.169.254`, `10.0.0.1`, and a hostname that
  resolves public on first lookup and private on the second (rebinding).
- Ladder ordering test: a host failing several rungs reports only the earliest.

## Risks

- **`mailbox_probes_dummy`.** `_probe_smtp` and `_probe_imap` currently return
  unconditional success when this setting is on, with a comment saying it must
  be off before shipping as real SaaS. The preflight must ignore this flag
  entirely — a diagnostic that lies is worse than none. Confirm the flag's
  production value as part of implementation.
- **Certificate validation.** Rung 9 validates; the live send path does not.
  Users whose certs are broken will now see a warning while their warmup keeps
  working. That gap is deliberate for this change and should be closed
  separately.
- **Enum migration is one-way.** `ALTER TYPE ... ADD VALUE` cannot be reverted;
  the downgrade is a documented no-op.
- **Cloudflare IP ranges drift.** Rung 5 needs a periodically refreshed range
  list, or it silently stops detecting proxied hosts. Ship it as a vendored list
  with a dated comment and a refresh task.

## Resolved during design

**Rung 12 vs. the existing DNS onboarding step.** The two overlap, and showing
the same failure twice in one wizard is worse than showing it once. Resolution:
the preflight *runs* rung 12 but only to produce the IP-specific SPF text it
alone can generate — it renders that as a single advisory card that deep-links
into the existing "Verify domain records (DNS)" step with the record prefilled.
The DNS step remains the one place a user resolves DNS problems; the preflight
never duplicates its UI or its pass/fail gate.
