/**
 * Admin System Health Design Candidate: H1 Status Board
 *
 * "Status Board" — a statuspage.io-style subsystem grid with 90-day uptime
 * sparkbars, an overall health banner, per-subsystem status dots + metrics,
 * a metrics strip (queue depth / workers / beat tick / p95 / error rate), and
 * an incident timeline. Time-range toggle (24h / 7d / 90d) reshapes the bars.
 *
 * Calm, trustworthy, ops-team feel. Fully self-contained: inline style={{}}
 * only, mock data only, no API / react-query / @/features / @/lib imports.
 * Warm/neutral Aurora Glass palette only — no blue/purple/violet/teal/cyan.
 */

import { useState, type CSSProperties } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  Database,
  HardDrive,
  Cpu,
  CalendarClock,
  Workflow,
  Network,
  Clock,
  Activity,
  Layers,
  TrendingUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.42)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.15)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.15)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.15)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 10,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.42)',
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'err';
type TimeRange = '24h' | '7d' | '90d';

interface Subsystem {
  id: string;
  name: string;
  hint: string;
  icon: typeof Server;
  status: Status;
  uptime90: number; // fraction, 90-day
  uptime7: number;
  uptime24: number;
  metric: string;
  metricLabel: string;
}

interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  start: string;
  duration: string;
  resolved: boolean;
  affected: string[];
  detail: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SUBSYSTEMS: Subsystem[] = [
  {
    id: 'api',
    name: 'API (uvicorn)',
    hint: '4 workers · :8001',
    icon: Server,
    status: 'ok',
    uptime90: 0.9994,
    uptime7: 0.9998,
    uptime24: 1.0,
    metric: '236 rps',
    metricLabel: 'req/s',
  },
  {
    id: 'worker',
    name: 'Celery Worker',
    hint: 'default + smtp queues',
    icon: Cpu,
    status: 'warn',
    uptime90: 0.9912,
    uptime7: 0.9870,
    uptime24: 0.9940,
    metric: '23 queued',
    metricLabel: 'queue depth',
  },
  {
    id: 'beat',
    name: 'Celery Beat',
    hint: '7 schedules active',
    icon: CalendarClock,
    status: 'ok',
    uptime90: 1.0,
    uptime7: 1.0,
    uptime24: 1.0,
    metric: '8s ago',
    metricLabel: 'last tick',
  },
  {
    id: 'postgres',
    name: 'Postgres',
    hint: '14 / 60 connections',
    icon: Database,
    status: 'ok',
    uptime90: 0.9998,
    uptime7: 1.0,
    uptime24: 1.0,
    metric: '4.2 ms',
    metricLabel: 'p95 latency',
  },
  {
    id: 'redis',
    name: 'Redis',
    hint: 'ping ok · 2 dbs',
    icon: HardDrive,
    status: 'ok',
    uptime90: 1.0,
    uptime7: 1.0,
    uptime24: 1.0,
    metric: '0.8 ms',
    metricLabel: 'p95 latency',
  },
  {
    id: 'smtp',
    name: 'SMTP Send',
    hint: 'Gmail · Outlook · Yahoo',
    icon: Workflow,
    status: 'ok',
    uptime90: 0.9981,
    uptime7: 0.9990,
    uptime24: 1.0,
    metric: '0.6%',
    metricLabel: 'bounce rate',
  },
  {
    id: 'imap',
    name: 'IMAP Poll',
    hint: 'spam-rescue + reply',
    icon: Network,
    status: 'ok',
    uptime90: 0.9990,
    uptime7: 0.9995,
    uptime24: 1.0,
    metric: '14 /min',
    metricLabel: 'polls',
  },
];

