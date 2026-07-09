import { useMemo, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Library,
  Mail,
  PenSquare,
  Quote,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';

/**
 * ProPlusRpt1Magazine — "Report Magazine / Publication" (Pro Plus tier).
 *
 * Reports are framed as a published periodical. The paradigm is a
 * NEWSSTAND of past report "issues" (glossy magazine covers in a shelf
 * grid) → click a cover → a FLIP-THROUGH READER opens a 2-page magazine
 * spread (cover · contents · chart page · exec summary) with page-turn
 * navigation → a "Compose new issue" editorial rail with a LIVE MINI
 * COVER that updates as you pick edition / period / mailboxes, and
 * "Publish issue" genuinely prepends a new issue onto the newsstand.
 *
 * Distinct from siblings on purpose:
 *  - NOT a config + live-preview split (ProPlusReports / ProReports).
 *  - NOT a horizontal cover strip (StarterReports).
 *  - NOT a sub-client rollup table (AgencyReports).
 *  - NOT a block-drag canvas / subscription manager / archive timeline.
 *  It is a publication paradigm: mastheads, kickers, pull-quotes,
 *  page-turning spreads, an editorial compose desk.
 *
 * STANDALONE: prop-less, inline MOCK only — NO network / router / query
 * hooks. The harness supplies shell + sidebar; this renders page content
 * only. Explicit heights keep the spread reader stable in the harness.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Edition = 'warmth' | 'engagement' | 'placement' | 'executive';

interface EditionMeta {
  label: string;
  kicker: string;
  Icon: LucideIcon;
  /** Token class for the accent text used on this edition's masthead. */
  ink: string;
  /** Hex used by recharts series (must map to an existing token hex). */
  hex: string;
}

interface ChartPoint {
  label: string;
  value: number;
}

interface SpreadPage {
  /** Page kind drives which editorial layout renders. */
  kind: 'contents' | 'chart' | 'summary';
  /** Page kicker / eyebrow line. */
  kicker: string;
  /** Page headline. */
  headline: string;
  /** Contents-page entries. */
  entries?: { no: string; title: string; page: string }[];
  /** Chart-page series (real numbers) + caption + chart shape. */
  chart?: { shape: 'bar' | 'area'; caption: string; data: ChartPoint[] };
  /** Exec-summary deck + pull-quote + key figures. */
  deck?: string;
  quote?: string;
  figures?: { k: string; v: string }[];
}

interface Issue {
  id: string;
  edition: Edition;
  /** Cover title, e.g. "Warmth Report". */
  title: string;
  /** Issue line, e.g. "May 2026 · Vol. 4". */
  issueLine: string;
  /** Big hero stat printed on the cover. */
  heroStat: string;
  heroLabel: string;
  /** Cover date stamp. */
  dateStamp: string;
  /** Mailboxes covered by this issue. */
  mailboxes: number;
  /** Edition tag (e.g. "Premium Edition"). */
  editionTag: string;
  /** 3–4 inner spread pages. */
  pages: SpreadPage[];
}

