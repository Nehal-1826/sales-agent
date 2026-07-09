import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CircleDot,
  Crown,
  KeyRound,
  Lock,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  User,
  Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * ProPlusWks2Access — Pro Plus "Workspace" rendered as an **Access Control
 * Cockpit**: a security/permissions admin console centred on a *permission
 * matrix* (members × capabilities) backed by real toggle state, plus API-key
 * scope cards, a webhook-event matrix, and a right-rail audit-of-changes
 * stream that prepends every mutation.
 *
 * Distinctness vs neighbours & siblings:
 *   - NOT ProWorkspace (card rail + pane), StarterWorkspace / AgencyWorkspace
 *     (tab control), or ProPlusWorkspace (hero + usage bars + member table +
 *     bento). Those are identity/plan layouts; this is a security console.
 *   - NOT ProPlusWks1OrgChart — that is an SVG org-chart diagram. This is a
 *     dense matrix grid with cell-level toggle interactions.
 *   - NOT the sibling org-chart-roster, identity-hub+activity-stream, or
 *     unified-inventory table designs.
 *
 * The defining gesture is the permission matrix: clicking a cell genuinely
 * flips `members[i].capabilities[capId]` in component state, pulses the
 * cell, and prepends a typed entry onto the audit stream. Owner row is
 * locked (all capabilities granted, no toggle). Rotating a key spins its
 * glyph, bumps `lastUsed` to "just now", and appends an audit entry.
 * Toggling a webhook event mutates `webhook.events` similarly.
 *
 * Fully standalone — prop-less, inline MOCK, no network/router/query hooks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'owner' | 'admin' | 'operator' | 'viewer';

type CapId =
  | 'invite'
  | 'apiKeys'
  | 'webhooks'
  | 'reports'
  | 'billing'
  | 'mailboxes';

type Capabilities = Record<CapId, boolean>;

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  capabilities: Capabilities;
}

type ScopeId = 'read' | 'write' | 'mailboxes' | 'reports' | 'webhooks' | 'admin';

type ScopeFlags = Record<ScopeId, boolean>;

interface ApiKeyRow {
  id: string;
  label: string;
  masked: string;
  scopes: ScopeFlags;
  lastUsed: string;
  status: 'live' | 'revoked';
}

type WebhookEventId = 'sent' | 'replied' | 'spam-rescue' | 'dns-break';

interface WebhookRow {
  id: string;
  url: string;
  events: Record<WebhookEventId, boolean>;
  status: 'live' | 'paused';
}

type AuditKind =
  | 'permission.grant'
  | 'permission.revoke'
  | 'key.rotate'
  | 'key.revoke'
  | 'webhook.subscribe'
  | 'webhook.unsubscribe'
  | 'role.promote';

interface AuditEvent {
  id: string;
  kind: AuditKind;
  actor: string;
  subject: string;
  detail: string;
  at: string; // human-readable "now", "3m ago", etc.
}

// ---------------------------------------------------------------------------
// Capability + scope + event taxonomy
// ---------------------------------------------------------------------------

const CAPABILITIES: Array<{ id: CapId; label: string; icon: LucideIcon }> = [
  { id: 'invite', label: 'Invite', icon: User },
  { id: 'apiKeys', label: 'API keys', icon: KeyRound },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'reports', label: 'Reports', icon: ShieldCheck },
  { id: 'billing', label: 'Billing', icon: Lock },
  { id: 'mailboxes', label: 'Mailboxes', icon: ShieldAlert },
];

const SCOPES: Array<{ id: ScopeId; label: string }> = [
  { id: 'read', label: 'read' },
  { id: 'write', label: 'write' },
  { id: 'mailboxes', label: 'mailboxes' },
  { id: 'reports', label: 'reports' },
  { id: 'webhooks', label: 'webhooks' },
  { id: 'admin', label: 'admin' },
];

const WH_EVENTS: Array<{ id: WebhookEventId; label: string }> = [
  { id: 'sent', label: 'sent' },
  { id: 'replied', label: 'replied' },
  { id: 'spam-rescue', label: 'spam-rescue' },
  { id: 'dns-break', label: 'dns-break' },
];

const ROLE_ICON: Record<Role, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  operator: ShieldAlert,
  viewer: User,
};

