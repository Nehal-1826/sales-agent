import { ChartContainer, HistogramWp } from '@/components/charts';
import type { WarmthBin } from '@/features/admin/types';

interface WarmthHistogramProps {
  bins: WarmthBin[] | undefined;
  loading?: boolean;
}

export function WarmthHistogram({ bins, loading }: WarmthHistogramProps) {
  const histogramBins = (bins ?? []).map((b, i) => ({
    bin: b.bin,
    count: b.count,
    x0: b.x0 ?? i * 10,
    x1: b.x1 ?? (i + 1) * 10,
  }));

  return (
    <ChartContainer
      title="Warmth distribution"
      subtitle="Users by average warmth score"
      height={280}
      loading={loading}
      empty={histogramBins.length === 0}
    >
      <HistogramWp bins={histogramBins} />
    </ChartContainer>
  );
}
