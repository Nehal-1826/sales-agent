/**
 * Admin Dashboard — E2 Executive Briefing
 *
 * Direction: "Executive Briefing" — spacious, premium, board-room polish.
 * Stripe/Linear-grade restraint: generous whitespace, refined type, no clutter.
 *
 * Self-contained content component: no sidebar/shell (preview supplies the dark
 * canvas), no API, no react-query, no @/features, no @/lib/api. All mock data
 * is hardcoded inline.
 *
 * Styling: inline style={{}} only (no .css). Aurora Glass dark palette.
 * Colors: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a, warn #FF8A4B.
 * NO purple/violet/blue/teal/cyan/indigo/pink, no random hsl().
 * Deps: lucide-react, recharts.
 *
 * Interactivity (all real, useState-driven):
 *  - Time-range selector (7d / 30d / 90d / 12mo) swaps the hero chart dataset
 *    AND recomputes every headline KPI value + period-over-period delta.
 *  - Hero metric toggle (Revenue ↔ Sends) swaps the series + axis + tooltip.
 *  - Hover tooltip on the hero chart with previous-period comparison.
 *  - Plan-mix donut: hovering a segment highlights it + shows count + share.
 *  - Top-movers list + compact system-status summary.
 */

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Users,
  DollarSign,
  Mail,
  Inbox,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Gauge,
  Repeat,
  Server,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Sparkles,
} from 'lucide-react';

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: '1px solid rgba(255,255,255,0.10)',
  glassSoft: 'rgba(255,255,255,0.03)',
  blur: 'blur(10px)',
  text: '#fff',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.42)',
  hair: 'rgba(255,255,255,0.10)',
  hairSoft: 'rgba(255,255,255,0.07)',
  orange: '#F26522',
  orangeLight: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
} as const;

const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

// ─── Time-range model ─────────────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d' | '12mo';

interface RangeMeta {
  key: RangeKey;
  label: string;
  /** Human label for the previous comparison window. */
  prevLabel: string;
}

const RANGES: RangeMeta[] = [
  { key: '7d', label: '7 days', prevLabel: 'prior 7 days' },
  { key: '30d', label: '30 days', prevLabel: 'prior 30 days' },
  { key: '90d', label: '90 days', prevLabel: 'prior 90 days' },
  { key: '12mo', label: '12 months', prevLabel: 'prior 12 months' },
];

// A hero data point carries the current value plus the aligned previous-period
// value so the chart can shade a comparison band and the tooltip can show both.
interface HeroPoint {
  t: string;
  revenue: number;
  sends: number;
  revenuePrev: number;
  sendsPrev: number;
}

// Hand-tuned mock series per range. Revenue in $, sends in absolute emails.
const HERO_SERIES: Record<RangeKey, HeroPoint[]> = {
  '7d': [
    { t: 'Mon', revenue: 6720, sends: 64200, revenuePrev: 6410, sendsPrev: 60100 },
    { t: 'Tue', revenue: 6810, sends: 66800, revenuePrev: 6460, sendsPrev: 61400 },
    { t: 'Wed', revenue: 6940, sends: 69100, revenuePrev: 6520, sendsPrev: 62700 },
    { t: 'Thu', revenue: 6880, sends: 67900, revenuePrev: 6580, sendsPrev: 63100 },
    { t: 'Fri', revenue: 7020, sends: 71300, revenuePrev: 6610, sendsPrev: 64500 },
    { t: 'Sat', revenue: 6450, sends: 58200, revenuePrev: 6190, sendsPrev: 54800 },
    { t: 'Sun', revenue: 6430, sends: 56700, revenuePrev: 6240, sendsPrev: 54200 },
  ],
  '30d': [
    { t: 'W1', revenue: 45200, sends: 432000, revenuePrev: 42800, sendsPrev: 401000 },
    { t: 'W2', revenue: 46100, sends: 451000, revenuePrev: 43100, sendsPrev: 410000 },
    { t: 'W3', revenue: 47050, sends: 468000, revenuePrev: 43600, sendsPrev: 419000 },
    { t: 'W4', revenue: 48250, sends: 486200, revenuePrev: 44100, sendsPrev: 427000 },
  ],
  '90d': [
    { t: 'Mar', revenue: 41200, sends: 372000, revenuePrev: 37100, sendsPrev: 331000 },
    { t: 'Apr', revenue: 44400, sends: 421000, revenuePrev: 39800, sendsPrev: 361000 },
    { t: 'May', revenue: 48250, sends: 486200, revenuePrev: 41200, sendsPrev: 372000 },
  ],
  '12mo': [
    { t: 'Jun', revenue: 21800, sends: 168000, revenuePrev: 14200, sendsPrev: 102000 },
    { t: 'Jul', revenue: 24100, sends: 182000, revenuePrev: 16100, sendsPrev: 118000 },
    { t: 'Aug', revenue: 26700, sends: 205000, revenuePrev: 18400, sendsPrev: 131000 },
    { t: 'Sep', revenue: 29900, sends: 238000, revenuePrev: 20900, sendsPrev: 149000 },
    { t: 'Oct', revenue: 32600, sends: 271000, revenuePrev: 23100, sendsPrev: 168000 },
    { t: 'Nov', revenue: 35100, sends: 298000, revenuePrev: 25800, sendsPrev: 191000 },
    { t: 'Dec', revenue: 37400, sends: 322000, revenuePrev: 28200, sendsPrev: 214000 },
    { t: 'Jan', revenue: 39200, sends: 341000, revenuePrev: 30600, sendsPrev: 238000 },
    { t: 'Feb', revenue: 41000, sends: 358000, revenuePrev: 33100, sendsPrev: 262000 },
    { t: 'Mar', revenue: 43300, sends: 372000, revenuePrev: 35400, sendsPrev: 288000 },
    { t: 'Apr', revenue: 45900, sends: 421000, revenuePrev: 38200, sendsPrev: 318000 },
    { t: 'May', revenue: 48250, sends: 486200, revenuePrev: 41000, sendsPrev: 358000 },
  ],
};

