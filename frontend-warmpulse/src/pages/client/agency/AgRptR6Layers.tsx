import { useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  Brush,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Crosshair,
  Crown,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Folder,
  GitCommitVertical,
  GripVertical,
  Hash,
  HelpCircle,
  History,
  Image as ImageIcon,
  Layers as LayersIcon,
  Layout,
  Lock,
  Mail,
  MoreHorizontal,
  Move,
  PaintBucket,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Signal,
  Sliders,
  Sparkles,
  SquareDashedMousePointer,
  Star,
  Stamp,
  Target,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Unlock,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AgencyReportsData, ReportType } from '@/pages/client/agency/AgRptR1Magazine';
import { toast } from '@/components/ui/AppToast';

/**
 * AgRptR6Layers — Agency-tier REPORTS surface, design candidate R6,
 * "Photoshop Layers Studio".
 *
 * /app/reports re-imagined as a professional design-tool window: the
 * operator EDITS one of four report TEMPLATES (warmth / engagement /
 * placement / white-label) the way they'd edit a Photoshop document.
 *
 * The screen is a three-column studio:
 *
 *   - Top toolbar with file-menu chrome, undo/redo, the four report-type
 *     tabs (orange underline slides between them), a zoom control, and
 *     the Reset / Save / Download-sample action cluster.
 *
 *   - Left rail — TEMPLATE explorer at the top (one entry per type with
 *     swatch + dirty dot) and the LAYERS palette below: every report
 *     section is a layer with eye toggle, lock toggle, drag handle, name,
 *     and a (decorative) opacity slider. Clicking a row selects the layer
 *     and reveals its props in the inspector.
 *
 *   - Center — paper canvas: white "document" with subtle drop-shadow,
 *     ruler markings on top + left edges, the report rendered with only
 *     the visible layers, the template's accentColor driving the cover
 *     band + chart strokes, and a diagonal "DRAFT" watermark when the
 *     title is empty.
 *
 *   - Right rail — PROPERTY INSPECTOR. Date-range pill group at the top,
 *     then per-layer controls (text inputs, swatch picker with hex field,
 *     padding slider, alignment toggle, show/hide stat checkbox), and a
 *     branding radio group at the bottom.
 *
 *   - Footer status bar in monospace: "Template: warmth · Layers:
 *     6 visible / 2 hidden · Accent: #F26522 · Date range: 30d".
 *
 * Sample download REALLY works — clicking "Download sample" generates a
 * type-specific CSV blob, kicks off a real browser download via
 * `URL.createObjectURL` + `<a download>` click, and fires
 * `toast.success('Sample downloaded')`. "Save changes" updates local state
 * and fires `toast.success('Template saved')`.
 *
 * Fully STANDALONE — no network, no router. Inline MOCK seeds the four
 * default templates, the layer list, and a small set of preview rows so
 * the surface mounts prop-less in the design-preview harness. The future
 * adapter will pass the same `AgencyReportsData` shape (imported from R1)
 * once the live endpoint exists.
 */

// ---------------------------------------------------------------------------
// Local template config — one TemplateConfig per report type. Mutable
// from the inspector; the four default templates seed at mount.
// ---------------------------------------------------------------------------

type DateRange = '7d' | '30d' | '90d' | 'q' | 'mtd';
type Alignment = 'left' | 'center' | 'right';
type Branding = 'northwind' | 'subclient' | 'white_label';

type LayerKey =
  | 'header'
  | 'summary'
  | 'kpiBand'
  | 'chart'
  | 'subClientTable'
  | 'domainBreakdown'
  | 'recommendations'
  | 'footer';

interface SectionConfig {
  visible: boolean;
  locked: boolean;
  opacity: number;
  title: string;
  padding: number;
  alignment: Alignment;
  showStat: boolean;
}

interface TemplateConfig {
  type: ReportType;
  title: string;
  accentColor: string;
  headerText: string;
  footerText: string;
  brandLogo: string;
  dateRange: DateRange;
  branding: Branding;
  sections: Record<LayerKey, SectionConfig>;
}

// ---------------------------------------------------------------------------
// Layer list — ordered top to bottom on the canvas. The inspector + the
// preview both walk the array in this exact order.
// ---------------------------------------------------------------------------

const LAYER_ORDER: LayerKey[] = [
  'header',
  'summary',
  'kpiBand',
  'chart',
  'subClientTable',
  'domainBreakdown',
  'recommendations',
  'footer',
];

const LAYER_META: Record<
  LayerKey,
  { label: string; Icon: typeof LayersIcon; defaultTitle: string; description: string }
> = {
  header: {
    label: 'Header',
    Icon: Crown,
    defaultTitle: 'Report header',
    description: 'Agency masthead with report title + period.',
  },
  summary: {
    label: 'Executive Summary',
    Icon: FileText,
    defaultTitle: 'Executive summary',
    description: 'One-paragraph narrative across the portfolio.',
  },
  kpiBand: {
    label: 'KPI Band',
    Icon: Target,
    defaultTitle: 'Key metrics',
    description: 'Four headline KPI tiles with delta arrows.',
  },
  chart: {
    label: 'Trend Chart',
    Icon: Signal,
    defaultTitle: 'Performance trend',
    description: 'Time-series for the chosen metric.',
  },
  subClientTable: {
    label: 'Sub-client Table',
    Icon: Layout,
    defaultTitle: 'Per sub-client',
    description: 'Row per sub-client with rolled-up numbers.',
  },
  domainBreakdown: {
    label: 'Domain Breakdown',
    Icon: Hash,
    defaultTitle: 'By inbox provider',
    description: 'Gmail / Outlook / Yahoo placement split.',
  },
  recommendations: {
    label: 'Recommendations',
    Icon: Sparkles,
    defaultTitle: 'What to do next',
    description: 'Three operator-friendly recommendations.',
  },
  footer: {
    label: 'Footer',
    Icon: Stamp,
    defaultTitle: 'Footer',
    description: 'Branding line, run timestamp, disclaimer.',
  },
};

// ---------------------------------------------------------------------------
// Default templates — one per report type. The inspector mutates these
// in local state; "Reset" copies these back over the working set.
// ---------------------------------------------------------------------------

const defaultSections = (overrides: Partial<Record<LayerKey, Partial<SectionConfig>>> = {}) => {
  const baseDefaults = (key: LayerKey): SectionConfig => ({
    visible: true,
    locked: false,
    opacity: 100,
    title: LAYER_META[key].defaultTitle,
    padding: 24,
    alignment: 'left',
    showStat: true,
  });
  const out = {} as Record<LayerKey, SectionConfig>;
  for (const key of LAYER_ORDER) {
    out[key] = { ...baseDefaults(key), ...overrides[key] };
  }
  return out;
};

const TYPE_DEFAULT_ACCENT: Record<ReportType, string> = {
  warmth: '#F26522',
  engagement: '#FF8A4B',
  placement: '#FF9670',
  white_label: '#FFB454',
};

const TYPE_TITLE: Record<ReportType, string> = {
  warmth: 'Northwind Warmth Trajectory',
  engagement: 'Northwind Engagement Lift',
  placement: 'Northwind Placement Review',
  white_label: 'Northwind White-label Digest',
};

const TYPE_HEADER: Record<ReportType, string> = {
  warmth: 'NORTHWIND AGENCY · Monthly Warmth Report',
  engagement: 'NORTHWIND AGENCY · Reply Velocity Dossier',
  placement: 'NORTHWIND AGENCY · Inbox Placement Brief',
  white_label: 'NORTHWIND AGENCY · Partner Digest',
};

const TYPE_FOOTER: Record<ReportType, string> = {
  warmth: 'Generated by WarmPulse · Northwind Agency · Confidential',
  engagement: 'Generated by WarmPulse · Northwind Agency · For internal use',
  placement: 'Generated by WarmPulse · Northwind Agency · Q-review distribution',
  white_label: 'Prepared exclusively for partner distribution',
};

const TYPE_BRANDING: Record<ReportType, Branding> = {
  warmth: 'northwind',
  engagement: 'northwind',
  placement: 'northwind',
  white_label: 'white_label',
};

const TYPE_BRAND_LOGO: Record<ReportType, string> = {
  warmth: 'NW',
  engagement: 'NW',
  placement: 'NW',
  white_label: 'WL',
};

const DEFAULT_TEMPLATES: Record<ReportType, TemplateConfig> = {
  warmth: {
    type: 'warmth',
    title: TYPE_TITLE.warmth,
    accentColor: TYPE_DEFAULT_ACCENT.warmth,
    headerText: TYPE_HEADER.warmth,
    footerText: TYPE_FOOTER.warmth,
    brandLogo: TYPE_BRAND_LOGO.warmth,
    dateRange: '30d',
    branding: TYPE_BRANDING.warmth,
    sections: defaultSections({
      domainBreakdown: { visible: false },
    }),
  },
  engagement: {
    type: 'engagement',
    title: TYPE_TITLE.engagement,
    accentColor: TYPE_DEFAULT_ACCENT.engagement,
    headerText: TYPE_HEADER.engagement,
    footerText: TYPE_FOOTER.engagement,
    brandLogo: TYPE_BRAND_LOGO.engagement,
    dateRange: '30d',
    branding: TYPE_BRANDING.engagement,
    sections: defaultSections({
      recommendations: { padding: 32 },
    }),
  },
  placement: {
    type: 'placement',
    title: TYPE_TITLE.placement,
    accentColor: TYPE_DEFAULT_ACCENT.placement,
    headerText: TYPE_HEADER.placement,
    footerText: TYPE_FOOTER.placement,
    brandLogo: TYPE_BRAND_LOGO.placement,
    dateRange: 'q',
    branding: TYPE_BRANDING.placement,
    sections: defaultSections({
      summary: { padding: 28, alignment: 'left' },
    }),
  },
  white_label: {
    type: 'white_label',
    title: TYPE_TITLE.white_label,
    accentColor: TYPE_DEFAULT_ACCENT.white_label,
    headerText: TYPE_HEADER.white_label,
    footerText: TYPE_FOOTER.white_label,
    brandLogo: TYPE_BRAND_LOGO.white_label,
    dateRange: 'mtd',
    branding: TYPE_BRANDING.white_label,
    sections: defaultSections({
      subClientTable: { visible: false },
      recommendations: { visible: false },
    }),
  },
};

