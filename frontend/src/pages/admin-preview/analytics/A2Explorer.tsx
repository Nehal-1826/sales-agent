/**
 * Admin Platform Analytics — Design Candidate A2: Trends Explorer
 *
 * A metric-selector-driven analytics view. A row of metric chips + range
 * toggle drives ONE big hero trend chart at centre stage. Right column holds a
 * contextual breakdown panel for the selected metric. Below: always-on secondary
 * tiles — plan distribution, warmth histogram, top workspaces.
 *
 * Self-contained: inline styles only, mock data only, no API / react-query /
 * feature / lib imports. Rendered inside the admin preview shell's dark canvas.
 */

import {
  useMemo,
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
  ReferenceLine,
} from 'recharts';
import {
  Mail,
  DollarSign,
  Users,
  Inbox,
  Flame,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Activity,
  ChevronDown,
} from 'lucide-react';

// ─── Design tokens ───────────────────────────────────────────────────────────

const T = {
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.38)',
  hairline: 'rgba(255,255,255,0.08)',
  accent: '#F26522',
  accentSoft: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',

  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,

  glassStrong: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 18,
  } as CSSProperties,

  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricId = 'sends' | 'signups' | 'revenue' | 'inbox' | 'warmth';
type RangeId = '7d' | '30d' | '90d';
type ValueKind = 'count' | 'currency' | 'percent';

interface SeriesPoint {
  label: string;
  v: number;
}

interface BreakdownRow {
  label: string;
  share: number;   // 0–100 for bar width
  detail: string;
  color: string;
}

interface MetricDef {
  id: MetricId;
  label: string;
  short: string;
  icon: typeof Mail;
  color: string;
  kind: ValueKind;
  unit?: string;     // prefix or suffix override
  upIsGood: boolean;
  caption: string;
  headline: Record<RangeId, { value: number; delta: number }>;
  series: Record<RangeId, SeriesPoint[]>;
  breakdownTitle: string;
  breakdown: BreakdownRow[];
  avgLine?: number;  // optional reference line on hero chart
}

// ─── Series helpers ───────────────────────────────────────────────────────────

function buildLabels(range: RangeId): string[] {
  if (range === '7d') {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }
  if (range === '30d') {
    // 10 labels evenly spanning May
    return ['May 1','May 4','May 7','May 10','May 13','May 16','May 19','May 22','May 25','May 28'];
  }
  // 90d → ~12 labels spanning Mar–May
  return ['Mar 1','Mar 9','Mar 17','Mar 25','Apr 2','Apr 10','Apr 18','Apr 26','May 4','May 12','May 20','May 28'];
}

