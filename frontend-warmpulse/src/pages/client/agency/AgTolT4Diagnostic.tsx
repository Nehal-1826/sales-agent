import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bell,
  ChevronRight,
  Clipboard,
  Clock,
  Cpu,
  Disc,
  FileText,
  Heart,
  HeartPulse,
  Hospital,
  Hourglass,
  Inbox,
  ListChecks,
  Mail,
  Microscope,
  Play,
  Radar,
  Radiation,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  TestTube,
  Timer,
  X,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgTolT4Diagnostic — Agency-tier TOOLS surface, design candidate T4
 * "Medical Diagnostic Suite".
 *
 * The agency owner is the attending physician on duty in a hospital's
 * diagnostic-imaging wing. Each sub-client is a patient with a case file
 * and a "ward census" of mailboxes; each tool is a diagnostic instrument
 * the physician wheels up to a patient on demand:
 *
 *   • Preview   → X-RAY        (transparent skeletal view of a warmup msg)
 *   • Templates → MRI SCANNER  (slice-by-slice template inspection)
 *   • Spam      → BLOOD PANEL  (chemistry analysis of content)
 *   • Placement → ULTRASOUND   (deep imaging of sub-client mailbox flora)
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ DIAGNOSTIC SUITE HEADER — ward census stats + on-duty pill     │
 *   ├────────────────────────────────────────────────────────────────┤
 *   │ PATIENT ROSTER STRIP — horizontally scrollable patient cards   │
 *   ├──────────────────────────────────────────┬─────────────────────┤
 *   │ INSTRUMENT PANEL (2×2 diagnostic bays)   │  CASE-FILE PANEL    │
 *   │   X-Ray │ MRI                            │  selected patient,  │
 *   │   Blood │ Ultrasound                     │  diagnoses summary, │
 *   │                                          │  next scheduled     │
 *   ├──────────────────────────────────────────┴─────────────────────┤
 *   │ VITALS / EKG BAND — full-width ECG trace + recent-run blips    │
 *   ├────────────────────────────────────────────────────────────────┤
 *   │ SUITE STATUS FOOTER — wait time / machines / queue / success % │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * DISTINCT ANIMATIONS:
 *   • EKG trace — continuous heartbeat polyline left-scrolls; pulse dot
 *     pings each run that completes.
 *   • X-Ray bay — top-to-bottom scan-line sweep over a skeleton glyph.
 *   • MRI bay — rotating ring gantry, inner slice halo, slice index ticks.
 *   • Blood panel — coloured droplets fall down test tubes on a loop.
 *   • Ultrasound — radial ripple waves emanate from a probe icon.
 *   • Patient pills — status-tinted breathing glow.
 *   • Active-run blips — pulsing dot on the EKG band at the bottom.
 *
 * Aesthetic: clinical / modern, NOT cheesy medical drama. Monospace stats,
 * EKG-style traces, dotted-underline form labels, square-bracketed digital
 * readouts. Hand-rolled inline SVG everywhere — no chart library.
 *
 * STRICT ORANGE PALETTE — only `var(--wp-accent…)` brand tokens and the
 * semantic `var(--wp-success / warning / danger)` triplet. No violet / cyan
 * / teal / sky / mint hex codes anywhere.
 *
 * STANDALONE: no router, no query hooks, no required props. Prop-less mount
 * falls back to the inline MOCK; live wrappers may pass `data` once the
 * agency-tools aggregate endpoint exists.
 */

// ---------------------------------------------------------------------------
// Shared data shape — kept verbatim across all four T1..T4 variants so this
// component is a drop-in alternative.
// ---------------------------------------------------------------------------

export type ToolSlug = 'preview' | 'templates' | 'spam' | 'placement';
export type ToolRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgencyToolsData {
  agency: { name: string; region: string };
  subClients: Array<{
    id: string;
    name: string;
    domain: string;
    mailboxCount: number;
    status: 'active' | 'paused' | 'onboarding';
  }>;
  tools: Array<{
    slug: ToolSlug;
    name: string;
    short: string;
    description: string;
    lastRunAt: string | null;
    runsLast30d: number;
    available: boolean;
  }>;
  recentRuns: Array<{
    id: string;
    toolSlug: ToolSlug;
    subClientId: string;
    subClientName: string;
    startedAt: string;
    status: ToolRunStatus;
    summary: string;
    durationMs: number;
  }>;
  summary: {
    totalRunsToday: number;
    totalRuns30d: number;
    avgPlacementScore: number;
    queuedRuns: number;
  };
}

// ---------------------------------------------------------------------------
// MOCK content — Northwind Agency / us-east-1.
// 8 patients (sub-clients), 4 instruments (tools), 10 recent runs.
// ---------------------------------------------------------------------------

