/**
 * /admin/platform-mail — full mail client for the WarmPulse platform account
 * (super_admin).
 *
 * Three zones: folder rail (unread badges), message list (unread dots, hover
 * mark-unread / delete), and a detail pane (reply, delete, mark unread).
 * Compose + reply go through POST /admin/platform-mail/send over the platform
 * transactional SMTP. This is where admins handle mail addressed to the
 * platform itself (provider notices, abuse replies, bounces).
 *
 * Responsive: the three panes sit side-by-side on xl screens; on narrower
 * widths the detail pane flows to a full-width row below the list.
 */
import { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import {
  AlertOctagon,
  Folder as FolderIcon,
  Inbox,
  Loader2,
  Mail,
  PenSquare,
  Reply,
  Send,
  Trash,
  Trash2,
} from 'lucide-react';
import {
  usePlatformMailDelete,
  usePlatformMailFolders,
  usePlatformMailMessage,
  usePlatformMailMessages,
  usePlatformMailSend,
  usePlatformMailSetSeen,
  type PlatformMailMessageDetail,
} from '@/features/admin/api';
import { extractErrorMessage } from '@/lib/errors';
import { toast } from '@/components/ui/AppToast';
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

const DEFAULT_FOLDER = 'INBOX';

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
      return extractErrorMessage(err, 'IMAP unreachable for the platform account.');
    }
    if (err.response?.status === 400) {
      return extractErrorMessage(err, 'This folder cannot be viewed over IMAP.');
    }
  }
  return extractErrorMessage(err, 'Could not load messages.');
}

