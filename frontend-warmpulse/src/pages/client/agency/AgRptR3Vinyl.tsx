import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  Crown,
  CircleSlash,
  Disc3,
  Download,
  FileText,
  Filter,
  Flame,
  Gauge,
  Headphones,
  Layers,
  ListMusic,
  Loader2,
  Mic2,
  Music,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Search,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react';

/**
 * AgRptR3Vinyl — Agency-tier REPORTS surface, design candidate R3
 * "Vinyl Record Crate".
 *
 * The Agency Reports surface re-imagined as a DJ booth / vinyl-shop crate:
 *
 *   - Each generated report becomes a vinyl record. Its colored sleeve
 *     carries cover-art derived from the report TYPE; the disc itself is
 *     near-black with concentric grooves and a warm orange label at the
 *     center. The "now playing" record sits on a turntable platter that
 *     SPINS at a slow 33⅓-rpm cadence under a warm orange wash.
 *
 *   - The CRATE grid lists recent records. Sleeves hover-flip on Y-axis
 *     to reveal a B-side overlay with download / share / export buttons.
 *
 *   - The DJ SETLIST (right rail) treats scheduled reports as tracks in
 *     tonight's set. Each scheduled item shows a "TRACK 0X" leader, a
 *     decorative BPM tempo derived from cadence and a next-run timer.
 *
 *   - The STUDIO STATS footer summarises chart-toppers — most-downloaded
 *     report type, total plays (downloads), tracks shipped this month and
 *     scheduled set length.
 *
 * Fully STANDALONE — no network, router, query hooks, no required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the Agency Reports
 * aggregate endpoint exists. NOT a magazine spread, NOT a timeline feed,
 * NOT a white-label studio (sibling R1 / R2 / R4 own those identities) —
 * the spinning-vinyl + DJ-crate metaphor is the differentiator.
 *
 * STRICT palette: Shailog orange only. Surfaces dark. No purple / blue /
 * cyan / teal anywhere. Cover-art uses per-type tinted decorative SVG
 * patterns derived from the orange family + semantic tokens.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — re-export from the sibling R1 variant
// so all four variants stay schema-locked. R1 is the source of truth for
// the type. The future server-driven adapter passes the same shape into
// every candidate, so a mismatch here would crash the design preview.
// ---------------------------------------------------------------------------

import { formatNumber } from '@/lib/format';
import type {
  AgencyReportsData,
  ReportFormat,
  ReportStatus,
  ReportType,
} from '@/pages/client/agency/AgRptR1Magazine';

export type { AgencyReportsData, ReportFormat, ReportStatus, ReportType };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

function fmtRelativeFuture(iso: string, now: Date): string {
  const target = new Date(iso).getTime();
  const diffMs = target - now.getTime();
  if (diffMs <= 0) return 'cued up';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

function fmtRelativePast(iso: string, now: Date): string {
  const target = new Date(iso).getTime();
  const diffMs = now.getTime() - target;
  if (diffMs <= 0) return 'just now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Hash a stable string into a 0..1 float — used to seed cover-art patterns
// so the same report id always paints the same SVG.
function hashUnit(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Report-type vocabulary — labels, glyphs, "album genre" copy and
// per-type orange-palette tints for cover art.
// ---------------------------------------------------------------------------

interface TypeDescriptor {
  label: string;
  album: string; // album-title style copy for the sleeve front
  genre: string; // decorative DJ "genre" tag
  Icon: typeof Disc3;
  bpm: number; // decorative BPM stamp on cover
  tint: { primary: string; secondary: string };
}

const TYPE_INFO: Record<ReportType, TypeDescriptor> = {
  warmth: {
    label: 'Warmth',
    album: 'Warm Side B',
    genre: 'Deep Warmup',
    Icon: Flame,
    bpm: 124,
    tint: {
      primary: 'var(--wp-accent, #F26522)',
      secondary: 'var(--wp-accent-2, #FF8A4B)',
    },
  },
  engagement: {
    label: 'Engagement',
    album: 'Open Replies LP',
    genre: 'Engagement House',
    Icon: Headphones,
    bpm: 118,
    tint: {
      primary: 'var(--wp-accent-2, #FF8A4B)',
      secondary: 'var(--wp-accent-3, #FF9670)',
    },
  },
  placement: {
    label: 'Placement',
    album: 'Inbox Placement EP',
    genre: 'Folder Funk',
    Icon: Mic2,
    bpm: 112,
    tint: {
      primary: 'var(--wp-accent-3, #FF9670)',
      secondary: 'var(--wp-accent, #F26522)',
    },
  },
  white_label: {
    label: 'White-label',
    album: 'Agency Mixtape',
    genre: 'Boutique Blend',
    Icon: Crown,
    bpm: 96,
    tint: {
      primary: 'var(--wp-accent, #F26522)',
      secondary: 'var(--wp-accent-3, #FF9670)',
    },
  },
};

const STATUS_INFO: Record<
  ReportStatus,
  { label: string; tone: 'accent' | 'accent2' | 'accent3' | 'neutral' | 'warning' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'accent3' },
  generating: { label: 'On deck', tone: 'accent2' },
  ready: { label: 'Pressed', tone: 'accent' },
  failed: { label: 'Skipped', tone: 'warning' },
};

const CADENCE_INFO: Record<
  'daily' | 'weekly' | 'monthly',
  { label: string; bpm: number; tone: 'accent' | 'accent2' | 'accent3' }
> = {
  daily: { label: 'Daily', bpm: 128, tone: 'accent' },
  weekly: { label: 'Weekly', bpm: 96, tone: 'accent2' },
  monthly: { label: 'Monthly', bpm: 64, tone: 'accent3' },
};

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency catalogue: a deep crate of recent reports.
// ---------------------------------------------------------------------------

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: [
    { id: 'helix', name: 'Helix Outbound', domain: 'helix.io', mailboxCount: 20 },
    { id: 'lumen', name: 'Lumen Labs', domain: 'getlumen.co', mailboxCount: 12 },
    { id: 'orbit', name: 'Orbit GTM', domain: 'orbit-gtm.com', mailboxCount: 8 },
    { id: 'fern', name: 'Fern Studio', domain: 'fern.studio', mailboxCount: 6 },
    { id: 'sable', name: 'Sable Reach', domain: 'sable.email', mailboxCount: 14 },
  ],
  reports: [
    {
      id: 'rep-2026-05-29-warmth-helix',
      title: 'Helix Outbound · Warmth Recap',
      type: 'warmth',
      format: 'pdf',
      status: 'generating',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      createdAt: '2026-05-29T13:42:00Z',
      rangeLabel: 'May 22 → May 29',
      sizeBytes: 1_842_103,
      downloadCount: 0,
      coverHeadline: 'Reputation rebounds across helix.io send fleet',
      coverPullQuote: 'Warmup velocity up 12% week-over-week.',
    },
    {
      id: 'rep-2026-05-28-engagement-orbit',
      title: 'Orbit GTM · Reply Engagement',
      type: 'engagement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'orbit',
      subClientName: 'Orbit GTM',
      createdAt: '2026-05-28T09:15:00Z',
      rangeLabel: 'May 21 → May 28',
      sizeBytes: 1_215_988,
      downloadCount: 7,
      coverHeadline: 'Reply rate crosses 8.4% for the first time this quarter',
      coverPullQuote: 'Engagement house is heating up on the B-side.',
    },
    {
      id: 'rep-2026-05-28-placement-lumen',
      title: 'Lumen Labs · Inbox Placement',
      type: 'placement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'lumen',
      subClientName: 'Lumen Labs',
      createdAt: '2026-05-28T07:02:00Z',
      rangeLabel: 'May 1 → May 28',
      sizeBytes: 2_201_454,
      downloadCount: 11,
      coverHeadline: 'Inbox placement steady at 94.6% — folder funk on the rise',
      coverPullQuote: 'Folder funk: spam slips from 1.7% to 1.1%.',
    },
    {
      id: 'rep-2026-05-27-white-label-fern',
      title: 'Fern Studio · Monthly Mixtape',
      type: 'white_label',
      format: 'pdf',
      status: 'ready',
      subClientId: 'fern',
      subClientName: 'Fern Studio',
      createdAt: '2026-05-27T16:30:00Z',
      rangeLabel: 'May 1 → May 27',
      sizeBytes: 3_447_872,
      downloadCount: 4,
      coverHeadline: 'Boutique mixtape — six tracks, all peaks, no skips',
      coverPullQuote: 'Crafted set, monthly cadence, agency vibes.',
    },
    {
      id: 'rep-2026-05-27-warmth-sable',
      title: 'Sable Reach · Warmth Sprint',
      type: 'warmth',
      format: 'csv',
      status: 'ready',
      subClientId: 'sable',
      subClientName: 'Sable Reach',
      createdAt: '2026-05-27T11:14:00Z',
      rangeLabel: 'May 20 → May 27',
      sizeBytes: 408_211,
      downloadCount: 3,
      coverHeadline: 'CSV cut for warm-fleet analysts at Sable',
      coverPullQuote: 'Raw groove — bring your own visualisation.',
    },
    {
      id: 'rep-2026-05-26-engagement-helix',
      title: 'Helix Outbound · Engagement EP',
      type: 'engagement',
      format: 'pdf',
      status: 'ready',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      createdAt: '2026-05-26T08:48:00Z',
      rangeLabel: 'May 19 → May 26',
      sizeBytes: 1_544_007,
      downloadCount: 9,
      coverHeadline: 'Helix opens 31% / replies 7.8% — house anthem unlocked',
      coverPullQuote: 'Subject-line A/B is the bassline this week.',
    },
    {
      id: 'rep-2026-05-25-placement-orbit',
      title: 'Orbit GTM · Placement Single',
      type: 'placement',
      format: 'csv',
      status: 'queued',
      subClientId: 'orbit',
      subClientName: 'Orbit GTM',
      createdAt: '2026-05-25T22:01:00Z',
      rangeLabel: 'May 18 → May 25',
      sizeBytes: 256_001,
      downloadCount: 0,
      coverHeadline: 'Spam folder dropouts trace a clean step pattern',
      coverPullQuote: 'Three-week step, one-week pivot.',
    },
    {
      id: 'rep-2026-05-25-warmth-lumen',
      title: 'Lumen Labs · Warmth Rotation',
      type: 'warmth',
      format: 'pdf',
      status: 'ready',
      subClientId: 'lumen',
      subClientName: 'Lumen Labs',
      createdAt: '2026-05-25T14:22:00Z',
      rangeLabel: 'May 18 → May 25',
      sizeBytes: 1_998_113,
      downloadCount: 5,
      coverHeadline: 'Rotation finds the groove — peers hold the count',
      coverPullQuote: 'Default pool peers cover the long fade-out.',
    },
    {
      id: 'rep-2026-05-24-white-label-helix',
      title: 'Helix Outbound · Brand Edition',
      type: 'white_label',
      format: 'pdf',
      status: 'ready',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      createdAt: '2026-05-24T18:05:00Z',
      rangeLabel: 'May 1 → May 24',
      sizeBytes: 4_201_888,
      downloadCount: 12,
      coverHeadline: 'Helix-branded mixtape — agency removes itself, music stays',
      coverPullQuote: 'White label, full volume.',
    },
    {
      id: 'rep-2026-05-23-engagement-sable',
      title: 'Sable Reach · Reply Mix',
      type: 'engagement',
      format: 'pdf',
      status: 'failed',
      subClientId: 'sable',
      subClientName: 'Sable Reach',
      createdAt: '2026-05-23T19:48:00Z',
      rangeLabel: 'May 16 → May 23',
      sizeBytes: 0,
      downloadCount: 0,
      coverHeadline: 'Generator skipped — peer signal stub',
      coverPullQuote: 'Re-cue once peer ingestion completes.',
    },
    {
      id: 'rep-2026-05-22-warmth-fern',
      title: 'Fern Studio · Warmth Single',
      type: 'warmth',
      format: 'pdf',
      status: 'ready',
      subClientId: 'fern',
      subClientName: 'Fern Studio',
      createdAt: '2026-05-22T10:28:00Z',
      rangeLabel: 'May 15 → May 22',
      sizeBytes: 988_211,
      downloadCount: 6,
      coverHeadline: 'Small fleet, big swing — Fern hits 81 reputation',
      coverPullQuote: '6 mailboxes, 4 peers, one warm hook.',
    },
    {
      id: 'rep-2026-05-21-placement-helix',
      title: 'Helix Outbound · Placement Drop',
      type: 'placement',
      format: 'csv',
      status: 'ready',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      createdAt: '2026-05-21T09:11:00Z',
      rangeLabel: 'May 14 → May 21',
      sizeBytes: 312_775,
      downloadCount: 4,
      coverHeadline: 'CSV slice for placement audit — pull, sort, listen',
      coverPullQuote: 'Three workbook tabs, one steady tempo.',
    },
  ],
  scheduled: [
    {
      id: 'sched-helix-weekly-warmth',
      title: 'Helix · Weekly Warmth Set',
      type: 'warmth',
      cadence: 'weekly',
      nextRunAt: '2026-05-31T06:00:00Z',
      subClientIds: ['helix'],
      recipientCount: 3,
    },
    {
      id: 'sched-orbit-daily-engagement',
      title: 'Orbit · Daily Engagement Pulse',
      type: 'engagement',
      cadence: 'daily',
      nextRunAt: '2026-05-30T06:00:00Z',
      subClientIds: ['orbit'],
      recipientCount: 2,
    },
    {
      id: 'sched-monthly-placement-all',
      title: 'Portfolio · Monthly Placement Mixtape',
      type: 'placement',
      cadence: 'monthly',
      nextRunAt: '2026-06-01T07:30:00Z',
      subClientIds: ['helix', 'lumen', 'orbit', 'fern', 'sable'],
      recipientCount: 8,
    },
    {
      id: 'sched-fern-monthly-mixtape',
      title: 'Fern · Monthly White-label Mixtape',
      type: 'white_label',
      cadence: 'monthly',
      nextRunAt: '2026-06-01T09:00:00Z',
      subClientIds: ['fern'],
      recipientCount: 2,
    },
    {
      id: 'sched-lumen-weekly-warmth',
      title: 'Lumen · Weekly Warmth Sprint',
      type: 'warmth',
      cadence: 'weekly',
      nextRunAt: '2026-05-31T08:00:00Z',
      subClientIds: ['lumen'],
      recipientCount: 3,
    },
  ],
  summary: {
    reportsThisMonth: 12,
    reportsTotal: 84,
    downloadsThisMonth: 61,
    scheduledActive: 5,
  },
};

// ---------------------------------------------------------------------------
// Cover-art SVG patterns — per-type decorative motifs derived from `seed`.
// ---------------------------------------------------------------------------

interface CoverArtProps {
  type: ReportType;
  seed: string;
}

function CoverArtBars({ seed }: { seed: string }): JSX.Element {
  const bars = Array.from({ length: 18 }, (_, i) => {
    const h = 12 + Math.round(hashUnit(seed, i * 7) * 70);
    return { i, h };
  });
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full opacity-90"
      aria-hidden
    >
      {bars.map((b) => (
        <rect
          key={b.i}
          x={(b.i / bars.length) * 100 + 0.6}
          y={100 - b.h * 0.85}
          width={100 / bars.length - 1.2}
          height={b.h * 0.85}
          fill="url(#cover-bars-grad)"
          rx={0.6}
        />
      ))}
    </svg>
  );
}

function CoverArtCircles({ seed }: { seed: string }): JSX.Element {
  const circles = Array.from({ length: 5 }, (_, i) => {
    const r = 12 + i * 9;
    const dash = 4 + Math.round(hashUnit(seed, i * 11) * 6);
    return { r, dash, i };
  });
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full opacity-90"
      aria-hidden
    >
      <g transform="translate(50 50)">
        {circles.map((c) => (
          <circle
            key={c.i}
            cx={0}
            cy={0}
            r={c.r}
            fill="none"
            stroke="url(#cover-circles-grad)"
            strokeWidth={1.4}
            strokeDasharray={`${c.dash} ${c.dash + 2}`}
            opacity={0.85 - c.i * 0.1}
          />
        ))}
        <circle cx={0} cy={0} r={3} fill="url(#cover-circles-grad)" />
      </g>
    </svg>
  );
}

function CoverArtWaves({ seed }: { seed: string }): JSX.Element {
  const paths: string[] = [];
  for (let row = 0; row < 6; row++) {
    const amp = 4 + hashUnit(seed, row * 9) * 6;
    const phase = hashUnit(seed, row * 13) * Math.PI * 2;
    let d = `M 0 ${15 + row * 14}`;
    for (let x = 0; x <= 100; x += 5) {
      const y = 15 + row * 14 + Math.sin((x / 100) * Math.PI * 2 + phase) * amp;
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    paths.push(d);
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full opacity-90"
      aria-hidden
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p}
          fill="none"
          stroke="url(#cover-waves-grad)"
          strokeWidth={1.2}
          opacity={0.85 - i * 0.08}
        />
      ))}
    </svg>
  );
}

function CoverArtDiamonds({ seed }: { seed: string }): JSX.Element {
  const tiles: { x: number; y: number; o: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const o = hashUnit(seed, r * 13 + c * 17);
      if (o > 0.35) tiles.push({ x: c * 12.5, y: r * 12.5, o });
    }
  }
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full opacity-90"
      aria-hidden
    >
      {tiles.map((t, i) => (
        <g key={i} transform={`translate(${t.x + 6.25} ${t.y + 6.25})`}>
          <rect
            x={-3}
            y={-3}
            width={6}
            height={6}
            fill="url(#cover-diamonds-grad)"
            opacity={t.o}
            transform="rotate(45)"
            rx={0.6}
          />
        </g>
      ))}
    </svg>
  );
}

function CoverArt({ type, seed }: CoverArtProps): JSX.Element {
  // Cover-art chooser: each type owns a motif. Gradients are declared in
  // each SVG so multiple sleeves can render without collisions, but use
  // the orange palette + semantic tokens exclusively.
  return (
    <>
      <svg width={0} height={0} className="absolute" aria-hidden>
        <defs>
          <linearGradient id="cover-bars-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--wp-accent-2, #FF8A4B)" />
            <stop offset="100%" stopColor="var(--wp-accent, #F26522)" />
          </linearGradient>
          <radialGradient id="cover-circles-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--wp-accent-2, #FF8A4B)" />
            <stop offset="100%" stopColor="var(--wp-accent, #F26522)" />
          </radialGradient>
          <linearGradient id="cover-waves-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--wp-accent-3, #FF9670)" />
            <stop offset="100%" stopColor="var(--wp-accent, #F26522)" />
          </linearGradient>
          <linearGradient id="cover-diamonds-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--wp-accent-2, #FF8A4B)" />
            <stop offset="100%" stopColor="var(--wp-accent-3, #FF9670)" />
          </linearGradient>
        </defs>
      </svg>
      {type === 'warmth' && <CoverArtBars seed={seed} />}
      {type === 'engagement' && <CoverArtCircles seed={seed} />}
      {type === 'placement' && <CoverArtWaves seed={seed} />}
      {type === 'white_label' && <CoverArtDiamonds seed={seed} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Vinyl record SVG — concentric grooves on a near-black disc with an
// orange-tinted center label that carries title + type glyph.
// ---------------------------------------------------------------------------

interface VinylDiscProps {
  size: number;
  type: ReportType;
  label?: string;
  subLabel?: string;
  highlighted?: boolean;
}

function VinylDisc({
  size,
  type,
  label,
  subLabel,
  highlighted,
}: VinylDiscProps): JSX.Element {
  const info = TYPE_INFO[type];
  const Glyph = info.Icon;
  const labelR = size * 0.18;
  const center = size / 2;
  const grooves: number[] = [];
  for (let r = size * 0.46; r > size * 0.22; r -= 1.6) {
    grooves.push(r);
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden
      className="block"
    >
      <defs>
        <radialGradient id={`vinyl-body-${type}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a1a1f" />
          <stop offset="85%" stopColor="#0a0a0d" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id={`vinyl-shine-${type}`} cx="35%" cy="30%" r="55%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id={`vinyl-label-${type}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={info.tint.secondary} />
          <stop offset="80%" stopColor={info.tint.primary} />
          <stop offset="100%" stopColor="#7a2a0d" />
        </radialGradient>
      </defs>
      <circle cx={center} cy={center} r={size * 0.48} fill={`url(#vinyl-body-${type})`} />
      {grooves.map((r, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#2a2a30"
          strokeWidth={0.4}
          opacity={0.7 - (i % 4) * 0.08}
        />
      ))}
      <circle
        cx={center}
        cy={center}
        r={size * 0.48}
        fill={`url(#vinyl-shine-${type})`}
      />
      <circle
        cx={center}
        cy={center}
        r={labelR}
        fill={`url(#vinyl-label-${type})`}
        stroke={highlighted ? 'var(--wp-accent-2, #FF8A4B)' : '#3a1a08'}
        strokeWidth={1}
      />
      <circle cx={center} cy={center} r={size * 0.02} fill="#0a0a0d" />
      <foreignObject
        x={center - labelR * 0.85}
        y={center - labelR * 0.85}
        width={labelR * 1.7}
        height={labelR * 1.7}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-center">
          <Glyph size={Math.max(10, size * 0.05)} className="text-white/95" strokeWidth={1.8} />
          {label ? (
            <div
              className="font-mono uppercase tracking-[0.18em] text-white/95"
              style={{ fontSize: Math.max(7, size * 0.028) }}
            >
              {label}
            </div>
          ) : null}
          {subLabel ? (
            <div
              className="uppercase tracking-[0.16em] text-white/70"
              style={{ fontSize: Math.max(6, size * 0.024) }}
            >
              {subLabel}
            </div>
          ) : null}
        </div>
      </foreignObject>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tonearm SVG — black-and-orange arm pointed at the record's outer groove.
// ---------------------------------------------------------------------------

interface TonearmProps {
  size: number;
}

function Tonearm({ size }: TonearmProps): JSX.Element {
  // Anchored at the upper-right corner of the platter, the arm sweeps
  // down-left to rest on the disc. Subtle bob is applied at the parent.
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id="tonearm-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f1f24" />
          <stop offset="100%" stopColor="#3a3a45" />
        </linearGradient>
      </defs>
      {/* base pivot */}
      <circle cx={86} cy={14} r={9} fill="#1a1a1f" stroke="#3a3a45" strokeWidth={1.2} />
      <circle cx={86} cy={14} r={4} fill="var(--wp-accent, #F26522)" />
      <circle cx={86} cy={14} r={1.6} fill="#0a0a0d" />
      {/* main arm */}
      <rect
        x={36}
        y={11}
        width={50}
        height={6}
        rx={3}
        fill="url(#tonearm-grad)"
        transform="rotate(28 86 14)"
      />
      {/* head shell */}
      <rect
        x={26}
        y={56}
        width={20}
        height={10}
        rx={2}
        fill="#1f1f24"
        stroke="var(--wp-accent-2, #FF8A4B)"
        strokeWidth={1.2}
        transform="rotate(28 86 14)"
      />
      {/* needle */}
      <line
        x1={28}
        y1={66}
        x2={28}
        y2={72}
        stroke="var(--wp-accent, #F26522)"
        strokeWidth={1.4}
        transform="rotate(28 86 14)"
      />
      <circle cx={28} cy={72.5} r={1.4} fill="var(--wp-accent, #F26522)" transform="rotate(28 86 14)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Background ambience — warm orange ambient gradient + dust speckles
