/**
 * Admin System Health Design Candidate: H2 Ops Console
 *
 * "Ops Console" — terminal/operator aesthetic with a live log stream (new line
 * every ~1.8 s, capped, level-filtered), a top metrics bar (queue depth x2,
 * workers, beat tick, throughput msg/s, error rate — all fluctuating), and a
 * right-side subsystem panel with up/down chips + small live gauges.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only.
 * Warm Aurora Glass aesthetic; accent orange #F26522→#FF8A4B; green/red semantics.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  Database,
  Filter,
  HardDrive,
  Mail,
  Network,
  Server,
  ServerCog,
  TerminalSquare,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const C = {
  text:       '#ffffff',
  dim:        'rgba(255,255,255,0.62)',
  faint:      'rgba(255,255,255,0.38)',
  ghost:      'rgba(255,255,255,0.18)',
  accent:     '#F26522',
  accent2:    '#FF8A4B',
  success:    '#3ddc97',
  danger:     '#ff5c7a',
  warning:    '#FF8A4B',
  glass:      'rgba(255,255,255,0.05)',
  glass2:     'rgba(255,255,255,0.08)',
  glass3:     'rgba(255,255,255,0.03)',
  border:     'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
  bg:         'rgba(14,10,6,0.90)',
  surface:    'rgba(26,18,10,0.80)',
  scanline:   'rgba(0,0,0,0.18)',
} as const;

const GLASS: React.CSSProperties = {
  background:          C.glass,
  border:              `1px solid ${C.border}`,
  backdropFilter:      'blur(12px)',
  WebkitBackdropFilter:'blur(12px)',
  borderRadius:        14,
};

const GLASS2: React.CSSProperties = {
  background:          C.glass2,
  border:              `1px solid ${C.border}`,
  backdropFilter:      'blur(8px)',
  WebkitBackdropFilter:'blur(8px)',
  borderRadius:        10,
};

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,monospace',
  fontSize:   12,
  lineHeight: 1.55,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
type FilterMode = 'all' | 'warn+' | 'error';
type SubStatus = 'ok' | 'warn' | 'err' | 'unknown';

interface LogLine {
  id:        number;
  ts:        string;
  level:     LogLevel;
  source:    string;
  message:   string;
}

interface SubSystem {
  id:      string;
  name:    string;
  icon:    typeof Server;
  status:  SubStatus;
  metric:  string;
  hint:    string;
}

interface QueueMetric {
  label: string;
  depth: number;
  rate:  number; // msg/s processed
}

interface WorkerInfo {
  id:     string;
  queue:  string;
  status: 'busy' | 'idle' | 'down';
  task:   string;
}

interface ThroughputPoint {
  t:    string;
  msgs: number;
  errs: number;
}

// ---------------------------------------------------------------------------
// Seed data — static portions
// ---------------------------------------------------------------------------

const SUBSYSTEMS: SubSystem[] = [
  { id: 'postgres',  name: 'Postgres',      icon: Database,  status: 'ok',   metric: 'p95 4.2 ms',  hint: '14 conns / 60'     },
  { id: 'redis',     name: 'Redis',         icon: HardDrive, status: 'ok',   metric: 'p95 0.8 ms',  hint: 'ping 0.4 ms'       },
  { id: 'api',       name: 'API',           icon: Server,    status: 'ok',   metric: '241 rps',     hint: 'uvicorn 4w'        },
  { id: 'worker',    name: 'Worker',        icon: Cpu,       status: 'warn', metric: 'Q-depth 23',  hint: 'celery 2q'         },
  { id: 'beat',      name: 'Beat',          icon: Clock,     status: 'ok',   metric: 'tick 8 s ago', hint: '7 schedules'      },
  { id: 'smtp',      name: 'SMTP fleet',    icon: Mail,      status: 'ok',   metric: '0.6% bounce', hint: 'Gmail/O365/Yahoo'  },
  { id: 'imap',      name: 'IMAP watcher',  icon: Network,   status: 'ok',   metric: '14 polls/m',  hint: 'spam-rescue+reply' },
  { id: 'sentry',    name: 'Sentry',        icon: Zap,       status: 'ok',   metric: '2 evts / 1h', hint: 'rel 2026.05.13.1' },
];

const WORKERS: WorkerInfo[] = [
  { id: 'w1', queue: 'default', status: 'busy', task: 'schedule_warmup_cycle'       },
  { id: 'w2', queue: 'smtp',    status: 'busy', task: 'send_single_warmup_email'    },
  { id: 'w3', queue: 'smtp',    status: 'busy', task: 'send_single_warmup_email'    },
  { id: 'w4', queue: 'default', status: 'idle', task: '—'                           },
  { id: 'w5', queue: 'smtp',    status: 'down', task: '—'                           },
];

// Log source tags + templates
type LogTemplate = { level: LogLevel; source: string; messages: string[] };

const LOG_TEMPLATES: LogTemplate[] = [
  {
    level: 'INFO', source: 'warmup.send',
    messages: [
      'send_single_warmup_email OK mailbox=9f2a peer=peer_inbox#47 latency=1.23s',
      'schedule_warmup_cycle fanned out 38 tasks → smtp queue',
      'ramp_advance_daily: mailbox 7a3e day=12 → target=20',
      'pairing.pick_peer_inbox: workspace_pool hit for ws=1b9c',
    ],
  },
  {
    level: 'INFO', source: 'celery.beat',
    messages: [
      'heartbeat tick scheduled OK (beat alive)',
      'alert_check scan_and_dispatch: 0 alerts fired',
      'daily_rollup: upserted 312 rows for 2026-05-30',
      'peer_rotation hourly_health_check: 0 peers deactivated',
    ],
  },
  {
    level: 'INFO', source: 'imap.watcher',
    messages: [
      'imap_poll mailbox=3c8d OK 2 new → action=star',
      'spam_rescue: moved 1 msg from spam → inbox (mailbox=9f2a)',
      'reply_detected: thread_id=th_882a → warmup_log action=replied',
    ],
  },
  {
    level: 'WARN', source: 'worker.smtp',
    messages: [
      'smtp_sender WARN: mailbox=4b1c auth_err=535 retry 2/3',
      'peer_actions: reputation_score 0.31 near floor (peer_inbox#88)',
      'queue depth smtp > 20 — consider scaling worker count',
    ],
  },
  {
    level: 'WARN', source: 'celery.beat',
    messages: [
      'task warmup_receive latency p95=4.2s > threshold(3s)',
      'daily_target mailbox=7a3e hit 95% quota with 2h remaining',
    ],
  },
  {
    level: 'ERROR', source: 'imap.watcher',
    messages: [
      'imap_poll ERROR mailbox=cc41 IMAP AUTHENTICATE failed (retrying in 60s)',
    ],
  },
  {
    level: 'DEBUG', source: 'api',
    messages: [
      'GET /api/admin/system-health → 200 (12ms)',
      'POST /api/warmup/mailboxes/9f2a/pause → 200 (8ms)',
      'DB pool: 14 active / 46 idle conns (Postgres)',
    ],
  },
];

// Initial log seed — 24 lines
const SEED_LOG_ID = { v: 1 };

function makeLine(forcedTpl?: LogTemplate): LogLine {
  const tpl = forcedTpl ?? LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)]!;
  const msgs = tpl.messages;
  const msg  = msgs[Math.floor(Math.random() * msgs.length)]!;
  const now  = new Date();
  const ts   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
  return { id: SEED_LOG_ID.v++, ts, level: tpl.level, source: tpl.source, message: msg };
}

function buildSeedLog(): LogLine[] {
  const lines: LogLine[] = [];
  for (let i = 0; i < 28; i++) {
    // Bias toward INFO for seed
    const roll = Math.random();
    let tpl: LogTemplate;
    if (roll < 0.60)      tpl = LOG_TEMPLATES[Math.floor(Math.random() * 3)]!;
    else if (roll < 0.82) tpl = LOG_TEMPLATES[3]!;
    else if (roll < 0.92) tpl = LOG_TEMPLATES[4]!;
    else if (roll < 0.96) tpl = LOG_TEMPLATES[5]!;
    else                  tpl = LOG_TEMPLATES[6]!;
    lines.push(makeLine(tpl));
  }
  // Back-date timestamps a bit so they look sequential
  const baseMs = Date.now() - 28 * 1800;
  lines.forEach((l, i) => {
    const d = new Date(baseMs + i * 1800 + Math.random() * 800);
    l.ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
  });
  return lines;
}

// Throughput chart seed — last 20 ticks at ~1.8s each (~36s window)
function buildThroughputSeed(): ThroughputPoint[] {
  const pts: ThroughputPoint[] = [];
  const base = Date.now() - 20 * 1800;
  for (let i = 0; i < 20; i++) {
    const d = new Date(base + i * 1800);
    pts.push({
      t:    `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`,
      msgs: 18 + Math.round(Math.random() * 14),
      errs: Math.random() < 0.25 ? Math.round(Math.random() * 2) : 0,
    });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Level colour + badge
// ---------------------------------------------------------------------------

function levelColor(level: LogLevel): string {
  if (level === 'ERROR') return C.danger;
  if (level === 'WARN')  return C.warning;
  if (level === 'DEBUG') return C.faint;
  return C.success;
}

function LevelBadge({ level }: { level: LogLevel }) {
  const color = levelColor(level);
  const bg    = level === 'ERROR'
    ? 'rgba(255,92,122,0.14)'
    : level === 'WARN'
    ? 'rgba(255,138,75,0.14)'
    : level === 'DEBUG'
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(61,220,151,0.12)';
  return (
    <span style={{
      ...MONO,
      fontSize:      10,
      fontWeight:    700,
      letterSpacing: '0.06em',
      color,
      background:    bg,
      border:        `1px solid ${color}30`,
      borderRadius:  4,
      padding:       '1px 5px',
      flexShrink:    0,
    }}>
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status chip helpers
// ---------------------------------------------------------------------------

function statusColor(s: SubStatus): string {
  if (s === 'ok')   return C.success;
  if (s === 'warn') return C.warning;
  if (s === 'err')  return C.danger;
  return C.faint;
}

function StatusDot({ status }: { status: SubStatus }) {
  const color = statusColor(status);
  const isPulsing = status === 'ok' || status === 'warn';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <span style={{
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   color,
        display:      'block',
        boxShadow:    `0 0 6px ${color}88`,
      }} />
      {isPulsing && (
        <span style={{
          position:     'absolute',
          inset:        0,
          borderRadius: '50%',
          background:   color,
          opacity:      0.4,
          animation:    'pulse-ring 2s ease-out infinite',
        }} />
      )}
    </span>
  );
}

function StatusIcon({ status }: { status: SubStatus }) {
  const color = statusColor(status);
  const size = 14;
  if (status === 'ok')      return <CheckCircle2 size={size} style={{ color }} />;
  if (status === 'warn')    return <AlertTriangle size={size} style={{ color }} />;
  if (status === 'err')     return <XCircle size={size} style={{ color }} />;
  return <Circle size={size} style={{ color }} />;
}

// ---------------------------------------------------------------------------
// Queue depth fluctuation
// ---------------------------------------------------------------------------

function fluctuate(val: number, range: number): number {
  return Math.max(0, val + Math.round((Math.random() - 0.5) * range * 2));
}

// ---------------------------------------------------------------------------
// Top metrics bar
// ---------------------------------------------------------------------------

interface LiveMetrics {
  defaultQ:   number;
  smtpQ:      number;
  workers:    number; // active
  beatAge:    number; // seconds since last tick
  throughput: number; // msg/s
  errRate:    number; // percent
  p95:        number; // ms
}

function MetricsBar({ m }: { m: LiveMetrics }) {
  const metrics: Array<{ label: string; value: string; sub?: string; accent?: boolean; warn?: boolean; danger?: boolean }> = [
    {
      label: 'DEFAULT QUEUE',
      value: String(m.defaultQ),
      sub: 'depth',
      warn: m.defaultQ > 15,
      danger: m.defaultQ > 30,
    },
    {
      label: 'SMTP QUEUE',
      value: String(m.smtpQ),
      sub: 'depth',
      warn: m.smtpQ > 20,
      danger: m.smtpQ > 40,
    },
    {
      label: 'WORKERS ACTIVE',
      value: `${m.workers}/5`,
      sub: 'celery',
      warn: m.workers < 3,
    },
    {
      label: 'BEAT TICK',
      value: `${m.beatAge}s`,
      sub: 'ago',
      warn: m.beatAge > 30,
      danger: m.beatAge > 90,
    },
    {
      label: 'THROUGHPUT',
      value: m.throughput.toFixed(1),
      sub: 'msg/s',
      accent: true,
    },
    {
      label: 'ERROR RATE',
      value: `${m.errRate.toFixed(2)}%`,
      sub: 'last 5 m',
      warn: m.errRate > 1,
      danger: m.errRate > 3,
    },
    {
      label: 'P95 LATENCY',
      value: `${m.p95} ms`,
      sub: 'send path',
      warn: m.p95 > 3000,
    },
  ];

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap:                 6,
      padding:             '10px 14px',
      ...GLASS,
      borderRadius:        12,
      marginBottom:        12,
    }}>
      {metrics.map((met) => {
        const color = met.danger
          ? C.danger
          : met.warn
          ? C.warning
          : met.accent
          ? C.accent2
          : C.text;
        return (
          <div key={met.label} style={{
            display:        'flex',
            flexDirection:  'column',
            gap:            2,
            padding:        '6px 10px',
            borderRight:    `1px solid ${C.borderSoft}`,
          }}>
            <span style={{ ...MONO, fontSize: 9, color: C.faint, letterSpacing: '0.08em' }}>
              {met.label}
            </span>
            <span style={{
              ...MONO,
              fontSize:   20,
              fontWeight: 700,
              color,
              lineHeight: 1.1,
              textShadow: color !== C.text ? `0 0 12px ${color}55` : undefined,
            }}>
              {met.value}
            </span>
            {met.sub && (
              <span style={{ ...MONO, fontSize: 9, color: C.faint }}>{met.sub}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log console panel
// ---------------------------------------------------------------------------

interface ConsolePanelProps {
  lines:  LogLine[];
  filter: FilterMode;
  onFilter: (f: FilterMode) => void;
  paused: boolean;
  onPause: () => void;
}

function ConsolePanel({ lines, filter, onFilter, paused, onPause }: ConsolePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines come in and not paused
  useEffect(() => {
    if (!paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, paused]);

  const filtered = lines.filter((l) => {
    if (filter === 'all')   return true;
    if (filter === 'warn+') return l.level === 'WARN' || l.level === 'ERROR';
    return l.level === 'ERROR';
  });

  const FILTERS: Array<{ id: FilterMode; label: string }> = [
    { id: 'all',    label: 'All'    },
    { id: 'warn+',  label: 'Warn+'  },
    { id: 'error',  label: 'Error'  },
  ];

  return (
    <div style={{
      ...GLASS,
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      flex:          1,
      minHeight:     0,
    }}>
      {/* Header bar */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        '8px 14px',
        borderBottom:   `1px solid ${C.borderSoft}`,
        flexShrink:     0,
      }}>
        <TerminalSquare size={14} style={{ color: C.accent }} />
        <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: '0.06em' }}>
          LIVE LOG STREAM
        </span>
        <span style={{ ...MONO, fontSize: 10, color: C.faint, marginLeft: 4 }}>
          {filtered.length} line{filtered.length !== 1 ? 's' : ''} shown
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Filter buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Filter size={10} style={{ color: C.faint }} />
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilter(f.id)}
                style={{
                  ...MONO,
                  fontSize:     10,
                  fontWeight:   filter === f.id ? 700 : 400,
                  color:        filter === f.id ? C.accent : C.dim,
                  background:   filter === f.id ? 'rgba(242,101,34,0.18)' : 'transparent',
                  border:       filter === f.id ? `1px solid rgba(242,101,34,0.40)` : `1px solid transparent`,
                  borderRadius: 4,
                  padding:      '2px 8px',
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Pause/resume */}
          <button
            type="button"
            onClick={onPause}
            style={{
              ...MONO,
              fontSize:     10,
              fontWeight:   600,
              color:        paused ? C.warning : C.dim,
              background:   paused ? 'rgba(255,138,75,0.14)' : 'rgba(255,255,255,0.06)',
              border:       paused ? `1px solid rgba(255,138,75,0.35)` : `1px solid ${C.borderSoft}`,
              borderRadius: 4,
              padding:      '2px 9px',
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}
          >
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div style={{
        flex:      1,
        overflowY: 'auto',
        padding:   '8px 0',
        // Scanline overlay effect via gradient
        backgroundImage: `repeating-linear-gradient(
          to bottom,
          transparent 0px,
          transparent 20px,
          ${C.scanline} 20px,
          ${C.scanline} 21px
        )`,
      }}>
        {filtered.map((line, idx) => (
          <div
            key={line.id}
            style={{
              display:    'flex',
              alignItems: 'baseline',
              gap:        8,
              padding:    '2px 14px',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition: 'background 0.1s',
            }}
          >
            <span style={{ ...MONO, fontSize: 10, color: C.faint, flexShrink: 0, width: 88 }}>
              {line.ts}
            </span>
            <LevelBadge level={line.level} />
            <span style={{ ...MONO, fontSize: 10, color: C.accent2, flexShrink: 0, minWidth: 96 }}>
              [{line.source}]
            </span>
            <span style={{
              ...MONO,
              fontSize:   11,
              color:      line.level === 'ERROR' ? C.danger
                          : line.level === 'WARN' ? C.warning
                          : C.dim,
              wordBreak: 'break-all',
            }}>
              {line.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Throughput sparkline (recharts AreaChart)
// ---------------------------------------------------------------------------

function ThroughputChart({ data }: { data: ThroughputPoint[] }) {
  return (
    <div style={{ ...GLASS2, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Activity size={11} style={{ color: C.accent }} />
        <span style={{ ...MONO, fontSize: 10, color: C.dim, fontWeight: 600 }}>THROUGHPUT (msg/s)</span>
        <span style={{ ...MONO, fontSize: 9, color: C.faint, marginLeft: 'auto' }}>~36s window</span>
      </div>
      <ResponsiveContainer width="100%" height={64}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="hc-msgs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.success} stopOpacity={0.45} />
              <stop offset="100%" stopColor={C.success} stopOpacity={0}  />
            </linearGradient>
            <linearGradient id="hc-errs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.danger} stopOpacity={0.55} />
              <stop offset="100%" stopColor={C.danger} stopOpacity={0}  />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{
              background:   C.surface,
              border:       `1px solid ${C.border}`,
              borderRadius: 8,
              ...MONO,
              fontSize:     10,
              color:        C.text,
            }}
            labelStyle={{ color: C.faint }}
            cursor={{ stroke: C.border }}
          />
          <Area type="monotone" dataKey="msgs" stroke={C.success} fill="url(#hc-msgs)"
            strokeWidth={1.5} dot={false} name="msg/s" />
          <Area type="monotone" dataKey="errs" stroke={C.danger} fill="url(#hc-errs)"
            strokeWidth={1.5} dot={false} name="errors" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker list
// ---------------------------------------------------------------------------

function WorkerList({ workers }: { workers: WorkerInfo[] }) {
  const statusColor2 = (s: WorkerInfo['status']): string => {
    if (s === 'busy') return C.success;
    if (s === 'idle') return C.faint;
    return C.danger;
  };

  return (
    <div style={{ ...GLASS2, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Cpu size={11} style={{ color: C.accent }} />
        <span style={{ ...MONO, fontSize: 10, color: C.dim, fontWeight: 600 }}>WORKERS</span>
        <span style={{ ...MONO, fontSize: 9, color: C.faint, marginLeft: 'auto' }}>
          {workers.filter(w => w.status !== 'down').length}/{workers.length} alive
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {workers.map((w) => (
          <div key={w.id} style={{
            display:     'flex',
            alignItems:  'center',
            gap:         6,
            padding:     '3px 6px',
            background:  w.status === 'down' ? 'rgba(255,92,122,0.07)' : 'transparent',
            borderRadius: 6,
          }}>
            <span style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   statusColor2(w.status),
              flexShrink:   0,
              boxShadow:    `0 0 5px ${statusColor2(w.status)}88`,
            }} />
            <span style={{ ...MONO, fontSize: 9, color: C.faint, width: 28, flexShrink: 0 }}>
              {w.id}
            </span>
            <span style={{
              ...MONO,
              fontSize:   9,
              color:      w.queue === 'smtp' ? C.accent2 : C.dim,
              width:      46,
              flexShrink: 0,
            }}>
              [{w.queue}]
            </span>
            <span style={{ ...MONO, fontSize: 9, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.task}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subsystem chips panel
// ---------------------------------------------------------------------------

function SubsystemPanel({ systems }: { systems: SubSystem[] }) {
  return (
    <div style={{ ...GLASS2, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <ServerCog size={11} style={{ color: C.accent }} />
        <span style={{ ...MONO, fontSize: 10, color: C.dim, fontWeight: 600 }}>SUBSYSTEMS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {systems.map((sys) => {
          const Icon = sys.icon;
          const sc = statusColor(sys.status);
          return (
            <div key={sys.id} style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '5px 8px',
              background:   sys.status === 'err'
                ? 'rgba(255,92,122,0.08)'
                : sys.status === 'warn'
                ? 'rgba(255,138,75,0.07)'
                : 'rgba(255,255,255,0.025)',
              border:       `1px solid ${sys.status !== 'ok' ? sc + '30' : C.borderSoft}`,
              borderRadius: 8,
              transition:   'background 0.3s',
            }}>
              <StatusDot status={sys.status} />
              <Icon size={12} style={{ color: C.faint, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: C.text }}>
                    {sys.name}
                  </span>
                  <StatusIcon status={sys.status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
                  <span style={{ ...MONO, fontSize: 9, color: sc }}>{sys.metric}</span>
                  <span style={{ ...MONO, fontSize: 9, color: C.faint }}>{sys.hint}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue gauge bars
// ---------------------------------------------------------------------------

interface QueueGaugeProps {
  queues: QueueMetric[];
}

function QueueGauges({ queues }: QueueGaugeProps) {
  const maxDepth = 50;
  return (
    <div style={{ ...GLASS2, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Workflow size={11} style={{ color: C.accent }} />
        <span style={{ ...MONO, fontSize: 10, color: C.dim, fontWeight: 600 }}>QUEUE DEPTH</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {queues.map((q) => {
          const pct = Math.min(100, (q.depth / maxDepth) * 100);
          const barColor = pct > 70 ? C.danger : pct > 40 ? C.warning : C.success;
          return (
            <div key={q.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ ...MONO, fontSize: 10, color: C.dim }}>{q.label}</span>
                <span style={{ ...MONO, fontSize: 10, color: barColor, fontWeight: 700 }}>
                  {q.depth} <span style={{ color: C.faint, fontWeight: 400 }}>/ {maxDepth}</span>
                </span>
              </div>
              <div style={{
                height:       6,
                background:   'rgba(255,255,255,0.08)',
                borderRadius: 4,
                overflow:     'hidden',
              }}>
                <div style={{
                  height:           '100%',
                  width:            `${pct}%`,
                  background:       `linear-gradient(90deg, ${barColor}bb, ${barColor})`,
                  borderRadius:     4,
                  transition:       'width 0.5s ease, background 0.5s',
                  boxShadow:        `0 0 8px ${barColor}66`,
                }} />
              </div>
              <div style={{ ...MONO, fontSize: 9, color: C.faint, marginTop: 2 }}>
                {q.rate.toFixed(1)} msg/s processed
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

const MAX_LOG_LINES = 200;

export function AdmHlthH2Console() {
  const [logs,   setLogs]   = useState<LogLine[]>(buildSeedLog);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Live metrics state
  const [metrics, setMetrics] = useState<LiveMetrics>({
    defaultQ:   9,
    smtpQ:      23,
    workers:    4,
    beatAge:    8,
    throughput: 22.4,
    errRate:    0.34,
    p95:        1230,
  });

  // Queue gauges
  const [queues, setQueues] = useState<QueueMetric[]>([
    { label: 'default', depth: 9,  rate: 12.2 },
    { label: 'smtp',    depth: 23, rate: 18.7 },
  ]);

  // Throughput chart
  const [throughput, setThroughput] = useState<ThroughputPoint[]>(buildThroughputSeed);

  // Subsystems — mostly static, worker toggles warn
  const [subsystems, setSubsystems] = useState<SubSystem[]>(SUBSYSTEMS);

  const addLogLine = useCallback(() => {
    if (pausedRef.current) return;
    // Pick template with realistic frequency distribution
    const roll = Math.random();
    let tpl: LogTemplate;
    if      (roll < 0.40) tpl = LOG_TEMPLATES[0]!; // warmup.send INFO
    else if (roll < 0.60) tpl = LOG_TEMPLATES[1]!; // beat INFO
    else if (roll < 0.72) tpl = LOG_TEMPLATES[2]!; // imap INFO
    else if (roll < 0.84) tpl = LOG_TEMPLATES[3]!; // worker WARN
    else if (roll < 0.90) tpl = LOG_TEMPLATES[4]!; // beat WARN
    else if (roll < 0.93) tpl = LOG_TEMPLATES[5]!; // imap ERROR
    else                  tpl = LOG_TEMPLATES[6]!; // api DEBUG

    const newLine = makeLine(tpl);
    setLogs((prev) => [...prev.slice(-MAX_LOG_LINES + 1), newLine]);
  }, []);

  const updateMetrics = useCallback(() => {
    setMetrics((prev) => {
      const dq = fluctuate(prev.defaultQ, 3);
      const sq = fluctuate(prev.smtpQ, 4);
      const ba = Math.max(2, Math.min(120, prev.beatAge + Math.round((Math.random() - 0.3) * 4)));
      const tp = Math.max(8, Math.min(40, +(prev.throughput + (Math.random() - 0.48) * 3).toFixed(1)));
      const er = Math.max(0, Math.min(5, +(prev.errRate + (Math.random() - 0.55) * 0.2).toFixed(2)));
      const p  = Math.max(400, Math.min(4200, prev.p95 + Math.round((Math.random() - 0.45) * 200)));
      const wk = Math.random() < 0.08 ? Math.max(2, prev.workers - 1) : Math.min(5, prev.workers + (Math.random() < 0.05 ? 1 : 0));
      return { defaultQ: dq, smtpQ: sq, workers: wk, beatAge: ba, throughput: tp, errRate: er, p95: p };
    });

    setQueues((prev) => prev.map((q) => ({
      ...q,
      depth: fluctuate(q.depth, 4),
      rate:  +Math.max(4, Math.min(32, q.rate + (Math.random() - 0.48) * 2)).toFixed(1),
    })));

    // Append throughput point
    const now = new Date();
    const tPt: ThroughputPoint = {
      t:    `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`,
      msgs: Math.round(18 + Math.random() * 14),
      errs: Math.random() < 0.25 ? Math.round(Math.random() * 2) : 0,
    };
    setThroughput((prev) => [...prev.slice(-39), tPt]);

    // Occasionally flip worker subsystem status
    setSubsystems((prev) => prev.map((s) => {
      if (s.id !== 'worker') return s;
      const roll2 = Math.random();
      const newStatus: SubStatus = roll2 < 0.65 ? 'warn' : roll2 < 0.90 ? 'ok' : 'warn';
      return { ...s, status: newStatus };
    }));
  }, []);

  // Single interval drives both log ticks and metric updates
  useEffect(() => {
    const id = setInterval(() => {
      addLogLine();
      updateMetrics();
    }, 1800);
    return () => clearInterval(id);
  }, [addLogLine, updateMetrics]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const allOkCount  = subsystems.filter((s) => s.status === 'ok').length;
  const warnCount   = subsystems.filter((s) => s.status === 'warn').length;
  const errCount    = subsystems.filter((s) => s.status === 'err').length;
  const overallOk   = errCount === 0 && warnCount === 0;

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.5; }
          60%  { transform: scale(2.4); opacity: 0;   }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @keyframes blink-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .h2c-scroll::-webkit-scrollbar { width: 4px; }
        .h2c-scroll::-webkit-scrollbar-track { background: transparent; }
        .h2c-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
      `}</style>

      <div style={{
        fontFamily:    'system-ui,sans-serif',
        color:         C.text,
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
        padding:       16,
        boxSizing:     'border-box',
        position:      'relative',
      }}>
        {/* Page header */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:           12,
          marginBottom:  12,
          paddingBottom: 12,
          borderBottom:  `1px solid ${C.borderSoft}`,
        }}>
          <TerminalSquare size={18} style={{ color: C.accent }} />
          <div>
            <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>
              OPS CONSOLE
            </div>
            <div style={{ ...MONO, fontSize: 10, color: C.faint }}>
              warmpulse · admin · system health
            </div>
          </div>

          {/* Overall status pill */}
          <div style={{
            marginLeft:   'auto',
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '4px 12px',
            background:   overallOk
              ? 'rgba(61,220,151,0.12)'
              : errCount > 0
              ? 'rgba(255,92,122,0.12)'
              : 'rgba(255,138,75,0.12)',
            border:       `1px solid ${overallOk ? C.success : errCount > 0 ? C.danger : C.warning}40`,
            borderRadius: 20,
          }}>
            <StatusDot status={overallOk ? 'ok' : errCount > 0 ? 'err' : 'warn'} />
            <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: overallOk ? C.success : errCount > 0 ? C.danger : C.warning }}>
              {overallOk
                ? `ALL ${allOkCount} SYSTEMS OK`
                : errCount > 0
                ? `${errCount} SYSTEM${errCount > 1 ? 'S' : ''} DOWN`
                : `${warnCount} SYSTEM${warnCount > 1 ? 'S' : ''} DEGRADED`}
            </span>
          </div>

          {/* Cursor blink — terminal feel */}
          <span style={{
            ...MONO,
            fontSize:  14,
            color:     C.accent,
            animation: 'blink-cursor 1.1s step-end infinite',
            marginLeft: 4,
          }}>_</span>
        </div>

        {/* Metrics bar */}
        <MetricsBar m={metrics} />

        {/* Main 2-column body */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: '1fr 260px',
          gap:                 10,
          flex:                1,
          minHeight:           0,
          height:              'calc(100vh - 200px)',
        }}>
          {/* LEFT — console log */}
          <ConsolePanel
            lines={logs}
            filter={filter}
            onFilter={setFilter}
            paused={paused}
            onPause={togglePause}
          />

          {/* RIGHT — subsystem side panel */}
          <div
            className="h2c-scroll"
            style={{
              display:       'flex',
              flexDirection: 'column',
              overflowY:     'auto',
            }}
          >
            <QueueGauges queues={queues} />
            <WorkerList workers={WORKERS} />
            <ThroughputChart data={throughput} />
            <SubsystemPanel systems={subsystems} />
          </div>
        </div>
      </div>
    </>
  );
}
