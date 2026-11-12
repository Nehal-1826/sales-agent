import { motion } from 'framer-motion';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { useWorkspace } from './api';
import { formatDate } from '@/lib/format';

export interface TeamActivityChartProps {
  delay?: number;
}

export function TeamActivityChart({ delay = 0.05 }: TeamActivityChartProps) {
  const { data, isLoading, isError } = useWorkspace();
  const series = data?.team_activity_series ?? [];
  const isEmpty = series.length === 0 || series.every((p) => !p.invites && !p.accepted);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <ChartContainer
        title="Team invites, last 30 days"
        subtitle="Sent vs accepted invites."
        loading={isLoading}
        error={isError ? 'Failed to load team activity' : null}
        empty={!isLoading && !isError && isEmpty}
        emptyLabel="No team activity in the last 30 days."
        height={240}
      >
        <StackedBarChartWp
          data={series as unknown as Record<string, unknown>[]}
          xKey="date"
          series={[
            { key: 'invites', name: 'Invites sent', color: '#FF9670' },
            { key: 'accepted', name: 'Accepted', color: '#34d399' },
          ]}
          height={220}
          xFormatter={(v) => {
            const d = new Date(String(v));
            if (Number.isNaN(d.getTime())) return String(v);
            return formatDate(d);
          }}
        />
      </ChartContainer>
    </motion.div>
  );
}
