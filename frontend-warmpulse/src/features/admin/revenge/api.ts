/**
 * Revenge Activity dashboard hooks (/admin/revenge).
 *
 * Read hooks are best-effort with empty defaults so the page renders "no data"
 * rather than throwing. Mutations invalidate the relevant caches on success.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import type {
  RevengeEvent,
  RevengeEventsResponse,
  RevengeKpis,
  RevengeRecipientsResponse,
  SabotagedUser,
} from './types';

const KEY = {
  kpis: ['admin', 'revenge', 'kpis'] as const,
  events: ['admin', 'revenge', 'events'] as const,
  sabotaged: ['admin', 'revenge', 'sabotaged'] as const,
};

export function useRevengeKpis(): UseQueryResult<RevengeKpis> {
  return useQuery({
    queryKey: KEY.kpis,
    queryFn: async () => {
      const res = await api.get<RevengeKpis>('/admin/revenge/kpis');
      return res.data;
    },
  });
}

export interface RevengeEventFilters {
  status?: string;
  trigger?: string;
  q?: string;
}

export function useRevengeEvents(
  filters: RevengeEventFilters = {},
): UseQueryResult<RevengeEventsResponse> {
  const { status, trigger, q } = filters;
  return useQuery({
    queryKey: [...KEY.events, status ?? '', trigger ?? '', q ?? ''],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await api.get<RevengeEventsResponse>('/admin/revenge/events', {
        params: {
          limit: 100,
          offset: 0,
          ...(status ? { status } : {}),
          ...(trigger ? { trigger } : {}),
          ...(q ? { q } : {}),
        },
      });
      return res.data;
    },
  });
}

export function useSabotagedUsers(): UseQueryResult<SabotagedUser[]> {
  return useQuery({
    queryKey: KEY.sabotaged,
    queryFn: async () => {
      const res = await api.get<SabotagedUser[]>('/admin/revenge/sabotaged');
      return res.data;
    },
  });
}

export function useRevengeRecipients(
  eventId: string,
  enabled: boolean,
): UseQueryResult<RevengeRecipientsResponse> {
  return useQuery({
    queryKey: ['admin', 'revenge', 'recipients', eventId],
    enabled,
    queryFn: async () => {
      const res = await api.get<RevengeRecipientsResponse>(
        `/admin/revenge/events/${eventId}/recipients`,
      );
      return res.data;
    },
  });
}

export function useRerunRevenge(): UseMutationResult<RevengeEvent, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await api.post<RevengeEvent>(
        `/admin/revenge/events/${eventId}/rerun`,
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success('Re-run queued');
      qc.invalidateQueries({ queryKey: KEY.events });
      qc.invalidateQueries({ queryKey: KEY.kpis });
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Re-run failed')),
  });
}

export function useUnsabotage(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/admin/users/${userId}/unsabotage`);
    },
    onSuccess: () => {
      toast.success('Sabotage cleared');
      qc.invalidateQueries({ queryKey: KEY.sabotaged });
      qc.invalidateQueries({ queryKey: KEY.kpis });
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to clear sabotage')),
  });
}
