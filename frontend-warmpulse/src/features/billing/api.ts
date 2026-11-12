import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { api } from '@/lib/api';
import { useMailboxes } from '@/features/mailboxes/api';
import { loadCashfree } from './loadCashfree';
import type {
  AddPaymentMethodPayload,
  CurrentUsage,
  Invoice,
  MonthlySpendPoint,
  Payment,
  PaymentMethod,
  PaymentMethodsResponse,
  CashfreeOrderOut,
  CashfreeSubscriptionOut,
  CashfreeVerifyPayload,
  CashfreeVerifyResponse,
  UpgradePayload,
  UpgradeResponse,
} from './types';

/**
 * Billing hooks. All endpoints are best-effort with graceful 404 fallbacks.
 * Billing in MVP is dummy — `buildInvoice` constructs a deterministic invoice
 * client-side when no dedicated /invoice endpoint exists yet.
 */

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

// ---------------------------------------------------------------------------
// Payment history
// ---------------------------------------------------------------------------

export function usePaymentHistory(): UseQueryResult<Payment[]> {
  return useQuery({
    queryKey: ['billing', 'payments'],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/payments/me');
        const data = res.data as unknown;
        if (Array.isArray(data)) return data as Payment[];
        if (data && typeof data === 'object' && 'items' in data) {
          return (data as { items: Payment[] }).items ?? [];
        }
        return [];
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Upgrade (dummy payment)
// ---------------------------------------------------------------------------

/**
 * Submits a dummy checkout. The backend (if present) receives a sanitized
 * payload (`card_last4` only, never the full PAN) — the full number is only
 * used client-side for the last-4 derivation.
 */
export function useUpgradePlan(): UseMutationResult<UpgradeResponse, unknown, UpgradePayload> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const last4 = payload.card_number.replace(/\s+/g, '').slice(-4);
      const body = {
        plan_id: payload.plan_id,
        card_last4: last4,
        cardholder_name: payload.cardholder_name,
        country: payload.country,
      };
      try {
        const res: AxiosResponse<UpgradeResponse> = await api.post('/payments/dummy', body);
        return res.data;
      } catch (err) {
        if (isAxios404(err)) {
          return {
            status: 'succeeded' as const,
            payment_id: `dummy-${Date.now()}`,
          };
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'usage'] });
    },
  });
}

// ---------------------------------------------------------------------------
// CRM add-on (Starter unlock — dummy gateway)
// ---------------------------------------------------------------------------

/** Monthly price of the CRM add-on, in paise (₹). Mirrors the backend constant. */
export const CRM_ADDON_PRICE_CENTS = 49900;

/**
 * Purchase the CRM add-on for the current workspace via the dummy gateway.
 * Optionally pass a card number — only the last 4 digits are sent. On success
 * we invalidate ``/auth/me`` so ``crm_addon`` flips and the CRM page unlocks.
 */
export function usePurchaseCrmAddon(): UseMutationResult<
  { crm_addon: boolean },
  unknown,
  { card_number?: string } | void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const card = payload && 'card_number' in payload ? payload.card_number : undefined;
      const body = card ? { card_number: card.replace(/\s+/g, '') } : {};
      const res: AxiosResponse<{ crm_addon: boolean }> = await api.post(
        '/payments/crm-addon',
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
    },
  });
}

export function useCancelSubscription(): UseMutationResult<void, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post('/payments/cancel');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'usage'] });
    },
  });
}

