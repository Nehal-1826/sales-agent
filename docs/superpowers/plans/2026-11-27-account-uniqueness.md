# Account uniqueness — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One account per e-mail address and one company per name, enforced by every door and by the database itself; remove the duplicate super admin on live by ID, after a backup.

**Architecture:** `core/identity.py` is the one way to write and compare an e-mail, a username and a company name; migration `0051` adds the same rules as unique indexes (`LOWER(TRIM(email))`, `LOWER(username)`, a stored `name_key`); every door (sign-up, settings, wizard, profile apply, commands, startup bootstrap, Django admin, Google sign-in) asks `identity` first and answers in plain words. Live: backup → delete ID 1 → deploy.

**Tech Stack:** Django 4.2 + DRF, PostgreSQL (live) / SQLite (dev, tests), Playwright gate.

Spec: `docs/superpowers/specs/2026-11-27-account-uniqueness-design.md`.

## Global Constraints

- Every rule holds on the server and in the database, never in the UI only.
- Nothing is auto-resolved: a migration that meets duplicates stops and lists them.
- Messages, verbatim: `Email already registered. Sign in instead.` · `Company already exists. Sign in instead.` · `That username is already taken.`
- Normalisation: e-mail = trim + lower-case; company name = trim, collapse spaces, case-fold; usernames compare ignoring case. No address / no name is never a clash.
- Soft-deleted accounts and stopped companies keep their e-mail / name.
- No new dependencies. No push, no deploy, no data change without the owner's word. No phone, no invites.
- Existing logins, Google sign-in and workspaces keep working.

---

### Task 1: `core/identity.py` — the one way to write and compare

**Files:** Create `backend-agent/core/identity.py`, `backend-agent/core/tests/test_identity.py`.

**Produces:** `normalize_email(value)`, `email_is_taken(email, excluding=None)`, `username_is_taken(username, excluding=None)`, `company_key(name)`, `company_name_is_taken(name, excluding=None)`, `sync_company_name(settings_row)`, `signup_lost_race(email, company)`, `TAKEN_EMAIL`, `TAKEN_COMPANY`, `TAKEN_USERNAME`.

- [x] Write `HelpersTests` (pure functions), run red, write the module, run green.

```python
def normalize_email(value): return value.strip().lower() if isinstance(value, str) else ''
def company_key(name): return ' '.join((name or '').split()).casefold()[:200]
```
The taken-checks import `User`/`Workspace` lazily (models import this module at the top).

### Task 2: the database holds the same rules — models + migration 0051

**Files:** Modify `backend-agent/core/models.py` (`Workspace`, `User`), create `backend-agent/core/migrations/0051_identity_uniqueness.py`.

