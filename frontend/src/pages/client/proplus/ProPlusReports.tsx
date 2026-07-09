import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  CalendarRange,
  Check,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Mail,
  Send,
  Sparkles,
  Target,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatNumber } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProPlusReports — "Report Studio" Pro-Plus-tier section design.
 *
 * STANDALONE: renders prop-less with inline MOCK data for the isolated
 * preview harness (no network / router / query hooks). The harness supplies
 * the shell + sidebar; this component renders page content only.
 *
 * Layout:
 *   ┌── header band (title + Pro Plus badge + live chip) ──────────────┐
 *   ┌── studio grid (lg:grid-cols-12) ────────────────────────────────┐
 *   │  ┌── left: "Build a report" config panel (col-span-5) ──┐       │
 *   │  │   report type · format · range · mailboxes · schedule │       │
 *   │  └───────────────────────────────────────────────────────┘       │
 *   │  ┌── right: live-preview cover (col-span-7) ────────────┐        │
 *   │  │   reacts to config — headline stat, animated bar      │        │
 *   │  │   chart, stats row, N-days footer                     │        │
 *   │  └───────────────────────────────────────────────────────┘       │
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌── recently generated list ──┐ ┌── scheduled reports panel ──┐
 *
 * The live preview is driven by LOCAL STATE: changing the report type
 * recomputes the headline (warmth → avg warmth, engagement → open rate,
 * placement → inbox %) plus the trend bars from per-type mock series.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportType = 'warmth' | 'engagement' | 'placement';
type ReportFormat = 'pdf' | 'csv';
type Schedule = 'once' | 'weekly' | 'monthly';

interface MockMailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
}

interface RecentReport {
  id: string;
  type: ReportType;
  format: ReportFormat;
  filename: string;
  range: string;
  createdAt: string;
  sizeKb: number;
}

interface MockSchedule {
  id: string;
  type: ReportType;
  frequency: 'weekly' | 'monthly';
  recipients: string[];
  nextRun: string;
}

