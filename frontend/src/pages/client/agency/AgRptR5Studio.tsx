import { useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Globe2,
  HelpCircle,
  Image as ImageIcon,
  LayoutTemplate,
  Layers,
  Lightbulb,
  ListChecks,
  Mail,
  Palette,
  PieChart,
  Plus,
  Save,
  Settings2,
  Sigma,
  Sparkles,
  Stamp,
  Target,
  Type,
  Users,
} from 'lucide-react';

import { toast } from '@/components/ui/AppToast';
import { formatNumber, formatDate } from '@/lib/format';
import type {
  AgencyReportsData,
  ReportType,
} from '@/pages/client/agency/AgRptR1Magazine';

/**
 * AgRptR5Studio — Agency-tier REPORTS surface, design candidate R5,
 * "Notion-style Template Studio".
 *
 * Where R1–R4 leaned into editorial / magazine identities for the
 * reports archive itself, R5 attacks a different axis of the problem:
 * the AGENCY OWNS THEIR TEMPLATES. This surface is a clean, modern
 * template-design tool inspired by Notion / Linear / Coda. The agency
 * picks one of FOUR report types (warmth, engagement, placement,
 * white-label), tweaks the controls, sees a live PDF-preview canvas
 * update in real time, then either Saves the template or Downloads a
 * sample CSV with realistic mock rows.
 *
 * The sample download is FUNCTIONAL — it builds a CSV blob client-side
 * via `URL.createObjectURL` and a synthetic `<a download>` click, with
 * no external library. Each report type produces a CSV with columns
 * tailored to its shape (warmth → 30-day score ladder; engagement →
 * funnel rates; placement → inbox/spam/promo split; white-label →
 * executive summary stats).
 *
 * Fully STANDALONE — no network, router, query hooks, or required
 * props. Inline MOCK supplies every field. The future adapter passes
 * `data` once the reports endpoint exists. Strict orange-only palette,
 * with the user-configurable accent color exempted from that rule (it's
 * whatever swatch / hex the user picks for THEIR template).
 *
 * NOT a card grid, NOT a magazine, NOT a workshop floor — the editor /
 * preview-canvas pair is the differentiator.
 */

// ---------------------------------------------------------------------------
// Local mock — Northwind Agency, drawn to match the R1 source-of-truth
// shape so the file stays prop-less and the same data flavour reads
// across the R-set comparison.
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
    id: 'rpt-r5-1',
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
    coverHeadline: 'Placement wins the quarter',
    coverPullQuote:
      'Northwind portfolio gained 4.2 pts of average inbox placement.',
  },
  {
    id: 'rpt-r5-2',
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
    coverHeadline: 'Helix turns the corner',
    coverPullQuote: '12 mailboxes climb past warmth 80 for the first time.',
  },
  {
    id: 'rpt-r5-3',
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
    coverHeadline: 'Replies up 28%',
    coverPullQuote: 'Reply velocity outperformed forecast by a full week.',
  },
  {
    id: 'rpt-r5-4',
    title: 'Nimbus White-label Digest',
    type: 'white_label',
    format: 'pdf',
    status: 'generating',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    createdAt: '2026-10-12T07:55:00Z',
    rangeLabel: 'Last 14 days',
    sizeBytes: 0,
    downloadCount: 0,
    coverHeadline: 'Nimbus in brief',
    coverPullQuote: 'Custom-branded summary cut for the Nimbus partnership team.',
  },
  {
    id: 'rpt-r5-5',
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
    coverHeadline: 'Inbox holds the line',
    coverPullQuote: 'Quasar maintained 84.7% Gmail inboxing through a soft DKIM flap.',
  },
  {
    id: 'rpt-r5-6',
    title: 'Vega Engagement Dossier',
    type: 'engagement',
    format: 'pdf',
    status: 'queued',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    createdAt: '2026-10-12T06:00:00Z',
    rangeLabel: 'Last 30 days',
    sizeBytes: 0,
    downloadCount: 0,
    coverHeadline: 'Vega, warming',
    coverPullQuote: 'A long, patient ramp — replies cresting the 6% mark.',
  },
  {
    id: 'rpt-r5-7',
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
    coverHeadline: 'Studio quiet',
    coverPullQuote: 'Most stable reputation curve on the roster this month.',
  },
  {
    id: 'rpt-r5-8',
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
    coverHeadline: 'Forge finds its groove',
    coverPullQuote: 'Pixel Forge graduates two new sub-domains into the rotation.',
  },
];

const SCHEDULED: AgencyReportsData['scheduled'] = [
  {
    id: 'sch-r5-1',
    title: 'Weekly Portfolio Digest',
    type: 'placement',
    cadence: 'weekly',
    nextRunAt: '2026-10-19T08:00:00Z',
    subClientIds: SUB_CLIENTS.map((s) => s.id),
    recipientCount: 6,
  },
  {
    id: 'sch-r5-2',
    title: 'Helix Daily Warmth',
    type: 'warmth',
    cadence: 'daily',
    nextRunAt: '2026-10-13T07:00:00Z',
    subClientIds: ['sc-helix'],
    recipientCount: 2,
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

/**
 * Empty-state skeleton — used by the future live adapter when the API
 * has not loaded yet so the studio mounts on a blank canvas instead of
 * mock rows the user might mistake for their own.
 */
export const AGENCY_REPORTS_SKELETON_R5: AgencyReportsData = {
  agency: { name: 'Your agency', region: 'us-east-1' },
  subClients: [],
  reports: [],
  scheduled: [],
  summary: {
    reportsThisMonth: 0,
    reportsTotal: 0,
    downloadsThisMonth: 0,
    scheduledActive: 0,
  },
};

// ---------------------------------------------------------------------------
// Template config — the editable shape stored locally via useState. The
// `accentColor` field is the EXCEPTION to the orange-only rule: it's
// whatever swatch / hex the user picks for their template. Everything
// else in the chrome uses the platform orange palette via CSS vars.
// ---------------------------------------------------------------------------

interface TemplateConfig {
  type: 'warmth' | 'engagement' | 'placement' | 'white_label';
  title: string;
  accentColor: string; // hex
  headerText: string;
  footerText: string;
  sections: {
    summary: boolean;
    kpiBand: boolean;
    chart: boolean;
    perSubClientTable: boolean;
    domainBreakdown: boolean;
    recommendations: boolean;
  };
  brandLogo: 'agency' | 'whitelabel' | 'none';
  dateRange: '7d' | '30d' | '90d' | 'quarter';
}

const DEFAULT_TEMPLATES: Record<TemplateConfig['type'], TemplateConfig> = {
  warmth: {
    type: 'warmth',
    title: 'Warmth Report',
    accentColor: '#F26522',
    headerText: 'Weekly Warmth Snapshot',
    footerText: 'Powered by WarmPulse · Confidential',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: false,
      recommendations: true,
    },
    brandLogo: 'agency',
    dateRange: '30d',
  },
  engagement: {
    type: 'engagement',
    title: 'Engagement Report',
    accentColor: '#FF8A4B',
    headerText: 'Engagement Funnel · Weekly',
    footerText: 'Powered by WarmPulse · Confidential',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: true,
      recommendations: true,
    },
    brandLogo: 'agency',
    dateRange: '7d',
  },
  placement: {
    type: 'placement',
    title: 'Placement Report',
    accentColor: '#FF9670',
    headerText: 'Inbox Placement Brief',
    footerText: 'Powered by WarmPulse · Confidential',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: true,
      domainBreakdown: true,
      recommendations: false,
    },
    brandLogo: 'agency',
    dateRange: '30d',
  },
  white_label: {
    type: 'white_label',
    title: 'White-label Executive Summary',
    accentColor: '#FFB890',
    headerText: '[Client Name] · Quarterly Brief',
    footerText: '',
    sections: {
      summary: true,
      kpiBand: true,
      chart: true,
      perSubClientTable: false,
      domainBreakdown: false,
      recommendations: true,
    },
    brandLogo: 'whitelabel',
    dateRange: 'quarter',
  },
};

// ---------------------------------------------------------------------------
// Per-report-type metadata — labels, icons, colour swatches for the
// gallery cards and editor chips. Note: the chip colour uses the
// platform orange palette; the user's CHOSEN accent (see
// `accentColor` above) is rendered separately as a coloured swatch on
// the gallery card.
// ---------------------------------------------------------------------------

const TYPE_META: Record<
  TemplateConfig['type'],
  {
    label: string;
    eyebrow: string;
    blurb: string;
    Icon: typeof BarChart3;
  }
> = {
  warmth: {
    label: 'Warmth',
    eyebrow: 'WARMTH',
    blurb: 'Daily reputation ladder + 30-day score trajectory.',
    Icon: Flame,
  },
  engagement: {
    label: 'Engagement',
    eyebrow: 'ENGAGEMENT',
    blurb: 'Funnel: sent → opened → replied → starred.',
    Icon: BarChart3,
  },
  placement: {
    label: 'Placement',
    eyebrow: 'PLACEMENT',
    blurb: 'Inbox / Spam / Promotions across Gmail, Outlook, Yahoo.',
    Icon: Target,
  },
  white_label: {
    label: 'White-label',
    eyebrow: 'WHITE-LABEL',
    blurb: 'Branded executive brief for a single sub-client.',
    Icon: Stamp,
  },
};