function zip(labels: string[], values: number[]): SeriesPoint[] {
  return labels.map((label, i) => ({ label, v: values[i] ?? 0 }));
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const LABELS_7  = buildLabels('7d');
const LABELS_30 = buildLabels('30d');
const LABELS_90 = buildLabels('90d');

const METRICS: MetricDef[] = [
  {
    id: 'sends',
    label: 'Warmup Sends',
    short: 'Sends',
    icon: Mail,
    color: '#F26522',
    kind: 'count',
    upIsGood: true,
    caption: 'Total warmup emails delivered across the peer network.',
    avgLine: 68000,
    headline: {
      '7d':  { value: 71540, delta: 8.4 },
      '30d': { value: 1_924_700, delta: 12.1 },
      '90d': { value: 5_421_000, delta: 21.3 },
    },
    series: {
      '7d':  zip(LABELS_7,  [54200, 63800, 66500, 69200, 64900, 72100, 71540]),
      '30d': zip(LABELS_30, [42000, 51000, 55200, 58400, 61800, 65200, 67600, 70100, 69500, 71540]),
      '90d': zip(LABELS_90, [28000,34000,38500,43000,48000,51200,55000,59000,62800,65400,68800,71540]),
    },
    breakdownTitle: 'Sends by provider',
    breakdown: [
      { label: 'Gmail / Google', share: 46, detail: '32,908 sends', color: '#F26522' },
      { label: 'Outlook / O365', share: 31, detail: '22,177 sends', color: '#FF8A4B' },
      { label: 'Yahoo',          share: 14, detail: '10,016 sends', color: '#3ddc97' },
      { label: 'Generic SMTP',   share:  9, detail: '6,439 sends',  color: 'rgba(255,255,255,0.38)' },
    ],
  },
  {
    id: 'signups',
    label: 'New Signups',
    short: 'Signups',
    icon: Users,
    color: '#3ddc97',
    kind: 'count',
    upIsGood: true,
    caption: 'New workspaces completing onboarding in the selected window.',
    headline: {
      '7d':  { value: 47, delta: 16.2 },
      '30d': { value: 184, delta: 9.4 },
      '90d': { value: 512, delta: 28.6 },
    },
    series: {
      '7d':  zip(LABELS_7,  [4, 8, 6, 9, 7, 12, 47]),
      '30d': zip(LABELS_30, [8, 10, 14, 16, 18, 22, 20, 28, 24, 184]),
      '90d': zip(LABELS_90, [18,24,32,38,44,52,58,64,72,80,88,94]),
    },
    breakdownTitle: 'Signups by plan',
    breakdown: [
      { label: 'Starter',  share: 44, detail: '23 signups', color: 'rgba(255,255,255,0.38)' },
      { label: 'Pro',      share: 29, detail: '15 signups', color: '#3ddc97' },
      { label: 'Pro Plus', share: 18, detail: '9 signups',  color: '#FF8A4B' },
      { label: 'Agency',   share:  9, detail: '4 signups',  color: '#F26522' },
    ],
  },
  {
    id: 'revenue',
    label: 'Monthly Recurring Revenue',
    short: 'Revenue',
    icon: DollarSign,
    color: '#FF8A4B',
    kind: 'currency',
    upIsGood: true,
    caption: 'Normalised MRR across all active subscriptions.',
    headline: {
      '7d':  { value: 48250, delta: 4.1 },
      '30d': { value: 48250, delta: 8.2 },
      '90d': { value: 48250, delta: 18.4 },
    },
    series: {
      '7d':  zip(LABELS_7,  [46900, 47100, 47300, 47600, 47800, 48000, 48250]),
      '30d': zip(LABELS_30, [44200,44800,45300,45800,46200,46600,47000,47400,47900,48250]),
      '90d': zip(LABELS_90, [38000,39200,40500,41800,42900,43800,44600,45400,46300,47100,47700,48250]),
    },
    breakdownTitle: 'MRR by plan',
    breakdown: [
      { label: 'Agency',   share: 41, detail: '$19,782 / mo', color: '#F26522' },
      { label: 'Pro Plus', share: 28, detail: '$13,510 / mo', color: '#FF8A4B' },
      { label: 'Pro',      share: 22, detail: '$10,615 / mo', color: '#3ddc97' },
      { label: 'Starter',  share:  9, detail: '$4,343 / mo',  color: 'rgba(255,255,255,0.38)' },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox Placement',
    short: 'Inbox %',
    icon: Inbox,
    color: '#F26522',
    kind: 'percent',
    upIsGood: true,
    caption: 'Share of warmup mail landing in primary inbox (vs spam).',
    avgLine: 90,
    headline: {
      '7d':  { value: 92.4, delta: 1.8 },
      '30d': { value: 91.8, delta: 3.2 },
      '90d': { value: 90.2, delta: 5.1 },
    },
    series: {
      '7d':  zip(LABELS_7,  [91.0, 91.3, 91.8, 92.0, 92.2, 91.9, 92.4]),
      '30d': zip(LABELS_30, [88.1,88.6,89.2,89.0,90.1,90.6,91.0,91.3,91.8,91.9]),
      '90d': zip(LABELS_90, [85.2,86.0,86.8,87.4,88.1,88.8,89.4,89.9,90.4,91.0,91.5,92.1]),
    },
    breakdownTitle: 'Placement by provider',
    breakdown: [
      { label: 'Gmail / Google', share: 95, detail: '95.1% inbox', color: '#3ddc97' },
      { label: 'Yahoo',          share: 92, detail: '92.4% inbox', color: '#F26522' },
      { label: 'Outlook / O365', share: 89, detail: '88.7% inbox', color: '#FF8A4B' },
      { label: 'Generic SMTP',   share: 84, detail: '84.2% inbox', color: 'rgba(255,255,255,0.38)' },
    ],
  },
  {
    id: 'warmth',
    label: 'Avg Warmth Score',
    short: 'Warmth',
    icon: Flame,
    color: '#F26522',
    kind: 'percent',
    upIsGood: true,
    caption: 'Mean reputation warmth score across all active mailboxes (0–1).',
    avgLine: 0.8,
    headline: {
      '7d':  { value: 0.86, delta: 0.02 },
      '30d': { value: 0.84, delta: 0.05 },
      '90d': { value: 0.80, delta: 0.12 },
    },
    series: {
      '7d':  zip(LABELS_7,  [0.82, 0.83, 0.83, 0.84, 0.85, 0.86, 0.86]),
      '30d': zip(LABELS_30, [0.78,0.79,0.80,0.80,0.81,0.82,0.83,0.83,0.84,0.86]),
      '90d': zip(LABELS_90, [0.68,0.70,0.72,0.73,0.75,0.76,0.78,0.79,0.81,0.82,0.84,0.86]),
    },
    breakdownTitle: 'Warmth by plan',
    breakdown: [
      { label: 'Agency',   share: 92, detail: '0.92 avg',  color: '#F26522' },
      { label: 'Pro Plus', share: 88, detail: '0.88 avg',  color: '#FF8A4B' },
      { label: 'Pro',      share: 84, detail: '0.84 avg',  color: '#3ddc97' },
      { label: 'Starter',  share: 74, detail: '0.74 avg',  color: 'rgba(255,255,255,0.38)' },
    ],
  },
];

// ─── Always-on secondary tile data ───────────────────────────────────────────

interface PlanSlice { name: string; count: number; color: string; pct: number }
const PLAN_MIX: PlanSlice[] = [
  { name: 'Starter',  count: 540, color: 'rgba(255,255,255,0.28)', pct: 42 },
  { name: 'Pro',      count: 410, color: '#3ddc97',               pct: 32 },
  { name: 'Pro Plus', count: 220, color: '#FF8A4B',               pct: 17 },
  { name: 'Agency',   count: 114, color: '#F26522',               pct: 9  },
];

interface WarmthBucket { range: string; count: number }
const WARMTH_HIST: WarmthBucket[] = [
  { range: '0–0.3',  count: 18 },
  { range: '0.3–0.5',count: 42 },
  { range: '0.5–0.7',count: 124 },
  { range: '0.7–0.8',count: 218 },
  { range: '0.8–0.9',count: 524 },
  { range: '0.9–1.0',count: 358 },
];

interface WorkspaceRow {
  name: string;
  plan: string;
  sends: number;
  warmth: number;
  planColor: string;
}
const TOP_WORKSPACES: WorkspaceRow[] = [
  { name: 'TechCorp Global',   plan: 'Agency',   sends: 4820, warmth: 0.94, planColor: '#F26522' },
  { name: 'SalesBoost Inc',    plan: 'Pro Plus',  sends: 3640, warmth: 0.91, planColor: '#FF8A4B' },
  { name: 'GrowthHive Agency', plan: 'Agency',   sends: 3210, warmth: 0.89, planColor: '#F26522' },
  { name: 'OutreachPro LLC',   plan: 'Pro Plus',  sends: 2980, warmth: 0.88, planColor: '#FF8A4B' },
  { name: 'LaunchPath',        plan: 'Pro',       sends: 2450, warmth: 0.86, planColor: '#3ddc97' },
  { name: 'RampUp Digital',    plan: 'Pro',       sends: 2120, warmth: 0.84, planColor: '#3ddc97' },
];

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtValue(kind: ValueKind, raw: number): string {
  if (kind === 'currency') {
    if (raw >= 1_000_000) return `$${(raw / 1_000_000).toFixed(2)}M`;
    if (raw >= 1_000)     return `$${(raw / 1_000).toFixed(1)}k`;
    return `$${raw}`;
  }
  if (kind === 'percent') {
    return raw < 10 ? raw.toFixed(2) : `${raw.toFixed(1)}%`;
  }
  if (raw >= 1_000_000) return `${(raw / 1_000_000).toFixed(1)}M`;
  if (raw >= 1_000)     return `${(raw / 1_000).toFixed(1)}k`;
  return String(raw);
}

function fmtDelta(delta: number, upIsGood: boolean): { text: string; good: boolean } {
  const good = upIsGood ? delta >= 0 : delta <= 0;
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? '+' : '−';
  return { text: `${sign}${abs < 1 ? abs.toFixed(2) : abs.toFixed(1)}%`, good };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface GlassProps {
  children: ReactNode;
  style?: CSSProperties;
  strong?: boolean;
}
function Glass({ children, style, strong }: GlassProps) {
  return (
    <div style={{ ...( strong ? T.glassStrong : T.glass ), ...style }}>
      {children}
    </div>
  );
}

interface TileHeaderProps { label: string; icon?: typeof Mail }
function TileHeader({ label, icon: Icon }: TileHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      {Icon && <Icon size={12} color={T.dim} strokeWidth={2.2} />}
      <span style={T.micro}>{label}</span>
    </div>
  );
}

// Custom tooltip for Recharts
function HeroTooltip({ active, payload, label, metric }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: MetricDef;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value ?? 0;
  return (
    <div style={{
      background: 'rgba(20,20,20,0.92)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 10,
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: T.dim, marginBottom: 3 }}>{label}</div>
      <div style={{ color: metric.color, fontWeight: 700, fontSize: 15 }}>
        {fmtValue(metric.kind, v)}
      </div>
    </div>
  );
}

function BarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(20,20,20,0.92)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 11,
    }}>
      <div style={{ color: T.dim }}>{label}</div>
      <div style={{ color: '#fff', fontWeight: 700 }}>{payload[0]?.value}</div>
    </div>
  );
}

