import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMailboxes } from '@/features/mailboxes/api';
import { useDashboardSummary } from '@/features/dashboard/api';
import { usePlan } from '@/lib/usePlan';
import { AgencyDashboard } from './dashboards/AgencyDashboard';
import { ProDashboard } from './dashboards/ProDashboard';
import { ProPlusDashboard } from './dashboards/ProPlusDashboard';
import { StarterDashboard } from './dashboards/StarterDashboard';
import {
  AlertsStack,
  LiveActivityFeed,
  MailboxSparklineRow,
  PlacementDonut,
  TodayStats,
  Warmth30dArea,
  WarmthScoreHero,
} from './dashboard';

/**
 * /app/dashboard — thin router that dispatches to a plan-specific
 * dashboard component.
 *
 *   Starter → <StarterDashboard />  S1 Focus Card layout
 *   Pro     → ProDashboard (TODO — falls back to legacy for now)
 *   Agency  → AgencyDashboard (TODO — falls back to legacy for now)
 *
 * Legacy multi-widget dashboard is preserved as the fallback so non-
 * Starter users keep the existing experience until their tier's design
 * is built.
 */
export function DashboardPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) {
    return <StarterDashboard />;
  }

  if (isAgency) {
    return <AgencyDashboard />;
  }

  // Pro Plus (and above, but Agency is already handled) → Console design.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro dash.
  if (isProPlus) {
    return <ProPlusDashboard />;
  }

  if (isPro) {
    return <ProDashboard />;
  }

  // Fallback: existing multi-widget layout for Agency / Unknown.
  return <LegacyDashboard />;
}

// ---------------------------------------------------------------------------
// Legacy layout — preserved verbatim for Pro / Agency until their own
// designs are built. Same widgets, same rows.
// ---------------------------------------------------------------------------
function LegacyDashboard() {
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();

  const mailboxes = mailboxesQuery.data?.items ?? [];
  const summary = summaryQuery.data;

  const meanWarmth =
    summary?.warmth_score ??
    (mailboxes.length === 0
      ? 0
      : Math.round(
          mailboxes.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) / mailboxes.length,
        ));
  const warmthDelta = summary?.warmth_delta ?? 0;
  const trend = summary?.trend_30d ?? [];
  const placement = summary?.placement ?? { inbox_pct: 0, promotions_pct: 0, spam_pct: 0 };

  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
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

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-text-dim">
          Real-time warmth, inbox vs spam, activity and alerts across your workspace.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <WarmthScoreHero
          score={meanWarmth}
          delta={warmthDelta}
          isLoading={mailboxesQuery.isLoading || summaryQuery.isLoading}
          mailboxCount={mailboxes.length}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="lg:col-span-8"
        >
          <Warmth30dArea points={trend} isLoading={summaryQuery.isLoading} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
          className="lg:col-span-4"
        >
          <PlacementDonut placement={placement} isLoading={summaryQuery.isLoading} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.14 }}
      >
        <MailboxSparklineRow mailboxes={mailboxes} isLoading={mailboxesQuery.isLoading} />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
          className="lg:col-span-6"
        >
          <LiveActivityFeed />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
          className="lg:col-span-6"
        >
          <TodayStats />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
      >
        <AlertsStack mailboxes={mailboxes} />
      </motion.div>
    </div>
  );
}

export default DashboardPage;