interface TypeStats {
  /** Headline number shown big on the cover. */
  hero: string;
  heroLabel: string;
  /** 14-bucket normalised (0..100) trend for the cover bar chart. */
  bars: number[];
  totalSent: number;
  openPct: number;
  replyPct: number;
  inboxPct: number;
  days: number;
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-Plus numbers, fully inline
// ---------------------------------------------------------------------------

const REPORT_TYPE_META: Record<
  ReportType,
  { label: string; tone: 'green' | 'blue' | 'yellow'; Icon: LucideIcon; blurb: string }
> = {
  warmth: {
    label: 'Warmth',
    tone: 'green',
    Icon: Sparkles,
    blurb: 'Sender-trust build-up & warmth score trend',
  },
  engagement: {
    label: 'Opens & replies',
    tone: 'blue',
    Icon: BarChart3,
    blurb: 'Opens, replies & interaction depth',
  },
  placement: {
    label: 'Where emails land',
    tone: 'yellow',
    Icon: Target,
    blurb: 'Inbox vs Promotions vs Spam landing',
  },
};

const MOCK_MAILBOXES: MockMailbox[] = [
  { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail' },
  { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook' },
  { id: 'mb-3', email: 'success@acme.io', provider: 'gmail' },
  { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp' },
  { id: 'mb-5', email: 'team@acme.co', provider: 'yahoo' },
];

// Per-type 14-day raw series → the preview samples + normalises these so each
// report type produces a genuinely different cover.
const SERIES: Record<ReportType, number[]> = {
  warmth: [58, 60, 61, 63, 64, 67, 68, 70, 72, 74, 76, 78, 79, 81],
  engagement: [54, 57, 55, 60, 62, 61, 65, 67, 66, 70, 71, 73, 72, 75],
  placement: [82, 84, 83, 86, 87, 88, 89, 90, 90, 91, 92, 92, 93, 93],
};

const TYPE_FIGURES: Record<
  ReportType,
  { hero: string; heroLabel: string; totalSent: number; openPct: number; replyPct: number; inboxPct: number }
> = {
  warmth: { hero: '81', heroLabel: 'avg warmth', totalSent: 1284, openPct: 71, replyPct: 24, inboxPct: 92 },
  engagement: { hero: '71%', heroLabel: 'open rate', totalSent: 1284, openPct: 71, replyPct: 24, inboxPct: 92 },
  placement: { hero: '93%', heroLabel: 'inbox', totalSent: 1284, openPct: 71, replyPct: 24, inboxPct: 93 },
};

const MOCK_RECENT: RecentReport[] = [
  {
    id: 'r-1',
    type: 'warmth',
    format: 'pdf',
    filename: 'warmpulse-warmth-2026-05-16.pdf',
    range: 'Apr 17 → May 16',
    createdAt: '14h ago',
    sizeKb: 248,
  },
  {
    id: 'r-2',
    type: 'engagement',
    format: 'csv',
    filename: 'warmpulse-engagement-2026-05-12.csv',
    range: 'May 05 → May 12',
    createdAt: '5d ago',
    sizeKb: 41,
  },
  {
    id: 'r-3',
    type: 'placement',
    format: 'pdf',
    filename: 'warmpulse-placement-2026-05-09.pdf',
    range: 'Apr 09 → May 09',
    createdAt: '8d ago',
    sizeKb: 312,
  },
  {
    id: 'r-4',
    type: 'warmth',
    format: 'csv',
    filename: 'warmpulse-warmth-2026-05-01.csv',
    range: 'Apr 01 → May 01',
    createdAt: '16d ago',
    sizeKb: 58,
  },
];

const MOCK_SCHEDULES: MockSchedule[] = [
  {
    id: 's-1',
    type: 'warmth',
    frequency: 'weekly',
    recipients: ['founder@acme.io', 'ops@acme.io'],
    nextRun: 'Mon, May 19 · 08:00',
  },
  {
    id: 's-2',
    type: 'placement',
    frequency: 'monthly',
    recipients: ['founder@acme.io'],
    nextRun: 'Jun 01 · 08:00',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Downsample a raw series into N buckets normalised to 0..100. */
function sampleBars(vals: number[], buckets = 14): number[] {
  if (vals.length === 0) return [];
  const max = Math.max(...vals, 1);
  const out: number[] = [];
  const step = vals.length / buckets;
  for (let i = 0; i < buckets; i += 1) {
    const v = vals[Math.min(vals.length - 1, Math.floor(i * step))] ?? 0;
    out.push(Math.round((v / max) * 100));
  }
  return out;
}

function rangeForSchedule(s: Schedule): { days: number; label: string } {
  const days = s === 'weekly' ? 7 : s === 'monthly' ? 30 : 30;
  // Fixed anchor so the standalone harness renders deterministically.
  const to = new Date('2026-05-17');
  const from = new Date(to);
  from.setDate(to.getDate() - days);
  const fmt = (d: Date) => formatDate(d);
  return { days, label: `${fmt(from)} → ${fmt(to)}` };
}

const PROVIDER_LETTER: Record<MockMailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const TONE_TEXT: Record<'green' | 'blue' | 'yellow', string> = {
  green: 'text-accent',
  blue: 'text-accent2',
  yellow: 'text-accent4',
};

const TONE_BAR: Record<'green' | 'blue' | 'yellow', string> = {
  green: '#F26522',
  blue: '#FF8A4B',
  yellow: '#ffd54f',
};

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusReports(): JSX.Element {
  const [type, setType] = useState<ReportType>('warmth');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [schedule, setSchedule] = useState<Schedule>('weekly');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(MOCK_MAILBOXES.map((m) => m.id)),
  );
  const [generated, setGenerated] = useState(false);

  const meta = REPORT_TYPE_META[type];
  const Icon = meta.Icon;
  const { days, label: rangeLabel } = useMemo(
    () => rangeForSchedule(schedule),
    [schedule],
  );

  const toggleMb = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The cover is a genuine reaction to the selected report type — headline
  // stat + trend recomputed from the per-type mock series.
  const stats: TypeStats = useMemo(() => {
    const fig = TYPE_FIGURES[type];
    return {
      hero: fig.hero,
      heroLabel: fig.heroLabel,
      bars: sampleBars(SERIES[type], 14),
      totalSent: fig.totalSent,
      openPct: fig.openPct,
      replyPct: fig.replyPct,
      inboxPct: fig.inboxPct,
      days,
    };
  }, [type, days]);

  const chartData = useMemo(
    () => stats.bars.map((v, i) => ({ i, v })),
    [stats.bars],
  );

  const previewKey = `${type}-${format}-${schedule}-${selected.size}`;
  const hasMailboxes = selected.size > 0;

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Report studio
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Compose an inbox-delivery report, watch the cover update live, then
            generate or schedule it.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">{MOCK_MAILBOXES.length} mailboxes</span>
          <span className="text-border-muted">·</span>
          <span>{MOCK_SCHEDULES.length} schedules live</span>
        </div>
      </motion.header>

      {/* Studio: config (left) + live preview (right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ---- Config panel ---- */}
        <motion.div {...fade(0.05)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-5 p-5">
              <header className="space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Wand2 className="h-3.5 w-3.5" />
                  Build a report
                </span>
                <h2 className="text-base font-semibold text-text">
                  Configure &amp; preview
                </h2>
              </header>

              {/* Report type */}
              <section className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Report type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(REPORT_TYPE_META) as ReportType[]).map((t) => {
                    const m = REPORT_TYPE_META[t];
                    const TIcon = m.Icon;
                    const active = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setType(t);
                          setGenerated(false);
                        }}
                        className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                          active
                            ? 'border-accent bg-accent/10'
                            : 'border-border-muted bg-surface-2/40 hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface ${TONE_TEXT[m.tone]}`}
                        >
                          <TIcon className="h-3.5 w-3.5" />
                        </span>
                        <span
                          className={`text-sm font-semibold ${active ? 'text-text' : 'text-text-dim'}`}
                        >
                          {m.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-text-dim">{meta.blurb}</p>
              </section>

              {/* Format */}
              <section className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: 'pdf' as const, Icon: FileText, sub: 'Polished for sharing' },
                      { v: 'csv' as const, Icon: FileSpreadsheet, sub: 'Crunch the numbers' },
                    ]
                  ).map(({ v, Icon: FIcon, sub }) => {
                    const active = format === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setFormat(v);
                          setGenerated(false);
                        }}
                        className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                          active
                            ? 'border-accent bg-accent/10'
                            : 'border-border-muted bg-surface-2/40 hover:bg-surface-2'
                        }`}
                      >
                        <FIcon
                          className={`h-4 w-4 flex-none ${active ? 'text-accent' : 'text-text-dim'}`}
                        />
                        <span className="min-w-0">
                          <span
                            className={`block text-sm font-semibold ${active ? 'text-text' : 'text-text-dim'}`}
                          >
                            {v.toUpperCase()}
                          </span>
                          <span className="block text-xs text-text-dim">{sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Range (derived from schedule) */}
              <section className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Date range
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5 text-sm">
                  <CalendarRange className="h-4 w-4 flex-none text-accent" />
                  <span className="font-medium text-text">Last {days} days</span>
                  <span className="ml-auto text-xs text-text-dim">{rangeLabel}</span>
                </div>
              </section>

              {/* Mailboxes */}
              <section className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
                  <Users className="h-3.5 w-3.5" />
                  Mailboxes ({selected.size}/{MOCK_MAILBOXES.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {MOCK_MAILBOXES.map((m) => {
                    const checked = selected.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMb(m.id)}
                        className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs transition-colors ${
                          checked
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                            checked ? 'bg-accent text-bg' : 'bg-surface text-text-dim'
                          }`}
                        >
                          {PROVIDER_LETTER[m.provider]}
                        </span>
                        {m.email.split('@')[0]}
                        {checked ? <Check className="h-3 w-3 text-accent" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Schedule */}
              <section className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-text-dim">
                  Schedule
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { v: 'once' as const, label: 'One-off' },
                      { v: 'weekly' as const, label: 'Weekly' },
                      { v: 'monthly' as const, label: 'Monthly' },
                    ]
                  ).map(({ v, label }) => {
                    const active = schedule === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setSchedule(v);
                          setGenerated(false);
                        }}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-text'
                            : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!hasMailboxes}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2/80 disabled:opacity-50"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email to me
                </button>
                <button
                  type="button"
                  disabled={!hasMailboxes}
                  onClick={() => setGenerated(true)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Generate now
                </button>
              </div>

              <AnimatePresence>
                {generated ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent"
                  >
                    <Check className="h-3.5 w-3.5 flex-none" strokeWidth={2.6} />
                    <span>
                      {meta.label} {format.toUpperCase()} ready —{' '}
                      <span className="font-semibold underline">download</span>.
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {/* ---- Live preview cover ---- */}
        <motion.div {...fade(0.1)} className="lg:col-span-7">
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-4 p-5">
              <header className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  Live preview
                </span>
                <span className="font-mono text-xs text-text-dim">
                  {format.toUpperCase()} · {schedule}
                </span>
              </header>

              <AnimatePresence mode="wait">
                <motion.div
                  key={previewKey}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden rounded-xl border border-border-muted bg-surface-2/40"
                >
                  {/* Cover band */}
                  <div className="border-b border-border-muted bg-surface-2/60 px-6 py-5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
                      WarmPulse · Report
                    </span>
                    <h3 className="mt-1 text-xl font-semibold text-text">
                      {meta.label} report
                    </h3>
                    <p className="mt-0.5 text-xs text-text-dim">
                      {rangeLabel} · {selected.size} mailbox
                      {selected.size === 1 ? '' : 'es'}
                    </p>
                  </div>

                  {/* Hero stat */}
                  <div className="flex items-center gap-5 px-6 py-6">
                    <span
                      className={`flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-surface ${TONE_TEXT[meta.tone]}`}
                    >
                      <Icon className="h-8 w-8" strokeWidth={1.6} />
                    </span>
                    <div>
                      <motion.p
                        key={stats.hero}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-4xl font-semibold tabular-nums leading-none text-text"
                      >
                        {stats.hero}
                      </motion.p>
                      <p className="mt-1.5 text-sm text-text-dim">{stats.heroLabel}</p>
                    </div>
                    <div className="ml-auto hidden text-right sm:block">
                      <p className="flex items-center justify-end gap-1.5 text-sm font-medium text-accent">
                        <Gauge className="h-4 w-4" />
                        healthy
                      </p>
                      <p className="mt-1 text-xs text-text-dim">
                        {stats.days} days of data
                      </p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-px border-y border-border-muted bg-border-muted sm:grid-cols-4">
                    {[
                      { k: 'Sent', v: formatNumber(stats.totalSent) },
                      { k: 'Opened', v: `${stats.openPct}%` },
                      { k: 'Replied', v: `${stats.replyPct}%` },
                      { k: 'Inbox', v: `${stats.inboxPct}%` },
                    ].map((s) => (
                      <div key={s.k} className="bg-surface-2/40 px-4 py-3">
                        <p className="text-lg font-semibold tabular-nums text-text">
                          {s.v}
                        </p>
                        <p className="text-xs text-text-dim">{s.k}</p>
                      </div>
                    ))}
                  </div>

                  {/* Animated trend bar chart */}
                  <div className="px-6 py-5">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      {meta.label} trend · {stats.days}d
                    </p>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                        >
                          <XAxis dataKey="i" hide />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                            contentStyle={{
                              background: '#12121a',
                              border: '1px solid #2a2a3a',
                              borderRadius: 8,
                              fontSize: 12,
                              color: '#e8e8f0',
                            }}
                            labelFormatter={() => meta.label}
                            formatter={(v: number) => [v, 'index']}
                          />
                          <Bar
                            dataKey="v"
                            radius={[3, 3, 0, 0]}
                            isAnimationActive
                            animationDuration={700}
                          >
                            {chartData.map((d) => (
                              <Cell key={d.i} fill={TONE_BAR[meta.tone]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Cover footer */}
                  <div className="flex items-center justify-between border-t border-border-muted px-6 py-3 text-xs text-text-dim">
                    <span>WarmPulse · generated 2026-05-17</span>
                    <span>Cover preview</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recently generated + Scheduled */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.16)} className="lg:col-span-7">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  <FileText className="h-4 w-4 text-accent" />
                  Recently generated
                </span>
                <span className="font-mono text-xs text-text-dim">
                  last {MOCK_RECENT.length}
                </span>
              </header>
              <ul className="divide-y divide-border-muted">
                {MOCK_RECENT.map((r, i) => {
                  const m = REPORT_TYPE_META[r.type];
                  const TIcon = m.Icon;
                  return (
                    <motion.li
                      key={r.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.2 + i * 0.05 }}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/50"
                    >
                      <span
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-2 ${TONE_TEXT[m.tone]}`}
                      >
                        <TIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-text">
                          {r.filename}
                        </p>
                        <p className="text-xs text-text-dim">
                          {m.label} · {r.range} · {r.createdAt} ·{' '}
                          {r.sizeKb >= 1024
                            ? `${(r.sizeKb / 1024).toFixed(1)} MB`
                            : `${r.sizeKb} KB`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-2/80"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.2)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  <Clock className="h-4 w-4 text-accent" />
                  Scheduled reports
                </span>
                <Badge variant="green">{MOCK_SCHEDULES.length} active</Badge>
              </header>
              <ul className="divide-y divide-border-muted">
                {MOCK_SCHEDULES.map((s, i) => {
                  const m = REPORT_TYPE_META[s.type];
                  const TIcon = m.Icon;
                  return (
                    <motion.li
                      key={s.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.24 + i * 0.06 }}
                      className="space-y-2 px-5 py-4"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-surface-2 ${TONE_TEXT[m.tone]}`}
                        >
                          <TIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text">
                            {m.label} digest
                          </p>
                          <p className="text-xs capitalize text-text-dim">
                            {s.frequency} · next {s.nextRun}
                          </p>
                        </div>
                        <Badge variant={s.frequency === 'weekly' ? 'blue' : 'yellow'}>
                          {s.frequency}
                        </Badge>
                      </div>
                      <p className="pl-10 text-xs text-text-dim">
                        To: {s.recipients.join(', ')}
                      </p>
                    </motion.li>
                  );
                })}
              </ul>
              <div className="border-t border-border-muted px-5 py-3">
                <button
                  type="button"
                  className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
                >
                  + Add a schedule
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default ProPlusReports;
