import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlignCenter,
  AlignLeft,
  ArrowDownToLine,
  ArrowUpToLine,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Flame,
  Hash,
  Heading1,
  Layers,
  LineChart,
  Lock,
  Minus,
  Palette,
  Plus,
  PlusCircle,
  Quote,
  Save,
  Settings2,
  Sparkles,
  Stamp,
  Table2,
  Target,
  Trash2,
  Unlock,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { toast } from '@/components/ui/AppToast';
import { formatNumber, formatDate } from '@/lib/format';

/**
 * AgRptN3Notebook — Agency-tier REPORTS surface, design candidate N3,
 * "Notion-style Document Editor".
 *
 * The Reports surface re-imagined as a CLEAN DOCUMENT EDITOR — the report
 * IS the document. A centered narrow canvas (~720px) on a near-white
 * surface, with editable headings, paragraphs, tables, and charts, each
 * represented as a BLOCK. Blocks can be reordered, hidden, restyled, or
 * deleted via a properties INSPECTOR on the right. A thin OUTLINE rail
 * on the left jumps between blocks. A sticky TOP TOOLBAR offers four
 * report-type pills (Warmth / Engagement / Placement / White-label) and
 * two big export buttons — PDF (primary) and XLSX (secondary). Both
 * buttons trigger REAL file downloads via `jsPDF` + `jspdf-autotable`
 * and the `xlsx` library.
 *
 * The bottom STATUS BAR shows an auto-save chip, block count, word
 * count, document-length estimate, and a dirty-state indicator.
 *
 * Fully STANDALONE — no network, router, query hooks, or required
 * props. Inline MOCK supplies every field so the design-preview harness
 * mounts it prop-less. The future adapter passes `data` once the
 * reports aggregate endpoint exists.
 *
 * STRICT palette: Shailog orange only (var(--wp-*) tokens + canonical
 * #F26522 / #FF8A4B / #FF9670 / #FFB454 hex codes for jsPDF, which
 * cannot resolve CSS vars). No purple / blue / cyan / teal / mint /
 * violet anywhere — even the chart bars and status pills stay in the
 * orange family.
 *
 * NOT a split-view config editor, NOT a tabbed workbench, NOT a
 * print-shop layout (sibling N1 / N2 / N4 own those identities) —
 * the document-editor identity (centered canvas + block selection +
 * inspector rail + outline TOC + real PDF/XLSX exports) is the
 * differentiator.
 */

// ---------------------------------------------------------------------------
// Local type fallback — sibling N1 (AgRptN1SplitView) is the long-term
// source of truth, but it is not yet on disk during the design-candidate
// burst, so we declare a compatible local shape here. When N1 lands the
// adapter layer can wire the import without a refactor — the names line
// up exactly.
// ---------------------------------------------------------------------------

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';

export type CellStatus = 'good' | 'warn' | 'risk';

export interface AgencyReportsRow {
  subClient: string;
  domain: string;
  value: number;
  delta: number;
  status: CellStatus;
}

export interface AgencyReportsSummary {
  total: number;
  avg: number;
  high: number;
  low: number;
}

export interface AgencyReportsMetric {
  headline: string;
  pullQuote: string;
  rows: AgencyReportsRow[];
  summary: AgencyReportsSummary;
}

export interface AgencyReportsData {
  agency: { name: string; region: string };
  subClients: Array<{
    id: string;
    name: string;
    domain: string;
    mailboxCount: number;
  }>;
  metrics: Record<ReportType, AgencyReportsMetric>;
}

// ---------------------------------------------------------------------------
// Type metadata — labels, eyebrows, icons, accent hex (canonical hex used
// directly inside jsPDF since it cannot resolve CSS variables). The four
// hex codes line up with the project's `--wp-accent` family.
// ---------------------------------------------------------------------------

const TYPE_NAME: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Engagement',
  placement: 'Placement',
  white_label: 'White-label',
};

const TYPE_EYEBROW: Record<ReportType, string> = {
  warmth: 'Warmup Digest',
  engagement: 'Reply Dossier',
  placement: 'Inbox Report',
  white_label: 'Branded Edition',
};

const TYPE_ICON: Record<ReportType, typeof Flame> = {
  warmth: Flame,
  engagement: Sparkles,
  placement: Target,
  white_label: Stamp,
};

const TYPE_HEX: Record<ReportType, string> = {
  warmth: '#F26522',
  engagement: '#FF8A4B',
  placement: '#FF9670',
  white_label: '#FFB454',
};

const TYPE_UNIT: Record<ReportType, string> = {
  warmth: ' deliveries',
  engagement: '% engagement',
  placement: '% inbox',
  white_label: ' sends',
};

// ---------------------------------------------------------------------------
// MOCK — keeps the surface mountable prop-less in the design-preview
// harness. Numbers are tuned to feel realistic (28-day windows, 14 sub-
// clients, sensible deltas, balanced status mix).
// ---------------------------------------------------------------------------

const MOCK_DATA: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'EMEA · London' },
  subClients: [
    { id: 'sc-1', name: 'Coastline SaaS', domain: 'coastline.io', mailboxCount: 12 },
    { id: 'sc-2', name: 'Arbor Health', domain: 'arborhealth.com', mailboxCount: 8 },
    { id: 'sc-3', name: 'Lumen Capital', domain: 'lumencapital.co', mailboxCount: 18 },
    { id: 'sc-4', name: 'Bluefin Logistics', domain: 'bluefin.cargo', mailboxCount: 6 },
    { id: 'sc-5', name: 'Petalpost Studio', domain: 'petalpost.studio', mailboxCount: 10 },
    { id: 'sc-6', name: 'Tundra Robotics', domain: 'tundrabots.ai', mailboxCount: 14 },
    { id: 'sc-7', name: 'Maple & Ledger', domain: 'mapleledger.co', mailboxCount: 9 },
    { id: 'sc-8', name: 'Harbor Press', domain: 'harborpress.media', mailboxCount: 7 },
    { id: 'sc-9', name: 'Quartz Realty', domain: 'quartzrealty.com', mailboxCount: 11 },
    { id: 'sc-10', name: 'Cinder Coffee', domain: 'cindercoffee.co', mailboxCount: 5 },
    { id: 'sc-11', name: 'Salt Coast PR', domain: 'saltcoastpr.com', mailboxCount: 8 },
    { id: 'sc-12', name: 'Forge Apparel', domain: 'forgeapparel.co', mailboxCount: 13 },
    { id: 'sc-13', name: 'Atlas Bio', domain: 'atlasbio.lab', mailboxCount: 6 },
    { id: 'sc-14', name: 'Wren & Bell', domain: 'wrenbell.com', mailboxCount: 9 },
  ],
  metrics: {
    warmth: {
      headline: 'Warmth Report · October 2026',
      pullQuote:
        'Portfolio warmth held above the 80% benchmark for 26 of 28 days, anchored by Lumen Capital and Tundra Robotics breaking their 14-day ramp ceiling.',
      rows: [
        { subClient: 'Coastline SaaS', domain: 'coastline.io', value: 312, delta: 18, status: 'good' },
        { subClient: 'Arbor Health', domain: 'arborhealth.com', value: 218, delta: 9, status: 'good' },
        { subClient: 'Lumen Capital', domain: 'lumencapital.co', value: 484, delta: 32, status: 'good' },
        { subClient: 'Bluefin Logistics', domain: 'bluefin.cargo', value: 152, delta: -4, status: 'warn' },
        { subClient: 'Petalpost Studio', domain: 'petalpost.studio', value: 268, delta: 12, status: 'good' },
        { subClient: 'Tundra Robotics', domain: 'tundrabots.ai', value: 372, delta: 24, status: 'good' },
        { subClient: 'Maple & Ledger', domain: 'mapleledger.co', value: 234, delta: 6, status: 'good' },
        { subClient: 'Harbor Press', domain: 'harborpress.media', value: 188, delta: -2, status: 'warn' },
        { subClient: 'Quartz Realty', domain: 'quartzrealty.com', value: 290, delta: 15, status: 'good' },
        { subClient: 'Cinder Coffee', domain: 'cindercoffee.co', value: 128, delta: -8, status: 'risk' },
        { subClient: 'Salt Coast PR', domain: 'saltcoastpr.com', value: 204, delta: 7, status: 'good' },
        { subClient: 'Forge Apparel', domain: 'forgeapparel.co', value: 342, delta: 19, status: 'good' },
        { subClient: 'Atlas Bio', domain: 'atlasbio.lab', value: 162, delta: -3, status: 'warn' },
        { subClient: 'Wren & Bell', domain: 'wrenbell.com', value: 244, delta: 11, status: 'good' },
      ],
      summary: { total: 3618, avg: 258, high: 484, low: 128 },
    },
    engagement: {
      headline: 'Engagement Report · October 2026',
      pullQuote:
        'Reply-rate climbed 4.2 points portfolio-wide; star-rate is the standout, up 6.1 points after we promoted the long-form follow-up template to default in week 2.',
      rows: [
        { subClient: 'Coastline SaaS', domain: 'coastline.io', value: 27, delta: 4, status: 'good' },
        { subClient: 'Arbor Health', domain: 'arborhealth.com', value: 22, delta: 2, status: 'good' },
        { subClient: 'Lumen Capital', domain: 'lumencapital.co', value: 34, delta: 6, status: 'good' },
        { subClient: 'Bluefin Logistics', domain: 'bluefin.cargo', value: 16, delta: -2, status: 'warn' },
        { subClient: 'Petalpost Studio', domain: 'petalpost.studio', value: 25, delta: 3, status: 'good' },
        { subClient: 'Tundra Robotics', domain: 'tundrabots.ai', value: 31, delta: 5, status: 'good' },
        { subClient: 'Maple & Ledger', domain: 'mapleledger.co', value: 21, delta: 1, status: 'good' },
        { subClient: 'Harbor Press', domain: 'harborpress.media', value: 18, delta: 0, status: 'warn' },
        { subClient: 'Quartz Realty', domain: 'quartzrealty.com', value: 26, delta: 4, status: 'good' },
        { subClient: 'Cinder Coffee', domain: 'cindercoffee.co', value: 12, delta: -3, status: 'risk' },
        { subClient: 'Salt Coast PR', domain: 'saltcoastpr.com', value: 19, delta: 1, status: 'warn' },
        { subClient: 'Forge Apparel', domain: 'forgeapparel.co', value: 28, delta: 4, status: 'good' },
        { subClient: 'Atlas Bio', domain: 'atlasbio.lab', value: 15, delta: -1, status: 'warn' },
        { subClient: 'Wren & Bell', domain: 'wrenbell.com', value: 23, delta: 2, status: 'good' },
      ],
      summary: { total: 317, avg: 23, high: 34, low: 12 },
    },
    placement: {
      headline: 'Placement Report · October 2026',
      pullQuote:
        'Gmail inbox-placement rose to 88% across the portfolio. Outlook lagged at 71% — recommend a P2 follow-up on the Outlook IP rotation for two cohorts.',
      rows: [
        { subClient: 'Coastline SaaS', domain: 'coastline.io', value: 86, delta: 3, status: 'good' },
        { subClient: 'Arbor Health', domain: 'arborhealth.com', value: 81, delta: 2, status: 'good' },
        { subClient: 'Lumen Capital', domain: 'lumencapital.co', value: 92, delta: 5, status: 'good' },
        { subClient: 'Bluefin Logistics', domain: 'bluefin.cargo', value: 74, delta: -1, status: 'warn' },
        { subClient: 'Petalpost Studio', domain: 'petalpost.studio', value: 88, delta: 2, status: 'good' },
        { subClient: 'Tundra Robotics', domain: 'tundrabots.ai', value: 90, delta: 4, status: 'good' },
        { subClient: 'Maple & Ledger', domain: 'mapleledger.co', value: 83, delta: 1, status: 'good' },
        { subClient: 'Harbor Press', domain: 'harborpress.media', value: 76, delta: 0, status: 'warn' },
        { subClient: 'Quartz Realty', domain: 'quartzrealty.com', value: 85, delta: 2, status: 'good' },
        { subClient: 'Cinder Coffee', domain: 'cindercoffee.co', value: 64, delta: -4, status: 'risk' },
        { subClient: 'Salt Coast PR', domain: 'saltcoastpr.com', value: 79, delta: 1, status: 'warn' },
        { subClient: 'Forge Apparel', domain: 'forgeapparel.co', value: 87, delta: 3, status: 'good' },
        { subClient: 'Atlas Bio', domain: 'atlasbio.lab', value: 72, delta: -1, status: 'warn' },
        { subClient: 'Wren & Bell', domain: 'wrenbell.com', value: 84, delta: 2, status: 'good' },
      ],
      summary: { total: 1141, avg: 81, high: 92, low: 64 },
    },
    white_label: {
      headline: 'White-label Report · October 2026',
      pullQuote:
        'Branded volume crossed the 30,000-send threshold for the first time. Three sub-clients (Coastline, Lumen, Forge) drove 42% of total branded delivery.',
      rows: [
        { subClient: 'Coastline SaaS', domain: 'coastline.io', value: 3120, delta: 480, status: 'good' },
        { subClient: 'Arbor Health', domain: 'arborhealth.com', value: 2180, delta: 220, status: 'good' },
        { subClient: 'Lumen Capital', domain: 'lumencapital.co', value: 4840, delta: 720, status: 'good' },
        { subClient: 'Bluefin Logistics', domain: 'bluefin.cargo', value: 1520, delta: -80, status: 'warn' },
        { subClient: 'Petalpost Studio', domain: 'petalpost.studio', value: 2680, delta: 320, status: 'good' },
        { subClient: 'Tundra Robotics', domain: 'tundrabots.ai', value: 3720, delta: 540, status: 'good' },
        { subClient: 'Maple & Ledger', domain: 'mapleledger.co', value: 2340, delta: 180, status: 'good' },
        { subClient: 'Harbor Press', domain: 'harborpress.media', value: 1880, delta: -40, status: 'warn' },
        { subClient: 'Quartz Realty', domain: 'quartzrealty.com', value: 2900, delta: 380, status: 'good' },
        { subClient: 'Cinder Coffee', domain: 'cindercoffee.co', value: 1280, delta: -160, status: 'risk' },
        { subClient: 'Salt Coast PR', domain: 'saltcoastpr.com', value: 2040, delta: 140, status: 'good' },
        { subClient: 'Forge Apparel', domain: 'forgeapparel.co', value: 3420, delta: 460, status: 'good' },
        { subClient: 'Atlas Bio', domain: 'atlasbio.lab', value: 1620, delta: -60, status: 'warn' },
        { subClient: 'Wren & Bell', domain: 'wrenbell.com', value: 2440, delta: 280, status: 'good' },
      ],
      summary: { total: 35980, avg: 2570, high: 4840, low: 1280 },
    },
  },
};

