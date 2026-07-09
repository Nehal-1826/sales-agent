import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { DonutChartWp, type DonutDatum } from '@/components/charts/recharts/DonutChartWp';
import { paletteAt } from '@/components/charts/theme';
import { useProviderDistribution } from '@/features/analytics/api';

export function ProviderDonutCard() {
  const { data, isLoading, isError } = useProviderDistribution();

  const slices = useMemo<DonutDatum[]>(
    () =>
      (data ?? []).map((row, i) => ({
        name: row.provider,
        value: row.mailbox_count > 0 ? row.mailbox_count : row.sent,
        color: paletteAt(i),
      })),
    [data],
  );

  const total = slices.reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0);
  const empty = !isLoading && (slices.length === 0 || total === 0);

  return (
    <ChartContainer
      title="Sending by provider"
      subtitle="Mailbox distribution across ESPs."
      loading={isLoading}
      error={isError ? 'Failed to load provider breakdown.' : null}
      empty={empty}
      emptyLabel="Add mailboxes to see a provider split."
      height={320}
    >
      <DonutChartWp
        data={slices}
        height={280}
        centerLabel={String(total)}
        centerSubLabel="mailboxes"
      />
    </ChartContainer>
  );
}
