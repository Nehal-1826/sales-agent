# Superadmin controls, single-device optional 2FA, refresh flash — Design

Date: 2026-11-25
Status: approved by the owner (Devesh) — "ok" to every default on 2026-11-25
Built as: four sub-projects, in the order below, each tests-first. Deployed
only on the owner's word.

## Goal

Four things the owner asked for on 2026-11-24:

1. On refresh, the marketing landing page flashes before the dashboard.
2. Two-factor: remove the multi-device option; make 2FA optional for
   superadmins (it already is for users).
3. A superadmin can enter a customer's workspace as that customer.
4. A superadmin can delete a customer's account.

## Decisions (fixed by the owner)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Build order | refresh flash → 2FA → enter as user → delete account |
| 2 | 2FA for superadmins | off unless turned on in console Settings; can be turned off again with a code; accounts that have it today keep it until they turn it off |
| 3 | Enter as user | opens that person's workspace in a new tab, 60 minutes, can approve and send emails as that person (NOT view-only) |
| 4 | Delete account | 30-day recycle bin, then removed permanently |

Stated risk the owner accepted with decision 2: a superadmin without 2FA is
protected by its password alone, and that account can enter customers'
workspaces and delete accounts. The Settings page says so.

## 1 · Refresh flash

### Cause (confirmed and reproduced)

The build pre-renders the marketing page into `dist/index.html`
(`scripts/prerender.mjs`), and nginx serves that one file for every route
(`try_files $uri $uri/ /index.html`). On live, `/leads`,
`/settings/mailboxes` and `/<admin-slug>/users` all return the same 18 KB
file as `/`: 68 marketing elements inside `<div id="root">`. The browser
paints it at once; the app replaces `#root` only when its JavaScript has
loaded. `App.tsx` already keeps a spinner instead of switching to the landing
*inside React* — it cannot undo what was painted before React ran.

### Fix — a guard that runs before the first paint

In `frontend/index.html` (the template every pre-rendered page is built
from; the pre-render keeps everything outside `#root`). The pre-render then
keeps the guard in ONE file only, the home file `dist/index.html` — the one
that is also the fallback for every app route — and strips it from the
other marketing pages, so a signed-in visitor of `/pricing` keeps the
instant marketing page too:

- A tiny inline script in `<head>`: if `localStorage` holds a sign-in
  (`agentic-ai:token`, the key `lib/transport.ts` and `App.tsx` both read),
  it sets `data-session="1"` on `<html>`. Wrapped in `try/catch` (storage
  can be unavailable).
- An inline style: `html[data-session="1"] #root { visibility: hidden }`
  hides the pre-rendered marketing page.
- A neutral loading mark after `#root` (`#boot`: the WarmPulse mark,
  "WarmPulse", "Loading…"), shown only while `data-session` is set.
- `App` removes `data-session` and `#boot` in its first effect — after its
  first commit, whatever that screen is (spinner, sign-in page, dashboard).

The template must keep the exact string `<div id="root"></div>`: the
pre-render finds it and puts each page's HTML inside it.

Behaviour:

| Who | What is painted first |
|-----|-----------------------|
| Signed-out visitor at `/`, `/pricing`, … | the marketing page, at once (unchanged — first paint and SEO keep working) |
| Signed-in person, any route, refresh | the loading mark, then the app |
| Stale/invalid sign-in | the loading mark, then the sign-in page (no landing flash either) |

Nothing on the server changes (the live nginx file carries uncommitted
edits and is not touched). No Content-Security-Policy exists on live or in
the repo, so the inline script is allowed.

### Tests

- Build check (browser gate, dist section): `dist/index.html` contains the
  guard (`data-session`) and `#boot`.
- Browser checks (browser gate): serve the BUILT files the way nginx does
  (Playwright answers document and asset requests from `frontend/dist`, the
  API goes to the dev server), sign in, open an app route with the app's
  JavaScript left pending → the marketing page is **not** visible and the
  loading mark is; let the JavaScript load → the app is visible. Control:
  signed-out at `/` → the marketing page is visible at once.

## 2 · Two-factor: one authenticator, optional for superadmins

### Today

- `core/authz.py`: `otp_satisfied(request)` is true for a platform admin only
  after a TOTP code (`PlatformSession.otp_verified_at`, 12 h). `auth_extras`
  reports `otp_required` for every admin until then, so `TotpScreen` always
  shows and, when the admin has no secret, enrols one automatically.