// ---------------------------------------------------------------------------
// Block model — the document is an ordered list of blocks. The default
// document has FIVE blocks (title, summary, table, chart, footer). Users
// can add, hide, delete, restyle, and reorder them via the inspector and
// the per-block hover affordances.
// ---------------------------------------------------------------------------

type BlockKind = 'title' | 'summary' | 'table' | 'chart' | 'footer' | 'spacer' | 'callout';

type Alignment = 'left' | 'center';

type Spacing = 'tight' | 'loose';

type AccentKey = 'orange-1' | 'orange-2' | 'orange-3' | 'orange-4';

const ACCENT_HEX: Record<AccentKey, string> = {
  'orange-1': '#F26522',
  'orange-2': '#FF8A4B',
  'orange-3': '#FF9670',
  'orange-4': '#FFB454',
};

const ACCENT_LABEL: Record<AccentKey, string> = {
  'orange-1': 'Coral',
  'orange-2': 'Sun',
  'orange-3': 'Peach',
  'orange-4': 'Amber',
};

interface BlockBase {
  id: string;
  visible: boolean;
  alignment: Alignment;
  spacing: Spacing;
  accent: AccentKey;
  required: boolean;
  /** Used by the outline TOC label + inspector header. */
  label: string;
}

interface TitleBlock extends BlockBase {
  kind: 'title';
}

interface SummaryBlock extends BlockBase {
  kind: 'summary';
  customText: string | null; // null => use metrics.pullQuote
}

interface TableBlock extends BlockBase {
  kind: 'table';
}

interface ChartBlock extends BlockBase {
  kind: 'chart';
}

interface FooterBlock extends BlockBase {
  kind: 'footer';
  footerText: string;
}

interface SpacerBlock extends BlockBase {
  kind: 'spacer';
  heightSteps: number; // 1 / 2 / 3
}

interface CalloutBlock extends BlockBase {
  kind: 'callout';
  calloutText: string;
}

type DocumentBlock =
  | TitleBlock
  | SummaryBlock
  | TableBlock
  | ChartBlock
  | FooterBlock
  | SpacerBlock
  | CalloutBlock;

interface DocumentState {
  blocks: DocumentBlock[];
}

const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  title: 'Title',
  summary: 'Executive Summary',
  table: 'KPI Table',
  chart: 'Trends',
  footer: 'Footer',
  spacer: 'Spacer',
  callout: 'Callout',
};

const BLOCK_KIND_ICON: Record<BlockKind, typeof Heading1> = {
  title: Heading1,
  summary: Quote,
  table: Table2,
  chart: LineChart,
  footer: Hash,
  spacer: Minus,
  callout: Sparkles,
};

const BLOCK_KIND_EMOJI: Record<BlockKind, string> = {
  title: 'TITLE',
  summary: 'EXEC',
  table: 'TABLE',
  chart: 'CHART',
  footer: 'FOOT',
  spacer: 'SPACE',
  callout: 'NOTE',
};

// ---------------------------------------------------------------------------
// Default document — what the user sees on first mount per type. Five
// required blocks, all visible, left-aligned, loose spacing, orange-1
// accent.
// ---------------------------------------------------------------------------

function makeDefaultDocument(): DocumentState {
  const baseSetup = {
    visible: true,
    alignment: 'left' as Alignment,
    spacing: 'loose' as Spacing,
    accent: 'orange-1' as AccentKey,
    required: true,
  };
  const blocks: DocumentBlock[] = [
    {
      id: 'block-title',
      kind: 'title',
      label: 'Title',
      ...baseSetup,
    },
    {
      id: 'block-summary',
      kind: 'summary',
      label: 'Executive Summary',
      customText: null,
      ...baseSetup,
    },
    {
      id: 'block-table',
      kind: 'table',
      label: 'KPI Table',
      ...baseSetup,
    },
    {
      id: 'block-chart',
      kind: 'chart',
      label: 'Trends',
      ...baseSetup,
    },
    {
      id: 'block-footer',
      kind: 'footer',
      label: 'Footer',
      footerText: 'Generated by WarmPulse · Page 1 of 1',
      ...baseSetup,
    },
  ];
  return { blocks };
}

// ---------------------------------------------------------------------------
// Add-block catalog — what the "+ add block" affordance shows.
// Title / footer cannot be added more than once.
// ---------------------------------------------------------------------------

interface AddBlockOption {
  kind: BlockKind;
  label: string;
  description: string;
  Icon: typeof Heading1;
}

const ADD_BLOCK_CATALOG: AddBlockOption[] = [
  { kind: 'summary', label: 'Summary block', description: 'Editable paragraph', Icon: Quote },
  { kind: 'table', label: 'Data table', description: 'Per sub-client KPI rows', Icon: Table2 },
  { kind: 'chart', label: 'Trend chart', description: 'Inline bar visualization', Icon: BarChart3 },
  { kind: 'callout', label: 'Callout', description: 'Highlighted note', Icon: Sparkles },
  { kind: 'spacer', label: 'Spacer', description: 'Vertical breathing room', Icon: Minus },
];

// ---------------------------------------------------------------------------
// Word-count helper — drives the status bar's word count and the page-
// length estimate. We treat ~280 words per page.
// ---------------------------------------------------------------------------

const WORDS_PER_PAGE = 280;

function countWordsInBlock(block: DocumentBlock, metric: AgencyReportsMetric): number {
  if (!block.visible) return 0;
  switch (block.kind) {
    case 'title':
      return metric.headline.split(/\s+/).filter(Boolean).length;
    case 'summary': {
      const text = block.customText ?? metric.pullQuote;
      return text.split(/\s+/).filter(Boolean).length;
    }
    case 'table':
      return metric.rows.length * 6; // sub-client, domain, value, delta, status, badge
    case 'chart':
      return 32;
    case 'footer':
      return block.footerText.split(/\s+/).filter(Boolean).length;
    case 'callout':
      return block.calloutText.split(/\s+/).filter(Boolean).length;
    case 'spacer':
      return 0;
  }
}

function countWordsInDocument(doc: DocumentState, metric: AgencyReportsMetric): number {
  return doc.blocks.reduce((acc, b) => acc + countWordsInBlock(b, metric), 0);
}

function estimatePageCount(wordCount: number): number {
  if (wordCount === 0) return 1;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
}

// ---------------------------------------------------------------------------
// Number / delta / date formatters
// ---------------------------------------------------------------------------

function formatDelta(d: number): string {
  return `${d >= 0 ? '+' : ''}${d}`;
}

function formatTodayLong(): string {
  return formatDate(new Date());
}

function formatRelativeSeconds(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}

// ---------------------------------------------------------------------------
// Status pill (orange family) — used inside the KPI table block.
// ---------------------------------------------------------------------------

interface StatusPillProps {
  status: CellStatus;
}