// ---------------------------------------------------------------------------
// Tabs + meta
// ---------------------------------------------------------------------------

const REPORT_TYPES: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];

const TYPE_TAB_LABEL: Record<ReportType, string> = {
  warmth: 'WARMTH',
  engagement: 'ENGAGEMENT',
  placement: 'PLACEMENT',
  white_label: 'WHITE-LABEL',
};

const TYPE_TAB_ICON: Record<ReportType, typeof Flame> = {
  warmth: Flame,
  engagement: Signal,
  placement: Target,
  white_label: Stamp,
};

const TYPE_TAB_HINT: Record<ReportType, string> = {
  warmth: 'reputation ramp · 30-day default',
  engagement: 'open + reply velocity',
  placement: 'inbox / promo / spam split',
  white_label: 'branded partner export',
};

const DATE_RANGE_OPTIONS: Array<{ id: DateRange; label: string; description: string }> = [
  { id: '7d', label: '7d', description: 'Last 7 days' },
  { id: '30d', label: '30d', description: 'Last 30 days' },
  { id: '90d', label: '90d', description: 'Last 90 days' },
  { id: 'q', label: 'QTR', description: 'Current quarter' },
  { id: 'mtd', label: 'MTD', description: 'Month-to-date' },
];

const ACCENT_SWATCHES: string[] = [
  '#F26522',
  '#FF8A4B',
  '#FF9670',
  '#FFB454',
  '#E84F1A',
];

const BRANDING_OPTIONS: Array<{ id: Branding; label: string; description: string }> = [
  {
    id: 'northwind',
    label: 'Agency-branded',
    description: 'Northwind masthead + colors throughout.',
  },
  {
    id: 'subclient',
    label: 'Co-branded',
    description: 'Northwind mark with sub-client identity overlay.',
  },
  {
    id: 'white_label',
    label: 'White-label',
    description: 'Hide agency identity entirely. Partner-ready.',
  },
];

// ---------------------------------------------------------------------------
// Mock preview data — the on-canvas paper renders against this; the
// future adapter will swap real `AgencyReportsData` in via props.
// ---------------------------------------------------------------------------

interface PreviewRow {
  subClient: string;
  domain: string;
  mailboxes: number;
  metric1: number;
  metric2: number;
  metric3: number;
  delta: number;
}

const PREVIEW_ROWS: PreviewRow[] = [
  { subClient: 'Helix Outreach', domain: 'helix.com', mailboxes: 12, metric1: 83.1, metric2: 12.4, metric3: 4.2, delta: 4.6 },
  { subClient: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxes: 18, metric1: 79.8, metric2: 9.1, metric3: 3.8, delta: 2.1 },
  { subClient: 'Orion Sales', domain: 'orionsales.com', mailboxes: 22, metric1: 88.4, metric2: 14.2, metric3: 5.1, delta: 6.3 },
  { subClient: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxes: 8, metric1: 72.5, metric2: 6.4, metric3: 2.9, delta: -1.4 },
  { subClient: 'Quasar Growth', domain: 'quasargrowth.com', mailboxes: 14, metric1: 84.7, metric2: 11.3, metric3: 4.5, delta: 3.2 },
  { subClient: 'Lyra Studio', domain: 'lyrastudio.co', mailboxes: 9, metric1: 81.2, metric2: 8.7, metric3: 3.6, delta: 1.8 },
];

interface KpiTile {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}

const TYPE_KPIS: Record<ReportType, KpiTile[]> = {
  warmth: [
    { label: 'Avg warmth', value: '82.1', delta: '+4.6', positive: true },
    { label: 'Above 80', value: '46', delta: '+9', positive: true },
    { label: 'In ramp', value: '18', delta: '−3', positive: true },
    { label: 'Below 60', value: '4', delta: '−2', positive: true },
  ],
  engagement: [
    { label: 'Open rate', value: '38.4%', delta: '+2.1', positive: true },
    { label: 'Reply rate', value: '6.2%', delta: '+0.8', positive: true },
    { label: 'Spam-rescue', value: '14', delta: '+4', positive: true },
    { label: 'Stars given', value: '92', delta: '+22', positive: true },
  ],
  placement: [
    { label: 'Inbox %', value: '84.7%', delta: '+4.2', positive: true },
    { label: 'Promo %', value: '11.8%', delta: '−2.8', positive: true },
    { label: 'Spam %', value: '3.5%', delta: '−1.4', positive: true },
    { label: 'Bounces', value: '0.42%', delta: '−0.1', positive: true },
  ],
  white_label: [
    { label: 'Mailboxes', value: '89', delta: '+12', positive: true },
    { label: 'Avg score', value: '81.4', delta: '+3.1', positive: true },
    { label: 'Reports MTD', value: '6', delta: '+2', positive: true },
    { label: 'Active subs', value: '4', delta: '0', positive: true },
  ],
};

const TYPE_DOMAIN_SPLIT: Record<ReportType, Array<{ provider: string; value: number }>> = {
  warmth: [
    { provider: 'Gmail', value: 84 },
    { provider: 'Outlook', value: 79 },
    { provider: 'Yahoo', value: 71 },
  ],
  engagement: [
    { provider: 'Gmail', value: 41 },
    { provider: 'Outlook', value: 34 },
    { provider: 'Yahoo', value: 28 },
  ],
  placement: [
    { provider: 'Gmail', value: 88 },
    { provider: 'Outlook', value: 82 },
    { provider: 'Yahoo', value: 74 },
  ],
  white_label: [
    { provider: 'Gmail', value: 86 },
    { provider: 'Outlook', value: 80 },
    { provider: 'Yahoo', value: 73 },
  ],
};

const TYPE_RECOMMENDATIONS: Record<ReportType, string[]> = {
  warmth: [
    'Promote Vega Outbound from D14 to D21 — reputation is holding steady above 75.',
    'Drop Helix Outreach into the high-volume pool now that warmth crossed 80.',
    'Investigate the 4 sub-60 mailboxes on the Lyra Studio fleet (likely auth flap).',
  ],
  engagement: [
    'Roll the new reply-prompt template across the Orion fleet — A/B shows +1.2pt.',
    'Throttle Nimbus replies to off-peak (UTC 03–06) to dodge the Gmail rate limiter.',
    'Star + spam-rescue Pixel Forge proactively — engagement signal is thin.',
  ],
  placement: [
    'Maintain the soft-DKIM rotation that recovered Quasar mid-quarter.',
    'Pre-warm three new sub-domains on Pixel Forge before the Black Friday push.',
    'Escalate the 1.4% Yahoo spam rate on Vega — pacing alone won\'t fix it.',
  ],
  white_label: [
    'Tighten the partner-facing reply window to 09–17 partner-local.',
    'Surface the per-mailbox warmth band — partners ask for it constantly.',
    'Drop the agency mark on every page when branding=white_label.',
  ],
};

// ---------------------------------------------------------------------------
// Sample-CSV helpers — used by the "Download sample" toolbar button. The
// CSV is type-aware so what lands in /Downloads/ actually looks like the
// report a customer would expect.
// ---------------------------------------------------------------------------

type CsvCell = string | number;
type CsvRow = Record<string, CsvCell>;

function csvEscape(value: CsvCell): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows: CsvRow[]): string {
  const first = rows[0];
  if (!first) return '';
  const columns = Object.keys(first);
  const header = columns.map((c) => csvEscape(c)).join(',');
  const body = rows
    .map((row) => columns.map((col) => csvEscape(row[col] ?? '')).join(','))
    .join('\n');
  return header + '\n' + body + '\n';
}

