import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import {
  Archive,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock3,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Gauge,
  Inbox,
  LayoutGrid,
  Library,
  LineChart,
  Loader2,
  Mail,
  MailCheck,
  Newspaper,
  Repeat2,
  Send,
  ShieldCheck,
  Signal,
  Sparkles,
  Stamp,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgRptR1Magazine — Agency-tier REPORTS surface, design candidate R1,
 * "Magazine Newsstand".
 *
 * The Reports surface re-imagined as a premium editorial PUBLICATION:
 *
 *   - The agency's name is the MASTHEAD of a deliverability monthly
 *     ("NORTHWIND DELIVERABILITY REVIEW") with volume / issue / edition.
 *   - The LATEST report becomes the FEATURED COVER — full-bleed editorial
 *     hero with a giant serif headline, pull quote, big issue meta-strip,
 *     decorative cover illustration and a "READ ISSUE" CTA chip.
 *   - Older reports stack onto a RECENT ISSUES RACK — a grid of mini
 *     covers, each tinted by report TYPE (placement / warmth / engagement
 *     / white-label) using four orange variants. Hover lifts the cover
 *     off the rack and fades in a "READ" overlay.
 *   - Scheduled reports become the SUBSCRIPTIONS DESK — a newspaper-list
 *     of standing subscriptions with cadence pills, recipient counts,
 *     and a next-edition countdown.
 *   - The EDITOR'S DESK footer is a small stats strip: reports this
 *     month, total downloads, active subscriptions, most-downloaded
 *     type.
 *
 * The aesthetic is editorial: bold display serifs for headlines, clean
 * sans for body, generous negative space, orange editorial accents.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists. This file is the SOURCE OF TRUTH for the
 * `AgencyReportsData` shape — sibling R2 / R3 / R4 import it from here.
 *
 * NOT a card grid, NOT a timeline (sibling candidates own those
 * identities). The newsstand identity — covers + pull quotes + masthead +
 * subscriptions desk — is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — exported, this file is the source of
// truth. Sibling R2 / R3 / R4 candidates import `AgencyReportsData` from
// here so the four variants stay byte-compatible.
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
    subClientId: string | null; // null = portfolio-wide
    subClientName: string | null;
    createdAt: string;
    rangeLabel: string; // "Last 30 days", "Q3 2026", etc.
    sizeBytes: number;
    downloadCount: number;
    coverHeadline: string; // short editorial-style headline
    coverPullQuote: string; // 1-line summary stat
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
// Mock data — Northwind Agency, 7 sub-clients, 8 recent reports, 4
// standing subscriptions. Editorial pull quotes baked in so the cover
// design reads as a real magazine in the design preview.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyReportsData['subClients'] = [
  { id: 'sc-helix', name: 'Helix Outreach', domain: 'helix.com', mailboxCount: 12 },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxCount: 18 },
  { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.com', mailboxCount: 22 },
  { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 8 },
  { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 14 },
  { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 9 },
  { id: 'sc-pixel', name: 'Pixel Forge', domain: 'pixelforge.io', mailboxCount: 6 },
];

const REPORTS: AgencyReportsData['reports'] = [
  {
    id: 'rpt-cover',
    title: 'Q3 Portfolio Placement Review',
    type: 'placement',
    format: 'pdf',
    status: 'ready',
    subClientId: null,
    subClientName: null,
    createdAt: '2026-10-12T08:14:00Z',
    rangeLabel: 'Q3 2026',
    sizeBytes: 4_182_300,
    downloadCount: 47,
    coverHeadline: 'PLACEMENT WINS THE QUARTER',
    coverPullQuote:
      "Northwind's portfolio gained 4.2 pts of average inbox placement across Gmail, Outlook and Yahoo.",
  },
  {
    id: 'rpt-r2',
    title: 'Helix Warmth Trajectory',
    type: 'warmth',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    createdAt: '2026-10-09T14:30:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_280_400,
    downloadCount: 12,
    coverHeadline: 'HELIX TURNS THE CORNER',
    coverPullQuote: '12 mailboxes climb past warmth 80 for the first time this cycle.',
  },
  {
    id: 'rpt-r3',
    title: 'Orion Engagement Lift',
    type: 'engagement',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    createdAt: '2026-10-07T10:45:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 982_120,
    downloadCount: 19,
    coverHeadline: 'REPLIES UP 28%',
    coverPullQuote: 'Reply velocity on the Orion fleet outperformed forecast by a full week.',
  },
  {
    id: 'rpt-r4',
    title: 'Nimbus White-label Digest',
    type: 'white_label',
    format: 'pdf',
    status: 'generating',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    createdAt: '2026-10-12T07:55:00Z',
    rangeLabel: 'Last 14 days',
    sizeBytes: 0,
    downloadCount: 0,
    coverHeadline: 'NIMBUS IN BRIEF',
    coverPullQuote: 'Custom-branded summary cut for the Nimbus partnership team.',
  },
  {
    id: 'rpt-r5',
    title: 'Quasar Placement Snapshot',
    type: 'placement',
    format: 'csv',
    status: 'ready',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    createdAt: '2026-10-05T09:00:00Z',
    rangeLabel: 'Last 7 days',
    sizeBytes: 84_220,
    downloadCount: 6,
    coverHeadline: 'INBOX HOLDS THE LINE',
    coverPullQuote: 'Quasar maintained 84.7% Gmail inboxing through a soft DKIM flap.',
  },
  {
    id: 'rpt-r6',
    title: 'Vega Engagement Dossier',
    type: 'engagement',
    format: 'pdf',
    status: 'queued',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    createdAt: '2026-10-12T06:00:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 0,
    downloadCount: 0,
    coverHeadline: 'VEGA, WARMING',
    coverPullQuote: 'A long, patient ramp — replies finally cresting the 6% mark.',
  },
  {
    id: 'rpt-r7',
    title: 'Lyra Warmth Review',
    type: 'warmth',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    createdAt: '2026-10-02T11:20:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_142_500,
    downloadCount: 9,
    coverHeadline: 'STUDIO QUIET',
    coverPullQuote: 'Lyra closes the month with the most stable reputation curve on the roster.',
  },
  {
    id: 'rpt-r8',
    title: 'Pixel Forge White-label',
    type: 'white_label',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    createdAt: '2026-09-29T13:00:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_044_000,
    downloadCount: 4,
    coverHeadline: 'FORGE FINDS ITS GROOVE',
    coverPullQuote: 'Pixel Forge graduates two new sub-domains into the production rotation.',
  },
];

