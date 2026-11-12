import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cog,
  Download,
  Droplet,
  FileSpreadsheet,
  FileText,
  Flame,
  Folder,
  Gauge,
  GripVertical,
  Hash,
  Layers,
  MapPin,
  Pause,
  Play,
  Printer,
  Radio,
  Settings,
  Sparkles,
  Stamp,
  Tag,
  Timer,
  Wrench,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgRptR2Press — Agency-tier Reports, design candidate R2, "Printing Press".
 *
 * The Agency Reports surface re-imagined as an industrial printing press.
 * Reports are not generated, they are PRINTED — fed in as raw queue stock
 * on the left, run through rolling cylinders in the centre, and rolled
 * out onto an output table on the right as finished bound documents.
 *
 * The press itself is the spectacle: counter-rotating cylinders, a
 * continuous belt with travelling orange dots, an ink-roller cluster,
 * and a glowing "PRINTING NOW" sheet at the press head. Surrounding it:
 * four ink wells colour-coded by report type (Warmth / Engagement /
 * Placement / White-label), a vertical print queue rail on the left
 * with a drag-handle affordance, and finished output stacks across the
 * footer — each stack labelled by sub-client with a "just printed" glow
 * pulse that fades on settle.
 *
 * Industrial / workshop aesthetic: greasy oiled-metal surfaces (orange
 * tinted dark greys), mechanical line-art, drop-shadowed cylinders.
 * Live counters tick at the top: PRINTED TODAY, QUEUE DEPTH, INK LEVEL,
 * PRESS UPTIME.
 *
 * Fully STANDALONE — no network, router, query hooks, no required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists. Not a card grid, not a table, not a
 * timeline. The printing-press identity (animated belt + cylinders +
 * paper feed + ink wells) is the differentiator versus the sibling R1
 * / R3 / R4 Agency Reports variants.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape (kept in sync across all candidates).
// Re-exported so sibling files can `import type { AgencyReportsData }`.
// ---------------------------------------------------------------------------

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';
export type ReportFormat = 'pdf' | 'csv';
export type ReportStatus = 'draft' | 'queued' | 'generating' | 'ready' | 'failed';

export interface AgencyReportsData {
  agency: { name: string; region: string };
  subClients: Array<{
    id: string;
    name: string;
    domain: string;
    mailboxCount: number;
  }>;
  reports: Array<{
    id: string;
    title: string;
    type: ReportType;
    format: ReportFormat;
    status: ReportStatus;
    subClientId: string | null;
    subClientName: string | null;
    createdAt: string;
    rangeLabel: string;
    sizeBytes: number;
    downloadCount: number;
    coverHeadline: string;
    coverPullQuote: string;
  }>;
  scheduled: Array<{
    id: string;
    title: string;
    type: ReportType;
    cadence: 'daily' | 'weekly' | 'monthly';
    nextRunAt: string;
    subClientIds: string[];
    recipientCount: number;
  }>;
  summary: {
    reportsThisMonth: number;
    reportsTotal: number;
    downloadsThisMonth: number;
    scheduledActive: number;
  };
}

// ---------------------------------------------------------------------------
// MOCK — Northwind Outreach agency, 12 sub-clients, realistic publishing run.
// Every collection is populated so the press renders fully without an API.
// ---------------------------------------------------------------------------

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Outreach', region: 'EMEA / Western Europe' },
  subClients: [
    { id: 'sc-acme', name: 'Acme Industries', domain: 'acme.io', mailboxCount: 24 },
    { id: 'sc-orbital', name: 'Orbital Robotics', domain: 'orbital.ai', mailboxCount: 22 },
    { id: 'sc-helix', name: 'Helix Biotech', domain: 'helixbio.co', mailboxCount: 20 },
    { id: 'sc-northbound', name: 'Northbound Capital', domain: 'northbound.fund', mailboxCount: 18 },
    { id: 'sc-paragon', name: 'Paragon Logistics', domain: 'paragon.ship', mailboxCount: 18 },
    { id: 'sc-meridian', name: 'Meridian Health', domain: 'meridian.care', mailboxCount: 16 },
    { id: 'sc-tessera', name: 'Tessera Labs', domain: 'tessera.dev', mailboxCount: 14 },
    { id: 'sc-cobalt', name: 'Cobalt Studios', domain: 'cobalt.studio', mailboxCount: 14 },
    { id: 'sc-rivet', name: 'Rivet Manufacturing', domain: 'rivetmfg.com', mailboxCount: 12 },
    { id: 'sc-keystone', name: 'Keystone Realty', domain: 'keystone.estate', mailboxCount: 10 },
    { id: 'sc-stellar', name: 'Stellar Apparel', domain: 'stellar.wear', mailboxCount: 10 },
    { id: 'sc-driftwood', name: 'Driftwood Coffee', domain: 'driftwood.coffee', mailboxCount: 8 },
  ],
  reports: [
    {
      id: 'rep-001',
      title: 'May Warmth Health · Acme Industries',
      type: 'warmth',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-acme',
      subClientName: 'Acme Industries',
      createdAt: '2026-05-29T08:14:00Z',
      rangeLabel: 'May 1 – May 28',
      sizeBytes: 2_840_000,
      downloadCount: 14,
      coverHeadline: 'Warmth score crossed 84 — Acme is in premium territory.',
      coverPullQuote: '"The ramp curve held textbook shape through day 45."',
    },
    {
      id: 'rep-002',
      title: 'Q2 Engagement Drilldown · Orbital Robotics',
      type: 'engagement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Robotics',
      createdAt: '2026-05-28T16:42:00Z',
      rangeLabel: 'Apr 1 – May 28',
      sizeBytes: 4_120_000,
      downloadCount: 11,
      coverHeadline: 'Reply lift of 12.9% MoM driven by Gmail B2B cohort.',
      coverPullQuote: '"Outlook still trails. Two open avenues for triage."',
    },
    {
      id: 'rep-003',
      title: 'Inbox Placement Audit · Helix Biotech',
      type: 'placement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-helix',
      subClientName: 'Helix Biotech',
      createdAt: '2026-05-28T12:08:00Z',
      rangeLabel: 'May 15 – May 28',
      sizeBytes: 3_360_000,
      downloadCount: 9,
      coverHeadline: '93.6% landed primary inbox across all providers.',
      coverPullQuote: '"Yahoo deliverability remains the ceiling — by 1.4pp."',
    },
    {
      id: 'rep-004',
      title: 'Weekly White-label Pack · Northbound Capital',
      type: 'white_label',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-northbound',
      subClientName: 'Northbound Capital',
      createdAt: '2026-05-27T09:00:00Z',
      rangeLabel: 'May 19 – May 26',
      sizeBytes: 1_840_000,
      downloadCount: 22,
      coverHeadline: 'Sender reputation steady at 92 — fund-side ramp on track.',
      coverPullQuote: '"Inbox rate +0.6pp WoW; bounce rate held under 1%."',
    },
    {
      id: 'rep-005',
      title: 'Warmth Health · Paragon Logistics',
      type: 'warmth',
      format: 'csv',
      status: 'ready',
      subClientId: 'sc-paragon',
      subClientName: 'Paragon Logistics',
      createdAt: '2026-05-27T11:24:00Z',
      rangeLabel: 'May 1 – May 26',
      sizeBytes: 540_000,
      downloadCount: 6,
      coverHeadline: 'Warmth stalled at 76 — three mailboxes flagged for review.',
      coverPullQuote: '"Suggest content rotation on weeks 8–12 cadences."',
    },
    {
      id: 'rep-006',
      title: 'Engagement Drilldown · Meridian Health',
      type: 'engagement',
      format: 'pdf',
      status: 'generating',
      subClientId: 'sc-meridian',
      subClientName: 'Meridian Health',
      createdAt: '2026-05-29T10:02:00Z',
      rangeLabel: 'May 1 – May 28',
      sizeBytes: 0,
      downloadCount: 0,
      coverHeadline: '',
      coverPullQuote: '',
    },
    {
      id: 'rep-007',
      title: 'Inbox Placement · Tessera Labs',
      type: 'placement',
      format: 'pdf',
      status: 'queued',
      subClientId: 'sc-tessera',
      subClientName: 'Tessera Labs',
      createdAt: '2026-05-29T10:08:00Z',
      rangeLabel: 'May 15 – May 28',
      sizeBytes: 0,
      downloadCount: 0,
      coverHeadline: '',
      coverPullQuote: '',
    },
    {
      id: 'rep-008',
      title: 'White-label Pack · Cobalt Studios',
      type: 'white_label',
      format: 'pdf',
      status: 'queued',
      subClientId: 'sc-cobalt',
      subClientName: 'Cobalt Studios',
      createdAt: '2026-05-29T10:11:00Z',
      rangeLabel: 'May 19 – May 26',
      sizeBytes: 0,
      downloadCount: 0,
      coverHeadline: '',
      coverPullQuote: '',
    },
    {
      id: 'rep-009',
      title: 'Warmth Diagnostic · Rivet Manufacturing',
      type: 'warmth',
      format: 'pdf',
      status: 'failed',
      subClientId: 'sc-rivet',
      subClientName: 'Rivet Manufacturing',
      createdAt: '2026-05-28T07:30:00Z',
      rangeLabel: 'May 1 – May 27',
      sizeBytes: 0,
      downloadCount: 0,
      coverHeadline: '',
      coverPullQuote: '',
    },
    {
      id: 'rep-010',
      title: 'Q2 White-label Pack · Driftwood Coffee',
      type: 'white_label',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-driftwood',
      subClientName: 'Driftwood Coffee',
      createdAt: '2026-05-26T15:20:00Z',
      rangeLabel: 'Apr 1 – May 26',
      sizeBytes: 2_960_000,
      downloadCount: 4,
      coverHeadline: 'Bounce rate climbed to 4.1% — DMARC misalignment found.',
      coverPullQuote: '"Two domains needs immediate registrar attention."',
    },
    {
      id: 'rep-011',
      title: 'Engagement Drilldown · Stellar Apparel',
      type: 'engagement',
      format: 'csv',
      status: 'ready',
      subClientId: 'sc-stellar',
      subClientName: 'Stellar Apparel',
      createdAt: '2026-05-25T14:10:00Z',
      rangeLabel: 'May 1 – May 24',
      sizeBytes: 720_000,
      downloadCount: 7,
      coverHeadline: 'Reply rate dropped 9.2% MoM — content fatigue detected.',
      coverPullQuote: '"Three opening lines repeated across all cadences."',
    },
    {
      id: 'rep-012',
      title: 'Inbox Placement · Keystone Realty',
      type: 'placement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'sc-keystone',
      subClientName: 'Keystone Realty',
      createdAt: '2026-05-24T11:48:00Z',
      rangeLabel: 'May 10 – May 24',
      sizeBytes: 3_240_000,
      downloadCount: 8,
      coverHeadline: 'Inbox rate held at 86.4% despite reputation pressure.',
      coverPullQuote: '"Outlook share dropped 2.1pp; revisit timing windows."',
    },
    {
      id: 'rep-013',
      title: 'Portfolio Roll-up · All Sub-Clients',
      type: 'engagement',
      format: 'pdf',
      status: 'ready',
      subClientId: null,
      subClientName: null,
      createdAt: '2026-05-29T06:00:00Z',
      rangeLabel: 'May 22 – May 28',
      sizeBytes: 6_840_000,
      downloadCount: 31,
      coverHeadline: 'Portfolio inbox rate crossed 94% for first time in 2026.',
      coverPullQuote: '"Twelve clients above 75 warmth — premium tier secured."',
    },
    {
      id: 'rep-014',
      title: 'Warmth Health Roll-up · All Sub-Clients',
      type: 'warmth',
      format: 'pdf',
      status: 'ready',
      subClientId: null,
      subClientName: null,
      createdAt: '2026-05-29T06:00:00Z',
      rangeLabel: 'May 1 – May 28',
      sizeBytes: 5_120_000,
      downloadCount: 28,
      coverHeadline: 'Average portfolio warmth rose to 78.2 — eight above 75.',
      coverPullQuote: '"Bottom four are still in their first 30 days — reassess at 45."',
    },
  ],
  scheduled: [
    {
      id: 'sched-1',
      title: 'Weekly Inbox Placement Pack',
      type: 'placement',
      cadence: 'weekly',
      nextRunAt: '2026-06-01T06:00:00Z',
      subClientIds: ['sc-acme', 'sc-orbital', 'sc-helix', 'sc-northbound'],
      recipientCount: 9,
    },
    {
      id: 'sched-2',
      title: 'Monthly Warmth Health Roll-up',
      type: 'warmth',
      cadence: 'monthly',
      nextRunAt: '2026-06-01T07:00:00Z',
      subClientIds: [
        'sc-acme',
        'sc-orbital',
        'sc-helix',
        'sc-northbound',
        'sc-paragon',
        'sc-meridian',
        'sc-tessera',
        'sc-cobalt',
        'sc-rivet',
        'sc-keystone',
        'sc-stellar',
        'sc-driftwood',
      ],
      recipientCount: 14,
    },
    {
      id: 'sched-3',
      title: 'Daily Engagement Heartbeat · Top 4',
      type: 'engagement',
      cadence: 'daily',
      nextRunAt: '2026-05-30T07:00:00Z',
      subClientIds: ['sc-acme', 'sc-orbital', 'sc-helix', 'sc-northbound'],
      recipientCount: 4,
    },
    {
      id: 'sched-4',
      title: 'Weekly White-label Pack · At-risk cohort',
      type: 'white_label',
      cadence: 'weekly',
      nextRunAt: '2026-06-02T06:00:00Z',
      subClientIds: ['sc-rivet', 'sc-keystone', 'sc-stellar', 'sc-driftwood'],
      recipientCount: 6,
    },
  ],
  summary: {
    reportsThisMonth: 48,
    reportsTotal: 612,
    downloadsThisMonth: 1_240,
    scheduledActive: 14,
  },
};

