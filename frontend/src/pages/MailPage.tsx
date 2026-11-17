import { useEffect, useRef, useState } from 'react';
import { EmptyState, LoadError, Skeleton, toast } from '../components/feedback';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import {
  getWebmailAccounts,
  getWebmailFolders,
  getWebmailMessageDetail,
  getWebmailMessages,
  markWebmail,
  type WebmailFolderName,
  type WebmailMarkAction,
  type WebmailMessageDetail,
  type WebmailMessageSummary,
} from '../lib/webmail';
import { AccountSwitcher } from './mail/AccountSwitcher';
import { ComposeModal, type ComposeSeed } from './mail/ComposeModal';
import { FolderRail } from './mail/FolderRail';
import { MessageList } from './mail/MessageList';
import { ReadPane } from './mail/ReadPane';
import { replyQuote, replySubject } from './mail/helpers';

interface Selection {
  uid: number;
  folder: WebmailFolderName;
}

const NO_LIST = { items: [], total: 0, page: 1 };

/**
 * MAIL — a webmail client over the mailboxes this workspace already owns
 * (Settings → Email): account switcher, IMAP folders, paged message list,
 * reading pane and compose/reply. Per-account degrade: an account whose
 * IMAP connection fails gets an error chip in the switcher and an inline
 * error in the list, without taking down the others.
 */
