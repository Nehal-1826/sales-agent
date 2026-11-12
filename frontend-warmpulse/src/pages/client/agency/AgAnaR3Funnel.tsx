import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useSpring } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Crown,
  Download,
  Droplet,
  Filter,
  Filter as Funnel,
  Flame,
  Gauge,
  Globe2,
  Inbox,
  Layers,
  LineChart,
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Percent,
  Radio,
  Reply,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wand2,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { toast } from '@/components/ui/AppToast';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { exportRowsToCsv, exportStamp, type CsvColumn } from '@/lib/exportCsv';

/**
 * AgAnaR3Funnel — Agency-tier Analytics, design candidate R3, "Funnel Theatre".
 *
 * The Agency Analytics surface re-imagined as a CONVERSION FUNNEL stage:
 *
 *   SENDS → DELIVERED → INBOXED → OPENED → REPLIED
 *
 * The hero is a tall vertical funnel composed of five trapezoidal SVG
 * segments that taper inward as the audience narrows. Each segment is
 * STATUS-TINTED by the severity of its drop-off (low → accent, mid →
 * accent4, high → accent3) and reveals on mount: stroke path animates
 * 0 → 1, fill fades in, and the big number COUNTS UP in lockstep. The
 * stage with the heaviest drop-off picks up a soft glow halo.
 *
 * Beneath the hero, four COMPACT funnels stand side-by-side, one per
 * provider (Gmail / Outlook / Yahoo / SMTP). They share the same five
 * stages and stagger fade-up.
 *
 * The TIME-SERIES PANEL underneath traces the 30-day conversion rate
 * (replies / sends) as a smooth path with a gradient fill. A cursor
 * guide, dot and tooltip follow the mouse along the X-axis.
 *
 * The RIGHT INSPECTOR ("Drop-off diagnostics") names the leakiest stage,
 * recommends triage actions, and ranks sub-clients by best conversion
 * rate.
 *
 * Fully STANDALONE — no network, router, query hooks, no required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the analytics
 * aggregate endpoint exists. NOT a card grid, NOT a Sankey diagram, NOT
 * a heatmap (sibling R1 / R2 / R4 own those identities). The funnel
 * tapering identity is the differentiator.
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
// MOCK — premium agency, "Northwind Outreach", 12 sub-clients, 248 mailboxes.
// Every collection is realistically populated so the design renders fully
// without an API.
// ---------------------------------------------------------------------------

const MOCK: AgencyAnalyticsData = {
  workspace: { name: 'Northwind Outreach', subClientCount: 12, mailboxCount: 248 },
  period: 'last_30d',
  kpis: {
    totalSends30d: 412_840,
    totalOpens30d: 198_322,
    totalReplies30d: 41_127,
    inboxRatePct: 92.4,
    spamRatePct: 1.8,
    bounceRatePct: 0.9,
    avgWarmth: 78.2,
    momGrowthPct: 14.6,
  },
  days30: [
    { date: '2026-04-28', sends: 12_840, opens: 5_910, replies: 1_220, inboxPct: 91.2 },
    { date: '2026-04-29', sends: 13_110, opens: 6_080, replies: 1_280, inboxPct: 91.8 },
    { date: '2026-04-30', sends: 13_420, opens: 6_244, replies: 1_312, inboxPct: 92.1 },
    { date: '2026-05-01', sends: 13_780, opens: 6_440, replies: 1_355, inboxPct: 92.4 },
    { date: '2026-05-02', sends: 11_920, opens: 5_510, replies: 1_180, inboxPct: 92.0 },
    { date: '2026-05-03', sends: 11_540, opens: 5_330, replies: 1_140, inboxPct: 91.7 },
    { date: '2026-05-04', sends: 13_980, opens: 6_550, replies: 1_402, inboxPct: 92.6 },
    { date: '2026-05-05', sends: 14_220, opens: 6_700, replies: 1_440, inboxPct: 92.9 },
    { date: '2026-05-06', sends: 14_480, opens: 6_840, replies: 1_488, inboxPct: 93.0 },
    { date: '2026-05-07', sends: 14_310, opens: 6_790, replies: 1_478, inboxPct: 92.8 },
    { date: '2026-05-08', sends: 14_620, opens: 6_980, replies: 1_512, inboxPct: 93.1 },
    { date: '2026-05-09', sends: 12_200, opens: 5_720, replies: 1_220, inboxPct: 92.4 },
    { date: '2026-05-10', sends: 11_840, opens: 5_540, replies: 1_182, inboxPct: 92.0 },
    { date: '2026-05-11', sends: 14_910, opens: 7_120, replies: 1_555, inboxPct: 93.2 },
    { date: '2026-05-12', sends: 15_080, opens: 7_230, replies: 1_592, inboxPct: 93.4 },
    { date: '2026-05-13', sends: 15_220, opens: 7_340, replies: 1_618, inboxPct: 93.6 },
    { date: '2026-05-14', sends: 15_140, opens: 7_290, replies: 1_604, inboxPct: 93.3 },
    { date: '2026-05-15', sends: 15_440, opens: 7_440, replies: 1_654, inboxPct: 93.5 },
    { date: '2026-05-16', sends: 12_660, opens: 5_980, replies: 1_280, inboxPct: 92.6 },
    { date: '2026-05-17', sends: 12_320, opens: 5_810, replies: 1_240, inboxPct: 92.2 },
    { date: '2026-05-18', sends: 15_690, opens: 7_590, replies: 1_692, inboxPct: 93.7 },
    { date: '2026-05-19', sends: 15_820, opens: 7_670, replies: 1_720, inboxPct: 93.8 },
    { date: '2026-05-20', sends: 15_980, opens: 7_760, replies: 1_748, inboxPct: 93.9 },
    { date: '2026-05-21', sends: 16_140, opens: 7_850, replies: 1_780, inboxPct: 94.0 },
    { date: '2026-05-22', sends: 16_290, opens: 7_940, replies: 1_810, inboxPct: 94.2 },
    { date: '2026-05-23', sends: 13_510, opens: 6_410, replies: 1_380, inboxPct: 93.0 },
    { date: '2026-05-24', sends: 13_180, opens: 6_240, replies: 1_344, inboxPct: 92.7 },
    { date: '2026-05-25', sends: 16_480, opens: 8_040, replies: 1_842, inboxPct: 94.3 },
    { date: '2026-05-26', sends: 16_620, opens: 8_120, replies: 1_872, inboxPct: 94.4 },
    { date: '2026-05-27', sends: 16_780, opens: 8_210, replies: 1_902, inboxPct: 94.5 },
  ],
  funnel: {
    sends: 412_840,
    delivered: 408_988,
    inboxed: 378_465,
    opened: 198_322,
    replied: 41_127,
  },
  providerMix: [
    { provider: 'gmail', sends: 198_440, inboxPct: 94.2, spamPct: 1.2, blockedPct: 0.6 },
    { provider: 'outlook', sends: 132_220, inboxPct: 91.6, spamPct: 2.4, blockedPct: 1.1 },
    { provider: 'yahoo', sends: 52_180, inboxPct: 89.8, spamPct: 3.1, blockedPct: 1.4 },
    { provider: 'smtp', sends: 30_000, inboxPct: 93.0, spamPct: 1.8, blockedPct: 0.9 },
  ],
  subClientLeaderboard: [
    {
      id: 'sc-acme',
      name: 'Acme Industries',
      logoChar: 'A',
      sends30d: 64_220,
      inboxPct: 95.1,
      warmthScore: 84,
      delta30dPct: 18.2,
      status: 'healthy',
    },
    {
      id: 'sc-orbital',
      name: 'Orbital Robotics',
      logoChar: 'O',
      sends30d: 58_140,
      inboxPct: 94.4,
      warmthScore: 82,
      delta30dPct: 12.9,
      status: 'healthy',
    },
    {
      id: 'sc-helix',
      name: 'Helix Biotech',
      logoChar: 'H',
      sends30d: 51_880,
      inboxPct: 93.6,
      warmthScore: 79,
      delta30dPct: 9.1,
      status: 'healthy',
    },
    {
      id: 'sc-northbound',
      name: 'Northbound Capital',
      logoChar: 'N',
      sends30d: 48_320,
      inboxPct: 93.0,
      warmthScore: 78,
      delta30dPct: 7.4,
      status: 'healthy',
    },
    {
      id: 'sc-paragon',
      name: 'Paragon Logistics',
      logoChar: 'P',
      sends30d: 41_660,
      inboxPct: 92.2,
      warmthScore: 76,
      delta30dPct: 4.6,
      status: 'warming',
    },
    {
      id: 'sc-meridian',
      name: 'Meridian Health',
      logoChar: 'M',
      sends30d: 36_140,
      inboxPct: 91.4,
      warmthScore: 74,
      delta30dPct: 2.1,
      status: 'warming',
    },
    {
      id: 'sc-tessera',
      name: 'Tessera Labs',
      logoChar: 'T',
      sends30d: 28_500,
      inboxPct: 90.6,
      warmthScore: 71,
      delta30dPct: 0.4,
      status: 'warming',
    },
    {
      id: 'sc-cobalt',
      name: 'Cobalt Studios',
      logoChar: 'C',
      sends30d: 24_120,
      inboxPct: 89.4,
      warmthScore: 68,
      delta30dPct: -2.6,
      status: 'warming',
    },
    {
      id: 'sc-rivet',
      name: 'Rivet Manufacturing',
      logoChar: 'R',
      sends30d: 19_980,
      inboxPct: 88.0,
      warmthScore: 64,
      delta30dPct: -4.8,
      status: 'at_risk',
    },
    {
      id: 'sc-keystone',
      name: 'Keystone Realty',
      logoChar: 'K',
      sends30d: 16_780,
      inboxPct: 86.4,
      warmthScore: 60,
      delta30dPct: -6.4,
      status: 'at_risk',
    },
    {
      id: 'sc-stellar',
      name: 'Stellar Apparel',
      logoChar: 'S',
      sends30d: 12_440,
      inboxPct: 84.2,
      warmthScore: 56,
      delta30dPct: -9.2,
      status: 'at_risk',
    },
    {
      id: 'sc-driftwood',
      name: 'Driftwood Coffee',
      logoChar: 'D',
      sends30d: 10_660,
      inboxPct: 82.6,
      warmthScore: 52,
      delta30dPct: -11.4,
      status: 'at_risk',
    },
  ],
  weeklyInsights: [
    {
      id: 'wi-1',
      weekOf: '2026-05-19',
      headline: 'Inbox rate crossed 94% workspace-wide',
      body:
        'Gmail tenants drove the lift — Acme Industries and Orbital Robotics both posted ' +
        'their best week since onboarding. Yahoo inbox delivery remains the ceiling.',
      metric: 'inbox_rate',
      severity: 'success',
    },
    {
      id: 'wi-2',
      weekOf: '2026-05-19',
      headline: 'Reply funnel dropped 6.2pp on Outlook hosts',
      body:
        'Outlook recipients opened at parity but replied less. Suspect content fatigue — ' +
        'three sub-clients are re-using the same opening line across sending paces.',
      metric: 'replies',
      severity: 'warn',
    },
    {
      id: 'wi-3',
      weekOf: '2026-05-19',
      headline: 'Driftwood Coffee at risk of grey-listing',
      body:
        'Failure rate climbed to 4.1% over 14 days. Two domains are missing DMARC alignment ' +
        'and one mailbox is being slowed down by Microsoft 365.',
      metric: 'bounce_rate',
      severity: 'critical',
    },
    {
      id: 'wi-4',
      weekOf: '2026-05-12',
      headline: '+18.2% MoM growth on Acme Industries',
      body:
        'Their warmup build-up finished and outbound volume tripled. Inbox vs spam held — ' +
        'this is the textbook build-up curve to share with new sub-clients.',
      metric: 'sends',
      severity: 'info',
    },
    {
      id: 'wi-5',
      weekOf: '2026-05-12',
      headline: 'Average warmth crossed 78 — premium tier territory',
      body:
        'Eight of twelve sub-clients are above the 75 threshold. The remaining four are ' +
        'still in their first 30 days; reassess after day 45.',
      metric: 'warmth',
      severity: 'success',
    },
  ],
  comparisons: [
    {
      subClientId: 'sc-acme',
      subClientName: 'Acme Industries',
      sends: 64_220,
      opens: 32_460,
      replies: 7_240,
      inboxRate: 95.1,
      spamRate: 1.0,
      bounceRate: 0.6,
      warmth: 84,
    },
    {
      subClientId: 'sc-orbital',
      subClientName: 'Orbital Robotics',
      sends: 58_140,
      opens: 28_660,
      replies: 6_280,
      inboxRate: 94.4,
      spamRate: 1.2,
      bounceRate: 0.7,
      warmth: 82,
    },
    {
      subClientId: 'sc-helix',
      subClientName: 'Helix Biotech',
      sends: 51_880,
      opens: 25_080,
      replies: 5_420,
      inboxRate: 93.6,
      spamRate: 1.5,
      bounceRate: 0.8,
      warmth: 79,
    },
    {
      subClientId: 'sc-northbound',
      subClientName: 'Northbound Capital',
      sends: 48_320,
      opens: 22_910,
      replies: 4_880,
      inboxRate: 93.0,
      spamRate: 1.7,
      bounceRate: 0.9,
      warmth: 78,
    },
    {
      subClientId: 'sc-paragon',
      subClientName: 'Paragon Logistics',
      sends: 41_660,
      opens: 19_440,
      replies: 4_080,
      inboxRate: 92.2,
      spamRate: 2.0,
      bounceRate: 1.0,
      warmth: 76,
    },
    {
      subClientId: 'sc-meridian',
      subClientName: 'Meridian Health',
      sends: 36_140,
      opens: 16_640,
      replies: 3_440,
      inboxRate: 91.4,
      spamRate: 2.3,
      bounceRate: 1.1,
      warmth: 74,
    },
    {
      subClientId: 'sc-tessera',
      subClientName: 'Tessera Labs',
      sends: 28_500,
      opens: 12_820,
      replies: 2_580,
      inboxRate: 90.6,
      spamRate: 2.6,
      bounceRate: 1.3,
      warmth: 71,
    },
    {
      subClientId: 'sc-cobalt',
      subClientName: 'Cobalt Studios',
      sends: 24_120,
      opens: 10_510,
      replies: 2_080,
      inboxRate: 89.4,
      spamRate: 3.0,
      bounceRate: 1.6,
      warmth: 68,
    },
    {
      subClientId: 'sc-rivet',
      subClientName: 'Rivet Manufacturing',
      sends: 19_980,
      opens: 8_360,
      replies: 1_610,
      inboxRate: 88.0,
      spamRate: 3.4,
      bounceRate: 1.9,
      warmth: 64,
    },
    {
      subClientId: 'sc-keystone',
      subClientName: 'Keystone Realty',
      sends: 16_780,
      opens: 6_780,
      replies: 1_240,
      inboxRate: 86.4,
      spamRate: 3.9,
      bounceRate: 2.2,
      warmth: 60,
    },
    {
      subClientId: 'sc-stellar',
      subClientName: 'Stellar Apparel',
      sends: 12_440,
      opens: 4_780,
      replies: 820,
      inboxRate: 84.2,
      spamRate: 4.6,
      bounceRate: 2.6,
      warmth: 56,
    },
    {
      subClientId: 'sc-driftwood',
      subClientName: 'Driftwood Coffee',
      sends: 10_660,
      opens: 3_910,
      replies: 640,
      inboxRate: 82.6,
      spamRate: 5.2,
      bounceRate: 4.1,
      warmth: 52,
    },
  ],
};

// ---------------------------------------------------------------------------
// SKELETON — empty-state shell so a fresh agency loads without scary blanks.
// ---------------------------------------------------------------------------

export const AGENCY_ANALYTICS_SKELETON_R3: AgencyAnalyticsData = {
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
// Theme + constants. Hex equivalents kept in lockstep with tailwind.config.ts
// so the SVG paths can reference colors directly (CSS variables don't pierce
// SVG gradient stops cleanly).
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  accentGreen: '#5dd39e',
  bg: '#0a0a12',
  surface: '#13131d',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  borderStrong: '#33334a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_ACCENT: Record<Provider, string> = {
  gmail: HEX.accent3,
  outlook: HEX.accent2,
  yahoo: HEX.accent4,
  smtp: HEX.accent,
};

const SEVERITY_TEXT: Record<InsightSeverity, string> = {
  info: 'text-accent2',
  warn: 'text-accent4',
  critical: 'text-accent3',
  success: 'text-accent',
};

const SEVERITY_BG: Record<InsightSeverity, string> = {
  info: 'bg-accent2/10 border-accent2/30',
  warn: 'bg-accent4/10 border-accent4/30',
  critical: 'bg-accent3/10 border-accent3/30',
  success: 'bg-accent/10 border-accent/30',
};

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  last_year: 'Last year',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return formatNumber(n);
}

function formatExact(n: number): string {
  return formatNumber(n);
}

function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function pctOf(value: number, base: number): number {
  if (base <= 0) return 0;
  return (value / base) * 100;
}

function dropoffSeverity(conversionPct: number): 'low' | 'mid' | 'high' {
  if (conversionPct >= 90) return 'low';
  if (conversionPct >= 60) return 'mid';
  return 'high';
}

function severityColor(sev: 'low' | 'mid' | 'high'): string {
  if (sev === 'low') return HEX.accent;
  if (sev === 'mid') return HEX.accent4;
  return HEX.accent3;
}

function severityTextClass(sev: 'low' | 'mid' | 'high'): string {
  if (sev === 'low') return 'text-accent';
  if (sev === 'mid') return 'text-accent4';
  return 'text-accent3';
}

function severityBgClass(sev: 'low' | 'mid' | 'high'): string {
  if (sev === 'low') return 'bg-accent/10 border-accent/30';
  if (sev === 'mid') return 'bg-accent4/10 border-accent4/30';
  return 'bg-accent3/10 border-accent3/30';
}

function formatDeltaPct(n: number, digits = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function shortDate(iso: string): string {
  // 2026-05-27 -> "May 27"
  const [, mm, dd] = iso.split('-');
  const idx = Math.max(0, Math.min(11, parseInt(mm!, 10) - 1));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[idx]} ${parseInt(dd!, 10)}`;
}

// CSV export of the sub-client comparison rows — shared by the table toolbar
// "Export" and the page-hero overflow menu.
const COMPARISON_CSV_COLUMNS: CsvColumn<AgencyAnalyticsData['comparisons'][number]>[] = [
  { header: 'Sub-client', value: (r) => r.subClientName },
  { header: 'Sends', value: (r) => r.sends },
  { header: 'Opens', value: (r) => r.opens },
  { header: 'Replies', value: (r) => r.replies },
  { header: 'Inbox rate %', value: (r) => r.inboxRate },
  { header: 'Spam rate %', value: (r) => r.spamRate },
  { header: 'Failure rate %', value: (r) => r.bounceRate },
  { header: 'Warmth', value: (r) => r.warmth },
];

function exportComparisons(rows: AgencyAnalyticsData['comparisons']): void {
  const count = exportRowsToCsv(
    `agency-analytics-${exportStamp()}`,
    rows,
    COMPARISON_CSV_COLUMNS,
  );
  toast.success(`Exported ${count} sub-client${count === 1 ? '' : 's'}`);
}

// ---------------------------------------------------------------------------
// Atoms — small UI fragments used across the layout
// ---------------------------------------------------------------------------

function KpiTile({
  icon,
  label,
  value,
  hint,
  delta,
  index,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  index: number;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      className="relative rounded-xl border border-border-muted bg-surface/60 px-3 py-3 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 text-text-dim">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-accent">
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-text tabular-nums">{value}</span>
        {typeof delta === 'number' ? (
          <span
            className={
              'text-[11px] tabular-nums ' +
              (delta > 0 ? 'text-accent' : delta < 0 ? 'text-accent3' : 'text-text-dim')
            }
          >
            {formatDeltaPct(delta)}
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-1 text-[10px] text-text-dim">{hint}</div> : null}
    </motion.div>
  );
}

function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'accent2' | 'accent3' | 'accent4';
  className?: string;
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : tone === 'accent2'
        ? 'border-accent2/40 bg-accent2/10 text-accent2'
        : tone === 'accent3'
          ? 'border-accent3/40 bg-accent3/10 text-accent3'
          : tone === 'accent4'
            ? 'border-accent4/40 bg-accent4/10 text-accent4'
            : 'border-border-muted bg-surface-2 text-text-dim';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ' +
        toneClass +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </span>
  );
}

// A number that smoothly counts up from 0 to `value` over ~900ms. Used inside
// each funnel segment so the big number animates in lockstep with the path
// reveal.
function CountUp({
  value,
  duration = 900,
  delay = 0,
  format = formatCount,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  format?: (n: number) => string;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      if (elapsed < delay) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (elapsed - delay) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return <span className={className}>{format(shown)}</span>;
}

// ---------------------------------------------------------------------------
// Hero funnel — the centerpiece
// ---------------------------------------------------------------------------

type FunnelStageKey = 'sends' | 'delivered' | 'inboxed' | 'opened' | 'replied';

interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  description: string;
  icon: JSX.Element;
  count: number;
  conversionPct: number; // vs previous stage; sends = 100
  dropoffPct: number; // 100 - conversionPct (sends = 0)
}

function buildStages(f: AgencyAnalyticsData['funnel']): FunnelStage[] {
  const stages: FunnelStage[] = [
    {
      key: 'sends',
      label: 'Sends',
      description: 'Outbound emails dispatched to the SMTP queue',
      icon: <Send className="h-3.5 w-3.5" />,
      count: f.sends,
      conversionPct: 100,
      dropoffPct: 0,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      description: 'Accepted by the receiving MTA without failed delivery',
      icon: <MailCheck className="h-3.5 w-3.5" />,
      count: f.delivered,
      conversionPct: pctOf(f.delivered, f.sends),
      dropoffPct: 100 - pctOf(f.delivered, f.sends),
    },
    {
      key: 'inboxed',
      label: 'Inboxed',
      description: 'Landed in primary inbox (not promotions / spam)',
      icon: <Inbox className="h-3.5 w-3.5" />,
      count: f.inboxed,
      conversionPct: pctOf(f.inboxed, f.delivered),
      dropoffPct: 100 - pctOf(f.inboxed, f.delivered),
    },
    {
      key: 'opened',
      label: 'Opened',
      description: 'Recipient triggered the open-tracking pixel',
      icon: <MailOpen className="h-3.5 w-3.5" />,
      count: f.opened,
      conversionPct: pctOf(f.opened, f.inboxed),
      dropoffPct: 100 - pctOf(f.opened, f.inboxed),
    },
    {
      key: 'replied',
      label: 'Replied',
      description: 'Recipient sent a reply within the warmup window',
      icon: <Reply className="h-3.5 w-3.5" />,
      count: f.replied,
      conversionPct: pctOf(f.replied, f.opened),
      dropoffPct: 100 - pctOf(f.replied, f.opened),
    },
  ];
  return stages;
}

interface HeroFunnelGeometry {
  vbWidth: number;
  vbHeight: number;
  segmentHeight: number;
  segmentGap: number;
  widths: number[]; // taper widths for each stage's top/bottom edge
  centers: number[]; // y centers per segment
  paths: string[]; // SVG d for each segment
}

function computeHeroGeometry(stages: FunnelStage[]): HeroFunnelGeometry {
  const vbWidth = 720;
  const vbHeight = 720;
  const segmentHeight = 124;
  const segmentGap = 14;
  // Width series tapers from ~640 (top) → ~140 (bottom).
  // Top edge of each segment = bottom edge of previous segment, so the funnel
  // reads as a continuous taper rather than 5 floating trapezoids.
  // Width is proportional to sqrt(count / sends) for visual softness.
  const sendsBase = stages[0]!.count || 1;
  const widthForCount = (n: number): number => {
    const ratio = n / sendsBase;
    const eased = Math.sqrt(Math.max(0, Math.min(1, ratio)));
    return 140 + eased * (640 - 140);
  };
  const widths: number[] = stages.map((s) => widthForCount(s.count));
  // The trapezoid for stage i uses widths[i] (top) and widths[i+1] (bottom)
  // — so the last stage's bottom edge tapers to a small floor.
  const floorWidth = Math.max(80, widths[widths.length - 1]! * 0.55);
  const widthsTopBottom: Array<[number, number]> = stages.map((_, i) => {
    const top = widths[i]!;
    const bottom = i < stages.length - 1 ? widths[i + 1]! : floorWidth;
    return [top, bottom];
  });
  const totalH = stages.length * segmentHeight + (stages.length - 1) * segmentGap;
  const topY = (vbHeight - totalH) / 2;
  const centers: number[] = stages.map((_, i) => topY + i * (segmentHeight + segmentGap) + segmentHeight / 2);
  const paths: string[] = stages.map((_, i) => {
    const cy = centers[i]!;
    const yTop = cy - segmentHeight / 2;
    const yBot = cy + segmentHeight / 2;
    const [wTop, wBot] = widthsTopBottom[i]!;
    const cx = vbWidth / 2;
    const r = 14; // rounded corners
    const xTL = cx - wTop / 2;
    const xTR = cx + wTop / 2;
    const xBL = cx - wBot / 2;
    const xBR = cx + wBot / 2;
    // Rounded trapezoid
    const d = [
      `M ${xTL + r} ${yTop}`,
      `L ${xTR - r} ${yTop}`,
      `Q ${xTR} ${yTop} ${xTR} ${yTop + r}`,
      `L ${xBR + (xBR - xTR) * 0} ${yBot - r}`,
      `Q ${xBR} ${yBot} ${xBR - r} ${yBot}`,
      `L ${xBL + r} ${yBot}`,
      `Q ${xBL} ${yBot} ${xBL} ${yBot - r}`,
      `L ${xTL} ${yTop + r}`,
      `Q ${xTL} ${yTop} ${xTL + r} ${yTop}`,
      'Z',
    ].join(' ');
    return d;
  });
  return { vbWidth, vbHeight, segmentHeight, segmentGap, widths, centers, paths };
}

function HeroFunnel({
  stages,
  geom,
  hoveredKey,
  onHover,
}: {
  stages: FunnelStage[];
  geom: HeroFunnelGeometry;
  hoveredKey: FunnelStageKey | null;
  onHover: (k: FunnelStageKey | null) => void;
}): JSX.Element {
  // The leakiest stage (biggest drop-off, ignoring stage 0 which is always 0).
  const worstIdx = useMemo(() => {
    let idx = 1;
    let worst = -1;
    for (let i = 1; i < stages.length; i++) {
      if (stages[i]!.dropoffPct > worst) {
        worst = stages[i]!.dropoffPct;
        idx = i;
      }
    }
    return idx;
  }, [stages]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${geom.vbWidth} ${geom.vbHeight}`}
        className="w-full"
        style={{ maxHeight: 760 }}
      >
        <defs>
          {stages.map((s, _i) => {
            const sev = dropoffSeverity(s.conversionPct);
            const c = severityColor(sev);
            return (
              <linearGradient
                key={`grad-${s.key}`}
                id={`hero-grad-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={c} stopOpacity={0.34} />
                <stop offset="100%" stopColor={c} stopOpacity={0.16} />
              </linearGradient>
            );
          })}
          <filter id="hero-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Decorative grid behind the funnel */}
        <g opacity={0.18}>
          {Array.from({ length: 8 }).map((_, i) => (
            <line
              key={`hg-${i}`}
              x1={0}
              x2={geom.vbWidth}
              y1={(i + 1) * (geom.vbHeight / 9)}
              y2={(i + 1) * (geom.vbHeight / 9)}
              stroke={HEX.border}
              strokeWidth={0.6}
              strokeDasharray="2 6"
            />
          ))}
        </g>

        {/* Connector arrows between stages */}
        {stages.slice(0, stages.length - 1).map((s, i) => {
          const yA = geom.centers[i]! + geom.segmentHeight / 2;
          const yB = geom.centers[i + 1]! - geom.segmentHeight / 2;
          const cx = geom.vbWidth / 2;
          return (
            <g key={`arr-${s.key}`}>
              <motion.line
                x1={cx}
                x2={cx}
                y1={yA}
                y2={yB}
                stroke={HEX.borderStrong}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.7 }}
                transition={{ duration: 0.4, delay: 0.3 * i + 0.2 }}
              />
              <motion.polygon
                points={`${cx - 4},${yB - 6} ${cx + 4},${yB - 6} ${cx},${yB - 1}`}
                fill={HEX.borderStrong}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ duration: 0.3, delay: 0.3 * i + 0.45 }}
              />
            </g>
          );
        })}

        {/* Segments */}
        {stages.map((s, i) => {
          const sev = dropoffSeverity(s.conversionPct);
          const color = severityColor(sev);
          const isWorst = i === worstIdx && i > 0;
          const isHover = hoveredKey === s.key;
          return (
            <g
              key={`seg-${s.key}`}
              onPointerEnter={() => onHover(s.key)}
              onPointerLeave={() => onHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {isWorst ? (
                <motion.path
                  d={geom.paths[i]}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  filter="url(#hero-glow)"
                  opacity={0.45}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.55, 0.35] }}
                  transition={{ duration: 1.8, delay: 0.3 * i + 0.4, repeat: Infinity, repeatType: 'reverse' }}
                />
              ) : null}
              {/* Stroke that draws on */}
              <motion.path
                d={geom.paths[i]}
                fill="none"
                stroke={color}
                strokeWidth={1.6}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.3 * i, ease: 'easeOut' }}
              />
              {/* Fill fades in after stroke */}
              <motion.path
                d={geom.paths[i]}
                fill={`url(#hero-grad-${s.key})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: isHover ? 1 : 0.86 }}
                transition={{ duration: 0.45, delay: 0.3 * i + 0.3, ease: 'easeOut' }}
              />
              {/* Subtle interior divider — gives the segment volume */}
              <motion.path
                d={geom.paths[i]}
                fill="none"
                stroke={color}
                strokeWidth={0.6}
                opacity={0.18}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.18 }}
                transition={{ delay: 0.3 * i + 0.55 }}
              />
            </g>
          );
        })}
      </svg>

      {/* Overlay text: stage label + big number, positioned absolutely in pct */}
      {stages.map((s, i) => {
        const sev = dropoffSeverity(s.conversionPct);
        const topPct = (geom.centers[i]! / geom.vbHeight) * 100;
        const isHover = hoveredKey === s.key;
        return (
          <div
            key={`label-${s.key}`}
            className="pointer-events-none absolute left-0 right-0 flex items-center justify-between px-4 sm:px-6"
            style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
          >
            {/* Left: stage label */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 * i + 0.2 }}
              className="flex items-center gap-2"
            >
              <span
                className={
                  'flex h-7 w-7 items-center justify-center rounded-md border ' +
                  severityBgClass(sev)
                }
              >
                <span className={severityTextClass(sev)}>{s.icon}</span>
              </span>
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase tracking-widest text-text-dim">
                  Stage {i + 1}
                </div>
                <div className="text-sm font-medium text-text">{s.label}</div>
              </div>
            </motion.div>

            {/* Center: big number */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.3 * i + 0.4, ease: 'easeOut' }}
              className="flex flex-col items-center"
            >
              <CountUp
                value={s.count}
                delay={300 * i + 400}
                className={
                  'text-2xl sm:text-3xl font-semibold tabular-nums ' + severityTextClass(sev)
                }
              />
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-dim">
                {s.label}
              </div>
            </motion.div>

            {/* Right: conversion + drop-off chip */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 * i + 0.2 }}
              className="flex flex-col items-end gap-1"
            >
              {i > 0 ? (
                <>
                  <span className="text-[10px] uppercase tracking-widest text-text-dim">
                    Conversion
                  </span>
                  <div className={'text-sm font-semibold tabular-nums ' + severityTextClass(sev)}>
                    {formatPct(s.conversionPct)}
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.85] }}
                    transition={{ duration: 0.6, delay: 0.3 * i + 0.7 }}
                  >
                    <Chip
                      tone={sev === 'low' ? 'accent' : sev === 'mid' ? 'accent4' : 'accent3'}
                    >
                      {sev === 'low' ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      -{formatPct(s.dropoffPct)}
                    </Chip>
                  </motion.div>
                </>
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-text-dim">
                  Top of funnel
                </span>
              )}
            </motion.div>
            {/* Suppress unused-var warning for isHover when no hover style applied */}
            <span hidden>{isHover ? '' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact provider funnel (used 4x below the hero)
// ---------------------------------------------------------------------------

function ProviderFunnel({
  provider,
  totalSends,
  inboxPct,
  spamPct,
  blockedPct,
  index,
}: {
  provider: Provider;
  totalSends: number;
  inboxPct: number;
  spamPct: number;
  blockedPct: number;
  index: number;
}): JSX.Element {
  // Synthesise the 5-stage shape from the provider's headline numbers.
  // Delivered = sends * (1 - blocked) ; inboxed = sends * inboxPct
  // opened ≈ inboxed * 0.52 ; replied ≈ opened * 0.21
  const delivered = totalSends * (1 - blockedPct / 100);
  const inboxed = totalSends * (inboxPct / 100);
  const opened = inboxed * 0.52;
  const replied = opened * 0.21;
  const stages = [totalSends, delivered, inboxed, opened, replied];
  const labels = ['Sends', 'Delivered', 'Inboxed', 'Opened', 'Replied'];
  const baseColor = PROVIDER_ACCENT[provider];

  const w = 240;
  const h = 240;
  const segH = 36;
  const gap = 6;
  const top = (h - (stages.length * segH + (stages.length - 1) * gap)) / 2;
  const widthFor = (n: number): number => {
    const r = Math.sqrt(Math.max(0, n / stages[0]!));
    return 40 + r * (w - 60);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.12 * index }}
      className="rounded-xl border border-border-muted bg-surface/60 p-3 backdrop-blur-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: baseColor + '22', color: baseColor }}
          >
            <Globe2 className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-medium text-text">{PROVIDER_LABEL[provider]}</div>
            <div className="text-[10px] text-text-dim">{formatCount(totalSends)} sends</div>
          </div>
        </div>
        <Chip tone={inboxPct >= 92 ? 'accent' : inboxPct >= 88 ? 'accent4' : 'accent3'}>
          {formatPct(inboxPct)}
        </Chip>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <defs>
          <linearGradient id={`pf-${provider}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={baseColor} stopOpacity={0.34} />
            <stop offset="100%" stopColor={baseColor} stopOpacity={0.12} />
          </linearGradient>
        </defs>
        {stages.map((n, i) => {
          const wThis = widthFor(n);
          const wNext = i < stages.length - 1 ? widthFor(stages[i + 1]!) : wThis * 0.6;
          const yT = top + i * (segH + gap);
          const yB = yT + segH;
          const cx = w / 2;
          const r = 6;
          const xTL = cx - wThis / 2;
          const xTR = cx + wThis / 2;
          const xBL = cx - wNext / 2;
          const xBR = cx + wNext / 2;
          const d = [
            `M ${xTL + r} ${yT}`,
            `L ${xTR - r} ${yT}`,
            `Q ${xTR} ${yT} ${xTR} ${yT + r}`,
            `L ${xBR} ${yB - r}`,
            `Q ${xBR} ${yB} ${xBR - r} ${yB}`,
            `L ${xBL + r} ${yB}`,
            `Q ${xBL} ${yB} ${xBL} ${yB - r}`,
            `L ${xTL} ${yT + r}`,
            `Q ${xTL} ${yT} ${xTL + r} ${yT}`,
            'Z',
          ].join(' ');
          return (
            <g key={`${provider}-${i}`}>
              <motion.path
                d={d}
                fill="none"
                stroke={baseColor}
                strokeWidth={1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.12 * index + 0.08 * i + 0.3 }}
              />
              <motion.path
                d={d}
                fill={`url(#pf-${provider}-grad)`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.95 }}
                transition={{ duration: 0.35, delay: 0.12 * index + 0.08 * i + 0.55 }}
              />
              <motion.text
                x={cx}
                y={yT + segH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill={HEX.text}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 * index + 0.08 * i + 0.7 }}
              >
                {formatCount(n)}
              </motion.text>
              <motion.text
                x={6}
                y={yT + segH / 2 + 4}
                textAnchor="start"
                fontSize={9}
                fill={HEX.textDim}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 * index + 0.08 * i + 0.7 }}
              >
                {labels[i]}
              </motion.text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        <div className="rounded-md border border-border-muted bg-surface-2 px-1.5 py-1">
          <div className="text-[9px] uppercase text-text-dim">Inbox</div>
          <div className="text-[11px] font-semibold text-accent tabular-nums">
            {formatPct(inboxPct)}
          </div>
        </div>
        <div className="rounded-md border border-border-muted bg-surface-2 px-1.5 py-1">
          <div className="text-[9px] uppercase text-text-dim">Spam</div>
          <div className="text-[11px] font-semibold text-accent3 tabular-nums">
            {formatPct(spamPct)}
          </div>
        </div>
        <div className="rounded-md border border-border-muted bg-surface-2 px-1.5 py-1">
          <div className="text-[9px] uppercase text-text-dim">Blocked</div>
          <div className="text-[11px] font-semibold text-accent4 tabular-nums">
            {formatPct(blockedPct)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 30-day conversion sparkline (with cursor tracking)
// ---------------------------------------------------------------------------

function TimeSeriesPanel({ days }: { days: AgencyAnalyticsData['days30'] }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [containerW, setContainerW] = useState(880);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerW(Math.max(360, Math.floor(e.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Conversion rate = replies / sends * 100 (a sane single-line metric)
  const series = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        rate: d.sends > 0 ? (d.replies / d.sends) * 100 : 0,
        sends: d.sends,
        opens: d.opens,
        replies: d.replies,
        inboxPct: d.inboxPct,
      })),
    [days],
  );

  const vbW = containerW;
  const vbH = 220;
  const padL = 44;
  const padR = 18;
  const padT = 16;
  const padB = 26;
  const innerW = vbW - padL - padR;
  const innerH = vbH - padT - padB;

  const minR = series.length ? Math.min(...series.map((p) => p.rate)) : 0;
  const maxR = series.length ? Math.max(...series.map((p) => p.rate)) : 1;
  const padR1 = Math.max(0.4, (maxR - minR) * 0.2);
  const yMin = Math.max(0, minR - padR1);
  const yMax = maxR + padR1;
  const xFor = (i: number): number =>
    series.length <= 1 ? padL + innerW / 2 : padL + (i / (series.length - 1)) * innerW;
  const yFor = (v: number): number => {
    if (yMax === yMin) return padT + innerH / 2;
    return padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  };

  const linePath = useMemo(() => {
    if (series.length === 0) return '';
    let d = `M ${xFor(0).toFixed(2)} ${yFor(series[0]!.rate).toFixed(2)}`;
    for (let i = 1; i < series.length; i++) {
      const xPrev = xFor(i - 1);
      const yPrev = yFor(series[i - 1]!.rate);
      const xCur = xFor(i);
      const yCur = yFor(series[i]!.rate);
      const xMid = (xPrev + xCur) / 2;
      d += ` C ${xMid.toFixed(2)} ${yPrev.toFixed(2)}, ${xMid.toFixed(2)} ${yCur.toFixed(2)}, ${xCur.toFixed(2)} ${yCur.toFixed(2)}`;
    }
    return d;
  }, [series, containerW, vbH]); // eslint-disable-line react-hooks/exhaustive-deps

  const areaPath = useMemo(() => {
    if (!linePath) return '';
    const lastX = xFor(series.length - 1);
    const firstX = xFor(0);
    return `${linePath} L ${lastX.toFixed(2)} ${(padT + innerH).toFixed(2)} L ${firstX.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;
  }, [linePath, series.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const scale = vbW / rect.width;
    const xSvg = xPx * scale;
    const rel = (xSvg - padL) / innerW;
    if (rel < -0.02 || rel > 1.02 || series.length === 0) {
      setHoverIdx(null);
      return;
    }
    const idx = Math.round(rel * (series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const onLeave = () => setHoverIdx(null);

  const hoverPoint = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent2/10 text-accent2">
            <LineChart className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-medium text-text">30-day conversion rate</div>
            <div className="text-[10px] text-text-dim">
              Replies ÷ sends, by day · hover for detail
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="accent2">
            <Sparkles className="h-3 w-3" />
            Avg{' '}
            {series.length
              ? formatPct(
                  series.reduce((s, p) => s + p.rate, 0) / series.length,
                  2,
                )
              : '—'}
          </Chip>
          <Chip tone="accent">
            <TrendingUp className="h-3 w-3" />
            Peak{' '}
            {series.length ? formatPct(Math.max(...series.map((p) => p.rate)), 2) : '—'}
          </Chip>
        </div>
      </div>
      <div
        ref={containerRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="relative"
        style={{ height: vbH }}
      >
        <svg viewBox={`0 0 ${vbW} ${vbH}`} className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="ts-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.35} />
              <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {/* horizontal grid + Y labels */}
          {[0, 1, 2, 3, 4].map((i) => {
            const v = yMin + ((yMax - yMin) * i) / 4;
            const y = yFor(v);
            return (
              <g key={`gx-${i}`}>
                <line
                  x1={padL}
                  x2={vbW - padR}
                  y1={y}
                  y2={y}
                  stroke={HEX.border}
                  strokeWidth={0.6}
                  strokeDasharray="2 6"
                  opacity={0.6}
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={HEX.textDim}
                >
                  {formatPct(v, 1)}
                </text>
              </g>
            );
          })}
          {/* X labels — every 5th */}
          {series.map((p, i) => {
            if (i % 5 !== 0 && i !== series.length - 1) return null;
            const x = xFor(i);
            return (
              <text
                key={`xl-${i}`}
                x={x}
                y={vbH - 8}
                textAnchor="middle"
                fontSize={9}
                fill={HEX.textDim}
              >
                {shortDate(p.date)}
              </text>
            );
          })}

          {areaPath ? (
            <motion.path
              d={areaPath}
              fill="url(#ts-area)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            />
          ) : null}
          {linePath ? (
            <motion.path
              d={linePath}
              fill="none"
              stroke={HEX.accent2}
              strokeWidth={1.6}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          ) : null}

          {hoverIdx !== null && hoverPoint ? (
            <>
              <line
                x1={xFor(hoverIdx)}
                x2={xFor(hoverIdx)}
                y1={padT}
                y2={vbH - padB}
                stroke={HEX.accent2}
                strokeWidth={0.8}
                strokeDasharray="2 3"
                opacity={0.7}
              />
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(hoverPoint.rate)}
                r={4}
                fill={HEX.accent2}
                stroke={HEX.bg}
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>
        <AnimatePresence>
          {hoverPoint ? (
            <motion.div
              key={hoverIdx ?? -1}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute rounded-lg border border-border-muted bg-surface-2/95 p-2 shadow-lg backdrop-blur"
              style={{
                left: Math.max(8, Math.min(vbW - 200, xFor(hoverIdx as number) - 80)),
                top: 8,
                width: 188,
              }}
            >
              <div className="text-[10px] uppercase tracking-widest text-text-dim">
                {shortDate(hoverPoint.date)}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-base font-semibold text-accent2 tabular-nums">
                  {formatPct(hoverPoint.rate, 2)}
                </span>
                <span className="text-[10px] text-text-dim">reply rate</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[9px] uppercase text-text-dim">Sends</div>
                  <div className="text-[11px] font-medium text-text tabular-nums">
                    {formatCount(hoverPoint.sends)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-text-dim">Opens</div>
                  <div className="text-[11px] font-medium text-text tabular-nums">
                    {formatCount(hoverPoint.opens)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-text-dim">Replies</div>
                  <div className="text-[11px] font-medium text-text tabular-nums">
                    {formatCount(hoverPoint.replies)}
                  </div>
                </div>
              </div>
              <div className="mt-1 text-[9px] uppercase text-text-dim">
                Inbox {formatPct(hoverPoint.inboxPct, 1)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — drop-off diagnostics, recommendations, leaderboard
// ---------------------------------------------------------------------------

interface Recommendation {
  id: string;
  icon: JSX.Element;
  headline: string;
  body: string;
  tone: 'accent' | 'accent3' | 'accent4' | 'accent2';
}

function recommendationsFor(worst: FunnelStage, d: AgencyAnalyticsData): Recommendation[] {
  // Pure derivation — the recommendation copy keys off which stage leaks
  // hardest. Returned in priority order; the inspector shows the top 3.
  const recs: Recommendation[] = [];
  switch (worst.key) {
    case 'delivered':
      recs.push({
        id: 'r-1',
        icon: <ShieldAlert className="h-4 w-4" />,
        headline: 'Failed deliveries are blocking the funnel before it starts',
        body:
          'Audit DMARC + DKIM alignment on the bottom-3 sub-clients. A 1pp delivery lift here ' +
          'compounds through every later stage.',
        tone: 'accent3',
      });
      recs.push({
        id: 'r-2',
        icon: <Trash2 className="h-4 w-4" />,
        headline: 'Scrub catch-all & role recipients',
        body:
          'Roughly 24% of failed deliveries are role / catch-all. Run a verification pass before the next ' +
          'send cycle to lift delivered by ~0.6pp.',
        tone: 'accent4',
      });
      break;
    case 'inboxed':
      recs.push({
        id: 'r-3',
        icon: <Inbox className="h-4 w-4" />,
        headline: 'Spam folder is the largest single leak',
        body:
          'Outlook tenants are the heaviest culprit. Increase helper-inbox opens & replies weight by ' +
          '15% on those mailboxes for 7 days; expect a +1.8pp inbox lift.',
        tone: 'accent3',
      });
      recs.push({
        id: 'r-4',
        icon: <Flame className="h-4 w-4" />,
        headline: 'Warmup build-up underweight on three sub-clients',
        body:
          'Cobalt, Rivet and Keystone are still in their first 14 days and sending above their daily target. ' +
          'Pin them to the default helper group and slow the build-up 25%.',
        tone: 'accent4',
      });
      break;
    case 'opened':
      recs.push({
        id: 'r-5',
        icon: <Wand2 className="h-4 w-4" />,
        headline: 'Subject-line fatigue is suppressing opens',
        body:
          'Average open rate dropped 4.1pp WoW. Rotate the top-2 subject variants out for 7 ' +
          'days; the AI provider has 14 fresh candidates queued.',
        tone: 'accent4',
      });
      recs.push({
        id: 'r-6',
        icon: <Calendar className="h-4 w-4" />,
        headline: 'Send window misaligned to recipient timezone',
        body:
          '38% of opened mail is read between 09:00–11:00 local. Three sub-clients are sending ' +
          'after 17:00 UTC, missing the prime window.',
        tone: 'accent4',
      });
      break;
    case 'replied':
      recs.push({
        id: 'r-7',
        icon: <MessageCircle className="h-4 w-4" />,
        headline: 'Reply funnel narrows the most after open',
        body:
          'CTA placement audit: half of the bottom-quartile mailboxes have the CTA below the ' +
          'fold. Move it above the first paragraph and re-measure.',
        tone: 'accent3',
      });
      recs.push({
        id: 'r-8',
        icon: <Target className="h-4 w-4" />,
        headline: 'Shorten the first reply ask',
        body:
          'Replies above 2 sentences in the ask convert 3× lower. The content factory has a ' +
          '"single-question" template family ready to A/B.',
        tone: 'accent4',
      });
      break;
    default:
      recs.push({
        id: 'r-9',
        icon: <Sparkles className="h-4 w-4" />,
        headline: 'Funnel is operating at premium tier',
        body:
          'All stages convert above their healthy threshold. Maintain helper-group rotation pace ' +
          'and review again next week.',
        tone: 'accent',
      });
  }
  recs.push({
    id: 'r-10',
    icon: <Layers className="h-4 w-4" />,
    headline: 'Pin underperformers to the legacy helper group',
    body:
      `${d.subClientLeaderboard.filter((s) => s.status === 'at_risk').length} sub-clients ` +
      'are at risk. Routing them to the legacy group exempts them from sender-trust pressure ' +
      'while their build-up completes.',
    tone: 'accent2',
  });
  return recs;
}

function DropoffInspector({
  stages,
  data,
}: {
  stages: FunnelStage[];
  data: AgencyAnalyticsData;
}): JSX.Element {
  const worstIdx = useMemo(() => {
    let idx = 1;
    let worst = -1;
    for (let i = 1; i < stages.length; i++) {
      if (stages[i]!.dropoffPct > worst) {
        worst = stages[i]!.dropoffPct;
        idx = i;
      }
    }
    return idx;
  }, [stages]);
  const worst = stages[worstIdx]!;
  const sev = dropoffSeverity(worst.conversionPct);
  const recs = recommendationsFor(worst, data);
  const top5 = useMemo(
    () => [...data.subClientLeaderboard].sort((a, b) => b.inboxPct - a.inboxPct).slice(0, 5),
    [data.subClientLeaderboard],
  );

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent">
              <Funnel className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-dim">
                Drop-off diagnostics
              </div>
              <div className="text-sm font-medium text-text">Biggest leak right now</div>
            </div>
          </div>
          <Chip tone={sev === 'low' ? 'accent' : sev === 'mid' ? 'accent4' : 'accent3'}>
            {sev === 'low' ? 'Healthy' : sev === 'mid' ? 'Moderate' : 'Critical'}
          </Chip>
        </div>
        <div className="mt-4 rounded-xl border border-border-muted bg-surface-2/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              {stages[worstIdx - 1]!.label} → {worst.label}
            </span>
            <span className={'text-xs font-medium ' + severityTextClass(sev)}>
              {formatPct(worst.dropoffPct)} lost
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-text tabular-nums">
              {formatExact(stages[worstIdx - 1]!.count - worst.count)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-text-dim">
              recipients lost
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bg/60">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, Math.min(100, worst.dropoffPct))}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ backgroundColor: severityColor(sev) }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-text-dim">
            <span>Conversion {formatPct(worst.conversionPct)}</span>
            <span>Industry healthy ≥ 90%</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent2">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <div className="text-sm font-medium text-text">Recommended actions</div>
          </div>
          <Chip tone="neutral">{recs.length} ideas</Chip>
        </div>
        <ul className="flex flex-col gap-2">
          {recs.slice(0, 4).map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.06 * i + 0.15 }}
              className={
                'flex gap-3 rounded-xl border p-3 ' +
                (r.tone === 'accent'
                  ? 'border-accent/30 bg-accent/5'
                  : r.tone === 'accent2'
                    ? 'border-accent2/30 bg-accent2/5'
                    : r.tone === 'accent3'
                      ? 'border-accent3/30 bg-accent3/5'
                      : 'border-accent4/30 bg-accent4/5')
              }
            >
              <span
                className={
                  'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 ' +
                  (r.tone === 'accent'
                    ? 'text-accent'
                    : r.tone === 'accent2'
                      ? 'text-accent2'
                      : r.tone === 'accent3'
                        ? 'text-accent3'
                        : 'text-accent4')
                }
              >
                {r.icon}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-text">{r.headline}</div>
                <div className="mt-1 text-[11px] leading-snug text-text-dim">{r.body}</div>
              </div>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16 }}
        className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent4">
              <Trophy className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-sm font-medium text-text">Best converters</div>
              <div className="text-[10px] text-text-dim">Sub-clients by where emails land</div>
            </div>
          </div>
        </div>
        <ul className="flex flex-col gap-1.5">
          {top5.map((sc, i) => (
            <motion.li
              key={sc.id}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.06 * i + 0.2 }}
              className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface-2/60 px-2.5 py-2"
            >
              <span
                className={
                  'flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ' +
                  (i === 0
                    ? 'bg-accent4/15 text-accent4'
                    : i === 1
                      ? 'bg-accent/15 text-accent'
                      : 'bg-surface text-text-dim')
                }
              >
                {i === 0 ? <Crown className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg/60 text-xs font-semibold text-text">
                {sc.logoChar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-text">{sc.name}</div>
                <div className="text-[10px] text-text-dim">
                  {formatCount(sc.sends30d)} sends · warmth {sc.warmthScore}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-accent tabular-nums">
                  {formatPct(sc.inboxPct, 1)}
                </div>
                <div
                  className={
                    'text-[10px] tabular-nums ' +
                    (sc.delta30dPct > 0 ? 'text-accent' : 'text-accent3')
                  }
                >
                  {formatDeltaPct(sc.delta30dPct)}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Below-the-fold: weekly insights + comparisons table
// ---------------------------------------------------------------------------

function WeeklyInsightsStrip({
  insights,
}: {
  insights: AgencyAnalyticsData['weeklyInsights'];
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-medium text-text">Weekly insights</div>
            <div className="text-[10px] text-text-dim">
              Synthesised from the last 14 days of warmup signal
            </div>
          </div>
        </div>
        <Chip tone="neutral">{insights.length} items</Chip>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((ins, i) => (
          <motion.div
            key={ins.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 * i }}
            className={'rounded-xl border p-3 ' + SEVERITY_BG[ins.severity]}
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-widest ' +
                  SEVERITY_TEXT[ins.severity]
                }
              >
                {ins.severity === 'critical' ? (
                  <ShieldAlert className="h-3 w-3" />
                ) : ins.severity === 'warn' ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : ins.severity === 'success' ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <Activity className="h-3 w-3" />
                )}
                {ins.severity}
              </span>
              <span className="text-[10px] text-text-dim">{shortDate(ins.weekOf)}</span>
            </div>
            <div className="text-sm font-medium text-text">{ins.headline}</div>
            <div className="mt-1 text-[11px] leading-snug text-text-dim">{ins.body}</div>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
              <BarChart3 className="h-3 w-3" />
              {ins.metric}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ComparisonsTable({
  comparisons,
}: {
  comparisons: AgencyAnalyticsData['comparisons'];
}): JSX.Element {
  const [sortBy, setSortBy] = useState<AnalyticsMetric>('sends');
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState('');
  // "Filters" toggles a needs-attention view: rows below a healthy inbox rate
  // or above a spam threshold.
  const [attentionOnly, setAttentionOnly] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = q
      ? comparisons.filter((c) => c.subClientName.toLowerCase().includes(q))
      : comparisons;
    if (attentionOnly) {
      filtered = filtered.filter((c) => c.inboxRate < 92 || c.spamRate > 2.5);
    }
    const valueFor = (c: AgencyAnalyticsData['comparisons'][number]): number => {
      switch (sortBy) {
        case 'sends':
          return c.sends;
        case 'opens':
          return c.opens;
        case 'replies':
          return c.replies;
        case 'inbox_rate':
          return c.inboxRate;
        case 'spam_rate':
          return c.spamRate;
        case 'bounce_rate':
          return c.bounceRate;
        case 'warmth':
          return c.warmth;
      }
    };
    const sorted = [...filtered].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      return asc ? av - bv : bv - av;
    });
    return sorted;
  }, [comparisons, sortBy, asc, query, attentionOnly]);

  const headerCell = (label: string, key: AnalyticsMetric) => (
    <button
      type="button"
      onClick={() => {
        if (sortBy === key) {
          setAsc((v) => !v);
        } else {
          setSortBy(key);
          setAsc(false);
        }
      }}
      className={
        'group inline-flex items-center gap-1 text-[10px] uppercase tracking-widest ' +
        (sortBy === key ? 'text-accent' : 'text-text-dim hover:text-text')
      }
    >
      {label}
      {sortBy === key ? (
        asc ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )
      ) : (
        <Minus className="h-3 w-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent2">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-sm font-medium text-text">Sub-client comparison</div>
            <div className="text-[10px] text-text-dim">
              Side-by-side metrics for the current period
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-2 py-1 text-[11px] text-text-dim">
            <Search className="h-3 w-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter sub-clients"
              className="w-32 bg-transparent text-text placeholder:text-text-dim focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setAttentionOnly((v) => !v)}
            aria-pressed={attentionOnly}
            className={
              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ' +
              (attentionOnly
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border-muted bg-surface-2 text-text-dim hover:text-text')
            }
          >
            <Filter className="h-3 w-3" /> {attentionOnly ? 'Needs attention' : 'Filters'}
          </button>
          <button
            type="button"
            onClick={() => exportComparisons(rows)}
            className="inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-2 py-1 text-[11px] text-text-dim hover:text-text"
          >
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-muted">
              <th className="px-2 py-2 text-left">
                <span className="text-[10px] uppercase tracking-widest text-text-dim">
                  Sub-client
                </span>
              </th>
              <th className="px-2 py-2 text-right">{headerCell('Sends', 'sends')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Opens', 'opens')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Replies', 'replies')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Inbox', 'inbox_rate')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Spam', 'spam_rate')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Failed', 'bounce_rate')}</th>
              <th className="px-2 py-2 text-right">{headerCell('Warmth', 'warmth')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <motion.tr
                key={r.subClientId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: 0.02 * i }}
                className="border-b border-border-muted/60 hover:bg-surface-2/50"
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-2 text-[11px] font-semibold text-text">
                      {r.subClientName.charAt(0)}
                    </span>
                    <span className="text-xs text-text">{r.subClientName}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right text-xs text-text tabular-nums">
                  {formatExact(r.sends)}
                </td>
                <td className="px-2 py-2 text-right text-xs text-text tabular-nums">
                  {formatExact(r.opens)}
                </td>
                <td className="px-2 py-2 text-right text-xs text-text tabular-nums">
                  {formatExact(r.replies)}
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  <span className={r.inboxRate >= 92 ? 'text-accent' : r.inboxRate >= 88 ? 'text-accent4' : 'text-accent3'}>
                    {formatPct(r.inboxRate, 1)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  <span className={r.spamRate <= 2 ? 'text-accent' : r.spamRate <= 3.5 ? 'text-accent4' : 'text-accent3'}>
                    {formatPct(r.spamRate, 1)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  <span className={r.bounceRate <= 1 ? 'text-accent' : r.bounceRate <= 2 ? 'text-accent4' : 'text-accent3'}>
                    {formatPct(r.bounceRate, 1)}
                  </span>
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums">
                  <span className={r.warmth >= 75 ? 'text-accent' : r.warmth >= 65 ? 'text-accent4' : 'text-accent3'}>
                    {r.warmth}
                  </span>
                </td>
              </motion.tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-xs text-text-dim">
                  No sub-clients match "{query}".
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header (workspace, period, KPI tiles)
// ---------------------------------------------------------------------------

function AnalyticsHeader({
  data,
  period,
  setPeriod,
}: {
  data: AgencyAnalyticsData;
  period: AnalyticsPeriod;
  setPeriod: (p: AnalyticsPeriod) => void;
}): JSX.Element {
  const [periodOpen, setPeriodOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-muted bg-surface text-accent">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-text">{data.workspace.name}</h1>
              <Chip tone="accent">
                <Crown className="h-3 w-3" /> Agency tier
              </Chip>
              <Chip tone="accent2">
                <Globe2 className="h-3 w-3" /> Multi-region
              </Chip>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-text-dim">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> {data.workspace.subClientCount} sub-clients
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {data.workspace.mailboxCount} mailboxes
              </span>
              <span className="inline-flex items-center gap-1">
                <Radio className="h-3 w-3" /> Live analytics feed
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-borderStrong"
            >
              <Calendar className="h-3.5 w-3.5 text-text-dim" />
              {PERIOD_LABEL[period]}
              <ChevronDown className="h-3 w-3 text-text-dim" />
            </button>
            <AnimatePresence>
              {periodOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-border-muted bg-surface-2 p-1 shadow-xl"
                >
                  {(Object.keys(PERIOD_LABEL) as AnalyticsPeriod[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPeriod(p);
                        setPeriodOpen(false);
                      }}
                      className={
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-surface ' +
                        (p === period ? 'text-accent' : 'text-text')
                      }
                    >
                      {PERIOD_LABEL[p]}
                      {p === period ? <CircleDot className="h-3 w-3" /> : null}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <Chip tone={data.kpis.momGrowthPct > 0 ? 'accent' : 'accent3'}>
            {data.kpis.momGrowthPct > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {formatDeltaPct(data.kpis.momGrowthPct)} MoM
          </Chip>
          <button
            type="button"
            onClick={() => exportComparisons(data.comparisons)}
            className="inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text-dim hover:text-text"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <AppDropdown>
            <AppDropdownTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text-dim hover:text-text"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </AppDropdownTrigger>
            <AppDropdownContent align="end">
              <AppDropdownItem onSelect={() => exportComparisons(data.comparisons)}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </AppDropdownItem>
            </AppDropdownContent>
          </AppDropdown>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          index={0}
          icon={<Send className="h-3 w-3" />}
          label="Sends · 30d"
          value={formatCount(data.kpis.totalSends30d)}
          delta={data.kpis.momGrowthPct}
        />
        <KpiTile
          index={1}
          icon={<MailOpen className="h-3 w-3" />}
          label="Opens · 30d"
          value={formatCount(data.kpis.totalOpens30d)}
          hint={formatPct(pctOf(data.kpis.totalOpens30d, data.kpis.totalSends30d), 1) + ' of sends'}
        />
        <KpiTile
          index={2}
          icon={<Reply className="h-3 w-3" />}
          label="Replies · 30d"
          value={formatCount(data.kpis.totalReplies30d)}
          hint={formatPct(pctOf(data.kpis.totalReplies30d, data.kpis.totalOpens30d), 1) + ' of opens'}
        />
        <KpiTile
          index={3}
          icon={<Inbox className="h-3 w-3" />}
          label="Inbox rate"
          value={formatPct(data.kpis.inboxRatePct, 1)}
        />
        <KpiTile
          index={4}
          icon={<MailWarning className="h-3 w-3" />}
          label="Spam rate"
          value={formatPct(data.kpis.spamRatePct, 1)}
        />
        <KpiTile
          index={5}
          icon={<Gauge className="h-3 w-3" />}
          label="Avg warmth"
          value={data.kpis.avgWarmth.toFixed(1)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subtle background gradient — sits behind the whole page
// ---------------------------------------------------------------------------

function BackgroundGradient(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute -left-32 -top-32 h-[440px] w-[440px] rounded-full opacity-30 blur-2xl"
        style={{
          background: 'radial-gradient(closest-side, rgba(242, 101, 34,0.45), transparent 70%)',
        }}
      />
      <div
        className="absolute right-[-160px] top-[180px] h-[520px] w-[520px] rounded-full opacity-25 blur-2xl"
        style={{
          background: 'radial-gradient(closest-side, rgba(255, 138, 75,0.4), transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-[-200px] left-1/3 h-[560px] w-[560px] rounded-full opacity-20 blur-2xl"
        style={{
          background: 'radial-gradient(closest-side, rgba(255,107,74,0.35), transparent 70%)',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating "flow" particles — decorative, sit inside the hero funnel column.
// Pure CSS-driven via framer-motion's animation; no expensive RAF state.
// ---------------------------------------------------------------------------

interface FlowParticle {
  id: number;
  delay: number;
  duration: number;
  offset: number;
  size: number;
  hue: string;
}

function buildParticles(count: number): FlowParticle[] {
  const hues = [HEX.accent, HEX.accent2, HEX.accent4];
  const out: FlowParticle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: i,
      delay: (i * 0.45) % 5,
      duration: 4.5 + ((i * 7) % 5) * 0.4,
      offset: ((i * 13) % 80) - 40,
      size: 2 + ((i * 3) % 4),
      hue: hues[i % hues.length]!,
    });
  }
  return out;
}

function FlowParticles(): JSX.Element {
  const particles = useMemo(() => buildParticles(14), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, opacity: 0 }}
          animate={{
            y: ['-5%', '105%'],
            opacity: [0, 0.7, 0.7, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeIn',
            times: [0, 0.1, 0.85, 1],
          }}
          className="absolute rounded-full"
          style={
            {
              left: `calc(50% + ${p.offset}px)`,
              width: p.size,
              height: p.size,
              backgroundColor: p.hue,
              boxShadow: `0 0 8px ${p.hue}`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top of file — main export
// ---------------------------------------------------------------------------

export function AgAnaR3Funnel({ data }: { data?: AgencyAnalyticsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const [period, setPeriod] = useState<AnalyticsPeriod>(d.period);
  const stages = useMemo(() => buildStages(d.funnel), [d.funnel]);
  const geom = useMemo(() => computeHeroGeometry(stages), [stages]);
  const [hoveredStage, setHoveredStage] = useState<FunnelStageKey | null>(null);

  // Spring the conversion of the worst stage into a sticky "headline %" used
  // for the hero summary chip in the inspector hero block. Keeps the number
  // from snapping when data swaps.
  const worstConversion = useMemo(() => {
    let worst = 100;
    for (let i = 1; i < stages.length; i++) {
      if (stages[i]!.conversionPct < worst) worst = stages[i]!.conversionPct;
    }
    return worst;
  }, [stages]);
  const worstMv = useMotionValue(worstConversion);
  const worstSpring = useSpring(worstMv, { stiffness: 90, damping: 18 });
  useEffect(() => {
    worstMv.set(worstConversion);
  }, [worstConversion, worstMv]);
  const [, setSpringTick] = useState(0);
  useAnimationFrame(() => {
    setSpringTick((t) => (t + 1) % 1_000_000);
  });
  const liveWorst = worstSpring.get();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-text">
      <BackgroundGradient />
      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6">
        <AnalyticsHeader data={d} period={period} setPeriod={setPeriod} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* MAIN CANVAS */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            {/* Hero funnel */}
            <div className="relative rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Funnel className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-text">
                      Conversion funnel · {PERIOD_LABEL[period]}
                    </div>
                    <div className="text-[10px] text-text-dim">
                      Sends → Delivered → Inboxed → Opened → Replied
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="neutral">
                    <Percent className="h-3 w-3" />
                    Worst stage {formatPct(liveWorst, 1)}
                  </Chip>
                  <Chip tone="accent">
                    <Droplet className="h-3 w-3" />
                    {formatExact(d.funnel.sends - d.funnel.replied)} lost
                  </Chip>
                  <Chip tone="accent2">
                    <Signal className="h-3 w-3" />
                    {formatPct(pctOf(d.funnel.replied, d.funnel.sends), 2)} end-to-end
                  </Chip>
                </div>
              </div>
              <div className="relative">
                <FlowParticles />
                <HeroFunnel
                  stages={stages}
                  geom={geom}
                  hoveredKey={hoveredStage}
                  onHover={setHoveredStage}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-text-dim">
                <span className="inline-flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 rotate-90" /> Audience narrows top-to-bottom
                </span>
                <span>Status-tinted by per-stage drop-off severity</span>
              </div>
            </div>

            {/* Provider funnels */}
            <div className="rounded-2xl border border-border-muted bg-surface/40 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent2/10 text-accent2">
                    <Globe2 className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-text">By provider</div>
                    <div className="text-[10px] text-text-dim">
                      One funnel per recipient mailbox provider
                    </div>
                  </div>
                </div>
                <Chip tone="neutral">{d.providerMix.length} providers</Chip>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {d.providerMix.map((pm, i) => (
                  <ProviderFunnel
                    key={pm.provider}
                    provider={pm.provider}
                    totalSends={pm.sends}
                    inboxPct={pm.inboxPct}
                    spamPct={pm.spamPct}
                    blockedPct={pm.blockedPct}
                    index={i}
                  />
                ))}
              </div>
            </div>

            {/* Time-series panel */}
            <TimeSeriesPanel days={d.days30} />
          </div>

          {/* RIGHT INSPECTOR */}
          <aside className="lg:col-span-4">
            <DropoffInspector stages={stages} data={d} />
          </aside>
        </div>

        {/* BELOW THE FOLD */}
        <WeeklyInsightsStrip insights={d.weeklyInsights} />
        <ComparisonsTable comparisons={d.comparisons} />

        <div className="flex items-center justify-between rounded-2xl border border-border-muted bg-surface/40 px-4 py-3 text-[11px] text-text-dim">
          <div className="inline-flex items-center gap-2">
            <Activity className="h-3 w-3 text-accent" />
            Funnel computed from {formatExact(d.funnel.sends)} sends across{' '}
            {d.workspace.mailboxCount} mailboxes
          </div>
          <div className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3" /> Variant R3 · Funnel Theatre
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgAnaR3Funnel;