function StatusPill({ status }: StatusPillProps): JSX.Element {
  const map: Record<CellStatus, { label: string; bg: string; color: string; border: string }> = {
    good: { label: 'On track', bg: 'rgba(242,101,34,0.10)', color: '#F26522', border: 'rgba(242,101,34,0.30)' },
    warn: { label: 'Watch', bg: 'rgba(255,138,75,0.10)', color: '#C8470E', border: 'rgba(255,138,75,0.35)' },
    risk: { label: 'At risk', bg: 'rgba(200,71,14,0.12)', color: '#C8470E', border: 'rgba(200,71,14,0.40)' },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      <Circle className="h-1.5 w-1.5 fill-current" />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tiny inline SVG bar chart — used by the "trends" block. No external
// chart lib; deliberately compact so the doc canvas stays paper-clean.
// ---------------------------------------------------------------------------

interface MiniBarChartProps {
  rows: AgencyReportsRow[];
  accentHex: string;
  width: number;
  height: number;
  reduceMotion: boolean;
}

function MiniBarChart({ rows, accentHex, width, height, reduceMotion }: MiniBarChartProps): JSX.Element {
  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const barWidth = width / rows.length;
  const padX = 4;
  return (
    <svg
      role="img"
      aria-label="Per sub-client trends chart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block' }}
    >
      {/* baseline */}
      <line x1={0} x2={width} y1={height - 18} y2={height - 18} stroke="rgba(0,0,0,0.10)" strokeWidth={1} />
      {/* gridline */}
      <line
        x1={0}
        x2={width}
        y1={height / 2 - 8}
        y2={height / 2 - 8}
        stroke="rgba(0,0,0,0.05)"
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      {rows.map((r, idx) => {
        const fillRatio = r.value / maxVal;
        const barHeight = (height - 24) * fillRatio;
        const x = idx * barWidth + padX;
        const y = height - 18 - barHeight;
        const w = barWidth - padX * 2;
        const positive = r.delta >= 0;
        return (
          <g key={r.subClient}>
            <motion.rect
              initial={reduceMotion ? false : { height: 0, y: height - 18 }}
              animate={{ height: barHeight, y }}
              transition={{ delay: idx * 0.02, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              x={x}
              width={w}
              rx={2}
              fill={positive ? accentHex : 'rgba(200,71,14,0.55)'}
              opacity={positive ? 0.85 : 0.6}
            />
            <text
              x={x + w / 2}
              y={height - 4}
              fontSize={6.5}
              fill="rgba(20,12,6,0.55)"
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {r.subClient.split(/\s+/)[0]?.slice(0, 6) ?? ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Document canvas styles — tied to var(--wp-*) where possible, but the
// canvas surface itself stays near-white because that's the editor's
// signature look. Dark UI shell wraps it on all sides.
// ---------------------------------------------------------------------------

const CANVAS_BG = '#fbf7f3';
const CANVAS_SURFACE = '#ffffff';
const CANVAS_BORDER = 'rgba(20,12,6,0.10)';
const CANVAS_INK = '#1a0d05';
const CANVAS_INK_DIM = '#6b4a35';
const CANVAS_INK_FAINT = '#a38770';
const CANVAS_RULE = 'rgba(20,12,6,0.08)';

const SERIF_STACK = `'Georgia', 'Cambria', 'Times New Roman', Times, serif`;

// ---------------------------------------------------------------------------
// AddBlockMenu — popover-style menu listing the catalog. Stacks below
// the hover affordance, anchored to the block edge.
// ---------------------------------------------------------------------------

interface AddBlockMenuProps {
  onAdd: (kind: BlockKind) => void;
  onClose: () => void;
}

function AddBlockMenu({ onAdd, onClose }: AddBlockMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      className="absolute left-8 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border bg-white shadow-2xl"
      style={{ borderColor: CANVAS_BORDER }}
    >
      <div
        className="border-b px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: CANVAS_INK_DIM, borderColor: CANVAS_RULE }}
      >
        Add block
      </div>
      <div className="py-1">
        {ADD_BLOCK_CATALOG.map((opt) => {
          const Icon = opt.Icon;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => onAdd(opt.kind)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(242,101,34,0.08)]"
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'rgba(242,101,34,0.10)', color: '#F26522' }}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold" style={{ color: CANVAS_INK }}>
                  {opt.label}
                </span>
                <span className="text-[10px]" style={{ color: CANVAS_INK_DIM }}>
                  {opt.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// BlockHoverControls — appears on block hover. Lets the user add a block
// above or below, hide, or delete.
// ---------------------------------------------------------------------------

interface BlockHoverControlsProps {
  block: DocumentBlock;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  isHovered: boolean;
}

function BlockHoverControls({
  block,
  onAddAbove,
  onAddBelow,
  onToggleVisible,
  onDelete,
  isHovered,
}: BlockHoverControlsProps): JSX.Element {
  return (
    <AnimatePresence>
      {isHovered ? (
        <motion.div
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute -left-10 top-1 flex flex-col gap-1"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddAbove();
            }}
            title="Add block above"
            className="flex h-6 w-6 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[rgba(242,101,34,0.08)]"
            style={{ borderColor: CANVAS_BORDER, color: CANVAS_INK_DIM }}
          >
            <ArrowUpToLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddBelow();
            }}
            title="Add block below"
            className="flex h-6 w-6 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[rgba(242,101,34,0.08)]"
            style={{ borderColor: CANVAS_BORDER, color: CANVAS_INK_DIM }}
          >
            <ArrowDownToLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible();
            }}
            title={block.visible ? 'Hide block' : 'Show block'}
            className="flex h-6 w-6 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[rgba(242,101,34,0.08)]"
            style={{ borderColor: CANVAS_BORDER, color: CANVAS_INK_DIM }}
          >
            {block.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          {!block.required ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete block"
              className="flex h-6 w-6 items-center justify-center rounded-md border bg-white transition-colors hover:bg-[rgba(220,38,69,0.08)] hover:text-[#C8470E]"
              style={{ borderColor: CANVAS_BORDER, color: CANVAS_INK_DIM }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Block renderers — one per kind. Each receives the block, the current
// metric, and a few presentation props (selected, accent hex, reduce-
// motion). They render INSIDE a uniform shell so the selection stripe and
// hover controls live in the parent.
// ---------------------------------------------------------------------------

interface BlockRendererProps {
  block: DocumentBlock;
  metric: AgencyReportsMetric;
  type: ReportType;
  reduceMotion: boolean;
  onEditSummary: (text: string) => void;
  onEditFooter: (text: string) => void;
  onEditCallout: (id: string, text: string) => void;
}

function TitleBlockView({
  block,
  metric,
  type,
}: {
  block: TitleBlock;
  metric: AgencyReportsMetric;
  type: ReportType;
}): JSX.Element {
  const Icon = TYPE_ICON[type];
  const eyebrow = TYPE_EYEBROW[type];
  const alignClass = block.alignment === 'center' ? 'text-center items-center' : 'text-left items-start';
  return (
    <div className={`flex flex-col gap-2 ${alignClass}`}>
      <div
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color: ACCENT_HEX[block.accent] }}
      >
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <h1
        className="m-0 leading-tight"
        style={{
          fontFamily: SERIF_STACK,
          fontSize: 38,
          color: CANVAS_INK,
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        {metric.headline}
      </h1>
      <div
        className="font-mono text-[11px] uppercase tracking-wider"
        style={{ color: CANVAS_INK_DIM }}
      >
        {formatTodayLong()} · 28-day window
      </div>
    </div>
  );
}

function SummaryBlockView({
  block,
  metric,
  onEditSummary,
}: {
  block: SummaryBlock;
  metric: AgencyReportsMetric;
  onEditSummary: (text: string) => void;
}): JSX.Element {
  const text = block.customText ?? metric.pullQuote;
  const alignClass = block.alignment === 'center' ? 'text-center' : 'text-left';
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: CANVAS_INK_FAINT }}
      >
        <Quote className="h-3 w-3" />
        Executive summary
      </div>
      <p
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEditSummary(e.currentTarget.textContent ?? '')}
        className={`m-0 outline-none ${alignClass}`}
        style={{
          fontFamily: SERIF_STACK,
          fontSize: 18,
          lineHeight: 1.6,
          color: CANVAS_INK,
          fontStyle: 'italic',
          borderLeft: `3px solid ${ACCENT_HEX[block.accent]}`,
          paddingLeft: 16,
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        {text}
      </p>
    </div>
  );
}

function TableBlockView({
  block,
  metric,
  type,
}: {
  block: TableBlock;
  metric: AgencyReportsMetric;
  type: ReportType;
}): JSX.Element {
  const accent = ACCENT_HEX[block.accent];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: CANVAS_INK_FAINT }}
        >
          <Table2 className="h-3 w-3" />
          KPI table · {metric.rows.length} sub-clients
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: CANVAS_INK_DIM }}>
          <span>
            Total <strong style={{ color: CANVAS_INK }}>{formatNumber(metric.summary.total)}</strong>
          </span>
          <span>
            Avg <strong style={{ color: CANVAS_INK }}>{formatNumber(metric.summary.avg)}</strong>
          </span>
          <span>
            High <strong style={{ color: CANVAS_INK }}>{formatNumber(metric.summary.high)}</strong>
          </span>
          <span>
            Low <strong style={{ color: CANVAS_INK }}>{formatNumber(metric.summary.low)}</strong>
          </span>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: CANVAS_RULE, background: '#fffdfb' }}
      >
        <table className="w-full border-collapse text-[12px]" style={{ color: CANVAS_INK }}>
          <thead>
            <tr style={{ background: 'rgba(242,101,34,0.06)' }}>
              <th
                className="text-left font-semibold uppercase tracking-wider"
                style={{ padding: '8px 10px', fontSize: 10, color: accent, borderBottom: `1px solid ${CANVAS_RULE}` }}
              >
                Sub-client
              </th>
              <th
                className="text-left font-semibold uppercase tracking-wider"
                style={{ padding: '8px 10px', fontSize: 10, color: accent, borderBottom: `1px solid ${CANVAS_RULE}` }}
              >
                Domain
              </th>
              <th
                className="text-right font-semibold uppercase tracking-wider"
                style={{ padding: '8px 10px', fontSize: 10, color: accent, borderBottom: `1px solid ${CANVAS_RULE}` }}
              >
                Value
              </th>
              <th
                className="text-right font-semibold uppercase tracking-wider"
                style={{ padding: '8px 10px', fontSize: 10, color: accent, borderBottom: `1px solid ${CANVAS_RULE}` }}
              >
                Δ
              </th>
              <th
                className="text-left font-semibold uppercase tracking-wider"
                style={{ padding: '8px 10px', fontSize: 10, color: accent, borderBottom: `1px solid ${CANVAS_RULE}` }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {metric.rows.map((row, idx) => (
              <tr
                key={row.subClient}
                style={{
                  background: idx % 2 === 1 ? 'rgba(242,101,34,0.02)' : 'transparent',
                }}
              >
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${CANVAS_RULE}`, color: CANVAS_INK, fontWeight: 600 }}>
                  {row.subClient}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${CANVAS_RULE}`,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 11,
                    color: CANVAS_INK_DIM,
                  }}
                >
                  {row.domain}
                </td>
                <td
                  className="text-right"
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${CANVAS_RULE}`,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    color: CANVAS_INK,
                    fontWeight: 600,
                  }}
                >
                  {formatNumber(row.value)}
                  <span style={{ color: CANVAS_INK_FAINT, fontWeight: 400 }}>{TYPE_UNIT[type]}</span>
                </td>
                <td
                  className="text-right"
                  style={{
                    padding: '8px 10px',
                    borderBottom: `1px solid ${CANVAS_RULE}`,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    color: row.delta >= 0 ? accent : '#C8470E',
                    fontWeight: 600,
                  }}
                >
                  {formatDelta(row.delta)}
                </td>
                <td style={{ padding: '8px 10px', borderBottom: `1px solid ${CANVAS_RULE}` }}>
                  <StatusPill status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartBlockView({
  block,
  metric,
  reduceMotion,
}: {
  block: ChartBlock;
  metric: AgencyReportsMetric;
  reduceMotion: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: CANVAS_INK_FAINT }}
        >
          <BarChart3 className="h-3 w-3" />
          Trend snapshot
        </div>
        <div className="text-[10px]" style={{ color: CANVAS_INK_DIM }}>
          Bars positive ·{' '}
          <span style={{ color: ACCENT_HEX[block.accent], fontWeight: 600 }}>
            {metric.rows.filter((r) => r.delta >= 0).length}
          </span>{' '}
          / negative · <span style={{ color: '#C8470E', fontWeight: 600 }}>{metric.rows.filter((r) => r.delta < 0).length}</span>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-lg border p-3"
        style={{ borderColor: CANVAS_RULE, background: '#fffdfb' }}
      >
        <MiniBarChart
          rows={metric.rows}
          accentHex={ACCENT_HEX[block.accent]}
          width={620}
          height={140}
          reduceMotion={reduceMotion}
        />
      </div>
    </div>
  );
}

function FooterBlockView({
  block,
  onEditFooter,
}: {
  block: FooterBlock;
  onEditFooter: (text: string) => void;
}): JSX.Element {
  return (
    <div
      className="flex items-center justify-between border-t pt-4 text-[11px]"
      style={{ borderColor: CANVAS_RULE, color: CANVAS_INK_DIM, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      <span
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEditFooter(e.currentTarget.textContent ?? '')}
        className="outline-none"
      >
        {block.footerText}
      </span>
      <span style={{ color: ACCENT_HEX[block.accent], fontWeight: 600 }}>WarmPulse · Confidential</span>
    </div>
  );
}

function CalloutBlockView({
  block,
  onEditCallout,
}: {
  block: CalloutBlock;
  onEditCallout: (id: string, text: string) => void;
}): JSX.Element {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-3"
      style={{ borderColor: 'rgba(242,101,34,0.30)', background: 'rgba(242,101,34,0.06)' }}
    >
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(242,101,34,0.20)', color: ACCENT_HEX[block.accent] }}
      >
        <Sparkles className="h-3 w-3" />
      </div>
      <p
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onEditCallout(block.id, e.currentTarget.textContent ?? '')}
        className="m-0 flex-1 text-[13px] outline-none"
        style={{ color: CANVAS_INK, fontFamily: SERIF_STACK, lineHeight: 1.5 }}
      >
        {block.calloutText}
      </p>
    </div>
  );
}

function SpacerBlockView({ block }: { block: SpacerBlock }): JSX.Element {
  const heightPx = block.heightSteps * 24;
  return (
    <div className="flex items-center justify-center" style={{ height: heightPx }}>
      <div
        className="h-px w-1/3"
        style={{ background: `linear-gradient(90deg, transparent, ${CANVAS_RULE}, transparent)` }}
      />
    </div>
  );
}

function BlockBody({
  block,
  metric,
  type,
  reduceMotion,
  onEditSummary,
  onEditFooter,
  onEditCallout,
}: BlockRendererProps): JSX.Element {
  switch (block.kind) {
    case 'title':
      return <TitleBlockView block={block} metric={metric} type={type} />;
    case 'summary':
      return <SummaryBlockView block={block} metric={metric} onEditSummary={onEditSummary} />;
    case 'table':
      return <TableBlockView block={block} metric={metric} type={type} />;
    case 'chart':
      return <ChartBlockView block={block} metric={metric} reduceMotion={reduceMotion} />;
    case 'footer':
      return <FooterBlockView block={block} onEditFooter={onEditFooter} />;
    case 'callout':
      return <CalloutBlockView block={block} onEditCallout={onEditCallout} />;
    case 'spacer':
      return <SpacerBlockView block={block} />;
  }
}

// ---------------------------------------------------------------------------
// OutlineRail — left-hand TOC. Sticky-scroll. Clicking jumps to the
// block via id-anchored scrollIntoView.
// ---------------------------------------------------------------------------

interface OutlineRailProps {
  blocks: DocumentBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function OutlineRail({ blocks, selectedId, onSelect }: OutlineRailProps): JSX.Element {
  return (
    <aside
      className="hidden border-r lg:flex"
      style={{
        width: 220,
        minWidth: 220,
        background: 'var(--surface)',
        borderColor: 'var(--border-muted)',
      }}
    >
      <div className="sticky top-0 flex w-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
          <Layers className="h-3 w-3" />
          Outline
        </div>
        <div className="flex flex-col gap-1">
          {blocks.map((block, idx) => {
            const Icon = BLOCK_KIND_ICON[block.kind];
            const selected = block.id === selectedId;
            return (
              <motion.button
                key={block.id}
                type="button"
                onClick={() => onSelect(block.id)}
                whileHover={{ x: 3 }}
                transition={{ duration: 0.12 }}
                className={`group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors ${
                  selected ? 'bg-[rgba(242,101,34,0.10)]' : 'hover:bg-surface-2'
                }`}
                style={selected ? { borderColor: 'rgba(242,101,34,0.30)' } : undefined}
              >
                <div
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
                  style={{
                    background: selected ? 'rgba(242,101,34,0.15)' : 'transparent',
                    color: selected ? 'var(--wp-accent, #F26522)' : 'var(--text-dim)',
                  }}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div className="flex-1 truncate">
                  <div
                    className="truncate text-[11px] font-medium"
                    style={{
                      color: selected ? 'var(--text)' : 'var(--text-dim)',
                      textDecoration: block.visible ? 'none' : 'line-through',
                    }}
                  >
                    {block.label}
                  </div>
                  <div className="font-mono text-[9px] text-text-dim/70">
                    {String(idx + 1).padStart(2, '0')} · {BLOCK_KIND_EMOJI[block.kind]}
                  </div>
                </div>
                {!block.visible ? <EyeOff className="h-3 w-3 text-text-dim/60" /> : null}
                {block.required ? <Lock className="h-2.5 w-2.5 text-text-dim/40" /> : null}
              </motion.button>
            );
          })}
        </div>
        <div
          className="mt-2 rounded-md border bg-surface-2 p-2 text-[10px]"
          style={{ borderColor: 'var(--border-muted)', color: 'var(--text-dim)' }}
        >
          <div className="font-mono uppercase tracking-wider">{blocks.length} blocks</div>
          <div className="mt-0.5">
            {blocks.filter((b) => b.visible).length} visible · {blocks.filter((b) => !b.visible).length} hidden
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// InspectorRail — right-hand block-properties panel. Only shows the
// inputs that apply to the selected block.
// ---------------------------------------------------------------------------

interface InspectorRailProps {
  block: DocumentBlock | null;
  onUpdateVisible: (visible: boolean) => void;
  onUpdateAlignment: (alignment: Alignment) => void;
  onUpdateSpacing: (spacing: Spacing) => void;
  onUpdateAccent: (accent: AccentKey) => void;
  onUpdateLabel: (label: string) => void;
  onDelete: () => void;
  onUpdateSpacerHeight: (steps: number) => void;
}

function InspectorRail({
  block,
  onUpdateVisible,
  onUpdateAlignment,
  onUpdateSpacing,
  onUpdateAccent,
  onUpdateLabel,
  onDelete,
  onUpdateSpacerHeight,
}: InspectorRailProps): JSX.Element {
  if (!block) {
    return (
      <aside
        className="hidden flex-col border-l p-4 xl:flex"
        style={{
          width: 280,
          minWidth: 280,
          background: 'var(--surface)',
          borderColor: 'var(--border-muted)',
        }}
      >
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
          <Settings2 className="h-3 w-3" />
          Inspector
        </div>
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-muted p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2">
            <Settings2 className="h-4 w-4 text-text-dim/60" />
          </div>
          <div className="text-xs font-medium text-text-dim">No block selected</div>
          <div className="text-[10px] text-text-dim/70">
            Click any block in the canvas to inspect and adjust its properties.
          </div>
        </div>
      </aside>
    );
  }

  const Icon = BLOCK_KIND_ICON[block.kind];

  return (
    <aside
      className="hidden flex-col border-l xl:flex"
      style={{
        width: 280,
        minWidth: 280,
        background: 'var(--surface)',
        borderColor: 'var(--border-muted)',
      }}
    >
      <div className="sticky top-0 flex max-h-screen flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
          <Settings2 className="h-3 w-3" />
          Inspector
        </div>

        {/* Block-type chip */}
        <div
          className="flex items-center gap-2 rounded-lg border p-2"
          style={{ borderColor: 'rgba(242,101,34,0.30)', background: 'rgba(242,101,34,0.06)' }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: 'rgba(242,101,34,0.18)', color: 'var(--wp-accent, #F26522)' }}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Block type</span>
            <span className="text-xs font-semibold text-text">{BLOCK_KIND_LABEL[block.kind]}</span>
          </div>
          {block.required ? (
            <div
              className="ml-auto flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase text-text-dim"
              title="Required block — cannot be deleted"
            >
              <Lock className="h-2.5 w-2.5" />
              Locked
            </div>
          ) : (
            <div
              className="ml-auto flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase text-text-dim"
              title="Removable block"
            >
              <Unlock className="h-2.5 w-2.5" />
              Optional
            </div>
          )}
        </div>

        {/* Label */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Outline label</label>
          <input
            type="text"
            value={block.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            className="rounded-md border border-border-muted bg-surface-2 px-2.5 py-1.5 text-xs text-text outline-none transition-colors focus:border-accent"
          />
        </div>

        {/* Visibility */}
        <div className="flex items-center justify-between rounded-md border border-border-muted bg-surface-2 px-2.5 py-2">
          <div className="flex items-center gap-2">
            {block.visible ? (
              <Eye className="h-3.5 w-3.5 text-accent" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-text-dim" />
            )}
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text">Show this block</span>
              <span className="text-[10px] text-text-dim">Hidden blocks still export</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onUpdateVisible(!block.visible)}
            role="switch"
            aria-checked={block.visible}
            className="relative h-5 w-9 rounded-full transition-colors"
            style={{ background: block.visible ? 'var(--wp-accent, #F26522)' : 'var(--border-muted)' }}
          >
            <motion.span
              animate={{ x: block.visible ? 18 : 2 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
            />
          </button>
        </div>

        {/* Alignment */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Alignment</label>
          <div className="flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 p-0.5">
            {(['left', 'center'] as Alignment[]).map((a) => {
              const Active = a === 'left' ? AlignLeft : AlignCenter;
              const selected = block.alignment === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onUpdateAlignment(a)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
                    selected ? 'bg-accent text-bg' : 'text-text-dim hover:bg-surface'
                  }`}
                >
                  <Active className="h-3 w-3" />
                  <span className="capitalize">{a}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Spacing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Spacing</label>
          <div className="flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 p-0.5">
            {(['tight', 'loose'] as Spacing[]).map((s) => {
              const selected = block.spacing === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateSpacing(s)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] capitalize transition-colors ${
                    selected ? 'bg-accent text-bg' : 'text-text-dim hover:bg-surface'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-dim">
            <Palette className="h-3 w-3" />
            Accent color
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(ACCENT_HEX) as AccentKey[]).map((key) => {
              const selected = block.accent === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onUpdateAccent(key)}
                  title={ACCENT_LABEL[key]}
                  className={`relative h-9 rounded-md transition-transform ${selected ? 'scale-105' : 'hover:scale-105'}`}
                  style={{
                    background: ACCENT_HEX[key],
                    boxShadow: selected ? `0 0 0 2px var(--wp-accent, #F26522), 0 0 0 4px rgba(242,101,34,0.20)` : 'none',
                  }}
                >
                  {selected ? <CheckCircle2 className="absolute right-1 top-1 h-3 w-3 text-white" /> : null}
                </button>
              );
            })}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-text-dim/70">
            {ACCENT_LABEL[block.accent]} · {ACCENT_HEX[block.accent]}
          </div>
        </div>

        {/* Spacer-specific */}
        {block.kind === 'spacer' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Spacer height</label>
            <div className="flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 p-0.5">
              {[1, 2, 3].map((steps) => {
                const selected = block.heightSteps === steps;
                return (
                  <button
                    key={steps}
                    type="button"
                    onClick={() => onUpdateSpacerHeight(steps)}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                      selected ? 'bg-accent text-bg' : 'text-text-dim hover:bg-surface'
                    }`}
                  >
                    {steps}x
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Delete */}
        {!block.required ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-2 rounded-md border border-[rgba(220,38,69,0.30)] bg-[rgba(220,38,69,0.06)] px-2.5 py-2 text-xs font-medium text-[#FF7B38] transition-colors hover:bg-[rgba(220,38,69,0.12)]"
          >
            <Trash2 className="h-3 w-3" />
            Delete block
          </button>
        ) : (
          <div className="rounded-md border border-border-muted bg-surface-2 px-2.5 py-2 text-center text-[10px] text-text-dim">
            This block cannot be deleted.
          </div>
        )}

        <div
          className="mt-2 rounded-md border bg-surface-2 p-2.5 text-[10px]"
          style={{ borderColor: 'var(--border-muted)', color: 'var(--text-dim)' }}
        >
          <div className="font-mono uppercase tracking-wider">Block id</div>
          <div className="mt-0.5 font-mono text-text">{block.id}</div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// TopToolbar — sticky strip with breadcrumb, type pills, and the two
// export buttons. The export buttons are the meat of N3 — they call the
// real `handlePdf` / `handleXlsx` handlers.
// ---------------------------------------------------------------------------

type PreviewMode = 'document' | 'xlsx';

interface TopToolbarProps {
  agencyName: string;
  region: string;
  type: ReportType;
  onTypeChange: (next: ReportType) => void;
  previewMode: PreviewMode;
  onPreviewModeChange: (next: PreviewMode) => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  isExportingPdf: boolean;
  isExportingXlsx: boolean;
}

function TopToolbar({
  agencyName,
  region,
  type,
  onTypeChange,
  previewMode,
  onPreviewModeChange,
  onExportPdf,
  onExportXlsx,
  isExportingPdf,
  isExportingXlsx,
}: TopToolbarProps): JSX.Element {
  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b px-6 py-3"
      style={{
        background: 'rgba(10,10,10,0.85)',
        borderColor: 'var(--border-muted)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: breadcrumb */}
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(242,101,34,0.15)', color: 'var(--wp-accent, #F26522)' }}
        >
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
            <span className="truncate">{agencyName}</span>
            <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" />
            <span>Reports</span>
            <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" />
            <span style={{ color: 'var(--wp-accent, #F26522)' }}>{TYPE_NAME[type]}</span>
          </div>
          <div className="truncate text-xs font-semibold text-text">
            {agencyName} · {region}
          </div>
        </div>
      </div>

      {/* Center: type pills */}
      <div
        className="hidden items-center gap-1 rounded-full border bg-surface-2 p-1 md:flex"
        style={{ borderColor: 'var(--border-muted)' }}
      >
        {(Object.keys(TYPE_NAME) as ReportType[]).map((t) => {
          const Icon = TYPE_ICON[t];
          const selected = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTypeChange(t)}
              className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{
                color: selected ? 'var(--bg)' : 'var(--text-dim)',
              }}
            >
              {selected ? (
                <motion.span
                  layoutId="type-pill-bg"
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'var(--wp-accent, #F26522)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              ) : null}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="h-3 w-3" />
                {TYPE_NAME[t]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right: preview-mode toggle + exports */}
      <div className="flex items-center gap-2">
        {/* Preview-mode segmented toggle */}
        <div
          className="hidden items-center gap-0.5 rounded-md border bg-surface-2 p-0.5 md:flex"
          style={{ borderColor: 'var(--border-muted)' }}
          role="tablist"
          aria-label="Preview mode"
        >
          {(['document', 'xlsx'] as PreviewMode[]).map((mode) => {
            const selected = mode === previewMode;
            const ModeIcon = mode === 'document' ? FileText : FileSpreadsheet;
            const label = mode === 'document' ? 'Document' : 'XLSX';
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onPreviewModeChange(mode)}
                className="relative flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  color: selected ? 'var(--bg)' : 'var(--text-dim)',
                }}
                title={mode === 'document' ? 'Document editor preview' : 'XLSX spreadsheet preview'}
              >
                {selected ? (
                  <motion.span
                    layoutId="preview-mode-slider"
                    className="absolute inset-0 rounded"
                    style={{ background: 'var(--wp-accent, #F26522)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-1.5">
                  <ModeIcon className="h-3 w-3" />
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExportPdf}
          disabled={isExportingPdf}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
          style={{ background: 'var(--wp-accent, #F26522)', color: 'var(--bg)' }}
        >
          <FileText className="h-3.5 w-3.5" />
          {isExportingPdf ? 'Generating…' : 'Export PDF'}
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExportXlsx}
          disabled={isExportingXlsx}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
          style={{
            borderColor: 'rgba(242,101,34,0.40)',
            background: 'rgba(242,101,34,0.08)',
            color: 'var(--wp-accent, #F26522)',
          }}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {isExportingXlsx ? 'Generating…' : 'Export XLSX'}
        </motion.button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBar — bottom strip. Auto-save chip, block count, word count,
// page estimate, dirty indicator.
// ---------------------------------------------------------------------------

interface StatusBarProps {
  previewMode: PreviewMode;
  blockCount: number;
  visibleBlockCount: number;
  wordCount: number;
  pageCount: number;
  workbook: WorkbookData;
  savedSecondsAgo: number;
  dirty: boolean;
  type: ReportType;
}

function StatusBar({
  previewMode,
  blockCount,
  visibleBlockCount,
  wordCount,
  pageCount,
  workbook,
  savedSecondsAgo,
  dirty,
  type,
}: StatusBarProps): JSX.Element {
  const totalCells = countWorkbookCells(workbook);
  const sizeKb = estimateWorkbookKb(workbook);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2 font-mono text-[10px] uppercase tracking-wider text-text-dim"
      style={{ borderColor: 'var(--border-muted)', background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-3">
        {previewMode === 'document' ? (
          <>
            <div className="flex items-center gap-1.5">
              <motion.div
                animate={
                  dirty
                    ? { backgroundColor: 'var(--wp-warning, #ffb454)' }
                    : { backgroundColor: 'var(--wp-success, #3ddc97)' }
                }
                transition={{ duration: 0.4 }}
                className="h-1.5 w-1.5 rounded-full"
              />
              {dirty ? (
                <span style={{ color: 'var(--wp-warning, #ffb454)' }}>Unsaved changes</span>
              ) : (
                <span>
                  <Save className="mr-1 inline h-2.5 w-2.5" />
                  Auto-saved · {formatRelativeSeconds(savedSecondsAgo)}
                </span>
              )}
            </div>
            <span className="text-text-dim/40">|</span>
            <span>Doc type · {TYPE_NAME[type]}</span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--wp-accent, #F26522)' }}
              />
              <span style={{ color: 'var(--wp-accent, #F26522)' }}>XLSX preview</span>
            </div>
            <span className="text-text-dim/40">|</span>
            <span>Doc type · {TYPE_NAME[type]}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {previewMode === 'document' ? (
          <>
            <span>
              Blocks · <span className="text-text">{blockCount}</span> ({visibleBlockCount} visible)
            </span>
            <span className="text-text-dim/40">|</span>
            <span>
              Words · <span className="text-text">{formatNumber(wordCount)}</span>
            </span>
            <span className="text-text-dim/40">|</span>
            <span>
              Length · <span className="text-text">≈ {pageCount} page{pageCount === 1 ? '' : 's'}</span>
            </span>
          </>
        ) : (
          <>
            <span>
              Sheets · <span className="text-text">{workbook.sheets.length}</span>
            </span>
            <span className="text-text-dim/40">|</span>
            <span>
              Cells · <span className="text-text">{formatNumber(totalCells)}</span> total
            </span>
            <span className="text-text-dim/40">|</span>
            <span>
              Size · <span className="text-text">≈ {sizeKb} KB</span> estimated
            </span>
          </>
        )}
        <span className="text-text-dim/40">|</span>
        <span className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real export handlers — split out for clarity. Both return the file
// name they wrote so the caller can toast it.
// ---------------------------------------------------------------------------

function buildPdfFile(d: AgencyReportsData, type: ReportType): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const metric = d.metrics[type];
  const pageWidth = doc.internal.pageSize.getWidth();
  const accentHex = TYPE_HEX[type];
  // accent → RGB
  const r = parseInt(accentHex.slice(1, 3), 16);
  const g = parseInt(accentHex.slice(3, 5), 16);
  const b = parseInt(accentHex.slice(5, 7), 16);

  // Cover band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, 60, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${d.agency.name} · ${TYPE_NAME[type]} Report`, 40, 38);

  // Eyebrow + meta
  doc.setTextColor(20, 13, 5);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${TYPE_EYEBROW[type].toUpperCase()} · ${formatTodayLong()} · ${d.agency.region}`, 40, 80);

  // Pull quote
  doc.setTextColor(40, 28, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'italic');
  doc.text(metric.pullQuote, 40, 100, { maxWidth: pageWidth - 80 });

  // Summary tiles strip
  const summaryY = 140;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 74, 53);
  const tileWidth = (pageWidth - 80 - 30) / 4;
  const tiles: Array<[string, string]> = [
    ['TOTAL', formatNumber(metric.summary.total)],
    ['AVG', formatNumber(metric.summary.avg)],
    ['HIGH', formatNumber(metric.summary.high)],
    ['LOW', formatNumber(metric.summary.low)],
  ];
  tiles.forEach((tile, idx) => {
    const label = tile[0];
    const value = tile[1];
    const x = 40 + idx * (tileWidth + 10);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, summaryY, tileWidth, 36, 4, 4, 'S');
    doc.setFontSize(7);
    doc.setTextColor(r, g, b);
    doc.text(label, x + 6, summaryY + 12);
    doc.setFontSize(14);
    doc.setTextColor(20, 13, 5);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 6, summaryY + 28);
    doc.setFont('helvetica', 'normal');
  });

  // Detail table
  autoTable(doc, {
    startY: summaryY + 56,
    head: [['Sub-client', 'Domain', 'Value', 'Δ', 'Status']],
    body: metric.rows.map((row) => [
      row.subClient,
      row.domain,
      formatNumber(row.value),
      formatDelta(row.delta),
      row.status,
    ]),
    headStyles: {
      fillColor: [r, g, b],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, textColor: [20, 13, 5] },
    alternateRowStyles: { fillColor: [251, 247, 243] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: 40, right: 40 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(107, 74, 53);
  doc.text(`Generated by WarmPulse · ${new Date().toISOString()}`, 40, pageHeight - 24);
  doc.setTextColor(r, g, b);
  doc.text('Confidential', pageWidth - 40, pageHeight - 24, { align: 'right' });

  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${dateStr}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ---------------------------------------------------------------------------
// XLSX sheet data shape — single source of truth shared by the real
// download (`buildXlsxFile`) and the live in-app `SpreadsheetPreview`. By
// computing the rows once and feeding both consumers, the preview is
// guaranteed to mirror what `XLSX.writeFile` emits.
// ---------------------------------------------------------------------------

interface WorkbookSheet {
  name: string;
  rows: Array<Array<string | number>>;
  /** Column widths in chars — `wch`. */
  colWidths: number[];
}

interface WorkbookData {
  sheets: WorkbookSheet[];
}

function buildWorkbookData(d: AgencyReportsData, type: ReportType): WorkbookData {
  const metric = d.metrics[type];

  // Summary sheet — mirrors buildXlsxFile exactly.
  const summaryRows: Array<Array<string | number>> = [
    ['Agency', d.agency.name],
    ['Region', d.agency.region],
    ['Report type', TYPE_NAME[type]],
    ['Generated', new Date().toISOString()],
    [],
    ['Headline', metric.headline],
    ['Summary', metric.pullQuote],
    [],
    ['Metric', 'Value'],
    ['Total', metric.summary.total],
    ['Average', metric.summary.avg],
    ['High', metric.summary.high],
    ['Low', metric.summary.low],
    [],
    ['Sub-client count', d.subClients.length],
    ['Mailbox count', d.subClients.reduce((acc, c) => acc + c.mailboxCount, 0)],
  ];

  // Detail sheet.
  const detailRows: Array<Array<string | number>> = [
    ['Sub-client', 'Domain', 'Value', 'Delta', 'Status'],
    ...metric.rows.map((row) => [row.subClient, row.domain, row.value, row.delta, row.status]),
  ];

  // Sub-clients sheet.
  const clientsRows: Array<Array<string | number>> = [
    ['Id', 'Sub-client', 'Domain', 'Mailbox count'],
    ...d.subClients.map((c) => [c.id, c.name, c.domain, c.mailboxCount]),
  ];

  return {
    sheets: [
      { name: 'Summary', rows: summaryRows, colWidths: [22, 56] },
      { name: 'Detail', rows: detailRows, colWidths: [24, 28, 12, 10, 10] },
      { name: 'Sub-clients', rows: clientsRows, colWidths: [8, 24, 28, 14] },
    ],
  };
}

function buildXlsxFile(d: AgencyReportsData, type: ReportType): string {
  const wb = XLSX.utils.book_new();
  const data = buildWorkbookData(d, type);
  data.sheets.forEach((sheet) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws['!cols'] = sheet.colWidths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${d.agency.name.toLowerCase().replace(/\s+/g, '-')}-${type}-${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

// ---------------------------------------------------------------------------
// Spreadsheet helpers — column letters (A, B, ..., Z, AA), cell count,
// estimated file size, value rendering.
// ---------------------------------------------------------------------------

function columnLetter(index: number): string {
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function countSheetCells(sheet: WorkbookSheet): number {
  return sheet.rows.reduce((acc, row) => acc + row.length, 0);
}

function countWorkbookCells(wb: WorkbookData): number {
  return wb.sheets.reduce((acc, s) => acc + countSheetCells(s), 0);
}

/** Rough estimate — fine for the status-bar hint, not an exact byte count. */
function estimateWorkbookKb(wb: WorkbookData): number {
  let chars = 0;
  wb.sheets.forEach((sheet) => {
    sheet.rows.forEach((row) => {
      row.forEach((cell) => {
        chars += String(cell ?? '').length + 6;
      });
    });
  });
  // OOXML overhead — flat empirical multiplier.
  const bytes = chars * 1.8 + 4_500;
  return Math.max(1, Math.round(bytes / 1024));
}

// ---------------------------------------------------------------------------
// SpreadsheetPreview — Excel / Sheets-style render of the XLSX workbook.
// Active sheet switching, column-letter strip, row-number gutter, header
// row tint, alternating body rows, A1 selection outline.
// ---------------------------------------------------------------------------

interface SpreadsheetPreviewProps {
  workbook: WorkbookData;
  activeSheetIdx: number;
  onChangeSheet: (idx: number) => void;
}

const SHEET_HEADER_BG = 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, var(--wp-surface, #fbf7f3))';
const SHEET_BORDER = 'rgba(20,12,6,0.18)';
const SHEET_CELL_BORDER = 'rgba(20,12,6,0.10)';
const SHEET_ROW_ALT = 'rgba(242,101,34,0.03)';
const SHEET_BG = '#ffffff';
const SHEET_GUTTER_BG = '#f3eee9';
const SHEET_GUTTER_INK = '#6b4a35';
const SHEET_INK = '#1a0d05';

function isNumeric(v: string | number): boolean {
  return typeof v === 'number';
}

function SpreadsheetPreview({
  workbook,
  activeSheetIdx,
  onChangeSheet,
}: SpreadsheetPreviewProps): JSX.Element {
  const sheet: WorkbookSheet | undefined =
    workbook.sheets[activeSheetIdx] ?? workbook.sheets[0];
  if (!sheet) {
    return (
      <div
        className="flex w-full max-w-[1180px] items-center justify-center rounded-xl border bg-white p-12 text-sm text-text-dim"
        style={{ borderColor: SHEET_BORDER }}
      >
        No sheets in this workbook.
      </div>
    );
  }
  const sheetRows = sheet.rows;
  const sheetColWidths = sheet.colWidths;
  const totalCols = Math.max(
    ...sheetRows.map((r) => r.length),
    sheetColWidths.length,
    1
  );
  // Render a few extra blank columns so the grid feels like an actual spreadsheet
  const displayedCols = Math.max(totalCols + 2, 8);
  // Render a few extra blank rows.
  const displayedRows = Math.max(sheetRows.length + 4, 24);

  // Default column width in px when colWidths runs out.
  const defaultColPx = 90;
  const colPxFromCh = (ch: number): number => Math.round(ch * 7.5 + 16);

  const colWidthsPx: number[] = [];
  for (let c = 0; c < displayedCols; c += 1) {
    const ch = sheetColWidths[c];
    colWidthsPx.push(ch ? colPxFromCh(ch) : defaultColPx);
  }

  return (
    <div className="flex h-full w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border bg-white shadow-2xl"
      style={{ borderColor: SHEET_BORDER, boxShadow: '0 24px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)' }}
    >
      {/* Formula bar / name box (cosmetic, A1 marker) */}
      <div
        className="flex items-center gap-3 border-b px-3 py-1.5"
        style={{ borderColor: SHEET_CELL_BORDER, background: SHEET_GUTTER_BG }}
      >
        <div
          className="flex h-6 w-14 items-center justify-center rounded border bg-white text-[11px] font-mono font-semibold"
          style={{ borderColor: SHEET_CELL_BORDER, color: SHEET_INK }}
        >
          A1
        </div>
        <div
          className="flex h-6 flex-1 items-center rounded border bg-white px-2 font-mono text-[11px]"
          style={{ borderColor: SHEET_CELL_BORDER, color: SHEET_INK }}
        >
          {String(sheetRows[0]?.[0] ?? '')}
        </div>
      </div>

      {/* Grid */}
      <div className="flex flex-1 flex-col overflow-auto" style={{ background: SHEET_BG }}>
        <table
          className="border-collapse"
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            color: SHEET_INK,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: 44 }} />
            {colWidthsPx.map((w, idx) => (
              <col key={`col-${idx}`} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* Top-left corner cell */}
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: SHEET_GUTTER_BG,
                  borderRight: `1px solid ${SHEET_CELL_BORDER}`,
                  borderBottom: `1px solid ${SHEET_CELL_BORDER}`,
                  height: 22,
                }}
              />
              {Array.from({ length: displayedCols }, (_, c) => (
                <th
                  key={`hdr-${c}`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: SHEET_GUTTER_BG,
                    color: SHEET_GUTTER_INK,
                    borderRight: `1px solid ${SHEET_CELL_BORDER}`,
                    borderBottom: `1px solid ${SHEET_CELL_BORDER}`,
                    fontWeight: 600,
                    fontSize: 10,
                    height: 22,
                    textAlign: 'center',
                  }}
                >
                  {columnLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayedRows }, (_, rowIdx) => {
              const row = sheetRows[rowIdx];
              const isHeaderRow = rowIdx === 0 && row && row.length > 0;
              const rowAlt = !isHeaderRow && rowIdx % 2 === 1;
              return (
                <tr key={`row-${rowIdx}`}>
                  {/* Row number gutter */}
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: SHEET_GUTTER_BG,
                      color: SHEET_GUTTER_INK,
                      borderRight: `1px solid ${SHEET_CELL_BORDER}`,
                      borderBottom: `1px solid ${SHEET_CELL_BORDER}`,
                      fontWeight: 500,
                      fontSize: 10,
                      textAlign: 'center',
                      height: 22,
                    }}
                  >
                    {rowIdx + 1}
                  </th>
                  {Array.from({ length: displayedCols }, (_, colIdx) => {
                    const value: string | number | undefined = row?.[colIdx];
                    const hasValue = value !== undefined && value !== null && value !== '';
                    const numeric = hasValue && isNumeric(value);
                    const isA1 = rowIdx === 0 && colIdx === 0;
                    const headerCell = isHeaderRow && hasValue;
                    return (
                      <td
                        key={`cell-${rowIdx}-${colIdx}`}
                        style={{
                          padding: '2px 6px',
                          height: 22,
                          borderRight: `1px solid ${SHEET_CELL_BORDER}`,
                          borderBottom: `1px solid ${SHEET_CELL_BORDER}`,
                          background: headerCell
                            ? SHEET_HEADER_BG
                            : rowAlt
                            ? SHEET_ROW_ALT
                            : SHEET_BG,
                          color: headerCell ? '#C8470E' : SHEET_INK,
                          fontWeight: headerCell ? 700 : 400,
                          textAlign: numeric ? 'right' : 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          outline: isA1 ? '2px solid var(--wp-accent, #F26522)' : 'none',
                          outlineOffset: isA1 ? '-2px' : undefined,
                        }}
                        title={hasValue ? String(value) : ''}
                      >
                        {hasValue ? String(value) : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs */}
      <div
        className="flex items-center gap-0 border-t px-2"
        style={{ borderColor: SHEET_CELL_BORDER, background: SHEET_GUTTER_BG }}
      >
        {workbook.sheets.map((s, idx) => {
          const selected = idx === activeSheetIdx;
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onChangeSheet(idx)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors"
              style={{
                color: selected ? 'var(--wp-accent, #F26522)' : SHEET_GUTTER_INK,
                fontWeight: selected ? 700 : 500,
                background: selected ? SHEET_BG : 'transparent',
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
              }}
            >
              <span>{s.name}</span>
              <span
                className="font-mono"
                style={{ fontSize: 9, color: selected ? '#C8470E' : SHEET_GUTTER_INK, opacity: 0.7 }}
              >
                {s.rows.length}r
              </span>
              {selected ? (
                <motion.span
                  layoutId="sheet-tab-underline"
                  className="absolute inset-x-1 bottom-0 h-[2px] rounded"
                  style={{ background: 'var(--wp-accent, #F26522)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              ) : null}
            </button>
          );
        })}
        <div className="ml-auto px-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: SHEET_GUTTER_INK }}>
          Ready · {sheetRows.length} rows × {totalCols} cols
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkbookInspectorRail — right rail when in XLSX mode. Lists the three
// sheets + their row count, plus a format panel (extension, est size,
// last generated time).
// ---------------------------------------------------------------------------

interface WorkbookInspectorRailProps {
  workbook: WorkbookData;
  activeSheetIdx: number;
  onChangeSheet: (idx: number) => void;
  type: ReportType;
  generatedAt: number;
}

function WorkbookInspectorRail({
  workbook,
  activeSheetIdx,
  onChangeSheet,
  type,
  generatedAt,
}: WorkbookInspectorRailProps): JSX.Element {
  const totalCells = countWorkbookCells(workbook);
  const sizeKb = estimateWorkbookKb(workbook);
  const generatedLabel = new Date(generatedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <aside
      className="hidden flex-col border-l xl:flex"
      style={{
        width: 280,
        minWidth: 280,
        background: 'var(--surface)',
        borderColor: 'var(--border-muted)',
      }}
    >
      <div className="sticky top-0 flex max-h-screen flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
          <FileSpreadsheet className="h-3 w-3" />
          Workbook
        </div>

        {/* Workbook structure */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-dim">
            Sheets in this workbook
          </div>
          <div className="flex flex-col gap-1">
            {workbook.sheets.map((sheet, idx) => {
              const selected = idx === activeSheetIdx;
              return (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => onChangeSheet(idx)}
                  className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                    selected ? 'bg-[rgba(242,101,34,0.10)]' : 'border-transparent hover:bg-surface-2'
                  }`}
                  style={selected ? { borderColor: 'rgba(242,101,34,0.30)' } : undefined}
                >
                  <div
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold"
                    style={{
                      background: selected ? 'rgba(242,101,34,0.18)' : 'rgba(242,101,34,0.08)',
                      color: 'var(--wp-accent, #F26522)',
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: selected ? 'var(--text)' : 'var(--text-dim)' }}
                    >
                      {sheet.name}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-dim/70">
                      {sheet.rows.length} rows · {countSheetCells(sheet)} cells
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Format</div>
          <div
            className="rounded-md border bg-surface-2 p-3 text-[11px]"
            style={{ borderColor: 'var(--border-muted)' }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-text-dim">Extension</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--wp-accent, #F26522)' }}>
                .xlsx
              </span>
            </div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-text-dim">Sheets</span>
              <span className="font-mono font-semibold text-text">{workbook.sheets.length}</span>
            </div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-text-dim">Total cells</span>
              <span className="font-mono font-semibold text-text">{totalCells}</span>
            </div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-text-dim">Est. size</span>
              <span className="font-mono font-semibold text-text">≈ {sizeKb} KB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-dim">Last generated</span>
              <span className="font-mono text-text">{generatedLabel}</span>
            </div>
          </div>
        </div>

        {/* Filename hint */}
        <div
          className="rounded-md border bg-surface-2 p-2.5 text-[10px]"
          style={{ borderColor: 'var(--border-muted)', color: 'var(--text-dim)' }}
        >
          <div className="font-mono uppercase tracking-wider">Filename pattern</div>
          <div className="mt-0.5 break-all font-mono text-text">
            {`{agency}-${type}-{date}.xlsx`}
          </div>
        </div>

        {/* Hint */}
        <div
          className="mt-1 flex items-start gap-2 rounded-md border p-2.5 text-[10px]"
          style={{ borderColor: 'rgba(242,101,34,0.30)', background: 'rgba(242,101,34,0.06)', color: 'var(--text-dim)' }}
        >
          <FileSpreadsheet className="mt-0.5 h-3 w-3 flex-shrink-0" style={{ color: 'var(--wp-accent, #F26522)' }} />
          <span>
            Preview shows the exact workbook the Export XLSX button writes. Switch the type pill to update every sheet.
          </span>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// AgRptN3Notebook — the surface itself. Holds:
//   - active report type (one of four)
//   - document state per type (block list, block props)
//   - selected block id
//   - dirty + saved-at timestamps
//   - which block has its "add menu" open
// ---------------------------------------------------------------------------

export interface AgRptN3NotebookProps {
  data?: AgencyReportsData;
}

export function AgRptN3Notebook({ data }: AgRptN3NotebookProps = {}): JSX.Element {
  const d = data ?? MOCK_DATA;
  const reduceMotion = useReducedMotion() ?? false;

  // Active report type
  const [type, setType] = useState<ReportType>('warmth');

  // Preview mode — toggle between document editor and XLSX spreadsheet view
  const [previewMode, setPreviewMode] = useState<PreviewMode>('document');

  // Active spreadsheet sheet index (in XLSX mode)
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);

  // Timestamp the XLSX workbook was last regenerated (changes with type / mode)
  const [workbookGeneratedAt, setWorkbookGeneratedAt] = useState<number>(() => Date.now());

  // Per-type document state. Switching type swaps the document. Keep
  // them all alive so user edits persist when toggling between types.
  const [documents, setDocuments] = useState<Record<ReportType, DocumentState>>(() => ({
    warmth: makeDefaultDocument(),
    engagement: makeDefaultDocument(),
    placement: makeDefaultDocument(),
    white_label: makeDefaultDocument(),
  }));

  const currentDoc = documents[type];
  const metric = d.metrics[type];

  // Selected block id — start with the title block
  const [selectedId, setSelectedId] = useState<string | null>(() => currentDoc.blocks[0]?.id ?? null);

  // When type changes, default the selection to that doc's first block
  // if the currently-selected id is not present in the new doc.
  useEffect(() => {
    const doc = documents[type];
    if (!doc.blocks.some((b) => b.id === selectedId)) {
      setSelectedId(doc.blocks[0]?.id ?? null);
    }
  }, [type, documents, selectedId]);

  const selectedBlock = useMemo(
    () => currentDoc.blocks.find((b) => b.id === selectedId) ?? null,
    [currentDoc, selectedId]
  );

  // Hover affordance state — id of the currently-hovered block
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Add-menu state — { blockId, position }
  const [addMenu, setAddMenu] = useState<{ blockId: string; position: 'above' | 'below' } | null>(null);

  // Dirty + auto-save
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick the relative-time chip every 5s so "12 sec ago" updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Auto-save loop — flushes the dirty flag every 3s of inactivity.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      setDirty(false);
      setSavedAt(Date.now());
    }, 3_000);
    return () => clearTimeout(t);
  }, [dirty, documents, type]);

  const savedSecondsAgo = Math.floor((now - savedAt) / 1000);

  // Export state — prevents double-click
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);

  // ----- Block mutators -----

  const setDoc = useCallback(
    (typeKey: ReportType, updater: (doc: DocumentState) => DocumentState) => {
      setDocuments((prev) => {
        const next = { ...prev };
        const existing = next[typeKey];
        next[typeKey] = updater(existing);
        return next;
      });
      setDirty(true);
    },
    []
  );

  const updateBlock = useCallback(
    (blockId: string, updater: (block: DocumentBlock) => DocumentBlock) => {
      setDoc(type, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
      }));
    },
    [setDoc, type]
  );

  const handleUpdateVisible = useCallback(
    (visible: boolean) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => ({ ...b, visible }));
    },
    [selectedId, updateBlock]
  );

  const handleUpdateAlignment = useCallback(
    (alignment: Alignment) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => ({ ...b, alignment }));
    },
    [selectedId, updateBlock]
  );

  const handleUpdateSpacing = useCallback(
    (spacing: Spacing) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => ({ ...b, spacing }));
    },
    [selectedId, updateBlock]
  );

  const handleUpdateAccent = useCallback(
    (accent: AccentKey) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => ({ ...b, accent }));
    },
    [selectedId, updateBlock]
  );

  const handleUpdateLabel = useCallback(
    (label: string) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => ({ ...b, label }));
    },
    [selectedId, updateBlock]
  );

  const handleUpdateSpacerHeight = useCallback(
    (steps: number) => {
      if (!selectedId) return;
      updateBlock(selectedId, (b) => (b.kind === 'spacer' ? { ...b, heightSteps: steps } : b));
    },
    [selectedId, updateBlock]
  );

  const handleEditSummary = useCallback(
    (text: string) => {
      // Edit selected summary block — fall through to whichever is currently rendered
      setDoc(type, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) =>
          b.kind === 'summary' && b.id === selectedId
            ? { ...b, customText: text.trim().length === 0 ? null : text }
            : b
        ),
      }));
    },
    [selectedId, setDoc, type]
  );

  const handleEditFooter = useCallback(
    (text: string) => {
      setDoc(type, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) => (b.kind === 'footer' ? { ...b, footerText: text } : b)),
      }));
    },
    [setDoc, type]
  );

  const handleEditCallout = useCallback(
    (blockId: string, text: string) => {
      setDoc(type, (doc) => ({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === blockId ? { ...b, calloutText: text } : b)),
      }));
    },
    [setDoc, type]
  );

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    const block = currentDoc.blocks.find((b) => b.id === selectedId);
    if (!block || block.required) return;
    setDoc(type, (doc) => ({
      ...doc,
      blocks: doc.blocks.filter((b) => b.id !== selectedId),
    }));
    setSelectedId(currentDoc.blocks[0]?.id ?? null);
    toast.success(`${BLOCK_KIND_LABEL[block.kind]} block removed`);
  }, [currentDoc, selectedId, setDoc, type]);

  // ----- Add-block flow -----

  const createBlock = useCallback((kind: BlockKind): DocumentBlock => {
    const id = `block-${kind}-${Math.random().toString(36).slice(2, 8)}`;
    const base = {
      id,
      visible: true,
      alignment: 'left' as Alignment,
      spacing: 'loose' as Spacing,
      accent: 'orange-1' as AccentKey,
      required: false,
      label: BLOCK_KIND_LABEL[kind],
    };
    switch (kind) {
      case 'title':
        return { ...base, kind: 'title' };
      case 'summary':
        return { ...base, kind: 'summary', customText: null };
      case 'table':
        return { ...base, kind: 'table' };
      case 'chart':
        return { ...base, kind: 'chart' };
      case 'footer':
        return { ...base, kind: 'footer', footerText: 'Generated by WarmPulse' };
      case 'spacer':
        return { ...base, kind: 'spacer', heightSteps: 2 };
      case 'callout':
        return {
          ...base,
          kind: 'callout',
          calloutText: 'Add a recommendation, advisory, or context note here.',
        };
    }
  }, []);

  const handleAddBlock = useCallback(
    (kind: BlockKind, anchorId: string, position: 'above' | 'below') => {
      const newBlock = createBlock(kind);
      setDoc(type, (doc) => {
        const idx = doc.blocks.findIndex((b) => b.id === anchorId);
        if (idx === -1) {
          return { blocks: [...doc.blocks, newBlock] };
        }
        const insertAt = position === 'above' ? idx : idx + 1;
        const next = doc.blocks.slice();
        next.splice(insertAt, 0, newBlock);
        return { blocks: next };
      });
      setSelectedId(newBlock.id);
      setAddMenu(null);
      toast.success(`${BLOCK_KIND_LABEL[kind]} block added`);
    },
    [createBlock, setDoc, type]
  );

  // ----- Export wiring (REAL) -----

  const handleExportPdf = useCallback(() => {
    setIsExportingPdf(true);
    try {
      const fileName = buildPdfFile(d, type);
      toast.success(`PDF downloaded · ${fileName}`);
    } catch (err) {
      console.error('PDF export failed', err);
      toast.error('PDF export failed');
    } finally {
      setIsExportingPdf(false);
    }
  }, [d, type]);

  const handleExportXlsx = useCallback(() => {
    setIsExportingXlsx(true);
    try {
      const fileName = buildXlsxFile(d, type);
      toast.success(`XLSX downloaded · ${fileName}`);
    } catch (err) {
      console.error('XLSX export failed', err);
      toast.error('XLSX export failed');
    } finally {
      setIsExportingXlsx(false);
    }
  }, [d, type]);

  // ----- Derived counts -----

  const blockCount = currentDoc.blocks.length;
  const visibleBlockCount = currentDoc.blocks.filter((b) => b.visible).length;
  const wordCount = useMemo(() => countWordsInDocument(currentDoc, metric), [currentDoc, metric]);
  const pageCount = estimatePageCount(wordCount);

  // ----- Workbook (XLSX preview) -----
  const workbook = useMemo(() => buildWorkbookData(d, type), [d, type]);

  // Refresh the "last generated" stamp when the type changes (the workbook
  // is rebuilt) or when the user first enters XLSX mode.
  useEffect(() => {
    setWorkbookGeneratedAt(Date.now());
  }, [type, previewMode]);

  // Clamp activeSheetIdx if the workbook ever shrinks
  useEffect(() => {
    if (activeSheetIdx >= workbook.sheets.length) {
      setActiveSheetIdx(0);
    }
  }, [activeSheetIdx, workbook.sheets.length]);

  // ----- Outline jump -----

  const canvasRef = useRef<HTMLDivElement>(null);
  const handleOutlineSelect = useCallback((id: string) => {
    setSelectedId(id);
    const el = document.getElementById(`block-anchor-${id}`);
    if (el && canvasRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // ----- Render -----

  return (
    <div
      className="flex h-full min-h-screen flex-col"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <TopToolbar
        agencyName={d.agency.name}
        region={d.agency.region}
        type={type}
        onTypeChange={(next) => {
          setType(next);
        }}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        onExportPdf={handleExportPdf}
        onExportXlsx={handleExportXlsx}
        isExportingPdf={isExportingPdf}
        isExportingXlsx={isExportingXlsx}
      />

      <div className="flex flex-1 overflow-hidden">
        <OutlineRail blocks={currentDoc.blocks} selectedId={selectedId} onSelect={handleOutlineSelect} />

        {/* Canvas column */}
        <div
          ref={canvasRef}
          className="flex flex-1 justify-center overflow-y-auto px-6 py-10"
          style={{ background: 'var(--bg)' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {previewMode === 'xlsx' ? (
              <motion.div
                key={`xlsx-${type}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex w-full max-w-[1180px] flex-col gap-3"
              >
                <SpreadsheetPreview
                  workbook={workbook}
                  activeSheetIdx={activeSheetIdx}
                  onChangeSheet={setActiveSheetIdx}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] uppercase tracking-wider text-text-dim">
                  <span className="font-mono">
                    {d.agency.name.toLowerCase().replace(/\s+/g, '-')}-{type}-{new Date().toISOString().slice(0, 10)}.xlsx
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3 w-3" />
                    Click a sheet tab to switch · {workbook.sheets.length} sheets
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3" />
                    {countWorkbookCells(workbook)} cells · ≈ {estimateWorkbookKb(workbook)} KB
                  </span>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key={type}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex w-full max-w-[760px] flex-col gap-4"
            >
              {/* Paper canvas */}
              <div
                className="relative flex flex-col gap-6 rounded-xl px-12 py-12 shadow-2xl"
                style={{
                  background: CANVAS_SURFACE,
                  color: CANVAS_INK,
                  border: `1px solid ${CANVAS_BORDER}`,
                  boxShadow: '0 24px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)',
                }}
              >
                {/* Paper grain */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-40"
                  style={{
                    background: `radial-gradient(circle at 20% 10%, ${CANVAS_BG} 0%, transparent 50%), radial-gradient(circle at 80% 60%, ${CANVAS_BG} 0%, transparent 60%)`,
                  }}
                />

                {currentDoc.blocks.map((block) => {
                  const isSelected = block.id === selectedId;
                  const isHovered = hoveredId === block.id;
                  const accent = ACCENT_HEX[block.accent];
                  const spacingPadding = block.spacing === 'tight' ? 4 : 12;
                  const isAddMenuOpenForBlock = addMenu?.blockId === block.id;
                  const baseStyle: CSSProperties = {
                    paddingTop: spacingPadding,
                    paddingBottom: spacingPadding,
                    paddingLeft: 18,
                    paddingRight: 18,
                    borderLeft: isSelected ? `3px solid ${accent}` : '3px solid transparent',
                    background: isSelected ? `linear-gradient(90deg, ${accent}0E 0%, transparent 60%)` : 'transparent',
                    opacity: block.visible ? 1 : 0.4,
                    borderRadius: 4,
                    transition: 'border-color 160ms, background 160ms',
                  };
                  return (
                    <div
                      key={block.id}
                      id={`block-anchor-${block.id}`}
                      onMouseEnter={() => setHoveredId(block.id)}
                      onMouseLeave={() => {
                        setHoveredId((prev) => (prev === block.id ? null : prev));
                      }}
                      onClick={() => setSelectedId(block.id)}
                      className="group relative cursor-text"
                      style={baseStyle}
                    >
                      {isSelected ? (
                        <motion.div
                          layoutId="selected-block-stripe"
                          className="absolute -left-[3px] top-0 h-full w-[3px] rounded-r"
                          style={{ background: accent }}
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      ) : null}

                      <BlockHoverControls
                        block={block}
                        isHovered={isHovered || isSelected}
                        onAddAbove={() => setAddMenu({ blockId: block.id, position: 'above' })}
                        onAddBelow={() => setAddMenu({ blockId: block.id, position: 'below' })}
                        onToggleVisible={() => updateBlock(block.id, (b) => ({ ...b, visible: !b.visible }))}
                        onDelete={() => {
                          if (!block.required) {
                            setSelectedId(block.id);
                            handleDelete();
                          }
                        }}
                      />

                      {/* Add-menu */}
                      <AnimatePresence>
                        {isAddMenuOpenForBlock ? (
                          <AddBlockMenu
                            onAdd={(kind) => handleAddBlock(kind, block.id, addMenu.position)}
                            onClose={() => setAddMenu(null)}
                          />
                        ) : null}
                      </AnimatePresence>

                      {/* Block body */}
                      <div className="relative z-10">
                        <BlockBody
                          block={block}
                          metric={metric}
                          type={type}
                          reduceMotion={reduceMotion}
                          onEditSummary={handleEditSummary}
                          onEditFooter={handleEditFooter}
                          onEditCallout={handleEditCallout}
                        />
                      </div>

                      {/* Selected tag */}
                      {isSelected ? (
                        <div
                          className="absolute -right-2 top-2 z-20 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white shadow-md"
                          style={{ background: accent }}
                        >
                          <Circle className="h-1 w-1 fill-current" />
                          Editing
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* Final "add block" zone at the bottom */}
                <div className="relative -mx-12 mt-4 border-t pt-4" style={{ borderColor: CANVAS_RULE }}>
                  <div className="px-12">
                    <button
                      type="button"
                      onClick={() => {
                        const last = currentDoc.blocks[currentDoc.blocks.length - 1];
                        if (last) setAddMenu({ blockId: last.id, position: 'below' });
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-[11px] font-medium uppercase tracking-wider transition-colors hover:bg-[rgba(242,101,34,0.06)]"
                      style={{ borderColor: CANVAS_RULE, color: CANVAS_INK_FAINT }}
                    >
                      <PlusCircle className="h-3 w-3" />
                      Append block
                    </button>
                  </div>
                </div>
              </div>

              {/* Paper meta strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] uppercase tracking-wider text-text-dim">
                <span className="font-mono">
                  Page 1 of {pageCount} · A4 portrait
                </span>
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Doc length · {formatNumber(wordCount)} words
                </span>
                <span className="flex items-center gap-1.5">
                  <Plus className="h-3 w-3" />
                  {blockCount} blocks · {visibleBlockCount} visible
                </span>
              </div>
            </motion.div>
            )}
          </AnimatePresence>
        </div>

        {previewMode === 'xlsx' ? (
          <WorkbookInspectorRail
            workbook={workbook}
            activeSheetIdx={activeSheetIdx}
            onChangeSheet={setActiveSheetIdx}
            type={type}
            generatedAt={workbookGeneratedAt}
          />
        ) : (
          <InspectorRail
            block={selectedBlock}
            onUpdateVisible={handleUpdateVisible}
            onUpdateAlignment={handleUpdateAlignment}
            onUpdateSpacing={handleUpdateSpacing}
            onUpdateAccent={handleUpdateAccent}
            onUpdateLabel={handleUpdateLabel}
            onUpdateSpacerHeight={handleUpdateSpacerHeight}
            onDelete={handleDelete}
          />
        )}
      </div>

      <StatusBar
        previewMode={previewMode}
        blockCount={blockCount}
        visibleBlockCount={visibleBlockCount}
        wordCount={wordCount}
        pageCount={pageCount}
        workbook={workbook}
        savedSecondsAgo={savedSecondsAgo}
        dirty={dirty}
        type={type}
      />
    </div>
  );
}

export default AgRptN3Notebook;
