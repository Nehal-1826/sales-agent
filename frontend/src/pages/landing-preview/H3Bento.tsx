/**
 * H3Bento — "Bento Hero" redesign candidate for WarmPulse landing page.
 *
 * Self-contained: only react, framer-motion, lucide-react.
 * No @/... imports, no .css import, no API calls.
 * Mock data inline. Inline style={{}} only for layout.
 * Dark warm Aurora Glass palette — NO purple/violet/blue/teal/cyan/indigo/pink.
 * Plans: Starter, Pro, Pro Plus ONLY (no Agency).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  Inbox,
  Mail,
  MessageSquare,
  ShieldCheck,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';

/* ─── palette ────────────────────────────────────────────────────────────── */
const C = {
  bg: '#0d0c0b',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.09)',
  borderHover: 'rgba(242,101,34,0.45)',
  text: '#f0ede8',
  dim: 'rgba(240,237,232,0.55)',
  faint: 'rgba(240,237,232,0.28)',
  accent: '#F26522',
  accentMid: '#FF8A4B',
  success: '#3ddc97',
  warning: '#FF8A4B',
  danger: '#ff5c7a',
  glow: 'rgba(242,101,34,0.18)',
  glowStrong: 'rgba(242,101,34,0.32)',
} as const;

/* ─── glass cell base ─────────────────────────────────────────────────────── */
const glassBase: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 18,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  overflow: 'hidden',
  position: 'relative',
};

/* ─── motion variants ────────────────────────────────────────────────────── */
const bentoContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.18,
    },
  },
};

const bentoCell: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─── mock metric data ───────────────────────────────────────────────────── */
const SPARKLINE_POINTS = [28, 34, 31, 42, 39, 52, 48, 57, 61, 68, 64, 73, 78, 82, 88];

function buildSparklinePath(pts: number[], w: number, h: number): string {
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const stepX = w / (pts.length - 1);
  return pts
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/* ─── animated counter hook ─────────────────────────────────────────────── */
function useAnimatedCount(target: number, duration = 1.6, decimals = 0): string {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.6,
    });
    const unsub = mv.on('change', (v) => setDisplay(v.toFixed(decimals)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [mv, target, duration, decimals]);

  return display;
}

/* ─── SparklineCell ──────────────────────────────────────────────────────── */
function SparklineCell({
  label,
  value,
  suffix,
  color,
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix: string;
  color: string;
  decimals?: number;
}) {
  const display = useAnimatedCount(value, 1.8, decimals);
  const W = 80;
  const H = 28;
  const d = buildSparklinePath(SPARKLINE_POINTS, W, H);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>
        {display}{suffix}
      </span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
        <motion.path
          d={d}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.8 }}
        />
      </svg>
    </div>
  );
}

/* ─── GaugeCell ──────────────────────────────────────────────────────────── */
function GaugeCell({ pct, label }: { pct: number; label: string }) {
  const R = 34;
  const cx = 44;
  const cy = 44;
  const circumference = Math.PI * R; // half-circle
  const strokeDash = (pct / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={88} height={54} viewBox="0 0 88 54">
        {/* track */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
        {/* fill */}
        <motion.path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          stroke={C.success}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - strokeDash }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.9 }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={14} fontWeight={700} fill={C.text}>
          {pct}%
        </text>
      </svg>
      <span style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  );
}

/* ─── Plan showcase mini-dashboards ─────────────────────────────────────── */
type PlanKey = 'starter' | 'pro' | 'proplus';

interface PlanMeta {
  key: PlanKey;
  label: string;
  price: string;
  tagline: string;
}

const PLANS: PlanMeta[] = [
  { key: 'starter', label: 'Starter', price: '₹799', tagline: '3 mailboxes · 50/day' },
  { key: 'pro',     label: 'Pro',     price: '₹1,999', tagline: '10 mailboxes · 150/day' },
  { key: 'proplus', label: 'Pro Plus', price: '₹3,499', tagline: '25 mailboxes · 500/day' },
];

