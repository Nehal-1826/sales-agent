import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import type { SpamRatePoint } from './api';

interface SpamRateChartProps {
  data: SpamRatePoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

const pctFmt = (v: unknown) => `${Math.round(Number(v))}%`;

/**
 * Filled-area chart of daily platform-wide spam rate.
 * Colored with the danger palette color since "lower is better" here.
 */
export function SpamRateChart({ data, isLoading, isError, delay = 0 }: SpamRateChartProps) {
  const rows = data ?? [];
  const isEmpty = !isLoading && !isError && rows.length === 0;
  const color = chartTheme.colors.danger;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Spam rate</h3>
            <p className="text-xs text-text-dim">Daily share of warmup mail landing in Spam.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load spam rate"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No spam-rate samples"
              description="Once seed-inbox probes run, the trend will appear here."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="wp-spam-rate-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                />
                <Tooltip
                  cursor={{ stroke: color, strokeOpacity: 0.25 }}
                  content={
                    <ChartTooltip valueFormatter={(v) => `${Number(v).toFixed(2)}%`} />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="spam_rate"
                  name="Spam rate"
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#wp-spam-rate-fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
