import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Check,
  Copy,
  Crown,
  Key,
  Mail,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';

/**
 * ProPlusWorkspace — "Team & Access" Pro-Plus-tier section design.
 *
 * STANDALONE: renders prop-less with inline MOCK data for the isolated
 * preview harness (no network / router / query hooks). The harness supplies
 * the shell + sidebar; this component renders page content only.
 *
 * Layout:
 *   ┌── hero (workspace identity + member/mailbox/key chips) ──────────┐
 *   ┌── overview row ─────────────────────────────────────────────────┐
 *   │  ┌── plan + seat/usage bars ──┐ ┌── workspace activity sparkbar ┐│
 *   └──────────────────────────────────────────────────────────────────┘
 *   ┌── team members table (avatar · email · role · status · active) ──┐
 *   ┌── bento footer ─────────────────────────────────────────────────┐
 *   │  ┌── API keys panel ──┐ ┌── webhooks card ──┐
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Invite / create-key / create-webhook open LOCAL-STATE dialogs; creating a
 * key or webhook flows into a one-time secret-reveal dialog mock. No network.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'owner' | 'admin' | 'member';
type MemberStatus = 'active' | 'invited' | 'paused';

interface Member {
  id: string;
  email: string;
  role: Role;
  status: MemberStatus;
  lastActive: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created: string;
  lastUsed: string | null;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDelivery: string | null;
}

// ---------------------------------------------------------------------------
// Mock data — fully inline, realistic agency-lite Pro Plus account
// ---------------------------------------------------------------------------

const WORKSPACE = {
  name: 'Acme Growth Studio',
  plan: 'PRO PLUS',
  createdAt: '4 months ago',
  seatCap: 12,
  mailboxCap: 25,
  apiKeyCap: 8,
  mailboxesUsed: 14,
};

const MOCK_MEMBERS: Member[] = [
  {
    id: 'm-1',
    email: 'founder@acme.io',
    role: 'owner',
    status: 'active',
    lastActive: '3m ago',
  },
  {
    id: 'm-2',
    email: 'ops.lead@acme.io',
    role: 'admin',
    status: 'active',
    lastActive: '1h ago',
  },
  {
    id: 'm-3',
    email: 'sara.chen@acme.io',
    role: 'admin',
    status: 'active',
    lastActive: '4h ago',
  },
  {
    id: 'm-4',
    email: 'marcus@acme.io',
    role: 'member',
    status: 'active',
    lastActive: '2d ago',
  },
  {
    id: 'm-5',
    email: 'intern@acme.io',
    role: 'member',
    status: 'invited',
    lastActive: 'never',
  },
  {
    id: 'm-6',
    email: 'contractor@partner.co',
    role: 'member',
    status: 'paused',
    lastActive: '21d ago',
  },
];

const MOCK_KEYS: ApiKey[] = [
  {
    id: 'k-1',
    name: 'Production API',
    prefix: 'wp_live_8Fk2',
    created: 'Feb 02, 2026',
    lastUsed: '6m ago',
  },
  {
    id: 'k-2',
    name: 'CI pipeline',
    prefix: 'wp_live_a91Q',
    created: 'Mar 18, 2026',
    lastUsed: '3h ago',
  },
  {
    id: 'k-3',
    name: 'Reporting export',
    prefix: 'wp_live_Lz04',
    created: 'Apr 27, 2026',
    lastUsed: null,
  },
];

const MOCK_WEBHOOKS: WebhookEndpoint[] = [
  {
    id: 'w-1',
    url: 'https://hooks.acme.io/warmpulse/events',
    events: ['mailbox_paused', 'bounce_spike', 'weekly_digest'],
    active: true,
    lastDelivery: '12m ago',
  },
  {
    id: 'w-2',
    url: 'https://ops.acme.io/ingest/wp',
    events: ['invoice_paid', 'member_invited'],
    active: false,
    lastDelivery: '4d ago',
  },
];

const WEBHOOK_EVENTS = [
  'mailbox_paused',
  'bounce_spike',
  'peer_failed',
  'weekly_digest',
  'invoice_paid',
  'member_invited',
] as const;

// 14-point team activity sparkbar (invites accepted per period).
const ACTIVITY = [2, 1, 3, 2, 4, 3, 5, 4, 3, 6, 5, 4, 7, 6];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_ICON: Record<Role, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
};

const ROLE_BADGE: Record<Role, 'orange' | 'blue' | 'green'> = {
  owner: 'orange',
  admin: 'blue',
  member: 'green',
};

const STATUS_DOT: Record<MemberStatus, string> = {
  active: 'bg-accent',
  invited: 'bg-accent4',
  paused: 'bg-accent3',
};

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function hueFromEmail(email: string): number {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

function avatarBg(email: string): string {
  const hue = hueFromEmail(email);
  return `linear-gradient(135deg, hsl(${hue}, 70%, 58%), hsl(${(hue + 40) % 360}, 70%, 48%))`;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// Deterministic fake secret for the one-time reveal dialog mock.
function fakeSecret(prefix: string): string {
  return `${prefix}_${'xY7Qm2Lp9Rk4Tn6Wb1Vz8Hs3Df5Gj0'}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusWorkspace(): JSX.Element {
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ title: string; secret: string } | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MOCK_MEMBERS;
    return MOCK_MEMBERS.filter(
      (m) => m.email.toLowerCase().includes(q) || m.role.includes(q),
    );
  }, [search]);

  const seatPct = Math.round((MOCK_MEMBERS.length / WORKSPACE.seatCap) * 100);
  const mbPct = Math.round((WORKSPACE.mailboxesUsed / WORKSPACE.mailboxCap) * 100);
  const keyPct = Math.round((MOCK_KEYS.length / WORKSPACE.apiKeyCap) * 100);
  const activityMax = Math.max(...ACTIVITY, 1);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <span
            className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-lg font-bold text-bg"
            style={{ background: avatarBg(WORKSPACE.name) }}
            aria-hidden
          >
            {initials(WORKSPACE.name)}
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {WORKSPACE.name}
              </h1>
              <Badge variant="orange">
                <Crown className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-sm text-text-dim">
              Team &amp; access · created {WORKSPACE.createdAt}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { Icon: Users, v: `${MOCK_MEMBERS.length} members` },
            { Icon: Mail, v: `${WORKSPACE.mailboxesUsed} mailboxes` },
            { Icon: Key, v: `${MOCK_KEYS.length} API keys` },
          ].map(({ Icon, v }) => (
            <span
              key={v}
              className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 px-3 py-1.5 text-xs text-text-dim backdrop-blur-xl"
            >
              <Icon className="h-3.5 w-3.5 text-accent" />
              {v}
            </span>
          ))}
        </div>
      </motion.header>

      {/* Overview row: plan/usage + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div {...fade(0.05)} className="lg:col-span-7">
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-4 p-5">
              <header className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
                  Current plan
                </span>
                <Badge variant="orange">
                  <Crown className="h-3 w-3" />
                  {WORKSPACE.plan}
                </Badge>
              </header>
              <div className="space-y-3.5">
                <UsageBar label="Team seats" used={MOCK_MEMBERS.length} total={WORKSPACE.seatCap} pct={seatPct} />
                <UsageBar
                  label="Mailboxes"
                  used={WORKSPACE.mailboxesUsed}
                  total={WORKSPACE.mailboxCap}
                  pct={mbPct}
                />
                <UsageBar label="API keys" used={MOCK_KEYS.length} total={WORKSPACE.apiKeyCap} pct={keyPct} />
              </div>
              <button
                type="button"
                className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
              >
                Manage plan →
              </button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade(0.1)} className="lg:col-span-5">
          <Card className="h-full" noShimmer>
            <CardContent className="space-y-4 p-5">
              <header className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-dim">
                  <Activity className="h-3.5 w-3.5 text-accent" />
                  Workspace activity
                </span>
                <span className="text-xs text-text-dim">last 14d</span>
              </header>
              <div className="flex h-28 items-end gap-1.5">
                {ACTIVITY.map((v, i) => (
                  <motion.span
                    key={i}
                    className="flex-1 rounded-t bg-accent/70"
                    initial={{ height: 0 }}
                    animate={{ height: `${(v / activityMax) * 100}%` }}
                    transition={{
                      duration: 0.5,
                      delay: 0.15 + i * 0.03,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-text-dim">
                <span className="font-semibold text-text">
                  {ACTIVITY.reduce((a, b) => a + b, 0)}
                </span>{' '}
                member actions this period
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Team members table */}
      <motion.div {...fade(0.15)}>
        <Card noShimmer>
          <CardContent className="p-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
              <span className="flex items-center gap-2 text-base font-semibold text-text">
                <Users className="h-4 w-4 text-accent" />
                Team members
                <span className="text-sm font-normal text-text-dim">
                  · {MOCK_MEMBERS.length}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-1.5">
                  <Search className="h-3.5 w-3.5 text-text-dim" />
                  <input
                    placeholder="Search members…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-40 bg-transparent text-sm text-text outline-none placeholder:text-text-dim"
                  />
                </div>
                <Button size="sm" onClick={() => setInviteOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                  Invite
                </Button>
              </div>
            </header>

            {/* Column header */}
            <div className="hidden grid-cols-12 gap-3 border-b border-border-muted px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-text-dim sm:grid">
              <span className="col-span-5">Member</span>
              <span className="col-span-2">Role</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-3 text-right">Last active</span>
            </div>

            <ul className="divide-y divide-border-muted">
              {filtered.length === 0 ? (
                <li className="px-5 py-10 text-center text-sm italic text-text-dim">
                  No members match “{search}”.
                </li>
              ) : (
                filtered.map((m, i) => {
                  const RIcon = ROLE_ICON[m.role];
                  return (
                    <motion.li
                      key={m.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.18 + i * 0.04 }}
                      className="grid grid-cols-1 gap-2 px-5 py-3 transition-colors hover:bg-surface-2/50 sm:grid-cols-12 sm:items-center sm:gap-3"
                    >
                      <div className="col-span-5 flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-sm font-semibold text-bg"
                          style={{ background: avatarBg(m.email) }}
                          aria-hidden
                        >
                          {initials(m.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">
                            {m.email.split('@')[0]}
                          </p>
                          <p className="truncate text-xs text-text-dim">{m.email}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Badge variant={ROLE_BADGE[m.role]}>
                          <RIcon className="h-3 w-3" />
                          {m.role}
                        </Badge>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[m.status]}`}
                          aria-hidden
                        />
                        <span className="text-sm capitalize text-text-dim">
                          {m.status}
                        </span>
                      </div>
                      <div className="col-span-3 flex items-center justify-between sm:justify-end sm:gap-3">
                        <span className="text-sm text-text-dim">{m.lastActive}</span>
                        {m.role !== 'owner' ? (
                          <button
                            type="button"
                            className="text-text-dim transition-colors hover:text-accent3"
                            aria-label={`Remove ${m.email}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="w-3.5" aria-hidden />
                        )}
                      </div>
                    </motion.li>
                  );
                })
              )}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Bento footer: API keys + webhooks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* API keys */}
        <motion.div {...fade(0.2)}>
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Key className="h-3.5 w-3.5" />
                  </span>
                  API keys
                  <span className="text-sm font-normal text-text-dim">
                    · {MOCK_KEYS.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setKeyOpen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:bg-surface-2/80 hover:text-accent"
                  aria-label="Create API key"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </header>
              <ul className="divide-y divide-border-muted">
                {MOCK_KEYS.map((k, i) => (
                  <motion.li
                    key={k.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.24 + i * 0.05 }}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{k.name}</p>
                      <p className="font-mono text-xs text-text-dim">
                        {k.prefix}··· · created {k.created}
                      </p>
                    </div>
                    <span className="hidden text-xs text-text-dim sm:block">
                      {k.lastUsed ? `used ${k.lastUsed}` : 'never used'}
                    </span>
                    <button
                      type="button"
                      className="flex-none text-text-dim transition-colors hover:text-accent3"
                      aria-label={`Revoke ${k.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </motion.li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        {/* Webhooks */}
        <motion.div {...fade(0.24)}>
          <Card className="h-full" noShimmer>
            <CardContent className="p-0">
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
                <span className="flex items-center gap-2 text-base font-semibold text-text">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent4/10 text-accent4">
                    <Webhook className="h-3.5 w-3.5" />
                  </span>
                  Webhooks
                  <span className="text-sm font-normal text-text-dim">
                    · {MOCK_WEBHOOKS.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setWebhookOpen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:bg-surface-2/80 hover:text-accent"
                  aria-label="Add webhook"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </header>
              <ul className="divide-y divide-border-muted">
                {MOCK_WEBHOOKS.map((w, i) => (
                  <motion.li
                    key={w.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.28 + i * 0.06 }}
                    className="space-y-2 px-5 py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 flex-none rounded-full ${
                          w.active ? 'bg-accent' : 'bg-text-dim'
                        }`}
                        aria-hidden
                      />
                      <p
                        className="min-w-0 flex-1 truncate font-mono text-sm text-text"
                        title={w.url}
                      >
                        {w.url.replace(/^https?:\/\//, '')}
                      </p>
                      <button
                        type="button"
                        className="flex-none rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface-2/80 hover:text-accent"
                      >
                        <Send className="mr-1 inline h-3 w-3" />
                        Test
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-4">
                      {w.events.map((ev) => (
                        <span
                          key={ev}
                          className="rounded border border-border-muted bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] text-text-dim"
                        >
                          {ev}
                        </span>
                      ))}
                      <span className="ml-auto text-xs text-text-dim">
                        {w.lastDelivery ? `last ${w.lastDelivery}` : 'no sends'}
                      </span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ---- Dialogs (local state only) ---- */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <CreateSecretDialog
        open={keyOpen}
        onOpenChange={setKeyOpen}
        title="New API key"
        label="Key name"
        placeholder="CI pipeline"
        onCreate={(_name) =>
          setRevealed({
            title: 'Your API key — copy it now',
            secret: fakeSecret('wp_live_Qz72'),
          })
        }
      />
      <CreateWebhookDialog
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
        onCreate={() =>
          setRevealed({
            title: 'Signing secret — copy it now',
            secret: fakeSecret('whsec'),
          })
        }
      />
      <RevealSecretDialog payload={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  total,
  pct,
}: {
  label: string;
  used: number;
  total: number;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-text-dim">{label}</span>
        <span className="font-medium tabular-nums text-text">
          {used} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('member');

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Invite a teammate</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="space-y-1.5">
            <label
              htmlFor="ppw-invite-email"
              className="text-sm font-medium text-text"
            >
              Email
            </label>
            <Input
              id="ppw-invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-text">Role</span>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'member'] as const).map((r) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm capitalize transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-text'
                        : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)} disabled={!email.trim()}>
            Send invite
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function CreateSecretDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  label: string;
  placeholder: string;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
    onOpenChange(false);
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>{title}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="space-y-1.5">
            <label htmlFor="ppw-secret-name" className="text-sm font-medium text-text">
              {label}
            </label>
            <Input
              id="ppw-secret-name"
              placeholder={placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-text-dim">
              The full secret is shown once on creation — store it somewhere safe.
            </p>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Create
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: () => void;
}) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<Set<string>>(() => new Set());

  const toggle = (ev: string) =>
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });

  const submit = () => {
    if (!url.trim() || events.size === 0) return;
    onCreate();
    setUrl('');
    setEvents(new Set());
    onOpenChange(false);
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle>Add webhook endpoint</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="space-y-1.5">
            <label htmlFor="ppw-wh-url" className="text-sm font-medium text-text">
              Endpoint URL
            </label>
            <Input
              id="ppw-wh-url"
              type="url"
              placeholder="https://example.com/hooks/warmpulse"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-text">Events</span>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((ev) => {
                const checked = events.has(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggle(ev)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors ${
                      checked
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded border ${
                        checked
                          ? 'border-accent bg-accent text-bg'
                          : 'border-border-muted'
                      }`}
                    >
                      {checked ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      ) : null}
                    </span>
                    {ev}
                  </button>
                );
              })}
            </div>
          </div>
        </AppDialogBody>
        <AppDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!url.trim() || events.size === 0}>
            Add webhook
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

function RevealSecretDialog({
  payload,
  onClose,
}: {
  payload: { title: string; secret: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!payload) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(payload.secret).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => undefined,
      );
    }
  };

  return (
    <AppDialog open={!!payload} onOpenChange={(v) => !v && onClose()}>
      <AppDialogContent showClose={false}>
        <AppDialogHeader>
          <AppDialogTitle>{payload?.title ?? 'Secret'}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogBody>
          <div className="rounded-lg border border-accent3/40 bg-accent3/5 p-3 text-xs text-accent3">
            This is the only time we&apos;ll show the full value. Save it somewhere
            safe — you won&apos;t be able to see it again.
          </div>
          <AnimatePresence>
            {payload ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 p-3"
              >
                <code className="flex-1 break-all font-mono text-sm text-text">
                  {payload.secret}
                </code>
                <Button variant="secondary" size="sm" onClick={copy}>
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </AppDialogBody>
        <AppDialogFooter>
          <Button onClick={onClose}>I&apos;ve saved it, dismiss</Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}

export default ProPlusWorkspace;
