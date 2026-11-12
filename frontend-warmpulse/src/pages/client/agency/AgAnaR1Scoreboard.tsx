import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { formatNumber, formatDate } from '@/lib/format';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  Crown,
  Flame,
  Gauge,
  Globe2,
  Inbox,
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  Medal,
  MessageSquare,
  Minus,
  Radio,
  Reply,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  Target,
  Trophy,
  TrendingUp,
  Zap,
} from 'lucide-react';

/**
 * AgAnaR1Scoreboard — Agency-tier Analytics, design candidate #1, "Scoreboard Wall".
 *
 * The Agency Analytics surface re-imagined as a stadium / arena scoreboard.
 * Massive LED-style numeric displays dominate the canvas: SENDS, OPENS,
 * REPLIES, INBOX% — each a 120-160px tall monospace digit rack with a
 * status-tinted glow and a faint segment flicker for that "living big
 * board" feel. Below the hero: a wide 30-day TIME-SERIES BLEACHERS chart
 * (4 lines, draw-in on mount, cursor-tracking guide + value tooltip).
 * Then a TEAM STANDINGS leaderboard styled like league standings (rank,
 * logo chip, name, sends, inbox %, warmth, delta) with a gold treatment
 * on the #1 row. Finally, a PROVIDER MIX SCOREBOARD STRIP — 4 mini
 * scoreboards (Gmail / Outlook / Yahoo / SMTP) that count up sequentially.
 *
 * The RIGHT inspector is the "GAME RECAP" column: weekly headlines /
 * alerts / top mover, all styled like trading-card / baseball-card
 * insets.
 *
 * Fully STANDALONE — no network, no router, no query hooks. Inline MOCK
 * supplies every field so the preview harness mounts it prop-less. A
 * future adapter will pass `data` once the live aggregate analytics
 * endpoint exists.
 *
 * NOT a card grid, NOT a heatmap. The scoreboard identity (huge LED
 * digits + odometer count-up + flicker + bleachers chart) is the
 * differentiator versus the sibling R2/R3/R4 Agency Analytics variants.
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
// Convenience aliases so we can keep prop types tight without re-declaring
// the array element shapes everywhere.
// ---------------------------------------------------------------------------

type DayPoint = AgencyAnalyticsData['days30'][number];
type ProviderPoint = AgencyAnalyticsData['providerMix'][number];
type LeaderRow = AgencyAnalyticsData['subClientLeaderboard'][number];
type Insight = AgencyAnalyticsData['weeklyInsights'][number];
type Comparison = AgencyAnalyticsData['comparisons'][number];

// ---------------------------------------------------------------------------
// Empty-state SKELETON used by the preview harness when the live endpoint
// hasn't returned yet. Numbers are all zero; arrays are empty. The render
// path treats this the same as a real payload — there are no guards.
// ---------------------------------------------------------------------------

export const AGENCY_ANALYTICS_SKELETON_R1: AgencyAnalyticsData = {
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
// MOCK — Northwind Agency / 8 sub-clients / 96 mailboxes.
// Daily growth curve from ~400 sends/day → ~650 sends/day over 30 days,
// with realistic mid-week dips.
// ---------------------------------------------------------------------------

const MOCK_DAYS: DayPoint[] = (() => {
  // Deterministic growth curve — start ~400, end ~650, weekday dips on
  // index % 7 === 6 (weekend) where volume eases by 18%.
  const out: DayPoint[] = [];
  const startDate = new Date('2026-04-28T00:00:00Z');
  for (let i = 0; i < 30; i += 1) {
    const t = i / 29;
    const base = 400 + Math.round(250 * t);
    const weekendDip = i % 7 === 6 ? 0.82 : 1;
    const noise = 1 + ((i * 37) % 11) / 100 - 0.05; // ±5% deterministic noise
    const sends = Math.round(base * weekendDip * noise);
    const opens = Math.round(sends * (0.55 + t * 0.05) * (1 + ((i * 13) % 7) / 200));
    const replies = Math.round(opens * (0.26 + t * 0.02));
    const inboxPct = Math.min(
      94,
      Math.max(78, Math.round((82 + t * 6 + ((i * 17) % 5) - 2) * 10) / 10),
    );
    out.push({
      date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      sends,
      opens,
      replies,
      inboxPct,
    });
  }
  return out;
})();

const MOCK: AgencyAnalyticsData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: 8,
    mailboxCount: 96,
  },
  period: 'last_30d',
  kpis: {
    totalSends30d: 14820,
    totalOpens30d: 8640,
    totalReplies30d: 2410,
    inboxRatePct: 86,
    spamRatePct: 2.4,
    bounceRatePct: 1.8,
    avgWarmth: 82,
    momGrowthPct: 9.6,
  },
  days30: MOCK_DAYS,
  funnel: {
    sends: 14820,
    delivered: 14550,
    inboxed: 12513,
    opened: 8640,
    replied: 2410,
  },
  providerMix: [
    { provider: 'gmail', sends: 7204, inboxPct: 89, spamPct: 1.8, blockedPct: 0.4 },
    { provider: 'outlook', sends: 4216, inboxPct: 84, spamPct: 2.9, blockedPct: 0.7 },
    { provider: 'yahoo', sends: 1820, inboxPct: 81, spamPct: 3.4, blockedPct: 1.1 },
    { provider: 'smtp', sends: 1580, inboxPct: 78, spamPct: 4.1, blockedPct: 1.4 },
  ],
  subClientLeaderboard: [
    {
      id: 'sc_helix',
      name: 'Helix Labs',
      logoChar: 'H',
      sends30d: 2640,
      inboxPct: 93,
      warmthScore: 94,
      delta30dPct: 18,
      status: 'healthy',
    },
    {
      id: 'sc_orbit',
      name: 'Orbit Capital',
      logoChar: 'O',
      sends30d: 2410,
      inboxPct: 91,
      warmthScore: 90,
      delta30dPct: 14,
      status: 'healthy',
    },
    {
      id: 'sc_canopy',
      name: 'Canopy SaaS',
      logoChar: 'C',
      sends30d: 2180,
      inboxPct: 88,
      warmthScore: 86,
      delta30dPct: 9,
      status: 'healthy',
    },
    {
      id: 'sc_juno',
      name: 'Juno Retail',
      logoChar: 'J',
      sends30d: 1960,
      inboxPct: 86,
      warmthScore: 83,
      delta30dPct: 5,
      status: 'healthy',
    },
    {
      id: 'sc_pinea',
      name: 'Pinea Health',
      logoChar: 'P',
      sends30d: 1720,
      inboxPct: 84,
      warmthScore: 80,
      delta30dPct: 2,
      status: 'warming',
    },
    {
      id: 'sc_klein',
      name: 'Klein & Co',
      logoChar: 'K',
      sends30d: 1480,
      inboxPct: 82,
      warmthScore: 76,
      delta30dPct: -3,
      status: 'warming',
    },
    {
      id: 'sc_meridian',
      name: 'Meridian Travel',
      logoChar: 'M',
      sends30d: 1240,
      inboxPct: 79,
      warmthScore: 71,
      delta30dPct: -8,
      status: 'warming',
    },
    {
      id: 'sc_atlas',
      name: 'Atlas Bio',
      logoChar: 'A',
      sends30d: 1190,
      inboxPct: 72,
      warmthScore: 58,
      delta30dPct: -22,
      status: 'at_risk',
    },
  ],
  weeklyInsights: [
    {
      id: 'wi_1',
      weekOf: '2026-05-18',
      headline: 'Helix Labs hit a 93% inbox rate — agency record',
      body:
        'Helix crossed +18% MoM on send volume while holding inbox above 92% for 11 straight days. Their ramp ladder is officially complete; we can graduate the workspace from peer pool A to the elite pool.',
      metric: 'inbox_rate',
      severity: 'success',
    },
    {
      id: 'wi_2',
      weekOf: '2026-05-18',
      headline: 'Atlas Bio bounce rate spiked to 4.1%',
      body:
        'Atlas saw bounces climb to 4.1% on Tue-Wed, primarily from one Outlook tenant. SPF/DKIM look good — likely a list-hygiene issue upstream. Recommend pausing aggressive ramp until owner audits the source list.',
      metric: 'bounce_rate',
      severity: 'critical',
    },
    {
      id: 'wi_3',
      weekOf: '2026-05-11',
      headline: 'Yahoo deliverability dipped agency-wide',
      body:
        'Yahoo inbox slid from 86% → 81% week-over-week across 4 sub-clients. Spam folder rate up. Yahoo rolled a filter change on the 13th. We are auto-throttling Yahoo sends and lifting them back over the next 6 days.',
      metric: 'inbox_rate',
      severity: 'warn',
    },
    {
      id: 'wi_4',
      weekOf: '2026-05-04',
      headline: 'Reply rate trending up: 16.2% → 18.7%',
      body:
        'Across all 8 sub-clients, peer-network reply rate climbed 2.5pp this period. LLM thread-content quality (Gemini) is holding; reply templates are diversifying naturally as the corpus grows.',
      metric: 'replies',
      severity: 'info',
    },
  ],
  comparisons: [
    {
      subClientId: 'sc_helix',
      subClientName: 'Helix Labs',
      sends: 2640,
      opens: 1610,
      replies: 480,
      inboxRate: 93,
      spamRate: 1.4,
      bounceRate: 1.2,
      warmth: 94,
    },
    {
      subClientId: 'sc_orbit',
      subClientName: 'Orbit Capital',
      sends: 2410,
      opens: 1430,
      replies: 410,
      inboxRate: 91,
      spamRate: 1.8,
      bounceRate: 1.3,
      warmth: 90,
    },
    {
      subClientId: 'sc_canopy',
      subClientName: 'Canopy SaaS',
      sends: 2180,
      opens: 1280,
      replies: 360,
      inboxRate: 88,
      spamRate: 2.1,
      bounceRate: 1.5,
      warmth: 86,
    },
    {
      subClientId: 'sc_juno',
      subClientName: 'Juno Retail',
      sends: 1960,
      opens: 1140,
      replies: 310,
      inboxRate: 86,
      spamRate: 2.4,
      bounceRate: 1.6,
      warmth: 83,
    },
    {
      subClientId: 'sc_pinea',
      subClientName: 'Pinea Health',
      sends: 1720,
      opens: 980,
      replies: 250,
      inboxRate: 84,
      spamRate: 2.6,
      bounceRate: 1.8,
      warmth: 80,
    },
    {
      subClientId: 'sc_klein',
      subClientName: 'Klein & Co',
      sends: 1480,
      opens: 820,
      replies: 200,
      inboxRate: 82,
      spamRate: 2.9,
      bounceRate: 2.0,
      warmth: 76,
    },
    {
      subClientId: 'sc_meridian',
      subClientName: 'Meridian Travel',
      sends: 1240,
      opens: 660,
      replies: 160,
      inboxRate: 79,
      spamRate: 3.2,
      bounceRate: 2.3,
      warmth: 71,
    },
    {
      subClientId: 'sc_atlas',
      subClientName: 'Atlas Bio',
      sends: 1190,
      opens: 540,
      replies: 110,
      inboxRate: 72,
      spamRate: 4.1,
      bounceRate: 3.4,
      warmth: 58,
    },
  ],
};

// ---------------------------------------------------------------------------
// Misc helpers — formatting + status palette + period labels.
// ---------------------------------------------------------------------------

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  last_year: 'Last year',
};

const PERIOD_SHORT: Record<AnalyticsPeriod, string> = {
  last_7d: '7d',
  last_30d: '30d',
  last_90d: '90d',
  last_year: '1y',
};

const STATUS_TINT: Record<SubClientStatus, { ring: string; chip: string; label: string }> = {
  healthy: {
    ring: 'ring-accent/40',
    chip: 'bg-accent/15 text-accent border border-accent/30',
    label: 'Healthy',
  },
  warming: {
    ring: 'ring-accent4/40',
    chip: 'bg-accent4/15 text-accent4 border border-accent4/30',
    label: 'Warming',
  },
  at_risk: {
    ring: 'ring-accent3/40',
    chip: 'bg-accent3/15 text-accent3 border border-accent3/30',
    label: 'At risk',
  },
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
};

const PROVIDER_TONE: Record<Provider, string> = {
  gmail: 'text-accent2',
  outlook: 'text-accent',
  yahoo: 'text-accent4',
  smtp: 'text-accent3',
};

const SEVERITY_PALETTE: Record<
  InsightSeverity,
  { tone: string; chip: string; iconBg: string; border: string }
> = {
  info: {
    tone: 'text-accent2',
    chip: 'bg-accent2/15 text-accent2 border border-accent2/30',
    iconBg: 'bg-accent2/10 text-accent2 border-accent2/30',
    border: 'border-accent2/20',
  },
  success: {
    tone: 'text-accent',
    chip: 'bg-accent/15 text-accent border border-accent/30',
    iconBg: 'bg-accent/10 text-accent border-accent/30',
    border: 'border-accent/20',
  },
  warn: {
    tone: 'text-accent4',
    chip: 'bg-accent4/15 text-accent4 border border-accent4/30',
    iconBg: 'bg-accent4/10 text-accent4 border-accent4/30',
    border: 'border-accent4/20',
  },
  critical: {
    tone: 'text-accent3',
    chip: 'bg-accent3/15 text-accent3 border border-accent3/30',
    iconBg: 'bg-accent3/10 text-accent3 border-accent3/30',
    border: 'border-accent3/20',
  },
};

function formatNum(n: number): string {
  return formatNumber(n);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatDeltaPct(d: number): string {
  if (d === 0) return '0.0%';
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return formatDate(d);
}

// ---------------------------------------------------------------------------
// useCountUp — odometer-style integer/float interpolation. We tween from 0
// to `target` over `durationMs`, easing with cubic ease-out for that
// satisfying "snaps to value" feel. Returns the current displayed value.
// Honors prefers-reduced-motion by snapping instantly.
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useCountUp(target: number, durationMs = 1600, startDelayMs = 0, enabled = true): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce || !enabled ? target : 0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !enabled) {
      setValue(target);
      return;
    }
    setValue(0);
    startRef.current = null;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now + startDelayMs;
      const elapsed = now - startRef.current;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = clamp(elapsed / durationMs, 0, 1);
      const eased = easeOutCubic(t);
      setValue(target * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, startDelayMs, enabled, reduce]);

  return value;
}

// ---------------------------------------------------------------------------
// useDigitFlicker — every ~700-1500ms picks a random digit position and
// emits a brief opacity dip. Driven by a state token (an array of N
// opacities). N is the digit count of the panel.
// ---------------------------------------------------------------------------

function useDigitFlicker(digitCount: number, enabled = true): number[] {
  const reduce = useReducedMotion();
  const [opacities, setOpacities] = useState<number[]>(() =>
    Array.from({ length: digitCount }, () => 1),
  );

  useEffect(() => {
    setOpacities(Array.from({ length: digitCount }, () => 1));
  }, [digitCount]);

  useEffect(() => {
    if (reduce || !enabled || digitCount === 0) return;
    let alive = true;
    const schedule = () => {
      const wait = 700 + Math.random() * 1400;
      const id = setTimeout(() => {
        if (!alive) return;
        const idx = Math.floor(Math.random() * digitCount);
        setOpacities((prev) => {
          const next = prev.slice();
          next[idx] = 0.78;
          return next;
        });
        setTimeout(() => {
          if (!alive) return;
          setOpacities((prev) => {
            const next = prev.slice();
            next[idx] = 1;
            return next;
          });
          schedule();
        }, 110);
      }, wait);
      return () => clearTimeout(id);
    };
    const stop = schedule();
    return () => {
      alive = false;
      stop?.();
    };
  }, [digitCount, enabled, reduce]);

  return opacities;
}

// ---------------------------------------------------------------------------
// LedDigits — the heart of the scoreboard. Renders a value as a sequence
// of monospace digits in a recessed LED panel. Supports an optional
// fractional segment ("86.4%") and a status tint that drives the panel
// glow + digit color.
// ---------------------------------------------------------------------------

type LedTone = 'accent' | 'accent2' | 'accent3' | 'accent4' | 'emerald';

const TONE_GLOW: Record<LedTone, { text: string; glow: string; border: string; bg: string }> = {
  accent: {
    text: 'text-accent',
    glow: 'shadow-[0_0_48px_-12px_rgba(242, 101, 34,0.55)]',
    border: 'border-accent/40',
    bg: 'bg-gradient-to-b from-accent/[0.08] to-transparent',
  },
  accent2: {
    text: 'text-accent2',
    glow: 'shadow-[0_0_48px_-12px_rgba(255, 138, 75,0.5)]',
    border: 'border-accent2/40',
    bg: 'bg-gradient-to-b from-accent2/[0.08] to-transparent',
  },
  accent3: {
    text: 'text-accent3',
    glow: 'shadow-[0_0_48px_-12px_rgba(255,107,74,0.5)]',
    border: 'border-accent3/40',
    bg: 'bg-gradient-to-b from-accent3/[0.08] to-transparent',
  },
  accent4: {
    text: 'text-accent4',
    glow: 'shadow-[0_0_48px_-12px_rgba(255,213,79,0.5)]',
    border: 'border-accent4/40',
    bg: 'bg-gradient-to-b from-accent4/[0.08] to-transparent',
  },
  emerald: {
    text: 'text-accent',
    glow: 'shadow-[0_0_48px_-12px_rgba(52,211,153,0.55)]',
    border: 'border-accent/40',
    bg: 'bg-gradient-to-b from-accent/[0.08] to-transparent',
  },
};

interface LedDigitsProps {
  value: number;
  fractionDigits?: number;
  suffix?: string;
  prefix?: string;
  pad?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: LedTone;
}

function LedDigits({
  value,
  fractionDigits = 0,
  suffix,
  prefix,
  pad = 0,
  size = 'lg',
  tone = 'accent',
}: LedDigitsProps): JSX.Element {
  // Build the digit string. We separate integer + fractional parts so we
  // can render the decimal point as its own segment.
  const fixed = value.toFixed(fractionDigits);
  let [intPart, fracPart] = fixed.split('.') as [string, string | undefined];
  if (pad > 0 && intPart.length < pad) {
    intPart = intPart.padStart(pad, '0');
  }

  const intChars = intPart.split('');
  const fracChars = fracPart ? fracPart.split('') : [];
  const totalDigits = intChars.length + fracChars.length;
  const flicker = useDigitFlicker(totalDigits);

  const sizeCls = {
    sm: 'text-3xl md:text-4xl',
    md: 'text-5xl md:text-6xl',
    lg: 'text-6xl md:text-7xl',
    xl: 'text-7xl md:text-[7.5rem] leading-none',
  }[size];

  const palette = TONE_GLOW[tone];

  // Thousands-separator commas, computed against the un-padded integer.
  // We compute comma positions from the END of the integer string.
  const intLen = intChars.length;
  const commaFromRight = new Set<number>();
  for (let pos = 3; pos < intLen; pos += 3) {
    commaFromRight.add(pos);
  }

  return (
    <div
      className={[
        'relative inline-flex items-baseline gap-1 rounded-xl border px-3 py-2 md:px-4 md:py-3',
        'font-mono font-bold tabular-nums tracking-tighter',
        palette.text,
        palette.border,
        palette.bg,
        palette.glow,
        sizeCls,
      ].join(' ')}
      style={{ textShadow: '0 0 18px currentColor' }}
    >
      {/* Recessed LED grid background */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.08]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 6px)',
        }}
      />
      {prefix ? (
        <span className="relative text-[0.55em] opacity-70 mr-1 self-center">{prefix}</span>
      ) : null}

      {intChars.map((ch, i) => {
        const fromRight = intChars.length - 1 - i;
        const showComma = commaFromRight.has(fromRight) && fromRight !== 0;
        const op = flicker[i] ?? 1;
        return (
          <span key={`int-${i}`} className="relative inline-flex items-baseline">
            <span
              className="relative inline-block"
              style={{ opacity: op, transition: 'opacity 120ms ease-out' }}
            >
              {ch}
            </span>
            {showComma ? (
              <span className="relative inline-block opacity-50 mx-[0.05em]">,</span>
            ) : null}
          </span>
        );
      })}

      {fracChars.length > 0 ? (
        <span className="relative inline-flex items-baseline">
          <span className="relative inline-block opacity-60 mx-[0.05em] text-[0.55em] self-end pb-[0.4em]">
            .
          </span>
          {fracChars.map((ch, i) => {
            const op = flicker[intChars.length + i] ?? 1;
            return (
              <span
                key={`frac-${i}`}
                className="relative inline-block text-[0.7em] self-end pb-[0.05em]"
                style={{ opacity: op, transition: 'opacity 120ms ease-out' }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ) : null}

      {suffix ? (
        <span className="relative text-[0.45em] opacity-80 ml-1 self-end pb-[0.6em]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeltaChip — +/- pct chip with arrow icon. Tone follows sign (zero is neutral).
// ---------------------------------------------------------------------------

function DeltaChip({
  value,
  size = 'sm',
  invert = false,
}: {
  value: number;
  size?: 'xs' | 'sm' | 'md';
  invert?: boolean;
}): JSX.Element {
  // For metrics where "lower is better" (spam, bounce), pass invert=true so
  // negative deltas paint emerald.
  const positive = invert ? value < 0 : value > 0;
  const negative = invert ? value > 0 : value < 0;
  const neutral = value === 0;
  const tone = neutral
    ? 'bg-surface-2 border-border-muted text-text-dim'
    : positive
      ? 'bg-accent/15 border-accent/30 text-accent'
      : 'bg-accent3/15 border-accent3/30 text-accent3';
  const sizeCls =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
      : size === 'md'
        ? 'text-sm px-2.5 py-1 gap-1'
        : 'text-xs px-2 py-0.5 gap-1';
  const Icon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  // We deliberately reference `negative` so it isn't pruned by minifiers
  // and so the eslint no-unused-vars rule stays satisfied without a hack.
  void negative;
  return (
    <span
      className={[
        'inline-flex items-center font-mono font-semibold rounded-md border tabular-nums',
        sizeCls,
        tone,
      ].join(' ')}
    >
      <Icon className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {formatDeltaPct(value)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ScoreboardHeader — agency name in HUGE display, region pill, period
// selector, MoM growth chip. Sticky at the top of the canvas.
// ---------------------------------------------------------------------------

function ScoreboardHeader({
  data,
  period,
  onPeriodChange,
}: {
  data: AgencyAnalyticsData;
  period: AnalyticsPeriod;
  onPeriodChange: (p: AnalyticsPeriod) => void;
}): JSX.Element {
  const periods: AnalyticsPeriod[] = ['last_7d', 'last_30d', 'last_90d', 'last_year'];
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur-md p-5 md:p-7"
    >
      {/* Stadium-light bloom across the top edge */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-1/4 -top-12 h-24 rounded-full bg-accent/20 blur-3xl opacity-60"
      />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-text-faint">
            <Radio className="h-3.5 w-3.5 text-accent" />
            <span>LIVE · AGENCY SCOREBOARD</span>
          </div>
          <h1
            className="font-mono font-black tracking-tight text-text leading-[0.95] truncate"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 4.25rem)' }}
          >
            {data.workspace.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 font-mono">
              <Globe2 className="h-3.5 w-3.5 text-accent2" />
              Global · Multi-region
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 font-mono">
              <Building2 className="h-3.5 w-3.5 text-accent" />
              {data.workspace.subClientCount} sub-clients
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 font-mono">
              <Mail className="h-3.5 w-3.5 text-accent4" />
              {data.workspace.mailboxCount} mailboxes
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-accent">
              <TrendingUp className="h-3.5 w-3.5" />
              MoM {formatDeltaPct(data.kpis.momGrowthPct)}
            </span>
          </div>
        </div>

        {/* Period selector — segmented control */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface-2 p-1">
            {periods.map((p) => {
              const active = p === period;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPeriodChange(p)}
                  className={[
                    'relative rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-colors',
                    active ? 'text-bg' : 'text-text-dim hover:text-text',
                  ].join(' ')}
                >
                  {active ? (
                    <motion.span
                      layoutId="period-pill"
                      className="absolute inset-0 rounded-lg bg-accent"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                  <span className="relative">{PERIOD_SHORT[p]}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-muted bg-surface-2 px-3 py-2 text-xs font-mono text-text-dim hover:text-text hover:border-accent/40 transition-colors"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            {PERIOD_LABEL[period]}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}

// ---------------------------------------------------------------------------
// HeroScoreboard — the four giant LED panels. Each animates from 0 → value
// with a stagger and shows a tiny delta chip + label below.
// ---------------------------------------------------------------------------

interface HeroPanelProps {
  label: string;
  Icon: typeof Mail;
  value: number;
  delta: number;
  tone: LedTone;
  fractionDigits?: number;
  suffix?: string;
  delayMs: number;
  invertDelta?: boolean;
}

function HeroPanel({
  label,
  Icon,
  value,
  delta,
  tone,
  fractionDigits = 0,
  suffix,
  delayMs,
  invertDelta,
}: HeroPanelProps): JSX.Element {
  const animated = useCountUp(value, 1600, delayMs);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delayMs / 1000, ease: 'easeOut' }}
      className="relative flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface/70 p-4 md:p-5 overflow-hidden"
    >
      {/* Status-tinted glow behind the panel */}
      <div
        aria-hidden
        className={[
          'pointer-events-none absolute -inset-1 rounded-3xl blur-2xl opacity-30',
          tone === 'accent'
            ? 'bg-accent/30'
            : tone === 'accent2'
              ? 'bg-accent2/30'
              : tone === 'accent3'
                ? 'bg-accent3/30'
                : tone === 'accent4'
                  ? 'bg-accent4/30'
                  : 'bg-accent/30',
        ].join(' ')}
      />

      <div className="relative flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-faint">
          <Icon className={['h-3.5 w-3.5', TONE_GLOW[tone].text].join(' ')} />
          <span>{label}</span>
        </div>
        <DeltaChip value={delta} size="xs" invert={invertDelta} />
      </div>

      <div className="relative">
        <LedDigits
          value={animated}
          fractionDigits={fractionDigits}
          suffix={suffix}
          size="xl"
          tone={tone}
        />
      </div>
    </motion.div>
  );
}

function HeroScoreboard({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  const k = data.kpis;
  // Synthetic per-metric deltas (the spec only gives MoM growth on volume,
  // so we derive opens/replies deltas from days30 first vs last half).
  const half = Math.floor(data.days30.length / 2);
  const firstHalf = data.days30.slice(0, half);
  const secondHalf = data.days30.slice(half);
  const sum = (rows: DayPoint[], key: keyof DayPoint): number =>
    rows.reduce((acc, r) => acc + (r[key] as number), 0);
  const safeDelta = (a: number, b: number): number =>
    a === 0 ? 0 : Math.round(((b - a) / a) * 1000) / 10;
  const sendsDelta = data.days30.length ? safeDelta(sum(firstHalf, 'sends'), sum(secondHalf, 'sends')) : 0;
  const opensDelta = data.days30.length ? safeDelta(sum(firstHalf, 'opens'), sum(secondHalf, 'opens')) : 0;
  const repliesDelta = data.days30.length
    ? safeDelta(sum(firstHalf, 'replies'), sum(secondHalf, 'replies'))
    : 0;
  const inboxDelta = data.days30.length
    ? Math.round(
        (secondHalf.reduce((a, r) => a + r.inboxPct, 0) / Math.max(secondHalf.length, 1) -
          firstHalf.reduce((a, r) => a + r.inboxPct, 0) / Math.max(firstHalf.length, 1)) *
          10,
      ) / 10
    : 0;

  return (
    <section className="relative">
      <SectionHeader title="Hero Scoreboard" subtitle="The big four — agency totals, last period" Icon={Trophy} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <HeroPanel
          label="Sends"
          Icon={Mail}
          value={k.totalSends30d}
          delta={sendsDelta}
          tone="accent"
          delayMs={80}
        />
        <HeroPanel
          label="Opens"
          Icon={MailOpen}
          value={k.totalOpens30d}
          delta={opensDelta}
          tone="accent2"
          delayMs={220}
        />
        <HeroPanel
          label="Replies"
          Icon={Reply}
          value={k.totalReplies30d}
          delta={repliesDelta}
          tone="accent4"
          delayMs={360}
        />
        <HeroPanel
          label="Inbox %"
          Icon={Inbox}
          value={k.inboxRatePct}
          delta={inboxDelta}
          tone="emerald"
          fractionDigits={0}
          suffix="%"
          delayMs={500}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader — small "STAT" / "TEAM STANDINGS" / etc. eyebrows.
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  subtitle,
  Icon,
  trailing,
}: {
  title: string;
  subtitle?: string;
  Icon: typeof Mail;
  trailing?: JSX.Element;
}): JSX.Element {
  return (
    <div className="mb-3 md:mb-4 flex items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-text-faint">
          <Icon className="h-3.5 w-3.5 text-accent" />
          <span>{title}</span>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-text-dim">{subtitle}</p> : null}
      </div>
      {trailing}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BleachersChart — the 30-day multi-line area chart. 4 series:
// sends / opens / replies / inboxPct. Inbox % rides its own scale (right
// axis-ish), the volume metrics share a left scale.
// Cursor tracking: a vertical dashed guide follows the pointer, with dots
// on each line at the hovered x and a floating tooltip showing all values.
// Lines draw in via pathLength 0 → 1 with a small stagger.
// ---------------------------------------------------------------------------

const CHART_W = 800;
const CHART_H = 280;
const CHART_PAD_L = 48;
const CHART_PAD_R = 48;
const CHART_PAD_T = 24;
const CHART_PAD_B = 36;

type SeriesKey = 'sends' | 'opens' | 'replies' | 'inboxPct';

const SERIES_META: Record<
  SeriesKey,
  { label: string; tone: LedTone; stroke: string; fill: string; axis: 'left' | 'right' }
> = {
  sends: {
    label: 'Sends',
    tone: 'accent',
    stroke: '#F26522',
    fill: 'rgba(242, 101, 34,0.15)',
    axis: 'left',
  },
  opens: {
    label: 'Opens',
    tone: 'accent2',
    stroke: '#FF8A4B',
    fill: 'rgba(255, 138, 75,0.12)',
    axis: 'left',
  },
  replies: {
    label: 'Replies',
    tone: 'accent4',
    stroke: '#ffd54f',
    fill: 'rgba(255,213,79,0.10)',
    axis: 'left',
  },
  inboxPct: {
    label: 'Inbox %',
    tone: 'emerald',
    stroke: '#34d399',
    fill: 'rgba(52,211,153,0.10)',
    axis: 'right',
  },
};

function BleachersChart({ days }: { days: DayPoint[] }): JSX.Element {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    sends: true,
    opens: true,
    replies: true,
    inboxPct: true,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { yLeft, yRight, points } = useMemo(() => {
    if (days.length === 0) {
      return {
        xScale: (_i: number) => CHART_PAD_L,
        yLeft: (_v: number) => CHART_H - CHART_PAD_B,
        yRight: (_v: number) => CHART_H - CHART_PAD_B,
        points: [],
      };
    }
    const innerW = CHART_W - CHART_PAD_L - CHART_PAD_R;
    const innerH = CHART_H - CHART_PAD_T - CHART_PAD_B;
    const maxLeft = Math.max(...days.map((d) => Math.max(d.sends, d.opens, d.replies)));
    const minRight = Math.max(
      60,
      Math.floor(Math.min(...days.map((d) => d.inboxPct)) / 5) * 5 - 2,
    );
    const maxRight = Math.min(100, Math.ceil(Math.max(...days.map((d) => d.inboxPct)) / 5) * 5 + 2);
    const x = (i: number): number => CHART_PAD_L + (i / Math.max(days.length - 1, 1)) * innerW;
    const yL = (v: number): number =>
      CHART_PAD_T + innerH - (v / Math.max(maxLeft, 1)) * innerH;
    const yR = (v: number): number => {
      const t = (v - minRight) / Math.max(maxRight - minRight, 1);
      return CHART_PAD_T + innerH - clamp(t, 0, 1) * innerH;
    };
    return {
      xScale: x,
      yLeft: yL,
      yRight: yR,
      points: days.map((d, i) => ({
        i,
        x: x(i),
        ySends: yL(d.sends),
        yOpens: yL(d.opens),
        yReplies: yL(d.replies),
        yInbox: yR(d.inboxPct),
        d,
      })),
    };
  }, [days]);

  const buildPath = (key: SeriesKey): string => {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => {
        const y =
          key === 'sends'
            ? p.ySends
            : key === 'opens'
              ? p.yOpens
              : key === 'replies'
                ? p.yReplies
                : p.yInbox;
        return `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  };

  const buildArea = (key: SeriesKey): string => {
    if (points.length === 0) return '';
    const baseY = CHART_H - CHART_PAD_B;
    const top = points
      .map((p, idx) => {
        const y =
          key === 'sends'
            ? p.ySends
            : key === 'opens'
              ? p.yOpens
              : key === 'replies'
                ? p.yReplies
                : p.yInbox;
        return `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
    const last = points[points.length - 1]!;
    const first = points[0]!;
    return `${top} L${last.x.toFixed(2)},${baseY} L${first.x.toFixed(2)},${baseY} Z`;
  };

  const handleMove = (evt: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xLocal = ((evt.clientX - rect.left) / rect.width) * CHART_W;
    let nearest = 0;
    let best = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - xLocal);
      if (d < best) {
        best = d;
        nearest = p.i;
      }
    }
    setHoverIdx(nearest);
  };

  const seriesKeys: SeriesKey[] = ['sends', 'opens', 'replies', 'inboxPct'];
  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null;

  // Y-axis tick values (left axis, 4 ticks)
  const maxLeft = days.length === 0 ? 0 : Math.max(...days.map((d) => Math.max(d.sends, d.opens, d.replies)));
  const leftTicks = useMemo(() => {
    if (maxLeft === 0) return [0];
    const step = Math.ceil(maxLeft / 4 / 50) * 50;
    return [0, step, step * 2, step * 3, step * 4];
  }, [maxLeft]);

  return (
    <section className="relative">
      <SectionHeader
        title="Time-Series Bleachers"
        subtitle="30-day trace · cursor for daily values"
        Icon={BarChart3}
        trailing={
          <div className="flex flex-wrap items-center gap-1.5">
            {seriesKeys.map((key) => {
              const meta = SERIES_META[key];
              const on = enabled[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  className={[
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-mono transition-colors',
                    on
                      ? 'border-border-muted bg-surface-2 text-text'
                      : 'border-border-muted bg-surface text-text-faint line-through',
                  ].join(' ')}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: meta.stroke, opacity: on ? 1 : 0.3 }}
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>
        }
      />

      <div className="relative rounded-2xl border border-border-muted bg-surface/60 p-3 md:p-4 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full h-[240px] md:h-[280px]"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label="30-day multi-metric trend chart"
        >
          {/* Gridlines + left ticks */}
          {leftTicks.map((t) => {
            const y = yLeft(t);
            return (
              <g key={`gl-${t}`}>
                <line
                  x1={CHART_PAD_L}
                  x2={CHART_W - CHART_PAD_R}
                  y1={y}
                  y2={y}
                  stroke="#2a2a3a"
                  strokeDasharray="2 4"
                  opacity={0.5}
                />
                <text
                  x={CHART_PAD_L - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-text-faint"
                  style={{ font: '10px JetBrains Mono, monospace' }}
                >
                  {formatCompact(t)}
                </text>
              </g>
            );
          })}

          {/* Right axis ticks (inbox %) */}
          {[70, 80, 90, 100].map((t) => {
            const y = yRight(t);
            return (
              <text
                key={`rt-${t}`}
                x={CHART_W - CHART_PAD_R + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-accent/70"
                style={{ font: '10px JetBrains Mono, monospace' }}
              >
                {t}%
              </text>
            );
          })}

          {/* X-axis (date) ticks every 5 days */}
          {points.map((p) => {
            if (p.i % 5 !== 0 && p.i !== points.length - 1) return null;
            return (
              <text
                key={`xt-${p.i}`}
                x={p.x}
                y={CHART_H - 14}
                textAnchor="middle"
                className="fill-text-faint"
                style={{ font: '10px JetBrains Mono, monospace' }}
              >
                {formatShortDate(p.d.date)}
              </text>
            );
          })}

          {/* Area fills + line paths per series */}
          {seriesKeys.map((key, sidx) => {
            if (!enabled[key]) return null;
            const meta = SERIES_META[key];
            return (
              <g key={`series-${key}`}>
                <motion.path
                  d={buildArea(key)}
                  fill={meta.fill}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  transition={{ delay: 0.4 + sidx * 0.15, duration: 0.5 }}
                />
                <motion.path
                  d={buildPath(key)}
                  fill="none"
                  stroke={meta.stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: 0.2 + sidx * 0.15, duration: 1.2, ease: 'easeOut' }}
                  style={{ filter: `drop-shadow(0 0 6px ${meta.stroke}aa)` }}
                />
              </g>
            );
          })}

          {/* Cursor guide */}
          {hoveredPoint ? (
            <g>
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={CHART_PAD_T}
                y2={CHART_H - CHART_PAD_B}
                stroke="#e8e8f0"
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
              {seriesKeys.map((key) => {
                if (!enabled[key]) return null;
                const y =
                  key === 'sends'
                    ? hoveredPoint.ySends
                    : key === 'opens'
                      ? hoveredPoint.yOpens
                      : key === 'replies'
                        ? hoveredPoint.yReplies
                        : hoveredPoint.yInbox;
                return (
                  <circle
                    key={`dot-${key}`}
                    cx={hoveredPoint.x}
                    cy={y}
                    r={4}
                    fill={SERIES_META[key].stroke}
                    stroke="#0a0a0f"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {/* Floating tooltip */}
        <AnimatePresence>
          {hoveredPoint ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute top-3 right-3 min-w-[180px] rounded-lg border border-border-muted bg-bg/90 backdrop-blur-sm p-3 shadow-xl"
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint mb-1.5">
                {formatShortDate(hoveredPoint.d.date)}
              </div>
              <div className="space-y-1">
                {seriesKeys.map((key) => {
                  if (!enabled[key]) return null;
                  const meta = SERIES_META[key];
                  const v =
                    key === 'inboxPct'
                      ? `${hoveredPoint.d.inboxPct.toFixed(1)}%`
                      : formatNum(hoveredPoint.d[key]);
                  return (
                    <div
                      key={`tip-${key}`}
                      className="flex items-center justify-between gap-3 text-xs font-mono"
                    >
                      <span className="inline-flex items-center gap-1.5 text-text-dim">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: meta.stroke }}
                        />
                        {meta.label}
                      </span>
                      <span className="text-text font-semibold tabular-nums">{v}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TeamStandings — league-table leaderboard. Rank gold/silver/bronze for
// top 3. Top row gets a trophy badge with a subtle pulse animation.
// Rows stagger fade-up on mount.
// ---------------------------------------------------------------------------

function TeamStandings({ rows }: { rows: LeaderRow[] }): JSX.Element {
  const [sortKey, setSortKey] = useState<'sends' | 'inbox' | 'warmth' | 'delta'>('sends');

  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'inbox':
          return b.inboxPct - a.inboxPct;
        case 'warmth':
          return b.warmthScore - a.warmthScore;
        case 'delta':
          return b.delta30dPct - a.delta30dPct;
        default:
          return b.sends30d - a.sends30d;
      }
    });
    return copy;
  }, [rows, sortKey]);

  const sortBtn = (key: typeof sortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={[
        'rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
        sortKey === key
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border-muted bg-surface-2 text-text-faint hover:text-text',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <section className="relative">
      <SectionHeader
        title="Team Standings"
        subtitle="Sub-client leaderboard · top performer takes the crown"
        Icon={Crown}
        trailing={
          <div className="flex items-center gap-1.5">
            {sortBtn('sends', 'Sends')}
            {sortBtn('inbox', 'Inbox')}
            {sortBtn('warmth', 'Warmth')}
            {sortBtn('delta', '+/−')}
          </div>
        }
      />

      <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60">
        {/* Header row */}
        <div className="grid grid-cols-[44px_1fr_88px_88px_88px_92px] md:grid-cols-[56px_1fr_120px_104px_104px_104px] gap-2 border-b border-border-muted bg-surface-2/60 px-3 md:px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-text-faint font-mono">
          <span>Rank</span>
          <span>Sub-client</span>
          <span className="text-right">Sends</span>
          <span className="text-right">Inbox</span>
          <span className="text-right">Warmth</span>
          <span className="text-right">+/−</span>
        </div>

        <ul className="divide-y divide-border-muted/70">
          {sorted.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-text-faint font-mono">
              No standings yet — sub-clients will appear here once they start sending.
            </li>
          ) : null}

          {sorted.map((row, idx) => {
            const isTop = idx === 0;
            const medal = idx === 0 ? Trophy : idx === 1 ? Medal : idx === 2 ? Award : null;
            const medalTone =
              idx === 0
                ? 'text-accent4'
                : idx === 1
                  ? 'text-text-dim'
                  : idx === 2
                    ? 'text-accent3'
                    : 'text-text-faint';
            const status = STATUS_TINT[row.status];
            return (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.05 * idx, ease: 'easeOut' }}
                className={[
                  'grid grid-cols-[44px_1fr_88px_88px_88px_92px] md:grid-cols-[56px_1fr_120px_104px_104px_104px] gap-2 items-center px-3 md:px-4 py-3 text-sm',
                  isTop ? 'bg-gradient-to-r from-accent4/[0.08] via-transparent to-transparent' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-xs font-bold tabular-nums',
                      isTop
                        ? 'bg-accent4/20 text-accent4 ring-1 ring-accent4/40'
                        : 'bg-surface-2 text-text-dim',
                    ].join(' ')}
                  >
                    {idx + 1}
                  </span>
                  {medal ? (
                    <motion.span
                      animate={isTop ? { scale: [1, 1.18, 1], opacity: [0.85, 1, 0.85] } : {}}
                      transition={
                        isTop
                          ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
                          : undefined
                      }
                      className={[medalTone, 'inline-flex items-center'].join(' ')}
                    >
                      {(() => {
                        const Medal = medal;
                        return <Medal className="h-3.5 w-3.5" />;
                      })()}
                    </motion.span>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={[
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono font-bold text-base text-text',
                      'bg-gradient-to-br from-surface-2 to-surface',
                      isTop
                        ? 'border-accent4/40 ring-1 ring-accent4/30'
                        : `border-border-muted ring-1 ${status.ring}`,
                    ].join(' ')}
                  >
                    {row.logoChar}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-text">{row.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider',
                          status.chip,
                        ].join(' ')}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono tabular-nums text-text">
                  {formatNum(row.sends30d)}
                </div>
                <div
                  className={[
                    'text-right font-mono tabular-nums font-semibold',
                    row.inboxPct >= 85
                      ? 'text-accent'
                      : row.inboxPct >= 75
                        ? 'text-accent4'
                        : 'text-accent3',
                  ].join(' ')}
                >
                  {row.inboxPct}%
                </div>
                <div className="text-right font-mono tabular-nums text-text-dim">
                  {row.warmthScore}
                </div>
                <div className="flex justify-end">
                  <DeltaChip value={row.delta30dPct} size="xs" />
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProviderStrip — 4 mini scoreboards horizontal. Each counts up sequentially
// (staggered delay). Shows inbox % big, sends below + spam/blocked chips.
// ---------------------------------------------------------------------------

const PROVIDER_ICON: Record<Provider, typeof Mail> = {
  gmail: Mail,
  outlook: MailCheck,
  yahoo: MailWarning,
  smtp: Server,
};

function ProviderScoreboard({
  provider,
  delayMs,
}: {
  provider: ProviderPoint;
  delayMs: number;
}): JSX.Element {
  const inboxAnim = useCountUp(provider.inboxPct, 1400, delayMs);
  const sendsAnim = useCountUp(provider.sends, 1400, delayMs + 100);
  const tone: LedTone =
    provider.inboxPct >= 85
      ? 'emerald'
      : provider.inboxPct >= 80
        ? 'accent2'
        : provider.inboxPct >= 75
          ? 'accent4'
          : 'accent3';
  const Icon = PROVIDER_ICON[provider.provider];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: delayMs / 1000, ease: 'easeOut' }}
      className="relative rounded-2xl border border-border-muted bg-surface/60 p-4 overflow-hidden"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <Icon className={['h-4 w-4', PROVIDER_TONE[provider.provider]].join(' ')} />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-text">
            {PROVIDER_LABEL[provider.provider]}
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-faint">
          Provider
        </span>
      </div>

      <LedDigits value={inboxAnim} fractionDigits={0} suffix="%" size="md" tone={tone} />

      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-text-faint font-mono">
            Sends
          </span>
          <span className="font-mono tabular-nums text-text">{formatNum(Math.round(sendsAnim))}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-accent3/30 bg-accent3/10 px-1.5 py-0.5 text-[10px] font-mono text-accent3">
            <ShieldAlert className="h-3 w-3" />
            {provider.spamPct.toFixed(1)}%
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-text-dim">
            <Shield className="h-3 w-3" />
            {provider.blockedPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ProviderStrip({ providers }: { providers: ProviderPoint[] }): JSX.Element {
  return (
    <section className="relative">
      <SectionHeader
        title="Provider Mix"
        subtitle="Deliverability split by inbox provider"
        Icon={Globe2}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {providers.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-border-muted bg-surface/60 px-4 py-8 text-center text-sm text-text-faint font-mono">
            No provider mix data yet.
          </div>
        ) : null}
        {providers.map((p, i) => (
          <ProviderScoreboard key={p.provider} provider={p} delayMs={150 * i + 80} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FunnelStrip — Sends → Delivered → Inboxed → Opened → Replied. Small,
// rendered above the standings as a secondary visual. Stadium-shaped bars
// that taper.
// ---------------------------------------------------------------------------

function FunnelStrip({ funnel }: { funnel: AgencyAnalyticsData['funnel'] }): JSX.Element {
  const stages: Array<{
    key: keyof AgencyAnalyticsData['funnel'];
    label: string;
    Icon: typeof Mail;
    tone: LedTone;
  }> = [
    { key: 'sends', label: 'Sent', Icon: Mail, tone: 'accent' },
    { key: 'delivered', label: 'Delivered', Icon: MailCheck, tone: 'accent2' },
    { key: 'inboxed', label: 'Inboxed', Icon: Inbox, tone: 'emerald' },
    { key: 'opened', label: 'Opened', Icon: MailOpen, tone: 'accent4' },
    { key: 'replied', label: 'Replied', Icon: Reply, tone: 'accent3' },
  ];
  const max = Math.max(...stages.map((s) => funnel[s.key]));
  const safeMax = max === 0 ? 1 : max;
  return (
    <section className="relative">
      <SectionHeader
        title="Engagement Funnel"
        subtitle="From outbound send to inbound reply"
        Icon={Target}
      />
      <div className="rounded-2xl border border-border-muted bg-surface/60 p-3 md:p-4">
        <div className="grid grid-cols-5 gap-2 md:gap-3">
          {stages.map((s, i) => {
            const val = funnel[s.key];
            const ratio = val / safeMax;
            const prev = i === 0 ? null : funnel[stages[i - 1]!.key];
            const dropPct = prev && prev > 0 ? Math.round((1 - val / prev) * 1000) / 10 : 0;
            const palette = TONE_GLOW[s.tone];
            return (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * i }}
                className="relative flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-mono text-text-faint">
                  <span className="inline-flex items-center gap-1">
                    <s.Icon className={['h-3 w-3', palette.text].join(' ')} />
                    {s.label}
                  </span>
                  {i > 0 && prev && prev > 0 ? (
                    <span className="text-accent3/80">−{dropPct.toFixed(1)}%</span>
                  ) : null}
                </div>
                <div className={['relative h-10 rounded-md border overflow-hidden', palette.border, palette.bg].join(' ')}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${ratio * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.1 * i + 0.2, ease: 'easeOut' }}
                    className={[
                      'absolute inset-y-0 left-0 rounded-md',
                      s.tone === 'accent'
                        ? 'bg-accent/30'
                        : s.tone === 'accent2'
                          ? 'bg-accent2/30'
                          : s.tone === 'accent3'
                            ? 'bg-accent3/30'
                            : s.tone === 'accent4'
                              ? 'bg-accent4/30'
                              : 'bg-accent/30',
                    ].join(' ')}
                  />
                  <div className="relative z-10 flex items-center justify-center h-full">
                    <span className={['font-mono font-bold tabular-nums text-lg', palette.text].join(' ')}>
                      {formatCompact(val)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SecondaryKPIs — Spam, Bounce, Warmth, MoM all as smaller LED panels.
// ---------------------------------------------------------------------------

function SecondaryKPIs({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  const k = data.kpis;
  return (
    <section className="relative">
      <SectionHeader title="Secondary Stats" subtitle="Health & momentum" Icon={Gauge} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SecondaryPanel
          label="Spam Rate"
          value={k.spamRatePct}
          fractionDigits={1}
          suffix="%"
          tone="accent3"
          Icon={ShieldAlert}
          delayMs={80}
        />
        <SecondaryPanel
          label="Bounce Rate"
          value={k.bounceRatePct}
          fractionDigits={1}
          suffix="%"
          tone="accent4"
          Icon={Siren}
          delayMs={200}
        />
        <SecondaryPanel
          label="Avg Warmth"
          value={k.avgWarmth}
          fractionDigits={0}
          tone="accent2"
          Icon={Flame}
          delayMs={320}
        />
        <SecondaryPanel
          label="MoM Growth"
          value={k.momGrowthPct}
          fractionDigits={1}
          suffix="%"
          tone="emerald"
          Icon={TrendingUp}
          delayMs={440}
          showPlus
        />
      </div>
    </section>
  );
}

function SecondaryPanel({
  label,
  value,
  fractionDigits,
  suffix,
  tone,
  Icon,
  delayMs,
  showPlus,
}: {
  label: string;
  value: number;
  fractionDigits: number;
  suffix?: string;
  tone: LedTone;
  Icon: typeof Mail;
  delayMs: number;
  showPlus?: boolean;
}): JSX.Element {
  const animated = useCountUp(value, 1400, delayMs);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delayMs / 1000 }}
      className="relative rounded-2xl border border-border-muted bg-surface/60 p-3 md:p-4"
    >
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider font-mono text-text-faint">
        <span className="inline-flex items-center gap-1.5">
          <Icon className={['h-3.5 w-3.5', TONE_GLOW[tone].text].join(' ')} />
          {label}
        </span>
      </div>
      <LedDigits
        value={animated}
        fractionDigits={fractionDigits}
        suffix={suffix}
        prefix={showPlus && animated >= 0 ? '+' : undefined}
        size="md"
        tone={tone}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GameRecap — the right inspector. "Trading card"-styled insights, alerts,
// top mover.
// ---------------------------------------------------------------------------

function GameRecap({ data }: { data: AgencyAnalyticsData }): JSX.Element {
  const topMover = useMemo(() => {
    if (data.subClientLeaderboard.length === 0) return null;
    return data.subClientLeaderboard.reduce((best, row) =>
      row.delta30dPct > best.delta30dPct ? row : best,
    );
  }, [data.subClientLeaderboard]);

  const worstMover = useMemo(() => {
    if (data.subClientLeaderboard.length === 0) return null;
    return data.subClientLeaderboard.reduce((worst, row) =>
      row.delta30dPct < worst.delta30dPct ? row : worst,
    );
  }, [data.subClientLeaderboard]);

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <SectionHeader
        title="Game Recap"
        subtitle="Period headlines & alerts"
        Icon={Sparkles}
      />

      {/* Top mover trading card */}
      {topMover ? (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border-2 border-accent4/40 bg-gradient-to-br from-accent4/[0.08] via-surface to-surface p-4"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-accent4/20 blur-3xl"
          />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-accent4 font-mono">
                <Trophy className="h-3.5 w-3.5" />
                Top Mover
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-text">{topMover.name}</div>
              <div className="mt-1 text-xs text-text-dim font-mono">
                {formatNum(topMover.sends30d)} sends · {topMover.inboxPct}% inbox
              </div>
            </div>
            <div className="text-right">
              <DeltaChip value={topMover.delta30dPct} size="md" />
              <div className="mt-2 text-[10px] uppercase tracking-wider font-mono text-text-faint">
                30d
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-accent4" />
            <span className="text-xs font-mono text-text-dim">
              Warmth score · <span className="text-accent4 font-bold">{topMover.warmthScore}</span>
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Worst mover (alert card) */}
      {worstMover && worstMover.delta30dPct < 0 ? (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="relative overflow-hidden rounded-2xl border-2 border-accent3/40 bg-gradient-to-br from-accent3/[0.08] via-surface to-surface p-4"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-accent3/15 blur-3xl"
          />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-accent3 font-mono">
                <AlertTriangle className="h-3.5 w-3.5" />
                Needs Attention
              </div>
              <div className="mt-2 font-mono text-xl font-black text-text">{worstMover.name}</div>
              <div className="mt-1 text-xs text-text-dim font-mono">
                {formatNum(worstMover.sends30d)} sends · {worstMover.inboxPct}% inbox
              </div>
            </div>
            <div className="text-right">
              <DeltaChip value={worstMover.delta30dPct} size="md" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-accent3" />
            <span className="text-xs font-mono text-text-dim">
              Recommend pausing aggressive ramp
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Headlines (weekly insights) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-text-faint font-mono">
          <Activity className="h-3.5 w-3.5 text-accent" />
          Headlines
        </div>
        {data.weeklyInsights.length === 0 ? (
          <div className="rounded-xl border border-border-muted bg-surface-2/40 px-3 py-4 text-center text-xs text-text-faint font-mono">
            No insights for this period yet.
          </div>
        ) : null}
        {data.weeklyInsights.map((ins, idx) => (
          <InsightCard insight={ins} key={ins.id} delayMs={120 * idx + 100} />
        ))}
      </div>

      {/* Health summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="rounded-2xl border border-border-muted bg-surface/60 p-4"
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-text-faint font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Health Roster
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['healthy', 'warming', 'at_risk'] as SubClientStatus[]).map((s) => {
            const count = data.subClientLeaderboard.filter((r) => r.status === s).length;
            const tint = STATUS_TINT[s];
            return (
              <div
                key={s}
                className={[
                  'rounded-lg border px-2 py-2 text-center',
                  s === 'healthy'
                    ? 'border-accent/30 bg-accent/[0.06]'
                    : s === 'warming'
                      ? 'border-accent4/30 bg-accent4/[0.06]'
                      : 'border-accent3/30 bg-accent3/[0.06]',
                ].join(' ')}
              >
                <div className="text-2xl font-mono font-bold tabular-nums text-text">{count}</div>
                <div className={['mt-0.5 text-[10px] font-mono uppercase tracking-wider', tint.chip.split(' ')[1] ?? ''].join(' ')}>
                  {tint.label}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </aside>
  );
}

function InsightCard({ insight, delayMs }: { insight: Insight; delayMs: number }): JSX.Element {
  const palette = SEVERITY_PALETTE[insight.severity];
  const Icon =
    insight.severity === 'success'
      ? Sparkles
      : insight.severity === 'critical'
        ? Siren
        : insight.severity === 'warn'
          ? AlertTriangle
          : MessageSquare;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delayMs / 1000 }}
      className={[
        'relative rounded-xl border bg-surface/70 p-3',
        palette.border,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            palette.iconBg,
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={['text-[10px] font-mono uppercase tracking-wider', palette.tone].join(' ')}>
              Week of {formatShortDate(insight.weekOf)}
            </span>
            <span className={['inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider', palette.chip].join(' ')}>
              {insight.severity}
            </span>
          </div>
          <h4 className="mt-1 text-sm font-semibold text-text leading-snug">{insight.headline}</h4>
          <p className="mt-1.5 text-xs text-text-dim leading-relaxed">{insight.body}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ComparisonTable — collapsible secondary table that shows the full
// per-sub-client comparison grid. Toggled from a button below standings.
// ---------------------------------------------------------------------------

function ComparisonTable({ rows }: { rows: Comparison[] }): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex w-full items-center justify-between rounded-2xl border border-border-muted bg-surface/60 px-4 py-3 text-sm font-mono text-text hover:border-accent/40 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          Full Comparison Grid
          <span className="text-text-faint text-xs">({rows.length} sub-clients · 7 metrics)</span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-dim"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border-muted bg-surface/60">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="bg-surface-2/60 text-[10px] uppercase tracking-[0.2em] text-text-faint">
                    <th className="px-3 py-2 text-left font-medium">Sub-client</th>
                    <th className="px-3 py-2 text-right font-medium">Sends</th>
                    <th className="px-3 py-2 text-right font-medium">Opens</th>
                    <th className="px-3 py-2 text-right font-medium">Replies</th>
                    <th className="px-3 py-2 text-right font-medium">Inbox</th>
                    <th className="px-3 py-2 text-right font-medium">Spam</th>
                    <th className="px-3 py-2 text-right font-medium">Bounce</th>
                    <th className="px-3 py-2 text-right font-medium">Warmth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted/70">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-text-faint">
                        No comparison data yet.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <tr key={r.subClientId} className="hover:bg-surface-2/40">
                      <td className="px-3 py-2 text-text">{r.subClientName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.sends)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.opens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.replies)}</td>
                      <td
                        className={[
                          'px-3 py-2 text-right tabular-nums font-semibold',
                          r.inboxRate >= 85
                            ? 'text-accent'
                            : r.inboxRate >= 75
                              ? 'text-accent4'
                              : 'text-accent3',
                        ].join(' ')}
                      >
                        {r.inboxRate}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent3/90">
                        {r.spamRate.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent4/90">
                        {r.bounceRate.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent2">
                        {r.warmth}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CRT scanline overlay — applied to the whole canvas at ~3% opacity for
// that arena big-board feel. Sits in a pointer-events-none, full-bleed
// fixed positioned element.
// ---------------------------------------------------------------------------

function ScanlineOverlay(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] mix-blend-screen"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px)',
        opacity: 0.6,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// AgAnaR1Scoreboard — the page export. Composes header → hero → bleachers
// → funnel → secondary → standings → comparison → providers + recap aside.
// ---------------------------------------------------------------------------

interface AgAnaR1ScoreboardProps {
  data?: AgencyAnalyticsData;
}

export function AgAnaR1Scoreboard({ data }: AgAnaR1ScoreboardProps = {}): JSX.Element {
  const d = data ?? MOCK;
  const [period, setPeriod] = useState<AnalyticsPeriod>(d.period);

  return (
    <div className="relative min-h-screen bg-bg text-text">
      {/* Page background bloom — top-left violet, bottom-right cyan */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-accent/[0.08] blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent2/[0.07] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8 space-y-5 md:space-y-6">
        <ScanlineOverlay />

        <ScoreboardHeader data={d} period={period} onPeriodChange={setPeriod} />

        <HeroScoreboard data={d} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
          {/* Main canvas */}
          <div className="lg:col-span-8 space-y-5 md:space-y-6">
            <BleachersChart days={d.days30} />
            <FunnelStrip funnel={d.funnel} />
            <SecondaryKPIs data={d} />
            <TeamStandings rows={d.subClientLeaderboard} />
            <ComparisonTable rows={d.comparisons} />
            <ProviderStrip providers={d.providerMix} />
          </div>

          {/* Right inspector */}
          <div className="lg:col-span-4">
            <GameRecap data={d} />
          </div>
        </div>

        {/* Footer note */}
        <footer className="pt-2 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em] text-text-faint font-mono">
            <div className="inline-flex items-center gap-2">
              <Zap className="h-3 w-3 text-accent" />
              Powered by WarmPulse Peer-Inbox Network
            </div>
            <div className="inline-flex items-center gap-3">
              <span>Aggregate across {d.workspace.subClientCount} sub-clients</span>
              <span>·</span>
              <span>{d.workspace.mailboxCount} mailboxes</span>
              <span>·</span>
              <span>{PERIOD_LABEL[period]}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default AgAnaR1Scoreboard;

// ---------------------------------------------------------------------------
// Re-export the metric/period union types so future adapter files can
// import the same string literals used by routes/admin / analytics
// endpoints without having to redeclare them.
// ---------------------------------------------------------------------------

export type {
  AnalyticsMetric,
  AnalyticsPeriod,
  SubClientStatus,
  Provider,
  InsightSeverity,
};
