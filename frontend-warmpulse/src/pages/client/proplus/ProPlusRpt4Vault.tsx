import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  BarChart3,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  HardDrive,
  Hourglass,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';

/**
 * ProPlusRpt4Vault — "Report Archive Vault" Pro-Plus-tier section design.
 *
 * Reports reframed as a CHRONOLOGICAL ARCHIVE VAULT — every generated /
 * scheduled report is a dated record hanging off a vertical time spine,
 * grouped by month milestone nodes, newest → oldest. This is deliberately
 * NOT a config+preview split (ProPlusReports), NOT a magazine/publication
 * (Rpt1Magazine), NOT a block-drag canvas (Rpt2Canvas), NOT a
 * subscription/digest manager (Rpt3Subscription).
 *
 *   ┌── header band: title + Pro Plus + retention chip ──────────────────┐
 *   ┌── filter bar: type · format · status · search · range ─────────────┐
 *   ┌── 12-col grid ─────────────────────────────────────────────────────┐
 *   │  ┌── time spine (col-span-8) ──────────────────┐ ┌ right rail ───┐ │
 *   │  │  ┃ MAY 2026  ── milestone node              │ │ vault stats   │ │
 *   │  │  ┃   ├ entry · type · title · date · badges  │ │ total / month │ │
 *   │  │  ┃   │   └ expand → inline detail + chart    │ │ storage bar   │ │
 *   │  │  ┃   ├ entry …                               │ │ retention     │ │
 *   │  │  ┃ APR 2026  ── milestone node               │ │ ┌ archive ──┐ │ │
 *   │  │  ┃   ├ entry …                               │ │ │ new entry │ │ │
 *   │  └──────────────────────────────────────────────┘ └───────────────┘ │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * STANDALONE: prop-less, inline MOCK only — no network / router / query
 * hooks. The harness supplies the shell + sidebar; this renders page
 * content only. Explicit heights; the spine scrolls internally.
 *
 * Real state:
 *  - Filters (useState) genuinely narrow the timeline via useMemo: type /
 *    format / status selects + a free-text search over title+range +
 *    a relative date-range window. Month groups with no surviving entries
 *    drop out entirely.
 *  - Expand (useState id) toggles an inline detail panel per entry —
 *    AnimatePresence animates the height, a recharts area mini-chart of
 *    real figures renders in a fixed-height parent.
 *  - "Archive new report" inserts a freshly-dated 'generating' entry at the
 *    top of the spine (layout animation re-flows the spine), then a short
 *    timeout flips it to 'ready'.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportType = 'warmth' | 'engagement' | 'placement' | 'deliverability';
type ReportFormat = 'pdf' | 'csv';
type ReportStatus = 'ready' | 'generating' | 'expired';

interface DetailPayload {
  /** Headline figure shown big in the expanded mini-cover. */
  hero: string;
  heroLabel: string;
  /** Compact key/value figures. */
  figures: { label: string; value: string }[];
  /** 8-point trend for the recharts area mini-chart. */
  trend: { d: string; v: number }[];
}

interface VaultEntry {
  id: string;
  type: ReportType;
  title: string;
  /** ISO-ish timestamp string; the standalone harness renders deterministically. */
  generatedAt: string;
  /** Human range covered by the report. */
  range: string;
  mailboxes: number;
  format: ReportFormat;
  sizeKB: number;
  status: ReportStatus;
  detail: DetailPayload;
}

interface MockMailbox {
  id: string;
  email: string;
}

type TypeFilter = 'all' | ReportType;
type FormatFilter = 'all' | ReportFormat;
type StatusFilter = 'all' | ReportStatus;
type RangeFilter = 'all' | '30d' | '90d' | '180d';

// ---------------------------------------------------------------------------
// Static meta
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  ReportType,
  { label: string; Icon: LucideIcon; tint: string; chip: string }
> = {
  warmth: {
    label: 'Warmth',
    Icon: Sparkles,
    tint: 'text-accent',
    chip: 'border-accent/30 bg-accent/10 text-accent',
  },
  engagement: {
    label: 'Opens & replies',
    Icon: BarChart3,
    tint: 'text-accent2',
    chip: 'border-accent2/30 bg-accent2/10 text-accent2',
  },
  placement: {
    label: 'Where emails land',
    Icon: Target,
    tint: 'text-accent4',
    chip: 'border-accent4/30 bg-accent4/10 text-accent4',
  },
  deliverability: {
    label: 'Inbox delivery',
    Icon: ShieldCheck,
    tint: 'text-accent2',
    chip: 'border-accent2/30 bg-accent2/10 text-accent2',
  },
};

