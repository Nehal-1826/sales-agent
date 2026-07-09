/**
 * Admin Dashboard — E3 Grid Workspace
 *
 * Direction: "Grid Workspace" — clean, dense, Linear/Vercel-grade data
 * workspace. Crisp dividers, mono numerics, fast micro-interactions.
 *
 * Self-contained content component: no shell, no API, no react-query, no
 * @/features, no @/lib/api. All mock data inline. Styling: inline style={{}}
 * only. Aurora Glass dark palette.
 *
 * Palette: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a,
 * warning #FF8A4B. NO purple/violet/blue/teal/cyan/indigo/pink, no random hsl().
 *
 * Deps: lucide-react, recharts, inline SVG.
 *
 * Interactivity:
 *  - Multi-series chart with a toggleable legend (Sends / Revenue / Signups).
 *  - Sortable "Top workspaces" table (click header → asc/desc + indicator).
 *  - Tab-switched side panel (Overview / Deliverability / Peers).
 *  - Hover tooltips on the chart; row hover on the table.
 *  - Range switcher (7d / 30d / 90d) that reshapes the chart.
 */

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  DollarSign,
  Inbox,
  Send,
  Target,
  Server,
  Activity,
  CircleDot,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: '1px solid rgba(255,255,255,0.10)',
  blur: 'blur(10px)',
  text: '#fff',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.42)',
  textGhost: 'rgba(255,255,255,0.28)',
  orange: '#F26522',
  orangeLight: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  divider: 'rgba(255,255,255,0.08)',
  dividerSoft: 'rgba(255,255,255,0.05)',
  hover: 'rgba(255,255,255,0.045)',
  inset: 'rgba(0,0,0,0.22)',
} as const;

const MONO =
  "'SFMono-Regular', ui-monospace, 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace";

// ─── Types ────────────────────────────────────────────────────────────────--
type RangeKey = '7d' | '30d' | '90d';
type SeriesKey = 'sends' | 'revenue' | 'signups';

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
  axis: 'left' | 'right';
  kind: 'bar' | 'area' | 'line';
}

interface TrendPoint {
  t: string;
  sends: number;
  revenue: number;
  signups: number;
}

interface Kpi {
  key: string;
  label: string;
  value: string;
  delta: number; // signed %
  positiveIsGood: boolean;
  spark: number[];
  icon: typeof Users;
}

type PlanTier = 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';

interface WorkspaceRow {
  name: string;
  domain: string;
  plan: PlanTier;
  mailboxes: number;
  sends30d: number;
  placement: number; // %
  mrr: number; // $
  health: number; // 0..100
}

interface PlanSegment {
  name: PlanTier;
  count: number;
  mrr: number;
  color: string;
}

