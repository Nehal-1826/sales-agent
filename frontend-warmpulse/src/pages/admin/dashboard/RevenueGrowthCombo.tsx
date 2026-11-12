import { useMemo } from 'react';
import { ChartContainer, ComboChartWp } from '@/components/charts';
import type { SignupRatePoint } from '@/features/admin/types';

interface RevenueGrowthComboProps {
  signupRate: SignupRatePoint[] | undefined;
  revenueSeries: Array<{ date: string; revenue_usd: number }> | undefined;
  loading?: boolean;
}

interface ComboPoint extends Record<string, unknown> {
  date: string;
  signups: number;
  mrr: number;
}

export function RevenueGrowthCombo({ signupRate, revenueSeries, loading }: RevenueGrowthComboProps) {
  const data: ComboPoint[] = useMemo(() => {
    const byDate = new Map<string, ComboPoint>();
    (signupRate ?? []).forEach((p) => {
      byDate.set(p.date, { date: p.date, signups: p.signups, mrr: 0 });
    });
    (revenueSeries ?? []).forEach((p) => {
      const existing = byDate.get(p.date);
      if (existing) existing.mrr = p.revenue_usd;
      else byDate.set(p.date, { date: p.date, signups: 0, mrr: p.revenue_usd });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [signupRate, revenueSeries]);

  return (
    <ChartContainer
      title="User growth + MRR"
      subtitle="Signups per day (bar) vs. revenue (line)"
      height={320}
      loading={loading}
      empty={data.length === 0}
      emptyLabel="No signup or revenue data yet."
    >
      <ComboChartWp
        data={data}
        xKey="date"
        series={[
          { key: 'signups', name: 'Signups', type: 'bar', yAxis: 'left' },
          { key: 'mrr', name: 'Revenue', type: 'line', yAxis: 'right' },
        ]}
        yRightFormatter={(v) => `$${Number(v).toLocaleString()}`}
      />
    </ChartContainer>
  );
}