// ─── KPI model ──────────────────────────────────────────────────────────────
type Trend = 'good' | 'bad';

interface KpiDef {
  key: string;
  icon: typeof Users;
  label: string;
  /** Format a numeric value for display. */
  fmt: (v: number) => string;
  /** Current value per range. */
  current: Record<RangeKey, number>;
  /** Previous-period value per range. */
  prev: Record<RangeKey, number>;
  /** Sparkline shape (range-independent silhouette). */
  spark: number[];
  /** Whether an increase is good (green) or bad (orange/danger). */
  upIsGood: boolean;
}

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const usdK = (v: number) => `$${(v / 1000).toFixed(1)}K`;
const intC = (v: number) => Math.round(v).toLocaleString();
const pct0 = (v: number) => `${Math.round(v)}%`;

const KPIS: KpiDef[] = [
  {
    key: 'mrr',
    icon: DollarSign,
    label: 'Monthly recurring revenue',
    fmt: usd,
    current: { '7d': 48250, '30d': 48250, '90d': 48250, '12mo': 48250 },
    prev: { '7d': 47100, '30d': 44100, '90d': 41200, '12mo': 21800 },
    spark: [38, 40, 41, 43, 44, 46, 47, 48],
    upIsGood: true,
  },
  {
    key: 'users',
    icon: Users,
    label: 'Total users',
    fmt: intC,
    current: { '7d': 1284, '30d': 1284, '90d': 1284, '12mo': 1284 },
    prev: { '7d': 1205, '30d': 1112, '90d': 968, '12mo': 642 },
    spark: [64, 70, 78, 86, 94, 104, 116, 128],
    upIsGood: true,
  },
  {
    key: 'mailboxes',
    icon: Inbox,
    label: 'Active mailboxes',
    fmt: intC,
    current: { '7d': 3142, '30d': 3142, '90d': 3142, '12mo': 3142 },
    prev: { '7d': 3061, '30d': 2884, '90d': 2510, '12mo': 1488 },
    spark: [150, 162, 178, 196, 214, 248, 286, 314],
    upIsGood: true,
  },
  {
    key: 'sends',
    icon: Mail,
    label: 'Warmup sends',
    fmt: intC,
    current: { '7d': 444400, '30d': 1837200, '90d': 1279200, '12mo': 4042200 },
    prev: { '7d': 412800, '30d': 1657000, '90d': 1064000, '12mo': 2389000 },
    spark: [54, 58, 62, 67, 71, 76, 80, 84],
    upIsGood: true,
  },
  {
    key: 'placement',
    icon: Gauge,
    label: 'Avg inbox placement',
    fmt: pct0,
    current: { '7d': 92, '30d': 92, '90d': 91, '12mo': 90 },
    prev: { '7d': 93, '30d': 91, '90d': 89, '12mo': 86 },
    spark: [88, 90, 89, 91, 92, 91, 93, 92],
    upIsGood: true,
  },
];

