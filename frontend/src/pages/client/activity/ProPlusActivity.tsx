import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusActivityData } from '@/features/activity/useProPlusActivityData';
import { ProPlusAct2Clock } from '../proplus/ProPlusAct2Clock';

/**
 * /app/activity for Pro-Plus-tier users.
 *
 * Renders the "Warmup Activity Clock" design (`ProPlusAct2Clock`) wired to
 * REAL workspace data via `useProPlusActivityData()`. The empty / loading
 * UX mirrors the sibling Pro-Plus mailbox wrapper
 * (`mailboxes/ProPlusMailboxes`): 0 mailboxes → the "complete onboarding"
 * EmptyState with the same "Warmup Activity" page heading; while the
 * mailbox list is still loading → a lightweight skeleton.
 *
 * NOTE: this is the LIVE wrapper at `activity/ProPlusActivity.tsx` —
 * distinct from the prop-less `proplus/ProPlusActivity.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusActivity() {
  const { data, isLoading } = useProPlusActivityData();

  // 0-mailbox empty state — same CTA / heading as the legacy activity page.
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
            Warmup Activity
          </h1>
          <p className="text-sm text-text-dim">
            A 24-hour radial view of the helper network, once mailboxes are
            connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
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
  // page heading height + the weekday selector + the main dial board.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="h-20 w-full animate-pulse rounded-2xl bg-surface-2/60" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="h-[28rem] animate-pulse rounded-2xl bg-surface-2/60" />
          <div className="h-[28rem] animate-pulse rounded-2xl bg-surface-2/60" />
        </div>
      </div>
    );
  }

  return <ProPlusAct2Clock data={data ?? undefined} />;
}

export default ProPlusActivity;
