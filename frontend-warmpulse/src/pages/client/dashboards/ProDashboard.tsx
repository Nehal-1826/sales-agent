import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProDashAnalyticsData } from '@/features/dashboard/useProDashAnalyticsData';
import { ProDashAnalytics } from './ProDashAnalytics';

/**
 * /app/dashboard for Pro-tier users.
 *
 * Renders the "Analytics cockpit" design (`ProDashAnalytics`) wired to REAL
 * workspace data via `useProDashAnalyticsData()`. The empty / loading UX is
 * preserved verbatim from the previous Pro dashboard: 0 mailboxes → the
 * "complete onboarding" EmptyState with the same page heading; while the
 * mailbox list is still loading → a lightweight skeleton.
 *
 * Spec: docs/superpowers/specs/2026-05-14-pro-dashboard-production-design.md
 */
export function ProDashboard() {
  const { data, isLoading } = useProDashAnalyticsData();

  // 0-mailbox empty state — same CTA / heading as before.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-dim">
            Live warmth, inbox vs spam and activity once mailboxes are connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
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
  // page heading height + a tall card placeholder.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-surface-2/60"
            />
          ))}
        </div>
        <div className="h-80 w-full animate-pulse rounded-xl bg-surface-2/60" />
      </div>
    );
  }

  return <ProDashAnalytics data={data} />;
}

export default ProDashboard;