// ─── Secondary metric strip ───────────────────────────────────────────────────
interface MiniMetric {
  icon: typeof Users;
  label: string;
  current: Record<RangeKey, string>;
  delta: Record<RangeKey, { text: string; trend: Trend }>;
  hint: string;
}

const MINI: MiniMetric[] = [
  {
    icon: Repeat,
    label: 'Net revenue retention',
    current: { '7d': '112%', '30d': '112%', '90d': '109%', '12mo': '108%' },
    delta: {
      '7d': { text: '+1.0 pt', trend: 'good' },
      '30d': { text: '+1.0 pt', trend: 'good' },
      '90d': { text: '+2.0 pt', trend: 'good' },
      '12mo': { text: '+5.0 pt', trend: 'good' },
    },
    hint: 'Expansion outpaces contraction across Pro & Agency tiers.',
  },
  {
    icon: ArrowDownRight,
    label: 'Logo churn',
    current: { '7d': '0.4%', '30d': '1.6%', '90d': '4.7%', '12mo': '14.2%' },
    delta: {
      '7d': { text: '−0.1 pt', trend: 'good' },
      '30d': { text: '−0.2 pt', trend: 'good' },
      '90d': { text: '+0.3 pt', trend: 'bad' },
      '12mo': { text: '−1.1 pt', trend: 'good' },
    },
    hint: 'Monthly cancelled workspaces as a share of the active base.',
  },
  {
    icon: DollarSign,
    label: 'ARPU',
    current: { '7d': '$37.6', '30d': '$37.6', '90d': '$36.9', '12mo': '$34.8' },
    delta: {
      '7d': { text: '+$0.4', trend: 'good' },
      '30d': { text: '+$0.7', trend: 'good' },
      '90d': { text: '+$1.1', trend: 'good' },
      '12mo': { text: '+$2.8', trend: 'good' },
    },
    hint: 'Blended revenue per paying user, all tiers.',
  },
  {
    icon: Layers,
    label: 'Peer pool capacity',
    current: { '7d': '78%', '30d': '78%', '90d': '74%', '12mo': '69%' },
    delta: {
      '7d': { text: '+2 pt', trend: 'bad' },
      '30d': { text: '+4 pt', trend: 'bad' },
      '90d': { text: '+9 pt', trend: 'bad' },
      '12mo': { text: '+18 pt', trend: 'bad' },
    },
    hint: '740 of 950 peer inboxes engaged. Headroom narrowing — provision soon.',
  },
];

// ─── Plan distribution (interactive donut) ─────────────────────────────────────
interface PlanSlice {
  name: string;
  count: number;
  color: string;
  mrrShare: number; // % of MRR
}

const PLAN_SLICES: PlanSlice[] = [
  { name: 'Starter', count: 540, color: 'rgba(255,255,255,0.34)', mrrShare: 11 },
  { name: 'Pro', count: 410, color: C.orangeLight, mrrShare: 41 },
  { name: 'Pro Plus', count: 220, color: C.orange, mrrShare: 33 },
  { name: 'Agency', count: 114, color: C.success, mrrShare: 15 },
];
const PLAN_TOTAL = PLAN_SLICES.reduce((s, p) => s + p.count, 0);

// ─── Top movers (notable this period) ──────────────────────────────────────────
interface Mover {
  name: string;
  detail: string;
  change: string;
  trend: Trend;
}

