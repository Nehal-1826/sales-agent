import { ChartContainer, BarChartWp, chartTheme } from '@/components/charts';

interface DailySendsChartProps {
  data: Array<{ date: string; actual: number }>;
  isLoading?: boolean;
  isError?: boolean;
}

export function DailySendsChart({ data, isLoading, isError }: DailySendsChartProps) {
  return (
    <ChartContainer
      title="Daily sends"
      subtitle="Actual send volume per day"
      loading={isLoading}
      error={isError ? 'Failed to load send data' : null}
      empty={!isLoading && (!data || data.length === 0)}
      height={200}
    >
      <BarChartWp
        data={data as unknown as Record<string, unknown>[]}
        xKey="date"
        series={[{ key: 'actual', name: 'Sent', color: chartTheme.colors.primary }]}
        height={192}
        xFormatter={(d) => {
          try {
            const dt = new Date(String(d));
            return `${dt.getMonth() + 1}/${dt.getDate()}`;
          } catch {
            return String(d);
          }
        }}
      />
    </ChartContainer>
  );
}
