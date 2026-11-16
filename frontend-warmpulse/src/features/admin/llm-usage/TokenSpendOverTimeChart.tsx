import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StackedAreaChartWp } from '@/components/charts/recharts/StackedAreaChartWp';
import { paletteAt } from '@/components/charts/theme';
import type { SpendByPlanPoint } from './api';

interface TokenSpendOverTimeChartProps {
  data: SpendByPlanPoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtDate(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  const d = new Date(s.length === 7 ? `${s}-01` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

export function TokenSpendOverTimeChart({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: TokenSpendOverTimeChartProps) {
  const rows = data ?? [];

  // Derive plan keys (all fields other than `date`). Preserve encounter order
  // so the legend renders Starter → Pro → Agency naturally when the backend
  // returns them that way.
  const planKeys = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k === 'date') continue;
        if (!seen.includes(k)) seen.push(k);
      }
    }
    return seen;
  }, [rows]);

  const series = useMemo(
    () =>
      planKeys.map((k, i) => ({
        key: k,
        name: k.charAt(0).toUpperCase() + k.slice(1),
        color: paletteAt(i),
      })),
    [planKeys],
  );

  const isEmpty = !isLoading && !isError && (rows.length === 0 || planKeys.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Daily spend by plan</h3>
            <p className="text-xs text-text-dim">
               cost (USD) stacked across Starter / Pro / Agency subscribers.
            </p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load spend"
              description="Refresh to retry."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No spend recorded"
              description="Once the platform starts generating content, daily spend will appear here."
              className="py-10"
            />
          ) : (
            <StackedAreaChartWp
              data={rows as unknown as Array<Record<string, unknown>>}
              xKey="date"
              series={series}
              height={270}
              xFormatter={fmtDate}
              yFormatter={fmtUsdAxis}
              valueFormatter={(v) => fmtUsd(v)}
              gradientIdPrefix="wp-llm-spend"
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
