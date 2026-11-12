import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Crown,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Globe,
  Inbox,
  Info,
  Layers,
  Mail,
  MailCheck,
  MailWarning,
  MailX,
  MessageSquare,
  Minus,
  Plus,
  Radar,
  Reply,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Siren,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgAnaR4Compare — Agency-tier Analytics, design candidate #4, "Comparison Atlas".
 *
 * Multi-metric COMPARISON surface for an agency's sub-client portfolio. The
 * hero is a 7-axis RADAR / SPIDER chart: every sub-client can be projected
 * onto a 0..100 scale across Sends, Opens, Replies, Inbox %, Spam %,
 * Bounce %, and Warmth. Up to three sub-clients can be OVERLAID on the
 * hero radar as coloured polygons (status-tinted: healthy / warming /
 * at-risk).
 *
 * Below the hero radar lives a 4-column grid of MINI RADARS — one tiny
 * 7-axis spider per sub-client. Clicking a mini radar toggles it in or
 * out of the hero overlay. The top performer (best weighted score) gets a
 * glowing border.
 *
 * Beneath the mini grid: a sortable COMPARISON TABLE — sub-clients as
 * rows, the seven metrics as columns. Click a column header to sort.
 *
 * Right inspector: TOP PERFORMERS by each individual metric plus a
 * compact alert column.
 *
 * Entirely STANDALONE — no router / network / shared hooks. Inline MOCK
 * supplies every field so the preview harness mounts the page prop-less.
 * The future adapter will pass `data` once the multi-workspace rollup
 * endpoint ships.
 */

// ---------------------------------------------------------------------------
// Shared Agency analytics data shape (kept in sync across R1..R4 variants).
// ---------------------------------------------------------------------------

type AnalyticsMetric =
  | 'sends'
  | 'opens'
  | 'replies'
  | 'inbox_rate'
  | 'spam_rate'
  | 'bounce_rate'
  | 'warmth';
type AnalyticsPeriod = 'last_7d' | 'last_30d' | 'last_90d' | 'last_year';
type SubClientStatus = 'healthy' | 'warming' | 'at_risk';
type Provider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
type InsightSeverity = 'info' | 'warn' | 'critical' | 'success';

export interface AgencyAnalyticsData {
  workspace: { name: string; subClientCount: number; mailboxCount: number };
  period: AnalyticsPeriod;
  kpis: {
    totalSends30d: number;
    totalOpens30d: number;
    totalReplies30d: number;
    inboxRatePct: number;
    spamRatePct: number;
    bounceRatePct: number;
    avgWarmth: number;
    momGrowthPct: number;
  };
  days30: Array<{
    date: string;
    sends: number;
    opens: number;
    replies: number;
    inboxPct: number;
  }>;
  funnel: {
    sends: number;
    delivered: number;
    inboxed: number;
    opened: number;
    replied: number;
  };
  providerMix: Array<{
    provider: Provider;
    sends: number;
    inboxPct: number;
    spamPct: number;
    blockedPct: number;
  }>;
  subClientLeaderboard: Array<{
    id: string;
    name: string;
    logoChar: string;
    sends30d: number;
    inboxPct: number;
    warmthScore: number;
    delta30dPct: number;
    status: SubClientStatus;
  }>;
  weeklyInsights: Array<{
    id: string;
    weekOf: string;
    headline: string;
    body: string;
    metric: string;
    severity: InsightSeverity;
  }>;
  comparisons: Array<{
    subClientId: string;
    subClientName: string;
    sends: number;
    opens: number;
    replies: number;
    inboxRate: number;
    spamRate: number;
    bounceRate: number;
    warmth: number;
  }>;
}

// ---------------------------------------------------------------------------
// Mock data — Northwind Agency, 8 sub-clients, 30 days of dailies.
// ---------------------------------------------------------------------------

const SUB_CLIENT_LEADERBOARD: AgencyAnalyticsData['subClientLeaderboard'] = [
  {
    id: 'sc-helix',
    name: 'Helix Outreach',
    logoChar: 'H',
    sends30d: 18420,
    inboxPct: 91.4,
    warmthScore: 87,
    delta30dPct: 12.4,
    status: 'healthy',
  },
  {
    id: 'sc-nimbus',
    name: 'Nimbus Cloud',
    logoChar: 'N',
    sends30d: 22310,
    inboxPct: 88.1,
    warmthScore: 84,
    delta30dPct: 8.1,
    status: 'healthy',
  },
  {
    id: 'sc-orion',
    name: 'Orion Sales',
    logoChar: 'O',
    sends30d: 26840,
    inboxPct: 93.6,
    warmthScore: 91,
    delta30dPct: 15.2,
    status: 'healthy',
  },
  {
    id: 'sc-vega',
    name: 'Vega Outbound',
    logoChar: 'V',
    sends30d: 7320,
    inboxPct: 76.2,
    warmthScore: 72,
    delta30dPct: -3.4,
    status: 'warming',
  },
  {
    id: 'sc-quasar',
    name: 'Quasar Growth',
    logoChar: 'Q',
    sends30d: 14280,
    inboxPct: 84.7,
    warmthScore: 82,
    delta30dPct: 4.6,
    status: 'healthy',
  },
  {
    id: 'sc-lyra',
    name: 'Lyra Studio',
    logoChar: 'L',
    sends30d: 9650,
    inboxPct: 87.4,
    warmthScore: 84,
    delta30dPct: 6.2,
    status: 'healthy',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'A',
    sends30d: 4810,
    inboxPct: 51.3,
    warmthScore: 48,
    delta30dPct: -18.7,
    status: 'at_risk',
  },
  {
    id: 'sc-pixel',
    name: 'Pixel Forge',
    logoChar: 'P',
    sends30d: 6240,
    inboxPct: 68.9,
    warmthScore: 65,
    delta30dPct: -1.2,
    status: 'warming',
  },
];

const COMPARISONS: AgencyAnalyticsData['comparisons'] = [
  // Values normalized 0..100 (where percentages are direct,
  // volumes are scaled by max).
  {
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    sends: 69,
    opens: 78,
    replies: 64,
    inboxRate: 91,
    spamRate: 12,
    bounceRate: 18,
    warmth: 87,
  },
  {
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    sends: 83,
    opens: 75,
    replies: 58,
    inboxRate: 88,
    spamRate: 19,
    bounceRate: 22,
    warmth: 84,
  },
  {
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    sends: 100,
    opens: 88,
    replies: 76,
    inboxRate: 94,
    spamRate: 8,
    bounceRate: 12,
    warmth: 91,
  },
  {
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    sends: 27,
    opens: 41,
    replies: 32,
    inboxRate: 76,
    spamRate: 44,
    bounceRate: 38,
    warmth: 72,
  },
  {
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    sends: 53,
    opens: 62,
    replies: 49,
    inboxRate: 85,
    spamRate: 21,
    bounceRate: 24,
    warmth: 82,
  },
  {
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    sends: 36,
    opens: 58,
    replies: 47,
    inboxRate: 87,
    spamRate: 16,
    bounceRate: 19,
    warmth: 84,
  },
  {
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    sends: 18,
    opens: 22,
    replies: 14,
    inboxRate: 51,
    spamRate: 78,
    bounceRate: 62,
    warmth: 48,
  },
  {
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    sends: 23,
    opens: 37,
    replies: 28,
    inboxRate: 69,
    spamRate: 52,
    bounceRate: 46,
    warmth: 65,
  },
];

