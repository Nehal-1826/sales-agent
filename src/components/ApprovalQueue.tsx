import { useMemo, useState } from 'react';
import { approveDraft, getDrafts, isDemo, rejectDraft, sendDraft } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { EmailDraft, Id } from '../lib/types';
import { DraftModal } from './DraftModal';
import { DraftStatusChip, isUnsent, isValidEmail } from './draftUtils';
import { Banner, EmptyState, LoadError, Skeleton, StaleNotice, toast } from './feedback';
import { IconCheck } from './icons';

const PROCESSED_PAGE = 10;

/**
 * THE approval queue — the human gate before any email leaves. Used full-size
 * on the Approvals page and as a short preview on Home (`limit`).
 */
export function ApprovalQueue({ limit }: { limit?: number }) {
  const status = useWorkspaceStatus();
  const drafts = useAsync(getDrafts, [status.cycleVersion], { keepStale: true });
  const [selected, setSelected] = useState<Set<Id>>(new Set());
  const [open, setOpen] = useState<EmailDraft | null>(null);
  const [busyId, setBusyId] = useState<Id | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [page, setPage] = useState(0);

  const all = drafts.data ?? [];
  const pending = useMemo(() => all.filter(isUnsent), [all]);
  const processed = useMemo(() => all.filter((d) => !isUnsent(d)), [all]);
  const preview = limit !== undefined;
  const shown = preview ? pending.slice(0, limit) : pending;
  const sendable = pending.filter((d) => selected.has(d.id) && isValidEmail(d.toEmail));
  const smtpMissing = !isDemo() && status.outreach !== null && !status.outreach.smtpConfigured;

  const afterChange = () => {
    void drafts.reload();
    void status.refresh();
  };

  const approveOne = async (d: EmailDraft) => {
    if (bulk) return;
    setBusyId(d.id);
    const res = d.status === 'Failed' ? await sendDraft(d.id) : await approveDraft(d.id);
    setBusyId(null);
    setSelected((s) => {
      const next = new Set(s);
      next.delete(d.id);
      return next;
    });
    afterChange();
    if (!res.ok) return toast.error(`${d.company}: ${res.error}`);
    if (res.data.status !== 'Sent') return toast.error(`${d.company}: ${res.data.error || 'could not be sent.'}`);
    if (res.data.sentVia === 'console') toast.warn(`${d.company}: approved, but not delivered (email isn't connected).`);
    else toast.success(`Sent to ${d.company}.`);
  };

  // no opening the review window mid-bulk: its Approve would race the bulk run
  const openDraft = (d: EmailDraft) => {
    if (!bulk) setOpen(d);
  };

  const rejectOne = async (d: EmailDraft) => {
    if (bulk) return;
    setBusyId(d.id);
    const res = await rejectDraft(d.id);
    setBusyId(null);
    afterChange();
    if (res.ok) toast.info(`Rejected the email to ${d.company}.`);
    else toast.error(res.error);
  };

  /** One request per draft so the user sees progress and one failure never hides the rest. */
  const approveSelected = async () => {
    const queue = sendable;
    const skipped = pending.filter((d) => selected.has(d.id)).length - queue.length;
    let sent = 0;
    let notDelivered = 0; // approved, but the console backend never mailed it
    const failed: string[] = [];
    setBulk({ done: 0, total: queue.length });
    for (const [i, d] of queue.entries()) {
      const res = d.status === 'Failed' ? await sendDraft(d.id) : await approveDraft(d.id);
      if (res.ok && res.data.status === 'Sent') {
        if (res.data.sentVia === 'console') notDelivered += 1;
        else sent += 1;
      }
      else failed.push(d.company);
      setBulk({ done: i + 1, total: queue.length });
    }
    setBulk(null);
    setSelected(new Set());
    afterChange();
    const parts = [`${sent} sent`];
    if (notDelivered) parts.push(`${notDelivered} approved but not delivered (email isn't connected)`);
    if (failed.length) parts.push(`${failed.length} failed (${failed.slice(0, 3).join(', ')})`);
    if (skipped > 0) parts.push(`${skipped} skipped: no email address`);
    (failed.length ? toast.error : notDelivered ? toast.warn : toast.success)(parts.join(' · ') + '.');
  };

  const toggle = (id: Id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = pending.length > 0 && pending.every((d) => selected.has(d.id));

  if (drafts.loading) return <Skeleton rows={preview ? 2 : 4} height={54} />;
  if (drafts.error && !drafts.data) return <LoadError message={drafts.error} onRetry={() => void drafts.reload()} />;

  return (
    <div className="queue">
      {drafts.error && <StaleNotice onRetry={() => void drafts.reload()} />}
      {smtpMissing && (
        <Banner
          tone="warn"
          title="Email isn't connected yet"
          action={
            <button className="btn btn-sm" onClick={() => navigate('settings', 'email')}>
              Connect email
            </button>
          }
        >
          Approved emails won't actually be delivered until you connect a mailbox.
        </Banner>
      )}

      {pending.length === 0 ? (
        <EmptyState icon={<IconCheck size={22} />} title="You're all caught up">
          New emails show up here after each search. Nothing is ever sent without your approval.
        </EmptyState>
      ) : (
        <>
          {!preview && (
            <div className="queue-toolbar">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map((d) => d.id)))}
                />
                Select all ({pending.length})
              </label>
              <span className="queue-toolbar-spacer" />
              {bulk ? (
                <span className="inline-progress" role="status">
                  Sending {bulk.done} of {bulk.total}…
                </span>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={sendable.length === 0} onClick={() => void approveSelected()}>
                  Approve & send {sendable.length || ''}
                </button>
              )}
            </div>
          )}

          <ul className="queue-list">
            {shown.map((d) => {
              const hasRecipient = isValidEmail(d.toEmail);
              const busy = busyId === d.id || !!bulk;
              return (
                <li className={`queue-card${selected.has(d.id) ? ' selected' : ''}`} key={d.id}>
                  {!preview && (
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                      aria-label={`Select the email to ${d.company}`}
                    />
                  )}
                  <button className="queue-card-main" disabled={!!bulk} onClick={() => openDraft(d)}>
                    <span className="queue-card-top">
                      <strong>{d.company}</strong>
                      <DraftStatusChip draft={d} />
                    </span>
                    <span className={`queue-to${hasRecipient ? '' : ' missing'}`}>
                      {hasRecipient ? `To ${d.toEmail}` : 'No email address yet. Open to add one.'}
                    </span>
                    <span className="queue-subject">{d.subject}</span>
                    <span className="queue-preview">{d.body}</span>
                    {d.error && <span className="queue-error">{d.error}</span>}
                  </button>
                  <div className="queue-card-actions">
                    {hasRecipient ? (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void approveOne(d)}>
                        {busyId === d.id ? 'Sending…' : d.status === 'Failed' ? 'Try again' : 'Approve & send'}
                      </button>
                    ) : (
                      <button className="btn btn-sm" disabled={busy} onClick={() => openDraft(d)}>
                        Add email
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openDraft(d)}>
                      Review
                    </button>
                    {!preview && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void rejectOne(d)}>
                        Reject
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {preview && pending.length > shown.length && (
            <button className="link-btn" onClick={() => navigate('approvals')}>
              See all {pending.length} waiting →
            </button>
          )}
        </>
      )}

      {!preview && processed.length > 0 && (
        <ProcessedList drafts={processed} page={page} onPage={setPage} onOpen={openDraft} />
      )}

      {open && <DraftModal draft={open} onClose={() => setOpen(null)} onChanged={afterChange} />}
    </div>
  );
}

function ProcessedList({
  drafts,
  page,
  onPage,
  onOpen,
}: {
  drafts: EmailDraft[];
  page: number;
  onPage: (p: number) => void;
  onOpen: (d: EmailDraft) => void;
}) {
  const pages = Math.max(1, Math.ceil(drafts.length / PROCESSED_PAGE));
  const current = Math.min(page, pages - 1);
  const rows = drafts.slice(current * PROCESSED_PAGE, (current + 1) * PROCESSED_PAGE);
  return (
    <section className="queue-processed" aria-label="Already handled">
      <div className="queue-processed-head">
        <h3 className="section-title">Already handled</h3>
        {pages > 1 && (
          <div className="pager">
            <button className="btn btn-sm" disabled={current === 0} onClick={() => onPage(current - 1)}>
              ‹ Newer
            </button>
            <small className="dim">
              {current + 1} / {pages}
            </small>
            <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>
              Older ›
            </button>
          </div>
        )}
      </div>
      <ul className="queue-rows">
        {rows.map((d) => (
          <li key={d.id}>
            <button className="queue-row" onClick={() => onOpen(d)}>
              <DraftStatusChip draft={d} />
              <strong>{d.company}</strong>
              <span className="queue-row-subject">{d.subject}</span>
              <small className="dim">{d.lastActivity}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
