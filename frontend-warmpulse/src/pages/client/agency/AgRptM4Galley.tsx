import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  Inbox,
  Layers,
  PenSquare,
  Printer,
  Quote,
  ScrollText,
  Send,
  Sigma,
  Sparkles,
  Stamp,
  Table2,
  Target,
  Users,
} from 'lucide-react';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';
import { formatNumber } from '@/lib/format';

/**
 * AgRptM4Galley — Agency-tier REPORTS surface, design candidate M4,
 * "Editor's Galley Proof / Publishing Desk".
 *
 * The agency reports surface re-imagined as a magazine editor's proofing
 * desk. Three vertical columns compose the experience like a publishing
 * house layout:
 *
 *   - COLUMN A · Style Guide rail (left) — serif-typography config rail
 *     with editorial sections: Edition controls (type pills as "issue
 *     tag" chips), Editorial sections (chapter-marker pills), Style
 *     guide (accent inkwells, typeface switch, brand mode radio), and
 *     Distribution recipients chips.
 *
 *   - COLUMN B · Galley Proof canvas (centre) — the live preview surface.
 *     In PDF mode it renders an actual galley proof page with editorial
 *     margin marks and proofreader's marks subtly along the left margin.
 *     In XLSX mode it renders the workbook as a vertical stack of
 *     polished ledger cards — one card per sheet (Summary / Detail /
 *     Template) — each card a "page" the editor can sign off.
 *
 *   - COLUMN C · Fact-checker inspector (right) — editorial notes panel.
 *     In PDF mode shows page count / word count / image count. In XLSX
 *     mode shows sheet breakdown, row counts and file size estimate.
 *
 * Aesthetic: premium editorial — generous margins, refined serifs for
 * headlines and ledger cards, clean sans for body, cream paper tint via
 * `color-mix` against the warning token, STRICT Shailog orange palette.
 *
 * REAL EXPORTS — `handlePdf` and `handleXlsx` consume the same shared
 * builder plan that drives the preview, so the downloaded files are
 * byte-faithful to what the editor sees. Workbook has 3 sheets:
 * Summary · Detail · Template (config snapshot).
 *
 * Fully STANDALONE — no network, router or required props. Inline MOCK
 * supplies every field so the design-preview harness mounts it
 * prop-less. The future adapter passes `data` once the reports aggregate
 * endpoint exists.
 */

// ---------------------------------------------------------------------------
// Inline data shape — M1 (Studio) isn't on disk yet so we declare the
// types inline. Once M1 lands, the import line at the top of the file
// could swap to `import type { … } from './AgRptM1Studio'`.
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
// Mock data — Northwind Agency portfolio, 7 sub-clients, four report
// types fully populated so every preview path has real numbers.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyReportsData['subClients'] = [
  { id: 'sc-helix', name: 'Helix Outreach', domain: 'helix.com', mailboxCount: 12 },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxCount: 18 },
  { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.com', mailboxCount: 22 },
  { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 8 },
  { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 14 },
  { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 9 },
  { id: 'sc-pixel', name: 'Pixel Forge', domain: 'pixelforge.io', mailboxCount: 6 },
];

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: SUB_CLIENTS,
  metrics: {
    warmth: {
      headline: 'Warmth climbs across the portfolio',
      pullQuote:
        'Average warmth score lifted 4.2 points week-over-week — Helix and Lyra led the pack.',
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 86, delta: 6, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 84, delta: 4, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 78, delta: 3, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 74, delta: 2, status: 'good' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 71, delta: 1, status: 'warn' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 64, delta: -1, status: 'warn' },
        { subClient: 'Pixel Forge', domain: 'pixelforge.io', value: 56, delta: -3, status: 'risk' },
      ],
      summary: { total: 513, avg: 73, high: 86, low: 56 },
    },
    engagement: {
      headline: 'Reply velocity outperforms forecast',
      pullQuote:
        'Reply rate up 28% versus the previous 30 days. Orion and Helix together drove the lift.',
      rows: [
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 18, delta: 5, status: 'good' },
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 16, delta: 4, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 13, delta: 2, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 11, delta: 1, status: 'good' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 9, delta: 0, status: 'warn' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 7, delta: -1, status: 'warn' },
        { subClient: 'Pixel Forge', domain: 'pixelforge.io', value: 4, delta: -2, status: 'risk' },
      ],
      summary: { total: 78, avg: 11, high: 18, low: 4 },
    },
    placement: {
      headline: 'Where emails land holds steady',
      pullQuote:
        'Portfolio-wide Gmail inboxing settled at 84.7% — Quasar weathered a soft DKIM flap without loss.',
      rows: [
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 91, delta: 2, status: 'good' },
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 89, delta: 1, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 87, delta: 3, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 85, delta: 1, status: 'good' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 82, delta: 0, status: 'warn' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 76, delta: -2, status: 'warn' },
        { subClient: 'Pixel Forge', domain: 'pixelforge.io', value: 68, delta: -4, status: 'risk' },
      ],
      summary: { total: 578, avg: 83, high: 91, low: 68 },
    },
    white_label: {
      headline: 'White-label digest ready for partner review',
      pullQuote:
        'Custom-branded executive summary cut for the Nimbus partnership team — five trended KPIs.',
      rows: [
        { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', value: 94, delta: 3, status: 'good' },
        { subClient: 'Helix Outreach', domain: 'helix.com', value: 90, delta: 2, status: 'good' },
        { subClient: 'Lyra Studio', domain: 'lyrastudio.co', value: 87, delta: 1, status: 'good' },
        { subClient: 'Orion Sales', domain: 'orionsales.com', value: 85, delta: 2, status: 'good' },
        { subClient: 'Quasar Growth', domain: 'quasargrowth.com', value: 80, delta: 0, status: 'warn' },
        { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', value: 73, delta: -1, status: 'warn' },
        { subClient: 'Pixel Forge', domain: 'pixelforge.io', value: 65, delta: -3, status: 'risk' },
      ],
      summary: { total: 574, avg: 82, high: 94, low: 65 },
    },
  },
};

// ---------------------------------------------------------------------------
// Centralised report-type metadata. The four types each have a short
// human name, a tiny description, a unit suffix for value formatting,
// and a lucide icon so the type pills and editorial chrome stay
// consistent across the file.
// ---------------------------------------------------------------------------

const TYPE_NAME: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Opens & replies',
  placement: 'Where emails land',
  white_label: 'White-label',
};

const TYPE_DESC: Record<ReportType, string> = {
  warmth: 'Sender trust curve · per-mailbox score · 30d trend',
  engagement: 'Reply / open / star funnel · opens & replies velocity',
  placement: 'Inbox / spam / promo split · per provider',
  white_label: 'Executive summary · agency branding · 5 KPIs',
};

const TYPE_UNIT: Record<ReportType, string> = {
  warmth: 'score',
  engagement: '%',
  placement: '%',
  white_label: 'pts',
};

const TYPE_ICON: Record<ReportType, typeof Flame> = {
  warmth: Flame,
  engagement: Inbox,
  placement: Target,
  white_label: Stamp,
};

const TYPE_ORDER: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];

// ---------------------------------------------------------------------------
// Editorial section model — six toggleable chapter markers along the
// galley proof. They drive the PDF builder, the on-page preview, and
// the word/page counts in the inspector.
// ---------------------------------------------------------------------------

type SectionKey = 'cover' | 'summary' | 'kpi' | 'breakdown' | 'trends' | 'footer';

interface SectionDef {
  key: SectionKey;
  label: string;
  hint: string;
  chapter: string;
}

const SECTION_DEFS: SectionDef[] = [
  { key: 'cover', label: 'Cover plate', hint: 'Masthead · issue meta', chapter: 'I' },
  { key: 'summary', label: 'Editorial', hint: 'Headline · pull quote', chapter: 'II' },
  { key: 'kpi', label: 'Figures', hint: 'Total · Avg · High · Low', chapter: 'III' },
  { key: 'breakdown', label: 'Breakdown', hint: 'Per sub-client roll', chapter: 'IV' },
  { key: 'trends', label: 'Trend bars', hint: 'Sub-client distribution', chapter: 'V' },
  { key: 'footer', label: 'Colophon', hint: 'Folio · sign-off', chapter: 'VI' },
];

// ---------------------------------------------------------------------------
// Five orange accent inkwells — strict-Shailog palette only, no
// violet/blue/cyan etc. The hex values are surfaced into the PDF builder
// so a switch in the rail updates the downloaded file.
// ---------------------------------------------------------------------------

const ACCENT_SWATCHES: Array<{ id: string; hex: string; name: string }> = [
  { id: 'coral', hex: '#F26522', name: 'Coral' },
  { id: 'tangerine', hex: '#FF8A4B', name: 'Tangerine' },
  { id: 'amber', hex: '#FF9670', name: 'Amber' },
  { id: 'sunset', hex: '#FFB454', name: 'Sunset' },
  { id: 'ember', hex: '#E5571A', name: 'Ember' },
];

