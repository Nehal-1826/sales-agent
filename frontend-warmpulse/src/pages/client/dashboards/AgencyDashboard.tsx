import { PageLoader } from '@/components/loaders';
import { useAgencyDashboardData } from '@/features/dashboard/useAgencyDashboardData';
import { AgDshD3Tiered } from '@/pages/client/agency/AgDshD3Tiered';

/**
 * /app/dashboard for Agency-tier users — the locked-live "Tiered Status
 * Constellation" design (`AgDshD3Tiered`) wrapped with the live-data
 * adapter.
 *
 * D3 stratifies sub-clients by status onto three concentric rings (healthy
 * inner / warming middle / at-risk outer) — clear health distribution
 * at-a-glance. The design accepts an optional `data?: AgencyDashData` prop
 * and falls back to its inline MOCK when no prop is passed (preview only);
 * the locked wrapper always passes the adapter's `data`.
 *
 * Loading state: shared PageLoader (same one Pro Plus surfaces use).
 *
 * Empty-data state: the adapter returns a valid AgencyDashData with empty
 * `subClients`/`alerts` arrays for a brand-new agency; the design handles
 * the empty rings gracefully.
 */
export function AgencyDashboard() {
  const { data, isLoading } = useAgencyDashboardData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgDshD3Tiered data={data} />;
}

export default AgencyDashboard;
