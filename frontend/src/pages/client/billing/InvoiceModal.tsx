import { useEffect } from 'react';
import { Printer, Download } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogTitle,
  AppDialogDescription,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { buildInvoice } from '@/features/billing/api';
import type { Payment } from '@/features/billing/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

interface InvoiceModalProps {
  open: boolean;
  payment: Payment | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Print-ready invoice modal. Uses a small inline print stylesheet to hide the
 * rest of the page when the user hits "Download PDF" (which triggers
 * `window.print()` — the browser's native PDF export is good enough for MVP).
 */
export function InvoiceModal({ open, payment, onOpenChange }: InvoiceModalProps) {
  const { money, dateTime } = useLocaleFormat();
  useEffect(() => {
    if (!open) return;
    const style = document.createElement('style');
    style.setAttribute('data-invoice-print', 'true');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        [data-invoice-root], [data-invoice-root] * { visibility: visible !important; }
        [data-invoice-root] { position: absolute !important; left: 0; top: 0; width: 100%; padding: 32px; background: white !important; color: #111 !important; }
        [data-invoice-root] .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [open]);

  if (!payment) return null;
  const invoice = buildInvoice(payment);

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-2xl" data-invoice-root>
        <AppDialogTitle className="sr-only">Invoice {invoice.invoice_number}</AppDialogTitle>
        <AppDialogDescription className="sr-only">
          Printable dummy invoice for payment {payment.id}
        </AppDialogDescription>

        <div className="space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-muted pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-dim">Invoice</p>
              <h2 className="font-mono text-xl font-semibold text-text">
                {invoice.invoice_number}
              </h2>
              <p className="mt-1 text-xs text-text-dim">
                Issued {dateTime(invoice.date)}
              </p>
            </div>
            <div className="text-right text-xs text-text-dim">
              <p className="font-semibold text-text">WarmPulse, Inc.</p>
              <p>Email warmup platform</p>
              <p>support@warmpulse.io</p>
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-dim">Billed to</p>
              <p className="mt-1 text-sm text-text">{invoice.billing_address}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-dim">From</p>
              <p className="mt-1 text-sm text-text">{invoice.issuer_address}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border-muted">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/40 text-[11px] uppercase tracking-wider text-text-dim">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border-muted">
                  <td className="px-3 py-3 text-text">
                    {invoice.plan_name} plan — monthly subscription
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-text">
                    {money(invoice.amount_cents / 100, { decimals: 2 })}
                  </td>
                </tr>
                <tr className="border-t border-border-muted">
                  <td className="px-3 py-2 text-text-dim">Tax</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-dim">
                    {money(invoice.tax_cents / 100, { decimals: 2 })}
                  </td>
                </tr>
                <tr className="border-t border-border-muted bg-surface-2/30">
                  <td className="px-3 py-3 font-semibold text-text">Total</td>
                  <td className="px-3 py-3 text-right font-mono text-base font-semibold tabular-nums text-text">
                    {money(invoice.total_cents / 100, { decimals: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <p className="text-[11px] text-text-dim">
            {payment.payment_method === 'upi_dummy' && payment.dummy_upi_vpa
              ? `Paid via UPI (${payment.dummy_upi_vpa})`
              : payment.dummy_card_last4
                ? `Paid via card ending ${payment.dummy_card_last4}`
                : 'Paid via dummy gateway'}
            {' · Status: '}
            {payment.status}
          </p>
        </div>

        <div className="no-print mt-6 flex items-center justify-end gap-2 border-t border-border-muted pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Printer className="h-3.5 w-3.5" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => window.print()}
          >
            Download PDF
          </Button>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
