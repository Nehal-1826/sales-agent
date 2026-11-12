import { PageLoader } from '@/components/loaders';
import { useAgencyReputationData } from '@/features/reputation/useAgencyReputationData';
import { AgRepC4Forecast } from '@/pages/client/agency/AgRepC4Forecast';

/**
 * /app/reputation for Agency-tier users — the locked-live "Weather
 * Forecast" design (`AgRepC4Forecast`) wrapped with the live-data
 * adapter.
 *
 * C4 is forward-looking forecast theatre — historical 7-day reputation
 * trend on the left, projected drift on the right with severe-weather
 * risk pins. An agency barometer (animated half-dial gauge with a
 * spring-loaded needle) anchors the hero, six weather-coded KPI tiles
 * summarise sends / bounce humidity / spam wind / sunny vs. partly vs.
 * stormy domain counts, then a 7-day forecast strip projects each
 * domain's reputation drift forward. The portfolio grid renders each
 * sub-client domain as an animated weather card (Sunny / Partly cloudy /
 * Stormy) with rainfall, lightning flashes, DNS pills, and an incident
 * chip; the right rail surfaces severe-weather alerts (Tornado /
 * Storm Watch / Fog Advisory / Flood Alert) mapped from the alert kinds.
 *
 * The C4 design accepts an optional `data?: AgencyReputationData` prop
 * and falls back to its inline MOCK ("Northwind Agency") when no prop is
 * passed — useful for the design-preview harness. In this locked-live
 * wrapper we always pass the adapter's `data`, never the MOCK, so the
 * user sees their own agency reputation.
 *
 * Loading state: shared PageLoader (same one the other locked Agency
 * surfaces use; renders null by convention so the layout shell stays
 * clean until data lands).
 *
 * Empty-data state: the adapter returns a valid `AgencyReputationData`
 * with zero-filled summary / empty domains / empty providers / empty
 * alerts for a brand-new agency; the barometer reads 0, the forecast
 * strip flat-lines, and the portfolio grid + alerts rail show their
 * own empty states ("Add a sub-client domain…" / "No advisories.
 * Skies clear.").
 */
export function AgencyReputation() {
  const { data, isLoading } = useAgencyReputationData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgRepC4Forecast data={data} />;
}

export default AgencyReputation;