const INCIDENTS: Incident[] = [
  {
    id: 'inc-003',
    title: 'Celery Worker queue depth spike',
    severity: 'major',
    start: '2026-05-31 · 08:42 UTC',
    duration: 'Ongoing',
    resolved: false,
    affected: ['Celery Worker'],
    detail: 'Queue depth exceeded 20 jobs. SMTP queue congestion due to large warmup cycle. Auto-scaling not triggered. Under investigation.',
  },
  {
    id: 'inc-002',
    title: 'SMTP delivery latency — Gmail throttle',
    severity: 'minor',
    start: '2026-05-29 · 14:18 UTC',
    duration: '22 min',
    resolved: true,
    affected: ['SMTP Send'],
    detail: 'Gmail briefly applied per-IP rate limits during peak send window. Retry logic handled gracefully; no emails lost.',
  },
  {
    id: 'inc-001',
    title: 'Postgres slow query — warmup_logs scan',
    severity: 'minor',
    start: '2026-05-27 · 03:05 UTC',
    duration: '8 min',
    resolved: true,
    affected: ['Postgres', 'API'],
    detail: 'Missing partial index on warmup_logs(mailbox_id, created_at) caused a full table scan under high load. Migration applied; p95 now 4.2ms.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a deterministic uptime strip of N bars. */
function buildStrip(
  uptime: number,
  n: number,
  seed: number,
): Array<'ok' | 'warn' | 'err'> {
  const bars: Array<'ok' | 'warn' | 'err'> = Array(n).fill('ok');
  const downCount = Math.round((1 - uptime) * n * 2.8);
  for (let k = 0; k < downCount; k++) {
    const idx = Math.floor(((k + 1 + seed) * 7919) % n);
    if (bars[idx] === 'ok') {
      bars[idx] = k % 3 === 0 ? 'err' : 'warn';
    }
  }
  return bars;
}

function uptimeForRange(sub: Subsystem, range: TimeRange): number {
  if (range === '24h') return sub.uptime24;
  if (range === '7d') return sub.uptime7;
  return sub.uptime90;
}

function barsForRange(range: TimeRange): number {
  if (range === '24h') return 24; // each bar = 1h
  if (range === '7d') return 42; // each bar = 4h
  return 90; // each bar = 1d
}

function rangeLabel(range: TimeRange): string {
  if (range === '24h') return '24 hours';
  if (range === '7d') return '7 days';
  return '90 days';
}

function statusColor(s: Status): string {
  if (s === 'ok') return T.success;
  if (s === 'warn') return T.warning;
  return T.danger;
}

function statusBg(s: Status): string {
  if (s === 'ok') return T.successDim;
  if (s === 'warn') return T.warningDim;
  return T.dangerDim;
}

function statusLabel(s: Status): string {
  if (s === 'ok') return 'Operational';
  if (s === 'warn') return 'Degraded';
  return 'Outage';
}

function severityColor(sev: Incident['severity']): string {
  if (sev === 'critical') return T.danger;
  if (sev === 'major') return T.warning;
  return 'rgba(255,255,255,0.52)';
}

function severityLabel(sev: Incident['severity']): string {
  if (sev === 'critical') return 'Critical';
  if (sev === 'major') return 'Major';
  return 'Minor';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: statusColor(status),
        boxShadow: `0 0 ${size}px ${statusColor(status)}88`,
        flexShrink: 0,
      }}
    />
  );
}

