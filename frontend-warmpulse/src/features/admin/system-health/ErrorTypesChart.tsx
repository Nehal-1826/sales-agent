import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { HorizontalBarChartWp } from '@/components/charts/recharts/HorizontalBarChartWp';
import { chartTheme } from '@/components/charts/theme';
import type { ErrorTypeRow } from './api';

interface ErrorTypesChartProps {
  data: ErrorTypeRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtInt(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString();
}

export function ErrorTypesChart({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: ErrorTypesChartProps) {
  const rows = data ?? [];
  // Sort desc so the biggest error type sits on top.
  const sorted = [...rows].sort((a, b) => b.count - a.count).slice(0, 10);
  const isEmpty = !isLoading && !isError && sorted.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Error types</h3>
            <p className="text-xs text-text-dim">
              Top exception classes logged in the last 24h.
            </p>
          </div>
          {!isLoading && !isError && sorted.length > 0 ? (
            <span className="shrink-0 text-[11px] text-text-dim tabular-nums">
              {fmtInt(sorted.reduce((acc, r) => acc + r.count, 0))} total
            </span>
          ) : null}
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load errors"
              description="Error-metric stream unavailable."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No recent errors"
              description="Nothing to see here — the API and workers are behaving."
              className="py-10"
            />
          ) : (
            <HorizontalBarChartWp
              data={sorted as unknown as Array<Record<string, unknown>>}
              yKey="type"
              series={[
                {
                  key: 'count',
                  name: 'Errors',
                  color: chartTheme.colors.danger,
                },
              ]}
              height={270}
              xFormatter={fmtInt}
              valueFormatter={(v) => fmtInt(v)}
              categoryWidth={160}
              showLegend={false}
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
