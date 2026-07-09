# Handoff — WarmPulse macro arc resume

For the next developer (or future-you on a new machine). This is the synthesis of
a long Claude Code session. The raw chat transcript exists but is 84 MB and
contains live OAuth secrets pasted inline — see the bottom of this file before
copying it anywhere.

## TL;DR

- **Branch:** `claude/zen-brahmagupta-fc776a` (pushed; tracks remote of same name)
- **Latest commit:** `d5ef4a2` — *feat: Pro Plus tier UI, Agency dashboard variants, onboarding rework*
- **Open PR target:** https://github.com/devesh-666/Email-Warmup/pull/new/claude/zen-brahmagupta-fc776a
- **Where we left off:** Pro Plus tier is locked live across every workspace surface. Agency tier has 4 dashboard candidates ready to pick from — user needs to choose one, then it gets locked via the same pattern.

## Project context (one paragraph)

WarmPulse is a multi-tenant email-warmup SaaS. Clients connect outbound mailboxes
(Gmail OAuth / Outlook / Yahoo / generic SMTP); a system-owned peer-inbox network
sends, opens, replies, stars, and spam-rescues warmup mail to/from those mailboxes
to build sender reputation. The peer network is the moat — anywhere you see code
or comments treating peer inboxes as mockable, that's wrong. Authoritative
architecture spec lives at `warmpulse-architecture.html` (root) and
`docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md`.

`CLAUDE.md` at repo root is the canonical dev guide — read it first.

## The macro arc

The user-led workflow has been: **4 unique designs → user picks → lock the
picked one as live**. Pro Plus tier is complete; Agency tier is mid-way.

### Pro Plus tier (DONE — locked live)

Every surface is wired to live data via a `useProPlus*Data` adapter hook.
Missing-from-backend fields fall back to a `*_SKELETON` constant rather than
fabricating rows.

| Surface | Design file | Adapter hook |
|---|---|---|
| Dashboard | `pages/client/proplus/ProPlusDashN3Constellation.tsx` | `features/dashboard/useProPlusConsoleData.ts` |
| Workspace | `pages/client/proplus/ProPlusWks1OrgChart.tsx` | `features/workspace/useProPlusWorkspaceData.ts` |
| Billing | `pages/client/proplus/ProPlusBill1Receipt.tsx` | `features/billing/useProPlusReceiptData.ts` |
| Settings | `pages/client/proplus/ProPlusSet1Document.tsx` | `features/settings/useProPlusSettingsData.ts` |
| Reputation | `pages/client/proplus/ProPlusRep…SignalMap.tsx` | `features/reputation/useProPlusSignalMapData.ts` |
| Activity | `pages/client/proplus/ProPlus…Activity.tsx` | `features/activity/useProPlusActivityData.ts` |
| Mailboxes | `pages/client/proplus/ProPlus…Mailboxes.tsx` | `features/mailboxes/useProPlusMailboxesData.ts` |
| Tools (Lab) | `pages/client/proplus/ProPlusTool2Lab.tsx` | `features/tools/useProPlusLabData.ts` |
| Analytics | `pages/client/proplus/ProPlus…Benchmark.tsx` | `features/analytics/useProPlusBenchmarkData.ts` |
| Reports | `pages/client/proplus/ProPlus…Canvas.tsx` | `features/reports/useProPlusCanvasData.ts` |

The plan-branch happens in the page-level route — see `pages/client/DashboardPage.tsx`
for the pattern: `isProPlus ? <ProPlusConsole /> : <Default />`.

### Agency tier (IN PROGRESS)

Four dashboard candidates exist in the constellation aesthetic (same visual
language as Pro Plus). All four are wired into the design preview at
`http://localhost:35001` via `frontend/design-preview/preview.tsx`.

| Variant | File | Concept |
|---|---|---|
| **C1** | `pages/client/agency/AgDashC1Orbital.tsx` | Single-ring orbital, central AGENCY core, 9 sub-clients on one ring |
| **C2** | `pages/client/agency/AgDashC2Galaxy.tsx` | Two concentric rings — inner = top-4 by MRR, outer = long tail |
| **C3** | `pages/client/agency/AgDashC3Branches.tsx` | Tri-prong by health status (Healthy / Warming / At-risk) |
| **C4** | `pages/client/agency/AgDashC4Pulse.tsx` | Single ring with continuous per-node pulses + live activity ticker |

