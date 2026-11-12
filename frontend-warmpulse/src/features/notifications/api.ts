/**
 * Notifications inbox hooks (Round 6).
 *
 * Backed by ``/api/workspace/notifications-inbox``. The bell badge polls
 * ``unread`` every 60s; the inbox page reads ``items`` directly.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface InboxResponse {
  items: InboxNotification[];
  unread: number;
}

export const NOTIFICATIONS_KEY = ['notifications', 'inbox'] as const;

export function useNotificationsInbox(opts?: {
  onlyUnread?: boolean;
  pollMs?: number;
}): UseQueryResult<InboxResponse> {
  const params = opts?.onlyUnread ? { unread: true } : undefined;
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, opts?.onlyUnread ?? false] as const,
    staleTime: 30_000,
    refetchInterval: opts?.pollMs,
    queryFn: async () => {
      const res = await api.get<InboxResponse>('/workspace/notifications-inbox', {
        params,
      });
      return res.data;
    },
  });
}

export function useMarkNotificationRead(): UseMutationResult<
  InboxNotification,
  unknown,
  string
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/workspace/notifications-inbox/${id}/read`);
      return res.data as InboxNotification;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllNotificationsRead(): UseMutationResult<
  { marked: number },
  unknown,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/workspace/notifications-inbox/read-all');
      return res.data as { marked: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
