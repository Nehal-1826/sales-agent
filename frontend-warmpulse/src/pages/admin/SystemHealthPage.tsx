/**
 * Admin System Health — H8 Gauge Cluster (live data)
 *
 * Aviation/automotive cockpit of circular SVG gauges with animated needles,
 * threshold arcs (green/orange/red zones), live numeric readouts, an overall
 * status header, and a derived alert panel.
 *
 * Data source: useSystemHealth() — zero mocks, zero Math.random().
 * Needles re-render when health.data changes (hook refetches every 15 s).
 * Clock uses real new Date() ticking every second.
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  HardDrive,
  MailCheck,
  MailOpen,
  Server,
  Wifi,
  Workflow,
  XCircle,
  Gauge,
  Zap,
} from 'lucide-react';
import {
  useSystemHealth,
  type WorkerRow,
  type SystemHealthBundle,
} from '@/features/admin/system-health/api';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.15)' as const,
  accent: '#F26522' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.18)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.18)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.18)' as const,
  glass: 'rgba(255,255,255,0.05)' as const,
  glassMid: 'rgba(255,255,255,0.08)' as const,
  border: 'rgba(255,255,255,0.10)' as const,
  radius: 16 as const,
  radiusSm: 10 as const,
};

function glassBox(extra?: CSSProperties): CSSProperties {
  return {
    background: T.glass,
    border: `1px solid ${T.border}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: T.radius,
    ...extra,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'crit';

interface GaugeMetric {
  id: string;
  label: string;
  sublabel: string;
  icon: typeof Server;
  unit: string;
  value: number;
  min: number;
  max: number;
  warnAt: number;
  critAt: number;
  /** When true: red zone is low end (rate/success gauges). */
  critBelow?: boolean;
  warnBelow?: number;
  digits: number;
}

