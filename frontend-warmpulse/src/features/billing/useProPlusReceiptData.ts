import { useMemo } from 'react';
import {
  useCurrentUsage,
  usePaymentHistory,
  usePaymentMethods,
} from '@/features/billing/api';
import type { Payment, PaymentStatus as ApiPaymentStatus } from '@/features/billing/types';
import { useWorkspace } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import { useMailboxes } from '@/features/mailboxes/api';
import { formatDate, formatNumber } from '@/lib/format';
import {
  RECEIPT_SKELETON,
  type LineItem,
  type PastPayment,
  type PaymentStatus,
  type ReceiptData,
  type ReceiptPeriod,
  type ReceiptWorkspace,
} from '@/pages/client/proplus/ProPlusBil1Receipt';

/**
 * Live-data adapter for the Pro-Plus "Receipt & Ledger" billing surface
 * (`pages/client/proplus/ProPlusBil1Receipt.tsx`).
 *
 * Maps the existing TanStack-Query billing + workspace hooks onto the exact
 * `ReceiptData` shape the receipt consumes. Modelled on
 * `useProPlusWorkspaceData.ts`: real data where a hook surfaces it, skeleton
 * values elsewhere (no fabrication). Resilient by design:
 *
 *   - no workspace AND no payments              → `data: null`
 *     (caller shows the "complete onboarding" EmptyState)
 *   - still loading the primary payment history → `isLoading: true`, `data: null`
 *   - any best-effort hook 404s / errors        → keep skeleton field, never block
 *
 * Re-export the shape so callers (`billing/ProPlusBilling`) can import the
 * type from either module.
 */
export type {
  LineItem,
  PastPayment,
  PaymentStatus,
  ReceiptData,
  ReceiptPeriod,
  ReceiptWorkspace,
} from '@/pages/client/proplus/ProPlusBil1Receipt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domainFromEmail(email: string | undefined | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthLabel(d: Date): string {
  return formatDate(d);
}

