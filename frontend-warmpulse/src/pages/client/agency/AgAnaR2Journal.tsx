import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Bookmark,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Crown,
  Feather,
  Filter,
  Flag,
  Flame,
  Gauge,
  Globe,
  Inbox,
  Layers,
  LineChart as LineChartIcon,
  Mail,
  MailCheck,
  MailOpen,
  Medal,
  MessageSquare,
  Minus,
  Newspaper,
  PenTool,
  Pin,
  Quote,
  Reply,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgAnaR2Journal — Agency-tier Analytics, design candidate #2: "Insights Journal".
 *
 * The Agency Analytics surface re-imagined as an EDITORIAL JOURNAL — a
 * weekly diary of insights, each rendered as a story with a serif
 * HEADLINE, a drop-cap body paragraph, an embedded mini-chart, and a
 * byline. Reads like a curated weekly business-intelligence email turned
 * into a long-form scrollable page.
 *
 * Layout:
 *   - Top masthead (serif display): agency name + "ANALYTICS JOURNAL ·
 *     Vol. 30 · Last 30 days" subtitle + period selector + MoM chip.
 *   - KPI strip: 6 large editorial stat tiles (Sends / Opens / Replies /
 *     Inbox % / Avg warmth / MoM growth) with mono numerals.
 *   - Main canvas (lg:col-span-8): vertical "WEEKLY ENTRIES" timeline —
 *     most-recent week at top. Each entry has:
 *       · severity-tinted 4px accent strip on the left
 *       · large serif headline
 *       · subhead with the key metric
 *       · 2-line body paragraph with bouncy drop cap
 *       · embedded mini-chart (7-day sparkline or bars), severity-tinted
 *       · byline + share/save footer + decorative ornament divider
 *   - Right inspector (lg:col-span-4): "MONTHLY HIGHLIGHTS" — sub-client
 *     trophy leaderboard, provider performance bars, and a cursor-tracking
 *     30-day multi-metric line chart.
 *
 * Premium polish:
 *   - Sequential fade-up on mount (120ms stagger).
 *   - Headline shimmer sweep on first reveal.
 *   - Drop-cap scales in with a bounce spring.
 *   - Embedded charts draw in on viewport entry (intersection observer).
 *   - Inspector 30-day chart: vertical guide + dots + tooltip on cursor.
 *   - Subtle paper-grain CSS overlay (very low opacity).
 *   - Top-performer trophy card shimmers.
 *
 * Standalone — no shared imports, no network. Inline MOCK satisfies the
 * preview harness. Future adapters pass live data via `data` prop.
 */

// ---------------------------------------------------------------------------
// Shared Agency analytics data shape (kept in sync across all 4 variants).
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
// Mock content — 8 sub-clients, 30 days of series, 4 weekly insights.
// ---------------------------------------------------------------------------

function buildDays30(): AgencyAnalyticsData['days30'] {
  const out: AgencyAnalyticsData['days30'] = [];
  const today = new Date('2026-05-27T00:00:00Z');
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    // gentle ramp up across the month with some weekly oscillation.
    const base = 1100 + (29 - i) * 12;
    const weekly = Math.sin(((29 - i) / 7) * Math.PI) * 110;
    const noise = ((i * 9301 + 49297) % 233233) / 233233 - 0.5;
    const sends = Math.max(700, Math.round(base + weekly + noise * 180));
    const opens = Math.round(sends * (0.39 + noise * 0.06));
    const replies = Math.round(sends * (0.07 + noise * 0.02));
    const inboxPct = 88 + (((29 - i) / 29) * 6) + noise * 1.4;
    out.push({
      date: iso,
      sends,
      opens,
      replies,
      inboxPct: Math.max(80, Math.min(97, Number(inboxPct.toFixed(1)))),
    });
  }
  return out;
}

const MOCK_DAYS30 = buildDays30();

