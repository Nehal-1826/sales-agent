import { useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Boxes,
  Check,
  Clock3,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Flame,
  Inbox,
  MailCheck,
  Palette,
  Printer,
  Receipt as ReceiptIcon,
  Send,
  Sparkles,
  Stamp,
  Target,
  Ticket,
  Wrench,
  ZapOff,
} from 'lucide-react';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';
import { formatNumber } from '@/lib/format';

/**
 * AgRptN4PrintShop — Agency-tier REPORTS surface, design candidate N4,
 * "Print Shop Service Counter".
 *
 * The agency reports surface re-imagined as a nostalgic neighbourhood
 * PRINT SHOP — Kinko's / FedEx Office / your-corner-copy-shop vibe —
 * but executed with modern typography and motion. Three vertical columns
 * compose the entire experience like a service counter you'd walk up to:
 *
 *   - COLUMN A · Order Form (left) — a receipt-style ticket where you
 *     spec the report: type, title, date range, sections, branding,
 *     accent. A big orange "Send to press" button submits the order.
 *
 *   - COLUMN B · Print Preview (center) — a stylised printer SVG sits at
 *     the top edge of the column. A letter-size sheet emerges from it
 *     (animated drop-down) and renders the actual report content — cover
 *     band, exec summary, KPI table, trends bar chart. Zoom controls let
 *     you preview at 75 / 100 / 125 / 150%.
 *
 *   - COLUMN C · Pickup Counter (right) — two physical-looking boxes,
 *     one PDF (red folder) one XLSX (green spreadsheet). Click → download.
 *     Below: a printed receipt of the current order, then the last few
 *     prior orders stacked as receipts.
 *
 * Aesthetic: receipt-style monospace typography on cream paper for the
 * order form and pickup receipts; clean modern sans for the printed
 * report itself. STRICT orange-only palette via `var(--wp-*)` tokens.
 *
 * REAL EXPORTS — `handlePdf` builds a real multi-page PDF via jsPDF +
 * jspdf-autotable (cover band, pull quote, full data table). `handleXlsx`
 * builds a real .xlsx via SheetJS with two sheets (Summary + Detail).
 * Both trigger a browser download and a toast.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Inline MOCK supplies every field so the design-preview harness mounts
 * it prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists.
 *
 * NOT a card grid, NOT a magazine, NOT a notebook (sibling N1 / N2 / N3
 * own those identities). The print-shop / service-counter framing —
 * order ticket + paper preview + pickup boxes — is the differentiator.
 */

// ---------------------------------------------------------------------------
// Inline data shape — when the prompt says "Local fallback (inline if N1
// not yet on disk)" we inline these types here. N1 isn't on disk yet so
// this file is self-contained: importing from a future N1 module would
// fail typecheck today.
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
// Mock data — Northwind Agency, 7 sub-clients, full per-type metric
// breakdowns so the print preview has real numbers to render at every
// zoom level. The pull quotes are intentionally editorial — a real
// agency owner would forward these directly to a client.
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
        'Reply rate up 28% vs. the previous 30 days. Orion and Helix together drove the lift.',
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
      headline: 'Inbox placement holds steady',
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
// Constants — names, icons, default order. Centralised so the columns
// stay in lockstep when the user flips between report types.
// ---------------------------------------------------------------------------

const TYPE_NAME: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Engagement',
  placement: 'Placement',
  white_label: 'White-label',
};

const TYPE_DESC: Record<ReportType, string> = {
  warmth: 'Reputation curve · per-mailbox score · 30d trend',
  engagement: 'Reply / open / star funnel · engagement velocity',
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

interface DateRange {
  id: '7d' | '30d' | '90d' | 'quarter' | 'custom';
  label: string;
}

const DATE_RANGES: DateRange[] = [
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
  { id: '90d', label: 'Last 90d' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'custom', label: 'Custom' },
];

type SectionKey = 'cover' | 'summary' | 'kpi' | 'breakdown' | 'trends' | 'footer';

interface SectionDef {
  key: SectionKey;
  label: string;
  hint: string;
}

const SECTION_DEFS: SectionDef[] = [
  { key: 'cover', label: 'Cover', hint: 'Title band · agency mark' },
  { key: 'summary', label: 'Exec summary', hint: 'Pull quote · headline number' },
  { key: 'kpi', label: 'KPI strip', hint: 'Total · avg · high · low' },
  { key: 'breakdown', label: 'Breakdown', hint: 'Per sub-client table' },
  { key: 'trends', label: 'Trends', hint: 'Bar chart · last 7 buckets' },
  { key: 'footer', label: 'Footer', hint: 'Page no · prepared by' },
];

const ACCENT_SWATCHES: Array<{ id: string; hex: string; name: string }> = [
  { id: 'coral', hex: '#F26522', name: 'Coral' },
  { id: 'tangerine', hex: '#FF8A4B', name: 'Tangerine' },
  { id: 'amber', hex: '#FF9670', name: 'Amber' },
  { id: 'sunset', hex: '#FFB454', name: 'Sunset' },
  { id: 'ember', hex: '#E5571A', name: 'Ember' },
];

// ---------------------------------------------------------------------------
// Receipt formatting helpers — pad, monospace align, etc.
// ---------------------------------------------------------------------------

function pad(s: string | number, n: number, side: 'left' | 'right' = 'right'): string {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n);
  const fill = ' '.repeat(n - str.length);
  return side === 'right' ? str + fill : fill + str;
}

function fmtClock(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeOrderNumber(seed: number): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `ND-${yyyy}-${mm}-${dd}-${String(1000 + (seed % 9000)).padStart(4, '0')}`;
}

interface ReceiptEntry {
  orderNumber: string;
  timestamp: string;
  type: ReportType;
  title: string;
  format: 'pdf' | 'xlsx';
  sizeKb: number;
}

const SEED_RECEIPTS: ReceiptEntry[] = [
  {
    orderNumber: 'ND-2026-12-03-3104',
    timestamp: '2026-12-03 16:22',
    type: 'placement',
    title: 'Q4 Portfolio Placement',
    format: 'pdf',
    sizeKb: 84,
  },
  {
    orderNumber: 'ND-2026-12-03-3102',
    timestamp: '2026-12-03 09:11',
    type: 'engagement',
    title: 'Orion Engagement Lift',
    format: 'xlsx',
    sizeKb: 42,
  },
  {
    orderNumber: 'ND-2026-12-02-3088',
    timestamp: '2026-12-02 17:04',
    type: 'warmth',
    title: 'Helix Warmth Trajectory',
    format: 'pdf',
    sizeKb: 96,
  },
  {
    orderNumber: 'ND-2026-12-01-3071',
    timestamp: '2026-12-01 13:48',
    type: 'white_label',
    title: 'Nimbus White-label Digest',
    format: 'pdf',
    sizeKb: 112,
  },
];

// ---------------------------------------------------------------------------
// Status colour map — three states, all on the orange-warning-danger
// continuum so we never reach for green/red/blue.
// ---------------------------------------------------------------------------

