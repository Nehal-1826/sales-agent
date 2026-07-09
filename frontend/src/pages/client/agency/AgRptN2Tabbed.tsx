import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Inbox,
  Layout as LayoutIcon,
  Mail,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  Repeat,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  TrendingUp,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';

/**
 * AgRptN2Tabbed — Agency-tier REPORTS surface, design candidate N2
 * "Tabbed Workbench".
 *
 * The Reports surface re-imagined as a guided three-step workflow:
 *
 *   - HEADER STRIP carries the agency mast + "Report Builder" label, with
 *     four report-type pills on the right (Warmth / Engagement /
 *     Placement / White-label). Choosing a pill at any time updates the
 *     report being assembled in both the Configure and Preview tabs.
 *
 *   - TAB BAR (sticky) sits beneath the header. Three steps:
 *       1 · Configure   2 · Preview   3 · Export
 *     Each tab carries a status dot (orange dot = current, green check
 *     when ready) and the Export tab is gated behind a valid title. The
 *     active tab gets an animated orange underline that slides between
 *     tabs via framer-motion `layoutId`.
 *
 *   - TAB 1 — CONFIGURE is a card-grid form: report basics (title +
 *     date-range preset pills), content sections (six toggleable
 *     checkboxes — Cover / Exec Summary / KPI Table / Sub-client
 *     Breakdown / Trends / Footer), recipients (chip multi-select over
 *     the sub-client list), and styling (five orange swatches +
 *     co-brand / white-label radio + serif font toggle). A "Continue to
 *     Preview" CTA at the bottom advances to tab 2 with a bouncing
 *     arrow.
 *
 *   - TAB 2 — PREVIEW is a paper-canvas centerpiece: a real rendered
 *     report mock with cover band, KPI grid, sub-client table and pull
 *     quote, all on an A4-ish white page. Zoom controls in the top-right
 *     (50/75/100/150%) and decorative page arrows. Bottom: "Back to
 *     Configure" link + "Continue to Export" CTA.
 *
 *   - TAB 3 — EXPORT is the download bay. Two big format cards (PDF +
 *     XLSX) with real working downloads via `jsPDF` + `xlsx`; both fire
 *     toasts on success. Beneath: "Email this report" stub (recipient
 *     input + Send CTA, read-only), "Schedule recurring" stub (cadence
 *     radio + Save), and a "Recent exports" history list at the bottom.
 *
 * Tab content cross-fades on tab change; the underline slides via
 * `layoutId`. Premium SaaS feel — Vercel/Linear-style — kept strictly on
 * the Shailog orange palette via `var(--wp-…)` CSS vars with deterministic
 * fallbacks. No violet/blue/cyan/mint/teal anywhere.
 *
 * Fully STANDALONE — no network, router, query hooks. Inline MOCK
 * supplies every field so the design-preview harness mounts it
 * prop-less.
 */

// ---------------------------------------------------------------------------
// Shared data shape (mirrors sibling N1; if N1 is later regenerated to a
// different shape, this file imports the N1 type via the comment below).
// ---------------------------------------------------------------------------

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';

export interface AgencyReportsData {
  agency: { name: string; region: string };
  subClients: Array<{ id: string; name: string; domain: string; mailboxCount: number }>;
  metrics: Record<
    ReportType,
    {
      headline: string;
      pullQuote: string;
      rows: Array<{
        subClient: string;
        domain: string;
        value: number;
        delta: number;
        status: 'good' | 'warn' | 'risk';
      }>;
      summary: { total: number; avg: number; high: number; low: number };
    }
  >;
}

// ---------------------------------------------------------------------------
// Theme tokens — strict orange palette via CSS variables with deterministic
// fallbacks so SVG fills paint pre-style.
// ---------------------------------------------------------------------------

const TOK = {
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accent3: 'var(--wp-accent-3, #FF9670)',
  accent4: 'var(--wp-accent-4, #FFB880)',
  accentDeep: 'var(--wp-accent-deep, #C8470E)',
  success: 'var(--wp-success, #3ddc97)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  surfaceDeep: 'var(--wp-surface-deep, #0a0a0f)',
  border: 'var(--wp-border, #2a2a3a)',
  borderStrong: 'var(--wp-border-strong, #3a3a4a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
} as const;

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#FF9670',
  accent4: '#FFB880',
  accentDeep: '#C8470E',
  paper: '#FAF7F2',
  paperEdge: '#E6E1D6',
  inkDark: '#1A1A26',
  inkDim: '#5A5A72',
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  success: '#3ddc97',
  warning: '#ffb454',
  danger: '#ff5c7a',
} as const;

// ---------------------------------------------------------------------------
// Report-type metadata — labels, descriptions, icons.
// ---------------------------------------------------------------------------

const TYPE_NAME: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Engagement',
  placement: 'Placement',
  white_label: 'White-label',
};

const TYPE_DESC: Record<ReportType, string> = {
  warmth: 'Warm-up trajectory + ramp-day distribution across the portfolio.',
  engagement: 'Open / reply / star velocity per sub-client over the window.',
  placement: 'Inbox / promotions / spam placement breakdown by mailbox provider.',
  white_label: 'Brandable digest suitable for sub-client distribution.',
};

const TYPE_ICON: Record<ReportType, JSX.Element> = {
  warmth: <Flame size={14} />,
  engagement: <Mail size={14} />,
  placement: <Target size={14} />,
  white_label: <ShieldCheck size={14} />,
};

const TYPE_UNIT: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Reply rate',
  placement: 'Inbox %',
  white_label: 'Composite',
};

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency, 6 sub-clients, full metric coverage.
// ---------------------------------------------------------------------------

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'NA · EU' },
  subClients: [
    { id: 'sc-helix', name: 'Helix Outreach', domain: 'helix.com', mailboxCount: 12 },
    { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxCount: 18 },
    { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.com', mailboxCount: 22 },
    { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 8 },
    { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 14 },
    { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 9 },
  ],
  metrics: {
    warmth: {
      headline: 'Portfolio warmth climbs to 78',
      pullQuote:
        'Six of six sub-clients gained warmth this period; Orion and Nimbus crossed the 80 threshold for the first time.',
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 82, delta: 4, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 81, delta: 6, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 84, delta: 7, status: 'good' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 71, delta: 2, status: 'warn' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 76, delta: 3, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 64, delta: -1, status: 'risk' },
      ],
      summary: { total: 6, avg: 76, high: 84, low: 64 },
    },
    engagement: {
      headline: 'Reply velocity up 28% across the fleet',
      pullQuote:
        "Reply velocity outpaced forecast by a full week — Orion's outbound lead the fleet at 11.4% reply.",
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 8, delta: 2, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 9, delta: 3, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 11, delta: 4, status: 'good' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 5, delta: 0, status: 'warn' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 7, delta: 2, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 4, delta: -1, status: 'risk' },
      ],
      summary: { total: 6, avg: 7, high: 11, low: 4 },
    },
    placement: {
      headline: 'Inbox share gains 4.2 pts portfolio-wide',
      pullQuote:
        'Northwind portfolio gained 4.2 pts of average inbox placement across Gmail, Outlook and Yahoo.',
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 92, delta: 5, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 88, delta: 3, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 94, delta: 6, status: 'good' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 79, delta: 1, status: 'warn' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 86, delta: 4, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 71, delta: -2, status: 'risk' },
      ],
      summary: { total: 6, avg: 85, high: 94, low: 71 },
    },
    white_label: {
      headline: 'Digest-ready composite score: 81',
      pullQuote:
        'Composite health for the period — six sub-clients trending up, one flagged for triage attention.',
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 86, delta: 4, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 84, delta: 5, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 89, delta: 6, status: 'good' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 74, delta: 1, status: 'warn' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 80, delta: 3, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 68, delta: -2, status: 'risk' },
      ],
      summary: { total: 6, avg: 81, high: 89, low: 68 },
    },
  },
};

// ---------------------------------------------------------------------------
// Static config catalogues — section toggles, date presets, accent swatches.
// ---------------------------------------------------------------------------

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: JSX.Element;
}

type SectionId = 'cover' | 'exec' | 'kpi' | 'breakdown' | 'trends' | 'footer';

const SECTIONS: SectionDef[] = [
  { id: 'cover', label: 'Cover page', description: 'Headline + report meta strip', icon: <LayoutIcon size={14} /> },
  { id: 'exec', label: 'Executive summary', description: '3-sentence editorial overview', icon: <FileText size={14} /> },
  { id: 'kpi', label: 'KPI table', description: 'Total / average / high / low band', icon: <Table2 size={14} /> },
  { id: 'breakdown', label: 'Sub-client breakdown', description: 'Per sub-client rows + deltas', icon: <Users size={14} /> },
  { id: 'trends', label: 'Trends', description: '14-day sparkline trail per metric', icon: <TrendingUp size={14} /> },
  { id: 'footer', label: 'Footer', description: 'Branding strip + generated-at meta', icon: <Building2 size={14} /> },
];

