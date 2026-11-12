/**
 * Admin LLM Usage Design Candidate: L2 Provider Arena
 *
 * "Provider Arena" — a head-to-head scoreboard of the three LLM providers:
 * Gemini (primary), Claude (fallback), Static templates (last-resort).
 * A metric toggle causes all bars/gauges to re-spring with framer-motion.
 * Animated counters, staggered entrance, per-provider sparklines (motion.path),
 * expandable detail drawers (AnimatePresence), whileHover/whileTap.
 *
 * Self-contained: inline styles only, mock data only.
 * NO API / react-query / @/features / @/lib imports.
 * Warm Aurora Glass palette. NO blue/purple/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Zap,
  Trophy,
  ChevronDown,
  ChevronUp,
  Activity,
  DollarSign,
  Clock,
  CheckCircle2,
  Layers,
  ArrowRight,
  BarChart2,
  Cpu,
  AlertTriangle,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  text:     '#ffffff',
  dim:      'rgba(255,255,255,0.62)',
  faint:    'rgba(255,255,255,0.38)',
  ghost:    'rgba(255,255,255,0.18)',
  accent:   '#F26522',
  accent2:  '#FF8A4B',
  success:  '#3ddc97',
  danger:   '#ff5c7a',
  warning:  '#FF8A4B',
  glass:    'rgba(255,255,255,0.05)',
  glass2:   'rgba(255,255,255,0.08)',
  glass3:   'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.10)',
  borderDim:'rgba(255,255,255,0.06)',
} as const;

const GLASS: CSSProperties = {
  background:       T.glass,
  border:           `1px solid ${T.border}`,
  backdropFilter:   'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:     16,
};

const GLASS_INNER: CSSProperties = {
  background:       T.glass2,
  border:           `1px solid ${T.border}`,
  backdropFilter:   'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius:     12,
};

// ─── Mock data ─────────────────────────────────────────────────────────────────

type MetricKey = 'requests' | 'tokens' | 'cost' | 'costPer1k' | 'successRate' | 'avgLatency';

interface Provider {
  id:          string;
  name:        string;
  label:       string;
  priority:    number;
  badge:       string;
  color:       string;
  colorDim:    string;
  // raw stats
  requests30d: number;
  reqShare:    number;       // 0–100
  tokensIn:    number;
  tokensOut:   number;
  totalTokens: number;
  cost30d:     number;
  costPer1k:   number;
  successRate: number;      // 0–100
  avgLatency:  number;      // seconds
  modelsUsed:  string[];
  trend:       number[];    // 30-day mini trend (relative, 0–1)
  budgetUsed:  number;      // 0–100 % of provider budget
  budgetCap:   string;
}

const PROVIDERS: Provider[] = [
  {
    id:          'gemini',
    name:        'Gemini',
    label:       'Google Gemini',
    priority:    1,
    badge:       'Primary',
    color:       '#F26522',
    colorDim:    'rgba(242,101,34,0.18)',
    requests30d: 148_420,
    reqShare:    70,
    tokensIn:    9_840_000,
    tokensOut:   4_120_000,
    totalTokens: 13_960_000,
    cost30d:     312.48,
    costPer1k:   0.022,
    successRate: 99.5,
    avgLatency:  0.9,
    modelsUsed:  ['gemini-1.5-flash', 'gemini-1.5-pro'],
    trend:       [0.45,0.50,0.55,0.48,0.60,0.63,0.70,0.72,0.68,0.75,0.80,0.78,0.82,0.85,0.79,0.88,0.90,0.86,0.92,0.95,0.89,0.96,0.99,0.94,1.00,0.97,0.98,0.99,0.97,1.00],
    budgetUsed:  62,
    budgetCap:   '$500/mo',
  },
  {
    id:          'claude',
    name:        'Claude',
    label:       'Anthropic Claude',
    priority:    2,
    badge:       'Fallback',
    color:       '#FF8A4B',
    colorDim:    'rgba(255,138,75,0.15)',
    requests30d: 53_010,
    reqShare:    25,
    tokensIn:    3_650_000,
    tokensOut:   1_580_000,
    totalTokens: 5_230_000,
    cost30d:     198.92,
    costPer1k:   0.038,
    successRate: 99.1,
    avgLatency:  1.8,
    modelsUsed:  ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022'],
    trend:       [0.20,0.22,0.25,0.28,0.24,0.30,0.35,0.32,0.40,0.38,0.42,0.45,0.41,0.48,0.50,0.46,0.55,0.58,0.54,0.62,0.60,0.65,0.68,0.64,0.72,0.70,0.75,0.78,0.74,0.80],
    budgetUsed:  40,
    budgetCap:   '$250/mo',
  },
  {
    id:          'static',
    name:        'Static',
    label:       'Static Templates',
    priority:    3,
    badge:       'Last resort',
    color:       '#3ddc97',
    colorDim:    'rgba(61,220,151,0.12)',
    requests30d: 10_600,
    reqShare:    5,
    tokensIn:    0,
    tokensOut:   0,
    totalTokens: 0,
    cost30d:     0,
    costPer1k:   0,
    successRate: 100,
    avgLatency:  0.05,
    modelsUsed:  ['built-in templates'],
    trend:       [0.10,0.12,0.08,0.14,0.10,0.08,0.06,0.10,0.08,0.12,0.06,0.08,0.10,0.06,0.08,0.10,0.12,0.06,0.08,0.10,0.06,0.08,0.06,0.10,0.08,0.06,0.10,0.08,0.06,0.08],
    budgetUsed:  0,
    budgetCap:   '$0 (free)',
  },
];

// Totals
const TOTAL_REQUESTS = PROVIDERS.reduce((s, p) => s + p.requests30d, 0);
const TOTAL_TOKENS   = PROVIDERS.reduce((s, p) => s + p.totalTokens, 0);
const TOTAL_COST     = PROVIDERS.reduce((s, p) => s + p.cost30d, 0);

// ─── Metric config ─────────────────────────────────────────────────────────────

interface MetricConfig {
  key:    MetricKey;
  label:  string;
  unit:   string;
  icon:   typeof BarChart2;
  desc:   string;
  // how to get a 0–1 bar value from provider
  normalize: (p: Provider) => number;
  // formatted display value
  format: (p: Provider) => string;
  // higher = better?
  higherIsBetter: boolean;
}

const METRICS: MetricConfig[] = [
  {
    key:    'requests',
    label:  'Request share',
    unit:   '%',
    icon:   BarChart2,
    desc:   '% of total LLM requests in last 30 days',
    normalize: (p) => p.reqShare / 100,
    format:    (p) => `${p.reqShare}%`,
    higherIsBetter: true,
  },
  {
    key:    'tokens',
    label:  'Tokens',
    unit:   'M',
    icon:   Layers,
    desc:   'Total tokens consumed in last 30 days',
    normalize: (p) => TOTAL_TOKENS > 0 ? p.totalTokens / TOTAL_TOKENS : 0,
    format:    (p) => p.totalTokens === 0 ? '0' : `${(p.totalTokens / 1_000_000).toFixed(1)}M`,
    higherIsBetter: false,
  },
  {
    key:    'cost',
    label:  'Cost 30d',
    unit:   '$',
    icon:   DollarSign,
    desc:   'Total USD spend in last 30 days',
    normalize: (p) => TOTAL_COST > 0 ? p.cost30d / TOTAL_COST : 0,
    format:    (p) => p.cost30d === 0 ? '$0' : `$${p.cost30d.toFixed(2)}`,
    higherIsBetter: false,
  },
  {
    key:    'costPer1k',
    label:  'Cost / 1k tokens',
    unit:   '$',
    icon:   DollarSign,
    desc:   'USD per 1,000 tokens (lower = more efficient)',
    normalize: (p) => {
      const max = 0.045;
      return p.costPer1k === 0 ? 0 : Math.min(1, p.costPer1k / max);
    },
    format:    (p) => p.costPer1k === 0 ? '$0' : `$${p.costPer1k.toFixed(4)}/1k`,
    higherIsBetter: false,
  },
  {
    key:    'successRate',
    label:  'Success rate',
    unit:   '%',
    icon:   CheckCircle2,
    desc:   'API success rate over last 30 days',
    normalize: (p) => p.successRate / 100,
    format:    (p) => `${p.successRate.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    key:    'avgLatency',
    label:  'Avg latency',
    unit:   's',
    icon:   Clock,
    desc:   'Average response latency per request',
    normalize: (p) => {
      const max = 2.0;
      return Math.min(1, p.avgLatency / max);
    },
    format:    (p) => `${p.avgLatency.toFixed(2)}s`,
    higherIsBetter: false,
  },
];

// ─── Utility helpers ────────────────────────────────────────────────────────────

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ─── Animated counter ──────────────────────────────────────────────────────────

function AnimatedCounter({
  target,
  format,
  style,
}: {
  target:  number;
  format?: (n: number) => string;
  style?:  CSSProperties;
}) {
  const mv  = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration: 1.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    });
    const unsub = mv.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = format ? format(v) : String(Math.round(v));
      }
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, format, mv]);

  return <span ref={ref} style={style}>0</span>;
}

// ─── Per-provider animated sparkline ──────────────────────────────────────────

function Sparkline({
  data,
  color,
  width = 120,
  height = 36,
}: {
  data:    number[];
  color:   string;
  width?:  number;
  height?: number;
}) {
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = (1 - v) * (height - 4) + 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area     = `0,${height} ${polyline} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0}    />
        </linearGradient>
      </defs>
      <motion.polygon
        points={area}
        fill={`url(#spark-fill-${color.replace('#','')})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <motion.polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* last-point dot */}
      {(() => {
        const last = pts[pts.length - 1];
        const [lx, ly] = (last ?? '0,0').split(',').map(Number);
        return (
          <motion.circle
            cx={lx ?? 0}
            cy={ly ?? 0}
            r={3}
            fill={color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.2, duration: 0.3, type: 'spring', stiffness: 400 }}
          />
        );
      })()}
    </svg>
  );
}