// derived from a stable seed (so the layout doesn't reshuffle on rerender).
// ---------------------------------------------------------------------------

function BackgroundAmbience(): JSX.Element {
  const dust = useMemo(() => {
    const items: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 48; i++) {
      items.push({
        x: hashUnit('dust-x', i) * 100,
        y: hashUnit('dust-y', i) * 100,
        r: 0.3 + hashUnit('dust-r', i) * 1.1,
        o: 0.05 + hashUnit('dust-o', i) * 0.18,
      });
    }
    return items;
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(242, 101, 34, 0.10), transparent 55%),' +
            'radial-gradient(circle at 82% 88%, rgba(255, 138, 75, 0.08), transparent 60%),' +
            'radial-gradient(circle at 50% 5%, rgba(255, 150, 112, 0.06), transparent 65%)',
        }}
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {dust.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill="var(--wp-accent-2, #FF8A4B)"
            opacity={d.o}
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

type ChipTone = 'accent' | 'accent2' | 'accent3' | 'neutral' | 'warning';

const CHIP_TONE: Record<ChipTone, { text: string; bg: string; border: string }> = {
  accent: { text: 'text-accent', bg: 'bg-accent/12', border: 'border-accent/40' },
  accent2: { text: 'text-accent2', bg: 'bg-accent2/12', border: 'border-accent2/40' },
  accent3: { text: 'text-accent3', bg: 'bg-accent3/12', border: 'border-accent3/40' },
  neutral: {
    text: 'text-text-dim',
    bg: 'bg-surface-2/70',
    border: 'border-border-muted',
  },
  warning: { text: 'text-accent3', bg: 'bg-accent3/15', border: 'border-accent3/50' },
};

interface ChipProps {
  tone?: ChipTone;
  children: React.ReactNode;
}

function Chip({ tone = 'neutral', children }: ChipProps): JSX.Element {
  const t = CHIP_TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.bg} ${t.border} ${t.text}`}
    >
      {children}
    </span>
  );
}

interface SectionTitleProps {
  eyebrow: string;
  title: string;
  blurb?: string;
  Icon: typeof Disc3;
  right?: React.ReactNode;
}

function SectionTitle({
  eyebrow,
  title,
  blurb,
  Icon,
  right,
}: SectionTitleProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="leading-tight">
          <div className="text-[10.5px] uppercase tracking-[0.24em] text-text-faint">
            {eyebrow}
          </div>
          <div className="text-base font-semibold text-text">{title}</div>
          {blurb ? <div className="text-[11px] text-text-dim">{blurb}</div> : null}
        </div>
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio header — "Records · Northwind Agency" + DJ ON DECK pill + stats
// ---------------------------------------------------------------------------

interface StudioHeaderProps {
  data: AgencyReportsData;
  onDeck: AgencyReportsData['reports'][number] | undefined;
  topGenre: ReportType;
}

function StudioHeader({ data, onDeck, topGenre }: StudioHeaderProps): JSX.Element {
  const genreInfo = TYPE_INFO[topGenre];
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 right-0 h-48 w-48 rounded-full opacity-30"
        style={{
          background:
            'radial-gradient(circle, rgba(242, 101, 34, 0.45), transparent 70%)',
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ rotate: -8, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-border-muted bg-bg shadow-glow"
          >
            <Disc3 className="h-7 w-7 text-accent" strokeWidth={1.6} />
            <motion.div
              className="absolute inset-0 rounded-xl"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                boxShadow: '0 0 24px rgba(242, 101, 34, 0.35)',
              }}
            />
          </motion.div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.24em] text-text-faint">
              Records ·{' '}
              <span className="text-text-dim">{data.agency.name}</span>
            </div>
            <div className="mt-1 font-serif text-[28px] leading-none text-text">
              The Crate
            </div>
            <div className="mt-1 text-[11px] text-text-dim">
              Region {data.agency.region} ·{' '}
              <span className="font-mono">{data.subClients.length}</span>{' '}
              sub-clients in rotation
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <motion.span
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent"
          >
            <motion.span
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            DJ on deck
          </motion.span>
          <Chip tone="accent2">
            <Radio className="h-3 w-3" />
            33⅓ RPM
          </Chip>
          {onDeck ? (
            <Chip tone="accent3">
              <Music className="h-3 w-3" />
              {TYPE_INFO[onDeck.type].label}
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeaderStat
          eyebrow="Records this month"
          value={fmtInt(data.summary.reportsThisMonth)}
          unit="cuts"
          Icon={Disc3}
        />
        <HeaderStat
          eyebrow="Plays"
          value={fmtInt(data.summary.downloadsThisMonth)}
          unit="downloads"
          Icon={Play}
        />
        <HeaderStat
          eyebrow="On rotation"
          value={fmtInt(data.summary.scheduledActive)}
          unit="scheduled"
          Icon={Repeat}
        />
        <HeaderStat
          eyebrow="Genre top chart"
          value={genreInfo.label.toUpperCase()}
          unit={genreInfo.genre.toUpperCase()}
          Icon={Trophy}
        />
      </div>
    </header>
  );
}

interface HeaderStatProps {
  eyebrow: string;
  value: string;
  unit: string;
  Icon: typeof Disc3;
}

function HeaderStat({ eyebrow, value, unit, Icon }: HeaderStatProps): JSX.Element {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3.5 py-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <span>{eyebrow}</span>
        <Icon className="h-3 w-3 text-accent" strokeWidth={1.8} />
      </div>
      <div className="mt-1 font-mono text-[20px] leading-none text-text">{value}</div>
      <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
        {unit}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turntable hero — center stage with the spinning record + tonearm
// ---------------------------------------------------------------------------

interface TurntableHeroProps {
  report: AgencyReportsData['reports'][number] | undefined;
  now: Date;
}

function TurntableHero({ report, now }: TurntableHeroProps): JSX.Element {
  const generating = report?.status === 'generating';
  const baseSpin = 1.8;
  const spinDuration = generating ? 0.8 : baseSpin;
  const info = report ? TYPE_INFO[report.type] : null;
  const TypeIcon = info ? info.Icon : Disc3;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <SectionTitle
          eyebrow="Now spinning"
          title="Turntable"
          blurb={
            generating
              ? 'Record actively pressing — engine on the platter'
              : 'Most recent record on the platter — needle down'
          }
          Icon={Disc3}
        />
        {report ? (
          <div className="flex items-center gap-2">
            <Chip tone={STATUS_INFO[report.status].tone}>
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Disc3 className="h-3 w-3" />
              )}
              {STATUS_INFO[report.status].label}
            </Chip>
            <Chip tone="accent2">
              <TypeIcon className="h-3 w-3" />
              {info ? info.label : 'Mixtape'}
            </Chip>
            <Chip tone="neutral">
              <FileText className="h-3 w-3" />
              {report.format.toUpperCase()}
            </Chip>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Platter */}
        <div className="relative flex flex-col items-center">
          {/* Ambient orange wash under the turntable */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            animate={{ opacity: [0.55, 0.8, 0.55], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background:
                'radial-gradient(circle, rgba(242, 101, 34, 0.28), rgba(242, 101, 34, 0.04) 60%, transparent 75%)',
              filter: generating ? 'brightness(1.4)' : 'brightness(1.0)',
            }}
          />

          <div className="relative h-[400px] w-[400px] max-w-full">
            {/* Polished platter base */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-full border border-border-muted shadow-glow"
              style={{
                background:
                  'radial-gradient(circle at 35% 28%, #2a2a30, #15151a 70%, #08080b 100%)',
              }}
            />
            {/* Platter rim highlight */}
            <div
              aria-hidden
              className="absolute inset-2 rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, transparent 65%, rgba(255, 138, 75, 0.10) 78%, transparent 90%)',
              }}
            />

            {/* Spinning record */}
            <motion.div
              className="absolute inset-6 flex items-center justify-center"
              animate={{ rotate: 360 }}
              transition={{
                duration: spinDuration,
                ease: 'linear',
                repeat: Infinity,
              }}
            >
              {report ? (
                <VinylDisc
                  size={350}
                  type={report.type}
                  label={info ? info.label : 'Side A'}
                  subLabel={report.format.toUpperCase()}
                  highlighted={generating}
                />
              ) : (
                <VinylDisc size={350} type="warmth" label="Empty" subLabel="No cuts" />
              )}
            </motion.div>

            {/* Spindle dot — sits over the disc center */}
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg shadow-glow"
            />

            {/* Tonearm */}
            <motion.div
              className="absolute -right-4 top-0 h-[180px] w-[180px]"
              animate={{ rotate: generating ? [-1.5, 1.5, -1.5] : [-0.8, 0.8, -0.8] }}
              transition={{
                duration: generating ? 0.8 : 2.4,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
              style={{ transformOrigin: '90% 10%' }}
            >
              <Tonearm size={180} />
            </motion.div>
          </div>

          {/* "Now playing" strip */}
          <div className="mt-6 w-full max-w-[460px] rounded-xl border border-border-muted bg-bg/80 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-faint">
              <span>Now playing</span>
              <span className="font-mono text-text-dim">
                {report ? report.rangeLabel : '—'}
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-text">
              {report ? report.title : 'No record cued'}
            </div>
            <div className="mt-0.5 text-[11px] italic text-text-dim">
              {report ? report.coverPullQuote : 'Press play to cue the next cut.'}
            </div>
            {/* Transport buttons */}
            <div className="mt-3 flex items-center gap-2">
              <TransportButton Icon={Play} label="Play" tone="accent" />
              <TransportButton Icon={Pause} label="Pause" tone="neutral" />
              <TransportButton Icon={CircleSlash} label="Eject" tone="accent3" />
              <div className="ml-auto flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-text-faint">
                <Volume2 className="h-3 w-3" />
                <span className="font-mono text-text-dim">0 dB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Liner notes */}
        {report ? (
          <LinerNotes report={report} now={now} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border-muted bg-surface-2/40 p-6 text-center text-[11px] text-text-dim">
            No records cued. Drop a new cut from the crate below.
          </div>
        )}
      </div>
    </section>
  );
}

interface TransportButtonProps {
  Icon: typeof Play;
  label: string;
  tone: 'accent' | 'accent3' | 'neutral';
}

function TransportButton({ Icon, label, tone }: TransportButtonProps): JSX.Element {
  const t = CHIP_TONE[tone];
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${t.bg} ${t.border} ${t.text} hover:brightness-125`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

interface LinerNotesProps {
  report: AgencyReportsData['reports'][number];
  now: Date;
}

function LinerNotes({ report, now }: LinerNotesProps): JSX.Element {
  const info = TYPE_INFO[report.type];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border-muted bg-surface-2/50 p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
          Liner notes
        </div>
        <div className="mt-2 text-[15px] font-medium leading-snug text-text">
          {report.coverHeadline}
        </div>
        <blockquote className="mt-3 border-l-2 border-accent/60 pl-3 text-[12px] italic text-text-dim">
          "{report.coverPullQuote}"
        </blockquote>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LinerStat
          eyebrow="Artist"
          value={report.subClientName ?? 'Portfolio mix'}
          Icon={Mic2}
        />
        <LinerStat eyebrow="Album" value={info.album} Icon={Disc3} />
        <LinerStat
          eyebrow="Pressed"
          value={fmtRelativePast(report.createdAt, now)}
          Icon={Clock}
        />
        <LinerStat eyebrow="Side" value={report.rangeLabel} Icon={Calendar} />
        <LinerStat
          eyebrow="Plays"
          value={fmtInt(report.downloadCount)}
          Icon={Headphones}
        />
        <LinerStat
          eyebrow="Weight"
          value={report.sizeBytes > 0 ? fmtBytes(report.sizeBytes) : '—'}
          Icon={Layers}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent hover:bg-accent/25"
        >
          <Download className="h-3.5 w-3.5" />
          Spin a copy
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim hover:text-text"
        >
          <Share2 className="h-3.5 w-3.5" />
          Cue for client
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim hover:text-text"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Remix
        </button>
      </div>
    </div>
  );
}