⚠️ **The user's last message hinted C4 may not render properly** ("AGENCY C4 ·
Pulse Map, not showing"). First task: open `:35001`, click C4, check console.
If broken, debug before asking the user to pick.

Old non-constellation variants (`AgDash1Portfolio`, `AgDash2Bridge`,
`AgDash3Manager`, `AgDash4Tenant`) are still on disk but unwired — safe to
delete once a C-variant is picked.

## The lock pattern (most important convention)

When the user picks a design variant, you lock it live in 4 steps:

1. **Design file** stays prop-less-by-default but accepts `data?: T` for live mode:
   ```tsx
   export interface AgencyDashData { /* ... */ }
   export const AGENCY_DASH_SKELETON: AgencyDashData = { /* honest empties */ };
   const MOCK: AgencyDashData = { /* demo content */ };

   export function AgDashC1Orbital({ data }: { data?: AgencyDashData }) {
     const d = data ?? MOCK;
     // ...
   }
   ```
2. **Adapter hook** maps live TanStack-Query data → design shape, with skeleton
   fallbacks for backend gaps (never fabricate rows):
   ```ts
   // features/dashboard/useAgencyDashboardData.ts
   export function useAgencyDashboardData() {
     const ws = useWorkspace();
     // ... map to AgencyDashData, fall back to AGENCY_DASH_SKELETON for gaps
     return { data, isLoading };
   }
   ```
3. **Live wrapper** in `pages/client/dashboards/AgencyDashboard.tsx`:
   ```tsx
   const { data, isLoading } = useAgencyDashboardData();
   if (isLoading) return <PageLoader />;
   return <AgDashC1Orbital data={data} />;
   ```
4. **Plan-branch** in `pages/client/DashboardPage.tsx`:
   ```tsx
   if (plan === 'agency') return <AgencyDashboard />;
   ```

See `useProPlusReceiptData.ts` + `ProPlusBilling.tsx` for the canonical
reference implementation.

## Conventions to follow

**Design tokens (Tailwind):** `bg-bg` / `bg-surface` / `bg-surface-2` /
`text-text` / `text-text-dim` / `text-faint` / `border-border-muted` /
`text-accent` / `text-accent2` / `text-accent3` / `text-accent4`. **No new
colors.** No emojis. lucide-react icons only.

**Code layout:**
- Routes (`backend/app/api/routes/`) are thin — ≤40 lines per handler. See
  `payments.py` for the bar. DB access lives in `services/`.
- All credential ops go through `services/crypto.FernetService` for
  encryption at rest (BYTEA columns).
- Every super_admin or destructive action writes `audit_logs` via the
  per-service `_write_audit` helper, wrapped in a SAVEPOINT
  (`session.begin_nested()`).
- Per-workspace isolation: every workspace-owned row carries `workspace_id`
  and every query filters on the JWT claim. Cross-workspace reads are a
  security bug.

**Frontend state:**
- Server state through TanStack Query only. Hand-rolled `useState +
  useEffect(fetch)` is a smell.
- Mutations use `useMutation` with `onSuccess: qc.invalidateQueries(...)`.
- Forms use `react-hook-form` + `zod`.

## Spinning up a dev env on a new machine

The repo follows the make-driven workflow in `CLAUDE.md`. Quick version:

```bash
# one-time
make install                     # pip install -e ".[dev]" + pnpm install
make db-up                       # postgres + redis docker containers
make migrate                     # alembic upgrade head

# day-to-day (7 terminals — no orchestration in dev so prod matches)
make backend                     # uvicorn :8001 --reload
make frontend                    # vite :5173
make worker                      # celery -Q default,smtp
make beat                        # celery beat
# (plus postgres/redis docker, already up from `make db-up`)

# design-preview workspace (the :35001 picker)
cd frontend && pnpm preview:design
```

