import { PageLoader } from '@/components/loaders';
import { useAgencyActivityData } from '@/features/activity/useAgencyActivityData';
import { AgActS4Wrapped } from '@/pages/client/agency/AgActS4Wrapped';

/**
 * /app/activity for Agency-tier users — the locked-live "Wrapped Story"
 * design (`AgActS4Wrapped`) wrapped with the live-data adapter.
 *
 * S4 is a Spotify-Wrapped-meets-warmup story carousel — 8 full-bleed,
 * status-tinted story cards (heartbeat, top performer, provider playlist,
 * peer pulse, inbox heroes, spam rescue squad, alerts radar, what's next)
 * that auto-advance every 6s with a player-style tracklist inspector on
 * the right.
 *
 * The S4 design accepts an optional `data?: AgencyActivityData` prop and
 * falls back to its inline MOCK ("Northwind Agency") when no prop is
 * passed — useful for the design-preview harness. In this locked-live
 * wrapper we always pass the adapter's `data`, never the MOCK, so the
 * user sees their own agency activity.
 *
 * Loading state: shared PageLoader (same one the other locked Agency
 * surfaces use; renders null by convention so the layout shell stays
 * clean until data lands).
 *
 * Empty-data state: the adapter returns a valid `AgencyActivityData` with
 * empty events/hourlyVolume/heatmap/etc. for a brand-new agency; each
 * story body handles the empty case gracefully (zero count-ups, empty
 * bars, "no activity yet" hints).
 */
export function AgencyActivity() {
  const { data, isLoading } = useAgencyActivityData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgActS4Wrapped data={data} />;
}

export default AgencyActivity;
