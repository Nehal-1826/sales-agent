import { Check, X } from 'lucide-react';
import type { DemoMailbox } from '../pro-dashboards/demoData';

/**
 * Shared visual primitives used across all 6 Pro Mailbox variants.
 * Keeps each variant focused on its own layout while reusing the same
 * status pills, sparkline math, and DNS cells.
 */

/* ---------- Status pill ---------- */
export function StatusPill({
  status,
  compact,
}: {
  status: DemoMailbox['status'];
  compact?: boolean;
}) {
  const map = {
    active: { lbl: 'Active', tone: 'success' as const },
    warmup: { lbl: 'Warming', tone: 'warning' as const },
    paused: { lbl: 'Paused', tone: 'danger' as const },
  };
  const m = map[status];
  return (
    <span className={`mb-status mb-status--${m.tone} ${compact ? 'mb-status--compact' : ''}`}>
      <span className={`mb-status__dot mb-status__dot--${m.tone}`} />
      {m.lbl}
    </span>
  );
}

/* ---------- DNS cell ---------- */
export function DnsCell({ ok }: { ok: boolean }) {
  return (
    <span className={`mb-dns-cell mb-dns-cell--${ok ? 'ok' : 'err'}`}>
      {ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
    </span>
  );
}

/* ---------- Tone derivation ---------- */
export function toneFor(m: DemoMailbox): 'success' | 'warning' | 'danger' {
  if (m.status === 'paused') return 'danger';
  if (m.warmth >= 80) return 'success';
  return 'warning';
}

/* ---------- Mini sparkline ---------- */
export function MiniSpark({
  data,
  tone,
  width = 70,
  height = 22,
}: {
  data: number[];
  tone: 'success' | 'warning' | 'danger' | 'violet';
  width?: number;
  height?: number;
}) {
  const PAD = 1;
  const max = 100, min = 0;
  const step = (width - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: PAD + i * step,
    y: height - PAD - ((v - min) / (max - min)) * (height - PAD * 2),
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const colorMap = {
    success: '#3ddc97',
    warning: '#ffb454',
    danger: '#ff5c7a',
    violet: '#FF9670',
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={colorMap[tone]} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Hero area sparkline (with gradient fill, violet) ---------- */
export function HeroSparkline({ data, width = 600, height = 60 }: { data: number[]; width?: number; height?: number }) {
  const PAD = 4;
  const max = 100, min = 0;
  const step = (width - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: PAD + i * step,
    y: height - PAD - ((v - min) / (max - min)) * (height - PAD * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${pts[pts.length - 1]!.x} ${height - PAD} L ${pts[0]!.x} ${height - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="mb-hero-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mb-hero-spark)" />
      <path d={path} fill="none" stroke="#FF9670" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r={2.5} fill="#FF9670" />
    </svg>
  );
}

/* ---------- Provider letter swatch ---------- */
export function ProviderSwatch({ provider, size = 26 }: { provider: DemoMailbox['provider']; size?: number }) {
  const letter = provider === 'gmail' ? 'G' : provider === 'outlook' ? 'O' : 'Y';
  return (
    <span className={`mb-provider mb-provider--${provider}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {letter}
    </span>
  );
}
