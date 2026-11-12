import { useProPlusWorkspaceData } from '@/features/workspace/useProPlusWorkspaceData';
import { ProPlusWks1OrgChart } from '../proplus/ProPlusWks1OrgChart';

/**
 * /app/workspace for Pro-Plus-tier users.
 *
 * Renders the "Org Chart" design (`ProPlusWks1OrgChart`) wired to REAL
 * workspace data via `useProPlusWorkspaceData()`.
 *
 * We deliberately never render the "Complete onboarding" empty state from
 * here — AuthGuard already enforced `onboarding_status === 'active'`
 * before letting the user onto /app/workspace, so an empty CTA pointing
 * back to /onboarding would be confusing. Instead we either show a thin
 * skeleton (while the workspace fetch resolves) or the chart with the
 * live data — and if the adapter can't produce anything, the chart
 * falls back to ORG_CHART_SKELETON via its own `data ?? SKELETON`
 * shim. The user always sees the chart shape rather than an empty
 * "no workspace" wall.
 *
 * NOTE: this is the LIVE wrapper at `workspace/ProPlusWorkspace.tsx` —
 * distinct from the prop-less `proplus/ProPlusWorkspace.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusWorkspace() {
  const { data, isLoading } = useProPlusWorkspaceData();

  // Initial fetch in flight — thin skeleton matching the header strip +
  // chart canvas + inspector drawer board layout.
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface-2/60" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="h-[44rem] animate-pulse rounded-2xl bg-surface-2/60" />
          <div className="h-[44rem] animate-pulse rounded-2xl bg-surface-2/60" />
        </div>
      </div>
    );
  }

  // Data resolved (live or null). The chart accepts `data?: T` and
  // falls back to its built-in skeleton, so even a null adapter result
  // renders a sensible chart rather than a "no workspace" wall.
  return <ProPlusWks1OrgChart data={data ?? undefined} />;
}

export default ProPlusWorkspace;
