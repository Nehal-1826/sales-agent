import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gauge,
  Inbox,
  Mail,
  Minus,
  Radar,
  Reply,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { ComboChartWp } from '@/components/charts/recharts/ComboChartWp';
import { StackedAreaChartWp } from '@/components/charts/recharts/StackedAreaChartWp';
import { GroupedBarChartWp } from '@/components/charts/recharts/GroupedBarChartWp';
import { DonutChartWp, type DonutDatum } from '@/components/charts/recharts/DonutChartWp';
import { chartTheme } from '@/components/charts/theme';
import { formatDate } from '@/lib/format';

/**
 * ProPlusDashV3Analytics — "Analytics Cockpit / BI" Pro-Plus dashboard variant.
 *
 * A chart-dominant, analyst-grade BI surface for the Pro Plus tier. Renders
 * fully STANDALONE off the inline MOCK const (no network / router / query /
 * props) so the isolated preview harness can mount it by name. Emits only the
 * page body — the app shell supplies sidebar + chrome.
 *
 * Layout (top → bottom):
 *   1. Header band — title + Pro Plus badge + live peer-network chip
 *   2. Deliverability KPI band — 5 metric tiles with animated progress
 *   3. Hero combo — full-width 30-day warmth line + daily volume bars
 *   4. Placement stacked-area (8 cols) + provider donut (4 cols)
 *   5. Engagement grouped-bar (7 cols) + top-mailbox leaderboard (5 cols)
 *   6. Pro-Plus external-signals row — Postmaster domain-reputation trend +
 *      SNDS complaint-rate trend as live mini-charts (the Pro Plus moat)
 *
 * Reused chart wrappers (all take direct data props, no fetching):
 *   ChartContainer · ComboChartWp · StackedAreaChartWp · GroupedBarChartWp ·
 *   DonutChartWp. The two external-signal mini-charts compose recharts
 *   directly (custom) since they need reference lines + bespoke gradients.
 * Every recharts surface lives in a fixed-height parent with a
 * width=100%/height=100% ResponsiveContainer — never aspect-based.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';

interface WarmthVolumeRow extends Record<string, unknown> {
  date: string;
  warmth: number;
  volume: number;
}

interface PlacementRow extends Record<string, unknown> {
  date: string;
  inbox: number;
  promotions: number;
  spam: number;
}

interface EngagementRow extends Record<string, unknown> {
  day: string;
  sent: number;
  opens: number;
  replies: number;
}

interface LeaderboardRow {
  id: string;
  email: string;
  provider: Provider;
  warmth: number;
  delta: number;
  inboxPct: number;
  sentToday: number;
  dailyTarget: number;
  day: number;
}

interface Kpi {
  key: string;
  label: string;
  value: string;
  delta: number;
  deltaSuffix: string;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4';
  Icon: typeof Mail;
  progress: number;
  /** When true a falling delta is the good direction (bounce / spam). */
  invert?: boolean;
}

interface ReputationRow extends Record<string, unknown> {
  date: string;
  /** Postmaster domain reputation, 0..100 (High ≥ 80, Medium 55–79). */
  reputation: number;
}

interface ComplaintRow extends Record<string, unknown> {
  date: string;
  /** SNDS complaint rate, %. Gmail/Outlook hard threshold = 0.30%. */
  complaint: number;
}

