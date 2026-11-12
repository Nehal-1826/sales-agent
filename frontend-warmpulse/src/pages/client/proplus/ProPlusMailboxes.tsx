import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  Flame,
  Gauge,
  LayoutGrid,
  Mail,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * ProPlusMailboxes — dense multi-mailbox management for the Pro Plus tier
 * (up to 15 inboxes). A top stat strip, visual filter / sort affordances, and
 * a responsive grid of mailbox cards: provider glyph, email, warmth + delta,
 * ramp day/28, sends today/target, status pill, DNS 3/3 chip and a mini
 * sparkline.
 *
 * Fully STANDALONE — no network, router or query hooks. All numbers come from
 * the inline MOCK const so the preview harness can mount it prop-less. Filters
 * and sort are visual-only (local state); they re-sort/filter MOCK rows but
 * make no requests. Renders just the page content; the app shell supplies the
 * sidebar.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type Status = 'active' | 'warming' | 'paused';

interface MailboxRow {
  id: string;
  email: string;
  provider: Provider;
  warmth: number;
  delta: number;
  day: number;
  sentToday: number;
  target: number;
  status: Status;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  spark: number[];
}

// ---------------------------------------------------------------------------
// Mock data — 12 mailboxes across all providers, varied warmth / status
// ---------------------------------------------------------------------------

function spark(base: number, drift: number): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const v = base - drift + (drift / 13) * i + Math.sin(i * 1.1 + base) * 2.2;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

const MOCK: MailboxRow[] = [
  {
    id: 'mb-1',
    email: 'founder@acme.io',
    provider: 'gmail',
    warmth: 91,
    delta: 1.4,
    day: 28,
    sentToday: 68,
    target: 75,
    status: 'active',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(91, 8),
  },
  {
    id: 'mb-2',
    email: 'sales@acme.io',
    provider: 'outlook',
    warmth: 88,
    delta: 2.2,
    day: 26,
    sentToday: 64,
    target: 70,
    status: 'active',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(88, 10),
  },
  {
    id: 'mb-3',
    email: 'success@acme.io',
    provider: 'gmail',
    warmth: 85,
    delta: 1.9,
    day: 24,
    sentToday: 58,
    target: 65,
    status: 'active',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(85, 9),
  },
  {
    id: 'mb-4',
    email: 'partnerships@acme.io',
    provider: 'outlook',
    warmth: 82,
    delta: 3.1,
    day: 21,
    sentToday: 52,
    target: 60,
    status: 'active',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(82, 12),
  },
  {
    id: 'mb-5',
    email: 'hello@acme.co',
    provider: 'smtp',
    warmth: 79,
    delta: 2.4,
    day: 18,
    sentToday: 44,
    target: 55,
    status: 'warming',
    spf: true,
    dkim: true,
    dmarc: false,
    spark: spark(79, 11),
  },
  {
    id: 'mb-6',
    email: 'support@acme.co',
    provider: 'yahoo',
    warmth: 74,
    delta: 2.0,
    day: 15,
    sentToday: 38,
    target: 50,
    status: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(74, 10),
  },
  {
    id: 'mb-7',
    email: 'growth@acme.io',
    provider: 'gmail',
    warmth: 68,
    delta: -1.2,
    day: 11,
    sentToday: 26,
    target: 40,
    status: 'warming',
    spf: true,
    dkim: false,
    dmarc: true,
    spark: spark(68, -6),
  },
  {
    id: 'mb-8',
    email: 'billing@acme.co',
    provider: 'smtp',
    warmth: 61,
    delta: 2.8,
    day: 7,
    sentToday: 14,
    target: 20,
    status: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(61, 9),
  },
  {
    id: 'mb-9',
    email: 'careers@acme.io',
    provider: 'outlook',
    warmth: 77,
    delta: 1.1,
    day: 16,
    sentToday: 40,
    target: 50,
    status: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(77, 7),
  },
  {
    id: 'mb-10',
    email: 'press@acme.co',
    provider: 'yahoo',
    warmth: 54,
    delta: 3.4,
    day: 5,
    sentToday: 9,
    target: 15,
    status: 'warming',
    spf: true,
    dkim: false,
    dmarc: false,
    spark: spark(54, 11),
  },
  {
    id: 'mb-11',
    email: 'invoices@acme.co',
    provider: 'smtp',
    warmth: 46,
    delta: -2.1,
    day: 3,
    sentToday: 0,
    target: 5,
    status: 'paused',
    spf: false,
    dkim: true,
    dmarc: true,
    spark: spark(46, -4),
  },
  {
    id: 'mb-12',
    email: 'team@acme.io',
    provider: 'gmail',
    warmth: 83,
    delta: 2.0,
    day: 22,
    sentToday: 55,
    target: 60,
    status: 'active',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(83, 9),
  },
];

