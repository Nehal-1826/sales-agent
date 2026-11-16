import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { buildInvoice, usePaymentHistory } from '@/features/billing/api';
import type { Payment } from '@/features/billing/types';
import { InvoiceModal } from './InvoiceModal';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

export function InvoiceList() {
  const { money, date } = useLocaleFormat();
  const payments = usePaymentHistory();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalPayment, setModalPayment] = useState<Payment | null>(null);

  const toggle = (id: string) => setExpanded((curr) => (curr === id ? null : id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-text-dim" /> Invoices
        </CardTitle>
        <CardDescription>
          Expand a row for a quick preview or open the full printable invoice.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {payments.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (payments.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No invoices yet"
            description="Invoices will appear here after your first payment."
          />
        ) : (
          <ul className="divide-y divide-border-muted">
            {(payments.data ?? []).map((p) => {
              const invoice = buildInvoice(p);
              const isOpen = expanded === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-surface-2/40 focus-ring"
                    aria-expanded={isOpen}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-text-dim" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-dim" />
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="font-mono text-sm text-text">
                          {invoice.invoice_number}
                        </span>
                        <span className="text-[11px] text-text-dim">
                          {date(invoice.date)} · {invoice.plan_name}
                        </span>
                      </span>
                    </span>
                    <span className="font-mono text-sm tabular-nums text-text">
                      {money(invoice.total_cents / 100, { decimals: 2 })}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border-muted bg-surface-2/20 px-5 py-4 text-xs text-text-dim">
                      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider">Billed to</dt>
                          <dd className="text-text">{invoice.billing_address}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider">From</dt>
                          <dd className="text-text">{invoice.issuer_address}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider">Subtotal</dt>
                          <dd className="font-mono text-text">
                            ${(invoice.amount_cents / 100).toFixed(2)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider">Tax</dt>
                          <dd className="font-mono text-text">
                            ${(invoice.tax_cents / 100).toFixed(2)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setModalPayment(p)}
                        >
                          Open full invoice
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <InvoiceModal
        open={!!modalPayment}
        payment={modalPayment}
        onOpenChange={(o) => !o && setModalPayment(null)}
      />
    </Card>
  );
}
