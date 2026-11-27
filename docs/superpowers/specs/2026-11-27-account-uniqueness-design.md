# Account uniqueness — one person, one e-mail; one company, one name

**Date:** 27 Nov 2026 · **Status:** approved by the owner ("ok") · **Author:** Devesh's assistant

## Why

On the live server two platform-admin accounts (`admin`, id 1, and `superadmin`, id 7) carry the
same e-mail address, `superadmin@warmpulse.tech`. The audit of 27 Nov 2026 (read-only; PostgreSQL
held every session read-only) found:

- `core_user.email` has **no uniqueness rule at all**; only the sign-up form checks it. Every other
  way of making an account — `create_platform_admin`, `create_workspace`, `createsuperuser`, the
  startup `bootstrap_admin`, the Django admin, a restored dump — accepts an address already in use.
- `admin` was not made by any code: it joined on 12 Oct 2026 (before the product went live on
  16 Nov) and owns Assistant messages from 26 Oct — it is the development database's superuser,
  which arrived with the 18 Nov full database import.
- `superadmin` was made by a script on 19 Nov 04:36 UTC (1.2 s after `shailog`, both marked
  e-mail-verified at creation — no form does that) with an address `admin` already carried.
- They do **not** share a login: different password hashes, different 2FA secrets. They share the
  address — and through it the warmup copy (`c825f384-…`, super admin, 0 mailboxes) and the
  e-mail sign-in fallback (which needs exactly one match, so it worked for neither).
- No other duplicates: 4 accounts, 3 companies, no duplicate usernames or company names, nothing
  soft-deleted. Accounts and companies have **no phone field** (only leads have).

## The owner's decisions (27 Nov 2026)

| Question | Decision |
|---|---|
| Company vs workspace | One company **is** one workspace, as today. The company name is unique across all companies, stopped ones included. No second workspace, no invites. |
| Phone | Skipped: accounts have no phone field. |
| Sign-up, company name taken | Blocked: **"Company already exists. Sign in instead."** |
| Live steps | Ask before each: one word for backup + deletion, a second word for the deploy. |
| Also (default, not objected to) | Usernames are unique ignoring case. Renaming the company in Settings renames the workspace too. |

## Rules

1. **E-mail** — one account per address, whatever its case or the spaces around it. An account
   with no address is not a clash. A soft-deleted account keeps its address reserved (30 days,
   then the purge frees it).
2. **Username** — unique ignoring case (`Admin` and `admin` are one username).
3. **Company name** — unique across all companies: trimmed, inner spaces collapsed, case-folded.
   A stopped or soft-deleted company keeps its name. One company, one name: the name typed in
   Settings is also the workspace's name (what the console, the sidebar and reports show).
4. **Enforced in two places** — every door asks `core.identity` first and answers in plain words;
   the database holds the same rules as unique indexes, so a door that forgets, a command, the
   Django admin or a restored dump is stopped by PostgreSQL itself.
5. **Never auto-resolve**: a migration that meets duplicates stops and lists them.
6. **Sign-in never breaks**: existing logins, Google sign-in and workspaces behave as before.
   Google sign-in still never creates an account; it refuses when more than one account matches
   (it used to take the first).
7. **Normalisation on write**: the app trims and lower-cases an e-mail on every save; the company
   name's key is computed on every save, including `QuerySet.update(name=…)`.

## Messages (plain words, shown by the server)

| Where | Words |
|---|---|
| Sign-up, e-mail taken (any door) | Email already registered. Sign in instead. |
| Sign-up, company name taken | Company already exists. Sign in instead. |
| Username taken (rename, commands, admin) | That username is already taken. |

No "is this e-mail free" endpoint is added: it would let people probe addresses. Sign-up stays
limited to 5 per hour per IP. Two simultaneous sign-ups with the same address end with one
account and the e-mail message for the other (the constraint error is caught and answered with
the same words).

## Design

### `core/identity.py` (new) — one way to write and compare

```python
TAKEN_EMAIL = 'Email already registered. Sign in instead.'
TAKEN_COMPANY = 'Company already exists. Sign in instead.'
TAKEN_USERNAME = 'That username is already taken.'

def normalize_email(value) -> str          # '  Ann@Acme.TEST ' → 'ann@acme.test'
def email_is_taken(email, excluding=None) -> bool     # every account, deleted ones included
def username_is_taken(username, excluding=None) -> bool
def company_key(name) -> str               # '  Acme   Rockets ' → 'acme rockets' (case-folded)
def company_name_is_taken(name, excluding=None) -> bool     # every company, stopped ones included
def sync_company_name(settings_row) -> bool   # the workspace row takes the typed name; False = it is empty or another company has it (nothing moves)
```

### Database — migration `core/0051_identity_uniqueness`

| Table | Rule |
|---|---|
| `core_user` | `uniq_user_email_ci`: unique on `LOWER(TRIM(email))` where `email <> ''` |
| `core_user` | `uniq_user_username_ci`: unique on `LOWER(username)` (the old case-sensitive one stays) |
| `core_workspace` | new column `name_key` (200, blank allowed); `uniq_workspace_name_key`: unique where `name_key <> ''` |

- The migration **reports first**: with two rows sharing a name or an address it stops and lists
  them (ids and values); it never changes a row to get past a clash. Live has none.
