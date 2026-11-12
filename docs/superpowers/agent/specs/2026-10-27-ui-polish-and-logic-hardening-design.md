# UI polish + logic hardening — design

Date: 2026-10-27 · Scope: local only (no Docker rebuild, no tunnel changes)

Decisions from the product owner: polish the existing brand (orange accent,
warm white canvas, dark sidebar); primary user is a non-technical client;
fix logic flaws and harden.

Inputs: Agency Agents audits (UX Architect, Code Reviewer, Frontend Developer)
plus direct verification of the highest-impact findings.

## 1. Information architecture

Sidebar (no numbering, live badge on Approvals):

| Nav | Contents |
|---|---|
| **Home** | Autopilot status hero (on/paused · last run · next run · "Find leads now"), 4 stat tiles (Leads · Good fits · Waiting for you · Emails sent), setup checklist until configured, top-3 approvals preview, newest leads |
| **Approvals** | ONE outreach queue (replaces the 3 copies in Dashboard / OutreachQueue / CrmBoard): bulk approve with progress, full-mail modal with edit, recipient required, "email not connected" banner, processed archive |
| **Leads** | Tabs: All leads (filters, sortable table → lead detail drawer) · Board (Found / Good fit / Emails) · Reports |
| **Activity** | Step strip Find → Research → Write → You approve with real counts, run button with live progress, last-run plain summary + raw log under "Details", run history |
| **Assistant** | Chat (wizard during setup; quick commands hidden during setup) |
| **Settings** | Left section list: Your business · Who to find · Email sending · Email templates · Schedule & reports · Account · Advanced (agent prompts/models, manual SMTP, Apollo key) — each section saves itself, dirty-state guard |

Client language: Search → "Find companies", Profile → "Research",
Copywright → "Write emails", Orchestrator → "Autopilot", Potential → "Good fit".
Removed: StatusStrip (Django/DRF/JSON panel), "Django" labels, MongoDB DB panel,
unused LeadsGeo. URL hash routing so refresh keeps the page.

## 2. Shared UI building blocks (zero new deps)

`components/ui.tsx` gains: Toast (event store + `<Toaster aria-live>`),
Modal and Drawer (role=dialog, Esc, focus in/out), EmptyState, Skeleton,
ConfirmDialog. A `WorkspaceStatus` context polls health + pipeline status +
outreach status (15 s; 3 s while a cycle runs) and feeds TopBar, Sidebar,
Home and Activity — no hardcoded "running" anywhere.

Styling stays in `styles.css` tokens; fixes: focus ring, ≥12 px text, 36 px
touch targets, chat sized to viewport, mobile queue/table layouts, help FAB
hidden on Assistant.

## 3. Backend fixes (each with a test)

Safety
1. `/api/auth/register/` only works when zero users exist (first-boot).
2. Never fabricate recipients: approve/send require a valid `to_email`
   (400 / per-item error); `send_draft` fails instead of guessing.
3. Atomic draft claim (`status DRAFT|FAILED → APPROVED` via conditional
   update) — no double sends.
4. Chat actions: destructive actions (approve all, approve/reject one, delete,
   pause/frequency, switch profile, report email, run) need explicit "yes";
   questions/negations never execute; ambiguous company match asks.
   Delete lead also rejects its pending drafts and blacklists the domain.
5. Secrets: redact AI key / mailbox password from stored chat history;
   mask AgentConfig `api.auth`; Apify token in header; unverified-TLS SMTP
   fallback only when DEBUG.
6. Onboarding wizard only for owner/admin while the workspace is
   unconfigured — teammates never overwrite company settings.

Pipeline correctness
7. Run lock (`AppSettings.pipeline_running_since`, stale after 45 min) —
   API, chat and worker can't overlap.
8. `POST /api/pipeline/run/` starts a background cycle → 202 (409 if busy);
   status exposes `cycleRunning`, `cycleStartedAt`, `autopilot`, `workerOnline`.
9. Worker: independent heartbeat thread; failure backoff (no 30 s hammering).
10. `PipelineRun.started_at` = real start time.
11. Paid enrichment only after the ICP + AI gates; enrichment attempts
    recorded and backed off; profile queue oldest-first.
12. AI gate requires explicit "RELEVANT: yes" (else hold).
13. Auto-Copywright never re-drafts a lead that already has a draft;
    DB-side filtering.
14. Contact email must be on the lead's own domain; generic page titles
    ("Home", "Welcome") never rename a lead; Maps name-match skipped when
    the listing has a different domain.
15. LLM: Anthropic + unknown providers never post the key to OpenAI; agent
    model used only if it fits the provider; env `AI_PROVIDER` absorbed with
    the key.
16. Migration 0015 hand-edit moved to new idempotent data migration.
17. Small: `{{company}}` subject fallback, `daily_report --day`, report value
    sort, `'hi'` keyword match, ICP override guard vs competitor patterns.

## 4. Frontend logic fixes

- Mock data only in dev/demo builds or when the backend was unreachable at
  probe; live-mode errors surface as toasts; 401 → back to login; production
  build shows "Can't reach your workspace — Retry" instead of fake data.
- Chat/guide never invent replies in live mode.
- Success shown only when the server confirms (`status === 'Sent'`);
  console deliveries labelled "Not delivered — email not connected".
- `toEmail` edits actually saved; failed drafts editable.
- Approve timeout 45 s; bulk approve runs per-draft with progress.
- Settings: load error disables save; per-section partial saves; no secrets in
  localStorage; logout clears `agentic-ai:*`.
- Agents (Advanced): save result checked, blocked until loaded.
- Leads: real `discoveredAt` for "newest", fixed "needs website" sort,
  `profiled` typed → "Not checked yet" instead of "No website".

## 5. Verification

Backend: `manage.py test` (new tests per fix) + `makemigrations --check`.
Frontend: `npm run build` (strict tsc) + browser walkthrough of every page on
the isolated local stack (Django :8765 on `db.uidev.sqlite3`, Vite :5173).
Final pass: UI Finish-Gate Reviewer + Code Reviewer personas.

## Out of scope

Role-based permissions beyond the wizard gate; inbound reply reading (Replies
column hidden while empty); production redeploy (owner's call).