type PresetId = '7d' | '14d' | '30d' | '90d' | 'mtd' | 'qtd';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '14d', label: 'Last 14 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'mtd', label: 'Month to date' },
  { id: 'qtd', label: 'Quarter to date' },
];

const ACCENT_SWATCHES: Array<{ id: string; hex: string; label: string }> = [
  { id: 'shailog', hex: HEX.accent, label: 'Shailog' },
  { id: 'sunset', hex: HEX.accent2, label: 'Sunset' },
  { id: 'peach', hex: HEX.accent3, label: 'Peach' },
  { id: 'amber', hex: HEX.accent4, label: 'Amber' },
  { id: 'rust', hex: HEX.accentDeep, label: 'Rust' },
];

const ZOOM_LEVELS = [50, 75, 100, 150] as const;
type ZoomLevel = (typeof ZOOM_LEVELS)[number];

type PreviewMode = 'pdf' | 'xlsx';

const CADENCES: Array<{ id: 'daily' | 'weekly' | 'monthly'; label: string; meta: string }> = [
  { id: 'daily', label: 'Daily', meta: 'Sent every morning at 08:00' },
  { id: 'weekly', label: 'Weekly', meta: 'Sent every Monday at 08:00' },
  { id: 'monthly', label: 'Monthly', meta: 'Sent on the 1st at 08:00' },
];

interface RecentExport {
  id: string;
  format: 'pdf' | 'xlsx';
  type: ReportType;
  generatedAt: string;
  sizeKb: number;
  title: string;
}

const RECENT_EXPORTS: RecentExport[] = [
  {
    id: 'rx-1',
    format: 'pdf',
    type: 'placement',
    generatedAt: '2026-05-28T14:22:00Z',
    sizeKb: 412,
    title: 'Q2 Placement Review',
  },
  {
    id: 'rx-2',
    format: 'xlsx',
    type: 'engagement',
    generatedAt: '2026-05-27T09:14:00Z',
    sizeKb: 78,
    title: 'Engagement Lift · Orion',
  },
  {
    id: 'rx-3',
    format: 'pdf',
    type: 'warmth',
    generatedAt: '2026-05-25T17:48:00Z',
    sizeKb: 388,
    title: 'Warmth Trajectory · Helix',
  },
  {
    id: 'rx-4',
    format: 'xlsx',
    type: 'white_label',
    generatedAt: '2026-05-22T11:02:00Z',
    sizeKb: 96,
    title: 'Nimbus White-label Digest',
  },
];

// ---------------------------------------------------------------------------
// Helpers — formatting, status colors, deterministic mini-sparklines.
// ---------------------------------------------------------------------------

const STATUS_HEX: Record<'good' | 'warn' | 'risk', string> = {
  good: HEX.success,
  warn: HEX.warning,
  risk: HEX.danger,
};

const STATUS_LABEL: Record<'good' | 'warn' | 'risk', string> = {
  good: 'On track',
  warn: 'Watch',
  risk: 'At risk',
};

function fmtRelative(iso: string): string {
  const now = Date.parse('2026-05-29T12:00:00Z');
  const then = Date.parse(iso);
  const diff = Math.max(0, now - then);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
  return `${mins}m ago`;
}

function estimatePdfKb(sectionCount: number, rowCount: number): number {
  // Coarse PDF size estimate, deterministic for the file-size hint.
  return Math.round(80 + sectionCount * 22 + rowCount * 6);
}

function estimateXlsxKb(rowCount: number): number {
  return Math.round(18 + rowCount * 4);
}