/** Single uptime sparkbar row with hover tooltip */
function UptimeStrip({
  sub,
  range,
  barSeed,
}: {
  sub: Subsystem;
  range: TimeRange;
  barSeed: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const uptime = uptimeForRange(sub, range);
  const n = barsForRange(range);
  const bars = buildStrip(uptime, n, barSeed);

  function barLabel(idx: number): string {
    if (range === '24h') return `${n - idx}h ago · ${bars[idx]}`;
    if (range === '7d') return `${Math.round(((n - idx) * 4) / 24)}d ago · ${bars[idx]}`;
    return `${n - idx}d ago · ${bars[idx]}`;
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 24 }}>
      {bars.map((b, i) => {
        const col = b === 'ok' ? T.success : b === 'warn' ? T.warning : T.danger;
        const isHov = hoverIdx === i;
        return (
          <div
            key={i}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span
              style={{
                display: 'block',
                width: n <= 24 ? 6 : n <= 42 ? 4 : 3,
                height: isHov ? 22 : b === 'ok' ? 16 : 22,
                borderRadius: 2,
                background: isHov ? col : b === 'ok' ? `${col}88` : col,
                transition: 'height 0.1s, opacity 0.1s',
                opacity: isHov ? 1 : 0.75,
                cursor: 'default',
              }}
            />
            {isHov && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 28,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(10,10,15,0.96)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.text,
                  whiteSpace: 'nowrap',
                  zIndex: 20,
                  pointerEvents: 'none',
                }}
              >
                {barLabel(i)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Header section of the subsystem strip table */
function StripHeader({ range }: { range: TimeRange }) {
  const n = barsForRange(range);
  const lLabel = range === '24h' ? `${n}h ago` : `${range === '7d' ? '7d' : '90d'} ago`;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 0 6px',
        fontSize: 10,
        fontWeight: 600,
        color: T.faint,
        letterSpacing: '0.08em',
      }}
    >
      <span>{lLabel}</span>
      <span>Today</span>
    </div>
  );
}

/** One subsystem row */
function SubsystemRow({
  sub,
  range,
  idx,
}: {
  sub: Subsystem;
  range: TimeRange;
  idx: number;
}) {
  const uptime = uptimeForRange(sub, range);
  const uptimePct = (uptime * 100).toFixed(uptime >= 0.9999 ? 0 : 2);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 110px 80px',
        alignItems: 'center',
        gap: 16,
        padding: '12px 0',
        borderBottom: `1px solid ${T.hairline}`,
      }}
    >
      {/* Name + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: statusBg(sub.status),
            border: `1px solid ${statusColor(sub.status)}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <sub.icon size={15} strokeWidth={2} color={statusColor(sub.status)} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>
            {sub.name}
          </div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{sub.hint}</div>
        </div>
      </div>

      {/* Uptime strip */}
      <UptimeStrip sub={sub} range={range} barSeed={idx * 17 + 3} />

      {/* Uptime % + status pill */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 99,
            background: statusBg(sub.status),
            border: `1px solid ${statusColor(sub.status)}33`,
            fontSize: 11,
            fontWeight: 700,
            color: statusColor(sub.status),
          }}
        >
          <StatusDot status={sub.status} size={6} />
          {statusLabel(sub.status)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>
          {uptimePct === '100' ? '100%' : `${uptimePct}%`}
        </span>
      </div>

      {/* Current metric */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sub.metric}</div>
        <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{sub.metricLabel}</div>
      </div>
    </div>
  );
}

// ─── Metrics strip data ───────────────────────────────────────────────────────

