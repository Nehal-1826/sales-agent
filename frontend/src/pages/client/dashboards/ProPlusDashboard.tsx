import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusConsoleData } from '@/features/dashboard/useProPlusConsoleData';
import { ProPlusDashN4Console } from '../proplus/ProPlusDashN4Console';
import { AddMailboxDialog } from '../mailboxes/AddMailboxDialog';

/**
 * /app/dashboard for Pro-Plus-tier users.
 *
 * Renders the "Console (master–detail)" design (`ProPlusDashN4Console`)
 * wired to REAL workspace data via `useProPlusConsoleData()`. The empty /
 * loading UX matches `ProDashboard`: 0 mailboxes → the "No mailboxes
 * connected" EmptyState that opens the same AddMailboxDialog used by the
 * console's Add button; while the mailbox list is still loading → a
 * lightweight skeleton.
 *
 * NOTE: this is the LIVE wrapper at `dashboards/ProPlusDashboard.tsx` —
 * distinct from the prop-less `proplus/ProPlusDashboard.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusDashboard() {
  const { data, isLoading } = useProPlusConsoleData();
  const [addOpen, setAddOpen] = useState(false);

  // 0-mailbox empty state — opens the AddMailboxDialog (same as the
  // console's "+ Add" button) so users can connect their first mailbox
  // without leaving the dashboard.
  if (!isLoading && data === null) {
    return (
      <>
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-1"
          >
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-text-dim">
              Live warmth, inbox vs spam and activity once mailboxes are connected.
            </p>
          </motion.div>
          <EmptyState
            icon={<Mail className="h-5 w-5" />}
            title="No mailboxes connected"
            description="Add your first mailbox to start warming up."
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                Add mailbox
              </Button>
            }
          />
        </div>
        <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
      </>
    );
  }

  // Still resolving the mailbox list — lightweight skeleton matching the
  // page heading height + a tall card placeholder.
  if (isLoading || data === null) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-2/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-surface-2/60"
            />
          ))}
        </div>
        <div className="h-80 w-full animate-pulse rounded-xl bg-surface-2/60" />
      </div>
    );
  }

  return (
    <>
      <ProPlusDashN4Console
        data={data ?? undefined}
        onAdd={() => setAddOpen(true)}
      />
      <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

export default ProPlusDashboard;
