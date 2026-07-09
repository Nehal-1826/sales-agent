import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Mail,
  Minus,
  Radar,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

/**
 * ProPlusDashN2Briefing — "Daily Briefing" Pro-Plus dashboard.
 *
 * NOT a dashboard of charts. This is an assistant-style morning briefing the
 * way you'd read an email digest:
 *
 *   1. NARRATIVE — a large natural-language status headline that summarizes
 *      the whole workspace in prose (no gauge, no KPI band).
 *   2. TRIAGE QUEUE — a prioritized action list rendered like an inbox: each
 *      row is one plain-English "insight" with a severity rail (good / watch /
 *      act), a one-line finding, a suggested-action chip, and a click-to-
 *      expand detail that reveals a micro-stat or tiny chart.
 *   3. BY THE NUMBERS — a slim, secondary digest strip at the bottom. Compact
 *      on purpose; it is not the focus.
 *
 * Deliberately distinct from the five existing layouts: it has no warmth
 * gauge + corner tiles (Starter Focus), no command bar + telemetry rail
 * (Command Center), no asymmetric bento grid (Bento), no KPI band + big
 * charts + leaderboard (Analytics Cockpit), and no oversized numeral + hero
 * chart (Editorial). The reading order is prose → triage list → minimal
 * numbers — an inbox you work top-down, not a grid you scan.
 *
 * Fully STANDALONE — no network, router or query hooks; no required props.
 * Every value comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Severity = 'good' | 'watch' | 'act';

type DetailKind = 'spark' | 'bars' | 'stat';

interface DetailStat {
  label: string;
  value: string;
}

interface InsightDetail {
  /** Sentence that expands on the headline finding. */
  body: string;
  kind: DetailKind;
  /** Small numeric series for the micro-chart (spark / bars). */
  series?: number[];
  /** Two or three quick read-out stats shown alongside the chart. */
  stats: DetailStat[];
}

interface Insight {
  id: string;
  severity: Severity;
  /** Short routing tag, e.g. the mailbox or signal source. */
  tag: string;
  /** One-line plain-English finding. */
  finding: string;
  /** Suggested next action rendered as a chip. */
  action: string;
  /** Minutes since this insight was raised (digest freshness). */
  minutesAgo: number;
  detail: InsightDetail;
}

interface DigestStat {
  key: string;
  label: string;
  value: string;
  delta: number;
  deltaUnit: string;
  /** Falling delta is the good direction (spam / complaint style). */
  invert?: boolean;
}

