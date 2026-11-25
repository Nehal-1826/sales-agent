# Delete Account (30-Day Recycle Bin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A platform admin can delete a customer's account from the console; it can be brought back for 30 days; after that it is removed for good, together with the workspace it stopped.

**Architecture:** `User.deleted_at` / `User.deleted_by` and `Workspace.deleted_at` mark what is deleted (the existing `is_active = False` is what stops sign-in and the worker). One module (`core/accounts.py`) holds the three moves — delete, restore, purge — and the views, the management command and the worker thread all call it. The warmup service is reached by e-mail through one small module (`core/warmup_accounts.py`), server-to-server, with a bridge token minted for the acting admin; no change to the FastAPI service.

**Tech Stack:** Django + DRF, React + TypeScript, Playwright (`scripts/e2e/flow.py`).

Spec: `docs/superpowers/specs/2026-11-25-superadmin-controls-2fa-refresh-design.md` § 4.

## Global Constraints

- Platform-admin writes need an OTP-satisfied platform admin (`platform_api`) and a reason; every write goes to `PlatformAuditLog` under the admin's name.
- A deleted account must never keep warming: if the warmup service cannot be reached, the deletion is refused and nothing changes.
- Billing rows (`Subscription`, `Invoice`, `Payment`, `Refund`) and the audit log are never removed by a purge.
- Purging an active subscription never calls a payment gateway.
- Plain, everyday words in every message. No new dependencies. No push, no deploy.
- Local stack for the browser gate: Django :8000, FastAPI :8001, Vite :5173. Tests never send e-mail: the warmup service is faked in every test that reaches it.
- `User.save()` makes a new user inherit the active workspace — change users with `User.objects.filter(pk=…).update(…)`, never `save()`.
- `ImpersonationTicket`, the sign-in stamp (`note_sign_in`) and the refusal middleware are from piece 3 — they are used, not changed.

## Decisions taken while reading the code (inside the approved design)

- **The deletion that stops a workspace deletes the other accounts in it too.** A workspace may have *members* next to its owners. Stopping it with the last owner would leave them as accounts nobody can sign in to, in a workspace that could never be purged. They go in the same moment, with the same 30 days; each can be restored on its own. The dialog says how many.
- **A workspace starts again when it has an owner or admin again** — the mirror of the rule that stops it. (Restoring the one account "whose" deletion stopped it is not enough: with two deleted owners, restoring the first must give them a running workspace.)
- **Warmup: the mailboxes are paused, the copy is not suspended.** Suspending a copy only blocks sign-in on the warmup side (`backend/app/api/deps.py`); the engine keeps warming its mailboxes. Paused mailboxes are skipped by the engine.
- **Sign-in says "This account was deleted." only when the password is right** — otherwise the message would tell which names were deleted.
- **A purge that cannot reach the warmup service leaves that account for the next day** (its copy must go first). When the admin who deleted it no longer exists, the copy is left, logged with its e-mail, and the purge goes on.

## Contract between server and app

### Accounts list (changes to piece 3's `GET /api/platform/users/`)

- Deleted accounts are left out unless `status=deleted` is asked.
- `AccountRow` gains `workspace_accounts: number` (accounts of the workspace that are not deleted, this one included) and fills `deleted_at`, `deleted_by`, `purges_at` (= `deleted_at` + 30 days) for a deleted account.

### Delete and restore

| Call | Body | Answer |
|------|------|--------|
| `POST /api/platform/users/<id>/delete/` | `{reason, confirmEmail}` | 200 `{deleted: true, workspace_stopped: bool, deleted_accounts: string[]}` (the usernames of every account that went) |
| `POST /api/platform/users/<id>/restore/` | `{reason}` | 200 `{restored: true, workspace_started: bool}` |

Errors: `400 {error: 'reason_required'}`, `404 {error: 'not_found'}`,
`400 {error: 'cannot_delete', detail}` (a platform admin, yourself, an account with no workspace),
`400 {error: 'already_deleted', detail}`, `400 {error: 'email_mismatch', detail}`,
`400 {error: 'not_deleted', detail}` (restore something that is not deleted),
`502 | 503 {error: 'warmup_unavailable', detail: 'Nothing was changed. …'}`.