const MOVERS: Record<RangeKey, Mover[]> = {
  '7d': [
    { name: 'Nexus Growth Labs', detail: 'Agency · 84.2K sends', change: '+22%', trend: 'good' },
    { name: 'Orbital Outbound', detail: 'Agency · upgraded to Agency', change: 'New', trend: 'good' },
    { name: 'Helix Marketing', detail: 'Pro · inbox 91% → 86%', change: '−5 pt', trend: 'bad' },
    { name: 'Cascade Ventures', detail: 'Pro Plus · 31.1K sends', change: '+14%', trend: 'good' },
  ],
  '30d': [
    { name: 'Orbital Outbound', detail: 'Agency · +71.6K sends', change: '+38%', trend: 'good' },
    { name: 'SilverStream Co.', detail: 'Pro → Pro Plus upgrade', change: 'Upsell', trend: 'good' },
    { name: 'Tandem Digital', detail: 'Pro · 2 mailboxes paused', change: '−12%', trend: 'bad' },
    { name: 'Nexus Growth Labs', detail: 'Agency · MRR $2.8K', change: '+9%', trend: 'good' },
  ],
  '90d': [
    { name: 'Quarter cohort Q2', detail: '+312 net new workspaces', change: '+27%', trend: 'good' },
    { name: 'Agency tier', detail: '88 → 114 active seats', change: '+30%', trend: 'good' },
    { name: 'Helix Marketing', detail: 'Downgraded Pro Plus → Pro', change: 'Downsell', trend: 'bad' },
    { name: 'Peer pool', detail: 'Capacity 65% → 74%', change: '+9 pt', trend: 'bad' },
  ],
  '12mo': [
    { name: 'Platform MRR', detail: '$21.8K → $48.3K', change: '+121%', trend: 'good' },
    { name: 'Agency tier', detail: 'Launched Sep · 114 seats', change: 'New', trend: 'good' },
    { name: 'Annual churn', detail: 'Trailing logo churn', change: '14.2%', trend: 'bad' },
    { name: 'Inbox placement', detail: 'Blended 86% → 90%', change: '+4 pt', trend: 'good' },
  ],
};

// ─── System status summary ──────────────────────────────────────────────────
type StatusLevel = 'ok' | 'warn';
interface StatusRow {
  icon: typeof Server;
  label: string;
  value: string;
  level: StatusLevel;
}

const STATUS: StatusRow[] = [
  { icon: Activity, label: 'Beat scheduler', value: 'Alive · 14s ago', level: 'ok' },
  { icon: Server, label: 'Worker queue (smtp)', value: '6 pending', level: 'ok' },
  { icon: Layers, label: 'Peer pool', value: '740 / 950 engaged', level: 'warn' },
  { icon: Mail, label: 'Send success (24h)', value: '99.3%', level: 'ok' },
];