interface BriefingData {
  /** "Good morning" etc. — time-of-day greeting line. */
  greeting: string;
  /** Prose status summary, rendered large. */
  narrative: string;
  generatedAt: string;
  mailboxCount: number;
  avgWarmth: number;
  warmthDelta: number;
  actCount: number;
  watchCount: number;
  goodCount: number;
  insights: Insight[];
  digest: DigestStat[];
  footnote: string;
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (15 mailboxes, avg warmth ~84 +3/wk)
// ---------------------------------------------------------------------------

const MOCK: BriefingData = {
  greeting: 'Good morning',
  narrative:
    'Your 15 mailboxes are warming well — average warmth 84, up 3 this week. 13 are at full sending pace and inbox delivery is holding above 94%. 2 mailboxes need a look this morning, and Google Postmaster trust just moved to High across your Gmail domains.',
  generatedAt: 'today, 7:02 AM',
  mailboxCount: 15,
  avgWarmth: 84,
  warmthDelta: 3,
  actCount: 2,
  watchCount: 3,
  goodCount: 3,
  insights: [
    {
      id: 'i1',
      severity: 'act',
      tag: 'sales@acme.io',
      finding: 'Warmth dipped 6 points over 3 days — the send window looks too tight.',
      action: 'Review send window',
      minutesAgo: 18,
      detail: {
        body: 'sales@acme.io fell from 90 to 84 since Friday. Sends are bunching into a 90-minute window, which reads as bursty to Outlook. Widening the daily window to 6+ hours typically recovers this within 4 days.',
        kind: 'spark',
        series: [90, 90, 89, 88, 86, 85, 84, 84],
        stats: [
          { label: 'Warmth', value: '84 (−6)' },
          { label: 'Send window', value: '1h 30m' },
          { label: 'Suggested', value: '6h+' },
        ],
      },
    },
    {
      id: 'i2',
      severity: 'act',
      tag: 'acme.co domain',
      finding: 'DMARC policy is weak (p=none) on 1 domain — enforcement is recommended.',
      action: 'Strengthen DMARC',
      minutesAgo: 42,
      detail: {
        body: 'acme.co publishes DMARC at p=none, so failing mail is monitored but never quarantined. SPF and DKIM both pass, so moving to p=quarantine is low-risk and lifts domain trust with all three mailbox providers.',
        kind: 'stat',
        stats: [
          { label: 'SPF', value: 'Pass' },
          { label: 'DKIM', value: 'Pass' },
          { label: 'DMARC', value: 'p=none' },
        ],
      },
    },
    {
      id: 'i3',
      severity: 'watch',
      tag: 'Microsoft SNDS',
      finding: 'Complaint rate is trending up — 0.08% to 0.14% over the last week.',
      action: 'Monitor 48h',
      minutesAgo: 65,
      detail: {
        body: 'SNDS still reads green and you are well under the 0.30% hard threshold, but the 7-day slope is upward. No action needed yet — if it crosses 0.20% the engine will auto-slow-down the affected Outlook mailboxes.',
        kind: 'spark',
        series: [0.08, 0.09, 0.09, 0.11, 0.12, 0.13, 0.14],
        stats: [
          { label: 'Current', value: '0.14%' },
          { label: 'Threshold', value: '0.30%' },
          { label: 'Status', value: 'Green' },
        ],
      },
    },
    {
      id: 'i4',
      severity: 'watch',
      tag: 'growth@acme.io',
      finding: 'Reply rate from helpers slipped to 19% — below the 24% workspace mean.',
      action: 'Vary content mix',
      minutesAgo: 88,
      detail: {
        body: 'growth@acme.io is early in its build-up (day 13) so some softness is expected, but helper replies are lagging similar-age mailboxes. Enabling a wider thread-template mix usually pulls this back toward the workspace mean within a week.',
        kind: 'bars',
        series: [22, 21, 20, 21, 19, 19],
        stats: [
          { label: 'Reply rate', value: '19%' },
          { label: 'Workspace', value: '24%' },
          { label: 'Build-up day', value: '13 / 29' },
        ],
      },
    },
    {
      id: 'i5',
      severity: 'watch',
      tag: 'Daily limit',
      finding: '648 of 840 warmup sends placed so far — pacing is slightly behind plan.',
      action: 'No action needed',
      minutesAgo: 96,
      detail: {
        body: 'The engine front-loads sends across the active window, so 77% by mid-morning is normal. Projected end-of-day total is 838 / 840. This row is informational and will clear itself this evening.',
        kind: 'bars',
        series: [560, 590, 610, 631, 648],
        stats: [
          { label: 'Sent', value: '648' },
          { label: 'Target', value: '840' },
          { label: 'Projected', value: '838' },
        ],
      },
    },
    {
      id: 'i6',
      severity: 'good',
      tag: 'Google Postmaster',
      finding: 'Gmail domain trust moved Medium → High and has held 6 days.',
      action: 'View Postmaster',
      minutesAgo: 130,
      detail: {
        body: 'All 6 Gmail mailboxes now report High domain trust with a 0.06% spam rate — comfortably below the 0.30% line. This is the strongest inbox-delivery signal Gmail exposes; keep the current sending pace steady.',
        kind: 'spark',
        series: [62, 66, 71, 78, 84, 88, 92],
        stats: [
          { label: 'Trust', value: 'High' },
          { label: 'Spam rate', value: '0.06%' },
          { label: 'Held', value: '6 days' },
        ],
      },
    },
    {
      id: 'i7',
      severity: 'good',
      tag: 'Inbox test',
      finding: 'Latest seed test landed 27 / 30 in the inbox — a healthy result.',
      action: 'View full report',
      minutesAgo: 165,
      detail: {
        body: '27 of 30 seed messages reached the primary inbox, 2 went to Promotions and 1 to Spam. That is a 90% inbox rate, up from 85% on the previous run — consistent with the warmth climb across the workspace.',
        kind: 'bars',
        series: [25, 25, 26, 26, 27],
        stats: [
          { label: 'Inbox', value: '27 / 30' },
          { label: 'Promotions', value: '2' },
          { label: 'Spam', value: '1' },
        ],
      },
    },
    {
      id: 'i8',
      severity: 'good',
      tag: 'Helper network',
      finding: '12 helper inboxes live and engaging — 0 deactivations in the last 24h.',
      action: 'No action needed',
      minutesAgo: 210,
      detail: {
        body: 'The helper group serving this workspace is fully healthy: 12 active inboxes, average trust score 0.91, and no helpers fell below the 0.30 deactivation floor in the last health sweep. Signal coverage across Gmail / Outlook / Yahoo is balanced.',
        kind: 'stat',
        stats: [
          { label: 'Active helpers', value: '12' },
          { label: 'Avg trust', value: '0.91' },
          { label: 'Deactivated 24h', value: '0' },
        ],
      },
    },
  ],
  digest: [
    { key: 'warmth', label: 'Avg warmth', value: '84', delta: 3, deltaUnit: 'wk' },
    { key: 'inbox', label: 'Where emails land', value: '94.2%', delta: 2.6, deltaUnit: 'pts wk' },
    { key: 'sent', label: 'Sent today', value: '648', delta: 62, deltaUnit: 'vs avg' },
    { key: 'reply', label: 'Reply rate', value: '26%', delta: 1.7, deltaUnit: 'pts wk' },
    { key: 'spam', label: 'Spam rate', value: '1.1%', delta: -0.7, deltaUnit: 'pts wk', invert: true },
    { key: 'active', label: 'Mailboxes warming', value: '13 / 15', delta: 1, deltaUnit: 'vs wk' },
  ],
  footnote:
    'Briefing compiled from warmth logs, Google Postmaster and Microsoft SNDS · refreshed hourly · 15 mailboxes',
};

// ---------------------------------------------------------------------------
// Severity styling + format helpers
// ---------------------------------------------------------------------------

const HEX = {
  good: '#F26522',
  watch: '#ffd54f',
  act: '#ff6b4a',
} as const;

const SEVERITY_META: Record<
  Severity,
  {
    label: string;
    Icon: typeof ShieldCheck;
    rail: string;
    text: string;
    dotBg: string;
    chip: string;
    hex: string;
  }
> = {
  good: {
    label: 'On track',
    Icon: CheckCircle2,
    rail: 'bg-accent',
    text: 'text-accent',
    dotBg: 'bg-accent/10',
    chip: 'border-accent/30 text-accent hover:bg-accent/10',
    hex: HEX.good,
  },
  watch: {
    label: 'Keep an eye',
    Icon: Clock,
    rail: 'bg-accent4',
    text: 'text-accent4',
    dotBg: 'bg-accent4/10',
    chip: 'border-accent4/30 text-accent4 hover:bg-accent4/10',
    hex: HEX.watch,
  },
  act: {
    label: 'Needs action',
    Icon: AlertTriangle,
    rail: 'bg-accent3',
    text: 'text-accent3',
    dotBg: 'bg-accent3/10',
    chip: 'border-accent3/30 text-accent3 hover:bg-accent3/10',
    hex: HEX.act,
  },
};

const SEVERITY_RANK: Record<Severity, number> = { act: 0, watch: 1, good: 2 };

function fmtAgo(min: number): string {
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

const ENTRANCE = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashN2Briefing(): JSX.Element {
  const d = MOCK;

  const ordered = useMemo(
    () =>
      [...d.insights].sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.minutesAgo - b.minutesAgo,
      ),
    [d.insights],
  );

  // First action item starts expanded so the briefing opens "in progress".
  const firstAct = ordered.find((i) => i.severity === 'act');
  const [openId, setOpenId] = useState<string | null>(firstAct?.id ?? null);

  return (
    <div className="mx-auto max-w-4xl pb-6">
      {/* ---- 1 · Narrative headline ----------------------------------- */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: ENTRANCE }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
            <Sun className="h-3.5 w-3.5 text-accent4" />
            Daily briefing
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-0.5 text-xs font-medium text-accent3">
            <Sparkles className="h-3 w-3" />
            Pro Plus
          </span>
        </div>

        <h1 className="mt-5 text-balance text-[1.55rem] font-semibold leading-snug tracking-tight text-text sm:text-[1.9rem]">
          {d.greeting}.
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: ENTRANCE, delay: 0.12 }}
          className="mt-3 max-w-3xl text-pretty text-[15px] leading-relaxed text-text-dim sm:text-base"
        >
          {d.narrative}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-dim"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent3" aria-hidden />
            {d.actCount} need action
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent4" aria-hidden />
            {d.watchCount} to watch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {d.goodCount} on track
          </span>
          <span className="text-border-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Compiled {d.generatedAt}
          </span>
        </motion.div>
      </motion.header>

