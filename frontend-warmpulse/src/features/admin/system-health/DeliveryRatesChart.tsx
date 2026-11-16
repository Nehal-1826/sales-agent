import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ComboChartWp } from '@/components/charts/recharts/ComboChartWp';
import { chartTheme } from '@/components/charts/theme';
import type { DeliveryPoint } from './api';

interface DeliveryRatesChartProps {
  data: DeliveryPoint[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtTime(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtRate(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtPercent(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0%';
  // The backend can send either a fraction (0-1) or a percentage (0-100);
  // format either cleanly.
  const asPct = n <= 1 ? n * 100 : n;
  return `${asPct.toFixed(1)}%`;
}

export function DeliveryRatesChart({
  data,
  isLoading = false,
  isError = false,
  delay = 0,
}: DeliveryRatesChartProps) {
  const rows = data ?? [];
  const isEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Delivery rates</h3>
            <p className="text-xs text-text-dim">
              SMTP sends and IMAP fetches per minute, overlaid with error rate.
            </p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load delivery rates"
              description="Check that Prometheus/StatsD is reachable."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No delivery data yet"
              description="Once workers start sending, per-minute rates will appear here."
              className="py-10"
            />
          ) : (
            <ComboChartWp
              data={rows as unknown as Array<Record<string, unknown>>}
              xKey="t"
              series={[
                {
                  key: 'smtp_send',
                  name: 'SMTP sends/min',
                  type: 'line',
                  color: chartTheme.colors.primary,
                  yAxis: 'left',
                },
                {
                  key: 'imap_fetch',
                  name: 'IMAP fetches/min',
                  type: 'line',
                  color: chartTheme.colors.secondary,
                  yAxis: 'left',
                },
                {
                  key: 'error_rate',
                  name: 'Error rate',
                  type: 'area',
                  color: chartTheme.colors.danger,
                  yAxis: 'right',
                },
              ]}
              height={270}
              xFormatter={fmtTime}
              yFormatter={fmtRate}
              yRightFormatter={fmtPercent}
              valueFormatter={(v, name) =>
                name === 'Error rate' ? fmtPercent(v) : fmtRate(v)
              }
            />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
