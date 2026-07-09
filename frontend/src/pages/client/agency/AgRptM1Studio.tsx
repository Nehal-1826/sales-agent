import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  LineChart,
  Loader2,
  Mail,
  MailCheck,
  Maximize2,
  Minimize2,
  Palette,
  PieChart,
  Save,
  Settings,
  Sparkles,
  Table2,
  Target,
  Type,
  Users,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';
import { formatDateTime } from '@/lib/format';

/**
 * AgRptM1Studio — Agency-tier REPORTS surface, design candidate M1,
 * "Adobe / Figma Design Studio".
 *
 * The Reports surface re-imagined as a PROFESSIONAL DESIGN STUDIO — the
 * aesthetic and ergonomics of Adobe Illustrator, Figma, or Affinity
 * Publisher applied to report configuration:
 *
 *   - A full-bleed TOP TOOLBAR carries the file mark, document title (a
 *     filename like "northwind-warmth-report.pdf"), four report-type
 *     pills with a sliding orange selection underline, a segmented
 *     preview-mode toggle ([ PDF ] [ XLSX ] driven by `layoutId`), and
 *     two REAL export buttons — Download PDF (primary) and Download
 *     XLSX (outline).
 *
 *   - A LEFT RAIL stacks four collapsible accordion PANELS in
 *     Adobe-tool fashion: Document (title input, date-range pills),
 *     Sections (six toggleable parts with eye/eye-off visibility chips),
 *     Branding (accent swatch picker, brand mode radio, serif-font
 *     toggle) and Recipients (sub-client multi-select chips). Each
 *     panel collapses with a 90-degree chevron rotation and a smooth
 *     `framer-motion` height transition.
 *
 *   - The CENTER CANVAS fills the rest of the viewport with the active
 *     preview. In PDF mode it shows a paper-style A4 canvas centered,
 *     shadowed, with zoom controls (50 / 75 / 100 / 150) at the top
 *     right. In XLSX mode it shows a POLISHED workbook frame — clean
 *     rounded card, browser-style sheet tabs at the top (NOT the bottom),
 *     a formula-bar strip, and a modern data table with named column
 *     headers, generous padding, hover row highlights, tabular numerics,
 *     and chip-style status / delta cells. The XLSX preview reads as
 *     Notion / Airtable polish, not as a raw Excel grid.
 *
 *   - A RIGHT INSPECTOR RAIL surfaces document properties: A4 portrait,
 *     page count, font sizes (PDF mode) — or sheet count, total rows /
 *     cells, estimated file size, last generated (XLSX mode).
 *
 * The EXACT-MATCH guarantee is the differentiator: a SHARED builder
 * (`useBuilderData`) produces two plans — `pdf` and `xlsx` — and BOTH
 * the on-screen preview AND the real export buttons consume the same
 * plan. What the user sees IS what they download. The XLSX workbook
 * always carries three sheets (Summary, Detail, Template) and the PDF
 * always ships the cover band, executive summary, KPI table and footer
 * configured in the inspector.
 *
 * Fully STANDALONE — no network, router, query hooks, or required
 * props. Inline MOCK supplies every field so the design-preview harness
 * mounts it prop-less. The future adapter passes `data` once the
 * reports aggregate endpoint exists. This file is the SOURCE OF TRUTH
 * for the M-set `AgencyReportsData` shape — sibling M2 / M3 / M4
 * candidates import it from here so the four variants stay
 * byte-compatible.
 *
 * NOT a split-view editor, NOT a magazine layout (sibling candidates
 * own those identities). The design-studio identity — Adobe / Figma
 * toolbar chrome, accordion panels, polished XLSX workbook preview,
 * shared single-source-of-truth builder — is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — exported, this file is the source of
// truth for the M-set. Sibling M2 / M3 / M4 candidates import
// `AgencyReportsData` from here so the four variants stay byte-compatible.
// ---------------------------------------------------------------------------

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';

export interface AgencyReportsData {
  agency: { name: string; region: string };
  subClients: Array<{
    id: string;
    name: string;
    domain: string;
    mailboxCount: number;
  }>;
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
// Mock data — Northwind Agency, six sub-clients, four fully populated
// report-type metric bundles. Numbers chosen so the pull quotes read
// distinctly and table values do not collide across report types.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyReportsData['subClients'] = [
  { id: 'sc-helix', name: 'Helix Outreach', domain: 'helix.com', mailboxCount: 12 },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxCount: 18 },
  { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.com', mailboxCount: 22 },
  { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 8 },
  { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 14 },
  { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 9 },
];

const METRICS: AgencyReportsData['metrics'] = {
  warmth: {
    headline: 'Portfolio Warmth Trajectory',
    pullQuote:
      "Northwind's portfolio gained an average of 6.4 warmth points over the last 30 days. Three of six sub-clients now sit above the 80 threshold for sustained inbox placement, with Helix and Orion leading the upward trajectory.",
    rows: [
      { subClient: 'Helix Outreach', domain: 'helix.com', value: 84, delta: 7, status: 'good' },
      { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 78, delta: 4, status: 'good' },
      { subClient: 'Orion Sales', domain: 'orionsales.com', value: 86, delta: 9, status: 'good' },
      { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 62, delta: -3, status: 'warn' },
      { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 71, delta: 5, status: 'warn' },
      { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 58, delta: -8, status: 'risk' },
    ],
    summary: { total: 439, avg: 73, high: 86, low: 58 },
  },
  engagement: {
    headline: 'Engagement Lift Report',
    pullQuote:
      'Reply velocity across the Northwind fleet outperformed forecast by a full week. The engagement composite — opens, replies, stars and spam-rescues — climbed 28% month-over-month, with Orion driving the lift.',
    rows: [
      { subClient: 'Helix Outreach', domain: 'helix.com', value: 41, delta: 12, status: 'good' },
      { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 38, delta: 8, status: 'good' },
      { subClient: 'Orion Sales', domain: 'orionsales.com', value: 52, delta: 18, status: 'good' },
      { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 22, delta: -2, status: 'warn' },
      { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 29, delta: 4, status: 'warn' },
      { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 18, delta: -6, status: 'risk' },
    ],
    summary: { total: 200, avg: 33, high: 52, low: 18 },
  },
  placement: {
    headline: 'Inbox Placement Review',
    pullQuote:
      'The portfolio gained 4.2 points of average inbox placement across Gmail, Outlook and Yahoo. Four of six sub-clients hold above 90% inbox rate, while two still need targeted reputation work before the next sending wave.',
    rows: [
      { subClient: 'Helix Outreach', domain: 'helix.com', value: 92, delta: 5, status: 'good' },
      { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 88, delta: 3, status: 'good' },
      { subClient: 'Orion Sales', domain: 'orionsales.com', value: 94, delta: 6, status: 'good' },
      { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 76, delta: -4, status: 'warn' },
      { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 81, delta: 2, status: 'good' },
      { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 64, delta: -9, status: 'risk' },
    ],
    summary: { total: 495, avg: 83, high: 94, low: 64 },
  },
  white_label: {
    headline: 'Portfolio Executive Digest',
    pullQuote:
      'A white-label executive summary suitable for direct distribution to sub-client stakeholders. All WarmPulse references stripped — the artifact carries only the agency mark and the per-sub-client highlights from the trailing 30-day window.',
    rows: [
      { subClient: 'Helix Outreach', domain: 'helix.com', value: 89, delta: 6, status: 'good' },
      { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 82, delta: 4, status: 'good' },
      { subClient: 'Orion Sales', domain: 'orionsales.com', value: 91, delta: 8, status: 'good' },
      { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 69, delta: -1, status: 'warn' },
      { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 76, delta: 3, status: 'good' },
      { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 61, delta: -7, status: 'risk' },
    ],
    summary: { total: 468, avg: 78, high: 91, low: 61 },
  },
};

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'NA-East' },
  subClients: SUB_CLIENTS,
  metrics: METRICS,
};

// ---------------------------------------------------------------------------
// Static metadata — type pills, date-range presets, accent swatches,
// sections, branding modes. All driven from single source so toolbar
// pills, inspector controls, and export filenames stay in lock-step.
// ---------------------------------------------------------------------------

interface TypeMeta {
  id: ReportType;
  label: string;
  short: string;
  Icon: typeof Flame;
  description: string;
}

const TYPE_META: TypeMeta[] = [
  {
    id: 'warmth',
    label: 'Warmth Trajectory',
    short: 'Warmth',
    Icon: Flame,
    description: 'Reputation curve, ramp completion, peer signal lift.',
  },
  {
    id: 'engagement',
    label: 'Engagement Lift',
    short: 'Engagement',
    Icon: MailCheck,
    description: 'Opens, replies, stars and spam-rescues per sub-client.',
  },
  {
    id: 'placement',
    label: 'Inbox Placement',
    short: 'Placement',
    Icon: Target,
    description: 'Gmail / Outlook / Yahoo inbox-vs-spam ratios.',
  },
  {
    id: 'white_label',
    label: 'White-label Digest',
    short: 'White-label',
    Icon: Crown,
    description: 'Executive summary for direct sub-client distribution.',
  },
];

const TYPE_LOOKUP: Record<ReportType, TypeMeta> = TYPE_META.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ReportType, TypeMeta>,
);

type DateRangeId = 'last7' | 'last30' | 'quarter' | 'custom';

interface DateRangeMeta {
  id: DateRangeId;
  label: string;
  short: string;
  Icon: typeof Calendar;
}

const DATE_RANGES: DateRangeMeta[] = [
  { id: 'last7', label: 'Last 7 days', short: '7D', Icon: Calendar },
  { id: 'last30', label: 'Last 30 days', short: '30D', Icon: CalendarRange },
  { id: 'quarter', label: 'This Quarter', short: 'Q', Icon: CalendarRange },
  { id: 'custom', label: 'Custom range', short: 'Custom', Icon: Calendar },
];

interface AccentSwatch {
  hex: string;
  rgb: [number, number, number];
  name: string;
}

const ACCENT_SWATCHES: AccentSwatch[] = [
  { hex: '#F26522', rgb: [242, 101, 34], name: 'Signal Orange' },
  { hex: '#FF8A4B', rgb: [255, 138, 75], name: 'Sunset' },
  { hex: '#FF9670', rgb: [255, 150, 112], name: 'Warm Peach' },
  { hex: '#FFB890', rgb: [255, 184, 144], name: 'Soft Coral' },
  { hex: '#E5571A', rgb: [229, 87, 26], name: 'Ember' },
];

type BrandingMode = 'cobrand' | 'whitelabel';

type SectionKey =
  | 'cover'
  | 'executive'
  | 'kpiTable'
  | 'breakdown'
  | 'trends'
  | 'footer';

interface SectionMeta {
  key: SectionKey;
  label: string;
  hint: string;
  Icon: typeof LayoutGrid;
}

const SECTION_META: SectionMeta[] = [
  {
    key: 'cover',
    label: 'Cover page',
    hint: 'Branded title band with date range.',
    Icon: ImageIcon,
  },
  {
    key: 'executive',
    label: 'Executive summary',
    hint: '1-paragraph pull-quote intro.',
    Icon: Sparkles,
  },
  {
    key: 'kpiTable',
    label: 'KPI table',
    hint: 'Per-sub-client metric + delta + status.',
    Icon: LayoutGrid,
  },
  {
    key: 'breakdown',
    label: 'Breakdown',
    hint: 'Compact cards with status colour.',
    Icon: Building2,
  },
  {
    key: 'trends',
    label: 'Trends chart',
    hint: 'Inline SVG bar chart from rows.',
    Icon: PieChart,
  },
  {
    key: 'footer',
    label: 'Footer',
    hint: 'Page number + brand mark.',
    Icon: Type,
  },
];

const SECTION_LOOKUP: Record<SectionKey, SectionMeta> = SECTION_META.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<SectionKey, SectionMeta>,
);

type ZoomLevel = 50 | 75 | 100 | 150;
const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 150];

type PreviewMode = 'pdf' | 'xlsx';

type SheetId = 'Summary' | 'Detail' | 'Template';
const SHEET_ORDER: SheetId[] = ['Summary', 'Detail', 'Template'];

interface SheetMeta {
  id: SheetId;
  Icon: typeof LineChart;
}

const SHEET_META: Record<SheetId, SheetMeta> = {
  Summary: { id: 'Summary', Icon: LineChart },
  Detail: { id: 'Detail', Icon: Table2 },
  Template: { id: 'Template', Icon: Settings },
};

type PanelId = 'document' | 'sections' | 'branding' | 'recipients';

interface PanelMeta {
  id: PanelId;
  label: string;
  hint: string;
  Icon: typeof LayoutGrid;
}

const PANEL_META: PanelMeta[] = [
  { id: 'document', label: 'Document', hint: 'Title + date range', Icon: FileText },
  { id: 'sections', label: 'Sections', hint: 'Toggle layers', Icon: Layers },
  { id: 'branding', label: 'Branding', hint: 'Accent + brand mode', Icon: Palette },
  { id: 'recipients', label: 'Recipients', hint: 'Sub-clients + email', Icon: Users },
];

// ---------------------------------------------------------------------------
// Config (inspector) state shape and helpers.
// ---------------------------------------------------------------------------

interface ConfigState {
  type: ReportType;
  title: string;
  range: DateRangeId;
  sections: Record<SectionKey, boolean>;
  accentIndex: number;
  branding: BrandingMode;
  serif: boolean;
  selectedSubClientIds: string[];
  emailDestinations: string[];
}

function buildInitialConfig(typeId: ReportType, data: AgencyReportsData): ConfigState {
  return {
    type: typeId,
    title: `${data.agency.name} · ${TYPE_LOOKUP[typeId].label}`,
    range: 'last30',
    sections: {
      cover: true,
      executive: true,
      kpiTable: true,
      breakdown: false,
      trends: true,
      footer: true,
    },
    accentIndex: 0,
    branding: 'cobrand',
    serif: true,
    selectedSubClientIds: data.subClients.map((c) => c.id),
    emailDestinations: ['portfolio@northwindagency.com'],
  };
}

// ---------------------------------------------------------------------------
// Status colour helper — maps row status onto the deliberate orange / amber /
// red sub-palette. Status colours stay in the brand family per the strict
// Shailog palette rule (no violet / blue / cyan / mint / teal).
// ---------------------------------------------------------------------------

interface StatusStyle {
  label: string;
  text: string;
  bg: string;
  border: string;
}

function statusStyle(s: 'good' | 'warn' | 'risk'): StatusStyle {
  if (s === 'good') {
    return {
      label: 'Healthy',
      text: 'var(--wp-success, #4ade80)',
      bg: 'color-mix(in srgb, var(--wp-success, #4ade80) 14%, transparent)',
      border: 'color-mix(in srgb, var(--wp-success, #4ade80) 34%, transparent)',
    };
  }
  if (s === 'warn') {
    return {
      label: 'Watch',
      text: 'var(--wp-warning, #ffb454)',
      bg: 'color-mix(in srgb, var(--wp-warning, #ffb454) 16%, transparent)',
      border: 'color-mix(in srgb, var(--wp-warning, #ffb454) 36%, transparent)',
    };
  }
  return {
    label: 'At risk',
    text: 'var(--wp-danger, #ff6b6b)',
    bg: 'color-mix(in srgb, var(--wp-danger, #ff6b6b) 16%, transparent)',
    border: 'color-mix(in srgb, var(--wp-danger, #ff6b6b) 36%, transparent)',
  };
}

// ---------------------------------------------------------------------------
// Filename helper — keeps both export buttons in lock-step.
// ---------------------------------------------------------------------------

function buildFilename(
  agencyName: string,
  typeId: ReportType,
  ext: 'pdf' | 'xlsx',
): string {
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const type = typeId.replace('_', '-');
  return `${slug}-${type}-report.${ext}`;
}

// ---------------------------------------------------------------------------
// SHARED BUILDER — the SINGLE SOURCE OF TRUTH for what the PDF and XLSX
// artifacts contain. Both the on-screen previews AND the real
// jsPDF / xlsx export functions consume the plans produced here, so what
// the user sees in preview is byte-for-byte what they download.
// ---------------------------------------------------------------------------

type SheetCell = string | number;

interface XlsxColumn {
  name: string;
  align: 'left' | 'right';
}

interface XlsxSheet {
  id: SheetId;
  columns: XlsxColumn[];
  rows: SheetCell[][];
  highlightStatusColumn: number | null;
  highlightDeltaColumn: number | null;
}

interface XlsxWorkbook {
  filename: string;
  sheets: Record<SheetId, XlsxSheet>;
  generatedAt: string;
}

interface PdfPlanSummary {
  k: string;
  v: number;
}

interface PdfPlanRow {
  subClient: string;
  domain: string;
  value: number;
  delta: number;
  status: 'good' | 'warn' | 'risk';
  statusLabel: string;
}

interface PdfPlan {
  filename: string;
  agency: string;
  region: string;
  title: string;
  brandLine: string;
  footerLine: string;
  typeId: ReportType;
  typeLabel: string;
  typeShort: string;
  rangeLabel: string;
  accent: AccentSwatch;
  isWhiteLabel: boolean;
  serif: boolean;
  sections: Record<SectionKey, boolean>;
  pullQuote: string;
  summaries: PdfPlanSummary[];
  rows: PdfPlanRow[];
  totalSubClients: number;
  totalMailboxes: number;
  pageCount: number;
  headlineFontSize: number;
  bodyFontSize: number;
}

interface BuilderData {
  pdf: PdfPlan;
  xlsx: XlsxWorkbook;
}

function buildPdfPlan(state: ConfigState, data: AgencyReportsData): PdfPlan {
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;
  const accent = ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const metric = data.metrics[state.type];
  const selectedSet = new Set(state.selectedSubClientIds);
  const includedRows = metric.rows.filter((r) => {
    const sc = data.subClients.find((c) => c.name === r.subClient);
    return sc ? selectedSet.has(sc.id) : true;
  });
  const totalMailboxes = data.subClients
    .filter((c) => selectedSet.has(c.id))
    .reduce((s, c) => s + c.mailboxCount, 0);
  const isWhiteLabel = state.branding === 'whitelabel';

  return {
    filename: buildFilename(data.agency.name, state.type, 'pdf'),
    agency: data.agency.name,
    region: data.agency.region,
    title: state.title,
    brandLine: isWhiteLabel
      ? data.agency.name
      : `${data.agency.name} · WarmPulse`,
    footerLine: isWhiteLabel
      ? `${data.agency.name} · Confidential`
      : `${data.agency.name} · Powered by WarmPulse`,
    typeId: state.type,
    typeLabel: typeMeta.label,
    typeShort: typeMeta.short,
    rangeLabel: rangeMeta.label,
    accent,
    isWhiteLabel,
    serif: state.serif,
    sections: { ...state.sections },
    pullQuote: metric.pullQuote,
    summaries: [
      { k: 'Total', v: metric.summary.total },
      { k: 'Average', v: metric.summary.avg },
      { k: 'High', v: metric.summary.high },
      { k: 'Low', v: metric.summary.low },
    ],
    rows: includedRows.map((r) => ({
      subClient: r.subClient,
      domain: r.domain,
      value: r.value,
      delta: r.delta,
      status: r.status,
      statusLabel: statusStyle(r.status).label,
    })),
    totalSubClients: state.selectedSubClientIds.length,
    totalMailboxes,
    pageCount: 1,
    headlineFontSize: state.serif ? 20 : 18,
    bodyFontSize: 10,
  };
}

function buildXlsxWorkbook(state: ConfigState, data: AgencyReportsData): XlsxWorkbook {
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;
  const accent = ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const metric = data.metrics[state.type];
  const selectedSet = new Set(state.selectedSubClientIds);
  const includedRows = metric.rows.filter((r) => {
    const sc = data.subClients.find((c) => c.name === r.subClient);
    return sc ? selectedSet.has(sc.id) : true;
  });

  const Summary: XlsxSheet = {
    id: 'Summary',
    columns: [
      { name: 'Field', align: 'left' },
      { name: 'Value', align: 'left' },
    ],
    rows: [
      ['Agency', data.agency.name],
      ['Region', data.agency.region],
      ['Report type', typeMeta.label],
      ['Range', rangeMeta.label],
      ['Branding', state.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand'],
      ['Title', state.title],
      ['Sub-clients', state.selectedSubClientIds.length],
      ['', ''],
      ['Total', metric.summary.total],
      ['Average', metric.summary.avg],
      ['High', metric.summary.high],
      ['Low', metric.summary.low],
    ],
    highlightStatusColumn: null,
    highlightDeltaColumn: null,
  };

  const Detail: XlsxSheet = {
    id: 'Detail',
    columns: [
      { name: 'Sub-client', align: 'left' },
      { name: 'Domain', align: 'left' },
      { name: 'Mailboxes', align: 'right' },
      { name: 'Value', align: 'right' },
      { name: 'Δ', align: 'right' },
      { name: 'Status', align: 'left' },
    ],
    rows: includedRows.map<SheetCell[]>((r) => {
      const sc = data.subClients.find((c) => c.name === r.subClient);
      return [
        r.subClient,
        r.domain,
        sc?.mailboxCount ?? 0,
        r.value,
        r.delta,
        statusStyle(r.status).label,
      ];
    }),
    highlightStatusColumn: 5,
    highlightDeltaColumn: 4,
  };

  const Template: XlsxSheet = {
    id: 'Template',
    columns: [
      { name: 'Setting', align: 'left' },
      { name: 'Value', align: 'left' },
    ],
    rows: [
      ['Title', state.title],
      ['Type', typeMeta.label],
      ['Range', rangeMeta.label],
      ['Branding', state.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand'],
      ['Serif fonts', state.serif ? 'On' : 'Off'],
      ['Accent hex', accent.hex],
      ['Accent name', accent.name],
      ['', ''],
      ...SECTION_META.map<SheetCell[]>((s) => [
        `Section · ${s.label}`,
        state.sections[s.key] ? 'Included' : 'Hidden',
      ]),
      ['', ''],
      ['Recipients', state.emailDestinations.join(', ')],
    ],
    highlightStatusColumn: null,
    highlightDeltaColumn: null,
  };

  return {
    filename: buildFilename(data.agency.name, state.type, 'xlsx'),
    sheets: { Summary, Detail, Template },
    generatedAt: new Date().toISOString(),
  };
}

function useBuilderData(state: ConfigState, data: AgencyReportsData): BuilderData {
  return useMemo(
    () => ({
      pdf: buildPdfPlan(state, data),
      xlsx: buildXlsxWorkbook(state, data),
    }),
    [state, data],
  );
}

// ---------------------------------------------------------------------------
// Animation primitives — page enters fade-up, panels collapse with height
// transitions, slider underlines use `layoutId`, AnimatePresence cross-fades
// the active preview / sheet. Honour reduced-motion.
// ---------------------------------------------------------------------------

const PAGE_VARIANTS = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

const PANEL_BODY_VARIANTS = {
  collapsed: { opacity: 0, height: 0 },
  open: {
    opacity: 1,
    height: 'auto' as const,
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
  },
};

// ---------------------------------------------------------------------------
// Top toolbar — type pills with sliding orange underline.
// ---------------------------------------------------------------------------

interface TypePillsProps {
  active: ReportType;
  onSelect: (id: ReportType) => void;
  reducedMotion: boolean;
}

function TypePills({ active, onSelect, reducedMotion }: TypePillsProps): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface-2, var(--wp-surface)) 80%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
    >
      {TYPE_META.map((meta) => {
        const isActive = meta.id === active;
        const Icon = meta.Icon;
        return (
          <motion.button
            key={meta.id}
            type="button"
            onClick={() => onSelect(meta.id)}
            whileHover={reducedMotion ? undefined : { scale: 1.03 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              zIndex: 1,
            }}
            aria-pressed={isActive}
          >
            {isActive && (
              <motion.span
                layoutId="m1-type-pill"
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  zIndex: -1,
                  boxShadow:
                    '0 6px 18px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{meta.short}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview-mode toggle — segmented [ PDF ] [ XLSX ] with a layoutId-driven
// slider on the active button. The `layoutId="m1-mode-slider"` is the named
// element the task spec calls out.
// ---------------------------------------------------------------------------

interface ModeToggleProps {
  mode: PreviewMode;
  onChange: (m: PreviewMode) => void;
  reducedMotion: boolean;
}

function ModeToggle({ mode, onChange, reducedMotion }: ModeToggleProps): JSX.Element {
  const options: Array<{ id: PreviewMode; label: string; Icon: typeof FileText }> = [
    { id: 'pdf', label: 'PDF', Icon: FileText },
    { id: 'xlsx', label: 'XLSX', Icon: FileSpreadsheet },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface-2, var(--wp-surface)) 80%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
    >
      {options.map((opt) => {
        const isActive = opt.id === mode;
        const Icon = opt.Icon;
        return (
          <motion.button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              zIndex: 1,
            }}
            aria-pressed={isActive}
            aria-label={`${opt.label} preview`}
          >
            {isActive && (
              <motion.span
                layoutId="m1-mode-slider"
                className="absolute inset-0 rounded"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  boxShadow:
                    '0 4px 14px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                  zIndex: -1,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export button — primary (filled) or outline. Brief in-flight spinner.
// ---------------------------------------------------------------------------

interface ExportButtonProps {
  variant: 'primary' | 'outline';
  label: string;
  Icon: typeof Download;
  busy: boolean;
  onClick: () => void;
  reducedMotion: boolean;
}

function ExportButton({
  variant,
  label,
  Icon,
  busy,
  onClick,
  reducedMotion,
}: ExportButtonProps): JSX.Element {
  const baseStyle: CSSProperties =
    variant === 'primary'
      ? {
          background:
            'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
          color: '#fff',
          border:
            '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 65%, transparent)',
          boxShadow:
            '0 8px 22px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
        }
      : {
          background:
            'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
          color: 'var(--wp-accent, #F26522)',
          border:
            '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 45%, transparent)',
        };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileHover={reducedMotion || busy ? undefined : { y: -1 }}
      whileTap={reducedMotion || busy ? undefined : { scale: 0.97 }}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[12px] font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-70"
      style={baseStyle}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden />
      )}
      <span>{label}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Collapsible accordion panel — Adobe / Figma-style left rail panel.
// Header row carries the icon, label and a chevron that rotates 90 degrees
// when collapsed. Body uses `framer-motion` height transitions.
// ---------------------------------------------------------------------------

interface AccordionPanelProps {
  meta: PanelMeta;
  open: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
  children: ReactNode;
}

function AccordionPanel({
  meta,
  open,
  onToggle,
  reducedMotion,
  children,
}: AccordionPanelProps): JSX.Element {
  const Icon = meta.Icon;
  return (
    <section
      className="overflow-hidden rounded-md"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface-2, var(--wp-surface)) 60%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{
          background: open
            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)'
            : 'transparent',
          borderBottom: open ? '1px solid var(--wp-border)' : '1px solid transparent',
        }}
        aria-expanded={open}
      >
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded"
          style={{
            background: open
              ? 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)'
              : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
            color: open ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-dim)',
          }}
        >
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        <div className="flex-1 leading-tight">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--wp-text)' }}
          >
            {meta.label}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
            {meta.hint}
          </div>
        </div>
        <motion.span
          animate={reducedMotion ? undefined : { rotate: open ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="inline-flex"
          aria-hidden
        >
          <ChevronDown
            className="h-3.5 w-3.5"
            style={{ color: 'var(--wp-text-dim)' }}
          />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel-body"
            variants={reducedMotion ? undefined : PANEL_BODY_VARIANTS}
            initial={reducedMotion ? false : 'collapsed'}
            animate={reducedMotion ? undefined : 'open'}
            exit={reducedMotion ? undefined : 'collapsed'}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trends mini-chart — inline SVG bar chart, used in PDF preview only.
// Each bar tinted by the row status colour.
// ---------------------------------------------------------------------------

interface TrendsChartProps {
  rows: PdfPlanRow[];
  accentHex: string;
}

function TrendsChart({ rows, accentHex }: TrendsChartProps): JSX.Element {
  const width = 620;
  const height = 170;
  const padX = 28;
  const padTop = 18;
  const padBottom = 32;
  const max = Math.max(...rows.map((r) => Math.max(r.value, 1)), 1);
  const barAreaW = width - padX * 2;
  const barAreaH = height - padTop - padBottom;
  const slotW = barAreaW / Math.max(rows.length, 1);
  const barW = Math.min(slotW * 0.6, 54);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      role="img"
      aria-label="Per sub-client value chart"
    >
      <line
        x1={padX}
        y1={height - padBottom}
        x2={width - padX}
        y2={height - padBottom}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth={1}
      />
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const y = padTop + (1 - t) * barAreaH;
        return (
          <line
            key={t}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
      {rows.map((row, i) => {
        const slotCenter = padX + slotW * (i + 0.5);
        const barH = (row.value / max) * barAreaH;
        const y = padTop + (barAreaH - barH);
        const fill =
          row.status === 'good'
            ? accentHex
            : row.status === 'warn'
              ? '#FFB890'
              : '#E5571A';
        const labelFirstWord = row.subClient.split(' ')[0] ?? row.subClient;
        return (
          <g key={row.subClient}>
            <rect
              x={slotCenter - barW / 2}
              y={y}
              width={barW}
              height={Math.max(barH, 2)}
              rx={3}
              fill={fill}
              opacity={0.92}
            />
            <text
              x={slotCenter}
              y={y - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="#1f1410"
            >
              {row.value}
            </text>
            <text
              x={slotCenter}
              y={height - padBottom + 14}
              textAnchor="middle"
              fontSize={9.5}
              fill="#5a4a40"
            >
              {labelFirstWord}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PDF preview — renders the EXACT content jsPDF will output. Consumes
// the `PdfPlan` from the shared builder, so what the user sees here is
// byte-for-byte what `handlePdf()` writes to disk.
// ---------------------------------------------------------------------------

interface PdfPreviewProps {
  plan: PdfPlan;
}

function PdfPreview({ plan }: PdfPreviewProps): JSX.Element {
  const accent = plan.accent.hex;
  const titleFontFamily = plan.serif ? "'Georgia', serif" : 'Inter, system-ui, sans-serif';

  return (
    <div className="flex flex-col gap-5 px-12 py-10">
      {/* Cover */}
      {plan.sections.cover && (
        <section
          className="overflow-hidden rounded-lg"
          style={{ border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div
            className="px-7 py-5 text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
          >
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] opacity-90">
              <span>{plan.brandLine}</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                {plan.rangeLabel}
              </span>
            </div>
            <h1
              className="mt-3 text-[28px] font-bold leading-tight"
              style={{ fontFamily: titleFontFamily, letterSpacing: '-0.01em' }}
            >
              {plan.title}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-[12.5px] opacity-90">
              <span>{plan.typeLabel}</span>
              <span aria-hidden>·</span>
              <span>{plan.totalSubClients} sub-clients</span>
              <span aria-hidden>·</span>
              <span>{plan.totalMailboxes} mailboxes</span>
            </div>
          </div>
          <div
            className="h-2"
            style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
          />
        </section>
      )}

      {/* Executive summary */}
      {plan.sections.executive && (
        <section>
          <h2
            className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent, fontFamily: titleFontFamily }}
          >
            Executive summary
          </h2>
          <p className="text-[13.5px] leading-relaxed" style={{ color: '#231914' }}>
            {plan.pullQuote}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2" style={{ color: '#1f1410' }}>
            {plan.summaries.map((s) => (
              <div
                key={s.k}
                className="rounded-md px-3 py-2"
                style={{
                  border: `1px solid ${accent}30`,
                  background: `${accent}0d`,
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: '#6a5448' }}
                >
                  {s.k}
                </div>
                <div
                  className="mt-0.5 text-[18px] font-bold"
                  style={{ fontFamily: titleFontFamily, color: accent }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KPI table */}
      {plan.sections.kpiTable && (
        <section>
          <h2
            className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent, fontFamily: titleFontFamily }}
          >
            KPI table
          </h2>
          <table className="w-full border-collapse text-[12px]" style={{ color: '#1f1410' }}>
            <thead>
              <tr style={{ background: accent, color: '#fff' }}>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.1em]">
                  Sub-client
                </th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.1em]">
                  Domain
                </th>
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-[0.1em]">
                  Value
                </th>
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-[0.1em]">
                  Δ
                </th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.1em]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row, i) => {
                const s = statusStyle(row.status);
                return (
                  <tr
                    key={row.subClient}
                    style={{
                      background: i % 2 === 0 ? '#fff' : `${accent}07`,
                      borderBottom: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    <td className="px-3 py-2 font-semibold">{row.subClient}</td>
                    <td
                      className="px-3 py-2 font-mono text-[11px]"
                      style={{ color: '#6a5448' }}
                    >
                      {row.domain}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {row.value}
                    </td>
                    <td
                      className="px-3 py-2 text-right font-mono"
                      style={{
                        color:
                          row.delta >= 0
                            ? 'var(--wp-success, #4ade80)'
                            : 'var(--wp-danger, #ff6b6b)',
                      }}
                    >
                      {row.delta >= 0 ? `+${row.delta}` : `${row.delta}`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-[10.5px] font-semibold"
                        style={{
                          color: s.text,
                          background: s.bg,
                          border: `1px solid ${s.border}`,
                        }}
                      >
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Breakdown cards */}
      {plan.sections.breakdown && (
        <section>
          <h2
            className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent, fontFamily: titleFontFamily }}
          >
            Per sub-client breakdown
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {plan.rows.map((row) => {
              const s = statusStyle(row.status);
              return (
                <div
                  key={row.subClient}
                  className="rounded-md p-3"
                  style={{ background: '#fff', border: `1px solid ${s.border}` }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="text-[12.5px] font-semibold"
                      style={{ color: '#1f1410' }}
                    >
                      {row.subClient}
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: s.text,
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[10.5px]"
                    style={{ color: '#6a5448' }}
                  >
                    {row.domain}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className="text-[22px] font-bold"
                      style={{ fontFamily: titleFontFamily, color: accent }}
                    >
                      {row.value}
                    </span>
                    <span
                      className="text-[11px] font-mono"
                      style={{
                        color:
                          row.delta >= 0
                            ? 'var(--wp-success, #4ade80)'
                            : 'var(--wp-danger, #ff6b6b)',
                      }}
                    >
                      {row.delta >= 0 ? `+${row.delta}` : `${row.delta}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Trends */}
      {plan.sections.trends && (
        <section>
          <h2
            className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent, fontFamily: titleFontFamily }}
          >
            Trends — per sub-client
          </h2>
          <div
            className="rounded-md px-2 py-3"
            style={{ background: '#fff', border: `1px solid ${accent}24` }}
          >
            <TrendsChart rows={plan.rows} accentHex={accent} />
          </div>
        </section>
      )}

      {/* Footer */}
      {plan.sections.footer && (
        <footer
          className="mt-2 flex items-center justify-between border-t pt-3 text-[10.5px]"
          style={{ borderColor: 'rgba(0,0,0,0.08)', color: '#6a5448' }}
        >
          <span>{plan.footerLine}</span>
          <span>Page 1 of {plan.pageCount}</span>
        </footer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Polished XLSX preview — modeled on Notion / Airtable, NOT raw Excel.
// Sheet tabs at the top, named column headers (with letter superscript), row
// gutter, generous padding, hover highlights, chip-style status / delta cells.
// Consumes the `XlsxWorkbook` from the shared builder.
// ---------------------------------------------------------------------------

const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface XlsxPreviewProps {
  workbook: XlsxWorkbook;
  activeSheet: SheetId;
  onChangeSheet: (s: SheetId) => void;
  reducedMotion: boolean;
}

function XlsxPreview({
  workbook,
  activeSheet,
  onChangeSheet,
  reducedMotion,
}: XlsxPreviewProps): JSX.Element {
  const sheet = workbook.sheets[activeSheet];
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const selectedCellValue =
    sheet.rows.length > 0 && sheet.rows[0] && sheet.rows[0].length > 0
      ? String(sheet.rows[0][0] ?? '')
      : '';

  const totalDataCells = SHEET_ORDER.reduce((sum, id) => {
    const s = workbook.sheets[id];
    return sum + s.rows.length * Math.max(s.columns.length, 1);
  }, 0);

  return (
    <div className="flex h-full flex-col" style={{ background: '#fff' }}>
      {/* File header strip */}
      <div
        className="flex items-center gap-3 border-b px-4 py-2.5"
        style={{
          background:
            'linear-gradient(180deg, #fff8f3 0%, #fff 100%)',
          borderColor: 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
        }}
      >
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded"
          style={{
            background:
              'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
            color: '#fff',
          }}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <div
            className="truncate text-[12.5px] font-semibold"
            style={{ color: '#231914' }}
          >
            {workbook.filename}
          </div>
          <div className="text-[10.5px]" style={{ color: '#6a5448' }}>
            Spreadsheet · {SHEET_ORDER.length} sheets · {totalDataCells} cells
          </div>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-medium"
          style={{
            background:
              'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
            color: 'var(--wp-accent, #F26522)',
            border:
              '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
          }}
        >
          <Download className="h-3 w-3" aria-hidden />
          Ready to export
        </span>
      </div>

      {/* Sheet tabs (browser-style at the TOP, NOT bottom) */}
      <div
        className="flex items-end gap-1 border-b px-3 pt-2"
        style={{
          background:
            'color-mix(in srgb, var(--wp-accent, #F26522) 5%, #faf7f4)',
          borderColor: 'rgba(0,0,0,0.10)',
        }}
      >
        {SHEET_ORDER.map((id) => {
          const isActive = id === activeSheet;
          const SheetIcon = SHEET_META[id].Icon;
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => onChangeSheet(id)}
              whileHover={reducedMotion || isActive ? undefined : { y: -1 }}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              className="relative inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-[11.5px] transition-colors"
              style={{
                color: isActive ? 'var(--wp-accent, #F26522)' : '#6a5448',
                background: isActive ? '#fff' : 'transparent',
                fontWeight: isActive ? 700 : 500,
                border: isActive
                  ? '1px solid rgba(0,0,0,0.10)'
                  : '1px solid transparent',
                borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
                marginBottom: isActive ? -1 : 0,
                boxShadow: isActive
                  ? '0 -2px 6px rgba(0,0,0,0.05)'
                  : 'none',
                zIndex: isActive ? 1 : 0,
              }}
              aria-pressed={isActive}
            >
              <SheetIcon className="h-3.5 w-3.5" aria-hidden />
              <span>{id}</span>
              {isActive ? (
                <motion.span
                  layoutId="m1-sheet-underline"
                  className="absolute left-1 right-1 top-0 h-[2.5px] rounded-b"
                  style={{
                    background:
                      'linear-gradient(90deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              ) : null}
            </motion.button>
          );
        })}
      </div>

      {/* Formula bar */}
      <div
        className="flex items-center gap-3 border-b px-3 py-1.5"
        style={{
          borderColor: 'rgba(0,0,0,0.08)',
          background: '#fafaf7',
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold"
          style={{
            color: 'var(--wp-accent, #F26522)',
            background:
              'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
            minWidth: 32,
          }}
        >
          A1
        </span>
        <span
          aria-hidden
          className="font-mono text-[11px] italic"
          style={{ color: '#6a5448' }}
        >
          fx
        </span>
        <span className="font-mono text-[11.5px]" style={{ color: '#231914' }}>
          {selectedCellValue}
        </span>
      </div>

      {/* Data area */}
      <div className="flex-1 overflow-auto" style={{ background: '#fff' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeSheet}
            initial={reducedMotion ? false : { opacity: 0, y: 4 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <table
              style={{
                borderCollapse: 'separate',
                borderSpacing: 0,
                width: '100%',
                tableLayout: 'auto',
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {/* Header row with named columns + letter superscript */}
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '10px 8px',
                      borderBottom:
                        '2px solid color-mix(in srgb, var(--wp-accent, #F26522) 24%, transparent)',
                      borderRight: '1px solid rgba(0,0,0,0.06)',
                      background:
                        'color-mix(in srgb, var(--wp-accent, #F26522) 6%, #faf7f4)',
                      color: '#6a5448',
                      fontSize: 10,
                      fontWeight: 700,
                      width: 38,
                      textAlign: 'center',
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                    }}
                    aria-hidden
                  />
                  {sheet.columns.map((col, i) => {
                    const letter = COL_LETTERS[i] ?? String.fromCharCode(65 + i);
                    return (
                      <th
                        key={col.name + i}
                        style={{
                          padding: '10px 16px',
                          borderBottom:
                            '2px solid color-mix(in srgb, var(--wp-accent, #F26522) 24%, transparent)',
                          borderRight: '1px solid rgba(0,0,0,0.06)',
                          background:
                            'color-mix(in srgb, var(--wp-accent, #F26522) 9%, #fffaf6)',
                          color: '#231914',
                          fontSize: 11.5,
                          fontWeight: 700,
                          textAlign: col.align,
                          fontFamily: 'Inter, system-ui, sans-serif',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span className="inline-flex items-baseline gap-1">
                          <span>{col.name}</span>
                          <sup
                            className="font-mono"
                            style={{
                              fontSize: 8.5,
                              color: 'var(--wp-accent, #F26522)',
                              fontWeight: 700,
                            }}
                          >
                            {letter}
                          </sup>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, rowIdx) => {
                  const isHovered = hoverRow === rowIdx;
                  const isStripe = rowIdx % 2 === 1;
                  return (
                    <tr
                      key={rowIdx}
                      onMouseEnter={() => setHoverRow(rowIdx)}
                      onMouseLeave={() => setHoverRow(null)}
                      style={{
                        background: isHovered
                          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 7%, #fff)'
                          : isStripe
                            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 3%, #fff)'
                            : '#fff',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Row number gutter */}
                      <td
                        style={{
                          padding: '12px 8px',
                          borderRight: '1px solid rgba(0,0,0,0.06)',
                          borderBottom: '1px solid rgba(0,0,0,0.05)',
                          background: isHovered
                            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)'
                            : 'color-mix(in srgb, var(--wp-accent, #F26522) 4%, #faf7f4)',
                          color: isHovered
                            ? 'var(--wp-accent, #F26522)'
                            : '#9a8478',
                          fontSize: 10,
                          fontWeight: 600,
                          textAlign: 'center',
                          width: 38,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                        }}
                      >
                        {rowIdx + 1}
                      </td>
                      {sheet.columns.map((col, colIdx) => {
                        const raw = row[colIdx];
                        const isNumber = typeof raw === 'number';
                        const text = raw === undefined || raw === '' ? '' : String(raw);
                        const isStatusCol =
                          sheet.highlightStatusColumn === colIdx && rowIdx < sheet.rows.length;
                        const isDeltaCol =
                          sheet.highlightDeltaColumn === colIdx && isNumber;
                        const isA1Selected = rowIdx === 0 && colIdx === 0;

                        // Status chip
                        if (isStatusCol && text) {
                          const semStatus: 'good' | 'warn' | 'risk' =
                            text === 'Healthy'
                              ? 'good'
                              : text === 'Watch'
                                ? 'warn'
                                : 'risk';
                          const s = statusStyle(semStatus);
                          return (
                            <td
                              key={colIdx}
                              style={{
                                padding: '12px 16px',
                                borderRight: '1px solid rgba(0,0,0,0.06)',
                                borderBottom: '1px solid rgba(0,0,0,0.05)',
                                textAlign: col.align,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                                style={{
                                  color: s.text,
                                  background: s.bg,
                                  border: `1px solid ${s.border}`,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full"
                                  style={{ background: s.text }}
                                  aria-hidden
                                />
                                {text}
                              </span>
                            </td>
                          );
                        }

                        // Delta chip with arrow
                        if (isDeltaCol) {
                          const numeric = raw as number;
                          const isPositive = numeric >= 0;
                          const color = isPositive
                            ? 'var(--wp-success, #4ade80)'
                            : 'var(--wp-danger, #ff6b6b)';
                          const ArrowIcon = isPositive ? ArrowUp : ArrowDown;
                          return (
                            <td
                              key={colIdx}
                              style={{
                                padding: '12px 16px',
                                borderRight: '1px solid rgba(0,0,0,0.06)',
                                borderBottom: '1px solid rgba(0,0,0,0.05)',
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono"
                                style={{
                                  color,
                                  background: `color-mix(in srgb, ${color} 14%, transparent)`,
                                  border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                }}
                              >
                                <ArrowIcon
                                  className="h-2.5 w-2.5"
                                  aria-hidden
                                  strokeWidth={3}
                                />
                                {isPositive ? `+${numeric}` : `${numeric}`}
                              </span>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={colIdx}
                            style={{
                              padding: '12px 16px',
                              borderRight: '1px solid rgba(0,0,0,0.06)',
                              borderBottom: '1px solid rgba(0,0,0,0.05)',
                              background: 'transparent',
                              color: '#1f1410',
                              fontSize: 11.5,
                              fontWeight: isNumber ? 600 : 400,
                              textAlign: col.align,
                              fontVariantNumeric: isNumber
                                ? 'tabular-nums'
                                : undefined,
                              fontFamily: isNumber
                                ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                                : 'Inter, system-ui, sans-serif',
                              whiteSpace: 'nowrap',
                              maxWidth: 280,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              outline: isA1Selected
                                ? '2px solid var(--wp-accent, #F26522)'
                                : 'none',
                              outlineOffset: isA1Selected ? '-2px' : undefined,
                              position: 'relative',
                              zIndex: isA1Selected ? 1 : 0,
                            }}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Filler rows so the grid feels full */}
                {Array.from({ length: Math.max(0, 18 - sheet.rows.length) }).map(
                  (_, i) => (
                    <tr key={`filler-${i}`}>
                      <td
                        style={{
                          padding: '12px 8px',
                          borderRight: '1px solid rgba(0,0,0,0.06)',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          background:
                            'color-mix(in srgb, var(--wp-accent, #F26522) 2%, #faf7f4)',
                          color: '#c9bfb6',
                          fontSize: 10,
                          fontWeight: 600,
                          textAlign: 'center',
                          width: 38,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          position: 'sticky',
                          left: 0,
                        }}
                      >
                        {sheet.rows.length + i + 1}
                      </td>
                      {sheet.columns.map((_col, colIdx) => (
                        <td
                          key={colIdx}
                          style={{
                            padding: '12px 16px',
                            borderRight: '1px solid rgba(0,0,0,0.04)',
                            borderBottom: '1px solid rgba(0,0,0,0.03)',
                            background: 'transparent',
                            color: 'transparent',
                            fontSize: 11.5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          &nbsp;
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between border-t px-3 py-1.5 text-[10.5px]"
        style={{
          borderColor: 'rgba(0,0,0,0.08)',
          background:
            'color-mix(in srgb, var(--wp-accent, #F26522) 4%, #faf7f4)',
          color: '#6a5448',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold" style={{ color: '#231914' }}>
            {sheet.rows.length}
          </span>
          <span>rows</span>
          <span aria-hidden>·</span>
          <span className="font-semibold" style={{ color: 'var(--wp-accent, #F26522)' }}>
            {activeSheet}
          </span>
        </span>
        <span>
          Generated {formatDateTime(workbook.generatedAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REAL PDF export — jsPDF + jspdf-autotable, consumes the SAME `PdfPlan`
// the preview rendered. What the user sees in the canvas is byte-for-byte
// what `handlePdf()` writes to disk.
// ---------------------------------------------------------------------------

function exportPdf(plan: PdfPlan): void {
  const accentRgb = plan.accent.rgb;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let cursorY = 0;
  const titleFont: 'times' | 'helvetica' = plan.serif ? 'times' : 'helvetica';

  // Cover band
  if (plan.sections.cover) {
    doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.rect(0, 0, pageW, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(plan.brandLine.toUpperCase(), margin, 22);
    doc.setFontSize(plan.headlineFontSize);
    doc.setFont(titleFont, 'bold');
    doc.text(plan.title, margin, 44);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(plan.rangeLabel, pageW - margin, 22, { align: 'right' });
    cursorY = 88;
  } else {
    cursorY = margin;
    doc.setTextColor(31, 20, 16);
    doc.setFontSize(plan.headlineFontSize);
    doc.setFont(titleFont, 'bold');
    doc.text(plan.title, margin, cursorY);
    cursorY += 24;
  }

  // Executive summary
  if (plan.sections.executive) {
    doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('EXECUTIVE SUMMARY', margin, cursorY);
    cursorY += 14;
    doc.setTextColor(31, 20, 16);
    doc.setFontSize(plan.bodyFontSize);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(plan.pullQuote, pageW - margin * 2);
    doc.text(wrapped, margin, cursorY);
    cursorY += wrapped.length * 12 + 8;

    const cellW = (pageW - margin * 2 - 18) / 4;
    plan.summaries.forEach((s, i) => {
      const x = margin + i * (cellW + 6);
      doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.setFillColor(255, 250, 246);
      doc.roundedRect(x, cursorY, cellW, 38, 3, 3, 'FD');
      doc.setTextColor(106, 84, 72);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(s.k.toUpperCase(), x + 8, cursorY + 12);
      doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.setFontSize(14);
      doc.setFont(titleFont, 'bold');
      doc.text(String(s.v), x + 8, cursorY + 30);
    });
    cursorY += 50;
  }

  // KPI table
  if (plan.sections.kpiTable) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Sub-client', 'Domain', 'Value', 'Δ', 'Status']],
      body: plan.rows.map((r) => [
        r.subClient,
        r.domain,
        r.value.toString(),
        `${r.delta >= 0 ? '+' : ''}${r.delta}`,
        r.statusLabel,
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [accentRgb[0], accentRgb[1], accentRgb[2]],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 9, textColor: [31, 20, 16] },
      alternateRowStyles: { fillColor: [255, 248, 242] },
      margin: { left: margin, right: margin },
      styles: { cellPadding: 4 },
    });
    const finalY: number =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY ?? cursorY + 100;
    cursorY = finalY + 16;
  }

  // Breakdown
  if (plan.sections.breakdown) {
    doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('PER SUB-CLIENT BREAKDOWN', margin, cursorY);
    cursorY += 12;
    doc.setTextColor(31, 20, 16);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    plan.rows.forEach((r) => {
      doc.text(
        `${r.subClient} — ${r.domain} · ${r.value} (${r.delta >= 0 ? '+' : ''}${r.delta}) · ${r.statusLabel}`,
        margin,
        cursorY,
      );
      cursorY += 11;
    });
    cursorY += 6;
  }

  // Trends (mini bar strip)
  if (plan.sections.trends && cursorY < 740) {
    doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TRENDS', margin, cursorY);
    cursorY += 10;
    const max = Math.max(...plan.rows.map((r) => r.value), 1);
    const chartH = 60;
    const chartW = pageW - margin * 2;
    const slotW = chartW / Math.max(plan.rows.length, 1);
    const barW = Math.min(slotW * 0.55, 36);
    doc.setDrawColor(180, 170, 162);
    doc.line(margin, cursorY + chartH, pageW - margin, cursorY + chartH);
    plan.rows.forEach((r, i) => {
      const h = (r.value / max) * chartH;
      const x = margin + slotW * (i + 0.5) - barW / 2;
      const y = cursorY + (chartH - h);
      doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
      doc.rect(x, y, barW, h, 'F');
      doc.setTextColor(106, 84, 72);
      doc.setFontSize(7);
      doc.text(
        (r.subClient.split(' ')[0] ?? r.subClient).slice(0, 8),
        x + barW / 2,
        cursorY + chartH + 10,
        { align: 'center' },
      );
    });
    cursorY += chartH + 18;
  }

  // Footer
  if (plan.sections.footer) {
    doc.setTextColor(106, 84, 72);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(plan.footerLine, margin, 820);
    doc.text(`Page 1 of ${plan.pageCount}`, pageW - margin, 820, {
      align: 'right',
    });
  }

  doc.save(plan.filename);
}

// ---------------------------------------------------------------------------
// REAL XLSX export — `xlsx` workbook. Consumes the SAME `XlsxWorkbook` the
// preview rendered. Three sheets: Summary, Detail, Template — each
// `XLSX.utils.aoa_to_sheet` from the plan's rows.
// ---------------------------------------------------------------------------

function exportXlsx(workbook: XlsxWorkbook): void {
  const wb = XLSX.utils.book_new();
  for (const id of SHEET_ORDER) {
    const sheet = workbook.sheets[id];
    const aoa: SheetCell[][] = [
      sheet.columns.map((c) => c.name),
      ...sheet.rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, id);
  }
  XLSX.writeFile(wb, workbook.filename);
}

// ---------------------------------------------------------------------------
// Inspector helpers — small reusable building blocks for the right rail.
// ---------------------------------------------------------------------------

interface InspectorRowProps {
  label: string;
  value: string;
  emphasis?: boolean;
}

function InspectorRow({ label, value, emphasis }: InspectorRowProps): JSX.Element {
  return (
    <div
      className="flex items-center justify-between rounded px-2 py-1.5"
      style={{
        background: emphasis
          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)'
          : 'transparent',
      }}
    >
      <span
        className="text-[10.5px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[11px] font-semibold"
        style={{
          color: emphasis ? 'var(--wp-accent, #F26522)' : 'var(--wp-text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRptM1Studio({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const reducedMotion = useReducedMotion() ?? false;

  const initialState = useMemo(() => buildInitialConfig('warmth', d), [d]);
  const [state, setState] = useState<ConfigState>(initialState);
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');
  const [activeSheet, setActiveSheet] = useState<SheetId>('Summary');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<PanelId, boolean>>({
    document: true,
    sections: true,
    branding: true,
    recipients: false,
  });

  const builder = useBuilderData(state, d);

  const accent = ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const typeMeta = TYPE_LOOKUP[state.type];

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleTypeChange = useCallback(
    (typeId: ReportType) => {
      setState((prev) => ({
        ...prev,
        type: typeId,
        title:
          prev.title === `${d.agency.name} · ${TYPE_LOOKUP[prev.type].label}`
            ? `${d.agency.name} · ${TYPE_LOOKUP[typeId].label}`
            : prev.title,
      }));
    },
    [d.agency.name],
  );

  const handleTitleChange = useCallback((value: string) => {
    setState((prev) => ({ ...prev, title: value }));
  }, []);

  const handleRangeChange = useCallback((id: DateRangeId) => {
    setState((prev) => ({ ...prev, range: id }));
  }, []);

  const handleSectionToggle = useCallback((key: SectionKey) => {
    setState((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }));
  }, []);

  const handleAccentSelect = useCallback((idx: number) => {
    setState((prev) => ({ ...prev, accentIndex: idx }));
  }, []);

  const handleBrandingChange = useCallback((mode: BrandingMode) => {
    setState((prev) => ({ ...prev, branding: mode }));
  }, []);

  const handleSerifToggle = useCallback(() => {
    setState((prev) => ({ ...prev, serif: !prev.serif }));
  }, []);

  const handleSubClientToggle = useCallback((id: string) => {
    setState((prev) => {
      const has = prev.selectedSubClientIds.includes(id);
      return {
        ...prev,
        selectedSubClientIds: has
          ? prev.selectedSubClientIds.filter((x) => x !== id)
          : [...prev.selectedSubClientIds, id],
      };
    });
  }, []);

  const handlePanelToggle = useCallback((id: PanelId) => {
    setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handlePdf = useCallback(() => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      exportPdf(builder.pdf);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF export failed', err);
      toast.error('PDF export failed — check console');
    } finally {
      window.setTimeout(() => setPdfBusy(false), 380);
    }
  }, [builder.pdf, pdfBusy]);

  const handleXlsx = useCallback(() => {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      exportXlsx(builder.xlsx);
      toast.success('XLSX downloaded');
    } catch (err) {
      console.error('XLSX export failed', err);
      toast.error('XLSX export failed — check console');
    } finally {
      window.setTimeout(() => setXlsxBusy(false), 380);
    }
  }, [builder.xlsx, xlsxBusy]);

  // -------------------------------------------------------------------------
  // Derived state for inspector rail
  // -------------------------------------------------------------------------

  const enabledSectionCount = useMemo(
    () =>
      SECTION_META.reduce((n, m) => (state.sections[m.key] ? n + 1 : n), 0),
    [state.sections],
  );

  const xlsxTotals = useMemo(() => {
    let rows = 0;
    let cells = 0;
    for (const id of SHEET_ORDER) {
      const s = builder.xlsx.sheets[id];
      // Count header row + data rows
      rows += 1 + s.rows.length;
      cells += s.columns.length + s.rows.length * Math.max(s.columns.length, 1);
    }
    return { rows, cells };
  }, [builder.xlsx]);

  const xlsxApproxSize = useMemo(() => {
    // Rough estimate: ~22 bytes per cell of overhead in a small xlsx
    const bytes = xlsxTotals.cells * 22 + 4096;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, [xlsxTotals.cells]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <motion.div
      variants={reducedMotion ? undefined : PAGE_VARIANTS}
      initial={reducedMotion ? undefined : 'hidden'}
      animate={reducedMotion ? undefined : 'show'}
      className="flex h-full w-full flex-col"
      style={{
        background:
          'radial-gradient(1100px 600px at 18% -10%, color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent), transparent 60%), var(--wp-bg)',
        color: 'var(--wp-text)',
        minHeight: '100vh',
      }}
    >
      {/* Top toolbar — Studio chrome (~48px tall) */}
      <header
        className="sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b px-3"
        style={{
          background: 'color-mix(in srgb, var(--wp-surface) 85%, transparent)',
          borderColor: 'var(--wp-border)',
          backdropFilter: 'blur(12px)',
          boxShadow: 'inset 0 -1px 0 var(--wp-border)',
        }}
      >
        {/* Left: logo + file mark */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="inline-flex h-8 w-8 items-center justify-center rounded-md"
            style={{
              background:
                'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
              color: '#fff',
              boxShadow:
                '0 4px 12px color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
            }}
          >
            <FileText className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                Reports
              </span>
              <span aria-hidden style={{ color: 'var(--wp-text-faint)' }}>
                ·
              </span>
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: 'var(--wp-text)' }}
              >
                Studio
              </span>
            </div>
            <div
              className="truncate font-mono text-[10.5px]"
              style={{ color: 'var(--wp-text-faint)', maxWidth: 280 }}
            >
              {previewMode === 'pdf' ? builder.pdf.filename : builder.xlsx.filename}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-7 w-px" style={{ background: 'var(--wp-border)' }} />

        {/* Center: type pills */}
        <div className="flex flex-1 items-center justify-center">
          <TypePills
            active={state.type}
            onSelect={handleTypeChange}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Right: mode toggle + exports */}
        <div className="flex items-center gap-2">
          <ModeToggle
            mode={previewMode}
            onChange={setPreviewMode}
            reducedMotion={reducedMotion}
          />
          <div className="h-7 w-px" style={{ background: 'var(--wp-border)' }} />
          <ExportButton
            variant="outline"
            label="Download XLSX"
            Icon={FileSpreadsheet}
            busy={xlsxBusy}
            onClick={handleXlsx}
            reducedMotion={reducedMotion}
          />
          <ExportButton
            variant="primary"
            label="Download PDF"
            Icon={Download}
            busy={pdfBusy}
            onClick={handlePdf}
            reducedMotion={reducedMotion}
          />
        </div>
      </header>

      {/* Main 3-column body */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT RAIL — accordion panels */}
        <aside
          className="flex flex-shrink-0 flex-col gap-2 overflow-y-auto p-3"
          style={{
            width: 340,
            borderRight: '1px solid var(--wp-border)',
            background:
              'color-mix(in srgb, var(--wp-surface-2, var(--wp-surface)) 50%, transparent)',
          }}
        >
          {/* Document panel */}
          <AccordionPanel
            meta={PANEL_META[0]!}
            open={openPanels.document}
            onToggle={() => handlePanelToggle('document')}
            reducedMotion={reducedMotion}
          >
            <div className="space-y-3">
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  Title
                </label>
                <input
                  type="text"
                  value={state.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-md px-3 py-2 text-[12px] font-medium outline-none transition-colors"
                  style={{
                    background: 'var(--wp-surface)',
                    color: 'var(--wp-text)',
                    border: '1px solid var(--wp-border)',
                  }}
                />
                <p
                  className="mt-1 text-[10px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  {typeMeta.description}
                </p>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  Date range
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {DATE_RANGES.map((rng) => {
                    const Icon = rng.Icon;
                    const isActive = rng.id === state.range;
                    return (
                      <button
                        key={rng.id}
                        type="button"
                        onClick={() => handleRangeChange(rng.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
                        style={{
                          color: isActive ? '#fff' : 'var(--wp-text-dim)',
                          background: isActive
                            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                            : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                          border: isActive
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
                            : '1px solid var(--wp-border)',
                        }}
                      >
                        <Icon className="h-3 w-3" aria-hidden />
                        {rng.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </AccordionPanel>

          {/* Sections panel — toggleable layers with eye icon */}
          <AccordionPanel
            meta={PANEL_META[1]!}
            open={openPanels.sections}
            onToggle={() => handlePanelToggle('sections')}
            reducedMotion={reducedMotion}
          >
            <ul className="space-y-1.5">
              {SECTION_META.map((sec) => {
                const on = state.sections[sec.key];
                const Icon = sec.Icon;
                return (
                  <li key={sec.key}>
                    <button
                      type="button"
                      onClick={() => handleSectionToggle(sec.key)}
                      className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors"
                      style={{
                        background: on
                          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)'
                          : 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
                        border: on
                          ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)'
                          : '1px solid var(--wp-border)',
                      }}
                      aria-pressed={on}
                    >
                      {/* Visibility eye chip */}
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded"
                        style={{
                          background: on
                            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)'
                            : 'color-mix(in srgb, var(--wp-surface) 90%, transparent)',
                          color: on
                            ? 'var(--wp-accent, #F26522)'
                            : 'var(--wp-text-faint)',
                        }}
                        aria-hidden
                      >
                        {on ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </span>
                      <Icon
                        className="h-3.5 w-3.5 flex-shrink-0"
                        style={{
                          color: on
                            ? 'var(--wp-accent, #F26522)'
                            : 'var(--wp-text-faint)',
                        }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div
                          className="text-[11.5px] font-medium"
                          style={{
                            color: on
                              ? 'var(--wp-text)'
                              : 'var(--wp-text-dim)',
                          }}
                        >
                          {sec.label}
                        </div>
                        <div
                          className="text-[10px]"
                          style={{ color: 'var(--wp-text-faint)' }}
                        >
                          {sec.hint}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div
              className="mt-3 flex items-center justify-between rounded px-2 py-1"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
              }}
            >
              <span
                className="text-[10px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                Enabled
              </span>
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color: 'var(--wp-accent, #F26522)' }}
              >
                {enabledSectionCount} / {SECTION_META.length}
              </span>
            </div>
          </AccordionPanel>

          {/* Branding panel */}
          <AccordionPanel
            meta={PANEL_META[2]!}
            open={openPanels.branding}
            onToggle={() => handlePanelToggle('branding')}
            reducedMotion={reducedMotion}
          >
            <div className="space-y-3">
              {/* Accent swatches */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Accent color
                  </span>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    {accent.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ACCENT_SWATCHES.map((sw, i) => {
                    const isActive = i === state.accentIndex;
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        onClick={() => handleAccentSelect(i)}
                        title={`${sw.name} · ${sw.hex}`}
                        className="relative h-7 w-7 rounded-full transition-transform"
                        style={{
                          background: sw.hex,
                          transform: isActive ? 'scale(1.1)' : 'scale(1)',
                          boxShadow: isActive
                            ? `0 0 0 2px var(--wp-bg), 0 0 0 4px ${sw.hex}`
                            : '0 0 0 1px rgba(0,0,0,0.1) inset',
                        }}
                      >
                        {isActive ? (
                          <Check
                            className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2"
                            style={{ color: '#fff' }}
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brand mode radio */}
              <div>
                <span
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  Brand mode
                </span>
                <div className="space-y-1.5">
                  {[
                    {
                      id: 'cobrand' as const,
                      label: 'Co-brand',
                      hint: 'WarmPulse mark in footer.',
                    },
                    {
                      id: 'whitelabel' as const,
                      label: 'White-label',
                      hint: 'Agency only · no WarmPulse refs.',
                    },
                  ].map((opt) => {
                    const isActive = opt.id === state.branding;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleBrandingChange(opt.id)}
                        className="flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors"
                        style={{
                          background: isActive
                            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)'
                            : 'color-mix(in srgb, var(--wp-surface) 75%, transparent)',
                          border: isActive
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 45%, transparent)'
                            : '1px solid var(--wp-border)',
                        }}
                      >
                        <span
                          className="mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: isActive
                              ? 'var(--wp-accent, #F26522)'
                              : 'transparent',
                            border: isActive
                              ? '1px solid var(--wp-accent, #F26522)'
                              : '1px solid var(--wp-text-faint)',
                          }}
                        >
                          {isActive ? (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: '#fff' }}
                            />
                          ) : null}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <div
                            className="text-[11.5px] font-medium"
                            style={{ color: 'var(--wp-text)' }}
                          >
                            {opt.label}
                          </div>
                          <div
                            className="text-[10px]"
                            style={{ color: 'var(--wp-text-faint)' }}
                          >
                            {opt.hint}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Serif font toggle */}
              <button
                type="button"
                onClick={handleSerifToggle}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors"
                style={{
                  background: state.serif
                    ? 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)'
                    : 'color-mix(in srgb, var(--wp-surface) 75%, transparent)',
                  border: state.serif
                    ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)'
                    : '1px solid var(--wp-border)',
                }}
                aria-pressed={state.serif}
              >
                <span className="inline-flex items-center gap-2">
                  <Type
                    className="h-3.5 w-3.5"
                    style={{
                      color: state.serif
                        ? 'var(--wp-accent, #F26522)'
                        : 'var(--wp-text-dim)',
                    }}
                    aria-hidden
                  />
                  <span
                    className="text-[11.5px] font-medium"
                    style={{ color: 'var(--wp-text)' }}
                  >
                    Serif headlines
                  </span>
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{
                    color: state.serif ? '#fff' : 'var(--wp-text-dim)',
                    background: state.serif
                      ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                      : 'color-mix(in srgb, var(--wp-surface) 90%, transparent)',
                    border: state.serif
                      ? 'none'
                      : '1px solid var(--wp-border)',
                  }}
                >
                  {state.serif ? 'On' : 'Off'}
                </span>
              </button>
            </div>
          </AccordionPanel>

          {/* Recipients panel */}
          <AccordionPanel
            meta={PANEL_META[3]!}
            open={openPanels.recipients}
            onToggle={() => handlePanelToggle('recipients')}
            reducedMotion={reducedMotion}
          >
            <div className="space-y-3">
              <div>
                <span
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  Sub-clients · {state.selectedSubClientIds.length} / {d.subClients.length}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {d.subClients.map((sc) => {
                    const isOn = state.selectedSubClientIds.includes(sc.id);
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => handleSubClientToggle(sc.id)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-medium transition-colors"
                        style={{
                          color: isOn ? '#fff' : 'var(--wp-text-dim)',
                          background: isOn
                            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                            : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                          border: isOn
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
                            : '1px solid var(--wp-border)',
                        }}
                        aria-pressed={isOn}
                      >
                        {isOn ? (
                          <Check className="h-3 w-3" aria-hidden />
                        ) : (
                          <Filter className="h-3 w-3" aria-hidden />
                        )}
                        <span>{sc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  Email destinations
                </span>
                <div
                  className="rounded-md p-2"
                  style={{
                    background: 'var(--wp-surface)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  {state.emailDestinations.map((email) => (
                    <div
                      key={email}
                      className="flex items-center gap-2 rounded px-1.5 py-1"
                    >
                      <Mail
                        className="h-3 w-3"
                        style={{ color: 'var(--wp-accent, #F26522)' }}
                        aria-hidden
                      />
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: 'var(--wp-text)' }}
                      >
                        {email}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AccordionPanel>

          {/* Save template footer */}
          <div className="mt-2 flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={reducedMotion ? undefined : { y: -1 }}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              onClick={() => toast.success('Template saved')}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11.5px] font-semibold"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
                color: 'var(--wp-accent, #F26522)',
                border:
                  '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)',
              }}
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save template
            </motion.button>
          </div>
        </aside>

        {/* CENTER CANVAS */}
        <main
          className="flex min-w-0 flex-1 flex-col overflow-y-auto"
          style={{
            background:
              'radial-gradient(800px 400px at 50% -20%, color-mix(in srgb, var(--wp-accent, #F26522) 5%, transparent), transparent 60%)',
          }}
        >
          {/* Canvas top sub-bar — zoom + label */}
          <div
            className="sticky top-0 z-20 flex items-center justify-between border-b px-5 py-2"
            style={{
              background: 'color-mix(in srgb, var(--wp-bg) 80%, transparent)',
              borderColor: 'var(--wp-border)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                Canvas
              </span>
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium"
                style={{
                  background:
                    'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                  color: 'var(--wp-accent, #F26522)',
                  border:
                    '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                }}
              >
                {previewMode === 'pdf' ? 'PDF · A4 portrait' : 'XLSX · 3 sheets'}
              </span>
            </div>

            {previewMode === 'pdf' && (
              <div
                className="inline-flex items-center gap-1 rounded-md p-1"
                style={{
                  background:
                    'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                  border: '1px solid var(--wp-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const idx = ZOOM_LEVELS.indexOf(zoom);
                    const next = ZOOM_LEVELS[Math.max(0, idx - 1)]!;
                    setZoom(next);
                  }}
                  disabled={zoom === ZOOM_LEVELS[0]}
                  aria-label="Zoom out"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[12px] disabled:opacity-40"
                  style={{ color: 'var(--wp-text-dim)' }}
                >
                  <Minimize2 className="h-3 w-3" aria-hidden />
                </button>
                {ZOOM_LEVELS.map((z) => {
                  const isActive = z === zoom;
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoom(z)}
                      className="rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors"
                      style={{
                        color: isActive ? '#fff' : 'var(--wp-text-dim)',
                        background: isActive
                          ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                          : 'transparent',
                      }}
                    >
                      {z}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    const idx = ZOOM_LEVELS.indexOf(zoom);
                    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, idx + 1)]!;
                    setZoom(next);
                  }}
                  disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                  aria-label="Zoom in"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[12px] disabled:opacity-40"
                  style={{ color: 'var(--wp-text-dim)' }}
                >
                  <Maximize2 className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {/* Canvas body */}
          <div className="flex flex-1 justify-center overflow-x-auto px-8 py-10">
            <AnimatePresence mode="wait" initial={false}>
              {previewMode === 'pdf' ? (
                <motion.div
                  key="pdf-canvas"
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                  style={{ width: 720 }}
                >
                  <motion.div
                    animate={reducedMotion ? undefined : { scale: zoom / 100 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                    style={{ transformOrigin: 'top center' }}
                    className="relative overflow-hidden rounded-lg"
                  >
                    <div
                      style={{
                        background: 'var(--wp-surface, #fffaf6)',
                        color: '#1f1410',
                        boxShadow:
                          '0 30px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.06)',
                        minHeight: 940,
                      }}
                    >
                      <PdfPreview plan={builder.pdf} />
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="xlsx-canvas"
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                  className="relative overflow-hidden rounded-xl"
                  style={{
                    width: '100%',
                    maxWidth: 880,
                    background: '#fff',
                    boxShadow:
                      '0 30px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.32)',
                    border:
                      '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 22%, transparent)',
                    minHeight: 880,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <XlsxPreview
                    workbook={builder.xlsx}
                    activeSheet={activeSheet}
                    onChangeSheet={setActiveSheet}
                    reducedMotion={reducedMotion}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Canvas footer hint */}
          <div
            className="flex items-center justify-center gap-2 border-t px-4 py-2 text-[10.5px]"
            style={{
              borderColor: 'var(--wp-border)',
              color: 'var(--wp-text-faint)',
              background: 'color-mix(in srgb, var(--wp-bg) 65%, transparent)',
            }}
          >
            <span>
              What you see is what downloads. Builder source is shared between
              preview and export.
            </span>
          </div>
        </main>

        {/* RIGHT INSPECTOR RAIL */}
        <aside
          className="flex flex-shrink-0 flex-col overflow-y-auto p-3"
          style={{
            width: 280,
            borderLeft: '1px solid var(--wp-border)',
            background:
              'color-mix(in srgb, var(--wp-surface-2, var(--wp-surface)) 50%, transparent)',
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)',
                color: 'var(--wp-accent, #F26522)',
              }}
            >
              <Settings className="h-3 w-3" aria-hidden />
            </span>
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--wp-text)' }}
            >
              Inspector
            </h3>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {previewMode === 'pdf' ? (
              <motion.div
                key="pdf-inspector"
                initial={reducedMotion ? false : { opacity: 0, x: 6 }}
                animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Page properties
                  </h4>
                  <InspectorRow label="Format" value="A4" />
                  <InspectorRow label="Orientation" value="Portrait" />
                  <InspectorRow label="Margin" value="40 pt" />
                  <InspectorRow label="Pages" value={String(builder.pdf.pageCount)} emphasis />
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Typography
                  </h4>
                  <InspectorRow
                    label="Headline"
                    value={`${builder.pdf.headlineFontSize} pt`}
                  />
                  <InspectorRow
                    label="Body"
                    value={`${builder.pdf.bodyFontSize} pt`}
                  />
                  <InspectorRow
                    label="Family"
                    value={builder.pdf.serif ? 'Serif' : 'Sans'}
                  />
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Layers
                  </h4>
                  <ul className="space-y-1">
                    {SECTION_META.map((s) => {
                      const on = state.sections[s.key];
                      return (
                        <li
                          key={s.key}
                          className="flex items-center gap-1.5 rounded px-1.5 py-1"
                          style={{
                            background: on
                              ? 'transparent'
                              : 'color-mix(in srgb, var(--wp-surface) 85%, transparent)',
                            opacity: on ? 1 : 0.55,
                          }}
                        >
                          {on ? (
                            <Eye
                              className="h-3 w-3"
                              style={{ color: 'var(--wp-accent, #F26522)' }}
                              aria-hidden
                            />
                          ) : (
                            <EyeOff
                              className="h-3 w-3"
                              style={{ color: 'var(--wp-text-faint)' }}
                              aria-hidden
                            />
                          )}
                          <span
                            className="text-[11px]"
                            style={{ color: 'var(--wp-text)' }}
                          >
                            {SECTION_LOOKUP[s.key].label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
                    border:
                      '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 26%, transparent)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    Filename
                  </h4>
                  <div
                    className="break-all font-mono text-[11px] font-semibold"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                  >
                    {builder.pdf.filename}
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="xlsx-inspector"
                initial={reducedMotion ? false : { opacity: 0, x: 6 }}
                animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, x: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Workbook properties
                  </h4>
                  <InspectorRow
                    label="Sheets"
                    value={String(SHEET_ORDER.length)}
                    emphasis
                  />
                  <InspectorRow label="Total rows" value={String(xlsxTotals.rows)} />
                  <InspectorRow label="Total cells" value={String(xlsxTotals.cells)} />
                  <InspectorRow label="Est. size" value={xlsxApproxSize} />
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Sheets
                  </h4>
                  <ul className="space-y-1">
                    {SHEET_ORDER.map((id) => {
                      const SheetIcon = SHEET_META[id].Icon;
                      const isActive = id === activeSheet;
                      const sheet = builder.xlsx.sheets[id];
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => setActiveSheet(id)}
                            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors"
                            style={{
                              background: isActive
                                ? 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)'
                                : 'transparent',
                              border: isActive
                                ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)'
                                : '1px solid transparent',
                            }}
                          >
                            <SheetIcon
                              className="h-3 w-3"
                              style={{
                                color: isActive
                                  ? 'var(--wp-accent, #F26522)'
                                  : 'var(--wp-text-dim)',
                              }}
                              aria-hidden
                            />
                            <span
                              className="flex-1 text-[11px] font-medium"
                              style={{
                                color: isActive
                                  ? 'var(--wp-accent, #F26522)'
                                  : 'var(--wp-text)',
                              }}
                            >
                              {id}
                            </span>
                            <span
                              className="font-mono text-[10px]"
                              style={{ color: 'var(--wp-text-faint)' }}
                            >
                              {sheet.rows.length} rows
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                    border: '1px solid var(--wp-border)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-faint)' }}
                  >
                    Last generated
                  </h4>
                  <div
                    className="font-mono text-[11px]"
                    style={{ color: 'var(--wp-text)' }}
                  >
                    {formatDateTime(builder.xlsx.generatedAt)}
                  </div>
                </section>

                <section
                  className="rounded-md p-2.5"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
                    border:
                      '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 26%, transparent)',
                  }}
                >
                  <h4
                    className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    Filename
                  </h4>
                  <div
                    className="break-all font-mono text-[11px] font-semibold"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                  >
                    {builder.xlsx.filename}
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </motion.div>
  );
}

export default AgRptM1Studio;
