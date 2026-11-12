import { useMemo, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Download, Filter, Loader2, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
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
import type { AdminPayment, PaymentStatus } from '@/features/admin/types';
import {
  EMPTY_PAYMENTS_DRAFT,
  draftToFilters,
  formatUsd,
  useAdminPayments,
  useExportPaymentsCsv,
  type PaymentsFilterDraft,
} from './api';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: PaymentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

function statusVariant(s: PaymentStatus): BadgeVariant {
  if (s === 'succeeded') return 'green';
  if (s === 'pending') return 'yellow';
  if (s === 'failed') return 'orange';
  return 'neutral';
}

function fmtDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface PaymentsTableProps {
  delay?: number;
}

export function PaymentsTable({ delay = 0.15 }: PaymentsTableProps) {
  const [draft, setDraft] = useState<PaymentsFilterDraft>(EMPTY_PAYMENTS_DRAFT);
  const [applied, setApplied] = useState<PaymentsFilterDraft>(EMPTY_PAYMENTS_DRAFT);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AdminPayment | null>(null);

  const filters = useMemo(
    () => draftToFilters(applied, page, PAGE_SIZE),
    [applied, page],
  );
  const query = useAdminPayments(filters);
  const exporter = useExportPaymentsCsv();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters = useMemo(() => {
    if (applied.status !== 'all') return true;
    return (
      applied.plan.trim() !== '' ||
      applied.user_email.trim() !== '' ||
      applied.date_from !== '' ||
      applied.date_to !== ''
    );
  }, [applied]);

  const update = (patch: Partial<PaymentsFilterDraft>) =>
    setDraft((p) => ({ ...p, ...patch }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  const onReset = () => {
    setDraft(EMPTY_PAYMENTS_DRAFT);
    setApplied(EMPTY_PAYMENTS_DRAFT);
    setPage(1);
  };

  const onExport = () => {
    exporter.mutate(filters, {
      onSuccess: (blob) => {
        if (!blob || blob.size === 0) {
          toast.error('Export returned no data');
          return;
        }
        const iso = new Date().toISOString().slice(0, 10);
        triggerDownload(blob, `payments-${iso}.csv`);
        toast.success('CSV download started');
      },
      onError: () => toast.error('Failed to export payments'),
    });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay }}
      >
        <Card className="overflow-hidden">
          <form onSubmit={onSubmit} className="border-b border-border-muted p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="pay-status" className="text-xs text-text-dim">
                  Status
                </Label>
                <AppSelect
                  value={draft.status}
                  onValueChange={(v) => update({ status: v as PaymentStatus | 'all' })}
                >
                  <AppSelectTrigger id="pay-status">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <AppSelectItem key={o.value} value={o.value}>
                        {o.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <div>
                <Label htmlFor="pay-plan" className="text-xs text-text-dim">
                  Plan
                </Label>
                <Input
                  id="pay-plan"
                  value={draft.plan}
                  onChange={(e) => update({ plan: e.target.value })}
                  placeholder="starter / pro / agency"
                />
              </div>
              <div>
                <Label htmlFor="pay-email" className="text-xs text-text-dim">
                  User email
                </Label>
                <Input
                  id="pay-email"
                  value={draft.user_email}
                  onChange={(e) => update({ user_email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label htmlFor="pay-from" className="text-xs text-text-dim">
                  From
                </Label>
                <Input
                  id="pay-from"
                  type="date"
                  value={draft.date_from}
                  onChange={(e) => update({ date_from: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pay-to" className="text-xs text-text-dim">
                  To
                </Label>
                <Input
                  id="pay-to"
                  type="date"
                  value={draft.date_to}
                  onChange={(e) => update({ date_to: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onExport}
                disabled={exporter.isPending || items.length === 0}
                leftIcon={
                  exporter.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )
                }
              >
                {exporter.isPending ? 'Exporting…' : 'Export CSV'}
              </Button>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                >
                  Reset
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                size="sm"
                leftIcon={<Filter className="h-4 w-4" />}
              >
                Apply filters
              </Button>
            </div>
          </form>

          {query.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="p-5">
              <EmptyState
                title="Couldn't load payments"
                description="Refresh to try again."
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No payments match"
                description={
                  hasActiveFilters
                    ? 'Try broadening your filters or clearing them.'
                    : 'Demo payments will populate here once the billing fixture runs.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead className="bg-surface-2/50 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      User
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Plan
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Method
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {items.map((row) => {
                    const method =
                      (row as AdminPayment & { payment_method?: string }).payment_method ??
                      'card';
                    const invoice =
                      (row as AdminPayment & { invoice_id?: string }).invoice_id ??
                      row.external_ref ??
                      row.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-surface-2/50',
                        )}
                        onClick={() => setDetail(row)}
                      >
                        <td className="px-4 py-3 text-xs tabular-nums text-text-dim">
                          {fmtDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text">
                          <div className="flex flex-col">
                            <span className="font-medium">{row.user_email}</span>
                            <span className="font-mono text-[11px] text-text-dim">
                              {row.user_id}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text">{row.plan}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-text">
                          {formatUsd(row.amount_usd)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-dim">{method}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-text-dim">
                          {invoice}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!query.isLoading && !query.isError && items.length > 0 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border-muted px-4 py-3 text-xs text-text-dim">
              <span className="tabular-nums">
                Page {page} of {pageCount} · {total.toLocaleString()} record
                {total === 1 ? '' : 's'}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount || query.isFetching}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </motion.div>

      <PaymentDetailDialog payment={detail} onClose={() => setDetail(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function PaymentDetailDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  const open = payment !== null;
  const pretty = payment ? JSON.stringify(payment, null, 2) : '';
  return (
    <AppDialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <AppDialogContent className="max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>Payment detail</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          {payment ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">User</p>
                  <p className="text-text">{payment.user_email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">Plan</p>
                  <p className="text-text">{payment.plan}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">Amount</p>
                  <p className="tabular-nums text-text">{formatUsd(payment.amount_usd)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">Status</p>
                  <Badge variant={statusVariant(payment.status)}>{payment.status}</Badge>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">Created</p>
                  <p className="text-text">{fmtDate(payment.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-text-dim">Reference</p>
                  <p className="font-mono text-[12px] text-text">
                    {payment.external_ref ?? payment.id}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-text-dim">
                  Raw payload
                </p>
                <pre className="max-h-80 overflow-auto rounded-md border border-border-muted bg-bg/60 p-3 font-mono text-[11px] leading-relaxed text-text">
                  {pretty}
                </pre>
              </div>
            </div>
          ) : null}
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
