/**
 * Admin System Health Design Candidate: H6 Control Room / NOC
 *
 * "Control Room / NOC" — a network-operations-center video-wall: big status
 * tiles + live tickers + throughput viz + alert feed. A mission-control
 * command wall that is glanceable, energetic, and on-brand warm.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 * Lucide-react + Recharts used for icons / charts.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Mail,
  Network,
  Radio,
  Server,
  ShieldAlert,
  TrendingUp,
  Workflow,
  Zap,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';

// ─── Palette ─────────────────────────────────────────────────────────────────
const T = {
  text:        '#ffffff',
  dim:         'rgba(255,255,255,0.60)',
  faint:       'rgba(255,255,255,0.38)',
  ghost:       'rgba(255,255,255,0.14)',
  hairline:    'rgba(255,255,255,0.08)',
  accent:      '#F26522',
  accentLt:    '#FF8A4B',
  success:     '#3ddc97',
  successDim:  'rgba(61,220,151,0.14)',
  successBrd:  'rgba(61,220,151,0.28)',
  danger:      '#ff5c7a',
  dangerDim:   'rgba(255,92,122,0.14)',
  dangerBrd:   'rgba(255,92,122,0.28)',
  warning:     '#FF8A4B',
  warningDim:  'rgba(255,138,75,0.14)',
  warningBrd:  'rgba(255,138,75,0.28)',
  glass:       'rgba(255,255,255,0.05)',
  glass2:      'rgba(255,255,255,0.08)',
  border:      'rgba(255,255,255,0.10)',
} as const;

type Status = 'ok' | 'warn' | 'err';

function statusColor(s: Status): string {
  if (s === 'ok')   return T.success;
  if (s === 'warn') return T.warning;
  return T.danger;
}
function statusDim(s: Status): string {
  if (s === 'ok')   return T.successDim;
  if (s === 'warn') return T.warningDim;
  return T.dangerDim;
}
function statusBrd(s: Status): string {
  if (s === 'ok')   return T.successBrd;
  if (s === 'warn') return T.warningBrd;
  return T.dangerBrd;
}
function statusLabel(s: Status): string {
  if (s === 'ok')   return 'OPERATIONAL';
  if (s === 'warn') return 'DEGRADED';
  return 'DOWN';
}

// ─── Glass helpers ────────────────────────────────────────────────────────────
function glass(extra?: CSSProperties): CSSProperties {
  return {
    background:           T.glass,
    border:               `1px solid ${T.border}`,
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         16,
    ...extra,
  };
}
function glass2(extra?: CSSProperties): CSSProperties {
  return {
    background:           T.glass2,
    border:               `1px solid ${T.border}`,
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         12,
    ...extra,
  };
}

// ─── Mock static data ─────────────────────────────────────────────────────────
interface Subsystem {
  id:      string;
  name:    string;
  icon:    typeof Server;
  status:  Status;
  uptime:  string;
  metric:  string;
  hint:    string;
}

const SUBSYSTEMS: Subsystem[] = [
  { id: 'api',    name: 'API Server',     icon: Server,       status: 'ok',   uptime: '99.97%', metric: '236 rps',    hint: 'uvicorn · 4 workers'   },
  { id: 'pg',     name: 'Postgres',       icon: Database,     status: 'ok',   uptime: '99.98%', metric: 'p95 4.2 ms', hint: '14/60 connections'      },
  { id: 'redis',  name: 'Redis',          icon: HardDrive,    status: 'ok',   uptime: '100%',   metric: 'p95 0.8 ms', hint: 'ping ok · 2 dbs'        },
  { id: 'worker', name: 'Celery Worker',  icon: Cpu,          status: 'warn', uptime: '99.12%', metric: '23 queued',  hint: 'default + smtp queues'  },
  { id: 'beat',   name: 'Celery Beat',    icon: CalendarClock,status: 'ok',   uptime: '100%',   metric: 'tick 8s ago',hint: '7 schedules active'     },
  { id: 'smtp',   name: 'SMTP Fleet',     icon: Mail,         status: 'ok',   uptime: '99.81%', metric: '0.6% bounce',hint: 'Gmail · O365 · Yahoo'   },
  { id: 'imap',   name: 'IMAP Watcher',   icon: Network,      status: 'ok',   uptime: '99.90%', metric: '14 polls/m', hint: 'spam-rescue + reply'    },
  { id: 'llm',    name: 'LLM Provider',   icon: Zap,          status: 'ok',   uptime: '100%',   metric: '2 events/h', hint: 'Gemini → Claude fallbk' },
];

interface AlertItem {
  id:   string;
  sev:  Status;
  msg:  string;
  age:  string;
  sub:  string;
}

const INITIAL_ALERTS: AlertItem[] = [
  { id: 'a1', sev: 'warn', msg: 'Worker queue depth elevated: 23 jobs (threshold 20)',                  age: '2m ago',  sub: 'worker'  },
  { id: 'a2', sev: 'warn', msg: 'Peer reputation score recompute took 4.1 s (SLO 3 s)',                age: '11m ago', sub: 'beat'    },
  { id: 'a3', sev: 'ok',   msg: 'SMTP bounce rate returned to normal: 0.6% (was 1.2%)',                age: '34m ago', sub: 'smtp'    },
  { id: 'a4', sev: 'ok',   msg: 'Peer rotation cycle completed — 2 peers deactivated (reputation)',    age: '1h ago',  sub: 'beat'    },
  { id: 'a5', sev: 'warn', msg: 'Celery worker P95 latency 3.8 s — approaching SLO 4 s',              age: '2h ago',  sub: 'worker'  },
  { id: 'a6', sev: 'ok',   msg: 'Postgres slow-query resolved after index rebuild on warmup_logs',     age: '3h ago',  sub: 'pg'      },
  { id: 'a7', sev: 'err',  msg: 'IMAP auth error on mbx-319 (Yahoo SMTP password reset required)',     age: '6h ago',  sub: 'imap'    },
  { id: 'a8', sev: 'ok',   msg: 'Beat heartbeat recovered after container restart (OOM)',              age: '18h ago', sub: 'beat'    },
];

// 24-point throughput history (sends/min, queue depth, error rate)
function buildHistory(): Array<{ t: string; sends: number; queue: number; err: number }> {
  const now = new Date();
  const pts: Array<{ t: string; sends: number; queue: number; err: number }> = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60_000);
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const base = 42 + Math.sin(i / 3.5) * 14;
    const wobble = ((i * 37 + 13) % 11) - 5;
    const sends = Math.round(Math.max(12, base + wobble));
    const queue = Math.round(Math.max(0, 8 + Math.sin(i / 2.8) * 9 + ((i * 17) % 7)));
    const err   = Math.round(Math.max(0, 0.4 + Math.sin(i / 5) * 0.8 + ((i * 7) % 3) * 0.15) * 10) / 10;
    pts.push({ t: label, sends, queue, err });
  }
  return pts;
}

const HISTORY_BASE = buildHistory();

// ─── Sub-components ───────────────────────────────────────────────────────────

function NocClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Clock size={13} strokeWidth={2} color={T.dim} />
      <span style={{ fontFamily: 'monospace', fontSize: 13, color: T.dim, letterSpacing: 1 }}>
        {hh}:{mm}:{ss} UTC
      </span>
    </div>
  );
}

// Blinking LED dot
function Led({ status }: { status: Status }) {
  const [bright, setBright] = useState(true);
  useEffect(() => {
    if (status === 'ok') return;
    const id = setInterval(() => setBright((b) => !b), status === 'err' ? 600 : 1200);
    return () => clearInterval(id);
  }, [status]);
  return (
    <span
      style={{
        display:       'inline-block',
        width:          10,
        height:         10,
        borderRadius:   '50%',
        background:     bright ? statusColor(status) : 'transparent',
        border:         `1.5px solid ${statusColor(status)}`,
        boxShadow:      bright ? `0 0 6px 2px ${statusColor(status)}60` : 'none',
        flexShrink:     0,
        transition:     'all 0.25s',
      }}
      aria-hidden
    />
  );
}

// Scanning-line pulse bar used as "activity" indicator
function PulseBar({ color }: { color: string }) {
  const [pos, setPos] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    ref.current = 0;
    const id = setInterval(() => {
      ref.current = (ref.current + 2.2) % 100;
      setPos(ref.current);
    }, 40);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%', height: 3, background: T.hairline, borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          position:   'absolute',
          top:         0,
          left:       `${pos}%`,
          width:       '22%',
          height:      '100%',
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

// Recharts custom tooltip — strictly typed, no extra props
function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const sends = payload[0]?.value ?? 0;
  const queue = payload[1]?.value ?? 0;
  const err   = payload[2]?.value ?? 0;
  return (
    <div style={{ ...glass2(), padding: '8px 12px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: T.dim, marginBottom: 4, fontFamily: 'monospace' }}>{label}</div>
      <div style={{ fontSize: 12, color: T.accentLt, fontFamily: 'monospace' }}>{sends} sends/min</div>
      <div style={{ fontSize: 12, color: T.warning,  fontFamily: 'monospace' }}>{queue} queued</div>
      <div style={{ fontSize: 12, color: T.danger,   fontFamily: 'monospace' }}>{err}% errors</div>
    </div>
  );
}

// Subsystem tile
function SubTile({ sub }: { sub: Subsystem }) {
  const col = statusColor(sub.status);
  return (
    <div
      style={{
        ...glass({
          padding:     '14px 16px',
          borderRadius: 14,
          borderColor:  sub.status !== 'ok' ? statusBrd(sub.status) : T.border,
          background:   sub.status !== 'ok' ? statusDim(sub.status) : T.glass,
          display:      'flex',
          flexDirection: 'column',
          gap:           10,
        }),
      }}
    >
      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width:          32, height: 32, borderRadius: 8,
            background:     `linear-gradient(135deg, ${col}22, ${col}11)`,
            border:         `1px solid ${col}40`,
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink:     0,
          }}>
            <sub.icon size={15} strokeWidth={2} color={col} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{sub.name}</div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{sub.hint}</div>
          </div>
        </div>
        <Led status={sub.status} />
      </div>
      {/* metrics */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.dim }}>{sub.metric}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
          color:    col,
          background: `${col}18`,
          border:   `1px solid ${col}30`,
          borderRadius: 5,
          padding:  '2px 6px',
        }}>
          {statusLabel(sub.status)}
        </span>
      </div>
      {/* uptime */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: T.faint }}>Uptime 90d</span>
        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: col }}>{sub.uptime}</span>
      </div>
      <PulseBar color={col} />
    </div>
  );
}

