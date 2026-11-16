/**
 * Admin Platform Analytics — Design Candidate A4: Journal
 *
 * "Journal" — editorial / data-journalism weekly analytics report.
 * Reads like a polished internal newsroom briefing: masthead, headline
 * stat band, large switchable trend chart, then a two-column lower
 * section with a warmth-cohort retention grid (left) and plan
 * distribution + top workspaces (right).
 *
 * Self-contained: inline styles only · mock data only · no API/react-query.
 * Palette: warm/neutral only — #F26522 accent, #FF8A4B warm, #3ddc97 success,
 *          #ff5c7a danger. No purple/violet/blue/teal/cyan/indigo/pink.
 */

import { Fragment, useState, type CSSProperties } from 'react';
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
  type TooltipProps,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Mail,
  Users,
  DollarSign,
  Activity,
  ChevronDown,
  Newspaper,
  Building2,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text:    '#fff',
  dim:     'rgba(255,255,255,0.62)',
  faint:   'rgba(255,255,255,0.38)',
  hairline:'rgba(255,255,255,0.08)',
  accent:  '#F26522',
  warm:    '#FF8A4B',
  success: '#3ddc97',
  danger:  '#ff5c7a',
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         16,
  } as CSSProperties,
  glassLg: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         18,
  } as CSSProperties,
};

// ─── Period data model ────────────────────────────────────────────────────────
type Period = 'this-week' | 'last-week' | 'last-30d';

interface PeriodData {
  label:      string;
  dateRange:  string;
  headline:   string;
  dek:        string;
  stats: {
    sends:    { value: string; delta: string; up: boolean };
    signups:  { value: string; delta: string; up: boolean };
    revenue:  { value: string; delta: string; up: boolean };
    warmth:   { value: string; delta: string; up: boolean };
  };
  series: Array<{ day: string; sends: number; signups: number; revenue: number }>;
}

const PERIOD_DATA: Record<Period, PeriodData> = {
  'this-week': {
    label:     'This week',
    dateRange: 'May 25 – May 31, 2026',
    headline:  'Sends up 9 %, signups steady — Growth plan now 44 % of MRR',
    dek:       'Peer pool A absorbs the spike; SMTP retry rate down 31 % after last week\'s rotation tweak.',
    stats: {
      sends:   { value: '38,412', delta: '+9.1 %', up: true  },
      signups: { value: '34',     delta: '+2',      up: true  },
      revenue: { value: '$48.2k', delta: '+4.1 %',  up: true  },
      warmth:  { value: '0.86',   delta: '+0.03',   up: true  },
    },
    series: [
      { day: 'Mon', sends: 4820, signups: 4, revenue: 6640 },
      { day: 'Tue', sends: 5230, signups: 5, revenue: 6890 },
      { day: 'Wed', sends: 4990, signups: 4, revenue: 6730 },
      { day: 'Thu', sends: 5810, signups: 6, revenue: 7110 },
      { day: 'Fri', sends: 6420, signups: 7, revenue: 7450 },
      { day: 'Sat', sends: 5940, signups: 4, revenue: 6920 },
      { day: 'Sun', sends: 5202, signups: 4, revenue: 6462 },
    ],
  },
  'last-week': {
    label:     'Last week',
    dateRange: 'May 18 – May 24, 2026',
    headline:  'Record send volume — 35,200 emails, 6 upgrades to Growth tier',
    dek:       'Pool B introduced 8 new peers; inbox placement rate climbed to 91.2 % from 88.7 %.',
    stats: {
      sends:   { value: '35,200', delta: '+14.2 %', up: true  },
      signups: { value: '32',     delta: '+8',       up: true  },
      revenue: { value: '$46.3k', delta: '+3.7 %',   up: true  },
      warmth:  { value: '0.83',   delta: '-0.01',    up: false },
    },
    series: [
      { day: 'Mon', sends: 4210, signups: 3, revenue: 6410 },
      { day: 'Tue', sends: 4650, signups: 5, revenue: 6580 },
      { day: 'Wed', sends: 5120, signups: 6, revenue: 6720 },
      { day: 'Thu', sends: 5470, signups: 5, revenue: 6810 },
      { day: 'Fri', sends: 5980, signups: 7, revenue: 6940 },
      { day: 'Sat', sends: 4890, signups: 4, revenue: 6530 },
      { day: 'Sun', sends: 4880, signups: 2, revenue: 6310 },
    ],
  },
  'last-30d': {
    label:     'Last 30 days',
    dateRange: 'May 1 – May 31, 2026',
    headline:  'MRR grew $5.2 k — strongest month; 142 new signups, 12 plan upgrades',
    dek:       'Three workspaces churned (−$267 MRR); offset by 12 upgrades adding +$1,840 MRR net.',
    stats: {
      sends:   { value: '162,840', delta: '+21.4 %', up: true  },
      signups: { value: '142',     delta: '+18',      up: true  },
      revenue: { value: '$48.2k',  delta: '+12.1 %',  up: true  },
      warmth:  { value: '0.84',    delta: '+0.06',    up: true  },
    },
    series: [
      { day: 'May 1',  sends: 4100, signups: 3, revenue: 5900 },
      { day: 'May 3',  sends: 4380, signups: 4, revenue: 6050 },
      { day: 'May 5',  sends: 4650, signups: 5, revenue: 6120 },
      { day: 'May 7',  sends: 4820, signups: 4, revenue: 6200 },
      { day: 'May 9',  sends: 5010, signups: 6, revenue: 6340 },
      { day: 'May 11', sends: 5240, signups: 5, revenue: 6420 },
      { day: 'May 13', sends: 5460, signups: 7, revenue: 6580 },
      { day: 'May 15', sends: 5610, signups: 6, revenue: 6700 },
      { day: 'May 17', sends: 5380, signups: 5, revenue: 6630 },
      { day: 'May 19', sends: 5720, signups: 8, revenue: 6810 },
      { day: 'May 21', sends: 5940, signups: 7, revenue: 6920 },
      { day: 'May 23', sends: 6100, signups: 9, revenue: 7020 },
      { day: 'May 25', sends: 6320, signups: 8, revenue: 7150 },
      { day: 'May 27', sends: 6480, signups: 9, revenue: 7280 },
      { day: 'May 29', sends: 6590, signups: 8, revenue: 7360 },
      { day: 'May 31', sends: 5988, signups: 8, revenue: 7090 },
    ],
  },
};

