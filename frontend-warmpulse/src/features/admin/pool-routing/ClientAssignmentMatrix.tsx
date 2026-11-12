import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import type { PoolOut } from '@/features/admin/types';
import {
  useAssignPool,
  useDeleteUser,
  useRevertPool,
  type RoutingClient,
} from './api';

interface ClientAssignmentMatrixProps {
  pools: PoolOut[] | undefined;
  clients: RoutingClient[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  delay?: number;
}

export function ClientAssignmentMatrix({
  pools,
  clients,
  isLoading,
  isError,
  delay = 0,
}: ClientAssignmentMatrixProps) {
  const [query, setQuery] = useState('');
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const assign = useAssignPool();
  const revert = useRevertPool();
  const deleteUser = useDeleteUser();

  const refreshing =
    queryClient.isFetching({ queryKey: ['admin', 'pool-routing'] }) > 0;
  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'pool-routing'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const runDeleteUser = async (client: RoutingClient) => {
    if (!client.user_pk) {
      toast.error('Missing user id — refresh and try again.');
      return;
    }
    const ok = await confirm({
      title: `Remove ${client.email}?`,
      description:
        "This deletes the user account and cascades their mailboxes, warmup logs, and helper-group assignment. This can't be undone.",
      confirmLabel: 'Delete user',
      danger: true,
    });
    if (!ok) return;
    setPendingCell(`${client.user_id}:delete`);
    deleteUser.mutate(client.user_pk, {
      onSuccess: () => {
        toast.success(`Removed ${client.email}`);
        setPendingCell(null);
      },
      onError: () => {
        toast.error('Failed to remove user');
        setPendingCell(null);
      },
    });
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = clients ?? [];
    if (!needle) return source;
    return source.filter(
      (c) =>
        c.email.toLowerCase().includes(needle) ||
        c.plan.toLowerCase().includes(needle) ||
        (c.pool_name ?? '').toLowerCase().includes(needle),
    );
  }, [clients, query]);

  const assigned = filtered.filter((c) => c.pool_id !== null);
  const unassigned = filtered.filter((c) => c.pool_id === null);

  const runAssign = (client: RoutingClient, poolId: string) => {
    const cellKey = `${client.user_id}:${poolId}`;
    setPendingCell(cellKey);
    assign.mutate(
      { user_id: client.user_id, pool_id: poolId },
      {
        onSuccess: () => {
          toast.success(`Routed ${client.email}`);
          setPendingCell(null);
        },
        onError: () => {
          toast.error('Failed to assign helper group');
          setPendingCell(null);
        },
      },
    );
  };