const MOCK_SUB_CLIENTS: AgencyToolsData['subClients'] = [
  { id: 'sc-helix', name: 'Helix Analytics', domain: 'helix.io', mailboxCount: 22, status: 'active' },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.com', mailboxCount: 18, status: 'active' },
  { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.co', mailboxCount: 15, status: 'active' },
  { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 12, status: 'onboarding' },
  { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 10, status: 'active' },
  { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 8, status: 'active' },
  { id: 'sc-atlas', name: 'Atlas Bio', domain: 'atlas-bio.com', mailboxCount: 6, status: 'paused' },
  { id: 'sc-pixel', name: 'Pixel Forge', domain: 'pixelforge.app', mailboxCount: 5, status: 'onboarding' },
];

const MOCK_TOOLS: AgencyToolsData['tools'] = [
  {
    slug: 'preview',
    name: 'Inbox Preview',
    short: 'See how a warmup message renders in Gmail / Outlook / Yahoo before it ships.',
    description:
      'Renders the next-scheduled warmup body across the three major web clients (Gmail / Outlook / Yahoo) so the operator can spot formatting drift, broken images, or unsafe HTML before peers receive it.',
    lastRunAt: '14 minutes ago',
    runsLast30d: 184,
    available: true,
  },
  {
    slug: 'templates',
    name: 'Template Library',
    short: 'Browse, preview and roll out the seed templates the engine pulls from.',
    description:
      'Authoritative library of the warmup seed templates. Slice-by-slice diff view exposes subject / preheader / body / CTA so an operator can audit drift over time before pushing a new revision.',
    lastRunAt: '2 hours ago',
    runsLast30d: 67,
    available: true,
  },
  {
    slug: 'spam',
    name: 'Spam Word Audit',
    short: 'Score outgoing copy against a curated spam-trigger lexicon.',
    description:
      'Static analysis of a draft body against an evolving spam-trigger lexicon. Each hit is weighted and a composite risk index is returned. Operators wire this into a pre-send guard rail for high-stakes sequences.',
    lastRunAt: '38 minutes ago',
    runsLast30d: 142,
    available: true,
  },
  {
    slug: 'placement',
    name: 'Placement Tester',
    short: 'Send a probe to seed inboxes and read back deliverability.',
    description:
      'Dispatches a tagged probe message to a representative pool of seed inboxes. The placement reader returns per-provider inbox / spam / blocked ratios so operators see real placement instead of inferred reputation.',
    lastRunAt: '1 hour ago',
    runsLast30d: 96,
    available: true,
  },
];

const MOCK_RUNS: AgencyToolsData['recentRuns'] = [
  {
    id: 'r-1', toolSlug: 'placement', subClientId: 'sc-helix', subClientName: 'Helix Analytics',
    startedAt: '14m ago', status: 'completed', summary: 'Inbox 94% · Spam 3% · Blocked 0%', durationMs: 38_400,
  },
  {
    id: 'r-2', toolSlug: 'preview', subClientId: 'sc-nimbus', subClientName: 'Nimbus Cloud',
    startedAt: '22m ago', status: 'completed', summary: '3/3 clients clean · 1 trim warning', durationMs: 4_200,
  },
  {
    id: 'r-3', toolSlug: 'spam', subClientId: 'sc-atlas', subClientName: 'Atlas Bio',
    startedAt: '38m ago', status: 'failed', summary: 'Risk index 71 · 4 critical triggers', durationMs: 2_900,
  },
  {
    id: 'r-4', toolSlug: 'templates', subClientId: 'sc-orion', subClientName: 'Orion Sales',
    startedAt: '1h ago', status: 'completed', summary: '12 templates · 0 drift · 3 revisions', durationMs: 12_500,
  },
  {
    id: 'r-5', toolSlug: 'placement', subClientId: 'sc-quasar', subClientName: 'Quasar Growth',
    startedAt: '1h ago', status: 'running', summary: 'Probe queued · 21/40 inboxes scored', durationMs: 71_000,
  },
  {
    id: 'r-6', toolSlug: 'preview', subClientId: 'sc-lyra', subClientName: 'Lyra Studio',
    startedAt: '2h ago', status: 'completed', summary: '3/3 clients clean · zero warnings', durationMs: 4_600,
  },
  {
    id: 'r-7', toolSlug: 'spam', subClientId: 'sc-vega', subClientName: 'Vega Outbound',
    startedAt: '3h ago', status: 'completed', summary: 'Risk index 22 · 1 mild trigger', durationMs: 2_800,
  },
  {
    id: 'r-8', toolSlug: 'placement', subClientId: 'sc-pixel', subClientName: 'Pixel Forge',
    startedAt: '4h ago', status: 'pending', summary: 'Queued · awaiting available probe slot', durationMs: 0,
  },
  {
    id: 'r-9', toolSlug: 'templates', subClientId: 'sc-helix', subClientName: 'Helix Analytics',
    startedAt: '6h ago', status: 'completed', summary: '15 templates · 2 minor drift fixed', durationMs: 14_100,
  },
  {
    id: 'r-10', toolSlug: 'spam', subClientId: 'sc-nimbus', subClientName: 'Nimbus Cloud',
    startedAt: '7h ago', status: 'completed', summary: 'Risk index 12 · all clear', durationMs: 2_600,
  },
];

const MOCK: AgencyToolsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: MOCK_SUB_CLIENTS,
  tools: MOCK_TOOLS,
  recentRuns: MOCK_RUNS,
  summary: {
    totalRunsToday: 38,
    totalRuns30d: 489,
    avgPlacementScore: 91.4,
    queuedRuns: 3,
  },
};

/** All-zero skeleton fallback — what a live wrapper passes pre-API. */
export const AGENCY_TOOLS_SKELETON_T4: AgencyToolsData = {
  agency: { name: 'Your agency', region: 'us-east-1' },
  subClients: [],
  tools: [],
  recentRuns: [],
  summary: { totalRunsToday: 0, totalRuns30d: 0, avgPlacementScore: 0, queuedRuns: 0 },
};

// ---------------------------------------------------------------------------
// Theme tokens — Shailog orange palette via CSS vars with hard fallbacks for
// inline SVG attributes. Stays in sync with hero-theme.css.
// ---------------------------------------------------------------------------

const TOK = {
  accent: 'var(--wp-accent, #F26522)',
  accentHover: 'var(--wp-accent-hover, #FF7B38)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accent3: 'var(--wp-accent-3, #FF9670)',
  success: 'var(--wp-success, #3ddc97)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  border: 'var(--wp-border, #2a2a3a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
} as const;

/** Hard hex fallbacks for SVG `stopColor` etc. where var() can be flaky. */
const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#FF9670',
  accentDeep: '#C8470E',
  success: '#3ddc97',
  warning: '#ffb454',
  danger: '#ff5c7a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  gridDim: '#22223a',
} as const;

// ---------------------------------------------------------------------------
// Sub-client → patient-status mapping
// ---------------------------------------------------------------------------

type SubClient = AgencyToolsData['subClients'][number];
type SubClientStatus = SubClient['status'];

/** Maps the raw sub-client status into a clinical triage label. */
type PatientTriage = 'stable' | 'monitoring' | 'critical';

function triageFor(sub: SubClient): PatientTriage {
  if (sub.status === 'active') return 'stable';
  if (sub.status === 'onboarding') return 'monitoring';
  return 'critical';
}

const TRIAGE_LABEL: Record<PatientTriage, string> = {
  stable: 'Stable',
  monitoring: 'Monitoring',
  critical: 'Critical',
};

const TRIAGE_HEX: Record<PatientTriage, string> = {
  stable: HEX.success,
  monitoring: HEX.warning,
  critical: HEX.danger,
};

// ---------------------------------------------------------------------------
// Tool → instrument mapping
// ---------------------------------------------------------------------------

interface InstrumentMeta {
  slug: ToolSlug;
  /** Clinical name (X-Ray, MRI, ...) */
  clinicalName: string;
  /** Short subtitle shown under the clinical name. */
  subtitle: string;
  /** Modality code, e.g. "RX-01" — printed in the bay corner. */
  modality: string;
  /** Lucide icon used for the bay header chip. */
  icon: typeof Stethoscope;
  /** The bay's hero illustration component. */
  Illustration: (props: { active: boolean }) => JSX.Element;
  /** Action button label rendered at the bottom of the bay. */
  actionLabel: string;
}

const INSTRUMENT_META: Record<ToolSlug, InstrumentMeta> = {
  preview: {
    slug: 'preview',
    clinicalName: 'X-Ray',
    subtitle: 'Skeletal view of the next warmup message body',
    modality: 'RX-01',
    icon: ScanLine,
    Illustration: XRayIllustration,
    actionLabel: 'Initiate scan',
  },
  templates: {
    slug: 'templates',
    clinicalName: 'MRI Scanner',
    subtitle: 'Slice-by-slice template inspection',
    modality: 'MR-02',
    icon: Disc,
    Illustration: MRIIllustration,
    actionLabel: 'Begin slice acquisition',
  },
  spam: {
    slug: 'spam',
    clinicalName: 'Blood Panel',
    subtitle: 'Chemistry analysis of message body',
    modality: 'CHEM-03',
    icon: TestTube,
    Illustration: BloodPanelIllustration,
    actionLabel: 'Run blood panel',
  },
  placement: {
    slug: 'placement',
    clinicalName: 'Ultrasound',
    subtitle: 'Deep imaging of seed-inbox flora',
    modality: 'US-04',
    icon: Radar,
    Illustration: UltrasoundIllustration,
    actionLabel: 'Begin scan',
  },
};

// ---------------------------------------------------------------------------
// Run-status visuals
// ---------------------------------------------------------------------------

const RUN_STATUS_LABEL: Record<ToolRunStatus, string> = {
  pending: 'Pending',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Flagged',
};

const RUN_STATUS_HEX: Record<ToolRunStatus, string> = {
  pending: HEX.textDim,
  running: HEX.accent,
  completed: HEX.success,
  failed: HEX.danger,
};

// ---------------------------------------------------------------------------
// Aggregate derived metrics
// ---------------------------------------------------------------------------

interface SuiteMetrics {
  patients: number;
  stable: number;
  monitoring: number;
  critical: number;
  testsToday: number;
  testsLast30d: number;
  queued: number;
  avgPlacement: number;
  /** Successful runs / total runs (excluding pending). 0..1. */
  successRate: number;
  /** "Wait time" — a rounded estimate of average run duration over completed runs. */
  avgRunSeconds: number;
  /** Available machines (= tools where `available === true`). */
  availableMachines: number;
  totalMachines: number;
}

function computeMetrics(d: AgencyToolsData): SuiteMetrics {
  let stable = 0;
  let monitoring = 0;
  let critical = 0;
  for (const sub of d.subClients) {
    const t = triageFor(sub);
    if (t === 'stable') stable += 1;
    else if (t === 'monitoring') monitoring += 1;
    else critical += 1;
  }
  let completed = 0;
  let failed = 0;
  let durationSum = 0;
  let durationN = 0;
  for (const r of d.recentRuns) {
    if (r.status === 'completed') {
      completed += 1;
      durationSum += r.durationMs;
      durationN += 1;
    } else if (r.status === 'failed') {
      failed += 1;
    }
  }
  const denom = completed + failed;
  const successRate = denom === 0 ? 0 : completed / denom;
  const avgRunSeconds = durationN === 0 ? 0 : Math.round(durationSum / durationN / 1000);
  const availableMachines = d.tools.filter((t) => t.available).length;
  return {
    patients: d.subClients.length,
    stable,
    monitoring,
    critical,
    testsToday: d.summary.totalRunsToday,
    testsLast30d: d.summary.totalRuns30d,
    queued: d.summary.queuedRuns,
    avgPlacement: d.summary.avgPlacementScore,
    successRate,
    avgRunSeconds,
    availableMachines,
    totalMachines: d.tools.length,
  };
}

// ---------------------------------------------------------------------------
// Small formatting helpers — tabular numerals everywhere
// ---------------------------------------------------------------------------

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return formatNumber(Math.round(n));
}

