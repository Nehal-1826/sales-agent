/**
 * Platform System Health — gauge cluster over live telemetry
 * (ported from the WarmPulse admin console, restyled to the merged shell).
 *
 * Cockpit of circular SVG gauges with animated needles, threshold arcs
 * (green/orange/red zones), live numeric readouts, an overall status header,
 * and a derived alert panel. Data source: getSystemHealth() — zero mocks,
 * zero Math.random(). Auto-refreshes every 15 s; the clock is real UTC time.
 */
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { downloadCsv, getSystemHealth } from '../../lib/platformAdmin';
import type { SystemHealthBundle, WorkerRow } from '../../lib/platformAdmin';

/* ─── Status tokens (map onto the shell's CSS custom properties) ──────────── */
type Status = 'ok' | 'warn' | 'crit';

const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--success)',
  warn: 'var(--warn)',
  crit: 'var(--danger)',
};
const STATUS_SOFT: Record<Status, string> = {
  ok: 'var(--success-soft)',
  warn: 'var(--warn-soft)',
  crit: 'var(--danger-soft)',
};
const STATUS_BORDER: Record<Status, string> = {
  ok: 'var(--success-border)',
  warn: 'var(--warn-border)',
  crit: 'var(--danger-border)',
};

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface GaugeMetric {
  id: string;
  label: string;
  sublabel: string;
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

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
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

function statusLabel(s: Status): string {
  return s === 'ok' ? 'Nominal' : s === 'warn' ? 'Warning' : 'Critical';
}

// Gauge sweep: 260° total, from -220° to +40°
const SWEEP_START = -220;
const SWEEP_END = 40;
const SWEEP_TOTAL = SWEEP_END - SWEEP_START;

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

/* ─── Build gauge metrics from live data ───────────────────────────────────── */
function buildMetrics(data: SystemHealthBundle | null): GaugeMetric[] {
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
    { id: 'api_p95', label: 'API p95', sublabel: 'Request latency', unit: 'ms', value: apiP95, min: 0, max: 800, warnAt: 200, critAt: 500, digits: 0 },
    { id: 'api_p50', label: 'API p50', sublabel: 'Median latency', unit: 'ms', value: apiP50, min: 0, max: 400, warnAt: 100, critAt: 250, digits: 0 },
    { id: 'queue_depth', label: 'Backlog', sublabel: 'SMTP backlog', unit: 'msgs', value: queueDepth, min: 0, max: 1000, warnAt: 300, critAt: 700, digits: 0 },
    { id: 'beat_age', label: 'Beat Tick', sublabel: 'Heartbeat age', unit: 's', value: beatDelay, min: 0, max: 300, warnAt: 90, critAt: 180, digits: 0 },
    { id: 'redis_ops', label: 'Redis', sublabel: 'Ops per second', unit: 'ops/s', value: redisOps, min: 0, max: 10000, warnAt: 6000, critAt: 9000, digits: 0 },
    { id: 'error_rate', label: 'Error Rate', sublabel: '5xx / total', unit: '%', value: errorRate, min: 0, max: 20, warnAt: 2, critAt: 8, digits: 1 },
    { id: 'smtp_success', label: 'SMTP', sublabel: 'Delivery success', unit: '%', value: smtpSuccess, min: 80, max: 100, warnAt: 999, critAt: 999, critBelow: true, warnBelow: 93, digits: 1 },
    { id: 'imap_polls', label: 'IMAP polls', sublabel: 'Fetch rate', unit: '/m', value: imapFetch, min: 0, max: 500, warnAt: 999, critAt: 999, critBelow: true, warnBelow: 5, digits: 0 },
  ];
}

/* ─── Derive alert list from live metrics + workers ────────────────────────── */
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

  const offlineWorkers = workers.filter((w) => w.status === 'offline' || w.status === 'error');
  if (offlineWorkers.length > 0) {
    alerts.push({
      id: 'workers-offline',
      sev: offlineWorkers.length >= workers.length / 2 ? 'crit' : 'warn',
      title: `${offlineWorkers.length} worker${offlineWorkers.length > 1 ? 's' : ''} offline`,
      detail: offlineWorkers.map((w) => w.host).join(', '),
    });
  }

  if (alerts.length === 0) {
    alerts.push({ id: 'all-ok', sev: 'info', title: 'All systems nominal', detail: 'All gauges within green thresholds.' });
  }

  return alerts;
}

