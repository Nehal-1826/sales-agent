import { PageLoader } from '@/components/loaders';
import { useAgencyWorkspaceData } from '@/features/workspace/useAgencyWorkspaceData';
import { AgWksW5Command } from '@/pages/client/agency/AgWksW5Command';

/**
 * /app/workspace for Agency-tier users — the locked-live "Command Center"
 * design (`AgWksW5Command`) wrapped with the live-data adapter.
 *
 * W5 is a calm, executive agency console (the nautical "Marina Harbor"
 * design that previously rendered here has been retired). It surfaces a
 * glass identity hero, a KPI row distilling the portfolio, a refined
 * sub-client card grid with a detail drawer, a team roster, and an
 * agency-capabilities strip (white-label / custom domain / dedicated
 * pool). API keys and webhooks are intentionally not shown (product
 * decision to remove them for all users).
 *
 * Interactive controls are wired to real mutations: "Add sub-client" →
 * useCreateSubClient, "Invite teammate" → useInviteMember, and a
 * sub-client "Remove" → useDeleteSubClient (behind a confirm dialog).
 *
 * Loading state: shared PageLoader (renders null by convention so the
 * layout shell stays clean until data lands).
 *
 * Empty-data state: the adapter returns a valid `AgencyWorkspaceData`
 * with the agency identity filled in but empty sub-clients / team for a
 * brand-new agency. The console renders graceful empty panels with the
 * relevant CTA — no fabricated data.
 */
export function AgencyWorkspace() {
  const { data, isLoading } = useAgencyWorkspaceData();

  if (isLoading || !data) {
    return <PageLoader />;
  }

  return <AgWksW5Command data={data} />;
}

export default AgencyWorkspace;