const DAYS_30: AgencyAnalyticsData['days30'] = Array.from({ length: 30 }).map(
  (_, i) => {
    const day = i + 1;
    const seed = Math.sin(day * 0.7) * 0.5 + 0.5;
    return {
      date: `2026-05-${String(day).padStart(2, '0')}`,
      sends: Math.round(3200 + seed * 1800 + day * 60),
      opens: Math.round(2200 + seed * 1300 + day * 42),
      replies: Math.round(640 + seed * 480 + day * 14),
      inboxPct: Math.round((83 + seed * 8 + day * 0.1) * 10) / 10,
    };
  },
);

const PROVIDER_MIX: AgencyAnalyticsData['providerMix'] = [
  { provider: 'gmail', sends: 64320, inboxPct: 88, spamPct: 1.2, blockedPct: 0.4 },
  { provider: 'outlook', sends: 28140, inboxPct: 81, spamPct: 2.8, blockedPct: 0.8 },
  { provider: 'yahoo', sends: 12880, inboxPct: 74, spamPct: 4.2, blockedPct: 1.4 },
  { provider: 'smtp', sends: 4430, inboxPct: 79, spamPct: 2.1, blockedPct: 1.1 },
];

const WEEKLY_INSIGHTS: AgencyAnalyticsData['weeklyInsights'] = [
  {
    id: 'in-1',
    weekOf: '2026-05-19',
    headline: 'Orion Sales tops every metric',
    body: 'Orion Sales leads Sends, Opens, Replies, Inbox %, and Warmth simultaneously — a portfolio-wide outlier.',
    metric: 'overall',
    severity: 'success',
  },
  {
    id: 'in-2',
    weekOf: '2026-05-19',
    headline: 'Atlas Bio spam complaints surging',
    body: 'Atlas Bio bounce + spam ratios are 4-5x portfolio average. Quarantine review recommended.',
    metric: 'spam_rate',
    severity: 'critical',
  },
  {
    id: 'in-3',
    weekOf: '2026-05-12',
    headline: 'Helix replies climbing',
    body: 'Reply rate +18.4% week-over-week. Likely tied to last week’s subject-line refresh.',
    metric: 'replies',
    severity: 'success',
  },
  {
    id: 'in-4',
    weekOf: '2026-05-12',
    headline: 'Vega Outbound losing ground',
    body: 'Inbox % dropped 6 points in the last 14d; warmup ramp may need reset.',
    metric: 'inbox_rate',
    severity: 'warn',
  },
];

const MOCK: AgencyAnalyticsData = {
  workspace: { name: 'Northwind Agency', subClientCount: 8, mailboxCount: 92 },
  period: 'last_30d',
  kpis: {
    totalSends30d: 109870,
    totalOpens30d: 78240,
    totalReplies30d: 22610,
    inboxRatePct: 84.8,
    spamRatePct: 2.4,
    bounceRatePct: 1.8,
    avgWarmth: 76.6,
    momGrowthPct: 9.4,
  },
  days30: DAYS_30,
  funnel: {
    sends: 109870,
    delivered: 107920,
    inboxed: 91500,
    opened: 78240,
    replied: 22610,
  },
  providerMix: PROVIDER_MIX,
  subClientLeaderboard: SUB_CLIENT_LEADERBOARD,
  weeklyInsights: WEEKLY_INSIGHTS,
  comparisons: COMPARISONS,
};

/**
 * Skeleton fallback used by the future live adapter when the API hasn't
 * loaded yet (or failed). Empty collections + zeroed KPIs so the surface
 * renders cleanly without misleading mock numbers.
 */
export const AGENCY_ANALYTICS_SKELETON_R4: AgencyAnalyticsData = {
  workspace: { name: 'Your agency', subClientCount: 0, mailboxCount: 0 },
  period: 'last_30d',
  kpis: {
    totalSends30d: 0,
    totalOpens30d: 0,
    totalReplies30d: 0,
    inboxRatePct: 0,
    spamRatePct: 0,
    bounceRatePct: 0,
    avgWarmth: 0,
    momGrowthPct: 0,
  },
  days30: [],
  funnel: { sends: 0, delivered: 0, inboxed: 0, opened: 0, replied: 0 },
  providerMix: [],
  subClientLeaderboard: [],
  weeklyInsights: [],
  comparisons: [],
};

// ---------------------------------------------------------------------------
// Theme / metric helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  surface: '#13131d',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
};

const STATUS_RING_CLASS: Record<SubClientStatus, string> = {
  healthy: 'border-accent/40 bg-accent/10 text-accent',
  warming: 'border-accent4/40 bg-accent4/10 text-accent4',
  at_risk: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const STATUS_DOT_CLASS: Record<SubClientStatus, string> = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
};

const SEVERITY_RING: Record<InsightSeverity, string> = {
  info: 'border-accent2/40 bg-accent2/5 text-accent2',
  warn: 'border-accent4/40 bg-accent4/5 text-accent4',
  critical: 'border-accent3/40 bg-accent3/5 text-accent3',
  success: 'border-accent/40 bg-accent/5 text-accent',
};

const SEVERITY_ICON: Record<InsightSeverity, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  critical: Siren,
  success: Sparkles,
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_ICON: Record<Provider, typeof Mail> = {
  gmail: Mail,
  outlook: Mail,
  yahoo: Mail,
  smtp: Mail,
};

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  last_year: 'Last 12 months',
};

const METRIC_LABEL: Record<AnalyticsMetric, string> = {
  sends: 'Sends',
  opens: 'Opens',
  replies: 'Replies',
  inbox_rate: 'Inbox %',
  spam_rate: 'Spam %',
  bounce_rate: 'Bounce %',
  warmth: 'Warmth',
};

const METRIC_ICON: Record<AnalyticsMetric, typeof Send> = {
  sends: Send,
  opens: Eye,
  replies: Reply,
  inbox_rate: Inbox,
  spam_rate: MailWarning,
  bounce_rate: MailX,
  warmth: Flame,
};

const METRIC_BAD_HIGH: Record<AnalyticsMetric, boolean> = {
  sends: false,
  opens: false,
  replies: false,
  inbox_rate: false,
  spam_rate: true,
  bounce_rate: true,
  warmth: false,
};

