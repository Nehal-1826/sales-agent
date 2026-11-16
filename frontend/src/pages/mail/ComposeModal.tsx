import { useState } from 'react';
import { Modal } from '../../components/overlay';
import { toast } from '../../components/feedback';
import { sendWebmail, type WebmailSendInput } from '../../lib/webmail';
import { plainToHtml } from './helpers';

/** Prefill for a fresh compose (Compose button) or a reply (reading pane). */
export interface ComposeSeed {
  to?: string;
  subject?: string;
  body?: string;
  /** uid of the message being answered — threads it server-side */
  inReplyTo?: number;
}

/** Compose dialog — plain-text body is sent as simple HTML paragraphs. */
export function ComposeModal({
  accountId,
  fromEmail,
  seed,
  onClose,
  onSent,
}: {
  accountId: number;
  fromEmail: string;
  seed: ComposeSeed;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(seed.to ?? '');
  const [subject, setSubject] = useState(seed.subject ?? '');
  const [body, setBody] = useState(seed.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!to.trim() || !to.includes('@')) {
      setError('Enter a valid “To” address.');
      return;
    }
    if (!body.trim()) {
      setError('Write a message before sending.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload: WebmailSendInput = {
      to: to.trim(),
      subject: subject.trim(),
      body_html: plainToHtml(body),
      ...(seed.inReplyTo !== undefined ? { in_reply_to: seed.inReplyTo } : {}),
    };
    const res = await sendWebmail(accountId, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(seed.inReplyTo ? 'Reply sent.' : 'Message sent.');
    onSent();
    onClose();
  };

  return (
    <Modal
      title={seed.inReplyTo ? 'Reply' : 'New message'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Discard
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <p className="wm-compose-from">
        From <strong>{fromEmail}</strong>
      </p>
      {error && <div className="modal-error" role="alert">{error}</div>}
      <label className="field">
        <span className="field-label">To</span>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@company.com"
          data-autofocus
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span className="field-label">Subject</span>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      </label>
      <label className="field">
        <span className="field-label">Message</span>
        <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" disabled={busy} />
      </label>
    </Modal>
  );
}