      {/* ---- 2 · Prioritized triage queue ----------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ENTRANCE, delay: 0.3 }}
        className="mt-9"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-text-dim">
            What to look at
          </h2>
          <span className="text-xs tabular-nums text-text-dim">
            {ordered.length} items · sorted by priority
          </span>
        </div>

        <ul className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
          {ordered.map((item, i) => (
            <InsightRow
              key={item.id}
              item={item}
              index={i}
              isLast={i === ordered.length - 1}
              open={openId === item.id}
              onToggle={() =>
                setOpenId((cur) => (cur === item.id ? null : item.id))
              }
            />
          ))}
        </ul>
      </motion.section>

      {/* ---- 3 · By the numbers (slim, secondary) --------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: ENTRANCE, delay: 0.42 }}
        className="mt-8"
      >
        <h2 className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-text-dim">
          By the numbers
        </h2>
        <div className="flex flex-wrap divide-x divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface/40">
          {d.digest.map((s, i) => (
            <DigestCell key={s.key} stat={s} index={i} />
          ))}
        </div>
        <p className="mt-4 text-xs tracking-wide text-text-dim">
          {d.footnote}
        </p>
      </motion.section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Triage row — inbox-style item with click-to-expand detail
// ---------------------------------------------------------------------------

function InsightRow({
  item,
  index,
  isLast,
  open,
  onToggle,
}: {
  item: Insight;
  index: number;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = SEVERITY_META[item.severity];
  const SeverityIcon = meta.Icon;

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: ENTRANCE, delay: 0.34 + index * 0.06 }}
      className={isLast ? '' : 'border-b border-white/5'}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/40 sm:px-5"
      >
        {/* severity rail */}
        <span
          className={`h-9 w-1 shrink-0 rounded-full ${meta.rail}`}
          aria-hidden
        />

