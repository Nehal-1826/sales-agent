/**
 * Pool-routing feature hooks.
 *
 * Re-exports the low-level admin hooks and composes `usePoolRouting()` which
 * returns everything the page needs in a single object: the list of pools,
 * current client→pool assignments, unassigned clients, the Sankey flow data,
 * a unified `clients` list (assigned + unassigned, normalised), plus the
 * imperative `assign`/`revert` mutations.
 */
import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  ADMIN_KEYS,
  useAdminPeerPools,
  useAdminPoolRouting,
  useAssignPool,
  useCreatePool,
  useDeletePool,
  useDeleteUser,
  useRevertPool,
  useSankeyData,
  useUnassignedClients,
  useUpdatePool,
} from '@/features/admin/api';
import { api } from '@/lib/api';
import type {
  PoolAssignmentOut,
  PoolOut,
  RoutingMailbox,
  SankeyData,
  UnassignedClient,
} from '@/features/admin/types';

export {
  useAdminPeerPools,
  useAdminPoolRouting,
  useAssignPool,
  useCreatePool,
  useDeletePool,
  useDeleteUser,
  useRevertPool,
  useSankeyData,
  useUnassignedClients,
  useUpdatePool,
};

/**
 * Normalised client record used by the assignment matrix. Either a real
 * routing row (populated `pool_id`) or an unassigned client (null pool).
 */
export interface RoutingClient {
  // Workspace id — used as the routing key for assign/revert mutations.
  user_id: string;
  // Actual User PK — used for DELETE /admin/users/:id. Optional because the
  // backend only started shipping it recently; legacy assignment rows may
  // still arrive without it.
  user_pk: string | null;
  email: string;
  plan: string;
  mailbox_count: number;
  pool_id: string | null;
  pool_name: string | null;
  assignment_id?: string | null;
  assigned_at?: string | null;
  sends_last_30d?: number;
}

export interface PoolRoutingBundle {
  pools: PoolOut[];
  assignments: PoolAssignmentOut[];
  unassigned: UnassignedClient[];
  clients: RoutingClient[];
  sankey: SankeyData;
}

export interface UsePoolRoutingResult {
  data: PoolRoutingBundle | undefined;
  isLoading: boolean;
  isError: boolean;
  assign: ReturnType<typeof useAssignPool>;
  revert: ReturnType<typeof useRevertPool>;
}

export function usePoolRouting(): UsePoolRoutingResult {
  const poolsQ = useAdminPeerPools();
  const routingQ = useAdminPoolRouting();
  const unassignedQ = useUnassignedClients();
  const sankeyQ = useSankeyData();
  const assign = useAssignPool();
  const revert = useRevertPool();

  const isLoading =
    poolsQ.isLoading || routingQ.isLoading || unassignedQ.isLoading || sankeyQ.isLoading;
  const isError =
    poolsQ.isError || routingQ.isError || unassignedQ.isError || sankeyQ.isError;

  const data = useMemo<PoolRoutingBundle | undefined>(() => {
    if (!poolsQ.data || !routingQ.data || !unassignedQ.data || !sankeyQ.data) return undefined;
    const assignments = routingQ.data;
    const unassigned = unassignedQ.data;

    // Build a unified `clients` list: assigned rows get pool info, unassigned
    // rows pass through with null pool fields.
    const assignedClients: RoutingClient[] = assignments.map((a) => ({
      // Routing key is the workspace_id; the User PK is sent separately as
      // `user_id` (kept on `user_pk` to avoid clashing with the workspace_id
      // we expose as `user_id` for legacy reasons).
      user_id: a.workspace_id ?? '',
      user_pk: a.user_id ?? null,
      email: a.client_email ?? a.user_email ?? '',
      plan: a.client_plan ?? '',
      mailbox_count: 0,
      pool_id: a.pool_id,
      pool_name: a.pool_name,
      assignment_id: a.id,
      assigned_at: a.assigned_at,
      sends_last_30d: a.sends_last_30d,
    }));

    const unassignedClients: RoutingClient[] = unassigned.map((u) => ({
      user_id: u.workspace_id ?? '',
      user_pk: u.user_id ?? null,
      email: u.email,
      plan: u.plan ?? '',
      mailbox_count: u.mailbox_count ?? 0,
      pool_id: null,
      pool_name: null,
    }));

    // Dedupe by user_id (assigned wins if both present).
    const seen = new Set<string>();
    const clients: RoutingClient[] = [];
    for (const c of [...assignedClients, ...unassignedClients]) {
      if (seen.has(c.user_id)) continue;
      seen.add(c.user_id);
      clients.push(c);
    }

    return {
      pools: poolsQ.data,
      assignments,
      unassigned,
      clients,
      sankey: sankeyQ.data,
    };
  }, [poolsQ.data, routingQ.data, unassignedQ.data, sankeyQ.data]);

  return {
    data,
    isLoading,
    isError,
    assign,
    revert,
  };
}

/**
 * Per-mailbox routing list. Each row carries the mailbox's own pin (`pool_id`,
 * null = inherit workspace) and the resolved `effective_pool_id` (pin >
 * workspace > default). Joined to a workspace via `workspace_id`, which equals
 * the normalised `RoutingClient.user_id`.
 */
export function useRoutingMailboxes(): UseQueryResult<RoutingMailbox[]> {
  return useQuery({
    queryKey: ADMIN_KEYS.poolMailboxes,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await api.get<{ items: RoutingMailbox[] }>(
        '/admin/pool-routing/mailboxes',
      );
      return data.items ?? [];
    },
  });
}

/**
 * Pin (or unpin, with `pool_id: null`) a single mailbox to a peer pool.
 * Invalidates both the mailbox list and the workspace-level pool-routing key so
 * derived counts refresh.
 */
export function useAssignMailboxPool(): UseMutationResult<
  RoutingMailbox,
  unknown,
  { mailbox_id: string; pool_id: string | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailbox_id, pool_id }) => {
      const { data } = await api.post<RoutingMailbox>(
        `/admin/pool-routing/mailboxes/${mailbox_id}`,
        { pool_id },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolMailboxes });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolRouting });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.poolUnassigned });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.sankey });
    },
  });
}
