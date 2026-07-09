import { useMemo } from 'react';
import {
  useCurrentUsage,
  useMonthlySpend,
  usePaymentHistory,
  usePaymentMethods,
} from '@/features/billing/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Payment, PaymentStatus } from '@/features/billing/types';
import type { AgencyBillingData } from '@/pages/client/agency/AgBilC2Ledger';
import { formatDate } from '@/lib/format';

/**
 * Live-data adapter for the Agency-tier "Carousel Ledger" billing surface
 * (`pages/client/agency/AgBilC2Ledger.tsx`).
 *
 * Maps the existing TanStack-Query billing + workspace + usage hooks onto
 * the exact `AgencyBillingData` shape the Carousel Ledger consumes.
 * Modelled on `useProPlusReceiptData.ts`: real data where a hook surfaces
 * it, skeleton zeros + synthesised-but-stable derivations elsewhere (no
 * fabrication).
 *
 *   - no workspace + no auth user                → `data: null`
 *     (caller shows a loader / empty state)
 *   - still loading the primary payment history  → `isLoading: true`, `data: null`
 *
 * NB on the synthesised fields. The backend doesn't currently expose:
 *   - per-sub-client billing amount / plan / status (we surface name +
 *     mailbox-count-based estimates with TODOs flagged for when the
 *     per-sub-client billing table ships)
 *   - per-spend-bucket dollar amount (peer pool / compute / support).
 *     `LLM tokens` is derived from `useCurrentUsage().llm_tokens_used_mtd`
 *     with a conservative price-per-1k assumption; the rest stay 0.
 *
 * Re-export the shape so callers (`billing/AgencyBilling`) can import the
 * type from either module.
 */
export type { AgencyBillingData } from '@/pages/client/agency/AgBilC2Ledger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return formatDate(d);
}

function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function logoFor(name: string): string {
  const parts = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w[0] ?? '?').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (
    (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '?').toUpperCase()
  );
}

/** Map backend `PaymentStatus` → the ledger's narrower `InvoiceStatus`. */
function statusForInvoice(
  s: PaymentStatus,
): AgencyBillingData['invoices'][number]['status'] {
  if (s === 'succeeded') return 'paid';
  if (s === 'pending') return 'pending';
  if (s === 'refunded') return 'failed'; // refunded is conceptually closer to "failed" for billing display
  return 'failed';
}

/**
 * Synthesise an INV-YYYY-NNNNN style number deterministically from the
 * payment id so the column stays stable across renders. Same pattern the
 * Pro-Plus Receipt adapter uses (`useProPlusReceiptData.mapPayment`).
 */
