import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import type { PoolOut } from '@/features/admin/types';
import { useDeletePool, useUpdatePool } from './api';

interface PoolsTableProps {
  rows: PoolOut[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

function fmtDate(ts?: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return ts;
  }
}

export function PoolsTable({ rows, isLoading, isError, delay = 0 }: PoolsTableProps) {
  const [editing, setEditing] = useState<PoolOut | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PoolOut | null>(null);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay }}
      >
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-text">Helper groups</h3>
              <p className="text-xs text-text-dim">
                Curated sets of helper inboxes that clients are routed through during warmup.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-5">
              <EmptyState title="Couldn't load helper groups" description="Refresh to try again." />
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No helper groups yet"
                description="Helper groups will appear once the helper network seeder has run."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead className="bg-surface-2/50 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Name
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Description
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                      Members
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                      Assigned clients
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {rows.map((pool) => (
                    <tr key={pool.id} className="transition-colors hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-text">{pool.name}</span>
                          <span className="font-mono text-[11px] text-text-dim">{pool.id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-dim max-w-sm">
                        {pool.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text">
                        {pool.member_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-text-dim">
                        {(pool.client_count ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-dim">
                        {fmtDate(pool.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Pencil className="h-3.5 w-3.5" />}
                            onClick={() => setEditing(pool)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setConfirmDelete(pool)}
                            disabled={pool.is_default}
                            title={pool.is_default ? 'The default helper group cannot be deleted' : undefined}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      <EditPoolDialog pool={editing} onClose={() => setEditing(null)} />
      <DeletePoolDialog pool={confirmDelete} onClose={() => setConfirmDelete(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

function EditPoolDialog({ pool, onClose }: { pool: PoolOut | null; onClose: () => void }) {
  const open = pool !== null;
  const update = useUpdatePool();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Seed local state whenever a different pool opens.
  useEffect(() => {
    if (pool) {
      setName(pool.name);
      setDescription(pool.description ?? '');
    }
  }, [pool]);

  const handleClose = () => {
    if (update.isPending) return;
    onClose();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pool) return;
    update.mutate(
      { id: pool.id, payload: { name: name.trim(), description: description.trim() || undefined } },
      {
        onSuccess: () => {
          toast.success(`Updated ${name}`);
          handleClose();
        },
        onError: () => toast.error('Failed to update helper group'),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={(next) => (!next ? handleClose() : null)}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Edit helper group</AppDialogTitle>
          {pool ? (
            <AppDialogDescription>
              Update the display name or description for <span className="text-text">{pool.name}</span>.
            </AppDialogDescription>
          ) : null}
        </AppDialogHeader>
        <form onSubmit={onSubmit}>
          <AppDialogBody>
            <div>
              <Label htmlFor="pool-name">Name</Label>
              <Input
                id="pool-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pool-desc">Description</Label>
              <Textarea
                id="pool-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes this helper group distinct (region, vertical, trust tier)?"
              />
            </div>
          </AppDialogBody>
          <AppDialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || !name.trim()}
              leftIcon={update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

function DeletePoolDialog({ pool, onClose }: { pool: PoolOut | null; onClose: () => void }) {
  const open = pool !== null;
  const del = useDeletePool();

  const handleClose = () => {
    if (del.isPending) return;
    onClose();
  };

  const onConfirm = () => {
    if (!pool) return;
    del.mutate(pool.id, {
      onSuccess: () => {
        toast.success(`Deleted ${pool.name}`);
        handleClose();
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } }).response?.status;
        const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
        if (status === 409) {
          const msg =
            typeof detail === 'string'
              ? detail
              : pool.is_default
                ? 'The default helper group cannot be deleted.'
                : 'This helper group has client assignments. Reassign them first.';
          toast.error(msg);
        } else {
          toast.error('Failed to delete helper group');
        }
      },
    });
  };

  return (
    <AppDialog open={open} onOpenChange={(next) => (!next ? handleClose() : null)}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Delete helper group?</AppDialogTitle>
          {pool ? (
            <AppDialogDescription>
              This will remove <span className="text-text">{pool.name}</span> and detach all
              client assignments. Existing helper inboxes are not deleted.
            </AppDialogDescription>
          ) : null}
        </AppDialogHeader>
        <AppDialogBody>
          {pool ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border-muted bg-surface-2/40 p-3 text-xs">
              <div>
                <dt className="text-text-dim">Members</dt>
                <dd className="tabular-nums text-text">{pool.member_count}</dd>
              </div>
              <div>
                <dt className="text-text-dim">Assigned clients</dt>
                <dd className="tabular-nums text-text">{pool.client_count ?? 0}</dd>
              </div>
            </dl>
          ) : null}
        </AppDialogBody>
        <AppDialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={del.isPending}
            leftIcon={del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {del.isPending ? 'Deleting…' : 'Delete helper group'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
