/**
 * Admin Dashboard Design Candidate: E4 Insight Spotlight
 *
 * "Insight Spotlight" — a focused, confident dashboard built around ONE big
 * switchable insight. A row of KPI chips drives a dominant hero panel (big
 * number + delta + large animated chart) for the selected metric, with a
 * supporting bento row below (contextual breakdown for the selected metric +
 * always-on tiles: plan mix, pool capacity, system status, recent activity).
 *
 * Fully self-contained: inline styles only, mock data only, no API / feature /
 * lib imports. Rendered inside the admin preview shell's dark canvas (:35001).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Mail,
  DollarSign,
  Users,
  Inbox,
  TrendingDown,
  TrendingUp,
  Database,
  Building2,
  Clock,
  Server,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';

// ─── Design tokens (inline) ─────────────────────────────────────────────────
const T = {
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  accent: '#F26522',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  hairline: 'rgba(255,255,255,0.08)',
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 18,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Metric model ────────────────────────────────────────────────────────────

type MetricId = 'sends' | 'revenue' | 'users' | 'inbox' | 'churn';
type ValueKind = 'currency' | 'count' | 'percent';

interface BreakdownRow {
  label: string;
  value: number; // share 0..100 for the contextual bar
  detail: string; // human-readable secondary text
  color: string;
}

interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  icon: typeof Mail;
  /** spotlight accent — warm/neutral only */
  color: string;
  kind: ValueKind;
  /** hero headline numeric value (raw) */
  value: number;
  /** delta percent; positive = up */
  delta: number;
  /** for churn, "up" is bad — flip the good/bad coloring */
  upIsGood: boolean;
  caption: string;
  series: Array<{ day: string; v: number }>;
  /** contextual breakdown shown in the first bento tile */
  breakdownTitle: string;
  breakdown: BreakdownRow[];
}

// 14-day x-axis labels shared by all series
const DAYS = [
  'May 18', 'May 19', 'May 20', 'May 21', 'May 22', 'May 23', 'May 24',
  'May 25', 'May 26', 'May 27', 'May 28', 'May 29', 'May 30', 'May 31',
];

function series(values: number[]): Array<{ day: string; v: number }> {
  return values.map((v, i) => ({ day: DAYS[i] ?? `d${i}`, v }));
}