        {/* severity glyph */}
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.dotBg} ${meta.text}`}
        >
          <SeverityIcon className="h-4 w-4" />
        </span>

        {/* finding + tag */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium text-text">
              {item.tag}
            </span>
            <span
              className={`text-[0.65rem] font-medium uppercase tracking-wider ${meta.text}`}
            >
              {meta.label}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-text-dim">
            {item.finding}
          </span>
        </span>

        {/* suggested-action chip */}
        <span
          className={`hidden shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors sm:inline-flex ${meta.chip}`}
        >
          {item.action}
          <ArrowRight className="h-3 w-3" />
        </span>

        {/* freshness + expand caret */}
        <span className="flex shrink-0 items-center gap-2 text-text-dim">
          <span className="hidden text-xs tabular-nums md:inline">
            {fmtAgo(item.minutesAgo)}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            className="grid h-6 w-6 place-items-center"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </span>
      </button>

      {/* expandable detail */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: ENTRANCE }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 bg-surface-2/30 px-4 pb-5 pt-4 sm:px-5 sm:pl-[4.4rem]">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <p className="text-sm leading-relaxed text-text-dim lg:col-span-7">
                  {item.detail.body}
                </p>
                <div className="lg:col-span-5">
                  <DetailVisual detail={item.detail} hex={meta.hex} />
                </div>
              </div>
              <div className="mt-4 sm:hidden">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.chip}`}
                >
                  {item.action}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Detail visual — micro-chart or stat read-out depending on insight kind