// Alert feed item
function AlertRow({ item, index }: { item: AlertItem; index: number }) {
  const Icon = item.sev === 'ok' ? CheckCircle2 : item.sev === 'warn' ? AlertTriangle : XCircle;
  const col  = statusColor(item.sev);
  return (
    <div style={{
      display:        'flex',
      alignItems:     'flex-start',
      gap:             10,
      padding:        '10px 14px',
      borderBottom:   `1px solid ${T.hairline}`,
      background:      index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
    }}>
      <div style={{ paddingTop: 1, flexShrink: 0 }}>
        <Icon size={13} strokeWidth={2.2} color={col} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: T.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{item.msg}</div>
        <div style={{ fontSize: 10, color: T.faint, marginTop: 3, fontFamily: 'monospace' }}>
          [{item.sub}] · {item.age}
        </div>
      </div>
    </div>
  );
}

// ─── Live tickers hook ────────────────────────────────────────────────────────
function useLiveTickers() {
  const [sendsMin,   setSendsMin]   = useState(48);
  const [queueDepth, setQueueDepth] = useState(23);
  const [errorRate,  setErrorRate]  = useState(0.6);
  const [beatAge,    setBeatAge]    = useState(8);
  const [history,    setHistory]    = useState(HISTORY_BASE);

  useEffect(() => {
    const id = setInterval(() => {
      setSendsMin((v)  => Math.max(10, Math.min(90, v + (Math.random() * 6 - 3))));
      setQueueDepth((v)=> Math.max(0,  Math.min(60, v + (Math.random() * 4 - 1.5))));
      setErrorRate((v) => Math.max(0,  Math.min(5,  parseFloat((v + (Math.random() * 0.3 - 0.1)).toFixed(1)))));
      setBeatAge((v)   => v >= 60 ? 1 : v + 1);
      setHistory((prev) => {
        const slice = prev.slice(1);
        const last  = prev[prev.length - 1];
        const now   = new Date();
        const label = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const sends = Math.round(Math.max(10, (last?.sends ?? 48) + (Math.random() * 8 - 4)));
        const queue = Math.round(Math.max(0, (last?.queue ?? 23) + (Math.random() * 6 - 2)));
        const err   = parseFloat(Math.max(0, ((last?.err ?? 0.6) + (Math.random() * 0.4 - 0.15))).toFixed(1));
        slice.push({ t: label, sends, queue, err });
        return slice;
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return { sendsMin, queueDepth, errorRate, beatAge, history };
}

// Live alert ticker — rotates newest alert to top every 5 s
function useLiveAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);

  useEffect(() => {
    const INCOMING: AlertItem[] = [
      { id: 'live1', sev: 'ok',   msg: 'SMTP Gmail probe OK — SPF · DKIM · DMARC all passing',                age: 'just now', sub: 'smtp'   },
      { id: 'live2', sev: 'warn', msg: 'Worker smtp queue depth 26 (above threshold 20)',                      age: 'just now', sub: 'worker' },
      { id: 'live3', sev: 'ok',   msg: 'Beat heartbeat tick: schedules 7/7 dispatched on time',               age: 'just now', sub: 'beat'   },
      { id: 'live4', sev: 'warn', msg: 'API p99 latency spike: 420 ms (SLO 400 ms) — 3 min window',           age: 'just now', sub: 'api'    },
      { id: 'live5', sev: 'ok',   msg: 'Peer rotation complete — 186 peers active (0 deactivated this cycle)',age: 'just now', sub: 'beat'   },
    ];
    let cursor = 0;
    const id = setInterval(() => {
      const next = INCOMING[cursor % INCOMING.length];
      if (next) {
        setAlerts((prev) => [next, ...prev.slice(0, 7)]);
      }
      cursor++;
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return alerts;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmHlthH6ControlRoom() {
  const { sendsMin, queueDepth, errorRate, beatAge, history } = useLiveTickers();
  const alerts = useLiveAlerts();

  const overallStatus: Status = SUBSYSTEMS.some((s) => s.status === 'err')
    ? 'err'
    : SUBSYSTEMS.some((s) => s.status === 'warn')
    ? 'warn'
    : 'ok';

  const overallLabel =
    overallStatus === 'ok'   ? 'ALL SYSTEMS OPERATIONAL'
    : overallStatus === 'warn' ? 'SYSTEMS DEGRADED'
    : 'CRITICAL OUTAGE';

  const overallIcon =
    overallStatus === 'ok'   ? CheckCircle2
    : overallStatus === 'warn' ? AlertTriangle
    : ShieldAlert;

  const OverallIcon = overallIcon;
  const acol = statusColor(overallStatus);

  // KPI tickers config
  const kpis: Array<{ label: string; value: string; unit: string; icon: typeof Server; color: string; trend: string }> = [
    { label: 'Sends / min',   value: String(Math.round(sendsMin)),            unit: '/min', icon: TrendingUp,     color: T.accent,   trend: '↑ live' },
    { label: 'Queue depth',   value: String(Math.round(queueDepth)),          unit: 'jobs', icon: Workflow,       color: queueDepth > 20 ? T.warning : T.success, trend: queueDepth > 20 ? '↑ high' : '↓ normal' },
    { label: 'Error rate',    value: String(errorRate),                        unit: '%',    icon: ShieldAlert,    color: errorRate > 1 ? T.danger : T.success, trend: errorRate > 1 ? '↑ alert' : '→ ok' },
    { label: 'Beat tick age', value: String(beatAge),                          unit: 's',    icon: Radio,          color: beatAge > 30 ? T.danger : T.success, trend: beatAge > 30 ? '!! stale' : '✓ live' },
    { label: 'Workers',       value: '4',                                      unit: 'procs',icon: Cpu,            color: T.success,  trend: '→ stable' },
    { label: 'Uptime 90d',    value: '99.84',                                  unit: '%',    icon: Activity,       color: T.accentLt, trend: '↑ on track' },
  ];

  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        gap:             18,
        padding:        '22px 22px',
        minHeight:       '100%',
        boxSizing:       'border-box',
        color:           T.text,
        fontFamily:      '"Inter", system-ui, sans-serif',
      }}
    >
      {/* ── Topbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `linear-gradient(135deg, ${T.accent}33, ${T.accent}11)`,
            border:     `1px solid ${T.accent}40`,
            display:    'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Radio size={14} strokeWidth={2.2} color={T.accent} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: 0.2 }}>WarmPulse NOC</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: 0.5 }}>CONTROL ROOM · SYSTEM HEALTH</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Live pulse dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LiveDot />
            <span style={{ fontSize: 11, color: T.success, fontFamily: 'monospace', letterSpacing: 0.5 }}>LIVE</span>
          </div>
          <NocClock />
        </div>
      </div>

      {/* ── Mega status banner ── */}
      <div style={{
        ...glass({
          padding:     '18px 22px',
          borderRadius: 18,
          borderColor:  statusBrd(overallStatus),
          background:   `linear-gradient(135deg, ${statusDim(overallStatus)}, rgba(255,255,255,0.02))`,
          display:      'flex',
          alignItems:   'center',
          gap:           16,
        }),
      }}>
        <div style={{
          width:  52, height: 52,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${acol}30, ${acol}10)`,
          border:     `1.5px solid ${acol}50`,
          display:    'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <OverallIcon size={24} strokeWidth={2.2} color={acol} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize:    22,
            fontWeight:  800,
            color:       acol,
            letterSpacing: 1.5,
            lineHeight:   1,
            marginBottom: 4,
          }}>
            {overallLabel}
          </div>
          <div style={{ fontSize: 12, color: T.dim }}>
            {SUBSYSTEMS.filter((s) => s.status === 'ok').length} operational ·{' '}
            {SUBSYSTEMS.filter((s) => s.status === 'warn').length} degraded ·{' '}
            {SUBSYSTEMS.filter((s) => s.status === 'err').length} down · {SUBSYSTEMS.length} total
          </div>
        </div>
        {/* mini uptime strip */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 11, color: T.faint }}>30-day composite</div>
          <MiniUptimeStrip />
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: T.accentLt, fontWeight: 700 }}>99.84%</div>
        </div>
      </div>

      {/* ── KPI ticker row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {kpis.map((kpi) => (
          <KpiTicker key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* ── Center: chart + subsystems | alert feed ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

        {/* Left col: throughput chart + subsystem tiles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Live throughput chart */}
          <div style={glass({ padding: '16px 18px' })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Live Throughput</div>
                <div style={{ fontSize: 11, color: T.faint }}>Sends/min · Queue depth · Error rate · last 24 ticks</div>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <LegendDot color={T.accent}   label="Sends/min" />
                <LegendDot color={T.warning}  label="Queue"     />
                <LegendDot color={T.danger}   label="Err %"     />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSends" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={T.accent}  stopOpacity={0.4} />
                    <stop offset="95%" stopColor={T.accent}  stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gQueue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={T.warning} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={T.warning} stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gErr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={T.danger}  stopOpacity={0.3} />
                    <stop offset="95%" stopColor={T.danger}  stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.hairline} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 9, fill: T.faint, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: T.faint, fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={ChartTooltip} />
                <Area type="monotone" dataKey="sends" stroke={T.accent}   strokeWidth={1.8} fill="url(#gSends)" dot={false} />
                <Area type="monotone" dataKey="queue" stroke={T.warning}  strokeWidth={1.5} fill="url(#gQueue)" dot={false} />
                <Area type="monotone" dataKey="err"   stroke={T.danger}   strokeWidth={1.2} fill="url(#gErr)"   dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Subsystem tiles grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {SUBSYSTEMS.map((sub) => (
              <SubTile key={sub.id} sub={sub} />
            ))}
          </div>
        </div>

        {/* Right col: alert feed */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...glass({ padding: 0, overflow: 'hidden' }), display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Feed header */}
            <div style={{
              padding:        '14px 16px',
              borderBottom:   `1px solid ${T.hairline}`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={13} strokeWidth={2.2} color={T.warning} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Alert Feed</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LiveDot small />
                <span style={{ fontSize: 10, color: T.faint, fontFamily: 'monospace' }}>streaming</span>
              </div>
            </div>
            {/* Alert rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {alerts.map((a, i) => (
                <AlertRow key={a.id + i} item={a} index={i} />
              ))}
            </div>
            {/* Feed footer */}
            <div style={{
              padding:     '10px 14px',
              borderTop:   `1px solid ${T.hairline}`,
              fontSize:    10,
              color:       T.faint,
              fontFamily:  'monospace',
              display:     'flex',
              justifyContent: 'space-between',
            }}>
              <span>{alerts.length} events</span>
              <span>new every 5s</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom system metrics strip ── */}
      <div style={{
        ...glass({ padding: '14px 18px' }),
        display:               'grid',
        gridTemplateColumns:   'repeat(5, 1fr)',
        gap:                    1,
      }}>
        {([
          { label: 'DB Connections',  value: '14 / 60',    icon: Database,     color: T.success },
          { label: 'p95 Latency',     value: '4.2 ms',     icon: Activity,     color: T.accentLt },
          { label: 'Bounce Rate',     value: '0.6%',       icon: Mail,         color: T.success },
          { label: 'IMAP Polls',      value: '14 / min',   icon: Network,      color: T.success },
          { label: 'LLM Calls 1h',    value: '2 events',   icon: Zap,          color: T.faint },
        ] as Array<{ label: string; value: string; icon: typeof Server; color: string }>).map((m, i, arr) => (
          <div
            key={m.label}
            style={{
              display:       'flex',
              flexDirection: 'column',
              gap:            4,
              padding:       '0 16px',
              borderRight:   i < arr.length - 1 ? `1px solid ${T.hairline}` : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <m.icon size={11} strokeWidth={2} color={m.color} />
              <span style={{ fontSize: 10, color: T.faint, letterSpacing: 0.3 }}>{m.label}</span>
            </div>
            <span style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: m.color }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function LiveDot({ small }: { small?: boolean }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 900);
    return () => clearInterval(id);
  }, []);
  const sz = small ? 6 : 8;
  return (
    <span style={{
      display:      'inline-block',
      width:         sz,
      height:        sz,
      borderRadius: '50%',
      background:    on ? T.success : 'transparent',
      border:        `1.5px solid ${T.success}`,
      boxShadow:     on ? `0 0 5px 1px ${T.success}80` : 'none',
      transition:    'all 0.3s',
      flexShrink:    0,
    }} />
  );
}

function KpiTicker({ kpi }: { kpi: { label: string; value: string; unit: string; icon: typeof Server; color: string; trend: string } }) {
  return (
    <div style={glass({
      padding:       '12px 14px',
      borderRadius:   12,
      display:       'flex',
      flexDirection: 'column',
      gap:            6,
    })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <kpi.icon size={12} strokeWidth={2.2} color={kpi.color} />
        <span style={{ fontSize: 9, color: kpi.color, fontFamily: 'monospace', letterSpacing: 0.5 }}>{kpi.trend}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>
          {kpi.value}
        </span>
        <span style={{ fontSize: 10, color: T.faint, fontFamily: 'monospace' }}>{kpi.unit}</span>
      </div>
      <div style={{ fontSize: 10, color: T.dim }}>{kpi.label}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: T.faint }}>{label}</span>
    </div>
  );
}

// 30-day mini uptime strip (deterministic)
function MiniUptimeStrip() {
  const days = 30;
  const cells: Array<'ok' | 'warn' | 'err'> = [];
  for (let i = 0; i < days; i++) {
    if (i === 6 || i === 14) cells.push('warn');
    else if (i === 22) cells.push('err');
    else cells.push('ok');
  }
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {cells.map((c, i) => (
        <span
          key={i}
          title={`Day -${days - i}: ${c}`}
          style={{
            display:      'inline-block',
            width:         6,
            height:        18,
            borderRadius:  2,
            background:    c === 'ok' ? T.success : c === 'warn' ? T.warning : T.danger,
            opacity:       c === 'ok' ? 0.7 : 1,
          }}
        />
      ))}
    </div>
  );
}

export default AdmHlthH6ControlRoom;