const METRICS: MetricDef[] = [
  {
    id: 'sends',
    label: 'Warmup Sends',
    short: 'Sends',
    icon: Mail,
    color: '#F26522',
    kind: 'count',
    value: 71540,
    delta: 8.4,
    upIsGood: true,
    caption: 'Total warmup emails delivered across the peer network today.',
    series: series([
      54200, 57800, 53100, 61400, 59700, 48300, 52100,
      63800, 66500, 69200, 64900, 72100, 68800, 71540,
    ]),
    breakdownTitle: 'Sends by provider',
    breakdown: [
      { label: 'Gmail / Google', value: 46, detail: '32,908 sends', color: '#F26522' },
      { label: 'Outlook / O365', value: 31, detail: '22,177 sends', color: '#FF8A4B' },
      { label: 'Yahoo', value: 14, detail: '10,016 sends', color: '#3ddc97' },
      { label: 'Generic SMTP', value: 9, detail: '6,439 sends', color: 'rgba(255,255,255,0.40)' },
    ],
  },
  {
    id: 'revenue',
    label: 'Monthly Recurring Revenue',
    short: 'Revenue',
    icon: DollarSign,
    color: '#FF8A4B',
    kind: 'currency',
    value: 48250,
    delta: 4.1,
    upIsGood: true,
    caption: 'Normalised MRR across all active subscriptions.',
    series: series([
      42100, 42600, 43500, 43800, 44200, 45100, 45800,
      46100, 46300, 46900, 47100, 47600, 47900, 48250,
    ]),
    breakdownTitle: 'MRR by plan',
    breakdown: [
      { label: 'Agency', value: 41, detail: '$19,782 / mo', color: '#F26522' },
      { label: 'Pro Plus', value: 28, detail: '$13,510 / mo', color: '#FF8A4B' },
      { label: 'Pro', value: 22, detail: '$10,615 / mo', color: '#3ddc97' },
      { label: 'Starter', value: 9, detail: '$4,343 / mo', color: 'rgba(255,255,255,0.40)' },
    ],
  },
  {
    id: 'users',
    label: 'Total Users',
    short: 'Users',
    icon: Users,
    color: '#3ddc97',
    kind: 'count',
    value: 1284,
    delta: 6.6,
    upIsGood: true,
    caption: 'Registered workspaces with at least one active seat.',
    series: series([
      1140, 1149, 1158, 1170, 1182, 1195, 1208,
      1221, 1234, 1248, 1259, 1268, 1276, 1284,
    ]),
    breakdownTitle: 'Users by lifecycle',
    breakdown: [
      { label: 'Active', value: 78, detail: '1,002 workspaces', color: '#3ddc97' },
      { label: 'Trialing', value: 13, detail: '167 workspaces', color: '#FF8A4B' },
      { label: 'Onboarding', value: 6, detail: '77 workspaces', color: '#F26522' },
      { label: 'Dormant', value: 3, detail: '38 workspaces', color: 'rgba(255,255,255,0.40)' },
    ],
  },
  {
    id: 'inbox',
    label: 'Avg Inbox Placement',
    short: 'Inbox %',
    icon: Inbox,
    color: '#F26522',
    kind: 'percent',
    value: 92.4,
    delta: 1.8,
    upIsGood: true,
    caption: 'Share of warmup mail landing in the primary inbox (vs spam).',
    series: series([
      88.1, 88.6, 89.2, 89.0, 90.1, 90.6, 91.0,
      91.3, 91.1, 91.8, 92.0, 92.2, 92.1, 92.4,
    ]),
    breakdownTitle: 'Placement by provider',
    breakdown: [
      { label: 'Gmail / Google', value: 95, detail: '95.1% inbox', color: '#3ddc97' },
      { label: 'Yahoo', value: 92, detail: '92.4% inbox', color: '#F26522' },
      { label: 'Outlook / O365', value: 89, detail: '88.7% inbox', color: '#FF8A4B' },
      { label: 'Generic SMTP', value: 84, detail: '84.2% inbox', color: 'rgba(255,255,255,0.40)' },
    ],
  },
  {
    id: 'churn',
    label: 'Monthly Churn',
    short: 'Churn',
    icon: TrendingDown,
    color: '#ff5c7a',
    kind: 'percent',
    value: 2.3,
    delta: -0.6,
    upIsGood: false,
    caption: 'Logo churn over the trailing 30 days. Lower is better.',
    series: series([
      3.4, 3.3, 3.1, 3.0, 2.9, 2.9, 2.8,
      2.7, 2.6, 2.6, 2.5, 2.4, 2.4, 2.3,
    ]),
    breakdownTitle: 'Churn by plan',
    breakdown: [
      { label: 'Starter', value: 64, detail: '4.1% churn', color: '#ff5c7a' },
      { label: 'Pro', value: 28, detail: '1.9% churn', color: '#FF8A4B' },
      { label: 'Pro Plus', value: 6, detail: '0.8% churn', color: '#F26522' },
      { label: 'Agency', value: 2, detail: '0.3% churn', color: '#3ddc97' },
    ],
  },
];

// ─── Always-on tile data ──────────────────────────────────────────────────────

interface PlanSlice {
  name: string;
  count: number;
  color: string;
}
const PLAN_MIX: PlanSlice[] = [
  { name: 'Starter', count: 540, color: 'rgba(255,255,255,0.30)' },
  { name: 'Pro', count: 410, color: '#3ddc97' },
  { name: 'Pro Plus', count: 220, color: '#FF8A4B' },
  { name: 'Agency', count: 114, color: '#F26522' },
];
const PLAN_TOTAL = PLAN_MIX.reduce((s, p) => s + p.count, 0);

