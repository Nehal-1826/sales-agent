import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { HorizontalBarChartWp } from '@/components/charts/recharts/HorizontalBarChartWp';
import { chartTheme } from '@/components/charts/theme';
import type { PlanRevenueSharePoint } from './api';

interface PlanRevenueChartProps {
  data: PlanRevenueSharePoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtUsd(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtFullUsd(v: unknown): string {
  const n = Number(v ?? 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toFixed(0)}`;
  }
}

export function PlanRevenueChart({
  data,
  isLoading,
  isError,
  delay = 0,
}: PlanRevenueChartProps) {
  const rows = (data ?? []).slice().sort((a, b) => b.mrr_usd - a.mrr_usd);
  const isEmpty = !isLoading && !isError && rows.length === 0;
  const height = Math.max(rows.length * 48 + 48, 200);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">MRR by plan</h3>
            <p className="text-xs text-text-dim">
              Monthly recurring revenue contribution per plan (user count × price).
            </p>
          </div>
        </div>
        <div style={{ height }}>
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load MRR breakdown"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No revenue contribution yet"
              description="Once users pick plans, each tier's MRR share will appear here."
              className="py-10"
            />
          ) : (
            <HorizontalBarChartWp
              data={rows as unknown as Array<Record<string, unknown>>}
              yKey="plan"
              series={[
                { key: 'mrr_usd', name: 'MRR (USD)', color: chartTheme.colors.primary },
              ]}
              height={height - 16}
              xFormatter={fmtUsd}
              valueFormatter={(v) => fmtFullUsd(v)}
              showLegend={false}
              categoryWidth={96}
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
