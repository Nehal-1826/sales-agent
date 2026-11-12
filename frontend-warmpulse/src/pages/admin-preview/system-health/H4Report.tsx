/**
 * H4Report — "Health Report" design candidate for /admin/system-health.
 * Direction: editorial uptime/SLO report + incident log.
 * Preview-server only (:35001). Self-contained, MOCK data only, inline styles.
 */

import { useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Network,
  Server,
  TrendingDown,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Palette tokens
// ---------------------------------------------------------------------------
const C = {
  accent:   '#F26522',
  accentLt: '#FF8A4B',
  success:  '#3ddc97',
  danger:   '#ff5c7a',
  warning:  '#FF8A4B',
  text:     '#fff',
  dim:      'rgba(255,255,255,0.55)',
  faint:    'rgba(255,255,255,0.28)',
  glass:    'rgba(255,255,255,0.05)',
  border:   '1px solid rgba(255,255,255,0.10)',
  radius:   14,
} as const;

const glassBox = (extra?: React.CSSProperties): React.CSSProperties => ({
  background:   C.glass,
  border:       C.border,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: C.radius,
  ...extra,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Period = '24h' | '7d' | '30d';
type SloState = 'pass' | 'at-risk' | 'breach';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type IncidentStatus = 'resolved' | 'investigating' | 'monitoring';
type SortKey = 'started' | 'subsystem' | 'severity' | 'duration' | 'status';
type SortDir = 'asc' | 'desc';

interface SloCard {
  id: string;
  label: string;
  target: string;
  actual: string;
  actualNum: number;
  targetNum: number;
  higherIsBetter: boolean;
  state: SloState;
  unit: string;
  icon: typeof Server;
}

interface TrendPoint {
  t: string;
  p95: number;
  errRate: number;
}

interface Subsystem {
  id: string;
  name: string;
  icon: typeof Server;
  uptime: number;
  p95: number;
  queueDepth: number | null;
  workerOk: boolean | null;
}

interface Incident {
  id: string;
  started: string;
  subsystem: string;
  severity: Severity;
  duration: string;
  durationMin: number;
  status: IncidentStatus;
  title: string;
}

// ---------------------------------------------------------------------------
// Mock data per period
// ---------------------------------------------------------------------------
const PERIOD_META: Record<Period, {
  uptime: string;
  uptimeSub: string;
  incidents: number;
  mttr: string;
}> = {
  '24h': { uptime: '100.00%', uptimeSub: 'No downtime in the last 24 hours',   incidents: 0,  mttr: '—'    },
  '7d':  { uptime: '99.96%',  uptimeSub: '13 min of degraded service this week', incidents: 2,  mttr: '6m'   },
  '30d': { uptime: '99.91%',  uptimeSub: '39 min downtime across 5 incidents',   incidents: 5,  mttr: '8m'   },
};

const SLO_DATA: Record<Period, SloCard[]> = {
  '24h': [
    { id: 'uptime',  label: 'Uptime',       target: '≥ 99.9%',   actual: '100.00%', actualNum: 100,   targetNum: 99.9,  higherIsBetter: true,  state: 'pass',     unit: '%',  icon: Activity   },
    { id: 'p95',     label: 'p95 Latency',  target: '≤ 200 ms',  actual: '143 ms',  actualNum: 143,   targetNum: 200,   higherIsBetter: false, state: 'pass',     unit: 'ms', icon: Clock      },
    { id: 'errRate', label: 'Error Rate',   target: '≤ 0.5%',    actual: '0.12%',   actualNum: 0.12,  targetNum: 0.5,   higherIsBetter: false, state: 'pass',     unit: '%',  icon: TrendingDown },
    { id: 'queue',   label: 'Queue Health', target: '≤ 50 jobs', actual: '23 jobs', actualNum: 23,    targetNum: 50,    higherIsBetter: false, state: 'pass',     unit: '',   icon: Workflow   },
  ],
  '7d': [
    { id: 'uptime',  label: 'Uptime',       target: '≥ 99.9%',   actual: '99.96%',  actualNum: 99.96, targetNum: 99.9,  higherIsBetter: true,  state: 'pass',     unit: '%',  icon: Activity   },
    { id: 'p95',     label: 'p95 Latency',  target: '≤ 200 ms',  actual: '187 ms',  actualNum: 187,   targetNum: 200,   higherIsBetter: false, state: 'at-risk',  unit: 'ms', icon: Clock      },
    { id: 'errRate', label: 'Error Rate',   target: '≤ 0.5%',    actual: '0.38%',   actualNum: 0.38,  targetNum: 0.5,   higherIsBetter: false, state: 'at-risk',  unit: '%',  icon: TrendingDown },
    { id: 'queue',   label: 'Queue Health', target: '≤ 50 jobs', actual: '41 jobs', actualNum: 41,    targetNum: 50,    higherIsBetter: false, state: 'at-risk',  unit: '',   icon: Workflow   },
  ],
  '30d': [
    { id: 'uptime',  label: 'Uptime',       target: '≥ 99.9%',   actual: '99.91%',  actualNum: 99.91, targetNum: 99.9,  higherIsBetter: true,  state: 'at-risk',  unit: '%',  icon: Activity   },
    { id: 'p95',     label: 'p95 Latency',  target: '≤ 200 ms',  actual: '224 ms',  actualNum: 224,   targetNum: 200,   higherIsBetter: false, state: 'breach',   unit: 'ms', icon: Clock      },
    { id: 'errRate', label: 'Error Rate',   target: '≤ 0.5%',    actual: '0.61%',   actualNum: 0.61,  targetNum: 0.5,   higherIsBetter: false, state: 'breach',   unit: '%',  icon: TrendingDown },
    { id: 'queue',   label: 'Queue Health', target: '≤ 50 jobs', actual: '29 jobs', actualNum: 29,    targetNum: 50,    higherIsBetter: false, state: 'pass',     unit: '',   icon: Workflow   },
  ],
};

// Trend chart: 24h = 24 hourly points, 7d = 7 daily, 30d = 30 daily
function makeTrend(period: Period): TrendPoint[] {
  const seed24h: TrendPoint[] = [
    { t: '00:00', p95: 138, errRate: 0.08 }, { t: '01:00', p95: 134, errRate: 0.06 },
    { t: '02:00', p95: 131, errRate: 0.07 }, { t: '03:00', p95: 129, errRate: 0.05 },
    { t: '04:00', p95: 133, errRate: 0.08 }, { t: '05:00', p95: 141, errRate: 0.10 },
    { t: '06:00', p95: 148, errRate: 0.12 }, { t: '07:00', p95: 155, errRate: 0.14 },
    { t: '08:00', p95: 163, errRate: 0.16 }, { t: '09:00', p95: 158, errRate: 0.14 },
    { t: '10:00', p95: 151, errRate: 0.12 }, { t: '11:00', p95: 149, errRate: 0.11 },
    { t: '12:00', p95: 153, errRate: 0.13 }, { t: '13:00', p95: 159, errRate: 0.15 },
    { t: '14:00', p95: 162, errRate: 0.14 }, { t: '15:00', p95: 156, errRate: 0.12 },
    { t: '16:00', p95: 148, errRate: 0.11 }, { t: '17:00', p95: 145, errRate: 0.10 },
    { t: '18:00', p95: 143, errRate: 0.09 }, { t: '19:00', p95: 140, errRate: 0.09 },
    { t: '20:00', p95: 138, errRate: 0.08 }, { t: '21:00', p95: 136, errRate: 0.08 },
    { t: '22:00', p95: 135, errRate: 0.07 }, { t: '23:00', p95: 143, errRate: 0.12 },
  ];
  const seed7d: TrendPoint[] = [
    { t: 'Mon', p95: 182, errRate: 0.32 }, { t: 'Tue', p95: 190, errRate: 0.38 },
    { t: 'Wed', p95: 196, errRate: 0.45 }, { t: 'Thu', p95: 187, errRate: 0.37 },
    { t: 'Fri', p95: 179, errRate: 0.28 }, { t: 'Sat', p95: 155, errRate: 0.18 },
    { t: 'Sun', p95: 143, errRate: 0.12 },
  ];
  const seed30d: TrendPoint[] = [
    { t: 'May 1',  p95: 168, errRate: 0.22 }, { t: 'May 3',  p95: 175, errRate: 0.28 },
    { t: 'May 5',  p95: 183, errRate: 0.35 }, { t: 'May 7',  p95: 228, errRate: 0.74 },
    { t: 'May 9',  p95: 194, errRate: 0.47 }, { t: 'May 11', p95: 186, errRate: 0.39 },
    { t: 'May 13', p95: 179, errRate: 0.31 }, { t: 'May 15', p95: 210, errRate: 0.62 },
    { t: 'May 17', p95: 195, errRate: 0.48 }, { t: 'May 19', p95: 184, errRate: 0.36 },
    { t: 'May 21', p95: 176, errRate: 0.29 }, { t: 'May 23', p95: 169, errRate: 0.24 },
    { t: 'May 25', p95: 163, errRate: 0.19 }, { t: 'May 27', p95: 158, errRate: 0.16 },
    { t: 'May 29', p95: 153, errRate: 0.13 }, { t: 'May 31', p95: 143, errRate: 0.12 },
  ];
  if (period === '24h') return seed24h;
  if (period === '7d') return seed7d;
  return seed30d;
}

const ALL_INCIDENTS: Incident[] = [
  {
    id: 'INC-031', started: '2026-05-07 14:22', subsystem: 'Worker',
    severity: 'critical', duration: '18 min', durationMin: 18,
    status: 'resolved', title: 'SMTP queue spike — worker OOM killed',
  },
  {
    id: 'INC-030', started: '2026-05-15 09:05', subsystem: 'API',
    severity: 'high', duration: '9 min', durationMin: 9,
    status: 'resolved', title: 'Elevated 5xx — uvicorn DB pool exhausted',
  },
  {
    id: 'INC-029', started: '2026-05-20 03:47', subsystem: 'IMAP',
    severity: 'medium', duration: '6 min', durationMin: 6,
    status: 'resolved', title: 'IMAP watcher poll timeout (Yahoo)',
  },
  {
    id: 'INC-028', started: '2026-05-23 17:31', subsystem: 'Beat',
    severity: 'medium', duration: '4 min', durationMin: 4,
    status: 'resolved', title: 'Beat heartbeat missed — redis blip',
  },
  {
    id: 'INC-027', started: '2026-05-28 11:14', subsystem: 'SMTP',
    severity: 'low', duration: '2 min', durationMin: 2,
    status: 'resolved', title: 'Bounce spike on Gmail (0.8%) — auto-recovered',
  },
];

const PERIOD_INCIDENTS: Record<Period, Incident[]> = {
  '24h': [],
  '7d':  ALL_INCIDENTS.filter((_, i) => i < 2),
  '30d': ALL_INCIDENTS,
};

const SUBSYSTEMS: Subsystem[] = [
  { id: 'postgres', name: 'PostgreSQL',    icon: Database,      uptime: 99.98, p95: 4.2,  queueDepth: null, workerOk: null  },
  { id: 'redis',    name: 'Redis',         icon: HardDrive,     uptime: 100,   p95: 0.8,  queueDepth: null, workerOk: null  },
  { id: 'api',      name: 'API',           icon: Server,        uptime: 99.96, p95: 143,  queueDepth: null, workerOk: null  },
  { id: 'worker',   name: 'Celery Worker', icon: Cpu,           uptime: 99.12, p95: null as unknown as number, queueDepth: 23,   workerOk: true  },
  { id: 'beat',     name: 'Celery Beat',   icon: CalendarClock, uptime: 100,   p95: null as unknown as number, queueDepth: null, workerOk: true  },
  { id: 'smtp',     name: 'SMTP Fleet',    icon: Workflow,      uptime: 99.81, p95: 280,  queueDepth: null, workerOk: null  },
  { id: 'imap',     name: 'IMAP Watcher', icon: Network,       uptime: 99.90, p95: 410,  queueDepth: null, workerOk: null  },
  { id: 'sentry',   name: 'Sentry',        icon: Zap,           uptime: 100,   p95: null as unknown as number, queueDepth: null, workerOk: true  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SEV_COLORS: Record<Severity, string> = {
  critical: '#ff5c7a',
  high:     '#FF8A4B',
  medium:   '#FFB84B',
  low:      'rgba(255,255,255,0.40)',
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  resolved:      '#3ddc97',
  investigating: '#ff5c7a',
  monitoring:    '#FF8A4B',
};

function SloStateChip({ state }: { state: SloState }) {
  const color = state === 'pass' ? C.success : state === 'at-risk' ? C.warning : C.danger;
  const label = state === 'pass' ? 'Pass' : state === 'at-risk' ? 'At risk' : 'Breach';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      background: `${color}22`, color, border: `1px solid ${color}55`,
    }}>
      {state === 'pass'
        ? <CheckCircle2 size={10} strokeWidth={2.4} />
        : <AlertTriangle size={10} strokeWidth={2.4} />}
      {label}
    </span>
  );
}

function SloMeter({ card }: { card: SloCard }) {
  // Compute fill fraction: for higher-is-better, fill = actual/target capped 0–1.
  // For lower-is-better, fill = 1 - (actual/target) capped 0–1.
  const frac = card.higherIsBetter
    ? Math.min(card.actualNum / card.targetNum, 1)
    : Math.max(0, Math.min(1, 1 - (card.actualNum - card.targetNum) / card.targetNum));
  const barColor = card.state === 'pass' ? C.success : card.state === 'at-risk' ? C.warning : C.danger;
  const Icon = card.icon;
  return (
    <div style={{
      ...glassBox({ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: `${C.accent}22`, color: C.accent,
          }}>
            <Icon size={14} strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {card.label}
          </span>
        </div>
        <SloStateChip state={card.state} />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: card.state === 'breach' ? C.danger : C.text, lineHeight: 1 }}>
          {card.actual}
        </span>
      </div>

      {/* Target bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.faint }}>Target: {card.target}</span>
          <span style={{ fontSize: 10, color: C.faint }}>{Math.round(frac * 100)}% of budget</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.round(frac * 100)}%`,
            background: barColor, borderRadius: 4,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

interface ChartTooltipPayload {
  color: string;
  name: string;
  value: number;
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: 'rgba(18,18,28,0.95)', border: C.border,
      borderRadius: 10, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: C.dim, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: C.dim }}>{p.name}:</span>
          <span style={{ color: C.text, fontWeight: 700 }}>{p.value}{p.name === 'p95 ms' ? ' ms' : '%'}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ period }: { period: Period }) {
  const data = makeTrend(period);
  return (
    <div style={{ ...glassBox({ padding: '22px 24px' }) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Latency &amp; Error Rate Trend</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>p95 API response time and 5xx error rate</div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.dim }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.accent, marginRight: 4 }} />p95 ms</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.danger, marginRight: 4 }} />err %</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradP95" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={C.accent}  stopOpacity={0.25} />
              <stop offset="95%" stopColor={C.accent}  stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradErr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={C.danger}  stopOpacity={0.20} />
              <stop offset="95%" stopColor={C.danger}  stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 4" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="t" tick={{ fill: C.faint as string, fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
          />
          <YAxis
            yAxisId="left" tick={{ fill: C.faint as string, fontSize: 10 }}
            axisLine={false} tickLine={false} width={36}
          />
          <YAxis
            yAxisId="right" orientation="right"
            tick={{ fill: C.faint as string, fontSize: 10 }}
            axisLine={false} tickLine={false} width={32}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            yAxisId="left" type="monotone" dataKey="p95"
            name="p95 ms" stroke={C.accent} strokeWidth={2}
            fill="url(#gradP95)" dot={false} activeDot={{ r: 4, fill: C.accent }}
          />
          <Area
            yAxisId="right" type="monotone" dataKey="errRate"
            name="err %" stroke={C.danger} strokeWidth={2}
            fill="url(#gradErr)" dot={false} activeDot={{ r: 4, fill: C.danger }}
          />
          <Legend wrapperStyle={{ display: 'none' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<IncidentStatus, number> = { investigating: 0, monitoring: 1, resolved: 2 };

function IncidentTable({ incidents }: { incidents: Incident[] }) {
  const [sortKey,  setSortKey]  = useState<SortKey>('started');
  const [sortDir,  setSortDir]  = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleSort = useCallback((key: SortKey) => {
    setSortDir((d) => (sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
    setSortKey(key);
  }, [sortKey]);

  const sorted = [...incidents].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'started')   cmp = a.started.localeCompare(b.started);
    if (sortKey === 'subsystem') cmp = a.subsystem.localeCompare(b.subsystem);
    if (sortKey === 'severity')  cmp = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (sortKey === 'duration')  cmp = a.durationMin - b.durationMin;
    if (sortKey === 'status')    cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown size={10} strokeWidth={2.4} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={10} strokeWidth={2.4} style={{ color: C.accent }} />
      : <ChevronDown size={10} strokeWidth={2.4} style={{ color: C.accent }} />;
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700,
    color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em',
    textAlign: 'left', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', fontSize: 12, color: C.text,
    borderTop: '1px solid rgba(255,255,255,0.07)',
  };

  if (incidents.length === 0) {
    return (
      <div style={{ ...glassBox({ padding: '40px 24px', textAlign: 'center' }) }}>
        <CheckCircle2 size={28} strokeWidth={1.8} style={{ color: C.success, marginBottom: 10 }} />
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>No incidents in this period</div>
        <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>All systems ran cleanly.</div>
      </div>
    );
  }

  return (
    <div style={{ ...glassBox({ overflow: 'hidden' }) }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
              {([
                ['started',   'Started'],
                ['subsystem', 'Subsystem'],
                ['severity',  'Severity'],
                ['duration',  'Duration'],
                ['status',    'Status'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} style={thStyle} onClick={() => toggleSort(key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {label} <SortIcon col={key} />
                  </span>
                </th>
              ))}
              <th style={{ ...thStyle, cursor: 'default' }}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inc) => {
              const isOpen = expanded === inc.id;
              return (
                <tr
                  key={inc.id}
                  onClick={() => setExpanded(isOpen ? null : inc.id)}
                  style={{
                    cursor: 'pointer',
                    background: isOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ color: C.dim, fontFeatureSettings: '"tnum"', fontSize: 11 }}>
                      {inc.started}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: 'rgba(255,255,255,0.07)', color: C.text,
                    }}>
                      {inc.subsystem}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: `${SEV_COLORS[inc.severity]}22`,
                      color: SEV_COLORS[inc.severity],
                      border: `1px solid ${SEV_COLORS[inc.severity]}44`,
                    }}>
                      {inc.severity}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFeatureSettings: '"tnum"', color: C.dim, fontSize: 11 }}>
                    {inc.duration}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: `${STATUS_COLORS[inc.status]}22`,
                      color: STATUS_COLORS[inc.status],
                      border: `1px solid ${STATUS_COLORS[inc.status]}44`,
                    }}>
                      {inc.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: C.dim, fontSize: 11 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                        {inc.title}
                      </span>
                      {isOpen
                        ? <ChevronUp size={12} strokeWidth={2.4} style={{ flexShrink: 0, color: C.accent }} />
                        : <ChevronDown size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '8px 14px', fontSize: 10, color: C.faint, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {sorted.length} incident{sorted.length !== 1 ? 's' : ''} · click row for detail · click header to sort
      </div>
    </div>
  );
}

function SubsystemRow({ s }: { s: Subsystem }) {
  const Icon = s.icon;
  const upOk = s.uptime >= 99.9;
  const upWarn = s.uptime >= 99.0 && s.uptime < 99.9;
  const uptimeColor = upOk ? C.success : upWarn ? C.warning : C.danger;
  const queueColor = s.queueDepth !== null
    ? (s.queueDepth > 40 ? C.danger : s.queueDepth > 25 ? C.warning : C.success)
    : null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr 80px',
      alignItems: 'center', gap: 12,
      padding: '11px 18px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${C.accent}1A`, color: C.accent, flexShrink: 0,
        }}>
          <Icon size={13} strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</span>
      </div>

      {/* Uptime */}
      <div>
        <div style={{ fontSize: 10, color: C.faint, marginBottom: 3 }}>Uptime</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: uptimeColor }}>
          {s.uptime.toFixed(2)}%
        </span>
      </div>

      {/* p95 */}
      <div>
        <div style={{ fontSize: 10, color: C.faint, marginBottom: 3 }}>p95 latency</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: s.p95 != null ? (s.p95 > 200 ? C.danger : C.text) : C.faint }}>
          {s.p95 != null ? `${s.p95} ms` : '—'}
        </span>
      </div>

      {/* Queue / Worker */}
      <div>
        <div style={{ fontSize: 10, color: C.faint, marginBottom: 3 }}>
          {s.queueDepth !== null ? 'Queue depth' : s.workerOk !== null ? 'Worker' : 'Signal'}
        </div>
        {s.queueDepth !== null
          ? <span style={{ fontSize: 13, fontWeight: 700, color: queueColor ?? C.text }}>{s.queueDepth} jobs</span>
          : s.workerOk !== null
            ? <span style={{ fontSize: 12, fontWeight: 600, color: s.workerOk ? C.success : C.danger }}>
                {s.workerOk ? 'Alive' : 'Down'}
              </span>
            : <span style={{ fontSize: 12, color: C.faint }}>—</span>
        }
      </div>

      {/* Mini uptime pill */}
      <div style={{ textAlign: 'right' }}>
        <span style={{
          padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
          background: `${uptimeColor}22`, color: uptimeColor, border: `1px solid ${uptimeColor}44`,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {upOk ? 'OK' : upWarn ? 'WARN' : 'ERR'}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function AdmHlthH4Report() {
  const [period, setPeriod] = useState<Period>('7d');

  const meta = PERIOD_META[period];
  const sloCards = SLO_DATA[period];
  const incidents = PERIOD_INCIDENTS[period];

  const allPass = sloCards.every((c) => c.state === 'pass');
  const hasBreaches = sloCards.some((c) => c.state === 'breach');
  const headlineColor = allPass ? C.success : hasBreaches ? C.danger : C.warning;
  const headlineLabel = allPass ? 'All SLOs Met' : hasBreaches ? 'SLO Breach' : 'SLOs At Risk';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d0d1a 0%, #130f1e 50%, #0d1a13 100%)',
      color: C.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      padding: '0 0 60px',
    }}>

      {/* ------------------------------------------------------------------ */}
      {/* Masthead                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(242,101,34,0.10) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '40px 40px 36px',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: C.faint,
          }}>
            WARMPULSE · SYSTEM HEALTH
          </span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.faint }} />
          <span style={{ fontSize: 10, color: C.faint }}>SRE Report · generated 2026-05-31</span>
        </div>

        {/* Headline row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {meta.uptime} uptime
              {period === '7d' ? ' this week' : period === '24h' ? ' today' : ' this month'}
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: C.dim, fontWeight: 400 }}>
              {meta.uptimeSub}
            </p>

            {/* Dek strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{meta.incidents}</span>
                <span style={{ fontSize: 12, color: C.dim }}>incident{meta.incidents !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{meta.mttr}</span>
                <span style={{ fontSize: 12, color: C.dim }}>MTTR</span>
              </div>
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: `${headlineColor}22`, color: headlineColor,
                  border: `1px solid ${headlineColor}44`, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {allPass ? <CheckCircle2 size={11} strokeWidth={2.4} /> : <AlertTriangle size={11} strokeWidth={2.4} />}
                  {headlineLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['24h', '7d', '30d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '8px 18px', borderRadius: 30, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 0.2s',
                  border: period === p ? `1px solid ${C.accent}` : '1px solid rgba(255,255,255,0.15)',
                  background: period === p ? `${C.accent}22` : 'rgba(255,255,255,0.05)',
                  color: period === p ? C.accent : C.dim,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Body content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* SLO Cards */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <TrendingUp size={14} strokeWidth={2.4} style={{ color: C.accent }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.dim }}>
              Service Level Objectives
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}>
            {sloCards.map((card) => (
              <SloMeter key={card.id} card={card} />
            ))}
          </div>
        </section>

        {/* Latency / Error Trend Chart */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Activity size={14} strokeWidth={2.4} style={{ color: C.accent }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.dim }}>
              Performance Trend
            </span>
          </div>
          <TrendChart period={period} />
        </section>

        {/* Two-column: Incident Log + Per-subsystem */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}>

          {/* Incident Log */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={14} strokeWidth={2.4} style={{ color: C.warning }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.dim }}>
                Incident Log
              </span>
              {incidents.length > 0 && (
                <span style={{
                  padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                  background: `${C.danger}22`, color: C.danger, border: `1px solid ${C.danger}44`,
                }}>
                  {incidents.length}
                </span>
              )}
            </div>
            <IncidentTable incidents={incidents} />
          </section>

          {/* Per-subsystem uptime summary */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Server size={14} strokeWidth={2.4} style={{ color: C.accent }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.dim }}>
                Per-Subsystem Health
              </span>
            </div>
            <div style={{ ...glassBox({ overflow: 'hidden' }) }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr 80px',
                gap: 12, padding: '9px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.10)',
              }}>
                {['Service', 'Uptime', 'p95', 'Queue/Worker', 'Status'].map((h) => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {h}
                  </span>
                ))}
              </div>
              {SUBSYSTEMS.map((s) => <SubsystemRow key={s.id} s={s} />)}
              <div style={{ padding: '8px 18px', fontSize: 10, color: C.faint }}>
                8 subsystems · static snapshot for period
              </div>
            </div>
          </section>

        </div>

        {/* Footer dek */}
        <div style={{
          ...glassBox({ padding: '16px 22px' }),
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: C.faint,
        }}>
          <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: C.success, flexShrink: 0 }} />
          <span>
            This report is generated automatically from WarmPulse telemetry.
            SLO targets: uptime ≥ 99.9%, p95 latency ≤ 200 ms, error rate ≤ 0.5%, queue depth ≤ 50 jobs.
            MTTR calculated as median time-to-resolution across resolved incidents.
          </span>
        </div>

      </div>
    </div>
  );
}
