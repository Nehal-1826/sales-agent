import { AnimatedList } from '../../components/AnimatedList';
import { timeAgo } from '../../lib/format';
import { parseWarmupTs } from './chartTheme';
import type { WarmupActivityAction, WarmupActivityItem } from '../../lib/warmupApi';

/** Action → feed label (port of source ACTION_META; colors via app CSS classes). */
const ACTION_META: Record<WarmupActivityAction, { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'act-sent' },
  opened: { label: 'Opened', cls: 'act-opened' },
  replied: { label: 'Replied', cls: 'act-replied' },
  spam_rescued: { label: 'Spam rescue', cls: 'act-rescued' },
  starred: { label: 'Starred', cls: 'act-starred' },
  marked_important: { label: 'Marked important', cls: 'act-opened' },
};

function ago(item: WarmupActivityItem): string {
  const ms = parseWarmupTs(item.ts);
  return Number.isNaN(ms) ? '' : timeAgo(new Date(ms).toISOString());
}

/**
 * Newest warmup events (port of source LiveActivityFeed). No polling here by
 * design — the page refreshes on mount and via the manual Refresh button.
 */
export function ActivityFeed({ items }: { items: WarmupActivityItem[] }) {
  if (items.length === 0) {
    return <div className="warmup-feed-empty">Nothing to report yet — activity appears as warmup mail moves between inboxes.</div>;
  }
  return (
    <AnimatedList
      items={items}
      asList
      interactiveRows
      listClassName="warmup-feed"
      itemClassName={(ev) => {
        const meta = ACTION_META[ev.action] ?? ACTION_META.sent;
        return `warmup-feed-row ${meta.cls}`;
      }}
      getItemKey={(ev) => ev.id}
      animation="slide"
      theme="dark"
      frame={false}
      width="100%"
      maxHeight={420}
      gap={6}
      accentColor="var(--accent)"
      renderItem={(ev) => {
        const meta = ACTION_META[ev.action] ?? ACTION_META.sent;
        return (
          <>
            <span className="warmup-feed-action" aria-hidden />
            <div className="warmup-feed-main">
              <p className="warmup-feed-line">
                <strong>{meta.label}</strong>
                <span className="warmup-feed-route"> {ev.mailbox_email} → {ev.peer_email}</span>
              </p>
              {ev.subject && <p className="warmup-feed-subject">{ev.subject}</p>}
            </div>
            <span className="warmup-feed-ago" title={ev.ts}>{ago(ev)}</span>
          </>
        );
      }}
    />
  );
}