interface AlertItem {
  id: string;
  sev: 'crit' | 'warn' | 'info';
  title: string;
  detail: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function computeStatus(m: GaugeMetric): Status {
  if (m.critBelow === true) {
    if (m.critAt !== 999 && m.value < m.critAt) return 'crit';
    if (m.warnBelow !== undefined && m.value < m.warnBelow) return 'warn';
    return 'ok';
  }
  if (m.value >= m.critAt) return 'crit';
  if (m.value >= m.warnAt) return 'warn';
  return 'ok';
}

const HEALTH_CSV_COLUMNS: CsvColumn<GaugeMetric>[] = [
  { header: 'Metric', value: (m) => m.label },
  { header: 'Description', value: (m) => m.sublabel },
  { header: 'Value', value: (m) => m.value.toFixed(m.digits) },
  { header: 'Unit', value: (m) => m.unit },
  {
    header: 'Status',
    value: (m) => {
      const s = computeStatus(m);
      return s === 'ok' ? 'Nominal' : s === 'warn' ? 'Warning' : 'Critical';
    },
  },
  { header: 'Warn Threshold', value: (m) => (m.warnBelow ?? m.warnAt) },
  { header: 'Crit Threshold', value: (m) => m.critAt },
];

function statusColor(s: Status): string {
  if (s === 'ok') return T.success;
  if (s === 'warn') return T.warning;
  return T.danger;
}

function statusGlow(s: Status): string {
  if (s === 'ok') return T.successDim;
  if (s === 'warn') return T.warningDim;
  return T.dangerDim;
}

// Gauge sweep: 260° total, from -220° to +40°
const SWEEP_START = -220;
const SWEEP_END = 40;
const SWEEP_TOTAL = SWEEP_END - SWEEP_START; // 260°

function valueToAngle(value: number, min: number, max: number): number {
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return SWEEP_START + frac * SWEEP_TOTAL;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (Math.abs(endDeg - startDeg) < 0.01) return '';
  const [sx, sy] = polar(cx, cy, r, startDeg);
  const [ex, ey] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

// ─── Build gauge metrics from live data ─────────────────────────────────────
function buildMetrics(data: SystemHealthBundle | undefined): GaugeMetric[] {
  const q = data?.queues;
  const l = data?.latency;
  const deliveryRates = data?.delivery_rates ?? [];
  const last = deliveryRates.length > 0 ? deliveryRates[deliveryRates.length - 1] : undefined;

  const apiP95 = l?.api_p95 ?? 0;
  const apiP50 = l?.api_p50 ?? 0;
  const queueDepth = q?.celery_depth ?? 0;
  const beatDelay = q?.beat_delay_s ?? 0;
  const redisOps = q?.redis_ops_per_s ?? 0;
  const errorRate = last?.error_rate ?? 0;
  const imapFetch = last?.imap_fetch ?? 0;

  // SMTP success % = 100 - errorRate (clamped 0..100)
  const smtpSuccess = Math.max(0, Math.min(100, 100 - errorRate));

  return [
    {
      id: 'api_p95',
      label: 'API p95',
      sublabel: 'Request latency',
      icon: Activity,
      unit: 'ms',
      value: apiP95,
      min: 0,
      max: 800,
      warnAt: 200,
      critAt: 500,
      digits: 0,
    },
    {
      id: 'api_p50',
      label: 'API p50',
      sublabel: 'Median latency',
      icon: Activity,
      unit: 'ms',
      value: apiP50,
      min: 0,
      max: 400,
      warnAt: 100,
      critAt: 250,
      digits: 0,
    },
    {
      id: 'queue_depth',
      label: 'Backlog',
      sublabel: 'SMTP backlog',
      icon: HardDrive,
      unit: 'msgs',
      value: queueDepth,
      min: 0,
      max: 1000,
      warnAt: 300,
      critAt: 700,
      digits: 0,
    },
    {
      id: 'beat_age',
      label: 'Beat Tick',
      sublabel: 'Heartbeat age',
      icon: Clock,
      unit: 's',
      value: beatDelay,
      min: 0,
      max: 300,
      warnAt: 90,
      critAt: 180,
      digits: 0,
    },
    {
      id: 'redis_ops',
      label: 'Redis',
      sublabel: 'Ops per second',
      icon: Zap,
      unit: 'ops/s',
      value: redisOps,
      min: 0,
      max: 10000,
      warnAt: 6000,
      critAt: 9000,
      digits: 0,
    },
    {
      id: 'error_rate',
      label: 'Error Rate',
      sublabel: '5xx / total',
      icon: Server,
      unit: '%',
      value: errorRate,
      min: 0,
      max: 20,
      warnAt: 2,
      critAt: 8,
      digits: 1,
    },
    {
      id: 'smtp_success',
      label: 'SMTP',
      sublabel: 'Delivery success',
      icon: MailCheck,
      unit: '%',
      value: smtpSuccess,
      min: 80,
      max: 100,
      warnAt: 999,
      critAt: 999,
      critBelow: true,
      warnBelow: 93,
      digits: 1,
    },
    {
      id: 'imap_polls',
      label: 'IMAP polls',
      sublabel: 'Fetch rate',
      icon: MailOpen,
      unit: '/m',
      value: imapFetch,
      min: 0,
      max: 500,
      warnAt: 999,
      critAt: 999,
      critBelow: true,
      warnBelow: 5,
      digits: 0,
    },
  ];
}

// ─── Derive alert list from live metrics + workers ───────────────────────────
function buildAlerts(metrics: GaugeMetric[], workers: WorkerRow[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const m of metrics) {
    const st = computeStatus(m);
    if (st === 'crit') {
      alerts.push({
        id: `crit-${m.id}`,
        sev: 'crit',
        title: `${m.label} critical`,
        detail: `${m.label} is at ${m.value.toFixed(m.digits)} ${m.unit} — above critical threshold (${m.critAt} ${m.unit}).`,
      });
    } else if (st === 'warn') {
      alerts.push({
        id: `warn-${m.id}`,
        sev: 'warn',
        title: `${m.label} elevated`,
        detail: `${m.label} is at ${m.value.toFixed(m.digits)} ${m.unit} — above warn threshold (${m.warnAt} ${m.unit}).`,
      });
    }
  }

  const offlineWorkers = workers.filter(w => w.status === 'offline' || w.status === 'error');
  if (offlineWorkers.length > 0) {
    alerts.push({
      id: 'workers-offline',
      sev: offlineWorkers.length >= workers.length / 2 ? 'crit' : 'warn',
      title: `${offlineWorkers.length} worker${offlineWorkers.length > 1 ? 's' : ''} offline`,
      detail: offlineWorkers.map(w => w.host).join(', '),
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-ok',
      sev: 'info',
      title: 'All systems nominal',
      detail: 'All gauges within green thresholds.',
    });
  }

  return alerts;
}

// ─── Circular Gauge SVG ──────────────────────────────────────────────────────
interface GaugeProps {
  metric: GaugeMetric;
  size?: number;
}

function CircularGauge({ metric, size = 170 }: GaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const trackR = size * 0.36;
  const trackW = size * 0.065;

  const st = computeStatus(metric);
  const mainColor = statusColor(st);
  const isInvertedRisk = metric.critBelow === true;

  let greenStart: number, greenEnd: number;
  let warnStart: number, warnEnd: number;
  let redStart: number, redEnd: number;

  if (isInvertedRisk) {
    const warnFrac = metric.warnBelow !== undefined
      ? (metric.warnBelow - metric.min) / (metric.max - metric.min)
      : 0.6;
    const critFrac = metric.critAt !== 999
      ? (metric.critAt - metric.min) / (metric.max - metric.min)
      : 0.3;
    redStart = SWEEP_START;
    redEnd = SWEEP_START + critFrac * SWEEP_TOTAL;
    warnStart = redEnd;
    warnEnd = SWEEP_START + warnFrac * SWEEP_TOTAL;
    greenStart = warnEnd;
    greenEnd = SWEEP_END;
  } else {
    const warnFrac = Math.min(1, (metric.warnAt - metric.min) / (metric.max - metric.min));
    const critFrac = Math.min(1, (metric.critAt - metric.min) / (metric.max - metric.min));
    greenStart = SWEEP_START;
    greenEnd = SWEEP_START + warnFrac * SWEEP_TOTAL;
    warnStart = greenEnd;
    warnEnd = SWEEP_START + critFrac * SWEEP_TOTAL;
    redStart = warnEnd;
    redEnd = SWEEP_END;
  }

  const fillAngle = valueToAngle(metric.value, metric.min, metric.max);

  const needleLen = trackR * 0.92;
  const needleBase = 6;
  const [nx, ny] = polar(cx, cy, needleLen, fillAngle);
  const [nb1x, nb1y] = polar(cx, cy, needleBase, fillAngle + 90);
  const [nb2x, nb2y] = polar(cx, cy, needleBase, fillAngle - 90);

  const TICKS = 10;
  const tickOuter = trackR + trackW * 0.75;
  const tickInner = trackR - trackW * 0.45;
  const ticks: number[] = Array.from({ length: TICKS + 1 }, (_, i) =>
    SWEEP_START + (i / TICKS) * SWEEP_TOTAL,
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${metric.label}: ${metric.value.toFixed(metric.digits)} ${metric.unit}`}
    >
      {/* Glow ring */}
      <circle cx={cx} cy={cy} r={trackR} fill="none" stroke={mainColor} strokeWidth={trackW + 6} opacity={0.06} />

      {/* Track background */}
      <path d={arcPath(cx, cy, trackR, SWEEP_START, SWEEP_END)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={trackW} strokeLinecap="round" />

      {/* Zone arcs */}
      <path d={arcPath(cx, cy, trackR, greenStart, greenEnd)} fill="none" stroke={`${T.success}55`} strokeWidth={trackW} />
      <path d={arcPath(cx, cy, trackR, warnStart, warnEnd)} fill="none" stroke={`${T.warning}55`} strokeWidth={trackW} />
      <path d={arcPath(cx, cy, trackR, redStart, redEnd)} fill="none" stroke={`${T.danger}55`} strokeWidth={trackW} />

      {/* Filled value arc */}
      {fillAngle > SWEEP_START + 0.5 && (
        <path
          d={arcPath(cx, cy, trackR, SWEEP_START, fillAngle)}
          fill="none"
          stroke={mainColor}
          strokeWidth={trackW * 0.65}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${mainColor})`, transition: 'all 0.8s ease' }}
        />
      )}

      {/* Tick marks */}
      {ticks.map((angleDeg, i) => {
        const [ox, oy] = polar(cx, cy, tickOuter, angleDeg);
        const [ix, iy] = polar(cx, cy, tickInner, angleDeg);
        return (
          <line key={i} x1={ox} y1={oy} x2={ix} y2={iy} stroke="rgba(255,255,255,0.22)" strokeWidth={i % 5 === 0 ? 1.5 : 0.8} />
        );
      })}

      {/* Needle shadow */}
      <polygon
        points={`${cx},${cy} ${nb1x},${nb1y} ${nx},${ny} ${nb2x},${nb2y}`}
        fill="rgba(0,0,0,0.35)"
        transform="translate(2, 2)"
        style={{ transition: 'all 0.8s ease' }}
      />

      {/* Needle */}
      <polygon
        points={`${cx},${cy} ${nb1x},${nb1y} ${nx},${ny} ${nb2x},${nb2y}`}
        fill={mainColor}
        style={{ filter: `drop-shadow(0 0 3px ${mainColor})`, transition: 'all 0.8s ease' }}
      />

      {/* Hub */}
      <circle cx={cx} cy={cy} r={size * 0.048} fill="rgba(20,18,16,0.95)" stroke={mainColor} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={size * 0.022} fill={mainColor} />

      {/* Min/Max labels */}
      {(() => {
        const [lx, ly] = polar(cx, cy, trackR, SWEEP_START - 4);
        const [rx, ry] = polar(cx, cy, trackR, SWEEP_END + 4);
        return (
          <>
            <text x={lx} y={ly + 1} textAnchor="end" fontSize={size * 0.072} fill="rgba(255,255,255,0.35)" fontFamily="monospace">{metric.min}</text>
            <text x={rx} y={ry + 1} textAnchor="start" fontSize={size * 0.072} fill="rgba(255,255,255,0.35)" fontFamily="monospace">{metric.max}</text>
          </>
        );
      })()}
    </svg>
  );
}

