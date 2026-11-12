import { ChartContainer, LineChartWp, chartTheme } from '@/components/charts';

interface RampPoint {
  day: number;
  planned: number;
  actual?: number;
}

interface RampCurveChartProps {
  data: RampPoint[];
  isLoading?: boolean;
  isError?: boolean;
}

/** Planned ramp (per §2 spec schedule) vs actual daily_target. */
export function RampCurveChart({ data, isLoading, isError }: RampCurveChartProps) {
  return (
    <ChartContainer
      title="Build-up curve"
      subtitle="Planned schedule vs actual daily target"
      loading={isLoading}
      error={isError ? 'Failed to load build-up data' : null}
      empty={!isLoading && (!data || data.length === 0)}
      height={240}
    >
      <LineChartWp
        data={data as unknown as Record<string, unknown>[]}
        xKey="day"
        series={[
          { key: 'planned', name: 'Planned', color: chartTheme.colors.secondary },
          { key: 'actual', name: 'Actual', color: chartTheme.colors.primary },
        ]}
        xFormatter={(v) => `D${v}`}
        height={232}
        showLegend
      />
    </ChartContainer>
  );
}

/** Spec-defined ramp schedule, used as fallback when backend doesn't return one. */
export const DEFAULT_RAMP: Array<{ day: number; planned: number }> = (() => {
  const out: Array<{ day: number; planned: number }> = [];
  for (let d = 1; d <= 30; d++) {
    let p = 5;
    if (d >= 4 && d <= 7) p = 10;
    else if (d >= 8 && d <= 14) p = 20;
    else if (d >= 15 && d <= 21) p = 35;
    else if (d >= 22 && d <= 28) p = 50;
    else if (d >= 29) p = 75;
    out.push({ day: d, planned: p });
  }
  return out;
})();
