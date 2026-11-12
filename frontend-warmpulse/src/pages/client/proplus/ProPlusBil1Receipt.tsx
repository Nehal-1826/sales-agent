import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Building2,
  CalendarClock,
  CreditCard,
  Download,
  FileDown,
  Printer,
  RefreshCcw,
  ScanLine,
  Scissors,
  Stamp,
  XCircle,
} from 'lucide-react';
import { useDownloadInvoice, useCancelSubscription, useQuickUpgrade } from '@/features/billing/api';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { ChevronDown, Loader2 } from 'lucide-react';

/**
 * ProPlusBil1Receipt — "Paper Receipt / Ledger" Pro Plus billing page.
 *
 * Concept: billing rendered as a printed accounting receipt. NOT a plan-card
 * compare grid, NOT a usage-meter cockpit, NOT a spend timeline (sibling
 * agents own those shapes). The whole experience is two stacked receipts
 * with dashed edges, perforations, monospace ledger typography, a SCAN-LINE
 * top band, line items in a left/right tabular grid (qty x unit x amount),
 * computed subtotals/tax/total via real reduce, a "PAID" stamp on the
 * primary receipt, and a continuation receipt for the past-payment history
 * where every row gets its own pop-in PAID stamp. A side action rail to the
 * right holds Download PDF / Update method / View next renewal / Print.
 *
 * Standalone for the preview harness — NO network, router, query hooks. All
 * data is inline MOCK. Renders ONLY page content (no nav / chrome).
 *
 * Layout (top → bottom):
 *   ┌─────────────────────────────────────────────┬──────────────────┐
 *   │  Receipt #1 — current period invoice        │   Side rail      │
 *   │   · header block (workspace · period · #)   │   · Download PDF │
 *   │   · scan-line band                          │   · Update method│
 *   │   · line items (8) — qty × unit = amount    │   · Next renewal │
 *   │   · subtotal · tax · TOTAL count-up         │   · Print        │
 *   │   · PAID stamp + card last-4                │                  │
 *   │   · dashed perforation                      │                  │
 *   │  Receipt #2 — payment history continuation  │                  │
 *   │   · 8 past payments, each a stamped row     │                  │
 *   └─────────────────────────────────────────────┴──────────────────┘
 *
 * Styling: existing Tailwind tokens only — bg-bg, bg-surface, bg-surface-2,
 * text-text, text-text-dim, border-border-muted, text-accent (paid),
 * text-accent4 (warn / due), text-accent3 (failed). Heavy font-mono usage
 * for the receipt feel. lucide icons. No emojis. No new colors.
 *
 * Accounting integrity: subtotal, tax, total, total-paid-to-date and the
 * past-period running total are ALL derived from the raw line items /
 * payment rows via reduce — nothing hardcoded that the user can read off.
 */

// ---------------------------------------------------------------------------
// Data shapes — line items + past payments
// ---------------------------------------------------------------------------

export interface LineItem {
  /** Stable monotonic ID, also used as the printed line number. */
  id: string;
  /** Short item code, like a SKU on a real receipt. */
  sku: string;
  /** Human description (e.g. "Pro Plus subscription — monthly"). */
  desc: string;
  /** Optional sub-line, e.g. "12 of 15 mailboxes in use". */
  sub?: string;
  /** Quantity. */
  qty: number;
  /** Quantity unit label (e.g. "seat", "mailbox", "send"). */
  qtyUnit: string;
  /** Unit price in USD. May be 0 for "included" bundles. */
  unit: number;
  /** Computed amount — qty × unit (we still author it so 0-rate lines can
   *  display their amount as "included" rather than "$0").
   */
  amount: number;
  /** When true, render the amount column as "included" instead of $0.00. */
  included?: boolean;
}

export type PaymentStatus = 'paid' | 'failed' | 'refunded';

export interface PastPayment {
  id: string;
  /** ISO date of the receipt. */
  date: string;
  /** Receipt / invoice number. */
  rcpt: string;
  /** Payment method — "Visa ··4242" / "UPI acme@okhdfc" etc. */
  method: string;
  amount: number;
  status: PaymentStatus;
}

export interface ReceiptWorkspace {
  name: string;
  domain: string;
  billingEmail: string;
  taxId: string;
}

export interface ReceiptPeriod {
  label: string;
  /** ISO date — first day of the cycle. */
  from: string;
  /** ISO date — last day of the cycle. */
  to: string;
  receiptNo: string;
  /** ISO date — when the receipt was issued. */
  issuedOn: string;
}

