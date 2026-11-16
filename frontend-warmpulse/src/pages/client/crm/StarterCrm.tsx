/**
 * /app/crm for Starter users — the paywall / upsell.
 *
 * Starter's CRM campaign cap is 0, so there's no pipeline to host. Instead of a
 * broken/empty CRM we show a polished upsell with a clear path to /app/billing.
 *
 * DESIGN LOCKED — from the A-set design round on :35001 (/app/crm) the user
 * selected **A3 · Compare** (a plan + feature matrix). The candidate component
 * lives in ./designs/StCrmA3Compare and is rendered verbatim here so the
 * design preview and production stay 1:1. To switch designs, point this at a
 * different ./designs/StCrm* candidate.
 */
import { StCrmA3Compare } from './designs/StCrmA3Compare';

export function StarterCrm() {
  return <StCrmA3Compare />;
}

export default StarterCrm;