function sparkline(values: number[], width: number, height: number, color: string): JSX.Element {
  if (values.length === 0) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = width / (values.length - 1 || 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Deterministic 14-point trend series per row (so preview reads identically
// across renders without any random seed).
function trendForRow(seed: number, base: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 14; i++) {
    // Simple cosine-blend trend, anchored to `base`, jittered by `seed`.
    const jitter = Math.sin(seed * 13.37 + i * 0.7) * 4;
    const drift = (i / 14) * 6 * Math.cos(seed * 7.1);
    out.push(Math.round(base + drift + jitter));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptN2Tabbed({ data }: { data?: AgencyReportsData } = {}): JSX.Element {
  const d = data ?? MOCK;

  // ---------- tab state ----------
  type TabId = 'configure' | 'preview' | 'export';
  const [tab, setTab] = useState<TabId>('configure');

  // ---------- header / pill state ----------
  const [type, setType] = useState<ReportType>('placement');

  // ---------- configure form state ----------
  const [title, setTitle] = useState<string>(`${d.agency.name} · ${TYPE_NAME[type]} Report`);
  const [preset, setPreset] = useState<PresetId>('30d');
  const [enabledSections, setEnabledSections] = useState<Set<SectionId>>(
    new Set(['cover', 'exec', 'kpi', 'breakdown', 'footer']),
  );
  const [recipients, setRecipients] = useState<Set<string>>(new Set(d.subClients.slice(0, 3).map((s) => s.id)));
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [scheduleEmail, setScheduleEmail] = useState<string>('ops@northwind.agency');
  const [accentId, setAccentId] = useState<string>('shailog');
  const [branding, setBranding] = useState<'cobrand' | 'whitelabel'>('cobrand');
  const [serif, setSerif] = useState<boolean>(true);
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // ---------- preview state ----------
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [page, setPage] = useState<number>(1);
  const totalPages = 1; // design-space — future multi-page.
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');

  // ---------- derived ----------
  const presetLabel = useMemo(() => PRESETS.find((p) => p.id === preset)?.label ?? 'Last 30 days', [preset]);
  const enabledSectionCount = enabledSections.size;
  const recipientCount = recipients.size;
  const metric = d.metrics[type];
  const accentHex = useMemo(() => ACCENT_SWATCHES.find((s) => s.id === accentId)?.hex ?? HEX.accent, [accentId]);
  const pdfKb = useMemo(
    () => estimatePdfKb(enabledSectionCount, metric.rows.length),
    [enabledSectionCount, metric.rows.length],
  );
  const xlsxKb = useMemo(() => estimateXlsxKb(metric.rows.length), [metric.rows.length]);
  const configValid = title.trim().length >= 3 && enabledSectionCount >= 1;

  // ---------- handlers ----------
  const handleTypeChange = useCallback(
    (next: ReportType) => {
      setType(next);
      setTitle((prev) => {
        // Only auto-rewrite the title when the user hasn't customized it.
        const defaultForCurrent = `${d.agency.name} · ${TYPE_NAME[type]} Report`;
        if (prev === defaultForCurrent) {
          return `${d.agency.name} · ${TYPE_NAME[next]} Report`;
        }
        return prev;
      });
    },
    [d.agency.name, type],
  );

  const toggleSection = useCallback((id: SectionId) => {
    setEnabledSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleRecipient = useCallback((id: string) => {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContinueToPreview = useCallback(() => {
    if (!configValid) {
      toast.error('Add a report title and at least one section to continue.');
      return;
    }
    setTab('preview');
  }, [configValid]);

  const handleContinueToExport = useCallback(() => {
    setTab('export');
  }, []);

  const handleBackToConfigure = useCallback(() => {
    setTab('configure');
  }, []);

  const handlePdf = useCallback(() => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    // Header band — agency orange.
    doc.setFillColor(242, 101, 34);
    doc.rect(0, 0, 595, 60, 'F');
    doc.setTextColor(255);
    doc.setFontSize(20);
    doc.text(`${d.agency.name} · ${TYPE_NAME[type]} Report`, 40, 38);

    // Title / quote block.
    doc.setTextColor(20);
    doc.setFontSize(14);
    doc.text(metric.headline, 40, 90);
    doc.setFontSize(11);
    doc.text(metric.pullQuote, 40, 110, { maxWidth: 515 });

    // Meta strip.
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Period: ${presetLabel}    ·    Generated: ${new Date().toISOString().slice(0, 10)}    ·    Sub-clients: ${recipientCount}`,
      40,
      138,
    );

    // Summary mini-stats.
    doc.setTextColor(40);
    doc.setFontSize(10);
    const summaryY = 170;
    const summaryLine = `Total ${metric.summary.total}   ·   Avg ${metric.summary.avg}   ·   High ${metric.summary.high}   ·   Low ${metric.summary.low}`;
    doc.text(summaryLine, 40, summaryY);

    // Table.
    autoTable(doc, {
      startY: 200,
      head: [['Sub-client', 'Domain', TYPE_UNIT[type], 'Δ', 'Status']],
      body: metric.rows.map((r) => [
        r.subClient,
        r.domain,
        r.value.toString(),
        `${r.delta >= 0 ? '+' : ''}${r.delta}`,
        STATUS_LABEL[r.status],
      ]),
      headStyles: { fillColor: [242, 101, 34], textColor: [255, 255, 255] },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 244, 238] },
      theme: 'grid',
    });

    doc.save(`${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF downloaded');
  }, [d.agency.name, metric, presetLabel, recipientCount, type]);

  const handleXlsx = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ['Agency', d.agency.name],
      ['Report type', TYPE_NAME[type]],
      ['Period', presetLabel],
      ['Generated', new Date().toISOString()],
      [],
      ['Total', metric.summary.total],
      ['Average', metric.summary.avg],
      ['High', metric.summary.high],
      ['Low', metric.summary.low],
      [],
      ['Headline', metric.headline],
      ['Summary', metric.pullQuote],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
    const detail = [
      ['Sub-client', 'Domain', TYPE_UNIT[type], 'Δ', 'Status'],
      ...metric.rows.map((r) => [r.subClient, r.domain, r.value, r.delta, STATUS_LABEL[r.status]]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Detail');
    XLSX.writeFile(
      wb,
      `${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success('XLSX downloaded');
  }, [d.agency.name, metric, presetLabel, type]);

  const handleEmailSend = useCallback(() => {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      toast.error('Enter a valid email address.');
      return;
    }
    toast.success(`Report queued to ${recipientEmail}`);
  }, [recipientEmail]);

  const handleScheduleSave = useCallback(() => {
    toast.success(`${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} schedule saved to ${scheduleEmail}`);
  }, [cadence, scheduleEmail]);

  // ---------- render ----------
  return (
    <div
      className="min-h-screen bg-bg text-text"
      style={{ ['--wp-accent-active' as string]: accentHex } as CSSProperties}
    >
      {/* HEADER STRIP */}
      <HeaderStrip
        agency={d.agency}
        type={type}
        onTypeChange={handleTypeChange}
        currentStep={tab === 'configure' ? 1 : tab === 'preview' ? 2 : 3}
      />

      {/* TAB BAR */}
      <TabBar
        tab={tab}
        onTabChange={setTab}
        configValid={configValid}
        previewVisited={tab === 'preview' || tab === 'export'}
      />

      {/* CONTENT */}
      <div className="mx-auto max-w-[1280px] px-6 pb-16 pt-8">
        <AnimatePresence mode="wait">
          {tab === 'configure' && (
            <motion.div
              key="configure"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <ConfigureTab
                title={title}
                onTitleChange={setTitle}
                preset={preset}
                onPresetChange={setPreset}
                sections={enabledSections}
                onToggleSection={toggleSection}
                subClients={d.subClients}
                recipients={recipients}
                onToggleRecipient={toggleRecipient}
                accentId={accentId}
                onAccentChange={setAccentId}
                branding={branding}
                onBrandingChange={setBranding}
                serif={serif}
                onSerifChange={setSerif}
                type={type}
                onContinue={handleContinueToPreview}
                valid={configValid}
              />
            </motion.div>
          )}

          {tab === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <PreviewTab
                title={title}
                presetLabel={presetLabel}
                type={type}
                metric={metric}
                sections={enabledSections}
                accentHex={accentHex}
                serif={serif}
                branding={branding}
                zoom={zoom}
                onZoomChange={setZoom}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onBack={handleBackToConfigure}
                onContinue={handleContinueToExport}
                agency={d.agency}
                recipientCount={recipientCount}
                previewMode={previewMode}
                onPreviewModeChange={setPreviewMode}
              />
            </motion.div>
          )}

          {tab === 'export' && (
            <motion.div
              key="export"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <ExportTab
                pdfKb={pdfKb}
                xlsxKb={xlsxKb}
                onPdf={handlePdf}
                onXlsx={handleXlsx}
                recipientEmail={recipientEmail}
                onRecipientEmailChange={setRecipientEmail}
                onEmailSend={handleEmailSend}
                cadence={cadence}
                onCadenceChange={setCadence}
                scheduleEmail={scheduleEmail}
                onScheduleEmailChange={setScheduleEmail}
                onScheduleSave={handleScheduleSave}
                onBack={() => setTab('preview')}
                title={title}
                type={type}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AgRptN2Tabbed;

// ===========================================================================
// HEADER STRIP
// ===========================================================================

interface HeaderStripProps {
  agency: { name: string; region: string };
  type: ReportType;
  onTypeChange: (t: ReportType) => void;
  currentStep: 1 | 2 | 3;
}

function HeaderStrip({ agency, type, onTypeChange, currentStep }: HeaderStripProps): JSX.Element {
  return (
    <div
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'rgba(10,10,15,0.85)',
        borderColor: TOK.border,
      }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-5">
        <div className="flex items-center gap-4">
          <div
            className="grid h-10 w-10 place-items-center rounded-lg"
            style={{
              backgroundColor: 'rgba(242,101,34,0.12)',
              border: `1px solid ${TOK.border}`,
              color: TOK.accent,
            }}
            aria-hidden
          >
            <FileText size={18} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: TOK.textFaint }}>
                {agency.region}
              </span>
              <span className="text-[10px]" style={{ color: TOK.textFaint }}>
                ·
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: TOK.accent }}
              >
                Step {currentStep} of 3
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold tracking-tight">{agency.name}</span>
              <span className="text-xs" style={{ color: TOK.textFaint }}>
                /
              </span>
              <span className="text-sm" style={{ color: TOK.textDim }}>
                Report Builder
              </span>
            </div>
          </div>
        </div>

        {/* Report-type pills */}
        <div
          className="flex items-center gap-1 rounded-full p-1"
          style={{ backgroundColor: TOK.surface, border: `1px solid ${TOK.border}` }}
          role="tablist"
          aria-label="Report type"
        >
          {(Object.keys(TYPE_NAME) as ReportType[]).map((t) => {
            const isActive = t === type;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                aria-pressed={isActive}
                className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  color: isActive ? TOK.text : TOK.textDim,
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="header-type-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: 'rgba(242,101,34,0.18)',
                      border: `1px solid ${TOK.accent}`,
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {TYPE_ICON[t]}
                  {TYPE_NAME[t]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// TAB BAR
// ===========================================================================

interface TabBarProps {
  tab: 'configure' | 'preview' | 'export';
  onTabChange: (t: 'configure' | 'preview' | 'export') => void;
  configValid: boolean;
  previewVisited: boolean;
}

function TabBar({ tab, onTabChange, configValid, previewVisited }: TabBarProps): JSX.Element {
  const tabs: Array<{ id: 'configure' | 'preview' | 'export'; n: number; label: string; ready: boolean; disabled: boolean }> = [
    { id: 'configure', n: 1, label: 'Configure', ready: configValid, disabled: false },
    { id: 'preview', n: 2, label: 'Preview', ready: previewVisited, disabled: !configValid },
    { id: 'export', n: 3, label: 'Export', ready: false, disabled: !configValid },
  ];
  return (
    <div className="sticky top-[81px] z-20 border-b" style={{ borderColor: TOK.border, backgroundColor: 'rgba(10,10,15,0.92)' }}>
      <div className="mx-auto flex max-w-[1280px] items-center px-6">
        <div className="flex flex-1 items-center" role="tablist">
          {tabs.map((t) => {
            const isActive = t.id === tab;
            const baseColor = isActive ? TOK.text : t.disabled ? TOK.textFaint : TOK.textDim;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={t.disabled}
                onClick={() => !t.disabled && onTabChange(t.id)}
                className="relative flex items-center gap-2.5 px-5 py-4 text-sm font-medium transition-colors disabled:cursor-not-allowed"
                style={{ color: baseColor }}
              >
                {/* Step number badge */}
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-colors"
                  style={{
                    backgroundColor: isActive ? TOK.accent : 'transparent',
                    color: isActive ? '#fff' : t.disabled ? TOK.textFaint : TOK.textDim,
                    border: `1px solid ${isActive ? TOK.accent : TOK.border}`,
                  }}
                >
                  {t.ready && !isActive ? <Check size={12} /> : t.n}
                </span>
                <span>{t.label}</span>
                {t.ready && isActive ? (
                  <span aria-hidden style={{ color: TOK.success }}>
                    <CheckCircle2 size={14} />
                  </span>
                ) : null}
                {/* Active underline — slides via layoutId */}
                {isActive && (
                  <motion.div
                    layoutId="tabbar-underline"
                    className="absolute inset-x-3 bottom-0 h-[2px]"
                    style={{ backgroundColor: TOK.accent }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {/* Right helper */}
        <div className="hidden items-center gap-3 text-xs md:flex" style={{ color: TOK.textFaint }}>
          <Sparkles size={12} style={{ color: TOK.accent }} />
          <span>Premium SaaS workflow · real PDF + XLSX export</span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// CONFIGURE TAB
// ===========================================================================

interface ConfigureTabProps {
  title: string;
  onTitleChange: (s: string) => void;
  preset: PresetId;
  onPresetChange: (p: PresetId) => void;
  sections: Set<SectionId>;
  onToggleSection: (id: SectionId) => void;
  subClients: AgencyReportsData['subClients'];
  recipients: Set<string>;
  onToggleRecipient: (id: string) => void;
  accentId: string;
  onAccentChange: (id: string) => void;
  branding: 'cobrand' | 'whitelabel';
  onBrandingChange: (b: 'cobrand' | 'whitelabel') => void;
  serif: boolean;
  onSerifChange: (b: boolean) => void;
  type: ReportType;
  onContinue: () => void;
  valid: boolean;
}

function ConfigureTab(props: ConfigureTabProps): JSX.Element {
  const {
    title,
    onTitleChange,
    preset,
    onPresetChange,
    sections,
    onToggleSection,
    subClients,
    recipients,
    onToggleRecipient,
    accentId,
    onAccentChange,
    branding,
    onBrandingChange,
    serif,
    onSerifChange,
    type,
    onContinue,
    valid,
  } = props;
  return (
    <div className="flex flex-col gap-6">
      {/* Eyebrow */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Configure your report</h2>
          <p className="mt-1 text-sm" style={{ color: TOK.textDim }}>
            {TYPE_DESC[type]}
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          style={{ backgroundColor: TOK.surface, border: `1px solid ${TOK.border}`, color: TOK.textDim }}
        >
          <Settings2 size={12} style={{ color: TOK.accent }} />
          <span>Auto-saved a moment ago</span>
        </div>
      </div>

      {/* Grid of cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BasicsCard
          title={title}
          onTitleChange={onTitleChange}
          preset={preset}
          onPresetChange={onPresetChange}
          type={type}
        />
        <SectionsCard sections={sections} onToggleSection={onToggleSection} />
        <RecipientsCard subClients={subClients} recipients={recipients} onToggleRecipient={onToggleRecipient} />
        <StylingCard
          accentId={accentId}
          onAccentChange={onAccentChange}
          branding={branding}
          onBrandingChange={onBrandingChange}
          serif={serif}
          onSerifChange={onSerifChange}
        />
      </div>

      {/* Continue CTA */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <ContinueCta
          label="Continue to Preview"
          onClick={onContinue}
          disabled={!valid}
          tone="primary"
        />
        <p className="text-xs" style={{ color: TOK.textFaint }}>
          {valid
            ? 'All required fields look good — preview your report next.'
            : 'Add a title (3+ characters) and pick at least one section.'}
        </p>
      </div>
    </div>
  );
}

// ---------- card · basics ----------

function BasicsCard({
  title,
  onTitleChange,
  preset,
  onPresetChange,
  type,
}: {
  title: string;
  onTitleChange: (s: string) => void;
  preset: PresetId;
  onPresetChange: (p: PresetId) => void;
  type: ReportType;
}): JSX.Element {
  return (
    <CardShell icon={<FileText size={14} />} title="Report basics" subtitle="Title and date range">
      <div className="flex flex-col gap-5">
        <FieldShell label="Report title" hint={`Synced with ${TYPE_NAME[type]} pill in the header`}>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Q3 Portfolio Placement Review"
            className="w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
            style={{
              backgroundColor: TOK.surfaceDeep,
              color: TOK.text,
              border: `1px solid ${TOK.border}`,
            }}
          />
        </FieldShell>

        <FieldShell label="Date range" hint="Determines the slice of data this report covers">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const isActive = p.id === preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPresetChange(p.id)}
                  aria-pressed={isActive}
                  className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(242,101,34,0.16)' : TOK.surfaceDeep,
                    color: isActive ? TOK.accent : TOK.textDim,
                    border: `1px solid ${isActive ? TOK.accent : TOK.border}`,
                  }}
                >
                  <Calendar size={11} />
                  {p.label}
                </button>
              );
            })}
          </div>
        </FieldShell>
      </div>
    </CardShell>
  );
}

// ---------- card · sections ----------

function SectionsCard({
  sections,
  onToggleSection,
}: {
  sections: Set<SectionId>;
  onToggleSection: (id: SectionId) => void;
}): JSX.Element {
  return (
    <CardShell icon={<LayoutIcon size={14} />} title="Content sections" subtitle={`${sections.size} of 6 enabled`}>
      <div className="grid gap-2.5">
        {SECTIONS.map((s) => {
          const checked = sections.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggleSection(s.id)}
              aria-pressed={checked}
              className="group flex items-center gap-3 rounded-md p-3 text-left transition-colors"
              style={{
                backgroundColor: checked ? 'rgba(242,101,34,0.06)' : TOK.surfaceDeep,
                border: `1px solid ${checked ? TOK.accent : TOK.border}`,
              }}
            >
              <span
                className="grid h-5 w-5 place-items-center rounded transition-colors"
                style={{
                  backgroundColor: checked ? TOK.accent : 'transparent',
                  border: `1px solid ${checked ? TOK.accent : TOK.borderStrong}`,
                }}
                aria-hidden
              >
                {checked && <Check size={12} color="#fff" />}
              </span>
              <span
                className="grid h-7 w-7 place-items-center rounded"
                style={{
                  backgroundColor: TOK.surface,
                  color: checked ? TOK.accent : TOK.textDim,
                  border: `1px solid ${TOK.border}`,
                }}
                aria-hidden
              >
                {s.icon}
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: checked ? TOK.text : TOK.textDim }}>
                  {s.label}
                </div>
                <div className="text-[11px]" style={{ color: TOK.textFaint }}>
                  {s.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CardShell>
  );
}

// ---------- card · recipients ----------

function RecipientsCard({
  subClients,
  recipients,
  onToggleRecipient,
}: {
  subClients: AgencyReportsData['subClients'];
  recipients: Set<string>;
  onToggleRecipient: (id: string) => void;
}): JSX.Element {
  return (
    <CardShell
      icon={<Users size={14} />}
      title="Recipients"
      subtitle={`${recipients.size} of ${subClients.length} sub-clients selected`}
    >
      <div className="flex flex-col gap-4">
        <FieldShell label="Additional email" hint="Optional · CC ops or stakeholders">
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="ops@northwind.agency"
              className="flex-1 rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
              style={{
                backgroundColor: TOK.surfaceDeep,
                color: TOK.text,
                border: `1px solid ${TOK.border}`,
              }}
            />
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-md transition-colors"
              style={{
                backgroundColor: TOK.surfaceDeep,
                color: TOK.accent,
                border: `1px solid ${TOK.border}`,
              }}
              aria-label="Add recipient"
            >
              <Plus size={14} />
            </button>
          </div>
        </FieldShell>

        <FieldShell label="Sub-clients" hint="Click chips to toggle">
          <div className="flex flex-wrap gap-2">
            {subClients.map((sc) => {
              const checked = recipients.has(sc.id);
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onToggleRecipient(sc.id)}
                  aria-pressed={checked}
                  className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: checked ? 'rgba(242,101,34,0.16)' : TOK.surfaceDeep,
                    color: checked ? TOK.accent : TOK.textDim,
                    border: `1px solid ${checked ? TOK.accent : TOK.border}`,
                  }}
                >
                  {checked ? <Check size={10} /> : <Plus size={10} />}
                  <span>{sc.name}</span>
                  <span style={{ color: TOK.textFaint }}>· {sc.mailboxCount}</span>
                </button>
              );
            })}
          </div>
        </FieldShell>
      </div>
    </CardShell>
  );
}

// ---------- card · styling ----------

function StylingCard({
  accentId,
  onAccentChange,
  branding,
  onBrandingChange,
  serif,
  onSerifChange,
}: {
  accentId: string;
  onAccentChange: (id: string) => void;
  branding: 'cobrand' | 'whitelabel';
  onBrandingChange: (b: 'cobrand' | 'whitelabel') => void;
  serif: boolean;
  onSerifChange: (b: boolean) => void;
}): JSX.Element {
  return (
    <CardShell icon={<Palette size={14} />} title="Styling" subtitle="Accent + branding + typography">
      <div className="flex flex-col gap-5">
        <FieldShell label="Accent swatch" hint="All five stay strictly on the Shailog orange ladder">
          <div className="flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((sw) => {
              const isActive = sw.id === accentId;
              return (
                <button
                  key={sw.id}
                  type="button"
                  onClick={() => onAccentChange(sw.id)}
                  aria-pressed={isActive}
                  aria-label={sw.label}
                  className="relative flex h-10 w-10 items-center justify-center rounded-md transition-transform hover:scale-105"
                  style={{
                    backgroundColor: sw.hex,
                    border: `2px solid ${isActive ? TOK.text : TOK.border}`,
                    boxShadow: isActive ? `0 0 0 2px ${sw.hex}40` : 'none',
                  }}
                >
                  {isActive && <Check size={14} color="#fff" />}
                </button>
              );
            })}
          </div>
        </FieldShell>

        <FieldShell label="Branding" hint="Co-brand keeps your logo; white-label drops it">
          <div className="flex gap-2">
            {(['cobrand', 'whitelabel'] as const).map((b) => {
              const isActive = b === branding;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => onBrandingChange(b)}
                  aria-pressed={isActive}
                  className="flex-1 rounded-md px-3 py-3 text-left transition-colors"
                  style={{
                    backgroundColor: isActive ? 'rgba(242,101,34,0.08)' : TOK.surfaceDeep,
                    border: `1px solid ${isActive ? TOK.accent : TOK.border}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-4 w-4 place-items-center rounded-full"
                      style={{
                        backgroundColor: isActive ? TOK.accent : 'transparent',
                        border: `1px solid ${isActive ? TOK.accent : TOK.borderStrong}`,
                      }}
                      aria-hidden
                    >
                      {isActive && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm font-medium" style={{ color: isActive ? TOK.text : TOK.textDim }}>
                      {b === 'cobrand' ? 'Co-brand' : 'White-label'}
                    </span>
                  </div>
                  <p className="ml-6 mt-1 text-[11px]" style={{ color: TOK.textFaint }}>
                    {b === 'cobrand'
                      ? 'Shows the agency mast at the top'
                      : 'Plain sub-client header only'}
                  </p>
                </button>
              );
            })}
          </div>
        </FieldShell>

        <FieldShell label="Typography" hint="Headline font for cover + section titles">
          <button
            type="button"
            onClick={() => onSerifChange(!serif)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors"
            style={{
              backgroundColor: TOK.surfaceDeep,
              border: `1px solid ${TOK.border}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-7 w-7 place-items-center rounded text-[12px]"
                style={{
                  backgroundColor: TOK.surface,
                  border: `1px solid ${TOK.border}`,
                  color: TOK.accent,
                  fontFamily: serif ? 'Georgia, serif' : 'Outfit, sans-serif',
                }}
                aria-hidden
              >
                Aa
              </span>
              <div>
                <div className="text-sm font-medium">{serif ? 'Serif headlines' : 'Sans-serif headlines'}</div>
                <div className="text-[11px]" style={{ color: TOK.textFaint }}>
                  {serif ? 'Editorial / magazine feel' : 'Tighter / modern feel'}
                </div>
              </div>
            </div>
            <span
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ backgroundColor: serif ? TOK.accent : TOK.border }}
              aria-hidden
            >
              <motion.span
                className="block h-3.5 w-3.5 rounded-full bg-white shadow"
                animate={{ x: serif ? 18 : 4 }}
                transition={{ type: 'spring', stiffness: 480, damping: 30 }}
              />
            </span>
          </button>
        </FieldShell>
      </div>
    </CardShell>
  );
}

// ===========================================================================
// PREVIEW TAB
// ===========================================================================

interface PreviewTabProps {
  title: string;
  presetLabel: string;
  type: ReportType;
  metric: AgencyReportsData['metrics'][ReportType];
  sections: Set<SectionId>;
  accentHex: string;
  serif: boolean;
  branding: 'cobrand' | 'whitelabel';
  zoom: ZoomLevel;
  onZoomChange: (z: ZoomLevel) => void;
  page: number;
  totalPages: number;
  onPageChange: (n: number) => void;
  onBack: () => void;
  onContinue: () => void;
  agency: { name: string; region: string };
  recipientCount: number;
  previewMode: PreviewMode;
  onPreviewModeChange: (m: PreviewMode) => void;
}

function PreviewTab(props: PreviewTabProps): JSX.Element {
  const {
    title,
    presetLabel,
    type,
    metric,
    sections,
    accentHex,
    serif,
    branding,
    zoom,
    onZoomChange,
    page,
    totalPages,
    onBack,
    onContinue,
    agency,
    recipientCount,
    previewMode,
    onPreviewModeChange,
  } = props;

  const zoomIdx = ZOOM_LEVELS.indexOf(zoom);
  const canZoomOut = zoomIdx > 0;
  const canZoomIn = zoomIdx < ZOOM_LEVELS.length - 1;
  const isPdf = previewMode === 'pdf';

  return (
    <div className="flex flex-col gap-6">
      {/* Eyebrow */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Preview your report</h2>
          <p className="mt-1 text-sm" style={{ color: TOK.textDim }}>
            Live render — exactly how the {isPdf ? 'PDF' : 'XLSX'} will look at export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Preview-mode toggle */}
          <PreviewModeToggle mode={previewMode} onChange={onPreviewModeChange} />
          {/* Zoom controls — PDF only */}
          {isPdf && (
            <div
              className="flex items-center overflow-hidden rounded-md"
              style={{ border: `1px solid ${TOK.border}`, backgroundColor: TOK.surface }}
            >
              <button
                type="button"
                className="grid h-8 w-8 place-items-center transition-colors disabled:opacity-40"
                style={{ color: TOK.textDim }}
                onClick={() => {
                  const next = ZOOM_LEVELS[zoomIdx - 1];
                  if (canZoomOut && next !== undefined) onZoomChange(next);
                }}
                disabled={!canZoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <div
                className="grid w-14 place-items-center text-xs font-medium"
                style={{ color: TOK.text, borderLeft: `1px solid ${TOK.border}`, borderRight: `1px solid ${TOK.border}` }}
              >
                {zoom}%
              </div>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center transition-colors disabled:opacity-40"
                style={{ color: TOK.textDim }}
                onClick={() => {
                  const next = ZOOM_LEVELS[zoomIdx + 1];
                  if (canZoomIn && next !== undefined) onZoomChange(next);
                }}
                disabled={!canZoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
          {/* Fit toggle — PDF only */}
          {isPdf && (
            <button
              type="button"
              onClick={() => onZoomChange(100)}
              className="grid h-8 w-8 place-items-center rounded-md transition-colors"
              style={{
                backgroundColor: TOK.surface,
                border: `1px solid ${TOK.border}`,
                color: zoom === 100 ? TOK.accent : TOK.textDim,
              }}
              aria-label="Reset zoom"
            >
              {zoom === 100 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative mx-auto flex w-full max-w-[940px] flex-col items-center gap-4 rounded-2xl px-6 py-10"
        style={{
          backgroundColor: TOK.surface,
          border: `1px solid ${TOK.border}`,
          backgroundImage: `radial-gradient(circle at 18px 18px, ${TOK.border} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      >
        <AnimatePresence mode="wait">
          {isPdf ? (
            <motion.div
              key="pdf-canvas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex w-full flex-col items-center gap-4"
            >
              {/* Page nav */}
              <div className="flex w-full max-w-[600px] items-center justify-between">
                <button
                  type="button"
                  disabled
                  className="grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-30"
                  style={{ backgroundColor: TOK.surfaceDeep, color: TOK.textDim, border: `1px solid ${TOK.border}` }}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="text-[11px]" style={{ color: TOK.textFaint }}>
                  Page {page} of {totalPages}
                </div>
                <button
                  type="button"
                  disabled
                  className="grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-30"
                  style={{ backgroundColor: TOK.surfaceDeep, color: TOK.textDim, border: `1px solid ${TOK.border}` }}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Paper */}
              <motion.div
                key={`paper-${type}-${zoom}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="origin-top rounded-md shadow-2xl"
                style={{
                  transform: `scale(${zoom / 100})`,
                  width: 600,
                  backgroundColor: HEX.paper,
                  color: HEX.inkDark,
                  boxShadow: '0 24px 60px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                <PaperReport
                  title={title}
                  presetLabel={presetLabel}
                  type={type}
                  metric={metric}
                  sections={sections}
                  accentHex={accentHex}
                  serif={serif}
                  branding={branding}
                  agency={agency}
                  recipientCount={recipientCount}
                />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="xlsx-canvas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex w-full flex-col items-center gap-3"
            >
              <SpreadsheetPreview
                presetLabel={presetLabel}
                type={type}
                metric={metric}
                agency={agency}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer CTAs */}
      <div className="mt-4 flex flex-col items-center gap-4">
        <ContinueCta label="Looks good · Continue to Export" onClick={onContinue} tone="primary" />
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: TOK.textDim }}
        >
          <ChevronLeft size={12} /> Back to Configure
        </button>
      </div>
    </div>
  );
}

// ---------- preview-mode toggle ----------

function PreviewModeToggle({
  mode,
  onChange,
}: {
  mode: PreviewMode;
  onChange: (m: PreviewMode) => void;
}): JSX.Element {
  const options: Array<{ id: PreviewMode; label: string; icon: JSX.Element }> = [
    { id: 'pdf', label: 'PDF', icon: <FileText size={12} /> },
    { id: 'xlsx', label: 'XLSX', icon: <FileSpreadsheet size={12} /> },
  ];
  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5"
      style={{ border: `1px solid ${TOK.border}`, backgroundColor: TOK.surface }}
      role="group"
      aria-label="Preview format"
    >
      {options.map((opt) => {
        const isActive = opt.id === mode;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={isActive}
            className="relative inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors"
            style={{ color: isActive ? '#fff' : TOK.textDim }}
          >
            {isActive && (
              <motion.span
                layoutId="preview-mode-slider"
                className="absolute inset-0 rounded"
                style={{ backgroundColor: TOK.accent }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- spreadsheet preview ----------

type SheetId = 'summary' | 'detail';

function SpreadsheetPreview({
  presetLabel,
  type,
  metric,
  agency,
}: {
  presetLabel: string;
  type: ReportType;
  metric: AgencyReportsData['metrics'][ReportType];
  agency: { name: string; region: string };
}): JSX.Element {
  const [activeSheet, setActiveSheet] = useState<SheetId>('summary');

  // Exact mirror of handleXlsx — same row shapes, same labels.
  const summaryRows: Array<Array<string | number>> = useMemo(
    () => [
      ['Agency', agency.name],
      ['Report type', TYPE_NAME[type]],
      ['Period', presetLabel],
      ['Generated', new Date().toISOString()],
      [],
      ['Total', metric.summary.total],
      ['Average', metric.summary.avg],
      ['High', metric.summary.high],
      ['Low', metric.summary.low],
      [],
      ['Headline', metric.headline],
      ['Summary', metric.pullQuote],
    ],
    [agency.name, presetLabel, type, metric],
  );

  const detailRows: Array<Array<string | number>> = useMemo(
    () => [
      ['Sub-client', 'Domain', TYPE_UNIT[type], 'Δ', 'Status'],
      ...metric.rows.map((r) => [r.subClient, r.domain, r.value, r.delta, STATUS_LABEL[r.status]]),
    ],
    [metric.rows, type],
  );

  const rows = activeSheet === 'summary' ? summaryRows : detailRows;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0) || 1;
  const totalRowCount = summaryRows.length + detailRows.length;
  const sheets: Array<{ id: SheetId; label: string; rowCount: number }> = [
    { id: 'summary', label: 'Summary', rowCount: summaryRows.length },
    { id: 'detail', label: 'Detail', rowCount: detailRows.length },
  ];

  const headerFill = `color-mix(in srgb, ${TOK.accent} 18%, ${TOK.surface})`;
  const altFill = `color-mix(in srgb, ${TOK.accent} 4%, ${TOK.surfaceDeep})`;
  const cellBorder = `1px solid ${TOK.border}`;
  const colLetter = (i: number): string => String.fromCharCode(65 + i);

  return (
    <div
      className="w-full max-w-[820px] overflow-hidden rounded-lg"
      style={{
        backgroundColor: TOK.surface,
        border: `1px solid ${TOK.border}`,
        boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
      }}
    >
      {/* Workbook header strip */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: `1px solid ${TOK.border}`,
          backgroundColor: TOK.surfaceDeep,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 place-items-center rounded"
            style={{
              backgroundColor: `color-mix(in srgb, ${TOK.accent} 14%, transparent)`,
              color: TOK.accent,
              border: `1px solid ${TOK.border}`,
            }}
            aria-hidden
          >
            <FileSpreadsheet size={12} />
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold tracking-tight" style={{ color: TOK.text }}>
              {agency.name.toLowerCase().replace(/\s+/g, '-')}-{type}.xlsx
            </span>
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: TOK.textFaint }}>
              {sheets.find((s) => s.id === activeSheet)?.label} · {totalRowCount} cells
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(['A1', 'fx'] as const).map((tok) => (
            <span
              key={tok}
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                color: TOK.textDim,
                backgroundColor: TOK.surface,
                border: `1px solid ${TOK.border}`,
              }}
            >
              {tok}
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-auto" style={{ maxHeight: 460 }}>
        <table
          className="w-full"
          style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}
        >
          {/* Column letters */}
          <thead>
            <tr>
              <th
                style={{
                  width: 36,
                  padding: '4px 6px',
                  backgroundColor: TOK.surfaceDeep,
                  borderBottom: cellBorder,
                  borderRight: cellBorder,
                  color: TOK.textFaint,
                  fontSize: 9,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
                aria-hidden
              />
              {Array.from({ length: colCount }).map((_, i) => (
                <th
                  key={`col-${i}`}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: TOK.surfaceDeep,
                    borderBottom: cellBorder,
                    borderRight: i === colCount - 1 ? 'none' : cellBorder,
                    color: TOK.textFaint,
                    fontSize: 9,
                    fontWeight: 600,
                    textAlign: 'center',
                    letterSpacing: '0.08em',
                  }}
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const isHeaderRow = rIdx === 0;
              const isEmptyRow = row.length === 0;
              return (
                <tr key={`row-${rIdx}`}>
                  {/* Row number gutter */}
                  <td
                    style={{
                      width: 36,
                      padding: '6px 6px',
                      backgroundColor: TOK.surfaceDeep,
                      borderBottom: cellBorder,
                      borderRight: cellBorder,
                      color: TOK.textFaint,
                      fontSize: 9,
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    {rIdx + 1}
                  </td>
                  {Array.from({ length: colCount }).map((_, cIdx) => {
                    const raw = row[cIdx];
                    const cell = raw === undefined ? '' : raw;
                    const isNumber = typeof cell === 'number';
                    const isFirstCell = rIdx === 0 && cIdx === 0;
                    const bg = isEmptyRow
                      ? TOK.surface
                      : isHeaderRow
                        ? headerFill
                        : rIdx % 2 === 0
                          ? TOK.surface
                          : altFill;
                    return (
                      <td
                        key={`cell-${rIdx}-${cIdx}`}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: bg,
                          borderBottom: cellBorder,
                          borderRight: cIdx === colCount - 1 ? 'none' : cellBorder,
                          color: isHeaderRow ? TOK.accent : isNumber ? TOK.text : TOK.textDim,
                          fontSize: 11,
                          fontWeight: isHeaderRow ? 700 : isNumber ? 600 : 400,
                          textAlign: isNumber ? 'right' : 'left',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          outline: isFirstCell ? `2px solid ${TOK.accent}` : 'none',
                          outlineOffset: isFirstCell ? -2 : 0,
                          position: isFirstCell ? 'relative' : 'static',
                          zIndex: isFirstCell ? 1 : 0,
                        }}
                      >
                        {String(cell)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Padding rows for an empty-grid feel below content */}
            {Array.from({ length: Math.max(0, 4) }).map((_, padIdx) => {
              const rIdx = rows.length + padIdx;
              return (
                <tr key={`pad-${padIdx}`}>
                  <td
                    style={{
                      width: 36,
                      padding: '6px 6px',
                      backgroundColor: TOK.surfaceDeep,
                      borderBottom: cellBorder,
                      borderRight: cellBorder,
                      color: TOK.textFaint,
                      fontSize: 9,
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    {rIdx + 1}
                  </td>
                  {Array.from({ length: colCount }).map((_, cIdx) => (
                    <td
                      key={`pad-cell-${padIdx}-${cIdx}`}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: padIdx % 2 === 0 ? TOK.surface : altFill,
                        borderBottom: cellBorder,
                        borderRight: cIdx === colCount - 1 ? 'none' : cellBorder,
                        fontSize: 11,
                        height: 24,
                      }}
                    >
                      {' '}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs */}
      <div
        className="flex items-center gap-0 px-2 py-1.5"
        style={{
          borderTop: `1px solid ${TOK.border}`,
          backgroundColor: TOK.surfaceDeep,
        }}
        role="tablist"
        aria-label="Sheet tabs"
      >
        {sheets.map((s) => {
          const isActive = s.id === activeSheet;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSheet(s.id)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
              style={{
                color: isActive ? TOK.text : TOK.textDim,
                fontWeight: isActive ? 700 : 500,
              }}
            >
              <span>{s.label}</span>
              <span className="text-[9px]" style={{ color: TOK.textFaint }}>
                · {s.rowCount}r
              </span>
              {isActive && (
                <motion.span
                  layoutId="xlsx-sheet-underline"
                  className="absolute inset-x-2 -bottom-[6px] h-[2px]"
                  style={{ backgroundColor: TOK.accent }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
        <div className="ml-auto text-[10px]" style={{ color: TOK.textFaint }}>
          XLSX preview · {sheets.length} sheets · ~{totalRowCount} rows
        </div>
      </div>
    </div>
  );
}

// ---------- paper render ----------

function PaperReport({
  title,
  presetLabel,
  type,
  metric,
  sections,
  accentHex,
  serif,
  branding,
  agency,
  recipientCount,
}: {
  title: string;
  presetLabel: string;
  type: ReportType;
  metric: AgencyReportsData['metrics'][ReportType];
  sections: Set<SectionId>;
  accentHex: string;
  serif: boolean;
  branding: 'cobrand' | 'whitelabel';
  agency: { name: string; region: string };
  recipientCount: number;
}): JSX.Element {
  const headlineFont = serif ? 'Georgia, "Times New Roman", serif' : 'Outfit, system-ui, sans-serif';
  return (
    <div className="flex flex-col" style={{ padding: 0 }}>
      {/* COVER */}
      {sections.has('cover') && (
        <div
          className="relative flex flex-col gap-3"
          style={{
            padding: '32px 36px 28px 36px',
            backgroundImage: `linear-gradient(135deg, ${accentHex} 0%, ${HEX.accent2} 100%)`,
            color: '#fff',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {branding === 'cobrand' && (
                <span
                  className="grid h-6 w-6 place-items-center rounded"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff' }}
                >
                  <Flame size={12} />
                </span>
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">
                {branding === 'cobrand' ? `${agency.name} · Deliverability` : 'Deliverability Brief'}
              </span>
            </div>
            <span className="text-[10px]" style={{ opacity: 0.85 }}>
              {presetLabel} · {agency.region}
            </span>
          </div>
          <h1
            className="text-[28px] font-bold leading-tight"
            style={{ fontFamily: headlineFont, marginTop: 12 }}
          >
            {title}
          </h1>
          <div
            className="text-[12px] leading-relaxed"
            style={{ opacity: 0.9, maxWidth: 520, marginTop: 4 }}
          >
            {metric.pullQuote}
          </div>
          <div className="mt-4 flex items-center gap-4 text-[10px] uppercase tracking-[0.18em]">
            <span>{TYPE_NAME[type]} report</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{recipientCount} sub-clients</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      )}

      {/* EXEC SUMMARY */}
      {sections.has('exec') && (
        <div style={{ padding: '24px 36px 12px 36px', borderBottom: `1px solid ${HEX.paperEdge}` }}>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: HEX.inkDim, marginBottom: 6 }}
          >
            Executive Summary
          </div>
          <h2
            className="text-[16px] font-semibold leading-snug"
            style={{ fontFamily: headlineFont, color: HEX.inkDark }}
          >
            {metric.headline}
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: HEX.inkDim }}>
            {metric.pullQuote} Across {recipientCount} sub-clients in the period, the portfolio's
            {' '}{TYPE_UNIT[type].toLowerCase()} averaged {metric.summary.avg}, peaking at {metric.summary.high}.
          </p>
        </div>
      )}

      {/* KPI TABLE */}
      {sections.has('kpi') && (
        <div style={{ padding: '20px 36px 8px 36px' }}>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: HEX.inkDim, marginBottom: 8 }}
          >
            Portfolio KPIs
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { label: 'Total', value: metric.summary.total },
                { label: 'Average', value: metric.summary.avg },
                { label: 'High', value: metric.summary.high },
                { label: 'Low', value: metric.summary.low },
              ] as const
            ).map((k) => (
              <div
                key={k.label}
                className="rounded-md"
                style={{
                  border: `1px solid ${HEX.paperEdge}`,
                  padding: '10px 12px',
                  backgroundColor: '#fff',
                }}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: HEX.inkDim }}>
                  {k.label}
                </div>
                <div
                  className="mt-1 text-[18px] font-bold leading-none"
                  style={{ color: HEX.inkDark, fontFamily: headlineFont }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BREAKDOWN */}
      {sections.has('breakdown') && (
        <div style={{ padding: '18px 36px 14px 36px' }}>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: HEX.inkDim, marginBottom: 8 }}
          >
            Sub-client breakdown
          </div>
          <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${HEX.paperEdge}` }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: accentHex, color: '#fff' }}>
                  <th className="text-left text-[10px] uppercase tracking-[0.14em]" style={{ padding: '8px 12px' }}>
                    Sub-client
                  </th>
                  <th className="text-left text-[10px] uppercase tracking-[0.14em]" style={{ padding: '8px 12px' }}>
                    Domain
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-[0.14em]" style={{ padding: '8px 12px' }}>
                    {TYPE_UNIT[type]}
                  </th>
                  <th className="text-right text-[10px] uppercase tracking-[0.14em]" style={{ padding: '8px 12px' }}>
                    Δ
                  </th>
                  <th className="text-left text-[10px] uppercase tracking-[0.14em]" style={{ padding: '8px 12px' }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {metric.rows.map((r, idx) => (
                  <tr
                    key={r.subClient}
                    style={{
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#FBF8F2',
                    }}
                  >
                    <td className="text-[11px] font-medium" style={{ padding: '8px 12px', color: HEX.inkDark }}>
                      {r.subClient}
                    </td>
                    <td className="text-[10px]" style={{ padding: '8px 12px', color: HEX.inkDim }}>
                      {r.domain}
                    </td>
                    <td className="text-right text-[11px] font-semibold" style={{ padding: '8px 12px', color: HEX.inkDark }}>
                      {r.value}
                    </td>
                    <td
                      className="text-right text-[11px] font-medium"
                      style={{
                        padding: '8px 12px',
                        color: r.delta > 0 ? HEX.success : r.delta < 0 ? HEX.danger : HEX.inkDim,
                      }}
                    >
                      {r.delta >= 0 ? '+' : ''}
                      {r.delta}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        className="inline-flex items-center gap-1 rounded-full text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          padding: '2px 8px',
                          backgroundColor: `${STATUS_HEX[r.status]}20`,
                          color: STATUS_HEX[r.status],
                        }}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: STATUS_HEX[r.status] }}
                          aria-hidden
                        />
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRENDS */}
      {sections.has('trends') && (
        <div style={{ padding: '14px 36px 18px 36px' }}>
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: HEX.inkDim, marginBottom: 8 }}
          >
            14-day trends
          </div>
          <div className="grid grid-cols-3 gap-3">
            {metric.rows.slice(0, 6).map((r, i) => (
              <div
                key={r.subClient}
                className="rounded-md"
                style={{
                  border: `1px solid ${HEX.paperEdge}`,
                  padding: '8px 10px',
                  backgroundColor: '#fff',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-medium" style={{ color: HEX.inkDark }}>
                    {r.subClient}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: accentHex }}>
                    {r.value}
                  </div>
                </div>
                <div className="mt-1.5">{sparkline(trendForRow(i + 1, r.value), 140, 22, accentHex)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER */}
      {sections.has('footer') && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: '14px 36px 18px 36px',
            borderTop: `1px solid ${HEX.paperEdge}`,
            color: HEX.inkDim,
          }}
        >
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accentHex }}
              aria-hidden
            />
            {branding === 'cobrand' ? `${agency.name} · Powered by Warmpulse` : 'Generated by Warmpulse'}
          </div>
          <div className="text-[9px] uppercase tracking-[0.18em]">
            {presetLabel} · {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// EXPORT TAB
// ===========================================================================

interface ExportTabProps {
  pdfKb: number;
  xlsxKb: number;
  onPdf: () => void;
  onXlsx: () => void;
  recipientEmail: string;
  onRecipientEmailChange: (s: string) => void;
  onEmailSend: () => void;
  cadence: 'daily' | 'weekly' | 'monthly';
  onCadenceChange: (c: 'daily' | 'weekly' | 'monthly') => void;
  scheduleEmail: string;
  onScheduleEmailChange: (s: string) => void;
  onScheduleSave: () => void;
  onBack: () => void;
  title: string;
  type: ReportType;
}

function ExportTab(props: ExportTabProps): JSX.Element {
  const {
    pdfKb,
    xlsxKb,
    onPdf,
    onXlsx,
    recipientEmail,
    onRecipientEmailChange,
    onEmailSend,
    cadence,
    onCadenceChange,
    scheduleEmail,
    onScheduleEmailChange,
    onScheduleSave,
    onBack,
    title,
    type,
  } = props;

  return (
    <div className="flex flex-col gap-6">
      {/* Eyebrow */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Export your report</h2>
          <p className="mt-1 text-sm" style={{ color: TOK.textDim }}>
            Pick a format — both deliver instantly to your downloads.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: TOK.textDim }}
        >
          <ChevronLeft size={12} /> Back to Preview
        </button>
      </div>

      {/* Top — format cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <FormatCard
          icon={<FileText size={22} />}
          tone="pdf"
          format="PDF"
          subtitle="Portable Document Format"
          description="A4 portrait · branded cover · orange-accented tables · ready to email."
          sizeKb={pdfKb}
          onClick={onPdf}
        />
        <FormatCard
          icon={<FileSpreadsheet size={22} />}
          tone="xlsx"
          format="XLSX"
          subtitle="Spreadsheet · Summary + Detail sheets"
          description="Two-sheet workbook · headlines + KPI block on Summary, full sub-client rows on Detail."
          sizeKb={xlsxKb}
          onClick={onXlsx}
        />
      </div>

      {/* Email stub */}
      <CardShell icon={<Send size={14} />} title="Email this report" subtitle="One-off send to a stakeholder">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <FieldShell label="Recipient email" hint="They'll get the same PDF + XLSX attached">
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => onRecipientEmailChange(e.target.value)}
                placeholder="cto@nimbuscloud.io"
                className="w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                style={{
                  backgroundColor: TOK.surfaceDeep,
                  color: TOK.text,
                  border: `1px solid ${TOK.border}`,
                }}
              />
            </FieldShell>
          </div>
          <button
            type="button"
            onClick={onEmailSend}
            className="inline-flex h-10 items-center gap-2 self-end rounded-md px-4 text-sm font-medium transition-colors"
            style={{
              backgroundColor: TOK.surface,
              color: TOK.accent,
              border: `1px solid ${TOK.accent}`,
            }}
          >
            <Send size={14} />
            Send via email
          </button>
        </div>
      </CardShell>

      {/* Schedule stub */}
      <CardShell icon={<Repeat size={14} />} title="Schedule recurring" subtitle="Auto-generate and send on a cadence">
        <div className="flex flex-col gap-4">
          <FieldShell label="Cadence" hint="When the next edition lands in the inbox">
            <div className="grid gap-2 md:grid-cols-3">
              {CADENCES.map((c) => {
                const isActive = c.id === cadence;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onCadenceChange(c.id)}
                    aria-pressed={isActive}
                    className="flex flex-col items-start gap-1 rounded-md p-3 text-left transition-colors"
                    style={{
                      backgroundColor: isActive ? 'rgba(242,101,34,0.08)' : TOK.surfaceDeep,
                      border: `1px solid ${isActive ? TOK.accent : TOK.border}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-4 w-4 place-items-center rounded-full"
                        style={{
                          backgroundColor: isActive ? TOK.accent : 'transparent',
                          border: `1px solid ${isActive ? TOK.accent : TOK.borderStrong}`,
                        }}
                        aria-hidden
                      >
                        {isActive && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm font-medium" style={{ color: isActive ? TOK.text : TOK.textDim }}>
                        {c.label}
                      </span>
                    </div>
                    <span className="ml-6 text-[11px]" style={{ color: TOK.textFaint }}>
                      {c.meta}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldShell>

          <FieldShell label="Send to" hint="Stakeholder inbox for the standing report">
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={scheduleEmail}
                onChange={(e) => onScheduleEmailChange(e.target.value)}
                placeholder="ops@northwind.agency"
                className="flex-1 rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                style={{
                  backgroundColor: TOK.surfaceDeep,
                  color: TOK.text,
                  border: `1px solid ${TOK.border}`,
                }}
              />
              <button
                type="button"
                onClick={onScheduleSave}
                className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: TOK.surface,
                  color: TOK.accent,
                  border: `1px solid ${TOK.accent}`,
                }}
              >
                <CalendarClock size={14} />
                Save schedule
              </button>
            </div>
          </FieldShell>
        </div>
      </CardShell>

      {/* Recent exports */}
      <CardShell
        icon={<Clock size={14} />}
        title="Recent exports"
        subtitle="Last few reports generated by your team"
      >
        <RecentExportsList items={RECENT_EXPORTS} highlightTitle={title} highlightType={type} />
      </CardShell>
    </div>
  );
}

// ---------- format card ----------

function FormatCard({
  icon,
  tone,
  format,
  subtitle,
  description,
  sizeKb,
  onClick,
}: {
  icon: JSX.Element;
  tone: 'pdf' | 'xlsx';
  format: string;
  subtitle: string;
  description: string;
  sizeKb: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18 }}
      className="relative flex flex-col gap-4 overflow-hidden rounded-xl p-6"
      style={{
        backgroundColor: TOK.surface,
        border: `1px solid ${TOK.border}`,
      }}
    >
      {/* Corner glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(242,101,34,0.12) 0%, transparent 70%)`,
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-lg"
            style={{
              backgroundColor: 'rgba(242,101,34,0.12)',
              color: TOK.accent,
              border: `1px solid ${TOK.border}`,
            }}
            aria-hidden
          >
            {icon}
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">{format}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: TOK.textFaint }}>
                {tone === 'pdf' ? 'document' : 'workbook'}
              </span>
            </div>
            <div className="text-xs" style={{ color: TOK.textDim }}>
              {subtitle}
            </div>
          </div>
        </div>
        <div
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: TOK.accent,
            backgroundColor: 'rgba(242,101,34,0.08)',
            border: `1px solid ${TOK.border}`,
          }}
        >
          ≈ {sizeKb} KB
        </div>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: TOK.textDim }}>
        {description}
      </p>

      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="group inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors"
        style={{
          backgroundColor: TOK.accent,
          color: '#fff',
        }}
      >
        <Download size={14} />
        Download {format}
        <motion.span
          aria-hidden
          className="inline-block"
          initial={{ x: 0 }}
          whileHover={{ x: 3 }}
        >
          <ArrowRight size={14} />
        </motion.span>
      </motion.button>
    </motion.div>
  );
}

// ---------- recent exports list ----------

function RecentExportsList({
  items,
  highlightTitle,
  highlightType,
}: {
  items: RecentExport[];
  highlightTitle: string;
  highlightType: ReportType;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-md py-10"
        style={{ border: `1px dashed ${TOK.border}`, color: TOK.textFaint }}
      >
        <Inbox size={20} />
        <div className="text-xs">No exports yet — your first download will land here.</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {items.map((it, idx) => {
        const isHighlight = it.type === highlightType && it.title === highlightTitle;
        const last = idx === items.length - 1;
        return (
          <div
            key={it.id}
            className="flex items-center justify-between gap-4 py-3"
            style={{
              borderBottom: last ? 'none' : `1px solid ${TOK.border}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-md"
                style={{
                  backgroundColor: TOK.surfaceDeep,
                  color: TOK.accent,
                  border: `1px solid ${TOK.border}`,
                }}
                aria-hidden
              >
                {it.format === 'pdf' ? <FileText size={14} /> : <FileSpreadsheet size={14} />}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{it.title}</span>
                  {isHighlight && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                      style={{
                        color: TOK.accent,
                        backgroundColor: 'rgba(242,101,34,0.12)',
                        border: `1px solid ${TOK.accent}`,
                      }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: TOK.textFaint }}>
                  <span>{TYPE_NAME[it.type]}</span>
                  <span>·</span>
                  <span>{fmtRelative(it.generatedAt)}</span>
                  <span>·</span>
                  <span>{it.sizeKb} KB</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: TOK.accent,
                  backgroundColor: 'rgba(242,101,34,0.06)',
                  border: `1px solid ${TOK.border}`,
                }}
              >
                {it.format.toUpperCase()}
              </span>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-md transition-colors"
                style={{
                  backgroundColor: TOK.surfaceDeep,
                  color: TOK.textDim,
                  border: `1px solid ${TOK.border}`,
                }}
                aria-label="Re-download"
                onClick={() => toast.success(`Re-downloading ${it.title}`)}
              >
                <Download size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// SHARED PRIMITIVES — CardShell, FieldShell, ContinueCta
// ===========================================================================

function CardShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: JSX.Element;
  title: string;
  subtitle?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="rounded-xl"
      style={{
        backgroundColor: TOK.surface,
        border: `1px solid ${TOK.border}`,
      }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${TOK.border}` }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-md"
          style={{
            backgroundColor: 'rgba(242,101,34,0.08)',
            color: TOK.accent,
            border: `1px solid ${TOK.border}`,
          }}
          aria-hidden
        >
          {icon}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight">{title}</span>
          {subtitle && (
            <span className="text-[11px]" style={{ color: TOK.textFaint }}>
              {subtitle}
            </span>
          )}
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: TOK.textDim }}>
          {label}
        </span>
        {hint && (
          <span className="text-[10px]" style={{ color: TOK.textFaint }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ContinueCta({
  label,
  onClick,
  disabled,
  tone = 'primary',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost';
}): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: tone === 'primary' ? TOK.accent : 'transparent',
        color: tone === 'primary' ? '#fff' : TOK.accent,
        border: tone === 'primary' ? '1px solid transparent' : `1px solid ${TOK.accent}`,
        boxShadow: tone === 'primary' ? '0 8px 24px rgba(242,101,34,0.25)' : 'none',
      }}
    >
      <span>{label}</span>
      <motion.span
        aria-hidden
        className="inline-block"
        initial={{ x: 0 }}
        animate={{ x: 0 }}
        whileHover={{ x: 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
      >
        <ArrowRight size={14} />
      </motion.span>
    </motion.button>
  );
}