interface DashboardData {
  avgWarmth: number;
  warmthDelta: number;
  mailboxCount: number;
  activeCount: number;
  sentToday: number;
  sentTarget: number;
  kpis: Kpi[];
  warmthVolume: WarmthVolumeRow[];
  placement: PlacementRow[];
  engagement: EngagementRow[];
  providerSplit: DonutDatum[];
  leaderboard: LeaderboardRow[];
  reputation: ReputationRow[];
  complaints: ComplaintRow[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-Plus numbers for the preview harness
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 30-day warmth ramp 62 → 87 + matching daily volume 280 → 720, jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 62 + t * 25 + Math.sin(i * 0.8) * 2.1;
    const volume = 280 + t * 440 + Math.sin(i * 1.3) * 34;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

/** 14-day placement — inbox climbs into the low-90s, spam decays toward ~1.5%. */
function buildPlacement(): PlacementRow[] {
  return Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const spam = Math.max(1.3, 7.2 - t * 5.3 + Math.sin(i * 1.1) * 0.5);
    const promotions = Math.max(3.2, 8.6 - t * 3.2 + Math.cos(i * 0.9) * 0.6);
    const inbox = Math.max(0, 100 - spam - promotions);
    return {
      date: isoMinusDays(13 - i),
      inbox: Math.round(inbox * 10) / 10,
      promotions: Math.round(promotions * 10) / 10,
      spam: Math.round(spam * 10) / 10,
    };
  });
}

/** 7-day engagement — sends/opens/replies per day across the workspace. */
function buildEngagement(): EngagementRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const sent = 560 + i * 22 + Math.round(Math.sin(i * 1.4) * 26);
    const opens = Math.round(sent * (0.67 + i * 0.011));
    const replies = Math.round(sent * (0.23 + i * 0.007));
    return { day: isoMinusDays(6 - i), sent, opens, replies };
  });
}

/** 30-day Postmaster domain reputation, ramping 64 → 91 (jittered, capped). */
function buildReputation(): ReputationRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const reputation = 64 + t * 27 + Math.sin(i * 0.9) * 1.8;
    return {
      date: isoMinusDays(29 - i),
      reputation: Math.round(Math.max(0, Math.min(100, reputation)) * 10) / 10,
    };
  });
}

/** 30-day SNDS complaint rate %, decaying 0.34 → 0.06 below the 0.30 line. */
function buildComplaints(): ComplaintRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const complaint = Math.max(0.04, 0.34 - t * 0.28 + Math.sin(i * 1.2) * 0.02);
    return {
      date: isoMinusDays(29 - i),
      complaint: Math.round(complaint * 1000) / 1000,
    };
  });
}

const MOCK: DashboardData = {
  avgWarmth: 83,
  warmthDelta: 2.6,
  mailboxCount: 15,
  activeCount: 13,
  sentToday: 612,
  sentTarget: 825,
  kpis: [
    {
      key: 'inbox',
      label: 'Where emails land',
      value: '93.4%',
      delta: 2.8,
      deltaSuffix: 'pts wk',
      tone: 'accent',
      Icon: Inbox,
      progress: 93,
    },
    {
      key: 'bounce',
      label: 'Failure rate',
      value: '0.5%',
      delta: -0.3,
      deltaSuffix: 'pts wk',
      tone: 'accent2',
      Icon: TrendingDown,
      progress: 5,
      invert: true,
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: '1.4%',
      delta: -0.9,
      deltaSuffix: 'pts wk',
      tone: 'accent3',
      Icon: ShieldCheck,
      progress: 14,
      invert: true,
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: '26.1%',
      delta: 1.6,
      deltaSuffix: 'pts wk',
      tone: 'accent4',
      Icon: Reply,
      progress: 26,
    },
    {
      key: 'warmth',
      label: 'Avg warmth',
      value: '83',
      delta: 2.6,
      deltaSuffix: 'pts wk',
      tone: 'accent',
      Icon: Gauge,
      progress: 83,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  placement: buildPlacement(),
  engagement: buildEngagement(),
  providerSplit: [
    { name: 'Gmail', value: 6, color: chartTheme.palette[0] },
    { name: 'Outlook', value: 5, color: chartTheme.palette[1] },
    { name: 'SMTP', value: 3, color: chartTheme.palette[4] },
    { name: 'Yahoo', value: 1, color: chartTheme.palette[3] },
  ],
  leaderboard: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 91,
      delta: 1.4,
      inboxPct: 95.6,
      sentToday: 68,
      dailyTarget: 75,
      day: 28,
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 88,
      delta: 2.2,
      inboxPct: 94.1,
      sentToday: 64,
      dailyTarget: 70,
      day: 26,
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      warmth: 85,
      delta: 1.9,
      inboxPct: 93.0,
      sentToday: 58,
      dailyTarget: 65,
      day: 24,
    },
    {
      id: 'mb-4',
      email: 'partnerships@acme.io',
      provider: 'outlook',
      warmth: 82,
      delta: 3.1,
      inboxPct: 92.2,
      sentToday: 52,
      dailyTarget: 60,
      day: 21,
    },
    {
      id: 'mb-5',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 71,
      delta: -1.3,
      inboxPct: 88.4,
      sentToday: 31,
      dailyTarget: 45,
      day: 11,
    },
  ],
  reputation: buildReputation(),
  complaints: buildComplaints(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(v: unknown): string {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return formatDate(d);
}

function fmtPercent(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function fmtInt(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n));
}

function fmtRep(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(0);
}

function fmtComplaint(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

function warmthColor(score: number): string {
  if (score < 40) return chartTheme.colors.danger;
  if (score < 70) return chartTheme.colors.warning;
  return chartTheme.colors.primary;
}

const TONE_TEXT: Record<Kpi['tone'], string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

const TONE_BAR: Record<Kpi['tone'], string> = {
  accent: 'bg-accent',
  accent2: 'bg-accent2',
  accent3: 'bg-accent3',
  accent4: 'bg-accent4',
};

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, ease: 'easeOut' as const, delay },
});

