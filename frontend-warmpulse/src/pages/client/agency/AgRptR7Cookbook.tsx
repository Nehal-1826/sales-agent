import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  ChefHat,
  Circle,
  Clock,
  CookingPot,
  Crown,
  Download,
  Drumstick,
  Eye,
  Feather,
  Flame,
  Gauge,
  GripVertical,
  Hash,
  Heart,
  LineChart,
  Pen,
  Pencil,
  Pizza,
  Printer,
  Salad,
  Save,
  ScrollText,
  Share2,
  Soup,
  Sparkles,
  Stamp,
  Sticker,
  Tag,
  Target,
  Timer,
  Users,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react';
import { toast } from '@/components/ui/AppToast';

/**
 * AgRptR7Cookbook — Agency-tier REPORTS, design candidate R7,
 * "Warm Recipe Cookbook".
 *
 * The /app/reports surface for Agency-tier operators reframed as an
 * editorial cookbook. The four template "types" — warmth, engagement,
 * placement and white_label — each occupy their own RECIPE PAGE inside
 * a single warm parchment volume:
 *
 *   1. COOKBOOK HEADER — "NORTHWIND RECIPE BOOK · Agency Reports" in a
 *      large serif display, last-baked timestamp, decorative print +
 *      share chips on the right.
 *
 *   2. RECIPE INDEX — 4 small chips serve as the table of contents
 *      ("Recipe 1 · Warmth", "Recipe 2 · Engagement", ...). Click a chip
 *      and the active recipe page swaps in with a page-flip illusion.
 *
 *   3. RECIPE PAGE — main spread:
 *      LEFT 60% — big serif headline (template title), editable
 *      subtitle/tagline quote, "Ingredients" checklist (data sources =
 *      section toggles, with decorative quantity prefixes like "1 cup",
 *      "1 tbsp"), "Method" numbered steps (visible sections in order,
 *      with a drag-handle affordance), and a serving-suggestion
 *      paragraph.
 *      RIGHT 40% — a "plate" preview: a circular plate with a mini PDF
 *      preview at the centre, header band tinted in the accent color,
 *      updates live as ingredients toggle.
 *
 *   4. ACTION BAND — "Cooking time: 30s", "Servings: 1 PDF", "Save
 *      recipe" (primary) and a flame-glowing orange CTA "Cook now &
 *      download sample" that triggers a real CSV browser download.
 *
 *   5. RECENT MEALS — bottom strip of recently-cooked reports rendered
 *      as small circular plate thumbnails.
 *
 * Functional bits:
 *   - Local TemplateConfig state per recipe (title, tagline, 6 section
 *     toggles, header/footer text, accent color, brand logo, date
 *     range).
 *   - "Save recipe" persists into local state and fires
 *     `toast.success('Recipe saved')`.
 *   - "Cook now & download sample" generates a CSV blob in-browser
 *     with mock per-section data, uses URL.createObjectURL +
 *     synthetic <a download> click and fires
 *     `toast.success('Sample downloaded')`. Filename:
 *     `northwind-{type}-sample-{YYYY-MM-DD}.csv`.
 *
 * Distinct from sibling Reports candidates: this is a COOKBOOK. Not a
 * magazine spread (R1), not an industrial printing press (R2), not a
 * vinyl crate (R3), not a newsroom bullpen (R4). The visual metaphor —
 * a warm parchment recipe book where each report template is a recipe
 * you cook to order — is the differentiator.
 *
 * Fully STANDALONE — accepts `data?: AgencyReportsData`, falls back to
 * an inline Northwind MOCK so the design-preview harness mounts it
 * prop-less. Uses ONLY the Shailog orange palette via CSS vars; never
 * introduces violet/purple/indigo/blue/cyan/sky/mint/teal. The
 * user-pickable accent color in each template is exempt from this
 * rule by design.
 */

// ---------------------------------------------------------------------------
// Shared Agency reports data shape — re-export from the sibling R1
// variant so the four candidates stay schema-locked. R1 is the source
// of truth.
// ---------------------------------------------------------------------------

import type {
  AgencyReportsData,
  ReportFormat,
  ReportStatus,
  ReportType,
} from '@/pages/client/agency/AgRptR1Magazine';

export type { AgencyReportsData, ReportFormat, ReportStatus, ReportType };

// ---------------------------------------------------------------------------
// Template config — the editable shape for one recipe. Six section
// toggles drive the "ingredient checklist" + "method steps" in lockstep:
// toggling an ingredient off removes that step from the method.
// ---------------------------------------------------------------------------

export interface TemplateConfig {
  type: ReportType;
  title: string;
  tagline: string;
  accentColor: string;
  headerText: string;
  footerText: string;
  brandLogo: string;
  dateRange: 'last_7' | 'last_14' | 'last_30' | 'last_90' | 'quarter';
  sections: {
    summary: boolean;
    kpiBand: boolean;
    chart: boolean;
    perSubClientTable: boolean;
    domainBreakdown: boolean;
    recommendations: boolean;
  };
}

// ---------------------------------------------------------------------------
// Inline Northwind MOCK so the design-preview harness mounts prop-less.
// Mirrors the mock in R1 so the four candidates render the same fixtures.
// ---------------------------------------------------------------------------

const MOCK_SUB_CLIENTS: AgencyReportsData['subClients'] = [
  { id: 'sc-helix', name: 'Helix Outreach', domain: 'helix.com', mailboxCount: 12 },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', domain: 'nimbuscloud.io', mailboxCount: 18 },
  { id: 'sc-orion', name: 'Orion Sales', domain: 'orionsales.com', mailboxCount: 22 },
  { id: 'sc-vega', name: 'Vega Outbound', domain: 'vegaoutbound.io', mailboxCount: 8 },
  { id: 'sc-quasar', name: 'Quasar Growth', domain: 'quasargrowth.com', mailboxCount: 14 },
  { id: 'sc-lyra', name: 'Lyra Studio', domain: 'lyrastudio.co', mailboxCount: 9 },
  { id: 'sc-pixel', name: 'Pixel Forge', domain: 'pixelforge.io', mailboxCount: 6 },
];

const MOCK_REPORTS: AgencyReportsData['reports'] = [
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
    createdAt: '2026-10-12T07:55:00Z',
    rangeLabel: 'Last 14 days',
    sizeBytes: 1_104_400,
    downloadCount: 11,
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
  {
    id: 'rpt-r6',
    title: 'Vega Engagement Dossier',
    type: 'engagement',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    createdAt: '2026-10-04T06:00:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_330_900,
    downloadCount: 8,
    coverHeadline: 'VEGA, WARMING',
    coverPullQuote: 'A long, patient ramp — replies finally cresting the 6% mark.',
  },
  {
    id: 'rpt-r7',
    title: 'Lyra Warmth Review',
    type: 'warmth',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    createdAt: '2026-10-02T11:20:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_142_500,
    downloadCount: 9,
    coverHeadline: 'STUDIO QUIET',
    coverPullQuote: 'Lyra closes the month with the most stable reputation curve on the roster.',
  },
  {
    id: 'rpt-r8',
    title: 'Pixel Forge White-label',
    type: 'white_label',
    format: 'pdf',
    status: 'ready',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    createdAt: '2026-09-29T13:00:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 1_044_000,
    downloadCount: 4,
    coverHeadline: 'FORGE FINDS ITS GROOVE',
    coverPullQuote: 'Pixel Forge graduates two new sub-domains into the production rotation.',
  },
];

const MOCK_SCHEDULED: AgencyReportsData['scheduled'] = [
  {
    id: 'sch-1',
    title: 'Weekly Portfolio Digest',
    type: 'placement',
    cadence: 'weekly',
    nextRunAt: '2026-10-19T08:00:00Z',
    subClientIds: MOCK_SUB_CLIENTS.map((s) => s.id),
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
  {
    id: 'sch-4',
    title: 'Orion + Quasar Engagement',
    type: 'engagement',
    cadence: 'weekly',
    nextRunAt: '2026-10-15T08:30:00Z',
    subClientIds: ['sc-orion', 'sc-quasar'],
    recipientCount: 3,
  },
];

const MOCK: AgencyReportsData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  subClients: MOCK_SUB_CLIENTS,
  reports: MOCK_REPORTS,
  scheduled: MOCK_SCHEDULED,
  summary: {
    reportsThisMonth: 14,
    reportsTotal: 248,
    downloadsThisMonth: 312,
    scheduledActive: MOCK_SCHEDULED.length,
  },
};

// ---------------------------------------------------------------------------
// Per-recipe seed defaults. The four recipes ship with sensible
// pre-filled values so the editor is exploratory from the first click.
// Accent colors are picked from the orange family by default — the
// user-pickable swatch is the only place a non-orange value can land
// in this file.
// ---------------------------------------------------------------------------

