import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock,
  Command,
  Cpu,
  Eye,
  FileEdit,
  Filter,
  Gauge,
  Globe2,
  HardDriveDownload,
  Headphones,
  Hexagon,
  Inbox,
  Layers,
  MonitorSpeaker,
  Pause,
  Pencil,
  Power,
  Radar,
  Radio,
  Repeat2,
  Rocket,
  ScanLine,
  Settings2,
  ShieldCheck,
  Signal,
  Sparkles,
  Target,
  Terminal,
  Timer,
  Users,
  Wand2,
  Wifi,
  Workflow,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgTolT1Cockpit — Agency Tools candidate T1, "Operator Cockpit".
 *
 * /app/tools rendered as a mission-control instrument panel for the agency
 * operator. Each warmup tool (Preview / Templates / Spam Scanner / Placement
 * Tester) is a workstation card with a 3-char callsign, status LED, last
 * run telemetry, and a big orange LAUNCH button. The operator selects a
 * sub-client from a horizontal pill strip — that "arms" all stations toward
 * that target. A live run-queue rail streams active and recently completed
 * runs with pulsing status dots; a telemetry footer summarises queue depth,
 * success rate, average duration, and tool availability.
 *
 * Layout (top → bottom):
 *   1. COCKPIT HEADER BAND — agency name, region, OPERATOR ON DUTY pill,
 *      live HH:MM:SS UTC clock, 4 mono summary stats (runs today, queued,
 *      30d total, avg placement score).
 *   2. SUB-CLIENT SELECTOR STRIP — horizontal scroll row of pills, "ALL"
 *      first then one pill per sub-client. Selection is spring-animated and
 *      "arms" the launch buttons below for that target.
 *   3. TOOL STATIONS GRID — four instrument-panel cards: Preview (PRV),
 *      Templates (TPL), Spam (SPM), Placement (PLM). Each panel shows a
 *      large icon, 3-char code, name, description, status LED, last-run
 *      timestamp, 30d run count, and a big orange LAUNCH button (read-only).
 *   4. LIVE QUEUE PANEL — recent-runs ticker with filter pills (All /
 *      Preview / Templates / Spam / Placement). Running entries pulse;
 *      completed entries fade in.
 *   5. COCKPIT FOOTER TELEMETRY STRIP — queue depth, success %, avg
 *      duration, tools available.
 *
 * STANDALONE: accepts `data?: AgencyToolsData`; falls back to a Northwind
 * Agency MOCK so the preview harness can mount it prop-less. Renders only
 * the page content — the surrounding app shell supplies sidebar / chrome.
 *
 * Visual rules: Shailog orange palette via CSS vars only. No violet, blue,
 * indigo, cyan, teal, mint hex. Green / red appear ONLY as status semantics
 * (success / fail).
 */

// ---------------------------------------------------------------------------
// Public data shape — defined HERE; sibling Tools candidates (T2/T3/T4)
// type-import from this file.
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
// MOCK — Northwind Agency, 8 sub-clients with realistic recent runs
// ---------------------------------------------------------------------------

const NOW_MS = Date.parse('2026-05-29T14:38:00.000Z');

function isoFromOffset(offsetMs: number): string {
  return new Date(NOW_MS + offsetMs).toISOString();
}

const MOCK: AgencyToolsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: [
    { id: 'helix', name: 'Helix Outbound', domain: 'send.helix.io', mailboxCount: 12, status: 'active' },
    { id: 'nimbus', name: 'Nimbus Reach', domain: 'mail.nimbusreach.com', mailboxCount: 9, status: 'active' },
    { id: 'orion', name: 'Orion Mail', domain: 'out.orionmail.co', mailboxCount: 7, status: 'active' },
    { id: 'vega', name: 'Vega Sends', domain: 'sx.vegasends.com', mailboxCount: 6, status: 'active' },
    { id: 'quasar', name: 'Quasar Studio', domain: 'send.quasarstudio.com', mailboxCount: 5, status: 'active' },
    { id: 'lyra', name: 'Lyra Pipeline', domain: 'mx.lyrapipeline.io', mailboxCount: 4, status: 'paused' },
    { id: 'pixel', name: 'Pixel Drop', domain: 'out.pixeldrop.co', mailboxCount: 3, status: 'onboarding' },
    { id: 'atlas', name: 'Atlas Bio', domain: 'send.atlasbio.co', mailboxCount: 4, status: 'active' },
  ],
  tools: [
    { slug: 'preview', name: 'Warmup Preview', short: 'PRV', description: 'Render warmup conversations as they will appear in Gmail, Outlook, and Yahoo before they ship.', lastRunAt: isoFromOffset(-1000 * 60 * 18), runsLast30d: 412, available: true },
    { slug: 'templates', name: 'Template Designer', short: 'TPL', description: 'Author and A/B test warmup thread templates with live variable substitution and tone presets.', lastRunAt: isoFromOffset(-1000 * 60 * 64), runsLast30d: 187, available: true },
    { slug: 'spam', name: 'Spam Scanner', short: 'SPM', description: 'Run a per-mailbox SpamAssassin pass and surface header, body, and reputation triggers with fix tips.', lastRunAt: isoFromOffset(-1000 * 60 * 6), runsLast30d: 298, available: true },
    { slug: 'placement', name: 'Placement Tester', short: 'PLM', description: 'Live seed-list run across 26 inboxes; reports Inbox / Tabs / Spam / Blocked split per provider.', lastRunAt: isoFromOffset(-1000 * 60 * 33), runsLast30d: 156, available: true },
  ],
  recentRuns: [
    { id: 'r-001', toolSlug: 'placement', subClientId: 'helix', subClientName: 'Helix Outbound', startedAt: isoFromOffset(-1000 * 25), status: 'running', summary: 'Seeding 26 inboxes · 14 returned', durationMs: 25000 },
    { id: 'r-002', toolSlug: 'spam', subClientId: 'pixel', subClientName: 'Pixel Drop', startedAt: isoFromOffset(-1000 * 52), status: 'running', summary: 'Headers OK · Body 2 flags · Auth pending', durationMs: 52000 },
    { id: 'r-003', toolSlug: 'preview', subClientId: 'atlas', subClientName: 'Atlas Bio', startedAt: isoFromOffset(-1000 * 78), status: 'running', summary: 'Rendering 4 threads · 1 of 3 providers done', durationMs: 78000 },
    { id: 'r-004', toolSlug: 'placement', subClientId: 'nimbus', subClientName: 'Nimbus Reach', startedAt: isoFromOffset(-1000 * 60 * 6), status: 'completed', summary: 'Inbox 94.2% · Spam 1.4% · Blocked 0.4%', durationMs: 4 * 60 * 1000 + 22 * 1000 },
    { id: 'r-005', toolSlug: 'spam', subClientId: 'orion', subClientName: 'Orion Mail', startedAt: isoFromOffset(-1000 * 60 * 11), status: 'completed', summary: 'Score 2.1 · Pass · 0 critical · 1 warning', durationMs: 38 * 1000 },
    { id: 'r-006', toolSlug: 'preview', subClientId: 'vega', subClientName: 'Vega Sends', startedAt: isoFromOffset(-1000 * 60 * 17), status: 'completed', summary: 'Rendered 6 threads across 3 providers', durationMs: 1 * 60 * 1000 + 14 * 1000 },
    { id: 'r-007', toolSlug: 'templates', subClientId: 'quasar', subClientName: 'Quasar Studio', startedAt: isoFromOffset(-1000 * 60 * 22), status: 'completed', summary: 'Compiled 3 variants · 12 mail-merge tokens OK', durationMs: 22 * 1000 },
    { id: 'r-008', toolSlug: 'placement', subClientId: 'atlas', subClientName: 'Atlas Bio', startedAt: isoFromOffset(-1000 * 60 * 31), status: 'failed', summary: 'Seed mailbox 11 timed out · partial result', durationMs: 6 * 60 * 1000 + 4 * 1000 },
    { id: 'r-009', toolSlug: 'preview', subClientId: 'lyra', subClientName: 'Lyra Pipeline', startedAt: isoFromOffset(-1000 * 60 * 41), status: 'completed', summary: 'Rendered 4 threads · variables resolved', durationMs: 58 * 1000 },
    { id: 'r-010', toolSlug: 'spam', subClientId: 'helix', subClientName: 'Helix Outbound', startedAt: isoFromOffset(-1000 * 60 * 49), status: 'completed', summary: 'Score 1.4 · Pass · 0 critical · 0 warning', durationMs: 31 * 1000 },
    { id: 'r-011', toolSlug: 'placement', subClientId: 'quasar', subClientName: 'Quasar Studio', startedAt: isoFromOffset(-1000 * 60 * 58), status: 'completed', summary: 'Inbox 91.0% · Spam 2.3% · Blocked 0.6%', durationMs: 5 * 60 * 1000 + 9 * 1000 },
    { id: 'r-012', toolSlug: 'templates', subClientId: 'pixel', subClientName: 'Pixel Drop', startedAt: isoFromOffset(-1000 * 60 * 64), status: 'completed', summary: 'Designed 1 new variant · 8 tokens OK', durationMs: 18 * 1000 },
    { id: 'r-013', toolSlug: 'preview', subClientId: 'helix', subClientName: 'Helix Outbound', startedAt: isoFromOffset(-1000 * 60 * 73), status: 'completed', summary: 'Rendered 8 threads · all clean', durationMs: 1 * 60 * 1000 + 41 * 1000 },
    { id: 'r-014', toolSlug: 'spam', subClientId: 'nimbus', subClientName: 'Nimbus Reach', startedAt: isoFromOffset(-1000 * 60 * 84), status: 'completed', summary: 'Score 1.8 · Pass · 0 critical · 2 warning', durationMs: 42 * 1000 },
    { id: 'r-015', toolSlug: 'placement', subClientId: 'vega', subClientName: 'Vega Sends', startedAt: isoFromOffset(-1000 * 60 * 96), status: 'completed', summary: 'Inbox 88.7% · Spam 3.1% · Blocked 0.8%', durationMs: 4 * 60 * 1000 + 47 * 1000 },
    { id: 'r-016', toolSlug: 'preview', subClientId: 'orion', subClientName: 'Orion Mail', startedAt: isoFromOffset(-1000 * 60 * 107), status: 'completed', summary: 'Rendered 5 threads · 1 truncated', durationMs: 1 * 60 * 1000 + 3 * 1000 },
    { id: 'r-017', toolSlug: 'templates', subClientId: 'helix', subClientName: 'Helix Outbound', startedAt: isoFromOffset(-1000 * 60 * 116), status: 'completed', summary: 'Compiled 2 variants · split test ready', durationMs: 19 * 1000 },
    { id: 'r-018', toolSlug: 'placement', subClientId: 'lyra', subClientName: 'Lyra Pipeline', startedAt: isoFromOffset(-1000 * 60 * 128), status: 'failed', summary: 'DNS resolution timeout · retry pending', durationMs: 2 * 60 * 1000 + 11 * 1000 },
    { id: 'r-019', toolSlug: 'spam', subClientId: 'vega', subClientName: 'Vega Sends', startedAt: isoFromOffset(-1000 * 60 * 138), status: 'completed', summary: 'Score 2.4 · Pass · 0 critical · 1 warning', durationMs: 35 * 1000 },
    { id: 'r-020', toolSlug: 'preview', subClientId: 'nimbus', subClientName: 'Nimbus Reach', startedAt: isoFromOffset(-1000 * 60 * 149), status: 'completed', summary: 'Rendered 6 threads · variables resolved', durationMs: 1 * 60 * 1000 + 22 * 1000 },
  ],
  summary: {
    totalRunsToday: 47,
    totalRuns30d: 1053,
    avgPlacementScore: 91.4,
    queuedRuns: 3,
  },
};