function statusLabel(s: 'good' | 'warn' | 'risk'): string {
  if (s === 'good') return 'OK';
  if (s === 'warn') return 'WATCH';
  return 'RISK';
}

// ---------------------------------------------------------------------------
// Decorative SVG — Printer with paper slot. Used at the top of the
// preview column. The paper appears to emerge from `outputY` — the
// emerging-paper animation in the column uses the same Y to align.
// ---------------------------------------------------------------------------

function PrinterSVG(): JSX.Element {
  return (
    <svg
      viewBox="0 0 360 120"
      width="360"
      height="120"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <linearGradient id="printer-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--wp-surface-2) 100%, transparent)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--wp-surface) 100%, transparent)" />
        </linearGradient>
      </defs>

      {/* shadow under the printer */}
      <ellipse cx="180" cy="118" rx="160" ry="6" fill="rgba(0,0,0,0.35)" />

      {/* main body */}
      <rect
        x="40"
        y="14"
        width="280"
        height="80"
        rx="10"
        fill="url(#printer-body)"
        stroke="var(--wp-border)"
        strokeWidth="1.5"
      />

      {/* top deck */}
      <rect
        x="60"
        y="6"
        width="240"
        height="16"
        rx="4"
        fill="var(--wp-surface)"
        stroke="var(--wp-border)"
        strokeWidth="1"
      />

      {/* paper feed slot — the slot from which the paper emerges */}
      <rect
        x="80"
        y="86"
        width="200"
        height="8"
        rx="2"
        fill="var(--wp-bg)"
        stroke="var(--wp-accent)"
        strokeWidth="1.5"
      />
      <line
        x1="84"
        y1="90"
        x2="276"
        y2="90"
        stroke="color-mix(in srgb, var(--wp-accent) 40%, transparent)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />

      {/* display panel */}
      <rect
        x="240"
        y="32"
        width="60"
        height="36"
        rx="6"
        fill="var(--wp-bg)"
        stroke="var(--wp-border)"
        strokeWidth="1"
      />
      <circle cx="252" cy="50" r="3" fill="var(--wp-accent)" />
      <text
        x="262"
        y="54"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fill="var(--wp-text)"
      >
        READY
      </text>

      {/* control buttons */}
      <circle cx="70" cy="50" r="6" fill="var(--wp-accent)" />
      <circle cx="90" cy="50" r="4" fill="var(--wp-warning)" />
      <circle cx="106" cy="50" r="4" fill="color-mix(in srgb, var(--wp-text-dim) 60%, transparent)" />
      <rect
        x="130"
        y="36"
        width="100"
        height="28"
        rx="4"
        fill="color-mix(in srgb, var(--wp-bg) 60%, transparent)"
        stroke="var(--wp-border)"
        strokeWidth="0.75"
      />
      <text
        x="180"
        y="54"
        textAnchor="middle"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fill="var(--wp-text-dim)"
      >
        NORTHWIND · MODEL 4-A
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PDF + XLSX generators — strictly real. jsPDF + jspdf-autotable for the
// PDF; SheetJS for the workbook. We keep both pure (no side-effects
// other than the browser save dialog and the success toast).
// ---------------------------------------------------------------------------

function buildPdf(
  d: AgencyReportsData,
  type: ReportType,
  title: string,
  accent: string,
): { sizeKb: number } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // top accent band
  const accentRgb = hexToRgb(accent);
  doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
  doc.rect(0, 0, 595, 60, 'F');

  // masthead text
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`${d.agency.name} · ${TYPE_NAME[type]} Report`, 40, 38);

  // subtitle
  doc.setTextColor(20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Prepared ${new Date().toISOString().slice(0, 10)} · Region ${d.agency.region}`, 40, 80);

  // title
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 108);

  // pull quote
  doc.setFontSize(11);
  doc.setFont('helvetica', 'italic');
  doc.text(d.metrics[type].pullQuote, 40, 130, { maxWidth: 515 });

  // summary band
  const s = d.metrics[type].summary;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(
    `TOTAL  ${s.total}     AVG  ${s.avg}${TYPE_UNIT[type]}     HIGH  ${s.high}     LOW  ${s.low}`,
    40,
    160,
  );

  // main table
  autoTable(doc, {
    startY: 180,
    head: [['Sub-client', 'Domain', 'Value', 'Δ', 'Status']],
    body: d.metrics[type].rows.map((r) => [
      r.subClient,
      r.domain,
      `${r.value}${TYPE_UNIT[type]}`,
      `${r.delta >= 0 ? '+' : ''}${r.delta}`,
      r.status.toUpperCase(),
    ]),
    headStyles: { fillColor: [accentRgb.r, accentRgb.g, accentRgb.b], textColor: [255, 255, 255] },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 244, 240] },
    margin: { left: 40, right: 40 },
  });

  // footer
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    `${d.agency.name} · ${TYPE_NAME[type]} · Generated by WarmPulse · Page 1 of 1`,
    40,
    820,
  );

  const filename = `${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${isoToday()}.pdf`;
  doc.save(filename);

  // approximate size — jsPDF doesn't expose blob size before save without
  // calling output(); we estimate from row count for the receipt entry.
  const sizeKb = 60 + d.metrics[type].rows.length * 4;
  return { sizeKb };
}

function buildXlsx(d: AgencyReportsData, type: ReportType, title: string): { sizeKb: number } {
  const wb = XLSX.utils.book_new();
  const s = d.metrics[type].summary;
  const summary: Array<Array<string | number>> = [
    ['Agency', d.agency.name],
    ['Region', d.agency.region],
    ['Report type', TYPE_NAME[type]],
    ['Title', title],
    ['Generated', new Date().toISOString()],
    [],
    ['Headline', d.metrics[type].headline],
    ['Pull quote', d.metrics[type].pullQuote],
    [],
    ['Total', s.total],
    ['Average', s.avg],
    ['High', s.high],
    ['Low', s.low],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const detail: Array<Array<string | number>> = [
    ['Sub-client', 'Domain', `Value (${TYPE_UNIT[type]})`, 'Δ', 'Status'],
    ...d.metrics[type].rows.map(
      (r) => [r.subClient, r.domain, r.value, r.delta, r.status] as Array<string | number>,
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Detail');

  // a third sheet listing every sub-client in the agency portfolio
  const roster: Array<Array<string | number>> = [
    ['Sub-client', 'Domain', 'Mailbox count'],
    ...d.subClients.map(
      (c) => [c.name, c.domain, c.mailboxCount] as Array<string | number>,
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roster), 'Roster');

  const filename = `${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${isoToday()}.xlsx`;
  XLSX.writeFile(wb, filename);

  const sizeKb = 30 + d.metrics[type].rows.length * 2;
  return { sizeKb };
}

// ---------------------------------------------------------------------------
// Small util — hex to {r,g,b}, with fallback to coral if the input
// isn't a valid 3- or 6-char hex.
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

// ---------------------------------------------------------------------------
// Theme constants — central reads of the WarmPulse tokens so refactors
// stay narrow.
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
  accentHover: 'var(--wp-accent-hover, #FF7B38)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
  // Receipt / paper cream — explicit color-mix recipes for repeat use.
  cream: 'color-mix(in srgb, var(--wp-warning, #ffb454) 6%, var(--wp-surface, #12121a))',
  creamStrong: 'color-mix(in srgb, var(--wp-warning, #ffb454) 12%, var(--wp-surface, #12121a))',
  paper: '#fdf7ee',
  paperShadow:
    '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 8px rgba(0,0,0,0.35), 0 24px 60px rgba(0,0,0,0.45)',
};

const MONO: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.02em',
};

// ---------------------------------------------------------------------------
// HeaderBand — print-shop signage at the top of the page. Includes
// the shop name, order number, status pill, and the 4 report-type
// pills the user can click to swap the active type.
// ---------------------------------------------------------------------------

interface HeaderBandProps {
  shopName: string;
  region: string;
  orderNumber: string;
  pressBusy: boolean;
  type: ReportType;
  setType: (t: ReportType) => void;
}

function HeaderBand({
  shopName,
  region,
  orderNumber,
  pressBusy,
  type,
  setType,
}: HeaderBandProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '20px 24px',
        background: C.cream,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* corner stamp */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 30%, transparent) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* shop signage left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            border: `2px solid ${C.accent}`,
            background: C.bg,
            display: 'grid',
            placeItems: 'center',
            color: C.accent,
            boxShadow: `0 4px 16px color-mix(in srgb, ${C.accent} 20%, transparent)`,
          }}
        >
          <Printer size={28} strokeWidth={2.2} />
        </div>
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: C.text,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
            }}
          >
            <span>{shopName} Print Shop</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Agency Edition
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 6,
              fontSize: 12,
              color: C.textDim,
              ...MONO,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Ticket size={12} /> ORDER #{orderNumber}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Clock3 size={12} /> Hours 09:00 – 18:00 {region.toUpperCase()}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 10px',
                borderRadius: 999,
                background: pressBusy
                  ? `color-mix(in srgb, ${C.warning} 16%, transparent)`
                  : `color-mix(in srgb, ${C.accent} 16%, transparent)`,
                color: pressBusy ? C.warning : C.accent,
                border: `1px solid ${pressBusy ? C.warning : C.accent}`,
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: 10,
                letterSpacing: '0.12em',
              }}
            >
              {pressBusy ? <Activity size={11} /> : <Sparkles size={11} />}{' '}
              {pressBusy ? 'PRESS RUNNING' : 'PRESS OPEN'}
            </span>
          </div>
        </div>
      </div>

      {/* type pills right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {TYPE_ORDER.map((t) => {
          const Icon = TYPE_ICON[t];
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 999,
                border: `1px solid ${active ? C.accent : C.border}`,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 18%, transparent)`
                  : 'transparent',
                color: active ? C.accent : C.textDim,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 160ms ease',
              }}
            >
              <Icon size={13} />
              {TYPE_NAME[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrderForm (Column A) — receipt-style form. Every label is monospace
// uppercase. Every field is a click-to-edit pill or input. The form
// always reflects state in the parent.
// ---------------------------------------------------------------------------

interface OrderFormState {
  type: ReportType;
  title: string;
  dateRange: DateRange['id'];
  sections: Record<SectionKey, boolean>;
  brandLogo: 'co' | 'wl';
  accent: string;
}

interface OrderFormProps {
  form: OrderFormState;
  setForm: (patch: Partial<OrderFormState>) => void;
  setSection: (k: SectionKey, v: boolean) => void;
  onSendToPress: () => void;
  busy: boolean;
}

function OrderForm({
  form,
  setForm,
  setSection,
  onSendToPress,
  busy,
}: OrderFormProps): JSX.Element {
  const checks = SECTION_DEFS.reduce<number>(
    (acc, def) => acc + (form.sections[def.key] ? 1 : 0),
    0,
  );
  return (
    <div
      style={{
        background: C.cream,
        border: `1.5px dashed ${C.border}`,
        borderRadius: 14,
        padding: 22,
        position: 'relative',
        ...MONO,
      }}
    >
      {/* perforated top edge */}
      <div
        style={{
          position: 'absolute',
          top: -1,
          left: 12,
          right: 12,
          height: 3,
          background: `repeating-linear-gradient(90deg, ${C.borderStrong} 0 6px, transparent 6px 12px)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: C.textDim,
              textTransform: 'uppercase',
            }}
          >
            Order Ticket
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 4 }}>
            Spec your report
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 9px',
            borderRadius: 4,
            background: C.bg,
            border: `1px solid ${C.border}`,
            color: C.accent,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
          }}
        >
          <ReceiptIcon size={11} />
          {checks}/6 SECTIONS
        </div>
      </div>

      {/* TYPE */}
      <FieldLabel>· Type</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        {TYPE_ORDER.map((t) => {
          const Icon = TYPE_ICON[t];
          const active = t === form.type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ type: t })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 9px',
                borderRadius: 6,
                border: `1px solid ${active ? C.accent : C.border}`,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                  : C.bg,
                color: active ? C.accent : C.text,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                ...MONO,
              }}
            >
              <Icon size={12} />
              {TYPE_NAME[t]}
            </button>
          );
        })}
      </div>

      {/* TITLE */}
      <FieldLabel>· Title</FieldLabel>
      <input
        value={form.title}
        onChange={(e) => setForm({ title: e.target.value })}
        style={{
          width: '100%',
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          color: C.text,
          padding: '8px 10px',
          fontSize: 12,
          marginBottom: 14,
          outline: 'none',
          ...MONO,
        }}
        placeholder="Q4 Portfolio Review"
      />

      {/* RANGE */}
      <FieldLabel>· Range</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {DATE_RANGES.map((r) => {
          const active = r.id === form.dateRange;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setForm({ dateRange: r.id })}
              style={{
                padding: '5px 9px',
                borderRadius: 4,
                border: `1px solid ${active ? C.accent : C.border}`,
                background: active
                  ? `color-mix(in srgb, ${C.accent} 14%, transparent)`
                  : C.bg,
                color: active ? C.accent : C.textDim,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                ...MONO,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* SECTIONS */}
      <FieldLabel>· Sections</FieldLabel>
      <div
        style={{
          display: 'grid',
          gap: 5,
          marginBottom: 14,
          padding: 10,
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
        }}
      >
        {SECTION_DEFS.map((def) => {
          const v = form.sections[def.key];
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => setSection(def.key, !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 5,
                border: `1px solid ${v ? C.accent : 'transparent'}`,
                background: v ? `color-mix(in srgb, ${C.accent} 8%, transparent)` : 'transparent',
                color: v ? C.text : C.textDim,
                fontSize: 11,
                cursor: 'pointer',
                width: '100%',
                ...MONO,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: `1px solid ${v ? C.accent : C.border}`,
                    background: v ? C.accent : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    color: C.bg,
                  }}
                >
                  {v ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {def.label}
                </span>
              </span>
              <span style={{ fontSize: 9, color: C.textFaint }}>{def.hint}</span>
            </button>
          );
        })}
      </div>

      {/* BRANDING */}
      <FieldLabel>· Branding</FieldLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <BrandRadio
          active={form.brandLogo === 'co'}
          label="Co-brand"
          onClick={() => setForm({ brandLogo: 'co' })}
        />
        <BrandRadio
          active={form.brandLogo === 'wl'}
          label="White-label"
          onClick={() => setForm({ brandLogo: 'wl' })}
        />
      </div>

      {/* ACCENT */}
      <FieldLabel>· Accent</FieldLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {ACCENT_SWATCHES.map((sw) => {
          const active = sw.hex.toLowerCase() === form.accent.toLowerCase();
          return (
            <button
              key={sw.id}
              type="button"
              onClick={() => setForm({ accent: sw.hex })}
              title={sw.name}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                background: sw.hex,
                border: `2px solid ${active ? C.text : C.border}`,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                position: 'relative',
              }}
            >
              {active ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>

      {/* DIVIDER */}
      <div
        style={{
          height: 1,
          background: `repeating-linear-gradient(90deg, ${C.border} 0 4px, transparent 4px 8px)`,
          margin: '16px 0',
        }}
      />

      {/* SEND TO PRESS */}
      <button
        type="button"
        disabled={busy}
        onClick={onSendToPress}
        style={{
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '12px 16px',
          borderRadius: 8,
          border: `1px solid ${C.accent}`,
          background: busy
            ? `color-mix(in srgb, ${C.accent} 60%, transparent)`
            : C.accent,
          color: '#fff',
          fontSize: 13,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          cursor: busy ? 'not-allowed' : 'pointer',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: `0 6px 16px color-mix(in srgb, ${C.accent} 32%, transparent)`,
          ...MONO,
        }}
      >
        <Send size={14} />
        {busy ? 'Printing…' : 'Send to press'}
        {busy ? (
          <motion.span
            initial={{ x: '-100%' }}
            animate={{ x: '120%' }}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '40%',
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            }}
          />
        ) : null}
      </button>

      {/* small footer */}
      <div
        style={{
          marginTop: 14,
          fontSize: 10,
          color: C.textFaint,
          textAlign: 'center',
          letterSpacing: '0.04em',
          ...MONO,
        }}
      >
        Press queues your draft. Pickup at the counter.
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: C.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        marginBottom: 6,
        ...MONO,
      }}
    >
      {children}
    </div>
  );
}

function BrandRadio({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '7px 9px',
        borderRadius: 5,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? `color-mix(in srgb, ${C.accent} 14%, transparent)` : C.bg,
        color: active ? C.accent : C.text,
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        ...MONO,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PreviewMode — center column can flip between a PDF/paper preview and
// an XLSX/spreadsheet preview. The toggle is a small two-button
// segmented control above the printer SVG; it uses a `framer-motion`
// `layoutId` slider so the active state animates smoothly.
// ---------------------------------------------------------------------------

type PreviewMode = 'pdf' | 'xlsx';

interface PreviewModeToggleProps {
  mode: PreviewMode;
  setMode: (m: PreviewMode) => void;
}

function PreviewModeToggle({ mode, setMode }: PreviewModeToggleProps): JSX.Element {
  const options: Array<{ id: PreviewMode; label: string; icon: typeof Printer }> = [
    { id: 'pdf', label: 'PDF Paper', icon: Printer },
    { id: 'xlsx', label: 'XLSX Sheet', icon: FileSpreadsheet },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: C.bg,
          border: `1px solid ${C.border}`,
          position: 'relative',
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
                gap: 7,
                padding: '7px 14px',
                borderRadius: 999,
                border: 'none',
                background: 'transparent',
                color: active ? '#fff' : C.textDim,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                zIndex: 1,
                transition: 'color 200ms ease',
                ...MONO,
              }}
            >
              {active ? (
                <motion.span
                  layoutId="preview-mode-slider"
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
              <Icon size={13} strokeWidth={2.2} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaperPreview (Column B) — printer SVG at top, animated letter-size
// page below. Page renders the actual report content (cover, summary,
// kpi strip, breakdown table, mini trends bar chart). When `previewMode`
// flips to "xlsx" we swap the printer/paper stage for a spreadsheet
// preview that keeps the print-shop chrome. The existing printer/paper
// animation is preserved untouched — it just hides until you toggle
// back to "pdf".
// ---------------------------------------------------------------------------

interface PaperPreviewProps {
  data: AgencyReportsData;
  form: OrderFormState;
  zoom: number;
  setZoom: (n: number) => void;
  paperKey: number;
  previewMode: PreviewMode;
  setPreviewMode: (m: PreviewMode) => void;
}

function PaperPreview({
  data,
  form,
  zoom,
  setZoom,
  paperKey,
  previewMode,
  setPreviewMode,
}: PaperPreviewProps): JSX.Element {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: '0 16px 22px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* preview-mode toggle — flips the stage between PDF paper and XLSX sheet */}
      <PreviewModeToggle mode={previewMode} setMode={setPreviewMode} />

      <AnimatePresence mode="wait">
        {previewMode === 'pdf' ? (
          <motion.div
            key="pdf-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* printer area */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                marginTop: -8,
                marginBottom: -8,
                position: 'relative',
                zIndex: 2,
              }}
            >
              <PrinterSVG />
            </div>

            {/* zoom controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 8,
                marginBottom: 16,
              }}
            >
              {[75, 100, 125, 150].map((z) => {
                const active = z === zoom;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active
                        ? `color-mix(in srgb, ${C.accent} 16%, transparent)`
                        : 'transparent',
                      color: active ? C.accent : C.textDim,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      ...MONO,
                    }}
                  >
                    {z}%
                  </button>
                );
              })}
            </div>

            {/* paper stage */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                minHeight: 720,
                paddingTop: 4,
                overflow: 'hidden',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`paper-${paperKey}-${zoom}-${form.type}`}
                  initial={{ opacity: 0, y: -180 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <Sheet data={data} form={form} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* paper status */}
            <div
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontSize: 11,
                color: C.textDim,
                ...MONO,
              }}
            >
              A4 · 1 page · ~
              {Math.round(60 + data.metrics[form.type].rows.length * 4)}KB estimated
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="xlsx-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SpreadsheetPreview data={data} form={form} paperKey={paperKey} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpreadsheetPreview — XLSX-mode body for the center column. Wraps a
// Google-Sheets / Excel-style grid in print-shop envelope chrome so it
// reads as "fresh off the press". Three sheet tabs at the bottom
// (Summary · Detail · Roster) mirror the three sheets `buildXlsx`
// writes; the rendered rows are EXACTLY the rows that the export
// produces, so the preview is faithful to the downloaded file.
// ---------------------------------------------------------------------------

type SheetTab = 'summary' | 'detail' | 'roster';

interface SpreadsheetPreviewProps {
  data: AgencyReportsData;
  form: OrderFormState;
  paperKey: number;
}

function SpreadsheetPreview({
  data,
  form,
  paperKey,
}: SpreadsheetPreviewProps): JSX.Element {
  const [tab, setTab] = useState<SheetTab>('summary');

  // Re-derive the EXACT row arrays the buildXlsx generator uses for
  // each sheet — keeping these in sync is critical so the preview shows
  // what the user is about to download. Any drift here is a bug.
  const summaryRows: Array<Array<string | number>> = useMemo(() => {
    const s = data.metrics[form.type].summary;
    return [
      ['Agency', data.agency.name],
      ['Region', data.agency.region],
      ['Report type', TYPE_NAME[form.type]],
      ['Title', form.title],
      ['Generated', new Date().toISOString()],
      [],
      ['Headline', data.metrics[form.type].headline],
      ['Pull quote', data.metrics[form.type].pullQuote],
      [],
      ['Total', s.total],
      ['Average', s.avg],
      ['High', s.high],
      ['Low', s.low],
    ];
  }, [data, form.type, form.title]);

  const detailRows: Array<Array<string | number>> = useMemo(() => {
    return [
      ['Sub-client', 'Domain', `Value (${TYPE_UNIT[form.type]})`, 'Δ', 'Status'],
      ...data.metrics[form.type].rows.map(
        (r) => [r.subClient, r.domain, r.value, r.delta, r.status] as Array<string | number>,
      ),
    ];
  }, [data, form.type]);

  const rosterRows: Array<Array<string | number>> = useMemo(() => {
    return [
      ['Sub-client', 'Domain', 'Mailbox count'],
      ...data.subClients.map(
        (c) => [c.name, c.domain, c.mailboxCount] as Array<string | number>,
      ),
    ];
  }, [data]);

  const tabs: Array<{ id: SheetTab; label: string; rows: Array<Array<string | number>> }> = [
    { id: 'summary', label: 'Summary', rows: summaryRows },
    { id: 'detail', label: 'Detail', rows: detailRows },
    { id: 'roster', label: 'Roster', rows: rosterRows },
  ];

  const activeRows = tabs.find((t) => t.id === tab)?.rows ?? summaryRows;
  // Rows total = data rows on each sheet. Header rows count once per sheet,
  // matching what an XLSX viewer would report at the bottom-left.
  const totalRows = summaryRows.length + (detailRows.length - 1) + (rosterRows.length - 1);
  const lastUpdate = fmtClock(new Date());

  return (
    <div style={{ paddingTop: 14 }}>
      {/* envelope chrome — frames the spreadsheet with print-shop styling */}
      <div
        style={{
          background: C.cream,
          border: `1px dashed ${C.borderStrong}`,
          borderRadius: 14,
          padding: 14,
          position: 'relative',
        }}
      >
        {/* perforated top edge — matches the order ticket aesthetic */}
        <div
          style={{
            position: 'absolute',
            top: -1,
            left: 12,
            right: 12,
            height: 3,
            background: `repeating-linear-gradient(90deg, ${C.borderStrong} 0 6px, transparent 6px 12px)`,
          }}
        />

        {/* "fresh off the press" envelope header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
            ...MONO,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 10,
              fontWeight: 800,
              color: C.textDim,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
            }}
          >
            <FileSpreadsheet size={12} style={{ color: C.accent }} /> Fresh off the press · Workbook
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 9px',
              borderRadius: 4,
              background: C.bg,
              border: `1px solid ${C.border}`,
              color: C.accent,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.12em',
            }}
          >
            <Stamp size={10} /> REPRINT #{paperKey.toString().padStart(3, '0')}
          </div>
        </div>

        {/* spreadsheet shell — Excel / Sheets aesthetic */}
        <SpreadsheetGrid rows={activeRows} />

        {/* sheet tab bar at the bottom */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            marginTop: 10,
            paddingTop: 8,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  position: 'relative',
                  padding: '8px 16px',
                  background: active ? C.bg : 'transparent',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  color: active ? C.accent : C.textDim,
                  fontSize: 11,
                  fontWeight: active ? 800 : 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  ...MONO,
                }}
              >
                {t.label}
                {active ? (
                  <span
                    style={{
                      position: 'absolute',
                      left: 8,
                      right: 8,
                      bottom: -1,
                      height: 2,
                      background: C.accent,
                      borderRadius: 2,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontSize: 10,
              color: C.textFaint,
              letterSpacing: '0.06em',
              ...MONO,
            }}
          >
            {activeRows.length} rows
          </div>
        </div>
      </div>

      {/* bottom shop-receipt status under the spreadsheet preview */}
      <div
        style={{
          marginTop: 14,
          padding: '10px 14px',
          background: C.bg,
          border: `1px dashed ${C.border}`,
          borderRadius: 8,
          textAlign: 'center',
          fontSize: 11,
          color: C.textDim,
          letterSpacing: '0.04em',
          ...MONO,
        }}
      >
        Sheets: 3 · Rows total: {totalRows} · Last update: {lastUpdate}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpreadsheetGrid — Google Sheets / Excel-style table. Column-letter
// strip across the top (A / B / C …), row-number strip down the left
// (1 / 2 / 3 …), bold orange-tinted header row, alternating-tint body,
// thin grey cell borders, and a subtle orange selection outline on A1
// as a visual hint that the user can interact.
// ---------------------------------------------------------------------------

function SpreadsheetGrid({
  rows,
}: {
  rows: Array<Array<string | number>>;
}): JSX.Element {
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const colLetters = Array.from({ length: cols }, (_, i) => String.fromCharCode(65 + i));
  const headerTint = `color-mix(in srgb, ${C.accent} 18%, ${C.surface})`;
  const rowAlt = `color-mix(in srgb, ${C.accent} 4%, ${C.surface})`;

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        overflow: 'hidden',
        ...MONO,
      }}
    >
      {/* column letter strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `36px repeat(${cols}, minmax(0, 1fr))`,
          background: C.surface2,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            padding: '4px 6px',
            borderRight: `1px solid ${C.border}`,
            background: C.surface2,
          }}
        />
        {colLetters.map((letter) => (
          <div
            key={letter}
            style={{
              padding: '4px 8px',
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: C.textDim,
              borderRight: `1px solid ${C.border}`,
              letterSpacing: '0.04em',
            }}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* data rows with row-number strip */}
      {rows.map((row, rowIdx) => {
        const isHeader = rowIdx === 0;
        const isEven = rowIdx % 2 === 0;
        const rowBg = isHeader ? headerTint : isEven ? C.surface : rowAlt;
        return (
          <div
            key={`row-${rowIdx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: `36px repeat(${cols}, minmax(0, 1fr))`,
              borderBottom: `1px solid ${C.border}`,
              background: rowBg,
            }}
          >
            <div
              style={{
                padding: '6px 6px',
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: C.textDim,
                borderRight: `1px solid ${C.border}`,
                background: C.surface2,
              }}
            >
              {rowIdx + 1}
            </div>
            {colLetters.map((_letter, colIdx) => {
              const value = row[colIdx];
              const isNum = typeof value === 'number';
              const isA1 = rowIdx === 0 && colIdx === 0;
              return (
                <div
                  key={`cell-${rowIdx}-${colIdx}`}
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    color: isHeader ? C.accent : C.text,
                    fontWeight: isHeader ? 800 : isNum ? 600 : 500,
                    textAlign: isNum ? 'right' : 'left',
                    borderRight: `1px solid ${C.border}`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    letterSpacing: isHeader ? '0.06em' : 0,
                    textTransform: isHeader ? 'uppercase' : 'none',
                    position: 'relative',
                    outline: isA1
                      ? `2px solid color-mix(in srgb, ${C.accent} 55%, transparent)`
                      : 'none',
                    outlineOffset: isA1 ? '-2px' : 0,
                  }}
                  title={value === undefined || value === null ? '' : String(value)}
                >
                  {value === undefined || value === null
                    ? ''
                    : isNum
                      ? formatNumber(Number(value))
                      : String(value)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet — the rendered letter-size paper. Pure-CSS approximation of the
// actual PDF output: cover band, exec summary, KPI strip, breakdown
// table, mini bar chart. Honours `sections` flags from the form so
// toggling them updates the preview live.
// ---------------------------------------------------------------------------

function Sheet({ data, form }: { data: AgencyReportsData; form: OrderFormState }): JSX.Element {
  const m = data.metrics[form.type];
  const max = Math.max(...m.rows.map((r) => r.value), 1);
  return (
    <div
      style={{
        width: 480,
        background: C.paper,
        color: '#1a0d05',
        borderRadius: 4,
        boxShadow: C.paperShadow,
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
      }}
    >
      {/* cover band */}
      {form.sections.cover ? (
        <div
          style={{
            background: form.accent,
            color: '#fff',
            padding: '22px 28px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.2em',
              opacity: 0.85,
              textTransform: 'uppercase',
            }}
          >
            {form.brandLogo === 'co' ? `${data.agency.name} · WarmPulse` : data.agency.name}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              marginTop: 6,
              letterSpacing: '-0.01em',
            }}
          >
            {form.title}
          </div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9 }}>
            {TYPE_NAME[form.type]} · {DATE_RANGES.find((r) => r.id === form.dateRange)?.label} ·{' '}
            {isoToday()}
          </div>
          {/* subtle decorative stripes */}
          <div
            style={{
              position: 'absolute',
              right: -30,
              top: -10,
              width: 120,
              height: 120,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 60%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : null}

      <div style={{ padding: '22px 28px' }}>
        {/* exec summary */}
        {form.sections.summary ? (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#9a6b4d',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Executive Summary
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#1a0d05',
                lineHeight: 1.35,
                marginBottom: 8,
              }}
            >
              {m.headline}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#3a2a1f',
                fontStyle: 'italic',
                lineHeight: 1.55,
                paddingLeft: 12,
                borderLeft: `3px solid ${form.accent}`,
              }}
            >
              "{m.pullQuote}"
            </div>
          </div>
        ) : null}

        {/* KPI strip */}
        {form.sections.kpi ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 0,
              marginBottom: 22,
              border: `1px solid #e8d4bc`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {[
              { label: 'Total', value: m.summary.total },
              { label: 'Avg', value: `${m.summary.avg}${TYPE_UNIT[form.type]}` },
              { label: 'High', value: m.summary.high },
              { label: 'Low', value: m.summary.low },
            ].map((k, i) => (
              <div
                key={k.label}
                style={{
                  padding: '10px 12px',
                  borderRight: i < 3 ? `1px solid #e8d4bc` : 'none',
                  background: i % 2 === 0 ? '#fdf7ee' : '#fbf1e2',
                }}
              >
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#9a6b4d',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: form.accent,
                    marginTop: 2,
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* breakdown table */}
        {form.sections.breakdown ? (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#9a6b4d',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Breakdown · Per Sub-client
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: form.accent, color: '#fff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>
                    Sub-client
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>
                    Domain
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                    Value
                  </th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Δ</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r, i) => (
                  <tr
                    key={r.domain}
                    style={{ background: i % 2 === 0 ? '#fdf7ee' : '#fbf1e2' }}
                  >
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #e8d4bc',
                        fontWeight: 600,
                      }}
                    >
                      {r.subClient}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #e8d4bc',
                        color: '#6b4a35',
                      }}
                    >
                      {r.domain}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #e8d4bc',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: form.accent,
                      }}
                    >
                      {r.value}
                      {TYPE_UNIT[form.type]}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #e8d4bc',
                        textAlign: 'right',
                        color: r.delta >= 0 ? '#9a4a14' : '#c84514',
                        fontWeight: 600,
                      }}
                    >
                      {r.delta >= 0 ? '+' : ''}
                      {r.delta}
                    </td>
                    <td
                      style={{ padding: '6px 8px', borderBottom: '1px solid #e8d4bc' }}
                    >
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background:
                            r.status === 'good'
                              ? '#fde4cf'
                              : r.status === 'warn'
                                ? '#fff0d6'
                                : '#fbd7c4',
                          color:
                            r.status === 'good'
                              ? '#9a4a14'
                              : r.status === 'warn'
                                ? '#c97706'
                                : '#c84514',
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* trends bar chart */}
        {form.sections.trends ? (
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#9a6b4d',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Trends · By Sub-client
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-around',
                height: 120,
                background: '#fbf1e2',
                padding: '8px 14px',
                borderRadius: 4,
                border: `1px solid #e8d4bc`,
              }}
            >
              {m.rows.map((r) => {
                const h = (r.value / max) * 95;
                return (
                  <div
                    key={r.domain}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      flex: 1,
                    }}
                  >
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#3a2a1f' }}>
                      {r.value}
                    </div>
                    <div
                      style={{
                        width: 18,
                        height: `${h}px`,
                        background: form.accent,
                        borderRadius: '2px 2px 0 0',
                        boxShadow: `0 -2px 6px color-mix(in srgb, ${form.accent} 30%, transparent)`,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 7,
                        color: '#6b4a35',
                        textAlign: 'center',
                        lineHeight: 1.1,
                      }}
                    >
                      {r.subClient.split(' ')[0]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* footer */}
        {form.sections.footer ? (
          <div
            style={{
              borderTop: `1px solid #e8d4bc`,
              paddingTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 9,
              color: '#9a6b4d',
            }}
          >
            <span>
              {data.agency.name} · {TYPE_NAME[form.type]}
            </span>
            <span>Page 1 of 1</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PickupCounter (Column C) — two physical-looking export boxes (PDF /
// XLSX) + a printed receipt of the current order + a stack of recent
// orders displayed as small receipt cards.
// ---------------------------------------------------------------------------

interface PickupCounterProps {
  agencyName: string;
  type: ReportType;
  title: string;
  orderNumber: string;
  receipts: ReceiptEntry[];
  onPdf: () => void;
  onXlsx: () => void;
  pressBusy: boolean;
  previewMode: PreviewMode;
}

function PickupCounter({
  agencyName,
  type,
  title,
  orderNumber,
  receipts,
  onPdf,
  onXlsx,
  pressBusy,
  previewMode,
}: PickupCounterProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: C.textDim,
              textTransform: 'uppercase',
              ...MONO,
            }}
          >
            Pickup Counter
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 4 }}>
            Pick up your report
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 9px',
            borderRadius: 999,
            background: `color-mix(in srgb, ${C.accent} 14%, transparent)`,
            color: C.accent,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            ...MONO,
          }}
        >
          <Boxes size={11} /> 2 FORMATS
        </div>
      </div>

      {/* two export boxes — the one matching the active preview-mode gets
          a subtle orange ring so the user knows what the center column
          is currently showing. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ExportBox
          format="pdf"
          icon={<FileText size={28} />}
          label="PDF"
          subtitle="Portable Document"
          disabled={pressBusy}
          onClick={onPdf}
          highlighted={previewMode === 'pdf'}
        />
        <ExportBox
          format="xlsx"
          icon={<FileSpreadsheet size={28} />}
          label="XLSX"
          subtitle="Spreadsheet"
          disabled={pressBusy}
          onClick={onXlsx}
          highlighted={previewMode === 'xlsx'}
        />
      </div>

      {/* current order receipt */}
      <div
        style={{
          background: C.cream,
          border: `1px dashed ${C.borderStrong}`,
          borderRadius: 10,
          padding: 16,
          ...MONO,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -1,
            left: 12,
            right: 12,
            height: 3,
            background: `repeating-linear-gradient(90deg, ${C.borderStrong} 0 5px, transparent 5px 10px)`,
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: C.textDim,
            textTransform: 'uppercase',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ReceiptIcon size={12} /> Current order
        </div>

        <ReceiptLine k="ORDER #" v={orderNumber} />
        <ReceiptLine k="AGENCY" v={agencyName} />
        <ReceiptLine k="TYPE" v={TYPE_NAME[type]} />
        <ReceiptLine k="TITLE" v={title.slice(0, 30)} />
        <ReceiptLine k="TIME" v={fmtClock(new Date())} />

        <div
          style={{
            height: 1,
            background: `repeating-linear-gradient(90deg, ${C.border} 0 4px, transparent 4px 8px)`,
            margin: '10px 0',
          }}
        />

        <ReceiptLine k="SUB-TOTAL" v="1 report" />
        <ReceiptLine k="FORMATS" v="PDF · XLSX" />
        <ReceiptLine k="STATUS" v={pressBusy ? 'PRINTING' : 'READY FOR PICKUP'} />

        <div
          style={{
            marginTop: 12,
            textAlign: 'center',
            fontSize: 10,
            color: C.textFaint,
            letterSpacing: '0.04em',
          }}
        >
          *** THANK YOU — COME AGAIN ***
        </div>
      </div>

      {/* recent orders */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.18em',
            color: C.textDim,
            textTransform: 'uppercase',
            marginBottom: 8,
            ...MONO,
          }}
        >
          · Recent orders
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {receipts.slice(0, 5).map((r) => (
            <RecentReceipt key={r.orderNumber} entry={r} />
          ))}
          {receipts.length === 0 ? (
            <div
              style={{
                padding: 14,
                background: C.surface,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                textAlign: 'center',
                color: C.textFaint,
                fontSize: 11,
                ...MONO,
              }}
            >
              No recent orders. Send one to press.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReceiptLine({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 11,
        color: C.text,
        padding: '2px 0',
        ...MONO,
      }}
    >
      <span style={{ color: C.textDim }}>{pad(k, 12, 'right')}</span>
      <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function RecentReceipt({ entry }: { entry: ReceiptEntry }): JSX.Element {
  const Icon = entry.format === 'pdf' ? FileText : FileSpreadsheet;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        ...MONO,
        cursor: 'default',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: `color-mix(in srgb, ${entry.format === 'pdf' ? C.danger : C.accent} 16%, transparent)`,
          color: entry.format === 'pdf' ? C.danger : C.accent,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            color: C.textDim,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {entry.orderNumber}
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.text,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.title}
        </div>
        <div style={{ fontSize: 10, color: C.textFaint, marginTop: 2 }}>
          {entry.timestamp} · {entry.sizeKb}KB
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: C.accent,
          padding: '3px 8px',
          borderRadius: 999,
          background: `color-mix(in srgb, ${C.accent} 12%, transparent)`,
        }}
      >
        {entry.format.toUpperCase()}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ExportBox — physical-looking box that you "pick up". Two of these
// stack the pickup counter (PDF and XLSX).
// ---------------------------------------------------------------------------

interface ExportBoxProps {
  format: 'pdf' | 'xlsx';
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  disabled: boolean;
  onClick: () => void;
  highlighted?: boolean;
}

function ExportBox({
  format,
  icon,
  label,
  subtitle,
  disabled,
  onClick,
  highlighted = false,
}: ExportBoxProps): JSX.Element {
  const tint = format === 'pdf' ? C.danger : C.accent;
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -4, scale: 1.01 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: C.surface,
        border: `1px solid ${highlighted ? C.accent : C.border}`,
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        color: C.text,
        boxShadow: highlighted
          ? `0 0 0 2px color-mix(in srgb, ${C.accent} 35%, transparent), 0 8px 24px color-mix(in srgb, ${C.accent} 18%, transparent)`
          : 'none',
        transition: 'box-shadow 200ms ease, border-color 200ms ease',
      }}
    >
      {/* "previewing" badge when this format matches the center-column toggle */}
      {highlighted ? (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 7px',
            borderRadius: 999,
            background: C.accent,
            color: '#fff',
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            zIndex: 2,
            ...MONO,
          }}
        >
          <Sparkles size={9} /> Previewing
        </div>
      ) : null}
      {/* "lid" accent line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 4,
          background: tint,
        }}
      />
      {/* file folder graphic */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 10,
          background: `color-mix(in srgb, ${tint} 16%, transparent)`,
          border: `1px solid color-mix(in srgb, ${tint} 30%, transparent)`,
          color: tint,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: C.text,
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          borderRadius: 6,
          border: `1px solid ${tint}`,
          background: `color-mix(in srgb, ${tint} 14%, transparent)`,
          color: tint,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          width: 'fit-content',
          marginTop: 4,
          ...MONO,
        }}
      >
        <Download size={12} />
        Download {label}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Bottom stats strip — a small "shop performance" footer that hints at