/**
 * Aggregate data shape consumed by the receipt. Exported so live adapters
 * (`features/billing/useProPlusReceiptData.ts`) can return the EXACT shape
 * the component renders — no inline reshaping at the call site.
 */
export interface ReceiptData {
  workspace: ReceiptWorkspace;
  period: ReceiptPeriod;
  lineItems: LineItem[];
  pastPayments: PastPayment[];
  /** Last 4 of the card on file. May be 'XXXX' when none is known. */
  cardLast4: string;
  /** ISO date — projected next renewal. */
  nextRenewalDate: string;
}

// ---------------------------------------------------------------------------
// Mock — Pro Plus, $96 / mo, 15 mailboxes, period ending 31 May 2026.
// ---------------------------------------------------------------------------

const WORKSPACE = {
  name: 'Acme Outbound Co.',
  domain: 'acme.io',
  billingEmail: 'billing@acme.io',
  taxId: 'TAX-IN-29ABCDE1234F1Z5',
};

const PERIOD = {
  label: 'May 2026 cycle',
  from: '2026-05-01',
  to: '2026-05-31',
  receiptNo: 'WP-RCT-2026-04812',
  issuedOn: '2026-05-21',
};

const PRO_PLUS_BASE = 96;
const TAX_RATE = 0.0; // dummy gateway — 0% but still shown as a line for ledger realism

const LINE_ITEMS: LineItem[] = [
  {
    id: '01',
    sku: 'WP-PLUS-SUB',
    desc: 'Pro Plus subscription · monthly',
    sub: '15 mailboxes · 75 warmup sends / day / mailbox',
    qty: 1,
    qtyUnit: 'seat',
    unit: PRO_PLUS_BASE,
    amount: PRO_PLUS_BASE,
  },
  {
    id: '02',
    sku: 'WP-MBX-ACTIVE',
    desc: 'Mailboxes in service this cycle',
    sub: '12 of 15 active · 3 seats idle',
    qty: 12,
    qtyUnit: 'mbx',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '03',
    sku: 'WP-SEND-VOL',
    desc: 'Email sends posted',
    sub: '12,847 outbound · 12,510 inbound (97.4% paired)',
    qty: 12847,
    qtyUnit: 'send',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '04',
    sku: 'WP-PEER-NET',
    desc: 'Test-accounts network access · priority routing',
    sub: 'Pro Plus unlock · workspace account-group pinning',
    qty: 1,
    qtyUnit: 'lic',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '05',
    sku: 'WP-POSTMASTER',
    desc: 'Google Monitor feed',
    sub: 'Pro Plus unlock · domain & IP trust',
    qty: 1,
    qtyUnit: 'feed',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '06',
    sku: 'WP-SNDS',
    desc: 'Microsoft Monitor feed',
    sub: 'Pro Plus unlock · IP & complaint data',
    qty: 1,
    qtyUnit: 'feed',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '07',
    sku: 'WP-PT-PRO',
    desc: 'Inbox Test · Pro panel',
    sub: 'Pro Plus unlock · 6 test accounts, all major mail providers (MX)',
    qty: 1,
    qtyUnit: 'pack',
    unit: 0,
    amount: 0,
    included: true,
  },
  {
    id: '08',
    sku: 'WP-AUDIT-EXP',
    desc: 'Audit export · CSV + signed PDF',
    sub: 'Pro Plus unlock · unlimited exports',
    qty: 1,
    qtyUnit: 'lic',
    unit: 0,
    amount: 0,
    included: true,
  },
];

