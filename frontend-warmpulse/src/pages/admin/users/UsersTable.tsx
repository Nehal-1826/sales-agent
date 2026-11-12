import { useMemo, useState } from 'react';
import { MoreHorizontal, UserX, LogIn, Eye, Trash2 } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SparklineWp } from '@/components/charts';
import {
  AppDropdown,
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownTrigger,
} from '@/components/ui/AppDropdown';
import type { AdminUserRow } from '@/features/admin/types';

interface UsersTableProps {
  rows: AdminUserRow[];
  loading?: boolean;
  onOpenDetail: (row: AdminUserRow) => void;
  onImpersonate: (row: AdminUserRow) => void;
  onToggleSuspend: (row: AdminUserRow) => void;
  onDelete: (row: AdminUserRow) => void;
}

function statusVariant(s: AdminUserRow['status']): BadgeVariant {
  if (s === 'active') return 'green';
  if (s === 'suspended') return 'orange';
  return 'yellow';
}

export function UsersTable({
  rows,
  loading,
  onOpenDetail,
  onImpersonate,
  onToggleSuspend,
  onDelete,
}: UsersTableProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.plan ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border-muted p-4">
        <div>
          <h3 className="text-sm font-semibold text-text">Clients</h3>
          <p className="text-xs text-text-dim">Search, impersonate, or suspend workspaces.</p>
        </div>
        <Input
          placeholder="Search by email, name, or plan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No clients to display"
            description="The users endpoint returns no rows yet or your filter matched nothing."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-text-dim">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Mailboxes</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Warmth 30d</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border-muted hover:bg-surface-2/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{r.email}</div>
                    {r.name ? <div className="text-xs text-text-dim">{r.name}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-text-dim">{r.plan}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-dim">{r.mailbox_count}</td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(r.joined_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.warmth_sparkline?.length ? (
                      <div style={{ width: 96 }}>
                        <SparklineWp
                          data={r.warmth_sparkline.map((v) => ({ value: v }))}
                          yKey="value"
                          height={24}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-text-dim">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AppDropdown>
                      <AppDropdownTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </AppDropdownTrigger>
                      <AppDropdownContent align="end">
                        <AppDropdownItem onSelect={() => onOpenDetail(r)}>
                          <Eye className="mr-2 h-4 w-4" /> View details
                        </AppDropdownItem>
                        {r.role !== 'super_admin' && (
                          <AppDropdownItem onSelect={() => onImpersonate(r)}>
                            <LogIn className="mr-2 h-4 w-4" /> Impersonate
                          </AppDropdownItem>
                        )}
                        <AppDropdownItem danger onSelect={() => onToggleSuspend(r)}>
                          <UserX className="mr-2 h-4 w-4" />
                          {r.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                        </AppDropdownItem>
                        <AppDropdownItem danger onSelect={() => onDelete(r)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete user
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
    </Card>
  );
}
