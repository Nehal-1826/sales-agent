/**
 * Admin Reports — RP1 Report Studio (Live)
 *
 * Visual / motion target: RP1Studio.tsx in admin-preview.
 * Data: real backend endpoints under /api/admin/reports/*.
 * Indian standards: money via money() (₹), dates via date() (DD/MM/YYYY).
 *
 * Feature map:
 *   Report-type picker  ← useAdminReportTypes()           GET /reports/types
 *   Live preview        ← useGenerateReport()             POST /reports/generate
 *   Download            ← useExportReport()               POST /reports/export (blob; 501 → toast)
 *   Schedules list      ← useReportSchedules()            GET  /reports/schedules
 *   Create schedule     ← useCreateReportSchedule()       POST /reports/schedules
 *   Toggle enabled      ← useUpdateReportSchedule()       PATCH /reports/schedules/:id
 *   Delete schedule     ← useDeleteReportSchedule()       DELETE /reports/schedules/:id
 *
 * Recent-exports list: session-local only (no backend history endpoint exists).
 *   Each real export call appends an entry; delete removes from local state only.
 * Save-as-template: session-local convenience (no backend template endpoint).
 *   Both are clearly local — they reset on page reload. This is documented below.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  IndianRupee,
  Users,
  Mail,
  ShieldCheck,
  Network,
  Zap,
  Calendar,
  FileText,
  Table,
  FileSpreadsheet,
  Download,
  Play,
  CheckCircle2,
  BarChart2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  X,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  Eye,
  LineChart,
  LayoutGrid,
  Filter,
  Send,
  Bookmark,
  Repeat,
  Trash2,
  Plus,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import {
  useAdminReportTypes,
  useGenerateReport,
  useExportReport,
  useReportSchedules,
  useCreateReportSchedule,
  useUpdateReportSchedule,
  useDeleteReportSchedule,
} from '@/features/admin/api';
import { toast } from '@/components/ui/AppToast';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';
import { extractErrorMessage } from '@/lib/errors';
import type {
  GenerateResult,
  ReportScheduleOut,
  ReportTypeItem,
  ExportFormat,
  GroupBy,
} from '@/features/admin/types';

// ─── Design tokens ──────────────────────────────────────────────────────────

const T = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.38)' as const,
  ghost:       'rgba(255,255,255,0.18)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  accent:      '#F26522' as const,
  accentHi:    '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.16)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.13)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.13)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.13)' as const,
  amber:       '#e8a838' as const,
  amberDim:    'rgba(232,168,56,0.13)' as const,
};

function glass(extra?: CSSProperties): CSSProperties {
  return {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         16,
    ...extra,
  };
}

function glassDeep(extra?: CSSProperties): CSSProperties {
  return {
    background:           'rgba(255,255,255,0.08)',
    border:               '1px solid rgba(255,255,255,0.13)',
    backdropFilter:       'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius:         14,
    ...extra,
  };
}

const MICRO: CSSProperties = {
  fontSize:      10,
  fontWeight:    700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase' as const,
  color:         T.faint,
};

// ─── Type icon map (backend key → lucide icon + color) ──────────────────────

const TYPE_META: Record<string, { icon: typeof IndianRupee; color: string }> = {
  revenue:           { icon: IndianRupee, color: T.accent },
  subscriber_growth: { icon: Users,       color: T.success },
  warmup_usage:      { icon: Mail,        color: T.accentHi },
  deliverability:    { icon: ShieldCheck, color: T.warning },
  peer_health:       { icon: Network,     color: T.amber },
  llm_cost:          { icon: Zap,         color: T.danger },
};

function typeIcon(key: string): typeof IndianRupee {
  return TYPE_META[key]?.icon ?? BarChart2;
}

function typeColor(key: string): string {
  return TYPE_META[key]?.color ?? T.accent;
}

// ─── Export format meta ───────────────────────────────────────────────────────

type UIFormat = 'csv' | 'pdf' | 'xlsx';

const FORMAT_META: Record<UIFormat, { icon: typeof FileText; color: string; bg: string; label: string }> = {
  csv:  { icon: Table,          color: T.success, bg: T.successDim, label: 'CSV'  },
  pdf:  { icon: FileText,       color: T.danger,  bg: T.dangerDim,  label: 'PDF'  },
  xlsx: { icon: FileSpreadsheet,color: T.accentHi,bg: T.accentDim,  label: 'XLSX' },
};

// ─── Date range presets ───────────────────────────────────────────────────────

interface DatePreset { id: string; label: string; preset: string }

const DATE_PRESETS: DatePreset[] = [
  { id: '7d',  label: 'Last 7 days',   preset: '7d'  },
  { id: '30d', label: 'Last 30 days',  preset: '30d' },
  { id: '90d', label: 'Last 90 days',  preset: '90d' },
  { id: 'mtd', label: 'Month to date', preset: 'mtd' },
  { id: 'ytd', label: 'Year to date',  preset: 'ytd' },
];

// ─── Group-by options ─────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: 'None',   value: 'none'   },
  { label: 'Plan',   value: 'plan'   },
  { label: 'Month',  value: 'month'  },
  { label: 'Region', value: 'region' },
];

// ─── Plan filter options ──────────────────────────────────────────────────────

const ALL_PLANS = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];

// ─── Session-local export row (no backend history endpoint) ──────────────────

interface SessionExportRow {
  id:        string;
  typeKey:   string;
  typeLabel: string;
  format:    UIFormat;
  createdAt: string;  // ISO
}

// ─── Cadence labels ───────────────────────────────────────────────────────────

type UICadence = 'daily' | 'weekly' | 'monthly';

const CADENCE_LABELS: Record<UICadence, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
};

// ─── Animated counter hook ────────────────────────────────────────────────────

function useAnimatedCounter(target: number, decimals = 0): string {
  const mv  = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = mv.on('change', (v) => {
      setDisplay(
        decimals > 0
          ? v.toFixed(decimals)
          : Math.round(v).toLocaleString('en-IN')
      );
    });
    return () => {
      ctrlRef.current?.stop();
      unsub();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

// ─── Framer variants ──────────────────────────────────────────────────────────

const CONTAINER_V: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const CARD_V: Variants = {
  hidden:  { opacity: 0, y: 22, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 210, damping: 24 },
  },
};

const SECTION_V: Variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: {
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 240, damping: 26 },
  },
};

const PREVIEW_V: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 26 },
  },
  exit: {
    opacity: 0, scale: 0.96, y: -10,
    transition: { duration: 0.22, ease: 'easeIn' },
  },
};

const TOAST_V: Variants = {
  hidden:  { opacity: 0, y: 36, scale: 0.93 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 360, damping: 28 },
  },
  exit: {
    opacity: 0, y: 24, scale: 0.93,
    transition: { duration: 0.22 },
  },
};

const EXPORT_ROW_V: Variants = {
  hidden:  { opacity: 0, x: -20, scale: 0.98 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
  exit: {
    opacity: 0, x: 20, scale: 0.97,
    transition: { duration: 0.18 },
  },
};

const CHIP_V: Variants = {
  hidden:  { opacity: 0, scale: 0.7 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } },
  exit:    { opacity: 0, scale: 0.6, transition: { duration: 0.14 } },
};

// ─── Mini bar chart (for live preview in bar mode) ───────────────────────────

interface BarPoint { label: string; value: number }

function MiniBarChart({ bars, color, typeKey }: { bars: BarPoint[]; color: string; typeKey: string }) {
  const W = 300; const H = 90;
  const PAD = { top: 8, right: 8, bottom: 22, left: 8 };
  const innerH = H - PAD.top - PAD.bottom;
  const barW = (W - PAD.left - PAD.right) / Math.max(bars.length, 1);
  const gap  = barW * 0.28;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id={`bg-${typeKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {bars.map((b, i) => {
        const barH = (b.value / 100) * innerH;
        const x = PAD.left + i * barW + gap / 2;
        const y = PAD.top + innerH - barH;
        const w = barW - gap;
        return (
          <g key={b.label}>
            <motion.rect
              x={x} y={y} width={w} height={barH} rx={3}
              fill={`url(#bg-${typeKey})`}
              initial={{ scaleY: 0, originY: 1, transformOrigin: `${x + w / 2}px ${H - PAD.bottom}px` }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.07, type: 'spring', stiffness: 220, damping: 22 }}
              key={`bar-${typeKey}-${b.label}`}
            />
            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.30)">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Mini line chart ──────────────────────────────────────────────────────────

function MiniLineChart({ bars, color, typeKey }: { bars: BarPoint[]; color: string; typeKey: string }) {
  const W = 300; const H = 90;
  const PAD = { top: 10, right: 14, bottom: 22, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const pts = bars.map((b, i) => ({
    x: PAD.left + (i / Math.max(bars.length - 1, 1)) * innerW,
    y: PAD.top + innerH - (b.value / 100) * innerH,
    label: b.label,
  }));
  const pathD = pts.reduce((acc, pt, i) => acc + (i === 0 ? `M${pt.x},${pt.y}` : ` L${pt.x},${pt.y}`), '');
  const fillD = pathD + ` L${pts[pts.length - 1]?.x ?? 0},${H - PAD.bottom} L${pts[0]?.x ?? 0},${H - PAD.bottom} Z`;
  const gradId = `line-fill-${typeKey}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <motion.path d={fillD} fill={`url(#${gradId})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} />
      <motion.path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
      {pts.map((pt, i) => (
        <motion.circle key={pt.label} cx={pt.x} cy={pt.y} r={3} fill={color} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.8 + i * 0.05, type: 'spring', stiffness: 400, damping: 22 }} />
      ))}
      {pts.map((pt) => (
        <text key={`lbl-${pt.label}`} x={pt.x} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.30)">{pt.label}</text>
      ))}
    </svg>
  );
}

// ─── KPI summary tiles (from real GenerateResult.summary) ────────────────────

interface KpiTileProps { label: string; value: string; delta_pct?: number | null; hasMoney: boolean }

function KpiTile({ label, value, delta_pct, hasMoney: _hasMoney }: KpiTileProps) {
  const isPos = (delta_pct ?? 0) >= 0;
  return (
    <motion.div
      layout
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      <span style={{ ...MICRO, fontSize: 9 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </span>
      <AnimatePresence>
        {delta_pct != null && (
          <motion.span key="delta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: isPos ? T.success : T.danger }}
          >
            {isPos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {isPos ? '+' : ''}{delta_pct.toFixed(1)}%
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Estimated counter (animates from 0 to estimated_rows) ───────────────────

function EstRowCounter({ target }: { target: number }) {
  const display = useAnimatedCounter(target, 0);
  return <span style={{ color: T.dim, fontWeight: 700 }}>{display}</span>;
}

// ─── Live preview panel ───────────────────────────────────────────────────────

type ChartViewType = 'Table' | 'Bar' | 'Line';

interface LivePreviewProps {
  typeItem:   ReportTypeItem | null;
  result:     GenerateResult | null;
  isPending:  boolean;
  preset:     string;
  chartView:  ChartViewType;
  groupBy:    GroupBy;
  compare:    boolean;
}

function LivePreview({ typeItem, result, isPending, preset, chartView, groupBy, compare }: LivePreviewProps) {
  const { date: fmtDate } = useLocaleFormat();
  const color = typeItem ? typeColor(typeItem.key) : T.accent;

  // Build bar data from result rows when possible (use first numeric column)
  const bars: BarPoint[] = (() => {
    if (!result || result.rows.length === 0) return [];
    const firstNumCol = result.columns.find((c) => {
      const val = result.rows[0]?.[c];
      return typeof val === 'number';
    });
    if (!firstNumCol) return [];
    const vals = result.rows.map((r) => Number(r[firstNumCol] ?? 0));
    const maxVal = Math.max(...vals, 1);
    return result.rows.slice(0, 10).map((r, i) => ({
      label: String(r[result.columns[0] ?? ''] ?? `R${i + 1}`).slice(0, 5),
      value: (Number(r[firstNumCol] ?? 0) / maxVal) * 100,
    }));
  })();

  const presetLabel = DATE_PRESETS.find((p) => p.preset === preset)?.label ?? preset;
  const groupLabel  = groupBy !== 'none' ? `Grouped by ${groupBy}` : null;

  return (
    <motion.div
      variants={PREVIEW_V} initial="hidden" animate="visible" exit="exit"
      key={`${typeItem?.key ?? 'empty'}-${groupBy}-${compare}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {typeItem && (() => { const Icon = typeIcon(typeItem.key); return (
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}22`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={color} strokeWidth={2} />
            </div>
          ); })()}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{typeItem?.label ?? 'No type selected'}</div>
            <div style={{ fontSize: 11, color: T.faint }}>{typeItem?.description ?? ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {groupLabel && (
            <span style={{ padding: '3px 9px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: T.warningDim, border: `1px solid ${T.warning}33`, color: T.warning }}>
              {groupLabel}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', fontSize: 11, color: T.dim, fontWeight: 600 }}>
            <Calendar size={11} />
            {presetLabel}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4].map((n) => (
            <div key={n} style={{ height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </motion.div>
      )}

      {/* KPI tiles from real summary */}
      {!isPending && result && result.summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(result.summary.length, 4)}, 1fr)`, gap: 10 }}>
          {result.summary.map((s) => (
            <KpiTile key={s.label} label={s.label} value={s.value} delta_pct={compare ? s.delta_pct : null} hasMoney={typeItem?.has_money_metric ?? false} />
          ))}
        </div>
      )}

      {/* Estimated rows */}
      {!isPending && result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 10, color: T.faint }}>
          <FileText size={10} />
          <span>Est. output:</span>
          <EstRowCounter target={result.estimated_rows} />
          <span>rows · {result.columns.length} cols</span>
        </div>
      )}

      {/* Chart/table view */}
      {!isPending && result && (
        <AnimatePresence mode="wait">
          {chartView === 'Table' && (
            <motion.div key={`table-${groupBy}`} variants={PREVIEW_V} initial="hidden" animate="visible" exit="exit"
              style={{ borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(result.columns.length, 4)}, 1fr)`, padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {result.columns.slice(0, 4).map((h) => (
                  <span key={h} style={{ ...MICRO, fontSize: 9 }}>{h.replace(/_/g, ' ')}</span>
                ))}
              </div>
              <AnimatePresence mode="popLayout">
                {result.rows.slice(0, 6).map((row, i) => (
                  <motion.div key={i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 240, damping: 24 }}
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(result.columns.length, 4)}, 1fr)`, padding: '7px 14px', borderBottom: i < Math.min(result.rows.length, 6) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}
                  >
                    {result.columns.slice(0, 4).map((col) => {
                      const val = String(row[col] ?? '—');
                      const isChange = col.includes('pct') || col.includes('change') || col.includes('%');
                      return (
                        <span key={col} style={{ fontSize: 12, color: isChange && val.startsWith('+') ? T.success : isChange && val.startsWith('-') ? T.danger : col === result.columns[0] ? T.dim : T.text, fontWeight: col === result.columns[0] ? 500 : 700, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {val}
                        </span>
                      );
                    })}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {chartView === 'Bar' && bars.length > 0 && (
            <motion.div key={`bar-${typeItem?.key ?? 'empty'}`} variants={PREVIEW_V} initial="hidden" animate="visible" exit="exit"
              style={{ borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 10px 4px', height: 120, display: 'flex', alignItems: 'stretch' }}
            >
              <MiniBarChart bars={bars} color={color} typeKey={`${typeItem?.key ?? 'empty'}-live`} />
            </motion.div>
          )}

          {chartView === 'Line' && bars.length > 0 && (
            <motion.div key={`line-${typeItem?.key ?? 'empty'}`} variants={PREVIEW_V} initial="hidden" animate="visible" exit="exit"
              style={{ borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 10px 4px', height: 120, display: 'flex', alignItems: 'stretch' }}
            >
              <MiniLineChart bars={bars} color={color} typeKey={typeItem?.key ?? 'empty'} />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Empty state */}
      {!isPending && !result && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: 40 }}>
          <Eye size={32} color={T.faint} />
          <div style={{ fontSize: 13, color: T.faint, textAlign: 'center' }}>
            {typeItem ? 'Press Generate to preview live data' : 'Select a report type to begin'}
          </div>
        </div>
      )}

      {/* Watermark */}
      {!isPending && result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', fontSize: 10, color: T.faint }}>
          <Eye size={10} />
          Live data from {fmtDate(new Date().toISOString())} — actual export includes all rows
        </div>
      )}
    </motion.div>
  );
}

// ─── Generate button ──────────────────────────────────────────────────────────

type GenState = 'idle' | 'generating' | 'done';

function GenerateButton({ state, onClick }: { state: GenState; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={state !== 'idle'}
      whileHover={state === 'idle' ? { scale: 1.04, y: -1 } : {}}
      whileTap={state === 'idle' ? { scale: 0.97 } : {}}
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '13px 28px', borderRadius: 12,
        background: state === 'done'
          ? T.successDim
          : `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
        border: state === 'done' ? `1px solid ${T.success}55` : '1px solid rgba(255,255,255,0.15)',
        color: state === 'done' ? T.success : '#fff',
        fontSize: 14, fontWeight: 700,
        cursor: state === 'idle' ? 'pointer' : 'default',
        transition: 'background 0.3s, color 0.3s, border-color 0.3s',
        minWidth: 180,
      }}
    >
      {state === 'generating' && (
        <motion.div
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(255,255,255,0.18)', originX: 0, borderRadius: 'inherit' }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.span key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.18 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Play size={14} />Generate Report
            </motion.span>
          )}
          {state === 'generating' && (
            <motion.span key="gen" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.18 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}>
                <RefreshCw size={14} />
              </motion.span>
              Generating…
            </motion.span>
          )}
          {state === 'done' && (
            <motion.span key="done" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} />Report Ready!
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

// ─── Toggle option ────────────────────────────────────────────────────────────

function ToggleOption({ label, checked, onChange, color = T.accent }: { label: string; checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: T.dim }}>{label}</span>
      <motion.button
        onClick={() => onChange(!checked)}
        whileTap={{ scale: 0.9 }}
        style={{ width: 38, height: 20, borderRadius: 10, background: checked ? color : 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0 }}
      >
        <motion.div animate={{ x: checked ? 18 : 2 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
      </motion.button>
    </div>
  );
}

// ─── Step heading ─────────────────────────────────────────────────────────────

function StepHeading({ step, icon: Icon, label }: { step: number | string; icon?: typeof Eye; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, background: T.accentDim, border: `1px solid ${T.accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: T.accent, flexShrink: 0 }}>
        {step}
      </div>
      {Icon && <Icon size={13} color={T.faint} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{label}</span>
    </div>
  );
}

// ─── Schedule row ─────────────────────────────────────────────────────────────

interface ScheduleRowProps {
  schedule:  ReportScheduleOut;
  onToggle:  (id: string, enabled: boolean) => void;
  onDelete:  (id: string) => void;
  isToggling: boolean;
  isDeleting: boolean;
}

function ScheduleRow({ schedule, onToggle, onDelete, isToggling, isDeleting }: ScheduleRowProps) {
  const { date: fmtDate } = useLocaleFormat();
  const color = typeColor(schedule.report_type);
  const fmtMeta = FORMAT_META[schedule.format as UIFormat] ?? FORMAT_META.csv;
  const FmtIcon = fmtMeta.icon;

  return (
    <motion.div layout variants={EXPORT_ROW_V} initial="hidden" animate="visible" exit="exit"
      style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 90px auto', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      {/* Type icon */}
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {(() => { const Icon = typeIcon(schedule.report_type); return <Icon size={13} color={color} strokeWidth={2.2} />; })()}
      </div>

      {/* Name + type */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{schedule.name}</div>
        <div style={{ fontSize: 10, color: T.faint }}>{schedule.report_type.replace(/_/g, ' ')}</div>
      </div>

      {/* Format */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, background: fmtMeta.bg, border: `1px solid ${fmtMeta.color}33`, color: fmtMeta.color, fontSize: 10, fontWeight: 700 }}>
        <FmtIcon size={9} />{fmtMeta.label}
      </span>

      {/* Cadence */}
      <span style={{ fontSize: 11, color: T.dim, fontWeight: 600 }}>
        {CADENCE_LABELS[schedule.cadence as UICadence] ?? schedule.cadence}
      </span>

      {/* Next run */}
      <span style={{ fontSize: 11, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
        {schedule.next_run_at ? fmtDate(schedule.next_run_at) : '—'}
      </span>

      {/* Enabled badge */}
      <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: schedule.enabled ? T.successDim : 'rgba(255,255,255,0.06)', border: `1px solid ${schedule.enabled ? T.success : 'rgba(255,255,255,0.12)'}33`, color: schedule.enabled ? T.success : T.faint }}>
        {schedule.enabled ? 'Active' : 'Paused'}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <motion.button whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.92 }}
          onClick={() => onToggle(schedule.id, !schedule.enabled)}
          disabled={isToggling}
          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: schedule.enabled ? T.success : T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title={schedule.enabled ? 'Pause' : 'Activate'}
        >
          {schedule.enabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </motion.button>
        <motion.button whileHover={{ scale: 1.18, color: T.danger }} whileTap={{ scale: 0.92 }}
          onClick={() => onDelete(schedule.id)}
          disabled={isDeleting}
          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title="Delete schedule"
        >
          <Trash2 size={12} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface LocalToast { id: string; msg: string; color: string; icon: ReactNode }
let _toastId = 0;

// ─── CSV export columns (scheduled reports list) ─────────────────────────────

const REPORTS_EXPORT_COLUMNS: CsvColumn<ReportScheduleOut>[] = [
  { header: 'Name',        value: (r) => r.name },
  { header: 'Report Type', value: (r) => r.report_type },
  { header: 'Cadence',     value: (r) => r.cadence },
  { header: 'Format',      value: (r) => r.format },
  { header: 'Recipients',  value: (r) => r.recipients.join('; ') },
  { header: 'Enabled',     value: (r) => (r.enabled ? 'yes' : 'no') },
  { header: 'Last Run',    value: (r) => r.last_run_at ?? '' },
  { header: 'Next Run',    value: (r) => r.next_run_at ?? '' },
  { header: 'Created At',  value: (r) => r.created_at },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminReportsPage() {
  const { date: fmtDate } = useLocaleFormat();

  // ── Server state ──────────────────────────────────────────────────────────
  const { data: reportTypes = [], isLoading: typesLoading } = useAdminReportTypes();
  const { data: schedules = [] } = useReportSchedules();
  const generateMut   = useGenerateReport();
  const exportMut     = useExportReport();
  const createSchedMut  = useCreateReportSchedule();
  const updateSchedMut  = useUpdateReportSchedule();
  const deleteSchedMut  = useDeleteReportSchedule();

  // ── Builder state ─────────────────────────────────────────────────────────
  const [selectedTypeKey, setSelectedTypeKey] = useState<string>('');
  const [selectedPreset,  setSelectedPreset]  = useState<string>('30d');
  const [selectedFormat,  setSelectedFormat]  = useState<UIFormat>('csv');
  const [genState,        setGenState]        = useState<GenState>('idle');
  const [liveResult,      setLiveResult]      = useState<GenerateResult | null>(null);

  // Options
  const [optCharts,    setOptCharts]    = useState(true);
  const [optSummary,   setOptSummary]   = useState(true);
  const [optRawRows,   setOptRawRows]   = useState(false);
  const [optWorkspace, setOptWorkspace] = useState(true);

  // Columns
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());

  // Segmentation
  const [filterPlans,  setFilterPlans]  = useState<Set<string>>(new Set(ALL_PLANS));
  const [filterRegion, setFilterRegion] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Group by / compare
  const [groupBy,      setGroupBy]      = useState<GroupBy>('none');
  const [comparePrev,  setComparePrev]  = useState(false);

  // Chart view
  const [chartView, setChartView] = useState<ChartViewType>('Table');

  // Delivery / schedule
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients,     setRecipients]     = useState<string[]>([]);
  const [scheduleOn,     setScheduleOn]     = useState(false);
  const [cadence,        setCadence]        = useState<UICadence>('weekly');
  const [schedName,      setSchedName]      = useState('');

  // Save-as-template (session-local only — no backend endpoint)
  const [templateName,  setTemplateName]  = useState('');
  const [templates,     setTemplates]     = useState<{ id: string; name: string; typeKey: string }[]>([]);

  // Session-local recent exports (no backend history endpoint)
  const [sessionExports, setSessionExports] = useState<SessionExportRow[]>([]);
  const [newExportIds,   setNewExportIds]   = useState<Set<string>>(new Set());

  // Local toasts (supplement AppToast for non-error feedback)
  const [localToasts, setLocalToasts]   = useState<LocalToast[]>([]);

  const genTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  // Sync default cols when type changes
  useEffect(() => {
    if (!selectedTypeKey) return;
    const found = reportTypes.find((t) => t.key === selectedTypeKey);
    if (found) setSelectedCols(new Set(found.default_columns));
  }, [selectedTypeKey, reportTypes]);

  // Auto-select first type once loaded
  useEffect(() => {
    if (reportTypes.length > 0 && !selectedTypeKey) {
      setSelectedTypeKey(reportTypes[0]?.key ?? '');
    }
  }, [reportTypes, selectedTypeKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (genTimerRef.current) clearTimeout(genTimerRef.current);
      toastTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const showLocalToast = useCallback((msg: string, color: string, icon: ReactNode) => {
    const id = String(++_toastId);
    setLocalToasts((prev) => [...prev, { id, msg, color, icon }]);
    const t = window.setTimeout(() => {
      setLocalToasts((prev) => prev.filter((x) => x.id !== id));
      toastTimersRef.current.delete(id);
    }, 3800) as unknown as number;
    toastTimersRef.current.set(id, t);
  }, []);

  const activeType = reportTypes.find((t) => t.key === selectedTypeKey) ?? null;
  const activeCols = activeType?.available_columns ?? [];

  // Build generate request from current state
  const buildGenerateRequest = useCallback(() => ({
    type:            selectedTypeKey,
    preset:          selectedPreset,
    plan_filter:     filterPlans.size < ALL_PLANS.length ? Array.from(filterPlans) : [],
    region_filter:   filterRegion !== 'All' ? [filterRegion] : [],
    status_filter:   filterStatus !== 'All' ? [filterStatus] : [],
    group_by:        groupBy,
    columns:         selectedCols.size > 0 ? Array.from(selectedCols) : [],
    compare_previous: comparePrev,
  }), [selectedTypeKey, selectedPreset, filterPlans, filterRegion, filterStatus, groupBy, selectedCols, comparePrev]);

  const handleGenerate = useCallback(() => {
    if (genState !== 'idle' || !selectedTypeKey) return;
    setGenState('generating');
    setLiveResult(null);
    generateMut.mutate(buildGenerateRequest(), {
      onSuccess: (result) => {
        setLiveResult(result);
        setGenState('done');
        showLocalToast(`${activeType?.label ?? 'Report'} data loaded`, T.success, <CheckCircle2 size={14} />);
        genTimerRef.current = setTimeout(() => setGenState('idle'), 2500);
      },
      onError: (err) => {
        setGenState('idle');
        toast.error(extractErrorMessage(err, 'Failed to generate report'));
      },
    });
  }, [genState, selectedTypeKey, buildGenerateRequest, generateMut, activeType, showLocalToast]);

  const handleDownload = useCallback(() => {
    if (!selectedTypeKey) return;
    const body = {
      type:          selectedTypeKey,
      preset:        selectedPreset,
      plan_filter:   filterPlans.size < ALL_PLANS.length ? Array.from(filterPlans) : [],
      region_filter: filterRegion !== 'All' ? [filterRegion] : [],
      status_filter: filterStatus !== 'All' ? [filterStatus] : [],
      group_by:      groupBy,
      columns:       selectedCols.size > 0 ? Array.from(selectedCols) : [],
      format:        selectedFormat as ExportFormat,
    };
    exportMut.mutate(body, {
      onSuccess: () => {
        // Append to session-local export history
        const row: SessionExportRow = {
          id:        `exp-${Date.now()}`,
          typeKey:   selectedTypeKey,
          typeLabel: activeType?.label ?? selectedTypeKey,
          format:    selectedFormat,
          createdAt: new Date().toISOString(),
        };
        setSessionExports((prev) => [row, ...prev]);
        setNewExportIds((prev) => new Set([...prev, row.id]));
        showLocalToast(`${activeType?.label ?? 'Report'} downloaded as ${selectedFormat.toUpperCase()}`, T.success, <Download size={14} />);
      },
      onError: (err) => {
        // 501 is already handled inside useExportReport with a toast; swallow here
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status !== 501) {
          toast.error(extractErrorMessage(err, 'Export failed'));
        }
      },
    });
  }, [selectedTypeKey, selectedPreset, filterPlans, filterRegion, filterStatus, groupBy, selectedCols, selectedFormat, exportMut, activeType, showLocalToast]);

  const handleAddRecipient = useCallback(() => {
    const v = recipientInput.trim();
    if (!v) return;
    if (!recipients.includes(v)) setRecipients((prev) => [...prev, v]);
    setRecipientInput('');
  }, [recipientInput, recipients]);

  const handleRecipientKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddRecipient();
  }, [handleAddRecipient]);

  const handleCreateSchedule = useCallback(() => {
    if (!selectedTypeKey || recipients.length === 0) {
      toast.error('Select a report type and add at least one recipient before scheduling.');
      return;
    }
    const name = schedName.trim() || `${activeType?.label ?? selectedTypeKey} — ${cadence}`;
    createSchedMut.mutate({
      name,
      report_type: selectedTypeKey,
      cadence,
      recipients,
      format: selectedFormat as ExportFormat,
      filters: {
        preset: selectedPreset,
        plan_filter:   filterPlans.size < ALL_PLANS.length ? Array.from(filterPlans) : [],
        region_filter: filterRegion !== 'All' ? [filterRegion] : [],
        status_filter: filterStatus !== 'All' ? [filterStatus] : [],
        group_by: groupBy,
        columns:  Array.from(selectedCols),
      },
      enabled: true,
    }, {
      onSuccess: () => {
        showLocalToast(`Schedule "${name}" created`, T.success, <Repeat size={14} />);
        setSchedName('');
        setScheduleOn(false);
      },
      onError: (err) => toast.error(extractErrorMessage(err, 'Failed to create schedule')),
    });
  }, [selectedTypeKey, recipients, schedName, activeType, cadence, createSchedMut, selectedFormat, selectedPreset, filterPlans, filterRegion, filterStatus, groupBy, selectedCols, showLocalToast]);

  const handleToggleSchedule = useCallback((id: string, enabled: boolean) => {
    updateSchedMut.mutate({ id, payload: { enabled } }, {
      onError: (err) => toast.error(extractErrorMessage(err, 'Failed to update schedule')),
    });
  }, [updateSchedMut]);

  const handleDeleteSchedule = useCallback((id: string) => {
    deleteSchedMut.mutate(id, {
      onSuccess: () => showLocalToast('Schedule deleted', T.danger, <Trash2 size={14} />),
      onError: (err) => toast.error(extractErrorMessage(err, 'Failed to delete schedule')),
    });
  }, [deleteSchedMut, showLocalToast]);

  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name || !selectedTypeKey) return;
    setTemplates((prev) => [{ id: `tpl-${Date.now()}`, name, typeKey: selectedTypeKey }, ...prev]);
    setTemplateName('');
    showLocalToast(`Template "${name}" saved (session only)`, T.success, <Bookmark size={14} />);
  }, [templateName, selectedTypeKey, showLocalToast]);

  const handleDeleteSessionExport = useCallback((id: string) => {
    setSessionExports((prev) => prev.filter((e) => e.id !== id));
    showLocalToast('Removed from session history', T.danger, <Trash2 size={14} />);
  }, [showLocalToast]);

  const toggleCol = useCallback((colId: string) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) { if (next.size > 1) next.delete(colId); }
      else next.add(colId);
      return next;
    });
  }, []);

  const togglePlan = useCallback((plan: string) => {
    setFilterPlans((prev) => {
      const next = new Set(prev);
      if (next.has(plan)) { if (next.size > 1) next.delete(plan); }
      else next.add(plan);
      return next;
    });
  }, []);

  // Active filter chips for display
  const activeFilterChips: { label: string; onRemove: () => void }[] = [];
  if (filterPlans.size < ALL_PLANS.length) {
    for (const p of filterPlans) {
      activeFilterChips.push({ label: `Plan: ${p}`, onRemove: () => togglePlan(p) });
    }
  }
  if (filterRegion !== 'All') {
    activeFilterChips.push({ label: `Region: ${filterRegion}`, onRemove: () => setFilterRegion('All') });
  }
  if (filterStatus !== 'All') {
    activeFilterChips.push({ label: 'Active only', onRemove: () => setFilterStatus('All') });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: T.text, fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif', padding: '28px 28px 48px', position: 'relative', boxSizing: 'border-box' }}>
      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 800, height: 360, background: `radial-gradient(ellipse 70% 50% at 50% 0%, rgba(242,101,34,0.10) 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

      <motion.div variants={CONTAINER_V} initial="hidden" animate="visible" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Page header ── */}
        <motion.div variants={CARD_V} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <motion.div
              style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 24px ${T.accent}40` }}
              animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BarChart2 size={22} color="#fff" />
            </motion.div>
            <div>
              <div style={MICRO}>Admin · Reports</div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: T.text, lineHeight: 1.2, marginTop: 2 }}>
                Report Studio
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ExportButton
              rows={schedules}
              columns={REPORTS_EXPORT_COLUMNS}
              filename={`reports-${exportStamp()}`}
              disabled={schedules.length === 0}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: T.successDim, border: `1px solid ${T.success}33`, fontSize: 11, fontWeight: 700, color: T.success }}>
              <Sparkles size={12} />
              Platform-wide · Super Admin
            </div>
          </div>
        </motion.div>

        {/* ── Main builder grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 18, alignItems: 'start' }}>

          {/* ── Left: builder panel ── */}
          <motion.div variants={CARD_V} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Step 1: Report type */}
            <div style={glass({ padding: '18px 18px' })}>
              <StepHeading step="1" label="Report Type" />
              {typesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[1,2,3].map((n) => <div key={n} style={{ height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }} />)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {reportTypes.map((rt) => {
                    const isActive = rt.key === selectedTypeKey;
                    const color    = typeColor(rt.key);
                    const Icon     = typeIcon(rt.key);
                    return (
                      <motion.button key={rt.key} onClick={() => { setSelectedTypeKey(rt.key); setLiveResult(null); setGenState('idle'); }}
                        whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: isActive ? `${color}18` : 'transparent', border: isActive ? `1px solid ${color}44` : '1px solid transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.18s, border-color 0.18s', position: 'relative', overflow: 'hidden' }}
                      >
                        {isActive && (
                          <motion.div layoutId="type-glow" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', background: `radial-gradient(ellipse 60% 80% at 0% 50%, ${color}18 0%, transparent 65%)` }} />
                        )}
                        <div style={{ width: 28, height: 28, borderRadius: 8, position: 'relative', zIndex: 1, background: isActive ? `${color}28` : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={14} color={isActive ? color : T.faint} strokeWidth={2.2} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? color : T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rt.label}
                          </div>
                          {isActive && (
                            <div style={{ fontSize: 10, color: T.faint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rt.description}
                            </div>
                          )}
                        </div>
                        {isActive && (
                          <motion.div layoutId="type-tick" style={{ width: 16, height: 16, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
                            <CheckCircle2 size={10} color="#fff" strokeWidth={3} />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Date range */}
            <div style={glass({ padding: '18px 18px' })}>
              <StepHeading step="2" icon={Calendar} label="Date Range" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {DATE_PRESETS.map((dp) => {
                  const isActive = dp.preset === selectedPreset;
                  return (
                    <motion.button key={dp.id} onClick={() => setSelectedPreset(dp.preset)}
                      whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 9, background: isActive ? T.accentDim : 'transparent', border: isActive ? `1px solid ${T.accent}44` : '1px solid transparent', cursor: 'pointer', transition: 'background 0.18s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={12} color={isActive ? T.accentHi : T.faint} strokeWidth={2.2} />
                        <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? T.accentHi : T.dim }}>{dp.label}</span>
                      </div>
                      <span style={{ fontSize: 10, color: T.faint }}>{dp.preset.toUpperCase()}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Format */}
            <div style={glass({ padding: '18px 18px' })}>
              <StepHeading step="3" label="Export Format" />
              <div style={{ display: 'flex', gap: 8 }}>
                {(['csv', 'pdf', 'xlsx'] as UIFormat[]).map((fmt) => {
                  const isActive = fmt === selectedFormat;
                  const meta = FORMAT_META[fmt];
                  const FmtIcon = meta.icon;
                  return (
                    <motion.button key={fmt} onClick={() => setSelectedFormat(fmt)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 10, background: isActive ? meta.bg : 'rgba(255,255,255,0.04)', border: isActive ? `1px solid ${meta.color}44` : '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'background 0.18s, border-color 0.18s' }}
                    >
                      {isActive && <motion.div layoutId="format-underline" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: meta.color, borderRadius: '2px 2px 0 0' }} />}
                      <FmtIcon size={18} color={isActive ? meta.color : T.faint} strokeWidth={2} />
                      <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? meta.color : T.faint, letterSpacing: '0.06em' }}>{meta.label}</span>
                    </motion.button>
                  );
                })}
              </div>
              {(selectedFormat === 'pdf' || selectedFormat === 'xlsx') && (
                <div style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, background: T.warningDim, border: `1px solid ${T.warning}22`, fontSize: 10, color: T.warning }}>
                  {selectedFormat.toUpperCase()} requires server-side deps (reportlab / openpyxl). If unavailable, a hint will appear.
                </div>
              )}
            </div>

            {/* Step 4: Columns / metrics */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="4" icon={LayoutGrid} label="Columns / Metrics" />
              {activeCols.length === 0 ? (
                <div style={{ fontSize: 11, color: T.faint }}>Select a report type to choose columns.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeCols.map((col) => {
                    const isOn = selectedCols.has(col);
                    return (
                      <motion.button key={col} onClick={() => toggleCol(col)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        style={{ padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)', border: isOn ? `1px solid ${T.accent}44` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.accentHi : T.faint, transition: 'background 0.15s, border-color 0.15s, color 0.15s' }}
                      >
                        {col.replace(/_/g, ' ')}
                      </motion.button>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: T.faint }}>
                {selectedCols.size} of {activeCols.length} columns selected
              </div>
            </motion.div>

            {/* Step 5: Segmentation filters */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="5" icon={Filter} label="Segmentation Filters" />

              {/* Plan */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Plan</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ALL_PLANS.map((plan) => {
                    const isOn = filterPlans.has(plan);
                    return (
                      <motion.button key={plan} onClick={() => togglePlan(plan)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        style={{ padding: '3px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: isOn ? T.successDim : 'rgba(255,255,255,0.04)', border: isOn ? `1px solid ${T.success}44` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.success : T.faint, transition: 'all 0.15s' }}
                      >
                        {plan}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Region */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Region</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {(['India', 'International', 'All'] as const).map((r) => {
                    const isOn = filterRegion === r;
                    return (
                      <motion.button key={r} onClick={() => setFilterRegion(r)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        style={{ padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: isOn ? T.warningDim : 'rgba(255,255,255,0.04)', border: isOn ? `1px solid ${T.warning}44` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.warning : T.faint, transition: 'all 0.15s' }}
                      >
                        {r}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Status</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {(['Active', 'All'] as const).map((s) => {
                    const isOn = filterStatus === s;
                    return (
                      <motion.button key={s} onClick={() => setFilterStatus(s)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        style={{ padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600, background: isOn ? T.amberDim : 'rgba(255,255,255,0.04)', border: isOn ? `1px solid ${T.amber}44` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.amber : T.faint, transition: 'all 0.15s' }}
                      >
                        {s}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Active filter chips */}
              <AnimatePresence>
                {activeFilterChips.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {activeFilterChips.map((chip) => (
                        <motion.span key={chip.label} variants={CHIP_V} initial="hidden" animate="visible" exit="exit"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 10, fontWeight: 600, color: T.dim }}
                        >
                          {chip.label}
                          <motion.button onClick={chip.onRemove} whileHover={{ scale: 1.3, color: T.danger }} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}>
                            <X size={9} />
                          </motion.button>
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Step 6: Group by */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="6" icon={ChevronDown} label="Group By" />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {GROUP_BY_OPTIONS.map((opt) => {
                  const isOn = groupBy === opt.value;
                  return (
                    <motion.button key={opt.value} onClick={() => setGroupBy(opt.value)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} layout
                      style={{ padding: '5px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)', border: isOn ? `1px solid ${T.accent}55` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.accentHi : T.faint, transition: 'all 0.15s' }}
                    >
                      {opt.label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* Step 7: Options */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="7" icon={SlidersHorizontal} label="Options" />
              <ToggleOption label="Include charts"             checked={optCharts}    onChange={setOptCharts}    color={T.accent} />
              <ToggleOption label="Executive summary"          checked={optSummary}   onChange={setOptSummary}   color={T.accentHi} />
              <ToggleOption label="Include raw data rows"      checked={optRawRows}   onChange={setOptRawRows}   color={T.warning} />
              <ToggleOption label="Per-workspace breakdown"    checked={optWorkspace} onChange={setOptWorkspace} color={T.success} />
              <ToggleOption label="Compare to previous period" checked={comparePrev}  onChange={setComparePrev}  color={T.amber} />
            </motion.div>

            {/* Step 8: Delivery & automation */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="8" icon={Send} label="Delivery & Automation" />

              {/* Email recipients */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Email Recipients</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  <AnimatePresence>
                    {recipients.map((r) => (
                      <motion.span key={r} variants={CHIP_V} initial="hidden" animate="visible" exit="exit"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accent}33`, fontSize: 10, fontWeight: 600, color: T.accentHi }}
                      >
                        {r}
                        <motion.button onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))} whileHover={{ scale: 1.3, color: T.danger }} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}>
                          <X size={9} />
                        </motion.button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="email" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} onKeyDown={handleRecipientKeyDown} placeholder="Add email…"
                    style={{ flex: 1, padding: '7px 12px', borderRadius: 9, fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: T.text, outline: 'none' }}
                  />
                  <motion.button onClick={handleAddRecipient} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                    style={{ padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12, background: T.accentDim, border: `1px solid ${T.accent}44`, color: T.accentHi, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
                  >
                    <Plus size={13} />Add
                  </motion.button>
                </div>
              </div>

              {/* Save as template (session-local) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Save as Template <span style={{ color: T.faint, fontSize: 8, fontWeight: 400 }}>(session only)</span></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name…"
                    style={{ flex: 1, padding: '7px 12px', borderRadius: 9, fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: T.text, outline: 'none' }}
                  />
                  <motion.button onClick={handleSaveTemplate} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
                    style={{ padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12, background: T.successDim, border: `1px solid ${T.success}44`, color: T.success, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
                  >
                    <Bookmark size={13} />Save
                  </motion.button>
                </div>
                <AnimatePresence>
                  {templates.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {templates.map((tpl) => {
                          const TplIcon = typeIcon(tpl.typeKey);
                          return (
                            <motion.span key={tpl.id} variants={CHIP_V} initial="hidden" animate="visible" exit="exit"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: T.successDim, border: `1px solid ${T.success}33`, fontSize: 10, fontWeight: 600, color: T.success }}
                            >
                              <TplIcon size={9} />{tpl.name}
                              <motion.button onClick={() => setTemplates((prev) => prev.filter((t) => t.id !== tpl.id))} whileHover={{ scale: 1.3, color: T.danger }} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}>
                                <X size={9} />
                              </motion.button>
                            </motion.span>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Schedule (real persistent) */}
              <div>
                <ToggleOption label="Schedule recurring report (persisted)" checked={scheduleOn} onChange={setScheduleOn} color={T.accent} />
                <AnimatePresence>
                  {scheduleOn && (
                    <motion.div key="schedule-controls" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                      <div style={{ paddingTop: 10 }}>
                        <input type="text" value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="Schedule name (optional)…"
                          style={{ width: '100%', marginBottom: 8, padding: '7px 12px', borderRadius: 9, fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: T.text, outline: 'none', boxSizing: 'border-box' }}
                        />
                        <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Sending pace</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['daily', 'weekly', 'monthly'] as UICadence[]).map((c) => {
                            const isOn = cadence === c;
                            return (
                              <motion.button key={c} onClick={() => setCadence(c)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                style={{ flex: 1, padding: '6px 0', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)', border: isOn ? `1px solid ${T.accent}55` : '1px solid rgba(255,255,255,0.08)', color: isOn ? T.accentHi : T.faint, transition: 'all 0.15s' }}
                              >
                                {CADENCE_LABELS[c]}
                              </motion.button>
                            );
                          })}
                        </div>
                        <motion.button
                          onClick={handleCreateSchedule}
                          disabled={createSchedMut.isPending}
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                          style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: T.accentDim, border: `1px solid ${T.accent}44`, color: T.accentHi, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <Repeat size={13} />
                          {createSchedMut.isPending ? 'Creating…' : 'Create Schedule'}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Generate button */}
            <GenerateButton state={genState} onClick={handleGenerate} />

            {/* Download button */}
            <motion.button
              onClick={handleDownload}
              disabled={exportMut.isPending || !selectedTypeKey}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 28px', borderRadius: 12, background: FORMAT_META[selectedFormat].bg, border: `1px solid ${FORMAT_META[selectedFormat].color}44`, color: FORMAT_META[selectedFormat].color, fontSize: 13, fontWeight: 700, cursor: !selectedTypeKey ? 'not-allowed' : 'pointer', opacity: !selectedTypeKey ? 0.5 : 1 }}
            >
              {exportMut.isPending ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}><RefreshCw size={14} /></motion.span> : <Download size={14} />}
              {exportMut.isPending ? 'Exporting…' : `Download ${FORMAT_META[selectedFormat].label}`}
            </motion.button>

            {/* Config summary */}
            <AnimatePresence>
              {genState === 'idle' && selectedTypeKey && (
                <motion.div key="cfg-summary" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                  <div style={{ ...glassDeep(), padding: '11px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ ...MICRO, fontSize: 9 }}>Selected:</span>
                    <span style={{ fontSize: 10, color: typeColor(selectedTypeKey), fontWeight: 700 }}>{activeType?.label ?? selectedTypeKey}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: T.dim }}>{DATE_PRESETS.find((p) => p.preset === selectedPreset)?.label ?? selectedPreset}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: FORMAT_META[selectedFormat].color, fontWeight: 700 }}>{FORMAT_META[selectedFormat].label}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: T.dim }}>{selectedCols.size} cols</span>
                    {groupBy !== 'none' && (
                      <>
                        <span style={{ fontSize: 10, color: T.faint }}>·</span>
                        <span style={{ fontSize: 10, color: T.warning, fontWeight: 700 }}>By {groupBy}</span>
                      </>
                    )}
                    {comparePrev && (
                      <>
                        <span style={{ fontSize: 10, color: T.faint }}>·</span>
                        <span style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>Compare</span>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Right: live preview panel ── */}
          <motion.div variants={CARD_V} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Live preview card */}
            <div style={glass({ padding: '22px 22px', minHeight: 400, display: 'flex', flexDirection: 'column' })}>
              {/* Preview header + chart-type toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <Eye size={14} color={T.accentHi} strokeWidth={2.2} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Live Preview</span>

                {/* Chart-type toggle */}
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: 3 }}>
                  {([{ id: 'Table', icon: Table }, { id: 'Bar', icon: BarChart2 }, { id: 'Line', icon: LineChart }] as { id: ChartViewType; icon: typeof Table }[]).map(({ id: viewId, icon: ViewIcon }) => {
                    const isActive = chartView === viewId;
                    return (
                      <motion.button key={viewId} onClick={() => setChartView(viewId)} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, background: isActive ? T.accentDim : 'transparent', border: isActive ? `1px solid ${T.accent}44` : '1px solid transparent', color: isActive ? T.accentHi : T.faint, fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}
                      >
                        <ViewIcon size={12} />{viewId}
                      </motion.button>
                    );
                  })}
                </div>

                {liveResult && <span style={{ fontSize: 10, color: T.success, fontWeight: 600 }}>Live data</span>}
                {!liveResult && <span style={{ fontSize: 10, color: T.faint }}>Press Generate</span>}
              </div>

              <div style={{ flex: 1 }}>
                <AnimatePresence mode="wait">
                  <LivePreview
                    key={`${selectedTypeKey}-${chartView}`}
                    typeItem={activeType}
                    result={liveResult}
                    isPending={generateMut.isPending}
                    preset={selectedPreset}
                    chartView={chartView}
                    groupBy={groupBy}
                    compare={comparePrev}
                  />
                </AnimatePresence>
              </div>
            </div>

            {/* Options summary bar */}
            <div style={{ ...glassDeep(), padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <span style={{ ...MICRO, fontSize: 9 }}>Will include:</span>
              {[
                { on: optCharts,    label: 'Charts',        color: T.accent },
                { on: optSummary,   label: 'Exec Summary',  color: T.accentHi },
                { on: optRawRows,   label: 'Raw Rows',      color: T.warning },
                { on: optWorkspace, label: 'Per-Workspace', color: T.success },
                { on: comparePrev,  label: 'Δ% Compare',    color: T.amber },
                { on: scheduleOn,   label: `Sched. ${CADENCE_LABELS[cadence]}`, color: T.accentHi },
              ].map((o) => (
                <AnimatePresence key={o.label}>
                  {o.on && (
                    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: `${o.color}14`, border: `1px solid ${o.color}33`, fontSize: 10, fontWeight: 700, color: o.color }}
                    >
                      <CheckCircle2 size={9} />{o.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              ))}
              {!optCharts && !optSummary && !optRawRows && !optWorkspace && (
                <span style={{ fontSize: 10, color: T.faint }}>
                  <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  No options selected — report will include base data only
                </span>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Scheduled Reports ── */}
        <motion.div variants={CARD_V}>
          <div style={glass({ padding: '0', overflow: 'hidden' })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Repeat size={14} color={T.accentHi} strokeWidth={2.2} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Scheduled Reports</span>
                <span style={{ padding: '2px 9px', borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accent}33`, fontSize: 10, fontWeight: 800, color: T.accentHi }}>
                  {schedules.length}
                </span>
              </div>
              <span style={{ fontSize: 11, color: T.faint }}>Persisted · toggle to pause · delete to remove</span>
            </div>

            {schedules.length === 0 ? (
              <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 12, color: T.faint }}>
                No schedules yet — configure the delivery panel and create one.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 90px 90px auto', gap: 10, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['', 'Schedule', 'Format', 'Sending pace', 'Next run', 'Status', 'Actions'].map((h, i) => (
                    <span key={i} style={{ ...MICRO, fontSize: 9 }}>{h}</span>
                  ))}
                </div>
                <motion.div style={{ display: 'flex', flexDirection: 'column' }}>
                  <AnimatePresence mode="popLayout">
                    {schedules.map((sched) => (
                      <ScheduleRow
                        key={sched.id}
                        schedule={sched}
                        onToggle={handleToggleSchedule}
                        onDelete={handleDeleteSchedule}
                        isToggling={updateSchedMut.isPending}
                        isDeleting={deleteSchedMut.isPending}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </>
            )}
          </div>
        </motion.div>

        {/* ── Session-local Recent Exports ── */}
        {sessionExports.length > 0 && (
          <motion.div variants={CARD_V}>
            <div style={glass({ padding: '0', overflow: 'hidden' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={14} color={T.accentHi} strokeWidth={2.2} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>This Session's Exports</span>
                  <span style={{ padding: '2px 9px', borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accent}33`, fontSize: 10, fontWeight: 800, color: T.accentHi }}>
                    {sessionExports.length}
                  </span>
                  <span style={{ fontSize: 10, color: T.faint }}>(clears on reload — no server history)</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px auto', gap: 10, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['', 'Report', 'Format', 'Time', 'Remove'].map((h, i) => (
                  <span key={i} style={{ ...MICRO, fontSize: 9 }}>{h}</span>
                ))}
              </div>

              <motion.div style={{ display: 'flex', flexDirection: 'column' }}>
                <AnimatePresence mode="popLayout">
                  {sessionExports.slice(0, 8).map((row) => {
                    const color   = typeColor(row.typeKey);
                    const Icon    = typeIcon(row.typeKey);
                    const fmtMeta = FORMAT_META[row.format] ?? FORMAT_META.csv;
                    const FmtIcon = fmtMeta.icon;
                    const isNew   = newExportIds.has(row.id);
                    return (
                      <motion.div
                        key={row.id} layout variants={EXPORT_ROW_V} initial="hidden" animate="visible" exit="exit"
                        style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 80px auto', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}
                      >
                        {isNew && (
                          <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.3 }}
                            style={{ position: 'absolute', left: -1, top: '50%', transform: 'translateY(-50%)', width: 3, height: 28, background: T.success, borderRadius: '0 3px 3px 0' }} />
                        )}
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} color={color} strokeWidth={2.2} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.typeLabel}</div>
                          <div style={{ fontSize: 10, color: T.faint }}>{row.typeKey.replace(/_/g, ' ')}</div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, background: fmtMeta.bg, border: `1px solid ${fmtMeta.color}33`, color: fmtMeta.color, fontSize: 10, fontWeight: 700 }}>
                          <FmtIcon size={9} />{fmtMeta.label}
                        </span>
                        <span style={{ fontSize: 11, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtDate(row.createdAt)}
                        </span>
                        <motion.button whileHover={{ scale: 1.18, color: T.danger }} whileTap={{ scale: 0.92 }}
                          onClick={() => handleDeleteSessionExport(row.id)}
                          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <X size={12} />
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        )}

      </motion.div>

      {/* ── Local toasts ── */}
      <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999, pointerEvents: 'none', alignItems: 'center' }}>
        <AnimatePresence>
          {localToasts.map((t) => (
            <motion.div key={t.id} variants={TOAST_V} initial="hidden" animate="visible" exit="exit"
              style={{ ...glassDeep(), pointerEvents: 'auto', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, color: t.color, fontSize: 13, fontWeight: 700, borderColor: `${t.color}44`, boxShadow: `0 6px 36px ${t.color}25` }}
            >
              {t.icon}{t.msg}
              <motion.button onClick={() => setLocalToasts((prev) => prev.filter((x) => x.id !== t.id))} whileHover={{ scale: 1.2 }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.faint, cursor: 'pointer', display: 'flex', padding: 2 }}
              >
                <X size={12} />
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
