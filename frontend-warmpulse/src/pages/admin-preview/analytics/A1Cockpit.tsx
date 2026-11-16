/**
 * Admin Platform Analytics Design Candidate: A1 Analytics Cockpit
 *
 * "Analytics Cockpit" — a mission-control analytics view with a top control/KPI
 * bar (time-range toggle + 5 KPI chips with deltas), then a dense responsive
 * grid of glass chart cards: multi-series trend (sends + signups), plan-mix
 * donut, warmth-distribution histogram, deliverability line, and a top-workspaces
 * table. Warm Aurora Glass aesthetic; recharts tooltips throughout.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 */

import { useState } from 'react';
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
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  type TooltipProps,
} from 'recharts';
import {
  Mail,
  Users,
  CreditCard,
  Gauge,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Building2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Palette — warm + neutral only. NO blue/purple/violet/teal/cyan/indigo/pink.
// ---------------------------------------------------------------------------

const C = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.42)',
  ghost: 'rgba(255,255,255,0.22)',
  accent: '#F26522',
  accent2: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  glass: 'rgba(255,255,255,0.05)',
  glass2: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.07)',
} as const;

const GLASS: React.CSSProperties = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

const GLASS_INNER: React.CSSProperties = {
  background: C.glass2,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius: 12,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeId = '7d' | '30d' | '90d';

interface TrendPoint {
  label: string;
  sends: number;
  signups: number;
  mrr: number;
  inbox: number;
}

interface WarmthBin {
  range: string;
  count: number;
}

interface WorkspaceRow {
  rank: number;
  name: string;
  plan: 'Trial' | 'Starter' | 'Growth' | 'Scale';
  sends: number;
  warmth: number;
  status: 'healthy' | 'warn' | 'risk';
}

// ---------------------------------------------------------------------------
// Mock data — per range
// ---------------------------------------------------------------------------

const TREND_7D: TrendPoint[] = [
  { label: 'Mon', sends: 48200, signups: 14, mrr: 23400, inbox: 86 },
  { label: 'Tue', sends: 51800, signups: 18, mrr: 23600, inbox: 87 },
  { label: 'Wed', sends: 49600, signups: 12, mrr: 23700, inbox: 85 },
  { label: 'Thu', sends: 54100, signups: 20, mrr: 23900, inbox: 88 },
  { label: 'Fri', sends: 57300, signups: 22, mrr: 24100, inbox: 89 },
  { label: 'Sat', sends: 43200, signups: 8,  mrr: 24100, inbox: 88 },
  { label: 'Sun', sends: 38400, signups: 6,  mrr: 24100, inbox: 87 },
];

const TREND_30D: TrendPoint[] = [
  { label: 'Apr 1',  sends: 32000, signups: 8,  mrr: 21800, inbox: 82 },
  { label: 'Apr 6',  sends: 36200, signups: 12, mrr: 22100, inbox: 83 },
  { label: 'Apr 11', sends: 38900, signups: 15, mrr: 22400, inbox: 84 },
  { label: 'Apr 16', sends: 41200, signups: 18, mrr: 22800, inbox: 85 },
  { label: 'Apr 21', sends: 43800, signups: 14, mrr: 23100, inbox: 85 },
  { label: 'Apr 26', sends: 46200, signups: 21, mrr: 23500, inbox: 86 },
  { label: 'May 1',  sends: 48700, signups: 19, mrr: 23800, inbox: 87 },
  { label: 'May 6',  sends: 51200, signups: 24, mrr: 24100, inbox: 88 },
  { label: 'May 11', sends: 53800, signups: 22, mrr: 24100, inbox: 89 },
  { label: 'May 16', sends: 55600, signups: 28, mrr: 24100, inbox: 89 },
];

const TREND_90D: TrendPoint[] = [
  { label: 'Mar 1',  sends: 18200, signups: 6,  mrr: 19200, inbox: 78 },
  { label: 'Mar 10', sends: 22100, signups: 9,  mrr: 19800, inbox: 79 },
  { label: 'Mar 20', sends: 26400, signups: 12, mrr: 20400, inbox: 80 },
  { label: 'Apr 1',  sends: 30800, signups: 14, mrr: 21000, inbox: 81 },
  { label: 'Apr 10', sends: 35200, signups: 18, mrr: 21600, inbox: 82 },
  { label: 'Apr 20', sends: 39600, signups: 16, mrr: 22200, inbox: 83 },
  { label: 'May 1',  sends: 44100, signups: 20, mrr: 22800, inbox: 85 },
  { label: 'May 10', sends: 48600, signups: 24, mrr: 23400, inbox: 86 },
  { label: 'May 20', sends: 53200, signups: 26, mrr: 23800, inbox: 88 },
  { label: 'May 31', sends: 57800, signups: 34, mrr: 24100, inbox: 89 },
];

const TREND_BY_RANGE: Record<RangeId, TrendPoint[]> = {
  '7d': TREND_7D,
  '30d': TREND_30D,
  '90d': TREND_90D,
};

interface KpiDef {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  sub: string;
  icon: typeof Users;
}

const KPI_BY_RANGE: Record<RangeId, KpiDef[]> = {
  '7d': [
    { label: 'Total Sends',    value: '342,600', delta: '+18%',  positive: true,  sub: 'vs prev 7d',   icon: Mail       },
    { label: 'New Signups',    value: '100',     delta: '+23%',  positive: true,  sub: 'vs prev 7d',   icon: Users      },
    { label: 'MRR',            value: '$24,100', delta: '+6.4%', positive: true,  sub: 'vs prev 7d',   icon: CreditCard },
    { label: 'Inbox Rate',     value: '88.4%',   delta: '+2.1pp',positive: true,  sub: 'vs prev 7d',   icon: Gauge      },
    { label: 'Avg Warmth',     value: '0.87',    delta: '+0.03', positive: true,  sub: 'vs prev 7d',   icon: Activity   },
  ],
  '30d': [
    { label: 'Total Sends',    value: '1.38M',   delta: '+21%',  positive: true,  sub: 'vs prev 30d',  icon: Mail       },
    { label: 'New Signups',    value: '142',     delta: '+31%',  positive: true,  sub: 'vs prev 30d',  icon: Users      },
    { label: 'MRR',            value: '$24,100', delta: '+9.1%', positive: true,  sub: 'vs prev 30d',  icon: CreditCard },
    { label: 'Inbox Rate',     value: '87.8%',   delta: '+4.2pp',positive: true,  sub: 'vs prev 30d',  icon: Gauge      },
    { label: 'Avg Warmth',     value: '0.85',    delta: '+0.07', positive: true,  sub: 'vs prev 30d',  icon: Activity   },
  ],
  '90d': [
    { label: 'Total Sends',    value: '3.82M',   delta: '+44%',  positive: true,  sub: 'vs prev 90d',  icon: Mail       },
    { label: 'New Signups',    value: '398',     delta: '+62%',  positive: true,  sub: 'vs prev 90d',  icon: Users      },
    { label: 'MRR',            value: '$24,100', delta: '+25%',  positive: true,  sub: 'vs prev 90d',  icon: CreditCard },
    { label: 'Inbox Rate',     value: '87.1%',   delta: '+9.4pp',positive: true,  sub: 'vs prev 90d',  icon: Gauge      },
    { label: 'Avg Warmth',     value: '0.82',    delta: '+0.18', positive: true,  sub: 'vs prev 90d',  icon: Activity   },
  ],
};

const PLAN_MIX = [
  { name: 'Growth',  value: 44, color: '#FF8A4B' },
  { name: 'Starter', value: 24, color: '#c2a46e' },
  { name: 'Scale',   value: 22, color: '#F26522' },
  { name: 'Trial',   value: 10, color: 'rgba(255,255,255,0.30)' },
];

const WARMTH_BINS: WarmthBin[] = [
  { range: '0–0.1', count: 8  },
  { range: '0.1–0.2', count: 14 },
  { range: '0.2–0.3', count: 22 },
  { range: '0.3–0.4', count: 38 },
  { range: '0.4–0.5', count: 62 },
  { range: '0.5–0.6', count: 84 },
  { range: '0.6–0.7', count: 98 },
  { range: '0.7–0.8', count: 104 },
  { range: '0.8–0.9', count: 87 },
  { range: '0.9–1.0', count: 56 },
];

const TOP_WORKSPACES: WorkspaceRow[] = [
  { rank: 1, name: 'Acme Corp',      plan: 'Scale',   sends: 48200, warmth: 0.94, status: 'healthy' },
  { rank: 2, name: 'Beacon Labs',    plan: 'Growth',  sends: 36800, warmth: 0.91, status: 'healthy' },
  { rank: 3, name: 'Northwind Co',   plan: 'Scale',   sends: 32100, warmth: 0.88, status: 'healthy' },
  { rank: 4, name: 'Orbit Systems',  plan: 'Growth',  sends: 29400, warmth: 0.82, status: 'warn'    },
  { rank: 5, name: 'Hibou Media',    plan: 'Growth',  sends: 24600, warmth: 0.79, status: 'healthy' },
  { rank: 6, name: 'Vanta Digital',  plan: 'Starter', sends: 18900, warmth: 0.64, status: 'warn'    },
  { rank: 7, name: 'Springboard',    plan: 'Growth',  sends: 16200, warmth: 0.58, status: 'risk'    },
];

const PLAN_COLORS: Record<string, string> = {
  Trial:   'rgba(255,255,255,0.30)',
  Starter: '#c2a46e',
  Growth:  '#FF8A4B',
  Scale:   '#F26522',
};

// ---------------------------------------------------------------------------
// Tooltip helpers
// ---------------------------------------------------------------------------

type CustomTooltipProps = TooltipProps<number, string>;

function GlassTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      ...GLASS_INNER,
      padding: '10px 14px',
      fontSize: 12,
      minWidth: 130,
      boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    }}>
      {label && (
        <div style={{ color: C.dim, marginBottom: 6, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em' }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={entry.name ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: entry.color, fontSize: 11 }}>{entry.name}</span>
          <span style={{ color: C.text, fontWeight: 700 }}>
            {typeof entry.value === 'number' && entry.value > 999
              ? entry.value.toLocaleString()
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; payload: { name: string; value: number; color: string } }[];
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  if (!d) return null;
  return (
    <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
      <span style={{ color: d.payload.color, fontWeight: 700 }}>{d.payload.name}</span>
      <span style={{ color: C.dim, marginLeft: 8 }}>{d.payload.value}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  pill?: string;
  pillColor?: string;
}

function SectionHeader({ title, icon, pill, pillColor }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ color: C.accent, opacity: 0.8, display: 'flex' }}>{icon}</span>}
        <span style={{ color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {pill && (
        <span style={{
          background: (pillColor ?? C.accent) + '22',
          color: pillColor ?? C.accent,
          border: `1px solid ${(pillColor ?? C.accent)}44`,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
        }}>
          {pill}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdmAnaA1Cockpit() {
  const [range, setRange] = useState<RangeId>('30d');

  const trend = TREND_BY_RANGE[range];
  const kpis = KPI_BY_RANGE[range];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px 28px 40px',
      boxSizing: 'border-box',
    }}>

      {/* ── TOP CONTROL BAR ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Admin · Platform Analytics
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: C.text }}>
            Analytics Cockpit
          </h1>
        </div>

        {/* Time-range toggle */}
        <div style={{
          display: 'flex',
          background: C.glass,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}>
          {(['7d', '30d', '90d'] as RangeId[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                background: range === r
                  ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})`
                  : 'transparent',
                color: range === r ? '#fff' : C.dim,
                border: 'none',
                borderRadius: 7,
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                letterSpacing: '0.02em',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI CHIPS BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={{
              ...GLASS,
              padding: '14px 16px',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              transition: 'background 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: C.faint, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  {k.label}
                </span>
                <Icon size={13} style={{ color: C.accent, opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {k.positive
                  ? <ArrowUpRight size={11} style={{ color: C.success }} />
                  : <ArrowDownRight size={11} style={{ color: C.danger }} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: k.positive ? C.success : C.danger }}>
                  {k.delta}
                </span>
                <span style={{ fontSize: 10, color: C.faint }}>{k.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MAIN CHART GRID ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 16,
      }}>

        {/* ── CARD 1: Sends + Signups trend (spans full width) ── */}
        <div style={{ ...GLASS, padding: '20px 22px', gridColumn: '1 / -1', borderRadius: 16 }}>
          <SectionHeader
            title="Sends & Signups Over Time"
            icon={<Mail size={13} />}
            pill={range}
          />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="aCkSends" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="aCkSignups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.success} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="sends"
                orientation="left"
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                width={36}
              />
              <YAxis
                yAxisId="signups"
                orientation="right"
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<GlassTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: C.dim, paddingTop: 8 }}
                formatter={(value: string) => (
                  <span style={{ color: C.dim }}>{value}</span>
                )}
              />
              <Area
                yAxisId="sends"
                type="monotone"
                dataKey="sends"
                name="Sends"
                stroke={C.accent}
                strokeWidth={2}
                fill="url(#aCkSends)"
                dot={false}
                activeDot={{ r: 4, fill: C.accent, strokeWidth: 0 }}
              />
              <Area
                yAxisId="signups"
                type="monotone"
                dataKey="signups"
                name="Signups"
                stroke={C.success}
                strokeWidth={2}
                fill="url(#aCkSignups)"
                dot={false}
                activeDot={{ r: 4, fill: C.success, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── CARD 2: Plan-mix donut ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader title="Plan Distribution" icon={<Users size={13} />} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: '0 0 160px', height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PLAN_MIX}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {PLAN_MIX.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {PLAN_MIX.map((p) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: p.color,
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: 12, color: C.dim }}>{p.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.value}%</span>
                </div>
              ))}
              <div style={{
                marginTop: 4,
                paddingTop: 8,
                borderTop: `1px solid ${C.borderSoft}`,
                fontSize: 11,
                color: C.faint,
              }}>
                218 total workspaces
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 3: Warmth distribution histogram ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader title="Warmth / Health Distribution" icon={<Activity size={13} />} />
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={WARMTH_BINS} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barCategoryGap="14%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="range"
                tick={{ fill: C.faint, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={28}
              />
              <YAxis
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }: CustomTooltipProps) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const entry = payload[0];
                  if (!entry) return null;
                  return (
                    <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: C.dim, fontSize: 10, marginBottom: 3 }}>Score {label}</div>
                      <div style={{ color: C.accent, fontWeight: 700 }}>{entry.value} mailboxes</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Mailboxes" radius={[4, 4, 0, 0]}>
                {WARMTH_BINS.map((bin, idx) => {
                  const pct = idx / (WARMTH_BINS.length - 1);
                  const color = pct < 0.3
                    ? C.danger
                    : pct < 0.5
                      ? C.warning
                      : C.success;
                  return <Cell key={bin.range} fill={color} fillOpacity={0.7 + pct * 0.3} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── CARD 4: Deliverability / Inbox-placement trend ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader
            title="Deliverability · Inbox Placement %"
            icon={<Gauge size={13} />}
            pill={`${trend[trend.length - 1]?.inbox ?? 0}% now`}
            pillColor={C.success}
          />
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[70, 100]}
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload, label }: CustomTooltipProps) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const entry = payload[0];
                  if (!entry) return null;
                  return (
                    <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: C.dim, fontSize: 10, marginBottom: 3 }}>{label}</div>
                      <div style={{ color: C.success, fontWeight: 700 }}>{entry.value}% inbox</div>
                    </div>
                  );
                }}
              />
              <defs>
                <linearGradient id="delGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={C.warning} />
                  <stop offset="100%" stopColor={C.success} />
                </linearGradient>
              </defs>
              <Line
                type="monotone"
                dataKey="inbox"
                name="Inbox %"
                stroke={C.success}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: C.success, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
          {/* Gauge row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[
              { label: 'Bounce', value: '0.6%',  color: C.success },
              { label: 'Spam',   value: '1.2%',  color: C.warning },
              { label: 'Retry',  value: '2.8%',  color: C.warning },
              { label: 'Failed', value: '0.3%',  color: C.danger  },
            ].map((m) => (
              <div key={m.label} style={{
                flex: 1,
                background: C.glass2,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 8,
                padding: '6px 8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CARD 5: MRR trend line ── */}
        <div style={{ ...GLASS, padding: '20px 22px', borderRadius: 16 }}>
          <SectionHeader title="MRR Trend" icon={<CreditCard size={13} />} pill="+6.4% MoM" pillColor={C.success} />
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent2} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.accent2} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: C.faint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                content={({ active, payload, label }: CustomTooltipProps) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const entry = payload[0];
                  if (!entry) return null;
                  return (
                    <div style={{ ...GLASS_INNER, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ color: C.dim, fontSize: 10, marginBottom: 3 }}>{label}</div>
                      <div style={{ color: C.accent2, fontWeight: 700 }}>${(Number(entry.value)).toLocaleString()}</div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                name="MRR"
                stroke={C.accent2}
                strokeWidth={2}
                fill="url(#mrrGrad)"
                dot={false}
                activeDot={{ r: 4, fill: C.accent2, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── CARD 6: Top Workspaces table (spans full width) ── */}
        <div style={{ ...GLASS, padding: '20px 22px', gridColumn: '1 / -1', borderRadius: 16 }}>
          <SectionHeader title="Top Workspaces by Volume" icon={<Building2 size={13} />} pill={`${range} window`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: 12,
            }}>
              <thead>
                <tr>
                  {['#', 'Workspace', 'Plan', 'Sends', 'Avg Warmth', 'Health'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 10px',
                        textAlign: h === '#' ? 'center' : 'left',
                        color: C.faint,
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderBottom: `1px solid ${C.borderSoft}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_WORKSPACES.map((row, i) => (
                  <tr
                    key={row.name}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{
                      padding: '9px 10px',
                      textAlign: 'center',
                      color: C.faint,
                      fontWeight: 700,
                      fontSize: 11,
                    }}>
                      {row.rank}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: C.text }}>
                      {row.name}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{
                        background: (PLAN_COLORS[row.plan] ?? C.faint) + '22',
                        color: PLAN_COLORS[row.plan] ?? C.dim,
                        border: `1px solid ${(PLAN_COLORS[row.plan] ?? C.faint)}44`,
                        borderRadius: 5,
                        padding: '2px 7px',
                        fontSize: 10,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>
                        {row.plan}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', color: C.dim, fontWeight: 600 }}>
                      {row.sends.toLocaleString()}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          flex: 1,
                          height: 4,
                          background: 'rgba(255,255,255,0.10)',
                          borderRadius: 2,
                          maxWidth: 80,
                        }}>
                          <div style={{
                            height: '100%',
                            borderRadius: 2,
                            width: `${row.warmth * 100}%`,
                            background: row.warmth >= 0.8
                              ? C.success
                              : row.warmth >= 0.65
                                ? C.warning
                                : C.danger,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: row.warmth >= 0.8
                            ? C.success
                            : row.warmth >= 0.65
                              ? C.warning
                              : C.danger,
                          minWidth: 28,
                        }}>
                          {row.warmth.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {row.status === 'healthy' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.success }}>
                          <CheckCircle2 size={12} />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>Healthy</span>
                        </span>
                      )}
                      {row.status === 'warn' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.warning }}>
                          <AlertTriangle size={12} />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>Watch</span>
                        </span>
                      )}
                      {row.status === 'risk' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.danger }}>
                          <AlertTriangle size={12} />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>At Risk</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
