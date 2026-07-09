import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartTheme, warmthColor } from '@/components/charts/theme';
import type { WarmthBin } from '@/features/admin/types';

interface AvgWarmthDistributionProps {
  data: WarmthBin[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

/**
 * Histogram of average-warmth-per-mailbox across the platform.
 * Each bucket is colored by its warmth band (danger / warning / primary)
 * using the shared `warmthColor` helper so the visual is consistent with
 * the per-mailbox warmth bar elsewhere in the app.
 */
export function AvgWarmthDistribution({
  data,
  isLoading,
  isError,
  delay = 0,
}: AvgWarmthDistributionProps) {
  const rows = data ?? [];
  const isEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Warmth distribution</h3>
            <p className="text-xs text-text-dim">Mailboxes bucketed by average warmth score.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load distribution"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No warmth data"
              description="Once mailboxes report warmth scores, the histogram will populate."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                barCategoryGap={1}
              >
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  vertical={false}
                />
                <XAxis
                  dataKey="bin"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.08 }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="count" name="Mailboxes" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {rows.map((bin, i) => {
                    const mid =
                      bin.x0 !== undefined && bin.x1 !== undefined ? (bin.x0 + bin.x1) / 2 : 60;
                    return <Cell key={`${bin.bin}-${i}`} fill={warmthColor(mid)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
