import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Download,
  FileText,
  Gauge,
  Inbox,
  Info,
  Mail,
  Receipt,
  RefreshCw,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatMoney, formatDate as _fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProPlusBilling — "Pro Plus" tier billing section.
 *
 * Standalone preview-harness page: renders prop-less with built-in MOCK data,
 * no network/router/query hooks. The harness supplies the shell + sidebar, so
 * this renders ONLY page content (no nav / chrome).
 *
 * Layout (top → bottom):
 *   1. Header band — title + Pro Plus badge + dummy-billing notice
 *   2. Plan hero (8 col) + usage meters (4 col)
 *        · hero: $96/mo · 15 mailboxes · 75 sends/day · next renewal,
 *          monthly/yearly toggle visual, 30-day cycle meter
 *        · usage: mailboxes 12/15, sends this month, API calls (animated bars)
 *   3. Monthly-spend area chart (6-month series)
 *   4. Payment history table (6 dummy-gateway rows) +
 *      invoices list (6 rows, download affordances)
 *
 * Styling: existing Tailwind tokens only (bg-bg / bg-surface / bg-surface-2 /
 * text-text / text-text-dim / border-border-muted / text-accent / text-accent3
 * / text-accent4). recharts lives in a fixed-height parent with a 100%/100%
 * ResponsiveContainer.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type PayStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';

interface PaymentRow {
  id: string;
  date: string;
  amountUsd: number;
  status: PayStatus;
  method: string;
  invoiceNo: string;
}

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  date: string;
  period: string;
  amountUsd: number;
  status: PayStatus;
}

interface SpendPoint {
  month: string;
  amount: number;
}

