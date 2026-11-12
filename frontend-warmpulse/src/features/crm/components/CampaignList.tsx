import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowUpRight, Loader2, Lock, Plus, Trophy, Users } from 'lucide-react';
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
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { useCampaigns, useCreateCampaign, extractCrmError } from '../api';
import { formatCents, type CrmCampaign, type CrmCampaignStatus } from '../types';

const STATUS_TONE: Record<CrmCampaignStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'var(--wp-success, #3ddc97)' },
  paused: { label: 'Paused', color: 'var(--wp-warning, #ffb454)' },
  archived: { label: 'Archived', color: 'var(--wp-text-faint, #71717a)' },
};

export interface CampaignListProps {
  onOpen: (campaignId: string) => void;
  /** Plan campaign cap; null = unlimited. */
  cap: number | null;
  /** Campaigns already used against the cap. */
  used: number;
}

/**
 * Grid of campaign cards plus a "New campaign" affordance. When the plan cap
 * is reached the create button is disabled with an upgrade hint. Create
 * surfaces the backend's 409 cap message verbatim.
 */
export function CampaignList({ onOpen, cap, used }: CampaignListProps) {
  const campaignsQuery = useCampaigns();
  const [createOpen, setCreateOpen] = useState(false);

  const campaigns = campaignsQuery.data ?? [];
  const capReached = cap !== null && used >= cap;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* New-campaign tile */}
        <button
          type="button"
          onClick={() => !capReached && setCreateOpen(true)}
          disabled={capReached}
          className={cn(
            'group flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-center transition-colors',
            capReached
              ? 'cursor-not-allowed border-border-muted/60 opacity-70'
              : 'border-border-muted hover:border-accent/60 hover:bg-accent/[0.04]',
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              capReached ? 'bg-surface-2 text-text-faint' : 'bg-accent/10 text-accent group-hover:bg-accent/20',
            )}
          >
            {capReached ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" strokeWidth={2.4} />}
          </span>
          {capReached ? (
            <div>
              <p className="text-sm font-semibold text-text">Cap reached</p>
              <p className="mt-0.5 text-xs text-text-dim">Upgrade to add more campaigns</p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-text">New campaign</p>
          )}
          {cap !== null ? (
            <p className="text-[11px] text-text-faint">
              {used} / {cap} used
            </p>
          ) : (
            <p className="text-[11px] text-text-faint">Unlimited</p>
          )}
        </button>

        {campaignsQuery.isLoading ? (
          <div className="col-span-full flex items-center gap-2 py-8 text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
          </div>
        ) : (
          campaigns.map((c, i) => (
            <CampaignCard key={c.id} campaign={c} index={i} onOpen={onOpen} />
          ))
        )}
      </div>

      <NewCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CampaignCard({
  campaign,
  index,
  onOpen,
}: {
  campaign: CrmCampaign;
  index: number;
  onOpen: (id: string) => void;
}) {
  const tone = STATUS_TONE[campaign.status];
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -3 }}
      onClick={() => onOpen(campaign.id)}
      className="group flex min-h-[8.5rem] flex-col rounded-2xl border border-border-muted bg-surface p-4 text-left transition-colors hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-text">{campaign.name}</h3>
        <span
          className="inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            color: tone.color,
            background: 'color-mix(in srgb, currentColor 12%, transparent)',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} aria-hidden />
          {tone.label}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-text-dim">
        {campaign.description || 'No description'}
      </p>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-text-dim">
          <Users className="h-3.5 w-3.5 opacity-70" strokeWidth={2.2} />
          {campaign.lead_count} lead{campaign.lead_count === 1 ? '' : 's'}
        </span>
        {campaign.won_value_cents > 0 ? (
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--wp-success, #3ddc97)' }}
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
            {formatCents(campaign.won_value_cents)}
          </span>
        ) : null}
        <ArrowUpRight className="ml-auto h-4 w-4 text-text-faint transition-colors group-hover:text-accent" strokeWidth={2.2} />
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// New-campaign dialog
// ---------------------------------------------------------------------------

const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name').max(120, 'Too long'),
  description: z.string().trim().max(500, 'Too long').optional(),
});
type CampaignForm = z.infer<typeof campaignSchema>;

export function NewCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createCampaign = useCreateCampaign();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: '', description: '' },
  });

  const close = (v: boolean) => {
    if (!v) {
      reset({ name: '', description: '' });
      createCampaign.reset();
    }
    onOpenChange(v);
  };

  const onSubmit = (values: CampaignForm) => {
    createCampaign.mutate(
      { name: values.name, description: values.description || undefined },
      {
        onSuccess: () => {
          toast.success('Campaign created');
          close(false);
        },
        // 409 cap message (and any other error) surfaced verbatim.
        onError: (err) => toast.error(extractCrmError(err, 'Could not create campaign')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>New campaign</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody>
            <FormField label="Name" htmlFor="cmp-name" required error={errors.name?.message}>
              <Input id="cmp-name" placeholder="Q3 Outbound" {...register('name')} />
            </FormField>
            <FormField label="Description" htmlFor="cmp-desc" error={errors.description?.message}>
              <textarea
                id="cmp-desc"
                rows={3}
                placeholder="What is this campaign for?"
                className="flex w-full rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus-ring focus:border-accent"
                {...register('description')}
              />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createCampaign.isPending}
              leftIcon={
                createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
              }
            >
              {createCampaign.isPending ? 'Creating…' : 'Create campaign'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
