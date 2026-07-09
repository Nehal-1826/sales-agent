import { PageLoader } from '@/components/loaders';
import { useAgencyMailboxesData } from '@/features/mailboxes/useAgencyMailboxesData';
import { AgMbxP1Glass } from '@/pages/client/agency/AgMbxP1Glass';

/**
 * /app/mailboxes for Agency-tier users — the locked-live "Frosted Glass
 * Cards" design (`AgMbxP1Glass`) wrapped with the live-data adapter.
 *
 * P1 is an Apple/Vercel glass-morphism aesthetic — 24 floating frosted
 * cards in a 4-column grid with mouse-tracking 3D parallax tilt, ambient
 * blurred orbs in the background, status-tinted edge glow.
 *
 * Loading state: shared PageLoader. Empty agency (no mailboxes connected
 * yet): the design handles an empty mailbox array gracefully.
 */
export function AgencyMailboxes() {
  const { data, isLoading } = useAgencyMailboxesData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgMbxP1Glass data={data} />;
}

export default AgencyMailboxes;