// ---------------------------------------------------------------------------

function DetailVisual({
  detail,
  hex,
}: {
  detail: InsightDetail;
  hex: string;
}) {
  const series = useMemo(
    () => (detail.series ?? []).map((v, i) => ({ i, v })),
    [detail.series],
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-muted bg-surface/50 p-3.5">
      {detail.kind !== 'stat' && series.length > 0 ? (
        <div className="h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {detail.kind === 'spark' ? (
              <AreaChart
                data={series}
                margin={{ top: 4, right: 2, bottom: 0, left: 2 }}
              >
                <defs>
                  <linearGradient
                    id={`brief-${hex.slice(1)}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={hex} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={hex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: '#2a2a3a', strokeWidth: 1 }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '4px 8px',
                  }}
                  labelFormatter={() => ''}
                  formatter={(val: number | string) => [String(val), '']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={hex}
                  strokeWidth={2}
                  fill={`url(#brief-${hex.slice(1)})`}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  animationDuration={700}
                />
              </AreaChart>
            ) : (
              <BarChart
                data={series}
                margin={{ top: 4, right: 2, bottom: 0, left: 2 }}
              >
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '4px 8px',
                  }}
                  labelFormatter={() => ''}
                  formatter={(val: number | string) => [String(val), '']}
                />
                <Bar
                  dataKey="v"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={16}
                  animationDuration={700}
                >
                  {series.map((s) => (
                    <Cell key={s.i} fill={hex} fillOpacity={0.55} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        {detail.stats.map((st) => (
          <div key={st.label} className="min-w-0">
            <dt className="truncate text-[0.65rem] uppercase tracking-wider text-text-dim">
              {st.label}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-text">
              {st.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Digest cell — compact secondary number
// ---------------------------------------------------------------------------

function DigestCell({ stat, index }: { stat: DigestStat; index: number }) {
  const good = stat.invert ? stat.delta < 0 : stat.delta > 0;
  const flat = stat.delta === 0;
  const DeltaIcon = flat ? Minus : stat.delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaTone = flat
    ? 'text-text-dim'
    : good
      ? 'text-accent'
      : 'text-accent3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: ENTRANCE, delay: 0.46 + index * 0.04 }}
      className="min-w-[8.5rem] flex-1 px-4 py-3"
    >
      <p className="text-[0.65rem] uppercase tracking-wider text-text-dim">
        {stat.label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums leading-none text-text">
        {stat.value}
      </p>
      <span
        className={`mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
      >
        <DeltaIcon className="h-3 w-3" />
        {Math.abs(stat.delta)} {stat.deltaUnit}
      </span>
    </motion.div>
  );
}

// Icons referenced only via meta maps / props — keep imports stable so a later
// refactor of the maps doesn't trip the tree-shaker / unused-import lint.
void [Inbox, Mail, Radar];

export default ProPlusDashN2Briefing;
