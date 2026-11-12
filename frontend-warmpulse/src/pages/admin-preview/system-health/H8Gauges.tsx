/**
 * Admin System Health Design Candidate: H8 Gauge Cluster
 *
 * "Gauge Cluster" — an aviation/automotive instrument-cockpit of circular
 * SVG gauges with animated needles, threshold arcs (green/orange/red zones),
 * live numeric readouts, an overall status header, and an alert panel.
 *
 * Self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette.
 * Intervals cleaned up in useEffect. Build-safe (no unused imports/vars,
 * all array accesses guarded).
 */

import { useEffect, useState, useRef, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  MailCheck,
  Server,
  Wifi,
  Workflow,
  Zap,
  XCircle,
  Gauge,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.15)' as const,
  accent: '#F26522' as const,
  accentLt: '#FF8A4B' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.18)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.18)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.18)' as const,
  glass: 'rgba(255,255,255,0.05)' as const,
  glassMid: 'rgba(255,255,255,0.08)' as const,
  border: 'rgba(255,255,255,0.10)' as const,
  borderBright: 'rgba(255,255,255,0.18)' as const,
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

// ─── Types ──────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'crit';

interface GaugeMetric {
  id: string;
  label: string;
  sublabel: string;
  icon: typeof Server;
  unit: string;
  value: number;       // current value (0..max)
  min: number;         // scale start
  max: number;         // scale end
  warnAt: number;      // orange zone starts
  critAt: number;      // red zone starts (high = bad: latency, queue, errors)
  critBelow?: boolean; // if true, red when value is BELOW critAt (rate gauges)
  warnBelow?: number;  // orange when value is below this (rate gauges)
  digits: number;      // decimal places
  status: Status;
  drift: number;       // how much the mock value drifts per tick
  driftDir: 1 | -1;
}

// ─── Mock data ──────────────────────────────────────────────────────────────
const INITIAL_METRICS: GaugeMetric[] = [
  {
    id: 'api_p95',
    label: 'API p95',
    sublabel: 'Request latency',
    icon: Activity,
    unit: 'ms',
    value: 142,
    min: 0,
    max: 800,
    warnAt: 300,
    critAt: 600,
    digits: 0,
    status: 'ok',
    drift: 18,
    driftDir: 1,
  },
  {
    id: 'worker_tput',
    label: 'Worker',
    sublabel: 'Throughput',
    icon: Workflow,
    unit: 'tasks/m',
    value: 87,
    min: 0,
    max: 200,
    warnAt: 999, // rate goes bad when LOW
    critAt: 999,
    critBelow: true,
    warnBelow: 30,
    digits: 0,
    status: 'ok',
    drift: 12,
    driftDir: -1,
  },
  {
    id: 'queue_depth',
    label: 'Queue',
    sublabel: 'SMTP backlog',
    icon: HardDrive,
    unit: 'msgs',
    value: 214,
    min: 0,
    max: 1000,
    warnAt: 300,
    critAt: 700,
    digits: 0,
    status: 'warn',
    drift: 40,
    driftDir: 1,
  },
  {
    id: 'beat_age',
    label: 'Beat Tick',
    sublabel: 'Heartbeat age',
    icon: Clock,
    unit: 's',
    value: 58,
    min: 0,
    max: 300,
    warnAt: 90,
    critAt: 180,
    digits: 0,
    status: 'ok',
    drift: 8,
    driftDir: 1,
  },
  {
    id: 'pg_conns',
    label: 'Postgres',
    sublabel: 'Connections',
    icon: Database,
    unit: 'conns',
    value: 62,
    min: 0,
    max: 100,
    warnAt: 70,
    critAt: 90,
    digits: 0,
    status: 'ok',
    drift: 5,
    driftDir: 1,
  },
  {
    id: 'redis_lat',
    label: 'Redis',
    sublabel: 'Command latency',
    icon: Zap,
    unit: 'µs',
    value: 82,
    min: 0,
    max: 500,
    warnAt: 150,
    critAt: 300,
    digits: 0,
    status: 'ok',
    drift: 20,
    driftDir: 1,
  },
  {
    id: 'smtp_rate',
    label: 'SMTP',
    sublabel: 'Delivery success',
    icon: MailCheck,
    unit: '%',
    value: 97.2,
    min: 80,
    max: 100,
    warnAt: 999,
    critAt: 999,
    critBelow: true,
    warnBelow: 93,
    digits: 1,
    status: 'ok',
    drift: 0.6,
    driftDir: -1,
  },
  {
    id: 'error_rate',
    label: 'Error Rate',
    sublabel: '5xx / total',
    icon: Server,
    unit: '%',
    value: 3.7,
    min: 0,
    max: 20,
    warnAt: 2,
    critAt: 8,
    digits: 1,
    status: 'warn',
    drift: 0.8,
    driftDir: 1,
  },
];