// Role → default capability set (a member's caps are derived from this on seed
// and then toggled cell-by-cell).
function defaultsFor(role: Role): Capabilities {
  switch (role) {
    case 'owner':
      return {
        invite: true,
        apiKeys: true,
        webhooks: true,
        reports: true,
        billing: true,
        mailboxes: true,
      };
    case 'admin':
      return {
        invite: true,
        apiKeys: true,
        webhooks: true,
        reports: true,
        billing: false,
        mailboxes: true,
      };
    case 'operator':
      return {
        invite: false,
        apiKeys: false,
        webhooks: true,
        reports: true,
        billing: false,
        mailboxes: true,
      };
    case 'viewer':
      return {
        invite: false,
        apiKeys: false,
        webhooks: false,
        reports: true,
        billing: false,
        mailboxes: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Mock data — Pro Plus workspace, security-admin framing
// ---------------------------------------------------------------------------

const WORKSPACE = {
  name: 'Helix Outbound',
  region: 'eu-west',
};

const SEED_MEMBERS: Array<Pick<Member, 'id' | 'name' | 'email' | 'role'>> = [
  { id: 'm-1', name: 'Reyna Cardoso', email: 'reyna@helix.io', role: 'owner' },
  { id: 'm-2', name: 'Casey Liu', email: 'casey@helix.io', role: 'admin' },
  { id: 'm-3', name: 'Mason Park', email: 'mason@helix.io', role: 'admin' },
  { id: 'm-4', name: 'Imani Brooks', email: 'imani@helix.io', role: 'operator' },
  { id: 'm-5', name: 'Sven Holm', email: 'sven@helix.io', role: 'operator' },
  { id: 'm-6', name: 'Priya Iyer', email: 'priya@helix.io', role: 'operator' },
  { id: 'm-7', name: 'Theo Vance', email: 'theo@helix.io', role: 'viewer' },
  { id: 'm-8', name: 'Ada Okafor', email: 'ada@helix.io', role: 'viewer' },
  { id: 'm-9', name: 'Junichi Sato', email: 'jun@helix.io', role: 'viewer' },
];

const SEED_KEYS: ApiKeyRow[] = [
  {
    id: 'k-1',
    label: 'CI pipeline',
    masked: 'wp_live_8Fk2···3a2',
    scopes: { read: true, write: true, mailboxes: false, reports: false, webhooks: true, admin: false },
    lastUsed: '6m ago',
    status: 'live',
  },
  {
    id: 'k-2',
    label: 'Reporting export',
    masked: 'wp_live_Lz04···91q',
    scopes: { read: true, write: false, mailboxes: false, reports: true, webhooks: false, admin: false },
    lastUsed: '2h ago',
    status: 'live',
  },
  {
    id: 'k-3',
    label: 'Ops dashboard',
    masked: 'wp_live_a91Q···Tn6',
    scopes: { read: true, write: true, mailboxes: true, reports: true, webhooks: true, admin: false },
    lastUsed: '14m ago',
    status: 'live',
  },
  {
    id: 'k-4',
    label: 'Sandbox',
    masked: 'wp_live_Qz72···yX0',
    scopes: { read: true, write: false, mailboxes: false, reports: false, webhooks: false, admin: false },
    lastUsed: '3d ago',
    status: 'live',
  },
];

const SEED_WEBHOOKS: WebhookRow[] = [
  {
    id: 'w-1',
    url: 'hooks.helix.io/wp/events',
    events: { sent: true, replied: true, 'spam-rescue': true, 'dns-break': false },
    status: 'live',
  },
  {
    id: 'w-2',
    url: 'ops.helix.io/ingest/wp',
    events: { sent: false, replied: false, 'spam-rescue': true, 'dns-break': true },
    status: 'live',
  },
  {
    id: 'w-3',
    url: 'lab.helix.io/sandbox/wp',
    events: { sent: true, replied: false, 'spam-rescue': false, 'dns-break': false },
    status: 'paused',
  },
];

const SEED_AUDIT: AuditEvent[] = [
  {
    id: 'a-1',
    kind: 'role.promote',
    actor: 'Reyna',
    subject: 'Casey',
    detail: 'promoted to admin',
    at: '4m ago',
  },
  {
    id: 'a-2',
    kind: 'key.rotate',
    actor: 'Casey',
    subject: 'wp_live_8Fk2···3a2',
    detail: 'rotated CI pipeline key',
    at: '11m ago',
  },
  {
    id: 'a-3',
    kind: 'webhook.subscribe',
    actor: 'Mason',
    subject: 'ops.helix.io/ingest/wp',
    detail: 'subscribed to dns-break',
    at: '38m ago',
  },
  {
    id: 'a-4',
    kind: 'permission.revoke',
    actor: 'Reyna',
    subject: 'Theo',
    detail: 'revoked billing access',
    at: '52m ago',
  },
  {
    id: 'a-5',
    kind: 'permission.grant',
    actor: 'Mason',
    subject: 'Imani',
    detail: 'granted webhooks',
    at: '1h ago',
  },
  {
    id: 'a-6',
    kind: 'key.revoke',
    actor: 'Reyna',
    subject: 'wp_live_old1···9bz',
    detail: 'revoked legacy build key',
    at: '2h ago',
  },
  {
    id: 'a-7',
    kind: 'webhook.unsubscribe',
    actor: 'Casey',
    subject: 'lab.helix.io/sandbox/wp',
    detail: 'unsubscribed from replied',
    at: '3h ago',
  },
  {
    id: 'a-8',
    kind: 'permission.grant',
    actor: 'Reyna',
    subject: 'Sven',
    detail: 'granted mailboxes',
    at: '5h ago',
  },
  {
    id: 'a-9',
    kind: 'role.promote',
    actor: 'Reyna',
    subject: 'Mason',
    detail: 'promoted to admin',
    at: 'yesterday',
  },
  {
    id: 'a-10',
    kind: 'key.rotate',
    actor: 'Mason',
    subject: 'wp_live_a91Q···Tn6',
    detail: 'rotated ops dashboard key',
    at: 'yesterday',
  },
  {
    id: 'a-11',
    kind: 'permission.revoke',
    actor: 'Reyna',
    subject: 'Ada',
    detail: 'revoked invite',
    at: '2d ago',
  },
  {
    id: 'a-12',
    kind: 'webhook.subscribe',
    actor: 'Reyna',
    subject: 'hooks.helix.io/wp/events',
    detail: 'subscribed to spam-rescue',
    at: '2d ago',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hueFromString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

function avatarBg(seed: string): string {
  const hue = hueFromString(seed);
  return `linear-gradient(135deg, hsl(${hue}, 65%, 56%), hsl(${(hue + 38) % 360}, 70%, 46%))`;
}

const AUDIT_META: Record<AuditKind, { icon: LucideIcon; tone: string; label: string }> = {
  'permission.grant': { icon: ShieldCheck, tone: 'text-accent', label: 'GRANT' },
  'permission.revoke': { icon: ShieldOff, tone: 'text-accent3', label: 'REVOKE' },
  'key.rotate': { icon: RefreshCcw, tone: 'text-accent4', label: 'ROTATE' },
  'key.revoke': { icon: ShieldOff, tone: 'text-accent3', label: 'REVOKE' },
  'webhook.subscribe': { icon: Webhook, tone: 'text-accent', label: 'SUBSCRIBE' },
  'webhook.unsubscribe': { icon: Webhook, tone: 'text-text-dim', label: 'UNSUBSCRIBE' },
  'role.promote': { icon: Crown, tone: 'text-accent4', label: 'ROLE' },
};

let _seq = 100;
function nextAuditId(): string {
  _seq += 1;
  return `a-live-${_seq}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusWks2Access(): JSX.Element {
  const [members, setMembers] = useState<Member[]>(() =>
    SEED_MEMBERS.map((m) => ({ ...m, capabilities: defaultsFor(m.role) })),
  );
  const [keys, setKeys] = useState<ApiKeyRow[]>(() => SEED_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>(() => SEED_WEBHOOKS);
  const [audit, setAudit] = useState<AuditEvent[]>(() => SEED_AUDIT);

  // Visual pulses for the most-recently toggled cell. Keyed by composite id.
  const [pulsedCell, setPulsedCell] = useState<string | null>(null);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);
  const [pulsedScope, setPulsedScope] = useState<string | null>(null);

  // Aggregate counts (derived, not stored).
  const counts = useMemo(() => {
    let granted = 0;
    let total = 0;
    for (const m of members) {
      for (const c of CAPABILITIES) {
        total += 1;
        if (m.capabilities[c.id]) granted += 1;
      }
    }
    const liveKeys = keys.filter((k) => k.status === 'live').length;
    const liveWebhooks = webhooks.filter((w) => w.status === 'live').length;
    return { granted, total, liveKeys, liveWebhooks };
  }, [members, keys, webhooks]);

  // -----------------------------------------------------------------------
  // Mutators — every one prepends to the audit stream.
  // -----------------------------------------------------------------------

  function prependAudit(kind: AuditKind, actor: string, subject: string, detail: string) {
    setAudit((prev) => [
      { id: nextAuditId(), kind, actor, subject, detail, at: 'just now' },
      ...prev,
    ]);
  }

  function toggleCapability(memberId: string, capId: CapId) {
    const member = members.find((m) => m.id === memberId);
    if (!member || member.role === 'owner') return; // owner row is locked
    const before = member.capabilities[capId];
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, capabilities: { ...m.capabilities, [capId]: !before } }
          : m,
      ),
    );
    const cellKey = `${memberId}:${capId}`;
    setPulsedCell(cellKey);
    window.setTimeout(() => {
      setPulsedCell((prev) => (prev === cellKey ? null : prev));
    }, 420);
    const cap = CAPABILITIES.find((c) => c.id === capId)!;
    prependAudit(
      before ? 'permission.revoke' : 'permission.grant',
      'You',
      member.name.split(' ')[0]!,
      `${before ? 'revoked' : 'granted'} ${cap.label.toLowerCase()}`,
    );
  }

  function toggleScope(keyId: string, scopeId: ScopeId) {
    const key = keys.find((k) => k.id === keyId);
    if (!key || key.status === 'revoked') return;
    const before = key.scopes[scopeId];
    setKeys((prev) =>
      prev.map((k) =>
        k.id === keyId
          ? { ...k, scopes: { ...k.scopes, [scopeId]: !before } }
          : k,
      ),
    );
    const cellKey = `${keyId}:${scopeId}`;
    setPulsedScope(cellKey);
    window.setTimeout(() => {
      setPulsedScope((prev) => (prev === cellKey ? null : prev));
    }, 420);
    prependAudit(
      before ? 'permission.revoke' : 'permission.grant',
      'You',
      key.masked,
      `${before ? 'revoked' : 'granted'} ${scopeId} scope`,
    );
  }

  function rotateKey(keyId: string) {
    const key = keys.find((k) => k.id === keyId);
    if (!key || key.status === 'revoked') return;
    setRotatingKeyId(keyId);
    window.setTimeout(() => {
      setRotatingKeyId((prev) => (prev === keyId ? null : prev));
    }, 800);
    setKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, lastUsed: 'just now' } : k)),
    );
    prependAudit('key.rotate', 'You', key.masked, `rotated ${key.label.toLowerCase()} key`);
  }

  function revokeKey(keyId: string) {
    const key = keys.find((k) => k.id === keyId);
    if (!key || key.status === 'revoked') return;
    setKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, status: 'revoked' } : k)),
    );
    prependAudit('key.revoke', 'You', key.masked, `revoked ${key.label.toLowerCase()} key`);
  }

  function toggleWebhookEvent(webhookId: string, eventId: WebhookEventId) {
    const wh = webhooks.find((w) => w.id === webhookId);
    if (!wh) return;
    const before = wh.events[eventId];
    setWebhooks((prev) =>
      prev.map((w) =>
        w.id === webhookId
          ? { ...w, events: { ...w.events, [eventId]: !before } }
          : w,
      ),
    );
    const cellKey = `wh:${webhookId}:${eventId}`;
    setPulsedCell(cellKey);
    window.setTimeout(() => {
      setPulsedCell((prev) => (prev === cellKey ? null : prev));
    }, 420);
    prependAudit(
      before ? 'webhook.unsubscribe' : 'webhook.subscribe',
      'You',
      wh.url,
      `${before ? 'unsubscribed from' : 'subscribed to'} ${eventId}`,
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header strip — security cockpit framing */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface/50 px-4 py-3 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-sm font-bold text-bg"
            style={{ background: avatarBg(WORKSPACE.name) }}
            aria-hidden
          >
            {initials(WORKSPACE.name)}
          </span>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              <h1 className="text-base font-semibold tracking-tight text-text">
                Access Control Cockpit
              </h1>
              <Badge variant="orange">
                <Crown className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-xs text-text-dim">
              {WORKSPACE.name} · {WORKSPACE.region} · permissions, keys, webhooks &amp; audit
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SummaryChip
            label="Grants"
            value={`${counts.granted}/${counts.total}`}
            tone="accent"
          />
          <SummaryChip label="Live keys" value={String(counts.liveKeys)} tone="accent4" />
          <SummaryChip
            label="Webhooks"
            value={String(counts.liveWebhooks)}
            tone="accent"
          />
          <SummaryChip
            label="Audit events"
            value={String(audit.length)}
            tone="text-dim"
          />
        </div>
      </motion.header>

      {/* Main 2-column: matrices on the left, audit stream on the right */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left column — matrices + key cards */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-8">
          <PermissionMatrix
            members={members}
            pulsedCell={pulsedCell}
            onToggle={toggleCapability}
          />

          <ApiKeyCards
            keys={keys}
            rotatingKeyId={rotatingKeyId}
            pulsedScope={pulsedScope}
            onToggleScope={toggleScope}
            onRotate={rotateKey}
            onRevoke={revokeKey}
          />

          <WebhookMatrix
            webhooks={webhooks}
            pulsedCell={pulsedCell}
            onToggle={toggleWebhookEvent}
          />
        </div>

        {/* Right rail — audit stream */}
        <div className="min-h-0 lg:col-span-4">
          <AuditStream events={audit} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header summary chip
// ---------------------------------------------------------------------------

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'accent3' | 'accent4' | 'text-dim';
}) {
  const dotTone =
    tone === 'accent'
      ? 'bg-accent'
      : tone === 'accent3'
        ? 'bg-accent3'
        : tone === 'accent4'
          ? 'bg-accent4'
          : 'bg-text-dim';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/50 px-2.5 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} aria-hidden />
      <span className="text-text-dim">{label}</span>
      <span className="font-semibold tabular-nums text-text">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Permission matrix — members × capabilities
// ---------------------------------------------------------------------------

function PermissionMatrix({
  members,
  pulsedCell,
  onToggle,
}: {
  members: Member[];
  pulsedCell: string | null;
  onToggle: (memberId: string, capId: CapId) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="rounded-xl border border-border-muted bg-surface/60 backdrop-blur-xl"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Permission matrix</h2>
          <span className="text-xs text-text-dim">
            · {members.length} members × {CAPABILITIES.length} capabilities
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">
          click a cell to flip
        </span>
      </header>

      <div className="max-h-[26rem] overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 w-56 bg-surface/95 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Member
              </th>
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <th
                    key={c.id}
                    className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-text-dim"
                    title={c.label}
                  >
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <Icon className="h-3.5 w-3.5 text-text-dim" aria-hidden />
                      <span>{c.label}</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((m, rowIdx) => {
              const RIcon = ROLE_ICON[m.role];
              const isOwner = m.role === 'owner';
              return (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.08 + rowIdx * 0.03 }}
                  className="border-t border-border-muted/60"
                >
                  <td className="sticky left-0 z-10 w-56 bg-surface/95 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-xs font-semibold text-bg"
                        style={{ background: avatarBg(m.email) }}
                        aria-hidden
                      >
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-medium text-text">
                            {m.name}
                          </p>
                          <RIcon
                            className={`h-3 w-3 ${
                              m.role === 'owner'
                                ? 'text-accent4'
                                : m.role === 'admin'
                                  ? 'text-accent'
                                  : 'text-text-dim'
                            }`}
                            aria-hidden
                          />
                        </div>
                        <p className="truncate text-[10px] uppercase tracking-wider text-text-dim">
                          {m.role}
                        </p>
                      </div>
                    </div>
                  </td>
                  {CAPABILITIES.map((c) => {
                    const granted = m.capabilities[c.id];
                    const cellKey = `${m.id}:${c.id}`;
                    const isPulsed = pulsedCell === cellKey;
                    return (
                      <td key={c.id} className="px-1.5 py-1.5 text-center">
                        <MatrixCell
                          granted={granted}
                          locked={isOwner}
                          pulsed={isPulsed}
                          ariaLabel={`${c.label} for ${m.name}: ${granted ? 'granted' : 'denied'}${isOwner ? ' (owner, locked)' : ''}`}
                          onClick={() => onToggle(m.id, c.id)}
                        />
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border-muted px-4 py-2 text-[10px] text-text-dim">
        <span className="inline-flex items-center gap-1.5">
          <CellSwatch granted />
          granted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CellSwatch granted={false} />
          denied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-2.5 w-2.5 text-accent4" aria-hidden />
          owner row locked
        </span>
      </footer>
    </motion.section>
  );
}

function MatrixCell({
  granted,
  locked,
  pulsed,
  ariaLabel,
  onClick,
}: {
  granted: boolean;
  locked: boolean;
  pulsed: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-label={ariaLabel}
      aria-pressed={granted}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
        granted
          ? 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
          : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
      } ${locked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
    >
      <motion.span
        key={granted ? '1' : '0'}
        initial={{ scale: 0.6, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex h-3 w-3 items-center justify-center"
        aria-hidden
      >
        {granted ? (
          locked ? (
            <Lock className="h-3 w-3" />
          ) : (
            <CircleDot className="h-3 w-3" />
          )
        ) : (
          <span className="h-1 w-1 rounded-full bg-text-dim/70" />
        )}
      </motion.span>
      <AnimatePresence>
        {pulsed ? (
          <motion.span
            key="pulse"
            initial={{ opacity: 0.6, scale: 0.85 }}
            animate={{ opacity: 0, scale: 1.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
            className={`pointer-events-none absolute inset-0 rounded-md border ${
              granted ? 'border-accent' : 'border-accent3'
            }`}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
    </button>
  );
}

function CellSwatch({ granted }: { granted: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-sm border ${
        granted
          ? 'border-accent/40 bg-accent/30'
          : 'border-border-muted bg-surface-2'
      }`}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// API key cards — masked token + scope-token chips + rotate / revoke
// ---------------------------------------------------------------------------

function ApiKeyCards({
  keys,
  rotatingKeyId,
  pulsedScope,
  onToggleScope,
  onRotate,
  onRevoke,
}: {
  keys: ApiKeyRow[];
  rotatingKeyId: string | null;
  pulsedScope: string | null;
  onToggleScope: (keyId: string, scopeId: ScopeId) => void;
  onRotate: (keyId: string) => void;
  onRevoke: (keyId: string) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="rounded-xl border border-border-muted bg-surface/60 backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent4" aria-hidden />
          <h2 className="text-sm font-semibold text-text">API keys</h2>
          <span className="text-xs text-text-dim">
            · scope chips light up when granted
          </span>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-px bg-border-muted/60 md:grid-cols-2">
        {keys.map((k, i) => {
          const isRotating = rotatingKeyId === k.id;
          const isRevoked = k.status === 'revoked';
          return (
            <motion.article
              key={k.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.16 + i * 0.05 }}
              className={`flex flex-col gap-3 bg-surface/80 p-4 ${
                isRevoked ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate text-sm font-medium text-text">
                      {k.label}
                    </h3>
                    {isRevoked ? (
                      <span className="rounded border border-accent3/40 bg-accent3/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent3">
                        revoked
                      </span>
                    ) : (
                      <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
                        live
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono text-[11px] text-text-dim">
                    {k.masked}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRotate(k.id)}
                    disabled={isRevoked}
                    aria-label={`Rotate ${k.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border-muted bg-surface-2/40 text-text-dim transition-colors hover:bg-surface-2 hover:text-accent4 disabled:opacity-40"
                  >
                    <motion.span
                      animate={isRotating ? { rotate: 360 } : { rotate: 0 }}
                      transition={
                        isRotating
                          ? { duration: 0.7, ease: 'easeInOut' }
                          : { duration: 0 }
                      }
                      className="inline-flex"
                      aria-hidden
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </motion.span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevoke(k.id)}
                    disabled={isRevoked}
                    aria-label={`Revoke ${k.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border-muted bg-surface-2/40 text-text-dim transition-colors hover:bg-surface-2 hover:text-accent3 disabled:opacity-40"
                  >
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {SCOPES.map((s) => {
                  const lit = k.scopes[s.id];
                  const cellKey = `${k.id}:${s.id}`;
                  const pulsed = pulsedScope === cellKey;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleScope(k.id, s.id)}
                      disabled={isRevoked}
                      aria-pressed={lit}
                      aria-label={`Toggle ${s.label} scope on ${k.label}`}
                      className={`relative rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                        lit
                          ? 'border-accent/40 bg-accent/15 text-accent'
                          : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                      } ${isRevoked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {s.label}
                      <AnimatePresence>
                        {pulsed ? (
                          <motion.span
                            key="lit"
                            initial={{ opacity: 0.7, scale: 0.85 }}
                            animate={{ opacity: 0, scale: 1.6 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className={`pointer-events-none absolute inset-0 rounded-full border ${
                              lit ? 'border-accent' : 'border-accent3'
                            }`}
                            aria-hidden
                          />
                        ) : null}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-dim">
                <span>last used {k.lastUsed}</span>
                <span className="font-mono">
                  {Object.values(k.scopes).filter(Boolean).length}/{SCOPES.length} scopes
                </span>
              </div>
            </motion.article>
          );
        })}
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Webhook event matrix — webhooks × event types
// ---------------------------------------------------------------------------

function WebhookMatrix({
  webhooks,
  pulsedCell,
  onToggle,
}: {
  webhooks: WebhookRow[];
  pulsedCell: string | null;
  onToggle: (webhookId: string, eventId: WebhookEventId) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.18 }}
      className="rounded-xl border border-border-muted bg-surface/60 backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Webhook event matrix</h2>
          <span className="text-xs text-text-dim">
            · which events fire
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">
          {webhooks.length} endpoints × {WH_EVENTS.length} events
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-64 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Endpoint
              </th>
              {WH_EVENTS.map((e) => (
                <th
                  key={e.id}
                  className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-text-dim"
                >
                  {e.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w, rowIdx) => (
              <motion.tr
                key={w.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.22 + rowIdx * 0.04 }}
                className="border-t border-border-muted/60"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 flex-none rounded-full ${
                        w.status === 'live' ? 'bg-accent' : 'bg-text-dim'
                      }`}
                      aria-hidden
                    />
                    <span
                      className="truncate font-mono text-xs text-text"
                      title={w.url}
                    >
                      {w.url}
                    </span>
                  </div>
                </td>
                {WH_EVENTS.map((e) => {
                  const on = w.events[e.id];
                  const cellKey = `wh:${w.id}:${e.id}`;
                  const isPulsed = pulsedCell === cellKey;
                  return (
                    <td key={e.id} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onToggle(w.id, e.id)}
                        aria-pressed={on}
                        aria-label={`Toggle ${e.label} for ${w.url}`}
                        className={`relative inline-flex h-6 w-12 items-center rounded-full border transition-colors ${
                          on
                            ? 'border-accent/40 bg-accent/20'
                            : 'border-border-muted bg-surface-2/50'
                        }`}
                      >
                        <motion.span
                          animate={{ x: on ? 24 : 2 }}
                          transition={{
                            type: 'spring',
                            stiffness: 500,
                            damping: 30,
                          }}
                          className={`inline-block h-4 w-4 rounded-full ${
                            on ? 'bg-accent' : 'bg-text-dim'
                          }`}
                          aria-hidden
                        />
                        <AnimatePresence>
                          {isPulsed ? (
                            <motion.span
                              key="ring"
                              initial={{ opacity: 0.6, scale: 0.85 }}
                              animate={{ opacity: 0, scale: 1.5 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.42, ease: 'easeOut' }}
                              className={`pointer-events-none absolute inset-0 rounded-full border ${
                                on ? 'border-accent' : 'border-accent3'
                              }`}
                              aria-hidden
                            />
                          ) : null}
                        </AnimatePresence>
                      </button>
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Audit-of-changes stream — right rail, prepends on every mutation
// ---------------------------------------------------------------------------

function AuditStream({ events }: { events: AuditEvent[] }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border-muted bg-surface/60 backdrop-blur-xl"
    >
      <header className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Audit of changes</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-dim">
          live
        </span>
      </header>

      <ol className="flex-1 overflow-y-auto px-2 py-2">
        <AnimatePresence initial={false}>
          {events.map((ev) => {
            const meta = AUDIT_META[ev.kind];
            const Icon = meta.icon;
            return (
              <motion.li
                key={ev.id}
                layout
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2/40">
                  <span
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-md border border-border-muted bg-surface-2/60 ${meta.tone}`}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded border border-border-muted bg-surface-2/60 px-1 py-0.5 font-mono text-[9px] tracking-wider ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-text-dim">{ev.at}</span>
                    </div>
                    <p className="mt-1 text-xs text-text">
                      <span className="font-semibold">{ev.actor}</span>{' '}
                      <span className="text-text-dim">{ev.detail}</span>
                    </p>
                    <p className="truncate font-mono text-[10px] text-text-dim">
                      {ev.subject}
                    </p>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </motion.aside>
  );
}

export default ProPlusWks2Access;
