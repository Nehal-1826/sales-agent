import { ChartContainer } from '@/components/charts/ChartContainer';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { chartTheme } from '@/components/charts/theme';
import type { ActivityHourBucket } from '@/features/activity/types';

interface ActivityStackedBarCardProps {
  data: ActivityHourBucket[];
  isLoading?: boolean;
  isError?: boolean;
}

export function ActivityStackedBarCard({
  data,
  isLoading,
  isError,
}: ActivityStackedBarCardProps) {
  const empty =
    !isLoading &&
    data.every(
      (b) =>
        b.sent + b.opened + b.replied + b.starred + b.spam_rescued + b.marked_important === 0,
    );

  return (
    <ChartContainer
      title="Last 24 hours by action type"
      subtitle="Hourly buckets across all selected mailboxes."
      loading={!!isLoading}
      error={isError ? 'Failed to load activity buckets.' : null}
      empty={empty}
      emptyLabel="No activity in the last 24 hours yet."
      height={300}
    >
      <StackedBarChartWp<ActivityHourBucket & Record<string, unknown>>
        data={data as Array<ActivityHourBucket & Record<string, unknown>>}
        xKey="label"
        series={[
          { key: 'sent', name: 'Sent', color: chartTheme.colors.secondary },
          { key: 'opened', name: 'Opened', color: chartTheme.colors.primary },
          { key: 'replied', name: 'Replied', color: chartTheme.colors.warning },
          { key: 'starred', name: 'Starred', color: chartTheme.palette[4] ?? chartTheme.colors.warning },
          { key: 'spam_rescued', name: 'Spam recovery', color: chartTheme.colors.danger },
        ]}
        height={260}
      />
    </ChartContainer>
  );
}
