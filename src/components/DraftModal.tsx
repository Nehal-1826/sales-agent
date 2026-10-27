import { useState } from 'react';
import { approveDraft, rejectDraft, sendDraft, updateDraft } from '../lib/api';
import type { EmailDraft } from '../lib/types';
import { toast } from './feedback';
import { ConfirmButton, Modal } from './overlay';
import { DraftStatusChip, isValidEmail } from './draftUtils';

/**
 * Full email view. Unsent drafts (Draft / Failed) are editable in place —
 * recipient included — and can be approved from here.
 */
export function DraftModal({
  draft,
  onClose,
  onChanged,
}: {
  draft: EmailDraft;
  onClose: () => void;
  onChanged: () => void;
}) {
  const editable = draft.status === 'Draft' || draft.status === 'Failed';
  const [to, setTo] = useState(draft.toEmail || '');
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);

  const dirty = to.trim() !== (draft.toEmail || '') || subject !== draft.subject || body !== draft.body;
  const recipientOk = isValidEmail(to);

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    if (to.trim() && !recipientOk) {
      toast.error('That email address doesn’t look right.');
      return false;
    }
    const res = await updateDraft(draft.id, { toEmail: to.trim(), subject, body });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    return true;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    run(async () => {
      if (await save()) {
        toast.success('Changes saved.');
        onChanged();
        onClose();
      }
    });

  const onApprove = () =>
    run(async () => {
      if (!(await save())) return;
      const res = draft.status === 'Failed' ? await sendDraft(draft.id) : await approveDraft(draft.id);
      onChanged();
      if (!res.ok) return toast.error(res.error);
      if (res.data.status === 'Sent') {
        if (res.data.sentVia === 'console') toast.warn(`Approved, but not delivered: email isn't connected yet.`);
        else toast.success(`Sent to ${res.data.company}.`);
        onClose();
      } else {
        toast.error(res.data.error || 'The email could not be sent.');
      }
    });

  const onReject = () =>
    run(async () => {
      const res = await rejectDraft(draft.id);
      onChanged();
      if (!res.ok) return toast.error(res.error);
      toast.info(`Email to ${draft.company} rejected. It won't be written again.`);
      onClose();
    });

  return (
    <Modal
      wide
      title={
        <span className="modal-title-row">
          {draft.company} <DraftStatusChip draft={draft} />
        </span>
      }
      onClose={onClose}
      footer={
        editable ? (
          <>
            <ConfirmButton className="btn" confirmLabel="Reject this email?" onConfirm={onReject} disabled={busy}>
              Reject
            </ConfirmButton>
            <span className="spacer" />
            {dirty && (
              <button className="btn" onClick={onSave} disabled={busy}>
                Save changes
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={onApprove}
              disabled={busy || !recipientOk}
              title={recipientOk ? undefined : 'Add a recipient email first'}
            >
              {busy ? 'Working…' : draft.status === 'Failed' ? 'Try sending again' : 'Approve & send'}
            </button>
          </>
        ) : (
          <button className="btn" onClick={onClose} data-autofocus>
            Close
          </button>
        )
      }
    >
      {draft.error && <div className="modal-error">{draft.error}</div>}
      {editable ? (
        <div className="draft-form">
          <label className="field">
            <span className="field-label">To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
              aria-invalid={!!to.trim() && !recipientOk}
              data-autofocus={!to ? true : undefined}
            />
            {!to.trim() && <span className="field-hint warn">No email address was found on their site. Add one to send.</span>}
            {!!to.trim() && !recipientOk && <span className="field-hint warn">That doesn't look like an email address.</span>}
          </label>
          <label className="field">
            <span className="field-label">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Message</span>
            <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <div className="modal-meta">
            <span>
              To: <span className="mono">{draft.toEmail || '—'}</span>
            </span>
            <span>{draft.lastActivity}</span>
          </div>
          <div className="mail-subject">{draft.subject}</div>
          <pre className="mail-body">{draft.body}</pre>
        </>
      )}
    </Modal>
  );
}
