import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Anvil,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  ChevronRight,
  CircleDot,
  Clock,
  Compass,
  Crosshair,
  Drill,
  FileText,
  Filter,
  Hammer,
  HardHat,
  Hexagon,
  History,
  Layers,
  Mail,
  MoreHorizontal,
  PenTool,
  Pickaxe,
  Play,
  Plus,
  Ruler,
  ScanLine,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { toast } from '@/components/ui/AppToast';
import { exportRowsToCsv, exportStamp } from '@/lib/exportCsv';

/**
 * AgTolT3Workshop — Agency-tier TOOLS surface, design candidate T3 "Workshop Drawer".
 *
 * A craftsman's workshop where each warmup tool is a physical implement
 * hanging on a peg-board over a wooden workbench. Beneath the bench, a
 * row of labelled drawers represents the sub-clients whose "projects"
 * are currently under the hammer. Picking up a tool flips a blueprint
 * open on the right rail — engineering-drawing aesthetic, but rendered
 * in grey + orange (NO blue, NO cyan, NO mint, per the strict colour
 * rule); pulling a drawer slides it out and reveals that sub-client's
 * recent runs of the selected tool.
 *
 * Anatomy:
 *   1. Workshop header — agency rendered as the "workshop", region
 *      stamped on the foreman's badge, "shift report" summary tiles
 *      (runs today / 30d / queued / avg placement) laid out across the
 *      hero like an entry log on a clipboard.
 *   2. Bench surface — the centerpiece. A wooden bench (warm,
 *      orange-tinted greys via repeating-linear-gradient grain) with a
 *      peg-board strip across the top from which each tool hangs by a
 *      hook. Each tool gets a hand-drawn SVG illustration in orange
 *      line-art: Preview = magnifier loupe; Templates = T-square +
 *      ruler; Spam = scanner / radar dish; Placement = compass +
 *      plumb-line. A wooden tag dangles beneath each tool stamped with
 *      the tool name and last-used timestamp. Hover lifts the tool 4px
 *      off the bench with a soft shadow. Click selects.
 *   3. Project drawer strip — a row of seven sub-client drawer
 *      compartments along the bottom of the bench. The selected
 *      drawer "pulls out" with a spring x-translate, revealing recent
 *      runs of the selected tool (or "All tools" by default).
 *   4. Blueprint panel — the right rail when a tool is selected. Pure
 *      engineering-drawing aesthetic: thin grey-orange dashed grid,
 *      callout labels with leader lines, a centered SVG diagram of the
 *      tool with named parts. Underneath: a "run history" annotation
 *      table styled as blueprint legend.
 *   5. Tools-rack footer — small inventory bar with four counters:
 *      available / in-use / maintenance / idle.
 *
 * Visual rule: ONLY the Shailog orange palette via CSS vars. The
 * "blueprint" aesthetic is achieved with greys + orange line-art —
 * NEVER blueprint-blue. Wood grain via repeating-linear-gradient with
 * warm orange-tinted greys. Sibling T1 / T2 / T4 own the cockpit /
 * launcher / wallet identities; this variant's identity is the
 * physical-workshop metaphor.
 *
 * Fully STANDALONE — no network, router, query hooks or required
 * props. Inline MOCK supplies every field so the preview harness mounts
 * it prop-less. The future adapter passes `data` once the agency
 * /api/tools aggregate endpoint exists.
 */

// ---------------------------------------------------------------------------
// Shared Agency Tools data shape.
// Sibling T1 file (AgTolT1Cockpit) will export this; while it's pending we
// keep an INLINE definition so the file is self-contained and typechecks.
// When T1 lands, swap the local block for:
//   import type { AgencyToolsData } from '@/pages/client/agency/AgTolT1Cockpit';
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
// MOCK — Northwind Agency workshop, 7 sub-client projects, 4 hung tools and a
// rich 24-row run log so the bench reads as a busy shop.
// ---------------------------------------------------------------------------

const NOW_ISO = '2026-05-29T10:42:00Z';

const MOCK: AgencyToolsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: [
    { id: 'sc-helix', name: 'Helix Labs', domain: 'helix-labs.io', mailboxCount: 14, status: 'active' },
    { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.app', mailboxCount: 22, status: 'active' },
    { id: 'sc-orbital', name: 'Orbital Stack', domain: 'orbital-stack.co', mailboxCount: 18, status: 'active' },
    { id: 'sc-voracom', name: 'Voracom', domain: 'voracom.net', mailboxCount: 11, status: 'active' },
    { id: 'sc-quasar', name: 'Quasar Grid', domain: 'quasargrid.io', mailboxCount: 9, status: 'onboarding' },
    { id: 'sc-lumen', name: 'Lumensphere', domain: 'lumensphere.co', mailboxCount: 7, status: 'paused' },
    { id: 'sc-atlas', name: 'Atlas Bio', domain: 'atlas-bio.com', mailboxCount: 5, status: 'active' },
  ],
  tools: [
    {
      slug: 'preview',
      name: 'Warmup Preview',
      short: 'Loupe',
      description: 'Render the next outbound thread message and inspect headers, body and signing.',
      lastRunAt: '2026-05-29T10:28:00Z',
      runsLast30d: 184,
      available: true,
    },
    {
      slug: 'templates',
      name: 'Template Studio',
      short: 'T-square',
      description: 'Compose, fork and version the AI template families used by the content factory.',
      lastRunAt: '2026-05-29T09:51:00Z',
      runsLast30d: 92,
      available: true,
    },
    {
      slug: 'spam',
      name: 'Spam Scanner',
      short: 'Scanner',
      description: 'Score a candidate message body / subject pair against the SpamAssassin rule set.',
      lastRunAt: '2026-05-29T08:14:00Z',
      runsLast30d: 138,
      available: true,
    },
    {
      slug: 'placement',
      name: 'Inbox Tester',
      short: 'Compass',
      description: 'Send a probe across the peer network and report which folder each provider lands it in.',
      lastRunAt: '2026-05-29T07:02:00Z',
      runsLast30d: 76,
      available: true,
    },
  ],
  recentRuns: [
    {
      id: 'r-1',
      toolSlug: 'preview',
      subClientId: 'sc-helix',
      subClientName: 'Helix Labs',
      startedAt: '2026-05-29T10:28:00Z',
      status: 'completed',
      summary: 'Rendered thread for mailbox cap@helix-labs.io · 3 headers, 2 attachments',
      durationMs: 1240,
    },
    {
      id: 'r-2',
      toolSlug: 'spam',
      subClientId: 'sc-nimbus',
      subClientName: 'Nimbus Cloud',
      startedAt: '2026-05-29T10:14:00Z',
      status: 'completed',
      summary: 'SpamAssassin score 1.4 — below 3.0 threshold, safe to send',
      durationMs: 2180,
    },
    {
      id: 'r-3',
      toolSlug: 'placement',
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Stack',
      startedAt: '2026-05-29T09:58:00Z',
      status: 'running',
      summary: 'Probing 16 helper inboxes across Gmail / Outlook / Yahoo',
      durationMs: 0,
    },
    {
      id: 'r-4',
      toolSlug: 'templates',
      subClientId: 'sc-voracom',
      subClientName: 'Voracom',
      startedAt: '2026-05-29T09:51:00Z',
      status: 'completed',
      summary: 'Forked template-family "voracom-q2" · 14 prompts, 3 fallback variants',
      durationMs: 480,
    },
    {
      id: 'r-5',
      toolSlug: 'preview',
      subClientId: 'sc-helix',
      subClientName: 'Helix Labs',
      startedAt: '2026-05-29T09:32:00Z',
      status: 'completed',
      summary: 'Rendered for ops@helix-labs.io · DKIM signed, 0 issues flagged',
      durationMs: 1120,
    },
    {
      id: 'r-6',
      toolSlug: 'spam',
      subClientId: 'sc-atlas',
      subClientName: 'Atlas Bio',
      startedAt: '2026-05-29T09:14:00Z',
      status: 'failed',
      summary: 'Subject "Final notice" tripped URI_TRUNC_HEX rule · score 5.7',
      durationMs: 1980,
    },
    {
      id: 'r-7',
      toolSlug: 'placement',
      subClientId: 'sc-nimbus',
      subClientName: 'Nimbus Cloud',
      startedAt: '2026-05-29T08:46:00Z',
      status: 'completed',
      summary: 'Inbox 94%, promotions 4%, spam 2% across 24 peers',
      durationMs: 184200,
    },
    {
      id: 'r-8',
      toolSlug: 'preview',
      subClientId: 'sc-quasar',
      subClientName: 'Quasar Grid',
      startedAt: '2026-05-29T08:31:00Z',
      status: 'completed',
      summary: 'Rendered first onboarding thread · AI Gemini-flash 2.5',
      durationMs: 1640,
    },
    {
      id: 'r-9',
      toolSlug: 'templates',
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Stack',
      startedAt: '2026-05-29T08:18:00Z',
      status: 'completed',
      summary: 'Saved revision v17 of "orbital-prospect" template-family',
      durationMs: 420,
    },
    {
      id: 'r-10',
      toolSlug: 'spam',
      subClientId: 'sc-helix',
      subClientName: 'Helix Labs',
      startedAt: '2026-05-29T08:14:00Z',
      status: 'completed',
      summary: 'SpamAssassin score 0.8 — clean, no rule trips',
      durationMs: 2040,
    },
    {
      id: 'r-11',
      toolSlug: 'placement',
      subClientId: 'sc-voracom',
      subClientName: 'Voracom',
      startedAt: '2026-05-29T07:52:00Z',
      status: 'completed',
      summary: 'Inbox 91%, promotions 6%, spam 3% across 18 peers',
      durationMs: 172800,
    },
    {
      id: 'r-12',
      toolSlug: 'preview',
      subClientId: 'sc-nimbus',
      subClientName: 'Nimbus Cloud',
      startedAt: '2026-05-29T07:34:00Z',
      status: 'completed',
      summary: 'Rendered reply for warmup thread #82 · 2 quotes, signature attached',
      durationMs: 1010,
    },
    {
      id: 'r-13',
      toolSlug: 'placement',
      subClientId: 'sc-helix',
      subClientName: 'Helix Labs',
      startedAt: '2026-05-29T07:02:00Z',
      status: 'completed',
      summary: 'Inbox 96%, promotions 3%, spam 1% — premium inbox vs spam',
      durationMs: 168400,
    },
    {
      id: 'r-14',
      toolSlug: 'spam',
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Stack',
      startedAt: '2026-05-29T06:48:00Z',
      status: 'completed',
      summary: 'SpamAssassin score 1.1 — within tolerance',
      durationMs: 2210,
    },
    {
      id: 'r-15',
      toolSlug: 'placement',
      subClientId: 'sc-atlas',
      subClientName: 'Atlas Bio',
      startedAt: '2026-05-29T05:32:00Z',
      status: 'failed',
      summary: 'Probe aborted · 12 of 16 peers failed SPF — fix domain records (DNS) before retry',
      durationMs: 42600,
    },
    {
      id: 'r-16',
      toolSlug: 'preview',
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Stack',
      startedAt: '2026-05-29T04:46:00Z',
      status: 'pending',
      summary: 'Queued behind 3 jobs · est. 14s until start',
      durationMs: 0,
    },
    {
      id: 'r-17',
      toolSlug: 'placement',
      subClientId: 'sc-quasar',
      subClientName: 'Quasar Grid',
      startedAt: '2026-05-29T04:12:00Z',
      status: 'completed',
      summary: 'Inbox 88%, promotions 8%, spam 4% — onboarding build-up ongoing',
      durationMs: 162200,
    },
    {
      id: 'r-18',
      toolSlug: 'templates',
      subClientId: 'sc-nimbus',
      subClientName: 'Nimbus Cloud',
      startedAt: '2026-05-29T02:46:00Z',
      status: 'completed',
      summary: 'Archived 7 stale variants from "nimbus-q1" template-family',
      durationMs: 380,
    },
  ],
  summary: {
    totalRunsToday: 24,
    totalRuns30d: 490,
    avgPlacementScore: 92,
    queuedRuns: 2,
  },
};

