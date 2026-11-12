import { useMemo } from 'react';
import { ChartContainer, ScatterChartWp } from '@/components/charts';
import type { PeerInboxOut } from '@/features/admin/types';

interface CapacityScatterChartProps {
  inboxes: PeerInboxOut[] | undefined;
  loading?: boolean;
}

interface Point extends Record<string, unknown> {
  capacity: number;
  reputation: number;
  email: string;
}

export function CapacityScatterChart({ inboxes, loading }: CapacityScatterChartProps) {
  const groups = useMemo(() => {
    const byProvider = new Map<string, Point[]>();
    (inboxes ?? []).forEach((i) => {
      const arr = byProvider.get(i.provider) ?? [];
      arr.push({
        capacity: i.daily_capacity,
        reputation: i.reputation_score,
        email: i.email,
      });
      byProvider.set(i.provider, arr);
    });
    return Array.from(byProvider.entries()).map(([name, data]) => ({ name, data }));
  }, [inboxes]);

  return (
    <ChartContainer
      title="Daily limit vs. trust score"
      subtitle="Each dot is a test account; groups coloured by provider"
      height={320}
      loading={loading}
      empty={groups.length === 0}
    >
      <ScatterChartWp
        groups={groups}
        xKey="capacity"
        yKey="reputation"
        xName="Daily limit"
        yName="Trust score"
      />
    </ChartContainer>
  );
}
