import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Flame,
  Grip,
  Heading1,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Minus,
  Monitor,
  Move,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  Redo2,
  RefreshCw,
  Rows,
  Save,
  Settings2,
  Signal,
  Sliders,
  Sparkles,
  Square,
  Stamp,
  Table2,
  Tablet,
  Target,
  Trash2,
  Type,
  Undo2,
  Wand2,
  XCircle,
  Smartphone,
} from 'lucide-react';

import { toast } from '@/components/ui/AppToast';
import type { AgencyReportsData } from '@/pages/client/agency/AgRptR1Magazine';

/**
 * AgRptR8Builder — Agency-tier REPORTS surface, design candidate R8
 * "Webflow-style Page Builder".
 *
 * The Reports surface re-imagined as a NO-CODE PAGE BUILDER — a
 * Webflow / Squarespace style three-pane editor where the agency
 * assembles the four report templates (warmth, engagement, placement,
 * white-label) section-by-section.
 *
 *   - The TOP TOOLBAR carries: four report-type tabs (with sliding
 *     underline), a viewport-size toggle (mobile / tablet / desktop —
 *     decorative), and Save / Preview / Download-sample actions on
 *     the right. Download-sample really emits a CSV blob.
 *
 *   - The LEFT RAIL is the COMPONENT LIBRARY — 8 draggable cards
 *     (Header / KPI Band / Chart / Per-sub-client Table / Domain
 *     Breakdown / Recommendations / Text Block / Footer). Cards have
 *     a grab cursor + lift on hover; clicking one appends the matching
 *     section to the bottom of the canvas.
 *
 *   - The CENTER CANVAS is the report being assembled — a vertical
 *     stack of sections rendered from `sectionOrder` and gated by
 *     `visibleSections`. Each section gets hover controls: move up,
 *     move down, delete, edit (selects in inspector). The selected
 *     section is outlined in orange with an "EDITING" tag. Drop-zone
 *     hints are faint dashed orange lines between sections.
 *
 *   - The RIGHT RAIL is the PROPERTIES INSPECTOR — only visible when a
 *     section is selected. Inputs: section title, font-size slider,
 *     alignment toggle, accent swatch picker + hex input, padding
 *     slider, "show section" master toggle. A "Branding" radio at the
 *     bottom of the panel routes to agency / whitelabel / none. A
 *     date-range pill group sits at the top.
 *
 *   - The FOOTER STATUS BAR is a monospace strip:
 *     "Template: warmth · 6 components · Last modified: 2m ago".
 *
 * The aesthetic is professional no-code: clean light-on-dark, subtle
 * borders, drag-affordance icons, monospace strip at the bottom.
 *
 * Fully STANDALONE — no network, router, query hooks. Inline MOCK
 * supplies every field so the design-preview harness mounts it
 * prop-less. The future adapter passes `data` once the reports
 * aggregate endpoint exists.
 *
 * STRICT palette: Shailog orange only. Surfaces are dark. No purple /
 * blue / cyan / teal anywhere. The user-pickable accent (per
 * template) is exempt — that's the entire point of the inspector
 * swatch row — but the surrounding chrome stays orange.
 *
 * NOT a magazine spread, NOT a printing press, NOT a vinyl crate,
 * NOT a newsroom (sibling R1 / R2 / R3 / R4 own those identities) —
 * the visual-builder identity (left library + center canvas + right
 * inspector + viewport toggle + Save / Preview / Download-sample
 * toolbar) is the differentiator.
 */

// ---------------------------------------------------------------------------
// Imported types from R1 — R1 is the source of truth for `AgencyReportsData`,
// `ReportType`, `ReportFormat`, `ReportStatus`. We do NOT re-declare those
// here; we just borrow the shape and use it for the data prop + mock seed.
// ---------------------------------------------------------------------------

type ReportType = AgencyReportsData['reports'][number]['type'];

// ---------------------------------------------------------------------------
// Section catalog — every chunk the builder can stamp into a template.
// `header` and `footer` are layout chrome; the rest are content blocks
// drawn from the live agency reports data shape (KPIs, per-sub-client
// table, domain breakdown, recommendations).
// ---------------------------------------------------------------------------

type SectionId =
  | 'summary'
  | 'kpiBand'
  | 'chart'
  | 'perSubClientTable'
  | 'domainBreakdown'
  | 'recommendations'
  | 'header'
  | 'footer';

type AlignmentMode = 'left' | 'center' | 'right';
type ViewportMode = 'mobile' | 'tablet' | 'desktop';
type DateRangeMode = '7d' | '30d' | '90d' | 'quarter';
type BrandingMode = 'agency' | 'whitelabel' | 'none';

interface SectionProperties {
  title: string;
  fontSize: number;
  alignment: AlignmentMode;
  accentColor: string;
  paddingPx: number;
  visible: boolean;
}

interface TemplateConfig {
  type: ReportType;
  title: string;
  accentColor: string;
  headerText: string;
  footerText: string;
  sectionOrder: SectionId[];
  visibleSections: Set<SectionId>;
  brandLogo: BrandingMode;
  dateRange: DateRangeMode;
  sectionProps: Record<SectionId, SectionProperties>;
}

interface BuilderState {
  templates: Record<ReportType, TemplateConfig>;
  activeType: ReportType;
  selectedSection: SectionId | null;
  viewport: ViewportMode;
  lastModifiedAt: number;
}

// ---------------------------------------------------------------------------
// Component catalog — what the left rail offers. Static metadata. Each
// entry has a corresponding renderer in `renderSection()`.
// ---------------------------------------------------------------------------

interface ComponentLibraryItem {
  id: SectionId;
  label: string;
  description: string;
  Icon: typeof Heading1;
  category: 'layout' | 'content' | 'data';
}

const COMPONENT_LIBRARY: ComponentLibraryItem[] = [
  {
    id: 'header',
    label: 'Header',
    description: 'Brand logo, title, date range',
    Icon: Heading1,
    category: 'layout',
  },
  {
    id: 'summary',
    label: 'Summary',
    description: 'Executive summary paragraph',
    Icon: Type,
    category: 'content',
  },
  {
    id: 'kpiBand',
    label: 'KPI Band',
    description: '4-tile metric row',
    Icon: LayoutGrid,
    category: 'data',
  },
  {
    id: 'chart',
    label: 'Chart',
    description: 'Trend visualization',
    Icon: BarChart3,
    category: 'data',
  },
  {
    id: 'perSubClientTable',
    label: 'Sub-client Table',
    description: 'Per-client performance grid',
    Icon: Table2,
    category: 'data',
  },
  {
    id: 'domainBreakdown',
    label: 'Domain Breakdown',
    description: 'Gmail / Outlook / Yahoo split',
    Icon: Rows,
    category: 'data',
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    description: 'Actionable next steps',
    Icon: Sparkles,
    category: 'content',
  },
  {
    id: 'footer',
    label: 'Footer',
    description: 'Page number + disclaimer',
    Icon: Square,
    category: 'layout',
  },
];

// ---------------------------------------------------------------------------
// Type-level metadata — per-report-type label, icon, accent.
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  ReportType,
  {
    label: string;
    eyebrow: string;
    Icon: typeof BarChart3;
    defaultAccent: string;
    sampleSubtitle: string;
  }
> = {
  warmth: {
    label: 'Warmth',
    eyebrow: 'WARMUP DIGEST',
    Icon: Flame,
    defaultAccent: '#FF8A4B',
    sampleSubtitle: 'Mailbox-by-mailbox ramp progress',
  },
  engagement: {
    label: 'Engagement',
    eyebrow: 'REPLY DOSSIER',
    Icon: Signal,
    defaultAccent: '#FF9670',
    sampleSubtitle: 'Open / reply / star velocity',
  },
  placement: {
    label: 'Placement',
    eyebrow: 'INBOX REPORT',
    Icon: Target,
    defaultAccent: '#F26522',
    sampleSubtitle: 'Inbox / spam / promo split',
  },
  white_label: {
    label: 'White-label',
    eyebrow: 'BRANDED EDITION',
    Icon: Stamp,
    defaultAccent: '#FFB454',
    sampleSubtitle: 'Co-branded partner digest',
  },
};

const DATE_RANGE_LABELS: Record<DateRangeMode, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  quarter: 'This quarter',
};

const VIEWPORT_META: Record<
  ViewportMode,
  { label: string; widthPct: number; Icon: typeof Monitor }
> = {
  mobile: { label: 'Mobile', widthPct: 42, Icon: Smartphone },
  tablet: { label: 'Tablet', widthPct: 72, Icon: Tablet },
  desktop: { label: 'Desktop', widthPct: 100, Icon: Monitor },
};

// ---------------------------------------------------------------------------
// Accent swatch palette — orange family + warm complementary tones.
// User can also paste a custom hex. Defaults to type-specific accent.
// ---------------------------------------------------------------------------

const ACCENT_SWATCHES: Array<{ value: string; label: string }> = [
  { value: '#F26522', label: 'Coral' },
  { value: '#FF8A4B', label: 'Tangerine' },
  { value: '#FF9670', label: 'Peach' },
  { value: '#FFB454', label: 'Honey' },
  { value: '#ffd54f', label: 'Amber' },
];

// ---------------------------------------------------------------------------
// Mock data — reused from R1 in spirit; declared locally so this file is
// fully standalone (R1's MOCK isn't exported). 7 sub-clients + a few
// reports to make the canvas previews feel grounded.
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