  const runRevert = (client: RoutingClient) => {
    setPendingCell(`${client.user_id}:revert`);
    revert.mutate(client.user_id, {
      onSuccess: () => {
        toast.success(`Unrouted ${client.email}`);
        setPendingCell(null);
      },
      onError: () => {
        toast.error('Failed to revert');
        setPendingCell(null);
      },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border-muted p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text">Client → helper group assignment</h3>
            <p className="text-xs text-text-dim">
              Each client is routed through exactly one helper group. Click a cell to reassign, or use
              the quick-assign button for unassigned clients.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by email, plan, or helper group"
                className="pl-9"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              leftIcon={
                refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )
              }
              aria-label="Refresh client list"
            >
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Couldn't load routing" description="Refresh to try again." />
          </div>
        ) : !pools || pools.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No helper groups configured"
              description="Create a helper group before routing any clients."
            />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            {assigned.length === 0 ? null : (
              <div className="overflow-x-auto rounded-lg border border-border-muted">
                <table className="w-full" role="table">
                  <thead className="bg-surface-2/50 text-left">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 bg-surface-2/80 px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                        Client
                      </th>
                      {pools.map((pool) => (
                        <th
                          key={pool.id}
                          scope="col"
                          className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-dim"
                        >
                          {pool.name}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-dim">
                        Revert
                      </th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-dim">
                        Remove
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-muted">
                    {assigned.map((client) => (
                      <tr key={client.user_id || client.email} className="transition-colors hover:bg-surface-2/30">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-3">
                          <div className="flex flex-col">
                            <span className="truncate text-sm font-medium text-text">
                              {client.email}
                            </span>
                            <span className="truncate text-[11px] text-text-dim">
                              {client.pool_name ?? '—'}
                              {client.sends_last_30d !== undefined
                                ? ` · ${client.sends_last_30d.toLocaleString()} sends / 30d`
                                : ''}
                            </span>
                          </div>
                        </td>
                        {pools.map((pool) => {
                          const isActive = client.pool_id === pool.id;
                          const cellKey = `${client.user_id}:${pool.id}`;
                          const pending = pendingCell === cellKey;
                          return (
                            <td key={pool.id} className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => !isActive && !pending && runAssign(client, pool.id)}
                                disabled={isActive || pending}
                                className={cn(
                                  'inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus-ring',
                                  isActive
                                    ? 'border-accent bg-accent/15 text-accent'
                                    : 'border-border-muted text-text-dim hover:bg-surface-2 hover:text-text',
                                  pending && 'opacity-60',
                                )}
                                aria-label={
                                  isActive
                                    ? `${client.email} is routed through ${pool.name}`
                                    : `Route ${client.email} through ${pool.name}`
                                }
                              >
                                {pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : isActive ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-right">
                          {(() => {
                            // Revert = "go back to the default pool". Hide
                            // it (show a subtle "Default" badge instead)
                            // when the client is already there — clicking
                            // it would just delete + re-create the same
                            // assignment row.
                            const defaultPool = pools.find((p) => p.is_default);
                            const isOnDefault =
                              defaultPool != null && client.pool_id === defaultPool.id;
                            if (isOnDefault) {
                              return (
                                <span
                                  className="inline-flex items-center rounded-md border border-border-muted bg-surface-2/40 px-2 py-1 text-xs text-text-dim"
                                  title="Already routed through the default helper group"
                                >
                                  Default
                                </span>
                              );
                            }
                            const reverting =
                              pendingCell === `${client.user_id}:revert`;
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => runRevert(client)}
                                disabled={reverting}
                                leftIcon={
                                  reverting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )
                                }
                              >
                                Revert
                              </Button>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {(() => {
                            const deleting =
                              pendingCell === `${client.user_id}:delete`;
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => runDeleteUser(client)}
                                disabled={deleting || !client.user_pk}
                                title={
                                  client.user_pk
                                    ? undefined
                                    : 'Refresh — missing user id'
                                }
                                leftIcon={
                                  deleting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )
                                }
                              >
                                Remove
                              </Button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <UnassignedSection
              clients={unassigned}
              pools={pools}
              onAssign={runAssign}
              onRemove={runDeleteUser}
              pendingCell={pendingCell}
            />

            {assigned.length === 0 && unassigned.length === 0 ? (
              <EmptyState
                title="No clients match"
                description="Adjust the filter or wait for client activity to stream in."
              />
            ) : null}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Unassigned clients list
// ---------------------------------------------------------------------------

interface UnassignedSectionProps {
  clients: RoutingClient[];
  pools: PoolOut[];
  onAssign: (client: RoutingClient, poolId: string) => void;
  onRemove: (client: RoutingClient) => void;
  pendingCell: string | null;
}

function UnassignedSection({
  clients,
  pools,
  onAssign,
  onRemove,
  pendingCell,
}: UnassignedSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (clients.length === 0) return null;

  const pickPool = (clientId: string, poolId: string) =>
    setDrafts((prev) => ({ ...prev, [clientId]: poolId }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">Unassigned clients</h4>
        <span className="text-xs text-text-dim">
          {clients.length.toLocaleString()} waiting for routing
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border-muted">
        <table className="w-full" role="table">
          <thead className="bg-surface-2/50 text-left">
            <tr>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                Client
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                Plan
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim text-right">
                Mailboxes
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-dim">
                Helper group
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Assign</span>
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {clients.map((client) => {
              const draft = drafts[client.user_id] ?? pools[0]?.id ?? '';
              const pending = pendingCell === `${client.user_id}:${draft}`;
              return (
                <tr key={client.user_id || client.email} className="transition-colors hover:bg-surface-2/30">
                  <td className="px-4 py-3 text-sm font-medium text-text">{client.email}</td>
                  <td className="px-4 py-3 text-xs text-text-dim">{client.plan || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-text-dim">
                    {client.mailbox_count}
                  </td>
                  <td className="px-4 py-3">
                    <AppSelect
                      value={draft}
                      onValueChange={(v) => pickPool(client.user_id, v)}
                    >
                      <AppSelectTrigger>
                        <AppSelectValue placeholder="Pick helper group" />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {pools.map((pool) => (
                          <AppSelectItem key={pool.id} value={pool.id}>
                            {pool.name}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      onClick={() => draft && onAssign(client, draft)}
                      disabled={pending || !draft}
                      rightIcon={
                        pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      Assign
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const deleting =
                        pendingCell === `${client.user_id}:delete`;
                      return (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(client)}
                          disabled={deleting || !client.user_pk}
                          title={
                            client.user_pk
                              ? undefined
                              : 'Refresh — missing user id'
                          }
                          leftIcon={
                            deleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          Remove
                        </Button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
