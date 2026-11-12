import { ChartContainer, SankeyWp } from '@/components/charts';
import type { SankeyData } from '@/features/admin/types';

interface SankeyChartProps {
  data: SankeyData | undefined;
  loading?: boolean;
}

export function SankeyChart({ data, loading }: SankeyChartProps) {
  const empty = !data || data.links.length === 0;
  return (
    <ChartContainer
      title="Clients → Account groups → Helper providers"
      subtitle="Flow magnitude shows traffic share"
      height={360}
      loading={loading}
      empty={empty}
      emptyLabel="No routing data yet."
    >
      {!empty ? <SankeyWp nodes={data.nodes} links={data.links} /> : <span />}
    </ChartContainer>
  );
}
