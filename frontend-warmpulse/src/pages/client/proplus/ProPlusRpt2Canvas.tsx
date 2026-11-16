import { useMemo, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarRange,
  Check,
  ChevronRight,
  Clock,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Heading1,
  LayoutTemplate,
  Lightbulb,
  Loader2,
  type LucideIcon,
  Mail,
  Plus,
  ScrollText,
  Settings2,
  Sparkles,
  SplitSquareVertical,
  Table2,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusRpt2Canvas — "Report Builder Canvas" (Pro Plus tier).
 *
 * A WYSIWYG document composer for deliverability reports. Three zones:
 *
 *   ┌── toolbar ── add-block ▾ · format · schedule · export ───────────┐
 *   ┌── palette ──┐┌── document canvas (A4 pages) ──┐┌── inspector ──┐
 *   │ Cover       ││  ┌───────── page 1 ───────────┐ ││ selected blk  │
 *   │ Exec summary││  │ [cover block]               │ ││ title         │
 *   │ Warmth chart││  │ [exec summary block]        │ ││ date range    │
 *   │ Placement   ││  │ [warmth trend — real chart] │ ││ mailbox scope │
 *   │ Engagement  ││  │ [page break]                │ ││ options       │
 *   │ Mailbox tbl ││  └─────────────────────────────┘ ││───────────────│
 *   │ Insights    ││  ┌───────── page 2 ───────────┐ ││ document       │
 *   │ Page break  ││  │ [mailbox table block]       │ ││ format PDF/CSV │
 *   └─────────────┘│  └─────────────────────────────┘ ││ schedule       │
 *                  └─────────── scrolls ──────────────┘└───────────────┘
 *
 * The canvas IS the live preview — chart blocks render real recharts from
 * inline mock series, the cover/summary/table reflect the document's date
 * range + mailbox scope. Add (palette click / toolbar), remove, reorder
 * (move up/down), and select are all REAL useState on a `blocks` array;
 * the canvas genuinely recomposes (pages re-paginate at page-break blocks)
 * and the inspector swaps to the selected block.
 *
 * Deliberately a block/document BUILDER paradigm — NOT a config+preview
 * split (ProPlusReports / ProReports), NOT a magazine/newsstand
 * (ProPlusRpt1Magazine), NOT a cover strip (StarterReports), NOT a
 * sub-client rollup (AgencyReports), NOT a subscription/digest manager or
 * archive timeline (sibling agents own those).
 *
 * STANDALONE: prop-less, inline MOCK only — NO network / router / query
 * hooks. The harness supplies the shell + sidebar; this renders page
 * content only. Explicit heights keep the 3-zone layout stable; the
 * canvas scrolls internally.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BlockKind =
  | 'cover'
  | 'summary'
  | 'warmth'
  | 'placement'
  | 'engagement'
  | 'mailboxes'
  | 'insights'
  | 'pagebreak';

export type DocFormat = 'pdf' | 'csv';
export type DocSchedule = 'once' | 'weekly' | 'monthly';
export type RangeKey = '7d' | '14d' | '30d' | '90d';
export type ScopeKey = 'all' | 'top5' | 'gmail';

/**
 * The "Export" and "Email this report" toolbar actions are wired by the LIVE
 * wrapper (`pages/client/reports/ProPlusReports.tsx`) which owns the
 * react-query mutations. The standalone :35001 design preview renders this
 * canvas prop-less (NO QueryClientProvider in scope), so the actions stay
 * optional — when absent the canvas falls back to the local "exported" banner
 * affordance and the email button is a no-op, exactly as the preview expects.
 */
export interface CanvasExportOpts {
  format: DocFormat;
  range: RangeKey;
  scope: ScopeKey;
  schedule: DocSchedule;
  /** Number of non-structural blocks composed into the document. */
  blockCount: number;
}

export interface ProPlusCanvasActions {
  onExport?: (opts: CanvasExportOpts) => void;
  onEmail?: (opts: CanvasExportOpts) => void;
  exporting?: boolean;
  emailing?: boolean;
}

interface BlockDef {
  kind: BlockKind;
  label: string;
  blurb: string;
  Icon: LucideIcon;
  /** Catalogue accent token (text-*) — never a new colour. */
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  /** A structural block (page break) has no inspector body. */
  structural?: boolean;
}

interface DocBlock {
  /** Stable per-instance id (a kind can appear many times). */
  id: string;
  kind: BlockKind;
  /** Editable heading shown in the rendered block + inspector. */
  title: string;
  /** Per-block date-range override (falls back to document range). */
  range: RangeKey | 'inherit';
  /** Per-block mailbox scope override. */
  scope: ScopeKey | 'inherit';
  /** Block-specific toggles, keyed loosely so each block reads what it needs. */
  opts: {
    showGrid?: boolean;
    showTotals?: boolean;
    compact?: boolean;
    showLogo?: boolean;
  };
}

export interface MockMailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  warmth: number;
  inboxPct: number;
  sent: number;
}

/** One point on the warmth area chart (`WarmthBody`). */
export interface WarmthPoint {
  d: string;
  v: number;
}

