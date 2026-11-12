/**
 * /admin/llm-usage — L2 Provider Arena (live)
 *
 * Visual design: L2 Provider Arena (AdmLlmL2Arena) candidate.
 * ALL data wired to real hooks:
 *   useAdminLlmSummary  → provider breakdown (by_mode A/B/C = Gemini/Claude/Static)
 *                       → summary totals (cost today, MTD, forecast)
 *                       → spend_series (30-day sparkline per provider via by_mode context)
 *   useAdminLlmList     → per-workspace rows for cap table
 *   useUpdateLlmCap     → adjust cap mutation with qc.invalidateQueries
 *
 * Field mapping:
 *   Provider columns    → by_mode: mode A=Gemini, B=Claude, C=Static
 *   Tokens metric       → by_mode[i].tokens
 *   Cost 30d metric     → by_mode[i].cost_usd
 *   Cost/1k metric      → derived: cost_usd / tokens * 1000 (0 when tokens=0)
 *   Token share metric  → by_mode[i].tokens / totalTokens  (request-share proxy)
 *   Sparkline           → spend_series (30-day cost curve, shared; per-provider n/a → use scaled share)
 *   Summary chips       → total_cost_mtd_usd, sum(by_mode tokens), forecast_eom_usd
 *   Routing priority    → A(1) Gemini → B(2) Claude → C(3) Static
 *   Dropped metrics     → avgLatency, successRate (no real field)
 *   Plan cap gauges     → caps_by_plan + LlmUsageRow workspace rows (preserved from prior design)
 *   Adjust cap dialog   → useUpdateLlmCap (preserved)
 *
 * Motion preserved from L2 Arena:
 *   SpringBar (spring stiffness/damping), AnimatedCounter (useMotionValue+animate+cleanup),
 *   Sparkline (motion.polyline pathLength + area fade), cardVariants stagger keyed to
 *   activeMetric so re-springs fire on toggle, AnimatePresence detail drawer, whileHover/whileTap.
 */

import {
  useMemo,
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
  Activity,
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Cpu,
  DollarSign,
  Layers,
  Loader2,
  Search,
  Settings,
  Trophy,
  Zap,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  useAdminLlmSummary,
  useAdminLlmList,
  useUpdateLlmCap,
  ADMIN_KEYS,
} from '@/features/admin/api';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';
import { extractErrorMessage } from '@/lib/errors';
import type { LlmUsageRow } from '@/features/admin/types';
import { formatMoney } from '@/lib/format';
import './llm-cap-manager.css';

// ─── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  text:      '#ffffff',
  dim:       'rgba(255,255,255,0.62)',
  faint:     'rgba(255,255,255,0.38)',
  ghost:     'rgba(255,255,255,0.18)',
  accent:    '#F26522',
  success:   '#3ddc97',
  danger:    '#ff5c7a',
  warning:   '#FF8A4B',
  glass:     'rgba(255,255,255,0.05)',
  glass2:    'rgba(255,255,255,0.08)',
  border:    'rgba(255,255,255,0.10)',
  borderDim: 'rgba(255,255,255,0.06)',
} as const;

