# Build ledger — plan: 2026-08-19-self-hosted-mailbox-preflight.md

Branch: `feat/self-hosted-preflight`, off warmpulse main HEAD `81f203e`.
Baseline suite at branch point: **28 failed / 419 passed / 2 skipped** — all pre-existing on `main`
(SQLite missing-table + PendingRollbackError in test_dns_validator, test_payments,
test_imap_engagement, test_spam_rescue). Any new failure is ours.

## Progress

- **Tasks 1-2: complete** (`b91fb8b..35cf5f0`) — review clean, spec ✅, quality approved.
  - 13 tests passing (`test_mailbox_provider_enum.py`, `test_net_guard.py`).

- **Tasks 3-4: complete** (`35cf5f0..e5d51cb`) — review clean, spec ✅, plan code worked verbatim.
  - 18 tests passing (`test_mailbox_preflight_host.py`, `test_mailbox_preflight_dns.py`).

## Plan defects found in review and fixed in the plan

- **Rung ordering (Important).** `check_host_shape` (rung 1) rejects any label without a dot,
  so `mail`, `smtp`, `mailserver` and `localhost` all fail it *before* `check_not_container_name`
  (rung 2) ever runs. In a stop-at-first-failure ladder the user would only ever see the generic
  "that's not a hostname" message, never the Docker remedy — silently defeating the feature's
  motivating case. Fixed in the plan's Task 7 orchestrator: the container check now runs first.
  Task 7's `test_the_edgyy_incident_is_not_an_auth_failure` asserts the corrected behaviour.

- **Tasks 5-6: complete** (`e5d51cb..c6f19d1`) — spec ✅; two Important quality findings, queued as a
  fix round below. 40 tests passing across all preflight files.

- **Tasks 7-8 + fix round: complete** (`c6f19d1..e1f280a`) — spec ✅, quality approved, 50 tests passing.
  All three carried-forward fixes verified LANDED by an independent review:
  wildcard public-suffix guard (proven to short-circuit before any DNS query), `auth_failed`
  narrowed to `SMTPAuthenticationError` with `login()` proven unreachable on connect failure, and
  the multi-line 220 greeting drain. Review also confirmed `run_preflight` reuses the single
  resolved IP for every rung — resolve-then-pin holds, the SSRF guard is not bypassable mid-ladder.
- Minor, accepted: `read_ehlo`'s banner drain handles an immediate EOF implicitly (the following
  write raises and is caught) rather than short-circuiting explicitly. Harmless.

- **Task 9: complete** (`523c4f0`, `e5dc7a9`). Split in two because the implementer correctly hit the
  plan's stop-gate: no rate-limiter pattern existed anywhere in the app, and the plan forbade
  inventing one. Escalation resolved by the controller — Redis is already a first-class dependency
  (`redis>=5.0.7`, configured `settings.redis_url`) with several services using TTL keys
  (`mobile_oauth_state.py`), so a fixed-window limiter follows an existing pattern rather than
  adding a stack. Limiter **fails open**: a Redis outage must not break a diagnostic endpoint.
  - `test_connection` now derives from the ladder, so the API and the diagnostic cannot diverge.
  - `_probe_smtp` / `_probe_imap` fallbacks narrowed to `probe_unknown: <ExceptionClass>`.
  - `tests/test_mailboxes.py` was amended (outside Task 9's file list, unavoidable): two tests
    mocked the `_probe_smtp` boundary that Step 4 now bypasses.
  - Controller verified the count independently: **75 passed** across all preflight, net_guard,
    mailboxes and enum test files. The implementer's reported "73" came from an incomplete file
    list in its own run, not a lost test.

## Fix round 1 — CLOSED, all findings addressed

Both defects originate in the plan's own code, copied verbatim by the implementer.

1. **`check_smtp_auth` mislabels connection failures as `auth_failed` (Important).** One
   `except Exception` wraps both `client.connect()` and `client.login()`, so a TLS or connect
   failure returns "The server rejected these credentials". This violates the plan's own Global
   Constraint — and is the exact bug the feature exists to eliminate. Fix: catch
   `aiosmtplib.SMTPAuthenticationError` for `auth_failed`, and return a distinct
   `auth_probe_failed` for connect/TLS-level errors. Needs a test where `connect()` raises and
   `login()` is never reached.
2. **`read_ehlo` mis-parses a multi-line SMTP greeting (Important).** It reads exactly one line
   for the 220 banner. RFC 5321 permits `220-...` continuation lines, which real self-hosted
   MTAs send. The leftover banner line is then consumed as a capability and, having a space in
   position 4, breaks the loop immediately — yielding empty capabilities and a false
   `no_starttls` / `no_auth` verdict against a perfectly healthy server. Fix: drain banner lines
   until one whose 4th character is a space, then send EHLO. Needs a multi-line-greeting test.

## Deferred minor (accepted)

- `check_tcp`'s `except (ConnectionRefusedError, OSError)` buckets any other socket error
  (network unreachable, connection reset) as `port_closed` with a "nothing is listening"
  remedy. Inherited from the plan, which only specifies the timeout/refusal dichotomy.

## Carry-forward fix (queued for the Task 7 dispatch)

- `check_not_wildcard` derives its parent as `".".join(parts[1:])`, with no public-suffix
  awareness. For a two-label host such as `edgyy.in` the parent becomes the TLD `in`, so the
  probe queries `<uuid>.in` against a public-suffix nameserver. NXDOMAIN is near-certain today,
  so no false wildcard verdict is expected, but it is an inappropriate query and a nonzero
  false-positive risk if any TLD ever answers random labels. Guard: skip the rung when the host
  has fewer than three labels.

## Deferred minors

- `net_guard._lookup_a_records` collapses a transient DNS SERVFAIL/timeout into the same
  `no_dns_record` result as a genuine NXDOMAIN. Fails closed, so not a security issue, but a
  user with a resolvable host could be told it does not resolve during a resolver hiccup.

## ⚠️ Integration risk — must be handled at merge time

Migration `0042_self_hosted_provider` sets `down_revision = "0039_device_tokens"`, because
`0040_crm_template_logo` and `0041_crm_body_text` exist **only in the uncommitted WIP** on
`main`, not in the commit this branch was cut from.

When this branch merges into a `main` that has 0040/0041 committed, alembic will see **two
heads**. Before merging, either repoint `0042`'s `down_revision` at the then-current head, or
generate an `alembic merge` revision. Do not merge without checking `alembic heads`.
