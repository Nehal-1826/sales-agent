import { EmptyState, LoadError, Skeleton } from '../../components/feedback';
import type { WebmailFolderName, WebmailMessageList, WebmailMessageSummary } from '../../lib/webmail';
import { initials, shortDate } from './helpers';

const EMPTY_TEXT: Record<WebmailFolderName, string> = {
  INBOX: 'Nothing here. New mail lands in this list within a few minutes of arriving.',
  Sent: 'Nothing sent from this account yet.',
  Drafts: 'No drafts. Start a message with Compose and close it to keep a draft.',
  Junk: 'No junk mail. Warmup keeps this folder clean.',
  Trash: 'Trash is empty.',
};

/** One message row: avatar, from, subject + snippet, time, flag, unread bolding. */
function Row({
  msg,
  active,
  onOpen,
  onToggleFlag,
}: {
  msg: WebmailMessageSummary;
  active: boolean;
  onOpen: (uid: number) => void;
  onToggleFlag: (msg: WebmailMessageSummary) => void;
}) {
  return (
    <div className={`wm-row${msg.seen ? '' : ' unread'}${active ? ' active' : ''}`} role="listitem">
      <button type="button" className="wm-row-main" onClick={() => onOpen(msg.uid)}>
        <span className="avatar wm-avatar" aria-hidden>
          {initials(msg.from)}
        </span>
        <span className="wm-row-body">
          <span className="wm-row-top">
            <span className="wm-row-from">{msg.from}</span>
            {!msg.seen && <span className="wm-unread-dot" aria-label="unread" />}
            <span className="wm-row-time">{shortDate(msg.date)}</span>
          </span>
          <span className="wm-row-subject">{msg.subject || '(no subject)'}</span>
          <span className="wm-row-snippet">{msg.snippet}</span>
        </span>
      </button>
      <button
        type="button"
        className={`wm-flag${msg.flagged ? ' on' : ''}`}
        onClick={() => onToggleFlag(msg)}
        aria-pressed={msg.flagged}
        aria-label={msg.flagged ? 'Remove flag' : 'Flag this message'}
        title={msg.flagged ? 'Remove flag' : 'Flag this message'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={msg.flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 21V4M5 4h13l-2.5 4L18 12H5" />
        </svg>
      </button>
    </div>
  );
}

/** Middle pane: folder name + total, the rows, and the older/newer pager. */
export function MessageList({
  folder,
  state,
  page,
  pageSize,
  selectedUid,
  query,
  onOpen,
  onToggleFlag,
  onPage,
  onRetry,
  onClearQuery,
}: {
  folder: WebmailFolderName;
  state: { data: WebmailMessageList | null; error: string | null; loading: boolean; reload: () => Promise<void> };
  page: number;
  pageSize: number;
  selectedUid: number | null;
  query: string;
  onOpen: (uid: number) => void;
  onToggleFlag: (msg: WebmailMessageSummary) => void;
  onPage: (next: number) => void;
  onRetry: () => void;
  onClearQuery: () => void;
}) {
  const { data, error, loading } = state;
  const total = data?.total ?? 0;
  const hasNewer = page > 1;
  const hasOlder = pageSize > 0 && data !== null && page * pageSize < total;

  return (
    <section className="wm-list" aria-label="Message list">
      <header className="wm-list-head">
        <strong>{folder === 'INBOX' ? 'Inbox' : folder}</strong>
        {query ? (
          <button type="button" className="wm-search-chip" onClick={onClearQuery} title="Clear search">
            “{query}” ×
          </button>
        ) : null}
        <span className="wm-list-count">
          {loading && data ? 'refreshing…' : `${total} message${total === 1 ? '' : 's'}`}
        </span>
      </header>
      {error && !data ? (
        <div className="wm-list-state">
          <LoadError message={error} onRetry={onRetry} />
        </div>
      ) : loading && !data ? (
        <div className="wm-list-state">
          <Skeleton rows={6} height={58} />
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="wm-list-state">
          <EmptyState title={query ? `No messages matching “${query}”` : 'Empty folder'}>
            {query ? 'Try another word, or clear the search to see every message.' : EMPTY_TEXT[folder]}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="wm-rows" role="list">
            {(data?.items ?? []).map((m) => (
              <Row key={m.uid} msg={m} active={m.uid === selectedUid} onOpen={onOpen} onToggleFlag={onToggleFlag} />
            ))}
          </div>
          {(hasNewer || hasOlder) && (
            <footer className="wm-pager">
              <button type="button" className="btn btn-sm" disabled={!hasNewer || loading} onClick={() => onPage(page - 1)}>
                ← Newer
              </button>
              <span className="wm-pager-info">page {page}</span>
              <button type="button" className="btn btn-sm" disabled={!hasOlder || loading} onClick={() => onPage(page + 1)}>
                Older →
              </button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
