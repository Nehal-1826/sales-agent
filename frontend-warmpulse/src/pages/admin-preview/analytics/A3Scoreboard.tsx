/**
 * Admin Platform Analytics — A3 Scoreboard
 *
 * "Scoreboard" — leaderboard-first competitive workspace ranking. Top KPI cards
 * with sparklines + deltas, a prominent sortable workspace league table with
 * rank medals and sparkbars, a "movers" side list, and compact plan-mix +
 * warmth-distribution charts below.
 *
 * Self-contained: inline styles only, mock data only, no API / feature / lib
 * imports. Rendered inside the admin preview shell's dark canvas (:35001).
 */

import {
  useState,
  useMemo,
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
  PieChart,
  Pie,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  Mail,
  Inbox,
  Flame,
  Users,
  Trophy,
  Medal,
  ChevronUp,
  ChevronDown,
  Activity,
  Crown,
  Star,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  text: '#fff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.38)',
  accent: '#F26522',
  accentMid: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  hairline: 'rgba(255,255,255,0.08)',
  rowHover: 'rgba(255,255,255,0.04)',
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.40)',
  } as CSSProperties,
};

// ─── Sparkline helper ─────────────────────────────────────────────────────────

function Spark({
  data,
  color,
  width = 80,
  height = 28,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <AreaChart width={width} height={height} data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="v"
        stroke={color}
        strokeWidth={1.6}
        fill={`url(#sg-${color.replace('#', '')})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}

// ─── Sparkbar (inline miniature bar chart) ────────────────────────────────────

function SparkBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: color,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: T.faint, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ─── Rank medal ───────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#FFD700,#FFA500)',
          color: '#1a1000',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        <Crown size={13} strokeWidth={2.4} />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#C0C0C0,#808080)',
          color: '#111',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#CD7F32,#8B4513)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        3
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.07)',
        color: T.dim,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {rank}
    </span>
  );
}

// ─── Mock data ────────────────────────────────────────────────────────────────

interface WorkspaceRow {
  id: string;
  name: string;
  plan: 'Scale' | 'Growth' | 'Starter' | 'Agency';
  sends: number;
  inboxPct: number;
  warmth: number;
  signups: number;
  sendTrend: number[];
  movedUp: boolean | null; // rank movement vs yesterday
}

const WORKSPACES: WorkspaceRow[] = [
  {
    id: 'ws-1',
    name: 'Acme Corp',
    plan: 'Scale',
    sends: 12840,
    inboxPct: 96.2,
    warmth: 0.94,
    signups: 8,
    sendTrend: [7200, 8400, 9100, 10300, 11200, 12100, 12840],
    movedUp: true,
  },
  {
    id: 'ws-2',
    name: 'GrowthStack',
    plan: 'Agency',
    sends: 11320,
    inboxPct: 94.8,
    warmth: 0.91,
    signups: 14,
    sendTrend: [9800, 10100, 10400, 10800, 11000, 11200, 11320],
    movedUp: null,
  },
  {
    id: 'ws-3',
    name: 'Outbound Labs',
    plan: 'Scale',
    sends: 10670,
    inboxPct: 91.4,
    warmth: 0.88,
    signups: 6,
    sendTrend: [8100, 8700, 9200, 9600, 10100, 10400, 10670],
    movedUp: true,
  },
  {
    id: 'ws-4',
    name: 'PipelineOS',
    plan: 'Growth',
    sends: 8950,
    inboxPct: 89.7,
    warmth: 0.85,
    signups: 11,
    sendTrend: [6400, 7200, 7800, 8100, 8500, 8700, 8950],
    movedUp: false,
  },
  {
    id: 'ws-5',
    name: 'SendGrid Pro',
    plan: 'Scale',
    sends: 8230,
    inboxPct: 92.1,
    warmth: 0.87,
    signups: 4,
    sendTrend: [7600, 7700, 7800, 7900, 8000, 8100, 8230],
    movedUp: true,
  },
  {
    id: 'ws-6',
    name: 'Mailer HQ',
    plan: 'Agency',
    sends: 7410,
    inboxPct: 88.3,
    warmth: 0.83,
    signups: 9,
    sendTrend: [7200, 7210, 7250, 7300, 7320, 7380, 7410],
    movedUp: null,
  },
  {
    id: 'ws-7',
    name: 'Coldmail Co',
    plan: 'Growth',
    sends: 6880,
    inboxPct: 85.6,
    warmth: 0.79,
    signups: 7,
    sendTrend: [5200, 5600, 6000, 6200, 6500, 6700, 6880],
    movedUp: true,
  },
  {
    id: 'ws-8',
    name: 'InboxFirst',
    plan: 'Growth',
    sends: 5720,
    inboxPct: 93.5,
    warmth: 0.90,
    signups: 3,
    sendTrend: [5100, 5200, 5300, 5400, 5500, 5600, 5720],
    movedUp: false,
  },
  {
    id: 'ws-9',
    name: 'Ramp Digital',
    plan: 'Starter',
    sends: 3480,
    inboxPct: 82.1,
    warmth: 0.74,
    signups: 2,
    sendTrend: [2200, 2500, 2700, 3000, 3100, 3300, 3480],
    movedUp: true,
  },
  {
    id: 'ws-10',
    name: 'Signal Flow',
    plan: 'Starter',
    sends: 2140,
    inboxPct: 79.4,
    warmth: 0.68,
    signups: 1,
    sendTrend: [1800, 1850, 1900, 1980, 2020, 2080, 2140],
    movedUp: null,
  },
];

type SortKey = 'sends' | 'inboxPct' | 'warmth' | 'signups';
type SortDir = 'asc' | 'desc';

interface KpiDef {
  label: string;
  value: string;
  sub: string;
  delta: number;
  upIsGood: boolean;
  icon: typeof Mail;
  color: string;
  series: number[];
}

const KPI_CARDS: KpiDef[] = [
  {
    label: 'Total Sends Today',
    value: '78,412',
    sub: 'Warmup emails delivered',
    delta: 8.4,
    upIsGood: true,
    icon: Mail,
    color: '#F26522',
    series: [54200, 57800, 61400, 59700, 63800, 69200, 72100, 78412],
  },
  {
    label: 'Platform Inbox Rate',
    value: '91.4%',
    sub: 'Across all mailboxes',
    delta: 1.8,
    upIsGood: true,
    icon: Inbox,
    color: '#3ddc97',
    series: [88.1, 88.6, 89.2, 89.7, 90.1, 90.6, 91.0, 91.4],
  },
  {
    label: 'Avg Warmth Score',
    value: '0.86',
    sub: 'Sender reputation index',
    delta: 2.3,
    upIsGood: true,
    icon: Flame,
    color: '#FF8A4B',
    series: [0.79, 0.80, 0.81, 0.82, 0.83, 0.84, 0.85, 0.86],
  },
  {
    label: 'Active Workspaces',
    value: '218',
    sub: 'This billing cycle',
    delta: 3.8,
    upIsGood: true,
    icon: Users,
    color: '#F26522',
    series: [196, 199, 203, 206, 208, 211, 215, 218],
  },
];

interface MoverEntry {
  name: string;
  metric: string;
  delta: string;
  up: boolean;
  plan: 'Scale' | 'Growth' | 'Starter' | 'Agency';
}

const MOVERS: MoverEntry[] = [
  { name: 'Acme Corp', metric: 'Sends', delta: '+28%', up: true, plan: 'Scale' },
  { name: 'Coldmail Co', metric: 'Inbox %', delta: '+4.1pp', up: true, plan: 'Growth' },
  { name: 'Ramp Digital', metric: 'Warmth', delta: '+0.09', up: true, plan: 'Starter' },
  { name: 'Signal Flow', metric: 'Sends', delta: '-14%', up: false, plan: 'Starter' },
  { name: 'PipelineOS', metric: 'Inbox %', delta: '-2.3pp', up: false, plan: 'Growth' },
  { name: 'GrowthStack', metric: 'Warmth', delta: '+0.06', up: true, plan: 'Agency' },
];

const PLAN_MIX = [
  { name: 'Scale', value: 34, color: '#F26522' },
  { name: 'Agency', value: 28, color: '#FF8A4B' },
  { name: 'Growth', value: 62, color: '#3ddc97' },
  { name: 'Starter', value: 94, color: 'rgba(255,255,255,0.28)' },
];

const WARMTH_DIST = [
  { range: '0.9–1.0', count: 48, color: '#3ddc97' },
  { range: '0.8–0.9', count: 82, color: '#F26522' },
  { range: '0.7–0.8', count: 54, color: '#FF8A4B' },
  { range: '0.6–0.7', count: 22, color: 'rgba(255,255,255,0.28)' },
  { range: '<0.6', count: 12, color: '#ff5c7a' },
];

const PLAN_COLORS: Record<string, string> = {
  Scale: '#F26522',
  Agency: '#FF8A4B',
  Growth: '#3ddc97',
  Starter: 'rgba(255,255,255,0.38)',
};

// ─── Plan badge ───────────────────────────────────────────────────────────────

function PlanChip({ plan }: { plan: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
        background: `${PLAN_COLORS[plan] ?? 'rgba(255,255,255,0.12)'}22`,
        color: PLAN_COLORS[plan] ?? T.dim,
        border: `1px solid ${PLAN_COLORS[plan] ?? 'rgba(255,255,255,0.12)'}55`,
      }}
    >
      {plan}
    </span>
  );
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortTh({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  style,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  style?: CSSProperties;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '10px 12px',
        textAlign: 'right',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: active ? T.accent : T.faint,
        borderBottom: `1px solid ${T.hairline}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        {active ? (
          sortDir === 'desc' ? (
            <ChevronDown size={12} strokeWidth={2.4} />
          ) : (
            <ChevronUp size={12} strokeWidth={2.4} />
          )
        ) : (
          <ChevronDown size={12} strokeWidth={2.4} style={{ opacity: 0.25 }} />
        )}
      </span>
    </th>
  );
}

// ─── Glass panel wrapper ──────────────────────────────────────────────────────

function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...T.glass, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmAnaA3Scoreboard() {
  const [sortKey, setSortKey] = useState<SortKey>('sends');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [metricToggle, setMetricToggle] = useState<SortKey>('sends');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredKpi, setHoveredKpi] = useState<number | null>(null);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  // When metric toggle changes, also update sort key
  const handleToggle = (k: SortKey) => {
    setMetricToggle(k);
    setSortKey(k);
    setSortDir('desc');
  };

  const sorted = useMemo(() => {
    return [...WORKSPACES].sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [sortKey, sortDir]);

  const maxSends = Math.max(...WORKSPACES.map((w) => w.sends));
  const maxInbox = Math.max(...WORKSPACES.map((w) => w.inboxPct));
  const maxWarmth = Math.max(...WORKSPACES.map((w) => w.warmth));
  const maxSignups = Math.max(...WORKSPACES.map((w) => w.signups));

  const getBarMax = (k: SortKey): number => {
    if (k === 'sends') return maxSends;
    if (k === 'inboxPct') return maxInbox;
    if (k === 'warmth') return maxWarmth;
    return maxSignups;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 24px 40px',
        color: T.text,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        boxSizing: 'border-box',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ ...T.micro, marginBottom: 6 }}>
            <Trophy size={10} strokeWidth={2.4} style={{ display: 'inline', marginRight: 4 }} />
            Platform Analytics · Scoreboard
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Workspace League
          </h1>
          <p style={{ fontSize: 13, color: T.dim, margin: '5px 0 0' }}>
            Ranked by performance · 30-day rolling window · May 2026
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            padding: '6px 10px',
          }}
        >
          <Activity size={13} strokeWidth={2.2} style={{ color: T.success }} />
          <span style={{ fontSize: 12, color: T.dim }}>Live · updated 3 min ago</span>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 14,
          marginBottom: 20,
        }}
      >
        {KPI_CARDS.map((k, i) => {
          const up = k.delta >= 0 ? k.upIsGood : !k.upIsGood;
          const hovered = hoveredKpi === i;
          return (
            <Panel
              key={k.label}
              style={{
                padding: '16px 18px 14px',
                cursor: 'default',
                transition: 'background 0.2s, transform 0.2s',
                background: hovered
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,255,255,0.05)',
                transform: hovered ? 'translateY(-2px)' : 'none',
              }}
            >
              <div
                onMouseEnter={() => setHoveredKpi(i)}
                onMouseLeave={() => setHoveredKpi(null)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ ...T.micro }}>{k.label}</span>
                  <k.icon size={14} strokeWidth={2.2} style={{ color: k.color }} />
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {k.value}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 12,
                      fontWeight: 700,
                      color: up ? T.success : T.danger,
                    }}
                  >
                    {up ? (
                      <ArrowUpRight size={12} strokeWidth={2.4} />
                    ) : (
                      <ArrowDownRight size={12} strokeWidth={2.4} />
                    )}
                    {Math.abs(k.delta).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 10, color: T.faint }}>{k.sub}</span>
                </div>
                <div style={{ marginTop: 10, height: 28 }}>
                  <Spark data={k.series} color={k.color} width={180} height={28} />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {/* ── Main row: Leaderboard + Movers ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: 14,
          marginBottom: 14,
          alignItems: 'start',
        }}
      >
        {/* Leaderboard */}
        <Panel style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header area */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 12px',
              borderBottom: `1px solid ${T.hairline}`,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Medal size={16} strokeWidth={2.2} style={{ color: T.accent }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Workspace Rankings</span>
            </div>
            {/* Metric toggle */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 8,
                padding: 3,
              }}
            >
              {(
                [
                  { k: 'sends' as SortKey, label: 'Sends' },
                  { k: 'inboxPct' as SortKey, label: 'Inbox %' },
                  { k: 'warmth' as SortKey, label: 'Warmth' },
                ] as const
              ).map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleToggle(k)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'background 0.18s, color 0.18s',
                    background: metricToggle === k ? T.accent : 'transparent',
                    color: metricToggle === k ? '#fff' : T.dim,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '10px 12px 10px 20px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: T.faint,
                      borderBottom: `1px solid ${T.hairline}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Rank · Workspace
                  </th>
                  <th
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: T.faint,
                      borderBottom: `1px solid ${T.hairline}`,
                    }}
                  >
                    Plan
                  </th>
                  <SortTh
                    col="sends"
                    label="Sends"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortTh
                    col="inboxPct"
                    label="Inbox %"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortTh
                    col="warmth"
                    label="Warmth"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortTh
                    col="signups"
                    label="Signups"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <th
                    style={{
                      padding: '10px 20px 10px 12px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: T.faint,
                      borderBottom: `1px solid ${T.hairline}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {metricToggle === 'sends'
                      ? 'Send share'
                      : metricToggle === 'inboxPct'
                      ? 'Inbox bar'
                      : 'Warmth bar'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const rank = idx + 1;
                  const isHovered = hoveredRow === row.id;
                  return (
                    <tr
                      key={row.id}
                      onMouseEnter={() => setHoveredRow(row.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        background: isHovered ? T.rowHover : 'transparent',
                        transition: 'background 0.15s',
                        cursor: 'default',
                      }}
                    >
                      {/* Rank + name */}
                      <td
                        style={{
                          padding: '12px 12px 12px 20px',
                          borderBottom: `1px solid ${T.hairline}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <RankBadge rank={rank} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
                            <div
                              style={{
                                fontSize: 10,
                                color: T.faint,
                                marginTop: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              {row.movedUp === true && (
                                <ArrowUp size={10} style={{ color: T.success }} />
                              )}
                              {row.movedUp === false && (
                                <ArrowDown size={10} style={{ color: T.danger }} />
                              )}
                              {row.movedUp === true
                                ? 'Up from yesterday'
                                : row.movedUp === false
                                ? 'Down from yesterday'
                                : 'Unchanged'}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Plan */}
                      <td
                        style={{
                          padding: '12px',
                          borderBottom: `1px solid ${T.hairline}`,
                        }}
                      >
                        <PlanChip plan={row.plan} />
                      </td>
                      {/* Sends */}
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${T.hairline}`,
                          fontWeight: sortKey === 'sends' ? 700 : 400,
                          color: sortKey === 'sends' ? T.text : T.dim,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.sends.toLocaleString()}
                      </td>
                      {/* Inbox % */}
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${T.hairline}`,
                          fontWeight: sortKey === 'inboxPct' ? 700 : 400,
                          color:
                            sortKey === 'inboxPct'
                              ? row.inboxPct >= 90
                                ? T.success
                                : row.inboxPct >= 85
                                ? T.warning
                                : T.danger
                              : T.dim,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.inboxPct.toFixed(1)}%
                      </td>
                      {/* Warmth */}
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${T.hairline}`,
                          fontWeight: sortKey === 'warmth' ? 700 : 400,
                          color:
                            sortKey === 'warmth'
                              ? row.warmth >= 0.85
                                ? T.success
                                : row.warmth >= 0.75
                                ? T.warning
                                : T.danger
                              : T.dim,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.warmth.toFixed(2)}
                      </td>
                      {/* Signups */}
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${T.hairline}`,
                          fontWeight: sortKey === 'signups' ? 700 : 400,
                          color: sortKey === 'signups' ? T.text : T.dim,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {row.signups}
                      </td>
                      {/* SparkBar for active metric */}
                      <td
                        style={{
                          padding: '12px 20px 12px 12px',
                          borderBottom: `1px solid ${T.hairline}`,
                        }}
                      >
                        <SparkBar
                          value={row[metricToggle] as number}
                          max={getBarMax(metricToggle)}
                          color={
                            rank === 1
                              ? '#FFD700'
                              : rank === 2
                              ? '#C0C0C0'
                              : rank === 3
                              ? '#CD7F32'
                              : PLAN_COLORS[row.plan] ?? T.accent
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Movers panel */}
        <Panel style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Star size={14} strokeWidth={2.2} style={{ color: T.accentMid }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Top Movers</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {MOVERS.map((m, i) => (
              <div
                key={`${m.name}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < MOVERS.length - 1 ? `1px solid ${T.hairline}` : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>
                    {m.metric}
                    <span style={{ marginLeft: 4 }}>
                      <PlanChip plan={m.plan} />
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 12,
                    fontWeight: 700,
                    color: m.up ? T.success : T.danger,
                  }}
                >
                  {m.up ? (
                    <TrendingUp size={12} strokeWidth={2.4} />
                  ) : (
                    <TrendingDown size={12} strokeWidth={2.4} />
                  )}
                  {m.delta}
                </span>
              </div>
            ))}
          </div>

          {/* Mini sparklines for top 3 movers */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${T.hairline}`,
            }}
          >
            <div style={{ ...T.micro, marginBottom: 10 }}>Send trend · top 3</div>
            {WORKSPACES.slice(0, 3).map((w) => (
              <div
                key={w.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 11, color: T.dim, minWidth: 72, flexShrink: 0 }}>
                  {w.name.split(' ')[0]}
                </span>
                <Spark
                  data={w.sendTrend}
                  color={PLAN_COLORS[w.plan] ?? T.accent}
                  width={100}
                  height={22}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Bottom row: Plan mix + Warmth distribution ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
        }}
      >
        {/* Plan mix */}
        <Panel style={{ padding: '16px 20px' }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Users size={10} strokeWidth={2.4} style={{ display: 'inline', marginRight: 4 }} />
            Plan mix · workspace count
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie
                    data={PLAN_MIX}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {PLAN_MIX.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      if (!p) return null;
                      const item = p.payload as { name: string; value: number };
                      return (
                        <div
                          style={{
                            background: 'rgba(20,18,14,0.92)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 8,
                            padding: '5px 9px',
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: T.dim }}>{item.name}: </span>
                          <strong>{item.value}</strong>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_MIX.map((p) => {
                const total = PLAN_MIX.reduce((s, x) => s + x.value, 0);
                const pct = Math.round((p.value / total) * 100);
                return (
                  <div
                    key={p.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: p.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.dim, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{p.value}</span>
                    <span style={{ fontSize: 10, color: T.faint, minWidth: 30, textAlign: 'right' }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* Warmth distribution */}
        <Panel style={{ padding: '16px 20px' }}>
          <div style={{ ...T.micro, marginBottom: 12 }}>
            <Flame size={10} strokeWidth={2.4} style={{ display: 'inline', marginRight: 4 }} />
            Warmth score distribution · all mailboxes
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart
              data={WARMTH_DIST}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                dataKey="range"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.40)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.40)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  if (!p) return null;
                  const item = p.payload as { range: string; count: number };
                  return (
                    <div
                      style={{
                        background: 'rgba(20,18,14,0.92)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '5px 9px',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ color: T.faint, fontSize: 10 }}>{item.range}</div>
                      <strong>{item.count} mailboxes</strong>
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {WARMTH_DIST.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Legend row */}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {WARMTH_DIST.map((d) => (
              <div
                key={d.range}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: d.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: T.faint }}>{d.range}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