/** One bar group on the engagement chart (`EngagementBody`). */
export interface EngagementBar {
  d: string;
  opened: number;
  replied: number;
  clicked: number;
}

/** Inbox / Promotions / Spam split for the placement block + summary. */
export interface PlacementSplit {
  inbox: number;
  promo: number;
  spam: number;
}

/**
 * The chart-block numeric series the canvas consumes, keyed by range so a
 * block's range override genuinely redraws its chart. This is the only
 * realistically data-backed part of the document besides the mailbox scope
 * list — the document/blocks/catalog are design constants with no API source.
 */
export interface CanvasSeries {
  warmth: Record<RangeKey, WarmthPoint[]>;
  engagement: Record<RangeKey, EngagementBar[]>;
  placement: Record<RangeKey, PlacementSplit>;
}

/**
 * The realistically-data-backed inputs to the Report Builder canvas:
 *
 *   - `mailboxes` — the workspace mailbox scope list (id / email / provider /
 *     warmth / inbox% / sent), consumed by the cover, summary, mailbox-table
 *     and insights blocks.
 *   - `series`    — the per-range chart numbers the warmth / engagement /
 *     placement blocks render.
 *
 * The document structure itself (`STARTER_DOC`), the block catalogue
 * (`BLOCK_CATALOG`) and the range / scope labels are DESIGN constants with
 * no API source and are intentionally NOT part of this contract.
 */
