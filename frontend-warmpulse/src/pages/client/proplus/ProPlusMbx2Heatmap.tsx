import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Flame,
  Gauge,
  Mail,
  Send,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * ProPlusMbx2Heatmap — "Fleet heatmap matrix" for the Pro Plus tier
 * (up to 15 inboxes).
 *
 * DELIBERATELY a different paradigm from the other three mailbox views:
 *   - StarterMailboxes  → split-pane (identity rail + tabbed detail pane)
 *   - ProMailboxes      → single-mailbox carousel hero + thumbnail strip
 *   - ProPlusMailboxes  → responsive grid of mailbox cards w/ sparklines
 *   - THIS               → a GitHub-contributions-style calendar MATRIX:
 *       ROWS    = mailboxes (provider glyph + email + live warmth chip)
 *       COLUMNS = the last 30 days
 *       CELL    = a small rounded square tinted by that mailbox's warmth
 *                 that day. Dense, scannable fleet-health calendar.
 *
 * A compact summary header (active count, avg warmth, fleet trend arrow),
 * a cold→warm legend, hover tooltips per cell (date / warmth / sends), and
 * a row click that expands a slim inline detail strip (bigger 30-day trend
 * + a few stats) directly beneath the clicked row.
 *
 * Fully STANDALONE — no network / router / query hooks, no required props.
 * Everything comes from the inline MOCK so the preview harness can mount it
 * prop-less. Renders only the page content; the app shell supplies chrome.
 *
 * Styling uses existing Tailwind tokens only. The heatmap colour scale is
 * built purely from `accent` at five opacity tiers (no new colour literals);
 * paused mailboxes render their cells as a flat muted surface.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type Status = 'active' | 'warming' | 'paused';

interface DayCell {
  /** ISO yyyy-mm-dd for the tooltip. */
  date: string;
  /** 0–100 warmth for that day (drives the cell tint). */
  warmth: number;
  /** Warmup sends that day (tooltip detail). */
  sends: number;
}

interface MailboxRow {
  id: string;
  email: string;
  provider: Provider;
  status: Status;
  /** Current (today's) warmth — the chip on the left of the row. */
  warmth: number;
  /** 30-day warmth series, oldest → newest. */
  series: DayCell[];
}

const DAYS = 30;
const MAX_MAILBOXES = 15;

// ---------------------------------------------------------------------------
// Mock data — 13 mailboxes, each a deterministic but varied 30-day series so
// the matrix shows a real gradient. Avg current warmth lands ~84.
// ---------------------------------------------------------------------------

