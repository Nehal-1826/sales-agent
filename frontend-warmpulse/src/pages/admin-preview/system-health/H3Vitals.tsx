/**
 * Admin System Health Design Candidate: H3 Vitals Monitor
 *
 * "Vitals Monitor" — a hospital-monitor aesthetic that renders each subsystem
 * as a vital-sign card: animated EKG/heartbeat SVG stroke, current value with
 * live tick, normal range, and status colour semantics (green/orange/red).
 * An overall "patient status" hero (STABLE / DEGRADED) is computed from the
 * aggregate of all vitals.  One subsystem (Worker queue) is intentionally
 * flatlined/erratic to demonstrate the warning/critical state.
 *
 * Fully self-contained: NO API, NO react-query, NO @/features or @/lib imports.
 * All styling via inline style={{}}. Mock data only. Warm/neutral palette only.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Heart,
  HeartPulse,
  Mail,
  Server,
  Wifi,
  Workflow,
  Zap,
} from 'lucide-react';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.38)',
  ghost: 'rgba(255,255,255,0.18)',
  accent: '#F26522',
  accent2: '#FF8A4B',
  success: '#3ddc97',
  danger: '#ff5c7a',
  warning: '#FF8A4B',
  glass: 'rgba(255,255,255,0.05)',
  glass2: 'rgba(255,255,255,0.09)',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
  successGlow: 'rgba(61,220,151,0.18)',
  dangerGlow: 'rgba(255,92,122,0.20)',
  warningGlow: 'rgba(255,138,75,0.18)',
} as const;

type Status = 'ok' | 'warn' | 'critical';

function statusColor(s: Status): string {
  if (s === 'ok') return T.success;
  if (s === 'warn') return T.warning;
  return T.danger;
}

function statusGlow(s: Status): string {
  if (s === 'ok') return T.successGlow;
  if (s === 'warn') return T.warningGlow;
  return T.dangerGlow;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface Vital {
  id: string;
  label: string;
  subsystem: string;
  icon: typeof Server;
  unit: string;
  value: number;
  min: number;        // normal range low
  max: number;        // normal range high
  hardMax: number;    // scale ceiling for EKG
  status: Status;
  hint: string;
  /** EKG wave style: 'pulse' = regular heartbeat, 'erratic' = spiking, 'flatline' = flatline */
  wave: 'pulse' | 'erratic' | 'flatline';
  /** Whether lower is better (latency) or higher is better (throughput) */
  lowerBetter: boolean;
  format: (v: number) => string;
}

// ─── Mock vitals data ────────────────────────────────────────────────────────
const VITALS: readonly Vital[] = [
  {
    id: 'api-latency',
    label: 'API Latency',
    subsystem: 'API (uvicorn)',
    icon: Server,
    unit: 'ms',
    value: 87,
    min: 0,
    max: 200,
    hardMax: 400,
    status: 'ok',
    hint: 'p95 · 4 workers',
    wave: 'pulse',
    lowerBetter: true,
    format: (v) => `${Math.round(v)} ms`,
  },
  {
    id: 'worker-throughput',
    label: 'Worker Queue',
    subsystem: 'Celery Worker',
    icon: Cpu,
    unit: 'tasks/min',
    value: 312,
    min: 20,
    max: 280,
    hardMax: 400,
    status: 'warn',
    hint: 'default+smtp · queue depth 312',
    wave: 'erratic',
    lowerBetter: false,
    format: (v) => `${Math.round(v)} queued`,
  },
  {
    id: 'beat-pulse',
    label: 'Beat Heartbeat',
    subsystem: 'Celery Beat',
    icon: HeartPulse,
    unit: 's ago',
    value: 8,
    min: 0,
    max: 90,
    hardMax: 180,
    status: 'ok',
    hint: '7 schedules · last tick 8s ago',
    wave: 'pulse',
    lowerBetter: true,
    format: (v) => `${Math.round(v)}s ago`,
  },
  {
    id: 'postgres-conns',
    label: 'PG Connections',
    subsystem: 'Postgres (5433)',
    icon: Database,
    unit: 'conns',
    value: 14,
    min: 0,
    max: 60,
    hardMax: 80,
    status: 'ok',
    hint: '14 / 60 connections',
    wave: 'pulse',
    lowerBetter: false,
    format: (v) => `${Math.round(v)} / 60`,
  },
  {
    id: 'redis-latency',
    label: 'Redis Latency',
    subsystem: 'Redis (6380)',
    icon: HardDrive,
    unit: 'ms',
    value: 0.8,
    min: 0,
    max: 5,
    hardMax: 10,
    status: 'ok',
    hint: 'ping ok · 2 dbs',
    wave: 'pulse',
    lowerBetter: true,
    format: (v) => `${v.toFixed(1)} ms`,
  },
  {
    id: 'smtp-success',
    label: 'SMTP Success',
    subsystem: 'SMTP Fleet',
    icon: Mail,
    unit: '%',
    value: 99.4,
    min: 95,
    max: 100,
    hardMax: 100,
    status: 'ok',
    hint: '0.6% bounce · Gmail/O365/Yahoo',
    wave: 'pulse',
    lowerBetter: false,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    id: 'imap-polls',
    label: 'IMAP Polls',
    subsystem: 'IMAP Watcher',
    icon: Wifi,
    unit: 'polls/min',
    value: 14,
    min: 5,
    max: 30,
    hardMax: 40,
    status: 'ok',
    hint: 'spam-rescue + reply detection',
    wave: 'pulse',
    lowerBetter: false,
    format: (v) => `${Math.round(v)}/min`,
  },
  {
    id: 'queue-depth',
    label: 'Queue Depth',
    subsystem: 'Celery / Redis',
    icon: Workflow,
    unit: 'tasks',
    value: 312,
    min: 0,
    max: 100,
    hardMax: 500,
    status: 'critical',
    hint: 'default queue backlog elevated',
    wave: 'erratic',
    lowerBetter: true,
    format: (v) => `${Math.round(v)} tasks`,
  },
] as const;