export interface CanvasData {
  mailboxes: MockMailbox[];
  series: CanvasSeries;
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-Plus numbers, fully inline
// ---------------------------------------------------------------------------

const RANGE_LABEL: Record<RangeKey, string> = {
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

const RANGE_SPAN: Record<RangeKey, string> = {
  '7d': 'May 11 → May 18',
  '14d': 'May 04 → May 18',
  '30d': 'Apr 18 → May 18',
  '90d': 'Feb 17 → May 18',
};

const SCOPE_LABEL: Record<ScopeKey, string> = {
  all: 'All 15 mailboxes',
  top5: 'Top 5 by warmth',
  gmail: 'Gmail only',
};

const TONE_TEXT: Record<BlockDef['tone'], string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

const TONE_HEX: Record<BlockDef['tone'], string> = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
};

const BLOCK_CATALOG: Record<BlockKind, BlockDef> = {
  cover: {
    kind: 'cover',
    label: 'Cover header',
    blurb: 'Title page · logo · period',
    Icon: Heading1,
    tone: 'accent',
  },
  summary: {
    kind: 'summary',
    label: 'Exec summary',
    blurb: 'Headline KPIs in a row',
    Icon: ScrollText,
    tone: 'accent2',
  },
  warmth: {
    kind: 'warmth',
    label: 'Warmth trend',
    blurb: 'Sender-trust build-up area chart',
    Icon: TrendingUp,
    tone: 'accent',
  },
  placement: {
    kind: 'placement',
    label: 'Where emails land',
    blurb: 'Inbox vs Promo vs Spam',
    Icon: Target,
    tone: 'accent4',
  },
  engagement: {
    kind: 'engagement',
    label: 'Opens & replies bars',
    blurb: 'Opens · replies · clicks',
    Icon: BarChart3,
    tone: 'accent2',
  },
  mailboxes: {
    kind: 'mailboxes',
    label: 'Mailbox table',
    blurb: 'Per-inbox warmth & inbox %',
    Icon: Table2,
    tone: 'accent3',
  },
  insights: {
    kind: 'insights',
    label: 'Insights callout',
    blurb: 'Auto-written takeaways',
    Icon: Lightbulb,
    tone: 'accent4',
  },
  pagebreak: {
    kind: 'pagebreak',
    label: 'Page break',
    blurb: 'Start the next page here',
    Icon: SplitSquareVertical,
    tone: 'accent3',
    structural: true,
  },
};

const CATALOG_ORDER: BlockKind[] = [
  'cover',
  'summary',
  'warmth',
  'placement',
  'engagement',
  'mailboxes',
  'insights',
  'pagebreak',
];

const MOCK_MAILBOXES: MockMailbox[] = [
  { id: 'm01', email: 'founder@acme.io', provider: 'gmail', warmth: 92, inboxPct: 96, sent: 142 },
  { id: 'm02', email: 'sales@acme.io', provider: 'outlook', warmth: 88, inboxPct: 93, sent: 138 },
  { id: 'm03', email: 'success@acme.io', provider: 'gmail', warmth: 90, inboxPct: 95, sent: 131 },
  { id: 'm04', email: 'hello@acme.co', provider: 'smtp', warmth: 81, inboxPct: 89, sent: 124 },
  { id: 'm05', email: 'team@acme.co', provider: 'yahoo', warmth: 79, inboxPct: 87, sent: 119 },
  { id: 'm06', email: 'growth@acme.io', provider: 'gmail', warmth: 86, inboxPct: 92, sent: 116 },
  { id: 'm07', email: 'partners@acme.io', provider: 'outlook', warmth: 83, inboxPct: 90, sent: 112 },
  { id: 'm08', email: 'press@acme.co', provider: 'smtp', warmth: 74, inboxPct: 84, sent: 104 },
  { id: 'm09', email: 'hiring@acme.io', provider: 'gmail', warmth: 87, inboxPct: 94, sent: 101 },
  { id: 'm10', email: 'billing@acme.co', provider: 'yahoo', warmth: 72, inboxPct: 82, sent: 97 },
  { id: 'm11', email: 'support@acme.io', provider: 'gmail', warmth: 85, inboxPct: 91, sent: 95 },
  { id: 'm12', email: 'ops@acme.co', provider: 'outlook', warmth: 80, inboxPct: 88, sent: 92 },
  { id: 'm13', email: 'design@acme.io', provider: 'smtp', warmth: 77, inboxPct: 86, sent: 88 },
  { id: 'm14', email: 'legal@acme.co', provider: 'gmail', warmth: 84, inboxPct: 90, sent: 84 },
  { id: 'm15', email: 'founder2@acme.io', provider: 'yahoo', warmth: 70, inboxPct: 81, sent: 79 },
];

// Per-range chart series — sampled into the chart blocks so changing a
// block's range genuinely redraws its chart. These are the SKELETON series:
// `useProPlusCanvasData` overlays real analytics onto this exact shape and
// keeps any sub-series with no API source verbatim (no fabrication).
const WARMTH_SERIES: Record<RangeKey, WarmthPoint[]> = {
  '7d': [62, 64, 67, 69, 72, 74, 77].map((v, i) => ({ d: `D${i + 1}`, v })),
  '14d': [54, 56, 58, 60, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79].map((v, i) => ({
    d: `D${i + 1}`,
    v,
  })),
  '30d': [44, 47, 49, 52, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 74, 76, 78, 80, 81, 82].map(
    (v, i) => ({ d: `D${i + 1}`, v }),
  ),
  '90d': [30, 36, 41, 46, 50, 54, 58, 62, 66, 70, 73, 76, 79, 81, 83, 85, 86, 87, 88, 89].map(
    (v, i) => ({ d: `W${i + 1}`, v }),
  ),
};

const ENGAGEMENT_SERIES: Record<RangeKey, EngagementBar[]> = {
  '7d': [
    { d: 'Mon', opened: 71, replied: 24, clicked: 12 },
    { d: 'Tue', opened: 74, replied: 26, clicked: 14 },
    { d: 'Wed', opened: 69, replied: 22, clicked: 11 },
    { d: 'Thu', opened: 77, replied: 28, clicked: 15 },
    { d: 'Fri', opened: 73, replied: 25, clicked: 13 },
    { d: 'Sat', opened: 66, replied: 20, clicked: 9 },
    { d: 'Sun', opened: 68, replied: 21, clicked: 10 },
  ],
  '14d': [
    { d: 'W1·Mon', opened: 64, replied: 19, clicked: 9 },
    { d: 'W1·Wed', opened: 68, replied: 22, clicked: 11 },
    { d: 'W1·Fri', opened: 71, replied: 24, clicked: 12 },
    { d: 'W2·Mon', opened: 74, replied: 26, clicked: 14 },
    { d: 'W2·Wed', opened: 76, replied: 27, clicked: 15 },
    { d: 'W2·Fri', opened: 78, replied: 29, clicked: 16 },
  ],
  '30d': [
    { d: 'Wk1', opened: 58, replied: 17, clicked: 8 },
    { d: 'Wk2', opened: 65, replied: 21, clicked: 11 },
    { d: 'Wk3', opened: 71, replied: 25, clicked: 13 },
    { d: 'Wk4', opened: 76, replied: 28, clicked: 15 },
  ],
  '90d': [
    { d: 'Mar', opened: 52, replied: 14, clicked: 6 },
    { d: 'Apr', opened: 67, replied: 22, clicked: 11 },
    { d: 'May', opened: 78, replied: 29, clicked: 16 },
  ],
};

const PLACEMENT_BY_RANGE: Record<RangeKey, PlacementSplit> = {
  '7d': { inbox: 94, promo: 5, spam: 1 },
  '14d': { inbox: 92, promo: 6, spam: 2 },
  '30d': { inbox: 90, promo: 7, spam: 3 },
  '90d': { inbox: 86, promo: 9, spam: 5 },
};

/**
 * The skeleton `CanvasData` — exactly the inline design mock. The :35001
 * preview renders this component prop-less, so `data ?? CANVAS_SKELETON`
 * MUST resolve to this and keep the design unchanged.
 */
export const CANVAS_SKELETON: CanvasData = {
  mailboxes: MOCK_MAILBOXES,
  series: {
    warmth: WARMTH_SERIES,
    engagement: ENGAGEMENT_SERIES,
    placement: PLACEMENT_BY_RANGE,
  },
};

const STARTER_DOC: DocBlock[] = [
  {
    id: 'b-cover',
    kind: 'cover',
    title: 'Q2 Inbox-delivery Report',
    range: 'inherit',
    scope: 'inherit',
    opts: { showLogo: true },
  },
  {
    id: 'b-summary',
    kind: 'summary',
    title: 'Executive summary',
    range: 'inherit',
    scope: 'inherit',
    opts: { showTotals: true },
  },
  {
    id: 'b-warmth',
    kind: 'warmth',
    title: 'Warmth build-up',
    range: 'inherit',
    scope: 'inherit',
    opts: { showGrid: true },
  },
  {
    id: 'b-break',
    kind: 'pagebreak',
    title: 'Page break',
    range: 'inherit',
    scope: 'inherit',
    opts: {},
  },
  {
    id: 'b-mailboxes',
    kind: 'mailboxes',
    title: 'Per-mailbox breakdown',
    range: 'inherit',
    scope: 'inherit',
    opts: { compact: false },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function nextId(kind: BlockKind): string {
  _seq += 1;
  return `${kind}-${_seq}`;
}

function makeBlock(kind: BlockKind): DocBlock {
  const def = BLOCK_CATALOG[kind];
  return {
    id: nextId(kind),
    kind,
    title: def.label,
    range: 'inherit',
    scope: 'inherit',
    opts:
      kind === 'cover'
        ? { showLogo: true }
        : kind === 'summary'
          ? { showTotals: true }
          : kind === 'warmth' || kind === 'engagement'
            ? { showGrid: true }
            : kind === 'mailboxes'
              ? { compact: false }
              : {},
  };
}

function scopedMailboxes(all: MockMailbox[], scope: ScopeKey): MockMailbox[] {
  if (scope === 'gmail') return all.filter((m) => m.provider === 'gmail');
  if (scope === 'top5')
    return [...all].sort((a, b) => b.warmth - a.warmth).slice(0, 5);
  return all;
}

function resolveRange(block: DocBlock, docRange: RangeKey): RangeKey {
  return block.range === 'inherit' ? docRange : block.range;
}

function resolveScope(block: DocBlock, docScope: ScopeKey): ScopeKey {
  return block.scope === 'inherit' ? docScope : block.scope;
}

const PROVIDER_LETTER: Record<MockMailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const CHART_TOOLTIP = {
  background: '#12121a',
  border: '1px solid #2a2a3a',
  borderRadius: 8,
  fontSize: 12,
  color: '#e8e8f0',
} as const;

const paletteParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
};
const paletteItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// ---------------------------------------------------------------------------
// Rendered block bodies (the WYSIWYG canvas content)
// ---------------------------------------------------------------------------

function CoverBody({ block, range, scope }: { block: DocBlock; range: RangeKey; scope: ScopeKey }) {
  return (
    <div className="rounded-lg border border-border-muted bg-gradient-to-br from-surface-2 to-surface px-6 py-7 text-center">
      {block.opts.showLogo ? (
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          WarmPulse
        </div>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-text">{block.title}</h2>
      <p className="mt-2 text-sm text-text-dim">
        {RANGE_LABEL[range]} · {RANGE_SPAN[range]}
      </p>
      <p className="mt-0.5 text-xs text-text-dim">{SCOPE_LABEL[scope]} · generated 2026-05-18</p>
    </div>
  );
}

function SummaryBody({
  block,
  range,
  scope,
  data,
}: {
  block: DocBlock;
  range: RangeKey;
  scope: ScopeKey;
  data: CanvasData;
}) {
  const mbs = scopedMailboxes(data.mailboxes, scope);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1));
  const totalSent = mbs.reduce((a, m) => a + m.sent, 0);
  const stats = [
    { k: 'Avg warmth', v: String(avg(mbs.map((m) => m.warmth))) },
    { k: 'Inbox rate', v: `${data.series.placement[range].inbox}%` },
    { k: 'Mailboxes', v: String(mbs.length) },
    { k: 'Emails sent', v: formatNumber(totalSent) },
  ];
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text">{block.title}</p>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-muted bg-border-muted sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="bg-surface px-4 py-3">
            <p className="text-xl font-semibold tabular-nums text-text">{s.v}</p>
            <p className="text-xs text-text-dim">{s.k}</p>
          </div>
        ))}
      </div>
      {block.opts.showTotals ? (
        <p className="mt-3 text-xs leading-relaxed text-text-dim">
          Across {RANGE_LABEL[range].toLowerCase()}, {mbs.length} mailboxes
          maintained an average warmth of {avg(mbs.map((m) => m.warmth))} with{' '}
          {data.series.placement[range].inbox}% primary-inbox delivery.
        </p>
      ) : null}
    </div>
  );
}