### Sign-in

Both doors and Google answer `403 {detail: 'This account was deleted.'}` for a deleted account whose password is right.

### Warmup service (existing routes, called server-to-server)

`GET /api/admin/users?search=<email>&page_size=200` (then an exact, case-insensitive match on
`email`), `POST /api/admin/users/bulk-pause-mailboxes {user_ids, action: 'pause' | 'resume'}`,
`DELETE /api/admin/users/<id>` (204). All need a `super_admin` bridge token:
`mint_warmup_token(user=<the acting admin>, workspace_slug='default')`.

---

### Task 1 (server): the warmup service, reached by e-mail

**Files:** Create `backend-agent/core/warmup_accounts.py`. Test: `backend-agent/core/tests/test_warmup_accounts.py`.

**Produces:** `WarmupAccountsError(detail, status_code=502)`, `copies_for(email, admin) -> list[dict]`,
`set_paused(email, admin, paused: bool) -> int`, `remove(email, admin) -> int`.

- [x] **Step 1: Write the failing tests** — `requests.request` is patched, never real:

```python
class CopiesTests(TestCase):
    def call(self, responses):
        with mock.patch('core.warmup_accounts.requests.request', side_effect=responses) as req:
            return req, warmup_accounts.copies_for('Ada@Acme.test', admin)

    def test_only_an_exact_email_match_counts(self):
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'items': [{'id': 'a', 'email': 'ada@acme.test'},
                                             {'id': 'b', 'email': 'xada@acme.test'}]}
        req, copies = self.call([resp])
        self.assertEqual([c['id'] for c in copies], ['a'])
        self.assertEqual(req.call_args.kwargs['params']['search'], 'Ada@Acme.test')

    def test_an_unreachable_service_is_an_error_never_no_copy(self):
        with mock.patch('core.warmup_accounts.requests.request', side_effect=requests.ConnectionError('x')):
            with self.assertRaises(warmup_accounts.WarmupAccountsError):
                warmup_accounts.copies_for('ada@acme.test', admin)
```

plus: `set_paused` with no copy asks nothing further and returns 0; with copies it posts
`{'user_ids': ['a', 'b'], 'action': 'pause'}` and returns `mailboxes_updated`; a non-200 is an
error; `remove` deletes every copy and counts them (404 counts as gone); a non-204 is an error;
`WARMUP_JWT_SECRET` unset → `WarmupAccountsError` with status 503.

- [x] **Step 2: Run → fail** — `manage.py test core.tests.test_warmup_accounts` (`ModuleNotFoundError`).
- [x] **Step 3: Implement** — `mint_warmup_token` from `core.warmup_bridge`, `warmup_api_base` from
`core.warmup_enroll`, `TIMEOUT = 8`, headers `Authorization: Bearer <token>`; a timeout or a
connection error is `WarmupAccountsError('Could not reach the warmup service.')`.
- [x] **Step 4: Run → pass.**

### Task 2 (server): fields and the sign-in message

**Files:** Modify `backend-agent/core/models.py` (`User.deleted_at`, `User.deleted_by`, `Workspace.deleted_at`), new migration `0048_deleted_accounts.py`, `backend-agent/core/views.py` (both login doors), `backend-agent/core/google_auth.py`. Tests: `backend-agent/core/tests/test_deleted_signin.py`.

```python
# User
deleted_at = models.DateTimeField(null=True, blank=True)
deleted_by = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL,
                               related_name='+')
# Workspace
deleted_at = models.DateTimeField(null=True, blank=True)
```

**Produces:** `DELETED_DETAIL = 'This account was deleted.'` and `_deleted_account(name, password) -> User | None`
in `core/views.py`.

