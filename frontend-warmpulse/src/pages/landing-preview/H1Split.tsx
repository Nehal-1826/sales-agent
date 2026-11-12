/**
 * H1Split.tsx — "Split Showcase" Hero candidate for WarmPulse landing page.
 *
 * Layout: LEFT = brand/nav pill + announcement + eyebrow + headline + subcopy
 *         + CTAs + trust line + KPI strip
 *         RIGHT = plan tab switcher (Starter / Pro / Pro Plus) with distinct
 *                 mini-dashboard per plan, swapped via AnimatePresence (spring).
 *
 * Constraints:
 *   - ONLY react, framer-motion, lucide-react imports.
 *   - All styling via inline style={{}} — no CSS imports, no @/ aliases.
 *   - Dark warm "Aurora Glass" palette (#0a0a0f bg, orange accent #F26522→#FF8A4B).
 *   - NO purple/violet/blue/teal/cyan/indigo/pink.
 *   - Plans: Starter, Pro, Pro Plus ONLY. No Agency tier.
 *   - TS-safe: no bare any, all array indices guarded, all imports used, cleanup done.
 */

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Zap,
  BarChart2,
  ArrowRight,
  CheckCircle2,
  Mail,
  Star,
  TrendingUp,
  Shield,
  Activity,
  Inbox,
  ChevronRight,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0f',
  surface: 'rgba(255,255,255,0.05)',
  surfaceHover: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderAccent: '1px solid rgba(242,101,34,0.35)',
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.62)',
  faint: 'rgba(255,255,255,0.32)',
  accent: '#F26522',
  accentMid: '#FF8A4B',
  success: '#3ddc97',
  warning: '#FF8A4B',
  danger: '#ff5c7a',
  glow1: 'rgba(242,101,34,0.22)',
  glow2: 'rgba(255,138,75,0.14)',
} as const;

// ─── Shared style helpers ─────────────────────────────────────────────────────
const glassPanel = (extra?: CSSProperties): CSSProperties => ({
  background: C.surface,
  border: C.border,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 16,
  ...extra,
});

const pill = (extra?: CSSProperties): CSSProperties => ({
  background: 'rgba(242,101,34,0.12)',
  border: C.borderAccent,
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 11,
  fontFamily: 'monospace',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: C.accentMid,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  ...extra,
});

// ─── Framer-motion variants ───────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.11, delayChildren: 0.08 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
};

const showcaseVariants: Variants = {
  enter: {
    opacity: 0,
    scale: 0.97,
    y: 14,
    transition: { type: 'spring', stiffness: 340, damping: 30 },
  },
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 340, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -10,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 1.2, decimals = 0) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctrl = animate(mv, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v.toFixed(decimals)),
    });
    return () => ctrl.stop();
  }, [mv, target, duration, decimals]);

  return display;
}

// ─── Tiny sparkline (inline SVG path from data points) ───────────────────────
function Sparkline({
  data,
  color,
  w = 120,
  h = 36,
}: {
  data: number[];
  color: string;
  w?: number;
  h?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.85 - 2;
    return `${x},${y}`;
  });
  const d = `M${pts.join(' L')}`;
  const fillPts = [`0,${h}`, ...pts, `${w},${h}`];
  const fd = `M${fillPts.join(' L')}Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="spkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fd} fill="url(#spkFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mini arc gauge ───────────────────────────────────────────────────────────
function ArcGauge({ pct, color }: { pct: number; color: string }) {
  const r = 38;
  const cx = 52;
  const cy = 52;
  const startAngle = -200;
  const sweep = 220;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (deg: number) => {
    const a = toRad(startAngle + deg);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const end = arc(sweep);
  const start = arc(0);
  const filledEnd = arc(sweep * pct);
  const largeArc = sweep * pct > 180 ? 1 : 0;
  const bgLargeArc = sweep > 180 ? 1 : 0;
  return (
    <svg width={104} height={72} viewBox="0 0 104 72">
      {/* track */}
      <path
        d={`M${start.x},${start.y} A${r},${r} 0 ${bgLargeArc},1 ${end.x},${end.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {/* filled */}
      <motion.path
        d={`M${start.x},${start.y} A${r},${r} 0 ${largeArc},1 ${filledEnd.x},${filledEnd.y}`}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: pct }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
      />
      {/* label */}
      <text x={cx} y={cy + 5} textAnchor="middle" fill={C.text} fontSize={15} fontWeight={700}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ─── Mini combo bar+line chart ─────────────────────────────────────────────────