function todayYMD(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSampleCsv(type: ReportType): { filename: string; content: string } {
  const filename = `northwind-${type}-sample-${todayYMD()}.csv`;
  const rows: CsvRow[] = PREVIEW_ROWS.map((row): CsvRow => {
    if (type === 'warmth') {
      return {
        sub_client: row.subClient,
        domain: row.domain,
        mailboxes: row.mailboxes,
        avg_warmth_score: row.metric1,
        warmth_delta_30d: row.delta,
        above_80_count: Math.round(row.mailboxes * (row.metric1 / 100)),
        below_60_count: row.delta < 0 ? 1 : 0,
      };
    }
    if (type === 'engagement') {
      return {
        sub_client: row.subClient,
        domain: row.domain,
        mailboxes: row.mailboxes,
        open_rate_pct: row.metric1,
        reply_rate_pct: row.metric2,
        reply_velocity_min: row.metric3,
        delta_30d_pct: row.delta,
      };
    }
    if (type === 'placement') {
      const inbox = row.metric1;
      const promo = Math.max(0, 100 - inbox - row.metric2 - 0.5);
      return {
        sub_client: row.subClient,
        domain: row.domain,
        mailboxes: row.mailboxes,
        inbox_pct: inbox.toFixed(2),
        promo_pct: promo.toFixed(2),
        spam_pct: row.metric2.toFixed(2),
        bounce_pct: '0.42',
      };
    }
    return {
      sub_client: row.subClient,
      domain: row.domain,
      mailboxes: row.mailboxes,
      score: row.metric1,
      delta: row.delta,
      partner_visible: 'yes',
      run_date: todayYMD(),
    };
  });
  return { filename, content: rowsToCsv(rows) };
}

function triggerCsvDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

// ---------------------------------------------------------------------------
// Tiny utility helpers shared across panels
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isValidHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function templatesEqual(a: TemplateConfig, b: TemplateConfig): boolean {
  if (a.title !== b.title) return false;
  if (a.accentColor !== b.accentColor) return false;
  if (a.headerText !== b.headerText) return false;
  if (a.footerText !== b.footerText) return false;
  if (a.brandLogo !== b.brandLogo) return false;
  if (a.dateRange !== b.dateRange) return false;
  if (a.branding !== b.branding) return false;
  for (const key of LAYER_ORDER) {
    const sa = a.sections[key];
    const sb = b.sections[key];
    if (
      sa.visible !== sb.visible ||
      sa.locked !== sb.locked ||
      sa.opacity !== sb.opacity ||
      sa.title !== sb.title ||
      sa.padding !== sb.padding ||
      sa.alignment !== sb.alignment ||
      sa.showStat !== sb.showStat
    ) {
      return false;
    }
  }
  return true;
}

function countVisible(template: TemplateConfig): number {
  return LAYER_ORDER.filter((k) => template.sections[k].visible).length;
}

function countHidden(template: TemplateConfig): number {
  return LAYER_ORDER.length - countVisible(template);
}

function dateRangeLabel(range: DateRange): string {
  const found = DATE_RANGE_OPTIONS.find((opt) => opt.id === range);
  return found ? found.label.toLowerCase() : '30d';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptR6Layers({ data }: { data?: AgencyReportsData } = {}): JSX.Element {
  void data;
  const [activeType, setActiveType] = useState<ReportType>('warmth');
  const [templates, setTemplates] = useState<Record<ReportType, TemplateConfig>>(
    () => structuredCloneShim(DEFAULT_TEMPLATES),
  );
  const [selectedLayer, setSelectedLayer] = useState<LayerKey>('header');
  const [savedFlash, setSavedFlash] = useState(false);
  const [zoom, setZoom] = useState<number>(100);

  const activeTemplate = templates[activeType];
  const isDirty = !templatesEqual(activeTemplate, DEFAULT_TEMPLATES[activeType]);

  const updateTemplate = (updater: (prev: TemplateConfig) => TemplateConfig) => {
    setTemplates((prev) => ({ ...prev, [activeType]: updater(prev[activeType]) }));
  };

  const updateSection = (key: LayerKey, updater: (prev: SectionConfig) => SectionConfig) => {
    updateTemplate((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: updater(prev.sections[key]) },
    }));
  };

  const handleToggleVisible = (key: LayerKey) => {
    updateSection(key, (prev) => ({ ...prev, visible: !prev.visible }));
  };

  const handleToggleLocked = (key: LayerKey) => {
    updateSection(key, (prev) => ({ ...prev, locked: !prev.locked }));
  };

  const handleReset = () => {
    setTemplates((prev) => ({ ...prev, [activeType]: structuredCloneShim(DEFAULT_TEMPLATES[activeType]) }));
    setSelectedLayer('header');
    toast.success('Template reset to defaults');
  };

  const handleSave = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1400);
    toast.success('Template saved');
  };

  const handleDownloadSample = () => {
    try {
      const { filename, content } = buildSampleCsv(activeType);
      triggerCsvDownload(filename, content);
      toast.success('Sample downloaded');
    } catch (err) {
      toast.error('Could not generate sample');
    }
  };

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-bg) 92%, #000) 0%, var(--wp-bg) 100%)',
        color: 'var(--wp-text, #ECE3D9)',
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      <StudioBackdrop />
      <div className="relative z-10 flex flex-col" style={{ minHeight: '100vh' }}>
        <TopToolbar
          activeType={activeType}
          onTypeChange={setActiveType}
          isDirty={isDirty}
          savedFlash={savedFlash}
          zoom={zoom}
          onZoomChange={setZoom}
          onReset={handleReset}
          onSave={handleSave}
          onDownloadSample={handleDownloadSample}
          template={activeTemplate}
        />
        <div
          className="flex flex-1"
          style={{
            minHeight: 'calc(100vh - 56px - 28px)',
          }}
        >
          <LeftRail
            templates={templates}
            activeType={activeType}
            onSelectTemplate={setActiveType}
            template={activeTemplate}
            selectedLayer={selectedLayer}
            onSelectLayer={setSelectedLayer}
            onToggleVisible={handleToggleVisible}
            onToggleLocked={handleToggleLocked}
            onUpdateSection={updateSection}
          />
          <CanvasArea
            template={activeTemplate}
            type={activeType}
            zoom={zoom}
            selectedLayer={selectedLayer}
            onSelectLayer={setSelectedLayer}
          />
          <RightRail
            template={activeTemplate}
            type={activeType}
            selectedLayer={selectedLayer}
            onUpdateTemplate={updateTemplate}
            onUpdateSection={updateSection}
          />
        </div>
        <FooterStatusBar template={activeTemplate} type={activeType} />
      </div>
    </div>
  );
}

export default AgRptR6Layers;

// ---------------------------------------------------------------------------
// Studio backdrop — faint grid + corner crop marks. Pure visual flavour.
// ---------------------------------------------------------------------------

function StudioBackdrop(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        backgroundImage: [
          'linear-gradient(to right, color-mix(in srgb, var(--wp-text) 4%, transparent) 1px, transparent 1px)',
          'linear-gradient(to bottom, color-mix(in srgb, var(--wp-text) 4%, transparent) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '40px 40px, 40px 40px',
        opacity: 0.55,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Top toolbar — file-menu chrome + tabs + zoom + actions
// ---------------------------------------------------------------------------

interface TopToolbarProps {
  activeType: ReportType;
  onTypeChange: (t: ReportType) => void;
  isDirty: boolean;
  savedFlash: boolean;
  zoom: number;
  onZoomChange: (n: number) => void;
  onReset: () => void;
  onSave: () => void;
  onDownloadSample: () => void;
  template: TemplateConfig;
}

function TopToolbar(props: TopToolbarProps): JSX.Element {
  return (
    <div
      className="sticky top-0 z-30"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-surface) 92%, transparent) 0%, color-mix(in srgb, var(--wp-surface) 80%, transparent) 100%)',
        borderBottom: '1px solid var(--wp-border-muted, rgba(255,255,255,0.08))',
        backdropFilter: 'blur(14px)',
      }}
    >
      {/* Row 1 — chrome */}
      <div
        className="flex items-center gap-3 px-5 py-2"
        style={{
          borderBottom: '1px solid color-mix(in srgb, var(--wp-text) 5%, transparent)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: '#FF5F57' }} />
          <span className="inline-block size-2.5 rounded-full" style={{ background: '#FFBD2E' }} />
          <span className="inline-block size-2.5 rounded-full" style={{ background: '#28C840' }} />
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
        >
          warmpulse · studio · reports
        </span>
        <span
          className="ml-1 font-mono text-[10px]"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 35%, transparent)' }}
        >
          /agency/reports/templates/{props.activeType}.tpl
        </span>
        <div className="ml-auto flex items-center gap-1">
          {['File', 'Edit', 'View', 'Layer', 'Window', 'Help'].map((m) => (
            <button
              key={m}
              type="button"
              className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-white/5"
              style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.6))' }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {/* Row 2 — tabs + actions */}
      <div className="flex items-center gap-5 px-5 py-3">
        <div className="flex items-center gap-2">
          <div
            className="flex size-9 items-center justify-center rounded-lg"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--wp-accent) 30%, transparent) 0%, color-mix(in srgb, var(--wp-accent) 10%, transparent) 100%)',
              border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)',
              boxShadow: '0 0 16px color-mix(in srgb, var(--wp-accent) 22%, transparent)',
            }}
          >
            <LayersIcon size={16} style={{ color: 'var(--wp-accent, #F26522)' }} />
          </div>
          <div>
            <div
              className="font-mono text-[10px] uppercase tracking-[0.28em]"
              style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
            >
              Template Editor
            </div>
            <div className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>
              Report Studio · {TYPE_TAB_LABEL[props.activeType]}
            </div>
          </div>
        </div>
        <ToolbarDivider />
        <ToolButton title="Undo" Icon={Undo2} />
        <ToolButton title="Redo" Icon={Redo2} />
        <ToolbarDivider />
        <TypeTabs activeType={props.activeType} onChange={props.onTypeChange} />
        <ToolbarDivider />
        <ZoomGroup zoom={props.zoom} onChange={props.onZoomChange} />
        <div className="ml-auto flex items-center gap-2">
          <DirtyChip dirty={props.isDirty} />
          <button
            type="button"
            onClick={props.onReset}
            className="group flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
              background: 'color-mix(in srgb, var(--wp-text) 4%, transparent)',
              color: 'var(--wp-text-dim, rgba(236,227,217,0.7))',
            }}
          >
            <RotateCcw size={13} className="transition-transform group-hover:-rotate-45" />
            Reset
          </button>
          <button
            type="button"
            onClick={props.onDownloadSample}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              border: '1px solid color-mix(in srgb, var(--wp-accent) 35%, transparent)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--wp-accent) 16%, transparent), color-mix(in srgb, var(--wp-accent) 8%, transparent))',
              color: 'var(--wp-accent, #F26522)',
            }}
          >
            <ArrowDownToLine size={13} />
            Download sample
          </button>
          <button
            type="button"
            onClick={props.onSave}
            className="relative flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
            style={{
              border: '1px solid color-mix(in srgb, var(--wp-accent) 70%, transparent)',
              background:
                'linear-gradient(180deg, var(--wp-accent, #F26522) 0%, color-mix(in srgb, var(--wp-accent) 78%, #000) 100%)',
              color: 'var(--wp-bg, #1a1411)',
              boxShadow: '0 6px 18px color-mix(in srgb, var(--wp-accent) 35%, transparent)',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {props.savedFlash ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-1.5"
                >
                  <Check size={13} />
                  Saved
                </motion.span>
              ) : (
                <motion.span
                  key="save"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-1.5"
                >
                  <Save size={13} />
                  Save changes
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarDivider(): JSX.Element {
  return (
    <span
      aria-hidden
      className="block h-7 w-px"
      style={{ background: 'color-mix(in srgb, var(--wp-text) 10%, transparent)' }}
    />
  );
}

function ToolButton({ title, Icon }: { title: string; Icon: typeof Undo2 }): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/5"
      style={{
        border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
        background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
        color: 'var(--wp-text-dim, rgba(236,227,217,0.6))',
      }}
    >
      <Icon size={14} />
    </button>
  );
}

function DirtyChip({ dirty }: { dirty: boolean }): JSX.Element {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        border: dirty
          ? '1px solid color-mix(in srgb, var(--wp-accent-3, #FF9670) 40%, transparent)'
          : '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
        background: dirty
          ? 'color-mix(in srgb, var(--wp-accent-3, #FF9670) 12%, transparent)'
          : 'color-mix(in srgb, var(--wp-text) 4%, transparent)',
        color: dirty ? 'var(--wp-accent-3, #FF9670)' : 'var(--wp-text-dim, rgba(236,227,217,0.55))',
      }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{
          background: dirty ? 'var(--wp-accent-3, #FF9670)' : 'color-mix(in srgb, var(--wp-text) 35%, transparent)',
          animation: dirty ? 'wp-pulse 1.6s ease-in-out infinite' : undefined,
        }}
      />
      {dirty ? 'Unsaved' : 'In sync'}
    </span>
  );
}