const SECTION_META: Array<{
  key: keyof TemplateConfig['sections'];
  label: string;
  hint: string;
  Icon: typeof BarChart3;
}> = [
  { key: 'summary', label: 'Executive summary', hint: 'Opening narrative paragraph.', Icon: Sparkles },
  { key: 'kpiBand', label: 'KPI band', hint: 'Headline numbers strip near the top.', Icon: Sigma },
  { key: 'chart', label: 'Primary chart', hint: 'Main trend visualisation.', Icon: BarChart3 },
  { key: 'perSubClientTable', label: 'Per sub-client table', hint: 'One row per portfolio account.', Icon: Users },
  { key: 'domainBreakdown', label: 'Domain breakdown', hint: 'Gmail / Outlook / Yahoo split.', Icon: Globe2 },
  { key: 'recommendations', label: 'Recommendations', hint: 'Closing actionable bullets.', Icon: Lightbulb },
];

// Swatches the user can pick from for the template accent. Six warm
// tones — orange family + a couple of close neighbours (amber, gold,
// peach). Hex values are CHOSEN by the user so they're not subject to
// the no-cyan / no-violet rule (the rule is about the chrome, not the
// user's preview).
const SWATCH_OPTIONS = [
  '#F26522', // Shailog coral
  '#FF8A4B', // accent-2
  '#FF9670', // accent-3
  '#FFB890', // accent-4 / peach
  '#ffd54f', // amber
  '#E04E15', // deep coral
] as const;

const DATE_RANGE_OPTIONS: Array<{
  key: TemplateConfig['dateRange'];
  label: string;
}> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'quarter', label: 'This quarter' },
];

// ---------------------------------------------------------------------------
// Mock data used by both the preview canvas AND the CSV sample download
// — keeping a single source means the sample matches what the user sees
// in the preview, which is the whole point of "download sample" as a
// trust-building feature.
// ---------------------------------------------------------------------------

interface SampleRow {
  domain: string;
  subClient: string;
  /** Per-day score 1..30 for the warmth template (smoothed ladder). */
  ladder: number[];
  /** Closing score. */
  currentScore: number;
  /** 7-day delta. */
  delta: number;
  /** Funnel — sent / opened / replied / starred. */
  funnel: {
    sent: number;
    opened: number;
    replied: number;
    starred: number;
  };
  /** Placement split (sums to 100). */
  placement: { inbox: number; spam: number; promotions: number };
  /** Provider split for placement reports. */
  providerPlacement: {
    gmail: { inbox: number; spam: number; promotions: number };
    outlook: { inbox: number; spam: number; promotions: number };
    yahoo: { inbox: number; spam: number; promotions: number };
  };
}

/**
 * Build 36 deterministic sample rows. Realistic-looking numbers — no
 * `Math.random()` in render because it would make the live preview jitter
 * and the CSV column values disagree with what's on screen.
 */
function buildSampleRows(): SampleRow[] {
  const seeds = [
    { sub: 'Helix Outreach', domains: ['helix.com', 'go.helix.com', 'mail.helix.com'] },
    { sub: 'Nimbus Cloud', domains: ['nimbuscloud.io', 'go.nimbuscloud.io', 'team.nimbuscloud.io'] },
    { sub: 'Orion Sales', domains: ['orionsales.com', 'mail.orionsales.com', 'reach.orionsales.com'] },
    { sub: 'Vega Outbound', domains: ['vegaoutbound.io', 'hi.vegaoutbound.io'] },
    { sub: 'Quasar Growth', domains: ['quasargrowth.com', 'team.quasargrowth.com', 'go.quasargrowth.com'] },
    { sub: 'Lyra Studio', domains: ['lyrastudio.co', 'mail.lyrastudio.co'] },
    { sub: 'Pixel Forge', domains: ['pixelforge.io', 'hi.pixelforge.io'] },
  ];

  const rows: SampleRow[] = [];
  let i = 0;
  for (const seed of seeds) {
    for (const domain of seed.domains) {
      const phase = (i * 13 + 7) % 17;
      const base = 56 + ((i * 11) % 32);
      const slope = 0.55 + ((i % 5) * 0.18);
      const ladder = Array.from({ length: 30 }, (_, day) => {
        const wave = Math.sin((day + phase) * 0.32) * 4;
        const drift = Math.cos((day + phase) * 0.14) * 2.5;
        const score = Math.max(
          1,
          Math.min(100, Math.round(base + slope * day + wave + drift)),
        );
        return score;
      });
      const currentScore = ladder[ladder.length - 1] ?? base;
      const delta = currentScore - (ladder[ladder.length - 8] ?? base);
      const sent = 480 + ((i * 47) % 320);
      const opened = Math.round(sent * (0.42 + ((i % 7) * 0.022)));
      const replied = Math.round(opened * (0.18 + ((i % 5) * 0.014)));
      const starred = Math.round(replied * (0.31 + ((i % 4) * 0.025)));
      const inbox = 70 + ((i * 3) % 22);
      const spam = Math.max(1, 12 - ((i * 2) % 9));
      const promotions = Math.max(1, 100 - inbox - spam);
      rows.push({
        domain,
        subClient: seed.sub,
        ladder,
        currentScore,
        delta,
        funnel: { sent, opened, replied, starred },
        placement: { inbox, spam, promotions },
        providerPlacement: {
          gmail: {
            inbox: Math.min(100, inbox + 2),
            spam,
            promotions: Math.max(1, 100 - Math.min(100, inbox + 2) - spam),
          },
          outlook: {
            inbox: Math.max(1, inbox - 5),
            spam: Math.min(99, spam + 2),
            promotions: Math.max(
              1,
              100 - Math.max(1, inbox - 5) - Math.min(99, spam + 2),
            ),
          },
          yahoo: {
            inbox: Math.max(1, inbox - 3),
            spam: Math.min(99, spam + 1),
            promotions: Math.max(
              1,
              100 - Math.max(1, inbox - 3) - Math.min(99, spam + 1),
            ),
          },
        },
      });
      i += 1;
    }
  }
  return rows;
}

const SAMPLE_ROWS: SampleRow[] = buildSampleRows();

// ---------------------------------------------------------------------------
// CSV builder — pure helper, no external lib. Tailors columns to the
// report type so the sample looks like a real export.
// ---------------------------------------------------------------------------

/** Escape a single CSV cell — wraps in quotes if needed, doubles quotes. */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells: Array<string | number>): string {
  return cells.map(csvCell).join(',');
}

/**
 * Build a CSV blob whose columns are tailored to the report type. Each
 * template emits a different schema so the sample matches the preview.
 */
