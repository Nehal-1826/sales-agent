import { useState } from 'react';
import { MoreHorizontal, Shuffle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import type { PoolAssignmentOut } from '@/features/admin/types';

interface PoolRoutingTableProps {
  rows: PoolAssignmentOut[];
  loading?: boolean;
  onAssign: (row: PoolAssignmentOut) => void;
  onRevert: (row: PoolAssignmentOut) => void;
}

export function PoolRoutingTable({ rows, loading, onAssign, onRevert }: PoolRoutingTableProps) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-muted p-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Client → Account group assignments</h3>
          <p className="text-xs text-text-dim">{rows.length} assignments</p>
        </div>
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : paged.length === 0 ? (
        <EmptyState
          title="No assignments yet"
          description="Clients will appear here after they are assigned to a account group."
        />
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-text-dim">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Account group</th>
              <th className="px-4 py-2 font-medium">Sends (30d)</th>
              <th className="px-4 py-2 font-medium">Assigned</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border-muted hover:bg-surface-2/40 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-text">{r.user_email}</td>
                <td className="px-4 py-3">
                  <Badge variant="blue">{r.pool_name}</Badge>
                </td>
                <td className="px-4 py-3 text-text-dim">
                  {(r.sends_last_30d ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-text-dim">
                  {r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <AppDropdown>
                    <AppDropdownTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </AppDropdownTrigger>
                    <AppDropdownContent align="end">
                      <AppDropdownItem onSelect={() => onAssign(r)}>
                        <Shuffle className="mr-2 h-4 w-4" /> Reassign
                      </AppDropdownItem>
                      <AppDropdownItem onSelect={() => onRevert(r)}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Revert
                      </AppDropdownItem>
                    </AppDropdownContent>
                  </AppDropdown>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {rows.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border-muted p-3 text-xs text-text-dim">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