- Multi-device: `TotpDevice` (migration 0038), up to 3 authenticators; the
  "Authenticator devices" card in `TwoFactorPanel.tsx`; devices endpoints on
  both doors. Live has 0 device rows.

### Server

- **Second check passed** = a verified code OR the account has no 2FA on:
  - `_issue_login_token` (`core/views.py`): for a platform admin whose 2FA
    is off, record the new `PlatformSession` as satisfied at once. Admins
    with 2FA on are unchanged (a fresh login must pass the code again).
  - Everything downstream (`IsPlatformAdminWithOTP`, the warmup bridge
    token, `auth_extras.otp_required`) follows from that one rule; no other
    gate is touched.
  - An admin who turns 2FA on in Settings confirms a code on the spot
    (existing `tfa_confirm`); an admin who turns it off enters a code
    (existing `tfa_disable`). Both unchanged.
- **Multi-device removed**:
  - Delete the `TotpDevice` model and its table (new migration 0046; 0 rows
    on live, so nobody loses a way in).
  - `user_totp_secrets` → the primary secret only; `check_totp_any`
    → the primary secret only (same lockout, same replay guard).
  - Delete `handle_2fa_devices`, `handle_2fa_device_add`,
    `handle_2fa_device_confirm`, `handle_2fa_device_remove` and the routes
    `/api/auth/2fa/devices/…`, `/api/platform/2fa/devices/…`.
  - The security trail on the primary (`totp_added_*`,
    `totp_last_used_ip`, migration 0039) stays.

### App

- `TwoFactorPanel.tsx`: the "Authenticator devices" card and its four
  props go; `TwoFactorSection.tsx` and `AdminSettingsPage.tsx` stop passing
  them; the device helpers and types in `lib/platform.ts` /
  `lib/endpoints.ts` go.
- `TotpScreen.tsx`: the "admin without a secret → enrol automatically"
  branch is dead (such an admin is never sent there) and is removed; the
  screen serves accounts that have 2FA on.
- Console Settings, 2FA card: "Two-factor is optional. Keep it on if this
  account can enter customers' workspaces or delete accounts."

### Tests

- Admin with 2FA off: signs in with password → `otp_required` false, the
  console APIs and the warmup bridge token work at once.
- Admin with 2FA on: unchanged — `otp_required` true until the code.
- Admin turns 2FA off with a code → next sign-in is password-only.
- Admin turns 2FA on → next sign-in asks for the code.
- Workspace user with 2FA on/off: unchanged.
- Device routes answer 404; a code from a second (no longer existing)
  device has no effect; migration 0046 drops the table.

## 3 · Enter as user (impersonation)

### Today

The console's Users page lists the warmup side's copies of users and its
"Enter as user" button mints a warmup token for an address the merged app
no longer has. It never opened the workspace app, and accounts without a
warmup copy were invisible.

### Users page lists the real accounts

