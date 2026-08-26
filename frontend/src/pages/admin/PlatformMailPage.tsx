/**
 * /admin/platform-mail — Gmail-style mail client for the WarmPulse platform
 * account (super_admin).
 *
 * Layout mirrors Gmail: folder rail with unread badges, search in the header
 * (server-side IMAP SEARCH TEXT), message rows with star + avatar + inline
 * snippet, and a reading pane that opens a mail "like the original client":
 * toolbar (reply / forward / star / mark unread / delete), sender row with a
 * "to me" details popover, the HTML body rendered in a sandboxed iframe
 * (MailBodyView) on a white card, attachment chips that download, and a
 * quick-reply box at the bottom.
 *
 * Responsive: the panes sit side-by-side on xl screens; on narrower widths
 * the reading pane flows to a full-width row below the list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import {
  AlertOctagon,
  ArrowLeft,
  ChevronDown,
  Download,
  Folder as FolderIcon,
  Forward,
  Inbox,
  Loader2,
  MailOpen,
  Paperclip,
  PenSquare,
  Reply,
  Search,
  Send,
  Star,
  Trash,
  Trash2,
  X,
} from 'lucide-react';
import {
  downloadPlatformMailAttachment,
  usePlatformMailDelete,
  usePlatformMailFolders,
  usePlatformMailMessage,
  usePlatformMailMessages,
  usePlatformMailSend,
  usePlatformMailSetSeen,
  usePlatformMailSetStar,
  type PlatformMailAttachmentInfo,
  type PlatformMailMessageDetail,
  type PlatformMailSendAttachment,
} from '@/features/admin/api';
import { extractErrorMessage } from '@/lib/errors';
import { toast } from '@/components/ui/AppToast';
import { MailBodyView } from '@/components/admin/MailBodyView';
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

const DEFAULT_FOLDER = 'INBOX';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** "14:42" today, "24 Aug" this year, "24 Aug 25" older — Gmail-style. */
function fmtShortDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: '2-digit' };
  return d.toLocaleDateString(undefined, opts);
}

function fmtFullDate(value: string | null | undefined): string {
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

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Display name from a "Name <a@b>" header, else the bare address. */
function senderName(from: string | null | undefined): string {
  const raw = (from || '').trim();
  if (!raw) return '(unknown)';
  const m = raw.match(/^(.*?)\s*<[^>]+>$/);
  const name = (m?.[1] ?? '').replace(/^"|"$/g, '').trim();
  return name || raw;
}

function firstInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

// Avatar palette — semantic tokens only (DESIGN.md).
const AVATAR_CLASSES = [
  'bg-accent/20 text-accent',
  'bg-accent2/20 text-accent2',
  'bg-accent3/20 text-accent3',
  'bg-surface-2 text-text',
  'bg-accent/10 text-accent',
];

function avatarClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_CLASSES[h % AVATAR_CLASSES.length] ?? 'bg-accent/20 text-accent';
}

function Avatar({ label, seed, size = 'h-9 w-9 text-sm' }: { label: string; seed: string; size?: string }) {
  return (
    <span
      aria-hidden
      className={`flex flex-none items-center justify-center rounded-full font-semibold ${size} ${avatarClass(seed)}`}
    >
      {label}
    </span>
  );
}