/** Days back from "today" (mock anchor) → ISO date string. */
function isoDaysAgo(back: number): string {
  // Fixed anchor so the mock is fully deterministic across renders/SSR.
  const anchor = Date.UTC(2026, 4, 18); // 2026-05-18
  const d = new Date(anchor - back * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a 30-day warmth ramp that ENDS at `end` and started ~`climb` points
 * lower, with a deterministic wobble seeded by `seed` so every mailbox row
 * has its own texture (some dip mid-ramp, some climb steadily).
 */
function buildSeries(end: number, climb: number, seed: number): DayCell[] {
  const start = Math.max(4, end - climb);
  return Array.from({ length: DAYS }, (_, i) => {
    const t = i / (DAYS - 1);
    const base = start + (end - start) * t;
    // Two out-of-phase sines + a slow sag give organic, non-repeating texture.
    const wobble =
      Math.sin(i * 0.55 + seed) * 3.4 +
      Math.sin(i * 0.21 + seed * 1.7) * 2.1 -
      Math.sin(t * Math.PI) * 2.0;
    const warmth = Math.round(Math.max(0, Math.min(100, base + wobble)));
    // Sends scale with warmth-driven ramp progress (≈ up to ~70/day).
    const sends = Math.max(0, Math.round((warmth / 100) * 70 - 4 + Math.sin(i + seed) * 3));
    return { date: isoDaysAgo(DAYS - 1 - i), warmth, sends };
  });
}

const MOCK: MailboxRow[] = [
  { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail', status: 'active', warmth: 93, series: buildSeries(93, 34, 1) },
  { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook', status: 'active', warmth: 90, series: buildSeries(90, 30, 2) },
  { id: 'mb-3', email: 'success@acme.io', provider: 'gmail', status: 'active', warmth: 88, series: buildSeries(88, 28, 3) },
  { id: 'mb-4', email: 'partnerships@acme.io', provider: 'outlook', status: 'active', warmth: 86, series: buildSeries(86, 36, 4) },
  { id: 'mb-5', email: 'team@acme.io', provider: 'gmail', status: 'active', warmth: 91, series: buildSeries(91, 31, 5) },
  { id: 'mb-6', email: 'hello@acme.co', provider: 'smtp', status: 'active', warmth: 87, series: buildSeries(87, 40, 6) },
  { id: 'mb-7', email: 'support@acme.co', provider: 'yahoo', status: 'warming', warmth: 78, series: buildSeries(78, 44, 7) },
  { id: 'mb-8', email: 'careers@acme.io', provider: 'outlook', status: 'active', warmth: 84, series: buildSeries(84, 33, 8) },
  { id: 'mb-9', email: 'growth@acme.io', provider: 'gmail', status: 'warming', warmth: 71, series: buildSeries(71, 50, 9) },
  { id: 'mb-10', email: 'billing@acme.co', provider: 'smtp', status: 'active', warmth: 82, series: buildSeries(82, 38, 10) },
  { id: 'mb-11', email: 'press@acme.co', provider: 'yahoo', status: 'warming', warmth: 66, series: buildSeries(66, 54, 11) },
  { id: 'mb-12', email: 'invoices@acme.co', provider: 'smtp', status: 'paused', warmth: 58, series: buildSeries(58, 22, 12) },
  { id: 'mb-13', email: 'notify@acme.io', provider: 'gmail', status: 'active', warmth: 89, series: buildSeries(89, 29, 13) },
];

// ---------------------------------------------------------------------------
// Warmth → colour scale (accent at five opacity tiers — no colour literals)
// ---------------------------------------------------------------------------

interface Tier {
  /** Tailwind utility for the cell fill. */
  fill: string;
  /** Legend / label text. */
  label: string;
  /** Inclusive lower bound on warmth. */
  min: number;
}

// Cold → warm. All tiers are the SAME accent hue at rising opacity, so the
// matrix reads as a single-hue heatmap without introducing new colours.
const TIERS: Tier[] = [
  { min: 85, fill: 'bg-accent', label: '85+' },
  { min: 70, fill: 'bg-accent/70', label: '70–84' },
  { min: 50, fill: 'bg-accent/45', label: '50–69' },
  { min: 30, fill: 'bg-accent/25', label: '30–49' },
  { min: 0, fill: 'bg-accent/10', label: '<30' },
];

function tierFor(warmth: number): Tier {
  for (const t of TIERS) if (warmth >= t.min) return t;
  return TIERS[TIERS.length - 1]!;
}

/** Paused mailboxes render flat & muted regardless of warmth. */
const PAUSED_CELL = 'bg-surface-2';

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

const STATUS_BADGE: Record<Status, { label: string; variant: 'green' | 'yellow' | 'orange' }> = {
  active: { label: 'Active', variant: 'green' },
  warming: { label: 'Warming', variant: 'yellow' },
  paused: { label: 'Paused', variant: 'orange' },
};

function warmthTone(w: number): string {
  if (w >= 85) return 'text-accent';
  if (w >= 70) return 'text-accent4';
  return 'text-accent3';
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return formatDate(d);
}

// ---------------------------------------------------------------------------
// Hover tooltip state (single floating node, positioned at the pointer)
// ---------------------------------------------------------------------------

interface HoverInfo {
  email: string;
  date: string;
  warmth: number;
  sends: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusMbx2Heatmap(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const summary = useMemo(() => {
    const active = MOCK.filter((m) => m.status !== 'paused').length;
    const avg = Math.round(MOCK.reduce((a, m) => a + m.warmth, 0) / MOCK.length);
    // Fleet trend = avg(today) − avg(7 days ago) across all rows.
    const idx7 = DAYS - 8;
    const avgNow =
      MOCK.reduce((a, m) => a + m.series[DAYS - 1]!.warmth, 0) / MOCK.length;
    const avgThen =
      MOCK.reduce((a, m) => a + m.series[idx7]!.warmth, 0) / MOCK.length;
    const trend = Math.round((avgNow - avgThen) * 10) / 10;
    const sendsToday = MOCK.reduce(
      (a, m) => a + (m.status === 'paused' ? 0 : m.series[DAYS - 1]!.sends),
      0,
    );
    return { active, avg, trend, sendsToday };
  }, []);

  // Sparse column ruler — a label every ~5 days so the 30-col grid stays
  // legible without crowding. Newest column is always labelled "Today".
  const colLabels = useMemo(() => {
    const ref = MOCK[0]!.series;
    return ref.map((c, i) => {
      const fromEnd = DAYS - 1 - i;
      if (fromEnd === 0) return 'Today';
      if (fromEnd % 5 === 0) return fmtDate(c.date);
      return '';
    });
  }, []);

  const trendUp = summary.trend > 0;
  const trendFlat = summary.trend === 0;

  return (
    <div className="space-y-5" onMouseLeave={() => setHover(null)}>
      {/* ---- Header + compact summary ---- */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Fleet heatmap
            </h1>
            <Badge variant="orange">
              {MOCK.length} of {MAX_MAILBOXES}
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Every mailbox, every day — {DAYS}-day warmth at a glance. Click a
            row for its trend.
          </p>
        </div>

        <div className="flex items-stretch gap-2.5">
          <SummaryStat
            icon={<Flame className="h-4 w-4" />}
            label="Active"
            value={`${summary.active}/${MOCK.length}`}
          />
          <SummaryStat
            icon={<Gauge className="h-4 w-4" />}
            label="Avg warmth"
            value={String(summary.avg)}
          />
          <SummaryStat
            icon={<Send className="h-4 w-4" />}
            label="Sends today"
            value={String(summary.sendsToday)}
          />
          <SummaryStat
            icon={
              trendFlat ? (
                <ArrowRight className="h-4 w-4" />
              ) : trendUp ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )
            }
            label="Fleet trend 7d"
            value={`${trendUp ? '+' : ''}${summary.trend}`}
            valueClass={
              trendFlat
                ? 'text-text-dim'
                : trendUp
                  ? 'text-accent'
                  : 'text-accent3'
            }
          />
        </div>
      </motion.header>

      {/* ---- Matrix ---- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
        className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-surface/60 backdrop-blur-xl"
      >
        <div className="overflow-x-auto">
          {/* min-w keeps cells crisp; container scrolls on narrow screens. */}
          <div className="min-w-[760px]">
            {/* Column ruler */}
            <div className="flex items-end gap-3 px-4 pb-2 pt-4">
              <div className="w-[208px] shrink-0 text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Mailbox
              </div>
              <div className="flex flex-1 gap-[3px]">
                {colLabels.map((lbl, i) => (
                  <div
                    key={i}
                    className="flex-1 text-center text-[9px] leading-none text-text-dim/70"
                  >
                    {lbl}
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/[0.06]" />

            {/* Rows */}
            <div>
              {MOCK.map((m, rowIdx) => {
                const isOpen = openId === m.id;
                return (
                  <div key={m.id}>
                    <motion.button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : m.id)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: 0.3,
                        delay: 0.12 + rowIdx * 0.035,
                      }}
                      className={`group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/[0.025] ${
                        isOpen ? 'bg-white/[0.035]' : ''
                      }`}
                      aria-expanded={isOpen}
                    >
                      {/* Row identity */}
                      <div className="flex w-[208px] shrink-0 items-center gap-2.5">
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 text-xs font-semibold text-text"
                          aria-hidden
                        >
                          {PROVIDER_LETTER[m.provider]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-tight text-text">
                            {m.email}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-text-dim">
                            {PROVIDER_LABEL[m.provider]}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            m.status === 'paused'
                              ? 'text-text-dim'
                              : warmthTone(m.warmth)
                          }`}
                          title="Current warmth"
                        >
                          {m.warmth}
                        </span>
                      </div>

                      {/* Day cells */}
                      <div className="flex flex-1 gap-[3px]">
                        {m.series.map((cell, ci) => {
                          const paused = m.status === 'paused';
                          const fill = paused
                            ? PAUSED_CELL
                            : tierFor(cell.warmth).fill;
                          return (
                            <motion.span
                              key={cell.date}
                              initial={{ opacity: 0, scale: 0.4 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{
                                duration: 0.26,
                                ease: 'easeOut',
                                // Row-by-row, then left→right within the row.
                                delay:
                                  0.18 + rowIdx * 0.035 + ci * 0.006,
                              }}
                              onMouseEnter={(e) =>
                                setHover({
                                  email: m.email,
                                  date: cell.date,
                                  warmth: cell.warmth,
                                  sends: cell.sends,
                                  x: e.clientX,
                                  y: e.clientY,
                                })
                              }
                              onMouseMove={(e) =>
                                setHover((h) =>
                                  h
                                    ? { ...h, x: e.clientX, y: e.clientY }
                                    : h,
                                )
                              }
                              className={`h-[18px] flex-1 rounded-[3px] ${fill} ring-1 ring-inset ring-white/[0.04] transition-transform duration-150 hover:scale-[1.35] hover:ring-white/30`}
                            />
                          );
                        })}
                      </div>
                    </motion.button>

                    {/* Inline detail strip */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <DetailStrip
                          m={m}
                          onClose={() => setOpenId(null)}
                        />
                      )}
                    </AnimatePresence>

                    {rowIdx < MOCK.length - 1 && (
                      <div className="mx-4 h-px bg-white/[0.04]" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
              <span className="text-[11px] text-text-dim">
                Each square = one day · click a row to expand
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-dim">Cold</span>
                {[...TIERS].reverse().map((t) => (
                  <span
                    key={t.label}
                    className={`h-3 w-3 rounded-[3px] ${t.fill} ring-1 ring-inset ring-white/[0.06]`}
                    title={`Warmth ${t.label}`}
                  />
                ))}
                <span className="text-[11px] text-text-dim">Warm</span>
                <span className="ml-2 flex items-center gap-1.5 text-[11px] text-text-dim">
                  <span
                    className={`h-3 w-3 rounded-[3px] ${PAUSED_CELL} ring-1 ring-inset ring-white/[0.06]`}
                  />
                  Paused
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---- Floating cell tooltip ---- */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed',
              left: hover.x + 14,
              top: hover.y + 14,
              pointerEvents: 'none',
              zIndex: 50,
            }}
            className="rounded-lg border border-border-muted bg-surface px-3 py-2 shadow-glass"
          >
            <p className="text-[11px] font-medium text-text">{hover.email}</p>
            <p className="text-[11px] text-text-dim">{fmtDate(hover.date)}</p>
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              <span className={warmthTone(hover.warmth)}>
                Warmth {hover.warmth}
              </span>
              <span className="text-text-dim">{hover.sends} sends</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryStat({
  icon,
  label,
  value,
  valueClass = 'text-text',
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface/50 px-3.5 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-accent">
        {icon}
      </span>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <p className={`text-base font-semibold leading-tight tabular-nums ${valueClass}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function DetailStrip({
  m,
  onClose,
}: {
  m: MailboxRow;
  onClose: () => void;
}) {
  const chartData = m.series.map((c) => ({
    date: fmtDate(c.date),
    warmth: c.warmth,
  }));

  const first = m.series[0]!.warmth;
  const last = m.series[DAYS - 1]!.warmth;
  const delta = last - first;
  const peak = m.series.reduce((a, c) => Math.max(a, c.warmth), 0);
  const totalSends = m.series.reduce((a, c) => a + c.sends, 0);
  const status = STATUS_BADGE[m.status];

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="mx-4 mb-2 mt-1 grid gap-4 rounded-lg border border-white/[0.07] bg-surface-2/40 p-4 lg:grid-cols-[1fr_240px]">
        {/* Trend chart */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium text-text">
                {DAYS}-day warmth — {m.email}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-md text-text-dim transition-colors hover:bg-white/[0.06] hover:text-text"
              aria-label="Collapse detail"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Fixed-height parent so ResponsiveContainer can fill it. */}
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
              >
                <defs>
                  <linearGradient
                    id={`mbx2-grad-${m.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#8888a0' }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#8888a0' }}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
                <Tooltip
                  cursor={{ stroke: '#8888a0', strokeDasharray: '3 3' }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#8888a0' }}
                  itemStyle={{ color: '#e8e8f0' }}
                />
                <Area
                  type="monotone"
                  dataKey="warmth"
                  className="text-accent"
                  stroke="currentColor"
                  strokeWidth={2}
                  fill={`url(#mbx2-grad-${m.id})`}
                  isAnimationActive
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats column */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              Status
            </span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <DetailMetric label="Current warmth" value={String(last)} />
          <DetailMetric
            label="30-day change"
            value={`${delta >= 0 ? '+' : ''}${delta}`}
            valueClass={
              delta > 0
                ? 'text-accent'
                : delta < 0
                  ? 'text-accent3'
                  : 'text-text'
            }
          />
          <DetailMetric label="Peak warmth" value={String(peak)} />
          <DetailMetric
            label="Sends (30d)"
            value={formatNumber(totalSends)}
          />
          <button
            type="button"
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface/60 px-3 py-2 text-xs font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
          >
            <Mail className="h-3.5 w-3.5" />
            Open mailbox
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function DetailMetric({
  label,
  value,
  valueClass = 'text-text',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface/50 px-3 py-2">
      <span className="text-[11px] text-text-dim">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

export default ProPlusMbx2Heatmap;
