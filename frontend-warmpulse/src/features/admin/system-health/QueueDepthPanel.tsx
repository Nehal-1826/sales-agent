import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Activity, Clock, Layers } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SparklineWp } from '@/components/charts/recharts/SparklineWp';
import { chartTheme } from '@/components/charts/theme';
import type { QueueMetrics, QueueSparkPoint } from './api';

interface QueueDepthPanelProps {
  data: QueueMetrics | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subLabel: string;
  color: string;
  series: QueueSparkPoint[];
  isLoading: boolean;
  isError: boolean;
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtSeconds(n: number): string {
  if (!Number.isFinite(n)) return '0s';
  if (n >= 60) return `${(n / 60).toFixed(1)}m`;
  if (n >= 1) return `${n.toFixed(1)}s`;
  return `${Math.round(n * 1000)}ms`;
}

function MetricCard({
  icon,
  label,
  value,
  subLabel,
  color,
  series,
  isLoading,
  isError,
}: MetricCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-text-dim">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-text-dim">{label}</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-5 w-16" />
            ) : isError ? (
              <span className="text-sm text-accent3">error</span>
            ) : (
              <p className="text-xl font-semibold tabular-nums text-text">{value}</p>
            )}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-text-dim">{subLabel}</p>
      <div className="mt-2 h-10" aria-label={`${label} trend`} role="img">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : isError || series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-text-dim">
            {isError ? 'Couldn\'t load trend' : 'No data yet'}
          </div>
        ) : (
          <SparklineWp
            data={series as unknown as Array<Record<string, unknown>>}
            yKey="value"
            color={color}
            height={40}
            area
          />
        )}
      </div>
    </Card>
  );
}

export function QueueDepthPanel({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: QueueDepthPanelProps) {
  const celeryDepth = data?.celery_depth ?? 0;
  const beatDelay = data?.beat_delay_s ?? 0;
  const redisOps = data?.redis_ops_per_s ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <MetricCard
        icon={<Layers className="h-3.5 w-3.5" />}
        label="Celery backlog"
        value={fmtNumber(celeryDepth)}
        subLabel="Tasks waiting to be picked up"
        color={chartTheme.colors.primary}
        series={data?.celery_depth_series ?? []}
        isLoading={isLoading}
        isError={isError}
      />
      <MetricCard
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Beat delay"
        value={fmtSeconds(beatDelay)}
        subLabel="Drift between scheduled and actual run"
        color={chartTheme.colors.warning}
        series={data?.beat_delay_series ?? []}
        isLoading={isLoading}
        isError={isError}
      />
      <MetricCard
        icon={<Activity className="h-3.5 w-3.5" />}
        label="Redis ops/s"
        value={fmtNumber(redisOps)}
        subLabel="Commands per second across all WarmPulse keys"
        color={chartTheme.colors.secondary}
        series={data?.redis_ops_series ?? []}
        isLoading={isLoading}
        isError={isError}
      />
    </motion.div>
  );
}