const STATUS_META: Record<
  ReportStatus,
  { label: string; dot: string; chip: string; Icon: LucideIcon }
> = {
  ready: {
    label: 'Ready',
    dot: 'bg-accent',
    chip: 'border-accent/30 bg-accent/10 text-accent',
    Icon: Check,
  },
  generating: {
    label: 'Generating',
    dot: 'bg-accent4',
    chip: 'border-accent4/30 bg-accent4/10 text-accent4',
    Icon: Loader2,
  },
  expired: {
    label: 'Expired',
    dot: 'bg-accent3',
    chip: 'border-accent3/30 bg-accent3/10 text-accent3',
    Icon: Hourglass,
  },
};

const FORMAT_META: Record<ReportFormat, { label: string; Icon: LucideIcon }> = {
  pdf: { label: 'PDF', Icon: FileText },
  csv: { label: 'CSV', Icon: FileSpreadsheet },
};

// Fixed "now" so the standalone harness renders deterministically.
const NOW = new Date('2026-05-18T09:30:00');

// ---------------------------------------------------------------------------
// Mock data — 17 archived reports spanning ~4 months, fully inline
// ---------------------------------------------------------------------------

const MOCK_MAILBOXES: MockMailbox[] = [
  { id: 'mb-1', email: 'founder@acme.io' },
  { id: 'mb-2', email: 'sales@acme.io' },
  { id: 'mb-3', email: 'success@acme.io' },
  { id: 'mb-4', email: 'hello@acme.co' },
  { id: 'mb-5', email: 'team@acme.co' },
  { id: 'mb-6', email: 'ar@acme.co' },
  { id: 'mb-7', email: 'ap@acme.co' },
  { id: 'mb-8', email: 'ops@acme.io' },
  { id: 'mb-9', email: 'growth@acme.io' },
  { id: 'mb-10', email: 'partners@acme.io' },
  { id: 'mb-11', email: 'demos@acme.co' },
  { id: 'mb-12', email: 'invoices@acme.co' },
  { id: 'mb-13', email: 'careers@acme.io' },
  { id: 'mb-14', email: 'press@acme.io' },
  { id: 'mb-15', email: 'security@acme.io' },
];

function trend(seed: number[]): { d: string; v: number }[] {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
  return seed.map((v, i) => ({ d: labels[i] ?? `W${i + 1}`, v }));
}

