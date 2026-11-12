import { useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, Wifi, Eye } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import type { PeerInboxOut } from '@/features/admin/types';

interface PeerInboxesTableProps {
  rows: PeerInboxOut[];
  loading?: boolean;
  onView: (row: PeerInboxOut) => void;
  onEdit: (row: PeerInboxOut) => void;
  onDelete: (row: PeerInboxOut) => void;
  onTest: (row: PeerInboxOut) => void;
}

function repVariant(score: number): BadgeVariant {
  if (score >= 80) return 'green';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'yellow';
  return 'orange';
}

export function PeerInboxesTable({
  rows,
  loading,
  onView,
  onEdit,
  onDelete,
  onTest,
}: PeerInboxesTableProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) => r.email.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border-muted p-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Test accounts</h3>
          <p className="text-xs text-text-dim">
            {filtered.length} inboxes · page {page} of {totalPages}
          </p>
        </div>
        <Input
          placeholder="Search by email or provider"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : paged.length === 0 ? (
          <EmptyState
            title="No test accounts"
            description="Add your first helper account to start serving warmup traffic."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-text-dim">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Daily limit</th>
                <th className="px-4 py-2 font-medium">Trust score</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border-muted hover:bg-surface-2/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-text">{r.email}</td>
                  <td className="px-4 py-3 text-text-dim">{r.provider}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.is_active ? 'green' : 'neutral'}>
                      {r.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {r.sends_today ?? 0} / {r.daily_capacity}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={repVariant(r.reputation_score)}>
                      {Math.round(r.reputation_score)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {r.last_used_at ? new Date(r.last_used_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AppDropdown>
                      <AppDropdownTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </AppDropdownTrigger>
                      <AppDropdownContent align="end">
                        <AppDropdownItem onSelect={() => onView(r)}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </AppDropdownItem>
                        <AppDropdownItem onSelect={() => onEdit(r)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit daily limit
                        </AppDropdownItem>
                        <AppDropdownItem onSelect={() => onTest(r)}>
                          <Wifi className="mr-2 h-4 w-4" /> Test connection
                        </AppDropdownItem>
                        <AppDropdownItem danger onSelect={() => onDelete(r)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </AppDropdownItem>
                      </AppDropdownContent>
                    </AppDropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border-muted p-3 text-xs text-text-dim">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
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
