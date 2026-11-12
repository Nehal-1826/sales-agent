import { PageLoader } from '@/components/loaders';
import { useAgencyAnalyticsData } from '@/features/analytics/useAgencyAnalyticsData';
import { AgAnaR3Funnel } from '@/pages/client/agency/AgAnaR3Funnel';

/**
 * /app/analytics for Agency-tier users — the locked-live "Funnel Theatre"
 * design (`AgAnaR3Funnel`) wrapped with the live-data adapter.
 *
 * R3 is funnel theatre — the agency's placement → engagement → reputation
 * flow as a tall vertical conversion funnel (Sends → Delivered → Inboxed
 * → Opened → Replied), status-tinted by per-stage drop-off severity, with
 * a worst-stage drop-off chip pinned in the hero summary so the leakiest
 * stage is impossible to miss. Provider funnels, a 30-day conversion-rate
 * sparkline, a drop-off diagnostics inspector, a weekly insights strip,
 * and a sub-client comparisons table fill in below.
 *
 * The R3 design accepts an optional `data?: AgencyAnalyticsData` prop and
 * falls back to its inline MOCK ("Northwind Outreach") when no prop is
 * passed — useful for the design-preview harness. In this locked-live
 * wrapper we always pass the adapter's `data`, never the MOCK, so the
 * user sees their own agency analytics.
 *
 * Loading state: shared PageLoader (same one the other locked Agency
 * surfaces use; renders null by convention so the layout shell stays
 * clean until data lands).
 *
 * Empty-data state: the adapter returns a valid `AgencyAnalyticsData`
 * with zero-filled KPIs / empty days30 / empty funnel for a brand-new
 * agency; the funnel renders a degenerate (but honest) flat shape, the
 * sparkline shows no points, and the weekly-insights strip shows its
 * empty state.
 */
export function AgencyAnalytics() {
  const { data, isLoading } = useAgencyAnalyticsData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgAnaR3Funnel data={data} />;
}

export default AgencyAnalytics;