interface MockMailbox {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Edition catalogue
// ---------------------------------------------------------------------------

const EDITIONS: Record<Edition, EditionMeta> = {
  warmth: {
    label: 'Warmth',
    kicker: 'Sender Trust Quarterly',
    Icon: Sparkles,
    ink: 'text-accent',
    hex: '#F26522',
  },
  engagement: {
    label: 'Opens & replies',
    kicker: 'The Interaction Review',
    Icon: TrendingUp,
    ink: 'text-accent4',
    hex: '#ffd54f',
  },
  placement: {
    label: 'Where emails land',
    kicker: 'Inbox & Folder Digest',
    Icon: Target,
    ink: 'text-accent3',
    hex: '#ff6b4a',
  },
  executive: {
    label: 'Executive',
    kicker: 'The Boardroom Brief',
    Icon: Crown,
    ink: 'text-accent',
    hex: '#F26522',
  },
};

const EDITION_TAGS: Record<Edition, string> = {
  warmth: 'Premium Edition',
  engagement: 'Signal Edition',
  placement: 'Inbox-delivery Edition',
  executive: 'Leadership Edition',
};

// ---------------------------------------------------------------------------
// Mock — 15 Pro Plus mailboxes
// ---------------------------------------------------------------------------

const MOCK_MAILBOXES: MockMailbox[] = [
  { id: 'mb-1', email: 'founder@northstar.io' },
  { id: 'mb-2', email: 'sales@northstar.io' },
  { id: 'mb-3', email: 'success@northstar.io' },
  { id: 'mb-4', email: 'growth@northstar.io' },
  { id: 'mb-5', email: 'hello@northstar.co' },
  { id: 'mb-6', email: 'team@northstar.co' },
  { id: 'mb-7', email: 'ops@northstar.co' },
  { id: 'mb-8', email: 'partners@northstar.io' },
  { id: 'mb-9', email: 'demos@northstar.io' },
  { id: 'mb-10', email: 'billing@northstar.co' },
  { id: 'mb-11', email: 'careers@northstar.co' },
  { id: 'mb-12', email: 'press@northstar.io' },
  { id: 'mb-13', email: 'support@northstar.io' },
  { id: 'mb-14', email: 'noreply@northstar.co' },
  { id: 'mb-15', email: 'founder@northstar.co' },
];

// ---------------------------------------------------------------------------
// Mock — 6 published issues, each with 3–4 spread pages
// ---------------------------------------------------------------------------

const WARMTH_SERIES: ChartPoint[] = [
  { label: 'W1', value: 58 },
  { label: 'W2', value: 63 },
  { label: 'W3', value: 67 },
  { label: 'W4', value: 71 },
  { label: 'W5', value: 76 },
  { label: 'W6', value: 81 },
];

const ENGAGE_SERIES: ChartPoint[] = [
  { label: 'Opens', value: 71 },
  { label: 'Replies', value: 24 },
  { label: 'Stars', value: 18 },
  { label: 'Saves', value: 12 },
  { label: 'Forwards', value: 6 },
];

const PLACEMENT_SERIES: ChartPoint[] = [
  { label: 'Inbox', value: 93 },
  { label: 'Primary', value: 71 },
  { label: 'Updates', value: 14 },
  { label: 'Promos', value: 5 },
  { label: 'Spam', value: 2 },
];

const EXEC_SERIES: ChartPoint[] = [
  { label: 'Jan', value: 62 },
  { label: 'Feb', value: 68 },
  { label: 'Mar', value: 74 },
  { label: 'Apr', value: 79 },
  { label: 'May', value: 86 },
];

const CONTENTS_PAGE = (entries: SpreadPage['entries']): SpreadPage => ({
  kind: 'contents',
  kicker: 'In this issue',
  headline: 'Contents',
  entries,
});

const MOCK_ISSUES: Issue[] = [
  {
    id: 'iss-1',
    edition: 'warmth',
    title: 'Warmth Report',
    issueLine: 'May 2026 · Vol. 4',
    heroStat: '81',
    heroLabel: 'avg warmth score',
    dateStamp: 'May 16, 2026',
    mailboxes: 15,
    editionTag: EDITION_TAGS.warmth,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Sender trust at a glance', page: 'p.02' },
        { no: '02', title: 'Six-week warmth climb', page: 'p.03' },
        { no: '03', title: "Editor's summary", page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'Six-week warmth climb',
        chart: {
          shape: 'area',
          caption:
            'Composite warmth across all 15 mailboxes rose 23 points over six weeks — the steepest build-up this volume.',
          data: WARMTH_SERIES,
        },
      },
      {
        kind: 'summary',
        kicker: "Editor's letter",
        headline: 'A sender trust that compounds',
        deck:
          'Every mailbox crossed the 70 threshold this period. Provider trust at Gmail and Outlook is now self-reinforcing.',
        quote:
          'Warmth is not a number you hit once — it is interest you keep earning.',
        figures: [
          { k: 'Avg warmth', v: '81' },
          { k: 'Mailboxes ≥70', v: '15 / 15' },
          { k: 'Failure rate', v: '0.4%' },
        ],
      },
    ],
  },
  {
    id: 'iss-2',
    edition: 'engagement',
    title: 'Opens & Replies Report',
    issueLine: 'May 2026 · Vol. 9',
    heroStat: '71%',
    heroLabel: 'open rate',
    dateStamp: 'May 12, 2026',
    mailboxes: 15,
    editionTag: EDITION_TAGS.engagement,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Interaction mix', page: 'p.02' },
        { no: '02', title: 'Where replies came from', page: 'p.03' },
        { no: '03', title: 'The takeaway', page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'The interaction mix',
        chart: {
          shape: 'bar',
          caption:
            'Opens lead, but a 24% reply rate is what convinces inbox providers a conversation is real.',
          data: ENGAGE_SERIES,
        },
      },
      {
        kind: 'summary',
        kicker: 'The takeaway',
        headline: 'Replies are the signal that matters',
        deck:
          'Opens are table stakes. The reply and star depth this period is what moved inbox landing upward.',
        quote: 'A reply is worth ten opens to an inbox provider.',
        figures: [
          { k: 'Open rate', v: '71%' },
          { k: 'Reply rate', v: '24%' },
          { k: 'Star rate', v: '18%' },
        ],
      },
    ],
  },
  {
    id: 'iss-3',
    edition: 'placement',
    title: 'Where Emails Land Report',
    issueLine: 'May 2026 · Vol. 6',
    heroStat: '93%',
    heroLabel: 'landed in inbox',
    dateStamp: 'May 09, 2026',
    mailboxes: 14,
    editionTag: EDITION_TAGS.placement,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Folder landing breakdown', page: 'p.02' },
        { no: '02', title: 'Spam recovery wins', page: 'p.03' },
        { no: '03', title: 'Verdict', page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'Where the mail landed',
        chart: {
          shape: 'bar',
          caption:
            '93% inbox delivery with spam contained under 2% — folder routing held through the build-up.',
          data: PLACEMENT_SERIES,
        },
      },
      {
        kind: 'summary',
        kicker: 'Verdict',
        headline: 'Inbox-first, and holding',
        deck:
          'Promotions tab leakage stayed below 5%. Spam rescues recovered the few stragglers within the day.',
        quote: 'The inbox is the only folder that compounds sender trust.',
        figures: [
          { k: 'Inbox', v: '93%' },
          { k: 'Promotions', v: '5%' },
          { k: 'Spam', v: '2%' },
        ],
      },
    ],
  },
  {
    id: 'iss-4',
    edition: 'executive',
    title: 'Executive Brief',
    issueLine: 'Q2 2026 · Vol. 2',
    heroStat: '86',
    heroLabel: 'portfolio health',
    dateStamp: 'May 01, 2026',
    mailboxes: 15,
    editionTag: EDITION_TAGS.executive,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Quarter in one number', page: 'p.02' },
        { no: '02', title: 'Five-month trajectory', page: 'p.03' },
        { no: '03', title: 'Board recommendation', page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'Five-month trajectory',
        chart: {
          shape: 'area',
          caption:
            'Portfolio health climbed 24 points since January as new mailboxes finished building up.',
          data: EXEC_SERIES,
        },
      },
      {
        kind: 'summary',
        kicker: 'Board recommendation',
        headline: 'Scale the program',
        deck:
          'The warmup network is producing durable sender-trust gains. Capacity, not strategy, is now the constraint.',
        quote: 'Sender trust built this quarter is revenue protected next quarter.',
        figures: [
          { k: 'Portfolio', v: '86' },
          { k: 'QoQ delta', v: '+18' },
          { k: 'At risk', v: '0' },
        ],
      },
    ],
  },
  {
    id: 'iss-5',
    edition: 'warmth',
    title: 'Warmth Report',
    issueLine: 'Apr 2026 · Vol. 3',
    heroStat: '74',
    heroLabel: 'avg warmth score',
    dateStamp: 'Apr 16, 2026',
    mailboxes: 12,
    editionTag: EDITION_TAGS.warmth,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Build-up midpoint check', page: 'p.02' },
        { no: '02', title: 'Climb so far', page: 'p.03' },
        { no: '03', title: "Editor's note", page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'Climb so far',
        chart: {
          shape: 'area',
          caption:
            'Twelve mailboxes mid-build-up; trend is on track for the 80s next issue.',
          data: WARMTH_SERIES.slice(0, 4),
        },
      },
      {
        kind: 'summary',
        kicker: "Editor's note",
        headline: 'On schedule, no surprises',
        deck:
          'No mailbox stalled. The ladder is being followed and provider trust is accruing as modelled.',
        quote: 'Patience early is what makes the late build-up effortless.',
        figures: [
          { k: 'Avg warmth', v: '74' },
          { k: 'Mailboxes', v: '12' },
          { k: 'Stalled', v: '0' },
        ],
      },
    ],
  },
  {
    id: 'iss-6',
    edition: 'engagement',
    title: 'Opens & Replies Report',
    issueLine: 'Apr 2026 · Vol. 8',
    heroStat: '66%',
    heroLabel: 'open rate',
    dateStamp: 'Apr 12, 2026',
    mailboxes: 12,
    editionTag: EDITION_TAGS.engagement,
    pages: [
      CONTENTS_PAGE([
        { no: '01', title: 'Early interaction signal', page: 'p.02' },
        { no: '02', title: 'Mix this period', page: 'p.03' },
        { no: '03', title: 'Outlook', page: 'p.04' },
      ]),
      {
        kind: 'chart',
        kicker: 'Feature',
        headline: 'Interaction mix',
        chart: {
          shape: 'bar',
          caption:
            'Reply depth building steadily as warmup conversations mature.',
          data: ENGAGE_SERIES.map((d) => ({
            label: d.label,
            value: Math.max(3, d.value - 6),
          })),
        },
      },
      {
        kind: 'summary',
        kicker: 'Outlook',
        headline: 'Momentum is building',
        deck:
          'Opens and replies both improved over the prior issue. The conversation pattern is taking hold.',
        quote: 'Consistency turns a cold mailbox into a trusted sender.',
        figures: [
          { k: 'Open rate', v: '66%' },
          { k: 'Reply rate', v: '19%' },
          { k: 'Trend', v: 'Up' },
        ],
      },
    ],
  },
];

