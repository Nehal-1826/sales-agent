import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlan } from '@/lib/usePlan';
import {
  ActivityFilters,
  ActivityStackedBarCard,
  TimelineCard,
} from './activity';
import { AgencyActivity } from './activity/AgencyActivity';
import { ProActivity } from './activity/ProActivity';
import { ProPlusActivity } from './activity/ProPlusActivity';
import { StarterActivity } from './activity/StarterActivity';
import {
  buildHourlyBuckets,
  useActivityFeedInfinite,
} from '@/features/activity/api';
import type { ActivityFilterState, ActivityItem } from '@/features/activity/types';

const MOTION = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.35 },
};

/**
 * /app/activity — thin plan router.
 *
 *   Starter → <StarterActivity /> (A3 Chart + Drilldown)
 *   Pro     → legacy multi-card layout (TODO — own design pending)
 *   Agency  → legacy multi-card layout (TODO — own design pending)
 *
 * Keep the legacy layout below so Pro / Agency keep working until their
 * tier-specific designs ship.
 */
export function WarmupActivityPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterActivity />;
  if (isAgency) return <AgencyActivity />;
  // Pro Plus (but not Agency, already handled above) → Activity Clock.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusActivity />;
  if (isPro) return <ProActivity />;
  return <LegacyActivity />;
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — unchanged from pre-Starter-redesign. Used for
// Pro / Agency tiers until their tier-specific designs ship.
// ---------------------------------------------------------------------------
function LegacyActivity() {
  const [filters, setFilters] = useState<ActivityFilterState>({});

  // The stacked-bar card re-uses the same infinite feed so that filter changes
  // also update the chart. We only need the first page of the (filtered) feed
  // for the 24h aggregate.
  const feed = useActivityFeedInfinite(filters);

  const stackedData = useMemo(() => {
    const flat: ActivityItem[] = (feed.data?.pages ?? []).flatMap((p) => p.items);
    return buildHourlyBuckets(flat);
  }, [feed.data]);

  return (
    <div className="space-y-6">
      <motion.div {...MOTION} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Warmup Activity</h1>
        <p className="text-sm text-text-dim">
          Live feed of sends, opens, replies, and spam recoveries across all your mailboxes.
        </p>
      </motion.div>

      <motion.div {...MOTION}>
        <ActivityFilters value={filters} onChange={setFilters} />
      </motion.div>

      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <ActivityStackedBarCard
            data={stackedData}
            isLoading={feed.isLoading}
            isError={feed.isError}
          />
        </div>
      </motion.div>

      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <TimelineCard filters={filters} />
        </div>
      </motion.div>
    </div>
  );
}

export default WarmupActivityPage;