function buildSampleCsv(
  template: TemplateConfig,
  rows: SampleRow[],
): Blob {
  const lines: string[] = [];

  // A small metadata header so the file is self-documenting when the
  // recipient opens it in Excel.
  lines.push(`# ${template.title}`);
  lines.push(`# ${template.headerText}`);
  lines.push(`# Date range: ${template.dateRange}`);
  lines.push(
    `# Generated: ${new Date().toISOString().slice(0, 10)} (sample export)`,
  );
  lines.push('');

  if (template.type === 'warmth') {
    const dayHeaders = Array.from({ length: 30 }, (_, i) => `day_${i + 1}`);
    lines.push(
      csvLine([
        'sub_client',
        'domain',
        ...dayHeaders,
        'current_score',
        'delta_7d',
      ]),
    );
    for (const row of rows) {
      lines.push(
        csvLine([
          row.subClient,
          row.domain,
          ...row.ladder,
          row.currentScore,
          row.delta,
        ]),
      );
    }
  } else if (template.type === 'engagement') {
    lines.push(
      csvLine([
        'sub_client',
        'domain',
        'sent',
        'opened',
        'replied',
        'starred',
        'open_rate_pct',
        'reply_rate_pct',
        'star_rate_pct',
      ]),
    );
    for (const row of rows) {
      const f = row.funnel;
      const openRate = ((f.opened / Math.max(1, f.sent)) * 100).toFixed(1);
      const replyRate = ((f.replied / Math.max(1, f.sent)) * 100).toFixed(1);
      const starRate = ((f.starred / Math.max(1, f.sent)) * 100).toFixed(1);
      lines.push(
        csvLine([
          row.subClient,
          row.domain,
          f.sent,
          f.opened,
          f.replied,
          f.starred,
          openRate,
          replyRate,
          starRate,
        ]),
      );
    }
  } else if (template.type === 'placement') {
    lines.push(
      csvLine([
        'sub_client',
        'domain',
        'inbox_pct',
        'spam_pct',
        'promotions_pct',
        'gmail_inbox_pct',
        'gmail_spam_pct',
        'outlook_inbox_pct',
        'outlook_spam_pct',
        'yahoo_inbox_pct',
        'yahoo_spam_pct',
      ]),
    );
    for (const row of rows) {
      const p = row.placement;
      const pp = row.providerPlacement;
      lines.push(
        csvLine([
          row.subClient,
          row.domain,
          p.inbox,
          p.spam,
          p.promotions,
          pp.gmail.inbox,
          pp.gmail.spam,
          pp.outlook.inbox,
          pp.outlook.spam,
          pp.yahoo.inbox,
          pp.yahoo.spam,
        ]),
      );
    }
  } else {
    // white_label — executive summary stats, fewer rows per sub-client.
    const bySub = new Map<string, SampleRow[]>();
    for (const row of rows) {
      const arr = bySub.get(row.subClient) ?? [];
      arr.push(row);
      bySub.set(row.subClient, arr);
    }
    lines.push(
      csvLine([
        'sub_client',
        'domains_covered',
        'avg_warmth_score',
        'avg_inbox_pct',
        'avg_open_rate_pct',
        'avg_reply_rate_pct',
        'period_delta',
        'recommendation',
      ]),
    );
    const recommendations = [
      'Maintain current cadence.',
      'Add 2 mailboxes next cycle.',
      'Pause Gmail sub-domain for 48h.',
      'Promote to next ramp band.',
      'Investigate spam-folder uptick.',
      'Schedule monthly briefing.',
      'Expand peer pool by 20%.',
    ];
    let recIndex = 0;
    for (const [sub, group] of bySub.entries()) {
      const avgScore = Math.round(
        group.reduce((acc, r) => acc + r.currentScore, 0) / group.length,
      );
      const avgInbox = Math.round(
        group.reduce((acc, r) => acc + r.placement.inbox, 0) / group.length,
      );
      const avgOpen = (
        group.reduce(
          (acc, r) => acc + (r.funnel.opened / Math.max(1, r.funnel.sent)) * 100,
          0,
        ) / group.length
      ).toFixed(1);
      const avgReply = (
        group.reduce(
          (acc, r) =>
            acc + (r.funnel.replied / Math.max(1, r.funnel.sent)) * 100,
          0,
        ) / group.length
      ).toFixed(1);
      const periodDelta = Math.round(
        group.reduce((acc, r) => acc + r.delta, 0) / group.length,
      );
      const rec = recommendations[recIndex % recommendations.length] ?? '';
      recIndex += 1;
      lines.push(
        csvLine([
          sub,
          group.length,
          avgScore,
          avgInbox,
          avgOpen,
          avgReply,
          periodDelta,
          rec,
        ]),
      );
    }
  }

  // Trailing newline — Excel and Google Sheets both expect it.
  lines.push('');

  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/**
 * Trigger an actual browser file download for the CSV. Uses the
 * synthetic `<a download>` + `URL.createObjectURL` pattern, with no
 * external library. Side-effect only — no return.
 */
function downloadSample(template: TemplateConfig, agencyName: string): void {
  const blob = buildSampleCsv(template, SAMPLE_ROWS);
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const safeAgency = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `${safeAgency}-${template.type}-sample-${today}.csv`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers refuse to fire `click()` unless the element is in the
  // DOM (notably Firefox prior to 102), so append → click → remove.
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Small format helpers
// ---------------------------------------------------------------------------

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatDate(d);
}

function relativeFromNow(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'recently';
  const diffMs = now.getTime() - t;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtCount(n: number): string {
  return formatNumber(n);
}

function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/**
 * Map a ReportType (used by the parent shape) onto a TemplateConfig
 * type. They're equivalent at the type level but kept narrow so we
 * never bleed config keys back into the report shape.
 */
function reportTypeToTemplate(t: ReportType): TemplateConfig['type'] {
  return t;
}

/** Convert hex → rgba string with the given alpha (0..1). Tolerates
 * 3-char shorthand. Used by the preview canvas to paint header bands /
 * KPI cards with a tinted version of the user's accent colour. */
function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

// ---------------------------------------------------------------------------
// Notion-paper / control card styling
// ---------------------------------------------------------------------------

const PAPER_FONT: CSSProperties = {
  fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
};

const PAPER_SHADOW: CSSProperties = {
  boxShadow:
    '0 0 0 1px rgba(255,255,255,0.04), 0 18px 48px -16px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.18)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRptR5Studio(
  { data }: { data?: AgencyReportsData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  // The studio runs in two view modes: the gallery (default) and the
  // editor. Picking a card on the gallery → editor; the "Back" link in
  // the editor returns to the gallery. We keep the editor's edits in a
  // map keyed by type so flipping between templates without saving
  // doesn't drop unsaved tweaks for the other three.
  const [view, setView] = useState<'gallery' | 'editor'>('gallery');
  const [activeType, setActiveType] = useState<TemplateConfig['type']>('warmth');
  const [templates, setTemplates] = useState<
    Record<TemplateConfig['type'], TemplateConfig>
  >(() => ({ ...DEFAULT_TEMPLATES }));
  // Per-template `lastEditedAt` — set when the user saves a template.
  const [lastEdited, setLastEdited] = useState<
    Record<TemplateConfig['type'], string | null>
  >(() => ({
    warmth: '2026-10-11T11:24:00Z',
    engagement: '2026-10-10T09:08:00Z',
    placement: '2026-10-08T16:42:00Z',
    white_label: '2026-09-30T13:50:00Z',
  }));

  const activeTemplate = templates[activeType];

  // The recent-reports footer always sorts by createdAt desc and shows
  // the most recent 6 entries — a quiet reminder of what the studio
  // has produced lately.
  const recentReports = useMemo(() => {
    return [...d.reports]
      .sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      })
      .slice(0, 6);
  }, [d.reports]);

  function openEditor(type: TemplateConfig['type']): void {
    setActiveType(type);
    setView('editor');
  }

  function closeEditor(): void {
    setView('gallery');
  }

  function updateTemplate(
    type: TemplateConfig['type'],
    patch: Partial<TemplateConfig>,
  ): void {
    setTemplates((prev) => {
      const current = prev[type];
      return { ...prev, [type]: { ...current, ...patch } };
    });
  }

  function updateSection(
    type: TemplateConfig['type'],
    key: keyof TemplateConfig['sections'],
    value: boolean,
  ): void {
    setTemplates((prev) => {
      const current = prev[type];
      return {
        ...prev,
        [type]: {
          ...current,
          sections: { ...current.sections, [key]: value },
        },
      };
    });
  }

  function handleSave(type: TemplateConfig['type']): void {
    const now = new Date().toISOString();
    setLastEdited((prev) => ({ ...prev, [type]: now }));
    toast.success('Template saved');
  }

  function handleDownload(template: TemplateConfig): void {
    try {
      downloadSample(template, d.agency.name);
      toast.success('Sample downloaded');
    } catch (err) {
      // Defensive — the blob/createObjectURL path is well-supported but
      // if a hardened browser blocks programmatic downloads we want a
      // visible failure rather than a silent no-op.
      console.error('Sample download failed', err);
      toast.error('Sample download blocked by browser');
    }
  }

  return (
    <div
      className="min-h-screen bg-bg text-text"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(242,101,34,0.05), transparent 70%)',
      }}
    >
      <div className="mx-auto w-full max-w-[1380px] px-6 py-10 sm:px-8 lg:px-10">
        <StudioHeader
          agencyName={d.agency.name}
          templateCount={Object.keys(templates).length}
        />

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {view === 'gallery' ? (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="mt-8"
              >
                <TemplateGallery
                  templates={templates}
                  lastEdited={lastEdited}
                  onOpen={openEditor}
                  onDownload={handleDownload}
                />
              </motion.div>
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="mt-8"
              >
                <TemplateEditor
                  template={activeTemplate}
                  agencyName={d.agency.name}
                  onPatch={(patch) => updateTemplate(activeType, patch)}
                  onToggleSection={(key, value) =>
                    updateSection(activeType, key, value)
                  }
                  onBack={closeEditor}
                  onSave={() => handleSave(activeType)}
                  onDownload={() => handleDownload(activeTemplate)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>

        <RecentReportsFooter
          reports={recentReports}
          onDownload={(reportId) => {
            // The footer download button reuses the active template's CSV
            // shape — a quick way to grab a sample of the same type as
            // the past report without leaving the page.
            const target = recentReports.find((r) => r.id === reportId);
            if (!target) {
              toast.error('Report not found');
              return;
            }
            const cfg = templates[reportTypeToTemplate(target.type)];
            try {
              downloadSample(cfg, d.agency.name);
              toast.success('Sample downloaded');
            } catch (err) {
              console.error('Footer sample download failed', err);
              toast.error('Sample download blocked by browser');
            }
          }}
        />
      </div>
    </div>
  );
}

export default AgRptR5Studio;

// ---------------------------------------------------------------------------
// Studio header band — agency name, template count chip, decorative
// "+ New template" + "Help" buttons.
// ---------------------------------------------------------------------------

interface StudioHeaderProps {
  agencyName: string;
  templateCount: number;
}

function StudioHeader({
  agencyName,
  templateCount,
}: StudioHeaderProps): JSX.Element {
  return (
    <header
      className="rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-sm"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px -12px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(242,101,34,0.22), rgba(255,138,75,0.06))',
              border: '1px solid rgba(242,101,34,0.4)',
            }}
          >
            <LayoutTemplate
              className="h-6 w-6 text-accent"
              strokeWidth={1.7}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
              <Building2 className="h-3 w-3" aria-hidden />
              <span>{agencyName}</span>
              <span aria-hidden>·</span>
              <span>Reports</span>
            </div>
            <h1
              className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-text sm:text-3xl"
              style={PAPER_FONT}
            >
              Report Templates
            </h1>
            <p className="mt-1 text-sm text-text-dim">
              Design how every export looks. Edit four templates, see the
              preview update live, and download a real sample of the data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-accent"
            aria-label={`${templateCount} templates available`}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {templateCount} templates
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/15"
            onClick={() =>
              toast.success('New blank template (coming soon)', {
                description: 'Custom templates ship next milestone.',
              })
            }
          >
            <Plus className="h-4 w-4" aria-hidden /> New template
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-1.5 text-sm font-medium text-text-dim transition hover:bg-surface-2 hover:text-text"
            onClick={() =>
              toast.success('Studio help', {
                description:
                  'Edit a template, watch the right pane update, then download a sample to verify columns.',
              })
            }
          >
            <HelpCircle className="h-4 w-4" aria-hidden /> Help
          </button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Template gallery — 4 cards in a responsive grid. Hover lift + layout
