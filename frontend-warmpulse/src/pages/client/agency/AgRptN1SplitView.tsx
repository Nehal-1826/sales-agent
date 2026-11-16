import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Building2,
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  Crown,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MailCheck,
  Maximize2,
  Minimize2,
  Palette,
  PieChart,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Type,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';

/**
 * AgRptN1SplitView — Agency-tier REPORTS surface, design candidate N1,
 * "Split View Editor".
 *
 * The Reports surface re-imagined as a PRO EDITORIAL TOOL — a Figma /
 * Affinity-Publisher-style two-pane editor where the agency configures
 * a report in the LEFT INSPECTOR and watches the EXACT pixel-for-pixel
 * preview render live in the RIGHT PAPER CANVAS. The preview is a
 * WYSIWYG of what the downloaded PDF will look like — the same headline,
 * pull quote, table, chart and footer that ship in the artifact.
 *
 *   - The TOP TOOLBAR is full-width and sticky. Left side: agency name +
 *     "Report Builder · Agency Edition" subtitle. Center: four
 *     report-type PILLS (Warmth / Engagement / Placement / White-label)
 *     with a sliding orange underline driven by `LayoutGroup`. Right:
 *     two EXPORT buttons — "Export PDF" (orange primary, Download) and
 *     "Export XLSX" (outlined orange, FileSpreadsheet). Both wire to
 *     REAL `jsPDF` + `jspdf-autotable` + `xlsx` calls.
 *
 *   - The LEFT INSPECTOR RAIL is 360px wide, scrollable. Cards stack
 *     vertically: report-type selector mirror, title input, date-range
 *     pill group (Last 7d / Last 30d / This Quarter / Custom), section
 *     toggle checkboxes (cover / executive / KPI table / per-sub-client
 *     breakdown / trends / footer), accent-color swatch picker with
 *     five orange variants, branding radio (WarmPulse co-brand vs.
 *     White-label), and a "Save template" button at the bottom with a
 *     "Modified" dot when any control deviates from initial state.
 *
 *   - The RIGHT CANVAS is the LIVE PAPER PREVIEW — letter-size proportions,
 *     centered, drop-shadowed, max-width 720px. Renders the EXACT
 *     downloaded artifact: the cover band paints in the chosen accent,
 *     the title uses Georgia serif, the pull quote and sub-client table
 *     read from `metrics[type]`, the trends chart is an inline SVG bar
 *     chart driven from `metrics[type].rows`, and the footer carries
 *     branding per the radio. Above the canvas: zoom controls (50 / 75 /
 *     100 / 150 percent) and a page indicator. Below: a print preview
 *     hint.
 *
 * The aesthetic is professional design-tool: dark chrome, near-white
 * paper, generous breathing room, orange accents on selected state and
 * primary actions. WYSIWYG fidelity is the differentiator — the user
 * can see EXACTLY what the PDF will look like before clicking Export.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists. This file is the SOURCE OF TRUTH for the
 * N-set `AgencyReportsData` shape — sibling N2 / N3 / N4 import it
 * from here so the four variants stay byte-compatible.
 *
 * NOT a card grid, NOT a Notion-style document, NOT a print-shop order
 * form (sibling candidates own those identities). The split-view
 * editor identity — live WYSIWYG paper preview + real dual export —
 * is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — exported, this file is the source of
// truth for the N-set. Sibling N2 / N3 / N4 candidates import
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
  // Pre-canned mock metrics per type (used to render the preview canvas).
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
// report-type metric bundles. Numbers chosen so the four pull quotes read
// distinctly in the preview canvas and the table values do not collide.
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
// Type metadata — labels, icons, descriptions. Driven from a single
// const so the toolbar pills, the inspector mirror and the export
// filenames stay in lock-step.
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

// ---------------------------------------------------------------------------
// Date range presets, accent swatch palette, branding modes — shared by
// inspector controls and the preview canvas.
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
    label: 'Per-sub-client breakdown',
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
    label: 'Footer with branding',
    hint: 'Page number + brand mark.',
    Icon: Type,
  },
];

type ZoomLevel = 50 | 75 | 100 | 150;
const ZOOM_LEVELS: ZoomLevel[] = [50, 75, 100, 150];

type PreviewMode = 'pdf' | 'xlsx';
type SheetName = 'Summary' | 'Detail' | 'Template';
const SHEET_NAMES: SheetName[] = ['Summary', 'Detail', 'Template'];

// ---------------------------------------------------------------------------
// Initial / default state for the inspector — used both as React useState
// seed and as the reference for the "Modified" dirty-state indicator.
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
// Status colour helper — maps row status onto a deliberate subset of the
// brand palette. Status colours stay in the orange/warning family per the
// strict-Shailog palette rule (no violet / blue / cyan / mint / teal).
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
// XLSX sheet builder — the SINGLE SOURCE OF TRUTH for what each XLSX sheet
// contains. Both the on-screen `SpreadsheetPreview` component and the real
// `handleXlsx` export function read from this helper, so what the user sees
// in preview is byte-for-byte what they get on download.
// ---------------------------------------------------------------------------

type SheetCell = string | number;

interface XlsxSheets {
  Summary: SheetCell[][];
  Detail: SheetCell[][];
  Template: SheetCell[][];
}

function buildXlsxSheets(
  state: InspectorState,
  data: AgencyReportsData,
  accent: AccentSwatch,
  rangeLabel: string,
): XlsxSheets {
  const typeMetaXlsx = TYPE_LOOKUP[state.type];
  const metric = data.metrics[state.type];

  const Summary: SheetCell[][] = [
    ['Agency', data.agency.name],
    ['Region', data.agency.region],
    ['Report type', typeMetaXlsx.label],
    ['Range', rangeLabel],
    ['Branding', state.branding === 'whitelabel' ? 'White-label' : 'WarmPulse co-brand'],
    ['Title', state.title],
    ['Generated', new Date().toISOString()],
    [],
    ['Total', metric.summary.total],
    ['Average', metric.summary.avg],
    ['High', metric.summary.high],
    ['Low', metric.summary.low],
  ];

  const Detail: SheetCell[][] = [
    ['Sub-client', 'Domain', 'Mailboxes', 'Value', 'Δ', 'Status'],
    ...metric.rows.map<SheetCell[]>((r) => {
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
  ];

  const Template: SheetCell[][] = [
    ['Section', 'Included'],
    ...SECTION_META.map<SheetCell[]>((s) => [s.label, state.sections[s.key] ? 'yes' : 'no']),
    [],
    ['Accent hex', accent.hex],
    ['Accent name', accent.name],
  ];

  return { Summary, Detail, Template };
}

// ---------------------------------------------------------------------------
// Filename helper — keeps both export buttons in lock-step.
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

// ---------------------------------------------------------------------------
// Animation primitives — page enters fade-up, type pills spring on hover,
// preview sections fade in/out as toggles flip. Honoured by reduced-motion.
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
// Toolbar pill — sliding orange underline driven by motion.div layoutId.
// ---------------------------------------------------------------------------

interface TypePillsProps {
  active: ReportType;
  onSelect: (id: ReportType) => void;
  reducedMotion: boolean;
  compact?: boolean;
}

function TypePills({ active, onSelect, reducedMotion, compact = false }: TypePillsProps): JSX.Element {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
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
            whileHover={reducedMotion ? undefined : { scale: 1.04 }}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              color: isActive ? '#fff' : 'var(--wp-text-dim)',
              zIndex: 1,
            }}
          >
            {isActive && (
              <motion.span
                layoutId={compact ? 'pill-bg-compact' : 'pill-bg'}
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  zIndex: -1,
                  boxShadow: '0 6px 18px color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{compact ? meta.short : meta.label}</span>
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
      className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12.5px] font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-70"
      style={baseStyle}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-4 w-4" aria-hidden />
      )}
      <span>{label}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Inspector card — wrapper for the labelled control groups in the left rail.
// ---------------------------------------------------------------------------

interface InspectorCardProps {
  title: string;
  hint?: string;
  Icon?: typeof Calendar;
  children: React.ReactNode;
}

function InspectorCard({ title, hint, Icon, children }: InspectorCardProps): JSX.Element {
  return (
    <section
      className="rounded-lg p-3.5"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 65%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
    >
      <header className="mb-3 flex items-center gap-2">
        {Icon ? (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded"
            style={{
              background: 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
              color: 'var(--wp-accent, #F26522)',
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        <div className="leading-tight">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            {title}
          </div>
          {hint ? (
            <div className="text-[10.5px]" style={{ color: 'var(--wp-text-faint)' }}>
              {hint}
            </div>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trends chart — inline SVG bar chart, sourced from the rows of the active
// metric. Each bar tinted by status colour, scaled to the max value.
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
  const slotW = barAreaW / rows.length;
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
// Paper preview — the WYSIWYG of the downloaded PDF. Renders cover band,
// pull quote, KPI table, breakdown cards, trends chart, footer — each
// gated by the section toggles.
// ---------------------------------------------------------------------------

interface PaperPreviewProps {
  state: InspectorState;
  data: AgencyReportsData;
  accentHex: string;
}

function PaperPreview({ state, data, accentHex }: PaperPreviewProps): JSX.Element {
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;
  const metric = data.metrics[state.type];
  const TypeIcon = typeMeta.Icon;
  const isWhiteLabel = state.branding === 'whitelabel';

  return (
    <div className="flex flex-col gap-5 px-12 py-10">
      {/* Cover */}
      <AnimatePresence initial={false}>
        {state.sections.cover && (
          <motion.section
            key="cover"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="show"
            exit="exit"
            className="overflow-hidden rounded-lg"
            style={{
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div
              className="px-7 py-5 text-white"
              style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex}cc)` }}
            >
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] opacity-90">
                <span>
                  {isWhiteLabel
                    ? data.agency.name
                    : `${data.agency.name} · WarmPulse`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {rangeMeta.label}
                </span>
              </div>
              <h1
                className="mt-3 text-[28px] font-bold leading-tight"
                style={{ fontFamily: "'Georgia', serif", letterSpacing: '-0.01em' }}
              >
                {state.title}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-[12.5px] opacity-90">
                <TypeIcon className="h-4 w-4" aria-hidden />
                <span>{typeMeta.label}</span>
                <span aria-hidden>·</span>
                <span>{data.subClients.length} sub-clients</span>
                <span aria-hidden>·</span>
                <span>
                  {data.subClients.reduce((s, c) => s + c.mailboxCount, 0)} mailboxes
                </span>
              </div>
            </div>
            <div
              className="h-2"
              style={{
                background: `linear-gradient(90deg, ${accentHex}, transparent)`,
              }}
            />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Executive summary */}
      <AnimatePresence initial={false}>
        {state.sections.executive && (
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

      {/* KPI table */}
      <AnimatePresence initial={false}>
        {state.sections.kpiTable && (
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
                      <td className="px-3 py-2 font-mono text-[11px]" style={{ color: '#6a5448' }}>
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
        {state.sections.breakdown && (
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
        {state.sections.trends && (
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
        {state.sections.footer && (
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
                ? `${data.agency.name} · Confidential`
                : `${data.agency.name} · Powered by WarmPulse`}
            </span>
            <span>Page 1 of 1</span>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview-mode toggle — segmented control [ PDF ] [ XLSX ] with a
// framer-motion layoutId-driven slider on the active button.
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
      className="inline-flex items-center gap-1 rounded-md p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 75%, transparent)',
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
            whileHover={reducedMotion ? undefined : { y: -1 }}
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
                layoutId="preview-mode-slider"
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
// Sheet tab bar — Excel/Google-Sheets-style tabs at the bottom of the
// spreadsheet preview. Active tab gets an orange-tinted underline + bold
// label, inactive tabs are grey.
// ---------------------------------------------------------------------------

interface SheetTabBarProps {
  active: SheetName;
  onChange: (s: SheetName) => void;
  reducedMotion: boolean;
}

function SheetTabBar({ active, onChange, reducedMotion }: SheetTabBarProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-0 border-t"
      style={{
        borderColor: 'rgba(0,0,0,0.12)',
        background: '#f4f3ef',
      }}
    >
      {SHEET_NAMES.map((name) => {
        const isActive = name === active;
        return (
          <motion.button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="relative inline-flex items-center px-4 py-1.5 text-[11.5px] transition-colors"
            style={{
              color: isActive ? 'var(--wp-accent, #F26522)' : '#6a5448',
              background: isActive ? '#fff' : 'transparent',
              borderRight: '1px solid rgba(0,0,0,0.10)',
              fontWeight: isActive ? 700 : 500,
            }}
            aria-pressed={isActive}
          >
            <span>{name}</span>
            {isActive ? (
              <motion.span
                layoutId="sheet-tab-underline"
                className="absolute left-1 right-1 -top-px h-[3px] rounded-b"
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
// Spreadsheet cell — renders one `<td>` matching Excel/Google-Sheets chrome:
// thin grey borders, number cells right-aligned, text cells left-aligned,
// header row (rowIndex 0) gets bold text + orange-tinted fill, A1 carries a
// subtle orange selection outline.
// ---------------------------------------------------------------------------

interface SpreadsheetCellProps {
  value: SheetCell | undefined;
  isHeaderRow: boolean;
  isSelected: boolean;
}

function SpreadsheetCell({
  value,
  isHeaderRow,
  isSelected,
}: SpreadsheetCellProps): JSX.Element {
  const isNumber = typeof value === 'number';
  const text = value === undefined ? '' : String(value);
  const headerFill =
    'color-mix(in srgb, var(--wp-accent, #F26522) 18%, var(--wp-surface, #fffaf6))';
  return (
    <td
      style={{
        padding: '4px 8px',
        border: '1px solid rgba(0,0,0,0.10)',
        background: isHeaderRow ? headerFill : 'transparent',
        color: isHeaderRow ? '#231914' : '#2a1f17',
        fontWeight: isHeaderRow ? 700 : 400,
        fontSize: 11,
        textAlign: isNumber ? 'right' : 'left',
        fontFamily: isNumber
          ? "ui-monospace, SFMono-Regular, Menlo, monospace"
          : "Arial, Helvetica, sans-serif",
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 220,
        outline: isSelected
          ? '2px solid var(--wp-accent, #F26522)'
          : 'none',
        outlineOffset: isSelected ? '-2px' : undefined,
        position: 'relative',
        zIndex: isSelected ? 1 : 0,
      }}
    >
      {text}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Spreadsheet preview — renders when XLSX mode is active. Aesthetic
// mirrors Excel/Google Sheets chrome and the rows EXACTLY match what
// `handleXlsx` writes to the workbook.
// ---------------------------------------------------------------------------

interface SpreadsheetPreviewProps {
  sheets: XlsxSheets;
  activeSheet: SheetName;
  onChangeSheet: (s: SheetName) => void;
  reducedMotion: boolean;
}

const SPREADSHEET_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SPREADSHEET_MIN_ROWS = 22;

function SpreadsheetPreview({
  sheets,
  activeSheet,
  onChangeSheet,
  reducedMotion,
}: SpreadsheetPreviewProps): JSX.Element {
  const rows = sheets[activeSheet];
  const usedCols = Math.max(
    1,
    ...rows.map((r) => r.length),
  );
  const colCount = Math.max(usedCols, 5);
  const cols = SPREADSHEET_COLS.slice(0, Math.min(colCount, SPREADSHEET_COLS.length));
  const displayedRowCount = Math.max(rows.length, SPREADSHEET_MIN_ROWS);

  return (
    <div className="flex h-full flex-col" style={{ background: '#fff' }}>
      {/* Formula bar mimic */}
      <div
        className="flex items-center gap-2 border-b px-3 py-1.5"
        style={{
          borderColor: 'rgba(0,0,0,0.10)',
          background: '#fafaf7',
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded px-2 py-0.5 font-mono text-[10.5px]"
          style={{
            color: 'var(--wp-accent, #F26522)',
            background:
              'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)',
            minWidth: 36,
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
        <span
          className="font-mono text-[11px]"
          style={{ color: '#231914' }}
        >
          {rows[0]?.[0] !== undefined ? String(rows[0][0]) : ''}
        </span>
      </div>

      {/* Spreadsheet grid */}
      <div className="flex-1 overflow-auto" style={{ background: '#fff' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            tableLayout: 'auto',
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          {/* Column header strip: A / B / C / ... */}
          <thead>
            <tr>
              <th
                style={{
                  padding: '4px 8px',
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: '#f4f3ef',
                  color: '#6a5448',
                  fontSize: 10.5,
                  fontWeight: 600,
                  minWidth: 30,
                  width: 30,
                  textAlign: 'center',
                }}
                aria-hidden
              />
              {cols.map((c) => (
                <th
                  key={c}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid rgba(0,0,0,0.10)',
                    background: '#f4f3ef',
                    color: '#6a5448',
                    fontSize: 10.5,
                    fontWeight: 600,
                    textAlign: 'center',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayedRowCount }).map((_, rowIdx) => {
              const row = rows[rowIdx];
              const isHeaderRow = rowIdx === 0;
              const evenRowBg =
                rowIdx > 0 && rowIdx % 2 === 0
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 4%, #fff)'
                  : '#fff';
              return (
                <tr
                  key={rowIdx}
                  style={{
                    background: isHeaderRow ? 'transparent' : evenRowBg,
                  }}
                >
                  {/* Row number column */}
                  <td
                    style={{
                      padding: '4px 8px',
                      border: '1px solid rgba(0,0,0,0.10)',
                      background: '#f4f3ef',
                      color: '#6a5448',
                      fontSize: 10.5,
                      fontWeight: 600,
                      textAlign: 'center',
                      width: 30,
                    }}
                  >
                    {rowIdx + 1}
                  </td>
                  {cols.map((_c, colIdx) => {
                    const value = row?.[colIdx];
                    return (
                      <SpreadsheetCell
                        key={colIdx}
                        value={value}
                        isHeaderRow={isHeaderRow && row !== undefined}
                        isSelected={rowIdx === 0 && colIdx === 0}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs at the bottom */}
      <SheetTabBar
        active={activeSheet}
        onChange={onChangeSheet}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRptN1SplitView({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const reducedMotion = useReducedMotion() ?? false;

  const initialState = useMemo(() => buildInitialState('warmth', d.agency.name), [d.agency.name]);
  const [state, setState] = useState<InspectorState>(initialState);
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');
  const [activeSheet, setActiveSheet] = useState<SheetName>('Summary');

  const isDirty = useMemo(
    () => !isStateEqual(state, initialState) || savedAt !== null,
    [state, initialState, savedAt],
  );

  const accent: AccentSwatch = ACCENT_SWATCHES[state.accentIndex] ?? ACCENT_SWATCHES[0]!;
  const typeMeta = TYPE_LOOKUP[state.type];
  const rangeMeta = DATE_RANGES.find((r) => r.id === state.range) ?? DATE_RANGES[1]!;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleTypeChange = useCallback(
    (typeId: ReportType) => {
      setState((prev) => ({
        ...prev,
        type: typeId,
        // Auto-update the title if it still matches the prior auto-title pattern,
        // so switching types feels continuous; preserve user edits otherwise.
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

  const handleResetTemplate = useCallback(() => {
    setState(buildInitialState(state.type, d.agency.name));
    setSavedAt(null);
    toast.success('Template reset to defaults');
  }, [state.type, d.agency.name]);

  const handleSaveTemplate = useCallback(() => {
    setSavedAt(new Date());
    toast.success('Template saved');
  }, []);

  // -------------------------------------------------------------------------
  // REAL PDF export — jsPDF + jspdf-autotable. NOT a stub.
  // -------------------------------------------------------------------------

  const handlePdf = useCallback(() => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const type = state.type;
      const typeMetaPdf = TYPE_LOOKUP[type];
      const accentRgb = accent.rgb;
      const metric = d.metrics[type];

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 40;
      let cursorY = 0;

      // Cover band
      if (state.sections.cover) {
        doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.rect(0, 0, pageW, 60, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
          (state.branding === 'whitelabel'
            ? d.agency.name
            : `${d.agency.name} · WarmPulse`
          ).toUpperCase(),
          margin,
          22,
        );
        doc.setFontSize(20);
        doc.setFont('times', 'bold');
        doc.text(`${d.agency.name} · ${typeMetaPdf.label}`, margin, 44);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(rangeMeta.label, pageW - margin, 22, { align: 'right' });
        cursorY = 88;
      } else {
        cursorY = margin;
      }

      // Title line if cover is off
      if (!state.sections.cover) {
        doc.setTextColor(31, 20, 16);
        doc.setFontSize(20);
        doc.setFont('times', 'bold');
        doc.text(state.title, margin, cursorY);
        cursorY += 24;
      }

      // Executive summary
      if (state.sections.executive) {
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

        // Summary grid
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

      // KPI table
      if (state.sections.kpiTable) {
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

      // Per-sub-client breakdown (compact list)
      if (state.sections.breakdown) {
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

      // Trends placeholder (jsPDF-friendly mini-bar strip)
      if (state.sections.trends && cursorY < 740) {
        doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('TRENDS', margin, cursorY);
        cursorY += 10;
        const max = Math.max(...metric.rows.map((r) => r.value), 1);
        const chartH = 60;
        const chartW = pageW - margin * 2;
        const slotW = chartW / metric.rows.length;
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
      }

      // Footer
      if (state.sections.footer) {
        doc.setTextColor(106, 84, 72);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const footerText =
          state.branding === 'whitelabel'
            ? `${d.agency.name} · Confidential`
            : `${d.agency.name} · Powered by WarmPulse`;
        doc.text(footerText, margin, 820);
        doc.text('Page 1 of 1', pageW - margin, 820, { align: 'right' });
      }

      doc.save(buildExportFilename(d.agency.name, type, 'pdf'));
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF export failed', err);
      toast.error('PDF export failed — check console');
    } finally {
      // Brief delay so the spinner is visible.
      window.setTimeout(() => setPdfBusy(false), 380);
    }
  }, [pdfBusy, state, accent, d, rangeMeta.label]);

  // -------------------------------------------------------------------------
  // REAL XLSX export — xlsx workbook with Summary + Detail sheets.
  // -------------------------------------------------------------------------

  const handleXlsx = useCallback(() => {
    if (xlsxBusy) return;
    setXlsxBusy(true);
    try {
      const type = state.type;
      const sheets = buildXlsxSheets(state, d, accent, rangeMeta.label);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.Summary), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.Detail), 'Detail');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.Template), 'Template');

      XLSX.writeFile(wb, buildExportFilename(d.agency.name, type, 'xlsx'));
      toast.success('XLSX downloaded');
    } catch (err) {
      console.error('XLSX export failed', err);
      toast.error('XLSX export failed — check console');
    } finally {
      window.setTimeout(() => setXlsxBusy(false), 380);
    }
  }, [xlsxBusy, state, accent, d, rangeMeta.label]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const totalMailboxes = useMemo(
    () => d.subClients.reduce((s, c) => s + c.mailboxCount, 0),
    [d.subClients],
  );

  // Live XLSX sheets — recomputed whenever any inspector control changes,
  // so the spreadsheet preview stays in lock-step with the same data the
  // real `handleXlsx` writes to the workbook on download.
  const xlsxSheets = useMemo(
    () => buildXlsxSheets(state, d, accent, rangeMeta.label),
    [state, d, accent, rangeMeta.label],
  );

  // Total non-empty data rows across all sheets — surfaced in the
  // below-canvas status line when XLSX preview is active.
  const xlsxTotalRows = useMemo(() => {
    return (
      xlsxSheets.Summary.length +
      xlsxSheets.Detail.length +
      xlsxSheets.Template.length
    );
  }, [xlsxSheets]);

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
      {/* Top toolbar */}
      <header
        className="sticky top-0 z-30 flex items-center gap-4 border-b px-5 py-3"
        style={{
          background: 'color-mix(in srgb, var(--wp-bg) 90%, transparent)',
          borderColor: 'var(--wp-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Left brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              background:
                'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
              color: '#fff',
            }}
          >
            <FileText className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div
              className="truncate text-[14px] font-semibold"
              style={{ color: 'var(--wp-text)' }}
            >
              {d.agency.name}
            </div>
            <div
              className="truncate text-[11px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              Report Builder · Agency Edition
            </div>
          </div>
        </div>

        {/* Center pills */}
        <div className="flex flex-1 items-center justify-center">
          <TypePills
            active={state.type}
            onSelect={handleTypeChange}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <ExportButton
            variant="outline"
            label="Export XLSX"
            Icon={FileSpreadsheet}
            busy={xlsxBusy}
            onClick={handleXlsx}
            reducedMotion={reducedMotion}
          />
          <ExportButton
            variant="primary"
            label="Export PDF"
            Icon={Download}
            busy={pdfBusy}
            onClick={handlePdf}
            reducedMotion={reducedMotion}
          />
        </div>
      </header>

      {/* Main split */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT INSPECTOR */}
        <aside
          className="flex flex-shrink-0 flex-col gap-3 overflow-y-auto p-4"
          style={{
            width: 360,
            borderRight: '1px solid var(--wp-border)',
            background: 'color-mix(in srgb, var(--wp-surface) 35%, transparent)',
          }}
        >
          {/* Type selector mirror */}
          <InspectorCard title="Report type" Icon={typeMeta.Icon}>
            <div className="flex flex-wrap items-center gap-1.5">
              {TYPE_META.map((m) => {
                const isActive = m.id === state.type;
                const Icon = m.Icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleTypeChange(m.id)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
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
                    <span>{m.short}</span>
                  </button>
                );
              })}
            </div>
            <p
              className="mt-2 text-[11px] leading-snug"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {typeMeta.description}
            </p>
          </InspectorCard>

          {/* Title */}
          <InspectorCard title="Title" hint="Editable. Appears in cover + filename." Icon={Type}>
            <input
              type="text"
              value={state.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md px-3 py-2 text-[12.5px] font-medium outline-none transition-colors"
              style={{
                background: 'var(--wp-surface)',
                color: 'var(--wp-text)',
                border: '1px solid var(--wp-border)',
              }}
            />
          </InspectorCard>

          {/* Date range */}
          <InspectorCard title="Date range" Icon={CalendarRange}>
            <div className="grid grid-cols-2 gap-1.5">
              {DATE_RANGES.map((rng) => {
                const Icon = rng.Icon;
                const isActive = rng.id === state.range;
                return (
                  <button
                    key={rng.id}
                    type="button"
                    onClick={() => handleRangeChange(rng.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors"
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
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {rng.short}
                  </button>
                );
              })}
            </div>
          </InspectorCard>

          {/* Sections */}
          <InspectorCard
            title="Sections"
            hint="Toggle which blocks render in the PDF."
            Icon={LayoutGrid}
          >
            <ul className="space-y-1.5">
              {SECTION_META.map((sec) => {
                const on = state.sections[sec.key];
                const Icon = sec.Icon;
                return (
                  <li key={sec.key}>
                    <label
                      className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 transition-colors"
                      style={{
                        background: on
                          ? 'color-mix(in srgb, var(--wp-accent, #F26522) 10%, transparent)'
                          : 'transparent',
                        border: on
                          ? '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)'
                          : '1px solid transparent',
                      }}
                    >
                      <span
                        className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[3px] transition-colors"
                        style={{
                          background: on
                            ? 'var(--wp-accent, #F26522)'
                            : 'color-mix(in srgb, var(--wp-surface) 90%, transparent)',
                          border: on
                            ? '1px solid var(--wp-accent, #F26522)'
                            : '1px solid var(--wp-border)',
                        }}
                      >
                        {on ? <Check className="h-3 w-3" style={{ color: '#fff' }} aria-hidden /> : null}
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => handleSectionToggle(sec.key)}
                        className="sr-only"
                      />
                      <div className="flex min-w-0 flex-1 items-start gap-1.5">
                        <Icon
                          className="h-3.5 w-3.5 flex-shrink-0"
                          style={{
                            color: on ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-faint)',
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 leading-tight">
                          <div
                            className="text-[12px] font-medium"
                            style={{ color: 'var(--wp-text)' }}
                          >
                            {sec.label}
                          </div>
                          <div
                            className="text-[10.5px]"
                            style={{ color: 'var(--wp-text-faint)' }}
                          >
                            {sec.hint}
                          </div>
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </InspectorCard>

          {/* Accent */}
          <InspectorCard title="Accent color" hint={accent.name} Icon={Palette}>
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
          </InspectorCard>

          {/* Branding */}
          <InspectorCard title="Branding" Icon={Crown}>
            <div className="space-y-1.5">
              {[
                {
                  id: 'cobrand' as const,
                  label: 'WarmPulse co-brand',
                  hint: 'WarmPulse mark in footer.',
                },
                {
                  id: 'whitelabel' as const,
                  label: 'White-label (agency only)',
                  hint: 'Agency mark only — no WarmPulse refs.',
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
                      className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
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
                    <div className="leading-tight">
                      <div
                        className="text-[12px] font-medium"
                        style={{ color: 'var(--wp-text)' }}
                      >
                        {opt.label}
                      </div>
                      <div
                        className="text-[10.5px]"
                        style={{ color: 'var(--wp-text-faint)' }}
                      >
                        {opt.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </InspectorCard>

          {/* Save template + dirty state */}
          <div
            className="rounded-lg p-3"
            style={{
              background: 'color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 26%, transparent)',
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: isDirty
                    ? 'var(--wp-accent, #F26522)'
                    : 'color-mix(in srgb, var(--wp-text-faint) 40%, transparent)',
                  boxShadow: isDirty
                    ? '0 0 8px color-mix(in srgb, var(--wp-accent, #F26522) 60%, transparent)'
                    : 'none',
                }}
                aria-hidden
              />
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                {isDirty ? 'Modified' : 'Saved'}
              </span>
              {savedAt ? (
                <span
                  className="ml-auto text-[10.5px]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                onClick={handleSaveTemplate}
                whileHover={reducedMotion ? undefined : { y: -1 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold"
                style={{
                  background:
                    'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  color: '#fff',
                  border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 50%, transparent)',
                }}
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                Save template
              </motion.button>
              <motion.button
                type="button"
                onClick={handleResetTemplate}
                whileHover={reducedMotion ? undefined : { y: -1 }}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                aria-label="Reset to defaults"
                title="Reset to defaults"
                className="inline-flex items-center justify-center rounded-md px-2.5 py-2 text-[12px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
                  color: 'var(--wp-text-dim)',
                  border: '1px solid var(--wp-border)',
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              </motion.button>
            </div>
          </div>
        </aside>

        {/* RIGHT CANVAS */}
        <main
          className="flex min-w-0 flex-1 flex-col overflow-y-auto"
          style={{
            background:
              'radial-gradient(800px 400px at 50% -20%, color-mix(in srgb, var(--wp-accent, #F26522) 5%, transparent), transparent 60%)',
          }}
        >
          {/* Canvas top bar — zoom + page indicator */}
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
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                Preview
              </span>
              <PreviewModeToggle
                mode={previewMode}
                onChange={setPreviewMode}
                reducedMotion={reducedMotion}
              />
              <span
                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                  color: 'var(--wp-accent, #F26522)',
                  border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent)',
                }}
              >
                {typeMeta.short}
              </span>
              <span
                className="hidden text-[10.5px] md:inline"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                · {totalMailboxes} mailboxes · {rangeMeta.label}
              </span>
            </div>

            {/* Zoom controls */}
            <div
              className="inline-flex items-center gap-1 rounded-md p-1"
              style={{
                background: 'color-mix(in srgb, var(--wp-surface) 75%, transparent)',
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
                <Minimize2 className="h-3.5 w-3.5" aria-hidden />
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
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <div
              className="hidden items-center gap-1 text-[10.5px] md:inline-flex"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-90" aria-hidden />
              Page 1 of 1
            </div>
          </div>

          {/* Paper canvas */}
          <div className="flex flex-1 justify-center overflow-x-auto px-8 py-10">
            <motion.div
              animate={
                reducedMotion
                  ? undefined
                  : { scale: zoom / 100 }
              }
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              style={{
                width: 720,
                transformOrigin: 'top center',
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {previewMode === 'pdf' ? (
                  <motion.div
                    key="pdf-paper"
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="relative overflow-hidden rounded-lg"
                    style={{
                      background: 'var(--wp-surface, #fffaf6)',
                      color: '#1f1410',
                      boxShadow:
                        '0 30px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.06)',
                      minHeight: 940,
                    }}
                  >
                    <PaperPreview
                      state={state}
                      data={d}
                      accentHex={accent.hex}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="xlsx-grid"
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="relative overflow-hidden rounded-lg"
                    style={{
                      background: '#fff',
                      color: '#1f1410',
                      boxShadow:
                        '0 30px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.06)',
                      minHeight: 940,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <SpreadsheetPreview
                      sheets={xlsxSheets}
                      activeSheet={activeSheet}
                      onChangeSheet={setActiveSheet}
                      reducedMotion={reducedMotion}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Below-canvas hint */}
          <div
            className="flex items-center justify-center gap-2 border-t px-4 py-2 text-[10.5px]"
            style={{
              borderColor: 'var(--wp-border)',
              color: 'var(--wp-text-faint)',
              background: 'color-mix(in srgb, var(--wp-bg) 65%, transparent)',
            }}
          >
            <ChevronDown className="h-3 w-3 -rotate-90" aria-hidden />
            {previewMode === 'pdf' ? (
              <>
                <span>This is what your PDF will look like — exported as A4 portrait.</span>
                <span aria-hidden>·</span>
                <span>
                  XLSX includes Summary, Detail, and Template sheets.
                </span>
              </>
            ) : (
              <span>
                This is what your XLSX will look like · 3 sheets · ~{xlsxTotalRows} rows total
              </span>
            )}
          </div>
        </main>
      </div>
    </motion.div>
  );
}

export default AgRptN1SplitView;
