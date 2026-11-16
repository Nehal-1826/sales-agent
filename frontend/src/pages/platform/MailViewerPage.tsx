/**
 * Platform Mail Viewer (ported from the WarmPulse admin console, restyled to
 * the merged shell). Read-only IMAP inspector over the admin mail-viewer
 * proxy — super_admin only.
 *
 * Pick any client mailbox or peer inbox from the searchable switcher, browse
 * its folders, and open individual messages. Exists to debug what the peer
 * network actually delivered (opens / replies / stars / spam-rescue), so this
 * page is strictly read-only — no delete, move, or mark actions.
 *
 * OAuth client mailboxes come back with imap_supported=false and are listed
 * but disabled ("OAuth mailboxes not supported yet").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/overlay';
import { PageHeader } from '../../components/ui';
import { EmptyState, LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  getMailViewerMessage,
  listMailViewerAccounts,
  listMailViewerMessages,
} from '../../lib/platformAdmin';
import type { MailViewerAccount, MailViewerMessagesPage, MailViewerSource } from '../../lib/platformAdmin';

const ACCOUNT_STORAGE_KEY = 'agentic-ai:platformMailViewer.account';
const DEFAULT_FOLDER = 'INBOX';
const EMPTY_PAGE: MailViewerMessagesPage = { folder: DEFAULT_FOLDER, folders: [DEFAULT_FOLDER], messages: [] };

function accountKey(a: Pick<MailViewerAccount, 'source' | 'id'>): string {
  return `${a.source}:${a.id}`;
}

function sourceLabel(a: Pick<MailViewerAccount, 'source'>): string {
  return a.source === 'mailbox' ? 'Client' : 'Peer';
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ---------------------------------------------------------------------------
 * Account switcher — searchable dropdown (no select-with-search in plain DOM)
 * ------------------------------------------------------------------------- */

function AccountSwitcher({
  accounts,
  selected,
  onSelect,
}: {
  accounts: MailViewerAccount[];
  selected: MailViewerAccount | null;
  onSelect: (a: MailViewerAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.email, a.owner_email ?? '', a.provider, sourceLabel(a)].join(' ').toLowerCase().includes(q),
    );
  }, [accounts, query]);

  // Close on outside pointer-down; Escape handled below.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 'min(100%, 380px)' }}>
      <button
        type="button"
        className="btn"
        style={{ width: '100%', justifyContent: 'space-between' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (
            <>
              {selected.email} <span className="chip" style={{ marginLeft: 6 }}>{sourceLabel(selected)}</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-2)' }}>Select an inbox…</span>
          )}
        </span>
        <span aria-hidden style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <div className="panel" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, padding: 8, maxHeight: 340, overflowY: 'auto' }} role="listbox">
          <input
            autoFocus
            type="search"
            placeholder="Search email, owner, provider…"
            aria-label="Search inboxes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 6 }}
          />
          {filtered.length === 0 ? (
            <p style={{ padding: '12px 8px', textAlign: 'center', fontSize: 12, color: 'var(--text-2)', margin: 0 }}>No matching inboxes.</p>
          ) : (
            filtered.map((a) => {
              const disabled = !a.imap_supported;
              const isSelected = selected != null && accountKey(selected) === accountKey(a);
              const option = (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={disabled}
                  title={disabled ? 'OAuth mailboxes not supported yet' : undefined}
                  onClick={() => {
                    onSelect(a);
                    setOpen(false);
                    setQuery('');
                  }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    textAlign: 'left',
                    background: isSelected ? 'var(--chrome-2)' : 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled) e.currentTarget.style.background = 'var(--chrome-2)';
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled) e.currentTarget.style.background = isSelected ? 'var(--chrome-2)' : 'transparent';
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{a.email}</span>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-2)' }}>
                      {a.owner_email ? `owner ${a.owner_email}` : 'system peer'} · {a.provider}
                    </span>
                  </span>
                  <span className={`chip${a.source === 'peer' ? ' chip-accent' : ''}`} style={{ flexShrink: 0 }}>
                    {sourceLabel(a)}
                  </span>
                </button>
              );
              return <div key={accountKey(a)}>{option}</div>;
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Message body — sandboxed iframe for the (server-sanitized) HTML part
 * ------------------------------------------------------------------------- */

function MailBodyView({ html, text }: { html?: string | null; text?: string | null }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = () => {
    const doc = frameRef.current?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) return;
    const h = Math.max(doc.documentElement?.scrollHeight ?? 0, body.scrollHeight);
    if (h > 0) setHeight((prev) => (prev === h + 16 ? prev : Math.min(h + 16, 40_000)));
  };

  // Reset the measured height when a different mail is loaded.
  useEffect(() => setHeight(null), [html]);

  if (html) {
    return (
      <iframe
        ref={frameRef}
        title="Message body"
        // allow-same-origin WITHOUT allow-scripts: script execution stays off
        // while the parent can still measure the document (server sanitizes
        // active content regardless — defense in depth).
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={measure}
        style={{ width: '100%', minHeight: 240, height: height != null ? Math.min(height, 3_600) : undefined, maxHeight: 3_600, border: '1px solid var(--border-soft)', borderRadius: 8, background: '#fff' }}
      />
    );
  }
  return (
    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12, margin: 0 }}>
      {text || '(empty body)'}
    </pre>
  );
}