interface UsageMeter {
  key: string;
  label: string;
  used: number;
  cap: number;
  unit: string;
  Icon: typeof Inbox;
  tone: 'accent' | 'accent3' | 'accent4';
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-Plus numbers for the preview harness
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17');

function monthsAgoLabel(n: number): string {
  const d = new Date(ANCHOR);
  d.setMonth(ANCHOR.getMonth() - n);
  return _fmtDate(d);
}

function isoMonthsAgo(n: number, day: number): string {
  const d = new Date(ANCHOR);
  d.setMonth(ANCHOR.getMonth() - n);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

const SPEND: SpendPoint[] = Array.from({ length: 6 }, (_, i) => {
  const back = 5 - i;
  // Steady $96 plan + a one-off proration bump mid-series.
  const base = 96;
  const bump = back === 2 ? 24 : back === 0 ? 0 : 0;
  return { month: monthsAgoLabel(back), amount: base + bump };
});

const PAYMENTS: PaymentRow[] = [
  {
    id: 'pay_9f3a21',
    date: isoMonthsAgo(0, 1),
    amountUsd: 96,
    status: 'succeeded',
    method: 'Visa ·· 4242',
    invoiceNo: 'INV-2026-04812',
  },
  {
    id: 'pay_8d1c77',
    date: isoMonthsAgo(1, 1),
    amountUsd: 96,
    status: 'succeeded',
    method: 'Visa ·· 4242',
    invoiceNo: 'INV-2026-04655',
  },
  {
    id: 'pay_7b0e44',
    date: isoMonthsAgo(2, 14),
    amountUsd: 24,
    status: 'succeeded',
    method: 'Visa ·· 4242',
    invoiceNo: 'INV-2026-04601',
  },
  {
    id: 'pay_6a9f10',
    date: isoMonthsAgo(2, 1),
    amountUsd: 96,
    status: 'refunded',
    method: 'Visa ·· 4242',
    invoiceNo: 'INV-2026-04498',
  },
  {
    id: 'pay_5c8b03',
    date: isoMonthsAgo(3, 1),
    amountUsd: 96,
    status: 'succeeded',
    method: 'UPI · acme@okhdfc',
    invoiceNo: 'INV-2026-04331',
  },
  {
    id: 'pay_4e7a55',
    date: isoMonthsAgo(4, 2),
    amountUsd: 96,
    status: 'failed',
    method: 'Visa ·· 4242',
    invoiceNo: 'INV-2026-04190',
  },
];

const INVOICES: InvoiceRow[] = [
  {
    id: 'inv_1',
    invoiceNo: 'INV-2026-04812',
    date: isoMonthsAgo(0, 1),
    period: `${monthsAgoLabel(0)} 1 – ${monthsAgoLabel(0)} 30`,
    amountUsd: 96,
    status: 'succeeded',
  },
  {
    id: 'inv_2',
    invoiceNo: 'INV-2026-04655',
    date: isoMonthsAgo(1, 1),
    period: `${monthsAgoLabel(1)} 1 – ${monthsAgoLabel(1)} 30`,
    amountUsd: 96,
    status: 'succeeded',
  },
  {
    id: 'inv_3',
    invoiceNo: 'INV-2026-04601',
    date: isoMonthsAgo(2, 14),
    period: 'Mid-cycle proration',
    amountUsd: 24,
    status: 'succeeded',
  },
  {
    id: 'inv_4',
    invoiceNo: 'INV-2026-04498',
    date: isoMonthsAgo(2, 1),
    period: `${monthsAgoLabel(2)} 1 – ${monthsAgoLabel(2)} 30`,
    amountUsd: 96,
    status: 'refunded',
  },
  {
    id: 'inv_5',
    invoiceNo: 'INV-2026-04331',
    date: isoMonthsAgo(3, 1),
    period: `${monthsAgoLabel(3)} 1 – ${monthsAgoLabel(3)} 30`,
    amountUsd: 96,
    status: 'succeeded',
  },
  {
    id: 'inv_6',
    invoiceNo: 'INV-2026-04190',
    date: isoMonthsAgo(4, 2),
    period: `${monthsAgoLabel(4)} 1 – ${monthsAgoLabel(4)} 30`,
    amountUsd: 96,
    status: 'failed',
  },
];

const USAGE: UsageMeter[] = [
  {
    key: 'mailboxes',
    label: 'Mailboxes',
    used: 12,
    cap: 15,
    unit: '',
    Icon: Inbox,
    tone: 'accent',
  },
  {
    key: 'sends',
    label: 'Warmup sends · this month',
    used: 21840,
    cap: 33750,
    unit: '',
    Icon: Mail,
    tone: 'accent4',
  },
  {
    key: 'api',
    label: 'API calls · this month',
    used: 6420,
    cap: 25000,
    unit: '',
    Icon: Gauge,
    tone: 'accent3',
  },
];

const NEXT_RENEWAL = (() => {
  const d = new Date(ANCHOR);
  d.setDate(d.getDate() + 14);
  return d;
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  PayStatus,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  succeeded: {
    label: 'Paid',
    cls: 'bg-accent/10 text-accent border-accent/30',
    Icon: CheckCircle2,
  },
  pending: {
    label: 'Pending',
    cls: 'bg-accent4/10 text-accent4 border-accent4/30',
    Icon: Clock,
  },
  failed: {
    label: 'Failed',
    cls: 'bg-accent3/10 text-accent3 border-accent3/30',
    Icon: XCircle,
  },
  refunded: {
    label: 'Refunded',
    cls: 'bg-surface-2 text-text-dim border-border-muted',
    Icon: RefreshCw,
  },
};

const TONE_BAR: Record<UsageMeter['tone'], string> = {
  accent: 'bg-accent',
  accent3: 'bg-accent3',
  accent4: 'bg-accent4',
};

const TONE_TEXT: Record<UsageMeter['tone'], string> = {
  accent: 'text-accent',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

function usd(n: number): string {
  return formatMoney(n);
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return _fmtDate(d);
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusBilling(): JSX.Element {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

  const cycleProgress = useMemo(() => {
    // 14 days remaining of a 30-day cycle → ~53% elapsed.
    return Math.round(((30 - 14) / 30) * 100);
  }, []);

  const monthlyPrice = 96;
  const yearlyPrice = Math.round(monthlyPrice * 12 * 0.8); // 20% off, visual only
  const heroPrice = cycle === 'monthly' ? monthlyPrice : yearlyPrice;
  const heroPeriod = cycle === 'monthly' ? '/ month' : '/ year';

  const spendMax = Math.max(...SPEND.map((s) => s.amount), 1);

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Billing & payments
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Plan, usage, spend and invoices — one screen.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <Info className="h-3.5 w-3.5 text-accent4" />
          <span>
            Dummy billing — <strong className="text-text">no card charged</strong>
          </span>
        </div>
      </motion.header>

      {/* Plan hero + usage meters */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Plan hero */}
        <motion.section {...fade(0.05)} className="lg:col-span-8">
          <Card className="h-full" noShimmer>
            <CardContent className="flex h-full flex-col gap-5 p-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <Crown className="h-3 w-3" />
                    Pro Plus · {cycle}
                  </span>
                  <p className="text-sm text-text-dim">
                    15 mailboxes · 75 warmup sends / day / mailbox · helper
                    network priority routing
                  </p>
                </div>
                {/* Monthly / yearly toggle (visual) */}
                <div
                  role="tablist"
                  aria-label="Billing cycle"
                  className="inline-flex rounded-lg border border-border-muted bg-surface-2 p-0.5"
                >
                  {(['monthly', 'yearly'] as const).map((c) => {
                    const active = c === cycle;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setCycle(c)}
                        className={`relative rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          active ? 'text-bg' : 'text-text-dim hover:text-text'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="cycle-pill"
                            className="absolute inset-0 -z-[1] rounded-md bg-accent"
                            transition={{
                              type: 'spring',
                              stiffness: 320,
                              damping: 28,
                            }}
                          />
                        )}
                        {c}
                        {c === 'yearly' && (
                          <span
                            className={`ml-1 ${
                              active ? 'text-bg/80' : 'text-accent'
                            }`}
                          >
                            −20%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </header>

              <div className="flex items-end gap-2">
                <motion.span
                  key={heroPrice}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-5xl font-semibold leading-none tracking-tight text-text tabular-nums"
                >
                  {formatMoney(heroPrice)}
                </motion.span>
                <span className="mb-1 text-sm text-text-dim">{heroPeriod}</span>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-dim">
                <span>
                  Next renewal{' '}
                  <strong className="text-text">
                    {fmtDate(NEXT_RENEWAL.toISOString())}
                  </strong>
                </span>
                <span className="text-border-muted">·</span>
                <span>Visa ·· 4242</span>
                <span className="text-border-muted">·</span>
                <span>Auto-renew on</span>
              </div>

              <div className="mt-auto space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${cycleProgress}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-text-dim">
                  <span>{cycleProgress}% of 30-day cycle elapsed</span>
                  <span>14 days remaining</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" leftIcon={<ArrowUpRight className="h-3.5 w-3.5" />}>
                  Manage plan
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<CreditCard className="h-3.5 w-3.5" />}
                >
                  Update payment method
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Usage meters */}
        <motion.section {...fade(0.1)} className="lg:col-span-4">
          <Card className="h-full" noShimmer>
            <CardContent className="flex h-full flex-col gap-4 p-6">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-accent" />
                <h2 className="text-base font-semibold text-text">
                  Usage this cycle
                </h2>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-5">
                {USAGE.map((m, i) => {
                  const pct = Math.min(
                    100,
                    Math.round((m.used / m.cap) * 100),
                  );
                  return (
                    <div key={m.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-text-dim">
                          <m.Icon
                            className={`h-3.5 w-3.5 ${TONE_TEXT[m.tone]}`}
                          />
                          {m.label}
                        </span>
                        <span className="font-medium text-text tabular-nums">
                          {compact(m.used)}
                          <span className="text-text-dim">
                            {' '}
                            / {compact(m.cap)}
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <motion.div
                          className={`h-full rounded-full ${TONE_BAR[m.tone]}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.9,
                            ease: 'easeOut',
                            delay: 0.25 + i * 0.1,
                          }}
                        />
                      </div>
                      <p className="text-xs text-text-dim">
                        {pct}% used · {compact(m.cap - m.used)} remaining
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>

      {/* Monthly spend chart */}
      <motion.section {...fade(0.15)}>
        <Card noShimmer>
          <CardContent className="space-y-4 p-6">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-base font-semibold text-text">
                    Monthly spend
                  </h2>
                  <p className="text-xs text-text-dim">
                    Last 6 months · dummy gateway
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                Total{' '}
                <strong className="text-text">
                  {usd(SPEND.reduce((a, s) => a + s.amount, 0))}
                </strong>
              </span>
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={SPEND}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="proplus-spend"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#F26522"
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="100%"
                        stopColor="#F26522"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a3a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={{ stroke: '#2a2a3a' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#8888a0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    domain={[0, Math.ceil((spendMax + 20) / 20) * 20]}
                    tickFormatter={(v: number) => formatMoney(v)}
                  />
                  <Tooltip
                    cursor={{ stroke: '#F26522', strokeOpacity: 0.3 }}
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #2a2a3a',
                      borderRadius: 8,
                      color: '#e8e8f0',
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [usd(v), 'Spend']}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#F26522"
                    strokeWidth={2}
                    fill="url(#proplus-spend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* Payment history + invoices */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Payment history table */}
        <motion.section {...fade(0.2)} className="lg:col-span-7">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-accent" />
                  <h2 className="text-base font-semibold text-text">
                    Payment history
                  </h2>
                </div>
                <span className="text-xs text-text-dim">
                  {PAYMENTS.length} transactions
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-muted text-left text-xs uppercase tracking-wider text-text-dim">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Method</th>
                      <th className="px-5 py-3 text-right font-medium">
                        Amount
                      </th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">
                        Invoice
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENTS.map((p, i) => {
                      const s = STATUS_META[p.status];
                      return (
                        <motion.tr
                          key={p.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.25,
                            delay: 0.25 + i * 0.05,
                          }}
                          className="border-b border-border-muted/60 transition-colors last:border-0 hover:bg-surface-2"
                        >
                          <td className="px-5 py-3 text-text-dim">
                            {fmtDate(p.date)}
                          </td>
                          <td className="px-5 py-3 text-text">{p.method}</td>
                          <td className="px-5 py-3 text-right font-medium text-text tabular-nums">
                            {usd(p.amountUsd)}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${s.cls}`}
                            >
                              <s.Icon className="h-3 w-3" />
                              {s.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                            >
                              <Download className="h-3 w-3" />
                              {p.invoiceNo.split('-').slice(-1)[0]}
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Invoices list */}
        <motion.section {...fade(0.25)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  <h2 className="text-base font-semibold text-text">
                    Invoices
                  </h2>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-text-dim transition-colors hover:text-text"
                >
                  <Download className="h-3 w-3" />
                  Download all
                </button>
              </header>
              <ul className="divide-y divide-border-muted/60">
                {INVOICES.map((inv, i) => {
                  const s = STATUS_META[inv.status];
                  return (
                    <motion.li
                      key={inv.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.3 + i * 0.05 }}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-accent">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium text-text">
                          {inv.invoiceNo}
                        </p>
                        <p className="truncate text-xs text-text-dim">
                          {inv.period} · {fmtDate(inv.date)}
                        </p>
                      </div>
                      <span
                        className={`hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex ${s.cls}`}
                      >
                        {s.label}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-text tabular-nums">
                        {usd(inv.amountUsd)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Download ${inv.invoiceNo}`}
                        title="Download PDF"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-muted text-text-dim transition-colors hover:border-accent/40 hover:text-accent"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
              <div className="border-t border-border-muted px-5 py-3 text-center text-xs text-text-dim">
                Invoices are generated by the dummy gateway — for demonstration
                only.
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </div>
  );
}

export default ProPlusBilling;