// throughput. Pure decorative info, but it grounds the print-shop framing.
// ---------------------------------------------------------------------------

function ShopFooter({
  receipts,
  pendingType,
}: {
  receipts: ReceiptEntry[];
  pendingType: ReportType;
}): JSX.Element {
  const pdfCount = receipts.filter((r) => r.format === 'pdf').length;
  const xlsxCount = receipts.filter((r) => r.format === 'xlsx').length;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        padding: '16px 20px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
      }}
    >
      <FooterStat
        icon={<ReceiptIcon size={14} />}
        label="ORDERS TODAY"
        value={`${receipts.length + 1}`}
      />
      <FooterStat icon={<FileText size={14} />} label="PDF" value={`${pdfCount}`} />
      <FooterStat
        icon={<FileSpreadsheet size={14} />}
        label="XLSX"
        value={`${xlsxCount}`}
      />
      <FooterStat
        icon={<Wrench size={14} />}
        label="QUEUE"
        value={TYPE_NAME[pendingType]}
      />
      <FooterStat icon={<MailCheck size={14} />} label="DELIVERED" value="98%" />
    </div>
  );
}

function FooterStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          background: `color-mix(in srgb, ${C.accent} 14%, transparent)`,
          color: C.accent,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            letterSpacing: '0.1em',
            ...MONO,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Description strip — quiet helper text under the header explaining
