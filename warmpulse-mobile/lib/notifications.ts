/**
 * In-app notification inbox — TanStack Query over the same endpoint the website
 * bell uses (`/api/workspace/notifications-inbox`). The list query polls every
 * 45s; a small bridge fires a LOCAL OS notification for any item that is newly
 * seen, so the user gets a real banner even while the app is open.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from './api';
import { presentLocal } from './push';

export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string | null;
};

export type InboxResponse = { items: InboxItem[]; unread: number };

const KEY = ['notifications-inbox'];

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => authFetch<InboxResponse>('/api/workspace/notifications-inbox?limit=50'),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.unread ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      authFetch(`/api/workspace/notifications-inbox/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authFetch('/api/workspace/notifications-inbox/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Bridge inbox → OS notifications. Mount once (in the app shell). On each poll,
 * any unread item whose id we haven't surfaced yet is presented as a local OS
 * notification. The first load only primes the "seen" set (so we don't blast a
 * banner for every historical item on launch).
 */
export function useLocalNotificationBridge() {
  const { data } = useNotifications();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const unreadItems = data.items.filter((i) => !i.read_at);
    if (seen.current === null) {
      // Prime on first load — don't replay history as banners.
      seen.current = new Set(data.items.map((i) => i.id));
      return;
    }
    for (const item of unreadItems) {
      if (!seen.current.has(item.id)) {
        seen.current.add(item.id);
        void presentLocal(item.title, item.body, { id: item.id, kind: item.kind });
      }
    }
    // Track read items too so they aren't re-fired if they flip back.
    for (const item of data.items) seen.current.add(item.id);
  }, [data]);
}
