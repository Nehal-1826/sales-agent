import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { useGenerateReport, type ReportFormat, type ReportType } from './api';

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const schema = z
  .object({
    type: z.enum(['warmth', 'engagement', 'placement', 'white_label']),
    format: z.enum(['pdf', 'csv']),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a start date'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select an end date'),
  })
  .refine((data) => data.from <= data.to, {
    message: 'Start date must be before end date',
    path: ['to'],
  });

type FormValues = z.infer<typeof schema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function GenerateReportDialog({ open, onOpenChange }: GenerateReportDialogProps) {
  const generate = useGenerateReport();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'warmth' as ReportType,
      format: 'pdf' as ReportFormat,
      from: thirtyDaysAgoIso(),
      to: todayIso(),
    },
  });

  useEffect(() => {
    if (!open) {
      reset({
        type: 'warmth',
        format: 'pdf',
        from: thirtyDaysAgoIso(),
        to: todayIso(),
      });
      generate.reset();
    }
    // `generate` is a TanStack mutation result whose reference flips every
    // render, so including it in deps causes Maximum-update-depth on the
    // Reports page (the dialog is mounted but closed). `reset` is stable per
    // RHF docs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (values: FormValues) => {
    generate.mutate(values, {
      onSuccess: () => {
        toast.success('Report generated');
        onOpenChange(false);
      },
      onError: (err) => {
        // Surface the backend's reason instead of a flat "Failed" toast.
        // 501 is the typical reportlab-missing case in dev; 400 is bad dates;
        // 5xx is server-side render failure.
        if (err instanceof AxiosError) {
          const status = err.response?.status;
          const detail = err.response?.data?.detail;
          const detailStr = typeof detail === 'string'
            ? detail
            : detail && typeof detail === 'object' && 'error' in detail
              ? String((detail as { error: unknown }).error)
              : null;
          if (status === 501) {
            toast.error(detailStr ?? 'PDF generator not installed — try CSV instead.');
            return;
          }
          if (status === 400) {
            toast.error(detailStr ?? 'Invalid request — check date range.');
            return;
          }
          if (detailStr) {
            toast.error(detailStr);
            return;
          }
        }
        toast.error('Failed to generate report — try again in a moment.');
      },
    });
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Generate report</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody>
            <FormField label="Report type" htmlFor="rep-type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <AppSelect value={field.value} onValueChange={field.onChange}>
                    <AppSelectTrigger id="rep-type">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      <AppSelectItem value="warmth">Warmth summary</AppSelectItem>
                      <AppSelectItem value="engagement">Opens &amp; replies breakdown</AppSelectItem>
                      <AppSelectItem value="placement">Where emails land</AppSelectItem>
                      <AppSelectItem value="white_label">White-label (Agency)</AppSelectItem>
                    </AppSelectContent>
                  </AppSelect>
                )}
              />
            </FormField>

            <FormField label="Format">
              <Controller
                control={control}
                name="format"
                render={({ field }) => (
                  <div className="flex gap-2">
                    {(['pdf', 'csv'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => field.onChange(fmt)}
                        className={cn(
                          'flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                          field.value === fmt
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-muted text-text-dim hover:bg-surface-2',
                        )}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="From"
                htmlFor="rep-from"
                error={errors.from?.message}
              >
                <Input id="rep-from" type="date" {...register('from')} />
              </FormField>
              <FormField
                label="To"
                htmlFor="rep-to"
                error={errors.to?.message}
              >
                <Input id="rep-to" type="date" {...register('to')} />
              </FormField>
            </div>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={generate.isPending}
              leftIcon={generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
