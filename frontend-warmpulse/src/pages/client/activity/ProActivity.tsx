import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Hash, Search } from 'lucide-react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useActivityFeedInfinite } from '@/features/activity/api';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';
import type { Mailbox, MailboxProvider } from '@/features/mailboxes/types';
// TODO: lift pro-activity.css into pages/client/activity/ in a follow-up.
import '@/pages/client-design-preview/pro-activity/pro-activity.css';

/**
 * /app/activity for Pro tier — A2 Mailbox Channels with real data.
 * Slack-style: left rail of mailbox "channels", right feed of events.
 */
export function ProActivity() {
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data?.items ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // Default-select the first mailbox once they load.
  const safeActiveId = activeId ?? mailboxes[0]?.id ?? null;
  const active = mailboxes.find((m) => m.id === safeActiveId) ?? null;

  // Server-side filter by selected mailbox.
  const feedQuery = useActivityFeedInfinite(
    safeActiveId ? { mailbox_id: safeActiveId } : {},
  );
  const events = useMemo<ActivityItem[]>(() => {
    const pages = feedQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [feedQuery.data]);

  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <div className="a2">
        <div className="a2__empty" style={{ padding: 60 }}>
          No mailboxes connected. Connect a mailbox to see warmup activity here.
        </div>
      </div>
    );
  }

  return (
    <div className="a2">
      <aside className="a2__sidebar">
        <header className="a2__sidebar-head">
          <Hash size={11} strokeWidth={2.4} />
          <span>Channels</span>
        </header>
        <div className="a2__search">
          <Search size={10} strokeWidth={2.4} />
          <input placeholder="Filter…" disabled />
        </div>
        <ul className="a2__channels">
          {mailboxes.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setActiveId(m.id)}
                className={`a2__channel ${m.id === safeActiveId ? 'a2__channel--active' : ''}`}
              >
                <Hash size={10} strokeWidth={2.4} />
                <span className="a2__channel-name">
                  {m.email_address.split('@')[0]}
                </span>
                <span className={`a2__channel-dot a2__channel-dot--${toneFor(m)}`} />
              </button>
            </li>
          ))}
        </ul>
        <footer className="a2__sidebar-foot">
          <span className="a2__sidebar-foot-label">Events shown</span>
          <span className="a2__sidebar-foot-num">{events.length}</span>
        </footer>
      </aside>

      <section className="a2__main">
        <header className="a2__main-head">
          {active && <ProviderSwatch provider={active.provider} size={36} />}
          <div>
            <h2 className="a2__main-title">
              <Hash
                size={12}
                strokeWidth={2.6}
                style={{ color: 'var(--wp-text-faint)' }}
              />
              {active ? active.email_address.split('@')[0] : 'No mailbox'}
            </h2>
            {active && (
              <span className="a2__main-sub">
                {active.email_address} · Day {active.current_day} · Warmth{' '}
                {active.warmth_score ?? 0}/100
              </span>
            )}
          </div>
          <span className="a2__main-count">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        </header>

        <div className="a2__feed">
          {feedQuery.isLoading && events.length === 0 ? (
            <div className="a2__empty">Loading events…</div>
          ) : events.length === 0 ? (
            <div className="a2__empty">No events for this channel yet.</div>
          ) : (
            events.map((evt, i) => (
              <motion.div
                key={evt.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(i, 10) * 0.025 }}
                className="a2__msg"
              >
                <div className="a2__msg-avatar">
                  {evt.mailbox_email.charAt(0).toUpperCase()}
                </div>
                <div className="a2__msg-body">
                  <header className="a2__msg-head">
                    <span className="a2__msg-name">
                      {evt.mailbox_email.split('@')[0]}
                    </span>
                    <span className="a2__msg-time">{formatRelTime(evt.ts)}</span>
                  </header>
                  <p className="a2__msg-line">
                    <ActionChip action={evt.action} />{' '}
                    <span className="a2__msg-arrow">→</span>{' '}
                    <span className="a2__msg-peer">{evt.peer_email}</span>
                  </p>
                  {evt.subject && (
                    <p className="a2__msg-subject">"{evt.subject}"</p>
                  )}
                </div>
              </motion.div>
            ))
          )}

          {feedQuery.hasNextPage && (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => feedQuery.fetchNextPage()}
                disabled={feedQuery.isFetchingNextPage}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--wp-border)',
                  color: 'var(--wp-text-dim)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  cursor: feedQuery.isFetchingNextPage ? 'wait' : 'pointer',
                }}
              >
                {feedQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function toneFor(m: Mailbox): 'success' | 'warning' | 'danger' {
  if (m.warmup_status === 'paused') return 'danger';
  if ((m.warmth_score ?? 0) >= 80) return 'success';
  return 'warning';
}

function ProviderSwatch({
  provider,
  size = 26,
}: {
  provider: MailboxProvider;
  size?: number;
}) {
  const letter =
    provider === 'gmail'
      ? 'G'
      : provider === 'outlook'
      ? 'O'
      : provider === 'yahoo'
      ? 'Y'
      : 'S';
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

const ACTION_META: Record<ActivityAction, { lbl: string; tone: string }> = {
  sent: { lbl: 'Sent', tone: 'sent' },
  opened: { lbl: 'Opened', tone: 'opened' },
  replied: { lbl: 'Replied', tone: 'replied' },
  starred: { lbl: 'Starred', tone: 'starred' },
  spam_rescued: { lbl: 'Recovered', tone: 'spam_rescued' },
  marked_important: { lbl: 'Important', tone: 'marked_important' },
};

function ActionChip({ action }: { action: ActivityAction }) {
  const meta = ACTION_META[action];
  return (
    <span className={`act-chip act-chip--${meta.tone}`}>{meta.lbl}</span>
  );
}

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default ProActivity;
