import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gauge,
  Inbox,
  Mail,
  Minus,
  Reply,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { ComboChartWp } from '@/components/charts/recharts/ComboChartWp';
import { StackedAreaChartWp } from '@/components/charts/recharts/StackedAreaChartWp';
import { GroupedBarChartWp } from '@/components/charts/recharts/GroupedBarChartWp';
import {
  DonutChartWp,
  type DonutDatum,
} from '@/components/charts/recharts/DonutChartWp';
import { chartTheme } from '@/components/charts/theme';
import { formatDate } from '@/lib/format';

/**
 * ProPlusAnalytics — STANDALONE Pro-Plus-tier "BI cockpit" analytics section
 * for the isolated preview harness.
 *
 * Renders ONLY page content (heading + body). No router / query / fetch — all
 * data is the inline `MOCK` const below. The shell + sidebar are supplied by
 * the harness.
 *
 * Layout (top → bottom):
 *   1. Header band — title + Pro Plus badge + live chip
 *   2. KPI band — 5 deliverability tiles with weekly deltas
 *   3. Hero combo — 30-day warmth (line) + daily volume (bars), dual axis
 *   4. Placement stacked-area (14d) + provider donut — two-up
 *   5. Engagement grouped-bar (7d) + top-mailbox leaderboard — two-up
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

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
  provider: 'gmail' | 'outlook' | 'smtp' | 'yahoo';
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
  Icon: typeof Mail;
  color: string;
  progress: number;
  /** When true a falling delta is the good direction (bounce / spam). */
  invert?: boolean;
}

interface ProPlusAnalyticsMock {
  avgWarmth: number;
  mailboxCount: number;
  activeCount: number;
  kpis: Kpi[];
  warmthVolume: WarmthVolumeRow[];
  placement: PlacementRow[];
  engagement: EngagementRow[];
  providerSplit: DonutDatum[];
  leaderboard: LeaderboardRow[];
}

// ---------------------------------------------------------------------------
// Mock data — analyst-grade Pro Plus numbers (15-mailbox account)
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 30-day warmth ramp 62 → 87 + matching daily volume 220 → 540, jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 62 + t * 25 + Math.sin(i * 0.8) * 1.8;
    const volume = 220 + t * 320 + Math.sin(i * 1.3) * 26;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

/** 14-day placement — inbox climbs into the mid-90s, spam decays toward ~1.5%. */
function buildPlacement(): PlacementRow[] {
  return Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const spam = Math.max(1.3, 6.4 - t * 4.8 + Math.sin(i * 1.1) * 0.4);
    const promotions = Math.max(2.8, 7.5 - t * 3.1 + Math.cos(i * 0.9) * 0.5);
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
    const sent = 410 + i * 22 + Math.round(Math.sin(i * 1.4) * 24);
    const opens = Math.round(sent * (0.68 + i * 0.011));
    const replies = Math.round(sent * (0.24 + i * 0.007));
    return { day: isoMinusDays(6 - i), sent, opens, replies };
  });
}

