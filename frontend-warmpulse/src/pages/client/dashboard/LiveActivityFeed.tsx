import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Mail, MailOpen, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useActivityFeed, type ActivityEvent } from '@/features/dashboard/api';
import { formatDateTime } from '@/lib/format';

const ACTION_META: Record<
  ActivityEvent['action'],
  { icon: typeof Mail; label: string; color: string }
> = {
  sent: { icon: Mail, label: 'Sent', color: 'text-text' },
  opened: { icon: MailOpen, label: 'Opened', color: 'text-accent2' },
  replied: { icon: MessageSquare, label: 'Replied', color: 'text-accent' },
  spam_rescued: { icon: ShieldCheck, label: 'Spam rescue', color: 'text-accent' },
  starred: { icon: Star, label: 'Starred', color: 'text-accent4' },
  marked_important: { icon: Mail, label: 'Marked important', color: 'text-accent2' },
};

/**
 * Show "MMM d, h:mm a" (e.g. "Apr 27, 11:47 PM"). The card has limited room
 * so we drop the year unless the event is from a different year. The full
 * ISO timestamp lives in the `title` attribute on the rendered span so power
 * users can hover to see UTC.
 */
function formatTs(ts: string): { display: string; iso: string } {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { display: '', iso: ts };
  const display = formatDateTime(d);
  return { display, iso: d.toISOString() };
}

export function LiveActivityFeed() {
  const { data, isLoading } = useActivityFeed(20);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Live activity</CardTitle>
          <p className="text-xs text-text-dim">Last 20 warmup events.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Live
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Nothing to report yet"
            description="Activity appears here as warmup mail moves between inboxes."
            className="py-8"
          />
        ) : (
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {data.map((ev) => {
                const meta = ACTION_META[ev.action] ?? ACTION_META.sent;
                const Icon = meta.icon;
                return (
                  <motion.li
                    key={ev.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-2/40"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-medium text-text">{meta.label}</span>{' '}
                        <span className="text-text-dim">
                          {ev.mailbox_email} → {ev.peer_email}
                        </span>
                      </p>
                      {ev.subject ? (
                        <p className="truncate text-xs text-text-dim">{ev.subject}</p>
                      ) : null}
                    </div>
                    {(() => {
                      const t = formatTs(ev.ts);
                      return (
                        <span
                          className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-dim"
                          title={t.iso}
                        >
                          {t.display}
                        </span>
                      );
                    })()}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
