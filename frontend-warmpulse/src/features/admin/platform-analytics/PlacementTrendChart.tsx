import { motion } from 'framer-motion';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartTheme } from '@/components/charts/theme';
import type { PlacementTrendPoint } from './api';

interface PlacementTrendChartProps {
  data: PlacementTrendPoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

const pctFmt = (v: unknown) => `${Math.round(Number(v))}%`;

/**
 * Three-line overlay of inbox / promotions / spam placement percentages
 * over time. Designed to be read as "are we trending toward more inbox
 * deliveries and less spam folder" at a glance.
 */
export function PlacementTrendChart({
  data,
  isLoading,
  isError,
  delay = 0,
}: PlacementTrendChartProps) {
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
            <h3 className="text-base font-semibold text-text">Where emails land</h3>
            <p className="text-xs text-text-dim">Inbox / promotions / spam share over time.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load where emails land"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No inbox-landing samples"
              description="Seed-inbox probes will populate this chart once active."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={pctFmt}
                  domain={[0, 100]}
                />
                <Tooltip
                  cursor={{ stroke: chartTheme.colors.primary, strokeOpacity: 0.25 }}
                  content={
                    <ChartTooltip valueFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  align="left"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    color: chartTheme.colors.muted,
                    fontSize: chartTheme.font.sizeSm,
                    paddingTop: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="inbox_pct"
                  name="Inbox"
                  stroke={chartTheme.colors.primary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="promotions_pct"
                  name="Promotions"
                  stroke={chartTheme.colors.warning}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="spam_pct"
                  name="Spam"
                  stroke={chartTheme.colors.danger}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
