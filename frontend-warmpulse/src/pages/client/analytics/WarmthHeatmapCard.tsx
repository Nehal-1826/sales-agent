import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { HeatmapWp, type HeatmapCell } from '@/components/charts/apex';
import { useWarmthHeatmap } from '@/features/analytics/api';

interface WarmthHeatmapCardProps {
  mailbox_id?: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function hourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

export function WarmthHeatmapCard({ mailbox_id }: WarmthHeatmapCardProps) {
  const { data, isLoading, isError } = useWarmthHeatmap({ mailbox_id });

  const cells = useMemo<HeatmapCell[]>(() => {
    const source = data?.cells ?? [];
    return source.map((c) => ({
      x: hourLabel(c.hour),
      y: WEEKDAY_LABELS[c.weekday] ?? String(c.weekday),
      value: Number(c.value ?? 0),
    }));
  }, [data]);

  const empty = !isLoading && cells.length === 0;

  const xLabels = useMemo(() => Array.from({ length: 24 }, (_, h) => hourLabel(h)), []);
  const yLabels = useMemo(() => [...WEEKDAY_LABELS], []);

  return (
    <ChartContainer
      title="Warmth heatmap"
      subtitle="Mean warmth by weekday × hour. Darker = colder; green = healthy."
      loading={isLoading}
      error={isError ? 'Failed to load warmth heatmap.' : null}
      empty={empty}
      emptyLabel="Heatmap appears once we have at least a week of activity."
      height={420}
    >
      <HeatmapWp
        data={cells}
        xLabels={xLabels}
        yLabels={yLabels}
        height={380}
        ariaLabel="Warmth score heatmap"
      />
    </ChartContainer>
  );
}
