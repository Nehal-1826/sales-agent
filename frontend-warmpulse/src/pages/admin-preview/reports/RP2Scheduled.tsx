/**
 * Admin Reports Design Candidate: RP2 Scheduled Reports
 *
 * "Scheduled Reports" — a premium animated surface for managing recurring
 * auto-generated platform reports. Animated KPI header (active schedules,
 * runs MTD, next upcoming run), FLIP-reordering schedule list with search +
 * filters, per-row toggle/edit/run-now/delete, and a spring-driven create/edit
 * drawer with full form. Aurora Glass dark palette, warm amber only.
 *
 * Framer-motion: animated KPI counters, staggered row entrance, layout FLIP
 * on sort/filter, AnimatePresence drawer + toast, spring toggle, run-now
 * progress→done, whileHover/whileTap. Cleanup on unmount.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Uses @/lib/format for ₹ money + DD/MM/YYYY dates.
 * NO API / react-query / @/lib/api. Aurora Glass. NO purple/violet/blue/cyan.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
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
  Calendar,
  Clock,
  Play,
  Pause,
  Pencil,
  Trash2,
  Plus,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  BarChart2,
  Users,
  Activity,
  Cpu,
  Mail,
  TrendingUp,
  Zap,
  RefreshCw,
  Filter,
  Check,
  ChevronRight,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.38)' as const,
  ghost:       'rgba(255,255,255,0.18)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  accent:      '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.18)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.14)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.14)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.14)' as const,
  neutral:     'rgba(255,255,255,0.52)' as const,
  neutralDim:  'rgba(255,255,255,0.08)' as const,
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius:         16,
  } as CSSProperties,
  glassCard: {
    background:           'rgba(255,255,255,0.055)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius:         18,
  } as CSSProperties,
  glassDeep: {
    background:           'rgba(255,255,255,0.08)',
    border:               '1px solid rgba(255,255,255,0.14)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius:         22,
  } as CSSProperties,
  glassTight: {
    background:           'rgba(255,255,255,0.04)',
    border:               '1px solid rgba(255,255,255,0.08)',
    backdropFilter:       'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius:         10,
  } as CSSProperties,
};

// ─── Types ───────────────────────────────────────────────────────────────────
type ReportType  = 'revenue' | 'subscriber_growth' | 'warmup_usage' | 'deliverability' | 'peer_health' | 'llm_cost';
type Cadence     = 'daily' | 'weekly' | 'monthly';
type Format      = 'csv' | 'pdf' | 'xlsx';
type SortKey     = 'name' | 'type' | 'cadence' | 'next_run' | 'last_run' | 'enabled';
type SortDir     = 'asc' | 'desc';

interface Schedule {
  id:         string;
  name:       string;
  type:       ReportType;
  cadence:    Cadence;
  recipients: string[];
  format:     Format;
  next_run:   string;  // ISO
  last_run:   string | null;
  enabled:    boolean;
  runs_mtd:   number;
  last_status:'ok' | 'error' | 'running' | null;
  last_rows:  number | null;
}

interface RecentRun {
  id:          string;
  schedule_id: string;
  schedule_name: string;
  started_at:  string;
  duration_s:  number;
  rows:        number;
  status:      'ok' | 'error';
  format:      Format;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const INITIAL_SCHEDULES: Schedule[] = [
  {
    id: 'sch_001', name: 'Daily Revenue Summary',
    type: 'revenue', cadence: 'daily',
    recipients: ['finance@warmpulse.in', 'ceo@warmpulse.in'],
    format: 'xlsx', next_run: '2026-06-02T06:00:00+05:30',
    last_run: '2026-06-01T06:00:00+05:30',
    enabled: true, runs_mtd: 31, last_status: 'ok', last_rows: 248,
  },
  {
    id: 'sch_002', name: 'Weekly Subscriber Growth',
    type: 'subscriber_growth', cadence: 'weekly',
    recipients: ['growth@warmpulse.in'],
    format: 'pdf', next_run: '2026-06-07T09:00:00+05:30',
    last_run: '2026-05-31T09:00:00+05:30',
    enabled: true, runs_mtd: 4, last_status: 'ok', last_rows: 87,
  },
  {
    id: 'sch_003', name: 'Monthly Warmup Usage Report',
    type: 'warmup_usage', cadence: 'monthly',
    recipients: ['ops@warmpulse.in', 'support@warmpulse.in', 'cto@warmpulse.in'],
    format: 'xlsx', next_run: '2026-07-01T08:00:00+05:30',
    last_run: '2026-06-01T08:00:00+05:30',
    enabled: true, runs_mtd: 1, last_status: 'ok', last_rows: 1420,
  },
  {
    id: 'sch_004', name: 'Daily Deliverability Health',
    type: 'deliverability', cadence: 'daily',
    recipients: ['deliverability@warmpulse.in'],
    format: 'csv', next_run: '2026-06-02T07:30:00+05:30',
    last_run: '2026-06-01T07:30:00+05:30',
    enabled: true, runs_mtd: 31, last_status: 'error', last_rows: null,
  },
  {
    id: 'sch_005', name: 'Peer Network Health Digest',
    type: 'peer_health', cadence: 'daily',
    recipients: ['infra@warmpulse.in'],
    format: 'pdf', next_run: '2026-06-02T05:00:00+05:30',
    last_run: '2026-06-01T05:00:00+05:30',
    enabled: false, runs_mtd: 28, last_status: 'ok', last_rows: 312,
  },
  {
    id: 'sch_006', name: 'Weekly LLM Cost Breakdown',
    type: 'llm_cost', cadence: 'weekly',
    recipients: ['finance@warmpulse.in', 'cto@warmpulse.in'],
    format: 'xlsx', next_run: '2026-06-08T10:00:00+05:30',
    last_run: '2026-06-01T10:00:00+05:30',
    enabled: true, runs_mtd: 4, last_status: 'ok', last_rows: 56,
  },
  {
    id: 'sch_007', name: 'Monthly Subscriber Churn',
    type: 'subscriber_growth', cadence: 'monthly',
    recipients: ['growth@warmpulse.in', 'ceo@warmpulse.in'],
    format: 'pdf', next_run: '2026-07-01T09:00:00+05:30',
    last_run: null,
    enabled: true, runs_mtd: 0, last_status: null, last_rows: null,
  },
  {
    id: 'sch_008', name: 'Weekly Revenue by Plan Tier',
    type: 'revenue', cadence: 'weekly',
    recipients: ['finance@warmpulse.in'],
    format: 'csv', next_run: '2026-06-07T06:00:00+05:30',
    last_run: '2026-05-31T06:00:00+05:30',
    enabled: false, runs_mtd: 2, last_status: 'ok', last_rows: 73,
  },
];

const RECENT_RUNS: RecentRun[] = [
  { id: 'run_001', schedule_id: 'sch_001', schedule_name: 'Daily Revenue Summary',       started_at: '2026-06-01T06:00:12+05:30', duration_s: 4,  rows: 248, status: 'ok',    format: 'xlsx' },
  { id: 'run_002', schedule_id: 'sch_002', schedule_name: 'Weekly Subscriber Growth',    started_at: '2026-05-31T09:00:08+05:30', duration_s: 6,  rows: 87,  status: 'ok',    format: 'pdf'  },
  { id: 'run_003', schedule_id: 'sch_003', schedule_name: 'Monthly Warmup Usage Report', started_at: '2026-06-01T08:01:03+05:30', duration_s: 18, rows: 1420,status: 'ok',    format: 'xlsx' },
  { id: 'run_004', schedule_id: 'sch_004', schedule_name: 'Daily Deliverability Health', started_at: '2026-06-01T07:30:09+05:30', duration_s: 7,  rows: 0,   status: 'error', format: 'csv'  },
  { id: 'run_005', schedule_id: 'sch_006', schedule_name: 'Weekly LLM Cost Breakdown',   started_at: '2026-06-01T10:00:05+05:30', duration_s: 3,  rows: 56,  status: 'ok',    format: 'xlsx' },
  { id: 'run_006', schedule_id: 'sch_005', schedule_name: 'Peer Network Health Digest',  started_at: '2026-06-01T05:00:14+05:30', duration_s: 9,  rows: 312, status: 'ok',    format: 'pdf'  },
];

// ─── Animated counter hook ───────────────────────────────────────────────────
function useAnimatedCounter(target: number): string {
  const mv = useMotionValue(0);
  const [val, setVal] = useState('0');
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) { setVal(Math.round(latest).toLocaleString()); },
    });
    return () => { ctrlRef.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return val;
}

// ─── Framer variants ─────────────────────────────────────────────────────────
const rowVariants: Variants = {
  hidden:  { opacity: 0, y: 16, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.04, duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.2 } },
};

const drawerVariants: Variants = {
  hidden:  { x: '100%', opacity: 0, transition: { type: 'spring', stiffness: 340, damping: 38 } },
  visible: { x: 0,      opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 28 } },
  exit:    { x: '100%', opacity: 0, transition: { type: 'spring', stiffness: 340, damping: 38 } },
};

const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.16 } },
};

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: 28, scale: 0.93 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, y: 16, scale: 0.93, transition: { duration: 0.2 } },
};

const kpiVariants: Variants = {
  hidden:  { opacity: 0, y: 24, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ─── Toast state ──────────────────────────────────────────────────────────────
interface ToastItem { id: string; msg: string; color: string; icon: ReactNode; }
let _toastSeed = 0;

// ─── Report type helpers ──────────────────────────────────────────────────────
const TYPE_LABELS: Record<ReportType, string> = {
  revenue:           'Revenue ₹',
  subscriber_growth: 'Subscriber Growth',
  warmup_usage:      'Warmup Usage',
  deliverability:    'Deliverability',
  peer_health:       'Peer Health',
  llm_cost:          'LLM Cost',
};

const TYPE_COLORS: Record<ReportType, string> = {
  revenue:           '#F26522',
  subscriber_growth: '#3ddc97',
  warmup_usage:      '#FF8A4B',
  deliverability:    '#e8c94e',
  peer_health:       '#a0cfb4',
  llm_cost:          '#d4956a',
};

function TypeIcon({ type, size = 14 }: { type: ReportType; size?: number }) {
  const props = { size, color: TYPE_COLORS[type] ?? T.accent };
  if (type === 'revenue')           return <TrendingUp {...props} />;
  if (type === 'subscriber_growth') return <Users {...props} />;
  if (type === 'warmup_usage')      return <Mail {...props} />;
  if (type === 'deliverability')    return <Activity {...props} />;
  if (type === 'peer_health')       return <Zap {...props} />;
  if (type === 'llm_cost')          return <Cpu {...props} />;
  return <BarChart2 {...props} />;
}

const FORMAT_COLORS: Record<Format, string> = {
  csv:  '#a0cfb4',
  pdf:  '#ff5c7a',
  xlsx: '#3ddc97',
};

function FormatIcon({ format, size = 12 }: { format: Format; size?: number }) {
  const col = FORMAT_COLORS[format] ?? T.accent;
  if (format === 'pdf')  return <FileText size={size} color={col} />;
  return <FileSpreadsheet size={size} color={col} />;
}

const CADENCE_COLORS: Record<Cadence, string> = {
  daily:   '#FF8A4B',
  weekly:  '#F26522',
  monthly: '#e8c94e',
};

function cadenceLabel(c: Cadence): string {
  if (c === 'daily')   return 'Daily';
  if (c === 'weekly')  return 'Weekly';
  return 'Monthly';
}

// ─── Animated spring toggle ───────────────────────────────────────────────────
function SpringToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <motion.button
      onClick={onChange}
      whileTap={{ scale: 0.9 }}
      style={{
        position:        'relative',
        width:           40,
        height:          22,
        borderRadius:    11,
        background:      checked ? T.success : 'rgba(255,255,255,0.14)',
        border:          `1px solid ${checked ? T.success + '60' : 'rgba(255,255,255,0.18)'}`,
        cursor:          'pointer',
        flexShrink:      0,
        padding:         0,
        transition:      'background 0.22s ease, border-color 0.22s ease',
      }}
      aria-label={checked ? 'Disable schedule' : 'Enable schedule'}
    >
      <motion.span
        layout
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        style={{
          position:     'absolute',
          top:          2,
          left:         0,
          width:        16,
          height:       16,
          borderRadius: '50%',
          background:   '#fff',
          boxShadow:    '0 1px 4px rgba(0,0,0,0.35)',
        }}
      />
    </motion.button>
  );
}

// ─── Run-now progress button ──────────────────────────────────────────────────
function RunNowButton({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    if (state !== 'idle') return;
    setState('running');
    timerRef.current = setTimeout(() => {
      setState('done');
      timerRef.current = setTimeout(() => {
        setState('idle');
        onDone();
      }, 1400);
    }, 1800);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <motion.button
      onClick={handleClick}
      whileHover={state === 'idle' ? { scale: 1.06 } : {}}
      whileTap={state === 'idle' ? { scale: 0.93 } : {}}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          5,
        padding:      '5px 12px',
        borderRadius: 8,
        fontSize:     12,
        fontWeight:   600,
        cursor:       state === 'idle' ? 'pointer' : 'default',
        border:       `1px solid ${
          state === 'done' ? T.success + '60' :
          state === 'running' ? T.warning + '60' : T.accent + '60'}`,
        background:
          state === 'done'    ? T.successDim :
          state === 'running' ? T.warningDim : T.accentDim,
        color:
          state === 'done'    ? T.success :
          state === 'running' ? T.warning : T.accent,
        transition: 'background 0.2s, border-color 0.2s, color 0.2s',
      }}
    >
      {state === 'running' && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
          style={{ display: 'inline-flex' }}
        >
          <RefreshCw size={11} />
        </motion.span>
      )}
      {state === 'done'    && <Check size={11} />}
      {state === 'idle'    && <Play  size={11} />}
      {state === 'running' ? 'Running…' : state === 'done' ? 'Done' : 'Run Now'}
    </motion.button>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, sub, color, delay,
}: {
  icon: ReactNode; label: string; value: string;
  sub?: string; color: string; delay: number;
}) {
  return (
    <motion.div
      custom={delay}
      variants={kpiVariants}
      initial="hidden"
      animate="visible"
      style={{ ...T.glassCard, flex: 1, minWidth: 180, padding: '20px 22px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 9,
          background: `${color}1a`, border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </span>
        <span style={{ fontSize: 12, color: T.dim, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.5px', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: T.faint, marginTop: 6 }}>{sub}</div>
      )}
    </motion.div>
  );
}

// ─── Edit/Create drawer form ──────────────────────────────────────────────────
interface DrawerFormState {
  name:       string;
  type:       ReportType;
  cadence:    Cadence;
  format:     Format;
  recipients: string;  // comma-separated
}

const REPORT_TYPES: ReportType[] = ['revenue', 'subscriber_growth', 'warmup_usage', 'deliverability', 'peer_health', 'llm_cost'];
const CADENCES: Cadence[]        = ['daily', 'weekly', 'monthly'];
const FORMATS:  Format[]         = ['csv', 'pdf', 'xlsx'];

function ScheduleDrawer({
  mode,
  initial,
  onSave,
  onClose,
}: {
  mode:    'create' | 'edit';
  initial: DrawerFormState | null;
  onSave:  (f: DrawerFormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DrawerFormState>(
    initial ?? { name: '', type: 'revenue', cadence: 'weekly', format: 'xlsx', recipients: '' }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof DrawerFormState, string>>>({});

  function field<K extends keyof DrawerFormState>(key: K) {
    return (val: DrawerFormState[K]) => setForm(f => ({ ...f, [key]: val }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof DrawerFormState, string>> = {};
    if (!form.name.trim())       e.name       = 'Name is required';
    if (!form.recipients.trim()) e.recipients = 'At least one recipient required';
    else {
      const parts = form.recipients.split(',').map(s => s.trim()).filter(Boolean);
      const bad   = parts.find(p => !p.includes('@'));
      if (bad) e.recipients = `"${bad}" is not a valid email`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (validate()) onSave(form);
  }

  const inputStyle: CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    color: T.text, background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)', outline: 'none',
    boxSizing: 'border-box',
  };

  function SelectRow<V extends string>({ label, value, options, onSelect, labelFn }: {
    label: string; value: V; options: V[];
    onSelect: (v: V) => void; labelFn?: (v: V) => string;
  }) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.dim, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {options.map(opt => (
            <motion.button
              key={opt}
              whileTap={{ scale: 0.94 }}
              onClick={() => onSelect(opt)}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                border: value === opt ? `1px solid ${T.accent}60` : '1px solid rgba(255,255,255,0.14)',
                background: value === opt ? T.accentDim : 'rgba(255,255,255,0.05)',
                color: value === opt ? T.accent : T.dim,
              }}
            >{labelFn ? labelFn(opt) : opt}</motion.button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="backdrop"
          variants={backdropVariants}
          initial="hidden" animate="visible" exit="exit"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            zIndex: 1000,
          }}
        />
      </AnimatePresence>
      <motion.div
        key="drawer"
        variants={drawerVariants}
        initial="hidden" animate="visible" exit="exit"
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 440,
          maxWidth: '95vw', zIndex: 1001, overflowY: 'auto',
          ...T.glassDeep, borderRadius: '18px 0 0 18px',
          padding: '28px 28px 40px',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>
              {mode === 'create' ? 'Create Schedule' : 'Edit Schedule'}
            </div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 3 }}>
              {mode === 'create' ? 'Add a new recurring report' : 'Update this recurring report'}
            </div>
          </div>
          <motion.button
            onClick={onClose} whileTap={{ scale: 0.9 }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, padding: 4, borderRadius: 6 }}
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Report Name</div>
          <input
            style={{ ...inputStyle, ...(errors.name ? { borderColor: T.danger } : {}) }}
            value={form.name}
            placeholder="e.g. Daily Revenue Summary"
            onChange={e => field('name')(e.target.value)}
          />
          {errors.name && <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>{errors.name}</div>}
        </div>

        {/* Report type */}
        <SelectRow
          label="Report Type"
          value={form.type}
          options={REPORT_TYPES}
          onSelect={field('type')}
          labelFn={v => TYPE_LABELS[v] ?? v}
        />

        {/* Cadence */}
        <SelectRow
          label="Cadence"
          value={form.cadence}
          options={CADENCES}
          onSelect={field('cadence')}
          labelFn={cadenceLabel}
        />

        {/* Format */}
        <SelectRow
          label="Format"
          value={form.format}
          options={FORMATS}
          onSelect={field('format')}
          labelFn={v => v.toUpperCase()}
        />

        {/* Recipients */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.dim, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recipients</div>
          <input
            style={{ ...inputStyle, ...(errors.recipients ? { borderColor: T.danger } : {}) }}
            value={form.recipients}
            placeholder="email1@example.com, email2@example.com"
            onChange={e => field('recipients')(e.target.value)}
          />
          <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>Comma-separated email addresses</div>
          {errors.recipients && <div style={{ fontSize: 11, color: T.danger, marginTop: 2 }}>{errors.recipients}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
              color: T.dim, cursor: 'pointer',
            }}
          >Cancel</motion.button>
          <motion.button
            onClick={handleSubmit}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: T.accent, border: 'none', color: '#fff', cursor: 'pointer',
            }}
          >{mode === 'create' ? 'Create Schedule' : 'Save Changes'}</motion.button>
        </div>
      </motion.div>
    </>
  );
}