function ComboChart({ bars, line, color }: { bars: number[]; line: number[]; color: string }) {
  const w = 180;
  const h = 60;
  const max = Math.max(...bars, 1);
  const lineMax = Math.max(...line, 1);
  const bw = w / bars.length - 3;
  const linePts = line.map((v, i) => {
    const x = (i / (line.length - 1)) * w;
    const y = h - (v / lineMax) * h * 0.8 - 4;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.7} />
          <stop offset="100%" stopColor={color} stopOpacity={0.2} />
        </linearGradient>
      </defs>
      {bars.map((v, i) => {
        const bh = (v / max) * h * 0.75;
        return (
          <motion.rect
            key={i}
            x={i * (bw + 3)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={2}
            fill="url(#barGrad)"
            initial={{ scaleY: 0, originY: '100%' }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.5, delay: 0.05 * i, ease: 'easeOut' }}
          />
        );
      })}
      <polyline
        points={linePts.join(' ')}
        fill="none"
        stroke={C.accentMid}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Starter Dashboard ────────────────────────────────────────────────────────
function StarterDash() {
  const deliverability = useCountUp(94.2, 1.1, 1);
  const sendsToday = useCountUp(18, 0.9);
  const reputation = useCountUp(87, 1.0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: C.faint, fontFamily: 'monospace', letterSpacing: '0.08em' }}>STARTER PLAN</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 2 }}>hello@acme.io</div>
        </div>
        <div style={pill()}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, display: 'inline-block' }} />
          Warming
        </div>
      </div>

      {/* Gauge + sparkline side by side */}
      <div style={glassPanel({ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 20px' })}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <ArcGauge pct={0.87} color={C.accent} />
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Inbox Health</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, fontFamily: 'monospace' }}>Last 14 days</div>
          <Sparkline
            data={[52, 55, 60, 66, 70, 74, 77, 79, 82, 84, 85, 86, 87, 87]}
            color={C.success}
            w={130}
            h={40}
          />
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { label: 'Deliverability', value: `${deliverability}%`, icon: <CheckCircle2 size={13} />, color: C.success },
          { label: 'Sends Today', value: sendsToday, icon: <Mail size={13} />, color: C.accentMid },
          { label: 'Reputation', value: `${reputation}`, icon: <Star size={13} />, color: C.accent },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={glassPanel({
              padding: '12px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              alignItems: 'flex-start',
            })}
          >
            <div style={{ color: kpi.color }}>{kpi.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: C.faint, fontFamily: 'monospace' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Day ramp indicator */}
      <div style={glassPanel({ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 })}>
        <TrendingUp size={14} color={C.accentMid} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.dim }}>Ramp Day <strong style={{ color: C.text }}>11</strong> of 28</div>
          <div style={{ marginTop: 5, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${C.accent}, ${C.accentMid})` }}
              initial={{ width: 0 }}
              animate={{ width: '39%' }}
              transition={{ duration: 1.0, ease: 'easeOut', delay: 0.4 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.faint }}>39%</div>
      </div>
    </div>
  );
}

// ─── Pro Dashboard ────────────────────────────────────────────────────────────
const MAILBOX_LEADERBOARD = [
  { name: 'outreach@ventura.co', score: 94, sends: 48, provider: 'Gmail' },
  { name: 'sales@brixton.io', score: 88, sends: 41, provider: 'Outlook' },
  { name: 'hello@lumen.ai', score: 79, sends: 35, provider: 'Yahoo' },
];

function ProDash() {
  const inboxRate = useCountUp(97.4, 1.1, 1);
  const totalSends = useCountUp(312, 1.0);
  const activeMailboxes = useCountUp(5, 0.7);
  const peerReplies = useCountUp(143, 1.1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: C.faint, fontFamily: 'monospace', letterSpacing: '0.08em' }}>PRO PLAN · 5 MAILBOXES</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 2 }}>Workspace Overview</div>
        </div>
        <div style={pill({ background: 'rgba(61,220,151,0.10)', border: '1px solid rgba(61,220,151,0.30)', color: C.success })}>
          All healthy
        </div>
      </div>

      {/* 4-tile KPI band */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          { label: 'Inbox Rate', value: `${inboxRate}%`, color: C.success },
          { label: 'Sends Today', value: totalSends, color: C.accentMid },
          { label: 'Mailboxes', value: activeMailboxes, color: C.accent },
          { label: 'Peer Replies', value: peerReplies, color: C.dim },
        ].map((kpi) => (
          <div key={kpi.label} style={glassPanel({ padding: '10px 8px', textAlign: 'center' })}>
            <div style={{ fontSize: 17, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', marginTop: 2 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Combo chart */}
      <div style={glassPanel({ padding: '14px 16px' })}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span>Daily sends + inbox rate</span>
          <span style={{ color: C.faint, fontFamily: 'monospace', fontSize: 10 }}>Last 10 days</span>
        </div>
        <ComboChart
          bars={[28, 34, 32, 41, 38, 44, 48, 45, 51, 48]}
          line={[81, 84, 83, 87, 86, 90, 92, 91, 95, 97]}
          color={C.accent}
        />
        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          {[
            { label: 'Sends', color: C.accent },
            { label: 'Inbox %', color: C.accentMid },
          ].map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.faint }}>
              <span style={{ width: 10, height: 2, background: l.color, borderRadius: 2, display: 'inline-block' }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Mailbox leaderboard */}
      <div style={glassPanel({ padding: '12px 14px' })}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>Mailbox leaderboard</span>
          <span style={{ color: C.accent, fontSize: 10, cursor: 'pointer' }}>View all →</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MAILBOX_LEADERBOARD.map((mb, i) => (
            <div key={mb.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: i === 0 ? `rgba(242,101,34,0.25)` : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: i === 0 ? C.accent : C.faint,
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mb.name}</div>
                <div style={{ fontSize: 9, color: C.faint, marginTop: 1 }}>{mb.provider} · {mb.sends} sends</div>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: mb.score >= 90 ? C.success : mb.score >= 80 ? C.accentMid : C.warning,
              }}>
                {mb.score}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pro Plus Dashboard ───────────────────────────────────────────────────────
const PROPLUS_MAILBOXES = [
  { name: 'founders@zenith.io', health: 98, status: 'peak', sends: 62 },
  { name: 'growth@axiom.co', health: 94, status: 'healthy', sends: 58 },
  { name: 'sales@crestline.ai', health: 87, status: 'healthy', sends: 51 },
  { name: 'hello@luminary.io', health: 73, status: 'warming', sends: 39 },
  { name: 'info@bridgepoint.co', health: 61, status: 'early', sends: 22 },
];

function ProPlusDash() {
  const [selected, setSelected] = useState(0);
  const selectedMb = PROPLUS_MAILBOXES[selected] ?? PROPLUS_MAILBOXES[0]!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: C.faint, fontFamily: 'monospace', letterSpacing: '0.08em' }}>PRO PLUS · 5 MAILBOXES</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 2 }}>Multi-Mailbox Control</div>
        </div>
        <div style={pill()}>
          <Activity size={10} />
          Live
        </div>
      </div>

      {/* Master / Detail layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 10, alignItems: 'start' }}>
        {/* Master list */}
        <div style={glassPanel({ padding: '10px 0', overflow: 'hidden' })}>
          <div style={{ fontSize: 10, color: C.faint, fontFamily: 'monospace', padding: '0 12px 8px', letterSpacing: '0.1em' }}>
            MAILBOXES
          </div>
          {PROPLUS_MAILBOXES.map((mb, i) => {
            const statusColor = mb.status === 'peak' ? C.success : mb.status === 'healthy' ? C.accentMid : mb.status === 'warming' ? C.accent : C.faint;
            return (
              <motion.button
                key={mb.name}
                type="button"
                onClick={() => setSelected(i)}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                style={{
                  width: '100%',
                  background: selected === i ? 'rgba(242,101,34,0.10)' : 'transparent',
                  border: 'none',
                  borderLeft: selected === i ? `2px solid ${C.accent}` : '2px solid transparent',
                  padding: '9px 12px 9px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mb.name.split('@')[1] ?? mb.name}</div>
                  <div style={{ fontSize: 9, color: C.faint, marginTop: 1 }}>{mb.sends} sends</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{mb.health}</div>
              </motion.button>
            );
          })}
        </div>

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 32 } }}
            exit={{ opacity: 0, x: -6, transition: { duration: 0.14 } }}
            style={glassPanel({ padding: '14px' })}
          >
            <div style={{ fontSize: 10, color: C.faint, fontFamily: 'monospace', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedMb.name}
            </div>

            {/* Health arc mini */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
              <ArcGauge pct={(selectedMb.health ?? 0) / 100} color={
                (selectedMb.health ?? 0) >= 90 ? C.success : (selectedMb.health ?? 0) >= 75 ? C.accentMid : C.accent
              } />
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { label: 'Sends today', value: String(selectedMb.sends ?? 0), icon: <Mail size={11} /> },
                { label: 'Peer replies', value: String(Math.round((selectedMb.sends ?? 0) * 0.62)), icon: <Inbox size={11} /> },
                { label: 'Status', value: selectedMb.status ?? 'unknown', icon: <Shield size={11} /> },
              ].map((row) => (
                <div key={row.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.faint, fontSize: 10 }}>
                    {row.icon}
                    {row.label}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{row.value}</div>
                </div>
              ))}
            </div>

            {/* Sparkline */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', marginBottom: 4 }}>Health trend</div>
              <Sparkline
                data={[60, 65, 68, 71, 74, 76, 79, 82, 84, 85, 87, (selectedMb.health ?? 80)]}
                color={C.accentMid}
                w={130}
                h={30}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom aggregate strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[
          { label: 'Avg Health', value: '82.6', unit: '%' },
          { label: 'Total Sends', value: '232', unit: '/day' },
          { label: 'Peer Network', value: '1.2k', unit: ' peers' },
        ].map((s) => (
          <div key={s.label} style={glassPanel({ padding: '8px 10px', textAlign: 'center' })}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.accentMid }}>
              {s.value}<span style={{ fontSize: 9, color: C.faint, fontWeight: 400 }}>{s.unit}</span>
            </div>
            <div style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan types & config ──────────────────────────────────────────────────────
type PlanId = 'starter' | 'pro' | 'proplus';

const PLANS: Array<{ id: PlanId; label: string; sub: string }> = [
  { id: 'starter', label: 'Starter', sub: '1 mailbox' },
  { id: 'pro', label: 'Pro', sub: '5 mailboxes' },
  { id: 'proplus', label: 'Pro Plus', sub: 'Unlimited' },
];

const PLAN_COMPONENT: Record<PlanId, () => JSX.Element> = {
  starter: StarterDash,
  pro: ProDash,
  proplus: ProPlusDash,
};

// ─── KPI counters (left column) ───────────────────────────────────────────────
function KpiCounter({ target, suffix, label, decimals = 0 }: { target: number; suffix: string; label: string; decimals?: number }) {
  const val = useCountUp(target, 1.4, decimals);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1 }}>
        {val}{suffix}
      </div>
      <div style={{ fontSize: 11, color: C.faint }}>{label}</div>
    </div>
  );
}

// ─── Main Hero ────────────────────────────────────────────────────────────────
export function LandHeroH1Split() {
  const [activePlan, setActivePlan] = useState<PlanId>('starter');
  const [isHoveringCta, setIsHoveringCta] = useState(false);
  const ActiveDash = PLAN_COMPONENT[activePlan];

  return (
    <section
      aria-label="Hero"
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100%',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── Ambient background glows ── */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* warm left glow */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-5%',
          width: '55%', height: '70%',
          background: `radial-gradient(ellipse at 30% 40%, ${C.glow1} 0%, transparent 65%)`,
          transform: 'rotate(-15deg)',
        }} />
        {/* warm right glow */}
        <div style={{
          position: 'absolute', top: '20%', right: '-8%',
          width: '50%', height: '60%',
          background: `radial-gradient(ellipse at 70% 30%, ${C.glow2} 0%, transparent 65%)`,
        }} />
        {/* subtle warm bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: '25%',
          width: '50%', height: '35%',
          background: `radial-gradient(ellipse at 50% 100%, rgba(242,101,34,0.09) 0%, transparent 65%)`,
        }} />
      </div>

      {/* ── Nav row ── */}
      <nav style={{
        position: 'relative', zIndex: 10,
        padding: '20px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentMid})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={14} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>WarmPulse</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {['Features', 'Pricing', 'Blog'].map((link) => (
            <span key={link} style={{ fontSize: 13, color: C.dim, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = C.text; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = C.dim; }}
            >{link}</span>
          ))}
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentMid})`,
              border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}
          >
            Sign in
          </motion.button>
        </div>
      </nav>

      {/* ── Two-column hero body ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 48,
        maxWidth: 1200,
        margin: '0 auto',
        padding: '48px 48px 64px',
        alignItems: 'center',
        width: '100%',
        boxSizing: 'border-box',
      }}>

        {/* ══ LEFT COLUMN ══ */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          {/* Announcement pill */}
          <motion.div variants={fadeUp}>
            <div style={pill()}>
              <Zap size={10} />
              <span>Trusted by 1,200+ outbound teams</span>
            </div>
          </motion.div>

          {/* Eyebrow */}
          <motion.div variants={fadeUp} style={{ marginTop: -8 }}>
            <span style={{
              fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.2em',
              textTransform: 'uppercase', color: C.faint,
            }}>
              Email Warmup · Reimagined
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            style={{
              fontSize: 'clamp(36px, 4vw, 52px)',
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: C.text,
              margin: 0,
            }}
          >
            Land in{' '}
            <span style={{
              background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentMid} 55%, #FFB07A 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              inbox.
            </span>
            <br />
            Not in spam.
          </motion.h1>

          {/* Sub-copy */}
          <motion.p
            variants={fadeUp}
            style={{
              fontSize: 16, lineHeight: 1.65, color: C.dim, margin: 0, maxWidth: 420,
            }}
          >
            WarmPulse runs a peer-inbox network that teaches Gmail, Outlook, and Yahoo
            that your domain is trustworthy — so every real email you send reaches the
            inbox, not Promotions or Spam.
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={fadeUp}
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.04, boxShadow: `0 0 28px rgba(242,101,34,0.45)` }}
              whileTap={{ scale: 0.97 }}
              onHoverStart={() => setIsHoveringCta(true)}
              onHoverEnd={() => setIsHoveringCta(false)}
              style={{
                padding: '13px 26px',
                borderRadius: 10,
                background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentMid} 100%)`,
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: `0 0 18px rgba(242,101,34,0.28)`,
                transition: 'box-shadow 0.2s',
              }}
            >
              Get started free
              <motion.span
                animate={{ x: isHoveringCta ? 3 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <ArrowRight size={15} />
              </motion.span>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ background: 'rgba(255,255,255,0.07)' }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '13px 22px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: C.border,
                cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: C.dim,
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'background 0.15s',
              }}
            >
              <BarChart2 size={14} color={C.accent} />
              See how it works
            </motion.button>
          </motion.div>

          {/* Trust line */}
          <motion.div
            variants={fadeUp}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <CheckCircle2 size={13} color={C.success} />
            <span style={{ fontSize: 12, color: C.faint }}>
              No credit card required · Set up in 2 minutes · Cancel anytime
            </span>
          </motion.div>

          {/* KPI strip */}
          <motion.div
            variants={fadeUp}
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
              gap: 1, marginTop: 8,
              borderRadius: 14, overflow: 'hidden',
              border: C.border,
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            {[
              { target: 97.4, suffix: '%', label: 'Avg inbox rate', decimals: 1 },
              { target: 1200, suffix: '+', label: 'Active teams' },
              { target: 4.2, suffix: 'M', label: 'Emails warmed', decimals: 1 },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                style={{
                  padding: '14px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRight: i < 2 ? C.border : 'none',
                  display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
                }}
              >
                <KpiCounter {...kpi} />
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* ══ RIGHT COLUMN — Plan showcase ══ */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] } }}
          style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
        >
          {/* Floating ambient glow behind showcase */}
          <motion.div
            aria-hidden
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'relative' }}
          >
            {/* Tab bar */}
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.04)',
              border: C.border,
              borderRadius: '16px 16px 0 0',
              overflow: 'hidden',
              position: 'relative',
            }}>
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setActivePlan(plan.id)}
                  style={{
                    flex: 1, position: 'relative', padding: '11px 8px',
                    border: 'none', background: 'transparent',
                    cursor: 'pointer', zIndex: 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    transition: 'color 0.15s',
                  }}
                >
                  {/* Active indicator */}
                  {activePlan === plan.id && (
                    <motion.div
                      layoutId="planTabIndicator"
                      style={{
                        position: 'absolute', inset: 0,
                        background: `rgba(242,101,34,0.12)`,
                        borderBottom: `2px solid ${C.accent}`,
                        borderRadius: 0,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: activePlan === plan.id ? C.accent : C.faint,
                    position: 'relative',
                    transition: 'color 0.15s',
                  }}>
                    {plan.label}
                  </span>
                  <span style={{
                    fontSize: 9, fontFamily: 'monospace',
                    color: activePlan === plan.id ? C.accentMid : 'rgba(255,255,255,0.22)',
                    letterSpacing: '0.06em', position: 'relative',
                    textTransform: 'uppercase',
                    transition: 'color 0.15s',
                  }}>
                    {plan.sub}
                  </span>
                </button>
              ))}
            </div>

            {/* Dashboard showcase panel */}
            <div style={{
              ...glassPanel({
                borderRadius: '0 0 20px 20px',
                borderTop: 'none',
                padding: '20px',
                minHeight: 440,
                position: 'relative',
                overflow: 'hidden',
              }),
              boxShadow: `0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              {/* Inner ambient glow */}
              <div aria-hidden style={{
                position: 'absolute', top: -60, right: -60,
                width: 200, height: 200,
                background: `radial-gradient(circle, ${C.glow1} 0%, transparent 65%)`,
                pointerEvents: 'none',
              }} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={activePlan}
                  variants={showcaseVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  <ActiveDash />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Browser-chrome dots for polish */}
            <div style={{
              position: 'absolute', top: -28, left: 16,
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              {[C.danger, C.warning, C.success].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
              ))}
              <div style={{
                marginLeft: 8, height: 18, borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                flex: 1, minWidth: 120,
                display: 'flex', alignItems: 'center', paddingLeft: 8,
              }}>
                <span style={{ fontSize: 9, color: C.faint, fontFamily: 'monospace' }}>app.warmpulse.io/dashboard</span>
              </div>
            </div>

            {/* Plan badge below showcase */}
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <ChevronRight size={12} color={C.faint} />
              <span style={{ fontSize: 11, color: C.faint }}>
                Switch plans to preview each dashboard
              </span>
              <ChevronRight size={12} color={C.faint} style={{ transform: 'scaleX(-1)' }} />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Bottom gradient fade ── */}
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
        background: `linear-gradient(to top, ${C.bg}, transparent)`,
        pointerEvents: 'none',
      }} />
    </section>
  );
}
