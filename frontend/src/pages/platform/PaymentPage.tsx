import { PageHeader } from '../../components/ui';
import { navigateAdmin } from '../../lib/router';
import { AdminBillingPage } from './AdminBillingPage';
import { InvoicesPage } from './InvoicesPage';
import { PaymentsPage } from './PaymentsPage';
import type { PaymentTab } from './shared';

const TABS: { id: PaymentTab; label: string }[] = [
  { id: 'payment', label: 'Billing' },
  { id: 'payments', label: 'Payments' },
  { id: 'invoices', label: 'Invoices' },
];

/**
 * PAYMENT — one section for everything customers pay (it used to be three
 * sidebar entries). Each tab is its own address, so a bookmark or a link to
 * /payments or /invoices still lands on the right tab.
 */
export function PaymentPage({ tab, slug, demo }: { tab: PaymentTab; slug: string; demo: boolean }) {
  return (
    <>
      <PageHeader
        title="Payment"
        subtitle="The plans customers are on, the money they paid, and the bills you sent."
      />
      <nav className="subtabs compact" aria-label="Payment views">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`subtab${tab === t.id ? ' active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => navigateAdmin(slug, t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'payment' && <AdminBillingPage demo={demo} embedded />}
      {tab === 'payments' && <PaymentsPage demo={demo} embedded />}
      {tab === 'invoices' && <InvoicesPage embedded />}
    </>
  );
}