function fmtPct(n: number, decimals: number = 1): string {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toFixed(decimals)}%`;
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}m ${String(remS).padStart(2, '0')}s`;
}

/** Two-letter initial avatar for the patient card. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '??';
  if (parts.length === 1) {
    const first = parts[0];
    return first.slice(0, 2).toUpperCase();
  }
  const a = parts[0];
  const b = parts[1];
  if (!a || !b) return name.slice(0, 2).toUpperCase();
  return `${a[0] ?? '?'}${b[0] ?? '?'}`.toUpperCase();
}

/** Stable short ID with a hospital "PT-####" prefix. */
function patientIdFor(sub: SubClient): string {
  // Drop a "sc-" prefix when present then upper-pad.
  const raw = sub.id.startsWith('sc-') ? sub.id.slice(3) : sub.id;
  return `PT-${raw.slice(0, 4).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Animation primitives — framer-motion only
// ---------------------------------------------------------------------------

const fadeUp = (delay: number = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// rAF clock — drives the EKG sweep, scanner gantry, droplet fall, ripple
// All animations share a single requestAnimationFrame loop so we don't pay
// for one per illustration. The clock pauses when the tab is hidden.
// ---------------------------------------------------------------------------

function useDiagnosticClock(): { tick: number; phase: number; seconds: number } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (document.visibilityState === 'visible') {
        setTick(now - start);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);
  // `phase` cycles 0..1 every 8s — slow continuous sweep for the EKG.
  const phase = ((tick % 8000) / 8000);
  const seconds = Math.floor(tick / 1000);
  return { tick, phase, seconds };
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function AgTolT4Diagnostic({ data }: { data?: AgencyToolsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const metrics = useMemo(() => computeMetrics(d), [d]);

  // Selected patient — defaults to the first sub-client so the case-file
  // panel never starts empty. Clicking another patient updates the panel.
  const [activePatientId, setActivePatientId] = useState<string | null>(
    () => d.subClients[0]?.id ?? null,
  );
  const activePatient = useMemo(
    () => d.subClients.find((s) => s.id === activePatientId) ?? null,
    [d.subClients, activePatientId],
  );

  // Hovered instrument — drives the bay's scan-line / ring / probe activity.
  const [hoverInstrument, setHoverInstrument] = useState<ToolSlug | null>(null);

  const clock = useDiagnosticClock();

  return (
    <div className="space-y-5">
      <SuiteHeader agency={d.agency} metrics={metrics} clockSeconds={clock.seconds} />

      <PatientRoster
        subClients={d.subClients}
        activePatientId={activePatientId}
        onPickPatient={setActivePatientId}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-8">
          <InstrumentPanel
            tools={d.tools}
            hoverInstrument={hoverInstrument}
            onHoverInstrument={setHoverInstrument}
            activePatient={activePatient}
          />
        </div>

        <div className="lg:col-span-4">
          <CaseFilePanel
            activePatient={activePatient}
            runs={d.recentRuns}
            onCloseDetail={() => setActivePatientId(null)}
          />
        </div>
      </motion.div>

      <VitalsBand runs={d.recentRuns} clock={clock} />

      <SuiteFooter metrics={metrics} />
    </div>
  );
}

export default AgTolT4Diagnostic;

// ===========================================================================
// SECTION 1 — Suite header
// ===========================================================================

function SuiteHeader({
  agency,
  metrics,
  clockSeconds,
}: {
  agency: AgencyToolsData['agency'];
  metrics: SuiteMetrics;
  clockSeconds: number;
}): JSX.Element {
  const hh = String(Math.floor((clockSeconds / 3600) % 24)).padStart(2, '0');
  const mm = String(Math.floor((clockSeconds / 60) % 60)).padStart(2, '0');
  const ss = String(clockSeconds % 60).padStart(2, '0');

  return (
    <motion.header
      {...fadeUp(0)}
      className="rounded-2xl border border-border-muted bg-surface/65 px-5 py-4 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <motion.span
            aria-hidden
            initial={{ scale: 0, rotate: -22 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/35 bg-accent/12"
          >
            <Hospital className="h-5 w-5 text-accent" />
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{ boxShadow: '0 0 22px rgba(242,101,34,0.30)' }}
              animate={{ opacity: [0.35, 0.85, 0.35] }}
              transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
            />
          </motion.span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
                Diagnostic suite
              </span>
              <span className="font-mono text-[10px] text-text-faint">·</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
                Wing {agency.region}
              </span>
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-text">
              {agency.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <OnDutyPill />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
                <Clock className="h-3 w-3" />
                {hh}:{mm}:{ss} UTC
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
                <Activity className="h-3 w-3" />
                {metrics.availableMachines}/{metrics.totalMachines} machines online
              </span>
            </div>
          </div>
        </div>

        <CensusBoard metrics={metrics} />
      </div>
    </motion.header>
  );
}

function OnDutyPill(): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent"
      title="Attending physician on duty"
    >
      <motion.span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: TOK.accent }}
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
        transition={{ duration: 2.1, ease: 'easeInOut', repeat: Infinity }}
      />
      <Stethoscope className="h-3 w-3" />
      Attending on duty
    </span>
  );
}

function CensusBoard({ metrics }: { metrics: SuiteMetrics }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CensusReadout
        label="Patients"
        value={fmtInt(metrics.patients)}
        sublabel={`${metrics.stable} stable · ${metrics.monitoring} obs · ${metrics.critical} crit`}
        Icon={Inbox}
        tone="accent"
      />
      <CensusReadout
        label="Tests today"
        value={fmtInt(metrics.testsToday)}
        sublabel="dispatched"
        Icon={ListChecks}
        tone="accent"
      />
      <CensusReadout
        label="Queued"
        value={fmtInt(metrics.queued)}
        sublabel="waiting"
        Icon={Hourglass}
        tone="warning"
      />
      <CensusReadout
        label="Avg score"
        value={fmtPct(metrics.avgPlacement)}
        sublabel="placement"
        Icon={HeartPulse}
        tone="success"
      />
    </div>
  );
}

function CensusReadout({
  label,
  value,
  sublabel,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  sublabel: string;
  Icon: typeof Stethoscope;
  tone: 'accent' | 'success' | 'warning' | 'danger';
}): JSX.Element {
  const ringColor =
    tone === 'success' ? TOK.success
      : tone === 'warning' ? TOK.warning
        : tone === 'danger' ? TOK.danger
          : TOK.accent;
  const textColor =
    tone === 'success' ? 'text-[var(--wp-success,#3ddc97)]'
      : tone === 'warning' ? 'text-[var(--wp-warning,#ffb454)]'
        : tone === 'danger' ? 'text-[var(--wp-danger,#ff5c7a)]'
          : 'text-accent';
  return (
    <div
      className="flex min-w-[112px] flex-col gap-0.5 rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2"
      style={{ boxShadow: `inset 0 0 0 1px ${ringColor}22` }}
    >
      <span className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span aria-hidden className="font-mono text-[9px] text-text-faint">[</span>
      </span>
      <span className={`font-mono text-base font-semibold tabular-nums ${textColor}`}>{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
        {sublabel}
      </span>
    </div>
  );
}

// ===========================================================================
// SECTION 2 — Patient roster strip
// ===========================================================================

function PatientRoster({
  subClients,
  activePatientId,
  onPickPatient,
}: {
  subClients: SubClient[];
  activePatientId: string | null;
  onPickPatient: (id: string) => void;
}): JSX.Element {
  return (
    <motion.section
      {...fadeUp(0.05)}
      className="rounded-2xl border border-border-muted bg-surface/55 px-4 py-3 backdrop-blur-xl"
      aria-label="Patient roster"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clipboard className="h-3.5 w-3.5 text-text-dim" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
            Patient roster · ward census
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
          {subClients.length} admitted
        </span>
      </div>

      <div className="hide-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 pb-1">
        {subClients.map((sub) => (
          <PatientCard
            key={sub.id}
            sub={sub}
            selected={sub.id === activePatientId}
            onPick={() => onPickPatient(sub.id)}
          />
        ))}
        {subClients.length === 0 && (
          <div className="grid w-full place-items-center py-6 font-mono text-[11px] text-text-faint">
            No patients currently admitted
          </div>
        )}
      </div>
    </motion.section>
  );
}

function PatientCard({
  sub,
  selected,
  onPick,
}: {
  sub: SubClient;
  selected: boolean;
  onPick: () => void;
}): JSX.Element {
  const triage = triageFor(sub);
  const dotHex = TRIAGE_HEX[triage];
  const initials = initialsFor(sub.name);
  const patientId = patientIdFor(sub);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`group relative shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-accent/55 bg-accent/10'
          : 'border-border-muted bg-surface-2/65 hover:border-accent/40 hover:bg-surface-2'
      }`}
      style={{ minWidth: 196 }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[12px] font-semibold tabular-nums"
          style={{
            background: `${dotHex}1f`,
            color: dotHex,
            boxShadow: `inset 0 0 0 1.5px ${dotHex}55`,
          }}
        >
          {initials}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: `0 0 10px ${dotHex}55` }}
            animate={{ opacity: [0.25, 0.7, 0.25] }}
            transition={{
              duration: triage === 'critical' ? 1.4 : triage === 'monitoring' ? 2.4 : 3.6,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-text">{sub.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-text-dim">
            <span className="text-text-faint">ID</span>
            <span className="tabular-nums">{patientId}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]"
          style={{
            borderColor: `${dotHex}50`,
            background: `${dotHex}10`,
            color: dotHex,
          }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: dotHex }}
          />
          {TRIAGE_LABEL[triage]}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
          <Mail className="h-2.5 w-2.5" />
          {sub.mailboxCount}
        </span>
      </div>
    </button>
  );
}

// ===========================================================================
// SECTION 3 — Instrument panel (2x2 bays)
// ===========================================================================

function InstrumentPanel({
  tools,
  hoverInstrument,
  onHoverInstrument,
  activePatient,
}: {
  tools: AgencyToolsData['tools'];
  hoverInstrument: ToolSlug | null;
  onHoverInstrument: (slug: ToolSlug | null) => void;
  activePatient: SubClient | null;
}): JSX.Element {
  // Always render in T1..T4 slot order so the four bays stay anchored.
  const order: ToolSlug[] = ['preview', 'templates', 'spam', 'placement'];
  const byMeta = new Map(tools.map((t) => [t.slug, t]));

  return (
    <motion.section
      {...fadeUp(0.1)}
      className="rounded-2xl border border-border-muted bg-surface/55 p-4 backdrop-blur-xl"
      aria-label="Instrument panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Microscope className="h-3.5 w-3.5 text-text-dim" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
            Instrument panel · 4 modalities online
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-0.5 font-mono text-[10px] text-text-dim">
          <Radiation className="h-2.5 w-2.5" />
          radiation-safe
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {order.map((slug) => {
          const meta = INSTRUMENT_META[slug];
          const tool = byMeta.get(slug);
          const active = hoverInstrument === slug;
          return (
            <InstrumentBay
              key={slug}
              meta={meta}
              tool={tool}
              active={active}
              onHover={(b) => onHoverInstrument(b ? slug : null)}
              activePatient={activePatient}
            />
          );
        })}
      </div>
    </motion.section>
  );
}

function InstrumentBay({
  meta,
  tool,
  active,
  onHover,
  activePatient,
}: {
  meta: InstrumentMeta;
  tool: AgencyToolsData['tools'][number] | undefined;
  active: boolean;
  onHover: (b: boolean) => void;
  activePatient: SubClient | null;
}): JSX.Element {
  const Icon = meta.icon;
  const ToolIllustration = meta.Illustration;

  return (
    <motion.article
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
      className={`relative flex flex-col overflow-hidden rounded-xl border ${
        active ? 'border-accent/55 bg-surface-2/80' : 'border-border-muted bg-surface-2/55'
      } transition-colors`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Bay header — modality code + clinical name. */}
      <div className="flex items-start justify-between gap-3 border-b border-border-muted/70 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/35 bg-accent/10 text-accent">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-text-faint">
              {meta.modality}
            </div>
            <div className="truncate text-[13px] font-semibold text-text">{meta.clinicalName}</div>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-text-dim"
          title={tool ? `${tool.runsLast30d} runs in last 30 days` : 'no run history'}
        >
          <Activity className="h-2.5 w-2.5" />
          {tool ? `${tool.runsLast30d}/30d` : '— / —'}
        </span>
      </div>

      {/* Illustration area — fills middle of the bay. */}
      <div className="relative px-3.5 pt-3">
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border-muted/60 bg-[#0a0a14]">
          <ToolIllustration active={active} />
          {/* Faint scanline overlay — clinical aesthetic. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.6) 3px, rgba(255,255,255,0.6) 4px)',
            }}
          />
          {/* Modality watermark — corner. */}
          <div className="absolute left-2 top-2 font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint/70">
            {meta.modality}
          </div>
          <div className="absolute right-2 top-2 font-mono text-[9px] uppercase tracking-[0.18em] text-accent/70">
            LIVE
          </div>
          {/* Currently-targeted patient name (if any) burned into the lower-left. */}
          {activePatient && (
            <div className="absolute bottom-2 left-2 max-w-[60%] truncate font-mono text-[9px] text-text-faint/85">
              <span className="text-text-faint">PT</span>{' '}
              <span className="text-text-dim">{activePatient.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Description + last-scan + action button */}
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3 pt-3">
        <p className="text-[12px] leading-relaxed text-text-dim">
          {tool?.short ?? meta.subtitle}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-text-faint">
            <Timer className="h-3 w-3" />
            Last scan
            <span className="text-text-dim">·</span>
            <span className="tabular-nums text-text-dim">{tool?.lastRunAt ?? 'never'}</span>
          </span>
          <button
            type="button"
            disabled={!tool?.available}
            className={`group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${
              tool?.available
                ? 'border-accent/45 bg-accent/12 text-accent hover:bg-accent/18'
                : 'border-border-muted bg-surface text-text-faint opacity-60'
            }`}
          >
            <Play className="h-3 w-3" />
            {meta.actionLabel}
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Decorative bay-border glow when active. */}
      <AnimatePresence>
        {active && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ boxShadow: 'inset 0 0 24px rgba(242,101,34,0.18)' }}
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Bay illustrations — hand-rolled SVG with motion. Each accepts an `active`
// prop so the bay can dial up animation intensity on hover.
// ---------------------------------------------------------------------------

function XRayIllustration({ active }: { active: boolean }): JSX.Element {
  // Animated horizontal scan-line that sweeps top→bottom over an X-ray
  // skeleton glyph. The skeleton is a stylised rib-cage + spine to evoke
  // a clinical chest X-ray without literally drawing an anatomical chart.
  return (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="xray-glow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={HEX.accent3} stopOpacity="0" />
          <stop offset="50%" stopColor={HEX.accent3} stopOpacity="0.95" />
          <stop offset="100%" stopColor={HEX.accent3} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="xray-aura" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor={HEX.accent2} stopOpacity="0.18" />
          <stop offset="100%" stopColor={HEX.accent2} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Aura behind the skeleton. */}
      <rect x="0" y="0" width="320" height="180" fill="url(#xray-aura)" />

      {/* Spine — vertical centre column. */}
      <g
        stroke={HEX.accent}
        strokeWidth="1.2"
        fill="none"
        opacity="0.78"
        strokeLinecap="round"
      >
        <line x1="160" y1="36" x2="160" y2="156" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="151" y1={48 + i * 13} x2="169" y2={48 + i * 13} />
        ))}

        {/* Rib pairs — symmetric arcs left/right of the spine. */}
        {Array.from({ length: 6 }, (_, i) => {
          const y = 60 + i * 12;
          return (
            <g key={`rib-${i}`}>
              <path d={`M 160 ${y} q -36 6 -64 ${i * 1.4 + 2}`} />
              <path d={`M 160 ${y} q  36 6  64 ${i * 1.4 + 2}`} />
            </g>
          );
        })}

        {/* Collar bones. */}
        <path d="M 160 50 q -42 -8 -70 6" />
        <path d="M 160 50 q  42 -8  70 6" />

        {/* Pelvis hint. */}
        <path d="M 124 152 q 36 14 72 0" />
      </g>

      {/* Scan line — bouncing top→bottom. */}
      <motion.rect
        x="6"
        y="0"
        width="308"
        height="3"
        fill="url(#xray-glow)"
        animate={{ y: [10, 158, 10] }}
        transition={{ duration: active ? 1.8 : 3.2, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.rect
        x="6"
        y="0"
        width="308"
        height="42"
        fill={HEX.accent3}
        opacity="0.06"
        animate={{ y: [-8, 152, -8] }}
        transition={{ duration: active ? 1.8 : 3.2, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* Grid ticks left edge — anatomical chart vibe. */}
      <g stroke={HEX.border} strokeWidth="0.6">
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`tick-${i}`} x1="0" y1={18 + i * 16} x2="6" y2={18 + i * 16} />
        ))}
      </g>
    </svg>
  );
}

function MRIIllustration({ active }: { active: boolean }): JSX.Element {
  // Rotating ring gantry centred on the bay. Inner slice halo pulses and
  // sliver-thin slice ticks rotate at a different rate.
  return (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="mri-glow" cx="50%" cy="50%" r="42%">
          <stop offset="0%" stopColor={HEX.accent} stopOpacity="0.55" />
          <stop offset="60%" stopColor={HEX.accent} stopOpacity="0.12" />
          <stop offset="100%" stopColor={HEX.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mri-tube" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={HEX.accent3} stopOpacity="0" />
          <stop offset="50%" stopColor={HEX.accent3} stopOpacity="0.45" />
          <stop offset="100%" stopColor={HEX.accent3} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Patient table — slab going through the gantry. */}
      <rect x="40" y="92" width="240" height="14" rx="3" fill={HEX.surface2} stroke={HEX.border} />
      <line x1="40" y1="106" x2="280" y2="106" stroke="url(#mri-tube)" strokeWidth="2.5" />

      {/* Outer ring — counter-rotates slowly. */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
        style={{ transformOrigin: '160px 90px' }}
      >
        <circle cx="160" cy="90" r="62" fill="none" stroke={HEX.accent} strokeWidth="1.2" opacity="0.5" />
        <circle cx="160" cy="90" r="62" fill="none" stroke={HEX.accent} strokeDasharray="2 8" strokeWidth="1.1" />
      </motion.g>

      {/* Inner gantry ring — rotates the other way faster. */}
      <motion.g
        animate={{ rotate: -360 }}
        transition={{ duration: active ? 5 : 9, ease: 'linear', repeat: Infinity }}
        style={{ transformOrigin: '160px 90px' }}
      >
        <circle cx="160" cy="90" r="44" fill="none" stroke={HEX.accent2} strokeWidth="1.6" opacity="0.85" />
        {/* Slice ticks. */}
        {Array.from({ length: 12 }, (_, i) => {
          const ang = (i / 12) * Math.PI * 2;
          const x1 = 160 + Math.cos(ang) * 42;
          const y1 = 90 + Math.sin(ang) * 42;
          const x2 = 160 + Math.cos(ang) * 46;
          const y2 = 90 + Math.sin(ang) * 46;
          return (
            <line
              key={`tick-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={HEX.accent2}
              strokeWidth="1.4"
            />
          );
        })}
      </motion.g>

      {/* Centre slice glow — pulses every 2.4s. */}
      <circle cx="160" cy="90" r="32" fill="url(#mri-glow)" />
      <motion.circle
        cx="160"
        cy="90"
        r="20"
        fill="none"
        stroke={HEX.accent}
        strokeWidth="1.3"
        animate={{ scale: [0.85, 1.18, 0.85], opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        style={{ transformOrigin: '160px 90px' }}
      />

      {/* Slice index readout. */}
      <g
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="9"
        fill={HEX.textDim}
      >
        <text x="14" y="166" letterSpacing="2">
          SLICE 042/096
        </text>
        <text x="220" y="166" letterSpacing="2">
          FOV · 256mm
        </text>
      </g>
    </svg>
  );
}