interface PoolRow {
  name: string;
  used: number;
  cap: number;
}
const POOLS: PoolRow[] = [
  { name: 'Gmail peer pool', used: 412, cap: 500 },
  { name: 'O365 peer pool', used: 389, cap: 480 },
  { name: 'Yahoo peer pool', used: 168, cap: 260 },
  { name: 'Default / mixed', used: 96, cap: 200 },
];

interface SystemRow {
  label: string;
  status: 'ok' | 'warn' | 'down';
  detail: string;
}
const SYSTEM: SystemRow[] = [
  { label: 'API', status: 'ok', detail: '142 ms p95' },
  { label: 'Celery beat', status: 'ok', detail: 'alive 38s ago' },
  { label: 'SMTP queue', status: 'ok', detail: '12 jobs' },
  { label: 'Postgres', status: 'ok', detail: '24% load' },
  { label: 'Peer reputation', status: 'warn', detail: '2 peers low' },
];

interface ActivityItem {
  label: string;
  sub: string;
  tone: string;
  ts: string;
}
const ACTIVITY: ActivityItem[] = [
  { label: 'New Agency signup', sub: 'Northwind Inc.', tone: '#3ddc97', ts: '2m ago' },
  { label: 'Pro Plus upgrade', sub: 'acme-ventures.io', tone: '#F26522', ts: '11m ago' },
  { label: 'Mailbox warmed to 90%', sub: 'lumen.co · Day 28', tone: '#FF8A4B', ts: '18m ago' },
  { label: 'Peer reputation drop', sub: 'yahoo-peer-07 → 0.31', tone: '#ff5c7a', ts: '34m ago' },
  { label: 'Daily rollup complete', sub: '1,284 mailboxes logged', tone: 'rgba(255,255,255,0.42)', ts: '2h ago' },
];

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmt(value: number, kind: ValueKind, decimals = 0): string {
  if (kind === 'currency') {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
  if (kind === 'percent') {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Animated headline value ───────────────────────────────────────────────────
// Re-runs from the previously-shown number to the new target whenever `to`
// changes, so switching metrics animates smoothly (not just on mount).
function AnimatedValue({
  to,
  kind,
  dur = 0.7,
}: {
  to: number;
  kind: ValueKind;
  dur?: number;
}) {
  const [n, setN] = useState(to);
  const fromRef = useRef(to);
  const rafRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (dur * 1000));
      const e = 1 - Math.pow(1 - p, 3);
      setN(from + (to - from) * e);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, dur]);

  const decimals = kind === 'percent' ? 1 : 0;
  return <>{fmt(n, kind, decimals)}</>;
}