interface PoolRow {
  name: string;
  used: number;
  total: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────--

const SERIES: SeriesMeta[] = [
  { key: 'sends', label: 'Sends', color: C.orangeLight, axis: 'left', kind: 'bar' },
  { key: 'revenue', label: 'Revenue', color: C.success, axis: 'right', kind: 'line' },
  { key: 'signups', label: 'Signups', color: C.orange, axis: 'right', kind: 'area' },
];

// Three pre-baked ranges so the range switcher actually reshapes the chart.
const TREND: Record<RangeKey, TrendPoint[]> = {
  '7d': [
    { t: 'Mon', sends: 9.8, revenue: 1.62, signups: 14 },
    { t: 'Tue', sends: 10.4, revenue: 1.71, signups: 18 },
    { t: 'Wed', sends: 11.2, revenue: 1.69, signups: 16 },
    { t: 'Thu', sends: 10.9, revenue: 1.78, signups: 21 },
    { t: 'Fri', sends: 12.1, revenue: 1.84, signups: 19 },
    { t: 'Sat', sends: 7.6, revenue: 1.41, signups: 11 },
    { t: 'Sun', sends: 7.1, revenue: 1.38, signups: 9 },
  ],
  '30d': [
    { t: 'W1', sends: 64, revenue: 10.9, signups: 88 },
    { t: 'W2', sends: 68, revenue: 11.4, signups: 96 },
    { t: 'W3', sends: 71, revenue: 11.8, signups: 91 },
    { t: 'W4', sends: 74, revenue: 12.2, signups: 104 },
  ],
  '90d': [
    { t: 'Mar', sends: 268, revenue: 42.8, signups: 312 },
    { t: 'Apr', sends: 288, revenue: 45.5, signups: 356 },
    { t: 'May', sends: 301, revenue: 48.25, signups: 384 },
  ],
};

const KPIS: Kpi[] = [
  {
    key: 'users',
    label: 'Total users',
    value: '1,284',
    delta: 6.2,
    positiveIsGood: true,
    spark: [48, 52, 50, 58, 63, 70, 72, 79, 84, 88, 90, 96],
    icon: Users,
  },
  {
    key: 'mrr',
    label: 'MRR',
    value: '$48,250',
    delta: 4.1,
    positiveIsGood: true,
    spark: [32, 34, 36, 35, 39, 42, 44, 46, 47, 48, 49, 51],
    icon: DollarSign,
  },
  {
    key: 'mailboxes',
    label: 'Active mailboxes',
    value: '3,910',
    delta: 2.8,
    positiveIsGood: true,
    spark: [58, 60, 64, 66, 70, 73, 75, 78, 80, 83, 85, 88],
    icon: Inbox,
  },
  {
    key: 'sends',
    label: 'Sends (24h)',
    value: '71,540',
    delta: 9.0,
    positiveIsGood: true,
    spark: [40, 45, 50, 55, 52, 60, 65, 70, 68, 74, 80, 88],
    icon: Send,
  },
  {
    key: 'placement',
    label: 'Avg inbox placement',
    value: '92.4%',
    delta: -1.2,
    positiveIsGood: true,
    spark: [96, 95, 94, 96, 95, 93, 94, 93, 92, 93, 92, 91],
    icon: Target,
  },
  {
    key: 'churn',
    label: 'Churn (30d)',
    value: '1.8%',
    delta: -0.4,
    positiveIsGood: false, // lower churn is good → a negative delta is good
    spark: [3.1, 2.9, 2.8, 2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 1.9, 1.8],
    icon: Activity,
  },
];

const PLANS: PlanSegment[] = [
  { name: 'Starter', count: 540, mrr: 9720, color: 'rgba(255,255,255,0.45)' },
  { name: 'Pro', count: 410, mrr: 16400, color: C.orangeLight },
  { name: 'Pro Plus', count: 220, mrr: 13200, color: C.orange },
  { name: 'Agency', count: 114, mrr: 8930, color: C.success },
];

const POOLS: PoolRow[] = [
  { name: 'Default pool', used: 2340, total: 3000 },
  { name: 'Google WS', used: 832, total: 1300 },
  { name: 'Office 365', used: 648, total: 800 },
  { name: 'Yahoo', used: 260, total: 500 },
];

const WORKSPACES: WorkspaceRow[] = [
  { name: 'Northwind Labs', domain: 'northwind.io', plan: 'Agency', mailboxes: 142, sends30d: 184200, placement: 96.1, mrr: 1490, health: 97 },
  { name: 'Helix Outreach', domain: 'helixout.com', plan: 'Pro Plus', mailboxes: 88, sends30d: 121800, placement: 94.3, mrr: 690, health: 92 },
  { name: 'Cedar & Co', domain: 'cedarco.app', plan: 'Pro', mailboxes: 54, sends30d: 76400, placement: 91.8, mrr: 240, health: 88 },
  { name: 'Brightwave', domain: 'brightwave.dev', plan: 'Pro Plus', mailboxes: 71, sends30d: 98300, placement: 89.2, mrr: 690, health: 81 },
  { name: 'Apex Sales', domain: 'apexsales.co', plan: 'Pro', mailboxes: 39, sends30d: 51200, placement: 93.6, mrr: 240, health: 90 },
  { name: 'Quanta Mail', domain: 'quanta.email', plan: 'Agency', mailboxes: 118, sends30d: 152900, placement: 87.4, mrr: 1490, health: 76 },
  { name: 'Loop Studio', domain: 'loop.studio', plan: 'Starter', mailboxes: 6, sends30d: 7100, placement: 84.9, mrr: 18, health: 71 },
  { name: 'Meridian Group', domain: 'meridian.gr', plan: 'Pro', mailboxes: 47, sends30d: 64800, placement: 95.2, mrr: 240, health: 94 },
];

const ACTIVITY: Array<{ icon: typeof Users; tone: keyof typeof TONE; text: string; meta: string; when: string }> = [
  { icon: Users, tone: 'orange', text: 'Brightwave upgraded to Pro Plus', meta: 'billing', when: '2m' },
  { icon: ShieldCheck, tone: 'success', text: 'Peer pool "Office 365" passed health check', meta: 'peers', when: '11m' },
  { icon: AlertTriangle, tone: 'warning', text: 'Quanta Mail placement dipped to 87.4%', meta: 'deliverability', when: '34m' },
  { icon: Users, tone: 'orange', text: '21 new signups in the last hour', meta: 'growth', when: '1h' },
  { icon: AlertTriangle, tone: 'danger', text: 'Yahoo peer y-1042 deactivated (rep 0.27)', meta: 'peers', when: '2h' },
];

const TONE = {
  orange: C.orangeLight,
  success: C.success,
  warning: C.warning,
  danger: C.danger,
} as const;

// ─── Shared style fragments ───────────────────────────────────────────────--

const panel: React.CSSProperties = {
  background: C.glass,
  border: C.glassBorder,
  backdropFilter: C.blur,
  WebkitBackdropFilter: C.blur,
  borderRadius: 14,
};

const eyebrow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  color: C.textFaint,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
};

const numStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontVariantNumeric: 'tabular-nums',
};

// ─── Helpers ──────────────────────────────────────────────────────────────--

function planChipStyle(plan: PlanTier): React.CSSProperties {
  const map: Record<PlanTier, { bg: string; color: string }> = {
    Starter: { bg: 'rgba(255,255,255,0.07)', color: C.textDim },
    Pro: { bg: 'rgba(255,138,75,0.16)', color: C.orangeLight },
    'Pro Plus': { bg: 'rgba(242,101,34,0.20)', color: C.orangeLight },
    Agency: { bg: 'rgba(61,220,151,0.15)', color: C.success },
  };
  const m = map[plan];
  return {
    background: m.bg,
    color: m.color,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.02em',
    padding: '2px 8px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  };
}

function healthColor(h: number): string {
  if (h >= 90) return C.success;
  if (h >= 78) return C.warning;
  return C.danger;
}

function placementColor(p: number): string {
  if (p >= 92) return C.success;
  if (p >= 88) return C.warning;
  return C.danger;
}

function poolColor(pct: number): string {
  if (pct >= 80) return C.danger;
  if (pct >= 65) return C.warning;
  return C.success;
}

// ─── Sparkline ────────────────────────────────────────────────────────────--

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 60;
  const h = 22;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const gid = `spk-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── KPI cell ─────────────────────────────────────────────────────────────--

function KpiCell({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  // "good" = sign of delta matches whether positive is good
  const good = kpi.delta >= 0 === kpi.positiveIsGood;
  const deltaColor = good ? C.success : C.danger;
  const up = kpi.delta >= 0;
  const DeltaIcon = up ? ArrowUpRight : ArrowDownRight;
  const sparkColor = good ? C.success : C.danger;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...panel,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        minWidth: 0,
        background: hover ? 'rgba(255,255,255,0.07)' : C.glass,
        transition: 'background 0.15s, transform 0.15s',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...eyebrow, fontSize: 10 }}>
          <Icon size={11} strokeWidth={2.4} />
          {kpi.label}
        </span>
        <CircleDot size={10} style={{ color: C.textGhost }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            ...numStyle,
            fontSize: 21,
            fontWeight: 700,
            color: C.text,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {kpi.value}
        </span>
        <Sparkline points={kpi.spark} color={sparkColor} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            color: deltaColor,
            fontSize: 11,
            fontWeight: 700,
            ...numStyle,
          }}
        >
          <DeltaIcon size={11} strokeWidth={2.6} />
          {up ? '+' : ''}
          {kpi.delta.toFixed(1)}%
        </span>
        <span style={{ fontSize: 10, color: C.textGhost }}>vs prev</span>
      </div>
    </div>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────--

interface TipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = (k: string, v: number): string => {
    if (k === 'revenue') return `$${v.toFixed(1)}k`;
    if (k === 'sends') return `${v.toFixed(1)}k`;
    return `${Math.round(v)}`;
  };
  return (
    <div
      style={{
        background: 'rgba(16,16,18,0.94)',
        border: C.glassBorder,
        borderRadius: 10,
        padding: '9px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        minWidth: 132,
      }}
    >
      <div style={{ color: C.textFaint, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {payload.map((p) => {
          const meta = SERIES.find((s) => s.key === p.dataKey);
          return (
            <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: C.textDim, flex: 1 }}>{meta?.label ?? p.dataKey}</span>
              <span style={{ ...numStyle, fontSize: 12, fontWeight: 700, color: C.text }}>
                {fmt(p.dataKey, p.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Interactive chart panel ──────────────────────────────────────────────--

const RANGES: RangeKey[] = ['7d', '30d', '90d'];

function GrowthPanel() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [active, setActive] = useState<Set<SeriesKey>>(
    () => new Set<SeriesKey>(['sends', 'revenue', 'signups']),
  );

  const data = TREND[range];

  function toggle(k: SeriesKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        // keep at least one series visible
        if (next.size > 1) next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  }

  return (
    <div style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 4 }}>
            <Activity size={11} strokeWidth={2.4} />
            Platform trend
          </div>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Sends, revenue &amp; signups
          </div>
        </div>

        {/* Range switcher */}
        <div
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 3,
            borderRadius: 9,
            background: C.inset,
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {RANGES.map((r) => {
            const on = r === range;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 7,
                  padding: '4px 11px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  ...numStyle,
                  color: on ? C.text : C.textFaint,
                  background: on ? 'rgba(255,255,255,0.10)' : 'transparent',
                  transition: 'color 0.15s, background 0.15s',
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggleable legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SERIES.map((s) => {
          const on = active.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 11px',
                borderRadius: 999,
                border: `1px solid ${on ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}`,
                background: on ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: on ? C.text : C.textGhost,
                fontSize: 11.5,
                fontWeight: 600,
                transition: 'all 0.15s',
                opacity: on ? 1 : 0.7,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: s.kind === 'line' ? 999 : 2,
                  background: on ? s.color : 'transparent',
                  border: on ? 'none' : `1.5px solid ${C.textGhost}`,
                  flexShrink: 0,
                }}
              />
              {s.label}
            </button>
          );
        })}
        <span style={{ ...eyebrow, fontSize: 9.5, marginLeft: 'auto', alignSelf: 'center', color: C.textGhost }}>
          click to toggle
        </span>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 248 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="g-sends" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.orangeLight} stopOpacity={0.9} />
                <stop offset="100%" stopColor={C.orange} stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="g-signups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.orange} stopOpacity={0.42} />
                <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke={C.divider} vertical={false} />
            <XAxis
              dataKey="t"
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fill: C.textFaint, fontSize: 10.5, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `${v}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: C.textFaint, fontSize: 10.5, fontFamily: MONO }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, strokeDasharray: '3 4' }}
            />
            {active.has('sends') && (
              <Bar
                yAxisId="left"
                dataKey="sends"
                fill="url(#g-sends)"
                radius={[4, 4, 0, 0]}
                maxBarSize={30}
                isAnimationActive={false}
              />
            )}
            {active.has('signups') && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="signups"
                stroke={C.orange}
                strokeWidth={1.6}
                fill="url(#g-signups)"
                dot={false}
                activeDot={{ r: 3.5, fill: C.orange, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
            {active.has('revenue') && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                stroke={C.success}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, fill: C.success, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Tab-switched side panel ──────────────────────────────────────────────--

type TabKey = 'overview' | 'deliverability' | 'peers';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Layers }> = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'deliverability', label: 'Deliverability', icon: ShieldCheck },
  { key: 'peers', label: 'Peers', icon: Server },
];

function MiniStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ ...numStyle, fontSize: 18, fontWeight: 700, color: color ?? C.text, marginTop: 3, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: C.textGhost, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ProgressRow({ label, value, max, suffix, color }: { label: string; value: number; max: number; suffix?: string; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.textDim }}>{label}</span>
        <span style={{ ...numStyle, fontSize: 11.5, fontWeight: 700, color }}>
          {value}
          {suffix ?? ''}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: color,
            transition: 'width 0.6s cubic-bezier(0.34,1.2,0.64,1)',
          }}
        />
      </div>
    </div>
  );
}

