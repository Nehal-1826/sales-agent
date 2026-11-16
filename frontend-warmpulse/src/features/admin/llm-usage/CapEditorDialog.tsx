import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogTrigger,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { useUpdateLlmCap, type PlanCap } from './api';

const capSchema = z.object({
  plan_id: z.string().min(1, 'Pick a plan'),
  cap_tokens: z.coerce
    .number()
    .int('Must be an integer')
    .min(1000, 'Minimum 1,000 tokens'),
});

type CapValues = z.infer<typeof capSchema>;

interface CapEditorDialogProps {
  caps: PlanCap[] | undefined;
  trigger: ReactNode;
}

export function CapEditorDialog({ caps, trigger }: CapEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const update = useUpdateLlmCap();

  const defaultPlan = caps?.[0]?.plan_id ?? '';

  const form = useForm<CapValues>({
    resolver: zodResolver(capSchema),
    defaultValues: {
      plan_id: defaultPlan,
      cap_tokens: caps?.[0]?.cap_tokens ?? 100_000,
    },
  });

  // Keep default plan in sync when the caps prop first loads.
  useEffect(() => {
    if (!open) return;
    const currentPlanId = form.getValues('plan_id');
    if (!currentPlanId && defaultPlan) {
      form.reset({
        plan_id: defaultPlan,
        cap_tokens: caps?.[0]?.cap_tokens ?? 100_000,
      });
    }
  }, [open, defaultPlan, caps, form]);

  const selectedPlanId = form.watch('plan_id');
  const selectedPlan = useMemo(
    () => caps?.find((c) => c.plan_id === selectedPlanId),
    [caps, selectedPlanId],
  );

  // When the user picks a different plan, reset the cap input to that plan's
  // current value so they see what they're editing.
  useEffect(() => {
    if (selectedPlan) {
      form.setValue('cap_tokens', selectedPlan.cap_tokens, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [selectedPlan, form]);

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(
      { planId: values.plan_id, cap_tokens: values.cap_tokens },
      {
        onSuccess: () => {
          toast.success(`Cap updated for ${selectedPlan?.plan ?? values.plan_id}`);
          setOpen(false);
          form.reset();
        },
        onError: () => toast.error('Failed to update cap'),
      },
    );
  });

  const hasCaps = Array.isArray(caps) && caps.length > 0;

  return (
    <AppDialog
      open={open}
      onOpenChange={(v) => {
        if (update.isPending) return;
        setOpen(v);
        if (!v) form.reset();
      }}
    >
      <AppDialogTrigger asChild>{trigger}</AppDialogTrigger>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Edit per-plan token caps</AppDialogTitle>
          <AppDialogDescription>
            Month-to-date caps for  generation. Applies to all subscribers on the selected plan
            the next time they request generation.
          </AppDialogDescription>
        </AppDialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <AppDialogBody>
            {!hasCaps ? (
              <div className="rounded-lg border border-dashed border-border-muted bg-surface-2/40 px-3 py-6 text-center text-sm text-text-dim">
                No plans are configured yet. Add plans first, then come back here to set caps.
              </div>
            ) : (
              <div className="space-y-3">
                <FormField
                  label="Plan"
                  htmlFor="cap-plan"
                  error={form.formState.errors.plan_id?.message}
                >
                  <AppSelect
                    value={selectedPlanId || undefined}
                    onValueChange={(v) => form.setValue('plan_id', v, { shouldDirty: true })}
                  >
                    <AppSelectTrigger id="cap-plan">
                      <AppSelectValue placeholder="Select a plan" />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {caps!.map((c) => (
                        <AppSelectItem key={c.plan_id} value={c.plan_id}>
                          {c.plan}
                          <span className="ml-2 text-xs text-text-dim tabular-nums">
                            ({c.cap_tokens.toLocaleString()} tokens)
                          </span>
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </FormField>

                <FormField
                  label="Cap (tokens / month)"
                  htmlFor="cap-tokens"
                  hint="Minimum 1,000. Rough cost: $0.003 per 1k tokens."
                  error={form.formState.errors.cap_tokens?.message}
                >
                  <Input
                    id="cap-tokens"
                    type="number"
                    min={1000}
                    step={1000}
                    {...form.register('cap_tokens')}
                    invalid={!!form.formState.errors.cap_tokens}
                  />
                </FormField>
              </div>
            )}
          </AppDialogBody>
          <AppDialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (update.isPending) return;
                setOpen(false);
                form.reset();
              }}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!hasCaps || update.isPending || !form.formState.isValid}
              leftIcon={update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {update.isPending ? 'Saving…' : 'Save cap'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