const MOCK_ENTRIES: VaultEntry[] = [
  {
    id: 'rp-17',
    type: 'warmth',
    title: 'Warmth build-up · fleet summary',
    generatedAt: '2026-05-16T07:02:00',
    range: 'Apr 17 → May 16',
    mailboxes: 15,
    format: 'pdf',
    sizeKB: 286,
    status: 'ready',
    detail: {
      hero: '83',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '4,128' },
        { label: 'Opened', value: '72%' },
        { label: 'Replied', value: '26%' },
        { label: 'Inbox', value: '94%' },
      ],
      trend: trend([58, 61, 64, 68, 72, 76, 79, 83]),
    },
  },
  {
    id: 'rp-16',
    type: 'engagement',
    title: 'Opens & replies breakdown · sales pod',
    generatedAt: '2026-05-14T16:41:00',
    range: 'May 07 → May 14',
    mailboxes: 6,
    format: 'csv',
    sizeKB: 47,
    status: 'ready',
    detail: {
      hero: '71%',
      heroLabel: 'open rate',
      figures: [
        { label: 'Sent', value: '892' },
        { label: 'Opened', value: '71%' },
        { label: 'Replied', value: '29%' },
        { label: 'Starred', value: '18%' },
      ],
      trend: trend([54, 57, 55, 60, 62, 66, 69, 71]),
    },
  },
  {
    id: 'rp-15',
    type: 'placement',
    title: 'Where emails land audit',
    generatedAt: '2026-05-11T08:15:00',
    range: 'Apr 11 → May 11',
    mailboxes: 15,
    format: 'pdf',
    sizeKB: 331,
    status: 'ready',
    detail: {
      hero: '93%',
      heroLabel: 'inbox delivery',
      figures: [
        { label: 'Inbox', value: '93%' },
        { label: 'Promotions', value: '5%' },
        { label: 'Spam', value: '2%' },
        { label: 'Rescued', value: '41' },
      ],
      trend: trend([84, 86, 85, 88, 90, 91, 92, 93]),
    },
  },
  {
    id: 'rp-14',
    type: 'deliverability',
    title: 'Inbox-delivery health · weekly',
    generatedAt: '2026-05-09T07:00:00',
    range: 'May 02 → May 09',
    mailboxes: 15,
    format: 'pdf',
    sizeKB: 254,
    status: 'ready',
    detail: {
      hero: '0.4%',
      heroLabel: 'failure rate',
      figures: [
        { label: 'Delivered', value: '99.6%' },
        { label: 'Failed', value: '0.4%' },
        { label: 'SPF/DKIM', value: 'pass' },
        { label: 'Block list', value: 'clear' },
      ],
      trend: trend([2.1, 1.6, 1.2, 0.9, 0.7, 0.6, 0.5, 0.4]),
    },
  },
  {
    id: 'rp-13',
    type: 'warmth',
    title: 'Warmth build-up · weekly digest',
    generatedAt: '2026-05-05T07:01:00',
    range: 'Apr 28 → May 05',
    mailboxes: 15,
    format: 'csv',
    sizeKB: 58,
    status: 'ready',
    detail: {
      hero: '78',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '988' },
        { label: 'Opened', value: '69%' },
        { label: 'Replied', value: '24%' },
        { label: 'Inbox', value: '92%' },
      ],
      trend: trend([62, 64, 66, 69, 71, 74, 76, 78]),
    },
  },
  {
    id: 'rp-12',
    type: 'engagement',
    title: 'Opens & replies breakdown · fleet',
    generatedAt: '2026-05-02T09:22:00',
    range: 'Apr 02 → May 02',
    mailboxes: 15,
    format: 'pdf',
    sizeKB: 312,
    status: 'ready',
    detail: {
      hero: '68%',
      heroLabel: 'open rate',
      figures: [
        { label: 'Sent', value: '4,012' },
        { label: 'Opened', value: '68%' },
        { label: 'Replied', value: '23%' },
        { label: 'Starred', value: '15%' },
      ],
      trend: trend([55, 58, 60, 62, 63, 65, 67, 68]),
    },
  },
  {
    id: 'rp-11',
    type: 'placement',
    title: 'Where emails land · sales pod',
    generatedAt: '2026-04-27T08:40:00',
    range: 'Apr 20 → Apr 27',
    mailboxes: 6,
    format: 'csv',
    sizeKB: 39,
    status: 'expired',
    detail: {
      hero: '90%',
      heroLabel: 'inbox delivery',
      figures: [
        { label: 'Inbox', value: '90%' },
        { label: 'Promotions', value: '7%' },
        { label: 'Spam', value: '3%' },
        { label: 'Rescued', value: '22' },
      ],
      trend: trend([82, 83, 84, 86, 87, 88, 89, 90]),
    },
  },
  {
    id: 'rp-10',
    type: 'warmth',
    title: 'Warmth build-up · fleet summary',
    generatedAt: '2026-04-22T07:03:00',
    range: 'Mar 22 → Apr 22',
    mailboxes: 14,
    format: 'pdf',
    sizeKB: 271,
    status: 'expired',
    detail: {
      hero: '74',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '3,640' },
        { label: 'Opened', value: '66%' },
        { label: 'Replied', value: '21%' },
        { label: 'Inbox', value: '90%' },
      ],
      trend: trend([54, 57, 60, 63, 66, 69, 72, 74]),
    },
  },
  {
    id: 'rp-9',
    type: 'deliverability',
    title: 'Inbox-delivery health · weekly',
    generatedAt: '2026-04-18T07:00:00',
    range: 'Apr 11 → Apr 18',
    mailboxes: 14,
    format: 'pdf',
    sizeKB: 248,
    status: 'expired',
    detail: {
      hero: '0.6%',
      heroLabel: 'failure rate',
      figures: [
        { label: 'Delivered', value: '99.4%' },
        { label: 'Failed', value: '0.6%' },
        { label: 'SPF/DKIM', value: 'pass' },
        { label: 'Block list', value: 'clear' },
      ],
      trend: trend([2.4, 2.0, 1.7, 1.3, 1.0, 0.8, 0.7, 0.6]),
    },
  },
  {
    id: 'rp-8',
    type: 'engagement',
    title: 'Opens & replies breakdown · weekly',
    generatedAt: '2026-04-14T16:10:00',
    range: 'Apr 07 → Apr 14',
    mailboxes: 14,
    format: 'csv',
    sizeKB: 44,
    status: 'expired',
    detail: {
      hero: '64%',
      heroLabel: 'open rate',
      figures: [
        { label: 'Sent', value: '902' },
        { label: 'Opened', value: '64%' },
        { label: 'Replied', value: '20%' },
        { label: 'Starred', value: '13%' },
      ],
      trend: trend([52, 54, 56, 58, 59, 61, 63, 64]),
    },
  },
  {
    id: 'rp-7',
    type: 'warmth',
    title: 'Warmth build-up · weekly digest',
    generatedAt: '2026-04-07T07:02:00',
    range: 'Mar 31 → Apr 07',
    mailboxes: 14,
    format: 'csv',
    sizeKB: 55,
    status: 'expired',
    detail: {
      hero: '70',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '946' },
        { label: 'Opened', value: '63%' },
        { label: 'Replied', value: '19%' },
        { label: 'Inbox', value: '89%' },
      ],
      trend: trend([54, 56, 59, 61, 64, 66, 68, 70]),
    },
  },
  {
    id: 'rp-6',
    type: 'placement',
    title: 'Where emails land audit',
    generatedAt: '2026-03-30T08:25:00',
    range: 'Feb 28 → Mar 30',
    mailboxes: 12,
    format: 'pdf',
    sizeKB: 298,
    status: 'expired',
    detail: {
      hero: '87%',
      heroLabel: 'inbox delivery',
      figures: [
        { label: 'Inbox', value: '87%' },
        { label: 'Promotions', value: '9%' },
        { label: 'Spam', value: '4%' },
        { label: 'Rescued', value: '31' },
      ],
      trend: trend([78, 80, 81, 82, 84, 85, 86, 87]),
    },
  },
  {
    id: 'rp-5',
    type: 'deliverability',
    title: 'Inbox-delivery health · monthly',
    generatedAt: '2026-03-24T07:00:00',
    range: 'Feb 24 → Mar 24',
    mailboxes: 12,
    format: 'pdf',
    sizeKB: 236,
    status: 'expired',
    detail: {
      hero: '0.9%',
      heroLabel: 'failure rate',
      figures: [
        { label: 'Delivered', value: '99.1%' },
        { label: 'Failed', value: '0.9%' },
        { label: 'SPF/DKIM', value: 'pass' },
        { label: 'Block list', value: 'clear' },
      ],
      trend: trend([3.0, 2.6, 2.2, 1.8, 1.5, 1.2, 1.0, 0.9]),
    },
  },
  {
    id: 'rp-4',
    type: 'warmth',
    title: 'Warmth build-up · fleet summary',
    generatedAt: '2026-03-18T07:04:00',
    range: 'Feb 18 → Mar 18',
    mailboxes: 11,
    format: 'pdf',
    sizeKB: 263,
    status: 'expired',
    detail: {
      hero: '66',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '2,860' },
        { label: 'Opened', value: '61%' },
        { label: 'Replied', value: '17%' },
        { label: 'Inbox', value: '86%' },
      ],
      trend: trend([48, 51, 54, 57, 59, 62, 64, 66]),
    },
  },
  {
    id: 'rp-3',
    type: 'engagement',
    title: 'Opens & replies breakdown · fleet',
    generatedAt: '2026-03-10T15:50:00',
    range: 'Feb 08 → Mar 10',
    mailboxes: 11,
    format: 'csv',
    sizeKB: 42,
    status: 'expired',
    detail: {
      hero: '60%',
      heroLabel: 'open rate',
      figures: [
        { label: 'Sent', value: '2,540' },
        { label: 'Opened', value: '60%' },
        { label: 'Replied', value: '16%' },
        { label: 'Starred', value: '11%' },
      ],
      trend: trend([49, 51, 53, 54, 56, 57, 59, 60]),
    },
  },
  {
    id: 'rp-2',
    type: 'placement',
    title: 'Where emails land · onboarding cohort',
    generatedAt: '2026-02-28T09:05:00',
    range: 'Feb 21 → Feb 28',
    mailboxes: 8,
    format: 'pdf',
    sizeKB: 281,
    status: 'expired',
    detail: {
      hero: '84%',
      heroLabel: 'inbox delivery',
      figures: [
        { label: 'Inbox', value: '84%' },
        { label: 'Promotions', value: '11%' },
        { label: 'Spam', value: '5%' },
        { label: 'Rescued', value: '19' },
      ],
      trend: trend([74, 76, 78, 79, 81, 82, 83, 84]),
    },
  },
  {
    id: 'rp-1',
    type: 'warmth',
    title: 'Warmth build-up · first archive',
    generatedAt: '2026-02-20T07:00:00',
    range: 'Feb 13 → Feb 20',
    mailboxes: 8,
    format: 'csv',
    sizeKB: 51,
    status: 'expired',
    detail: {
      hero: '59',
      heroLabel: 'avg warmth score',
      figures: [
        { label: 'Sent', value: '624' },
        { label: 'Opened', value: '57%' },
        { label: 'Replied', value: '14%' },
        { label: 'Inbox', value: '83%' },
      ],
      trend: trend([42, 45, 47, 50, 52, 54, 57, 59]),
    },
  },
];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'warmth', label: 'Warmth' },
  { value: 'engagement', label: 'Opens & replies' },
  { value: 'placement', label: 'Where emails land' },
  { value: 'deliverability', label: 'Inbox delivery' },
];

