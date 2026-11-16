import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowUpRight,
  Layers,
  Loader2,
  Mail,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
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
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownLabel,
  AppDropdownSeparator,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  useCreateSequence,
  useDeleteSequence,
  useSequences,
  useUpdateSequence,
  extractCrmError,
} from '../api';
import type { CrmSequence, CrmSequenceStatus } from '../types';
import { SequenceBuilder } from './SequenceBuilder';

const STATUS_TONE: Record<CrmSequenceStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'var(--wp-success, #3ddc97)' },
  paused: { label: 'Paused', color: 'var(--wp-warning, #ffb454)' },
  archived: { label: 'Archived', color: 'var(--wp-text-faint, #71717a)' },
};

export interface SequenceListProps {
  campaignId: string;
}

/**
 * Lists a campaign's email sequences as cards, with a "New sequence" creator.
 * Opening a card swaps the whole panel to the `SequenceBuilder` (cross-faded
 * with framer-motion); a back action returns to the list.
 */
export function SequenceList({ campaignId }: SequenceListProps) {
  const sequencesQuery = useSequences(campaignId);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const sequences = sequencesQuery.data ?? [];
  const openSequence = sequences.find((s) => s.id === openId) ?? null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {openSequence ? (
        <motion.div
          key="builder"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <SequenceBuilder sequence={openSequence} onBack={() => setOpenId(null)} />
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text">
              <Layers className="h-4 w-4 text-accent" strokeWidth={2.2} />
              Sequences
            </h3>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              New sequence
            </Button>
          </div>

          {sequencesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border-muted bg-surface px-4 py-8 text-sm text-text-dim">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sequences…
            </div>
          ) : sequences.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sequences.map((seq, i) => (
                <SequenceCard
                  key={seq.id}
                  sequence={seq}
                  index={i}
                  campaignId={campaignId}
                  onOpen={() => setOpenId(seq.id)}
                />
              ))}
            </div>
          )}

          <NewSequenceDialog
            campaignId={campaignId}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={(id) => setOpenId(id)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Mail className="h-6 w-6" strokeWidth={2.2} />
      </span>
      <h4 className="mt-3 text-base font-semibold text-text">Automate your follow-ups</h4>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-dim">
        Build a sequence of emails that sends to enrolled leads on a schedule — each step
        waits a set number of days before it fires.
      </p>
      <div className="mt-4">
        <Button onClick={onCreate} leftIcon={<Plus className="h-4 w-4" />}>
          New sequence
        </Button>
      </div>
    </div>
  );
}

function SequenceCard({
  sequence,
  index,
  campaignId,
  onOpen,
}: {
  sequence: CrmSequence;
  index: number;
  campaignId: string;
  onOpen: () => void;
}) {
  const updateSequence = useUpdateSequence();
  const deleteSequence = useDeleteSequence();
  const tone = STATUS_TONE[sequence.status];
  const paused = sequence.status === 'paused';

  const setStatus = (next: CrmSequenceStatus) => {
    updateSequence.mutate(
      { id: sequence.id, campaignId, payload: { status: next } },
      {
        onSuccess: () =>
          toast.success(next === 'active' ? 'Sequence resumed' : 'Sequence paused'),
        onError: (err) => toast.error(extractCrmError(err, 'Could not update sequence')),
      },
    );
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete sequence?',
      description: `"${sequence.name}" and its steps + enrollments will be removed permanently.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteSequence.mutate(
      { id: sequence.id, campaignId },
      {
        onSuccess: () => toast.success('Sequence deleted'),
        onError: (err) => toast.error(extractCrmError(err, 'Could not delete sequence')),
      },
    );
  };

  const busy = updateSequence.isPending || deleteSequence.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="group flex min-h-[8.5rem] flex-col rounded-2xl border border-border-muted bg-surface p-4 transition-colors hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <h4 className="truncate text-sm font-semibold text-text">{sequence.name}</h4>
        </button>
        <div className="flex flex-none items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              color: tone.color,
              background: 'color-mix(in srgb, currentColor 12%, transparent)',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} aria-hidden />
            {tone.label}
          </span>
          <AppDropdown>
            <AppDropdownTrigger asChild>
              <button
                type="button"
                aria-label="Sequence settings"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted text-text-dim transition-colors hover:border-accent/40 hover:text-text"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-3.5 w-3.5" />
                )}
              </button>
            </AppDropdownTrigger>
            <AppDropdownContent align="end">
              <AppDropdownLabel>Sequence</AppDropdownLabel>
              {paused ? (
                <AppDropdownItem onSelect={() => setStatus('active')}>
                  <Play className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Resume
                </AppDropdownItem>
              ) : (
                <AppDropdownItem onSelect={() => setStatus('paused')}>
                  <Pause className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Pause
                </AppDropdownItem>
              )}
              <AppDropdownSeparator />
              <AppDropdownItem danger onSelect={remove}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                Delete
              </AppDropdownItem>
            </AppDropdownContent>
          </AppDropdown>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex flex-1 flex-col justify-end text-left"
      >
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-text-dim">
            <Mail className="h-3.5 w-3.5 opacity-70" strokeWidth={2.2} />
            {sequence.step_count} step{sequence.step_count === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1 text-text-dim">
            <Users className="h-3.5 w-3.5 opacity-70" strokeWidth={2.2} />
            {sequence.active_enrollments} active
          </span>
          <ArrowUpRight
            className="ml-auto h-4 w-4 text-text-faint transition-colors group-hover:text-accent"
            strokeWidth={2.2}
          />
        </div>
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// New-sequence dialog
// ---------------------------------------------------------------------------

const sequenceSchema = z.object({
  name: z.string().trim().min(1, 'Give the sequence a name').max(120, 'Too long'),
});
type SequenceForm = z.infer<typeof sequenceSchema>;

function NewSequenceDialog({
  campaignId,
  open,
  onOpenChange,
  onCreated,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const createSequence = useCreateSequence();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SequenceForm>({
    resolver: zodResolver(sequenceSchema),
    defaultValues: { name: '' },
  });

  const close = (v: boolean) => {
    if (!v) {
      reset({ name: '' });
      createSequence.reset();
    }
    onOpenChange(v);
  };

  const onSubmit = (values: SequenceForm) => {
    createSequence.mutate(
      { campaign_id: campaignId, name: values.name },
      {
        onSuccess: (seq) => {
          toast.success('Sequence created');
          close(false);
          // Jump straight into the builder so they can add steps.
          onCreated(seq.id);
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not create sequence')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>New sequence</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody>
            <FormField label="Name" htmlFor="seq-name" required error={errors.name?.message}>
              <Input id="seq-name" placeholder="3-touch follow-up" {...register('name')} />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createSequence.isPending}
              leftIcon={
                createSequence.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : undefined
              }
            >
              {createSequence.isPending ? 'Creating…' : 'Create sequence'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
