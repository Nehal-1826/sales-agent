import { usePlan } from '@/lib/usePlan';
import { ProPlusCrm } from './crm/ProPlusCrm';
import { AgencyCrm } from './crm/AgencyCrm';

/**
 * /app/crm — thin router.
 *
 * Product decision (2026-06-14): CRM is included for every user at Pro Plus
 * level. So all plans get the full Pro Plus CRM; only Agency gets its
 * unlimited command-center variant.
 *
 *   Agency           → <AgencyCrm />    command-center full Leads (unlimited)
 *   everyone else     → <ProPlusCrm />   full Leads (10 campaigns / 25k leads)
 *
 * Mirrors `DashboardPage`: while the plan is still resolving we render nothing
 * (content paints in-place once /auth/me settles).
 */
export function CrmPage() {
  const { isAgency, isLoading } = usePlan();

  if (isLoading) {
    return <div aria-hidden style={{ minHeight: '60vh' }} />;
  }

  if (isAgency) {
    return <AgencyCrm />;
  }

  // Every non-Agency tier (Starter / Pro / Pro Plus / unknown) gets the full
  // Pro Plus CRM — CRM is now included for all.
  return <ProPlusCrm />;
}

export default CrmPage;
