import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import type { LlmUsageRow } from './api';

interface UsageByWorkspaceTableProps {
  rows: LlmUsageRow[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

type SortField = 'workspace' | 'tokens_mtd' | 'cost_mtd' | 'pct';
type SortDir = 'asc' | 'desc';

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function computePct(r: LlmUsageRow): number {
  if (r.pct_of_cap !== undefined && r.pct_of_cap !== null) return r.pct_of_cap;
  if (r.cap_tokens && r.cap_tokens > 0) {
    return Math.min(999, (r.tokens_mtd / r.cap_tokens) * 100);
  }
  return 0;
}

function pctTone(pct: number): {
  bar: string;
  text: string;
} {
  if (pct >= 85) return { bar: 'bg-accent3', text: 'text-accent3' };
  if (pct >= 60) return { bar: 'bg-accent4', text: 'text-accent4' };
  return { bar: 'bg-accent', text: 'text-accent' };
}

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

function CapProgress({ pct, hasCap }: { pct: number; hasCap: boolean }) {
  const tone = pctTone(pct);
  const display = Math.min(pct, 100);
  const pctLabel = hasCap ? `${Math.round(pct)}%` : 'no cap';
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={display}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Used ${pctLabel} of monthly cap`}
    >
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${display}%` }} />
      </div>
      <span className={cn('w-14 text-right text-xs tabular-nums', hasCap ? tone.text : 'text-text-dim')}>
        {pctLabel}
      </span>
    </div>
  );
}

export function UsageByWorkspaceTable({
  rows,
  isLoading = false,
  isError = false,
  delay = 0,
}: UsageByWorkspaceTableProps) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: 'tokens_mtd',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    const copy = [...(rows ?? [])];
    copy.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.field) {
        case 'workspace': {
          const aw = (a.workspace_name ?? a.user_email ?? '').toLowerCase();
          const bw = (b.workspace_name ?? b.user_email ?? '').toLowerCase();
          return aw.localeCompare(bw) * dir;
        }
        case 'tokens_mtd':
          return (a.tokens_mtd - b.tokens_mtd) * dir;
        case 'cost_mtd':
          return (a.cost_mtd_usd - b.cost_mtd_usd) * dir;
        case 'pct':
          return (computePct(a) - computePct(b)) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sort]);

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'workspace' ? 'asc' : 'desc' },
    );
  };

  const col = (field: SortField, label: string, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 text-xs font-medium uppercase tracking-wider text-text-dim hover:text-text focus-ring',
        align === 'right' && 'flex-row-reverse',
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
            <h3 className="text-base font-semibold text-text">Usage by workspace</h3>
            <p className="text-xs text-text-dim">
               tokens and USD spend per workspace this month.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState
              title="Couldn't load workspace usage"
              description="Refresh to retry."
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No workspace usage yet"
              description="Once customers start generating content, per-workspace usage will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3">{col('workspace', 'Workspace')}</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">{col('tokens_mtd', 'Tokens MTD', 'right')}</th>
                  <th scope="col" className="px-4 py-3 text-right">{col('cost_mtd', 'Cost MTD', 'right')}</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-dim">
                    Cap
                  </th>
                  <th scope="col" className="px-4 py-3">{col('pct', '% used')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {sorted.map((r) => {
                  const pct = computePct(r);
                  const hasCap = !!r.cap_tokens && r.cap_tokens > 0;
                  return (
                    <tr
                      key={r.user_id}
                      className={cn(
                        'transition-colors hover:bg-surface-2/50',
                        pct >= 85 && 'bg-accent3/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-text">
                            {r.workspace_name ?? r.user_email}
                          </span>
                          {r.workspace_name ? (
                            <span className="font-mono text-[11px] text-text-dim">
                              {r.user_email}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{r.plan}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text">
                        {fmtInt(r.tokens_mtd)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text">
                        {fmtUsd(r.cost_mtd_usd)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text-dim">
                        {hasCap ? fmtInt(r.cap_tokens ?? 0) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <CapProgress pct={pct} hasCap={hasCap} />
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