- `GET /api/platform/users/` (Django, platform admin, OTP-satisfied):
  every account — `id`, `email`, `username`, `name`, `role`
  (`platform_admin` / `owner` / `admin` / `member`), `workspace`
  `{id, name, slug}`, `workspaceAdmins` (owners + admins that are neither
  deleted nor switched off, this one included — 1 means "the workspace stops
  with this account"), `plan`, `status`, `twoFactor`, `lastLogin`, `joined`,
  and for deleted accounts `deletedAt`, `deletedBy`, `purgesAt`.
  `status` is `deleted` when `deleted_at` is set; otherwise `pending` when
  the email is not verified; otherwise `suspended` when the account is
  switched off (`is_active = False`) or its workspace is stopped;
  otherwise `active`. Search, role and status filters, pagination. Deleted
  accounts only with `status=deleted`.
- The table shows these accounts. Warmup-only facts (mailboxes, last seen)
  and the existing warmup actions (plan change, pause warmup account, bulk
  pause mailboxes, payments) stay, joined by email to the warmup list the
  page already loads; they appear only when a warmup copy exists.
- The warmup-side "Delete user" button goes (one delete, the real one).

### Ticket

`ImpersonationTicket` (new model, migration 0047): `key_hash` (SHA-256 of
the ticket; the ticket itself is never stored), `admin`, `target`,
`workspace`, `reason`, `created_at`, `started_at`, `ends_at`, `ended_at`,
`last_used_at`, `admin_ip`. The raw ticket is the credential of the
impersonated tab. Before it is started it is good for 10 minutes; once
started it lasts 60 minutes and cannot be extended.

| Step | Endpoint | Who | What |
|------|----------|-----|------|
| Issue | `POST /api/platform/users/<id>/impersonate/` `{reason}` | platform admin, OTP-satisfied | checks (below), creates the ticket, audit `platform.impersonate.issue`, returns the ticket (must be started within 10 minutes) |
| Start | `POST /api/auth/impersonate/start/` `{ticket}` | the new tab | marks started, `ends_at = now + 60 min`, audit `platform.impersonate.start` |
| Use | `Authorization: Impersonation <ticket>` on any workspace request | the new tab | authenticated as the target, inside the target's workspace |
| Show | `GET /api/auth/me/` | the new tab | the target's profile + `impersonation {admin, name, workspace, startedAt, endsAt}` |
| End | `POST /api/auth/impersonate/end/` | the new tab | `ended_at = now`, audit `platform.impersonate.end` |

Checks when issuing: the target exists, has a workspace (never a platform
admin, never the admin themself), is not deleted, is not switched off, its
workspace is not stopped, and the admin gives a reason. A target with 2FA on
is entered without a code (that is what a superadmin entering does; it is
recorded). The app greys the button out with the reason for each of these.

### Authentication

`core/authentication.py`: a new `ImpersonationAuthentication`, first in
`DEFAULT_AUTHENTICATION_CLASSES`. It only looks at the `Impersonation`
keyword (a ticket can never pass as a normal token, nor the other way round).
Valid = exists, started, not ended, `now < ends_at`. Then it binds the
request to the target's workspace (the existing `activate_user_workspace`)
and marks `request.impersonation`. Invalid → 401 "This session has ended —
close this tab." `last_used_at` is touched at most once a minute.

### What cannot be done inside (enforced by the server, not by hidden buttons)

A request signed with a ticket is refused (403 "Not available while you are
inside as another user") for: changing the password, the username, or 2FA
(`/api/auth/password/`, `/api/auth/change-username/`,
`/api/auth/2fa/…`), the warmup bridge token (`/api/auth/warmup-token/` — the
Warmup page is not available inside), and every platform-admin API
(`/api/platform/…` — which is also where account deletion lives). The same
list (`core.impersonation.REFUSED_PREFIXES`) is enforced in two places: in the
authentication class and, before the router, in
`core.middleware.ImpersonationRefusalMiddleware` — so an address with no view
behind it is refused all the same instead of answering 404.
`/api/auth/logout/` inside a ticket ends the ticket instead of signing the
target out, and "Enter as user" never counts as the person's own sign-in
(`lastLogin` is written only where a session really starts).

Everything else is as that person: their role decides what they may do, and
approving and sending emails is allowed (decision 3).

### Recording

Start and end are written to `PlatformAuditLog` under the admin's name with
the target and workspace, the reason and how long it lasted. Requests made
inside are not logged one by one (volume); what was done shows in the
workspace's own history (runs, approvals, sent mail).

### App

- `lib/transport.ts`: a tab that holds a ticket (sessionStorage
  `agentic-ai:impersonation` — per tab, so the admin's own tab is never
  touched) sends `Impersonation <ticket>` instead of the token. On the
  "ended" 401 it drops the ticket and the tab shows the ended screen.
- Hand-off to the new tab: the console opens `/impersonate#t=<ticket>`.
  A fragment is not sent to the server and not put in referrers; the new
  tab moves it from the address bar into sessionStorage at once
  (`history.replaceState`), then calls start.
- `/impersonate` is handled at the top of `App.tsx` (like the admin slug
  routes): start → the workspace shell with a fixed banner above it:
  "You are inside **<Workspace>** as **<Name>** · started by <Admin> · ends
  at HH:MM · **Exit**". Exit = the end call, the ticket is dropped, the tab
  says "You have exited. You can close this tab." Without a usable ticket
  the tab says so and offers nothing else.
- "Sign out" inside the banner's shell does the same as Exit.
- The Warmup page shows "Not available while you are inside as another
  user." instead of probing the warmup API.
- Console → Users → a user's panel: "Enter workspace as this user" (asks
  for a reason) → opens the tab; if the browser blocks the pop-up, the
  panel shows a link to open it.

### Tests

- Server: cannot issue for a platform admin / yourself / a deleted account /
  without a reason; a ticket that is not started within 10 minutes is dead;
  started → 60 minutes; ended → dead at once; a ticket never works as
  `Token`, a token never works as `Impersonation`; requests inside run as
  the target in the target's workspace (a lead of another workspace is
  invisible); the refused paths answer 403; logout inside ends the ticket
  and leaves the target's own tokens alone; audit rows for issue/start/end.
