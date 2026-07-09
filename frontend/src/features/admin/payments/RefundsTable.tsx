import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AdminPayment } from '@/features/admin/types';
import { formatUsd, useAdminPayments } from './api';

interface RefundsTableProps {
  delay?: number;
}

function fmtDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function RefundsTable({ delay = 0 }: RefundsTableProps) {
  const query = useAdminPayments({
    status: 'refunded',
    page: 1,
    page_size: 50,
  });

  const rows = useMemo<AdminPayment[]>(
    () => query.data?.items ?? [],
    [query.data],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Refunds</h3>
            <p className="text-xs text-text-dim">
              Payments flagged as refunded. Placeholder view — real refund workflow will live
              here once billing is live.
            </p>
          </div>
        </div>

        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load refunds"
              description="Refresh to try again."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No refunds yet"
              description="Refunded payments will appear here so you can reconcile the dummy billing fixture."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Refunded at
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    User email
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((row) => {
                  const extra = row as AdminPayment & {
                    refunded_at?: string;
                    refund_reason?: string;
                  };
                  const refundedAt = extra.refunded_at ?? row.created_at;
                  const reason = extra.refund_reason ?? 'Customer request';
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-xs tabular-nums text-text-dim">
                        {fmtDate(refundedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-text">{row.user_email}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text">
                        {formatUsd(row.amount_usd)}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-dim">{reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
