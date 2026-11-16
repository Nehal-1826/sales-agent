import { ChartContainer, StackedBarChartWp } from '@/components/charts';
import type { PeerInboxStats } from '@/features/admin/types';

interface ProviderDistChartProps {
  stats: PeerInboxStats | undefined;
  loading?: boolean;
}

export function ProviderDistChart({ stats, loading }: ProviderDistChartProps) {
  const bp: unknown = stats?.by_provider;
  const data: Array<{ provider: string; active: number; inactive: number }> = (() => {
    if (Array.isArray(bp)) {
      return bp.map((p: { provider: string; count?: number; active?: number }) => ({
        provider: p.provider,
        active: p.active ?? 0,
        inactive: Math.max(0, (p.count ?? 0) - (p.active ?? 0)),
      }));
    }
    if (bp && typeof bp === 'object') {
      return Object.entries(bp as Record<string, number>).map(([provider, count]) => ({
        provider,
        active: Number(count) || 0,
        inactive: 0,
      }));
    }
    return [];
  })();

  return (
    <ChartContainer
      title="Inboxes by provider"
      subtitle="Active vs. inactive, stacked per provider"
      height={280}
      loading={loading}
      empty={data.length === 0}
    >
      <StackedBarChartWp
        data={data}
        xKey="provider"
        series={[
          { key: 'active', name: 'Active' },
          { key: 'inactive', name: 'Inactive' },
        ]}
      />
    </ChartContainer>
  );
}
