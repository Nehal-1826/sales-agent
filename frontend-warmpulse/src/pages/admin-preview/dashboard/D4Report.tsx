/**
 * Admin Dashboard — D4 Analyst Report
 *
 * Direction: "Analyst Report" — editorial / data-journalism weekly digest.
 * Self-contained: no API, no react-query, no @/lib/api. All mock data inline.
 * Styling: inline style={{}} only. Aurora Glass dark palette.
 * Colors: orange #F26522→#FF8A4B, success #3ddc97, danger #ff5c7a, warn #FF8A4B.
 * NO purple/violet/blue/teal/cyan/indigo/pink.
 * Deps: lucide-react, recharts.
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
} from 'recharts';
import {
  TrendingUp,
  Users,
  Mail,
  DollarSign,
  Inbox,
  ChevronUp,
  ChevronDown,
  Calendar,
  Award,
  BarChart2,
  FileText,
} from 'lucide-react';

// ─── Palette constants ────────────────────────────────────────────────────────
const C = {
  bg: 'transparent',
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: '1px solid rgba(255,255,255,0.10)',
  glassHover: 'rgba(255,255,255,0.08)',
  blur: 'blur(10px)',
  text: '#fff',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.40)',
  accentOrange: '#F26522',
  accentOrangeLight: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  rowAlt: 'rgba(255,255,255,0.03)',
  rowTop: 'rgba(242,101,34,0.10)',
  divider: 'rgba(255,255,255,0.08)',
  chip: {
    starter: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.62)' },
    pro: { bg: 'rgba(242,101,34,0.18)', color: '#FF8A4B' },
    proPlus: { bg: 'rgba(255,138,75,0.22)', color: '#FF8A4B' },
    agency: { bg: 'rgba(61,220,151,0.16)', color: '#3ddc97' },
  },
} as const;

// ─── Mock data ────────────────────────────────────────────────────────────────

interface WeekPoint {
  week: string;
  sends: number;
  revenue: number;
}

const WEEKS: WeekPoint[] = [
  { week: 'W11', sends: 312400, revenue: 39800 },
  { week: 'W12', sends: 328100, revenue: 41200 },
  { week: 'W13', sends: 340600, revenue: 42600 },
  { week: 'W14', sends: 331200, revenue: 42100 },
  { week: 'W15', sends: 355800, revenue: 43800 },
  { week: 'W16', sends: 368400, revenue: 44900 },
  { week: 'W17', sends: 380200, revenue: 45600 },
  { week: 'W18', sends: 372900, revenue: 45900 },
  { week: 'W19', sends: 391600, revenue: 46500 },
  { week: 'W20', sends: 408300, revenue: 47100 },
  { week: 'W21', sends: 446000, revenue: 46400 },
  { week: 'W22', sends: 486200, revenue: 48250 },
];

type PlanKey = 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';

interface WorkspaceRow {
  rank: number;
  name: string;
  plan: PlanKey;
  sends: number;
  inboxPct: number;
  mrrShare: string;
}

const WORKSPACES: WorkspaceRow[] = [
  { rank: 1, name: 'Nexus Growth Labs',   plan: 'Agency',   sends: 84200, inboxPct: 96, mrrShare: '$2,800' },
  { rank: 2, name: 'Orbital Outbound',    plan: 'Agency',   sends: 71600, inboxPct: 94, mrrShare: '$2,800' },
  { rank: 3, name: 'SilverStream Co.',    plan: 'Pro Plus',  sends: 52400, inboxPct: 93, mrrShare: '$1,490' },
  { rank: 4, name: 'Helix Marketing',     plan: 'Pro',       sends: 38900, inboxPct: 91, mrrShare: '$790' },
  { rank: 5, name: 'Cascade Ventures',    plan: 'Pro Plus',  sends: 31100, inboxPct: 90, mrrShare: '$1,490' },
  { rank: 6, name: 'Tandem Digital',      plan: 'Pro',       sends: 28700, inboxPct: 89, mrrShare: '$790' },
];

interface PlanBar {
  plan: PlanKey;
  count: number;
  color: string;
  mrrNote: string;
}

const PLAN_BARS: PlanBar[] = [
  { plan: 'Starter',  count: 540, color: 'rgba(255,255,255,0.32)', mrrNote: '11% of MRR' },
  { plan: 'Pro',      count: 410, color: '#FF8A4B',               mrrNote: '41% of MRR' },
  { plan: 'Pro Plus', count: 220, color: '#F26522',               mrrNote: '33% of MRR' },
  { plan: 'Agency',   count: 114, color: '#3ddc97',               mrrNote: '15% of MRR' },
];

const PLAN_TOTAL = PLAN_BARS.reduce((s, p) => s + p.count, 0);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  up: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, delta, up }: MetricProps) {
  const DeltaIcon = up ? ChevronUp : ChevronDown;
  return (
    <div
      style={{
        flex: '1 1 180px',
        background: C.glass,
        border: C.glassBorder,
        backdropFilter: C.blur,
        borderRadius: 14,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textDim }}>
        <span style={{ opacity: 0.7 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 12,
          fontWeight: 600,
          color: up ? C.success : C.danger,
          background: up ? 'rgba(61,220,151,0.12)' : 'rgba(255,92,122,0.12)',
          borderRadius: 999,
          padding: '3px 8px',
          alignSelf: 'flex-start',
        }}
      >
        <DeltaIcon size={11} strokeWidth={2.5} />
        {delta}
      </div>
    </div>
  );
}

function PlanChip({ plan }: { plan: PlanKey }) {
  const style = C.chip[plan === 'Pro Plus' ? 'proPlus' : plan === 'Pro' ? 'pro' : plan === 'Agency' ? 'agency' : 'starter'];
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: 6,
        padding: '3px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {plan}
    </span>
  );
}

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const sends = payload.find((p) => p.dataKey === 'sends')?.value ?? 0;
  const revenue = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0;
  return (
    <div
      style={{
        background: 'rgba(10,8,6,0.92)',
        border: '1px solid rgba(242,101,34,0.30)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 12,
        color: C.text,
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: C.accentOrangeLight }}>{label}</div>
      <div style={{ color: C.textDim }}>
        Sends: <span style={{ color: C.text, fontWeight: 600 }}>{sends.toLocaleString()}</span>
      </div>
      <div style={{ color: C.textDim }}>
        Revenue: <span style={{ color: C.success, fontWeight: 600 }}>${revenue.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmDshD4Report() {
  const [chartMode, setChartMode] = useState<'sends' | 'revenue'>('sends');

  const chartData = WEEKS;

  const gradId = 'areaGradD4';

  return (
    <div
      style={{
        padding: '32px 28px 48px',
        maxWidth: 1280,
        margin: '0 auto',
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        color: C.text,
        boxSizing: 'border-box',
      }}
    >
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header style={{ marginBottom: 36 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {/* Eyebrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 3,
                  borderRadius: 2,
                  background: `linear-gradient(90deg, ${C.accentOrange}, ${C.accentOrangeLight})`,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: C.accentOrangeLight,
                }}
              >
                WarmPulse · Platform Report
              </span>
            </div>

            {/* Big headline */}
            <h1
              style={{
                fontSize: 'clamp(26px, 4vw, 40px)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: C.text,
                margin: 0,
                marginBottom: 12,
              }}
            >
              Week 22 — sends up{' '}
              <span
                style={{
                  background: `linear-gradient(135deg, ${C.accentOrange}, ${C.accentOrangeLight})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                9%
              </span>
              , churn flat
            </h1>

            {/* Dek */}
            <p
              style={{
                fontSize: 15,
                color: C.textDim,
                lineHeight: 1.55,
                margin: 0,
                maxWidth: 620,
              }}
            >
              Platform-wide warmup volume hit a 12-week high as onboarding improvements
              drove record activations; MRR crossed $48K with zero net churn across Pro and Agency tiers.
            </p>
          </div>

          {/* Date range badge */}
          <div
            style={{
              flexShrink: 0,
              background: C.glass,
              border: C.glassBorder,
              backdropFilter: C.blur,
              borderRadius: 12,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textDim, fontSize: 11 }}>
              <Calendar size={12} strokeWidth={2} />
              <span style={{ fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Reporting period
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>26 May – 1 Jun 2026</div>
            <div style={{ fontSize: 11, color: C.textFaint }}>Week 22 · fiscal Q2</div>
          </div>
        </div>

        {/* Divider rule */}
        <div
          style={{
            marginTop: 24,
            height: 1,
            background: `linear-gradient(90deg, ${C.accentOrange}55 0%, ${C.divider} 60%, transparent 100%)`,
          }}
        />
      </header>

      {/* ── Headline metrics row ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 32,
        }}
      >
        <MetricCard
          icon={<DollarSign size={14} strokeWidth={2} />}
          label="MRR"
          value="$48,250"
          delta="+4.1% vs prior wk"
          up
        />
        <MetricCard
          icon={<Users size={14} strokeWidth={2} />}
          label="Total users"
          value="1,284"
          delta="+79 this week"
          up
        />
        <MetricCard
          icon={<Mail size={14} strokeWidth={2} />}
          label="Sends (7d)"
          value="486,200"
          delta="+9.0% vs prior wk"
          up
        />
        <MetricCard
          icon={<Inbox size={14} strokeWidth={2} />}
          label="Avg inbox placement"
          value="92%"
          delta="−1.2 pts vs prior wk"
          up={false}
        />
      </div>

      {/* ── Lead chart ───────────────────────────────────────────── */}
      <div
        style={{
          background: C.glass,
          border: C.glassBorder,
          backdropFilter: C.blur,
          borderRadius: 18,
          padding: '24px 26px 20px',
          marginBottom: 28,
        }}
      >
        {/* Chart header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <TrendingUp size={15} color={C.accentOrangeLight} strokeWidth={2.2} />
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                {chartMode === 'sends' ? 'Platform Sends — 12-week trend' : 'MRR — 12-week trend'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
              {chartMode === 'sends'
                ? 'Total warmup emails sent per week across all active mailboxes. W22 peak driven by new Agency activations.'
                : 'Monthly recurring revenue sampled at week-end. Organic growth; no promotional discounting applied.'}
            </p>
          </div>

          {/* Mode toggle */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}
          >
            {(['sends', 'revenue'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: chartMode === m ? `linear-gradient(135deg, ${C.accentOrange}, ${C.accentOrangeLight})` : 'transparent',
                  color: chartMode === m ? '#fff' : C.textDim,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '6px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'sends' ? 'Sends' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts area */}
        <div style={{ height: 240, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accentOrange} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.accentOrange} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="week"
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={chartMode === 'sends' ? 62 : 52}
                tickFormatter={(v: number) =>
                  chartMode === 'sends'
                    ? `${(v / 1000).toFixed(0)}K`
                    : `$${(v / 1000).toFixed(0)}K`
                }
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey={chartMode === 'sends' ? 'sends' : 'revenue'}
                stroke={C.accentOrange}
                strokeWidth={2.2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 5, fill: C.accentOrangeLight, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Two-column lower section ─────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* LEFT — Top workspaces league table */}
        <div
          style={{
            background: C.glass,
            border: C.glassBorder,
            backdropFilter: C.blur,
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              padding: '20px 22px 14px',
              borderBottom: `1px solid ${C.divider}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Award size={15} color={C.accentOrangeLight} strokeWidth={2.2} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                Top workspaces
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
              Ranked by 7-day send volume. Inbox % is trailing 7d average.
            </p>
          </div>

          {/* Column labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 80px 78px 62px',
              gap: 8,
              padding: '8px 22px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: C.textFaint,
              borderBottom: `1px solid ${C.divider}`,
            }}
          >
            <span>#</span>
            <span>Workspace</span>
            <span>Plan</span>
            <span style={{ textAlign: 'right' }}>Sends 7d</span>
            <span style={{ textAlign: 'right' }}>Inbox %</span>
          </div>

          {/* Rows */}
          {WORKSPACES.map((row, idx) => {
            const isTop = row.rank === 1;
            const isAlt = idx % 2 === 1;
            return (
              <div
                key={row.rank}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 80px 78px 62px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 22px',
                  background: isTop ? C.rowTop : isAlt ? C.rowAlt : 'transparent',
                  borderBottom: `1px solid ${C.divider}`,
                  transition: 'background 0.15s',
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: isTop ? C.accentOrangeLight : C.textFaint,
                  }}
                >
                  {row.rank}
                </span>

                {/* Name */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.name}
                  </div>
                  {isTop && (
                    <div style={{ fontSize: 10, color: C.accentOrangeLight, marginTop: 1 }}>
                      #1 this week
                    </div>
                  )}
                </div>

                {/* Plan chip */}
                <div>
                  <PlanChip plan={row.plan} />
                </div>

                {/* Sends */}
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: C.text }}>
                  {row.sends.toLocaleString()}
                </div>

                {/* Inbox % */}
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: 700,
                    color: row.inboxPct >= 93 ? C.success : row.inboxPct >= 88 ? C.warning : C.danger,
                  }}
                >
                  {row.inboxPct}%
                </div>
              </div>
            );
          })}

          {/* Table footer */}
          <div
            style={{
              padding: '10px 22px',
              fontSize: 11,
              color: C.textFaint,
              borderTop: `1px solid ${C.divider}`,
            }}
          >
            Showing top 6 of 1,284 active workspaces · ranked by 7-day send volume
          </div>
        </div>

        {/* RIGHT — Plan distribution */}
        <div
          style={{
            background: C.glass,
            border: C.glassBorder,
            backdropFilter: C.blur,
            borderRadius: 18,
            padding: '20px 22px',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <BarChart2 size={15} color={C.accentOrangeLight} strokeWidth={2.2} />
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                Plan distribution
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.textDim, margin: 0 }}>
              Active paying seats by plan tier. Share of MRR noted below each bar.
            </p>
          </div>

          {/* Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {PLAN_BARS.map((p) => {
              const pct = Math.round((p.count / PLAN_TOTAL) * 100);
              return (
                <div key={p.plan}>
                  {/* Label row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlanChip plan={p.plan} />
                      <span style={{ fontSize: 12, color: C.textDim }}>{p.mrrNote}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                        {p.count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: C.textFaint, marginLeft: 4 }}>
                        · {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Bar track */}
                  <div
                    style={{
                      height: 10,
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: p.color,
                        borderRadius: 999,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: C.divider,
              margin: '22px 0 16px',
            }}
          />

          {/* Summary callout */}
          <div
            style={{
              background: 'rgba(242,101,34,0.08)',
              border: '1px solid rgba(242,101,34,0.20)',
              borderRadius: 10,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.accentOrangeLight,
                marginBottom: 5,
              }}
            >
              Revenue concentration
            </div>
            <p style={{ fontSize: 12, color: C.textDim, margin: 0, lineHeight: 1.55 }}>
              Pro + Pro Plus seats (630 combined, 49% of base) drive{' '}
              <strong style={{ color: C.text }}>74% of MRR</strong>. Agency tier at only 8.9%
              of seats contributes 15% of MRR — highest ARPU segment.
            </p>
          </div>

          {/* Total count */}
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: C.textFaint }}>Total active seats</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
              {PLAN_TOTAL.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Report footer ─────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: `1px solid ${C.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textFaint, fontSize: 11 }}>
          <FileText size={12} strokeWidth={2} />
          <span>
            WarmPulse Platform Report · Week 22 · Auto-generated 1 Jun 2026 00:05 UTC
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {([
            { label: 'Data refreshes', value: 'Every 5 min' },
            { label: 'MRR source',     value: 'Stripe live' },
            { label: 'Sends source',   value: 'warmup_logs' },
          ] as const).map((item) => (
            <div key={item.label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