/* ─── Circular Gauge SVG ────────────────────────────────────────────────────── */
function CircularGauge({ metric, size = 170 }: { metric: GaugeMetric; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const trackR = size * 0.36;
  const trackW = size * 0.065;

  const st = computeStatus(metric);
  const mainColor = STATUS_COLOR[st];
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
  const ticks: number[] = Array.from({ length: TICKS + 1 }, (_, i) => SWEEP_START + (i / TICKS) * SWEEP_TOTAL);

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

      {/* Zone arcs (alpha via opacity attribute — CSS-var colors can't take hex suffixes) */}
      <path d={arcPath(cx, cy, trackR, greenStart, greenEnd)} fill="none" stroke={STATUS_COLOR.ok} strokeWidth={trackW} opacity={0.33} />
      <path d={arcPath(cx, cy, trackR, warnStart, warnEnd)} fill="none" stroke={STATUS_COLOR.warn} strokeWidth={trackW} opacity={0.33} />
      <path d={arcPath(cx, cy, trackR, redStart, redEnd)} fill="none" stroke={STATUS_COLOR.crit} strokeWidth={trackW} opacity={0.33} />

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

/* ─── Gauge card ────────────────────────────────────────────────────────────── */
function GaugeCard({ metric }: { metric: GaugeMetric }) {
  const st = computeStatus(metric);
  const color = STATUS_COLOR[st];

  return (
    <div className="panel" style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', width: 120, height: 80, borderRadius: '50%', background: STATUS_SOFT[st], filter: 'blur(20px)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, zIndex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
          {metric.label}
        </span>
        {st !== 'ok' && (
          <span className={`status-dot dot-${st === 'crit' ? 'danger' : 'warn'}`} style={{ boxShadow: `0 0 6px ${color}` }} />
        )}
      </div>

      {/* Gauge */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <CircularGauge metric={metric} size={170} />
      </div>

      {/* Readout */}
      <div style={{ marginTop: -8, textAlign: 'center', zIndex: 1 }}>
        <div style={{ fontFamily: 'var(--display, monospace)', fontSize: 28, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {metric.value.toFixed(metric.digits)}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginLeft: 3 }}>{metric.unit}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, letterSpacing: '0.06em' }}>{metric.sublabel}</div>
      </div>

      {/* Status badge */}
      <span className={`chip chip-${st === 'ok' ? 'success' : st === 'warn' ? 'warn' : 'danger'}`} style={{ marginTop: 10, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {statusLabel(st)}
      </span>
    </div>
  );
}

/* ─── Alert panel ───────────────────────────────────────────────────────────── */
function AlertPanel({ alerts, workers }: { alerts: AlertItem[]; workers: WorkerRow[] }) {
  const sev = (s: AlertItem['sev']): Status => (s === 'crit' ? 'crit' : s === 'warn' ? 'warn' : 'ok');

  const onlineCount = workers.filter((w) => w.status !== 'offline').length;
  const totalCount = workers.length;

  return (
    <section className="panel" aria-label="Active alerts">
      <div className="panel-head">
        <h2 className="pf-h2" style={{ margin: 0 }}>Active alerts</h2>
        <span className="chip chip-warn">{alerts.filter((a) => a.sev !== 'info').length} issues</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map((alert) => {
          const s = sev(alert.sev);
          return (
            <div key={alert.id} style={{ background: STATUS_SOFT[s], border: `1px solid ${STATUS_BORDER[s]}`, borderRadius: 'var(--radius-sm, 10px)', padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[s], marginBottom: 2 }}>{alert.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45 }}>{alert.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Worker summary strip */}
      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--panel-2)', borderRadius: 'var(--radius-sm, 10px)', border: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Workers online</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>{onlineCount} / {totalCount}</span>
        </div>
        {workers.slice(0, 3).map((w) => (
          <div key={w.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{w.host}</span>
            <span
              className={`chip chip-${w.status === 'offline' || w.status === 'error' ? 'danger' : w.status === 'busy' ? 'warn' : 'success'}`}
              style={{ fontSize: 10, justifySelf: 'start' }}
            >
              {w.status}
            </span>
          </div>
        ))}
        {workers.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Worker heartbeats</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>No workers reporting</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Overall status header ─────────────────────────────────────────────────── */
function OverallHeader({ metrics, timeStr, onExport }: { metrics: GaugeMetric[]; timeStr: string; onExport: () => void }) {
  const statuses = metrics.map((m) => computeStatus(m));
  const hasCrit = statuses.some((s) => s === 'crit');
  const hasWarn = statuses.some((s) => s === 'warn');
  const overall: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';
  const label = overall === 'ok' ? 'All systems nominal' : overall === 'warn' ? 'Degraded — monitoring' : 'Incident active';

  return (
    <section className="panel" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 50%, color-mix(in srgb, ${STATUS_COLOR[overall]} 10%, transparent) 0%, transparent 70%)`, pointerEvents: 'none' }}
      />

      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 3 }}>
          WarmPulse platform — system health
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: STATUS_COLOR[overall], letterSpacing: '-0.01em' }}>{label}</span>
          {overall !== 'ok' && (
            <span className={`chip chip-${overall === 'crit' ? 'danger' : 'warn'}`} style={{ letterSpacing: '0.12em' }}>
              {overall === 'crit' ? 'P1' : 'P2'}
            </span>
          )}
        </div>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {(['ok', 'warn', 'crit'] as Status[]).map((s) => {
          const count = statuses.filter((x) => x === s).length;
          if (count === 0) return null;
          return (
            <span key={s} className={`chip chip-${s === 'ok' ? 'success' : s === 'warn' ? 'warn' : 'danger'}`} style={{ fontSize: 13 }}>
              <strong style={{ fontFamily: 'monospace' }}>{count}</strong> {s === 'ok' ? 'OK' : s === 'warn' ? 'WARN' : 'CRIT'}
            </span>
          );
        })}
      </div>

      {/* Clock */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, borderLeft: '1px solid var(--border-soft)', paddingLeft: 20 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.04em' }}>{timeStr}</span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>UTC live</span>
      </div>

      <div style={{ flexShrink: 0 }}>
        <button className="btn btn-sm" onClick={onExport} disabled={metrics.length === 0}>
          Export CSV
        </button>
      </div>
    </section>
  );
}

/* ─── Subsystem strip ──────────────────────────────────────────────────────── */
function SubsystemStrip({ metrics }: { metrics: GaugeMetric[] }) {
  const subsystems = [
    { label: 'API', ids: ['api_p95', 'api_p50', 'error_rate'] },
    { label: 'Celery', ids: ['queue_depth', 'beat_age'] },
    { label: 'Redis', ids: ['redis_ops'] },
    { label: 'SMTP / IMAP', ids: ['smtp_success', 'imap_polls'] },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {subsystems.map((sub) => {
        const related = metrics.filter((m) => sub.ids.includes(m.id));
        const statuses = related.map((m) => computeStatus(m));
        const hasCrit = statuses.some((s) => s === 'crit');
        const hasWarn = statuses.some((s) => s === 'warn');
        const st: Status = hasCrit ? 'crit' : hasWarn ? 'warn' : 'ok';

        return (
          <div key={sub.label} className="panel" style={{ flex: '1 1 160px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{sub.label}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[st], marginTop: 1 }}>
                {st === 'ok' ? 'Healthy' : st === 'warn' ? 'Degraded' : 'Critical'}
              </div>
            </div>
            <span className={`status-dot dot-${st === 'ok' ? 'success' : st === 'warn' ? 'warn' : 'danger'}`} style={{ marginLeft: 'auto', boxShadow: `0 0 8px ${STATUS_COLOR[st]}` }} />
          </div>
        );
      })}
    </div>
  );
}

/* ─── CSV export (same columns as the source console) ──────────────────────── */
function exportHealthCsv(metrics: GaugeMetric[]): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadCsv(`system-health-${stamp}.csv`, ['Metric', 'Description', 'Value', 'Unit', 'Status', 'Warn Threshold', 'Crit Threshold'],
    metrics.map((m) => [
      m.label,
      m.sublabel,
      m.value.toFixed(m.digits),
      m.unit,
      statusLabel(computeStatus(m)),
      m.warnBelow ?? m.warnAt,
      m.critAt,
    ]));
}

/* ─── Main export ──────────────────────────────────────────────────────────── */
export function SystemHealthPage() {
  const health = useAsync(getSystemHealth);

  // Live dashboard: refetch every 15 s (clock ticks are separate, below).
  // reload is stable (useCallback) — the interval survives re-renders.
  useEffect(() => {
    const id = setInterval(() => void health.reload(), 15_000);
    return () => clearInterval(id);
  }, [health.reload]);

  // Live clock (ticks every second — no data involved). Shown in UTC to match
  // the backend timestamps this page renders next to.
  const [timeStr, setTimeStr] = useState(() => new Date().toISOString().slice(11, 19));
  useEffect(() => {
    const id = setInterval(() => setTimeStr(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(id);
  }, []);

  const data = health.data;
  const metrics = useMemo(() => buildMetrics(data ?? null), [data]);
  const workers = data?.workers ?? [];
  const alerts = buildAlerts(metrics, workers);

  return (
    <>
      <PageHeader title="System health" subtitle="Live platform telemetry — queues, workers, latency and delivery. Auto-refreshes every 15 s." />
      {health.error && <LoadError message={health.error} onRetry={() => void health.reload()} />}

      <OverallHeader metrics={metrics} timeStr={timeStr} onExport={() => exportHealthCsv(metrics)} />
      <SubsystemStrip metrics={metrics} />

      {/* Main: gauges + alerts.
          minmax(0,1fr) lets the columns shrink (each gauge holds a fixed 170px
          SVG); auto-fit wraps the gauges; the media query stacks the alert
          panel under the gauges on narrow viewports. */}
      <style>{`
        .shp-main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
        .shp-gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
        @media (max-width: 1024px) { .shp-main { grid-template-columns: 1fr; } }
      `}</style>

      <div className="shp-main">
        {health.loading && !data ? (
          <Skeleton rows={6} />
        ) : (
          <div className="shp-gauges">
            {metrics.map((m) => (
              <GaugeCard key={m.id} metric={m} />
            ))}
          </div>
        )}

        <AlertPanel alerts={alerts} workers={workers} />
      </div>

      {/* Footer legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 4px', borderTop: '1px solid var(--border-soft)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
          Platform admin · system status · gauge cluster · auto-refresh 15 s
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(['ok', 'warn', 'crit'] as Status[]).map((s) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)' }}>
              <span className={`status-dot dot-${s === 'ok' ? 'success' : s === 'warn' ? 'warn' : 'danger'}`} />
              {statusLabel(s)}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export default SystemHealthPage;