// ---------------------------------------------------------------------------
// Theme tokens — orange + warm wood-tinted greys. Single source of truth.
// `TOK` reads CSS vars at runtime; `HEX` is the deterministic fallback used
// inside SVG gradient stops where CSS-var resolution is fragile.
// ---------------------------------------------------------------------------

const TOK = {
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accentHover: 'var(--wp-accent-hover, #FF7B38)',
  warning: 'var(--wp-warning, #ffb454)',
  success: 'var(--wp-success, #3ddc97)',
  danger: 'var(--wp-danger, #ff5c7a)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  bg: 'var(--wp-bg, #0a0a0f)',
  border: 'var(--wp-border, #2a2a3a)',
  borderStrong: 'var(--wp-border-strong, #33334a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
} as const;

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accentDeep: '#C8470E',
  warning: '#ffb454',
  success: '#3ddc97',
  danger: '#ff5c7a',
  bg: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  borderStrong: '#33334a',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

// Tool → physical-implement metadata. Bench positions are 0-indexed across the
// peg-board row. Each tool advertises its "trade" and a one-line description
// that surfaces in the blueprint legend.
interface ToolMeta {
  slug: ToolSlug;
  iconName: string;
  trade: string;
  blueprintLegend: string;
  Icon: typeof Wrench;
  partLabels: Array<{ id: string; label: string; x: number; y: number }>;
}

const TOOL_META: Record<ToolSlug, ToolMeta> = {
  preview: {
    slug: 'preview',
    iconName: 'Magnifier',
    trade: 'Inspection',
    blueprintLegend: 'Optical loupe · 4× magnification · brass-collar pivot',
    Icon: Search,
    partLabels: [
      { id: 'a', label: 'Lens · 4×', x: 60, y: 25 },
      { id: 'b', label: 'Brass collar', x: 130, y: 50 },
      { id: 'c', label: 'Handle · walnut', x: 165, y: 130 },
    ],
  },
  templates: {
    slug: 'templates',
    iconName: 'T-square',
    trade: 'Drafting',
    blueprintLegend: 'Carpenter T-square · 24" blade · steel head, hardwood stock',
    Icon: Ruler,
    partLabels: [
      { id: 'a', label: 'Blade · 24"', x: 30, y: 35 },
      { id: 'b', label: 'Square head', x: 150, y: 80 },
      { id: 'c', label: 'Inch graduation', x: 110, y: 25 },
    ],
  },
  spam: {
    slug: 'spam',
    iconName: 'Scanner',
    trade: 'Detection',
    blueprintLegend: 'Bench scanner · 12-band rule sweep · low-noise photo head',
    Icon: ScanLine,
    partLabels: [
      { id: 'a', label: 'Aperture', x: 150, y: 40 },
      { id: 'b', label: 'Photo head', x: 60, y: 80 },
      { id: 'c', label: 'Trigger', x: 165, y: 135 },
    ],
  },
  placement: {
    slug: 'placement',
    iconName: 'Compass',
    trade: 'Measurement',
    blueprintLegend: 'Surveyor compass · plumb-line attached · brass index pin',
    Icon: Compass,
    partLabels: [
      { id: 'a', label: 'Index needle', x: 110, y: 30 },
      { id: 'b', label: 'Pivot pin', x: 100, y: 80 },
      { id: 'c', label: 'Plumb-line', x: 105, y: 150 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers — pure functions, no React, no state.
// ---------------------------------------------------------------------------

function fmtInt(n: number): string {
  return formatNumber(n);
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function relativeTime(iso: string | null, nowIso: string = NOW_ISO): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return iso;
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '--:--';
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function runStatusLabel(status: ToolRunStatus): string {
  if (status === 'pending') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'completed') return 'Completed';
  return 'Failed';
}

function runStatusToneColor(status: ToolRunStatus): string {
  if (status === 'completed') return HEX.success;
  if (status === 'running') return HEX.accent;
  if (status === 'pending') return HEX.warning;
  return HEX.danger;
}

function runStatusToneText(status: ToolRunStatus): string {
  if (status === 'completed') return 'text-accent';
  if (status === 'running') return 'text-accent2';
  if (status === 'pending') return 'text-accent4';
  return 'text-accent3';
}

function toolCadenceLabel(runsLast30d: number): string {
  if (runsLast30d >= 150) return 'Workhorse';
  if (runsLast30d >= 100) return 'Heavy use';
  if (runsLast30d >= 50) return 'Steady';
  if (runsLast30d >= 20) return 'Occasional';
  return 'Idle';
}

function subClientStatusLabel(status: 'active' | 'paused' | 'onboarding'): string {
  if (status === 'active') return 'On the bench';
  if (status === 'paused') return 'In the press';
  return 'Onboarding';
}

function subClientStatusTone(status: 'active' | 'paused' | 'onboarding'): string {
  if (status === 'active') return HEX.accent;
  if (status === 'paused') return HEX.warning;
  return HEX.accent2;
}

function buildPegX(idx: number, total: number, width: number): number {
  const margin = width * 0.12;
  const inner = width - margin * 2;
  const step = inner / Math.max(1, total - 1);
  return margin + idx * step;
}

function uniqueDrawerWorkOrders(
  runs: AgencyToolsData['recentRuns'],
  subClientId: string,
  toolSlug: ToolSlug | 'all',
): Array<AgencyToolsData['recentRuns'][number]> {
  return runs.filter(
    (r) => r.subClientId === subClientId && (toolSlug === 'all' || r.toolSlug === toolSlug),
  );
}

// ---------------------------------------------------------------------------
// Background — single warm bg + radial spot-lights, no decorative gradients
// that would conflict with the wood/bench texture.
// ---------------------------------------------------------------------------

function WorkshopBackdrop(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full opacity-25 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(242,101,34,0.45), transparent 70%)' }}
      />
      <div
        className="absolute right-[-120px] top-[120px] h-[480px] w-[480px] rounded-full opacity-20 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(255,138,75,0.4), transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-180px] left-1/3 h-[520px] w-[520px] rounded-full opacity-15 blur-2xl"
        style={{ background: 'radial-gradient(closest-side, rgba(255,180,84,0.4), transparent 70%)' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wood grain — diagonal warm-orange tinted stripes. Used as the bench surface
// inline background. Slight 14deg rotation reads as plank direction.
// ---------------------------------------------------------------------------

function woodGrainCss(): CSSProperties {
  return {
    backgroundImage: [
      'repeating-linear-gradient(14deg, rgba(255,180,84,0.05) 0 1px, transparent 1px 7px)',
      'repeating-linear-gradient(14deg, rgba(242,101,34,0.04) 0 1px, transparent 1px 23px)',
      'linear-gradient(180deg, rgba(255,138,75,0.06), rgba(26,26,38,0.0) 60%)',
    ].join(','),
  };
}

// Cream-tan card variant — wood surface but lighter, used for the bench top.
function benchTopCss(): CSSProperties {
  return {
    backgroundImage: [
      'repeating-linear-gradient(14deg, rgba(255,180,84,0.07) 0 1px, transparent 1px 6px)',
      'repeating-linear-gradient(14deg, rgba(242,101,34,0.05) 0 1px, transparent 1px 19px)',
      'linear-gradient(180deg, rgba(255,138,75,0.10), rgba(255,138,75,0.04) 80%)',
    ].join(','),
  };
}

// Blueprint grid — fine grey + orange dashed grid, NO blue. Drawn as a
// repeating-linear-gradient on the blueprint backdrop.
function blueprintGridCss(): CSSProperties {
  return {
    backgroundImage: [
      'linear-gradient(rgba(255,138,75,0.10) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(255,138,75,0.10) 1px, transparent 1px)',
      'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
    ].join(','),
    backgroundSize: '40px 40px, 40px 40px, 8px 8px, 8px 8px',
  };
}

// ---------------------------------------------------------------------------
// Atoms — small reusable bits.
// ---------------------------------------------------------------------------

interface ChipProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'accent2' | 'accent3' | 'accent4' | 'success';
  className?: string;
}

function Chip({ children, tone = 'neutral', className }: ChipProps): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : tone === 'accent2'
        ? 'border-accent2/40 bg-accent2/10 text-accent2'
        : tone === 'accent3'
          ? 'border-accent3/40 bg-accent3/10 text-accent3'
          : tone === 'accent4'
            ? 'border-accent4/40 bg-accent4/10 text-accent4'
            : tone === 'success'
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface-2 text-text-dim';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ' +
        toneClass +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </span>
  );
}

// Counts smoothly up from zero. ~700ms ease-out cubic, RAF-driven.
function CountUp({
  value,
  duration = 700,
  delay = 0,
  format = fmtInt,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      if (elapsed < delay) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (elapsed - delay) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return <span className={className}>{format(shown)}</span>;
}

// Wooden tag dangling beneath each tool — a small rounded card with a tiny
// rope / thong illustration up top, the tool name and a last-used line.
function ToolTag({
  name,
  lastRunAt,
  cadence,
  selected,
}: {
  name: string;
  lastRunAt: string | null;
  cadence: string;
  selected: boolean;
}): JSX.Element {
  return (
    <motion.div
      animate={{ rotate: selected ? 0 : [-0.6, 0.6, -0.6] }}
      transition={
        selected
          ? { duration: 0.3 }
          : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
      }
      className={
        'relative w-[148px] rounded-md border px-2.5 py-1.5 text-center backdrop-blur-sm ' +
        (selected
          ? 'border-accent/60 bg-accent/15 text-text shadow-[0_6px_22px_rgba(242,101,34,0.28)]'
          : 'border-border-muted bg-surface/75 text-text')
      }
      style={woodGrainCss()}
    >
      {/* rope */}
      <div
        aria-hidden
        className="absolute -top-2 left-1/2 h-2 w-px -translate-x-1/2"
        style={{ background: TOK.borderStrong }}
      />
      <div
        aria-hidden
        className="absolute -top-2.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full border"
        style={{ borderColor: TOK.borderStrong, background: TOK.surface2 }}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wider">{name}</div>
      <div className="mt-0.5 text-[9px] text-text-dim">
        last <span className="text-text">{relativeTime(lastRunAt)}</span>
      </div>
      <div className="mt-0.5 text-[9px] text-text-faint">{cadence}</div>
    </motion.div>
  );
}

// Status pip — pulsing for in-flight runs, static otherwise.
function StatusPip({ status, size = 6 }: { status: ToolRunStatus; size?: number }): JSX.Element {
  const color = runStatusToneColor(status);
  const live = status === 'running' || status === 'pending';
  return (
    <span
      className="relative inline-block flex-shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    >
      {live ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.4, 0, 0.4], scale: [1, 1.9, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Workshop header — agency-as-workshop hero.
// ---------------------------------------------------------------------------

function ShiftStat({
  label,
  value,
  Icon,
  tone,
  hint,
  index,
}: {
  label: string;
  value: string | JSX.Element;
  Icon: typeof Wrench;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  hint?: string;
  index: number;
}): JSX.Element {
  const tones: Record<typeof tone, string> = {
    accent: 'text-accent border-accent/40 bg-accent/8',
    accent2: 'text-accent2 border-accent2/40 bg-accent2/8',
    accent3: 'text-accent3 border-accent3/40 bg-accent3/8',
    accent4: 'text-accent4 border-accent4/40 bg-accent4/8',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 * index }}
      className="relative rounded-xl border border-border-muted bg-surface/60 p-3 backdrop-blur-sm"
      style={woodGrainCss()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-text-dim">{label}</span>
        <span className={'flex h-6 w-6 items-center justify-center rounded-md border ' + tones[tone]}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold text-text tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-[10px] text-text-faint">{hint}</div> : null}
    </motion.div>
  );
}

function WorkshopHeader({
  data,
  onShiftReport,
  onOpenTool,
}: {
  data: AgencyToolsData;
  onShiftReport: () => void;
  onOpenTool: () => void;
}): JSX.Element {
  const activeCount = data.subClients.filter((s) => s.status === 'active').length;
  const onboardCount = data.subClients.filter((s) => s.status === 'onboarding').length;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/50 p-5 backdrop-blur-sm"
      style={woodGrainCss()}
    >
      {/* foreman strip + workshop name */}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent"
            style={{ boxShadow: '0 8px 24px rgba(242,101,34,0.22)' }}
          >
            <HardHat className="h-6 w-6" />
            <motion.span
              aria-hidden
              className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2"
              style={{ background: TOK.success, borderColor: TOK.surface }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-dim">
              {data.agency.region} · Workshop floor
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xl font-semibold text-text">
              <span>{data.agency.name}</span>
              <span className="text-text-faint">·</span>
              <span className="text-base font-medium text-text-dim">Workshop</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone="accent">
                <Sparkles className="h-3 w-3" />
                Foreman on shift
              </Chip>
              <Chip tone="neutral">
                <Building2 className="h-3 w-3" />
                {activeCount} projects on the bench
              </Chip>
              {onboardCount > 0 ? (
                <Chip tone="accent2">
                  <Plus className="h-3 w-3" />
                  {onboardCount} onboarding
                </Chip>
              ) : null}
              <Chip tone="neutral">
                <Clock className="h-3 w-3" />
                Local shift {clockTime(NOW_ISO)} UTC
              </Chip>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onShiftReport}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-text-dim transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent"
          >
            <FileText className="h-3.5 w-3.5" />
            Shift report
          </button>
          <button
            type="button"
            onClick={onOpenTool}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:border-accent/60 hover:bg-accent/15"
          >
            <Play className="h-3.5 w-3.5" />
            Open a tool
          </button>
        </div>
      </div>

      {/* shift report stats */}
      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ShiftStat
          label="Runs today"
          value={<CountUp value={data.summary.totalRunsToday} />}
          Icon={Activity}
          tone="accent"
          hint="Across all four tools"
          index={0}
        />
        <ShiftStat
          label="30-day total"
          value={<CountUp value={data.summary.totalRuns30d} />}
          Icon={History}
          tone="accent2"
          hint="Avg 16.3/day"
          index={1}
        />
        <ShiftStat
          label="Avg inbox vs spam"
          value={
            <span>
              <CountUp value={data.summary.avgPlacementScore} />
              <span className="ml-0.5 text-[11px] text-text-dim">/100</span>
            </span>
          }
          Icon={Target}
          tone="accent4"
          hint="Inbox % across last week"
          index={2}
        />
        <ShiftStat
          label="In the queue"
          value={<CountUp value={data.summary.queuedRuns} />}
          Icon={Hexagon}
          tone="accent3"
          hint="Pending workshop hand-off"
          index={3}
        />
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Tool illustrations — pure-SVG line drawings in orange. Each tool is hand-
// inked so the bench reads as a craftsman's set of physical implements.
// All paths use HEX.accent for the line / HEX.accent2 for highlights.
// Geometry is tuned for a 200×180 viewBox.
// ---------------------------------------------------------------------------

interface ToolDrawingProps {
  selected: boolean;
  hovered: boolean;
}

function MagnifierDrawing({ selected, hovered }: ToolDrawingProps): JSX.Element {
  const lit = selected || hovered;
  return (
    <svg viewBox="0 0 200 180" className="h-full w-full">
      <defs>
        <linearGradient id="loupe-lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={HEX.accent2} stopOpacity={lit ? 0.45 : 0.25} />
          <stop offset="100%" stopColor={HEX.accent} stopOpacity={lit ? 0.7 : 0.45} />
        </linearGradient>
      </defs>
      <motion.circle cx="78" cy="60" r="42" fill="url(#loupe-lens)" stroke={HEX.accent} strokeWidth={3}
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
      <ellipse cx="64" cy="46" rx="14" ry="8" fill="white" opacity={0.18} />
      <rect x="106" y="80" width="22" height="12" rx="3" fill={HEX.accent2}
        stroke={HEX.accent} strokeWidth={2} transform="rotate(40 117 86)" />
      <rect x="118" y="92" width="14" height="78" rx="6" fill={HEX.accentDeep}
        stroke={HEX.accent} strokeWidth={2} transform="rotate(40 125 131)" />
      <path d="M125 110 L138 122 M122 130 L135 142 M120 150 L132 162" stroke={HEX.accent2}
        strokeWidth={1} strokeLinecap="round" opacity={0.7} transform="rotate(40 125 131)" />
      <path d="M78 38 L78 82 M56 60 L100 60" stroke={HEX.accent} strokeWidth={1}
        strokeDasharray="2 3" opacity={0.5} />
    </svg>
  );
}

function TSquareDrawing({ selected, hovered }: ToolDrawingProps): JSX.Element {
  const lit = selected || hovered;
  return (
    <svg viewBox="0 0 200 180" className="h-full w-full">
      <rect x="14" y="40" width="178" height="16" rx="2" fill={HEX.accent2}
        stroke={HEX.accent} strokeWidth={2} opacity={lit ? 0.95 : 0.85} />
      {Array.from({ length: 17 }).map((_, i) => (
        <line key={i} x1={22 + i * 10} y1={40} x2={22 + i * 10}
          y2={i % 2 === 0 ? 50 : 46} stroke={HEX.accentDeep} strokeWidth={1} />
      ))}
      <rect x="86" y="56" width="28" height="110" rx="3" fill={HEX.accentDeep}
        stroke={HEX.accent} strokeWidth={2} />
      <path d="M92 70 L108 70 M92 92 L108 92 M92 116 L108 116 M92 140 L108 140"
        stroke={HEX.accent2} strokeWidth={1} opacity={0.5} />
      <circle cx="100" cy="36" r="3" fill={HEX.accent} opacity={lit ? 1 : 0.6} />
      <path d="M124 165 L182 165" stroke={HEX.accent} strokeWidth={1}
        strokeDasharray="3 4" opacity={0.45} />
    </svg>
  );
}

function ScannerDrawing({ selected, hovered }: ToolDrawingProps): JSX.Element {
  const lit = selected || hovered;
  return (
    <svg viewBox="0 0 200 180" className="h-full w-full">
      <rect x="38" y="36" width="124" height="92" rx="10" fill={HEX.accentDeep}
        stroke={HEX.accent} strokeWidth={2} />
      <circle cx="100" cy="74" r="22" fill={HEX.accent2} stroke={HEX.accent} strokeWidth={2} />
      <circle cx="100" cy="74" r="14" fill={HEX.bg} stroke={HEX.accent} strokeWidth={1} />
      <motion.line x1="100" y1="74" x2="100" y2="52" stroke={HEX.accent2}
        strokeWidth={2} strokeLinecap="round"
        animate={{ rotate: lit ? 360 : 0 }}
        transition={{ duration: lit ? 3 : 8, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '100px 74px' }} />
      <rect x="148" y="118" width="20" height="38" rx="4" fill={HEX.accentDeep}
        stroke={HEX.accent} strokeWidth={2} />
      <motion.circle cx="60" cy="56" r="3" fill={HEX.accent}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.8, repeat: Infinity }} />
      <path d="M52 116 L80 116 M88 116 L112 116 M120 116 L148 116"
        stroke={HEX.accent2} strokeWidth={1.5} opacity={0.6} />
    </svg>
  );
}

function CompassDrawing({ selected, hovered }: ToolDrawingProps): JSX.Element {
  const lit = selected || hovered;
  return (
    <svg viewBox="0 0 200 180" className="h-full w-full">
      <defs>
        <radialGradient id="compass-face">
          <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.4} />
          <stop offset="100%" stopColor={HEX.accentDeep} stopOpacity={0.8} />
        </radialGradient>
      </defs>
      <circle cx="100" cy="80" r="50" fill="url(#compass-face)" stroke={HEX.accent} strokeWidth={3} />
      <path d="M100 38 L100 122 M58 80 L142 80" stroke={HEX.accent} strokeWidth={1} opacity={0.45} />
      <motion.path d="M100 50 L107 80 L100 110 L93 80 Z" fill={HEX.accent}
        stroke={HEX.accent} strokeWidth={1}
        animate={{ rotate: lit ? [0, 10, -8, 4, 0] : [0, -3, 3, 0] }}
        transition={{ duration: lit ? 2.2 : 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '100px 80px' }} />
      <circle cx="100" cy="80" r="3" fill={HEX.accentDeep} stroke={HEX.accent} strokeWidth={1.5} />
      <path d="M100 130 L100 170" stroke={HEX.accent} strokeWidth={1.5} strokeDasharray="3 3" />
      <path d="M94 170 L106 170 L100 178 Z" fill={HEX.accent2} stroke={HEX.accent} strokeWidth={1} />
      <text x="100" y="34" textAnchor="middle" fontSize="10"
        fontFamily="JetBrains Mono, monospace" fill={HEX.accent}>N</text>
    </svg>
  );
}

function ToolDrawing({
  slug,
  selected,
  hovered,
}: {
  slug: ToolSlug;
  selected: boolean;
  hovered: boolean;
}): JSX.Element {
  if (slug === 'preview') return <MagnifierDrawing selected={selected} hovered={hovered} />;
  if (slug === 'templates') return <TSquareDrawing selected={selected} hovered={hovered} />;
  if (slug === 'spam') return <ScannerDrawing selected={selected} hovered={hovered} />;
  return <CompassDrawing selected={selected} hovered={hovered} />;
}

// ---------------------------------------------------------------------------
// Peg-board — the strip across the top of the bench. Decorative SVG; the
// tools mount in front of it via absolute-positioned divs.
// ---------------------------------------------------------------------------

function Pegboard({ pegCount }: { pegCount: number }): JSX.Element {
  const width = 1100;
  return (
    <svg
      viewBox={`0 0 ${width} 240`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-x-0 top-0 h-[240px] w-full"
      aria-hidden
    >
      {/* peg-board face */}
      <rect
        x="0"
        y="0"
        width={width}
        height={210}
        fill={HEX.surface2}
        opacity={0.65}
      />
      {/* lower trim rail */}
      <rect x="0" y={206} width={width} height={6} fill={HEX.accentDeep} opacity={0.55} />
      {/* peg-board hole grid */}
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 36 }).map((_, col) => (
          <circle
            key={`${row}-${col}`}
            cx={20 + col * 30}
            cy={18 + row * 24}
            r={2.4}
            fill={HEX.bg}
            stroke={HEX.border}
            strokeWidth={0.5}
            opacity={0.6}
          />
        )),
      )}
      {/* peg hooks where each tool hangs */}
      {Array.from({ length: pegCount }).map((_, i) => {
        const x = buildPegX(i, pegCount, width);
        return (
          <g key={`hook-${i}`}>
            <circle cx={x} cy={36} r={4} fill={HEX.accentDeep} stroke={HEX.accent} strokeWidth={1.5} />
            <path
              d={`M${x} 40 Q${x} 52 ${x - 6} 56 Q${x - 12} 60 ${x - 12} 64`}
              stroke={HEX.accent}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tool card — what hangs from each peg-board hook.
// ---------------------------------------------------------------------------

interface ToolHookProps {
  tool: AgencyToolsData['tools'][number];
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
}

function ToolHook({ tool, index, total, selected, onSelect }: ToolHookProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const meta = TOOL_META[tool.slug];
  const xPct = total > 1 ? ((index / (total - 1)) * 76) + 12 : 50;
  const cadence = toolCadenceLabel(tool.runsLast30d);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: selected || hovered ? -8 : 0 }}
      transition={{ duration: 0.5, delay: 0.08 * index, type: 'spring', stiffness: 220, damping: 22 }}
      whileTap={{ y: -4 }}
      className="absolute top-[44px] flex w-[176px] flex-col items-center gap-2 outline-none"
      style={{ left: `calc(${xPct}% - 88px)` }}
    >
      {/* hanging hook indicator */}
      <div
        aria-hidden
        className="h-3 w-px"
        style={{ background: HEX.accent, opacity: 0.7 }}
      />
      {/* tool body — illustrated SVG inside a wooden plaque */}
      <motion.div
        animate={{
          rotate: selected ? 0 : hovered ? [-1, 1, -1] : 0,
          filter: selected
            ? 'drop-shadow(0 12px 24px rgba(242,101,34,0.42))'
            : hovered
              ? 'drop-shadow(0 8px 18px rgba(242,101,34,0.28))'
              : 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
        }}
        transition={{ duration: hovered && !selected ? 2.2 : 0.4, repeat: hovered && !selected ? Infinity : 0 }}
        className={
          'flex h-[120px] w-[170px] items-center justify-center rounded-xl border ' +
          (selected
            ? 'border-accent/70 bg-surface'
            : 'border-border-muted bg-surface/85')
        }
        style={{ ...benchTopCss() }}
      >
        <div className="relative h-[110px] w-[170px]">
          <ToolDrawing slug={tool.slug} selected={selected} hovered={hovered} />
        </div>
      </motion.div>
      {/* dangling tag */}
      <ToolTag
        name={tool.name}
        lastRunAt={tool.lastRunAt}
        cadence={`${meta.trade} · ${cadence}`}
        selected={selected}
      />
      {/* runs count chip */}
      <div className="flex items-center gap-1 text-[10px] text-text-faint">
        <Activity className="h-3 w-3 text-accent" />
        <span className="tabular-nums">{fmtInt(tool.runsLast30d)} runs / 30d</span>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Bench surface — peg-board + tools + decorative paraphernalia.
// ---------------------------------------------------------------------------

function BenchSurface({
  data,
  selectedTool,
  onSelectTool,
}: {
  data: AgencyToolsData;
  selectedTool: ToolSlug | null;
  onSelectTool: (slug: ToolSlug | null) => void;
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/45 backdrop-blur-sm"
      style={woodGrainCss()}
    >
      {/* header */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-border-muted bg-surface-2/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
            <Hammer className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">Tool bench</div>
            <div className="text-[10px] text-text-dim">Pick a tool to open its blueprint</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="neutral">
            <Wrench className="h-3 w-3" />
            {data.tools.length} on the rack
          </Chip>
          <Chip tone="accent">
            <Sparkles className="h-3 w-3" />
            {data.tools.filter((t) => t.available).length} hot-swapped today
          </Chip>
          {selectedTool ? (
            <button
              type="button"
              onClick={() => onSelectTool(null)}
              className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-[10px] text-text-dim transition hover:border-accent/50 hover:text-accent"
            >
              <X className="h-3 w-3" />
              Stow tool
            </button>
          ) : null}
        </div>
      </div>

      {/* peg-board strip + hung tools */}
      <div className="relative h-[440px] w-full">
        <Pegboard pegCount={data.tools.length} />

        {data.tools.map((tool, idx) => (
          <ToolHook
            key={tool.slug}
            tool={tool}
            index={idx}
            total={data.tools.length}
            selected={selectedTool === tool.slug}
            onSelect={() => onSelectTool(selectedTool === tool.slug ? null : tool.slug)}
          />
        ))}

        {/* bench-top horizon line */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-12 h-6 border-y border-border-muted/60"
          style={benchTopCss()}
        />
        {/* bench legs (decorative) */}
        <div
          aria-hidden
          className="absolute bottom-0 left-[10%] h-12 w-3 rounded-sm"
          style={{ background: HEX.accentDeep, opacity: 0.45 }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-[10%] h-12 w-3 rounded-sm"
          style={{ background: HEX.accentDeep, opacity: 0.45 }}
        />
      </div>

      {/* bench micro-helper strip */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-border-muted bg-surface/55 px-4 py-2 text-[10px] text-text-dim">
        <div className="inline-flex items-center gap-1.5">
          <Anvil className="h-3 w-3 text-accent" />
          Workbench surface · solid orange-oak
        </div>
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Pickaxe className="h-3 w-3 text-accent2" />
            Hover to lift
          </span>
          <span className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            Click to open the blueprint
          </span>
        </div>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Project drawer strip — sub-clients as wooden drawer compartments.
// ---------------------------------------------------------------------------

interface DrawerProps {
  sub: AgencyToolsData['subClients'][number];
  runsCount: number;
  selected: boolean;
  index: number;
  onSelect: () => void;
}

function ProjectDrawer({ sub, runsCount, selected, index, onSelect }: DrawerProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const lifted = selected || hovered;
  const statusColor = subClientStatusTone(sub.status);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06 * index }}
      className={
        'relative flex w-[180px] flex-shrink-0 flex-col rounded-lg border text-left outline-none transition-all ' +
        (selected
          ? 'border-accent/60 bg-surface'
          : 'border-border-muted bg-surface/80 hover:border-accent/40')
      }
      style={{
        ...woodGrainCss(),
        boxShadow: selected
          ? '0 18px 36px rgba(242,101,34,0.18), inset 0 1px 0 rgba(255,255,255,0.04)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* drawer-pull motion: x-translates left when selected/hovered to mimic being pulled out */}
      <motion.div
        animate={{ x: lifted ? -8 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="flex w-full flex-col rounded-lg px-3 py-2.5"
      >
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-text">{sub.name}</div>
          <span
            aria-hidden
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: statusColor }}
          />
        </div>
        <div className="mt-0.5 truncate text-[10px] text-text-faint">{sub.domain}</div>

        <div className="mt-2 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1 text-text-dim">
            <Mail className="h-3 w-3 text-accent" />
            <span className="tabular-nums">{sub.mailboxCount} mailboxes</span>
          </div>
          <div className="flex items-center gap-1 text-text-dim">
            <Activity className="h-3 w-3 text-accent2" />
            <span className="tabular-nums">{runsCount} runs</span>
          </div>
        </div>

        {/* drawer handle */}
        <div
          aria-hidden
          className="mt-2.5 flex h-2 items-center justify-center rounded-full"
          style={{ background: TOK.borderStrong }}
        >
          <span
            className="h-1 w-10 rounded-full"
            style={{ background: lifted ? HEX.accent : HEX.borderStrong, transition: 'background 200ms' }}
          />
        </div>
      </motion.div>

      {/* drawer slot side highlight when pulled */}
      {lifted ? (
        <motion.span
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -right-1 top-2 bottom-2 w-1 rounded-r-md"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(242,101,34,0.4), transparent)' }}
        />
      ) : null}
    </motion.button>
  );
}

function DrawerStrip({
  data,
  selectedTool,
  selectedSubId,
  onSelectSub,
}: {
  data: AgencyToolsData;
  selectedTool: ToolSlug | null;
  selectedSubId: string | null;
  onSelectSub: (id: string | null) => void;
}): JSX.Element {
  const runsBySub = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of data.recentRuns) {
      if (selectedTool && r.toolSlug !== selectedTool) continue;
      out[r.subClientId] = (out[r.subClientId] ?? 0) + 1;
    }
    return out;
  }, [data.recentRuns, selectedTool]);

  const openSub =
    selectedSubId !== null ? data.subClients.find((s) => s.id === selectedSubId) ?? null : null;
  const openRuns = openSub
    ? uniqueDrawerWorkOrders(
        data.recentRuns,
        openSub.id,
        selectedTool ?? 'all',
      )
    : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.18 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/50 p-4 backdrop-blur-sm"
      style={woodGrainCss()}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent2/10 text-accent2">
            <Boxes className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">Project drawers</div>
            <div className="text-[10px] text-text-dim">
              Each compartment is a sub-client. Open one to see its runs
              {selectedTool ? ` of ${TOOL_META[selectedTool].iconName}` : ''}.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="neutral">
            <Building2 className="h-3 w-3" />
            {data.subClients.length} sub-clients
          </Chip>
          {selectedTool ? (
            <Chip tone="accent">
              <Filter className="h-3 w-3" />
              Filtered to {TOOL_META[selectedTool].iconName}
            </Chip>
          ) : (
            <Chip tone="neutral">
              <Filter className="h-3 w-3" />
              All tools
            </Chip>
          )}
        </div>
      </div>

      {/* drawer row */}
      <div
        className="flex w-full gap-3 overflow-x-auto pb-1 pt-1"
        role="tablist"
        aria-label="Sub-client project drawers"
      >
        {data.subClients.map((sub, idx) => (
          <ProjectDrawer
            key={sub.id}
            sub={sub}
            runsCount={runsBySub[sub.id] ?? 0}
            selected={selectedSubId === sub.id}
            index={idx}
            onSelect={() => onSelectSub(selectedSubId === sub.id ? null : sub.id)}
          />
        ))}
      </div>

      {/* opened drawer contents */}
      <AnimatePresence initial={false}>
        {openSub ? (
          <motion.div
            key={openSub.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mt-4 overflow-hidden rounded-xl border border-border-muted bg-surface/70"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted bg-surface-2/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-accent" />
                <div className="text-sm font-medium text-text">{openSub.name}</div>
                <span className="text-text-faint">·</span>
                <span className="text-[11px] text-text-dim">{openSub.domain}</span>
                <Chip tone="neutral">{subClientStatusLabel(openSub.status)}</Chip>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3 text-accent" />
                  {openSub.mailboxCount} mailboxes
                </span>
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3 text-accent2" />
                  {openRuns.length} runs in scope
                </span>
              </div>
            </div>
            {openRuns.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-text-dim">
                No runs in scope for this drawer. Try a different tool or unstow the tool.
              </div>
            ) : (
              <ul className="divide-y divide-border-muted/60">
                {openRuns.slice(0, 5).map((run, idx) => (
                  <motion.li
                    key={run.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.04 * idx }}
                    className="flex items-start gap-3 px-3 py-2.5"
                  >
                    <StatusPip status={run.status} size={7} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-text">
                        <span className="font-medium">{TOOL_META[run.toolSlug].iconName}</span>
                        <span className="text-text-faint">·</span>
                        <span className="text-text-dim">{relativeTime(run.startedAt)}</span>
                        <span className={'ml-1 ' + runStatusToneText(run.status)}>
                          {runStatusLabel(run.status)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[10.5px] text-text-dim">{run.summary}</div>
                    </div>
                    <div className="flex flex-col items-end text-[10px] text-text-faint">
                      <span className="tabular-nums">{fmtDuration(run.durationMs)}</span>
                      <span>{clockTime(run.startedAt)}</span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Blueprint panel — right-rail engineering drawing. Greys + orange only.
// ---------------------------------------------------------------------------

function BlueprintTitle({
  tool,
  meta,
}: {
  tool: AgencyToolsData['tools'][number];
  meta: ToolMeta;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between border-b border-border-muted pb-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-text-faint">Blueprint · sheet 1 of 1</div>
        <div className="mt-1 flex items-center gap-2 text-base font-semibold text-text">
          <PenTool className="h-3.5 w-3.5 text-accent" />
          <span>{tool.name}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-text-dim">
          {meta.iconName} · {meta.trade}
        </div>
      </div>
      <div className="rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-[9px] uppercase tracking-widest text-text-dim">
        Rev · A
      </div>
    </div>
  );
}

function BlueprintDrawing({
  slug,
  meta,
}: {
  slug: ToolSlug;
  meta: ToolMeta;
}): JSX.Element {
  return (
    <div
      className="relative h-[260px] overflow-hidden rounded-lg border border-border-muted bg-surface-2/40"
      style={blueprintGridCss()}
    >
      {/* axis label */}
      <div className="absolute left-2 top-2 flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-faint">
        <Crosshair className="h-3 w-3" />
        ORIGIN
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-faint">
        SHEET A · 1:4
      </div>
      {/* tool drawing centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[180px] w-[200px]">
          <ToolDrawing slug={slug} selected hovered={false} />
        </div>
      </div>
      {/* part labels with leader lines */}
      <svg viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {meta.partLabels.map((p, idx) => {
          // anchor the leader line from the centered drawing's bounding-box
          const cx = 180;
          const cy = 130;
          const dx = p.x - 100;
          const dy = p.y - 90;
          const tx = cx + dx;
          const ty = cy + dy;
          const lx = idx % 2 === 0 ? 28 : 332;
          const ly = 36 + idx * 32;
          return (
            <g key={p.id}>
              <motion.path
                d={`M ${tx} ${ty} L ${lx} ${ly}`}
                stroke={HEX.accent}
                strokeWidth={0.8}
                strokeDasharray="2 3"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.7 }}
                transition={{ duration: 0.7, delay: 0.2 + 0.12 * idx }}
              />
              <motion.circle
                cx={tx}
                cy={ty}
                r={2}
                fill={HEX.accent}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 + 0.12 * idx }}
              />
              <motion.g
                initial={{ opacity: 0, x: idx % 2 === 0 ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + 0.12 * idx }}
              >
                <rect
                  x={idx % 2 === 0 ? 8 : 296}
                  y={ly - 8}
                  width={40}
                  height={16}
                  rx={2}
                  fill={HEX.surface}
                  stroke={HEX.accent}
                  strokeWidth={0.6}
                  opacity={0.9}
                />
                <text
                  x={lx}
                  y={ly + 1}
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                  fill={HEX.accent2}
                  textAnchor={idx % 2 === 0 ? 'start' : 'end'}
                >
                  {`(${idx + 1})`}
                </text>
              </motion.g>
            </g>
          );
        })}
      </svg>
      {/* scale strip bottom */}
      <div className="absolute inset-x-3 bottom-2 flex items-center justify-between text-[8.5px] uppercase tracking-widest text-text-faint">
        <span>0</span>
        <span>10</span>
        <span>20</span>
        <span>30</span>
        <span>cm</span>
      </div>
    </div>
  );
}

function BlueprintLegend({ meta }: { meta: ToolMeta }): JSX.Element {
  return (
    <div className="mt-4 rounded-lg border border-border-muted bg-surface-2/50 p-3">
      <div className="flex items-center gap-2 border-b border-border-muted/70 pb-2">
        <Layers className="h-3.5 w-3.5 text-accent" />
        <span className="text-[10px] uppercase tracking-widest text-text-dim">Parts schedule</span>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-1.5 text-[10.5px]">
        {meta.partLabels.map((p, idx) => (
          <motion.li
            key={p.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.4 + 0.08 * idx }}
            className="flex items-center justify-between gap-2 text-text-dim"
          >
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-accent/60 bg-surface text-[8px] font-mono text-accent"
              >
                {idx + 1}
              </span>
              <span className="text-text">{p.label}</span>
            </span>
            <span className="font-mono text-text-faint">
              {String.fromCharCode(65 + idx)}-{(idx + 1) * 17}
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/5 p-2 text-[10px] text-text-dim">
        <PenTool className="h-3 w-3 flex-shrink-0 text-accent" />
        <span>{meta.blueprintLegend}</span>
      </div>
    </div>
  );
}

function BlueprintHistory({
  runs,
  toolSlug,
}: {
  runs: AgencyToolsData['recentRuns'];
  toolSlug: ToolSlug;
}): JSX.Element {
  const scoped = useMemo(
    () => runs.filter((r) => r.toolSlug === toolSlug).slice(0, 6),
    [runs, toolSlug],
  );
  return (
    <div className="mt-4 rounded-lg border border-border-muted bg-surface-2/50 p-3">
      <div className="flex items-center justify-between border-b border-border-muted/70 pb-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-accent2" />
          <span className="text-[10px] uppercase tracking-widest text-text-dim">Run log</span>
        </div>
        <Chip tone="neutral">{scoped.length} in 24h</Chip>
      </div>
      {scoped.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-text-dim">No runs recorded yet.</div>
      ) : (
        <ul className="mt-2 space-y-2 text-[10.5px]">
          {scoped.map((run, idx) => (
            <motion.li
              key={run.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + 0.05 * idx }}
              className="flex items-start gap-2 rounded-md border border-border-muted/60 bg-surface/60 p-2"
            >
              <StatusPip status={run.status} size={6} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-text">
                  <span className="truncate font-medium">{run.subClientName}</span>
                  <span className="font-mono text-[9px] text-text-faint">
                    {clockTime(run.startedAt)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-text-dim">{run.summary}</div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyBlueprintPanel(): JSX.Element {
  return (
    <motion.div
      key="empty-blueprint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border-muted bg-surface/40 p-6 text-center backdrop-blur-sm"
      style={woodGrainCss()}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
        <PenTool className="h-6 w-6" />
      </div>
      <div className="mt-3 text-sm font-medium text-text">No blueprint open</div>
      <div className="mt-1 max-w-xs text-[11px] text-text-dim">
        Lift a tool off the peg-board to flip its drawing onto the bench. Hover first, then
        click — the workshop loads the matching diagram and run log.
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-faint">
        <Wrench className="h-3 w-3" />
        <span>4 tools · 24 recent runs</span>
        <Compass className="h-3 w-3" />
      </div>
    </motion.div>
  );
}

function BlueprintPanel({
  data,
  toolSlug,
}: {
  data: AgencyToolsData;
  toolSlug: ToolSlug | null;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <AnimatePresence mode="wait">
      {toolSlug === null ? (
        <EmptyBlueprintPanel />
      ) : (
        <motion.aside
          key={toolSlug}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 18 }}
          transition={{ duration: 0.45, type: 'spring', stiffness: 220, damping: 24 }}
          className="relative h-full overflow-hidden rounded-2xl border border-border-muted bg-surface/55 p-4 backdrop-blur-sm"
        >
          {/* corner stamp */}
          <div className="absolute right-3 top-3 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-accent">
            {TOOL_META[toolSlug].iconName.toUpperCase()}-{(toolSlug.length * 7).toString().padStart(3, '0')}
          </div>
          {(() => {
            const tool = data.tools.find((t) => t.slug === toolSlug);
            if (!tool) return null;
            const meta = TOOL_META[toolSlug];
            return (
              <>
                <BlueprintTitle tool={tool} meta={meta} />
                <div className="mt-3">
                  <BlueprintDrawing slug={toolSlug} meta={meta} />
                </div>
                <div className="mt-3 rounded-md border border-border-muted bg-surface/60 p-3 text-[11px] text-text-dim">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                    <span>{tool.description}</span>
                  </div>
                </div>
                <BlueprintLegend meta={meta} />
                <BlueprintHistory runs={data.recentRuns} toolSlug={toolSlug} />
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-text-faint">
                    <ShieldCheck className="h-3 w-3 text-accent" />
                    Opens the live {meta.iconName} tool on the production bench
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        toolSlug
                          ? `/app/tools/${toolSlug}`
                          : '/app/tools',
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:border-accent/60 hover:bg-accent/15"
                  >
                    Use this tool
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            );
          })()}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Footer rack — inventory bar of tool availability.
// ---------------------------------------------------------------------------

function RackCounter({
  label,
  value,
  Icon,
  tone,
  hint,
  index,
}: {
  label: string;
  value: number;
  Icon: typeof Wrench;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  hint: string;
  index: number;
}): JSX.Element {
  const toneClass: Record<typeof tone, string> = {
    accent: 'text-accent border-accent/40 bg-accent/8',
    accent2: 'text-accent2 border-accent2/40 bg-accent2/8',
    accent3: 'text-accent3 border-accent3/40 bg-accent3/8',
    accent4: 'text-accent4 border-accent4/40 bg-accent4/8',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      className="relative flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface/65 px-3 py-2"
      style={woodGrainCss()}
    >
      <div className="flex items-center gap-2">
        <span className={'flex h-7 w-7 items-center justify-center rounded-md border ' + toneClass[tone]}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-faint">{label}</div>
          <div className="text-base font-semibold text-text tabular-nums">{value}</div>
        </div>
      </div>
      <div className="hidden text-[10px] text-text-dim sm:block">{hint}</div>
    </motion.div>
  );
}

function ToolsRackFooter({ data }: { data: AgencyToolsData }): JSX.Element {
  const available = data.tools.filter((t) => t.available).length;
  // "In use" = anything that has a run within the last 24h.
  const cutoff = Date.parse(NOW_ISO) - 24 * 3600 * 1000;
  const inUseSlugs = new Set<ToolSlug>();
  for (const r of data.recentRuns) {
    if (Date.parse(r.startedAt) >= cutoff) inUseSlugs.add(r.toolSlug);
  }
  const inUse = inUseSlugs.size;
  // "Maintenance" = unavailable; "Idle" = available but no runs in 24h.
  const maintenance = data.tools.filter((t) => !t.available).length;
  const idle = data.tools.filter(
    (t) => t.available && !inUseSlugs.has(t.slug),
  ).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-border-muted bg-surface/45 p-3 backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-4"
    >
      <RackCounter
        label="Available tools"
        value={available}
        Icon={Wrench}
        tone="accent"
        hint="Fully serviced"
        index={0}
      />
      <RackCounter
        label="In use"
        value={inUse}
        Icon={Hammer}
        tone="accent2"
        hint="Hot in the last 24h"
        index={1}
      />
      <RackCounter
        label="Maintenance"
        value={maintenance}
        Icon={Drill}
        tone="accent3"
        hint="Currently out of service"
        index={2}
      />
      <RackCounter
        label="Idle"
        value={idle}
        Icon={CircleDot}
        tone="accent4"
        hint="Hung up, awaiting work"
        index={3}
      />
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Decorative bench accessories — small floating motes of "sawdust" that drift
// gently across the bench. RAF-driven but cheap; framer-motion handles the
// loop.
// ---------------------------------------------------------------------------

interface Mote {
  id: number;
  x: number;
  delay: number;
  duration: number;
  size: number;
}

function buildMotes(count: number): Mote[] {
  const out: Mote[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      x: (i * 13) % 100,
      delay: (i * 0.7) % 6,
      duration: 8 + ((i * 5) % 6),
      size: 2 + ((i * 3) % 4),
    });
  }
  return out;
}

function SawdustMotes(): JSX.Element {
  const motes = useMemo(() => buildMotes(12), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {motes.map((m) => (
        <motion.div
          key={m.id}
          initial={{ y: '-10%', opacity: 0 }}
          animate={{
            y: ['-10%', '110%'],
            opacity: [0, 0.5, 0.5, 0],
            x: ['0%', '6%', '-4%', '0%'],
          }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.15, 0.85, 1],
          }}
          className="absolute rounded-full"
          style={{
            left: `${m.x}%`,
            width: m.size,
            height: m.size,
            background: HEX.accent2,
            boxShadow: `0 0 4px ${HEX.accent2}`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools timetable — a tiny table beneath the drawer strip showing the cadence
// of each tool over the last 30 days. Sparkline-style bars.
// ---------------------------------------------------------------------------

function CadenceBar({ ratio, tone }: { ratio: number; tone: string }): JSX.Element {
  const pct = Math.max(2, Math.min(100, ratio * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg/60">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ background: tone }}
      />
    </div>
  );
}

function ToolCadenceCard({ data }: { data: AgencyToolsData }): JSX.Element {
  const max = data.tools.reduce((m, t) => Math.max(m, t.runsLast30d), 0) || 1;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.22 }}
      className="rounded-2xl border border-border-muted bg-surface/50 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
            <TrendingUp className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">Tool pace · last 30d</div>
            <div className="text-[10px] text-text-dim">Workshop tempo per implement</div>
          </div>
        </div>
        <Chip tone="neutral">
          <Clock className="h-3 w-3" />
          {formatNumber(data.summary.totalRuns30d)} total
        </Chip>
      </div>
      <ul className="grid grid-cols-1 gap-2.5">
        {data.tools.map((t, idx) => {
          const meta = TOOL_META[t.slug];
          const tone = idx % 2 === 0 ? HEX.accent : HEX.accent2;
          return (
            <motion.li
              key={t.slug}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.06 * idx + 0.25 }}
              className="grid grid-cols-[140px_1fr_64px] items-center gap-3"
            >
              <div className="flex items-center gap-2 text-[11px]">
                <meta.Icon className="h-3.5 w-3.5 text-accent" />
                <span className="text-text">{meta.iconName}</span>
              </div>
              <CadenceBar ratio={t.runsLast30d / max} tone={tone} />
              <div className="text-right text-[11px] text-text-dim">
                <span className="tabular-nums text-text">{fmtInt(t.runsLast30d)}</span>
                <span className="ml-1 text-[9px] text-text-faint">runs</span>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Workshop tips — a small inspector card under the rack, surfaces "what's
// next on the bench" copy. Static but adds editorial polish.
// ---------------------------------------------------------------------------

interface Tip {
  id: string;
  Icon: typeof Wrench;
  headline: string;
  body: string;
  tone: 'accent' | 'accent2' | 'accent4';
}

function buildTips(data: AgencyToolsData): Tip[] {
  const tips: Tip[] = [];
  const failedRuns = data.recentRuns.filter((r) => r.status === 'failed');
  if (failedRuns.length > 0) {
    tips.push({
      id: 'tip-failed',
      Icon: AlertTriangle,
      headline: `${failedRuns.length} run${failedRuns.length === 1 ? '' : 's'} need rework`,
      body:
        'Pop the affected sub-client drawers and re-run the Scanner before re-attempting the Compass probe — clean spam-score first, then test inbox vs spam.',
      tone: 'accent4',
    });
  }
  if (data.summary.queuedRuns > 0) {
    tips.push({
      id: 'tip-queue',
      Icon: Hexagon,
      headline: `${data.summary.queuedRuns} job${data.summary.queuedRuns === 1 ? '' : 's'} in the press`,
      body:
        'Workshop will dispatch them as workers free up. You can stow the Loupe in the meantime and let the bench breathe.',
      tone: 'accent2',
    });
  }
  tips.push({
    id: 'tip-placement',
    Icon: Compass,
    headline: `Average inbox vs spam holds at ${data.summary.avgPlacementScore}/100`,
    body:
      'The compass is reading steady across all live projects. The plumb-line confirms no DMARC drift — keep the pace as-is.',
    tone: 'accent',
  });
  tips.push({
    id: 'tip-template',
    Icon: Ruler,
    headline: 'T-square ready for the next draft cohort',
    body:
      'Three template families graduated to staging this morning. Move them onto the bench when the next sub-client onboards.',
    tone: 'accent2',
  });
  return tips;
}

function WorkshopTips({ data }: { data: AgencyToolsData }): JSX.Element {
  const tips = useMemo(() => buildTips(data), [data]);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.3 }}
      className="rounded-2xl border border-border-muted bg-surface/50 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent2/10 text-accent2">
            <Wand2 className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">Workshop tips</div>
            <div className="text-[10px] text-text-dim">Foreman's notes from this morning's stand-up</div>
          </div>
        </div>
        <Chip tone="neutral">{tips.length} notes</Chip>
      </div>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {tips.map((tip, idx) => {
          const TipIcon = tip.Icon;
          const toneClass: Record<typeof tip.tone, string> = {
            accent: 'border-accent/30 bg-accent/5 text-accent',
            accent2: 'border-accent2/30 bg-accent2/5 text-accent2',
            accent4: 'border-accent4/30 bg-accent4/5 text-accent4',
          };
          return (
            <motion.li
              key={tip.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * idx + 0.36 }}
              className={'flex gap-3 rounded-xl border p-3 ' + toneClass[tip.tone]}
            >
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-surface-2">
                <TipIcon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-text">{tip.headline}</div>
                <div className="mt-1 text-[10.5px] text-text-dim">{tip.body}</div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Recent run book — wide-card list of the last 12 runs across the workshop.
// Wood-toned rows, status pip, summary, sub-client + duration. Standalone
// and read-only.
// ---------------------------------------------------------------------------

function RunBook({ data }: { data: AgencyToolsData }): JSX.Element {
  const [filter, setFilter] = useState<'all' | ToolSlug>('all');
  const [showAll, setShowAll] = useState(false);
  const matching = useMemo(
    () => data.recentRuns.filter((r) => filter === 'all' || r.toolSlug === filter),
    [data.recentRuns, filter],
  );
  const filtered = showAll ? matching : matching.slice(0, 12);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.38 }}
      className="rounded-2xl border border-border-muted bg-surface/50 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted bg-surface-2/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">Run book</div>
            <div className="text-[10px] text-text-dim">Last 12 dispatches across the workshop</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={
              'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition ' +
              (filter === 'all'
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-border-muted bg-surface text-text-dim hover:border-accent/40 hover:text-accent')
            }
          >
            All
          </button>
          {data.tools.map((t) => {
            const FilterIcon = TOOL_META[t.slug].Icon;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => setFilter(t.slug)}
                className={
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition ' +
                  (filter === t.slug
                    ? 'border-accent/60 bg-accent/15 text-accent'
                    : 'border-border-muted bg-surface text-text-dim hover:border-accent/40 hover:text-accent')
                }
              >
                <FilterIcon className="h-3 w-3" />
                {TOOL_META[t.slug].iconName}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="divide-y divide-border-muted/60">
        {filtered.map((run, idx) => {
          const meta = TOOL_META[run.toolSlug];
          return (
            <motion.li
              key={run.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.04 * idx + 0.44 }}
              className="grid grid-cols-[24px_1fr_120px_80px] items-center gap-3 px-4 py-2.5"
            >
              <StatusPip status={run.status} size={7} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11.5px] text-text">
                  <meta.Icon className="h-3.5 w-3.5 text-accent" />
                  <span className="font-medium">{meta.iconName}</span>
                  <span className="text-text-faint">→</span>
                  <span className="truncate">{run.subClientName}</span>
                  <span className={'ml-1 text-[10px] ' + runStatusToneText(run.status)}>
                    {runStatusLabel(run.status)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-text-dim">{run.summary}</div>
              </div>
              <div className="text-right text-[10.5px] text-text-dim">
                <div className="tabular-nums">{relativeTime(run.startedAt)}</div>
                <div className="text-[9.5px] text-text-faint">{clockTime(run.startedAt)} UTC</div>
              </div>
              <div className="text-right text-[10.5px] text-text">
                <span className="tabular-nums">{fmtDuration(run.durationMs)}</span>
              </div>
            </motion.li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-[11px] text-text-dim">
            No dispatches for that filter yet.
          </li>
        ) : null}
      </ul>
      <div className="flex items-center justify-between border-t border-border-muted/60 px-4 py-2 text-[10px] text-text-faint">
        <span className="inline-flex items-center gap-1">
          <Search className="h-3 w-3" />
          {showAll
            ? `showing all ${filtered.length}`
            : `showing latest ${filtered.length}`}
        </span>
        {matching.length > 12 || showAll ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface px-2 py-0.5 text-text-dim transition hover:border-accent/50 hover:text-accent"
          >
            {showAll ? 'Collapse' : 'Full ledger'}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Main export.
// ---------------------------------------------------------------------------

interface PageProps {
  data?: AgencyToolsData;
}

export function AgTolT3Workshop({ data }: PageProps = {}): JSX.Element {
  const d = data ?? MOCK;
  const navigate = useNavigate();

  // Selected tool drives the blueprint panel + filter pill on the drawer strip.
  const [selectedTool, setSelectedTool] = useState<ToolSlug | null>(null);

  // Bench anchor — "Open a tool" scrolls the peg-board into view after
  // selecting the first tool station.
  const benchRef = useRef<HTMLDivElement | null>(null);

  // "Open a tool" — lift the first tool off the rack (drives the blueprint
  // panel via the same selected-tool state the bench uses) and scroll to it.
  const handleOpenTool = () => {
    const first = d.tools[0];
    if (first) {
      setSelectedTool(first.slug);
      benchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate('/app/tools');
    }
  };

  // "Shift report" — export the workshop run log to CSV.
  const handleShiftReport = () => {
    const count = exportRowsToCsv(
      `tools-shift-report-${exportStamp()}`,
      d.recentRuns,
      [
        { header: 'Run ID', value: (r) => r.id },
        { header: 'Tool', value: (r) => TOOL_META[r.toolSlug].iconName },
        { header: 'Tool slug', value: (r) => r.toolSlug },
        { header: 'Sub-client', value: (r) => r.subClientName },
        { header: 'Started at', value: (r) => r.startedAt },
        { header: 'Status', value: (r) => runStatusLabel(r.status) },
        { header: 'Duration (ms)', value: (r) => r.durationMs },
        { header: 'Summary', value: (r) => r.summary },
      ],
    );
    toast.success(`Exported ${count} workshop ${count === 1 ? 'run' : 'runs'}`);
  };

  // Opened drawer (sub-client) — only one drawer can be open at a time so the
  // bench reads as physical.
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Reset the drawer when the tool changes to a different slug. Keeping a
  // stale drawer open across tool switches looks wrong (its row count chip
  // would lag).
  const lastToolRef = useRef<ToolSlug | null>(null);
  useEffect(() => {
    if (lastToolRef.current !== selectedTool) {
      lastToolRef.current = selectedTool;
    }
  }, [selectedTool]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-text">
      <WorkshopBackdrop />
      <SawdustMotes />
      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6">
        <WorkshopHeader
          data={d}
          onShiftReport={handleShiftReport}
          onOpenTool={handleOpenTool}
        />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* MAIN CANVAS */}
          <div ref={benchRef} className="flex flex-col gap-5 lg:col-span-8">
            <BenchSurface
              data={d}
              selectedTool={selectedTool}
              onSelectTool={setSelectedTool}
            />
            <DrawerStrip
              data={d}
              selectedTool={selectedTool}
              selectedSubId={selectedSubId}
              onSelectSub={setSelectedSubId}
            />
            <ToolCadenceCard data={d} />
          </div>

          {/* RIGHT BLUEPRINT RAIL */}
          <aside className="lg:col-span-4">
            <BlueprintPanel data={d} toolSlug={selectedTool} />
          </aside>
        </div>

        <RunBook data={d} />
        <ToolsRackFooter data={d} />
        <WorkshopTips data={d} />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-muted bg-surface/40 px-4 py-3 text-[10.5px] text-text-dim">
          <div className="inline-flex items-center gap-2">
            <Shield className="h-3 w-3 text-accent" />
            Workshop is read-only in this preview · jobs are dispatched live
            on the production bench
          </div>
          <div className="inline-flex items-center gap-1">
            <MoreHorizontal className="h-3 w-3" />
            Variant T3 · Workshop Drawer
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgTolT3Workshop;
