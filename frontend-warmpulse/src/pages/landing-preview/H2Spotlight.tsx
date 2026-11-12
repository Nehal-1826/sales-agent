/**
 * H2Spotlight — "Centered Spotlight" Hero Redesign Candidate
 * Self-contained: only react, framer-motion, lucide-react.
 * No @/ imports, no .css, inline style only.
 * Dark warm "Aurora Glass" palette — #F26522 → #FF8A4B accent.
 * Spotlight cycles Starter / Pro / Pro Plus only (no Agency).
 */

import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  ArrowRight,
  Flame,
  MailCheck,
  TrendingUp,
  Shield,
  Zap,
  Activity,
  Pause,
  Play,
  CheckCircle2,
  Inbox,
  Users,
  Star,
} from 'lucide-react';

/* =========================================================================
   PALETTE & TOKENS
   ========================================================================= */

const C = {
  bg: '#0d0b09',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHover: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.13)',
  text: '#f0ece6',
  textDim: '#a09890',
  textFaint: '#6a5f58',
  accent: '#F26522',
  accentHover: '#FF8A4B',
  accentGlow: 'rgba(242,101,34,0.22)',
  accentGlowStrong: 'rgba(242,101,34,0.40)',
  success: '#3ddc97',
  successGlow: 'rgba(61,220,151,0.18)',
  warning: '#FF8A4B',
  danger: '#ff5c7a',
  warmAmber: '#E8A74A',
};

const glass = (extra?: CSSProperties): CSSProperties => ({
  background: C.surface,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 16,
  ...extra,
});

/* =========================================================================
   ANIMATED KPI COUNTER
   ========================================================================= */