const TOOLTIP_STYLE = {
  background: chartTheme.tooltip.background,
  border: `1px solid ${chartTheme.tooltip.border}`,
  borderRadius: 10,
  fontSize: 12,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashV3Analytics(): JSX.Element {
  const d = MOCK;

  const providerTotal = useMemo(
    () =>
      d.providerSplit.reduce(
        (acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0),
        0,
      ),
    [d.providerSplit],
  );
  const ranked = useMemo(
    () => [...d.leaderboard].sort((a, b) => b.warmth - a.warmth),
    [d.leaderboard],
  );
  const repLatest = d.reputation[d.reputation.length - 1]?.reputation ?? 0;
  const repFirst = d.reputation[0]?.reputation ?? 0;
  const repDelta = Math.round((repLatest - repFirst) * 10) / 10;
  const complaintLatest =
    d.complaints[d.complaints.length - 1]?.complaint ?? 0;
  const complaintFirst = d.complaints[0]?.complaint ?? 0;
  const complaintDelta =
    Math.round((complaintLatest - complaintFirst) * 1000) / 1000;

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
              Analytics cockpit
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Inbox delivery, warmth and external signal across{' '}
            {d.mailboxCount} mailboxes · {d.sentToday}/{d.sentTarget} sent
            today.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">
            {d.activeCount}/{d.mailboxCount} warming
          </span>
          <span className="text-border-muted">·</span>
          <span>Postmaster + SNDS live</span>
        </div>
      </motion.header>

      {/* Deliverability KPI band */}
      <motion.div
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        {d.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </motion.div>

      {/* Hero combo — warmth line + volume bars */}
      <motion.div {...fade(0.1)}>
        <ChartContainer
          title="Warmth & sending volume"
          subtitle="30-day workspace warmth (line, left axis) vs daily warmup sends (bars, right axis)."
          actions={
            <span className="flex items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-1 text-xs text-text-dim">
              <TrendingUp className="h-3 w-3 text-accent" />
              30d
            </span>
          }
          height={340}
        >
          <ComboChartWp<WarmthVolumeRow>
            data={d.warmthVolume}
            xKey="date"
            series={[
              {
                key: 'volume',
                name: 'Daily sends',
                type: 'bar',
                color: chartTheme.colors.secondary,
                yAxis: 'right',
              },
              {
                key: 'warmth',
                name: 'Avg warmth',
                type: 'line',
                color: chartTheme.colors.primary,
                yAxis: 'left',
              },
            ]}
            xFormatter={fmtDate}
            valueFormatter={(v, name) =>
              name === 'Avg warmth' ? fmtInt(v) : `${fmtInt(v)} sent`
            }
            height={300}
          />
        </ChartContainer>
      </motion.div>

      {/* Placement stacked-area + provider donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.15)} className="lg:col-span-8">
          <ChartContainer
            title="Where emails land over time"
            subtitle="Share of warmup mail landing in Inbox vs Promotions vs Spam (last 14 days)."
            height={320}
          >
            <StackedAreaChartWp<PlacementRow>
              data={d.placement}
              xKey="date"
              series={[
                {
                  key: 'inbox',
                  name: 'Inbox',
                  color: chartTheme.colors.primary,
                },
                {
                  key: 'promotions',
                  name: 'Promotions',
                  color: chartTheme.colors.warning,
                },
                {
                  key: 'spam',
                  name: 'Spam',
                  color: chartTheme.colors.danger,
                },
              ]}
              gradientIdPrefix="ppd3-placement"
              xFormatter={fmtDate}
              valueFormatter={(v) => fmtPercent(v)}
              yDomain={[0, 100]}
              height={280}
            />
          </ChartContainer>
        </motion.div>
        <motion.div {...fade(0.18)} className="lg:col-span-4">
          <ChartContainer
            title="Sending by provider"
            subtitle="Mailbox distribution across ESPs."
            height={320}
          >
            <DonutChartWp
              data={d.providerSplit.filter((s) => s.value > 0)}
              height={280}
              centerLabel={String(providerTotal)}
              centerSubLabel="mailboxes"
              valueFormatter={(v, name) => `${String(name)}: ${fmtInt(v)}`}
            />
          </ChartContainer>
        </motion.div>
      </div>

      {/* Engagement grouped-bar + mailbox leaderboard */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.22)} className="lg:col-span-7">
          <ChartContainer
            title="Opens & replies volume"
            subtitle="Daily sent / opens / replies across the workspace (last 7 days)."
            height={340}
          >
            <GroupedBarChartWp<EngagementRow>
              data={d.engagement}
              xKey="day"
              series={[
                {
                  key: 'sent',
                  name: 'Sent',
                  color: chartTheme.colors.secondary,
                },
                {
                  key: 'opens',
                  name: 'Opens',
                  color: chartTheme.colors.primary,
                },
                {
                  key: 'replies',
                  name: 'Replies',
                  color: chartTheme.colors.warning,
                },
              ]}
              xFormatter={fmtDate}
              valueFormatter={(v) => fmtInt(v)}
              height={300}
            />
          </ChartContainer>
        </motion.div>
        <motion.div {...fade(0.26)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-accent" />
                  <h2 className="text-base font-semibold text-text">
                    Top mailboxes
                  </h2>
                </div>
                <span className="text-xs text-text-dim">by warmth</span>
              </header>
              <ul className="divide-y divide-white/5">
                {ranked.map((m, i) => (
                  <LeaderboardItem key={m.id} m={m} rank={i + 1} index={i} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pro-Plus external-signals row — Postmaster + SNDS mini-charts */}
      <motion.div {...fade(0.3)}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent3" />
          <h2 className="text-base font-semibold text-text">
            Pro Plus external signals
          </h2>
          <Badge variant="orange">Pro Plus only</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SignalTrendCard
            title="Postmaster domain trust"
            subtitle="Gmail-reported domain trust across 6 Gmail mailboxes (30d)."
            Icon={ShieldCheck}
            value={fmtRep(repLatest)}
            valueLabel={repLatest >= 80 ? 'High' : repLatest >= 55 ? 'Medium' : 'Low'}
            delta={repDelta}
            deltaSuffix="pts 30d"
            good={repDelta >= 0}
          >
            <ReputationMini rows={d.reputation} />
          </SignalTrendCard>
          <SignalTrendCard
            title="SNDS complaint rate"
            subtitle="Outlook/Hotmail spam-complaint rate vs the 0.30% hard threshold (30d)."
            Icon={Radar}
            value={fmtComplaint(complaintLatest)}
            valueLabel={complaintLatest < 0.1 ? 'Healthy' : complaintLatest < 0.3 ? 'Watch' : 'At risk'}
            delta={complaintDelta}
            deltaSuffix="pts 30d"
            good={complaintDelta <= 0}
          >
            <ComplaintMini rows={d.complaints} />
          </SignalTrendCard>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiTile({ kpi }: { kpi: Kpi }) {
  const good = kpi.invert ? kpi.delta < 0 : kpi.delta > 0;
  const flat = kpi.delta === 0;
  const DeltaIcon = flat ? Minus : kpi.delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaTone = flat
    ? 'text-text-dim'
    : good
      ? 'text-accent'
      : 'text-accent3';

  return (
    <Card className="h-full" noShimmer>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
          <span className="truncate">{kpi.label}</span>
          <span className={TONE_TEXT[kpi.tone]}>
            <kpi.Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-semibold tabular-nums leading-none text-text">
            {kpi.value}
          </p>
          <span
            className={`mb-0.5 flex items-center gap-0.5 text-xs font-medium ${deltaTone}`}
          >
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(kpi.delta)}
            {kpi.deltaSuffix ? ` ${kpi.deltaSuffix}` : ''}
          </span>
        </div>
        <div className="mt-auto h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${TONE_BAR[kpi.tone]}`}
            initial={{ width: 0 }}
            animate={{
              width: `${Math.max(0, Math.min(100, kpi.progress))}%`,
            }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardItem({
  m,
  rank,
  index,
}: {
  m: LeaderboardRow;
  rank: number;
  index: number;
}) {
  const color = warmthColor(m.warmth);
  const DeltaIcon =
    m.delta > 0 ? ArrowUpRight : m.delta < 0 ? ArrowDownRight : Minus;
  const deltaTone =
    m.delta > 0
      ? 'text-accent'
      : m.delta < 0
        ? 'text-accent3'
        : 'text-text-dim';

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: 0.28 + index * 0.05 }}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
    >
      <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-text-dim">
        {rank}
      </span>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-bg"
        style={{ background: color }}
        aria-hidden
      >
        {PROVIDER_LETTER[m.provider]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{m.email}</p>
        <p className="text-xs text-text-dim">
          Day {m.day}/28 · {m.sentToday}/{m.dailyTarget} sent · {m.inboxPct}%
          inbox
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className="text-base font-semibold tabular-nums leading-none"
          style={{ color }}
        >
          {m.warmth}
        </p>
        <span
          className={`flex items-center justify-end gap-0.5 text-xs ${deltaTone}`}
        >
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(m.delta).toFixed(1)}
        </span>
      </div>
    </motion.li>
  );
}

function SignalTrendCard({
  title,
  subtitle,
  Icon,
  value,
  valueLabel,
  delta,
  deltaSuffix,
  good,
  children,
}: {
  title: string;
  subtitle: string;
  Icon: typeof Mail;
  value: string;
  valueLabel: string;
  delta: number;
  deltaSuffix: string;
  good: boolean;
  children: React.ReactNode;
}) {
  const flat = delta === 0;
  const DeltaIcon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaTone = flat
    ? 'text-text-dim'
    : good
      ? 'text-accent'
      : 'text-accent3';

  return (
    <Card className="h-full" noShimmer>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-accent3" />
              <h3 className="text-base font-semibold text-text">{title}</h3>
            </div>
            <p className="mt-1 text-xs text-text-dim">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums leading-none text-text">
              {value}
            </p>
            <span
              className={`mt-1 flex items-center justify-end gap-0.5 text-xs font-medium ${deltaTone}`}
            >
              <DeltaIcon className="h-3 w-3" />
              {Math.abs(delta)} {deltaSuffix}
            </span>
          </div>
        </header>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span
            className={`h-2 w-2 rounded-full ${
              good ? 'bg-accent' : 'bg-accent3'
            }`}
            aria-hidden
          />
          {valueLabel}
        </div>
        <div className="h-[200px] w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

function ReputationMini({ rows }: { rows: ReputationRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
      >
        <defs>
          <linearGradient id="ppd3-rep" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={chartTheme.colors.primary}
              stopOpacity={0.45}
            />
            <stop
              offset="100%"
              stopColor={chartTheme.colors.primary}
              stopOpacity={0.04}
            />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke={chartTheme.grid.stroke}
          strokeDasharray={chartTheme.grid.strokeDasharray}
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{
            fill: chartTheme.colors.muted,
            fontSize: chartTheme.font.sizeSm,
          }}
          axisLine={{ stroke: chartTheme.colors.border }}
          tickLine={false}
          tickFormatter={fmtDate}
          minTickGap={28}
        />
        <YAxis
          domain={[40, 100]}
          tick={{
            fill: chartTheme.colors.muted,
            fontSize: chartTheme.font.sizeSm,
          }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtRep}
          width={36}
        />
        <ReferenceLine
          y={80}
          stroke={chartTheme.colors.muted}
          strokeDasharray="4 4"
          strokeOpacity={0.6}
          label={{
            value: 'High ≥ 80',
            position: 'insideTopLeft',
            fill: chartTheme.colors.muted,
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: chartTheme.tooltip.muted }}
          labelFormatter={(l) => fmtDate(l)}
          formatter={(val: number | string) => [
            fmtRep(val),
            'Trust score',
          ]}
        />
        <Area
          type="monotone"
          dataKey="reputation"
          name="Trust score"
          stroke={chartTheme.colors.primary}
          strokeWidth={2.2}
          fill="url(#ppd3-rep)"
          dot={false}
          activeDot={{ r: 4 }}
          animationDuration={1200}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ComplaintMini({ rows }: { rows: ComplaintRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
      >
        <CartesianGrid
          stroke={chartTheme.grid.stroke}
          strokeDasharray={chartTheme.grid.strokeDasharray}
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{
            fill: chartTheme.colors.muted,
            fontSize: chartTheme.font.sizeSm,
          }}
          axisLine={{ stroke: chartTheme.colors.border }}
          tickLine={false}
          tickFormatter={fmtDate}
          minTickGap={28}
        />
        <YAxis
          domain={[0, 0.4]}
          tick={{
            fill: chartTheme.colors.muted,
            fontSize: chartTheme.font.sizeSm,
          }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number | string) => `${Number(v).toFixed(2)}%`}
          width={44}
        />
        <ReferenceLine
          y={0.3}
          stroke={chartTheme.colors.danger}
          strokeDasharray="4 4"
          strokeOpacity={0.7}
          label={{
            value: '0.30% threshold',
            position: 'insideTopRight',
            fill: chartTheme.colors.danger,
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: chartTheme.tooltip.muted }}
          labelFormatter={(l) => fmtDate(l)}
          formatter={(val: number | string) => [
            fmtComplaint(val),
            'Complaint rate',
          ]}
        />
        <Line
          type="monotone"
          dataKey="complaint"
          name="Complaint rate"
          stroke={chartTheme.colors.warning}
          strokeWidth={2.2}
          dot={false}
          activeDot={{ r: 4 }}
          animationDuration={1200}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Keep these icon imports stable across refactors (referenced via props/meta).
void [Activity, Mail, ShieldAlert];

export default ProPlusDashV3Analytics;