interface LinerStatProps {
  eyebrow: string;
  value: string;
  Icon: typeof Clock;
}

function LinerStat({ eyebrow, value, Icon }: LinerStatProps): JSX.Element {
  return (
    <div className="rounded-lg border border-border-muted bg-bg/40 px-3 py-2.5">
      <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.18em] text-text-faint">
        <span>{eyebrow}</span>
        <Icon className="h-3 w-3 text-accent" strokeWidth={1.8} />
      </div>
      <div className="mt-1 truncate text-[12.5px] text-text">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crate — grid of sleeves that flip on hover
// ---------------------------------------------------------------------------

interface CrateProps {
  reports: AgencyReportsData['reports'];
  now: Date;
  onPick: (id: string) => void;
  selectedId: string | undefined;
}

function CrateGrid({ reports, now, onPick, selectedId }: CrateProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | ReportType>('all');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return reports.filter((r) => {
      const matchesType = filter === 'all' || r.type === filter;
      const matchesText =
        lower.length === 0 ||
        r.title.toLowerCase().includes(lower) ||
        (r.subClientName ?? '').toLowerCase().includes(lower) ||
        r.coverHeadline.toLowerCase().includes(lower);
      return matchesType && matchesText;
    });
  }, [reports, filter, search]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle
          eyebrow="Recent records"
          title="The crate"
          blurb="Flip a sleeve to see its B-side actions"
          Icon={Layers}
        />
        <div className="flex flex-wrap items-center gap-2">
          <CrateFilter
            label="All"
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <CrateFilter
            label="Warmth"
            active={filter === 'warmth'}
            onClick={() => setFilter('warmth')}
          />
          <CrateFilter
            label="Engagement"
            active={filter === 'engagement'}
            onClick={() => setFilter('engagement')}
          />
          <CrateFilter
            label="Placement"
            active={filter === 'placement'}
            onClick={() => setFilter('placement')}
          />
          <CrateFilter
            label="White-label"
            active={filter === 'white_label'}
            onClick={() => setFilter('white_label')}
          />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Crate search"
              className="w-44 rounded-md border border-border-muted bg-bg/60 py-1.5 pl-7 pr-2 text-[11px] text-text placeholder:text-text-faint focus:border-accent/60 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r, i) => (
          <CrateSleeve
            key={r.id}
            report={r}
            index={i}
            now={now}
            selected={selectedId === r.id}
            onSelect={() => onPick(r.id)}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-border-muted bg-surface-2/30 p-8 text-center text-[12px] text-text-dim">
            No records match the crate filter.
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface CrateFilterProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function CrateFilter({ label, active, onClick }: CrateFilterProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] transition-colors ${
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-border-muted bg-surface-2/40 text-text-dim hover:text-text'
      }`}
    >
      <Filter className="h-3 w-3" />
      {label}
    </button>
  );
}

interface CrateSleeveProps {
  report: AgencyReportsData['reports'][number];
  index: number;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}

function CrateSleeve({
  report,
  index,
  now,
  selected,
  onSelect,
}: CrateSleeveProps): JSX.Element {
  const [flipped, setFlipped] = useState(false);
  const info = TYPE_INFO[report.type];
  const statusInfo = STATUS_INFO[report.status];
  const TypeGlyph = info.Icon;
  const sleeveStyle: CSSProperties = {
    perspective: '1100px',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 12) * 0.06 }}
      style={sleeveStyle}
      className="relative"
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onFocus={() => setFlipped(true)}
      onBlur={() => setFlipped(false)}
    >
      <motion.div
        className="relative h-[300px] w-full"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* FRONT — album sleeve */}
        <div
          className={`absolute inset-0 flex flex-col rounded-xl border bg-surface-2/70 p-3 ${
            selected ? 'border-accent/60 shadow-glow' : 'border-border-muted'
          }`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Cover art */}
          <button
            type="button"
            onClick={onSelect}
            className="relative aspect-square w-full overflow-hidden rounded-lg border border-bg/80"
            style={{
              background:
                'linear-gradient(135deg, rgba(242, 101, 34, 0.30), rgba(242, 101, 34, 0.05) 60%, rgba(10, 10, 15, 0.6))',
            }}
          >
            <CoverArt type={report.type} seed={report.id} />
            {/* The actual vinyl peeking out from the right edge */}
            <div className="absolute -right-12 top-1/2 -translate-y-1/2 opacity-90">
              <motion.div
                animate={
                  selected ? { rotate: 360 } : { rotate: 0 }
                }
                transition={
                  selected
                    ? {
                        duration: 2.4,
                        ease: 'linear',
                        repeat: Infinity,
                      }
                    : { duration: 0 }
                }
              >
                <VinylDisc size={140} type={report.type} label={info.label} />
              </motion.div>
            </div>
            {/* Top-left genre badge */}
            <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-bg/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-text">
              <TypeGlyph className="h-3 w-3 text-accent" strokeWidth={1.8} />
              {info.genre}
            </div>
            {/* Bottom corner BPM stamp */}
            <div className="absolute bottom-2 left-2 rounded-md border border-border-muted bg-bg/80 px-2 py-1 text-[9px] font-mono text-text-dim">
              {info.bpm} BPM
            </div>
            {/* Status corner */}
            <div className="absolute right-2 top-2">
              <Chip tone={statusInfo.tone}>
                {report.status === 'generating' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Disc3 className="h-3 w-3" />
                )}
                {statusInfo.label}
              </Chip>
            </div>
          </button>

          {/* Sleeve text — album title style */}
          <div className="mt-3 flex flex-1 flex-col">
            <div className="text-[9.5px] uppercase tracking-[0.22em] text-text-faint">
              {report.subClientName ?? 'Portfolio mix'}
            </div>
            <div className="mt-0.5 truncate font-serif text-[15px] leading-tight text-text">
              {report.title}
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-text-dim">
              <span className="font-mono">{report.format.toUpperCase()}</span>
              <span>{report.rangeLabel}</span>
            </div>
            <div className="mt-auto flex items-center justify-between text-[10px] text-text-faint">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtRelativePast(report.createdAt, now)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Headphones className="h-3 w-3" />
                {fmtInt(report.downloadCount)}
              </span>
            </div>
          </div>

          {/* Decorative hover hint */}
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-bg/80 px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.2em] text-text-faint opacity-70">
            Flip
          </div>
        </div>

        {/* BACK — B-side actions */}
        <div
          className="absolute inset-0 flex flex-col rounded-xl border border-accent/40 bg-bg/95 p-4"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.22em] text-text-faint">
                B-side
              </div>
              <div className="mt-0.5 font-serif text-[15px] leading-tight text-text">
                {info.album}
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
              <TypeGlyph className="h-4 w-4" strokeWidth={1.8} />
            </div>
          </div>

          <div className="mt-3 text-[12px] leading-snug text-text-dim">
            {report.coverHeadline}
          </div>

          <ul className="mt-3 space-y-1.5 text-[10.5px] text-text-dim">
            <li className="flex items-center justify-between">
              <span className="uppercase tracking-[0.16em] text-text-faint">
                Side
              </span>
              <span>{report.rangeLabel}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="uppercase tracking-[0.16em] text-text-faint">
                Weight
              </span>
              <span className="font-mono">
                {report.sizeBytes > 0 ? fmtBytes(report.sizeBytes) : '—'}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="uppercase tracking-[0.16em] text-text-faint">
                Plays
              </span>
              <span className="font-mono">{fmtInt(report.downloadCount)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="uppercase tracking-[0.16em] text-text-faint">
                Pressed
              </span>
              <span>{fmtRelativePast(report.createdAt, now)}</span>
            </li>
          </ul>

          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent hover:bg-accent/25"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Download cut
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border-muted bg-surface-2/70 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-text-dim hover:text-text"
              >
                <Share2 className="h-3 w-3" />
                Share
              </button>
              <button
                type="button"
                onClick={onSelect}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-accent2/40 bg-accent2/10 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent2 hover:bg-accent2/15"
              >
                <Disc3 className="h-3 w-3" />
                Spin
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DJ Setlist (right rail) — scheduled reports styled as tracks in a set
// ---------------------------------------------------------------------------

interface DJSetlistProps {
  scheduled: AgencyReportsData['scheduled'];
  subClients: AgencyReportsData['subClients'];
  now: Date;
}

function DJSetlist({ scheduled, subClients, now }: DJSetlistProps): JSX.Element {
  return (
    <aside className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <SectionTitle
        eyebrow="Set list"
        title="Tonight's rotation"
        blurb="Scheduled reports queued for the next spin"
        Icon={ListMusic}
        right={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent hover:bg-accent/25"
          >
            <Plus className="h-3 w-3" />
            Add track
          </button>
        }
      />

      <div className="rounded-xl border border-border-muted bg-bg/40 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_72px] items-center gap-2">
          <span>#</span>
          <span>Track</span>
          <span className="text-right">Cue</span>
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        <AnimatePresence initial>
          {scheduled.map((s, i) => (
            <SetlistTrack
              key={s.id}
              track={s}
              index={i}
              now={now}
              subClients={subClients}
            />
          ))}
        </AnimatePresence>
      </ol>

      {scheduled.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-muted bg-surface-2/30 p-6 text-center text-[11px] text-text-dim">
          No scheduled reports — the deck is silent.
        </div>
      ) : null}

      {/* Footer — encore */}
      <div className="mt-1 flex items-center justify-between rounded-xl border border-border-muted bg-surface-2/50 px-3 py-2 text-[10.5px] text-text-dim">
        <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.18em] text-text-faint">
          <Repeat className="h-3 w-3" /> Encore
        </span>
        <span className="font-mono">
          {scheduled.reduce((acc, s) => acc + s.recipientCount, 0)} listeners
          tonight
        </span>
      </div>
    </aside>
  );
}

interface SetlistTrackProps {
  track: AgencyReportsData['scheduled'][number];
  index: number;
  now: Date;
  subClients: AgencyReportsData['subClients'];
}

function SetlistTrack({
  track,
  index,
  now,
  subClients,
}: SetlistTrackProps): JSX.Element {
  const cadence = CADENCE_INFO[track.cadence];
  const info = TYPE_INFO[track.type];
  const trackNo = String(index + 1).padStart(2, '0');
  const isPortfolio = track.subClientIds.length === subClients.length;
  const audienceLabel = isPortfolio
    ? 'Portfolio mix'
    : track.subClientIds.length === 1
      ? subClients.find((s) => s.id === track.subClientIds[0])?.name ?? 'Sub-client'
      : `${track.subClientIds.length} clients`;
  return (
    <motion.li
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 12) * 0.05 }}
      exit={{ opacity: 0, x: 12 }}
      className="grid grid-cols-[28px_minmax(0,1fr)_72px] items-center gap-2 rounded-xl border border-border-muted bg-bg/50 px-3 py-3 hover:border-accent/40"
    >
      <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-text-faint">
        TR
        <br />
        {trackNo}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-faint">
          <info.Icon className="h-3 w-3 text-accent" strokeWidth={1.8} />
          <span>{info.label}</span>
          <span className="text-text-dim">/</span>
          <span>{cadence.label}</span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-text">{track.title}</div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-dim">
          <span className="inline-flex items-center gap-1">
            <Gauge className="h-3 w-3 text-accent2" /> {cadence.bpm} BPM
          </span>
          <span className="inline-flex items-center gap-1">
            <Mic2 className="h-3 w-3 text-accent3" /> {audienceLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Headphones className="h-3 w-3" /> {fmtInt(track.recipientCount)}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-[0.18em] text-text-faint">
          Cue in
        </div>
        <div className="font-mono text-[12px] text-accent">
          {fmtRelativeFuture(track.nextRunAt, now)}
        </div>
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Studio stats footer — chart toppers, play count, total tracks
// ---------------------------------------------------------------------------

interface StudioStatsProps {
  data: AgencyReportsData;
  topGenre: ReportType;
  topGenreCount: number;
  setLengthMinutes: number;
  averagePlays: number;
}

function StudioStats({
  data,
  topGenre,
  topGenreCount,
  setLengthMinutes,
  averagePlays,
}: StudioStatsProps): JSX.Element {
  const top = TYPE_INFO[topGenre];
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <SectionTitle
          eyebrow="Studio stats"
          title="Chart toppers"
          blurb="Aggregate trends across the crate"
          Icon={BarChart3}
        />
        <Chip tone="accent">
          <Trophy className="h-3 w-3" />
          {top.label} top genre
        </Chip>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioStatTile
          eyebrow="Chart topper"
          value={top.label}
          unit={`${topGenreCount} cuts`}
          Icon={top.Icon}
          tone="accent"
          progress={Math.min(1, topGenreCount / Math.max(1, data.reports.length))}
        />
        <StudioStatTile
          eyebrow="Total plays"
          value={fmtInt(data.summary.downloadsThisMonth)}
          unit="this month"
          Icon={Play}
          tone="accent2"
          progress={Math.min(1, data.summary.downloadsThisMonth / 100)}
        />
        <StudioStatTile
          eyebrow="Tracks shipped"
          value={fmtInt(data.summary.reportsTotal)}
          unit={`+${data.summary.reportsThisMonth} this month`}
          Icon={Disc3}
          tone="accent3"
          progress={clamp(data.summary.reportsThisMonth / 20, 0, 1)}
        />
        <StudioStatTile
          eyebrow="Set length"
          value={`${setLengthMinutes}`}
          unit="min on rotation"
          Icon={Clock}
          tone="accent"
          progress={clamp(setLengthMinutes / 60, 0, 1)}
        />
      </div>

      {/* Genre breakdown — equaliser */}
      <div className="mt-4 rounded-xl border border-border-muted bg-bg/50 p-4">
        <div className="mb-3 flex items-center justify-between text-[10.5px] uppercase tracking-[0.18em] text-text-faint">
          <span>Equaliser · plays by genre</span>
          <span className="font-mono text-text-dim">
            avg {averagePlays.toFixed(1)} plays / record
          </span>
        </div>
        <GenreEqualiser reports={data.reports} />
      </div>
    </section>
  );
}

interface StudioStatTileProps {
  eyebrow: string;
  value: string;
  unit: string;
  Icon: typeof Disc3;
  tone: 'accent' | 'accent2' | 'accent3';
  progress: number;
}

function StudioStatTile({
  eyebrow,
  value,
  unit,
  Icon,
  tone,
  progress,
}: StudioStatTileProps): JSX.Element {
  const t = CHIP_TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-muted bg-surface-2/60 p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <span>{eyebrow}</span>
        <span className={t.text}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-2 font-mono text-[22px] leading-none text-text">{value}</div>
      <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
        {unit}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg/70">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full rounded-full ${t.bg.replace('/12', '/40').replace('/15', '/50')}`}
          style={{
            background:
              tone === 'accent'
                ? 'linear-gradient(90deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                : tone === 'accent2'
                  ? 'linear-gradient(90deg, var(--wp-accent-2, #FF8A4B), var(--wp-accent-3, #FF9670))'
                  : 'linear-gradient(90deg, var(--wp-accent-3, #FF9670), var(--wp-accent, #F26522))',
          }}
        />
      </div>
    </div>
  );
}