function KpiCounter({
  target,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1.4,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current = animate(mv, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v.toFixed(decimals)),
    });
    return () => {
      ctrlRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <span>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* =========================================================================
   SPARKLINE SVG — tiny inline trend line
   ========================================================================= */

function Sparkline({
  data,
  color,
  width = 80,
  height = 28,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const areaBottom = `${(data.length - 1) * (width / (data.length - 1))},${height} 0,${height}`;
  const areaPath = `M0,${height - ((data[0] ?? 0) - min) / range * height} L${pts.split(' ').join(' L')} L${areaBottom} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace('#', '')})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* =========================================================================
   MINI AREA CHART — for Pro dashboard
   ========================================================================= */

function MiniAreaChart({
  datasets,
  width = 220,
  height = 60,
}: {
  datasets: { data: number[]; color: string; label: string }[];
  width?: number;
  height?: number;
}) {
  const len = datasets[0]?.data.length ?? 1;
  const allVals = datasets.flatMap((d) => d.data);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {datasets.map((ds) => (
          <linearGradient
            key={ds.label}
            id={`area-${ds.label}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={ds.color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={ds.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {datasets.map((ds) => {
        const pts = ds.data.map((v, i) => {
          const x = (i / (len - 1)) * width;
          const y = height - ((v - min) / range) * (height - 4) - 2;
          return `${x},${y}`;
        });
        const ptsStr = pts.join(' ');
        const lastX = (len - 1) * (width / (len - 1));
        const firstY = height - (((ds.data[0] ?? 0) - min) / range) * (height - 4) - 2;
        const area = `M0,${firstY} L${ptsStr.split(' ').join(' L')} L${lastX},${height} L0,${height} Z`;
        return (
          <g key={ds.label}>
            <path d={area} fill={`url(#area-${ds.label})`} />
            <polyline
              points={ptsStr}
              fill="none"
              stroke={ds.color}
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* =========================================================================
   WARMTH GAUGE (radial arc) — for Starter dashboard
   ========================================================================= */

function WarmthGauge({ score, size = 100 }: { score: number; size?: number }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  // arc covers 240 degrees (from 150° to 390°/30°), start at bottom-left
  const arcFraction = 240 / 360;
  const dashArray = circumference * arcFraction;
  const offset = dashArray * (1 - score / 100);
  const rotation = 150; // starting angle

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={C.warning} />
          <stop offset="60%" stopColor={C.accent} />
          <stop offset="100%" stopColor={C.success} />
        </linearGradient>
      </defs>
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={C.border}
        strokeWidth={size * 0.07}
        strokeDasharray={`${dashArray} ${circumference}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
        style={{ opacity: 0.35 }}
      />
      {/* Fill */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="url(#gauge-grad)"
        strokeWidth={size * 0.07}
        strokeDasharray={`${dashArray - offset} ${circumference}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
      />
      {/* Center text */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={size * 0.22}
        fontWeight="700"
        fontFamily="monospace"
        fill={C.text}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + size * 0.15}
        textAnchor="middle"
        fontSize={size * 0.1}
        fontFamily="monospace"
        fill={C.textFaint}
        letterSpacing="2"
      >
        WARMTH
      </text>
    </svg>
  );
}

/* =========================================================================
   PLAN MINI-DASHBOARDS
   ========================================================================= */

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.22, ease: 'easeIn' },
  },
};

const tileVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
  },
};

/* --- Starter Dashboard --- */
function StarterDashboard() {
  const sparkData = [32, 38, 35, 44, 52, 48, 61, 68, 73, 71, 78, 82];
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto auto',
        gap: 12,
        width: '100%',
      }}
    >
      {/* Warmth gauge — spans left column, 2 rows */}
      <motion.div
        variants={tileVariants}
        style={{
          ...glass(),
          gridRow: '1 / 3',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          gap: 4,
        }}
      >
        <WarmthGauge score={78} size={110} />
        <div style={{ marginTop: 4, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: C.success,
              textTransform: 'uppercase',
              background: C.successGlow,
              padding: '2px 10px',
              borderRadius: 999,
              display: 'inline-block',
            }}
          >
            Healthy
          </div>
        </div>
      </motion.div>

      {/* Sends trend sparkline */}
      <motion.div
        variants={tileVariants}
        style={{ ...glass(), padding: '14px 16px' }}
      >
        <div
          style={{
            fontSize: 10,
            color: C.textFaint,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontFamily: 'monospace',
            marginBottom: 6,
          }}
        >
          Sends · 14d
        </div>
        <Sparkline data={sparkData} color={C.accent} width={80} height={28} />
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            fontFamily: 'monospace',
            marginTop: 4,
          }}
        >
          <KpiCounter target={30} suffix="/day" />
        </div>
      </motion.div>

      {/* 3 KPI mini-tiles */}
      <motion.div
        variants={tileVariants}
        style={{
          ...glass(),
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {[
          { label: 'Inbox %', value: 94, suffix: '%', color: C.success },
          { label: 'Day', value: 18, suffix: '', color: C.accent },
          { label: 'Rescued', value: 3, suffix: '', color: C.warning },
        ].map((k) => (
          <div
            key={k.label}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span
              style={{
                fontSize: 10,
                color: C.textFaint,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {k.label}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: k.color,
              }}
            >
              <KpiCounter target={k.value} suffix={k.suffix} duration={1.2} />
            </span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

/* --- Pro Dashboard --- */
function ProDashboard() {
  const inboxData = [
    { data: [68, 72, 71, 76, 79, 78, 82, 85, 88, 87, 91, 93], color: C.success, label: 'inbox' },
    { data: [22, 20, 19, 16, 14, 15, 12, 10, 8, 9, 7, 5], color: C.warning, label: 'promo' },
  ];
  const leaderboard = [
    { email: 'alex@lumen.io', score: 93, up: true },
    { email: 'jane@growlab.co', score: 88, up: true },
    { email: 'dev@stridex.in', score: 81, up: false },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}
    >
      {/* 4-tile KPI band */}
      <motion.div
        variants={tileVariants}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
      >
        {[
          { label: 'Mailboxes', val: 10, icon: Inbox, color: C.accent },
          { label: 'Inbox %', val: 93, suffix: '%', icon: MailCheck, color: C.success },
          { label: 'Sends/day', val: 500, icon: Zap, color: C.warmAmber },
          { label: 'Rescued', val: 24, icon: Shield, color: C.warning },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              ...glass({ borderRadius: 12 }),
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <k.icon size={13} style={{ color: k.color }} strokeWidth={2} />
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: C.text,
                lineHeight: 1,
              }}
            >
              <KpiCounter target={k.val} suffix={k.suffix ?? ''} duration={1.3} />
            </div>
            <div
              style={{
                fontSize: 9,
                color: C.textFaint,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'monospace',
              }}
            >
              {k.label}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Area chart + leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10 }}>
        <motion.div
          variants={tileVariants}
          style={{ ...glass({ borderRadius: 12 }), padding: '14px 16px' }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.textFaint,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 10,
              display: 'flex',
              gap: 12,
            }}
          >
            <span style={{ color: C.success }}>● inbox</span>
            <span style={{ color: C.warning }}>● promo</span>
          </div>
          <MiniAreaChart datasets={inboxData} width={190} height={54} />
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          variants={tileVariants}
          style={{
            ...glass({ borderRadius: 12 }),
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: C.textFaint,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 6,
            }}
          >
            Top mailboxes
          </div>
          {leaderboard.map((row, i) => (
            <div
              key={row.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 0',
                borderBottom: i < leaderboard.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  color: C.textFaint,
                  width: 10,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: C.textDim,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.email}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: row.up ? C.success : C.warning,
                }}
              >
                {row.score}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

/* --- Pro Plus Dashboard --- */
function ProPlusDashboard() {
  const mailboxes = [
    { name: 'alex@lumen.io', warmth: 93, status: 'hot', day: 29 },
    { name: 'jane@growlab.co', warmth: 88, status: 'warm', day: 22 },
    { name: 'dev@stridex.in', warmth: 81, status: 'warm', day: 18 },
    { name: 'mk@vortex.com', warmth: 74, status: 'rising', day: 14 },
    { name: 'priya@nexogen.in', warmth: 67, status: 'rising', day: 11 },
    { name: 'cto@alphastack.io', warmth: 52, status: 'ramping', day: 7 },
  ];

  const statusColor: Record<string, string> = {
    hot: C.success,
    warm: C.accent,
    rising: C.warmAmber,
    ramping: C.textDim,
  };

  const selected = mailboxes[0];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 12, width: '100%' }}
    >
      {/* Mailbox grid list */}
      <motion.div
        variants={tileVariants}
        style={{
          ...glass(),
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
          maxHeight: 210,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: C.textFaint,
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 8,
          }}
        >
          15 mailboxes
        </div>
        {mailboxes.map((mb, i) => (
          <div
            key={mb.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 6px',
              borderRadius: 8,
              background: i === 0 ? `rgba(242,101,34,0.10)` : 'transparent',
              border: i === 0 ? `1px solid rgba(242,101,34,0.20)` : '1px solid transparent',
              cursor: 'default',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: statusColor[mb.status] ?? C.textDim,
                flexShrink: 0,
                boxShadow: `0 0 6px ${statusColor[mb.status] ?? C.textDim}`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: i === 0 ? C.text : C.textDim,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {mb.name}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: statusColor[mb.status] ?? C.textDim,
              }}
            >
              {mb.warmth}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Detail panel for selected */}
      <motion.div
        variants={tileVariants}
        style={{
          ...glass(),
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Header */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
            {selected?.name ?? ''}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
              background: C.successGlow,
              border: `1px solid rgba(61,220,151,0.25)`,
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.success }} />
            <span
              style={{
                fontSize: 9,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: C.success,
              }}
            >
              Hot — D{selected?.day ?? 29}
            </span>
          </div>
        </div>

        {/* Mini KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { label: 'Warmth', val: selected?.warmth ?? 93, color: C.success },
            { label: 'Sends', val: 75, color: C.accent },
            { label: 'Inbox %', val: 96, color: C.warmAmber },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                padding: '8px 10px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: k.color,
                  lineHeight: 1,
                }}
              >
                <KpiCounter target={k.val} duration={1.2} />
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: C.textFaint,
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginTop: 3,
                }}
              >
                {k.label}
              </div>
            </div>
          ))}
        </div>

        {/* Ramp progress */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
              fontSize: 9,
              fontFamily: 'monospace',
              color: C.textFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            <span>Ramp progress</span>
            <span style={{ color: C.accent }}>Day 29 / 29+</span>
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '97%' }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
              }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* =========================================================================
   PLAN DATA
   ========================================================================= */

interface PlanConfig {
  key: 'starter' | 'pro' | 'proplus';
  label: string;
  pill: string;
  tagline: string;
  highlight: string;
  Dashboard: () => JSX.Element;
}

const PLANS: readonly [PlanConfig, PlanConfig, PlanConfig] = [
  {
    key: 'starter',
    label: 'Starter',
    pill: 'starter',
    tagline: '1 mailbox · 30 sends/day',
    highlight: C.warmAmber,
    Dashboard: StarterDashboard,
  },
  {
    key: 'pro',
    label: 'Pro',
    pill: 'pro',
    tagline: '10 mailboxes · 50 sends each',
    highlight: C.accent,
    Dashboard: ProDashboard,
  },
  {
    key: 'proplus',
    label: 'Pro Plus',
    pill: 'proplus',
    tagline: '15 mailboxes · Postmaster ingest',
    highlight: C.success,
    Dashboard: ProPlusDashboard,
  },
];

/* =========================================================================
   FLOATING ORB
   ========================================================================= */

function FloatingOrb({
  x,
  y,
  size,
  color,
  blur,
  delay,
  duration,
  amplitude,
}: {
  x: string;
  y: string;
  size: number;
  color: string;
  blur: number;
  delay: number;
  duration: number;
  amplitude: number;
}) {
  return (
    <motion.div
      aria-hidden
      animate={{ y: [0, -amplitude, 0, amplitude, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        filter: `blur(${blur}px)`,
        pointerEvents: 'none',
        zIndex: 0,
        transform: 'translate(-50%, -50%)',
        opacity: 0.55,
      }}
    />
  );
}

/* =========================================================================
   HEADLINE GRADIENT SHIMMER
   ========================================================================= */

const headlineShimmer: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] },
  },
};

/* =========================================================================
   KPI / TRUST STRIP
   ========================================================================= */

const TRUST_KPIS = [
  { icon: MailCheck, label: 'Mailboxes warmed', val: '38,400+' },
  { icon: TrendingUp, label: 'Avg inbox rate', val: '94.2%' },
  { icon: Shield, label: 'Spam rescued', val: '128K' },
  { icon: Users, label: 'Active teams', val: '1,200+' },
  { icon: Star, label: 'Rating', val: '4.9 / 5' },
  { icon: Activity, label: 'Uptime', val: '99.97%' },
];

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

const containerStagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.68, ease: [0.22, 1, 0.36, 1] },
  },
};

