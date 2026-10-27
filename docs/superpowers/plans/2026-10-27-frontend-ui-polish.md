# Frontend UI Polish + Logic Fixes Implementation Plan

> **For agentic workers:** tasks here are tightly coupled (shared `api.ts`, `styles.css`, `App.tsx`), so execute inline in order (superpowers:executing-plans), not as parallel subagents.

**Goal:** Client-friendly, honest UI on the existing Shailog brand (spec §1, §2, §4 of `docs/superpowers/specs/2026-10-27-ui-polish-and-logic-hardening-design.md`).

**Architecture:** Zero new dependencies. Hash routing in `App.tsx`; one `WorkspaceStatus` context polls the backend and feeds the shell; shared primitives in `components/ui.tsx`; one approvals implementation (`components/ApprovalQueue.tsx`) reused by Home (preview) and the Approvals page.

**Tech Stack:** React 18, TypeScript strict, Vite 6, hand-written `src/styles.css` tokens.

## Global Constraints

- `npm run build` (strict tsc + vite build) must pass after every task.
- Keep brand tokens: `--accent #f97316`, warm canvas `--bg #f4f3f0`, dark chrome sidebar. Fonts unchanged.
- Client vocabulary: Find companies · Research · Write emails · Autopilot · Good fit · Approvals. No "Django", "DRF", "MongoDB", "orchestrator", "Copywright" in client-facing copy (Advanced section may name agents).
- Mock data only when the backend is unreachable at the start-up probe AND the build is dev or `VITE_ALLOW_DEMO=1`; live-mode failures surface as errors, never as fake success/data.
- Secrets never written to localStorage; logout clears every `agentic-ai:*` key.
- Min text 12px; focus ring visible; dialogs have `role="dialog"`, Esc to close, focus management; touch targets ≥ 36px on mobile.
- Local only: dev servers via `.claude/launch.json` (Django :8765 on `db.uidev.sqlite3`, Vite :5173 with `API_PROXY_TARGET`).
- Backend contract from the backend plan: `POST /pipeline/run/` → 202/409; status fields `autopilot, cycleRunning, cycleStartedAt, workerOnline, lastRun.{leadsCreated,potentialsCreated,draftsCreated,finishedAt}`; drafts accept `toEmail`, approve → 400 without recipient / 409 when already claimed; chat POST returns `pendingAction`; Lead has `discoveredAt`; draft has `leadId`, `sentAt`; outreach status has `smtpConfigured`, `approved`.

## File map

| File | Responsibility |
|---|---|
| `src/lib/api.ts` | transport (`request` with typed `ApiError`, 401 → session-expired event), live/demo mode, every endpoint |
| `src/lib/types.ts` | wire types (+ `profiled`, `discoveredAt`, `leadId`, `sentAt`, pipeline status fields) |
| `src/lib/status.tsx` (new) | `WorkspaceStatusProvider` + `useWorkspaceStatus()` — health, pipeline, outreach; 15 s poll, 3 s while a cycle runs; `refresh()` |
| `src/lib/router.ts` (new) | `usePage()` hash router: `#/home`, `#/approvals`, `#/leads/:tab`, `#/activity`, `#/assistant`, `#/settings/:section` |
| `src/components/ui.tsx` | + `toast` store & `<Toaster>`, `Modal`, `Drawer`, `EmptyState`, `Skeleton`, `ConfirmButton`, `Banner` |
| `src/components/ApprovalQueue.tsx` (new) | the one outreach queue (bulk w/ progress, mail modal w/ edit, recipient guard, email-not-connected banner) |
| `src/components/LeadDrawer.tsx` (new) | lead detail drawer (about, findings, contacts, drafts, "Write an email") |
| `src/components/Sidebar.tsx`, `TopBar.tsx` | nav + live status from context |
| `src/pages/HomePage.tsx` (replaces `Dashboard.tsx`) | status hero, stat tiles, setup checklist, approvals preview, newest leads |
| `src/pages/ApprovalsPage.tsx` (new) | page wrapper for `ApprovalQueue` |
| `src/pages/LeadsPage.tsx` | tabs: All leads · Board · Reports |
| `src/pages/ActivityPage.tsx` (replaces `PipelinePage.tsx`) | steps strip, run button + progress, last run, history |
| `src/pages/ChatPage.tsx` | Assistant: setup progress bar, confirm buttons for `pendingAction`, no mock in live mode |
| `src/pages/SettingsPage.tsx` | section nav + per-section save + dirty guard; Advanced hosts `AgentsPage` |
| Deleted | `StatusStrip.tsx`, `LeadsGeo.tsx`, `OutreachQueue.tsx`, `CrmPage.tsx`, `Dashboard.tsx`, `PipelinePage.tsx`, `PipelineFlow.tsx` (superseded) |

## Tasks (each ends with `npm run build` green + browser check of the touched page)

1. **Transport + types + demo-mode contract** — `api.ts` `request()` throws `ApiError(status, detail)`; 401 dispatches `window` event `agentic:session-expired`; `isDemo()`; getters return mock only in demo mode; mutations return `{ok, data?, error?}`; approve/send timeout 45 s; `runPipeline()` handles 202/409; `sendChatMessage` returns error instead of mock in live mode; `logout()` calls `clearAll()`; types updated.
2. **UI primitives** — Toast/Toaster, Modal, Drawer, EmptyState, Skeleton, Banner, ConfirmButton in `ui.tsx` + CSS.
3. **Router + status context + shell** — `router.ts`, `status.tsx`, `App.tsx` (login, "can't reach workspace — Retry" screen, session-expired → login with toast), `Sidebar` (Home · Approvals[badge] · Leads · Activity · Assistant · Settings, honest status pill), `TopBar` (page title + Autopilot pill + Find-leads button state), GuideWidget hidden on Assistant + renamed "Help".
4. **ApprovalQueue + ApprovalsPage** — single implementation; recipient required (disabled Approve with inline "Add an email to send"), edit in modal incl. recipient, per-draft progress for bulk, success only on `status === 'Sent'`, console sends labelled "Not delivered — email isn't connected", banner + link to Settings → Email sending when `!smtpConfigured`.
5. **HomePage** — hero (Autopilot on/paused · last run · next run · Find leads now w/ live progress), 4 tiles, setup checklist (company, who to find, email connected, AI key, template) with deep links, approvals preview (3) → Approvals, newest 5 leads → drawer.
6. **Leads** — table with filters/sorts (fixed newest + needs-website), "Not checked yet" state, row → `LeadDrawer`; Board tab (Found / Good fit / Emails, Replies hidden when empty); Reports tab (existing report generator).
7. **Activity** — steps strip with real counts, run button + elapsed timer driven by `cycleRunning`, last-run plain summary + "Details" log, run history list.
8. **Assistant** — progress bar from `stepIndex/stepCount`, hint text, quick commands hidden during setup, Yes/No buttons when `pendingAction`, IME-safe Enter, `pre-wrap` bubbles, viewport-height layout, error bubble on failure, confirm before Clear.
9. **Settings** — left section nav (Your business · Who to find · Email sending · Email templates · Schedule & reports · Account · Advanced), per-section dirty state + Save/Discard bar, unsaved-changes guard (beforeunload + in-app nav), load error disables saving, provider list without Anthropic/Other, Advanced = manual SMTP, Apollo key, agent prompts/models (AgentsPage embedded; save result checked).
10. **CSS polish + responsive + a11y pass** — remove dead styles, ≥12 px text, focus ring, mobile layouts (queue cards, leads cards, topbar), reduced motion respected.
