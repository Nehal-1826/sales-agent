import { motion } from 'framer-motion';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { useReports } from './api';
import { formatDate } from '@/lib/format';

export interface ReportsVolumeChartProps {
  delay?: number;
}

export function ReportsVolumeChart({ delay = 0 }: ReportsVolumeChartProps) {
  const { data, isLoading, isError } = useReports();
  const series = data?.volume_series ?? [];
  const isEmpty = series.length === 0 || series.every((p) => !p.pdfs && !p.csvs);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <ChartContainer
        title="Reports generated, last 30 days"
        subtitle="PDF and CSV exports per day."
        loading={isLoading}
        error={isError ? 'Failed to load reports volume' : null}
        empty={!isLoading && !isError && isEmpty}
        emptyLabel="No reports generated in the last 30 days."
        height={260}
      >
        <StackedBarChartWp
          data={series as unknown as Record<string, unknown>[]}
          xKey="date"
          series={[
            { key: 'pdfs', name: 'PDF', color: '#FF9670' },
            { key: 'csvs', name: 'CSV', color: '#34d399' },
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
