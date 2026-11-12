import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { StackedAreaChartWp } from '@/components/charts/recharts/StackedAreaChartWp';
import { chartTheme } from '@/components/charts/theme';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { usePlacementTrend } from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';
import { formatDate } from '@/lib/format';

interface PlacementStackedAreaCardProps {
  params: AnalyticsCommonParams;
}



function formatPercent(v: unknown, _name: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function PlacementStackedAreaCard({ params }: PlacementStackedAreaCardProps) {
  const { data, isLoading, isError } = usePlacementTrend(params);
  const [rawOpen, setRawOpen] = useState(false);

  const rows = useMemo(
    () =>
      (data ?? []).map((p) => ({
        date: p.date,
        inbox: Number(p.inbox_pct ?? 0),
        promotions: Number(p.promotions_pct ?? 0),
        spam: Number(p.spam_pct ?? 0),
      })),
    [data],
  );

  const empty = !isLoading && rows.length === 0;

  return (
    <>
    <ChartContainer
      title="Where emails land over time"
      subtitle="Share of warmup mail landing in Inbox vs Promotions vs Spam."
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
      error={isError ? 'Failed to load where-emails-land trend.' : null}
      empty={empty}
      emptyLabel="Inbox-vs-spam signals appear once helper inboxes begin classifying."
      height={320}
    >
      <StackedAreaChartWp
        data={rows}
        xKey="date"
        series={[
          { key: 'inbox', name: 'Inbox', color: chartTheme.colors.primary },
          { key: 'promotions', name: 'Promotions', color: chartTheme.colors.warning },
          { key: 'spam', name: 'Spam', color: chartTheme.colors.danger },
        ]}
        gradientIdPrefix="wp-placement"
        xFormatter={(v) => formatDate(String(v))}
        valueFormatter={formatPercent}
        yDomain={[0, 100]}
        height={280}
      />
    </ChartContainer>

    <AppDialog open={rawOpen} onOpenChange={setRawOpen}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Where emails land over time — raw data</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border-muted">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2/80 backdrop-blur">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Inbox %</th>
                  <th className="px-4 py-2 text-right">Promotions %</th>
                  <th className="px-4 py-2 text-right">Spam %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-2 tabular-nums text-text-dim">{formatDate(r.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.inbox.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.promotions.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.spam.toFixed(1)}</td>
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