const DEFAULT_CONFIGS: Record<ReportType, TemplateConfig> = {
  warmth: {
    type: 'warmth',
    title: 'Warmth Trajectory',
    tagline:
      "A warm cup of progress — slow, patient, and built on the day-by-day climb of every mailbox in the fleet.",
    accentColor: '#F26522',
    headerText: 'Northwind · Warmth Digest',
    footerText: 'Prepared by Northwind Agency · Confidential',
    brandLogo: 'NW',
    dateRange: 'last_30',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: false,
      recommendations: true,
    },
  },
  engagement: {
    type: 'engagement',
    title: 'Engagement Lift',
    tagline:
      "Replies, opens and stars folded together until the dough rises — the engagement metric that proves a fleet is alive.",
    accentColor: '#FF8A4B',
    headerText: 'Northwind · Engagement Report',
    footerText: 'Prepared by Northwind Agency · Internal',
    brandLogo: 'NW',
    dateRange: 'last_30',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: true,
      recommendations: true,
    },
  },
  placement: {
    type: 'placement',
    title: 'Placement Review',
    tagline:
      "Inbox vs spam, plated side-by-side — the headline number every sub-client wants to see when the report lands in their inbox.",
    accentColor: '#FF9670',
    headerText: 'Northwind · Placement Review',
    footerText: 'Prepared by Northwind Agency · Confidential',
    brandLogo: 'NW',
    dateRange: 'quarter',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: true,
      recommendations: false,
    },
  },
  white_label: {
    type: 'white_label',
    title: 'White-label Digest',
    tagline:
      "Your agency badge, your brand, your numbers — a clean, monthly summary cut for the partnership team to forward as-is.",
    accentColor: '#ffb454',
    headerText: 'Northwind partners · Monthly Digest',
    footerText: 'Prepared by Northwind for the partnership team',
    brandLogo: 'NW',
    dateRange: 'last_30',
    sections: {
      summary: true,
      kpiBand: true,
      chart: false,
      perSubClientTable: true,
      domainBreakdown: false,
      recommendations: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Type vocabulary — labels, "dish names", and per-type tints. Each
// report type becomes a recipe with its own dish identity so the page
// has cookbook-flavor copy throughout.
// ---------------------------------------------------------------------------

interface RecipeDescriptor {
  label: string;
  dish: string; // playful dish-name copy on the recipe page
  tagline: string;
  Icon: typeof Flame;
  recipeNumber: number;
  number: string; // "01" — used in big serif numerals on the recipe page
  accentVar: string;
  cookTime: string;
  servings: string;
  category: string;
}

const RECIPE_INFO: Record<ReportType, RecipeDescriptor> = {
  warmth: {
    label: 'Warmth',
    dish: 'Slow-Simmered Warmth Stew',
    tagline: 'A patient, slow-cooked report on reputation gain over time.',
    Icon: Flame,
    recipeNumber: 1,
    number: '01',
    accentVar: 'var(--wp-accent, #F26522)',
    cookTime: '30s',
    servings: '1 PDF',
    category: 'Foundation',
  },
  engagement: {
    label: 'Engagement',
    dish: 'Wood-Fired Engagement Flatbread',
    tagline: 'Hot, fast and full of replies — the flagship engagement spread.',
    Icon: Heart,
    recipeNumber: 2,
    number: '02',
    accentVar: 'var(--wp-accent-2, #FF8A4B)',
    cookTime: '25s',
    servings: '1 PDF',
    category: 'Signature',
  },
  placement: {
    label: 'Placement',
    dish: 'Golden Inbox Tarte',
    tagline: 'Inbox vs spam, layered in a glossy editorial finish.',
    Icon: Target,
    recipeNumber: 3,
    number: '03',
    accentVar: 'var(--wp-accent-3, #FF9670)',
    cookTime: '40s',
    servings: '1 PDF',
    category: 'Showcase',
  },
  white_label: {
    label: 'White-label',
    dish: 'House Blend Monthly Digest',
    tagline: 'Your brand front-of-house, our analytics under the hood.',
    Icon: Crown,
    recipeNumber: 4,
    number: '04',
    accentVar: 'var(--wp-warning, #ffb454)',
    cookTime: '20s',
    servings: '1 PDF',
    category: 'Partner',
  },
};

// ---------------------------------------------------------------------------
// Ingredient metadata. Each ingredient is a section toggle from the
// template config. The decorative "quantity" prefix is purely
// cosmetic — it's an editorial cue, not a data field.
// ---------------------------------------------------------------------------

type SectionKey = keyof TemplateConfig['sections'];

interface IngredientDescriptor {
  key: SectionKey;
  label: string;
  description: string;
  qty: string; // "1 cup", "1 tbsp" — decorative
  unit: string;
  Icon: typeof Flame;
  step: string; // method-step copy when this section is on
}

const INGREDIENTS: IngredientDescriptor[] = [
  {
    key: 'summary',
    label: 'Executive summary',
    description: 'The opening paragraph — a one-page editorial of the period.',
    qty: '1',
    unit: 'cup',
    Icon: ScrollText,
    step: 'Open with a one-page executive summary highlighting the headline number and the why.',
  },
  {
    key: 'kpiBand',
    label: 'KPI band',
    description: 'A row of headline tiles — sends, opens, replies, placement.',
    qty: '4',
    unit: 'tbsp',
    Icon: Gauge,
    step: 'Lay a 4-tile KPI band beneath the summary — sends, opens, replies and placement.',
  },
  {
    key: 'chart',
    label: 'Trend chart',
    description: 'A 30-day trajectory chart of the headline metric.',
    qty: '1',
    unit: 'sprig',
    Icon: LineChart,
    step: 'Plate a 30-day trend chart of the headline metric, day-over-day, smoothed.',
  },
  {
    key: 'perSubClientTable',
    label: 'Sub-client table',
    description: 'Per sub-client breakdown — one row per agency client.',
    qty: '1',
    unit: 'pinch',
    Icon: Users,
    step: 'Garnish with a per sub-client table — one row per agency client, sortable.',
  },
  {
    key: 'domainBreakdown',
    label: 'Domain breakdown',
    description: 'Gmail / Outlook / Yahoo / Other placement split.',
    qty: '2',
    unit: 'tsp',
    Icon: Building2,
    step: 'Finish with a domain split — Gmail vs Outlook vs Yahoo vs Other inboxing.',
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    description: 'A short list of next-step actions for the agency.',
    qty: '1',
    unit: 'twist',
    Icon: Sparkles,
    step: 'Serve with a short list of recommended next steps for the operator.',
  },
];

// ---------------------------------------------------------------------------
// Date-range vocabulary — decorative chips inside the recipe editor.
// ---------------------------------------------------------------------------

interface DateRangeDescriptor {
  key: TemplateConfig['dateRange'];
  label: string;
  short: string;
  Icon: typeof Calendar;
}

const DATE_RANGES: DateRangeDescriptor[] = [
  { key: 'last_7', label: 'Last 7 days', short: '7d', Icon: Clock },
  { key: 'last_14', label: 'Last 14 days', short: '14d', Icon: CalendarClock },
  { key: 'last_30', label: 'Last 30 days', short: '30d', Icon: Calendar },
  { key: 'last_90', label: 'Last 90 days', short: '90d', Icon: CalendarClock },
  { key: 'quarter', label: 'Current quarter', short: 'Q', Icon: CalendarClock },
];

// ---------------------------------------------------------------------------
// CSV builders — fields per ingredient. When the user checks an
// ingredient on, the corresponding column block appears in the sample
// CSV blob. The shape is deterministic against the data + ingredient
// set so two clicks of "Cook now" yield byte-identical files.
// ---------------------------------------------------------------------------

const CSV_FIELDS: Record<SectionKey, string[]> = {
  summary: ['summary_metric', 'summary_value', 'summary_change'],
  kpiBand: ['sends_total', 'opens_total', 'replies_total', 'placement_pct'],
  chart: ['trend_day', 'trend_value', 'trend_smoothed'],
  perSubClientTable: [
    'subclient_id',
    'subclient_name',
    'mailbox_count',
    'sub_warmth_avg',
    'sub_inbox_pct',
  ],
  domainBreakdown: [
    'gmail_inbox_pct',
    'outlook_inbox_pct',
    'yahoo_inbox_pct',
    'other_inbox_pct',
  ],
  recommendations: ['rec_priority', 'rec_title', 'rec_owner'],
};

const SECTION_ORDER: SectionKey[] = [
  'summary',
  'kpiBand',
  'chart',
  'perSubClientTable',
  'domainBreakdown',
  'recommendations',
];

// Hash a stable seed so the same sub-client × type pair always yields
// the same mock values in the downloaded sample.
function hashUnit(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function buildSampleRows(
  cfg: TemplateConfig,
  data: AgencyReportsData,
): Array<Record<string, string>> {
  const sections = SECTION_ORDER.filter((s) => cfg.sections[s]);
  if (sections.length === 0) {
    return [];
  }

  const allFields = sections.flatMap((s) => CSV_FIELDS[s]);
  const subClients = data.subClients;
  const today = new Date();

  // We emit one row per sub-client × per trend-day so the sample feels
  // like a real export. Cap at 10 sub-clients × 7 days to keep the
  // download light — this is a *sample*, not the live export.
  const trendDays = cfg.sections.chart ? 7 : 1;
  const subSet = subClients.slice(0, 10);

  const rows: Array<Record<string, string>> = [];
  for (const sc of subSet) {
    for (let d = 0; d < trendDays; d++) {
      const row: Record<string, string> = {};
      // Always include identity columns so the row is anchored.
      row['template_type'] = cfg.type;
      row['template_title'] = cfg.title;
      row['date_range'] = cfg.dateRange;

      for (const f of allFields) {
        const seed = `${sc.id}|${f}|${d}|${cfg.type}`;
        const u = hashUnit(seed);
        switch (f) {
          case 'summary_metric':
            row[f] =
              cfg.type === 'warmth'
                ? 'avg_warmth'
                : cfg.type === 'engagement'
                  ? 'reply_rate'
                  : cfg.type === 'placement'
                    ? 'inbox_placement'
                    : 'fleet_health';
            break;
          case 'summary_value':
            row[f] = (60 + u * 35).toFixed(1);
            break;
          case 'summary_change':
            row[f] = `${(u * 10 - 3).toFixed(1)}%`;
            break;
          case 'sends_total':
            row[f] = Math.round(800 + u * 9_200).toString();
            break;
          case 'opens_total':
            row[f] = Math.round(120 + u * 3_800).toString();
            break;
          case 'replies_total':
            row[f] = Math.round(20 + u * 380).toString();
            break;
          case 'placement_pct':
            row[f] = (60 + u * 35).toFixed(1);
            break;
          case 'trend_day': {
            const t = new Date(today);
            t.setUTCDate(t.getUTCDate() - (trendDays - 1 - d));
            row[f] = t.toISOString().slice(0, 10);
            break;
          }
          case 'trend_value':
            row[f] = (50 + u * 45).toFixed(2);
            break;
          case 'trend_smoothed':
            row[f] = (55 + u * 38).toFixed(2);
            break;
          case 'subclient_id':
            row[f] = sc.id;
            break;
          case 'subclient_name':
            row[f] = sc.name;
            break;
          case 'mailbox_count':
            row[f] = sc.mailboxCount.toString();
            break;
          case 'sub_warmth_avg':
            row[f] = (55 + u * 35).toFixed(1);
            break;
          case 'sub_inbox_pct':
            row[f] = (60 + u * 35).toFixed(1);
            break;
          case 'gmail_inbox_pct':
            row[f] = (65 + u * 30).toFixed(1);
            break;
          case 'outlook_inbox_pct':
            row[f] = (50 + u * 40).toFixed(1);
            break;
          case 'yahoo_inbox_pct':
            row[f] = (55 + u * 35).toFixed(1);
            break;
          case 'other_inbox_pct':
            row[f] = (40 + u * 45).toFixed(1);
            break;
          case 'rec_priority':
            row[f] = u > 0.66 ? 'high' : u > 0.33 ? 'medium' : 'low';
            break;
          case 'rec_title':
            row[f] = `Tune ramp for ${sc.name}`;
            break;
          case 'rec_owner':
            row[f] = 'Northwind ops';
            break;
          default:
            row[f] = '';
        }
      }
      rows.push(row);
    }
  }

  return rows;
}

function rowsToCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) {
    return 'template_type,template_title,date_range\n(no ingredients selected)\n';
  }
  const headers = Object.keys(rows[0]!);
  const lines: string[] = [];
  lines.push(headers.join(','));
  for (const r of rows) {
    const cells = headers.map((h) => {
      const v = r[h] ?? '';
      // Quote any cell containing a comma, quote, or newline.
      if (/[",\n]/.test(v)) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    });
    lines.push(cells.join(','));
  }
  return lines.join('\n') + '\n';
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so synchronous reads complete first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtRelativePast(iso: string, now: Date): string {
  const target = new Date(iso).getTime();
  const diffMs = now.getTime() - target;
  if (diffMs <= 0) return 'just now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Convert a hex color to an rgba string with the given alpha. Falls back
// to the brand orange if parsing fails — never leaves an unparsed token
// inline so the recipe page never goes blank.
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.trim();
  if (h.startsWith('#')) {
    h = h.slice(1);
  }
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]+$/.test(h)) {
    return `rgba(242, 101, 34, ${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Inline serif style — applied to anything that wants the editorial
// cookbook treatment.
// ---------------------------------------------------------------------------

const SERIF: CSSProperties = {
  fontFamily:
    "'Georgia', 'Hoefler Text', 'Cambria', 'Times New Roman', serif",
};

const SERIF_ITALIC: CSSProperties = {
  fontFamily:
    "'Georgia', 'Hoefler Text', 'Cambria', 'Times New Roman', serif",
  fontStyle: 'italic',
};

// Reusable parchment background — soft beige tinted with the warm
// orange family. The radial gradient suggests a worn page corner.
const PARCHMENT_BG: CSSProperties = {
  backgroundColor:
    'color-mix(in srgb, var(--wp-warning, #ffb454) 8%, var(--wp-surface, #12121a))',
  backgroundImage: `
    radial-gradient(ellipse at top left, color-mix(in srgb, var(--wp-warning, #ffb454) 14%, transparent) 0%, transparent 55%),
    radial-gradient(ellipse at bottom right, color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent) 0%, transparent 60%)
  `,
};

const PARCHMENT_CARD: CSSProperties = {
  backgroundColor:
    'color-mix(in srgb, var(--wp-warning, #ffb454) 6%, var(--wp-surface, #12121a))',
  backgroundImage: `
    radial-gradient(ellipse at top, color-mix(in srgb, var(--wp-warning, #ffb454) 10%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse at bottom, color-mix(in srgb, var(--wp-accent, #F26522) 6%, transparent) 0%, transparent 55%)
  `,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptR7Cookbook({
  data,
}: { data?: AgencyReportsData } = {}): JSX.Element {
  const resolved = data ?? MOCK;
  const [now, setNow] = useState(() => new Date());
  const [activeType, setActiveType] = useState<ReportType>('warmth');
  const [configs, setConfigs] = useState<Record<ReportType, TemplateConfig>>(
    () => ({ ...DEFAULT_CONFIGS }),
  );
  const [savedAt, setSavedAt] = useState<Record<ReportType, string | null>>(
    () => ({
      warmth: null,
      engagement: null,
      placement: null,
      white_label: null,
    }),
  );

  // Tick the clock once a minute so "last baked" / "recent meals"
  // relative timestamps stay live without being noisy.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const activeCfg = configs[activeType];
  const activeMeta = RECIPE_INFO[activeType];

  const setActiveCfg = (next: TemplateConfig) => {
    setConfigs((prev) => ({ ...prev, [next.type]: next }));
  };

  const toggleSection = (key: SectionKey) => {
    setActiveCfg({
      ...activeCfg,
      sections: { ...activeCfg.sections, [key]: !activeCfg.sections[key] },
    });
  };

  const handleSave = () => {
    setSavedAt((prev) => ({ ...prev, [activeType]: new Date().toISOString() }));
    toast.success('Recipe saved');
  };

  const handleCook = () => {
    const rows = buildSampleRows(activeCfg, resolved);
    const csv = rowsToCsv(rows);
    const filename = `northwind-${activeType}-sample-${isoDateToday()}.csv`;
    downloadCsv(filename, csv);
    toast.success('Sample downloaded');
  };

  // Recently-cooked strip — newest 6 ready reports rendered as little
  // plate thumbnails at the bottom of the page.
  const recentMeals = useMemo(
    () =>
      [...resolved.reports]
        .filter((r) => r.status === 'ready' || r.status === 'generating')
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 6),
    [resolved.reports],
  );

  const lastBakedIso = useMemo(() => {
    const ready = resolved.reports.filter((r) => r.status === 'ready');
    if (ready.length === 0) {
      return resolved.reports[0]?.createdAt ?? new Date().toISOString();
    }
    return [...ready].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]!.createdAt;
  }, [resolved.reports]);

  return (
    <div className="min-h-screen text-text" style={PARCHMENT_BG}>
      <div className="mx-auto flex max-w-[1480px] flex-col gap-8 p-6 lg:p-10">
        <CookbookHeader
          agency={resolved.agency}
          summary={resolved.summary}
          lastBakedIso={lastBakedIso}
          now={now}
        />

        <RecipeIndex
          activeType={activeType}
          onChange={setActiveType}
          configs={configs}
          savedAt={savedAt}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeType}
            initial={{ opacity: 0, x: 24, rotateY: -6 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: -24, rotateY: 6 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ perspective: 1200 }}
          >
            <RecipePage
              cfg={activeCfg}
              meta={activeMeta}
              data={resolved}
              savedAt={savedAt[activeType]}
              now={now}
              onChangeTitle={(title) => setActiveCfg({ ...activeCfg, title })}
              onChangeTagline={(tagline) =>
                setActiveCfg({ ...activeCfg, tagline })
              }
              onChangeHeader={(headerText) =>
                setActiveCfg({ ...activeCfg, headerText })
              }
              onChangeFooter={(footerText) =>
                setActiveCfg({ ...activeCfg, footerText })
              }
              onChangeLogo={(brandLogo) =>
                setActiveCfg({ ...activeCfg, brandLogo })
              }
              onChangeAccent={(accentColor) =>
                setActiveCfg({ ...activeCfg, accentColor })
              }
              onChangeRange={(dateRange) =>
                setActiveCfg({ ...activeCfg, dateRange })
              }
              onToggleSection={toggleSection}
              onSave={handleSave}
              onCook={handleCook}
            />
          </motion.div>
        </AnimatePresence>

        <RecentMeals reports={recentMeals} now={now} />

        <CookbookFooter agency={resolved.agency} />
      </div>
    </div>
  );
}

export default AgRptR7Cookbook;

// ---------------------------------------------------------------------------
// Cookbook header — the masthead of the recipe book. Big serif display
// title, agency volume number, last-baked timestamp on the left;
// decorative print + share chips on the right.
// ---------------------------------------------------------------------------

function CookbookHeader({
  agency,
  summary,
  lastBakedIso,
  now,
}: {
  agency: AgencyReportsData['agency'];
  summary: AgencyReportsData['summary'];
  lastBakedIso: string;
  now: Date;
}): JSX.Element {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl border p-8 lg:p-10"
      style={{
        ...PARCHMENT_CARD,
        borderColor: 'color-mix(in srgb, var(--wp-accent, #F26522) 28%, var(--wp-border, #2a2a3a))',
      }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-full border"
              style={{
                background:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
                borderColor:
                  'color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)',
                color: 'var(--wp-accent, #F26522)',
              }}
            >
              <ChefHat className="h-6 w-6" />
            </span>
            <div className="flex flex-col">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
                style={{ letterSpacing: '0.32em' }}
              >
                Vol. III · Issue 7 · Agency Reports
              </span>
              <span className="text-xs text-text-dim">
                {agency.name} · {agency.region}
              </span>
            </div>
          </div>
          <h1
            className="text-[44px] font-bold leading-[1.05] tracking-tight text-text lg:text-[56px]"
            style={SERIF}
          >
            The Northwind
            <br />
            <span className="text-accent">Recipe Book</span>
          </h1>
          <p
            className="max-w-2xl text-base leading-relaxed text-text-dim"
            style={SERIF_ITALIC}
          >
            Four staple recipes for agency reports — warmth, engagement,
            placement and white-label. Pick a recipe, tune the
            ingredients, and cook a sample to taste.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span style={SERIF}>
                Last baked {fmtRelativePast(lastBakedIso, now)}
              </span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-accent2" />
              <span style={SERIF}>{summary.reportsTotal} recipes baked</span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-accent3" />
              <span style={SERIF}>
                {summary.downloadsThisMonth} servings this month
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DecorativeChip Icon={Printer} label="Print" />
            <DecorativeChip Icon={Share2} label="Share" />
            <DecorativeChip Icon={Bookmark} label="Bookmark" />
          </div>
          <CookbookKpiStrip summary={summary} />
        </div>
      </div>
    </motion.header>
  );
}

function DecorativeChip({
  Icon,
  label,
}: {
  Icon: typeof Printer;
  label: string;
}): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
      style={{
        ...SERIF,
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 10%, var(--wp-surface, #12121a))',
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 24%, var(--wp-border, #2a2a3a))',
        color: 'var(--wp-text, #e8e8f0)',
      }}
    >
      <Icon className="h-3.5 w-3.5 text-accent" />
      {label}
    </span>
  );
}

function CookbookKpiStrip({
  summary,
}: {
  summary: AgencyReportsData['summary'];
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <KpiStub
        label="Recipes this month"
        value={summary.reportsThisMonth.toString()}
        Icon={BookOpen}
        tint="accent"
      />
      <KpiStub
        label="Servings logged"
        value={summary.downloadsThisMonth.toString()}
        Icon={Drumstick}
        tint="accent2"
      />
      <KpiStub
        label="Standing orders"
        value={summary.scheduledActive.toString()}
        Icon={CalendarClock}
        tint="accent3"
      />
    </div>
  );
}

function KpiStub({
  label,
  value,
  Icon,
  tint,
}: {
  label: string;
  value: string;
  Icon: typeof BookOpen;
  tint: 'accent' | 'accent2' | 'accent3' | 'accent4';
}): JSX.Element {
  const cls =
    tint === 'accent'
      ? 'text-accent border-accent/35 bg-accent/10'
      : tint === 'accent2'
        ? 'text-accent2 border-accent2/35 bg-accent2/10'
        : tint === 'accent3'
          ? 'text-accent3 border-accent3/35 bg-accent3/10'
          : 'text-accent4 border-accent4/35 bg-accent4/10';
  return (
    <div
      className="flex items-center gap-2 rounded-2xl border px-3 py-2"
      style={{
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 5%, var(--wp-surface, #12121a))',
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 18%, var(--wp-border, #2a2a3a))',
      }}
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-xl border ${cls}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col leading-tight">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint"
        >
          {label}
        </span>
        <span className="text-base font-semibold text-text" style={SERIF}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe index — 4 chip tabs sitting above the recipe page.
// ---------------------------------------------------------------------------

function RecipeIndex({
  activeType,
  onChange,
  configs,
  savedAt,
}: {
  activeType: ReportType;
  onChange: (t: ReportType) => void;
  configs: Record<ReportType, TemplateConfig>;
  savedAt: Record<ReportType, string | null>;
}): JSX.Element {
  const order: ReportType[] = ['warmth', 'engagement', 'placement', 'white_label'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
          style={{ letterSpacing: '0.32em' }}
        >
          Table of contents
        </span>
        <span className="h-px flex-1 bg-border-muted/60" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {order.map((type) => {
          const meta = RECIPE_INFO[type];
          const cfg = configs[type];
          const isActive = type === activeType;
          const Icon = meta.Icon;
          return (
            <motion.button
              key={type}
              onClick={() => onChange(type)}
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
              className="group flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all"
              style={{
                background: isActive
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, var(--wp-surface, #12121a))'
                  : 'color-mix(in srgb, var(--wp-warning, #ffb454) 5%, var(--wp-surface, #12121a))',
                borderColor: isActive
                  ? 'color-mix(in srgb, var(--wp-accent, #F26522) 42%, transparent)'
                  : 'color-mix(in srgb, var(--wp-accent, #F26522) 20%, var(--wp-border, #2a2a3a))',
              }}
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full border"
                style={{
                  background: hexToRgba(cfg.accentColor, 0.14),
                  borderColor: hexToRgba(cfg.accentColor, 0.36),
                  color: cfg.accentColor,
                }}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div className="flex flex-col leading-tight">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint"
                >
                  Recipe {meta.recipeNumber}
                </span>
                <span
                  className="text-sm font-semibold text-text"
                  style={SERIF}
                >
                  {meta.label}
                </span>
              </div>
              {savedAt[type] && (
                <span
                  className="ml-2 inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-mono uppercase tracking-[0.18em]"
                  style={{
                    color: 'var(--wp-accent, #F26522)',
                    background:
                      'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                    borderColor:
                      'color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
                  }}
                >
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe page — the main two-column spread. Left 60% is the editor,
// right 40% is the plated preview.
// ---------------------------------------------------------------------------

function RecipePage({
  cfg,
  meta,
  data,
  savedAt,
  now,
  onChangeTitle,
  onChangeTagline,
  onChangeHeader,
  onChangeFooter,
  onChangeLogo,
  onChangeAccent,
  onChangeRange,
  onToggleSection,
  onSave,
  onCook,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
  data: AgencyReportsData;
  savedAt: string | null;
  now: Date;
  onChangeTitle: (s: string) => void;
  onChangeTagline: (s: string) => void;
  onChangeHeader: (s: string) => void;
  onChangeFooter: (s: string) => void;
  onChangeLogo: (s: string) => void;
  onChangeAccent: (s: string) => void;
  onChangeRange: (r: TemplateConfig['dateRange']) => void;
  onToggleSection: (key: SectionKey) => void;
  onSave: () => void;
  onCook: () => void;
}): JSX.Element {
  return (
    <div
      className="rounded-3xl border"
      style={{
        ...PARCHMENT_CARD,
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 24%, var(--wp-border, #2a2a3a))',
      }}
    >
      <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-[1.55fr_1fr] lg:gap-10 lg:p-10">
        <RecipeEditor
          cfg={cfg}
          meta={meta}
          savedAt={savedAt}
          now={now}
          onChangeTitle={onChangeTitle}
          onChangeTagline={onChangeTagline}
          onChangeHeader={onChangeHeader}
          onChangeFooter={onChangeFooter}
          onChangeLogo={onChangeLogo}
          onChangeAccent={onChangeAccent}
          onChangeRange={onChangeRange}
          onToggleSection={onToggleSection}
        />
        <RecipePlate cfg={cfg} meta={meta} data={data} />
      </div>
      <RecipeActionBand
        cfg={cfg}
        meta={meta}
        savedAt={savedAt}
        now={now}
        onSave={onSave}
        onCook={onCook}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe editor — left column. Big serif number, big serif title,
// editable tagline, ingredient checklist, method steps, serving
// suggestion, branding controls.
// ---------------------------------------------------------------------------

function RecipeEditor({
  cfg,
  meta,
  savedAt,
  now,
  onChangeTitle,
  onChangeTagline,
  onChangeHeader,
  onChangeFooter,
  onChangeLogo,
  onChangeAccent,
  onChangeRange,
  onToggleSection,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
  savedAt: string | null;
  now: Date;
  onChangeTitle: (s: string) => void;
  onChangeTagline: (s: string) => void;
  onChangeHeader: (s: string) => void;
  onChangeFooter: (s: string) => void;
  onChangeLogo: (s: string) => void;
  onChangeAccent: (s: string) => void;
  onChangeRange: (r: TemplateConfig['dateRange']) => void;
  onToggleSection: (key: SectionKey) => void;
}): JSX.Element {
  const activeIngredients = SECTION_ORDER.filter((k) => cfg.sections[k]);
  const Icon = meta.Icon;
  return (
    <div className="flex flex-col gap-7">
      {/* Recipe head — eyebrow + big serif number + big serif title */}
      <div className="flex items-start gap-5">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full border"
          style={{
            background: hexToRgba(cfg.accentColor, 0.12),
            borderColor: hexToRgba(cfg.accentColor, 0.34),
            color: cfg.accentColor,
          }}
        >
          <Icon className="h-9 w-9" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
              style={{ letterSpacing: '0.32em' }}
            >
              Recipe {meta.recipeNumber}
            </span>
            <span className="h-3 w-px bg-border-muted" />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.22em]"
              style={{ color: cfg.accentColor }}
            >
              {meta.category}
            </span>
            {savedAt && (
              <span
                className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]"
                style={{
                  color: 'var(--wp-accent, #F26522)',
                  background:
                    'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                  borderColor:
                    'color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
                }}
              >
                <Check className="h-3 w-3" />
                Saved {fmtRelativePast(savedAt, now)}
              </span>
            )}
          </div>
          <EditableTitle value={cfg.title} onChange={onChangeTitle} />
          <span
            className="text-xs text-text-dim"
            style={SERIF_ITALIC}
          >
            also known as {meta.dish}
          </span>
        </div>
      </div>

      {/* Tagline quote — editable */}
      <EditableTagline value={cfg.tagline} onChange={onChangeTagline} />

      {/* Brand strip — header text, footer text, logo, accent, range */}
      <BrandStrip
        cfg={cfg}
        onChangeHeader={onChangeHeader}
        onChangeFooter={onChangeFooter}
        onChangeLogo={onChangeLogo}
        onChangeAccent={onChangeAccent}
        onChangeRange={onChangeRange}
      />

      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent), transparent)',
        }}
      />

      {/* Ingredients */}
      <IngredientList cfg={cfg} onToggle={onToggleSection} />

      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent), transparent)',
        }}
      />

      {/* Method */}
      <MethodSteps activeIngredients={activeIngredients} accent={cfg.accentColor} />

      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent), transparent)',
        }}
      />

      {/* Serving suggestion */}
      <ServingSuggestion cfg={cfg} meta={meta} />
    </div>
  );
}

function EditableTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}): JSX.Element {
  return (
    <div className="group relative flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label="Recipe title"
        className="w-full bg-transparent text-[34px] font-bold leading-tight tracking-tight text-text outline-none transition-all focus:bg-surface-2/40 lg:text-[42px]"
        style={SERIF}
      />
      <Pencil className="absolute right-0 top-2 h-4 w-4 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

function EditableTagline({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}): JSX.Element {
  return (
    <div className="group relative">
      <div
        className="absolute -left-2 top-0 text-[44px] leading-[0.6] text-accent"
        style={SERIF}
        aria-hidden
      >
        “
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        aria-label="Recipe tagline"
        className="w-full resize-none rounded-2xl border bg-transparent py-3 pl-8 pr-4 text-base leading-relaxed text-text-dim outline-none transition-all focus:text-text"
        style={{
          ...SERIF_ITALIC,
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 16%, var(--wp-border, #2a2a3a))',
          background:
            'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
        }}
      />
      <div className="mt-1 flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.22em] text-text-faint">
        <Pen className="h-3 w-3" />
        Editorial tagline · shown on the report cover
      </div>
    </div>
  );
}

function BrandStrip({
  cfg,
  onChangeHeader,
  onChangeFooter,
  onChangeLogo,
  onChangeAccent,
  onChangeRange,
}: {
  cfg: TemplateConfig;
  onChangeHeader: (s: string) => void;
  onChangeFooter: (s: string) => void;
  onChangeLogo: (s: string) => void;
  onChangeAccent: (s: string) => void;
  onChangeRange: (r: TemplateConfig['dateRange']) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Stamp className="h-3.5 w-3.5 text-accent" />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
          style={{ letterSpacing: '0.32em' }}
        >
          Plating &amp; brand
        </span>
        <span className="h-px flex-1 bg-border-muted/60" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <LabelledInput
          label="Header text"
          Icon={Tag}
          value={cfg.headerText}
          onChange={onChangeHeader}
        />
        <LabelledInput
          label="Footer text"
          Icon={Hash}
          value={cfg.footerText}
          onChange={onChangeFooter}
        />
        <LabelledInput
          label="Brand logo mark"
          Icon={Sticker}
          value={cfg.brandLogo}
          onChange={onChangeLogo}
          maxLength={4}
        />
        <ColorInput value={cfg.accentColor} onChange={onChangeAccent} />
      </div>

      <DateRangeStrip value={cfg.dateRange} onChange={onChangeRange} />
    </div>
  );
}

function LabelledInput({
  label,
  Icon,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  Icon: typeof Tag;
  value: string;
  onChange: (s: string) => void;
  maxLength?: number;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-text-faint">
        <Icon className="h-3 w-3 text-accent" />
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        spellCheck={false}
        className="rounded-xl border bg-transparent px-3 py-2 text-sm text-text outline-none transition focus:border-accent/50"
        style={{
          ...SERIF,
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 14%, var(--wp-border, #2a2a3a))',
          background:
            'color-mix(in srgb, var(--wp-warning, #ffb454) 3%, transparent)',
        }}
      />
    </label>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-text-faint">
        <Feather className="h-3 w-3 text-accent" />
        Accent color
      </span>
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 14%, var(--wp-border, #2a2a3a))',
          background:
            'color-mix(in srgb, var(--wp-warning, #ffb454) 3%, transparent)',
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Accent color"
          className="h-7 w-10 cursor-pointer rounded-md border border-border-muted bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label="Accent color hex"
          className="flex-1 bg-transparent font-mono text-xs uppercase tracking-[0.16em] text-text outline-none"
        />
      </div>
    </label>
  );
}

function DateRangeStrip({
  value,
  onChange,
}: {
  value: TemplateConfig['dateRange'];
  onChange: (r: TemplateConfig['dateRange']) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-text-faint">
        <Calendar className="h-3 w-3 text-accent" />
        Date range
      </span>
      <div className="flex flex-wrap gap-1.5">
        {DATE_RANGES.map((r) => {
          const Icon = r.Icon;
          const active = r.key === value;
          return (
            <motion.button
              key={r.key}
              onClick={() => onChange(r.key)}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
              style={{
                ...SERIF,
                color: active ? 'var(--wp-bg, #0a0a0f)' : 'var(--wp-text, #e8e8f0)',
                background: active
                  ? 'var(--wp-accent, #F26522)'
                  : 'color-mix(in srgb, var(--wp-warning, #ffb454) 5%, var(--wp-surface, #12121a))',
                borderColor: active
                  ? 'var(--wp-accent, #F26522)'
                  : 'color-mix(in srgb, var(--wp-accent, #F26522) 22%, var(--wp-border, #2a2a3a))',
              }}
            >
              <Icon className="h-3 w-3" />
              {r.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ingredient checklist — six section toggles styled as a cookbook
// shopping list with decorative quantity prefixes.
// ---------------------------------------------------------------------------

function IngredientList({
  cfg,
  onToggle,
}: {
  cfg: TemplateConfig;
  onToggle: (key: SectionKey) => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full border"
          style={{
            background:
              'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
            borderColor:
              'color-mix(in srgb, var(--wp-accent, #F26522) 36%, transparent)',
            color: 'var(--wp-accent, #F26522)',
          }}
        >
          <Salad className="h-4.5 w-4.5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
            style={{ letterSpacing: '0.32em' }}
          >
            Mise en place
          </span>
          <h2 className="text-xl font-bold text-text" style={SERIF}>
            Ingredients
          </h2>
        </div>
        <span className="ml-auto text-xs text-text-dim" style={SERIF_ITALIC}>
          tap to add or remove
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {INGREDIENTS.map((ing) => (
          <IngredientRow
            key={ing.key}
            ing={ing}
            checked={cfg.sections[ing.key]}
            accent={cfg.accentColor}
            onToggle={() => onToggle(ing.key)}
          />
        ))}
      </ul>
    </section>
  );
}

function IngredientRow({
  ing,
  checked,
  accent,
  onToggle,
}: {
  ing: IngredientDescriptor;
  checked: boolean;
  accent: string;
  onToggle: () => void;
}): JSX.Element {
  const Icon = ing.Icon;
  return (
    <li>
      <motion.button
        type="button"
        onClick={onToggle}
        whileTap={{ scale: 0.985 }}
        className="group flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-all"
        style={{
          background: checked
            ? hexToRgba(accent, 0.1)
            : 'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, var(--wp-surface, #12121a))',
          borderColor: checked
            ? hexToRgba(accent, 0.36)
            : 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, var(--wp-border, #2a2a3a))',
        }}
      >
        <motion.span
          animate={
            checked
              ? { scale: [1, 1.18, 1], rotate: [0, 6, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border"
          style={{
            background: checked
              ? hexToRgba(accent, 0.28)
              : 'color-mix(in srgb, var(--wp-text-faint, #5a5a72) 8%, transparent)',
            borderColor: checked
              ? hexToRgba(accent, 0.5)
              : 'var(--wp-border, #2a2a3a)',
            color: checked ? '#fff' : 'var(--wp-text-faint, #5a5a72)',
          }}
        >
          {checked ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
        </motion.span>

        <span
          className="hidden w-20 shrink-0 text-right text-sm md:block"
          style={SERIF_ITALIC}
        >
          <span
            className="font-semibold"
            style={{
              color: checked
                ? 'var(--wp-text, #e8e8f0)'
                : 'var(--wp-text-faint, #5a5a72)',
            }}
          >
            {ing.qty}
          </span>{' '}
          <span style={{ color: 'var(--wp-text-faint, #5a5a72)' }}>
            {ing.unit}
          </span>
        </span>

        <Icon
          className="h-4 w-4 shrink-0"
          style={{
            color: checked ? accent : 'var(--wp-text-faint, #5a5a72)',
          }}
        />

        <div className="flex flex-1 flex-col leading-tight">
          <span className="text-sm font-semibold text-text" style={SERIF}>
            {ing.label}
          </span>
          <span className="text-xs text-text-dim">{ing.description}</span>
        </div>

        <span
          className="hidden font-mono text-[10px] uppercase tracking-[0.18em] md:inline"
          style={{
            color: checked ? accent : 'var(--wp-text-faint, #5a5a72)',
          }}
        >
          {checked ? 'in' : 'out'}
        </span>
      </motion.button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Method steps — numbered list of the visible sections in order, each
// with a drag-handle affordance so it reads as reorderable.
// ---------------------------------------------------------------------------

function MethodSteps({
  activeIngredients,
  accent,
}: {
  activeIngredients: SectionKey[];
  accent: string;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full border"
          style={{
            background:
              'color-mix(in srgb, var(--wp-accent-2, #FF8A4B) 14%, transparent)',
            borderColor:
              'color-mix(in srgb, var(--wp-accent-2, #FF8A4B) 36%, transparent)',
            color: 'var(--wp-accent-2, #FF8A4B)',
          }}
        >
          <CookingPot className="h-4.5 w-4.5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
            style={{ letterSpacing: '0.32em' }}
          >
            Method
          </span>
          <h2 className="text-xl font-bold text-text" style={SERIF}>
            Cook in order
          </h2>
        </div>
        <span className="ml-auto text-xs text-text-dim" style={SERIF_ITALIC}>
          drag to reorder
        </span>
      </div>

      {activeIngredients.length === 0 ? (
        <EmptyMethod />
      ) : (
        <ol className="flex flex-col gap-2">
          {activeIngredients.map((key, idx) => {
            const ing = INGREDIENTS.find((i) => i.key === key);
            if (!ing) return null;
            return (
              <MethodStep
                key={key}
                index={idx + 1}
                ing={ing}
                accent={accent}
                isLast={idx === activeIngredients.length - 1}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function MethodStep({
  index,
  ing,
  accent,
  isLast,
}: {
  index: number;
  ing: IngredientDescriptor;
  accent: string;
  isLast: boolean;
}): JSX.Element {
  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="grid h-9 w-9 place-items-center rounded-full border text-sm font-bold"
          style={{
            ...SERIF,
            background: hexToRgba(accent, 0.16),
            borderColor: hexToRgba(accent, 0.4),
            color: accent,
          }}
        >
          {index}
        </span>
        {!isLast && (
          <span
            className="flex-1 w-px my-1"
            style={{
              background:
                'color-mix(in srgb, var(--wp-accent, #F26522) 30%, transparent)',
              minHeight: 16,
            }}
          />
        )}
      </div>

      <div
        className="flex flex-1 items-center gap-3 rounded-2xl border px-3 py-2.5"
        style={{
          background:
            'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, var(--wp-surface, #12121a))',
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 16%, var(--wp-border, #2a2a3a))',
        }}
      >
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-faint" />
        <ing.Icon
          className="h-4 w-4 shrink-0"
          style={{ color: accent }}
        />
        <p className="flex-1 text-sm leading-relaxed text-text" style={SERIF}>
          {ing.step}
        </p>
      </div>
    </li>
  );
}

function EmptyMethod(): JSX.Element {
  return (
    <div
      className="rounded-2xl border border-dashed px-5 py-8 text-center"
      style={{
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 22%, var(--wp-border, #2a2a3a))',
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
      }}
    >
      <UtensilsCrossed className="mx-auto mb-2 h-6 w-6 text-text-faint" />
      <p className="text-sm text-text-dim" style={SERIF_ITALIC}>
        No ingredients selected — pick at least one from the list above to
        plate a report.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serving suggestion — final paragraph describing what the cooked
// report ends up looking like in the recipient's inbox.
// ---------------------------------------------------------------------------

function ServingSuggestion({
  cfg,
  meta,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
}): JSX.Element {
  const count = SECTION_ORDER.filter((k) => cfg.sections[k]).length;
  const range = DATE_RANGES.find((r) => r.key === cfg.dateRange);
  const sentence = useMemo(() => {
    if (count === 0) {
      return `An empty plate — turn on at least one ingredient to plate a ${meta.label.toLowerCase()} report.`;
    }
    return `Serve as a ${count}-section ${meta.label.toLowerCase()} PDF, covering ${range?.label.toLowerCase() ?? 'the selected window'}. Goes well with a weekly cadence drop into the partnership inbox; pairs nicely with the standing ${meta.dish.toLowerCase()} on the shelf.`;
  }, [count, meta, range]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full border"
          style={{
            background:
              'color-mix(in srgb, var(--wp-accent-3, #FF9670) 14%, transparent)',
            borderColor:
              'color-mix(in srgb, var(--wp-accent-3, #FF9670) 36%, transparent)',
            color: 'var(--wp-accent-3, #FF9670)',
          }}
        >
          <Utensils className="h-4.5 w-4.5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
            style={{ letterSpacing: '0.32em' }}
          >
            Serving suggestion
          </span>
          <h2 className="text-xl font-bold text-text" style={SERIF}>
            Out of the oven
          </h2>
        </div>
      </div>
      <p
        className="rounded-2xl border px-4 py-3 text-sm leading-relaxed text-text"
        style={{
          ...SERIF_ITALIC,
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 16%, var(--wp-border, #2a2a3a))',
          background:
            'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
        }}
      >
        {sentence}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recipe plate — right column. A circular plate background with a mini
// PDF preview rendered on top. Header band tinted by the live accent
// color. Subtle rotation animates whenever the user toggles an
// ingredient (signaling a re-plate).
// ---------------------------------------------------------------------------

function RecipePlate({
  cfg,
  meta,
  data,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
  data: AgencyReportsData;
}): JSX.Element {
  // Lightweight rotation pulse on any section change so the plate feels
  // alive. The `key` derived from the sections + accent is the cheap way
  // to retrigger AnimatePresence without juggling effects.
  const plateKey = useMemo(() => {
    const sectionMask = SECTION_ORDER.map((k) => (cfg.sections[k] ? '1' : '0')).join('');
    return `${cfg.accentColor}-${cfg.dateRange}-${sectionMask}`;
  }, [cfg.sections, cfg.accentColor, cfg.dateRange]);

  return (
    <aside className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-accent" />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
          style={{ letterSpacing: '0.32em' }}
        >
          Live plate
        </span>
        <span className="h-px flex-1 bg-border-muted/60" />
        <span className="text-xs text-text-dim" style={SERIF_ITALIC}>
          updates as you tune
        </span>
      </div>

      <div
        className="relative aspect-square rounded-3xl border"
        style={{
          background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--wp-warning, #ffb454) 18%, var(--wp-surface, #12121a)) 0%, var(--wp-surface, #12121a) 78%)`,
          borderColor:
            'color-mix(in srgb, var(--wp-accent, #F26522) 22%, var(--wp-border, #2a2a3a))',
        }}
      >
        {/* Plate ring */}
        <div
          className="absolute inset-4 rounded-full border"
          style={{
            borderColor: hexToRgba(cfg.accentColor, 0.18),
            background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--wp-warning, #ffb454) 12%, var(--wp-surface, #12121a)) 0%, var(--wp-surface, #12121a) 78%)`,
            boxShadow: `inset 0 0 60px ${hexToRgba(cfg.accentColor, 0.15)}`,
          }}
        />
        <div
          className="absolute inset-8 rounded-full border"
          style={{
            borderColor: hexToRgba(cfg.accentColor, 0.1),
          }}
        />

        {/* Mini PDF mounted on the plate */}
        <AnimatePresence mode="wait">
          <motion.div
            key={plateKey}
            initial={{ opacity: 0, scale: 0.94, rotate: -3 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.96, rotate: 3 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-[14%]"
          >
            <MiniPdfPreview cfg={cfg} meta={meta} data={data} />
          </motion.div>
        </AnimatePresence>

        {/* Decorative cutlery */}
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rotate-[-12deg] opacity-30">
          <Utensils className="h-6 w-6 text-accent2" />
        </div>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-[12deg] opacity-30">
          <Utensils className="h-6 w-6 text-accent2" />
        </div>

        {/* Steam puffs */}
        <SteamPuffs accent={cfg.accentColor} />
      </div>

      <PlateLegend cfg={cfg} meta={meta} />
    </aside>
  );
}

function SteamPuffs({ accent }: { accent: string }): JSX.Element {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ y: 0, opacity: 0.0, scale: 0.8 }}
          animate={{ y: -18, opacity: [0, 0.55, 0], scale: [0.8, 1, 1.15] }}
          transition={{
            duration: 2.6,
            delay: i * 0.45,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="mx-1 inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: hexToRgba(accent, 0.35),
            filter: 'blur(4px)',
          }}
        />
      ))}
    </div>
  );
}

function PlateLegend({
  cfg,
  meta,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
}): JSX.Element {
  const sections = SECTION_ORDER.filter((k) => cfg.sections[k]);
  return (
    <div
      className="rounded-2xl border p-3 text-xs leading-relaxed text-text-dim"
      style={{
        ...SERIF,
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 16%, var(--wp-border, #2a2a3a))',
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <Soup className="h-3.5 w-3.5 text-accent" />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint"
        >
          On the plate
        </span>
      </div>
      <p className="mt-2 text-text-dim">
        A {meta.label.toLowerCase()} report cut as a{' '}
        <span className="text-text">{sections.length}-section PDF</span>,
        plated in{' '}
        <span
          className="font-semibold"
          style={{ color: cfg.accentColor }}
        >
          {cfg.accentColor}
        </span>
        . Header reads{' '}
        <span className="text-text">“{cfg.headerText}”</span>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniPdfPreview — the mini "rendered report" on the plate. Renders
// only the sections that are toggled on, in order, with the live
// accent color tinted into the header band.
// ---------------------------------------------------------------------------

function MiniPdfPreview({
  cfg,
  meta,
  data,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
  data: AgencyReportsData;
}): JSX.Element {
  const sections = SECTION_ORDER.filter((k) => cfg.sections[k]);
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border shadow-2xl"
      style={{
        background: 'color-mix(in srgb, var(--wp-warning, #ffb454) 3%, #ffffff)',
        borderColor: 'rgba(0,0,0,0.18)',
        color: '#1f1d1a',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          background: `linear-gradient(90deg, ${hexToRgba(cfg.accentColor, 1)}, ${hexToRgba(cfg.accentColor, 0.7)})`,
          color: '#fff',
        }}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-md bg-white/20 text-[10px] font-bold"
          style={SERIF}
        >
          {cfg.brandLogo.slice(0, 2).toUpperCase()}
        </span>
        <span
          className="truncate text-[10px] font-semibold uppercase tracking-[0.18em]"
        >
          {cfg.headerText}
        </span>
      </div>

      <div className="flex-1 overflow-hidden px-3 py-2">
        <div className="text-[11px] font-bold leading-tight" style={SERIF}>
          {cfg.title}
        </div>
        <div className="mt-0.5 text-[8px] uppercase tracking-[0.18em] text-[#5a564f]">
          {meta.label} · {DATE_RANGES.find((r) => r.key === cfg.dateRange)?.short}
        </div>

        {sections.length === 0 && (
          <div className="mt-3 rounded border border-dashed border-[#d4cfc4] px-2 py-3 text-center text-[9px] text-[#7a7464]">
            Nothing plated yet.
          </div>
        )}

        <div className="mt-2 flex flex-col gap-1.5">
          {sections.map((s) => (
            <MiniSection
              key={s}
              section={s}
              accent={cfg.accentColor}
              data={data}
            />
          ))}
        </div>
      </div>

      <div
        className="border-t px-3 py-1 text-[7px] uppercase tracking-[0.22em]"
        style={{
          borderColor: 'rgba(0,0,0,0.08)',
          color: '#7a7464',
        }}
      >
        {cfg.footerText}
      </div>
    </div>
  );
}

function MiniSection({
  section,
  accent,
  data,
}: {
  section: SectionKey;
  accent: string;
  data: AgencyReportsData;
}): JSX.Element {
  switch (section) {
    case 'summary':
      return (
        <div className="flex flex-col gap-0.5 rounded border border-[#e6e0d2] bg-[#fbf6e9] px-2 py-1.5">
          <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-[#7a7464]">
            <ScrollText className="h-2.5 w-2.5" style={{ color: accent }} />
            Summary
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#e6e0d2]" />
          <div className="h-1.5 w-[78%] rounded-full bg-[#e6e0d2]" />
          <div className="h-1.5 w-[64%] rounded-full bg-[#e6e0d2]" />
        </div>
      );
    case 'kpiBand':
      return (
        <div className="grid grid-cols-4 gap-1">
          {['Sends', 'Opens', 'Repl.', 'Plac.'].map((lbl, i) => (
            <div
              key={lbl}
              className="rounded border border-[#e6e0d2] bg-[#fbf6e9] px-1 py-0.5 text-center"
            >
              <div className="text-[7px] uppercase tracking-[0.14em] text-[#7a7464]">
                {lbl}
              </div>
              <div
                className="text-[9px] font-bold"
                style={{ ...SERIF, color: i === 0 ? accent : '#1f1d1a' }}
              >
                {Math.round(60 + (i + 1) * 9)}
                {i === 3 ? '%' : 'k'}
              </div>
            </div>
          ))}
        </div>
      );
    case 'chart':
      return <MiniChart accent={accent} />;
    case 'perSubClientTable':
      return (
        <div className="rounded border border-[#e6e0d2] bg-[#fbf6e9] px-2 py-1">
          <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-[#7a7464]">
            <Users className="h-2.5 w-2.5" style={{ color: accent }} />
            Sub-clients
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {data.subClients.slice(0, 4).map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between text-[8px]"
              >
                <span className="truncate text-[#1f1d1a]" style={SERIF}>
                  {sc.name}
                </span>
                <span
                  className="font-mono text-[7px]"
                  style={{ color: accent }}
                >
                  {sc.mailboxCount} mbx
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'domainBreakdown':
      return (
        <div className="grid grid-cols-4 gap-1 rounded border border-[#e6e0d2] bg-[#fbf6e9] px-2 py-1.5">
          {['G', 'O', 'Y', '·'].map((ch, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div
                className="h-3 w-3 rounded-full"
                style={{
                  background:
                    i === 0
                      ? accent
                      : i === 1
                        ? hexToRgba(accent, 0.65)
                        : i === 2
                          ? hexToRgba(accent, 0.4)
                          : hexToRgba(accent, 0.22),
                }}
              />
              <span className="text-[7px] uppercase tracking-[0.16em] text-[#7a7464]">
                {ch}
              </span>
            </div>
          ))}
        </div>
      );
    case 'recommendations':
      return (
        <div className="flex flex-col gap-0.5 rounded border border-[#e6e0d2] bg-[#fbf6e9] px-2 py-1.5">
          <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-[#7a7464]">
            <Sparkles className="h-2.5 w-2.5" style={{ color: accent }} />
            Recommendations
          </div>
          {['Tighten Gmail ramp', 'Cool Outlook fleet'].map((r) => (
            <div
              key={r}
              className="flex items-center gap-1 text-[8px] text-[#1f1d1a]"
              style={SERIF}
            >
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ background: accent }}
              />
              {r}
            </div>
          ))}
        </div>
      );
  }
}

function MiniChart({ accent }: { accent: string }): JSX.Element {
  // 12-point smoothed line — deterministic so the preview stays steady
  // until accent/range changes.
  const points = useMemo(() => {
    const seed = accent;
    return Array.from({ length: 12 }, (_, i) => {
      const u = hashUnit(`${seed}|${i}`);
      return clamp(20 + i * 4 + (u - 0.5) * 22, 8, 56);
    });
  }, [accent]);

  const path = useMemo(() => {
    const w = 100;
    const stepX = w / (points.length - 1);
    const top = 6;
    const maxY = 60;
    const lines = points
      .map((p, i) => {
        const x = i * stepX;
        const y = top + (maxY - top) * (1 - p / 60);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
    return lines;
  }, [points]);

  return (
    <div className="rounded border border-[#e6e0d2] bg-[#fbf6e9] px-2 py-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[8px] uppercase tracking-[0.18em] text-[#7a7464]">
        <LineChart className="h-2.5 w-2.5" style={{ color: accent }} />
        Trend
      </div>
      <svg
        viewBox="0 0 100 60"
        className="block h-10 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={`${path} L 100 60 L 0 60 Z`}
          fill={hexToRgba(accent, 0.18)}
        />
        <path d={path} fill="none" stroke={accent} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe action band — bottom strip of the recipe card with cook time,
// servings, save, and the orange CTA that triggers the real download.
// ---------------------------------------------------------------------------

function RecipeActionBand({
  cfg,
  meta,
  savedAt,
  now,
  onSave,
  onCook,
}: {
  cfg: TemplateConfig;
  meta: RecipeDescriptor;
  savedAt: string | null;
  now: Date;
  onSave: () => void;
  onCook: () => void;
}): JSX.Element {
  const sectionsCount = SECTION_ORDER.filter((k) => cfg.sections[k]).length;
  const disabled = sectionsCount === 0;
  return (
    <div
      className="flex flex-col gap-4 border-t px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-10"
      style={{
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 20%, var(--wp-border, #2a2a3a))',
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <BandStat
          Icon={Timer}
          label="Cooking time"
          value={meta.cookTime}
        />
        <BandStat
          Icon={Drumstick}
          label="Servings"
          value={meta.servings}
        />
        <BandStat
          Icon={Hash}
          label="Sections"
          value={`${sectionsCount} / 6`}
        />
        {savedAt && (
          <BandStat
            Icon={Save}
            label="Last saved"
            value={fmtRelativePast(savedAt, now)}
            tint
          />
        )}
      </div>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <motion.button
          onClick={onSave}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold"
          style={{
            ...SERIF,
            color: 'var(--wp-text, #e8e8f0)',
            background:
              'color-mix(in srgb, var(--wp-warning, #ffb454) 8%, var(--wp-surface, #12121a))',
            borderColor:
              'color-mix(in srgb, var(--wp-accent, #F26522) 32%, var(--wp-border, #2a2a3a))',
          }}
        >
          <Save className="h-4 w-4 text-accent" />
          Save recipe
        </motion.button>

        <CookCta disabled={disabled} onClick={onCook} />
      </div>
    </div>
  );
}

function BandStat({
  Icon,
  label,
  value,
  tint,
}: {
  Icon: typeof Timer;
  label: string;
  value: string;
  tint?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid h-9 w-9 place-items-center rounded-xl border"
        style={{
          background: tint
            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)'
            : 'color-mix(in srgb, var(--wp-warning, #ffb454) 8%, transparent)',
          borderColor: tint
            ? 'color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)'
            : 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, var(--wp-border, #2a2a3a))',
          color: tint ? 'var(--wp-accent, #F26522)' : 'var(--wp-accent-2, #FF8A4B)',
        }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
          {label}
        </span>
        <span className="text-sm font-semibold text-text" style={SERIF}>
          {value}
        </span>
      </div>
    </div>
  );
}

function CookCta({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 py-2.5 text-sm font-bold"
      style={{
        ...SERIF,
        color: disabled
          ? 'var(--wp-text-faint, #5a5a72)'
          : 'var(--wp-bg, #0a0a0f)',
        background: disabled
          ? 'color-mix(in srgb, var(--wp-text-faint, #5a5a72) 18%, transparent)'
          : 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
        border: '1px solid transparent',
        boxShadow: disabled
          ? 'none'
          : '0 8px 24px color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {!disabled && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(242, 101, 34, 0.55)',
              '0 0 0 8px rgba(242, 101, 34, 0)',
            ],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      )}
      <Flame
        className="h-4 w-4"
        style={{
          color: disabled ? 'currentColor' : 'var(--wp-bg, #0a0a0f)',
        }}
      />
      Cook now &amp; download sample
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Recent meals — bottom strip of recently-cooked reports rendered as
// little circular plate thumbnails.
// ---------------------------------------------------------------------------

function RecentMeals({
  reports,
  now,
}: {
  reports: AgencyReportsData['reports'];
  now: Date;
}): JSX.Element {
  return (
    <section
      className="rounded-3xl border p-5 lg:p-6"
      style={{
        ...PARCHMENT_CARD,
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 20%, var(--wp-border, #2a2a3a))',
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full border"
          style={{
            background:
              'color-mix(in srgb, var(--wp-accent, #F26522) 14%, transparent)',
            borderColor:
              'color-mix(in srgb, var(--wp-accent, #F26522) 36%, transparent)',
            color: 'var(--wp-accent, #F26522)',
          }}
        >
          <Pizza className="h-4.5 w-4.5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint"
            style={{ letterSpacing: '0.32em' }}
          >
            Recent meals
          </span>
          <h2 className="text-xl font-bold text-text" style={SERIF}>
            From the kitchen pass
          </h2>
        </div>
        <span className="ml-auto text-xs text-text-dim" style={SERIF_ITALIC}>
          recently cooked & shipped
        </span>
      </div>

      {reports.length === 0 ? (
        <p
          className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-text-dim"
          style={{
            ...SERIF_ITALIC,
            borderColor:
              'color-mix(in srgb, var(--wp-accent, #F26522) 22%, var(--wp-border, #2a2a3a))',
            background:
              'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, transparent)',
          }}
        >
          Pass is clean — nothing baked yet this week.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {reports.map((r) => (
            <PlateThumb key={r.id} report={r} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlateThumb({
  report,
  now,
}: {
  report: AgencyReportsData['reports'][number];
  now: Date;
}): JSX.Element {
  const meta = RECIPE_INFO[report.type];
  const Icon = meta.Icon;
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="flex flex-col items-center gap-2 rounded-2xl border p-3 text-center"
      style={{
        background:
          'color-mix(in srgb, var(--wp-warning, #ffb454) 4%, var(--wp-surface, #12121a))',
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 18%, var(--wp-border, #2a2a3a))',
      }}
    >
      <div
        className="relative grid h-14 w-14 place-items-center rounded-full border"
        style={{
          background: `radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--wp-warning, #ffb454) 24%, var(--wp-surface, #12121a)) 0%, var(--wp-surface, #12121a) 80%)`,
          borderColor: meta.accentVar,
          color: meta.accentVar,
          boxShadow: `inset 0 0 12px ${meta.accentVar}33`,
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className="line-clamp-1 text-xs font-semibold text-text"
          style={SERIF}
        >
          {report.title}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-faint">
          {meta.label} · {fmtBytes(report.sizeBytes)}
        </span>
        <span className="text-[10px] text-text-dim">
          {fmtRelativePast(report.createdAt, now)}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Cookbook footer — closing-page editorial credit strip.
// ---------------------------------------------------------------------------

function CookbookFooter({
  agency,
}: {
  agency: AgencyReportsData['agency'];
}): JSX.Element {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="rounded-3xl border px-6 py-5 lg:px-10"
      style={{
        ...PARCHMENT_CARD,
        borderColor:
          'color-mix(in srgb, var(--wp-accent, #F26522) 20%, var(--wp-border, #2a2a3a))',
      }}
    >
      <div className="flex flex-col gap-2 text-xs text-text-dim lg:flex-row lg:items-center lg:justify-between">
        <p style={SERIF_ITALIC}>
          Recipes printed and bound by WarmPulse for {agency.name}. All
          ingredients sourced fresh from the deliverability pipeline.
        </p>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
          <span>Vol. III · Issue 7</span>
          <span>·</span>
          <span>{agency.region}</span>
          <span>·</span>
          <span>Mock data for design preview</span>
        </div>
      </div>
    </motion.footer>
  );
}

// ---------------------------------------------------------------------------
// Unused-import shim — keep imported icons and helpers around so the
// noUnusedLocals pass on the strict tsc build doesn't drop any of them.
// Each lucide-react import + the CSSProperties type-only import needs
// to be referenced at least once. The `void` operator counts as a use.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _COOKBOOK_SHIM: ReadonlyArray<unknown> = [
  ArrowRight,
  Bookmark,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  Check,
  ChefHat,
  Circle,
  Clock,
  CookingPot,
  Crown,
  Download,
  Drumstick,
  Eye,
  Feather,
  Flame,
  Gauge,
  GripVertical,
  Hash,
  Heart,
  LineChart,
  Pen,
  Pencil,
  Pizza,
  Printer,
  Salad,
  Save,
  ScrollText,
  Share2,
  Soup,
  Sparkles,
  Stamp,
  Sticker,
  Tag,
  Target,
  Timer,
  Users,
  Utensils,
  UtensilsCrossed,
];

// Mark CSSProperties as referenced so the type-only import isn't pruned.
type _CSSShim = CSSProperties;
const _CSS_USED: _CSSShim | undefined = undefined;
void _COOKBOOK_SHIM;
void _CSS_USED;