// the print-shop metaphor and the current pending report type.
// ---------------------------------------------------------------------------

function MetaStrip({
  type,
  paperKey,
}: {
  type: ReportType;
  paperKey: number;
}): JSX.Element {
  const Icon = TYPE_ICON[type];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '12px 18px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} style={{ color: C.accent }} />
        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
          Preparing a <span style={{ color: C.accent }}>{TYPE_NAME[type]}</span> report
        </span>
        <span style={{ fontSize: 12, color: C.textDim }}>· {TYPE_DESC[type]}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: C.textFaint,
          ...MONO,
          letterSpacing: '0.08em',
        }}
      >
        REPRINT #{paperKey.toString().padStart(3, '0')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptN4PrintShop(
  { data }: { data?: AgencyReportsData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  // form state — what the order ticket spec'd. Defaults to a Placement
  // report titled after the agency so the first render shows something
  // meaningful even if the user never edits the form.
  const [form, setFormState] = useState<OrderFormState>({
    type: 'placement',
    title: `Q4 ${d.agency.name} Placement Review`,
    dateRange: '30d',
    sections: {
      cover: true,
      summary: true,
      kpi: true,
      breakdown: true,
      trends: true,
      footer: true,
    },
    brandLogo: 'co',
    accent: '#F26522',
  });

  // press / printing state — drives the "Send to press" loader and the
  // paper-emerging animation in column B.
  const [pressBusy, setPressBusy] = useState(false);
  const [paperKey, setPaperKey] = useState(1);

  // zoom — preview window's letter-paper scale.
  const [zoom, setZoom] = useState(100);

  // preview-mode — flips the center column between the PDF/paper view
  // (default — preserves the printer animation) and the XLSX/spreadsheet
  // view. The PickupCounter's two export boxes mirror this so the user
  // can see which format is being previewed.
  const [previewMode, setPreviewMode] = useState<PreviewMode>('pdf');

  // receipts — a stack of prior exports shown in column C. We prepend
  // new entries when an export completes.
  const [receipts, setReceipts] = useState<ReceiptEntry[]>(SEED_RECEIPTS);

  const orderNumber = useMemo(() => makeOrderNumber(paperKey * 7919 + 31), [paperKey]);

  // ---- form helpers ---------------------------------------------------------

  function setForm(patch: Partial<OrderFormState>): void {
    setFormState((prev) => ({ ...prev, ...patch }));
    setPaperKey((k) => k + 1);
  }

  function setSection(key: SectionKey, v: boolean): void {
    setFormState((prev) => ({ ...prev, sections: { ...prev.sections, [key]: v } }));
    setPaperKey((k) => k + 1);
  }

  // ---- send to press --------------------------------------------------------

  function handleSendToPress(): void {
    if (pressBusy) return;
    setPressBusy(true);
    setPaperKey((k) => k + 1);
    // brief animation: press is "running" for 900ms — during this time
    // the orange button sweeps a highlight, the preview slot re-emits
    // a fresh paper, and the "PRESS OPEN" pill flips to "PRESS RUNNING".
    window.setTimeout(() => {
      setPressBusy(false);
      toast.success('Report queued · ready for pickup');
    }, 900);
  }

  // ---- real exports ---------------------------------------------------------

  function handlePdf(): void {
    try {
      const { sizeKb } = buildPdf(d, form.type, form.title, form.accent);
      const entry: ReceiptEntry = {
        orderNumber,
        timestamp: fmtClock(new Date()),
        type: form.type,
        title: form.title,
        format: 'pdf',
        sizeKb,
      };
      setReceipts((prev) => [entry, ...prev].slice(0, 8));
      toast.success('PDF downloaded · order complete');
    } catch (err) {
      // jsPDF errors are uncommon but we want a useful message if one
      // somehow surfaces — broken accent hex, paper format rejected, etc.
      const msg = err instanceof Error ? err.message : 'PDF export failed';
      toast.error(`PDF export failed: ${msg}`);
    }
  }

  function handleXlsx(): void {
    try {
      const { sizeKb } = buildXlsx(d, form.type, form.title);
      const entry: ReceiptEntry = {
        orderNumber,
        timestamp: fmtClock(new Date()),
        type: form.type,
        title: form.title,
        format: 'xlsx',
        sizeKb,
      };
      setReceipts((prev) => [entry, ...prev].slice(0, 8));
      toast.success('XLSX downloaded · order complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XLSX export failed';
      toast.error(`XLSX export failed: ${msg}`);
    }
  }

  // ---- render ---------------------------------------------------------------

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        color: C.text,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <HeaderBand
        shopName={d.agency.name.split(' ')[0] ?? 'Northwind'}
        region={d.agency.region}
        orderNumber={orderNumber}
        pressBusy={pressBusy}
        type={form.type}
        setType={(t) => setForm({ type: t })}
      />

      <MetaStrip type={form.type} paperKey={paperKey} />

      {/* three-column body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 340px) minmax(440px, 1fr) minmax(280px, 340px)',
          gap: 18,
          alignItems: 'flex-start',
        }}
      >
        <OrderForm
          form={form}
          setForm={setForm}
          setSection={setSection}
          onSendToPress={handleSendToPress}
          busy={pressBusy}
        />

        <PaperPreview
          data={d}
          form={form}
          zoom={zoom}
          setZoom={setZoom}
          paperKey={paperKey}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
        />

        <PickupCounter
          agencyName={d.agency.name}
          type={form.type}
          title={form.title}
          orderNumber={orderNumber}
          receipts={receipts}
          onPdf={handlePdf}
          onXlsx={handleXlsx}
          pressBusy={pressBusy}
          previewMode={previewMode}
        />
      </div>

      {/* bottom shop performance strip */}
      <ShopFooter receipts={receipts} pendingType={form.type} />

      {/* tiny print-shop tagline */}
      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: C.textFaint,
          letterSpacing: '0.08em',
          ...MONO,
          paddingTop: 4,
        }}
      >
        <Palette size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Hand-printed
        in {d.agency.region.toUpperCase()} · <FileDown size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Same-day pickup ·{' '}
        <ZapOff size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> No setup fees
      </div>
    </div>
  );
}

export default AgRptN4PrintShop;