// ─── Gauge card ──────────────────────────────────────────────────────────────
function GaugeCard({ metric }: { metric: GaugeMetric }) {
  const st = computeStatus(metric);
  const color = statusColor(st);
  const glow = statusGlow(st);
  const Icon = metric.icon;

  return (
    <div style={{
      ...glassBox(),
      padding: '20px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 0 0 1px ${T.border}, inset 0 1px 0 rgba(255,255,255,0.06)`,
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
        width: 120, height: 80, borderRadius: '50%',
        background: glow, filter: 'blur(20px)', pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, zIndex: 1 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.dim }}>
          {metric.label}
        </span>
        {st !== 'ok' && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
        )}
      </div>

      {/* Gauge */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <CircularGauge metric={metric} size={170} />
      </div>

      {/* Readout */}
      <div style={{ marginTop: -8, textAlign: 'center', zIndex: 1 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color, lineHeight: 1, textShadow: `0 0 12px ${color}66`, letterSpacing: '-0.02em' }}>
          {metric.value.toFixed(metric.digits)}
          <span style={{ fontSize: 13, fontWeight: 500, color: T.dim, marginLeft: 3 }}>{metric.unit}</span>
        </div>
        <div style={{ fontSize: 10, color: T.faint, marginTop: 4, letterSpacing: '0.06em' }}>{metric.sublabel}</div>
      </div>

      {/* Status badge */}
      <div style={{
        marginTop: 10, padding: '3px 10px', borderRadius: 20,
        background: `${color}18`, border: `1px solid ${color}44`,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color,
      }}>
        {st === 'ok' ? 'Nominal' : st === 'warn' ? 'Warning' : 'Critical'}
      </div>
    </div>
  );
}