/** Human copy for a messages-load failure: 502 = IMAP dead, 400 = backend detail. */
function describeMessagesError(err: unknown): string {
  if (err instanceof AxiosError) {
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

/** Read a File as base64 (without the data: prefix). */
function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Compose / reply dialog
// ---------------------------------------------------------------------------

function ComposeDialog({ initial, onClose }: { initial: ComposeDraft; onClose: () => void }) {
  const [draft, setDraft] = useState<ComposeDraft>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendMut = usePlatformMailSend();

  const set = (patch: Partial<ComposeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const to = draft.to.trim();
  const toOk = EMAIL_RE.test(to);
  const canSend = toOk && draft.subject.trim().length > 0 && draft.body_text.trim().length > 0;

  const submit = () => {
    if (!canSend || sendMut.isPending) return;
    void (async () => {
      let attachments: PlatformMailSendAttachment[] | undefined;
      if (files.length > 0) {
        attachments = await Promise.all(
          files.map(async (f) => ({
            filename: f.name,
            content_type: f.type || 'application/octet-stream',
            content_b64: await fileToB64(f),
          })),
        );
      }
      sendMut.mutate(
        {
          to,
          cc: draft.cc.trim() || undefined,
          subject: draft.subject.trim(),
          body_text: draft.body_text,
          in_reply_to: draft.in_reply_to,
          references: draft.references,
          attachments,
        },
        {
          onSuccess: () => {
            toast.success(`Message sent to ${to}`);
            onClose();
          },
        },
      );
    })();
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const next = [...files, ...incoming].slice(0, 10);
    const total = next.reduce((acc, f) => acc + f.size, 0);
    if (total > 10 * 1024 * 1024) {
      toast.error('Attachments exceed the 10 MB total limit.');
      return;
    }
    setFiles(next);
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

          {/* Attachments */}
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}:${i}`}
                  className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text"
                >
                  <Paperclip className="h-3 w-3 text-text-dim" />
                  <span className="max-w-[12rem] truncate">{f.name}</span>
                  <span className="text-text-faint">{humanSize(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                    className="rounded-full p-0.5 text-text-dim hover:bg-surface hover:text-text"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {sendMut.isError ? (
            <div className="rounded-lg border border-accent3/30 bg-accent3/10 p-3 text-xs text-text">
              {extractErrorMessage(sendMut.error, 'Send failed. Please try again.')}
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Paperclip className="h-3.5 w-3.5" />}
              onClick={() => fileRef.current?.click()}
            >
              Attach files
            </Button>
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
          </div>
        </AppDialogBody>
      </AppDialogContent>
    </AppDialog>
  );
}

// ---------------------------------------------------------------------------
// Reading pane — Gmail-style open message
// ---------------------------------------------------------------------------

function AttachmentChips({
  folder,
  uid,
  attachments,
}: {
  folder: string;
  uid: number;
  attachments: PlatformMailAttachmentInfo[];
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {attachments.map((a) => (
        <button
          key={a.part}
          type="button"
          title={`Download ${a.filename}`}
          onClick={() => {
            void downloadPlatformMailAttachment(folder, uid, a.part, a.filename).catch((err) =>
              toast.error(extractErrorMessage(err, 'Download failed.')),
            );
          }}
          className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text transition-colors hover:border-accent/50 hover:bg-surface"
        >
          <Paperclip className="h-3.5 w-3.5 flex-none text-text-dim" />
          <span className="max-w-[14rem] truncate font-medium">{a.filename}</span>
          <span className="flex-none text-text-faint">{humanSize(a.size)}</span>
          <Download className="h-3.5 w-3.5 flex-none text-text-dim" />
        </button>
      ))}
    </div>
  );
}

function QuickReply({ detail }: { detail: PlatformMailMessageDetail }) {
  const [text, setText] = useState('');
  const sendMut = usePlatformMailSend();
  const to = detail.from || '';
  const subject = detail.subject.trim();
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject || '(no subject)'}`;
  const canSend = EMAIL_RE.test(to) && text.trim().length > 0;

  const send = () => {
    if (!canSend || sendMut.isPending) return;
    sendMut.mutate(
      {
        to,
        subject: replySubject,
        body_text: text,
        in_reply_to: detail.headers?.message_id ?? undefined,
        references: detail.headers?.message_id ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Reply sent to ${to}`);
          setText('');
        },
      },
    );
  };

  return (
    <div className="mt-1 rounded-xl border border-border-muted bg-surface-2/60 p-3">
      <p className="pb-2 text-xs text-text-dim">
        Reply to <span className="font-medium text-text">{senderName(to)}</span>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={`Reply to ${senderName(to)}…`}
        className="flex w-full resize-y rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus-ring focus:border-accent"
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button
          size="sm"
          onClick={send}
          leftIcon={<Send className="h-3.5 w-3.5" />}
          isLoading={sendMut.isPending}
          disabled={!canSend}
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function MessageDetailPane({
  folder,
  uid,
  onBack,
  onReply,
  onForward,
  onDelete,
  onMarkUnread,
  onStar,
}: {
  folder: string;
  uid: number;
  onBack: () => void;
  onReply: (d: PlatformMailMessageDetail) => void;
  onForward: (d: PlatformMailMessageDetail) => void;
  onDelete: (uid: number) => void;
  onMarkUnread: (uid: number) => void;
  onStar: (uid: number, starred: boolean) => void;
}) {
  const q = usePlatformMailMessage(folder, uid);
  const d = q.data;
  const [showDetails, setShowDetails] = useState(false);

  const toLabel = (() => {
    const raw = (d?.to || '').trim();
    if (!raw) return 'to me';
    const name = senderName(raw);
    return name.toLowerCase() === raw.toLowerCase() ? `to ${raw}` : `to ${name}`;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border-muted px-2 py-1.5">
        <button
          type="button"
          title="Back to list"
          aria-label="Back to list"
          onClick={onBack}
          className="rounded-lg p-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex-1" />
        {d ? (
          <>
            <button
              type="button"
              title="Reply"
              aria-label="Reply"
              onClick={() => onReply(d)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Reply className="h-4 w-4" /> Reply
            </button>
            <button
              type="button"
              title="Forward"
              aria-label="Forward"
              onClick={() => onForward(d)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Forward className="h-4 w-4" /> Forward
            </button>
            <button
              type="button"
              title={d.starred ? 'Remove star' : 'Star'}
              aria-label={d.starred ? 'Remove star' : 'Star'}
              onClick={() => onStar(uid, !d.starred)}
              className={`rounded-lg p-2 transition-colors hover:bg-surface-2 ${
                d.starred ? 'text-accent3' : 'text-text-dim hover:text-text'
              }`}
            >
              <Star className={`h-4 w-4 ${d.starred ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              title="Mark unread"
              aria-label="Mark unread"
              onClick={() => onMarkUnread(uid)}
              className="rounded-lg p-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
            >
              <MailOpen className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Delete"
              aria-label="Delete"
              onClick={() => onDelete(uid)}
              className="rounded-lg p-2 text-text-dim transition-colors hover:bg-surface-2 hover:text-accent3"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
          </div>
        ) : q.isError ? (
          <div className="m-4 rounded-lg border border-accent3/30 bg-accent3/10 p-4 text-sm text-text">
            {extractErrorMessage(q.error, 'Could not load this message.')}
          </div>
        ) : d ? (
          <div className="p-4">
            <h2 className="pb-3 text-lg font-bold text-text">{d.subject || '(no subject)'}</h2>

            {/* Sender row */}
            <div className="flex items-start gap-3 pb-3">
              <Avatar label={firstInitial(senderName(d.from))} seed={d.from || '?'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {senderName(d.from)}{' '}
                  <span className="font-normal text-text-faint">&lt;{d.from}&gt;</span>
                </p>
                <AppPopover open={showDetails} onOpenChange={setShowDetails}>
                  <AppPopoverTrigger asChild>
                    <button
                      type="button"
                      className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-text-dim hover:text-text"
                    >
                      {toLabel} <ChevronDown className="h-3 w-3" />
                    </button>
                  </AppPopoverTrigger>
                  <AppPopoverContent align="start" className="w-80">
                    <dl className="space-y-1.5 text-xs">
                      <div>
                        <dt className="text-text-dim">From</dt>
                        <dd className="break-all font-mono text-text">{d.from || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-text-dim">To</dt>
                        <dd className="break-all font-mono text-text">{d.to || '—'}</dd>
                      </div>
                      {d.cc ? (
                        <div>
                          <dt className="text-text-dim">Cc</dt>
                          <dd className="break-all font-mono text-text">{d.cc}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="text-text-dim">Date</dt>
                        <dd className="font-mono text-text">{fmtFullDate(d.date)}</dd>
                      </div>
                      {d.headers?.message_id ? (
                        <div>
                          <dt className="text-text-dim">Msg-ID</dt>
                          <dd className="break-all font-mono text-text-dim">
                            {d.headers.message_id}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </AppPopoverContent>
                </AppPopover>
              </div>
              <span className="flex-none pt-0.5 text-xs text-text-dim">{fmtFullDate(d.date)}</span>
            </div>

            {/* Body — HTML mails render on a white card "like the original";
                plain text stays on the themed surface (no hardcoded colors). */}
            {d.html_body ? (
              <div className="overflow-hidden rounded-xl border border-border-muted bg-white">
                <MailBodyView
                  html={d.html_body}
                  text={d.text_body}
                  htmlClassName="h-full min-h-[280px] w-full border-0 bg-white"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border-muted bg-surface px-4 py-3">
                <MailBodyView
                  text={d.text_body}
                  textClassName="whitespace-pre-wrap break-words text-sm leading-relaxed text-text"
                />
              </div>
            )}

            {d.attachments?.length ? (
              <AttachmentChips folder={folder} uid={uid} attachments={d.attachments} />
            ) : null}

            <div className="pt-2">
              <QuickReply detail={d} />
            </div>
          </div>
        ) : null}
      </div>
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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const messagesQuery = usePlatformMailMessages(folder, search);
  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);

  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);

  const seenMut = usePlatformMailSetSeen();
  const starMut = usePlatformMailSetStar();
  const deleteMut = usePlatformMailDelete();

  // Debounce the search box → server SEARCH TEXT.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  const toggleStar = (uid: number, starred: boolean) => {
    starMut.mutate(
      { folder, uid, starred },
      { onError: (err) => toast.error(extractErrorMessage(err, 'Could not update the star.')) },
    );
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

  const openForward = (d: PlatformMailMessageDetail) => {
    const subject = d.subject.trim();
    const quoted = [
      '---------- Forwarded message ----------',
      `From: ${d.from || '(unknown)'}`,
      `Date: ${d.date || ''}`,
      `Subject: ${subject || '(no subject)'}`,
      '',
      d.text_body || '',
    ].join('\n');
    setCompose({
      to: '',
      cc: '',
      subject: /^fwd:/i.test(subject) ? subject : `Fwd: ${subject || '(no subject)'}`,
      body_text: `\n\n${quoted}`,
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${folder}`}
              className="w-56 pl-9 pr-8"
              aria-label="Search messages"
            />
            {searchInput ? (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-dim hover:bg-surface-2 hover:text-text"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
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

        {/* Middle — message list for the active folder (Gmail rows) */}
        <section className={selectedUid == null ? 'md:col-span-1 xl:col-span-2' : ''}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-dim">
              {search ? (
                <>
                  Search “{search}” in {folder} · {messages.length} result
                  {messages.length === 1 ? '' : 's'}
                </>
              ) : (
                <>
                  {folder} · {messages.length} message{messages.length === 1 ? '' : 's'}
                </>
              )}
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
              title={search ? `No results for “${search}”` : `No messages in ${folder}`}
              description={
                search
                  ? 'Nothing in this folder matches the search.'
                  : 'This folder is empty, or the platform account has no mail in it yet.'
              }
            />
          ) : (
            <div className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface-2/40">
              {messages.map((m) => {
                const isSelected = m.uid === selectedUid;
                const name = senderName(m.from);
                return (
                  <div
                    key={m.uid}
                    className={`group flex items-start gap-2 px-3 py-2.5 transition-colors ${
                      isSelected ? 'bg-surface-2/70' : 'hover:bg-surface-2/70'
                    }`}
                  >
                    <button
                      type="button"
                      title={m.starred ? 'Remove star' : 'Star'}
                      aria-label={m.starred ? 'Remove star' : 'Star'}
                      onClick={() => toggleStar(m.uid, !m.starred)}
                      className={`mt-1 rounded-md p-1 transition-colors hover:bg-surface ${
                        m.starred ? 'text-accent3' : 'text-text-faint opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${m.starred ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedUid(m.uid)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                      title="Open message"
                    >
                      <Avatar
                        label={firstInitial(name)}
                        seed={m.from || '?'}
                        size="h-8 w-8 text-xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={`min-w-0 truncate text-sm ${
                              m.seen ? 'text-text' : 'font-bold text-text'
                            }`}
                          >
                            {name}
                          </span>
                          <span className="flex-none text-[11px] text-text-dim">
                            {fmtShortDate(m.date)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-baseline gap-2">
                          <span
                            className={`min-w-0 truncate text-sm ${
                              m.seen ? 'text-text-dim' : 'font-semibold text-text'
                            }`}
                          >
                            {m.subject || '(no subject)'}
                          </span>
                          <span className="hidden min-w-0 flex-1 truncate text-xs text-text-faint md:block">
                            — {m.snippet}
                          </span>
                        </span>
                      </span>
                      {!m.seen ? (
                        <span className="mt-2 flex-none">
                          <span className="block h-2 w-2 rounded-full bg-accent" title="Unread" />
                        </span>
                      ) : null}
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
                          <MailOpen className="h-3.5 w-3.5" />
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

        {/* Right — Gmail-style reading pane (full-width row below xl) */}
        {selectedUid != null ? (
          <section className="flex max-h-[calc(100vh-16rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-surface-2/40 md:col-span-2 xl:col-span-1">
            <MessageDetailPane
              key={`${folder}:${selectedUid}`}
              folder={folder}
              uid={selectedUid}
              onBack={() => setSelectedUid(null)}
              onReply={openReply}
              onForward={openForward}
              onDelete={removeMessage}
              onMarkUnread={markUnread}
              onStar={toggleStar}
            />
          </section>
        ) : null}
      </div>

      {/* Compose / reply dialog — mounted only while composing. */}
      {compose ? (
        <ComposeDialog
          key={compose.in_reply_to ?? compose.body_text.slice(0, 24)}
          initial={compose}
          onClose={() => setCompose(null)}
        />
      ) : null}
    </div>
  );
}

export default PlatformMailPage;
