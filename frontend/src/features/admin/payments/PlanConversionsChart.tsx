import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { paletteAt } from '@/components/charts/theme';
import type { PlanConversionsPoint } from './api';

interface PlanConversionsChartProps {
  data: PlanConversionsPoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtMonth(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  const parsed = new Date(s.length === 7 ? `${s}-01` : s);
  if (Number.isNaN(parsed.getTime())) return s;
  return parsed.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function PlanConversionsChart({
  data,
  isLoading,
  isError,
  delay = 0,
}: PlanConversionsChartProps) {
  const rows = data ?? [];

  const seriesKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (k === 'month') continue;
        if (typeof row[k] === 'number') keys.add(k);
      }
    }
    return Array.from(keys);
  }, [rows]);

  const isEmpty =
    !isLoading && !isError && (rows.length === 0 || seriesKeys.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Plan conversions</h3>
            <p className="text-xs text-text-dim">
              New signups per plan by month — stacked to show total sales velocity.
            </p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load conversions"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No plan conversions yet"
              description="Once demo payments post, per-plan signups will stack here."
              className="py-10"
            />
          ) : (
            <StackedBarChartWp
              data={rows as unknown as Array<Record<string, unknown>>}
              xKey="month"
              series={seriesKeys.map((key, i) => ({
                key,
                name: key,
                color: paletteAt(i),
              }))}
              height={280}
              xFormatter={fmtMonth}
              yFormatter={(v) => String(Math.round(Number(v ?? 0)))}
              valueFormatter={(v) => `${Math.round(Number(v ?? 0))} signups`}
              showLegend
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