- `name_key` is computed by `Workspace.save()` and by `Workspace`'s queryset `update(name=…)`, so
  the key can never disagree with the name through any app write.
- `User.save()` normalises the e-mail. `Lower(Trim(...))` is a functional index on both PostgreSQL
  and SQLite (Django 4.2 creates `CREATE UNIQUE INDEX … WHERE …`), so the dev and test databases
  enforce the same rule as live.

### Doors (every way an account or a company name is made or changed)

| Door | Change |
|---|---|
| `POST /api/auth/signup/` | e-mail message from `identity`; company-name check; a lost race answers with the words for what is now taken |
| `PUT /api/settings/` (company name) | a taken name is a 400 with `detail` (shown as a toast); a lost race the same; a saved name renames the workspace |
| Setup wizard, company step | a taken name is refused in the Assistant's own words and the step is asked again |
| "Fetch" / profile apply (`core.business_profile.apply_profile`) | a taken name is not written: the current name stays and the reply says so |
| `manage.py create_platform_admin` | refuses a taken e-mail (as it already refused a taken username) |
| `manage.py create_workspace` | refuses a taken username (ignoring case), e-mail or company name |
| `manage.py bootstrap_admin` (startup) | never makes a second account: a taken username or e-mail → "already exists elsewhere — nothing to do" instead of a crash; no longer prints the API token into the log |
| `manage.py eval_assistant` | its throwaway workspace is named with the run's stamp, so a leftover of a killed run cannot clash |
| Django admin (`/admin/`, superusers only) | the user form and the workspace form refuse a taken e-mail / username / company name in the form itself |
| `POST /api/auth/change-username/` | a lost race answers 409 with the same words (it was an uncaught error) |
| Google sign-in (`core/google_auth.py`) | more than one matching account → refused, never "the first one" |

Not applicable (they do not exist in this product): invites, user import, e-mail edit, phone.

### One company name

`Workspace.name` is set at sign-up from the typed company and never changed since; Settings →
Your business writes `AppSettings.company_name`, which nothing kept in step. After this change
every door that writes the typed name also renames the workspace (`identity.sync_company_name`).
The migration itself renames nothing: on live the company `test` takes its typed name,
"International Journal of Research Nexus", the next time its name is saved through one of those
doors. Tooling that assigns `company_name` directly (the demo seed, the eval run) renames nothing.

## Task 1 — the duplicate on live (by hand, on the owner's word)

Order on live: **backup → delete ID 1 → deploy**. The deletion comes first because the unique
index could not be created while two rows share the address.

Backup (before anything): `pg_dump -Fc` of `agent` and `warmpulse_db` to
`/root/backups/warmpulse-pre-uniqueness-20261127/`, plus plain-SQL copies of `core_user`,
`core_chatmessage`, `authtoken_token`, `core_platformsession`, `core_impersonationticket`,
`billing_platformauditlog`, `core_workspace`; each checked with `pg_restore --list`.

Deletion — one transaction, by ID only (a Django shell script with the same steps and asserts):

```sql
BEGIN;
UPDATE core_chatmessage SET user_id = 7 WHERE user_id = 1;                  -- the 12 messages go to the kept account
DELETE FROM core_platformsession WHERE token_id IN (SELECT id FROM authtoken_token WHERE user_id = 1);   -- 0
DELETE FROM authtoken_token              WHERE user_id = 1;                 -- 0
DELETE FROM core_impersonationticket     WHERE admin_id = 1 OR target_id = 1;   -- 0
DELETE FROM core_user_user_permissions   WHERE user_id = 1;                 -- 0
DELETE FROM core_user_groups             WHERE user_id = 1;                 -- 0
DELETE FROM django_admin_log             WHERE user_id = 1;                 -- 0
DELETE FROM core_user WHERE id = 1 AND username = 'admin';                  -- exactly 1, else ROLLBACK
COMMIT;
```

Kept as is: every audit-log row (none mentions ID 1) and the shared warmup copy.
After it: `superadmin` can sign in with its e-mail address again.

## Tests (the owner's list, mapped to what exists)

- Duplicate e-mail in another case or with spaces — refused at sign-up in the same words; refused
  by the database when written directly; a direct save stores the normal form.
- Same company name — a new sign-up is blocked; a company re-typing its own name (any case) is
  allowed; a stopped company keeps its name.
- Google and password with the same e-mail — one account; Google never creates; more than one
  match is refused.
- Profile edit — a username rename to a taken name is refused, and so is a lost race.
- Two simultaneous sign-ups — one account; the other gets the e-mail words.
- Kept super admin signs in; the duplicate does not return — `bootstrap_admin` makes nothing when
  the username or e-mail is taken elsewhere, and never crashes.
- Each door: settings, wizard, profile apply, commands, Django admin forms.
- Not testable here (do not exist): phone formats, invites.

## Rollback

- **Deletion:** restore the ID 1 row from the SQL copy; point the 12 messages (ids 13–22, 27, 28)
  back to ID 1.
- **Migration and code:** `manage.py migrate core 0050` (drops the two indexes and `name_key`),
  then redeploy the previous images.

## Not in this work (reported, pending the owner's word)

- `bootstrap_admin` still prints a **generated** password to the container log when
  `ADMIN_PASSWORD` is empty (documented first-boot behaviour).
- A full `pg_restore` of another environment's dump over live (what brought `admin` here) — a
  rule for AGENTS.md, not code: restore per table, never the users table.
