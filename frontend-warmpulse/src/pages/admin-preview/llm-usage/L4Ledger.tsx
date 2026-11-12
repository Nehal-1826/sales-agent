/**
 * Admin LLM Usage Design Candidate: L4 Cost Ledger
 *
 * "Cost Ledger" — a spend-first admin view framing LLM usage as a budget/cost
 * story: stacked daily-spend bars by provider, a budget burn-down line overlay,
 * an animated budget gauge, KPI counters, and a top-consumer leaderboard with
 * FLIP reordering.
 *
 * Animation inventory:
 * - Stacked provider bars spring up from baseline on mount + on range change
 *   (AnimatePresence + motion.rect with spring height/y)
 * - Budget burn-down line drawn via motion.path pathLength 0→1
 * - Budget gauge arc (motion.path pathLength spring)
 * - KPI counters animate to target value via useMotionValue + useSpring + animate
 * - Leaderboard rows reorder with layout animation (FLIP) when sort metric changes
 * - AnimatePresence for day-click detail panel (provider split)
 * - Staggered entrance variants throughout
 * - whileHover lift + border glow, whileTap press on interactive cards/rows
 *
 * Self-contained: inline style={{}} only, mock data only,
 * no API / react-query / @/features / @/lib imports.
 * Aurora Glass palette: orange #F26522→#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 * Cleanup: animate() controls stored + cancelled; motion-value subscriptions
 * unsubscribed; no rAF usage.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Award,
  ChevronDown,
  DollarSign,
  Flame,
  Hash,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.12)' as const,
  hairline: 'rgba(255,255,255,0.07)' as const,
  accent: '#F26522' as const,
  accentHi: '#FF8A4B' as const,
  gemini: '#FF8A4B' as const,    // warm orange — Gemini (primary)
  claude: '#F26522' as const,    // deep orange — Claude
  staticTpl: 'rgba(255,255,255,0.28)' as const, // muted white — Static templates
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.15)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.15)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.15)' as const,
  glass: 'rgba(255,255,255,0.05)' as const,
  glassMid: 'rgba(255,255,255,0.08)' as const,
  border: 'rgba(255,255,255,0.10)' as const,
  borderBright: 'rgba(255,255,255,0.16)' as const,
  r: 16 as const,
  rsm: 10 as const,
};

function glass(extra?: CSSProperties): CSSProperties {
  return {
    background: T.glass,
    border: `1px solid ${T.border}`,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: T.r,
    ...extra,
  };
}

function glassMid(extra?: CSSProperties): CSSProperties {
  return {
    background: T.glassMid,
    border: `1px solid ${T.border}`,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    borderRadius: T.rsm,
    ...extra,
  };
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const MONTHLY_BUDGET = 80;   // $
const BUDGET_USED    = 38.4; // $ used so far this month (day 15 of 31)
const BUDGET_PROJECT = 64.8; // projected month-end

/** 30 days of daily spend split across three providers */
interface DaySpend {
  label: string;    // "May 2", etc.
  gemini: number;
  claude: number;
  staticT: number;
}