- [x] **Step 1: Write the failing tests** — a deleted owner (set `deleted_at`, `is_active=False`
with `update()`): `/api/auth/login/` with the right password → 403 + `DELETED_DETAIL`; with a wrong
password → 401 `invalid credentials` (the message never says which names were deleted); by e-mail
too; `/api/auth/admin-login/` for a deleted staff account → the same; Google (`/api/auth/google/verify/`,
claims patched as the existing Google tests do) → the same. A sign-in attempt for a deleted
account is not a failed attempt (`lockout` sees nothing).
- [x] **Step 2: Run → fail.**
- [x] **Step 3: Implement** — in both doors, after `authenticate()` has answered None and before
`record_failure`: `gone = _deleted_account(uname, password)`; if found → 403. Google: after the
user is found, `if user.deleted_at is not None` → 403.
- [x] **Step 4: Run → pass.** `manage.py makemigrations core` → `0048_deleted_accounts.py`.

### Task 3 (server): delete, restore — `core/accounts.py` and the two views

**Files:** Create `backend-agent/core/accounts.py`. Modify `backend-agent/billing/views_platform.py`
(`user_delete`, `user_restore`, the accounts list), `backend-agent/billing/urls.py`. Tests:
`backend-agent/core/tests/test_accounts_delete.py`.

**Produces:**

```python
KEEP_DAYS = 30

def purge_date(deleted_at): ...                      # deleted_at + 30 days
def can_delete(admin, target): ...                   # (error, detail, status) | None
def delete_account(admin, target, reason=None, ip=None): ...   # {'workspace_stopped': bool, 'deleted': [usernames]}
def restore_account(admin, target, reason=None, ip=None): ...  # {'workspace_started': bool}
```

Delete, in this order: (1) work out whether the workspace stops — no owner or admin of it is
left who is neither deleted nor switched off; if it stops, the other accounts in it go too;
(2) pause the warmup mailboxes of every account that goes (`warmup_accounts.set_paused(email,
admin, True)`; one failing call raises and nothing is changed); (3) in one transaction: each
account `deleted_at = now, deleted_by = admin, is_active = False`, its DRF `Token`s deleted (the
sessions go with them), its open `ImpersonationTicket`s ended; and if the workspace stops,
`deleted_at = now, is_active = False`; (4) audit `platform.user.delete` with the target, the
workspace, the reason, `workspace_stopped` and the usernames.

Restore: (1) `warmup_accounts.set_paused(email, admin, False)`; (2) the account
`deleted_at = None, deleted_by = None, is_active = True`; (3) if the workspace is stopped by a
deletion (`deleted_at` set, not active) and now has an owner or admin again → `is_active = True,
deleted_at = None`; (4) audit `platform.user.restore`.

Accounts list: `qs.exclude(deleted_at__isnull=False)` unless `status == 'deleted'`;
`_ACCOUNT_STATUS_Q['deleted'] = Q(deleted_at__isnull=False)`; `purges_at` filled; `workspace_accounts`.

- [x] **Step 1: Write the failing tests** (the warmup module is patched: `mock.patch.object(accounts.warmup_accounts, 'set_paused', return_value=0)`)
  - Refused: a platform admin, yourself, an unknown id, an account with no workspace, a missing
    reason, a wrong `confirmEmail` (case and spaces forgiven), an account already deleted — and
    nothing changed in each case, `set_paused` never called.
  - The last owner: the workspace stops (`is_active` False, `deleted_at` set); the owner and the
    member next to them are deleted; sign-in says `DELETED_DETAIL`; their tokens are gone; the
    worker's workspace list (`Workspace.all_tenants.filter(is_active=True)`) no longer has it;
    `set_paused` was called with each e-mail and `True`.
  - One of two owners: the workspace keeps running; the other owner can still sign in.
  - A failing warmup call (`set_paused` raises `WarmupAccountsError`): 502 `warmup_unavailable`,
    "Nothing was changed." in the detail, and the account, the workspace and the audit log are untouched.
  - Restore: the account signs in again; the workspace that stopped starts again; a restored
    *member* alone does not start it; restoring a running account → 400 `not_deleted`; audit rows
    `platform.user.delete` / `platform.user.restore` with the admin as actor and the reason.
  - Accounts list: deleted ones are not listed; `status=deleted` lists them with `deleted_by`,
    `purges_at` = 30 days later; the Tenants list no longer shows a workspace stopped by a deletion.
- [x] **Step 2: Run → fail.**
- [x] **Step 3: Implement.**
- [x] **Step 4: Run → pass.**

