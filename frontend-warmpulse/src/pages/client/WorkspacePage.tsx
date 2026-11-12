import { motion } from 'framer-motion';
import { AppTabs, AppTabsContent, AppTabsList, AppTabsTrigger } from '@/components/ui/AppTabs';
import { usePlan } from '@/lib/usePlan';
import { WorkspaceOverview } from '@/features/workspace/WorkspaceOverview';
import { TeamMembersTable } from '@/features/workspace/TeamMembersTable';
import { TeamActivityChart } from '@/features/workspace/TeamActivityChart';
import { SubClientsTable } from '@/features/workspace/SubClientsTable';
import { useWorkspace } from '@/features/workspace/api';
import { AgencyWorkspace } from './workspace/AgencyWorkspace';
import { ProPlusWorkspace } from './workspace/ProPlusWorkspace';
import { ProWorkspace } from './workspace/ProWorkspace';
import { StarterWorkspace } from './workspace/StarterWorkspace';
import { BrandingTab } from './workspace/BrandingTab';
import { CustomDomainTab } from './workspace/CustomDomainTab';

/**
 * /app/workspace — thin plan router.
 *
 *   Starter → <StarterWorkspace /> (W3 Workspace Profile — identity-led)
 *   Pro     → legacy multi-tab layout (TODO — own design pending)
 *   Agency  → legacy multi-tab layout with sub-client/API-key tabs
 */
export function WorkspacePage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterWorkspace />;
  if (isAgency) return <AgencyWorkspace />;
  // Pro Plus (but not Agency, already handled above) → Org Chart workspace.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusWorkspace />;
  if (isPro) return <ProWorkspace />;
  return <LegacyWorkspace />;
}

// ---------------------------------------------------------------------------
// Legacy multi-tab layout — kept verbatim for Pro/Agency until their tier-
// specific designs ship. Agency users get the Sub-Clients tab.
// ---------------------------------------------------------------------------
function LegacyWorkspace() {
  const { data: workspace } = useWorkspace();
  const isAgency = workspace?.plan === 'agency';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="text-sm text-text-dim">
          Team members and sub-clients (Agency).
        </p>
      </div>

      <AppTabs defaultValue="overview" className="space-y-6">
        <AppTabsList>
          <AppTabsTrigger value="overview">Overview</AppTabsTrigger>
          <AppTabsTrigger value="team">Team</AppTabsTrigger>
          {isAgency ? (
            <>
              <AppTabsTrigger value="sub-clients">Sub-Clients</AppTabsTrigger>
              <AppTabsTrigger value="branding">Branding</AppTabsTrigger>
              <AppTabsTrigger value="custom-domain">Custom domain</AppTabsTrigger>
            </>
          ) : null}
        </AppTabsList>

        <AppTabsContent value="overview" className="space-y-6">
          <WorkspaceOverview />
          <TeamActivityChart />
        </AppTabsContent>

        <AppTabsContent value="team" className="space-y-6">
          <TeamMembersTable />
          <TeamActivityChart />
        </AppTabsContent>

        {isAgency ? (
          <>
            <AppTabsContent value="sub-clients" className="space-y-6">
              <SubClientsTable />
            </AppTabsContent>

            <AppTabsContent value="branding" className="space-y-6">
              <BrandingTab />
            </AppTabsContent>

            <AppTabsContent value="custom-domain" className="space-y-6">
              <CustomDomainTab />
            </AppTabsContent>
          </>
        ) : null}
      </AppTabs>
    </motion.div>
  );
}

export default WorkspacePage;
