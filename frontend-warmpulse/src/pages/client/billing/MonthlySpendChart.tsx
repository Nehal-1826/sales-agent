import { ChartContainer, LineChartWp, chartTheme } from '@/components/charts';
import { useMonthlySpend } from '@/features/billing/api';
import { formatMoney, formatDate } from '@/lib/format';

function formatMonth(v: unknown): string {
  const s = String(v);
  const [y, m] = s.split('-');
  if (!y || !m) return s;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isNaN(d.getTime()) ? s : formatDate(d);
}

export function MonthlySpendChart() {
  const monthly = useMonthlySpend();
  const data = monthly.data ?? [];

  return (
    <ChartContainer
      title="Monthly spend"
      subtitle="All dummy billing over time"
      loading={monthly.isLoading}
      empty={!monthly.isLoading && data.every((d) => d.amount_cents === 0)}
      emptyLabel="No billing activity yet."
      height={280}
    >
      <LineChartWp
        data={data as unknown as Record<string, unknown>[]}
        xKey="month"
        series={[
          {
            key: 'amount_cents',
            name: 'Spend',
            color: chartTheme.colors.primary,
          },
        ]}
        height={280}
        xFormatter={formatMonth}
        yFormatter={(v) => formatMoney(Number(v) / 100)}
        valueFormatter={(v) => formatMoney(Number(v) / 100, { decimals: 2 })}
      />
    </ChartContainer>
  );
}