### Task 4 (server): removed for good — `purge_deleted`

**Files:** `core/accounts.py` (`purge_deleted`, `workspace_models`, `_purge_workspace`), new
`backend-agent/core/management/commands/purge_deleted.py`, `backend-agent/core/management/commands/run_worker.py`
(a daily thread). Tests: `backend-agent/core/tests/test_accounts_purge.py`.

**Produces:**

```python
def workspace_models(): ...                 # every TenantOwned model outside the billing app (17 today)
def purge_deleted(days=KEEP_DAYS, dry_run=False, now=None): ...   # {'workspaces': [...], 'users': [...], 'kept': [...]}
```

A deleted account goes once it has been deleted for `days` days. A workspace stopped by a
deletion goes when none of its accounts can still be restored (every one is past `days`, or none
is left) and it still has accounts or rows (a purged one is never touched again). For each
account the warmup copy is removed FIRST (token minted for `deleted_by`; nobody to mint for →
left and logged; a failing call → that account waits for the next day). Then, in one transaction:
every row of the 17 models, every user of the workspace (tokens, sessions, tickets with them);
the workspace row stays, renamed `"Deleted account <id>"`, inactive; its active subscription
becomes `canceled` with `canceled_at = now`, no gateway call. Audit `platform.user.purge`.

- [x] **Step 1: Write the failing tests** — the 17 names are exactly the spec's list; `--dry-run`
  changes nothing and prints the plan; a real run removes rows of all 17 models and the users,
  keeps `Subscription`, `Invoice`, `Payment`, `Refund` and the audit log, renames the workspace,
  cancels an active subscription with no gateway call; a second run does nothing; `--days` is
  respected (deleted 29 days ago stays); a workspace with an account still inside its 30 days
  stays; a copy is removed before the rows; a failing call keeps the account; a vanished admin →
  copy left, logged, purge goes on; audit `platform.user.purge`.
- [x] **Step 2: Run → fail.**
- [x] **Step 3: Implement.** The command prints one line per removal; the worker thread
  (`_purge_forever`, named `daily-purge`) calls it at start and then every 24 h.
- [x] **Step 4: Run → pass.**

### Task 5 (app): the console — Delete, the Deleted filter, Restore

**Files:** Modify `frontend/src/lib/platform.ts` (`deletePlatformUser`, `restorePlatformUser`,
`workspace_accounts`), `frontend/src/pages/platform/accountUi.tsx` (`'deleted'` back in
`STATUS_FILTERS`), `frontend/src/pages/platform/UserDrawer.tsx`, `frontend/src/pages/platform/AdminUsersPage.tsx`.
Create `frontend/src/pages/platform/DeleteAccountDialog.tsx`.

**Copy (plain words, fixed):**

- Button: **Delete account** (danger; only for an account with a workspace that is not a platform
  admin's and not deleted). Dialog title **"Delete this account?"**.
- "This signs {name} out at once and removes their account from {company}. It can be brought back
  for 30 days; after that it is removed for good."
- Last owner or admin (`workspace_admins === 1` and the role is owner/admin): "{name} is the last
  owner or admin of {company}, so the whole workspace stops: lead finding and e-mails stop
  straight away." — and when `workspace_accounts > 1`: "The other {n} account(s) in it are deleted
  too. Each one can be brought back on its own."
- Field labels: **"Type their e-mail address to confirm"** (the address is shown above it) and
  **"Why are you deleting it? (recorded)"**. Confirm button **"Delete account"**.
- Deleted account in the panel: "Deleted on {date} by {admin}" and **"Removed for good on {date}"**;
  button **"Restore account"** → reason → **"Restore this account?"** — "This brings {name} back.
  They can sign in again." (+ " {company} starts running again." when it is the workspace's
  last… restored owner/admin and the workspace is stopped: shown when `workspace_admins === 0`).
- Filter button **"Deleted"** lists them; the Enter button stays greyed out for them (piece 3).

- [x] **Step 1: Build** — `npx tsc --noEmit -p .` passes.
- [x] **Step 2: Look at it** in the gate's screenshots (panel, dialog, Deleted filter, after restore).

