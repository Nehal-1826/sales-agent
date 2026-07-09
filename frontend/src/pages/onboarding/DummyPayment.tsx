import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  CreditCard,
  Lock,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
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
import { toast } from '@/components/ui/AppToast';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { Plan } from './PlanPicker';

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
];

/** 16-digit Luhn-insensitive card mask — pure visual; no real processing. */
const cardSchema = z.object({
  card_number: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{16}$/, 'Card must be 16 digits')),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
  cvc: z.string().regex(/^\d{3}$/, 'CVC must be 3 digits'),
  cardholder_name: z.string().min(2, 'Name required'),
  country: z.string().min(2, 'Country required'),
});

type CardForm = z.infer<typeof cardSchema>;

/** UPI VPA: <handle>@<provider>, e.g. "alice@okaxis" or "9876543210@ybl". */
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

interface DummyPaymentProps {
  plan: Plan;
  onBack: () => void;
  onSuccess: () => void;
}

interface PaymentResponseShape {
  status?: 'succeeded' | 'failed';
  payment?: { status?: 'succeeded' | 'failed' };
}

function formatCardNumber(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
function formatExpiry(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isSucceeded(res: PaymentResponseShape): boolean {
  return res.payment?.status === 'succeeded' || res.status === 'succeeded';
}

function payErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } }).response
    ?.data?.detail;
  if (typeof detail === 'string' && detail.length > 0) {
    return `Payment failed: ${detail}`;
  }
  return fallback;
}

export function DummyPayment({ plan, onBack, onSuccess }: DummyPaymentProps) {
  const t = useT();
  const [method, setMethod] = useState<'card' | 'upi'>('card');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text focus-ring rounded"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t('onb.pay.backToPlans')}
        </button>
        <h1 className="text-2xl font-bold text-text">{t('onb.pay.heading')}</h1>
        <p className="text-sm text-text-dim">
          {t('onb.pay.selectedPlan', { name: plan.name, price: formatMoney(plan.price_monthly) })}
        </p>
      </header>

      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">{t('onb.pay.noDummyTitle')}</p>
          <p className="text-xs text-amber-200/80">
            {t('onb.pay.noDummyDesc')}
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <AppTabs value={method} onValueChange={(v) => setMethod(v as 'card' | 'upi')}>
            <AppTabsList className="grid w-full grid-cols-2">
              <AppTabsTrigger value="card">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                {t('onb.pay.tabCard')}
              </AppTabsTrigger>
              <AppTabsTrigger value="upi">
                <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                {t('onb.pay.tabUpi')}
              </AppTabsTrigger>
            </AppTabsList>

            <AppTabsContent value="card">
              <CardForm plan={plan} onSuccess={onSuccess} />
            </AppTabsContent>
            <AppTabsContent value="upi">
              <UpiForm plan={plan} onSuccess={onSuccess} />
            </AppTabsContent>
          </AppTabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card form
// ---------------------------------------------------------------------------

function CardForm({ plan, onSuccess }: { plan: Plan; onSuccess: () => void }) {
  const t = useT();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      card_number: '',
      expiry: '',
      cvc: '',
      cardholder_name: '',
      country: 'US',
    },
  });
  const cardNumber = watch('card_number');
  const country = watch('country');

  const mutation = useMutation<
    PaymentResponseShape,
    unknown,
    {
      plan_id: string;
      card_number: string;
      cvc: string;
      expiry_mmyy: string;
      cardholder_name: string;
      country: string;
    }
  >({
    mutationFn: async (payload) => {
      const res: AxiosResponse<PaymentResponseShape> = await api.post(
        '/payments/dummy',
        payload,
      );
      return res.data;
    },
  });

  const onSubmit = useMemo(
    () =>
      handleSubmit(async (values) => {
        const rawCard = values.card_number.replace(/\s+/g, '');
        try {
          const result = await mutation.mutateAsync({
            plan_id: plan.id,
            card_number: rawCard,
            cvc: values.cvc,
            expiry_mmyy: values.expiry,
            cardholder_name: values.cardholder_name,
            country: values.country,
          });
          if (isSucceeded(result)) {
            toast.success(t('onb.pay.successToast'));
            onSuccess();
            return;
          }
          toast.error(t('onb.pay.failToast'));
        } catch (err) {
          toast.error(
            payErrorMessage(err, t('onb.pay.failCardToast')),
          );
        }
      }),
    [handleSubmit, mutation, onSuccess, plan.id],
  );

  const busy = isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <FormField label={t('onb.pay.cardNumber')} htmlFor="card_number" error={errors.card_number?.message}>
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
        <FormField label={t('onb.pay.expiry')} htmlFor="expiry" error={errors.expiry?.message}>
          <Input
            id="expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            {...register('expiry')}
            onChange={(e) =>
              setValue('expiry', formatExpiry(e.target.value), {
                shouldValidate: true,
              })
            }
            invalid={!!errors.expiry}
          />
        </FormField>
        <FormField label={t('onb.pay.cvc')} htmlFor="cvc" error={errors.cvc?.message}>
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
        label={t('onb.pay.cardholderName')}
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

      <FormField label={t('onb.pay.billingCountry')} htmlFor="country" error={errors.country?.message}>
        <AppSelect
          value={country}
          onValueChange={(v) => setValue('country', v, { shouldValidate: true })}
        >
          <AppSelectTrigger id="country">
            <AppSelectValue placeholder={t('onb.pay.selectCountry')} />
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

      <Button type="submit" className="w-full" disabled={busy} leftIcon={<Lock className="h-4 w-4" />}>
        {busy ? t('onb.pay.processing') : t('onb.pay.payButton', { price: formatMoney(plan.price_monthly) })}
      </Button>
      <p className="text-center text-[11px] text-text-dim">
        {t('onb.pay.simNote')}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// UPI form