// ---------------------------------------------------------------------------
// Theme tokens — central place to wire CSS vars, so consumers can swap.
// ---------------------------------------------------------------------------

const TOKENS = {
  bg: 'var(--wp-bg, #0a0a0f)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  border: 'var(--wp-border, #2a2a3a)',
  borderStrong: 'var(--wp-border-strong, #3a3a4a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accent3: 'var(--wp-accent-3, #FF9670)',
  success: 'var(--wp-success, #3ddc97)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
} as const;

const MONO_FONT: CSSProperties = {
  fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  fontVariantNumeric: 'tabular-nums',
};

// ---------------------------------------------------------------------------
// Helpers — formatters and run-derived projections
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function fmtInt(n: number): string {
  return formatNumber(n);
}

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

function fmtRelative(iso: string | null, nowMs: number): string {
  if (iso == null) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const diff = Math.max(0, nowMs - t);
  if (diff < 1000) return 'just now';
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function fmtClockUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function fmtDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Map slug → icon class. Use Pencil for "Spam" per brief; PRV uses Eye,
// TPL uses FileEdit, PLM uses Target.
const TOOL_ICON: Record<ToolSlug, typeof Eye> = {
  preview: Eye,
  templates: FileEdit,
  spam: Pencil,
  placement: Target,
};

const TOOL_LONG_LABEL: Record<ToolSlug, string> = {
  preview: 'PREVIEW STATION',
  templates: 'TEMPLATE BAY',
  spam: 'SPAM ANALYZER',
  placement: 'PLACEMENT GRID',
};

const TOOL_ACCENT: Record<ToolSlug, string> = {
  preview: TOKENS.accent,
  templates: TOKENS.accent2,
  spam: TOKENS.accent3,
  placement: TOKENS.accent,
};

const STATUS_LED_COLOR: Record<ToolRunStatus, string> = {
  pending: TOKENS.warning,
  running: TOKENS.accent2,
  completed: TOKENS.success,
  failed: TOKENS.danger,
};

const STATUS_LABEL: Record<ToolRunStatus, string> = {
  pending: 'PENDING',
  running: 'RUNNING',
  completed: 'COMPLETE',
  failed: 'FAILED',
};

const SUBCLIENT_DOT: Record<AgencyToolsData['subClients'][number]['status'], string> = {
  active: TOKENS.accent,
  paused: TOKENS.warning,
  onboarding: TOKENS.accent2,
};

// ---------------------------------------------------------------------------
// useTickingClock — re-renders every second with the current UTC time.
// Pure cosmetic; cleans up on unmount.
// ---------------------------------------------------------------------------

function useTickingClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date(NOW_MS));
  useEffect(() => {
    const id = window.setInterval(() => setNow((prev) => new Date(prev.getTime() + 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// Derived: per-tool last-run status, used for the panel LED
// ---------------------------------------------------------------------------

function deriveToolStatus(
  slug: ToolSlug,
  runs: AgencyToolsData['recentRuns'],
): ToolRunStatus {
  const last = runs.find((r) => r.toolSlug === slug);
  return last ? last.status : 'pending';
}

function deriveToolRunning(
  slug: ToolSlug,
  runs: AgencyToolsData['recentRuns'],
): number {
  return runs.filter((r) => r.toolSlug === slug && r.status === 'running').length;
}

// ---------------------------------------------------------------------------
// Sub-component: CockpitHeader
// ---------------------------------------------------------------------------

interface CockpitHeaderProps {
  agencyName: string;
  region: string;
  summary: AgencyToolsData['summary'];
  totalSubClients: number;
}

function CockpitHeader({
  agencyName,
  region,
  summary,
  totalSubClients,
}: CockpitHeaderProps): JSX.Element {
  const now = useTickingClock();
  return (
    <header
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(135deg, color-mix(in srgb, ${TOKENS.accent} 8%, transparent) 0%, transparent 38%, color-mix(in srgb, ${TOKENS.surface} 96%, transparent) 100%), ${TOKENS.surface}`,
      }}
    >
      {/* Background instrument grid — subtle dashed lines for cockpit texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, color-mix(in srgb, ${TOKENS.accent} 4%, transparent) 0px, color-mix(in srgb, ${TOKENS.accent} 4%, transparent) 1px, transparent 1px, transparent 96px), repeating-linear-gradient(0deg, color-mix(in srgb, ${TOKENS.accent} 3%, transparent) 0px, color-mix(in srgb, ${TOKENS.accent} 3%, transparent) 1px, transparent 1px, transparent 48px)`,
          opacity: 0.55,
        }}
      />
      {/* Top scanline streak */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${TOKENS.accent}, transparent)`,
          opacity: 0.7,
        }}
      />
      <div className="relative grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: `color-mix(in srgb, ${TOKENS.accent} 40%, transparent)`,
              background: `color-mix(in srgb, ${TOKENS.accent} 16%, ${TOKENS.surface2})`,
              boxShadow: `0 0 28px color-mix(in srgb, ${TOKENS.accent} 18%, transparent)`,
            }}
          >
            <Command size={26} strokeWidth={1.7} style={{ color: TOKENS.accent }} />
            <motion.span
              aria-hidden
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full"
              style={{
                background: TOKENS.success,
                boxShadow: `0 0 10px color-mix(in srgb, ${TOKENS.success} 80%, transparent)`,
              }}
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <div className="min-w-0 flex flex-col">
            <div
              className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]"
              style={{ color: TOKENS.textFaint, ...MONO_FONT }}
            >
              <Radio size={10} strokeWidth={2.2} />
              AGENCY TOOLS · OPERATOR CONSOLE
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <div
                className="truncate text-xl font-semibold tracking-tight"
                style={{ color: TOKENS.text }}
              >
                {agencyName}
              </div>
              <div
                className="flex items-center gap-1 text-[11px] uppercase tracking-wider"
                style={{ color: TOKENS.textDim, ...MONO_FONT }}
              >
                <Globe2 size={11} strokeWidth={2} />
                {region}
              </div>
              <div
                className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]"
                style={{
                  borderColor: `color-mix(in srgb, ${TOKENS.accent} 35%, transparent)`,
                  background: `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)`,
                  color: TOKENS.accent2,
                  ...MONO_FONT,
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: TOKENS.accent,
                    boxShadow: `0 0 6px color-mix(in srgb, ${TOKENS.accent} 80%, transparent)`,
                  }}
                />
                Operator on duty
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.18em]"
              style={{ color: TOKENS.textFaint, ...MONO_FONT }}>
              <span className="flex items-center gap-1">
                <Users size={10} strokeWidth={2.2} />
                {fmtInt(totalSubClients)} sub-clients
              </span>
              <span aria-hidden style={{ color: TOKENS.borderStrong }}>·</span>
              <span className="flex items-center gap-1">
                <Workflow size={10} strokeWidth={2.2} />
                4 stations armed
              </span>
              <span aria-hidden style={{ color: TOKENS.borderStrong }}>·</span>
              <span className="flex items-center gap-1">
                <Signal size={10} strokeWidth={2.2} />
                Telemetry live
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-2 lg:gap-3">
          <ClockBlock now={now} />
          <SummaryStat
            label="Runs today"
            value={fmtInt(summary.totalRunsToday)}
            Icon={Activity}
            accent={TOKENS.accent}
          />
          <SummaryStat
            label="Queued"
            value={fmtInt(summary.queuedRuns)}
            Icon={Timer}
            accent={TOKENS.warning}
          />
          <SummaryStat
            label="30d runs"
            value={fmtInt(summary.totalRuns30d)}
            Icon={Repeat2}
            accent={TOKENS.accent2}
          />
          <SummaryStat
            label="Avg placement"
            value={fmtPct(summary.avgPlacementScore)}
            Icon={Gauge}
            accent={TOKENS.success}
          />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ClockBlock — live HH:MM:SS UTC, ticks every second
// ---------------------------------------------------------------------------

function ClockBlock({ now }: { now: Date }): JSX.Element {
  return (
    <div
      className="flex min-w-[160px] flex-col items-start justify-center rounded-xl border px-3 py-2"
      style={{
        borderColor: TOKENS.border,
        background: `color-mix(in srgb, ${TOKENS.surface2} 80%, transparent)`,
      }}
    >
      <div
        className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        <Clock size={9} strokeWidth={2.2} />
        Mission clock · UTC
      </div>
      <div
        className="mt-0.5 text-2xl font-semibold leading-none"
        style={{ color: TOKENS.text, ...MONO_FONT }}
      >
        {fmtClockUtc(now)}
      </div>
      <div
        className="mt-1 text-[10px] uppercase tracking-[0.18em]"
        style={{ color: TOKENS.textDim, ...MONO_FONT }}
      >
        {fmtDateUtc(now)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SummaryStat — single mono numeric tile for the header band
// ---------------------------------------------------------------------------

interface SummaryStatProps {
  label: string;
  value: string;
  Icon: typeof Activity;
  accent: string;
}

function SummaryStat({ label, value, Icon, accent }: SummaryStatProps): JSX.Element {
  return (
    <div
      className="relative flex min-w-[130px] flex-col items-start justify-center overflow-hidden rounded-xl border px-3 py-2"
      style={{
        borderColor: TOKENS.border,
        background: `color-mix(in srgb, ${TOKENS.surface2} 80%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -top-3 h-12 w-12 rounded-full opacity-30"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${accent} 35%, transparent), transparent 70%)`,
        }}
      />
      <div
        className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        <Icon size={9} strokeWidth={2.4} style={{ color: accent }} />
        {label}
      </div>
      <div
        className="mt-0.5 text-2xl font-semibold leading-none"
        style={{ color: TOKENS.text, ...MONO_FONT }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SubClientSelector — horizontal pill strip
// ---------------------------------------------------------------------------

interface SubClientSelectorProps {
  subClients: AgencyToolsData['subClients'];
  selected: string;
  onSelect: (id: string) => void;
}

function SubClientSelector({
  subClients,
  selected,
  onSelect,
}: SubClientSelectorProps): JSX.Element {
  const totalMailboxes = useMemo(
    () => subClients.reduce((sum, c) => sum + c.mailboxCount, 0),
    [subClients],
  );

  return (
    <section
      className="relative rounded-2xl border"
      style={{
        borderColor: TOKENS.border,
        background: TOKENS.surface,
      }}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <div
          className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em]"
          style={{ color: TOKENS.textFaint, ...MONO_FONT }}
        >
          <Building2 size={11} strokeWidth={2.2} style={{ color: TOKENS.accent }} />
          Target sub-client · arm stations
        </div>
        <div
          className="flex items-center gap-3 text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: TOKENS.textDim, ...MONO_FONT }}
        >
          <span className="flex items-center gap-1">
            <Inbox size={10} strokeWidth={2.2} />
            {fmtInt(totalMailboxes)} mailboxes
          </span>
          <span aria-hidden style={{ color: TOKENS.borderStrong }}>·</span>
          <span className="flex items-center gap-1">
            <Filter size={10} strokeWidth={2.2} />
            Selection persists across stations
          </span>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: TOKENS.border }}>
        <div className="flex items-center gap-2 overflow-x-auto px-5 py-3"
          style={{ scrollbarWidth: 'none' }}>
          <SubClientPill
            id="__all__"
            label="All sub-clients"
            sub={`${fmtInt(subClients.length)} targets`}
            mailboxCount={totalMailboxes}
            dotColor={TOKENS.accent}
            isAll
            selected={selected === '__all__'}
            onClick={() => onSelect('__all__')}
          />
          <div
            aria-hidden
            className="mx-1 h-8 w-px shrink-0"
            style={{ background: TOKENS.border }}
          />
          {subClients.map((c) => (
            <SubClientPill
              key={c.id}
              id={c.id}
              label={c.name}
              sub={c.domain}
              mailboxCount={c.mailboxCount}
              dotColor={SUBCLIENT_DOT[c.status]}
              selected={selected === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface SubClientPillProps {
  id: string;
  label: string;
  sub: string;
  mailboxCount: number;
  dotColor: string;
  selected: boolean;
  isAll?: boolean;
  onClick: () => void;
}

function SubClientPill({
  id,
  label,
  sub,
  mailboxCount,
  dotColor,
  selected,
  isAll = false,
  onClick,
}: SubClientPillProps): JSX.Element {
  void id;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      animate={{
        scale: selected ? 1.02 : 1,
      }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      className="group relative flex shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors"
      style={{
        borderColor: selected
          ? `color-mix(in srgb, ${TOKENS.accent} 60%, transparent)`
          : TOKENS.border,
        background: selected
          ? `linear-gradient(135deg, color-mix(in srgb, ${TOKENS.accent} 18%, transparent), color-mix(in srgb, ${TOKENS.accent} 6%, transparent))`
          : `color-mix(in srgb, ${TOKENS.surface2} 70%, transparent)`,
        boxShadow: selected
          ? `0 0 0 1px color-mix(in srgb, ${TOKENS.accent} 40%, transparent), 0 6px 18px color-mix(in srgb, ${TOKENS.accent} 20%, transparent)`
          : 'none',
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{
          background: dotColor,
          boxShadow: selected
            ? `0 0 8px ${dotColor}, 0 0 14px color-mix(in srgb, ${dotColor} 60%, transparent)`
            : `0 0 6px color-mix(in srgb, ${dotColor} 55%, transparent)`,
        }}
      />
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[12px] font-semibold tracking-tight"
            style={{ color: selected ? TOKENS.text : TOKENS.textDim }}
          >
            {label}
          </span>
          {isAll && (
            <span
              className="rounded-sm px-1 text-[8.5px] uppercase tracking-[0.18em]"
              style={{
                background: `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)`,
                color: TOKENS.accent2,
                ...MONO_FONT,
              }}
            >
              BATCH
            </span>
          )}
        </div>
        <span
          className="text-[10.5px] uppercase tracking-[0.16em]"
          style={{ color: TOKENS.textFaint, ...MONO_FONT }}
        >
          {sub} · {fmtInt(mailboxCount)} mbx
        </span>
      </div>
      {selected && (
        <motion.span
          layoutId="active-pill-ring"
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-3 right-3 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${TOKENS.accent}, transparent)`,
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        />
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ToolStationCard — instrument panel for one tool
// ---------------------------------------------------------------------------

interface ToolStationCardProps {
  tool: AgencyToolsData['tools'][number];
  derivedStatus: ToolRunStatus;
  runningCount: number;
  selectedTargetLabel: string;
  nowMs: number;
}

function ToolStationCard({
  tool,
  derivedStatus,
  runningCount,
  selectedTargetLabel,
  nowMs,
}: ToolStationCardProps): JSX.Element {
  const Icon = TOOL_ICON[tool.slug];
  const ledColor = STATUS_LED_COLOR[derivedStatus];
  const stationAccent = TOOL_ACCENT[tool.slug];
  const labelLong = TOOL_LONG_LABEL[tool.slug];

  // Derived: 30d ramp dots — small visual ladder beneath the metrics row.
  const rampDots = useMemo(() => {
    const max = Math.max(tool.runsLast30d, 1);
    return Array.from({ length: 14 }, (_, i) => {
      const phase = (i + 1) / 14;
      const v = Math.sin(phase * Math.PI) * 0.45 + 0.55;
      const intensity = clamp(v + (max / 1000) * 0.15, 0.2, 1);
      return intensity;
    });
  }, [tool.runsLast30d]);

  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(180deg, ${TOKENS.surface} 0%, color-mix(in srgb, ${TOKENS.surface} 90%, ${TOKENS.surface2}) 100%)`,
      }}
    >
      {/* Top instrument ribbon */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${stationAccent}, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-30"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${stationAccent} 30%, transparent), transparent 70%)`,
        }}
      />
      {/* Header — short code + name + LED */}
      <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl border"
            style={{
              borderColor: `color-mix(in srgb, ${stationAccent} 35%, transparent)`,
              background: `color-mix(in srgb, ${stationAccent} 16%, ${TOKENS.surface2})`,
              boxShadow: `0 0 18px color-mix(in srgb, ${stationAccent} 18%, transparent)`,
            }}
          >
            <Icon size={22} strokeWidth={1.7} style={{ color: stationAccent }} />
          </div>
          <div className="flex flex-col">
            <span
              className="text-[10px] uppercase tracking-[0.22em]"
              style={{ color: TOKENS.textFaint, ...MONO_FONT }}
            >
              {labelLong}
            </span>
            <span
              className="text-[24px] font-semibold leading-none tracking-tight"
              style={{ color: TOKENS.text, ...MONO_FONT }}
            >
              {tool.short}
            </span>
          </div>
        </div>
        <StatusLed status={derivedStatus} color={ledColor} />
      </div>
      <div className="relative flex flex-1 flex-col gap-4 px-5 pb-5 pt-3">
        <div>
          <div
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: TOKENS.text }}
          >
            {tool.name}
          </div>
          <p
            className="mt-1.5 text-[12.5px] leading-relaxed"
            style={{ color: TOKENS.textDim }}
          >
            {tool.description}
          </p>
        </div>
        {/* Telemetry rows */}
        <div className="grid grid-cols-2 gap-2">
          <StationMetric
            label="Last run"
            value={fmtRelative(tool.lastRunAt, nowMs)}
            Icon={Clock}
            tone={TOKENS.text}
            mono
          />
          <StationMetric
            label="30d runs"
            value={fmtInt(tool.runsLast30d)}
            Icon={Repeat2}
            tone={TOKENS.text}
            mono
          />
          <StationMetric
            label="Active queue"
            value={runningCount > 0 ? `${runningCount} running` : 'idle'}
            Icon={Activity}
            tone={runningCount > 0 ? TOKENS.accent2 : TOKENS.textDim}
            mono
          />
          <StationMetric
            label="Armed for"
            value={selectedTargetLabel}
            Icon={Target}
            tone={TOKENS.accent}
            mono
          />
        </div>
        {/* Ramp ladder */}
        <div className="flex items-end gap-1.5">
          {rampDots.map((v, i) => (
            <div
              key={i}
              className="h-6 w-2 rounded-sm"
              style={{
                background: `linear-gradient(180deg, color-mix(in srgb, ${stationAccent} ${Math.round(
                  v * 75,
                )}%, transparent), color-mix(in srgb, ${stationAccent} ${Math.round(v * 25)}%, transparent))`,
                opacity: 0.4 + v * 0.6,
              }}
            />
          ))}
          <span
            className="ml-1 self-end pb-0.5 text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: TOKENS.textFaint, ...MONO_FONT }}
          >
            30D
          </span>
        </div>
        {/* Launch button */}
        <LaunchButton accent={stationAccent} disabled={!tool.available} />
      </div>
      {/* Bottom serial-number strip */}
      <div
        className="relative flex items-center justify-between border-t px-5 py-2 text-[9.5px] uppercase tracking-[0.22em]"
        style={{
          borderColor: TOKENS.border,
          background: `color-mix(in srgb, ${TOKENS.surface2} 70%, transparent)`,
          color: TOKENS.textFaint,
          ...MONO_FONT,
        }}
      >
        <span className="flex items-center gap-1">
          <Hexagon size={9} strokeWidth={2.2} />
          STATION · WP-{tool.short}-001
        </span>
        <span className="flex items-center gap-1">
          <Cpu size={9} strokeWidth={2.2} />
          {tool.available ? 'NOMINAL' : 'OFFLINE'}
        </span>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: StationMetric — single label/value pair inside a station
// ---------------------------------------------------------------------------

interface StationMetricProps {
  label: string;
  value: string;
  Icon: typeof Activity;
  tone: string;
  mono?: boolean;
}

function StationMetric({ label, value, Icon, tone, mono = false }: StationMetricProps): JSX.Element {
  return (
    <div
      className="flex flex-col rounded-lg border px-2.5 py-2"
      style={{
        borderColor: TOKENS.border,
        background: `color-mix(in srgb, ${TOKENS.surface2} 65%, transparent)`,
      }}
    >
      <span
        className="flex items-center gap-1 text-[9px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        <Icon size={9} strokeWidth={2.4} />
        {label}
      </span>
      <span
        className="mt-0.5 truncate text-[12px] font-medium leading-snug"
        style={{ color: tone, ...(mono ? MONO_FONT : undefined) }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: StatusLed — small filled dot + label, with breathe pulse
// ---------------------------------------------------------------------------

interface StatusLedProps {
  status: ToolRunStatus;
  color: string;
}

function StatusLed({ status, color }: StatusLedProps): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <motion.span
        aria-hidden
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{
          background: color,
          filter: `drop-shadow(0 0 6px ${color})`,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span
        className="text-[9.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textDim, ...MONO_FONT }}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: LaunchButton — orange-tinted CTA with hover scale + glow
// ---------------------------------------------------------------------------

interface LaunchButtonProps {
  accent: string;
  disabled: boolean;
}

function LaunchButton({ accent, disabled }: LaunchButtonProps): JSX.Element {
  return (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-label="Launch tool — read-only preview"
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.015 } : undefined}
      whileTap={!disabled ? { scale: 0.985 } : undefined}
      className="group/launch relative mt-1 flex items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left"
      style={{
        borderColor: disabled
          ? TOKENS.border
          : `color-mix(in srgb, ${accent} 55%, transparent)`,
        background: disabled
          ? `color-mix(in srgb, ${TOKENS.surface2} 80%, transparent)`
          : `linear-gradient(135deg, color-mix(in srgb, ${accent} 25%, ${TOKENS.surface2}) 0%, color-mix(in srgb, ${accent} 10%, ${TOKENS.surface2}) 100%)`,
        boxShadow: disabled
          ? 'none'
          : `0 0 0 1px color-mix(in srgb, ${accent} 32%, transparent), 0 6px 24px color-mix(in srgb, ${accent} 18%, transparent)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {!disabled && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
          style={{
            background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accent} 30%, transparent), transparent)`,
          }}
          initial={{ x: '-30%' }}
          whileHover={{ x: '430%' }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}
      <span className="flex items-center gap-2">
        <Rocket
          size={16}
          strokeWidth={2.2}
          style={{ color: disabled ? TOKENS.textFaint : TOKENS.text }}
        />
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: disabled ? TOKENS.textFaint : TOKENS.text, ...MONO_FONT }}
        >
          {disabled ? 'Station offline' : 'Launch station'}
        </span>
      </span>
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md border"
        style={{
          borderColor: disabled
            ? TOKENS.border
            : `color-mix(in srgb, ${accent} 45%, transparent)`,
          background: disabled
            ? 'transparent'
            : `color-mix(in srgb, ${accent} 24%, transparent)`,
        }}
      >
        <ArrowRight
          size={14}
          strokeWidth={2.4}
          style={{ color: disabled ? TOKENS.textFaint : TOKENS.text }}
        />
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ToolStationsGrid — the four cards in a 4-col layout
// ---------------------------------------------------------------------------

interface ToolStationsGridProps {
  tools: AgencyToolsData['tools'];
  recentRuns: AgencyToolsData['recentRuns'];
  selectedTargetLabel: string;
  nowMs: number;
}

function ToolStationsGrid({
  tools,
  recentRuns,
  selectedTargetLabel,
  nowMs,
}: ToolStationsGridProps): JSX.Element {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tools.map((tool) => (
        <ToolStationCard
          key={tool.slug}
          tool={tool}
          derivedStatus={deriveToolStatus(tool.slug, recentRuns)}
          runningCount={deriveToolRunning(tool.slug, recentRuns)}
          selectedTargetLabel={selectedTargetLabel}
          nowMs={nowMs}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: QueueFilterPills — All / Preview / Templates / Spam /
//   Placement filter for the live queue
// ---------------------------------------------------------------------------

type QueueFilter = 'all' | ToolSlug;

interface QueueFilterPillsProps {
  filter: QueueFilter;
  onSelect: (next: QueueFilter) => void;
  counts: Record<QueueFilter, number>;
}

function QueueFilterPills({ filter, onSelect, counts }: QueueFilterPillsProps): JSX.Element {
  const items: Array<{ key: QueueFilter; label: string; Icon: typeof Activity }> = [
    { key: 'all', label: 'All', Icon: Layers },
    { key: 'preview', label: 'Preview', Icon: Eye },
    { key: 'templates', label: 'Templates', Icon: FileEdit },
    { key: 'spam', label: 'Spam', Icon: Pencil },
    { key: 'placement', label: 'Placement', Icon: Target },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => {
        const active = filter === item.key;
        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            whileTap={{ scale: 0.96 }}
            animate={{ scale: active ? 1.02 : 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22 }}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
            style={{
              borderColor: active
                ? `color-mix(in srgb, ${TOKENS.accent} 55%, transparent)`
                : TOKENS.border,
              background: active
                ? `color-mix(in srgb, ${TOKENS.accent} 18%, transparent)`
                : `color-mix(in srgb, ${TOKENS.surface2} 70%, transparent)`,
              color: active ? TOKENS.text : TOKENS.textDim,
            }}
          >
            <item.Icon size={11} strokeWidth={2.2} />
            <span className="uppercase tracking-[0.18em]" style={MONO_FONT}>
              {item.label}
            </span>
            <span
              className="rounded-sm px-1 text-[9.5px] uppercase tracking-[0.18em]"
              style={{
                background: active
                  ? `color-mix(in srgb, ${TOKENS.accent} 24%, transparent)`
                  : `color-mix(in srgb, ${TOKENS.surface} 60%, transparent)`,
                color: active ? TOKENS.accent2 : TOKENS.textFaint,
                ...MONO_FONT,
              }}
            >
              {fmtInt(counts[item.key])}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: QueueRow — single run row in the live queue
// ---------------------------------------------------------------------------

interface QueueRowProps {
  run: AgencyToolsData['recentRuns'][number];
  nowMs: number;
  index: number;
}

function QueueRow({ run, nowMs, index }: QueueRowProps): JSX.Element {
  const Icon = TOOL_ICON[run.toolSlug];
  const ledColor = STATUS_LED_COLOR[run.status];
  const isRunning = run.status === 'running';
  const isFailed = run.status === 'failed';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: 'easeOut', delay: index * 0.02 }}
      className="relative grid grid-cols-[16px_92px_minmax(120px,1.2fr)_minmax(120px,1fr)_minmax(120px,2fr)_92px_92px] items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: isRunning
          ? `color-mix(in srgb, ${TOKENS.accent} 35%, transparent)`
          : TOKENS.border,
        background: isRunning
          ? `linear-gradient(90deg, color-mix(in srgb, ${TOKENS.accent} 10%, transparent), transparent 65%)`
          : `color-mix(in srgb, ${TOKENS.surface2} 65%, transparent)`,
      }}
    >
      {/* LED */}
      <motion.span
        aria-hidden
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{
          background: ledColor,
          filter: `drop-shadow(0 0 6px ${ledColor})`,
        }}
        animate={isRunning ? { opacity: [0.45, 1, 0.45], scale: [1, 1.18, 1] } : { opacity: 1, scale: 1 }}
        transition={isRunning ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
      {/* Status pill */}
      <span
        className="flex items-center justify-center rounded-sm px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: `color-mix(in srgb, ${ledColor} 14%, transparent)`,
          color: ledColor,
          border: `1px solid color-mix(in srgb, ${ledColor} 30%, transparent)`,
          ...MONO_FONT,
        }}
      >
        {STATUS_LABEL[run.status]}
      </span>
      {/* Tool */}
      <span className="flex items-center gap-2">
        <Icon size={13} strokeWidth={2.0} style={{ color: TOOL_ACCENT[run.toolSlug] }} />
        <span
          className="text-[11.5px] uppercase tracking-[0.18em]"
          style={{ color: TOKENS.text, ...MONO_FONT }}
        >
          {run.toolSlug.toUpperCase()}
        </span>
      </span>
      {/* Sub-client */}
      <span
        className="truncate text-[12.5px] font-medium"
        style={{ color: TOKENS.text }}
        title={run.subClientName}
      >
        {run.subClientName}
      </span>
      {/* Summary */}
      <span
        className="truncate text-[11.5px]"
        style={{
          color: isFailed ? TOKENS.danger : isRunning ? TOKENS.accent2 : TOKENS.textDim,
          ...MONO_FONT,
        }}
        title={run.summary}
      >
        {run.summary}
      </span>
      {/* Duration */}
      <span
        className="text-right text-[11.5px]"
        style={{ color: TOKENS.text, ...MONO_FONT }}
      >
        {fmtDuration(run.durationMs)}
      </span>
      {/* When */}
      <span
        className="text-right text-[10.5px] uppercase tracking-[0.18em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        {fmtRelative(run.startedAt, nowMs)}
      </span>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: LiveQueuePanel — recent runs ticker with filter pills
// ---------------------------------------------------------------------------

interface LiveQueuePanelProps {
  runs: AgencyToolsData['recentRuns'];
  nowMs: number;
}

function LiveQueuePanel({ runs, nowMs }: LiveQueuePanelProps): JSX.Element {
  const [filter, setFilter] = useState<QueueFilter>('all');

  const counts: Record<QueueFilter, number> = useMemo(() => {
    const acc: Record<QueueFilter, number> = {
      all: runs.length,
      preview: 0,
      templates: 0,
      spam: 0,
      placement: 0,
    };
    for (const r of runs) {
      acc[r.toolSlug] += 1;
    }
    return acc;
  }, [runs]);

  const filtered = useMemo(() => {
    return filter === 'all' ? runs : runs.filter((r) => r.toolSlug === filter);
  }, [runs, filter]);

  const visible = filtered.slice(0, 12);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: TOKENS.border,
        background: TOKENS.surface,
      }}
    >
      {/* Top accent line */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${TOKENS.accent2}, transparent)`,
        }}
      />
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{
              borderColor: `color-mix(in srgb, ${TOKENS.accent} 30%, transparent)`,
              background: `color-mix(in srgb, ${TOKENS.accent} 14%, ${TOKENS.surface2})`,
            }}
          >
            <ScanLine size={16} strokeWidth={1.9} style={{ color: TOKENS.accent }} />
          </div>
          <div className="flex flex-col">
            <span
              className="text-[10px] uppercase tracking-[0.22em]"
              style={{ color: TOKENS.textFaint, ...MONO_FONT }}
            >
              Live run queue
            </span>
            <span
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: TOKENS.text }}
            >
              Telemetry stream
            </span>
          </div>
          <span
            className="ml-2 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]"
            style={{
              borderColor: `color-mix(in srgb, ${TOKENS.accent} 30%, transparent)`,
              background: `color-mix(in srgb, ${TOKENS.accent} 10%, transparent)`,
              color: TOKENS.accent2,
              ...MONO_FONT,
            }}
          >
            <motion.span
              aria-hidden
              className="inline-flex h-1.5 w-1.5 rounded-full"
              style={{
                background: TOKENS.accent,
                boxShadow: `0 0 8px ${TOKENS.accent}`,
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            Streaming
          </span>
        </div>
        <QueueFilterPills filter={filter} onSelect={setFilter} counts={counts} />
      </header>
      <div className="border-t" style={{ borderColor: TOKENS.border }}>
        {/* Column header */}
        <div
          className="grid grid-cols-[16px_92px_minmax(120px,1.2fr)_minmax(120px,1fr)_minmax(120px,2fr)_92px_92px] items-center gap-3 px-3 py-2 text-[9.5px] uppercase tracking-[0.22em]"
          style={{
            background: `color-mix(in srgb, ${TOKENS.surface2} 60%, transparent)`,
            color: TOKENS.textFaint,
            ...MONO_FONT,
          }}
        >
          <span />
          <span>State</span>
          <span>Tool</span>
          <span>Target</span>
          <span>Telemetry</span>
          <span className="text-right">Duration</span>
          <span className="text-right">Started</span>
        </div>
        <div className="max-h-[480px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <ul className="flex flex-col gap-1.5 px-3 py-3">
            <AnimatePresence initial={false}>
              {visible.map((run, idx) => (
                <QueueRow key={run.id} run={run} nowMs={nowMs} index={idx} />
              ))}
            </AnimatePresence>
            {visible.length === 0 && (
              <li
                className="flex items-center justify-center gap-2 rounded-lg border px-3 py-8 text-[12px] uppercase tracking-[0.22em]"
                style={{
                  borderColor: TOKENS.border,
                  color: TOKENS.textFaint,
                  ...MONO_FONT,
                }}
              >
                <Pause size={12} strokeWidth={2.2} />
                No runs match the active filter
              </li>
            )}
          </ul>
        </div>
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2 text-[10px] uppercase tracking-[0.22em]"
          style={{
            borderColor: TOKENS.border,
            background: `color-mix(in srgb, ${TOKENS.surface2} 55%, transparent)`,
            color: TOKENS.textFaint,
            ...MONO_FONT,
          }}
        >
          <span className="flex items-center gap-1">
            <Terminal size={10} strokeWidth={2.2} />
            Showing {fmtInt(visible.length)} of {fmtInt(filtered.length)}
          </span>
          <span className="flex items-center gap-1">
            <Wifi size={10} strokeWidth={2.2} />
            Updated {fmtClockUtc(new Date(nowMs))} UTC
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TelemetryStrip — cockpit footer with 4 mini-stats
// ---------------------------------------------------------------------------

interface TelemetryStripProps {
  runs: AgencyToolsData['recentRuns'];
  tools: AgencyToolsData['tools'];
  summary: AgencyToolsData['summary'];
}

function TelemetryStrip({ runs, tools, summary }: TelemetryStripProps): JSX.Element {
  const stats = useMemo(() => {
    const running = runs.filter((r) => r.status === 'running').length;
    const completed = runs.filter((r) => r.status === 'completed').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    const total = completed + failed;
    const successPct = total > 0 ? (completed / total) * 100 : 100;
    const finished = runs.filter((r) => r.status === 'completed' || r.status === 'failed');
    const avgMs = finished.length > 0
      ? finished.reduce((sum, r) => sum + r.durationMs, 0) / finished.length
      : 0;
    const available = tools.filter((t) => t.available).length;
    return {
      queueDepth: running + summary.queuedRuns,
      successPct,
      avgMs,
      available,
      totalTools: tools.length,
    };
  }, [runs, tools, summary]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(135deg, ${TOKENS.surface} 0%, color-mix(in srgb, ${TOKENS.surface} 96%, ${TOKENS.surface2}) 100%)`,
      }}
    >
      {/* Top divider line */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${TOKENS.accent} 60%, transparent), transparent)`,
        }}
      />
      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4"
        style={{ borderColor: TOKENS.border }}>
        <FooterTile
          label="Queue depth"
          value={fmtInt(stats.queueDepth)}
          sub={`${stats.queueDepth === 0 ? 'Idle · all stations ready' : `${stats.queueDepth} runs pending`}`}
          Icon={Layers}
          accent={TOKENS.accent}
        />
        <FooterTile
          label="Success rate"
          value={fmtPct(stats.successPct, 1)}
          sub="completed / (completed + failed)"
          Icon={ShieldCheck}
          accent={TOKENS.success}
        />
        <FooterTile
          label="Avg duration"
          value={fmtDuration(Math.round(stats.avgMs))}
          sub="across finished runs"
          Icon={Timer}
          accent={TOKENS.accent2}
        />
        <FooterTile
          label="Tools available"
          value={`${stats.available} / ${stats.totalTools}`}
          sub={stats.available === stats.totalTools ? 'All stations nominal' : 'Station offline'}
          Icon={MonitorSpeaker}
          accent={TOKENS.accent3}
        />
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-[10px] uppercase tracking-[0.22em]"
        style={{
          borderColor: TOKENS.border,
          color: TOKENS.textFaint,
          ...MONO_FONT,
        }}
      >
        <span className="flex items-center gap-1.5">
          <Headphones size={10} strokeWidth={2.2} />
          Console headset · operator channel A
        </span>
        <span className="flex items-center gap-1.5">
          <CircleDot size={10} strokeWidth={2.2} style={{ color: TOKENS.success }} />
          Telemetry feed nominal
        </span>
        <span className="flex items-center gap-1.5">
          <Power size={10} strokeWidth={2.2} style={{ color: TOKENS.accent }} />
          Cockpit build · WP-COCKPIT 0.4.1
        </span>
      </div>
    </section>
  );
}

interface FooterTileProps {
  label: string;
  value: string;
  sub: string;
  Icon: typeof Activity;
  accent: string;
}

function FooterTile({ label, value, sub, Icon, accent }: FooterTileProps): JSX.Element {
  return (
    <div
      className="relative flex flex-col gap-1 px-5 py-4"
      style={{ borderColor: TOKENS.border }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-md border"
        style={{
          borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        }}
      >
        <span className="flex h-full w-full items-center justify-center">
          <Icon size={13} strokeWidth={2.0} style={{ color: accent }} />
        </span>
      </span>
      <span
        className="text-[9.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        {label}
      </span>
      <span
        className="text-[26px] font-semibold leading-none tracking-tight"
        style={{ color: TOKENS.text, ...MONO_FONT }}
      >
        {value}
      </span>
      <span
        className="text-[11px] leading-snug"
        style={{ color: TOKENS.textDim }}
      >
        {sub}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: BatchActionBar — between stations grid and queue
// ---------------------------------------------------------------------------

interface BatchActionBarProps {
  selectedSubClientLabel: string;
  isAll: boolean;
  totalMailboxes: number;
}

function BatchActionBar({
  selectedSubClientLabel,
  isAll,
  totalMailboxes,
}: BatchActionBarProps): JSX.Element {
  return (
    <section
      className="relative flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-3"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(90deg, color-mix(in srgb, ${TOKENS.accent} 8%, transparent) 0%, transparent 60%), ${TOKENS.surface}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md border"
          style={{
            borderColor: `color-mix(in srgb, ${TOKENS.accent} 35%, transparent)`,
            background: `color-mix(in srgb, ${TOKENS.accent} 14%, ${TOKENS.surface2})`,
          }}
        >
          <Wand2 size={14} strokeWidth={2.0} style={{ color: TOKENS.accent }} />
        </div>
        <div className="flex flex-col">
          <span
            className="text-[9.5px] uppercase tracking-[0.22em]"
            style={{ color: TOKENS.textFaint, ...MONO_FONT }}
          >
            Operator armed
          </span>
          <span
            className="text-[13px] font-semibold"
            style={{ color: TOKENS.text }}
          >
            {isAll ? 'Batch · all sub-clients' : selectedSubClientLabel}
            <span
              className="ml-2 text-[11px] uppercase tracking-[0.18em]"
              style={{ color: TOKENS.textDim, ...MONO_FONT }}
            >
              {fmtInt(totalMailboxes)} mbx · 4 stations
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BadgeChip label="SPF check armed" Icon={ShieldCheck} tone={TOKENS.success} />
        <BadgeChip label="Auto-rotate peers" Icon={Repeat2} tone={TOKENS.accent2} />
        <BadgeChip label="Throttle nominal" Icon={Gauge} tone={TOKENS.accent3} />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Open operator settings (read-only preview)"
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.22em]"
          style={{
            borderColor: TOKENS.border,
            background: `color-mix(in srgb, ${TOKENS.surface2} 75%, transparent)`,
            color: TOKENS.textDim,
            ...MONO_FONT,
          }}
        >
          <Settings2 size={11} strokeWidth={2.2} />
          Console settings
        </button>
      </div>
    </section>
  );
}

interface BadgeChipProps {
  label: string;
  Icon: typeof Activity;
  tone: string;
}

function BadgeChip({ label, Icon, tone }: BadgeChipProps): JSX.Element {
  return (
    <span
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.22em]"
      style={{
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
        color: tone,
        ...MONO_FONT,
      }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TickerStrip — single-line marquee of headlines along the
// top of the live queue area. Cosmetic only — reinforces cockpit feel.
// ---------------------------------------------------------------------------

interface TickerStripProps {
  runs: AgencyToolsData['recentRuns'];
  summary: AgencyToolsData['summary'];
}

function TickerStrip({ runs, summary }: TickerStripProps): JSX.Element {
  const items = useMemo(() => {
    const top = runs.slice(0, 8).map((r) => {
      const prefix = r.status === 'running'
        ? 'LIVE'
        : r.status === 'completed'
        ? 'DONE'
        : r.status === 'failed'
        ? 'FAIL'
        : 'WAIT';
      return `${prefix} · ${r.toolSlug.toUpperCase()} · ${r.subClientName} · ${r.summary}`;
    });
    const extras = [
      `OPS · Avg placement ${fmtPct(summary.avgPlacementScore)}`,
      `OPS · ${fmtInt(summary.queuedRuns)} runs in queue`,
      `OPS · ${fmtInt(summary.totalRunsToday)} runs today · ${fmtInt(summary.totalRuns30d)} across 30d`,
    ];
    return [...top, ...extras];
  }, [runs, summary]);

  // Render the items twice so the marquee loop is seamless.
  const doubled = useMemo(() => [...items, ...items], [items]);

  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(90deg, color-mix(in srgb, ${TOKENS.accent} 6%, transparent), transparent 30%), ${TOKENS.surface}`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12"
        style={{
          background: `linear-gradient(90deg, ${TOKENS.surface}, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
        style={{
          background: `linear-gradient(-90deg, ${TOKENS.surface}, transparent)`,
        }}
      />
      <div className="flex items-center gap-3 px-3 py-2">
        <span
          className="z-20 flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[9.5px] uppercase tracking-[0.22em]"
          style={{
            borderColor: `color-mix(in srgb, ${TOKENS.accent} 40%, transparent)`,
            background: `color-mix(in srgb, ${TOKENS.accent} 12%, transparent)`,
            color: TOKENS.accent2,
            ...MONO_FONT,
          }}
        >
          <Radio size={9} strokeWidth={2.4} />
          Ticker
        </span>
        <div className="relative flex-1 overflow-hidden">
          <motion.div
            className="flex shrink-0 items-center gap-6 whitespace-nowrap"
            initial={{ x: 0 }}
            animate={{ x: '-50%' }}
            transition={{ duration: 38, ease: 'linear', repeat: Infinity }}
          >
            {doubled.map((item, idx) => (
              <span
                key={idx}
                className="text-[11px] uppercase tracking-[0.18em]"
                style={{ color: TOKENS.textDim, ...MONO_FONT }}
              >
                {item}
                <span
                  aria-hidden
                  className="mx-3 inline-block"
                  style={{ color: TOKENS.borderStrong }}
                >
                  ◇
                </span>
              </span>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: BriefingPanel — small "operator briefing" card showing
// current target context and three operator hints. Sits next to the stations
// grid on wide screens; falls below on narrow.
// ---------------------------------------------------------------------------

interface BriefingPanelProps {
  selectedLabel: string;
  isAll: boolean;
  selectedDomain: string | null;
  mailboxCount: number;
}

function BriefingPanel({
  selectedLabel,
  isAll,
  selectedDomain,
  mailboxCount,
}: BriefingPanelProps): JSX.Element {
  return (
    <aside
      className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border px-5 py-5"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(180deg, color-mix(in srgb, ${TOKENS.accent} 6%, ${TOKENS.surface}) 0%, ${TOKENS.surface} 100%)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-40"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${TOKENS.accent} 20%, transparent), transparent 70%)`,
        }}
      />
      <header className="relative flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg border"
          style={{
            borderColor: `color-mix(in srgb, ${TOKENS.accent} 30%, transparent)`,
            background: `color-mix(in srgb, ${TOKENS.accent} 14%, ${TOKENS.surface2})`,
          }}
        >
          <Sparkles size={15} strokeWidth={1.9} style={{ color: TOKENS.accent }} />
        </div>
        <div className="flex flex-col">
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{ color: TOKENS.textFaint, ...MONO_FONT }}
          >
            Operator briefing
          </span>
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: TOKENS.text }}
          >
            {isAll ? 'Batch operator mode' : selectedLabel}
          </span>
          {!isAll && selectedDomain != null && (
            <span
              className="mt-0.5 text-[11px] uppercase tracking-[0.18em]"
              style={{ color: TOKENS.textDim, ...MONO_FONT }}
            >
              {selectedDomain}
            </span>
          )}
        </div>
      </header>
      <div className="relative grid grid-cols-2 gap-3">
        <BriefingMetric label="Mailboxes" value={fmtInt(mailboxCount)} Icon={Inbox} />
        <BriefingMetric label="Stations" value="4 armed" Icon={Workflow} />
        <BriefingMetric label="Authority" value="Operator" Icon={ShieldCheck} />
        <BriefingMetric label="Channel" value="ALPHA-1" Icon={Headphones} />
      </div>
      <div className="relative flex flex-col gap-2">
        <BriefingTip
          Icon={CheckCircle2}
          tone={TOKENS.success}
          text="Spam scanner clean across last 5 runs — safe to launch a fresh placement test."
        />
        <BriefingTip
          Icon={AlertTriangle}
          tone={TOKENS.warning}
          text="Lyra Pipeline placement timed out twice; rotate seed peers before next launch."
        />
        <BriefingTip
          Icon={Zap}
          tone={TOKENS.accent}
          text="Templates designer last shipped 64 minutes ago — consider drafting variants."
        />
      </div>
    </aside>
  );
}

interface BriefingMetricProps {
  label: string;
  value: string;
  Icon: typeof Activity;
}

function BriefingMetric({ label, value, Icon }: BriefingMetricProps): JSX.Element {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg border px-3 py-2"
      style={{
        borderColor: TOKENS.border,
        background: `color-mix(in srgb, ${TOKENS.surface2} 70%, transparent)`,
      }}
    >
      <span
        className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        <Icon size={10} strokeWidth={2.4} style={{ color: TOKENS.accent2 }} />
        {label}
      </span>
      <span
        className="text-[14px] font-semibold leading-tight"
        style={{ color: TOKENS.text, ...MONO_FONT }}
      >
        {value}
      </span>
    </div>
  );
}

interface BriefingTipProps {
  Icon: typeof Activity;
  tone: string;
  text: string;
}

function BriefingTip({ Icon, tone, text }: BriefingTipProps): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-md border px-3 py-2"
      style={{
        borderColor: `color-mix(in srgb, ${tone} 25%, transparent)`,
        background: `color-mix(in srgb, ${tone} 8%, transparent)`,
      }}
    >
      <Icon
        size={13}
        strokeWidth={2.0}
        style={{ color: tone, marginTop: 2, flexShrink: 0 }}
      />
      <span
        className="text-[12px] leading-relaxed"
        style={{ color: TOKENS.text }}
      >
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SidePanel — wraps a TickerStrip + status block beneath the
// stations grid on wide screens. Pure cosmetic chrome.
// ---------------------------------------------------------------------------

interface SidePanelProps {
  runs: AgencyToolsData['recentRuns'];
  summary: AgencyToolsData['summary'];
  selectedLabel: string;
  isAll: boolean;
  selectedDomain: string | null;
  mailboxCount: number;
}

function SidePanel({
  runs,
  summary,
  selectedLabel,
  isAll,
  selectedDomain,
  mailboxCount,
}: SidePanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <BriefingPanel
        selectedLabel={selectedLabel}
        isAll={isAll}
        selectedDomain={selectedDomain}
        mailboxCount={mailboxCount}
      />
      <TickerStrip runs={runs} summary={summary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SectionLabel — small uppercase label above each section
// ---------------------------------------------------------------------------

interface SectionLabelProps {
  Icon: typeof Activity;
  text: string;
  trailing?: string;
}

function SectionLabel({ Icon, text, trailing }: SectionLabelProps): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span
        className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}
      >
        <Icon size={11} strokeWidth={2.4} style={{ color: TOKENS.accent }} />
        {text}
      </span>
      {trailing != null && (
        <span
          className="text-[10px] uppercase tracking-[0.22em]"
          style={{ color: TOKENS.textFaint, ...MONO_FONT }}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: StationFloorOverlay — a thin decorative bar between the
// header band and the sub-client selector. Adds "blueprint" texture without
// introducing colour outside the orange palette.
// ---------------------------------------------------------------------------

function StationFloorOverlay(): JSX.Element {
  return (
    <div
      className="relative flex items-center justify-between overflow-hidden rounded-xl border px-4 py-2"
      style={{
        borderColor: TOKENS.border,
        background: `linear-gradient(90deg, color-mix(in srgb, ${TOKENS.accent} 4%, transparent), transparent 70%), ${TOKENS.surface}`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${TOKENS.accent} 6%, transparent) 0px, color-mix(in srgb, ${TOKENS.accent} 6%, transparent) 1px, transparent 1px, transparent 22px)`,
          opacity: 0.35,
        }}
      />
      <div className="relative flex items-center gap-3 text-[10px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}>
        <Radar size={11} strokeWidth={2.2} style={{ color: TOKENS.accent }} />
        Station floor · all panels armed
      </div>
      <div className="relative flex items-center gap-3 text-[10px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textFaint, ...MONO_FONT }}>
        <span className="flex items-center gap-1">
          <Activity size={11} strokeWidth={2.2} style={{ color: TOKENS.accent2 }} />
          Power
          <span style={{ color: TOKENS.text }}>OK</span>
        </span>
        <span aria-hidden style={{ color: TOKENS.borderStrong }}>·</span>
        <span className="flex items-center gap-1">
          <HardDriveDownload size={11} strokeWidth={2.2} style={{ color: TOKENS.accent2 }} />
          Cache
          <span style={{ color: TOKENS.text }}>SYNCED</span>
        </span>
        <span aria-hidden style={{ color: TOKENS.borderStrong }}>·</span>
        <span className="flex items-center gap-1">
          <Signal size={11} strokeWidth={2.2} style={{ color: TOKENS.accent2 }} />
          Uplink
          <span style={{ color: TOKENS.text }}>STABLE</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN — AgTolT1Cockpit
// ---------------------------------------------------------------------------

interface AgTolT1CockpitProps {
  data?: AgencyToolsData;
}

export function AgTolT1Cockpit({ data }: AgTolT1CockpitProps = {}): JSX.Element {
  const d = data ?? MOCK;

  // Track which sub-client is "armed". Default to ALL on first render so the
  // station cards show their batch state immediately.
  const [selectedSubClient, setSelectedSubClient] = useState<string>('__all__');

  // Live now-ms; ticks once a second so relative timestamps update.
  const [nowMs, setNowMs] = useState<number>(() => NOW_MS);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs((prev) => prev + 1000), 1000);
    return () => window.clearInterval(id);
  }, []);

  const isAll = selectedSubClient === '__all__';

  const selectedSubClientObj = useMemo(
    () => d.subClients.find((c) => c.id === selectedSubClient) ?? null,
    [d.subClients, selectedSubClient],
  );

  const selectedTargetLabel = useMemo(() => {
    if (isAll) return 'All sub-clients';
    return selectedSubClientObj?.name ?? 'Unknown';
  }, [isAll, selectedSubClientObj]);

  const selectedDomain = useMemo(() => {
    if (isAll) return null;
    return selectedSubClientObj?.domain ?? null;
  }, [isAll, selectedSubClientObj]);

  const targetMailboxCount = useMemo(() => {
    if (isAll) return d.subClients.reduce((sum, c) => sum + c.mailboxCount, 0);
    return selectedSubClientObj?.mailboxCount ?? 0;
  }, [isAll, selectedSubClientObj, d.subClients]);

  // Filter recentRuns to the selected sub-client if any. The cockpit always
  // shows aggregate counts in the header; the queue narrows for clarity.
  const visibleRuns = useMemo(() => {
    if (isAll) return d.recentRuns;
    return d.recentRuns.filter((r) => r.subClientId === selectedSubClient);
  }, [isAll, selectedSubClient, d.recentRuns]);

  return (
    <div
      className="relative isolate flex flex-col gap-4"
      style={{
        color: TOKENS.text,
        background: TOKENS.bg,
      }}
    >
      {/* Subtle ambient orange wash behind the whole console */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-72 opacity-60"
        style={{
          background: `radial-gradient(ellipse at 12% 0%, color-mix(in srgb, ${TOKENS.accent} 12%, transparent), transparent 60%), radial-gradient(ellipse at 88% 0%, color-mix(in srgb, ${TOKENS.accent2} 10%, transparent), transparent 60%)`,
        }}
      />

      <CockpitHeader
        agencyName={d.agency.name}
        region={d.agency.region}
        summary={d.summary}
        totalSubClients={d.subClients.length}
      />

      <StationFloorOverlay />

      <SubClientSelector
        subClients={d.subClients}
        selected={selectedSubClient}
        onSelect={setSelectedSubClient}
      />

      <BatchActionBar
        selectedSubClientLabel={selectedTargetLabel}
        isAll={isAll}
        totalMailboxes={targetMailboxCount}
      />

      <div className="flex flex-col gap-2">
        <SectionLabel
          Icon={Workflow}
          text="Tool stations · operator workspace"
          trailing="4 / 4 armed"
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          <ToolStationsGrid
            tools={d.tools}
            recentRuns={d.recentRuns}
            selectedTargetLabel={selectedTargetLabel}
            nowMs={nowMs}
          />
          <SidePanel
            runs={d.recentRuns}
            summary={d.summary}
            selectedLabel={selectedTargetLabel}
            isAll={isAll}
            selectedDomain={selectedDomain}
            mailboxCount={targetMailboxCount}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel
          Icon={ScanLine}
          text="Live run queue · telemetry stream"
          trailing={`${visibleRuns.length} entries · auto-refresh on`}
        />
        <LiveQueuePanel runs={visibleRuns} nowMs={nowMs} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel
          Icon={Gauge}
          text="Cockpit telemetry · system status"
          trailing="Footer · console build 0.4.1"
        />
        <TelemetryStrip runs={d.recentRuns} tools={d.tools} summary={d.summary} />
      </div>

      <CockpitDataBus />
    </div>
  );
}

export default AgTolT1Cockpit;

// ---------------------------------------------------------------------------
// Sub-component: CockpitDataBus — a small bottom strip listing 4 "pipes"
// with mono blinking activity. Pure cosmetic. Placed below the telemetry
// strip to anchor the bottom of the page.
// ---------------------------------------------------------------------------

function CockpitDataBus(): JSX.Element {
  const pipes: Array<{ id: string; label: string; tone: string; status: string }> = [
    { id: 'smtp', label: 'SMTP·OUT', tone: TOKENS.accent, status: 'STREAM' },
    { id: 'imap', label: 'IMAP·IN', tone: TOKENS.accent2, status: 'POLL' },
    { id: 'peer', label: 'PEER·NET', tone: TOKENS.accent3, status: 'NOMINAL' },
    { id: 'tel', label: 'TLM·BUS', tone: TOKENS.success, status: 'SYNCED' },
  ];

  return (
    <section
      className="relative grid grid-cols-1 gap-2 rounded-2xl border px-3 py-2 sm:grid-cols-2 lg:grid-cols-4"
      style={{
        borderColor: TOKENS.border,
        background: `color-mix(in srgb, ${TOKENS.surface} 95%, transparent)`,
      }}
    >
      {pipes.map((pipe) => (
        <DataBusPipe key={pipe.id} pipe={pipe} />
      ))}
    </section>
  );
}

interface DataBusPipeProps {
  pipe: {
    id: string;
    label: string;
    tone: string;
    status: string;
  };
}

function DataBusPipe({ pipe }: DataBusPipeProps): JSX.Element {
  return (
    <div
      className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border px-3 py-2"
      style={{
        borderColor: `color-mix(in srgb, ${pipe.tone} 22%, transparent)`,
        background: `color-mix(in srgb, ${pipe.tone} 6%, transparent)`,
      }}
    >
      <span
        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]"
        style={{ color: pipe.tone, ...MONO_FONT }}
      >
        <motion.span
          aria-hidden
          className="inline-flex h-1.5 w-1.5 rounded-full"
          style={{
            background: pipe.tone,
            boxShadow: `0 0 8px ${pipe.tone}`,
          }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {pipe.label}
      </span>
      {/* Mock waveform */}
      <div className="relative h-4 flex-1">
        <Waveform tone={pipe.tone} />
      </div>
      <span
        className="text-[10px] uppercase tracking-[0.22em]"
        style={{ color: TOKENS.textDim, ...MONO_FONT }}
      >
        {pipe.status}
      </span>
    </div>
  );
}

interface WaveformProps {
  tone: string;
}

function Waveform({ tone }: WaveformProps): JSX.Element {
  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  return (
    <div className="flex h-full items-center justify-end gap-[2px]">
      {bars.map((i) => {
        const v = 0.35 + 0.65 * Math.abs(Math.sin((i + 1) * 0.85));
        return (
          <motion.span
            key={i}
            aria-hidden
            className="w-[2px] rounded-sm"
            style={{
              background: tone,
              opacity: 0.55,
            }}
            animate={{
              height: [`${30 + v * 30}%`, `${50 + v * 40}%`, `${30 + v * 30}%`],
              opacity: [0.45, 0.85, 0.45],
            }}
            transition={{
              duration: 1.4 + (i % 5) * 0.18,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.04,
            }}
          />
        );
      })}
    </div>
  );
}