// Compose options.
const COMPOSE_PERIODS = ['Last 7 days', 'Last 30 days', 'This quarter'] as const;
type ComposePeriod = (typeof COMPOSE_PERIODS)[number];

const COMPOSE_HERO: Record<Edition, { stat: string; label: string }> = {
  warmth: { stat: '81', label: 'avg warmth score' },
  engagement: { stat: '71%', label: 'open rate' },
  placement: { stat: '93%', label: 'landed in inbox' },
  executive: { stat: '86', label: 'portfolio health' },
};

// ---------------------------------------------------------------------------
// Cover artwork — a glossy magazine cover
// ---------------------------------------------------------------------------

function IssueCover({
  edition,
  title,
  issueLine,
  heroStat,
  heroLabel,
  dateStamp,
  mailboxes,
  editionTag,
  compact,
}: {
  edition: Edition;
  title: string;
  issueLine: string;
  heroStat: string;
  heroLabel: string;
  dateStamp: string;
  mailboxes: number;
  editionTag: string;
  compact?: boolean;
}): JSX.Element {
  const meta = EDITIONS[edition];
  const Icon = meta.Icon;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border-muted bg-surface-2">
      {/* Masthead */}
      <div className="flex items-center justify-between border-b border-border-muted px-4 pt-3.5 pb-3">
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-[0.28em] ${meta.ink}`}
        >
          WarmPulse
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {issueLine}
        </span>
      </div>

      {/* Title block */}
      <div className="px-4 pt-4">
        <p
          className={`font-mono text-[10px] font-semibold uppercase tracking-[0.22em] ${meta.ink}`}
        >
          {meta.kicker}
        </p>
        <h3
          className={`mt-1.5 font-semibold leading-[1.05] tracking-tight text-text ${
            compact ? 'text-2xl' : 'text-3xl'
          }`}
        >
          {title}
        </h3>
      </div>

      {/* Hero stat — the cover's centrepiece */}
      <div className="flex flex-1 items-center gap-4 px-4 py-5">
        <span
          className={`flex flex-none items-center justify-center rounded-xl border border-border-muted bg-surface ${
            meta.ink
          } ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}
        >
          <Icon
            className={compact ? 'h-6 w-6' : 'h-8 w-8'}
            strokeWidth={1.6}
          />
        </span>
        <div className="min-w-0">
          <p
            className={`font-semibold tabular-nums leading-none text-text ${
              compact ? 'text-4xl' : 'text-5xl'
            }`}
          >
            {heroStat}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wide text-text-dim">
            {heroLabel}
          </p>
        </div>
      </div>

      {/* Cover lines / footer */}
      <div className="space-y-2 border-t border-border-muted px-4 py-3">
        <div className="flex items-center justify-between text-[11px] text-text-dim">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            {dateStamp}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            {mailboxes} mailboxes
          </span>
        </div>
        <Badge variant="neutral" className="font-mono uppercase tracking-wider">
          {editionTag}
        </Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spread pages — editorial layouts