### Secrets you need to set up (NOT in this repo)

`backend/.env` is `.gitignore`-d (correctly). On a new machine you need:

```ini
DATABASE_URL=postgresql+psycopg://...
REDIS_URL=redis://localhost:6380
REDIS_KEY_PREFIX=warmpulse:

# generate fresh with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FERNET_KEY=<base64>

# generate fresh with: python -c "import secrets; print(secrets.token_urlsafe(64))"
JWT_SECRET=<random>

# Google Cloud Console → OAuth client (Web application)
#   Authorized redirect URIs (dev):
#     http://localhost:8001/api/auth/google/callback
#     http://localhost:8001/api/auth/google/mailbox-callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8001/api/auth/google/callback
GOOGLE_MAILBOX_REDIRECT_URI=http://localhost:8001/api/auth/google/mailbox-callback

# Firebase Console → Project settings → Project ID (used for ID-token verification)
FIREBASE_PROJECT_ID=...

# Microsoft Entra → App registration
#   Authorized redirect URIs (dev):
#     http://localhost:8001/api/auth/microsoft/mailbox-callback
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_MAILBOX_REDIRECT_URI=http://localhost:8001/api/auth/microsoft/mailbox-callback

# LLM (one of — provider priority Gemini → Claude → static templates)
GEMINI_API_KEY=...
# ANTHROPIC_API_KEY=...

# Transactional mail (leave HOST empty for dry-run mode — logs at INFO, returns success)
# TRANSACTIONAL_SMTP_HOST=...
# TRANSACTIONAL_SMTP_USERNAME=...
# TRANSACTIONAL_SMTP_PASSWORD=...
```

See `backend/.env.example` for the shape.

⚠️ **Note on FERNET_KEY rotation:** the previous developer rotated the FERNET_KEY,
which means any pre-existing encrypted mailbox credentials in the production DB
(SMTP passwords, OAuth refresh tokens) are now undecryptable. On a fresh dev
machine starting from a clean DB this doesn't matter — you'll just connect new
mailboxes. On a machine restoring a prod DB snapshot, the old FERNET_KEY is needed.

### Seed test users

```bash
cd backend && python _seed_users.py
```

Creates 4 plan-specific clients + 1 admin (all `onboarding_status=active` so
they go straight to `/app`):

| Email | Plan | Password |
|---|---|---|
| `starter@warmpulse.dev` | Starter | `Test@12345` |
| `pro@warmpulse.dev` | Pro | `Test@12345` |
| `proplus@warmpulse.dev` | Pro Plus | `Test@12345` |
| `agency@warmpulse.dev` | Agency | `Test@12345` |
| `admin@warmpulse.app` | super_admin | `Admin@12345` |

⚠️ These are dev-only passwords. Don't reuse them anywhere real.

## Gotchas (the ones that wasted real time)

**Windows asyncio policy.** `backend/app/main.py` sets
`WindowsSelectorEventLoopPolicy()` at module top because `psycopg` async refuses
to run on Windows' default ProactorEventLoop. This only works if uvicorn is run
with `--reload` (the reloader spawns a worker subprocess where the module-top
code runs first). Without `--reload` you get `Psycopg cannot use the
'ProactorEventLoop'` on startup.

**Vite optimizer cache.** When Pro Plus surfaces loaded fine but Pro / Starter
showed `Cannot read properties of null (reading 'useRef')` or stale chunks —
the Vite optimizer cache went stale. Fix:
```bash
# kill all node, then
rm -rf frontend/node_modules/.vite
cd frontend && pnpm dev --force
```

**Lazy-importing firebase/auth triggers a 504 cycle.** We tried it for login
latency; every first dynamic import invalidated chunks. Reverted to static
imports in `frontend/src/lib/googleAuth.ts`. Other latency wins (cert pre-warm
in `backend/app/main.py` lifespan, skip `getRedirectResult` on cold mount,
`popup-success` direct path) are kept.

