import { useCallback, useEffect, useMemo, useState } from 'react';
import { approveDraft, bulkApproveDrafts, getDrafts, rejectDraft, sendDraft } from '../lib/api';
import type { EmailDraft } from '../lib/types';
import { Chip, Spinner } from './ui';

const PROCESSED_PAGE_SIZE = 8;

/**
 * OUTREACH QUEUE — the approval inbox, pinned to the top of the Pipeline page.
 *
 * Needs-approval drafts first (bulk select → approve & send in one click),
 * already-processed drafts below in a paginated strip.  Every draft opens in
 * a full-mail modal so the complete drafted email can be read before
 * approving — no more 140-character previews hiding the pitch.
 */
export function OutreachQueue({ refreshToken = 0 }: { refreshToken?: number }) {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<EmailDraft | null>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(() => {
    getDrafts().then((list) => {
      setDrafts(list ?? []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshToken]);

  const pending = useMemo(() => drafts.filter((d) => d.status === 'Draft'), [drafts]);
  const processed = useMemo(
    () => drafts.filter((d) => d.status !== 'Draft'),
    [drafts],
  );
  const pageCount = Math.max(1, Math.ceil(processed.length / PROCESSED_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const processedPage = processed.slice(
    safePage * PROCESSED_PAGE_SIZE,
    (safePage + 1) * PROCESSED_PAGE_SIZE,
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = pending.length > 0 && pending.every((d) => selected.has(d.id));

  const bulkApprove = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setMsg(`Sending ${ids.length} draft(s)…`);
    const res = await bulkApproveDrafts(ids);
    setBusy(false);
    if (!res) {
      setMsg('Bulk send failed — is the backend running?');
      return;
    }
    setMsg(
      `✓ ${res.sent} sent` +
        (res.failed ? `, ${res.failed} failed/skipped (already sent or bad address)` : '') +
        '.',
    );
    setSelected(new Set());
    reload();
  };

  const bulkReject = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    for (const id of ids) await rejectDraft(id);
    setBusy(false);
    setMsg(`${ids.length} draft(s) rejected.`);
    setSelected(new Set());
    reload();
  };

  const act = async (id: string, fn: (id: string | number) => Promise<unknown>) => {
    setBusy(true);
    await fn(id);
    setBusy(false);
    reload();
    setModal((m) => (m && m.id === id ? null : m));
  };

  const statusChip = (d: EmailDraft) => {
    if (d.status === 'Sent') return <Chip tone="success">{d.status}{d.sentVia === 'console' ? ' · console' : ''}</Chip>;
    if (d.status === 'Failed') return <Chip tone="warn">Failed</Chip>;
    if (d.status === 'Rejected') return <Chip tone="neutral">Rejected</Chip>;
    if (d.status === 'Approved') return <Chip tone="accent">Approved</Chip>;
    return <Chip tone="accent">Draft</Chip>;
  };

  if (loading) return <Spinner label="Loading outreach queue…" />;

  return (
    <section className="panel queue-panel">
      <div className="panel-head">
        <span className="section-label">Outreach review</span>
        <div className="panel-head-actions">
          {pending.length > 0 && <Chip tone="warn">{pending.length} awaiting approval</Chip>}
          <Chip tone="neutral">{processed.length} processed</Chip>
        </div>
      </div>

      {/* ---- NEEDS APPROVAL — up front, bulk actions ---- */}
      {pending.length > 0 ? (
        <>
          <div className="queue-toolbar">
            <label className="check-row">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(pending.map((d) => d.id)))
                }
              />
              Select all ({pending.length})
            </label>
            <span className="dim small">{selected.size} selected</span>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || selected.size === 0}
              onClick={bulkApprove}
            >
              {busy ? 'Sending…' : `Approve ${selected.size || ''} & send`}
            </button>
            <button className="btn btn-sm" disabled={busy || selected.size === 0} onClick={bulkReject}>
              Reject selected
            </button>
            {msg && <small className="inline-msg">{msg}</small>}
          </div>
          <div className="queue-list">
            {pending.map((d) => (
              <article className={`queue-card${selected.has(d.id) ? ' selected' : ''}`} key={d.id}>
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  aria-label={`Select ${d.company}`}
                />
                <button className="queue-card-main" onClick={() => setModal(d)}>
                  <strong>{d.company}</strong>
                  <span className="mono small">→ {d.toEmail || <em>no email found</em>}</span>
                  <span className="queue-subject">{d.subject}</span>
                  <span className="queue-preview">{d.body}</span>
                </button>
                <div className="queue-card-actions">
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(d.id, approveDraft)}>
                    Approve &amp; send
                  </button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => act(d.id, rejectDraft)}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <small className="inline-msg">
          {processed.length > 0
            ? 'No drafts awaiting approval — everything is processed. New drafts appear here after each cycle.'
            : 'No drafts yet — run a cycle and the Copywright agent queues its emails here for approval.'}
        </small>
      )}

      {/* ---- PROCESSED — paginated archive ---- */}
      {processed.length > 0 && (
        <div className="queue-processed">
          <div className="queue-processed-head">
            <span className="section-label">Processed</span>
            <div className="pager">
              <button className="btn btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                ‹ Prev
              </button>
              <small className="dim">
                {safePage + 1} / {pageCount}
              </small>
              <button
                className="btn btn-sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="queue-rows">
            {processedPage.map((d) => (
              <button className="queue-row" key={d.id} onClick={() => setModal(d)}>
                {statusChip(d)}
                <strong>{d.company}</strong>
                <span className="mono small dim">{d.toEmail || '—'}</span>
                <span className="queue-row-subject">{d.subject}</span>
                <small className="dim">{d.lastActivity}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- FULL MAIL VIEW ---- */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>{modal.company}</strong>
              {statusChip(modal)}
              <button className="btn btn-sm" onClick={() => setModal(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modal-meta">
              <span>
                To: <span className="mono">{modal.toEmail || <em>no email found</em>}</span>
              </span>
              <span>
                Via: {modal.sentVia === 'smtp' ? 'SMTP' : modal.sentVia === 'console' ? 'console' : '—'}
              </span>
              <span>{modal.lastActivity}</span>
            </div>
            {modal.error && <div className="modal-error">{modal.error}</div>}
            <div className="mail-subject">{modal.subject}</div>
            <pre className="mail-body">{modal.body}</pre>
            <div className="modal-actions">
              {(modal.status === 'Draft' || modal.status === 'Failed') && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => act(modal.id, modal.status === 'Draft' ? approveDraft : sendDraft)}
                >
                  {modal.status === 'Draft' ? 'Approve & send' : 'Retry send'}
                </button>
              )}
              {modal.status === 'Draft' && (
                <button className="btn" disabled={busy} onClick={() => act(modal.id, rejectDraft)}>
                  Reject
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