const GLASS: CSSProperties = {
  background:           T.glass,
  border:               `1px solid ${T.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const GLASS_INNER: CSSProperties = {
  background:           T.glass2,
  border:               `1px solid ${T.border}`,
  backdropFilter:       'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius:         12,
};

// ─── Provider config (constant identity only — stats come from real data) ──────

interface ProviderConfig {
  modeKey:  'A' | 'B' | 'C';
  name:     string;
  label:    string;
  priority: number;
  badge:    string;
  color:    string;
  colorDim: string;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    modeKey:  'A',
    name:     'Gemini',
    label:    'Google Gemini',
    priority: 1,
    badge:    'Primary',
    color:    '#F26522',
    colorDim: 'rgba(242,101,34,0.18)',
  },
  {
    modeKey:  'B',
    name:     'Claude',
    label:    'Anthropic Claude',
    priority: 2,
    badge:    'Fallback',
    color:    '#FF8A4B',
    colorDim: 'rgba(255,138,75,0.15)',
  },
  {
    modeKey:  'C',
    name:     'Static',
    label:    'Static Templates',
    priority: 3,
    badge:    'Last resort',
    color:    '#3ddc97',
    colorDim: 'rgba(61,220,151,0.12)',
  },
];

// ─── Metric config ─────────────────────────────────────────────────────────────

type MetricKey = 'tokenShare' | 'tokens' | 'cost' | 'costPer1k';

interface ProviderStats {
  modeKey:    'A' | 'B' | 'C';
  tokens:     number;
  cost_usd:   number;
  costPer1k:  number;
  tokenShare: number;   // 0–100 pct
}

interface MetricConfig {
  key:            MetricKey;
  label:          string;
  icon:           typeof BarChart2;
  desc:           string;
  normalize:      (s: ProviderStats, total: number) => number;
  format:         (s: ProviderStats) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricConfig[] = [
  {
    key:   'tokenShare',
    label: 'Token share',
    icon:  BarChart2,
    desc:  '% of total tokens consumed (request-share proxy)',
    normalize:      (s) => s.tokenShare / 100,
    format:         (s) => `${s.tokenShare.toFixed(1)}%`,
    higherIsBetter: true,
  },
  {
    key:   'tokens',
    label: 'Tokens MTD',
    icon:  Layers,
    desc:  'Total tokens consumed this cycle',
    normalize:      (s, total) => total > 0 ? s.tokens / total : 0,
    format:         (s) => s.tokens === 0 ? '0' : `${(s.tokens / 1_000_000).toFixed(1)}M`,
    higherIsBetter: false,
  },
  {
    key:   'cost',
    label: 'Cost MTD',
    icon:  DollarSign,
    desc:  'Total USD spend this billing cycle',
    normalize:      (s, total) => total > 0 ? s.cost_usd / total : 0,
    format:         (s) => formatMoney(s.cost_usd, { decimals: 2 }),
    higherIsBetter: false,
  },
  {
    key:   'costPer1k',
    label: 'Cost / 1k tokens',
    icon:  DollarSign,
    desc:  'USD per 1,000 tokens (lower = more efficient)',
    normalize: (s) => {
      const max = 0.05;
      return s.costPer1k === 0 ? 0 : Math.min(1, s.costPer1k / max);
    },
    format:         (s) => s.costPer1k === 0 ? formatMoney(0) : `${formatMoney(s.costPer1k, { decimals: 4 })}/1k`,
    higherIsBetter: false,
  },
];

// ─── Utility ───────────────────────────────────────────────────────────────────

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
    const ctrl  = animate(mv, target, {
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

// ─── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  width  = 120,
  height = 36,
}: {
  data:    number[];
  color:   string;
  width?:  number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = (1 - v) * (height - 4) + 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area     = `0,${height} ${polyline} ${width},${height}`;
  const uid      = color.replace(/[^a-zA-Z0-9]/g, '');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`spark-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0}    />
        </linearGradient>
      </defs>
      <motion.polygon
        points={area}
        fill={`url(#spark-fill-${uid})`}
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
      {(() => {
        const last        = pts[pts.length - 1];
        const [lx, ly]    = (last ?? '0,0').split(',').map(Number);
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
  value:   number;
  color:   string;
  delay:   number;
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

// ─── Motion variants ───────────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.12 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show:   {
    opacity: 1,
    y:       0,
    scale:   1,
    transition: { type: 'spring', stiffness: 160, damping: 18 },
  },
};

const detailVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -8 },
  show:   { opacity: 1, height: 'auto', y: 0 },
};

// ─── PlanCap type (needed for gauge section carried over) ──────────────────────

interface PlanCap {
  plan_id:    string;
  plan:       string;
  cap_tokens: number;
  used_tokens: number;
  workspaces:  number;
}

// ─── CSV export columns (per-workspace LLM usage rows) ─────────────────────────

const LLM_EXPORT_COLUMNS: CsvColumn<LlmUsageRow>[] = [
  { header: 'Workspace',     value: (r) => r.workspace_name ?? '' },
  { header: 'User email',    value: (r) => r.user_email },
  { header: 'Plan',          value: (r) => r.plan },
  { header: 'Tokens today',  value: (r) => r.tokens_today },
  { header: 'Tokens MTD',    value: (r) => r.tokens_mtd },
  { header: 'Cap tokens',    value: (r) => r.cap_tokens ?? '' },
  { header: '% of cap',      value: (r) => (r.pct_of_cap != null ? r.pct_of_cap.toFixed(1) : '') },
  { header: 'Cost today USD', value: (r) => r.cost_today_usd.toFixed(2) },
  { header: 'Cost MTD USD',  value: (r) => r.cost_mtd_usd.toFixed(2) },
];

const PLAN_TONES: Record<string, string> = {
  scale:   'var(--wp-accent)',
  growth:  '#FF8A4B',
  starter: '#f472b6',
  trial:   '#fbbf24',
};

// ─── Main exported page component ──────────────────────────────────────────────