// ─── Cohort / warmth retention grid ──────────────────────────────────────────
interface CohortRow {
  cohort:  string;
  values:  number[]; // warmth scores 0..100 across weeks-since-signup
}

const COHORT_WEEKS = ['Wk 0', 'Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'];

const COHORT_DATA: CohortRow[] = [
  { cohort: 'Apr w1', values: [100, 88, 74, 68, 62] },
  { cohort: 'Apr w2', values: [100, 84, 71, 64,  0] },
  { cohort: 'Apr w3', values: [100, 91, 79,  0,  0] },
  { cohort: 'Apr w4', values: [100, 86,  0,  0,  0] },
  { cohort: 'May w1', values: [100,  0,  0,  0,  0] },
];

// ─── Plan distribution ────────────────────────────────────────────────────────
interface PlanRow {
  plan:    string;
  pct:     number;
  mrr:     string;
  color:   string;
  change:  string;
  up:      boolean;
}

const PLANS: PlanRow[] = [
  { plan: 'Agency',   pct: 18, mrr: '$19,782', color: '#F26522', change: '+2',   up: true  },
  { plan: 'Pro Plus', pct: 24, mrr: '$13,510', color: '#FF8A4B', change: '+5',   up: true  },
  { plan: 'Pro',      pct: 32, mrr: '$10,615', color: '#3ddc97', change: '+4',   up: true  },
  { plan: 'Growth',   pct: 17, mrr: '$4,343',  color: '#e8c06a', change: '+3',   up: true  },
  { plan: 'Starter',  pct: 9,  mrr: '$0',      color: 'rgba(255,255,255,0.28)', change: '-1', up: false },
];

// ─── Top workspaces ───────────────────────────────────────────────────────────
interface WorkspaceRow {
  rank:    number;
  name:    string;
  plan:    string;
  sends:   string;
  warmth:  number;
  mrr:     string;
  trend:   'up' | 'down' | 'flat';
}

