import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWarmupThreads } from '@/features/mailboxes/api';
import { formatDate } from '@/lib/format';

interface ThreadViewerProps {
  mailboxId: string;
}

function relativeTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(d);
}

export function ThreadViewer({ mailboxId }: ThreadViewerProps) {
  const { data, isLoading } = useWarmupThreads(mailboxId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-5 w-5" />}
        title="No threads yet"
        description="Threads appear once warmup starts."
        className="py-10"
      />
    );
  }

  return (
    <ul className="divide-y divide-border-muted rounded-lg border border-border-muted bg-surface">
      {data.map((t) => (
        <li key={t.id} className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{t.subject}</p>
              <p className="truncate text-xs text-text-dim">with {t.peer_email}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="neutral">{t.messages_count} msgs</Badge>
              <span className="text-[11px] text-text-dim">{relativeTs(t.last_action_at)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