// ─── Breakdown panel (contextual) ─────────────────────────────────────────────

interface BreakdownPanelProps { metric: MetricDef }
function BreakdownPanel({ metric }: BreakdownPanelProps) {
  const max = Math.max(...metric.breakdown.map(r => r.share));
  return (
    <Glass style={{ padding: 20, flex: 1 }}>
      <TileHeader label={metric.breakdownTitle} icon={Activity} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {metric.breakdown.map((row) => (
          <div key={row.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: T.dim }}>{row.label}</span>
              <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{row.detail}</span>
            </div>
            <div style={{
              height: 5,
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 99,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(row.share / max) * 100}%`,
                background: row.color,
                borderRadius: 99,
                transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
              }} />
            </div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>{row.share}%</div>
          </div>
        ))}
      </div>
    </Glass>
  );
}

// ─── Plan mix tile ────────────────────────────────────────────────────────────

function PlanMixTile() {
  const total = PLAN_MIX.reduce((s, p) => s + p.count, 0);
  return (
    <Glass style={{ padding: 18 }}>
      <TileHeader label="Plan distribution" icon={Building2} />
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
        {PLAN_MIX.map((p) => (
          <div key={p.name} style={{ flex: p.pct, background: p.color, borderRadius: 99 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLAN_MIX.map((p) => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.dim }}>{p.name}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{p.count}</span>
              <span style={{ fontSize: 10, color: T.faint }}>{p.pct}%</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.hairline}` }}>
        <span style={{ ...T.micro }}>Total workspaces</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: T.text, marginLeft: 10 }}>{total.toLocaleString()}</span>
      </div>
    </Glass>
  );
}

