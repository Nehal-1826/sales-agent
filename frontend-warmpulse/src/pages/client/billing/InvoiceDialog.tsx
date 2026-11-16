import { useEffect } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/AppToast';
import { buildInvoice, useDownloadInvoice } from '@/features/billing/api';
import type { Payment } from '@/features/billing/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/**
 * View-invoice modal. Renders the line items inline, then offers three
 * actions:
 *
 *   - Download PDF — calls ``GET /payments/{id}/invoice.pdf`` (with auto
 *     CSV fallback when the backend returns 501).
 *   - Download CSV — calls ``GET /payments/{id}/invoice.csv`` directly.
 *   - Print — uses the browser's native print dialog (kept for users who
 *     want to save as a PDF via the OS-level print sheet).
 *
 * Why not reuse ``InvoiceModal.tsx``? That component only does
 * ``window.print()`` — it doesn't trigger a real download. Adding the
 * blob path on top of the existing component would mix two concerns.
 */

interface InvoiceDialogProps {
  open: boolean;
  payment: Payment | null;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceDialog({
  open,
  payment,
  onOpenChange,
}: InvoiceDialogProps) {
  const { money, date } = useLocaleFormat();
  const download = useDownloadInvoice();

  // Print stylesheet — same trick as ``InvoiceModal``. Mounted only while
  // the dialog is open so the rest of the app is unaffected.
  useEffect(() => {
    if (!open) return;
    const style = document.createElement('style');
    style.setAttribute('data-invoice-dialog-print', 'true');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        [data-invoice-dialog], [data-invoice-dialog] * { visibility: visible !important; }
        [data-invoice-dialog] { position: absolute !important; left: 0; top: 0; width: 100%; padding: 24px; background: white !important; color: #111 !important; }
        [data-invoice-dialog] .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [open]);

  if (!payment) return null;
  const invoice = buildInvoice(payment);

  const runDownload = (format: 'pdf' | 'csv') => {
    download.mutate(
      {
        paymentId: payment.id,
        format,
        filename: `${invoice.invoice_number}.${format}`,
      },
      {
        onSuccess: () => {
          toast.success(`Invoice ${format.toUpperCase()} downloaded.`);
        },
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: unknown } } })
            .response?.data?.detail;
          if (typeof detail === 'string') {
            toast.error(detail);
            return;
          }
          toast.error(`Could not download invoice ${format.toUpperCase()}.`);
        },
      },
    );
  };

  const methodLine =
    payment.payment_method === 'upi_dummy' && payment.dummy_upi_vpa
      ? `Paid via UPI (${payment.dummy_upi_vpa})`
      : payment.dummy_card_last4
        ? `Paid via card ending ${payment.dummy_card_last4}`
        : 'Paid via dummy gateway';

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-2xl" data-invoice-dialog>
        <AppDialogHeader>
          <AppDialogTitle>Invoice {invoice.invoice_number}</AppDialogTitle>
          <AppDialogDescription>
            Dummy invoice for payment {payment.id.slice(0, 8).toUpperCase()}.
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogBody>
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-dim">
                  Billed to
                </p>
                <p className="mt-1 text-sm text-text">
                  {invoice.billing_address}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-dim">
                  From
                </p>
                <p className="mt-1 text-sm text-text">
                  {invoice.issuer_address}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-dim">
                  Issued
                </p>
                <p className="mt-1 text-sm text-text">
                  {date(invoice.date)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-dim">
                  Status
                </p>
                <p className="mt-1 text-sm capitalize text-text">
                  {payment.status}
                </p>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-border-muted">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/40 text-[11px] uppercase tracking-wider text-text-dim">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border-muted">
                    <td className="px-3 py-3 text-text">
                      {invoice.plan_name} plan — monthly subscription
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-text">
                      {money(invoice.amount_cents / 100)}
                    </td>
                  </tr>
                  <tr className="border-t border-border-muted">
                    <td className="px-3 py-2 text-text-dim">Tax</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-text-dim">
                      {money(invoice.tax_cents / 100)}
                    </td>
                  </tr>
                  <tr className="border-t border-border-muted bg-surface-2/30">
                    <td className="px-3 py-3 font-semibold text-text">Total</td>
                    <td className="px-3 py-3 text-right font-mono text-base font-semibold tabular-nums text-text">
                      {money(invoice.total_cents / 100)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <p className="text-[11px] text-text-dim">{methodLine}</p>
          </div>
        </AppDialogBody>

        <AppDialogFooter className="no-print">
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
            variant="secondary"
            leftIcon={<FileSpreadsheet className="h-3.5 w-3.5" />}
            onClick={() => runDownload('csv')}
            disabled={download.isPending}
          >
            CSV
          </Button>
          <Button
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => runDownload('pdf')}
            disabled={download.isPending}
            isLoading={download.isPending}
          >
            {download.isPending ? 'Downloading…' : 'Download PDF'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default InvoiceDialog;
