import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useUpdatePlan, type Plan } from './api';

const planFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60, 'Too long'),
  slug: z.string().min(1, 'Slug is required').max(40, 'Too long'),
  price_monthly_usd: z.coerce.number().min(0, 'Must be >= 0'),
  mailboxes_included: z.coerce.number().int('Must be an integer').min(0, 'Must be >= 0'),
  max_mailboxes: z.coerce.number().int('Must be an integer').min(0, 'Must be >= 0'),
  daily_email_cap: z.coerce.number().int('Must be an integer').min(0, 'Must be >= 0'),
  llm_token_cap: z.coerce.number().int('Must be an integer').min(0, 'Must be >= 0'),
  is_active: z.boolean(),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

interface EditPlanDialogProps {
  plan: Plan | null;
  onClose: () => void;
}

function defaults(plan: Plan | null): PlanFormValues {
  const extra = (plan ?? {}) as Plan & { daily_email_cap?: number };
  return {
    name: plan?.name ?? '',
    slug: plan?.slug ?? '',
    price_monthly_usd: plan?.price_monthly_usd ?? 0,
    mailboxes_included: plan?.mailboxes_included ?? 0,
    max_mailboxes: plan?.max_mailboxes ?? 0,
    daily_email_cap: extra.daily_email_cap ?? 0,
    llm_token_cap: plan?.llm_token_cap ?? 0,
    is_active: plan?.is_active ?? true,
  };
}

export function EditPlanDialog({ plan, onClose }: EditPlanDialogProps) {
  const open = plan !== null;
  const update = useUpdatePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: defaults(plan),
  });

  // Reset the form whenever a different plan is opened so the dialog always
  // reflects the currently-selected row.
  useEffect(() => {
    if (plan) {
      form.reset(defaults(plan));
    }
  }, [plan, form]);

  const handleClose = () => {
    if (update.isPending) return;
    form.reset();
    update.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!plan) return;
    // `daily_email_cap` isn't part of the strict `PlanRow` schema yet but the
    // backend accepts the extra field; cast through `unknown` so TS is happy.
    const payload = {
      name: values.name,
      slug: values.slug,
      price_monthly_usd: values.price_monthly_usd,
      mailboxes_included: values.mailboxes_included,
      max_mailboxes: values.max_mailboxes,
      daily_email_cap: values.daily_email_cap,
      llm_token_cap: values.llm_token_cap,
      is_active: values.is_active,
    } as unknown as Partial<Plan>;
    update.mutate(
      { id: plan.id, payload },
      {
        onSuccess: () => {
          toast.success(`Updated ${values.name}`);
          handleClose();
        },
        onError: () => toast.error('Failed to update plan'),
      },
    );
  });

  const isActive = form.watch('is_active');

  return (
    <AppDialog open={open} onOpenChange={(next) => (!next ? handleClose() : null)}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Edit plan</AppDialogTitle>
          {plan ? (
            <AppDialogDescription>
              Adjusting <span className="font-medium text-text">{plan.name}</span> — changes apply
              to all existing subscribers.
            </AppDialogDescription>
          ) : null}
        </AppDialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <AppDialogBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                label="Display name"
                htmlFor="plan-name"
                required
                error={form.formState.errors.name?.message}
              >
                <Input
                  id="plan-name"
                  {...form.register('name')}
                  invalid={!!form.formState.errors.name}
                />
              </FormField>
              <FormField
                label="Slug"
                htmlFor="plan-slug"
                required
                error={form.formState.errors.slug?.message}
              >
                <Input
                  id="plan-slug"
                  {...form.register('slug')}
                  invalid={!!form.formState.errors.slug}
                />
              </FormField>
              <FormField
                label="Price / month (USD)"
                htmlFor="plan-price"
                required
                error={form.formState.errors.price_monthly_usd?.message}
              >
                <Input
                  id="plan-price"
                  type="number"
                  step="0.01"
                  min={0}
                  {...form.register('price_monthly_usd')}
                  invalid={!!form.formState.errors.price_monthly_usd}
                />
              </FormField>
              <FormField
                label="Mailboxes included"
                htmlFor="plan-mb-incl"
                error={form.formState.errors.mailboxes_included?.message}
              >
                <Input
                  id="plan-mb-incl"
                  type="number"
                  min={0}
                  {...form.register('mailboxes_included')}
                  invalid={!!form.formState.errors.mailboxes_included}
                />
              </FormField>
              <FormField
                label="Max mailboxes"
                htmlFor="plan-mb-max"
                error={form.formState.errors.max_mailboxes?.message}
              >
                <Input
                  id="plan-mb-max"
                  type="number"
                  min={0}
                  {...form.register('max_mailboxes')}
                  invalid={!!form.formState.errors.max_mailboxes}
                />
              </FormField>
              <FormField
                label="Daily email cap"
                htmlFor="plan-daily"
                hint="Per-mailbox send ceiling."
                error={form.formState.errors.daily_email_cap?.message}
              >
                <Input
                  id="plan-daily"
                  type="number"
                  min={0}
                  {...form.register('daily_email_cap')}
                  invalid={!!form.formState.errors.daily_email_cap}
                />
              </FormField>
              <FormField
                label="AI token cap / month"
                htmlFor="plan-tokens"
                hint="Total tokens budgeted per subscriber, per month."
                error={form.formState.errors.llm_token_cap?.message}
                className="sm:col-span-2"
              >
                <Input
                  id="plan-tokens"
                  type="number"
                  min={0}
                  {...form.register('llm_token_cap')}
                  invalid={!!form.formState.errors.llm_token_cap}
                />
              </FormField>
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 px-4 py-3">
                <div>
                  <Label htmlFor="plan-active">Active</Label>
                  <p className="text-xs text-text-dim">
                    Inactive plans are hidden from new signups but keep existing subscribers.
                  </p>
                </div>
                <AppSwitch
                  id="plan-active"
                  checked={isActive}
                  onCheckedChange={(v) => form.setValue('is_active', v, { shouldDirty: true })}
                />
              </div>
            </div>
          </AppDialogBody>
          <AppDialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || !form.formState.isDirty}
              leftIcon={
                update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
              }
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