**COOP / cross-origin postMessage.** The OAuth popup sits at `:8001` and the
opener is at `:5173` — different origins. `localStorage` cannot bridge them.
The popup HTML in `backend/app/api/routes/google_oauth.py` and
`microsoft_oauth.py` uses three delivery channels: postMessage with
`target_origin`, postMessage with `*`, and a 600 ms linger before
`window.close()`.

**OAuth popup timeout.** Google's "unverified app" warning page slows the
human dance — the 60 s timeout was tripping. Bumped to 300 s + friendly
`mapOauthError(code, label)` messages. See
`frontend/src/pages/onboarding/OnboardingDashboard.tsx` → `OauthConnectCard`.

**Re-onboarding loop after logout.** A user can create a mailbox during the
trial-allowance (status=`signed_up`, before paying). `mailbox_service` only
transitions to `active` when status was `plan_selected`. Then payment was
setting `plan_selected` with no future event to flip to `active`. Fixed by
`backend/app/services/payments_service._transition_after_payment`: if a
mailbox already exists, jump straight to `active`.

## Pending tasks

**#30 — Lock winning Agency dashboard design as live.** Once the user picks
C1/C2/C3/C4:
1. Build `frontend/src/features/dashboard/useAgencyDashboardData.ts` adapter
2. Replace `frontend/src/pages/client/dashboards/AgencyDashboard.tsx` to
   render the picked design wrapped with the hook
3. Confirm the plan-branch in `frontend/src/pages/client/DashboardPage.tsx`
   routes `agency` → `<AgencyDashboard />`
4. Run `cd frontend && pnpm typecheck` — must be clean
5. Delete the 3 losing C-variant files + the 4 old non-constellation variants

**Possible C4 render issue.** Verify all 4 candidates render before asking
the user to pick (see Agency tier section above).

## Tier-by-tier surface checklist

For reference — what's been touched on each tier. ✅ = wired to live data, ⚠️ =
design exists but not yet locked, ➖ = uses default Pro/Starter surface.

| Surface | Starter | Pro | Pro Plus | Agency |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ⚠️ pick C1/C2/C3/C4 |
| Workspace | ✅ | ✅ | ✅ | ➖ |
| Billing | ✅ | ✅ | ✅ | ➖ |
| Settings | ✅ | ✅ | ✅ | ➖ |
| Reputation | ✅ | ✅ | ✅ | ➖ |
| Activity | ✅ | ✅ | ✅ | ➖ |
| Mailboxes | ✅ | ✅ | ✅ | ➖ |
| Tools | ✅ | ✅ | ✅ | ➖ |
| Analytics | ✅ | ✅ | ✅ | ➖ |
| Reports | ✅ | ✅ | ✅ | ➖ |

(Agency tier is at the start of the same arc Pro Plus just finished. After the
Dashboard lock, the user-led pattern is "4 designs → pick" for each remaining
surface.)

## Raw chat transcript

If you want every back-and-forth verbatim, the JSONL is here:

```
C:\Users\Devesh B\.claude\projects\C--Users-Devesh-B-OneDrive-Documents-Sahilog-Email-Warmup--claude-worktrees-zen-brahmagupta-fc776a\26d3a7e9-8493-47fe-aaeb-193a941c4af1.jsonl
```

84 MB. Contains every tool call, every file read, every decision.

⚠️ **DO NOT share this file as-is.** It contains the user's live OAuth secrets
pasted inline during the session (Google Client Secret, Microsoft Client Secret,
Firebase Project ID, FERNET_KEY, JWT_SECRET). If you need to hand it to another
developer, scrub the secrets first, or just have them read this HANDOFF.md
plus the architecture spec.

## Files worth reading first (in order)

1. **`CLAUDE.md`** — canonical project guide
2. **This file** — current state + lock pattern
3. **`warmpulse-architecture.html`** — authoritative architecture
4. **`docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md`** — same in MD
5. **`frontend/src/features/workspace/useProPlusWorkspaceData.ts`** — reference adapter pattern
6. **`frontend/src/pages/client/proplus/ProPlusWks1OrgChart.tsx`** — reference design file
7. **`frontend/design-preview/preview.tsx`** — the 4-design picker