// ---------------------------------------------------------------------------

function UpiForm({ plan, onSuccess }: { plan: Plan; onSuccess: () => void }) {
  const t = useT();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpiForm>({
    resolver: zodResolver(upiSchema),
    defaultValues: { vpa: '' },
  });

  const mutation = useMutation<
    PaymentResponseShape,
    unknown,
    { plan_id: string; vpa: string }
  >({
    mutationFn: async (payload) => {
      const res: AxiosResponse<PaymentResponseShape> = await api.post(
        '/payments/upi',
        payload,
      );
      return res.data;
    },
  });

  const onSubmit = useMemo(
    () =>
      handleSubmit(async (values) => {
        try {
          const result = await mutation.mutateAsync({
            plan_id: plan.id,
            vpa: values.vpa.trim(),
          });
          if (isSucceeded(result)) {
            toast.success(t('onb.pay.successToast'));
            onSuccess();
            return;
          }
          toast.error(t('onb.pay.failToast'));
        } catch (err) {
          toast.error(
            payErrorMessage(err, t('onb.pay.failUpiToast')),
          );
        }
      }),
    [handleSubmit, mutation, onSuccess, plan.id],
  );

  const busy = isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <FormField label={t('onb.pay.upiId')} htmlFor="vpa" error={errors.vpa?.message}>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            id="vpa"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice@okaxis"
            className="pl-9 font-mono"
            {...register('vpa')}
            invalid={!!errors.vpa}
          />
        </div>
      </FormField>

      <p className="text-xs text-text-dim">
        {t('onb.pay.upiDesc')}
      </p>

      <Button type="submit" className="w-full" disabled={busy} leftIcon={<Lock className="h-4 w-4" />}>
        {busy ? t('onb.pay.upiSending') : t('onb.pay.upiPayButton', { price: formatMoney(plan.price_monthly) })}
      </Button>
      <p className="text-center text-[11px] text-text-dim">
        {t('onb.pay.upiSimNote')}
      </p>
    </form>
  );
}
