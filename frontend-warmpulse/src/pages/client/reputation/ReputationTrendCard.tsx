import { Info } from 'lucide-react';
import { ChartContainer, LineChartWp, chartTheme } from '@/components/charts';
import { formatDate } from '@/lib/format';
import { useReputationTrend } from '@/features/reputation/api';

/**
 * 30-day reputation trend line chart. If the reputation backend is not live,
 * a synthetic series derived from warmth scores is used as a fallback — we
 * surface that distinction in a small note beneath the chart.
 */
export function ReputationTrendCard() {
  const trend = useReputationTrend();
  const data = trend.data ?? [];
  const empty = !trend.isLoading && data.length === 0;

  return (
    <div className="space-y-2">
      <ChartContainer
        title="Sender trust trend"
        subtitle="30-day score history"
        loading={trend.isLoading}
        error={trend.isError ? 'Could not load trend' : null}
        empty={empty}
        emptyLabel="No sender trust data yet."
        height={320}
      >
        <LineChartWp
          data={data as unknown as Record<string, unknown>[]}
          xKey="date"
          series={[
            { key: 'score', name: 'Score', color: chartTheme.colors.primary },
          ]}
          height={320}
          yDomain={[0, 100]}
          xFormatter={(v) => {
            const d = new Date(String(v));
            return Number.isNaN(d.getTime())
              ? String(v)
              : formatDate(d);
          }}
        />
      </ChartContainer>
      <p className="flex items-center gap-1.5 text-[11px] text-text-dim">
        <Info className="h-3 w-3" />
        Shown: warmth score (sender trust integrations not yet connected).
      </p>
    </div>
  );
}