interface GenreEqualiserProps {
  reports: AgencyReportsData['reports'];
}

function GenreEqualiser({ reports }: GenreEqualiserProps): JSX.Element {
  // Aggregate plays + counts per genre, then animate bar heights in.
  const stats = useMemo(() => {
    const acc: Record<
      ReportType,
      { plays: number; count: number; label: string; Icon: typeof Disc3 }
    > = {
      warmth: { plays: 0, count: 0, label: 'Warmth', Icon: TYPE_INFO.warmth.Icon },
      engagement: {
        plays: 0,
        count: 0,
        label: 'Engagement',
        Icon: TYPE_INFO.engagement.Icon,
      },
      placement: {
        plays: 0,
        count: 0,
        label: 'Placement',
        Icon: TYPE_INFO.placement.Icon,
      },
      white_label: {
        plays: 0,
        count: 0,
        label: 'White-label',
        Icon: TYPE_INFO.white_label.Icon,
      },
    };
    for (const r of reports) {
      acc[r.type].plays += r.downloadCount;
      acc[r.type].count += 1;
    }
    return acc;
  }, [reports]);

  const max = Math.max(
    stats.warmth.plays,
    stats.engagement.plays,
    stats.placement.plays,
    stats.white_label.plays,
    1,
  );

  const keys: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];

  return (
    <div className="grid grid-cols-4 gap-3">
      {keys.map((k, idx) => {
        const s = stats[k]!;
        const Glyph = s.Icon;
        const ratio = s.plays / max;
        return (
          <div key={k} className="flex flex-col items-center gap-2">
            <div className="relative h-32 w-full overflow-hidden rounded-md border border-border-muted bg-bg/70">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(0.04, ratio) * 100}%` }}
                transition={{ duration: 1.1, delay: idx * 0.12, ease: 'easeOut' }}
                className="absolute inset-x-0 bottom-0"
                style={{
                  background:
                    idx % 2 === 0
                      ? 'linear-gradient(180deg, var(--wp-accent-2, #FF8A4B), var(--wp-accent, #F26522))'
                      : 'linear-gradient(180deg, var(--wp-accent-3, #FF9670), var(--wp-accent-2, #FF8A4B))',
                }}
              />
              {/* groove ticks */}
              {[1, 2, 3, 4].map((g) => (
                <div
                  key={g}
                  className="absolute inset-x-0 h-px bg-bg/70"
                  style={{ bottom: `${g * 18}%` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Glyph className="h-3 w-3 text-accent" strokeWidth={1.8} />
              {s.label}
            </div>
            <div className="font-mono text-[11px] text-text">
              {fmtInt(s.plays)} <span className="text-text-faint">plays</span>
            </div>
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-text-faint">
              {fmtInt(s.count)} cuts
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-client roster strip — "artists in residence" rail
// ---------------------------------------------------------------------------

interface RosterStripProps {
  data: AgencyReportsData;
}

function RosterStrip({ data }: RosterStripProps): JSX.Element {
  // Compute count of cuts per sub-client to size their roster card.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const sc of data.subClients) map.set(sc.id, 0);
    for (const r of data.reports) {
      if (r.subClientId) {
        map.set(r.subClientId, (map.get(r.subClientId) ?? 0) + 1);
      }
    }
    return map;
  }, [data]);

  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <SectionTitle
          eyebrow="Artists in residence"
          title="Sub-client roster"
          blurb="Each artist on the label has a discography in the crate"
          Icon={Mic2}
        />
        <Chip tone="neutral">
          <Music2 className="h-3 w-3" />
          {fmtInt(data.subClients.length)} on the roster
        </Chip>
      </div>
      <div className="flex flex-wrap gap-3">
        {data.subClients.map((sc, i) => {
          const cuts = counts.get(sc.id) ?? 0;
          const initial = sc.name.charAt(0).toUpperCase();
          return (
            <motion.div
              key={sc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="group flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-border-muted bg-bg/40 p-3 hover:border-accent/40"
            >
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border-muted bg-bg shadow-glow">
                <span className="font-serif text-lg text-accent">{initial}</span>
                <span className="pointer-events-none absolute inset-0 rounded-full border border-accent/30 opacity-0 group-hover:opacity-100" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-text">
                  {sc.name}
                </div>
                <div className="truncate text-[10.5px] uppercase tracking-[0.18em] text-text-dim">
                  {sc.domain}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-text-faint">
                  <span className="inline-flex items-center gap-1">
                    <Disc3 className="h-3 w-3 text-accent" /> {fmtInt(cuts)} cuts
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mic2 className="h-3 w-3 text-accent2" /> {fmtInt(sc.mailboxCount)}{' '}
                    mics
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Spotlight strip — featured cuts + DJ alert if any record failed
// ---------------------------------------------------------------------------

interface SpotlightStripProps {
  reports: AgencyReportsData['reports'];
}

function SpotlightStrip({ reports }: SpotlightStripProps): JSX.Element {
  const failedCount = reports.filter((r) => r.status === 'failed').length;
  const generatingCount = reports.filter((r) => r.status === 'generating').length;
  const top = useMemo(() => {
    return [...reports]
      .filter((r) => r.status === 'ready')
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, 3);
  }, [reports]);
  return (
    <section className="rounded-2xl border border-border-muted bg-surface/40 p-5 backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <SectionTitle
          eyebrow="Spotlight"
          title="Featured cuts"
          blurb="Three most-spun records and live deck status"
          Icon={Star}
        />
        <div className="flex flex-wrap items-center gap-2">
          {generatingCount > 0 ? (
            <Chip tone="accent2">
              <Loader2 className="h-3 w-3 animate-spin" /> {generatingCount} pressing
            </Chip>
          ) : null}
          {failedCount > 0 ? (
            <Chip tone="warning">
              <AlertTriangle className="h-3 w-3" /> {failedCount} skipped
            </Chip>
          ) : (
            <Chip tone="accent">
              <Activity className="h-3 w-3" /> Deck steady
            </Chip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {top.map((r, i) => {
          const info = TYPE_INFO[r.type];
          const Glyph = info.Icon;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative overflow-hidden rounded-xl border border-border-muted bg-bg/60 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <VinylDisc size={68} type={r.type} label={info.label} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[9.5px] uppercase tracking-[0.18em] text-text-faint">
                    <Glyph className="h-3 w-3 text-accent" strokeWidth={1.8} />
                    {info.genre}
                  </div>
                  <div className="mt-0.5 truncate font-serif text-[14px] text-text">
                    {r.title}
                  </div>
                  <div className="mt-1 truncate text-[11px] italic text-text-dim">
                    {r.coverPullQuote}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10.5px] text-text-faint">
                    <span className="inline-flex items-center gap-1">
                      <Headphones className="h-3 w-3" /> {fmtInt(r.downloadCount)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" /> {r.format.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-3 -right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent/50 bg-accent/20 text-accent">
                <span className="font-mono text-[12px]">#{i + 1}</span>
              </div>
            </motion.div>
          );
        })}
        {top.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-border-muted bg-surface-2/30 p-8 text-center text-[12px] text-text-dim">
            No spotlight cuts yet. Press the first record from the crate.
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Vinyl-shop ticker — decorative scrolling marquee
// ---------------------------------------------------------------------------

function ShopTicker({ data }: { data: AgencyReportsData }): JSX.Element {
  const segments = useMemo(() => {
    return [
      `Now spinning — ${data.reports[0]?.title ?? 'Crate is silent'}`,
      `${fmtInt(data.summary.reportsThisMonth)} fresh cuts this month`,
      `${fmtInt(data.summary.downloadsThisMonth)} plays logged`,
      `${fmtInt(data.scheduled.length)} scheduled tracks queued`,
      `Northwind Agency · region ${data.agency.region}`,
      'Crate refreshed nightly · grooves stay warm',
    ];
  }, [data]);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/40 px-4 py-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-12"
        style={{
          background: 'linear-gradient(90deg, rgba(18, 18, 26, 1), transparent)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-12"
        style={{
          background: 'linear-gradient(-90deg, rgba(18, 18, 26, 1), transparent)',
        }}
      />
      <motion.div
        className="flex w-max items-center gap-8 whitespace-nowrap text-[11px] uppercase tracking-[0.24em] text-text-dim"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 38, ease: 'linear', repeat: Infinity }}
      >
        {[...segments, ...segments].map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            <Waves className="h-3 w-3 text-accent" />
            <span className="text-text-faint">·</span>
            {s}
            <span className="text-text-faint">·</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Press notes — closing strip with tiny credits + a "side-B" tease
// ---------------------------------------------------------------------------

interface PressNotesProps {
  data: AgencyReportsData;
}

function PressNotes({ data }: PressNotesProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface/40 px-4 py-3 text-[11px] text-text-dim">
      <div className="inline-flex items-center gap-2">
        <Disc3 className="h-3.5 w-3.5 text-accent" />
        Crate pressed for{' '}
        <span className="font-mono text-text">{data.agency.name}</span> ·{' '}
        <span>{fmtInt(data.reports.length)} sleeves on display</span>
      </div>
      <div className="inline-flex items-center gap-2 text-text-faint">
        <Zap className="h-3 w-3" /> Variant R3 · Vinyl Record Crate
        <ChevronRight className="h-3 w-3" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Now-spinning ribbon — connects header to turntable visually
// ---------------------------------------------------------------------------

interface NowSpinningRibbonProps {
  onDeck: AgencyReportsData['reports'][number] | undefined;
}

function NowSpinningRibbon({ onDeck }: NowSpinningRibbonProps): JSX.Element {
  if (!onDeck) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface/40 px-4 py-3 text-center text-[11px] text-text-dim">
        Crate idle · drop a record to start the set.
      </div>
    );
  }
  const info = TYPE_INFO[onDeck.type];
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em]"
      style={{
        boxShadow: 'inset 0 0 0 1px rgba(255, 138, 75, 0.25)',
      }}
    >
      <div className="flex items-center gap-2 text-accent">
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 4, ease: 'linear', repeat: Infinity }}
          className="inline-flex h-5 w-5 items-center justify-center"
        >
          <Disc3 className="h-4 w-4" strokeWidth={1.8} />
        </motion.span>
        Now spinning · {info.label}
      </div>
      <div className="font-mono text-text">{onDeck.title}</div>
      <div className="text-text-dim">{onDeck.rangeLabel}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRptR3Vinyl({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const d: AgencyReportsData = data ?? MOCK;
  const [now, setNow] = useState<Date>(new Date('2026-05-29T14:00:00Z'));
  useEffect(() => {
    // Real wall-clock would refresh every minute; the design preview tolerates
    // any cadence. Avoid setting interval if running under SSR.
    const handle = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(handle);
  }, []);

  // Pick the "now playing" record: a generating one wins; else most recent
  // ready record; else the first row.
  const onDeck = useMemo(() => {
    const generating = d.reports.find((r) => r.status === 'generating');
    if (generating) return generating;
    const ready = [...d.reports]
      .filter((r) => r.status === 'ready')
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
    return ready ?? d.reports[0];
  }, [d.reports]);

  const [selectedReportId, setSelectedReportId] = useState<string | undefined>(
    onDeck?.id,
  );
  useEffect(() => {
    if (!selectedReportId && onDeck) {
      setSelectedReportId(onDeck.id);
    }
  }, [onDeck, selectedReportId]);

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return onDeck;
    return d.reports.find((r) => r.id === selectedReportId) ?? onDeck;
  }, [d.reports, selectedReportId, onDeck]);

  // Compute top genre from report counts.
  const typeCounts = useMemo(() => {
    const acc: Record<ReportType, number> = {
      warmth: 0,
      engagement: 0,
      placement: 0,
      white_label: 0,
    };
    for (const r of d.reports) {
      acc[r.type] += 1;
    }
    return acc;
  }, [d.reports]);

  const topGenre: ReportType = useMemo(() => {
    let bestKey: ReportType = 'warmth';
    let best = -1;
    (Object.keys(typeCounts) as ReportType[]).forEach((k) => {
      if (typeCounts[k] > best) {
        best = typeCounts[k];
        bestKey = k;
      }
    });
    return bestKey;
  }, [typeCounts]);

  const setLengthMinutes = useMemo(() => {
    // Decorative: 8 min per record on rotation.
    return d.scheduled.length * 12 + d.reports.length * 2;
  }, [d.scheduled.length, d.reports.length]);

  const averagePlays = useMemo(() => {
    if (d.reports.length === 0) return 0;
    let sum = 0;
    for (const r of d.reports) sum += r.downloadCount;
    return sum / d.reports.length;
  }, [d.reports]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-text">
      <BackgroundAmbience />
      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6">
        <StudioHeader data={d} onDeck={onDeck} topGenre={topGenre} />
        <NowSpinningRibbon onDeck={onDeck} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main column */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            <TurntableHero report={selectedReport} now={now} />
            <CrateGrid
              reports={d.reports}
              now={now}
              onPick={setSelectedReportId}
              selectedId={selectedReportId}
            />
            <SpotlightStrip reports={d.reports} />
          </div>

          {/* Right rail */}
          <aside className="lg:col-span-4">
            <DJSetlist scheduled={d.scheduled} subClients={d.subClients} now={now} />
          </aside>
        </div>

        <RosterStrip data={d} />
        <StudioStats
          data={d}
          topGenre={topGenre}
          topGenreCount={typeCounts[topGenre]}
          setLengthMinutes={setLengthMinutes}
          averagePlays={averagePlays}
        />
        <ShopTicker data={d} />
        <PressNotes data={d} />
      </div>
    </div>
  );
}

export default AgRptR3Vinyl;