const DAYS_30: DaySpend[] = [
  { label: 'May 2',  gemini: 0.58, claude: 0.28, staticT: 0.02 },
  { label: 'May 3',  gemini: 0.72, claude: 0.30, staticT: 0.02 },
  { label: 'May 4',  gemini: 0.55, claude: 0.22, staticT: 0.01 },
  { label: 'May 5',  gemini: 0.90, claude: 0.40, staticT: 0.03 },
  { label: 'May 6',  gemini: 1.02, claude: 0.48, staticT: 0.03 },
  { label: 'May 7',  gemini: 0.88, claude: 0.38, staticT: 0.02 },
  { label: 'May 8',  gemini: 0.65, claude: 0.26, staticT: 0.01 },
  { label: 'May 9',  gemini: 0.70, claude: 0.32, staticT: 0.02 },
  { label: 'May 10', gemini: 0.95, claude: 0.44, staticT: 0.03 },
  { label: 'May 11', gemini: 1.10, claude: 0.52, staticT: 0.04 },
  { label: 'May 12', gemini: 1.05, claude: 0.49, staticT: 0.03 },
  { label: 'May 13', gemini: 0.82, claude: 0.36, staticT: 0.02 },
  { label: 'May 14', gemini: 0.78, claude: 0.34, staticT: 0.02 },
  { label: 'May 15', gemini: 1.22, claude: 0.60, staticT: 0.04 },
  { label: 'May 16', gemini: 1.35, claude: 0.68, staticT: 0.05 },
  { label: 'May 17', gemini: 1.18, claude: 0.58, staticT: 0.04 },
  { label: 'May 18', gemini: 1.42, claude: 0.72, staticT: 0.05 },
  { label: 'May 19', gemini: 1.60, claude: 0.82, staticT: 0.06 },
  { label: 'May 20', gemini: 1.48, claude: 0.74, staticT: 0.05 },
  { label: 'May 21', gemini: 1.38, claude: 0.68, staticT: 0.04 },
  { label: 'May 22', gemini: 1.72, claude: 0.88, staticT: 0.06 },
  { label: 'May 23', gemini: 1.88, claude: 0.96, staticT: 0.07 },
  { label: 'May 24', gemini: 1.75, claude: 0.90, staticT: 0.06 },
  { label: 'May 25', gemini: 2.02, claude: 1.04, staticT: 0.08 },
  { label: 'May 26', gemini: 2.18, claude: 1.12, staticT: 0.08 },
  { label: 'May 27', gemini: 1.95, claude: 0.98, staticT: 0.07 },
  { label: 'May 28', gemini: 2.30, claude: 1.20, staticT: 0.09 },
  { label: 'May 29', gemini: 2.42, claude: 1.28, staticT: 0.10 },
  { label: 'May 30', gemini: 2.55, claude: 1.35, staticT: 0.10 },
  { label: 'May 31', gemini: 2.72, claude: 1.45, staticT: 0.11 },
];

const DAYS_14 = DAYS_30.slice(16); // last 14 days

type SortMetric = 'cost' | 'tokens' | 'requests';

interface Consumer {
  id: string;
  workspace: string;
  email: string;
  plan: 'Scale' | 'Growth' | 'Starter';
  geminiRatio: number;   // 0..1, rest is Claude
  cost: number;          // $ this month
  tokens: number;        // tokens this month
  requests: number;      // request count
}

const CONSUMERS: Consumer[] = [
  { id: 'ws-acme',    workspace: 'Acme Corp',    email: 'alex@acme.co',           plan: 'Scale',   geminiRatio: 0.72, cost: 8.42,  tokens: 1_840_000, requests: 4_210 },
  { id: 'ws-beacon',  workspace: 'Beacon',       email: 'tk@beacon.app',          plan: 'Scale',   geminiRatio: 0.68, cost: 6.88,  tokens: 1_520_000, requests: 3_640 },
  { id: 'ws-north',   workspace: 'Northwind',    email: 'priya@northwind.io',     plan: 'Growth',  geminiRatio: 0.80, cost: 5.22,  tokens: 1_108_000, requests: 2_940 },
  { id: 'ws-hibou',   workspace: 'Hibou',        email: 'mei@hibou.co',           plan: 'Scale',   geminiRatio: 0.65, cost: 4.76,  tokens: 980_000,   requests: 2_710 },
  { id: 'ws-vendio',  workspace: 'Vendio',       email: 'sofia@vendio.io',        plan: 'Growth',  geminiRatio: 0.75, cost: 3.94,  tokens: 820_000,   requests: 2_210 },
  { id: 'ws-oxen',    workspace: 'Oxen Studio',  email: 'el@oxenstudio.com',      plan: 'Growth',  geminiRatio: 0.70, cost: 3.12,  tokens: 660_000,   requests: 1_880 },
  { id: 'ws-lumen',   workspace: 'Lumen Labs',   email: 'marcus@lumenlabs.dev',   plan: 'Starter', geminiRatio: 0.60, cost: 1.84,  tokens: 388_000,   requests: 1_120 },
  { id: 'ws-solona',  workspace: 'Solona',       email: 'rita@solona.io',         plan: 'Starter', geminiRatio: 0.85, cost: 1.28,  tokens: 272_000,   requests: 820  },
];

const PROVIDER_TOTALS = {
  gemini:  DAYS_30.reduce((s, d) => s + d.gemini, 0),
  claude:  DAYS_30.reduce((s, d) => s + d.claude, 0),
  staticT: DAYS_30.reduce((s, d) => s + d.staticT, 0),
};
const TOTAL_SPEND_30 = PROVIDER_TOTALS.gemini + PROVIDER_TOTALS.claude + PROVIDER_TOTALS.staticT;
const COST_PER_1K = (TOTAL_SPEND_30 / (CONSUMERS.reduce((s, c) => s + c.tokens, 0) / 1000)).toFixed(4);

