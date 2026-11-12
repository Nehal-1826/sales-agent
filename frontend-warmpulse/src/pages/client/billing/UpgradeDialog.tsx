import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Lock,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { formatMoney } from '@/lib/format';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import {
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
} from '@/components/ui/AppTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/AppToast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMe } from '@/features/auth/useAuthApi';
import { useMailboxes } from '@/features/mailboxes/api';
import { useUpgradePlan } from '@/features/billing/api';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  mailbox_limit: number;
  features: string[];
  recommended?: boolean;
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price_monthly: 29,
    mailbox_limit: 1,
    features: ['1 mailbox', 'Up to 50 emails/day', 'Basic analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price_monthly: 79,
    mailbox_limit: 5,
    features: ['5 mailboxes', 'Full analytics', 'Domain records (DNS) validator'],
    recommended: true,
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price_monthly: 119,
    mailbox_limit: 15,
    features: ['15 mailboxes', 'Everything in Pro', 'Inbox Test', 'Priority support'],

  },
];

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
];

const cardSchema = z.object({
  card_number: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{16}$/, 'Card must be 16 digits')),
  expiry_mmyy: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
  cvc: z.string().regex(/^\d{3}$/, 'CVC must be 3 digits'),
  cardholder_name: z.string().min(2, 'Name required'),
  country: z.string().min(2, 'Country required'),
});

type CardForm = z.infer<typeof cardSchema>;

const upiSchema = z.object({
  vpa: z
    .string()
    .min(5, 'Enter your UPI ID')
    .regex(
      /^[A-Za-z0-9._\-]{2,}@[A-Za-z0-9.\-]{2,}$/,
      'Looks like name@bank — e.g. alice@okaxis',
    ),
});

type UpiForm = z.infer<typeof upiSchema>;