/** Map a real Payment row → receipt PastPayment. */
function mapPayment(p: Payment): PastPayment {
  const method = p.dummy_card_last4
    ? `Visa ··${p.dummy_card_last4}`
    : p.dummy_upi_vpa
      ? `UPI ${p.dummy_upi_vpa}`
      : (p.payment_method ?? 'Card');
  const status: PaymentStatus = mapStatus(p.status);
  // The receipt design uses "WP-RCT-YYYY-NNNNN" — derive deterministically
  // from the payment id so the column stays stable across renders.
  const year = new Date(p.created_at).getFullYear();
  const tail = p.id.slice(-5);
  const parsed = parseInt(tail, 16);
  const seqNum = Number.isFinite(parsed)
    ? parsed
    : Array.from(p.id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const seq = (Math.abs(seqNum) % 100_000).toString().padStart(5, '0');
  return {
    id: p.id,
    date: p.created_at,
    rcpt: `WP-RCT-${year}-${seq}`,
    method,
    amount: Math.round(p.amount_cents / 100),
    status,
  };
}

/** Receipt rows are tri-state — collapse the API quadripartite into them. */
function mapStatus(s: ApiPaymentStatus): PaymentStatus {
  if (s === 'succeeded') return 'paid';
  if (s === 'refunded') return 'refunded';
  // Pending and failed both surface as "failed" in the receipt's tri-state
  // pill (pending is rare on the dummy gateway — when seen, the user needs
  // to retry; "failed" is the right read).
  return 'failed';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseProPlusReceiptDataResult {
  data: ReceiptData | null;
  isLoading: boolean;
}

export function useProPlusReceiptData(): UseProPlusReceiptDataResult {
  // Primary gate — payment history. The receipt's identity is the past-payment
  // ledger, so we wait for it the same way the workspace adapter waits for
  // the workspace payload.
  const paymentsQuery = usePaymentHistory();
  // Best-effort siblings: workspace gives name/domain, methods supply
  // last-4, usage gives the per-cycle mailbox + sends counters, mailboxes
  // gives the active mailbox count. Every fallback in the underlying hooks
  // means we never block on them.
  const workspaceQuery = useWorkspace();
  const methodsQuery = usePaymentMethods();
  const usageQuery = useCurrentUsage();
  const mailboxesQuery = useMailboxes();
  const authUser = useAuthStore((s) => s.user);

  const payments = paymentsQuery.data ?? [];
  const ws = workspaceQuery.data ?? null;
  const methods = methodsQuery.data ?? [];
  const usage = usageQuery.data ?? null;
  const mailboxItems = mailboxesQuery.data?.items ?? [];
  const isLoading = paymentsQuery.isLoading;

  const data = useMemo<ReceiptData | null>(() => {
    if (paymentsQuery.isLoading) return null;
    // Emptiness rule — when the workspace has no payments AND no workspace
    // record, there's nothing to render a receipt for. The wrapper shows the
    // "complete onboarding" EmptyState in that case.
    if (payments.length === 0 && !ws) return null;

    // ── workspace ────────────────────────────────────────────────────────
    const workspaceName = ws?.name ?? RECEIPT_SKELETON.workspace.name;
    const billingEmail =
      authUser?.email ?? RECEIPT_SKELETON.workspace.billingEmail;
    const domain =
      domainFromEmail(authUser?.email) || RECEIPT_SKELETON.workspace.domain;
    const workspace: ReceiptWorkspace = {
      name: workspaceName,
      domain,
      billingEmail,
      // TODO: skeleton — no tax-id field on the workspace payload yet (GSTIN
      // is captured under Settings but not exposed on the workspace read).
      // Keep the skeleton placeholder so the ledger row renders without
      // claiming a tax registration that may not exist.
      taxId: RECEIPT_SKELETON.workspace.taxId,
    };

    // ── period ───────────────────────────────────────────────────────────
    // Anchor on the most recent succeeded payment (the most recent settled
    // cycle); when there are no payments yet, fall back to the current
    // calendar month so the receipt still has a coherent label.
    const succeeded = payments
      .filter((p) => p.status === 'succeeded')
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    const latest = succeeded[0] ?? null;
    const anchor = latest ? new Date(latest.created_at) : new Date();
    const fromDate = startOfMonth(anchor);
    const toDate = endOfMonth(anchor);
    const yearMonth = `${fromDate.getFullYear()}${pad2(fromDate.getMonth() + 1)}`;
    // Deterministic receipt number derived from period (so re-renders within
    // the same cycle are stable). No backend "receipt number" endpoint.
    const receiptNo = latest
      ? mapPayment(latest).rcpt
      : `RC-${yearMonth}`;
    const period: ReceiptPeriod = {
      label: `${monthLabel(fromDate)} cycle`,
      from: isoDay(fromDate),
      to: isoDay(toDate),
      receiptNo,
      issuedOn: latest ? isoDay(new Date(latest.created_at)) : isoDay(new Date()),
    };

    // ── line items — plan + real usage + Pro Plus unlocks ─────────────────
    // Anchor amount on latest succeeded payment for full fidelity. When the
    // workspace has never paid we keep the skeleton plan-row price so the
    // ledger still totals correctly under the "Pro Plus base" header.
    const planAmountUsd = latest
      ? Math.round(latest.amount_cents / 100)
      : RECEIPT_SKELETON.lineItems[0]?.amount ?? 0;
    const planRow: LineItem = {
      id: '01',
      sku: 'WP-PLUS-SUB',
      desc: 'Pro Plus subscription · monthly',
      sub: latest
        ? `${latest.plan_name} · monthly cycle`
        : RECEIPT_SKELETON.lineItems[0]?.sub,
      qty: 1,
      qtyUnit: 'seat',
      unit: planAmountUsd,
      amount: planAmountUsd,
    };

    const mailboxesUsed = usage?.mailboxes_used ?? mailboxItems.length;
    const mailboxesCap =
      usage?.mailboxes_cap ?? RECEIPT_SKELETON.lineItems[1]?.qty ?? 15;
    const idle = Math.max(0, mailboxesCap - mailboxesUsed);
    const mailboxRow: LineItem = {
      id: '02',
      sku: 'WP-MBX-ACTIVE',
      desc: 'Mailboxes in service this cycle',
      sub: `${mailboxesUsed} of ${mailboxesCap} active · ${idle} ${
        idle === 1 ? 'seat' : 'seats'
      } idle`,
      qty: mailboxesUsed,
      qtyUnit: 'mbx',
      unit: 0,
      amount: 0,
      included: true,
    };

    const sendsMtd = usage?.warmup_emails_sent_mtd ?? 0;
    const sendsRow: LineItem = {
      id: '03',
      sku: 'WP-SEND-VOL',
      desc: 'Email sends posted',
      sub: sendsMtd > 0
        ? `${formatNumber(sendsMtd)} outbound this cycle`
        : // TODO: skeleton — no sends yet for the current cycle (or usage
          // endpoint not wired). Keep the design's example sub-line so the
          // row reads naturally.
          RECEIPT_SKELETON.lineItems[2]?.sub,
      qty: sendsMtd,
      qtyUnit: 'send',
      unit: 0,
      amount: 0,
      included: true,
    };

    // Lines 04–08 are the Pro Plus unlocks. They have no API source (the
    // entitlement flags live on the plan capabilities matrix). Keep the
    // skeleton rows verbatim — they describe the plan, not metered usage.
    const unlockRows: LineItem[] = (RECEIPT_SKELETON.lineItems.slice(3) ??
      []) as LineItem[];

    const lineItems: LineItem[] = [planRow, mailboxRow, sendsRow, ...unlockRows];

    // ── past payments ────────────────────────────────────────────────────
    const pastPayments: PastPayment[] =
      payments.length > 0
        ? payments
            .slice()
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )
            .map(mapPayment)
        : // TODO: skeleton — no payment history yet. Keep skeleton rows so
          // the continuation receipt renders the design's ledger table.
          RECEIPT_SKELETON.pastPayments;

    // ── card last-4 ──────────────────────────────────────────────────────
    const defaultCard =
      methods.find((m) => m.kind === 'card' && m.is_default) ??
      methods.find((m) => m.kind === 'card');
    const last4FromMethod = defaultCard?.label.match(/(\d{4})\s*$/)?.[1];
    const last4FromPayment = succeeded.find((p) => p.dummy_card_last4)
      ?.dummy_card_last4 ?? null;
    const cardLast4 =
      last4FromMethod ?? last4FromPayment ?? RECEIPT_SKELETON.cardLast4;

    // ── next renewal ─────────────────────────────────────────────────────
    // 30 days after the latest succeeded payment. When there are no
    // payments we project from "today" so the side-rail still has a
    // sensible date.
    const renewalAnchor = latest ? new Date(latest.created_at) : new Date();
    renewalAnchor.setDate(renewalAnchor.getDate() + 30);
    const nextRenewalDate = isoDay(renewalAnchor);

    return {
      workspace,
      period,
      lineItems,
      pastPayments,
      cardLast4,
      nextRenewalDate,
    };
  }, [
    paymentsQuery.isLoading,
    payments,
    ws,
    methods,
    usage,
    mailboxItems,
    authUser,
  ]);

  return { data, isLoading };
}