function SidePanel() {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <div style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          borderRadius: 10,
          background: C.inset,
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                appearance: 'none',
                border: 'none',
                cursor: 'pointer',
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '6px 4px',
                borderRadius: 7,
                fontSize: 11.5,
                fontWeight: 600,
                color: on ? C.text : C.textFaint,
                background: on ? 'rgba(255,255,255,0.09)' : 'transparent',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              <Icon size={12} strokeWidth={2.3} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MiniStat label="Workspaces" value="1,107" sub="+38 this week" />
            <MiniStat label="Net MRR add" value="+$2.1k" sub="vs last month" color={C.success} />
            <MiniStat label="Trials active" value="146" sub="62% convert" />
            <MiniStat label="Avg seats / ws" value="3.5" sub="up from 3.2" />
          </div>
          <div style={{ height: 1, background: C.divider }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <span style={eyebrow}>
              <Clock size={10} strokeWidth={2.4} />
              Recent activity
            </span>
            {ACTIVITY.map((a, i) => {
              const Icon = a.icon;
              const tone = TONE[a.tone];
              return (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${tone}33`,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Icon size={12} strokeWidth={2.2} style={{ color: tone }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.35 }}>{a.text}</div>
                    <div style={{ fontSize: 10, color: C.textGhost, marginTop: 1 }}>
                      {a.meta} · {a.when} ago
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'deliverability' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MiniStat label="Inbox rate" value="92.4%" sub="-1.2pt" color={C.success} />
            <MiniStat label="Spam rate" value="2.1%" sub="+0.3pt" color={C.warning} />
            <MiniStat label="Bounce rate" value="0.8%" sub="stable" />
            <MiniStat label="Spam rescues" value="1,284" sub="last 24h" color={C.success} />
          </div>
          <div style={{ height: 1, background: C.divider }} />
          <span style={eyebrow}>
            <Target size={10} strokeWidth={2.4} />
            Placement by provider
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProgressRow label="Gmail" value={94} max={100} suffix="%" color={C.success} />
            <ProgressRow label="Outlook" value={90} max={100} suffix="%" color={C.warning} />
            <ProgressRow label="Yahoo" value={88} max={100} suffix="%" color={C.warning} />
            <ProgressRow label="Generic SMTP" value={85} max={100} suffix="%" color={C.danger} />
          </div>
        </div>
      )}

      {tab === 'peers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MiniStat label="Active peers" value="4,080" sub="of 5,600" color={C.success} />
            <MiniStat label="Avg reputation" value="0.84" sub="min 0.30" color={C.success} />
            <MiniStat label="Deactivated 24h" value="12" sub="below threshold" color={C.danger} />
            <MiniStat label="Day-0 warming" value="318" sub="exempt" color={C.warning} />
          </div>
          <div style={{ height: 1, background: C.divider }} />
          <span style={eyebrow}>
            <Server size={10} strokeWidth={2.4} />
            Pool capacity
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {POOLS.map((p) => {
              const pct = Math.round((p.used / p.total) * 100);
              return (
                <ProgressRow
                  key={p.name}
                  label={p.name}
                  value={pct}
                  max={100}
                  suffix="%"
                  color={poolColor(pct)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable workspaces table ────────────────────────────────────────────--

type SortKey = 'name' | 'plan' | 'mailboxes' | 'sends30d' | 'placement' | 'mrr' | 'health';
type SortDir = 'asc' | 'desc';

interface Column {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  width?: number;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Workspace', align: 'left' },
  { key: 'plan', label: 'Plan', align: 'left', width: 92 },
  { key: 'mailboxes', label: 'Mailboxes', align: 'right', width: 96 },
  { key: 'sends30d', label: 'Sends 30d', align: 'right', width: 104 },
  { key: 'placement', label: 'Placement', align: 'right', width: 100 },
  { key: 'mrr', label: 'MRR', align: 'right', width: 84 },
  { key: 'health', label: 'Health', align: 'right', width: 110 },
];

const PLAN_RANK: Record<PlanTier, number> = { Starter: 0, Pro: 1, 'Pro Plus': 2, Agency: 3 };

function compareRows(a: WorkspaceRow, b: WorkspaceRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'plan':
      return PLAN_RANK[a.plan] - PLAN_RANK[b.plan];
    default:
      return (a[key] as number) - (b[key] as number);
  }
}

function WorkspacesTable() {
  const [sortKey, setSortKey] = useState<SortKey>('sends30d');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hovered, setHovered] = useState<string | null>(null);

  const rows = useMemo(() => {
    const sorted = [...WORKSPACES].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // numeric columns default to desc (highest first); text defaults to asc
      setSortDir(key === 'name' || key === 'plan' ? 'asc' : 'desc');
    }
  }

  const maxSends = Math.max(...WORKSPACES.map((w) => w.sends30d));

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${C.divider}`,
        }}
      >
        <div style={eyebrow}>
          <Layers size={11} strokeWidth={2.4} />
          Top workspaces
        </div>
        <span style={{ fontSize: 10.5, color: C.textGhost }}>click a header to sort</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const isActive = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    onClick={() => onSort(col.key)}
                    style={{
                      textAlign: col.align,
                      padding: '9px 16px',
                      width: col.width,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: 'rgba(255,255,255,0.02)',
                      borderBottom: `1px solid ${C.divider}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        flexDirection: col.align === 'right' ? 'row-reverse' : 'row',
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: isActive ? C.orangeLight : C.textFaint,
                        transition: 'color 0.15s',
                      }}
                    >
                      {col.label}
                      {isActive ? (
                        sortDir === 'asc' ? (
                          <ChevronUp size={12} strokeWidth={2.6} />
                        ) : (
                          <ChevronDown size={12} strokeWidth={2.6} />
                        )
                      ) : (
                        <ChevronsUpDown size={11} strokeWidth={2} style={{ color: C.textGhost }} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const hov = hovered === w.domain;
              const hc = healthColor(w.health);
              const pc = placementColor(w.placement);
              const sendBar = Math.round((w.sends30d / maxSends) * 100);
              return (
                <tr
                  key={w.domain}
                  onMouseEnter={() => setHovered(w.domain)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hov ? C.hover : 'transparent',
                    transition: 'background 0.12s',
                    borderBottom: `1px solid ${C.dividerSoft}`,
                  }}
                >
                  {/* Workspace */}
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 7,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.orangeLight,
                          background: 'rgba(242,101,34,0.14)',
                          border: '1px solid rgba(242,101,34,0.22)',
                        }}
                      >
                        {w.name.charAt(0)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
                          {w.name}
                        </div>
                        <div style={{ ...numStyle, fontSize: 10.5, color: C.textGhost }}>{w.domain}</div>
                      </div>
                    </div>
                  </td>
                  {/* Plan */}
                  <td style={{ padding: '11px 16px' }}>
                    <span style={planChipStyle(w.plan)}>{w.plan}</span>
                  </td>
                  {/* Mailboxes */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ ...numStyle, fontSize: 12.5, color: C.textDim, fontWeight: 600 }}>
                      {w.mailboxes}
                    </span>
                  </td>
                  {/* Sends 30d (with mini bar) */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ ...numStyle, fontSize: 12.5, color: C.text, fontWeight: 600 }}>
                        {(w.sends30d / 1000).toFixed(1)}k
                      </span>
                      <span style={{ width: 56, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${sendBar}%`,
                            background: `linear-gradient(90deg, ${C.orange}, ${C.orangeLight})`,
                            borderRadius: 2,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  {/* Placement */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ ...numStyle, fontSize: 12.5, fontWeight: 700, color: pc }}>
                      {w.placement.toFixed(1)}%
                    </span>
                  </td>
                  {/* MRR */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ ...numStyle, fontSize: 12.5, color: C.textDim, fontWeight: 600 }}>
                      ${w.mrr.toLocaleString()}
                    </span>
                  </td>
                  {/* Health */}
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <span style={{ width: 48, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                        <span style={{ display: 'block', height: '100%', width: `${w.health}%`, background: hc, borderRadius: 3 }} />
                      </span>
                      <span style={{ ...numStyle, fontSize: 12, fontWeight: 700, color: hc, width: 26, textAlign: 'right' }}>
                        {w.health}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Plan distribution strip ──────────────────────────────────────────────--

function PlanDistribution() {
  const totalCount = PLANS.reduce((s, p) => s + p.count, 0);
  const totalMrr = PLANS.reduce((s, p) => s + p.mrr, 0);
  const [hover, setHover] = useState<PlanTier | null>(null);

  return (
    <div style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow}>
          <Layers size={11} strokeWidth={2.4} />
          Plan distribution
        </div>
        <span style={{ ...numStyle, fontSize: 11, color: C.textGhost }}>
          {totalCount.toLocaleString()} ws
        </span>
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
        {PLANS.map((p) => {
          const pct = (p.count / totalCount) * 100;
          const dim = hover !== null && hover !== p.name;
          return (
            <div
              key={p.name}
              onMouseEnter={() => setHover(p.name)}
              onMouseLeave={() => setHover(null)}
              title={`${p.name}: ${p.count} ws`}
              style={{
                width: `${pct}%`,
                background: p.color,
                opacity: dim ? 0.4 : 1,
                transition: 'opacity 0.15s',
                cursor: 'default',
              }}
            />
          );
        })}
      </div>

      {/* Legend rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {PLANS.map((p) => {
          const pct = Math.round((p.count / totalCount) * 100);
          const dim = hover !== null && hover !== p.name;
          return (
            <div
              key={p.name}
              onMouseEnter={() => setHover(p.name)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                opacity: dim ? 0.5 : 1,
                transition: 'opacity 0.15s',
                cursor: 'default',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: C.textDim, flex: 1 }}>{p.name}</span>
              <span style={{ ...numStyle, fontSize: 12, fontWeight: 700, color: C.text }}>{p.count}</span>
              <span style={{ ...numStyle, fontSize: 10.5, color: C.textGhost, width: 30, textAlign: 'right' }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      <div style={{ height: 1, background: C.divider }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: C.textFaint }}>Total MRR from plans</span>
        <span style={{ ...numStyle, fontSize: 14, fontWeight: 700, color: C.success }}>
          ${totalMrr.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ─── Pool capacity strip ──────────────────────────────────────────────────--

function PoolStrip() {
  return (
    <div style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={eyebrow}>
        <Server size={11} strokeWidth={2.4} />
        Peer pool capacity
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {POOLS.map((p) => {
          const pct = Math.round((p.used / p.total) * 100);
          const col = poolColor(pct);
          return (
            <div key={p.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.textDim }}>{p.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...numStyle, fontSize: 10.5, color: C.textGhost }}>
                    {p.used.toLocaleString()} / {p.total.toLocaleString()}
                  </span>
                  <span style={{ ...numStyle, fontSize: 11.5, fontWeight: 700, color: col, width: 32, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 3,
                    background: col,
                    transition: 'width 0.6s cubic-bezier(0.34,1.2,0.64,1)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, paddingTop: 10, borderTop: `1px solid ${C.divider}` }}>
        {[
          { label: 'Healthy', color: C.success, range: '<65%' },
          { label: 'Elevated', color: C.warning, range: '65–79%' },
          { label: 'Critical', color: C.danger, range: '≥80%' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.textFaint }}>
              {l.label} {l.range}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────--

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Platform overview
        </div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 3 }}>
          Live across 1,107 workspaces · {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            borderRadius: 999,
            background: 'rgba(61,220,151,0.10)',
            border: '1px solid rgba(61,220,151,0.24)',
            fontSize: 11,
            fontWeight: 600,
            color: C.success,
          }}
        >
          <CheckCircle2 size={12} strokeWidth={2.4} />
          All systems operational
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.05)',
            border: C.glassBorder,
            fontSize: 11,
            fontWeight: 600,
            color: C.textDim,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
          beat alive · 41s ago
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────--

export function AdmDshE3Grid() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header />

      {/* KPI grid — 6 dense cells */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
          gap: 10,
        }}
      >
        {KPIS.map((k) => (
          <KpiCell key={k.key} kpi={k} />
        ))}
      </div>

      {/* Main split: chart + tabbed side panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)',
          gap: 14,
          alignItems: 'stretch',
        }}
      >
        <GrowthPanel />
        <SidePanel />
      </div>

      {/* Sortable table */}
      <WorkspacesTable />

      {/* Plan distribution + pool capacity strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        <PlanDistribution />
        <PoolStrip />
      </div>
    </div>
  );
}

export default AdmDshE3Grid;