const METRIC_STRIP = [
  { label: 'Queue Depth', value: '23', sub: 'default + smtp', color: T.warning, icon: Layers },
  { label: 'Workers', value: '4', sub: 'celery procs', color: T.success, icon: Cpu },
  { label: 'Beat Tick', value: '8s ago', sub: 'last heartbeat', color: T.success, icon: CalendarClock },
  { label: 'API p95', value: '12.4 ms', sub: 'rolling 5m', color: T.success, icon: Activity },
  { label: 'Error Rate', value: '0.08%', sub: 'last 1h', color: T.success, icon: TrendingUp },
  { label: 'DB p95', value: '4.2 ms', sub: 'postgres', color: T.success, icon: Database },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmHlthH1Board() {
  const [range, setRange] = useState<TimeRange>('90d');
  const [expandedInc, setExpandedInc] = useState<string | null>(null);

  // Overall health derived from subsystem states
  const allOk = SUBSYSTEMS.every((s) => s.status === 'ok');
  const hasWarn = SUBSYSTEMS.some((s) => s.status === 'warn');
  const hasErr = SUBSYSTEMS.some((s) => s.status === 'err');

  const overallStatus: Status = hasErr ? 'err' : hasWarn ? 'warn' : 'ok';

  // Weighted uptime across all subsystems for the selected range
  const overallUptime =
    SUBSYSTEMS.reduce((acc, s) => acc + uptimeForRange(s, range), 0) / SUBSYSTEMS.length;

  const openIncidents = INCIDENTS.filter((i) => !i.resolved);

  return (
    <div
      style={{
        padding: '24px 28px 48px',
        minHeight: '100%',
        fontFamily: 'inherit',
        color: T.text,
      }}
    >
      {/* ── Overall health banner ───────────────────────────────────────────── */}
      <div
        style={{
          ...T.glass,
          borderRadius: 18,
          background: allOk
            ? 'linear-gradient(135deg, rgba(61,220,151,0.08) 0%, rgba(255,255,255,0.04) 60%)'
            : 'linear-gradient(135deg, rgba(255,138,75,0.10) 0%, rgba(255,255,255,0.04) 60%)',
          border: `1px solid ${allOk ? 'rgba(61,220,151,0.20)' : 'rgba(255,138,75,0.22)'}`,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        {/* Big icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: statusBg(overallStatus),
            border: `1px solid ${statusColor(overallStatus)}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {overallStatus === 'ok' ? (
            <CheckCircle2 size={24} strokeWidth={2} color={T.success} />
          ) : overallStatus === 'warn' ? (
            <AlertTriangle size={24} strokeWidth={2} color={T.warning} />
          ) : (
            <XCircle size={24} strokeWidth={2} color={T.danger} />
          )}
        </div>

        {/* Title + sub */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
            {overallStatus === 'ok'
              ? 'All systems operational'
              : overallStatus === 'warn'
              ? 'Some systems degraded'
              : 'Outage detected'}
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>
            Refreshed 4 seconds ago · {openIncidents.length} open incident{openIncidents.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Uptime summary chips */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: `Uptime · ${rangeLabel(range)}`, value: `${(overallUptime * 100).toFixed(2)}%` },
            { label: 'Incidents · 30d', value: '2' },
            { label: 'MTTR', value: '14 min' },
            { label: 'Subsystems', value: `${SUBSYSTEMS.filter((s) => s.status === 'ok').length}/${SUBSYSTEMS.length} OK` },
          ].map((chip) => (
            <div
              key={chip.label}
              style={{
                ...T.glassTight,
                padding: '8px 14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{chip.value}</div>
              <div style={{ fontSize: 10, color: T.faint, marginTop: 1, whiteSpace: 'nowrap' }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Metrics strip ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {METRIC_STRIP.map((m) => (
          <div
            key={m.label}
            style={{
              ...T.glassTight,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <m.icon size={12} strokeWidth={2} color={m.color} />
              <span style={{ ...T.micro }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, lineHeight: 1 }}>
              {m.value}
            </div>
            <div style={{ fontSize: 10, color: T.faint }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Subsystem grid ─────────────────────────────────────────────────── */}
      <div style={{ ...T.glass, padding: '20px 24px', marginBottom: 20 }}>
        {/* Section header + time range toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div style={{ ...T.micro, marginBottom: 4 }}>
              <Server size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
              Subsystem status
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
              {SUBSYSTEMS.length} services · hover bars for day detail
            </div>
          </div>

          {/* Time range toggle */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {(['24h', '7d', '90d'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  border: 'none',
                  background: range === r ? T.accent : 'transparent',
                  color: range === r ? '#fff' : T.dim,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  letterSpacing: '0.04em',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 4,
            fontSize: 10,
            color: T.faint,
            fontWeight: 600,
            letterSpacing: '0.08em',
          }}
        >
          {[
            { col: T.success, label: 'Operational' },
            { col: T.warning, label: 'Degraded' },
            { col: T.danger, label: 'Outage' },
          ].map((leg) => (
            <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: leg.col,
                }}
              />
              {leg.label}
            </div>
          ))}
        </div>

        {/* Strip header (dates) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr 110px 80px',
            gap: 16,
            paddingBottom: 4,
          }}
        >
          <span style={{ ...T.micro }}>Subsystem</span>
          <StripHeader range={range} />
          <span style={{ ...T.micro, textAlign: 'right' }}>Status</span>
          <span style={{ ...T.micro, textAlign: 'right' }}>Metric</span>
        </div>

        {/* Rows */}
        {SUBSYSTEMS.map((sub, idx) => (
          <SubsystemRow key={sub.id} sub={sub} range={range} idx={idx} />
        ))}
      </div>

      {/* ── Incident timeline ──────────────────────────────────────────────── */}
      <div style={{ ...T.glass, padding: '20px 24px' }}>
        <div style={{ ...T.micro, marginBottom: 10 }}>
          <AlertCircle size={10} style={{ display: 'inline', marginRight: 4 }} strokeWidth={2.2} />
          Incident timeline
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16 }}>
          Recent incidents
        </div>

        {INCIDENTS.map((inc) => {
          const isOpen = expandedInc === inc.id;
          const sevColor = severityColor(inc.severity);
          return (
            <div
              key={inc.id}
              style={{
                borderRadius: 12,
                border: `1px solid ${isOpen ? sevColor + '44' : T.hairline}`,
                background: isOpen ? `${sevColor}08` : 'rgba(255,255,255,0.03)',
                marginBottom: 10,
                overflow: 'hidden',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              {/* Row header (always visible) */}
              <button
                type="button"
                onClick={() => setExpandedInc(isOpen ? null : inc.id)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 16px',
                  textAlign: 'left',
                }}
              >
                {/* Severity dot */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: inc.resolved ? 'rgba(255,255,255,0.25)' : sevColor,
                    boxShadow: inc.resolved ? 'none' : `0 0 8px ${sevColor}88`,
                    flexShrink: 0,
                  }}
                />

                {/* Title + tags */}
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: inc.resolved ? T.dim : T.text,
                      marginBottom: 3,
                    }}
                  >
                    {inc.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {inc.affected.map((a) => (
                      <span
                        key={a}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.07)',
                          color: T.faint,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Start + duration */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: T.faint }}>{inc.start}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: inc.resolved ? T.dim : sevColor, marginTop: 2 }}>
                    {inc.resolved ? (
                      <>
                        <Clock size={10} style={{ display: 'inline', marginRight: 3 }} strokeWidth={2} />
                        {inc.duration}
                      </>
                    ) : (
                      <>
                        <RefreshCw size={10} style={{ display: 'inline', marginRight: 3 }} strokeWidth={2} />
                        Ongoing
                      </>
                    )}
                  </div>
                </div>

                {/* Resolved / Open pill + expand chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 99,
                      background: inc.resolved ? 'rgba(61,220,151,0.12)' : `${sevColor}18`,
                      color: inc.resolved ? T.success : sevColor,
                      border: `1px solid ${inc.resolved ? 'rgba(61,220,151,0.25)' : sevColor + '33'}`,
                    }}
                  >
                    {inc.resolved ? 'Resolved' : severityLabel(inc.severity)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: T.faint,
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      lineHeight: 1,
                    }}
                  >
                    ▾
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div
                  style={{
                    padding: '0 16px 16px 40px',
                    fontSize: 12,
                    color: T.dim,
                    lineHeight: 1.65,
                    borderTop: `1px solid ${T.hairline}`,
                    paddingTop: 12,
                  }}
                >
                  {inc.detail}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer note */}
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: T.faint,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <CheckCircle2 size={11} strokeWidth={2} color={T.success} />
          No incidents in the last 24h beyond what is shown above. Subscribe to updates via webhook or email.
        </div>
      </div>
    </div>
  );
}

export default AdmHlthH1Board;
