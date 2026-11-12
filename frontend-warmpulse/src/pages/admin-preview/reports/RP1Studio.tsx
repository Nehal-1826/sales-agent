/**
 * Admin Reports Design Candidate: RP1 Report Studio (Enhanced)
 *
 * "Report Studio" — a premium builder to configure + generate platform-wide
 * super-admin reports. Six report types: Revenue, Subscriber Growth, Warmup
 * Usage, Deliverability, Peer Network Health, LLM Cost. Live animated preview
 * per type, date-range presets, format selector (CSV/PDF/XLSX), options panel,
 * spring generate → success toast, and an animated recent-exports list.
 *
 * NEW in this iteration:
 * - Columns / metrics multi-select with chip UI per report type
 * - Segmentation filters (Plan, Region, Status) with removable chips
 * - Group by dimension selector (None / Plan / Month / Region)
 * - Compare to previous period toggle → Δ% KPI tiles
 * - Delivery & automation (email recipients, save as template, schedule)
 * - Preview upgrades: chart-type toggle Table/Bar/Line, summary KPI tiles,
 *   estimated output readout
 * - Recent exports row actions: Re-run, Download, Delete
 *
 * Framer-motion inventory:
 * - Staggered container entrance (CARD/SECTION variants)
 * - AnimatePresence mode="wait" for live preview swap + chart-type switch
 * - Format badge toggle with spring layoutId underline
 * - Generate button: spring progress → checkmark → success toast
 * - AnimatePresence for new export row prepend + delete
 * - Animated SVG bars + line path (motion.path pathLength spring)
 * - Animated counters (useMotionValue + animate → .on('change') + cleanup)
 * - Spring regroup on Group-by change
 * - whileHover/whileTap everywhere; GPU-safe (transform + opacity only)
 *
 * Self-contained: no API, no react-query, no @/features or @/lib/api.
 * Only @/lib/format for ₹ / DD/MM/YYYY / formatted numbers.
 * Inline style={{}} only. Dark Aurora Glass palette.
 * Indian standards: formatMoney (₹), formatDate (DD/MM/YYYY), formatNumber.
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

// ─── Report types ────────────────────────────────────────────────────────────

type ReportTypeId =
  | 'revenue'
  | 'subscriber_growth'
  | 'warmup_usage'
  | 'deliverability'
  | 'peer_health'
  | 'llm_cost';

interface ReportType {
  id:      ReportTypeId;
  label:   string;
  desc:    string;
  icon:    typeof IndianRupee;
  color:   string;
  metric:  string;
  metricVal: string;
  badge:   string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id:         'revenue',
    label:      'Revenue',
    desc:       'MRR, ARR, net revenue, refunds, churn',
    icon:       IndianRupee,
    color:      T.accent,
    metric:     'MRR',
    metricVal:  formatMoney(847200),
    badge:      '+12.4%',
  },
  {
    id:         'subscriber_growth',
    label:      'Subscriber Growth',
    desc:       'New, active, churned, trial conversions',
    icon:       Users,
    color:      T.success,
    metric:     'Active',
    metricVal:  formatNumber(2843),
    badge:      '+8.1%',
  },
  {
    id:         'warmup_usage',
    label:      'Warmup Usage',
    desc:       'Sends, opens, replies, spam-rescues by workspace',
    icon:       Mail,
    color:      T.accentHi,
    metric:     'Sends',
    metricVal:  formatNumber(1240600),
    badge:      '+5.7%',
  },
  {
    id:         'deliverability',
    label:      'Deliverability',
    desc:       'Inbox vs spam placement, bounce rate, domain scores',
    icon:       ShieldCheck,
    color:      T.warning,
    metric:     'Inbox Rate',
    metricVal:  '94.2%',
    badge:      '-0.3%',
  },
  {
    id:         'peer_health',
    label:      'Peer Network Health',
    desc:       'Reputation scores, active peers, pool coverage',
    icon:       Network,
    color:      T.amber,
    metric:     'Active Peers',
    metricVal:  formatNumber(312),
    badge:      '+4',
  },
  {
    id:         'llm_cost',
    label:      'LLM Cost',
    desc:       'Token usage, cost per provider, budget burn',
    icon:       Zap,
    color:      T.danger,
    metric:     'This Month',
    metricVal:  formatMoney(3189),
    badge:      '+18.2%',
  },
];

// ─── Columns per report type ──────────────────────────────────────────────────

type ColumnDef = { id: string; label: string; default: boolean };

const COLUMNS_BY_TYPE: Record<ReportTypeId, ColumnDef[]> = {
  revenue: [
    { id: 'workspace',  label: 'Workspace',    default: true  },
    { id: 'plan',       label: 'Plan',          default: true  },
    { id: 'mrr',        label: 'MRR (₹)',       default: true  },
    { id: 'arr',        label: 'ARR (₹)',       default: false },
    { id: 'net_rev',    label: 'Net Revenue',   default: true  },
    { id: 'refunds',    label: 'Refunds',       default: false },
    { id: 'churn',      label: 'Churn',         default: true  },
    { id: 'change_pct', label: '% Change',      default: true  },
  ],
  subscriber_growth: [
    { id: 'plan',       label: 'Plan',          default: true  },
    { id: 'new',        label: 'New',           default: true  },
    { id: 'active',     label: 'Active',        default: true  },
    { id: 'churned',    label: 'Churned',       default: true  },
    { id: 'trial_conv', label: 'Trial Conv.',   default: false },
    { id: 'region',     label: 'Region',        default: false },
    { id: 'change_pct', label: '% Change',      default: true  },
  ],
  warmup_usage: [
    { id: 'workspace',  label: 'Workspace',     default: true  },
    { id: 'sends',      label: 'Sends',         default: true  },
    { id: 'opens',      label: 'Opens',         default: true  },
    { id: 'replies',    label: 'Replies',       default: true  },
    { id: 'spam_rescue',label: 'Spam Rescues',  default: false },
    { id: 'open_rate',  label: 'Open Rate',     default: false },
    { id: 'reply_rate', label: 'Reply Rate',    default: false },
  ],
  deliverability: [
    { id: 'domain',     label: 'Domain',        default: true  },
    { id: 'inbox_pct',  label: 'Inbox %',       default: true  },
    { id: 'spam_pct',   label: 'Spam %',        default: true  },
    { id: 'bounce_rate',label: 'Bounce Rate',   default: false },
    { id: 'dkim',       label: 'DKIM Pass',     default: false },
    { id: 'spf',        label: 'SPF Pass',      default: false },
    { id: 'dmarc',      label: 'DMARC Pass',    default: false },
  ],
  peer_health: [
    { id: 'pool',       label: 'Pool',          default: true  },
    { id: 'active',     label: 'Active Peers',  default: true  },
    { id: 'rep_score',  label: 'Rep Score',     default: true  },
    { id: 'bounces',    label: 'Bounces',       default: false },
    { id: 'deactivated',label: 'Deactivated',   default: false },
    { id: 'coverage',   label: 'Pool Coverage', default: false },
  ],
  llm_cost: [
    { id: 'provider',   label: 'Provider',      default: true  },
    { id: 'tokens',     label: 'Tokens',        default: true  },
    { id: 'cost',       label: 'Cost (₹)',      default: true  },
    { id: 'requests',   label: 'Requests',      default: false },
    { id: 'avg_tokens', label: 'Avg Tokens',    default: false },
    { id: 'budget_pct', label: '% of Budget',   default: false },
  ],
};

// ─── Date range presets ───────────────────────────────────────────────────────

type DateRangeId = 'last7' | 'last30' | 'last90' | 'mtd' | 'custom';

interface DateRangePreset {
  id:    DateRangeId;
  label: string;
  from:  string; // ISO
  to:    string; // ISO
}

const TODAY_ISO = '2026-06-01';

const DATE_PRESETS: DateRangePreset[] = [
  { id: 'last7',  label: 'Last 7 days',  from: '2026-05-25', to: TODAY_ISO },
  { id: 'last30', label: 'Last 30 days', from: '2026-05-02', to: TODAY_ISO },
  { id: 'last90', label: 'Last 90 days', from: '2026-03-03', to: TODAY_ISO },
  { id: 'mtd',    label: 'Month to date',from: '2026-06-01', to: TODAY_ISO },
  { id: 'custom', label: 'Custom range', from: '2026-04-01', to: TODAY_ISO },
];

// ─── Export formats ───────────────────────────────────────────────────────────

type ExportFormat = 'CSV' | 'PDF' | 'XLSX';

const FORMAT_META: Record<ExportFormat, { icon: typeof FileText; color: string; bg: string }> = {
  CSV:  { icon: Table,           color: T.success, bg: T.successDim },
  PDF:  { icon: FileText,        color: T.danger,  bg: T.dangerDim  },
  XLSX: { icon: FileSpreadsheet, color: T.accentHi, bg: T.accentDim },
};

// ─── Segmentation filter types ────────────────────────────────────────────────

type PlanFilter    = 'Free' | 'Starter' | 'Pro' | 'Pro Plus' | 'Agency';
type RegionFilter  = 'India' | 'International' | 'All';
type StatusFilter  = 'Active' | 'All';
type GroupByDim    = 'None' | 'Plan' | 'Month' | 'Region';
type ChartViewType = 'Table' | 'Bar' | 'Line';

const ALL_PLANS: PlanFilter[] = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];

// ─── Mock recent exports ──────────────────────────────────────────────────────

interface ExportRow {
  id:        string;
  name:      string;
  typeId:    ReportTypeId;
  format:    ExportFormat;
  size:      string;
  createdAt: string; // ISO
  by:        string;
  status:    'done' | 'generating';
}

const INIT_EXPORTS: ExportRow[] = [
  {
    id: 'exp001', name: 'Revenue May 2026',
    typeId: 'revenue', format: 'PDF', size: '2.4 MB',
    createdAt: '2026-06-01T08:14:00Z', by: 'admin@warmpulse.io', status: 'done',
  },
  {
    id: 'exp002', name: 'Subscriber Growth Q1–Q2',
    typeId: 'subscriber_growth', format: 'XLSX', size: '680 KB',
    createdAt: '2026-05-31T17:42:00Z', by: 'ops@warmpulse.io', status: 'done',
  },
  {
    id: 'exp003', name: 'Warmup Usage Apr 2026',
    typeId: 'warmup_usage', format: 'CSV', size: '4.1 MB',
    createdAt: '2026-05-30T11:05:00Z', by: 'admin@warmpulse.io', status: 'done',
  },
  {
    id: 'exp004', name: 'Deliverability Last 90d',
    typeId: 'deliverability', format: 'PDF', size: '1.8 MB',
    createdAt: '2026-05-28T09:30:00Z', by: 'ops@warmpulse.io', status: 'done',
  },
  {
    id: 'exp005', name: 'Peer Health May 2026',
    typeId: 'peer_health', format: 'XLSX', size: '540 KB',
    createdAt: '2026-05-25T14:18:00Z', by: 'admin@warmpulse.io', status: 'done',
  },
  {
    id: 'exp006', name: 'LLM Cost MTD',
    typeId: 'llm_cost', format: 'CSV', size: '195 KB',
    createdAt: '2026-05-20T16:55:00Z', by: 'ops@warmpulse.io', status: 'done',
  },
];

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

// ─── Mini preview charts ──────────────────────────────────────────────────────

interface BarPoint { label: string; value: number }

const REVENUE_BARS: BarPoint[] = [
  { label: 'W1', value: 68 }, { label: 'W2', value: 74 }, { label: 'W3', value: 72 },
  { label: 'W4', value: 81 }, { label: 'W5', value: 88 }, { label: 'W6', value: 85 },
  { label: 'W7', value: 100 },
];
const GROWTH_BARS: BarPoint[] = [
  { label: 'W1', value: 55 }, { label: 'W2', value: 60 }, { label: 'W3', value: 58 },
  { label: 'W4', value: 71 }, { label: 'W5', value: 78 }, { label: 'W6', value: 82 },
  { label: 'W7', value: 100 },
];
const WARMUP_BARS: BarPoint[] = [
  { label: 'W1', value: 70 }, { label: 'W2', value: 65 }, { label: 'W3', value: 80 },
  { label: 'W4', value: 75 }, { label: 'W5', value: 90 }, { label: 'W6', value: 95 },
  { label: 'W7', value: 100 },
];
const DELIV_BARS: BarPoint[] = [
  { label: 'W1', value: 96 }, { label: 'W2', value: 95 }, { label: 'W3', value: 97 },
  { label: 'W4', value: 94 }, { label: 'W5', value: 96 }, { label: 'W6', value: 93 },
  { label: 'W7', value: 94 },
];
const PEER_BARS: BarPoint[] = [
  { label: 'W1', value: 88 }, { label: 'W2', value: 90 }, { label: 'W3', value: 85 },
  { label: 'W4', value: 92 }, { label: 'W5', value: 95 }, { label: 'W6', value: 91 },
  { label: 'W7', value: 100 },
];
const LLM_BARS: BarPoint[] = [
  { label: 'W1', value: 45 }, { label: 'W2', value: 58 }, { label: 'W3', value: 62 },
  { label: 'W4', value: 70 }, { label: 'W5', value: 78 }, { label: 'W6', value: 85 },
  { label: 'W7', value: 100 },
];

const BARS_BY_TYPE: Record<ReportTypeId, BarPoint[]> = {
  revenue:           REVENUE_BARS,
  subscriber_growth: GROWTH_BARS,
  warmup_usage:      WARMUP_BARS,
  deliverability:    DELIV_BARS,
  peer_health:       PEER_BARS,
  llm_cost:          LLM_BARS,
};

// Mini table rows for each type
interface PreviewTableRow { label: string; col1: string; col2: string; col3: string }

const TABLE_BY_TYPE: Record<ReportTypeId, { headers: [string, string, string]; rows: PreviewTableRow[] }> = {
  revenue: {
    headers: ['Workspace', 'MRR', 'Change'],
    rows: [
      { label: 'BrightWave Media', col1: formatMoney(29900),  col2: '+8.2%',  col3: '' },
      { label: 'Velocity Reach',   col1: formatMoney(14900),  col2: '+5.1%',  col3: '' },
      { label: 'Aufwind GmbH',     col1: formatMoney(14900),  col2: '+3.4%',  col3: '' },
      { label: 'OutreachPilot',    col1: formatMoney(3900),   col2: '+1.2%',  col3: '' },
    ],
  },
  subscriber_growth: {
    headers: ['Plan', 'New', 'Churned'],
    rows: [
      { label: 'Agency',   col1: formatNumber(42),  col2: formatNumber(3),  col3: '' },
      { label: 'Pro Plus', col1: formatNumber(118), col2: formatNumber(9),  col3: '' },
      { label: 'Pro',      col1: formatNumber(231), col2: formatNumber(22), col3: '' },
      { label: 'Starter',  col1: formatNumber(402), col2: formatNumber(41), col3: '' },
    ],
  },
  warmup_usage: {
    headers: ['Workspace', 'Sends', 'Opens'],
    rows: [
      { label: 'BrightWave Media', col1: formatNumber(184200), col2: formatNumber(172100), col3: '' },
      { label: 'Velocity Reach',   col1: formatNumber(122400), col2: formatNumber(115600), col3: '' },
      { label: 'Aufwind GmbH',     col1: formatNumber(98700),  col2: formatNumber(91800),  col3: '' },
      { label: 'SendLoop Labs',    col1: formatNumber(74500),  col2: formatNumber(68400),  col3: '' },
    ],
  },
  deliverability: {
    headers: ['Domain', 'Inbox %', 'Spam %'],
    rows: [
      { label: 'brightwave.io',    col1: '96.2%', col2: '3.8%',  col3: '' },
      { label: 'velocityreach.in', col1: '94.8%', col2: '5.2%',  col3: '' },
      { label: 'aufwind.de',       col1: '93.1%', col2: '6.9%',  col3: '' },
      { label: 'sendloop.co',      col1: '91.4%', col2: '8.6%',  col3: '' },
    ],
  },
  peer_health: {
    headers: ['Peer Pool', 'Active', 'Rep Score'],
    rows: [
      { label: 'Default Pool', col1: formatNumber(198), col2: '0.91', col3: '' },
      { label: 'Premium Pool', col1: formatNumber(72),  col2: '0.95', col3: '' },
      { label: 'Archive Pool', col1: formatNumber(42),  col2: '0.78', col3: '' },
      { label: 'Deactivated',  col1: formatNumber(14),  col2: '0.22', col3: '' },
    ],
  },
  llm_cost: {
    headers: ['Provider', 'Tokens', 'Cost'],
    rows: [
      { label: 'Gemini Flash',  col1: formatNumber(2940000), col2: formatMoney(2100), col3: '' },
      { label: 'Gemini Pro',    col1: formatNumber(840000),  col2: formatMoney(716),  col3: '' },
      { label: 'Claude Haiku',  col1: formatNumber(720000),  col2: formatMoney(432),  col3: '' },
      { label: 'Claude Sonnet', col1: formatNumber(330000),  col2: formatMoney(786),  col3: '' },
    ],
  },
};

// KPI tiles per report type
interface KpiTile { label: string; value: number; prefix?: string; suffix?: string; delta: number; decimals?: number }

const KPI_BY_TYPE: Record<ReportTypeId, KpiTile[]> = {
  revenue: [
    { label: 'Total MRR',   value: 847200,  prefix: '₹', delta:  12.4 },
    { label: 'Net Revenue', value: 792100,  prefix: '₹', delta:   9.8 },
    { label: 'Refunds',     value: 55100,   prefix: '₹', delta:  -3.2 },
    { label: 'Workspaces',  value: 284,                  delta:   4.0 },
  ],
  subscriber_growth: [
    { label: 'Active',      value: 2843,                 delta:   8.1 },
    { label: 'New This Mo', value: 793,                  delta:  14.6 },
    { label: 'Churned',     value: 75,                   delta:  -5.2 },
    { label: 'Conv. Rate',  value: 68.4,    suffix: '%', delta:   2.1, decimals: 1 },
  ],
  warmup_usage: [
    { label: 'Total Sends', value: 1240600,              delta:   5.7 },
    { label: 'Opens',       value: 1168400,              delta:   4.9 },
    { label: 'Replies',     value: 872300,               delta:   6.2 },
    { label: 'Open Rate',   value: 94.2,    suffix: '%', delta:  -0.3, decimals: 1 },
  ],
  deliverability: [
    { label: 'Inbox Rate',  value: 94.2,    suffix: '%', delta:  -0.3, decimals: 1 },
    { label: 'Spam Rate',   value: 5.8,     suffix: '%', delta:   0.3, decimals: 1 },
    { label: 'Bounce Rate', value: 1.4,     suffix: '%', delta:  -0.1, decimals: 1 },
    { label: 'Domains',     value: 318,                  delta:   2.0 },
  ],
  peer_health: [
    { label: 'Active Peers',  value: 312,                delta:   1.3 },
    { label: 'Avg Rep Score', value: 0.89,               delta:   0.8, decimals: 2 },
    { label: 'Deactivated',   value: 14,                 delta: -18.8 },
    { label: 'Pool Coverage', value: 96.4,  suffix: '%', delta:   0.7, decimals: 1 },
  ],
  llm_cost: [
    { label: 'Total Cost',  value: 3189,    prefix: '₹', delta:  18.2 },
    { label: 'Total Tokens',value: 4830000,              delta:  16.7 },
    { label: 'Requests',    value: 28400,                delta:  12.4 },
    { label: 'Cost / 1K',   value: 0.66,    prefix: '₹', delta:  -1.3, decimals: 2 },
  ],
};

// ─── Animated SVG bar chart ───────────────────────────────────────────────────

function MiniBarChart({
  bars,
  color,
  typeKey,
}: {
  bars: BarPoint[];
  color: string;
  typeKey: string;
}) {
  const W = 300;
  const H = 90;
  const PAD = { top: 8, right: 8, bottom: 22, left: 8 };
  const innerH = H - PAD.top - PAD.bottom;
  const barW = (W - PAD.left - PAD.right) / bars.length;
  const gap  = barW * 0.28;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
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
              transition={{
                duration: 0.7, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1],
                type: 'spring', stiffness: 220, damping: 22,
              }}
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

// ─── Animated SVG line chart ──────────────────────────────────────────────────

function MiniLineChart({
  bars,
  color,
  typeKey,
}: {
  bars: BarPoint[];
  color: string;
  typeKey: string;
}) {
  const W = 300;
  const H = 90;
  const PAD = { top: 10, right: 14, bottom: 22, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pts = bars.map((b, i) => ({
    x: PAD.left + (i / (bars.length - 1)) * innerW,
    y: PAD.top + innerH - (b.value / 100) * innerH,
    label: b.label,
  }));

  const pathD = pts.reduce(
    (acc, pt, i) => acc + (i === 0 ? `M${pt.x},${pt.y}` : ` L${pt.x},${pt.y}`),
    ''
  );
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

      {/* Area fill */}
      <motion.path
        d={fillD}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      />

      {/* Line stroke */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Data-point dots */}
      {pts.map((pt, i) => (
        <motion.circle
          key={pt.label}
          cx={pt.x} cy={pt.y} r={3}
          fill={color}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.8 + i * 0.05, type: 'spring', stiffness: 400, damping: 22 }}
        />
      ))}

      {/* X labels */}
      {pts.map((pt) => (
        <text key={`lbl-${pt.label}`} x={pt.x} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.30)">
          {pt.label}
        </text>
      ))}
    </svg>
  );
}