// ---------------------------------------------------------------------------

function ContentsSpread({ page }: { page: SpreadPage }): JSX.Element {
  return (
    <div className="flex h-full flex-col px-7 py-6">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
        {page.kicker}
      </p>
      <h4 className="mt-1.5 text-3xl font-semibold tracking-tight text-text">
        {page.headline}
      </h4>
      <div className="mt-1 h-px w-full bg-border-muted" />
      <ul className="mt-5 space-y-4">
        {page.entries?.map((e) => (
          <li key={e.no} className="flex items-baseline gap-4">
            <span className={`font-mono text-sm font-bold ${EDITIONS.warmth.ink}`}>
              {e.no}
            </span>
            <span className="flex-1 text-[15px] font-medium leading-snug text-text">
              {e.title}
            </span>
            <span className="font-mono text-xs text-text-dim">{e.page}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-6 text-xs italic text-text-dim">
        Turn the page to read the feature.
      </p>
    </div>
  );
}

function ChartSpread({
  page,
  hex,
}: {
  page: SpreadPage;
  hex: string;
}): JSX.Element {
  const chart = page.chart;
  return (
    <div className="flex h-full flex-col px-7 py-6">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
        {page.kicker}
      </p>
      <h4 className="mt-1.5 text-2xl font-semibold tracking-tight text-text">
        {page.headline}
      </h4>
      {/* Fixed-height chart parent so ResponsiveContainer is stable. */}
      <div className="mt-4 h-[200px] w-full">
        {chart ? (
          <ResponsiveContainer width="100%" height="100%">
            {chart.shape === 'bar' ? (
              <BarChart
                data={chart.data}
                margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#8888a0', fontSize: 11 }}
                  axisLine={{ stroke: '#2a2a3a' }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#e8e8f0',
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chart.data.map((d) => (
                    <Cell key={d.label} fill={hex} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart
                data={chart.data}
                margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="rpt-mag-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={hex} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={hex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#8888a0', fontSize: 11 }}
                  axisLine={{ stroke: '#2a2a3a' }}
                  tickLine={false}
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
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={hex}
                  strokeWidth={2}
                  fill="url(#rpt-mag-area)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : null}
      </div>
      <p className="mt-auto border-t border-border-muted pt-4 text-[13px] leading-relaxed text-text-dim">
        <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${EDITIONS.placement.ink}`}>
          Caption&nbsp;—&nbsp;
        </span>
        {chart?.caption}
      </p>
    </div>
  );
}

function SummarySpread({ page }: { page: SpreadPage }): JSX.Element {
  return (
    <div className="flex h-full flex-col px-7 py-6">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
        {page.kicker}
      </p>
      <h4 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-text">
        {page.headline}
      </h4>
      <p className="mt-3 text-sm leading-relaxed text-text-dim">{page.deck}</p>
      <blockquote className="mt-4 flex gap-3 border-l-2 border-accent pl-4">
        <Quote className="h-4 w-4 flex-none text-accent" />
        <p className="text-[15px] font-medium italic leading-snug text-text">
          {page.quote}
        </p>
      </blockquote>
      <div className="mt-auto grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border-muted bg-border-muted pt-px">
        {page.figures?.map((f) => (
          <div key={f.k} className="bg-surface-2 px-3 py-3 text-center">
            <p className="text-xl font-semibold tabular-nums text-text">{f.v}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-text-dim">
              {f.k}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpreadPageBody({
  page,
  hex,
}: {
  page: SpreadPage;
  hex: string;
}): JSX.Element {
  if (page.kind === 'contents') return <ContentsSpread page={page} />;
  if (page.kind === 'chart') return <ChartSpread page={page} hex={hex} />;
  return <SummarySpread page={page} />;
}

// Page-turn variants. Using a Variants object with a custom resolver is the
// framer-motion-typed way to do directional transitions (inline function
// props on motion.div are not assignable to the target prop types).
const PAGE_TURN: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 60 : -60,
    rotateY: dir > 0 ? 8 : -8,
  }),
  center: { opacity: 1, x: 0, rotateY: 0 },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -60 : 60,
    rotateY: dir > 0 ? -8 : 8,
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRpt1Magazine(): JSX.Element {
  const [issues, setIssues] = useState<Issue[]>(MOCK_ISSUES);
  const [openId, setOpenId] = useState<string | null>(null);
  // Spread index: 0 = cover + first inner page, then steps through pages.
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<1 | -1>(1);

  // Compose-issue rail state.
  const [edition, setEdition] = useState<Edition>('warmth');
  const [period, setPeriod] = useState<ComposePeriod>('Last 30 days');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(MOCK_MAILBOXES.slice(0, 12).map((m) => m.id)),
  );
  const [justPublished, setJustPublished] = useState(false);

  const openIssue = useMemo(
    () => issues.find((i) => i.id === openId) ?? null,
    [issues, openId],
  );

  // A spread = a left page + a right page. Page 0 is the cover (left) paired
  // with pages[0] (right). Subsequent spreads pair consecutive inner pages.
  const totalSpreads = openIssue ? Math.ceil((openIssue.pages.length + 1) / 2) : 0;

  const composeMeta = EDITIONS[edition];
  const composeHero = COMPOSE_HERO[edition];

  const toggleMailbox = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const goSpread = (dir: 1 | -1) => {
    setTurn(dir);
    setSpread((s) => Math.min(totalSpreads - 1, Math.max(0, s + dir)));
  };

  const openReader = (id: string) => {
    setOpenId(id);
    setSpread(0);
    setTurn(1);
  };

  const publishIssue = () => {
    const meta = EDITIONS[edition];
    const periodLabel =
      period === 'This quarter' ? 'Q2 2026' : 'May 2026';
    const newIssue: Issue = {
      id: `iss-new-${Date.now()}`,
      edition,
      title: `${meta.label} Report`,
      issueLine: `${periodLabel} · Vol. ${issues.length + 1}`,
      heroStat: composeHero.stat,
      heroLabel: composeHero.label,
      dateStamp: 'May 18, 2026',
      mailboxes: selected.size,
      editionTag: EDITION_TAGS[edition],
      pages: [
        CONTENTS_PAGE([
          { no: '01', title: `${meta.label} at a glance`, page: 'p.02' },
          { no: '02', title: 'This period in numbers', page: 'p.03' },
          { no: '03', title: "Editor's summary", page: 'p.04' },
        ]),
        {
          kind: 'chart',
          kicker: 'Feature',
          headline: `${meta.label} this ${
            period === 'This quarter' ? 'quarter' : 'period'
          }`,
          chart: {
            shape: edition === 'engagement' || edition === 'placement' ? 'bar' : 'area',
            caption: `${meta.label} computed across ${selected.size} mailbox${
              selected.size === 1 ? '' : 'es'
            } for ${period.toLowerCase()}.`,
            data:
              edition === 'engagement'
                ? ENGAGE_SERIES
                : edition === 'placement'
                  ? PLACEMENT_SERIES
                  : edition === 'executive'
                    ? EXEC_SERIES
                    : WARMTH_SERIES,
          },
        },
        {
          kind: 'summary',
          kicker: "Editor's summary",
          headline: 'Freshly off the press',
          deck: `This ${meta.label.toLowerCase()} issue covers ${
            selected.size
          } mailboxes over ${period.toLowerCase()}.`,
          quote: 'Every issue is a snapshot of sender trust you can act on.',
          figures: [
            { k: composeHero.label, v: composeHero.stat },
            { k: 'Mailboxes', v: String(selected.size) },
            { k: 'Period', v: period.replace('Last ', '') },
          ],
        },
      ],
    };
    setIssues((prev) => [newIssue, ...prev]);
    setJustPublished(true);
    window.setTimeout(() => setJustPublished(false), 2600);
  };

  return (
    <div className="space-y-6">
      {/* ── Editorial page header / masthead ─────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="border-b-2 border-border-muted pb-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.34em] text-accent">
              WarmPulse Press
            </p>
            <h1 className="mt-1.5 font-semibold tracking-tight text-text text-[2rem] leading-none">
              The Report Magazine
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="orange">
              <Crown className="h-3 w-3" />
              Pro Plus
            </Badge>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-dim">
              {issues.length} issues on the stand
            </span>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-dim">
          Every report is published as an issue. Browse the newsstand, flip
          through a back issue, or compose the next edition from the desk.
        </p>
      </motion.header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ── Newsstand + reader ─────────────────────────────────────── */}
        <div className="xl:col-span-8">
          <AnimatePresence mode="wait">
            {!openIssue ? (
              /* NEWSSTAND — shelf grid of glossy covers */
              <motion.section
                key="newsstand"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <Library className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text">
                    On the newsstand
                  </h2>
                  <span className="ml-auto font-mono text-xs text-text-dim">
                    Tap a cover to read
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence initial={false}>
                    {issues.map((iss, i) => (
                      <motion.button
                        type="button"
                        key={iss.id}
                        layout
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{
                          duration: 0.4,
                          delay: i * 0.06,
                          ease: 'easeOut',
                        }}
                        whileHover={{ y: -8, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openReader(iss.id)}
                        className="h-[340px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <IssueCover {...iss} compact />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.section>
            ) : (
              /* READER — 2-page magazine spread with page-turn nav */
              <motion.section
                key="reader"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {/* Reader toolbar */}
                <div className="mb-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to stand
                  </button>
                  <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-text-dim">
                    <BookOpen className="h-3.5 w-3.5" />
                    {openIssue.title} · {openIssue.issueLine}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    aria-label="Close reader"
                    className="ml-auto rounded-lg border border-border-muted bg-surface-2 p-1.5 text-text-dim transition-colors hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* The spread — fixed height so the harness is stable */}
                <div className="relative h-[440px] overflow-hidden rounded-xl border border-border-muted bg-surface">
                  {/* Centre gutter / spine */}
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 hidden w-px -translate-x-1/2 bg-border-muted lg:block" />
                  <AnimatePresence mode="wait" custom={turn}>
                    <motion.div
                      key={spread}
                      custom={turn}
                      variants={PAGE_TURN}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      className="grid h-full grid-cols-1 lg:grid-cols-2"
                      style={{ transformPerspective: 1400 }}
                    >
                      {/* LEFT page */}
                      <div className="hidden h-full border-r border-border-muted lg:block">
                        {spread === 0 ? (
                          <div className="h-full p-4">
                            <IssueCover {...openIssue} />
                          </div>
                        ) : (
                          (() => {
                            const leftPage =
                              openIssue.pages[spread * 2 - 1] ??
                              openIssue.pages[openIssue.pages.length - 1];
                            if (!leftPage) {
                              return (
                                <div className="flex h-full items-center justify-center text-text-dim">
                                  <BookOpen className="h-8 w-8" />
                                </div>
                              );
                            }
                            return (
                              <SpreadPageBody
                                page={leftPage}
                                hex={EDITIONS[openIssue.edition].hex}
                              />
                            );
                          })()
                        )}
                      </div>
                      {/* RIGHT page */}
                      <div className="h-full">
                        {(() => {
                          const rightIdx = spread === 0 ? 0 : spread * 2;
                          const page = openIssue.pages[rightIdx];
                          if (!page) {
                            return (
                              <div className="flex h-full flex-col items-center justify-center gap-2 text-text-dim">
                                <BookOpen className="h-8 w-8" />
                                <p className="font-mono text-xs uppercase tracking-wider">
                                  End of issue
                                </p>
                                <p className="text-xs">Thanks for reading.</p>
                              </div>
                            );
                          }
                          return (
                            <SpreadPageBody
                              page={page}
                              hex={EDITIONS[openIssue.edition].hex}
                            />
                          );
                        })()}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Page-turn controls + dots */}
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goSpread(-1)}
                    disabled={spread === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalSpreads }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to spread ${i + 1}`}
                        onClick={() => {
                          setTurn(i >= spread ? 1 : -1);
                          setSpread(i);
                        }}
                        className={`h-1.5 rounded-full transition-all ${
                          i === spread
                            ? 'w-7 bg-accent'
                            : 'w-1.5 bg-border-muted hover:bg-text-dim'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => goSpread(1)}
                    disabled={spread >= totalSpreads - 1}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* ── Compose new issue — editorial desk rail ─────────────────── */}
        <div className="xl:col-span-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
            className="rounded-xl border border-border-muted bg-surface"
          >
            <div className="flex items-center gap-2 border-b border-border-muted px-5 py-4">
              <PenSquare className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text">
                Compose new issue
              </h2>
            </div>

            <div className="space-y-5 p-5">
              {/* Edition picker */}
              <section className="space-y-2">
                <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                  Edition
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(EDITIONS) as Edition[]).map((e) => {
                    const m = EDITIONS[e];
                    const EIcon = m.Icon;
                    const active = edition === e;
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEdition(e)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2 text-text-dim hover:bg-surface-2/70'
                        }`}
                      >
                        <EIcon
                          className={`h-3.5 w-3.5 flex-none ${
                            active ? m.ink : 'text-text-dim'
                          }`}
                        />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Period */}
              <section className="space-y-2">
                <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                  Period
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {COMPOSE_PERIODS.map((p) => {
                    const active = period === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2 text-text-dim hover:bg-surface-2/70'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Mailboxes */}
              <section className="space-y-2">
                <label className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                  <span>Mailboxes</span>
                  <span className="text-accent">
                    {selected.size}/{MOCK_MAILBOXES.length}
                  </span>
                </label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {MOCK_MAILBOXES.map((m) => {
                    const on = selected.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMailbox(m.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          on
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2 text-text-dim hover:bg-surface-2/70'
                        }`}
                      >
                        {m.email.split('@')[0]}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Live mini cover — updates as selections change */}
              <section className="space-y-2">
                <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                  Live cover preview
                </label>
                <div className="h-[300px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${edition}-${period}-${selected.size}`}
                      initial={{ opacity: 0, scale: 0.97, rotateX: 6 }}
                      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="h-full"
                      style={{ transformPerspective: 900 }}
                    >
                      <IssueCover
                        edition={edition}
                        title={`${composeMeta.label} Report`}
                        issueLine={`${
                          period === 'This quarter' ? 'Q2 2026' : 'May 2026'
                        } · Vol. ${issues.length + 1}`}
                        heroStat={composeHero.stat}
                        heroLabel={composeHero.label}
                        dateStamp="May 18, 2026"
                        mailboxes={selected.size}
                        editionTag={EDITION_TAGS[edition]}
                        compact
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </section>

              {/* Publish */}
              <button
                type="button"
                onClick={publishIssue}
                disabled={selected.size === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <ArrowRight className="h-4 w-4" />
                Publish issue
              </button>

              <AnimatePresence>
                {justPublished ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent"
                  >
                    <CheckCircle2 className="h-4 w-4 flex-none" />
                    <span>
                      New {composeMeta.label} issue is on the newsstand.
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default ProPlusRpt1Magazine;