const TOP_WORKSPACES: WorkspaceRow[] = [
  { rank: 1, name: 'Vantage Digital',   plan: 'Agency',   sends: '6,840',  warmth: 0.94, mrr: '$1,490', trend: 'up'   },
  { rank: 2, name: 'GridPoint Media',   plan: 'Agency',   sends: '6,120',  warmth: 0.91, mrr: '$1,490', trend: 'up'   },
  { rank: 3, name: 'Ironwood Labs',     plan: 'Pro Plus', sends: '4,980',  warmth: 0.89, mrr: '$790',   trend: 'up'   },
  { rank: 4, name: 'Sable & Sable',    plan: 'Pro Plus', sends: '4,410',  warmth: 0.88, mrr: '$790',   trend: 'flat' },
  { rank: 5, name: 'Altitude Growth',  plan: 'Pro',      sends: '3,870',  warmth: 0.86, mrr: '$390',   trend: 'up'   },
  { rank: 6, name: 'Ember Collective', plan: 'Pro',      sends: '3,290',  warmth: 0.82, mrr: '$390',   trend: 'down' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
type MetricToggle = 'sends' | 'signups' | 'revenue';

function fmtSeries(
  series: PeriodData['series'],
  metric: MetricToggle,
): Array<{ day: string; v: number }> {
  return series.map((r) => ({ day: r.day, v: r[metric] }));
}

function cohortColor(v: number): string {
  if (v === 0) return 'rgba(255,255,255,0.04)';
  if (v >= 90) return 'rgba(61,220,151,0.82)';
  if (v >= 75) return 'rgba(61,220,151,0.52)';
  if (v >= 60) return 'rgba(242,101,34,0.55)';
  return 'rgba(255,92,122,0.48)';
}

function cohortTextColor(v: number): string {
  if (v === 0) return 'rgba(255,255,255,0.15)';
  return '#fff';
}

function warmthColor(w: number): string {
  if (w >= 0.9) return '#3ddc97';
  if (w >= 0.8) return '#FF8A4B';
  return '#ff5c7a';
}

function trendIcon(t: WorkspaceRow['trend']) {
  if (t === 'up')   return <TrendingUp  size={11} style={{ color: '#3ddc97' }} />;
  if (t === 'down') return <TrendingDown size={11} style={{ color: '#ff5c7a' }} />;
  return <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>—</span>;
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
function makeJournalTooltip(metric: MetricToggle) {
  return function JournalTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value ?? 0;
    const formatted =
      metric === 'revenue'
        ? `$${val.toLocaleString()}`
        : metric === 'signups'
        ? `${val} signups`
        : val.toLocaleString();
    return (
      <div
        style={{
          ...T.glass,
          padding: '8px 14px',
          fontSize: 12,
          color: T.text,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ color: T.faint, marginBottom: 2, fontSize: 10, letterSpacing: '0.08em' }}>
          {label}
        </div>
        <div style={{ fontWeight: 700, color: T.accent }}>{formatted}</div>
      </div>
    );
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  up,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  delta: string;
  up: boolean;
}) {
  return (
    <div
      style={{
        ...T.glass,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flex: '1 1 0',
        minWidth: 140,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'rgba(242,101,34,0.12)',
            border: '1px solid rgba(242,101,34,0.22)',
            color: T.accent,
            flexShrink: 0,
          }}
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <span
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.faint }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: up ? T.success : T.danger,
        }}
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {delta} vs prev period
      </div>
    </div>
  );
}

// ─── Period selector dropdown ─────────────────────────────────────────────────
const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'this-week', label: 'This week'  },
  { value: 'last-week', label: 'Last week'  },
  { value: 'last-30d',  label: 'Last 30 d'  },
];

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const label = PERIOD_OPTIONS.find((o) => o.value === value)?.label ?? '';
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          ...T.glass,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: T.dim,
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {label}
        <ChevronDown size={12} style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            ...T.glass,
            borderRadius: 12,
            overflow: 'hidden',
            minWidth: 130,
            zIndex: 50,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: o.value === value ? 700 : 400,
                color: o.value === value ? T.accent : T.dim,
                background: o.value === value ? 'rgba(242,101,34,0.10)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Metric toggle pills ──────────────────────────────────────────────────────