// ─── KPI Summary Tiles ────────────────────────────────────────────────────────

function KpiTiles({ tiles, compare }: { tiles: KpiTile[]; compare: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {tiles.map((tile) => {
        const isPos = tile.delta >= 0;
        const animated = useAnimatedCounter(tile.value, tile.decimals ?? 0);

        const displayVal = (() => {
          const raw = parseFloat(animated.replace(/,/g, ''));
          if (tile.prefix === '₹') return formatMoney(isNaN(raw) ? 0 : raw);
          if (tile.suffix)         return `${animated}${tile.suffix}`;
          return animated;
        })();

        return (
          <motion.div
            key={tile.label}
            layout
            style={{
              background:   'rgba(255,255,255,0.06)',
              border:       '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              padding:      '12px 14px',
              display:      'flex',
              flexDirection:'column',
              gap:          4,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          >
            <span style={{ ...MICRO, fontSize: 9 }}>{tile.label}</span>
            <span
              style={{
                fontSize:           18,
                fontWeight:         800,
                color:              T.text,
                letterSpacing:      '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight:         1.1,
              }}
            >
              {displayVal}
            </span>
            <AnimatePresence>
              {compare && (
                <motion.span
                  key="delta"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    display:     'inline-flex',
                    alignItems:  'center',
                    gap:         3,
                    fontSize:    10,
                    fontWeight:  700,
                    color:       isPos ? T.success : T.danger,
                  }}
                >
                  {isPos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {isPos ? '+' : ''}{tile.delta.toFixed(1)}%
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Preview panel ────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  type:        ReportType;
  dateRange:   DateRangePreset;
  cols:        Set<string>;
  plans:       Set<PlanFilter>;
  region:      RegionFilter;
  status:      StatusFilter;
  groupBy:     GroupByDim;
  compare:     boolean;
  chartView:   ChartViewType;
}

function PreviewPanel({
  type, dateRange, cols, plans, region, status, groupBy, compare, chartView,
}: PreviewPanelProps) {
  const bars    = BARS_BY_TYPE[type.id];
  const tblData = TABLE_BY_TYPE[type.id];
  const kpiData = KPI_BY_TYPE[type.id];
  const color   = type.color;
  const Icon    = type.icon;

  // filter rows by active plan filter if applicable
  const filteredRows = (() => {
    const allRows = tblData.rows;
    if (type.id === 'subscriber_growth' && plans.size < ALL_PLANS.length) {
      return allRows.filter((r) => plans.has(r.label as PlanFilter));
    }
    return allRows;
  })();

  // group-by label adjustment
  const groupLabel = groupBy !== 'None' ? `Grouped by ${groupBy}` : null;

  // computed estimated rows / size based on config
  const baseCols  = cols.size || 3;
  const baseRows  = 100 + (plans.size < ALL_PLANS.length ? plans.size * 40 : 200);
  const sizeBytes = baseCols * baseRows * 120 + (compare ? 50 : 0);
  const sizeLabel = sizeBytes > 1_000_000
    ? `~${(sizeBytes / 1_000_000).toFixed(1)} MB`
    : `~${Math.round(sizeBytes / 1024)} KB`;

  // Status + region override label
  const scopeLabel = [
    status === 'Active' ? 'Active only' : '',
    region !== 'All' ? region : '',
  ].filter(Boolean).join(' · ') || 'All scope';

  return (
    <motion.div
      variants={PREVIEW_V}
      initial="hidden"
      animate="visible"
      exit="exit"
      key={`${type.id}-${groupBy}-${compare}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: `${color}22`, border: `1px solid ${color}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon size={18} color={color} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{type.label}</div>
            <div style={{ fontSize: 11, color: T.faint }}>{type.desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {groupLabel && (
            <span
              style={{
                padding: '3px 9px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: T.warningDim, border: `1px solid ${T.warning}33`, color: T.warning,
              }}
            >
              {groupLabel}
            </span>
          )}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              fontSize: 11, color: T.dim, fontWeight: 600,
            }}
          >
            <Calendar size={11} />
            {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
          </div>
        </div>
      </div>

      {/* KPI summary tiles */}
      <KpiTiles tiles={kpiData} compare={compare} />

      {/* Estimated output */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 10, color: T.faint,
        }}
      >
        <FileText size={10} />
        <span>Est. output:</span>
        <span style={{ color: T.dim, fontWeight: 700 }}>{formatNumber(baseRows)} rows</span>
        <span>·</span>
        <span style={{ color: T.dim, fontWeight: 700 }}>{sizeLabel}</span>
        <span>·</span>
        <span>{baseCols} cols</span>
        <span>·</span>
        <span>{scopeLabel}</span>
      </div>

      {/* Chart-type view */}
      <AnimatePresence mode="wait">
        {chartView === 'Table' && (
          <motion.div
            key={`table-${groupBy}`}
            variants={PREVIEW_V}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              borderRadius: 12, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 100px',
                padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {tblData.headers.map((h) => (
                <span key={h} style={{ ...MICRO, fontSize: 9 }}>{h}</span>
              ))}
            </div>
            {/* Table rows */}
            <AnimatePresence mode="popLayout">
              {(filteredRows.length > 0 ? filteredRows : tblData.rows).map((row, i) => (
                <motion.div
                  key={`${row.label}-${groupBy}`}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: 0.06 + i * 0.05, type: 'spring', stiffness: 240, damping: 24 }}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 100px 100px',
                    padding: '7px 14px',
                    borderBottom: i < (filteredRows.length > 0 ? filteredRows : tblData.rows).length - 1
                      ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12, color: T.dim, fontWeight: 500 }}>
                    {cols.size > 0 && !cols.has('workspace') && !cols.has('plan') && !cols.has('domain') && !cols.has('pool') && !cols.has('provider') && !cols.has('workspace')
                      ? row.label
                      : row.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
                    {row.col1}
                  </span>
                  <span
                    style={{
                      fontSize: 11, fontVariantNumeric: 'tabular-nums',
                      color: row.col2.startsWith('+') ? T.success : row.col2.startsWith('-') ? T.danger : T.faint,
                    }}
                  >
                    {row.col2}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {chartView === 'Bar' && (
          <motion.div
            key={`bar-${type.id}`}
            variants={PREVIEW_V}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              borderRadius: 12, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              padding: '10px 10px 4px', height: 120,
              display: 'flex', alignItems: 'stretch',
            }}
          >
            <MiniBarChart bars={bars} color={color} typeKey={`${type.id}-full`} />
          </motion.div>
        )}

        {chartView === 'Line' && (
          <motion.div
            key={`line-${type.id}`}
            variants={PREVIEW_V}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              borderRadius: 12, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              padding: '10px 10px 4px', height: 120,
              display: 'flex', alignItems: 'stretch',
            }}
          >
            <MiniLineChart bars={bars} color={color} typeKey={type.id} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer watermark */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
          borderRadius: 8, background: 'rgba(255,255,255,0.03)',
          fontSize: 10, color: T.faint,
        }}
      >
        <Eye size={10} />
        Preview only — actual export will include all workspaces for the selected period
      </div>
    </motion.div>
  );
}

// ─── Generate button ──────────────────────────────────────────────────────────

type GenState = 'idle' | 'generating' | 'done';

function GenerateButton({ state, onClick }: { state: GenState; onClick: () => void }) {
  const progress = useAnimatedCounter(state === 'generating' ? 100 : 0, 0);
  const pct = state === 'generating' ? parseInt(progress, 10) : state === 'done' ? 100 : 0;

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
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            background: 'rgba(255,255,255,0.18)',
            originX: 0, borderRadius: 'inherit',
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.span key="idle"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.18 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Play size={14} />Generate Report
            </motion.span>
          )}
          {state === 'generating' && (
            <motion.span key="gen"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.18 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} style={{ display: 'flex' }}>
                <RefreshCw size={14} />
              </motion.span>
              Generating…
            </motion.span>
          )}
          {state === 'done' && (
            <motion.span key="done"
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <CheckCircle2 size={14} />Report Ready!
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

// ─── Export row item ──────────────────────────────────────────────────────────

interface ExportRowItemProps {
  row:      ExportRow;
  isNew:    boolean;
  onRerun:  (row: ExportRow) => void;
  onDelete: (id: string) => void;
}

function ExportRowItem({ row, isNew, onRerun, onDelete }: ExportRowItemProps) {
  const type    = REPORT_TYPES.find((t) => t.id === row.typeId) ?? (REPORT_TYPES[0] as ReportType);
  const fmtMeta = FORMAT_META[row.format];
  const FmtIcon = fmtMeta.icon;

  return (
    <motion.div
      layout
      variants={EXPORT_ROW_V}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 }}
      style={{
        display:    'grid',
        gridTemplateColumns: '28px 1fr 80px 70px 80px 80px auto',
        gap:        10,
        alignItems: 'center',
        padding:    '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor:     'default',
        position:   'relative',
      }}
    >
      {isNew && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.3 }}
          style={{
            position: 'absolute', left: -1, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 28, background: T.success, borderRadius: '0 3px 3px 0',
          }}
        />
      )}

      {/* Type icon */}
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${type.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <type.icon size={13} color={type.color} strokeWidth={2.2} />
      </div>

      {/* Name + type */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.name}
        </div>
        <div style={{ fontSize: 10, color: T.faint }}>{type.label}</div>
      </div>

      {/* Format */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, background: fmtMeta.bg, border: `1px solid ${fmtMeta.color}33`, color: fmtMeta.color, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
        <FmtIcon size={9} />{row.format}
      </span>

      {/* Size */}
      <span style={{ fontSize: 11, color: T.faint }}>{row.size}</span>

      {/* Date */}
      <span style={{ fontSize: 11, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(row.createdAt)}
      </span>

      {/* By */}
      <span style={{ fontSize: 10, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.by.split('@')[0] ?? row.by}
      </span>

      {/* Row actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <motion.button
          whileHover={{ scale: 1.18, color: T.accentHi }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onRerun(row)}
          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.10)`, color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title="Re-run this config"
        >
          <Repeat size={12} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.18, color: T.success }}
          whileTap={{ scale: 0.92 }}
          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.10)`, color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title="Download"
        >
          <Download size={12} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.18, color: T.danger }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onDelete(row.id)}
          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(255,255,255,0.10)`, color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          title="Delete export"
        >
          <Trash2 size={12} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastItem { id: string; msg: string; color: string; icon: ReactNode }
let _toastId = 0;

// ─── Toggle option ────────────────────────────────────────────────────────────

function ToggleOption({
  label, checked, onChange, color = T.accent,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: T.dim }}>{label}</span>
      <motion.button
        onClick={() => onChange(!checked)}
        whileTap={{ scale: 0.9 }}
        style={{
          width: 38, height: 20, borderRadius: 10,
          background: checked ? color : 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.12)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.25s', flexShrink: 0,
        }}
      >
        <motion.div
          animate={{ x: checked ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff' }}
        />
      </motion.button>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function StepHeading({ step, icon: Icon, label }: { step: number | string; icon?: typeof Eye; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div
        style={{
          width: 20, height: 20, borderRadius: 6,
          background: T.accentDim, border: `1px solid ${T.accent}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: T.accent, flexShrink: 0,
        }}
      >
        {step}
      </div>
      {Icon && <Icon size={13} color={T.faint} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{label}</span>
    </div>
  );
}

// ─── Template row ─────────────────────────────────────────────────────────────

interface TemplateItem { id: string; name: string; typeId: ReportTypeId }

// ─── Cadence options ──────────────────────────────────────────────────────────

type ScheduleCadence = 'Daily' | 'Weekly' | 'Monthly';

const NEXT_RUN_BY_CADENCE: Record<ScheduleCadence, string> = {
  Daily:   '2026-06-02',
  Weekly:  '2026-06-08',
  Monthly: '2026-07-01',
};

// ─── Main component ───────────────────────────────────────────────────────────

export function AdmRptRP1Studio() {
  const [selectedType,   setSelectedType]   = useState<ReportTypeId>('revenue');
  const [selectedRange,  setSelectedRange]  = useState<DateRangeId>('last30');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('PDF');
  const [genState,       setGenState]       = useState<GenState>('idle');
  const [exports,        setExports]        = useState<ExportRow[]>(INIT_EXPORTS);
  const [newExportIds,   setNewExportIds]   = useState<Set<string>>(new Set());
  const [toasts,         setToasts]         = useState<ToastItem[]>([]);

  // Options
  const [optCharts,    setOptCharts]    = useState(true);
  const [optSummary,   setOptSummary]   = useState(true);
  const [optRawRows,   setOptRawRows]   = useState(false);
  const [optWorkspace, setOptWorkspace] = useState(true);

  // Columns selection: per type, default set
  const defaultColsForType = useCallback((typeId: ReportTypeId): Set<string> => {
    return new Set((COLUMNS_BY_TYPE[typeId] ?? []).filter((c) => c.default).map((c) => c.id));
  }, []);

  const [selectedCols, setSelectedCols] = useState<Set<string>>(() => defaultColsForType('revenue'));

  // Sync cols when type changes
  useEffect(() => {
    setSelectedCols(defaultColsForType(selectedType));
  }, [selectedType, defaultColsForType]);

  // Segmentation filters
  const [filterPlans,  setFilterPlans]  = useState<Set<PlanFilter>>(new Set(ALL_PLANS));
  const [filterRegion, setFilterRegion] = useState<RegionFilter>('All');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('All');

  // Group by
  const [groupBy, setGroupBy] = useState<GroupByDim>('None');

  // Compare
  const [comparePrev, setComparePrev] = useState(false);

  // Chart view
  const [chartView, setChartView] = useState<ChartViewType>('Table');

  // Delivery / automation
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients,     setRecipients]     = useState<string[]>(['admin@warmpulse.io']);
  const [templateName,   setTemplateName]   = useState('');
  const [templates,      setTemplates]      = useState<TemplateItem[]>([]);
  const [scheduleOn,     setScheduleOn]     = useState(false);
  const [cadence,        setCadence]        = useState<ScheduleCadence>('Weekly');

  const genTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      if (genTimerRef.current !== null) clearTimeout(genTimerRef.current);
      toastTimersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const showToast = useCallback((msg: string, color: string, icon: ReactNode) => {
    const id = String(++_toastId);
    setToasts((prev) => [...prev, { id, msg, color, icon }]);
    const t = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      toastTimersRef.current.delete(id);
    }, 3800) as unknown as number;
    toastTimersRef.current.set(id, t);
  }, []);

  const handleGenerate = useCallback(() => {
    if (genState !== 'idle') return;
    setGenState('generating');
    genTimerRef.current = setTimeout(() => {
      setGenState('done');
      const typeObj  = REPORT_TYPES.find((t) => t.id === selectedType) ?? (REPORT_TYPES[0] as ReportType);
      const rangeObj = DATE_PRESETS.find((d) => d.id === selectedRange) ?? (DATE_PRESETS[1] as DateRangePreset);
      const newId    = `exp-${Date.now()}`;
      const newRow: ExportRow = {
        id:        newId,
        name:      `${typeObj.label} · ${rangeObj.label}`,
        typeId:    selectedType,
        format:    selectedFormat,
        size:      selectedFormat === 'PDF' ? '2.1 MB' : selectedFormat === 'XLSX' ? '740 KB' : '3.2 MB',
        createdAt: new Date().toISOString(),
        by:        'admin@warmpulse.io',
        status:    'done',
      };
      setExports((prev) => [newRow, ...prev]);
      setNewExportIds((prev) => new Set([...prev, newId]));
      showToast(`${typeObj.label} report ready — ${selectedFormat}`, T.success, <CheckCircle2 size={14} />);
      genTimerRef.current = setTimeout(() => { setGenState('idle'); }, 2500);
    }, 2000);
  }, [genState, selectedType, selectedRange, selectedFormat, showToast]);

  const handleDeleteExport = useCallback((id: string) => {
    setExports((prev) => prev.filter((e) => e.id !== id));
    showToast('Export deleted', T.danger, <Trash2 size={14} />);
  }, [showToast]);

  const handleRerunExport = useCallback((row: ExportRow) => {
    setSelectedType(row.typeId);
    setSelectedFormat(row.format);
    showToast(`Config loaded from "${row.name}"`, T.accentHi, <RefreshCw size={14} />);
  }, [showToast]);

  const handleAddRecipient = useCallback(() => {
    const v = recipientInput.trim();
    if (!v) return;
    if (!recipients.includes(v)) {
      setRecipients((prev) => [...prev, v]);
    }
    setRecipientInput('');
  }, [recipientInput, recipients]);

  const handleRecipientKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddRecipient();
  }, [handleAddRecipient]);

  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    const newTpl: TemplateItem = { id: `tpl-${Date.now()}`, name, typeId: selectedType };
    setTemplates((prev) => [newTpl, ...prev]);
    setTemplateName('');
    showToast(`Template "${name}" saved`, T.success, <Bookmark size={14} />);
  }, [templateName, selectedType, showToast]);

  const togglePlan = useCallback((plan: PlanFilter) => {
    setFilterPlans((prev) => {
      const next = new Set(prev);
      if (next.has(plan)) { if (next.size > 1) next.delete(plan); }
      else next.add(plan);
      return next;
    });
  }, []);

  const toggleCol = useCallback((colId: string) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) { if (next.size > 1) next.delete(colId); }
      else next.add(colId);
      return next;
    });
  }, []);

  const activeType  = REPORT_TYPES.find((t) => t.id === selectedType) ?? (REPORT_TYPES[0] as ReportType);
  const activeRange = DATE_PRESETS.find((d) => d.id === selectedRange) ?? (DATE_PRESETS[1] as DateRangePreset);
  const activeCols  = COLUMNS_BY_TYPE[selectedType] ?? [];

  // Active segmentation filter chips (for display)
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
    <div
      style={{
        minHeight: '100vh', background: 'transparent', color: T.text,
        fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
        padding: '28px 28px 48px', position: 'relative', boxSizing: 'border-box',
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 800, height: 360,
          background: `radial-gradient(ellipse 70% 50% at 50% 0%, rgba(242,101,34,0.10) 0%, transparent 70%)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      <motion.div
        variants={CONTAINER_V}
        initial="hidden"
        animate="visible"
        style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {/* ── Page header ── */}
        <motion.div variants={CARD_V} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <motion.div
              style={{
                width: 46, height: 46, borderRadius: 14,
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentHi})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 24px ${T.accent}40`,
              }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
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
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 99, background: T.successDim, border: `1px solid ${T.success}33`,
                fontSize: 11, fontWeight: 700, color: T.success,
              }}
            >
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {REPORT_TYPES.map((rt) => {
                  const isActive = rt.id === selectedType;
                  return (
                    <motion.button
                      key={rt.id}
                      onClick={() => setSelectedType(rt.id)}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                        borderRadius: 10,
                        background: isActive ? `${rt.color}18` : 'transparent',
                        border: isActive ? `1px solid ${rt.color}44` : '1px solid transparent',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.18s, border-color 0.18s',
                        position: 'relative', overflow: 'hidden',
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="type-glow"
                          style={{
                            position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
                            background: `radial-gradient(ellipse 60% 80% at 0% 50%, ${rt.color}18 0%, transparent 65%)`,
                          }}
                        />
                      )}
                      <div
                        style={{
                          width: 28, height: 28, borderRadius: 8, position: 'relative', zIndex: 1,
                          background: isActive ? `${rt.color}28` : 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        <rt.icon size={14} color={isActive ? rt.color : T.faint} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? rt.color : T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rt.label}
                        </div>
                        {isActive && (
                          <div style={{ fontSize: 10, color: T.faint, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {rt.metric}: {rt.metricVal}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <motion.div
                          layoutId="type-tick"
                          style={{
                            width: 16, height: 16, borderRadius: '50%', background: rt.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                        >
                          <CheckCircle2 size={10} color="#fff" strokeWidth={3} />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Date range */}
            <div style={glass({ padding: '18px 18px' })}>
              <StepHeading step="2" icon={Calendar} label="Date Range" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {DATE_PRESETS.map((dp) => {
                  const isActive = dp.id === selectedRange;
                  return (
                    <motion.button
                      key={dp.id}
                      onClick={() => setSelectedRange(dp.id)}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 9,
                        background: isActive ? T.accentDim : 'transparent',
                        border: isActive ? `1px solid ${T.accent}44` : '1px solid transparent',
                        cursor: 'pointer', transition: 'background 0.18s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={12} color={isActive ? T.accentHi : T.faint} strokeWidth={2.2} />
                        <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? T.accentHi : T.dim }}>
                          {dp.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: T.faint }}>
                        {formatDate(dp.from)} – {formatDate(dp.to)}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Format */}
            <div style={glass({ padding: '18px 18px' })}>
              <StepHeading step="3" label="Export Format" />
              <div style={{ display: 'flex', gap: 8 }}>
                {(['CSV', 'PDF', 'XLSX'] as ExportFormat[]).map((fmt) => {
                  const isActive = fmt === selectedFormat;
                  const meta = FORMAT_META[fmt];
                  const FmtIcon = meta.icon;
                  return (
                    <motion.button
                      key={fmt}
                      onClick={() => setSelectedFormat(fmt)}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '12px 8px', borderRadius: 10,
                        background: isActive ? meta.bg : 'rgba(255,255,255,0.04)',
                        border: isActive ? `1px solid ${meta.color}44` : '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer', position: 'relative', overflow: 'hidden',
                        transition: 'background 0.18s, border-color 0.18s',
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="format-underline"
                          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: meta.color, borderRadius: '2px 2px 0 0' }}
                        />
                      )}
                      <FmtIcon size={18} color={isActive ? meta.color : T.faint} strokeWidth={2} />
                      <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 600, color: isActive ? meta.color : T.faint, letterSpacing: '0.06em' }}>
                        {fmt}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Step 4: Columns / metrics */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="4" icon={LayoutGrid} label="Columns / Metrics" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeCols.map((col) => {
                  const isOn = selectedCols.has(col.id);
                  return (
                    <motion.button
                      key={col.id}
                      onClick={() => toggleCol(col.id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)',
                        border: isOn ? `1px solid ${T.accent}44` : '1px solid rgba(255,255,255,0.08)',
                        color: isOn ? T.accentHi : T.faint,
                        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      }}
                    >
                      {col.label}
                    </motion.button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: T.faint }}>
                {selectedCols.size} of {activeCols.length} columns selected
              </div>
            </motion.div>

            {/* Step 5: Segmentation filters */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="5" icon={Filter} label="Segmentation Filters" />

              {/* Plan multi-select */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Plan</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ALL_PLANS.map((plan) => {
                    const isOn = filterPlans.has(plan);
                    return (
                      <motion.button
                        key={plan}
                        onClick={() => togglePlan(plan)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          padding: '3px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                          background: isOn ? T.successDim : 'rgba(255,255,255,0.04)',
                          border: isOn ? `1px solid ${T.success}44` : '1px solid rgba(255,255,255,0.08)',
                          color: isOn ? T.success : T.faint,
                          transition: 'all 0.15s',
                        }}
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
                  {(['India', 'International', 'All'] as RegionFilter[]).map((r) => {
                    const isOn = filterRegion === r;
                    return (
                      <motion.button
                        key={r}
                        onClick={() => setFilterRegion(r)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                          background: isOn ? T.warningDim : 'rgba(255,255,255,0.04)',
                          border: isOn ? `1px solid ${T.warning}44` : '1px solid rgba(255,255,255,0.08)',
                          color: isOn ? T.warning : T.faint,
                          transition: 'all 0.15s',
                        }}
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
                  {(['Active', 'All'] as StatusFilter[]).map((s) => {
                    const isOn = filterStatus === s;
                    return (
                      <motion.button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                          background: isOn ? T.amberDim : 'rgba(255,255,255,0.04)',
                          border: isOn ? `1px solid ${T.amber}44` : '1px solid rgba(255,255,255,0.08)',
                          color: isOn ? T.amber : T.faint,
                          transition: 'all 0.15s',
                        }}
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
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ marginTop: 10, overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {activeFilterChips.map((chip) => (
                        <motion.span
                          key={chip.label}
                          variants={CHIP_V}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 20,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                            fontSize: 10, fontWeight: 600, color: T.dim,
                          }}
                        >
                          {chip.label}
                          <motion.button
                            onClick={chip.onRemove}
                            whileHover={{ scale: 1.3, color: T.danger }}
                            style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}
                          >
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
                {(['None', 'Plan', 'Month', 'Region'] as GroupByDim[]).map((dim) => {
                  const isOn = groupBy === dim;
                  return (
                    <motion.button
                      key={dim}
                      onClick={() => setGroupBy(dim)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      layout
                      style={{
                        padding: '5px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)',
                        border: isOn ? `1px solid ${T.accent}55` : '1px solid rgba(255,255,255,0.08)',
                        color: isOn ? T.accentHi : T.faint,
                        transition: 'all 0.15s',
                      }}
                    >
                      {dim}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* Step 7: Options */}
            <motion.div variants={SECTION_V} style={glass({ padding: '18px 18px' })}>
              <StepHeading step="7" icon={SlidersHorizontal} label="Options" />
              <ToggleOption label="Include charts"          checked={optCharts}    onChange={setOptCharts}    color={T.accent} />
              <ToggleOption label="Executive summary"       checked={optSummary}   onChange={setOptSummary}   color={T.accentHi} />
              <ToggleOption label="Include raw data rows"   checked={optRawRows}   onChange={setOptRawRows}   color={T.warning} />
              <ToggleOption label="Per-workspace breakdown" checked={optWorkspace} onChange={setOptWorkspace} color={T.success} />
              <ToggleOption label="Compare to previous period" checked={comparePrev} onChange={setComparePrev} color={T.amber} />
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
                      <motion.span
                        key={r}
                        variants={CHIP_V}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 9px', borderRadius: 20,
                          background: T.accentDim, border: `1px solid ${T.accent}33`,
                          fontSize: 10, fontWeight: 600, color: T.accentHi,
                        }}
                      >
                        {r}
                        <motion.button
                          onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))}
                          whileHover={{ scale: 1.3, color: T.danger }}
                          style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}
                        >
                          <X size={9} />
                        </motion.button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="email"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={handleRecipientKeyDown}
                    placeholder="Add email…"
                    style={{
                      flex: 1, padding: '7px 12px', borderRadius: 9, fontSize: 12,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      color: T.text, outline: 'none',
                    }}
                  />
                  <motion.button
                    onClick={handleAddRecipient}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12,
                      background: T.accentDim, border: `1px solid ${T.accent}44`, color: T.accentHi,
                      display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700,
                    }}
                  >
                    <Plus size={13} />Add
                  </motion.button>
                </div>
              </div>

              {/* Save as template */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Save as Template</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name…"
                    style={{
                      flex: 1, padding: '7px 12px', borderRadius: 9, fontSize: 12,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      color: T.text, outline: 'none',
                    }}
                  />
                  <motion.button
                    onClick={handleSaveTemplate}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 12,
                      background: T.successDim, border: `1px solid ${T.success}44`, color: T.success,
                      display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700,
                    }}
                  >
                    <Bookmark size={13} />Save
                  </motion.button>
                </div>

                <AnimatePresence>
                  {templates.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ marginTop: 8, overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {templates.map((tpl) => {
                          const tplType = REPORT_TYPES.find((t) => t.id === tpl.typeId) ?? (REPORT_TYPES[0] as ReportType);
                          return (
                            <motion.span
                              key={tpl.id}
                              variants={CHIP_V}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 9px', borderRadius: 20,
                                background: T.successDim, border: `1px solid ${T.success}33`,
                                fontSize: 10, fontWeight: 600, color: T.success,
                              }}
                            >
                              <tplType.icon size={9} />
                              {tpl.name}
                              <motion.button
                                onClick={() => setTemplates((prev) => prev.filter((t) => t.id !== tpl.id))}
                                whileHover={{ scale: 1.3, color: T.danger }}
                                style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: T.faint, padding: 0 }}
                              >
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

              {/* Schedule */}
              <div>
                <ToggleOption label="Schedule recurring report" checked={scheduleOn} onChange={setScheduleOn} color={T.accent} />
                <AnimatePresence>
                  {scheduleOn && (
                    <motion.div
                      key="schedule-controls"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ paddingTop: 10 }}>
                        <div style={{ ...MICRO, fontSize: 9, marginBottom: 6 }}>Cadence</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['Daily', 'Weekly', 'Monthly'] as ScheduleCadence[]).map((c) => {
                            const isOn = cadence === c;
                            return (
                              <motion.button
                                key={c}
                                onClick={() => setCadence(c)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                  flex: 1, padding: '6px 0', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                  background: isOn ? T.accentDim : 'rgba(255,255,255,0.05)',
                                  border: isOn ? `1px solid ${T.accent}55` : '1px solid rgba(255,255,255,0.08)',
                                  color: isOn ? T.accentHi : T.faint, transition: 'all 0.15s',
                                }}
                              >
                                {c}
                              </motion.button>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            marginTop: 8, padding: '6px 10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            fontSize: 10, color: T.dim, display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <Repeat size={10} />
                          Next run: <span style={{ fontWeight: 700, color: T.accentHi }}>
                            {formatDate(NEXT_RUN_BY_CADENCE[cadence])}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Generate button */}
            <GenerateButton state={genState} onClick={handleGenerate} />

            {/* Config summary */}
            <AnimatePresence>
              {genState === 'idle' && (
                <motion.div
                  key="cfg-summary"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ ...glassDeep(), padding: '11px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ ...MICRO, fontSize: 9 }}>Selected:</span>
                    <span style={{ fontSize: 10, color: activeType.color, fontWeight: 700 }}>{activeType.label}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: T.dim }}>{formatDate(activeRange.from)} – {formatDate(activeRange.to)}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: FORMAT_META[selectedFormat].color, fontWeight: 700 }}>{selectedFormat}</span>
                    <span style={{ fontSize: 10, color: T.faint }}>·</span>
                    <span style={{ fontSize: 10, color: T.dim }}>{selectedCols.size} cols</span>
                    {groupBy !== 'None' && (
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
                <div
                  style={{
                    display: 'flex', gap: 4, marginLeft: 'auto',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 10, padding: 3,
                  }}
                >
                  {([
                    { id: 'Table', icon: Table },
                    { id: 'Bar',   icon: BarChart2 },
                    { id: 'Line',  icon: LineChart },
                  ] as { id: ChartViewType; icon: typeof Table }[]).map(({ id: viewId, icon: ViewIcon }) => {
                    const isActive = chartView === viewId;
                    return (
                      <motion.button
                        key={viewId}
                        onClick={() => setChartView(viewId)}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.94 }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
                          background: isActive ? T.accentDim : 'transparent',
                          border: isActive ? `1px solid ${T.accent}44` : '1px solid transparent',
                          color: isActive ? T.accentHi : T.faint,
                          fontSize: 11, fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <ViewIcon size={12} />
                        {viewId}
                      </motion.button>
                    );
                  })}
                </div>

                <span style={{ fontSize: 10, color: T.faint }}>Sample data</span>
              </div>

              <div style={{ flex: 1 }}>
                <AnimatePresence mode="wait">
                  <PreviewPanel
                    key={`${selectedType}-${chartView}`}
                    type={activeType}
                    dateRange={activeRange}
                    cols={selectedCols}
                    plans={filterPlans}
                    region={filterRegion}
                    status={filterStatus}
                    groupBy={groupBy}
                    compare={comparePrev}
                    chartView={chartView}
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
                { on: scheduleOn,   label: `Sched. ${cadence}`, color: T.accentHi },
              ].map((o) => (
                <AnimatePresence key={o.label}>
                  {o.on && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
                        borderRadius: 20, background: `${o.color}14`, border: `1px solid ${o.color}33`,
                        fontSize: 10, fontWeight: 700, color: o.color,
                      }}
                    >
                      <CheckCircle2 size={9} />
                      {o.label}
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

        {/* ── Recent exports ── */}
        <motion.div variants={CARD_V}>
          <div style={glass({ padding: '0', overflow: 'hidden' })}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={14} color={T.accentHi} strokeWidth={2.2} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Exports</span>
                <span style={{ padding: '2px 9px', borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accent}33`, fontSize: 10, fontWeight: 800, color: T.accentHi }}>
                  {exports.length}
                </span>
              </div>
              <span style={{ fontSize: 11, color: T.faint }}>Re-run loads config · Download · Delete</span>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 80px 80px auto', gap: 10, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['', 'Report', 'Format', 'Size', 'Date', 'By', 'Actions'].map((h, i) => (
                <span key={i} style={{ ...MICRO, fontSize: 9 }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            <motion.div style={{ display: 'flex', flexDirection: 'column' }}>
              <AnimatePresence mode="popLayout">
                {exports.slice(0, 8).map((row) => (
                  <ExportRowItem
                    key={row.id}
                    row={row}
                    isNew={newExportIds.has(row.id)}
                    onRerun={handleRerunExport}
                    onDelete={handleDeleteExport}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Footer */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: T.faint }}>
                {exports.length} export{exports.length !== 1 ? 's' : ''} · files retained for 90 days
              </span>
              <motion.button
                whileHover={{ scale: 1.05, color: T.accentHi }}
                whileTap={{ scale: 0.96 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                  color: T.faint, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                }}
              >
                <Download size={11} />
                Export all as ZIP
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Toasts ── */}
      <div
        style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999,
          pointerEvents: 'none', alignItems: 'center',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              variants={TOAST_V}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                ...glassDeep(), pointerEvents: 'auto', padding: '12px 20px',
                display: 'flex', alignItems: 'center', gap: 10,
                minWidth: 260, color: t.color, fontSize: 13, fontWeight: 700,
                borderColor: `${t.color}44`, boxShadow: `0 6px 36px ${t.color}25`,
              }}
            >
              {t.icon}
              {t.msg}
              <motion.button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                whileHover={{ scale: 1.2 }}
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
