import { useMemo, useState } from 'react';
import { Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePaymentHistory } from '@/features/billing/api';
import type { Payment, PaymentStatus } from '@/features/billing/types';
import { InvoiceModal } from './InvoiceModal';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

const PAGE_SIZE = 10;

const STATUS_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  succeeded: 'green',
  pending: 'yellow',
  failed: 'orange',
  refunded: 'blue',
};

export function PaymentHistoryTable() {
  const { money, date } = useLocaleFormat();
  const payments = usePaymentHistory();
  const [page, setPage] = useState(1);
  const [invoicePayment, setInvoicePayment] = useState<Payment | null>(null);

  const rows = payments.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const paged = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
        <CardDescription>All dummy charges are recorded for your reference.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {payments.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No payments yet"
            description="Your billing history will appear here once you upgrade."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-muted bg-surface-2/40 text-[11px] uppercase tracking-wider text-text-dim">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Card</th>
                    <th className="px-3 py-2 text-right font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border-muted/60 last:border-b-0"
                    >
                      <td className="px-3 py-3 text-text-dim">
                        {date(p.created_at)}
                      </td>
                      <td className="px-3 py-3 font-medium text-text capitalize">
                        {p.plan_name}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-text">
                        {money(p.amount_cents / 100, { decimals: 2 })}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={STATUS_VARIANTS[p.status]}>{p.status}</Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-text-dim">
                        {p.payment_method === 'upi_dummy' && p.dummy_upi_vpa
                          ? `UPI · ${p.dummy_upi_vpa}`
                          : p.dummy_card_last4
                            ? `•••• ${p.dummy_card_last4}`
                            : '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setInvoicePayment(p)}
                          leftIcon={<Receipt className="h-3.5 w-3.5" />}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-muted px-4 py-2.5 text-xs text-text-dim">
                <span>
                  Page {page} of {totalPages} · {rows.length} payments
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <InvoiceModal
        open={!!invoicePayment}
        payment={invoicePayment}
        onOpenChange={(o) => !o && setInvoicePayment(null)}
      />
    </Card>
  );
}
