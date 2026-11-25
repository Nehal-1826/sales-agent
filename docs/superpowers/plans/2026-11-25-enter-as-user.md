# Enter As User (Impersonation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A platform admin can open a customer's workspace in a new tab as that customer, for 60 minutes, with everything recorded and the admin's own tab untouched.

**Architecture:** Django issues a single-use ticket (stored hashed) after checking the target and a reason. The new tab starts the ticket and then sends `Authorization: Impersonation <ticket>`; a new authentication class turns that into the target user inside the target's workspace and marks the request, so a small list of paths can be refused server-side. The console's Users page now lists the REAL accounts (Django) joined with the warmup copies by email.

Spec: `docs/superpowers/specs/2026-11-25-superadmin-controls-2fa-refresh-design.md` § 3.

## Global Constraints

- Platform-admin writes need an OTP-satisfied platform admin (`platform_api`) and a reason; every write goes to `PlatformAuditLog`.
- A ticket is never stored raw (SHA-256 only), never valid as a `Token`, and a `Token` is never valid as an `Impersonation` ticket.
- The admin's own tab must never be affected by the impersonated tab (sessionStorage for the ticket, never localStorage).
- Plain, everyday words in every message. No new dependencies. No push, no deploy.
- Local stack for the browser gate: Django :8000, FastAPI :8001, Vite :5173.

## Contract between server and app

### Accounts

`GET /api/platform/users/?q=<text>&role=<owner|admin|member|platform_admin>&status=<active|suspended|pending|deleted>&page=<n>`
→ `{count, next, previous, results: AccountRow[]}` (25 per page). Deleted accounts only with `status=deleted`.

```ts
interface AccountRow {
  id: number;
  email: string;
  username: string;
  name: string;                       // first + last name, '' when empty
  role: 'owner' | 'admin' | 'member' | 'platform_admin';
  is_platform_admin: boolean;
  workspace: { id: number; name: string; slug: string } | null;
  workspace_admins: number;           // owners+admins neither deleted nor switched off, this one included
  plan: string | null;                // plan name
  plan_code: string | null;
  plan_status: string | null;
  status: 'active' | 'suspended' | 'pending' | 'deleted';
  two_factor: boolean;
  last_login: string | null;
  joined: string;
  deleted_at: string | null;
  deleted_by: string | null;          // username of the admin
  purges_at: string | null;
}
```

### Enter as user

| Call | Body | Answer |
|------|------|--------|
| `POST /api/platform/users/<id>/impersonate/` | `{reason}` | 200 `{ticket, starts_within_minutes: 10, lasts_minutes: 60, user: {id, username, email}, workspace: {id, name, slug}}` |
| `POST /api/auth/impersonate/start/` (no auth header) | `{ticket}` | 200 `{user: <the target's /api/auth/me/ payload>}` |
| any workspace request with `Authorization: Impersonation <ticket>` | — | as the target user |
| `POST /api/auth/impersonate/end/` (with the ticket) | — | 200 `{ended: true}` |

`/api/auth/me/` under a ticket adds `impersonation: {admin: <username>, name: <the person's name, else their username>, workspace: {id, name, slug}, started_at, ends_at}`.

Errors: `400 {error: 'reason_required'}`, `404 {error: 'not_found'}`, `400 {error: 'cannot_impersonate', detail}`,
`400 {error: 'bad_ticket'}`, `400 {error: 'ticket_used'}`, `400 {error: 'ticket_expired'}`,
`401 {detail: 'This session has ended — close this tab.'}`,
`403 {detail: 'Not available while you are inside as another user.'}`.

A ticket starts exactly once, within 10 minutes of being issued; once started it lasts 60 minutes.

### Refused inside a ticket (server-enforced)

