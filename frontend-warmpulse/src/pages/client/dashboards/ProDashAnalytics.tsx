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
import { DonutChartWp, type DonutDatum } from '@/components/charts/recharts/DonutChartWp';
import { chartTheme } from '@/components/charts/theme';
import {
  useDashboardPrefs,
  visiblePanels,
  type DashboardPanelId,
} from '@/stores/dashboardPrefs';
import { CustomizeDashboard } from '@/features/dashboard/CustomizeDashboard';
// Pull in the --wp-* admin token theme (scoped at :root[data-theme]) so this
// dashboard's admin-surface card recipe resolves on the LIVE /app route too,
// not just under /admin or the preview harness. CSS imports are global once
// loaded and Vite dedupes — safe to import from the component (same pattern as
// pages/onboarding/OnboardingDashboard.tsx).
import '@/pages/landing/hero-theme.css';
import { formatDate } from '@/lib/format';

/**
 * ProDashAnalytics — "Analytics-forward / BI cockpit" Pro-tier dashboard.
 *
 * Renders STANDALONE with built-in MOCK data when no `data` prop is supplied
 * (the isolated preview harness on :35001 mounts it prop-less), and with REAL
 * workspace data when the live Pro dashboard passes `data` from
 * `useProDashAnalyticsData()`.
 *
 * Cards use the admin panel surface recipe (`--wp-surface` / `--wp-border`,
 * the `color-mix(in srgb, var(--wp-surface) 96%, transparent)` +
 * `1px solid var(--wp-border)` recipe from pages/admin/users-cohort.css) so
 * the cockpit reads like the admin panels regardless of where it's shown.
 *
 * Sections are isolated, id-keyed renderables gated by the dashboard
 * customization store: `visiblePanels(prefs)` decides order + visibility,
 * with `kpi-band` and `warmth-volume` LOCKED (always first, always shown).
 *
 * Layout (default order, top → bottom):
 *   1. Header band — title + Pro badge + customize trigger + live chip
 *   2. KPI band — 5 deliverability KPI tiles                 [kpi-band, LOCKED]
 *   3. Hero combo — 30-day warmth line + daily volume bars   [warmth-volume, LOCKED]
 *   4. Placement stacked-area + provider donut               [placement, provider]
 *   5. Engagement grouped-bar + mailbox leaderboard          [engagement, leaderboard]
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
  tone: 'accent' | 'accent2' | 'accent4' | 'accent3';
  Icon: typeof Mail;
  progress: number;
  /** When true a falling delta is the good direction (bounce / spam). */
  invert?: boolean;
}

export interface ProDashAnalyticsData {
  avgWarmth: number;
  warmthDelta: number;
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
// Admin-surface card recipe — mirrors pages/admin/users-cohort.css:
//   background: color-mix(in srgb, var(--wp-surface) 96%, transparent);
//   border: 1px solid var(--wp-border);
// `Card` forwards `style`, so an inline style beats its `bg-surface/60`
// glass class. `ChartContainer` does NOT forward `style`, so chart cards get
// the same recipe via `!`-important Tailwind arbitrary utilities on its
// `className` (important beats the non-important glass `bg-surface/*`).
// ---------------------------------------------------------------------------

const ADMIN_CARD_STYLE: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--wp-surface) 96%, transparent)',
  borderColor: 'var(--wp-border)',
};

/** Kill the glass hover bg/border tint so the admin surface stays flat. */
const ADMIN_CARD_CLASS =
  'border-transparent hover:!border-[var(--wp-border)] hover:!bg-[color-mix(in_srgb,var(--wp-surface)_96%,transparent)]';

/** ChartContainer has no style passthrough — recolor its inner Card via
 *  important arbitrary utilities (beats glass `bg-surface/60`+hover). */
