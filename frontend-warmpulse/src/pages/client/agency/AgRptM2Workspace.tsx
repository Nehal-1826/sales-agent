import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CalendarRange,
  Check,
  ChevronRight,
  CircleDot,
  Crown,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  GripVertical,
  Hash,
  LayoutGrid,
  Layers,
  ListChecks,
  Loader2,
  MailCheck,
  Palette,
  Save,
  Sheet as SheetIcon,
  Sparkles,
  Table2,
  Target,
  Type,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';

/**
 * AgRptM2Workspace — Agency-tier REPORTS surface, design candidate M2,
 * "Workspace".
 *
 * The Reports surface re-imagined as a LINEAR / NOTION-style modern
 * productivity workspace. Where M1 ("Studio") feels like a high-chrome
 * Adobe panel layout, M2 strips chrome away and leans on whitespace,
 * restrained typography and soft section dividers. The aesthetic is
 * quiet, calm and modern — a tool that fades to the background while
 * the document being authored takes centre stage.
 *
 *   - The TOP BREADCRUMB STRIP is slim (~44px), sticky and reads like a
 *     Linear page header: "Reports · {agency} · {report type}" with the
 *     last-saved indicator, a [PDF | XLSX] preview-mode segmented control
 *     and small icon-led "Download PDF" / "Download XLSX" pill buttons
 *     anchored right. Real `jsPDF` + `jspdf-autotable` + `xlsx` exports.
 *
 *   - The LEFT RAIL (~320px) is a LINEAR-style sidebar — section headers
 *     in mono uppercase 11px, restrained borders, ample 16px gutters
 *     between groups. It carries: the quick switcher (Warmth /
 *     Engagement / Placement / White-label as soft pills, current is
 *     orange-tinted), a Linear-filter-style section toggle list (Cover ·
 *     Summary · KPI Table · Breakdown · Trends · Footer, each with a
 *     switch component on the right), accent-color swatches, branding
 *     radios and a 7d / 30d / Quarter segmented control. Plus a quiet
 *     "Save template" footer with a Modified dot.
 *
 *   - The CENTER PREVIEW AREA holds an A4 paper canvas in PDF mode and
 *     a NOTION-STYLE polished workbook table in XLSX mode. The two
 *     modes cross-fade via `AnimatePresence`. The PDF canvas paints
 *     the EXACT downloaded artifact (cover band, executive summary,
 *     KPI cards row, autoTable, SVG bar chart, footer). The XLSX
 *     preview reads the workbook returned by `buildXlsxWorkbook`,
 *     which is the SAME workbook the real `handleXlsx` export writes
 *     via XLSX.writeFile — exact-match between preview and download.
 *
 *   - The XLSX preview itself avoids raw-Excel chrome and renders a
 *     Notion-style database view: a workbook header card with display
 *     title + filename + "3 sheets · N rows" stat; a horizontal sheet
 *     selector with orange underline accent (driven by motion.layoutId
 *     `m2-sheet-underline`); a polished borderless table with type
 *     icons in column headers, 44px row heights, near-invisible zebra
 *     striping, orange-tinted hover, status cells rendered as colored
 *     pill chips, mono tabular numerals right-aligned with inline ▲/▼
 *     delta arrows; and a footer total-row strip with mean / sum / max
 *     aggregates derived from numeric columns.
 *
 *   - The RIGHT INSPECTOR (~240px) shows mode-specific details — Page
 *     details (A4 portrait, est. size, fonts) in PDF mode and Workbook
 *     details (sheet list with row counts, file extension chip,
 *     generated timestamp) in XLSX mode. Slimmer than M1 to keep the
 *     focus on the centre canvas.
 *
 * Strict-Shailog orange palette throughout via `var(--wp-*)` CSS vars
 * only. No violet, blue, cyan, mint or teal anywhere. Status colours
 * stay in the orange / warning / success / danger family per the
 * design rules.
 *
 * Fully STANDALONE — `data` is optional and an inline MOCK supplies
 * every field so the design-preview harness mounts the surface prop-
 * less. The `AgencyReportsData` shape is the same shape published by
 * sibling M1; if M1 ever lands on disk this file can switch to a
 * `type-only` import without changing behaviour.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — inlined so the file is standalone in
// case the sibling M1 ("Studio") candidate has not landed yet. Same shape
// as M1 publishes.
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
// MOCK — Northwind Agency, six sub-clients, four fully populated report-type
// metric bundles. Numbers chosen so each pull quote reads distinctly in the
// preview canvas and the table values stay non-colliding across types.
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
      "The portfolio gained 4.2 points of average inbox placement across Gmail, Outlook and Yahoo. Four of six sub-clients hold above 90% inbox rate, while two still need targeted reputation work before the next sending wave.",
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
// Type metadata — drives both the left-rail quick switcher pills and the
// breadcrumb crumb at the top. Single source so the labels stay in lockstep.
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
    label: 'Warmth Report',
    short: 'Warmth',
    Icon: Flame,
    description: 'Reputation curve, ramp completion, peer signal lift.',
  },
  {
    id: 'engagement',
    label: 'Engagement Report',
    short: 'Engagement',
    Icon: MailCheck,
    description: 'Opens, replies, stars and spam-rescues per sub-client.',
  },
  {
    id: 'placement',
    label: 'Placement Report',
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

// ---------------------------------------------------------------------------
// Date range presets, accent swatch palette, branding modes.
// ---------------------------------------------------------------------------

type DateRangeId = 'last7' | 'last30' | 'quarter';

interface DateRangeMeta {
  id: DateRangeId;
  label: string;
  short: string;
  Icon: typeof Calendar;
}

const DATE_RANGES: DateRangeMeta[] = [
  { id: 'last7', label: 'Last 7 days', short: '7d', Icon: Calendar },
  { id: 'last30', label: 'Last 30 days', short: '30d', Icon: CalendarRange },
  { id: 'quarter', label: 'This Quarter', short: 'Quarter', Icon: CalendarRange },
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
    label: 'Cover',
    hint: 'Branded title band.',
    Icon: Layers,
  },
  {
    key: 'executive',
    label: 'Summary',
    hint: 'Pull-quote intro.',
    Icon: Sparkles,
  },
  {
    key: 'kpiTable',
    label: 'KPI Table',
    hint: 'Per-sub-client metric.',
    Icon: Table2,
  },
  {
    key: 'breakdown',
    label: 'Breakdown',
    hint: 'Status cards.',
    Icon: LayoutGrid,
  },
  {
    key: 'trends',
    label: 'Trends',
    hint: 'SVG bar chart.',
    Icon: ListChecks,
  },
  {
    key: 'footer',
    label: 'Footer',
    hint: 'Brand + page no.',
    Icon: Type,
  },
];

type PreviewMode = 'pdf' | 'xlsx';
type SheetName = 'Summary' | 'Detail' | 'Template';
const SHEET_NAMES: SheetName[] = ['Summary', 'Detail', 'Template'];

// ---------------------------------------------------------------------------
// Initial / default state for the inspector — used both as React useState seed
// and as the reference for the "Modified" dirty-state indicator.
// ---------------------------------------------------------------------------

interface InspectorState {
  type: ReportType;
  range: DateRangeId;
  sections: Record<SectionKey, boolean>;
  accentIndex: number;
  branding: BrandingMode;
}

function buildInitialState(typeId: ReportType): InspectorState {
  return {
    type: typeId,
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
  if (a.range !== b.range) return false;
  if (a.accentIndex !== b.accentIndex) return false;
  if (a.branding !== b.branding) return false;
  for (const meta of SECTION_META) {
    if (a.sections[meta.key] !== b.sections[meta.key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Status colour helper — strict-Shailog palette family (orange/warning, no
// violet / blue / cyan / mint / teal). Returns text, soft tinted bg + border
// for the rendered pill chip.
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
// SINGLE SOURCE OF TRUTH — workbook builder.
//
// `buildXlsxWorkbook` returns a structured workbook the Notion-style preview
// component renders directly and the real `handleXlsx` writes to disk via
// XLSX.writeFile. Same data on screen and in the downloaded file.
// ---------------------------------------------------------------------------

type ColumnType = 'text' | 'number' | 'select';

interface WorkbookColumn {
  key: string;
  label: string;
  type: ColumnType;
  // For numeric columns: whether the value is an integer / percentage / etc.
  // Affects right-alignment + aggregate calculations in the footer.
  numericKind?: 'integer' | 'percent';
  // Hint for inline arrow direction on delta-like columns.
  isDelta?: boolean;
}

interface WorkbookRow {
  cells: Record<string, string | number>;
  // Optional decorations the Notion-style table cares about — a status row
  // gets a colored pill, a row marked emphasis renders bold.
  status?: 'good' | 'warn' | 'risk';
  emphasis?: boolean;
}

interface WorkbookSheet {
  name: SheetName;
  columns: WorkbookColumn[];
  rows: WorkbookRow[];
  // Footer aggregates derived per-column (mean / sum / max / count). Optional.
  aggregates?: Array<{ label: string; values: Record<string, string | number> }>;
  // For XLSX export — the raw AoA layout that `aoa_to_sheet` consumes. Built
  // alongside the typed structure so the preview + export agree byte-for-byte.
  rawAoa: Array<Array<string | number>>;
}

interface Workbook {
  sheets: WorkbookSheet[];
  filename: string;
}

function buildXlsxWorkbook(
  state: InspectorState,
  data: AgencyReportsData,
  accent: AccentSwatch,
  rangeLabel: string,
): Workbook {
  const typeMetaXlsx = TYPE_LOOKUP[state.type];
  const metric = data.metrics[state.type];

  // -----------------------------------------------------------------------
  // Summary sheet — meta + headline aggregates.
  // -----------------------------------------------------------------------
  const summaryColumns: WorkbookColumn[] = [
    { key: 'field', label: 'Field', type: 'text' },
    { key: 'value', label: 'Value', type: 'text' },
  ];
  const summaryRows: WorkbookRow[] = [
    { cells: { field: 'Agency', value: data.agency.name } },
    { cells: { field: 'Region', value: data.agency.region } },
    { cells: { field: 'Report type', value: typeMetaXlsx.label } },
    { cells: { field: 'Range', value: rangeLabel } },
    {
      cells: {
        field: 'Branding',
        value: state.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand',
      },
    },
    { cells: { field: 'Headline', value: metric.headline } },
    { cells: { field: 'Generated', value: new Date().toISOString() } },
    { cells: { field: '', value: '' } },
    {
      cells: { field: 'Total', value: metric.summary.total },
      emphasis: true,
    },
    {
      cells: { field: 'Average', value: metric.summary.avg },
      emphasis: true,
    },
    {
      cells: { field: 'High', value: metric.summary.high },
      emphasis: true,
    },
    {
      cells: { field: 'Low', value: metric.summary.low },
      emphasis: true,
    },
  ];
  const summaryAoa: Array<Array<string | number>> = summaryRows.map((r) => [
    r.cells.field as string,
    r.cells.value as string | number,
  ]);

  // -----------------------------------------------------------------------
  // Detail sheet — per-sub-client rows + the typed columns the Notion table
  // wants. The numeric value / delta columns drive footer aggregates.
  // -----------------------------------------------------------------------
  const detailColumns: WorkbookColumn[] = [
    { key: 'subClient', label: 'Sub-client', type: 'text' },
    { key: 'domain', label: 'Domain', type: 'text' },
    { key: 'mailboxes', label: 'Mailboxes', type: 'number', numericKind: 'integer' },
    { key: 'value', label: 'Value', type: 'number', numericKind: 'integer' },
    { key: 'delta', label: 'Δ', type: 'number', numericKind: 'integer', isDelta: true },
    { key: 'status', label: 'Status', type: 'select' },
  ];
  const detailRows: WorkbookRow[] = metric.rows.map<WorkbookRow>((r) => {
    const sc = data.subClients.find((c) => c.name === r.subClient);
    return {
      cells: {
        subClient: r.subClient,
        domain: r.domain,
        mailboxes: sc?.mailboxCount ?? 0,
        value: r.value,
        delta: r.delta,
        status: statusStyle(r.status).label,
      },
      status: r.status,
    };
  });
  // Compute aggregates for the Notion-style footer strip + downloaded sheet.
  const valueNums = detailRows.map((r) =>
    typeof r.cells.value === 'number' ? r.cells.value : 0,
  );
  const deltaNums = detailRows.map((r) =>
    typeof r.cells.delta === 'number' ? r.cells.delta : 0,
  );
  const mailboxNums = detailRows.map((r) =>
    typeof r.cells.mailboxes === 'number' ? r.cells.mailboxes : 0,
  );
  const sum = (arr: number[]): number => arr.reduce((s, n) => s + n, 0);
  const mean = (arr: number[]): number =>
    arr.length === 0 ? 0 : Math.round((sum(arr) / arr.length) * 10) / 10;
  const max = (arr: number[]): number => (arr.length === 0 ? 0 : Math.max(...arr));
  const detailAggregates: WorkbookSheet['aggregates'] = [
    {
      label: 'Sum',
      values: {
        subClient: '',
        domain: '',
        mailboxes: sum(mailboxNums),
        value: sum(valueNums),
        delta: sum(deltaNums),
        status: '',
      },
    },
    {
      label: 'Mean',
      values: {
        subClient: '',
        domain: '',
        mailboxes: mean(mailboxNums),
        value: mean(valueNums),
        delta: mean(deltaNums),
        status: '',
      },
    },
    {
      label: 'Max',
      values: {
        subClient: '',
        domain: '',
        mailboxes: max(mailboxNums),
        value: max(valueNums),
        delta: max(deltaNums),
        status: '',
      },
    },
  ];
  const detailHeader: Array<string | number> = detailColumns.map((c) => c.label);
  const detailBody: Array<Array<string | number>> = detailRows.map((r) =>
    detailColumns.map((c) => r.cells[c.key] ?? ''),
  );
  const detailAoa: Array<Array<string | number>> = [detailHeader, ...detailBody];

  // -----------------------------------------------------------------------
  // Template sheet — the config snapshot (sections, accent, branding) so the
  // download captures what generated the report. Renders in the Notion table
  // as a two-column key/value plus the accent hex/name appended.
  // -----------------------------------------------------------------------
  const templateColumns: WorkbookColumn[] = [
    { key: 'section', label: 'Section', type: 'text' },
    { key: 'included', label: 'Included', type: 'select' },
  ];
  const templateRows: WorkbookRow[] = [
    ...SECTION_META.map<WorkbookRow>((s) => ({
      cells: { section: s.label, included: state.sections[s.key] ? 'yes' : 'no' },
      status: state.sections[s.key] ? 'good' : 'warn',
    })),
    { cells: { section: '', included: '' } },
    { cells: { section: 'Accent hex', included: accent.hex } },
    { cells: { section: 'Accent name', included: accent.name } },
    {
      cells: {
        section: 'Branding',
        included: state.branding === 'whitelabel' ? 'White-label' : 'Co-brand',
      },
    },
  ];
  const templateAoa: Array<Array<string | number>> = templateRows.map((r) => [
    r.cells.section as string,
    r.cells.included as string,
  ]);

  return {
    filename: buildExportFilename(data.agency.name, state.type, 'xlsx'),
    sheets: [
      {
        name: 'Summary',
        columns: summaryColumns,
        rows: summaryRows,
        rawAoa: summaryAoa,
      },
      {
        name: 'Detail',
        columns: detailColumns,
        rows: detailRows,
        aggregates: detailAggregates,
        rawAoa: detailAoa,
      },
      {
        name: 'Template',
        columns: templateColumns,
        rows: templateRows,
        rawAoa: templateAoa,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// PDF plan builder — single source of truth for the PDF document. Both the
// on-canvas <PdfPreview/> renderer and the real `handlePdf` jsPDF code path
// consume the SAME plan, so what the user sees is what they download.
// ---------------------------------------------------------------------------

interface PdfPlan {
  filename: string;
  accent: AccentSwatch;
  branding: BrandingMode;
  rangeLabel: string;
  sections: Record<SectionKey, boolean>;
  type: ReportType;
  typeMeta: TypeMeta;
  metric: AgencyReportsData['metrics'][ReportType];
  agencyName: string;
  subClientCount: number;
  totalMailboxes: number;
  title: string;
  fontList: string[];
  // Coarse byte-size estimate surfaced in the inspector — purely cosmetic.
  estimatedSizeKb: number;
}

function buildPdfPlan(
  state: InspectorState,
  data: AgencyReportsData,
  accent: AccentSwatch,
  rangeLabel: string,
): PdfPlan {
  const typeMeta = TYPE_LOOKUP[state.type];
  const metric = data.metrics[state.type];
  const totalMailboxes = data.subClients.reduce((s, c) => s + c.mailboxCount, 0);
  // Estimate the PDF size based on which sections are on. Numbers picked so
  // a default config (cover + summary + KPI + trends + footer) lands ~82-95KB,
  // matching the inspector copy.
  const sectionWeights: Record<SectionKey, number> = {
    cover: 9,
    executive: 14,
    kpiTable: 30,
    breakdown: 12,
    trends: 18,
    footer: 4,
  };
  const baseKb = 28;
  const addedKb = SECTION_META.reduce((s, sec) => {
    return s + (state.sections[sec.key] ? sectionWeights[sec.key] : 0);
  }, 0);
  const estimatedSizeKb = baseKb + addedKb;
  return {
    filename: buildExportFilename(data.agency.name, state.type, 'pdf'),
    accent,
    branding: state.branding,
    rangeLabel,
    sections: state.sections,
    type: state.type,
    typeMeta,
    metric,
    agencyName: data.agency.name,
    subClientCount: data.subClients.length,
    totalMailboxes,
    title: `${data.agency.name} · ${typeMeta.label}`,
    fontList: ['Helvetica', 'Times Roman', 'Mono / tabular numerals'],
    estimatedSizeKb,
  };
}

// ---------------------------------------------------------------------------
// Filename helper — keeps both export buttons in lock-step.
// ---------------------------------------------------------------------------

function buildExportFilename(
  agencyName: string,
  typeId: ReportType,
  ext: 'pdf' | 'xlsx',
): string {
  const slug = agencyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${typeId}-${date}.${ext}`;
}

// ---------------------------------------------------------------------------
// Animation primitives.
// ---------------------------------------------------------------------------

const PAGE_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.18, ease: 'easeIn' as const } },
};

const MODE_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.16, ease: 'easeIn' as const } },
};

// ---------------------------------------------------------------------------
// Breadcrumb segment — Linear-style "Reports / Northwind / Warmth Report".
// ---------------------------------------------------------------------------

interface CrumbProps {
  label: string;
  Icon?: typeof Flame;
  current?: boolean;
  emphasized?: boolean;
}

function Crumb({ label, Icon, current = false, emphasized = false }: CrumbProps): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{
        color: current
          ? 'var(--wp-text)'
          : emphasized
            ? 'var(--wp-text-dim)'
            : 'var(--wp-text-faint)',
        fontWeight: current ? 600 : 500,
      }}
    >
      {Icon ? (
        <Icon
          className="h-3.5 w-3.5"
          style={{ color: current ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-faint)' }}
          aria-hidden
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Preview-mode segmented control — [PDF] [XLSX] with a sliding underline
// driven by motion layoutId `m2-mode-slider`. Per spec.
// ---------------------------------------------------------------------------

interface PreviewModeToggleProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
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
      className="inline-flex items-center gap-0.5 rounded-md p-0.5"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
      role="tablist"
      aria-label="Preview mode"
    >
      {options.map((opt) => {
        const isActive = opt.id === mode;
        const Icon = opt.Icon;
        return (
          <motion.button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            whileHover={reducedMotion ? undefined : { y: -0.5 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11.5px] font-semibold"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              zIndex: 1,
            }}
            role="tab"
            aria-selected={isActive}
            aria-label={`${opt.label} preview`}
          >
            {isActive && (
              <motion.span
                layoutId="m2-mode-slider"
                className="absolute inset-0 rounded-[5px]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  boxShadow:
                    '0 3px 10px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
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
// Slim download pill — small icon-led button in the breadcrumb strip.
// Variant decides whether it is the primary orange gradient or a quiet
// neutral outline.
// ---------------------------------------------------------------------------

interface DownloadPillProps {
  variant: 'primary' | 'quiet';
  label: string;
  Icon: typeof Download;
  busy: boolean;
  onClick: () => void;
  reducedMotion: boolean;
}

function DownloadPill({
  variant,
  label,
  Icon,
  busy,
  onClick,
  reducedMotion,
}: DownloadPillProps): JSX.Element {
  const style: CSSProperties =
    variant === 'primary'
      ? {
          background:
            'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
          color: '#fff',
          border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)',
          boxShadow:
            '0 4px 12px color-mix(in srgb, var(--wp-accent, #F26522) 22%, transparent)',
        }
      : {
          background: 'color-mix(in srgb, var(--wp-surface) 78%, transparent)',
          color: 'var(--wp-text-dim)',
          border: '1px solid var(--wp-border)',
        };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileHover={reducedMotion || busy ? undefined : { y: -1 }}
      whileTap={reducedMotion || busy ? undefined : { scale: 0.97 }}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-70"
      style={style}
      aria-label={label}
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
// Left rail group — Linear-sidebar-style labelled group with a 11px mono
// uppercase header and tight contents. No heavy border, just whitespace.
// ---------------------------------------------------------------------------

interface RailGroupProps {
  title: string;
  hint?: string;
  Icon?: typeof Calendar;
  children: ReactNode;
}

function RailGroup({ title, hint, Icon, children }: RailGroupProps): JSX.Element {
  return (
    <section className="px-3.5 py-2">
      <header className="mb-2 flex items-center gap-1.5">
        {Icon ? (
          <Icon
            className="h-3 w-3"
            style={{ color: 'var(--wp-text-faint)' }}
            aria-hidden
          />
        ) : null}
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {title}
        </span>
        {hint ? (
          <span
            className="ml-auto text-[10px]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            {hint}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section toggle row — Linear-style filter list entry. Section icon left,
// label centre, switch right. Subtle hover, no chrome.
// ---------------------------------------------------------------------------

interface SectionToggleRowProps {
  section: SectionMeta;
  on: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
}

function SectionToggleRow({
  section,
  on,
  onToggle,
  reducedMotion,
}: SectionToggleRowProps): JSX.Element {
  const Icon = section.Icon;
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
      style={{
        background: 'transparent',
      }}
    >
      <Icon
        className="h-3.5 w-3.5 flex-shrink-0"
        style={{
          color: on ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-faint)',
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 text-left leading-tight">
        <div
          className="text-[12px] font-medium"
          style={{ color: 'var(--wp-text)' }}
        >
          {section.label}
        </div>
        <div
          className="text-[10.5px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {section.hint}
        </div>
      </div>
      {/* Linear-style switch */}
      <span
        aria-hidden
        className="relative inline-flex h-[18px] w-[30px] flex-shrink-0 items-center rounded-full transition-colors"
        style={{
          background: on
            ? 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))'
            : 'color-mix(in srgb, var(--wp-text-faint) 30%, transparent)',
          padding: '2px',
        }}
      >
        <motion.span
          className="block h-[14px] w-[14px] rounded-full"
          style={{ background: '#fff' }}
          animate={{ x: on ? 12 : 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 420, damping: 28 }
          }
        />
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Quick switcher pill — soft outlined pill, current orange-tinted. Used for
// the report-type quick switch at the very top of the left rail.
// ---------------------------------------------------------------------------

