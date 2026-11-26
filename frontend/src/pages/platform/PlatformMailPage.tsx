/**
 * Platform admin Mail — ported from the WarmPulse reference PlatformMailPage
 * (Gmail-style IMAP client for the platform account) to the merged console
 * conventions.
 *
 * Logic + data kept: dynamic IMAP folder rail with unread badges, debounced
 * server-side SEARCH TEXT, message rows with star/seen state, reading pane
 * whose detail fetch marks the message seen, reply / forward / star /
 * mark-unread / delete, attachment chips that download, quick reply, and a
 * compose dialog with Cc + base64 attachments. Forwarding keeps the original
 * HTML in a quoted block (text part gets the flat copy).
 *
 * Restyled onto the shared wm-* mail classes (same three-pane layout as the
 * tenant Mail page); the near-fullscreen reading popup became the inline
 * third pane. HTML bodies render in a sandboxed iframe with a CSP that
 * blocks remote images (tracking pixels never auto-load).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { initials, plainToHtml, shortDate } from '../mail/helpers';
import { fmtDateTime } from '../../lib/format';
import {
  deletePlatformMail,
  describePlatformMailError,
  downloadPlatformMailAttachment,
  getPlatformMailFolders,
  getPlatformMailMessage,
  getPlatformMailMessages,
  sendPlatformMail,
  setPlatformMailSeen,
  setPlatformMailStar,
} from '../../lib/platformAdmin';
import type { PlatformMailDetail, PlatformMailSendAttachment } from '../../lib/platformAdmin';

const DEFAULT_FOLDER = 'INBOX';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Read a File as base64 without the data: prefix. */
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

/* ---------------- compose / reply / forward ---------------- */

interface ComposeDraft {
  to: string;
  cc: string;
  subject: string;
  body_text: string;
  in_reply_to?: string;
  references?: string;
  replyContext?: string;
  /** Forwarded original (plain) — appended below the intro on send. */
  quote_text?: string;
  /** Forwarded original (sanitized HTML) — sent as the multipart HTML part. */
  quote_html?: string;
  forwardContext?: string;
}

const EMPTY_DRAFT: ComposeDraft = { to: '', cc: '', subject: '', body_text: '' };

