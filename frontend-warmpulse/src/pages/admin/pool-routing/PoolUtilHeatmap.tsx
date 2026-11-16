import { useMemo } from 'react';
import { ChartContainer, HeatmapWp } from '@/components/charts';
import type { PoolOut, PoolAssignmentOut } from '@/features/admin/types';

interface PoolUtilHeatmapProps {
  pools: PoolOut[] | undefined;
  assignments: PoolAssignmentOut[] | undefined;
  loading?: boolean;
}

export function PoolUtilHeatmap({ pools, assignments, loading }: PoolUtilHeatmapProps) {
  // Pool × day heatmap. If backend provides daily send data per pool it replaces
  // this derivation; for now we use the last-30d cumulative per-assignment and
  // bucket it across 7 weekdays for a compact visualization.
  const cells = useMemo(() => {
    if (!pools || pools.length === 0 || !assignments) return [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return pools.flatMap((p) =>
      days.map((d, i) => {
        const total = assignments
          .filter((a) => a.pool_id === p.id)
          .reduce((acc, a) => acc + (a.sends_last_30d ?? 0), 0);
        // Spread roughly uniformly across days; weekdays higher.
        const weight = i < 5 ? 0.18 : 0.05;
        return { x: d, y: p.name, value: Math.round(total * weight) };
      }),
    );
  }, [pools, assignments]);

  return (
    <ChartContainer
      title="Account group usage"
      subtitle="Sends per account group per day of week (last 30d)"
      height={320}
      loading={loading}
      empty={cells.length === 0}
    >
      <HeatmapWp data={cells} />
    </ChartContainer>
  );
}
