import { useMemo } from 'react';
import { ChartContainer, AreaChartWp } from '@/components/charts';
import type { VolumePoint } from '@/features/admin/types';

interface SendsAreaChartProps {
  points: VolumePoint[] | undefined;
  loading?: boolean;
}

interface Point extends Record<string, unknown> {
  date: string;
  total: number;
}

export function SendsAreaChart({ points, loading }: SendsAreaChartProps) {
  const data: Point[] = useMemo(() => {
    return (points ?? []).map((p) => {
      let total = 0;
      for (const [k, v] of Object.entries(p)) {
        if (k === 'date') continue;
        if (typeof v === 'number') total += v;
      }
      return { date: String(p.date), total };
    });
  }, [points]);

  return (
    <ChartContainer
      title="Total sends (last 7d)"
      subtitle="Platform-wide outbound volume"
      height={260}
      loading={loading}
      empty={data.length === 0}
    >
      <AreaChartWp
        data={data}
        xKey="date"
        series={[{ key: 'total', name: 'Sends' }]}
        gradientIdPrefix="admin-sends"
      />
    </ChartContainer>
  );
}
