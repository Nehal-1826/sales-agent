import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { formatDateTime as _fmtDT } from '@/lib/format';
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
import {
  useCreateScheduledReport,
  useDeleteScheduledReport,
  useReports,
  useUpdateScheduledReport,
  type ReportFrequency,
  type ReportType,
  type ScheduledReport,
} from './api';

const FREQ_VARIANT: Record<ReportFrequency, BadgeVariant> = {
  daily: 'blue',
  weekly: 'green',
  monthly: 'orange',
};

const TYPE_LABEL: Record<ReportType, string> = {
  warmth: 'Warmth',
  engagement: 'Opens & Replies',
  placement: 'Where Emails Land',
  white_label: 'White-label',
};

export function ScheduledReportsPanel() {
  const { data, isLoading, isError } = useReports();
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Scheduled reports
            </CardTitle>
            <CardDescription>
              Recurring reports delivered by email on your preferred pace.
            </CardDescription>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCreating(true)}
          >
            New scheduled report
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Couldn't load scheduled reports" description="Try refreshing." />
          </div>
        ) : !data?.scheduled.length ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="No scheduled reports yet"
              description="Schedule a weekly warmth digest to your team without lifting a finger."
              action={
                <Button
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setCreating(true)}
                >
                  Schedule a report
                </Button>
              }
            />
          </div>
        ) : (
          <ScheduleTable rows={data.scheduled} onEdit={setEditing} />
        )}
      </CardContent>

      <ScheduleDialog
        open={creating}
        onOpenChange={setCreating}
        mode="create"
      />
      <ScheduleDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        mode="edit"
        initial={editing ?? undefined}
      />
    </Card>
  );
}

function ScheduleTable({
  rows,
  onEdit,
}: {
  rows: ScheduledReport[];
  onEdit: (s: ScheduledReport) => void;
}) {
  const remove = useDeleteScheduledReport();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="bg-surface-2/50">
          <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Frequency</th>
            <th className="px-4 py-2">Recipients</th>
            <th className="px-4 py-2">Next run</th>
            <th className="px-4 py-2">Last run</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-muted">
          {rows.map((s) => (
            <tr key={s.id} className="text-sm">
              <td className="px-4 py-2 font-medium">{TYPE_LABEL[s.type]}</td>
              <td className="px-4 py-2">
                <Badge variant={FREQ_VARIANT[s.frequency]}>{s.frequency}</Badge>
              </td>
              <td className="px-4 py-2 text-text-dim">
                {s.recipients.length === 0 ? (
                  <span className="italic">no recipients</span>
                ) : s.recipients.length <= 2 ? (
                  s.recipients.join(', ')
                ) : (
                  `${s.recipients.slice(0, 2).join(', ')} +${s.recipients.length - 2}`
                )}
              </td>
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {formatDateTime(s.next_run_at)}
              </td>
              <td className="px-4 py-2 tabular-nums text-text-dim">
                {s.last_run_at ? formatDateTime(s.last_run_at) : '—'}
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(s)}
                    aria-label="Edit schedule"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete scheduled report?',
                        description: 'No more reports will be generated on this schedule.',
                        confirmLabel: 'Delete',
                        danger: true,
                      });
                      if (!ok) return;
                      remove.mutate(s.id, {
                        onSuccess: () => toast.success('Schedule deleted'),
                        onError: (err) =>
                          toast.error(extractErrorMessage(err, 'Failed to delete')),
                      });
                    }}
                    aria-label="Delete schedule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  initial?: ScheduledReport;
}) {
  const [type, setType] = useState<ReportType>('warmth');
  const [frequency, setFrequency] = useState<ReportFrequency>('weekly');
  const [recipients, setRecipients] = useState('');

  const create = useCreateScheduledReport();
  const update = useUpdateScheduledReport();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open && initial) {
      setType(initial.type);
      setFrequency(initial.frequency);
      setRecipients(initial.recipients.join(', '));
    } else if (!open) {
      setType('warmth');
      setFrequency('weekly');
      setRecipients('');
      create.reset();
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  const submit = () => {
    const list = recipients
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (list.some((e) => !e.includes('@'))) {
      toast.error('All recipients must be valid email addresses');
      return;
    }

    if (mode === 'edit' && initial) {
      update.mutate(
        {
          id: initial.id,
          payload: { type, frequency, recipients: list },
        },
        {
          onSuccess: () => {
            toast.success('Schedule updated');
            onOpenChange(false);
          },
          onError: () => toast.error('Failed to update'),
        },
      );
    } else {
      create.mutate(
        { type, frequency, recipients: list },
        {
          onSuccess: () => {
            toast.success('Schedule created');
            onOpenChange(false);
          },
          onError: () => toast.error('Failed to create'),
        },
      );
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>
            {mode === 'edit' ? 'Edit scheduled report' : 'New scheduled report'}
          </AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <FormField label="Report type" htmlFor="sr-type">
            <AppSelect value={type} onValueChange={(v) => setType(v as ReportType)}>
              <AppSelectTrigger id="sr-type">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="warmth">Warmth summary</AppSelectItem>
                <AppSelectItem value="engagement">Opens &amp; replies breakdown</AppSelectItem>
                <AppSelectItem value="placement">Where emails land</AppSelectItem>
                <AppSelectItem value="white_label">White-label (Agency)</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </FormField>
          <FormField label="Frequency" htmlFor="sr-freq">
            <AppSelect
              value={frequency}
              onValueChange={(v) => setFrequency(v as ReportFrequency)}
            >
              <AppSelectTrigger id="sr-freq">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="daily">Daily</AppSelectItem>
                <AppSelectItem value="weekly">Weekly</AppSelectItem>
                <AppSelectItem value="monthly">Monthly</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </FormField>
          <FormField
            label="Recipients"
            htmlFor="sr-recipients"
            hint="Comma-separated email addresses."
          >
            <Input
              id="sr-recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="ceo@acme.com, ops@acme.com"
            />
          </FormField>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            leftIcon={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create schedule'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function formatDateTime(iso: string): string {
  try {
    return _fmtDT(iso);
  } catch {
    return iso;
  }
}