- `Workspace`: `name_key` (200, blank, not editable), `WorkspaceQuerySet.update(name=…)` keeps the key in step, `save()` computes it, `Meta.constraints = [UniqueConstraint(fields=['name_key'], condition=~Q(name_key=''), name='uniq_workspace_name_key')]`.
- `User`: `Meta(AbstractUser.Meta)` with `UniqueConstraint(Lower(Trim('email')), condition=~Q(email=''), name='uniq_user_email_ci')` and `UniqueConstraint(Lower('username'), name='uniq_user_username_ci')`; `save()` normalises the e-mail.
- Migration: `report_duplicates` (stops and lists clashes: names, addresses, a typed name that is another company's name) → `AddField name_key` → `fill_name_keys` → three `AddConstraint`s.
- Tests: `DatabaseRulesTests` (constraints on both databases, normalisation on save, raw update stopped, key follows the name) and one `MigrationCase` test (two clashing rows → the migration stops with their ids).

### Task 3: the sign-up door

**Files:** Modify `backend-agent/core/signup.py`, `backend-agent/core/tests/test_signup.py`.

- [x] `_email_in_use(email)` helper; `identity.TAKEN_EMAIL`; company-name check → `_fail('company', identity.TAKEN_COMPANY)`; a lost race → `_fail(*identity.signup_lost_race(email, company))` (re-raised when neither is taken).
- [x] Tests: taken address in another case / with spaces; taken company name; two sign-ups at once (address, company name); the three existing tests that relied on two companies named alike.

### Task 4: the other doors

**Files:** Modify `core/management/commands/create_platform_admin.py`, `create_workspace.py`, `bootstrap_admin.py`, `eval_assistant.py`, `core/admin.py`, `core/views.py` (change-username), `core/google_auth.py`.

- [x] Commands refuse a taken value (`CommandError`); `bootstrap_admin` prints "already exists elsewhere — nothing to do" and returns, and no longer prints the API token; `eval_assistant` names its workspace with the run's stamp.
- [x] `UserAdminForm.clean_email/clean_username`, `WorkspaceAdminForm.clean_name`; `change_username` catches `IntegrityError` → 409; Google sign-in refuses more than one match.
- [x] Tests: `DoorsTests`.

### Task 5: one company name

**Files:** Modify `core/views.py` (settings_view), `core/onboarding.py` (company step), `core/business_profile.py` (apply_profile).

- [x] Settings: a taken name → 400 `{'detail': TAKEN_COMPANY}` (also on a lost race); after a save `identity.sync_company_name(obj)`.
- [x] Wizard: a taken name → the Assistant's words, step asked again. `apply_profile`: a taken name is not written, the reply says it was kept; otherwise `sync_company_name`.
- [x] Tests: `CompanyNameTests`.

### Task 6: the gate, the notes, the gates

- [x] `scripts/e2e/flow.py`: at the sign-up page, a taken address and a taken company name are refused in the server's words (nothing is created).
- [x] `AGENTS.md`: the rule, the migration's report, "never pg_restore another environment's dump over live", the functional unique index on both databases.
- [x] `manage.py test`, the browser gate, `makemigrations --check`, secret scan; ONE local commit.

### Task 7: live — each step on the owner's word

- [ ] **Backup** both databases (`pg_dump -Fc`) + plain-SQL copies of the seven tables to `/root/backups/warmpulse-pre-uniqueness-20261127/`; `pg_restore --list` on each.
- [ ] **Delete ID 1** with `.superpowers/sdd/remove-duplicate-admin.py` (the audited steps, asserted, one transaction); verify `superadmin` signs in by e-mail (read-only checks only).
- [ ] **Deploy** (Django images only); the migration runs at start; verify read-only.

## As built (27 Nov 2026)

Tasks 1–6 are in and green; Task 7 waits for the owner's word, each live step on its own.

What differs from the plan above, and why:

- **Yesterday's shared-e-mail rule is gone** (`warmup_accounts.twin_of` / `shared_email`, the `shared_email` refusals in `roles.can_change` and `accounts.can_delete`, their 13 tests and the gate's twin look). Two accounts with one address cannot exist any more — the database refuses them — so the rule guarded nothing. Migration 0051 is its replacement.
- **Usernames are unique ignoring case** (the owner's default): `uniq_user_username_ci`. The field's own case-sensitive rule stays.
- **The migration does not stop on a typed name** (Settings → Your business) that equals another company's name. The demo seed types "Shailog Technologies" on the company "Demo", so every development database carries one; stopping there would have blocked every local bring-up. Instead the settings door looks at a name only when it CHANGES, so an old value blocks no other setting and renames nothing.
- **`WorkspaceQuerySet.update(name=…)` keeps the key in step**: the purge renames a workspace with `QuerySet.update`, and so do four test fixtures. A custom queryset (both managers) computes `name_key` there too.
- **The sign-up race is answered from what the database holds**: `identity.signup_lost_race(email, company)` returns the field and the words, or `None` — and `None` re-raises: an error that is not ours is never answered with a guess.
- **`bootstrap_admin` also refuses to make the default workspace onto another company's name** (it would have crashed on the unique name and taken the container down).
- **Google sign-in** refuses when more than one account matches; it still never makes an account.
- **Gates:** Django 1408, `makemigrations --check` clean, browser gate 186/186 (the twin look removed; three sign-up looks added after the hygiene snapshot).
- **A local-only knob for the gate:** `SIGNUP_THROTTLE_RATE` (default `5/hour`, never set in production). The gate submits the sign-up form twice a run and the rate lives in the server process, so a third run within the hour met a 429 — it did, on 27 Nov. The local Django command in AGENTS.md sets `1000/hour`; without it the gate SKIPs the three looks and says why.
- **The live deletion script is rehearsed**: `.superpowers/sdd/remove-duplicate-admin.py` (gitignored) ran against a database shaped like the audit — it removes exactly the audited account and moves the 12 messages; with any surprise it changes nothing; when the two no longer share the address it refuses. (Making that shape needed the new index dropped first: the database now refuses the duplicate that live carries.)