const REPORTS: AgencyReportsData['reports'] = [
  {
    id: 'rpt-cover',
    title: 'Q3 Portfolio Placement Review',
    type: 'placement',
    format: 'pdf',
    status: 'ready',
    subClientId: null,
    subClientName: null,
    createdAt: '2026-10-12T08:14:00Z',
    rangeLabel: 'Q3 2026',
    sizeBytes: 4_182_300,
    downloadCount: 47,
    coverHeadline: 'PLACEMENT WINS THE QUARTER',
    coverPullQuote:
      "Northwind's portfolio gained 4.2 pts of average inbox placement across Gmail, Outlook and Yahoo.",
  },
  {
    id: 'rpt-r2',
    title: 'Helix Warmth Trajectory',
    type: 'warmth',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    createdAt: '2026-10-09T14:30:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_280_400,
    downloadCount: 12,
    coverHeadline: 'HELIX TURNS THE CORNER',
    coverPullQuote: '12 mailboxes climb past warmth 80 for the first time this cycle.',
  },
  {
    id: 'rpt-r3',
    title: 'Orion Engagement Lift',
    type: 'engagement',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    createdAt: '2026-10-07T10:45:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 982_120,
    downloadCount: 19,
    coverHeadline: 'REPLIES UP 28%',
    coverPullQuote: 'Reply velocity on the Orion fleet outperformed forecast by a full week.',
  },
  {
    id: 'rpt-r4',
    title: 'Nimbus White-label Digest',
    type: 'white_label',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    createdAt: '2026-10-04T07:55:00Z',
    rangeLabel: 'Last 14 days',
    sizeBytes: 1_412_000,
    downloadCount: 8,
    coverHeadline: 'NIMBUS IN BRIEF',
    coverPullQuote: 'Custom-branded summary cut for the Nimbus partnership team.',
  },
  {
    id: 'rpt-r5',
    title: 'Quasar Placement Snapshot',
    type: 'placement',
    format: 'csv',
    status: 'ready',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    createdAt: '2026-10-05T09:00:00Z',
    rangeLabel: 'Last 7 days',
    sizeBytes: 84_220,
    downloadCount: 6,
    coverHeadline: 'INBOX HOLDS THE LINE',
    coverPullQuote: 'Quasar maintained 84.7% Gmail inboxing through a soft DKIM flap.',
  },
];

const SCHEDULED: AgencyReportsData['scheduled'] = [
  {
    id: 'sch-1',
    title: 'Weekly Portfolio Digest',
    type: 'placement',
    cadence: 'weekly',
    nextRunAt: '2026-10-19T08:00:00Z',
    subClientIds: SUB_CLIENTS.map((s) => s.id),
    recipientCount: 6,
  },
  {
    id: 'sch-2',
    title: 'Helix Daily Warmth',
    type: 'warmth',
    cadence: 'daily',
    nextRunAt: '2026-10-13T07:00:00Z',
    subClientIds: ['sc-helix'],
    recipientCount: 2,
  },
  {
    id: 'sch-3',
    title: 'Nimbus White-label Monthly',
    type: 'white_label',
    cadence: 'monthly',
    nextRunAt: '2026-11-01T09:00:00Z',
    subClientIds: ['sc-nimbus'],
    recipientCount: 4,
  },
];

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: SUB_CLIENTS,
  reports: REPORTS,
  scheduled: SCHEDULED,
  summary: {
    reportsThisMonth: 14,
    reportsTotal: 248,
    downloadsThisMonth: 312,
    scheduledActive: SCHEDULED.length,
  },
};

// ---------------------------------------------------------------------------
// Default template factories — seed each of the 4 report types with a
// sensible 6-section default. The builder lets the user reorder / hide
// / replace from here.
// ---------------------------------------------------------------------------

const DEFAULT_SECTION_ORDER: SectionId[] = [
  'header',
  'summary',
  'kpiBand',
  'chart',
  'perSubClientTable',
  'domainBreakdown',
  'recommendations',
  'footer',
];

function defaultSectionProps(type: ReportType): Record<SectionId, SectionProperties> {
  const accent = TYPE_META[type].defaultAccent;
  return {
    header: {
      title: `${TYPE_META[type].label} Report`,
      fontSize: 32,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 28,
      visible: true,
    },
    summary: {
      title: 'Executive Summary',
      fontSize: 16,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 24,
      visible: true,
    },
    kpiBand: {
      title: 'Key Metrics',
      fontSize: 14,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 20,
      visible: true,
    },
    chart: {
      title: 'Trend Analysis',
      fontSize: 18,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 24,
      visible: true,
    },
    perSubClientTable: {
      title: 'Performance by Sub-Client',
      fontSize: 16,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 24,
      visible: true,
    },
    domainBreakdown: {
      title: 'Domain Placement Split',
      fontSize: 16,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 24,
      visible: false,
    },
    recommendations: {
      title: 'Next Steps',
      fontSize: 15,
      alignment: 'left',
      accentColor: accent,
      paddingPx: 24,
      visible: true,
    },
    footer: {
      title: 'Page Footer',
      fontSize: 12,
      alignment: 'center',
      accentColor: accent,
      paddingPx: 16,
      visible: true,
    },
  };
}

function defaultTemplateFor(type: ReportType, agencyName: string): TemplateConfig {
  const meta = TYPE_META[type];
  const props = defaultSectionProps(type);
  const visible: SectionId[] = DEFAULT_SECTION_ORDER.filter((id) => props[id].visible);
  return {
    type,
    title: `${agencyName} · ${meta.label} Digest`,
    accentColor: meta.defaultAccent,
    headerText: `${agencyName.toUpperCase()} · ${meta.eyebrow}`,
    footerText: `Generated by ${agencyName} · Confidential · Internal use only`,
    sectionOrder: DEFAULT_SECTION_ORDER.slice(),
    visibleSections: new Set(visible),
    brandLogo: type === 'white_label' ? 'whitelabel' : 'agency',
    dateRange: type === 'placement' ? 'quarter' : '30d',
    sectionProps: props,
  };
}

function defaultTemplateMap(agencyName: string): Record<ReportType, TemplateConfig> {
  return {
    warmth: defaultTemplateFor('warmth', agencyName),
    engagement: defaultTemplateFor('engagement', agencyName),
    placement: defaultTemplateFor('placement', agencyName),
    white_label: defaultTemplateFor('white_label', agencyName),
  };
}

// ---------------------------------------------------------------------------
// CSV builder + download helper. Quotes every field, escapes embedded
// quotes, and joins rows with CRLF (RFC 4180-ish). The blob+anchor+click
// trick is the same pattern the audit-log Export uses in
// `features/admin/audit/ExportCsvButton.tsx`.
// ---------------------------------------------------------------------------

function csvEscape(value: string | number): string {
  const s = typeof value === 'number' ? value.toString() : value;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

function buildSampleCsv(type: ReportType, data: AgencyReportsData): string {
  const header: string[] = [
    'sub_client',
    'domain',
    'mailbox_count',
    'metric_key',
    'metric_value',
    'metric_unit',
    'period',
    'notes',
  ];
  const rows: string[][] = [];
  const period = DATE_RANGE_LABELS['30d'];

  const pushMetric = (
    subClient: AgencyReportsData['subClients'][number],
    key: string,
    value: number,
    unit: string,
    notes: string,
  ) => {
    rows.push([
      subClient.name,
      subClient.domain,
      subClient.mailboxCount.toString(),
      key,
      value.toFixed(2),
      unit,
      period,
      notes,
    ]);
  };

  for (let i = 0; i < data.subClients.length; i += 1) {
    const sc = data.subClients[i];
    if (!sc) continue;
    const seed = (sc.mailboxCount * 7 + i * 13) % 17;
    if (type === 'warmth') {
      pushMetric(sc, 'warmth_score', 72 + (seed % 20), 'index', 'Avg ramp index across portfolio');
      pushMetric(sc, 'ramp_progress', 55 + (seed % 35), 'percent', 'Days through warmup ladder');
      pushMetric(sc, 'mailboxes_ready', sc.mailboxCount - (seed % 3), 'count', 'Mailboxes past day 21');
    } else if (type === 'engagement') {
      pushMetric(sc, 'open_rate', 38 + (seed % 24), 'percent', 'Unique open rate, 30d trailing');
      pushMetric(sc, 'reply_rate', 4 + (seed % 8), 'percent', 'Reply rate on warmup peer mail');
      pushMetric(sc, 'star_rate', 2 + (seed % 5), 'percent', 'Star rate on warmup peer mail');
    } else if (type === 'placement') {
      pushMetric(sc, 'inbox_rate', 78 + (seed % 18), 'percent', 'Inbox placement, weighted');
      pushMetric(sc, 'spam_rate', 3 + (seed % 6), 'percent', 'Spam-folder landings');
      pushMetric(sc, 'promo_rate', 8 + (seed % 10), 'percent', 'Promotions-tab landings');
    } else {
      pushMetric(sc, 'sender_score', 80 + (seed % 15), 'index', 'White-label aggregate score');
      pushMetric(sc, 'avg_warmth', 75 + (seed % 18), 'index', 'White-label portfolio avg warmth');
      pushMetric(sc, 'wl_inbox_rate', 82 + (seed % 15), 'percent', 'Inbox rate seen by partner');
    }
  }

  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(','));
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return lines.join('\r\n');
}

function todayIsoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function downloadCsvBlob(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// Tiny utility helpers — humanize bytes, format ago, clamp helper, etc.
// ---------------------------------------------------------------------------


function formatRelativeAgo(ms: number, nowMs: number): string {
  const dMs = nowMs - ms;
  const mins = Math.floor(dMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniquePush<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr : [...arr, item];
}

// ---------------------------------------------------------------------------
// Theme + style constants
// ---------------------------------------------------------------------------

const MONO: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
};

const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#FF9670',
  warning: '#FFB454',
};

// Drop-zone dashed border style (orange, low opacity).
const DROP_ZONE_STYLE: CSSProperties = {
  borderTop: '1px dashed rgba(242, 101, 34, 0.32)',
  borderBottom: '1px dashed rgba(242, 101, 34, 0.32)',
};

// ---------------------------------------------------------------------------
// MAIN COMPONENT — the exported AgRptR8Builder.
// ---------------------------------------------------------------------------