// transition into the editor via shared layoutId.
// ---------------------------------------------------------------------------

interface TemplateGalleryProps {
  templates: Record<TemplateConfig['type'], TemplateConfig>;
  lastEdited: Record<TemplateConfig['type'], string | null>;
  onOpen: (type: TemplateConfig['type']) => void;
  onDownload: (template: TemplateConfig) => void;
}

function TemplateGallery({
  templates,
  lastEdited,
  onOpen,
  onDownload,
}: TemplateGalleryProps): JSX.Element {
  const order: Array<TemplateConfig['type']> = [
    'warmth',
    'engagement',
    'placement',
    'white_label',
  ];

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-text-faint">
          <Layers className="h-3 w-3" aria-hidden />
          <span>Template gallery</span>
        </div>
        <span className="text-xs text-text-dim">
          Click a card to edit · sample download generates instantly
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {order.map((type) => (
          <GalleryCard
            key={type}
            template={templates[type]}
            lastEditedAt={lastEdited[type]}
            onOpen={() => onOpen(type)}
            onDownload={() => onDownload(templates[type])}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One gallery card — illustration top, title middle, two CTAs bottom.
// ---------------------------------------------------------------------------

interface GalleryCardProps {
  template: TemplateConfig;
  lastEditedAt: string | null;
  onOpen: () => void;
  onDownload: () => void;
}

function GalleryCard({
  template,
  lastEditedAt,
  onOpen,
  onDownload,
}: GalleryCardProps): JSX.Element {
  const meta = TYPE_META[template.type];
  const Icon = meta.Icon;

  return (
    <motion.article
      layoutId={`template-card-${template.type}`}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface text-left"
      style={{
        ...PAPER_SHADOW,
      }}
    >
      <motion.div
        layoutId={`template-illustration-${template.type}`}
        className="relative h-44 w-full overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(template.accentColor, 0.18)}, ${hexToRgba(template.accentColor, 0.04)})`,
        }}
      >
        <TemplateIllustration type={template.type} color={template.accentColor} />
        <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border-muted/70 bg-bg/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-text">
          <Icon
            className="h-3 w-3"
            aria-hidden
            style={{ color: template.accentColor }}
          />
          {meta.eyebrow}
        </div>
        <span
          className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-muted/70 bg-bg/70"
          aria-hidden
          title={`Accent: ${template.accentColor}`}
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: template.accentColor }}
          />
        </span>
      </motion.div>

      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div>
          <h3
            className="text-lg font-semibold leading-tight tracking-tight text-text"
            style={PAPER_FONT}
          >
            {template.title}
          </h3>
          <p className="mt-1 text-xs text-text-dim">{meta.blurb}</p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {lastEditedAt
              ? `Edited ${relativeFromNow(lastEditedAt)}`
              : 'Never edited'}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <Settings2 className="h-3 w-3" aria-hidden />
            {Object.values(template.sections).filter(Boolean).length}/6 sections
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
          >
            <Settings2 className="h-4 w-4" aria-hidden /> Edit template
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-2 text-sm font-medium text-text-dim transition hover:bg-surface-2 hover:text-text"
            title="Download a CSV sample with realistic rows"
          >
            <Download className="h-4 w-4" aria-hidden /> Sample
          </button>
        </div>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Per-type SVG illustration — spark (warmth), bars (engagement), inbox
// stack (placement), monogram crest (white-label). Kept tiny but each is
// visually distinct so the 4 cards read at a glance.
// ---------------------------------------------------------------------------

function TemplateIllustration({
  type,
  color,
}: {
  type: TemplateConfig['type'];
  color: string;
}): JSX.Element {
  if (type === 'warmth') {
    return (
      <svg
        viewBox="0 0 360 176"
        className="absolute inset-0 h-full w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="warmthSpark" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.0" />
            <stop offset="100%" stopColor={color} stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="warmthArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,90 240,55 C280,25 320,45 360,30 L360,176 L0,176 Z"
          fill="url(#warmthArea)"
        />
        <path
          d="M0,140 C40,120 80,150 120,110 C160,75 200,90 240,55 C280,25 320,45 360,30"
          stroke="url(#warmthSpark)"
          strokeWidth="2.5"
          fill="none"
        />
        {[20, 60, 100, 160, 220, 280, 340].map((cx, i) => (
          <circle
            key={cx}
            cx={cx}
            cy={[135, 130, 130, 105, 88, 60, 36][i]}
            r="3"
            fill={color}
            opacity="0.85"
          />
        ))}
      </svg>
    );
  }

  if (type === 'engagement') {
    const bars = [38, 58, 46, 92, 70, 110, 88, 130, 108, 150, 124];
    return (
      <svg
        viewBox="0 0 360 176"
        className="absolute inset-0 h-full w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="engBar" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {bars.map((h, i) => {
          const x = 20 + i * 30;
          const y = 156 - h;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width="18"
              height={h}
              rx="3"
              fill="url(#engBar)"
            />
          );
        })}
        <line
          x1="0"
          y1="156"
          x2="360"
          y2="156"
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (type === 'placement') {
    return (
      <svg
        viewBox="0 0 360 176"
        className="absolute inset-0 h-full w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="plcEnv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const offset = i * 12;
          return (
            <g key={i} transform={`translate(${60 + offset}, ${30 + offset})`}>
              <rect
                width="220"
                height="100"
                rx="10"
                fill="url(#plcEnv)"
                opacity={1 - i * 0.18}
              />
              <path
                d="M0,0 L110,60 L220,0"
                stroke={color}
                strokeWidth="1.5"
                fill="none"
                opacity="0.5"
              />
            </g>
          );
        })}
        <circle cx="300" cy="32" r="14" fill={color} opacity="0.85" />
        <text
          x="300"
          y="36"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill="#0a0a0f"
        >
          %
        </text>
      </svg>
    );
  }

  // white_label monogram crest
  return (
    <svg
      viewBox="0 0 360 176"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="wlCrest" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <g transform="translate(180, 88)">
        <path
          d="M0,-58 L60,-30 L60,30 L0,58 L-60,30 L-60,-30 Z"
          fill="url(#wlCrest)"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.6"
        />
        <text
          x="0"
          y="8"
          textAnchor="middle"
          fontSize="36"
          fontWeight="700"
          fill="#0a0a0f"
          style={{ fontFamily: "'Outfit', serif", letterSpacing: '-0.04em' }}
        >
          N
        </text>
      </g>
      <text
        x="180"
        y="160"
        textAnchor="middle"
        fontSize="10"
        fill={color}
        opacity="0.75"
        style={{
          fontFamily: "'Outfit', system-ui, sans-serif",
          letterSpacing: '0.3em',
        }}
      >
        EST · NORTHWIND
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Template editor — 2 panes: controls on the left, live preview canvas
// on the right. Shared layoutId on the illustration so it animates from
// the gallery card into the editor preview header on open.
// ---------------------------------------------------------------------------

interface TemplateEditorProps {
  template: TemplateConfig;
  agencyName: string;
  onPatch: (patch: Partial<TemplateConfig>) => void;
  onToggleSection: (
    key: keyof TemplateConfig['sections'],
    value: boolean,
  ) => void;
  onBack: () => void;
  onSave: () => void;
  onDownload: () => void;
}

function TemplateEditor({
  template,
  agencyName,
  onPatch,
  onToggleSection,
  onBack,
  onSave,
  onDownload,
}: TemplateEditorProps): JSX.Element {
  const meta = TYPE_META[template.type];

  return (
    <motion.div
      layoutId={`template-card-${template.type}`}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface"
      style={PAPER_SHADOW}
    >
      <div className="flex flex-col lg:flex-row">
        {/* LEFT — controls */}
        <div className="flex w-full shrink-0 flex-col gap-4 border-b border-border-muted bg-surface-2/30 px-5 py-5 lg:max-w-[380px] lg:border-b-0 lg:border-r">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border-muted/70 bg-surface px-2 py-1 text-xs font-medium text-text-dim transition hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to gallery
          </button>

          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-text-faint">
              <meta.Icon className="h-3 w-3" aria-hidden />
              <span>Editing · {meta.eyebrow}</span>
            </div>
            <p className="mt-1 text-xs text-text-dim">{meta.blurb}</p>
          </div>

          {/* Sections */}
          <ControlGroup
            icon={<Type className="h-3.5 w-3.5" aria-hidden />}
            title="Identity"
          >
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
                Template title
              </span>
              <input
                value={template.title}
                onChange={(e) => onPatch({ title: e.target.value })}
                className="mt-1 w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
                Accent color
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {SWATCH_OPTIONS.map((swatch) => (
                  <SwatchButton
                    key={swatch}
                    color={swatch}
                    selected={
                      template.accentColor.toLowerCase() === swatch.toLowerCase()
                    }
                    onClick={() => onPatch({ accentColor: swatch })}
                  />
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface px-2 py-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
                    Hex
                  </span>
                  <input
                    type="text"
                    maxLength={7}
                    value={template.accentColor}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      // Accept anything starting with # — preview tolerates
                      // partials with the hexToRgba fallback.
                      onPatch({ accentColor: v.startsWith('#') ? v : `#${v}` });
                    }}
                    className="w-20 bg-transparent text-xs text-text outline-none"
                  />
                </label>
              </div>
            </div>
          </ControlGroup>

          <ControlGroup
            icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
            title="Sections"
            initiallyOpen
          >
            <div className="flex flex-col gap-1">
              {SECTION_META.map((section) => {
                const SIcon = section.Icon;
                const value = template.sections[section.key];
                return (
                  <ToggleRow
                    key={section.key}
                    icon={<SIcon className="h-3.5 w-3.5" aria-hidden />}
                    label={section.label}
                    hint={section.hint}
                    value={value}
                    onChange={(v) => onToggleSection(section.key, v)}
                  />
                );
              })}
            </div>
          </ControlGroup>

          <ControlGroup
            icon={<Palette className="h-3.5 w-3.5" aria-hidden />}
            title="Branding"
          >
            <RadioGroup
              value={template.brandLogo}
              onChange={(v) =>
                onPatch({ brandLogo: v as TemplateConfig['brandLogo'] })
              }
              options={[
                {
                  value: 'agency',
                  label: 'Agency logo',
                  hint: 'Show Northwind branding.',
                },
                {
                  value: 'whitelabel',
                  label: 'White-label',
                  hint: 'Client logo, no WarmPulse mark.',
                },
                { value: 'none', label: 'No logo', hint: 'Text-only header.' },
              ]}
            />
          </ControlGroup>

          <ControlGroup
            icon={<Type className="h-3.5 w-3.5" aria-hidden />}
            title="Header & footer"
          >
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
                Header text
              </span>
              <input
                value={template.headerText}
                onChange={(e) => onPatch({ headerText: e.target.value })}
                className="mt-1 w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/30"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-faint">
                Footer text
              </span>
              <input
                value={template.footerText}
                onChange={(e) => onPatch({ footerText: e.target.value })}
                placeholder="Leave blank to hide the footer"
                className="mt-1 w-full rounded-md border border-border-muted bg-surface px-3 py-2 text-sm text-text outline-none transition placeholder:text-text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/30"
              />
            </label>
          </ControlGroup>

          <ControlGroup
            icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
            title="Date range"
          >
            <PillToggleGroup
              options={DATE_RANGE_OPTIONS}
              value={template.dateRange}
              onChange={(v) => onPatch({ dateRange: v })}
            />
          </ControlGroup>

          {/* Sticky footer with the two primary actions. */}
          <div className="sticky bottom-0 -mx-5 mt-auto flex items-center justify-between gap-2 border-t border-border-muted bg-surface-2/80 px-5 py-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface px-3 py-2 text-xs font-medium text-text-dim transition hover:bg-surface-2 hover:text-text"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface px-3 py-2 text-xs font-medium text-text-dim transition hover:bg-surface-2 hover:text-text"
                title="Generate a CSV sample with realistic mock data"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Sample
              </button>
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/15 px-3 py-2 text-xs font-medium text-accent transition hover:bg-accent/20"
              >
                <Save className="h-3.5 w-3.5" aria-hidden /> Save template
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — live preview canvas */}
        <div className="relative min-h-[640px] flex-1 bg-bg/60 p-6 sm:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at top, rgba(242,101,34,0.05), transparent 60%)',
            }}
            aria-hidden
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={JSON.stringify(template)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative"
            >
              <PreviewCanvas template={template} agencyName={agencyName} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Control group — collapsible, Notion-flavoured chevron toggle. The
// chevron rotates 90deg when closed via inline transform.
// ---------------------------------------------------------------------------

interface ControlGroupProps {
  icon: JSX.Element;
  title: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}

function ControlGroup({
  icon,
  title,
  initiallyOpen = true,
  children,
}: ControlGroupProps): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="rounded-lg border border-border-muted/60 bg-surface/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-text-dim transition hover:text-text"
      >
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em]">
          <span className="text-accent" aria-hidden>
            {icon}
          </span>
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-border-muted/60 px-3 py-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swatch button
// ---------------------------------------------------------------------------

function SwatchButton({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={color}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
      style={{
        background: color,
        borderColor: selected ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.2)',
        boxShadow: selected
          ? `0 0 0 2px ${color}, 0 0 0 4px rgba(255,255,255,0.15)`
          : 'inset 0 1px 0 rgba(255,255,255,0.15)',
      }}
    >
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center text-bg">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="h-4 w-4"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toggle row — labeled switch. Orange when on, neutral when off.
// ---------------------------------------------------------------------------

function ToggleRow({
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: JSX.Element;
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-surface-2/60"
      aria-pressed={value}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span
          className={`mt-0.5 ${value ? 'text-accent' : 'text-text-faint'}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-text">{label}</span>
          <span className="truncate text-[11px] text-text-faint">{hint}</span>
        </span>
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${value ? 'border-accent/50 bg-accent/35' : 'border-border-muted bg-surface-2'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`inline-block h-3.5 w-3.5 rounded-full ${value ? 'bg-accent' : 'bg-text-faint'}`}
          style={{
            transform: value ? 'translateX(18px)' : 'translateX(3px)',
          }}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Radio group
// ---------------------------------------------------------------------------

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; hint: string }>;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-left transition ${selected ? 'border-accent/40 bg-accent/10' : 'border-border-muted bg-surface hover:bg-surface-2/60'}`}
            aria-pressed={selected}
          >
            <span
              className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-accent' : 'border-border-muted'}`}
              aria-hidden
            >
              {selected && (
                <span className="h-2 w-2 rounded-full bg-accent" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-text">{opt.label}</span>
              <span className="text-[11px] text-text-faint">{opt.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pill toggle group — date range
// ---------------------------------------------------------------------------

function PillToggleGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: TemplateConfig['dateRange']; label: string }>;
  value: TemplateConfig['dateRange'];
  onChange: (v: TemplateConfig['dateRange']) => void;
}): JSX.Element {
  return (
    <div className="inline-flex flex-wrap gap-1.5 rounded-md border border-border-muted bg-surface p-1">
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition ${selected ? 'text-accent' : 'text-text-dim hover:text-text'}`}
            aria-pressed={selected}
          >
            {selected && (
              <motion.span
                layoutId="daterange-pill"
                className="absolute inset-0 -z-0 rounded-md border border-accent/40 bg-accent/15"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview canvas — realistic PDF-paper preview. Tinted header band uses
// the user's chosen accent colour. Sections render or hide based on the
// toggle state — the whole point is that the user SEES the consequences
// of their toggles before they save.
// ---------------------------------------------------------------------------

interface PreviewCanvasProps {
  template: TemplateConfig;
  agencyName: string;
}

function PreviewCanvas({ template, agencyName }: PreviewCanvasProps): JSX.Element {
  // Use the first 6 sample rows for the preview table — full 36 ship in
  // the CSV but rendering everything on screen blows out the canvas.
  const previewRows = SAMPLE_ROWS.slice(0, 6);

  const accent = template.accentColor;
  const meta = TYPE_META[template.type];

  const dateRangeLabel = DATE_RANGE_OPTIONS.find(
    (r) => r.key === template.dateRange,
  )?.label ?? template.dateRange;

  // Aggregate KPIs from the visible preview rows so they match what the
  // table shows and don't appear to disagree with each other.
  const aggregate = useMemo(() => {
    const sent = previewRows.reduce((acc, r) => acc + r.funnel.sent, 0);
    const opened = previewRows.reduce((acc, r) => acc + r.funnel.opened, 0);
    const replied = previewRows.reduce((acc, r) => acc + r.funnel.replied, 0);
    const inbox = Math.round(
      previewRows.reduce((acc, r) => acc + r.placement.inbox, 0) /
        previewRows.length,
    );
    const avgScore = Math.round(
      previewRows.reduce((acc, r) => acc + r.currentScore, 0) /
        previewRows.length,
    );
    const avgDelta = Math.round(
      previewRows.reduce((acc, r) => acc + r.delta, 0) / previewRows.length,
    );
    return { sent, opened, replied, inbox, avgScore, avgDelta };
  }, [previewRows]);

  return (
    <div
      className="relative mx-auto w-full max-w-[760px] rounded-lg bg-white text-[#1c1c22]"
      style={{
        ...PAPER_FONT,
        boxShadow:
          '0 30px 60px -30px rgba(0,0,0,0.65), 0 8px 20px rgba(0,0,0,0.25)',
      }}
    >
      <div
        className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl opacity-60 blur-xl"
        style={{
          background: `radial-gradient(ellipse at top, ${hexToRgba(accent, 0.2)}, transparent 70%)`,
        }}
        aria-hidden
      />

      {/* Header band — tinted strip with the chosen accent. */}
      <div
        className="rounded-t-lg px-7 pb-6 pt-7"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(accent, 0.92)}, ${hexToRgba(accent, 0.65)})`,
          color: '#fff',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className="font-mono text-[10px] uppercase tracking-[0.32em]"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {meta.eyebrow} · {dateRangeLabel}
            </div>
            <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">
              {template.headerText || template.title}
            </h2>
            <div
              className="mt-1 text-sm"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {template.title}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <BrandMark
              variant={template.brandLogo}
              agencyName={agencyName}
              accent={accent}
            />
          </div>
        </div>
        <div
          className="mt-5 h-1 w-16 rounded-full"
          style={{ background: 'rgba(255,255,255,0.7)' }}
        />
      </div>

      {/* Body — sections rendered conditionally based on the toggles. */}
      <div className="space-y-6 px-7 pb-7 pt-6">
        {template.sections.summary && (
          <PreviewSummary template={template} aggregate={aggregate} />
        )}

        {template.sections.kpiBand && (
          <PreviewKpiBand
            accent={accent}
            type={template.type}
            aggregate={aggregate}
          />
        )}

        {template.sections.chart && (
          <PreviewChart accent={accent} type={template.type} rows={previewRows} />
        )}

        {template.sections.perSubClientTable && (
          <PreviewTable accent={accent} type={template.type} rows={previewRows} />
        )}

        {template.sections.domainBreakdown && (
          <PreviewDomainBreakdown accent={accent} rows={previewRows} />
        )}

        {template.sections.recommendations && (
          <PreviewRecommendations accent={accent} type={template.type} />
        )}

        {/* If no section is enabled, show an empty-canvas hint so the
            user understands why the right pane is blank. */}
        {!Object.values(template.sections).some(Boolean) && (
          <div className="rounded-md border border-dashed border-[#d4d4dc] p-8 text-center text-[#888896]">
            <p className="text-sm font-medium">All sections are off.</p>
            <p className="mt-1 text-xs">
              Toggle any section in the left panel to see it appear here.
            </p>
          </div>
        )}
      </div>

      {/* Footer band. */}
      {template.footerText ? (
        <div
          className="rounded-b-lg border-t px-7 py-4 text-center font-mono text-[10px] uppercase tracking-[0.3em]"
          style={{
            background: hexToRgba(accent, 0.05),
            borderColor: hexToRgba(accent, 0.18),
            color: hexToRgba(accent, 0.85),
          }}
        >
          {template.footerText}
        </div>
      ) : (
        <div className="h-4 rounded-b-lg" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand mark in the preview header
// ---------------------------------------------------------------------------

function BrandMark({
  variant,
  agencyName,
  accent,
}: {
  variant: TemplateConfig['brandLogo'];
  agencyName: string;
  accent: string;
}): JSX.Element {
  if (variant === 'none') {
    return <span className="block h-6 w-6" aria-hidden />;
  }
  if (variant === 'whitelabel') {
    return (
      <div className="text-right">
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em]"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          Prepared for
        </div>
        <div
          className="mt-0.5 text-sm font-semibold"
          style={{ color: '#fff' }}
        >
          [Client Name]
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-base font-bold"
        style={{ color: accent }}
      >
        {agencyName.charAt(0)}
      </span>
      <div className="text-left">
        <div
          className="font-mono text-[9px] uppercase tracking-[0.28em]"
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          Agency
        </div>
        <div className="text-xs font-semibold leading-tight text-white">
          {agencyName}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview sub-components — summary / kpi band / chart / table / domain
// breakdown / recommendations
// ---------------------------------------------------------------------------

function PreviewSummary({
  template,
  aggregate,
}: {
  template: TemplateConfig;
  aggregate: {
    sent: number;
    opened: number;
    replied: number;
    inbox: number;
    avgScore: number;
    avgDelta: number;
  };
}): JSX.Element {
  const lines: string[] = [];
  if (template.type === 'warmth') {
    lines.push(
      `Average warmth score landed at ${aggregate.avgScore} this period, a ${aggregate.avgDelta >= 0 ? '+' : ''}${aggregate.avgDelta}-point shift over the prior 7 days.`,
      `Mailboxes are continuing the structured ramp with no spike in bounce or spam complaints.`,
    );
  } else if (template.type === 'engagement') {
    const openRate = (aggregate.opened / Math.max(1, aggregate.sent)) * 100;
    const replyRate = (aggregate.replied / Math.max(1, aggregate.sent)) * 100;
    lines.push(
      `Open rate ${fmtPct(openRate)} across ${fmtCount(aggregate.sent)} sends, with reply velocity at ${fmtPct(replyRate)}.`,
      `Engagement signal is well ahead of forecast in the Orion and Quasar fleets.`,
    );
  } else if (template.type === 'placement') {
    lines.push(
      `Inbox placement averaged ${fmtPct(aggregate.inbox, 0)} across the portfolio.`,
      `Gmail outpaced Outlook on inbox by a small margin; Yahoo remains the variable to watch.`,
    );
  } else {
    lines.push(
      `Quarter-over-quarter, the portfolio held a healthy inbox split and continued to add capacity.`,
      `This brief summarises headline numbers for executive review — full detail is available in the dashboard.`,
    );
  }
  return (
    <section>
      <SectionTitle accent={template.accentColor} icon={<Sparkles className="h-4 w-4" />} title="Executive summary" />
      <div className="space-y-2 text-sm leading-relaxed text-[#3a3a44]">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function PreviewKpiBand({
  accent,
  type,
  aggregate,
}: {
  accent: string;
  type: TemplateConfig['type'];
  aggregate: {
    sent: number;
    opened: number;
    replied: number;
    inbox: number;
    avgScore: number;
    avgDelta: number;
  };
}): JSX.Element {
  let kpis: Array<{ label: string; value: string; sub?: string }> = [];
  if (type === 'warmth') {
    kpis = [
      { label: 'Avg score', value: String(aggregate.avgScore), sub: 'across active mailboxes' },
      {
        label: '7d delta',
        value: `${aggregate.avgDelta >= 0 ? '+' : ''}${aggregate.avgDelta}`,
        sub: 'vs prior week',
      },
      { label: 'Inbox %', value: fmtPct(aggregate.inbox, 0), sub: 'composite' },
      { label: 'Domains', value: String(SAMPLE_ROWS.length), sub: 'covered' },
    ];
  } else if (type === 'engagement') {
    kpis = [
      { label: 'Sent', value: fmtCount(aggregate.sent) },
      {
        label: 'Open rate',
        value: fmtPct((aggregate.opened / Math.max(1, aggregate.sent)) * 100),
      },
      {
        label: 'Reply rate',
        value: fmtPct((aggregate.replied / Math.max(1, aggregate.sent)) * 100),
      },
      { label: 'Replied', value: fmtCount(aggregate.replied) },
    ];
  } else if (type === 'placement') {
    kpis = [
      { label: 'Inbox', value: fmtPct(aggregate.inbox, 0), sub: 'composite' },
      { label: 'Spam', value: fmtPct(100 - aggregate.inbox - 8, 0), sub: 'composite' },
      { label: 'Promotions', value: fmtPct(8, 0), sub: 'composite' },
      { label: 'Domains', value: String(SAMPLE_ROWS.length), sub: 'tested' },
    ];
  } else {
    kpis = [
      { label: 'Score', value: String(aggregate.avgScore), sub: 'portfolio avg' },
      { label: 'Inbox', value: fmtPct(aggregate.inbox, 0), sub: 'placement' },
      { label: 'Sent', value: fmtCount(aggregate.sent), sub: 'period total' },
      { label: 'Δ score', value: `${aggregate.avgDelta >= 0 ? '+' : ''}${aggregate.avgDelta}`, sub: '7d' },
    ];
  }
  return (
    <section>
      <SectionTitle
        accent={accent}
        icon={<Sigma className="h-4 w-4" />}
        title="Headline metrics"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="rounded-md border p-3"
            style={{
              background: hexToRgba(accent, 0.05),
              borderColor: hexToRgba(accent, 0.15),
            }}
          >
            <div
              className="font-mono text-[9px] uppercase tracking-[0.28em]"
              style={{ color: hexToRgba(accent, 0.85) }}
            >
              {kpi.label}
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-[#1c1c22]">
              {kpi.value}
            </div>
            {kpi.sub && (
              <div className="text-[10px] text-[#8a8a96]">{kpi.sub}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewChart({
  accent,
  type,
  rows,
}: {
  accent: string;
  type: TemplateConfig['type'];
  rows: SampleRow[];
}): JSX.Element {
  // Each report type renders a different chart — line for warmth, bars
  // for engagement, stacked for placement, line+dot for white-label.
  return (
    <section>
      <SectionTitle
        accent={accent}
        icon={
          type === 'engagement' ? (
            <BarChart3 className="h-4 w-4" />
          ) : type === 'placement' ? (
            <PieChart className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )
        }
        title={
          type === 'engagement'
            ? 'Engagement by sub-client'
            : type === 'placement'
              ? 'Placement split'
              : 'Score trajectory'
        }
      />
      <div
        className="rounded-md border p-3"
        style={{
          background: '#fafaf8',
          borderColor: hexToRgba(accent, 0.18),
        }}
      >
        {type === 'engagement' ? (
          <BarChartPreview accent={accent} rows={rows} />
        ) : type === 'placement' ? (
          <StackedChartPreview accent={accent} rows={rows} />
        ) : (
          <LadderChartPreview accent={accent} rows={rows} />
        )}
      </div>
    </section>
  );
}

function LadderChartPreview({
  accent,
  rows,
}: {
  accent: string;
  rows: SampleRow[];
}): JSX.Element {
  // Compose all rows' ladders into a single mean ladder so the chart
  // reads as a single trend, not a tangle of overlapping splines.
  const merged = useMemo(() => {
    if (rows.length === 0) return [] as number[];
    const len = rows[0]?.ladder.length ?? 30;
    const out: number[] = [];
    for (let day = 0; day < len; day++) {
      let acc = 0;
      let count = 0;
      for (const row of rows) {
        const v = row.ladder[day];
        if (typeof v === 'number') {
          acc += v;
          count += 1;
        }
      }
      out.push(count > 0 ? acc / count : 0);
    }
    return out;
  }, [rows]);

  const width = 640;
  const height = 180;
  const padding = 24;
  const max = Math.max(...merged, 100);
  const min = Math.min(...merged, 0);
  const path = merged
    .map((v, i) => {
      const x = padding + (i * (width - padding * 2)) / Math.max(1, merged.length - 1);
      const y =
        height - padding - ((v - min) / Math.max(1, max - min)) * (height - padding * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" aria-hidden>
      <defs>
        <linearGradient id="ladderArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={padding}
          y1={padding + t * (height - padding * 2)}
          x2={width - padding}
          y2={padding + t * (height - padding * 2)}
          stroke="#e6e6ec"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="url(#ladderArea)" />
      <path d={path} stroke={accent} strokeWidth="2.2" fill="none" />
      {merged.map((v, i) => {
        if (i % 5 !== 0) return null;
        const x = padding + (i * (width - padding * 2)) / Math.max(1, merged.length - 1);
        const y =
          height - padding - ((v - min) / Math.max(1, max - min)) * (height - padding * 2);
        return (
          <circle key={i} cx={x} cy={y} r="3" fill={accent} />
        );
      })}
    </svg>
  );
}

function BarChartPreview({
  accent,
  rows,
}: {
  accent: string;
  rows: SampleRow[];
}): JSX.Element {
  const width = 640;
  const height = 180;
  const padding = 32;
  const bw = (width - padding * 2) / Math.max(1, rows.length * 3 + (rows.length - 1));
  const max = Math.max(...rows.map((r) => r.funnel.sent), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" aria-hidden>
      <defs>
        <linearGradient id="barSent" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="barOpen" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="barReply" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.8" />
          <stop offset="100%" stopColor={accent} stopOpacity="1" />
        </linearGradient>
      </defs>
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="#e6e6ec"
        strokeWidth="1"
      />
      {rows.map((row, i) => {
        const x = padding + i * (bw * 4 + 6);
        const hSent = ((row.funnel.sent / max) * (height - padding * 2));
        const hOpen = ((row.funnel.opened / max) * (height - padding * 2));
        const hReply = ((row.funnel.replied / max) * (height - padding * 2));
        return (
          <g key={i}>
            <rect
              x={x}
              y={height - padding - hSent}
              width={bw}
              height={hSent}
              rx="2"
              fill="url(#barSent)"
            />
            <rect
              x={x + bw + 2}
              y={height - padding - hOpen}
              width={bw}
              height={hOpen}
              rx="2"
              fill="url(#barOpen)"
            />
            <rect
              x={x + bw * 2 + 4}
              y={height - padding - hReply}
              width={bw}
              height={hReply}
              rx="2"
              fill="url(#barReply)"
            />
            <text
              x={x + bw * 1.5}
              y={height - padding + 12}
              textAnchor="middle"
              fontSize="9"
              fill="#888896"
            >
              {row.subClient.split(' ')[0] ?? ''}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${padding}, 10)`}>
        {[
          { label: 'Sent', fill: 'url(#barSent)' },
          { label: 'Opened', fill: 'url(#barOpen)' },
          { label: 'Replied', fill: 'url(#barReply)' },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${i * 70}, 0)`}>
            <rect width="10" height="10" rx="2" fill={item.fill} />
            <text x="14" y="9" fontSize="9" fill="#666674">
              {item.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function StackedChartPreview({
  accent,
  rows,
}: {
  accent: string;
  rows: SampleRow[];
}): JSX.Element {
  const width = 640;
  const height = 180;
  const padding = 28;
  const bw = (width - padding * 2) / Math.max(1, rows.length) - 8;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" aria-hidden>
      {rows.map((row, i) => {
        const x = padding + i * (bw + 8);
        const total = height - padding * 2;
        const inboxH = (row.placement.inbox / 100) * total;
        const spamH = (row.placement.spam / 100) * total;
        const promoH = (row.placement.promotions / 100) * total;
        const baseY = height - padding;
        return (
          <g key={i}>
            <rect
              x={x}
              y={baseY - inboxH}
              width={bw}
              height={inboxH}
              rx="2"
              fill={accent}
              opacity="0.95"
            />
            <rect
              x={x}
              y={baseY - inboxH - promoH}
              width={bw}
              height={promoH}
              rx="2"
              fill={accent}
              opacity="0.55"
            />
            <rect
              x={x}
              y={baseY - inboxH - promoH - spamH}
              width={bw}
              height={spamH}
              rx="2"
              fill={accent}
              opacity="0.25"
            />
            <text
              x={x + bw / 2}
              y={baseY + 12}
              textAnchor="middle"
              fontSize="9"
              fill="#888896"
            >
              {row.domain.split('.')[0] ?? row.domain}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${padding}, 10)`}>
        {[
          { label: 'Inbox', opacity: 0.95 },
          { label: 'Promotions', opacity: 0.55 },
          { label: 'Spam', opacity: 0.25 },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${i * 72}, 0)`}>
            <rect
              width="10"
              height="10"
              rx="2"
              fill={accent}
              opacity={item.opacity}
            />
            <text x="14" y="9" fontSize="9" fill="#666674">
              {item.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function PreviewTable({
  accent,
  type,
  rows,
}: {
  accent: string;
  type: TemplateConfig['type'];
  rows: SampleRow[];
}): JSX.Element {
  return (
    <section>
      <SectionTitle
        accent={accent}
        icon={<Users className="h-4 w-4" />}
        title={`Per ${type === 'placement' ? 'domain' : 'sub-client'} detail`}
      />
      <div
        className="overflow-hidden rounded-md border"
        style={{
          borderColor: hexToRgba(accent, 0.18),
        }}
      >
        <table className="w-full text-xs">
          <thead
            style={{
              background: hexToRgba(accent, 0.06),
              color: hexToRgba(accent, 0.85),
            }}
          >
            <tr className="text-left">
              <th className="px-3 py-2 font-mono uppercase tracking-[0.2em]">
                {type === 'placement' ? 'Domain' : 'Sub-client'}
              </th>
              {type === 'warmth' && (
                <>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Score
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Δ 7d
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Inbox
                  </th>
                </>
              )}
              {type === 'engagement' && (
                <>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Sent
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Open %
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Reply %
                  </th>
                </>
              )}
              {type === 'placement' && (
                <>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Inbox
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Spam
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Promo
                  </th>
                </>
              )}
              {type === 'white_label' && (
                <>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Score
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Δ 7d
                  </th>
                  <th className="px-3 py-2 text-right font-mono uppercase tracking-[0.2em]">
                    Inbox
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const stripe = i % 2 === 1 ? '#fafaf8' : '#ffffff';
              return (
                <tr key={i} style={{ background: stripe }}>
                  <td className="px-3 py-2 text-[#3a3a44]">
                    {type === 'placement' ? row.domain : row.subClient}
                  </td>
                  {type === 'warmth' && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.currentScore}
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular-nums"
                        style={{
                          color: row.delta >= 0 ? accent : '#b85b3a',
                        }}
                      >
                        {row.delta >= 0 ? '+' : ''}
                        {row.delta}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.placement.inbox}%
                      </td>
                    </>
                  )}
                  {type === 'engagement' && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtCount(row.funnel.sent)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          (row.funnel.opened /
                            Math.max(1, row.funnel.sent)) *
                            100,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          (row.funnel.replied /
                            Math.max(1, row.funnel.sent)) *
                            100,
                        )}
                      </td>
                    </>
                  )}
                  {type === 'placement' && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.placement.inbox}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.placement.spam}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.placement.promotions}%
                      </td>
                    </>
                  )}
                  {type === 'white_label' && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.currentScore}
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular-nums"
                        style={{
                          color: row.delta >= 0 ? accent : '#b85b3a',
                        }}
                      >
                        {row.delta >= 0 ? '+' : ''}
                        {row.delta}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.placement.inbox}%
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PreviewDomainBreakdown({
  accent,
  rows,
}: {
  accent: string;
  rows: SampleRow[];
}): JSX.Element {
  const providers = ['gmail', 'outlook', 'yahoo'] as const;
  // Average per-provider across the visible rows.
  const summary = useMemo(() => {
    const out = providers.map((p) => {
      const inbox = Math.round(
        rows.reduce((acc, r) => acc + r.providerPlacement[p].inbox, 0) /
          Math.max(1, rows.length),
      );
      const spam = Math.round(
        rows.reduce((acc, r) => acc + r.providerPlacement[p].spam, 0) /
          Math.max(1, rows.length),
      );
      return {
        provider: p,
        inbox,
        spam,
        promotions: Math.max(1, 100 - inbox - spam),
      };
    });
    return out;
  }, [rows]);

  return (
    <section>
      <SectionTitle
        accent={accent}
        icon={<Globe2 className="h-4 w-4" />}
        title="Domain breakdown"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {summary.map((p) => (
          <div
            key={p.provider}
            className="rounded-md border p-3"
            style={{
              background: hexToRgba(accent, 0.04),
              borderColor: hexToRgba(accent, 0.18),
            }}
          >
            <div
              className="font-mono text-[9px] uppercase tracking-[0.28em]"
              style={{ color: hexToRgba(accent, 0.85) }}
            >
              {p.provider}
            </div>
            <div className="mt-1 flex items-end gap-1.5 text-lg font-semibold text-[#1c1c22]">
              <span className="tabular-nums">{p.inbox}%</span>
              <span className="text-[10px] font-normal text-[#888896]">
                inbox
              </span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#eaeaea]">
              <span
                style={{ width: `${p.inbox}%`, background: accent }}
              />
              <span
                style={{
                  width: `${p.promotions}%`,
                  background: hexToRgba(accent, 0.4),
                }}
              />
              <span
                style={{
                  width: `${p.spam}%`,
                  background: '#9aa0a6',
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[#8a8a96]">
              <span>{p.inbox}% inbox</span>
              <span>{p.promotions}% promo</span>
              <span>{p.spam}% spam</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewRecommendations({
  accent,
  type,
}: {
  accent: string;
  type: TemplateConfig['type'];
}): JSX.Element {
  const items =
    type === 'warmth'
      ? [
          'Lift the Helix Outreach cohort to the next ramp band (20 → 35 / day).',
          'Investigate the 3-day score drop on the Vega secondary domain.',
          'Schedule a peer-pool refresh for the Pixel Forge sub-domain.',
        ]
      : type === 'engagement'
        ? [
            'Tighten the Orion send window — opens cluster in the 9–11am block.',
            'Audit subject lines on the Quasar fleet; reply rate trails opens.',
            'Promote the Lyra mailboxes to the engagement-tracking cohort.',
          ]
        : type === 'placement'
          ? [
              'Re-run DKIM rotation on the Vega secondary domain.',
              'Validate Microsoft SNDS feedback loops for the Nimbus subdomain.',
              'Soft-pause the Helix Promotions sub-domain for 48h to test the lift.',
            ]
          : [
              'Continue current pacing — the portfolio is comfortably above target.',
              'Schedule a monthly executive call for the Q4 review.',
              'Expand white-label coverage to the Pixel Forge sub-domain.',
            ];

  return (
    <section>
      <SectionTitle
        accent={accent}
        icon={<Lightbulb className="h-4 w-4" />}
        title="Recommendations"
      />
      <ul className="space-y-2 text-sm text-[#3a3a44]">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent }}
              aria-hidden
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({
  accent,
  icon,
  title,
}: {
  accent: string;
  icon: JSX.Element;
  title: string;
}): JSX.Element {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md"
        style={{ background: hexToRgba(accent, 0.12), color: accent }}
        aria-hidden
      >
        {icon}
      </span>
      <h3
        className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#3a3a44]"
        style={{ color: hexToRgba(accent, 0.95) }}
      >
        {title}
      </h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent reports footer — small grid of past reports with download icon
// buttons. Stays visible in both gallery and editor view as a quiet
// reminder of what's been produced lately.
// ---------------------------------------------------------------------------

interface RecentReportsFooterProps {
  reports: AgencyReportsData['reports'];
  onDownload: (reportId: string) => void;
}

function RecentReportsFooter({
  reports,
  onDownload,
}: RecentReportsFooterProps): JSX.Element {
  if (reports.length === 0) {
    return (
      <section className="mt-10">
        <div className="rounded-2xl border border-dashed border-border-muted bg-surface/40 p-6 text-center text-sm text-text-dim">
          No recent reports yet. Save a template to start producing exports.
        </div>
      </section>
    );
  }
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-text-faint">
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          <span>Recent reports</span>
        </div>
        <span className="text-xs text-text-dim">
          Past exports from this studio
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <RecentReportTile
            key={report.id}
            report={report}
            onDownload={() => onDownload(report.id)}
          />
        ))}
      </div>
    </section>
  );
}

function RecentReportTile({
  report,
  onDownload,
}: {
  report: AgencyReportsData['reports'][number];
  onDownload: () => void;
}): JSX.Element {
  const meta = TYPE_META[reportTypeToTemplate(report.type)];
  const Icon = meta.Icon;
  const FormatIcon =
    report.format === 'pdf' ? FileText : FileSpreadsheet;
  return (
    <article
      className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3 transition hover:border-accent/30"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 16px -8px rgba(0,0,0,0.45)',
      }}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: 'rgba(242,101,34,0.10)',
          border: '1px solid rgba(242,101,34,0.25)',
        }}
        aria-hidden
      >
        <Icon className="h-4 w-4 text-accent" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
          <span>{meta.eyebrow}</span>
          <span aria-hidden>·</span>
          <FormatIcon className="h-3 w-3" aria-hidden />
          <span>{report.format.toUpperCase()}</span>
        </div>
        <h4
          className="mt-0.5 truncate text-sm font-medium text-text"
          style={PAPER_FONT}
        >
          {report.title}
        </h4>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-text-dim">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {shortDate(report.createdAt)}
          </span>
          <span aria-hidden>·</span>
          <span>{report.rangeLabel}</span>
          <span aria-hidden>·</span>
          <span>{fmtSize(report.sizeBytes)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-border-muted bg-surface-2/60 p-2 text-text-dim transition hover:bg-surface-2 hover:text-accent"
        title="Download a sample of this report type"
        aria-label={`Download sample for ${report.title}`}
      >
        <Download className="h-4 w-4" aria-hidden />
      </button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Small helper exports that aren't part of the design itself but keep
// the file tree clean — referenced indirectly via the studio.
// ---------------------------------------------------------------------------

// Re-export the few static pieces a parent might want to introspect.
// Kept inside the same file because the R-set siblings prefer
// self-contained candidates over a shared meta module.
export const __AgRptR5StudioInternals = {
  DEFAULT_TEMPLATES,
  SECTION_META,
  SWATCH_OPTIONS,
  buildSampleCsv,
  downloadSample,
  hexToRgba,
};

// Touch unused icon imports so the editor surface can reach for them
// later without re-import dance. Each `void` is a deliberate no-op that
// keeps TS happy under noUnusedLocals.
void Mail;
void ImageIcon;
void ChevronRight;
