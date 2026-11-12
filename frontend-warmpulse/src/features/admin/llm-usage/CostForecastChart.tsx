import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
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
import type { CostForecastBundle } from './api';

interface CostForecastChartProps {
  data: CostForecastBundle | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtUsdAxis(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 10) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

function fmtUsd(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '$0';
  return `$${n.toFixed(2)}`;
}

export function CostForecastChart({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: CostForecastChartProps) {
  const points = data?.points ?? [];
  const capUsd = data?.cap_usd ?? 0;
  const isEmpty = !isLoading && !isError && points.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Cost forecast</h3>
            <p className="text-xs text-text-dim">
              Month-to-date spend and projected end-of-month cost, against the configured cap.
            </p>
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-4 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-dim">MTD</p>
                <p className="text-sm font-semibold tabular-nums text-text">
                  {fmtUsd(data.total_mtd_usd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-text-dim">Forecast EOM</p>
                <p className="text-sm font-semibold tabular-nums text-accent">
                  {fmtUsd(data.total_forecast_usd)}
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
              title="Couldn't load forecast"
              description="Refresh to retry."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No spend data yet"
              description="Once AI usage accrues this month, the forecast will appear here."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                margin={{ top: 8, right: 16, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtUsdAxis}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
                  content={<ChartTooltip valueFormatter={(v) => fmtUsd(v)} />}
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
                {capUsd > 0 ? (
                  <ReferenceLine
                    y={capUsd}
                    stroke={chartTheme.colors.danger}
                    strokeDasharray="4 4"
                    label={{
                      value: `Cap ${fmtUsd(capUsd)}`,
                      position: 'insideTopRight',
                      fill: chartTheme.colors.danger,
                      fontSize: 11,
                    }}
                  />
                ) : null}
                <Bar
                  dataKey="mtd_usd"
                  name="Month-to-date"
                  stackId="spend"
                  fill={chartTheme.colors.primary}
                  radius={[0, 0, 0, 0]}
                  maxBarSize={64}
                />
                <Bar
                  dataKey="forecast_usd"
                  name="Projected additional"
                  stackId="spend"
                  fill={chartTheme.colors.warning}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
