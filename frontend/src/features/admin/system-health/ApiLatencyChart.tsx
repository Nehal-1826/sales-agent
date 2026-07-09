import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
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
import type { LatencyBundle } from './api';

interface ApiLatencyChartProps {
  data: LatencyBundle | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtTime(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtMs(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0ms';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

export function ApiLatencyChart({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: ApiLatencyChartProps) {
  const rows = data?.series ?? [];
  const isEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">API latency</h3>
            <p className="text-xs text-text-dim">
              p50 / p95 / p99 over time. Alert thresholds at 200ms and 1s.
            </p>
          </div>
          {data ? (
            <div className="grid grid-cols-3 gap-3 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-dim">p50</p>
                <p className="text-sm font-semibold tabular-nums text-text">
                  {fmtMs(data.api_p50)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-dim">p95</p>
                <p className="text-sm font-semibold tabular-nums text-text">
                  {fmtMs(data.api_p95)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-dim">p99</p>
                <p className="text-sm font-semibold tabular-nums text-text">
                  {fmtMs(data.api_p99)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load latency"
              description="Refresh to retry."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No latency samples"
              description="Latency samples will appear once the API sees traffic."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={rows}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="wp-latency-p50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.colors.primary} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={chartTheme.colors.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="wp-latency-p95" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.colors.secondary} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={chartTheme.colors.secondary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="wp-latency-p99" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.colors.danger} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={chartTheme.colors.danger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  vertical={false}
                />
                <XAxis
                  dataKey="t"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                  tickFormatter={fmtTime}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtMs}
                  width={56}
                />
                <Tooltip
                  cursor={{ stroke: chartTheme.colors.primary, strokeOpacity: 0.25 }}
                  content={
                    <ChartTooltip
                      labelFormatter={fmtTime}
                      valueFormatter={(v) => fmtMs(v)}
                    />
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
                <ReferenceLine
                  y={200}
                  stroke={chartTheme.colors.warning}
                  strokeDasharray="4 4"
                  label={{
                    value: '200ms warn',
                    position: 'insideTopRight',
                    fill: chartTheme.colors.warning,
                    fontSize: 10,
                  }}
                />
                <ReferenceLine
                  y={1000}
                  stroke={chartTheme.colors.danger}
                  strokeDasharray="4 4"
                  label={{
                    value: '1s alert',
                    position: 'insideTopRight',
                    fill: chartTheme.colors.danger,
                    fontSize: 10,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="p50"
                  name="p50"
                  stroke={chartTheme.colors.primary}
                  strokeWidth={2}
                  fill="url(#wp-latency-p50)"
                />
                <Area
                  type="monotone"
                  dataKey="p95"
                  name="p95"
                  stroke={chartTheme.colors.secondary}
                  strokeWidth={2}
                  fill="url(#wp-latency-p95)"
                />
                <Area
                  type="monotone"
                  dataKey="p99"
                  name="p99"
                  stroke={chartTheme.colors.danger}
                  strokeWidth={2}
                  fill="url(#wp-latency-p99)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