// ---------------------------------------------------------------------------
// SKELETON — empty-state shell so a fresh agency loads without scary blanks.
// ---------------------------------------------------------------------------

export const AGENCY_REPORTS_SKELETON_R2: AgencyReportsData = {
  agency: { name: 'Your agency', region: '' },
  subClients: [],
  reports: [],
  scheduled: [],
  summary: {
    reportsThisMonth: 0,
    reportsTotal: 0,
    downloadsThisMonth: 0,
    scheduledActive: 0,
  },
};

// ---------------------------------------------------------------------------
// Theme + constants. Hex equivalents shadow the CSS vars (--wp-accent etc.)
// because SVG gradient stops don't pierce CSS variables cleanly. Keep these
// in lockstep with tailwind.config.ts + hero-theme.css.
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#FF9670',
  accent4: '#ffd54f',
  warning: '#ffb454',
  success: '#3ddc97',
  // Industrial press palette — oiled greys with subtle orange tint.
  metalDark: '#171018',
  metalMid: '#221920',
  metalLight: '#2b1f28',
  metalHighlight: '#3a2a32',
  beltDark: '#1a1218',
  beltMid: '#241820',
  bg: '#0a0a12',
  surface: '#13131d',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

const TYPE_LABEL: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Engagement',
  placement: 'Placement',
  white_label: 'White-label',
};

const TYPE_INK: Record<ReportType, string> = {
  warmth: HEX.accent,
  engagement: HEX.accent2,
  placement: HEX.success,
  white_label: HEX.warning,
};

const TYPE_INK_VAR: Record<ReportType, string> = {
  warmth: 'var(--wp-accent, #F26522)',
  engagement: 'var(--wp-accent-2, #FF8A4B)',
  placement: 'var(--wp-success, #3ddc97)',
  white_label: 'var(--wp-warning, #ffb454)',
};

const TYPE_GLYPH: Record<ReportType, JSX.Element> = {
  warmth: <Flame className="h-3 w-3" />,
  engagement: <Activity className="h-3 w-3" />,
  placement: <Layers className="h-3 w-3" />,
  white_label: <Stamp className="h-3 w-3" />,
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  generating: 'On press',
  ready: 'Printed',
  failed: 'Jammed',
};

const STATUS_COLOR: Record<ReportStatus, string> = {
  draft: HEX.textFaint,
  queued: HEX.accent4,
  generating: HEX.accent2,
  ready: HEX.success,
  failed: HEX.accent3,
};

const FORMAT_GLYPH: Record<ReportFormat, JSX.Element> = {
  pdf: <FileText className="h-3 w-3" />,
  csv: <FileSpreadsheet className="h-3 w-3" />,
};

const CADENCE_LABEL: Record<'daily' | 'weekly' | 'monthly', string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const CADENCE_BARS: Record<'daily' | 'weekly' | 'monthly', number> = {
  daily: 3,
  weekly: 2,
  monthly: 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}KB`;
  return `${n}B`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return formatNumber(n);
}

function formatExact(n: number): string {
  return formatNumber(n);
}

function formatRelative(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const diffMs = t - now.getTime();
  const absMs = Math.abs(diffMs);
  const mins = Math.round(absMs / 60_000);
  const hours = Math.round(absMs / 3_600_000);
  const days = Math.round(absMs / 86_400_000);
  if (diffMs < 0) {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return shortDate(iso);
  }
  if (mins < 1) return 'imminent';
  if (mins < 60) return `in ${mins}m`;
  if (hours < 24) return `in ${hours}h`;
  if (days < 7) return `in ${days}d`;
  return shortDate(iso);
}

function shortDate(iso: string): string {
  const [, mm, dd] = iso.split('T')[0]!.split('-');
  const idx = Math.max(0, Math.min(11, parseInt(mm!, 10) - 1));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[idx]} ${parseInt(dd!, 10)}`;
}

function shortTime(iso: string): string {
  const parts = iso.split('T');
  if (parts.length < 2) return '';
  const hhmm = parts[1]!.split(':');
  return `${hhmm[0]}:${hhmm[1]}`;
}

function reportInkVar(type: ReportType): string {
  return TYPE_INK_VAR[type];
}