function BloodPanelIllustration({ active }: { active: boolean }): JSX.Element {
  // Three test tubes in a rack with red/orange droplets falling. A small
  // "chemistry result" readout sits to the right.
  const tubeXs = [60, 110, 160];
  return (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="tube-fluid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={HEX.accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={HEX.accentDeep} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="tube-fluid-warn" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={HEX.warning} stopOpacity="0.85" />
          <stop offset="100%" stopColor={HEX.accent} stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Rack base. */}
      <rect x="34" y="140" width="170" height="10" rx="2" fill={HEX.surface2} stroke={HEX.border} />

      {/* Tubes — each with fluid + a dripping droplet from above. */}
      {tubeXs.map((x, i) => {
        const fluidHeight = 60 - i * 8;
        const fillGrad = i === 1 ? 'url(#tube-fluid-warn)' : 'url(#tube-fluid)';
        return (
          <g key={`tube-${i}`}>
            <rect
              x={x - 9}
              y={50}
              width={18}
              height={90}
              rx={9}
              fill={HEX.surface}
              stroke={HEX.border}
              strokeWidth="1.1"
            />
            {/* Fluid. */}
            <rect
              x={x - 7}
              y={140 - fluidHeight}
              width={14}
              height={fluidHeight}
              rx={7}
              fill={fillGrad}
            />
            {/* Meniscus highlight. */}
            <ellipse
              cx={x}
              cy={140 - fluidHeight + 1.5}
              rx={6}
              ry={1.6}
              fill={HEX.accent2}
              opacity="0.55"
            />
            {/* Falling droplet — different timing per tube. */}
            <motion.circle
              cx={x}
              cy={50}
              r={3}
              fill={i === 1 ? HEX.warning : HEX.accent}
              animate={{
                cy: [40, 138 - fluidHeight, 40],
                opacity: [0.0, 1, 0.0],
              }}
              transition={{
                duration: active ? 1.4 + i * 0.25 : 2.2 + i * 0.35,
                ease: 'easeIn',
                repeat: Infinity,
                delay: i * 0.4,
              }}
            />
            {/* Tube label. */}
            <text
              x={x}
              y={166}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize="8.5"
              fill={HEX.textDim}
              letterSpacing="1.5"
            >
              T{i + 1}
            </text>
          </g>
        );
      })}

      {/* Lab readout strip on the right — fake chemistry values. */}
      <g
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="9.5"
        fill={HEX.text}
      >
        <rect x="220" y="38" width="92" height="106" rx="6" fill={HEX.surface2} stroke={HEX.border} />
        <text x="228" y="56" fill={HEX.textFaint} letterSpacing="2" fontSize="8">
          CHEMISTRY
        </text>
        <text x="228" y="74" fill={HEX.textDim} fontSize="9">
          Risk index
        </text>
        <text x="228" y="88" fill={HEX.accent} fontSize="14" fontWeight="700">
          21
        </text>
        <text x="228" y="106" fill={HEX.textDim} fontSize="9">
          Triggers
        </text>
        <text x="228" y="120" fill={HEX.warning} fontSize="14" fontWeight="700">
          02
        </text>
        <text x="228" y="138" fill={HEX.textFaint} fontSize="8" letterSpacing="1.5">
          REF · 0–35
        </text>
      </g>
    </svg>
  );
}