// ─── Delete confirm mini modal ────────────────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        variants={backdropVariants}
        initial="hidden" animate="visible" exit="exit"
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={e => e.stopPropagation()}
          style={{ ...T.glassDeep, padding: '28px 32px', width: 360, maxWidth: '90vw' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: T.dangerDim, border: `1px solid ${T.danger}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={15} color={T.danger} />
            </span>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Delete Schedule?</div>
          </div>
          <div style={{ fontSize: 13, color: T.dim, marginBottom: 22, lineHeight: 1.5 }}>
            "<strong style={{ color: T.text }}>{name}</strong>" and its run history will be permanently deleted.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <motion.button
              onClick={onCancel} whileTap={{ scale: 0.96 }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: T.dim }}
            >Cancel</motion.button>
            <motion.button
              onClick={onConfirm} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.03 }}
              style={{ flex: 2, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: T.danger, border: 'none', color: '#fff' }}
            >Delete Forever</motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function sortSchedules(arr: Schedule[], key: SortKey, dir: SortDir): Schedule[] {
  return [...arr].sort((a, b) => {
    let av: string | number | boolean = '';
    let bv: string | number | boolean = '';
    if (key === 'name')     { av = a.name.toLowerCase();     bv = b.name.toLowerCase(); }
    if (key === 'type')     { av = a.type;                   bv = b.type; }
    if (key === 'cadence')  { av = a.cadence;                bv = b.cadence; }
    if (key === 'next_run') { av = a.next_run;               bv = b.next_run; }
    if (key === 'last_run') { av = a.last_run ?? '';         bv = b.last_run ?? ''; }
    if (key === 'enabled')  { av = a.enabled ? 1 : 0;       bv = b.enabled ? 1 : 0; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmRptRP2Scheduled() {
  const [schedules,  setSchedules]  = useState<Schedule[]>(INITIAL_SCHEDULES);
  const [search,     setSearch]     = useState('');
  const [filterType, setFilterType] = useState<ReportType | 'all'>('all');
  const [filterCad,  setFilterCad]  = useState<Cadence  | 'all'>('all');
  const [filterEna,  setFilterEna]  = useState<'all' | 'enabled' | 'paused'>('all');
  const [sortKey,    setSortKey]    = useState<SortKey>('next_run');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [toasts,     setToasts]     = useState<ToastItem[]>([]);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // cleanup toast timers on unmount
  useEffect(() => {
    const timers = toastTimers.current;
    return () => { timers.forEach(t => clearTimeout(t)); };
  }, []);

  const pushToast = useCallback((msg: string, color: string, icon: ReactNode) => {
    const id = `toast_${++_toastSeed}`;
    setToasts(ts => [...ts, { id, msg, color, icon }]);
    const t = setTimeout(() => {
      setToasts(ts => ts.filter(x => x.id !== id));
      toastTimers.current.delete(id);
    }, 3200);
    toastTimers.current.set(id, t);
  }, []);

  // Derived: filter + sort
  const displayed = sortSchedules(
    schedules.filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
          !TYPE_LABELS[s.type].toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== 'all' && s.type !== filterType) return false;
      if (filterCad  !== 'all' && s.cadence !== filterCad) return false;
      if (filterEna  === 'enabled' && !s.enabled) return false;
      if (filterEna  === 'paused'  &&  s.enabled) return false;
      return true;
    }),
    sortKey, sortDir,
  );

  // KPI counts
  const activeCount   = schedules.filter(s => s.enabled).length;
  const totalRunsMtd  = schedules.reduce((acc, s) => acc + s.runs_mtd, 0);
  const nextRunIso    = schedules
    .filter(s => s.enabled)
    .map(s => s.next_run)
    .sort()[0] ?? null;

  const activeCountStr  = useAnimatedCounter(activeCount);
  const totalRunsMtdStr = useAnimatedCounter(totalRunsMtd);

  // Toggle
  function handleToggle(id: string) {
    setSchedules(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = { ...s, enabled: !s.enabled };
      pushToast(
        next.enabled ? `"${s.name}" enabled` : `"${s.name}" paused`,
        next.enabled ? T.success : T.warning,
        next.enabled ? <CheckCircle2 size={14} /> : <Pause size={14} />,
      );
      return next;
    }));
  }

  // Sort header click
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={11} color={T.ghost} />;
    return sortDir === 'asc' ? <ChevronUp size={11} color={T.accent} /> : <ChevronDown size={11} color={T.accent} />;
  }

  // Edit
  function handleEdit(s: Schedule) {
    setEditTarget(s);
    setDrawerMode('edit');
  }

  // Create
  function handleCreate() {
    setEditTarget(null);
    setDrawerMode('create');
  }

  // Save
  function handleSave(f: DrawerFormState) {
    const recips = f.recipients.split(',').map(r => r.trim()).filter(Boolean);
    if (drawerMode === 'create') {
      const now  = new Date();
      const next = new Date(now.getTime() + 86400000).toISOString();
      const newS: Schedule = {
        id:          `sch_${Date.now()}`,
        name:        f.name.trim(),
        type:        f.type,
        cadence:     f.cadence,
        format:      f.format,
        recipients:  recips,
        next_run:    next,
        last_run:    null,
        enabled:     true,
        runs_mtd:    0,
        last_status: null,
        last_rows:   null,
      };
      setSchedules(prev => [newS, ...prev]);
      pushToast(`Schedule "${f.name}" created`, T.success, <CheckCircle2 size={14} />);
    } else if (drawerMode === 'edit' && editTarget) {
      setSchedules(prev => prev.map(s =>
        s.id === editTarget.id
          ? { ...s, name: f.name.trim(), type: f.type, cadence: f.cadence, format: f.format, recipients: recips }
          : s
      ));
      pushToast(`"${f.name}" updated`, T.accent, <CheckCircle2 size={14} />);
    }
    setDrawerMode(null);
    setEditTarget(null);
  }

  // Delete
  function handleDeleteConfirm() {
    const target = schedules.find(s => s.id === confirmId);
    if (!target) { setConfirmId(null); return; }
    setSchedules(prev => prev.filter(s => s.id !== confirmId));
    pushToast(`"${target.name}" deleted`, T.danger, <Trash2 size={14} />);
    setConfirmId(null);
  }

  // Run-now done
  function handleRunDone(s: Schedule) {
    pushToast(`"${s.name}" run completed`, T.success, <CheckCircle2 size={14} />);
  }

  const confirmTarget = schedules.find(s => s.id === confirmId) ?? null;

  const drawerInitial: DrawerFormState | null = editTarget
    ? { name: editTarget.name, type: editTarget.type, cadence: editTarget.cadence, format: editTarget.format, recipients: editTarget.recipients.join(', ') }
    : null;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif", color: T.text, minHeight: '100vh', padding: '28px 24px 60px' }}>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: T.accentDim, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={18} color={T.accent} />
            </span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: '-0.3px' }}>Scheduled Reports</div>
              <div style={{ fontSize: 12, color: T.dim, marginTop: 1 }}>Manage recurring automated platform reports</div>
            </div>
          </div>
        </div>
        <motion.button
          onClick={handleCreate}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: T.accent, border: 'none', color: '#fff', cursor: 'pointer',
            boxShadow: `0 4px 18px ${T.accent}40`,
          }}
        >
          <Plus size={14} />
          New Schedule
        </motion.button>
      </motion.div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
        <KpiCard
          icon={<CheckCircle2 size={16} color={T.success} />}
          label="Active Schedules"
          value={activeCountStr}
          sub={`${schedules.length} total configured`}
          color={T.success}
          delay={0}
        />
        <KpiCard
          icon={<BarChart2 size={16} color={T.accent} />}
          label="Runs This Month"
          value={totalRunsMtdStr}
          sub="Across all report types"
          color={T.accent}
          delay={1}
        />
        <KpiCard
          icon={<Clock size={16} color={T.warning} />}
          label="Next Upcoming Run"
          value={nextRunIso ? formatDate(nextRunIso) : '—'}
          sub={nextRunIso ? `at ${new Date(nextRunIso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST` : 'No active schedules'}
          color={T.warning}
          delay={2}
        />
        <KpiCard
          icon={<AlertTriangle size={16} color={T.danger} />}
          label="Last Run Errors"
          value={String(schedules.filter(s => s.last_status === 'error').length)}
          sub="Require attention"
          color={T.danger}
          delay={3}
        />
      </div>

      {/* Search + filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.38 }}
        style={{ ...T.glass, padding: '14px 18px', marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '7px 12px' }}>
            <Search size={14} color={T.faint} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search schedules…"
              style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0, display: 'flex' }}
                >
                  <X size={13} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          {/* Filter toggle */}
          <motion.button
            onClick={() => setShowFilters(f => !f)}
            whileTap={{ scale: 0.93 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
              background: showFilters ? T.accentDim : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showFilters ? T.accent + '50' : 'rgba(255,255,255,0.12)'}`,
              color: showFilters ? T.accent : T.dim, cursor: 'pointer',
            }}
          >
            <Filter size={13} />
            Filters
            {(filterType !== 'all' || filterCad !== 'all' || filterEna !== 'all') && (
              <span style={{ background: T.accent, borderRadius: '50%', width: 6, height: 6, display: 'inline-block' }} />
            )}
          </motion.button>
          {/* Result count */}
          <div style={{ fontSize: 12, color: T.faint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {formatNumber(displayed.length)} of {formatNumber(schedules.length)} schedules
          </div>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 14, borderTop: `1px solid ${T.hairline}`, marginTop: 14 }}>
                {/* Type filter */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(['all', ...REPORT_TYPES] as (ReportType | 'all')[]).map(t => (
                      <motion.button
                        key={t} whileTap={{ scale: 0.93 }}
                        onClick={() => setFilterType(t)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', border: filterType === t ? `1px solid ${T.accent}60` : '1px solid rgba(255,255,255,0.12)',
                          background: filterType === t ? T.accentDim : 'rgba(255,255,255,0.04)',
                          color: filterType === t ? T.accent : T.faint,
                        }}
                      >{t === 'all' ? 'All Types' : TYPE_LABELS[t]}</motion.button>
                    ))}
                  </div>
                </div>
                {/* Cadence filter */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Cadence</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['all', 'daily', 'weekly', 'monthly'] as (Cadence | 'all')[]).map(c => (
                      <motion.button
                        key={c} whileTap={{ scale: 0.93 }}
                        onClick={() => setFilterCad(c)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', border: filterCad === c ? `1px solid ${T.accent}60` : '1px solid rgba(255,255,255,0.12)',
                          background: filterCad === c ? T.accentDim : 'rgba(255,255,255,0.04)',
                          color: filterCad === c ? T.accent : T.faint,
                        }}
                      >{c === 'all' ? 'All' : cadenceLabel(c)}</motion.button>
                    ))}
                  </div>
                </div>
                {/* Enabled filter */}
                <div>
                  <div style={{ fontSize: 10, color: T.faint, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['all', 'enabled', 'paused'] as const).map(e => (
                      <motion.button
                        key={e} whileTap={{ scale: 0.93 }}
                        onClick={() => setFilterEna(e)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', border: filterEna === e ? `1px solid ${T.accent}60` : '1px solid rgba(255,255,255,0.12)',
                          background: filterEna === e ? T.accentDim : 'rgba(255,255,255,0.04)',
                          color: filterEna === e ? T.accent : T.faint,
                        }}
                      >{e === 'all' ? 'All' : e === 'enabled' ? 'Enabled' : 'Paused'}</motion.button>
                    ))}
                  </div>
                </div>
                {/* Clear */}
                {(filterType !== 'all' || filterCad !== 'all' || filterEna !== 'all') && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <motion.button
                      onClick={() => { setFilterType('all'); setFilterCad('all'); setFilterEna('all'); }}
                      whileTap={{ scale: 0.93 }}
                      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${T.danger}40`, background: T.dangerDim, color: T.danger }}
                    >Clear Filters</motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Schedule table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        style={{ ...T.glass, overflow: 'hidden', marginBottom: 28 }}
      >
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 90px 130px',
          gap: 0,
          padding: '10px 16px',
          borderBottom: `1px solid ${T.hairline}`,
          background: 'rgba(255,255,255,0.03)',
        }}>
          {([ ['name','Name'], ['type','Type'], ['cadence','Cadence'], ['next_run','Next Run'], ['last_run','Last Run'], ['enabled','Status'], ] as [SortKey, string][]).map(([key, label]) => (
            <motion.button
              key={key}
              onClick={() => handleSort(key)}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: sortKey === key ? T.accent : T.faint, padding: '2px 0',
              }}
            >
              {label}
              <SortIcon col={key} />
            </motion.button>
          ))}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.faint }}>Actions</div>
        </div>

        {/* Table rows */}
        <AnimatePresence mode="popLayout" initial={false}>
          {displayed.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ padding: '40px 0', textAlign: 'center', color: T.faint, fontSize: 13 }}
            >
              No schedules match the current filters.
            </motion.div>
          )}
          {displayed.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              custom={i}
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              whileHover={{ background: 'rgba(255,255,255,0.035)' }}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 90px 130px',
                gap: 0,
                padding: '12px 16px',
                borderBottom: `1px solid ${T.hairline}`,
                alignItems: 'center',
                cursor: 'default',
                transition: 'background 0.15s',
                opacity: s.enabled ? 1 : 0.62,
              }}
            >
              {/* Name */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <FormatIcon format={s.format} size={11} />
                  <span style={{ fontSize: 11, color: FORMAT_COLORS[s.format], fontWeight: 600 }}>{s.format.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: T.ghost }}>·</span>
                  <span style={{ fontSize: 11, color: T.faint }}>{s.recipients.length} recipient{s.recipients.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TypeIcon type={s.type} size={13} />
                <span style={{ fontSize: 12, color: TYPE_COLORS[s.type], fontWeight: 600 }}>
                  {TYPE_LABELS[s.type]}
                </span>
              </div>

              {/* Cadence */}
              <div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  color: CADENCE_COLORS[s.cadence],
                  background: `${CADENCE_COLORS[s.cadence]}18`,
                  border: `1px solid ${CADENCE_COLORS[s.cadence]}30`,
                }}>
                  <Clock size={10} />
                  {cadenceLabel(s.cadence)}
                </span>
              </div>

              {/* Next run */}
              <div>
                <div style={{ fontSize: 12, color: T.text }}>{formatDate(s.next_run)}</div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>
                  {new Date(s.next_run).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST
                </div>
              </div>

              {/* Last run */}
              <div>
                {s.last_run ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {s.last_status === 'error'
                        ? <AlertTriangle size={11} color={T.danger} />
                        : <CheckCircle2   size={11} color={T.success} />}
                      <span style={{ fontSize: 12, color: s.last_status === 'error' ? T.danger : T.text }}>
                        {formatDate(s.last_run)}
                      </span>
                    </div>
                    {s.last_rows !== null && (
                      <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{formatNumber(s.last_rows)} rows</div>
                    )}
                    {s.last_status === 'error' && (
                      <div style={{ fontSize: 11, color: T.danger, marginTop: 1 }}>Export failed</div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: T.ghost }}>Never run</span>
                )}
              </div>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SpringToggle checked={s.enabled} onChange={() => handleToggle(s.id)} />
                <span style={{ fontSize: 11, color: s.enabled ? T.success : T.warning, fontWeight: 600 }}>
                  {s.enabled ? 'On' : 'Off'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <RunNowButton onDone={() => handleRunDone(s)} />
                <motion.button
                  onClick={() => handleEdit(s)}
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.dim, padding: 4, borderRadius: 5 }}
                  title="Edit"
                >
                  <Pencil size={13} />
                </motion.button>
                <motion.button
                  onClick={() => setConfirmId(s.id)}
                  whileHover={{ scale: 1.1, color: T.danger }} whileTap={{ scale: 0.9 }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 4, borderRadius: 5 }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Recent runs panel */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42, duration: 0.4 }}
        style={{ ...T.glassCard }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={15} color={T.accent} />
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Runs</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.faint }}>Last 6 executions</span>
        </div>
        <div style={{ padding: '8px 0' }}>
          {RECENT_RUNS.map((run, i) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.46 + i * 0.06, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ background: 'rgba(255,255,255,0.03)' }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 20px', borderBottom: i < RECENT_RUNS.length - 1 ? `1px solid ${T.hairline}` : 'none',
                cursor: 'default',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: run.status === 'ok' ? T.successDim : T.dangerDim,
                border: `1px solid ${run.status === 'ok' ? T.success + '40' : T.danger + '40'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {run.status === 'ok'
                  ? <CheckCircle2 size={13} color={T.success} />
                  : <AlertTriangle size={13} color={T.danger} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {run.schedule_name}
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>
                  {formatDate(run.started_at)} · {run.duration_s}s
                  {run.rows > 0 && ` · ${formatNumber(run.rows)} rows`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <FormatIcon format={run.format} size={12} />
                <span style={{ fontSize: 11, color: FORMAT_COLORS[run.format], fontWeight: 600 }}>{run.format.toUpperCase()}</span>
                <ChevronRight size={12} color={T.ghost} />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Revenue tease card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.56, duration: 0.4 }}
        style={{ ...T.glass, marginTop: 20, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
      >
        <span style={{ width: 36, height: 36, borderRadius: 10, background: T.accentDim, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TrendingUp size={17} color={T.accent} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Revenue MTD from active workspaces</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
            Latest snapshot: <strong style={{ color: T.accent }}>{formatMoney(248600)}</strong> &nbsp;·&nbsp; Next daily report at 06:00 IST tomorrow
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          style={{ padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 600, background: T.accentDim, border: `1px solid ${T.accent}40`, color: T.accent, cursor: 'pointer', flexShrink: 0 }}
        >
          Run Report Now
        </motion.button>
      </motion.div>

      {/* Drawers & modals */}
      <AnimatePresence>
        {drawerMode && (
          <ScheduleDrawer
            key="schedule-drawer"
            mode={drawerMode}
            initial={drawerInitial}
            onSave={handleSave}
            onClose={() => { setDrawerMode(null); setEditTarget(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDelete
            key="confirm-delete"
            name={confirmTarget.name}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setConfirmId(null)}
          />
        )}
      </AnimatePresence>

      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              variants={toastVariants}
              initial="hidden" animate="visible" exit="exit"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 18px', borderRadius: 12,
                background: 'rgba(24,22,18,0.96)', border: `1px solid ${t.color}40`,
                boxShadow: `0 8px 28px rgba(0,0,0,0.45)`,
                color: t.color, fontSize: 13, fontWeight: 600,
                backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                pointerEvents: 'all',
              }}
            >
              {t.icon}
              <span style={{ color: T.text }}>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
