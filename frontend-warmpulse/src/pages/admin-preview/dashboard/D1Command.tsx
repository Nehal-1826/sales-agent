/**
 * Admin Dashboard Design Candidate: D1 Command Deck
 *
 * "Command Deck" — dense mission-control aesthetic.
 * Self-contained mock. No API calls, no feature imports.
 * All styling via inline style={{}} only.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Users,
  CreditCard,
  Mail,
  Inbox,
  TrendingUp,
  TrendingDown,
  Activity,
  Server,
  BarChart2,
  PieChart as PieIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KpiCard {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  sparkPoints: number[];
  icon: typeof Users;
}

interface MonthlyPoint {
  month: string;
  revenue: number;
  sends: number;
}

interface PlanSegment {
  name: string;
  value: number;
  color: string;
}

interface PoolCapacity {
  name: string;
  used: number;
  total: number;
  pct: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const KPI_DATA: KpiCard[] = [
  {
    label: 'TOTAL USERS',
    value: '1,284',
    delta: '+6.2%',
    positive: true,
    sparkPoints: [48, 52, 50, 58, 63, 70, 72, 79, 84, 88, 90, 96],
    icon: Users,
  },
  {
    label: 'MRR',
    value: '$48,250',
    delta: '+4.1%',
    positive: true,
    sparkPoints: [32, 34, 36, 35, 39, 42, 44, 46, 47, 48, 49, 51],
    icon: CreditCard,
  },
  {
    label: 'ACTIVE MAILBOXES',
    value: '3,910',
    delta: '+2.8%',
    positive: true,
    sparkPoints: [58, 60, 64, 66, 70, 73, 75, 78, 80, 83, 85, 88],
    icon: Inbox,
  },
  {
    label: 'SENDS TODAY',
    value: '71,540',
    delta: '+9.0%',
    positive: true,
    sparkPoints: [40, 45, 50, 55, 52, 60, 65, 70, 68, 74, 80, 88],
    icon: Mail,
  },
  {
    label: 'AVG INBOX PLACEMENT',
    value: '92%',
    delta: '-1.2%',
    positive: false,
    sparkPoints: [96, 95, 94, 96, 95, 93, 94, 93, 92, 93, 92, 91],
    icon: Activity,
  },
];

const MONTHLY_DATA: MonthlyPoint[] = [
  { month: 'Jun', revenue: 28400, sends: 410000 },
  { month: 'Jul', revenue: 30100, sends: 445000 },
  { month: 'Aug', revenue: 31800, sends: 468000 },
  { month: 'Sep', revenue: 32600, sends: 490000 },
  { month: 'Oct', revenue: 34200, sends: 520000 },
  { month: 'Nov', revenue: 35900, sends: 548000 },
  { month: 'Dec', revenue: 36400, sends: 570000 },
  { month: 'Jan', revenue: 38100, sends: 598000 },
  { month: 'Feb', revenue: 40200, sends: 625000 },
  { month: 'Mar', revenue: 42800, sends: 654000 },
  { month: 'Apr', revenue: 45500, sends: 688000 },
  { month: 'May', revenue: 48250, sends: 715400 },
];

const PLAN_DATA: PlanSegment[] = [
  { name: 'Starter', value: 540, color: '#FF8A4B' },
  { name: 'Pro', value: 410, color: '#F26522' },
  { name: 'Pro Plus', value: 220, color: '#3ddc97' },
  { name: 'Agency', value: 114, color: 'rgba(255,255,255,0.55)' },
];

const POOL_DATA: PoolCapacity[] = [
  { name: 'Default Pool', used: 2340, total: 3000, pct: 78 },
  { name: 'Google WS', used: 832, total: 1300, pct: 64 },
  { name: 'O365', used: 648, total: 800, pct: 81 },
  { name: 'Yahoo', used: 260, total: 500, pct: 52 },
];

// ---------------------------------------------------------------------------
// Glass panel style base
// ---------------------------------------------------------------------------

const GLASS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  padding: 20,
};

const GLASS_TIGHT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  backdropFilter: 'blur(10px)',
  borderRadius: 14,
  padding: 16,
};

// ---------------------------------------------------------------------------
// Inline sparkline (SVG polyline)
// ---------------------------------------------------------------------------

function InlineSparkline({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const w = 56;
  const h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  const color = positive ? '#3ddc97' : '#ff5c7a';

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`spk-${positive ? 'pos' : 'neg'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.30" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${coords} ${w},${h}`}
        fill={`url(#spk-${positive ? 'pos' : 'neg'})`}
      />
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

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiStatCard({ card }: { card: KpiCard }) {
  const Icon = card.icon;
  const deltaColor = card.positive ? '#3ddc97' : '#ff5c7a';
  const DeltaIcon = card.positive ? TrendingUp : TrendingDown;

  return (
    <div
      style={{
        ...GLASS_TIGHT,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        flex: '1 1 0',
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'rgba(255,255,255,0.42)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <Icon size={11} strokeWidth={2.4} />
        {card.label}
      </div>

      {/* Value + sparkline row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {card.value}
        </span>
        <InlineSparkline points={card.sparkPoints} positive={card.positive} />
      </div>

      {/* Delta chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <DeltaIcon size={10} strokeWidth={2.6} style={{ color: deltaColor }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>
          {card.delta}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>
          vs last 30d
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom recharts tooltip (dark)
// ---------------------------------------------------------------------------

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: 'rgba(20,20,20,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12,
        color: '#fff',
      }}
    >
      <div style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 4, fontSize: 11 }}>
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color,
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.65)', marginRight: 4 }}>{p.name}:</span>
          <strong style={{ color: '#fff' }}>
            {p.name === 'Revenue'
              ? `$${(p.value / 1000).toFixed(1)}k`
              : (p.value / 1000).toFixed(0) + 'k'}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero combo chart
// ---------------------------------------------------------------------------

function HeroComboChart() {
  return (
    <div style={{ ...GLASS, padding: 22 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: 'rgba(255,255,255,0.42)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 3,
            }}
          >
            <BarChart2 size={11} strokeWidth={2.4} />
            Platform growth · last 12 months
          </div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
            Revenue &amp; Warmup Sends
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: 'linear-gradient(135deg, #F26522, #FF8A4B)',
              }}
            />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
              Revenue
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 20,
                height: 2,
                borderRadius: 1,
                background: '#3ddc97',
              }}
            />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
              Sends
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={MONTHLY_DATA} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F26522" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#FF8A4B" stopOpacity={0.65} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            stroke="rgba(255,255,255,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="rev"
            orientation="left"
            tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            yAxisId="sends"
            orientation="right"
            tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<DarkTooltip />} />
          <Bar
            yAxisId="rev"
            dataKey="revenue"
            name="Revenue"
            fill="url(#revenueBarGrad)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Line
            yAxisId="sends"
            type="monotone"
            dataKey="sends"
            name="Sends"
            stroke="#3ddc97"
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4, fill: '#3ddc97', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan mix donut
// ---------------------------------------------------------------------------

function PlanDonutCard() {
  const total = PLAN_DATA.reduce((s, d) => s + d.value, 0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div style={{ ...GLASS, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          color: 'rgba(255,255,255,0.42)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <PieIcon size={11} strokeWidth={2.4} />
        Plan mix · {total.toLocaleString()} workspaces
      </div>

      {/* Chart + legend row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {/* Donut */}
        <div style={{ width: 140, height: 140, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={PLAN_DATA}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={66}
                paddingAngle={2}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {PLAN_DATA.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.45}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0];
                  if (!d) return null;
                  return (
                    <div
                      style={{
                        background: 'rgba(20,20,20,0.92)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: '#fff',
                      }}
                    >
                      <strong>{d.name}</strong>:{' '}
                      {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 100 }}>
          {PLAN_DATA.map((seg, i) => {
            const pct = Math.round((seg.value / total) * 100);
            return (
              <div
                key={seg.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'default',
                  opacity: activeIndex === null || activeIndex === i ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: seg.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', flex: 1 }}>
                  {seg.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  {seg.value.toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.38)',
                    width: 28,
                    textAlign: 'right',
                  }}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool capacity card
// ---------------------------------------------------------------------------

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(pct), 80);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div
      ref={ref}
      style={{
        height: 6,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          borderRadius: 3,
          background: color,
          transition: 'width 0.85s cubic-bezier(0.34,1.36,0.64,1)',
        }}
      />
    </div>
  );
}

function poolBarColor(pct: number): string {
  if (pct >= 80) return '#ff5c7a';
  if (pct >= 65) return '#FF8A4B';
  return '#3ddc97';
}

function PoolCapacityCard() {
  return (
    <div style={{ ...GLASS, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          color: 'rgba(255,255,255,0.42)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <Server size={11} strokeWidth={2.4} />
        Peer pool capacity
      </div>

      {/* Pool rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {POOL_DATA.map((pool) => {
          const color = poolBarColor(pool.pct);
          return (
            <div key={pool.name}>
              {/* Row label */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 500 }}>
                  {pool.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
                    {pool.used.toLocaleString()} / {pool.total.toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color,
                      minWidth: 32,
                      textAlign: 'right',
                    }}
                  >
                    {pool.pct}%
                  </span>
                </div>
              </div>
              {/* Bar */}
              <AnimatedBar pct={pool.pct} color={color} />
            </div>
          );
        })}
      </div>

      {/* Footer legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 4,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {[
          { label: 'Healthy', color: '#3ddc97', threshold: '< 65%' },
          { label: 'Elevated', color: '#FF8A4B', threshold: '65–79%' },
          { label: 'Critical', color: '#ff5c7a', threshold: '≥ 80%' },
        ].map((leg) => (
          <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: leg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>
              {leg.label} {leg.threshold}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          Platform overview
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
          Live across 1,107 workspaces
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: '5px 12px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.50)',
          fontWeight: 600,
          letterSpacing: '0.03em',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#3ddc97',
            flexShrink: 0,
            boxShadow: '0 0 6px #3ddc97',
          }}
        />
        Last 24h
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function AdmDshD1Command() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* Page header row */}
      <PageHeader />

      {/* KPI strip — 5 cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
        }}
      >
        {KPI_DATA.map((card) => (
          <KpiStatCard key={card.label} card={card} />
        ))}
      </div>

      {/* Hero combo chart */}
      <HeroComboChart />

      {/* Bottom row: Plan mix + Pool capacity */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
        }}
      >
        <PlanDonutCard />
        <PoolCapacityCard />
      </div>
    </div>
  );
}

export default AdmDshD1Command;
