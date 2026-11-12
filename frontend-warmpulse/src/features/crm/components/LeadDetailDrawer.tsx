import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity as ActivityIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageSquarePlus,
  Pencil,
  Reply,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import {
  useAddActivity,
  useCrmMembers,
  useDeleteLead,
  useLeadActivities,
  useUpdateLead,
  extractCrmError,
} from '../api';
import {
  CRM_STAGES,
  crmStageColor,
  type CrmActivity,
  type CrmActivityKind,
  type CrmLead,
  type CrmStage,
} from '../types';

const editSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  company: z.string().trim().optional(),
  title: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  value_dollars: z.coerce.number().min(0, 'Must be ≥ 0').optional(),
  owner_email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /.+@.+\..+/.test(v), 'Enter a valid email'),
  tags: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
type EditForm = z.infer<typeof editSchema>;

const ACTIVITY_ICON: Record<CrmActivityKind, typeof ActivityIcon> = {
  created: Sparkles,
  note: MessageSquarePlus,
  stage_change: ActivityIcon,
  email_sent: Send,
  email_opened: MailOpen,
  email_replied: Reply,
};

function relTime(iso: string | null): string {
  if (!iso) return 'just now';
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export interface LeadDetailDrawerProps {
  lead: CrmLead | null;
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Right-side slide-over for a single lead. Inline-editable core fields, a
 * selectable stage pill row, and an activity timeline with an add-note
 * composer. Built on Radix Dialog primitives (not the centered AppDialog)
 * so it can pin to the right edge full-height.
 */
export function LeadDetailDrawer({
  lead,
  campaignId,
  open,
  onOpenChange,
}: LeadDetailDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border-muted bg-surface text-text shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-250"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {lead ? `Lead — ${lead.name || lead.email}` : 'Lead detail'}
          </DialogPrimitive.Title>
          {lead ? (
            <LeadDrawerBody
              lead={lead}
              campaignId={campaignId}
              onClose={() => onOpenChange(false)}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LeadDrawerBody({
  lead,
  campaignId,
  onClose,
}: {
  lead: CrmLead;
  campaignId: string;
  onClose: () => void;
}) {
  const { money } = useLocaleFormat();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const membersQuery = useCrmMembers();
  const [editing, setEditing] = useState(false);

  // Owner dropdown options = workspace members, plus the lead's current owner
  // if it isn't (e.g. an imported email) so editing never silently drops it.
  const members = membersQuery.data ?? [];
  const ownerOptions = (() => {
    const seen = new Set(members.map((m) => m.email.toLowerCase()));
    const extra =
      lead.owner_email && !seen.has(lead.owner_email.toLowerCase())
        ? [{ email: lead.owner_email, name: null as string | null }]
        : [];
    return [...members, ...extra];
  })();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: toFormValues(lead),
  });

  // Re-seed the form whenever a different lead opens.
  useEffect(() => {
    reset(toFormValues(lead));
    setEditing(false);
  }, [lead, reset]);

  const onSubmit = (values: EditForm) => {
    updateLead.mutate(
      {
        id: lead.id,
        campaignId,
        payload: {
          name: values.name,
          email: values.email,
          company: values.company ?? '',
          title: values.title ?? '',
          phone: values.phone ?? '',
          value_cents: Math.round((values.value_dollars ?? 0) * 100),
          owner_email: values.owner_email ?? '',
          tags: parseTags(values.tags),
          notes: values.notes ?? '',
        },
      },
      {
        onSuccess: () => {
          toast.success('Lead updated');
          setEditing(false);
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not save lead')),
      },
    );
  };

  const setStage = (stage: CrmStage) => {
    if (stage === lead.stage) return;
    updateLead.mutate(
      { id: lead.id, campaignId, payload: { stage } },
      { onError: (err) => toast.error(extractCrmError(err, 'Could not change stage')) },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete lead?',
      description: `${lead.name || lead.email} and its activity history will be removed permanently.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteLead.mutate(
      { id: lead.id, campaignId },
      {
        onSuccess: () => {
          toast.success('Lead deleted');
          onClose();
        },
        onError: (err) => toast.error(extractCrmError(err, 'Could not delete lead')),
      },
    );
  };

  return (
    <>
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-border-muted p-4">
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, var(--wp-accent, #F26522), var(--wp-accent-2, #FF8A4B))',
          }}
          aria-hidden
        >
          {(lead.name || lead.email).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-text">
            {lead.name || lead.email}
          </h2>
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-1 truncate text-xs text-text-dim hover:text-accent"
          >
            <Mail className="h-3 w-3 flex-none" strokeWidth={2.2} />
            <span className="truncate">{lead.email}</span>
          </a>
        </div>
        <DialogPrimitive.Close
          className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-border-muted/60 text-text-dim transition-colors hover:border-accent/60 hover:text-text"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        </DialogPrimitive.Close>
      </header>

      {/* Scrollable body */}
      <div
        className="flex-1 space-y-5 overflow-y-auto p-4"
        style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}
      >
        {/* Stage pills */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
            Stage
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CRM_STAGES.map((meta) => {
              const active = meta.key === lead.stage;
              const color = crmStageColor(meta.key);
              return (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => setStage(meta.key)}
                  disabled={updateLead.isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                    active
                      ? 'text-text'
                      : 'border-border-muted text-text-dim hover:text-text',
                  )}
                  style={
                    active
                      ? {
                          borderColor: color,
                          background: 'color-mix(in srgb, currentColor 10%, transparent)',
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color }}
                    aria-hidden
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Details — read view or edit form */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
              Details
            </p>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Pencil className="h-3 w-3" strokeWidth={2.2} />
                Edit
              </button>
            ) : null}
          </div>

          {editing ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <FormField label="Name" htmlFor="ld-name" required error={errors.name?.message}>
                <Input id="ld-name" {...register('name')} />
              </FormField>
              <FormField label="Email" htmlFor="ld-email" required error={errors.email?.message}>
                <Input id="ld-email" type="email" {...register('email')} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Company" htmlFor="ld-company">
                  <Input id="ld-company" {...register('company')} />
                </FormField>
                <FormField label="Title" htmlFor="ld-title">
                  <Input id="ld-title" {...register('title')} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Phone" htmlFor="ld-phone">
                  <Input id="ld-phone" {...register('phone')} />
                </FormField>
                <FormField
                  label="Value ($)"
                  htmlFor="ld-value"
                  error={errors.value_dollars?.message}
                >
                  <Input id="ld-value" type="number" min={0} step={1} {...register('value_dollars')} />
                </FormField>
              </div>
              <FormField
                label="Owner"
                htmlFor="ld-owner"
                hint="Assign to a team member"
                error={errors.owner_email?.message}
              >
                <select
                  id="ld-owner"
                  className="flex h-10 w-full rounded-lg border border-border-muted bg-surface px-3 text-sm text-text focus-ring focus:border-accent"
                  {...register('owner_email')}
                >
                  <option value="">Unassigned</option>
                  {ownerOptions.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.name ? `${m.name} · ${m.email}` : m.email}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Tags" htmlFor="ld-tags" hint="Comma-separated">
                <Input id="ld-tags" placeholder="enterprise, warm, q3" {...register('tags')} />
              </FormField>
              <FormField label="Notes" htmlFor="ld-notes">
                <textarea
                  id="ld-notes"
                  rows={3}
                  className="flex w-full rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus-ring focus:border-accent"
                  {...register('notes')}
                />
              </FormField>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    reset(toFormValues(lead));
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateLead.isPending || !isDirty}
                  leftIcon={
                    updateLead.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
                  }
                >
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-2 rounded-xl border border-border-muted bg-surface-2/30 p-3">
              <DetailRow label="Company" value={lead.company} />
              <DetailRow label="Title" value={lead.title} />
              <DetailRow label="Phone" value={lead.phone} />
              <DetailRow
                label="Value"
                value={lead.value_cents > 0 ? money(Math.round(lead.value_cents / 100)) : ''}
              />
              <DetailRow label="Owner" value={lead.owner_email} />
              <DetailRow label="Source" value={lead.source} />
              {lead.tags?.length ? (
                <div className="flex items-start justify-between gap-3 text-xs">
                  <dt className="flex-none text-text-faint">Tags</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {lead.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-border-muted px-1.5 py-0.5 text-[10px] text-text-dim"
                      >
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {lead.notes ? (
                <div className="border-t border-border-muted/60 pt-2 text-xs">
                  <dt className="mb-1 text-text-faint">Notes</dt>
                  <dd className="whitespace-pre-wrap leading-relaxed text-text-dim">
                    {lead.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </section>

        {/* Activity timeline */}
        <ActivityTimeline leadId={lead.id} />
      </div>

      {/* Footer — delete */}
      <footer className="flex items-center justify-between border-t border-border-muted p-4">
        <span className="text-[11px] text-text-faint">
          Created {relTime(lead.created_at)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleteLead.isPending}
          className="text-accent3 hover:text-accent3"
          leftIcon={
            deleteLead.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )
          }
        >
          Delete lead
        </Button>
      </footer>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="flex-none text-text-faint">{label}</dt>
      <dd className="truncate text-right text-text-dim">{value || '—'}</dd>
    </div>
  );
}

function ActivityTimeline({ leadId }: { leadId: string }) {
  const activitiesQuery = useLeadActivities(leadId);
  const addActivity = useAddActivity();
  const [note, setNote] = useState('');

  const activities = activitiesQuery.data ?? [];

  const submitNote = () => {
    const body = note.trim();
    if (!body) return;
    addActivity.mutate(
      { leadId, payload: { kind: 'note', body } },
      {
        onSuccess: () => setNote(''),
        onError: (err) => toast.error(extractCrmError(err, 'Could not add note')),
      },
    );
  };

  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        <ActivityIcon className="h-3 w-3" strokeWidth={2.4} />
        Activity
      </p>

      {/* Composer */}
      <div className="mb-3 flex items-start gap-2">
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitNote();
          }}
          placeholder="Add a note…"
          className="flex-1 rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus-ring focus:border-accent"
        />
        <Button
          type="button"
          size="icon"
          onClick={submitNote}
          disabled={addActivity.isPending || !note.trim()}
          aria-label="Add note"
        >
          {addActivity.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={2.2} />
          )}
        </Button>
      </div>

      {activitiesQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-text-dim">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
        </div>
      ) : activities.length === 0 ? (
        <p className="py-4 text-center text-xs italic text-text-faint">
          No activity yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {activities.map((a, i) => (
            <ActivityRow key={a.id} activity={a} isLast={i === activities.length - 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ActivityRow({ activity, isLast }: { activity: CrmActivity; isLast: boolean }) {
  const Icon = ACTIVITY_ICON[activity.kind] ?? ActivityIcon;
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="relative flex gap-3 pl-1"
    >
      <div className="flex flex-col items-center">
        <span
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
            color: 'var(--wp-accent, #F26522)',
          }}
        >
          <Icon className="h-3 w-3" strokeWidth={2.4} />
        </span>
        {!isLast ? <span className="mt-1 w-px flex-1 bg-border-muted" aria-hidden /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-xs leading-relaxed text-text">{activity.body}</p>
        <p className="mt-0.5 text-[10px] text-text-faint">
          {activity.actor_email ? `${activity.actor_email} · ` : ''}
          {relTime(activity.created_at)}
        </p>
      </div>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFormValues(lead: CrmLead): EditForm {
  return {
    name: lead.name,
    email: lead.email,
    company: lead.company,
    title: lead.title,
    phone: lead.phone,
    value_dollars: Math.round((lead.value_cents || 0) / 100),
    owner_email: lead.owner_email,
    tags: (lead.tags ?? []).join(', '),
    notes: lead.notes,
  };
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