function formatCardNumber(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizePlan(p: Record<string, unknown>): Plan {
  const priceCents = typeof p.price_cents === 'number' ? p.price_cents : 0;
  const priceMonthly = typeof p.price_monthly === 'number' ? p.price_monthly : priceCents / 100;
  const caps = p.capabilities as { features?: string[] } | null | undefined;
  return {
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    price_monthly: priceMonthly,
    mailbox_limit: typeof p.max_mailboxes === 'number' ? p.max_mailboxes : typeof p.mailbox_limit === 'number' ? p.mailbox_limit : 1,
    features: Array.isArray(p.features) ? (p.features as string[]) : (caps?.features ?? []),
    recommended: Boolean(p.recommended) || String(p.name ?? '').toLowerCase() === 'pro',
  };
}

async function fetchPlans(): Promise<Plan[]> {
  try {
    const res: AxiosResponse<Record<string, unknown>[] | { plans: Record<string, unknown>[] }> = await api.get('/plans');
    const data = res.data;
    const raw = Array.isArray(data) ? data : Array.isArray((data as { plans?: unknown }).plans) ? (data as { plans: Record<string, unknown>[] }).plans : null;
    if (!raw || raw.length === 0) return FALLBACK_PLANS;
    return raw.map(normalizePlan);
  } catch {
    return FALLBACK_PLANS;
  }
}

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  const me = useMe();
  const mailboxes = useMailboxes();
  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans });
  const upgrade = useUpgradePlan();
  const qc = useQueryClient();
  const [step, setStep] = useState<'plan' | 'checkout'>('plan');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<'card' | 'upi'>('card');

  useEffect(() => {
    if (!open) {
      setStep('plan');
      setSelectedPlan(null);
      setMethod('card');
    }
  }, [open]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      card_number: '',
      expiry_mmyy: '',
      cvc: '',
      cardholder_name: '',
      country: 'US',
    },
  });

  const upiForm = useForm<UpiForm>({
    resolver: zodResolver(upiSchema),
    defaultValues: { vpa: '' },
  });

  const upiMutation = useMutation<
    { status?: string; payment?: { status?: string } },
    unknown,
    { plan_id: string; vpa: string }
  >({
    mutationFn: async (payload) => {
      const res: AxiosResponse<{ status?: string; payment?: { status?: string } }> =
        await api.post('/payments/upi', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['billing', 'payments'] });
      qc.invalidateQueries({ queryKey: ['billing', 'usage'] });
    },
  });

  useEffect(() => {
    if (step === 'plan') {
      reset();
      upiForm.reset();
    }
  }, [step, reset, upiForm]);

  const currentPlanId = me.data?.plan ?? 'starter';
  const mailboxCount = mailboxes.data?.items.length ?? 0;

  const blockReason = useMemo(() => {
    if (!selectedPlan) return null;
    if (selectedPlan.mailbox_limit < mailboxCount) {
      return `You have ${mailboxCount} mailboxes, but ${selectedPlan.name} allows only ${selectedPlan.mailbox_limit}. Remove ${mailboxCount - selectedPlan.mailbox_limit} mailboxes first.`;
    }
    return null;
  }, [selectedPlan, mailboxCount]);

  const onSubmit = handleSubmit(async (values) => {
    if (!selectedPlan || blockReason) return;
    try {
      const result = await upgrade.mutateAsync({
        plan_id: selectedPlan.id,
        card_number: values.card_number,
        cvc: values.cvc,
        expiry_mmyy: values.expiry_mmyy,
        cardholder_name: values.cardholder_name,
        country: values.country,
      });
      if (result.status !== 'succeeded') {
        toast.error('Payment failed. Try again.');
        return;
      }
      toast.success('Plan updated — no card was charged.');
      onOpenChange(false);
    } catch {
      toast.error('Could not update plan. Try again.');
    }
  });

  const onSubmitUpi = upiForm.handleSubmit(async (values) => {
    if (!selectedPlan || blockReason) return;
    try {
      const result = await upiMutation.mutateAsync({
        plan_id: selectedPlan.id,
        vpa: values.vpa.trim(),
      });
      const ok =
        result.status === 'succeeded' || result.payment?.status === 'succeeded';
      if (!ok) {
        toast.error('Payment failed. Try again.');
        return;
      }
      toast.success('Plan updated — no UPI request was actually sent.');
      onOpenChange(false);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        .response?.data?.detail;
      toast.error(
        typeof detail === 'string'
          ? `Payment failed: ${detail}`
          : 'Could not update plan. Try again.',
      );
    }
  });

  const cardNumber = watch('card_number');
  const country = watch('country');
  const busy =
    method === 'card'
      ? isSubmitting || upgrade.isPending
      : upiForm.formState.isSubmitting || upiMutation.isPending;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            {step === 'plan' ? 'Choose a plan' : 'Test checkout'}
          </AppDialogTitle>
          <AppDialogDescription>
            {step === 'plan'
              ? 'Pick the tier that matches your sending volume.'
              : `Upgrading to ${selectedPlan?.name}. Test mode — your card will not be charged.`}
          </AppDialogDescription>
        </AppDialogHeader>

        {step === 'plan' ? (
          <AppDialogBody>
            {plans.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((k) => (
                  <Skeleton key={k} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {(plans.data ?? FALLBACK_PLANS).map((p) => {
                  const isCurrent = p.id === currentPlanId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setSelectedPlan(p)}
                      className={cn(
                        'relative flex flex-col gap-2 rounded-xl border bg-surface-2/30 p-4 text-left transition focus-ring',
                        selectedPlan?.id === p.id
                          ? 'border-accent ring-2 ring-accent/40'
                          : 'border-border-muted hover:border-accent/50',
                        isCurrent && 'opacity-60',
                      )}
                    >
                      {p.recommended ? (
                        <span className="absolute right-2 top-2 rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                          Rec
                        </span>
                      ) : null}
                      <h4 className="text-sm font-semibold text-text">{p.name}</h4>
                      <p className="text-xl font-semibold text-text">
                        {formatMoney(p.price_monthly)}
                        <span className="text-xs font-normal text-text-dim">/mo</span>
                      </p>
                      <p className="text-[11px] text-text-dim">
                        {p.mailbox_limit} mailbox{p.mailbox_limit === 1 ? '' : 'es'}
                      </p>
                      {isCurrent ? (
                        <span className="mt-auto text-[10px] uppercase tracking-wider text-accent">
                          Current plan
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {blockReason ? (
              <div className="flex items-start gap-2 rounded-lg border border-accent3/40 bg-accent3/10 p-3 text-xs text-accent3">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {blockReason}
              </div>
            ) : null}
          </AppDialogBody>
        ) : (
          <AppDialogBody>
            <div className="flex items-start gap-2 rounded-lg border border-accent4/40 bg-accent4/10 p-3 text-xs text-accent4">
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Test mode — checkout runs through the simulated gateway. No real
                charge occurs and no card details are stored.
              </span>
            </div>
            <AppTabs
              value={method}
              onValueChange={(v) => setMethod(v as 'card' | 'upi')}
              className="space-y-3"
            >
              <AppTabsList className="grid w-full grid-cols-2">
                <AppTabsTrigger value="card">
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Card
                </AppTabsTrigger>
                <AppTabsTrigger value="upi">
                  <Smartphone className="mr-1.5 h-3.5 w-3.5" /> UPI
                </AppTabsTrigger>
              </AppTabsList>

              <AppTabsContent value="upi">
                <form id="upgrade-form-upi" onSubmit={onSubmitUpi} className="space-y-4">
                  <FormField
                    label="UPI ID (VPA)"
                    htmlFor="upi_vpa"
                    error={upiForm.formState.errors.vpa?.message}
                  >
                    <div className="relative">
                      <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
                      <Input
                        id="upi_vpa"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="alice@okaxis"
                        className="pl-9 font-mono"
                        {...upiForm.register('vpa')}
                        invalid={!!upiForm.formState.errors.vpa}
                      />
                    </div>
                  </FormField>
                  <p className="text-xs text-text-dim">
                    Enter the UPI ID linked to your bank (e.g. <code>name@okaxis</code>,{' '}
                    <code>9876543210@ybl</code>). No collect request is actually sent in
                    the dummy gateway.
                  </p>
                </form>
              </AppTabsContent>

              <AppTabsContent value="card">
            <form id="upgrade-form" onSubmit={onSubmit} className="space-y-4">
              <FormField
                label="Card number"
                htmlFor="card_number"
                error={errors.card_number?.message}
              >
                <div className="relative">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
                  <Input
                    id="card_number"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    className="pl-9 font-mono tracking-wider"
                    value={cardNumber}
                    onChange={(e) =>
                      setValue('card_number', formatCardNumber(e.target.value), {
                        shouldValidate: true,
                      })
                    }
                    invalid={!!errors.card_number}
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Expiry"
                  htmlFor="expiry_mmyy"
                  error={errors.expiry_mmyy?.message}
                >
                  <Input
                    id="expiry_mmyy"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    {...register('expiry_mmyy')}
                    onChange={(e) =>
                      setValue('expiry_mmyy', formatExpiry(e.target.value), {
                        shouldValidate: true,
                      })
                    }
                    invalid={!!errors.expiry_mmyy}
                  />
                </FormField>
                <FormField label="CVC" htmlFor="cvc" error={errors.cvc?.message}>
                  <Input
                    id="cvc"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    maxLength={3}
                    {...register('cvc')}
                    invalid={!!errors.cvc}
                  />
                </FormField>
              </div>

              <FormField
                label="Cardholder name"
                htmlFor="cardholder_name"
                error={errors.cardholder_name?.message}
              >
                <Input
                  id="cardholder_name"
                  autoComplete="cc-name"
                  placeholder="Jane Doe"
                  {...register('cardholder_name')}
                  invalid={!!errors.cardholder_name}
                />
              </FormField>

              <FormField
                label="Billing country"
                htmlFor="country"
                error={errors.country?.message}
              >
                <AppSelect
                  value={country}
                  onValueChange={(v) => setValue('country', v, { shouldValidate: true })}
                >
                  <AppSelectTrigger id="country">
                    <AppSelectValue placeholder="Select country" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {COUNTRIES.map((c) => (
                      <AppSelectItem key={c.code} value={c.code}>
                        {c.name}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </FormField>
            </form>
              </AppTabsContent>
            </AppTabs>
          </AppDialogBody>
        )}

        <AppDialogFooter>
          {step === 'plan' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedPlan ||
                  selectedPlan.id === currentPlanId ||
                  !!blockReason
                }
                onClick={() => setStep('checkout')}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                {`Pay ${formatMoney(selectedPlan?.price_monthly ?? 0)}`}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep('plan')}
                leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                Back
              </Button>
              <Button
                type="submit"
                form={method === 'upi' ? 'upgrade-form-upi' : 'upgrade-form'}
                disabled={busy}
                leftIcon={<Lock className="h-3.5 w-3.5" />}
              >
                {busy
                  ? 'Processing…'
                  : method === 'upi'
                    ? `Pay ${formatMoney(selectedPlan?.price_monthly ?? 0)} via UPI`
                    : `Pay ${formatMoney(selectedPlan?.price_monthly ?? 0)}`}
              </Button>
            </>
          )}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
