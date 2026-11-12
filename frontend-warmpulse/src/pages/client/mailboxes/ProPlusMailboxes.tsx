import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusMailboxesData } from '@/features/mailboxes/useProPlusMailboxesData';
import {
  usePauseMailbox,
  useResumeMailbox,
} from '@/features/mailboxes/api';
import { ProPlusMbx4Clusters, type MailboxRow } from '../proplus/ProPlusMbx4Clusters';
import { AddMailboxDialog } from './AddMailboxDialog';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';

/**
 * /app/mailboxes for Pro-Plus-tier users.
 */
export function ProPlusMailboxes() {
  const navigate = useNavigate();
  const { data, isLoading } = useProPlusMailboxesData();
  const [addOpen, setAddOpen] = useState(false);

  const pauseMbx = usePauseMailbox();
  const resumeMbx = useResumeMailbox();
  const [pausingId, setPausingId] = useState<string | null>(null);

  const handlePauseToggle = async (m: MailboxRow) => {
    setPausingId(m.id);
    try {
      if (m.status === 'paused') {
        await resumeMbx.mutateAsync(m.id);
        toast.success(`Mailbox ${m.email} resumed`);
      } else {
        await pauseMbx.mutateAsync(m.id);
        toast.success(`Mailbox ${m.email} paused`);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Action failed'));
    } finally {
      setPausingId(null);
    }
  };

  const handleOpen = (m: MailboxRow) => {
    navigate(`/app/mailboxes/${m.id}`);
  };

  // 0-mailbox empty state — same CTA / heading as the Pro mailboxes page.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Mailboxes</h1>
          <p className="text-sm text-text-dim">
            Your fleet, grouped into provider clusters once mailboxes are
            connected.
          </p>
        </motion.div>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailboxes connected"
          description="Connect your first mailbox to start warming up."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add mailbox
            </Button>
          }
        />
        <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  // Still resolving the mailbox list — lightweight skeleton matching the
  // page heading height + the fleet bar + cluster pod board.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-surface-2/60" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl bg-surface-2/60"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ProPlusMbx4Clusters
        data={data ?? undefined}
        onAdd={() => setAddOpen(true)}
        onPauseToggle={handlePauseToggle}
        onOpen={handleOpen}
        pausingId={pausingId}
      />
      <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

export default ProPlusMailboxes;