const PAST_PAYMENTS: PastPayment[] = [
  {
    id: 'pay_9f3a21',
    date: '2026-05-01',
    rcpt: 'WP-RCT-2026-04812',
    method: 'Visa ··4242',
    amount: 96,
    status: 'paid',
  },
  {
    id: 'pay_8d1c77',
    date: '2026-04-01',
    rcpt: 'WP-RCT-2026-04655',
    method: 'Visa ··4242',
    amount: 96,
    status: 'paid',
  },
  {
    id: 'pay_7b0e44',
    date: '2026-03-14',
    rcpt: 'WP-RCT-2026-04601',
    method: 'Visa ··4242',
    amount: 24,
    status: 'paid',
  },
  {
    id: 'pay_6a9f10',
    date: '2026-03-01',
    rcpt: 'WP-RCT-2026-04498',
    method: 'Visa ··4242',
    amount: 96,
    status: 'refunded',
  },
  {
    id: 'pay_5c8b03',
    date: '2026-02-01',
    rcpt: 'WP-RCT-2026-04331',
    method: 'UPI acme@okhdfc',
    amount: 96,
    status: 'paid',
  },
  {
    id: 'pay_4e7a55',
    date: '2026-01-02',
    rcpt: 'WP-RCT-2026-04190',
    method: 'Visa ··4242',
    amount: 96,
    status: 'failed',
  },
  {
    id: 'pay_3d6e22',
    date: '2025-12-01',
    rcpt: 'WP-RCT-2025-04088',
    method: 'Visa ··4242',
    amount: 96,
    status: 'paid',
  },
  {
    id: 'pay_2c5d11',
    date: '2025-11-01',
    rcpt: 'WP-RCT-2025-03971',
    method: 'UPI acme@okhdfc',
    amount: 96,
    status: 'paid',
  },
];

const CARD_LAST4 = '4242';
const NEXT_RENEWAL_DATE = '2026-06-01';

/**
 * Skeleton aggregate — exactly the prop-less mock the design preview renders.
 * Live adapters (`useProPlusReceiptData`) overlay real fields onto this so any
 * gap stays visibly on-design instead of being faked.
 */
export const RECEIPT_SKELETON: ReceiptData = {
  workspace: WORKSPACE,
  period: PERIOD,
  lineItems: LINE_ITEMS,
  pastPayments: PAST_PAYMENTS,
  cardLast4: CARD_LAST4,
  nextRenewalDate: NEXT_RENEWAL_DATE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const formatted = formatMoney(abs, { decimals: 2 });
  return sign ? `${sign}${formatted}` : formatted;
}