function UltrasoundIllustration({ active }: { active: boolean }): JSX.Element {
  // Concentric ripple waves emanating from a probe. Probe lives top-left,
  // ripples expand outward and fade out. Beneath, a "depth scale" of
  // numbered millimetre marks.
  const ripples = [0, 1, 2];
  return (
    <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="us-cone" cx="40%" cy="20%" r="80%">
          <stop offset="0%" stopColor={HEX.accent} stopOpacity="0.28" />
          <stop offset="60%" stopColor={HEX.accent} stopOpacity="0.08" />
          <stop offset="100%" stopColor={HEX.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Tissue cone — the ultrasound's classic fan shape. */}
      <path
        d="M 70 28 L 30 168 L 250 168 Z"
        fill="url(#us-cone)"
        stroke={HEX.accent2}
        strokeWidth="0.8"
        opacity="0.65"
      />

      {/* Depth scale on the right side of the cone. */}
      <g
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="8"
        fill={HEX.textFaint}
        letterSpacing="1.5"
      >
        {[40, 80, 120, 160].map((y, i) => (
          <g key={`depth-${i}`}>
            <line x1="252" y1={y} x2="262" y2={y} stroke={HEX.border} strokeWidth="0.8" />
            <text x="266" y={y + 3}>
              {String((i + 1) * 30).padStart(3, '0')}mm
            </text>
          </g>
        ))}
      </g>

      {/* Concentric ripples — expand from the probe. */}
      {ripples.map((i) => (
        <motion.circle
          key={`ripple-${i}`}
          cx={70}
          cy={28}
          r={14}
          fill="none"
          stroke={HEX.accent}
          strokeWidth="1.3"
          initial={{ r: 14, opacity: 0.85 }}
          animate={{ r: [14, 120], opacity: [0.85, 0] }}
          transition={{
            duration: active ? 2.2 : 3.4,
            ease: 'easeOut',
            repeat: Infinity,
            delay: i * (active ? 0.7 : 1.1),
          }}
        />
      ))}

      {/* Tissue echoes — faint dots scattered inside the cone. */}
      <g fill={HEX.accent3} opacity="0.55">
        <circle cx="120" cy="100" r="2" />
        <circle cx="160" cy="130" r="1.6" />
        <circle cx="100" cy="140" r="1.4" />
        <circle cx="170" cy="80" r="1.6" />
        <circle cx="195" cy="120" r="1.8" />
        <circle cx="135" cy="155" r="1.4" />
      </g>

      {/* Probe — sits at top-left with a small handle. */}
      <g>
        <rect x="56" y="14" width="28" height="20" rx="4" fill={HEX.surface2} stroke={HEX.border} />
        <rect x="62" y="6" width="16" height="10" rx="3" fill={HEX.surface} stroke={HEX.border} />
        <circle
          cx={70}
          cy={32}
          r={3}
          fill={HEX.accent}
        />
      </g>

      {/* Probe label. */}
      <text
        x="44"
        y="48"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="8"
        fill={HEX.textFaint}
        letterSpacing="1.5"
      >
        PROBE
      </text>
    </svg>
  );
}

// ===========================================================================
// SECTION 4 — Vitals / EKG band
// ===========================================================================

function VitalsBand({
  runs,
  clock,
}: {
  runs: AgencyToolsData['recentRuns'];
  clock: { tick: number; phase: number; seconds: number };
}): JSX.Element {
  const lineWidth = 1100;
  const lineHeight = 90;
  const samples = 240;

  // Synthesise an ECG-style trace. Heartbeats sit roughly every (samples / beats)
  // samples; each beat is the canonical P/QRS/T wave-let — a small upward bump,
  // a sharp positive spike, then a small downward then upward recovery.
  const ekgPoints = useMemo(() => {
    const beats = 7;
    const phase = clock.phase;
    const baseline = lineHeight * 0.55;
    const amp = lineHeight * 0.35;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < samples; i += 1) {
      const t = (i / samples + phase) % 1;
      const beatX = (t * beats) % 1;
      let v = 0;
      // P wave — gentle pre-spike rise.
      if (beatX > 0.04 && beatX < 0.10) {
        const u = (beatX - 0.04) / 0.06;
        v = Math.sin(u * Math.PI) * 0.15;
      }
      // Q dip — small negative just before the R spike.
      else if (beatX >= 0.10 && beatX < 0.12) {
        const u = (beatX - 0.10) / 0.02;
        v = -u * 0.25;
      }
      // R spike — sharp positive peak.
      else if (beatX >= 0.12 && beatX < 0.15) {
        const u = (beatX - 0.12) / 0.03;
        v = (1 - Math.abs(u - 0.5) * 2) * 1.0;
      }
      // S dip — small negative.
      else if (beatX >= 0.15 && beatX < 0.18) {
        const u = (beatX - 0.15) / 0.03;
        v = -(1 - Math.abs(u - 0.5) * 2) * 0.35;
      }
      // T wave — recovery hump.
      else if (beatX >= 0.22 && beatX < 0.32) {
        const u = (beatX - 0.22) / 0.10;
        v = Math.sin(u * Math.PI) * 0.22;
      }
      // Light noise.
      const noise = Math.sin((i + clock.seconds * 13) * 0.6) * 0.02;
      const y = baseline - (v + noise) * amp;
      const x = (i / (samples - 1)) * lineWidth;
      pts.push({ x, y });
    }
    return pts;
  }, [clock.phase, clock.seconds, lineHeight, lineWidth, samples]);

  const ekgPath = useMemo(() => {
    if (ekgPoints.length === 0) return '';
    const first = ekgPoints[0];
    if (!first) return '';
    const parts = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
    for (let i = 1; i < ekgPoints.length; i += 1) {
      const p = ekgPoints[i];
      if (!p) continue;
      parts.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }
    return parts.join(' ');
  }, [ekgPoints]);

  // Right-edge pulse dot tracks the last point of the trace.
  const lastPoint = ekgPoints[ekgPoints.length - 1] ?? { x: lineWidth, y: lineHeight / 2 };

  // Heartbeat blip column = chronological recent-runs squeezed onto the band.
  const blips = useMemo(() => {
    return runs.slice(0, 14).map((r, i) => ({
      run: r,
      x: 30 + (i / Math.max(1, Math.min(13, runs.length - 1))) * (lineWidth - 60),
    }));
  }, [runs, lineWidth]);

  return (
    <motion.section
      {...fadeUp(0.15)}
      className="relative rounded-2xl border border-border-muted bg-surface/55 px-4 py-3 backdrop-blur-xl"
      aria-label="Vitals band"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
            Vitals band · live trace
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" />
            72 bpm
          </span>
          <span className="text-text-faint">·</span>
          <span>{runs.length} recent reports</span>
        </div>
      </div>

      <div className="relative h-[110px] overflow-hidden rounded-xl border border-border-muted/70 bg-[#08080f]">
        <svg viewBox={`0 0 ${lineWidth} ${lineHeight + 20}`} className="h-full w-full" preserveAspectRatio="none">
          {/* Background grid. */}
          <g stroke={HEX.gridDim} strokeWidth="0.6">
            {Array.from({ length: 10 }, (_, i) => (
              <line key={`vg-${i}`} x1={(i / 10) * lineWidth} y1="0" x2={(i / 10) * lineWidth} y2={lineHeight} />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line key={`hg-${i}`} x1="0" y1={(i / 6) * lineHeight} x2={lineWidth} y2={(i / 6) * lineHeight} />
            ))}
          </g>

          {/* EKG trace. */}
          <path
            d={ekgPath}
            fill="none"
            stroke={HEX.accent}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(242,101,34,0.55))' }}
          />

          {/* Right-edge pulse dot. */}
          <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={HEX.accent} />
          <motion.circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="3"
            fill={HEX.accent}
            opacity="0.45"
            animate={{ r: [3, 10, 3], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
          />

          {/* Run blips along the band — colour-coded by status. */}
          {blips.map(({ run, x }, i) => {
            const c = RUN_STATUS_HEX[run.status];
            const y = lineHeight + 10;
            return (
              <g key={`blip-${run.id}-${i}`}>
                <line x1={x} y1={lineHeight - 4} x2={x} y2={lineHeight + 4} stroke={c} strokeWidth="1.4" />
                <circle cx={x} cy={y} r="2.4" fill={c} />
                {run.status === 'running' && (
                  <motion.circle
                    cx={x}
                    cy={y}
                    r="2.4"
                    fill={c}
                    opacity="0.6"
                    animate={{ r: [2.4, 7, 2.4], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity, delay: i * 0.13 }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend — pure CSS chips, no overlap with the SVG. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-text-dim">
        <BlipLegendChip color={TOK.success} label="Completed" />
        <BlipLegendChip color={TOK.accent} label="Running" pulse />
        <BlipLegendChip color={TOK.warning} label="Pending" />
        <BlipLegendChip color={TOK.danger} label="Flagged" />
        <span className="ml-auto text-text-faint">last 14 reports</span>
      </div>
    </motion.section>
  );
}

function BlipLegendChip({
  color,
  label,
  pulse = false,
}: {
  color: string;
  label: string;
  pulse?: boolean;
}): JSX.Element {
  const style: CSSProperties = { background: color };
  return (
    <span className="inline-flex items-center gap-1.5">
      {pulse ? (
        <motion.span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={style}
          animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
        />
      ) : (
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={style} />
      )}
      {label}
    </span>
  );
}

// ===========================================================================
// SECTION 5 — Case-file panel (right rail)
// ===========================================================================

function CaseFilePanel({
  activePatient,
  runs,
  onCloseDetail,
}: {
  activePatient: SubClient | null;
  runs: AgencyToolsData['recentRuns'];
  onCloseDetail: () => void;
}): JSX.Element {
  if (!activePatient) {
    return (
      <motion.aside
        {...fadeUp(0.12)}
        className="grid h-full min-h-[280px] place-items-center rounded-2xl border border-dashed border-border-muted/80 bg-surface/55 px-4 py-6 text-center backdrop-blur-xl"
        aria-label="Case file"
      >
        <div className="space-y-2">
          <span className="grid h-10 w-10 mx-auto place-items-center rounded-full border border-border-muted bg-surface-2 text-text-dim">
            <FileText className="h-4 w-4" />
          </span>
          <h3 className="text-[13px] font-medium text-text">No case open</h3>
          <p className="font-mono text-[10.5px] leading-relaxed text-text-dim">
            Select a patient from the roster strip to open their case file.
          </p>
        </div>
      </motion.aside>
    );
  }

  const triage = triageFor(activePatient);
  const triageHex = TRIAGE_HEX[triage];
  const patientRuns = runs.filter((r) => r.subClientId === activePatient.id);
  const last = patientRuns[0];

  return (
    <motion.aside
      key={activePatient.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col gap-3 rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl"
      aria-label={`Case file for ${activePatient.name}`}
    >
      {/* Header strip — file label + close button. */}
      <header className="flex items-start justify-between gap-3 border-b border-border-muted/70 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.32em] text-text-faint">
            <FileText className="h-3 w-3" />
            Case file
            <span>·</span>
            <span className="tabular-nums text-text-dim">{patientIdFor(activePatient)}</span>
          </div>
          <h3 className="mt-1 truncate text-[16px] font-semibold tracking-tight text-text">
            {activePatient.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-text-dim">
            {activePatient.domain} · {activePatient.mailboxCount} mailboxes
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseDetail}
          aria-label="Close case file"
          className="grid h-7 w-7 place-items-center rounded-md border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Triage strip — colour-coded status pill + last visit. */}
      <div
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
        style={{
          borderColor: `${triageHex}55`,
          background: `${triageHex}10`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full font-mono text-[10px] font-semibold tabular-nums"
            style={{
              background: `${triageHex}25`,
              color: triageHex,
              boxShadow: `inset 0 0 0 1.5px ${triageHex}80`,
            }}
          >
            {triage === 'critical' ? '!' : triage === 'monitoring' ? '?' : 'OK'}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: triageHex }}>
              {TRIAGE_LABEL[triage]}
            </div>
            <div className="font-mono text-[10px] text-text-dim">Triage classification</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">Last visit</div>
          <div className="font-mono text-[11px] tabular-nums text-text">{last?.startedAt ?? '—'}</div>
        </div>
      </div>

      {/* Medical-form field list — dotted-underline labels, monospace values. */}
      <div className="space-y-2.5">
        <CaseFileRow label="Patient ID" value={patientIdFor(activePatient)} icon={Clipboard} />
        <CaseFileRow label="Admit status" value={STATUS_VERB[activePatient.status]} icon={Bell} />
        <CaseFileRow label="Mailbox flora" value={`${activePatient.mailboxCount} active strains`} icon={Inbox} />
        <CaseFileRow label="Last diagnostic" value={last ? `${INSTRUMENT_META[last.toolSlug].clinicalName} · ${last.startedAt}` : 'No prior tests'} icon={Stethoscope} />
        <CaseFileRow label="Next scheduled" value={schedulingHint(activePatient, patientRuns)} icon={Hourglass} />
      </div>

      {/* Diagnoses summary — chronological recent runs for THIS patient. */}
      <div className="mt-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
            Diagnoses summary
          </span>
          <span className="font-mono text-[9.5px] text-text-faint">
            {patientRuns.length} report{patientRuns.length === 1 ? '' : 's'}
          </span>
        </div>
        {patientRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-muted/70 bg-surface-2/50 px-3 py-3 font-mono text-[10.5px] text-text-faint">
            No diagnostic reports on file. Wheel up an instrument from the bay panel.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {patientRuns.slice(0, 5).map((r) => (
              <DiagnosisRow key={r.id} run={r} />
            ))}
          </ul>
        )}
      </div>

      {/* Spacer + footer prompt. */}
      <div className="mt-auto rounded-lg border border-border-muted/70 bg-surface-2/50 px-3 py-2 font-mono text-[10px] text-text-dim">
        <span className="text-text-faint">Note · </span>
        Run any bay above against this patient. Reports stream live to the vitals band.
      </div>
    </motion.aside>
  );
}

/** Per-status humanised verb shown on the case-file admit-status row. */
const STATUS_VERB: Record<SubClientStatus, string> = {
  active: 'Admitted · stable ward',
  paused: 'Released · holding ward',
  onboarding: 'Admitted · observation ward',
};

function CaseFileRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Stethoscope;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        <Icon className="h-3 w-3" />
        <span
          style={{
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            textDecorationColor: HEX.border,
            textUnderlineOffset: 4,
          }}
        >
          {label}
        </span>
      </span>
      <span className="min-w-0 truncate text-right font-mono text-[11.5px] text-text">{value}</span>
    </div>
  );
}

/** Tiny scheduling hint — synthesised from the patient's latest run pattern. */
function schedulingHint(sub: SubClient, runs: AgencyToolsData['recentRuns']): string {
  const triage = triageFor(sub);
  if (triage === 'critical') return 'Blood panel · ASAP';
  if (triage === 'monitoring') return 'Ultrasound · within 24h';
  const last = runs[0];
  if (!last) return 'X-Ray · routine';
  // Rotate through tools so the user gets variety.
  const idx: Record<ToolSlug, ToolSlug> = {
    preview: 'spam',
    spam: 'placement',
    placement: 'templates',
    templates: 'preview',
  };
  const nextSlug = idx[last.toolSlug];
  return `${INSTRUMENT_META[nextSlug].clinicalName} · 48h`;
}

function DiagnosisRow({ run }: { run: AgencyToolsData['recentRuns'][number] }): JSX.Element {
  const meta = INSTRUMENT_META[run.toolSlug];
  const statusHex = RUN_STATUS_HEX[run.status];
  return (
    <li className="rounded-lg border border-border-muted/70 bg-surface-2/50 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md border"
            style={{
              borderColor: `${statusHex}55`,
              background: `${statusHex}15`,
              color: statusHex,
            }}
          >
            <meta.icon className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11.5px] text-text">{meta.clinicalName}</div>
            <div className="truncate font-mono text-[9.5px] text-text-dim">
              {run.startedAt} · {fmtDuration(run.durationMs)}
            </div>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]"
          style={{
            borderColor: `${statusHex}55`,
            background: `${statusHex}10`,
            color: statusHex,
          }}
        >
          {RUN_STATUS_LABEL[run.status]}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[10px] text-text-dim">{run.summary}</p>
    </li>
  );
}

// ===========================================================================
// SECTION 6 — Suite status footer
// ===========================================================================

function SuiteFooter({ metrics }: { metrics: SuiteMetrics }): JSX.Element {
  return (
    <motion.footer
      {...fadeUp(0.18)}
      className="grid grid-cols-2 gap-3 rounded-2xl border border-border-muted bg-surface/55 p-4 backdrop-blur-xl sm:grid-cols-4"
      aria-label="Suite status footer"
    >
      <FooterStat
        Icon={Hourglass}
        label="Avg wait time"
        value={metrics.avgRunSeconds > 0 ? `${metrics.avgRunSeconds}s` : '—'}
        sub="end-to-end scan"
      />
      <FooterStat
        Icon={Cpu}
        label="Machines online"
        value={`${metrics.availableMachines}/${metrics.totalMachines}`}
        sub="bays operational"
      />
      <FooterStat
        Icon={Inbox}
        label="Tests in queue"
        value={fmtInt(metrics.queued)}
        sub="awaiting probe slot"
      />
      <FooterStat
        Icon={ShieldCheck}
        label="Success rate"
        value={fmtPct(metrics.successRate * 100, 1)}
        sub="last 30 reports"
      />
    </motion.footer>
  );
}

function FooterStat({
  Icon,
  label,
  value,
  sub,
}: {
  Icon: typeof Stethoscope;
  label: string;
  value: string;
  sub: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/55 px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.28em] text-text-faint">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-text">{value}</div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-dim">{sub}</div>
    </div>
  );
}