function invoiceNumberFor(p: Payment): string {
  const year = new Date(p.created_at).getFullYear();
  const tail = p.id.slice(-5);
  const parsed = parseInt(tail, 16);
  const seqNum = Number.isFinite(parsed)
    ? parsed
    : Array.from(p.id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const seq = (Math.abs(seqNum) % 100_000).toString().padStart(5, '0');
  return `INV-${year}-${seq}`;
}

// ---------------------------------------------------------------------------
// Sub-client billing synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesise per-sub-client billing rows from the workspace's sub-client
 * list. The backend doesn't yet surface per-sub-client billing — flagged
 * TODO. Strategy:
 *   - mailbox_count > 0  → 'paid' status (placeholder); monthly amount = 0
 *   - mailbox_count == 0 → 'trial' status (no charge yet); monthly amount = 0
 *
 * We deliberately leave `monthlyAmountUsd` at 0 rather than fabricating
 * dollar amounts the user might trust as real billing. Same call we made
 * in `useAgencyDashboardData` for the dashboard sub-client MRR field.
 *
 * TODO(post-billing-roll-up): replace with a real `useSubClientBilling()`
 * hook once the backend ships the per-sub-client billing column.
 */
function buildSubClientBilling(
  subs: SubClient[],
): AgencyBillingData['subClientBilling'] {
  return subs.map((s) => {
    const mailboxCount = s.mailbox_count ?? 0;
    const status: AgencyBillingData['subClientBilling'][number]['status'] =
      mailboxCount > 0 ? 'paid' : 'trial';
    return {
      id: s.id,
      name: s.name,
      logoChar: logoFor(s.name),
      // TODO: skeleton — no per-sub-client plan column. Default to 'Pro'
      // until backend ships the field.
      plan: 'Pro',
      // TODO: skeleton — no per-sub-client billing amount column. Show $0
      // until the column ships; fabricating amounts would mislead.
      monthlyAmountUsd: 0,
      status,
      // TODO: skeleton — no per-sub-client next-due column.
      nextDueDate: '—',
      // TODO: skeleton — no per-sub-client last-paid timestamp.
      lastPaidAgo: status === 'trial' ? '—' : 'recent',
    };
  });
}

// ---------------------------------------------------------------------------
// Summary aggregates
// ---------------------------------------------------------------------------

/**
 * Aggregate MRR / QTD / YTD / MoM growth from the payment history. Each
 * is computed best-effort; with zero history we return all-zero summary.
 *
 * MRR is the sum of the most recent calendar month's succeeded payments
 * — a rough proxy for monthly recurring revenue until the backend
 * surfaces a dedicated MRR metric.
 */
function computeSummary(
  payments: Payment[],
  monthly: { month: string; amount_cents: number }[],
): {
  mrrUsd: number;
  quarterToDateUsd: number;
  yearToDateUsd: number;
  momGrowthPct: number;
  nextChargeUsd: number;
  overdueCountThisMonth: number;
} {
  const now = new Date();
  const thisYear = now.getFullYear();

  // Total succeeded amounts in the current calendar month → MRR proxy.
  // Reach for the monthly_spend series first (already aggregated), fall
  // back to summing the raw payment history.
  const ym = `${thisYear}-${pad2(now.getMonth() + 1)}`;
  const thisMonthPt = monthly.find((m) => m.month === ym);
  let mrrUsd = thisMonthPt ? Math.round(thisMonthPt.amount_cents / 100) : 0;
  if (mrrUsd === 0) {
    const mrrCents = payments
      .filter(
        (p) =>
          p.status === 'succeeded' &&
          new Date(p.created_at).getFullYear() === thisYear &&
          new Date(p.created_at).getMonth() === now.getMonth(),
      )
      .reduce((acc, p) => acc + p.amount_cents, 0);
    mrrUsd = Math.round(mrrCents / 100);
  }

  // QTD: succeeded payments since the start of the current quarter.
  const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const qStart = new Date(thisYear, qStartMonth, 1).getTime();
  const qtdCents = payments
    .filter(
      (p) =>
        p.status === 'succeeded' && new Date(p.created_at).getTime() >= qStart,
    )
    .reduce((acc, p) => acc + p.amount_cents, 0);
  const quarterToDateUsd = Math.round(qtdCents / 100);

  // YTD: succeeded payments since Jan 1 of this year.
  const yStart = new Date(thisYear, 0, 1).getTime();
  const ytdCents = payments
    .filter(
      (p) =>
        p.status === 'succeeded' && new Date(p.created_at).getTime() >= yStart,
    )
    .reduce((acc, p) => acc + p.amount_cents, 0);
  const yearToDateUsd = Math.round(ytdCents / 100);

  // MoM growth: this month vs last month, both pulled from monthly_spend
  // if present so the figure stays consistent with whatever the platform
  // is computing server-side.
  const lastMonth = new Date(thisYear, now.getMonth() - 1, 1);
  const lastYm = `${lastMonth.getFullYear()}-${pad2(lastMonth.getMonth() + 1)}`;
  const lastMonthPt = monthly.find((m) => m.month === lastYm);
  const lastMonthUsd = lastMonthPt
    ? Math.round(lastMonthPt.amount_cents / 100)
    : 0;
  const momGrowthPct =
    lastMonthUsd > 0
      ? Math.round(((mrrUsd - lastMonthUsd) / lastMonthUsd) * 1000) / 10
      : 0;

  // Next charge: best guess is the most recent succeeded payment amount.
  const lastSucceeded = payments.find((p) => p.status === 'succeeded');
  const nextChargeUsd = lastSucceeded
    ? Math.round(lastSucceeded.amount_cents / 100)
    : 0;

  // Overdue this month = failed payments dated in the current calendar month.
  const overdueCountThisMonth = payments.filter(
    (p) =>
      p.status === 'failed' &&
      new Date(p.created_at).getFullYear() === thisYear &&
      new Date(p.created_at).getMonth() === now.getMonth(),
  ).length;

  return {
    mrrUsd,
    quarterToDateUsd,
    yearToDateUsd,
    momGrowthPct,
    nextChargeUsd,
    overdueCountThisMonth,
  };
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyBillingDataResult {
  data: AgencyBillingData | null;
  isLoading: boolean;
}

export function useAgencyBillingData(): UseAgencyBillingDataResult {
  const workspaceQuery = useWorkspace();
  const paymentsQuery = usePaymentHistory();
  const usageQuery = useCurrentUsage();
  const methodsQuery = usePaymentMethods();
  const monthlyQuery = useMonthlySpend();
  const authUser = useAuthStore((s) => s.user);

  const isLoading = workspaceQuery.isLoading || paymentsQuery.isLoading;

  const data = useMemo<AgencyBillingData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    // Need at least an identity. Without ws OR authUser, fall through.
    if (!ws && !authUser) return null;

    const payments = paymentsQuery.data ?? [];
    const usage = usageQuery.data;
    const methods = methodsQuery.data ?? [];
    const monthly = monthlyQuery.data ?? [];

    // ── agency identity ────────────────────────────────────────────
    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    const planRaw = (ws?.plan as string | undefined) ?? authUser?.plan ?? 'agency';
    const plan = titleCase(planRaw);
    const billingEmail = authUser?.email ?? '';

    // Default payment method label — prefer `is_default`, fall back to
    // first. If none: a friendly hint rather than fabricating "Visa ••••".
    const defaultMethod =
      methods.find((m) => m.is_default) ?? methods[0] ?? null;
    const paymentMethodLabel =
      defaultMethod?.label ?? 'No method on file';

    // nextBillDate: best-effort = first day of next month. Backend doesn't
    // expose a dedicated next-bill timestamp yet.
    const nextBill = new Date();
    nextBill.setMonth(nextBill.getMonth() + 1, 1);
    const nextBillDate = fmtDate(nextBill.toISOString());

    // ── summary aggregates ─────────────────────────────────────────
    const summary = computeSummary(payments, monthly);

    // ── sub-client billing ─────────────────────────────────────────
    const subClientBilling = buildSubClientBilling(ws?.sub_clients ?? []);

    // ── invoices (recent first, capped at 20) ──────────────────────
    const invoices: AgencyBillingData['invoices'] = payments
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        number: invoiceNumberFor(p),
        issueDate: fmtDate(p.created_at),
        amountUsd: Math.round(p.amount_cents / 100),
        status: statusForInvoice(p.status),
        // All invoices we have visibility into are the agency's own; the
        // sub-client billing column will surface per-sub-client invoices
        // separately once the API ships.
        subClientId: null,
        pdfAvailable: p.status === 'succeeded',
      }));

    // ── spend buckets ──────────────────────────────────────────────
    // LLM tokens is the one bucket we can compute honestly from live
    // data: take `llm_tokens_used_mtd` and multiply by a conservative
    // price-per-1k-tokens. The other buckets stay at 0 with TODOs.
    const llmTokensUsd =
      usage && usage.llm_tokens_used_mtd > 0
        ? Math.round((usage.llm_tokens_used_mtd / 1000) * 0.5 * 100) / 100
        : 0;

    const spendBuckets: AgencyBillingData['spendBuckets'] = [
      // TODO: skeleton — no per-bucket dollar amount column. Surface 0
      // until a real spend-breakdown endpoint ships.
      { id: 'peer', label: 'Helper group', amountUsd: 0, deltaPct: 0 },
      { id: 'compute', label: 'Compute', amountUsd: 0, deltaPct: 0 },
      { id: 'llm', label: 'AI tokens', amountUsd: llmTokensUsd, deltaPct: 0 },
      { id: 'support', label: 'Support', amountUsd: 0, deltaPct: 0 },
    ];

    return {
      agency: {
        name: agencyName,
        plan,
        nextBillDate,
        billingEmail,
        paymentMethodLabel,
      },
      summary,
      subClientBilling,
      invoices,
      spendBuckets,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    paymentsQuery.data,
    usageQuery.data,
    methodsQuery.data,
    monthlyQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
