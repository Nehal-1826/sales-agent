import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Globe2,
  Key,
  KeyRound,
  Mail,
  MailPlus,
  Network,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/**
 * ProPlusWks3Hub — Pro Plus "Workspace" rendered as an **Identity Hub +
 * Activity Stream**.
 *
 * The page is built around a single oversized *workspace identity card* at
 * the top — the workspace's "license plate" — followed by a vertical
 * newsfeed-style activity stream of recent workspace events. A right rail
 * holds three *collapsible detail drawers* (Team, API Keys, Webhooks) that
 * peek at counts and expand to a chip preview; only one drawer is open at a
 * time. A footer quick-actions row genuinely prepends a new entry onto the
 * activity stream when clicked.
 *
 * Distinctness — what this is NOT:
 *   - NOT ProWorkspace (card-rail + member pane).
 *   - NOT StarterWorkspace (Starter-tier identity hero w/ real query hooks +
 *     3-cell stat strip + infinite activity hook). This is Pro-Plus,
 *     prop-less, has capacity bars + region/sender + collapsible right-rail
 *     drawers + a working quick-action that mutates the stream.
 *   - NOT AgencyWorkspace (AppTabs with sub-clients / branding / dedicated
 *     pool tabs).
 *   - NOT ProPlusWorkspace (hero + usage bars + member table + bento).
 *   - NOT ProPlusWks1OrgChart (SVG hierarchy diagram with connectors).
 *   - NOT ProPlusWks2Access (members×capabilities permission matrix cockpit).
 *   - NOT a unified-inventory table.
 *
 * Defining gestures:
 *   - The identity card is the page's centre of gravity, dominating the top
 *     band with name + slug + region + sender + 4 *capacity bars* whose
 *     widths animate in.
 *   - The activity feed is the *only* main-column content below — a single
 *     vertical newsfeed, each entry an actor avatar + verb + target +
 *     timestamp + optional preview chip. Stagger entrance + AnimatePresence
 *     prepend on quick-action.
 *   - Right-rail drawers are mutually exclusive (one open) and expand to
 *     reveal mini chips of the items inside.
 *
 * Fully standalone — prop-less, inline MOCK, no network / router / query
 * hooks. The preview harness supplies the shell + sidebar; this component
 * renders page content only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Capacity {
  label: string;
  used: number;
  cap: number;
  unit?: string;
  icon: LucideIcon;
}

interface Identity {
  name: string;
  slug: string;
  plan: string;
  planSince: string;
  region: string;
  senderName: string;
  senderEmail: string;
  capacities: {
    mailboxes: Capacity;
    peers: Capacity;
    seats: Capacity;
    keys: Capacity;
  };
  metrics: { label: string; value: string; delta: string }[];
}

interface Member {
  id: string;
  initials: string;
  name: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  joinedAgo: string;
}

interface ApiKey {
  id: string;
  label: string;
  masked: string;
  lastUsed: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: number;
  status: 'live' | 'paused';
}

type FeedKind =
  | 'member.joined'
  | 'member.role'
  | 'apikey.created'
  | 'webhook.fired'
  | 'mailbox.connected'
  | 'peerpool.updated'
  | 'workspace.renamed'
  | 'webhook.created'
  | 'apikey.rotated';

interface FeedEntry {
  id: string;
  kind: FeedKind;
  actor: { initials: string; name: string };
  verb: string;
  target: string;
  preview?: string;
  at: string;
  fresh?: boolean;
}

type DrawerId = 'team' | 'keys' | 'hooks';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const IDENTITY: Identity = {
  name: 'Lumen Outreach',
  slug: 'lumen-outreach',
  plan: 'Pro Plus',
  planSince: 'since Apr 2026',
  region: 'EU-Central · Frankfurt',
  senderName: 'Lumen Sales Team',
  senderEmail: 'hello@lumen.co',
  capacities: {
    mailboxes: { label: 'Mailboxes', used: 42, cap: 60, icon: Mail },
    peers: { label: 'Helper group', used: 184, cap: 250, icon: Network },
    seats: { label: 'Team seats', used: 7, cap: 15, icon: Users },
    keys: { label: 'API keys', used: 4, cap: 10, icon: KeyRound },
  },
  metrics: [
    { label: 'Sends · 7d', value: '12,408', delta: '+8.4%' },
    { label: 'Inbox rate', value: '93.1%', delta: '+1.2 pp' },
    { label: 'Spam rescues', value: '187', delta: '-12' },
  ],
};

const MEMBERS: Member[] = [
  { id: 'm1', initials: 'AR', name: 'Asha Rao', role: 'owner', joinedAgo: '1y' },
  { id: 'm2', initials: 'DK', name: 'Daniel Kim', role: 'admin', joinedAgo: '8mo' },
  { id: 'm3', initials: 'MV', name: 'Maya Velasquez', role: 'admin', joinedAgo: '7mo' },
  { id: 'm4', initials: 'JT', name: 'Jonas Thiel', role: 'operator', joinedAgo: '5mo' },
  { id: 'm5', initials: 'PE', name: 'Priya Eswaran', role: 'operator', joinedAgo: '4mo' },
  { id: 'm6', initials: 'RC', name: 'Rafael Cortes', role: 'operator', joinedAgo: '3mo' },
  { id: 'm7', initials: 'NH', name: 'Nia Holloway', role: 'viewer', joinedAgo: '2mo' },
  { id: 'm8', initials: 'LB', name: 'Luca Bianchi', role: 'viewer', joinedAgo: '3w' },
];

const API_KEYS: ApiKey[] = [
  { id: 'k1', label: 'Production · ingest', masked: 'wp_live_••••3F2A', lastUsed: '12m ago' },
  { id: 'k2', label: 'CI · reports export', masked: 'wp_live_••••91BC', lastUsed: '2h ago' },
  { id: 'k3', label: 'Zapier · webhook bridge', masked: 'wp_live_••••70AE', lastUsed: '1d ago' },
  { id: 'k4', label: 'Staging · QA', masked: 'wp_test_••••0044', lastUsed: '9d ago' },
];

const WEBHOOKS: WebhookEndpoint[] = [
  { id: 'w1', url: 'hooks.lumen.co/warmpulse/sent', events: 3, status: 'live' },
  { id: 'w2', url: 'hooks.lumen.co/warmpulse/spam-rescue', events: 1, status: 'live' },
  { id: 'w3', url: 'hooks.lumen.co/warmpulse/audit', events: 5, status: 'paused' },
];

const SEED_FEED: FeedEntry[] = [
  {
    id: 'f1',
    kind: 'webhook.fired',
    actor: { initials: 'SY', name: 'system' },
    verb: 'fired',
    target: 'hooks.lumen.co/warmpulse/sent',
    preview: '204 OK · 142 ms',
    at: '2m ago',
  },
  {
    id: 'f2',
    kind: 'mailbox.connected',
    actor: { initials: 'JT', name: 'Jonas Thiel' },
    verb: 'connected',
    target: 'outreach-eu-12@lumen.co',
    preview: 'Gmail OAuth',
    at: '14m ago',
  },
  {
    id: 'f3',
    kind: 'member.joined',
    actor: { initials: 'AR', name: 'Asha Rao' },
    verb: 'invited',
    target: 'luca.b@lumen.co',
    preview: 'role · viewer',
    at: '32m ago',
  },
  {
    id: 'f4',
    kind: 'apikey.rotated',
    actor: { initials: 'DK', name: 'Daniel Kim' },
    verb: 'rotated',
    target: 'CI · reports export',
    preview: 'wp_live_••••91BC',
    at: '1h ago',
  },
  {
    id: 'f5',
    kind: 'peerpool.updated',
    actor: { initials: 'MV', name: 'Maya Velasquez' },
    verb: 'switched helper group to',
    target: 'EU-curated · tier-2',
    preview: '184 helpers',
    at: '2h ago',
  },
  {
    id: 'f6',
    kind: 'member.role',
    actor: { initials: 'AR', name: 'Asha Rao' },
    verb: 'promoted',
    target: 'Maya Velasquez',
    preview: 'operator → admin',
    at: '5h ago',
  },
  {
    id: 'f7',
    kind: 'webhook.created',
    actor: { initials: 'DK', name: 'Daniel Kim' },
    verb: 'created webhook',
    target: 'hooks.lumen.co/warmpulse/audit',
    preview: '5 events',
    at: '8h ago',
  },
  {
    id: 'f8',
    kind: 'mailbox.connected',
    actor: { initials: 'PE', name: 'Priya Eswaran' },
    verb: 'connected',
    target: 'sdr-team-03@lumen.co',
    preview: 'Outlook',
    at: '11h ago',
  },
  {
    id: 'f9',
    kind: 'apikey.created',
    actor: { initials: 'AR', name: 'Asha Rao' },
    verb: 'issued',
    target: 'Zapier · webhook bridge',
    preview: 'scopes · read · webhooks',
    at: '1d ago',
  },
  {
    id: 'f10',
    kind: 'member.joined',
    actor: { initials: 'DK', name: 'Daniel Kim' },
    verb: 'invited',
    target: 'nia.h@lumen.co',
    preview: 'role · viewer',
    at: '2d ago',
  },
  {
    id: 'f11',
    kind: 'workspace.renamed',
    actor: { initials: 'AR', name: 'Asha Rao' },
    verb: 'renamed workspace to',
    target: 'Lumen Outreach',
    preview: 'was · Lumen Inc',
    at: '4d ago',
  },
  {
    id: 'f12',
    kind: 'peerpool.updated',
    actor: { initials: 'SY', name: 'system' },
    verb: 'auto-pruned',
    target: 'default helper group',
    preview: '6 low-trust helpers',
    at: '6d ago',
  },
];

// ---------------------------------------------------------------------------
// Taxonomy — verb icons + label tokens
// ---------------------------------------------------------------------------

const FEED_ICON: Record<FeedKind, LucideIcon> = {
  'member.joined': UserPlus,
  'member.role': Crown,
  'apikey.created': KeyRound,
  'apikey.rotated': Key,
  'webhook.fired': Zap,
  'webhook.created': Webhook,
  'mailbox.connected': Mail,
  'peerpool.updated': Network,
  'workspace.renamed': Sparkles,
};

const FEED_TONE: Record<FeedKind, string> = {
  'member.joined': 'text-accent',
  'member.role': 'text-accent4',
  'apikey.created': 'text-accent',
  'apikey.rotated': 'text-accent4',
  'webhook.fired': 'text-accent',
  'webhook.created': 'text-accent',
  'mailbox.connected': 'text-accent',
  'peerpool.updated': 'text-accent4',
  'workspace.renamed': 'text-text-dim',
};

const ROLE_LABEL: Record<Member['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-full border border-border-muted bg-surface-2 text-[11px] font-semibold text-text"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function CapacityBar({ cap, delay }: { cap: Capacity; delay: number }) {
  const pct = Math.min(100, Math.round((cap.used / cap.cap) * 100));
  const tone =
    pct >= 90 ? 'bg-accent3' : pct >= 70 ? 'bg-accent4' : 'bg-accent';
  const Icon = cap.icon;
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-text-dim">
          <Icon size={13} aria-hidden />
          {cap.label}
        </span>
        <span className="font-mono text-text">
          {cap.used}
          <span className="text-text-dim">/{cap.cap}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <motion.div
          className={`h-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay }}
        />
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wider text-text-dim">
        {pct}% used
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity card
// ---------------------------------------------------------------------------

function IdentityCard({ identity }: { identity: Identity }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      aria-label="Workspace identity"
    >
      <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-border-muted bg-surface-2">
              <Crown size={24} className="text-accent4" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-text">
                  {identity.name}
                </h1>
                <Badge variant="yellow" className="border-accent4/40">
                  <Crown size={11} aria-hidden /> {identity.plan}
                </Badge>
              </div>
              <p className="mt-0.5 font-mono text-xs text-text-dim">
                wp.app/{identity.slug} · {identity.planSince}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <Globe2 size={13} aria-hidden />
              {identity.region}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Send size={13} aria-hidden />
              {identity.senderName}
              <span className="font-mono text-text/80">
                &lt;{identity.senderEmail}&gt;
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-accent" aria-hidden />
              SPF · DKIM · DMARC verified
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            {identity.metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-wider text-text-dim">
                  {m.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-text">
                    {m.value}
                  </span>
                  <span className="text-[11px] text-accent">{m.delta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 lg:min-w-[18rem]">
          <Button leftIcon={<ArrowUpRight size={15} />}>Open settings</Button>
          <Button variant="outline" leftIcon={<Copy size={14} />}>
            Copy workspace ID
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border-muted bg-bg/40 p-4 md:grid-cols-4">
        <CapacityBar cap={identity.capacities.mailboxes} delay={0.15} />
        <CapacityBar cap={identity.capacities.peers} delay={0.22} />
        <CapacityBar cap={identity.capacities.seats} delay={0.29} />
        <CapacityBar cap={identity.capacities.keys} delay={0.36} />
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Activity stream (newsfeed)
// ---------------------------------------------------------------------------

function FeedRow({ entry, index }: { entry: FeedEntry; index: number }) {
  const Icon = FEED_ICON[entry.kind];
  const tone = FEED_TONE[entry.kind];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{
        duration: 0.35,
        ease: 'easeOut',
        delay: entry.fresh ? 0 : Math.min(index * 0.035, 0.4),
      }}
      className="relative flex gap-3 px-4 py-3"
    >
      <div className="relative flex flex-col items-center">
        <Avatar initials={entry.actor.initials} size={30} />
        <div className="mt-1 flex-1 border-l border-dashed border-border-muted" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium text-text">{entry.actor.name}</span>
          <span className="text-text-dim">{entry.verb}</span>
          <span className="font-mono text-[12.5px] text-text">
            {entry.target}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2/60 px-2 py-0.5 text-[11px] ${tone}`}
          >
            <Icon size={11} aria-hidden />
            {entry.kind}
          </span>
          {entry.preview ? (
            <span className="rounded-md border border-border-muted bg-bg/60 px-2 py-0.5 font-mono text-[11px] text-text-dim">
              {entry.preview}
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-text-dim">{entry.at}</span>
        </div>
      </div>
    </motion.li>
  );
}

function ActivityStream({ feed }: { feed: FeedEntry[] }) {
  return (
    <section
      aria-label="Workspace activity stream"
      className="flex h-full min-h-0 flex-col rounded-2xl border border-border-muted bg-surface"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Workspace activity</h2>
          <Badge variant="neutral">{feed.length} events</Badge>
        </div>
        <span className="text-[11px] text-text-dim">live · last 7 days</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-border-muted/60">
          <AnimatePresence initial={false}>
            {feed.map((entry, i) => (
              <FeedRow key={entry.id} entry={entry} index={i} />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right-rail drawers (mutually exclusive)
// ---------------------------------------------------------------------------

interface DrawerCardProps {
  id: DrawerId;
  title: string;
  Icon: LucideIcon;
  count: number;
  cap: number;
  open: boolean;
  onToggle: (id: DrawerId) => void;
  children: React.ReactNode;
}

function DrawerCard({
  id,
  title,
  Icon,
  count,
  cap,
  open,
  onToggle,
  children,
}: DrawerCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40"
      >
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-border-muted bg-surface-2">
          <Icon size={16} className="text-text" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text">{title}</span>
            <span className="font-mono text-xs text-text-dim">
              {count}
              <span className="text-text-dim/70">/{cap}</span>
            </span>
          </div>
          <div className="text-[11px] text-text-dim">
            {open ? 'showing chips below' : 'tap to expand'}
          </div>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-dim"
          aria-hidden
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-muted bg-bg/40 px-4 py-3">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MemberChips({ members }: { members: Member[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {members.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-2 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1"
        >
          <Avatar initials={m.initials} size={20} />
          <span className="text-xs text-text">{m.name}</span>
          <span className="text-[10px] uppercase tracking-wider text-text-dim">
            {ROLE_LABEL[m.role]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function KeyChips({ keys }: { keys: ApiKey[] }) {
  return (
    <ul className="space-y-1.5">
      {keys.map((k) => (
        <li
          key={k.id}
          className="flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/60 px-2.5 py-1.5"
        >
          <KeyRound size={12} className="text-text-dim" aria-hidden />
          <span className="text-xs text-text">{k.label}</span>
          <span className="ml-auto font-mono text-[11px] text-text-dim">
            {k.masked}
          </span>
          <span className="text-[10px] text-text-dim">· {k.lastUsed}</span>
        </li>
      ))}
    </ul>
  );
}

function WebhookChips({ hooks }: { hooks: WebhookEndpoint[] }) {
  return (
    <ul className="space-y-1.5">
      {hooks.map((h) => (
        <li
          key={h.id}
          className="flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/60 px-2.5 py-1.5"
        >
          <Webhook size={12} className="text-text-dim" aria-hidden />
          <span className="truncate font-mono text-[11px] text-text">
            {h.url}
          </span>
          <Badge
            variant={h.status === 'live' ? 'green' : 'neutral'}
            className="ml-auto"
          >
            {h.status === 'live' ? (
              <Check size={10} aria-hidden />
            ) : null}
            {h.status}
          </Badge>
          <span className="text-[10px] text-text-dim">{h.events} ev</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Quick actions footer
// ---------------------------------------------------------------------------

type QuickActionId = 'invite' | 'newKey' | 'newHook' | 'connectMailbox';

interface QuickAction {
  id: QuickActionId;
  label: string;
  Icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'invite', label: 'Invite teammate', Icon: UserPlus },
  { id: 'newKey', label: 'Create API key', Icon: Plus },
  { id: 'newHook', label: 'Add webhook', Icon: Webhook },
  { id: 'connectMailbox', label: 'Connect mailbox', Icon: MailPlus },
];

function makeFreshEntry(actionId: QuickActionId, seq: number): FeedEntry {
  const id = `fresh-${seq}-${actionId}`;
  switch (actionId) {
    case 'invite':
      return {
        id,
        kind: 'member.joined',
        actor: { initials: 'AR', name: 'Asha Rao' },
        verb: 'invited',
        target: `pending-${seq}@lumen.co`,
        preview: 'role · operator',
        at: 'just now',
        fresh: true,
      };
    case 'newKey':
      return {
        id,
        kind: 'apikey.created',
        actor: { initials: 'AR', name: 'Asha Rao' },
        verb: 'issued',
        target: `Ad-hoc key #${seq}`,
        preview: `wp_live_••••${(seq * 17).toString(16).padStart(4, '0').toUpperCase()}`,
        at: 'just now',
        fresh: true,
      };
    case 'newHook':
      return {
        id,
        kind: 'webhook.created',
        actor: { initials: 'AR', name: 'Asha Rao' },
        verb: 'created webhook',
        target: `hooks.lumen.co/warmpulse/draft-${seq}`,
        preview: '0 events',
        at: 'just now',
        fresh: true,
      };
    case 'connectMailbox':
    default:
      return {
        id,
        kind: 'mailbox.connected',
        actor: { initials: 'AR', name: 'Asha Rao' },
        verb: 'connected',
        target: `outreach-eu-${20 + seq}@lumen.co`,
        preview: 'Gmail OAuth',
        at: 'just now',
        fresh: true,
      };
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProPlusWks3Hub(): JSX.Element {
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>('team');
  const [feed, setFeed] = useState<FeedEntry[]>(SEED_FEED);
  const [actionSeq, setActionSeq] = useState(1);

  const toggleDrawer = (id: DrawerId) => {
    setOpenDrawer((current) => (current === id ? null : id));
  };

  const handleQuickAction = (action: QuickAction) => {
    const next = makeFreshEntry(action.id, actionSeq);
    setActionSeq((s) => s + 1);
    setFeed((prev) => [next, ...prev]);
  };

  const memberCount = useMemo(() => MEMBERS.length, []);
  const keyCount = useMemo(() => API_KEYS.length, []);
  const hookCount = useMemo(() => WEBHOOKS.length, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-bg p-4 text-text lg:p-6">
      <IdentityCard identity={IDENTITY} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-[28rem] lg:min-h-0">
          <ActivityStream feed={feed} />
        </div>

        <aside
          className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1"
          aria-label="Workspace detail drawers"
        >
          <DrawerCard
            id="team"
            title="Team"
            Icon={Users}
            count={memberCount}
            cap={IDENTITY.capacities.seats.cap}
            open={openDrawer === 'team'}
            onToggle={toggleDrawer}
          >
            <MemberChips members={MEMBERS} />
          </DrawerCard>

          <DrawerCard
            id="keys"
            title="API keys"
            Icon={KeyRound}
            count={keyCount}
            cap={IDENTITY.capacities.keys.cap}
            open={openDrawer === 'keys'}
            onToggle={toggleDrawer}
          >
            <KeyChips keys={API_KEYS} />
          </DrawerCard>

          <DrawerCard
            id="hooks"
            title="Webhooks"
            Icon={Webhook}
            count={hookCount}
            cap={10}
            open={openDrawer === 'hooks'}
            onToggle={toggleDrawer}
          >
            <WebhookChips hooks={WEBHOOKS} />
          </DrawerCard>

          <div className="rounded-2xl border border-border-muted bg-surface p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-text-dim">
              Quick actions
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.Icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleQuickAction(a)}
                    className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-surface-2"
                  >
                    <Icon size={14} className="text-accent" aria-hidden />
                    <span className="truncate">{a.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-text-dim">
              Click any action to prepend a new entry to the activity stream.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ProPlusWks3Hub;
