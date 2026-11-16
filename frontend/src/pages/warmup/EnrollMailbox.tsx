import { useState } from 'react';
import { AnimatedList } from '../../components/AnimatedList';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { Modal } from '../../components/overlay';
import { Chip } from '../../components/ui';
import { useAsync } from '../../lib/hooks';
import { enrollMailboxWarmup, getMailboxes } from '../../lib/api';
import type { Mailbox } from '../../lib/types';

type RowState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'enrolled'; already: boolean }
  | { kind: 'error'; message: string };

/**
 * "Add mailbox to warmup" picker. Lists the workspace's sending mailboxes
 * (Settings → Mailboxes — GET /api/mailboxes/) and enrolls them into the
 * warmup network through the agent backend, which forwards the stored SMTP
 * credentials server-side over the bridge JWT: credentials never reach
 * this page, and nothing secret is ever rendered.
 */
export function EnrollMailbox({
  onClose,
  onEnrolled,
}: {
  onClose: () => void;
  /** page refresh — reloads the warmup mailbox rows (and counters) */
  onEnrolled: () => void;
}) {
  const agentMailboxes = useAsync(getMailboxes, []);
  const [rows, setRows] = useState<Record<number, RowState>>({});

  const enroll = async (mb: Mailbox) => {
    if (rows[mb.id]?.kind === 'working') return;
    setRows((r) => ({ ...r, [mb.id]: { kind: 'working' } }));
    const result = await enrollMailboxWarmup(mb.id);
    if (result.ok) {
      const already = result.data.status === 'already_enrolled';
      setRows((r) => ({ ...r, [mb.id]: { kind: 'enrolled', already } }));
      toast.success(
        already
          ? `${mb.fromEmail} is already warming`
          : `${mb.fromEmail} enrolled — warmup starts with the next cycle`,
      );
      onEnrolled();
    } else {
      setRows((r) => ({ ...r, [mb.id]: { kind: 'error', message: result.error } }));
      toast.error(`Enroll failed: ${result.error}`);
    }
  };

  return (
    <Modal title="Add mailbox to warmup" onClose={onClose}>
      <p className="panel-note warmup-enroll-note">
        Pick one of your sending mailboxes. Its stored SMTP credentials are
        forwarded securely by the server — they are never shown or sent
        through this page.
      </p>

      {agentMailboxes.loading && !agentMailboxes.data ? (
        <Skeleton rows={3} height={48} />
      ) : agentMailboxes.error && !agentMailboxes.data ? (
        <LoadError message={agentMailboxes.error} onRetry={() => void agentMailboxes.reload()} />
      ) : !agentMailboxes.data || agentMailboxes.data.length === 0 ? (
        <EmptyState title="No sending mailboxes yet">
          Add a mailbox under Settings → Mailboxes first — it will show up here
          ready to warm.
        </EmptyState>
      ) : (
        <AnimatedList
          items={agentMailboxes.data}
          asList
          interactiveRows
          listClassName="warmup-enroll-list"
          itemClassName="warmup-enroll-row"
          getItemKey={(mb) => mb.id}
          animation="pop"
          theme="dark"
          frame={false}
          width="100%"
          maxHeight={340}
          gap={8}
          accentColor="var(--accent)"
          renderItem={(mb) => {
            const state = rows[mb.id] ?? { kind: 'idle' };
            const enrolled = state.kind === 'enrolled';
            return (
              <>
                <div className="warmup-enroll-id">
                  <span className="warmup-enroll-email" title={mb.fromEmail}>{mb.fromEmail}</span>
                  <span className="warmup-enroll-meta">
                    {mb.label && mb.label !== mb.fromEmail ? `${mb.label} · ` : ''}
                    {mb.configured
                      ? `cap ${mb.dailyCap}/day`
                      : 'SMTP setup incomplete (Settings → Mailboxes)'}
                  </span>
                </div>
                {enrolled ? (
                  <Chip tone="success">{state.already ? 'Already warming' : 'Enrolled'}</Chip>
                ) : mb.configured ? (
                  <>
                    <button
                      className="btn btn-sm"
                      onClick={() => void enroll(mb)}
                      disabled={state.kind === 'working'}
                    >
                      {state.kind === 'working' ? 'Enrolling…' : 'Enroll'}
                    </button>
                    {state.kind === 'error' && (
                      <span className="warmup-enroll-error" role="alert">{state.message}</span>
                    )}
                  </>
                ) : (
                  <Chip tone="neutral">Not ready</Chip>
                )}
              </>
            );
          }}
        />
      )}
      <p className="panel-note warmup-enroll-note">
        Warmup ramps volume automatically from a few mails a day — you can
        pause or remove any mailbox from the warmup list at any time.
      </p>
    </Modal>
  );
}