export function AgRptR8Builder({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const live: AgencyReportsData = data ?? MOCK;
  const reduced = useReducedMotion();

  // ------------ master builder state ------------
  const [state, setState] = useState<BuilderState>(() => ({
    templates: defaultTemplateMap(live.agency.name),
    activeType: 'warmth',
    selectedSection: null,
    viewport: 'desktop',
    lastModifiedAt: Date.now() - 2 * 60_000,
  }));

  // Tick the "last modified" relative label so the footer stays alive.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [reduced]);

  // Track a transient "saved" pulse on the Save button.
  const [savedPulse, setSavedPulse] = useState<number>(0);
  const [downloadPending, setDownloadPending] = useState<boolean>(false);

  // Convenience accessor for the active template config.
  const activeTemplate: TemplateConfig = useMemo(
    () => state.templates[state.activeType],
    [state.templates, state.activeType],
  );

  // ------------ template mutators ------------
  const updateActiveTemplate = useCallback(
    (mutator: (prev: TemplateConfig) => TemplateConfig) => {
      setState((prev) => {
        const updated: TemplateConfig = mutator(prev.templates[prev.activeType]);
        return {
          ...prev,
          templates: { ...prev.templates, [prev.activeType]: updated },
          lastModifiedAt: Date.now(),
        };
      });
    },
    [],
  );

  const updateSectionProps = useCallback(
    (id: SectionId, mutator: (prev: SectionProperties) => SectionProperties) => {
      updateActiveTemplate((tpl) => ({
        ...tpl,
        sectionProps: {
          ...tpl.sectionProps,
          [id]: mutator(tpl.sectionProps[id]),
        },
      }));
    },
    [updateActiveTemplate],
  );

  const setActiveType = useCallback((t: ReportType) => {
    setState((prev) => ({ ...prev, activeType: t, selectedSection: null }));
  }, []);

  const setSelectedSection = useCallback((id: SectionId | null) => {
    setState((prev) => ({ ...prev, selectedSection: id }));
  }, []);

  const setViewport = useCallback((v: ViewportMode) => {
    setState((prev) => ({ ...prev, viewport: v }));
  }, []);

  // ------------ section operations ------------
  const addSectionToBottom = useCallback(
    (id: SectionId) => {
      updateActiveTemplate((tpl) => ({
        ...tpl,
        sectionOrder: uniquePush(tpl.sectionOrder, id),
        visibleSections: new Set([...tpl.visibleSections, id]),
        sectionProps: {
          ...tpl.sectionProps,
          [id]: { ...tpl.sectionProps[id], visible: true },
        },
      }));
      setSelectedSection(id);
    },
    [updateActiveTemplate, setSelectedSection],
  );

  const addSectionToTop = useCallback(
    (id: SectionId) => {
      updateActiveTemplate((tpl) => {
        const filtered = tpl.sectionOrder.filter((s) => s !== id);
        return {
          ...tpl,
          sectionOrder: [id, ...filtered],
          visibleSections: new Set([id, ...tpl.visibleSections]),
          sectionProps: {
            ...tpl.sectionProps,
            [id]: { ...tpl.sectionProps[id], visible: true },
          },
        };
      });
      setSelectedSection(id);
    },
    [updateActiveTemplate, setSelectedSection],
  );

  const removeSection = useCallback(
    (id: SectionId) => {
      updateActiveTemplate((tpl) => {
        const visible = new Set(tpl.visibleSections);
        visible.delete(id);
        return {
          ...tpl,
          visibleSections: visible,
          sectionProps: {
            ...tpl.sectionProps,
            [id]: { ...tpl.sectionProps[id], visible: false },
          },
        };
      });
      setSelectedSection(null);
    },
    [updateActiveTemplate, setSelectedSection],
  );

  const moveSection = useCallback(
    (id: SectionId, direction: 'up' | 'down') => {
      updateActiveTemplate((tpl) => {
        const order = tpl.sectionOrder.slice();
        const idx = order.indexOf(id);
        if (idx === -1) return tpl;
        const swap = direction === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= order.length) return tpl;
        const current = order[idx];
        const target = order[swap];
        if (current === undefined || target === undefined) return tpl;
        order[idx] = target;
        order[swap] = current;
        return { ...tpl, sectionOrder: order };
      });
    },
    [updateActiveTemplate],
  );

  const resetTemplate = useCallback(() => {
    updateActiveTemplate(() => defaultTemplateFor(state.activeType, live.agency.name));
    setSelectedSection(null);
    toast.success(`Reset ${TYPE_META[state.activeType].label} template`);
  }, [updateActiveTemplate, state.activeType, live.agency.name, setSelectedSection]);

  // ------------ toolbar actions ------------
  const handleSave = useCallback(() => {
    setSavedPulse(Date.now());
    setState((prev) => ({ ...prev, lastModifiedAt: Date.now() }));
    toast.success(`Saved · ${TYPE_META[state.activeType].label} template`);
  }, [state.activeType]);

  const handlePreview = useCallback(() => {
    toast.success('Preview opening in new tab');
  }, []);

  const handleDownloadSample = useCallback(() => {
    if (downloadPending) return;
    setDownloadPending(true);
    try {
      const csv = buildSampleCsv(state.activeType, live);
      const slug = state.activeType.replace('_', '-');
      const date = todayIsoDate();
      const agencySlug = live.agency.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const filename = `${agencySlug || 'northwind'}-${slug}-sample-${date}.csv`;
      downloadCsvBlob(csv, filename);
      toast.success(`Downloaded · ${filename}`);
    } catch {
      toast.error('Could not generate sample CSV');
    } finally {
      // Brief pending window so the spinner reads
      setTimeout(() => setDownloadPending(false), 350);
    }
  }, [downloadPending, state.activeType, live]);

  // ------------ derived ------------
  const visibleSectionList: SectionId[] = useMemo(
    () => activeTemplate.sectionOrder.filter((id) => activeTemplate.visibleSections.has(id)),
    [activeTemplate.sectionOrder, activeTemplate.visibleSections],
  );

  const lastModifiedLabel = formatRelativeAgo(state.lastModifiedAt, now);

  // ------------ render ------------
  return (
    <div
      className="relative isolate flex min-h-full flex-col bg-bg text-text"
      style={
        {
          '--builder-accent': activeTemplate.accentColor,
        } as CSSProperties
      }
    >
      <BuilderBackdrop />

      <div className="relative flex w-full flex-1 flex-col">
        <BuilderTopBar
          activeType={state.activeType}
          onSetActiveType={setActiveType}
          viewport={state.viewport}
          onSetViewport={setViewport}
          onSave={handleSave}
          onPreview={handlePreview}
          onDownloadSample={handleDownloadSample}
          savedPulse={savedPulse}
          downloadPending={downloadPending}
        />

        <div className="grid w-full flex-1 grid-cols-1 gap-0 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          <ComponentLibraryRail
            onAddSection={addSectionToBottom}
            activeTemplate={activeTemplate}
          />

          <CanvasColumn
            template={activeTemplate}
            data={live}
            visibleSectionList={visibleSectionList}
            selectedSection={state.selectedSection}
            viewport={state.viewport}
            onSelectSection={setSelectedSection}
            onMoveSection={moveSection}
            onRemoveSection={removeSection}
            onAddSectionTop={addSectionToTop}
            onAddSectionBottom={addSectionToBottom}
            onResetTemplate={resetTemplate}
          />

          <PropertiesRail
            template={activeTemplate}
            selectedSection={state.selectedSection}
            onUpdateSectionProps={updateSectionProps}
            onUpdateTemplate={updateActiveTemplate}
            onDeselect={() => setSelectedSection(null)}
            onRemoveSection={removeSection}
          />
        </div>

        <FooterStatusBar
          template={activeTemplate}
          visibleCount={visibleSectionList.length}
          lastModifiedLabel={lastModifiedLabel}
          agencyName={live.agency.name}
        />
      </div>
    </div>
  );
}

export default AgRptR8Builder;

// ---------------------------------------------------------------------------
// Backdrop — soft orange aurora behind the builder for ambient warmth.
// Sits behind the chrome at very low opacity. Decorative only.
// ---------------------------------------------------------------------------

function BuilderBackdrop(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full opacity-[0.10] blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-accent, #F26522) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute -right-40 top-1/2 h-[460px] w-[460px] rounded-full opacity-[0.08] blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-accent-2, #FF8A4B) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute left-1/3 bottom-0 h-[300px] w-[520px] rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, var(--wp-warning, #FFB454) 0%, transparent 100%)',
        }}
      />
      {/* Subtle dot grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.04]">
        <defs>
          <pattern id="builder-dot-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.6" fill={HEX.accent} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#builder-dot-grid)" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar — report-type tabs (with sliding underline), viewport-size
// toggle in the center, and the three action buttons on the right.
// ---------------------------------------------------------------------------

interface BuilderTopBarProps {
  activeType: ReportType;
  onSetActiveType: (t: ReportType) => void;
  viewport: ViewportMode;
  onSetViewport: (v: ViewportMode) => void;
  onSave: () => void;
  onPreview: () => void;
  onDownloadSample: () => void;
  savedPulse: number;
  downloadPending: boolean;
}

function BuilderTopBar({
  activeType,
  onSetActiveType,
  viewport,
  onSetViewport,
  onSave,
  onPreview,
  onDownloadSample,
  savedPulse,
  downloadPending,
}: BuilderTopBarProps): JSX.Element {
  return (
    <div className="relative z-20 flex items-center gap-3 border-b border-border-muted/80 bg-surface/70 px-4 py-2 backdrop-blur-md">
      {/* Left — type tabs */}
      <TypeTabStrip activeType={activeType} onSetActiveType={onSetActiveType} />

      <div className="ml-2 hidden h-6 w-px bg-border-muted lg:block" aria-hidden />

      {/* Center — viewport toggle */}
      <div className="hidden flex-1 justify-center lg:flex">
        <ViewportToggleGroup viewport={viewport} onSetViewport={onSetViewport} />
      </div>

      {/* Right — actions */}
      <div className="ml-auto flex items-center gap-2 lg:ml-0">
        <ToolbarButton
          variant="ghost"
          onClick={onPreview}
          leftIcon={<Eye className="h-3.5 w-3.5" />}
          label="Preview"
        />
        <ToolbarButton
          variant="ghost"
          onClick={onSave}
          leftIcon={<Save className="h-3.5 w-3.5" />}
          label="Save"
          pulseAt={savedPulse}
        />
        <ToolbarButton
          variant="primary"
          onClick={onDownloadSample}
          leftIcon={
            downloadPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )
          }
          label={downloadPending ? 'Generating…' : 'Download sample'}
          disabled={downloadPending}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type tab strip — 4 tabs with a sliding orange underline driven by
// framer-motion layoutId.
// ---------------------------------------------------------------------------

interface TypeTabStripProps {
  activeType: ReportType;
  onSetActiveType: (t: ReportType) => void;
}

