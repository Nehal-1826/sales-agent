import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { useCreateLead, extractCrmError } from '../api';
import { CRM_STAGES, type CrmStage } from '../types';

const leadSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  company: z.string().trim().optional(),
  title: z.string().trim().optional(),
  value_dollars: z.coerce.number().min(0, 'Must be ≥ 0').optional(),
  stage: z.enum(['new', 'contacted', 'replied', 'interested', 'won', 'lost']),
  tags: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
type LeadForm = z.infer<typeof leadSchema>;

const DEFAULTS: LeadForm = {
  name: '',
  email: '',
  company: '',
  title: '',
  value_dollars: 0,
  stage: 'new',
  tags: '',
  notes: '',
};

export interface CrmAddLeadDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Add-lead dialog. Captures the core lead fields and POSTs via useCreateLead;
 * the hook invalidates the campaign's lead list so the new card appears.
 */
export function CrmAddLeadDialog({ campaignId, open, onOpenChange }: CrmAddLeadDialogProps) {
  const createLead = useCreateLead();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: DEFAULTS,
  });

  const close = (v: boolean) => {
    if (!v) {
      reset(DEFAULTS);
      createLead.reset();
    }
    onOpenChange(v);
  };

  const onSubmit = (values: LeadForm) => {
    createLead.mutate(
      {
        campaign_id: campaignId,
        name: values.name,
        email: values.email,
        company: values.company || undefined,
        title: values.title || undefined,
        value_cents: Math.round((values.value_dollars ?? 0) * 100),
        stage: values.stage,
        tags: parseTags(values.tags),
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Lead added');
          close(false);
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not add lead')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Add a lead</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody>
            <FormField label="Name" htmlFor="al-name" required error={errors.name?.message}>
              <Input id="al-name" placeholder="Jane Cooper" {...register('name')} />
            </FormField>
            <FormField label="Email" htmlFor="al-email" required error={errors.email?.message}>
              <Input id="al-email" type="email" placeholder="jane@acme.com" {...register('email')} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Company" htmlFor="al-company">
                <Input id="al-company" placeholder="Acme Inc." {...register('company')} />
              </FormField>
              <FormField label="Title" htmlFor="al-title">
                <Input id="al-title" placeholder="VP Sales" {...register('title')} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Deal value ($)" htmlFor="al-value" error={errors.value_dollars?.message}>
                <Input id="al-value" type="number" min={0} step={1} placeholder="0" {...register('value_dollars')} />
              </FormField>
              <FormField label="Stage" htmlFor="al-stage">
                <Controller
                  control={control}
                  name="stage"
                  render={({ field }) => (
                    <AppSelect
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as CrmStage)}
                    >
                      <AppSelectTrigger id="al-stage">
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {CRM_STAGES.map((meta) => (
                          <AppSelectItem key={meta.key} value={meta.key}>
                            {meta.label}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  )}
                />
              </FormField>
            </div>
            <FormField label="Tags" htmlFor="al-tags" hint="Comma-separated">
              <Input id="al-tags" placeholder="enterprise, warm" {...register('tags')} />
            </FormField>
            <FormField label="Notes" htmlFor="al-notes">
              <textarea
                id="al-notes"
                rows={3}
                placeholder="Anything worth remembering…"
                className="flex w-full rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus-ring focus:border-accent"
                {...register('notes')}
              />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createLead.isPending}
              leftIcon={
                createLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
              }
            >
              {createLead.isPending ? 'Adding…' : 'Add lead'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
