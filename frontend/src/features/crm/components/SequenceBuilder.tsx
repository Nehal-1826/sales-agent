import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  LayoutTemplate,
  Loader2,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  useDeleteStep,
  useSequenceEnrollments,
  useSequenceSteps,
  useStopEnrollment,
  useUpdateSequence,
  extractCrmError,
} from '../api';
import type {
  CrmEnrollmentStatus,
  CrmSequence,
  CrmSequenceEnrollment,
  CrmSequenceStep,
} from '../types';
import { EnrollLeadsDialog } from './EnrollLeadsDialog';
import { StepEditorDialog } from './StepEditorDialog';
import { TemplateManagerDialog } from './TemplateManagerDialog';

export interface SequenceBuilderProps {
  sequence: CrmSequence;
  onBack: () => void;
}

/**
 * The editor for a single sequence: inline-editable name + status toggle,
 * an ordered step timeline (add / edit / delete), and an enrollments table
 * with a per-row stop action. All writes flow through the `@/features/crm`
 * hooks which keep the parent sequence-list roll-ups in sync.
 */
export function SequenceBuilder({ sequence, onBack }: SequenceBuilderProps) {
  const campaignId = sequence.campaign_id;
  const updateSequence = useUpdateSequence();

  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<CrmSequenceStep | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const status = sequence.status;
  const paused = status === 'paused';

  const toggleStatus = () => {
    const next = paused ? 'active' : 'paused';
    updateSequence.mutate(
      { id: sequence.id, campaignId, payload: { status: next } },
      {
        onSuccess: () =>
          toast.success(next === 'active' ? 'Sequence resumed' : 'Sequence paused'),
        onError: (err) => toast.error(extractCrmError(err, 'Could not update sequence')),
      },
    );
  };

  const openAddStep = () => {
    setEditingStep(null);
    setStepDialogOpen(true);
  };

  const openEditStep = (step: CrmSequenceStep) => {
    setEditingStep(step);
    setStepDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
          Sequences
        </button>

        <div className="min-w-0 flex-1">
          <SequenceNameEditor sequence={sequence} campaignId={campaignId} />
        </div>

        <Button
          size="sm"
          variant={paused ? 'primary' : 'secondary'}
          onClick={toggleStatus}
          disabled={updateSequence.isPending}
          leftIcon={
            updateSequence.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : paused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )
          }
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {/* Steps */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Mail className="h-4 w-4 text-accent" strokeWidth={2.2} />
            Steps
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTemplatesOpen(true)}
              leftIcon={<LayoutTemplate className="h-4 w-4" />}
            >
              Templates
            </Button>
            <Button size="sm" onClick={openAddStep} leftIcon={<Plus className="h-4 w-4" />}>
              Add step
            </Button>
          </div>
        </div>
        <StepTimeline
          sequenceId={sequence.id}
          campaignId={campaignId}
          onEdit={openEditStep}
          onAdd={openAddStep}
        />
      </section>

      {/* Enrollments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <Users className="h-4 w-4 text-accent" strokeWidth={2.2} />
            Enrollments
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEnrollOpen(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Enroll leads
          </Button>
        </div>
        <EnrollmentsTable sequenceId={sequence.id} campaignId={campaignId} />
      </section>

      <StepEditorDialog
        sequenceId={sequence.id}
        campaignId={campaignId}
        step={editingStep}
        open={stepDialogOpen}
        onOpenChange={setStepDialogOpen}
      />
      <TemplateManagerDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <EnrollLeadsDialog
        sequenceId={sequence.id}
        campaignId={campaignId}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline name editor
// ---------------------------------------------------------------------------

function SequenceNameEditor({
  sequence,
  campaignId,
}: {
  sequence: CrmSequence;
  campaignId: string;
}) {
  const updateSequence = useUpdateSequence();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sequence.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(sequence.name);
  }, [sequence.name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const name = value.trim();
    setEditing(false);
    if (!name || name === sequence.name) {
      setValue(sequence.name);
      return;
    }
    updateSequence.mutate(
      { id: sequence.id, campaignId, payload: { name } },
      {
        onSuccess: () => toast.success('Sequence renamed'),
        onError: (err) => {
          setValue(sequence.name);
          toast.error(extractCrmError(err, 'Could not rename sequence'));
        },
      },
    );
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setValue(sequence.name);
            setEditing(false);
          }
        }}
        className="w-full max-w-md rounded-lg border border-accent bg-surface px-2.5 py-1 text-lg font-semibold tracking-tight text-text focus-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-2 text-left"
    >
      <span className="truncate text-lg font-semibold tracking-tight text-text">
        {sequence.name}
      </span>
      <Pencil
        className="h-3.5 w-3.5 flex-none text-text-faint transition-colors group-hover:text-accent"
        strokeWidth={2.2}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step timeline
// ---------------------------------------------------------------------------

function StepTimeline({
  sequenceId,
  campaignId,
  onEdit,
  onAdd,
}: {
  sequenceId: string;
  campaignId: string;
  onEdit: (step: CrmSequenceStep) => void;
  onAdd: () => void;
}) {
  const stepsQuery = useSequenceSteps(sequenceId);
  const deleteStep = useDeleteStep();

  const steps = [...(stepsQuery.data ?? [])].sort((a, b) => a.step_order - b.step_order);

  const handleDelete = async (step: CrmSequenceStep, label: string) => {
    const ok = await confirm({
      title: 'Delete step?',
      description: `${label} ("${step.subject}") will be removed from this sequence.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteStep.mutate(
      { id: step.id, sequenceId, campaignId },
      {
        onSuccess: () => toast.success('Step deleted'),
        onError: (err) => toast.error(extractCrmError(err, 'Could not delete step')),
      },
    );
  };

  if (stepsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border-muted bg-surface px-4 py-8 text-sm text-text-dim">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading steps…
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-6 py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Mail className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <h4 className="mt-3 text-sm font-semibold text-text">No steps yet</h4>
        <p className="mx-auto mt-1 max-w-sm text-xs text-text-dim">
          Add the first email — enrolled leads receive each step in order, waiting the
          configured number of days between sends.
        </p>
        <div className="mt-4">
          <Button size="sm" onClick={onAdd} leftIcon={<Plus className="h-4 w-4" />}>
            Add step
          </Button>
        </div>
      </div>
    );
  }

  // Cumulative day offset down the timeline (Day 0 → Day X).
  let cumulative = 0;

  return (
    <ol className="space-y-2.5">
      <AnimatePresence initial={false}>
        {steps.map((step, i) => {
          cumulative += step.delay_days;
          const dayLabel = cumulative;
          const stepLabel = `Step ${i + 1}`;
          return (
            <motion.li
              key={step.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="relative flex gap-3"
            >
              {/* Timeline rail */}
              <div className="flex flex-none flex-col items-center">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-bg"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
                  }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-border-muted" aria-hidden />
                ) : null}
              </div>

              {/* Step card */}
              <div className="min-w-0 flex-1 rounded-xl border border-border-muted bg-surface p-3 transition-colors hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                        {stepLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-dim">
                        <Clock className="h-3 w-3" strokeWidth={2.2} />
                        {step.delay_days === 0
                          ? 'Sends immediately'
                          : `Wait ${step.delay_days}d`}
                        <span className="text-text-faint">· Day {dayLabel}</span>
                      </span>
                      {step.content_mode && step.content_mode !== 'text' && (
                        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          {step.content_mode === 'html' ? 'HTML' : 'AI'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-text">
                      {step.subject}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-dim">
                      {step.body}
                    </p>
                  </div>

                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(step)}
                      aria-label="Edit step"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted text-text-dim transition-colors hover:border-accent/40 hover:text-text"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(step, stepLabel)}
                      disabled={deleteStep.isPending}
                      aria-label="Delete step"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted text-text-dim transition-colors hover:border-accent3/50 hover:text-accent3 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Enrollments table
// ---------------------------------------------------------------------------

const ENROLLMENT_TONE: Record<CrmEnrollmentStatus, string> = {
  active: 'var(--wp-accent, #F26522)',
  completed: 'var(--wp-success, #3ddc97)',
  stopped: 'var(--wp-text-faint, #71717a)',
};

function EnrollmentsTable({
  sequenceId,
  campaignId,
}: {
  sequenceId: string;
  campaignId: string;
}) {
  const enrollmentsQuery = useSequenceEnrollments(sequenceId);
  const stopEnrollment = useStopEnrollment();
  const stepsQuery = useSequenceSteps(sequenceId);

  const enrollments = enrollmentsQuery.data ?? [];
  const totalSteps = stepsQuery.data?.length ?? 0;

  const stop = (enr: CrmSequenceEnrollment) => {
    stopEnrollment.mutate(
      { id: enr.id, sequenceId, campaignId },
      {
        onSuccess: () => toast.success('Enrollment stopped'),
        onError: (err) => toast.error(extractCrmError(err, 'Could not stop enrollment')),
      },
    );
  };

  if (enrollmentsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border-muted bg-surface px-4 py-8 text-sm text-text-dim">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading enrollments…
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-6 py-8 text-center text-sm text-text-dim">
        No leads enrolled yet. Use <span className="font-medium text-text">Enroll leads</span> to add some.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-muted text-[11px] uppercase tracking-wide text-text-faint">
              <th className="px-4 py-2.5 font-semibold">Lead</th>
              <th className="px-4 py-2.5 font-semibold">Progress</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Next send</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((enr) => {
              const tone = ENROLLMENT_TONE[enr.status];
              return (
                <tr
                  key={enr.id}
                  className="border-b border-border-muted/60 last:border-0 hover:bg-surface-2/30"
                >
                  <td className="px-4 py-3">
                    <p className="truncate font-medium text-text">
                      {enr.lead_name || enr.lead_email}
                    </p>
                    {enr.lead_name ? (
                      <p className="truncate text-xs text-text-dim">{enr.lead_email}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-dim">
                    Step {enr.current_step}
                    {totalSteps > 0 ? ` of ${totalSteps}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
                      style={{
                        color: tone,
                        background: 'color-mix(in srgb, currentColor 12%, transparent)',
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: tone }}
                        aria-hidden
                      />
                      {enr.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-dim">
                    {enr.status === 'active' ? relSend(enr.next_send_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {enr.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => stop(enr)}
                        disabled={stopEnrollment.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-border-muted px-2 py-1 text-xs font-medium text-text-dim transition-colors hover:border-accent3/50 hover:text-accent3 disabled:opacity-50"
                      >
                        <UserMinus className="h-3.5 w-3.5" strokeWidth={2.2} />
                        Stop
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relative "next send" label, e.g. "in 3d", "in 5h", "due now", "—". */
function relSend(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'due now';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${Math.max(1, min)}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h}h`;
  const days = Math.round(h / 24);
  return `in ${days}d`;
}
