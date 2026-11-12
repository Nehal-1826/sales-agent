import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity,
  ArrowUpRight,
  CreditCard,
  Crown,
  Key,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useMailboxes } from '@/features/mailboxes/api';
import { TeamActivityChart } from '@/features/workspace/TeamActivityChart';
import {
  useInviteMember,
  useRemoveMember,
  useWorkspace,
  type TeamMember,
  type TeamRole,
} from '@/features/workspace/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
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
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import { extractErrorMessage } from '@/lib/errors';
import { usePlan } from '@/lib/usePlan';
import { DedicatedPoolCard } from './DedicatedPoolCard';
// TODO: lift pro-workspace.css into pages/client/workspace/ in a follow-up.
import '@/pages/client-design-preview/pro-workspace/pro-workspace.css';

/**
 * /app/workspace for Pro tier — W7 Hub (W5+W6 fusion) with real data.
 *
 * Fully functional: team invite / remove are wired to the `/api/workspace`
 * backend via the hooks in features/workspace/api.ts. Workspace activity
 * renders the real 30-day team-invite series from
 * useWorkspace().team_activity_series via TeamActivityChart.
 */

const ROLE_ICON: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
};
const ROLE_TONE: Record<TeamRole, string> = {
  owner: 'violet',
  admin: 'cyan',
  member: 'green',
};

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._\-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function hueFromEmail(email: string): number {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function memberStatus(m: TeamMember): 'active' | 'invited' | 'paused' {
  if (!m.accepted_at) return 'invited';
  return 'active';
}

const HUE_BG = (hue: number): string =>
  `linear-gradient(135deg, hsl(${hue}, 75%, 60%), hsl(${(hue + 40) % 360}, 75%, 50%))`;

export function ProWorkspace() {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const { isAgency } = usePlan();
  const ws = workspaceQuery.data;
  const team = ws?.team_members ?? [];
  const mailboxes = mailboxesQuery.data?.items ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const removeMember = useRemoveMember();

  const filteredTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter(
      (m) => m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q),
    );
  }, [team, search]);

  const safeActiveId = activeId ?? filteredTeam[0]?.id ?? team[0]?.id ?? null;
  const member =
    team.find((m) => m.id === safeActiveId) ?? filteredTeam[0] ?? team[0] ?? null;

  // Whoever can invite: an empty team means the current user is the lone
  // owner, so invite must be allowed (mirror of TeamMembersTable logic).
  const canManage =
    team.length === 0 ||
    team.some((m) => m.can_invite || m.role === 'owner' || m.role === 'admin');

  // Plan-based caps (Pro tier).
  const PRO_MAILBOX_CAP = 10;
  const PRO_SEAT_CAP = 10;

  const handleRemove = async (m: TeamMember) => {
    const ok = await confirm({
      title: 'Remove team member?',
      description: `${m.email} will lose access to the workspace immediately.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    removeMember.mutate(m.id, {
      onSuccess: () => {
        toast.success('Member removed');
        if (activeId === m.id) setActiveId(null);
      },
      onError: (err) => toast.error(extractErrorMessage(err, 'Failed to remove')),
    });
  };

  return (
    <div className="w7">
      {/* HERO */}
      <header className="w7__hero">
        <div className="w7__hero-id">
          <span className="w7__hero-mark">{initials(ws?.name ?? 'WP')}</span>
          <div className="w7__hero-text">
            <span className="w7__hero-eyebrow">
              <Crown size={11} strokeWidth={2.4} />
              Pro workspace
            </span>
            <h1 className="w7__hero-name">{ws?.name ?? 'Your workspace'}</h1>
            <span className="w7__hero-slug">
              created {relTime(ws?.created_at ?? null)}
            </span>
          </div>
        </div>
        <div className="w7__hero-chips">
          <span className="w7__hero-chip">
            <Users size={11} strokeWidth={2.4} />
            {team.length} member{team.length === 1 ? '' : 's'}
          </span>
          <span className="w7__hero-chip">
            <Mail size={11} strokeWidth={2.4} />
            {mailboxes.length} mailbox{mailboxes.length === 1 ? '' : 'es'}
          </span>
        </div>
      </header>

      {/* Plan + Activity row */}
      <div className="w7__row w7__row--plan">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w7__plan"
        >
          <header className="w7__plan-head">
            <span className="w7__plan-eyebrow">Current plan</span>
            <span className="w7__plan-badge">
              <Crown size={11} strokeWidth={2.4} />
              {(ws?.plan ?? 'pro').toUpperCase()}
            </span>
          </header>
          <div className="w7__plan-usage">
            <UsageBar
              label="Mailboxes"
              used={mailboxes.length}
              total={PRO_MAILBOX_CAP}
            />
            <UsageBar label="Team seats" used={team.length} total={PRO_SEAT_CAP} />
          </div>
          <Link to="/app/billing" className="w7__plan-cta">
            Manage plan
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </Link>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="w7__activity"
        >
          <header className="w7__activity-head">
            <span className="w7__activity-eyebrow">
              <Activity size={11} strokeWidth={2.4} />
              Workspace activity
            </span>
            <span style={{ fontSize: 10, color: 'var(--wp-text-faint)' }}>
              last 30 days
            </span>
          </header>
          <TeamActivityChart />
        </motion.section>
      </div>

      {/* Dedicated peer pool — Agency / Enterprise only */}
      {isAgency ? (
        <div style={{ marginTop: -2 }}>
          <DedicatedPoolCard />
        </div>
      ) : null}

      {/* Members workspace */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="w7__members"
      >
        <aside className="w7__rail">
          <header className="w7__rail-head">
            <span className="w7__rail-title">
              <Users size={11} strokeWidth={2.4} />
              Team · {team.length}
            </span>
            {canManage ? (
              <button
                type="button"
                className="w7__rail-invite"
                onClick={() => setInviteOpen(true)}
                aria-label="Invite team member"
              >
                <Plus size={11} strokeWidth={2.4} />
              </button>
            ) : null}
          </header>
          <div className="w7__search">
            <Search size={11} strokeWidth={2.4} />
            <input
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="w7__rail-list">
            {team.length === 0 && (
              <li
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--wp-text-faint)',
                  fontSize: 11,
                }}
              >
                No team members yet
              </li>
            )}
            {team.length > 0 && filteredTeam.length === 0 && (
              <li
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--wp-text-faint)',
                  fontSize: 11,
                }}
              >
                No members match “{search}”
              </li>
            )}
            {filteredTeam.map((m) => {
              const Icon = ROLE_ICON[m.role];
              const isActive = m.id === safeActiveId;
              const status = memberStatus(m);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(m.id)}
                    className={`w7__rail-row ${isActive ? 'w7__rail-row--active' : ''}`}
                  >
                    <span
                      className="w7__rail-avatar"
                      style={{ background: HUE_BG(hueFromEmail(m.email)) }}
                    >
                      {initials(m.email)}
                    </span>
                    <div className="w7__rail-text">
                      <span className="w7__rail-name">
                        {m.email.split('@')[0]}
                      </span>
                      <span className="w7__rail-sub">{m.email}</span>
                    </div>
                    <span
                      className={`w7__rail-role w7__rail-role--${ROLE_TONE[m.role]}`}
                    >
                      <Icon size={9} strokeWidth={2.4} />
                    </span>
                    <span
                      className={`w7__rail-status w7__rail-status--${status}`}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {member ? (
          <motion.section
            key={member.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="w7__pane"
          >
            <header className="w7__pane-hero">
              <span
                className="w7__pane-avatar"
                style={{ background: HUE_BG(hueFromEmail(member.email)) }}
              >
                {initials(member.email)}
              </span>
              <div className="w7__pane-id">
                <span
                  className={`w7__pane-role w7__pane-role--${ROLE_TONE[member.role]}`}
                >
                  {(() => {
                    const RIcon = ROLE_ICON[member.role];
                    return <RIcon size={11} strokeWidth={2.4} />;
                  })()}
                  {member.role}
                </span>
                <h2 className="w7__pane-name">{member.email.split('@')[0]}</h2>
                <span className="w7__pane-email">{member.email}</span>
              </div>
              <div className="w7__pane-actions">
                <a
                  href={`mailto:${member.email}`}
                  className="w7-btn w7-btn--ghost"
                >
                  Message
                </a>
                {canManage && member.role !== 'owner' ? (
                  <button
                    type="button"
                    className="w7-btn w7-btn--ghost"
                    onClick={() => handleRemove(member)}
                    disabled={removeMember.isPending}
                  >
                    {removeMember.isPending && removeMember.variables === member.id ? (
                      <Loader2 size={12} className="w7-spin" strokeWidth={2.4} />
                    ) : (
                      <Trash2 size={12} strokeWidth={2.4} />
                    )}
                    Remove
                  </button>
                ) : null}
                <button type="button" className="w7__pane-more" aria-hidden disabled>
                  <MoreHorizontal size={13} strokeWidth={2.4} />
                </button>
              </div>
            </header>

            <div className="w7__pane-stats">
              <div className="w7__pane-stat">
                <span className="w7__pane-stat-lbl">Status</span>
                <span
                  className={`w7__pane-stat-val w7__pane-stat-val--${memberStatus(member)}`}
                >
                  {memberStatus(member)}
                </span>
              </div>
              <div className="w7__pane-stat">
                <span className="w7__pane-stat-lbl">Joined</span>
                <span className="w7__pane-stat-val">
                  {member.accepted_at
                    ? relTime(member.accepted_at)
                    : `invited ${relTime(member.invited_at)}`}
                </span>
              </div>
              <div className="w7__pane-stat">
                <span className="w7__pane-stat-lbl">Can invite</span>
                <span className="w7__pane-stat-val">
                  {member.can_invite ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="w7__pane-stat">
                <span className="w7__pane-stat-lbl">Role</span>
                <span className="w7__pane-stat-val">{member.role}</span>
              </div>
            </div>

            <section className="w7__panel">
              <header className="w7__panel-head">
                <span className="w7__panel-title">
                  <Key size={11} strokeWidth={2.4} /> Permissions
                </span>
              </header>
              <div className="w7__perms">
                <Perm
                  label="Manage mailboxes"
                  on={member.role === 'owner' || member.role === 'admin'}
                />
                <Perm label="Generate reports" on={true} />
                <Perm label="Invite members" on={member.can_invite} />
                <Perm label="Manage billing" on={member.role === 'owner'} />
                <Perm label="View workspace" on={true} />
              </div>
            </section>
          </motion.section>
        ) : (
          <section className="w7__pane">
            <div className="w7__empty">
              No team members yet — invite someone to get started.
            </div>
          </section>
        )}
      </motion.div>

      {/* Bento footer */}
      <div className="w7__bento">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="w7__card"
        >
          <header className="w7__card-head">
            <span className="w7__card-icon w7__card-icon--pink">
              <CreditCard size={13} strokeWidth={2.4} />
            </span>
            <div className="w7__card-id">
              <span className="w7__card-eyebrow">Billing</span>
              <span className="w7__card-meta">Manage in Billing tab</span>
            </div>
          </header>
          <Link
            to="/app/billing"
            className="w7-btn w7-btn--ghost"
            style={{ width: 'fit-content' }}
          >
            Open billing
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </Link>
        </motion.section>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <li>
      <span className="w7__plan-usage-lbl">{label}</span>
      <span className="w7__plan-usage-bar">
        <span className="w7__plan-usage-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="w7__plan-usage-val">
        {used} / {total}
      </span>
    </li>
  );
}

function Perm({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`w7__perm ${on ? 'w7__perm--on' : 'w7__perm--off'}`}>
      <span className="w7__perm-icon">{on ? '✓' : '—'}</span>
      <span>{label}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Team invite dialog
// --------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['admin', 'member']),
});
type InviteForm = z.infer<typeof inviteSchema>;

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invite = useInviteMember();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const close = (v: boolean) => {
    if (!v) {
      reset({ email: '', role: 'member' });
      invite.reset();
    }
    onOpenChange(v);
  };

  const onSubmit = (values: InviteForm) => {
    invite.mutate(
      { email: values.email, role: values.role },
      {
        onSuccess: () => {
          toast.success(`Invited ${values.email}`);
          close(false);
        },
        onError: (err) => toast.error(extractErrorMessage(err, 'Failed to send invite')),
      },
    );
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Invite a teammate</AppDialogTitle>
        </AppDialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <AppDialogBody>
            <FormField label="Email" htmlFor="inv-email" required error={errors.email?.message}>
              <Input
                id="inv-email"
                type="email"
                placeholder="teammate@company.com"
                {...register('email')}
              />
            </FormField>
            <FormField label="Role" htmlFor="inv-role">
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <AppSelect value={field.value} onValueChange={field.onChange}>
                    <AppSelectTrigger id="inv-role">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      <AppSelectItem value="admin">
                        Admin — can manage team &amp; billing
                      </AppSelectItem>
                      <AppSelectItem value="member">
                        Member — can use warmup tools
                      </AppSelectItem>
                    </AppSelectContent>
                  </AppSelect>
                )}
              />
            </FormField>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" type="button" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={invite.isPending}
              leftIcon={
                invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
              }
            >
              {invite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </AppDialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  );
}

export default ProWorkspace;
