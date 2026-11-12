import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Plus, Search } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { useAuthStore } from '@/stores/auth';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox, MailboxProvider, MailboxStatus } from '@/features/mailboxes/types';
import { usePlan } from '@/lib/usePlan';
import { AgencyMailboxes } from './mailboxes/AgencyMailboxes';
import { ProMailboxes } from './mailboxes/ProMailboxes';
import { ProPlusMailboxes } from './mailboxes/ProPlusMailboxes';
import { StarterMailboxes } from './mailboxes/StarterMailboxes';
import { MailboxCard } from './mailboxes/MailboxCard';
import { AddMailboxDialog } from './mailboxes/AddMailboxDialog';
import { DeleteMailboxDialog } from './mailboxes/DeleteMailboxDialog';

type StatusFilter = MailboxStatus | 'all';
type ProviderFilter = MailboxProvider | 'all';

const PLAN_CAPS: Record<string, number> = {
  free: 1,
  starter: 3,
  pro: 10,
  scale: 25,
  enterprise: 100,
};

function planCap(plan: string | null | undefined): number | null {
  if (!plan) return null;
  return PLAN_CAPS[plan.toLowerCase()] ?? null;
}

function planLabel(plan: string | null | undefined): string {
  if (!plan) return 'your plan';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * /app/mailboxes — thin plan router.
 *
 *   Starter → <StarterMailboxes /> (M4 Split Pane, single-mailbox detail)
 *   Pro     → legacy card-grid (TODO — own design pending)
 *   Agency  → legacy card-grid (TODO — own design pending)
 *
 * The legacy multi-card layout is preserved as the Pro / Agency fallback
 * so they keep the existing experience until their tier's design ships.
 */
export function MailboxesPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) {
    return (
      <>
        <StarterMailboxes />
        {/* /:id drill-in still works for the side-sheet (rarely used on
            Starter since there's only one mailbox, but keep the route
            available in case someone deep-links to it). */}
        <Outlet />
      </>
    );
  }

  if (isAgency) {
    return (
      <>
        <AgencyMailboxes />
        <Outlet />
      </>
    );
  }

  // Pro Plus (but not Agency, already handled above) → Provider Clusters.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) {
    return (
      <>
        <ProPlusMailboxes />
        <Outlet />
      </>
    );
  }

  if (isPro) {
    return (
      <>
        <ProMailboxes />
        <Outlet />
      </>
    );
  }

  return <LegacyMailboxesGrid />;
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — unchanged from pre-Starter-redesign. Used for
// Pro / Agency tiers until their tier-specific designs ship.
// ---------------------------------------------------------------------------
function LegacyMailboxesGrid() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Mailbox | null>(null);

  const query = useMailboxes({
    status: status === 'all' ? undefined : status,
    provider: provider === 'all' ? undefined : provider,
  });
  const all = query.data?.items ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((m) => m.email_address.toLowerCase().includes(q));
  }, [all, search]);

  const total = query.data?.total ?? all.length;
  const cap = planCap(user?.plan);
  const planBadge = cap
    ? `${total} of ${cap} mailboxes on ${planLabel(user?.plan)}`
    : `${total} mailbox${total === 1 ? '' : 'es'}`;

  return (
    <>
      <div className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-wrap items-start justify-between gap-3"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Mailboxes</h1>
              <Badge variant={cap && total >= cap ? 'orange' : 'neutral'}>{planBadge}</Badge>
            </div>
            <p className="text-sm text-text-dim">
              Connect, configure and monitor every inbox you are warming up.
            </p>
          </div>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setAddOpen(true)}
            disabled={!!cap && total >= cap}
          >
            Add mailbox
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
            <Input
              placeholder="Search by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <AppSelect value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <AppSelectTrigger className="w-[160px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All statuses</AppSelectItem>
              <AppSelectItem value="active">Active</AppSelectItem>
              <AppSelectItem value="paused">Paused</AppSelectItem>
              <AppSelectItem value="pending">Pending</AppSelectItem>
              <AppSelectItem value="completed">Completed</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
          <AppSelect value={provider} onValueChange={(v) => setProvider(v as ProviderFilter)}>
            <AppSelectTrigger className="w-[160px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All providers</AppSelectItem>
              <AppSelectItem value="gmail">Gmail</AppSelectItem>
              <AppSelectItem value="outlook">Outlook</AppSelectItem>
              <AppSelectItem value="yahoo">Yahoo</AppSelectItem>
              <AppSelectItem value="smtp">SMTP</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </motion.div>

        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            title="Couldn't load mailboxes"
            description="Try again in a moment."
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                Retry
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          all.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-5 w-5" />}
              title="No mailboxes yet"
              description="Add your first mailbox to start warming up your domain."
              action={<Button onClick={() => setAddOpen(true)}>Add mailbox</Button>}
            />
          ) : (
            <EmptyState
              title="No matches"
              description="Try clearing filters or adjusting your search."
            />
          )
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map((m) => (
              <MailboxCard key={m.id} mailbox={m} onDelete={(mb) => setToDelete(mb)} />
            ))}
          </motion.div>
        )}
      </div>

      <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
      <DeleteMailboxDialog mailbox={toDelete} onClose={() => setToDelete(null)} />

      <Outlet />
    </>
  );
}

export default MailboxesPage;
