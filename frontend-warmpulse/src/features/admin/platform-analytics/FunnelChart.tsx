import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
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
import type { FunnelStep } from './api';

interface FunnelChartProps {
  data: FunnelStep[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

interface FunnelRow extends FunnelStep {
  /** Percentage relative to the top-of-funnel value. */
  pct: number;
  /** Drop-off % from the previous stage (0 on the first stage). */
  dropoff: number;
}

/**
 * Engagement funnel: sends → opens → replies → saved-from-spam.
 *
 * Synthesized as a horizontal bar chart rather than Apex's `funnel` type so
 * we stay inside Recharts (lighter bundle, same theming hooks). Each row
 * shows absolute value + pct-of-top alongside a drop-off chip.
 */
export function FunnelChart({ data, isLoading, isError, delay = 0 }: FunnelChartProps) {
  const rows = useMemo<FunnelRow[]>(() => {
    const steps = data ?? [];
    if (steps.length === 0) return [];
    const top = steps[0]?.value ?? 0;
    return steps.map((step, i) => {
      const prev = i > 0 ? steps[i - 1]?.value ?? 0 : step.value;
      const dropoff = i === 0 || prev === 0 ? 0 : ((prev - step.value) / prev) * 100;
      const pct = top === 0 ? 0 : (step.value / top) * 100;
      return { ...step, pct, dropoff };
    });
  }, [data]);

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
            <h3 className="text-base font-semibold text-text">Email activity funnel</h3>
            <p className="text-xs text-text-dim">Sends → opens → replies → spam recoveries.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load funnel"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No funnel data yet"
              description="Once warmup mail is sent and engaged with, stages will appear here."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 8, right: 48, left: 8, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  hide
                  domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
                />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fill: chartTheme.colors.text, fontSize: chartTheme.font.sizeMd }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
                  content={
                    <ChartTooltip
                      valueFormatter={(v) => Number(v).toLocaleString()}
                    />
                  }
                />
                <Bar dataKey="value" name="Count" radius={[0, 3, 3, 0]} maxBarSize={28}>
                  {rows.map((row, i) => (
                    <Cell key={row.stage} fill={paletteAt(i)} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: unknown) => Number(value).toLocaleString()}
                    style={{
                      fill: chartTheme.colors.text,
                      fontSize: chartTheme.font.sizeSm,
                      fontFamily: chartTheme.font.family,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {!isLoading && !isError && rows.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
            {rows.map((r) => (
              <li key={r.stage} className="tabular-nums">
                <span className="text-text">{r.stage}</span>
                <span className="ml-1">{r.pct.toFixed(0)}% of top</span>
                {r.dropoff > 0 ? (
                  <span className="ml-1 text-accent3">
                    ↓{r.dropoff.toFixed(0)}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </motion.div>
  );
}
