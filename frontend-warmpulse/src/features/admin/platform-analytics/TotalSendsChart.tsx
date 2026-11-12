import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartTheme, paletteAt } from '@/components/charts/theme';
import type { VolumePoint } from '@/features/admin/types';

interface TotalSendsChartProps {
  data: VolumePoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

/**
 * Stacked bar chart of daily send volumes across series (e.g. provider or
 * mailbox segment). The series keys are discovered dynamically from the
 * first data row so the chart still renders when the backend shape evolves.
 */
export function TotalSendsChart({ data, isLoading, isError, delay = 0 }: TotalSendsChartProps) {
  const { rows, seriesKeys } = useMemo(() => {
    const rows = data ?? [];
    const keys = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (k === 'date') continue;
        if (typeof row[k] === 'number') keys.add(k);
      }
    }
    return { rows, seriesKeys: Array.from(keys) };
  }, [data]);

  const isEmpty = !isLoading && !isError && (rows.length === 0 || seriesKeys.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Total sends</h3>
            <p className="text-xs text-text-dim">Daily warmup volume across all workspaces.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load send volume"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No send activity yet"
              description="Once workspaces start warming up, daily volume will appear here."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
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
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
                  content={<ChartTooltip />}
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
                {seriesKeys.map((key, i) => {
                  const isLast = i === seriesKeys.length - 1;
                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={key}
                      stackId="sends"
                      fill={paletteAt(i)}
                      radius={isLast ? [3, 3, 0, 0] : 0}
                      maxBarSize={36}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