### Task 6: browser gate, full gates, commit

- [x] The walk creates a throwaway account in the e2e DB (`e2e-delete-me`, owner of the workspace
  `e2e-delete-ws` "E2E Delete Co", through `django_shell`) → Users → its panel → **Delete account**
  → wrong e-mail is refused → the right e-mail + a reason → the row is gone from the list →
  **Deleted** lists it ("Removed for good" shown) → **Restore account** → back under All, Active.
  The throwaway workspace and its rows are removed in the `finally` (a real `.delete()`), with the
  walk's audit rows. Skipped with a note when the warmup service is down (the deletion is refused then, on purpose).
- [x] `manage.py test` · `npm run build` · `python scripts/e2e/flow.py` — all green; secret scan;
  one commit.

## Self-review

- Spec §4, step by step: fields + migration 0048 (Task 2); delete with its five steps (Task 3);
  sign-in message (Task 2); restore (Task 3); Tenants page (Task 3); `purge_deleted` with
  `--days`, `--dry-run`, the daily worker run, the 17 models, billing and audit kept, rename,
  canceled subscription, warmup copy, vanished admin, audit (Task 4); app copy, typed e-mail,
  reason, Deleted filter with the date and Restore (Tasks 5–6); tests listed in the spec (Tasks 3–4);
  browser gate (Task 6). No step is left without a task.
- Names match across tasks: `set_paused` / `copies_for` / `remove` (Task 1) are what Task 3 and
  Task 4 call; `can_delete`, `delete_account`, `restore_account`, `purge_deleted`,
  `workspace_models`, `KEEP_DAYS`, `purge_date` are defined once in Tasks 3–4; the wire names
  (`deleted_at`, `deleted_by`, `purges_at`, `workspace_accounts`, `workspace_stopped`,
  `workspace_started`, `warmup_unavailable`) are the same in the contract and in the tasks.

---

## As built (25 Nov 2026)

Done as planned, with these differences — each one found by a test, the gate or a review:

- **The username list is `deleted_accounts`.** The contract above named both the `true` and the
  list `deleted`; the list silently won on the wire (the console-side review caught it).
- **A deletion stamps the workspace only when the deletion is what stopped it.** A workspace an
  admin had already stopped by hand (Tenants) stays as they left it: bringing its owner back
  later never restarts it.
- **Accounts of a workspace stopped by a deletion are removed together**, when the last one
  passes 30 days — never one by one, which could restore someone into a workspace that can
  never start again. Any stopped workspace (by the deletion or by hand) goes once nobody in it
  can come back and it still has rows.
- **A management command's `handle()` returns nothing** — Django prints whatever comes back, and
  `call_command` crashed on the returned dict.
- **The warmup copy is paused, the copy is not "suspended".** Suspending only blocks sign-in on
  the warmup side; its engine keeps warming.
- **Latent bug from the two-factor piece, fixed here:** its migration test left the schema at
  migration 0046 for every test class that ran after it (they do not run in migration order).
  Nothing noticed until `Workspace.deleted_at` arrived and three thread tests broke. Both
  migration tests now sit on `core.tests.base.MigrationCase`, which brings the schema back to
  the newest migration after each test.
- **The worker's new daily thread** had to be added by name to the two test files that switch the
  worker's threads off (`test_run_worker`, `test_tenant_ops`).
- App, from the console-side review: a deleted account's row can no longer be ticked for the
  warmup bulk actions ("Resume all" would have undone the deletion's pause); its Warmup block
  says "Paused — the account is deleted" instead of "Running"; the "whole workspace stops"
  warning follows the server's rule for every role; `ReasonDialog` (`shared.tsx`) learned a
  `quiet` flag and hands the server's answer to `onDone`, so Restore can say what happened.
- Left as it was (found, not changed): Esc in the shared reason confirm closes the whole panel
  behind it — it already did so for Pause/Resume warmup, and fixing it changes every nested
  dialog in the app.
- Gate: 163 checks (was 153) — the delete walk deletes and restores a throwaway account for real,
  asking the server after each click what it says about the account, its workspace and sign-in.