function MetricTogglePills({
  value,
  onChange,
}: {
  value: MetricToggle;
  onChange: (m: MetricToggle) => void;
}) {
  const opts: Array<{ id: MetricToggle; label: string }> = [
    { id: 'sends',    label: 'Sends'    },
    { id: 'signups',  label: 'Signups'  },
    { id: 'revenue',  label: 'Revenue'  },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 999,
        padding: 3,
      }}
    >
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          style={{
            padding: '5px 13px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: o.id === value ? T.accent : 'transparent',
            color: o.id === value ? '#0a0a0f' : T.dim,
            transition: 'background 0.18s, color 0.18s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Cohort warmth grid ───────────────────────────────────────────────────────
function WarmthCohortGrid() {
  return (
    <div style={{ ...T.glassLg, padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Activity size={14} style={{ color: T.accent }} strokeWidth={2.2} />
        <span
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.faint }}
        >
          Warmth cohort · weeks since signup
        </span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
        <div /> {/* cohort label spacer */}
        {COHORT_WEEKS.map((w) => (
          <div
            key={w}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: T.faint,
              textAlign: 'center',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Rows */}
      {COHORT_DATA.map((row) => (
        <div key={row.cohort} style={{ display: 'grid', gridTemplateColumns: '72px repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, color: T.dim, display: 'flex', alignItems: 'center', paddingRight: 6 }}
          >
            {row.cohort}
          </div>
          {COHORT_WEEKS.map((_, wi) => {
            const v = row.values[wi] ?? 0;
            return (
              <div
                key={wi}
                title={v > 0 ? `${row.cohort} · ${COHORT_WEEKS[wi]}: ${v}% warmth` : 'No data yet'}
                style={{
                  height: 38,
                  borderRadius: 8,
                  background: cohortColor(v),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: cohortTextColor(v),
                  cursor: 'default',
                  transition: 'filter 0.15s',
                }}
              >
                {v > 0 ? `${v}` : '·'}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          { label: '≥ 90 % — excellent', bg: 'rgba(61,220,151,0.82)' },
          { label: '75–90 % — good',     bg: 'rgba(61,220,151,0.52)' },
          { label: '60–75 % — fair',     bg: 'rgba(242,101,34,0.55)' },
          { label: '< 60 % — at risk',   bg: 'rgba(255,92,122,0.48)' },
        ].map((leg) => (
          <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: leg.bg }} />
            <span style={{ fontSize: 10, color: T.faint }}>{leg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan distribution bars ───────────────────────────────────────────────────
function PlanDistribution() {
  return (
    <div style={{ ...T.glass, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <DollarSign size={13} style={{ color: T.accent }} strokeWidth={2.2} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.faint }}>
          Plan distribution
        </span>
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginBottom: 16, gap: 1 }}>
        {PLANS.map((p) => (
          <div
            key={p.plan}
            style={{ flex: p.pct, background: p.color, transition: 'flex 0.4s ease' }}
            title={`${p.plan}: ${p.pct}%`}
          />
        ))}
      </div>

      {/* Rows */}
      {PLANS.map((p) => (
        <div
          key={p.plan}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 0',
            borderBottom: `1px solid ${T.hairline}`,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 99, background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: T.dim, fontWeight: 500 }}>{p.plan}</span>
          <span style={{ fontSize: 12, color: T.faint }}>{p.pct}%</span>
          <span style={{ fontSize: 12, color: T.text, fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{p.mrr}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: p.up ? T.success : T.danger,
              minWidth: 28,
              textAlign: 'right',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {p.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {p.change}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Top workspaces table ─────────────────────────────────────────────────────
function TopWorkspaces() {
  return (
    <div style={{ ...T.glass, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Building2 size={13} style={{ color: T.accent }} strokeWidth={2.2} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: T.faint }}>
          Top workspaces · 7-day sends
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 56px 44px 52px 28px', gap: '0 10px', alignItems: 'center' }}>
        {/* Col headers */}
        {['#', 'Workspace', 'Sends', 'Warmth', 'MRR', ''].map((h, i) => (
          <div
            key={i}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: T.faint,
              paddingBottom: 8,
              textAlign: i > 1 ? 'right' : 'left',
              borderBottom: `1px solid ${T.hairline}`,
            }}
          >
            {h}
          </div>
        ))}

        {/* Data rows */}
        {TOP_WORKSPACES.map((ws) => (
          <Fragment key={ws.rank}>
            <div
              style={{ fontSize: 11, color: T.faint, paddingTop: 9 }}
            >
              {ws.rank}
            </div>
            <div style={{ paddingTop: 9 }}>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{ws.name}</div>
              <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{ws.plan}</div>
            </div>
            <div
              style={{ fontSize: 12, color: T.dim, textAlign: 'right', paddingTop: 9 }}
            >
              {ws.sends}
            </div>
            <div
              style={{ fontSize: 12, fontWeight: 600, color: warmthColor(ws.warmth), textAlign: 'right', paddingTop: 9 }}
            >
              {ws.warmth}
            </div>
            <div
              style={{ fontSize: 12, color: T.text, fontWeight: 600, textAlign: 'right', paddingTop: 9 }}
            >
              {ws.mrr}
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 9 }}
            >
              {trendIcon(ws.trend)}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Plan donut chart (recharts BarChart in radial disguise → simple bar) ─────
function PlanBarChart() {
  const data = PLANS.map((p) => ({ name: p.plan, value: p.pct, color: p.color }));
  return (
    <div style={{ height: 140, marginTop: 4 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="22%">
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0];
              return (
                <div style={{ ...T.glass, padding: '6px 12px', fontSize: 12, color: T.text }}>
                  <span style={{ color: T.faint }}>{String(p?.name ?? '')}: </span>
                  <strong style={{ color: T.accent }}>{String(p?.value ?? '')}%</strong>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={0.88} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function AdmAnaA4Journal() {
  const [period, setPeriod] = useState<Period>('this-week');
  const [metric, setMetric] = useState<MetricToggle>('sends');

  const pd = PERIOD_DATA[period];
  const chartData = fmtSeries(pd.series, metric);

  const metricLabel =
    metric === 'sends' ? 'Sends' : metric === 'signups' ? 'Signups' : 'Revenue';

  const metricColor =
    metric === 'sends' ? T.accent : metric === 'signups' ? T.success : '#FF8A4B';

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        color: T.text,
        maxWidth: 1100,
        margin: '0 auto',
        padding: '28px 24px 48px',
      }}
    >
      {/* ── MASTHEAD ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 28,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: eyebrow + headline + dek */}
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          {/* Eyebrow row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Newspaper size={13} style={{ color: T.accent }} strokeWidth={2.4} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: T.accent,
              }}
            >
              WarmPulse · Analytics
            </span>
            <span
              style={{
                fontSize: 10,
                color: T.faint,
                fontWeight: 500,
                marginLeft: 4,
              }}
            >
              {pd.dateRange}
            </span>
          </div>

          {/* Big headline */}
          <h1
            style={{
              fontSize: 'clamp(20px, 2.4vw, 28px)',
              fontWeight: 800,
              lineHeight: 1.2,
              color: T.text,
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            {pd.headline}
          </h1>

          {/* Dek */}
          <p
            style={{
              fontSize: 14,
              color: T.dim,
              lineHeight: 1.6,
              margin: 0,
              maxWidth: 620,
            }}
          >
            {pd.dek}
          </p>
        </div>

        {/* Right: period selector */}
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ── RULING LINE ── */}
      <div
        style={{
          height: 1,
          background: `linear-gradient(90deg, ${T.accent} 0%, rgba(242,101,34,0.15) 40%, transparent 100%)`,
          marginBottom: 24,
        }}
      />

      {/* ── STAT BAND ── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <StatCard icon={Mail}       label="Sends"    {...pd.stats.sends}   />
        <StatCard icon={Users}      label="Signups"  {...pd.stats.signups} />
        <StatCard icon={DollarSign} label="Revenue"  {...pd.stats.revenue} />
        <StatCard icon={Activity}   label="Avg warmth" {...pd.stats.warmth} />
      </div>

      {/* ── LEAD TREND CHART ── */}
      <div style={{ ...T.glassLg, padding: '22px 26px', marginBottom: 24 }}>
        {/* Chart header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                color: T.faint,
              }}
            >
              Platform trend — {metricLabel} · {pd.label}
            </span>
          </div>
          <MetricTogglePills value={metric} onChange={setMetric} />
        </div>

        {/* Area chart */}
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="j-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={metricColor} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={metricColor} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: T.hairline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  metric === 'revenue'
                    ? `$${(v / 1000).toFixed(0)}k`
                    : v >= 1000
                    ? `${(v / 1000).toFixed(0)}k`
                    : String(v)
                }
              />
              <Tooltip
                content={makeJournalTooltip(metric)}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={metricColor}
                strokeWidth={2.5}
                fill="url(#j-fill)"
                dot={false}
                activeDot={{ r: 4, fill: metricColor, stroke: '#0a0a0f', strokeWidth: 2 }}
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── TWO-COLUMN LOWER ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* LEFT: warmth cohort grid */}
        <WarmthCohortGrid />

        {/* RIGHT: plan distribution + top workspaces */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Plan distribution bar chart + rows */}
          <div style={{ ...T.glassLg, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <DollarSign size={13} style={{ color: T.accent }} strokeWidth={2.2} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: T.faint,
                }}
              >
                Plan mix · MRR breakdown
              </span>
            </div>
            <PlanBarChart />
            <PlanDistribution />
          </div>

          {/* Top workspaces */}
          <TopWorkspaces />
        </div>
      </div>
    </div>
  );
}
