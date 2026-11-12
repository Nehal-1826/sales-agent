import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard, Lock, Smartphone, ShieldCheck } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
} from '@/components/ui/AppDialog';
import {
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
} from '@/components/ui/AppTabs';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useAddPaymentMethod } from '@/features/billing/api';

/**
 * AddPaymentMethodDialog
 *
 *   Card  → form sends ``card_last4`` (server strips PAN/CVC). The full
 *           PAN never leaves this component.
 *   UPI   → form sends ``upi_vpa`` verbatim (no card-equivalent secret).
 *
 * Validation mirrors the existing UpgradeDialog's zod schemas so the
 * UX feels identical (16-digit card, MM/YY expiry, 3-digit CVC, VPA
 * pattern). We never log raw card details.
 */

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
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
  label: z.string().max(64).optional(),
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
  label: z.string().max(64).optional(),
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

interface AddPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPaymentMethodDialog({
  open,
  onOpenChange,
}: AddPaymentMethodDialogProps) {
  const add = useAddPaymentMethod();
  const [tab, setTab] = useState<'card' | 'upi'>('card');

  const cardForm = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      card_number: '',
      expiry_mmyy: '',
      cvc: '',
      cardholder_name: '',
      country: 'IN',
      label: '',
    },
  });

  const upiForm = useForm<UpiForm>({
    resolver: zodResolver(upiSchema),
    defaultValues: { vpa: '', label: '' },
  });

  // Reset both forms whenever the dialog re-opens, so leftover data from a
  // previous submission can't bleed across.
  useEffect(() => {
    if (!open) {
      cardForm.reset();
      upiForm.reset();
      setTab('card');
    }
  }, [open, cardForm, upiForm]);

  const cardNumber = cardForm.watch('card_number');
  const country = cardForm.watch('country');

  const onSubmitCard = cardForm.handleSubmit(async (values) => {
    try {
      await add.mutateAsync({
        kind: 'card',
        card_number: values.card_number,
        cvc: values.cvc,
        expiry_mmyy: values.expiry_mmyy,
        cardholder_name: values.cardholder_name,
        country: values.country,
        label: values.label?.trim() || undefined,
      });
      toast.success('Card added.');
      onOpenChange(false);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        .response?.data?.detail;
      toast.error(
        typeof detail === 'string'
          ? `Could not add card: ${detail}`
          : 'Could not add card. Please try again.',
      );
    }
  });

  const onSubmitUpi = upiForm.handleSubmit(async (values) => {
    try {
      await add.mutateAsync({
        kind: 'upi',
        upi_vpa: values.vpa.trim(),
        label: values.label?.trim() || undefined,
      });
      toast.success('UPI ID added.');
      onOpenChange(false);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        .response?.data?.detail;
      toast.error(
        typeof detail === 'string'
          ? `Could not add UPI: ${detail}`
          : 'Could not add UPI. Please try again.',
      );
    }
  });

  const busy =
    add.isPending ||
    cardForm.formState.isSubmitting ||
    upiForm.formState.isSubmitting;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Add payment method</AppDialogTitle>
          <AppDialogDescription>
            Cards or UPI. No real charge — WarmPulse uses a dummy gateway today,
            but PAN and CVC are still dropped server-side after the last-4
            extraction.
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogBody>
          <AppTabs
            value={tab}
            onValueChange={(v) => setTab(v as 'card' | 'upi')}
            className="space-y-4"
          >
            <AppTabsList className="grid w-full grid-cols-2">
              <AppTabsTrigger value="card">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Card
              </AppTabsTrigger>
              <AppTabsTrigger value="upi">
                <Smartphone className="mr-1.5 h-3.5 w-3.5" /> UPI
              </AppTabsTrigger>
            </AppTabsList>

            <AppTabsContent value="card">
              <form
                id="add-pm-card"
                onSubmit={onSubmitCard}
                className="space-y-4"
              >
                <FormField
                  label="Card number"
                  htmlFor="pm_card_number"
                  error={cardForm.formState.errors.card_number?.message}
                >
                  <div className="relative">
                    <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
                    <Input
                      id="pm_card_number"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="4242 4242 4242 4242"
                      className="pl-9 font-mono tracking-wider"
                      value={cardNumber}
                      onChange={(e) =>
                        cardForm.setValue(
                          'card_number',
                          formatCardNumber(e.target.value),
                          { shouldValidate: true },
                        )
                      }
                      invalid={!!cardForm.formState.errors.card_number}
                    />
                  </div>
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Expiry"
                    htmlFor="pm_expiry"
                    error={cardForm.formState.errors.expiry_mmyy?.message}
                  >
                    <Input
                      id="pm_expiry"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      {...cardForm.register('expiry_mmyy')}
                      onChange={(e) =>
                        cardForm.setValue(
                          'expiry_mmyy',
                          formatExpiry(e.target.value),
                          { shouldValidate: true },
                        )
                      }
                      invalid={!!cardForm.formState.errors.expiry_mmyy}
                    />
                  </FormField>
                  <FormField
                    label="CVC"
                    htmlFor="pm_cvc"
                    error={cardForm.formState.errors.cvc?.message}
                  >
                    <Input
                      id="pm_cvc"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      maxLength={3}
                      {...cardForm.register('cvc')}
                      invalid={!!cardForm.formState.errors.cvc}
                    />
                  </FormField>
                </div>

                <FormField
                  label="Cardholder name"
                  htmlFor="pm_holder"
                  error={cardForm.formState.errors.cardholder_name?.message}
                >
                  <Input
                    id="pm_holder"
                    autoComplete="cc-name"
                    placeholder="Jane Doe"
                    {...cardForm.register('cardholder_name')}
                    invalid={!!cardForm.formState.errors.cardholder_name}
                  />
                </FormField>

                <FormField
                  label="Billing country"
                  htmlFor="pm_country"
                  error={cardForm.formState.errors.country?.message}
                >
                  <AppSelect
                    value={country}
                    onValueChange={(v) =>
                      cardForm.setValue('country', v, { shouldValidate: true })
                    }
                  >
                    <AppSelectTrigger id="pm_country">
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

                <FormField
                  label="Label (optional)"
                  htmlFor="pm_label"
                  hint="Helps you tell methods apart. e.g. 'Work HDFC card'."
                >
                  <Input
                    id="pm_label"
                    placeholder="Work HDFC card"
                    {...cardForm.register('label')}
                  />
                </FormField>
              </form>
            </AppTabsContent>

            <AppTabsContent value="upi">
              <form
                id="add-pm-upi"
                onSubmit={onSubmitUpi}
                className="space-y-4"
              >
                <FormField
                  label="UPI ID (VPA)"
                  htmlFor="pm_vpa"
                  error={upiForm.formState.errors.vpa?.message}
                >
                  <div className="relative">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
                    <Input
                      id="pm_vpa"
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
                <FormField
                  label="Label (optional)"
                  htmlFor="pm_upi_label"
                  hint="Helps you tell methods apart."
                >
                  <Input
                    id="pm_upi_label"
                    placeholder="Personal UPI"
                    {...upiForm.register('label')}
                  />
                </FormField>
                <p className="text-xs text-text-dim">
                  Enter the UPI ID linked to your bank (e.g. <code>name@okaxis</code>,
                  <code> 9876543210@ybl</code>). No collect request is actually sent
                  in the dummy gateway.
                </p>
              </form>
            </AppTabsContent>
          </AppTabs>

          <p className="mt-3 flex items-start gap-2 rounded-lg border border-border-muted/60 bg-surface-2/40 p-2.5 text-[11px] text-text-dim">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            We never store full card numbers. Only the last 4 digits are
            persisted; CVC is dropped server-side immediately.
          </p>
        </AppDialogBody>

        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={tab === 'upi' ? 'add-pm-upi' : 'add-pm-card'}
            disabled={busy}
            leftIcon={<Lock className="h-3.5 w-3.5" />}
            isLoading={busy}
          >
            {busy ? 'Saving…' : 'Add method'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default AddPaymentMethodDialog;