// ─── Warmth histogram tile ────────────────────────────────────────────────────

function WarmthHistTile() {
  const HIST_COLORS = ['#ff5c7a','#FF8A4B','#FF8A4B','#F26522','#3ddc97','#3ddc97'];
  return (
    <Glass style={{ padding: 18 }}>
      <TileHeader label="Warmth distribution" icon={Flame} />
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={WARMTH_HIST} barCategoryGap="20%">
            <XAxis
              dataKey="range"
              tick={{ fontSize: 9, fill: T.faint }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<BarTooltip />} cursor={false} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {WARMTH_HIST.map((_, i) => (
                <Cell key={i} fill={HIST_COLORS[i] ?? '#F26522'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: T.faint }}>Cold</span>
        <span style={{ fontSize: 10, color: '#3ddc97', fontWeight: 600 }}>0.86 avg</span>
        <span style={{ fontSize: 10, color: T.faint }}>Hot</span>
      </div>
    </Glass>
  );
}

// ─── Top workspaces tile ──────────────────────────────────────────────────────

function TopWorkspacesTile() {
  return (
    <Glass style={{ padding: 18 }}>
      <TileHeader label="Top workspaces · today" icon={Building2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {TOP_WORKSPACES.map((ws, idx) => (
          <div key={ws.name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 0',
            borderBottom: idx < TOP_WORKSPACES.length - 1 ? `1px solid ${T.hairline}` : 'none',
          }}>
            <span style={{ fontSize: 10, color: T.faint, width: 14, textAlign: 'right', flexShrink: 0 }}>
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ws.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.09em',
                  color: ws.planColor,
                  textTransform: 'uppercase',
                }}>
                  {ws.plan}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{ws.sends.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: T.faint }}>sends</div>
            </div>
            <div style={{
              textAlign: 'right',
              flexShrink: 0,
              background: 'rgba(61,220,151,0.12)',
              borderRadius: 6,
              padding: '2px 6px',
            }}>
              <div style={{ fontSize: 11, color: '#3ddc97', fontWeight: 700 }}>{ws.warmth}</div>
            </div>
          </div>
        ))}
      </div>
    </Glass>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AdmAnaA2Explorer() {
  const [activeId, setActiveId]   = useState<MetricId>('sends');
  const [range, setRange]         = useState<RangeId>('30d');

  const metric = useMemo(
    () => METRICS.find(m => m.id === activeId) ?? METRICS[0]!,
    [activeId],
  );

  const heroSeries = useMemo(() => metric.series[range], [metric, range]);
  const hl         = useMemo(() => metric.headline[range], [metric, range]);
  const delta      = useMemo(() => fmtDelta(hl.delta, metric.upIsGood), [hl, metric]);

  // gradient id is unique per metric so recharts re-renders cleanly
  const gradId = `explorer-grad-${metric.id}`;

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      color: T.text,
      minHeight: '100vh',
      padding: '28px 32px 48px',
      boxSizing: 'border-box',
    }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={T.micro}>Admin · Platform analytics</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Trends Explorer
          </h1>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          ...T.glass,
          borderRadius: 10,
          fontSize: 12,
          color: T.dim,
          cursor: 'default',
        }}>
          <span>May 31, 2026</span>
          <ChevronDown size={12} strokeWidth={2.2} />
        </div>
      </div>

      {/* ── Metric chips + range toggle ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 22,
      }}>
        {/* Metric chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {METRICS.map((m) => {
            const Icon = m.icon;
            const active = m.id === activeId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveId(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 15px',
                  borderRadius: 99,
                  border: active
                    ? `1.5px solid ${m.color}`
                    : '1px solid rgba(255,255,255,0.10)',
                  background: active
                    ? `rgba(${hexToRgb(m.color)},0.15)`
                    : 'rgba(255,255,255,0.04)',
                  color: active ? m.color : T.dim,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.22s ease',
                  boxShadow: active ? `0 0 12px rgba(${hexToRgb(m.color)},0.25)` : 'none',
                }}
              >
                <Icon size={12} strokeWidth={2.2} />
                {m.short}
              </button>
            );
          })}
        </div>

        {/* Range toggle */}
        <div style={{
          display: 'flex',
          gap: 4,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10,
          padding: 4,
        }}>
          {(['7d', '30d', '90d'] as RangeId[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                padding: '5px 14px',
                borderRadius: 7,
                border: 'none',
                background: range === r ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: range === r ? T.text : T.dim,
                fontSize: 12,
                fontWeight: range === r ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content: hero + right column ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        gap: 16,
        marginBottom: 16,
      }}>

        {/* Hero card */}
        <Glass strong style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Headline */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={T.micro}>{metric.label} · {range}</div>
              <div style={{
                fontSize: 46,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: metric.color,
                lineHeight: 1,
                marginTop: 6,
                transition: 'color 0.3s ease',
              }}>
                {fmtValue(metric.kind, hl.value)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                {delta.good
                  ? <TrendingUp size={14} color={T.success} strokeWidth={2.2} />
                  : <TrendingDown size={14} color={T.danger} strokeWidth={2.2} />}
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: delta.good ? T.success : T.danger,
                }}>
                  {delta.text}
                </span>
                <span style={{ fontSize: 12, color: T.faint }}>vs prev {range}</span>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: delta.good ? 'rgba(61,220,151,0.12)' : 'rgba(255,92,122,0.12)',
              border: `1px solid ${delta.good ? 'rgba(61,220,151,0.25)' : 'rgba(255,92,122,0.25)'}`,
              borderRadius: 10,
              padding: '6px 12px',
              fontSize: 12,
              color: delta.good ? T.success : T.danger,
              fontWeight: 700,
            }}>
              {delta.good ? <ArrowUpRight size={14} strokeWidth={2.4} /> : <ArrowDownRight size={14} strokeWidth={2.4} />}
              {delta.text}
            </div>
          </div>

          {/* Caption */}
          <div style={{ fontSize: 12, color: T.dim, marginTop: -8 }}>{metric.caption}</div>

          {/* Hero chart */}
          <div style={{ height: 200, marginLeft: -12, marginRight: -12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={heroSeries} margin={{ top: 10, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: T.faint }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  content={(props) => (
                    <HeroTooltip
                      active={props.active}
                      payload={props.payload as Array<{ value: number }>}
                      label={props.label as string}
                      metric={metric}
                    />
                  )}
                  cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }}
                />
                {metric.avgLine !== undefined && (
                  <ReferenceLine
                    y={metric.avgLine}
                    stroke="rgba(255,255,255,0.20)"
                    strokeDasharray="4 4"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={metric.color}
                  strokeWidth={2.5}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 5, fill: metric.color, stroke: 'rgba(0,0,0,0.4)', strokeWidth: 2 }}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Glass>

        {/* Right column: contextual breakdown */}
        <BreakdownPanel metric={metric} />
      </div>

      {/* ── Secondary tiles row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 16,
      }}>
        <PlanMixTile />
        <WarmthHistTile />
        <TopWorkspacesTile />
      </div>
    </div>
  );
}

// ─── Utility: hex → "r,g,b" for rgba() ───────────────────────────────────────

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r},${g},${b}`;
}
