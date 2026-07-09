#!/usr/bin/env python3
"""Generate the WarmPulse System Report and Testing Document as .docx files.

Run: python3 scripts/gen_docs.py
Outputs into docs/:
  - WarmPulse_System_Report.docx
  - WarmPulse_Testing_Document.docx
"""
from __future__ import annotations

import os

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

# ---------------------------------------------------------------------------
# Brand palette / helpers
# ---------------------------------------------------------------------------
ACCENT = RGBColor(0x2D, 0x6C, 0xDF)      # blue
INK = RGBColor(0x1A, 0x1A, 0x1A)
DIM = RGBColor(0x66, 0x66, 0x66)
GREEN = RGBColor(0x1B, 0x7F, 0x3B)
HDR_FILL = "2D6CDF"
ZEBRA_FILL = "F1F5FB"

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(os.path.dirname(HERE), "docs")
os.makedirs(DOCS, exist_ok=True)


def base_styles(doc: Document) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    for lvl, size in ((1, 18), (2, 14), (3, 12)):
        st = doc.styles[f"Heading {lvl}"]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.color.rgb = ACCENT if lvl == 1 else INK
        st.font.bold = True


def shade(cell, fill: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.makeelement(qn("w:shd"), {qn("w:val"): "clear", qn("w:fill"): fill})
    tcPr.append(shd)


def add_table(doc: Document, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        shade(hdr[i], HDR_FILL)
        p = hdr[i].paragraphs[0]
        run = p.add_run(str(h))
        run.bold = True
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        run.font.size = Pt(9.5)
    for r_idx, row in enumerate(rows):
        cells = table.add_row().cells
        for i, val in enumerate(row):
            if i < len(cells):
                p = cells[i].paragraphs[0]
                run = p.add_run(str(val))
                run.font.size = Pt(9.5)
                if r_idx % 2 == 1:
                    shade(cells[i], ZEBRA_FILL)
    if widths:
        for row in table.rows:
            for i, w in enumerate(widths):
                if i < len(row.cells):
                    row.cells[i].width = Inches(w)
    doc.add_paragraph()
    return table


def para(doc: Document, text: str, *, italic=False, dim=False, bold=False, size=10.5):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = italic
    run.bold = bold
    run.font.size = Pt(size)
    if dim:
        run.font.color.rgb = DIM
    return p


def bullets(doc: Document, items):
    for it in items:
        doc.add_paragraph(it, style="List Bullet")


def cover(doc: Document, title: str, subtitle: str, kind: str):
    for _ in range(4):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("WarmPulse")
    r.bold = True
    r.font.size = Pt(40)
    r.font.color.rgb = ACCENT
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Multi-tenant Email-Warmup SaaS")
    r.font.size = Pt(13)
    r.font.color.rgb = DIM
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(24)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(subtitle)
    r.font.size = Pt(12)
    r.font.color.rgb = DIM
    for _ in range(8):
        doc.add_paragraph()
    for label, value in (
        ("Document type", kind),
        ("Version", "1.0"),
        ("Date", "14 June 2026"),
        ("Status", "Reviewed"),
        ("Audience", "Engineering, QA, Product, Stakeholders"),
    ):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(f"{label}: ")
        r.bold = True
        r.font.size = Pt(10.5)
        r2 = p.add_run(value)
        r2.font.size = Pt(10.5)
        r2.font.color.rgb = DIM
    doc.add_page_break()


def footer(doc: Document, text: str):
    sec = doc.sections[0]
    f = sec.footer.paragraphs[0]
    f.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = f.add_run(text)
    r.font.size = Pt(8)
    r.font.color.rgb = DIM


# ===========================================================================
# DOCUMENT 1 — SYSTEM REPORT
# ===========================================================================
def build_system_report():
    doc = Document()
    base_styles(doc)
    footer(doc, "WarmPulse — System Report v1.0 — Confidential")
    cover(doc, "System Report", "Architecture, Components & Operations", "Full System Report")

    # ---- TOC-ish overview ----
    doc.add_heading("1. Executive Summary", level=1)
    para(doc,
         "WarmPulse is a multi-tenant email-warmup SaaS. Clients connect their outbound "
         "mailboxes (Gmail OAuth / Outlook / Yahoo / generic SMTP); a system-owned peer-inbox "
         "network sends, opens, replies, stars, and spam-rescues warmup mail to and from those "
         "mailboxes to build sender reputation with Gmail, Outlook, and Yahoo. The peer network "
         "is the core moat: warmup signal is produced by real peer inboxes, not templates or mocks.")
    para(doc,
         "The platform is delivered as a FastAPI + Celery backend with a React 18 / Vite "
         "single-page frontend, backed by PostgreSQL and Redis. Seven-plus Celery Beat jobs drive "
         "the warmup engine end-to-end. The product is tiered (Starter / Pro / Pro Plus / Agency) "
         "with plan-aware UI dispatch on the frontend and feature gating on the backend.")

    doc.add_heading("2. Technology Stack", level=1)
    doc.add_heading("2.1 Backend", level=2)
    add_table(doc, ["Component", "Technology", "Notes"], [
        ["Web framework", "FastAPI ≥0.115", "Async ASGI, mounted via app factory in main.py"],
        ["ASGI server", "Uvicorn[standard] ≥0.30", "Runs on :8001"],
        ["Validation/config", "Pydantic v2 / pydantic-settings", "Settings read .env / .env.docker"],
        ["ORM", "SQLAlchemy[asyncio] ≥2.0.30", "Async sessions"],
        ["DB driver", "psycopg[binary,pool] ≥3.2", "PostgreSQL"],
        ["Migrations", "Alembic ≥1.13", "alembic/versions/*"],
        ["Task queue", "Celery ≥5.4", "Queues: default, smtp"],
        ["Broker / cache", "Redis ≥5.0", "Key-prefix isolation (warmpulse:)"],
        ["Mail I/O", "aiosmtplib ≥3.0, aioimaplib ≥1.1", "Async SMTP send + IMAP poll"],
        ["Crypto", "cryptography (Fernet), passlib[bcrypt]", "Credential-at-rest + password hashing"],
        ["Auth", "PyJWT ≥2.9, pyotp ≥2.9", "JWT bearer + TOTP 2FA"],
        ["DNS", "dnspython, checkdmarc", "SPF / DKIM / DMARC lookups"],
        ["HTTP client", "httpx ≥0.27", "OAuth, webhooks, external APIs"],
        ["PDF", "reportlab ≥4.2 (optional)", "Reports; 501+hint when missing"],
        ["Runtime", "Python ≥3.11", ""],
    ], widths=[1.6, 2.4, 2.6])

    doc.add_heading("2.2 Frontend", level=2)
    add_table(doc, ["Component", "Technology", "Notes"], [
        ["Framework", "React 18.3 + React Router 6.26", "SPA; lazy-loaded route chunks"],
        ["Build", "Vite 5.4 + TypeScript 5.6", "tsc -b then vite build"],
        ["Server state", "TanStack Query 5.59", "5-min stale, 30-min GC, no retry on 401/403"],
        ["Client state", "Zustand 4.5", "auth, theme, UI prefs (persisted)"],
        ["HTTP", "Axios 1.7", "Bearer inject + 401-refresh interceptor"],
        ["Styling", "Tailwind 3.4 + Radix UI", "Design tokens only; no ad-hoc colors"],
        ["Forms", "react-hook-form 7.53 + zod 3.23", ""],
        ["Charts", "Recharts, ApexCharts, GSAP, Framer Motion", ""],
        ["Auth SDK", "Firebase 12.x", "Google sign-in / ID-token verification"],
        ["Export", "jsPDF, xlsx", "Client-side PDF/CSV"],
    ], widths=[1.6, 2.6, 2.4])

    doc.add_heading("3. Deployment Topology", level=1)
    para(doc,
         "Production runs on a single Hostinger VPS via docker-compose using the host network "
         "(network_mode: host for app containers — localhost reaches Postgres/Redis directly).")
    add_table(doc, ["Service", "Port", "Role"], [
        ["postgres", "5433", "Primary datastore (prod container DB)"],
        ["redis", "6380", "Celery broker + cache (shared, key-prefixed)"],
        ["api", "8001", "FastAPI app"],
        ["worker", "—", "Celery worker (consumes default + smtp queues)"],
        ["beat", "—", "Celery beat scheduler"],
        ["frontend", "—", "nginx serving the Vite build"],
    ], widths=[1.6, 1.0, 4.0])
    para(doc, "Deploy: git pull → alembic upgrade head (inside api container) → "
              "docker compose up -d --build api worker beat frontend.", italic=True, dim=True)
    para(doc, "Critical env: DATABASE_URL, REDIS_URL, REDIS_KEY_PREFIX=warmpulse:, FERNET_KEY "
              "(credential-at-rest; comma-separated to rotate via MultiFernet), JWT_SECRET, "
              "GOOGLE_CLIENT_ID/SECRET, one LLM key (GEMINI_API_KEY or ANTHROPIC_API_KEY), and "
              "TRANSACTIONAL_SMTP_* (empty = dry-run mode).")

    doc.add_heading("4. Backend Architecture", level=1)
    para(doc, "Strict layering: routes are thin (≤40 lines/handler); all DB access, credential "
              "encryption, and audit writes live in services/*. A handler touching session.add or "
              "select(...) directly is a smell.")
    doc.add_heading("4.1 Module layout", level=2)
    add_table(doc, ["Path", "Responsibility"], [
        ["main.py", "FastAPI app factory; mounts every router in api/routes"],
        ["config.py", "Pydantic Settings; reads .env / .env.docker"],
        ["celery_app.py", "Celery app + beat schedule wiring"],
        ["api/deps.py", "get_current_user / get_current_claims / require_super_admin"],
        ["api/routes/", "Thin HTTP handlers"],
        ["db/models/", "One file per table; *_encrypted columns are Fernet BYTEA"],
        ["schemas/", "Pydantic v2 wire schemas (update bodies: extra='forbid')"],
        ["services/", "Business logic — routes call services; services call models"],
        ["services/warmup/", "Engine internals (pairing, ramp, timing, smtp_sender, imap_watcher)"],
        ["services/llm/", "Provider abstraction + Gemini/Claude impls + usage tracker"],
        ["services/crypto.py", "FernetService credential at-rest (MultiFernet rotation)"],
        ["tasks/", "Celery tasks; async-in-sync via asyncio.run(_impl())"],
        ["alembic/versions/", "Schema migrations"],
    ], widths=[1.9, 4.7])

    doc.add_heading("4.2 The warmup engine — Celery Beat jobs", level=2)
    add_table(doc, ["Job", "Cadence", "What it does"], [
        ["warmup-outbound", "~15 min", "Fan out one send per active, in-window, under-quota mailbox onto smtp queue; pick peer, generate content, send, write WarmupLog(outbound, sent)"],
        ["warmup-inbound", "~3 min", "Mirror outbound with sender/recipient swapped (peer→user); IMAP engagement (open/reply/star/spam-rescue)"],
        ["peer-rotation/health", "hourly", "Recompute peer reputation_score from 24h signal-vs-bounce; deactivate peers < PEER_REPUTATION_MIN (0.3); Day-0 peers exempt"],
        ["ramp-advance-daily", "00:00 UTC", "Advance mailboxes.current_day so ramp_target returns the next ladder step"],
        ["daily-rollup", "00:05 UTC", "Write one daily_metrics(mailbox_id, date) row from previous day's warmup_logs (upsert)"],
        ["alert-check-hourly", ":10 hourly", "Scan stalled mailboxes / failing peers / quota issues → transactional notifications"],
        ["beat-heartbeat", "~1 min", "Write heartbeat row consumed by admin System Health"],
        ["crm-sequence/reply/import", "5–60 min", "Step CRM sequences, scan replies, auto-import leads (Pro Plus)"],
    ], widths=[1.7, 1.1, 3.8])
    para(doc, "Ramp ladder: D1–3=5, D4–7=10, D8–14=20, D15–21=35, D22–28=50, D29+=mailbox.daily_target. "
              "Two queues: default (beat fan-out + LLM content) and smtp (per-send SMTP/IMAP I/O).",
         italic=True, dim=True)

    doc.add_heading("4.3 API surface (selected route groups)", level=2)
    add_table(doc, ["Prefix", "Domain"], [
        ["/api/auth", "Signup, login, refresh, me, logout, 2FA enable/verify/disable, email verification"],
        ["/api/auth/google · /microsoft · /firebase", "Three OAuth flows (login, mailbox-connect, Firebase ID-token)"],
        ["/api/workspace/mailboxes", "Mailbox CRUD, probe, detect-provider, pause/resume, test-connection, schedule"],
        ["/api/workspace/analytics", "Dashboard summary, daily metrics, placement trend, engagement, heatmap, bounce/spam"],
        ["/api/workspace/warmup-activity", "Activity feed, today-stats, warmup threads + messages"],
        ["/api/workspace/reputation · /postmaster · /snds", "Reputation overview, blacklist, Postmaster & SNDS ingest"],
        ["/api/workspace/placement-tests", "Inbox-placement tests (Pro Plus)"],
        ["/api/workspace/settings · /branding · /custom-domain", "Profile, avatar, API keys, password, notifications, branding"],
        ["/api/workspace/reports", "On-demand + scheduled PDF/CSV reports"],
        ["/api/workspace/notifications · /notifications-inbox · /webhooks", "Notification prefs, in-app inbox, outbound webhooks"],
        ["/api/crm", "Campaigns, leads, sequences, templates, AI draft, open-tracking pixel (public)"],
        ["/api/plans", "List plans"],
        ["/api/payments", "Dummy + UPI + Stripe + Cashfree checkout/webhook, invoices, methods"],
        ["/api/admin/*", "Users, peer-inboxes, peer-pools, pool-routing, platform-analytics, system-health, llm-usage, audit-log, reports, settings, CRM (super_admin only)"],
    ], widths=[2.6, 4.0])

    doc.add_heading("5. Authentication & Authorization", level=1)
    bullets(doc, [
        "JWT bearer in Authorization: Bearer <access_token>; refresh tokens are a separate type.",
        "api/deps.py: get_current_claims (decode/verify), get_current_user (claims → DB row), "
        "require_super_admin (role check on /api/admin/*).",
        "Frontend axios interceptor: 401 → POST /auth/refresh → transparent retry (single in-flight refresh).",
        "Three OAuth flows: classic Google login, Gmail mailbox-connect popup (offline refresh token "
        "postMessaged to opener), and Firebase ID-token verification against Google's X.509 certs "
        "(self-heals a stale cert cache on 401).",
        "TOTP 2FA: enrol in Settings; login challenges the code; recovery codes downloadable once at enrolment.",
    ])

    doc.add_heading("6. Security & Data Protection", level=1)
    bullets(doc, [
        "Credential-at-rest: SMTP passwords, OAuth refresh tokens and IMAP creds are Fernet-encrypted "
        "before reaching the DB; plaintext lives only as a local variable, then re-bound to 'REDACTED' and del'd.",
        "Key rotation via MultiFernet (comma-separated FERNET_KEY).",
        "Per-workspace isolation: every workspace-owned row carries workspace_id; every query filters on "
        "the JWT's workspace_id. Cross-workspace reads are treated as a security bug.",
        "Audit invariants: every super_admin or destructive action writes an audit_logs row via a "
        "per-service _write_audit helper using a SAVEPOINT (begin_nested) so audit failure can't poison the txn.",
        "Payments: PAN/CVC treated as sensitive even on the dummy gateway (only last4 / VPA persisted).",
    ])

    doc.add_heading("7. Payments & Billing", level=1)
    para(doc, "Three rails coexist; the active default is the dummy gateway. Stripe and Cashfree are "
              "wired but default-off (enabled only when their keys + webhook secrets are set).")
    add_table(doc, ["Rail", "Status", "Notes"], [
        ["Dummy gateway", "Active (default)", "payments_service.py — records succeeded Payment rows, transitions user to plan_selected; stores only card last4 / UPI VPA"],
        ["Stripe", "Wired, off by default", "Checkout sessions + signature-verified webhook; idempotent via stripe_events"],
        ["Cashfree", "Wired, off by default", "Orders (one-time) + Subscriptions (auto-pay) + webhook; idempotent via cashfree_events (replaces former Razorpay integration)"],
    ], widths=[1.4, 1.6, 3.6])

    doc.add_heading("8. Frontend Architecture", level=1)
    para(doc, "Three layout zones — Public, Client (/app/*), Admin (/admin/*) — with lazy-loaded chunks.")
    doc.add_heading("8.1 Plan-variant dispatch", level=2)
    para(doc, "usePlan() reads the server plan from /auth/me (with a dev/super-admin localStorage "
              "override) and dispatches /app/* pages to Starter / Pro / Pro Plus / Agency design files. "
              "Design-preview routes (/client-design-preview/*, /admin-design-preview/*) and unwired "
              "Ag* alternatives are NOT production.")
    doc.add_heading("8.2 Client screens", level=2)
    add_table(doc, ["Screen", "Purpose"], [
        ["Dashboard", "Warmth score, placement donut, 30-day trend, alerts, activity feed (plan-variant)"],
        ["Mailboxes", "List + drill-in (ramp schedule, daily actuals, threads), pause/resume, DNS health"],
        ["Activity", "Live feed of sent/opened/replied/spam-rescued peer interactions + thread drill-in"],
        ["Analytics", "Placement %, bounce/spam, engagement heatmap, daily metrics (Pro Plus: SNDS/Postmaster)"],
        ["Reputation", "SPF/DKIM/DMARC health, Postmaster, blacklist, trend"],
        ["Tools", "Placement tester, spam scanner, template designer (AI draft), warmup preview"],
        ["Reports", "On-demand + scheduled PDF/CSV, download history"],
        ["CRM", "Campaigns, leads, sequences, templates, AI draft, analytics"],
        ["Notifications", "Alert prefs, in-app inbox, digest"],
        ["Workspace", "Team members, sub-clients (Agency), API keys"],
        ["Billing", "Usage, plan upgrade, payment methods, invoices"],
        ["Settings", "Profile, avatar, timezone, notifications, TOTP security"],
    ], widths=[1.5, 5.1])
    doc.add_heading("8.3 Admin screens", level=2)
    bullets(doc, [
        "Dashboard, Users (search/impersonate/suspend/plan), CRM management, Peer Inboxes, Pool Routing, "
        "Platform Analytics, LLM Usage, Plans, System Health, Audit Log, Reports, Billing, Settings.",
    ])

    doc.add_heading("9. Onboarding Flow", level=1)
    para(doc, "Single-dashboard state machine (useOnboardingMachine) progressing without page reloads:")
    add_table(doc, ["Stage", "Screen", "Outcome"], [
        ["1. Plan", "PlanPicker", "Choose Starter / Pro / Pro Plus / Agency (monthly or yearly)"],
        ["2. Checkout", "Payment", "Dummy/Cashfree checkout → payment recorded"],
        ["3. Volume", "Volume step", "Daily send cap (plan-capped)"],
        ["4. Provider", "Provider step", "Gmail / Outlook / Yahoo / custom SMTP"],
        ["5. Credentials", "Credentials step", "OAuth or SMTP/IMAP; probe validates before persist"],
        ["6. DNS check", "DNS step", "SPF/DKIM/DMARC validation + acknowledge"],
        ["7. Tutorial", "Tutorial panels", "Optional warmup mechanics walkthrough"],
        ["8. Start", "Completion", "onboarding_status → active; redirect to /app/dashboard"],
    ], widths=[1.2, 1.8, 3.6])

    doc.add_heading("10. Database Conventions", level=1)
    bullets(doc, [
        "UUID primary keys everywhere (db/base.uuid_pk()).",
        "created_at / updated_at via helpers emitting DateTime(timezone=True) with func.now() defaults.",
        "Per-workspace isolation on every workspace-owned row.",
        "Key indexes: warmup_logs(mailbox_id, created_at DESC); partial peer_inboxes(is_active=true); "
        "unique daily_metrics(mailbox_id, date).",
        "*_encrypted columns are BYTEA Fernet tokens.",
    ])

    doc.add_heading("11. Observability & Operations", level=1)
    bullets(doc, [
        "beat-heartbeat job + admin System Health page surface scheduler liveness.",
        "alert-check-hourly fans transactional-mail notifications for stalled mailboxes / failing peers.",
        "Audit log is queryable + exportable per user via /api/admin/audit-log.",
        "Transactional mail runs in dry-run mode when TRANSACTIONAL_SMTP_HOST is empty (safe fresh install).",
    ])

    doc.add_heading("12. Known Constraints & Notes", level=1)
    bullets(doc, [
        "The peer-inbox network is the moat — it is never mockable, optional, or template-replaceable.",
        "Dummy payment gateway is intentional for MVP; PAN/CVC still treated as sensitive.",
        "PDF export returns 501 + hint when reportlab is absent — never a silent fake .pdf.",
        "Dev has no orchestration (7-terminal workflow) so the topology matches systemd/compose in prod.",
        "Design-preview routes are for internal iteration only and must not be mistaken for production.",
    ])

    out = os.path.join(DOCS, "WarmPulse_System_Report.docx")
    doc.save(out)
    return out


# ===========================================================================
# DOCUMENT 2 — TESTING DOCUMENT
# ===========================================================================
def tc(doc, tid, title, pre, steps, expected, priority="High", ttype="Functional"):
    """Render one test case as a compact table."""
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    meta = [
        ("Test ID", tid),
        ("Title", title),
        ("Type / Priority", f"{ttype} / {priority}"),
        ("Preconditions", pre),
        ("Steps", steps),
        ("Expected Result", expected),
    ]
    for k, v in meta:
        row = table.add_row().cells
        shade(row[0], ZEBRA_FILL)
        r = row[0].paragraphs[0].add_run(k)
        r.bold = True
        r.font.size = Pt(9.5)
        row[0].width = Inches(1.5)
        row[1].width = Inches(5.1)
        if isinstance(v, list):
            for i, line in enumerate(v):
                p = row[1].paragraphs[0] if i == 0 else row[1].add_paragraph()
                rr = p.add_run(f"{i+1}. {line}")
                rr.font.size = Pt(9.5)
        else:
            rr = row[1].paragraphs[0].add_run(str(v))
            rr.font.size = Pt(9.5)
    doc.add_paragraph()


def build_testing_document():
    doc = Document()
    base_styles(doc)
    footer(doc, "WarmPulse — Testing Document v1.0 — Confidential")
    cover(doc, "Testing Document", "Test Plan, Strategy & Test Cases", "Complete Test Plan & Cases")

    doc.add_heading("1. Introduction", level=1)
    para(doc, "This document defines the test plan, strategy, environments, and detailed test cases "
              "for verifying the WarmPulse platform end-to-end: authentication, mailbox onboarding, "
              "the warmup engine, analytics/reporting, CRM, billing, admin operations, and "
              "non-functional concerns (security, performance, reliability).")
    doc.add_heading("1.1 Scope", level=2)
    bullets(doc, [
        "In scope: Web frontend (/app/* and /admin/*), REST API, Celery warmup engine, "
        "auth/2FA/OAuth, payments (dummy + Stripe + Cashfree), CRM, reports, notifications.",
        "Out of scope: Third-party provider internals (Gmail/Outlook spam algorithms), the host "
        "iRedMail mail stack (off-limits), real PSP settlement.",
    ])
    doc.add_heading("1.2 References", level=2)
    bullets(doc, [
        "warmpulse-architecture.html (authoritative architecture contract).",
        "docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md.",
        "CLAUDE.md (engineering conventions).",
        "WarmPulse_System_Report.docx (companion document).",
    ])

    doc.add_heading("2. Test Strategy", level=1)
    add_table(doc, ["Level", "Approach", "Tooling"], [
        ["Unit", "Service + pure-logic tests (pairing, ramp, timing, crypto)", "pytest, pytest-asyncio (auto), aiosqlite"],
        ["Integration", "Postgres-only features (enums, partial indexes, ON CONFLICT)", "pytest -m integration (Postgres)"],
        ["API/contract", "Route behavior, auth, validation, status codes", "httpx test client / pytest"],
        ["Frontend", "Type-check + build + component behavior", "pnpm typecheck, pnpm build"],
        ["E2E / manual", "User journeys across UI + API + engine", "Browser + seeded test workspace"],
        ["Non-functional", "Security, performance, reliability, accessibility", "Manual + scripted probes"],
    ], widths=[1.3, 3.0, 2.3])
    para(doc, "Backend: cd backend && pytest. Single test: pytest tests/test_peer_inboxes.py::... -x. "
              "Frontend: cd frontend && pnpm typecheck && pnpm build. Lint: make lint.",
         italic=True, dim=True)

    doc.add_heading("3. Test Environments", level=1)
    add_table(doc, ["Environment", "Purpose", "Notes"], [
        ["Local dev", "Developer verification", "7-terminal workflow; SQLite for unit tests"],
        ["Staging / preview", "Integration + manual E2E", "Postgres 5433, Redis 6380, dummy gateway"],
        ["Production (VPS)", "Smoke + monitored release", "docker-compose; migrate via container, never host venv"],
    ], widths=[1.5, 2.3, 2.8])
    para(doc, "Deploy-migration trap: the host venv .env points at a stale dev Postgres (5432); prod is the "
              "container DB (5433). Always migrate prod with docker compose run --rm api alembic upgrade head.",
         italic=True, dim=True)

    doc.add_heading("4. Test Data", level=1)
    bullets(doc, [
        "Seeded super_admin + at least one client workspace per plan (Starter / Pro / Pro Plus / Agency).",
        "Dummy card 5555 5555 5555 4444 and a sample UPI VPA for payment paths.",
        "At least 2 active peer inboxes in the default pool so pairing has candidates.",
        "A mailbox with valid SPF/DKIM/DMARC and one with deliberately broken DNS.",
        "TOTP secret provisioned for a 2FA-enabled test user.",
    ])

    doc.add_heading("5. Entry / Exit Criteria", level=1)
    add_table(doc, ["Criterion", "Definition"], [
        ["Entry", "Build deploys cleanly; migrations applied; seed data loaded; smoke test green"],
        ["Exit", "100% of High-priority cases pass; no open Critical/Blocker defects; "
                 "regression suite green; sign-off recorded"],
    ], widths=[1.3, 5.3])

    doc.add_heading("6. Test Cases", level=1)
    para(doc, "Cases are grouped by module. Priority: High (must pass to ship), Medium, Low.", dim=True)

    # ---- 6.1 Auth ----
    doc.add_heading("6.1 Authentication & Accounts", level=2)
    tc(doc, "AUTH-01", "Email/password signup + verification",
       "No account with the test email exists.",
       ["POST /api/auth/signup with email + password.",
        "Open verification email link (GET /api/auth/verify-email?token=...).",
        "Log in via /login."],
       "User created; verification flips email_verified=true; login succeeds and lands on onboarding/dashboard.")
    tc(doc, "AUTH-02", "Login with wrong password",
       "Verified account exists.",
       ["POST /api/auth/login with an incorrect password."],
       "401 returned; no tokens issued; generic error shown (no user-enumeration leak).")
    tc(doc, "AUTH-03", "Access-token refresh on 401",
       "Logged in; access token expired.",
       ["Trigger any authenticated API call with an expired access token."],
       "Axios interceptor calls POST /auth/refresh once and transparently retries; request succeeds.")
    tc(doc, "AUTH-04", "TOTP 2FA challenge on login",
       "Test user has TOTP enrolled.",
       ["Submit correct email + password.",
        "When challenged, enter the current TOTP code."],
       "Login blocked until a valid TOTP code is supplied; invalid code is rejected; recovery code works once.")
    tc(doc, "AUTH-05", "Google login (classic OAuth)",
       "Google test account available.",
       ["Click 'Continue with Google' on /login.",
        "Complete consent."],
       "User is created-or-found; JWT pair issued; redirect to app.")
    tc(doc, "AUTH-06", "Firebase ID-token sign-in + stale cert self-heal",
       "Firebase configured.",
       ["Sign in via Firebase; backend verifies ID token against Google X.509 certs.",
        "Force a stale cert cache and retry."],
       "Token verified; on a 401 from stale certs the verifier refreshes the cache and succeeds.")
    tc(doc, "AUTH-07", "Super-admin route guard",
       "Logged in as a normal client.",
       ["Call any /api/admin/* endpoint."],
       "403 Forbidden; require_super_admin blocks access.", priority="High", ttype="Security")

    # ---- 6.2 Onboarding ----
    doc.add_heading("6.2 Onboarding & Mailbox Connect", level=2)
    tc(doc, "ONB-01", "Full onboarding happy path",
       "Newly verified user, no plan.",
       ["Pick a plan → complete checkout → set volume → choose provider → enter credentials → "
        "pass DNS check → finish tutorial."],
       "onboarding_status transitions plan_selected → active; user lands on /app/dashboard; a mailbox exists.")
    tc(doc, "ONB-02", "Credential probe before persist",
       "On the credentials step.",
       ["Enter invalid SMTP/IMAP credentials and click validate (POST /mailboxes/probe)."],
       "Probe fails with a clear error; no mailbox row is created until valid creds pass.")
    tc(doc, "ONB-03", "Gmail OAuth mailbox-connect popup",
       "Provider = Gmail.",
       ["Launch the OAuth popup; complete consent."],
       "Offline refresh token is postMessaged to the opener and stored encrypted; popup closes; mailbox connected.")
    tc(doc, "ONB-04", "DNS check surfaces broken records",
       "Mailbox domain has broken SPF/DKIM/DMARC.",
       ["Run the DNS check step."],
       "Each record shows pass/fail accurately; user can acknowledge and proceed with warnings.")
    tc(doc, "ONB-05", "Plan cap enforced on volume",
       "Starter plan selected.",
       ["Attempt to set a daily volume above the Starter cap."],
       "UI caps the selectable volume to the plan limit.", priority="Medium")

    # ---- 6.3 Warmup engine ----
    doc.add_heading("6.3 Warmup Engine", level=2)
    tc(doc, "WARM-01", "Outbound cycle sends within window & quota",
       "Active mailbox, in send-window, under quota; ≥1 active peer in pool.",
       ["Trigger schedule_warmup_cycle (or wait for the 15-min beat).",
        "Inspect warmup_logs and the smtp queue."],
       "One send_single_warmup_email per eligible mailbox; peer picked via pairing; "
       "WarmupLog(direction=outbound, action=sent) written.")
    tc(doc, "WARM-02", "Mailbox outside window is skipped",
       "Mailbox with a send-window that excludes 'now'.",
       ["Trigger the outbound cycle."],
       "No send is scheduled for that mailbox.", priority="Medium")
    tc(doc, "WARM-03", "Quota ceiling respected",
       "Mailbox already at today's ramp target.",
       ["Trigger the outbound cycle."],
       "No further sends scheduled until the daily counter resets.")
    tc(doc, "WARM-04", "Peer pairing dedup + reputation weighting",
       "Multiple active peers; one used in the last 24h.",
       ["Run pairing.pick_peer_inbox repeatedly."],
       "24h-dedup peer is excluded; selection is reputation-weighted; workspace pool preferred over default.")
    tc(doc, "WARM-05", "Inbound engagement actions",
       "Outbound warmup mail has landed in a peer inbox.",
       ["Run schedule_inbound_cycle / IMAP watcher."],
       "Peer opens/replies/stars/spam-rescues; WarmupLog rows for each engagement action are written.")
    tc(doc, "WARM-06", "Ramp ladder advances",
       "Mailbox on day N.",
       ["Run ramp-advance-daily; check ramp_target."],
       "current_day increments; target follows ladder (D1–3=5 … D29+=daily_target).")
    tc(doc, "WARM-07", "Peer health deactivates low reputation",
       "A peer with 24h signal-vs-bounce below 0.3 (not Day-0).",
       ["Run the hourly peer health check."],
       "Peer reputation_score recomputed; sub-threshold peer deactivated with an audit row; Day-0 peers exempt.")
    tc(doc, "WARM-08", "Daily rollup is idempotent",
       "warmup_logs exist for the previous day.",
       ["Run daily-rollup twice."],
       "Exactly one daily_metrics(mailbox_id, date) row per mailbox/day (upsert, not duplicate).")
    tc(doc, "WARM-09", "Credential redaction after send",
       "Mailbox with stored SMTP password.",
       ["Send a warmup email; inspect logs/memory handling."],
       "Plaintext password is re-bound to 'REDACTED' and del'd after send; never logged.",
       ttype="Security")

    # ---- 6.4 Analytics & reports ----
    doc.add_heading("6.4 Analytics, Reputation & Reports", level=2)
    tc(doc, "ANL-01", "Dashboard summary reflects activity",
       "Mailbox with recent sends/opens/replies.",
       ["Open /app/dashboard; call /analytics/dashboard/summary."],
       "Sent/opened/replied/placement KPIs match warmup_logs; charts render.")
    tc(doc, "ANL-02", "Placement & bounce/spam trends",
       "Several days of daily_metrics.",
       ["Open Analytics; view placement and bounce/spam trends."],
       "Trends render with correct date buckets and percentages.", priority="Medium")
    tc(doc, "REP-01", "DNS/reputation overview",
       "Mailbox with mixed DNS health.",
       ["Open /app/reputation."],
       "SPF/DKIM/DMARC status and reputation score render; blacklist check returns results.")
    tc(doc, "REP-02", "Pro Plus external reputation gating",
       "Logged in as Pro Plus vs Starter.",
       ["Open Reputation/Analytics for each plan."],
       "Postmaster/SNDS ingest is available for Pro Plus and gated/hidden for Starter.", priority="Medium")
    tc(doc, "RPT-01", "On-demand report (CSV)",
       "Workspace with data.",
       ["POST /api/workspace/reports/generate for a CSV report."],
       "CSV downloads with correct columns/rows.")
    tc(doc, "RPT-02", "PDF export without reportlab",
       "reportlab dependency absent.",
       ["Request a PDF export."],
       "501 returned with a helpful hint; no fake/empty .pdf is produced.", priority="Medium", ttype="Negative")

    # ---- 6.5 CRM ----
    doc.add_heading("6.5 CRM", level=2)
    tc(doc, "CRM-01", "Campaign + lead import",
       "Authenticated workspace within CRM limits.",
       ["Create a campaign; bulk-import leads from CSV."],
       "Campaign created; leads imported with correct field mapping; limits enforced per tier.")
    tc(doc, "CRM-02", "Sequence enrollment + steps",
       "A sequence with steps exists.",
       ["Enroll a lead; run crm-sequence beat."],
       "Lead advances through steps on schedule; sends recorded; enrollment status updates.")
    tc(doc, "CRM-03", "Open-tracking pixel (public)",
       "A sent CRM email with tracking token.",
       ["Request GET /api/crm/track/open/{token}.gif (no auth)."],
       "Returns a 1x1 gif; a lead 'email_opened' activity is recorded.")
    tc(doc, "CRM-04", "AI draft generation",
       "LLM key configured.",
       ["POST /api/crm/ai-draft with a prompt."],
       "Generated copy returned; falls back gracefully if provider unavailable.", priority="Medium")

    # ---- 6.6 Payments ----
    doc.add_heading("6.6 Payments & Billing", level=2)
    tc(doc, "PAY-01", "Dummy card payment upgrades plan",
       "Dummy gateway active.",
       ["POST /api/payments/dummy with test card 5555...4444."],
       "succeeded Payment row recorded (only last4 stored); user transitions to plan_selected.")
    tc(doc, "PAY-02", "UPI payment path",
       "Dummy gateway active.",
       ["POST /api/payments/upi with a VPA."],
       "Payment recorded with VPA; plan transition occurs.", priority="Medium")
    tc(doc, "PAY-03", "Stripe/Cashfree disabled by default",
       "No PSP keys set.",
       ["Inspect available payment rails."],
       "Stripe & Cashfree are off; dummy gateway is the fallback; no live PSP calls made.")
    tc(doc, "PAY-04", "Cashfree webhook idempotency",
       "Cashfree enabled (keys set).",
       ["Deliver the same webhook event twice."],
       "Second delivery is deduped via cashfree_events; no double credit.", priority="Medium", ttype="Negative")
    tc(doc, "PAY-05", "PAN/CVC never persisted",
       "Any payment path.",
       ["Submit card details; inspect stored Payment row."],
       "Only last4 / VPA stored; full PAN and CVC are never persisted or logged.", ttype="Security")
    tc(doc, "PAY-06", "Invoice download",
       "A succeeded payment exists.",
       ["GET /api/payments/{id}/invoice.csv (and .pdf if reportlab present)."],
       "Invoice downloads with correct amounts; PDF returns 501+hint if reportlab missing.", priority="Medium")

    # ---- 6.7 Admin ----
    doc.add_heading("6.7 Admin Operations", level=2)
    tc(doc, "ADM-01", "User search + impersonation",
       "Logged in as super_admin.",
       ["Open /admin/users; search; impersonate a user."],
       "List paginates/filters; impersonation mints a short-lived token; an audit_logs row is written.",
       ttype="Security")
    tc(doc, "ADM-02", "Peer inbox bulk import + health",
       "Super_admin; CSV of peers.",
       ["Bulk-import peers; open peer health."],
       "Peers created; health metrics + reputation distribution render.")
    tc(doc, "ADM-03", "Pool routing assignment",
       "A workspace and a custom pool exist.",
       ["Assign the workspace to the pool; remove the assignment."],
       "Warmup pairing prefers the assigned pool; removal reverts to the default pool.")
    tc(doc, "ADM-04", "Audit log export",
       "Actions have been performed.",
       ["Filter /admin/audit-log; export CSV."],
       "Entries show actor/action/target/timestamp; CSV export matches the filter.")
    tc(doc, "ADM-05", "System health shows beat liveness",
       "Beat running.",
       ["Open /admin/system-health."],
       "Heartbeat shows 'beat alive N seconds ago'; queue depth and DB pool render.")
    tc(doc, "ADM-06", "Destructive action writes audit via SAVEPOINT",
       "Super_admin deletes a user.",
       ["Delete a user; force an audit-write error in a controlled test."],
       "Cascade delete works; audit uses begin_nested SAVEPOINT so an audit failure can't poison the txn.",
       ttype="Security", priority="Medium")

    # ---- 6.8 Non-functional ----
    doc.add_heading("6.8 Non-Functional", level=2)
    tc(doc, "SEC-01", "Cross-workspace isolation",
       "Two workspaces A and B with data.",
       ["As A, request B's mailbox/analytics/report IDs directly."],
       "All cross-workspace reads are denied (404/403); no data leaks across tenants.", ttype="Security")
    tc(doc, "SEC-02", "Credentials encrypted at rest",
       "Mailbox + peer with stored secrets.",
       ["Inspect *_encrypted columns in the DB."],
       "Columns hold Fernet BYTEA tokens, not plaintext; decrypt only via FernetService.", ttype="Security")
    tc(doc, "PERF-01", "Activity feed query performance",
       "Mailbox with large warmup_logs history.",
       ["Load the activity feed / today-stats."],
       "Query uses warmup_logs(mailbox_id, created_at DESC) index; responds within target latency.",
       ttype="Performance", priority="Medium")
    tc(doc, "REL-01", "Transactional mail dry-run on fresh install",
       "TRANSACTIONAL_SMTP_HOST empty.",
       ["Trigger a signup/alert that would send mail."],
       "Service logs at INFO and returns success (dry-run); flows don't break.",
       ttype="Reliability", priority="Medium")
    tc(doc, "REL-02", "Migration applied against prod container DB",
       "New migration to deploy.",
       ["Run docker compose run --rm api alembic upgrade head."],
       "Migration applies to the 5433 container DB (not host 5432); app boots cleanly.",
       ttype="Reliability")

    # ---- 7 Traceability ----
    doc.add_heading("7. Requirement Traceability (summary)", level=1)
    add_table(doc, ["Module", "Cases", "Key risks covered"], [
        ["Authentication", "AUTH-01..07", "Signup, refresh, 2FA, OAuth, admin guard"],
        ["Onboarding", "ONB-01..05", "Happy path, probe, OAuth, DNS, plan caps"],
        ["Warmup engine", "WARM-01..09", "Send/receive cycles, pairing, ramp, health, redaction"],
        ["Analytics/Reports", "ANL/REP/RPT", "KPIs, gating, CSV/PDF, 501 fallback"],
        ["CRM", "CRM-01..04", "Campaigns, sequences, tracking, AI draft"],
        ["Payments", "PAY-01..06", "Dummy/UPI, PSP off-by-default, idempotency, PAN safety"],
        ["Admin", "ADM-01..06", "Impersonation, peers, routing, audit, health"],
        ["Non-functional", "SEC/PERF/REL", "Isolation, encryption, perf, dry-run, migration trap"],
    ], widths=[1.7, 1.4, 3.5])

    doc.add_heading("8. Defect Severity & Reporting", level=1)
    add_table(doc, ["Severity", "Definition", "SLA"], [
        ["Blocker", "Engine down, data loss, auth bypass, tenant leak", "Fix before release"],
        ["Critical", "Major feature broken, no workaround", "Fix before release"],
        ["Major", "Feature broken with workaround", "Next release"],
        ["Minor", "Cosmetic / low-impact", "Backlog"],
    ], widths=[1.2, 3.6, 1.8])
    para(doc, "Each defect logs: ID, title, severity, environment, steps to reproduce, expected vs actual, "
              "screenshots/logs, and the related Test ID.", dim=True)

    doc.add_heading("9. Sign-off", level=1)
    add_table(doc, ["Role", "Name", "Date", "Signature"], [
        ["QA Lead", "", "", ""],
        ["Engineering Lead", "", "", ""],
        ["Product Owner", "", "", ""],
    ], widths=[1.6, 1.8, 1.5, 1.7])

    out = os.path.join(DOCS, "WarmPulse_Testing_Document.docx")
    doc.save(out)
    return out


if __name__ == "__main__":
    p1 = build_system_report()
    p2 = build_testing_document()
    print("Wrote:", p1)
    print("Wrote:", p2)
