import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  Check,
  DollarSign,
  Gauge,
  Globe,
  Inbox,
  Mail,
  Palette,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/AppToast';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { extractErrorMessage } from '@/lib/errors';
import {
  useCreateSubClient,
  useDeleteSubClient,
  useInviteMember,
  type TeamRole,
} from '@/features/workspace/api';
import type { AgencyWorkspaceData } from './AgWksC1Federation';

/**
 * AgWksW5Command — Agency-tier Workspace, locked-live design "Command Center".
 *
 * Replaces the nautical "Marina Harbor" (W2). The metaphor is gone entirely:
 * this is a calm, executive agency console. A glass hero carries the agency
 * identity; a KPI row distils the portfolio; a refined sub-client grid is the
 * centrepiece (click a card to open a detail drawer); a team roster and an
 * agency-capabilities strip close it out.
 *
 * Every control is wired to a real mutation:
 *   - "Add sub-client"   → useCreateSubClient   (name + owner email dialog)
 *   - "Invite teammate"  → useInviteMember      (email + role dialog)
 *   - sub-client "Remove" → useDeleteSubClient  (confirm dialog)
 * API keys and webhooks are intentionally NOT rendered (product decision).
 */

type SubClient = AgencyWorkspaceData['subClients'][number];
type SubClientStatus = SubClient['status'];
type Member = AgencyWorkspaceData['team'][number];

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
  inactive: 'Inactive',
};

const STATUS_DOT: Record<SubClientStatus, string> = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
  inactive: 'bg-text-faint',
};

const STATUS_CHIP: Record<SubClientStatus, string> = {
  healthy: 'border-accent/30 bg-accent/10 text-accent',
  warming: 'border-accent4/30 bg-accent4/10 text-accent4',
  at_risk: 'border-accent3/30 bg-accent3/10 text-accent3',
  inactive: 'border-border-muted bg-surface-2 text-text-faint',
};

const STATUS_BAR: Record<SubClientStatus, string> = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
  inactive: 'bg-text-faint',
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_TINT: Record<TeamRole, string> = {
  owner: 'text-accent4',
  admin: 'text-accent',
  member: 'text-text-dim',
};

