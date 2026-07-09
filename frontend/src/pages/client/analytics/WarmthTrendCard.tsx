import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { LineChartWp } from '@/components/charts/recharts/LineChartWp';
import { chartTheme } from '@/components/charts/theme';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { useDailyMetrics } from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';
import { formatDate } from '@/lib/format';

interface WarmthTrendCardProps {
  params: AnalyticsCommonParams;
}



export function WarmthTrendCard({ params }: WarmthTrendCardProps) {
  const { data, isLoading, isError } = useDailyMetrics(params);
  const [rawOpen, setRawOpen] = useState(false);
  const rows = useMemo(
    () =>
      (data ?? []).map((r) => ({
        date: r.date,
        warmth_score: Number(r.warmth_score ?? 0),
      })),
    [data],
  );

  const empty = !isLoading && rows.length === 0;

  return (
    <>
    <ChartContainer
      title="Warmth trend"
      subtitle="Daily mean warmth (0–100) across selected mailboxes."
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setRawOpen(true)}
          disabled={rows.length === 0}
        >
          View raw
        </Button>
      }
      loading={isLoading}
      error={isError ? 'Failed to load warmth trend.' : null}
      empty={empty}
      emptyLabel="No warmth data yet — scores appear once warmup starts sending."
      height={320}
    >
      <LineChartWp
        data={rows}
        xKey="date"
        series={[
          {
            key: 'warmth_score',
            name: 'Warmth',
            color: chartTheme.colors.primary,
          },
        ]}
        xFormatter={(v) => formatDate(String(v))}
        yDomain={[0, 100]}
        height={280}
      />
    </ChartContainer>

    <AppDialog open={rawOpen} onOpenChange={setRawOpen}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Warmth trend — raw data</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border-muted">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Warmth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-2 tabular-nums text-text-dim">{formatDate(r.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.warmth_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
    </>
  );
}
