import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { ComboChartWp } from '@/components/charts/recharts/ComboChartWp';
import { chartTheme } from '@/components/charts/theme';
import { useVolumeCombo } from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';
import { formatDate } from '@/lib/format';

interface VolumeComboCardProps {
  params: AnalyticsCommonParams;
}

interface Row extends Record<string, unknown> {
  date: string;
  sent: number;
  opened: number;
  replied: number;
}



export function VolumeComboCard({ params }: VolumeComboCardProps) {
  const { data, isLoading, isError } = useVolumeCombo(params);

  const rows = useMemo<Row[]>(
    () =>
      (data ?? []).map((r) => ({
        date: r.date,
        sent: Number(r.sent ?? 0),
        opened: Number(r.opened ?? 0),
        replied: Number(r.replied ?? 0),
      })),
    [data],
  );

  const empty = !isLoading && rows.length === 0;

  return (
    <ChartContainer
      title="Volume & activity"
      subtitle="Daily sends (bars) with opens & replies (lines)."
      loading={isLoading}
      error={isError ? 'Failed to load volume.' : null}
      empty={empty}
      emptyLabel="No sends recorded in this range."
      height={320}
    >
      <ComboChartWp<Row>
        data={rows}
        xKey="date"
        series={[
          { key: 'sent', name: 'Sent', type: 'bar', color: chartTheme.colors.secondary },
          { key: 'opened', name: 'Opens', type: 'line', color: chartTheme.colors.primary },
          { key: 'replied', name: 'Replies', type: 'line', color: chartTheme.colors.warning },
        ]}
        xFormatter={(v) => formatDate(String(v))}
        height={280}
      />
    </ChartContainer>
  );
}