const ADMIN_CHART_CARD_CLASS =
  '!bg-[color-mix(in_srgb,var(--wp-surface)_96%,transparent)] !border-[var(--wp-border)] hover:!bg-[color-mix(in_srgb,var(--wp-surface)_96%,transparent)] hover:!border-[var(--wp-border)]';

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-tier numbers for the preview harness
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 30-day warmth ramp 58 → 84 + matching daily volume 70 → 138, both jittered. */
function buildWarmthVolume(): WarmthVolumeRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const warmth = 58 + t * 26 + Math.sin(i * 0.8) * 2.2;
    const volume = 70 + t * 68 + Math.sin(i * 1.3) * 9;
    return {
      date: isoMinusDays(29 - i),
      warmth: Math.round(Math.max(0, Math.min(100, warmth))),
      volume: Math.round(Math.max(0, volume)),
    };
  });
}

/** 14-day placement — inbox climbs into the low-90s, spam decays toward ~2%. */
function buildPlacement(): PlacementRow[] {
  return Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const spam = Math.max(1.4, 7.5 - t * 5.4 + Math.sin(i * 1.1) * 0.5);
    const promotions = Math.max(3.5, 9 - t * 3.4 + Math.cos(i * 0.9) * 0.6);
    const inbox = Math.max(0, 100 - spam - promotions);
    return {
      date: isoMinusDays(13 - i),
      inbox: Math.round(inbox * 10) / 10,
      promotions: Math.round(promotions * 10) / 10,
      spam: Math.round(spam * 10) / 10,
    };
  });
}

/** 7-day engagement — sends/opens/replies per day. */
function buildEngagement(): EngagementRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const sent = 108 + i * 5 + Math.round(Math.sin(i * 1.4) * 7);
    const opens = Math.round(sent * (0.66 + i * 0.012));
    const replies = Math.round(sent * (0.22 + i * 0.008));
    return { day: isoMinusDays(6 - i), sent, opens, replies };
  });
}

