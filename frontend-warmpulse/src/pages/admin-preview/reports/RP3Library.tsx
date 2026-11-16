/**
 * Admin Reports — RP3 Report Library
 *
 * "Report Library" — gallery of report templates + previously generated
 * reports. Templates: Revenue / Subscriber Growth / Warmup Usage /
 * Deliverability / Peer Health / LLM Cost. Generated reports: cards with
 * mini preview, type, format, date, size. Filter by type/format; click
 * to preview in a morphing layoutId modal.
 *
 * Self-contained: inline styles only, mock data only.
 * Only @/lib/format is imported from @/. Dark "Aurora Glass" palette.
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
  animate,
  type Variants,
} from 'framer-motion';
import {
  FileText,
  BarChart2,
  Users,
  Mail,
  Activity,
  Cpu,
  Download,
  Play,
  X,
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  Database,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  File,
  Grid3x3,
  Layers,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  text: '#fff' as string,
  dim: 'rgba(255,255,255,0.62)' as string,
  faint: 'rgba(255,255,255,0.38)' as string,
  accent: '#F26522' as string,
  accentSoft: '#FF8A4B' as string,
  success: '#3ddc97' as string,
  danger: '#ff5c7a' as string,
  warning: '#FF8A4B' as string,
  hairline: 'rgba(255,255,255,0.08)' as string,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 16,
  } as CSSProperties,
  glassHeavy: {
    background: 'rgba(20,20,28,0.82)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: 20,
  } as CSSProperties,
  micro: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.38)',
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | 'revenue'
  | 'subscribers'
  | 'warmup'
  | 'deliverability'
  | 'peer-health'
  | 'llm-cost';

type ReportFormat = 'PDF' | 'CSV' | 'XLSX';

interface ReportTemplate {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  icon: typeof BarChart2;
  accentColor: string;
  lastRun: string | null;
  frequency: string;
  estimatedRows: number;
}

interface GeneratedReport {
  id: string;
  templateId: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  generatedAt: string;
  generatedBy: string;
  sizeKB: number;
  rowCount: number;
  previewRows: Array<Record<string, string | number>>;
  previewCols: string[];
  summary: { label: string; value: string; up: boolean | null }[];
}

type FilterType = 'all' | ReportType;
type FilterFormat = 'all' | ReportFormat;
type FilterSection = 'all' | 'templates' | 'generated';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const TEMPLATES: ReportTemplate[] = [
  {
    id: 'tpl-rev',
    name: 'Revenue & Billing Summary',
    type: 'revenue',
    description:
      'MRR, ARR, payment volumes, plan-wise breakdown, churn delta — all in ₹.',
    icon: BarChart2,
    accentColor: '#3ddc97',
    lastRun: '2026-05-31T08:15:00+05:30',
    frequency: 'Monthly',
    estimatedRows: 340,
  },
  {
    id: 'tpl-sub',
    name: 'Subscriber Growth Report',
    type: 'subscribers',
    description:
      'New signups, churned users, net growth, cohort retention across all plans.',
    icon: Users,
    accentColor: '#F26522',
    lastRun: '2026-05-28T11:00:00+05:30',
    frequency: 'Weekly',
    estimatedRows: 1840,
  },
  {
    id: 'tpl-wu',
    name: 'Warmup Usage Analytics',
    type: 'warmup',
    description:
      'Per-mailbox ramp progress, daily send quotas, inbox-rate trends, engagement signals.',
    icon: Mail,
    accentColor: '#FF8A4B',
    lastRun: '2026-05-31T00:05:00+05:30',
    frequency: 'Daily',
    estimatedRows: 12400,
  },
  {
    id: 'tpl-del',
    name: 'Deliverability Health',
    type: 'deliverability',
    description:
      'Inbox vs spam rate, SPF/DKIM/DMARC pass ratios, domain reputation scores.',
    icon: Activity,
    accentColor: '#3ddc97',
    lastRun: '2026-05-30T06:00:00+05:30',
    frequency: 'Daily',
    estimatedRows: 5600,
  },
  {
    id: 'tpl-peer',
    name: 'Peer Inbox Health Report',
    type: 'peer-health',
    description:
      'Peer reputation scores, bounce rates, pool utilisation, rotation events.',
    icon: Grid3x3,
    accentColor: '#ff5c7a',
    lastRun: '2026-05-31T01:00:00+05:30',
    frequency: 'Hourly',
    estimatedRows: 890,
  },
  {
    id: 'tpl-llm',
    name: 'LLM Cost & Usage Report',
    type: 'llm-cost',
    description:
      'Token consumption by provider (Gemini / Claude), cost per-workspace, total ₹ spend.',
    icon: Cpu,
    accentColor: '#FF8A4B',
    lastRun: '2026-05-31T00:10:00+05:30',
    frequency: 'Daily',
    estimatedRows: 2100,
  },
];

const GENERATED: GeneratedReport[] = [
  {
    id: 'gen-001',
    templateId: 'tpl-rev',
    name: 'Revenue Summary — May 2026',
    type: 'revenue',
    format: 'PDF',
    generatedAt: '2026-05-31T08:15:00+05:30',
    generatedBy: 'Arjun Sharma',
    sizeKB: 284,
    rowCount: 340,
    previewCols: ['Plan', 'Workspaces', 'MRR (₹)', 'Churn %'],
    previewRows: [
      { Plan: 'Starter', Workspaces: 420, 'MRR (₹)': 1260000, 'Churn %': '2.1%' },
      { Plan: 'Pro', Workspaces: 318, 'MRR (₹)': 3816000, 'Churn %': '1.4%' },
      { Plan: 'Pro Plus', Workspaces: 184, 'MRR (₹)': 4968000, 'Churn %': '0.8%' },
      { Plan: 'Agency', Workspaces: 72, 'MRR (₹)': 4320000, 'Churn %': '0.5%' },
    ],
    summary: [
      { label: 'Total MRR', value: formatMoney(14364000), up: true },
      { label: 'Net New MRR', value: formatMoney(482000), up: true },
      { label: 'Churn MRR', value: formatMoney(118000), up: false },
    ],
  },
  {
    id: 'gen-002',
    templateId: 'tpl-sub',
    name: 'Subscriber Growth — May 2026',
    type: 'subscribers',
    format: 'XLSX',
    generatedAt: '2026-05-28T11:00:00+05:30',
    generatedBy: 'Priya Nair',
    sizeKB: 512,
    rowCount: 1840,
    previewCols: ['Week', 'New', 'Churned', 'Net'],
    previewRows: [
      { Week: 'W1 May', New: 186, Churned: 32, Net: 154 },
      { Week: 'W2 May', New: 204, Churned: 28, Net: 176 },
      { Week: 'W3 May', New: 193, Churned: 41, Net: 152 },
      { Week: 'W4 May', New: 218, Churned: 36, Net: 182 },
    ],
    summary: [
      { label: 'New Users', value: formatNumber(801), up: true },
      { label: 'Churned', value: formatNumber(137), up: false },
      { label: 'Net Growth', value: formatNumber(664), up: true },
    ],
  },
  {
    id: 'gen-003',
    templateId: 'tpl-wu',
    name: 'Warmup Usage — 31 May 2026',
    type: 'warmup',
    format: 'CSV',
    generatedAt: '2026-05-31T00:05:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 1840,
    rowCount: 12400,
    previewCols: ['Mailbox Domain', 'Day', 'Sent', 'Inbox %'],
    previewRows: [
      { 'Mailbox Domain': 'sahilog.com', Day: 12, Sent: 35, 'Inbox %': '94%' },
      { 'Mailbox Domain': 'acme.io', Day: 8, Sent: 20, 'Inbox %': '88%' },
      { 'Mailbox Domain': 'globalco.in', Day: 22, Sent: 50, 'Inbox %': '97%' },
      { 'Mailbox Domain': 'startupxyz.com', Day: 5, Sent: 10, 'Inbox %': '82%' },
    ],
    summary: [
      { label: 'Active Mailboxes', value: formatNumber(994), up: true },
      { label: 'Avg Inbox Rate', value: '91.4%', up: true },
      { label: 'Total Sends', value: formatNumber(71540), up: true },
    ],
  },
  {
    id: 'gen-004',
    templateId: 'tpl-del',
    name: 'Deliverability Health — 30 May',
    type: 'deliverability',
    format: 'PDF',
    generatedAt: '2026-05-30T06:00:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 198,
    rowCount: 5600,
    previewCols: ['Domain', 'SPF', 'DKIM', 'DMARC', 'Inbox %'],
    previewRows: [
      { Domain: 'sahilog.com', SPF: 'PASS', DKIM: 'PASS', DMARC: 'PASS', 'Inbox %': '96%' },
      { Domain: 'acme.io', SPF: 'PASS', DKIM: 'FAIL', DMARC: 'WARN', 'Inbox %': '78%' },
      { Domain: 'globalco.in', SPF: 'PASS', DKIM: 'PASS', DMARC: 'PASS', 'Inbox %': '98%' },
      { Domain: 'newbrand.in', SPF: 'FAIL', DKIM: 'FAIL', DMARC: 'FAIL', 'Inbox %': '42%' },
    ],
    summary: [
      { label: 'SPF Pass Rate', value: '87.2%', up: true },
      { label: 'DKIM Pass Rate', value: '84.1%', up: null },
      { label: 'Avg Inbox Rate', value: '91.4%', up: true },
    ],
  },
  {
    id: 'gen-005',
    templateId: 'tpl-peer',
    name: 'Peer Health — 31 May 2026',
    type: 'peer-health',
    format: 'CSV',
    generatedAt: '2026-05-31T01:00:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 340,
    rowCount: 890,
    previewCols: ['Peer Email', 'Pool', 'Rep Score', 'Bounces'],
    previewRows: [
      { 'Peer Email': 'peer-001@wp-net.in', Pool: 'Default', 'Rep Score': '0.94', Bounces: 2 },
      { 'Peer Email': 'peer-042@wp-net.in', Pool: 'Premium', 'Rep Score': '0.88', Bounces: 5 },
      { 'Peer Email': 'peer-103@wp-net.in', Pool: 'Default', 'Rep Score': '0.61', Bounces: 14 },
      { 'Peer Email': 'peer-207@wp-net.in', Pool: 'Agency', 'Rep Score': '0.97', Bounces: 1 },
    ],
    summary: [
      { label: 'Active Peers', value: formatNumber(247), up: true },
      { label: 'Avg Reputation', value: '0.86', up: true },
      { label: 'Deactivated', value: '3 today', up: false },
    ],
  },
  {
    id: 'gen-006',
    templateId: 'tpl-llm',
    name: 'LLM Cost Report — May 2026',
    type: 'llm-cost',
    format: 'XLSX',
    generatedAt: '2026-05-31T00:10:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 620,
    rowCount: 2100,
    previewCols: ['Provider', 'Tokens (M)', 'Cost (₹)', '% Share'],
    previewRows: [
      { Provider: 'Gemini Flash', 'Tokens (M)': 4820, 'Cost (₹)': 28920, '% Share': '61%' },
      { Provider: 'Claude Sonnet', 'Tokens (M)': 1940, 'Cost (₹)': 16490, '% Share': '28%' },
      { Provider: 'Static Template', 'Tokens (M)': 0, 'Cost (₹)': 0, '% Share': '11%' },
    ],
    summary: [
      { label: 'Total LLM Cost', value: formatMoney(45410), up: null },
      { label: 'Cost per Send', value: '₹0.64', up: false },
      { label: 'Static Fallback', value: '11%', up: true },
    ],
  },
  {
    id: 'gen-007',
    templateId: 'tpl-rev',
    name: 'Revenue Summary — Apr 2026',
    type: 'revenue',
    format: 'XLSX',
    generatedAt: '2026-04-30T08:00:00+05:30',
    generatedBy: 'Arjun Sharma',
    sizeKB: 296,
    rowCount: 328,
    previewCols: ['Plan', 'Workspaces', 'MRR (₹)', 'Churn %'],
    previewRows: [
      { Plan: 'Starter', Workspaces: 398, 'MRR (₹)': 1194000, 'Churn %': '2.4%' },
      { Plan: 'Pro', Workspaces: 302, 'MRR (₹)': 3624000, 'Churn %': '1.6%' },
      { Plan: 'Pro Plus', Workspaces: 176, 'MRR (₹)': 4752000, 'Churn %': '0.9%' },
      { Plan: 'Agency', Workspaces: 68, 'MRR (₹)': 4080000, 'Churn %': '0.6%' },
    ],
    summary: [
      { label: 'Total MRR', value: formatMoney(13650000), up: true },
      { label: 'Net New MRR', value: formatMoney(390000), up: true },
      { label: 'Churn MRR', value: formatMoney(142000), up: false },
    ],
  },
  {
    id: 'gen-008',
    templateId: 'tpl-wu',
    name: 'Warmup Usage — 30 May 2026',
    type: 'warmup',
    format: 'CSV',
    generatedAt: '2026-05-30T00:05:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 1760,
    rowCount: 11980,
    previewCols: ['Mailbox Domain', 'Day', 'Sent', 'Inbox %'],
    previewRows: [
      { 'Mailbox Domain': 'sahilog.com', Day: 11, Sent: 35, 'Inbox %': '93%' },
      { 'Mailbox Domain': 'acme.io', Day: 7, Sent: 20, 'Inbox %': '87%' },
      { 'Mailbox Domain': 'globalco.in', Day: 21, Sent: 50, 'Inbox %': '96%' },
    ],
    summary: [
      { label: 'Active Mailboxes', value: formatNumber(981), up: null },
      { label: 'Avg Inbox Rate', value: '90.8%', up: null },
      { label: 'Total Sends', value: formatNumber(68800), up: null },
    ],
  },
  {
    id: 'gen-009',
    templateId: 'tpl-peer',
    name: 'Peer Health — 30 May 2026',
    type: 'peer-health',
    format: 'PDF',
    generatedAt: '2026-05-30T01:00:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 212,
    rowCount: 868,
    previewCols: ['Peer Email', 'Pool', 'Rep Score', 'Bounces'],
    previewRows: [
      { 'Peer Email': 'peer-001@wp-net.in', Pool: 'Default', 'Rep Score': '0.92', Bounces: 3 },
      { 'Peer Email': 'peer-042@wp-net.in', Pool: 'Premium', 'Rep Score': '0.87', Bounces: 6 },
    ],
    summary: [
      { label: 'Active Peers', value: formatNumber(244), up: null },
      { label: 'Avg Reputation', value: '0.85', up: null },
      { label: 'Deactivated', value: '1 today', up: false },
    ],
  },
  {
    id: 'gen-010',
    templateId: 'tpl-llm',
    name: 'LLM Cost Report — Apr 2026',
    type: 'llm-cost',
    format: 'CSV',
    generatedAt: '2026-04-30T00:10:00+05:30',
    generatedBy: 'System (Beat)',
    sizeKB: 540,
    rowCount: 1980,
    previewCols: ['Provider', 'Tokens (M)', 'Cost (₹)', '% Share'],
    previewRows: [
      { Provider: 'Gemini Flash', 'Tokens (M)': 4210, 'Cost (₹)': 25260, '% Share': '59%' },
      { Provider: 'Claude Sonnet', 'Tokens (M)': 1820, 'Cost (₹)': 15470, '% Share': '29%' },
      { Provider: 'Static Template', 'Tokens (M)': 0, 'Cost (₹)': 0, '% Share': '12%' },
    ],
    summary: [
      { label: 'Total LLM Cost', value: formatMoney(40730), up: null },
      { label: 'Cost per Send', value: '₹0.59', up: false },
      { label: 'Static Fallback', value: '12%', up: null },
    ],
  },
];

const TYPE_LABELS: Record<ReportType, string> = {
  revenue: 'Revenue',
  subscribers: 'Subscribers',
  warmup: 'Warmup Usage',
  deliverability: 'Deliverability',
  'peer-health': 'Peer Health',
  'llm-cost': 'LLM Cost',
};

const TYPE_COLORS: Record<ReportType, string> = {
  revenue: '#3ddc97',
  subscribers: '#F26522',
  warmup: '#FF8A4B',
  deliverability: '#3ddc97',
  'peer-health': '#ff5c7a',
  'llm-cost': '#FF8A4B',
};

const FORMAT_ICONS: Record<ReportFormat, typeof File> = {
  PDF: File,
  CSV: Database,
  XLSX: FileSpreadsheet,
};

const FORMAT_COLORS: Record<ReportFormat, string> = {
  PDF: '#ff5c7a',
  CSV: '#3ddc97',
  XLSX: '#FF8A4B',
};

// ─── Animation Variants ───────────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 340, damping: 28 },
  },
};

const chipVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.96, y: 20, transition: { duration: 0.18 } },
};

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedCounter({
  target,
  duration = 1.2,
  prefix = '',
  suffix = '',
}: {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const controlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    controlRef.current = animate(mv, target, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(formatNumber(Math.round(v))),
    });
    return () => {
      controlRef.current?.stop();
    };
  }, [target, duration, mv]);

  return (
    <span>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ReportType }) {
  const color = TYPE_COLORS[type] ?? T.faint;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 6,
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Format Badge ─────────────────────────────────────────────────────────────

function FormatBadge({ format }: { format: ReportFormat }) {
  const color = FORMAT_COLORS[format] ?? T.faint;
  const Icon = FORMAT_ICONS[format] ?? File;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 6,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        color,
      }}
    >
      <Icon size={10} />
      {format}
    </span>
  );
}

// ─── Mini sparkline bars ──────────────────────────────────────────────────────

const SPARKLINE_DATA = [42, 56, 48, 68, 60, 74, 80, 72, 86, 90, 82, 96];

function MiniSparkline({ color }: { color: string }) {
  const maxVal = Math.max(...SPARKLINE_DATA);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
      {SPARKLINE_DATA.map((v, i) => {
        const height = ((v / maxVal) * 28).toFixed(1);
        return (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: `${height}px`, opacity: i === SPARKLINE_DATA.length - 1 ? 1 : 0.5 }}
            transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 300, damping: 24 }}
            style={{ width: 3, borderRadius: 2, background: color, flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  tpl,
  onRun,
}: {
  tpl: ReportTemplate;
  onRun: (tpl: ReportTemplate) => void;
}) {
  const Icon = tpl.icon;
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      variants={itemVariants}
      layoutId={`template-${tpl.id}`}
      whileHover={{ y: -5, scale: 1.015 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        ...T.glass,
        padding: '20px 20px 16px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.25s',
        boxShadow: hovered
          ? `0 12px 36px rgba(0,0,0,0.38), 0 0 0 1px ${tpl.accentColor}44`
          : '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      {/* Gradient glow */}
      <motion.div
        animate={{ opacity: hovered ? 0.12 : 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 30% 30%, ${tpl.accentColor}, transparent 70%)`,
          pointerEvents: 'none',
          borderRadius: 16,
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${tpl.accentColor}22`,
            border: `1px solid ${tpl.accentColor}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} color={tpl.accentColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: T.text,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 4,
            }}
          >
            {tpl.name}
          </div>
          <TypeBadge type={tpl.type} />
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          color: T.dim,
          fontSize: 12,
          lineHeight: 1.6,
          margin: '0 0 14px',
          minHeight: 38,
        }}
      >
        {tpl.description}
      </p>

      {/* Sparkline */}
      <div style={{ marginBottom: 14 }}>
        <MiniSparkline color={tpl.accentColor} />
      </div>

      {/* Meta */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={11} color={T.faint} />
          <span style={{ ...T.micro, color: T.faint }}>
            {tpl.frequency} · ~{formatNumber(tpl.estimatedRows)} rows
          </span>
        </div>
        {tpl.lastRun && (
          <span style={{ ...T.micro, color: T.faint }}>
            Last: {formatDate(tpl.lastRun)}
          </span>
        )}
      </div>

      {/* Action */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onRun(tpl)}
        style={{
          width: '100%',
          padding: '9px 0',
          borderRadius: 10,
          border: `1px solid ${tpl.accentColor}55`,
          background: `${tpl.accentColor}18`,
          color: tpl.accentColor,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Play size={12} />
        Run Report
      </motion.button>
    </motion.div>
  );
}

// ─── Generated Report Card ────────────────────────────────────────────────────

function GeneratedCard({
  report,
  onPreview,
}: {
  report: GeneratedReport;
  onPreview: (report: GeneratedReport) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const accentColor = TYPE_COLORS[report.type] ?? T.accent;

  return (
    <motion.div
      layout
      variants={itemVariants}
      layoutId={`gen-${report.id}`}
      whileHover={{ y: -4, scale: 1.012 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => onPreview(report)}
      style={{
        ...T.glass,
        padding: '18px 18px 14px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hovered
          ? `0 10px 30px rgba(0,0,0,0.32), 0 0 0 1px ${accentColor}33`
          : '0 3px 12px rgba(0,0,0,0.18)',
        transition: 'box-shadow 0.22s',
      }}
    >
      {/* Subtle glow */}
      <motion.div
        animate={{ opacity: hovered ? 0.1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 0%, ${accentColor}, transparent 65%)`,
          pointerEvents: 'none',
          borderRadius: 16,
        }}
      />

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: T.text,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {report.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <TypeBadge type={report.type} />
            <FormatBadge format={report.format} />
          </div>
        </div>
        <motion.div
          animate={{ opacity: hovered ? 1 : 0.5 }}
          style={{ flexShrink: 0 }}
        >
          <ChevronRight size={16} color={T.faint} />
        </motion.div>
      </div>

      {/* Mini table preview */}
      <div
        style={{
          borderRadius: 8,
          border: `1px solid ${T.hairline}`,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${report.previewCols.length}, 1fr)`,
            background: 'rgba(255,255,255,0.04)',
            borderBottom: `1px solid ${T.hairline}`,
            padding: '5px 8px',
          }}
        >
          {report.previewCols.map((col) => (
            <span key={col} style={{ ...T.micro, fontSize: 9 }}>
              {col}
            </span>
          ))}
        </div>
        {(report.previewRows.slice(0, 2)).map((row, ri) => (
          <div
            key={ri}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${report.previewCols.length}, 1fr)`,
              padding: '5px 8px',
              borderBottom: ri < 1 ? `1px solid ${T.hairline}` : undefined,
            }}
          >
            {report.previewCols.map((col) => {
              const val = row[col] ?? '';
              return (
                <span
                  key={col}
                  style={{
                    fontSize: 10,
                    color: T.dim,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {typeof val === 'number' && col.includes('₹')
                    ? formatMoney(val)
                    : String(val)}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer meta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Calendar size={10} color={T.faint} />
          <span style={{ ...T.micro, color: T.faint }}>
            {formatDate(report.generatedAt)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ ...T.micro, color: T.faint }}>
            {report.sizeKB >= 1000
              ? `${(report.sizeKB / 1024).toFixed(1)} MB`
              : `${report.sizeKB} KB`}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({
  report,
  onClose,
  onDownload,
}: {
  report: GeneratedReport;
  onClose: () => void;
  onDownload: (report: GeneratedReport) => void;
}) {
  const accentColor = TYPE_COLORS[report.type] ?? T.accent;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.68)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Panel — stop propagation */}
        <motion.div
          key="panel"
          layoutId={`gen-${report.id}`}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          style={{
            ...T.glassHeavy,
            width: '100%',
            maxWidth: 680,
            maxHeight: '88vh',
            overflowY: 'auto',
            margin: 24,
            padding: '28px 28px 24px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TypeBadge type={report.type} />
                <FormatBadge format={report.format} />
              </div>
              <h2 style={{ color: T.text, fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
                {report.name}
              </h2>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <span style={{ ...T.micro }}>
                  Generated {formatDate(report.generatedAt)} · by {report.generatedBy}
                </span>
                <span style={{ ...T.micro }}>
                  {formatNumber(report.rowCount)} rows ·{' '}
                  {report.sizeKB >= 1000
                    ? `${(report.sizeKB / 1024).toFixed(1)} MB`
                    : `${report.sizeKB} KB`}
                </span>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: `1px solid ${T.hairline}`,
                borderRadius: 10,
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: 12,
              }}
            >
              <X size={16} color={T.dim} />
            </motion.button>
          </div>

          {/* Summary KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {report.summary.map((s) => (
              <div
                key={s.label}
                style={{
                  ...T.glass,
                  padding: '12px 14px',
                  borderRadius: 12,
                }}
              >
                <div style={{ ...T.micro, marginBottom: 5 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: T.text, fontSize: 16, fontWeight: 800 }}>
                    {s.value}
                  </span>
                  {s.up !== null && (
                    s.up ? (
                      <TrendingUp size={12} color={T.success} />
                    ) : (
                      <TrendingDown size={12} color={T.danger} />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Full preview table */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...T.micro, marginBottom: 8 }}>Data Preview</div>
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${T.hairline}`,
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${report.previewCols.length}, 1fr)`,
                  background: 'rgba(255,255,255,0.06)',
                  borderBottom: `1px solid ${T.hairline}`,
                  padding: '9px 14px',
                }}
              >
                {report.previewCols.map((col) => (
                  <span key={col} style={{ ...T.micro }}>{col}</span>
                ))}
              </div>
              {/* Rows */}
              {report.previewRows.map((row, ri) => (
                <motion.div
                  key={ri}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + ri * 0.06 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${report.previewCols.length}, 1fr)`,
                    padding: '9px 14px',
                    borderBottom:
                      ri < report.previewRows.length - 1
                        ? `1px solid ${T.hairline}`
                        : undefined,
                    background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  {report.previewCols.map((col) => {
                    const val = row[col] ?? '';
                    const isPass = val === 'PASS';
                    const isFail = val === 'FAIL';
                    const isWarn = val === 'WARN';
                    const colorVal = isPass
                      ? T.success
                      : isFail
                      ? T.danger
                      : isWarn
                      ? T.warning
                      : T.dim;
                    return (
                      <span
                        key={col}
                        style={{
                          fontSize: 12,
                          color: colorVal,
                          fontWeight: isPass || isFail || isWarn ? 700 : 400,
                        }}
                      >
                        {typeof val === 'number' && col.includes('₹')
                          ? formatMoney(val)
                          : String(val)}
                      </span>
                    );
                  })}
                </motion.div>
              ))}
              {/* Ellipsis hint */}
              <div
                style={{
                  padding: '8px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  textAlign: 'center',
                }}
              >
                <span style={{ ...T.micro }}>
                  + {formatNumber(report.rowCount - report.previewRows.length)} more rows
                </span>
              </div>
            </div>
          </div>

          {/* Bar chart visualisation (accent accent bar) */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...T.micro, marginBottom: 10 }}>Row Distribution (last 7 days)</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
              {[68, 74, 62, 80, 76, 90, 96].map((v, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${(v / 96) * 48}px` }}
                  transition={{ delay: 0.2 + i * 0.07, type: 'spring', stiffness: 280, damping: 24 }}
                  style={{
                    flex: 1,
                    borderRadius: '4px 4px 0 0',
                    background:
                      i === 6
                        ? accentColor
                        : `${accentColor}55`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onDownload(report)}
              style={{
                flex: 1,
                padding: '11px 0',
                borderRadius: 12,
                background: `${T.accent}22`,
                border: `1px solid ${T.accent}55`,
                color: T.accent,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Download size={14} />
              Download {report.format}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              style={{
                padding: '11px 18px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${T.hairline}`,
                color: T.dim,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Run Toast ────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  status: 'running' | 'done';
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              ...T.glassHeavy,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 260,
              pointerEvents: 'auto',
            }}
          >
            {t.status === 'running' ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{
                  width: 14,
                  height: 14,
                  border: `2px solid ${T.accent}44`,
                  borderTopColor: T.accent,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
            ) : (
              <CheckCircle2 size={14} color={T.success} style={{ flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, color: T.dim }}>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  const c = color ?? T.accent;
  return (
    <motion.button
      variants={chipVariants}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        padding: '5px 14px',
        borderRadius: 20,
        border: active ? `1px solid ${c}88` : `1px solid ${T.hairline}`,
        background: active ? `${c}22` : 'rgba(255,255,255,0.04)',
        color: active ? c : T.dim,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdmRptRP3Library() {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterFormat, setFilterFormat] = useState<FilterFormat>('all');
  const [filterSection, setFilterSection] = useState<FilterSection>('all');
  const [search, setSearch] = useState('');
  const [previewReport, setPreviewReport] = useState<GeneratedReport | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup toast timers on unmount
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const addToast = useCallback((message: string) => {
    const id = ++toastIdRef.current;
    const runningMsg = message;
    setToasts((prev) => [...prev, { id, message: runningMsg, status: 'running' }]);

    const t1 = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, message: message.replace('Running', 'Queued'), status: 'done' }
            : t,
        ),
      );
    }, 1800);
    const t2 = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
    toastTimersRef.current.push(t1, t2);
  }, []);

  const handleRunTemplate = useCallback(
    (tpl: ReportTemplate) => {
      addToast(`Running "${tpl.name}"…`);
    },
    [addToast],
  );

  const handleDownload = useCallback(
    (report: GeneratedReport) => {
      addToast(`Downloading "${report.name}" (${report.format})…`);
    },
    [addToast],
  );

  // Filtered templates
  const filteredTemplates = TEMPLATES.filter((tpl) => {
    if (filterSection === 'generated') return false;
    if (filterType !== 'all' && tpl.type !== filterType) return false;
    if (search && !tpl.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Filtered generated reports
  const filteredGenerated = GENERATED.filter((r) => {
    if (filterSection === 'templates') return false;
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterFormat !== 'all' && r.format !== filterFormat) return false;
    if (
      search &&
      !r.name.toLowerCase().includes(search.toLowerCase()) &&
      !r.generatedBy.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  // KPI counts
  const totalExports = GENERATED.reduce((a, r) => a + r.rowCount, 0);
  const thisMonthCount = GENERATED.filter((r) =>
    r.generatedAt.startsWith('2026-05'),
  ).length;

  const typeFilters: Array<{ label: string; value: FilterType; color: string }> = [
    { label: 'All Types', value: 'all', color: T.accent },
    { label: 'Revenue', value: 'revenue', color: TYPE_COLORS.revenue },
    { label: 'Subscribers', value: 'subscribers', color: TYPE_COLORS.subscribers },
    { label: 'Warmup', value: 'warmup', color: TYPE_COLORS.warmup },
    { label: 'Deliverability', value: 'deliverability', color: TYPE_COLORS.deliverability },
    { label: 'Peer Health', value: 'peer-health', color: TYPE_COLORS['peer-health'] },
    { label: 'LLM Cost', value: 'llm-cost', color: TYPE_COLORS['llm-cost'] },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f17 0%, #1a1208 50%, #0f0f17 100%)',
        padding: '32px 32px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: T.text,
      }}
    >
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{ marginBottom: 32 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `${T.accent}22`,
              border: `1px solid ${T.accent}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={20} color={T.accent} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                background: `linear-gradient(90deg, #fff 60%, ${T.accentSoft})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Report Library
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: T.faint }}>
              Platform-wide reporting — run templates or download generated reports
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── KPI Strip ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {[
          {
            label: 'Templates',
            value: TEMPLATES.length,
            icon: FileText,
            color: T.accent,
            sub: '6 report types',
          },
          {
            label: 'Generated This Month',
            value: thisMonthCount,
            icon: Calendar,
            color: T.success,
            sub: 'May 2026',
          },
          {
            label: 'Total Rows Exported',
            value: totalExports,
            icon: Database,
            color: T.warning,
            sub: 'All time',
          },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <motion.div
            key={label}
            variants={itemVariants}
            style={{
              ...T.glass,
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `${color}1a`,
                border: `1px solid ${color}33`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ ...T.micro, marginBottom: 3 }}>{label}</div>
              <div style={{ color: T.text, fontSize: 24, fontWeight: 800, lineHeight: 1 }}>
                <AnimatedCounter target={value} />
              </div>
              <div style={{ color: T.faint, fontSize: 11, marginTop: 3 }}>{sub}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Filters Row ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{ marginBottom: 24 }}
      >
        {/* Section toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { label: 'All', value: 'all' as FilterSection },
            { label: 'Templates', value: 'templates' as FilterSection },
            { label: 'Generated', value: 'generated' as FilterSection },
          ] as const).map(({ label, value }) => (
            <Chip
              key={value}
              label={label}
              active={filterSection === value}
              color={T.accent}
              onClick={() => setFilterSection(value)}
            />
          ))}
          <div style={{ flex: 1 }} />
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              color={T.faint}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${T.hairline}`,
                borderRadius: 20,
                padding: '5px 14px 5px 30px',
                color: T.text,
                fontSize: 12,
                outline: 'none',
                width: 180,
              }}
            />
          </div>
        </div>

        {/* Type filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...T.micro, marginRight: 4 }}>Type:</span>
          {typeFilters.map(({ label, value, color }) => (
            <Chip
              key={value}
              label={label}
              active={filterType === value}
              color={color}
              onClick={() => setFilterType(value)}
            />
          ))}
        </div>

        {/* Format filters (only when showing generated) */}
        {filterSection !== 'templates' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}
          >
            <span style={{ ...T.micro, marginRight: 4 }}>Format:</span>
            {(['all', 'PDF', 'CSV', 'XLSX'] as Array<FilterFormat>).map((f) => (
              <Chip
                key={f}
                label={f === 'all' ? 'All Formats' : f}
                active={filterFormat === f}
                color={f === 'all' ? T.accent : FORMAT_COLORS[f as ReportFormat]}
                onClick={() => setFilterFormat(f)}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* ── Templates Section ── */}
      <AnimatePresence mode="popLayout">
        {filteredTemplates.length > 0 && (
          <motion.div
            key="templates-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ marginBottom: 36 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <FileText size={14} color={T.accent} />
              <span style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>
                Report Templates
              </span>
              <span
                style={{
                  ...T.micro,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: `${T.accent}18`,
                  border: `1px solid ${T.accent}33`,
                  color: T.accent,
                }}
              >
                {filteredTemplates.length}
              </span>
            </div>
            <motion.div
              layout
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {filteredTemplates.map((tpl) => (
                <TemplateCard key={tpl.id} tpl={tpl} onRun={handleRunTemplate} />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Generated Reports Section ── */}
      <AnimatePresence mode="popLayout">
        {filteredGenerated.length > 0 && (
          <motion.div
            key="generated-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <Download size={14} color={T.success} />
              <span style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>
                Generated Reports
              </span>
              <span
                style={{
                  ...T.micro,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: `${T.success}18`,
                  border: `1px solid ${T.success}33`,
                  color: T.success,
                }}
              >
                {filteredGenerated.length}
              </span>
            </div>
            <motion.div
              layout
              initial="hidden"
              animate="visible"
              variants={containerVariants}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {filteredGenerated.map((r) => (
                <GeneratedCard key={r.id} report={r} onPreview={setPreviewReport} />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {filteredTemplates.length === 0 && filteredGenerated.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            textAlign: 'center',
            padding: '80px 24px',
            color: T.faint,
          }}
        >
          <FileText size={40} color={T.faint} style={{ marginBottom: 16, opacity: 0.5 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No reports found</div>
          <div style={{ fontSize: 13 }}>Try adjusting the filters or search query.</div>
        </motion.div>
      )}

      {/* Preview Modal */}
      {previewReport && (
        <PreviewModal
          report={previewReport}
          onClose={() => setPreviewReport(null)}
          onDownload={handleDownload}
        />
      )}

      {/* Toast stack */}
      <ToastStack toasts={toasts} />
    </div>
  );
}
