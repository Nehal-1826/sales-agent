/**
 * /admin/mail-viewer — read-only IMAP inspector over the admin mail-viewer
 * proxy (super_admin).
 *
 * Pick any client mailbox or peer inbox from the searchable switcher, browse
 * its folders, and open individual messages. Exists to debug what the peer
 * network actually delivered (opens / replies / stars / spam-rescue), so this
 * page is strictly read-only — no delete, move, or mark actions.
 *
 * OAuth client mailboxes come back with imap_supported=false and are listed
 * but disabled ("OAuth mailboxes not supported yet").
 */
import { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { ChevronDown, Inbox, Loader2, Search } from 'lucide-react';
import {
  ADMIN_KEYS,
  useMailViewerAccounts,
  useMailViewerMessage,
  useMailViewerMessages,
  type MailViewerAccount,
  type MailViewerSource,
} from '@/features/admin/api';
import { extractErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefreshButton } from '@/components/ui/RefreshButton';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { AppPopover, AppPopoverContent, AppPopoverTrigger } from '@/components/ui/AppPopover';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  TooltipProvider,
} from '@/components/ui/AppTooltip';

const ACCOUNT_STORAGE_KEY = 'warmpulse.adminMailViewer.account';
const DEFAULT_FOLDER = 'INBOX';

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

/** Human copy for a messages-load failure: 502 = IMAP dead, 400 = backend detail. */
function describeMessagesError(err: unknown): string {
  if (err instanceof AxiosError) {
    // 502 detail carries "host:port — reason" from the backend (never creds).
    if (err.response?.status === 502) {
      return extractErrorMessage(err, 'IMAP unreachable for this account.');
    }
    if (err.response?.status === 400) {
      return extractErrorMessage(err, 'This account cannot be viewed over IMAP.');
    }
  }
  return extractErrorMessage(err, 'Could not load messages.');
}

