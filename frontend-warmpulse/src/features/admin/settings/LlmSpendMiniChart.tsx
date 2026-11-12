import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SparklineWp } from '@/components/charts/recharts/SparklineWp';
import { chartTheme } from '@/components/charts/theme';
import { useAdminSettings } from './api';

interface LlmSpendMiniChartProps {
  delay?: number;
}

function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '$0';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

/**
 * Compact 80-px sparkline of recent LLM spend. Lives beside the OAuth panel
 * on the settings page and pulls its own copy of the settings bundle so it can
 * be dropped in anywhere without prop-drilling.
 */
export function LlmSpendMiniChart({ delay = 0 }: LlmSpendMiniChartProps) {
  const { data, isLoading, isError } = useAdminSettings();
  const series = data?.llm?.spend_series ?? [];
  const totalMtd = data?.llm?.spend_mtd_usd ?? 0;
  const isEmpty = !isLoading && !isError && series.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">AI spend</h3>
            <p className="text-[11px] text-text-dim">Last 30 days, month-to-date</p>
          </div>
          <div className="shrink-0 text-right">
            <span
              className="text-lg font-semibold tabular-nums text-text"
              aria-label={`Month-to-date spend ${formatUsd(totalMtd)}`}
            >
              {formatUsd(totalMtd)}
            </span>
          </div>
        </div>
        <div className="h-[80px]" role="img" aria-label="AI daily spend sparkline">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <div className="flex h-full items-center justify-center text-xs text-accent3">
              Couldn't load spend
            </div>
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center text-xs text-text-dim">
              No spend recorded yet
            </div>
          ) : (
            <SparklineWp
              data={series as unknown as Array<Record<string, unknown>>}
              yKey="cost_usd"
              color={chartTheme.colors.secondary}
              height={80}
              area
              strokeWidth={1.5}
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
