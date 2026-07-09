import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusBenchmarkData } from '@/features/analytics/useProPlusBenchmarkData';
import { ProPlusAna3Benchmark } from '../proplus/ProPlusAna3Benchmark';

/**
 * /app/analytics for Pro-Plus-tier users.
 *
 * Renders the "Benchmark / comparison" design (`ProPlusAna3Benchmark`)
 * wired to REAL workspace data via `useProPlusBenchmarkData()`. The empty /
 * loading UX mirrors the sibling Pro-Plus activity wrapper
 * (`activity/ProPlusActivity`): 0 mailboxes → the "complete onboarding"
 * EmptyState with the same "Analytics" page heading; while the mailbox list
 * is still loading → a lightweight skeleton.
 *
 * NOTE: this is the LIVE wrapper at `analytics/ProPlusAnalytics.tsx` —
 * distinct from the prop-less `proplus/ProPlusAnalytics.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusAnalytics() {
  const { data, isLoading } = useProPlusBenchmarkData();

  // 0-mailbox empty state — same CTA / heading as the legacy analytics page.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-text-dim">
            Side-by-side inbox delivery benchmarks, once mailboxes are
            connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<GitCompareArrows className="h-5 w-5" />}
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
  // page heading height + the summary band + the paired-rows board.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2/60" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2/60" />
        </div>
        <div className="h-[28rem] animate-pulse rounded-2xl bg-surface-2/60" />
      </div>
    );
  }

  return <ProPlusAna3Benchmark data={data ?? undefined} />;
}

export default ProPlusAnalytics;
