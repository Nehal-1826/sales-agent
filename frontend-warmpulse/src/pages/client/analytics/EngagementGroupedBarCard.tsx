import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { GroupedBarChartWp } from '@/components/charts/recharts/GroupedBarChartWp';
import { chartTheme } from '@/components/charts/theme';
import { useEngagement } from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';
import { formatDate } from '@/lib/format';

interface EngagementGroupedBarCardProps {
  params: AnalyticsCommonParams;
}

interface Row extends Record<string, unknown> {
  bucket: string;
  open_rate: number;
  reply_rate: number;
  star_rate: number;
  rescue_rate: number;
}

function formatBucket(v: unknown): string {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return formatDate(d);
}

function formatRate(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // backend may return fractional (0-1) or percent (0-100)
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

export function EngagementGroupedBarCard({ params }: EngagementGroupedBarCardProps) {
  const { data, isLoading, isError } = useEngagement(params);

  const rows = useMemo<Row[]>(
    () =>
      (data ?? []).map((p) => ({
        bucket: p.bucket,
        open_rate: Number(p.open_rate ?? 0),
        reply_rate: Number(p.reply_rate ?? 0),
        star_rate: Number(p.star_rate ?? 0),
        rescue_rate: Number(p.rescue_rate ?? 0),
      })),
    [data],
  );

  const empty = !isLoading && rows.length === 0;

  return (
    <ChartContainer
      title="Opens & replies"
      subtitle="Open / reply / star / spam recovery rates per bucket."
      loading={isLoading}
      error={isError ? 'Failed to load opens & replies.' : null}
      empty={empty}
      emptyLabel="Opens and replies appear once helper inboxes start interacting."
      height={320}
    >
      <GroupedBarChartWp<Row>
        data={rows}
        xKey="bucket"
        series={[
          { key: 'open_rate', name: 'Open rate', color: chartTheme.colors.primary },
          { key: 'reply_rate', name: 'Reply rate', color: chartTheme.colors.secondary },
          { key: 'star_rate', name: 'Star rate', color: chartTheme.colors.warning },
          { key: 'rescue_rate', name: 'Spam recovery rate', color: chartTheme.colors.danger },
        ]}
        xFormatter={formatBucket}
        valueFormatter={(v) => formatRate(v)}
        height={280}
      />
    </ChartContainer>
  );
}