const MOCK: ProPlusAnalyticsMock = {
  avgWarmth: 84,
  mailboxCount: 15,
  activeCount: 14,
  kpis: [
    {
      key: 'inbox',
      label: 'Where emails land',
      value: '94.6%',
      delta: 2.8,
      deltaSuffix: 'pts wk',
      Icon: Inbox,
      color: chartTheme.colors.primary,
      progress: 95,
    },
    {
      key: 'bounce',
      label: 'Failure rate',
      value: '0.4%',
      delta: -0.2,
      deltaSuffix: 'pts wk',
      Icon: TrendingDown,
      color: chartTheme.colors.secondary,
      progress: 4,
      invert: true,
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: '1.5%',
      delta: -0.9,
      deltaSuffix: 'pts wk',
      Icon: ShieldCheck,
      color: chartTheme.colors.danger,
      progress: 15,
      invert: true,
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: '26.4%',
      delta: 1.7,
      deltaSuffix: 'pts wk',
      Icon: Reply,
      color: chartTheme.colors.warning,
      progress: 26,
    },
    {
      key: 'warmth',
      label: 'Avg warmth',
      value: '84',
      delta: 2.1,
      deltaSuffix: 'pts wk',
      Icon: Gauge,
      color: chartTheme.colors.primary,
      progress: 84,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  placement: buildPlacement(),
  engagement: buildEngagement(),
  providerSplit: [
    { name: 'Gmail', value: 7, color: chartTheme.palette[0] },
    { name: 'Outlook', value: 4, color: chartTheme.palette[1] },
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
      inboxPct: 96.3,
      sentToday: 48,
      dailyTarget: 50,
      day: 28,
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 87,
      delta: 2.6,
      inboxPct: 95.1,
      sentToday: 44,
      dailyTarget: 50,
      day: 24,
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      warmth: 84,
      delta: 1.9,
      inboxPct: 93.8,
      sentToday: 41,
      dailyTarget: 45,
      day: 21,
    },
    {
      id: 'mb-4',
      email: 'growth@acme.io',
      provider: 'smtp',
      warmth: 78,
      delta: 3.1,
      inboxPct: 91.2,
      sentToday: 33,
      dailyTarget: 40,
      day: 16,
    },
    {
      id: 'mb-5',
      email: 'hello@acme.co',
      provider: 'yahoo',
      warmth: 69,
      delta: -1.2,
      inboxPct: 87.6,
      sentToday: 22,
      dailyTarget: 35,
      day: 11,
    },
  ],
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

const PROVIDER_LETTER: Record<LeaderboardRow['provider'], string> = {
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

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAnalytics(): JSX.Element {
  const d = MOCK;

  const totalSentToday = useMemo(
    () => d.leaderboard.reduce((acc, m) => acc + m.sentToday, 0),
    [d.leaderboard],
  );
  const totalTarget = useMemo(
    () => d.leaderboard.reduce((acc, m) => acc + m.dailyTarget, 0),
    [d.leaderboard],
  );
  const providerTotal = useMemo(
    () => d.providerSplit.reduce((acc, s) => acc + s.value, 0),
    [d.providerSplit],
  );
  const ranked = useMemo(
    () => [...d.leaderboard].sort((a, b) => b.warmth - a.warmth),
    [d.leaderboard],
  );

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
            Inbox delivery, warmth and opens & replies across {d.mailboxCount}{' '}
            mailboxes · {totalSentToday}/{totalTarget} sent today.
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
          <span>helper network live</span>
        </div>
      </motion.header>

      {/* KPI band */}
      <motion.div
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        {d.kpis.map((k, i) => (
          <KpiTile key={k.key} kpi={k} index={i} />
        ))}
      </motion.div>

      {/* Hero combo — warmth + volume */}
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

      {/* Placement + provider — two-up */}
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
              gradientIdPrefix="ppa-placement"
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

      {/* Engagement + leaderboard — two-up */}
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
          <Card className="h-full">
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-accent" />
                  <h2 className="text-base font-semibold text-text">
                    Top mailboxes
                  </h2>
                </div>
                <span className="text-xs text-text-dim">by warmth</span>
              </header>
              <ul className="divide-y divide-border-muted">
                {ranked.map((m, i) => (
                  <LeaderboardItem key={m.id} m={m} rank={i + 1} index={i} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiTile({ kpi, index }: { kpi: Kpi; index: number }) {
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
          <span style={{ color: kpi.color }}>
            <kpi.Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end gap-2">
          <motion.p
            className="text-2xl font-semibold tabular-nums leading-none text-text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.04 }}
          >
            {kpi.value}
          </motion.p>
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
            className="h-full rounded-full"
            style={{ background: kpi.color }}
            initial={{ width: 0 }}
            animate={{
              width: `${Math.max(0, Math.min(100, kpi.progress))}%`,
            }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 + index * 0.04 }}
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
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
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
          Day {m.day} · {m.sentToday}/{m.dailyTarget} sent · {m.inboxPct}% inbox
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

export default ProPlusAnalytics;
