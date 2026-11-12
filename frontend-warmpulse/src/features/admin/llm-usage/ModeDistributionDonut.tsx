import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { DonutChartWp } from '@/components/charts/recharts/DonutChartWp';
import { paletteAt } from '@/components/charts/theme';
import type { ModeSlice } from './api';

interface ModeDistributionDonutProps {
  data: ModeSlice[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtTokens(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function ModeDistributionDonut({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: ModeDistributionDonutProps) {
  const rows = data ?? [];
  const totalTokens = rows.reduce((acc, r) => acc + (r.tokens || 0), 0);
  const isEmpty = !isLoading && !isError && (rows.length === 0 || totalTokens === 0);

  const donutData = rows.map((r, i) => ({
    name: r.name,
    value: r.tokens,
    color: paletteAt(i),
  }));

  const top = [...rows].sort((a, b) => b.tokens - a.tokens)[0];
  const topPct =
    top && totalTokens > 0 ? `${Math.round((top.tokens / totalTokens) * 100)}%` : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Content mode split</h3>
            <p className="text-xs text-text-dim">
              Tokens spent per mode — plain, styled, dual, template-only.
            </p>
          </div>
        </div>
        <div className="h-64">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load mode split"
              description="Refresh to retry."
              className="py-8"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No usage yet"
              description="Once  generates content, the mode breakdown will appear here."
              className="py-8"
            />
          ) : (
            <DonutChartWp
              data={donutData}
              height={240}
              paddingAngle={3}
              centerLabel={topPct}
              centerSubLabel={top ? top.name : undefined}
              valueFormatter={(v) => `${fmtTokens(v)} tokens`}
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