function ComposeModal({ demo, initial, onClose, onSent }: { demo: boolean; initial: ComposeDraft; onClose: () => void; onSent: () => void }) {
  const [draft, setDraft] = useState<ComposeDraft>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const to = draft.to.trim();
  const toOk = EMAIL_RE.test(to);
  // forwards carry the original below a possibly-empty intro; fresh compose needs a body
  const hasBody = draft.body_text.trim().length > 0 || !!draft.quote_text;
  const canSend = toOk && draft.subject.trim().length > 0 && hasBody;

  const set = (patch: Partial<ComposeDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    if (next.reduce((acc, f) => acc + f.size, 0) > 10 * 1024 * 1024) {
      toast.error('Attachments exceed the 10 MB total limit.');
      return;
    }
    setFiles(next);
  }

  async function submit() {
    if (!canSend || busy) return;
    setBusy(true);
    setError('');
    let attachments: PlatformMailSendAttachment[] | undefined;
    if (files.length > 0) {
      attachments = await Promise.all(
        files.map(async (f) => ({ filename: f.name, content_type: f.type || 'application/octet-stream', content_b64: await fileToB64(f) })),
      );
    }
    const r = await sendPlatformMail({
      to,
      cc: draft.cc.trim() || undefined,
      subject: draft.subject.trim(),
      body_text: draft.quote_text ? `${draft.body_text}\n\n${draft.quote_text}` : draft.body_text,
      body_html: draft.quote_html
        ? `<div>${escapeHtml(draft.body_text).replace(/\n/g, '<br>')}</div><br><br>${draft.quote_html}`
        : plainToHtml(draft.body_text),
      in_reply_to: draft.in_reply_to,
      references: draft.references,
      attachments,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Message sent to ${to}`);
    onSent();
    onClose();
  }

  return (
    <Modal
      title={draft.in_reply_to ? 'Reply' : 'Compose'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            Attach files ({files.length})
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSend || busy} onClick={() => void submit()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {demo && <p role="note">Demo data is read-only.</p>}
      {draft.replyContext && (
        <p className="field-hint" style={{ margin: '0 0 10px' }}>Replying to <strong>{draft.replyContext}</strong></p>
      )}
      {error && <p className="pf-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
      <label className="field">
        <span className="field-label">To *</span>
        <input type="email" value={draft.to} onChange={(e) => set({ to: e.target.value })} placeholder="recipient@example.com" autoComplete="off" data-autofocus />
      </label>
      <label className="field">
        <span className="field-label">Cc</span>
        <input value={draft.cc} onChange={(e) => set({ cc: e.target.value })} placeholder="optional, comma-separated" autoComplete="off" />
      </label>
      <label className="field">
        <span className="field-label">Subject *</span>
        <input value={draft.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Subject" />
      </label>
      <label className="field">
        <span className="field-label">Body {draft.quote_text == null && '*'}</span>
        <textarea
          rows={8}
          value={draft.body_text}
          onChange={(e) => set({ body_text: e.target.value })}
          placeholder={draft.quote_text != null ? 'Optional note above the forwarded message…' : 'Write the message…'}
        />
      </label>
      {draft.quote_text != null && (
        <div style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 10px', background: 'var(--panel-2)' }}>
          <small>
            <strong>{draft.forwardContext ? `Forwarding: ${draft.forwardContext}` : 'Forwarded message attached'}</strong>
            {draft.quote_html && ' · original formatting preserved'}
          </small>
          <p style={{ margin: '6px 0 0', maxHeight: 64, overflow: 'hidden', fontSize: 11, color: 'var(--text-3)' }}>
            {draft.quote_text.replace(/\s+/g, ' ').slice(0, 220)}
          </p>
        </div>
      )}
      {files.length > 0 && (
        <ul className="pf-actions" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, gap: 6 }}>
          {files.map((f, i) => (
            <li key={`${f.name}:${i}`} className="chip">
              {f.name} <small>{humanSize(f.size)}</small>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------------- reading pane ---------------- */

/** HTML mails render on a white card in a sandboxed iframe; CSP blocks remote images. */
function MessageBody({ detail }: { detail: PlatformMailDetail }) {
  if (detail.html_body) {
    const doc =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="img-src \'none\'; style-src \'unsafe-inline\'">' +
      '<style>' +
      'html,body,*{scrollbar-width:none;-ms-overflow-style:none}' +
      '::-webkit-scrollbar,*::-webkit-scrollbar{display:none;width:0;height:0}' +
      'body{margin:0;padding:18px;background:#fff;color:#1f1b16;' +
      'font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}' +
      'img{max-width:100%;height:auto}a{color:#c2410c}table{max-width:100%}' +
      '</style></head><body>' +
      detail.html_body +
      '</body></html>';
    return <iframe title={`Message body: ${detail.subject || '(no subject)'}`} className="wm-read-frame" srcDoc={doc} sandbox="" />;
  }
  return <pre className="wm-read-text">{detail.text_body}</pre>;
}

function AttachmentChips({ folder, uid, attachments, demo }: { folder: string; uid: number; attachments: NonNullable<PlatformMailDetail['attachments']>; demo: boolean }) {
  if (!attachments.length) return null;
  return (
    <div className="pf-actions" style={{ padding: '10px 16px', borderTop: '1px solid var(--border-soft)' }}>
      {attachments.map((a) => (
        <button
          key={a.part}
          type="button"
          className="btn btn-sm"
          title={`Download ${a.filename}`}
          disabled={demo}
          onClick={() => {
            void downloadPlatformMailAttachment(folder, uid, a.part, a.filename).then((r) => {
              if (!r.ok) toast.error(r.error);
            });
          }}
        >
          {a.filename} <small>({humanSize(a.size)})</small>
        </button>
      ))}
    </div>
  );
}

function QuickReply({ detail, demo, onSent }: { detail: PlatformMailDetail; demo: boolean; onSent: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const to = detail.from || '';
  const subject = detail.subject.trim();
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject || '(no subject)'}`;
  const canSend = EMAIL_RE.test(to) && text.trim().length > 0;

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    const r = await sendPlatformMail({
      to,
      subject: replySubject,
      body_text: text,
      body_html: plainToHtml(text),
      in_reply_to: detail.headers?.message_id ?? undefined,
      references: detail.headers?.message_id ?? undefined,
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Reply sent to ${to}`);
    setText('');
    onSent();
  }

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-soft)' }}>
      <p className="field-hint" style={{ margin: '0 0 6px' }}>Reply to <strong>{senderName(to)}</strong></p>
      <label className="field">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${senderName(to)}…`} disabled={busy || demo} />
      </label>
      <div className="pf-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!canSend || busy || demo} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

function ReadPane({
  folder,
  uid,
  demo,
  onClose,
  onReply,
  onForward,
  onMarkUnread,
  onDelete,
  onStar,
  onSent,
  busy,
}: {
  folder: string;
  uid: number;
  demo: boolean;
  onClose: () => void;
  onReply: (d: PlatformMailDetail) => void;
  onForward: (d: PlatformMailDetail) => void;
  onMarkUnread: (uid: number) => void;
  onDelete: (uid: number) => void;
  onStar: (uid: number, starred: boolean) => void;
  onSent: () => void;
  busy: boolean;
}) {
  const q = useAsync(() => getPlatformMailMessage(folder, uid), [folder, uid]);
  const d = q.data;

  return (
    <section className="wm-read" aria-label="Reading pane">
      <header className="wm-read-head">
        <div className="wm-read-title">
          {q.loading && !d && <Skeleton rows={2} />}
          {q.error && <LoadError message={describePlatformMailError(q.error, 'Could not load this message.')} onRetry={() => void q.reload()} />}
          {d && (
            <>
              <h2>{d.subject || '(no subject)'}</h2>
              <p>
                <strong>{senderName(d.from)}</strong> &lt;{d.from}&gt; → {d.to}
                {d.cc ? ` · cc ${d.cc}` : ''} · {fmtDateTime(d.date, 'medium')}
                {d.headers?.message_id ? <> · <small>{d.headers.message_id}</small></> : null}
              </p>
            </>
          )}
        </div>
        {d && (
          <div className="wm-read-actions">
            <button type="button" className="btn btn-sm" onClick={() => onReply(d)} disabled={busy}>Reply</button>
            <button type="button" className="btn btn-sm" onClick={() => onForward(d)} disabled={busy}>Forward</button>
            <button
              type="button"
              className={`icon-btn${d.starred ? ' wm-flag on' : ''}`}
              onClick={() => onStar(uid, !d.starred)}
              disabled={busy}
              title={d.starred ? 'Remove star' : 'Star'}
              aria-label={d.starred ? 'Remove star' : 'Star'}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={d.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.8 1.1-5.8L3.5 9.8l5.9-.8L12 3.6Z" />
              </svg>
            </button>
            <button type="button" className="icon-btn" onClick={() => onMarkUnread(uid)} disabled={busy} title="Mark unread" aria-label="Mark unread">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
            </button>
            <button type="button" className="icon-btn wm-trash-btn" onClick={() => onDelete(uid)} disabled={busy} title="Delete" aria-label="Delete message">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
              </svg>
            </button>
            <button type="button" className="icon-btn wm-read-close" onClick={onClose} title="Close" aria-label="Close message">×</button>
          </div>
        )}
      </header>
      {q.loading && !d && <div className="wm-read-pad"><Skeleton rows={6} height={20} /></div>}
      {d && (
        <>
          <MessageBody detail={d} />
          <AttachmentChips folder={folder} uid={uid} attachments={d.attachments ?? []} demo={demo} />
          <QuickReply detail={d} demo={demo} onSent={onSent} />
        </>
      )}
      {busy && (
        <div className="wm-read-busy" role="status">
          <span className="spinner" aria-hidden /> working…
        </div>
      )}
    </section>
  );
}

/* ---------------- page ---------------- */

export function PlatformMailPage({ demo = false }: { demo?: boolean }) {
  const folders = useAsync(getPlatformMailFolders, []);
  const [folder, setFolder] = useState(DEFAULT_FOLDER);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const messages = useAsync(() => getPlatformMailMessages(folder, search), [folder, search]);

  // debounce the search box → server SEARCH TEXT (headers + body)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const folderNames = useMemo(() => folders.data?.folders ?? [], [folders.data]);
  const unread = folders.data?.unread ?? {};
  const rows = messages.data?.messages ?? [];

  // if the active folder vanished server-side (renamed/removed), fall back
  useEffect(() => {
    if (folderNames.length > 0 && !folderNames.includes(folder)) {
      setFolder(folderNames.includes(DEFAULT_FOLDER) ? DEFAULT_FOLDER : folderNames[0] ?? DEFAULT_FOLDER);
      setSelectedUid(null);
    }
  }, [folderNames, folder]);

  /** detail fetch marks the message seen server-side → counters go stale */
  function refreshCounts() {
    void messages.reload();
    void folders.reload();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string | null, after?: () => void) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? 'Action failed.');
    if (okMsg) toast.success(okMsg);
    refreshCounts();
    after?.();
  }

  const markUnread = (uid: number) => {
    // closing the pane matters: refetching the detail would re-mark it read
    void run(() => setPlatformMailSeen(folder, uid, false), null, () => {
      if (selectedUid === uid) setSelectedUid(null);
    });
  };

  const toggleStar = (uid: number, starred: boolean) => void run(() => setPlatformMailStar(folder, uid, starred), null);

  const removeMessage = (uid: number) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    void run(() => deletePlatformMail(folder, uid), 'Message deleted.', () => {
      if (selectedUid === uid) setSelectedUid(null);
    });
  };

  const openReply = (d: PlatformMailDetail) => {
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

  const openForward = (d: PlatformMailDetail) => {
    const subject = d.subject.trim();
    const header = [
      '---------- Forwarded message ----------',
      `From: ${d.from || '(unknown)'}`,
      `Date: ${d.date || ''}`,
      `Subject: ${subject || '(no subject)'}`,
    ];
    const quote_text = `${header.join('\n')}\n\n${d.text_body || ''}`;
    // Gmail-style quoted HTML — the original's rendered HTML in a left-rule
    // container. html_body was already sanitized server-side.
    const quote_html = d.html_body
      ? `<div>${header.map((l) => `${escapeHtml(l)}<br>`).join('')}</div><br>` +
        `<div style="padding-left:10px;margin:0 0 0 .8ex;border-left:1px solid #cccccc">${d.html_body}</div>`
      : undefined;
    setCompose({
      to: '',
      cc: '',
      subject: /^fwd:/i.test(subject) ? subject : `Fwd: ${subject || '(no subject)'}`,
      body_text: '',
      quote_text,
      quote_html,
      forwardContext: `${d.from || 'unknown sender'} · ${subject || '(no subject)'}`,
    });
  };

  return (
    <>
      <header className="mail-toolbar" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: 0 }}>Platform Mail</h1>
          <p className="field-hint" style={{ margin: '2px 0 0' }}>Send and receive as the WarmPulse platform account · super_admin only.</p>
        </div>
        <div className="mail-search" role="search" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.4-4.4" />
          </svg>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search ${folder}`}
            aria-label="Search messages"
          />
          {searchInput && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => {
                setSearchInput('');
                setSearch('');
              }}
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => { void folders.reload(); void messages.reload(); }}
          title="Refresh folders and list"
          aria-label="Refresh folders and list"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v4h-4" />
          </svg>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCompose(EMPTY_DRAFT)} disabled={demo}>Compose</button>
      </header>

      <div className="mail-layout">
        {/* folder rail — dynamic IMAP folders with unread badges */}
        <nav className="wm-rail" aria-label="Mail folders">
          {folders.loading && !folders.data ? (
            <Skeleton rows={5} height={34} />
          ) : folderNames.length === 0 ? (
            <p className="field-hint">No folders.</p>
          ) : (
            <ul className="wm-folders">
              {folderNames.map((f) => {
                const count = unread[f] ?? 0;
                return (
                  <li key={f}>
                    <button
                      type="button"
                      className={`wm-folder${f === folder ? ' active' : ''}`}
                      onClick={() => {
                        setFolder(f);
                        setSelectedUid(null);
                      }}
                      aria-current={f === folder ? 'true' : undefined}
                    >
                      <span className="wm-folder-name">{f}</span>
                      {count > 0 && <span className="wm-folder-count unread">{count > 99 ? '99+' : count}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* message list */}
        <div className="wm-list-col">
          <section className="wm-list" aria-label="Message list">
            <header className="wm-list-head">
              <strong>{folder === 'INBOX' ? 'Inbox' : folder}</strong>
              {search && (
                <button type="button" className="wm-search-chip" onClick={() => { setSearchInput(''); setSearch(''); }} title="Clear search">
                  “{search}” ×
                </button>
              )}
              <span className="wm-list-count">
                {messages.loading && messages.data ? 'refreshing…' : `${rows.length} message${rows.length === 1 ? '' : 's'}`}
              </span>
            </header>
            {messages.error && !messages.data ? (
              <div className="wm-list-state">
                <LoadError message={describePlatformMailError(messages.error, 'Could not load messages.')} onRetry={() => void messages.reload()} />
              </div>
            ) : messages.loading && !messages.data ? (
              <div className="wm-list-state"><Skeleton rows={6} height={58} /></div>
            ) : rows.length === 0 ? (
              <div className="wm-list-state">
                <EmptyState title={search ? `No results for “${search}”` : `No messages in ${folder}`}>
                  {search ? 'Nothing in this folder matches the search.' : 'This folder is empty, or the platform account has no mail in it yet.'}
                </EmptyState>
              </div>
            ) : (
              <div className="wm-rows" role="list">
                {rows.map((m) => (
                  <div key={m.uid} className={`wm-row${m.seen ? '' : ' unread'}${m.uid === selectedUid ? ' active' : ''}`} role="listitem">
                    <button type="button" className="wm-row-main" onClick={() => setSelectedUid(m.uid)} title="Open message">
                      <span className="avatar wm-avatar" aria-hidden>{initials(senderName(m.from))}</span>
                      <span className="wm-row-body">
                        <span className="wm-row-top">
                          <span className="wm-row-from">{senderName(m.from)}</span>
                          {!m.seen && <span className="wm-unread-dot" aria-label="unread" />}
                          <span className="wm-row-time">{shortDate(m.date)}</span>
                        </span>
                        <span className="wm-row-subject">{m.subject || '(no subject)'}</span>
                        <span className="wm-row-snippet">{m.snippet}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`wm-flag${m.starred ? ' on' : ''}`}
                      onClick={() => toggleStar(m.uid, !m.starred)}
                      disabled={busy}
                      aria-pressed={m.starred}
                      aria-label={m.starred ? 'Remove star' : 'Star this message'}
                      title={m.starred ? 'Remove star' : 'Star this message'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={m.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.8 1.1-5.8L3.5 9.8l5.9-.8L12 3.6Z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* reading pane */}
        {selectedUid !== null ? (
          <ReadPane
            key={`${folder}:${selectedUid}`}
            folder={folder}
            uid={selectedUid}
            demo={demo}
            busy={busy}
            onClose={() => setSelectedUid(null)}
            onReply={openReply}
            onForward={openForward}
            onMarkUnread={markUnread}
            onDelete={removeMessage}
            onStar={toggleStar}
            onSent={refreshCounts}
          />
        ) : (
          <section className="wm-read" aria-label="Reading pane">
            <EmptyState title="No message selected">Pick a message from the list to read it here.</EmptyState>
          </section>
        )}
      </div>

      {compose && (
        <ComposeModal
          key={compose.in_reply_to ?? compose.subject.slice(0, 24)}
          demo={demo}
          initial={compose}
          onClose={() => setCompose(null)}
          onSent={refreshCounts}
        />
      )}
    </>
  );
}

export default PlatformMailPage;