// ---------------------------------------------------------------------------
// Theme constants — central reads of the WarmPulse tokens. `var()` with
// fallback keeps the design-preview harness rendering even if a token
// hasn't been wired into the host page yet.
// ---------------------------------------------------------------------------

const C = {
  bg: 'var(--wp-bg, #0a0a0f)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  border: 'var(--wp-border, #2a2a3a)',
  borderStrong: 'var(--wp-border-strong, #3a3a4a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #a1a1aa)',
  textFaint: 'var(--wp-text-faint, #71717a)',
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF9670)',
  accent3: 'var(--wp-accent-3, #FFB454)',
  accentHover: 'var(--wp-accent-hover, #FF7B38)',
  warning: 'var(--wp-warning, #ffb454)',
  // Cream / paper recipes — used across the rail cards, the galley canvas
  // and the ledger card backgrounds so the editorial framing reads
  // throughout the page.
  cream: 'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, var(--wp-surface, #12121a))',
  creamStrong:
    'color-mix(in srgb, var(--wp-warning, #ffb454) 8%, var(--wp-surface, #12121a))',
  paper: '#fdf6ea',
  paperEdge: '#e8d4bc',
  paperShadow:
    '0 1px 0 rgba(255,255,255,0.05) inset, 0 2px 8px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.5)',
};

// ---------------------------------------------------------------------------
// Typography — every editorial surface in the design uses a serif stack;
// helpers below pull this onto the cards, the galley proof, the ledger
// card titles and the masthead.
// ---------------------------------------------------------------------------

const SERIF: CSSProperties = {
  fontFamily: '"Georgia", "Times New Roman", "Iowan Old Style", serif',
};

const SANS: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif',
};

const MONO: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.02em',
};

// ---------------------------------------------------------------------------
// Util — hex conversion, date stamps, slug. Centralised so the PDF and
// XLSX builders share the same filename and accent recipe.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const fallback = { r: 242, g: 101, b: 34 };
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return fallback;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return { r, g, b };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function nicePeriod(): string {
  const now = new Date();
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const m = months[now.getMonth()] ?? 'January';
  return `${m} ${now.getFullYear()}`;
}

