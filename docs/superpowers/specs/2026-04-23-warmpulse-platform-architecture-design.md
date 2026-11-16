# WarmPulse Platform — Architecture Design

**Date:** 2026-04-23
**Status:** Architecture-only overview spec. Implementation plans are deferred to per-phase specs.
**Source material:** `warmpulse-architecture.html` (tabbed spec) + `CLAUDE.md` + brainstorming session 2026-04-23.

---

## 1. Purpose & Non-Goals

This document locks in **cross-cutting architectural decisions** for the WarmPulse email warmup SaaS so that subsequent per-phase specs (landing, auth, dashboard, warmup engine, analytics, admin) can be written and executed without re-litigating the same questions.

**This doc answers:**
- What roles exist and what each can do
- How the app is laid out (routes, sidebars, information architecture)
- What the signup + onboarding flow looks like
- How Z.ai is integrated
- How the peer inbox network is modelled (pools + routing)
- What new tables extend the HTML spec's data model
- What the UI system and chart strategy are
- What the backend service topology looks like on the shared VPS
- What's explicitly out of scope

**This doc does not include:**
- Per-screen wireframes or layout mockups (Phase 1 spec)
- Per-endpoint API contracts (per-phase specs)
- Celery task signatures or ramp-algorithm pseudocode (Phase 3 spec)
- Graph-by-graph chart specifications (Phase 4 spec)
- Implementation plans — those come after per-phase brainstorming

**No code will be written from this doc.** It is the architectural contract the phase specs must honour.

---

## 2. Phased Roadmap

The platform is decomposed into **6 phases**. Each phase is independently demoable and gets its own brainstorm → spec → implementation plan cycle.

| # | Phase | Deliverable |
|---|---|---|
| 1 | Landing + Auth + Onboarding wizard | Public marketing page, signup/login, plan picker (dummy payment), mandatory onboarding wizard that collects first mailbox credentials |
| 2 | Client dashboard shell + Mailbox CRUD + DNS validator | Authenticated shell (sidebar, topbar, theme), mailbox add/remove, SPF/DKIM/DMARC live check |
| 3 | Warmup engine core + Peer pools + Pool routing | Celery workers, ramp algorithm, SMTP send + IMAP listen, admin peer-pool CRUD, client↔pool assignment |
| 4 | Analytics + graph infrastructure (both roles) | Daily metrics pipeline, Recharts/ApexCharts harness, every sidebar section gets its charts |
| 5 | Z.ai content generation + Template Designer + Tools | Z.ai integration for warmup content (modes A/B/C/D), template designer, placement tester, spam-trigger scanner, warmup preview |
| 6 | Admin polish + Reports + Payments + Deploy | Z.ai usage tracking, system health, audit log, payments recording, PDF/CSV reports, peer auto-rotation, Hostinger VPS deploy, beta launch |

---

## 3. Roles & Authorization

### 3.1 Global roles (two-tier)

| Role | Who | Scope |
|---|---|---|
| `super_admin` | Platform operator (you) | Full read/write across all tenants, plans, peer pools, system config |
| `client` | Paying end-user (or free-trial) | Read/write scoped to own workspace only |

No intermediate roles. The Agency plan grants a client *workspace-level* sub-client management — this is a plan capability, not a global role.

### 3.2 Workspace-level capabilities (client side)

Inside a client's workspace, capability flags are plan-gated:

- `can_invite_team_members` — Pro + Agency
- `can_create_sub_clients` — Agency only
- `can_issue_api_keys` — Agency only
- `can_export_whitelabel_reports` — Agency only

### 3.3 Auth model

- **JWT bearer tokens** with claims: `sub` (user_id), `role` (`super_admin` | `client`), `workspace_id`, `plan`, `exp`.
- **Access token:** 15 min. **Refresh token:** 7 days, rotated on use, stored httpOnly cookie.
- **Google OAuth** for mailbox-connect only (reuses SashaLMS OAuth client per CLAUDE.md).
- **2FA (TOTP)** opt-in per user — enforced for `super_admin` by default.

### 3.4 Route protection

- All `/api/admin/*` endpoints require `role == super_admin`.
- All `/api/workspace/*` endpoints scope queries by `workspace_id` from JWT.
- Frontend: two root layouts — `<AdminLayout>` and `<ClientLayout>` — router guard redirects wrong-role users.

---

## 4. Signup & Onboarding Flow (Option B + i)

