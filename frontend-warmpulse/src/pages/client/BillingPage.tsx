import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import {
  CurrentPlanCard,
  UsageCard,
  PaymentHistoryTable,
  MonthlySpendChart,
  FeatureBreakdownStackedBar,
  InvoiceList,
  UpgradeDialog,
} from './billing';
import { AgencyBilling } from './billing/AgencyBilling';
import { ProBilling } from './billing/ProBilling';
import { ProPlusBilling } from './billing/ProPlusBilling';
import { StarterBilling } from './billing/StarterBilling';
import { BillingExtras } from '@/features/billing/BillingExtras';

/**
 * /app/billing — thin plan router.
 *
 *   Starter  → <StarterBilling /> (B2 Subscription Card — Spotify-style hero)
 *   Agency   → <AgencyBilling />
 *   Pro Plus → <ProPlusBilling /> (B1 Receipt & ledger)
 *   Pro      → <ProBilling />
 */
export function BillingPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  // Per-plan design. Pro Plus check sits ABOVE isPro (isPro is true for
  // Pro-and-above, so Pro Plus would otherwise be caught and get Pro's design).
  let variant;
  if (isStarter) variant = <StarterBilling />;
  else if (isAgency) variant = <AgencyBilling />;
  else if (isProPlus) variant = <ProPlusBilling />;
  else if (isPro) variant = <ProBilling />;
  else variant = <LegacyBilling />;

  // Shared auto-renew + add-ons controls, shown beneath every plan design.
  return (
    <div className="space-y-6">
      {variant}
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
        <BillingExtras />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — kept verbatim for Pro/Agency until their tier-
// specific designs ship.
// ---------------------------------------------------------------------------
function LegacyBilling() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-text-dim">
          Plan, usage, dummy payment history, and invoices.
        </p>
      </header>

      <div
        role="status"
        className="flex items-start gap-2 rounded-lg border border-accent2/30 bg-accent2/10 p-3 text-sm text-accent2"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Dummy payments active — your card was never charged.</span>
      </div>

      {/* Row 1: plan (8) + usage (4) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CurrentPlanCard />
        </div>
        <div className="lg:col-span-4">
          <UsageCard />
        </div>
      </div>

      {/* Row 2: payment history full width */}
      <PaymentHistoryTable />

      {/* Row 3: monthly spend (8) + breakdown (4) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <MonthlySpendChart />
        </div>
        <div className="lg:col-span-4">
          <FeatureBreakdownStackedBar />
        </div>
      </div>

      {/* Row 4: invoice list */}
      <InvoiceList />

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </motion.div>
  );
}

export default BillingPage;