// ---------------------------------------------------------------------------
// Account switcher — filterable dropdown (Radix Select has no search)
// ---------------------------------------------------------------------------

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.email, a.owner_email ?? '', a.provider, sourceLabel(a)].join(' ').toLowerCase().includes(q),
    );
  }, [accounts, query]);

  return (
    <AppPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <AppPopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full max-w-md items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface px-3 py-2 text-left text-sm text-text focus-ring"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="truncate">{selected.email}</span>
                <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-text-dim">
                  {sourceLabel(selected)}
                </span>
              </span>
            ) : (
              <span className="text-text-dim">Select an inbox…</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 flex-none opacity-60" />
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-border-muted p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email, owner, provider…"
              className="pl-9"
            />
          </div>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-text-dim">No matching inboxes.</p>
            ) : (
              filtered.map((a) => {
                const disabled = !a.imap_supported;
                const isSelected = selected != null && accountKey(selected) === accountKey(a);
                const item = (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelect(a);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
                      disabled
                        ? 'cursor-not-allowed'
                        : 'hover:bg-surface-2 focus:bg-surface-2 focus:outline-none'
                    } ${isSelected ? 'bg-surface-2' : ''} ${disabled ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">{a.email}</span>
                      <span className="block truncate text-xs text-text-dim">
                        {a.owner_email ? `owner ${a.owner_email}` : 'system peer'} · {a.provider}
                      </span>
                    </span>
                    <span
                      className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.source === 'peer'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-surface-2 text-text-dim'
                      }`}
                    >
                      {sourceLabel(a)}
                    </span>
                  </button>
                );
                // Disabled buttons swallow pointer events, so the tooltip
                // wraps a span instead of the button itself.
                return disabled ? (
                  <AppTooltip key={accountKey(a)}>
                    <AppTooltipTrigger asChild>
                      <span className="block">{item}</span>
                    </AppTooltipTrigger>
                    <AppTooltipContent>OAuth mailboxes not supported yet</AppTooltipContent>
                  </AppTooltip>
                ) : (
                  <div key={accountKey(a)}>{item}</div>
                );
              })
            )}
          </div>
        </TooltipProvider>
      </AppPopoverContent>
    </AppPopover>
  );
}

// ---------------------------------------------------------------------------
// Message detail dialog
// ---------------------------------------------------------------------------

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
  uid: number;
  onClose: () => void;
}) {
  const q = useMailViewerMessage(source, accountId, folder, uid);
  const d = q.data;
  const warmupId = d?.headers?.x_warmup_id;

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppDialogContent className="sm:max-w-2xl">
        <AppDialogHeader>
          <AppDialogTitle>{d?.subject || (q.isLoading ? 'Loading message…' : '(no subject)')}</AppDialogTitle>
          <AppDialogDescription className="font-mono text-xs">
            {accountEmail} · {folder} · UID {uid}
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-4">
          {q.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-text-dim">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
            </div>
          ) : q.isError ? (
            <div className="rounded-lg border border-accent3/30 bg-accent3/10 p-4 text-sm text-text">
              {extractErrorMessage(q.error, 'Could not load this message.')}
            </div>
          ) : d ? (
            <>
              {warmupId ? (
                <div>
                  <span className="inline-flex items-center rounded-full bg-accent/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-accent">
                    X-Warmup-Id {warmupId}
                  </span>
                </div>
              ) : null}
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-text-dim">From</dt>
                <dd className="break-all font-mono text-text">{d.from || '—'}</dd>
                <dt className="text-text-dim">To</dt>
                <dd className="break-all font-mono text-text">{d.to || '—'}</dd>
                {d.cc ? (
                  <>
                    <dt className="text-text-dim">Cc</dt>
                    <dd className="break-all font-mono text-text">{d.cc}</dd>
                  </>
                ) : null}
                <dt className="text-text-dim">Date</dt>
                <dd className="font-mono text-text">{fmtDate(d.date)}</dd>
                {d.headers?.message_id ? (
                  <>
                    <dt className="text-text-dim">Msg-ID</dt>
                    <dd className="break-all font-mono text-text-dim">{d.headers.message_id}</dd>
                  </>
                ) : null}
              </dl>
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border-muted bg-bg/60 p-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text">
                  {d.text_body || '(empty body)'}
                </pre>
              </div>
            </>
          ) : null}
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MailViewerPage() {
  const accountsQuery = useMailViewerAccounts();
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
  const messagesQuery = useMailViewerMessages(
    selected?.source ?? 'mailbox',
    selected?.id ?? null,
    folder,
  );
  const folders = useMemo(
    () => messagesQuery.data?.folders ?? [],
    [messagesQuery.data],
  );

  // If the loaded folder list doesn't contain the current folder (typically
  // after switching accounts), fall back to INBOX.
  useEffect(() => {
    if (folders.length > 0 && !folders.includes(folder)) {
      setFolder(folders.includes(DEFAULT_FOLDER) ? DEFAULT_FOLDER : (folders[0] ?? DEFAULT_FOLDER));
    }
  }, [folders, folder]);

  const [openUid, setOpenUid] = useState<number | null>(null);
  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);

  return (
    <div className="min-h-screen space-y-6 p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Mail Viewer</h1>
          <p className="text-xs text-text-dim">
            Read-only IMAP inspection of any client mailbox or peer inbox · super_admin only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccountSwitcher accounts={accounts} selected={selected} onSelect={selectAccount} />
          <RefreshButton
            queryKey={ADMIN_KEYS.mailViewerMessages}
            label="Refresh"
          />
        </div>
      </header>

      {/* Folder tabs */}
      {selected && folders.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFolder(f)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] font-semibold transition-colors ${
                f === folder
                  ? 'bg-accent/15 text-accent'
                  : 'bg-surface-2 text-text-dim hover:text-text'
              }`}
            >
              {f}
            </button>
          ))}
          <span className="ml-2 text-[11px] text-text-faint">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {/* Body */}
      {accountsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No viewable inboxes"
          description="No client mailboxes or peer inboxes are available to inspect."
        />
      ) : !selected ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Select an inbox"
          description="Pick a client mailbox or peer inbox above to browse its folders and messages."
        />
      ) : messagesQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {folder}…
        </div>
      ) : messagesQuery.isError ? (
        <div className="space-y-3 rounded-xl border border-accent3/30 bg-accent3/10 p-6 text-sm text-text">
          <p>{describeMessagesError(messagesQuery.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void messagesQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title={`No messages in ${folder}`}
          description="This folder is empty, or the account has no mail in it yet."
        />
      ) : (
        <div className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface-2/40">
          {messages.map((m) => (
            <button
              key={m.uid}
              type="button"
              onClick={() => setOpenUid(m.uid)}
              className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-2/70 focus:bg-surface-2/70 focus:outline-none"
            >
              <span className="w-36 flex-none pt-0.5 font-mono text-[11px] text-text-dim">
                {fmtDate(m.date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-text-dim">
                  {m.from || '—'} → {m.to || '—'}
                </span>
                <span className="mt-0.5 flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {m.subject || '(no subject)'}
                  </span>
                  <span className="truncate text-xs text-text-faint">{m.snippet}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal — mounted only while a message is open. */}
      {openUid != null && selected ? (
        <MessageDetailDialog
          key={`${selected.source}:${selected.id}:${folder}:${openUid}`}
          source={selected.source}
          accountId={selected.id}
          accountEmail={selected.email}
          folder={folder}
          uid={openUid}
          onClose={() => setOpenUid(null)}
        />
      ) : null}
    </div>
  );
}

export default MailViewerPage;
