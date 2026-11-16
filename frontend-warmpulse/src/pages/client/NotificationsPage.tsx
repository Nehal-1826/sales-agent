import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CreditCard,
  Mail,
  MailX,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInbox,
  type InboxNotification,
} from '@/features/notifications/api';
import { formatDate } from '@/lib/format';

/**
 * /app/notifications — list view + mark-as-read flow.
 *
 * Each row's icon is chosen by ``kind`` (welcome, payment_failed, …).
 * Clicking a row marks it read; if the payload carries a ``url`` we
 * navigate there as well, which makes notifications usable as deep-link
 * call-to-actions ("Pay invoice", "Reconnect mailbox", …).
 */

const KIND_ICON: Record<string, LucideIcon> = {
  welcome: Sparkles,
  mailbox_disconnected: MailX,
  warmth_drop: AlertTriangle,
  in_spam: AlertTriangle,
  peer_unhealthy: AlertTriangle,
  payment_failed: CreditCard,
  payment_succeeded: CheckCircle2,
  weekly_digest: Mail,
};

function timeAgo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(new Date(iso));
}

export function NotificationsPage() {
  const inbox = useNotificationsInbox({ pollMs: 60_000 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const onSelect = (n: InboxNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const url = typeof n.payload.url === 'string' ? n.payload.url : null;
    if (url) {
      // External links open in a new tab; in-app paths use the router.
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        navigate(url);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-text-dim">
            Welcome messages, mailbox status changes, billing events, and platform alerts.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!inbox.data?.unread || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {markAll.isPending ? 'Marking…' : 'Mark all read'}
        </Button>
      </header>

      <Card className="overflow-hidden p-0">
        {inbox.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : inbox.data && inbox.data.items.length > 0 ? (
          <ul className="divide-y divide-border-muted">
            {inbox.data.items.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              const unread = n.read_at === null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(n)}
                    className={
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50 focus-ring ' +
                      (unread ? 'bg-surface-2/20' : '')
                    }
                  >
                    <span
                      className={
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' +
                        (unread
                          ? 'bg-accent/20 text-accent'
                          : 'bg-surface-2 text-text-dim')
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-text">
                          {n.title}
                        </p>
                        <p className="shrink-0 text-xs text-text-dim">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-text-dim">
                          {n.body}
                        </p>
                      ) : null}
                    </div>
                    {unread ? (
                      <span
                        aria-hidden="true"
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="You're all caught up"
            description="Notifications about your warmup engine, billing, and team will show up here."
          />
        )}
      </Card>
    </motion.div>
  );
}
