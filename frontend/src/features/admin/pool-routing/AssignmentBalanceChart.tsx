import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartTheme } from '@/components/charts/theme';
import type { PoolOut } from '@/features/admin/types';

interface AssignmentBalanceChartProps {
  pools: PoolOut[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
  /** Ratio multiplier used to flag overload. Defaults to 20 clients/member. */
  overloadMultiplier?: number;
}

interface Row extends Record<string, unknown> {
  pool: string;
  clients: number;
  capacity: number;
  overloaded: boolean;
}

export function AssignmentBalanceChart({
  pools,
  isLoading,
  isError,
  delay = 0,
  overloadMultiplier = 20,
}: AssignmentBalanceChartProps) {
  const rows = useMemo<Row[]>(() => {
    const src = pools ?? [];
    return src
      .map((p) => {
        const clients = p.client_count ?? 0;
        const capacity = p.member_count * overloadMultiplier;
        return {
          pool: p.name,
          clients,
          capacity,
          overloaded: capacity > 0 && clients > capacity,
        };
      })
      .sort((a, b) => b.clients - a.clients);
  }, [pools, overloadMultiplier]);

  const isEmpty = !isLoading && !isError && rows.length === 0;
  const overloadedCount = rows.filter((r) => r.overloaded).length;
  const height = Math.max(rows.length * 40 + 48, 220);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Assignment balance</h3>
            <p className="text-xs text-text-dim">
              Clients routed through each helper group. Rows turn red when clients exceed{' '}
              {overloadMultiplier}× the helper group's helper inbox count.
            </p>
          </div>
          {overloadedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[11px] font-medium text-accent3">
              <AlertTriangle className="h-3 w-3" />
              {overloadedCount} overloaded
            </span>
          ) : null}
        </div>
        <div style={{ height }}>
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load balance"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No helper groups yet"
              description="Balance will appear once helper groups exist with routed clients."
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  stroke={chartTheme.grid.stroke}
                  strokeDasharray={chartTheme.grid.strokeDasharray}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="pool"
                  tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
                  axisLine={{ stroke: chartTheme.colors.border }}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
                  content={
                    <ChartTooltip
                      valueFormatter={(v, name) => {
                        if (name === 'Clients' || name === 'clients') {
                          return `${Number(v ?? 0).toLocaleString()} clients`;
                        }
                        return String(v ?? '');
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="clients"
                  name="Clients"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={22}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.pool}
                      fill={
                        row.overloaded ? chartTheme.colors.danger : chartTheme.colors.primary
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