const SCHEDULED: AgencyReportsData['scheduled'] = [
  {
    id: 'sch-1',
    title: 'Weekly Portfolio Digest',
    type: 'placement',
    cadence: 'weekly',
    nextRunAt: '2026-10-19T08:00:00Z',
    subClientIds: SUB_CLIENTS.map((s) => s.id),
    recipientCount: 6,
  },
  {
    id: 'sch-2',
    title: 'Helix Daily Warmth',
    type: 'warmth',
    cadence: 'daily',
    nextRunAt: '2026-10-13T07:00:00Z',
    subClientIds: ['sc-helix'],
    recipientCount: 2,
  },
  {
    id: 'sch-3',
    title: 'Nimbus White-label Monthly',
    type: 'white_label',
    cadence: 'monthly',
    nextRunAt: '2026-11-01T09:00:00Z',
    subClientIds: ['sc-nimbus'],
    recipientCount: 4,
  },
  {
    id: 'sch-4',
    title: 'Orion + Quasar Engagement',
    type: 'engagement',
    cadence: 'weekly',
    nextRunAt: '2026-10-15T08:30:00Z',
    subClientIds: ['sc-orion', 'sc-quasar'],
    recipientCount: 3,
  },
];

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: SUB_CLIENTS,
  reports: REPORTS,
  scheduled: SCHEDULED,
  summary: {
    reportsThisMonth: 14,
    reportsTotal: 248,
    downloadsThisMonth: 312,
    scheduledActive: SCHEDULED.length,
  },
};

/**
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * loaded yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty.
 */