const MOCK: ProDashAnalyticsData = {
  avgWarmth: 80,
  warmthDelta: 2.4,
  mailboxCount: 4,
  activeCount: 4,
  kpis: [
    {
      key: 'inbox',
      label: 'Inbox vs spam',
      value: '92.1%',
      delta: 3.2,
      deltaSuffix: 'pts wk',
      tone: 'accent',
      Icon: Inbox,
      progress: 92,
    },
    {
      key: 'bounce',
      label: 'Failure rate (bounce)',
      value: '0.6%',
      delta: -0.3,
      deltaSuffix: 'pts wk',
      tone: 'accent2',
      Icon: TrendingDown,
      progress: 6,
      invert: true,
    },
    {
      key: 'spam',
      label: 'Spam rate',
      value: '2.0%',
      delta: -1.1,
      deltaSuffix: 'pts wk',
      tone: 'accent3',
      Icon: ShieldCheck,
      progress: 20,
      invert: true,
    },
    {
      key: 'reply',
      label: 'Reply rate',
      value: '24.8%',
      delta: 1.9,
      deltaSuffix: 'pts wk',
      tone: 'accent4',
      Icon: Reply,
      progress: 25,
    },
    {
      key: 'warmth',
      label: 'Avg warmth',
      value: '80',
      delta: 2.4,
      deltaSuffix: 'pts wk',
      tone: 'accent',
      Icon: Gauge,
      progress: 80,
    },
  ],
  warmthVolume: buildWarmthVolume(),
  placement: buildPlacement(),
  engagement: buildEngagement(),
  providerSplit: [
    { name: 'Gmail', value: 2, color: chartTheme.palette[0] },
    { name: 'Outlook', value: 1, color: chartTheme.palette[1] },
    { name: 'SMTP', value: 1, color: chartTheme.palette[4] },
    { name: 'Yahoo', value: 0, color: chartTheme.palette[3] },
  ],
  leaderboard: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'gmail',
      warmth: 88,
      delta: 1.6,
      inboxPct: 94.2,
      sentToday: 44,
      dailyTarget: 50,
      day: 26,
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'outlook',
      warmth: 82,
      delta: 3.0,
      inboxPct: 92.7,
      sentToday: 40,
      dailyTarget: 45,
      day: 21,
    },
    {
      id: 'mb-3',
      email: 'success@acme.io',
      provider: 'gmail',
      warmth: 79,
      delta: 2.1,
      inboxPct: 91.0,
      sentToday: 33,
      dailyTarget: 40,
      day: 17,
    },
    {
      id: 'mb-4',
      email: 'hello@acme.co',
      provider: 'smtp',
      warmth: 71,
      delta: -1.3,
      inboxPct: 88.4,
      sentToday: 21,
      dailyTarget: 30,
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
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// Locked panels always render first, in this order, regardless of prefs.
const LOCKED: DashboardPanelId[] = ['kpi-band', 'warmth-volume'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProDashAnalytics({ data }: { data?: ProDashAnalyticsData }) {
  const d = data ?? MOCK;
  const prefs = useDashboardPrefs();

  const totalSentToday = useMemo(
    () => d.leaderboard.reduce((acc, m) => acc + m.sentToday, 0),
    [d.leaderboard],
  );
  const totalTarget = useMemo(
    () => d.leaderboard.reduce((acc, m) => acc + m.dailyTarget, 0),
    [d.leaderboard],
  );
  const providerTotal = useMemo(
    () => d.providerSplit.reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0),
    [d.providerSplit],
  );
  const ranked = useMemo(
    () => [...d.leaderboard].sort((a, b) => b.warmth - a.warmth),
    [d.leaderboard],
  );

  // Warmth + daily-sends combo rows passed straight through. Earlier this
  // memo augmented every 7th row with a ``volumeWeekly`` rollup used by a
  // per-bar label on the combo chart, but the labels crowded the panel
  // (mirroring the unlabelled Pro Plus equivalent at
  // ``ProPlusDashV3Analytics.tsx``) and were removed.
  const warmthVolumeRows = d.warmthVolume;

  // Each section is an isolated, id-keyed renderable. Order + visibility is
  // owned by the customization store; locked panels are forced to the front.
  const SECTIONS: Record<DashboardPanelId, () => JSX.Element> = {
    'kpi-band': () => (
      <motion.div
        key="kpi-band"
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        {d.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </motion.div>
    ),
    'warmth-volume': () => (
      <motion.div key="warmth-volume" {...fade(0.1)}>
        <ChartContainer
          className={ADMIN_CHART_CARD_CLASS}
          title="Warmth & sending volume"
          subtitle="30-day workspace warmth (line, left axis) vs daily warmup sends (bars, right axis)."
          actions={
            <span
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-text-dim"
              style={ADMIN_CARD_STYLE}
            >
              <TrendingUp className="h-3 w-3 text-accent" />
              30d
            </span>
          }
          height={340}
        >
          <ComboChartWp<WarmthVolumeRow>
            data={warmthVolumeRows}
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
    ),
    placement: () => (
      <motion.div key="placement" {...fade(0.15)}>
        <ChartContainer
          className={ADMIN_CHART_CARD_CLASS}
          title="Where emails land over time"
          subtitle="Share of warmup mail landing in Inbox vs Promotions vs Spam (last 14 days)."
          height={320}
        >
          <StackedAreaChartWp<PlacementRow>
            data={d.placement}
            xKey="date"
            series={[
              { key: 'inbox', name: 'Inbox', color: chartTheme.colors.primary },
              {
                key: 'promotions',
                name: 'Promotions',
                color: chartTheme.colors.warning,
              },
              { key: 'spam', name: 'Spam', color: chartTheme.colors.danger },
            ]}
            gradientIdPrefix="proda-placement"
            xFormatter={fmtDate}
            valueFormatter={(v) => fmtPercent(v)}
            yDomain={[0, 100]}
            height={280}
          />
        </ChartContainer>
      </motion.div>
    ),
    provider: () => (
      <motion.div key="provider" {...fade(0.18)}>
        <ChartContainer
          className={ADMIN_CHART_CARD_CLASS}
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
    ),
    engagement: () => (
      <motion.div key="engagement" {...fade(0.22)}>
        <ChartContainer
          className={ADMIN_CHART_CARD_CLASS}
          title="Opens & replies volume"
          subtitle="Daily sent / opens / replies across the workspace (last 7 days)."
          height={320}
        >
          <GroupedBarChartWp<EngagementRow>
            data={d.engagement}
            xKey="day"
            series={[
              { key: 'sent', name: 'Sent', color: chartTheme.colors.secondary },
              { key: 'opens', name: 'Opens', color: chartTheme.colors.primary },
              { key: 'replies', name: 'Replies', color: chartTheme.colors.warning },
            ]}
            xFormatter={fmtDate}
            valueFormatter={(v) => fmtInt(v)}
            height={280}
          />
        </ChartContainer>
      </motion.div>
    ),
    leaderboard: () => (
      <motion.div key="leaderboard" {...fade(0.26)}>
        <Card className={`h-full ${ADMIN_CARD_CLASS}`} style={ADMIN_CARD_STYLE}>
          <CardContent className="p-0">
            <header className="flex items-center justify-between border-b border-[var(--wp-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">
                  Top mailboxes
                </h2>
              </div>
              <span className="text-xs text-text-dim">by warmth</span>
            </header>
            <ul className="divide-y divide-[var(--wp-border)]">
              {ranked.map((m, i) => (
                <LeaderboardItem key={m.id} m={m} rank={i + 1} index={i} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    ),
  };

  // Order from the store; force locked panels first (LOCKED order), then the
  // visible non-locked panels in their stored order.
  const ordered = useMemo<DashboardPanelId[]>(() => {
    const vis = visiblePanels({ hidden: prefs.hidden, order: prefs.order });
    const rest = vis.filter((id) => !LOCKED.includes(id));
    return [...LOCKED, ...rest];
  }, [prefs.hidden, prefs.order]);

  // Two-up rows pair (placement, provider) and (engagement, leaderboard) when
  // BOTH members of a pair are visible & adjacent; otherwise each renders
  // full-width so a hidden/ reordered panel doesn't leave a dangling column.
  const rendered = useMemo(() => {
    const out: JSX.Element[] = [];
    const PAIRS: Array<[DashboardPanelId, DashboardPanelId, string]> = [
      ['placement', 'provider', 'lg:col-span-8|lg:col-span-4'],
      ['engagement', 'leaderboard', 'lg:col-span-7|lg:col-span-5'],
    ];
    for (let i = 0; i < ordered.length; i++) {
      const id = ordered[i]!;
      const next = ordered[i + 1];
      const pair = PAIRS.find(([a, b]) => a === id && b === next);
      if (pair && next) {
        const [spanA, spanB] = pair[2].split('|') as [string, string];
        out.push(
          <div
            key={`${id}+${next}`}
            className="grid grid-cols-1 gap-4 lg:grid-cols-12"
          >
            <div className={spanA}>{SECTIONS[id]()}</div>
            <div className={spanB}>{SECTIONS[next]()}</div>
          </div>,
        );
        i++; // consumed the pair partner
        continue;
      }
      out.push(<div key={id}>{SECTIONS[id]()}</div>);
    }
    return out;
    // SECTIONS closes over `d`/derived memos; `ordered` already depends on prefs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, d]);

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
              Pro
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Warmth, inbox delivery and opens & replies across {d.mailboxCount}{' '}
            mailboxes · {totalSentToday}/{totalTarget} sent today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CustomizeDashboard />
          <div
            className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl"
            style={ADMIN_CARD_STYLE}
          >
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
        </div>
      </motion.header>

      {/* Panels — order & visibility owned by the customization store,
          locked panels (kpi-band, warmth-volume) forced first. */}
      {rendered}
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
    <Card
      className={`h-full ${ADMIN_CARD_CLASS}`}
      style={ADMIN_CARD_STYLE}
      noShimmer
    >
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
        <div className="mt-auto h-1 overflow-hidden rounded-full bg-[var(--wp-surface-2)]">
          <motion.div
            className={`h-full rounded-full ${TONE_BAR[kpi.tone]}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, kpi.progress))}%` }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
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
      transition={{ duration: 0.25, delay: 0.28 + index * 0.04 }}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--wp-surface-2)]"
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

// Referenced via icon props elsewhere; keep imports stable across refactors.
void [Activity, Mail];

export default ProDashAnalytics;