function WarmthBody({
  block,
  range,
  series,
}: {
  block: DocBlock;
  range: RangeKey;
  series: CanvasSeries;
}) {
  const data = series.warmth[range];
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text">{block.title}</p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="rpt2WarmthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TONE_HEX.accent} stopOpacity={0.34} />
                <stop offset="100%" stopColor={TONE_HEX.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="d"
              tick={{ fill: '#5a5a72', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#2a2a3a' }}
              interval="preserveStartEnd"
            />
            <Tooltip
              cursor={{ stroke: '#2a2a3a' }}
              contentStyle={CHART_TOOLTIP}
              labelStyle={{ color: '#8888a0' }}
              formatter={(v: number) => [v, 'warmth']}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={TONE_HEX.accent}
              strokeWidth={2}
              fill="url(#rpt2WarmthFill)"
              isAnimationActive
              animationDuration={650}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-text-dim">
        {block.opts.showGrid ? 'Daily warmth score' : 'Trend'} · {RANGE_SPAN[range]}
      </p>
    </div>
  );
}

function EngagementBody({
  block,
  range,
  series,
}: {
  block: DocBlock;
  range: RangeKey;
  series: CanvasSeries;
}) {
  const data = series.engagement[range];
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text">{block.title}</p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }} barGap={3}>
            <XAxis
              dataKey="d"
              tick={{ fill: '#5a5a72', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#2a2a3a' }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={CHART_TOOLTIP}
              labelStyle={{ color: '#8888a0' }}
            />
            <Bar dataKey="opened" name="opened" radius={[3, 3, 0, 0]} fill={TONE_HEX.accent2} isAnimationActive animationDuration={600} />
            <Bar dataKey="replied" name="replied" radius={[3, 3, 0, 0]} fill={TONE_HEX.accent} isAnimationActive animationDuration={600} />
            <Bar dataKey="clicked" name="clicked" radius={[3, 3, 0, 0]} fill={TONE_HEX.accent4} isAnimationActive animationDuration={600} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: TONE_HEX.accent2 }} /> opened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: TONE_HEX.accent }} /> replied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: TONE_HEX.accent4 }} /> clicked
        </span>
      </div>
    </div>
  );
}