const MAX_MAILBOXES = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

const STATUS_BADGE: Record<Status, { label: string; variant: 'green' | 'yellow' | 'orange' }> = {
  active: { label: 'Active', variant: 'green' },
  warming: { label: 'Warming', variant: 'yellow' },
  paused: { label: 'Paused', variant: 'orange' },
};

const WARMTH_HEX = { high: '#F26522', mid: '#ffd54f', low: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score >= 75) return WARMTH_HEX.high;
  if (score >= 50) return WARMTH_HEX.mid;
  return WARMTH_HEX.low;
}

type ProviderFilter = 'all' | Provider;
type SortKey = 'warmth' | 'sends' | 'ramp';

const PROVIDER_FILTERS: Array<{ key: ProviderFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'smtp', label: 'SMTP' },
  { key: 'yahoo', label: 'Yahoo' },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'warmth', label: 'Warmth' },
  { key: 'sends', label: 'Sends today' },
  { key: 'ramp', label: 'Build-up day' },
];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusMailboxes(): JSX.Element {
  const [provFilter, setProvFilter] = useState<ProviderFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('warmth');

  const stats = useMemo(() => {
    const warming = MOCK.filter((m) => m.status !== 'paused').length;
    const avg = Math.round(
      MOCK.reduce((a, m) => a + m.warmth, 0) / MOCK.length,
    );
    const sent = MOCK.reduce((a, m) => a + m.sentToday, 0);
    const target = MOCK.reduce((a, m) => a + m.target, 0);
    const dnsHealthy = MOCK.filter((m) => m.spf && m.dkim && m.dmarc).length;
    return { warming, avg, sent, target, dnsHealthy };
  }, []);

  const visible = useMemo(() => {
    const filtered =
      provFilter === 'all'
        ? MOCK
        : MOCK.filter((m) => m.provider === provFilter);
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'sends') return b.sentToday - a.sentToday;
      if (sortKey === 'ramp') return b.day - a.day;
      return b.warmth - a.warmth;
    });
    return sorted;
  }, [provFilter, sortKey]);

  const statCards = [
    {
      key: 'warming',
      label: 'Mailboxes warming',
      value: `${stats.warming}/${MAX_MAILBOXES}`,
      Icon: Flame,
      tone: 'text-accent',
    },
    {
      key: 'avg',
      label: 'Avg warmth',
      value: String(stats.avg),
      Icon: Gauge,
      tone: 'text-accent',
    },
    {
      key: 'sent',
      label: 'Sent today',
      value: `${stats.sent}/${stats.target}`,
      Icon: Send,
      tone: 'text-accent2',
    },
    {
      key: 'dns',
      label: 'Domain records (DNS) healthy',
      value: `${stats.dnsHealthy}/${MOCK.length}`,
      Icon: ShieldCheck,
      tone: 'text-accent4',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Mailboxes
            </h1>
            <Badge variant="orange">{MOCK.length} of {MAX_MAILBOXES}</Badge>
          </div>
          <p className="text-sm text-text-dim">
            Manage and warm up to {MAX_MAILBOXES} mailboxes across Gmail,
            Outlook, Yahoo and custom SMTP.
          </p>
        </div>
        <Button variant="primary">
          <Plus className="h-4 w-4" />
          Add mailbox
        </Button>
      </motion.header>

      {/* Stat strip */}
      <motion.div
        {...fade(0.06)}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {statCards.map((s, i) => (
          <Card key={s.key} className="p-4" noShimmer>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 + i * 0.05 }}
              className="flex items-center gap-3"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 ${s.tone}`}
              >
                <s.Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-text-dim">
                  {s.label}
                </p>
                <p className="text-xl font-semibold tabular-nums text-text">
                  {s.value}
                </p>
              </div>
            </motion.div>
          </Card>
        ))}
      </motion.div>

      {/* Filter / sort toolbar (visual-only) */}
      <motion.div
        {...fade(0.12)}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 p-1 backdrop-blur-xl">
          {PROVIDER_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setProvFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                provFilter === f.key
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-dim hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3 py-1.5 text-xs text-text-dim sm:flex">
            <Search className="h-3.5 w-3.5" />
            <span>Search mailboxes</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 p-1 backdrop-blur-xl">
            <span className="flex items-center gap-1 px-2 text-xs text-text-dim">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Sort
            </span>
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  sortKey === s.key
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-dim hover:text-text'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Mailbox grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((m, i) => (
          <MailboxTile key={m.id} m={m} index={i} />
        ))}
        <AddMailboxTile index={visible.length} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MailboxTile({ m, index }: { m: MailboxRow; index: number }) {
  const color = warmthHex(m.warmth);
  const sentPct =
    m.target > 0 ? Math.min(100, Math.round((m.sentToday / m.target) * 100)) : 0;
  const rampPct = Math.min(100, Math.round((m.day / 28) * 100));
  const status = STATUS_BADGE[m.status];
  const dnsOk = [m.spf, m.dkim, m.dmarc].filter(Boolean).length;
  const sparkPts = m.spark.map((v, i) => ({ i, v }));
  const deltaStr = `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(1)}`;
  const deltaTone =
    m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-accent3' : 'text-text-dim';

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.14 + index * 0.04 }}
    >
      <Card
        className={`flex h-full flex-col ${m.status === 'paused' ? 'opacity-75' : ''}`}
      >
        {/* Top: provider + email + status */}
        <div className="flex items-start justify-between gap-2 p-4 pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-bg"
              style={{ background: color }}
              aria-hidden
            >
              {PROVIDER_LETTER[m.provider]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {m.email}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-text-dim">
                {PROVIDER_LABEL[m.provider]}
              </p>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Warmth + sparkline */}
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="shrink-0">
            <p className="text-[11px] uppercase tracking-wider text-text-dim">
              Warmth
            </p>
            <div className="flex items-end gap-1.5">
              <p
                className="text-2xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {m.warmth}
              </p>
              <span className={`mb-0.5 text-xs font-medium ${deltaTone}`}>
                {deltaStr}
              </span>
            </div>
          </div>
          <div className="h-10 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sparkPts}
                margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
              >
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ramp progress */}
        <div className="px-4 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
            <span>Build-up</span>
            <span>Day {m.day} / 28</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${rampPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + index * 0.03 }}
            />
          </div>
        </div>

        {/* Sends progress */}
        <div className="px-4 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
            <span>Sends today</span>
            <span>
              {m.sentToday} / {m.target}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-accent2"
              initial={{ width: 0 }}
              animate={{ width: `${sentPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.25 + index * 0.03 }}
            />
          </div>
        </div>

        {/* Footer: DNS chip + open */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 p-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              dnsOk === 3
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-accent4/30 bg-accent4/10 text-accent4'
            }`}
          >
            {dnsOk === 3 ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            DNS {dnsOk}/3
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-text-dim transition-colors hover:text-text"
          >
            Open mailbox
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </Card>
    </motion.div>
  );
}

function AddMailboxTile({ index }: { index: number }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.14 + index * 0.04 }}
      className="group flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-muted bg-surface/40 p-6 text-center transition-colors hover:border-accent/40 hover:bg-surface/60"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-accent transition-transform group-hover:scale-110">
        <Plus className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-medium text-text">Add a mailbox</p>
        <p className="mt-1 text-xs text-text-dim">
          {MAX_MAILBOXES} mailbox slots on Pro Plus
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
        <Mail className="h-3.5 w-3.5" />
        Connect provider
      </span>
    </motion.button>
  );
}

// Keep grid-icon import stable across layout refactors. No-op.
void LayoutGrid;

export default ProPlusMailboxes;
