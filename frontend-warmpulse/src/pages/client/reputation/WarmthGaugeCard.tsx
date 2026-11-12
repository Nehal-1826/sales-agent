import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { RadialGaugeWp, warmthColor } from '@/components/charts';
import { useMailboxes } from '@/features/mailboxes/api';

/**
 * Big overall-warmth gauge. Uses the Recharts `RadialGaugeWp` so there's no
 * dependency on ApexCharts — the spec notes Apex Gauge as optional.
 */
export function WarmthGaugeCard() {
  const mailboxes = useMailboxes();

  const mean = useMemo(() => {
    const items = mailboxes.data?.items ?? [];
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0);
    return sum / items.length;
  }, [mailboxes.data]);

  const rounded = Math.round(mean);
  const color = warmthColor(rounded);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overall warmth</CardTitle>
        <CardDescription>
          Workspace-wide mean warmth score across every connected mailbox.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mailboxes.isLoading ? (
          <div className="flex h-[260px] items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-2">
            <RadialGaugeWp
              value={rounded}
              label={rounded >= 70 ? 'Healthy' : rounded >= 40 ? 'Warming' : 'Low'}
              subLabel="Overall warmth"
              size={260}
              color={color}
            />
            <p className="text-xs text-text-dim">
              {mailboxes.data?.items.length ?? 0} mailboxes contributing to this score.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