interface QuickSwitcherProps {
  active: ReportType;
  onSelect: (id: ReportType) => void;
  reducedMotion: boolean;
}

function QuickSwitcher({ active, onSelect, reducedMotion }: QuickSwitcherProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {TYPE_META.map((meta) => {
        const isActive = meta.id === active;
        const Icon = meta.Icon;
        return (
          <motion.button
            key={meta.id}
            type="button"
            onClick={() => onSelect(meta.id)}
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors"
            style={{
              color: isActive ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-dim)',
              background: isActive
                ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)'
                : 'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
              border: isActive
                ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 38%, transparent)'
                : '1px solid var(--wp-border)',
            }}
          >
            <Icon className="h-3 w-3" aria-hidden />
            <span>{meta.short}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trends chart — inline SVG bar chart, mirrors the chart drawn into the PDF.
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
  const localMax = Math.max(...rows.map((r) => Math.max(r.value, 1)), 1);
  const barAreaW = width - padX * 2;
  const barAreaH = height - padTop - padBottom;
  const slotW = barAreaW / rows.length;
  const barW = Math.min(slotW * 0.55, 50);

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
        const barH = (row.value / localMax) * barAreaH;
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
// PDF preview — A4 paper canvas. Reads from a `PdfPlan` so the on-screen
// preview is byte-equivalent to what the real `handlePdf` writes.
// ---------------------------------------------------------------------------

interface PdfPreviewProps {
  plan: PdfPlan;
}

function PdfPreview({ plan }: PdfPreviewProps): JSX.Element {
  const accentHex = plan.accent.hex;
  const TypeIcon = plan.typeMeta.Icon;
  const isWhiteLabel = plan.branding === 'whitelabel';
  const metric = plan.metric;
  return (
    <div className="flex flex-col gap-5 px-12 py-10">
      {/* Cover */}
      <AnimatePresence initial={false}>
        {plan.sections.cover && (
          <motion.section
            key="cover"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="show"
            exit="exit"
            className="overflow-hidden rounded-lg"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <div
              className="px-7 py-5 text-white"
              style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex}cc)` }}
            >
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] opacity-90">
                <span>
                  {isWhiteLabel
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
              style={{ background: `linear-gradient(90deg, ${accentHex}, transparent)` }}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Executive summary */}
      <AnimatePresence initial={false}>
        {plan.sections.executive && (
          <motion.section
            key="executive"
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
              {metric.pullQuote}
            </p>
            <div
              className="mt-3 grid grid-cols-4 gap-2"
              style={{ color: '#1f1410' }}
            >
              {[
                { k: 'Total', v: metric.summary.total },
                { k: 'Average', v: metric.summary.avg },
                { k: 'High', v: metric.summary.high },
                { k: 'Low', v: metric.summary.low },
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
        )}
      </AnimatePresence>

      {/* KPI table — what autoTable will draw */}
      <AnimatePresence initial={false}>
        {plan.sections.kpiTable && (
          <motion.section
            key="kpi"
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
            <table className="w-full border-collapse text-[12px]" style={{ color: '#1f1410' }}>
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
                {metric.rows.map((row, i) => {
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
        )}
      </AnimatePresence>

      {/* Per sub-client breakdown */}
      <AnimatePresence initial={false}>
        {plan.sections.breakdown && (
          <motion.section
            key="breakdown"
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
              {metric.rows.map((row) => {
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* Trends chart */}
      <AnimatePresence initial={false}>
        {plan.sections.trends && (
          <motion.section
            key="trends"
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
              <TrendsChart rows={metric.rows} accentHex={accentHex} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Footer */}
      <AnimatePresence initial={false}>
        {plan.sections.footer && (
          <motion.footer
            key="footer"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="show"
            exit="exit"
            className="mt-2 flex items-center justify-between border-t pt-3 text-[10.5px]"
            style={{ borderColor: 'rgba(0,0,0,0.08)', color: '#6a5448' }}
          >
            <span>
              {isWhiteLabel
                ? `${plan.agencyName} · Confidential`
                : `${plan.agencyName} · Powered by WarmPulse`}
            </span>
            <span>Page 1 of 1</span>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column-type icon — small lucide glyph next to the header label, mimicking
// Notion's table column-type indicators (text / number / select).
// ---------------------------------------------------------------------------

function ColumnTypeIcon({ type }: { type: ColumnType }): JSX.Element {
  if (type === 'number') {
    return (
      <Hash
        className="h-3 w-3 flex-shrink-0"
        style={{ color: 'var(--wp-text-faint)' }}
        aria-hidden
      />
    );
  }
  if (type === 'select') {
    return (
      <CircleDot
        className="h-3 w-3 flex-shrink-0"
        style={{ color: 'var(--wp-text-faint)' }}
        aria-hidden
      />
    );
  }
  return (
    <Type
      className="h-3 w-3 flex-shrink-0"
      style={{ color: 'var(--wp-text-faint)' }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Notion-style sheet selector — horizontal segmented control. Sheet icon +
// sheet name + row count. Active sheet has orange underline accent driven by
// motion layoutId `m2-sheet-underline`. Per spec.
// ---------------------------------------------------------------------------

interface SheetSelectorProps {
  active: SheetName;
  onChange: (s: SheetName) => void;
  workbook: Workbook;
  reducedMotion: boolean;
}

function SheetSelector({
  active,
  onChange,
  workbook,
  reducedMotion,
}: SheetSelectorProps): JSX.Element {
  return (
    <div
      className="flex items-stretch gap-0 border-b px-1"
      style={{ borderColor: 'var(--wp-border)' }}
      role="tablist"
      aria-label="Workbook sheets"
    >
      {SHEET_NAMES.map((name) => {
        const sheet = workbook.sheets.find((s) => s.name === name);
        const rowCount = sheet?.rows.length ?? 0;
        const isActive = name === active;
        return (
          <motion.button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            whileHover={reducedMotion ? undefined : { y: -0.5 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            className="relative inline-flex items-center gap-1.5 px-3 py-2 text-[12px] transition-colors"
            style={{
              color: isActive ? 'var(--wp-text)' : 'var(--wp-text-faint)',
              fontWeight: isActive ? 600 : 500,
              background: 'transparent',
            }}
            role="tab"
            aria-selected={isActive}
          >
            <SheetIcon
              className="h-3.5 w-3.5"
              style={{
                color: isActive
                  ? 'var(--wp-accent, #F26522)'
                  : 'var(--wp-text-faint)',
              }}
              aria-hidden
            />
            <span>{name}</span>
            <span
              className="font-mono text-[10px]"
              style={{
                color: isActive
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 65%, transparent)'
                  : 'var(--wp-text-faint)',
              }}
            >
              {rowCount}
            </span>
            {isActive ? (
              <motion.span
                layoutId="m2-sheet-underline"
                className="absolute -bottom-px left-2 right-2 h-[2px] rounded-full"
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
  );
}

// ---------------------------------------------------------------------------
// Notion-style table row — renders one body row of the polished spreadsheet
// preview. Hover highlights with orange `var(--wp-accent) 6%`, numbers right-
// aligned with mono tabular numerals, status cells render as colored pill
// chips, delta column gets inline ▲/▼ arrows.
// ---------------------------------------------------------------------------

interface XlsxBodyRowProps {
  row: WorkbookRow;
  columns: WorkbookColumn[];
  zebra: boolean;
  reducedMotion: boolean;
}

function XlsxBodyRow({
  row,
  columns,
  zebra,
  reducedMotion,
}: XlsxBodyRowProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const baseBg = hovered
    ? 'color-mix(in srgb, var(--wp-accent, #F26522) 6%, transparent)'
    : zebra
      ? 'color-mix(in srgb, var(--wp-text-faint) 3%, transparent)'
      : 'transparent';
  return (
    <motion.tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ backgroundColor: baseBg }}
      transition={
        reducedMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }
      }
      style={{
        borderBottom: '1px solid color-mix(in srgb, var(--wp-text-faint) 12%, transparent)',
        height: 44,
      }}
    >
      {/* Slim drag handle on hover (visual only) */}
      <td
        className="w-6 px-1.5"
        style={{
          textAlign: 'center',
        }}
      >
        <motion.span
          animate={{ opacity: hovered ? 0.6 : 0 }}
          transition={
            reducedMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }
          }
        >
          <GripVertical
            className="h-3.5 w-3.5"
            style={{ color: 'var(--wp-text-faint)' }}
            aria-hidden
          />
        </motion.span>
      </td>
      {columns.map((col) => {
        const v = row.cells[col.key];
        const isNumber = col.type === 'number';
        const isSelect = col.type === 'select';
        const isStatusCell = col.key === 'status';
        const isIncludedCell = col.key === 'included';
        const numericText =
          typeof v === 'number'
            ? col.isDelta
              ? `${v >= 0 ? '+' : ''}${v}`
              : String(v)
            : v === undefined
              ? ''
              : String(v);
        if (isStatusCell && row.status) {
          const s = statusStyle(row.status);
          return (
            <td
              key={col.key}
              className="px-3 py-2 text-left"
              style={{ verticalAlign: 'middle' }}
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  color: s.text,
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: s.text }}
                  aria-hidden
                />
                {s.label}
              </span>
            </td>
          );
        }
        if (isIncludedCell) {
          const yes = String(v) === 'yes';
          return (
            <td
              key={col.key}
              className="px-3 py-2 text-left"
              style={{ verticalAlign: 'middle' }}
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  color: yes
                    ? 'var(--wp-accent, #F26522)'
                    : 'var(--wp-text-faint)',
                  background: yes
                    ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)'
                    : 'color-mix(in srgb, var(--wp-text-faint) 12%, transparent)',
                  border: yes
                    ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)'
                    : '1px solid color-mix(in srgb, var(--wp-text-faint) 24%, transparent)',
                }}
              >
                {yes ? <Check className="h-3 w-3" aria-hidden /> : null}
                {String(v)}
              </span>
            </td>
          );
        }
        if (isNumber && col.isDelta && typeof v === 'number') {
          const positive = v >= 0;
          const ArrowIcon = positive ? ArrowUpRight : ArrowDownRight;
          const color = positive
            ? 'var(--wp-success, #4ade80)'
            : 'var(--wp-danger, #ff6b6b)';
          return (
            <td
              key={col.key}
              className="px-3 py-2"
              style={{
                textAlign: 'right',
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontVariantNumeric: 'tabular-nums',
                color,
                verticalAlign: 'middle',
              }}
            >
              <span className="inline-flex items-center gap-1">
                <ArrowIcon className="h-3 w-3" aria-hidden />
                {`${positive ? '+' : ''}${v}`}
              </span>
            </td>
          );
        }
        return (
          <td
            key={col.key}
            className="px-3 py-2"
            style={{
              textAlign: isNumber ? 'right' : 'left',
              fontFamily: isNumber
                ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                : 'inherit',
              fontVariantNumeric: isNumber ? 'tabular-nums' : 'normal',
              color: row.emphasis ? 'var(--wp-text)' : 'var(--wp-text)',
              fontWeight: row.emphasis ? 600 : isSelect ? 500 : 400,
              verticalAlign: 'middle',
              whiteSpace: 'nowrap',
            }}
          >
            {numericText}
          </td>
        );
      })}
    </motion.tr>
  );
}

// ---------------------------------------------------------------------------
// Notion-style XLSX preview — workbook header card + sheet selector + the
// polished table + aggregate footer strip. The DOM mirrors the rawAoa
// structure 1:1 so what's seen here is exactly what `XLSX.writeFile` ships.
// ---------------------------------------------------------------------------

interface XlsxPreviewProps {
  workbook: Workbook;
  activeSheet: SheetName;
  onChangeSheet: (s: SheetName) => void;
  generatedAt: Date;
  reducedMotion: boolean;
  state: InspectorState;
  rangeLabel: string;
}

function XlsxPreview({
  workbook,
  activeSheet,
  onChangeSheet,
  generatedAt,
  reducedMotion,
  state,
  rangeLabel,
}: XlsxPreviewProps): JSX.Element {
  const sheet = workbook.sheets.find((s) => s.name === activeSheet) ?? workbook.sheets[0]!;
  const totalRows = workbook.sheets.reduce((s, sh) => s + sh.rows.length, 0);
  return (
    <div
      className="flex h-full min-h-full flex-col"
      style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)' }}
    >
      {/* Workbook header card */}
      <div
        className="px-8 pt-8 pb-4"
        style={{
          borderBottom: '1px solid var(--wp-border)',
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md"
            style={{
              background:
                'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
              color: '#fff',
            }}
          >
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h1
              className="truncate text-[20px] font-bold tracking-tight"
              style={{ color: 'var(--wp-text)' }}
            >
              {`${TYPE_LOOKUP[state.type].label} · ${rangeLabel}`}
            </h1>
            <div
              className="mt-0.5 truncate font-mono text-[12px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {workbook.filename}
            </div>
            <div
              className="mt-1.5 flex items-center gap-2 text-[11.5px]"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  background:
                    'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 24%, transparent)',
                  color: 'var(--wp-accent, #F26522)',
                }}
              >
                <Database className="h-3 w-3" aria-hidden />
                {workbook.sheets.length} sheets
              </span>
              <span aria-hidden>·</span>
              <span>
                <span className="font-mono">{totalRows}</span> rows
              </span>
              <span aria-hidden>·</span>
              <span>
                Generated{' '}
                {generatedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sheet selector */}
      <SheetSelector
        active={activeSheet}
        onChange={onChangeSheet}
        workbook={workbook}
        reducedMotion={reducedMotion}
      />

      {/* Notion-style table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <table
          className="w-full border-collapse"
          style={{
            tableLayout: 'auto',
            color: 'var(--wp-text)',
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom:
                  '1px solid color-mix(in srgb, var(--wp-text-faint) 18%, transparent)',
              }}
            >
              {/* Spacer for drag handle column */}
              <th
                className="w-6"
                aria-hidden
                style={{ background: 'transparent' }}
              />
              {sheet.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    color: 'var(--wp-text-dim)',
                    textAlign: col.type === 'number' ? 'right' : 'left',
                    verticalAlign: 'middle',
                    background: 'transparent',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      flexDirection: col.type === 'number' ? 'row-reverse' : 'row',
                    }}
                  >
                    <ColumnTypeIcon type={col.type} />
                    <span style={{ letterSpacing: '0.04em' }}>{col.label}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, i) => (
              <XlsxBodyRow
                key={i}
                row={row}
                columns={sheet.columns}
                zebra={i % 2 === 1}
                reducedMotion={reducedMotion}
              />
            ))}
          </tbody>
        </table>

        {/* Aggregate strip — sits below the table with a thicker divider above. */}
        {sheet.aggregates && sheet.aggregates.length > 0 ? (
          <div
            className="mt-1"
            style={{
              borderTop:
                '2px solid color-mix(in srgb, var(--wp-accent, #F26522) 22%, transparent)',
            }}
          >
            <table
              className="w-full border-collapse"
              style={{
                tableLayout: 'auto',
                fontSize: 12.5,
              }}
            >
              <tbody>
                {sheet.aggregates.map((agg, aggIdx) => (
                  <tr
                    key={agg.label}
                    style={{
                      borderBottom:
                        aggIdx === (sheet.aggregates?.length ?? 0) - 1
                          ? 'none'
                          : '1px dashed color-mix(in srgb, var(--wp-text-faint) 14%, transparent)',
                    }}
                  >
                    <td className="w-6" aria-hidden />
                    {sheet.columns.map((col, colIdx) => {
                      const v = agg.values[col.key];
                      const isFirstCol = colIdx === 0;
                      if (isFirstCol) {
                        return (
                          <td
                            key={col.key}
                            className="px-3 py-2"
                            style={{
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontSize: 10.5,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'var(--wp-accent, #F26522)',
                            }}
                          >
                            {agg.label}
                          </td>
                        );
                      }
                      const isNumber = col.type === 'number';
                      const text =
                        typeof v === 'number'
                          ? col.isDelta
                            ? `${v >= 0 ? '+' : ''}${v}`
                            : String(v)
                          : v === undefined
                            ? ''
                            : String(v);
                      return (
                        <td
                          key={col.key}
                          className="px-3 py-2"
                          style={{
                            textAlign: isNumber ? 'right' : 'left',
                            fontFamily: isNumber
                              ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                              : 'inherit',
                            fontVariantNumeric: isNumber ? 'tabular-nums' : 'normal',
                            color: 'var(--wp-text)',
                            fontWeight: 600,
                          }}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Hint footer — Notion documents always have a quiet caption strip below. */}
        <div
          className="mt-4 flex items-center gap-2 text-[10.5px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          <Database className="h-3 w-3" aria-hidden />
          <span>{`${activeSheet} sheet · ${sheet.rows.length} rows · `}</span>
          <span>
            Identical to the data shipped by{' '}
            <span
              className="font-mono"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              XLSX.writeFile
            </span>{' '}
            on Download XLSX
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — discreet floating panel. Two modes: page details for the
// PDF and workbook details for the XLSX. Per spec, much slimmer than M1.
// ---------------------------------------------------------------------------

interface RightInspectorProps {
  mode: PreviewMode;
  workbook: Workbook;
  plan: PdfPlan;
  generatedAt: Date;
  totalMailboxes: number;
}

function RightInspector({
  mode,
  workbook,
  plan,
  generatedAt,
  totalMailboxes,
}: RightInspectorProps): JSX.Element {
  return (
    <aside
      className="flex flex-col gap-4 px-4 py-5"
      style={{
        width: 240,
        flexShrink: 0,
        borderLeft: '1px solid var(--wp-border)',
        background: 'color-mix(in srgb, var(--wp-surface) 18%, transparent)',
        overflowY: 'auto',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'pdf' ? (
          <motion.div
            key="pdf-inspect"
            variants={MODE_VARIANTS}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex flex-col gap-3"
          >
            <header className="flex items-center gap-1.5">
              <FileText
                className="h-3.5 w-3.5"
                style={{ color: 'var(--wp-accent, #F26522)' }}
                aria-hidden
              />
              <h3
                className="font-mono text-[10.5px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                Page details
              </h3>
            </header>
            <dl className="space-y-2 text-[11.5px]">
              <DetailRow label="Format" value="A4 portrait" />
              <DetailRow label="Margin" value="40pt" />
              <DetailRow
                label="Est. size"
                value={`~${plan.estimatedSizeKb} KB`}
              />
              <DetailRow
                label="Title"
                value={plan.title}
                truncate
              />
              <DetailRow
                label="Subject"
                value={plan.typeMeta.label}
              />
              <DetailRow
                label="Range"
                value={plan.rangeLabel}
              />
              <DetailRow
                label="Sub-clients"
                value={`${plan.subClientCount}`}
              />
              <DetailRow
                label="Mailboxes"
                value={`${totalMailboxes}`}
              />
              <DetailRow
                label="Branding"
                value={
                  plan.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand'
                }
              />
            </dl>
            <div
              className="rounded-md p-2.5"
              style={{
                background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
                border: '1px solid var(--wp-border)',
              }}
            >
              <div
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                <Type className="h-3 w-3" aria-hidden />
                Fonts in use
              </div>
              <ul className="space-y-1">
                {plan.fontList.map((f) => (
                  <li
                    key={f}
                    className="font-mono text-[11px]"
                    style={{ color: 'var(--wp-text-dim)' }}
                  >
                    · {f}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="rounded-md p-2.5"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
                border:
                  '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 24%, transparent)',
              }}
            >
              <div
                className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--wp-accent, #F26522)' }}
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Exact match
              </div>
              <p
                className="text-[11px] leading-snug"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                Preview reads the same plan jsPDF + autoTable consume on
                Download PDF — what you see is what ships.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="xlsx-inspect"
            variants={MODE_VARIANTS}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex flex-col gap-3"
          >
            <header className="flex items-center gap-1.5">
              <FileSpreadsheet
                className="h-3.5 w-3.5"
                style={{ color: 'var(--wp-accent, #F26522)' }}
                aria-hidden
              />
              <h3
                className="font-mono text-[10.5px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                Workbook details
              </h3>
            </header>
            <div
              className="rounded-md p-2.5"
              style={{
                background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
                border: '1px solid var(--wp-border)',
              }}
            >
              <div
                className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                <SheetIcon className="h-3 w-3" aria-hidden />
                Sheets
              </div>
              <ul className="space-y-1.5">
                {workbook.sheets.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between text-[11.5px]"
                  >
                    <span style={{ color: 'var(--wp-text)' }}>{s.name}</span>
                    <span
                      className="font-mono text-[10.5px]"
                      style={{ color: 'var(--wp-text-faint)' }}
                    >
                      {s.rows.length} rows · {s.columns.length} cols
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <dl className="space-y-2 text-[11.5px]">
              <DetailRow
                label="Extension"
                value=".xlsx"
                chip
              />
              <DetailRow
                label="Engine"
                value="SheetJS"
              />
              <DetailRow
                label="Filename"
                value={workbook.filename}
                truncate
                mono
              />
              <DetailRow
                label="Generated"
                value={generatedAt.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
                mono
              />
            </dl>
            <div
              className="rounded-md p-2.5"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
                border:
                  '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 24%, transparent)',
              }}
            >
              <div
                className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: 'var(--wp-accent, #F26522)' }}
              >
                <Sparkles className="h-3 w-3" aria-hidden />
                Exact match
              </div>
              <p
                className="text-[11px] leading-snug"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                Every cell above is the data XLSX.writeFile ships on
                Download XLSX — preview and artifact stay byte-equal.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// DetailRow — inspector key/value line. Optional chip / mono / truncation.
// ---------------------------------------------------------------------------

interface DetailRowProps {
  label: string;
  value: string;
  chip?: boolean;
  mono?: boolean;
  truncate?: boolean;
}

function DetailRow({
  label,
  value,
  chip = false,
  mono = false,
  truncate = false,
}: DetailRowProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt
        className="flex-shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </dt>
      {chip ? (
        <dd>
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
            style={{
              color: 'var(--wp-accent, #F26522)',
              background:
                'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
              border:
                '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
            }}
          >
            {value}
          </span>
        </dd>
      ) : (
        <dd
          className={
            'min-w-0 flex-1 text-right text-[11.5px]' +
            (truncate ? ' truncate' : '')
          }
          style={{
            color: 'var(--wp-text)',
            fontFamily: mono
              ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
              : 'inherit',
          }}
          title={truncate ? value : undefined}
        >
          {value}
        </dd>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRptM2Workspace({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const reducedMotion = useReducedMotion() ?? false;

  const initialState = useMemo(() => buildInitialState('warmth'), []);
  const [state, setState] = useState<InspectorState>(initialState);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');
  const [activeSheet, setActiveSheet] = useState<SheetName>('Summary');
  const generatedAt = useMemo(() => new Date(), []);

  const accent: AccentSwatch =
    ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;

  const isDirty = useMemo(
    () => !isStateEqual(state, initialState) || savedAt !== null,
    [state, initialState, savedAt],
  );

  const totalMailboxes = useMemo(
    () => d.subClients.reduce((s, c) => s + c.mailboxCount, 0),
    [d.subClients],
  );

  // -------------------------------------------------------------------------
  // Shared workbook + pdf plan — recomputed whenever any control changes, so
  // the preview component and the export handlers always agree.
  // -------------------------------------------------------------------------

  const workbook = useMemo(
    () => buildXlsxWorkbook(state, d, accent, rangeMeta.label),
    [state, d, accent, rangeMeta.label],
  );
  const pdfPlan = useMemo(
    () => buildPdfPlan(state, d, accent, rangeMeta.label),
    [state, d, accent, rangeMeta.label],
  );

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleTypeChange = useCallback((typeId: ReportType) => {
    setState((prev) => ({ ...prev, type: typeId }));
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

  const handleSaveTemplate = useCallback(() => {
    setSavedAt(new Date());
    toast.success('Template saved');
  }, []);

  // -------------------------------------------------------------------------
  // REAL PDF export — jsPDF + jspdf-autotable. Reads from `pdfPlan` so what
  // ships matches what the preview renders.
  // -------------------------------------------------------------------------

  const handlePdf = useCallback(() => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const plan = pdfPlan;
      const accentRgb = plan.accent.rgb;
      const metric = plan.metric;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = 0;

      if (plan.sections.cover) {
        doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.rect(0, 0, pageW, 60, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
          (plan.branding === 'whitelabel'
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
      } else {
        cursorY = margin;
        doc.setTextColor(31, 20, 16);
        doc.setFontSize(20);
        doc.setFont('times', 'bold');
        doc.text(plan.title, margin, cursorY);
        cursorY += 24;
      }

      if (plan.sections.executive) {
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
      }

      if (plan.sections.kpiTable) {
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
      }

      if (plan.sections.breakdown) {
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
      }

      if (plan.sections.trends && cursorY < 740) {
        doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('TRENDS', margin, cursorY);
        cursorY += 10;
        const localMax = Math.max(...metric.rows.map((r) => r.value), 1);
        const chartH = 60;
        const chartW = pageW - margin * 2;
        const slotW = chartW / metric.rows.length;
        const barW = Math.min(slotW * 0.55, 36);
        doc.setDrawColor(180, 170, 162);
        doc.line(margin, cursorY + chartH, pageW - margin, cursorY + chartH);
        metric.rows.forEach((r, i) => {
          const h = (r.value / localMax) * chartH;
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

      if (plan.sections.footer) {
        doc.setTextColor(106, 84, 72);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const footerText =
          plan.branding === 'whitelabel'
            ? `${plan.agencyName} · Confidential`
            : `${plan.agencyName} · Powered by WarmPulse`;
        doc.text(footerText, margin, 820);
        doc.text('Page 1 of 1', pageW - margin, 820, { align: 'right' });
      }

      doc.save(plan.filename);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF export failed', err);
      toast.error('PDF export failed — check console');
    } finally {
      window.setTimeout(() => setPdfBusy(false), 380);
    }
  }, [pdfBusy, pdfPlan]);

  // -------------------------------------------------------------------------
  // REAL XLSX export — xlsx workbook with Summary + Detail + Template sheets.
  // Reads the same `workbook` the on-screen preview renders.
  // -------------------------------------------------------------------------

  const handleXlsx = useCallback(() => {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      const wb = XLSX.utils.book_new();
      for (const sheet of workbook.sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rawAoa);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      }
      XLSX.writeFile(wb, workbook.filename);
      toast.success('XLSX downloaded');
    } catch (err) {
      console.error('XLSX export failed', err);
      toast.error('XLSX export failed — check console');
    } finally {
      window.setTimeout(() => setXlsxBusy(false), 380);
    }
  }, [xlsxBusy, workbook]);

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
          'radial-gradient(900px 500px at 22% -10%, color-mix(in srgb, var(--wp-accent, #F26522) 7%, transparent), transparent 60%), var(--wp-bg)',
        color: 'var(--wp-text)',
        minHeight: '100vh',
      }}
    >
      {/* ───── Breadcrumb strip (sticky, ~44px) ───── */}
      <header
        className="sticky top-0 z-30 flex items-center gap-4 border-b px-5"
        style={{
          height: 44,
          background: 'color-mix(in srgb, var(--wp-bg) 88%, transparent)',
          borderColor: 'var(--wp-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Crumb label="Reports" Icon={FileText} />
          <ChevronRight
            className="h-3 w-3"
            style={{ color: 'var(--wp-text-faint)' }}
            aria-hidden
          />
          <Crumb label={d.agency.name} emphasized />
          <ChevronRight
            className="h-3 w-3"
            style={{ color: 'var(--wp-text-faint)' }}
            aria-hidden
          />
          <Crumb label={typeMeta.label} Icon={typeMeta.Icon} current />
        </div>

        {/* Last saved + dirty dot */}
        <div className="ml-3 flex min-w-0 items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: isDirty
                ? 'var(--wp-accent, #F26522)'
                : 'color-mix(in srgb, var(--wp-success, #4ade80) 70%, transparent)',
              boxShadow: isDirty
                ? '0 0 8px color-mix(in srgb, var(--wp-accent, #F26522) 60%, transparent)'
                : 'none',
            }}
            aria-hidden
          />
          <span
            className="text-[10.5px]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            {isDirty
              ? 'Modified'
              : savedAt
                ? `Saved ${savedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Auto-saved'}
          </span>
        </div>

        {/* Right side — preview mode + downloads */}
        <div className="ml-auto flex items-center gap-2">
          <PreviewModeToggle
            mode={previewMode}
            onChange={setPreviewMode}
            reducedMotion={reducedMotion}
          />
          <span
            className="h-5 w-px"
            style={{ background: 'var(--wp-border)' }}
            aria-hidden
          />
          <DownloadPill
            variant="quiet"
            label="PDF"
            Icon={FileText}
            busy={pdfBusy}
            onClick={handlePdf}
            reducedMotion={reducedMotion}
          />
          <DownloadPill
            variant="primary"
            label="XLSX"
            Icon={Download}
            busy={xlsxBusy}
            onClick={handleXlsx}
            reducedMotion={reducedMotion}
          />
        </div>
      </header>

      {/* ───── Main 3-pane area ───── */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT RAIL — Linear-style sidebar */}
        <aside
          className="flex flex-shrink-0 flex-col gap-0 overflow-y-auto py-2"
          style={{
            width: 320,
            borderRight: '1px solid var(--wp-border)',
            background: 'color-mix(in srgb, var(--wp-surface) 22%, transparent)',
          }}
        >
          {/* Quick switcher */}
          <RailGroup title="Report" Icon={Sparkles}>
            <QuickSwitcher
              active={state.type}
              onSelect={handleTypeChange}
              reducedMotion={reducedMotion}
            />
            <p
              className="mt-2 text-[11px] leading-snug"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {typeMeta.description}
            </p>
          </RailGroup>

          <span
            className="mx-3 my-1 block h-px"
            style={{ background: 'var(--wp-border)' }}
            aria-hidden
          />

          {/* Sections */}
          <RailGroup title="Sections" hint={`${Object.values(state.sections).filter(Boolean).length} / ${SECTION_META.length}`} Icon={LayoutGrid}>
            <ul className="-mx-1 space-y-0">
              {SECTION_META.map((sec) => (
                <li key={sec.key}>
                  <SectionToggleRow
                    section={sec}
                    on={state.sections[sec.key]}
                    onToggle={() => handleSectionToggle(sec.key)}
                    reducedMotion={reducedMotion}
                  />
                </li>
              ))}
            </ul>
          </RailGroup>

          <span
            className="mx-3 my-1 block h-px"
            style={{ background: 'var(--wp-border)' }}
            aria-hidden
          />

          {/* Style — accent + branding */}
          <RailGroup title="Style" hint={accent.name} Icon={Palette}>
            <div className="mb-3 flex items-center gap-2">
              {ACCENT_SWATCHES.map((sw, i) => {
                const isActive = i === state.accentIndex;
                return (
                  <button
                    key={sw.hex}
                    type="button"
                    onClick={() => handleAccentSelect(i)}
                    title={`${sw.name} · ${sw.hex}`}
                    className="relative h-5 w-5 rounded-full transition-transform"
                    style={{
                      background: sw.hex,
                      transform: isActive ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: isActive
                        ? `0 0 0 2px var(--wp-bg), 0 0 0 3px ${sw.hex}`
                        : '0 0 0 1px rgba(0,0,0,0.10) inset',
                    }}
                    aria-label={`Accent ${sw.name}`}
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
            <div className="space-y-1.5">
              {[
                {
                  id: 'cobrand' as const,
                  label: 'WarmPulse co-brand',
                  Icon: Sparkles,
                },
                {
                  id: 'whitelabel' as const,
                  label: 'White-label only',
                  Icon: Crown,
                },
              ].map((opt) => {
                const isActive = opt.id === state.branding;
                const OptIcon = opt.Icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleBrandingChange(opt.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
                    style={{
                      background: isActive
                        ? 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)'
                        : '1px solid transparent',
                    }}
                  >
                    <span
                      className="inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: isActive
                          ? 'var(--wp-accent, #F26522)'
                          : 'transparent',
                        border: isActive
                          ? '1px solid var(--wp-accent, #F26522)'
                          : '1px solid var(--wp-text-faint)',
                      }}
                      aria-hidden
                    >
                      {isActive ? (
                        <span
                          className="h-1 w-1 rounded-full"
                          style={{ background: '#fff' }}
                        />
                      ) : null}
                    </span>
                    <OptIcon
                      className="h-3.5 w-3.5"
                      style={{
                        color: isActive
                          ? 'var(--wp-accent, #F26522)'
                          : 'var(--wp-text-faint)',
                      }}
                      aria-hidden
                    />
                    <span
                      className="text-[12px]"
                      style={{
                        color: isActive
                          ? 'var(--wp-text)'
                          : 'var(--wp-text-dim)',
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </RailGroup>

          <span
            className="mx-3 my-1 block h-px"
            style={{ background: 'var(--wp-border)' }}
            aria-hidden
          />

          {/* Date range */}
          <RailGroup title="Range" Icon={CalendarRange}>
            <div
              className="inline-flex w-full items-stretch rounded-md p-0.5"
              style={{
                background: 'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
                border: '1px solid var(--wp-border)',
              }}
              role="tablist"
              aria-label="Date range"
            >
              {DATE_RANGES.map((rng) => {
                const isActive = rng.id === state.range;
                return (
                  <motion.button
                    key={rng.id}
                    type="button"
                    onClick={() => handleRangeChange(rng.id)}
                    whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                    className="relative flex-1 rounded-[5px] py-1 text-[11.5px] font-medium transition-colors"
                    style={{
                      color: isActive ? '#fff' : 'var(--wp-text-dim)',
                    }}
                    role="tab"
                    aria-selected={isActive}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="m2-range-slider"
                        className="absolute inset-0 rounded-[5px]"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                          zIndex: -1,
                        }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative">{rng.short}</span>
                  </motion.button>
                );
              })}
            </div>
          </RailGroup>

          {/* Save template */}
          <div className="mt-auto px-3.5 pt-3">
            <motion.button
              type="button"
              onClick={handleSaveTemplate}
              whileHover={reducedMotion ? undefined : { y: -1 }}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
                color: 'var(--wp-accent, #F26522)',
                border:
                  '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)',
              }}
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save template
            </motion.button>
          </div>
        </aside>

        {/* CENTER PREVIEW + RIGHT INSPECTOR */}
        <main
          className="flex min-w-0 flex-1 flex-row"
          style={{
            background:
              'radial-gradient(700px 360px at 50% -20%, color-mix(in srgb, var(--wp-accent, #F26522) 4%, transparent), transparent 60%)',
          }}
        >
          {/* Center preview */}
          <section
            className="flex min-w-0 flex-1 flex-col overflow-y-auto"
            style={{ background: 'transparent' }}
          >
            <div className="flex justify-center px-8 py-8">
              <div style={{ width: '100%', maxWidth: 880 }}>
                <AnimatePresence mode="wait" initial={false}>
                  {previewMode === 'pdf' ? (
                    <motion.div
                      key="pdf-paper"
                      variants={MODE_VARIANTS}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      className="relative overflow-hidden rounded-lg"
                      style={{
                        background: '#fffaf6',
                        color: '#1f1410',
                        boxShadow:
                          '0 24px 64px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.06)',
                        minHeight: 1100,
                      }}
                    >
                      <PdfPreview plan={pdfPlan} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="xlsx-table"
                      variants={MODE_VARIANTS}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      className="relative overflow-hidden rounded-lg"
                      style={{
                        background: 'var(--wp-bg)',
                        color: 'var(--wp-text)',
                        boxShadow:
                          '0 24px 64px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.20), 0 0 0 1px var(--wp-border)',
                        minHeight: 800,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <XlsxPreview
                        workbook={workbook}
                        activeSheet={activeSheet}
                        onChangeSheet={setActiveSheet}
                        generatedAt={generatedAt}
                        reducedMotion={reducedMotion}
                        state={state}
                        rangeLabel={rangeMeta.label}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Below-preview quiet hint */}
                <div
                  className="mt-4 flex items-center justify-center gap-2 text-[10.5px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  {previewMode === 'pdf' ? (
                    <span>
                      A4 portrait · {pdfPlan.estimatedSizeKb} KB est. · same data ships on
                      Download PDF
                    </span>
                  ) : (
                    <span>
                      3 sheets · {workbook.sheets.reduce((s, sh) => s + sh.rows.length, 0)} rows ·
                      same data ships on Download XLSX
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Right inspector */}
          <RightInspector
            mode={previewMode}
            workbook={workbook}
            plan={pdfPlan}
            generatedAt={generatedAt}
            totalMailboxes={totalMailboxes}
          />
        </main>
      </div>
    </motion.div>
  );
}

export default AgRptM2Workspace;