interface AlertItem {
  id: string;
  sev: 'crit' | 'warn' | 'info';
  title: string;
  detail: string;
  ts: string;
}

const ALERTS: AlertItem[] = [
  {
    id: 'a1',
    sev: 'warn',
    title: 'Queue depth elevated',
    detail: 'SMTP backlog at 214 msgs — above warn threshold (300). Drain in progress.',
    ts: '08:41',
  },
  {
    id: 'a2',
    sev: 'warn',
    title: 'Error rate spike',
    detail: '5xx rate climbed to 3.7% (warn ≥2%) — correlated with queue pressure.',
    ts: '08:39',
  },
  {
    id: 'a3',
    sev: 'info',
    title: 'Beat healthy',
    detail: 'Last tick 58s ago — well within 90s warn window.',
    ts: '08:40',
  },
  {
    id: 'a4',
    sev: 'info',
    title: 'Postgres OK',
    detail: '62 / 100 connections in use. Pool headroom comfortable.',
    ts: '08:35',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function computeStatus(m: GaugeMetric): Status {
  if (m.critBelow === true) {
    if (m.value < m.critAt && m.critAt !== 999) return 'crit';
    if (m.warnBelow !== undefined && m.value < m.warnBelow) return 'warn';
    return 'ok';
  }
  if (m.value >= m.critAt) return 'crit';
  if (m.value >= m.warnAt) return 'warn';
  return 'ok';
}

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

// Converts a value in [min..max] to an angle in degrees.
// Gauge sweep: 220 degrees total, from 200° (bottom-left) to 340° (bottom-right).
// 0° = right, clockwise. Start = -200°, end = 20°.
const SWEEP_START = -220;   // degrees (counter-clockwise from 3 o'clock)
const SWEEP_END = 40;       // degrees
const SWEEP_TOTAL = SWEEP_END - SWEEP_START; // 260°

function valueToAngle(value: number, min: number, max: number): number {
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return SWEEP_START + frac * SWEEP_TOTAL;
}

// Converts polar (r, angleDeg) to SVG x,y relative to centre cx,cy
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// Build an SVG arc path between two angles
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  if (Math.abs(endDeg - startDeg) < 0.01) return '';
  const [sx, sy] = polar(cx, cy, r, startDeg);
  const [ex, ey] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

// ─── Circular Gauge SVG ─────────────────────────────────────────────────────
interface GaugeProps {
  metric: GaugeMetric;
  size?: number;
}

function CircularGauge({ metric, size = 180 }: GaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const trackR = size * 0.36;   // arc radius
  const trackW = size * 0.065;  // stroke width

  const st = computeStatus(metric);
  const mainColor = statusColor(st);

  // Zone boundaries as fractions of [min..max]
  const isInvertedRisk = metric.critBelow === true;

  // Angles for the three colour zones on the track
  let greenStart: number, greenEnd: number;
  let warnStart: number, warnEnd: number;
  let redStart: number, redEnd: number;

  if (isInvertedRisk) {
    // High is good (SMTP rate, worker throughput)
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
    // High is bad (latency, queue, errors)
    const warnFrac = (metric.warnAt - metric.min) / (metric.max - metric.min);
    const critFrac = (metric.critAt - metric.min) / (metric.max - metric.min);
    greenStart = SWEEP_START;
    greenEnd = SWEEP_START + warnFrac * SWEEP_TOTAL;
    warnStart = greenEnd;
    warnEnd = SWEEP_START + critFrac * SWEEP_TOTAL;
    redStart = warnEnd;
    redEnd = SWEEP_END;
  }

  // Filled arc: from SWEEP_START to current value's angle
  const fillAngle = valueToAngle(metric.value, metric.min, metric.max);

  // Needle
  const needleLen = trackR * 0.92;
  const needleBase = 6;
  const [nx, ny] = polar(cx, cy, needleLen, fillAngle);
  const [nb1x, nb1y] = polar(cx, cy, needleBase, fillAngle + 90);
  const [nb2x, nb2y] = polar(cx, cy, needleBase, fillAngle - 90);

  // Tick marks every ~26° (10 ticks across 260°)
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
      {/* Glow ring behind track */}
      <circle
        cx={cx}
        cy={cy}
        r={trackR}
        fill="none"
        stroke={mainColor}
        strokeWidth={trackW + 6}
        opacity={0.06}
      />

      {/* Track background */}
      <path
        d={arcPath(cx, cy, trackR, SWEEP_START, SWEEP_END)}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={trackW}
        strokeLinecap="round"
      />

      {/* Zone arcs */}
      <path
        d={arcPath(cx, cy, trackR, greenStart, greenEnd)}
        fill="none"
        stroke={`${T.success}55`}
        strokeWidth={trackW}
      />
      <path
        d={arcPath(cx, cy, trackR, warnStart, warnEnd)}
        fill="none"
        stroke={`${T.warning}55`}
        strokeWidth={trackW}
      />
      <path
        d={arcPath(cx, cy, trackR, redStart, redEnd)}
        fill="none"
        stroke={`${T.danger}55`}
        strokeWidth={trackW}
      />

      {/* Filled value arc */}
      {fillAngle > SWEEP_START + 0.5 && (
        <path
          d={arcPath(cx, cy, trackR, SWEEP_START, fillAngle)}
          fill="none"
          stroke={mainColor}
          strokeWidth={trackW * 0.65}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${mainColor})` }}
        />
      )}

      {/* Tick marks */}
      {ticks.map((angleDeg, i) => {
        const [ox, oy] = polar(cx, cy, tickOuter, angleDeg);
        const [ix, iy] = polar(cx, cy, tickInner, angleDeg);
        return (
          <line
            key={i}
            x1={ox}
            y1={oy}
            x2={ix}
            y2={iy}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
          />
        );
      })}

      {/* Needle shadow */}
      <polygon
        points={`${cx},${cy} ${nb1x},${nb1y} ${nx},${ny} ${nb2x},${nb2y}`}
        fill="rgba(0,0,0,0.35)"
        transform={`translate(2, 2)`}
      />

      {/* Needle */}
      <polygon
        points={`${cx},${cy} ${nb1x},${nb1y} ${nx},${ny} ${nb2x},${nb2y}`}
        fill={mainColor}
        style={{ filter: `drop-shadow(0 0 3px ${mainColor})` }}
      />

      {/* Needle hub */}
      <circle cx={cx} cy={cy} r={size * 0.048} fill="rgba(20,18,16,0.95)" stroke={mainColor} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={size * 0.022} fill={mainColor} />

      {/* Min / Max labels */}
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

// ─── Single gauge card ───────────────────────────────────────────────────────
interface GaugeCardProps {
  metric: GaugeMetric;
}

function GaugeCard({ metric }: GaugeCardProps) {
  const st = computeStatus(metric);
  const color = statusColor(st);
  const glow = statusGlow(st);
  const Icon = metric.icon;

  return (
    <div
      style={{
        ...glassBox(),
        padding: '20px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 0 0 1px ${T.border}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* Status glow blob */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -30,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 80,
          borderRadius: '50%',
          background: glow,
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, zIndex: 1 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.dim }}>
          {metric.label}
        </span>
        {st !== 'ok' && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
        )}
      </div>

      {/* Gauge SVG */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <CircularGauge metric={metric} size={170} />
      </div>

      {/* Readout */}
      <div style={{ marginTop: -8, textAlign: 'center', zIndex: 1 }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 28,
          fontWeight: 800,
          color,
          lineHeight: 1,
          textShadow: `0 0 12px ${color}66`,
          letterSpacing: '-0.02em',
        }}>
          {metric.value.toFixed(metric.digits)}
          <span style={{ fontSize: 13, fontWeight: 500, color: T.dim, marginLeft: 3 }}>
            {metric.unit}
          </span>
        </div>
        <div style={{ fontSize: 10, color: T.faint, marginTop: 4, letterSpacing: '0.06em' }}>
          {metric.sublabel}
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        marginTop: 10,
        padding: '3px 10px',
        borderRadius: 20,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color,
      }}>
        {st === 'ok' ? 'Nominal' : st === 'warn' ? 'Warning' : 'Critical'}
      </div>
    </div>
  );
}

// ─── Alert panel ─────────────────────────────────────────────────────────────
function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  const sevColor = (s: AlertItem['sev']) => s === 'crit' ? T.danger : s === 'warn' ? T.warning : T.success;
  const SevIcon = (s: AlertItem['sev']) => s === 'crit' ? XCircle : s === 'warn' ? AlertTriangle : CheckCircle2;

  return (
    <div style={{ ...glassBox(), padding: 20, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <AlertTriangle size={14} color={T.warning} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.dim }}>
          Active Alerts
        </span>
        <span style={{
          marginLeft: 'auto',
          background: `${T.warning}22`,
          border: `1px solid ${T.warning}44`,
          borderRadius: 20,
          padding: '1px 8px',
          fontSize: 10,
          fontWeight: 700,
          color: T.warning,
        }}>
          {alerts.filter(a => a.sev !== 'info').length} issues
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map((alert) => {
          const color = sevColor(alert.sev);
          const Icon = SevIcon(alert.sev);
          return (
            <div
              key={alert.id}
              style={{
                background: `${color}0e`,
                border: `1px solid ${color}2a`,
                borderRadius: T.radiusSm,
                padding: '10px 12px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <Icon size={14} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.45 }}>
                  {alert.detail}
                </div>
              </div>
              <span style={{ fontSize: 10, color: T.faint, fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }}>
                {alert.ts}
              </span>
            </div>
          );
        })}
      </div>

      {/* System summary strip */}
      <div style={{
        marginTop: 14,
        padding: '10px 14px',
        background: T.glassMid,
        borderRadius: T.radiusSm,
        border: `1px solid ${T.border}`,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {[
          { label: 'API requests/min', value: '1,248' },
          { label: 'Active workers', value: '4 / 4' },
          { label: 'SMTP queue drain', value: '~3 min' },
          { label: 'Last deploy', value: '2h 14m ago' },
        ].map((row) => (
          <div key={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {row.label}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: T.text }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Overall status header ────────────────────────────────────────────────────
interface HeaderProps {
  metrics: GaugeMetric[];
}

function OverallHeader({ metrics }: HeaderProps) {
  const statuses = metrics.map(m => computeStatus(m));
  const hasCrit = statuses.some(s => s === 'crit');
  const hasWarn = statuses.some(s => s === 'warn');
  const overall: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';
  const color = statusColor(overall);
  const label = overall === 'ok' ? 'All Systems Nominal' : overall === 'warn' ? 'Degraded — Monitoring' : 'Incident Active';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <div style={{
      ...glassBox(),
      padding: '18px 28px',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 30% 50%, ${color}12 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Gauge icon */}
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: `${color}1a`,
        border: `2px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 0 20px ${color}33`,
      }}>
        <Gauge size={26} color={color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, marginBottom: 3 }}>
          WarmPulse Platform — System Health
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.01em' }}>
            {label}
          </span>
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

      {/* Metric summary chips */}
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
    </div>
  );
}

// ─── Subsystem info strip ─────────────────────────────────────────────────────
function SubsystemStrip({ metrics }: { metrics: GaugeMetric[] }) {
  const items = [
    { label: 'API', icon: Activity, ids: ['api_p95', 'error_rate'] },
    { label: 'Celery', icon: Workflow, ids: ['worker_tput', 'queue_depth', 'beat_age'] },
    { label: 'Data', icon: Database, ids: ['pg_conns', 'redis_lat'] },
    { label: 'SMTP', icon: MailCheck, ids: ['smtp_rate'] },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {items.map(subsys => {
        const SubIcon = subsys.icon;
        const related = metrics.filter(m => subsys.ids.includes(m.id));
        const statuses = related.map(m => computeStatus(m));
        const hasCrit = statuses.some(s => s === 'crit');
        const hasWarn = statuses.some(s => s === 'warn');
        const st: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';
        const color = statusColor(st);

        return (
          <div key={subsys.label} style={{
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.dim }}>
                {subsys.label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 1 }}>
                {st === 'ok' ? 'Healthy' : st === 'warn' ? 'Degraded' : 'Critical'}
              </div>
            </div>
            <div style={{
              marginLeft: 'auto',
              width: 8, height: 8, borderRadius: '50%',
              background: color,
              boxShadow: `0 0 8px ${color}`,
              ...(st !== 'ok' ? { animation: 'pulse-dot 1.4s ease-in-out infinite' } : {}),
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function AdmHlthH8Gauges() {
  const [metrics, setMetrics] = useState<GaugeMetric[]>(INITIAL_METRICS);
  const tickRef = useRef(0);

  // Live drift: gently walk each metric value and flip direction at bounds
  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      setMetrics(prev =>
        prev.map(m => {
          const range = m.max - m.min;
          const step = m.drift * (0.5 + Math.random() * 0.8) * m.driftDir;
          let next = m.value + step;
          let dir = m.driftDir;

          // Bounce off limits with a margin so values stay interesting
          const lo = m.min + range * 0.05;
          const hi = m.max - range * 0.05;
          if (next > hi) { next = hi; dir = -1; }
          if (next < lo) { next = lo; dir = 1; }

          // Occasionally flip direction to keep it lively
          if (Math.random() < 0.08) dir = (dir * -1) as 1 | -1;

          const updated = { ...m, value: next, driftDir: dir };
          return { ...updated, status: computeStatus(updated) };
        }),
      );
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // Tick for live clock readout (re-render header every second)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      {/* Keyframe injection */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes needle-in {
          from { transform-origin: center; opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <OverallHeader metrics={metrics} />

      {/* Subsystem health strip */}
      <SubsystemStrip metrics={metrics} />

      {/* Main layout: gauges grid + alert panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Gauge cluster */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}>
          {metrics.map(m => (
            <GaugeCard key={m.id} metric={m} />
          ))}
        </div>

        {/* Alerts + summary */}
        <AlertPanel alerts={ALERTS} />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 4px', borderTop: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={11} color={T.faint} />
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.08em' }}>
            WarmPulse Admin · System Health · Gauge Cluster · H8
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {([
            { color: T.success, label: 'Nominal' },
            { color: T.warning, label: 'Warning' },
            { color: T.danger,  label: 'Critical' },
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
