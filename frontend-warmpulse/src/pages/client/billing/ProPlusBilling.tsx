import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusReceiptData } from '@/features/billing/useProPlusReceiptData';
import { ProPlusBil1Receipt } from '../proplus/ProPlusBil1Receipt';

/**
 * /app/billing for Pro-Plus-tier users.
 *
 * Renders the "Receipt & ledger" design (`ProPlusBil1Receipt`) wired to REAL
 * billing data via `useProPlusReceiptData()`. The empty / loading UX mirrors
 * the sibling Pro-Plus workspace wrapper (`workspace/ProPlusWorkspace`):
 * no workspace + no payment history → the "complete onboarding" EmptyState
 * with the same "Billing" page heading; while the primary payment-history
 * query resolves → a lightweight skeleton matching the two-receipt + side-
 * rail layout.
 *
 * NOTE: this is the LIVE wrapper at `billing/ProPlusBilling.tsx` — distinct
 * from the prop-less `proplus/ProPlusBilling.tsx` used by the isolated :35001
 * design preview harness.
 */
export function ProPlusBilling() {
  const { data, isLoading } = useProPlusReceiptData();

  // Empty workspace / no history yet — same heading + a billing-shaped CTA.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-text-dim">
            Your subscription receipts and payment ledger — once a workspace is
            set up.
          </p>
        </motion.div>
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title="No billing activity yet"
          description="Finish onboarding to set up your workspace and start a billing cycle."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Still resolving the payment history — lightweight skeleton matching the
  // page header strip + the two-receipt + side-rail layout.
  if (isLoading || data === null) {
    return (
      <div className="space-y-6">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface-2/60" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <div className="h-[34rem] animate-pulse rounded-2xl bg-surface-2/60" />
            <div className="h-[24rem] animate-pulse rounded-2xl bg-surface-2/60" />
          </div>
          <div className="space-y-4 lg:col-span-4">
            <div className="h-[30rem] animate-pulse rounded-2xl bg-surface-2/60" />
            <div className="h-[12rem] animate-pulse rounded-2xl bg-surface-2/60" />
          </div>
        </div>
      </div>
    );
  }

  return <ProPlusBil1Receipt data={data ?? undefined} />;
}

export default ProPlusBilling;