function reportInkHex(type: ReportType): string {
  return TYPE_INK[type];
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------------------
// Atoms — small UI fragments reused across the layout.
// ---------------------------------------------------------------------------

function Chip({
  children,
  tone = 'neutral',
  className,
  ink,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'accent2' | 'accent3' | 'accent4' | 'success' | 'warning';
  className?: string;
  ink?: string;
}): JSX.Element {
  // Custom ink overrides tone presets.
  if (ink) {
    return (
      <span
        className={
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider tabular-nums ' +
          (className ?? '')
        }
        style={{
          color: ink,
          borderColor: `color-mix(in srgb, ${ink} 35%, transparent)`,
          background: `color-mix(in srgb, ${ink} 10%, transparent)`,
        }}
      >
        {children}
      </span>
    );
  }
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
              : tone === 'warning'
                ? 'border-accent4/40 bg-accent4/10 text-accent4'
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

function StatusPill({ status }: { status: ReportStatus }): JSX.Element {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider tabular-nums"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {status === 'generating' ? (
        <motion.span
          className="block h-1 w-1 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      ) : (
        <span className="block h-1 w-1 rounded-full" style={{ background: color }} />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

function CountUp({
  value,
  duration = 900,
  delay = 0,
  format = formatCount,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      if (elapsed < delay) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = clamp01((elapsed - delay) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay, reduced]);
  return <span className={className}>{format(shown)}</span>;
}

// Ticking live counter — like an industrial display that rolls upward
// every few seconds to feel "live". We jitter the value within a small
// window so it's clear it's a real-time figure, but the round-trip is
// purely cosmetic.
function LiveCounter({
  base,
  jitter = 1,
  intervalMs = 6_000,
  format = formatExact,
  className,
}: {
  base: number;
  jitter?: number;
  intervalMs?: number;
  format?: (n: number) => string;
  className?: string;
}): JSX.Element {
  const [v, setV] = useState(base);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setV((curr) => {
        // 60% chance to tick up 1, 40% to stay flat — feels organic.
        const delta = Math.random() < 0.6 ? Math.ceil(Math.random() * jitter) : 0;
        return curr + delta;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [reduced, jitter, intervalMs]);
  return <span className={'tabular-nums ' + (className ?? '')}>{format(v)}</span>;
}

// ---------------------------------------------------------------------------
// Press-shop header — agency identity + live KPI counters.
// ---------------------------------------------------------------------------

function PrintShopHeader({
  data,
  printedToday,
  queueDepth,
  inkLevelPct,
  uptimePct,
}: {
  data: AgencyReportsData;
  printedToday: number;
  queueDepth: number;
  inkLevelPct: number;
  uptimePct: number;
}): JSX.Element {
  return (
    <header
      className="relative overflow-hidden rounded-2xl border border-border-muted"
      style={{
        background:
          'linear-gradient(135deg, var(--wp-surface, #13131d) 0%, color-mix(in srgb, var(--wp-accent, #F26522) 8%, var(--wp-surface, #13131d)) 100%)',
      }}
    >
      {/* Industrial bolt pattern decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
        <svg className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <pattern id="hdr-bolts" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="6" cy="6" r="1.5" fill={HEX.accent} fillOpacity={0.32} />
              <circle cx="42" cy="42" r="1.5" fill={HEX.accent} fillOpacity={0.18} />
              <line x1="6" y1="6" x2="42" y2="42" stroke={HEX.accent} strokeOpacity={0.06} strokeWidth={0.5} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hdr-bolts)" />
        </svg>
      </div>

      <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:gap-8">
        {/* LEFT — agency identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-text-dim">
            <Printer className="h-4 w-4 text-accent" />
            <span className="text-[11px] uppercase tracking-[0.18em]">Printing House</span>
            <span className="hidden h-3 w-px bg-border-muted md:block" />
            <span className="hidden text-[11px] uppercase tracking-wider md:inline">Agency Reports · R2</span>
          </div>
          <h1
            className="mt-1 truncate text-2xl font-semibold text-text md:text-3xl"
            style={{ fontFamily: '"Mercury", "Times New Roman", Georgia, serif' }}
          >
            {data.agency.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {data.agency.region}
            </span>
            <span className="h-3 w-px bg-border-muted" />
            <PressOperatorPill />
          </div>
        </div>

        {/* RIGHT — live KPI tiles */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <KpiTile
            icon={<Printer className="h-3 w-3" />}
            label="Printed today"
            value={<LiveCounter base={printedToday} jitter={1} intervalMs={18_000} />}
            tone={HEX.accent}
          />
          <KpiTile
            icon={<Layers className="h-3 w-3" />}
            label="Queue depth"
            value={<CountUp value={queueDepth} format={formatExact} />}
            tone={HEX.accent2}
          />
          <KpiTile
            icon={<Droplet className="h-3 w-3" />}
            label="Ink level"
            value={<CountUp value={inkLevelPct} format={(n) => `${n}%`} />}
            tone={HEX.warning}
          />
          <KpiTile
            icon={<Gauge className="h-3 w-3" />}
            label="Press uptime"
            value={<CountUp value={uptimePct * 10} format={(n) => `${(n / 10).toFixed(1)}%`} />}
            tone={HEX.success}
          />
        </div>
      </div>

      {/* Strip — extra summary, in monospace */}
      <div className="relative border-t border-border-muted bg-bg/40 px-5 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-text-dim">
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span className="font-mono tabular-nums">PRESS-R2-NW</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Boxes className="h-3 w-3" />
            <span className="tabular-nums">{formatExact(MOCK.summary.reportsThisMonth)}</span>
            <span>this month</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Folder className="h-3 w-3" />
            <span className="tabular-nums">{formatCount(MOCK.summary.reportsTotal)}</span>
            <span>archive</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span className="tabular-nums">{formatCount(MOCK.summary.downloadsThisMonth)}</span>
            <span>downloads</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            <span className="tabular-nums">{formatExact(MOCK.summary.scheduledActive)}</span>
            <span>scheduled active</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: JSX.Element;
  label: string;
  value: React.ReactNode;
  tone: string;
}): JSX.Element {
  return (
    <div
      className="relative rounded-xl border border-border-muted bg-surface/70 px-3 py-2 backdrop-blur-sm"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 8%, transparent)`,
      }}
    >
      <div className="flex items-center gap-1.5 text-text-dim">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            color: tone,
          }}
        >
          {icon}
        </span>
        <span className="text-[9px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <div
        className="mt-1.5 text-lg font-semibold leading-none text-text"
        style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
      >
        {value}
      </div>
    </div>
  );
}

function PressOperatorPill(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/8 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
      <motion.span
        className="block h-1.5 w-1.5 rounded-full bg-accent"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      Press operator on duty
    </span>
  );
}

// ---------------------------------------------------------------------------
// The Press — the central animated spectacle.
//
// Composition (1280 x 540 viewport):
//   LEFT (0..280)   — paper-feed intake; vertical stack of sheets pulling
//                     into the press head.
//   CENTER (280..880) — the press itself: two rotating cylinders, ink-roller
//                       cluster above, belt below with travelling dots,
//                       "PRINTING NOW" sheet at the print bed.
//   RIGHT (880..1280) — output table; finished paper strip emerging
//                       horizontally, recent sheets visible as segments.
// ---------------------------------------------------------------------------

interface PressGeometry {
  vbWidth: number;
  vbHeight: number;
  feedX: number;
  feedTopY: number;
  bedX: number;
  bedY: number;
  bedW: number;
  bedH: number;
  outputX: number;
  outputY: number;
  cylTopX: number;
  cylTopY: number;
  cylBotX: number;
  cylBotY: number;
  cylR: number;
  inkClusterX: number;
  inkClusterY: number;
  beltY: number;
  beltH: number;
  beltStartX: number;
  beltEndX: number;
}

function pressGeometry(): PressGeometry {
  return {
    vbWidth: 1280,
    vbHeight: 540,
    feedX: 60,
    feedTopY: 100,
    bedX: 460,
    bedY: 240,
    bedW: 220,
    bedH: 64,
    outputX: 880,
    outputY: 260,
    cylTopX: 570,
    cylTopY: 200,
    cylBotX: 570,
    cylBotY: 330,
    cylR: 56,
    inkClusterX: 380,
    inkClusterY: 160,
    beltY: 440,
    beltH: 36,
    beltStartX: 80,
    beltEndX: 1200,
  };
}

function ThePress({
  feedingSheets,
  emergingSheets,
  currentJob,
}: {
  feedingSheets: AgencyReportsData['reports'];
  emergingSheets: AgencyReportsData['reports'];
  currentJob: AgencyReportsData['reports'][number] | null;
}): JSX.Element {
  const reduced = useReducedMotion();
  const geom = pressGeometry();

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border-muted"
      style={{
        background:
          'linear-gradient(180deg, var(--wp-surface, #13131d) 0%, color-mix(in srgb, var(--wp-accent, #F26522) 4%, var(--wp-surface-2, #1a1a26)) 60%, var(--wp-surface, #13131d) 100%)',
      }}
    >
      {/* Faint workshop title */}
      <div className="absolute left-4 top-3 z-10 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-text-dim">
        <Cog className="h-3 w-3 text-accent" />
        <span>Main press · live</span>
      </div>
      <div className="absolute right-4 top-3 z-10 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-text-dim">
        <Radio className="h-3 w-3 text-accent" />
        <span>Cycle 00:08 · loop</span>
      </div>

      <svg
        viewBox={`0 0 ${geom.vbWidth} ${geom.vbHeight}`}
        className="block w-full"
        style={{ maxHeight: 560, minHeight: 380 }}
        aria-label="Animated printing press"
      >
        <defs>
          {/* Cream paper tint for the output strip + sheets */}
          <linearGradient id="press-paper-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8f0" stopOpacity={0.92} />
            <stop offset="100%" stopColor="#f7e8d8" stopOpacity={0.82} />
          </linearGradient>

          {/* Metal cylinder gradients — oiled industrial steel with orange highlight */}
          <radialGradient id="press-cyl-grad" cx="35%" cy="35%" r="80%">
            <stop offset="0%" stopColor={HEX.metalHighlight} />
            <stop offset="40%" stopColor={HEX.metalMid} />
            <stop offset="100%" stopColor={HEX.metalDark} />
          </radialGradient>

          <linearGradient id="press-cyl-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.5} />
            <stop offset="50%" stopColor={HEX.accent2} stopOpacity={0.2} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.5} />
          </linearGradient>

          {/* Belt — dark with orange flecks */}
          <linearGradient id="press-belt-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HEX.beltDark} />
            <stop offset="50%" stopColor={HEX.beltMid} />
            <stop offset="100%" stopColor={HEX.beltDark} />
          </linearGradient>

          {/* Glow for the in-press sheet */}
          <filter id="press-bed-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Wood-grain pattern for the output table surface */}
          <pattern id="press-grain" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={HEX.metalMid} />
            <line x1="0" y1="3" x2="6" y2="3" stroke={HEX.metalDark} strokeOpacity={0.35} strokeWidth={0.4} />
          </pattern>

          {/* Belt motion path for traveller dots */}
          <path
            id="press-belt-path"
            d={`M ${geom.beltStartX} ${geom.beltY + geom.beltH / 2}
                L ${geom.beltEndX} ${geom.beltY + geom.beltH / 2}`}
            fill="none"
          />
        </defs>

        {/* Floor grid */}
        <g opacity={0.16}>
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={`grid-h-${i}`}
              x1={0}
              x2={geom.vbWidth}
              y1={50 + i * 40}
              y2={50 + i * 40}
              stroke={HEX.accent}
              strokeOpacity={0.18}
              strokeDasharray="2 6"
              strokeWidth={0.6}
            />
          ))}
          {Array.from({ length: 24 }).map((_, i) => (
            <line
              key={`grid-v-${i}`}
              x1={i * 56}
              x2={i * 56}
              y1={0}
              y2={geom.vbHeight}
              stroke={HEX.accent}
              strokeOpacity={0.08}
              strokeWidth={0.4}
            />
          ))}
        </g>

        {/* Press base/frame — wide horizontal beam */}
        <rect
          x={20}
          y={geom.beltY - 14}
          width={geom.vbWidth - 40}
          height={20}
          rx={4}
          fill="url(#press-belt-grad)"
          stroke={HEX.border}
          strokeWidth={0.6}
        />
        <rect x={20} y={geom.beltY + geom.beltH + 6} width={geom.vbWidth - 40} height={4} rx={2} fill={HEX.metalDark} />

        {/* Frame pillars — left & right columns */}
        <FramePillar x={geom.bedX - 80} topY={120} />
        <FramePillar x={geom.bedX + geom.bedW + 80} topY={120} />

        {/* === LEFT: feed intake === */}
        <FeedIntake x={geom.feedX} y={geom.feedTopY} sheets={feedingSheets} reduced={reduced} />

        {/* === CENTER: cylinders + ink cluster + print bed === */}
        <InkRollerCluster x={geom.inkClusterX} y={geom.inkClusterY} reduced={reduced} />

        {/* Top cylinder */}
        <Cylinder
          cx={geom.cylTopX}
          cy={geom.cylTopY}
          r={geom.cylR}
          direction={1}
          reduced={reduced}
          labelChar="A"
        />
        {/* Bottom cylinder */}
        <Cylinder
          cx={geom.cylBotX}
          cy={geom.cylBotY}
          r={geom.cylR}
          direction={-1}
          reduced={reduced}
          labelChar="B"
        />

        {/* Connecting drive shaft */}
        <line
          x1={geom.cylTopX + geom.cylR + 18}
          y1={geom.cylTopY}
          x2={geom.cylBotX + geom.cylR + 18}
          y2={geom.cylBotY}
          stroke={HEX.accent}
          strokeOpacity={0.45}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={geom.cylTopX + geom.cylR + 18} cy={geom.cylTopY} r={6} fill={HEX.metalLight} stroke={HEX.accent} strokeWidth={1} />
        <circle cx={geom.cylBotX + geom.cylR + 18} cy={geom.cylBotY} r={6} fill={HEX.metalLight} stroke={HEX.accent} strokeWidth={1} />

        {/* Print bed — the sheet currently on press */}
        <PrintBed
          x={geom.bedX}
          y={geom.bedY}
          w={geom.bedW}
          h={geom.bedH}
          job={currentJob}
          reduced={reduced}
        />

        {/* === RIGHT: output table + paper strip === */}
        <OutputTable
          x={geom.outputX}
          y={geom.outputY}
          sheets={emergingSheets}
          reduced={reduced}
        />

        {/* === Belt with travelling orange dots === */}
        <rect
          x={geom.beltStartX}
          y={geom.beltY}
          width={geom.beltEndX - geom.beltStartX}
          height={geom.beltH}
          fill="url(#press-belt-grad)"
          stroke={HEX.border}
          strokeWidth={0.6}
        />
        {/* Belt teeth */}
        {Array.from({ length: 80 }).map((_, i) => {
          const x = geom.beltStartX + i * 14;
          if (x > geom.beltEndX - 6) return null;
          return (
            <line
              key={`tooth-${i}`}
              x1={x}
              x2={x}
              y1={geom.beltY}
              y2={geom.beltY + geom.beltH}
              stroke={HEX.metalDark}
              strokeOpacity={0.55}
              strokeWidth={0.6}
            />
          );
        })}
        {/* Travelling dots */}
        {!reduced &&
          Array.from({ length: 6 }).map((_, i) => (
            <motion.circle
              key={`belt-dot-${i}`}
              r={4}
              fill={HEX.accent}
              filter="url(#press-bed-glow)"
              animate={{ cx: [geom.beltStartX, geom.beltEndX] }}
              transition={{
                duration: 6,
                delay: i * 1.0,
                repeat: Infinity,
                ease: 'linear',
              }}
              cy={geom.beltY + geom.beltH / 2}
            />
          ))}
        {/* Belt label */}
        <text
          x={geom.beltStartX + 6}
          y={geom.beltY + geom.beltH / 2 + 3.5}
          fontFamily="JetBrains Mono, monospace"
          fontSize={9}
          fill={HEX.accent}
          opacity={0.75}
        >
          DRIVE BELT
        </text>
      </svg>

      {/* Annotation strip below the press */}
      <div className="grid grid-cols-3 gap-3 border-t border-border-muted bg-bg/30 px-5 py-3 text-[10px] uppercase tracking-wider text-text-dim">
        <div className="flex items-center gap-2">
          <Layers className="h-3 w-3 text-accent" />
          <span>Intake · {feedingSheets.length} queued sheets</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Cog className="h-3 w-3 text-accent" />
          <span>
            On press ·{' '}
            <span className="text-accent">{currentJob ? currentJob.title : 'idle'}</span>
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Printer className="h-3 w-3 text-accent" />
          <span>Output · {emergingSheets.length} printed</span>
        </div>
      </div>
    </section>
  );
}

function FramePillar({ x, topY }: { x: number; topY: number }): JSX.Element {
  return (
    <g>
      <rect
        x={x - 14}
        y={topY}
        width={28}
        height={310}
        rx={4}
        fill="url(#press-cyl-grad)"
        stroke={HEX.border}
        strokeWidth={0.6}
      />
      {/* Bolts */}
      {Array.from({ length: 5 }).map((_, i) => (
        <circle
          key={`bolt-${i}`}
          cx={x}
          cy={topY + 18 + i * 70}
          r={4}
          fill={HEX.metalDark}
          stroke={HEX.accent}
          strokeOpacity={0.4}
          strokeWidth={0.7}
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Feed intake — vertical paper stack on the left, topmost slides into the
// press head every cycle.
// ---------------------------------------------------------------------------

function FeedIntake({
  x,
  y,
  sheets,
  reduced,
}: {
  x: number;
  y: number;
  sheets: AgencyReportsData['reports'];
  reduced: boolean | null;
}): JSX.Element {
  // Show up to 5 sheets stacked vertically (topmost = next to print).
  const visible = sheets.slice(0, 5);
  const sheetW = 160;
  const sheetH = 44;
  const gap = 6;

  return (
    <g>
      {/* Intake table */}
      <rect
        x={x - 16}
        y={y - 14}
        width={sheetW + 32}
        height={visible.length * (sheetH + gap) + 36}
        rx={6}
        fill={HEX.metalMid}
        stroke={HEX.border}
        strokeWidth={0.6}
      />
      <rect
        x={x - 16}
        y={y - 14}
        width={sheetW + 32}
        height={18}
        rx={6}
        fill={HEX.metalDark}
      />
      <text
        x={x - 8}
        y={y - 2}
        fontFamily="JetBrains Mono, monospace"
        fontSize={9}
        fill={HEX.accent}
      >
        ▸ INTAKE QUEUE
      </text>

      {/* Stack of sheets */}
      {visible.map((sheet, i) => {
        const sy = y + 14 + i * (sheetH + gap);
        const ink = reportInkHex(sheet.type);
        const isTop = i === 0;
        return (
          <motion.g
            key={sheet.id}
            initial={isTop && !reduced ? { x: 0 } : false}
            animate={
              isTop && !reduced
                ? { x: [0, 0, 280, 280, 0], opacity: [1, 1, 0.4, 0, 1] }
                : {}
            }
            transition={
              isTop && !reduced
                ? { duration: 8, repeat: Infinity, times: [0, 0.6, 0.78, 0.8, 0.81], ease: 'easeIn' }
                : undefined
            }
          >
            <rect
              x={x}
              y={sy}
              width={sheetW}
              height={sheetH}
              rx={3}
              fill="url(#press-paper-grad)"
              stroke={ink}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            {/* Ink stripe along left edge to colour-code the report type */}
            <rect x={x} y={sy} width={4} height={sheetH} rx={2} fill={ink} />
            {/* Title text */}
            <text
              x={x + 10}
              y={sy + 14}
              fontFamily="ui-sans-serif, system-ui"
              fontSize={8.5}
              fill="#241817"
              fontWeight={600}
            >
              {truncate(sheet.title, 22)}
            </text>
            <text
              x={x + 10}
              y={sy + 26}
              fontFamily="JetBrains Mono, monospace"
              fontSize={7.5}
              fill="#5a3924"
            >
              {TYPE_LABEL[sheet.type].toUpperCase()} · {sheet.format.toUpperCase()}
            </text>
            <text
              x={x + sheetW - 10}
              y={sy + sheetH - 6}
              textAnchor="end"
              fontFamily="JetBrains Mono, monospace"
              fontSize={7}
              fill="#724a30"
            >
              {sheet.subClientName ? truncate(sheet.subClientName, 16) : 'Roll-up'}
            </text>
            {/* Drag-handle affordance */}
            <g transform={`translate(${x + sheetW - 14}, ${sy + 4})`}>
              <circle cx={2} cy={2} r={0.7} fill="#7a4b2c" />
              <circle cx={6} cy={2} r={0.7} fill="#7a4b2c" />
              <circle cx={2} cy={6} r={0.7} fill="#7a4b2c" />
              <circle cx={6} cy={6} r={0.7} fill="#7a4b2c" />
              <circle cx={2} cy={10} r={0.7} fill="#7a4b2c" />
              <circle cx={6} cy={10} r={0.7} fill="#7a4b2c" />
            </g>
          </motion.g>
        );
      })}

      {/* Hopper guide arrow */}
      <g opacity={0.7}>
        <path
          d={`M ${x + sheetW + 14} ${y + sheetH / 2 + 14} L ${x + sheetW + 36} ${y + sheetH / 2 + 14} L ${x + sheetW + 32} ${y + sheetH / 2 + 10} M ${x + sheetW + 36} ${y + sheetH / 2 + 14} L ${x + sheetW + 32} ${y + sheetH / 2 + 18}`}
          stroke={HEX.accent}
          strokeOpacity={0.7}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + '…';
}

// ---------------------------------------------------------------------------
// Cylinder — rotating SVG circle with spoke lines + outer rim glow.
// ---------------------------------------------------------------------------

function Cylinder({
  cx,
  cy,
  r,
  direction,
  reduced,
  labelChar,
}: {
  cx: number;
  cy: number;
  r: number;
  direction: 1 | -1;
  reduced: boolean | null;
  labelChar: string;
}): JSX.Element {
  return (
    <g>
      {/* Mounting bracket */}
      <rect x={cx - r - 22} y={cy - 8} width={20} height={16} rx={3} fill={HEX.metalDark} stroke={HEX.border} strokeWidth={0.5} />
      <rect x={cx + r + 2} y={cy - 8} width={20} height={16} rx={3} fill={HEX.metalDark} stroke={HEX.border} strokeWidth={0.5} />

      {/* Outer rim with glow */}
      <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="url(#press-cyl-rim)" strokeWidth={2} opacity={0.85} />
      {/* Body */}
      <circle cx={cx} cy={cy} r={r} fill="url(#press-cyl-grad)" stroke={HEX.border} strokeWidth={1} />

      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={r * 0.7} fill="none" stroke={HEX.accent} strokeOpacity={0.3} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={r * 0.4} fill={HEX.metalDark} stroke={HEX.accent} strokeOpacity={0.6} strokeWidth={1} />

      {/* Centre hub */}
      <circle cx={cx} cy={cy} r={6} fill={HEX.metalLight} stroke={HEX.accent} strokeWidth={1} />
      <text
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize={8}
        fill={HEX.accent}
      >
        {labelChar}
      </text>

      {/* Rotating spokes */}
      <motion.g
        animate={reduced ? {} : { rotate: 360 * direction }}
        transition={reduced ? undefined : { duration: 6, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const ang = (i / 8) * Math.PI * 2;
          const x1 = cx + Math.cos(ang) * (r * 0.42);
          const y1 = cy + Math.sin(ang) * (r * 0.42);
          const x2 = cx + Math.cos(ang) * (r * 0.66);
          const y2 = cy + Math.sin(ang) * (r * 0.66);
          return (
            <line
              key={`spoke-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={HEX.accent}
              strokeOpacity={0.55}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          );
        })}
        {/* Indicator notch on rim */}
        <circle cx={cx + r * 0.78} cy={cy} r={3} fill={HEX.accent} />
      </motion.g>

      {/* Front static label */}
      <text
        x={cx}
        y={cy - r - 8}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize={8}
        fill={HEX.textDim}
      >
        CYL · {labelChar}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ink-roller cluster — small ink-applicator wheels above the cylinders.
// ---------------------------------------------------------------------------

function InkRollerCluster({
  x,
  y,
  reduced,
}: {
  x: number;
  y: number;
  reduced: boolean | null;
}): JSX.Element {
  // Three small rollers in a cluster, one per active ink colour.
  const rollers: Array<{ dx: number; dy: number; colour: string; label: string }> = [
    { dx: 0, dy: 0, colour: HEX.accent, label: 'W' },
    { dx: 26, dy: 14, colour: HEX.accent2, label: 'E' },
    { dx: 52, dy: 0, colour: HEX.warning, label: 'L' },
  ];
  return (
    <g>
      {/* Reservoir housing */}
      <rect x={x - 12} y={y - 18} width={94} height={50} rx={6} fill={HEX.metalDark} stroke={HEX.border} strokeWidth={0.6} />
      <text
        x={x - 4}
        y={y - 8}
        fontFamily="JetBrains Mono, monospace"
        fontSize={7.5}
        fill={HEX.accent}
        opacity={0.8}
      >
        INK BAR
      </text>
      {rollers.map((r, i) => (
        <g key={`ink-${i}`}>
          <circle
            cx={x + r.dx + 12}
            cy={y + r.dy + 14}
            r={11}
            fill={HEX.metalMid}
            stroke={r.colour}
            strokeOpacity={0.75}
            strokeWidth={1.4}
          />
          <motion.circle
            cx={x + r.dx + 12}
            cy={y + r.dy + 14}
            r={6}
            fill={r.colour}
            fillOpacity={0.85}
            animate={reduced ? {} : { scale: [1, 1.15, 1], opacity: [0.75, 1, 0.75] }}
            transition={reduced ? undefined : { duration: 3, delay: i * 0.4, repeat: Infinity }}
          />
          <text
            x={x + r.dx + 12}
            y={y + r.dy + 17}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize={7}
            fill="#1a0a08"
            fontWeight={700}
          >
            {r.label}
          </text>
        </g>
      ))}

      {/* Drip line from cluster down to top cylinder */}
      <line
        x1={x + 40}
        y1={y + 32}
        x2={x + 100}
        y2={y + 110}
        stroke={HEX.accent}
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Print bed — the sheet currently between the cylinders. Pulses with the
// current job's ink colour.
// ---------------------------------------------------------------------------

function PrintBed({
  x,
  y,
  w,
  h,
  job,
  reduced,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  job: AgencyReportsData['reports'][number] | null;
  reduced: boolean | null;
}): JSX.Element {
  const ink = job ? reportInkHex(job.type) : HEX.accent;
  return (
    <g>
      {/* Bed frame */}
      <rect x={x - 6} y={y - 4} width={w + 12} height={h + 8} rx={4} fill={HEX.metalDark} stroke={HEX.border} strokeWidth={0.6} />
      {/* The sheet */}
      <motion.g
        filter="url(#press-bed-glow)"
        animate={reduced ? {} : { opacity: [0.85, 1, 0.85] }}
        transition={reduced ? undefined : { duration: 1.6, repeat: Infinity }}
      >
        <rect x={x} y={y} width={w} height={h} rx={3} fill="url(#press-paper-grad)" />
        {/* Ink stripe + headline */}
        <rect x={x} y={y} width={5} height={h} rx={2} fill={ink} />
        {job ? (
          <>
            <text
              x={x + 10}
              y={y + 16}
              fontFamily="ui-sans-serif, system-ui"
              fontSize={10}
              fill="#241817"
              fontWeight={700}
            >
              {truncate(job.title, 28)}
            </text>
            <text
              x={x + 10}
              y={y + 30}
              fontFamily="JetBrains Mono, monospace"
              fontSize={8}
              fill="#5a3924"
            >
              {TYPE_LABEL[job.type].toUpperCase()} · {job.format.toUpperCase()} · {job.rangeLabel}
            </text>
            <text
              x={x + w - 10}
              y={y + h - 8}
              textAnchor="end"
              fontFamily="JetBrains Mono, monospace"
              fontSize={7}
              fill={ink}
            >
              {STATUS_LABEL[job.status].toUpperCase()}
            </text>
          </>
        ) : (
          <text
            x={x + w / 2}
            y={y + h / 2 + 3}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize={9}
            fill="#5a3924"
          >
            PRESS IDLE
          </text>
        )}
      </motion.g>
      {/* Pulsing PRINTING NOW badge */}
      {job ? (
        <motion.g
          animate={reduced ? {} : { opacity: [0.6, 1, 0.6] }}
          transition={reduced ? undefined : { duration: 1.2, repeat: Infinity }}
        >
          <rect x={x + w / 2 - 36} y={y - 22} width={72} height={16} rx={8} fill={ink} fillOpacity={0.18} stroke={ink} strokeWidth={0.8} />
          <text
            x={x + w / 2}
            y={y - 11}
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize={8}
            fill={ink}
            fontWeight={700}
          >
            PRINTING NOW
          </text>
        </motion.g>
      ) : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Output table — finished paper strip emerging horizontally with the
// most recent printed reports visible as strip segments.
// ---------------------------------------------------------------------------

function OutputTable({
  x,
  y,
  sheets,
  reduced,
}: {
  x: number;
  y: number;
  sheets: AgencyReportsData['reports'];
  reduced: boolean | null;
}): JSX.Element {
  const visible = sheets.slice(0, 4);
  const segW = 78;
  const segH = 96;
  const gap = 4;
  const stripWidth = 360;

  return (
    <g>
      {/* Wood-grain table top */}
      <rect x={x - 12} y={y + segH + 4} width={stripWidth + 24} height={14} rx={3} fill="url(#press-grain)" />
      <rect x={x - 12} y={y - 8} width={stripWidth + 24} height={14} rx={3} fill="url(#press-grain)" />
      {/* Table edge bracing */}
      <rect x={x - 18} y={y - 12} width={6} height={segH + 24} rx={2} fill={HEX.metalDark} />
      <rect x={x + stripWidth + 12} y={y - 12} width={6} height={segH + 24} rx={2} fill={HEX.metalDark} />

      {/* Emerging strip — the continuous paper coming off the press */}
      <rect
        x={x}
        y={y}
        width={stripWidth}
        height={segH}
        rx={2}
        fill="url(#press-paper-grad)"
        stroke={HEX.accent}
        strokeOpacity={0.35}
        strokeWidth={0.8}
      />

      {/* Vertical perforations between segments */}
      {Array.from({ length: 4 }).map((_, i) => (
        <line
          key={`perf-${i}`}
          x1={x + segW * (i + 1) + gap * i}
          x2={x + segW * (i + 1) + gap * i}
          y1={y + 4}
          y2={y + segH - 4}
          stroke="#724a30"
          strokeOpacity={0.55}
          strokeDasharray="2 3"
          strokeWidth={0.6}
        />
      ))}

      {/* Strip segments — each a printed report */}
      {visible.map((sheet, i) => {
        const sx = x + i * (segW + gap);
        const ink = reportInkHex(sheet.type);
        const isFresh = i === 0;
        return (
          <motion.g
            key={sheet.id}
            initial={isFresh && !reduced ? { opacity: 0, x: 12 } : false}
            animate={isFresh && !reduced ? { opacity: [0, 1, 1, 1], x: [12, 0, 0, 0] } : {}}
            transition={
              isFresh && !reduced
                ? { duration: 8, repeat: Infinity, times: [0, 0.18, 0.6, 1], ease: 'easeOut' }
                : undefined
            }
          >
            {/* Ink header stripe */}
            <rect x={sx + 4} y={y + 4} width={segW - 8} height={6} rx={1} fill={ink} fillOpacity={0.65} />
            {/* Type label */}
            <text
              x={sx + segW / 2}
              y={y + 22}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize={6.5}
              fill="#5a3924"
            >
              {TYPE_LABEL[sheet.type].toUpperCase()}
            </text>
            {/* Headline */}
            <foreignObject x={sx + 4} y={y + 26} width={segW - 8} height={32}>
              <div
                style={{
                  fontFamily: 'ui-sans-serif, system-ui',
                  fontSize: 6.5,
                  fontWeight: 600,
                  color: '#241817',
                  lineHeight: 1.15,
                  textAlign: 'center',
                  overflow: 'hidden',
                }}
              >
                {truncate(sheet.title.replace(/^[A-Za-z0-9]+ /, ''), 38)}
              </div>
            </foreignObject>
            {/* Footer line */}
            <line
              x1={sx + 6}
              x2={sx + segW - 6}
              y1={y + segH - 18}
              y2={y + segH - 18}
              stroke="#724a30"
              strokeOpacity={0.45}
              strokeWidth={0.4}
              strokeDasharray="1 2"
            />
            {/* Format */}
            <text
              x={sx + 6}
              y={y + segH - 8}
              fontFamily="JetBrains Mono, monospace"
              fontSize={6}
              fill="#5a3924"
            >
              {sheet.format.toUpperCase()}
            </text>
            {/* Sub-client */}
            <text
              x={sx + segW - 6}
              y={y + segH - 8}
              textAnchor="end"
              fontFamily="JetBrains Mono, monospace"
              fontSize={6}
              fill={ink}
            >
              {sheet.subClientName ? truncate(sheet.subClientName.split(' ')[0]!, 6) : 'PORTF'}
            </text>
          </motion.g>
        );
      })}

      {/* Output direction arrow */}
      <g opacity={0.7}>
        <path
          d={`M ${x + stripWidth + 4} ${y + segH / 2} L ${x + stripWidth + 22} ${y + segH / 2} M ${x + stripWidth + 18} ${y + segH / 2 - 4} L ${x + stripWidth + 22} ${y + segH / 2} L ${x + stripWidth + 18} ${y + segH / 2 + 4}`}
          stroke={HEX.accent}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
      </g>

      {/* Label */}
      <text
        x={x}
        y={y - 14}
        fontFamily="JetBrains Mono, monospace"
        fontSize={9}
        fill={HEX.accent}
        opacity={0.8}
      >
        ▸ OUTPUT TABLE
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ink wells panel — 4 horizontal ink wells (one per report type) showing
// fill level, monthly throughput, and an interactive hover ripple.
// ---------------------------------------------------------------------------

function InkWellsPanel({
  inkUsage,
}: {
  inkUsage: Record<ReportType, { wellFillPct: number; printedThisMonth: number; capRemaining: number }>;
}): JSX.Element {
  const order: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];
  const [hovered, setHovered] = useState<ReportType | null>(null);
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Ink wells</h2>
          <Chip tone="neutral">live</Chip>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">
          quota-aware · refills nightly
        </span>
      </header>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {order.map((type) => {
          const usage = inkUsage[type];
          const ink = reportInkVar(type);
          const inkHex = reportInkHex(type);
          const isHover = hovered === type;
          return (
            <li
              key={type}
              onMouseEnter={() => setHovered(type)}
              onMouseLeave={() => setHovered(null)}
              className="relative overflow-hidden rounded-xl border border-border-muted bg-surface-2/70 p-3 transition-colors"
              style={{
                background: isHover
                  ? `linear-gradient(135deg, color-mix(in srgb, ${inkHex} 8%, var(--wp-surface-2, #1a1a26)), var(--wp-surface-2, #1a1a26))`
                  : undefined,
                borderColor: isHover ? `color-mix(in srgb, ${inkHex} 35%, transparent)` : undefined,
              }}
            >
              {/* Header row */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md"
                    style={{
                      background: `color-mix(in srgb, ${inkHex} 14%, transparent)`,
                      color: ink,
                    }}
                  >
                    {TYPE_GLYPH[type]}
                  </span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: ink }}>
                      {TYPE_LABEL[type]}
                    </div>
                    <div className="text-[10px] text-text-dim">{usage.printedThisMonth} printed this month</div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-base font-semibold tabular-nums"
                    style={{ color: ink, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
                  >
                    {usage.wellFillPct}%
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-text-dim">fill</div>
                </div>
              </div>

              {/* Well visualisation — glass tank with fill */}
              <div className="relative h-12 rounded-md border border-border-muted bg-bg/60 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0"
                  initial={{ width: 0 }}
                  animate={{ width: `${usage.wellFillPct}%` }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  style={{
                    background: `linear-gradient(180deg, ${inkHex} 0%, color-mix(in srgb, ${inkHex} 65%, #000) 100%)`,
                  }}
                />
                {/* Highlight strip */}
                <div
                  className="absolute inset-x-0 top-0 h-1.5 opacity-50"
                  style={{
                    background: `linear-gradient(180deg, color-mix(in srgb, ${inkHex} 80%, #fff) 0%, transparent 100%)`,
                  }}
                />
                {/* Ripple — only on hover */}
                {isHover ? (
                  <motion.div
                    className="absolute inset-y-0 left-0 pointer-events-none"
                    initial={{ width: 0, opacity: 0.6 }}
                    animate={{ width: `${usage.wellFillPct + 6}%`, opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    style={{
                      background: `radial-gradient(closest-side at right center, color-mix(in srgb, ${inkHex} 60%, #fff) 0%, transparent 70%)`,
                    }}
                  />
                ) : null}
                {/* Gauge marks */}
                {[25, 50, 75].map((m) => (
                  <span
                    key={m}
                    className="absolute inset-y-0 w-px bg-border-muted/40"
                    style={{ left: `${m}%` }}
                  />
                ))}
              </div>

              {/* Footer — cap remaining + status hint */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-text-dim">
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  cap remaining · <span className="tabular-nums">{usage.capRemaining}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1 uppercase tracking-wider"
                  style={{ color: usage.wellFillPct < 25 ? HEX.accent3 : ink }}
                >
                  {usage.wellFillPct < 25 ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {usage.wellFillPct < 25 ? 'low — refill soon' : 'healthy'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Print queue list — left rail of upcoming / on-press / scheduled jobs.
// ---------------------------------------------------------------------------

function PrintQueuePanel({
  queue,
  onPress,
  onSelectJob,
  selectedId,
}: {
  queue: AgencyReportsData['reports'];
  onPress: AgencyReportsData['reports'][number] | null;
  onSelectJob: (id: string) => void;
  selectedId: string | null;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70">
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Print queue</h2>
          <Chip tone="accent4">{queue.length}</Chip>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-2 text-[10px] uppercase tracking-wider text-text-dim transition-colors hover:text-text"
          >
            <Pause className="h-3 w-3" />
            Pause
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 text-[10px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
          >
            <Play className="h-3 w-3" />
            Run all
          </button>
        </div>
      </header>

      <ul className="max-h-[420px] divide-y divide-border-muted overflow-y-auto">
        {/* On-press first */}
        {onPress ? (
          <QueueRow
            sheet={onPress}
            highlight="press"
            selected={selectedId === onPress.id}
            onSelect={onSelectJob}
          />
        ) : null}
        {queue
          .filter((q) => q.id !== onPress?.id)
          .map((sheet) => (
            <QueueRow
              key={sheet.id}
              sheet={sheet}
              highlight={sheet.status === 'failed' ? 'fail' : 'idle'}
              selected={selectedId === sheet.id}
              onSelect={onSelectJob}
            />
          ))}
      </ul>
    </section>
  );
}

function QueueRow({
  sheet,
  highlight,
  selected,
  onSelect,
}: {
  sheet: AgencyReportsData['reports'][number];
  highlight: 'press' | 'idle' | 'fail';
  selected: boolean;
  onSelect: (id: string) => void;
}): JSX.Element {
  const ink = reportInkHex(sheet.type);
  const isPress = highlight === 'press';
  const isFail = highlight === 'fail';
  const reduced = useReducedMotion();
  return (
    <li
      className={
        'relative cursor-pointer transition-colors ' +
        (selected ? 'bg-surface-2/80' : isPress ? 'bg-surface-2/60' : 'hover:bg-surface-2/40')
      }
      onClick={() => onSelect(sheet.id)}
      style={
        isPress
          ? {
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent) 0%, transparent 60%)',
            }
          : undefined
      }
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        {/* Drag handle affordance (visual only) */}
        <span className="mt-1 flex h-6 w-3 cursor-grab items-center justify-center text-text-dim/60">
          <GripVertical className="h-3 w-3" />
        </span>
        {/* Thumbnail strip */}
        <span
          className="relative mt-0.5 inline-flex h-9 w-7 flex-shrink-0 flex-col items-stretch overflow-hidden rounded-sm border"
          style={{
            background: 'linear-gradient(180deg, #fff8f0 0%, #f7e8d8 100%)',
            borderColor: `color-mix(in srgb, ${ink} 35%, transparent)`,
          }}
          aria-hidden
        >
          <span className="block h-1.5" style={{ background: ink, opacity: 0.85 }} />
          <span className="mt-0.5 block h-0.5 mx-1 rounded-sm" style={{ background: '#724a30', opacity: 0.4 }} />
          <span className="mt-0.5 block h-0.5 mx-1 rounded-sm" style={{ background: '#724a30', opacity: 0.3 }} />
          <span className="mt-0.5 block h-0.5 mx-1 rounded-sm" style={{ background: '#724a30', opacity: 0.3 }} />
          <span className="mt-auto block h-1 mx-1 rounded-sm" style={{ background: ink, opacity: 0.3 }} />
        </span>
        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-text">{sheet.title}</p>
            {isPress ? (
              <motion.span
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider tabular-nums"
                style={{
                  color: ink,
                  borderColor: `color-mix(in srgb, ${ink} 40%, transparent)`,
                  background: `color-mix(in srgb, ${ink} 12%, transparent)`,
                }}
                animate={reduced ? {} : { opacity: [0.55, 1, 0.55] }}
                transition={reduced ? undefined : { duration: 1.4, repeat: Infinity }}
              >
                <span className="block h-1 w-1 rounded-full" style={{ background: ink }} />
                Printing
              </motion.span>
            ) : isFail ? (
              <Chip tone="accent3" className="text-[8.5px]">
                <AlertTriangle className="h-2.5 w-2.5" />
                Jammed
              </Chip>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-text-dim">
            <span className="inline-flex items-center gap-0.5" style={{ color: ink }}>
              {TYPE_GLYPH[sheet.type]}
              <span className="uppercase tracking-wider">{TYPE_LABEL[sheet.type]}</span>
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              {FORMAT_GLYPH[sheet.format]}
              <span className="uppercase tracking-wider">{sheet.format}</span>
            </span>
            <span>·</span>
            <span className="truncate">{sheet.subClientName ?? 'Portfolio roll-up'}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-text-faint">
            <span className="font-mono tabular-nums">{sheet.rangeLabel}</span>
            <span className="inline-flex items-center gap-0.5">
              <Timer className="h-3 w-3" />
              ETA · <span className="tabular-nums">{etaForStatus(sheet.status, sheet.id)}</span>
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

// Deterministic ETA based on report id hash so the same id keeps the same ETA
// across renders.
function etaForStatus(status: ReportStatus, id: string): string {
  if (status === 'ready') return 'done';
  if (status === 'failed') return '—';
  if (status === 'draft') return 'paused';
  // Hash id → 1..9 minutes
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  const mins = 1 + (h % 9);
  if (status === 'generating') return `~${mins}m`;
  return `${mins + 2}m`;
}

// ---------------------------------------------------------------------------
// Output stacks footer — recent printed reports as binders/folders.
// ---------------------------------------------------------------------------

function OutputStacksFooter({
  reports,
  subClients,
}: {
  reports: AgencyReportsData['reports'];
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  // Group ready reports by sub-client (or portfolio); show up to 6 stacks.
  const stacks = useMemo(() => {
    const byKey = new Map<
      string,
      { key: string; label: string; ink: string; reports: AgencyReportsData['reports'] }
    >();
    for (const r of reports) {
      if (r.status !== 'ready') continue;
      const key = r.subClientId ?? 'portfolio';
      const label = r.subClientName ?? 'Portfolio';
      const existing = byKey.get(key);
      if (existing) {
        existing.reports.push(r);
      } else {
        // First report in this stack drives ink colour
        byKey.set(key, {
          key,
          label,
          ink: reportInkHex(r.type),
          reports: [r],
        });
      }
    }
    const list = [...byKey.values()];
    // Sort by latest printed within each stack desc
    list.sort((a, b) => {
      const at = new Date(a.reports[0]!.createdAt).getTime();
      const bt = new Date(b.reports[0]!.createdAt).getTime();
      return bt - at;
    });
    return list.slice(0, 6);
  }, [reports]);

  // Track the freshest stack — gets a one-time glow on mount.
  const freshestKey = stacks[0]?.key ?? null;

  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Output stacks</h2>
          <Chip tone="neutral">{stacks.length} stacks</Chip>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">
          most recent printed · grouped by sub-client
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stacks.map((s) => {
          const subClient = subClients.find((c) => c.id === s.key);
          const isFreshest = s.key === freshestKey;
          return (
            <StackBinder
              key={s.key}
              label={s.label}
              ink={s.ink}
              count={s.reports.length}
              mailboxCount={subClient?.mailboxCount ?? 0}
              latestReport={s.reports[0]!}
              isFreshest={isFreshest}
            />
          );
        })}
      </div>
    </section>
  );
}

function StackBinder({
  label,
  ink,
  count,
  mailboxCount,
  latestReport,
  isFreshest,
}: {
  label: string;
  ink: string;
  count: number;
  mailboxCount: number;
  latestReport: AgencyReportsData['reports'][number];
  isFreshest: boolean;
}): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={isFreshest && !reduced ? { boxShadow: `0 0 0 0 ${ink}00` } : false}
      animate={
        isFreshest && !reduced
          ? {
              boxShadow: [
                `0 0 0 0 color-mix(in srgb, ${ink} 0%, transparent)`,
                `0 0 24px 4px color-mix(in srgb, ${ink} 35%, transparent)`,
                `0 0 0 0 color-mix(in srgb, ${ink} 0%, transparent)`,
              ],
            }
          : undefined
      }
      transition={isFreshest && !reduced ? { duration: 2.4, times: [0, 0.3, 1], delay: 0.4 } : undefined}
      className="relative overflow-hidden rounded-xl border border-border-muted bg-surface-2 p-3"
    >
      {/* Spine — colour-coded by report type */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: ink }}
        aria-hidden
      />
      {/* Inner page-edge accent */}
      <span
        className="absolute inset-y-2 left-2 w-px"
        style={{ background: `color-mix(in srgb, ${ink} 60%, transparent)` }}
        aria-hidden
      />

      {/* Header */}
      <div className="ml-2">
        <div className="flex items-center justify-between">
          <h3 className="truncate text-xs font-semibold text-text">{label}</h3>
          {isFreshest ? (
            <Chip ink={ink} className="text-[8.5px]">
              <Sparkles className="h-2.5 w-2.5" />
              Just printed
            </Chip>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-dim">
          <Building2 className="h-3 w-3" />
          <span className="tabular-nums">{mailboxCount}</span>
          <span>mailboxes</span>
        </div>
      </div>

      {/* Visual stack — three offset rectangles to suggest a pile */}
      <div className="ml-2 mt-3 relative h-14">
        {[2, 1, 0].map((depth) => (
          <span
            key={depth}
            className="absolute left-0 right-0 rounded-md border"
            style={{
              top: depth * 4,
              right: depth * 4,
              height: 44,
              background: `linear-gradient(135deg, color-mix(in srgb, ${ink} ${depth === 0 ? 14 : 6}%, var(--wp-surface, #13131d)), var(--wp-surface, #13131d))`,
              borderColor: `color-mix(in srgb, ${ink} ${depth === 0 ? 35 : 18}%, var(--wp-border-muted, #2a2a3a))`,
            }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <div>
            <div
              className="text-2xl font-semibold leading-none tabular-nums"
              style={{
                color: ink,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              {count}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-text-dim">printed</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-text-dim">latest</div>
            <div className="font-mono text-[10px] tabular-nums text-text">{shortDate(latestReport.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Latest title */}
      <div className="ml-2 mt-3 truncate text-[10px] text-text-dim">{latestReport.title}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled run-orders — the press's recurring jobs.
// ---------------------------------------------------------------------------

function ScheduledOrdersPanel({
  scheduled,
  now,
}: {
  scheduled: AgencyReportsData['scheduled'];
  now: Date;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Scheduled run-orders</h2>
          <Chip tone="neutral">{scheduled.length} active</Chip>
        </div>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 text-[10px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
        >
          <ArrowUpRight className="h-3 w-3" />
          Add order
        </button>
      </header>
      <ul className="space-y-2">
        {scheduled.map((s) => {
          const ink = reportInkHex(s.type);
          return (
            <li
              key={s.id}
              className="relative rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2.5"
              style={{
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 5%, transparent)`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                      style={{ background: `color-mix(in srgb, ${ink} 14%, transparent)`, color: ink }}
                    >
                      {TYPE_GLYPH[s.type]}
                    </span>
                    <p className="truncate text-xs font-medium text-text">{s.title}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text-dim">
                    <CadenceBars cadence={s.cadence} ink={ink} />
                    <span className="uppercase tracking-wider" style={{ color: ink }}>
                      {CADENCE_LABEL[s.cadence]}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      next · <span className="tabular-nums">{formatRelative(s.nextRunAt, now)}</span>
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span className="tabular-nums">{s.subClientIds.length}</span> clients
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Boxes className="h-3 w-3" />
                      <span className="tabular-nums">{s.recipientCount}</span> recipients
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: ink }}
                  >
                    {shortDate(s.nextRunAt)} · {shortTime(s.nextRunAt)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-1.5 text-[9px] uppercase tracking-wider text-text-dim transition-colors hover:text-text"
                    >
                      <Settings className="h-2.5 w-2.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 text-[9px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
                    >
                      <Play className="h-2.5 w-2.5" />
                      Run now
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CadenceBars({
  cadence,
  ink,
}: {
  cadence: 'daily' | 'weekly' | 'monthly';
  ink: string;
}): JSX.Element {
  const bars = CADENCE_BARS[cadence];
  return (
    <span className="inline-flex items-end gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-0.5"
          style={{
            height: 5 + i * 2,
            background: i <= bars ? ink : `color-mix(in srgb, ${ink} 20%, transparent)`,
            borderRadius: 1,
          }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Job details inspector — selected queue row drives this read-only side
// panel showing the press's view of one job.
// ---------------------------------------------------------------------------

function JobInspector({
  job,
  agency,
}: {
  job: AgencyReportsData['reports'][number] | null;
  agency: AgencyReportsData['agency'];
}): JSX.Element {
  if (!job) {
    return (
      <section className="rounded-2xl border border-border-muted bg-surface/70 p-6">
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-text-dim">
          <Stamp className="h-8 w-8 opacity-50" />
          <p className="text-xs uppercase tracking-wider">No job selected</p>
          <p className="text-center text-[11px] text-text-faint">
            Click a row in the print queue to see the press's view of that job, including the cover-sheet headline and pull-quote.
          </p>
        </div>
      </section>
    );
  }
  const ink = reportInkHex(job.type);
  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-surface/70 p-4"
      style={{
        borderColor: `color-mix(in srgb, ${ink} 30%, var(--wp-border-muted, #2a2a3a))`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${ink} 5%, var(--wp-surface, #13131d)) 0%, var(--wp-surface, #13131d) 100%)`,
      }}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ background: `color-mix(in srgb, ${ink} 14%, transparent)`, color: ink }}
            >
              {TYPE_GLYPH[job.type]}
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{ color: ink }}
            >
              {TYPE_LABEL[job.type]} · cover sheet
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-text">{job.title}</h3>
          <p className="mt-0.5 text-[11px] text-text-dim">
            {job.subClientName ?? 'Portfolio roll-up'} · {job.rangeLabel}
          </p>
        </div>
        <StatusPill status={job.status} />
      </header>

      {/* Cover-sheet preview */}
      <div
        className="relative overflow-hidden rounded-xl border p-4"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--wp-warning, #ffb454) 6%, var(--wp-surface, #13131d)) 0%, var(--wp-surface, #13131d) 100%)',
          borderColor: `color-mix(in srgb, ${ink} 30%, transparent)`,
        }}
      >
        {/* Masthead band */}
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: ink, opacity: 0.85 }}
          aria-hidden
        />
        <div className="text-[9px] uppercase tracking-[0.2em] text-text-dim">
          {agency.name} · {agency.region}
        </div>
        {job.coverHeadline ? (
          <p
            className="mt-1.5 font-serif text-base font-semibold leading-tight text-text"
            style={{ fontFamily: '"Mercury", "Times New Roman", Georgia, serif' }}
          >
            {job.coverHeadline}
          </p>
        ) : (
          <p className="mt-1.5 text-xs italic text-text-dim">Headline composed when typesetting begins.</p>
        )}
        {job.coverPullQuote ? (
          <blockquote
            className="mt-3 border-l-2 pl-3 text-[11px] italic text-text-dim"
            style={{
              borderColor: ink,
              fontFamily: '"Mercury", "Times New Roman", Georgia, serif',
            }}
          >
            {job.coverPullQuote}
          </blockquote>
        ) : null}
      </div>

      {/* Metric strip */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <InspectorStat icon={<FileText className="h-3 w-3" />} label="Format" value={job.format.toUpperCase()} ink={ink} />
        <InspectorStat
          icon={<Boxes className="h-3 w-3" />}
          label="Size"
          value={formatBytes(job.sizeBytes)}
          ink={ink}
        />
        <InspectorStat
          icon={<Download className="h-3 w-3" />}
          label="Downloads"
          value={formatExact(job.downloadCount)}
          ink={ink}
        />
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={job.status !== 'ready'}
          className={
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] uppercase tracking-wider transition-colors ' +
            (job.status === 'ready'
              ? 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
              : 'cursor-not-allowed border-border-muted bg-surface-2 text-text-faint')
          }
        >
          <Download className="h-3 w-3" />
          Download
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-muted bg-surface-2 px-2.5 text-[11px] uppercase tracking-wider text-text-dim transition-colors hover:text-text"
        >
          <ArrowRight className="h-3 w-3" />
          Open cover
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-muted bg-surface-2 px-2.5 text-[11px] uppercase tracking-wider text-text-dim transition-colors hover:text-text"
        >
          <Wrench className="h-3 w-3" />
          Reprint
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-faint">
          <Clock className="h-3 w-3" />
          {formatRelative(job.createdAt, new Date())}
        </span>
      </div>
    </section>
  );
}

function InspectorStat({
  icon,
  label,
  value,
  ink,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  ink: string;
}): JSX.Element {
  return (
    <div
      className="rounded-md border border-border-muted bg-surface-2/60 px-2 py-1.5"
      style={{ borderColor: `color-mix(in srgb, ${ink} 18%, var(--wp-border-muted, #2a2a3a))` }}
    >
      <div className="flex items-center gap-1 text-text-dim">
        <span style={{ color: ink }}>{icon}</span>
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-0.5 font-mono text-xs tabular-nums text-text">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workshop tickertape — runs along the very bottom; cycles through recent
// events with a slow scroll. Decorative; reinforces the "live shop" feel.
// ---------------------------------------------------------------------------

function WorkshopTickertape({ reports }: { reports: AgencyReportsData['reports'] }): JSX.Element {
  const events = useMemo(() => {
    const out: Array<{ id: string; ink: string; text: string }> = [];
    for (const r of reports) {
      if (r.status === 'ready') {
        out.push({
          id: r.id + ':ready',
          ink: reportInkHex(r.type),
          text: `Printed · ${r.title} · ${formatBytes(r.sizeBytes)}`,
        });
      } else if (r.status === 'generating') {
        out.push({
          id: r.id + ':gen',
          ink: reportInkHex(r.type),
          text: `On press · ${r.title}`,
        });
      } else if (r.status === 'failed') {
        out.push({
          id: r.id + ':fail',
          ink: HEX.accent3,
          text: `Jammed · ${r.title} · maintenance flagged`,
        });
      } else if (r.status === 'queued') {
        out.push({
          id: r.id + ':q',
          ink: reportInkHex(r.type),
          text: `Queued · ${r.title}`,
        });
      }
    }
    return out;
  }, [reports]);
  const reduced = useReducedMotion();

  // Render the events twice so the loop is seamless.
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border-muted"
      style={{
        background:
          'linear-gradient(90deg, var(--wp-surface, #13131d) 0%, color-mix(in srgb, var(--wp-accent, #F26522) 4%, var(--wp-surface, #13131d)) 50%, var(--wp-surface, #13131d) 100%)',
      }}
    >
      <div className="flex items-stretch">
        <span className="flex items-center gap-1.5 border-r border-border-muted bg-bg/40 px-3 text-[10px] uppercase tracking-[0.18em] text-accent">
          <Radio className="h-3 w-3" />
          Wire
        </span>
        <div className="relative flex-1 overflow-hidden">
          <motion.div
            className="flex items-center whitespace-nowrap py-2"
            animate={reduced ? {} : { x: ['0%', '-50%'] }}
            transition={reduced ? undefined : { duration: 60, repeat: Infinity, ease: 'linear' }}
          >
            {[...events, ...events].map((ev, i) => (
              <span
                key={ev.id + '-' + i}
                className="mx-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-dim"
              >
                <span className="block h-1 w-1 rounded-full" style={{ background: ev.ink }} />
                <span style={{ color: ev.ink }}>•</span>
                <span>{ev.text}</span>
              </span>
            ))}
          </motion.div>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-12"
            style={{
              background:
                'linear-gradient(90deg, var(--wp-surface, #13131d) 0%, transparent 100%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-12"
            style={{
              background:
                'linear-gradient(270deg, var(--wp-surface, #13131d) 0%, transparent 100%)',
            }}
          />
        </div>
        <span className="flex items-center gap-1.5 border-l border-border-muted bg-bg/40 px-3 text-[10px] uppercase tracking-[0.18em] text-text-dim">
          <Zap className="h-3 w-3 text-accent" />
          {events.length} events
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Press log strip — small text feed under the press
// ---------------------------------------------------------------------------

function PressLogStrip({ reports }: { reports: AgencyReportsData['reports'] }): JSX.Element {
  const lines = useMemo(() => {
    return reports.slice(0, 6).map((r) => {
      const ink = reportInkHex(r.type);
      const verb =
        r.status === 'ready'
          ? 'COMMITTED'
          : r.status === 'generating'
            ? 'IMPRESSING'
            : r.status === 'queued'
              ? 'STAGED'
              : r.status === 'failed'
                ? 'HALTED'
                : 'DRAFT';
      return {
        id: r.id,
        ink,
        verb,
        ts: shortTime(r.createdAt),
        text: r.title,
        type: TYPE_LABEL[r.type].toUpperCase(),
      };
    });
  }, [reports]);
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Press log</h2>
          <Chip tone="neutral">last 6</Chip>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">tail · monospace · UTC</span>
      </header>
      <ul
        className="space-y-1 rounded-md border border-border-muted bg-bg/50 p-3"
        style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
      >
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-2 text-[10.5px] tabular-nums">
            <span className="text-text-faint">{line.ts}</span>
            <span
              className="rounded px-1.5 text-[9px] uppercase tracking-wider"
              style={{
                color: line.ink,
                background: `color-mix(in srgb, ${line.ink} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${line.ink} 25%, transparent)`,
              }}
            >
              {line.verb}
            </span>
            <span className="text-text-dim">[{line.type}]</span>
            <span className="truncate text-text">{line.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Press status side card — gauges + operator info, fits to the right of
// the main press composition.
// ---------------------------------------------------------------------------

function PressStatusCard({
  inkLevelPct,
  uptimePct,
  jobsPerHour,
}: {
  inkLevelPct: number;
  uptimePct: number;
  jobsPerHour: number;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-text">Press status</h2>
        </div>
        <Chip tone="accent">online</Chip>
      </header>
      <div className="grid grid-cols-1 gap-3">
        <GaugeRing
          label="Ink reservoir"
          value={inkLevelPct}
          maxValue={100}
          tone={HEX.warning}
          hint="rolls available before refill"
        />
        <GaugeRing
          label="Uptime · 30d"
          value={Math.round(uptimePct * 10) / 10}
          maxValue={100}
          tone={HEX.success}
          hint="time press was at-cycle ready"
          digits={1}
        />
        <GaugeRing
          label="Throughput"
          value={jobsPerHour}
          maxValue={20}
          tone={HEX.accent}
          hint="jobs / hour · last 24h"
          suffix=" jph"
        />
      </div>
      <div className="mt-4 rounded-md border border-border-muted bg-surface-2/60 p-3 text-[11px] text-text-dim">
        <div className="flex items-center gap-2 text-text">
          <CheckCircle2 className="h-3 w-3 text-accent" />
          <span className="text-[10px] uppercase tracking-wider">Operator notes</span>
        </div>
        <p className="mt-1.5">
          Cylinders calibrated · ink lines primed. Outlook engagement template ran hot at 04:12;
          dropped temperature 1 click. Next maintenance window <span className="text-accent">Jun 03 · 02:00 UTC</span>.
        </p>
      </div>
    </section>
  );
}

function GaugeRing({
  label,
  value,
  maxValue,
  tone,
  hint,
  digits = 0,
  suffix = '%',
}: {
  label: string;
  value: number;
  maxValue: number;
  tone: string;
  hint: string;
  digits?: number;
  suffix?: string;
}): JSX.Element {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = clamp01(value / maxValue);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border-muted bg-surface-2/60 p-3">
      <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden>
        <circle cx={36} cy={36} r={r} fill="none" stroke={HEX.border} strokeWidth={6} />
        <motion.circle
          cx={36}
          cy={36}
          r={r}
          fill="none"
          stroke={tone}
          strokeLinecap="round"
          strokeWidth={6}
          initial={{ strokeDasharray: `0 ${c}`, transform: 'rotate(-90deg)' }}
          animate={{ strokeDasharray: `${c * pct} ${c}` }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ transformOrigin: '36px 36px', transform: 'rotate(-90deg)' }}
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize={11}
          fill={tone}
          fontWeight={700}
        >
          {value.toFixed(digits)}
          {suffix}
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
        <div className="text-[11px] text-text-dim">{hint}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Press selector toolbar — view-mode / range / type filters above the press.
// ---------------------------------------------------------------------------

function PressToolbar({
  typeFilter,
  setTypeFilter,
  rangeLabel,
}: {
  typeFilter: ReportType | 'all';
  setTypeFilter: (t: ReportType | 'all') => void;
  rangeLabel: string;
}): JSX.Element {
  const tabs: Array<{ id: ReportType | 'all'; label: string }> = [
    { id: 'all', label: 'All ink' },
    { id: 'warmth', label: 'Warmth' },
    { id: 'engagement', label: 'Engagement' },
    { id: 'placement', label: 'Placement' },
    { id: 'white_label', label: 'White-label' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-muted bg-surface/70 p-2">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => {
          const active = typeFilter === t.id;
          const ink = t.id === 'all' ? HEX.accent : reportInkHex(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={
                'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] uppercase tracking-wider transition-colors ' +
                (active
                  ? 'text-text'
                  : 'border-border-muted bg-surface-2 text-text-dim hover:text-text')
              }
              style={
                active
                  ? {
                      color: ink,
                      borderColor: `color-mix(in srgb, ${ink} 40%, transparent)`,
                      background: `color-mix(in srgb, ${ink} 12%, transparent)`,
                    }
                  : undefined
              }
            >
              {t.id !== 'all' ? TYPE_GLYPH[t.id] : <Droplet className="h-3 w-3" />}
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-dim">
        <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-2 py-1">
          <CalendarClock className="h-3 w-3" />
          {rangeLabel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-2 py-1">
          <ChevronRight className="h-3 w-3" />
          Operator view
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compute helpers — derive the press state (ink levels, on-press job, etc)
// from the data prop so we can render fully without an API.
// ---------------------------------------------------------------------------

interface PressState {
  feedingSheets: AgencyReportsData['reports'];
  emergingSheets: AgencyReportsData['reports'];
  currentJob: AgencyReportsData['reports'][number] | null;
  inkUsage: Record<ReportType, { wellFillPct: number; printedThisMonth: number; capRemaining: number }>;
  printedToday: number;
  queueDepth: number;
  inkLevelPct: number;
  uptimePct: number;
  jobsPerHour: number;
}

function computePressState(data: AgencyReportsData, now: Date): PressState {
  const generating = data.reports.find((r) => r.status === 'generating') ?? null;
  const queued = data.reports.filter((r) => r.status === 'queued');
  const failed = data.reports.filter((r) => r.status === 'failed');
  const ready = data.reports.filter((r) => r.status === 'ready');

  const feedingSheets = [...(generating ? [generating] : []), ...queued, ...failed].slice(0, 5);
  const emergingSheets = [...ready].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const currentJob = generating ?? queued[0] ?? null;

  // Group counts by report type
  const countsByType: Record<ReportType, number> = {
    warmth: 0,
    engagement: 0,
    placement: 0,
    white_label: 0,
  };
  for (const r of data.reports) {
    countsByType[r.type] += 1;
  }

  // Pretend the well has a per-month cap of 25; remaining is cap - printedThisMonth.
  const cap = 25;
  const inkUsage: PressState['inkUsage'] = {
    warmth: {
      printedThisMonth: countsByType.warmth,
      wellFillPct: Math.max(8, Math.round(((cap - countsByType.warmth) / cap) * 100)),
      capRemaining: Math.max(0, cap - countsByType.warmth),
    },
    engagement: {
      printedThisMonth: countsByType.engagement,
      wellFillPct: Math.max(8, Math.round(((cap - countsByType.engagement) / cap) * 100)),
      capRemaining: Math.max(0, cap - countsByType.engagement),
    },
    placement: {
      printedThisMonth: countsByType.placement,
      wellFillPct: Math.max(8, Math.round(((cap - countsByType.placement) / cap) * 100)),
      capRemaining: Math.max(0, cap - countsByType.placement),
    },
    white_label: {
      printedThisMonth: countsByType.white_label,
      wellFillPct: Math.max(8, Math.round(((cap - countsByType.white_label) / cap) * 100)),
      capRemaining: Math.max(0, cap - countsByType.white_label),
    },
  };

  // Printed today = ready reports with today's date
  const todayIso = now.toISOString().split('T')[0]!;
  const printedToday = ready.filter((r) => r.createdAt.startsWith(todayIso)).length || 12;

  const queueDepth = queued.length + (generating ? 1 : 0);

  // Aggregate ink — weighted average fill across the 4 wells, slightly boosted.
  const inkAvg = Math.round(
    (inkUsage.warmth.wellFillPct +
      inkUsage.engagement.wellFillPct +
      inkUsage.placement.wellFillPct +
      inkUsage.white_label.wellFillPct) /
      4,
  );
  const inkLevelPct = Math.max(10, Math.min(99, inkAvg));

  // Uptime — fixed 99.2 from spec
  const uptimePct = 99.2;

  // Jobs per hour — printed today / hours so far (or default to 8)
  const hoursSoFar = Math.max(1, now.getUTCHours());
  const jobsPerHour = Math.max(2, Math.min(16, Math.round((printedToday / hoursSoFar) * 4) + 2));

  return {
    feedingSheets,
    emergingSheets,
    currentJob,
    inkUsage,
    printedToday,
    queueDepth,
    inkLevelPct,
    uptimePct,
    jobsPerHour,
  };
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function AgRptR2Press({ data }: { data?: AgencyReportsData } = {}): JSX.Element {
  const live: AgencyReportsData = data ?? MOCK;

  const [now, setNow] = useState<Date>(() => new Date('2026-05-29T10:30:00Z'));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [reduced]);

  const state = useMemo(() => computePressState(live, now), [live, now]);

  // Filter state — applies to queue + stacks; press itself always runs
  // the live "on press" job so the spectacle doesn't go cold.
  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');

  const filteredReports = useMemo(() => {
    if (typeFilter === 'all') return live.reports;
    return live.reports.filter((r) => r.type === typeFilter);
  }, [live.reports, typeFilter]);

  // Queue = anything not finished (drafts + queued + generating + failed)
  const queueList = useMemo(
    () => filteredReports.filter((r) => r.status !== 'ready'),
    [filteredReports],
  );

  // Selected job for the inspector. Default = current job on press.
  const [selectedId, setSelectedId] = useState<string | null>(state.currentJob?.id ?? null);
  useEffect(() => {
    if (selectedId === null && state.currentJob) {
      setSelectedId(state.currentJob.id);
    }
  }, [selectedId, state.currentJob]);

  const selectedJob: AgencyReportsData['reports'][number] | null = useMemo(
    () => live.reports.find((r) => r.id === selectedId) ?? state.currentJob,
    [live.reports, selectedId, state.currentJob],
  );

  // Pin font import once on mount via a style block — no global side effects.
  // (We rely on system serif fallback, but try to use Mercury/Times for the
  //  print-shop feel.)
  return (
    <div
      className="relative isolate min-h-full bg-bg pb-12"
      style={
        {
          // Per project rule: prefer var(--wp-*) but fall back to inline hex
          // so the file renders in the design-preview harness even before
          // hero-theme.css mounts.
          '--press-paper-tint': 'color-mix(in srgb, var(--wp-warning, #ffb454) 6%, var(--wp-surface, #13131d))',
        } as CSSProperties
      }
    >
      {/* Aurora / grease wash background — subtle, all orange */}
      <PressBackdrop />

      <div className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 pt-4 md:px-6">
        {/* Header */}
        <PrintShopHeader
          data={live}
          printedToday={state.printedToday}
          queueDepth={state.queueDepth}
          inkLevelPct={state.inkLevelPct}
          uptimePct={state.uptimePct}
        />

        {/* Toolbar */}
        <PressToolbar
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          rangeLabel="Last 30 days"
        />

        {/* MAIN PRESS BAY — press + status side card */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ThePress
            feedingSheets={state.feedingSheets}
            emergingSheets={state.emergingSheets}
            currentJob={state.currentJob}
          />
          <PressStatusCard
            inkLevelPct={state.inkLevelPct}
            uptimePct={state.uptimePct}
            jobsPerHour={state.jobsPerHour}
          />
        </div>

        {/* INK WELLS + QUEUE + INSPECTOR — three-column work area */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <PrintQueuePanel
            queue={queueList}
            onPress={state.currentJob}
            onSelectJob={setSelectedId}
            selectedId={selectedId}
          />
          <div className="flex flex-col gap-4">
            <InkWellsPanel inkUsage={state.inkUsage} />
            <ScheduledOrdersPanel scheduled={live.scheduled} now={now} />
          </div>
          <div className="flex flex-col gap-4">
            <JobInspector job={selectedJob} agency={live.agency} />
            <PressLogStrip reports={live.reports} />
          </div>
        </div>

        {/* OUTPUT STACKS */}
        <OutputStacksFooter reports={filteredReports} subClients={live.subClients} />

        {/* Wire tickertape */}
        <WorkshopTickertape reports={live.reports} />

        <AnimatePresence>
          {/* placeholder for future fly-in toasts — keeps AnimatePresence in tree */}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backdrop — soft orange aurora behind the press, like grease + light.
// ---------------------------------------------------------------------------

function PressBackdrop(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-accent, #F26522) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute -right-40 top-60 h-[520px] w-[520px] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-accent-2, #FF8A4B) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute left-1/3 bottom-0 h-[360px] w-[600px] rounded-full opacity-15 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-warning, #ffb454) 0%, transparent 100%)',
        }}
      />
      {/* Grain dots */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.05]">
        <defs>
          <pattern id="press-grain-bg" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.6" fill={HEX.accent} />
            <circle cx="14" cy="9" r="0.4" fill={HEX.accent2} />
            <circle cx="7" cy="16" r="0.5" fill={HEX.warning} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#press-grain-bg)" />
      </svg>
    </div>
  );
}

export default AgRptR2Press;
