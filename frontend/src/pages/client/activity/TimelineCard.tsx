import { useEffect, useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useActivityFeedInfinite } from '@/features/activity/api';
import type { ActivityFilterState, ActivityItem } from '@/features/activity/types';
import { ActivityRow } from './ActivityRow';

interface TimelineCardProps {
  filters: ActivityFilterState;
}

interface HourGroup {
  key: string;
  label: string;
  items: ActivityItem[];
}

function groupByHour(items: ActivityItem[]): HourGroup[] {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const d = new Date(item.ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([key, list]) => {
    const first = list[0];
    const date = first ? new Date(first.ts) : new Date();
    const label = formatDateTime(date);
    return { key, label, items: list };
  });
}

function matchesSearch(item: ActivityItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    item.mailbox_email.toLowerCase().includes(needle) ||
    item.peer_email.toLowerCase().includes(needle) ||
    (item.subject ?? '').toLowerCase().includes(needle)
  );
}

export function TimelineCard({ filters }: TimelineCardProps) {
  const feed = useActivityFeedInfinite(filters);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo<ActivityItem[]>(() => {
    const pages = feed.data?.pages ?? [];
    const flat = pages.flatMap((p) => p.items);
    const search = filters.search ?? '';
    return search ? flat.filter((it) => matchesSearch(it, search)) : flat;
  }, [feed.data, filters.search]);

  const groups = useMemo(() => groupByHour(items), [items]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            feed.hasNextPage &&
            !feed.isFetchingNextPage
          ) {
            feed.fetchNextPage();
          }
        }
      },
      { rootMargin: '120px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-muted p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-text">Activity timeline</h3>
          <p className="text-xs text-text-dim">
            Live feed — refreshes every 30s. Scroll to load more.
          </p>
        </div>
        {feed.isFetching && !feed.isFetchingNextPage ? (
          <Spinner className="h-4 w-4 text-text-dim" />
        ) : null}
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5">
        {feed.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : feed.isError ? (
          <div className="text-center text-sm text-accent3">Failed to load activity.</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-5 w-5" />}
            title="No activity yet"
            description="Warmup starts within an hour of adding a mailbox."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-dim">
                  <span className="h-px flex-1 bg-border-muted/40" />
                  <span>{group.label}</span>
                  <span className="h-px flex-1 bg-border-muted/40" />
                </div>
                <div>
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
            <div ref={sentinelRef} className="h-8">
              {feed.isFetchingNextPage ? (
                <div className="flex items-center justify-center py-2 text-xs text-text-dim">
                  <Spinner className="mr-2 h-3 w-3" />
                  Loading more…
                </div>
              ) : !feed.hasNextPage ? (
                <div className="py-2 text-center text-xs text-text-dim">
                  End of feed.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