**Principle:** frictionless signup, gated dashboard. Users can create an account without a plan, but cannot reach the dashboard until plan + at least one mailbox is configured.

```
Landing page
  │
  ▼
Signup (email + password)       ← creates user, onboarding_status = signed_up
  │
  ▼
"Choose a plan" screen          ← gated: dashboard hidden until plan selected
  │
  ▼
Dummy payment form              ← collects fake card details, persists payment record
  │                                onboarding_status = plan_selected
  ▼
Onboarding wizard (multi-step)
  Step 1: Daily mail volume target (5 / 10 / 20 / 50 / 100)
  Step 2: Provider (Gmail OAuth | Outlook OAuth | Yahoo | Generic SMTP/IMAP)
  Step 3: Credentials
    - If OAuth: redirect + callback, store encrypted token
    - If SMTP/IMAP: host, port, username, password (Fernet-encrypted)
  Step 4: DNS validator runs (SPF/DKIM/DMARC), shows fix instructions if red
  Step 5: Z.ai content mode selection (A | B | C | D — see §6.2)
  Step 6: Confirm → onboarding_status = active
  │
  ▼
Dashboard (unlocked)
  │
  └─ Additional mailboxes added later from Mailboxes section
```

**Onboarding state machine** (`users.onboarding_status`):

`signed_up` → `plan_selected` → `mailbox_pending` → `active`

A middleware redirects users to the correct wizard step based on state until `active`.

### 4.1 Credential handling at signup

- SMTP/IMAP passwords travel over **TLS** (Nginx-terminated) and reach the FastAPI process as plaintext in the request body. They are immediately Fernet-encrypted before persistence and the plaintext is discarded from memory at the end of the request. **No client-side envelope encryption for MVP** — TLS-in-transit + Fernet-at-rest is the security bar.
- Columns: `mailboxes.smtp_password_encrypted BYTEA`, `mailboxes.oauth_token_encrypted BYTEA`, both Fernet. Fernet key lives in server env (`FERNET_KEY`), rotated via `cryptography`'s MultiFernet if needed.
- **Never log raw credentials.** Celery task payloads pass `mailbox_id` only; workers fetch + decrypt inline at the moment of use.

---

## 5. Sidebar Information Architecture

### 5.1 Client sidebar (10 items)

| # | Item | Contains | Primary chart(s) |
|---|---|---|---|
| 1 | Dashboard | Warmth Score hero, live activity, today's stats, alerts | **Area chart** (warmth 30d), **donut** (placement split), **sparkline row** (per-mailbox 7d) |
| 2 | Mailboxes | List + add. Drill-in: warmup config, ramp curve, pause/resume, DNS status, thread viewer | **Bar chart** (volume by mailbox), **mini line** (7d trend per card) |
| 3 | Warmup Activity | Live feed, filter by mailbox | **Stacked bar** (action types per hour), **timeline chart** |
| 4 | Analytics | Daily metrics, warmth, placement %, bounce/spam, engagement | **Full zoo:** line, stacked area, grouped bar, donut, radar, scatter, heatmap |
| 5 | Reputation & Health | Postmaster + SNDS, blacklist, DNS, per-domain scores | **Radar** (multi-dimensional score), **gauge** (warmth), **line** (reputation trend) |
| 6 | Tools | Sub-nav: Placement Tester · Spam Scanner · Template Designer · Warmup Preview | **Stacked horizontal bar** (placement split), **gauge** (spam score), **carousel + mini-line** (preview) |
| 7 | Reports | PDF/CSV exports, weekly digest settings, white-label (Agency) | **Bar** (reports generated), **line** (recipient engagement) |
| 8 | Workspace | Sub-nav: Team · Sub-Clients (Agency) · API Keys (Agency) | **Donut** (seat usage), **bar** (API calls per key) |
| 9 | Billing | Plan, payment history, upgrade/downgrade, invoices (all dummy) | **Line** (monthly spend), **stacked bar** (by feature) |
| 10 | Settings | Profile, notifications, 2FA, timezone, activity log, tour replay | **Sparkline** (login frequency), **donut** (notification channel mix) |

### 5.2 Admin sidebar (11 items)