const EASE = [0.22, 1, 0.36, 1] as const;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function AgWksW5Command({ data }: { data: AgencyWorkspaceData }): JSX.Element {
  const { money, number } = useLocaleFormat();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const createSub = useCreateSubClient();
  const inviteMember = useInviteMember();
  const deleteSub = useDeleteSubClient();

  const active = useMemo(
    () => data.subClients.find((s) => s.id === activeId) ?? null,
    [data.subClients, activeId],
  );

  const kpi = useMemo(() => {
    const subs = data.subClients;
    const mailboxTotal = subs.reduce((a, s) => a + s.mailboxCount, 0);
    const mrrTotal = subs.reduce((a, s) => a + s.monthlyMrrUsd, 0);
    const avgWarmth = subs.length
      ? Math.round(subs.reduce((a, s) => a + s.avgWarmth, 0) / subs.length)
      : 0;
    return {
      subCount: subs.length,
      mailboxTotal,
      mrrTotal,
      avgWarmth,
      teamCount: data.team.length,
      healthy: subs.filter((s) => s.status === 'healthy').length,
      warming: subs.filter((s) => s.status === 'warming').length,
      atRisk: subs.filter((s) => s.status === 'at_risk').length,
    };
  }, [data.subClients, data.team.length]);

  const handleCreateSub = async (name: string, ownerEmail: string) => {
    try {
      await createSub.mutateAsync({ name, owner_email: ownerEmail });
      toast.success(`${name} added as a sub-client.`);
      setAddOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not add sub-client.'));
    }
  };

  const handleInvite = async (email: string, role: TeamRole) => {
    try {
      await inviteMember.mutateAsync({ email, role });
      toast.success(`Invitation sent to ${email}.`);
      setInviteOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not send invite.'));
    }
  };

  const handleRemove = async (target: SubClient) => {
    const ok = await confirm({
      title: 'Remove sub-client?',
      description: `${target.name} will lose access and stop being managed from this agency. This cannot be undone.`,
      confirmLabel: 'Remove sub-client',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSub.mutateAsync(target.id);
      toast.success(`${target.name} removed.`);
      setActiveId(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not remove sub-client.'));
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- Hero ---- */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-3xl border border-border-muted bg-surface/70 backdrop-blur-xl"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-accent2/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-lg font-semibold text-accent">
                {initialsOf(data.agency.name)}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-text">
                    {data.agency.name}
                  </h1>
                  <Badge variant="orange">
                    <Sparkles className="h-3 w-3" />
                    {data.agency.plan}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-text-dim">
                  Agency command center · managing {kpi.subCount}{' '}
                  {kpi.subCount === 1 ? 'sub-client' : 'sub-clients'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <HeroMeta icon={Mail} value={data.agency.ownerEmail || '—'} />
              <HeroMeta icon={Globe} value={data.agency.region} mono />
              <HeroMeta value={`@${data.agency.slug}`} mono />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Invite teammate
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add sub-client
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ---- KPI row ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        <KpiCard icon={Building2} label="Sub-clients" value={number(kpi.subCount)} />
        <KpiCard icon={Inbox} label="Mailboxes" value={number(kpi.mailboxTotal)} />
        <KpiCard icon={Users} label="Team members" value={number(kpi.teamCount)} />
        <KpiCard
          icon={DollarSign}
          label="Portfolio MRR"
          value={money(kpi.mrrTotal)}
          accent
        />
        <KpiCard
          icon={Gauge}
          label="Avg warmth"
          value={kpi.subCount ? `${kpi.avgWarmth}%` : '—'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Status mix"
          value={`${kpi.healthy} / ${kpi.warming} / ${kpi.atRisk}`}
          hint="healthy · warming · at-risk"
        />
      </motion.section>

      {/* ---- Sub-clients ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        className="space-y-4"
      >
        <SectionHeader
          icon={Building2}
          title="Sub-clients"
          caption="Accounts under your agency's management"
        />

        {data.subClients.length === 0 ? (
          <EmptyPanel
            icon={Building2}
            title="No sub-clients yet"
            body="Add your first sub-client to start managing their warmup from this console."
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add sub-client
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.subClients.map((sub, i) => (
              <SubClientCard
                key={sub.id}
                sub={sub}
                index={i}
                money={money}
                onOpen={() => setActiveId(sub.id)}
              />
            ))}
          </div>
        )}
      </motion.section>

      {/* ---- Team ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.14 }}
        className="space-y-4"
      >
        <SectionHeader
          icon={Users}
          title="Team"
          caption="People with access to this agency workspace"
          action={
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          }
        />
        {data.team.length === 0 ? (
          <EmptyPanel
            icon={Users}
            title="No teammates yet"
            body="Invite colleagues so they can help manage your sub-clients."
            action={
              <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Invite teammate
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
            {data.team.map((m, i) => (
              <TeamRow key={m.id} member={m} last={i === data.team.length - 1} />
            ))}
          </div>
        )}
      </motion.section>

      {/* ---- Capabilities ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.18 }}
        className="space-y-4"
      >
        <SectionHeader
          icon={Sparkles}
          title="Agency capabilities"
          caption="Premium controls included with your plan"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CapabilityCard
            icon={Palette}
            title="White-label"
            enabled={data.features.whiteLabel.enabled}
            value={
              data.features.whiteLabel.enabled
                ? (data.features.whiteLabel.brandName ?? 'Branded')
                : 'Not configured'
            }
            sub={
              data.features.whiteLabel.enabled
                ? data.features.whiteLabel.hasLogo
                  ? 'Custom logo applied'
                  : 'No logo uploaded'
                : 'Brand the console as your own'
            }
          />
          <CapabilityCard
            icon={Globe}
            title="Custom domain"
            enabled={data.features.customDomain.enabled}
            value={
              data.features.customDomain.enabled
                ? (data.features.customDomain.domain ?? 'Pending')
                : 'Not configured'
            }
            sub={domainSub(data.features.customDomain.status)}
          />
          <CapabilityCard
            icon={Shield}
            title="Dedicated pool"
            enabled={data.features.dedicatedPool.enabled}
            value={
              data.features.dedicatedPool.enabled
                ? (data.features.dedicatedPool.poolName ?? 'Active')
                : 'Not configured'
            }
            sub={
              data.features.dedicatedPool.enabled
                ? `${number(data.features.dedicatedPool.memberCount)} helper inboxes`
                : 'Private helper-inbox network'
            }
          />
        </div>
      </motion.section>

      {/* ---- Detail drawer ---- */}
      <SubClientDrawer
        sub={active}
        money={money}
        number={number}
        removing={deleteSub.isPending}
        onClose={() => setActiveId(null)}
        onRequestRemove={handleRemove}
      />

      {/* ---- Add sub-client dialog ---- */}
      <AddSubClientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        busy={createSub.isPending}
        onSubmit={handleCreateSub}
      />

      {/* ---- Invite teammate dialog ---- */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        busy={inviteMember.isPending}
        onSubmit={handleInvite}
      />
    </div>
  );
}

export default AgWksW5Command;

function domainSub(status: AgencyWorkspaceData['features']['customDomain']['status']): string {
  switch (status) {
    case 'verified':
      return 'DNS verified';
    case 'pending':
      return 'DNS verification pending';
    case 'failed':
      return 'DNS verification failed';
    default:
      return 'Send from your own domain';
  }
}

// ---------------------------------------------------------------------------
// Hero bits
// ---------------------------------------------------------------------------

function HeroMeta({
  icon: Icon,
  value,
  mono,
}: {
  icon?: typeof Mail;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-text-dim">
      {Icon && <Icon className="h-3 w-3 text-text-faint" />}
      <span className={mono ? 'font-mono text-text' : 'text-text'}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl transition-colors hover:border-accent/30">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg ${
            accent ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-dim">
          {label}
        </span>
      </div>
      <p
        className={`mt-2.5 font-mono text-xl font-semibold tabular-nums ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-text-faint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  caption,
  action,
}: {
  icon: typeof Building2;
  title: string;
  caption: string;
  action?: JSX.Element;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-border-muted bg-surface-2 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <p className="text-xs text-text-dim">{caption}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-client card
// ---------------------------------------------------------------------------

function SubClientCard({
  sub,
  index,
  money,
  onOpen,
}: {
  sub: SubClient;
  index: number;
  money: (n: number) => string;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.04 * index }}
      whileHover={{ y: -3 }}
      className="group flex flex-col gap-3.5 rounded-2xl border border-border-muted bg-surface/60 p-4 text-left backdrop-blur-xl transition-colors hover:border-accent/40 hover:bg-surface-2/50"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-muted bg-surface-2 font-mono text-sm font-bold text-accent">
          {sub.logoChar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-text">{sub.name}</p>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-text-faint transition-colors group-hover:text-accent" />
          </div>
          <p className="truncate font-mono text-[11px] text-text-dim">{sub.ownerEmail}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[sub.status]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[sub.status]}`} />
          {STATUS_LABEL[sub.status]}
        </span>
        <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
          {sub.plan}
        </span>
      </div>

      {/* Warmth bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-faint">Avg warmth</span>
          <span className="font-mono font-semibold tabular-nums text-text">
            {sub.avgWarmth}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${STATUS_BAR[sub.status]}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, sub.avgWarmth))}%` }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.1 + 0.04 * index }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border-muted pt-3 text-center">
        <MiniStat label="Mailboxes" value={String(sub.mailboxCount)} />
        <MiniStat label="Team" value={String(sub.teamCount)} />
        <MiniStat label="MRR" value={money(sub.monthlyMrrUsd)} accent />
      </div>

      <p className="text-[10px] text-text-faint">{sub.lastActiveAgo}</p>
    </motion.button>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={`font-mono text-sm font-semibold tabular-nums ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team row
// ---------------------------------------------------------------------------

function TeamRow({ member, last }: { member: Member; last: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 ${
        last ? '' : 'border-b border-border-muted'
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-muted bg-surface-2 font-mono text-[11px] font-semibold text-text-dim">
        {initialsOf(member.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{member.name}</p>
        <p className="truncate font-mono text-[11px] text-text-dim">{member.email}</p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-[11px] text-text-dim">Manages</p>
        <p className="font-mono text-sm font-semibold tabular-nums text-text">
          {member.subClientsManaged}
        </p>
      </div>
      <div className="hidden text-right md:block">
        <p className="text-[11px] text-text-dim">Last active</p>
        <p className="font-mono text-xs text-text">{member.lastActiveAgo}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-[10px] font-semibold ${ROLE_TINT[member.role]}`}
      >
        {ROLE_LABEL[member.role]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capability card
// ---------------------------------------------------------------------------

function CapabilityCard({
  icon: Icon,
  title,
  enabled,
  value,
  sub,
}: {
  icon: typeof Palette;
  title: string;
  enabled: boolean;
  value: string;
  sub: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-xl transition-colors ${
        enabled
          ? 'border-accent/30 bg-accent/[0.06]'
          : 'border-border-muted bg-surface/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${
            enabled ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-faint'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            enabled
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface-2 text-text-faint'
          }`}
        >
          {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {enabled ? 'Active' : 'Off'}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-text">{title}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-text-dim">{value}</p>
      <p className="mt-1.5 text-[11px] text-text-faint">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty panel
// ---------------------------------------------------------------------------

function EmptyPanel({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Building2;
  title: string;
  body: string;
  action: JSX.Element;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-muted bg-surface/40 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-text-dim">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-client detail drawer
// ---------------------------------------------------------------------------

function SubClientDrawer({
  sub,
  money,
  number,
  removing,
  onClose,
  onRequestRemove,
}: {
  sub: SubClient | null;
  money: (n: number) => string;
  number: (n: number) => string;
  removing: boolean;
  onClose: () => void;
  onRequestRemove: (s: SubClient) => void;
}) {
  return (
    <AnimatePresence>
      {sub && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative flex h-full w-full max-w-md flex-col overflow-y-auto overscroll-contain border-l border-border-muted bg-surface shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border-muted p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border-muted bg-surface-2 font-mono text-base font-bold text-accent">
                  {sub.logoChar}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-text">{sub.name}</h3>
                  <p className="truncate font-mono text-xs text-text-dim">
                    {sub.ownerEmail}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CHIP[sub.status]}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[sub.status]}`} />
                  {STATUS_LABEL[sub.status]}
                </span>
                <span className="rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                  {sub.plan}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DrawerStat icon={Inbox} label="Mailboxes" value={number(sub.mailboxCount)} />
                <DrawerStat icon={Users} label="Team" value={number(sub.teamCount)} />
                <DrawerStat
                  icon={DollarSign}
                  label="Monthly MRR"
                  value={money(sub.monthlyMrrUsd)}
                  accent
                />
                <DrawerStat icon={Gauge} label="Avg warmth" value={`${sub.avgWarmth}%`} />
              </div>

              <div className="space-y-2 rounded-2xl border border-border-muted bg-surface-2/40 p-4">
                <DrawerMeta label="Joined" value={sub.createdAgo} />
                <DrawerMeta label="Last active" value={sub.lastActiveAgo} />
                <DrawerMeta label="Owner" value={sub.ownerEmail} mono />
              </div>
            </div>

            <footer className="mt-auto border-t border-border-muted p-5">
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                isLoading={removing}
                onClick={() => onRequestRemove(sub)}
              >
                <Trash2 className="h-4 w-4" />
                Remove sub-client
              </Button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DrawerStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 text-text-dim">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <p
        className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DrawerMeta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-text-dim">{label}</span>
      <span className={`truncate text-text ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add sub-client dialog
// ---------------------------------------------------------------------------

function AddSubClientDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  busy: boolean;
  onSubmit: (name: string, ownerEmail: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const reset = () => {
    setName('');
    setEmail('');
  };

  const valid = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    onSubmit(name.trim(), email.trim());
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <AppDialogContent description="Add a new sub-client account to your agency.">
        <form onSubmit={submit}>
          <AppDialogHeader>
            <AppDialogTitle>Add sub-client</AppDialogTitle>
            <AppDialogDescription>
              Create a managed account. The owner will receive access to their warmup
              under your agency.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogBody className="space-y-4">
            <FormField label="Company name" htmlFor="sc-name" required>
              <Input
                id="sc-name"
                value={name}
                autoFocus
                placeholder="Acme Outreach"
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <FormField label="Owner email" htmlFor="sc-email" required>
              <Input
                id="sc-email"
                type="email"
                value={email}
                placeholder="owner@acme.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid} isLoading={busy}>
              <Plus className="h-4 w-4" />
              Add sub-client
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}

// ---------------------------------------------------------------------------
// Invite teammate dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  busy: boolean;
  onSubmit: (email: string, role: TeamRole) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('member');

  const reset = () => {
    setEmail('');
    setRole('member');
  };

  const valid = /\S+@\S+\.\S+/.test(email.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    onSubmit(email.trim(), role);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <AppDialogContent description="Invite a teammate to your agency workspace.">
        <form onSubmit={submit}>
          <AppDialogHeader>
            <AppDialogTitle>Invite teammate</AppDialogTitle>
            <AppDialogDescription>
              Send an invitation to join your agency workspace and help manage
              sub-clients.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogBody className="space-y-4">
            <FormField label="Email address" htmlFor="inv-email" required>
              <Input
                id="inv-email"
                type="email"
                value={email}
                autoFocus
                placeholder="colleague@youragency.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Role" htmlFor="inv-role">
              <AppSelect value={role} onValueChange={(v) => setRole(v as TeamRole)}>
                <AppSelectTrigger id="inv-role">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="admin">
                    Admin — manage sub-clients &amp; team
                  </AppSelectItem>
                  <AppSelectItem value="member">
                    Member — manage assigned sub-clients
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid} isLoading={busy}>
              <UserPlus className="h-4 w-4" />
              Send invite
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}
