/**
 * Design preview workspace — served on :35001 via vite.preview.config.ts.
 *
 * ADMIN section design round. 4 candidates per admin section, wired in for the
 * user to compare and pick. Uses the real (permanent) AdminPillSidebar + a
 * seeded super_admin so the shell matches production. Candidates are
 * self-contained (mock data) — no backend needed.
 *
 * Flow: pick the winner for the current section → it gets locked into the live
 * admin page → the next section gets its own 4 candidates here.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

import { AdminPillSidebar } from '@/components/layout/AdminPillSidebar';
import { BrandingProvider } from '@/components/BrandingProvider';
import { AppToaster } from '@/components/ui/AppToast';
import { useAuthStore } from '@/stores/auth';

// ── Admin Dashboard — 4 candidates (this round) ──
import { AdmDshD1Command } from '@/pages/admin-preview/dashboard/D1Command';
import { AdmDshD2Bento } from '@/pages/admin-preview/dashboard/D2Bento';
import { AdmDshD3HealthHub } from '@/pages/admin-preview/dashboard/D3HealthHub';
import { AdmDshD4Report } from '@/pages/admin-preview/dashboard/D4Report';
// E-set — premium, fully-interactive round.
import { AdmDshE1Mission } from '@/pages/admin-preview/dashboard/E1Mission';
import { AdmDshE2Executive } from '@/pages/admin-preview/dashboard/E2Executive';
import { AdmDshE3Grid } from '@/pages/admin-preview/dashboard/E3Grid';
import { AdmDshE4Spotlight } from '@/pages/admin-preview/dashboard/E4Spotlight';

// ── Agency Dashboard — constellation aesthetic ──
import { AgDashC1Orbital } from '@/pages/client/agency/AgDashC1Orbital';
import { AgDashC2Galaxy } from '@/pages/client/agency/AgDashC2Galaxy';
import { AgDashC3Branches } from '@/pages/client/agency/AgDashC3Branches';
import { AgDashC4Pulse } from '@/pages/client/agency/AgDashC4Pulse';
import { AgDshD3Tiered } from '@/pages/client/agency/AgDshD3Tiered';
// ── Platform Analytics — 4 candidates ──
import { AdmAnaA1Cockpit } from '@/pages/admin-preview/analytics/A1Cockpit';
import { AdmAnaA2Explorer } from '@/pages/admin-preview/analytics/A2Explorer';
import { AdmAnaA3Scoreboard } from '@/pages/admin-preview/analytics/A3Scoreboard';
import { AdmAnaA4Journal } from '@/pages/admin-preview/analytics/A4Journal';
// ── System Health — 4 candidates ──
import { AdmHlthH1Board } from '@/pages/admin-preview/system-health/H1Board';
import { AdmHlthH2Console } from '@/pages/admin-preview/system-health/H2Console';
import { AdmHlthH3Vitals } from '@/pages/admin-preview/system-health/H3Vitals';
import { AdmHlthH4Report } from '@/pages/admin-preview/system-health/H4Report';
// H5–H8 — round 2 candidates
import { AdmHlthH5Topology } from '@/pages/admin-preview/system-health/H5Topology';
import { AdmHlthH6ControlRoom } from '@/pages/admin-preview/system-health/H6ControlRoom';
import { AdmHlthH7Timeline } from '@/pages/admin-preview/system-health/H7Timeline';
import { AdmHlthH8Gauges } from '@/pages/admin-preview/system-health/H8Gauges';
// ── Peer Inboxes — 4 candidates ──
import { AdmPeerP1Roster } from '@/pages/admin-preview/peer-inboxes/P1Roster';
import { AdmPeerP2Grid } from '@/pages/admin-preview/peer-inboxes/P2Grid';
import { AdmPeerP3Network } from '@/pages/admin-preview/peer-inboxes/P3Network';
import { AdmPeerP4Console } from '@/pages/admin-preview/peer-inboxes/P4Console';
// ── Pool Routing — 4 candidates (animation-forward round, framer-motion) ──
import { AdmPoolR5Orbital } from '@/pages/admin-preview/pool-routing/R5Orbital';
import { AdmPoolR6Streams } from '@/pages/admin-preview/pool-routing/R6Streams';
import { AdmPoolR7Vessels } from '@/pages/admin-preview/pool-routing/R7Vessels';
import { AdmPoolR8Board } from '@/pages/admin-preview/pool-routing/R8Board';
// ── LLM Usage — 4 candidates (animation-forward, framer-motion) ──
import { AdmLlmL1Cockpit } from '@/pages/admin-preview/llm-usage/L1Cockpit';
import { AdmLlmL2Arena } from '@/pages/admin-preview/llm-usage/L2Arena';
import { AdmLlmL3Stream } from '@/pages/admin-preview/llm-usage/L3Stream';
import { AdmLlmL4Ledger } from '@/pages/admin-preview/llm-usage/L4Ledger';
// ── Users — 4 candidates (animation-forward, framer-motion) ──
import { AdmUsrU1Directory } from '@/pages/admin-preview/users/U1Directory';
import { AdmUsrU2Cohorts } from '@/pages/admin-preview/users/U2Cohorts';
import { AdmUsrU3Gallery } from '@/pages/admin-preview/users/U3Gallery';
import { AdmUsrU4Pulse } from '@/pages/admin-preview/users/U4Pulse';
// ── CRM (cross-workspace) — 4 candidates (animation-forward, framer-motion) ──
import { AdmCrmCR1Command } from '@/pages/admin-preview/crm/CR1Command';
import { AdmCrmCR2Funnel } from '@/pages/admin-preview/crm/CR2Funnel';
import { AdmCrmCR3Grid } from '@/pages/admin-preview/crm/CR3Grid';
import { AdmCrmCR4Stream } from '@/pages/admin-preview/crm/CR4Stream';
// ── Plans & Pricing — 4 candidates (animation-forward, framer-motion) ──
import { AdmPlanPL1Studio } from '@/pages/admin-preview/plans/PL1Studio';
import { AdmPlanPL2Matrix } from '@/pages/admin-preview/plans/PL2Matrix';
import { AdmPlanPL3Cockpit } from '@/pages/admin-preview/plans/PL3Cockpit';
import { AdmPlanPL4Ladder } from '@/pages/admin-preview/plans/PL4Ladder';
// ── Billing — 4 candidates (animation-forward, framer-motion) ──
import { AdmBilBL1Cockpit } from '@/pages/admin-preview/billing/BL1Cockpit';
import { AdmBilBL2Ledger } from '@/pages/admin-preview/billing/BL2Ledger';
import { AdmBilBL3Movement } from '@/pages/admin-preview/billing/BL3Movement';
import { AdmBilBL4Health } from '@/pages/admin-preview/billing/BL4Health';
// ── Reports — 4 candidates (animation-forward, framer-motion, ₹) ──
import { AdmRptRP1Studio } from '@/pages/admin-preview/reports/RP1Studio';
import { AdmRptRP2Scheduled } from '@/pages/admin-preview/reports/RP2Scheduled';
import { AdmRptRP3Library } from '@/pages/admin-preview/reports/RP3Library';
import { AdmRptRP4Cockpit } from '@/pages/admin-preview/reports/RP4Cockpit';
// ── Audit Log — 4 candidates (animation-forward, framer-motion) ──
import { AdmAudAU1Timeline } from '@/pages/admin-preview/audit-log/AU1Timeline';
import { AdmAudAU2Ledger } from '@/pages/admin-preview/audit-log/AU2Ledger';
import { AdmAudAU3Forensics } from '@/pages/admin-preview/audit-log/AU3Forensics';
import { AdmAudAU4Feed } from '@/pages/admin-preview/audit-log/AU4Feed';
// ── Settings — candidates (animation-forward, framer-motion) ──
import { AdmSetSE1Console } from '@/pages/admin-preview/settings/SE1Console';
import { AdmSetSE2Cards } from '@/pages/admin-preview/settings/SE2Cards';
// ── Landing Hero — 4 redesign candidates (Agency tier held) ──
import { LandHeroH1Split } from '@/pages/landing-preview/H1Split';
import { LandHeroH2Spotlight } from '@/pages/landing-preview/H2Spotlight';
import { LandHeroH3Bento } from '@/pages/landing-preview/H3Bento';
import { LandHeroH4Immersive } from '@/pages/landing-preview/H4Immersive';

import '@/index.css';
import '@/components/layout/admin-shell.css';
import '@/components/layout/admin-theme.css';

const ACCENT = '#F26522';

// Seed a super_admin so the admin pill renders avatar/email and the shell
// matches production. No DB needed — candidates use mock data.
useAuthStore.setState({
  user: {
    id: 'preview-admin',
    email: 'admin@warmpulse.app',
    name: 'Super Admin',
    role: 'super_admin',
    workspace_id: 'preview-ws',
    onboarding_status: 'active',
    plan: 'Agency',
  } as never,
});

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

type Variant = { id: string; label: string; el: JSX.Element };

const DASHBOARD_VARIANTS: Variant[] = [
  // ── Agency Dashboard (Pick one) ──
  { id: 'c1', label: 'AGENCY C1 · Orbital', el: <AgDashC1Orbital /> },
  { id: 'c2', label: 'AGENCY C2 · Galaxy', el: <AgDashC2Galaxy /> },
  { id: 'c3', label: 'AGENCY C3 · Branches', el: <AgDashC3Branches /> },
  { id: 'c4', label: 'AGENCY C4 · Pulse Map', el: <AgDashC4Pulse /> },
  { id: 'd3', label: 'AGENCY D3 · Tiered (LOCKED)', el: <AgDshD3Tiered /> },

  // E-set — new premium, fully-interactive round (shown first).
  { id: 'e1', label: 'E1 · Mission Control', el: <AdmDshE1Mission /> },
  { id: 'e2', label: 'E2 · Executive Briefing', el: <AdmDshE2Executive /> },
  { id: 'e3', label: 'E3 · Grid Workspace', el: <AdmDshE3Grid /> },
  { id: 'e4', label: 'E4 · Insight Spotlight (LOCKED — live)', el: <AdmDshE4Spotlight /> },
  // D-set — first round (kept for comparison).
  { id: 'd1', label: 'D1 · Command Deck', el: <AdmDshD1Command /> },
  { id: 'd2', label: 'D2 · Bento Grid', el: <AdmDshD2Bento /> },
  { id: 'd3', label: 'D3 · Health Hub', el: <AdmDshD3HealthHub /> },
  { id: 'd4', label: 'D4 · Analyst Report', el: <AdmDshD4Report /> },
];

const ANALYTICS_VARIANTS: Variant[] = [
  { id: 'a1', label: 'A1 · Analytics Cockpit (LOCKED — live)', el: <AdmAnaA1Cockpit /> },
  { id: 'a2', label: 'A2 · Trends Explorer', el: <AdmAnaA2Explorer /> },
  { id: 'a3', label: 'A3 · Scoreboard', el: <AdmAnaA3Scoreboard /> },
  { id: 'a4', label: 'A4 · Journal', el: <AdmAnaA4Journal /> },
];

const SYSTEM_HEALTH_VARIANTS: Variant[] = [
  { id: 'h1', label: 'H1 · Status Board', el: <AdmHlthH1Board /> },
  { id: 'h2', label: 'H2 · Ops Console', el: <AdmHlthH2Console /> },
  { id: 'h3', label: 'H3 · Vitals Monitor', el: <AdmHlthH3Vitals /> },
  { id: 'h4', label: 'H4 · Health Report', el: <AdmHlthH4Report /> },
  { id: 'h5', label: 'H5 · Topology Map', el: <AdmHlthH5Topology /> },
  { id: 'h6', label: 'H6 · Control Room', el: <AdmHlthH6ControlRoom /> },
  { id: 'h7', label: 'H7 · Timeline', el: <AdmHlthH7Timeline /> },
  { id: 'h8', label: 'H8 · Gauge Cluster (LOCKED — live)', el: <AdmHlthH8Gauges /> },
];

const PEER_INBOXES_VARIANTS: Variant[] = [
  { id: 'p1', label: 'P1 · Roster', el: <AdmPeerP1Roster /> },
  { id: 'p2', label: 'P2 · Capacity Grid (LOCKED — live)', el: <AdmPeerP2Grid /> },
  { id: 'p3', label: 'P3 · Network / Pools', el: <AdmPeerP3Network /> },
  { id: 'p4', label: 'P4 · Ops Console', el: <AdmPeerP4Console /> },
];

const POOL_ROUTING_VARIANTS: Variant[] = [
  { id: 'r5', label: 'R5 · Orbital Pools', el: <AdmPoolR5Orbital /> },
  { id: 'r6', label: 'R6 · Flow Streams', el: <AdmPoolR6Streams /> },
  { id: 'r7', label: 'R7 · Capacity Vessels (LOCKED — live)', el: <AdmPoolR7Vessels /> },
  { id: 'r8', label: 'R8 · Motion Board', el: <AdmPoolR8Board /> },
];

const LLM_USAGE_VARIANTS: Variant[] = [
  { id: 'l1', label: 'L1 · Usage Cockpit', el: <AdmLlmL1Cockpit /> },
  { id: 'l2', label: 'L2 · Provider Arena (LOCKED — live)', el: <AdmLlmL2Arena /> },
  { id: 'l3', label: 'L3 · Token Stream', el: <AdmLlmL3Stream /> },
  { id: 'l4', label: 'L4 · Cost Ledger', el: <AdmLlmL4Ledger /> },
];

const USERS_VARIANTS: Variant[] = [
  { id: 'u1', label: 'U1 · Command Directory', el: <AdmUsrU1Directory /> },
  { id: 'u2', label: 'U2 · Segment Cohorts', el: <AdmUsrU2Cohorts /> },
  { id: 'u3', label: 'U3 · Profile Gallery (LOCKED — live)', el: <AdmUsrU3Gallery /> },
  { id: 'u4', label: 'U4 · Activity Pulse', el: <AdmUsrU4Pulse /> },
];

const CRM_VARIANTS: Variant[] = [
  { id: 'cr1', label: 'CR1 · Command Center', el: <AdmCrmCR1Command /> },
  { id: 'cr2', label: 'CR2 · Pipeline Funnel', el: <AdmCrmCR2Funnel /> },
  { id: 'cr3', label: 'CR3 · Workspace Grid (LOCKED — live)', el: <AdmCrmCR3Grid /> },
  { id: 'cr4', label: 'CR4 · Activity Stream', el: <AdmCrmCR4Stream /> },
];

const PLANS_VARIANTS: Variant[] = [
  { id: 'pl1', label: 'PL1 · Pricing Studio', el: <AdmPlanPL1Studio /> },
  { id: 'pl2', label: 'PL2 · Comparison Matrix (LOCKED — live)', el: <AdmPlanPL2Matrix /> },
  { id: 'pl3', label: 'PL3 · Revenue Cockpit', el: <AdmPlanPL3Cockpit /> },
  { id: 'pl4', label: 'PL4 · Tier Ladder', el: <AdmPlanPL4Ladder /> },
];

const BILLING_VARIANTS: Variant[] = [
  { id: 'bl1', label: 'BL1 · Revenue Cockpit', el: <AdmBilBL1Cockpit /> },
  { id: 'bl2', label: 'BL2 · Subscriptions Ledger (LOCKED — live)', el: <AdmBilBL2Ledger /> },
  { id: 'bl3', label: 'BL3 · MRR Movement', el: <AdmBilBL3Movement /> },
  { id: 'bl4', label: 'BL4 · Billing Health', el: <AdmBilBL4Health /> },
];

const REPORTS_VARIANTS: Variant[] = [
  { id: 'rp1', label: 'RP1 · Report Studio (LOCKED — live)', el: <AdmRptRP1Studio /> },
  { id: 'rp2', label: 'RP2 · Scheduled Reports', el: <AdmRptRP2Scheduled /> },
  { id: 'rp3', label: 'RP3 · Report Library', el: <AdmRptRP3Library /> },
  { id: 'rp4', label: 'RP4 · Reporting Cockpit', el: <AdmRptRP4Cockpit /> },
];

const AUDIT_VARIANTS: Variant[] = [
  { id: 'au1', label: 'AU1 · Audit Timeline', el: <AdmAudAU1Timeline /> },
  { id: 'au2', label: 'AU2 · Audit Ledger', el: <AdmAudAU2Ledger /> },
  { id: 'au3', label: 'AU3 · Forensics', el: <AdmAudAU3Forensics /> },
  { id: 'au4', label: 'AU4 · Live Feed (LOCKED — live)', el: <AdmAudAU4Feed /> },
];

const SETTINGS_VARIANTS: Variant[] = [
  { id: 'se1', label: 'SE1 · Settings Console', el: <AdmSetSE1Console /> },
  { id: 'se2', label: 'SE2 · Settings Cards (LOCKED — live)', el: <AdmSetSE2Cards /> },
];

const HERO_VARIANTS: Variant[] = [
  { id: 'h1', label: 'H1 · Split Showcase', el: <LandHeroH1Split /> },
  { id: 'h2', label: 'H2 · Centered Spotlight', el: <LandHeroH2Spotlight /> },
  { id: 'h3', label: 'H3 · Bento Hero', el: <LandHeroH3Bento /> },
  { id: 'h4', label: 'H4 · Immersive (LOCKED — live)', el: <LandHeroH4Immersive /> },
];

// Other admin sections — placeholders until their candidate round runs.
const PENDING_ADMIN_PATHS = [] as const;

function VariantSwitcher({
  title,
  variants,
  initialId,
}: {
  title: string;
  variants: Variant[];
  initialId?: string;
}) {
  const [v, setV] = useState(initialId ?? variants[0]!.id);
  const active = variants.find((d) => d.id === v) ?? variants[0]!;
  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 4px 14px',
          background: 'linear-gradient(var(--wp-bg,#0a0a0f) 70%, transparent)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          {title}
        </span>
        <div
          style={{
            display: 'flex',
            gap: 4,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 999,
            padding: 3,
          }}
        >
          {variants.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setV(d.id)}
              style={{
                appearance: 'none',
                border: 'none',
                background: d.id === v ? ACCENT : 'transparent',
                color: d.id === v ? '#0a0a0f' : 'rgba(255,255,255,0.7)',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>{active.el}</div>
    </div>
  );
}

function ClearedPlaceholder({ path }: { path: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '70vh',
        gap: 12,
        padding: '0 16px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: ACCENT,
          opacity: 0.85,
        }}
      >
        Next up
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', maxWidth: 560 }}>
        No candidates wired for{' '}
        <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6 }}>
          {path}
        </code>{' '}
        yet.
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', maxWidth: 520 }}>
        The Dashboard candidates are at <code>/admin/dashboard</code> (click Dashboard in the rail).
        Pick one and tell me to lock it — the next section gets its own 4 designs here.
      </div>
    </div>
  );
}

function PreviewShell() {
  return (
    <div className="admin-shell">
      <div className="admin-shell__atmosphere" aria-hidden>
        <div className="admin-shell__aurora-1" />
        <div className="admin-shell__aurora-2" />
        <div className="admin-shell__grid" />
      </div>
      {/* Real, permanent admin pill — imported verbatim. */}
      <AdminPillSidebar />
      <main className="admin-shell__main">
        <Link
          to="/hero"
          style={{
            position: 'fixed',
            top: 12,
            right: 16,
            zIndex: 50,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: ACCENT,
            opacity: 0.7,
            textDecoration: 'none',
          }}
        >
          Landing hero →
        </Link>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <VariantSwitcher
                title="Admin Dashboard · E4 LOCKED (live) · others kept for reference"
                variants={DASHBOARD_VARIANTS}
                initialId="e4"
              />
            }
          />
          <Route
            path="/admin/platform-analytics"
            element={
              <VariantSwitcher
                title="Admin Platform Analytics · 4 candidates (A1–A4)"
                variants={ANALYTICS_VARIANTS}
                initialId="a1"
              />
            }
          />
          <Route
            path="/admin/system-health"
            element={
              <VariantSwitcher
                title="Admin System Health · 8 candidates (H1–H8)"
                variants={SYSTEM_HEALTH_VARIANTS}
                initialId="h1"
              />
            }
          />
          <Route
            path="/admin/peer-inboxes"
            element={
              <VariantSwitcher
                title="Admin Peer Inboxes · P2 LOCKED (live) · others for reference"
                variants={PEER_INBOXES_VARIANTS}
                initialId="p2"
              />
            }
          />
          <Route
            path="/admin/pool-routing"
            element={
              <VariantSwitcher
                title="Admin Pool Routing · R7 LOCKED (live) · others for reference"
                variants={POOL_ROUTING_VARIANTS}
                initialId="r7"
              />
            }
          />
          <Route
            path="/admin/llm-usage"
            element={
              <VariantSwitcher
                title="Admin LLM Usage · L2 LOCKED (live) · others for reference"
                variants={LLM_USAGE_VARIANTS}
                initialId="l2"
              />
            }
          />
          <Route
            path="/admin/users"
            element={
              <VariantSwitcher
                title="Admin Users · U3 LOCKED (live) · others for reference"
                variants={USERS_VARIANTS}
                initialId="u3"
              />
            }
          />
          <Route
            path="/admin/crm"
            element={
              <VariantSwitcher
                title="Admin CRM (cross-workspace) · CR3 LOCKED (live) · others for reference"
                variants={CRM_VARIANTS}
                initialId="cr3"
              />
            }
          />
          <Route
            path="/admin/plans"
            element={
              <VariantSwitcher
                title="Admin Plans & Pricing · PL2 LOCKED (live) · others for reference"
                variants={PLANS_VARIANTS}
                initialId="pl2"
              />
            }
          />
          <Route
            path="/admin/billing"
            element={
              <VariantSwitcher
                title="Admin Billing · BL2 LOCKED (live) · others for reference"
                variants={BILLING_VARIANTS}
                initialId="bl2"
              />
            }
          />
          <Route
            path="/admin/reports"
            element={
              <VariantSwitcher
                title="Admin Reports · RP1 LOCKED (live) · others for reference"
                variants={REPORTS_VARIANTS}
                initialId="rp1"
              />
            }
          />
          <Route
            path="/admin/audit-log"
            element={
              <VariantSwitcher
                title="Admin Audit Log · AU4 LOCKED (live) · others for reference"
                variants={AUDIT_VARIANTS}
                initialId="au4"
              />
            }
          />
          <Route
            path="/admin/settings"
            element={
              <VariantSwitcher
                title="Admin Settings · SE2 LOCKED (live) · SE1 for reference"
                variants={SETTINGS_VARIANTS}
                initialId="se2"
              />
            }
          />
          {PENDING_ADMIN_PATHS.map((path) => (
            <Route key={path} path={path} element={<ClearedPlaceholder path={path} />} />
          ))}
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function HeroPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <Link
        to="/admin/dashboard"
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          zIndex: 60,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: ACCENT,
          opacity: 0.7,
          textDecoration: 'none',
        }}
      >
        Admin preview →
      </Link>
      <div style={{ padding: '8px 16px 80px' }}>
        <VariantSwitcher
          title="Landing Hero · H4 LOCKED (live) · others for reference · Agency held"
          variants={HERO_VARIANTS}
          initialId="h4"
        />
      </div>
    </div>
  );
}

function PreviewRoot() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/hero')) return <HeroPreview />;
  return <PreviewShell />;
}

createRoot(document.getElementById('preview-root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrandingProvider>
        <MemoryRouter initialEntries={['/hero']}>
          <PreviewRoot />
          <AppToaster />
        </MemoryRouter>
      </BrandingProvider>
    </QueryClientProvider>
  </StrictMode>,
);