export function MailPage() {
  const accounts = useAsync(getWebmailAccounts, []);

  const [accountId, setAccountId] = useState<number | null>(null);
  const [folder, setFolder] = useState<WebmailFolderName>('INBOX');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [searchBox, setSearchBox] = useState('');
  const [selected, setSelected] = useState<Selection | null>(null);
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const [degraded, setDegraded] = useState<Record<number, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  /** page size learned from the first page of results (drives the pager). */
  const [pageSize, setPageSize] = useState(0);

  // default to the primary (then first) account once the list arrives
  useEffect(() => {
    if (accountId === null && accounts.data && accounts.data.length > 0) {
      setAccountId((accounts.data.find((a) => a.is_primary) ?? accounts.data[0]).id);
    }
  }, [accounts.data, accountId]);

  const folders = useAsync(
    () => (accountId === null ? Promise.resolve([]) : getWebmailFolders(accountId)),
    [accountId],
  );
  const messages = useAsync(
    () =>
      accountId === null
        ? Promise.resolve(NO_LIST)
        : getWebmailMessages(accountId, { folder, page, query }),
    [accountId, folder, page, query],
  );
  const detail = useAsync(
    () =>
      accountId === null || selected === null
        ? Promise.resolve(null)
        : getWebmailMessageDetail(accountId, selected.folder, selected.uid),
    [accountId, selected?.folder, selected?.uid],
  );

  // remember how many rows a full page holds (pager math); drop it on reload
  useEffect(() => {
    if (messages.data && messages.data.page === 1 && messages.data.items.length > 0 && query === '') {
      setPageSize(messages.data.items.length);
    }
  }, [messages.data, query]);

  // an account whose folder list fails is "degraded" — chip in the switcher
  useEffect(() => {
    if (accountId === null) return;
    setDegraded((d) => {
      const next = { ...d };
      if (folders.error) next[accountId] = folders.error;
      else delete next[accountId];
      return Object.keys(next).length === Object.keys(d).length && Object.entries(next).every(([k, v]) => d[Number(k)] === v) ? d : next;
    });
  }, [accountId, folders.error]);

  const activeAccount = accounts.data?.find((a) => a.id === accountId) ?? null;

  /** Refresh every pane quietly (useAsync.reload keeps old data on screen). */
  const refreshAll = () => {
    setRefreshing(true);
    void Promise.allSettled([
      accounts.reload(),
      folders.reload(),
      messages.reload(),
      ...(detail.data ? [detail.reload()] : []),
    ]).finally(() => setRefreshing(false));
  };

  /** After a mark action, the rows + folder/account counters all go stale. */
  const refreshCounts = () => {
    void messages.reload();
    void folders.reload();
    void accounts.reload();
  };

  /**
   * Run one mark action and surface its outcome: full failure → error toast;
   * partial failure (the API answers per-uid {ok, failed, expunged} counts)
   * → warn toast; then refresh rows + counters.
   */
  const runMark = (folderName: WebmailFolderName, uids: number[], action: WebmailMarkAction): Promise<void> => {
    if (accountId === null) return Promise.resolve();
    return markWebmail(accountId, folderName, uids, action).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
      } else {
        const failed = res.data.failed ?? 0;
        if (failed > 0) {
          toast.warn(
            `Only ${res.data.ok} of ${res.data.ok + failed} message${res.data.ok + failed === 1 ? '' : 's'} updated — the mailbox may be reconnecting.`,
          );
        }
      }
      refreshCounts();
    });
  };

  const selectAccount = (id: number) => {
    if (id === accountId) return;
    setAccountId(id);
    setFolder('INBOX');
    setPage(1);
    setQuery('');
    setSearchBox('');
    setSelected(null);
  };

  const selectFolder = (name: WebmailFolderName) => {
    if (name === folder) return;
    setFolder(name);
    setPage(1);
    setSelected(null);
  };

  const openMessage = (uid: number) => {
    // no mark-seen here: the detail fetch (BODY[]) already sets \Seen
    // server-side — one fewer IMAP round-trip per open
    setSelected({ uid, folder });
  };

  const toggleFlag = (msg: WebmailMessageSummary) => {
    void runMark(folder, [msg.uid], 'flagged');
  };

  const markUnread = (d: WebmailMessageDetail) => {
    if (selected === null) return;
    setBusy(true);
    void runMark(selected.folder, [d.uid], 'unread').finally(() => {
      setBusy(false);
      setSelected(null); // back to the list — the row is bold again
    });
  };

  const trashMessage = (d: WebmailMessageDetail) => {
    if (selected === null) return;
    setBusy(true);
    void runMark(selected.folder, [d.uid], 'trash').finally(() => {
      setBusy(false);
      setSelected(null);
    });
  };

  const startReply = (d: WebmailMessageDetail) => {
    setCompose({
      to: d.from,
      subject: replySubject(d.subject || ''),
      body: replyQuote(d.from, d.date, d.text || d.subject || ''),
      // thread on the real Message-ID header — NEVER the uid (an int here
      // crashes the backend header builder); null → omit, sends a new thread
      ...(d.message_id !== null ? { inReplyTo: d.message_id } : {}),
    });
  };

  const submitSearch = () => {
    setPage(1);
    setQuery(searchBox.trim());
  };

  const searchInput = useRef<HTMLInputElement>(null);

  /* ---- gate: accounts list ---- */
  if (accounts.error && !accounts.data) {
    return (
      <div className="page">
        <LoadError message={accounts.error} onRetry={() => void accounts.reload()} />
      </div>
    );
  }
  if (accounts.loading && !accounts.data) {
    return (
      <div className="page mail-page">
        <div className="mail-toolbar">
          <Skeleton rows={1} height={38} />
        </div>
        <div className="mail-layout">
          <Skeleton rows={6} height={34} />
          <Skeleton rows={7} height={58} />
          <Skeleton rows={5} height={48} />
        </div>
      </div>
    );
  }
  if ((accounts.data ?? []).length === 0) {
    return (
      <div className="page">
        <section className="panel">
          <EmptyState
            icon={<span aria-hidden>✉</span>}
            title="No mailboxes to read yet"
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('settings', 'mailboxes')}>
                Connect a mailbox
              </button>
            }
          >
            Add a mailbox with IMAP credentials in Settings → Email, then its folders appear here.
          </EmptyState>
        </section>
      </div>
    );
  }

  const accountError = accountId !== null ? degraded[accountId] : undefined;

  return (
    <div className="page mail-page">
      {/* ---- toolbar: title · search · refresh · account switcher ---- */}
      <header className="mail-toolbar">
        <h1 className="mail-title">Mailbox</h1>
        <div className="mail-search" role="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.4-4.4" />
          </svg>
          <input
            ref={searchInput}
            type="text"
            value={searchBox}
            placeholder="Search subject, from, to…"
            aria-label="Search messages"
            onChange={(e) => setSearchBox(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch();
              if (e.key === 'Escape') {
                setSearchBox('');
                setQuery('');
                setPage(1);
              }
            }}
          />
          {searchBox && (
            <button
              type="button"
              className="icon-btn mail-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setSearchBox('');
                setQuery('');
                setPage(1);
                searchInput.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-btn mail-refresh"
          onClick={refreshAll}
          disabled={refreshing}
          title="Refresh all folders"
          aria-label="Refresh all folders"
        >
          <svg className={refreshing ? 'spin' : ''} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v4h-4" />
          </svg>
        </button>
        <AccountSwitcher
          accounts={accounts.data ?? []}
          activeId={accountId}
          degraded={degraded}
          onSelect={selectAccount}
        />
        <button
          type="button"
          className="btn btn-ghost mail-add-btn"
          onClick={() => navigate('settings', 'mailboxes')}
          title="Add a mailbox (Settings → Mailboxes)"
        >
          + Add mailbox
        </button>
      </header>

      {/* ---- three panes ---- */}
      <div className="mail-layout">
        <FolderRail
          folders={folders.data}
          active={folder}
          loading={folders.loading}
          onSelect={selectFolder}
          onCompose={() => setCompose({})}
        />

        <div className="wm-list-col">
          {accountError && (
            <div className="wm-account-banner" role="alert">
              <strong>{activeAccount?.email ?? 'This account'} can't be reached.</strong>
              <span> {accountError}</span>
            </div>
          )}
          <MessageList
            folder={folder}
            state={messages}
            page={page}
            pageSize={pageSize}
            selectedUid={selected?.uid ?? null}
            query={query}
            onOpen={openMessage}
            onToggleFlag={toggleFlag}
            onPage={setPage}
            onRetry={() => void messages.reload()}
            onClearQuery={() => {
              setSearchBox('');
              setQuery('');
              setPage(1);
            }}
          />
        </div>

        <ReadPane
          detail={detail.data}
          loading={detail.loading}
          error={detail.error}
          onRetry={() => void detail.reload()}
          onClose={() => setSelected(null)}
          onReply={startReply}
          onMarkUnread={markUnread}
          onTrash={trashMessage}
          busy={busy}
        />
      </div>

      {compose && activeAccount && (
        <ComposeModal
          accountId={activeAccount.id}
          fromEmail={activeAccount.email}
          seed={compose}
          onClose={() => setCompose(null)}
          onSent={refreshCounts}
        />
      )}
    </div>
  );
}