function fmtClock(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function slugAgency(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Editorial state model — the rail edits the `ReportState`; the builder
// derives both the PDF and XLSX plan from this state so preview and
// export stay in lockstep.
// ---------------------------------------------------------------------------

interface ReportState {
  type: ReportType;
  title: string;
  sections: Record<SectionKey, boolean>;
  accent: string;
  typeface: 'serif' | 'sans';
  brandMode: 'co' | 'wl';
  recipients: string[];
}

function defaultReportState(d: AgencyReportsData): ReportState {
  return {
    type: 'placement',
    title: `${nicePeriod()} · ${d.agency.name} Inbox vs Spam Galley`,
    sections: {
      cover: true,
      summary: true,
      kpi: true,
      breakdown: true,
      trends: true,
      footer: true,
    },
    accent: '#F26522',
    typeface: 'serif',
    brandMode: 'co',
    recipients: d.subClients.slice(0, 4).map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Shared builder plan — the centre of the exact-match guarantee. Both
// `handlePdf` and `handleXlsx` consume the same plan that drives the
// preview canvas, so what the editor signs off is what the file
// contains.
// ---------------------------------------------------------------------------

interface PdfPlanSection {
  key: SectionKey;
  chapter: string;
  label: string;
}

interface PdfPlan {
  filename: string;
  title: string;
  subtitle: string;
  pullQuote: string;
  headline: string;
  rows: AgencyReportsData['metrics'][ReportType]['rows'];
  summary: AgencyReportsData['metrics'][ReportType]['summary'];
  sections: PdfPlanSection[];
  accent: { hex: string; rgb: { r: number; g: number; b: number } };
  agency: string;
  region: string;
  typeName: string;
  typeUnit: string;
  brandMark: string;
  generatedAt: string;
  pageCount: number;
  wordCount: number;
  imageCount: number;
}

interface XlsxSheetCell {
  v: string | number;
  bold?: boolean;
  pill?: 'good' | 'warn' | 'risk';
}

interface XlsxSheet {
  name: string;
  rows: Array<Array<XlsxSheetCell>>;
  description: string;
  footer?: string;
  cardKind: 'summary' | 'detail' | 'template';
}

interface XlsxPlan {
  filename: string;
  sheets: XlsxSheet[];
  fileSizeKb: number;
  totalRows: number;
}

interface ReportBuilder {
  pdf: PdfPlan;
  xlsx: XlsxPlan;
}

function buildPdfPlan(state: ReportState, d: AgencyReportsData): PdfPlan {
  const m = d.metrics[state.type];
  const accentRgb = hexToRgb(state.accent);
  const brandMark =
    state.brandMode === 'co' ? `${d.agency.name} · WarmPulse Editorial` : d.agency.name;
  const sections: PdfPlanSection[] = SECTION_DEFS.filter((s) => state.sections[s.key]).map(
    (s) => ({ key: s.key, chapter: s.chapter, label: s.label }),
  );
  const subtitle = `Vol XII · ${TYPE_NAME[state.type]} Edition · ${isoToday()}`;
  // Word count — a stable approximation of editorial body. Each section
  // contributes a fixed weight so the inspector reads the same number
  // before and after the user toggles a section.
  const wordPerSection: Record<SectionKey, number> = {
    cover: 22,
    summary: 96,
    kpi: 40,
    breakdown: m.rows.length * 12,
    trends: m.rows.length * 6,
    footer: 14,
  };
  const wordCount = sections.reduce((acc, s) => acc + wordPerSection[s.key], 0);
  const imageCount =
    (state.sections.cover ? 1 : 0) + (state.sections.trends ? 1 : 0);
  const pageCount = sections.length >= 5 ? 2 : 1;
  return {
    filename: `${slugAgency(d.agency.name)}-${state.type}-${isoToday()}.pdf`,
    title: state.title,
    subtitle,
    pullQuote: m.pullQuote,
    headline: m.headline,
    rows: m.rows,
    summary: m.summary,
    sections,
    accent: { hex: state.accent, rgb: accentRgb },
    agency: d.agency.name,
    region: d.agency.region,
    typeName: TYPE_NAME[state.type],
    typeUnit: TYPE_UNIT[state.type],
    brandMark,
    generatedAt: fmtClock(new Date()),
    pageCount,
    wordCount,
    imageCount,
  };
}

function statusUpper(s: 'good' | 'warn' | 'risk'): string {
  if (s === 'good') return 'OK';
  if (s === 'warn') return 'WATCH';
  return 'RISK';
}

function buildXlsxWorkbook(state: ReportState, d: AgencyReportsData): XlsxPlan {
  const m = d.metrics[state.type];
  // SUMMARY sheet — large key/value rows that print as a balance sheet.
  const summaryRows: Array<Array<XlsxSheetCell>> = [
    [{ v: 'Field', bold: true }, { v: 'Value', bold: true }],
    [{ v: 'Agency' }, { v: d.agency.name }],
    [{ v: 'Region' }, { v: d.agency.region }],
    [{ v: 'Report type' }, { v: TYPE_NAME[state.type] }],
    [{ v: 'Title' }, { v: state.title }],
    [{ v: 'Generated' }, { v: fmtClock(new Date()) }],
    [{ v: 'Headline' }, { v: m.headline }],
    [{ v: 'Pull quote' }, { v: m.pullQuote }],
    [{ v: 'Total' }, { v: m.summary.total }],
    [{ v: 'Average' }, { v: m.summary.avg }],
    [{ v: 'High' }, { v: m.summary.high }],
    [{ v: 'Low' }, { v: m.summary.low }],
  ];

  // DETAIL sheet — proper tabular ledger, every sub-client row, with a
  // footer totals row at the bottom (sum of value column + avg delta).
  const detailHeader: Array<XlsxSheetCell> = [
    { v: 'Sub-client', bold: true },
    { v: 'Domain', bold: true },
    { v: `Value (${TYPE_UNIT[state.type]})`, bold: true },
    { v: 'Delta', bold: true },
    { v: 'Status', bold: true },
  ];
  const detailBody: Array<Array<XlsxSheetCell>> = m.rows.map((r) => [
    { v: r.subClient },
    { v: r.domain },
    { v: r.value },
    { v: r.delta },
    { v: statusUpper(r.status), pill: r.status },
  ]);
  const totalValue = m.rows.reduce((acc, r) => acc + r.value, 0);
  const avgDelta =
    m.rows.length > 0
      ? Math.round((m.rows.reduce((acc, r) => acc + r.delta, 0) / m.rows.length) * 10) / 10
      : 0;
  const detailFooter: Array<XlsxSheetCell> = [
    { v: 'TOTAL / AVG', bold: true },
    { v: '—' },
    { v: totalValue, bold: true },
    { v: avgDelta, bold: true },
    { v: '' },
  ];
  const detailRows: Array<Array<XlsxSheetCell>> = [
    detailHeader,
    ...detailBody,
    detailFooter,
  ];

  // TEMPLATE sheet — config snapshot. Renders as a two-column "field:
  // value" listing so the workbook captures the editorial style guide.
  const sectionsList = SECTION_DEFS.filter((s) => state.sections[s.key])
    .map((s) => s.label)
    .join(' · ');
  const recipientsList = d.subClients
    .filter((s) => state.recipients.includes(s.id))
    .map((s) => s.name)
    .join(', ');
  const templateRows: Array<Array<XlsxSheetCell>> = [
    [{ v: 'Setting', bold: true }, { v: 'Value', bold: true }],
    [{ v: 'Title' }, { v: state.title }],
    [{ v: 'Type' }, { v: TYPE_NAME[state.type] }],
    [{ v: 'Sections enabled' }, { v: sectionsList }],
    [{ v: 'Accent' }, { v: state.accent }],
    [{ v: 'Typeface' }, { v: state.typeface === 'serif' ? 'Serif (Georgia)' : 'Sans (System)' }],
    [{ v: 'Brand mode' }, { v: state.brandMode === 'co' ? 'Co-brand' : 'White-label' }],
    [{ v: 'Recipients' }, { v: recipientsList || '—' }],
    [{ v: 'Agency' }, { v: d.agency.name }],
    [{ v: 'Region' }, { v: d.agency.region }],
    [{ v: 'Generated' }, { v: fmtClock(new Date()) }],
  ];

  const sheets: XlsxSheet[] = [
    {
      name: 'Summary',
      rows: summaryRows,
      description: 'High-level balance sheet for the active edition.',
      footer: `${summaryRows.length} field rows`,
      cardKind: 'summary',
    },
    {
      name: 'Detail',
      rows: detailRows,
      description: `Per sub-client ${TYPE_NAME[state.type].toLowerCase()} ledger with totals row.`,
      footer: `${m.rows.length} sub-client rows · totals at bottom`,
      cardKind: 'detail',
    },
    {
      name: 'Template',
      rows: templateRows,
      description: 'Editorial style-guide snapshot — every config the editor signed off.',
      footer: `${templateRows.length - 1} field rows`,
      cardKind: 'template',
    },
  ];

  const totalRows = sheets.reduce((acc, s) => acc + s.rows.length, 0);
  // File-size estimate — used in the inspector. Real .xlsx files for
  // this row count land in the 14–28kB band; we anchor at 14kB and add
  // 0.4kB per row.
  const fileSizeKb = Math.max(12, Math.round(14 + totalRows * 0.4));

  return {
    filename: `${slugAgency(d.agency.name)}-${state.type}-${isoToday()}.xlsx`,
    sheets,
    fileSizeKb,
    totalRows,
  };
}

// ---------------------------------------------------------------------------
// PDF writer — consumes `PdfPlan`. The editorial framing translates
// directly into the file: top accent band, serif title, pull quote
// flanked by margin marks, summary band, autoTable for the breakdown,
// trend bar overlay, signed-off colophon footer.
// ---------------------------------------------------------------------------

function writePdf(plan: PdfPlan): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const w = 595;
  const h = 842;
  const accent = plan.accent.rgb;
  // Track active section keys so we can conditionally emit blocks.
  const sectionSet = new Set(plan.sections.map((s) => s.key));
  let y = 0;

  if (sectionSet.has('cover')) {
    doc.setFillColor(accent.r, accent.g, accent.b);
    doc.rect(0, 0, w, 70, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text(plan.brandMark.toUpperCase(), 40, 28);
    doc.setFontSize(9);
    doc.setFont('times', 'normal');
    doc.text(plan.subtitle, 40, 46);
    doc.setFontSize(9);
    doc.text(`Folio 1 / ${plan.pageCount}`, w - 40, 28, { align: 'right' });
    doc.text(`Region · ${plan.region}`, w - 40, 46, { align: 'right' });
    y = 100;

    doc.setTextColor(20, 20, 20);
    doc.setFont('times', 'bold');
    doc.setFontSize(24);
    doc.text(plan.title, 40, y, { maxWidth: w - 80 });
    y += 24;
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(120, 80, 50);
    doc.text(`${plan.typeName} edition · Galley signed by editor`, 40, y);
    y += 20;
  } else {
    y = 60;
    doc.setFont('times', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    doc.text(plan.title, 40, y, { maxWidth: w - 80 });
    y += 30;
  }

  if (sectionSet.has('summary')) {
    doc.setDrawColor(accent.r, accent.g, accent.b);
    doc.setLineWidth(1.5);
    doc.line(40, y - 4, 64, y - 4);
    y += 8;
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Editorial', 40, y);
    y += 18;
    doc.setFont('times', 'normal');
    doc.setFontSize(13);
    doc.text(plan.headline, 40, y, { maxWidth: w - 80 });
    y += 22;
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(80, 60, 40);
    doc.text(`"${plan.pullQuote}"`, 56, y, { maxWidth: w - 100 });
    y += 30;
  }

  if (sectionSet.has('kpi')) {
    const labels: Array<{ label: string; value: string }> = [
      { label: 'TOTAL', value: String(plan.summary.total) },
      { label: 'AVERAGE', value: `${plan.summary.avg}${plan.typeUnit}` },
      { label: 'HIGH', value: String(plan.summary.high) },
      { label: 'LOW', value: String(plan.summary.low) },
    ];
    const cellW = (w - 80) / 4;
    doc.setDrawColor(220, 200, 175);
    doc.setLineWidth(0.8);
    doc.rect(40, y, w - 80, 56);
    for (let i = 0; i < 4; i++) {
      const cx = 40 + cellW * i;
      if (i > 0) doc.line(cx, y, cx, y + 56);
      const cell = labels[i];
      if (!cell) continue;
      doc.setFont('times', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120, 80, 50);
      doc.text(cell.label, cx + 10, y + 18);
      doc.setFont('times', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text(cell.value, cx + 10, y + 42);
    }
    y += 76;
  }

  if (sectionSet.has('breakdown')) {
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Breakdown · Per sub-client', 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [['Sub-client', 'Domain', 'Value', 'Δ', 'Status']],
      body: plan.rows.map((r) => [
        r.subClient,
        r.domain,
        `${r.value}${plan.typeUnit}`,
        `${r.delta >= 0 ? '+' : ''}${r.delta}`,
        statusUpper(r.status),
      ]),
      headStyles: {
        fillColor: [accent.r, accent.g, accent.b],
        textColor: [255, 255, 255],
        font: 'times',
        fontStyle: 'bold',
      },
      bodyStyles: { font: 'times', fontSize: 9 },
      alternateRowStyles: { fillColor: [253, 246, 234] },
      margin: { left: 40, right: 40 },
    });
    const docWithTable = doc as unknown as { lastAutoTable?: { finalY: number } };
    y = (docWithTable.lastAutoTable?.finalY ?? y) + 18;
  }

  if (sectionSet.has('trends') && y < h - 200) {
    doc.setFont('times', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Trend bars · By sub-client', 40, y);
    y += 14;
    const barAreaW = w - 80;
    const barAreaH = 90;
    doc.setDrawColor(220, 200, 175);
    doc.rect(40, y, barAreaW, barAreaH);
    const maxV = Math.max(...plan.rows.map((r) => r.value), 1);
    const gap = 6;
    const slotW = (barAreaW - gap * (plan.rows.length + 1)) / plan.rows.length;
    plan.rows.forEach((r, i) => {
      const bh = (r.value / maxV) * (barAreaH - 18);
      const bx = 40 + gap + i * (slotW + gap);
      const by = y + barAreaH - bh - 4;
      doc.setFillColor(accent.r, accent.g, accent.b);
      doc.rect(bx, by, slotW, bh, 'F');
      doc.setFont('times', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(60, 40, 30);
      doc.text(r.subClient.split(' ')[0] ?? '', bx + slotW / 2, y + barAreaH - 1, {
        align: 'center',
      });
    });
    y += barAreaH + 14;
  }

  if (sectionSet.has('footer')) {
    doc.setDrawColor(220, 200, 175);
    doc.line(40, h - 60, w - 40, h - 60);
    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(140, 100, 70);
    doc.text(`${plan.agency} · ${plan.typeName} · Galley signed off ${plan.generatedAt}`, 40, h - 40);
    doc.setFont('times', 'normal');
    doc.text(`Folio 1 of ${plan.pageCount} · WarmPulse Editorial`, w - 40, h - 40, {
      align: 'right',
    });
  }

  doc.save(plan.filename);
}

// ---------------------------------------------------------------------------
// XLSX writer — consumes `XlsxPlan`. The workbook is byte-identical in
// rows to what the ledger-card preview renders, sheet-for-sheet.
// ---------------------------------------------------------------------------

function writeXlsx(plan: XlsxPlan): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of plan.sheets) {
    const aoa: Array<Array<string | number>> = sheet.rows.map((row) =>
      row.map((c) => c.v),
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, plan.filename);
}

// ---------------------------------------------------------------------------
// Masthead — editorial publication band at the top of the page. The
// publication name uses serif display; the issue line uses small caps.
// The right side carries the dual export controls and the preview-mode
// toggle.
// ---------------------------------------------------------------------------

type PreviewMode = 'pdf' | 'xlsx';

interface MastheadProps {
  agencyName: string;
  type: ReportType;
  mode: PreviewMode;
  setMode: (m: PreviewMode) => void;
  onPdf: () => void;
  onXlsx: () => void;
  pageCount: number;
  wordCount: number;
  sheetCount: number;
}

function Masthead({
  agencyName,
  type,
  mode,
  setMode,
  onPdf,
  onXlsx,
  pageCount,
  wordCount,
  sheetCount,
}: MastheadProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '14px 22px',
        background: C.cream,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        minHeight: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* watermark hairline */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-linear-gradient(135deg, transparent 0 18px, color-mix(in srgb, ${C.accent} 4%, transparent) 18px 19px)`,
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: C.bg,
            border: `2px solid ${C.accent}`,
            display: 'grid',
            placeItems: 'center',
            color: C.accent,
            boxShadow: `0 4px 16px color-mix(in srgb, ${C.accent} 24%, transparent)`,
          }}
        >
          <ScrollText size={22} />
        </div>
        <div>
          <div
            style={{
              ...SERIF,
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
            }}
          >
            WarmPulse Editorial · {agencyName}
          </div>
          <div
            style={{
              ...SERIF,
              fontStyle: 'italic',
              fontSize: 12,
              color: C.textDim,
              marginTop: 4,
              letterSpacing: '0.03em',
            }}
          >
            Vol XII · {TYPE_NAME[type]} Edition · {isoToday()} · {nicePeriod()}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'relative',
        }}
      >
        <ModeToggle mode={mode} setMode={setMode} />
        <span
          style={{
            fontSize: 11,
            color: C.textDim,
            ...MONO,
            paddingLeft: 6,
            paddingRight: 6,
            opacity: 0.7,
          }}
        >
          {mode === 'pdf'
            ? `${pageCount}p · ${wordCount}w`
            : `${sheetCount} sheets`}
        </span>
        <button
          type="button"
          onClick={onPdf}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: C.accent,
            border: `1px solid ${C.accent}`,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            boxShadow: `0 6px 16px color-mix(in srgb, ${C.accent} 30%, transparent)`,
            ...SANS,
          }}
        >
          <Send size={13} /> Send to Press · PDF
        </button>
        <button
          type="button"
          onClick={onXlsx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'transparent',
            border: `1px solid ${C.accent}`,
            color: C.accent,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            ...SANS,
          }}
        >
          <FileSpreadsheet size={13} /> Export Ledger · XLSX
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModeToggle — segmented control flipping the centre canvas between PDF
// galley and the ledger-card preview. Uses `layoutId="m4-mode-slider"`
// so the active state slides smoothly with a spring.
// ---------------------------------------------------------------------------

function ModeToggle({
  mode,
  setMode,
}: {
  mode: PreviewMode;
  setMode: (m: PreviewMode) => void;
}): JSX.Element {
  const options: Array<{ id: PreviewMode; label: string; icon: typeof Printer }> = [
    { id: 'pdf', label: 'PDF', icon: FileText },
    { id: 'xlsx', label: 'XLSX', icon: FileSpreadsheet },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 4,
        gap: 4,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
      }}
    >
      {options.map((opt) => {
        const active = opt.id === mode;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 13px',
              borderRadius: 999,
              border: 'none',
              background: 'transparent',
              color: active ? '#fff' : C.textDim,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              zIndex: 1,
              ...MONO,
              transition: 'color 200ms ease',
            }}
          >
            {active ? (
              <motion.span
                layoutId="m4-mode-slider"
                transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 999,
                  background: C.accent,
                  boxShadow: `0 4px 12px color-mix(in srgb, ${C.accent} 30%, transparent)`,
                  zIndex: -1,
                }}
              />
            ) : null}
            <Icon size={12} strokeWidth={2.2} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style-guide rail (Column A) — four stacked cards: Edition controls,
// Editorial sections, Style guide, Distribution. Every card uses a
// cream tint, an italic serif header and a small chapter ornament.
// ---------------------------------------------------------------------------

interface StyleGuideRailProps {
  state: ReportState;
  setState: (patch: Partial<ReportState>) => void;
  toggleSection: (k: SectionKey) => void;
  subClients: AgencyReportsData['subClients'];
  toggleRecipient: (id: string) => void;
}

function StyleGuideRail({
  state,
  setState,
  toggleSection,
  subClients,
  toggleRecipient,
}: StyleGuideRailProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EditionCard state={state} setState={setState} />
      <SectionsCard state={state} toggleSection={toggleSection} />
      <StyleCard state={state} setState={setState} />
      <DistributionCard
        state={state}
        subClients={subClients}
        toggleRecipient={toggleRecipient}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RailCard — shared card chrome. Cream tint, italic serif header,
// chapter ornament on the left and an optional eyebrow on the right.
// ---------------------------------------------------------------------------

function RailCard({
  title,
  ornament,
  children,
  eyebrow,
}: {
  title: string;
  ornament: ReactNode;
  children: ReactNode;
  eyebrow?: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: C.cream,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 18,
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: `1px solid color-mix(in srgb, ${C.accent} 14%, transparent)`,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: C.bg,
            border: `1px solid color-mix(in srgb, ${C.accent} 35%, transparent)`,
            color: C.accent,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {ornament}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...SERIF,
              fontStyle: 'italic',
              fontSize: 16,
              color: C.text,
              fontWeight: 600,
              letterSpacing: '0.01em',
            }}
          >
            {title}
          </div>
          {eyebrow ? (
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                marginTop: 2,
                ...MONO,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {eyebrow}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditionCard — issue-tag pills for the four report types. Each pill is
// styled as a tear-strip with a small chapter Roman numeral on the left.
// ---------------------------------------------------------------------------

function EditionCard({
  state,
  setState,
}: {
  state: ReportState;
  setState: (patch: Partial<ReportState>) => void;
}): JSX.Element {
  return (
    <RailCard
      title="Edition"
      eyebrow="Choose the issue type"
      ornament={<BookOpen size={16} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TYPE_ORDER.map((t, i) => {
          const Icon = TYPE_ICON[t];
          const active = t === state.type;
          const chapter = ['I', 'II', 'III', 'IV'][i] ?? '';
          return (
            <motion.button
              key={t}
              whileHover={{ x: 2 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              type="button"
              onClick={() => setState({ type: t })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 8,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                  : C.bg,
                border: `1px solid ${active ? C.accent : C.border}`,
                color: active ? C.text : C.textDim,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                ...SANS,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: active ? C.accent : C.surface2,
                  color: active ? '#fff' : C.textDim,
                  display: 'grid',
                  placeItems: 'center',
                  ...SERIF,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {chapter}
              </span>
              <Icon size={14} style={{ color: active ? C.accent : C.textDim, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{TYPE_NAME[t]}</span>
              {active ? <Check size={13} style={{ color: C.accent }} /> : null}
            </motion.button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: C.bg,
          border: `1px dashed ${C.border}`,
          borderRadius: 8,
          fontSize: 11,
          color: C.textDim,
          ...SERIF,
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}
      >
        {TYPE_DESC[state.type]}
      </div>
    </RailCard>
  );
}

// ---------------------------------------------------------------------------
// SectionsCard — six chapter-marker pills. Each pill is a horizontal
// bar with a Roman numeral, the section label and the section hint.
// Clicking toggles the section.
// ---------------------------------------------------------------------------

function SectionsCard({
  state,
  toggleSection,
}: {
  state: ReportState;
  toggleSection: (k: SectionKey) => void;
}): JSX.Element {
  const enabledCount = SECTION_DEFS.filter((s) => state.sections[s.key]).length;
  return (
    <RailCard
      title="Sections"
      eyebrow={`${enabledCount} of ${SECTION_DEFS.length} chapters in print`}
      ornament={<ClipboardCheck size={16} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {SECTION_DEFS.map((def) => {
          const v = state.sections[def.key];
          return (
            <motion.button
              key={def.key}
              whileHover={{ x: 2 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              type="button"
              onClick={() => toggleSection(def.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 7,
                background: v
                  ? `color-mix(in srgb, ${C.accent} 10%, transparent)`
                  : C.bg,
                border: `1px solid ${v ? C.accent : C.border}`,
                color: v ? C.text : C.textDim,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                ...SANS,
              }}
            >
              <span
                style={{
                  ...SERIF,
                  fontSize: 11,
                  fontWeight: 700,
                  color: v ? C.accent : C.textDim,
                  width: 20,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {def.chapter}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: v ? C.text : C.textDim }}>
                  {def.label}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: v ? C.textDim : C.textFaint,
                    marginTop: 1,
                    ...SERIF,
                    fontStyle: 'italic',
                  }}
                >
                  {def.hint}
                </div>
              </div>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1.5px solid ${v ? C.accent : C.border}`,
                  background: v ? C.accent : 'transparent',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                {v ? <Check size={11} strokeWidth={3} color={C.bg} /> : null}
              </span>
            </motion.button>
          );
        })}
      </div>
    </RailCard>
  );
}

