import { useMemo } from 'react';
import { ChartContainer, StackedBarChartWp, chartTheme } from '@/components/charts';
import { useMe } from '@/features/auth/useAuthApi';
import { formatMoney } from '@/lib/format';

const PLAN_PRICES: Record<string, number> = {
  starter: 29,
  pro: 79,
  agency: 199,
};

/**
 * Cosmetic single-month stacked bar showing how the user's spend breaks down
 * across the three cost buckets documented in the spec. Values are derived
 * proportionally from the current plan price so the chart is always populated.
 */
export function FeatureBreakdownStackedBar() {
  const me = useMe();
  const planId = me.data?.plan ?? 'starter';
  const price = PLAN_PRICES[planId] ?? 0;

  const data = useMemo(
    () => [
      {
        bucket: 'This month',
        warmup_cents: Math.round(price * 100 * 0.8),
        llm_cents: Math.round(price * 100 * 0.15),
        seats_cents: Math.round(price * 100 * 0.05),
      },
    ],
    [price],
  );

  return (
    <ChartContainer
      title="Cost breakdown"
      subtitle="Where this plan's spend goes"
      loading={me.isLoading}
      empty={price === 0}
      emptyLabel="Upgrade to see a cost breakdown."
      height={280}
    >
      <StackedBarChartWp
        data={data}
        xKey="bucket"
        series={[
          {
            key: 'warmup_cents',
            name: 'Warmup engine (80%)',
            color: chartTheme.colors.primary,
          },
          {
            key: 'llm_cents',
            name: 'AI tokens (15%)',
            color: chartTheme.colors.secondary,
          },
          {
            key: 'seats_cents',
            name: 'Team seats (5%)',
            color: chartTheme.colors.warning,
          },
        ]}
        height={280}
        yFormatter={(v) => formatMoney(Number(v) / 100)}
        valueFormatter={(v, name) => `${name}: ${formatMoney(Number(v) / 100, { decimals: 2 })}`}
      />
    </ChartContainer>
  );
}