// ─── Variants ────────────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0 },
};

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

const detailPanel: Variants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  show:   { opacity: 1, height: 'auto', marginTop: 12,
            transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
  exit:   { opacity: 0, height: 0, marginTop: 0,
            transition: { duration: 0.22, ease: 'easeIn' } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$  (v: number) { return v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(2)}`; }
function fmtTok(v: number) { return v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1_000).toFixed(0)}k`; }
function fmtNum(v: number) { return v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v); }

const PLAN_COLOR: Record<string, string> = {
  Scale:   T.accent,
  Growth:  T.accentHi,
  Starter: T.faint,
};

// ─── Animated counter ────────────────────────────────────────────────────────

function AnimCount({ to, prefix = '', suffix = '', decimals = 2 }:
  { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { stiffness: 80, damping: 18 });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(mv, to, { duration: 1.4, ease: 'easeOut' });
    const unsub = sp.on('change', (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
    });
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [mv, sp, to, prefix, suffix, decimals]);

  return <span ref={ref}>{prefix}{(0).toFixed(decimals)}{suffix}</span>;
}

// ─── Budget Gauge ─────────────────────────────────────────────────────────────

function BudgetGauge({ used, total }: { used: number; total: number }) {
  const pct = Math.min(used / total, 1);
  const tone = pct > 0.85 ? T.danger : pct > 0.65 ? T.warning : T.success;
  const r = 48;
  const sw = 9;
  const cx = 60; const cy = 60;
  const arc = Math.PI * 1.5; // 270°
  const startAngle = Math.PI * 0.75; // -225° from 3 o'clock

  // SVG arc path for 270° gauge (start = bottom-left, sweep = clockwise to bottom-right)
  function describeArc(frac: number) {
    const totalAngle = arc * frac;
    const end = startAngle + totalAngle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = totalAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  const trackPath = describeArc(1);
  const fillPath  = describeArc(Math.max(0.001, pct));

  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width={120} height={120}>
        {/* Track */}
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} strokeLinecap="round" />
        {/* Fill */}
        <motion.path
          d={fillPath}
          fill="none"
          stroke={tone}
          strokeWidth={sw}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${tone}66)` }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {/* Center label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 8,
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1 }}>
          {Math.round(pct * 100)}%
        </span>
        <span style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>used</span>
      </div>
    </div>
  );
}

// ─── Stacked bar chart with burn-down line ─────────────────────────────────

type Range = '14d' | '30d';

function SpendTimeline({ range }: { range: Range }) {
  const data = range === '14d' ? DAYS_14 : DAYS_30;
  const W = 640; const H = 200;
  const padL = 36; const padR = 8; const padT = 12; const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = data.length;
  const barW = Math.max(4, (chartW / n) * 0.72);

  const maxTotal = Math.max(...data.map((d) => d.gemini + d.claude + d.staticT));
  const yScale = (v: number) => chartH - (v / (maxTotal * 1.12)) * chartH;

  // Budget burn-down: linear from 0 → projected spend over the period
  const periodBudget = range === '14d' ? MONTHLY_BUDGET * (14 / 31) : MONTHLY_BUDGET;
  const burnPts = data.map((_, i) => {
    const spent = data.slice(0, i + 1).reduce((s, d) => s + d.gemini + d.claude + d.staticT, 0);
    const x = padL + (i / (n - 1)) * chartW;
    const y = padT + yScale(Math.min(spent, periodBudget));
    return `${x},${y}`;
  }).join(' ');

  // Budget ceiling line (flat)
  const budgetY = padT + yScale(periodBudget);

  const xLabels = data.filter((_, i) =>
    n <= 14 ? i % 2 === 0 : i % 5 === 0
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="l4-gemini-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.gemini} stopOpacity="0.95" />
          <stop offset="1" stopColor={T.gemini} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="l4-claude-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.claude} stopOpacity="0.9" />
          <stop offset="1" stopColor={T.claude} stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id="l4-burn-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={T.success} stopOpacity="0.5" />
          <stop offset="1" stopColor={T.success} stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines */}
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const yy = padT + yScale(maxTotal * 1.12 * f);
        return (
          <g key={f}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={padL - 4} y={yy + 3.5} textAnchor="end"
              fontSize={9} fill="rgba(255,255,255,0.32)">
              ${(maxTotal * 1.12 * f).toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Budget ceiling */}
      <line x1={padL} y1={budgetY} x2={W - padR} y2={budgetY}
        stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="4 4" />
      <text x={W - padR + 2} y={budgetY + 3.5} fontSize={9}
        fill="rgba(255,255,255,0.38)">budget</text>

      {/* Stacked bars — AnimatePresence keyed by range for spring re-entry */}
      <AnimatePresence mode="wait">
        <motion.g key={range}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18 } }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}>
          {data.map((d, i) => {
            const x = padL + (i / (n - 1)) * chartW - barW / 2;
            const gH = (d.gemini / (maxTotal * 1.12)) * chartH;
            const cH = (d.claude / (maxTotal * 1.12)) * chartH;
            const sH = (d.staticT / (maxTotal * 1.12)) * chartH;
            const gY = padT + chartH - gH;
            const cY = gY - cH;
            const sY = cY - sH;
            const delay = i * 0.018;

            return (
              <g key={d.label}>
                {/* Static templates — faintest, on top */}
                <motion.rect x={x} width={barW} rx={2}
                  initial={{ height: 0, y: padT + chartH }}
                  animate={{ height: sH, y: sY }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22, delay: delay + 0.05 }}
                  fill={T.staticTpl} />
                {/* Claude */}
                <motion.rect x={x} width={barW} rx={2}
                  initial={{ height: 0, y: padT + chartH }}
                  animate={{ height: cH, y: cY }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22, delay: delay + 0.03 }}
                  fill="url(#l4-claude-bar)" />
                {/* Gemini — base */}
                <motion.rect x={x} width={barW} rx={2}
                  initial={{ height: 0, y: padT + chartH }}
                  animate={{ height: gH, y: gY }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22, delay }}
                  fill="url(#l4-gemini-bar)" />
              </g>
            );
          })}
        </motion.g>
      </AnimatePresence>

      {/* Budget burn-down line — drawn last, on top */}
      <AnimatePresence mode="wait">
        <motion.g key={`burn-${range}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3, duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}>
          <motion.polyline
            points={burnPts}
            fill="none"
            stroke="url(#l4-burn-grad)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 4px ${T.success}88)` }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, delay: 0.5, ease: 'easeOut' }}
          />
          {/* Endpoint dot */}
          {(() => {
            const lastPt = burnPts.split(' ').pop() ?? '0,0';
            const [ex, ey] = lastPt.split(',').map(Number);
            return (
              <motion.circle cx={ex ?? 0} cy={ey ?? 0} r={4}
                fill={T.success}
                style={{ filter: `drop-shadow(0 0 6px ${T.success})` }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 2.1 }} />
            );
          })()}
        </motion.g>
      </AnimatePresence>

      {/* X-axis labels */}
      {xLabels.map((d, i) => {
        const origIndex = data.indexOf(d);
        const x = padL + (origIndex / (n - 1)) * chartW;
        return (
          <text key={i} x={x} y={H - 4} textAnchor="middle"
            fontSize={9} fill="rgba(255,255,255,0.32)">
            {d.label.replace('May ', '')}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Leaderboard row ─────────────────────────────────────────────────────────

function LeaderRow({
  rank, c, metric, maxVal, onClick,
}: {
  rank: number;
  c: Consumer;
  metric: SortMetric;
  maxVal: number;
  onClick: () => void;
}) {
  const val = metric === 'cost' ? c.cost : metric === 'tokens' ? c.tokens : c.requests;
  const barPct = (val / maxVal) * 100;
  const label = metric === 'cost' ? fmt$(c.cost)
    : metric === 'tokens' ? fmtTok(c.tokens)
    : fmtNum(c.requests);

  return (
    <motion.div
      layout
      layoutId={c.id}
      onClick={onClick}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)', x: 2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', borderRadius: T.rsm,
        cursor: 'pointer', position: 'relative',
        borderBottom: `1px solid ${T.hairline}`,
      }}
    >
      {/* Rank */}
      <span style={{
        fontSize: 11, fontWeight: 700, color: rank <= 3 ? T.accentHi : T.faint,
        width: 18, flexShrink: 0, textAlign: 'center',
      }}>
        {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
      </span>

      {/* Workspace initial badge */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `linear-gradient(135deg, ${T.accent}55, ${T.accentHi}33)`,
        border: `1px solid ${T.accent}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: T.accentHi,
      }}>
        {c.workspace.slice(0, 2).toUpperCase()}
      </div>

      {/* Name + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.workspace}
        </div>
        <div style={{ fontSize: 11, color: T.faint,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.email}
        </div>
      </div>

      {/* Plan chip */}
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
        padding: '2px 8px', borderRadius: 6, flexShrink: 0,
        background: `${PLAN_COLOR[c.plan] ?? T.faint}1A`,
        border: `1px solid ${PLAN_COLOR[c.plan] ?? T.faint}44`,
        color: PLAN_COLOR[c.plan] ?? T.faint,
      }}>
        {c.plan.toUpperCase()}
      </span>

      {/* Progress bar + value */}
      <div style={{ width: 100, flexShrink: 0 }}>
        <div style={{ height: 4, borderRadius: 2, background: T.hairline, overflow: 'hidden' }}>
          <motion.div
            layout={false}
            initial={{ width: 0 }}
            animate={{ width: `${barPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20, delay: rank * 0.04 }}
            style={{ height: '100%', borderRadius: 2,
              background: `linear-gradient(90deg, ${T.claude}, ${T.gemini})` }}
          />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, textAlign: 'right', marginTop: 3 }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Detail panel (day or consumer) ──────────────────────────────────────────

function DayDetail({ day, onClose }: { day: DaySpend; onClose: () => void }) {
  const total = day.gemini + day.claude + day.staticT;
  const items = [
    { label: 'Gemini',          color: T.gemini,   val: day.gemini,  pct: (day.gemini  / total) * 100 },
    { label: 'Claude',          color: T.claude,   val: day.claude,  pct: (day.claude  / total) * 100 },
    { label: 'Static templates', color: T.staticTpl, val: day.staticT, pct: (day.staticT / total) * 100 },
  ];
  return (
    <motion.div
      variants={detailPanel}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        ...glassMid({ padding: '12px 16px' }),
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{day.label} — Provider Split</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      {items.map((item) => (
        <div key={item.label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: T.dim }}>{item.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>${item.val.toFixed(3)} · {item.pct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 4, background: T.hairline, borderRadius: 2, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.pct}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 20 }}
              style={{ height: '100%', borderRadius: 2, background: item.color }}
            />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairline}`,
        display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: T.faint }}>Total spend</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.accentHi }}>${total.toFixed(3)}</span>
      </div>
    </motion.div>
  );
}

function ConsumerDetail({ c, onClose }: { c: Consumer; onClose: () => void }) {
  const geminiCost = c.cost * c.geminiRatio;
  const claudeCost = c.cost * (1 - c.geminiRatio);
  return (
    <motion.div
      variants={detailPanel}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{ ...glassMid({ padding: '12px 16px' }), overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.workspace} — Provider breakdown</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      {[
        { label: 'Gemini',  color: T.gemini,  cost: geminiCost, pct: c.geminiRatio * 100 },
        { label: 'Claude',  color: T.claude,  cost: claudeCost, pct: (1 - c.geminiRatio) * 100 },
      ].map((row) => (
        <div key={row.label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: T.dim }}>{row.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>${row.cost.toFixed(2)} · {row.pct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 4, background: T.hairline, borderRadius: 2, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${row.pct}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 20 }}
              style={{ height: '100%', borderRadius: 2, background: row.color }}
            />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.hairline}`,
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[
          { label: 'Tokens',   val: fmtTok(c.tokens) },
          { label: 'Requests', val: fmtNum(c.requests) },
          { label: 'Plan',     val: c.plan },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.val}</div>
            <div style={{ fontSize: 10, color: T.faint }}>{s.label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmLlmL4Ledger() {
  const [range, setRange]           = useState<Range>('30d');
  const [sortMetric, setSortMetric] = useState<SortMetric>('cost');
  const [selectedDay, setSelectedDay]           = useState<string | null>(null);
  const [selectedConsumer, setSelectedConsumer] = useState<string | null>(null);

  const sortedConsumers = useCallback((): Consumer[] => {
    return [...CONSUMERS].sort((a, b) => {
      if (sortMetric === 'cost')     return b.cost - a.cost;
      if (sortMetric === 'tokens')   return b.tokens - a.tokens;
      return b.requests - a.requests;
    });
  }, [sortMetric]);

  const sorted = sortedConsumers();
  const maxVal = sortMetric === 'cost'
    ? Math.max(...CONSUMERS.map((c) => c.cost))
    : sortMetric === 'tokens'
      ? Math.max(...CONSUMERS.map((c) => c.tokens))
      : Math.max(...CONSUMERS.map((c) => c.requests));

  const selDay = selectedDay != null
    ? (DAYS_30.find((d) => d.label === selectedDay) ?? null)
    : null;
  const selConsumer = selectedConsumer != null
    ? (CONSUMERS.find((c) => c.id === selectedConsumer) ?? null)
    : null;

  // Close detail when sort changes
  useEffect(() => { setSelectedConsumer(null); }, [sortMetric]);
  useEffect(() => { setSelectedDay(null); }, [range]);

  const budgetRemaining = MONTHLY_BUDGET - BUDGET_USED;
  const overBudget = BUDGET_PROJECT > MONTHLY_BUDGET;

  return (
    <div style={{ padding: '24px 28px', color: T.text, fontFamily: 'inherit', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <motion.div
        variants={stagger} initial="hidden" animate="show"
        style={{ marginBottom: 24 }}>
        <motion.div variants={fadeUp} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em',
              textTransform: 'uppercase', color: T.faint, marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame size={11} strokeWidth={2.4} color={T.accentHi} />
              Admin · LLM Usage · Cost Ledger
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.1, color: T.text }}>
              Cost Ledger
            </h1>
            <p style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
              Daily spend by provider · budget burn-down · top consumers
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Range toggle */}
            {(['14d', '30d'] as Range[]).map((r) => (
              <motion.button
                key={r}
                onClick={() => setRange(r)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: `1px solid ${range === r ? T.accent : T.border}`,
                  background: range === r ? `${T.accent}22` : T.glass,
                  color: range === r ? T.accent : T.dim,
                  transition: 'all 0.15s',
                }}
              >
                {r}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ── KPI strip ── */}
      <motion.div
        variants={stagger} initial="hidden" animate="show"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { icon: DollarSign, label: 'Total spend (30d)', to: TOTAL_SPEND_30, prefix: '$', suffix: '', decimals: 2, tone: T.accentHi },
          { icon: Zap,        label: 'Budget remaining',  to: budgetRemaining, prefix: '$', suffix: '', decimals: 2,
            tone: budgetRemaining < 15 ? T.danger : budgetRemaining < 30 ? T.warning : T.success },
          { icon: TrendingUp, label: 'Projected month-end', to: BUDGET_PROJECT, prefix: '$', suffix: '', decimals: 2,
            tone: overBudget ? T.danger : T.warning },
          { icon: Hash,       label: 'Cost / 1k tokens',  to: parseFloat(COST_PER_1K), prefix: '$', suffix: '', decimals: 4, tone: T.dim },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            variants={fadeUp}
            whileHover={{ y: -2, boxShadow: `0 8px 24px rgba(0,0,0,0.24)` }}
            style={{ ...glass({ padding: '16px 18px' }) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <kpi.icon size={12} strokeWidth={2.4} color={kpi.tone} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em',
                textTransform: 'uppercase', color: T.faint }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.tone, lineHeight: 1 }}>
              <AnimCount to={kpi.to} prefix={kpi.prefix} suffix={kpi.suffix} decimals={kpi.decimals} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Main grid: chart (left) + budget gauge (right) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, marginBottom: 20 }}>

        {/* Spend timeline */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          style={{ ...glass({ padding: '18px 20px' }) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Daily Spend</div>
              <div style={{ fontSize: 11, color: T.faint }}>Stacked by provider · burn-down line = cumulative vs budget</div>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {[
                { label: 'Gemini',   color: T.gemini },
                { label: 'Claude',   color: T.claude },
                { label: 'Static',   color: T.staticTpl },
                { label: 'Burn-down', color: T.success },
              ].map((l) => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: T.faint }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <SpendTimeline range={range} />
        </motion.div>

        {/* Budget gauge panel */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          style={{ ...glass({ padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }) }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.11em',
            textTransform: 'uppercase', color: T.faint, alignSelf: 'flex-start' }}>
            Monthly Budget
          </div>
          <BudgetGauge used={BUDGET_USED} total={MONTHLY_BUDGET} />
          <div style={{ width: '100%' }}>
            {[
              { label: 'Budget',    val: `$${MONTHLY_BUDGET}`, color: T.dim },
              { label: 'Spent',     val: `$${BUDGET_USED.toFixed(2)}`, color: T.accentHi },
              { label: 'Remaining', val: `$${budgetRemaining.toFixed(2)}`,
                color: budgetRemaining < 15 ? T.danger : T.success },
              { label: 'Projected', val: `$${BUDGET_PROJECT.toFixed(2)}`,
                color: overBudget ? T.danger : T.warning },
            ].map((row) => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: `1px solid ${T.hairline}`,
              }}>
                <span style={{ fontSize: 11, color: T.faint }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.val}</span>
              </div>
            ))}
          </div>
          {overBudget && (
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2 }}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: T.dangerDim, border: `1px solid ${T.danger}44`,
                fontSize: 11, color: T.danger, textAlign: 'center',
              }}>
              Projected to exceed budget
            </motion.div>
          )}

          {/* Provider totals mini-bar */}
          <div style={{ width: '100%', marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: T.faint, marginBottom: 8 }}>
              Provider mix (30d)
            </div>
            {[
              { label: 'Gemini',  val: PROVIDER_TOTALS.gemini,  color: T.gemini },
              { label: 'Claude',  val: PROVIDER_TOTALS.claude,  color: T.claude },
              { label: 'Static',  val: PROVIDER_TOTALS.staticT, color: T.staticTpl },
            ].map((p) => (
              <div key={p.label} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: T.faint }}>{p.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>${p.val.toFixed(2)}</span>
                </div>
                <div style={{ height: 3, background: T.hairline, borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.val / TOTAL_SPEND_30) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 100, damping: 18, delay: 0.6 }}
                    style={{ height: '100%', background: p.color, borderRadius: 2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Day detail (AnimatePresence) ── */}
      <AnimatePresence>
        {selDay && (
          <DayDetail key="day-detail" day={selDay} onClose={() => setSelectedDay(null)} />
        )}
      </AnimatePresence>

      {/* ── Top Consumer Leaderboard ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{ ...glass({ padding: '18px 20px' }) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={14} strokeWidth={2.4} color={T.accentHi} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Top Consumers</span>
            <span style={{ fontSize: 11, color: T.faint }}>{CONSUMERS.length} workspaces</span>
          </div>
          {/* Sort toggle */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: T.faint, marginRight: 4 }}>Sort by</span>
            {([
              { key: 'cost',     label: 'Cost',     icon: DollarSign },
              { key: 'tokens',   label: 'Tokens',   icon: Zap },
              { key: 'requests', label: 'Requests', icon: ChevronDown },
            ] as { key: SortMetric; label: string; icon: typeof DollarSign }[]).map((s) => (
              <motion.button
                key={s.key}
                onClick={() => setSortMetric(s.key)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${sortMetric === s.key ? T.accent : T.border}`,
                  background: sortMetric === s.key ? `${T.accent}22` : 'transparent',
                  color: sortMetric === s.key ? T.accent : T.faint,
                  transition: 'all 0.15s',
                }}
              >
                <s.icon size={11} strokeWidth={2.4} />
                {s.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* FLIP leaderboard */}
        <motion.div layout style={{ display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence initial={false}>
            {sorted.map((c, i) => (
              <div key={c.id}>
                <LeaderRow
                  rank={i + 1}
                  c={c}
                  metric={sortMetric}
                  maxVal={maxVal}
                  onClick={() => setSelectedConsumer(
                    selectedConsumer === c.id ? null : c.id
                  )}
                />
                <AnimatePresence>
                  {selConsumer && selConsumer.id === c.id && (
                    <ConsumerDetail
                      key={`detail-${c.id}`}
                      c={c}
                      onClose={() => setSelectedConsumer(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            ))}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ── Footer note ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: T.faint }}>
        Mock data only · real data wired from <code style={{ fontSize: 10, color: T.ghost }}>GET /admin/llm-usage</code> · Provider: Gemini → Claude → Static templates
      </motion.div>
    </div>
  );
}