// ─── Derived helpers ──────────────────────────────────────────────────────────
function deltaPct(curr: number, prev: number): number {
  if (prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

// ─── Reusable bits ────────────────────────────────────────────────────────────
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 96;
  const h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = useMemo(() => `spk-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DeltaPill({ value, trend }: { value: string; trend: Trend }) {
  const good = trend === 'good';
  const color = good ? C.success : C.warning;
  const bg = good ? 'rgba(61,220,151,0.13)' : 'rgba(255,138,75,0.14)';
  const Icon = good ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 12,
        fontWeight: 700,
        color,
        background: bg,
        borderRadius: 999,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={12} strokeWidth={2.6} />
      {value}
    </span>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ def, range }: { def: KpiDef; range: RangeKey }) {
  const curr = def.current[range];
  const prev = def.prev[range];
  const dp = deltaPct(curr, prev);
  const up = dp >= 0;
  // "good" combines direction with the metric's polarity.
  const good = up === def.upIsGood;
  const trend: Trend = good ? 'good' : 'bad';
  const Icon = def.icon;
  const sparkColor = good ? C.orangeLight : C.danger;
  return (
    <div
      style={{
        flex: '1 1 200px',
        minWidth: 0,
        background: C.glass,
        border: C.glassBorder,
        backdropFilter: C.blur,
        WebkitBackdropFilter: C.blur,
        borderRadius: 16,
        padding: '20px 22px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.textDim }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 8,
            background: 'rgba(242,101,34,0.14)',
            color: C.orangeLight,
            flexShrink: 0,
          }}
        >
          <Icon size={14} strokeWidth={2} />
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: C.textDim,
            lineHeight: 1.2,
          }}
        >
          {def.label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, lineHeight: 1 }}>
          {def.fmt(curr)}
        </div>
        <Sparkline points={def.spark} color={sparkColor} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <DeltaPill value={`${up ? '+' : '−'}${Math.abs(dp).toFixed(1)}%`} trend={trend} />
        <span style={{ fontSize: 11, color: C.textFaint }}>
          vs {RANGES.find((r) => r.key === range)!.prevLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Hero chart tooltip ────────────────────────────────────────────────────────
interface TipEntry {
  dataKey: string;
  value: number;
}
interface TipProps {
  active?: boolean;
  payload?: TipEntry[];
  label?: string;
  metric: 'revenue' | 'sends';
}

function HeroTooltip({ active, payload, label, metric }: TipProps) {
  if (!active || !payload?.length) return null;
  const currKey = metric;
  const prevKey = metric === 'revenue' ? 'revenuePrev' : 'sendsPrev';
  const curr = payload.find((p) => p.dataKey === currKey)?.value ?? 0;
  const prev = payload.find((p) => p.dataKey === prevKey)?.value ?? 0;
  const dp = deltaPct(curr, prev);
  const up = dp >= 0;
  const fmt = (v: number) => (metric === 'revenue' ? usd(v) : intC(v));
  return (
    <div
      style={{
        background: 'rgba(12,9,7,0.94)',
        border: '1px solid rgba(242,101,34,0.32)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 12,
        padding: '11px 14px',
        fontSize: 12,
        color: C.text,
        minWidth: 168,
        boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 7, color: C.orangeLight }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 4 }}>
        <span style={{ color: C.textDim }}>{metric === 'revenue' ? 'Revenue' : 'Sends'}</span>
        <span style={{ color: C.text, fontWeight: 700 }}>{fmt(curr)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 7 }}>
        <span style={{ color: C.textFaint }}>Prev period</span>
        <span style={{ color: C.textFaint, fontWeight: 600 }}>{fmt(prev)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 700,
          color: up ? C.success : C.warning,
          borderTop: `1px solid ${C.hairSoft}`,
          paddingTop: 7,
        }}
      >
        {up ? <ArrowUpRight size={12} strokeWidth={2.6} /> : <ArrowDownRight size={12} strokeWidth={2.6} />}
        {`${up ? '+' : '−'}${Math.abs(dp).toFixed(1)}% vs prior`}
      </div>
    </div>
  );
}

// ─── Segmented control (generic) ────────────────────────────────────────────────
function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? '6px 12px' : '7px 15px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        background: C.glassSoft,
        border: C.glassBorder,
        borderRadius: 999,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              appearance: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: pad,
              fontSize: fs,
              fontWeight: 700,
              letterSpacing: '0.02em',
              borderRadius: 999,
              color: on ? '#1a0f08' : C.textDim,
              background: on ? `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})` : 'transparent',
              boxShadow: on ? '0 4px 14px rgba(242,101,34,0.32)' : 'none',
              transition: 'color 0.15s, background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Panel chrome ─────────────────────────────────────────────────────────────
function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.glass,
        border: C.glassBorder,
        backdropFilter: C.blur,
        WebkitBackdropFilter: C.blur,
        borderRadius: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PanelHead({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon: typeof Server;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: subtitle ? 5 : 0 }}>
          <Icon size={15} color={C.orangeLight} strokeWidth={2.2} />
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
        </div>
        {subtitle && <p style={{ fontSize: 12, color: C.textDim, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function AdmDshE2Executive() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [metric, setMetric] = useState<'revenue' | 'sends'>('revenue');
  const [hoverPlan, setHoverPlan] = useState<number | null>(null);

  const series = HERO_SERIES[range];
  const rangeMeta = RANGES.find((r) => r.key === range)!;

  // Period-over-period delta for the hero headline: sum current vs sum previous.
  const heroDelta = useMemo(() => {
    const sumCurr = series.reduce((s, p) => s + (metric === 'revenue' ? p.revenue : p.sends), 0);
    const sumPrev = series.reduce((s, p) => s + (metric === 'revenue' ? p.revenuePrev : p.sendsPrev), 0);
    return { curr: sumCurr, prev: sumPrev, dp: deltaPct(sumCurr, sumPrev) };
  }, [series, metric]);

  const heroUp = heroDelta.dp >= 0;

  // The hero headline figure: latest point for revenue (a level/MRR-like read),
  // total for sends (a volume read) — matches how an exec would read each.
  const heroValue =
    metric === 'revenue'
      ? usd(series[series.length - 1]!.revenue)
      : intC(heroDelta.curr);

  const activePlan = hoverPlan !== null ? PLAN_SLICES[hoverPlan]! : null;

  const gradId = 'heroGradE2';
  const gradPrevId = 'heroPrevGradE2';

  return (
    <div
      style={{
        padding: '34px 30px 56px',
        maxWidth: 1320,
        margin: '0 auto',
        fontFamily: FONT,
        color: C.text,
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 30,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span
              style={{
                width: 30,
                height: 3,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${C.orange}, ${C.orangeLight})`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: C.orangeLight,
              }}
            >
              WarmPulse · Executive briefing
            </span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(26px, 3.6vw, 38px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.08,
              color: C.text,
              margin: 0,
            }}
          >
            Platform overview
          </h1>
          <p style={{ fontSize: 14, color: C.textDim, margin: '10px 0 0', maxWidth: 560, lineHeight: 1.55 }}>
            A board-room read on growth, deliverability, and platform health — as of 31 May 2026, 00:05 UTC.
          </p>
        </div>

        {/* Time-range selector (drives the whole dashboard) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.textFaint,
            }}
          >
            Reporting window
          </span>
          <Segmented
            options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
            value={range}
            onChange={setRange}
          />
        </div>
      </header>

      {/* ── KPI row ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
        {KPIS.map((def) => (
          <KpiCard key={def.key} def={def} range={range} />
        ))}
      </div>

      {/* ── Secondary metric strip ─────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {MINI.map((m) => {
          const Icon = m.icon;
          const d = m.delta[range];
          return (
            <Panel key={m.label} style={{ padding: '16px 18px', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textDim, minWidth: 0 }}>
                  <Icon size={14} strokeWidth={2} color={C.textFaint} />
                  <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.label}
                  </span>
                </div>
                <DeltaPill value={d.text} trend={d.trend} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, margin: '10px 0 6px' }}>
                {m.current[range]}
              </div>
              <p style={{ fontSize: 11, color: C.textFaint, margin: 0, lineHeight: 1.45 }}>{m.hint}</p>
            </Panel>
          );
        })}
      </div>

      {/* ── Hero chart ─────────────────────────────────────────────────── */}
      <Panel style={{ padding: '24px 26px 18px', marginBottom: 22 }}>
        <PanelHead
          icon={TrendingUp}
          title={metric === 'revenue' ? 'Revenue trend' : 'Send volume trend'}
          subtitle={
            metric === 'revenue'
              ? 'Recurring revenue over the selected window, with the prior period shaded for comparison.'
              : 'Total warmup sends over the selected window, with the prior period shaded for comparison.'
          }
          right={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <Segmented
                size="sm"
                options={[
                  { key: 'revenue', label: 'Revenue' },
                  { key: 'sends', label: 'Sends' },
                ]}
                value={metric}
                onChange={setMetric}
              />
            </div>
          }
        />

        {/* Headline figure + period delta */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, margin: '18px 0 4px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', color: C.text, lineHeight: 1 }}>
            {heroValue}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
            <DeltaPill
              value={`${heroUp ? '+' : '−'}${Math.abs(heroDelta.dp).toFixed(1)}%`}
              trend={heroUp ? 'good' : 'bad'}
            />
            <span style={{ fontSize: 12, color: C.textFaint }}>
              {metric === 'revenue' ? 'current MRR · ' : 'total · '}
              vs {rangeMeta.prevLabel}
            </span>
          </div>
          {/* Comparison legend */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim }}>
              <span style={{ width: 16, height: 3, borderRadius: 2, background: C.orange }} />
              This period
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textFaint }}>
              <span
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: 2,
                  background: 'transparent',
                  borderTop: `2px dashed ${C.textFaint}`,
                }}
              />
              Prior period
            </span>
          </div>
        </div>

        <div style={{ height: 280, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.orange} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id={gradPrevId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.5)" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.5)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
              <YAxis
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={metric === 'revenue' ? 52 : 56}
                tickFormatter={(v: number) =>
                  metric === 'revenue' ? usdK(v) : `${(v / 1000).toFixed(0)}K`
                }
              />
              <Tooltip
                content={<HeroTooltip metric={metric} />}
                cursor={{ stroke: 'rgba(242,101,34,0.4)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              {/* Prior period — drawn first, muted dashed */}
              <Area
                type="monotone"
                dataKey={metric === 'revenue' ? 'revenuePrev' : 'sendsPrev'}
                stroke={C.textFaint}
                strokeWidth={1.4}
                strokeDasharray="4 4"
                fill={`url(#${gradPrevId})`}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              {/* Current period — emphasised */}
              <Area
                type="monotone"
                dataKey={metric}
                stroke={C.orange}
                strokeWidth={2.4}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 5, fill: C.orangeLight, stroke: '#0c0907', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ── Lower band: plan mix · top movers · system status ───────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        {/* Plan distribution (interactive donut) */}
        <Panel style={{ padding: '22px 24px' }}>
          <PanelHead icon={Layers} title="Plan distribution" subtitle="Hover a tier to inspect its seat count and revenue share." />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18, flexWrap: 'wrap' }}>
            {/* Donut */}
            <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PLAN_SLICES}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {PLAN_SLICES.map((s, i) => (
                      <Cell
                        key={s.name}
                        fill={s.color}
                        opacity={hoverPlan === null || hoverPlan === i ? 1 : 0.32}
                        style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                        onMouseEnter={() => setHoverPlan(i)}
                        onMouseLeave={() => setHoverPlan(null)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center readout reacts to hover */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {activePlan ? activePlan.count.toLocaleString() : PLAN_TOTAL.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: C.textFaint, marginTop: 3, textAlign: 'center', maxWidth: 90 }}>
                  {activePlan
                    ? `${activePlan.name} · ${Math.round((activePlan.count / PLAN_TOTAL) * 100)}%`
                    : 'total seats'}
                </div>
              </div>
            </div>

            {/* Legend / list */}
            <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_SLICES.map((s, i) => {
                const share = Math.round((s.count / PLAN_TOTAL) * 100);
                const on = hoverPlan === i;
                return (
                  <div
                    key={s.name}
                    onMouseEnter={() => setHoverPlan(i)}
                    onMouseLeave={() => setHoverPlan(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '6px 8px',
                      borderRadius: 9,
                      cursor: 'pointer',
                      background: on ? 'rgba(255,255,255,0.06)' : 'transparent',
                      transition: 'background 0.15s',
                      opacity: hoverPlan === null || on ? 1 : 0.5,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, flex: 1, whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{s.count.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: C.textFaint, width: 34, textAlign: 'right' }}>{share}%</span>
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 9,
                  borderTop: `1px solid ${C.hairSoft}`,
                  fontSize: 11,
                  color: C.textFaint,
                }}
              >
                {activePlan
                  ? `${activePlan.name} drives ${activePlan.mrrShare}% of MRR.`
                  : 'Pro + Pro Plus = 74% of MRR.'}
              </div>
            </div>
          </div>
        </Panel>

        {/* Top movers */}
        <Panel style={{ padding: '22px 24px' }}>
          <PanelHead
            icon={Sparkles}
            title="Top movers"
            subtitle={`Notable changes over the ${rangeMeta.label.toLowerCase()}.`}
          />
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            {MOVERS[range].map((m, idx) => (
              <div
                key={m.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: idx === 0 ? 'none' : `1px solid ${C.hairSoft}`,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    flexShrink: 0,
                    background: m.trend === 'good' ? 'rgba(61,220,151,0.13)' : 'rgba(255,138,75,0.14)',
                    color: m.trend === 'good' ? C.success : C.warning,
                  }}
                >
                  {m.trend === 'good' ? (
                    <ArrowUpRight size={15} strokeWidth={2.4} />
                  ) : (
                    <ArrowDownRight size={15} strokeWidth={2.4} />
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.detail}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: m.trend === 'good' ? C.success : C.warning,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.change}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* System status */}
        <Panel style={{ padding: '22px 24px' }}>
          <PanelHead icon={Server} title="System status" subtitle="Engine health at a glance." />
          {/* Overall pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '16px 0 14px',
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(61,220,151,0.10)',
              border: '1px solid rgba(61,220,151,0.24)',
            }}
          >
            <CheckCircle2 size={18} color={C.success} strokeWidth={2.2} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>All systems operational</div>
              <div style={{ fontSize: 11, color: C.textFaint }}>1 advisory · peer pool nearing capacity</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STATUS.map((s, idx) => {
              const Icon = s.icon;
              const ok = s.level === 'ok';
              return (
                <div
                  key={s.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 0',
                    borderTop: idx === 0 ? 'none' : `1px solid ${C.hairSoft}`,
                  }}
                >
                  <Icon size={15} color={C.textFaint} strokeWidth={2} />
                  <span style={{ fontSize: 12.5, color: C.textDim, flex: 1, whiteSpace: 'nowrap' }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.value}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      flexShrink: 0,
                    }}
                  >
                    {ok ? (
                      <CheckCircle2 size={14} color={C.success} strokeWidth={2.4} />
                    ) : (
                      <AlertTriangle size={14} color={C.warning} strokeWidth={2.4} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
