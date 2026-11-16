import { BarChart3, Crown, Sparkles, Target, type LucideIcon } from 'lucide-react';

export type ReportType = 'warmth' | 'engagement' | 'placement' | 'white_label';
export type ReportFormat = 'pdf' | 'csv';
export type ReportFrequency = 'once' | 'weekly' | 'monthly';

export const REPORT_TYPE_META: Record<ReportType, { label: string; tone: 'violet' | 'cyan' | 'green' | 'yellow'; Icon: LucideIcon }> = {
  warmth: { label: 'Warmth', tone: 'violet', Icon: Sparkles },
  engagement: { label: 'Engagement', tone: 'cyan', Icon: BarChart3 },
  placement: { label: 'Placement', tone: 'green', Icon: Target },
  white_label: { label: 'White-label', tone: 'yellow', Icon: Crown },
};

export interface DemoReport {
  id: string;
  type: ReportType;
  format: ReportFormat;
  title: string;
  range: string;
  createdAt: string;       // ISO
  sizeKb: number;
  pages?: number;
  recipientCount?: number; // for scheduled, how many emails it goes to
  scheduled?: ReportFrequency;
  highlight: { label: string; value: string };
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const DEMO_REPORTS: DemoReport[] = [
  { id: 'r1',  type: 'warmth',      format: 'pdf', title: 'Warmth · weekly digest',       range: 'May 7 → May 14', createdAt: daysAgo(0),  sizeKb: 184, pages: 6, scheduled: 'weekly',  highlight: { label: 'Avg warmth', value: '78/100' } },
  { id: 'r2',  type: 'engagement',  format: 'pdf', title: 'Engagement breakdown',         range: 'May 7 → May 14', createdAt: daysAgo(0),  sizeKb: 212, pages: 8, scheduled: 'weekly',  highlight: { label: 'Open rate', value: '62%' } },
  { id: 'r3',  type: 'placement',   format: 'csv', title: 'Placement export · all boxes', range: 'May 1 → May 14', createdAt: daysAgo(1),  sizeKb: 94,           highlight: { label: 'Inbox', value: '87%' } },
  { id: 'r4',  type: 'white_label', format: 'pdf', title: 'White-label · Acme Co.',       range: 'Apr 14 → May 14', createdAt: daysAgo(1),  sizeKb: 322, pages: 12, scheduled: 'monthly', recipientCount: 3, highlight: { label: 'Mailboxes', value: '5' } },
  { id: 'r5',  type: 'warmth',      format: 'pdf', title: 'Warmth · weekly digest',       range: 'Apr 30 → May 7', createdAt: daysAgo(7),  sizeKb: 178, pages: 6, scheduled: 'weekly',  highlight: { label: 'Avg warmth', value: '72/100' } },
  { id: 'r6',  type: 'engagement',  format: 'pdf', title: 'Engagement breakdown',         range: 'Apr 30 → May 7', createdAt: daysAgo(7),  sizeKb: 198, pages: 8, scheduled: 'weekly',  highlight: { label: 'Open rate', value: '58%' } },
  { id: 'r7',  type: 'placement',   format: 'pdf', title: 'Placement test results',        range: 'Apr 25 → May 2', createdAt: daysAgo(10), sizeKb: 156, pages: 5,                       highlight: { label: 'Inbox', value: '84%' } },
  { id: 'r8',  type: 'warmth',      format: 'csv', title: 'Daily warmth export',          range: 'Apr 1 → Apr 30', createdAt: daysAgo(14), sizeKb: 312,                                  highlight: { label: 'Rows', value: '150' } },
  { id: 'r9',  type: 'warmth',      format: 'pdf', title: 'Warmth · weekly digest',       range: 'Apr 16 → Apr 23', createdAt: daysAgo(21), sizeKb: 165, pages: 6, scheduled: 'weekly',  highlight: { label: 'Avg warmth', value: '64/100' } },
  { id: 'r10', type: 'engagement',  format: 'pdf', title: 'Engagement breakdown',         range: 'Apr 16 → Apr 23', createdAt: daysAgo(21), sizeKb: 188, pages: 8, scheduled: 'weekly',  highlight: { label: 'Open rate', value: '54%' } },
  { id: 'r11', type: 'white_label', format: 'pdf', title: 'White-label · Acme Co.',       range: 'Mar 14 → Apr 14', createdAt: daysAgo(31), sizeKb: 296, pages: 11, scheduled: 'monthly', recipientCount: 3, highlight: { label: 'Mailboxes', value: '4' } },
  { id: 'r12', type: 'placement',   format: 'csv', title: 'Placement export · all boxes', range: 'Mar 1 → Mar 31', createdAt: daysAgo(45), sizeKb: 88,                                   highlight: { label: 'Inbox', value: '79%' } },
];

export interface ScheduledReport {
  id: string;
  type: ReportType;
  frequency: 'weekly' | 'monthly';
  recipients: string[];
  nextRun: string; // ISO
  lastRun: string; // ISO
}

export const DEMO_SCHEDULED: ScheduledReport[] = [
  { id: 's1', type: 'warmth',     frequency: 'weekly',  recipients: ['alex@acme.com'],                                  nextRun: daysAgo(-7), lastRun: daysAgo(0) },
  { id: 's2', type: 'engagement', frequency: 'weekly',  recipients: ['alex@acme.com', 'casey@acme.com'],                nextRun: daysAgo(-7), lastRun: daysAgo(0) },
  { id: 's3', type: 'white_label',frequency: 'monthly', recipients: ['alex@acme.com', 'partner@acmegroup.com', 'cs@acmegroup.com'], nextRun: daysAgo(-29), lastRun: daysAgo(1) },
];

export const TONE_HEX: Record<'violet' | 'cyan' | 'green' | 'yellow', string> = {
  violet: 'rgb(242, 101, 34)',
  cyan: 'rgb(255, 138, 75)',
  green: 'rgb(61, 220, 151)',
  yellow: 'rgb(255, 180, 84)',
};

export function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function aggregate() {
  return {
    total: DEMO_REPORTS.length,
    pdf: DEMO_REPORTS.filter((r) => r.format === 'pdf').length,
    csv: DEMO_REPORTS.filter((r) => r.format === 'csv').length,
    scheduled: DEMO_SCHEDULED.length,
    sizeKb: DEMO_REPORTS.reduce((s, r) => s + r.sizeKb, 0),
    last30: DEMO_REPORTS.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 30 * 86_400_000).length,
  };
}