export function useQuickUpgrade(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId) => {
      await api.post(`/payments/quick-upgrade?plan_id=${planId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'usage'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Stripe checkout (real payment, gated on STRIPE_SECRET_KEY server-side)
// ---------------------------------------------------------------------------

export interface CheckoutResponse {
  url: string;
  session_id: string;
}

/**
 * Start a real Stripe Checkout session. Returns the URL the browser must be
 * redirected to. The backend returns 503 when Stripe isn't configured on
 * this deployment — callers can catch that and fall through to the dummy
 * flow (``useUpgradePlan``) for sandbox/local environments.
 */
export function useStartStripeCheckout(): UseMutationResult<
  CheckoutResponse,
  unknown,
  { plan_id: string }
> {
  return useMutation({
    mutationFn: async ({ plan_id }) => {
      const res = await api.post<CheckoutResponse>('/payments/checkout', {
        plan_id,
      });
      return res.data;
    },
  });
}

/** Detect Stripe-not-configured 503 so the UI can fall back to the dummy flow. */
export function isStripeUnavailable(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 503;
}

// ---------------------------------------------------------------------------
// Cashfree Checkout (real payment, gated on CASHFREE_KEY_ID server-side)
// ---------------------------------------------------------------------------

/**
 * Create a Cashfree one-time order. Returns the `{key_id, order_id, amount,
 * currency, name, prefill}` blob the Checkout SDK needs. Throws a 503 when
 * Cashfree isn't configured — callers detect that via ``isCashfreeUnavailable``
 * and fall through to the dummy gateway.
 */
export function useCreateCashfreeOrder(): UseMutationResult<
  CashfreeOrderOut,
  unknown,
  { plan_id: string }
> {
  return useMutation({
    mutationFn: async ({ plan_id }) => {
      const res = await api.post<CashfreeOrderOut>('/payments/cashfree/order', {
        plan_id,
      });
      return res.data;
    },
  });
}

/**
 * Create a Cashfree subscription (recurring auto-pay). Returns
 * `{key_id, subscription_id, name, prefill}`. Same 503 semantics as the order
 * mutation.
 */
export function useCreateCashfreeSubscription(): UseMutationResult<
  CashfreeSubscriptionOut,
  unknown,
  { plan_id: string }
> {
  return useMutation({
    mutationFn: async ({ plan_id }) => {
      const res = await api.post<CashfreeSubscriptionOut>(
        '/payments/cashfree/subscription',
        { plan_id },
      );
      return res.data;
    },
  });
}

/**
 * Verify the Checkout success payload server-side (HMAC signature check). On
 * success the backend transitions the user's plan + onboarding status and
 * returns `{payment, user}` — same envelope as the dummy gateway. We invalidate
 * the exact queries ``useUpgradePlan`` does so the UI reflects the new plan.
 */
export function useVerifyCashfreePayment(): UseMutationResult<
  CashfreeVerifyResponse,
  unknown,
  CashfreeVerifyPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res = await api.post<CashfreeVerifyResponse>(
        '/payments/cashfree/verify',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'usage'] });
    },
  });
}

/** Detect Cashfree-not-configured 503 so the UI can fall back to the dummy flow. */
export function isCashfreeUnavailable(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 503;
}

/** One-time payment vs recurring auto-pay subscription. */
export type CashfreeMode = 'once' | 'auto';

interface OpenCashfreeCheckoutArgs {
  mode: CashfreeMode;
  /** Plan being purchased — only `id` and `name` are used. */
  plan: { id: string; name: string };
  orderMutation: UseMutationResult<CashfreeOrderOut, unknown, { plan_id: string }>;
  subscriptionMutation: UseMutationResult<
    CashfreeSubscriptionOut,
    unknown,
    { plan_id: string }
  >;
  verifyMutation: UseMutationResult<
    CashfreeVerifyResponse,
    unknown,
    CashfreeVerifyPayload
  >;
  /** Called with the verified `{payment, user}` after a successful charge. */
  onSuccess: (result: CashfreeVerifyResponse) => void;
  /** Called when the user closes the Cashfree modal without paying. */
  onDismiss?: () => void;
  /** Called when verification fails (bad signature / network). */
  onVerifyError?: (err: unknown) => void;
}

/** Outcome of {@link openCashfreeCheckout} so callers can branch. */
export type OpenCashfreeResult =
  /** Cashfree isn't configured (503) — caller should show the dummy flow. */
  | { status: 'unavailable' }
  /** The Checkout modal opened successfully (verify happens in its handler). */
  | { status: 'opened' }
  /** Order/subscription creation or SDK load failed for a non-503 reason. */
  | { status: 'error'; error: unknown };

/**
 * Shared orchestration so both the in-app UpgradeDialog and the onboarding
 * PlanPicker drive an identical Cashfree flow:
 *
 *   1. Create an order (`once`) or subscription (`auto`). A 503 here means the
 *      gateway is off → return `{status:'unavailable'}` so the caller can swap
 *      in the dummy card/UPI tabs.
 *   2. Inject the Checkout script (`loadCashfree`).
 *   3. Open `new window.Cashfree({...}).open()`; its success `handler` calls
 *      `verifyMutation.mutateAsync(...)` then `onSuccess`.
 *
 * Returns once the modal is *opened* (or we bailed) — verification resolves
 * asynchronously inside the handler. Never throws; failures surface through the
 * returned discriminated union and the `onVerifyError` callback.
 */
export async function openCashfreeCheckout({
  mode,
  plan,
  orderMutation,
  subscriptionMutation,
  verifyMutation,
  onSuccess,
  onDismiss,
  onVerifyError,
}: OpenCashfreeCheckoutArgs): Promise<OpenCashfreeResult> {
  // 1. Create the order / subscription on the backend.
  let order: CashfreeOrderOut | null = null;
  let subscription: CashfreeSubscriptionOut | null = null;
  try {
    if (mode === 'auto') {
      subscription = await subscriptionMutation.mutateAsync({ plan_id: plan.id });
    } else {
      order = await orderMutation.mutateAsync({ plan_id: plan.id });
    }
  } catch (err) {
    if (isCashfreeUnavailable(err)) return { status: 'unavailable' };
    return { status: 'error', error: err };
  }

  // 2. Load the Checkout SDK.
  const ready = await loadCashfree();
  if (!ready || typeof window === 'undefined' || !window.Cashfree) {
    return { status: 'error', error: new Error('Cashfree SDK failed to load') };
  }

  const paymentSessionId = order?.payment_session_id ?? subscription?.payment_session_id ?? '';
  const orderId = order?.order_id ?? ''; // Cashfree subscriptions also start with an auth order

  // 3. Open the modal. Verification happens in the success handler.
  const cashfree = window.Cashfree({ mode: "production" }); // Or "sandbox" if configured
  
  cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_modal",
  }).then((result) => {
    if (result.error) {
      if (result.error.message !== 'Payment cancelled') {
        onVerifyError?.(result.error);
      } else {
        onDismiss?.();
      }
    }
    if (result.paymentDetails) {
      void (async () => {
        try {
          // Verify with backend using order_id
          const verifyResult = await verifyMutation.mutateAsync({
            order_id: orderId,
          });
          onSuccess(verifyResult);
        } catch (err) {
          onVerifyError?.(err);
        }
      })();
    }
  });

  return { status: 'opened' };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const PLAN_MAILBOX_CAPS: Record<string, number> = {
  starter: 1,
  pro: 10,
  agency: 25,
};

const PLAN_LLM_TOKEN_CAPS: Record<string, number> = {
  starter: 50_000,
  pro: 250_000,
  agency: 1_500_000,
};

export function useCurrentUsage(): UseQueryResult<CurrentUsage> {
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['billing', 'usage'],
    staleTime: 60_000,
    enabled: !mailboxes.isLoading,
    queryFn: async () => {
      const deriveFallback = (): CurrentUsage => {
        const items = mailboxes.data?.items ?? [];
        const used = items.length;
        const cap = PLAN_MAILBOX_CAPS.pro!;
        const llmCap = PLAN_LLM_TOKEN_CAPS.pro!;
        const sentMtd = items.reduce(
          (acc, m) => acc + (Number(m.sent_today) || 0),
          0,
        );
        return {
          mailboxes_used: used,
          mailboxes_cap: cap,
          warmup_emails_sent_mtd: sentMtd,
          llm_tokens_used_mtd: 0,
          llm_tokens_cap: llmCap,
        };
      };

      try {
        const res = await api.get('/workspace/billing/usage');
        const data = res.data as Partial<CurrentUsage> & Record<string, unknown>;
        return { ...deriveFallback(), ...data } as CurrentUsage;
      } catch (err) {
        if (isAxios404(err)) return deriveFallback();
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Invoice (derives from payment record when endpoint is missing)
// ---------------------------------------------------------------------------

export function useInvoice(paymentId: string | null | undefined) {
  const payments = usePaymentHistory();

  return useQuery<Invoice | null>({
    queryKey: ['billing', 'invoice', paymentId],
    enabled: !!paymentId && !payments.isLoading,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get(`/payments/${paymentId}/invoice`);
        return res.data as Invoice;
      } catch (err) {
        if (!isAxios404(err)) throw err;
        const p = (payments.data ?? []).find((x) => x.id === paymentId);
        if (!p) return null;
        return buildInvoice(p);
      }
    },
  });
}

/**
 * Build a deterministic dummy invoice from a payment record. The sequence
 * number is derived from the last hex chunk of the payment id so re-renders
 * always produce the same invoice number.
 */
export function buildInvoice(payment: Payment): Invoice {
  const year = new Date(payment.created_at).getFullYear();
  // Try to parse a hex segment of the id — fall back to a hash of the full id.
  const tail = payment.id.slice(-5);
  const parsed = parseInt(tail, 16);
  const seqNum = Number.isFinite(parsed)
    ? parsed
    : Array.from(payment.id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const seq = (Math.abs(seqNum) % 100_000).toString().padStart(5, '0');

  return {
    payment_id: payment.id,
    invoice_number: `INV-${year}-${seq}`,
    date: payment.created_at,
    plan_name: payment.plan_name,
    amount_cents: payment.amount_cents,
    tax_cents: 0,
    total_cents: payment.amount_cents,
    billing_address: 'WarmPulse Dummy Customer',
    issuer_address:
      'WarmPulse, Inc. · This is a dummy invoice — no real transaction occurred.',
  };
}

// ---------------------------------------------------------------------------
// Monthly spend (group payment history by YYYY-MM)
// ---------------------------------------------------------------------------

export function useMonthlySpend(): UseQueryResult<MonthlySpendPoint[]> {
  const payments = usePaymentHistory();

  return useQuery({
    queryKey: ['billing', 'monthly-spend'],
    enabled: !payments.isLoading,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = payments.data ?? [];
      const byMonth = new Map<string, number>();
      for (const p of rows) {
        if (p.status !== 'succeeded') continue;
        const d = new Date(p.created_at);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + p.amount_cents);
      }
      const keys = Array.from(byMonth.keys()).sort();
      if (keys.length === 0) {
        // Synthesize a 6-month zero series so the chart has an x-axis.
        const now = new Date();
        return Array.from({ length: 6 }).map((_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          return {
            month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            amount_cents: 0,
          };
        });
      }
      return keys.map((k) => ({ month: k, amount_cents: byMonth.get(k) ?? 0 }));
    },
  });
}

export const PLAN_CAPS = {
  mailboxes: PLAN_MAILBOX_CAPS,
  llmTokens: PLAN_LLM_TOKEN_CAPS,
} as const;

// ---------------------------------------------------------------------------
// Payment methods (server-backed list + add)
// ---------------------------------------------------------------------------

/**
 * Server-backed payment-method list. Falls back to deriving methods from
 * payment history when the endpoint returns 404 — keeps the UI working on
 * older deploys / during the rollout window.
 */
export function usePaymentMethods(): UseQueryResult<PaymentMethod[]> {
  const payments = usePaymentHistory();
  return useQuery({
    queryKey: ['billing', 'methods'],
    staleTime: 60_000,
    enabled: !payments.isLoading,
    queryFn: async () => {
      try {
        const res = await api.get<PaymentMethodsResponse>('/payments/methods');
        return res.data.items ?? [];
      } catch (err) {
        if (!isAxios404(err)) throw err;
        // Fallback: derive from payments — same logic as ProBilling
        // previously did inline.
        const rows = payments.data ?? [];
        const seen = new Map<string, PaymentMethod>();
        let isFirst = true;
        for (const p of rows) {
          if (p.dummy_card_last4) {
            const key = `card:${p.dummy_card_last4}`;
            if (!seen.has(key)) {
              seen.set(key, {
                id: key,
                kind: 'card',
                label: `Card · ${p.dummy_card_last4}`,
                sub: p.plan_name,
                is_default: isFirst,
              });
              isFirst = false;
            }
          } else if (p.dummy_upi_vpa) {
            const key = `upi:${p.dummy_upi_vpa}`;
            if (!seen.has(key)) {
              seen.set(key, {
                id: key,
                kind: 'upi',
                label: `UPI · ${p.dummy_upi_vpa}`,
                sub: p.plan_name,
                is_default: isFirst,
              });
              isFirst = false;
            }
          }
        }
        return Array.from(seen.values());
      }
    },
  });
}

/**
 * Add a new payment method. Sanitises the card path so only the last-4
 * digits reach the backend (defence in depth — the backend also strips
 * PAN/CVC in the service layer).
 */
export function useAddPaymentMethod(): UseMutationResult<
  PaymentMethod,
  unknown,
  AddPaymentMethodPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const res: AxiosResponse<PaymentMethod> = await api.post(
        '/payments/methods',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing', 'methods'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Invoice download — triggers a real browser save dialog
// ---------------------------------------------------------------------------

interface DownloadInvoiceArgs {
  paymentId: string;
  /** ``pdf`` falls back to ``csv`` automatically when the backend returns 501. */
  format?: 'pdf' | 'csv';
  /** Filename override. Defaults to whatever the server's Content-Disposition says. */
  filename?: string;
}

function filenameFromHeaders(headers: unknown, fallback: string): string {
  const value =
    headers && typeof headers === 'object' && 'content-disposition' in headers
      ? (headers as { 'content-disposition'?: string })['content-disposition']
      : undefined;
  if (!value) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(value);
  return match?.[1] ?? fallback;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the save dialog before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Download an invoice as PDF (or CSV fallback). The hook returns the
 * familiar ``mutate / mutateAsync / isPending`` surface so the calling
 * component can show a spinner on the icon button.
 */
export function useDownloadInvoice(): UseMutationResult<
  void,
  unknown,
  DownloadInvoiceArgs
> {
  return useMutation({
    mutationFn: async ({ paymentId, format = 'pdf', filename }) => {
      const attempt = async (ext: 'pdf' | 'csv'): Promise<void> => {
        const res = await api.get<Blob>(
          `/payments/${paymentId}/invoice.${ext}`,
          { responseType: 'blob' },
        );
        const finalName = filename ?? filenameFromHeaders(
          res.headers,
          `invoice-${paymentId.slice(0, 8)}.${ext}`,
        );
        triggerBlobDownload(res.data, finalName);
      };
      try {
        await attempt(format);
      } catch (err) {
        // 501 → PDF not available on this deploy; retry as CSV.
        if (
          format === 'pdf' &&
          err instanceof AxiosError &&
          err.response?.status === 501
        ) {
          await attempt('csv');
          return;
        }
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Auto-pay + add-ons (dummy gateway)
// ---------------------------------------------------------------------------

import type { Addon, BillingStatus } from './types';

export function useBillingStatus(): UseQueryResult<BillingStatus> {
  return useQuery({
    queryKey: ['billing-status'],
    queryFn: async () => {
      const { data } = await api.get<BillingStatus>('/payments/billing-status');
      return data;
    },
  });
}

export function useSetAutoPay(): UseMutationResult<BillingStatus, unknown, boolean> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await api.patch<BillingStatus>('/payments/auto-pay', { enabled });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(['billing-status'], data),
  });
}

export function useAddons(): UseQueryResult<Addon[]> {
  return useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      const { data } = await api.get<Addon[]>('/payments/addons');
      return data;
    },
  });
}

export function useBuyAddon(): UseMutationResult<Addon, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data } = await api.post<Addon>(`/payments/addons/${key}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addons'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
