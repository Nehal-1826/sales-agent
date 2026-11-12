import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Box,
  Building2,
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Crown,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Folder,
  FolderOpen,
  Hash,
  LayoutGrid,
  Loader2,
  MailCheck,
  Palette,
  Percent,
  PieChart,
  Play,
  Settings2,
  Sparkles,
  Sliders,
  Target,
  Terminal,
  Type as TypeIcon,
  Users,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';

/**
 * AgRptM3Console — Agency-tier REPORTS surface, design candidate M3,
 * "Developer Console".
 *
 * The Reports surface re-imagined as a CODE-EDITOR / DevTools-style
 * three-pane workbench. Left rail is a VS-Code-style file-explorer tree
 * for the report config (Document / Sections / Styling / Recipients).
 * Center is the live-rendered output canvas which switches between PDF
 * preview and a polished DataGrid-style XLSX preview. Right rail is a
 * Chrome-DevTools-style inspector that shows the report structure
 * (PDF mode) or the workbook sheet structure (XLSX mode) as a tree.
 *
 *   - The TOP TOOLBAR is full-width and sticky. Left: a VS-Code file
 *     tab labelled "{type}-report.config.json" with an unsaved-dirty
 *     dot when the inspector state deviates from the initial template.
 *     Center: four type pills (Warmth / Engagement / Placement /
 *     White-label) styled as command-palette buttons. Right: a preview
 *     mode toggle `[ PDF ] [ XLSX ]` with a sliding orange underline
 *     driven by `layoutId="m3-mode-slider"`, plus Run Export → Download
 *     PDF (Play icon) and Download XLSX buttons. Both wire to REAL
 *     `jsPDF` + `jspdf-autotable` + `xlsx` calls.
 *
 *   - The LEFT RAIL is 280px wide and renders as a CONFIG TREEVIEW:
 *     four collapsible folders (Document, Sections, Styling, Recipients).
 *     Items use monospace 12px font, chevron expand/collapse, hover
 *     highlight. Document folder exposes title + dateRange. Sections
 *     folder is a list of toggleable `.section` files. Styling folder
 *     surfaces accent + branding. Recipients folder lists the
 *     sub-clients. A bottom status strip reads
 *     "Status: Ready · 0 errors · Last build {n}s ago".
 *
 *   - The CENTER PREVIEW CANVAS holds an inline tab row "PDF.preview /
 *     XLSX.preview" — clicking switches mode. PDF mode renders the
 *     paper canvas with the EXACT downloaded artifact. XLSX mode
 *     renders a polished DataGrid-style spreadsheet: VS-Code sheet
 *     tabs at the top with orange-bottom-border on the active tab,
 *     formula bar `fx | A1: …` showing the click-selected cell value,
 *     thin orange column letter strip A/B/C…, bold column-name row
 *     with type chips (text / num / int / %), generous 44px rows,
 *     subtle 1px grey gridlines, slim row-number gutter, semantic-pill
 *     status cells, semantic delta cells with up/down chevrons,
 *     hover-row highlight, orange ring on the selected cell, and a
 *     footer bar reading "Rows: N · Cols: C · Sheet: {name} · Size: ~Kb".
 *
 *   - The RIGHT INSPECTOR is 280px wide and renders as a DevTools-style
 *     Elements / Workbook treeview. PDF mode lists the report sections
 *     as a tree of <SectionGroup> nodes with their child <Block> rows.
 *     XLSX mode lists the workbook → 3 sheets → their row counts and
 *     column kinds as a tree, so the user can audit what's in the file.
 *
 * The aesthetic is professional developer-tool: dark editor chrome,
 * monospace numbers everywhere, bright orange highlights for active
 * tabs / selected cells / hot accents. The exact-match guarantee is
 * the same shared-builder pattern as M1/M2 — `buildPdfPlan` and
 * `buildXlsxWorkbook` are SINGLE SOURCES OF TRUTH consumed by both
 * the on-screen preview AND the real export handlers.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists. M1 is the source-of-truth file for the
 * `AgencyReportsData` shape; if M1 is not yet on disk, this file
 * carries its own inline fallback type definition + matching MOCK so
 * the design-preview harness mounts it standalone.
 *
 * NOT a split-view editor canvas (M1), NOT a paged workspace (M2),
 * NOT a galley card grid (M4). The code-editor / DevTools identity
 * — file-tree config + DataGrid spreadsheet + inspector treeview —
 * is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — inline fallback definition. M1 is the
// canonical source-of-truth; if M1 is not yet on disk, this file defines the
// same shape locally so the design preview mounts standalone. When M1 lands,
// the two declarations are byte-compatible.
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
// Mock data — same shape as M1 / N1. Northwind Agency, six sub-clients, four
// fully-populated metric bundles.
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
// Type metadata — labels, icons, descriptions. Single source for every
// surface (toolbar pills, file tab title, inspector items, export filenames).
// ---------------------------------------------------------------------------

interface TypeMeta {
  id: ReportType;
  label: string;
  short: string;
  Icon: typeof Flame;
  slug: string;
  description: string;
}

const TYPE_META: TypeMeta[] = [
  {
    id: 'warmth',
    label: 'Warmth Trajectory',
    short: 'Warmth',
    Icon: Flame,
    slug: 'warmth',
    description: 'Reputation curve, ramp completion, peer signal lift.',
  },
  {
    id: 'engagement',
    label: 'Engagement Lift',
    short: 'Engagement',
    Icon: MailCheck,
    slug: 'engagement',
    description: 'Opens, replies, stars and spam-rescues per sub-client.',
  },
  {
    id: 'placement',
    label: 'Inbox Placement',
    short: 'Placement',
    Icon: Target,
    slug: 'placement',
    description: 'Gmail / Outlook / Yahoo inbox-vs-spam ratios.',
  },
  {
    id: 'white_label',
    label: 'White-label Digest',
    short: 'White-label',
    Icon: Crown,
    slug: 'white-label',
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

// ---------------------------------------------------------------------------
// Date range presets + accent swatch palette + branding modes + section meta.
// ---------------------------------------------------------------------------

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
  fileLabel: string;
  hint: string;
  Icon: typeof LayoutGrid;
}

const SECTION_META: SectionMeta[] = [
  {
    key: 'cover',
    label: 'Cover page',
    fileLabel: 'cover.section',
    hint: 'Branded title band with date range.',
    Icon: FileCode2,
  },
  {
    key: 'executive',
    label: 'Executive summary',
    fileLabel: 'summary.section',
    hint: '1-paragraph pull-quote intro.',
    Icon: FileText,
  },
  {
    key: 'kpiTable',
    label: 'KPI table',
    fileLabel: 'kpi.section',
    hint: 'Per-sub-client metric + delta + status.',
    Icon: LayoutGrid,
  },
  {
    key: 'breakdown',
    label: 'Per sub-client breakdown',
    fileLabel: 'breakdown.section',
    hint: 'Compact cards with status colour.',
    Icon: Building2,
  },
  {
    key: 'trends',
    label: 'Trends chart',
    fileLabel: 'trends.section',
    hint: 'Inline SVG bar chart from rows.',
    Icon: PieChart,
  },
  {
    key: 'footer',
    label: 'Footer with branding',
    fileLabel: 'footer.section',
    hint: 'Page number + brand mark.',
    Icon: TypeIcon,
  },
];

type PreviewMode = 'pdf' | 'xlsx';
type SheetName = 'Summary' | 'Detail' | 'Template';
const SHEET_NAMES: SheetName[] = ['Summary', 'Detail', 'Template'];

// ---------------------------------------------------------------------------
// Initial / default inspector state — used both as `useState` seed AND as
// the reference for the unsaved-dirty dot on the config-file tab.
// ---------------------------------------------------------------------------

interface InspectorState {
  type: ReportType;
  title: string;
  range: DateRangeId;
  sections: Record<SectionKey, boolean>;
  accentIndex: number;
  branding: BrandingMode;
}

function buildInitialState(typeId: ReportType, agencyName: string): InspectorState {
  return {
    type: typeId,
    title: `${agencyName} · ${TYPE_LOOKUP[typeId].label}`,
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
  };
}

function isStateEqual(a: InspectorState, b: InspectorState): boolean {
  if (a.type !== b.type) return false;
  if (a.title !== b.title) return false;
  if (a.range !== b.range) return false;
  if (a.accentIndex !== b.accentIndex) return false;
  if (a.branding !== b.branding) return false;
  for (const meta of SECTION_META) {
    if (a.sections[meta.key] !== b.sections[meta.key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Status colour helper — same orange/warning family as M1/M2.
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
// Shared PDF plan — SINGLE SOURCE OF TRUTH. Both the on-screen `PaperPreview`
// and the real `handlePdf` consume this descriptor so the user sees byte-for-
// byte what the download will contain.
// ---------------------------------------------------------------------------

type PdfBlockKind =
  | 'cover'
  | 'title-only'
  | 'executive'
  | 'kpiTable'
  | 'breakdown'
  | 'trends'
  | 'footer';

interface PdfBlock {
  kind: PdfBlockKind;
  key: string;
  label: string;
}

interface PdfPlan {
  type: ReportType;
  typeMeta: TypeMeta;
  agencyName: string;
  agencyRegion: string;
  title: string;
  rangeLabel: string;
  isWhiteLabel: boolean;
  accent: AccentSwatch;
  blocks: PdfBlock[];
  metric: AgencyReportsData['metrics'][ReportType];
  totalMailboxes: number;
  subClientCount: number;
}

function buildPdfPlan(
  state: InspectorState,
  data: AgencyReportsData,
  rangeLabel: string,
  accent: AccentSwatch,
): PdfPlan {
  const typeMeta = TYPE_LOOKUP[state.type];
  const metric = data.metrics[state.type];
  const isWhiteLabel = state.branding === 'whitelabel';
  const blocks: PdfBlock[] = [];
  if (state.sections.cover) {
    blocks.push({ kind: 'cover', key: 'cover', label: 'Cover band' });
  } else {
    blocks.push({ kind: 'title-only', key: 'title-only', label: 'Plain title' });
  }
  if (state.sections.executive) {
    blocks.push({ kind: 'executive', key: 'executive', label: 'Executive summary' });
  }
  if (state.sections.kpiTable) {
    blocks.push({ kind: 'kpiTable', key: 'kpiTable', label: 'KPI table' });
  }
  if (state.sections.breakdown) {
    blocks.push({ kind: 'breakdown', key: 'breakdown', label: 'Per sub-client breakdown' });
  }
  if (state.sections.trends) {
    blocks.push({ kind: 'trends', key: 'trends', label: 'Trends chart' });
  }
  if (state.sections.footer) {
    blocks.push({ kind: 'footer', key: 'footer', label: 'Footer with branding' });
  }
  const totalMailboxes = data.subClients.reduce((s, c) => s + c.mailboxCount, 0);
  return {
    type: state.type,
    typeMeta,
    agencyName: data.agency.name,
    agencyRegion: data.agency.region,
    title: state.title,
    rangeLabel,
    isWhiteLabel,
    accent,
    blocks,
    metric,
    totalMailboxes,
    subClientCount: data.subClients.length,
  };
}

// ---------------------------------------------------------------------------
// Shared XLSX workbook plan — SINGLE SOURCE OF TRUTH. Both the on-screen
// `SpreadsheetCanvas` and the real `handleXlsx` consume this. Each sheet
// carries explicit column kinds so the DataGrid header chips match the
// types we'd want a downstream tool to infer.
// ---------------------------------------------------------------------------

type CellKind = 'text' | 'num' | 'int' | 'pct' | 'delta' | 'status';

interface ColumnSpec {
  letter: string;
  name: string;
  kind: CellKind;
  width: number;
}

type SheetCellValue = string | number;

interface SheetSpec {
  name: SheetName;
  columns: ColumnSpec[];
  // headerRow length === columns.length, but is kept separately so we can
  // render it with chip-styled type indicators above the body rows.
  headerRow: string[];
  bodyRows: SheetCellValue[][];
  description: string;
}

interface XlsxWorkbook {
  sheets: SheetSpec[];
  // Mirror of the raw AOA shape we feed `XLSX.utils.aoa_to_sheet`, kept in
  // lock-step with `sheets[i].bodyRows` so the on-screen grid and the
  // downloaded file render identical content.
  rawSheets: Record<SheetName, SheetCellValue[][]>;
}

function buildXlsxWorkbook(
  state: InspectorState,
  data: AgencyReportsData,
  rangeLabel: string,
  accent: AccentSwatch,
): XlsxWorkbook {
  const typeMeta = TYPE_LOOKUP[state.type];
  const metric = data.metrics[state.type];

  // Summary sheet — config + summary stats, 2 columns.
  const summaryColumns: ColumnSpec[] = [
    { letter: 'A', name: 'field', kind: 'text', width: 200 },
    { letter: 'B', name: 'value', kind: 'text', width: 300 },
  ];
  const summaryHeader = ['field', 'value'];
  const summaryBody: SheetCellValue[][] = [
    ['Agency', data.agency.name],
    ['Region', data.agency.region],
    ['Report type', typeMeta.label],
    ['Range', rangeLabel],
    ['Branding', state.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand'],
    ['Title', state.title],
    ['Accent', `${accent.name} ${accent.hex}`],
    ['Generated', new Date().toISOString()],
    ['Total', metric.summary.total],
    ['Average', metric.summary.avg],
    ['High', metric.summary.high],
    ['Low', metric.summary.low],
  ];

  // Detail sheet — per-sub-client rows, 6 columns.
  const detailColumns: ColumnSpec[] = [
    { letter: 'A', name: 'sub_client', kind: 'text', width: 180 },
    { letter: 'B', name: 'domain', kind: 'text', width: 180 },
    { letter: 'C', name: 'mailboxes', kind: 'int', width: 110 },
    { letter: 'D', name: 'value', kind: 'num', width: 110 },
    { letter: 'E', name: 'delta', kind: 'delta', width: 110 },
    { letter: 'F', name: 'status', kind: 'status', width: 130 },
  ];
  const detailHeader = ['sub_client', 'domain', 'mailboxes', 'value', 'delta', 'status'];
  const detailBody: SheetCellValue[][] = metric.rows.map((r) => {
    const sc = data.subClients.find((c) => c.name === r.subClient);
    return [
      r.subClient,
      r.domain,
      sc?.mailboxCount ?? 0,
      r.value,
      r.delta,
      statusStyle(r.status).label,
    ];
  });

  // Template sheet — config snapshot, 2 columns.
  const templateColumns: ColumnSpec[] = [
    { letter: 'A', name: 'key', kind: 'text', width: 220 },
    { letter: 'B', name: 'value', kind: 'text', width: 220 },
  ];
  const templateHeader = ['key', 'value'];
  const templateBody: SheetCellValue[][] = [
    ...SECTION_META.map<SheetCellValue[]>((s) => [s.label, state.sections[s.key] ? 'yes' : 'no']),
    ['accent_hex', accent.hex],
    ['accent_name', accent.name],
    ['accent_rgb', accent.rgb.join(',')],
    ['branding', state.branding === 'whitelabel' ? 'whitelabel' : 'cobrand'],
    ['range', state.range],
  ];

  return {
    sheets: [
      {
        name: 'Summary',
        columns: summaryColumns,
        headerRow: summaryHeader,
        bodyRows: summaryBody,
        description: 'Top-level config + summary stats',
      },
      {
        name: 'Detail',
        columns: detailColumns,
        headerRow: detailHeader,
        bodyRows: detailBody,
        description: 'Per-sub-client rows with status',
      },
      {
        name: 'Template',
        columns: templateColumns,
        headerRow: templateHeader,
        bodyRows: templateBody,
        description: 'Section toggles + styling snapshot',
      },
    ],
    rawSheets: {
      Summary: [summaryHeader, ...summaryBody],
      Detail: [detailHeader, ...detailBody],
      Template: [templateHeader, ...templateBody],
    },
  };
}

function getSheetSpec(workbook: XlsxWorkbook, name: SheetName): SheetSpec {
  const found = workbook.sheets.find((s) => s.name === name);
  // The workbook always carries all three sheets; this guard is purely a
  // TypeScript safety net for `noUncheckedIndexedAccess`.
  if (!found) {
    return {
      name,
      columns: [],
      headerRow: [],
      bodyRows: [],
      description: '',
    };
  }
  return found;
}

// ---------------------------------------------------------------------------
// Helpers — filename, byte-size estimate, column letter helpers.
// ---------------------------------------------------------------------------

function buildExportFilename(
  agencyName: string,
  typeId: ReportType,
  ext: 'pdf' | 'xlsx',
): string {
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${typeId}-${date}.${ext}`;
}

function estimateSheetSize(rows: SheetCellValue[][]): string {
  // Rough estimate — used purely for the footer status bar so the user
  // sees a "Size: ~Xkb" indicator. Counts approximate bytes per cell.
  let total = 0;
  for (const row of rows) {
    for (const cell of row) {
      total += typeof cell === 'number' ? 6 : String(cell).length + 2;
    }
    total += 8;
  }
  if (total < 1024) return `${total}b`;
  return `${(total / 1024).toFixed(1)}kb`;
}

// Convert a 0-indexed column number to spreadsheet letter form (A, B, …, Z,
// AA, AB, …). Used by the spreadsheet header strip.
function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (true) {
    s = String.fromCharCode(65 + (x % 26)) + s;
    if (x < 26) break;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Animation primitives.
// ---------------------------------------------------------------------------

const PAGE_VARIANTS = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.18, ease: 'easeIn' as const } },
};

// ---------------------------------------------------------------------------
// Treeview chevron — re-used by file tree (left rail) and the inspector
// elements panel (right rail). Rotates 90deg when open.
// ---------------------------------------------------------------------------

interface TreeChevronProps {
  open: boolean;
  reducedMotion: boolean;
}

function TreeChevron({ open, reducedMotion }: TreeChevronProps): JSX.Element {
  return (
    <motion.span
      animate={reducedMotion ? undefined : { rotate: open ? 90 : 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      <ChevronRight className="h-3 w-3" aria-hidden />
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// File tree row — used by the left rail for both folder rows and leaf rows.
// Monospace font + hover highlight.
// ---------------------------------------------------------------------------

interface TreeRowProps {
  depth: number;
  Icon?: typeof Folder;
  iconColor?: string;
  label: string;
  trailing?: ReactNode;
  active?: boolean;
  dim?: boolean;
  monospace?: boolean;
  onClick?: () => void;
  chevron?: ReactNode;
  ariaLabel?: string;
}

function TreeRow({
  depth,
  Icon,
  iconColor,
  label,
  trailing,
  active = false,
  dim = false,
  monospace = true,
  onClick,
  chevron,
  ariaLabel,
}: TreeRowProps): JSX.Element {
  const baseColor = active
    ? 'var(--wp-accent, #F26522)'
    : dim
      ? 'var(--wp-text-faint)'
      : 'var(--wp-text-dim)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className="group relative flex w-full items-center gap-1.5 px-2 py-[5px] text-left text-[12px] leading-tight transition-colors"
      style={{
        paddingLeft: 8 + depth * 14,
        background: active
          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)'
          : 'transparent',
        borderLeft: active
          ? '2px solid var(--wp-accent, #F26522)'
          : '2px solid transparent',
        color: baseColor,
        fontFamily: monospace
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : 'inherit',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span
        className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: 'color-mix(in srgb, var(--wp-accent, #F26522) 7%, transparent)',
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      {chevron ? (
        <span className="relative inline-flex w-3 items-center justify-center">{chevron}</span>
      ) : (
        <span className="relative inline-block w-3" aria-hidden />
      )}
      {Icon ? (
        <Icon
          className="relative h-3.5 w-3.5 flex-shrink-0"
          style={{ color: iconColor ?? baseColor }}
          aria-hidden
        />
      ) : null}
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {trailing ? <span className="relative flex-shrink-0">{trailing}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// File tab — VS-Code-style tab with optional dirty dot, optional close icon.
// ---------------------------------------------------------------------------

interface FileTabProps {
  Icon: typeof FileJson;
  iconColor?: string;
  label: string;
  dirty?: boolean;
  active?: boolean;
}

function FileTab({ Icon, iconColor, label, dirty = false, active = false }: FileTabProps): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-t-md px-3 py-2 text-[12px]"
      style={{
        background: active
          ? 'color-mix(in srgb, var(--wp-surface) 90%, transparent)'
          : 'color-mix(in srgb, var(--wp-surface) 55%, transparent)',
        color: active ? 'var(--wp-text)' : 'var(--wp-text-dim)',
        borderTop: active
          ? '2px solid var(--wp-accent, #F26522)'
          : '2px solid transparent',
        borderRight: '1px solid var(--wp-border)',
        borderLeft: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: active ? 600 : 500,
      }}
    >
      <Icon
        className="h-3.5 w-3.5 flex-shrink-0"
        style={{ color: iconColor ?? 'var(--wp-accent, #F26522)' }}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      <span
        className="ml-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{
          background: dirty ? 'var(--wp-accent, #F26522)' : 'transparent',
          border: dirty
            ? '1px solid var(--wp-accent, #F26522)'
            : '1px solid color-mix(in srgb, var(--wp-text-faint) 40%, transparent)',
          boxShadow: dirty
            ? '0 0 6px color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
            : 'none',
        }}
        aria-hidden
        title={dirty ? 'Unsaved changes' : 'No changes'}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type-pill — command-palette button style. Active gets sliding orange
// underline. Uses the same `layoutId` namespace as M1 ('pill-bg') is avoided
// to prevent collision with sibling designs that mount alongside.
// ---------------------------------------------------------------------------

interface TypePillsProps {
  active: ReportType;
  onSelect: (id: ReportType) => void;
  reducedMotion: boolean;
}

function TypePills({ active, onSelect, reducedMotion }: TypePillsProps): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 85%, transparent)',
        border: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px]"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              fontWeight: isActive ? 700 : 500,
              zIndex: 1,
            }}
          >
            {isActive && (
              <motion.span
                layoutId="m3-type-pill"
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
            <Icon className="h-3 w-3" aria-hidden />
            <span>{meta.short}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode toggle — sliding orange underline driven by `layoutId="m3-mode-slider"`.
// ---------------------------------------------------------------------------

interface PreviewModeToggleProps {
  mode: PreviewMode;
  onChange: (m: PreviewMode) => void;
  reducedMotion: boolean;
}

function PreviewModeToggle({
  mode,
  onChange,
  reducedMotion,
}: PreviewModeToggleProps): JSX.Element {
  const options: Array<{ id: PreviewMode; label: string; Icon: typeof FileText }> = [
    { id: 'pdf', label: 'PDF', Icon: FileText },
    { id: 'xlsx', label: 'XLSX', Icon: FileSpreadsheet },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
        border: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px]"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              fontWeight: isActive ? 700 : 500,
              zIndex: 1,
            }}
            aria-pressed={isActive}
            aria-label={`${opt.label} preview`}
          >
            {isActive && (
              <motion.span
                layoutId="m3-mode-slider"
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
            <Icon className="h-3 w-3" aria-hidden />
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export buttons — Play-icon Download PDF (primary) + outlined Download XLSX.
// ---------------------------------------------------------------------------

interface ExportButtonProps {
  variant: 'primary' | 'outline';
  label: string;
  Icon: typeof Play;
  TrailIcon?: typeof Download;
  busy: boolean;
  onClick: () => void;
  reducedMotion: boolean;
}

function ExportButton({
  variant,
  label,
  Icon,
  TrailIcon,
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
          border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 65%, transparent)',
          boxShadow: '0 8px 22px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
        }
      : {
          background: 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
          color: 'var(--wp-accent, #F26522)',
          border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 45%, transparent)',
        };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileHover={reducedMotion || busy ? undefined : { y: -1 }}
      whileTap={reducedMotion || busy ? undefined : { scale: 0.97 }}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        ...baseStyle,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden />
      )}
      <span>{label}</span>
      {TrailIcon && !busy ? <TrailIcon className="h-3 w-3" aria-hidden /> : null}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Trends chart — inline SVG bar chart, identical visual to M1/M2.
// ---------------------------------------------------------------------------

interface TrendsChartProps {
  rows: AgencyReportsData['metrics'][ReportType]['rows'];
  accentHex: string;
}

function TrendsChart({ rows, accentHex }: TrendsChartProps): JSX.Element {
  const width = 620;
  const height = 180;
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
        const fillBase =
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
              fill={fillBase}
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
// Paper preview — WYSIWYG of the downloaded PDF. Renders each block in the
// PdfPlan in order, so reordering / toggling sections updates instantly.
// ---------------------------------------------------------------------------

interface PaperPreviewProps {
  plan: PdfPlan;
}

function PaperPreview({ plan }: PaperPreviewProps): JSX.Element {
  const accentHex = plan.accent.hex;
  const TypeIcon = plan.typeMeta.Icon;
  return (
    <div className="flex flex-col gap-5 px-12 py-10">
      {plan.blocks.map((block) => {
        if (block.kind === 'cover') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
              className="overflow-hidden rounded-lg"
              style={{ border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <div
                className="px-7 py-5 text-white"
                style={{
                  background: `linear-gradient(135deg, ${accentHex}, ${accentHex}cc)`,
                }}
              >
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] opacity-90">
                  <span>
                    {plan.isWhiteLabel
                      ? plan.agencyName
                      : `${plan.agencyName} · WarmPulse`}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" aria-hidden />
                    {plan.rangeLabel}
                  </span>
                </div>
                <h1
                  className="mt-3 text-[28px] font-bold leading-tight"
                  style={{ fontFamily: "'Georgia', serif", letterSpacing: '-0.01em' }}
                >
                  {plan.title}
                </h1>
                <div className="mt-2 flex items-center gap-2 text-[12.5px] opacity-90">
                  <TypeIcon className="h-4 w-4" aria-hidden />
                  <span>{plan.typeMeta.label}</span>
                  <span aria-hidden>·</span>
                  <span>{plan.subClientCount} sub-clients</span>
                  <span aria-hidden>·</span>
                  <span>{plan.totalMailboxes} mailboxes</span>
                </div>
              </div>
              <div
                className="h-2"
                style={{
                  background: `linear-gradient(90deg, ${accentHex}, transparent)`,
                }}
              />
            </motion.section>
          );
        }
        if (block.kind === 'title-only') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <h1
                className="text-[26px] font-bold leading-tight"
                style={{
                  fontFamily: "'Georgia', serif",
                  letterSpacing: '-0.01em',
                  color: '#231914',
                }}
              >
                {plan.title}
              </h1>
              <div
                className="mt-1 text-[11px] uppercase tracking-[0.18em]"
                style={{ color: '#6a5448' }}
              >
                {plan.typeMeta.label} · {plan.rangeLabel}
              </div>
            </motion.section>
          );
        }
        if (block.kind === 'executive') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <h2
                className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
                style={{ color: accentHex, fontFamily: "'Georgia', serif" }}
              >
                Executive summary
              </h2>
              <p
                className="text-[13.5px] leading-relaxed"
                style={{ color: '#231914' }}
              >
                {plan.metric.pullQuote}
              </p>
              <div
                className="mt-3 grid grid-cols-4 gap-2"
                style={{ color: '#1f1410' }}
              >
                {[
                  { k: 'Total', v: plan.metric.summary.total },
                  { k: 'Average', v: plan.metric.summary.avg },
                  { k: 'High', v: plan.metric.summary.high },
                  { k: 'Low', v: plan.metric.summary.low },
                ].map((s) => (
                  <div
                    key={s.k}
                    className="rounded-md px-3 py-2"
                    style={{
                      border: `1px solid ${accentHex}30`,
                      background: `${accentHex}0d`,
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
                      style={{ fontFamily: "'Georgia', serif", color: accentHex }}
                    >
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          );
        }
        if (block.kind === 'kpiTable') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <h2
                className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
                style={{ color: accentHex, fontFamily: "'Georgia', serif" }}
              >
                KPI table
              </h2>
              <table
                className="w-full border-collapse text-[12px]"
                style={{ color: '#1f1410' }}
              >
                <thead>
                  <tr style={{ background: accentHex, color: '#fff' }}>
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
                  {plan.metric.rows.map((row, i) => {
                    const s = statusStyle(row.status);
                    return (
                      <tr
                        key={row.subClient}
                        style={{
                          background: i % 2 === 0 ? '#fff' : `${accentHex}07`,
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
            </motion.section>
          );
        }
        if (block.kind === 'breakdown') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <h2
                className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
                style={{ color: accentHex, fontFamily: "'Georgia', serif" }}
              >
                Per sub-client breakdown
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {plan.metric.rows.map((row) => {
                  const s = statusStyle(row.status);
                  return (
                    <div
                      key={row.subClient}
                      className="rounded-md p-3"
                      style={{
                        background: '#fff',
                        border: `1px solid ${s.border}`,
                      }}
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
                          style={{ fontFamily: "'Georgia', serif", color: accentHex }}
                        >
                          {row.value}
                        </span>
                        <span
                          className="font-mono text-[11px]"
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
            </motion.section>
          );
        }
        if (block.kind === 'trends') {
          return (
            <motion.section
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <h2
                className="mb-2 text-[15px] font-bold uppercase tracking-[0.16em]"
                style={{ color: accentHex, fontFamily: "'Georgia', serif" }}
              >
                Trends — per sub-client
              </h2>
              <div
                className="rounded-md px-2 py-3"
                style={{
                  background: '#fff',
                  border: `1px solid ${accentHex}24`,
                }}
              >
                <TrendsChart rows={plan.metric.rows} accentHex={accentHex} />
              </div>
            </motion.section>
          );
        }
        if (block.kind === 'footer') {
          return (
            <motion.footer
              key={block.key}
              variants={SECTION_VARIANTS}
              initial="hidden"
              animate="show"
              exit="exit"
              className="mt-2 flex items-center justify-between border-t pt-3 text-[10.5px]"
              style={{ borderColor: 'rgba(0,0,0,0.08)', color: '#6a5448' }}
            >
              <span>
                {plan.isWhiteLabel
                  ? `${plan.agencyName} · Confidential`
                  : `${plan.agencyName} · Powered by WarmPulse`}
              </span>
              <span>Page 1 of 1</span>
            </motion.footer>
          );
        }
        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Polished DataGrid-style spreadsheet preview.
// ---------------------------------------------------------------------------

interface SpreadsheetCanvasProps {
  workbook: XlsxWorkbook;
  activeSheet: SheetName;
  selectedCell: { row: number; col: number };
  onSelectCell: (row: number, col: number) => void;
  reducedMotion: boolean;
}

// Type-kind chip — colour-coded by data kind. Drawn in the column-name row
// next to the column name so the user can audit what kind of data lives in
// each column at a glance.
function TypeChip({ kind }: { kind: CellKind }): JSX.Element {
  const palette: Record<CellKind, { label: string; color: string; bg: string; Icon: typeof Hash }> = {
    text: {
      label: 'text',
      color: 'var(--wp-text-dim)',
      bg: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
      Icon: TypeIcon,
    },
    num: {
      label: 'num',
      color: 'var(--wp-accent, #F26522)',
      bg: 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
      Icon: Hash,
    },
    int: {
      label: 'int',
      color: 'var(--wp-accent, #F26522)',
      bg: 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
      Icon: Hash,
    },
    pct: {
      label: '%',
      color: 'var(--wp-accent, #F26522)',
      bg: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
      Icon: Percent,
    },
    delta: {
      label: 'Δ',
      color: 'var(--wp-warning, #ffb454)',
      bg: 'color-mix(in srgb, var(--wp-warning, #ffb454) 14%, transparent)',
      Icon: Activity,
    },
    status: {
      label: 'enum',
      color: 'var(--wp-success, #4ade80)',
      bg: 'color-mix(in srgb, var(--wp-success, #4ade80) 14%, transparent)',
      Icon: CircleDot,
    },
  };
  const p = palette[kind];
  const ChipIcon = p.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[9.5px] font-semibold"
      style={{
        color: p.color,
        background: p.bg,
        border: `1px solid color-mix(in srgb, ${p.color} 28%, transparent)`,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        textTransform: 'lowercase',
        letterSpacing: '0.02em',
      }}
    >
      <ChipIcon className="h-2.5 w-2.5" aria-hidden />
      <span>{p.label}</span>
    </span>
  );
}

// Format a body cell value by column kind. Returns a JSX node (chips for
// status/delta, plain string otherwise).
function formatBodyCell(value: SheetCellValue | undefined, kind: CellKind): ReactNode {
  if (value === undefined) return null;
  if (kind === 'delta' && typeof value === 'number') {
    const positive = value >= 0;
    return (
      <span
        className="inline-flex items-center gap-1"
        style={{
          color: positive
            ? 'var(--wp-success, #4ade80)'
            : 'var(--wp-danger, #ff6b6b)',
        }}
      >
        <ChevronDown
          className="h-3 w-3"
          style={{
            transform: positive ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          aria-hidden
        />
        <span>{positive ? `+${value}` : value}</span>
      </span>
    );
  }
  if (kind === 'status') {
    const lookup: Record<string, 'good' | 'warn' | 'risk'> = {
      Healthy: 'good',
      Watch: 'warn',
      'At risk': 'risk',
    };
    const key = String(value);
    const tag = lookup[key];
    if (tag) {
      const s = statusStyle(tag);
      return (
        <span
          className="inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-semibold"
          style={{
            color: s.text,
            background: s.bg,
            border: `1px solid ${s.border}`,
          }}
        >
          {s.label}
        </span>
      );
    }
    return String(value);
  }
  return String(value);
}

function alignFor(kind: CellKind): 'left' | 'right' {
  if (kind === 'text' || kind === 'status') return 'left';
  return 'right';
}

const COL_GUTTER_WIDTH = 44;

function SpreadsheetCanvas({
  workbook,
  activeSheet,
  selectedCell,
  onSelectCell,
  reducedMotion,
}: SpreadsheetCanvasProps): JSX.Element {
  const sheet = getSheetSpec(workbook, activeSheet);
  const columns = sheet.columns;
  const bodyRows = sheet.bodyRows;
  // We render the header column-name row as logical row 0, body rows as 1+.
  const totalRows = bodyRows.length + 1;

  // Padded rows so the grid always feels generous — display empty rows below
  // the data so the user reads the surface as a spreadsheet, not a list.
  const minDisplayedRows = 14;
  const displayedRowCount = Math.max(totalRows, minDisplayedRows);

  // Selected cell value for the formula bar.
  const selectedValue: SheetCellValue | undefined = (() => {
    if (selectedCell.row === 0) {
      return columns[selectedCell.col]?.name;
    }
    const bodyIdx = selectedCell.row - 1;
    const row = bodyRows[bodyIdx];
    if (!row) return undefined;
    return row[selectedCell.col];
  })();

  const selectedRef = `${colLetter(selectedCell.col)}${selectedCell.row + 1}`;
  const sheetSize = estimateSheetSize(workbook.rawSheets[activeSheet]);

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: 'var(--wp-surface, #1c1410)',
        color: 'var(--wp-text, #f4eee9)',
      }}
    >
      {/* DataGrid Toolbar — sheet tabs + cell coord + row count + filter */}
      <div
        className="flex items-center gap-2 border-b px-2 py-1.5"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 70%, transparent)',
        }}
      >
        {/* The DataGrid sheet tabs are owned by the parent now, so this
            bar carries cell coords + row count + filter only. */}
        <div className="flex flex-1 items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold"
            style={{
              color: 'var(--wp-accent, #F26522)',
              background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
            aria-label="Selected cell"
          >
            <Sliders className="h-3 w-3" aria-hidden />
            <span>{selectedRef} selected</span>
          </span>
          <span
            className="text-[10.5px]"
            style={{
              color: 'var(--wp-text-dim)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            rows: {bodyRows.length}
          </span>
          <span
            className="text-[10.5px]"
            style={{
              color: 'var(--wp-text-faint)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            cols: {columns.length}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px]"
          style={{
            color: 'var(--wp-text-dim)',
            background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
            border: '1px solid var(--wp-border)',
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
          aria-label="Filter (visual only)"
        >
          <Filter className="h-3 w-3" aria-hidden />
          <span>filter</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px]"
          style={{
            color: 'var(--wp-text-dim)',
            background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
            border: '1px solid var(--wp-border)',
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
          aria-label="Sort (visual only)"
        >
          <ChevronDown className="h-3 w-3" aria-hidden />
          <span>sort</span>
        </button>
      </div>

      {/* Formula bar */}
      <div
        className="flex items-center gap-2 border-b px-3 py-1.5"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 50%, transparent)',
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[10.5px]"
          style={{
            color: 'var(--wp-accent, #F26522)',
            background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)',
            minWidth: 36,
          }}
        >
          {selectedRef}
        </span>
        <span
          aria-hidden
          className="text-[11px] italic"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          fx
        </span>
        <span
          className="truncate text-[11px]"
          style={{ color: 'var(--wp-text)' }}
        >
          {selectedValue === undefined ? '' : String(selectedValue)}
        </span>
      </div>

      {/* Column-letter strip (A / B / C ...) — thin orange strip */}
      <div
        className="flex items-center"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent), color-mix(in srgb, var(--wp-accent, #F26522) 4%, transparent))',
          borderBottom: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 25%, transparent)',
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: COL_GUTTER_WIDTH,
            padding: '4px 0',
            color: 'var(--wp-text-faint)',
            fontSize: 10,
            fontWeight: 600,
            borderRight: '1px solid var(--wp-border)',
          }}
          aria-hidden
        />
        {columns.map((col) => (
          <div
            key={`letter-${col.letter}`}
            className="flex items-center justify-center"
            style={{
              width: col.width,
              padding: '4px 0',
              color: 'var(--wp-accent, #F26522)',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.05em',
              borderRight: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)',
            }}
          >
            {col.letter}
          </div>
        ))}
      </div>

      {/* Column-name row with type chips — this is logical row 0 */}
      <div
        className="flex items-stretch"
        style={{
          background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 80%, transparent)',
          borderBottom: '1px solid var(--wp-border)',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: COL_GUTTER_WIDTH,
            padding: '8px 0',
            color: 'var(--wp-text-faint)',
            fontSize: 10,
            fontWeight: 600,
            borderRight: '1px solid var(--wp-border)',
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
          aria-hidden
        >
          #
        </div>
        {columns.map((col, ci) => {
          const isSelected = selectedCell.row === 0 && selectedCell.col === ci;
          return (
            <button
              key={`name-${col.letter}`}
              type="button"
              onClick={() => onSelectCell(0, ci)}
              className="group relative flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
              style={{
                width: col.width,
                color: 'var(--wp-text)',
                fontSize: 11.5,
                fontWeight: 700,
                borderRight: '1px solid var(--wp-border)',
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: isSelected
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)'
                  : 'transparent',
              }}
            >
              {isSelected ? (
                <motion.span
                  layoutId="m3-selected-cell"
                  className="pointer-events-none absolute inset-[2px] rounded"
                  style={{
                    border: '2px solid var(--wp-accent, #F26522)',
                    boxShadow:
                      '0 0 10px color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)',
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 460, damping: 32 }
                  }
                />
              ) : null}
              <span className="truncate">{col.name}</span>
              <TypeChip kind={col.kind} />
              {/* Subtle resize handle hint on hover */}
              <span
                className="absolute right-0 top-1/2 h-3 w-[2px] -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: 'var(--wp-accent, #F26522)' }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {/* Body rows — generous 44px row height, hover-row tint, semantic cells */}
      <div
        className="flex-1 overflow-auto"
        style={{
          background: 'color-mix(in srgb, var(--wp-surface) 75%, transparent)',
        }}
      >
        {Array.from({ length: displayedRowCount - 1 }).map((_, idx) => {
          const rowNum = idx + 1;
          const rowData = bodyRows[idx];
          return (
            <DataGridRow
              key={`row-${rowNum}`}
              rowNum={rowNum}
              rowData={rowData}
              columns={columns}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              reducedMotion={reducedMotion}
            />
          );
        })}
      </div>

      {/* Footer bar */}
      <div
        className="flex items-center justify-between border-t px-3 py-1.5 text-[10.5px]"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 70%, transparent)',
          color: 'var(--wp-text-dim)',
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <span>
          Rows: {bodyRows.length} · Cols: {columns.length} · Sheet: {activeSheet} · Size: ~{sheetSize}
        </span>
        <span style={{ color: 'var(--wp-text-faint)' }}>
          UTF-8 · LF · {sheet.description}
        </span>
      </div>
    </div>
  );
}

interface DataGridRowProps {
  rowNum: number;
  rowData: SheetCellValue[] | undefined;
  columns: ColumnSpec[];
  selectedCell: { row: number; col: number };
  onSelectCell: (row: number, col: number) => void;
  reducedMotion: boolean;
}

function DataGridRow({
  rowNum,
  rowData,
  columns,
  selectedCell,
  onSelectCell,
  reducedMotion,
}: DataGridRowProps): JSX.Element {
  const [hover, setHover] = useState(false);
  const stripeBg =
    rowNum % 2 === 0
      ? 'color-mix(in srgb, var(--wp-accent, #F26522) 3%, transparent)'
      : 'transparent';
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-stretch"
      style={{
        background: hover
          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)'
          : stripeBg,
        minHeight: 44,
        borderBottom: '1px solid color-mix(in srgb, var(--wp-border) 60%, transparent)',
      }}
    >
      {/* Row number gutter */}
      <div
        className="flex items-center justify-center"
        style={{
          width: COL_GUTTER_WIDTH,
          padding: '0 6px',
          color: 'var(--wp-text-faint)',
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          borderRight: '1px solid color-mix(in srgb, var(--wp-border) 60%, transparent)',
          background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 35%, transparent)',
        }}
      >
        {rowNum}
      </div>
      {columns.map((col, ci) => {
        const value = rowData?.[ci];
        const isSelected = selectedCell.row === rowNum && selectedCell.col === ci;
        const align = alignFor(col.kind);
        const isNumeric = col.kind === 'num' || col.kind === 'int' || col.kind === 'pct' || col.kind === 'delta';
        return (
          <button
            key={`cell-${rowNum}-${col.letter}`}
            type="button"
            onClick={() => onSelectCell(rowNum, ci)}
            className="relative flex items-center transition-colors"
            style={{
              width: col.width,
              padding: '0 12px',
              fontSize: 12,
              color: rowData
                ? 'var(--wp-text)'
                : 'var(--wp-text-faint)',
              borderRight: '1px solid color-mix(in srgb, var(--wp-border) 60%, transparent)',
              justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
              fontFamily: isNumeric
                ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                : 'inherit',
              fontWeight: isNumeric ? 600 : 400,
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label={`${col.name} row ${rowNum}`}
          >
            {isSelected ? (
              <motion.span
                layoutId="m3-selected-cell"
                className="pointer-events-none absolute inset-[3px] rounded"
                style={{
                  border: '2px solid var(--wp-accent, #F26522)',
                  background:
                    'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
                  boxShadow:
                    '0 0 10px color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)',
                }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 460, damping: 32 }
                }
              />
            ) : null}
            <span className="relative truncate">{formatBodyCell(value, col.kind)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spreadsheet sheet-tabs (VS-Code-style file tabs above the DataGrid).
// ---------------------------------------------------------------------------

interface SheetTabBarProps {
  active: SheetName;
  onChange: (s: SheetName) => void;
  workbook: XlsxWorkbook;
  reducedMotion: boolean;
}

function SheetTabBar({
  active,
  onChange,
  workbook,
  reducedMotion,
}: SheetTabBarProps): JSX.Element {
  return (
    <div
      className="flex items-stretch"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 60%, transparent)',
        borderBottom: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {SHEET_NAMES.map((name) => {
        const isActive = name === active;
        const sheet = getSheetSpec(workbook, name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
            style={{
              color: isActive ? 'var(--wp-text)' : 'var(--wp-text-dim)',
              background: isActive
                ? 'color-mix(in srgb, var(--wp-surface) 80%, transparent)'
                : 'transparent',
              fontWeight: isActive ? 700 : 500,
              borderRight: '1px solid var(--wp-border)',
            }}
            aria-pressed={isActive}
          >
            <FileSpreadsheet
              className="h-3 w-3"
              style={{
                color: isActive ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-faint)',
              }}
              aria-hidden
            />
            <span>{name}.csv</span>
            <span
              className="ml-1 rounded px-1 py-[1px] text-[9.5px]"
              style={{
                color: 'var(--wp-text-faint)',
                background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
              }}
            >
              {sheet.bodyRows.length}
            </span>
            {isActive ? (
              <motion.span
                layoutId="m3-sheet-tab"
                className="absolute -bottom-px left-2 right-2 h-[3px] rounded-t"
                style={{
                  background:
                    'linear-gradient(90deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 30 }
                }
              />
            ) : null}
          </button>
        );
      })}
      <div
        className="flex-1"
        style={{ borderBottom: 'none' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail — config treeview. Renders folders + leaf rows. Sections folder
// hosts interactive section toggles. Styling folder hosts accent + branding
// pickers inline. Recipients folder lists sub-clients.
// ---------------------------------------------------------------------------

interface LeftConfigTreeProps {
  state: InspectorState;
  data: AgencyReportsData;
  rangeLabel: string;
  accent: AccentSwatch;
  isDirty: boolean;
  lastBuildSec: number;
  errorCount: number;
  reducedMotion: boolean;
  onTypeChange: (id: ReportType) => void;
  onTitleChange: (s: string) => void;
  onRangeChange: (id: DateRangeId) => void;
  onSectionToggle: (k: SectionKey) => void;
  onAccentSelect: (i: number) => void;
  onBrandingChange: (b: BrandingMode) => void;
}

interface ExplorerOpenState {
  document: boolean;
  sections: boolean;
  styling: boolean;
  recipients: boolean;
}

function LeftConfigTree({
  state,
  data,
  rangeLabel,
  accent,
  isDirty,
  lastBuildSec,
  errorCount,
  reducedMotion,
  onTypeChange,
  onTitleChange,
  onRangeChange,
  onSectionToggle,
  onAccentSelect,
  onBrandingChange,
}: LeftConfigTreeProps): JSX.Element {
  const [open, setOpen] = useState<ExplorerOpenState>({
    document: true,
    sections: true,
    styling: true,
    recipients: false,
  });
  const [editingTitle, setEditingTitle] = useState(false);
  const toggle = (k: keyof ExplorerOpenState) =>
    setOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  const typeMeta = TYPE_LOOKUP[state.type];

  return (
    <aside
      className="flex flex-shrink-0 flex-col overflow-hidden"
      style={{
        width: 280,
        background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 75%, transparent)',
        borderRight: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {/* Explorer header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Code2
            className="h-3.5 w-3.5"
            style={{ color: 'var(--wp-accent, #F26522)' }}
            aria-hidden
          />
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Explorer
          </span>
        </div>
        <span
          className="text-[10.5px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          config
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* — DOCUMENT FOLDER — */}
        <TreeRow
          depth={0}
          chevron={<TreeChevron open={open.document} reducedMotion={reducedMotion} />}
          Icon={open.document ? FolderOpen : Folder}
          iconColor="var(--wp-accent, #F26522)"
          label="Document"
          onClick={() => toggle('document')}
        />
        <AnimatePresence initial={false}>
          {open.document ? (
            <motion.div
              key="doc-body"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {/* type leaf — clicking expands to a chip group of types */}
              <div
                className="px-2 py-1"
                style={{ paddingLeft: 22 }}
              >
                <div
                  className="mb-1 flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <span
                    className="font-bold"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    type
                  </span>
                  <span aria-hidden>:</span>
                  <span
                    className="rounded px-1.5 py-[1px] text-[10.5px] font-semibold"
                    style={{
                      color: 'var(--wp-accent, #F26522)',
                      background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
                    }}
                  >
                    "{typeMeta.slug}"
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {TYPE_META.map((m) => {
                    const isActive = m.id === state.type;
                    const Icon = m.Icon;
                    return (
                      <button
                        key={`tree-type-${m.id}`}
                        type="button"
                        onClick={() => onTypeChange(m.id)}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px]"
                        style={{
                          color: isActive ? '#fff' : 'var(--wp-text-dim)',
                          background: isActive
                            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                            : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                          border: isActive
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
                            : '1px solid var(--wp-border)',
                          fontWeight: isActive ? 700 : 500,
                        }}
                      >
                        <Icon className="h-2.5 w-2.5" aria-hidden />
                        <span>{m.short.toLowerCase()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* title leaf */}
              <div className="px-2 py-1" style={{ paddingLeft: 22 }}>
                <div
                  className="mb-1 flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <span
                    className="font-bold"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    title
                  </span>
                  <span aria-hidden>:</span>
                </div>
                {editingTitle ? (
                  <input
                    type="text"
                    value={state.title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onBlur={() => setEditingTitle(false)}
                    autoFocus
                    spellCheck={false}
                    className="w-full rounded px-2 py-1 text-[11px] outline-none"
                    style={{
                      background: 'var(--wp-bg)',
                      color: 'var(--wp-text)',
                      border: '1px solid var(--wp-accent, #F26522)',
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingTitle(true)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-[11px]"
                    style={{
                      background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                      color: 'var(--wp-text)',
                      border: '1px solid var(--wp-border)',
                    }}
                    title="Click to edit title"
                  >
                    "{state.title}"
                  </button>
                )}
              </div>

              {/* dateRange leaf */}
              <div className="px-2 py-1" style={{ paddingLeft: 22 }}>
                <div
                  className="mb-1 flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <span
                    className="font-bold"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    dateRange
                  </span>
                  <span aria-hidden>:</span>
                  <span
                    className="rounded px-1.5 py-[1px] text-[10.5px]"
                    style={{
                      color: 'var(--wp-accent, #F26522)',
                      background: 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                    }}
                  >
                    "{rangeLabel}"
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {DATE_RANGES.map((r) => {
                    const isActive = r.id === state.range;
                    return (
                      <button
                        key={`tree-range-${r.id}`}
                        type="button"
                        onClick={() => onRangeChange(r.id)}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px]"
                        style={{
                          color: isActive ? '#fff' : 'var(--wp-text-dim)',
                          background: isActive
                            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                            : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                          border: isActive
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
                            : '1px solid var(--wp-border)',
                          fontWeight: isActive ? 700 : 500,
                        }}
                      >
                        {r.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* — SECTIONS FOLDER — */}
        <TreeRow
          depth={0}
          chevron={<TreeChevron open={open.sections} reducedMotion={reducedMotion} />}
          Icon={open.sections ? FolderOpen : Folder}
          iconColor="var(--wp-accent, #F26522)"
          label="Sections"
          trailing={
            <span
              className="text-[10.5px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {
                SECTION_META.filter((s) => state.sections[s.key]).length
              }/{SECTION_META.length}
            </span>
          }
          onClick={() => toggle('sections')}
        />
        <AnimatePresence initial={false}>
          {open.sections ? (
            <motion.div
              key="sections-body"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {SECTION_META.map((sec) => {
                const on = state.sections[sec.key];
                return (
                  <button
                    key={sec.key}
                    type="button"
                    onClick={() => onSectionToggle(sec.key)}
                    className="group relative flex w-full items-center gap-1.5 py-[5px] text-left text-[11.5px]"
                    style={{
                      paddingLeft: 22,
                      paddingRight: 10,
                      color: on ? 'var(--wp-text)' : 'var(--wp-text-faint)',
                      background: on
                        ? 'color-mix(in srgb, var(--wp-accent, #F26522) 6%, transparent)'
                        : 'transparent',
                      borderLeft: on
                        ? '2px solid var(--wp-accent, #F26522)'
                        : '2px solid transparent',
                    }}
                  >
                    <span
                      className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{
                        background:
                          'color-mix(in srgb, var(--wp-accent, #F26522) 7%, transparent)',
                        pointerEvents: 'none',
                      }}
                      aria-hidden
                    />
                    <span
                      className="relative inline-flex h-3 w-3 items-center justify-center rounded-[2px]"
                      style={{
                        background: on
                          ? 'var(--wp-accent, #F26522)'
                          : 'color-mix(in srgb, var(--wp-surface) 90%, transparent)',
                        border: on
                          ? '1px solid var(--wp-accent, #F26522)'
                          : '1px solid var(--wp-border)',
                      }}
                    >
                      {on ? (
                        <Check className="h-2 w-2" style={{ color: '#fff' }} aria-hidden />
                      ) : null}
                    </span>
                    <FileCode2
                      className="relative h-3 w-3 flex-shrink-0"
                      style={{
                        color: on
                          ? 'var(--wp-accent, #F26522)'
                          : 'var(--wp-text-faint)',
                      }}
                      aria-hidden
                    />
                    <span className="relative min-w-0 flex-1 truncate">
                      {sec.fileLabel}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* — STYLING FOLDER — */}
        <TreeRow
          depth={0}
          chevron={<TreeChevron open={open.styling} reducedMotion={reducedMotion} />}
          Icon={open.styling ? FolderOpen : Folder}
          iconColor="var(--wp-accent, #F26522)"
          label="Styling"
          onClick={() => toggle('styling')}
        />
        <AnimatePresence initial={false}>
          {open.styling ? (
            <motion.div
              key="style-body"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {/* accent */}
              <div className="px-2 py-1" style={{ paddingLeft: 22 }}>
                <div
                  className="mb-1 flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <Palette
                    className="h-3 w-3"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                    aria-hidden
                  />
                  <span
                    className="font-bold"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    accent
                  </span>
                  <span aria-hidden>:</span>
                  <span
                    className="font-mono text-[10.5px]"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                  >
                    {accent.hex}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {ACCENT_SWATCHES.map((sw, i) => {
                    const isActive = i === state.accentIndex;
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        onClick={() => onAccentSelect(i)}
                        title={`${sw.name} · ${sw.hex}`}
                        className="relative h-5 w-5 rounded transition-transform"
                        style={{
                          background: sw.hex,
                          transform: isActive ? 'scale(1.15)' : 'scale(1)',
                          boxShadow: isActive
                            ? `0 0 0 2px var(--wp-bg), 0 0 0 4px ${sw.hex}`
                            : '0 0 0 1px rgba(0,0,0,0.4) inset',
                        }}
                      >
                        {isActive ? (
                          <Check
                            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
                            style={{ color: '#fff' }}
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* branding */}
              <div className="px-2 py-1" style={{ paddingLeft: 22 }}>
                <div
                  className="mb-1 flex items-center gap-1.5 text-[11px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <Crown
                    className="h-3 w-3"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                    aria-hidden
                  />
                  <span
                    className="font-bold"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    branding
                  </span>
                  <span aria-hidden>:</span>
                  <span
                    className="font-mono text-[10.5px]"
                    style={{ color: 'var(--wp-accent, #F26522)' }}
                  >
                    "{state.branding}"
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { id: 'cobrand' as const, label: 'cobrand' },
                    { id: 'whitelabel' as const, label: 'whitelabel' },
                  ]).map((opt) => {
                    const isActive = opt.id === state.branding;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onBrandingChange(opt.id)}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px]"
                        style={{
                          color: isActive ? '#fff' : 'var(--wp-text-dim)',
                          background: isActive
                            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
                            : 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                          border: isActive
                            ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)'
                            : '1px solid var(--wp-border)',
                          fontWeight: isActive ? 700 : 500,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* — RECIPIENTS FOLDER — */}
        <TreeRow
          depth={0}
          chevron={<TreeChevron open={open.recipients} reducedMotion={reducedMotion} />}
          Icon={open.recipients ? FolderOpen : Folder}
          iconColor="var(--wp-accent, #F26522)"
          label="Recipients"
          trailing={
            <span
              className="text-[10.5px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {data.subClients.length}
            </span>
          }
          onClick={() => toggle('recipients')}
        />
        <AnimatePresence initial={false}>
          {open.recipients ? (
            <motion.div
              key="recipients-body"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {data.subClients.map((sc) => (
                <TreeRow
                  key={sc.id}
                  depth={1}
                  Icon={Users}
                  iconColor="var(--wp-text-faint)"
                  label={sc.name}
                  trailing={
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: 'var(--wp-text-faint)' }}
                    >
                      {sc.mailboxCount} mbx
                    </span>
                  }
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Bottom status strip */}
      <div
        className="border-t px-3 py-2"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              background: errorCount > 0
                ? 'var(--wp-danger, #ff6b6b)'
                : isDirty
                  ? 'var(--wp-accent, #F26522)'
                  : 'var(--wp-success, #4ade80)',
              boxShadow:
                errorCount > 0
                  ? '0 0 6px color-mix(in srgb, var(--wp-danger, #ff6b6b) 55%, transparent)'
                  : '0 0 6px color-mix(in srgb, var(--wp-accent, #F26522) 45%, transparent)',
            }}
            aria-hidden
          />
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Status: {errorCount > 0 ? 'errors' : isDirty ? 'modified' : 'ready'}
          </span>
        </div>
        <div
          className="mt-1 text-[10px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {errorCount} errors · Last build {lastBuildSec}s ago
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — DevTools-style Elements panel (PDF mode) or Workbook
// panel (XLSX mode). Both use the same TreeRow primitives.
// ---------------------------------------------------------------------------

interface RightInspectorProps {
  mode: PreviewMode;
  plan: PdfPlan;
  workbook: XlsxWorkbook;
  activeSheet: SheetName;
  reducedMotion: boolean;
}

interface ElementsOpenState {
  document: boolean;
  blocks: Record<string, boolean>;
}

interface WorkbookOpenState {
  root: boolean;
  sheets: Record<SheetName, boolean>;
}

function RightInspector({
  mode,
  plan,
  workbook,
  activeSheet,
  reducedMotion,
}: RightInspectorProps): JSX.Element {
  const [elementsOpen, setElementsOpen] = useState<ElementsOpenState>({
    document: true,
    blocks: {},
  });
  const [workbookOpen, setWorkbookOpen] = useState<WorkbookOpenState>({
    root: true,
    sheets: { Summary: true, Detail: false, Template: false },
  });
  const toggleBlock = (key: string) =>
    setElementsOpen((prev) => ({
      ...prev,
      blocks: { ...prev.blocks, [key]: !prev.blocks[key] },
    }));
  const toggleSheet = (name: SheetName) =>
    setWorkbookOpen((prev) => ({
      ...prev,
      sheets: { ...prev.sheets, [name]: !prev.sheets[name] },
    }));

  return (
    <aside
      className="flex flex-shrink-0 flex-col overflow-hidden"
      style={{
        width: 280,
        background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 75%, transparent)',
        borderLeft: '1px solid var(--wp-border)',
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        }}
      >
        <div className="flex items-center gap-1.5">
          {mode === 'pdf' ? (
            <Box
              className="h-3.5 w-3.5"
              style={{ color: 'var(--wp-accent, #F26522)' }}
              aria-hidden
            />
          ) : (
            <FileSpreadsheet
              className="h-3.5 w-3.5"
              style={{ color: 'var(--wp-accent, #F26522)' }}
              aria-hidden
            />
          )}
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            {mode === 'pdf' ? 'Elements' : 'Workbook'}
          </span>
        </div>
        <span
          className="text-[10.5px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          inspect
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'pdf' ? (
            <motion.div
              key="elements"
              initial={reducedMotion ? false : { opacity: 0, x: 6 }}
              animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
            >
              {/* document root */}
              <TreeRow
                depth={0}
                chevron={<TreeChevron open={elementsOpen.document} reducedMotion={reducedMotion} />}
                Icon={Box}
                iconColor="var(--wp-accent, #F26522)"
                label={`<document type="${plan.typeMeta.slug}">`}
                onClick={() =>
                  setElementsOpen((prev) => ({ ...prev, document: !prev.document }))
                }
              />
              {elementsOpen.document ? (
                <>
                  {plan.blocks.map((block) => {
                    const isOpen = elementsOpen.blocks[block.key] ?? false;
                    return (
                      <BlockTreeItem
                        key={block.key}
                        block={block}
                        plan={plan}
                        isOpen={isOpen}
                        onToggle={() => toggleBlock(block.key)}
                        reducedMotion={reducedMotion}
                      />
                    );
                  })}
                  <TreeRow
                    depth={1}
                    label="</document>"
                    dim
                  />
                </>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="workbook"
              initial={reducedMotion ? false : { opacity: 0, x: 6 }}
              animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
            >
              {/* workbook root */}
              <TreeRow
                depth={0}
                chevron={<TreeChevron open={workbookOpen.root} reducedMotion={reducedMotion} />}
                Icon={FileSpreadsheet}
                iconColor="var(--wp-accent, #F26522)"
                label={`<workbook sheets="${workbook.sheets.length}">`}
                onClick={() =>
                  setWorkbookOpen((prev) => ({ ...prev, root: !prev.root }))
                }
              />
              {workbookOpen.root ? (
                <>
                  {workbook.sheets.map((sheet) => {
                    const sheetIsOpen = workbookOpen.sheets[sheet.name];
                    const isFocused = sheet.name === activeSheet;
                    return (
                      <div key={sheet.name}>
                        <TreeRow
                          depth={1}
                          chevron={
                            <TreeChevron open={sheetIsOpen} reducedMotion={reducedMotion} />
                          }
                          Icon={FileSpreadsheet}
                          iconColor={
                            isFocused
                              ? 'var(--wp-accent, #F26522)'
                              : 'var(--wp-text-faint)'
                          }
                          label={`<sheet name="${sheet.name}">`}
                          active={isFocused}
                          trailing={
                            <span
                              className="text-[10px]"
                              style={{ color: 'var(--wp-text-faint)' }}
                            >
                              {sheet.bodyRows.length}r
                            </span>
                          }
                          onClick={() => toggleSheet(sheet.name)}
                        />
                        <AnimatePresence initial={false}>
                          {sheetIsOpen ? (
                            <motion.div
                              key={`${sheet.name}-body`}
                              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                              animate={
                                reducedMotion ? undefined : { height: 'auto', opacity: 1 }
                              }
                              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              style={{ overflow: 'hidden' }}
                            >
                              {sheet.columns.map((col) => (
                                <TreeRow
                                  key={`${sheet.name}-col-${col.letter}`}
                                  depth={2}
                                  Icon={Hash}
                                  iconColor="var(--wp-text-faint)"
                                  label={`${col.letter}: ${col.name}`}
                                  trailing={<TypeChip kind={col.kind} />}
                                />
                              ))}
                              <TreeRow
                                depth={2}
                                Icon={Terminal}
                                iconColor="var(--wp-text-faint)"
                                label={`// ${sheet.description}`}
                                dim
                              />
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  <TreeRow depth={1} label="</workbook>" dim />
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer notes */}
      <div
        className="border-t px-3 py-2 text-[10px]"
        style={{
          borderColor: 'var(--wp-border)',
          background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
          color: 'var(--wp-text-faint)',
        }}
      >
        {mode === 'pdf' ? (
          <span>{plan.blocks.length} blocks · {plan.metric.rows.length} rows</span>
        ) : (
          <span>
            {workbook.sheets.length} sheets ·{' '}
            {workbook.sheets.reduce((s, sh) => s + sh.bodyRows.length, 0)} rows
          </span>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Single block item in the right Elements tree — shows the block as an
// <Element> tag, expanding shows its children/attributes.
// ---------------------------------------------------------------------------

interface BlockTreeItemProps {
  block: PdfBlock;
  plan: PdfPlan;
  isOpen: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
}

function BlockTreeItem({
  block,
  plan,
  isOpen,
  onToggle,
  reducedMotion,
}: BlockTreeItemProps): JSX.Element {
  const tagName = block.kind === 'title-only' ? 'title' : block.kind;
  return (
    <div>
      <TreeRow
        depth={1}
        chevron={<TreeChevron open={isOpen} reducedMotion={reducedMotion} />}
        Icon={FileCode2}
        iconColor="var(--wp-accent, #F26522)"
        label={`<${tagName}>`}
        onClick={onToggle}
      />
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key={`${block.key}-body`}
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            {block.kind === 'cover' || block.kind === 'title-only' ? (
              <>
                <TreeRow
                  depth={2}
                  Icon={TypeIcon}
                  iconColor="var(--wp-text-faint)"
                  label={`title="${truncate(plan.title, 26)}"`}
                />
                <TreeRow
                  depth={2}
                  Icon={CalendarRange}
                  iconColor="var(--wp-text-faint)"
                  label={`range="${plan.rangeLabel}"`}
                />
                {block.kind === 'cover' ? (
                  <TreeRow
                    depth={2}
                    Icon={Crown}
                    iconColor="var(--wp-text-faint)"
                    label={`brand="${plan.isWhiteLabel ? 'whitelabel' : 'cobrand'}"`}
                  />
                ) : null}
              </>
            ) : null}
            {block.kind === 'executive' ? (
              <>
                <TreeRow
                  depth={2}
                  Icon={Sparkles}
                  iconColor="var(--wp-text-faint)"
                  label={`headline="${truncate(plan.metric.headline, 22)}"`}
                />
                <TreeRow
                  depth={2}
                  Icon={Hash}
                  iconColor="var(--wp-text-faint)"
                  label={`total=${plan.metric.summary.total} avg=${plan.metric.summary.avg}`}
                />
              </>
            ) : null}
            {block.kind === 'kpiTable' ? (
              <>
                <TreeRow
                  depth={2}
                  Icon={LayoutGrid}
                  iconColor="var(--wp-text-faint)"
                  label={`rows=${plan.metric.rows.length} cols=5`}
                />
                {plan.metric.rows.slice(0, 3).map((r) => (
                  <TreeRow
                    key={`kpi-${r.subClient}`}
                    depth={3}
                    Icon={Building2}
                    iconColor="var(--wp-text-faint)"
                    label={`<tr>${r.subClient}: ${r.value}</tr>`}
                  />
                ))}
                {plan.metric.rows.length > 3 ? (
                  <TreeRow
                    depth={3}
                    label={`+ ${plan.metric.rows.length - 3} more rows`}
                    dim
                  />
                ) : null}
              </>
            ) : null}
            {block.kind === 'breakdown' ? (
              <TreeRow
                depth={2}
                Icon={Building2}
                iconColor="var(--wp-text-faint)"
                label={`cards=${plan.metric.rows.length} cols=2`}
              />
            ) : null}
            {block.kind === 'trends' ? (
              <>
                <TreeRow
                  depth={2}
                  Icon={PieChart}
                  iconColor="var(--wp-text-faint)"
                  label={`bars=${plan.metric.rows.length}`}
                />
                <TreeRow
                  depth={2}
                  Icon={Palette}
                  iconColor="var(--wp-text-faint)"
                  label={`accent=${plan.accent.hex}`}
                />
              </>
            ) : null}
            {block.kind === 'footer' ? (
              <TreeRow
                depth={2}
                Icon={Crown}
                iconColor="var(--wp-text-faint)"
                label={`brand="${plan.isWhiteLabel ? 'whitelabel' : 'cobrand'}"`}
              />
            ) : null}
            <TreeRow depth={1} label={`</${tagName}>`} dim />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRptM3Console({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const reducedMotion = useReducedMotion() ?? false;

  const initialState = useMemo(
    () => buildInitialState('warmth', d.agency.name),
    [d.agency.name],
  );
  const [state, setState] = useState<InspectorState>(initialState);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');
  const [activeSheet, setActiveSheet] = useState<SheetName>('Summary');
  // Click-driven cell selection — defaults to A1 (the column-name row).
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({
    row: 0,
    col: 0,
  });
  // Mock "Last build {n}s ago" — fixed at 12 per spec ("Last build 12s ago").
  const lastBuildSec = 12;

  const isDirty = useMemo(
    () => !isStateEqual(state, initialState),
    [state, initialState],
  );

  const accent: AccentSwatch = ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;

  // ---------------------------------------------------------------------
  // SHARED BUILDER — exact-match guarantee. Both the preview AND the real
  // export handlers consume the SAME plan + workbook so byte-for-byte
  // parity holds between what the user sees and what they download.
  // ---------------------------------------------------------------------

  const builder = useMemo(
    () => ({
      pdf: buildPdfPlan(state, d, rangeMeta.label, accent),
      xlsx: buildXlsxWorkbook(state, d, rangeMeta.label, accent),
    }),
    [state, d, rangeMeta.label, accent],
  );

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
      // Reset cell selection so we don't end up referencing a now-shorter sheet.
      setSelectedCell({ row: 0, col: 0 });
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

  const handleSelectCell = useCallback((row: number, col: number) => {
    setSelectedCell({ row, col });
  }, []);

  const handleChangeSheet = useCallback((name: SheetName) => {
    setActiveSheet(name);
    // Re-anchor selection to A1 of the new sheet.
    setSelectedCell({ row: 0, col: 0 });
  }, []);

  // -------------------------------------------------------------------------
  // REAL PDF export — jsPDF + jspdf-autotable. NOT a stub.
  // Consumes the shared PdfPlan so the artifact matches the on-screen
  // PaperPreview byte-for-byte.
  // -------------------------------------------------------------------------

  const handlePdf = useCallback(() => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const plan = builder.pdf;
      const accentRgb = plan.accent.rgb;
      const metric = plan.metric;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = 0;

      for (const block of plan.blocks) {
        if (block.kind === 'cover') {
          doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
          doc.rect(0, 0, pageW, 60, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(
            (plan.isWhiteLabel
              ? plan.agencyName
              : `${plan.agencyName} · WarmPulse`
            ).toUpperCase(),
            margin,
            22,
          );
          doc.setFontSize(20);
          doc.setFont('times', 'bold');
          doc.text(plan.title, margin, 44);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(plan.rangeLabel, pageW - margin, 22, { align: 'right' });
          cursorY = 88;
        } else if (block.kind === 'title-only') {
          if (cursorY === 0) cursorY = margin;
          doc.setTextColor(31, 20, 16);
          doc.setFontSize(20);
          doc.setFont('times', 'bold');
          doc.text(plan.title, margin, cursorY);
          cursorY += 18;
          doc.setTextColor(106, 84, 72);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`${plan.typeMeta.label} · ${plan.rangeLabel}`, margin, cursorY);
          cursorY += 16;
        } else if (block.kind === 'executive') {
          doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('EXECUTIVE SUMMARY', margin, cursorY);
          cursorY += 14;
          doc.setTextColor(31, 20, 16);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          const wrapped = doc.splitTextToSize(metric.pullQuote, pageW - margin * 2);
          doc.text(wrapped, margin, cursorY);
          cursorY += wrapped.length * 12 + 8;
          const cellW = (pageW - margin * 2 - 18) / 4;
          const summaries: Array<[string, number]> = [
            ['Total', metric.summary.total],
            ['Average', metric.summary.avg],
            ['High', metric.summary.high],
            ['Low', metric.summary.low],
          ];
          summaries.forEach(([k, v], i) => {
            const x = margin + i * (cellW + 6);
            doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
            doc.setFillColor(255, 250, 246);
            doc.roundedRect(x, cursorY, cellW, 38, 3, 3, 'FD');
            doc.setTextColor(106, 84, 72);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(k.toUpperCase(), x + 8, cursorY + 12);
            doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
            doc.setFontSize(14);
            doc.setFont('times', 'bold');
            doc.text(String(v), x + 8, cursorY + 30);
          });
          cursorY += 50;
        } else if (block.kind === 'kpiTable') {
          autoTable(doc, {
            startY: cursorY,
            head: [['Sub-client', 'Domain', 'Value', 'Δ', 'Status']],
            body: metric.rows.map((r) => [
              r.subClient,
              r.domain,
              r.value.toString(),
              `${r.delta >= 0 ? '+' : ''}${r.delta}`,
              statusStyle(r.status).label,
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
            (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
            cursorY + 100;
          cursorY = finalY + 16;
        } else if (block.kind === 'breakdown') {
          doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('PER SUB-CLIENT BREAKDOWN', margin, cursorY);
          cursorY += 12;
          doc.setTextColor(31, 20, 16);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          metric.rows.forEach((r) => {
            const sLabel = statusStyle(r.status).label;
            doc.text(
              `${r.subClient} — ${r.domain} · ${r.value} (${r.delta >= 0 ? '+' : ''}${r.delta}) · ${sLabel}`,
              margin,
              cursorY,
            );
            cursorY += 11;
          });
          cursorY += 6;
        } else if (block.kind === 'trends' && cursorY < 740) {
          doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('TRENDS', margin, cursorY);
          cursorY += 10;
          const max = Math.max(...metric.rows.map((r) => r.value), 1);
          const chartH = 60;
          const chartW = pageW - margin * 2;
          const slotW = chartW / Math.max(metric.rows.length, 1);
          const barW = Math.min(slotW * 0.55, 36);
          doc.setDrawColor(180, 170, 162);
          doc.line(margin, cursorY + chartH, pageW - margin, cursorY + chartH);
          metric.rows.forEach((r, i) => {
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
        } else if (block.kind === 'footer') {
          doc.setTextColor(106, 84, 72);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          const footerText = plan.isWhiteLabel
            ? `${plan.agencyName} · Confidential`
            : `${plan.agencyName} · Powered by WarmPulse`;
          doc.text(footerText, margin, 820);
          doc.text('Page 1 of 1', pageW - margin, 820, { align: 'right' });
        }
      }

      doc.save(buildExportFilename(plan.agencyName, plan.type, 'pdf'));
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF export failed', err);
      toast.error('PDF export failed — check console');
    } finally {
      window.setTimeout(() => setPdfBusy(false), 380);
    }
  }, [pdfBusy, builder]);

  // -------------------------------------------------------------------------
  // REAL XLSX export — xlsx workbook with Summary + Detail + Template sheets.
  // Consumes the shared XlsxWorkbook so the file matches the DataGrid preview
  // byte-for-byte.
  // -------------------------------------------------------------------------

  const handleXlsx = useCallback(() => {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      const workbook = builder.xlsx;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(workbook.rawSheets.Summary),
        'Summary',
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(workbook.rawSheets.Detail),
        'Detail',
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(workbook.rawSheets.Template),
        'Template',
      );
      XLSX.writeFile(wb, buildExportFilename(d.agency.name, state.type, 'xlsx'));
      toast.success('XLSX downloaded');
    } catch (err) {
      console.error('XLSX export failed', err);
      toast.error('XLSX export failed — check console');
    } finally {
      window.setTimeout(() => setXlsxBusy(false), 380);
    }
  }, [xlsxBusy, builder, d.agency.name, state.type]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const totalMailboxes = useMemo(
    () => d.subClients.reduce((s, c) => s + c.mailboxCount, 0),
    [d.subClients],
  );

  const fileTabLabel = `${typeMeta.slug}-report.config.json`;

  return (
    <motion.div
      variants={reducedMotion ? undefined : PAGE_VARIANTS}
      initial={reducedMotion ? undefined : 'hidden'}
      animate={reducedMotion ? undefined : 'show'}
      className="flex h-full w-full flex-col"
      style={{
        background:
          'radial-gradient(1100px 600px at 18% -10%, color-mix(in srgb, var(--wp-accent, #F26522) 9%, transparent), transparent 60%), var(--wp-bg)',
        color: 'var(--wp-text)',
        minHeight: '100vh',
      }}
    >
      {/* TOP TOOLBAR */}
      <header
        className="sticky top-0 z-30 flex flex-col border-b"
        style={{
          background: 'color-mix(in srgb, var(--wp-bg) 92%, transparent)',
          borderColor: 'var(--wp-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Left — agency badge */}
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="inline-flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                background:
                  'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                color: '#fff',
              }}
            >
              <Terminal className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 leading-tight">
              <div
                className="truncate text-[13px] font-semibold"
                style={{ color: 'var(--wp-text)' }}
              >
                {d.agency.name}
              </div>
              <div
                className="truncate text-[10.5px]"
                style={{
                  color: 'var(--wp-text-faint)',
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                Console · {d.agency.region}
              </div>
            </div>
          </div>

          {/* Center — type pills */}
          <div className="flex flex-1 items-center justify-center">
            <TypePills
              active={state.type}
              onSelect={handleTypeChange}
              reducedMotion={reducedMotion}
            />
          </div>

          {/* Right — mode toggle + export buttons */}
          <div className="flex items-center gap-2">
            <PreviewModeToggle
              mode={previewMode}
              onChange={setPreviewMode}
              reducedMotion={reducedMotion}
            />
            <ExportButton
              variant="outline"
              label="XLSX"
              Icon={FileSpreadsheet}
              busy={xlsxBusy}
              onClick={handleXlsx}
              reducedMotion={reducedMotion}
            />
            <ExportButton
              variant="primary"
              label="Run Export"
              Icon={Play}
              TrailIcon={Download}
              busy={pdfBusy}
              onClick={handlePdf}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>

        {/* Sub-toolbar — open file tabs row */}
        <div
          className="flex items-end gap-0 px-2 pt-1"
          style={{
            background: 'color-mix(in srgb, var(--wp-surface-2, #261812) 40%, transparent)',
            borderTop: '1px solid var(--wp-border)',
          }}
        >
          <FileTab
            Icon={FileJson}
            iconColor="var(--wp-accent, #F26522)"
            label={fileTabLabel}
            dirty={isDirty}
            active
          />
          <FileTab
            Icon={FileSpreadsheet}
            iconColor="var(--wp-text-faint)"
            label={`${typeMeta.slug}-workbook.xlsx`}
          />
          <div
            className="flex-1 border-b"
            style={{ borderColor: 'var(--wp-border)' }}
          />
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-[10.5px]"
            style={{
              color: 'var(--wp-text-faint)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            <Settings2 className="h-3 w-3" aria-hidden />
            <span>{totalMailboxes} mailboxes</span>
            <span aria-hidden>·</span>
            <span>{rangeMeta.label}</span>
          </div>
        </div>
      </header>

      {/* Main 3-pane workbench */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT — Config Tree */}
        <LeftConfigTree
          state={state}
          data={d}
          rangeLabel={rangeMeta.label}
          accent={accent}
          isDirty={isDirty}
          lastBuildSec={lastBuildSec}
          errorCount={0}
          reducedMotion={reducedMotion}
          onTypeChange={handleTypeChange}
          onTitleChange={handleTitleChange}
          onRangeChange={handleRangeChange}
          onSectionToggle={handleSectionToggle}
          onAccentSelect={handleAccentSelect}
          onBrandingChange={handleBrandingChange}
        />

        {/* CENTER — Preview canvas */}
        <main
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            background:
              'radial-gradient(800px 400px at 50% -20%, color-mix(in srgb, var(--wp-accent, #F26522) 5%, transparent), transparent 60%)',
          }}
        >
          {/* Inline preview tab row — "PDF.preview / XLSX.preview" */}
          <div
            className="flex items-center justify-between border-b px-3 py-1.5"
            style={{
              borderColor: 'var(--wp-border)',
              background: 'color-mix(in srgb, var(--wp-bg) 80%, transparent)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            <div className="flex items-center gap-0">
              {([
                { id: 'pdf' as const, label: 'PDF.preview', Icon: FileText },
                { id: 'xlsx' as const, label: 'XLSX.preview', Icon: FileSpreadsheet },
              ]).map((tab) => {
                const isActive = tab.id === previewMode;
                const TabIcon = tab.Icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPreviewMode(tab.id)}
                    className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
                    style={{
                      color: isActive ? 'var(--wp-text)' : 'var(--wp-text-dim)',
                      fontWeight: isActive ? 700 : 500,
                      borderBottom: isActive
                        ? '2px solid var(--wp-accent, #F26522)'
                        : '2px solid transparent',
                      background: isActive
                        ? 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)'
                        : 'transparent',
                    }}
                  >
                    <TabIcon
                      className="h-3 w-3"
                      style={{
                        color: isActive
                          ? 'var(--wp-accent, #F26522)'
                          : 'var(--wp-text-faint)',
                      }}
                      aria-hidden
                    />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  color: 'var(--wp-accent, #F26522)',
                  background: 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                }}
              >
                {previewMode === 'pdf' ? 'A4 portrait' : 'workbook'}
              </span>
              <span
                className="text-[10px]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                {previewMode === 'pdf'
                  ? `${builder.pdf.blocks.length} blocks`
                  : `${builder.xlsx.sheets.length} sheets`}
              </span>
            </div>
          </div>

          {/* Sheet tabs row — only visible in XLSX mode */}
          {previewMode === 'xlsx' ? (
            <SheetTabBar
              active={activeSheet}
              onChange={handleChangeSheet}
              workbook={builder.xlsx}
              reducedMotion={reducedMotion}
            />
          ) : null}

          {/* Preview canvas */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {previewMode === 'pdf' ? (
                <motion.div
                  key="pdf-canvas"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="h-full overflow-y-auto px-8 py-6"
                >
                  <div className="mx-auto" style={{ width: 720 }}>
                    <div
                      className="relative overflow-hidden rounded-lg"
                      style={{
                        background: 'var(--wp-surface, #fffaf6)',
                        color: '#1f1410',
                        boxShadow:
                          '0 30px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.06)',
                        minHeight: 940,
                      }}
                    >
                      <PaperPreview plan={builder.pdf} />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="xlsx-canvas"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="h-full"
                >
                  <SpreadsheetCanvas
                    workbook={builder.xlsx}
                    activeSheet={activeSheet}
                    selectedCell={selectedCell}
                    onSelectCell={handleSelectCell}
                    reducedMotion={reducedMotion}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Status bar — VS-Code-style "Line 12, Col 3 · UTF-8 · LF" */}
          <div
            className="flex items-center justify-between border-t px-3 py-1 text-[10px]"
            style={{
              borderColor: 'var(--wp-border)',
              background: 'color-mix(in srgb, var(--wp-bg) 90%, transparent)',
              color: 'var(--wp-text-dim)',
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Activity
                  className="h-3 w-3"
                  style={{ color: 'var(--wp-accent, #F26522)' }}
                  aria-hidden
                />
                <span>build ok</span>
              </span>
              <span>
                {previewMode === 'pdf'
                  ? `Block ${selectedCell.row + 1}, Col ${selectedCell.col + 1}`
                  : `Ln ${selectedCell.row + 1}, Col ${selectedCell.col + 1}`}
              </span>
              <span>UTF-8</span>
              <span>LF</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{previewMode === 'pdf' ? 'pdf' : 'xlsx'} preview</span>
              <span style={{ color: 'var(--wp-text-faint)' }}>
                {isDirty ? 'unsaved' : 'clean'}
              </span>
              {isDirty ? (
                <AlertTriangle
                  className="h-3 w-3"
                  style={{ color: 'var(--wp-accent, #F26522)' }}
                  aria-hidden
                />
              ) : (
                <Check
                  className="h-3 w-3"
                  style={{ color: 'var(--wp-success, #4ade80)' }}
                  aria-hidden
                />
              )}
            </div>
          </div>
        </main>

        {/* RIGHT — Inspector */}
        <RightInspector
          mode={previewMode}
          plan={builder.pdf}
          workbook={builder.xlsx}
          activeSheet={activeSheet}
          reducedMotion={reducedMotion}
        />
      </div>
    </motion.div>
  );
}

export default AgRptM3Console;
