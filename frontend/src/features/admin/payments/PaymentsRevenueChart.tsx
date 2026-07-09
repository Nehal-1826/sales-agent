import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AreaChartWp } from '@/components/charts/recharts/AreaChartWp';
import { chartTheme } from '@/components/charts/theme';
import { formatUsd, type MonthlyRevenuePoint } from './api';

interface PaymentsRevenueChartProps {
  data: MonthlyRevenuePoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtDate(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  // Accept both YYYY-MM and YYYY-MM-DD.
  const tryDate = new Date(s.length === 7 ? `${s}-01` : s);
  if (Number.isNaN(tryDate.getTime())) return s;
  return tryDate.toLocaleDateString(undefined, {
    month: 'short',
    day: s.length > 7 ? 'numeric' : undefined,
    year: '2-digit',
  });
}

function fmtUsdAxis(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function PaymentsRevenueChart({
  data,
  isLoading,
  isError,
  delay = 0,
}: PaymentsRevenueChartProps) {
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
            <h3 className="text-base font-semibold text-text">Revenue trend</h3>
            <p className="text-xs text-text-dim">Daily demo revenue over the filtered period.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load revenue"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No revenue recorded"
              description="Once demo payments roll in, the daily trend will appear here."
              className="py-10"
            />
          ) : (
            <AreaChartWp
              data={rows as unknown as Array<Record<string, unknown>>}
              xKey="date"
              series={[
                { key: 'revenue_usd', name: 'Revenue (USD)', color: chartTheme.colors.primary },
              ]}
              height={280}
              xFormatter={fmtDate}
              yFormatter={fmtUsdAxis}
              valueFormatter={(v) => formatUsd(Number(v ?? 0))}
              showLegend={false}
              gradientIdPrefix="wp-payments-revenue"
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
