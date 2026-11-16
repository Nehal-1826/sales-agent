import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useUpdateDefaults, type AdminSettings } from './api';

const defaultsSchema = z
  .object({
    ramp_day1: z.coerce.number().int().min(1, 'Must be ≥ 1').max(100, 'Be reasonable'),
    ramp_day7_target: z.coerce.number().int().min(1, 'Must be ≥ 1').max(200, 'Be reasonable'),
    human_delay_min_s: z.coerce.number().int().min(1, 'Must be ≥ 1').max(3600, 'Must be ≤ 1h'),
    human_delay_max_s: z.coerce.number().int().min(1, 'Must be ≥ 1').max(3600, 'Must be ≤ 1h'),
    email_from_display_name: z.string().trim().max(80, 'Too long'),
    reply_to: z
      .string()
      .trim()
      .max(120, 'Too long')
      .refine((v) => v === '' || /.+@.+\..+/.test(v), { message: 'Must be a valid email' }),
    warmup_log_retention_days: z.coerce
      .number()
      .int()
      .min(1, 'Must be ≥ 1')
      .max(3650, 'Be reasonable'),
  })
  .refine((v) => v.human_delay_min_s <= v.human_delay_max_s, {
    path: ['human_delay_max_s'],
    message: 'Max must be ≥ min',
  })
  .refine((v) => v.ramp_day1 <= v.ramp_day7_target, {
    path: ['ramp_day7_target'],
    message: 'Day-7 target must be ≥ Day-1 start',
  });

type DefaultsValues = z.infer<typeof defaultsSchema>;

interface DefaultsPanelProps {
  settings: AdminSettings | undefined;
  delay?: number;
}

function initialValues(settings: AdminSettings | undefined): DefaultsValues {
  const d = settings?.defaults;
  return {
    ramp_day1: d?.ramp_day1 ?? 5,
    ramp_day7_target: d?.ramp_day7_target ?? 10,
    human_delay_min_s: d?.human_delay_min_s ?? 30,
    human_delay_max_s: d?.human_delay_max_s ?? 300,
    email_from_display_name: d?.email_from_display_name ?? '',
    reply_to: d?.reply_to ?? '',
    warmup_log_retention_days: d?.warmup_log_retention_days ?? 7,
  };
}

export function DefaultsPanel({ settings, delay = 0 }: DefaultsPanelProps) {
  const update = useUpdateDefaults();

  const form = useForm<DefaultsValues>({
    resolver: zodResolver(defaultsSchema),
    defaultValues: initialValues(settings),
  });

  useEffect(() => {
    form.reset(initialValues(settings));
  }, [settings, form]);

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: () => {
        toast.success('Platform defaults updated');
        form.reset(values);
      },
      onError: () => toast.error('Failed to update defaults'),
    });
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card>
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-accent2" />
              <h3 className="text-base font-semibold text-text">Platform defaults</h3>
            </div>
            <p className="mt-1 text-xs text-text-dim">
              New mailboxes inherit these values. Existing mailboxes aren't retroactively updated.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Daily build-up — Day 1 sends"
              htmlFor="def-day1"
              hint="Spec default: 5 sends on Day 1."
              error={form.formState.errors.ramp_day1?.message}
            >
              <Input
                id="def-day1"
                type="number"
                min={1}
                {...form.register('ramp_day1')}
                invalid={!!form.formState.errors.ramp_day1}
              />
            </FormField>
            <FormField
              label="Daily build-up — Day 7 target"
              htmlFor="def-day7"
              hint="Spec default: 10 sends by Day 7."
              error={form.formState.errors.ramp_day7_target?.message}
            >
              <Input
                id="def-day7"
                type="number"
                min={1}
                {...form.register('ramp_day7_target')}
                invalid={!!form.formState.errors.ramp_day7_target}
              />
            </FormField>
            <FormField
              label="Human delay — min (seconds)"
              htmlFor="def-min-s"
              hint="Minimum gap between warmup actions."
              error={form.formState.errors.human_delay_min_s?.message}
            >
              <Input
                id="def-min-s"
                type="number"
                min={1}
                {...form.register('human_delay_min_s')}
                invalid={!!form.formState.errors.human_delay_min_s}
              />
            </FormField>
            <FormField
              label="Human delay — max (seconds)"
              htmlFor="def-max-s"
              hint="Maximum gap between warmup actions."
              error={form.formState.errors.human_delay_max_s?.message}
            >
              <Input
                id="def-max-s"
                type="number"
                min={1}
                {...form.register('human_delay_max_s')}
                invalid={!!form.formState.errors.human_delay_max_s}
              />
            </FormField>
            <FormField
              label="Default from-name"
              htmlFor="def-from-name"
              hint="Applied to outgoing warmup mail when the mailbox doesn't override."
              error={form.formState.errors.email_from_display_name?.message}
            >
              <Input
                id="def-from-name"
                placeholder="Jane from WarmPulse"
                {...form.register('email_from_display_name')}
                invalid={!!form.formState.errors.email_from_display_name}
              />
            </FormField>
            <FormField
              label="Reply-to address"
              htmlFor="def-reply-to"
              hint="Defaults to the sending mailbox when empty."
              error={form.formState.errors.reply_to?.message}
            >
              <Input
                id="def-reply-to"
                type="email"
                placeholder="reply@warmpulse.io"
                {...form.register('reply_to')}
                invalid={!!form.formState.errors.reply_to}
              />
            </FormField>
            <FormField
              label="Warmup-log retention (days)"
              htmlFor="def-retention"
              hint="Warmup activity rows older than this are purged daily (00:30 UTC). Applies platform-wide."
              error={form.formState.errors.warmup_log_retention_days?.message}
            >
              <Input
                id="def-retention"
                type="number"
                min={1}
                {...form.register('warmup_log_retention_days')}
                invalid={!!form.formState.errors.warmup_log_retention_days}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => form.reset(initialValues(settings))}
              disabled={update.isPending || !form.formState.isDirty}
            >
              Reset
            </Button>
            <Button
              type="submit"
              leftIcon={
                update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )
              }
              disabled={update.isPending || !form.formState.isDirty}
            >
              {update.isPending ? 'Saving…' : 'Save defaults'}
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}