// ─── EKG path generation ─────────────────────────────────────────────────────
/**
 * Generates an SVG `d` path for a single heartbeat cycle (P-QRS-T complex).
 * Returns a path that spans width W at height baseline Y.
 */
function buildPulseSegment(W: number, baseline: number, amplitude: number): string {
  const h = baseline;
  const a = amplitude;
  // Segments: flat → P wave → flat → QRS complex → T wave → flat
  const seg: Array<[number, number]> = [
    [0, h],
    [W * 0.12, h],
    [W * 0.17, h - a * 0.15],  // P
    [W * 0.22, h],
    [W * 0.28, h],
    [W * 0.31, h + a * 0.08],  // Q dip
    [W * 0.33, h - a],          // R peak
    [W * 0.36, h + a * 0.25],   // S
    [W * 0.40, h],
    [W * 0.50, h - a * 0.22],   // T wave
    [W * 0.58, h],
    [W * 1.0,  h],
  ];
  return seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function buildErraticSegment(W: number, baseline: number, amplitude: number): string {
  const h = baseline;
  const a = amplitude;
  const seg: Array<[number, number]> = [
    [0, h],
    [W * 0.05, h - a * 0.3],
    [W * 0.10, h + a * 0.1],
    [W * 0.15, h],
    [W * 0.20, h - a * 0.5],
    [W * 0.25, h + a * 0.4],
    [W * 0.30, h - a],          // sharp spike
    [W * 0.33, h + a * 0.6],
    [W * 0.38, h],
    [W * 0.48, h - a * 0.2],
    [W * 0.52, h + a * 0.15],
    [W * 0.56, h],
    [W * 0.70, h + a * 0.25],
    [W * 0.75, h - a * 0.4],
    [W * 0.80, h],
    [W * 1.0,  h],
  ];
  return seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function buildFlatlineSegment(W: number, baseline: number): string {
  return `M0,${baseline.toFixed(1)} L${(W * 1.0).toFixed(1)},${baseline.toFixed(1)}`;
}

// ─── Animated EKG line component ────────────────────────────────────────────
interface EkgLineProps {
  wave: Vital['wave'];
  status: Status;
  width?: number;
  height?: number;
}

function EkgLine({ wave, status, width = 220, height = 44 }: EkgLineProps): JSX.Element {
  const baseline = height * 0.6;
  const amplitude = height * 0.45;
  const color = statusColor(status);
  const pathId = `ekg-${wave}-${status}`;

  let d: string;
  if (wave === 'flatline') {
    d = buildFlatlineSegment(width, baseline);
  } else if (wave === 'erratic') {
    d = buildErraticSegment(width, baseline, amplitude);
  } else {
    d = buildPulseSegment(width, baseline, amplitude);
  }

  const duration = wave === 'erratic' ? '1.4s' : wave === 'flatline' ? '3s' : '2s';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: 'block', overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id={`${pathId}-fade`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="30%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
        <filter id={`${pathId}-glow`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <g style={{ animation: `ekg-scroll-${wave === 'flatline' ? 'flat' : 'pulse'} ${duration} linear infinite` }}>
        <path d={d} fill="none" stroke={`url(#${pathId}-fade)`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" filter={`url(#${pathId}-glow)`} />
      </g>

      <style>{`
        @keyframes ekg-scroll-pulse {
          from { transform: translateX(0); }
          to   { transform: translateX(-${width}px); }
        }
        @keyframes ekg-scroll-flat {
          from { transform: translateX(0); }
          to   { transform: translateX(-${width}px); }
        }
      `}</style>
    </svg>
  );
}

// ─── Value ticker hook ───────────────────────────────────────────────────────
/** Adds a small ±jitter to a value each tick to simulate live readings. */
function useLiveTick(base: number, jitterPct: number, intervalMs: number): number {
  const [val, setVal] = useState(base);
  const baseRef = useRef(base);
  baseRef.current = base;

  useEffect(() => {
    const id = setInterval(() => {
      const jitter = baseRef.current * (jitterPct / 100) * (Math.random() * 2 - 1);
      setVal(baseRef.current + jitter);
    }, intervalMs);
    return () => clearInterval(id);
  }, [jitterPct, intervalMs]);

  return val;
}

// ─── Vital card ──────────────────────────────────────────────────────────────
interface VitalCardProps {
  vital: Vital;
}

function VitalCard({ vital }: VitalCardProps): JSX.Element {
  const live = useLiveTick(vital.value, vital.wave === 'erratic' ? 8 : 1.5, vital.wave === 'erratic' ? 700 : 2000);

  const pct = Math.min(1, Math.max(0, live / vital.hardMax));
  const color = statusColor(vital.status);
  const glow = statusGlow(vital.status);

  const rangeFrac = vital.hardMax > 0 ? [vital.min / vital.hardMax, vital.max / vital.hardMax] : [0, 1];

  const cardStyle: CSSProperties = {
    background: T.glass,
    border: `1px solid ${vital.status === 'critical' ? 'rgba(255,92,122,0.35)' : vital.status === 'warn' ? 'rgba(255,138,75,0.30)' : T.border}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
    padding: '16px 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: vital.status !== 'ok' ? `0 0 28px 0 ${glow}` : 'none',
    position: 'relative',
    overflow: 'hidden',
    transition: 'box-shadow 0.6s ease',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  };

  const labelColStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  };

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color,
    background: glow,
    border: `1px solid ${color}40`,
    borderRadius: 6,
    padding: '2px 7px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };

  const Icon = vital.icon;

  return (
    <div style={cardStyle}>
      {/* Subtle corner accent glow for non-ok */}
      {vital.status !== 'ok' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -30,
            right: -30,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: glow,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Header row */}
      <div style={headerStyle}>
        <div style={labelColStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={13} strokeWidth={2.2} color={T.dim} />
            <span style={{ fontSize: 11, color: T.dim, fontWeight: 500, letterSpacing: '0.04em' }}>
              {vital.subsystem}
            </span>
          </div>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 700, letterSpacing: '-0.01em' }}>
            {vital.label}
          </span>
        </div>
        <div style={badgeStyle}>
          {vital.status === 'ok'
            ? <><CheckCircle2 size={9} strokeWidth={2.5} />{' '}OK</>
            : vital.status === 'warn'
            ? <><AlertTriangle size={9} strokeWidth={2.5} />{' '}WARN</>
            : <><AlertTriangle size={9} strokeWidth={2.5} />{' '}CRIT</>
          }
        </div>
      </div>

      {/* EKG line */}
      <div style={{ borderRadius: 8, overflow: 'hidden', height: 44, background: 'rgba(0,0,0,0.18)', position: 'relative' }}>
        <EkgLine wave={vital.wave} status={vital.status} />
        {/* Scan line overlay for clinical feel */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
            pointerEvents: 'none',
            borderRadius: 8,
          }}
        />
      </div>

      {/* Value + range bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Current value */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {vital.format(live)}
          </span>
          <span style={{ fontSize: 10, color: T.faint, fontWeight: 500 }}>
            normal {vital.format(vital.min)}–{vital.format(vital.max)}
          </span>
        </div>

        {/* Progress bar with normal-range window */}
        <div
          style={{
            height: 4,
            borderRadius: 99,
            background: 'rgba(255,255,255,0.08)',
            position: 'relative',
            overflow: 'visible',
          }}
        >
          {/* Normal range zone */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: `${(rangeFrac[0] ?? 0) * 100}%`,
              width: `${((rangeFrac[1] ?? 1) - (rangeFrac[0] ?? 0)) * 100}%`,
              height: '100%',
              background: `${T.success}28`,
              borderRadius: 99,
              border: `1px solid ${T.success}30`,
            }}
          />
          {/* Current value cursor */}
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(98, pct * 100)}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 8px 2px ${color}60`,
              transition: 'left 0.8s ease',
            }}
          />
          {/* Fill */}
          <div
            style={{
              height: '100%',
              width: `${pct * 100}%`,
              background: `linear-gradient(90deg, ${color}40, ${color}80)`,
              borderRadius: 99,
              transition: 'width 0.8s ease',
            }}
          />
        </div>

        {/* Hint */}
        <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.02em' }}>{vital.hint}</span>
      </div>
    </div>
  );
}

// ─── Big hero EKG pulse ──────────────────────────────────────────────────────
function HeroEkg({ status }: { status: Status }): JSX.Element {
  const color = statusColor(status);
  const W = 600;
  const H = 60;
  const baseline = H * 0.58;
  const amplitude = H * 0.48;

  const d1 = buildPulseSegment(W, baseline, amplitude);

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="hero-ekg-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="20%" stopColor={color} stopOpacity="0.7" />
          <stop offset="80%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
        <filter id="hero-ekg-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <g style={{ animation: `hero-ekg-scroll 2.8s linear infinite` }}>
        <path d={d1} fill="none" stroke={`url(#hero-ekg-fade)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={d1} fill="none" stroke={color} strokeWidth="1.4" opacity="0.5" filter="url(#hero-ekg-glow)" strokeLinecap="round" />
      </g>
      <style>{`
        @keyframes hero-ekg-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-${W}px); }
        }
      `}</style>
    </svg>
  );
}

// ─── Clock display ───────────────────────────────────────────────────────────
function LiveClock(): JSX.Element {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number): string => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
        {timeStr}
      </span>
      <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>{dateStr}</span>
    </div>
  );
}

// ─── Overall status computation ───────────────────────────────────────────────
function computeOverallStatus(vitals: readonly Vital[]): Status {
  if (vitals.some((v) => v.status === 'critical')) return 'critical';
  if (vitals.some((v) => v.status === 'warn')) return 'warn';
  return 'ok';
}

// ─── Blinking dot ────────────────────────────────────────────────────────────
function BlinkDot({ color }: { color: string }): JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px 2px ${color}80`,
        animation: 'blink-dot 1.2s ease-in-out infinite',
        flexShrink: 0,
      }}
    >
      <style>{`
        @keyframes blink-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </span>
  );
}

// ─── Summary ticker ───────────────────────────────────────────────────────────
interface SummaryTickerProps {
  ok: number;
  warn: number;
  critical: number;
}

function SummaryTicker({ ok, warn, critical }: SummaryTickerProps): JSX.Element {
  const items: Array<{ label: string; count: number; color: string }> = [
    { label: 'Healthy', count: ok, color: T.success },
    { label: 'Warning', count: warn, color: T.warning },
    { label: 'Critical', count: critical, color: T.danger },
  ];
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BlinkDot color={it.color} />
          <span style={{ fontSize: 12, color: T.dim, fontWeight: 500 }}>
            <span style={{ color: it.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.count}</span>
            {' '}{it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Mini stat chip ───────────────────────────────────────────────────────────
interface MiniStatProps {
  label: string;
  value: string;
  icon: typeof Server;
  accent?: boolean;
}

function MiniStat({ label, value, icon: Icon, accent }: MiniStatProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        background: T.glass2,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 12,
        padding: '10px 14px',
        minWidth: 90,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon size={11} strokeWidth={2.2} color={accent ? T.accent : T.faint} />
        <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.04em', fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: 16, fontWeight: 800, color: accent ? T.accent : T.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────
export function AdmHlthH3Vitals(): JSX.Element {
  const overallStatus = useMemo(() => computeOverallStatus(VITALS), []);
  const overallColor = statusColor(overallStatus);

  const okCount = VITALS.filter((v) => v.status === 'ok').length;
  const warnCount = VITALS.filter((v) => v.status === 'warn').length;
  const critCount = VITALS.filter((v) => v.status === 'critical').length;

  const rootStyle: CSSProperties = {
    minHeight: '100%',
    padding: '0 0 48px',
    color: T.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    WebkitFontSmoothing: 'antialiased',
  };

  const heroStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${overallStatus === 'critical' ? 'rgba(255,92,122,0.12)' : overallStatus === 'warn' ? 'rgba(255,138,75,0.10)' : 'rgba(61,220,151,0.08)'} 0%, rgba(255,255,255,0.03) 100%)`,
    border: `1px solid ${overallStatus === 'critical' ? 'rgba(255,92,122,0.30)' : overallStatus === 'warn' ? 'rgba(255,138,75,0.25)' : 'rgba(61,220,151,0.22)'}`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 20,
    padding: '24px 28px 20px',
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: overallStatus !== 'ok' ? `0 0 60px 0 ${statusGlow(overallStatus)}` : 'none',
  };

  const overallLabel =
    overallStatus === 'ok' ? 'PATIENT STABLE' : overallStatus === 'warn' ? 'PATIENT DEGRADED' : 'PATIENT CRITICAL';

  return (
    <div style={rootStyle}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 0 20px',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Heart size={18} strokeWidth={2.2} color={T.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
            WarmPulse · Vitals Monitor
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: T.faint,
              background: T.glass2,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: 6,
              padding: '2px 8px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            System Health
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} strokeWidth={2.2} color={T.accent} />
            <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>LIVE · 5s refresh</span>
          </div>
          <LiveClock />
        </div>
      </div>

      {/* Hero overall status */}
      <div style={heroStyle}>
        {/* Background cross-hatch grid for clinical feel */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(${T.ghost}18 1px, transparent 1px), linear-gradient(90deg, ${T.ghost}18 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
            borderRadius: 20,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Top row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BlinkDot color={overallColor} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: overallColor,
                  }}
                >
                  {overallLabel}
                </span>
              </div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: T.text,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {overallStatus === 'ok'
                  ? 'All systems operational'
                  : overallStatus === 'warn'
                  ? 'Some vitals elevated'
                  : '2 critical vitals — action required'}
              </h2>
              <p style={{ fontSize: 12, color: T.dim, margin: 0 }}>
                {VITALS.length} subsystems monitored · last sweep 4 seconds ago
              </p>
            </div>

            {/* Summary ticker */}
            <SummaryTicker ok={okCount} warn={warnCount} critical={critCount} />
          </div>

          {/* Hero EKG */}
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              border: `1px solid ${T.border}`,
              position: 'relative',
            }}
          >
            <HeroEkg status={overallStatus} />
            {/* Scan grid overlay */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)`,
                backgroundSize: '100% 10px',
                pointerEvents: 'none',
              }}
            />
            {/* Left label */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                fontSize: 9,
                color: T.faint,
                letterSpacing: '0.1em',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              SYS.PULSE
            </div>
            {/* Speed indicator */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                fontSize: 9,
                color: T.faint,
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              25 mm/s · 10 mm/mV
            </div>
          </div>

          {/* Bottom stat chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <MiniStat label="Uptime 90d" value="99.94%" icon={Activity} accent />
            <MiniStat label="p95 Latency" value="87 ms" icon={Clock} />
            <MiniStat label="Queue Depth" value="312" icon={Workflow} />
            <MiniStat label="Beat Age" value="8s" icon={HeartPulse} />
            <MiniStat label="PG Conns" value="14/60" icon={Database} />
            <MiniStat label="SMTP Rate" value="99.4%" icon={Mail} />
          </div>
        </div>
      </div>

      {/* Section label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={13} strokeWidth={2.2} color={T.accent} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Subsystem Vitals
          </span>
        </div>
        <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>
          {VITALS.length} monitors · live readout
        </span>
      </div>

      {/* Vitals grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {VITALS.map((v) => (
          <VitalCard key={v.id} vital={v} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 28,
          paddingTop: 16,
          borderTop: `1px solid ${T.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 10, color: T.faint }}>
          WarmPulse Vitals Monitor · prod-eu-01 · Hostinger VPS
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 3, background: T.success, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: T.faint }}>Normal range</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 3, background: T.warning, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: T.faint }}>Warning</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 3, background: T.danger, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: T.faint }}>Critical</span>
          </div>
        </div>
      </div>
    </div>
  );
}