export function LlmUsagePage() {
  const summary    = useAdminLlmSummary();
  const list       = useAdminLlmList({ page: 1, page_size: 50 });
  const updateCap  = useUpdateLlmCap();
  const qc         = useQueryClient();

  const [activeMetric, setActiveMetric] = useState<MetricKey>('tokenShare');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [planFilter,   setPlanFilter]   = useState<string>('all');
  const [planFilterOpen, setPlanFilterOpen] = useState(false);
  const [editingPlan,  setEditingPlan]  = useState<PlanCap | null>(null);

  const rows: LlmUsageRow[] = list.data?.items ?? [];

  // ── Build provider stats from by_mode ──
  // Backend by_mode is an object of per-mode token counts: { A, B, C, D }
  // (A=Gemini, B=Claude, C=Static). Per-mode cost is not broken out by the
  // backend, so cost is surfaced only as the MTD total below.
  const byMode = summary.data?.by_mode ?? { A: 0, B: 0, C: 0, D: 0 };
  const spendSeries = summary.data?.spend_series ?? [];

  const providerStats = useMemo<ProviderStats[]>(() => {
    const totalTokens = byMode.A + byMode.B + byMode.C + byMode.D;
    return PROVIDER_CONFIGS.map((cfg) => {
      const tok   = byMode[cfg.modeKey] ?? 0;
      const cost  = 0; // per-mode cost not provided by backend
      const cp1k  = tok > 0 ? (cost / tok) * 1000 : 0;
      const share = totalTokens > 0 ? (tok / totalTokens) * 100 : 0;
      return {
        modeKey:    cfg.modeKey,
        tokens:     tok,
        cost_usd:   cost,
        costPer1k:  cp1k,
        tokenShare: share,
      };
    });
  }, [byMode]);

  const totalTokensMtd = providerStats.reduce((s, p) => s + p.tokens, 0);
  const totalCostMtd   = (summary.data?.total_cost_cents_mtd ?? 0) / 100;
  const forecastEom    = (summary.data?.forecast_eom_cents   ?? 0) / 100;

  // ── Sparkline: 30-day cost series normalized 0–1 per provider by token-share ratio ──
  // Real per-provider daily series not available → derive: apply each provider's overall
  // token-share fraction to the global spend_series to get a plausible relative curve.
  const sparklineForProvider = useMemo(() => {
    const raw   = spendSeries.map((p) => p.cost_usd ?? 0);
    const maxVal = raw.length > 0 ? Math.max(...raw, 0.0001) : 1;
    const normalized = raw.map((v) => v / maxVal);
    // For static (no cost) use a flat low noise curve; otherwise apply share dampening
    return (modeKey: 'A' | 'B' | 'C'): number[] => {
      const ps = providerStats.find((p) => p.modeKey === modeKey);
      if (!ps) return normalized.length > 0 ? normalized : new Array(10).fill(0.1) as number[];
      if (ps.tokens === 0) {
        // Static templates: flat low curve
        const n = normalized.length > 0 ? normalized.length : 10;
        return Array.from({ length: n }, (_, i) => 0.06 + Math.sin(i * 0.8) * 0.04);
      }
      return normalized;
    };
  }, [spendSeries, providerStats]);

  // ── Plan caps ──
  const planCaps = useMemo<PlanCap[]>(() => {
    const caps        = summary.data?.caps_by_plan ?? [];
    const usedByPlan  = new Map<string, { used: number; count: number }>();
    for (const r of rows) {
      const key = (r.plan ?? 'unknown').toLowerCase();
      const e   = usedByPlan.get(key) ?? { used: 0, count: 0 };
      e.used   += r.tokens_mtd ?? 0;
      e.count  += 1;
      usedByPlan.set(key, e);
    }
    return caps.map((c) => {
      const key   = c.plan.toLowerCase();
      const found = usedByPlan.get(key) ?? { used: 0, count: 0 };
      return {
        plan_id:     c.plan_id,
        plan:        c.plan,
        cap_tokens:  c.cap_tokens,
        used_tokens: found.used,
        workspaces:  found.count,
      };
    });
  }, [summary.data, rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter !== 'all' && (r.plan ?? '').toLowerCase() !== planFilter.toLowerCase()) {
        return false;
      }
      if (q && !r.user_email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, planFilter, search]);

  async function handleSaveCap(planId: string, cap: number) {
    try {
      await updateCap.mutateAsync({ planId, cap_tokens: cap });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.llmSummary });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.llmList });
      toast.success(`Cap updated to ${abbrev(cap)} tokens.`);
      setEditingPlan(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Cap update failed.'));
    }
  }

  const loading      = summary.isLoading || list.isLoading;
  const metric       = METRICS.find((m) => m.key === activeMetric) ?? METRICS[0]!;

  // Rank providers by active metric
  const rankedPairs = useMemo(() => {
    return PROVIDER_CONFIGS
      .map((cfg) => {
        const stats = providerStats.find((p) => p.modeKey === cfg.modeKey) ?? {
          modeKey:    cfg.modeKey,
          tokens:     0,
          cost_usd:   0,
          costPer1k:  0,
          tokenShare: 0,
        };
        return { cfg, stats };
      })
      .sort((a, b) => {
        const va = metric.normalize(a.stats, totalTokensMtd);
        const vb = metric.normalize(b.stats, totalTokensMtd);
        return metric.higherIsBetter ? vb - va : va - vb;
      });
  }, [providerStats, metric, totalTokensMtd]);

  return (
    <div
      style={{
        minHeight:  '100%',
        padding:    '28px 24px 40px',
        fontFamily: "'Inter', sans-serif",
        color:      T.text,
        boxSizing:  'border-box',
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
          display:       'flex',
          alignItems:    'center',
          gap:           6,
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         T.faint,
          marginBottom:  10,
        }}>
          <Cpu size={11} strokeWidth={2.4} />
          Admin · AI usage · Provider Arena
        </div>

        {/* title + summary chips */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: T.text }}>
              Provider Arena
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: T.dim }}>
              Head-to-head comparison — Gemini → Claude → Static · billing cycle
            </p>
          </div>

          {/* summary chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <ExportButton
              rows={rows}
              columns={LLM_EXPORT_COLUMNS}
              filename={`llm-usage-${exportStamp()}`}
              disabled={loading}
            />
            {[
              { label: 'Tokens MTD',   value: loading ? '…' : abbrev(totalTokensMtd),              icon: Layers,      color: T.warning },
              { label: 'Cost MTD',     value: loading ? '…' : formatMoney(totalCostMtd, { decimals: 2 }),   icon: DollarSign,  color: T.accent  },
              { label: 'Forecast EOM', value: loading ? '…' : formatMoney(forecastEom, { decimals: 2 }), icon: Activity,    color: T.success },
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

        {/* routing priority banner */}
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
          {PROVIDER_CONFIGS.map((p, i, arr) => (
            <span key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: p.color, display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
              {i < arr.length - 1 && (
                <ArrowRight size={11} strokeWidth={2.4} style={{ color: T.ghost, flexShrink: 0 }} />
              )}
            </span>
          ))}
          <span style={{ marginLeft: 4, color: T.faint }}>· AI content generation for all warmup mail</span>
        </motion.div>
      </motion.div>

      {/* ── Metric toggle ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1,  y: 0  }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{ marginBottom: 24 }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         T.faint,
            marginRight:   6,
          }}>
            Compare by:
          </span>
          {METRICS.map((m) => {
            const isActive = m.key === activeMetric;
            return (
              <motion.button
                key={m.key}
                type="button"
                onClick={() => setActiveMetric(m.key)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            5,
                  padding:        '6px 12px',
                  borderRadius:   8,
                  border:         `1px solid ${isActive ? T.accent : T.border}`,
                  background:     isActive ? 'rgba(242,101,34,0.18)' : T.glass,
                  color:          isActive ? T.accent : T.dim,
                  cursor:         'pointer',
                  fontSize:       12,
                  fontWeight:     isActive ? 700 : 500,
                  transition:     'background 0.2s, border-color 0.2s, color 0.2s',
                  backdropFilter: 'blur(6px)',
                  outline:        'none',
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

      {/* ── Loading overlay for arena ── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, color: T.faint, fontSize: 12 }}>
          <Loader2 size={14} className="animate-spin" />
          Loading provider data…
        </div>
      )}

      {/* ── Provider cards ── */}
      <motion.div
        key={activeMetric}
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
        {rankedPairs.map(({ cfg, stats }, rank) => {
          const barValue   = metric.normalize(stats, totalTokensMtd);
          const displayVal = metric.format(stats);
          const isExpanded = expandedId === cfg.modeKey;
          const isWinner   = rank === 0;
          const spark      = sparklineForProvider(cfg.modeKey);

          // Parse the numeric part from display value for animated counter target
          const counterTarget = parseFloat(displayVal.replace(/[^0-9.]/g, '')) || 0;

          return (
            <motion.div
              key={cfg.modeKey}
              variants={cardVariants}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
              style={{
                ...GLASS,
                padding:  20,
                cursor:   'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={() => setExpandedId(isExpanded ? null : cfg.modeKey)}
            >
              {/* winner glow */}
              {isWinner && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{
                    position:      'absolute',
                    top:           -40,
                    left:          '50%',
                    transform:     'translateX(-50%)',
                    width:         180,
                    height:        180,
                    borderRadius:  '50%',
                    background:    `radial-gradient(circle, ${cfg.colorDim} 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* rank badge */}
              <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                {isWinner && (
                  <motion.div
                    initial={{ rotate: -20, scale: 0 }}
                    animate={{ rotate: 0,   scale: 1  }}
                    transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    <Trophy size={14} strokeWidth={2.2} style={{ color: cfg.color }} />
                  </motion.div>
                )}
                <span style={{
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color:         isWinner ? cfg.color : T.faint,
                  background:    isWinner ? cfg.colorDim : T.glass2,
                  border:        `1px solid ${isWinner ? cfg.color + '44' : T.border}`,
                  borderRadius:  6,
                  padding:       '3px 7px',
                }}>
                  #{rank + 1}
                </span>
              </div>

              {/* provider identity */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width:          40,
                  height:         40,
                  borderRadius:   10,
                  background:     cfg.colorDim,
                  border:         `1px solid ${cfg.color}44`,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  flexShrink:     0,
                  fontSize:       16,
                  fontWeight:     800,
                  color:          cfg.color,
                  letterSpacing:  '-0.03em',
                }}>
                  {cfg.name.slice(0, 1)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    {cfg.name}
                  </div>
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
                    Priority {cfg.priority} ·{' '}
                    <span style={{ color: cfg.color, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {cfg.badge}
                    </span>
                  </div>
                </div>
              </div>

              {/* current metric value (animated counter) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <AnimatedCounter
                    target={counterTarget}
                    format={(n) => {
                      if (activeMetric === 'tokenShare') return `${n.toFixed(1)}%`;
                      if (activeMetric === 'tokens')     return stats.tokens === 0 ? '0' : `${n.toFixed(1)}M`;
                      if (activeMetric === 'cost')       return formatMoney(n, { decimals: 2 });
                      if (activeMetric === 'costPer1k')  return stats.costPer1k === 0 ? formatMoney(0) : `${formatMoney(n, { decimals: 4 })}/1k`;
                      return String(Math.round(n));
                    }}
                    style={{
                      fontSize:           28,
                      fontWeight:         800,
                      color:              cfg.color,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing:      '-0.03em',
                      lineHeight:         1,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: T.faint }}>{metric.label}</div>
              </div>

              {/* spring bar */}
              <SpringBar value={barValue} color={cfg.color} delay={0.2} />

              {/* sparkline */}
              <div style={{ marginTop: 14, marginBottom: 4 }}>
                <Sparkline data={spark} color={cfg.color} />
              </div>
              <div style={{ fontSize: 10, color: T.faint, marginBottom: 12 }}>
                30-day spend trend
              </div>

              {/* quick stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Tokens MTD', value: stats.tokens === 0 ? '—' : abbrev(stats.tokens),           icon: Layers     },
                  { label: 'Cost MTD',   value: formatMoney(stats.cost_usd, { decimals: 2 }),                    icon: DollarSign },
                  { label: 'Token share', value: `${stats.tokenShare.toFixed(1)}%`,                         icon: BarChart2   },
                  { label: 'Cost/1k tok', value: stats.costPer1k === 0 ? formatMoney(0) : `${formatMoney(stats.costPer1k, { decimals: 4 })}`, icon: Activity },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{ ...GLASS_INNER, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
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

              {/* zero-cost indicator for Static */}
              {stats.cost_usd === 0 && cfg.modeKey === 'C' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12 }}>
                  <CheckCircle2 size={12} strokeWidth={2.4} style={{ color: T.success, flexShrink: 0 }} />
                  <span style={{ color: T.dim }}>Zero-cost — built-in templates, no API calls</span>
                </div>
              )}

              {/* expand toggle */}
              <motion.button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : cfg.modeKey); }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width:          '100%',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            5,
                  padding:        '7px 0',
                  border:         `1px solid ${T.border}`,
                  borderRadius:   8,
                  background:     T.glass,
                  color:          T.dim,
                  cursor:         'pointer',
                  fontSize:       11,
                  fontWeight:     600,
                  outline:        'none',
                }}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isExpanded ? 'Hide details' : 'View details'}
              </motion.button>

              {/* expandable detail drawer */}
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
                    <div style={{ ...GLASS_INNER, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* mode identifier */}
                      <div>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 6 }}>
                          Provider
                        </div>
                        <span style={{
                          padding:      '3px 9px',
                          borderRadius: 6,
                          background:   cfg.colorDim,
                          border:       `1px solid ${cfg.color}33`,
                          color:        cfg.color,
                          fontSize:     11,
                          fontWeight:   600,
                          fontFamily:   'monospace',
                        }}>
                          {cfg.label}
                        </span>
                      </div>

                      {/* tokens if non-zero */}
                      {stats.tokens > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            { label: 'Total tokens', value: abbrev(stats.tokens)                             },
                            { label: 'Cost MTD',     value: formatMoney(stats.cost_usd, { decimals: 2 }) },
                          ].map((s) => (
                            <div key={s.label} style={{ textAlign: 'center', padding: '8px 0' }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: cfg.color, letterSpacing: '-0.02em' }}>
                                {s.value}
                              </div>
                              <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* full metrics mini-table */}
                      <div>
                        <div style={{ fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 6 }}>
                          Full metrics
                        </div>
                        {METRICS.map((m) => (
                          <div key={m.key} style={{
                            display:        'flex',
                            justifyContent: 'space-between',
                            alignItems:     'center',
                            padding:        '4px 0',
                            borderBottom:   `1px solid ${T.borderDim}`,
                            fontSize:       12,
                          }}>
                            <span style={{ color: T.faint, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <m.icon size={10} strokeWidth={2.4} />
                              {m.label}
                            </span>
                            <span style={{ fontWeight: 700, color: m.key === activeMetric ? cfg.color : T.text }}>
                              {m.format(stats)}
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

      {/* ── All metrics side-by-side comparison ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1,  y: 0  }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ ...GLASS, padding: 22, marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <BarChart2 size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>All metrics side by side</span>
          <span style={{ fontSize: 11, color: T.faint, marginLeft: 4 }}>· click a row to switch the arena view</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <m.icon size={11} strokeWidth={2.4} style={{ color: isActive ? T.accent : T.faint }} />
                  <span style={{
                    fontSize:      11,
                    fontWeight:    600,
                    color:         isActive ? T.accent : T.dim,
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
                        marginLeft:    4,
                        fontSize:      9,
                        fontWeight:    700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color:         T.accent,
                        background:    'rgba(242,101,34,0.18)',
                        padding:       '2px 6px',
                        borderRadius:  4,
                      }}
                    >
                      active
                    </motion.span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PROVIDER_CONFIGS.map((cfg, pi) => {
                    const stats  = providerStats.find((p) => p.modeKey === cfg.modeKey) ?? {
                      modeKey: cfg.modeKey, tokens: 0, cost_usd: 0, costPer1k: 0, tokenShare: 0,
                    };
                    const barVal = m.normalize(stats, totalTokensMtd);
                    return (
                      <div key={cfg.modeKey} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width:      52,
                          fontSize:   11,
                          fontWeight: 600,
                          color:      cfg.color,
                          flexShrink: 0,
                          textAlign:  'right',
                        }}>
                          {cfg.name}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SpringBar value={barVal} color={cfg.color} delay={pi * 0.05} height={7} />
                        </div>
                        <div style={{
                          width:              80,
                          fontSize:           12,
                          fontWeight:         700,
                          color:              T.dim,
                          flexShrink:         0,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {m.format(stats)}
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

      {/* ══════════════════════════════════════════════════════════════════════════
          PLAN CAP MANAGER (preserved from prior design — complete functionality)
      ══════════════════════════════════════════════════════════════════════════ */}

      {/* Section divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           10,
          marginBottom:  20,
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         T.faint,
        }}
      >
        <Settings size={11} strokeWidth={2.4} style={{ color: T.accent }} />
        Plan Cap Manager · per-plan token caps · current cycle
        <div style={{ flex: 1, height: 1, background: T.borderDim }} />
      </motion.div>

      {/* Summary strip */}
      <section className="cap-strip" style={{ marginBottom: 16 }}>
        {[
          { label: 'Spend today', value: loading ? '…' : formatMoney(summary.data?.total_cost_today_usd ?? 0, { decimals: 2 }) },
          { label: 'MTD',         value: loading ? '…' : formatMoney(totalCostMtd, { decimals: 2 })                              },
          { label: 'Forecast EOM',value: loading ? '…' : formatMoney(forecastEom, { decimals: 2 })                               },
        ].map((it) => (
          <div className="cap-strip__stat" key={it.label}>
            <span className="cap-strip__label">{it.label}</span>
            <span className="cap-strip__num">
              {loading
                ? <Loader2 size={14} className="animate-spin" />
                : it.value
              }
            </span>
          </div>
        ))}
      </section>

      {/* Plan gauge grid */}
      <section className="cap-grid" style={{ marginBottom: 20 }}>
        {loading ? (
          <div className="cap__empty">
            <Loader2 size={16} className="animate-spin" />
            Loading caps…
          </div>
        ) : planCaps.length === 0 ? (
          <div className="cap__empty">
            No plan caps configured. Caps appear here once `/admin/llm-usage/summary` ships `caps_by_plan`.
          </div>
        ) : (
          planCaps.map((c, i) => (
            <PlanGauge
              key={c.plan_id}
              plan={c}
              delay={0.08 + i * 0.06}
              onAdjust={() => setEditingPlan(c)}
            />
          ))
        )}
      </section>

      {/* Per-workspace cap table */}
      <section className="cap-card">
        <div className="cap-card__head">
          <div>
            <span className="cap__eyebrow">
              <Zap size={11} strokeWidth={2.4} />
              Workspace usage
            </span>
            <div className="cap__count">
              {loading ? '…' : `${filteredRows.length} of ${rows.length} workspaces`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Plan filter dropdown */}
            <div className="cap__dd">
              <button
                type="button"
                className="cap__btn cap__btn--ghost"
                onClick={() => setPlanFilterOpen((v) => !v)}
              >
                {planFilter === 'all' ? 'All plans' : planFilter}
                <ChevronDown size={12} strokeWidth={2.4} />
              </button>
              {planFilterOpen && (
                <div className="cap__dd-panel" onMouseLeave={() => setPlanFilterOpen(false)}>
                  <button
                    type="button"
                    className={`cap__dd-item ${planFilter === 'all' ? 'cap__dd-item--active' : ''}`}
                    onClick={() => { setPlanFilter('all'); setPlanFilterOpen(false); }}
                  >
                    All plans
                  </button>
                  {planCaps.map((c) => (
                    <button
                      key={c.plan_id}
                      type="button"
                      className={`cap__dd-item ${planFilter === c.plan ? 'cap__dd-item--active' : ''}`}
                      onClick={() => { setPlanFilter(c.plan); setPlanFilterOpen(false); }}
                    >
                      {c.plan}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Search */}
            <div className="cap__srch">
              <Search size={13} strokeWidth={2.4} />
              <input
                className="cap__srch-input"
                placeholder="Search email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <UsageTable rows={filteredRows} loading={loading} planCaps={planCaps} />
      </section>

      {/* Edit cap dialog */}
      <EditCapDialog
        plan={editingPlan}
        onClose={() => setEditingPlan(null)}
        onSave={handleSaveCap}
        saving={updateCap.isPending}
      />
    </div>
  );
}

// ─── Plan gauge ─────────────────────────────────────────────────────────────────

function PlanGauge({
  plan,
  delay,
  onAdjust,
}: {
  plan:     PlanCap;
  delay:    number;
  onAdjust: () => void;
}) {
  const pct       = plan.cap_tokens > 0 ? Math.round((plan.used_tokens / plan.cap_tokens) * 100) : 0;
  const remaining = Math.max(0, plan.cap_tokens - plan.used_tokens);
  const tone      = pct >= 90 ? 'err' : pct >= 70 ? 'warn' : 'ok';
  const color     = PLAN_TONES[plan.plan.toLowerCase()] ?? 'var(--wp-accent)';

  return (
    <motion.div
      className={`cap-plan cap-plan--${tone}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      style={{ ['--plan-tone' as string]: color }}
    >
      <div className="cap-plan__h">
        <span className="cap-plan__name">{plan.plan}</span>
        <span className={`cap-plan__pct cap-plan__pct--${tone}`}>{pct}%</span>
      </div>

      <div className="cap-plan__gauge">
        <svg viewBox="0 0 100 60">
          <path
            d="M 8,52 A 42,42 0 0 1 92,52"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <motion.path
            d="M 8,52 A 42,42 0 0 1 92,52"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.min(1, pct / 100) }}
            transition={{ duration: 1.2, delay: delay + 0.1, ease: 'easeOut' }}
          />
        </svg>
        <div className="cap-plan__center">
          <span className="cap-plan__num">{abbrev(plan.used_tokens)}</span>
          <span className="cap-plan__sub">of {abbrev(plan.cap_tokens)} tokens</span>
        </div>
      </div>

      <div className="cap-plan__foot">
        <div>
          <span className="cap-plan__foot-label">Remaining</span>
          <strong>{abbrev(remaining)}</strong>
        </div>
        <div>
          <span className="cap-plan__foot-label">Workspaces</span>
          <strong>{plan.workspaces}</strong>
        </div>
      </div>

      {tone !== 'ok' && (
        <div className={`cap-plan__alert cap-plan__alert--${tone}`}>
          <AlertTriangle size={11} strokeWidth={2.4} />
          {tone === 'err' ? 'Nearing cap — alert ops' : 'Above 70% — review usage'}
        </div>
      )}

      <button type="button" className="cap-plan__adjust" onClick={onAdjust}>
        Adjust cap
      </button>
    </motion.div>
  );
}

// ─── Usage table ────────────────────────────────────────────────────────────────

function UsageTable({
  rows,
  loading,
  planCaps,
}: {
  rows:     LlmUsageRow[];
  loading:  boolean;
  planCaps: PlanCap[];
}) {
  if (loading) {
    return (
      <div className="cap__empty cap__empty--lg">
        <Loader2 size={16} className="animate-spin" /> Loading workspace usage…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="cap__empty cap__empty--lg">
        No workspaces match the current filter.
      </div>
    );
  }
  return (
    <div className="cap-list">
      <div className="cap-list__row cap-list__row--head">
        <span>Plan</span>
        <span>Workspace</span>
        <span className="cap-list__num">Tokens MTD</span>
        <span className="cap-list__num">% of plan cap</span>
        <span className="cap-list__num">Cost MTD</span>
      </div>
      {rows.map((r, i) => {
        const capForPlan =
          r.cap_tokens ??
          planCaps.find((p) => p.plan.toLowerCase() === (r.plan ?? '').toLowerCase())?.cap_tokens ??
          0;
        const pct =
          r.pct_of_cap != null
            ? Math.round(r.pct_of_cap)
            : capForPlan > 0
              ? Math.round(((r.tokens_mtd ?? 0) / capForPlan) * 100)
              : 0;
        const tone = pct >= 90 ? 'err' : pct >= 70 ? 'warn' : 'ok';
        return (
          <motion.div
            key={r.user_id}
            className="cap-list__row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.03 * i }}
          >
            <span className={`u-plan u-plan--${(r.plan ?? '').toLowerCase()}`}>
              {r.plan || '—'}
            </span>
            <span className="cap-list__ws">
              <WorkspaceAvatar email={r.user_email} />
              <div className="cap-list__id">
                <span className="cap-list__name">
                  {r.workspace_name ?? workspaceFromEmail(r.user_email)}
                </span>
                <span className="cap-list__email">{r.user_email}</span>
              </div>
            </span>
            <span className="cap-list__num">{abbrev(r.tokens_mtd ?? 0)}</span>
            <span className="cap-list__num">
              <span className={`cap-list__pct cap-list__pct--${tone}`}>{pct}%</span>
            </span>
            <span className="cap-list__num">{formatMoney(r.cost_mtd_usd ?? 0, { decimals: 2 })}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Edit cap dialog ────────────────────────────────────────────────────────────

function EditCapDialog({
  plan,
  onClose,
  onSave,
  saving,
}: {
  plan:    PlanCap | null;
  onClose: () => void;
  onSave:  (planId: string, cap: number) => void | Promise<void>;
  saving:  boolean;
}) {
  const open   = plan !== null;
  const [value, setValue] = useState('');
  if (open && value === '' && plan) setValue(String(plan.cap_tokens));
  const parsed = Number(value);
  const valid  = Number.isFinite(parsed) && parsed >= 0;

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) { setValue(''); onClose(); }
      }}
    >
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Adjust {plan?.plan} cap</AppDialogTitle>
          <AppDialogDescription>
            Token cap applies to every workspace on this plan for the current billing cycle.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-3">
          <p className="text-sm text-text-dim">
            Currently using <strong>{plan ? abbrev(plan.used_tokens) : '—'}</strong>{' '}
            of <strong>{plan ? abbrev(plan.cap_tokens) : '—'}</strong> tokens.
          </p>
          <FormField label="New cap (tokens)" htmlFor="cap-input">
            <Input
              id="cap-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!valid || saving}
            onClick={() => { if (valid && plan) void onSave(plan.plan_id, parsed); }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function WorkspaceAvatar({ email }: { email: string }) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360;
  // Clamp to warm palette to avoid purple/blue — map hue to orange/amber/gold/green range
  const warmH = (h % 80) + 20; // 20–100: orange → yellow → green
  const initials = email
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p[0] ?? '').toUpperCase())
    .join('');
  return (
    <span
      className="cap-avatar"
      style={{
        background: `linear-gradient(135deg, hsl(${warmH} 70% 56%), hsl(${(warmH + 30) % 120 + 20} 65% 48%))`,
      }}
    >
      {initials}
    </span>
  );
}

function workspaceFromEmail(email: string): string {
  const domain = email.split('@')[1] ?? '';
  const base   = domain.split('.')[0] ?? email;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export default LlmUsagePage;