- Browser gate (console walk): the Users page lists accounts; enter as the
  operator → a new page shows the workspace with the banner; Exit ends it.

## 4 · Delete account (30-day recycle bin)

### Why the whole workspace

Each real workspace on live has exactly one user. Deleting only the login
would leave a workspace nobody can enter while lead finding and email
sending keep running. So the workspace stops with its last owner/admin.

### Server

Fields (migration 0048): `User.deleted_at`, `User.deleted_by`;
`Workspace.deleted_at`. The existing `Workspace.is_active = False` is the
stop switch (login is refused, and the worker and the outbox already skip
inactive workspaces).

| Step | Endpoint | What |
|------|----------|------|
| Delete | `POST /api/platform/users/<id>/delete/` `{reason, confirmEmail}` | see below |
| Restore | `POST /api/platform/users/<id>/restore/` `{reason}` | within 30 days |

Delete (platform admin, OTP-satisfied):

1. Checks: the target exists, has a workspace (never a platform admin),
   is not the admin themself, is not already deleted, and `confirmEmail`
   equals the target's email.
2. The target: `deleted_at = now`, `deleted_by = admin`, `is_active = False`
   (no sign-in from this moment).
3. If no owner or admin who is neither deleted nor switched off is left in
   the workspace (other than the target): the workspace stops —
   `deleted_at = now`, `is_active = False`. Otherwise the workspace stays.
4. Warmup side: if a warmup copy exists (looked up by email), its mailboxes
   are paused at once (server-to-server with a bridge token minted for the
   acting admin). If that call fails the whole deletion is refused — a
   deleted account must never keep warming. No copy → nothing to do.
5. Audit `platform.user.delete` with the target, the workspace and whether
   the workspace stopped.

Sign-in answers "This account was deleted." for a deleted user.

Restore: clears the target's `deleted_at`, `is_active = True`; if the
workspace was stopped by that deletion, it starts again; the warmup
mailboxes resume; audit `platform.user.restore`.

Tenants page: workspaces with `deleted_at` are not listed (they are managed
from Users).

### Removed permanently after 30 days

`manage.py purge_deleted [--days 30] [--dry-run]`, also run once a day by
the agent worker.

- A deleted account is purged once it has been deleted for 30 days.
- A stopped workspace (`deleted_at` set) is purged when none of its
  accounts can still be restored — every one of them is past its 30 days
  (or it has no accounts left). Purging it removes: every row of the 17
  workspace-owned models (`Lead`, `EmailDraft`, `Mailbox`, `EmailTemplate`,
  `Potential`, `Reply`, `Suppression`, `AgentConfig`, `AppSettings`,
  `SearchProfile`, `ChatMessage`, `PipelineRun`, `Sequence`, `SequenceStep`,
  `Enrollment`, `OutreachTask`, `WhatsAppMessage`) and every user of that
  workspace with their tokens, sessions and tickets.
- Billing rows (`Subscription`, `Invoice`, `Payment`, `Refund`) and the
  audit log are kept: the workspace row stays, renamed "Deleted account
  <id>", inactive. An active subscription becomes `canceled` — without a
  gateway call (the owner's own cancel refunds money and is not reused); a
  gateway-managed renewal must be cancelled in the gateway by hand.
- Warmup side: the copy and its mailboxes are deleted (same server-to-server
  call; skipped and logged if the deleting admin no longer exists).
- Audit `platform.user.purge`.

### App

Console → Users → a user's panel: "Delete account" opens a dialog that says
in plain words what will happen (whether the whole workspace stops), asks
for the person's email to be typed and a reason. A "Deleted" filter lists
deleted accounts with "Restore" and the date they are removed for good.

### Tests

- Server: refuses a platform admin / yourself / a wrong email / a missing
  reason / an already deleted account; deleting the last owner stops the
  workspace (sign-in refused, worker and outbox skip it); deleting one of
  two owners leaves the workspace running; a failing warmup call refuses the
  deletion and changes nothing; restore within 30 days brings user and
  workspace back; `purge_deleted` (dry-run changes nothing; real run removes
  the 17 models' rows and the users, keeps billing rows and the audit log);
  `--days` respected; audit rows for delete, restore and purge.
- Browser gate: delete with a typed email and a reason → the row moves to
  "Deleted" → restore → back.

## Build order and releases

Each sub-project: failing tests first, then the code, then the full gates
(Django suite, build, browser gate). One commit per sub-project. Deployed
only on the owner's word; releases with a migration run it on the server as
part of the deploy.
