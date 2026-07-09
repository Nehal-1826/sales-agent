import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { warmthColor } from '@/components/charts/theme';
import { cn } from '@/lib/cn';
import type { TopClient } from '@/features/admin/types';

interface TopWorkspacesTableProps {
  rows: TopClient[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

type SortField = 'workspace' | 'send_volume' | 'avg_warmth' | 'mailbox_count' | 'plan';
type SortDir = 'asc' | 'desc';

function SortIcon({
  field,
  active,
  dir,
}: {
  field: SortField;
  active: SortField;
  dir: SortDir;
}) {
  if (active !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
  return dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function WarmthPill({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: warmthColor(pct) }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-text-dim">
        {Math.round(pct)}
      </span>
    </div>
  );
}

/**
 * Sortable leaderboard of top workspaces by send volume, warmth, or mailbox
 * count. Follows the same interaction pattern as MailboxListTable.
 */
export function TopWorkspacesTable({
  rows,
  isLoading,
  isError,
  delay = 0,
}: TopWorkspacesTableProps) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: 'send_volume',
    dir: 'desc',
  });

  const data = rows ?? [];

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.field) {
        case 'workspace':
          return (a.workspace_name ?? a.email).localeCompare(b.workspace_name ?? b.email) * dir;
        case 'plan':
          return a.plan.localeCompare(b.plan) * dir;
        case 'send_volume':
          return (a.send_volume - b.send_volume) * dir;
        case 'avg_warmth':
          return (a.avg_warmth - b.avg_warmth) * dir;
        case 'mailbox_count':
          return (a.mailbox_count - b.mailbox_count) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [data, sort]);

  const toggleSort = (field: SortField) =>
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'workspace' || field === 'plan' ? 'asc' : 'desc' },
    );

  const col = (field: SortField, label: string, alignRight = false) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 text-xs font-medium uppercase tracking-wider',
        'text-text-dim hover:text-text focus-ring',
        alignRight && 'flex-row-reverse',
      )}
    >
      {label}
      <SortIcon field={field} active={sort.field} dir={sort.dir} />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Top workspaces</h3>
            <p className="text-xs text-text-dim">Leading clients by warmup send volume.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load workspaces"
              description="Refresh to try again."
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No workspaces yet"
              description="Top clients will appear here once warmup activity is recorded."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50">
                <tr className="text-left">
                  <th scope="col" className="px-4 py-3">{col('workspace', 'Workspace')}</th>
                  <th scope="col" className="px-4 py-3 text-right">{col('send_volume', 'Sends', true)}</th>
                  <th scope="col" className="px-4 py-3">{col('avg_warmth', 'Warmth')}</th>
                  <th scope="col" className="px-4 py-3 text-right">{col('mailbox_count', 'Mailboxes', true)}</th>
                  <th scope="col" className="px-4 py-3">{col('plan', 'Plan')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {sorted.map((r) => {
                  // Backend `/top-clients` returns `{user_id, email, plan_name, metric_value}`;
                  // older mock used `{workspace_name, send_volume, avg_warmth, mailbox_count, plan}`.
                  // Handle both.
                  const row = r as typeof r & {
                    email?: string;
                    plan_name?: string;
                    metric_value?: number;
                  };
                  const label = row.workspace_name?.trim() || row.email || row.user_id;
                  const volume = row.send_volume ?? row.metric_value ?? 0;
                  const warmth = row.avg_warmth ?? 0;
                  const mailboxCount = row.mailbox_count ?? 0;
                  const plan = row.plan ?? row.plan_name ?? '—';
                  return (
                    <tr key={row.user_id} className="transition-colors hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-text">{label}</span>
                          {row.workspace_name && row.email ? (
                            <span className="text-xs text-text-dim">{row.email}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">
                        {(typeof volume === 'number' ? volume : 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <WarmthPill value={warmth} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text-dim">
                        {mailboxCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="blue">{plan}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