// ─── Alert panel ─────────────────────────────────────────────────────────────
function AlertPanel({ alerts, workers }: { alerts: AlertItem[]; workers: WorkerRow[] }) {
  const sevColor = (s: AlertItem['sev']) => s === 'crit' ? T.danger : s === 'warn' ? T.warning : T.success;
  const SevIcon = (s: AlertItem['sev']) => s === 'crit' ? XCircle : s === 'warn' ? AlertTriangle : CheckCircle2;

  const onlineCount = workers.filter(w => w.status !== 'offline').length;
  const totalCount = workers.length;

  return (
    <div style={{ ...glassBox(), padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <AlertTriangle size={14} color={T.warning} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.dim }}>
          Active Alerts
        </span>
        <span style={{
          marginLeft: 'auto',
          background: `${T.warning}22`, border: `1px solid ${T.warning}44`,
          borderRadius: 20, padding: '1px 8px',
          fontSize: 10, fontWeight: 700, color: T.warning,
        }}>
          {alerts.filter(a => a.sev !== 'info').length} issues
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map((alert) => {
          const color = sevColor(alert.sev);
          const Icon = SevIcon(alert.sev);
          return (
            <div key={alert.id} style={{
              background: `${color}0e`, border: `1px solid ${color}2a`,
              borderRadius: T.radiusSm, padding: '10px 12px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <Icon size={14} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{alert.title}</div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.45 }}>{alert.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Worker summary strip */}
      <div style={{
        marginTop: 14, padding: '10px 14px',
        background: T.glassMid, borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Workers online</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: T.text }}>{onlineCount} / {totalCount}</span>
        </div>
        {workers.slice(0, 3).map(w => (
          <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{w.host}</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              color: w.status === 'offline' || w.status === 'error' ? T.danger : w.status === 'busy' ? T.warning : T.success,
            }}>{w.status}</span>
          </div>
        ))}
        {workers.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Worker heartbeats</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: T.faint }}>No workers reporting</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overall status header ────────────────────────────────────────────────────
function OverallHeader({ metrics, timeStr, action }: { metrics: GaugeMetric[]; timeStr: string; action?: ReactNode }) {
  const statuses = metrics.map(m => computeStatus(m));
  const hasCrit = statuses.some(s => s === 'crit');
  const hasWarn = statuses.some(s => s === 'warn');
  const overall: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';
  const color = statusColor(overall);
  const label = overall === 'ok' ? 'All Systems Nominal' : overall === 'warn' ? 'Degraded — Monitoring' : 'Incident Active';

  return (
    <div style={{
      ...glassBox(),
      padding: '18px 28px',
      display: 'flex', alignItems: 'center', gap: 20,
      position: 'relative', overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 30% 50%, ${color}12 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: `${color}1a`, border: `2px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: `0 0 20px ${color}33`,
      }}>
        <Gauge size={26} color={color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, marginBottom: 3 }}>
          WarmPulse Platform — System Health
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.01em' }}>{label}</span>
          {overall !== 'ok' && (
            <span style={{
              padding: '2px 10px', borderRadius: 20,
              background: `${color}20`, border: `1px solid ${color}55`,
              fontSize: 10, fontWeight: 700, color, letterSpacing: '0.12em', textTransform: 'uppercase',
              animation: 'pulse-dot 1.4s ease-in-out infinite',
            }}>
              {overall === 'crit' ? 'P1' : 'P2'}
            </span>
          )}
        </div>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {(['ok', 'warn', 'crit'] as Status[]).map(s => {
          const count = statuses.filter(x => x === s).length;
          if (count === 0) return null;
          const c = statusColor(s);
          const lbl = s === 'ok' ? 'OK' : s === 'warn' ? 'WARN' : 'CRIT';
          return (
            <div key={s} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: `${c}14`, border: `1px solid ${c}44`,
              borderRadius: 10, padding: '6px 14px', gap: 2,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: c, lineHeight: 1 }}>{count}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: `${c}aa` }}>{lbl}</span>
            </div>
          );
        })}
      </div>

      {/* Clock */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        flexShrink: 0, borderLeft: `1px solid ${T.border}`, paddingLeft: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color={T.faint} />
          <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: T.dim, letterSpacing: '0.04em' }}>
            {timeStr}
          </span>
        </div>
        <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>UTC live</span>
      </div>

      {action !== undefined && (
        <div style={{ flexShrink: 0, borderLeft: `1px solid ${T.border}`, paddingLeft: 20 }}>
          {action}
        </div>
      )}
    </div>
  );
}

// ─── Subsystem strip ─────────────────────────────────────────────────────────
function SubsystemStrip({ metrics }: { metrics: GaugeMetric[] }) {
  const subsystems = [
    { label: 'API', icon: Activity, ids: ['api_p95', 'api_p50', 'error_rate'] },
    { label: 'Celery', icon: Workflow, ids: ['queue_depth', 'beat_age'] },
    { label: 'Redis', icon: Zap, ids: ['redis_ops'] },
    { label: 'SMTP / IMAP', icon: MailCheck, ids: ['smtp_success', 'imap_polls'] },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {subsystems.map(sub => {
        const SubIcon = sub.icon;
        const related = metrics.filter(m => sub.ids.includes(m.id));
        const statuses = related.map(m => computeStatus(m));
        const hasCrit = statuses.some(s => s === 'crit');
        const hasWarn = statuses.some(s => s === 'warn');
        const st: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';
        const color = statusColor(st);

        return (
          <div key={sub.label} style={{
            flex: 1,
            ...glassBox({ padding: '10px 14px', borderRadius: T.radiusSm }),
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${color}15`, border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <SubIcon size={15} color={color} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.dim }}>{sub.label}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 1 }}>
                {st === 'ok' ? 'Healthy' : st === 'warn' ? 'Degraded' : 'Critical'}
              </div>
            </div>
            <div style={{
              marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
              background: color, boxShadow: `0 0 8px ${color}`,
              ...(st !== 'ok' ? { animation: 'pulse-dot 1.4s ease-in-out infinite' } : {}),
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────
function SkeletonGauges() {
  return (
    <div className="sh-gauges">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          ...glassBox(),
          padding: '20px 16px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          minHeight: 260,
        }}>
          <div style={{ width: 80, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 60, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.08)', animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function SystemHealthPage() {
  const health = useSystemHealth();

  // Live clock (ticks every second — no data involved)
  const [timeStr, setTimeStr] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const data = health.data;
  const metrics = useMemo(() => buildMetrics(data), [data]);
  const workers = data?.workers ?? [];
  const alerts = buildAlerts(metrics, workers);

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      {/* Keyframe injection */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        /* Responsive layout — fixed 1fr/repeat(4,1fr) grids overflowed and
           overlapped the alert panel because each gauge holds a fixed 170px
           SVG. minmax(0,1fr) lets the column shrink; auto-fit wraps the gauges;
           the media query stacks the alert panel under the gauges on narrow
           viewports. */
        .sh-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }
        .sh-gauges {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 14px;
        }
        @media (max-width: 1024px) {
          .sh-main { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Overall status header */}
      <OverallHeader
        metrics={metrics}
        timeStr={timeStr}
        action={
          <ExportButton
            rows={metrics}
            columns={HEALTH_CSV_COLUMNS}
            filename={`system-health-${exportStamp()}`}
            disabled={metrics.length === 0}
          />
        }
      />

      {/* Subsystem strip */}
      <SubsystemStrip metrics={metrics} />

      {/* Main: gauges + alerts */}
      <div className="sh-main">
        {health.isLoading ? (
          <SkeletonGauges />
        ) : (
          <div className="sh-gauges">
            {metrics.map(m => (
              <GaugeCard key={m.id} metric={m} />
            ))}
          </div>
        )}

        <AlertPanel alerts={alerts} workers={workers} />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 4px', borderTop: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={11} color={T.faint} />
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.08em' }}>
            WarmPulse Admin · System Status · Gauge Cluster · H8 · auto-refresh 15s
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {([
            { color: T.success, label: 'Nominal' },
            { color: T.warning, label: 'Warning' },
            { color: T.danger, label: 'Critical' },
          ] as { color: string; label: string }[]).map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 10, color: T.faint }}>{label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
            <Wifi size={11} color={T.success} />
            <span style={{ fontSize: 10, color: T.success, fontFamily: 'monospace' }}>LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SystemHealthPage;