// ─── Glass tile ────────────────────────────────────────────────────────────────
function Tile({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        ...T.glass,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function MicroLabel({ children }: { children: ReactNode }) {
  return <div style={T.micro}>{children}</div>;
}

// ─── Hero chart tooltip ──────────────────────────────────────────────────────
function HeroTooltip({
  active,
  payload,
  label,
  kind,
  unit,
  color,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  kind: ValueKind;
  unit: string;
  color: string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(18,18,24,0.94)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: T.dim, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: 5 }}>
        {fmt(raw, kind, kind === 'percent' ? 1 : 0)}
        <span style={{ color: T.faint, fontWeight: 500, fontSize: 11 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── KPI chip (spotlight switcher) ───────────────────────────────────────────
function MetricChip({
  m,
  selected,
  onSelect,
}: {
  m: MetricDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const Icon = m.icon;
  const good = m.delta >= 0 === m.upIsGood;
  const deltaColor = good ? T.success : T.danger;
  const DeltaIcon = m.delta >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={selected}
      style={{
        appearance: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        flex: '1 1 150px',
        minWidth: 140,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '13px 15px',
        borderRadius: 14,
        background: selected
          ? `linear-gradient(135deg, ${m.color}26, rgba(255,255,255,0.04))`
          : hover
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(255,255,255,0.04)',
        border: selected
          ? `1px solid ${m.color}`
          : '1px solid rgba(255,255,255,0.10)',
        boxShadow: selected ? `0 0 0 1px ${m.color}55, 0 10px 30px ${m.color}1f` : 'none',
        transform: selected ? 'translateY(-2px)' : hover ? 'translateY(-1px)' : 'none',
        transition: 'all 0.22s cubic-bezier(0.22,1,0.36,1)',
        color: T.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 8,
            background: selected ? m.color : `${m.color}22`,
            color: selected ? '#15110d' : m.color,
            transition: 'all 0.22s ease',
          }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            fontSize: 11,
            fontWeight: 700,
            color: deltaColor,
          }}
        >
          <DeltaIcon size={12} />
          {Math.abs(m.delta).toFixed(1)}%
        </span>
      </div>
      <div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: selected ? 'rgba(255,255,255,0.7)' : T.faint,
          }}
        >
          {m.short}
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmt(m.value, m.kind, m.kind === 'percent' ? 1 : 0)}
        </div>
      </div>
    </button>
  );
}

