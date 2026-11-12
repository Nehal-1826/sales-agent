import { CreditCard, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMe } from '@/features/auth/useAuthApi';
import { usePaymentHistory, useCancelSubscription, useQuickUpgrade } from '@/features/billing/api';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';

interface Plan {
  id: string;
  name: string;
}

const ALL_PLANS: Plan[] = [
  { id: 'starter', name: 'Starter' },
  { id: 'pro', name: 'Pro' },
  { id: 'pro_plus', name: 'Pro Plus' },
  { id: 'agency', name: 'Agency' },
];

const PLAN_PRICES: Record<string, number> = {
  starter: 29,
  pro: 79,
  agency: 199,
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ['1 mailbox', 'Up to 50 emails/day', 'Basic analytics', 'Email support'],
  pro: [
    '5 mailboxes',
    'Up to 100 emails/day each',
    'Full analytics',
    'Domain records (DNS) validator',
    'Priority support',
  ],
  agency: [
    '25 mailboxes',
    'White-label reports',
    'Sub-clients & API',
    'Dedicated helper-group routing',
    'Priority support',
  ],
};

function computeNextBillingDate(latestPaymentAt: string | null): Date {
  const base = latestPaymentAt ? new Date(latestPaymentAt) : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + 30);
  return next;
}

export function CurrentPlanCard() {
  const me = useMe();
  const payments = usePaymentHistory();
  // Rules of Hooks: every hook must run on every render, before any early
  // return. useLocaleFormat() subscribes to the zustand locale store (an
  // internal useSyncExternalStore/useRef), so calling it *after* the
  // `me.isLoading` early-return changed the hook count between the loading
  // and loaded renders — which crashed the Billing page with "Rendered more
  // hooks than during the previous render". Hoisting it fixes that.
  const { money, date } = useLocaleFormat();

  if (me.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const planId = me.data?.plan ?? 'starter';
  const price = PLAN_PRICES[planId] ?? 0;
  const features = PLAN_FEATURES[planId] ?? [];
  const latestPayment = payments.data?.[0]?.created_at ?? null;
  const nextBilling = computeNextBillingDate(latestPayment);
  const cancel = useCancelSubscription();
  const quickUpgrade = useQuickUpgrade();

  const handleQuickUpgrade = async (planId: string) => {
    try {
      await quickUpgrade.mutateAsync(planId);
      toast.success('Plan updated successfully.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update plan.'));
    }
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
      await cancel.mutateAsync();
      toast.success('Subscription cancelled.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to cancel subscription.'));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-text-dim" /> Current plan
          </CardTitle>
          <CardDescription>Your active subscription and next billing cycle.</CardDescription>
        </div>
        <div className="flex flex-col items-end gap-2">
          <select
            value={planId}
            onChange={(e) => handleQuickUpgrade(e.target.value)}
            disabled={quickUpgrade.isPending}
            className="rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-xs font-semibold focus-ring"
          >
            {ALL_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {quickUpgrade.isPending && <Loader2 size={12} className="animate-spin text-accent" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h2 className="text-3xl font-semibold capitalize text-text">{planId}</h2>
          <span className="text-lg text-text-dim">
            <span className="font-semibold text-text">{money(price)}</span>/mo
          </span>
        </div>

        <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3 text-xs text-text-dim">
          Next billing date:{' '}
          <span className="font-medium text-text">
            {date(nextBilling)}
          </span>
        </div>

        {features.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2 text-sm text-text-dim sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="pt-2">
          <button
            onClick={handleCancel}
            disabled={cancel.isPending}
            className="flex items-center gap-2 text-xs text-text-dim underline decoration-dotted underline-offset-4 hover:text-text focus-ring rounded"
          >
            {cancel.isPending && <Loader2 size={12} className="animate-spin" />}
            Cancel plan
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
