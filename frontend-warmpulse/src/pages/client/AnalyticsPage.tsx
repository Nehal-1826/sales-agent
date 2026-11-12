import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { usePlan } from '@/lib/usePlan';
import {
  BounceSpamScatterCard,
  DateRangePicker,
  EngagementGroupedBarCard,
  HealthRadarCard,
  MailboxFilter,
  PlacementStackedAreaCard,
  ProviderDonutCard,
  VolumeComboCard,
  WarmthHeatmapCard,
  WarmthTrendCard,
  rangeForPreset,
  type DateRangeValue,
} from './analytics';
import { AgencyAnalytics } from './analytics/AgencyAnalytics';
import { ProAnalytics } from './analytics/ProAnalytics';
import { ProPlusAnalytics } from './analytics/ProPlusAnalytics';
import { StarterAnalytics } from './analytics/StarterAnalytics';
import type { AnalyticsCommonParams } from '@/features/analytics/types';

const MOTION = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.35 },
};

/**
 * /app/analytics — thin plan router.
 *
 *   Starter → <StarterAnalytics /> (N3 2×2 Tile Grid)
 *   Pro     → legacy multi-card layout (TODO — own design pending)
 *   Agency  → legacy multi-card layout (TODO — own design pending)
 */
export function AnalyticsPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterAnalytics />;
  if (isAgency) return <AgencyAnalytics />;
  // Pro Plus (but not Agency, already handled above) → Benchmark / compare.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusAnalytics />;
  if (isPro) return <ProAnalytics />;
  return <LegacyAnalytics />;
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — unchanged from pre-Starter-redesign. Used for
// Pro / Agency tiers until their tier-specific designs ship.
// ---------------------------------------------------------------------------
function LegacyAnalytics() {
  const [mailboxId, setMailboxId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => rangeForPreset('30d'));

  const params = useMemo<AnalyticsCommonParams>(
    () => ({
      mailbox_id: mailboxId,
      from: dateRange.from,
      to: dateRange.to,
      granularity: 'day',
    }),
    [mailboxId, dateRange.from, dateRange.to],
  );

  return (
    <div className="space-y-6">
      <motion.div {...MOTION} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-text-dim">
            Daily metrics, warmth, where emails land, failed deliveries, and opens &amp; replies across the workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MailboxFilter value={mailboxId} onChange={setMailboxId} />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </motion.div>

      {/* Row 1: warmth trend (full width) */}
      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <WarmthTrendCard params={params} />
        </div>
      </motion.div>

      {/* Row 2: placement stacked area (8) + provider donut (4) */}
      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <PlacementStackedAreaCard params={params} />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <ProviderDonutCard />
        </div>
      </motion.div>

      {/* Row 3: engagement grouped bars (6) + health radar (6) */}
      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-6">
          <EngagementGroupedBarCard params={params} />
        </div>
        <div className="col-span-12 xl:col-span-6">
          <HealthRadarCard params={params} />
        </div>
      </motion.div>

      {/* Row 4: bounce/spam scatter (6) + volume combo (6) */}
      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-6">
          <BounceSpamScatterCard params={params} />
        </div>
        <div className="col-span-12 xl:col-span-6">
          <VolumeComboCard params={params} />
        </div>
      </motion.div>

      {/* Row 5: warmth heatmap (full width) */}
      <motion.div {...MOTION} className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <WarmthHeatmapCard mailbox_id={mailboxId} />
        </div>
      </motion.div>
    </div>
  );
}

export default AnalyticsPage;
