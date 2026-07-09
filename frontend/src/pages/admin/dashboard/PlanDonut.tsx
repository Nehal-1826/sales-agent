import { ChartContainer, DonutChartWp } from '@/components/charts';
import type { PlanDistributionRow } from '@/features/admin/types';

interface PlanDonutProps {
  rows: PlanDistributionRow[] | undefined;
  loading?: boolean;
}

export function PlanDonut({ rows, loading }: PlanDonutProps) {
  const data = (rows ?? []).map((r) => ({ name: r.plan, value: r.count }));
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <ChartContainer
      title="Plan distribution"
      subtitle="Active subscribers per tier"
      height={260}
      loading={loading}
      empty={data.length === 0}
    >
      <DonutChartWp
        data={data}
        centerLabel={total.toString()}
        centerSubLabel="Clients"
      />
    </ChartContainer>
  );
}
