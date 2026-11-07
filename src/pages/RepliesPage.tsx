import { useState } from 'react';
import { approveReplySuggestion, getReplies, markReplyHandled, pollInbox } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useWorkspaceStatus } from '../lib/status';
import type { Reply, ReplyClassification } from '../lib/types';
import { Chip, PageHeader } from '../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../components/feedback';
import { IconMail } from '../components/icons';

const TONE: Record<ReplyClassification, 'neutral' | 'accent' | 'success' | 'warn'> = {
  interested: 'success',
  question: 'accent',
  not_now: 'neutral',
  not_interested: 'neutral',
  unsubscribe: 'warn',
  out_of_office: 'neutral',
  other: 'neutral',
  '': 'neutral',
};

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function answerLine(r: Reply): string | null {
  const a = r.answer;
  if (!a) return null;
  if (a.status === 'Sent') return a.sentVia === 'console' ? 'Your answer was logged — not delivered (no mailbox set up).' : `Your answer was sent ${when(a.sentAt)}.`;
  if (a.status === 'Queued') return `Your answer is queued — sends at ~${when(a.scheduledFor)}.`;
  if (a.status === 'Failed') return `Your answer could not be sent: ${a.error || 'unknown problem'}.`;
  if (a.status === 'Rejected') return `Your answer was stopped: ${a.error || 'not sent'}.`;
  return 'Your answer is being sent.';
}

/** One reply: what they wrote, what we suggest, and the two human actions. */
function ReplyCard({ reply, onChange }: { reply: Reply; onChange: () => void }) {
  const [text, setText] = useState(reply.suggestedReply);
  const [busy, setBusy] = useState(false);
  const canAnswer = !reply.answer && reply.classification !== 'unsubscribe' && reply.classification !== 'out_of_office';

  const approve = async () => {
    setBusy(true);
    const res = await approveReplySuggestion(reply.id, text);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Answer queued — it goes out from the same mailbox, in the same thread.');
    onChange();
  };

  const toggleHandled = async () => {
    setBusy(true);
    const res = await markReplyHandled(reply.id, !reply.handled);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onChange();
  };

  const status = answerLine(reply);
  return (
    <article className={`reply-card${reply.needsAttention ? ' needs-you' : ''}`}>
      <header className="reply-head">
        <div>
          <strong>{reply.company}</strong>
          <small>
            {reply.fromEmail || reply.contact}
            {reply.receivedAt ? ` · ${when(reply.receivedAt)}` : reply.lastActivity ? ` · ${reply.lastActivity}` : ''}
          </small>
        </div>
        <div className="reply-chips">
          {reply.classificationLabel && <Chip tone={TONE[reply.classification]}>{reply.classificationLabel}</Chip>}
          {reply.handled ? <Chip>Done</Chip> : reply.needsAttention ? <Chip tone="accent">Needs you</Chip> : null}
        </div>
      </header>
      {reply.subject && <p className="reply-subject">{reply.subject}</p>}
      <blockquote className="reply-body">{reply.bodyText || reply.summary}</blockquote>
      {reply.classification === 'unsubscribe' && (
        <p className="reply-note">They asked to stop. We removed them for good and cancelled any email still waiting to go to them.</p>
      )}
      {status && <p className="reply-note">{status}</p>}
      {canAnswer && (
        <label className="reply-answer">
          <span>{reply.suggestedReply ? 'Suggested answer — edit it if you like' : 'Write an answer'}</span>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
        </label>
      )}
      <div className="reply-actions">
        {canAnswer && (
          <button className="btn btn-primary" onClick={approve} disabled={busy || !text.trim()}>
            Approve &amp; queue
          </button>
        )}
        <button className="btn" onClick={toggleHandled} disabled={busy}>
          {reply.handled ? 'Mark as not done' : 'Mark handled'}
        </button>
      </div>
    </article>
  );
}

/** REPLIES — what prospects wrote back. Nothing is answered without you. */
export function RepliesPage() {
  const { refresh } = useWorkspaceStatus();
  const replies = useAsync(getReplies, []);
  const [filter, setFilter] = useState<'needs' | 'all'>('needs');
  const [checking, setChecking] = useState(false);

  const reload = () => {
    void replies.reload();
    void refresh();
  };

  const checkNow = async () => {
    setChecking(true);
    const res = await pollInbox();
    setChecking(false);
    if (!res.ok) return toast.error(res.error);
    toast.info('Mailboxes checked.');
    reload();
  };

  const all = (replies.data ?? []).filter((r) => r.classification !== '' || r.bodyText);
  const shown = filter === 'needs' ? all.filter((r) => r.needsAttention) : all;

  return (
    <div className="page">
      <PageHeader
        title="Replies"
        subtitle="What prospects wrote back. We sort each reply, suggest an answer, and send it only after you approve. People who ask to stop are removed for good."
        actions={
          <button className="btn" onClick={checkNow} disabled={checking}>
            {checking ? 'Checking…' : 'Check for replies now'}
          </button>
        }
      />
      <section className="panel">
        <fieldset className="segmented" aria-label="Which replies">
          {(['needs', 'all'] as const).map((f) => (
            <label key={f} className={filter === f ? 'active' : ''}>
              <input type="radio" name="reply-filter" checked={filter === f} onChange={() => setFilter(f)} />
              {f === 'needs' ? `Needs you (${all.filter((r) => r.needsAttention).length})` : `All (${all.length})`}
            </label>
          ))}
        </fieldset>
        {replies.error ? (
          <LoadError message={replies.error} onRetry={replies.reload} />
        ) : replies.loading && !replies.data ? (
          <Skeleton rows={4} height={64} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<IconMail size={22} />} title={filter === 'needs' ? 'Nothing waiting on you' : 'No replies yet'}>
            Replies to your emails show up here a few minutes after they reach your mailbox. Bounces and
            out-of-office messages are handled for you.
          </EmptyState>
        ) : (
          <div className="reply-list">
            {shown.map((r) => (
              <ReplyCard key={`${r.id}-${r.handled}-${r.answer?.status ?? ''}`} reply={r} onChange={reload} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
