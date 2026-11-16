import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Workflow } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusSignalMapData } from '@/features/reputation/useProPlusSignalMapData';
import { ProPlusRep3SignalMap } from '../proplus/ProPlusRep3SignalMap';

/**
 * /app/reputation for Pro-Plus-tier users.
 *
 * Renders the "Signal Map" design (`ProPlusRep3SignalMap`) wired to REAL
 * workspace data via `useProPlusSignalMapData()`. The empty / loading UX
 * mirrors the sibling Pro-Plus analytics wrapper
 * (`analytics/ProPlusAnalytics`): 0 mailboxes → the "complete onboarding"
 * EmptyState with the same "Reputation & Health" page heading; while the
 * mailbox list is still loading → a lightweight skeleton.
 *
 * NOTE: this is the LIVE wrapper at `reputation/ProPlusReputation.tsx` —
 * distinct from the prop-less `proplus/ProPlusReputation.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusReputation() {
  const { data, isLoading } = useProPlusSignalMapData();

  // 0-mailbox empty state — same CTA / heading as the legacy reputation page.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            Sender trust &amp; Health
          </h1>
          <p className="text-sm text-text-dim">
            A spatial graph of every sender trust signal, once mailboxes are
            connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<Workflow className="h-5 w-5" />}
          title="No mailboxes connected"
          description="Finish onboarding to connect your first mailbox and start warming up."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Still resolving the mailbox list — lightweight skeleton matching the
  // page heading height + the summary strip + the map / inspector board.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-surface-2/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="h-16 animate-pulse rounded-xl bg-surface-2/60" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-2/60" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-2/60" />
          <div className="h-16 animate-pulse rounded-xl bg-surface-2/60" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="h-[34rem] animate-pulse rounded-2xl bg-surface-2/60 xl:col-span-8" />
          <div className="h-[34rem] animate-pulse rounded-2xl bg-surface-2/60 xl:col-span-4" />
        </div>
      </div>
    );
  }

  return <ProPlusRep3SignalMap data={data ?? undefined} />;
}

export default ProPlusReputation;
