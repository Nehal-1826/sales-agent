import { useMemo } from 'react';
import {
  Flag,
  Mail,
  MailCheck,
  MailOpen,
  Send,
  ShieldCheck,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/cn';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';

interface ActivityRowProps {
  item: ActivityItem;
}

interface Visual {
  Icon: LucideIcon;
  label: string;
  /** Tailwind text-color class for icon. */
  colorClass: string;
}

const VISUALS: Record<ActivityAction, Visual> = {
  sent: { Icon: Send, label: 'Sent', colorClass: 'text-accent2' },
  opened: { Icon: MailOpen, label: 'Opened', colorClass: 'text-accent' },
  replied: { Icon: Mail, label: 'Replied', colorClass: 'text-accent4' },
  starred: { Icon: Star, label: 'Starred', colorClass: 'text-accent4' },
  spam_rescued: { Icon: ShieldCheck, label: 'Spam recovery', colorClass: 'text-accent3' },
  marked_important: { Icon: MailCheck, label: 'Marked important', colorClass: 'text-accent2' },
};

const FALLBACK: Visual = { Icon: Flag, label: 'Event', colorClass: 'text-text-dim' };

export function ActivityRow({ item }: ActivityRowProps) {
  const visual = VISUALS[item.action] ?? FALLBACK;
  const { Icon } = visual;

  const relative = useMemo(() => {
    const ts = new Date(item.ts);
    if (Number.isNaN(ts.getTime())) return '';
    try {
      return formatDistanceToNow(ts, { addSuffix: true });
    } catch {
      return '';
    }
  }, [item.ts]);

  return (
    <div className="flex items-center gap-3 border-b border-border-muted/30 py-2">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2',
          visual.colorClass,
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn('font-medium', visual.colorClass)}>{visual.label}</span>
          <span className="text-text-dim">·</span>
          <span className="truncate text-text">{item.mailbox_email}</span>
          <span className="text-text-dim">→</span>
          <span className="truncate text-text-dim">{item.peer_email}</span>
        </div>
        {item.subject ? (
          <div className="mt-0.5 truncate text-xs text-text-dim">{item.subject}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-xs tabular-nums text-text-dim">{relative}</div>
    </div>
  );
}
