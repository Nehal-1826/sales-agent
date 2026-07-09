/**
 * Demo data for Pro Tools picker.
 *
 * Pro has all 5 tools unlocked (no Pro-locked tools, unlike Starter).
 */
import { Eye, FileEdit, Pencil, ShieldCheck, Target, type LucideIcon } from 'lucide-react';

export type ToolStatus = 'ok' | 'warn' | 'err' | 'info';

export interface ToolDef {
  key: 'dns' | 'preview' | 'templates' | 'placement' | 'spam';
  name: string;
  short: string;
  desc: string;
  Icon: LucideIcon;
  tone: 'violet' | 'cyan' | 'green' | 'yellow' | 'pink';
  // Latest run summary
  lastRunRel: string; // "12m ago"
  statusLabel: string;
  status: ToolStatus;
  // 7-day usage trend (runs per day)
  trend7d: number[];
  // Aggregate stats
  totalRuns: number;
  successRate: number; // 0-100
  // Tool-specific highlight metric
  highlight: { label: string; value: string };
}

export const TOOLS: ToolDef[] = [
  {
    key: 'dns',
    name: 'DNS Check',
    short: 'DNS',
    desc: 'SPF, DKIM, DMARC validation for sender domain.',
    Icon: ShieldCheck,
    tone: 'violet',
    lastRunRel: '4m ago',
    statusLabel: '12/15 valid',
    status: 'warn',
    trend7d: [3, 4, 2, 5, 6, 4, 5],
    totalRuns: 142,
    successRate: 87,
    highlight: { label: 'Valid records', value: '12 / 15' },
  },
  {
    key: 'preview',
    name: 'Warmup Preview',
    short: 'PRV',
    desc: 'Generate sample messages without sending anything.',
    Icon: Eye,
    tone: 'cyan',
    lastRunRel: '38m ago',
    statusLabel: '5 samples',
    status: 'info',
    trend7d: [2, 3, 1, 4, 3, 5, 4],
    totalRuns: 87,
    successRate: 100,
    highlight: { label: 'Last sample', value: 'casey@ · A · 5' },
  },
  {
    key: 'templates',
    name: 'Template Designer',
    short: 'TPL',
    desc: 'Author, edit, and preview warmup message templates.',
    Icon: FileEdit,
    tone: 'green',
    lastRunRel: '2h ago',
    statusLabel: '12 templates',
    status: 'ok',
    trend7d: [1, 2, 3, 2, 4, 3, 2],
    totalRuns: 56,
    successRate: 98,
    highlight: { label: 'Latest', value: '"Q3 outbound" · alex@' },
  },
  {
    key: 'placement',
    name: 'Placement Tester',
    short: 'PLM',
    desc: 'Seed test inboxes across Gmail / Outlook / Yahoo and report placement.',
    Icon: Target,
    tone: 'yellow',
    lastRunRel: '1d ago',
    statusLabel: '87% inbox',
    status: 'ok',
    trend7d: [1, 0, 2, 1, 3, 2, 1],
    totalRuns: 23,
    successRate: 91,
    highlight: { label: 'Last result', value: '87% inbox · alex@' },
  },
  {
    key: 'spam',
    name: 'Spam Scanner',
    short: 'SPM',
    desc: 'SpamAssassin-style content scoring with trigger explanations.',
    Icon: Pencil,
    tone: 'pink',
    lastRunRel: '3d ago',
    statusLabel: 'Score 2.3/10',
    status: 'warn',
    trend7d: [0, 1, 1, 2, 1, 0, 1],
    totalRuns: 18,
    successRate: 78,
    highlight: { label: 'Latest score', value: '2.3 / 10 · casey@' },
  },
];

export interface ToolRun {
  id: string;
  toolKey: ToolDef['key'];
  ts: string;
  mailbox: string;
  status: ToolStatus;
  result: string;
  detail?: string;
}

function relMin(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

export const TOOL_RUNS: ToolRun[] = [
  { id: 'tr1',  toolKey: 'dns',       ts: relMin(4),    mailbox: 'alex@acme.com',  status: 'ok',   result: '3/3 records valid', detail: 'SPF · DKIM · DMARC all green' },
  { id: 'tr2',  toolKey: 'preview',   ts: relMin(38),   mailbox: 'casey@acme.com', status: 'info', result: '5 samples generated', detail: 'Mode A · transactional' },
  { id: 'tr3',  toolKey: 'dns',       ts: relMin(72),   mailbox: 'bryan@acme.com', status: 'warn', result: 'DMARC missing', detail: 'SPF and DKIM valid · publish DMARC TXT' },
  { id: 'tr4',  toolKey: 'templates', ts: relMin(124),  mailbox: 'alex@acme.com',  status: 'ok',   result: 'Saved "Q3 outbound"', detail: 'Mode B · styled HTML' },
  { id: 'tr5',  toolKey: 'spam',      ts: relMin(186),  mailbox: 'casey@acme.com', status: 'warn', result: 'Score 2.3 / 10', detail: '2 minor triggers · "guarantee", caps' },
  { id: 'tr6',  toolKey: 'placement', ts: relMin(240),  mailbox: 'alex@acme.com',  status: 'ok',   result: '87% inbox', detail: 'Gmail 92 · Outlook 85 · Yahoo 82' },
  { id: 'tr7',  toolKey: 'dns',       ts: relMin(312),  mailbox: 'dana@acme.com',  status: 'err',  result: 'DKIM + DMARC missing', detail: 'Only SPF valid · domain unprotected' },
  { id: 'tr8',  toolKey: 'preview',   ts: relMin(386),  mailbox: 'eli@acme.com',   status: 'info', result: '3 samples generated', detail: 'Mode C · reply thread' },
  { id: 'tr9',  toolKey: 'templates', ts: relMin(450),  mailbox: 'casey@acme.com', status: 'ok',   result: 'Generated via LLM', detail: 'Gemini · "Reply to demo request"' },
  { id: 'tr10', toolKey: 'placement', ts: relMin(540),  mailbox: 'bryan@acme.com', status: 'warn', result: '72% inbox', detail: 'Promotions 21% · investigate subject lines' },
  { id: 'tr11', toolKey: 'dns',       ts: relMin(660),  mailbox: 'eli@acme.com',   status: 'ok',   result: '3/3 records valid', detail: 'Yahoo · all clean' },
  { id: 'tr12', toolKey: 'spam',      ts: relMin(780),  mailbox: 'alex@acme.com',  status: 'ok',   result: 'Score 0.8 / 10', detail: 'No major triggers' },
];

export const TONE_HEX: Record<ToolDef['tone'], string> = {
  violet: 'rgb(242, 101, 34)',
  cyan: 'rgb(255, 138, 75)',
  green: 'rgb(61, 220, 151)',
  yellow: 'rgb(255, 180, 84)',
  pink: 'rgb(255, 92, 122)',
};