// ─── Spring bar ────────────────────────────────────────────────────────────────

function SpringBar({
  value,
  color,
  delay,
  height = 8,
}: {
  value:  number;   // 0–1
  color:  string;
  delay:  number;
  height?: number;
}) {
  return (
    <div
      style={{
        width:        '100%',
        height:       height,
        borderRadius: height / 2,
        background:   T.ghost,
        overflow:     'hidden',
        position:     'relative',
      }}
    >
      <motion.div
        style={{
          position:     'absolute',
          top:          0,
          left:         0,
          height:       '100%',
          borderRadius: height / 2,
          background:   color,
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${value * 100}%` }}
        transition={{ delay, type: 'spring', stiffness: 180, damping: 22, mass: 0.8 }}
      />
    </div>
  );
}

// ─── Provider detail expand/collapse ──────────────────────────────────────────

const detailVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -8 },
  show:   { opacity: 1, height: 'auto', y: 0 },
};

// ─── Main component ────────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.12 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,
    transition: { type: 'spring', stiffness: 160, damping: 18 } },
};

export function AdmLlmL2Arena() {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('requests');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const metric = METRICS.find((m) => m.key === activeMetric) ?? METRICS[0]!;

  // Rank providers for the active metric
  const rankedProviders = [...PROVIDERS].sort((a, b) => {
    const va = metric.normalize(a);
    const vb = metric.normalize(b);
    return metric.higherIsBetter ? vb - va : va - vb;
  });

  return (
    <div
      style={{
        minHeight:      '100%',
        padding:        '28px 24px 40px',
        fontFamily:     "'Inter', sans-serif",
        color:          T.text,
        boxSizing:      'border-box',
      }}
    >
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1,  y: 0   }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 24 }}
      >
        {/* breadcrumb */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          fontSize:   11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:      T.faint,
          marginBottom: 10,
        }}>
          <Cpu size={11} strokeWidth={2.4} />
          Admin · LLM usage · Provider Arena
        </div>

        {/* title + totals row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: T.text }}>
              Provider Arena
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.dim }}>
              Head-to-head comparison — Gemini → Claude → Static · last 30 days
            </p>
          </div>

          {/* summary chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Total requests', value: abbrev(TOTAL_REQUESTS), icon: Activity,    color: T.accent  },
              { label: 'Total tokens',   value: abbrev(TOTAL_TOKENS),   icon: Layers,      color: T.warning },
              { label: 'Total spend',    value: `$${TOTAL_COST.toFixed(2)}`, icon: DollarSign, color: T.success },
            ].map((chip, i) => (
              <motion.div
                key={chip.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1   }}
                transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
                style={{
                  ...GLASS_INNER,
                  padding:    '8px 14px',
                  display:    'flex',
                  alignItems: 'center',
                  gap:        8,
                }}
              >
                <chip.icon size={13} strokeWidth={2.4} style={{ color: chip.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                    {chip.label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
                    {chip.value}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* routing priority note */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1,  x: 0   }}
          transition={{ delay: 0.4, duration: 0.5 }}
          style={{
            marginTop:    14,
            padding:      '9px 14px',
            ...GLASS,
            borderRadius: 10,
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            fontSize:     12,
            color:        T.dim,
          }}
        >
          <Zap size={12} strokeWidth={2.4} style={{ color: T.accent, flexShrink: 0 }} />
          <strong style={{ color: T.text }}>Routing priority:</strong>
          {[
            { label: 'Gemini',  color: '#F26522', order: 1 },
            { label: 'Claude',  color: '#FF8A4B', order: 2 },
            { label: 'Static',  color: '#3ddc97', order: 3 },
          ].map((p, i, arr) => (
            <span key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: p.color, display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ color: p.color, fontWeight: 600 }}>{p.label}</span>
              {i < arr.length - 1 && (
                <ArrowRight size={11} strokeWidth={2.4} style={{ color: T.ghost, flexShrink: 0 }} />
              )}
            </span>
          ))}
          <span style={{ marginLeft: 4, color: T.faint }}>· LLM content generation for all warmup mail</span>
        </motion.div>
      </motion.div>

      {/* ── Metric toggle ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1,  y: 0  }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{
          display:    'flex',
          gap:        6,
          flexWrap:   'wrap',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize:    11,
            fontWeight:  600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:       T.faint,
            marginRight: 6,
          }}>
            Compare by:
          </span>
          {METRICS.map((m) => {
            const isActive = m.key === activeMetric;
            return (
              <motion.button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          5,
                  padding:      '6px 12px',
                  borderRadius: 8,
                  border:       `1px solid ${isActive ? T.accent : T.border}`,
                  background:   isActive ? `rgba(242,101,34,0.18)` : T.glass,
                  color:        isActive ? T.accent : T.dim,
                  cursor:       'pointer',
                  fontSize:     12,
                  fontWeight:   isActive ? 700 : 500,
                  transition:   'background 0.2s, border-color 0.2s, color 0.2s',
                  backdropFilter: 'blur(6px)',
                  outline:      'none',
                  letterSpacing: isActive ? '-0.01em' : '0',
                }}
              >
                <m.icon size={11} strokeWidth={2.4} />
                {m.label}
              </motion.button>
            );
          })}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: T.faint }}>
          {metric.desc}
          {!metric.higherIsBetter && (
            <span style={{ marginLeft: 6, color: T.warning }}>· lower is better</span>
          )}
          {metric.higherIsBetter && (
            <span style={{ marginLeft: 6, color: T.success }}>· higher is better</span>
          )}
        </p>
      </motion.div>

      {/* ── Provider cards ── */}
      <motion.div
        key={activeMetric}   // re-trigger stagger on metric change
        variants={containerVariants}
        initial="hidden"
        animate="show"
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap:                 18,
          marginBottom:        28,
        }}
      >
        {rankedProviders.map((provider, rank) => {
          const barValue    = metric.normalize(provider);
          const displayVal  = metric.format(provider);
          const isExpanded  = expandedId === provider.id;
          const isWinner    = rank === 0;

          return (
            <motion.div
              key={provider.id}
              variants={cardVariants}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
              style={{
                ...GLASS,
                padding:  20,
                cursor:   'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={() => setExpandedId(isExpanded ? null : provider.id)}
            >
              {/* winner glow */}
              {isWinner && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{
                    position:  'absolute',
                    top:       -40,
                    left:      '50%',
                    transform: 'translateX(-50%)',
                    width:     180,
                    height:    180,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${provider.colorDim} 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* rank badge */}
              <div style={{
                position:  'absolute',
                top:       12,
                right:     12,
                display:   'flex',
                alignItems:'center',
                gap:       4,
              }}>
                {isWinner && (
                  <motion.div
                    initial={{ rotate: -20, scale: 0 }}
                    animate={{ rotate: 0, scale: 1   }}
                    transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    <Trophy size={14} strokeWidth={2.2} style={{ color: provider.color }} />
                  </motion.div>
                )}
                <span style={{
                  fontSize:     10,
                  fontWeight:   700,
                  letterSpacing:'0.1em',
                  textTransform:'uppercase',
                  color:        isWinner ? provider.color : T.faint,
                  background:   isWinner ? provider.colorDim : T.glass2,
                  border:       `1px solid ${isWinner ? provider.color + '44' : T.border}`,
                  borderRadius: 6,
                  padding:      '3px 7px',
                }}>
                  #{rank + 1}
                </span>
              </div>

              {/* provider identity */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width:      40,
                  height:     40,
                  borderRadius: 10,
                  background: provider.colorDim,
                  border:     `1px solid ${provider.color}44`,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize:   16,
                  fontWeight: 800,
                  color:      provider.color,
                  letterSpacing: '-0.03em',
                }}>
                  {provider.name.slice(0, 1)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize:   16,
                    fontWeight: 700,
                    color:      T.text,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                  }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
                    Priority {provider.priority} ·{' '}
                    <span style={{
                      color:       provider.color,
                      fontWeight:  600,
                      fontSize:    10,
                      textTransform: 'uppercase',
                      letterSpacing:'0.08em',
                    }}>
                      {provider.badge}
                    </span>
                  </div>
                </div>
              </div>

              {/* current metric value */}
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  display:    'flex',
                  alignItems: 'baseline',
                  gap:        6,
                  marginBottom: 6,
                }}>
                  <AnimatedCounter
                    target={parseFloat(displayVal.replace(/[^0-9.]/g, '')) || 0}
                    format={(n) => {
                      // reconstruct the display string format
                      if (metric.key === 'requests') return `${Math.round(n)}%`;
                      if (metric.key === 'tokens')   return provider.totalTokens === 0 ? '0' : `${n.toFixed(1)}M`;
                      if (metric.key === 'cost')     return provider.cost30d === 0 ? '$0' : `$${n.toFixed(2)}`;
                      if (metric.key === 'costPer1k')return provider.costPer1k === 0 ? '$0' : `$${n.toFixed(4)}/1k`;
                      if (metric.key === 'successRate') return `${n.toFixed(1)}%`;
                      if (metric.key === 'avgLatency')  return `${n.toFixed(2)}s`;
                      return String(Math.round(n));
                    }}
                    style={{
                      fontSize:   28,
                      fontWeight: 800,
                      color:      provider.color,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: '-0.03em',
                      lineHeight: 1,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: T.faint }}>{metric.label}</div>
              </div>

              {/* spring bar */}
              <SpringBar value={barValue} color={provider.color} delay={0.2} />

              {/* sparkline */}
              <div style={{ marginTop: 14, marginBottom: 4 }}>
                <Sparkline data={provider.trend} color={provider.color} />
              </div>
              <div style={{ fontSize: 10, color: T.faint, marginBottom: 12 }}>
                30-day request trend
              </div>

              {/* quick stats row */}
              <div style={{
                display:  'grid',
                gridTemplateColumns: '1fr 1fr',
                gap:      8,
                marginBottom: 12,
              }}>
                {[
                  { label: 'Requests',   value: abbrev(provider.requests30d), icon: Activity },
                  { label: 'Tokens',     value: provider.totalTokens === 0 ? '—' : abbrev(provider.totalTokens), icon: Layers },
                  { label: 'Cost 30d',   value: provider.cost30d === 0 ? '$0' : `$${provider.cost30d.toFixed(2)}`, icon: DollarSign },
                  { label: 'Latency',    value: `${provider.avgLatency.toFixed(2)}s`, icon: Clock },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      ...GLASS_INNER,
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <s.icon size={11} strokeWidth={2.4} style={{ color: T.faint, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 9, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>
                        {s.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* success rate indicator */}
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        6,
                marginBottom: 12,
                fontSize:   12,
              }}>
                <CheckCircle2 size={12} strokeWidth={2.4}
                  style={{ color: provider.successRate === 100 ? T.success : provider.successRate > 99 ? T.warning : T.danger, flexShrink: 0 }} />
                <span style={{ color: T.dim }}>
                  {provider.successRate.toFixed(1)}% success rate
                </span>
                {provider.successRate < 99.5 && (
                  <AlertTriangle size={11} strokeWidth={2.4} style={{ color: T.warning }} />
                )}
              </div>

              {/* expand toggle */}
              <motion.button
                onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : provider.id); }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width:        '100%',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  gap:          5,
                  padding:      '7px 0',
                  border:       `1px solid ${T.border}`,
                  borderRadius: 8,
                  background:   T.glass,
                  color:        T.dim,
                  cursor:       'pointer',
                  fontSize:     11,
                  fontWeight:   600,
                  outline:      'none',
                }}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isExpanded ? 'Hide details' : 'View details'}
              </motion.button>

              {/* expandable detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    key="detail"
                    variants={detailVariants}
                    initial="hidden"
                    animate="show"
                    exit="hidden"
                    transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                    style={{ overflow: 'hidden', marginTop: 14 }}
                  >
                    <div style={{
                      ...GLASS_INNER,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      {/* models */}
                      <div>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 6 }}>
                          Models in use
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {provider.modelsUsed.map((m) => (
                            <span key={m} style={{
                              padding:      '3px 9px',
                              borderRadius: 6,
                              background:   provider.colorDim,
                              border:       `1px solid ${provider.color}33`,
                              color:        provider.color,
                              fontSize:     11,
                              fontWeight:   600,
                              fontFamily:   'monospace',
                            }}>
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* tokens in/out */}
                      {provider.totalTokens > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            { label: 'Tokens in',  value: abbrev(provider.tokensIn) },
                            { label: 'Tokens out', value: abbrev(provider.tokensOut) },
                          ].map((s) => (
                            <div key={s.label} style={{ textAlign: 'center', padding: '8px 0' }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: provider.color, letterSpacing: '-0.02em' }}>
                                {s.value}
                              </div>
                              <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* budget bar */}
                      <div>
                        <div style={{
                          display:    'flex',
                          justifyContent: 'space-between',
                          fontSize:   11,
                          color:      T.dim,
                          marginBottom: 5,
                        }}>
                          <span>Budget utilisation</span>
                          <span style={{ fontWeight: 700, color: T.text }}>
                            {provider.budgetUsed}% of {provider.budgetCap}
                          </span>
                        </div>
                        <SpringBar
                          value={provider.budgetUsed / 100}
                          color={
                            provider.budgetUsed > 80 ? T.danger :
                            provider.budgetUsed > 60 ? T.warning :
                            T.success
                          }
                          delay={0}
                          height={6}
                        />
                      </div>

                      {/* all metrics mini-table */}
                      <div>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 6 }}>
                          Full metrics
                        </div>
                        {METRICS.map((m) => (
                          <div key={m.key} style={{
                            display:         'flex',
                            justifyContent:  'space-between',
                            alignItems:      'center',
                            padding:         '4px 0',
                            borderBottom:    `1px solid ${T.borderDim}`,
                            fontSize:        12,
                          }}>
                            <span style={{ color: T.faint, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <m.icon size={10} strokeWidth={2.4} />
                              {m.label}
                            </span>
                            <span style={{
                              fontWeight: 700,
                              color:      m.key === activeMetric ? provider.color : T.text,
                            }}>
                              {m.format(provider)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Bottom: side-by-side bar comparison ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1,  y: 0  }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ ...GLASS, padding: 22 }}
      >
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          marginBottom: 18,
        }}>
          <BarChart2 size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            All metrics side by side
          </span>
          <span style={{ fontSize: 11, color: T.faint, marginLeft: 4 }}>
            · click a row to switch the arena view
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {METRICS.map((m) => {
            const isActive = m.key === activeMetric;
            return (
              <motion.div
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', transition: { duration: 0.15 } }}
                style={{
                  padding:      '10px 12px',
                  borderRadius: 10,
                  border:       `1px solid ${isActive ? T.accent + '55' : 'transparent'}`,
                  background:   isActive ? 'rgba(242,101,34,0.07)' : 'transparent',
                  cursor:       'pointer',
                  transition:   'border-color 0.2s, background 0.2s',
                }}
              >
                <div style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        6,
                  marginBottom: 10,
                }}>
                  <m.icon size={11} strokeWidth={2.4} style={{ color: isActive ? T.accent : T.faint }} />
                  <span style={{
                    fontSize:  11,
                    fontWeight: 600,
                    color:      isActive ? T.accent : T.dim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}>
                    {m.label}
                  </span>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1   }}
                      style={{
                        marginLeft:   4,
                        fontSize:     9,
                        fontWeight:   700,
                        textTransform:'uppercase',
                        letterSpacing:'0.1em',
                        color:        T.accent,
                        background:   'rgba(242,101,34,0.18)',
                        padding:      '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      active
                    </motion.span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PROVIDERS.map((provider, pi) => {
                    const barVal = m.normalize(provider);
                    return (
                      <div key={provider.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width:      52,
                          fontSize:   11,
                          fontWeight: 600,
                          color:      provider.color,
                          flexShrink: 0,
                          textAlign:  'right',
                        }}>
                          {provider.name}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SpringBar value={barVal} color={provider.color} delay={pi * 0.05} height={7} />
                        </div>
                        <div style={{
                          width:      80,
                          fontSize:   12,
                          fontWeight: 700,
                          color:      T.dim,
                          flexShrink: 0,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {m.format(provider)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