// ---------------------------------------------------------------------------
// StyleCard — accent inkwells, typeface switch, brand mode radios.
// ---------------------------------------------------------------------------

function StyleCard({
  state,
  setState,
}: {
  state: ReportState;
  setState: (patch: Partial<ReportState>) => void;
}): JSX.Element {
  return (
    <RailCard
      title="Style guide"
      eyebrow="Accent · typeface · branding"
      ornament={<PenSquare size={16} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Accent inkwells */}
        <div>
          <RailFieldLabel>Accent inkwell</RailFieldLabel>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {ACCENT_SWATCHES.map((sw) => {
              const active = sw.hex.toLowerCase() === state.accent.toLowerCase();
              return (
                <motion.button
                  key={sw.id}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => setState({ accent: sw.hex })}
                  title={sw.name}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: sw.hex,
                    border: `2px solid ${active ? C.text : 'transparent'}`,
                    cursor: 'pointer',
                    boxShadow: active
                      ? `0 0 0 2px color-mix(in srgb, ${sw.hex} 35%, transparent), inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 2px 4px rgba(255,255,255,0.25)`
                      : 'inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 2px 4px rgba(255,255,255,0.25)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {active ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Typeface switch */}
        <div>
          <RailFieldLabel>Typeface</RailFieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['serif', 'sans'] as const).map((tf) => {
              const active = state.typeface === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setState({ typeface: tf })}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: active
                      ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                      : C.bg,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    color: active ? C.text : C.textDim,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    ...(tf === 'serif' ? SERIF : SANS),
                  }}
                >
                  {tf === 'serif' ? 'Aa · Georgia' : 'Aa · Sans'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Brand mode */}
        <div>
          <RailFieldLabel>Brand mode</RailFieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { id: 'co', label: 'Co-brand', sub: 'Agency · WarmPulse' },
                { id: 'wl', label: 'White-label', sub: 'Agency only' },
              ] as const
            ).map((m) => {
              const active = state.brandMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setState({ brandMode: m.id })}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 6,
                    background: active
                      ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                      : C.bg,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    color: active ? C.text : C.textDim,
                    fontSize: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                    ...SANS,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `1.5px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent : 'transparent',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {active ? (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#fff',
                        }}
                      />
                    ) : null}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700 }}>{m.label}</span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 9,
                        color: C.textFaint,
                        ...SERIF,
                        fontStyle: 'italic',
                        marginTop: 1,
                      }}
                    >
                      {m.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </RailCard>
  );
}

function RailFieldLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: C.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        marginBottom: 8,
        ...SANS,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DistributionCard — multi-select recipient chips. Each sub-client is a
// chip with a mailbox badge.
// ---------------------------------------------------------------------------

function DistributionCard({
  state,
  subClients,
  toggleRecipient,
}: {
  state: ReportState;
  subClients: AgencyReportsData['subClients'];
  toggleRecipient: (id: string) => void;
}): JSX.Element {
  return (
    <RailCard
      title="Distribution"
      eyebrow={`${state.recipients.length} of ${subClients.length} on the list`}
      ornament={<Users size={16} />}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {subClients.map((sc) => {
          const active = state.recipients.includes(sc.id);
          return (
            <motion.button
              key={sc.id}
              whileHover={{ y: -1 }}
              type="button"
              onClick={() => toggleRecipient(sc.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 10px',
                borderRadius: 999,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                  : C.bg,
                border: `1px solid ${active ? C.accent : C.border}`,
                color: active ? C.text : C.textDim,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                ...SANS,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: active ? C.accent : C.surface2,
                  color: active ? '#fff' : C.textDim,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  ...SERIF,
                }}
              >
                {sc.name.slice(0, 1)}
              </span>
              {sc.name}
              <span
                style={{
                  fontSize: 9,
                  color: C.textFaint,
                  ...MONO,
                }}
              >
                {sc.mailboxCount}
              </span>
            </motion.button>
          );
        })}
      </div>
    </RailCard>
  );
}

// ---------------------------------------------------------------------------
// Galley canvas (Column B) — wraps the active stage (PDF galley vs.
// XLSX ledger cards) in a "proof status" badge at top and a folio
// signature footer at the bottom.
// ---------------------------------------------------------------------------

interface GalleyCanvasProps {
  mode: PreviewMode;
  setMode: (m: PreviewMode) => void;
  pdf: PdfPlan;
  xlsx: XlsxPlan;
  state: ReportState;
}

function GalleyCanvas({
  mode,
  setMode,
  pdf,
  xlsx,
  state,
}: GalleyCanvasProps): JSX.Element {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: '18px 24px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative',
        /* X scrolls so the fixed 540px proof sheet is reachable on mobile
           instead of being clipped; Y stays hidden to clip decorative bleed. */
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {/* proof status pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 999,
            background: `color-mix(in srgb, ${C.accent} 14%, transparent)`,
            border: `1px solid ${C.accent}`,
            color: C.accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            ...MONO,
          }}
        >
          <CheckCircle2 size={11} />
          Proof status · Approved for Press
        </div>

        {/* secondary toggle nested inside canvas — same layoutId */}
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* stage */}
      <div style={{ flex: 1, minHeight: 720, paddingTop: 6 }}>
        <AnimatePresence mode="wait">
          {mode === 'pdf' ? (
            <motion.div
              key="pdf-stage"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', justifyContent: 'center' }}
            >
              <PdfGalleyProof plan={pdf} state={state} />
            </motion.div>
          ) : (
            <motion.div
              key="xlsx-stage"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
            >
              <LedgerCardsPreview plan={xlsx} state={state} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* folio sign-off footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.textDim,
          ...SERIF,
          fontStyle: 'italic',
        }}
      >
        <span>
          Folio 1 of {mode === 'pdf' ? pdf.pageCount : xlsx.sheets.length} · Galley signed off
          by editor
        </span>
        <span style={{ ...MONO, fontStyle: 'normal', letterSpacing: '0.06em' }}>
          {fmtClock(new Date())}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PdfGalleyProof — actual galley-proof page wider than letter-size with
// editorial margin marks at the edges (small "+" crop indicators) and
// proofreader's marks subtly along the left margin. The body renders
// the EXACT PDF content but with publishing-house aesthetic.
// ---------------------------------------------------------------------------

function PdfGalleyProof({
  plan,
  state,
}: {
  plan: PdfPlan;
  state: ReportState;
}): JSX.Element {
  const sectionSet = useMemo(() => new Set(plan.sections.map((s) => s.key)), [plan.sections]);
  // Proofreader's marks down the left margin — six fixed glyphs the
  // editor would scribble in pencil during a galley pass.
  const proofMarks = ['¶', '#', '⁂', '⏎', '☞', '✓'];
  const useSerifBody = state.typeface === 'serif';
  return (
    <motion.div
      whileHover={{ rotateZ: 0.1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      style={{
        position: 'relative',
        width: 540,
        background: C.paper,
        color: '#1a0d05',
        boxShadow: C.paperShadow,
        borderRadius: 4,
        overflow: 'visible',
        padding: '0 0 32px',
        transformOrigin: 'top center',
      }}
    >
      {/* corner crop marks — four "+" indicators just outside the page */}
      <CornerMark x={-12} y={-12} />
      <CornerMark x={540 + 12} y={-12} />
      <CornerMark x={-12} y="100%" />
      <CornerMark x={540 + 12} y="100%" />

      {/* proofreader's marks along the left margin */}
      <div
        style={{
          position: 'absolute',
          left: -34,
          top: 80,
          bottom: 80,
          width: 24,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          color: 'color-mix(in srgb, #9a6b4d 50%, transparent)',
          fontFamily: '"Georgia", serif',
          fontSize: 14,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        {proofMarks.map((mark, i) => (
          <span key={i} style={{ display: 'block' }}>
            {mark}
          </span>
        ))}
      </div>

      {/* cover band */}
      {sectionSet.has('cover') ? (
        <div
          style={{
            background: state.accent,
            color: '#fff',
            padding: '24px 36px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              opacity: 0.92,
              ...SERIF,
            }}
          >
            {plan.brandMark}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              marginTop: 8,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
              ...SERIF,
            }}
          >
            {plan.title}
          </div>
          <div
            style={{
              fontSize: 11,
              marginTop: 8,
              opacity: 0.92,
              ...SERIF,
              fontStyle: 'italic',
            }}
          >
            {plan.subtitle}
          </div>
          <div
            style={{
              position: 'absolute',
              right: -40,
              top: -20,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 60%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : (
        <div style={{ paddingTop: 28 }} />
      )}

      <div style={{ padding: '24px 36px' }}>
        {/* editorial */}
        {sectionSet.has('summary') ? (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel chapter="II" label="Editorial" accent={state.accent} />
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                lineHeight: 1.4,
                color: '#1a0d05',
                marginBottom: 12,
                marginTop: 6,
                ...SERIF,
              }}
            >
              {plan.headline}
            </div>
            <div
              style={{
                fontSize: 12,
                fontStyle: 'italic',
                color: '#3a2a1f',
                lineHeight: 1.6,
                paddingLeft: 16,
                borderLeft: `3px solid ${state.accent}`,
                position: 'relative',
                ...SERIF,
              }}
            >
              <Quote
                size={14}
                style={{
                  position: 'absolute',
                  left: -8,
                  top: -2,
                  background: C.paper,
                  color: state.accent,
                  padding: '0 1px',
                }}
              />
              {plan.pullQuote}
            </div>
          </div>
        ) : null}

        {/* figures (KPI) */}
        {sectionSet.has('kpi') ? (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel chapter="III" label="Figures" accent={state.accent} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                border: `1px solid ${C.paperEdge}`,
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 8,
              }}
            >
              {[
                { label: 'Total', value: plan.summary.total },
                { label: 'Average', value: `${plan.summary.avg}${plan.typeUnit}` },
                { label: 'High', value: plan.summary.high },
                { label: 'Low', value: plan.summary.low },
              ].map((k, i) => (
                <div
                  key={k.label}
                  style={{
                    padding: '14px 14px',
                    borderRight: i < 3 ? `1px solid ${C.paperEdge}` : 'none',
                    background: i % 2 === 0 ? '#fdf6ea' : '#f9eed8',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#9a6b4d',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      ...SERIF,
                    }}
                  >
                    {k.label}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: state.accent,
                      marginTop: 4,
                      ...SERIF,
                    }}
                  >
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* breakdown */}
        {sectionSet.has('breakdown') ? (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel chapter="IV" label="Breakdown" accent={state.accent} />
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11,
                marginTop: 8,
                ...(useSerifBody ? SERIF : SANS),
              }}
            >
              <thead>
                <tr style={{ background: state.accent, color: '#fff' }}>
                  <th
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Sub-client
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Domain
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Value
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Δ
                  </th>
                  <th
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r, i) => (
                  <tr
                    key={r.domain}
                    style={{ background: i % 2 === 0 ? '#fdf6ea' : '#f9eed8' }}
                  >
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${C.paperEdge}`,
                        fontWeight: 600,
                      }}
                    >
                      {r.subClient}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${C.paperEdge}`,
                        color: '#6b4a35',
                        fontStyle: 'italic',
                      }}
                    >
                      {r.domain}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${C.paperEdge}`,
                        textAlign: 'right',
                        fontWeight: 700,
                        color: state.accent,
                        ...MONO,
                        fontStyle: 'normal',
                      }}
                    >
                      {r.value}
                      {plan.typeUnit}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${C.paperEdge}`,
                        textAlign: 'right',
                        color: r.delta >= 0 ? '#9a4a14' : '#c84514',
                        fontWeight: 700,
                        ...MONO,
                      }}
                    >
                      {r.delta >= 0 ? '+' : ''}
                      {r.delta}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${C.paperEdge}`,
                      }}
                    >
                      <ProofStatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* trend bars */}
        {sectionSet.has('trends') ? (
          <div style={{ marginBottom: 28 }}>
            <SectionLabel chapter="V" label="Trend bars" accent={state.accent} />
            <TrendBars rows={plan.rows} accent={state.accent} />
          </div>
        ) : null}

        {/* footer / colophon */}
        {sectionSet.has('footer') ? (
          <div
            style={{
              borderTop: `1px solid ${C.paperEdge}`,
              paddingTop: 12,
              marginTop: 8,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: '#9a6b4d',
              ...SERIF,
              fontStyle: 'italic',
            }}
          >
            <span>
              {plan.agency} · {plan.typeName} · {plan.generatedAt}
            </span>
            <span>Folio 1 of {plan.pageCount} · WarmPulse Editorial</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Decorative section label — Roman chapter numeral + label, with a tiny
// rule under it. Pulled out so every section block stays uniform.
// ---------------------------------------------------------------------------

function SectionLabel({
  chapter,
  label,
  accent,
}: {
  chapter: string;
  label: string;
  accent: string;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          ...SERIF,
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          letterSpacing: '0.12em',
          paddingRight: 8,
          borderRight: `1px solid ${C.paperEdge}`,
        }}
      >
        {chapter}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#9a6b4d',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          ...SERIF,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          height: 1,
          background: `linear-gradient(to right, ${C.paperEdge}, transparent)`,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CornerMark — small "+" crop indicator at the page corners. Mirrors a
// real galley proof where corner marks indicate trim and bleed.
// ---------------------------------------------------------------------------

function CornerMark({ x, y }: { x: number | string; y: number | string }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: typeof x === 'number' ? x : undefined,
        right: typeof x === 'string' ? 0 : undefined,
        top: typeof y === 'number' ? y : undefined,
        bottom: typeof y === 'string' ? 0 : undefined,
        transform:
          typeof x === 'string' && typeof y === 'string'
            ? 'translate(12px, 12px)'
            : typeof x === 'string'
              ? 'translate(12px, 0)'
              : typeof y === 'string'
                ? 'translate(0, 12px)'
                : undefined,
        width: 14,
        height: 14,
        color: 'color-mix(in srgb, #9a6b4d 60%, transparent)',
        fontSize: 16,
        lineHeight: '14px',
        textAlign: 'center',
        pointerEvents: 'none',
        ...SERIF,
      }}
      aria-hidden
    >
      +
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProofStatusPill — colour-coded status chip on the paper. Stays inside
// the orange-amber-ember band, no green / red / blue.
// ---------------------------------------------------------------------------

function ProofStatusPill({ status }: { status: 'good' | 'warn' | 'risk' }): JSX.Element {
  const cfg =
    status === 'good'
      ? { bg: '#fde4cf', color: '#9a4a14', label: 'OK' }
      : status === 'warn'
        ? { bg: '#fff0d6', color: '#c97706', label: 'WATCH' }
        : { bg: '#fbd7c4', color: '#c84514', label: 'RISK' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        ...MONO,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TrendBars — the inline bar chart that appears on the galley proof.
// Mirrors the bar chart the PDF writer drops into the file so the two
// stay consistent.
// ---------------------------------------------------------------------------

function TrendBars({
  rows,
  accent,
}: {
  rows: AgencyReportsData['metrics'][ReportType]['rows'];
  accent: string;
}): JSX.Element {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        height: 130,
        background: '#f9eed8',
        padding: '12px 16px',
        borderRadius: 4,
        border: `1px solid ${C.paperEdge}`,
        marginTop: 8,
      }}
    >
      {rows.map((r) => {
        const hpx = (r.value / max) * 95;
        return (
          <div
            key={r.domain}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#3a2a1f',
                ...MONO,
              }}
            >
              {r.value}
            </div>
            <div
              style={{
                width: 18,
                height: `${hpx}px`,
                background: accent,
                borderRadius: '2px 2px 0 0',
                boxShadow: `0 -2px 6px color-mix(in srgb, ${accent} 30%, transparent)`,
              }}
            />
            <div
              style={{
                fontSize: 8,
                color: '#6b4a35',
                textAlign: 'center',
                lineHeight: 1.1,
                ...SERIF,
                fontStyle: 'italic',
              }}
            >
              {r.subClient.split(' ')[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LedgerCardsPreview — XLSX mode body. The workbook is rendered as a
// stack of polished ledger cards, one per sheet. A sheet selector at
// top scrolls to the chosen card.
// ---------------------------------------------------------------------------

function LedgerCardsPreview({
  plan,
  state,
}: {
  plan: XlsxPlan;
  state: ReportState;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeSheet, setActiveSheet] = useState<string>(plan.sheets[0]?.name ?? 'Summary');

  function scrollToCard(name: string): void {
    setActiveSheet(name);
    const node = cardRefs.current[name];
    const container = containerRef.current;
    if (!node || !container) return;
    const target = node.offsetTop - container.offsetTop - 8;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function registerCardRef(name: string): (el: HTMLDivElement | null) => void {
    return (el) => {
      cardRefs.current[name] = el;
    };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* sheet selector chips */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 10,
          background: C.cream,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
        }}
      >
        {plan.sheets.map((s) => {
          const active = s.name === activeSheet;
          return (
            <motion.button
              key={s.name}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              type="button"
              onClick={() => scrollToCard(s.name)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 14px',
                borderRadius: 999,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 18%, transparent)`
                  : C.bg,
                border: `1px solid ${active ? C.accent : C.border}`,
                color: active ? C.accent : C.textDim,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                ...MONO,
              }}
            >
              <SheetIcon kind={s.cardKind} />
              {s.name}
            </motion.button>
          );
        })}
      </div>

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: 700,
          overflowY: 'auto',
          padding: '4px 4px 12px',
          scrollBehavior: 'smooth',
        }}
      >
        {plan.sheets.map((sheet, idx) => (
          <motion.div
            key={sheet.name}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08, duration: 0.35 }}
            ref={registerCardRef(sheet.name)}
          >
            <LedgerCard
              sheet={sheet}
              index={idx + 1}
              total={plan.sheets.length}
              state={state}
              onVisible={() => setActiveSheet(sheet.name)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SheetIcon — small lucide glyph per ledger sheet kind. Reads as a
// subtle marker in the selector chips and the card header.
// ---------------------------------------------------------------------------

function SheetIcon({ kind }: { kind: 'summary' | 'detail' | 'template' }): JSX.Element {
  if (kind === 'summary') return <Sigma size={12} />;
  if (kind === 'detail') return <Table2 size={12} />;
  return <Layers size={12} />;
}

// ---------------------------------------------------------------------------
// LedgerCard — single card for one sheet. Cream tint, top accent border,
// soft shadow, drop-cap title, content area renders per-kind.
// ---------------------------------------------------------------------------

function LedgerCard({
  sheet,
  index,
  total,
  state,
  onVisible,
}: {
  sheet: XlsxSheet;
  index: number;
  total: number;
  state: ReportState;
  onVisible: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            onVisible();
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [onVisible]);

  return (
    <div
      ref={ref}
      style={{
        background: C.cream,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 32,
        position: 'relative',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
    >
      {/* top accent border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: C.accent,
        }}
      />

      {/* drop-cap-style title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 8,
            background: C.accent,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            ...SERIF,
            fontSize: 26,
            fontWeight: 700,
            boxShadow: `0 6px 16px color-mix(in srgb, ${C.accent} 30%, transparent)`,
            flexShrink: 0,
          }}
        >
          {sheet.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...SERIF,
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.005em',
              lineHeight: 1.15,
            }}
          >
            {sheet.name}
            {sheet.cardKind === 'detail' ? ` · ${sheet.rows.length - 2} rows` : ''}
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.textDim,
              marginTop: 4,
              ...SERIF,
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            {sheet.description}
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 11px',
            borderRadius: 999,
            background: C.bg,
            border: `1px solid ${C.border}`,
            color: C.accent,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            ...MONO,
            flexShrink: 0,
          }}
        >
          <Bookmark size={10} />
          Page {index} / {total}
        </div>
      </div>

      {/* per-kind content */}
      {sheet.cardKind === 'summary' ? (
        <SummaryLedgerContent rows={sheet.rows} />
      ) : sheet.cardKind === 'detail' ? (
        <DetailLedgerContent rows={sheet.rows} />
      ) : (
        <TemplateLedgerContent rows={sheet.rows} state={state} />
      )}

      {/* footer with sheet stats */}
      <div
        style={{
          marginTop: 22,
          paddingTop: 14,
          borderTop: `1px dashed ${C.borderStrong}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: C.textDim,
          ...MONO,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileSpreadsheet size={11} style={{ color: C.accent }} />
          {sheet.footer ?? ''}
        </span>
        <span
          style={{
            ...SERIF,
            fontStyle: 'italic',
            fontSize: 11,
            color: C.textFaint,
          }}
        >
          Sheet {index} of {total}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryLedgerContent — balance-sheet styling for the Summary card.
// Key on the left, value (right-aligned monospace) on the right.
// ---------------------------------------------------------------------------

function SummaryLedgerContent({
  rows,
}: {
  rows: Array<Array<XlsxSheetCell>>;
}): JSX.Element {
  // skip the header row (rows[0])
  const dataRows = rows.slice(1);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      {dataRows.map((row, i) => {
        const k = row[0];
        const v = row[1];
        const keyLabel = k ? String(k.v) : '';
        const value = v ? v.v : '';
        const isNum = typeof value === 'number';
        const isOdd = i % 2 === 1;
        return (
          <div
            key={`r-${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 16,
              padding: '12px 18px',
              background: isOdd
                ? 'transparent'
                : `color-mix(in srgb, ${C.accent} 3%, transparent)`,
              borderBottom:
                i < dataRows.length - 1 ? `1px solid ${C.border}` : 'none',
            }}
          >
            <div
              style={{
                ...SERIF,
                fontSize: 13,
                fontWeight: 600,
                color: C.text,
                fontStyle: keyLabel === 'Pull quote' || keyLabel === 'Headline' ? 'italic' : 'normal',
              }}
            >
              {keyLabel}
            </div>
            <div
              style={{
                fontSize: isNum ? 16 : 13,
                fontWeight: isNum ? 700 : 500,
                color: isNum ? C.accent : C.text,
                textAlign: 'right',
                ...MONO,
                maxWidth: 420,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={String(value)}
            >
              {isNum ? formatNumber(Number(value)) : String(value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailLedgerContent — bordered table with bold serif column headers,
// full data rows, footer totals row at the bottom. Status pills mirror
// the ones on the galley proof so the two views are consistent.
// ---------------------------------------------------------------------------

function DetailLedgerContent({
  rows,
}: {
  rows: Array<Array<XlsxSheetCell>>;
}): JSX.Element {
  const header = rows[0];
  const body = rows.slice(1, -1);
  const footer = rows[rows.length - 1];
  if (!header || !footer) return <div />;
  return (
    <div
      style={{
        overflow: 'hidden',
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.bg,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: `color-mix(in srgb, ${C.accent} 16%, transparent)` }}>
            {header.map((cell, i) => (
              <th
                key={`h-${i}`}
                style={{
                  padding: '12px 14px',
                  textAlign:
                    i === 2 || i === 3 ? 'right' : 'left',
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.accent,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  ...SERIF,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {String(cell.v)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => {
            const isOdd = ri % 2 === 1;
            return (
              <tr
                key={`r-${ri}`}
                style={{
                  background: isOdd
                    ? 'transparent'
                    : `color-mix(in srgb, ${C.accent} 3%, transparent)`,
                }}
              >
                {row.map((cell, ci) => {
                  const isNum = typeof cell.v === 'number';
                  const align: 'left' | 'right' = ci === 2 || ci === 3 ? 'right' : 'left';
                  return (
                    <td
                      key={`c-${ri}-${ci}`}
                      style={{
                        padding: '10px 14px',
                        textAlign: align,
                        fontSize: 12,
                        color:
                          cell.pill ? C.text : isNum ? C.accent : C.text,
                        fontWeight: isNum ? 700 : 500,
                        borderBottom: `1px solid ${C.border}`,
                        ...(isNum ? MONO : SANS),
                      }}
                    >
                      {cell.pill ? (
                        <DetailStatusPill status={cell.pill} />
                      ) : isNum ? (
                        formatNumber(Number(cell.v))
                      ) : (
                        String(cell.v)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr
            style={{
              background: `color-mix(in srgb, ${C.accent} 10%, transparent)`,
              borderTop: `2px solid ${C.accent}`,
            }}
          >
            {footer.map((cell, i) => {
              const isNum = typeof cell.v === 'number';
              const align: 'left' | 'right' = i === 2 || i === 3 ? 'right' : 'left';
              return (
                <td
                  key={`f-${i}`}
                  style={{
                    padding: '12px 14px',
                    textAlign: align,
                    fontSize: 12,
                    fontWeight: 800,
                    color: isNum ? C.accent : C.text,
                    ...(isNum ? MONO : SERIF),
                  }}
                >
                  {isNum
                    ? formatNumber(Number(cell.v))
                    : String(cell.v)}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailStatusPill — colour-coded status chip used inside the Detail
// ledger card. Mirrors the on-paper pill but in dark-theme tones.
// ---------------------------------------------------------------------------

function DetailStatusPill({ status }: { status: 'good' | 'warn' | 'risk' }): JSX.Element {
  const cfg =
    status === 'good'
      ? { color: C.accent, label: 'OK' }
      : status === 'warn'
        ? { color: C.warning, label: 'WATCH' }
        : { color: C.accent3, label: 'RISK' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        background: `color-mix(in srgb, ${cfg.color} 18%, transparent)`,
        border: `1px solid ${cfg.color}`,
        color: cfg.color,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.1em',
        ...MONO,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TemplateLedgerContent — config snapshot rendered as a two-column
// field/value list. Accent value gets a swatch dot to read at a glance.
// ---------------------------------------------------------------------------

function TemplateLedgerContent({
  rows,
  state,
}: {
  rows: Array<Array<XlsxSheetCell>>;
  state: ReportState;
}): JSX.Element {
  const dataRows = rows.slice(1);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        background: C.bg,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        padding: 14,
      }}
    >
      {dataRows.map((row, i) => {
        const k = row[0];
        const v = row[1];
        const keyLabel = k ? String(k.v) : '';
        const value = v ? String(v.v) : '';
        return (
          <div
            key={`tpl-${i}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '10px 14px',
              background: C.surface,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              minHeight: 60,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                ...SANS,
              }}
            >
              {keyLabel}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: C.text,
                fontWeight: 600,
                ...SERIF,
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}
            >
              {keyLabel === 'Accent' ? (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: state.accent,
                    flexShrink: 0,
                    boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.18)',
                  }}
                />
              ) : null}
              <span style={{ flex: 1 }}>{value || '—'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fact-checker inspector (Column C) — switches its content based on
// preview mode. PDF mode shows page count / word count / image count.
// XLSX mode shows sheet breakdown + row counts + file size estimate.
// ---------------------------------------------------------------------------

interface InspectorProps {
  mode: PreviewMode;
  pdf: PdfPlan;
  xlsx: XlsxPlan;
  state: ReportState;
}

function FactCheckerInspector({
  mode,
  pdf,
  xlsx,
  state,
}: InspectorProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          background: C.cream,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingBottom: 12,
            borderBottom: `1px solid color-mix(in srgb, ${C.accent} 14%, transparent)`,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: C.bg,
              border: `1px solid color-mix(in srgb, ${C.accent} 35%, transparent)`,
              color: C.accent,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Eye size={16} />
          </div>
          <div>
            <div
              style={{
                ...SERIF,
                fontStyle: 'italic',
                fontSize: 16,
                color: C.text,
                fontWeight: 600,
              }}
            >
              Fact-checker
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                marginTop: 2,
                ...MONO,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {mode === 'pdf' ? 'Editorial notes' : 'Ledger details'}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'pdf' ? (
            <motion.div
              key="ins-pdf"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <InspectorRow
                label="Page count"
                value={`${pdf.pageCount}`}
                hint={pdf.pageCount === 1 ? 'A4 portrait · single folio' : 'A4 portrait · multi-folio'}
              />
              <InspectorRow
                label="Word count"
                value={`${pdf.wordCount}`}
                hint="Body copy across active chapters"
              />
              <InspectorRow
                label="Image count"
                value={`${pdf.imageCount}`}
                hint="Cover band · trend bars"
              />
              <InspectorRow
                label="Sections active"
                value={`${pdf.sections.length} / ${SECTION_DEFS.length}`}
                hint={pdf.sections.map((s) => s.label).join(' · ')}
              />
              <InspectorRow
                label="Accent"
                value={pdf.accent.hex.toUpperCase()}
                hint="Cover band · KPI strip · breakdown header"
                swatch={pdf.accent.hex}
              />
              <InspectorRow
                label="Brand mark"
                value={state.brandMode === 'co' ? 'Co-brand' : 'White-label'}
                hint={pdf.brandMark}
              />
            </motion.div>
          ) : (
            <motion.div
              key="ins-xlsx"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <InspectorRow
                label="Sheets"
                value={`${xlsx.sheets.length}`}
                hint={xlsx.sheets.map((s) => s.name).join(' · ')}
              />
              {xlsx.sheets.map((s) => (
                <InspectorRow
                  key={s.name}
                  label={s.name}
                  value={`${s.rows.length} rows`}
                  hint={s.description}
                />
              ))}
              <InspectorRow
                label="Total rows"
                value={`${xlsx.totalRows}`}
                hint="Header + body + totals across all sheets"
              />
              <InspectorRow
                label="File size"
                value={`~${xlsx.fileSizeKb}kB`}
                hint=".xlsx · BIFF compressed"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* tiny signature block — feels like the editor's stamp */}
      <div
        style={{
          background: C.cream,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            border: `2px dashed ${C.accent}`,
            display: 'grid',
            placeItems: 'center',
            color: C.accent,
            ...SERIF,
            fontStyle: 'italic',
            fontSize: 22,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          E.
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              ...MONO,
              marginBottom: 4,
            }}
          >
            Editor's signature
          </div>
          <div
            style={{
              ...SERIF,
              fontStyle: 'italic',
              fontSize: 14,
              color: C.text,
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            Approved for press, {nicePeriod()}.
          </div>
        </div>
        <Sparkles size={18} style={{ color: C.accent, flexShrink: 0 }} />
      </div>

      {/* recipients block — quick read of who'll get the file */}
      <div
        style={{
          background: C.cream,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <div
          style={{
            ...SERIF,
            fontStyle: 'italic',
            fontSize: 14,
            color: C.text,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          Distribution list
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {state.recipients.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: C.textFaint,
                ...SERIF,
                fontStyle: 'italic',
              }}
            >
              No recipients selected. Add some via the Distribution card.
            </div>
          ) : (
            state.recipients.map((id) => {
              const sc = SUB_CLIENTS.find((s) => s.id === id);
              if (!sc) return null;
              return (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                    fontSize: 12,
                    color: C.text,
                    ...SANS,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: C.accent,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      ...SERIF,
                    }}
                  >
                    {sc.name.slice(0, 1)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{sc.name}</span>
                  <span
                    style={{
                      fontSize: 10,
                      color: C.textDim,
                      ...MONO,
                    }}
                  >
                    {sc.domain}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function InspectorRow({
  label,
  value,
  hint,
  swatch,
}: {
  label: string;
  value: string;
  hint: string;
  swatch?: string;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '10px 12px',
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            ...SANS,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: C.accent,
            ...MONO,
          }}
        >
          {swatch ? (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: swatch,
                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.18)',
              }}
            />
          ) : null}
          {value}
        </span>
      </div>
      <span
        style={{
          fontSize: 11,
          color: C.textFaint,
          ...SERIF,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        {hint}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title editor — lives just below the masthead. Editorial-style giant
// title field with a small "issue label" pill that mirrors the active
// report type.
// ---------------------------------------------------------------------------

function TitleStrip({
  state,
  setState,
}: {
  state: ReportState;
  setState: (patch: Partial<ReportState>) => void;
}): JSX.Element {
  const Icon = TYPE_ICON[state.type];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 999,
          background: `color-mix(in srgb, ${C.accent} 14%, transparent)`,
          border: `1px solid ${C.accent}`,
          color: C.accent,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          ...MONO,
          flexShrink: 0,
        }}
      >
        <Icon size={12} />
        {TYPE_NAME[state.type]} · {state.brandMode === 'co' ? 'CO-BRAND' : 'WHITE-LABEL'}
      </span>
      <input
        value={state.title}
        onChange={(e) => setState({ title: e.target.value })}
        placeholder="Edition title…"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 18,
          fontWeight: 600,
          color: C.text,
          ...SERIF,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: C.textDim,
          ...SERIF,
          fontStyle: 'italic',
          flexShrink: 0,
        }}
      >
        {state.title.length} chars
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition — assemble masthead + title strip + three-column body.
// State lives on the root component so masthead exports, rail edits,
// and canvas previews all stay in sync.
// ---------------------------------------------------------------------------

export function AgRptM4Galley(
  { data }: { data?: AgencyReportsData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  const [state, setStateRaw] = useState<ReportState>(() => defaultReportState(d));
  const [mode, setMode] = useState<PreviewMode>('pdf');

  const setState = (patch: Partial<ReportState>): void => {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  };

  const toggleSection = (k: SectionKey): void => {
    setStateRaw((prev) => ({
      ...prev,
      sections: { ...prev.sections, [k]: !prev.sections[k] },
    }));
  };

  const toggleRecipient = (id: string): void => {
    setStateRaw((prev) => ({
      ...prev,
      recipients: prev.recipients.includes(id)
        ? prev.recipients.filter((r) => r !== id)
        : [...prev.recipients, id],
    }));
  };

  // The shared builder plan — derived once per state change. Both the
  // preview AND the exports consume this exact value. Updating any field
  // in the rail re-runs the memo and both views/exports re-render.
  const builder: ReportBuilder = useMemo(
    () => ({
      pdf: buildPdfPlan(state, d),
      xlsx: buildXlsxWorkbook(state, d),
    }),
    [state, d],
  );

  function handlePdf(): void {
    try {
      writePdf(builder.pdf);
      toast.success(`PDF galley sent to press · ${builder.pdf.filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed';
      toast.error(`PDF export failed: ${msg}`);
    }
  }

  function handleXlsx(): void {
    try {
      writeXlsx(builder.xlsx);
      toast.success(`XLSX ledger exported · ${builder.xlsx.filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XLSX export failed';
      toast.error(`XLSX export failed: ${msg}`);
    }
  }

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...SANS,
      }}
    >
      <Masthead
        agencyName={d.agency.name}
        type={state.type}
        mode={mode}
        setMode={setMode}
        onPdf={handlePdf}
        onXlsx={handleXlsx}
        pageCount={builder.pdf.pageCount}
        wordCount={builder.pdf.wordCount}
        sheetCount={builder.xlsx.sheets.length}
      />

      <TitleStrip state={state} setState={setState} />

      {/* Three-pane galley at ≥lg; stacks to a single column on tablet/mobile
          so the rigid ~1156px desktop layout doesn't force a page-wide scroll. */}
      <div
        className="grid items-start gap-[18px] grid-cols-1 lg:grid-cols-[minmax(300px,340px)_minmax(560px,1fr)_minmax(260px,280px)]"
      >
        <StyleGuideRail
          state={state}
          setState={setState}
          toggleSection={toggleSection}
          subClients={d.subClients}
          toggleRecipient={toggleRecipient}
        />

        <GalleyCanvas
          mode={mode}
          setMode={setMode}
          pdf={builder.pdf}
          xlsx={builder.xlsx}
          state={state}
        />

        <FactCheckerInspector
          mode={mode}
          pdf={builder.pdf}
          xlsx={builder.xlsx}
          state={state}
        />
      </div>

      {/* tiny tagline at the very bottom */}
      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: C.textFaint,
          ...SERIF,
          fontStyle: 'italic',
          paddingTop: 4,
        }}
      >
        Hand-set in {d.agency.region.toUpperCase()} · Galley signed off · Press queue open
      </div>
    </div>
  );
}

export default AgRptM4Galley;