const MOCK: AgencyAnalyticsData = {
  workspace: { name: 'Northwind Analytics', subClientCount: 8, mailboxCount: 42 },
  period: 'last_30d',
  kpis: {
    totalSends30d: MOCK_DAYS30.reduce((s, d) => s + d.sends, 0),
    totalOpens30d: MOCK_DAYS30.reduce((s, d) => s + d.opens, 0),
    totalReplies30d: MOCK_DAYS30.reduce((s, d) => s + d.replies, 0),
    inboxRatePct: 92.4,
    spamRatePct: 1.8,
    bounceRatePct: 0.9,
    avgWarmth: 81,
    momGrowthPct: 14.6,
  },
  days30: MOCK_DAYS30,
  funnel: {
    sends: 38_420,
    delivered: 38_080,
    inboxed: 35_504,
    opened: 14_852,
    replied: 2_704,
  },
  providerMix: [
    { provider: 'gmail', sends: 18_120, inboxPct: 94.1, spamPct: 1.4, blockedPct: 0.4 },
    { provider: 'outlook', sends: 11_460, inboxPct: 90.8, spamPct: 2.6, blockedPct: 0.8 },
    { provider: 'yahoo', sends: 4_980, inboxPct: 88.2, spamPct: 3.1, blockedPct: 1.1 },
    { provider: 'smtp', sends: 3_860, inboxPct: 89.4, spamPct: 2.2, blockedPct: 0.6 },
  ],
  subClientLeaderboard: [
    {
      id: 'sc-helix',
      name: 'Helix Analytics',
      logoChar: 'H',
      sends30d: 6_840,
      inboxPct: 95.6,
      warmthScore: 88,
      delta30dPct: 18.2,
      status: 'healthy',
    },
    {
      id: 'sc-aurora',
      name: 'Aurora Studios',
      logoChar: 'A',
      sends30d: 5_910,
      inboxPct: 93.8,
      warmthScore: 84,
      delta30dPct: 12.4,
      status: 'healthy',
    },
    {
      id: 'sc-cascade',
      name: 'Cascade Logistics',
      logoChar: 'C',
      sends30d: 5_220,
      inboxPct: 92.1,
      warmthScore: 82,
      delta30dPct: 9.6,
      status: 'healthy',
    },
    {
      id: 'sc-ember',
      name: 'Ember Foundry',
      logoChar: 'E',
      sends30d: 4_780,
      inboxPct: 91.4,
      warmthScore: 79,
      delta30dPct: 6.1,
      status: 'healthy',
    },
    {
      id: 'sc-fjord',
      name: 'Fjord & Co.',
      logoChar: 'F',
      sends30d: 4_120,
      inboxPct: 88.6,
      warmthScore: 74,
      delta30dPct: 3.4,
      status: 'warming',
    },
    {
      id: 'sc-quartz',
      name: 'Quartz Robotics',
      logoChar: 'Q',
      sends30d: 3_840,
      inboxPct: 87.2,
      warmthScore: 71,
      delta30dPct: 1.8,
      status: 'warming',
    },
    {
      id: 'sc-meridian',
      name: 'Meridian Health',
      logoChar: 'M',
      sends30d: 3_460,
      inboxPct: 84.5,
      warmthScore: 66,
      delta30dPct: -2.8,
      status: 'warming',
    },
    {
      id: 'sc-tundra',
      name: 'Tundra Outfitters',
      logoChar: 'T',
      sends30d: 2_960,
      inboxPct: 79.4,
      warmthScore: 58,
      delta30dPct: -7.6,
      status: 'at_risk',
    },
  ],
  weeklyInsights: [
    {
      id: 'wk-21',
      weekOf: 'Week of May 18, 2026',
      headline: 'Helix Analytics breaks all-time inbox record',
      body:
        'Helix climbed to 95.6% inbox placement this week — its highest figure since onboarding nineteen months ago. The lift correlates with the Gmail reputation thaw that began on May 9, suggesting the warmup ladder advance to D29+ was timed nearly perfectly. Outlook placement has also held above 92% all week.',
      metric: '+18% sends · 95.6% inbox placement · warmth 88',
      severity: 'success',
    },
    {
      id: 'wk-20',
      weekOf: 'Week of May 11, 2026',
      headline: 'Tundra Outfitters slips below the 80% inbox threshold',
      body:
        'Tundra recorded 79.4% inbox placement across the week — the first time it has dropped under eighty since enrolment. The decline tracks a Yahoo spam-complaint spike on May 13 and two bounced peer-pool sends on May 15. We recommend pausing Tundra’s scale-up step until reputation stabilises.',
      metric: '−7.6% trend · 79.4% inbox · 3 spam events',
      severity: 'critical',
    },
    {
      id: 'wk-19',
      weekOf: 'Week of May 04, 2026',
      headline: 'Outlook tenants outpace Gmail tenants in reply lift',
      body:
        'For the first time this quarter, sub-clients running primarily on Outlook posted a higher week-over-week reply rate than Gmail-heavy peers — 8.1% versus 7.4%. The shift is small but consistent across Cascade, Aurora, and Ember; we are watching whether it survives the next ramp tick.',
      metric: 'Outlook reply +0.7pt · Gmail steady · 4 sub-clients',
      severity: 'info',
    },
    {
      id: 'wk-18',
      weekOf: 'Week of Apr 27, 2026',
      headline: 'Meridian Health enters a quiet warming phase',
      body:
        'Meridian throttled itself down to a four-day soft-ramp after a small bounce uptick on April 28. Daily target is now 38 (was 52). Inbox placement has held at 84% throughout, and the peer-pool rotation flagged no degraded peers — this is a controlled deceleration, not a regression.',
      metric: 'Daily target 52 → 38 · 84.5% inbox · 0 alerts',
      severity: 'warn',
    },
  ],
  comparisons: [
    {
      subClientId: 'sc-helix',
      subClientName: 'Helix Analytics',
      sends: 6_840,
      opens: 2_736,
      replies: 547,
      inboxRate: 95.6,
      spamRate: 1.1,
      bounceRate: 0.4,
      warmth: 88,
    },
    {
      subClientId: 'sc-aurora',
      subClientName: 'Aurora Studios',
      sends: 5_910,
      opens: 2_305,
      replies: 414,
      inboxRate: 93.8,
      spamRate: 1.4,
      bounceRate: 0.5,
      warmth: 84,
    },
    {
      subClientId: 'sc-cascade',
      subClientName: 'Cascade Logistics',
      sends: 5_220,
      opens: 1_984,
      replies: 350,
      inboxRate: 92.1,
      spamRate: 1.7,
      bounceRate: 0.6,
      warmth: 82,
    },
    {
      subClientId: 'sc-ember',
      subClientName: 'Ember Foundry',
      sends: 4_780,
      opens: 1_768,
      replies: 311,
      inboxRate: 91.4,
      spamRate: 1.8,
      bounceRate: 0.7,
      warmth: 79,
    },
    {
      subClientId: 'sc-fjord',
      subClientName: 'Fjord & Co.',
      sends: 4_120,
      opens: 1_442,
      replies: 247,
      inboxRate: 88.6,
      spamRate: 2.2,
      bounceRate: 0.9,
      warmth: 74,
    },
    {
      subClientId: 'sc-quartz',
      subClientName: 'Quartz Robotics',
      sends: 3_840,
      opens: 1_306,
      replies: 211,
      inboxRate: 87.2,
      spamRate: 2.5,
      bounceRate: 1.0,
      warmth: 71,
    },
    {
      subClientId: 'sc-meridian',
      subClientName: 'Meridian Health',
      sends: 3_460,
      opens: 1_142,
      replies: 173,
      inboxRate: 84.5,
      spamRate: 3.0,
      bounceRate: 1.4,
      warmth: 66,
    },
    {
      subClientId: 'sc-tundra',
      subClientName: 'Tundra Outfitters',
      sends: 2_960,
      opens: 858,
      replies: 109,
      inboxRate: 79.4,
      spamRate: 3.9,
      bounceRate: 1.9,
      warmth: 58,
    },
  ],
};

// ---------------------------------------------------------------------------
// Skeleton constant (loading placeholder shape).
// ---------------------------------------------------------------------------