// ─── Status dot ────────────────────────────────────────────────────────────────
function statusColor(s: SystemRow['status']): string {
  if (s === 'ok') return T.success;
  if (s === 'warn') return T.warning;
  return T.danger;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AdmDshE4Spotlight() {
  const [selectedId, setSelectedId] = useState<MetricId>('sends');
  const selected = useMemo(
    () => METRICS.find((m) => m.id === selectedId) ?? METRICS[0]!,
    [selectedId],
  );

  // Re-key the chart on metric change to retrigger recharts' enter animation.
  const chartKey = selectedId;

  const good = selected.delta >= 0 === selected.upIsGood;
  const deltaColor = good ? T.success : T.danger;
  const DeltaIcon = selected.delta >= 0 ? TrendingUp : TrendingDown;
  const unit =
    selected.kind === 'currency'
      ? '/ mo'
      : selected.id === 'sends'
        ? 'sends'
        : selected.id === 'users'
          ? 'users'
          : '';

  const gradId = `hero-fill-${selected.id}`;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 4px 36px',
        color: T.text,
        fontFamily: 'inherit',
      }}
    >
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Sparkles size={15} strokeWidth={2.4} style={{ color: T.accent }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.accent,
            }}
          >
            Admin · Insight Spotlight
          </span>
        </div>
        <h1
          style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Platform overview
        </h1>
        <p style={{ fontSize: 13, color: T.dim, marginTop: 5 }}>
          Pick a metric to spotlight — the hero and its breakdown update live · 31 May 2026
        </p>
      </div>

      {/* ── KPI chip selector ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {METRICS.map((m) => (
          <MetricChip
            key={m.id}
            m={m}
            selected={m.id === selectedId}
            onSelect={() => setSelectedId(m.id)}
          />
        ))}
      </div>

      {/* ── HERO spotlight panel ─────────────────────────────────────────── */}
      <Tile
        style={{
          minHeight: 320,
          padding: 26,
          marginBottom: 14,
          borderColor: `${selected.color}40`,
          background: `linear-gradient(160deg, ${selected.color}14, rgba(255,255,255,0.04) 42%)`,
          transition: 'border-color 0.4s ease, background 0.4s ease',
        }}
      >
        {/* Ambient glow keyed to the selected accent */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -90,
            right: -70,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${selected.color}33 0%, transparent 68%)`,
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
            position: 'relative',
          }}
        >
          <div style={{ minWidth: 220 }}>
            <MicroLabel>
              <selected.icon size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: -1 }} />
              {selected.label} · last 14 days
            </MicroLabel>
            <div
              key={`val-${selected.id}`}
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: '-0.035em',
                lineHeight: 1.02,
                marginTop: 10,
                fontVariantNumeric: 'tabular-nums',
                background: `linear-gradient(180deg, #fff, ${selected.color})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: T.text,
              }}
            >
              <AnimatedValue to={selected.value} kind={selected.kind} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: good ? 'rgba(61,220,151,0.12)' : 'rgba(255,92,122,0.12)',
                  border: `1px solid ${good ? 'rgba(61,220,151,0.30)' : 'rgba(255,92,122,0.30)'}`,
                  borderRadius: 999,
                  padding: '4px 11px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: deltaColor,
                }}
              >
                <DeltaIcon size={13} />
                {selected.delta >= 0 ? '+' : ''}
                {selected.delta.toFixed(1)}%
              </span>
              <span style={{ fontSize: 12.5, color: T.dim }}>vs previous 14 days</span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: T.dim,
                marginTop: 14,
                maxWidth: 340,
                lineHeight: 1.5,
              }}
            >
              {selected.caption}
            </p>
          </div>

          {/* Quick stat rail */}
          <div
            style={{
              display: 'flex',
              gap: 22,
              flexWrap: 'wrap',
              alignSelf: 'flex-start',
            }}
          >
            {[
              { k: 'Peak', v: fmt(Math.max(...selected.series.map((d) => d.v)), selected.kind, selected.kind === 'percent' ? 1 : 0) },
              { k: 'Low', v: fmt(Math.min(...selected.series.map((d) => d.v)), selected.kind, selected.kind === 'percent' ? 1 : 0) },
              {
                k: 'Avg',
                v: fmt(
                  selected.series.reduce((s, d) => s + d.v, 0) / selected.series.length,
                  selected.kind,
                  selected.kind === 'percent' ? 1 : 0,
                ),
              },
            ].map((stat) => (
              <div key={stat.k} style={{ textAlign: 'right' }}>
                <div style={{ ...T.micro, fontSize: 9 }}>{stat.k}</div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: T.text,
                    marginTop: 4,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {stat.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero chart */}
        <div style={{ flex: 1, minHeight: 150, marginTop: 8, position: 'relative' }}>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart
              key={chartKey}
              data={selected.series}
              margin={{ top: 8, right: 6, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={selected.color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={selected.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.38)' }}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                width={54}
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.38)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  selected.kind === 'currency'
                    ? `$${Math.round(v / 1000)}k`
                    : selected.kind === 'percent'
                      ? `${Math.round(v)}%`
                      : v >= 1000
                        ? `${Math.round(v / 1000)}k`
                        : `${v}`
                }
                domain={['auto', 'auto']}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                content={
                  <HeroTooltip kind={selected.kind} unit={unit} color={selected.color} />
                }
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={selected.color}
                strokeWidth={2.4}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 5, fill: selected.color, stroke: '#fff', strokeWidth: 1.6 }}
                isAnimationActive
                animationDuration={650}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      {/* ── Supporting bento row ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gap: 14,
        }}
      >
        {/* Contextual breakdown for the selected metric (reacts to switcher) */}
        <Tile style={{ gridColumn: 'span 5', minHeight: 230 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <selected.icon size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              {selected.breakdownTitle}
            </MicroLabel>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: selected.color,
                background: `${selected.color}1f`,
                border: `1px solid ${selected.color}40`,
                borderRadius: 999,
                padding: '3px 8px',
              }}
            >
              {selected.short}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {selected.breakdown.map((row) => (
              <div key={`${selected.id}-${row.label}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                    {row.detail}
                  </span>
                </div>
                <div
                  style={{
                    height: 7,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.07)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${row.value}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`,
                      transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Tile>

        {/* Plan mix (always-on) */}
        <Tile style={{ gridColumn: 'span 4', minHeight: 230 }}>
          <MicroLabel>
            <Building2 size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
            Plan distribution · {PLAN_TOTAL.toLocaleString()} accounts
          </MicroLabel>
          {/* mini bar chart */}
          <div style={{ flex: 1, minHeight: 0, marginTop: 2 }}>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={PLAN_MIX} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.38)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div
                        style={{
                          background: 'rgba(18,18,24,0.94)',
                          border: '1px solid rgba(255,255,255,0.14)',
                          borderRadius: 9,
                          padding: '6px 10px',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ color: T.dim }}>{label}: </span>
                        <span style={{ color: T.text, fontWeight: 700 }}>
                          {(payload[0]?.value as number)?.toLocaleString()}
                        </span>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={34}>
                  {PLAN_MIX.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {PLAN_MIX.map((p) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                <span style={{ color: T.dim }}>{p.name}</span>
                <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        </Tile>

        {/* System status (always-on) */}
        <Tile style={{ gridColumn: 'span 3', minHeight: 230 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Server size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              System status
            </MicroLabel>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: T.success,
              }}
            >
              <CheckCircle2 size={11} />
              healthy
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 2 }}>
            {SYSTEM.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8.5px 0',
                  borderBottom: i < SYSTEM.length - 1 ? `1px solid ${T.hairline}` : 'none',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: statusColor(row.status),
                    boxShadow: `0 0 6px ${statusColor(row.status)}88`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12.5, color: T.text, flex: 1, fontWeight: 500 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 11, color: T.faint, whiteSpace: 'nowrap' }}>{row.detail}</span>
              </div>
            ))}
          </div>
        </Tile>

        {/* Peer pool capacity (always-on) */}
        <Tile style={{ gridColumn: 'span 7', minHeight: 190 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Database size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Peer pool capacity
            </MicroLabel>
            <span style={{ fontSize: 11.5, color: T.dim }}>
              {POOLS.reduce((s, p) => s + p.used, 0).toLocaleString()} /{' '}
              {POOLS.reduce((s, p) => s + p.cap, 0).toLocaleString()} inboxes
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
            {POOLS.map((p) => {
              const pct = Math.round((p.used / p.cap) * 100);
              const tone = pct >= 90 ? T.danger : pct >= 80 ? T.warning : T.accent;
              return (
                <div key={p.name}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: T.text, fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontSize: 11.5, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                      {p.used}/{p.cap} · {pct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.07)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${tone}, ${tone}bb)`,
                        transition: 'width 0.8s ease-out',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Tile>

        {/* Recent activity (always-on) */}
        <Tile style={{ gridColumn: 'span 5', minHeight: 190 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>
              <Clock size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
              Recent activity
            </MicroLabel>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: T.success,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: T.success,
                  boxShadow: `0 0 6px ${T.success}`,
                }}
              />
              live
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {ACTIVITY.map((item, i) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: i < ACTIVITY.length - 1 ? `1px solid ${T.hairline}` : 'none',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: item.tone,
                    flexShrink: 0,
                    marginTop: 4,
                    boxShadow:
                      item.tone !== 'rgba(255,255,255,0.42)' ? `0 0 5px ${item.tone}70` : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: T.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{item.sub}</div>
                </div>
                <div style={{ fontSize: 10, color: T.faint, whiteSpace: 'nowrap', marginTop: 2 }}>
                  {item.ts}
                </div>
              </div>
            ))}
          </div>
        </Tile>
      </div>

      {/* footer note */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          fontSize: 11.5,
          color: T.faint,
        }}
      >
        <Activity size={12} style={{ color: T.accent }} />
        Live snapshot · auto-refreshes every 60s ·
        <AlertTriangle size={12} style={{ color: T.warning, marginLeft: 2 }} />
        2 peer inboxes below reputation floor
      </div>
    </div>
  );
}

export default AdmDshE4Spotlight;
