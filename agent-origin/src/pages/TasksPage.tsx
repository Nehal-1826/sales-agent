import { useState } from 'react';
import { EmptyState, LoadError, Skeleton, toast } from '../components/feedback';
import { Chip, PageHeader } from '../components/ui';
import { getTasks, updateTask } from '../lib/api';
import { useAsync } from '../lib/hooks';
import type { OutreachTask } from '../lib/types';

const LABEL: Record<OutreachTask['channel'], { title: string; open: string }> = {
  linkedin: { title: 'LinkedIn note', open: 'Find them on LinkedIn' },
  call: { title: 'Phone call', open: 'Call' },
  whatsapp: { title: 'WhatsApp message', open: 'Open in WhatsApp' },
};

/** TASKS — things you do yourself: LinkedIn notes, calls, WhatsApp links.
 *  Nothing here is sent automatically. */
export function TasksPage() {
  const [version, setVersion] = useState(0);
  const loaded = useAsync(() => getTasks('open'), [version]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied.');
    } catch {
      toast.error('Could not copy — select the text and copy it yourself.');
    }
  };

  const act = async (t: OutreachTask, action: 'done' | 'skip') => {
    const res = await updateTask(t.id, action);
    if (!res.ok) return toast.error(res.error);
    setVersion((v) => v + 1);
  };

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle="Follow-ups you do yourself. Copy the message, open the link, send it, then mark it done."
      />
      <section className="panel">
        {loaded.loading && !loaded.data ? (
          <Skeleton rows={4} height={60} />
        ) : loaded.error ? (
          <LoadError message={loaded.error} onRetry={() => void loaded.reload()} />
        ) : !loaded.data?.length ? (
          <EmptyState title="No tasks right now">
            LinkedIn, call and WhatsApp-link steps show up here when a follow-up is due. Turn them on in Settings →
            Follow-ups.
          </EmptyState>
        ) : (
          <div className="task-list">
            {loaded.data.map((t) => (
              <article key={t.id} className="panel task-card">
                <div className="seq-progress">
                  <strong>{t.company || 'Company'}</strong>
                  <Chip>{LABEL[t.channel].title}</Chip>
                  {t.phone && <small className="muted">{t.phone}</small>}
                </div>
                {t.message && <pre>{t.message}</pre>}
                <div className="task-actions">
                  {t.message && (
                    <button className="btn" onClick={() => void copy(t.message)}>
                      Copy text
                    </button>
                  )}
                  {t.url && (
                    <a className="btn" href={t.url} target="_blank" rel="noopener noreferrer">
                      {LABEL[t.channel].open}
                    </a>
                  )}
                  <button className="btn btn-primary" onClick={() => void act(t, 'done')}>
                    Done
                  </button>
                  <button className="btn btn-ghost" onClick={() => void act(t, 'skip')}>
                    Skip
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