export const AGENCY_ANALYTICS_SKELETON_R2: AgencyAnalyticsData = {
  workspace: { name: '—', subClientCount: 0, mailboxCount: 0 },
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
// Small typed utilities.
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function compactInt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fullInt(n: number): string {
  return formatNumber(n);
}

function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function severityRing(severity: InsightSeverity): string {
  switch (severity) {
    case 'success':
      return 'bg-accent';
    case 'warn':
      return 'bg-accent3';
    case 'critical':
      return 'bg-accent3';
    default:
      return 'bg-accent';
  }
}

function severityTextToken(severity: InsightSeverity): string {
  switch (severity) {
    case 'success':
      return 'text-accent';
    case 'warn':
      return 'text-accent3';
    case 'critical':
      return 'text-accent3';
    default:
      return 'text-accent';
  }
}

function severityChipBg(severity: InsightSeverity): string {
  switch (severity) {
    case 'success':
      return 'bg-accent/12 text-accent border-accent/30';
    case 'warn':
      return 'bg-accent3/12 text-accent3 border-accent3/30';
    case 'critical':
      return 'bg-accent3/12 text-accent3 border-accent3/30';
    default:
      return 'bg-accent/12 text-accent border-accent/30';
  }
}

function severityFill(severity: InsightSeverity): string {
  switch (severity) {
    case 'success':
      return 'rgb(16 185 129)';
    case 'warn':
      return 'rgb(245 158 11)';
    case 'critical':
      return 'rgb(244 63 94)';
    default:
      return 'rgb(99 102 241)';
  }
}

function severityLabel(severity: InsightSeverity): string {
  switch (severity) {
    case 'success':
      return 'STORY · POSITIVE';
    case 'warn':
      return 'STORY · CAUTION';
    case 'critical':
      return 'STORY · CRITICAL';
    default:
      return 'STORY · INSIGHT';
  }
}

function severityIcon(
  severity: InsightSeverity,
): (props: { className?: string }) => JSX.Element {
  switch (severity) {
    case 'success':
      return (props) => <CheckCircle2 className={props.className} />;
    case 'warn':
      return (props) => <AlertTriangle className={props.className} />;
    case 'critical':
      return (props) => <ShieldAlert className={props.className} />;
    default:
      return (props) => <Sparkles className={props.className} />;
  }
}

function providerLabel(provider: Provider): string {
  switch (provider) {
    case 'gmail':
      return 'Gmail';
    case 'outlook':
      return 'Outlook';
    case 'yahoo':
      return 'Yahoo';
    case 'smtp':
      return 'SMTP';
  }
}

function periodLabel(p: AnalyticsPeriod): string {
  switch (p) {
    case 'last_7d':
      return 'Last 7 days';
    case 'last_30d':
      return 'Last 30 days';
    case 'last_90d':
      return 'Last 90 days';
    case 'last_year':
      return 'Last year';
  }
}

function statusToken(status: SubClientStatus): string {
  switch (status) {
    case 'healthy':
      return 'text-accent';
    case 'warming':
      return 'text-accent3';
    case 'at_risk':
      return 'text-accent3';
  }
}

function statusChipToken(status: SubClientStatus): string {
  switch (status) {
    case 'healthy':
      return 'bg-accent/12 text-accent border-accent/30';
    case 'warming':
      return 'bg-accent3/12 text-accent3 border-accent3/30';
    case 'at_risk':
      return 'bg-accent3/12 text-accent3 border-accent3/30';
  }
}

// ---------------------------------------------------------------------------
// Per-insight sparkline / bar window. We slice the days30 series into four
// weekly windows for the four weekly entries.
// ---------------------------------------------------------------------------

interface WeekSlice {
  sends: number[];
  opens: number[];
  replies: number[];
  inbox: number[];
  dates: string[];
}

function buildWeekSlices(days: AgencyAnalyticsData['days30']): WeekSlice[] {
  const slices: WeekSlice[] = [];
  // 30 days = ~4 weeks. We take the most-recent 7 first, then back 7, etc.
  const safe = days.length >= 28 ? days : [...days];
  for (let week = 0; week < 4; week += 1) {
    const end = safe.length - week * 7;
    const start = Math.max(0, end - 7);
    const window = safe.slice(start, end);
    slices.push({
      sends: window.map((d) => d.sends),
      opens: window.map((d) => d.opens),
      replies: window.map((d) => d.replies),
      inbox: window.map((d) => d.inboxPct),
      dates: window.map((d) => d.date),
    });
  }
  return slices;
}

// ---------------------------------------------------------------------------
// Reusable shimmer / paper-grain decoration helpers.
// ---------------------------------------------------------------------------

function PaperGrain(): JSX.Element {
  const grain = useMemo<CSSProperties>(
    () => ({
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      backgroundRepeat: 'repeat',
      backgroundSize: '180px 180px',
      mixBlendMode: 'overlay',
      pointerEvents: 'none',
      opacity: 0.18,
    }),
    [],
  );
  return <div aria-hidden className="absolute inset-0" style={grain} />;
}

function HeadlineShimmer({ delay = 0 }: { delay?: number }): JSX.Element {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 -skew-x-12"
      style={{
        background:
          'linear-gradient(110deg, transparent 0%, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%, transparent 100%)',
      }}
      initial={{ x: '-130%' }}
      animate={{ x: '130%' }}
      transition={{ delay: 0.4 + delay, duration: 1.6, ease: 'easeOut' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Tiny chart primitives — all SVG, no external libs.
// ---------------------------------------------------------------------------

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke: string;
  fill?: string;
  showArea?: boolean;
  draw: boolean;
  dotIndex?: number;
}

function Sparkline({
  values,
  width = 360,
  height = 96,
  stroke,
  fill,
  showArea = true,
  draw,
  dotIndex,
}: SparklineProps): JSX.Element {
  const padX = 6;
  const padY = 10;
  const { path, areaPath, points } = useMemo(() => {
    if (values.length === 0) {
      return { path: '', areaPath: '', points: [] as Array<{ x: number; y: number }> };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = (width - padX * 2) / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => ({
      x: padX + i * stepX,
      y: padY + (1 - (v - min) / span) * (height - padY * 2),
    }));
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${d} L${pts[pts.length - 1]!.x.toFixed(1)},${height - padY} L${pts[0]!.x.toFixed(1)},${height - padY} Z`;
    return { path: d, areaPath: area, points: pts };
  }, [values, width, height]);

  const gradId = useMemo(
    () => `sg-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill ?? stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={fill ?? stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showArea && areaPath ? (
        <motion.path
          d={areaPath}
          fill={`url(#${gradId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: draw ? 1 : 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      ) : null}
      {path ? (
        <motion.path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: draw ? 1 : 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ) : null}
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={dotIndex === i ? 3.6 : 2}
          fill={stroke}
          initial={{ opacity: 0 }}
          animate={{ opacity: draw ? (dotIndex === i ? 1 : 0.45) : 0 }}
          transition={{ delay: 0.4 + i * 0.04, duration: 0.3 }}
        />
      ))}
    </svg>
  );
}

interface MiniBarsProps {
  values: number[];
  labels?: string[];
  width?: number;
  height?: number;
  fill: string;
  draw: boolean;
}

function MiniBars({
  values,
  labels,
  width = 360,
  height = 96,
  fill,
  draw,
}: MiniBarsProps): JSX.Element {
  const padX = 6;
  const padY = 10;
  const gap = 6;
  const max = Math.max(...values, 1);
  const barW = (width - padX * 2 - gap * (values.length - 1)) / values.length;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      {values.map((v, i) => {
        const h = ((v / max) * (height - padY * 2));
        const x = padX + i * (barW + gap);
        const y = height - padY - h;
        return (
          <g key={i}>
            <motion.rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={2}
              fill={fill}
              fillOpacity={0.85}
              initial={{ scaleY: 0, originY: 1 }}
              style={{ transformOrigin: `${x + barW / 2}px ${height - padY}px` }}
              animate={{ scaleY: draw ? 1 : 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.45, ease: 'easeOut' }}
            />
            {labels ? (
              <text
                x={x + barW / 2}
                y={height - 1}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(255,255,255,0.45)"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {labels[i]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inspector multi-metric 30-day chart with cursor tracking.
// ---------------------------------------------------------------------------

interface InspectorChartProps {
  days: AgencyAnalyticsData['days30'];
}

function InspectorChart({ days }: InspectorChartProps): JSX.Element {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const width = 480;
  const height = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 24;

  const sends = days.map((d) => d.sends);
  const opens = days.map((d) => d.opens);
  const replies = days.map((d) => d.replies);
  const inbox = days.map((d) => d.inboxPct);

  const sendsMax = Math.max(...sends, 1);
  const inboxMax = 100;
  const inboxMin = 60;

  const project = (i: number, v: number, max: number, min = 0): { x: number; y: number } => {
    const x = padL + (i / Math.max(days.length - 1, 1)) * (width - padL - padR);
    const y = padT + (1 - (v - min) / (max - min)) * (height - padT - padB);
    return { x, y };
  };

  const buildPath = (vals: number[], max: number, min = 0): string =>
    vals
      .map((v, i) => {
        const p = project(i, v, max, min);
        return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  const sendsPath = buildPath(sends, sendsMax);
  const opensPath = buildPath(opens, sendsMax);
  const repliesPath = buildPath(replies, sendsMax);
  const inboxPath = buildPath(inbox, inboxMax, inboxMin);

  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const xRel = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(
      ((xRel - padL) / (width - padL - padR)) * (days.length - 1),
    );
    setHover(clamp(i, 0, days.length - 1));
  };

  const onLeave = (): void => setHover(null);

  const cursorX =
    hover !== null
      ? padL + (hover / Math.max(days.length - 1, 1)) * (width - padL - padR)
      : null;

  const tooltipPos = useMemo(() => {
    if (hover === null) return null;
    const ix = clamp(hover, 0, days.length - 1);
    const px = padL + (ix / Math.max(days.length - 1, 1)) * (width - padL - padR);
    const flip = px > width * 0.6;
    return { x: flip ? px - 158 : px + 12, y: padT + 8 };
  }, [hover, days.length]);

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        role="img"
        aria-label="30-day metric chart"
      >
        <defs>
          <linearGradient id="sendsGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + t * (height - padT - padB);
          return (
            <line
              key={t}
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="2 4"
            />
          );
        })}

        {/* sends area */}
        <motion.path
          d={`${sendsPath} L${width - padR},${height - padB} L${padL},${height - padB} Z`}
          fill="url(#sendsGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />

        <motion.path
          d={sendsPath}
          fill="none"
          stroke="rgb(99 102 241)"
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: mounted ? 1 : 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
        <motion.path
          d={opensPath}
          fill="none"
          stroke="rgb(56 189 248)"
          strokeWidth={1.6}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: mounted ? 1 : 0 }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1 }}
        />
        <motion.path
          d={repliesPath}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth={1.6}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: mounted ? 1 : 0 }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
        />
        <motion.path
          d={inboxPath}
          fill="none"
          stroke="rgb(245 158 11)"
          strokeWidth={1.4}
          strokeDasharray="3 3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: mounted ? 1 : 0 }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }}
        />

        {cursorX !== null ? (
          <line
            x1={cursorX}
            x2={cursorX}
            y1={padT}
            y2={height - padB}
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="2 3"
          />
        ) : null}

        {hover !== null
          ? [
              { vals: sends, max: sendsMax, color: 'rgb(99 102 241)' },
              { vals: opens, max: sendsMax, color: 'rgb(56 189 248)' },
              { vals: replies, max: sendsMax, color: 'rgb(16 185 129)' },
              { vals: inbox, max: inboxMax, min: inboxMin, color: 'rgb(245 158 11)' },
            ].map((m, k) => {
              const p = project(hover, m.vals[hover]!, m.max, m.min ?? 0);
              return (
                <circle
                  key={k}
                  cx={p.x}
                  cy={p.y}
                  r={3.6}
                  fill={m.color}
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={1}
                />
              );
            })
          : null}

        {[0, 0.5, 1].map((t) => {
          const i = Math.round(t * (days.length - 1));
          const d = days[i];
          if (!d) return null;
          return (
            <text
              key={t}
              x={padL + t * (width - padL - padR)}
              y={height - 6}
              textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
              fontSize={9}
              fill="rgba(255,255,255,0.45)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {d.date.slice(5)}
            </text>
          );
        })}

        {[0.25, 0.5, 0.75, 1].map((t) => {
          const v = Math.round(t * sendsMax);
          return (
            <text
              key={t}
              x={padL - 6}
              y={padT + (1 - t) * (height - padT - padB) + 3}
              textAnchor="end"
              fontSize={8.5}
              fill="rgba(255,255,255,0.4)"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {compactInt(v)}
            </text>
          );
        })}
      </svg>

      <AnimatePresence>
        {hover !== null && tooltipPos ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-10 w-[160px] rounded-lg border border-border-muted bg-surface-2/95 px-3 py-2 shadow-xl backdrop-blur"
            style={{
              left: `${(tooltipPos.x / width) * 100}%`,
              top: `${(tooltipPos.y / height) * 100}%`,
            }}
          >
            <div className="mb-1 font-mono text-[10px] text-text-dim">
              {days[hover]?.date}
            </div>
            <ChartTooltipRow
              dot="rgb(99 102 241)"
              label="Sends"
              value={fullInt(days[hover]?.sends ?? 0)}
            />
            <ChartTooltipRow
              dot="rgb(56 189 248)"
              label="Opens"
              value={fullInt(days[hover]?.opens ?? 0)}
            />
            <ChartTooltipRow
              dot="rgb(16 185 129)"
              label="Replies"
              value={fullInt(days[hover]?.replies ?? 0)}
            />
            <ChartTooltipRow
              dot="rgb(245 158 11)"
              label="Inbox %"
              value={pct(days[hover]?.inboxPct ?? 0)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ChartTooltipRow({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: dot }}
        />
        <span className="text-[11px] text-text-dim">{label}</span>
      </div>
      <span className="font-mono text-[11px] text-text">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Masthead.
// ---------------------------------------------------------------------------

interface MastheadProps {
  data: AgencyAnalyticsData;
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
  volume: number;
}

function Masthead({ data, period, onPeriodChange, volume }: MastheadProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const periods: AnalyticsPeriod[] = ['last_7d', 'last_30d', 'last_90d', 'last_year'];
  const mom = data.kpis.momGrowthPct;
  const momPositive = mom >= 0;

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-6 py-6"
    >
      <PaperGrain />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-text-dim">
            <Newspaper className="h-3 w-3" />
            <span>The Analytics Journal</span>
            <span aria-hidden>·</span>
            <span>Vol. {volume}</span>
            <span aria-hidden>·</span>
            <span>{periodLabel(period)}</span>
          </div>
          <h1
            className="text-4xl font-semibold leading-tight text-text lg:text-5xl"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            {data.workspace.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>{data.workspace.subClientCount} sub-clients</span>
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4" />
              <span>{data.workspace.mailboxCount} mailboxes</span>
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>Published May 27, 2026</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text hover:border-accent/40"
            >
              <Filter className="h-4 w-4 text-text-dim" />
              <span>{periodLabel(period)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-text-dim" />
            </button>
            <AnimatePresence>
              {open ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border-muted bg-surface-2 shadow-xl"
                >
                  {periods.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onPeriodChange(p);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg ${
                        p === period ? 'text-accent' : 'text-text'
                      }`}
                    >
                      <span>{periodLabel(p)}</span>
                      {p === period ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              momPositive
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-accent3/30 bg-accent3/10 text-accent3'
            }`}
          >
            {momPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span className="font-mono">
              {momPositive ? '+' : ''}
              {mom.toFixed(1)}% MoM
            </span>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text hover:border-accent/40"
          >
            <Share2 className="h-4 w-4 text-text-dim" />
            <span>Share</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent hover:bg-accent/15"
          >
            <PenTool className="h-4 w-4" />
            <span>Compose entry</span>
          </button>
        </div>
      </div>
    </motion.header>
  );
}

// ---------------------------------------------------------------------------
// KPI strip.
// ---------------------------------------------------------------------------

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  icon: JSX.Element;
  delay: number;
  emphasis?: boolean;
}

function KpiTile({
  label,
  value,
  hint,
  delta,
  icon,
  delay,
  emphasis,
}: KpiTileProps): JSX.Element {
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className={`relative overflow-hidden rounded-xl border bg-surface px-4 py-4 ${
        emphasis ? 'border-accent/40' : 'border-border-muted'
      }`}
    >
      {emphasis ? <PaperGrain /> : null}
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
            {label}
          </div>
          <div
            className="mt-1 font-mono text-2xl font-semibold text-text"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {value}
          </div>
          {hint ? <div className="mt-0.5 text-[11px] text-text-dim">{hint}</div> : null}
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            emphasis ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
          }`}
        >
          {icon}
        </div>
      </div>
      {typeof delta === 'number' ? (
        <div className="relative mt-3 flex items-center gap-1.5 text-[11px]">
          {positive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-accent3" />
          )}
          <span
            className={`font-mono ${positive ? 'text-accent' : 'text-accent3'}`}
          >
            {positive ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
          <span className="text-text-dim">vs. prior 30d</span>
        </div>
      ) : null}
    </motion.div>
  );
}

function KpiStrip({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  const k = data.kpis;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiTile
        label="Sends"
        value={compactInt(k.totalSends30d)}
        hint={`${fullInt(k.totalSends30d)} total`}
        delta={k.momGrowthPct}
        icon={<Send className="h-4 w-4" />}
        delay={0.05}
      />
      <KpiTile
        label="Opens"
        value={compactInt(k.totalOpens30d)}
        hint={`${pct((k.totalOpens30d / Math.max(k.totalSends30d, 1)) * 100)} rate`}
        delta={6.2}
        icon={<MailOpen className="h-4 w-4" />}
        delay={0.12}
      />
      <KpiTile
        label="Replies"
        value={compactInt(k.totalReplies30d)}
        hint={`${pct((k.totalReplies30d / Math.max(k.totalSends30d, 1)) * 100)} rate`}
        delta={4.9}
        icon={<Reply className="h-4 w-4" />}
        delay={0.19}
      />
      <KpiTile
        label="Inbox"
        value={pct(k.inboxRatePct)}
        hint={`Spam ${pct(k.spamRatePct)}`}
        delta={2.4}
        icon={<Inbox className="h-4 w-4" />}
        delay={0.26}
        emphasis
      />
      <KpiTile
        label="Avg warmth"
        value={String(k.avgWarmth)}
        hint="across 42 mailboxes"
        delta={3.1}
        icon={<Flame className="h-4 w-4" />}
        delay={0.33}
      />
      <KpiTile
        label="MoM growth"
        value={`${k.momGrowthPct >= 0 ? '+' : ''}${k.momGrowthPct.toFixed(1)}%`}
        hint="vs. previous period"
        icon={<TrendingUp className="h-4 w-4" />}
        delay={0.4}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pull-quote / editorial callouts.
// ---------------------------------------------------------------------------

function PullQuote({
  text,
  attribution,
}: {
  text: string;
  attribution?: string;
}): JSX.Element {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-6 py-6"
    >
      <PaperGrain />
      <Quote
        className="absolute -left-2 -top-2 h-16 w-16 text-accent/15"
        strokeWidth={1.5}
      />
      <blockquote
        className="relative pl-12 text-xl leading-relaxed text-text lg:text-2xl"
        style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
      >
        {text}
      </blockquote>
      {attribution ? (
        <figcaption className="relative mt-3 pl-12 font-mono text-[11px] uppercase tracking-[0.24em] text-text-dim">
          — {attribution}
        </figcaption>
      ) : null}
    </motion.figure>
  );
}

// ---------------------------------------------------------------------------
// Decorative ornament between entries.
// ---------------------------------------------------------------------------

function Ornament(): JSX.Element {
  return (
    <div aria-hidden className="flex items-center justify-center py-4">
      <span className="h-px w-12 bg-border-muted" />
      <span className="mx-3 text-text-dim">
        <Feather className="h-3.5 w-3.5" />
      </span>
      <span className="h-px w-3 bg-border-muted" />
      <span className="mx-2 text-text-dim">
        <span className="block h-1 w-1 rounded-full bg-border-muted" />
      </span>
      <span className="h-px w-3 bg-border-muted" />
      <span className="mx-3 text-text-dim">
        <Feather className="h-3.5 w-3.5 -scale-x-100" />
      </span>
      <span className="h-px w-12 bg-border-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly entry — the editorial story card.
// ---------------------------------------------------------------------------

interface WeeklyEntryProps {
  insight: AgencyAnalyticsData['weeklyInsights'][number];
  slice: WeekSlice;
  index: number;
}

function WeeklyEntry({ insight, slice, index }: WeeklyEntryProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0% -15% 0%' });
  const [saved, setSaved] = useState(false);

  const SeverityIcon = severityIcon(insight.severity);
  const fill = severityFill(insight.severity);

  const useBars =
    insight.severity === 'critical' ||
    insight.severity === 'warn' ||
    index === 2;

  const chartValues =
    insight.severity === 'critical'
      ? slice.inbox
      : insight.severity === 'success'
        ? slice.sends
        : insight.severity === 'warn'
          ? slice.replies
          : slice.opens;

  const stats = useMemo(() => {
    const vals = chartValues;
    if (!vals.length) return { avg: 0, max: 0, min: 0 };
    return {
      avg: vals.reduce((s, v) => s + v, 0) / vals.length,
      max: Math.max(...vals),
      min: Math.min(...vals),
    };
  }, [chartValues]);

  const body = insight.body;
  const firstChar = body.charAt(0);
  const restBody = body.slice(1);

  const dotIdx = chartValues.indexOf(stats.max);

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: index * 0.12, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface"
    >
      <PaperGrain />
      {/* Severity strip */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1 ${severityRing(insight.severity)}`}
      />

      <div className="relative grid gap-6 px-6 py-6 md:grid-cols-[1fr_320px] md:px-8 md:py-7">
        <div>
          {/* meta row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${severityChipBg(
                  insight.severity,
                )}`}
              >
                <SeverityIcon className="h-3 w-3" />
                <span>{severityLabel(insight.severity)}</span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">
                {insight.weekOf}
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
              entry №{String(index + 1).padStart(2, '0')}
            </span>
          </div>

          {/* Headline */}
          <div className="relative mt-4">
            <h2
              className="relative text-2xl font-semibold leading-tight text-text lg:text-3xl"
              style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
            >
              {insight.headline}
              {inView ? <HeadlineShimmer delay={index * 0.12} /> : null}
            </h2>
          </div>

          {/* Subhead */}
          <p
            className={`mt-2 font-mono text-[12px] uppercase tracking-[0.2em] ${severityTextToken(
              insight.severity,
            )}`}
          >
            {insight.metric}
          </p>

          {/* Body with drop cap */}
          <p
            className="mt-4 text-[15px] leading-relaxed text-text-dim"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            <motion.span
              initial={{ scale: 0, rotate: -10 }}
              animate={inView ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -10 }}
              transition={{
                duration: 0.55,
                delay: 0.25 + index * 0.12,
                type: 'spring',
                stiffness: 220,
                damping: 14,
              }}
              className={`float-left mr-2 mt-1 text-5xl font-bold leading-none ${severityTextToken(
                insight.severity,
              )}`}
              style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
            >
              {firstChar}
            </motion.span>
            {restBody}
          </p>

          {/* Footer */}
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-muted/70 pt-4">
            <div className="flex items-center gap-2 text-[11px] text-text-dim">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 font-mono text-[11px] font-semibold text-accent">
                N
              </div>
              <div>
                <div className="font-mono text-[11px] text-text">
                  Northwind Analytics
                </div>
                <div className="font-mono text-[10px] text-text-dim">
                  {7 + index * 7} days ago · auto-generated insight
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Share entry"
                className="rounded-lg border border-border-muted bg-surface-2 p-2 text-text-dim hover:border-accent/40 hover:text-text"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Save entry"
                onClick={() => setSaved((v) => !v)}
                className={`rounded-lg border p-2 ${
                  saved
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-muted bg-surface-2 text-text-dim hover:border-accent/40 hover:text-text'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Pin entry"
                className="rounded-lg border border-border-muted bg-surface-2 p-2 text-text-dim hover:border-accent/40 hover:text-text"
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Flag entry"
                className="rounded-lg border border-border-muted bg-surface-2 p-2 text-text-dim hover:border-accent/40 hover:text-text"
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </div>

        {/* Embedded chart panel */}
        <aside className="relative rounded-xl border border-border-muted bg-bg/40 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
              Trailing 7 days
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
              {useBars ? (
                <BarChart3 className="h-3 w-3" />
              ) : (
                <LineChartIcon className="h-3 w-3" />
              )}
              <span>{useBars ? 'BARS' : 'LINE'}</span>
            </span>
          </div>
          <div className="mt-2 h-24">
            {useBars ? (
              <MiniBars
                values={chartValues}
                labels={slice.dates.map((d) => d.slice(8))}
                fill={fill}
                draw={inView}
              />
            ) : (
              <Sparkline
                values={chartValues}
                stroke={fill}
                fill={fill}
                draw={inView}
                dotIndex={dotIdx >= 0 ? dotIdx : undefined}
              />
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-muted/70 pt-3">
            <ChartStat label="Avg" value={compactInt(Math.round(stats.avg))} />
            <ChartStat label="Peak" value={compactInt(Math.round(stats.max))} />
            <ChartStat label="Low" value={compactInt(Math.round(stats.min))} />
          </div>
        </aside>
      </div>
    </motion.article>
  );
}

function ChartStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
        {label}
      </div>
      <div
        className="font-mono text-sm text-text"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — monthly highlights (trophies + providers + chart).
// ---------------------------------------------------------------------------

interface InspectorProps {
  data: AgencyAnalyticsData;
}

function Inspector({ data }: InspectorProps): JSX.Element {
  const top3 = data.subClientLeaderboard.slice(0, 3);
  const rest = data.subClientLeaderboard.slice(3);
  return (
    <aside className="space-y-5 lg:col-span-4">
      <TrophyPanel top3={top3} rest={rest} />
      <ProviderPanel rows={data.providerMix} />
      <ChartPanel days={data.days30} />
      <FunnelPanel funnel={data.funnel} />
      <StoryNotePanel />
    </aside>
  );
}

interface TrophyPanelProps {
  top3: AgencyAnalyticsData['subClientLeaderboard'];
  rest: AgencyAnalyticsData['subClientLeaderboard'];
}

function TrophyPanel({ top3, rest }: TrophyPanelProps): JSX.Element {
  const tropheyIcons = [Crown, Trophy, Medal];
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-5 py-5"
    >
      <PaperGrain />
      <header className="relative flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Monthly highlights
          </div>
          <h3
            className="mt-1 text-lg font-semibold text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            The Honour Roll
          </h3>
        </div>
        <Award className="h-5 w-5 text-accent" />
      </header>

      <div className="relative mt-4 space-y-2.5">
        {top3.map((row, i) => {
          const Icon = tropheyIcons[i] ?? Star;
          const isTop = i === 0;
          return (
            <div
              key={row.id}
              className={`relative overflow-hidden rounded-xl border ${
                isTop
                  ? 'border-accent/40 bg-accent/8'
                  : 'border-border-muted bg-surface-2'
              } px-3 py-3`}
            >
              {isTop ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -skew-x-12"
                  style={{
                    background:
                      'linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%)',
                  }}
                  initial={{ x: '-130%' }}
                  animate={{ x: '130%' }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    repeatDelay: 3.6,
                    ease: 'easeInOut',
                  }}
                />
              ) : null}

              <div className="relative flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    isTop ? 'bg-accent/15 text-accent' : 'bg-bg text-text-dim'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg font-mono text-sm font-semibold text-text">
                  {row.logoChar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-text">
                      {row.name}
                    </div>
                    <div
                      className={`font-mono text-xs ${statusToken(row.status)}`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {pct(row.inboxPct)}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-text-dim">
                    <span className="font-mono">
                      {compactInt(row.sends30d)} sends · warmth {row.warmthScore}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 font-mono ${
                        row.delta30dPct >= 0 ? 'text-accent' : 'text-accent3'
                      }`}
                    >
                      {row.delta30dPct >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(row.delta30dPct).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 ? (
        <div className="relative mt-3 border-t border-border-muted/70 pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
            Roster
          </div>
          <ul className="mt-2 space-y-1.5">
            {rest.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-bg font-mono text-[11px] text-text">
                  {row.logoChar}
                </span>
                <span className="flex-1 truncate text-xs text-text">{row.name}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${statusChipToken(
                    row.status,
                  )}`}
                >
                  <span
                    className={`block h-1 w-1 rounded-full ${
                      row.status === 'healthy'
                        ? 'bg-accent'
                        : row.status === 'warming'
                          ? 'bg-accent3'
                          : 'bg-accent3'
                    }`}
                  />
                  {row.status === 'at_risk' ? 'risk' : row.status}
                </span>
                <span
                  className="font-mono text-[11px] text-text-dim"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct(row.inboxPct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </motion.section>
  );
}

interface ProviderPanelProps {
  rows: AgencyAnalyticsData['providerMix'];
}

function ProviderPanel({ rows }: ProviderPanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0% -10% 0%' });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-5 py-5"
    >
      <PaperGrain />
      <header className="relative flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Distribution
          </div>
          <h3
            className="mt-1 text-lg font-semibold text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            Provider Performance
          </h3>
        </div>
        <Globe className="h-5 w-5 text-text-dim" />
      </header>

      <div className="relative mt-4 space-y-3">
        {rows.map((row, i) => {
          const inboxW = row.inboxPct;
          const spamW = row.spamPct;
          const blockedW = row.blockedPct;
          return (
            <div key={row.provider}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">
                    {providerLabel(row.provider)}
                  </span>
                  <span className="text-[11px] text-text-dim">·</span>
                  <span
                    className="font-mono text-[11px] text-text"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {compactInt(row.sends)}
                  </span>
                </div>
                <span
                  className="font-mono text-xs text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct(row.inboxPct)}
                </span>
              </div>
              <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-bg">
                <motion.span
                  className="block bg-accent"
                  initial={{ width: '0%' }}
                  animate={inView ? { width: `${inboxW}%` } : { width: '0%' }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.05 }}
                />
                <motion.span
                  className="block bg-accent3"
                  initial={{ width: '0%' }}
                  animate={inView ? { width: `${spamW}%` } : { width: '0%' }}
                  transition={{ duration: 0.9, delay: 0.15 + i * 0.05 }}
                />
                <motion.span
                  className="block bg-accent3"
                  initial={{ width: '0%' }}
                  animate={inView ? { width: `${blockedW}%` } : { width: '0%' }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.05 }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-text-dim">
                <span>spam {pct(row.spamPct)}</span>
                <span>blocked {pct(row.blockedPct)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function ChartPanel({ days }: { days: AgencyAnalyticsData['days30'] }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-5 py-5"
    >
      <PaperGrain />
      <header className="relative flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Trailing 30 days
          </div>
          <h3
            className="mt-1 text-lg font-semibold text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            The Monthly Tape
          </h3>
        </div>
        <Activity className="h-5 w-5 text-text-dim" />
      </header>
      <div className="relative mt-4 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em]">
        <LegendDot color="rgb(99 102 241)" label="sends" />
        <LegendDot color="rgb(56 189 248)" label="opens" />
        <LegendDot color="rgb(16 185 129)" label="replies" />
        <LegendDot color="rgb(245 158 11)" label="inbox %" dashed />
      </div>
      <div className="relative mt-2">
        <InspectorChart days={days} />
      </div>
      <p className="relative mt-2 text-[11px] text-text-dim">
        Hover the chart to reveal a vertical guide with the daily readout.
      </p>
    </motion.section>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 text-text-dim">
      <span
        className={`inline-block h-2 w-4 rounded-full ${dashed ? 'border border-dashed border-current' : ''}`}
        style={dashed ? { borderColor: color } : { background: color }}
      />
      <span>{label}</span>
    </span>
  );
}

interface FunnelPanelProps {
  funnel: AgencyAnalyticsData['funnel'];
}

function FunnelPanel({ funnel }: FunnelPanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true });
  const steps = [
    { label: 'Sends', value: funnel.sends, icon: <Send className="h-3.5 w-3.5" /> },
    {
      label: 'Delivered',
      value: funnel.delivered,
      icon: <MailCheck className="h-3.5 w-3.5" />,
    },
    {
      label: 'Inboxed',
      value: funnel.inboxed,
      icon: <Inbox className="h-3.5 w-3.5" />,
    },
    {
      label: 'Opened',
      value: funnel.opened,
      icon: <MailOpen className="h-3.5 w-3.5" />,
    },
    {
      label: 'Replied',
      value: funnel.replied,
      icon: <Reply className="h-3.5 w-3.5" />,
    },
  ];
  const max = steps[0]!.value || 1;
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-5 py-5"
    >
      <PaperGrain />
      <header className="relative flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Conversion path
          </div>
          <h3
            className="mt-1 text-lg font-semibold text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            The Funnel
          </h3>
        </div>
        <Layers className="h-5 w-5 text-text-dim" />
      </header>
      <div className="relative mt-4 space-y-2">
        {steps.map((s, i) => {
          const pctW = (s.value / max) * 100;
          const dropPct =
            i === 0 ? 0 : ((steps[i - 1]!.value - s.value) / Math.max(steps[i - 1]!.value, 1)) * 100;
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">
                  <span className="text-text-dim">{s.icon}</span>
                  {s.label}
                </span>
                <span
                  className="font-mono text-[11px] text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {compactInt(s.value)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <motion.span
                  className="block h-full bg-accent"
                  initial={{ width: '0%' }}
                  animate={inView ? { width: `${pctW}%` } : { width: '0%' }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.07 }}
                />
              </div>
              {i > 0 ? (
                <div className="mt-0.5 text-right font-mono text-[10px] text-text-dim">
                  −{dropPct.toFixed(1)}% step loss
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function StoryNotePanel(): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.9 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-5 py-5"
    >
      <PaperGrain />
      <header className="relative flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
          Editor’s note
        </span>
      </header>
      <p
        className="relative mt-3 text-[13px] leading-relaxed text-text-dim"
        style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
      >
        Insights are generated automatically from the previous week’s warmup
        logs. They surface significant deltas in inbox placement, reply rate,
        peer-pool health, and ramp behaviour. Save an entry to pin it to next
        month’s digest.
      </p>
      <div className="relative mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
        <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-1">
          <ShieldCheck className="h-3 w-3 text-accent" />
          curated
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-1">
          <Gauge className="h-3 w-3 text-accent" />
          measured
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-1">
          <Zap className="h-3 w-3 text-accent3" />
          fresh
        </span>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Comparison table (below the canvas) — extra editorial deep-dive.
// ---------------------------------------------------------------------------

function ComparisonTable({
  comparisons,
}: {
  comparisons: AgencyAnalyticsData['comparisons'];
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0% -10% 0%' });
  const [sortBy, setSortBy] = useState<AnalyticsMetric>('inbox_rate');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...comparisons];
    arr.sort((a, b) => {
      const get = (r: AgencyAnalyticsData['comparisons'][number]): number => {
        switch (sortBy) {
          case 'sends':
            return r.sends;
          case 'opens':
            return r.opens;
          case 'replies':
            return r.replies;
          case 'inbox_rate':
            return r.inboxRate;
          case 'spam_rate':
            return r.spamRate;
          case 'bounce_rate':
            return r.bounceRate;
          case 'warmth':
            return r.warmth;
          default:
            return 0;
        }
      };
      const diff = get(a) - get(b);
      return asc ? diff : -diff;
    });
    return arr;
  }, [comparisons, sortBy, asc]);

  const toggleSort = (m: AnalyticsMetric): void => {
    if (sortBy === m) {
      setAsc((v) => !v);
    } else {
      setSortBy(m);
      setAsc(false);
    }
  };

  const headers: Array<{ key: AnalyticsMetric; label: string; align: 'left' | 'right' }> = [
    { key: 'sends', label: 'Sends', align: 'right' },
    { key: 'opens', label: 'Opens', align: 'right' },
    { key: 'replies', label: 'Replies', align: 'right' },
    { key: 'inbox_rate', label: 'Inbox %', align: 'right' },
    { key: 'spam_rate', label: 'Spam %', align: 'right' },
    { key: 'bounce_rate', label: 'Bounce %', align: 'right' },
    { key: 'warmth', label: 'Warmth', align: 'right' },
  ];

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-6 py-6"
    >
      <PaperGrain />
      <header className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Appendix · sub-client comparison
          </div>
          <h3
            className="mt-1 text-xl font-semibold text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            The Long Read
          </h3>
        </div>
        <span className="font-mono text-[11px] text-text-dim">
          Sort by tapping any column.
        </span>
      </header>

      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-border-muted/70">
              <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
                Sub-client
              </th>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim ${
                    h.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(h.key)}
                    className={`inline-flex items-center gap-1 hover:text-text ${
                      sortBy === h.key ? 'text-accent' : ''
                    }`}
                  >
                    <span>{h.label}</span>
                    {sortBy === h.key ? (
                      asc ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )
                    ) : (
                      <Minus className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.subClientId}
                initial={{ opacity: 0, y: 8 }}
                animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
                className="border-b border-border-muted/40 hover:bg-surface-2/60"
              >
                <td className="px-3 py-2.5 text-sm text-text">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg font-mono text-xs text-text">
                      {row.subClientName.charAt(0)}
                    </span>
                    <span className="truncate">{row.subClientName}</span>
                  </div>
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {compactInt(row.sends)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {compactInt(row.opens)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {compactInt(row.replies)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono text-[12px] ${
                    row.inboxRate >= 90
                      ? 'text-accent'
                      : row.inboxRate >= 85
                        ? 'text-accent3'
                        : 'text-accent3'
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct(row.inboxRate)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text-dim"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct(row.spamRate)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text-dim"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct(row.bounceRate)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-mono text-[12px] text-text"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.warmth}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Footer colophon — closes the editorial frame.
// ---------------------------------------------------------------------------

function Colophon({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 1 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-6 py-6"
    >
      <PaperGrain />
      <div className="relative grid gap-6 sm:grid-cols-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Colophon
          </div>
          <h4
            className="mt-1 text-lg text-text"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            About this digest
          </h4>
          <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
            Compiled from {fullInt(data.kpis.totalSends30d)} sends across{' '}
            {data.workspace.mailboxCount} mailboxes and{' '}
            {data.workspace.subClientCount} sub-clients. Generated nightly by
            WarmPulse Beat at 00:05 UTC.
          </p>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Methodology
          </div>
          <ul className="mt-3 space-y-1.5 text-[12px] text-text-dim">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              Inbox placement from peer-pool engagement signal
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              Warmth scored from reputation + ramp progress
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              MoM deltas vs. prior 30-day rolling window
            </li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim">
            Editorial board
          </div>
          <ul className="mt-3 space-y-1.5 text-[12px] text-text-dim">
            <li className="flex items-center gap-2">
              <Target className="h-3 w-3 text-accent" />
              {data.workspace.name} · Editor-in-chief
            </li>
            <li className="flex items-center gap-2">
              <Building2 className="h-3 w-3 text-text-dim" />
              WarmPulse · Publisher
            </li>
            <li className="flex items-center gap-2">
              <MessageSquare className="h-3 w-3 text-text-dim" />
              Comments open to agency owners
            </li>
          </ul>
        </div>
      </div>
    </motion.footer>
  );
}

// ---------------------------------------------------------------------------
// Top of canvas: the "Lede" — featured story panel pinned above weekly entries.
// ---------------------------------------------------------------------------

function Lede({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  const k = data.kpis;
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-accent/30 bg-surface"
    >
      <PaperGrain />
      <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-accent" />
      <div className="relative grid gap-5 px-6 py-6 md:grid-cols-[1fr_280px] md:px-8 md:py-7">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
              <Sparkles className="h-3 w-3" />
              Featured · this month
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
              The Lede
            </span>
          </div>
          <h2
            className="relative mt-3 text-3xl font-semibold leading-tight text-text lg:text-4xl"
            style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
          >
            A quietly excellent month, with one warning shot
            <HeadlineShimmer />
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-text-dim">
            Inbox placement averaged {pct(k.inboxRatePct)} across{' '}
            {data.workspace.mailboxCount} mailboxes — the highest reading in
            our short history. {compactInt(k.totalSends30d)} sends produced{' '}
            {compactInt(k.totalOpens30d)} opens and{' '}
            {compactInt(k.totalReplies30d)} replies, with month-over-month
            growth of {k.momGrowthPct.toFixed(1)}%. The only caution: Tundra
            Outfitters, whose Yahoo reputation slipped under 80%.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 self-center">
          <FeaturedStat label="Inbox" value={pct(k.inboxRatePct)} />
          <FeaturedStat label="Spam" value={pct(k.spamRatePct)} />
          <FeaturedStat label="Warmth" value={String(k.avgWarmth)} />
          <FeaturedStat
            label="MoM"
            value={`${k.momGrowthPct >= 0 ? '+' : ''}${k.momGrowthPct.toFixed(1)}%`}
          />
        </div>
      </div>
    </motion.section>
  );
}

function FeaturedStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-xl font-semibold text-text"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page itself.
// ---------------------------------------------------------------------------

export function AgAnaR2Journal({
  data,
}: { data?: AgencyAnalyticsData } = {}): JSX.Element {
  const d: AgencyAnalyticsData = data ?? MOCK;
  const [period, setPeriod] = useState<AnalyticsPeriod>(d.period);
  const slices = useMemo(() => buildWeekSlices(d.days30), [d.days30]);
  const volume = 30;

  // pull-quote is taken from the top weekly insight.
  const pullText = d.weeklyInsights[0]?.headline
    ? `${d.weeklyInsights[0].headline}. ${
        d.weeklyInsights[0].metric
      } — the strongest weekly figure in the journal so far.`
    : 'A quiet month, well-run.';

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <Masthead
          data={d}
          period={period}
          onPeriodChange={setPeriod}
          volume={volume}
        />

        <KpiStrip data={d} />

        <div className="grid gap-6 lg:grid-cols-12">
          <main className="space-y-6 lg:col-span-8">
            <Lede data={d} />

            <PullQuote
              text={pullText}
              attribution={`${d.workspace.name} · ${periodLabel(period)}`}
            />

            <section aria-label="Weekly entries" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2
                  className="text-2xl font-semibold text-text"
                  style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}
                >
                  Weekly entries
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
                  4 stories · most recent first
                </span>
              </div>

              {d.weeklyInsights.map((insight, i) => (
                <div key={insight.id}>
                  <WeeklyEntry
                    insight={insight}
                    slice={(slices[i] ?? slices[slices.length - 1])!}
                    index={i}
                  />
                  {i < d.weeklyInsights.length - 1 ? <Ornament /> : null}
                </div>
              ))}
            </section>

            <ComparisonTable comparisons={d.comparisons} />
          </main>

          <Inspector data={d} />
        </div>

        <Colophon data={d} />
      </div>
    </div>
  );
}

export default AgAnaR2Journal;