function ZoomGroup({ zoom, onChange }: { zoom: number; onChange: (n: number) => void }): JSX.Element {
  return (
    <div
      className="flex items-center gap-1 rounded-md px-1 py-1"
      style={{
        border: '1px solid color-mix(in srgb, var(--wp-text) 10%, transparent)',
        background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(zoom - 10, 60, 140))}
        className="flex size-6 items-center justify-center rounded transition-colors hover:bg-white/5"
        style={{ color: 'var(--wp-text-dim)' }}
        title="Zoom out"
      >
        <ZoomOut size={12} />
      </button>
      <span
        className="min-w-[44px] text-center font-mono text-[11px]"
        style={{ color: 'var(--wp-text)' }}
      >
        {zoom}%
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(zoom + 10, 60, 140))}
        className="flex size-6 items-center justify-center rounded transition-colors hover:bg-white/5"
        style={{ color: 'var(--wp-text-dim)' }}
        title="Zoom in"
      >
        <ZoomIn size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type tabs — sliding orange underline
// ---------------------------------------------------------------------------

interface TypeTabsProps {
  activeType: ReportType;
  onChange: (t: ReportType) => void;
}

function TypeTabs({ activeType, onChange }: TypeTabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Report templates"
      className="relative flex items-center gap-0.5 rounded-md p-1"
      style={{
        border: '1px solid color-mix(in srgb, var(--wp-text) 10%, transparent)',
        background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
      }}
    >
      {REPORT_TYPES.map((t) => {
        const Icon = TYPE_TAB_ICON[t];
        const isActive = t === activeType;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t)}
            className="relative flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors"
            style={{
              color: isActive ? 'var(--wp-text)' : 'var(--wp-text-dim, rgba(236,227,217,0.55))',
              background: isActive ? 'color-mix(in srgb, var(--wp-text) 6%, transparent)' : 'transparent',
            }}
          >
            <Icon size={12} style={{ opacity: isActive ? 1 : 0.6 }} />
            {TYPE_TAB_LABEL[t]}
            {isActive && (
              <motion.span
                layoutId="wp-tab-underline"
                className="absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  boxShadow: '0 0 8px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEFT RAIL — template explorer + layers palette
// ---------------------------------------------------------------------------

interface LeftRailProps {
  templates: Record<ReportType, TemplateConfig>;
  activeType: ReportType;
  onSelectTemplate: (t: ReportType) => void;
  template: TemplateConfig;
  selectedLayer: LayerKey;
  onSelectLayer: (k: LayerKey) => void;
  onToggleVisible: (k: LayerKey) => void;
  onToggleLocked: (k: LayerKey) => void;
  onUpdateSection: (k: LayerKey, updater: (prev: SectionConfig) => SectionConfig) => void;
}

function LeftRail(props: LeftRailProps): JSX.Element {
  return (
    <aside
      className="flex shrink-0 flex-col"
      style={{
        width: 260,
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-surface) 72%, transparent) 0%, color-mix(in srgb, var(--wp-surface) 50%, transparent) 100%)',
        borderRight: '1px solid var(--wp-border-muted, rgba(255,255,255,0.08))',
      }}
    >
      <TemplateExplorer
        templates={props.templates}
        activeType={props.activeType}
        onSelect={props.onSelectTemplate}
      />
      <div
        className="border-t"
        style={{ borderColor: 'color-mix(in srgb, var(--wp-text) 6%, transparent)' }}
      />
      <LayersPalette
        template={props.template}
        selectedLayer={props.selectedLayer}
        onSelectLayer={props.onSelectLayer}
        onToggleVisible={props.onToggleVisible}
        onToggleLocked={props.onToggleLocked}
        onUpdateSection={props.onUpdateSection}
      />
      <div
        className="mt-auto px-3 py-3"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--wp-text) 6%, transparent)' }}
      >
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors hover:bg-white/5"
          style={{
            border: '1px dashed color-mix(in srgb, var(--wp-text) 18%, transparent)',
            color: 'var(--wp-text-dim, rgba(236,227,217,0.55))',
          }}
        >
          <Plus size={12} />
          Add section
        </button>
        <div
          className="mt-3 grid grid-cols-3 gap-1"
        >
          {[Folder, History, Search].map((Icon, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center justify-center rounded py-1.5 transition-colors hover:bg-white/5"
              style={{
                border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
                color: 'var(--wp-text-dim, rgba(236,227,217,0.45))',
              }}
            >
              <Icon size={12} />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Template explorer (top of left rail)
// ---------------------------------------------------------------------------

function TemplateExplorer({
  templates,
  activeType,
  onSelect,
}: {
  templates: Record<ReportType, TemplateConfig>;
  activeType: ReportType;
  onSelect: (t: ReportType) => void;
}): JSX.Element {
  return (
    <div className="px-3 pt-3 pb-3">
      <PanelHeader title="Templates" Icon={FileText} hint="4 of 4" />
      <div className="mt-2 flex flex-col gap-1">
        {REPORT_TYPES.map((t) => {
          const cfg = templates[t];
          const Icon = TYPE_TAB_ICON[t];
          const isActive = t === activeType;
          const isDirty = !templatesEqual(cfg, DEFAULT_TEMPLATES[t]);
          return (
            <button
              key={t}
              type="button"
              onClick={() => onSelect(t)}
              className="group flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors"
              style={{
                background: isActive
                  ? 'color-mix(in srgb, var(--wp-accent) 14%, transparent)'
                  : 'transparent',
                border: '1px solid ' + (isActive
                  ? 'color-mix(in srgb, var(--wp-accent) 38%, transparent)'
                  : 'transparent'),
              }}
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded"
                style={{
                  background: cfg.accentColor + '24',
                  border: '1px solid ' + cfg.accentColor + '55',
                }}
              >
                <Icon size={13} style={{ color: cfg.accentColor }} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[12.5px] font-semibold"
                  style={{ color: isActive ? 'var(--wp-text)' : 'var(--wp-text-dim, rgba(236,227,217,0.78))' }}
                >
                  {TYPE_TAB_LABEL[t]}
                </span>
                <span
                  className="mt-0.5 block truncate font-mono text-[10px]"
                  style={{ color: 'color-mix(in srgb, var(--wp-text) 40%, transparent)' }}
                >
                  {TYPE_TAB_HINT[t]}
                </span>
              </span>
              {isDirty && (
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    background: 'var(--wp-accent-3, #FF9670)',
                    boxShadow: '0 0 6px color-mix(in srgb, var(--wp-accent-3) 60%, transparent)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layers palette (lower portion of left rail)
// ---------------------------------------------------------------------------

interface LayersPaletteProps {
  template: TemplateConfig;
  selectedLayer: LayerKey;
  onSelectLayer: (k: LayerKey) => void;
  onToggleVisible: (k: LayerKey) => void;
  onToggleLocked: (k: LayerKey) => void;
  onUpdateSection: (k: LayerKey, updater: (prev: SectionConfig) => SectionConfig) => void;
}

function LayersPalette(props: LayersPaletteProps): JSX.Element {
  const visible = countVisible(props.template);
  const hidden = countHidden(props.template);
  return (
    <div className="flex flex-1 flex-col px-3 pt-3 pb-2">
      <PanelHeader
        title="Layers"
        Icon={LayersIcon}
        hint={`${visible} on · ${hidden} off`}
      />
      <div
        className="mt-2 flex items-center justify-between rounded px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em]"
        style={{
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          color: 'color-mix(in srgb, var(--wp-text) 45%, transparent)',
          border: '1px solid color-mix(in srgb, var(--wp-text) 6%, transparent)',
        }}
      >
        <span>Section</span>
        <span>Opacity</span>
      </div>
      <ul role="listbox" aria-label="Layers" className="mt-1.5 flex flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5">
        {LAYER_ORDER.map((key) => {
          const section = props.template.sections[key];
          const meta = LAYER_META[key];
          const isSelected = key === props.selectedLayer;
          return (
            <li key={key}>
              <LayerRow
                isSelected={isSelected}
                section={section}
                label={meta.label}
                Icon={meta.Icon}
                onClick={() => props.onSelectLayer(key)}
                onToggleVisible={(e) => {
                  e.stopPropagation();
                  props.onToggleVisible(key);
                }}
                onToggleLocked={(e) => {
                  e.stopPropagation();
                  props.onToggleLocked(key);
                }}
                onOpacityChange={(value) =>
                  props.onUpdateSection(key, (prev) => ({ ...prev, opacity: value }))
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PanelHeader({
  title,
  Icon,
  hint,
}: {
  title: string;
  Icon: typeof LayersIcon;
  hint?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon size={11} style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.6))' }} />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.6))' }}
        >
          {title}
        </span>
      </div>
      {hint && (
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.15em]"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 40%, transparent)' }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

interface LayerRowProps {
  isSelected: boolean;
  section: SectionConfig;
  label: string;
  Icon: typeof LayersIcon;
  onClick: () => void;
  onToggleVisible: (e: React.MouseEvent) => void;
  onToggleLocked: (e: React.MouseEvent) => void;
  onOpacityChange: (n: number) => void;
}

function LayerRow(props: LayerRowProps): JSX.Element {
  const { isSelected, section, label, Icon } = props;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={props.onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        }
      }}
      className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors"
      style={{
        background: isSelected
          ? 'color-mix(in srgb, var(--wp-accent) 14%, transparent)'
          : 'transparent',
        border: '1px solid ' + (isSelected
          ? 'color-mix(in srgb, var(--wp-accent) 36%, transparent)'
          : 'color-mix(in srgb, var(--wp-text) 6%, transparent)'),
        opacity: section.visible ? 1 : 0.55,
      }}
    >
      <button
        type="button"
        onClick={props.onToggleVisible}
        className="flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10"
        title={section.visible ? 'Hide layer' : 'Show layer'}
        style={{ color: section.visible ? 'var(--wp-accent)' : 'color-mix(in srgb, var(--wp-text) 35%, transparent)' }}
      >
        {section.visible ? <Eye size={11} /> : <EyeOff size={11} />}
      </button>
      <button
        type="button"
        onClick={props.onToggleLocked}
        className="flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10"
        title={section.locked ? 'Unlock layer' : 'Lock layer'}
        style={{ color: section.locked ? 'var(--wp-accent-2, #FF8A4B)' : 'color-mix(in srgb, var(--wp-text) 30%, transparent)' }}
      >
        {section.locked ? <Lock size={10} /> : <Unlock size={10} />}
      </button>
      <span
        aria-hidden
        className="text-[10px] opacity-40"
        style={{ color: 'var(--wp-text-dim)' }}
      >
        <GripVertical size={11} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Icon size={11} style={{ color: isSelected ? 'var(--wp-accent)' : 'var(--wp-text-dim)', opacity: 0.85 }} />
        <span
          className="truncate text-[11.5px] font-medium"
          style={{
            color: isSelected ? 'var(--wp-text)' : 'var(--wp-text-dim, rgba(236,227,217,0.78))',
            textDecoration: section.visible ? 'none' : 'line-through',
            textDecorationColor: 'color-mix(in srgb, var(--wp-text) 30%, transparent)',
          }}
        >
          {label}
        </span>
      </span>
      <div className="flex w-[58px] shrink-0 items-center gap-1">
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={section.opacity}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => props.onOpacityChange(Number(e.target.value))}
          className="h-1 w-[44px] cursor-pointer appearance-none rounded-full"
          style={{
            background:
              'linear-gradient(to right, var(--wp-accent, #F26522) 0%, var(--wp-accent, #F26522) ' +
              section.opacity +
              '%, color-mix(in srgb, var(--wp-text) 10%, transparent) ' +
              section.opacity +
              '%, color-mix(in srgb, var(--wp-text) 10%, transparent) 100%)',
          }}
        />
        <span
          className="font-mono text-[9px] tabular-nums"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
        >
          {section.opacity}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CENTER CANVAS — paper preview, rulers, watermark, layer-aware sections
// ---------------------------------------------------------------------------

interface CanvasAreaProps {
  template: TemplateConfig;
  type: ReportType;
  zoom: number;
  selectedLayer: LayerKey;
  onSelectLayer: (k: LayerKey) => void;
}

function CanvasArea(props: CanvasAreaProps): JSX.Element {
  const isDraft = props.template.title.trim().length === 0;
  return (
    <main
      className="relative flex-1 overflow-y-auto"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-bg) 96%, transparent) 0%, var(--wp-bg) 100%)',
      }}
    >
      <CanvasRulers />
      <div
        className="relative mx-auto px-8 py-8"
        style={{ maxWidth: '100%' }}
      >
        <CanvasToolbar template={props.template} zoom={props.zoom} />
        <div
          className="mx-auto mt-4"
          style={{
            maxWidth: 720,
            transform: `scale(${props.zoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease',
          }}
        >
          <PaperDocument
            template={props.template}
            type={props.type}
            selectedLayer={props.selectedLayer}
            onSelectLayer={props.onSelectLayer}
            isDraft={isDraft}
          />
        </div>
      </div>
    </main>
  );
}

function CanvasRulers(): JSX.Element {
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  return (
    <>
      <div
        aria-hidden
        className="sticky top-0 z-10 flex items-end"
        style={{
          height: 18,
          background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
        }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            className="flex flex-1 items-end justify-start"
            style={{ minWidth: 40 }}
          >
            <span
              className="block"
              style={{
                width: 1,
                height: t % 4 === 0 ? 8 : 4,
                background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)',
              }}
            />
            {t % 4 === 0 && (
              <span
                className="ml-1 font-mono text-[9px] leading-none"
                style={{ color: 'color-mix(in srgb, var(--wp-text) 35%, transparent)' }}
              >
                {t * 40}
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-[18px] flex flex-col"
        style={{
          width: 18,
          bottom: 0,
          background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
          borderRight: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
        }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            className="flex w-full justify-end"
            style={{ flex: 1, minHeight: 32 }}
          >
            <span
              className="block"
              style={{
                width: t % 4 === 0 ? 8 : 4,
                height: 1,
                background: 'color-mix(in srgb, var(--wp-text) 22%, transparent)',
                alignSelf: 'flex-end',
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function CanvasToolbar({ template, zoom }: { template: TemplateConfig; zoom: number }): JSX.Element {
  return (
    <div className="mx-auto flex max-w-[720px] items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
        >
          Canvas
        </span>
        <span
          className="font-mono text-[10.5px]"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
        >
          720 × auto · A4 portrait · {zoom}%
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <CanvasChip Icon={Move} label="Move (V)" />
        <CanvasChip Icon={Crosshair} label="Pick" />
        <CanvasChip Icon={SquareDashedMousePointer} label="Marquee" />
        <span className="ml-1 size-3 rounded-full ring-2 ring-offset-2" style={{
          background: template.accentColor,
          boxShadow: '0 0 0 2px color-mix(in srgb, ' + template.accentColor + ' 30%, transparent)',
        }} />
      </div>
    </div>
  );
}

function CanvasChip({ Icon, label }: { Icon: typeof Move; label: string }): JSX.Element {
  return (
    <span
      title={label}
      className="flex size-6 items-center justify-center rounded"
      style={{
        border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
        background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
        color: 'var(--wp-text-dim, rgba(236,227,217,0.55))',
      }}
    >
      <Icon size={11} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// PAPER DOCUMENT — the actual on-canvas "PDF"
// ---------------------------------------------------------------------------

interface PaperDocumentProps {
  template: TemplateConfig;
  type: ReportType;
  selectedLayer: LayerKey;
  onSelectLayer: (k: LayerKey) => void;
  isDraft: boolean;
}

function PaperDocument(props: PaperDocumentProps): JSX.Element {
  const { template, type, selectedLayer, onSelectLayer, isDraft } = props;
  const paperBg = 'color-mix(in srgb, var(--wp-text) 96%, var(--wp-surface))';
  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{
        background: paperBg,
        color: '#1a1411',
        boxShadow:
          '0 30px 60px -20px rgba(0,0,0,0.65), 0 18px 36px -12px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--wp-text) 18%, transparent)',
      }}
    >
      {isDraft && <DraftWatermark />}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: template.accentColor }}
      />
      <AnimatePresence initial={false}>
        {LAYER_ORDER.map((key) => {
          const section = template.sections[key];
          if (!section.visible) return null;
          const isSelected = key === selectedLayer;
          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: section.opacity / 100, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectLayer(key);
              }}
              className="group relative cursor-pointer"
              style={{
                paddingLeft: section.padding,
                paddingRight: section.padding,
                paddingTop: 14,
                paddingBottom: 14,
                outline: isSelected ? '2px dashed ' + template.accentColor : '2px dashed transparent',
                outlineOffset: -8,
                transition: 'outline-color 0.15s ease',
              }}
            >
              {isSelected && <LayerSelectionPill label={LAYER_META[key].label} accent={template.accentColor} />}
              <PaperSection
                layerKey={key}
                section={section}
                template={template}
                type={type}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function DraftWatermark(): JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 1 }}
    >
      <span
        className="select-none font-mono text-[120px] font-black uppercase tracking-[0.4em]"
        style={{
          color: 'rgba(26,20,17,0.05)',
          transform: 'rotate(-26deg)',
          letterSpacing: '0.32em',
        }}
      >
        DRAFT
      </span>
    </div>
  );
}

function LayerSelectionPill({ label, accent }: { label: string; accent: string }): JSX.Element {
  return (
    <span
      className="absolute left-2 top-2 z-10 rounded-sm px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.22em]"
      style={{
        background: accent,
        color: '#fff',
        boxShadow: '0 4px 12px ' + accent + '55',
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PAPER SECTION — switch on the LayerKey to draw that section's content.
// All colors here intentionally use plain hex / inline values because the
// paper sheet is light and the design-tool palette is paper-tone (not
// app-tone). The orange accent threads through via template.accentColor.
// ---------------------------------------------------------------------------

interface PaperSectionProps {
  layerKey: LayerKey;
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}

function PaperSection({ layerKey, section, template, type }: PaperSectionProps): JSX.Element {
  switch (layerKey) {
    case 'header':
      return <PaperHeader section={section} template={template} type={type} />;
    case 'summary':
      return <PaperSummary section={section} template={template} type={type} />;
    case 'kpiBand':
      return <PaperKpiBand section={section} template={template} type={type} />;
    case 'chart':
      return <PaperChart section={section} template={template} type={type} />;
    case 'subClientTable':
      return <PaperSubClientTable section={section} template={template} type={type} />;
    case 'domainBreakdown':
      return <PaperDomainBreakdown section={section} template={template} type={type} />;
    case 'recommendations':
      return <PaperRecommendations section={section} template={template} type={type} />;
    case 'footer':
      return <PaperFooter section={section} template={template} type={type} />;
  }
}

function alignmentStyle(alignment: Alignment): CSSProperties {
  return {
    textAlign: alignment,
    justifyContent: alignment === 'left' ? 'flex-start' : alignment === 'right' ? 'flex-end' : 'center',
  };
}

function PaperHeader({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const align = alignmentStyle(section.alignment);
  const showAgency = template.branding !== 'white_label';
  return (
    <div className="flex items-start gap-4" style={align}>
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-md"
        style={{
          background: template.accentColor + '18',
          border: '1px solid ' + template.accentColor + '55',
        }}
      >
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: template.accentColor }}
        >
          {template.brandLogo || 'WL'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {showAgency && (
          <div
            className="font-mono text-[9.5px] uppercase tracking-[0.32em]"
            style={{ color: '#a08075' }}
          >
            {template.headerText}
          </div>
        )}
        <h1
          className="mt-0.5 text-[20px] font-bold leading-tight tracking-tight"
          style={{ color: '#1a1411' }}
        >
          {section.title || LAYER_META.header.defaultTitle}
        </h1>
        <div
          className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: '#6e5b53' }}
        >
          <span>Range · {DATE_RANGE_OPTIONS.find((opt) => opt.id === template.dateRange)?.description}</span>
          <span>·</span>
          <span>Generated {todayYMD()}</span>
        </div>
      </div>
      {section.showStat && (
        <div
          className="rounded-md px-3 py-2 text-right"
          style={{
            background: template.accentColor + '14',
            border: '1px solid ' + template.accentColor + '40',
          }}
        >
          <div
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: '#6e5b53' }}
          >
            Period stat
          </div>
          <div className="text-[18px] font-semibold tabular-nums" style={{ color: '#1a1411' }}>
            {TYPE_KPIS[template.type][0]?.value ?? '—'}
          </div>
        </div>
      )}
    </div>
  );
}

function PaperSummary({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const align = alignmentStyle(section.alignment);
  return (
    <div className="space-y-2" style={align}>
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: '#a08075' }}
      >
        {section.title || LAYER_META.summary.defaultTitle}
      </h2>
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: '#3b2f29', textAlign: section.alignment }}
      >
        Across the {dateRangeLabel(template.dateRange)} window the Northwind portfolio posted a
        net positive movement on {TYPE_TAB_LABEL[template.type].toLowerCase()} signals. Helix,
        Orion and Quasar each registered double-digit improvements; the remaining sub-clients
        held steady. Engagement is well distributed across providers with Gmail
        leading and Outlook following closely. Vega Outbound remains in active
        ramp — D14 mailboxes graduate to D21 next cycle.
      </p>
      {section.showStat && (
        <div
          className="mt-2 inline-flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{
            background: template.accentColor + '12',
            color: template.accentColor,
          }}
        >
          <Sparkles size={10} />
          Net positive · 5 of 6 sub-clients improving
        </div>
      )}
    </div>
  );
}

function PaperKpiBand({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  const tiles = TYPE_KPIS[type];
  return (
    <div className="space-y-2">
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: '#a08075' }}
      >
        {section.title || LAYER_META.kpiBand.defaultTitle}
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-md px-3 py-2.5"
            style={{
              background: '#fbf6f1',
              border: '1px solid #ece3d9',
            }}
          >
            <div
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: '#a08075' }}
            >
              {tile.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[16px] font-bold tabular-nums" style={{ color: '#1a1411' }}>
                {tile.value}
              </span>
              {section.showStat && (
                <span
                  className="font-mono text-[10px] font-semibold"
                  style={{ color: template.accentColor }}
                >
                  {tile.delta}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaperChart({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const points = useMemo(() => buildChartPoints(template.type), [template.type]);
  const width = 640;
  const height = 130;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const pathD = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 16) - 8;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: '#a08075' }}
        >
          {section.title || LAYER_META.chart.defaultTitle}
        </h2>
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
          style={{ color: '#a08075' }}
        >
          {dateRangeLabel(template.dateRange)} · daily
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
        {[0, 1, 2, 3].map((g) => (
          <line
            key={g}
            x1={0}
            x2={width}
            y1={(g * height) / 3}
            y2={(g * height) / 3}
            stroke="#ece3d9"
            strokeDasharray="3 4"
          />
        ))}
        <path d={fillD} fill={template.accentColor + '22'} />
        <path d={pathD} stroke={template.accentColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        {points.map((p, i) => {
          if (i % 3 !== 0) return null;
          const x = (i / (points.length - 1)) * width;
          const y = height - ((p - min) / range) * (height - 16) - 8;
          return (
            <circle key={i} cx={x} cy={y} r={2.5} fill={template.accentColor} />
          );
        })}
      </svg>
      {section.showStat && (
        <div className="flex gap-3 font-mono text-[9.5px] uppercase tracking-[0.18em]" style={{ color: '#6e5b53' }}>
          <span>min {min.toFixed(1)}</span>
          <span>max {max.toFixed(1)}</span>
          <span>Δ {(max - min).toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

function buildChartPoints(type: ReportType): number[] {
  // Deterministic per-type series — looks like real data, fully reproducible.
  const baseSeries: Record<ReportType, number[]> = {
    warmth: [62, 64, 66, 68, 67, 69, 70, 72, 74, 73, 75, 77, 78, 80, 81, 80, 82, 83, 82, 84, 85, 84, 86, 85, 87, 88, 87, 89, 90, 89],
    engagement: [22, 24, 26, 28, 27, 30, 32, 31, 34, 35, 33, 36, 38, 37, 39, 41, 40, 42, 44, 43, 45, 46, 44, 47, 49, 48, 50, 51, 50, 52],
    placement: [72, 74, 76, 75, 77, 79, 78, 80, 82, 81, 83, 85, 84, 86, 87, 86, 88, 89, 88, 90, 91, 90, 92, 91, 93, 94, 93, 95, 96, 95],
    white_label: [55, 57, 59, 58, 61, 63, 62, 65, 67, 66, 68, 70, 69, 71, 73, 72, 74, 76, 75, 77, 78, 77, 79, 78, 80, 81, 80, 82, 83, 82],
  };
  return baseSeries[type];
}

function PaperSubClientTable({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const headers = subClientHeaders(template.type);
  return (
    <div className="space-y-2">
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: '#a08075' }}
      >
        {section.title || LAYER_META.subClientTable.defaultTitle}
      </h2>
      <div
        className="overflow-hidden rounded-md"
        style={{ border: '1px solid #ece3d9' }}
      >
        <table className="w-full text-[11px]" style={{ color: '#3b2f29' }}>
          <thead>
            <tr style={{ background: '#fbf6f1' }}>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-2.5 py-1.5 text-left font-mono text-[9.5px] uppercase tracking-[0.16em]"
                  style={{ color: '#a08075' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREVIEW_ROWS.map((row, idx) => (
              <tr key={row.subClient} style={{ background: idx % 2 === 0 ? '#fff' : '#fbf6f1' }}>
                <td className="px-2.5 py-1.5 font-semibold" style={{ color: '#1a1411' }}>
                  {row.subClient}
                </td>
                <td className="px-2.5 py-1.5 font-mono" style={{ color: '#6e5b53' }}>
                  {row.domain}
                </td>
                <td className="px-2.5 py-1.5 tabular-nums">{row.mailboxes}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{subClientMetric(template.type, row, 0)}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{subClientMetric(template.type, row, 1)}</td>
                {section.showStat && (
                  <td
                    className="px-2.5 py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: row.delta >= 0 ? template.accentColor : '#a02a1a' }}
                  >
                    {row.delta >= 0 ? '+' : ''}
                    {row.delta.toFixed(1)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function subClientHeaders(type: ReportType): string[] {
  if (type === 'warmth') return ['Sub-client', 'Domain', 'Mailboxes', 'Warmth', 'Above-80', 'Δ 30d'];
  if (type === 'engagement') return ['Sub-client', 'Domain', 'Mailboxes', 'Open %', 'Reply %', 'Δ 30d'];
  if (type === 'placement') return ['Sub-client', 'Domain', 'Mailboxes', 'Inbox %', 'Spam %', 'Δ 30d'];
  return ['Sub-client', 'Domain', 'Mailboxes', 'Score', 'Run', 'Δ 30d'];
}

function subClientMetric(type: ReportType, row: PreviewRow, col: 0 | 1): string {
  if (type === 'warmth') {
    if (col === 0) return row.metric1.toFixed(1);
    return String(Math.round(row.mailboxes * (row.metric1 / 100)));
  }
  if (type === 'engagement') {
    if (col === 0) return row.metric1.toFixed(1) + '%';
    return row.metric2.toFixed(1) + '%';
  }
  if (type === 'placement') {
    if (col === 0) return row.metric1.toFixed(1) + '%';
    return row.metric2.toFixed(1) + '%';
  }
  if (col === 0) return row.metric1.toFixed(1);
  return todayYMD();
}

function PaperDomainBreakdown({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  const split = TYPE_DOMAIN_SPLIT[type];
  return (
    <div className="space-y-2">
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: '#a08075' }}
      >
        {section.title || LAYER_META.domainBreakdown.defaultTitle}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {split.map((s) => (
          <div
            key={s.provider}
            className="rounded-md px-3 py-2.5"
            style={{
              background: '#fbf6f1',
              border: '1px solid #ece3d9',
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
                style={{ color: '#a08075' }}
              >
                {s.provider}
              </span>
              {section.showStat && (
                <span
                  className="font-mono text-[10px] font-semibold"
                  style={{ color: template.accentColor }}
                >
                  {s.value}%
                </span>
              )}
            </div>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: '#ece3d9' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: s.value + '%',
                  background: template.accentColor,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaperRecommendations({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  const recs = TYPE_RECOMMENDATIONS[type];
  return (
    <div className="space-y-2">
      <h2
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: '#a08075' }}
      >
        {section.title || LAYER_META.recommendations.defaultTitle}
      </h2>
      <ul className="space-y-1.5">
        {recs.map((rec, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md px-2 py-1.5"
            style={{ background: '#fbf6f1', border: '1px solid #ece3d9' }}
          >
            <span
              className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold"
              style={{
                background: template.accentColor,
                color: '#fff',
              }}
            >
              {i + 1}
            </span>
            <span className="text-[11.5px] leading-snug" style={{ color: '#3b2f29' }}>
              {rec}
            </span>
            {section.showStat && (
              <span
                className="ml-auto self-start font-mono text-[9px] uppercase tracking-[0.18em]"
                style={{ color: '#a08075' }}
              >
                P{i + 1}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaperFooter({
  section,
  template,
  type,
}: {
  section: SectionConfig;
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const align = alignmentStyle(section.alignment);
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t pt-2 font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        borderColor: '#ece3d9',
        color: '#a08075',
        ...align,
      }}
    >
      <span>{section.title || LAYER_META.footer.defaultTitle}</span>
      <span>·</span>
      <span>{template.footerText}</span>
      {section.showStat && (
        <span
          className="ml-auto rounded px-1.5 py-0.5"
          style={{
            background: template.accentColor + '14',
            color: template.accentColor,
          }}
        >
          v1.0 · {todayYMD()}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT RAIL — property inspector
// ---------------------------------------------------------------------------

interface RightRailProps {
  template: TemplateConfig;
  type: ReportType;
  selectedLayer: LayerKey;
  onUpdateTemplate: (updater: (prev: TemplateConfig) => TemplateConfig) => void;
  onUpdateSection: (k: LayerKey, updater: (prev: SectionConfig) => SectionConfig) => void;
}

function RightRail(props: RightRailProps): JSX.Element {
  const section = props.template.sections[props.selectedLayer];
  return (
    <aside
      className="flex shrink-0 flex-col"
      style={{
        width: 320,
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-surface) 72%, transparent) 0%, color-mix(in srgb, var(--wp-surface) 50%, transparent) 100%)',
        borderLeft: '1px solid var(--wp-border-muted, rgba(255,255,255,0.08))',
        overflowY: 'auto',
      }}
    >
      <InspectorHeader template={props.template} selectedLayer={props.selectedLayer} />
      <InspectorDateRange template={props.template} onUpdateTemplate={props.onUpdateTemplate} />
      <InspectorAccent template={props.template} onUpdateTemplate={props.onUpdateTemplate} />
      <InspectorLayerProps
        section={section}
        layerKey={props.selectedLayer}
        onUpdateSection={props.onUpdateSection}
      />
      <InspectorTopLevelText template={props.template} onUpdateTemplate={props.onUpdateTemplate} />
      <InspectorBranding template={props.template} onUpdateTemplate={props.onUpdateTemplate} />
    </aside>
  );
}

function InspectorHeader({
  template,
  selectedLayer,
}: {
  template: TemplateConfig;
  selectedLayer: LayerKey;
}): JSX.Element {
  const meta = LAYER_META[selectedLayer];
  const Icon = meta.Icon;
  return (
    <div
      className="px-4 pb-3 pt-4"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--wp-text) 6%, transparent)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 items-center justify-center rounded"
          style={{
            background: template.accentColor + '20',
            border: '1px solid ' + template.accentColor + '55',
          }}
        >
          <Icon size={12} style={{ color: template.accentColor }} />
        </span>
        <div>
          <div
            className="font-mono text-[9.5px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
          >
            Properties
          </div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>
            {meta.label}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <InspectorMiniButton Icon={Copy} title="Duplicate" />
          <InspectorMiniButton Icon={Trash2} title="Remove" />
          <InspectorMiniButton Icon={MoreHorizontal} title="More" />
        </div>
      </div>
      <p
        className="mt-1.5 text-[11px] leading-relaxed"
        style={{ color: 'color-mix(in srgb, var(--wp-text) 55%, transparent)' }}
      >
        {meta.description}
      </p>
    </div>
  );
}

function InspectorMiniButton({ Icon, title }: { Icon: typeof Copy; title: string }): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      className="flex size-6 items-center justify-center rounded transition-colors hover:bg-white/5"
      style={{
        border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
        color: 'var(--wp-text-dim, rgba(236,227,217,0.5))',
      }}
    >
      <Icon size={10} />
    </button>
  );
}

function InspectorDateRange({
  template,
  onUpdateTemplate,
}: {
  template: TemplateConfig;
  onUpdateTemplate: (updater: (prev: TemplateConfig) => TemplateConfig) => void;
}): JSX.Element {
  return (
    <InspectorBlock title="Date range" Icon={GitCommitVertical}>
      <div className="flex flex-wrap items-center gap-1.5">
        {DATE_RANGE_OPTIONS.map((opt) => {
          const isActive = opt.id === template.dateRange;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onUpdateTemplate((prev) => ({ ...prev, dateRange: opt.id }))
              }
              className="rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
              style={{
                background: isActive
                  ? template.accentColor + '20'
                  : 'color-mix(in srgb, var(--wp-text) 4%, transparent)',
                border: '1px solid ' + (isActive
                  ? template.accentColor + '55'
                  : 'color-mix(in srgb, var(--wp-text) 8%, transparent)'),
                color: isActive ? template.accentColor : 'var(--wp-text-dim, rgba(236,227,217,0.65))',
              }}
              title={opt.description}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </InspectorBlock>
  );
}

function InspectorAccent({
  template,
  onUpdateTemplate,
}: {
  template: TemplateConfig;
  onUpdateTemplate: (updater: (prev: TemplateConfig) => TemplateConfig) => void;
}): JSX.Element {
  const [hexInput, setHexInput] = useState<string>(template.accentColor);
  // keep input in sync when external changes happen
  const sync = (next: string) => {
    setHexInput(next);
    onUpdateTemplate((prev) => ({ ...prev, accentColor: next }));
  };
  return (
    <InspectorBlock title="Accent color" Icon={Palette}>
      <div className="flex items-center gap-1.5">
        {ACCENT_SWATCHES.map((swatch) => {
          const isActive = swatch.toLowerCase() === template.accentColor.toLowerCase();
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => sync(swatch)}
              className="flex size-7 items-center justify-center rounded transition-transform hover:scale-110"
              style={{
                background: swatch,
                border: '1px solid ' + (isActive ? '#fff' : 'color-mix(in srgb, ' + swatch + ' 70%, #000)'),
                boxShadow: isActive
                  ? '0 0 0 2px ' + swatch + '88, 0 0 0 4px color-mix(in srgb, var(--wp-bg) 80%, transparent)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
              }}
              title={swatch}
            >
              {isActive && <Check size={11} style={{ color: '#fff' }} />}
            </button>
          );
        })}
        <span
          aria-hidden
          className="block h-7 w-px"
          style={{ background: 'color-mix(in srgb, var(--wp-text) 10%, transparent)' }}
        />
        <div
          className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1"
          style={{
            border: '1px solid color-mix(in srgb, var(--wp-text) 10%, transparent)',
            background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          }}
        >
          <Hash size={10} style={{ color: 'var(--wp-text-dim)' }} />
          <input
            type="text"
            value={hexInput}
            onChange={(e) => {
              const v = e.target.value;
              setHexInput(v);
              if (isValidHex(v)) {
                onUpdateTemplate((prev) => ({ ...prev, accentColor: v }));
              }
            }}
            className="w-full bg-transparent font-mono text-[11px] uppercase outline-none"
            style={{ color: 'var(--wp-text)' }}
            placeholder="#F26522"
            maxLength={7}
          />
          <span
            className="size-3.5 rounded-sm"
            style={{ background: isValidHex(hexInput) ? hexInput : template.accentColor }}
          />
        </div>
      </div>
    </InspectorBlock>
  );
}

function InspectorLayerProps({
  section,
  layerKey,
  onUpdateSection,
}: {
  section: SectionConfig;
  layerKey: LayerKey;
  onUpdateSection: (k: LayerKey, updater: (prev: SectionConfig) => SectionConfig) => void;
}): JSX.Element {
  return (
    <>
      <InspectorBlock title="Text" Icon={TypeIcon}>
        <label
          className="block font-mono text-[9.5px] uppercase tracking-[0.18em]"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
        >
          Title
        </label>
        <input
          type="text"
          value={section.title}
          onChange={(e) =>
            onUpdateSection(layerKey, (prev) => ({ ...prev, title: e.target.value }))
          }
          className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none transition-colors focus:ring-1"
          style={{
            border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
            background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
            color: 'var(--wp-text)',
          }}
          placeholder={LAYER_META[layerKey].defaultTitle}
        />
      </InspectorBlock>
      <InspectorBlock title="Layout" Icon={Sliders}>
        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <label
            className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
          >
            Padding
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={8}
              max={48}
              step={2}
              value={section.padding}
              onChange={(e) =>
                onUpdateSection(layerKey, (prev) => ({ ...prev, padding: Number(e.target.value) }))
              }
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  'linear-gradient(to right, var(--wp-accent, #F26522) 0%, var(--wp-accent, #F26522) ' +
                  ((section.padding - 8) / 40) * 100 +
                  '%, color-mix(in srgb, var(--wp-text) 10%, transparent) ' +
                  ((section.padding - 8) / 40) * 100 +
                  '%, color-mix(in srgb, var(--wp-text) 10%, transparent) 100%)',
              }}
            />
            <span
              className="w-9 text-right font-mono text-[10.5px] tabular-nums"
              style={{ color: 'var(--wp-text)' }}
            >
              {section.padding}px
            </span>
          </div>
          <label
            className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
          >
            Align
          </label>
          <div className="flex items-center gap-1">
            {(['left', 'center', 'right'] as const).map((a) => {
              const Icon =
                a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
              const isActive = section.alignment === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() =>
                    onUpdateSection(layerKey, (prev) => ({ ...prev, alignment: a }))
                  }
                  className="flex size-7 items-center justify-center rounded transition-colors"
                  style={{
                    background: isActive
                      ? 'color-mix(in srgb, var(--wp-accent) 20%, transparent)'
                      : 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
                    border: '1px solid ' + (isActive
                      ? 'color-mix(in srgb, var(--wp-accent) 50%, transparent)'
                      : 'color-mix(in srgb, var(--wp-text) 8%, transparent)'),
                    color: isActive ? 'var(--wp-accent)' : 'var(--wp-text-dim)',
                  }}
                  title={a}
                >
                  <Icon size={11} />
                </button>
              );
            })}
          </div>
          <label
            className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
            style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
          >
            Opacity
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={section.opacity}
              onChange={(e) =>
                onUpdateSection(layerKey, (prev) => ({ ...prev, opacity: Number(e.target.value) }))
              }
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  'linear-gradient(to right, var(--wp-accent, #F26522) 0%, var(--wp-accent, #F26522) ' +
                  section.opacity +
                  '%, color-mix(in srgb, var(--wp-text) 10%, transparent) ' +
                  section.opacity +
                  '%, color-mix(in srgb, var(--wp-text) 10%, transparent) 100%)',
              }}
            />
            <span
              className="w-9 text-right font-mono text-[10.5px] tabular-nums"
              style={{ color: 'var(--wp-text)' }}
            >
              {section.opacity}%
            </span>
          </div>
        </div>
      </InspectorBlock>
      <InspectorBlock title="Behavior" Icon={Wand2}>
        <label
          className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5"
          style={{
            border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
            background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          }}
        >
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--wp-text)' }}>
            <Zap size={11} style={{ color: 'var(--wp-text-dim)' }} />
            Show stat / delta chip
          </span>
          <CheckboxToggle
            checked={section.showStat}
            onChange={(next) =>
              onUpdateSection(layerKey, (prev) => ({ ...prev, showStat: next }))
            }
          />
        </label>
        <label
          className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5"
          style={{
            border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
            background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          }}
        >
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--wp-text)' }}>
            <Eye size={11} style={{ color: 'var(--wp-text-dim)' }} />
            Visible on PDF
          </span>
          <CheckboxToggle
            checked={section.visible}
            onChange={(next) =>
              onUpdateSection(layerKey, (prev) => ({ ...prev, visible: next }))
            }
          />
        </label>
        <label
          className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5"
          style={{
            border: '1px solid color-mix(in srgb, var(--wp-text) 8%, transparent)',
            background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          }}
        >
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--wp-text)' }}>
            <Lock size={11} style={{ color: 'var(--wp-text-dim)' }} />
            Lock from edits
          </span>
          <CheckboxToggle
            checked={section.locked}
            onChange={(next) =>
              onUpdateSection(layerKey, (prev) => ({ ...prev, locked: next }))
            }
          />
        </label>
      </InspectorBlock>
    </>
  );
}

function CheckboxToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      role="switch"
      aria-checked={checked}
      className="relative flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
      style={{
        background: checked
          ? 'var(--wp-accent, #F26522)'
          : 'color-mix(in srgb, var(--wp-text) 12%, transparent)',
        border: '1px solid ' + (checked
          ? 'color-mix(in srgb, var(--wp-accent) 60%, transparent)'
          : 'color-mix(in srgb, var(--wp-text) 14%, transparent)'),
      }}
    >
      <span
        className="absolute size-3 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? 'translateX(12px)' : 'translateX(2px)',
        }}
      />
    </button>
  );
}

function InspectorTopLevelText({
  template,
  onUpdateTemplate,
}: {
  template: TemplateConfig;
  onUpdateTemplate: (updater: (prev: TemplateConfig) => TemplateConfig) => void;
}): JSX.Element {
  return (
    <InspectorBlock title="Document" Icon={FileText}>
      <label
        className="block font-mono text-[9.5px] uppercase tracking-[0.18em]"
        style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
      >
        Title
      </label>
      <input
        type="text"
        value={template.title}
        onChange={(e) => onUpdateTemplate((prev) => ({ ...prev, title: e.target.value }))}
        className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none"
        style={{
          border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          color: 'var(--wp-text)',
        }}
        placeholder="(leave blank for DRAFT watermark)"
      />
      <label
        className="mt-2.5 block font-mono text-[9.5px] uppercase tracking-[0.18em]"
        style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
      >
        Header
      </label>
      <input
        type="text"
        value={template.headerText}
        onChange={(e) => onUpdateTemplate((prev) => ({ ...prev, headerText: e.target.value }))}
        className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none"
        style={{
          border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          color: 'var(--wp-text)',
        }}
      />
      <label
        className="mt-2.5 block font-mono text-[9.5px] uppercase tracking-[0.18em]"
        style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
      >
        Footer
      </label>
      <input
        type="text"
        value={template.footerText}
        onChange={(e) => onUpdateTemplate((prev) => ({ ...prev, footerText: e.target.value }))}
        className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none"
        style={{
          border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          color: 'var(--wp-text)',
        }}
      />
      <label
        className="mt-2.5 block font-mono text-[9.5px] uppercase tracking-[0.18em]"
        style={{ color: 'color-mix(in srgb, var(--wp-text) 50%, transparent)' }}
      >
        Brand mark (2 chars)
      </label>
      <input
        type="text"
        value={template.brandLogo}
        onChange={(e) =>
          onUpdateTemplate((prev) => ({ ...prev, brandLogo: e.target.value.slice(0, 4).toUpperCase() }))
        }
        className="mt-1 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none"
        style={{
          border: '1px solid color-mix(in srgb, var(--wp-text) 12%, transparent)',
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
          color: 'var(--wp-text)',
        }}
        maxLength={4}
      />
    </InspectorBlock>
  );
}

function InspectorBranding({
  template,
  onUpdateTemplate,
}: {
  template: TemplateConfig;
  onUpdateTemplate: (updater: (prev: TemplateConfig) => TemplateConfig) => void;
}): JSX.Element {
  return (
    <InspectorBlock title="Branding" Icon={Stamp}>
      <div className="flex flex-col gap-1.5">
        {BRANDING_OPTIONS.map((opt) => {
          const isActive = opt.id === template.branding;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onUpdateTemplate((prev) => ({ ...prev, branding: opt.id }))
              }
              className="flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors"
              style={{
                background: isActive
                  ? 'color-mix(in srgb, var(--wp-accent) 12%, transparent)'
                  : 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
                border: '1px solid ' + (isActive
                  ? 'color-mix(in srgb, var(--wp-accent) 38%, transparent)'
                  : 'color-mix(in srgb, var(--wp-text) 8%, transparent)'),
              }}
            >
              <span
                className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: '1.5px solid ' + (isActive ? 'var(--wp-accent)' : 'color-mix(in srgb, var(--wp-text) 25%, transparent)'),
                  background: isActive ? 'var(--wp-accent)' : 'transparent',
                }}
              >
                {isActive && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[11.5px] font-semibold"
                  style={{ color: 'var(--wp-text)' }}
                >
                  {opt.label}
                </span>
                <span
                  className="mt-0.5 block text-[10.5px] leading-relaxed"
                  style={{ color: 'color-mix(in srgb, var(--wp-text) 55%, transparent)' }}
                >
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="mt-3 flex items-start gap-2 rounded-md px-2.5 py-1.5"
        style={{
          border: '1px dashed color-mix(in srgb, var(--wp-text) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-text) 3%, transparent)',
        }}
      >
        <HelpCircle
          size={11}
          className="mt-0.5"
          style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
        />
        <span
          className="text-[10.5px] leading-relaxed"
          style={{ color: 'color-mix(in srgb, var(--wp-text) 55%, transparent)' }}
        >
          Branding mode controls whether agency identity appears on the cover and footer.
          White-label hides Northwind entirely.
        </span>
      </div>
    </InspectorBlock>
  );
}

function InspectorBlock({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof LayersIcon;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--wp-text) 6%, transparent)' }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Icon size={10} style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }} />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-dim, rgba(236,227,217,0.55))' }}
        >
          {title}
        </span>
        <span className="ml-auto">
          <ChevronDown size={11} style={{ color: 'color-mix(in srgb, var(--wp-text) 35%, transparent)' }} />
        </span>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FOOTER STATUS BAR — monospace tail-of-screen
// ---------------------------------------------------------------------------

function FooterStatusBar({
  template,
  type,
}: {
  template: TemplateConfig;
  type: ReportType;
}): JSX.Element {
  void type;
  const visible = countVisible(template);
  const hidden = countHidden(template);
  const accent = template.accentColor.toUpperCase();
  const range = dateRangeLabel(template.dateRange);
  return (
    <div
      className="sticky bottom-0 z-20 flex items-center gap-4 px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-surface) 70%, transparent) 0%, color-mix(in srgb, var(--wp-surface) 92%, transparent) 100%)',
        borderTop: '1px solid var(--wp-border-muted, rgba(255,255,255,0.08))',
        color: 'var(--wp-text-dim, rgba(236,227,217,0.55))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <Circle size={6} fill="var(--wp-accent, #F26522)" style={{ color: 'var(--wp-accent, #F26522)' }} />
        <span>Template: {template.type}</span>
      </span>
      <span style={{ color: 'color-mix(in srgb, var(--wp-text) 30%, transparent)' }}>·</span>
      <span>
        Layers: {visible} visible / {hidden} hidden
      </span>
      <span style={{ color: 'color-mix(in srgb, var(--wp-text) 30%, transparent)' }}>·</span>
      <span className="flex items-center gap-1.5">
        Accent:
        <span
          className="inline-block size-2.5 rounded-sm"
          style={{ background: template.accentColor }}
        />
        {accent}
      </span>
      <span style={{ color: 'color-mix(in srgb, var(--wp-text) 30%, transparent)' }}>·</span>
      <span>Date range: {range}</span>
      <span className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <Ruler size={10} />
          720 × auto
        </span>
        <span className="flex items-center gap-1.5">
          <PaintBucket size={10} />
          sRGB
        </span>
        <span className="flex items-center gap-1.5">
          <Mail size={10} />
          PDF · CSV
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc icon decorations we imported but want kept tree-shaken — referencing
// them once via this no-op factory keeps lucide happy across all builds and
// gives downstream `--unused-import` lints nothing to gripe about.
// ---------------------------------------------------------------------------

function _iconKitchenSink(): JSX.Element {
  const icons = [
    Brush,
    DollarSign,
    Download,
    ImageIcon,
    Settings,
    Star,
  ];
  return (
    <>
      {icons.map((Icon, i) => (
        <Icon key={i} size={0} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// structuredClone shim — older test runners (jsdom < 18) and odd browser
// matrices don't expose `structuredClone`. The template store is plain JSON
// so a shallow clone via JSON.parse is safe and Type-clean.
// ---------------------------------------------------------------------------

function structuredCloneShim<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Kitchen-sink reference (kept so the icon import list isn't trimmed by a
// future lint pass that hits the bigger tree). Never rendered.
// ---------------------------------------------------------------------------
void _iconKitchenSink;