/** lucide icon per folder — standard names get semantics, the rest a folder. */
function folderIcon(folder: string): typeof Inbox {
  const f = folder.toUpperCase();
  if (f === 'INBOX') return Inbox;
  if (f.includes('SENT')) return Send;
  if (f.includes('TRASH') || f.includes('DELETED')) return Trash;
  if (f.includes('JUNK') || f.includes('SPAM')) return AlertOctagon;
  return FolderIcon;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ComposeDraft {
  to: string;
  cc: string;
  subject: string;
  body_text: string;
  in_reply_to?: string;
  references?: string;
  /** Shown in the "Replying to …" banner when this is a reply. */
  replyContext?: string;
}

const EMPTY_DRAFT: ComposeDraft = { to: '', cc: '', subject: '', body_text: '' };

// ---------------------------------------------------------------------------
// Compose / reply dialog
// ---------------------------------------------------------------------------

function ComposeDialog({ initial, onClose }: { initial: ComposeDraft; onClose: () => void }) {
  const [draft, setDraft] = useState<ComposeDraft>(initial);
  const sendMut = usePlatformMailSend();

  const set = (patch: Partial<ComposeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const to = draft.to.trim();
  const toOk = EMAIL_RE.test(to);
  const canSend = toOk && draft.subject.trim().length > 0 && draft.body_text.trim().length > 0;

  const submit = () => {
    if (!canSend || sendMut.isPending) return;
    sendMut.mutate(
      {
        to,
        cc: draft.cc.trim() || undefined,
        subject: draft.subject.trim(),
        body_text: draft.body_text,
        in_reply_to: draft.in_reply_to,
        references: draft.references,
      },
      {
        onSuccess: () => {
          toast.success(`Message sent to ${to}`);
          onClose();
        },
      },
    );
  };

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next && !sendMut.isPending) onClose();
      }}
    >
      <AppDialogContent className="sm:max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>{draft.in_reply_to ? 'Reply' : 'Compose'}</AppDialogTitle>
          <AppDialogDescription>
            Sent from the WarmPulse platform mailbox over the transactional SMTP relay.
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogBody className="space-y-4">
          {draft.replyContext ? (
            <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text">
              Replying to <span className="font-mono">{draft.replyContext}</span>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="platform-mail-to" className="text-xs font-medium text-text-dim">
              To <span className="text-accent3">*</span>
            </label>
            <Input
              id="platform-mail-to"
              autoFocus
              value={draft.to}
              onChange={(e) => set({ to: e.target.value })}
              placeholder="recipient@example.com"
              invalid={to.length > 0 && !toOk}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="platform-mail-cc" className="text-xs font-medium text-text-dim">
              Cc
            </label>
            <Input
              id="platform-mail-cc"
              value={draft.cc}
              onChange={(e) => set({ cc: e.target.value })}
              placeholder="optional, comma-separated"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="platform-mail-subject" className="text-xs font-medium text-text-dim">
              Subject <span className="text-accent3">*</span>
            </label>
            <Input
              id="platform-mail-subject"
              value={draft.subject}
              onChange={(e) => set({ subject: e.target.value })}
              placeholder="Subject"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="platform-mail-body" className="text-xs font-medium text-text-dim">
              Body <span className="text-accent3">*</span>
            </label>
            <textarea
              id="platform-mail-body"
              value={draft.body_text}
              onChange={(e) => set({ body_text: e.target.value })}
              rows={8}
              placeholder="Write the message…"
              className="flex w-full resize-y rounded-lg border border-border-muted bg-surface px-3 py-2 font-mono text-xs text-text placeholder:text-text-dim focus-ring focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {sendMut.isError ? (
            <div className="rounded-lg border border-accent3/30 bg-accent3/10 p-3 text-xs text-text">
              {extractErrorMessage(sendMut.error, 'Send failed. Please try again.')}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={sendMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              leftIcon={<Send className="h-3.5 w-3.5" />}
              isLoading={sendMut.isPending}
              disabled={!canSend}
            >
              Send
            </Button>
          </div>
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
  );
}

// ---------------------------------------------------------------------------
// Detail pane (right zone)
// ---------------------------------------------------------------------------

function MessageDetailPane({
  folder,
  uid,
  onReply,
  onDelete,
  onMarkUnread,
}: {
  folder: string;
  uid: number;
  onReply: (d: PlatformMailMessageDetail) => void;
  onDelete: (uid: number) => void;
  onMarkUnread: (uid: number) => void;
}) {
  const q = usePlatformMailMessage(folder, uid);
  const d = q.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border-muted p-3">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Reply className="h-3.5 w-3.5" />}
          disabled={!d}
          onClick={() => d && onReply(d)}
        >
          Reply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Mail className="h-3.5 w-3.5" />}
          onClick={() => onMarkUnread(uid)}
        >
          Mark unread
        </Button>
        <Button
          variant="danger"
          size="sm"
          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => onDelete(uid)}
        >
          Delete
        </Button>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
        </div>
      ) : q.isError ? (
        <div className="m-4 rounded-lg border border-accent3/30 bg-accent3/10 p-4 text-sm text-text">
          {extractErrorMessage(q.error, 'Could not load this message.')}
        </div>
      ) : d ? (
        <>
          <h2 className="px-4 pb-2 pt-4 text-base font-semibold text-text">
            {d.subject || '(no subject)'}
          </h2>
          <dl className="grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-1.5 border-b border-border-muted px-4 pb-3 text-xs">
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text">
              {d.text_body || '(empty body)'}
            </pre>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PlatformMailPage() {
  const foldersQuery = usePlatformMailFolders();
  const folders = useMemo(() => foldersQuery.data?.folders ?? [], [foldersQuery.data]);
  const unread = useMemo(() => foldersQuery.data?.unread ?? {}, [foldersQuery.data]);

  const [folder, setFolder] = useState(DEFAULT_FOLDER);
  const messagesQuery = usePlatformMailMessages(folder);
  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);

  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);

  const seenMut = usePlatformMailSetSeen();
  const deleteMut = usePlatformMailDelete();

  // If the folder list doesn't contain the active folder (renamed/removed on
  // the server), fall back to INBOX and drop the selection.
  useEffect(() => {
    if (folders.length > 0 && !folders.includes(folder)) {
      setFolder(folders.includes(DEFAULT_FOLDER) ? DEFAULT_FOLDER : (folders[0] ?? DEFAULT_FOLDER));
      setSelectedUid(null);
    }
  }, [folders, folder]);

  const switchFolder = (f: string) => {
    setFolder(f);
    setSelectedUid(null);
  };

  const markUnread = (uid: number) => {
    seenMut.mutate(
      { folder, uid, seen: false },
      { onError: (err) => toast.error(extractErrorMessage(err, 'Could not mark unread.')) },
    );
    // Closing the pane matters: refetching the detail would re-mark it read.
    if (selectedUid === uid) setSelectedUid(null);
  };

  const removeMessage = (uid: number) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    deleteMut.mutate(
      { folder, uid },
      {
        onSuccess: () => {
          if (selectedUid === uid) setSelectedUid(null);
        },
        onError: (err) => toast.error(extractErrorMessage(err, 'Delete failed.')),
      },
    );
  };

  const openReply = (d: PlatformMailMessageDetail) => {
    const subject = d.subject.trim();
    setCompose({
      to: d.from || '',
      cc: '',
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject || '(no subject)'}`,
      body_text: '',
      in_reply_to: d.headers?.message_id ?? undefined,
      references: d.headers?.message_id ?? undefined,
      replyContext: `${d.from || 'unknown sender'} · ${d.subject || '(no subject)'}`,
    });
  };

  return (
    <div className="min-h-screen space-y-6 p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Platform Mail</h1>
          <p className="text-xs text-text-dim">
            Send and receive as the WarmPulse platform account · super_admin only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* No queryKey → "refresh whatever's on screen" (folders + list + open message). */}
          <RefreshButton />
          <Button
            size="sm"
            leftIcon={<PenSquare className="h-3.5 w-3.5" />}
            onClick={() => setCompose(EMPTY_DRAFT)}
          >
            Compose
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 md:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,2fr)_minmax(0,3fr)]">
        {/* Left rail — folders with unread badges */}
        <aside className="rounded-xl border border-border-muted bg-surface-2/40 p-2">
          <p className="px-2.5 pb-1.5 pt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            Folders
          </p>
          {foldersQuery.isLoading ? (
            <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-text-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : folders.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-text-dim">No folders.</p>
          ) : (
            folders.map((f) => {
              const Icon = folderIcon(f);
              const active = f === folder;
              const count = unread[f] ?? 0;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => switchFolder(f)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-accent/15 font-semibold text-accent'
                      : 'text-text-dim hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-none" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{f}</span>
                  {count > 0 ? (
                    <span className="flex-none rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg">
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </aside>

        {/* Middle — message list for the active folder */}
        <section className={selectedUid == null ? 'md:col-span-1 xl:col-span-2' : ''}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-dim">
              {folder} · {messages.length} message{messages.length === 1 ? '' : 's'}
            </p>
            {messagesQuery.isFetching && !messagesQuery.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-text-dim" />
            ) : null}
          </div>
          {messagesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-4 py-6 text-sm text-text-dim">
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
              description="This folder is empty, or the platform account has no mail in it yet."
            />
          ) : (
            <div className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface-2/40">
              {messages.map((m) => {
                const isSelected = m.uid === selectedUid;
                return (
                  <div
                    key={m.uid}
                    className={`group flex items-start gap-3 px-4 py-3 transition-colors ${
                      isSelected ? 'bg-surface-2/70' : 'hover:bg-surface-2/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedUid(m.uid)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left focus:outline-none"
                      title="Open message"
                    >
                      <span className="mt-1.5 flex-none">
                        <span
                          className={`block h-2 w-2 rounded-full ${
                            m.seen ? 'bg-transparent' : 'bg-accent'
                          }`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={`min-w-0 truncate text-sm ${
                              m.seen ? 'text-text' : 'font-semibold text-text'
                            }`}
                          >
                            {m.from || '—'}
                          </span>
                          <span className="flex-none font-mono text-[11px] text-text-dim">
                            {fmtDate(m.date)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-text">
                          {m.subject || '(no subject)'}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-faint">
                          {m.snippet}
                        </span>
                      </span>
                    </button>
                    <span className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      {m.seen ? (
                        <button
                          type="button"
                          title="Mark unread"
                          aria-label="Mark unread"
                          onClick={() => markUnread(m.uid)}
                          className="rounded-md p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => removeMessage(m.uid)}
                        className="rounded-md p-1.5 text-text-dim transition-colors hover:bg-surface-2 hover:text-accent3"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right — detail pane for the selected message (full-width row below xl) */}
        {selectedUid != null ? (
          <section className="flex max-h-[calc(100vh-16rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-surface-2/40 md:col-span-2 xl:col-span-1">
            <MessageDetailPane
              key={`${folder}:${selectedUid}`}
              folder={folder}
              uid={selectedUid}
              onReply={openReply}
              onDelete={removeMessage}
              onMarkUnread={markUnread}
            />
          </section>
        ) : null}
      </div>

      {/* Compose / reply dialog — mounted only while composing. */}
      {compose ? (
        <ComposeDialog key={compose.in_reply_to ?? 'new'} initial={compose} onClose={() => setCompose(null)} />
      ) : null}
    </div>
  );
}

export default PlatformMailPage;