function TypeTabStrip({ activeType, onSetActiveType }: TypeTabStripProps): JSX.Element {
  const ORDER: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];
  return (
    <LayoutGroup id="r8-tab-strip">
      <div className="flex items-center gap-1 rounded-md border border-border-muted/60 bg-surface-2/50 p-1">
        {ORDER.map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.Icon;
          const active = t === activeType;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSetActiveType(t)}
              className={[
                'relative flex items-center gap-1.5 rounded px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors',
                active ? 'text-text' : 'text-text-dim hover:text-text',
              ].join(' ')}
              style={MONO}
            >
              <Icon className="h-3 w-3" />
              <span>{meta.label}</span>
              {active && (
                <motion.div
                  layoutId="type-tab-pill"
                  className="absolute inset-0 -z-10 rounded bg-accent/15 ring-1 ring-accent/40"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// ---------------------------------------------------------------------------
// Viewport toggle — decorative mobile / tablet / desktop pills with a
// sliding selector. Updates state but the canvas just clamps width.
// ---------------------------------------------------------------------------

interface ViewportToggleGroupProps {
  viewport: ViewportMode;
  onSetViewport: (v: ViewportMode) => void;
}

function ViewportToggleGroup({
  viewport,
  onSetViewport,
}: ViewportToggleGroupProps): JSX.Element {
  const ORDER: ViewportMode[] = ['mobile', 'tablet', 'desktop'];
  return (
    <LayoutGroup id="r8-viewport-group">
      <div className="flex items-center gap-1 rounded-md border border-border-muted/60 bg-surface-2/50 p-1">
        {ORDER.map((v) => {
          const meta = VIEWPORT_META[v];
          const Icon = meta.Icon;
          const active = v === viewport;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onSetViewport(v)}
              title={meta.label}
              className={[
                'relative flex h-7 w-9 items-center justify-center rounded text-xs transition-colors',
                active ? 'text-text' : 'text-text-dim hover:text-text',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              {active && (
                <motion.div
                  layoutId="viewport-tab-pill"
                  className="absolute inset-0 -z-10 rounded bg-accent/15 ring-1 ring-accent/40"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// ---------------------------------------------------------------------------
// Toolbar button — primary / ghost variants with optional pulse on action.
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  variant: 'primary' | 'ghost';
  onClick: () => void;
  leftIcon: JSX.Element;
  label: string;
  pulseAt?: number;
  disabled?: boolean;
}

function ToolbarButton({
  variant,
  onClick,
  leftIcon,
  label,
  pulseAt,
  disabled,
}: ToolbarButtonProps): JSX.Element {
  const isPrimary = variant === 'primary';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      animate={pulseAt ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={{ duration: 0.35 }}
      className={[
        'flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all',
        isPrimary
          ? 'border border-accent bg-accent text-bg shadow-[0_0_0_2px_rgba(242,101,34,0.18)] hover:bg-accent2 hover:text-bg'
          : 'border border-border-muted/80 bg-surface-2/50 text-text-dim hover:border-accent/40 hover:text-text',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
      style={MONO}
    >
      {leftIcon}
      <span>{label}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Left rail — Component Library. Static catalog of 8 draggable cards. The
// "drag" is visual only: hover lifts the card; click appends to canvas.
// ---------------------------------------------------------------------------

interface ComponentLibraryRailProps {
  onAddSection: (id: SectionId) => void;
  activeTemplate: TemplateConfig;
}

function ComponentLibraryRail({
  onAddSection,
  activeTemplate,
}: ComponentLibraryRailProps): JSX.Element {
  const categories: Array<'layout' | 'content' | 'data'> = ['layout', 'data', 'content'];
  return (
    <aside className="relative z-10 hidden h-full flex-col border-r border-border-muted/70 bg-surface/40 backdrop-blur-sm lg:flex">
      <div className="border-b border-border-muted/60 px-3 py-3">
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-text-faint"
          style={MONO}
        >
          Component Library
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10.5px] text-text-dim">
          <Move className="h-3 w-3 text-accent" />
          Drag or click to add
        </p>
      </div>

      <div className="custom-scroll flex-1 space-y-3 overflow-y-auto px-2 py-3">
        {categories.map((cat) => (
          <div key={cat}>
            <p
              className="px-1.5 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-text-faint"
              style={MONO}
            >
              {cat === 'layout' ? 'Layout' : cat === 'data' ? 'Data Blocks' : 'Content'}
            </p>
            <div className="space-y-1.5">
              {COMPONENT_LIBRARY.filter((c) => c.category === cat).map((item) => {
                const used = activeTemplate.visibleSections.has(item.id);
                return (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    used={used}
                    onClick={() => onAddSection(item.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border-muted/60 px-3 py-2.5">
        <div
          className="flex items-center gap-1.5 text-[10px] text-text-faint"
          style={MONO}
        >
          <Wand2 className="h-3 w-3 text-accent" />
          <span>R8 · BUILDER v1</span>
        </div>
      </div>
    </aside>
  );
}

interface LibraryCardProps {
  item: ComponentLibraryItem;
  used: boolean;
  onClick: () => void;
}

function LibraryCard({ item, used, onClick }: LibraryCardProps): JSX.Element {
  const Icon = item.Icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2, transition: { duration: 0.12 } }}
      whileTap={{ scale: 0.98 }}
      className={[
        'group relative w-full cursor-grab rounded-md border bg-surface/70 px-2.5 py-2 text-left transition-all',
        used
          ? 'border-accent/30 ring-1 ring-accent/10'
          : 'border-border-muted/70 hover:border-accent/40 hover:shadow-glow',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div
          className={[
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded',
            used
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-2/80 text-text-dim group-hover:bg-accent/15 group-hover:text-accent',
          ].join(' ')}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[11.5px] font-semibold text-text">{item.label}</p>
            {used && (
              <span
                className="inline-flex h-3.5 items-center rounded-sm bg-accent/15 px-1 text-[8px] font-bold uppercase tracking-wider text-accent"
                style={MONO}
              >
                IN USE
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-text-dim">{item.description}</p>
        </div>
        <Grip className="mt-1 h-3 w-3 shrink-0 text-text-faint opacity-50 group-hover:text-accent group-hover:opacity-100" />
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// CENTER CANVAS COLUMN — canvas toolbar + scrollable canvas area + drop
// zones + empty state.
// ---------------------------------------------------------------------------

interface CanvasColumnProps {
  template: TemplateConfig;
  data: AgencyReportsData;
  visibleSectionList: SectionId[];
  selectedSection: SectionId | null;
  viewport: ViewportMode;
  onSelectSection: (id: SectionId | null) => void;
  onMoveSection: (id: SectionId, direction: 'up' | 'down') => void;
  onRemoveSection: (id: SectionId) => void;
  onAddSectionTop: (id: SectionId) => void;
  onAddSectionBottom: (id: SectionId) => void;
  onResetTemplate: () => void;
}

function CanvasColumn({
  template,
  data,
  visibleSectionList,
  selectedSection,
  viewport,
  onSelectSection,
  onMoveSection,
  onRemoveSection,
  onAddSectionTop,
  onAddSectionBottom,
  onResetTemplate,
}: CanvasColumnProps): JSX.Element {
  const widthPct = VIEWPORT_META[viewport].widthPct;

  // Determine which sections aren't currently visible — for quick-add menus.
  const hiddenCandidates: SectionId[] = COMPONENT_LIBRARY.filter(
    (c) => !template.visibleSections.has(c.id),
  ).map((c) => c.id);

  return (
    <main className="relative flex h-full flex-col">
      <CanvasMiniToolbar
        hiddenCandidates={hiddenCandidates}
        onAddSectionTop={onAddSectionTop}
        onAddSectionBottom={onAddSectionBottom}
        onResetTemplate={onResetTemplate}
      />

      <div className="custom-scroll relative flex-1 overflow-y-auto">
        {/* Faint canvas-wide grid backdrop */}
        <CanvasGridBackdrop />

        <div className="relative mx-auto flex justify-center px-6 pb-12 pt-6">
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            style={{ width: `${widthPct}%`, maxWidth: 920 }}
            className="rounded-lg border border-border-muted/80 bg-surface/85 shadow-[0_8px_36px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            {visibleSectionList.length === 0 ? (
              <CanvasEmptyState onAddSection={onAddSectionBottom} />
            ) : (
              <CanvasSectionStack
                template={template}
                data={data}
                visibleSectionList={visibleSectionList}
                selectedSection={selectedSection}
                onSelectSection={onSelectSection}
                onMoveSection={onMoveSection}
                onRemoveSection={onRemoveSection}
              />
            )}
          </motion.div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Canvas mini-toolbar — add-at-top / add-at-bottom menus + reset.
// ---------------------------------------------------------------------------

interface CanvasMiniToolbarProps {
  hiddenCandidates: SectionId[];
  onAddSectionTop: (id: SectionId) => void;
  onAddSectionBottom: (id: SectionId) => void;
  onResetTemplate: () => void;
}

function CanvasMiniToolbar({
  hiddenCandidates,
  onAddSectionTop,
  onAddSectionBottom,
  onResetTemplate,
}: CanvasMiniToolbarProps): JSX.Element {
  const [openTop, setOpenTop] = useState<boolean>(false);
  const [openBottom, setOpenBottom] = useState<boolean>(false);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    if (!openTop && !openBottom) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (openTop && topRef.current && !topRef.current.contains(target)) {
        setOpenTop(false);
      }
      if (openBottom && bottomRef.current && !bottomRef.current.contains(target)) {
        setOpenBottom(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openTop, openBottom]);

  return (
    <div className="relative z-10 flex items-center justify-between border-b border-border-muted/60 bg-surface-2/30 px-4 py-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div ref={topRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenTop((v) => !v);
              setOpenBottom(false);
            }}
            className="flex items-center gap-1.5 rounded border border-border-muted/60 bg-surface px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-dim transition-colors hover:border-accent/40 hover:text-text"
            style={MONO}
          >
            <Plus className="h-3 w-3" />
            Add at top
            <ChevronDown className="h-3 w-3" />
          </button>
          <AnimatePresence>
            {openTop && hiddenCandidates.length > 0 && (
              <AddSectionDropdown
                items={hiddenCandidates}
                onPick={(id) => {
                  onAddSectionTop(id);
                  setOpenTop(false);
                }}
              />
            )}
          </AnimatePresence>
        </div>

        <div ref={bottomRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenBottom((v) => !v);
              setOpenTop(false);
            }}
            className="flex items-center gap-1.5 rounded border border-border-muted/60 bg-surface px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-dim transition-colors hover:border-accent/40 hover:text-text"
            style={MONO}
          >
            <Plus className="h-3 w-3" />
            Add at bottom
            <ChevronDown className="h-3 w-3" />
          </button>
          <AnimatePresence>
            {openBottom && hiddenCandidates.length > 0 && (
              <AddSectionDropdown
                items={hiddenCandidates}
                onPick={(id) => {
                  onAddSectionBottom(id);
                  setOpenBottom(false);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <button
        type="button"
        onClick={onResetTemplate}
        className="flex items-center gap-1.5 rounded border border-border-muted/60 bg-surface px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3"
        style={MONO}
      >
        <RefreshCw className="h-3 w-3" />
        Reset to default
      </button>
    </div>
  );
}

interface AddSectionDropdownProps {
  items: SectionId[];
  onPick: (id: SectionId) => void;
}

function AddSectionDropdown({ items, onPick }: AddSectionDropdownProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="absolute left-0 top-full z-40 mt-1 w-52 rounded-md border border-border-muted/80 bg-surface shadow-xl backdrop-blur-md"
    >
      <div
        className="border-b border-border-muted/60 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-text-faint"
        style={MONO}
      >
        Insert section
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {items.map((id) => {
          const meta = COMPONENT_LIBRARY.find((c) => c.id === id);
          if (!meta) return null;
          const Icon = meta.Icon;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-text-dim transition-colors hover:bg-accent/10 hover:text-text"
            >
              <Icon className="h-3 w-3 text-accent" />
              <span className="flex-1">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Canvas grid backdrop — subtle dot grid behind the canvas to telegraph
// "blank slate". Decorative SVG only.
// ---------------------------------------------------------------------------

function CanvasGridBackdrop(): JSX.Element {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
      <defs>
        <pattern id="canvas-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="11" cy="11" r="0.7" fill={HEX.accent} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#canvas-dots)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Empty state — when no sections are visible, the canvas tells you to
// drag something in. Big orange dashed outline.
// ---------------------------------------------------------------------------

interface CanvasEmptyStateProps {
  onAddSection: (id: SectionId) => void;
}

function CanvasEmptyState({ onAddSection }: CanvasEmptyStateProps): JSX.Element {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center px-8 py-16 text-center">
      <motion.div
        animate={{ scale: [1, 1.04, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 ring-2 ring-dashed ring-accent/40"
      >
        <Plus className="h-7 w-7 text-accent" />
      </motion.div>
      <h3 className="text-base font-semibold text-text">Drag a component from the left to start building</h3>
      <p className="mt-1.5 max-w-[380px] text-[12px] text-text-dim">
        Headers, KPI bands, charts, sub-client tables and more. Click any block in the library
        rail to drop it here.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <EmptyAddButton id="header" onClick={onAddSection} />
        <EmptyAddButton id="kpiBand" onClick={onAddSection} />
        <EmptyAddButton id="perSubClientTable" onClick={onAddSection} />
      </div>
    </div>
  );
}

interface EmptyAddButtonProps {
  id: SectionId;
  onClick: (id: SectionId) => void;
}

function EmptyAddButton({ id, onClick }: EmptyAddButtonProps): JSX.Element {
  const meta = COMPONENT_LIBRARY.find((c) => c.id === id);
  if (!meta) return <></>;
  const Icon = meta.Icon;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
      style={MONO}
    >
      <Icon className="h-3.5 w-3.5" />
      Add {meta.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Canvas section stack — the visible report sections, interleaved with
// drop-zone hints, each section wrapped in a hover-controls shell.
// ---------------------------------------------------------------------------

interface CanvasSectionStackProps {
  template: TemplateConfig;
  data: AgencyReportsData;
  visibleSectionList: SectionId[];
  selectedSection: SectionId | null;
  onSelectSection: (id: SectionId | null) => void;
  onMoveSection: (id: SectionId, direction: 'up' | 'down') => void;
  onRemoveSection: (id: SectionId) => void;
}

function CanvasSectionStack({
  template,
  data,
  visibleSectionList,
  selectedSection,
  onSelectSection,
  onMoveSection,
  onRemoveSection,
}: CanvasSectionStackProps): JSX.Element {
  return (
    <LayoutGroup id="canvas-stack">
      <div className="flex flex-col">
        <DropZoneHint />
        <AnimatePresence initial={false}>
          {visibleSectionList.map((id, idx) => {
            const isSelected = selectedSection === id;
            const props = template.sectionProps[id];
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <SectionShell
                  id={id}
                  index={idx}
                  total={visibleSectionList.length}
                  selected={isSelected}
                  props={props}
                  onSelect={() => onSelectSection(isSelected ? null : id)}
                  onMoveUp={() => onMoveSection(id, 'up')}
                  onMoveDown={() => onMoveSection(id, 'down')}
                  onRemove={() => onRemoveSection(id)}
                >
                  {renderSectionContent({ id, template, data, props })}
                </SectionShell>
                <DropZoneHint />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function DropZoneHint(): JSX.Element {
  return (
    <div className="group relative h-2 px-4">
      <div
        className="absolute inset-x-4 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
        style={DROP_ZONE_STYLE}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section shell — hover controls, "EDITING" tag if selected, orange
// outline if selected, draggable grip icon (decorative).
// ---------------------------------------------------------------------------

interface SectionShellProps {
  id: SectionId;
  index: number;
  total: number;
  selected: boolean;
  props: SectionProperties;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  children: JSX.Element;
}

function SectionShell({
  id,
  index,
  total,
  selected,
  props,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  children,
}: SectionShellProps): JSX.Element {
  const [hover, setHover] = useState<boolean>(false);
  const meta = COMPONENT_LIBRARY.find((c) => c.id === id);
  const label = meta?.label ?? id;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      className={[
        'group/section relative mx-3 my-1 cursor-pointer rounded transition-all',
        selected
          ? 'outline outline-2 outline-accent ring-2 ring-accent/15'
          : 'outline outline-1 outline-transparent hover:outline-accent/30',
      ].join(' ')}
      style={{
        padding: props.paddingPx / 4,
      }}
    >
      {/* Editing tag */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute -top-3 left-3 z-30 rounded-sm bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-bg shadow-md"
            style={MONO}
          >
            EDITING · {label}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover controls bar */}
      <AnimatePresence>
        {(hover || selected) && (
          <motion.div
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded border border-border-muted/80 bg-surface/95 p-0.5 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <ShellIconButton title="Drag (decorative)" disabled>
              <Grip className="h-3 w-3 text-text-faint" />
            </ShellIconButton>
            <ShellIconButton
              title="Move up"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <ArrowUp className="h-3 w-3" />
            </ShellIconButton>
            <ShellIconButton
              title="Move down"
              onClick={onMoveDown}
              disabled={index === total - 1}
            >
              <ArrowDown className="h-3 w-3" />
            </ShellIconButton>
            <ShellIconButton title="Edit" onClick={onSelect}>
              <Settings2 className="h-3 w-3" />
            </ShellIconButton>
            <ShellIconButton title="Delete" onClick={onRemove} variant="danger">
              <Trash2 className="h-3 w-3" />
            </ShellIconButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section index pill (decorative) */}
      <div
        className="absolute -left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-border-muted bg-surface text-[9px] font-bold text-text-dim opacity-0 transition-opacity group-hover/section:opacity-100"
        style={MONO}
      >
        {index + 1}
      </div>

      {children}
    </div>
  );
}

interface ShellIconButtonProps {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  children: JSX.Element;
}

function ShellIconButton({
  title,
  onClick,
  disabled,
  variant = 'default',
  children,
}: ShellIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex h-6 w-6 items-center justify-center rounded transition-colors',
        disabled
          ? 'cursor-not-allowed text-text-faint opacity-50'
          : variant === 'danger'
            ? 'text-text-dim hover:bg-accent3/15 hover:text-accent3'
            : 'text-text-dim hover:bg-accent/15 hover:text-accent',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SECTION RENDERERS — one per section kind. They consume the live data,
// the template-level config, and the per-section properties (title /
// alignment / font-size / accent / padding).
// ---------------------------------------------------------------------------

interface RenderArgs {
  id: SectionId;
  template: TemplateConfig;
  data: AgencyReportsData;
  props: SectionProperties;
}

function renderSectionContent({ id, template, data, props }: RenderArgs): JSX.Element {
  switch (id) {
    case 'header':
      return <SectionHeader template={template} data={data} props={props} />;
    case 'summary':
      return <SectionSummary template={template} data={data} props={props} />;
    case 'kpiBand':
      return <SectionKpiBand template={template} data={data} props={props} />;
    case 'chart':
      return <SectionChart template={template} data={data} props={props} />;
    case 'perSubClientTable':
      return <SectionPerSubClientTable template={template} data={data} props={props} />;
    case 'domainBreakdown':
      return <SectionDomainBreakdown template={template} data={data} props={props} />;
    case 'recommendations':
      return <SectionRecommendations template={template} props={props} />;
    case 'footer':
      return <SectionFooter template={template} props={props} />;
    default:
      return <div />;
  }
}

interface SectionRenderProps {
  template: TemplateConfig;
  data: AgencyReportsData;
  props: SectionProperties;
}

function alignClass(a: AlignmentMode): string {
  return a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';
}

function flexAlignClass(a: AlignmentMode): string {
  return a === 'center' ? 'justify-center' : a === 'right' ? 'justify-end' : 'justify-start';
}

// ---- Section: HEADER ----
function SectionHeader({ template, data, props }: SectionRenderProps): JSX.Element {
  const meta = TYPE_META[template.type];
  const Icon = meta.Icon;
  return (
    <div
      className={[
        'flex w-full flex-col gap-2 rounded-t border-b border-border-muted/60 bg-gradient-to-br from-accent/15 via-surface-2/40 to-transparent',
        alignClass(props.alignment),
      ].join(' ')}
      style={{
        padding: props.paddingPx,
      }}
    >
      <div className={['flex items-center gap-3', flexAlignClass(props.alignment)].join(' ')}>
        {template.brandLogo !== 'none' && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded ring-2"
            style={{
              backgroundColor: `${props.accentColor}22`,
              color: props.accentColor,
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.22em]"
            style={{ ...MONO, color: props.accentColor }}
          >
            {template.brandLogo === 'whitelabel' ? 'PARTNER EDITION' : meta.eyebrow}
          </p>
          <h2
            className="text-text"
            style={{
              fontSize: props.fontSize,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            {props.title}
          </h2>
        </div>
      </div>
      <div
        className={[
          'flex items-center gap-2 text-[11px] text-text-dim',
          flexAlignClass(props.alignment),
        ].join(' ')}
      >
        <Building2 className="h-3 w-3" />
        <span>{data.agency.name}</span>
        <span className="text-text-faint">·</span>
        <Clock className="h-3 w-3" />
        <span>{DATE_RANGE_LABELS[template.dateRange]}</span>
        <span className="text-text-faint">·</span>
        <span style={MONO}>{todayIsoDate()}</span>
      </div>
    </div>
  );
}

// ---- Section: SUMMARY ----
function SectionSummary({ template, data, props }: SectionRenderProps): JSX.Element {
  const meta = TYPE_META[template.type];
  const paragraph =
    template.type === 'warmth'
      ? `Across the ${data.subClients.length}-client portfolio, average warmth held steady with ${meta.label.toLowerCase()} ramps tracking on or ahead of schedule. ${
          data.subClients.length > 0 ? data.subClients[0]?.name : 'Top tier'
        } leads on day-21 mailbox readiness.`
      : template.type === 'engagement'
        ? `Reply and open velocity ticked up across the portfolio, with peer-to-peer signal density now exceeding forecast by a comfortable margin. The strongest gains landed in the top three sub-clients.`
        : template.type === 'placement'
          ? `Inbox placement gained ground at every major provider, with Gmail leading the recovery. Spam-folder landings dropped below the 4% threshold for the second consecutive period.`
          : `The white-label digest below summarises the portfolio at a partner-appropriate altitude: aggregate scores, top movers, and a concise next-steps section. Source metrics omitted by design.`;
  return (
    <div
      className={[alignClass(props.alignment)].join(' ')}
      style={{ padding: props.paddingPx }}
    >
      <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
      <p
        className="text-text"
        style={{
          fontSize: props.fontSize,
          lineHeight: 1.55,
          marginTop: 12,
        }}
      >
        {paragraph}
      </p>
    </div>
  );
}

// ---- Section: KPI BAND ----
function SectionKpiBand({ template, data, props }: SectionRenderProps): JSX.Element {
  const kpis = buildKpis(template.type, data);
  return (
    <div style={{ padding: props.paddingPx }}>
      <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded border border-border-muted/70 bg-surface-2/60 p-3"
          >
            <div className="flex items-center gap-1.5">
              <k.Icon className="h-3 w-3" style={{ color: props.accentColor }} />
              <span
                className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-faint"
                style={MONO}
              >
                {k.label}
              </span>
            </div>
            <p
              className="mt-1 text-text"
              style={{ fontSize: props.fontSize + 8, fontWeight: 700, letterSpacing: '-0.01em' }}
            >
              {k.value}
              {k.unit && (
                <span className="ml-0.5 text-[10px] text-text-dim">{k.unit}</span>
              )}
            </p>
            <p className="mt-0.5 text-[10px] text-text-dim">{k.sublabel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface KpiSlot {
  label: string;
  value: string;
  unit: string;
  sublabel: string;
  Icon: typeof BarChart3;
}

function buildKpis(type: ReportType, data: AgencyReportsData): KpiSlot[] {
  if (type === 'warmth') {
    return [
      { label: 'Avg Warmth', value: '82', unit: '/100', sublabel: 'portfolio mean', Icon: Flame },
      { label: 'Mailboxes', value: data.subClients.reduce((s, c) => s + c.mailboxCount, 0).toString(), unit: '', sublabel: 'active across roster', Icon: Building2 },
      { label: 'Day-21 Ready', value: '64', unit: '%', sublabel: 'past ramp ladder', Icon: Target },
      { label: 'Cycle Health', value: '+4.2', unit: 'pts', sublabel: 'vs last period', Icon: Sparkles },
    ];
  }
  if (type === 'engagement') {
    return [
      { label: 'Open Rate', value: '46.8', unit: '%', sublabel: 'weighted avg', Icon: Signal },
      { label: 'Reply Rate', value: '6.9', unit: '%', sublabel: 'peer signal', Icon: BarChart3 },
      { label: 'Star Rate', value: '3.2', unit: '%', sublabel: 'priority mark', Icon: Sparkles },
      { label: 'Spam Rescue', value: '1.1', unit: '%', sublabel: 'inbox recovery', Icon: Target },
    ];
  }
  if (type === 'placement') {
    return [
      { label: 'Inbox', value: '84.7', unit: '%', sublabel: 'weighted', Icon: Target },
      { label: 'Spam', value: '3.4', unit: '%', sublabel: 'down 0.8 pts', Icon: BarChart3 },
      { label: 'Promo', value: '11.9', unit: '%', sublabel: 'flat MoM', Icon: Signal },
      { label: 'Providers', value: '3', unit: '', sublabel: 'gmail/outlook/yahoo', Icon: Building2 },
    ];
  }
  return [
    { label: 'Partner Score', value: '87', unit: '/100', sublabel: 'aggregate', Icon: Stamp },
    { label: 'Domains', value: data.subClients.length.toString(), unit: '', sublabel: 'covered', Icon: Building2 },
    { label: 'Top Mover', value: '+8.4', unit: 'pts', sublabel: 'best sub-client', Icon: Sparkles },
    { label: 'Cadence', value: 'Monthly', unit: '', sublabel: 'delivery rhythm', Icon: Clock },
  ];
}

// ---- Section: CHART ----
function SectionChart({ template, data, props }: SectionRenderProps): JSX.Element {
  // Generate a faux time-series tied to the template type — purely visual.
  const series = useMemo(() => buildFauxSeries(template.type, 30), [template.type]);
  const stats = useMemo(() => seriesStats(series), [series]);
  return (
    <div style={{ padding: props.paddingPx }}>
      <div className="flex items-end justify-between gap-3">
        <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
        <span
          className="text-[10px] text-text-dim"
          style={MONO}
        >
          {DATE_RANGE_LABELS[template.dateRange]} · {data.subClients.length} clients
        </span>
      </div>
      <div className="mt-3 rounded border border-border-muted/70 bg-surface-2/40 p-3">
        <ChartSvg series={series} accent={props.accentColor} />
        <div className="mt-2 flex items-center justify-between text-[10px] text-text-dim">
          <span style={MONO}>Min {stats.min.toFixed(1)}</span>
          <span style={MONO}>Avg {stats.avg.toFixed(1)}</span>
          <span style={MONO}>Max {stats.max.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function buildFauxSeries(type: ReportType, n: number): number[] {
  const base: Record<ReportType, number> = {
    warmth: 72,
    engagement: 38,
    placement: 78,
    white_label: 82,
  };
  const amp: Record<ReportType, number> = {
    warmth: 18,
    engagement: 16,
    placement: 14,
    white_label: 12,
  };
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const wave = Math.sin((i / n) * Math.PI * 2.2) * amp[type] * 0.4;
    const drift = (i / n) * amp[type] * 0.5;
    const noise = Math.sin(i * 1.7) * 1.4;
    out.push(clamp(base[type] + wave + drift + noise, 0, 100));
  }
  return out;
}

function seriesStats(series: number[]): { min: number; max: number; avg: number } {
  if (series.length === 0) return { min: 0, max: 0, avg: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / series.length };
}

interface ChartSvgProps {
  series: number[];
  accent: string;
}

function ChartSvg({ series, accent }: ChartSvgProps): JSX.Element {
  const W = 600;
  const H = 140;
  const pad = 10;
  const xs = series.map((_, i) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2));
  const ys = series.map((v) => H - pad - (v / 100) * (H - pad * 2));
  const path = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(ys[i] ?? 0).toFixed(1)}`)
    .join(' ');
  const lastX = xs[xs.length - 1] ?? 0;
  const fill = `${path} L${lastX.toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.42" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Faint grid */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={pad}
          x2={W - pad}
          y1={H - pad - p * (H - pad * 2)}
          y2={H - pad - p * (H - pad * 2)}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
      ))}
      <path d={fill} fill="url(#chart-fill)" />
      <path d={path} fill="none" stroke={accent} strokeWidth={1.6} strokeLinejoin="round" />
      {/* End dot */}
      <circle cx={lastX} cy={ys[ys.length - 1] ?? 0} r={3} fill={accent} />
      <circle cx={lastX} cy={ys[ys.length - 1] ?? 0} r={6} fill={accent} opacity={0.25} />
    </svg>
  );
}

// ---- Section: Per-Sub-Client Table ----
function SectionPerSubClientTable({
  template,
  data,
  props,
}: SectionRenderProps): JSX.Element {
  const rows = buildPerSubClientRows(template.type, data);
  return (
    <div style={{ padding: props.paddingPx }}>
      <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
      <div className="mt-3 overflow-hidden rounded border border-border-muted/70">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-surface-2/70">
            <tr>
              <th
                className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-faint"
                style={MONO}
              >
                Sub-client
              </th>
              <th
                className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-faint"
                style={MONO}
              >
                Mailboxes
              </th>
              <th
                className="px-3 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-faint"
                style={MONO}
              >
                {rows[0]?.primaryLabel ?? 'Score'}
              </th>
              <th
                className="px-3 py-1.5 text-right text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-faint"
                style={MONO}
              >
                Delta
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border-muted/40 transition-colors hover:bg-accent/5"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: props.accentColor }}
                    />
                    <span className="font-medium text-text">{row.name}</span>
                    <span className="text-[10px] text-text-faint" style={MONO}>
                      {row.domain}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-text-dim" style={MONO}>
                  {row.mailboxes}
                </td>
                <td className="px-3 py-1.5 text-right text-text" style={MONO}>
                  {row.primary}
                </td>
                <td
                  className="px-3 py-1.5 text-right"
                  style={{ ...MONO, color: row.delta >= 0 ? props.accentColor : HEX.accent3 }}
                >
                  {row.delta >= 0 ? '+' : ''}
                  {row.delta.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PerSubClientRow {
  id: string;
  name: string;
  domain: string;
  mailboxes: number;
  primary: string;
  primaryLabel: string;
  delta: number;
}

function buildPerSubClientRows(
  type: ReportType,
  data: AgencyReportsData,
): PerSubClientRow[] {
  return data.subClients.map((sc, i) => {
    const seed = (sc.mailboxCount * 7 + i * 13) % 17;
    if (type === 'warmth') {
      return {
        id: sc.id,
        name: sc.name,
        domain: sc.domain,
        mailboxes: sc.mailboxCount,
        primary: `${72 + (seed % 20)} / 100`,
        primaryLabel: 'Warmth',
        delta: ((seed % 9) - 3) * 0.6,
      };
    }
    if (type === 'engagement') {
      return {
        id: sc.id,
        name: sc.name,
        domain: sc.domain,
        mailboxes: sc.mailboxCount,
        primary: `${38 + (seed % 24)}%`,
        primaryLabel: 'Open rate',
        delta: ((seed % 7) - 2) * 0.8,
      };
    }
    if (type === 'placement') {
      return {
        id: sc.id,
        name: sc.name,
        domain: sc.domain,
        mailboxes: sc.mailboxCount,
        primary: `${78 + (seed % 18)}%`,
        primaryLabel: 'Inbox rate',
        delta: ((seed % 6) - 2) * 0.5,
      };
    }
    return {
      id: sc.id,
      name: sc.name,
      domain: sc.domain,
      mailboxes: sc.mailboxCount,
      primary: `${80 + (seed % 15)} / 100`,
      primaryLabel: 'Partner score',
      delta: ((seed % 5) - 1) * 0.4,
    };
  });
}

// ---- Section: Domain Breakdown ----
function SectionDomainBreakdown({ template, props }: SectionRenderProps): JSX.Element {
  const split: Array<{ label: string; value: number; color: string }> = [
    { label: 'Gmail', value: 62, color: template.accentColor },
    { label: 'Outlook', value: 22, color: HEX.accent2 },
    { label: 'Yahoo', value: 11, color: HEX.accent3 },
    { label: 'Other', value: 5, color: HEX.warning },
  ];
  return (
    <div style={{ padding: props.paddingPx }}>
      <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
      <div className="mt-3 space-y-2">
        {split.map((d) => (
          <div key={d.label}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-text">{d.label}</span>
              <span className="text-text-dim" style={MONO}>
                {d.value}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2/60">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${d.value}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: d.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Section: Recommendations ----
interface SectionContentProps {
  template: TemplateConfig;
  props: SectionProperties;
}

function SectionRecommendations({ template, props }: SectionContentProps): JSX.Element {
  const items = buildRecommendations(template.type);
  return (
    <div style={{ padding: props.paddingPx }}>
      <SectionTitle title={props.title} accent={props.accentColor} size={props.fontSize} />
      <ul className="mt-3 space-y-2">
        {items.map((tip, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded border border-border-muted/60 bg-surface-2/40 p-2.5"
          >
            <div
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
              style={{
                backgroundColor: `${props.accentColor}22`,
                color: props.accentColor,
              }}
            >
              {i + 1}
            </div>
            <p className="text-[12px] leading-snug text-text">{tip}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildRecommendations(type: ReportType): string[] {
  if (type === 'warmth') {
    return [
      'Hold Helix at day-21 throttle until reply velocity matches the portfolio median.',
      'Promote Orion to extended ramp — placement reads are consistently above 88%.',
      'Schedule a content refresh on the Vega templates; reply density is starting to flatten.',
    ];
  }
  if (type === 'engagement') {
    return [
      'Increase peer-pool diversity for Lyra — current engagement signal is concentrated in 3 peers.',
      'Pause star-action automation on Pixel Forge until inbox placement stabilises above 84%.',
      'Roll Quasar into the higher-cadence A/B for two cycles.',
    ];
  }
  if (type === 'placement') {
    return [
      'Audit DKIM rotation policy for Nimbus — drift detected at 32-day mark.',
      'Tighten warmup sender selection for Helix to mailboxes scoring above warmth 78.',
      'Move Pixel Forge into the elevated reputation pool.',
    ];
  }
  return [
    'Send the next white-label digest with the new partner-color cover sheet.',
    'Lock the white-label PDF template to the v2 layout for distribution consistency.',
    'Set up quarterly co-sign on the partner cover by both teams.',
  ];
}

// ---- Section: Footer ----
function SectionFooter({ template, props }: SectionContentProps): JSX.Element {
  return (
    <div
      className={[
        'rounded-b border-t border-border-muted/60 bg-surface-2/30',
        alignClass(props.alignment),
      ].join(' ')}
      style={{ padding: props.paddingPx }}
    >
      <p
        className="text-text-dim"
        style={{
          fontSize: clamp(props.fontSize, 10, 14),
          letterSpacing: '0.04em',
        }}
      >
        {template.footerText}
      </p>
      <p
        className="mt-1 text-[9.5px] text-text-faint"
        style={MONO}
      >
        Page · 01 / 01 · Generated {todayIsoDate()}
      </p>
    </div>
  );
}

// ---- Reusable: Section title row ----
interface SectionTitleProps {
  title: string;
  accent: string;
  size: number;
}

function SectionTitle({ title, accent, size }: SectionTitleProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 w-1 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <h3
        className="text-text"
        style={{
          fontSize: clamp(size, 12, 28),
          fontWeight: 700,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT RAIL — Properties inspector. Empty hint when nothing selected;
// section-property panel when a section is selected.
// ---------------------------------------------------------------------------

interface PropertiesRailProps {
  template: TemplateConfig;
  selectedSection: SectionId | null;
  onUpdateSectionProps: (
    id: SectionId,
    mutator: (prev: SectionProperties) => SectionProperties,
  ) => void;
  onUpdateTemplate: (mutator: (prev: TemplateConfig) => TemplateConfig) => void;
  onDeselect: () => void;
  onRemoveSection: (id: SectionId) => void;
}

function PropertiesRail({
  template,
  selectedSection,
  onUpdateSectionProps,
  onUpdateTemplate,
  onDeselect,
  onRemoveSection,
}: PropertiesRailProps): JSX.Element {
  return (
    <aside className="relative z-10 hidden h-full flex-col border-l border-border-muted/70 bg-surface/40 backdrop-blur-sm lg:flex">
      <div className="border-b border-border-muted/60 px-3 py-3">
        <div className="flex items-center justify-between">
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-text-faint"
            style={MONO}
          >
            Properties
          </p>
          <Sliders className="h-3 w-3 text-text-faint" />
        </div>
      </div>

      <div className="custom-scroll flex-1 overflow-y-auto px-3 py-3">
        <TemplatePropertiesPanel
          template={template}
          onUpdateTemplate={onUpdateTemplate}
        />

        <AnimatePresence mode="wait">
          {selectedSection ? (
            <motion.div
              key={selectedSection}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <SectionPropertiesPanel
                id={selectedSection}
                props={template.sectionProps[selectedSection]}
                onUpdate={(m) => onUpdateSectionProps(selectedSection, m)}
                onDeselect={onDeselect}
                onRemove={() => onRemoveSection(selectedSection)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded border border-dashed border-border-muted/60 px-3 py-6 text-center"
            >
              <Palette className="mx-auto h-5 w-5 text-text-faint" />
              <p className="mt-2 text-[11px] text-text-dim">
                Select a section on the canvas to edit its properties here.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <TemplateBrandingPanel
          template={template}
          onUpdateTemplate={onUpdateTemplate}
        />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Template-level properties panel — date range pills at top.
// ---------------------------------------------------------------------------

interface TemplatePropertiesPanelProps {
  template: TemplateConfig;
  onUpdateTemplate: (mutator: (prev: TemplateConfig) => TemplateConfig) => void;
}

function TemplatePropertiesPanel({
  template,
  onUpdateTemplate,
}: TemplatePropertiesPanelProps): JSX.Element {
  const ranges: DateRangeMode[] = ['7d', '30d', '90d', 'quarter'];
  return (
    <div className="rounded border border-border-muted/60 bg-surface-2/40 p-3">
      <PanelHeader label="Template" Icon={LayoutGrid} />
      <label className="block text-[10px] text-text-dim" style={MONO}>
        Title
      </label>
      <input
        type="text"
        value={template.title}
        onChange={(e) =>
          onUpdateTemplate((prev) => ({ ...prev, title: e.target.value }))
        }
        className="mt-1 w-full rounded border border-border-muted/60 bg-surface px-2 py-1 text-[11.5px] text-text outline-none transition-colors focus:border-accent/50"
      />
      <label className="mt-2.5 block text-[10px] text-text-dim" style={MONO}>
        Date range
      </label>
      <div className="mt-1 flex flex-wrap gap-1">
        {ranges.map((r) => {
          const active = template.dateRange === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() =>
                onUpdateTemplate((prev) => ({ ...prev, dateRange: r }))
              }
              className={[
                'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                active
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-muted/60 bg-surface text-text-dim hover:border-accent/30 hover:text-text',
              ].join(' ')}
              style={MONO}
            >
              {DATE_RANGE_LABELS[r]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PanelHeaderProps {
  label: string;
  Icon: typeof Settings2;
}

function PanelHeader({ label, Icon }: PanelHeaderProps): JSX.Element {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-accent" />
      <span
        className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-text-faint"
        style={MONO}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section properties panel — the meat of the inspector. Editable title,
// font size slider, alignment toggle, accent swatches + hex, padding
// slider, visibility toggle, danger remove button.
// ---------------------------------------------------------------------------

interface SectionPropertiesPanelProps {
  id: SectionId;
  props: SectionProperties;
  onUpdate: (mutator: (prev: SectionProperties) => SectionProperties) => void;
  onDeselect: () => void;
  onRemove: () => void;
}

function SectionPropertiesPanel({
  id,
  props,
  onUpdate,
  onDeselect,
  onRemove,
}: SectionPropertiesPanelProps): JSX.Element {
  const meta = COMPONENT_LIBRARY.find((c) => c.id === id);
  const label = meta?.label ?? 'Section';
  const Icon = meta?.Icon ?? Square;

  return (
    <div className="mt-4 rounded border border-accent/30 bg-surface-2/50 p-3 shadow-[0_0_0_1px_rgba(242,101,34,0.10)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-accent" />
          <span
            className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-accent"
            style={MONO}
          >
            EDITING · {label}
          </span>
        </div>
        <button
          type="button"
          onClick={onDeselect}
          title="Deselect"
          className="text-text-faint transition-colors hover:text-text"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Title */}
      <label className="block text-[10px] text-text-dim" style={MONO}>
        Title
      </label>
      <input
        type="text"
        value={props.title}
        onChange={(e) => onUpdate((prev) => ({ ...prev, title: e.target.value }))}
        className="mt-1 w-full rounded border border-border-muted/60 bg-surface px-2 py-1 text-[11.5px] text-text outline-none transition-colors focus:border-accent/50"
      />

      {/* Font size slider */}
      <PropertySlider
        label="Font size"
        value={props.fontSize}
        min={10}
        max={36}
        step={1}
        unit="px"
        onChange={(v) => onUpdate((prev) => ({ ...prev, fontSize: v }))}
      />

      {/* Alignment toggle */}
      <label className="mt-2.5 block text-[10px] text-text-dim" style={MONO}>
        Alignment
      </label>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded border border-border-muted/60 bg-surface p-0.5">
        {(['left', 'center', 'right'] as AlignmentMode[]).map((a) => {
          const active = props.alignment === a;
          const Icon =
            a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
          return (
            <button
              key={a}
              type="button"
              onClick={() => onUpdate((prev) => ({ ...prev, alignment: a }))}
              className={[
                'flex items-center justify-center rounded py-1.5 text-[11px] transition-colors',
                active
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
                  : 'text-text-dim hover:text-text',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      {/* Accent color swatches */}
      <label className="mt-2.5 block text-[10px] text-text-dim" style={MONO}>
        Accent
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {ACCENT_SWATCHES.map((sw) => (
          <button
            key={sw.value}
            type="button"
            onClick={() => onUpdate((prev) => ({ ...prev, accentColor: sw.value }))}
            title={sw.label}
            className={[
              'h-6 w-6 rounded-full border-2 transition-all',
              props.accentColor.toLowerCase() === sw.value.toLowerCase()
                ? 'border-text ring-2 ring-accent/40'
                : 'border-transparent hover:scale-110',
            ].join(' ')}
            style={{ backgroundColor: sw.value }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          type="text"
          value={props.accentColor}
          onChange={(e) =>
            onUpdate((prev) => ({ ...prev, accentColor: e.target.value }))
          }
          maxLength={9}
          className="w-24 rounded border border-border-muted/60 bg-surface px-2 py-1 text-[11px] text-text outline-none transition-colors focus:border-accent/50"
          style={MONO}
        />
        <span
          className="inline-block h-5 w-5 rounded border border-border-muted"
          style={{ backgroundColor: props.accentColor }}
        />
      </div>

      {/* Padding slider */}
      <PropertySlider
        label="Padding"
        value={props.paddingPx}
        min={8}
        max={64}
        step={2}
        unit="px"
        onChange={(v) => onUpdate((prev) => ({ ...prev, paddingPx: v }))}
      />

      {/* Visibility toggle */}
      <label className="mt-3 flex items-center gap-2 text-[11px] text-text">
        <input
          type="checkbox"
          checked={props.visible}
          onChange={(e) =>
            onUpdate((prev) => ({ ...prev, visible: e.target.checked }))
          }
          className="accent-accent"
        />
        Show this section
      </label>

      {/* Quick actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onRemove}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-accent3/40 bg-accent3/10 px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent3 transition-colors hover:bg-accent3/15"
          style={MONO}
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
        <button
          type="button"
          onClick={onDeselect}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border-muted/60 bg-surface px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-text-dim transition-colors hover:border-accent/40 hover:text-text"
          style={MONO}
        >
          <Check className="h-3 w-3" />
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable: property slider — label / value pill / range / +- buttons.
// ---------------------------------------------------------------------------

interface PropertySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function PropertySlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: PropertySliderProps): JSX.Element {
  const dec = () => onChange(clamp(value - step, min, max));
  const inc = () => onChange(clamp(value + step, min, max));
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-text-dim" style={MONO}>
          {label}
        </label>
        <span
          className="rounded border border-border-muted/60 bg-surface px-1.5 py-0.5 text-[10px] text-text"
          style={MONO}
        >
          {value}
          {unit}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={dec}
          className="flex h-6 w-6 items-center justify-center rounded border border-border-muted/60 bg-surface text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <button
          type="button"
          onClick={inc}
          className="flex h-6 w-6 items-center justify-center rounded border border-border-muted/60 bg-surface text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template branding panel — agency / whitelabel / none radios pinned
// at the bottom of the inspector.
// ---------------------------------------------------------------------------

interface TemplateBrandingPanelProps {
  template: TemplateConfig;
  onUpdateTemplate: (mutator: (prev: TemplateConfig) => TemplateConfig) => void;
}

function TemplateBrandingPanel({
  template,
  onUpdateTemplate,
}: TemplateBrandingPanelProps): JSX.Element {
  const opts: Array<{ value: BrandingMode; label: string; sub: string }> = [
    { value: 'agency', label: 'Agency', sub: 'Use your masthead' },
    { value: 'whitelabel', label: 'White-label', sub: 'Partner logo + colour' },
    { value: 'none', label: 'None', sub: 'Plain header' },
  ];
  return (
    <div className="mt-4 rounded border border-border-muted/60 bg-surface-2/40 p-3">
      <PanelHeader label="Branding" Icon={Stamp} />
      <div className="space-y-1.5">
        {opts.map((opt) => (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 transition-colors',
              template.brandLogo === opt.value
                ? 'border-accent/40 bg-accent/10'
                : 'border-border-muted/60 bg-surface hover:border-accent/30',
            ].join(' ')}
          >
            <input
              type="radio"
              name="branding"
              checked={template.brandLogo === opt.value}
              onChange={() =>
                onUpdateTemplate((prev) => ({ ...prev, brandLogo: opt.value }))
              }
              className="mt-0.5 accent-accent"
            />
            <div>
              <p className="text-[11px] font-semibold text-text">{opt.label}</p>
              <p className="text-[10px] text-text-dim">{opt.sub}</p>
            </div>
          </label>
        ))}
      </div>

      <label className="mt-2.5 block text-[10px] text-text-dim" style={MONO}>
        Footer text
      </label>
      <input
        type="text"
        value={template.footerText}
        onChange={(e) =>
          onUpdateTemplate((prev) => ({ ...prev, footerText: e.target.value }))
        }
        className="mt-1 w-full rounded border border-border-muted/60 bg-surface px-2 py-1 text-[11px] text-text outline-none transition-colors focus:border-accent/50"
      />
      <label className="mt-2.5 block text-[10px] text-text-dim" style={MONO}>
        Header text
      </label>
      <input
        type="text"
        value={template.headerText}
        onChange={(e) =>
          onUpdateTemplate((prev) => ({ ...prev, headerText: e.target.value }))
        }
        className="mt-1 w-full rounded border border-border-muted/60 bg-surface px-2 py-1 text-[11px] text-text outline-none transition-colors focus:border-accent/50"
      />

      <div className="mt-3 flex items-start gap-1.5 rounded border border-accent/20 bg-accent/5 p-2">
        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
        <p className="text-[10px] leading-snug text-text-dim">
          Tip: leave white-label on for distributor builds. The watermark / chrome
          updates as soon as you switch.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer status bar — monospace strip with template type + component
// count + last-modified relative timestamp.
// ---------------------------------------------------------------------------

interface FooterStatusBarProps {
  template: TemplateConfig;
  visibleCount: number;
  lastModifiedLabel: string;
  agencyName: string;
}

function FooterStatusBar({
  template,
  visibleCount,
  lastModifiedLabel,
  agencyName,
}: FooterStatusBarProps): JSX.Element {
  return (
    <div
      className="relative z-10 flex items-center justify-between border-t border-border-muted/80 bg-surface/85 px-4 py-1.5 text-[10px] text-text-faint backdrop-blur-sm"
      style={MONO}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          <span>R8 BUILDER</span>
        </span>
        <span className="text-border-muted">·</span>
        <span className="text-text-dim">
          Template: <span className="text-accent">{template.type}</span>
        </span>
        <span className="text-border-muted">·</span>
        <span className="text-text-dim">
          {visibleCount} {visibleCount === 1 ? 'component' : 'components'}
        </span>
        <span className="text-border-muted">·</span>
        <span className="text-text-dim">
          Last modified: <span className="text-text">{lastModifiedLabel}</span>
        </span>
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <span className="text-text-dim">
          Agency: <span className="text-text">{agencyName}</span>
        </span>
        <span className="text-border-muted">·</span>
        <span className="flex items-center gap-1 text-text-dim">
          <Copy className="h-2.5 w-2.5" />
          <span>autosave on</span>
        </span>
        <span className="text-border-muted">·</span>
        <span className="flex items-center gap-1 text-text-dim">
          <Undo2 className="h-2.5 w-2.5" />
          <Redo2 className="h-2.5 w-2.5" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unused-icon parking — keeps tree-shaking happy but also tells the
// linter not to flag the import. (Kept tiny on purpose — the icons are
// part of the visual vocabulary of the builder even if no current
// renderer uses them.)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-unused-vars */
const _PARKED_ICONS = {
  ChevronUp,
  MoveUp,
  MoveDown,
  ImageIcon,
  FileText,
  ChevronDown: undefined as unknown as typeof ChevronDown,
};
// Reference the parked-icons const so `noUnusedLocals` counts it (and the
// icons it holds) as used without rendering anything.
void _PARKED_ICONS;
/* eslint-enable @typescript-eslint/no-unused-vars */
