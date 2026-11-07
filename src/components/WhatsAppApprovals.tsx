import { useState } from 'react';
import { approveOutcome } from './draftUtils';
import { Banner, LoadError, toast } from './feedback';
import { Chip } from './ui';
import { actOnWhatsApp, getWhatsAppMessages, optOutWhatsApp } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { WhatsAppMessage } from '../lib/types';

/** WhatsApp messages waiting for a yes. Every one needs an approval — always. */
export function WhatsAppApprovals() {
  const [version, setVersion] = useState(0);
  const loaded = useAsync(() => getWhatsAppMessages('draft'), [version]);
  const [edits, setEdits] = useState<Record<number, string>>({});

  if (loaded.error) return <LoadError message={loaded.error} onRetry={() => void loaded.reload()} />;
  const rows = loaded.data ?? [];
  if (!rows.length) return null;

  const act = async (m: WhatsAppMessage, action: 'approve' | 'reject') => {
    const res = await actOnWhatsApp(m.id, action, action === 'approve' ? edits[m.id] : undefined);
    if (!res.ok) return toast.error(`${m.company}: ${res.error}`);
    toast.success(action === 'approve' ? `Queued — goes out in your sending hours.` : `Rejected.`);
    setVersion((v) => v + 1);
  };
  const optOut = async (m: WhatsAppMessage) => {
    const res = await optOutWhatsApp({ phone: m.toPhone });
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.data.phone} will never get a WhatsApp message again.`);
    setVersion((v) => v + 1);
  };

  return (
    <section className="panel">
      <h2 className="section-title">WhatsApp messages</h2>
      <Banner tone="warn" title="Sent through the WhatsApp helper">
        Approve only messages to businesses that published this number. Prefer "Open in WhatsApp" to send it yourself.
      </Banner>
      <div className="task-list">
        {rows.map((m) => (
          <article key={m.id} className="panel task-card">
            <div className="seq-progress">
              <strong>{m.company || 'Company'}</strong>
              <Chip tone="accent">WhatsApp</Chip>
              <small className="muted">{m.toPhone}</small>
            </div>
            <textarea
              rows={4}
              value={edits[m.id] ?? m.text}
              onChange={(e) => setEdits({ ...edits, [m.id]: e.target.value })}
              aria-label={`WhatsApp message to ${m.company}`}
            />
            {m.error && <small className="queue-error">{m.error}</small>}
            <div className="task-actions">
              <button className="btn btn-primary" onClick={() => void act(m, 'approve')}>
                Approve & queue
              </button>
              <a className="btn" href={m.waMeLink} target="_blank" rel="noopener noreferrer">
                Open in WhatsApp instead
              </a>
              <button className="btn btn-ghost" onClick={() => void act(m, 'reject')}>
                Reject
              </button>
              <button className="btn btn-ghost" onClick={() => void optOut(m)}>
                Never WhatsApp this number
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
