import { motion } from 'framer-motion';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { chartTheme, paletteAt } from '@/components/charts/theme';
import type { ProviderBreakdownSlice } from './api';

interface ProviderBreakdownChartProps {
  data: ProviderBreakdownSlice[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  google_workspace: 'Google Workspace',
  gmail: 'Gmail',
  outlook: 'Outlook',
  office365: 'Office 365',
  yahoo: 'Yahoo',
  imap: 'IMAP',
};

function labelFor(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * Donut breakdown of mailboxes by provider. Highlights the pool diversity
 * which is a moat metric — ESPs care about cross-provider engagement.
 */
export function ProviderBreakdownChart({
  data,
  isLoading,
  isError,
  delay = 0,
}: ProviderBreakdownChartProps) {
  const rows = (data ?? []).filter((d) => d.count > 0);
  const isEmpty = !isLoading && !isError && rows.length === 0;
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Provider breakdown</h3>
            <p className="text-xs text-text-dim">Mailbox distribution across email providers.</p>
          </div>
        </div>
        <div className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : isError ? (
            <EmptyState
              title="Couldn't load providers"
              description="Refresh to try again."
              className="py-10"
            />
          ) : isEmpty ? (
            <EmptyState
              title="No providers connected"
              description="Connect your first mailbox to see the provider mix."
              className="py-10"
            />
          ) : (
            <div className="relative h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={(v) => {
                          const n = Number(v);
                          const pct = total > 0 ? ` (${Math.round((n / total) * 100)}%)` : '';
                          return `${n}${pct}`;
                        }}
                      />
                    }
                  />
                  <Pie
                    data={rows}
                    dataKey="count"
                    nameKey="provider"
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive
                  >
                    {rows.map((r, i) => (
                      <Cell key={r.provider} fill={paletteAt(i)} name={labelFor(r.provider)} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => labelFor(String(value))}
                    wrapperStyle={{
                      color: chartTheme.colors.muted,
                      fontSize: chartTheme.font.sizeSm,
                      paddingTop: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ top: -12 }}>
                <span
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color: chartTheme.colors.text }}
                >
                  {total}
                </span>
                <span className="text-xs" style={{ color: chartTheme.colors.muted }}>
                  mailboxes
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