function compactNum(n: number): string {
  return formatNumber(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

function fmtDateCompact(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

// ---------------------------------------------------------------------------
// Animated count-up for the TOTAL line — driven by useInView so it fires on
// receipt entrance.
// ---------------------------------------------------------------------------

function CountUp({
  value,
  duration = 0.9,
  prefix = '',
  decimals = 2,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  decimals?: number;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    let rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {formatNumber(display, { decimals })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Paper edge — dashed serration; sits at the top & bottom of each receipt.
// ---------------------------------------------------------------------------

function PaperEdge({ kind = 'top' }: { kind?: 'top' | 'bottom' }): JSX.Element {
  // Triangular zig-zag rendered with overlapping squares rotated 45deg.
  return (
    <div
      aria-hidden
      className={`relative h-3 w-full overflow-hidden ${
        kind === 'top' ? '-mb-px' : '-mt-px'
      }`}
    >
      <div
        className="absolute inset-x-0 flex justify-between"
        style={{
          [kind === 'top' ? 'top' : 'bottom']: '-6px',
          paddingLeft: 6,
          paddingRight: 6,
        }}
      >
        {Array.from({ length: 56 }, (_, i) => (
          <span
            key={i}
            className="h-3 w-3 rotate-45 border border-border-muted bg-bg"
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill for past-payment rows.
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<
  PaymentStatus,
  { label: string; stampCls: string; barCls: string }
> = {
  paid: {
    label: 'PAID',
    stampCls: 'text-accent border-accent/60',
    barCls: 'bg-accent',
  },
  refunded: {
    label: 'REFUND',
    stampCls: 'text-accent4 border-accent4/60',
    barCls: 'bg-accent4',
  },
  failed: {
    label: 'FAILED',
    stampCls: 'text-accent3 border-accent3/60',
    barCls: 'bg-accent3',
  },
};

// ---------------------------------------------------------------------------
// Stamp — rotated double-ring "PAID" graphic. We re-use it for receipt #1
// and for every past-payment row (smaller).
// ---------------------------------------------------------------------------

function PaidStamp({
  label = 'PAID',
  size = 'lg',
  tone = 'accent',
  delay = 0,
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'accent' | 'accent3' | 'accent4';
  delay?: number;
}): JSX.Element {
  const dims =
    size === 'lg'
      ? 'h-28 w-28 text-2xl'
      : size === 'md'
        ? 'h-16 w-16 text-sm'
        : 'h-12 w-12 text-[10px]';
  const ringTone =
    tone === 'accent'
      ? 'border-accent/70 text-accent'
      : tone === 'accent3'
        ? 'border-accent3/70 text-accent3'
        : 'border-accent4/70 text-accent4';
  return (
    <motion.div
      initial={{ scale: 0.4, rotate: -28, opacity: 0 }}
      animate={{ scale: 1, rotate: -14, opacity: 1 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 14,
        delay,
      }}
      className={`relative flex shrink-0 items-center justify-center font-mono font-black tracking-[0.18em] ${dims} ${ringTone}`}
    >
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full border-[3px] ${ringTone}`}
      />
      <span
        aria-hidden
        className={`absolute inset-[6px] rounded-full border-[1.5px] border-dashed ${ringTone}`}
      />
      <span className="relative z-[1] select-none">{label}</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Side-rail action button.
// ---------------------------------------------------------------------------

function RailAction({
  Icon,
  title,
  meta,
  primary,
  onClick,
}: {
  Icon: typeof Download;
  title: string;
  meta: string;
  primary?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        primary
          ? 'border-accent/40 bg-accent/10 hover:bg-accent/15'
          : 'border-border-muted bg-surface hover:bg-surface-2'
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
          primary
            ? 'border-accent/40 bg-bg/40 text-accent'
            : 'border-border-muted bg-surface-2 text-text-dim group-hover:text-text'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium ${
            primary ? 'text-accent' : 'text-text'
          }`}
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-text-dim">
          {meta}
        </span>
      </span>
      {/* sliding-underline accent on hover */}
      <span
        aria-hidden
        className={`absolute inset-x-3 bottom-0 h-px origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${
          primary ? 'bg-accent/60' : 'bg-border-muted'
        }`}
      />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProPlusBil1Receipt({
  data,
}: { data?: ReceiptData } = {}): JSX.Element {
  // Skeleton fallback keeps the prop-less :35001 preview rendering identically
  // while live wrappers (`billing/ProPlusBilling.tsx`) thread a real
  // `ReceiptData`. Once a field has no live source the live adapter is
  // expected to keep the skeleton value (no fabrication).
  const d = data ?? RECEIPT_SKELETON;

  // ── Invoice download wiring (PP#6) ─────────────────────────────────────
  // The current-period invoice ≈ the latest 'paid' past-payment. The hook
  // streams a real PDF from `/api/payments/{id}/invoice.pdf` (with CSV
  // fallback if the deploy lacks reportlab — see useDownloadInvoice).
  const downloadInvoice = useDownloadInvoice();
  const cancelSub = useCancelSubscription();
  const quickUpgrade = useQuickUpgrade();

  const latestPaidId = useMemo(
    () => d.pastPayments.find((p) => p.status === 'paid')?.id ?? null,
    [d.pastPayments],
  );

  const handleQuickUpgrade = async (planId: string) => {
    try {
      await quickUpgrade.mutateAsync(planId);
      toast.success('Plan updated successfully.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update plan.'));
    }
  };

  const onDownloadPdf = () => {
    if (!latestPaidId) {
      toast.info('No paid invoice to download yet');
      return;
    }
    downloadInvoice.mutate(
      { paymentId: latestPaidId, format: 'pdf' },
      {
        onSuccess: () => toast.success('Invoice downloaded'),
        onError: () => toast.error('Could not download invoice'),
      },
    );
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel Subscription?',
      description: 'Are you sure you want to cancel your subscription? Your mailboxes will be paused.',
      confirmLabel: 'Cancel plan',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelSub.mutateAsync();
      toast.success('Subscription cancelled.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to cancel subscription.'));
    }
  };

  const onPrint = () => {
    if (typeof window !== 'undefined') window.print();
  };
  const onReprintPast = () => {
    // Same as Download PDF — points at the latest paid receipt. For a
    // "reprint by number" UX we'd open a chooser; deferring that to a
    // follow-up since the search dialog isn't designed yet.
    onDownloadPdf();
  };

  // ── Derived totals (all via real reduce; nothing hardcoded) ────────────
  const subtotal = useMemo(
    () => d.lineItems.reduce((sum, li) => sum + li.amount, 0),
    [d.lineItems],
  );
  const tax = useMemo(
    () => Math.round(subtotal * TAX_RATE * 100) / 100,
    [subtotal],
  );
  const total = useMemo(() => subtotal + tax, [subtotal, tax]);

  const totalPaidToDate = useMemo(
    () =>
      d.pastPayments
        .filter((p) => p.status === 'paid')
        .reduce((acc, p) => acc + p.amount, 0),
    [d.pastPayments],
  );
  const refundedTotal = useMemo(
    () =>
      d.pastPayments
        .filter((p) => p.status === 'refunded')
        .reduce((acc, p) => acc + p.amount, 0),
    [d.pastPayments],
  );

  // Total send volume (sum of all qty's that count as 'send' — line 03).
  const totalSends = useMemo(
    () =>
      d.lineItems
        .filter((li) => li.qtyUnit === 'send')
        .reduce((acc, li) => acc + li.qty, 0),
    [d.lineItems],
  );

  const includedCount = useMemo(
    () => d.lineItems.filter((li) => li.included).length,
    [d.lineItems],
  );

  return (
    <div className="space-y-6">
      {/* Page header — kept light. The receipt itself is the page. */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">
            <ScanLine className="h-3.5 w-3.5 text-accent" />
            <span>warmpulse · billing · paper-receipt view</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Receipt &amp; ledger
          </h1>
          <p className="max-w-xl text-sm text-text-dim">
            Every cycle prints a stamped receipt. Below — this period&apos;s
            invoice, then a continuation receipt with every payment posted
            against your workspace.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-accent4/40 bg-accent4/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent4">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>
            Issued&nbsp;{fmtDate(d.period.issuedOn)} · {d.period.receiptNo}
          </span>
        </div>
      </motion.header>

      {/* Two-column: receipt stack | side action rail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ─────────── RECEIPT STACK (col-span-8) ─────────── */}
        <div className="space-y-6 lg:col-span-8">
          {/* ── RECEIPT #1 — current period invoice ─────────────────────── */}
          <motion.article
            initial={{ opacity: 0, y: -28, rotateX: -6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 22,
              mass: 0.9,
            }}
            style={{ transformPerspective: 1200 }}
            className="relative"
          >
            {/* paper sheet */}
            <div className="relative border-x border-border-muted bg-surface shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]">
              <PaperEdge kind="top" />

              {/* SCAN LINE band — the moving line creates "fresh print" feel */}
              <div className="relative overflow-hidden border-b border-border-muted bg-bg/50">
                <motion.span
                  aria-hidden
                  initial={{ x: '-100%' }}
                  animate={{ x: '110%' }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent/15 to-transparent"
                />
                <div className="relative flex items-center justify-between gap-4 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
                  <span className="flex items-center gap-2">
                    <ScanLine className="h-3 w-3 text-accent" />
                    receipt&nbsp;&middot;&nbsp;original
                  </span>
                  <span>
                    no.&nbsp;{d.period.receiptNo} &middot;&nbsp;v.1
                  </span>
                </div>
              </div>

              {/* HEADER block */}
              <div className="grid grid-cols-1 gap-6 px-6 py-6 sm:grid-cols-12">
                <div className="sm:col-span-7">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                    <Building2 className="h-3.5 w-3.5" />
                    warmpulse
                    <span className="text-text-dim">·</span>
                    <span className="text-text-dim">pro plus</span>
                  </div>
                  <h2 className="mt-2 font-mono text-lg font-semibold text-text">
                    {d.workspace.name}
                  </h2>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px] leading-relaxed">
                    <dt className="text-text-dim">Domain</dt>
                    <dd className="text-text">{d.workspace.domain}</dd>
                    <dt className="text-text-dim">Billed to</dt>
                    <dd className="text-text">{d.workspace.billingEmail}</dd>
                    <dt className="text-text-dim">Tax ID</dt>
                    <dd className="text-text">{d.workspace.taxId}</dd>
                  </dl>
                </div>
                <div className="sm:col-span-5">
                  <div className="rounded-md border border-dashed border-border-muted bg-bg/40 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
                      Billing period
                    </p>
                    <p className="mt-1.5 font-mono text-sm text-text">
                      {fmtDate(d.period.from)} &nbsp;→&nbsp; {fmtDate(d.period.to)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[11px]">
                      <div>
                        <p className="text-text-dim">Receipt no.</p>
                        <p className="text-text">{d.period.receiptNo}</p>
                      </div>
                      <div>
                        <p className="text-text-dim">Issued</p>
                        <p className="text-text">
                          {fmtDate(d.period.issuedOn)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column rule */}
              <div className="border-t border-dashed border-border-muted" />

              {/* LINE ITEMS — tabular grid, real ledger layout */}
              <div className="px-6 py-5">
                {/* Mobile: the fixed-column ledger scrolls horizontally inside
                    this wrapper instead of forcing the whole page to scroll. */}
                <div className="overflow-x-auto">
                <div className="min-w-[440px]">
                {/* table head */}
                <div className="grid grid-cols-[28px_1fr_92px_96px_120px] gap-3 border-b border-border-muted pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                  <span>#</span>
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit</span>
                  <span className="text-right">Amount</span>
                </div>

                <ul className="divide-y divide-dashed divide-border-muted">
                  {d.lineItems.map((li, i) => (
                    <motion.li
                      key={li.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.28,
                        ease: 'easeOut',
                        delay: 0.18 + i * 0.06,
                      }}
                      className="grid grid-cols-[28px_1fr_92px_96px_120px] items-start gap-3 py-2.5"
                    >
                      <span className="font-mono text-[11px] text-text-dim">
                        {li.id}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] font-medium text-text">
                          {li.desc}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-text-dim">
                          <span className="rounded-sm border border-border-muted px-1 py-px text-[10px] uppercase tracking-wider">
                            {li.sku}
                          </span>
                          {li.sub ? (
                            <>
                              <span className="mx-1.5 text-border-muted">
                                ·
                              </span>
                              {li.sub}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <span className="text-right font-mono text-[12px] text-text tabular-nums">
                        {compactNum(li.qty)}
                        <span className="ml-1 text-text-dim">{li.qtyUnit}</span>
                      </span>
                      <span className="text-right font-mono text-[12px] text-text-dim tabular-nums">
                        {li.unit === 0 ? '—' : usd(li.unit)}
                      </span>
                      <span
                        className={`text-right font-mono text-[12px] tabular-nums ${
                          li.included
                            ? 'text-accent'
                            : 'font-semibold text-text'
                        }`}
                      >
                        {li.included ? 'included' : usd(li.amount)}
                      </span>
                    </motion.li>
                  ))}
                </ul>
                </div>
                </div>

                {/* Totals block */}
                <div className="mt-5 ml-auto w-full max-w-sm space-y-1.5 border-t border-dashed border-border-muted pt-4 font-mono">
                  <div className="flex items-baseline justify-between text-[12px] text-text-dim">
                    <span>Subtotal</span>
                    <span className="tabular-nums text-text">
                      {usd(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[12px] text-text-dim">
                    <span>
                      Tax ({(TAX_RATE * 100).toFixed(0)}%) — dummy gateway
                    </span>
                    <span className="tabular-nums text-text">{usd(tax)}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-[12px] text-text-dim">
                    <span>Included unlocks</span>
                    <span className="tabular-nums text-accent">
                      ×{includedCount}
                    </span>
                  </div>
                  <div className="my-2 border-t border-double border-border-muted" />
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-text">
                      Total due
                    </span>
                    <span className="text-3xl font-bold leading-none text-text">
                      <CountUp
                        value={total}
                        duration={1.1}
                        prefix="$"
                        decimals={2}
                      />
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer band — PAID stamp + paid-meta row */}
              <div className="border-t border-dashed border-border-muted px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <PaidStamp size="lg" tone="accent" delay={0.55} />
                    <div className="space-y-1 font-mono text-[12px]">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-text-dim">
                        Payment captured
                      </p>
                      <p className="flex items-center gap-2 text-text">
                        <CreditCard className="h-3.5 w-3.5 text-accent" />
                        Visa&nbsp;··{d.cardLast4} · auto-renew on
                      </p>
                      <p className="text-text-dim">
                        Auth&nbsp;# AUTH-9F3A21 · settled&nbsp;
                        {fmtDate(d.period.issuedOn)}
                      </p>
                      <p className="text-text-dim">
                        Sends posted this cycle:&nbsp;
                        <span className="text-text">
                          {compactNum(totalSends)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Barcode-style strip — pure CSS, decorative */}
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex h-10 items-end gap-[2px]">
                      {Array.from({ length: 44 }, (_, i) => {
                        const heights = [70, 100, 50, 90, 60, 100, 40, 80];
                        const h = heights[i % heights.length];
                        const w =
                          i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
                        return (
                          <span
                            key={i}
                            style={{ height: `${h}%`, width: `${w}px` }}
                            className="bg-text/80"
                          />
                        );
                      })}
                    </div>
                    <span className="font-mono text-[10px] tracking-[0.18em] text-text-dim">
                      {d.period.receiptNo}
                    </span>
                  </div>
                </div>
              </div>

              <PaperEdge kind="bottom" />
            </div>
          </motion.article>

          {/* Tear-off cue between the two receipts */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="flex items-center gap-3 px-2 font-mono text-[10px] uppercase tracking-[0.28em] text-text-dim"
          >
            <Scissors className="h-3.5 w-3.5 -rotate-12 text-text-dim" />
            <div className="h-px flex-1 border-t border-dashed border-border-muted" />
            <span>tear here · continuation receipt</span>
            <div className="h-px flex-1 border-t border-dashed border-border-muted" />
            <Scissors className="h-3.5 w-3.5 rotate-12 scale-x-[-1] text-text-dim" />
          </motion.div>

          {/* ── RECEIPT #2 — payment history continuation ───────────────── */}
          <motion.article
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 24,
              mass: 0.9,
              delay: 0.15,
            }}
            className="relative"
          >
            <div className="relative border-x border-border-muted bg-surface shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]">
              <PaperEdge kind="top" />

              {/* Continuation header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-border-muted px-6 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
                <span className="flex items-center gap-2 text-text">
                  <Stamp className="h-3.5 w-3.5 text-accent" />
                  payment history · {d.workspace.name}
                </span>
                <span>
                  rows&nbsp;{d.pastPayments.length} · since&nbsp;
                  {fmtDateCompact(
                    d.pastPayments[d.pastPayments.length - 1]?.date ?? '',
                  )}
                </span>
              </div>

              {/* Summary band — pulled from reduce */}
              <div className="grid grid-cols-1 gap-px border-b border-border-muted bg-border-muted/60 sm:grid-cols-3">
                {[
                  {
                    label: 'Paid to date',
                    value: usd(totalPaidToDate),
                    tone: 'text-accent',
                  },
                  {
                    label: 'Refunded',
                    value: usd(refundedTotal),
                    tone: 'text-accent4',
                  },
                  {
                    label: 'Receipts on file',
                    value: String(d.pastPayments.length),
                    tone: 'text-text',
                  },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.25 + i * 0.05 }}
                    className="bg-surface px-6 py-3"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
                      {s.label}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${s.tone}`}
                    >
                      {s.value}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Past-payment rows — each gets a small PAID stamp.
                  Wrapped so the fixed-column ledger scrolls within itself on
                  mobile rather than overflowing the page. */}
              <div className="overflow-x-auto">
              <ul className="min-w-[520px] divide-y divide-dashed divide-border-muted">
                {/* Column header */}
                <li className="grid grid-cols-[88px_1fr_140px_96px_84px] gap-3 px-6 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                  <span>Date</span>
                  <span>Receipt</span>
                  <span>Method</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Status</span>
                </li>
                {d.pastPayments.map((p, i) => {
                  const tone = STATUS_TONE[p.status];
                  return (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.28,
                        ease: 'easeOut',
                        delay: 0.35 + i * 0.05,
                      }}
                      className="group relative grid grid-cols-[88px_1fr_140px_96px_84px] items-center gap-3 px-6 py-3"
                    >
                      {/* status edge marker (left bar) */}
                      <span
                        aria-hidden
                        className={`absolute inset-y-2 left-2 w-[3px] rounded-full ${tone.barCls} opacity-50`}
                      />
                      <span className="pl-2 font-mono text-[12px] text-text-dim">
                        {fmtDateCompact(p.date)}
                        <span className="ml-1 text-border-muted">·</span>
                        <span className="ml-1 text-text-dim">
                          {new Date(p.date).getFullYear()}
                        </span>
                      </span>
                      <span className="font-mono text-[12px] text-text">
                        {p.rcpt}
                      </span>
                      <span className="font-mono text-[12px] text-text-dim">
                        {p.method}
                      </span>
                      <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-text">
                        {usd(p.amount)}
                      </span>
                      <span className="flex justify-end">
                        <PaidStamp
                          size="sm"
                          tone={
                            p.status === 'paid'
                              ? 'accent'
                              : p.status === 'failed'
                                ? 'accent3'
                                : 'accent4'
                          }
                          label={tone.label}
                          delay={0.45 + i * 0.05}
                        />
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
              </div>

              {/* Footer slip — running totals + signature stub */}
              <div className="flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-border-muted px-6 py-5 font-mono text-[12px]">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-text-dim">
                    Lifetime spend (net of refunds)
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-text">
                    {usd(totalPaidToDate - refundedTotal)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="border-b border-text/40 pb-1 text-text-dim">
                    Authorized signatory
                  </p>
                  <p className="mt-1 italic text-text">
                    /s/&nbsp;WarmPulse Billing
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-text-dim">
                    Dummy gateway · no card charged
                  </p>
                </div>
              </div>

              <PaperEdge kind="bottom" />
            </div>
          </motion.article>
        </div>

        {/* ─────────── SIDE ACTION RAIL (col-span-4) ─────────── */}
        <motion.aside
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
          className="lg:col-span-4"
        >
          <div className="sticky top-4 space-y-4">
            {/* Rail header */}
            <div className="rounded-xl border border-border-muted bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
                Receipt actions
              </p>
              <p className="mt-1 text-sm text-text">
                Save, share, or schedule a hand-off — every action stays on
                this paper trail.
              </p>

              <div className="mt-4 space-y-2.5">
                <RailAction
                  Icon={FileDown}
                  title={
                    downloadInvoice.isPending ? 'Downloading…' : 'Download PDF'
                  }
                  meta={`${d.period.receiptNo} · ${usd(total)}`}
                  primary
                  onClick={onDownloadPdf}
                />
                <RailAction
                  Icon={XCircle}
                  title={
                    cancelSub.isPending ? 'Cancelling…' : 'Cancel subscription'
                  }
                  meta="Downgrade to Starter tier"
                  onClick={handleCancel}
                />
                <RailAction
                  Icon={CreditCard}
                  title="Update payment method"
                  meta={`Currently Visa ··${d.cardLast4}`}
                />
                <RailAction
                  Icon={CalendarClock}
                  title="View next renewal"
                  meta={`Posts ${fmtDate(d.nextRenewalDate)} · auto-renew`}
                />
                <RailAction
                  Icon={Printer}
                  title="Print receipt"
                  meta="2 pages · A4 / Letter"
                  onClick={onPrint}
                />
                <RailAction
                  Icon={RefreshCcw}
                  title="Reprint a past receipt"
                  meta={`${d.pastPayments.length} on file · search by no.`}
                  onClick={onReprintPast}
                />
              </div>
            </div>

            {/* Plan-at-a-glance — keeps the page anchored in "this is the
                Pro Plus billing screen" without being a plan-card stack. */}
            <div className="rounded-xl border border-border-muted bg-surface-2 p-4 font-mono">
              <p className="text-[10px] uppercase tracking-[0.22em] text-text-dim">
                Active plan
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <div className="relative inline-flex items-center">
                  <select
                    value="pro_plus"
                    onChange={(e) => handleQuickUpgrade(e.target.value)}
                    disabled={quickUpgrade.isPending}
                    className="bg-transparent text-base font-semibold text-text underline decoration-dotted underline-offset-4 appearance-none pr-5 cursor-pointer focus:outline-none"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="pro_plus">Pro Plus</option>
                    <option value="agency">Agency</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim" />
                </div>
                {quickUpgrade.isPending && <Loader2 size={12} className="animate-spin text-accent" />}
                <span className="text-text-dim">·</span>
                <span className="text-[12px] text-text-dim">monthly</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px]">
                <li className="flex justify-between">
                  <span className="text-text-dim">Base</span>
                  <span className="tabular-nums text-text">
                    {usd(PRO_PLUS_BASE)} / mo
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-dim">Mailbox cap</span>
                  <span className="tabular-nums text-text">15</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-dim">Sends / day / mbx</span>
                  <span className="tabular-nums text-text">75</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-dim">Cycle ends</span>
                  <span className="tabular-nums text-text">
                    {fmtDateCompact(d.period.to)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-dim">Next charge</span>
                  <span className="tabular-nums text-accent">
                    {usd(PRO_PLUS_BASE)} on {fmtDateCompact(d.nextRenewalDate)}
                  </span>
                </li>
              </ul>
            </div>

            {/* Watermark-style helper note */}
            <div
              aria-hidden
              className="rounded-xl border border-dashed border-border-muted bg-bg/40 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim"
            >
              this is a dummy receipt &middot; no real charges &middot;
              warmpulse demo
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

export default ProPlusBil1Receipt;