const spotlightEntry: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 30 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 160, damping: 22, mass: 0.9 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -20,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 0.6] },
  },
};

export function LandHeroH2Spotlight() {
  const [activePlan, setActivePlan] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = useCallback(() => {
    setActivePlan((prev) => (prev + 1) % PLANS.length);
  }, []);

  // Auto-cycle
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(advance, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, advance]);

  const handlePillClick = (idx: number) => {
    setActivePlan(idx);
    // Reset timer on manual select
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isPlaying) {
      intervalRef.current = setInterval(advance, 5000);
    }
  };

  // activePlan is always 0|1|2 (advance() keeps it bounded). Tuple type on PLANS
  // makes PLANS[0] non-undefined; use it as fallback via nullish coalescing.
  const currentPlan: PlanConfig = PLANS[activePlan] ?? PLANS[0];
  const { Dashboard } = currentPlan;

  return (
    <section
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: C.bg,
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* ---- BACKGROUND ORBS ---- */}
      <FloatingOrb
        x="15%"
        y="20%"
        size={500}
        color={`radial-gradient(circle, ${C.accentGlow} 0%, transparent 70%)`}
        blur={80}
        delay={0}
        duration={8}
        amplitude={28}
      />
      <FloatingOrb
        x="82%"
        y="28%"
        size={420}
        color={`radial-gradient(circle, rgba(232,167,74,0.16) 0%, transparent 70%)`}
        blur={90}
        delay={2.5}
        duration={10}
        amplitude={22}
      />
      <FloatingOrb
        x="50%"
        y="60%"
        size={600}
        color={`radial-gradient(circle, rgba(61,220,151,0.08) 0%, transparent 70%)`}
        blur={100}
        delay={1.2}
        duration={12}
        amplitude={18}
      />

      {/* ---- TOP NAV ROW ---- */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '22px 32px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 18px ${C.accentGlow}`,
            }}
          >
            <Flame size={17} color="#fff" strokeWidth={2.2} />
          </div>
          <span
            style={{
              fontWeight: 800,
              fontSize: 17,
              letterSpacing: '-0.03em',
              color: C.text,
            }}
          >
            WarmPulse
          </span>
        </div>

        {/* Nav links */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
          }}
        >
          {['Product', 'Pricing', 'Docs', 'Blog'].map((item) => (
            <span
              key={item}
              style={{
                fontSize: 13.5,
                color: C.textDim,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'color 0.2s',
              }}
            >
              {item}
            </span>
          ))}
        </div>

        {/* CTA row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              color: C.textDim,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Sign in
          </span>
          <button
            type="button"
            style={{
              height: 34,
              padding: '0 18px',
              borderRadius: 999,
              background: `linear-gradient(180deg, ${C.accent}, ${C.accentHover})`,
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 16px ${C.accentGlow}`,
            }}
          >
            Get started
            <ArrowRight size={13} strokeWidth={2.4} />
          </button>
        </div>
      </motion.div>

      {/* ---- CENTERED HERO COPY ---- */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 820,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '40px 32px 0',
        }}
      >
        {/* Announcement pill */}
        <motion.div variants={fadeUpVariant}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px 5px 8px',
              borderRadius: 999,
              border: `1px solid rgba(242,101,34,0.30)`,
              background: 'rgba(242,101,34,0.08)',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              New
            </span>
            <span style={{ fontSize: 12.5, color: C.textDim, fontWeight: 500 }}>
              Spam-rescue v2 · now scanning Promotions &amp; Updates folders
            </span>
          </div>
        </motion.div>

        {/* Eyebrow */}
        <motion.div variants={fadeUpVariant}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.accent,
              display: 'block',
              marginBottom: 18,
            }}
          >
            Email Warmup · Reimagined
          </span>
        </motion.div>

        {/* Headline with gradient shimmer */}
        <motion.h1
          variants={headlineShimmer}
          style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            fontWeight: 900,
            lineHeight: 1.04,
            letterSpacing: '-0.04em',
            margin: 0,
            marginBottom: 22,
            background: `linear-gradient(135deg, ${C.text} 0%, ${C.accentHover} 42%, ${C.warmAmber} 60%, ${C.text} 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundSize: '200% 100%',
            animation: 'shimmer 5s linear infinite',
          }}
        >
          Warm inboxes.<br />Land every deal.
        </motion.h1>

        {/* Shimmer keyframe injected via style tag */}
        <style>{`
          @keyframes shimmer {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
          }
        `}</style>

        {/* Sub-copy */}
        <motion.p
          variants={fadeUpVariant}
          style={{
            fontSize: 17,
            color: C.textDim,
            lineHeight: 1.6,
            maxWidth: 560,
            margin: '0 0 36px',
          }}
        >
          WarmPulse runs a peer-inbox network that teaches ESPs your domain is
          trustworthy — so your real outreach lands in the inbox, not Promotions
          or Spam. Real sends. Real engagement. Real reputation.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUpVariant}
          style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}
        >
          <motion.button
            type="button"
            whileHover={{ scale: 1.04, boxShadow: `0 0 40px ${C.accentGlowStrong}` }}
            whileTap={{ scale: 0.98 }}
            style={{
              height: 48,
              padding: '0 28px',
              borderRadius: 999,
              background: `linear-gradient(180deg, ${C.accent}, ${C.accentHover})`,
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 28px ${C.accentGlow}`,
              letterSpacing: '-0.01em',
            }}
          >
            Start warming — free trial
            <ArrowRight size={16} strokeWidth={2.4} />
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              height: 48,
              padding: '0 28px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${C.borderStrong}`,
              color: C.text,
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            See pricing
          </motion.button>
        </motion.div>
      </motion.div>

      {/* ---- SPOTLIGHT DEVICE ---- */}
      <motion.div
        variants={fadeUpVariant}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.55 }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 740,
          padding: '52px 24px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Plan selector pills + play/pause */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            padding: '5px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          {PLANS.map((plan, idx) => (
            <motion.button
              key={plan.key}
              type="button"
              onClick={() => handlePillClick(idx)}
              style={{
                position: 'relative',
                padding: '6px 18px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 600,
                color: idx === activePlan ? '#fff' : C.textDim,
                background: 'transparent',
                zIndex: 1,
                transition: 'color 0.2s',
              }}
            >
              {idx === activePlan && (
                <motion.div
                  layoutId="pill-indicator"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 999,
                    background: `linear-gradient(135deg, ${currentPlan.highlight}, ${C.accent})`,
                    zIndex: -1,
                    boxShadow: `0 2px 14px ${currentPlan.highlight}55`,
                  }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                />
              )}
              {plan.label}
            </motion.button>
          ))}

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 18,
              background: C.borderStrong,
              margin: '0 4px',
            }}
          />

          {/* Play/pause */}
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `1px solid ${C.borderStrong}`,
              background: 'rgba(255,255,255,0.05)',
              color: C.textDim,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isPlaying ? 'Pause auto-cycle' : 'Play auto-cycle'}
          >
            {isPlaying ? (
              <Pause size={11} strokeWidth={2.4} />
            ) : (
              <Play size={11} strokeWidth={2.4} />
            )}
          </button>
        </div>

        {/* Device frame */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            borderRadius: 20,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.borderStrong}`,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.55), 0 0 60px ${currentPlan.highlight}22`,
            overflow: 'hidden',
          }}
        >
          {/* Window chrome */}
          <div
            style={{
              height: 42,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 18px',
              borderBottom: `1px solid ${C.border}`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <span
              style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }}
            />
            <span
              style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }}
            />
            <span
              style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }}
            />
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 14px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${C.border}`,
                }}
              >
                <Flame
                  size={10}
                  style={{ color: C.accent }}
                  strokeWidth={2.2}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: C.textFaint,
                    letterSpacing: '0.04em',
                  }}
                >
                  app.warmpulse.com · {currentPlan.label} plan
                </span>
              </div>
            </div>
            {/* Plan label badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 999,
                background: `${currentPlan.highlight}22`,
                border: `1px solid ${currentPlan.highlight}44`,
              }}
            >
              <CheckCircle2 size={9} style={{ color: currentPlan.highlight }} strokeWidth={2.4} />
              <span
                style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontWeight: 700,
                  color: currentPlan.highlight,
                }}
              >
                {currentPlan.label}
              </span>
            </div>
          </div>

          {/* Dashboard content area */}
          <div
            style={{
              padding: 20,
              minHeight: 260,
              position: 'relative',
            }}
          >
            {/* Plan tagline */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: C.text,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {currentPlan.label} Dashboard
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.textFaint,
                    fontFamily: 'monospace',
                    marginTop: 1,
                  }}
                >
                  {currentPlan.tagline}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: C.successGlow,
                  border: `1px solid rgba(61,220,151,0.2)`,
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: C.success,
                  }}
                />
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: 'monospace',
                    color: C.success,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Live
                </span>
              </div>
            </div>

            {/* Animated plan swap */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPlan.key}
                variants={spotlightEntry}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <Dashboard />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Reflection / glow under device */}
        <div
          aria-hidden
          style={{
            position: 'relative',
            width: '85%',
            height: 32,
            borderRadius: '0 0 50% 50%',
            background: `radial-gradient(ellipse at center, ${currentPlan.highlight}30 0%, transparent 70%)`,
            filter: 'blur(12px)',
            marginTop: -4,
            transition: 'background 0.6s ease',
          }}
        />
      </motion.div>

      {/* ---- KPI / TRUST STRIP ---- */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 940,
          padding: '52px 32px 72px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0',
        }}
      >
        {/* Divider line */}
        <div
          style={{
            width: '100%',
            height: 1,
            background: `linear-gradient(90deg, transparent, ${C.borderStrong} 30%, ${C.borderStrong} 70%, transparent)`,
            marginBottom: 36,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0',
            width: '100%',
          }}
        >
          {TRUST_KPIS.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.07, duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '16px 28px',
                borderRight: i < TRUST_KPIS.length - 1 ? `1px solid ${C.border}` : 'none',
                minWidth: 120,
              }}
            >
              <kpi.icon size={16} style={{ color: C.accent, opacity: 0.8 }} strokeWidth={1.8} />
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: C.text,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                }}
              >
                {kpi.val}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: C.textFaint,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                }}
              >
                {kpi.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Social proof sub-text */}
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            marginTop: 28,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: C.textFaint,
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
            }}
          >
            Trusted by outbound teams at&nbsp;
          </span>
          {['Lumen Labs', 'GrowLab', 'Stridex', 'Nexogen', 'AlphaStack', 'Vortex IO'].map(
            (brand, i, arr) => (
              <span key={brand}>
                <span
                  style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}
                >
                  {brand}
                </span>
                {i < arr.length - 1 && (
                  <span style={{ color: C.textFaint, margin: '0 6px' }}>·</span>
                )}
              </span>
            ),
          )}
        </div>
      </motion.div>
    </section>
  );
}