| # | Item | Contains | Primary chart(s) |
|---|---|---|---|
| 1 | Dashboard | Platform KPIs, MRR (dummy), user growth, peer pool health, queue depth | **Combo** (MRR + user count), **area** (total sends), **donut** (plan dist.), **sparkline row** (pool capacity) |
| 2 | Users | List all clients, impersonate, suspend, view mailboxes + activity | **Histogram** (warmth scores), **line** (signup rate), table with **inline sparklines** |
| 3 | Peer Inboxes | Pool CRUD, add/remove accounts, health, auto-rotation | **Scatter** (capacity vs reputation), **stacked bar** (provider dist.), **line** (rotation events) |
| 4 | Pool Routing | Assign pools → clients | **Sankey** (pools ↔ clients), **heatmap** (pool utilization) |
| 5 | Platform Analytics | Aggregate send volume, placement, spam, warmth distribution | **Radar**, **grouped bar**, **stacked line**, **treemap** (throughput by client) |
| 6 | Z.ai Usage | Tokens per client, per-plan caps, cost forecast, content mode dist. | **Area** (spend over time), **pie** (cost by client), **bar** (tokens by mode A/B/C/D) |
| 7 | Plans & Pricing | Edit tiers, prices (dummy) | **Bar** (conversions per plan), **line** (churn per plan) |
| 8 | System Health | Celery queue, Redis, worker status, SMTP/IMAP delivery, errors | **Gauges** (CPU/mem/queue), **line** (delivery rate), **bar** (error count) |
| 9 | Audit Log | Platform-wide — admin actions + auth/credential events | **Timeline**, **bar** (events per action type) |
| 10 | **Payments** | **Transaction records of dummy payments by clients, status pills, export** | **Line** (revenue over time), **stacked bar** (by plan), table with **status pills** |
| 11 | Settings | Global: OAuth client IDs, Z.ai key, default ramps, email defaults | Status indicators + **recent-changes timeline** |

### 5.3 Chart coverage rule

**Every sidebar section on both sides has at least one chart. Across the entire app, at least 14 distinct chart types are used** so the experience doesn't feel repetitive:

Line · Area · Stacked Area · Bar · Grouped Bar · Stacked Bar · Horizontal Bar · Donut/Pie · Radar · Scatter · Heatmap · Sparkline · Gauge · Treemap · Sankey · Timeline · Histogram · Combo