function PlacementBody({
  block,
  range,
  series,
}: {
  block: DocBlock;
  range: RangeKey;
  series: CanvasSeries;
}) {
  const p = series.placement[range];
  const segs = [
    { k: 'Inbox', v: p.inbox, hex: TONE_HEX.accent },
    { k: 'Promotions', v: p.promo, hex: TONE_HEX.accent4 },
    { k: 'Spam', v: p.spam, hex: TONE_HEX.accent3 },
  ];
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text">{block.title}</p>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-border-muted">
        {segs.map((s) => (
          <motion.div
            key={s.k}
            className="h-full"
            style={{ background: s.hex }}
            initial={{ width: 0 }}
            animate={{ width: `${s.v}%` }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {segs.map((s) => (
          <div key={s.k} className="rounded-lg border border-border-muted bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.hex }} />
              <span className="text-xs text-text-dim">{s.k}</span>
            </div>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text">{s.v}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MailboxesBody({
  block,
  scope,
  data,
}: {
  block: DocBlock;
  scope: ScopeKey;
  data: CanvasData;
}) {
  const rows = scopedMailboxes(data.mailboxes, scope);
  const compact = !!block.opts.compact;
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text">{block.title}</p>
      <div className="overflow-hidden rounded-lg border border-border-muted">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-3 py-2">Mailbox</th>
              <th className="px-3 py-2 text-right">Warmth</th>
              <th className="px-3 py-2 text-right">Inbox %</th>
              {!compact ? <th className="px-3 py-2 text-right">Sent</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {(compact ? rows.slice(0, 6) : rows).map((m) => (
              <tr key={m.id} className="text-text">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-text-dim">
                      {PROVIDER_LETTER[m.provider]}
                    </span>
                    <span className="truncate">{m.email}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.warmth}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.inboxPct}%</td>
                {!compact ? (
                  <td className="px-3 py-2 text-right tabular-nums text-text-dim">{m.sent}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compact && rows.length > 6 ? (
        <p className="mt-2 text-xs text-text-dim">+ {rows.length - 6} more in full export</p>
      ) : null}
    </div>
  );
}

function InsightsBody({
  block,
  range,
  scope,
  data,
}: {
  block: DocBlock;
  range: RangeKey;
  scope: ScopeKey;
  data: CanvasData;
}) {
  const mbs = scopedMailboxes(data.mailboxes, scope);
  const top = [...mbs].sort((a, b) => b.warmth - a.warmth)[0];
  const lag = [...mbs].sort((a, b) => a.warmth - b.warmth)[0];
  const bullets = [
    `Warmth is trending up across ${RANGE_LABEL[range].toLowerCase()} — primary-inbox delivery holding at ${data.series.placement[range].inbox}%.`,
    top ? `${top.email} leads with a ${top.warmth} warmth score.` : 'All mailboxes nominal.',
    lag ? `${lag.email} is the laggard (${lag.warmth}) — consider a slower build-up step.` : 'No laggards detected.',
  ];
  return (
    <div className="rounded-lg border border-accent4/30 bg-accent4/5 px-4 py-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
        <Lightbulb className="h-4 w-4 text-accent4" />
        {block.title}
      </div>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-text-dim">
            <ChevronRight className="mt-0.5 h-3 w-3 flex-none text-accent4" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockBody({
  block,
  docRange,
  docScope,
  data,
}: {
  block: DocBlock;
  docRange: RangeKey;
  docScope: ScopeKey;
  data: CanvasData;
}) {
  const range = resolveRange(block, docRange);
  const scope = resolveScope(block, docScope);
  switch (block.kind) {
    case 'cover':
      return <CoverBody block={block} range={range} scope={scope} />;
    case 'summary':
      return <SummaryBody block={block} range={range} scope={scope} data={data} />;
    case 'warmth':
      return <WarmthBody block={block} range={range} series={data.series} />;
    case 'engagement':
      return <EngagementBody block={block} range={range} series={data.series} />;
    case 'placement':
      return <PlacementBody block={block} range={range} series={data.series} />;
    case 'mailboxes':
      return <MailboxesBody block={block} scope={scope} data={data} />;
    case 'insights':
      return <InsightsBody block={block} range={range} scope={scope} data={data} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Pagination — split the flat block list at page-break blocks
// ---------------------------------------------------------------------------

function paginate(blocks: DocBlock[]): DocBlock[][] {
  const pages: DocBlock[][] = [[]];
  for (const b of blocks) {
    if (b.kind === 'pagebreak') {
      pages.push([]);
    } else {
      pages[pages.length - 1]!.push(b);
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRpt2Canvas({
  data,
  onExport,
  onEmail,
  exporting = false,
  emailing = false,
}: { data?: CanvasData } & ProPlusCanvasActions = {}): JSX.Element {
  // The :35001 design preview renders this prop-less — `?? CANVAS_SKELETON`
  // keeps that path rendering the exact inline mock, unchanged. The live
  // wrapper (`pages/client/reports/ProPlusReports`) passes real workspace
  // data threaded through `useProPlusCanvasData`.
  const d = data ?? CANVAS_SKELETON;
  const [blocks, setBlocks] = useState<DocBlock[]>(STARTER_DOC);
  const [selectedId, setSelectedId] = useState<string | null>('b-cover');
  const [docRange, setDocRange] = useState<RangeKey>('30d');
  const [docScope, setDocScope] = useState<ScopeKey>('all');
  const [format, setFormat] = useState<DocFormat>('pdf');
  const [schedule, setSchedule] = useState<DocSchedule>('weekly');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  const pages = useMemo(() => paginate(blocks), [blocks]);
  const contentCount = blocks.filter((b) => b.kind !== 'pagebreak').length;

  // --- Real block operations -------------------------------------------------
  const addBlock = (kind: BlockKind) => {
    const b = makeBlock(kind);
    setBlocks((prev) => [...prev, b]);
    setSelectedId(b.id);
    setAddMenuOpen(false);
    setExported(false);
    // The canvas often has the starter blocks filling the visible area —
    // a newly-appended block lands below the fold and the user sees nothing
    // change. Scroll the new block into view after React paints, so the
    // append is visibly confirmed.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-block-id="${b.id}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setExported(false);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(swap, 0, moved!);
      return next;
    });
    setExported(false);
  };

  const patchSelected = (patch: Partial<DocBlock>) => {
    if (!selected) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)),
    );
    setExported(false);
  };

  const patchSelectedOpts = (patch: Partial<DocBlock['opts']>) => {
    if (!selected) return;
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === selected.id ? { ...b, opts: { ...b.opts, ...patch } } : b,
      ),
    );
    setExported(false);
  };

  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col gap-3">
      {/* ---- Toolbar ---- */}
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <LayoutTemplate className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-text">
                Report builder
              </h1>
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-xs text-text-dim">
              {contentCount} block{contentCount === 1 ? '' : 's'} · {pages.length} page
              {pages.length === 1 ? '' : 's'} · WYSIWYG
            </p>
          </div>
        </div>

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setAddMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2/70"
          >
            <Plus className="h-3.5 w-3.5" />
            Add block
          </button>
          <AnimatePresence>
            {addMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-border-muted bg-surface shadow-glass"
              >
                {CATALOG_ORDER.map((k) => {
                  const def = BLOCK_CATALOG[k];
                  const I = def.Icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => addBlock(k)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 ${TONE_TEXT[def.tone]}`}>
                        <I className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text">{def.label}</span>
                        <span className="block truncate text-xs text-text-dim">{def.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 p-1">
          {(['pdf', 'csv'] as const).map((f) => {
            const I = f === 'pdf' ? FileText : FileSpreadsheet;
            const active = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormat(f);
                  setExported(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-accent text-bg' : 'text-text-dim hover:text-text'
                }`}
              >
                <I className="h-3.5 w-3.5" />
                {f.toUpperCase()}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            if (onExport) {
              onExport({
                format,
                range: docRange,
                scope: docScope,
                schedule,
                blockCount: contentCount,
              });
            } else {
              // Standalone preview: no live mutation in scope — keep the
              // original banner affordance so the design still demonstrates.
              setExported(true);
            }
          }}
          disabled={contentCount === 0 || exporting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </motion.header>

      {/* ---- 3-zone body ---- */}
      {/* On phones the three fixed panes can't fit side-by-side in ~320px, so
          the builder scrolls horizontally inside this wrapper at a usable
          min-width instead of crushing every pane. ≥lg is byte-identical. */}
      <div className="min-h-0 flex-1 overflow-x-auto lg:overflow-visible">
      <div className="grid h-full min-w-[820px] grid-cols-12 gap-3 lg:min-w-0">
        {/* === LEFT: block palette === */}
        <motion.aside
          variants={paletteParent}
          initial="hidden"
          animate="show"
          className="col-span-3 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-surface"
        >
          <div className="border-b border-border-muted px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Columns3 className="h-3.5 w-3.5" />
              Block palette
            </span>
            <p className="mt-0.5 text-xs text-text-dim">Click to append to the document</p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {CATALOG_ORDER.map((k) => {
              const def = BLOCK_CATALOG[k];
              const I = def.Icon;
              return (
                <motion.button
                  key={k}
                  variants={paletteItem}
                  type="button"
                  onClick={() => addBlock(k)}
                  whileHover={{ x: 3 }}
                  className="flex w-full items-start gap-3 rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-surface-2"
                >
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface ${TONE_TEXT[def.tone]}`}>
                    <I className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-text">{def.label}</span>
                      <Plus className="h-3.5 w-3.5 flex-none text-text-dim" />
                    </span>
                    <span className="block text-xs text-text-dim">{def.blurb}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.aside>

        {/* === CENTER: document canvas === */}
        <main className="col-span-6 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-bg">
          <div className="flex items-center justify-between border-b border-border-muted bg-surface px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
              <FileText className="h-3.5 w-3.5 text-accent" />
              Document canvas
            </span>
            <span className="font-mono text-xs text-text-dim">
              {format.toUpperCase()} · {RANGE_LABEL[docRange]}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-bg p-5">
            {contentCount === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border-muted py-16 text-center">
                <LayoutTemplate className="h-8 w-8 text-text-dim" />
                <p className="mt-3 text-sm font-medium text-text">Empty document</p>
                <p className="mt-1 text-xs text-text-dim">
                  Add a block from the palette to start composing.
                </p>
              </div>
            ) : (
              pages.map((pageBlocks, pi) => (
                <motion.section
                  key={`page-${pi}`}
                  layout
                  className="mx-auto w-full max-w-[640px] rounded-xl border border-border-muted bg-surface shadow-glass"
                >
                  <div className="flex items-center justify-between border-b border-border-muted px-5 py-2 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                    <span>WarmPulse report</span>
                    <span>
                      Page {pi + 1} / {pages.length}
                    </span>
                  </div>
                  <div className="space-y-3 p-5">
                    <AnimatePresence initial={false} mode="popLayout">
                      {pageBlocks.length === 0 ? (
                        <motion.p
                          key={`empty-${pi}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="py-6 text-center text-xs italic text-text-dim"
                        >
                          Empty page — add blocks before the next page break.
                        </motion.p>
                      ) : (
                        pageBlocks.map((block) => {
                          const def = BLOCK_CATALOG[block.kind];
                          const isSel = block.id === selectedId;
                          const flatIdx = blocks.findIndex((b) => b.id === block.id);
                          return (
                            <motion.div
                              key={block.id}
                              data-block-id={block.id}
                              layout
                              initial={{ opacity: 0, y: 12, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                              transition={{ duration: 0.28, ease: 'easeOut' }}
                              onClick={() => setSelectedId(block.id)}
                              className={`group relative cursor-pointer rounded-xl border p-4 transition-colors ${
                                isSel
                                  ? 'border-accent bg-accent/[0.06] ring-1 ring-accent/40'
                                  : 'border-border-muted bg-surface-2/30 hover:border-border-muted hover:bg-surface-2/60'
                              }`}
                            >
                              {/* per-block toolbar */}
                              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveBlock(block.id, -1);
                                  }}
                                  disabled={flatIdx <= 0}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:text-text disabled:opacity-30"
                                  aria-label="Move block up"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveBlock(block.id, 1);
                                  }}
                                  disabled={flatIdx >= blocks.length - 1}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:text-text disabled:opacity-30"
                                  aria-label="Move block down"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBlock(block.id);
                                  }}
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent3/50 hover:text-accent3"
                                  aria-label="Remove block"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>

                              {/* kind tag */}
                              <div className="mb-2 flex items-center gap-1.5">
                                <GripVertical className="h-3.5 w-3.5 text-text-dim/50" />
                                <span
                                  className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${TONE_TEXT[def.tone]}`}
                                >
                                  <def.Icon className="h-3 w-3" />
                                  {def.label}
                                </span>
                              </div>

                              <BlockBody
                                block={block}
                                docRange={docRange}
                                docScope={docScope}
                                data={d}
                              />
                            </motion.div>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="border-t border-border-muted px-5 py-2 text-center text-[10px] text-text-dim">
                    WarmPulse · generated 2026-05-18
                  </div>
                </motion.section>
              ))
            )}
          </div>
        </main>

        {/* === RIGHT: inspector === */}
        <aside className="col-span-3 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-surface">
          <div className="border-b border-border-muted px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Settings2 className="h-3.5 w-3.5" />
              Inspector
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* selected-block panel (swaps on selection) */}
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 border-b border-border-muted p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 ${TONE_TEXT[BLOCK_CATALOG[selected.kind].tone]}`}
                    >
                      {(() => {
                        const I = BLOCK_CATALOG[selected.kind].Icon;
                        return <I className="h-4 w-4" />;
                      })()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">
                        {BLOCK_CATALOG[selected.kind].label}
                      </p>
                      <p className="text-xs text-text-dim">Block settings</p>
                    </div>
                  </div>

                  {BLOCK_CATALOG[selected.kind].structural ? (
                    <p className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-3 text-xs text-text-dim">
                      A page break has no content — everything after it starts
                      on the next page. Reorder or remove it from the canvas.
                    </p>
                  ) : (
                    <>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
                          Block title
                        </span>
                        <input
                          value={selected.title}
                          onChange={(e) => patchSelected({ title: e.target.value })}
                          className="w-full rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
                          <CalendarRange className="h-3 w-3" />
                          Date range
                        </span>
                        <select
                          value={selected.range}
                          onChange={(e) =>
                            patchSelected({ range: e.target.value as DocBlock['range'] })
                          }
                          className="w-full rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                        >
                          <option value="inherit">Inherit document ({RANGE_LABEL[docRange]})</option>
                          {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => (
                            <option key={r} value={r}>
                              {RANGE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
                          Mailbox scope
                        </span>
                        <select
                          value={selected.scope}
                          onChange={(e) =>
                            patchSelected({ scope: e.target.value as DocBlock['scope'] })
                          }
                          className="w-full rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                        >
                          <option value="inherit">Inherit document ({SCOPE_LABEL[docScope]})</option>
                          {(Object.keys(SCOPE_LABEL) as ScopeKey[]).map((s) => (
                            <option key={s} value={s}>
                              {SCOPE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* per-kind options */}
                      <div className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
                          Options
                        </span>
                        {selected.kind === 'cover' ? (
                          <OptToggle
                            label="Show WarmPulse logo"
                            checked={!!selected.opts.showLogo}
                            onChange={(v) => patchSelectedOpts({ showLogo: v })}
                          />
                        ) : null}
                        {selected.kind === 'summary' ? (
                          <OptToggle
                            label="Include narrative line"
                            checked={!!selected.opts.showTotals}
                            onChange={(v) => patchSelectedOpts({ showTotals: v })}
                          />
                        ) : null}
                        {selected.kind === 'warmth' || selected.kind === 'engagement' ? (
                          <OptToggle
                            label="Show axis caption"
                            checked={!!selected.opts.showGrid}
                            onChange={(v) => patchSelectedOpts({ showGrid: v })}
                          />
                        ) : null}
                        {selected.kind === 'mailboxes' ? (
                          <OptToggle
                            label="Compact (top 6, hide Sent)"
                            checked={!!selected.opts.compact}
                            onChange={(v) => patchSelectedOpts({ compact: v })}
                          />
                        ) : null}
                        {selected.kind === 'placement' || selected.kind === 'insights' ? (
                          <p className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-xs text-text-dim">
                            This block has no extra options — it follows the
                            date range &amp; scope above.
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="no-selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b border-border-muted p-6 text-center"
                >
                  <Settings2 className="mx-auto h-7 w-7 text-text-dim" />
                  <p className="mt-2 text-sm font-medium text-text">No block selected</p>
                  <p className="mt-1 text-xs text-text-dim">
                    Click a block in the canvas to edit it.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* document settings (always present) */}
            <div className="space-y-4 p-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
                <FileText className="h-3.5 w-3.5" />
                Document
              </span>

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Default range
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => {
                    const active = docRange === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setDocRange(r);
                          setExported(false);
                        }}
                        className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                        }`}
                      >
                        {r.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Default scope
                </span>
                <select
                  value={docScope}
                  onChange={(e) => {
                    setDocScope(e.target.value as ScopeKey);
                    setExported(false);
                  }}
                  className="w-full rounded-lg border border-border-muted bg-surface-2/50 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                >
                  {(Object.keys(SCOPE_LABEL) as ScopeKey[]).map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
                  <Clock className="h-3 w-3" />
                  Schedule
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['once', 'weekly', 'monthly'] as const).map((s) => {
                    const active = schedule === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSchedule(s);
                          setExported(false);
                        }}
                        className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                        }`}
                      >
                        {s === 'once' ? 'One-off' : s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onEmail?.({
                      format,
                      range: docRange,
                      scope: docScope,
                      schedule,
                      blockCount: contentCount,
                    })
                  }
                  disabled={contentCount === 0 || emailing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-2/70 disabled:opacity-50"
                >
                  {emailing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  {emailing
                    ? 'Sending…'
                    : schedule === 'once'
                      ? 'Email this report'
                      : `Email + schedule ${schedule}`}
                </button>
              </div>

              <AnimatePresence>
                {exported ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2.6} />
                    <span>
                      {contentCount}-block {format.toUpperCase()} composed —{' '}
                      <span className="font-semibold underline">download</span>.{' '}
                      {schedule !== 'once' ? `Recurs ${schedule}.` : 'One-off export.'}
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small inspector toggle
// ---------------------------------------------------------------------------

function OptToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-surface-2"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 flex-none rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border-muted'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 480, damping: 32 }}
          className="absolute top-0.5 h-3 w-3 rounded-full bg-bg"
          style={{ left: checked ? 14 : 2 }}
        />
      </span>
    </button>
  );
}

export default ProPlusRpt2Canvas;
