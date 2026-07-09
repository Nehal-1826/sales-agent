import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
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
import type { AuditActionBucket } from './api';

interface AuditActionsChartProps {
  data: AuditActionBucket[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
  /** Max number of action-type bars to render (default 12). */
  limit?: number;
}

/**
 * Horizontal bar chart showing the most frequent audit action types across
 * the current filter window. Uses a horizontal layout so long action names
 * ("peer_inbox.create", "user.impersonate_start", …) stay readable.
 */
export function AuditActionsChart({
  data,
  isLoading,
  isError,
  delay = 0,
  limit = 12,
}: AuditActionsChartProps) {
  const rows = (data ?? []).slice(0, limit);
  const isEmpty = !isLoading && !isError && rows.length === 0;
  const barCount = Math.max(rows.length, 1);
  const chartHeight = Math.min(Math.max(barCount * 28 + 48, 180), 420);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Action types</h3>
            <p className="text-xs text-text-dim">
              Audit events grouped by action across the current filter window.
            </p>
          </div>
        </div>
        <div style={{ height: chartHeight }}>
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load audit activity"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No audit events"
              description="Events will appear here once admins or the system take actions."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="action"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                  width={180}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
                  content={<ChartTooltip />}
                />
                <Bar
                  dataKey="count"
                  name="Events"
                  fill={chartTheme.colors.secondary}
                  radius={[0, 3, 3, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