Recharts handles most. **ApexCharts** is added for Sankey, Heatmap, Treemap, Gauge (Recharts doesn't support these well). Lazy-load ApexCharts only on pages that need it.

---

## 6. Z.ai Integration

### 6.1 Where Z.ai is used

- **Warmup email content generation** (primary use — replaces Claude API from HTML spec)
- **Email template designer** (mode D — assisted HTML template editing)

Z.ai is **not** used for: UI microcopy generation at runtime, in-product AI chat assistants (deferred, not in MVP), or code/component generation. If you want to add these later, they become new phase specs.

### 6.2 Warmup content modes (client chooses at onboarding; overridable per-mailbox)

| Mode | Content style | When to pick it |
|---|---|---|
| **A. Plain conversational** | Short person-to-person threads, no styling, varied signatures. Matches the HTML spec's original intent. | Client's real outreach is plain text (cold email / sales outreach). **Default recommendation.** |
| **B. Styled HTML templates** | Rich HTML with headers, colored cards, badges (like the Editorial Certificate example). | Client's real outreach is highly designed (newsletters, branded transactional). Flagged with a warning at selection: "may reduce warmup effectiveness unless your real mail is also styled." |
| **C. Dual-mode auto** | System mixes A + B based on client's declared real-sending pattern. | Client sends both types. More work but most accurate signal. |
| **D. Plain warmup + separate Template Designer** | Warmup traffic is plain (A). Client gets a separate Z.ai-assisted template designer to build branded HTML for their own outside-warmup use. | Client wants warmup done right **and** a template tool as a bonus feature. |

Mode stored on `mailboxes.zai_content_mode` enum; default set at onboarding, editable per mailbox later.

### 6.3 Z.ai provider abstraction

- A thin `LLMProvider` interface lives in `backend/app/services/llm/`.
- Default implementation: `ZaiProvider`.
- Fallback implementation (not wired by default): `ClaudeProvider` — kept as a swap-target if Z.ai has downtime or rate issues.
- All Z.ai calls go through a dedicated Celery queue (`warmpulse-zai-worker`) so SMTP send latency is isolated from LLM latency.
- Every call writes a row to `zai_usage` (prompt tokens, completion tokens, cost, client_id, mailbox_id, mode).

### 6.4 Cost controls

- Per-plan **token caps** are editable in Admin → Plans. Initial placeholder values pending Z.ai pricing confirmation (see §13 Open Question #1):
  - Starter: ~30,000 tokens/month
  - Pro: ~150,000 tokens/month
  - Agency: ~500,000 tokens/month
- Soft-cap at 80% → email warning. Hard-cap at 100% → fall back to static templates until next cycle.
- Admin → Z.ai Usage dashboard shows real-time spend and projections.

---

## 7. Peer Inbox Network — Pools + Routing (Option D)

### 7.1 Model

```
peer_inboxes (existing per HTML spec)
   │ many-to-many
   ▼
peer_pools           ← NEW. Named pools ("default", "us-based", "o365-heavy")
   │ many-to-many
   ▼
client_pool_assignments  ← NEW. Maps workspace_id → pool_id
```

A peer inbox can belong to multiple pools. A client is assigned to exactly one pool at a time (enforced unique constraint on `client_pool_assignments.workspace_id`).

### 7.2 Default pool behaviour

- A system-maintained `default` pool exists and auto-includes all `is_active=true` peer inboxes.
- New clients are auto-assigned to `default` at onboarding.
- Admin can move them to a named pool from **Admin → Pool Routing**.

### 7.3 Auto-rotation (feature 12)

- Celery Beat job runs hourly: for each pool, flag peer inboxes whose `reputation_score` dropped below threshold in the last 24h.
- Flagged inboxes get `is_active=false` automatically, removing them from the pool.
- Admin receives a notification and can review/restore.

---

## 8. Data Model Additions (Beyond HTML Spec)

The HTML spec's five tables (`users`, `mailboxes`, `peer_inboxes`, `warmup_logs`, `daily_metrics`) remain as-is. The following tables and columns are **added**:

### 8.1 New columns on existing tables

- `users.role` — ENUM(`super_admin`, `client`), default `client`
- `users.onboarding_status` — ENUM(`signed_up`, `plan_selected`, `mailbox_pending`, `active`)
- `users.workspace_id` — UUID (self for individual users, shared for team/sub-client setups)
- `users.totp_secret_encrypted` — BYTEA, nullable
- `mailboxes.zai_content_mode` — ENUM(`A`, `B`, `C`, `D`)
- `mailboxes.schedule_window_id` — UUID FK, nullable (feature 4)
- `mailboxes.is_paused` — BOOL (feature 3)

### 8.2 New tables

| Table | Purpose | Key columns |
|---|---|---|
| `plans` | Admin-editable plan tiers (replaces the hardcoded ENUM in HTML spec for flexibility) | id, name, price_cents, max_mailboxes, daily_email_cap, token_cap_per_month, capabilities JSON |
| `payments` | Dummy payment transaction log (Admin → Payments, Client → Billing) | id, user_id, plan_id, amount_cents, status ENUM(pending/succeeded/failed/refunded), dummy_card_last4, created_at |
| `peer_pools` | Named peer inbox pools | id, name, description, is_default, created_at |
| `peer_pool_members` | M2M between peer_inboxes and pools | peer_inbox_id, pool_id |
| `client_pool_assignments` | Which pool a workspace uses | workspace_id UNIQUE, pool_id, assigned_at |
| `team_members` | Seat invites (feature 7) | id, workspace_id, invited_email, role_in_workspace, accepted_at |
| `sub_clients` | Agency sub-client workspaces (feature: Agency plan) | id, parent_workspace_id, name, contact_email |
| `audit_logs` | Platform-wide audit trail (feature 9) | id, actor_user_id, actor_role, action, target_type, target_id, payload JSON, ip, created_at |
| `api_keys` | Agency API access (feature: Agency plan) | id, workspace_id, key_hash, prefix, name, last_used_at, revoked_at |
| `placement_tests` | On-demand inbox placement runs (feature 1) | id, mailbox_id, seed_set, sent_at, results JSON (inbox/promotions/spam/blocked counts per provider) |
| `spam_scans` | Subject+body spam-trigger scan runs (feature 2) | id, user_id, content_snippet, score, triggers JSON, created_at |
| `schedule_windows` | Warmup time-window configs (feature 4) | id, workspace_id, name, tz, weekday_mask, start_hour, end_hour |
| `scheduled_reports` | Weekly digest / scheduled PDF configs (feature 6, 8) | id, workspace_id, type, frequency, recipients, last_sent_at |
| `notification_settings` | Per-user notification channels (Slack/webhook/email) | id, user_id, channel ENUM, target, event_types JSON |
| `email_templates` | Z.ai-assisted designer outputs (mode D) | id, workspace_id, name, html, thumbnail, created_with_zai BOOL |
| `zai_usage` | Per-call Z.ai cost log | id, user_id, mailbox_id, mode, prompt_tokens, completion_tokens, cost_cents, created_at |
| `warmup_threads` | Grouping of warmup_logs into conversations (feature 5) | id, mailbox_id, peer_inbox_id, subject, started_at, last_action_at |

### 8.3 Index additions beyond HTML spec

- `audit_logs(actor_user_id, created_at DESC)` composite
- `zai_usage(user_id, created_at DESC)` composite
- `payments(user_id, created_at DESC)` composite
- `peer_pool_members(pool_id)` partial index for active lookups
- `warmup_threads(mailbox_id, last_action_at DESC)` composite

---

## 9. Tech Stack (Amendments to HTML Spec)

The HTML spec's stack is preserved. Amendments:

| Layer | HTML spec | Amended | Reason |
|---|---|---|---|
| AI content | Claude API | **Z.ai (primary), Claude (fallback-only)** | User request |
| Smooth scroll | — | **Lenis** | User requirement (scroll animation) |
| Scrollbar hiding | — | `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` | User requirement |
| Landing animations | — | **Framer Motion + GSAP ScrollTrigger** | Hero + feature-reveal scroll effects |
| Charts | Recharts | **Recharts (primary) + ApexCharts (exotic types)** | Sankey/heatmap/treemap/gauge need |
| Payments | — | **Dummy payment module** (mock API + persisted records) | User request, no real gateway |
| Component primitives | — | **Radix UI + Tailwind** | Ship faster with accessible primitives |
| Queue separation | Single Celery | **Three queues: default, smtp, zai** | Isolate LLM latency from SMTP latency |

All other stack elements (FastAPI, Pydantic v2, SQLAlchemy, Celery + Beat, Redis, PostgreSQL 16, aiosmtplib, aioimaplib, Fernet, JWT + Google OAuth, dnspython, checkdmarc, React + Vite + Zustand + TailwindCSS) remain per HTML spec.

---

## 10. UI System

### 10.1 Theme

- Dark-first. Color tokens match the HTML spec (`--bg #0a0a0f`, `--surface #12121a`, `--accent #00e5a0`, `--accent2 #00c4ff`, `--accent3 #ff6b4a`, `--accent4 #ffd54f`, `--text #e8e8f0`, `--text-dim #8888a0`).
- Light mode deferred to post-MVP unless requested.

### 10.2 Landing page

- Full-viewport hero with animated gradient + headline + CTA ("Start warming now — 7-day dummy trial").
- Feature-reveal sections triggered on scroll (Framer Motion + scroll-linked progress).
- 4 feature blocks: "Peer inbox network", "Adaptive ramp", "AI-generated threads", "Real-time warmth score".
- Social proof / testimonials placeholder (hidden if empty — no mock testimonials shipped).
- Pricing section (reads from `plans` table, same source admin edits).
- FAQ accordion.
- Footer with legal, contact, status link.

### 10.3 Scroll + scrollbar rules (applies globally)

- **Lenis** wraps `<body>` for inertia scroll.
- Native scrollbars **always hidden** (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`).
- A custom scroll-progress indicator (thin gradient bar, top of viewport) replaces the native scrollbar as a visual cue.
- Section-entry animations use Framer Motion's `whileInView` with `viewport={{ once: true, amount: 0.3 }}` to fire once per page load.

### 10.4 Dashboard shell (authenticated)

- Fixed left sidebar (collapsible to icon-only below 1280px, hamburger drawer below 1024px).
- Top bar: workspace switcher (Agency), notifications bell, user menu, dark/light toggle (post-MVP).
- Main content area uses a 12-col grid with `max-width: 1440px`.
- All scrollable internal containers follow the hidden-scrollbar rule.

### 10.5 Component strategy

- Build on **Radix UI primitives** (Dialog, Dropdown, Tabs, Tooltip, Popover) for accessibility.
- Wrap each primitive in a project-themed shell (`<AppDialog>`, `<AppDropdown>`).
- Shared component library in `frontend/src/components/ui/`.
- **Framer Motion** for state transitions, sidebar collapse, page transitions.
- **Recharts** default, **ApexCharts** lazy-loaded on Sankey/Heatmap/Treemap/Gauge pages only.

---

## 11. Backend Service Topology (Hostinger VPS, shared with SashaLMS)

```
Nginx (80/443)
  ├─ sasha-api  → 127.0.0.1:8000   (existing, untouched)
  └─ /warmpulse/* → 127.0.0.1:8001 (new)

systemd services (new):
  warmpulse-api         — Uvicorn on 8001, FastAPI app
  warmpulse-worker      — Celery worker, queues: default, smtp
  warmpulse-zai-worker  — Celery worker, queue: zai (isolated)
  warmpulse-beat        — Celery Beat scheduler

Shared infra:
  PostgreSQL 16         — database: warmpulse_db (new), same server as SashaLMS
  Redis 7               — key prefix `warmpulse:*` (sasha-api uses `sasha:*`)
  Fernet key            — env var FERNET_KEY, distinct per app
```

### 11.1 Queue responsibilities

| Queue | Tasks |
|---|---|
| `default` | DNS checks, reputation pulls (Postmaster/SNDS/blacklist), metric rollups, scheduled reports, audit writes |
| `smtp` | SMTP sends, IMAP polls, peer inbox auto-actions (open/reply/star/spam-rescue) |
| `zai` | All Z.ai API calls (isolated so LLM latency doesn't block SMTP workers) |

### 11.2 Deployment workflow

Out of scope for this spec (Phase 6 detail). Architecture-level commitment: match SashaLMS's systemd + Nginx pattern; no Docker for MVP.

---

## 12. Security

- **Credential encryption at rest:** Fernet (MultiFernet for rotation). Covers `mailboxes.smtp_password_encrypted`, `mailboxes.oauth_token_encrypted`, `peer_inboxes.smtp_creds_encrypted`, `peer_inboxes.imap_creds_encrypted`, `users.totp_secret_encrypted`, `api_keys.key_hash` (hashed, not encrypted — bcrypt).
- **Transport:** TLS everywhere (Nginx handles). HSTS enabled.
- **JWT:** HS256 with env-only secret, short access + refresh rotation.
- **CSRF:** SameSite=Strict on refresh cookie. Separate CSRF token for form posts (FastAPI dependency).
- **2FA:** TOTP (feature 14), mandatory for super_admin, opt-in for clients.
- **Rate limits:** per-IP on auth endpoints, per-workspace on warmup config + API-key usage.
- **Audit log (feature 9):** every admin action, every credential change, every plan change, every login.
- **Z.ai key:** server env only. Never sent to frontend. Never logged.
- **PII handling:** user emails + peer inbox credentials are the sensitive data; neither appears in logs.

---

## 13. Open Questions (To Resolve Before Phases Start)

These are not architecture-blocking but must be answered before the phase spec that depends on them:

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | Z.ai API pricing + rate limits — confirm before committing token caps | Phase 5 | User |
| 2 | Peer inbox acquisition strategy — which provider(s), budget confirmation (~$500/mo initial per HTML spec) | Phase 3 | User |
| 3 | Compliance scope — India-focused user base, what DPDP Act obligations apply for storing SMTP creds | Phase 6 | User + legal |
| 4 | Landing-page copy + brand positioning — needed before hero + feature blocks | Phase 1 | User |
| 5 | Exact Recharts vs ApexCharts license check for commercial use | Phase 4 | Implementer |

---

## 14. Out of Scope (Explicit)

- **Real payment gateway** (Stripe / Razorpay / PayU) — dummy payment module only
- **Mobile native apps** — responsive web only
- **Client-side email inbox reading** (like a full email client for users) — WarmPulse only sends and reads *system-owned* mail (warmup traffic + peer inbox traffic)
- **Multi-region deployment** — single Hostinger VPS
- **Multi-tenancy at database level** — logical isolation via `workspace_id`, not per-tenant DBs
- **SSO (SAML, Okta)** — email+password and Google OAuth only
- **In-product AI chat assistants** powered by Z.ai (deferred — could be a future phase)
- **AI-generated UI components at runtime** (anti-pattern for SaaS, never in scope)
- **Light mode** (dark-first; light mode post-MVP)

---

## 15. Next Step

After user approves this architecture, the next action is **Phase 1 brainstorm**: Landing page + Signup/Login + Onboarding wizard. That phase will:

1. Brainstorm the hero layout, feature-reveal section content, plan picker UX, wizard step UI
2. Produce `docs/superpowers/specs/YYYY-MM-DD-phase1-landing-auth-onboarding-design.md`
3. Then invoke writing-plans to produce the implementation plan for Phase 1

Each subsequent phase follows the same brainstorm → spec → plan cycle independently.