const METRIC_ORDER: AnalyticsMetric[] = [
  'sends',
  'opens',
  'replies',
  'inbox_rate',
  'spam_rate',
  'bounce_rate',
  'warmth',
];

// ---------------------------------------------------------------------------
// Number formatting helpers
// ---------------------------------------------------------------------------

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return formatNumber(n);
}

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function fmtScore(n: number): string {
  return Math.round(n).toString();
}

function metricValueOf(
  row: AgencyAnalyticsData['comparisons'][number],
  m: AnalyticsMetric,
): number {
  switch (m) {
    case 'sends':
      return row.sends;
    case 'opens':
      return row.opens;
    case 'replies':
      return row.replies;
    case 'inbox_rate':
      return row.inboxRate;
    case 'spam_rate':
      return row.spamRate;
    case 'bounce_rate':
      return row.bounceRate;
    case 'warmth':
      return row.warmth;
  }
}

/**
 * Friendly metric value formatter — radar axes are all on a 0..100 scale
 * for geometry, but the *displayed* unit depends on the metric (raw vs %).
 * For this prototype every value is shown on the same 0..100 scale because
 * volumes were normalized server-side; the formatter still appends a "%"
 * suffix to rate-style metrics so the tooltip reads correctly.
 */
function fmtMetricValue(m: AnalyticsMetric, v: number): string {
  if (m === 'sends' || m === 'opens' || m === 'replies' || m === 'warmth') {
    return Math.round(v).toString();
  }
  return `${Math.round(v)}%`;
}

// ---------------------------------------------------------------------------
// Radar geometry
// ---------------------------------------------------------------------------

interface RadarPoint {
  x: number;
  y: number;
  metric: AnalyticsMetric;
  value: number;
}

function radarPoints(
  row: AgencyAnalyticsData['comparisons'][number],
  cx: number,
  cy: number,
  radius: number,
): RadarPoint[] {
  return METRIC_ORDER.map((m, i) => {
    const angle = (Math.PI * 2 * i) / METRIC_ORDER.length - Math.PI / 2;
    // For "bad-high" metrics (spam_rate / bounce_rate) we INVERT so that a
    // larger polygon = better performance on every axis. The displayed
    // tooltip still reads the original spam/bounce value.
    const raw = metricValueOf(row, m);
    const projected = METRIC_BAD_HIGH[m] ? 100 - raw : raw;
    const r = (projected / 100) * radius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      metric: m,
      value: raw,
    };
  });
}

function radarPathD(points: RadarPoint[]): string {
  if (points.length === 0) return '';
  return (
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ') + ' Z'
  );
}

