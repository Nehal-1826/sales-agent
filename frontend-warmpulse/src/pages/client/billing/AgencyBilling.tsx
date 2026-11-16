import { PageLoader } from '@/components/loaders';
import { useAgencyBillingData } from '@/features/billing/useAgencyBillingData';
import { AgBilC2Ledger } from '@/pages/client/agency/AgBilC2Ledger';

/**
 * /app/billing for Agency-tier users — the locked-live "Carousel Ledger"
 * design (`AgBilC2Ledger`) wrapped with the live-data adapter.
 *
 * The C2 design accepts an optional `data?: AgencyBillingData` prop and
 * falls back to its inline MOCK ("Northwind Agency") when no prop is
 * passed — useful for the design-preview harness. In this locked-live
 * wrapper we always pass the adapter's `data`, never the MOCK, so the
 * user sees their own agency billing.
 *
 * Loading state: shows the shared PageLoader (same one Pro Plus billing
 * uses). Once `data` arrives, the carousel renders.
 *
 * Empty-data state: the adapter returns a valid AgencyBillingData with
 * empty sub-client / invoice arrays for a brand-new agency; the design
 * itself handles the empty ledger gracefully.
 */
export function AgencyBilling() {
  const { data, isLoading } = useAgencyBillingData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgBilC2Ledger data={data} />;
}

export default AgencyBilling;
