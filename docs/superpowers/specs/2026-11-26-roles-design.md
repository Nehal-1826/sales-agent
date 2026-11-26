# Changing roles, and choosing "Super admin" — design

**Status:** approved by the owner on 2026-11-26 ("ok"), together with the
sibling design `2026-11-26-indian-format-design.md`. Built first.

## What the owner asked for

"I need role change option for users and I need select option for super
admin also."

## Today

- A role is `owner`, `admin` or `member` (`core/models.py` `User.Roles`).
  Nothing can change it: there is no endpoint, no command and no screen, on
  any branch. The only writer is "the first user of a workspace owns it".
- "Super admin" is not a role value. It is a state: an account with **no
  workspace**, `is_staff = True` and active (`core/authz.py is_platform_admin`).
  That rule is what the two login doors, the paywall exemption, and "platform
  admins cannot be entered or deleted" rest on. An account cannot be a super
  admin and belong to a company at the same time.
- The warmup service keeps its own copy of each person (`backend/app`), with
  the role `client` or `super_admin`. It reads the role **only when it creates
  the copy** (`api/deps.py _provision_bridge_user`) and its guards read the
  row, never the token. Nothing can change it afterwards.

## Decisions (the owner's)

- **Only super admins change roles**, from the console. (Asked: also company
  owners inside the workspace app? Answer: no.)
- The console says **"Super admin"**, the owner's word, where it said
  "Platform admin". Identifiers (`platform_admin`, `is_platform_admin`) stay.

## Where

Console → Users → an account's panel: a **Role** selector — Member · Admin ·
Owner · Super admin — and **Change role**, which asks for a reason.

When the account has no company and a company role is picked, the panel also
asks **which company** (a list of the running companies by name).

## The rules (enforced by the server, never only by the app)

`POST /api/platform/users/<id>/role` `{role, reason, workspace?}` — platform
admin, OTP-satisfied, reason required. `workspace` (a company id) is required
exactly when the account has **no company** and a company role is picked.

1. **Never your own account.** `400 cannot_change_role` "You cannot change
   your own role."
2. **Never a deleted account.** Restore it first.
3. **Never the same role it has.** `400 already_has_role`.
4. **A company always keeps an owner.** After the change the company must
   still have an owner who is active and not deleted — only owners can pay.
   So the only owner cannot be lowered to Admin or Member, and cannot be
   made a Super admin either. `400 last_owner` "{Name} is the only owner of
   {company}. Make someone else owner first."
5. **A company always keeps someone who runs it.** An Admin cannot be made a
   Member while the company has no owner at all (same message).

### Making someone a Super admin

- The account **leaves its company**: `workspace = NULL`, `is_staff = True`
  (`is_superuser` untouched — this does not give the Django admin site).
- It needs an **e-mail address** on the account (the warmup side matches
  people by e-mail). `400 no_email`.
- **Warmup first, then the account** — in this order:
  1. its warmup mailboxes are **paused** (the warmup admin tools cannot touch
     a super admin's mailboxes, and "pause all" skips non-clients — pausing
     after the change would be impossible);
  2. its warmup copy's role is set to `super_admin`;
  3. only then the account changes. If the warmup service cannot be reached,
     nothing changes (`502 warmup_unavailable`, "Nothing was changed. …").
  No warmup copy → steps 1 and 2 do nothing.
- Any open "Enter as user" session into this account ends.
- From then on the person signs in at the console address with the same
  password (two-factor as before: asked only if they have it). Their next
  click acts as a super admin; a still-open workspace tab sees "Platform
  operators use the admin console."

### Making a Super admin a company user

(Same for the rare account that has no company and is not a Super admin.)

- **A company is chosen**, and it must exist and be running.
- **Someone must remain to run the console:** when the account is a Super
  admin, at least one other super admin must stay.
  `400 last_super_admin` "At least one super admin must remain."
- **The plan's seat limit applies** (`400 seat_limit` "The {company} plan has
  no seat left.").
- The account joins the company with the picked role: `workspace`, `role`,
  `is_staff = False`, `is_superuser = False` (company users never keep the
  admin site — the rule of `split_tenants`).
- **Warmup first, then the account:** its warmup copy's role is set back to
  `client`, and the mailboxes that were paused when it was made a Super admin
  run again (the same nothing-changes rule if the service cannot be reached).

### Making someone an Admin or an Owner

- Nothing else changes for the company.
- **They are not sent into the setup wizard when the company is already set
  up** (it has a company name): their own onboarding is marked done. Today a
  newly privileged person is sent into it, and finishing it switches the
  whole company's autopilot on or off. A company that is not set up yet is
  left alone: they see the wizard like any owner, because somebody has to.

### Always

- Rows are changed with `QuerySet.update()`, never `user.save()` — `save()`
  re-attaches the active workspace to an account that has none
  (`core/models.py`), which would silently undo a promotion.
- Sessions follow the new role on the next request (the user is loaded per
  request); tokens are kept.
- Audit `platform.user.role` under the admin's name: the account, the role it
  had and the one it has, the company left or joined, the reason.
- The endpoint lives under `/api/platform/`, so it is closed inside "Enter as
  user" like every platform write.

## The warmup side

One new route, `POST /api/admin/users/{user_id}/role` `{role}` —
super-admin token only, refuses the caller's own copy, 404 for an unknown
one. The rule "signing in never flips an existing copy's role" stays as it
is (and its tests stay); only this route changes a role, and only Django calls
it (`core/warmup_accounts.set_role`, looked up by e-mail, every copy).

## The panel (plain words)

- The selector is disabled, with the reason, for: your own account ("You
  cannot change your own role."), a deleted account ("Restore this account
  first.").
- Picking **Super admin** for a company user says, before confirming:
  "This takes {name} out of {company}. They sign in at the console from now
  on with the same password, and their warmup mailboxes are paused."
- Picking a company role for a Super admin says: "This makes {name} a {role}
  of {company}. They sign in at the workspace from now on."
- Picking Admin or Owner for a Member says: "This makes {name} a {role} of
  {company}."
- After it worked: "Role changed to {role}." and the lists are read again.
- A refusal is shown in the server's words.

## Tests

- Server (`core/tests/test_roles.py`): every refusal above, each changing
  nothing; member → admin → owner (role set, onboarding marked done only when
  the company is set up); owner → admin with another owner, refused without;
  making a Super admin (leaves the company, `is_staff`, mailboxes paused
  BEFORE the role is mirrored and the account changed, open tickets ended,
  signs in at the admin door and is refused at the workspace door); making a
  Super admin a company user (company, role, `is_staff`/`is_superuser` off,
  seat limit, the last one refused); a warmup service that cannot be reached
  changes nothing; the audit row; only a platform admin may call it.
- Warmup (`backend/tests/test_admin_role.py`): the route sets the role,
  refuses the caller's own copy, 404 on an unknown id, super-admin only; the
  old "signing in never flips a role" tests still pass.
- Browser gate (console walk): on a throwaway company with two accounts, the
  member becomes Admin, then Owner, then Member again; the role shows in the
  table; a refusal (the only owner lowered) shows the server's words.

## Not included

Adding a person to an existing company — no way exists today (sign-up is
closed; a company starts with one owner). Offered to the owner as a third
piece; not ordered.