/* Starter mini-dashboard: gauge + sparkline + KPIs */
function StarterDash() {
  const kpis = [
    { label: 'Deliverability', value: '91%', color: C.success },
    { label: 'Reply rate', value: '14%', color: C.accent },
    { label: 'Sends today', value: '47', color: C.dim },
  ];
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <GaugeCell pct={91} label="Inbox rate" />
        <div style={{ flex: 1 }}>
          <SparklineCell label="Reputation" value={88} suffix="" color={C.success} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '7px 10px',
            }}
          >
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Pro mini-dashboard: KPI tiles + small bar chart */
function ProDash() {
  const bars = [62, 74, 68, 81, 78, 88, 84, 91, 89, 93];
  const maxBar = Math.max(...bars);
  const kpis = [
    { label: 'Active mailboxes', value: '8 / 10', color: C.accent },
    { label: 'Avg inbox rate', value: '93%', color: C.success },
    { label: 'Sends today', value: '122', color: C.text },
    { label: 'Peers in pool', value: '34', color: C.dim },
  ];
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      {/* bar chart */}
      <div>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Inbox rate — last 10 days
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40 }}>
          {bars.map((v, i) => (
            <motion.div
              key={i}
              style={{
                flex: 1,
                background: `linear-gradient(to top, ${C.accent}, ${C.accentMid})`,
                borderRadius: 4,
                originY: 1,
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: v / maxBar }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.9 + i * 0.04 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Pro Plus mini-dashboard: compact mailbox grid */
const MB_DATA = [
  { name: 'sales@acme.io', score: 94, status: 'warm' },
  { name: 'hello@brand.co', score: 88, status: 'warm' },
  { name: 'ops@startup.in', score: 71, status: 'ramp' },
  { name: 'noreply@saas.ai', score: 96, status: 'warm' },
  { name: 'hi@agency.com', score: 65, status: 'ramp' },
  { name: 'team@corp.io', score: 83, status: 'warm' },
];

function statusColor(s: string): string {
  if (s === 'warm') return C.success;
  if (s === 'ramp') return C.warning;
  return C.danger;
}

function ProPlusDash() {
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Mailbox health — 25 active
        </span>
        <span style={{ fontSize: 10, color: C.success }}>All healthy ✓</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {MB_DATA.map((mb, i) => (
          <motion.div
            key={mb.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.7 + i * 0.07 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8,
              padding: '5px 8px',
              border: `1px solid ${C.border}`,
            }}
          >
            {/* dot */}
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: statusColor(mb.status),
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mb.name}
            </span>
            {/* score bar */}
            <div
              style={{
                width: 44,
                height: 4,
                borderRadius: 99,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <motion.div
                style={{
                  height: '100%',
                  borderRadius: 99,
                  background: statusColor(mb.status),
                }}
                initial={{ width: 0 }}
                animate={{ width: `${mb.score}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.9 + i * 0.06 }}
              />
            </div>
            <span style={{ fontSize: 10, color: C.dim, width: 26, textAlign: 'right', flexShrink: 0 }}>
              {mb.score}%
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const PLAN_DASH: Record<PlanKey, React.ReactNode> = {
  starter: <StarterDash />,
  pro: <ProDash />,
  proplus: <ProPlusDash />,
};

/* ─── PlanShowcaseCell ───────────────────────────────────────────────────── */
function PlanShowcaseCell() {
  const [active, setActive] = useState<PlanKey>('pro');

  const activePlan = PLANS.find((p) => p.key === active)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* tab strip */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '12px 14px 0',
          position: 'relative',
        }}
      >
        {PLANS.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            style={{
              position: 'relative',
              padding: '5px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: active === p.key ? C.text : C.dim,
              transition: 'color 0.2s',
              zIndex: 1,
            }}
          >
            {active === p.key && (
              <motion.div
                layoutId="plan-tab-indicator"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${C.accent}30, ${C.accentMid}18)`,
                  border: `1px solid ${C.accent}50`,
                  zIndex: -1,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {p.label}
          </button>
        ))}
      </div>

      {/* price line */}
      <div style={{ padding: '8px 14px 4px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.accent }}>
          {activePlan.price}
        </span>
        <span style={{ fontSize: 11, color: C.dim }}>/mo · {activePlan.tagline}</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            style={{ height: '100%' }}
          >
            {PLAN_DASH[active]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── trust badges row ───────────────────────────────────────────────────── */
const TRUST_ITEMS = ['Gmail', 'Outlook', 'Yahoo', 'Custom SMTP'];

/* ─── main hero ──────────────────────────────────────────────────────────── */
export function LandHeroH3Bento() {
  /* Ambient glow refs */
  const glow1Ref = useRef<HTMLDivElement>(null);
  const glow2Ref = useRef<HTMLDivElement>(null);

  /* Subtle mouse-follow glow on bg */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      if (glow1Ref.current) {
        glow1Ref.current.style.transform = `translate(${x * 0.06}px, ${y * 0.06}px)`;
      }
      if (glow2Ref.current) {
        glow2Ref.current.style.transform = `translate(${-x * 0.04}px, ${-y * 0.04}px)`;
      }
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const deliverability = useAnimatedCount(94, 2, 0);
  const sendsToday = useAnimatedCount(8_241, 2.2, 0);

  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: C.bg,
        overflow: 'hidden',
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      {/* ── ambient glows ── */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <div
          ref={glow1Ref}
          style={{
            position: 'absolute',
            top: '8%',
            left: '15%',
            width: 560,
            height: 560,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${C.glow} 0%, transparent 70%)`,
            filter: 'blur(60px)',
            transition: 'transform 0.6s ease-out',
          }}
        />
        <div
          ref={glow2Ref}
          style={{
            position: 'absolute',
            top: '40%',
            right: '10%',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(61,220,151,0.10) 0%, transparent 70%)`,
            filter: 'blur(50px)',
            transition: 'transform 0.5s ease-out',
          }}
        />
      </div>

      {/* ── top nav ── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 32px',
          borderBottom: `1px solid ${C.border}`,
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentMid})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Flame size={14} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>
            WarmPulse
          </span>
        </div>

        {/* nav links */}
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          {['Features', 'How it works', 'Pricing'].map((link) => (
            <span
              key={link}
              style={{ fontSize: 13, color: C.dim, cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = C.text)}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = C.dim)}
            >
              {link}
            </span>
          ))}
        </div>

        {/* cta */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: C.dim, cursor: 'pointer' }}>Sign in</span>
          <div
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentMid})`,
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
              boxShadow: `0 2px 16px ${C.glow}`,
            }}
          >
            Get started free
          </div>
        </div>
      </motion.nav>

      {/* ── bento grid ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '28px 28px 40px',
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        <motion.div
          variants={bentoContainer}
          initial="hidden"
          animate="show"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gridTemplateRows: 'auto',
            gap: 14,
          }}
        >

          {/* ── 1. HEADLINE CELL — spans 7 cols, 2 rows ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -4, boxShadow: `0 12px 40px ${C.glowStrong}`, borderColor: C.borderHover }}
            style={{
              ...glassBase,
              gridColumn: '1 / 8',
              gridRow: '1 / 3',
              padding: '40px 40px 36px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 300,
              transition: 'border-color 0.3s',
            }}
          >
            {/* eyebrow */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 99,
                background: `${C.accent}1A`,
                border: `1px solid ${C.accent}44`,
                width: 'fit-content',
                marginBottom: 20,
              }}
            >
              <TrendingUp size={11} color={C.accent} strokeWidth={2.4} />
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Peer-inbox network · Real signal
              </span>
            </div>

            {/* headline */}
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontSize: 'clamp(28px, 3.5vw, 52px)',
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: '-0.04em',
                  margin: 0,
                  background: `linear-gradient(135deg, ${C.text} 30%, ${C.accentMid} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Land in the inbox.
                <br />
                Not the spam folder.
              </h1>
              <p
                style={{
                  marginTop: 16,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: C.dim,
                  maxWidth: 420,
                }}
              >
                WarmPulse's peer-inbox network sends, replies, stars, and rescues your emails — building rock-solid sender reputation with Gmail, Outlook, and Yahoo before your campaigns launch.
              </p>
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 28 }}>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg, ${C.accent}, ${C.accentMid})`,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: `0 4px 24px ${C.glowStrong}`,
                }}
              >
                Start warming for free
                <ArrowRight size={15} strokeWidth={2.5} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '11px 22px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${C.border}`,
                  color: C.dim,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                See how it works
              </motion.button>
            </div>

            {/* trust logos */}
            <div style={{ marginTop: 24, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: C.faint }}>Works with</span>
              {TRUST_ITEMS.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    color: C.dim,
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* ── 2. PLAN SHOWCASE CELL — spans 5 cols, 2 rows ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -4, boxShadow: `0 12px 36px ${C.glow}`, borderColor: C.borderHover }}
            style={{
              ...glassBase,
              gridColumn: '8 / 13',
              gridRow: '1 / 3',
              minHeight: 300,
              transition: 'border-color 0.3s',
            }}
          >
            <div style={{ padding: '18px 14px 8px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                Choose your plan
              </div>
            </div>
            <PlanShowcaseCell />
          </motion.div>

          {/* ── 3. METRIC — Deliverability ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 28px rgba(61,220,151,0.12)`, borderColor: 'rgba(61,220,151,0.3)' }}
            style={{
              ...glassBase,
              gridColumn: '1 / 4',
              gridRow: '3 / 4',
              padding: '20px 22px',
              transition: 'border-color 0.3s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(61,220,151,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Inbox size={14} color={C.success} strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: 11, color: C.dim }}>Deliverability</span>
            </div>
            <SparklineCell label="Inbox rate" value={94} suffix="%" color={C.success} />
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={10} color={C.success} />
              <span style={{ fontSize: 10, color: C.success }}>+3.2% this week</span>
            </div>
          </motion.div>

          {/* ── 4. METRIC — Sends today ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 28px ${C.glow}`, borderColor: C.borderHover }}
            style={{
              ...glassBase,
              gridColumn: '4 / 7',
              gridRow: '3 / 4',
              padding: '20px 22px',
              transition: 'border-color 0.3s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${C.accent}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Mail size={14} color={C.accent} strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: 11, color: C.dim }}>Platform activity</span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sends today</span>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1, marginTop: 4 }}>
                {sendsToday}
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Zap size={10} color={C.accentMid} />
              <span style={{ fontSize: 10, color: C.accentMid }}>Live · updating</span>
            </div>
          </motion.div>

          {/* ── 5. METRIC — Reply rate ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 24px rgba(255,138,75,0.10)`, borderColor: 'rgba(255,138,75,0.3)' }}
            style={{
              ...glassBase,
              gridColumn: '7 / 10',
              gridRow: '3 / 4',
              padding: '20px 22px',
              transition: 'border-color 0.3s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'rgba(255,138,75,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MessageSquare size={14} color={C.warning} strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: 11, color: C.dim }}>Engagement</span>
            </div>
            <SparklineCell label="Reply rate" value={16.4} suffix="%" color={C.warning} decimals={1} />
          </motion.div>

          {/* ── 6. SECONDARY CTA / TRUST CELL ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 28px rgba(61,220,151,0.10)`, borderColor: 'rgba(61,220,151,0.25)' }}
            style={{
              ...glassBase,
              gridColumn: '10 / 13',
              gridRow: '3 / 4',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'border-color 0.3s',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <ShieldCheck size={16} color={C.success} strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Trusted by 1,400+ teams</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'No credit card required',
                  'Cancel anytime',
                  'GDPR-compliant',
                ].map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <CheckCircle2 size={11} color={C.success} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, color: C.dim }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: -6, marginBottom: 6 }}>
                {[C.accent, C.success, C.warning, C.text].map((c, i) => (
                  <div
                    key={i}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c,
                      border: `2px solid ${C.bg}`,
                      marginLeft: i === 0 ? 0 : -8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Star size={9} color={C.bg} fill={C.bg} />
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 10, color: C.faint }}>4.9 / 5 · 340 reviews</span>
            </div>
          </motion.div>

          {/* ── 7. REPUTATION SCORE BAR CELL ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 28px ${C.glow}` }}
            style={{
              ...glassBase,
              gridColumn: '1 / 5',
              gridRow: '4 / 5',
              padding: '20px 22px',
            }}
          >
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Avg reputation · network-wide
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: 8,
                    borderRadius: 99,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  <motion.div
                    style={{
                      height: '100%',
                      borderRadius: 99,
                      background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${deliverability}%` }}
                    transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
                  />
                </div>
                <div style={{ fontSize: 10, color: C.faint }}>Across 12,000+ active mailboxes</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.success, lineHeight: 1 }}>
                {deliverability}%
              </div>
            </div>
          </motion.div>

          {/* ── 8. FEATURE TAGS CELL ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3 }}
            style={{
              ...glassBase,
              gridColumn: '5 / 9',
              gridRow: '4 / 5',
              padding: '20px 22px',
            }}
          >
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              What the network does
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {[
                { label: 'Sends warmup mail', icon: Mail },
                { label: 'Opens & reads', icon: Inbox },
                { label: 'Replies naturally', icon: MessageSquare },
                { label: 'Stars important', icon: Star },
                { label: 'Spam-rescues', icon: ShieldCheck },
                { label: 'Reputation tracking', icon: TrendingUp },
              ].map(({ label, icon: Icon }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${C.border}`,
                    fontSize: 11,
                    color: C.dim,
                  }}
                >
                  <Icon size={10} color={C.accent} strokeWidth={2.2} />
                  {label}
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── 9. RAMP PROGRESS CELL ── */}
          <motion.div
            variants={bentoCell}
            whileHover={{ y: -3, boxShadow: `0 8px 28px ${C.glow}` }}
            style={{
              ...glassBase,
              gridColumn: '9 / 13',
              gridRow: '4 / 5',
              padding: '20px 22px',
            }}
          >
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Warmup ramp — day 18/30
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'D1–7', target: 10, actual: 10, done: true },
                { label: 'D8–14', target: 20, actual: 20, done: true },
                { label: 'D15–21', target: 35, actual: 29, done: false },
                { label: 'D22–30', target: 50, actual: 0, done: false },
              ].map((row, i) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: row.done ? C.success : C.faint, width: 36, flexShrink: 0 }}>
                    {row.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 99,
                      background: 'rgba(255,255,255,0.07)',
                      overflow: 'hidden',
                    }}
                  >
                    <motion.div
                      style={{
                        height: '100%',
                        borderRadius: 99,
                        background: row.done
                          ? C.success
                          : `linear-gradient(90deg, ${C.accent}, ${C.accentMid})`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(row.actual / row.target) * 100}%` }}
                      transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.9 + i * 0.12 }}
                    />
                  </div>
                  <span style={{ fontSize: 10, color: C.faint, width: 28, textAlign: 'right', flexShrink: 0 }}>
                    {row.actual}/{row.target}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

        </motion.div>

        {/* ── bottom caption ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 11,
            color: C.faint,
          }}
        >
          All data shown is illustrative. Real-time metrics available after connecting your mailbox.
        </motion.div>
      </div>

      {/* ── responsive override (narrow) ── */}
      <style>{`
        @media (max-width: 860px) {
          .wp-bento-grid > * {
            grid-column: 1 / -1 !important;
            grid-row: auto !important;
          }
        }
      `}</style>
    </section>
  );
}