/* ---------------------------------------------------------------------------
 * Message detail modal — mounted only while a message is open
 * ------------------------------------------------------------------------- */

function MessageDetailDialog({
  source,
  accountId,
  accountEmail,
  folder,
  uid,
  onClose,
}: {
  source: MailViewerSource;
  accountId: string;
  accountEmail: string;
  folder: string;
  uid: number | string;
  onClose: () => void;
}) {
  const q = useAsync(() => getMailViewerMessage(source, accountId, folder, uid), [source, accountId, folder, uid]);
  const d = q.data;
  const warmupId = d?.headers?.x_warmup_id;

  return (
    <Modal
      wide
      title={d?.subject || (q.loading ? 'Loading message…' : '(no subject)')}
      onClose={onClose}
    >
      <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px' }}>
        {accountEmail} · {folder} · UID {uid}
      </p>
      {q.error && <LoadError message={q.error} onRetry={() => void q.reload()} />}
      {q.loading && !d && <Skeleton rows={5} />}
      {d && (
        <>
          {warmupId && <span className="chip chip-accent" style={{ fontFamily: 'monospace', marginBottom: 10 }}>X-Warmup-Id {warmupId}</span>}
          <dl className="pf-dl" style={{ marginBottom: 12 }}>
            <dt>From</dt>
            <dd style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{d.from || '—'}</dd>
            <dt>To</dt>
            <dd style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{d.to || '—'}</dd>
            {d.cc && (
              <>
                <dt>Cc</dt>
                <dd style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{d.cc}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd style={{ fontFamily: 'monospace' }}>{fmtDate(d.date)}</dd>
            {d.headers?.message_id && (
              <>
                <dt>Msg-ID</dt>
                <dd style={{ wordBreak: 'break-all', fontFamily: 'monospace', color: 'var(--text-2)' }}>{d.headers.message_id}</dd>
              </>
            )}
          </dl>
          <MailBodyView html={d.html_body} text={d.text_body} />
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export function MailViewerPage() {
  const accountsQuery = useAsync(listMailViewerAccounts);
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  // Persisted selection ("mailbox:<id>" / "peer:<id>") — restored on load and
  // re-validated against the accounts list (stale ids just deselect).
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACCOUNT_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const selected = useMemo(
    () => accounts.find((a) => accountKey(a) === selectedKey) ?? null,
    [accounts, selectedKey],
  );

  const selectAccount = (a: MailViewerAccount) => {
    setSelectedKey(accountKey(a));
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, accountKey(a));
    } catch {
      /* private mode — selection just won't persist */
    }
  };

  const [folder, setFolder] = useState(DEFAULT_FOLDER);
  const source: MailViewerSource = selected?.source ?? 'mailbox';
  const accountId = selected?.id ?? null;
  const messagesQuery = useAsync(
    () => (accountId ? listMailViewerMessages(source, accountId, folder) : Promise.resolve<MailViewerMessagesPage>(EMPTY_PAGE)),
    [source, accountId, folder],
    { keepStale: true },
  );

  const folders = useMemo(() => messagesQuery.data?.folders ?? [], [messagesQuery.data]);
  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);

  // If the loaded folder list doesn't contain the current folder (typically
  // after switching accounts), fall back to INBOX.
  useEffect(() => {
    if (folders.length > 0 && !folders.includes(folder)) {
      setFolder(folders.includes(DEFAULT_FOLDER) ? DEFAULT_FOLDER : (folders[0] ?? DEFAULT_FOLDER));
    }
  }, [folders, folder]);

  const [openUid, setOpenUid] = useState<number | string | null>(null);

  return (
    <>
      <PageHeader
        title="Mail viewer"
        subtitle="Read-only IMAP inspection of any client mailbox or peer inbox · super-admin only."
        actions={
          <>
            <AccountSwitcher accounts={accounts} selected={selected} onSelect={selectAccount} />
            <button className="btn" onClick={() => void messagesQuery.reload()}>
              Refresh
            </button>
          </>
        }
      />

      {/* Folder tabs */}
      {selected && folders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${f === folder ? ' chip-accent' : ''}`}
              style={{ fontFamily: 'monospace' }}
              onClick={() => setFolder(f)}
            >
              {f}
            </button>
          ))}
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Body */}
      {accountsQuery.loading && !accountsQuery.data && <Skeleton rows={5} />}
      {accountsQuery.error && <LoadError message={accountsQuery.error} onRetry={() => void accountsQuery.reload()} />}
      {accountsQuery.data && accounts.length === 0 && (
        <EmptyState title="No viewable inboxes">No client mailboxes or peer inboxes are available to inspect.</EmptyState>
      )}
      {accountsQuery.data && accounts.length > 0 && !selected && (
        <EmptyState title="Select an inbox">Pick a client mailbox or peer inbox above to browse its folders and messages.</EmptyState>
      )}
      {selected && messagesQuery.loading && !messagesQuery.data && <Skeleton rows={6} />}
      {selected && messagesQuery.error && (
        <LoadError message={messagesQuery.error} onRetry={() => void messagesQuery.reload()} />
      )}
      {selected && messagesQuery.data && messages.length === 0 && (
        <EmptyState title={`No messages in ${folder}`}>This folder is empty, or the account has no mail in it yet.</EmptyState>
      )}
      {selected && messagesQuery.data && messages.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          {messages.map((m, i) => (
            <button
              key={`${m.uid}`}
              type="button"
              onClick={() => setOpenUid(m.uid)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'flex-start',
                gap: 16,
                padding: '12px 16px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 144, flex: 'none', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)' }}>
                {fmtDate(m.date)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)' }}>
                  {m.from || '—'} → {m.to || '—'}
                </span>
                <span style={{ display: 'flex', minWidth: 0, alignItems: 'baseline', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500 }}>
                    {m.subject || '(no subject)'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-3)' }}>{m.snippet}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal — mounted only while a message is open. */}
      {openUid != null && selected && (
        <MessageDetailDialog
          key={`${selected.source}:${selected.id}:${folder}:${openUid}`}
          source={selected.source}
          accountId={selected.id}
          accountEmail={selected.email}
          folder={folder}
          uid={openUid}
          onClose={() => setOpenUid(null)}
        />
      )}
    </>
  );
}

export default MailViewerPage;