function axisAnchor(
  cx: number,
  cy: number,
  radius: number,
  i: number,
  pad = 24,
): { x: number; y: number } {
  const angle = (Math.PI * 2 * i) / METRIC_ORDER.length - Math.PI / 2;
  return {
    x: cx + Math.cos(angle) * (radius + pad),
    y: cy + Math.sin(angle) * (radius + pad),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgAnaR4Compare(
  { data }: { data?: AgencyAnalyticsData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  // Default the overlay to the top three sub-clients by combined weighted
  // score so the hero radar is interesting on first paint.
  const ranked = useMemo(() => rankSubClients(d.comparisons), [d.comparisons]);
  const topPerformer = ranked[0];

  const [overlay, setOverlay] = useState<string[]>(() =>
    ranked.slice(0, 3).map((r) => r.subClientId),
  );
  const [hoverMetric, setHoverMetric] = useState<AnalyticsMetric | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>(d.period);

  const toggleOverlay = (id: string) => {
    setOverlay((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  };

  const overlayRows = useMemo(
    () =>
      overlay
        .map((id) => d.comparisons.find((c) => c.subClientId === id))
        .filter(
          (r): r is AgencyAnalyticsData['comparisons'][number] =>
            r !== undefined,
        ),
    [overlay, d.comparisons],
  );

  return (
    <div className="relative space-y-5">
      <BackgroundGradient />
      <PageHeader
        data={d}
        period={period}
        onPeriodChange={setPeriod}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="space-y-4 lg:col-span-8">
          <HeroRadar
            data={d}
            overlay={overlay}
            overlayRows={overlayRows}
            hoverMetric={hoverMetric}
            onHoverMetric={setHoverMetric}
            onRemoveOverlay={(id) =>
              setOverlay((prev) => prev.filter((x) => x !== id))
            }
          />

          <MiniRadarGrid
            data={d}
            overlay={overlay}
            topPerformerId={topPerformer?.subClientId ?? null}
            onToggle={toggleOverlay}
          />

          <ComparisonTable
            data={d}
            overlay={overlay}
            onToggle={toggleOverlay}
          />
        </div>

        <div className="space-y-4 lg:col-span-4">
          <TopPerformersPanel data={d} />
          <AlertsPanel data={d} />
          <PortfolioPulse data={d} />
        </div>
      </motion.div>
    </div>
  );
}

export default AgAnaR4Compare;

// ---------------------------------------------------------------------------
// Background gradient
// ---------------------------------------------------------------------------

function BackgroundGradient(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -left-32 -top-24 h-[420px] w-[420px] rounded-full opacity-30 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(242, 101, 34,0.45) 0%, rgba(242, 101, 34,0) 70%)',
        }}
      />
      <div
        className="absolute -right-32 top-40 h-[360px] w-[360px] rounded-full opacity-20 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(255, 138, 75,0.45) 0%, rgba(255, 138, 75,0) 70%)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header — agency, KPIs, period selector
// ---------------------------------------------------------------------------

function PageHeader({
  data,
  period,
  onPeriodChange,
}: {
  data: AgencyAnalyticsData;
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
}): JSX.Element {
  const { workspace, kpis } = data;
  const momUp = kpis.momGrowthPct >= 0;
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <div className="relative flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent"
          >
            <Building2 className="h-6 w-6" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-text">
                {workspace.name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-dim">
                <Globe className="h-3 w-3" />
                us-east-1
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                Agency tier
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-dim">
              {workspace.subClientCount} sub-clients · {workspace.mailboxCount}{' '}
              mailboxes · comparison atlas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              momUp
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-accent3/40 bg-accent3/10 text-accent3'
            }`}
          >
            {momUp ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">
              {momUp ? '+' : ''}
              {kpis.momGrowthPct.toFixed(1)}%
            </span>
            <span className="text-text-dim">MoM</span>
          </div>
          <PeriodSelector value={period} onChange={onPeriodChange} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border-muted bg-border-muted sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Sends"
          value={fmtNumber(kpis.totalSends30d)}
          sub="30d"
          icon={Send}
          delay={0.1}
        />
        <KpiTile
          label="Opens"
          value={fmtNumber(kpis.totalOpens30d)}
          sub="30d"
          icon={Eye}
          delay={0.14}
        />
        <KpiTile
          label="Replies"
          value={fmtNumber(kpis.totalReplies30d)}
          sub="30d"
          icon={Reply}
          delay={0.18}
        />
        <KpiTile
          label="Inbox"
          value={fmtPct(kpis.inboxRatePct)}
          sub="avg"
          icon={Inbox}
          delay={0.22}
          accent
        />
        <KpiTile
          label="Spam / Bounce"
          value={`${fmtPct(kpis.spamRatePct)} · ${fmtPct(kpis.bounceRatePct)}`}
          sub="combined"
          icon={ShieldAlert}
          delay={0.26}
        />
        <KpiTile
          label="Warmth"
          value={fmtScore(kpis.avgWarmth)}
          sub="portfolio"
          icon={Flame}
          delay={0.3}
        />
      </div>
    </motion.header>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  delay = 0,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Send;
  accent?: boolean;
  delay?: number;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="flex items-start gap-2 bg-surface p-3"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
          accent
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border-muted bg-surface-2 text-text-dim'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-text">{value}</div>
        <div className="text-[10px] text-text-dim/80">{sub}</div>
      </div>
    </motion.div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: AnalyticsPeriod;
  onChange: (p: AnalyticsPeriod) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-accent/40"
      >
        <Activity className="h-3.5 w-3.5 text-text-dim" />
        {PERIOD_LABEL[value]}
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-dim transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border-muted bg-surface shadow-2xl"
          >
            {(
              ['last_7d', 'last_30d', 'last_90d', 'last_year'] as AnalyticsPeriod[]
            ).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-surface-2 ${
                  p === value ? 'text-accent' : 'text-text'
                }`}
              >
                {PERIOD_LABEL[p]}
                {p === value ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero radar — large 7-axis spider chart
// ---------------------------------------------------------------------------

interface HeroRadarProps {
  data: AgencyAnalyticsData;
  overlay: string[];
  overlayRows: AgencyAnalyticsData['comparisons'];
  hoverMetric: AnalyticsMetric | null;
  onHoverMetric: (m: AnalyticsMetric | null) => void;
  onRemoveOverlay: (id: string) => void;
}

function HeroRadar({
  data,
  overlay: _overlay,
  overlayRows,
  hoverMetric,
  onHoverMetric,
  onRemoveOverlay,
}: HeroRadarProps): JSX.Element {
  const SIZE = 460;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = 170;

  const overlayWithStyle = useMemo(
    () =>
      overlayRows.map((row, idx) => {
        const lb = data.subClientLeaderboard.find(
          (s) => s.id === row.subClientId,
        );
        const status: SubClientStatus = lb?.status ?? 'healthy';
        return {
          row,
          status,
          color: STATUS_HEX[status],
          delayPath: 0.2 + idx * 0.2,
          delayFill: 0.5 + idx * 0.2,
          delayDots: 0.7 + idx * 0.2,
          points: radarPoints(row, CX, CY, RADIUS),
          path: '',
          subClient: lb,
        };
      }),
    [overlayRows, data.subClientLeaderboard],
  );

  overlayWithStyle.forEach((o) => {
    o.path = radarPathD(o.points);
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Radar className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">
              Comparison atlas
            </h2>
            <p className="text-[11px] text-text-dim">
              7-axis radar · up to 3 sub-clients overlaid · click a mini below
              to toggle
            </p>
          </div>
        </div>
        <OverlayChips
          overlayRows={overlayRows}
          data={data}
          onRemove={onRemoveOverlay}
        />
      </header>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative flex items-center justify-center">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width="100%"
            height={SIZE}
            className="max-h-[460px]"
          >
            <defs>
              {overlayWithStyle.map((o, i) => (
                <radialGradient
                  key={`grad-${o.row.subClientId}-${i}`}
                  id={`overlayGrad-${o.row.subClientId}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor={o.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={o.color} stopOpacity={0.05} />
                </radialGradient>
              ))}
            </defs>

            <RadarGrid cx={CX} cy={CY} radius={RADIUS} />
            <RadarAxes
              cx={CX}
              cy={CY}
              radius={RADIUS}
              hoverMetric={hoverMetric}
              onHoverMetric={onHoverMetric}
            />

            {/* Overlay polygons */}
            {overlayWithStyle.map((o) => (
              <g key={o.row.subClientId}>
                <motion.path
                  d={o.path}
                  fill={`url(#overlayGrad-${o.row.subClientId})`}
                  stroke="none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: o.delayFill }}
                />
                <motion.path
                  d={o.path}
                  fill="none"
                  stroke={o.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0.8 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    duration: 1.1,
                    delay: o.delayPath,
                    ease: 'easeOut',
                  }}
                  style={{ filter: `drop-shadow(0 0 6px ${o.color}55)` }}
                />
                {o.points.map((p, idx) => (
                  <motion.circle
                    key={`dot-${o.row.subClientId}-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill={o.color}
                    stroke={HEX.surface}
                    strokeWidth={1.5}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      duration: 0.35,
                      delay: o.delayDots + idx * 0.04,
                      ease: 'backOut',
                    }}
                  />
                ))}
              </g>
            ))}

            {/* Centre marker */}
            <circle
              cx={CX}
              cy={CY}
              r={3}
              fill={HEX.textDim}
              opacity={0.6}
            />

            {/* Axis hover highlight */}
            {hoverMetric ? (
              <AxisHoverLine
                cx={CX}
                cy={CY}
                radius={RADIUS}
                metric={hoverMetric}
              />
            ) : null}
          </svg>

          <AxisTooltip
            hoverMetric={hoverMetric}
            overlayWithStyle={overlayWithStyle}
          />
        </div>

        <HeroLegend
          data={data}
          overlayWithStyle={overlayWithStyle}
        />
      </div>
    </motion.section>
  );
}

function RadarGrid({
  cx,
  cy,
  radius,
}: {
  cx: number;
  cy: number;
  radius: number;
}): JSX.Element {
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <g>
      {rings.map((r, i) => (
        <motion.polygon
          key={`ring-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.05 + i * 0.05 }}
          points={METRIC_ORDER.map((_, k) => {
            const angle = (Math.PI * 2 * k) / METRIC_ORDER.length - Math.PI / 2;
            const x = cx + Math.cos(angle) * radius * r;
            const y = cy + Math.sin(angle) * radius * r;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          }).join(' ')}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray={r === 1 ? '0' : '3 3'}
          opacity={r === 1 ? 0.8 : 0.45}
        />
      ))}
      {/* Numeric ring labels (25/50/75/100) on the vertical spine */}
      {rings.map((r, i) => (
        <motion.text
          key={`ringlabel-${i}`}
          x={cx + 4}
          y={cy - radius * r + 3}
          fontSize={9}
          fill={HEX.textFaint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
        >
          {Math.round(r * 100)}
        </motion.text>
      ))}
    </g>
  );
}

function RadarAxes({
  cx,
  cy,
  radius,
  hoverMetric,
  onHoverMetric,
}: {
  cx: number;
  cy: number;
  radius: number;
  hoverMetric: AnalyticsMetric | null;
  onHoverMetric: (m: AnalyticsMetric | null) => void;
}): JSX.Element {
  return (
    <g>
      {METRIC_ORDER.map((m, i) => {
        const angle = (Math.PI * 2 * i) / METRIC_ORDER.length - Math.PI / 2;
        const x2 = cx + Math.cos(angle) * radius;
        const y2 = cy + Math.sin(angle) * radius;
        const anchor = axisAnchor(cx, cy, radius, i, 22);
        const hovered = hoverMetric === m;
        const align: 'start' | 'middle' | 'end' =
          Math.abs(Math.cos(angle)) < 0.2
            ? 'middle'
            : Math.cos(angle) > 0
              ? 'start'
              : 'end';
        return (
          <g
            key={m}
            onMouseEnter={() => onHoverMetric(m)}
            onMouseLeave={() => onHoverMetric(null)}
            style={{ cursor: 'pointer' }}
          >
            <motion.line
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke={hovered ? HEX.accent : HEX.border}
              strokeWidth={hovered ? 1.6 : 1}
              opacity={hovered ? 0.9 : 0.45}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.08 + i * 0.04 }}
            />
            <motion.text
              x={anchor.x}
              y={anchor.y}
              fontSize={11}
              fontWeight={hovered ? 600 : 500}
              fill={hovered ? HEX.accent : HEX.textDim}
              textAnchor={align}
              dominantBaseline="middle"
              initial={{ opacity: 0, y: anchor.y + 6 }}
              animate={{ opacity: 1, y: anchor.y }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.05 }}
            >
              {METRIC_LABEL[m]}
            </motion.text>
            {/* Invisible hover hit area along the axis */}
            <line
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={20}
            />
          </g>
        );
      })}
    </g>
  );
}

function AxisHoverLine({
  cx,
  cy,
  radius,
  metric,
}: {
  cx: number;
  cy: number;
  radius: number;
  metric: AnalyticsMetric;
}): JSX.Element {
  const i = METRIC_ORDER.indexOf(metric);
  const angle = (Math.PI * 2 * i) / METRIC_ORDER.length - Math.PI / 2;
  const x2 = cx + Math.cos(angle) * radius;
  const y2 = cy + Math.sin(angle) * radius;
  return (
    <motion.line
      x1={cx}
      y1={cy}
      x2={x2}
      y2={y2}
      stroke={HEX.accent2}
      strokeWidth={1.5}
      strokeDasharray="4 4"
      opacity={0.7}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.7 }}
      transition={{ duration: 0.15 }}
    />
  );
}

interface OverlayStyle {
  row: AgencyAnalyticsData['comparisons'][number];
  status: SubClientStatus;
  color: string;
  delayPath: number;
  delayFill: number;
  delayDots: number;
  points: RadarPoint[];
  path: string;
  subClient: AgencyAnalyticsData['subClientLeaderboard'][number] | undefined;
}

function AxisTooltip({
  hoverMetric,
  overlayWithStyle,
}: {
  hoverMetric: AnalyticsMetric | null;
  overlayWithStyle: OverlayStyle[];
}): JSX.Element {
  return (
    <AnimatePresence>
      {hoverMetric ? (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute right-4 top-4 w-48 rounded-xl border border-border-muted bg-surface/95 p-3 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center gap-2 border-b border-border-muted pb-2">
            {(() => {
              const Icon = METRIC_ICON[hoverMetric];
              return <Icon className="h-3.5 w-3.5 text-accent" />;
            })()}
            <span className="text-xs font-semibold text-text">
              {METRIC_LABEL[hoverMetric]}
            </span>
          </div>
          <ul className="space-y-1.5 pt-2">
            {overlayWithStyle.length === 0 ? (
              <li className="text-[11px] text-text-dim">
                No sub-clients overlaid
              </li>
            ) : (
              overlayWithStyle.map((o) => {
                const v = metricValueOf(o.row, hoverMetric);
                return (
                  <li
                    key={o.row.subClientId}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="flex items-center gap-1.5 truncate text-text">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                      <span className="truncate">{o.row.subClientName}</span>
                    </span>
                    <span className="font-medium text-text">
                      {fmtMetricValue(hoverMetric, v)}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function OverlayChips({
  overlayRows,
  data,
  onRemove,
}: {
  overlayRows: AgencyAnalyticsData['comparisons'];
  data: AgencyAnalyticsData;
  onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {overlayRows.length === 0 ? (
        <span className="text-[11px] text-text-dim">No sub-clients selected</span>
      ) : null}
      {overlayRows.map((row) => {
        const lb = data.subClientLeaderboard.find(
          (s) => s.id === row.subClientId,
        );
        const status: SubClientStatus = lb?.status ?? 'healthy';
        return (
          <button
            key={row.subClientId}
            type="button"
            onClick={() => onRemove(row.subClientId)}
            className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_RING_CLASS[status]}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATUS_HEX[status] }}
            />
            <span className="truncate">{row.subClientName}</span>
            <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
          </button>
        );
      })}
    </div>
  );
}

function HeroLegend({
  data,
  overlayWithStyle,
}: {
  data: AgencyAnalyticsData;
  overlayWithStyle: OverlayStyle[];
}): JSX.Element {
  return (
    <aside className="space-y-3">
      <div className="rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
          <Layers className="h-3 w-3" />
          Active overlay
        </div>
        {overlayWithStyle.length === 0 ? (
          <p className="text-[11px] text-text-dim">
            Click a mini radar below to overlay a sub-client.
          </p>
        ) : (
          <ul className="space-y-2">
            {overlayWithStyle.map((o) => (
              <li
                key={o.row.subClientId}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{
                      backgroundColor: o.color,
                      boxShadow: `0 0 6px ${o.color}80`,
                    }}
                  />
                  <span className="truncate text-[12px] text-text">
                    {o.row.subClientName}
                  </span>
                </span>
                <span className="rounded-full border border-border-muted bg-surface px-1.5 py-0.5 text-[10px] text-text-dim">
                  {o.subClient
                    ? `${o.subClient.warmthScore}w`
                    : `${o.row.warmth}w`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
          <Crosshair className="h-3 w-3" />
          Status tint
        </div>
        <ul className="space-y-1.5 text-[11px]">
          {(['healthy', 'warming', 'at_risk'] as SubClientStatus[]).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_HEX[s] }}
              />
              <span className="text-text">{STATUS_LABEL[s]}</span>
              <span className="ml-auto text-text-dim">
                {
                  data.subClientLeaderboard.filter((c) => c.status === s)
                    .length
                }
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border-muted bg-surface-2/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
          <Gauge className="h-3 w-3" />
          Reading the chart
        </div>
        <p className="text-[11px] leading-relaxed text-text-dim">
          Larger polygon = stronger overall performance. Spam % and bounce %
          are inverted so that a larger shape always reads as better.
        </p>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mini radar grid — one micro-spider per sub-client
// ---------------------------------------------------------------------------

function MiniRadarGrid({
  data,
  overlay,
  topPerformerId,
  onToggle,
}: {
  data: AgencyAnalyticsData;
  overlay: string[];
  topPerformerId: string | null;
  onToggle: (id: string) => void;
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.18 }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">
              Sub-client mini radars
            </h2>
            <p className="text-[11px] text-text-dim">
              Click a card to add or remove from the hero overlay
            </p>
          </div>
        </div>
        <div className="text-[11px] text-text-dim">
          {overlay.length} / 3 overlaid
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.comparisons.map((row, i) => {
          const lb = data.subClientLeaderboard.find(
            (s) => s.id === row.subClientId,
          );
          const status: SubClientStatus = lb?.status ?? 'healthy';
          const selected = overlay.includes(row.subClientId);
          const topPerformer = topPerformerId === row.subClientId;
          return (
            <MiniRadarCard
              key={row.subClientId}
              row={row}
              subClient={lb}
              status={status}
              selected={selected}
              topPerformer={topPerformer}
              index={i}
              onClick={() => onToggle(row.subClientId)}
            />
          );
        })}
      </div>
    </motion.section>
  );
}

function MiniRadarCard({
  row,
  subClient,
  status,
  selected,
  topPerformer,
  index,
  onClick,
}: {
  row: AgencyAnalyticsData['comparisons'][number];
  subClient: AgencyAnalyticsData['subClientLeaderboard'][number] | undefined;
  status: SubClientStatus;
  selected: boolean;
  topPerformer: boolean;
  index: number;
  onClick: () => void;
}): JSX.Element {
  const SIZE = 140;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const RADIUS = 48;
  const points = useMemo(() => radarPoints(row, CX, CY, RADIUS), [row]);
  const path = useMemo(() => radarPathD(points), [points]);
  const color = STATUS_HEX[status];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 + index * 0.06 }}
      whileHover={{ y: -2 }}
      className={`group relative flex flex-col items-stretch overflow-hidden rounded-xl border bg-surface-2/40 p-3 text-left transition-colors ${
        selected
          ? 'border-accent/50 bg-accent/5'
          : 'border-border-muted hover:border-accent/30'
      }`}
      style={
        topPerformer
          ? {
              boxShadow:
                '0 0 0 1px rgba(242, 101, 34,0.5), 0 0 24px rgba(242, 101, 34,0.25)',
            }
          : undefined
      }
    >
      {topPerformer ? (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
          <Crown className="h-2.5 w-2.5" />
          Top
        </div>
      ) : null}

      <div className="mb-1 flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-semibold ${STATUS_RING_CLASS[status]}`}
        >
          {subClient?.logoChar ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">
            {row.subClientName}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-text-dim">
            <span
              className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
            />
            {STATUS_LABEL[status]}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height={SIZE}>
          {/* Mini grid rings */}
          {[0.5, 1].map((r, ri) => (
            <polygon
              key={`mr-${ri}`}
              points={METRIC_ORDER.map((_, k) => {
                const angle =
                  (Math.PI * 2 * k) / METRIC_ORDER.length - Math.PI / 2;
                const x = CX + Math.cos(angle) * RADIUS * r;
                const y = CY + Math.sin(angle) * RADIUS * r;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              }).join(' ')}
              fill="none"
              stroke={HEX.border}
              strokeWidth={1}
              opacity={r === 1 ? 0.7 : 0.35}
              strokeDasharray={r === 1 ? '0' : '2 2'}
            />
          ))}
          {/* Mini axes */}
          {METRIC_ORDER.map((_, k) => {
            const angle = (Math.PI * 2 * k) / METRIC_ORDER.length - Math.PI / 2;
            return (
              <line
                key={`ma-${k}`}
                x1={CX}
                y1={CY}
                x2={CX + Math.cos(angle) * RADIUS}
                y2={CY + Math.sin(angle) * RADIUS}
                stroke={HEX.border}
                strokeWidth={0.75}
                opacity={0.35}
              />
            );
          })}
          {/* Polygon */}
          <motion.path
            d={path}
            fill={color}
            fillOpacity={0.18}
            stroke={color}
            strokeWidth={1.4}
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 + index * 0.05 }}
          />
          {/* Dots */}
          {points.map((p, k) => (
            <circle
              key={`mp-${k}`}
              cx={p.x}
              cy={p.y}
              r={1.6}
              fill={color}
            />
          ))}
        </svg>
      </div>

      <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded-md bg-surface/70 px-1.5 py-1 text-center">
          <div className="text-text-dim">Sends</div>
          <div className="font-semibold text-text">
            {subClient ? fmtNumber(subClient.sends30d) : '—'}
          </div>
        </div>
        <div className="rounded-md bg-surface/70 px-1.5 py-1 text-center">
          <div className="text-text-dim">Inbox</div>
          <div className="font-semibold text-text">
            {subClient ? fmtPct(subClient.inboxPct, 0) : '—'}
          </div>
        </div>
        <div className="rounded-md bg-surface/70 px-1.5 py-1 text-center">
          <div className="text-text-dim">Warm</div>
          <div className="font-semibold text-text">
            {subClient ? subClient.warmthScore : '—'}
          </div>
        </div>
      </div>

      <div
        className={`mt-2 flex items-center justify-center gap-1 rounded-md border py-1 text-[10px] uppercase tracking-wider ${
          selected
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-border-muted bg-surface/60 text-text-dim group-hover:text-text'
        }`}
      >
        {selected ? (
          <>
            <Minus className="h-3 w-3" />
            In overlay
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            Compare
          </>
        )}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

type SortKey = AnalyticsMetric | 'name';

function ComparisonTable({
  data,
  overlay,
  onToggle,
}: {
  data: AgencyAnalyticsData;
  overlay: string[];
  onToggle: (id: string) => void;
}): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('warmth');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...data.comparisons];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.subClientName.localeCompare(b.subClientName);
      } else {
        cmp = metricValueOf(a, sortKey) - metricValueOf(b, sortKey);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data.comparisons, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return k;
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.24 }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent4/30 bg-accent4/10 text-accent4">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">
              Comparison table
            </h2>
            <p className="text-[11px] text-text-dim">
              Sortable per-metric · click a row to toggle overlay
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-1 text-[11px] text-text-dim sm:flex">
          <Search className="h-3.5 w-3.5" />
          Sorted by {METRIC_LABEL[sortKey as AnalyticsMetric] ?? 'Name'} (
          {sortDir})
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="bg-surface-2/40 text-text-dim">
              <Th onClick={() => onSort('name')} active={sortKey === 'name'} dir={sortDir} align="left">
                Sub-client
              </Th>
              {METRIC_ORDER.map((m) => (
                <Th
                  key={m}
                  onClick={() => onSort(m)}
                  active={sortKey === m}
                  dir={sortDir}
                  align="right"
                >
                  <span className="inline-flex items-center gap-1">
                    {(() => {
                      const Icon = METRIC_ICON[m];
                      return <Icon className="h-3 w-3" />;
                    })()}
                    {METRIC_LABEL[m]}
                  </span>
                </Th>
              ))}
              <Th
                onClick={() => undefined}
                active={false}
                dir={sortDir}
                align="right"
                static
              >
                Overlay
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const lb = data.subClientLeaderboard.find(
                (s) => s.id === row.subClientId,
              );
              const status: SubClientStatus = lb?.status ?? 'healthy';
              const inOverlay = overlay.includes(row.subClientId);
              return (
                <motion.tr
                  key={row.subClientId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
                  className={`border-t border-border-muted ${
                    inOverlay ? 'bg-accent/[0.04]' : 'hover:bg-surface-2/40'
                  }`}
                >
                  <td className="border-b border-border-muted px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold ${STATUS_RING_CLASS[status]}`}
                      >
                        {lb?.logoChar ?? '?'}
                      </div>
                      <div>
                        <div className="font-medium text-text">
                          {row.subClientName}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-text-dim">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
                          />
                          {STATUS_LABEL[status]}
                        </div>
                      </div>
                    </div>
                  </td>
                  {METRIC_ORDER.map((m) => {
                    const v = metricValueOf(row, m);
                    const bad = METRIC_BAD_HIGH[m] && v > 40;
                    return (
                      <td
                        key={m}
                        className="border-b border-border-muted px-4 py-2.5 text-right"
                      >
                        <ValueCell value={v} metric={m} bad={bad} />
                      </td>
                    );
                  })}
                  <td className="border-b border-border-muted px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onToggle(row.subClientId)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${
                        inOverlay
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
                      }`}
                    >
                      {inOverlay ? (
                        <>
                          <Minus className="h-3 w-3" />
                          Remove
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Add
                        </>
                      )}
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align,
  static: isStatic,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: 'asc' | 'desc';
  align: 'left' | 'right';
  static?: boolean;
}): JSX.Element {
  return (
    <th
      className={`border-b border-border-muted px-4 py-2 text-[10px] font-medium uppercase tracking-wider ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${isStatic ? '' : 'cursor-pointer select-none hover:text-text'}`}
      onClick={isStatic ? undefined : onClick}
    >
      <span
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'justify-end' : ''
        } ${active ? 'text-accent' : ''}`}
      >
        {children}
        {active ? (
          dir === 'asc' ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )
        ) : null}
      </span>
    </th>
  );
}

function ValueCell({
  value,
  metric,
  bad,
}: {
  value: number;
  metric: AnalyticsMetric;
  bad: boolean;
}): JSX.Element {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`text-[12px] font-semibold ${
          bad ? 'text-accent3' : 'text-text'
        }`}
      >
        {fmtMetricValue(metric, value)}
      </span>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            bad ? 'bg-accent3/70' : 'bg-accent/70'
          }`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — top performers, alerts, pulse
// ---------------------------------------------------------------------------

function TopPerformersPanel({
  data,
}: {
  data: AgencyAnalyticsData;
}): JSX.Element {
  // Pick the best sub-client per category.
  const bestBy = (
    pick: (
      r: AgencyAnalyticsData['comparisons'][number],
    ) => number,
    invert = false,
  ) => {
    const arr = [...data.comparisons];
    arr.sort((a, b) => (invert ? pick(a) - pick(b) : pick(b) - pick(a)));
    return arr[0];
  };

  const bestSends = bestBy((r) => r.sends);
  const bestInbox = bestBy((r) => r.inboxRate);
  const bestWarmth = bestBy((r) => r.warmth);
  const fastestGrowing = data.subClientLeaderboard
    .slice()
    .sort((a, b) => b.delta30dPct - a.delta30dPct)[0];

  const items = [
    {
      icon: Send,
      label: 'Best Sends',
      sub: bestSends?.subClientName ?? '—',
      value: bestSends ? Math.round(bestSends.sends).toString() : '—',
      tint: 'accent2',
    },
    {
      icon: Inbox,
      label: 'Best Inbox %',
      sub: bestInbox?.subClientName ?? '—',
      value: bestInbox ? `${Math.round(bestInbox.inboxRate)}%` : '—',
      tint: 'accent',
    },
    {
      icon: Flame,
      label: 'Best Warmth',
      sub: bestWarmth?.subClientName ?? '—',
      value: bestWarmth ? Math.round(bestWarmth.warmth).toString() : '—',
      tint: 'accent4',
    },
    {
      icon: TrendingUp,
      label: 'Fastest growing',
      sub: fastestGrowing?.name ?? '—',
      value: fastestGrowing
        ? `${fastestGrowing.delta30dPct >= 0 ? '+' : ''}${fastestGrowing.delta30dPct.toFixed(1)}%`
        : '—',
      tint: 'accent',
    },
  ] as const;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.16 }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Top performers</h3>
            <p className="text-[11px] text-text-dim">Best sub-client per metric</p>
          </div>
        </div>
        <Award className="h-4 w-4 text-text-dim" />
      </header>

      <ul className="divide-y divide-border-muted">
        {items.map((item, i) => {
          const Icon = item.icon;
          const tintClass =
            item.tint === 'accent'
              ? 'border-accent/30 bg-accent/10 text-accent'
              : item.tint === 'accent2'
                ? 'border-accent2/30 bg-accent2/10 text-accent2'
                : 'border-accent4/30 bg-accent4/10 text-accent4';
          return (
            <motion.li
              key={item.label}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tintClass}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-text-dim">
                  {item.label}
                </div>
                <div className="truncate text-[12px] font-medium text-text">
                  {item.sub}
                </div>
              </div>
              <div className="text-[13px] font-semibold text-text">
                {item.value}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function AlertsPanel({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.22 }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent3/30 bg-accent3/10 text-accent3">
            <Siren className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Weekly insights</h3>
            <p className="text-[11px] text-text-dim">
              Anomalies and trend callouts
            </p>
          </div>
        </div>
      </header>
      <ul className="divide-y divide-border-muted">
        {data.weeklyInsights.map((ins, i) => {
          const Icon = SEVERITY_ICON[ins.severity];
          return (
            <motion.li
              key={ins.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.05 }}
              className="flex items-start gap-3 px-4 py-3"
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${SEVERITY_RING[ins.severity]}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[12px] font-medium text-text">
                    {ins.headline}
                  </p>
                  <span className="rounded-full border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-dim">
                    {ins.weekOf}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-text-dim">
                  {ins.body}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function PortfolioPulse({
  data,
}: {
  data: AgencyAnalyticsData;
}): JSX.Element {
  const series = data.days30;
  const W = 280;
  const H = 80;
  const max = series.reduce((m, p) => Math.max(m, p.sends), 1);

  const points = series.map((p, i) => ({
    x: (i / Math.max(1, series.length - 1)) * W,
    y: H - (p.sends / max) * (H - 8) - 4,
  }));
  const path =
    points.length === 0
      ? ''
      : 'M ' +
        points
          .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' L ');

  const totals = useMemo(() => {
    return data.days30.reduce(
      (acc, d) => {
        acc.sends += d.sends;
        acc.opens += d.opens;
        acc.replies += d.replies;
        return acc;
      },
      { sends: 0, opens: 0, replies: 0 },
    );
  }, [data.days30]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.28 }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">
              Portfolio pulse
            </h3>
            <p className="text-[11px] text-text-dim">30d send volume</p>
          </div>
        </div>
        <Target className="h-4 w-4 text-text-dim" />
      </header>
      <div className="space-y-3 px-4 py-3">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          <defs>
            <linearGradient
              id="pulseGrad"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.45} />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <motion.path
            d={path}
            fill="none"
            stroke={HEX.accent2}
            strokeWidth={1.6}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
          />
          {points.length > 0 ? (
            <motion.path
              d={`${path} L ${W} ${H} L 0 ${H} Z`}
              fill="url(#pulseGrad)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.0 }}
            />
          ) : null}
        </svg>
        <div className="grid grid-cols-3 gap-2 text-center">
          <PulseStat
            label="Sends"
            value={fmtNumber(totals.sends)}
            icon={Send}
          />
          <PulseStat
            label="Opens"
            value={fmtNumber(totals.opens)}
            icon={Eye}
          />
          <PulseStat
            label="Replies"
            value={fmtNumber(totals.replies)}
            icon={Reply}
          />
        </div>
      </div>
    </motion.section>
  );
}

function PulseStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Send;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/60 px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-[13px] font-semibold text-text">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking helper — weighted score per sub-client (used to pick "top performer"
// and the default 3-up overlay).
// ---------------------------------------------------------------------------

interface Ranked {
  subClientId: string;
  score: number;
}

function rankSubClients(
  comparisons: AgencyAnalyticsData['comparisons'],
): Ranked[] {
  return comparisons
    .map((c) => {
      // Positive weights for "more = better" metrics; negative for "more = worse".
      const score =
        c.sends * 0.15 +
        c.opens * 0.15 +
        c.replies * 0.2 +
        c.inboxRate * 0.2 +
        (100 - c.spamRate) * 0.1 +
        (100 - c.bounceRate) * 0.1 +
        c.warmth * 0.1;
      return { subClientId: c.subClientId, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Misc decorative atoms — kept so future variants can reuse the same
// vocabulary without re-implementing. Currently consumed by the page above.
// ---------------------------------------------------------------------------

/** Tiny decorative meter — currently unused in the rendered tree but kept
 * exported for downstream pages that import this module's atoms. */
export function MetricMeter({
  value,
  color,
  width = 80,
}: {
  value: number;
  color?: string;
  width?: number;
}): JSX.Element {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-surface-2"
      style={{ width }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ backgroundColor: color ?? HEX.accent }}
      />
    </div>
  );
}

/** Provider chip — used by future variants for legend reuse. */
export function ProviderChip({ provider }: { provider: Provider }): JSX.Element {
  const Icon = PROVIDER_ICON[provider];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
      <Icon className="h-3 w-3" />
      {PROVIDER_LABEL[provider]}
    </span>
  );
}

/** Star score badge — re-exported for symmetry with sibling variants. */
export function StarBadge({ score }: { score: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent4/30 bg-accent4/10 px-1.5 py-0.5 text-[10px] text-accent4">
      <Star className="h-3 w-3" />
      {Math.round(score)}
    </span>
  );
}

/** Generic "no data" placeholder card. */
export function EmptyCard({
  title,
  body,
  icon: Icon = MailCheck,
}: {
  title: string;
  body: string;
  icon?: typeof Send;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-muted bg-surface/60 px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface-2 text-text-dim">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      <p className="mt-1 max-w-sm text-[12px] text-text-dim">{body}</p>
    </div>
  );
}

/** Decorative spark dot used by future variants. */
export function SparkDot({ tone = 'accent' }: { tone?: 'accent' | 'accent3' | 'accent4' }): JSX.Element {
  const cls =
    tone === 'accent3'
      ? 'bg-accent3'
      : tone === 'accent4'
        ? 'bg-accent4'
        : 'bg-accent';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}

/** Generic key-value pair row used inside inspector panels. */
export function KvRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Send;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-dim">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </span>
      <span className="text-[12px] font-medium text-text">{value}</span>
    </div>
  );
}

/** Decorative section divider used by reusable atoms below. */
export function SectionDivider({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: typeof Send;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-dim">
      {Icon ? <Icon className="h-3 w-3" /> : null}
      <span>{label}</span>
      <span className="flex-1 border-b border-dashed border-border-muted" />
    </div>
  );
}

/** Status pill - exported for variant symmetry. */
export function StatusPill({ status }: { status: SubClientStatus }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${STATUS_RING_CLASS[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Severity pill - exported for variant symmetry. */
export function SeverityPill({
  severity,
}: {
  severity: InsightSeverity;
}): JSX.Element {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${SEVERITY_RING[severity]}`}
    >
      <Icon className="h-3 w-3" />
      {severity}
    </span>
  );
}

/** Decorative subtle background grid used by future variants. */
export function SubtleGrid(): JSX.Element {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.06]"
    >
      <defs>
        <pattern
          id="subtleGrid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#subtleGrid)" />
    </svg>
  );
}

/** A small flame/gauge label used by sibling variants. */
export function GaugeChip({ value }: { value: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent4/30 bg-accent4/10 px-1.5 py-0.5 text-[10px] text-accent4">
      <Gauge className="h-3 w-3" />
      {Math.round(value)}
    </span>
  );
}

/** A small zap delta chip used by sibling variants. */
export function DeltaChip({ delta }: { delta: number }): JSX.Element {
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${
        up
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      {up ? (
        <Zap className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {up ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
}

/** A small message-square count chip used by sibling variants. */
export function ReplyChip({ count }: { count: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-1.5 py-0.5 text-[10px] text-accent2">
      <MessageSquare className="h-3 w-3" />
      {fmtNumber(count)}
    </span>
  );
}

/** A small shield/dns chip used by sibling variants. */
export function ShieldChip({ ok }: { ok: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${
        ok
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      <Shield className="h-3 w-3" />
      {ok ? 'OK' : 'Fail'}
    </span>
  );
}
