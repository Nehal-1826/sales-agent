import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import {
  ScatterChartWp,
  type ScatterGroup,
} from '@/components/charts/recharts/ScatterChartWp';
import { paletteAt } from '@/components/charts/theme';
import { useBounceSpam } from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';

interface BounceSpamScatterCardProps {
  params: AnalyticsCommonParams;
}

interface Point extends Record<string, unknown> {
  bounce_rate: number;
  spam_rate: number;
  sends: number;
  date: string;
  mailbox: string;
}

function toPct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function formatPct(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function BounceSpamScatterCard({ params }: BounceSpamScatterCardProps) {
  const { data, isLoading, isError } = useBounceSpam(params);

  const groups = useMemo<Array<ScatterGroup<Point>>>(() => {
    const rows = data ?? [];
    if (rows.length === 0) return [];
    // Group points by mailbox_id so each mailbox gets its own color & legend entry.
    const byMailbox = new Map<string, { email: string; points: Point[] }>();
    for (const r of rows) {
      const key = r.mailbox_id ?? 'unknown';
      const entry = byMailbox.get(key) ?? { email: r.mailbox_email ?? key, points: [] };
      entry.points.push({
        bounce_rate: toPct(r.bounce_rate),
        spam_rate: toPct(r.spam_rate),
        sends: Number(r.sends ?? 0),
        date: r.date ?? '',
        mailbox: r.mailbox_email ?? key,
      });
      byMailbox.set(key, entry);
    }
    return Array.from(byMailbox.entries()).map(([, v], i) => ({
      name: v.email,
      data: v.points,
      color: paletteAt(i),
    }));
  }, [data]);

  const empty = !isLoading && groups.every((g) => g.data.length === 0);

  return (
    <ChartContainer
      title="Failed delivery (bounce) × Spam"
      subtitle="Each dot = one mailbox-day. Bottom-left is healthy."
      loading={isLoading}
      error={isError ? 'Failed to load failed deliveries / spam.' : null}
      empty={empty}
      emptyLabel="No failed delivery or spam signal recorded yet."
      height={320}
    >
      <ScatterChartWp<Point>
        groups={groups}
        xKey="bounce_rate"
        yKey="spam_rate"
        zKey="sends"
        xName="Failure rate"
        yName="Spam rate"
        xFormatter={formatPct}
        yFormatter={formatPct}
        valueFormatter={(v) => formatPct(v)}
        height={280}
      />
    </ChartContainer>
  );
}
