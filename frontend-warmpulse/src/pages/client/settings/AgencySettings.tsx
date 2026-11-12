import { PageLoader } from '@/components/loaders';
import { useAgencySettingsData } from '@/features/settings/useAgencySettingsData';
import { AgSetC2Mosaic } from '@/pages/client/agency/AgSetC2Mosaic';
import { RegionFormatPanel } from '@/features/settings/RegionFormatPanel';

/**
 * /app/settings for Agency-tier users — the locked-live "Mosaic Mural"
 * design (`AgSetC2Mosaic`) wrapped with the live-data adapter.
 *
 * The C2 design accepts an optional `data?: AgencySettingsData` prop and
 * falls back to its inline MOCK when no prop is passed (useful for the
 * design-preview harness). In this locked-live wrapper we always pass the
 * adapter's `data`, never the MOCK.
 *
 * The Region & Format panel is appended below the main design — shared
 * across all tier settings wrappers.
 */
export function AgencySettings() {
  const { data, isLoading } = useAgencySettingsData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AgSetC2Mosaic data={data} />
      <RegionFormatPanel />
    </div>
  );
}

export default AgencySettings;
