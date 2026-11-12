import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Filter, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import type { AuditFilters, AuditLogEntry } from '@/features/admin/types';
import { useAdminAuditLog } from './api';

const PAGE_SIZE = 25;

interface DraftFilters {
  actor_email: string;
  action: string;
  target_type: string;
  date_from: string;
  date_to: string;
}

const EMPTY_DRAFT: DraftFilters = {
  actor_email: '',
  action: '',
  target_type: '',
  date_from: '',
  date_to: '',
};

function toApiFilters(draft: DraftFilters, page: number): AuditFilters {
  const out: AuditFilters = { page, page_size: PAGE_SIZE };
  if (draft.actor_email.trim()) out.actor_email = draft.actor_email.trim();
  if (draft.action.trim()) out.action = draft.action.trim();
  if (draft.target_type.trim()) out.target_type = draft.target_type.trim();
  if (draft.date_from) out.date_from = draft.date_from;
  if (draft.date_to) out.date_to = draft.date_to;
  return out;
}

function roleVariant(role: AuditLogEntry['actor_role']): BadgeVariant {
  if (role === 'super_admin') return 'orange';
  if (role === 'system') return 'blue';
  return 'neutral';
}

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface AuditLogTableProps {
  delay?: number;
}

/**
 * Paginated, filterable audit log viewer.
 * Self-contained — owns its own filter and pagination state.
 */
export function AuditLogTable({ delay = 0.05 }: AuditLogTableProps) {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_DRAFT);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const query = useAdminAuditLog(toApiFilters(applied, page));
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveFilters = useMemo(
    () => Object.values(applied).some((v) => typeof v === 'string' && v.trim() !== ''),
    [applied],
  );

  const update = (patch: Partial<DraftFilters>) => setDraft((p) => ({ ...p, ...patch }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  const onReset = () => {
    setDraft(EMPTY_DRAFT);
    setApplied(EMPTY_DRAFT);
    setPage(1);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <form onSubmit={onSubmit} className="border-b border-border-muted p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="audit-actor" className="text-xs text-text-dim">Actor email</Label>
              <Input
                id="audit-actor"
                value={draft.actor_email}
                onChange={(e) => update({ actor_email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label htmlFor="audit-action" className="text-xs text-text-dim">Action</Label>
              <Input
                id="audit-action"
                value={draft.action}
                onChange={(e) => update({ action: e.target.value })}
                placeholder="user.impersonate"
              />
            </div>
            <div>
              <Label htmlFor="audit-target" className="text-xs text-text-dim">Target type</Label>
              <Input
                id="audit-target"
                value={draft.target_type}
                onChange={(e) => update({ target_type: e.target.value })}
                placeholder="mailbox / plan / peer_inbox"
              />
            </div>
            <div>
              <Label htmlFor="audit-from" className="text-xs text-text-dim">From</Label>
              <Input
                id="audit-from"
                type="date"
                value={draft.date_from}
                onChange={(e) => update({ date_from: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="audit-to" className="text-xs text-text-dim">To</Label>
              <Input
                id="audit-to"
                type="date"
                value={draft.date_to}
                onChange={(e) => update({ date_to: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReset}
                leftIcon={<RotateCcw className="h-4 w-4" />}
              >
                Reset
              </Button>
            ) : null}
            <Button type="submit" variant="primary" size="sm" leftIcon={<Filter className="h-4 w-4" />}>
              Apply filters
            </Button>
          </div>
        </form>

        {query.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-5">
            <EmptyState title="Couldn't load audit log" description="Refresh to try again." />
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No audit events match"
              description={
                hasActiveFilters
                  ? 'Try broadening the filters or clearing them to see all activity.'
                  : 'Admin and system actions will appear here as they happen.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-2/50 text-left">
                <tr>
                  <th scope="col" className="w-8 px-2 py-3" />
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">When</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">Actor</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">Action</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">Target</th>
                  <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {items.map((row) => {
                  const isOpen = expanded.has(row.id);
                  const hasPayload = !!row.metadata && Object.keys(row.metadata).length > 0;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-surface-2/50',
                          isOpen && 'bg-surface-2/30',
                        )}
                        onClick={() => toggleExpanded(row.id)}
                      >
                        <td className="px-2 py-3 align-top">
                          <button
                            type="button"
                            aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                            className="flex h-6 w-6 items-center justify-center rounded text-text-dim hover:text-text focus-ring"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(row.id);
                            }}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-text-dim">
                          {fmtTimestamp(
                            row.timestamp ??
                            (row as unknown as { created_at?: string }).created_at,
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant={roleVariant(row.actor_role)}>{row.actor_role}</Badge>
                            <span className="text-xs text-text-dim">{row.actor_email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text">{row.action}</td>
                        <td className="px-4 py-3 text-xs text-text-dim">
                          <div className="flex flex-col">
                            <span className="text-text">{row.target_type}</span>
                            {row.target_id ? (
                              <span className="font-mono text-[11px] text-text-dim">
                                {row.target_id}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-dim">
                          {row.ip ?? '—'}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-surface-2/20">
                          <td />
                          <td colSpan={5} className="px-4 py-3">
                            {hasPayload ? (
                              <pre className="max-h-80 overflow-auto rounded-md border border-border-muted bg-bg/60 p-3 font-mono text-[11px] leading-relaxed text-text">
                                {safeJson(row.metadata)}
                              </pre>
                            ) : (
                              <p className="text-xs text-text-dim">No payload recorded.</p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!query.isLoading && !query.isError && items.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border-muted px-4 py-3 text-xs text-text-dim">
            <span className="tabular-nums">
              Page {page} of {pageCount} · {total.toLocaleString()} event{total === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= pageCount || query.isFetching}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </motion.div>
  );
}