`/api/auth/password/`, `/api/auth/change-username/`, `/api/auth/2fa/…`,
`/api/auth/warmup-token/`, `/api/platform/…` → 403. `/api/auth/logout/` → ends the ticket (target's own tokens untouched).

---

### Task 1 (server): ticket model, authentication class, refused paths

**Files:** `backend-agent/core/models.py` (new `ImpersonationTicket`), new migration `0047_impersonation_ticket.py`,
`backend-agent/core/authentication.py` (`ImpersonationAuthentication`, first in `DEFAULT_AUTHENTICATION_CLASSES` in `agentic/settings.py`),
`backend-agent/core/authz.py` (`token_otp_satisfied` true under a ticket), `backend-agent/core/views.py` (`me`, `logout`),
`backend-agent/core/impersonation.py` (new: key hashing, lifecycle checks, refused paths, audit).

- [x] Write failing tests `backend-agent/core/tests/test_impersonation.py` (ticket as/against `Token`, runs as the target in the target's workspace, another workspace's lead invisible, 2FA target without a code, expired → 401, refused paths → 403, logout ends the ticket and leaves the target's tokens, stopped workspace → 403)
- [x] Run → fail
- [x] Implement; migrate; run → pass

### Task 2 (server): accounts list

**Files:** `backend-agent/billing/views_platform.py` (`users`), `backend-agent/billing/urls.py`, tests `backend-agent/billing/tests/test_platform_users.py`.

- [x] Failing tests: shape of a row, platform admin listed as `platform_admin`, search by email/username/name, role and status filters, tenants/workspace admins refused (403), pagination shape
- [x] Implement `_account_row(user)`, `users(request)`
- [x] Pass

### Task 3 (server): issue / start / end + audit

**Files:** `billing/views_platform.py` (`user_impersonate`), `core/views.py` (`impersonate_start`, `impersonate_end`), `core/urls.py`, `billing/urls.py`, `core/impersonation.py`.

- [x] Failing tests: reason required; platform admin / yourself / unknown id refused; ticket starts once; not started within 10 minutes → `ticket_expired`; audit rows `platform.impersonate.issue` / `.start` / `.end` with the admin as actor
- [x] Implement
- [x] Pass; full Django suite

### Task 4 (app, agent A): the impersonated tab

**Files:** `frontend/src/lib/transport.ts`, `frontend/src/lib/warmupApi.ts`, `frontend/src/App.tsx`, new `frontend/src/lib/impersonation.ts`, new `frontend/src/pages/ImpersonatePage.tsx`, `frontend/src/styles.css` (append only).

- [x] Ticket in sessionStorage (`agentic-ai:impersonation`), `Impersonation` header, 401 drops the ticket only
- [x] `/impersonate#t=<ticket>` hand-off (fragment stripped at once), start, refresh-safe, banner, Exit
- [x] Warmup page / warmup calls not available inside; setup wizard and product tour not shown inside
- [x] `npx tsc --noEmit -p .` passes

### Task 5 (app, agent B): Users page on the real accounts + "Enter workspace as this user"

**Files:** `frontend/src/lib/platform.ts` (AccountRow + helpers), `frontend/src/pages/platform/AdminUsersPage.tsx` (and new files in that folder).

- [x] Table of real accounts joined with the warmup list by email; filters; KPIs
- [x] User panel: account facts; "Enter workspace as this user" (reason required) → new tab; pop-up blocked → link
- [x] Warmup actions stay for accounts that have a warmup copy
- [x] `npx tsc --noEmit -p .` passes

### Task 6: browser gate

- [x] Console walk: Users lists accounts; enter as the operator → new page shows the workspace with the banner; Exit ends it; the admin's own tab still works
- [x] Full gates; commit

---

## As built (25 Nov 2026)

Done as planned, with these differences — each one found by a test, the gate or a screenshot:

- **The refusal runs before the router too.** It lived only in the authentication
  class, which a view asks for once its address has resolved: the gate asked for
  `/api/auth/2fa/` (nothing behind it) and got a 404, not the 403. No access could
  leak that way (nothing acts as the customer without that class), but the design
  says "refused where every request passes". `core.middleware.ImpersonationRefusalMiddleware`
  (second in `MIDDLEWARE`) now answers 403 for any request signed with a ticket on a
  refused path, whatever sits behind it. The class keeps refusing as well.
- **"Last sign-in" was never written.** Nothing set `User.last_login` — both login
  doors, sign-up and Google mint tokens without touching it — so the Users page
  would have said "Never" for everyone. `core.authz.note_sign_in` is called at
  each of those four places (never for "Enter as user": the person did not sign in).
- **The bar says the person's name.** The profile carries no name, so the bar could
  only say the username; the session block (`impersonation`) now carries `name`.
- **An unknown `status` filter is a 400 (`bad_status`), never ignored.** Ignored, a
  filter that matched nothing would quietly list every account.
- **A start whose answer is lost is not a dead link.** Only a 400 spends the link
  ("not valid, or older than its 10 minutes"). No answer, a 5xx or a throttle
  leaves the ticket in the tab and offers "Try again"; a retry that hears
  `ticket_used` picks the running session up.
- **The Enter button follows the server's rule.** Greyed, with the reason, for a
  turned-off or deleted account (the server refuses them); an account whose e-mail
  is not verified yet can be entered. The first cut allowed only *Active* — the
  gate caught it: the seeded operator is "Not verified yet".
- **The skip link hung 33 px over the bar.** It is hidden by being pushed just
  above its shell, which now starts below the bar; it takes the bar's height too.
- **The "Deleted" filter button comes with piece 4** (delete account). Its label,
  type and the drawer's "Deleted …" line are in place and inert until then.
- Gate: 153 checks (was 142) — the enter-as-user walk signs in for real, opens the
  operator's workspace in a new page, checks the bar, the 403 doors, a refresh
  inside, the Warmup sentence, Exit, a dead ticket, the untouched admin tab, and
  that issue / start / end are recorded under the admin's name.