const FORMAT_FILTERS: { value: FormatFilter; label: string }[] = [
  { value: 'all', label: 'All formats' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'ready', label: 'Ready' },
  { value: 'generating', label: 'Generating' },
  { value: 'expired', label: 'Expired' },
];

const RANGE_FILTERS: { value: RangeFilter; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '180d', label: 'Last 180 days' },
];

const RANGE_DAYS: Record<Exclude<RangeFilter, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '180d': 180,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const mi = Number(m) - 1;
  return `${(MONTHS[mi] ?? '').toUpperCase()} ${y}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mon = MONTHS[d.getMonth()] ?? '';
  return `${mon} ${d.getDate()}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = NOW.getTime() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) {
    const hours = Math.max(1, Math.floor(ms / 3_600_000));
    return `${hours}h ago`;
  }
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fmtSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRpt4Vault(): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>(MOCK_ENTRIES);
  const [typeF, setTypeF] = useState<TypeFilter>('all');
  const [formatF, setFormatF] = useState<FormatFilter>('all');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [rangeF, setRangeF] = useState<RangeFilter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>('rp-17');
  const [archiving, setArchiving] = useState(false);
  const [nextSeq, setNextSeq] = useState(100);

  // --- Real filtering ------------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff =
      rangeF === 'all'
        ? null
        : NOW.getTime() - RANGE_DAYS[rangeF] * 86_400_000;
    return entries.filter((e) => {
      if (typeF !== 'all' && e.type !== typeF) return false;
      if (formatF !== 'all' && e.format !== formatF) return false;
      if (statusF !== 'all' && e.status !== statusF) return false;
      if (cutoff !== null && new Date(e.generatedAt).getTime() < cutoff)
        return false;
      if (q) {
        const hay = `${e.title} ${e.range} ${TYPE_META[e.type].label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, typeF, formatF, statusF, rangeF, query]);

  // --- Group surviving entries by month, newest → oldest -------------------
  const groups = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
    const map = new Map<string, VaultEntry[]>();
    for (const e of sorted) {
      const k = monthKey(e.generatedAt);
      const bucket = map.get(k);
      if (bucket) bucket.push(e);
      else map.set(k, [e]);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [filtered]);

  // --- Vault stats (always over the full archive, not the filtered view) ---
  const stats = useMemo(() => {
    const total = entries.length;
    const thisMonthKey = monthKey(NOW.toISOString());
    const thisMonth = entries.filter(
      (e) => monthKey(e.generatedAt) === thisMonthKey,
    ).length;
    const storageKB = entries.reduce((s, e) => s + e.sizeKB, 0);
    const ready = entries.filter((e) => e.status === 'ready').length;
    const expired = entries.filter((e) => e.status === 'expired').length;
    // 4 GB retention envelope for the Pro Plus archive.
    const quotaKB = 4 * 1024 * 1024;
    const pct = Math.min(100, Math.round((storageKB / quotaKB) * 1000) / 10);
    return { total, thisMonth, storageKB, ready, expired, pct };
  }, [entries]);

  const filtersActive =
    typeF !== 'all' ||
    formatF !== 'all' ||
    statusF !== 'all' ||
    rangeF !== 'all' ||
    query.trim() !== '';

  const resetFilters = () => {
    setTypeF('all');
    setFormatF('all');
    setStatusF('all');
    setRangeF('all');
    setQuery('');
  };

  // --- Archive a new report → inserts a dated entry at the top -------------
  const archiveNew = () => {
    if (archiving) return;
    setArchiving(true);
    const seq = nextSeq;
    setNextSeq((n) => n + 1);
    const id = `rp-new-${seq}`;
    const newEntry: VaultEntry = {
      id,
      type: 'warmth',
      title: 'Warmth build-up · on-demand archive',
      generatedAt: NOW.toISOString(),
      range: 'Apr 18 → May 18',
      mailboxes: 15,
      format: 'pdf',
      sizeKB: 290,
      status: 'generating',
      detail: {
        hero: '84',
        heroLabel: 'avg warmth score',
        figures: [
          { label: 'Sent', value: '4,210' },
          { label: 'Opened', value: '73%' },
          { label: 'Replied', value: '27%' },
          { label: 'Inbox', value: '95%' },
        ],
        trend: trend([59, 62, 65, 69, 73, 77, 80, 84]),
      },
    };
    setEntries((prev) => [newEntry, ...prev]);
    setExpandedId(id);
    // Flip generating → ready after a short beat.
    window.setTimeout(() => {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: 'ready' as ReportStatus } : e,
        ),
      );
      setArchiving(false);
    }, 1600);
  };

  return (
    <div className="space-y-5">
      {/* ---- Header band ---- */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Report archive vault
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Every report you have generated, on a chronological time spine.
            Filter the vault, expand an entry to inspect its figures, or
            archive a fresh one to the top.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          <span className="font-medium text-text">90-day retention</span>
          <span className="text-border-muted">·</span>
          <span>auto-expire after</span>
        </div>
      </motion.header>

      {/* ---- Filter bar ---- */}
      <motion.div
        {...fade(0.05)}
        className="rounded-xl border border-border-muted bg-surface/60 p-3 backdrop-blur-xl"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
            <Filter className="h-3.5 w-3.5" />
            Filter vault
          </span>

          {/* Search */}
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or range…"
              className="w-full rounded-lg border border-border-muted bg-surface-2/60 py-2 pl-8 pr-3 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
            />
          </div>

          <FilterSelect
            value={typeF}
            options={TYPE_FILTERS}
            onChange={(v) => setTypeF(v as TypeFilter)}
          />
          <FilterSelect
            value={formatF}
            options={FORMAT_FILTERS}
            onChange={(v) => setFormatF(v as FormatFilter)}
          />
          <FilterSelect
            value={statusF}
            options={STATUS_FILTERS}
            onChange={(v) => setStatusF(v as StatusFilter)}
          />
          <FilterSelect
            value={rangeF}
            options={RANGE_FILTERS}
            onChange={(v) => setRangeF(v as RangeFilter)}
          />

          <AnimatePresence>
            {filtersActive ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-2 text-xs font-medium text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ---- Vault grid: time spine + right rail ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ---- Time spine ---- */}
        <motion.section {...fade(0.1)} className="lg:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
            <header className="flex items-center justify-between border-b border-border-muted px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <Archive className="h-4 w-4 text-accent" />
                Archive timeline
              </span>
              <span className="font-mono text-xs text-text-dim">
                {filtered.length} of {entries.length} records
              </span>
            </header>

            <div className="relative h-[640px] overflow-y-auto px-5 py-5">
              {groups.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-muted bg-surface-2/60 text-text-dim">
                    <Search className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium text-text">
                    No records match these filters
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="relative pl-8">
                  {/* The vertical spine line */}
                  <motion.span
                    aria-hidden
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute bottom-2 left-[11px] top-2 w-px origin-top bg-gradient-to-b from-accent/50 via-border-muted to-transparent"
                  />

                  <div className="space-y-7">
                    <AnimatePresence initial={false}>
                      {groups.map((g, gi) => (
                        <motion.div
                          key={g.key}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-3"
                        >
                          {/* Month milestone node */}
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.35, delay: gi * 0.04 }}
                            className="relative flex items-center gap-3"
                          >
                            <span className="absolute -left-8 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-accent/40 bg-bg">
                              <span className="h-2 w-2 rounded-full bg-accent" />
                            </span>
                            <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text">
                              {monthLabel(g.key)}
                            </span>
                            <span className="h-px flex-1 bg-border-muted" />
                            <span className="rounded-full border border-border-muted bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-text-dim">
                              {g.items.length}{' '}
                              {g.items.length === 1 ? 'report' : 'reports'}
                            </span>
                          </motion.div>

                          {/* Entries hanging off the spine */}
                          <div className="space-y-2.5">
                            <AnimatePresence initial={false}>
                              {g.items.map((entry, ei) => (
                                <VaultRow
                                  key={entry.id}
                                  entry={entry}
                                  index={ei}
                                  expanded={expandedId === entry.id}
                                  onToggle={() =>
                                    setExpandedId((cur) =>
                                      cur === entry.id ? null : entry.id,
                                    )
                                  }
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Spine origin cap */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                      className="relative flex items-center gap-3 pt-1"
                    >
                      <span className="absolute -left-8 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border-muted bg-bg">
                        <Database className="h-3 w-3 text-text-dim" />
                      </span>
                      <span className="text-[11px] italic text-text-dim">
                        Vault opened · Feb 2026
                      </span>
                    </motion.div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ---- Right rail ---- */}
        <motion.aside {...fade(0.15)} className="space-y-4 lg:col-span-4">
          {/* Vault stats */}
          <div className="rounded-2xl border border-border-muted bg-surface/60 p-5 backdrop-blur-xl">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
              <Database className="h-3.5 w-3.5" />
              Vault stats
            </span>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatTile
                label="Total reports"
                value={String(stats.total)}
                Icon={Archive}
              />
              <StatTile
                label="This month"
                value={String(stats.thisMonth)}
                Icon={CalendarRange}
              />
              <StatTile
                label="Ready"
                value={String(stats.ready)}
                Icon={Check}
                tint="text-accent"
              />
              <StatTile
                label="Expired"
                value={String(stats.expired)}
                Icon={Hourglass}
                tint="text-accent3"
              />
            </div>

            {/* Storage bar */}
            <div className="mt-4 space-y-2 border-t border-border-muted pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-text">
                  <HardDrive className="h-3.5 w-3.5 text-text-dim" />
                  Storage used
                </span>
                <span className="font-mono text-text-dim">
                  {fmtSize(stats.storageKB)} / 4.0 GB
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <motion.span
                  className="block h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, stats.pct)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[11px] text-text-dim">
                {stats.pct}% of the Pro Plus archive envelope in use.
              </p>
            </div>

            {/* Retention policy */}
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5">
              <Clock className="mt-0.5 h-3.5 w-3.5 flex-none text-accent4" />
              <p className="text-[11px] leading-relaxed text-text-dim">
                Reports auto-expire{' '}
                <span className="font-medium text-text">90 days</span> after
                generation. Expired entries stay listed but the file is
                purged — re-run to refresh.
              </p>
            </div>
          </div>

          {/* Archive new */}
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Archive a new report
            </span>
            <p className="mt-2 text-xs leading-relaxed text-text-dim">
              Snapshot the last 30 days across all{' '}
              {MOCK_MAILBOXES.length} mailboxes and drop it at the top of the
              spine.
            </p>
            <button
              type="button"
              onClick={archiveNew}
              disabled={archiving}
              className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:opacity-60"
            >
              {archiving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Archiving…
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  Generate &amp; archive
                </>
              )}
            </button>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter select — native select styled with tokens
// ---------------------------------------------------------------------------

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-border-muted bg-surface-2/60 py-2 pl-3 pr-8 text-sm text-text transition-colors hover:bg-surface-2 focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-text">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  Icon,
  tint = 'text-text',
}: {
  label: string;
  value: string;
  Icon: LucideIcon;
  tint?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-3">
      <Icon className={`h-4 w-4 ${tint === 'text-text' ? 'text-text-dim' : tint}`} />
      <p className={`mt-2 text-xl font-semibold tabular-nums ${tint}`}>{value}</p>
      <p className="text-[11px] text-text-dim">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vault row — one report record on the spine + inline expand detail
// ---------------------------------------------------------------------------

function VaultRow({
  entry,
  index,
  expanded,
  onToggle,
}: {
  entry: VaultEntry;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const tm = TYPE_META[entry.type];
  const sm = STATUS_META[entry.status];
  const fm = FORMAT_META[entry.format];
  const TIcon = tm.Icon;
  const SIcon = sm.Icon;
  const FIcon = fm.Icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12, height: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="relative"
    >
      {/* Connector tick from the spine to the card */}
      <span
        aria-hidden
        className="absolute -left-[21px] top-[26px] h-px w-[18px] bg-border-muted"
      />
      <span
        aria-hidden
        className={`absolute -left-[25px] top-[22px] h-2 w-2 rounded-full ${sm.dot}`}
      />

      <div
        className={`overflow-hidden rounded-xl border bg-surface-2/40 transition-colors ${
          expanded
            ? 'border-accent/40'
            : 'border-border-muted hover:border-border-muted hover:bg-surface-2/70'
        }`}
      >
        {/* Row head — click to expand */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface ${tm.tint}`}
          >
            <TIcon className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">
                {entry.title}
              </p>
              <span
                className={`hidden flex-none items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex ${tm.chip}`}
              >
                {tm.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-dim">
              {fmtDate(entry.generatedAt)} · {fmtTime(entry.generatedAt)} ·{' '}
              {entry.range} · {entry.mailboxes} mailbox
              {entry.mailboxes === 1 ? '' : 'es'}
            </p>
          </div>

          {/* Format + size + status */}
          <div className="hidden flex-none items-center gap-3 sm:flex">
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-text-dim">
              <FIcon className="h-3.5 w-3.5" />
              {fm.label} · {fmtSize(entry.sizeKB)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${sm.chip}`}
            >
              <SIcon
                className={`h-3 w-3 ${
                  entry.status === 'generating' ? 'animate-spin' : ''
                }`}
              />
              {sm.label}
            </span>
          </div>

          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-none text-text-dim"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        {/* Inline detail / preview */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-border-muted"
            >
              <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-12">
                {/* Mini cover */}
                <div className="md:col-span-5">
                  <div className="rounded-lg border border-border-muted bg-surface px-4 py-4">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                      WarmPulse · {tm.label}
                    </span>
                    <div className="mt-3 flex items-end gap-3">
                      <span
                        className={`flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-surface-2 ${tm.tint}`}
                      >
                        <TIcon className="h-6 w-6" strokeWidth={1.7} />
                      </span>
                      <div>
                        <p className="text-3xl font-semibold leading-none tabular-nums text-text">
                          {entry.detail.hero}
                        </p>
                        <p className="mt-1 text-xs text-text-dim">
                          {entry.detail.heroLabel}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-muted bg-border-muted">
                      {entry.detail.figures.map((f) => (
                        <div key={f.label} className="bg-surface px-3 py-2">
                          <p className="text-sm font-semibold tabular-nums text-text">
                            {f.value}
                          </p>
                          <p className="text-[10px] text-text-dim">{f.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Trend mini-chart */}
                <div className="md:col-span-7">
                  <div className="flex h-full flex-col rounded-lg border border-border-muted bg-surface px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-text-dim">
                        {tm.label} trend · 8 buckets
                      </span>
                      <span className="font-mono text-[10px] text-text-dim">
                        {relTime(entry.generatedAt)}
                      </span>
                    </div>
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={entry.detail.trend}
                          margin={{ top: 6, right: 6, bottom: 0, left: -18 }}
                        >
                          <defs>
                            <linearGradient
                              id={`vault-grad-${entry.id}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#F26522"
                                stopOpacity={0.45}
                              />
                              <stop
                                offset="100%"
                                stopColor="#F26522"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.05)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="d"
                            tick={{ fill: '#8a8a9a', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#8a8a9a', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={34}
                          />
                          <Tooltip
                            cursor={{ stroke: '#2a2a3a' }}
                            contentStyle={{
                              background: '#12121a',
                              border: '1px solid #2a2a3a',
                              borderRadius: 8,
                              fontSize: 12,
                              color: '#e8e8f0',
                            }}
                            labelFormatter={(l) => `${tm.label} · ${l}`}
                            formatter={(v: number) => [v, 'value']}
                          />
                          <Area
                            type="monotone"
                            dataKey="v"
                            stroke="#F26522"
                            strokeWidth={2}
                            fill={`url(#vault-grad-${entry.id})`}
                            isAnimationActive
                            animationDuration={650}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Row actions */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-muted pt-3">
                      <button
                        type="button"
                        disabled={entry.status === 'generating'}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-2/70 disabled:opacity-50"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={entry.status !== 'ready'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-colors hover:bg-accent/90 disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {entry.status === 'expired'
                          ? 'File purged'
                          : 'Download'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:bg-surface-2/70 hover:text-text"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Re-run
                      </button>
                      {entry.status === 'expired' ? (
                        <span className="ml-auto text-[11px] italic text-accent3">
                          Retention window elapsed
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default ProPlusRpt4Vault;