export const AGENCY_REPORTS_SKELETON_R1: AgencyReportsData = {
  agency: { name: 'Your agency', region: 'us-east-1' },
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
// Theme + type metadata
// ---------------------------------------------------------------------------

/**
 * Per-report-type editorial palette. Each type gets a distinct orange
 * variant so a stack of mini covers reads at a glance. The four tints
 * map onto the four Shailog orange surfaces via CSS vars + alpha.
 */
const TYPE_META: Record<
  ReportType,
  {
    label: string;
    eyebrow: string;
    accentVar: string;
    coverFromVar: string;
    coverToVar: string;
    chipClass: string;
    chipDot: string;
    Icon: typeof BarChart3;
  }
> = {
  placement: {
    label: 'Placement',
    eyebrow: 'INBOX REPORT',
    accentVar: 'var(--wp-accent, #F26522)',
    coverFromVar: 'rgba(242, 101, 34, 0.42)',
    coverToVar: 'rgba(242, 101, 34, 0.06)',
    chipClass:
      'border border-accent/40 bg-accent/10 text-accent',
    chipDot: 'bg-accent',
    Icon: Target,
  },
  warmth: {
    label: 'Warmth',
    eyebrow: 'WARMUP DIGEST',
    accentVar: 'var(--wp-accent-2, #FF8A4B)',
    coverFromVar: 'rgba(255, 138, 75, 0.42)',
    coverToVar: 'rgba(255, 138, 75, 0.06)',
    chipClass:
      'border border-accent2/40 bg-accent2/10 text-accent2',
    chipDot: 'bg-accent2',
    Icon: Flame,
  },
  engagement: {
    label: 'Engagement',
    eyebrow: 'REPLY DOSSIER',
    accentVar: 'var(--wp-accent-3, #FF9670)',
    coverFromVar: 'rgba(255, 150, 112, 0.42)',
    coverToVar: 'rgba(255, 150, 112, 0.06)',
    chipClass:
      'border border-accent3/40 bg-accent3/10 text-accent3',
    chipDot: 'bg-accent3',
    Icon: Signal,
  },
  white_label: {
    label: 'White-label',
    eyebrow: 'BRANDED EDITION',
    accentVar: 'var(--wp-warning, #ffb454)',
    coverFromVar: 'rgba(255, 180, 84, 0.42)',
    coverToVar: 'rgba(255, 180, 84, 0.06)',
    chipClass:
      'border border-accent4/40 bg-accent4/10 text-accent4',
    chipDot: 'bg-accent4',
    Icon: Stamp,
  },
};

const STATUS_META: Record<
  ReportStatus,
  { label: string; chipClass: string; pulse: boolean }
> = {
  ready: {
    label: 'READY',
    chipClass: 'border border-accent/40 bg-accent/15 text-accent',
    pulse: false,
  },
  generating: {
    label: 'GENERATING',
    chipClass:
      'border border-accent4/40 bg-accent4/10 text-accent4',
    pulse: true,
  },
  queued: {
    label: 'QUEUED',
    chipClass:
      'border border-border-muted bg-surface-2/80 text-text-dim',
    pulse: false,
  },
  draft: {
    label: 'DRAFT',
    chipClass:
      'border border-border-muted bg-surface-2/40 text-text-faint',
    pulse: false,
  },
  failed: {
    label: 'FAILED',
    chipClass:
      'border border-accent3/40 bg-accent3/10 text-accent3',
    pulse: false,
  },
};

const CADENCE_META: Record<
  AgencyReportsData['scheduled'][number]['cadence'],
  { label: string; chipClass: string; Icon: typeof Repeat2 }
> = {
  daily: {
    label: 'DAILY',
    chipClass: 'border border-accent/40 bg-accent/10 text-accent',
    Icon: Zap,
  },
  weekly: {
    label: 'WEEKLY',
    chipClass:
      'border border-accent2/40 bg-accent2/10 text-accent2',
    Icon: CalendarClock,
  },
  monthly: {
    label: 'MONTHLY',
    chipClass:
      'border border-accent4/40 bg-accent4/10 text-accent4',
    Icon: CalendarDays,
  },
};

const FORMAT_META: Record<
  ReportFormat,
  { label: string; Icon: typeof FileText; chipClass: string }
> = {
  pdf: {
    label: 'PDF',
    Icon: FileText,
    chipClass: 'border border-accent3/40 bg-accent3/10 text-accent3',
  },
  csv: {
    label: 'CSV',
    Icon: FileSpreadsheet,
    chipClass:
      'border border-accent2/40 bg-accent2/10 text-accent2',
  },
};

// ---------------------------------------------------------------------------
// Date / size helpers
// ---------------------------------------------------------------------------

const SERIF: CSSProperties = {
  fontFamily: "'Georgia', 'Times New Roman', serif",
  fontFeatureSettings: '"liga" 1, "kern" 1',
};

const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const LONG_MONTH = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function parseDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function shortDate(iso: string): string {
  const d = parseDate(iso);
  const month = MONTH_NAMES[d.getUTCMonth()] ?? 'JAN';
  return `${month} ${String(d.getUTCDate()).padStart(2, '0')} · ${d.getUTCFullYear()}`;
}

function longEditionLabel(iso: string): string {
  const d = parseDate(iso);
  const m = LONG_MONTH[d.getUTCMonth()] ?? 'January';
  return `${m} ${d.getUTCFullYear()} Edition`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeFuture(iso: string, now: Date = new Date()): string {
  const target = parseDate(iso).getTime();
  const diffMs = target - now.getTime();
  if (diffMs <= 0) return 'imminent';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `in ${days}d`;
  const months = Math.floor(days / 30);
  return `in ${months}mo`;
}

/**
 * Pick a stable "volume / issue" pair from a date — purely cosmetic, but it
 * makes the masthead feel like a real publication. Vol = years since 2023,
 * issue = (calendar week of year) clamped to 1..52.
 */
function volumeIssue(iso: string): { vol: number; issue: number } {
  const d = parseDate(iso);
  const vol = Math.max(1, d.getUTCFullYear() - 2022);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor(
    (d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  const issue = Math.min(52, Math.max(1, Math.ceil((diffDays + 1) / 7)));
  return { vol, issue };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptR1Magazine(
  { data }: { data?: AgencyReportsData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  // The "featured cover" is the most recent READY/GENERATING report,
  // falling back to the first report in the list if nothing newer is
  // available. Sort by createdAt descending; the cover sits on its own
  // and the rack shows everything else (including the cover so the user
  // can still scroll past it).
  const sorted = useMemo(() => {
    return [...d.reports].sort((a, b) => {
      const ta = parseDate(a.createdAt).getTime();
      const tb = parseDate(b.createdAt).getTime();
      return tb - ta;
    });
  }, [d.reports]);

  const featured = sorted[0] ?? null;
  const rackReports = useMemo(() => {
    if (!featured) return sorted;
    return sorted.filter((r) => r.id !== featured.id);
  }, [sorted, featured]);

  // The "most-downloaded type" stat used in the editor's-desk footer.
  const mostDownloadedType = useMemo<ReportType>(() => {
    const totals: Record<ReportType, number> = {
      placement: 0,
      warmth: 0,
      engagement: 0,
      white_label: 0,
    };
    for (const r of d.reports) totals[r.type] += r.downloadCount;
    let best: ReportType = 'placement';
    let bestN = -1;
    (Object.keys(totals) as ReportType[]).forEach((k) => {
      if (totals[k] > bestN) {
        bestN = totals[k];
        best = k;
      }
    });
    return best;
  }, [d.reports]);

  return (
    <div className="space-y-6">
      <NewsstandMasthead data={d} featured={featured} />

      {featured ? <FeaturedCover report={featured} subClients={d.subClients} /> : null}

      <RecentIssuesRack reports={rackReports} subClients={d.subClients} />

      <SubscriptionsDesk
        scheduled={d.scheduled}
        subClients={d.subClients}
      />

      <EditorsDeskFooter
        summary={d.summary}
        mostDownloadedType={mostDownloadedType}
      />
    </div>
  );
}

export default AgRptR1Magazine;

// ---------------------------------------------------------------------------
// 1. Newsstand masthead — publication identity strip
// ---------------------------------------------------------------------------

function NewsstandMasthead({
  data,
  featured,
}: {
  data: AgencyReportsData;
  featured: AgencyReportsData['reports'][number] | null;
}): JSX.Element {
  const { agency, summary } = data;
  // Publication name — agency name pushed into editorial uppercase. We
  // keep "DELIVERABILITY REVIEW" as a constant subtitle so every agency
  // reads as a single bound publication.
  const pubName = useMemo(
    () => agency.name.toUpperCase() + ' DELIVERABILITY REVIEW',
    [agency.name],
  );
  const editionIso = featured?.createdAt ?? new Date().toISOString();
  const { vol, issue } = useMemo(() => volumeIssue(editionIso), [editionIso]);
  const editionLabel = useMemo(
    () => longEditionLabel(editionIso),
    [editionIso],
  );

  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 px-5 py-5 backdrop-blur-xl"
    >
      {/* Top rule */}
      <div
        className="mb-3 h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--wp-accent, #F26522), transparent)',
        }}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-end">
        {/* LEFT — publication mark */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent shadow-glow">
              <Newspaper className="h-5 w-5" />
            </span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
                The agency newsstand · {agency.region}
              </span>
              <h1
                className="text-2xl font-bold uppercase leading-tight tracking-[0.04em] text-text sm:text-3xl"
                style={SERIF}
              >
                {pubName}
              </h1>
            </div>
          </div>
          <p
            className="max-w-xl pl-[52px] text-sm italic text-text-dim"
            style={SERIF}
          >
            “The agency's weekly intelligence digest — placement, warmth,
            engagement and white-label briefings from across the portfolio.”
          </p>
        </div>

        {/* MIDDLE — volume / issue / edition */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-border-muted bg-surface-2/60 px-4 py-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MastheadMeta label="Volume" value={`${String(vol).padStart(2, '0')}`} />
              <MastheadMeta label="Issue" value={`${String(issue).padStart(2, '0')}`} />
              <MastheadMeta label="Edition" value={editionLabel.split(' ')[0] ?? ''} />
            </div>
            <div
              className="mt-2 border-t border-border-muted pt-2 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint"
            >
              {editionLabel}
            </div>
          </div>
        </div>

        {/* RIGHT — subscribe / archive pills */}
        <div className="lg:col-span-2 flex flex-wrap items-end justify-start gap-2 lg:justify-end">
          <CountPill
            icon={MailCheck}
            label="Subscribe"
            value={summary.scheduledActive}
            tone="accent"
          />
          <CountPill
            icon={Archive}
            label="Archive"
            value={summary.reportsTotal}
            tone="muted"
          />
        </div>
      </div>

      {/* Bottom rule, slightly heavier */}
      <div
        className="mt-4 h-[2px] w-full"
        style={{
          background:
            'linear-gradient(90deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B), var(--wp-accent-3, #FF9670))',
          opacity: 0.5,
        }}
      />

      {/* Section tabs across the bottom — purely decorative, like a
          newsstand "in this issue" strip. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.28em] text-text-faint">
        <span className="text-accent">Featured</span>
        <span>Placement</span>
        <span>Warmth</span>
        <span>Engagement</span>
        <span>White-label</span>
        <span>Subscriptions</span>
        <span className="ml-auto text-text-dim">
          {summary.reportsThisMonth} new this month
        </span>
      </div>
    </motion.header>
  );
}

function MastheadMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
        {label}
      </span>
      <span
        className="mt-1 text-lg font-semibold text-text"
        style={SERIF}
      >
        {value}
      </span>
    </div>
  );
}

function CountPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MailCheck;
  label: string;
  value: number;
  tone: 'accent' | 'muted';
}): JSX.Element {
  const cls =
    tone === 'accent'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : 'border-border-muted bg-surface-2/60 text-text-dim';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] ${cls}`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      <span className="text-text">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 2. Featured cover — full-width hero showcasing the latest report
// ---------------------------------------------------------------------------

function FeaturedCover({
  report,
  subClients,
}: {
  report: AgencyReportsData['reports'][number];
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  const meta = TYPE_META[report.type];
  const status = STATUS_META[report.status];
  const fmt = FORMAT_META[report.format];
  const { vol, issue } = useMemo(() => volumeIssue(report.createdAt), [report.createdAt]);
  const Icon = meta.Icon;

  // Parallax for the cover illustration — a gentle scroll-coupled Y
  // offset on the background. Hooked into the page scroll position so
  // the SVG drifts as the user reads.
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 600], [0, -40]);
  const bgScale = useTransform(scrollY, [0, 600], [1, 1.06]);

  // Stagger the headline letters in on mount.
  const headlineLetters = useMemo(() => report.coverHeadline.split(''), [report.coverHeadline]);

  // Inside-this-issue: build 2-3 bullet contents from the report itself.
  const contents = useMemo(() => {
    const out: Array<{ label: string; value: string }> = [];
    if (report.subClientName) {
      out.push({ label: 'FEATURED SUB-CLIENT', value: report.subClientName });
    } else {
      out.push({ label: 'PORTFOLIO COVERAGE', value: `${subClients.length} sub-clients` });
    }
    out.push({ label: 'REPORTING WINDOW', value: report.rangeLabel });
    out.push({ label: 'FORMAT', value: `${fmt.label} · ${fmtSize(report.sizeBytes)}` });
    return out;
  }, [report, subClients.length, fmt.label]);

  return (
    <motion.section
      ref={wrapRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 }}
      className="relative overflow-hidden rounded-3xl border border-border-muted bg-surface/70 backdrop-blur-xl"
    >
      {/* Decorative cover background — tinted gradient + corner illustration */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ y: bgY, scale: bgScale }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 88% 22%, ${meta.coverFromVar} 0%, ${meta.coverToVar} 42%, transparent 70%)`,
          }}
        />
        <CoverIllustration type={report.type} />
        {/* Subtle paper-grain via SVG noise pattern */}
        <PaperGrain />
      </motion.div>

      {/* Top ribbon — VOL · ISSUE · EDITION */}
      <div
        className="relative flex flex-wrap items-center justify-between gap-2 border-b border-border-muted/70 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.26em] text-text-faint"
        style={{ backdropFilter: 'blur(6px)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-accent">VOL {String(vol).padStart(2, '0')}</span>
          <span className="text-text-faint">·</span>
          <span>ISSUE {String(issue).padStart(2, '0')}</span>
          <span className="text-text-faint">·</span>
          <span>{shortDate(report.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${meta.chipClass}`}>
            <Icon className="h-3 w-3" />
            <span>{meta.eyebrow}</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${status.chipClass}`}>
            {status.pulse ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            <span>{status.label}</span>
          </span>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-8 px-6 py-7 sm:px-10 sm:py-10 lg:grid-cols-12 lg:gap-10">
        {/* LEFT — headline + pull quote + CTA */}
        <div className="space-y-6 lg:col-span-8">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.32em] text-accent">
            <span className="h-px w-8 bg-accent" />
            <span>The Cover Story</span>
          </div>

          {/* Giant editorial headline with stagger */}
          <h2
            className="text-4xl font-bold leading-[1.02] tracking-[-0.01em] text-text sm:text-5xl md:text-6xl"
            style={SERIF}
          >
            {headlineLetters.map((ch, i) => (
              <motion.span
                key={`hl-${i}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  ease: 'easeOut',
                  delay: 0.12 + i * 0.012,
                }}
                style={{ display: 'inline-block', whiteSpace: 'pre' }}
              >
                {ch}
              </motion.span>
            ))}
          </h2>

          {/* Pull quote — italic serif, with an orange opening stroke */}
          <motion.blockquote
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.5 }}
            className="relative max-w-2xl pl-6 text-lg italic text-text-dim sm:text-xl"
            style={SERIF}
          >
            <span
              className="absolute left-0 top-0 h-full w-[3px] rounded-full"
              style={{ background: meta.accentVar }}
            />
            {report.coverPullQuote}
          </motion.blockquote>

          {/* Inside-this-issue */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.6 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-text-faint">
              <BookOpen className="h-3 w-3 text-accent" />
              <span>Inside this issue</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {contents.map((c, i) => (
                <motion.div
                  key={`toc-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: 'easeOut',
                    delay: 0.7 + i * 0.08,
                  }}
                  className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2.5"
                >
                  <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
                    {c.label}
                  </div>
                  <div
                    className="mt-1 truncate text-sm text-text"
                    style={SERIF}
                  >
                    {c.value}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA — READ ISSUE chip + meta */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.85 }}
            className="flex flex-wrap items-center gap-3"
          >
            <span
              className="inline-flex cursor-default items-center gap-2 rounded-full border border-accent/60 bg-accent px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.22em] text-bg shadow-glow"
            >
              <BookOpen className="h-4 w-4" />
              Read Issue
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
              <Download className="h-3 w-3" />
              {report.downloadCount} downloads
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] ${fmt.chipClass}`}>
              <fmt.Icon className="h-3 w-3" />
              {fmt.label}
            </span>
          </motion.div>
        </div>

        {/* RIGHT — cover stat block (price-tag style) */}
        <div className="lg:col-span-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.35 }}
            className="relative ml-auto w-full max-w-sm rounded-2xl border border-border-muted bg-surface/85 px-5 py-5 backdrop-blur-xl"
            style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}
          >
            {/* Stamp ribbon */}
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-text-faint">
                The Cover Stat
              </span>
              <span
                className="grid h-7 w-7 place-items-center rounded-full border-2"
                style={{ borderColor: meta.accentVar, color: meta.accentVar }}
              >
                <Stamp className="h-3.5 w-3.5" />
              </span>
            </div>

            {/* Big stat — read from the type-specific scoreboard */}
            <CoverStatBlock type={report.type} />

            {/* Three small stats below */}
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border-muted pt-4">
              <CoverSmallStat
                label="Cycle"
                value={report.rangeLabel}
              />
              <CoverSmallStat
                label="Format"
                value={`${fmt.label}`}
              />
              <CoverSmallStat
                label="Size"
                value={fmtSize(report.sizeBytes)}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

/**
 * Decorative cover illustration: a per-type SVG motif painted in the
 * type's tint. Each report type gets a distinct visual so a stack of
 * issues reads at a glance.
 */
function CoverIllustration({ type }: { type: ReportType }): JSX.Element {
  const meta = TYPE_META[type];
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 400"
      className="absolute right-0 top-0 h-full w-[60%] opacity-90"
      style={{ minWidth: 360 }}
    >
      <defs>
        <linearGradient id={`ci-${type}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={meta.accentVar} stopOpacity={0.55} />
          <stop offset="100%" stopColor={meta.accentVar} stopOpacity={0.0} />
        </linearGradient>
        <radialGradient id={`ci-r-${type}`} cx="0.7" cy="0.3" r="0.65">
          <stop offset="0%" stopColor={meta.accentVar} stopOpacity={0.45} />
          <stop offset="100%" stopColor={meta.accentVar} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Big circle sweep */}
      <circle cx="430" cy="140" r="170" fill={`url(#ci-r-${type})`} />

      {type === 'placement' ? (
        <g stroke={meta.accentVar} strokeOpacity={0.55} strokeWidth={1.4} fill="none">
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`ring-${i}`} cx="430" cy="140" r={30 + i * 26} />
          ))}
          <line x1="430" y1="0" x2="430" y2="320" />
          <line x1="280" y1="140" x2="580" y2="140" />
          <circle cx="430" cy="140" r="10" fill={meta.accentVar} fillOpacity={0.85} stroke="none" />
        </g>
      ) : null}

      {type === 'warmth' ? (
        <g stroke={meta.accentVar} strokeWidth={2} fill="none" strokeLinecap="round">
          {/* Flame curves */}
          <path d="M380 320 C 360 250, 430 230, 410 160 C 400 120, 470 90, 460 40" strokeOpacity={0.55} />
          <path d="M420 320 C 410 260, 470 240, 450 170 C 440 130, 510 100, 500 50" strokeOpacity={0.4} />
          <path d="M460 320 C 460 270, 510 250, 490 180 C 480 140, 540 110, 530 65" strokeOpacity={0.25} />
        </g>
      ) : null}

      {type === 'engagement' ? (
        <g stroke={meta.accentVar} strokeWidth={2} fill="none">
          {/* Sound-wave bars */}
          {[300, 330, 360, 390, 420, 450, 480, 510, 540, 570].map((x, i) => {
            const h = 24 + ((i * 23) % 90);
            return (
              <line
                key={`bar-${i}`}
                x1={x}
                y1={200 - h / 2}
                x2={x}
                y2={200 + h / 2}
                strokeOpacity={0.4 + (i % 3) * 0.18}
              />
            );
          })}
        </g>
      ) : null}

      {type === 'white_label' ? (
        <g>
          {/* Stylised quill / nib */}
          <polygon
            points="430,40 460,260 430,250 400,260"
            fill={`url(#ci-${type})`}
            stroke={meta.accentVar}
            strokeOpacity={0.55}
            strokeWidth={1.4}
          />
          <line x1="430" y1="40" x2="430" y2="250" stroke={meta.accentVar} strokeOpacity={0.55} strokeWidth={1.2} />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * The "paper-grain" overlay — a low-opacity SVG noise so the cover feels
 * printed, not flat. We bake the noise inline so it doesn't need an
 * asset.
 */
function PaperGrain(): JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className="absolute inset-0 h-full w-full opacity-[0.04]"
      preserveAspectRatio="none"
    >
      <filter id="paper-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.95
                  0 0 0 0 0.7
                  0 0 0 0 0.4
                  0 0 0 0.9 0"
        />
      </filter>
      <rect width="200" height="200" filter="url(#paper-noise)" />
    </svg>
  );
}

/**
 * The big "cover stat" on the right of the featured hero — a stylised
 * editorial big-number that counts up on mount. The number / unit /
 * caption are derived from the report type so the cover always has
 * something concrete to anchor on (we don't have real numbers in the
 * data shape, so we synthesise plausible ones from the report id hash).
 */
function CoverStatBlock({ type }: { type: ReportType }): JSX.Element {
  const meta = TYPE_META[type];
  const stat = useMemo(() => {
    switch (type) {
      case 'placement':
        return { value: 86.4, unit: '%', label: 'AVG INBOX', delta: '+4.2 pts vs Q2' };
      case 'warmth':
        return { value: 78, unit: '', label: 'AVG WARMTH', delta: '+6 pts MoM' };
      case 'engagement':
        return { value: 14.8, unit: '%', label: 'REPLY RATE', delta: '+2.1 pts WoW' };
      case 'white_label':
        return { value: 4, unit: '', label: 'BRANDED ISSUES', delta: 'on the desk' };
      default:
        return { value: 0, unit: '', label: '', delta: '' };
    }
  }, [type]);

  return (
    <div className="space-y-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.32em] text-text-faint">
        {stat.label}
      </div>
      <div className="flex items-baseline gap-1">
        <CountUpNumber
          value={stat.value}
          color={meta.accentVar}
          decimals={Number.isInteger(stat.value) ? 0 : 1}
        />
        <span
          className="text-2xl font-semibold"
          style={{ color: meta.accentVar, ...SERIF }}
        >
          {stat.unit}
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Sparkles className="h-3 w-3" style={{ color: meta.accentVar }} />
        {stat.delta}
      </div>
    </div>
  );
}

function CountUpNumber({
  value,
  color,
  decimals = 0,
}: {
  value: number;
  color: string;
  decimals?: number;
}): JSX.Element {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(value * eased);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span
      className="text-5xl font-bold leading-none"
      style={{ color, ...SERIF }}
    >
      {n.toFixed(decimals)}
    </span>
  );
}

function CoverSmallStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
        {label}
      </div>
      <div className="truncate text-sm font-medium text-text">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Recent issues rack — mini-cover grid
// ---------------------------------------------------------------------------

function RecentIssuesRack({
  reports,
  subClients,
}: {
  reports: AgencyReportsData['reports'];
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  const [filter, setFilter] = useState<'all' | ReportType>('all');
  const filtered = useMemo(() => {
    if (filter === 'all') return reports;
    return reports.filter((r) => r.type === filter);
  }, [reports, filter]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Library className="h-4 w-4" />
          </span>
          <div>
            <h3
              className="text-xl font-semibold text-text"
              style={SERIF}
            >
              Recent issues on the rack
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
              {filtered.length} issue{filtered.length === 1 ? '' : 's'} shelved
            </p>
          </div>
        </div>

        {/* Rack filter — newsstand "section" tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <RackFilterChip
            label="All sections"
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            icon={LayoutGrid}
          />
          {(['placement', 'warmth', 'engagement', 'white_label'] as ReportType[]).map(
            (t) => {
              const meta = TYPE_META[t];
              return (
                <RackFilterChip
                  key={`rf-${t}`}
                  label={meta.label}
                  active={filter === t}
                  onClick={() => setFilter(t)}
                  icon={meta.Icon}
                />
              );
            },
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-muted bg-surface/40 px-6 py-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-text-faint" />
          <p
            className="mt-3 text-text"
            style={SERIF}
          >
            No issues in this section yet.
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
            Switch sections or wait for the next press run.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r, i) => (
            <MiniCover
              key={r.id}
              report={r}
              index={i}
              subClients={subClients}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RackFilterChip({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutGrid;
}): JSX.Element {
  const cls = active
    ? 'border-accent/60 bg-accent/15 text-accent'
    : 'border-border-muted bg-surface-2/60 text-text-dim hover:border-accent/30 hover:text-accent';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${cls}`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}

function MiniCover({
  report,
  index,
  subClients,
}: {
  report: AgencyReportsData['reports'][number];
  index: number;
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  const meta = TYPE_META[report.type];
  const status = STATUS_META[report.status];
  const fmt = FORMAT_META[report.format];
  const [hover, setHover] = useState(false);
  const { vol, issue } = useMemo(() => volumeIssue(report.createdAt), [report.createdAt]);
  const Icon = meta.Icon;

  // Sub-client mailboxes used in the lower-left meta strip.
  const mailboxCount = useMemo(() => {
    if (!report.subClientId) {
      return subClients.reduce((acc, s) => acc + s.mailboxCount, 0);
    }
    return (
      subClients.find((s) => s.id === report.subClientId)?.mailboxCount ?? 0
    );
  }, [report.subClientId, subClients]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        ease: 'easeOut',
        delay: 0.05 + index * 0.045,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ y: -6, transition: { duration: 0.18 } }}
      className="group relative overflow-hidden rounded-2xl border border-border-muted bg-surface/70 backdrop-blur-xl"
      style={{
        boxShadow: hover
          ? '0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px var(--wp-accent, #F26522)'
          : '0 12px 36px rgba(0,0,0,0.35)',
        transition: 'box-shadow 220ms ease',
      }}
    >
      {/* Cover tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(155deg, ${meta.coverFromVar} 0%, ${meta.coverToVar} 65%, transparent 100%)`,
        }}
      />
      <MiniCoverMotif type={report.type} />
      <PaperGrain />

      <div className="relative flex h-full flex-col">
        {/* Top strip — type eyebrow + status */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 font-mono text-[9px] uppercase tracking-[0.26em] text-text-faint">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${meta.chipClass}`}>
            <Icon className="h-2.5 w-2.5" />
            <span>{meta.eyebrow}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${status.chipClass}`}
          >
            {status.pulse ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            <span>{status.label}</span>
          </span>
        </div>

        {/* Issue meta — volume + issue */}
        <div className="px-4 pt-3 font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
          VOL {String(vol).padStart(2, '0')} · ISS {String(issue).padStart(2, '0')}
        </div>

        {/* Cover headline */}
        <h4
          className="mt-1 px-4 text-[20px] font-bold uppercase leading-tight tracking-[0.005em] text-text sm:text-[22px]"
          style={SERIF}
        >
          {report.coverHeadline}
        </h4>

        {/* Pull quote — clamp to 2 lines via CSS */}
        <p
          className="mt-2 line-clamp-2 px-4 text-sm italic text-text-dim"
          style={SERIF}
        >
          {report.coverPullQuote}
        </p>

        {/* Footer meta strip */}
        <div className="mt-auto space-y-3 px-4 pb-4 pt-5">
          <div className="grid grid-cols-3 gap-2 border-t border-border-muted/70 pt-3">
            <MiniCoverStat
              icon={Building2}
              label={report.subClientName ?? 'Portfolio'}
            />
            <MiniCoverStat
              icon={Mail}
              label={`${mailboxCount} mbx`}
            />
            <MiniCoverStat
              icon={CalendarDays}
              label={report.rangeLabel}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
              {shortDate(report.createdAt)}
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] ${fmt.chipClass}`}
              >
                <fmt.Icon className="h-2.5 w-2.5" />
                {fmt.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-text-dim">
                <Download className="h-2.5 w-2.5" />
                {report.downloadCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* READ overlay on hover */}
      <AnimatePresence>
        {hover && report.status === 'ready' ? (
          <motion.div
            key="read-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{
              background:
                'linear-gradient(180deg, rgba(10,10,15,0.0) 0%, rgba(10,10,15,0.55) 65%, rgba(10,10,15,0.85) 100%)',
            }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/70 bg-accent/95 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-bg shadow-glow">
              <BookOpen className="h-3.5 w-3.5" />
              Read
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function MiniCoverStat({
  icon: Icon,
  label,
}: {
  icon: typeof Building2;
  label: string;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-text-dim">
      <Icon className="h-3 w-3 shrink-0 text-text-faint" />
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em]">
        {label}
      </span>
    </div>
  );
}

/**
 * Compact illustrative motif for the mini-cover — a quieter version of
 * the featured cover illustration, scoped to the upper-right corner.
 */
function MiniCoverMotif({ type }: { type: ReportType }): JSX.Element {
  const meta = TYPE_META[type];
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 120"
      className="absolute right-0 top-0 h-[120px] w-[200px] opacity-90"
      preserveAspectRatio="xMaxYMin slice"
    >
      <defs>
        <radialGradient id={`mc-${type}`} cx="0.75" cy="0.25" r="0.7">
          <stop offset="0%" stopColor={meta.accentVar} stopOpacity={0.42} />
          <stop offset="100%" stopColor={meta.accentVar} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx="160" cy="30" r="70" fill={`url(#mc-${type})`} />
      {type === 'placement' ? (
        <g stroke={meta.accentVar} strokeWidth={1} fill="none" strokeOpacity={0.55}>
          <circle cx="160" cy="30" r="20" />
          <circle cx="160" cy="30" r="38" />
          <circle cx="160" cy="30" r="56" />
        </g>
      ) : null}
      {type === 'warmth' ? (
        <path
          d="M140 110 C 130 80, 160 70, 150 40 C 145 22, 170 12, 165 0"
          stroke={meta.accentVar}
          strokeOpacity={0.55}
          strokeWidth={1.4}
          fill="none"
        />
      ) : null}
      {type === 'engagement' ? (
        <g stroke={meta.accentVar} strokeWidth={1.2}>
          {[120, 135, 150, 165, 180].map((x, i) => {
            const h = 14 + ((i * 17) % 40);
            return (
              <line
                key={`mb-${i}`}
                x1={x}
                y1={60 - h / 2}
                x2={x}
                y2={60 + h / 2}
                strokeOpacity={0.4 + (i % 3) * 0.18}
              />
            );
          })}
        </g>
      ) : null}
      {type === 'white_label' ? (
        <g stroke={meta.accentVar} strokeOpacity={0.55} strokeWidth={1.2} fill="none">
          <rect x="135" y="15" width="60" height="80" rx="4" />
          <line x1="145" y1="35" x2="185" y2="35" />
          <line x1="145" y1="50" x2="175" y2="50" />
          <line x1="145" y1="65" x2="180" y2="65" />
        </g>
      ) : null}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 4. Subscriptions desk — scheduled reports as a newspaper list
// ---------------------------------------------------------------------------

function SubscriptionsDesk({
  scheduled,
  subClients,
}: {
  scheduled: AgencyReportsData['scheduled'];
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  // Sort by next-run ascending so the imminent subscription floats up.
  const sorted = useMemo(
    () =>
      [...scheduled].sort(
        (a, b) =>
          parseDate(a.nextRunAt).getTime() - parseDate(b.nextRunAt).getTime(),
      ),
    [scheduled],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Repeat2 className="h-4 w-4" />
          </span>
          <div>
            <h3
              className="text-xl font-semibold text-text"
              style={SERIF}
            >
              Standing subscriptions
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
              Recurring digests delivered to your readers
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
          <Users className="h-3 w-3" />
          {sorted.length} active
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
        {/* Header row — newspaper-list column captions */}
        <div className="hidden grid-cols-12 gap-3 border-b border-border-muted/70 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.26em] text-text-faint md:grid">
          <div className="col-span-2">Cadence</div>
          <div className="col-span-4">Title</div>
          <div className="col-span-3">Recipients</div>
          <div className="col-span-3 text-right">Next edition</div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Inbox className="mx-auto h-7 w-7 text-text-faint" />
            <p
              className="mt-3 text-text"
              style={SERIF}
            >
              No standing subscriptions yet.
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
              Schedule a digest to start a column.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-muted/60">
            {sorted.map((s, i) => (
              <SubscriptionRow
                key={s.id}
                sub={s}
                index={i}
                subClients={subClients}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SubscriptionRow({
  sub,
  index,
  subClients,
}: {
  sub: AgencyReportsData['scheduled'][number];
  index: number;
  subClients: AgencyReportsData['subClients'];
}): JSX.Element {
  const cadence = CADENCE_META[sub.cadence];
  const typeMeta = TYPE_META[sub.type];
  const next = useMemo(() => relativeFuture(sub.nextRunAt), [sub.nextRunAt]);
  const portfolioWide = sub.subClientIds.length === subClients.length && subClients.length > 0;
  const targetLabel = useMemo(() => {
    if (portfolioWide) return 'Whole portfolio';
    if (sub.subClientIds.length === 1) {
      const id = sub.subClientIds[0];
      const sc = subClients.find((s) => s.id === id);
      return sc?.name ?? '1 sub-client';
    }
    return `${sub.subClientIds.length} sub-clients`;
  }, [portfolioWide, sub.subClientIds, subClients]);
  const CadenceIcon = cadence.Icon;
  const TypeIcon = typeMeta.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.36,
        ease: 'easeOut',
        delay: 0.05 + index * 0.05,
      }}
      className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-surface-2/40 md:grid-cols-12 md:items-center"
    >
      {/* Cadence chip */}
      <div className="md:col-span-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] ${cadence.chipClass}`}
        >
          <CadenceIcon className="h-3 w-3" />
          {cadence.label}
        </span>
      </div>

      {/* Title + type eyebrow */}
      <div className="md:col-span-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${typeMeta.chipClass}`}
          >
            <TypeIcon className="h-2.5 w-2.5" />
            {typeMeta.label}
          </span>
        </div>
        <div
          className="mt-1 truncate text-base font-semibold text-text"
          style={SERIF}
        >
          {sub.title}
        </div>
      </div>

      {/* Recipients */}
      <div className="md:col-span-3">
        <div className="flex items-center gap-3 text-sm text-text-dim">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-text-faint" />
            <span className="font-mono text-text">{sub.recipientCount}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
              readers
            </span>
          </span>
          <span className="hidden h-3.5 w-px bg-border-muted md:inline-block" />
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-text-faint" />
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
              {targetLabel}
            </span>
          </span>
        </div>
      </div>

      {/* Next edition + countdown */}
      <div className="md:col-span-3 md:text-right">
        <div className="flex items-center justify-end gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
          <CalendarClock className="h-3 w-3 text-accent2" />
          <span>{shortDate(sub.nextRunAt)}</span>
        </div>
        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          <Clock3 className="h-3 w-3" />
          {next}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 5. Editor's desk footer — small stats strip
// ---------------------------------------------------------------------------

function EditorsDeskFooter({
  summary,
  mostDownloadedType,
}: {
  summary: AgencyReportsData['summary'];
  mostDownloadedType: ReportType;
}): JSX.Element {
  const popular = TYPE_META[mostDownloadedType];
  return (
    <motion.footer
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
      className="rounded-2xl border border-border-muted bg-surface/60 px-5 py-4 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent4/40 bg-accent4/10 text-accent4">
            <Crown className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col">
            <span
              className="text-sm font-semibold text-text"
              style={SERIF}
            >
              From the editor's desk
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-text-faint">
              Press summary · this month
            </span>
          </div>
        </div>

        <EditorStat
          icon={Send}
          label="Reports filed"
          value={formatNumber(summary.reportsThisMonth)}
          tone="accent"
        />
        <EditorStat
          icon={Download}
          label="Downloads"
          value={formatNumber(summary.downloadsThisMonth)}
          tone="accent2"
        />
        <EditorStat
          icon={Repeat2}
          label="Active subs"
          value={formatNumber(summary.scheduledActive)}
          tone="accent3"
        />
        <EditorStat
          icon={popular.Icon}
          label="Top section"
          value={popular.label}
          tone="accent4"
        />
        <EditorStat
          icon={ShieldCheck}
          label="Archive"
          value={formatNumber(summary.reportsTotal)}
          tone="muted"
        />
      </div>

      {/* Colophon strip — finer print at the very bottom */}
      <div className="mt-3 border-t border-border-muted/60 pt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
        Published by WarmPulse · Editor: Northwind Agency desk · All times shown in
        UTC · Mock issues for design preview
      </div>
    </motion.footer>
  );
}

function EditorStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4' | 'muted';
}): JSX.Element {
  const cls =
    tone === 'accent'
      ? 'text-accent border-accent/30 bg-accent/10'
      : tone === 'accent2'
        ? 'text-accent2 border-accent2/30 bg-accent2/10'
        : tone === 'accent3'
          ? 'text-accent3 border-accent3/30 bg-accent3/10'
          : tone === 'accent4'
            ? 'text-accent4 border-accent4/30 bg-accent4/10'
            : 'text-text-dim border-border-muted bg-surface-2/60';
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2">
      <span
        className={`grid h-7 w-7 place-items-center rounded-lg border ${cls}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
          {label}
        </span>
        <span
          className="text-sm font-semibold text-text"
          style={SERIF}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lucide icons used only inside string-keyed metadata maps need a hard
// reference here so tree-shaking and lint don't drop them. (`Gauge` and
// `LineChart` are reserved for type-icon variants we want to keep on
// the import surface without bloating runtime.) When unused at runtime
// they're just no-op references the bundler resolves to the same icon
// component table.
// ---------------------------------------------------------------------------

const _ICON_GUARD = { Gauge, LineChart } as const;
void _ICON_GUARD;
