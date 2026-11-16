import { ChartContainer, LineChartWp } from '@/components/charts';
import type { SignupRatePoint } from '@/features/admin/types';

interface SignupRateChartProps {
  data: SignupRatePoint[] | undefined;
  loading?: boolean;
}

export function SignupRateChart({ data, loading }: SignupRateChartProps) {
  const points = (data ?? []).map((p) => ({
    date: p.date,
    signups: p.signups,
    cumulative: p.cumulative ?? 0,
  }));

  return (
    <ChartContainer
      title="Signup rate"
      subtitle="Last 30 days"
      height={280}
      loading={loading}
      empty={points.length === 0}
    >
      <LineChartWp
        data={points}
        xKey="date"
        series={[
          { key: 'signups', name: 'Daily signups' },
          { key: 'cumulative', name: 'Cumulative', dashed: true },
        ]}
      />
    </ChartContainer>
  );
}
