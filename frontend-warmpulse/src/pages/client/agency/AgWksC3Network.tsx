import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Circle,
  CircleDashed,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Globe2,
  Key,
  KeyRound,
  Layers,
  Mail,
  Mailbox,
  Network,
  Orbit,
  Palette,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Webhook,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatMoney } from '@/lib/format';

/**
 * AgWksC3Network — Agency-tier "Workspace" surface, variant C3 ("Network Hub").
 *
 * Distinct from C1 (single-ring orbital), C2 (galaxy / two concentric rings)
 * and C4 (whatever lock-final pulse variant): C3 is a NESTED constellation —
 * a galaxy of mini-galaxies. The AGENCY sits at the centre; eight SUB-CLIENT
 * nodes ride a first-ring orbit; and crucially each sub-client has its OWN
 * small orbit of MAILBOX dots ringing it. The eye can read the structural
 * depth (agency → clients → mailboxes) in one frame.
 *
 * The page is the management surface for an Agency-tier workspace:
 *   • Manage sub-clients (their mailbox fleet, plan, MRR, owner).
 *   • Manage agency team (owner / admin / member roles).
 *   • API keys + webhooks compact tiles (the integration plane).
 *   • Agency-only features: white-label branding, custom domain, dedicated
 *     peer pool — surfaced as three feature cards in the right inspector
 *     default state, so a brand-new agency feels what the tier unlocks.
 *
 * Distinguishing visual gestures:
 *   • Two-level nesting drawn as a single SVG scene. First-level lines are
 *     accent-dashed (radial spokes core → sub-client). Second-level lines
 *     are short solid spokes (sub-client → its mailbox dot). Mailbox dots
 *     inherit the parent's status colour at a lighter alpha.
 *   • Per sub-client we render `min(mailboxCount, 6)` little mailbox dots
 *     in a tight orbit at radius ~50. If the actual count exceeds 6 the
 *     6th slot becomes a "+N more" pill rather than a dot.
 *   • Click a sub-client node → inspector swaps to that account's card
 *     with a LIST of its mailboxes. Click a mailbox dot → inspector swaps
 *     to that mailbox's detail (email address, warmth, last active).
 *   • At-risk sub-clients pulse a halo continuously so the eye lands on
 *     them first.
 *   • Mailbox dots stagger-reveal after their parent sub-client lands.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar / chrome. Node coordinates are computed deterministically
 * (trig on the array index) — no layout libraries.
 */

// ---------------------------------------------------------------------------
// Data shapes — VERBATIM from the spec (shared across all 4 Agency-workspace
// variants). Do NOT edit fields without coordinating with C1 / C2 / C4.
// ---------------------------------------------------------------------------

type SubClientStatus = 'healthy' | 'warming' | 'at_risk' | 'inactive';
type TeamRole = 'owner' | 'admin' | 'member';
type DomainStatus = 'verified' | 'pending' | 'failed' | 'not_set';
type ApiKeyScope = 'read' | 'write' | 'admin';
type WebhookStatus = 'live' | 'paused';

export interface AgencyWorkspaceData {
  agency: {
    name: string;
    plan: string;
    ownerEmail: string;
    region: string;
    slug: string;
  };
  features: {
    whiteLabel: { enabled: boolean; brandName: string | null; hasLogo: boolean };
    customDomain: { enabled: boolean; domain: string | null; status: DomainStatus };
    dedicatedPool: { enabled: boolean; poolName: string | null; memberCount: number };
  };
  subClients: Array<{
    id: string;
    name: string;
    logoChar: string;
    ownerEmail: string;
    plan: string;
    mailboxCount: number;
    teamCount: number;
    avgWarmth: number;
    status: SubClientStatus;
    monthlyMrrUsd: number;
    createdAgo: string;
    lastActiveAgo: string;
  }>;
  team: Array<{
    id: string;
    name: string;
    email: string;
    role: TeamRole;
    lastActiveAgo: string;
    subClientsManaged: number;
  }>;
  apiKeys: Array<{
    id: string;
    label: string;
    masked: string;
    scope: ApiKeyScope;
    lastUsedAgo: string;
  }>;
  webhooks: Array<{
    id: string;
    url: string;
    events: string[];
    status: WebhookStatus;
  }>;
}

// ---------------------------------------------------------------------------
// MOCK — 8 sub-clients (5 healthy / 2 warming / 1 at_risk) with mailbox
// counts ranging 3–22 so the mini-orbits visibly vary. The skeleton const
// (exported below the component) is the empty-state shape.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyWorkspaceData['subClients'] = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    ownerEmail: 'ops@lumenlabs.co',
    plan: 'Pro Plus',
    mailboxCount: 14,
    teamCount: 3,
    avgWarmth: 88,
    status: 'healthy',
    monthlyMrrUsd: 720,
    createdAgo: '6 mo ago',
    lastActiveAgo: '4m ago',
  },
  {
    id: 'sc-northwind-co',
    name: 'Northwind Co',
    logoChar: 'NC',
    ownerEmail: 'andy@northwindco.com',
    plan: 'Pro Plus',
    mailboxCount: 22,
    teamCount: 5,
    avgWarmth: 84,
    status: 'healthy',
    monthlyMrrUsd: 1080,
    createdAgo: '11 mo ago',
    lastActiveAgo: '1m ago',
  },
  {
    id: 'sc-orbit',
    name: 'Orbit Studio',
    logoChar: 'OS',
    ownerEmail: 'tess@orbit.studio',
    plan: 'Pro',
    mailboxCount: 9,
    teamCount: 2,
    avgWarmth: 82,
    status: 'healthy',
    monthlyMrrUsd: 460,
    createdAgo: '4 mo ago',
    lastActiveAgo: '7m ago',
  },
  {
    id: 'sc-vela',
    name: 'Vela & Co',
    logoChar: 'VC',
    ownerEmail: 'priya@velaco.com',
    plan: 'Pro',
    mailboxCount: 11,
    teamCount: 2,
    avgWarmth: 80,
    status: 'healthy',
    monthlyMrrUsd: 540,
    createdAgo: '8 mo ago',
    lastActiveAgo: '2m ago',
  },
  {
    id: 'sc-pinwheel',
    name: 'Pinwheel',
    logoChar: 'PW',
    ownerEmail: 'lee@pinwheel.io',
    plan: 'Starter',
    mailboxCount: 3,
    teamCount: 1,
    avgWarmth: 78,
    status: 'healthy',
    monthlyMrrUsd: 180,
    createdAgo: '2 mo ago',
    lastActiveAgo: '11m ago',
  },
  {
    id: 'sc-cascade',
    name: 'Cascade Studio',
    logoChar: 'CS',
    ownerEmail: 'morgan@cascadestudio.co',
    plan: 'Pro',
    mailboxCount: 6,
    teamCount: 2,
    avgWarmth: 62,
    status: 'warming',
    monthlyMrrUsd: 320,
    createdAgo: '3 wk ago',
    lastActiveAgo: '23m ago',
  },
  {
    id: 'sc-meridian',
    name: 'Meridian',
    logoChar: 'MD',
    ownerEmail: 'finn@meridianlabs.io',
    plan: 'Starter',
    mailboxCount: 5,
    teamCount: 1,
    avgWarmth: 51,
    status: 'warming',
    monthlyMrrUsd: 200,
    createdAgo: '2 wk ago',
    lastActiveAgo: '38m ago',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    ownerEmail: 'sam@atlasbio.com',
    plan: 'Pro Plus',
    mailboxCount: 8,
    teamCount: 3,
    avgWarmth: 32,
    status: 'at_risk',
    monthlyMrrUsd: 420,
    createdAgo: '5 mo ago',
    lastActiveAgo: '2h ago',
  },
];

const TEAM: AgencyWorkspaceData['team'] = [
  {
    id: 'tm-1',
    name: 'You',
    email: 'you@northwind.agency',
    role: 'owner',
    lastActiveAgo: 'just now',
    subClientsManaged: 8,
  },
  {
    id: 'tm-2',
    name: 'Riya Bhatia',
    email: 'riya@northwind.agency',
    role: 'admin',
    lastActiveAgo: '6m ago',
    subClientsManaged: 4,
  },
  {
    id: 'tm-3',
    name: 'Dan Chen',
    email: 'dan@northwind.agency',
    role: 'admin',
    lastActiveAgo: '12m ago',
    subClientsManaged: 3,
  },
  {
    id: 'tm-4',
    name: 'Mia Carlson',
    email: 'mia@northwind.agency',
    role: 'member',
    lastActiveAgo: '1h ago',
    subClientsManaged: 2,
  },
  {
    id: 'tm-5',
    name: 'Karol Witkowski',
    email: 'karol@northwind.agency',
    role: 'member',
    lastActiveAgo: '3h ago',
    subClientsManaged: 1,
  },
];

const API_KEYS: AgencyWorkspaceData['apiKeys'] = [
  {
    id: 'ak-1',
    label: 'Production',
    masked: 'wp_live_••••••••••••94c2',
    scope: 'admin',
    lastUsedAgo: '4m ago',
  },
  {
    id: 'ak-2',
    label: 'Reporting backfill',
    masked: 'wp_live_••••••••••••2e10',
    scope: 'read',
    lastUsedAgo: '2h ago',
  },
  {
    id: 'ak-3',
    label: 'CI / connector',
    masked: 'wp_live_••••••••••••a781',
    scope: 'write',
    lastUsedAgo: '1d ago',
  },
];

const WEBHOOKS: AgencyWorkspaceData['webhooks'] = [
  {
    id: 'wh-1',
    url: 'https://hooks.northwind.agency/warmup-events',
    events: ['mailbox.warmed', 'mailbox.paused', 'alert.fired'],
    status: 'live',
  },
  {
    id: 'wh-2',
    url: 'https://relay.zapier.com/wp-northwind',
    events: ['daily.rollup'],
    status: 'paused',
  },
];

const AGENCY: AgencyWorkspaceData['agency'] = {
  name: 'Northwind Agency',
  plan: 'Agency',
  ownerEmail: 'you@northwind.agency',
  region: 'us-east-1',
  slug: 'northwind-agency',
};

const FEATURES: AgencyWorkspaceData['features'] = {
  whiteLabel: { enabled: true, brandName: 'Northwind Mail Studio', hasLogo: true },
  customDomain: {
    enabled: true,
    domain: 'mail.northwind.agency',
    status: 'verified',
  },
  dedicatedPool: {
    enabled: true,
    poolName: 'Northwind Reserved Pool',
    memberCount: 184,
  },
};

const MOCK: AgencyWorkspaceData = {
  agency: AGENCY,
  features: FEATURES,
  subClients: SUB_CLIENTS,
  team: TEAM,
  apiKeys: API_KEYS,
  webhooks: WEBHOOKS,
};

// Public skeleton — the "empty workspace" shape. Useful as a fallback before
// real data arrives. Kept named C3-suffixed so the lock pipeline can wire it
// up by symbol name.
export const AGENCY_WORKSPACE_SKELETON_C3: AgencyWorkspaceData = {
  agency: {
    name: 'Your agency',
    plan: 'Agency',
    ownerEmail: '',
    region: '',
    slug: '',
  },
  features: {
    whiteLabel: { enabled: false, brandName: null, hasLogo: false },
    customDomain: { enabled: false, domain: null, status: 'not_set' },
    dedicatedPool: { enabled: false, poolName: null, memberCount: 0 },
  },
  subClients: [],
  team: [],
  apiKeys: [],
  webhooks: [],
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

// HEX twins of the Tailwind tokens — we need raw hex for SVG fills /
// gradients. Keep these in sync with tailwind.config.ts if those tokens
// ever change. (Other constellation files use the same set.)
const HEX = {
  accent: '#3ecf8e', // healthy / green
  accent2: '#FF9670', // info / cyan
  accent3: '#ff6b4a', // at-risk / red
  accent4: '#ffd54f', // warming / yellow
  surface2: '#1a1a26',
  border: '#2a2a3a',
  bg: '#0d0d14',
  text: '#e6e6f0',
  textDim: '#9b9bb0',
} as const;

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
  inactive: HEX.textDim,
};

const STATUS_TEXT: Record<SubClientStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
  inactive: 'text-text-dim',
};

const STATUS_BG: Record<SubClientStatus, string> = {
  healthy: 'bg-accent/10',
  warming: 'bg-accent4/10',
  at_risk: 'bg-accent3/10',
  inactive: 'bg-surface-2',
};

const STATUS_BORDER: Record<SubClientStatus, string> = {
  healthy: 'border-accent/30',
  warming: 'border-accent4/30',
  at_risk: 'border-accent3/30',
  inactive: 'border-border-muted',
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
  inactive: 'Inactive',
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_ICON: Record<TeamRole, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  member: Users,
};

const ROLE_TEXT: Record<TeamRole, string> = {
  owner: 'text-accent4',
  admin: 'text-accent2',
  member: 'text-text-dim',
};

const ROLE_BG: Record<TeamRole, string> = {
  owner: 'bg-accent4/10 border-accent4/30',
  admin: 'bg-accent2/10 border-accent2/30',
  member: 'bg-surface-2 border-border-muted',
};

const SCOPE_TEXT: Record<ApiKeyScope, string> = {
  read: 'text-text-dim',
  write: 'text-accent2',
  admin: 'text-accent4',
};

const SCOPE_BG: Record<ApiKeyScope, string> = {
  read: 'bg-surface-2 border-border-muted',
  write: 'bg-accent2/10 border-accent2/30',
  admin: 'bg-accent4/10 border-accent4/30',
};

const DOMAIN_TEXT: Record<DomainStatus, string> = {
  verified: 'text-accent',
  pending: 'text-accent4',
  failed: 'text-accent3',
  not_set: 'text-text-dim',
};

const DOMAIN_BG: Record<DomainStatus, string> = {
  verified: 'bg-accent/10 border-accent/30',
  pending: 'bg-accent4/10 border-accent4/30',
  failed: 'bg-accent3/10 border-accent3/30',
  not_set: 'bg-surface-2 border-border-muted',
};

const DOMAIN_LABEL: Record<DomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  failed: 'Failed',
  not_set: 'Not set',
};

// SVG coordinate system the stage scales into. Same conventions as the
// dashboard C-variants — VB=1000, origin at centre.
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
// First-ring radius (sub-clients around agency core).
const SUB_ORBIT = 230;
// Mini-orbit radius (mailbox dots around their sub-client).
const MAILBOX_ORBIT = 52;
const CORE_R = 64;
const SUB_NODE_R_BASE = 24;
const SUB_NODE_R_MAX = 36;
const MAILBOX_R = 6.2;
// At most 6 dots visible per sub-client — 6th slot becomes "+N more" when
// the actual mailbox count exceeds 6.
const MAX_MBX_DOTS = 6;

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

interface SubPos {
  sub: AgencyWorkspaceData['subClients'][number];
  /** Centre coordinate inside the VB-square viewBox. */
  x: number;
  y: number;
  /** Node radius — scales with mailboxCount within [BASE..MAX]. */
  r: number;
  /** Outward unit vector from core — used to orient the mailbox mini-orbit. */
  ux: number;
  uy: number;
}

interface MailboxDot {
  /** Stable id "subId:n" — used as React key + selection token. */
  id: string;
  /** Synthesised display label since the data shape has only a count. */
  label: string;
  parent: SubPos;
  x: number;
  y: number;
  /** True for the +N-overflow pill that replaces the 6th slot. */
  overflow: boolean;
  /** When overflow=true, the count it represents. */
  extra?: number;
  /** Warmth synthesised for the inspector view. */
  warmth?: number;
  lastActiveAgo?: string;
}

/** Place sub-client nodes evenly around the first ring. Volume → node size. */
function placeSubClients(
  subs: AgencyWorkspaceData['subClients'],
): SubPos[] {
  const n = subs.length;
  if (n === 0) return [];
  const maxMbx = Math.max(...subs.map((c) => c.mailboxCount), 1);
  // Start at -90° so the first sub-client sits straight up — gives a tidy
  // composition no matter how many sub-clients there are.
  const startDeg = -90;
  return subs.map((sub, i) => {
    const ang = deg2rad(startDeg + (360 / n) * i);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const vol = sub.mailboxCount / maxMbx;
    return {
      sub,
      x: CX + SUB_ORBIT * ux,
      y: CY + SUB_ORBIT * uy,
      r: SUB_NODE_R_BASE + vol * (SUB_NODE_R_MAX - SUB_NODE_R_BASE),
      ux,
      uy,
    };
  });
}

/**
 * For each sub-client, lay out `min(mailboxCount, MAX_MBX_DOTS)` mailbox
 * dots on a small ring at MAILBOX_ORBIT radius around the sub-client. If
 * `mailboxCount > MAX_MBX_DOTS`, the last slot becomes a "+N more" pill.
 * Mini-orbit angular range is centred on the OUTWARD direction so the dots
 * fan away from the agency core rather than overlap the spoke back to it.
 */
function buildMailboxDots(positions: SubPos[]): MailboxDot[] {
  const dots: MailboxDot[] = [];
  for (const p of positions) {
    const count = p.sub.mailboxCount;
    if (count <= 0) continue;
    const visible = Math.min(count, MAX_MBX_DOTS);
    const overflow = count > MAX_MBX_DOTS;
    // The outward angle from the agency core to this sub-client.
    const outwardDeg = (Math.atan2(p.uy, p.ux) * 180) / Math.PI;
    // Spread the dots over an arc centred on outward. With 6 dots we want
    // them to nearly ring the node (~280°) without colliding with the
    // inward spoke.
    const arcSpan =
      visible === 1 ? 0 : visible === 2 ? 110 : Math.min(290, 120 + visible * 28);
    const stepDeg = visible > 1 ? arcSpan / (visible - 1) : 0;
    const startDeg = outwardDeg - arcSpan / 2;
    for (let i = 0; i < visible; i++) {
      const ang = deg2rad(startDeg + stepDeg * i);
      const x = p.x + MAILBOX_ORBIT * Math.cos(ang);
      const y = p.y + MAILBOX_ORBIT * Math.sin(ang);
      const isOverflowSlot = overflow && i === visible - 1;
      // Synthesised mailbox label — we DON'T have real mailbox names in the
      // shared data shape, so we invent stable display strings using the
      // sub-client's slug and a 1-indexed counter. Good enough for the
      // detail card while the lock pipeline is mocked.
      const slug = p.sub.id.replace(/^sc-/, '');
      const labels = [
        `founder@${slug}.io`,
        `sales@${slug}.io`,
        `support@${slug}.co`,
        `hello@${slug}.io`,
        `team@${slug}.co`,
        `press@${slug}.io`,
      ];
      const label = isOverflowSlot
        ? `+${count - (MAX_MBX_DOTS - 1)} more`
        : labels[i] ?? `mailbox-${i + 1}@${slug}.io`;
      // Warmth synth: cluster around the sub-client average with a small
      // deterministic per-index jitter (sin keeps it stable across renders).
      const warmth = isOverflowSlot
        ? undefined
        : Math.max(
            10,
            Math.min(
              99,
              Math.round(p.sub.avgWarmth + Math.sin(i * 1.7 + p.sub.mailboxCount) * 5),
            ),
          );
      const lastAgos = ['2m ago', '6m ago', '12m ago', '24m ago', '41m ago', '1h ago'];
      const lastActiveAgo = isOverflowSlot ? undefined : lastAgos[i] ?? '1h ago';
      dots.push({
        id: `${p.sub.id}:${i}`,
        label,
        parent: p,
        x,
        y,
        overflow: isOverflowSlot,
        ...(isOverflowSlot
          ? { extra: count - (MAX_MBX_DOTS - 1) }
          : { warmth, lastActiveAgo }),
      });
    }
  }
  return dots;
}

// ---------------------------------------------------------------------------
// Selection model. The right inspector reflects ONE of three modes:
//   - kind: 'none' → default overview ("8 sub-clients · 96 mailboxes …")
//   - kind: 'sub'  → a sub-client card + LIST of its mailboxes
//   - kind: 'mbx'  → a single mailbox detail (email / warmth / last active)
// ---------------------------------------------------------------------------

type Selection =
  | { kind: 'none' }
  | { kind: 'sub'; subId: string }
  | { kind: 'mbx'; dotId: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksC3Network({
  data,
}: { data?: AgencyWorkspaceData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const positions = useMemo(() => placeSubClients(d.subClients), [d.subClients]);
  const mailboxDots = useMemo(() => buildMailboxDots(positions), [positions]);
  const [sel, setSel] = useState<Selection>({ kind: 'none' });
  const [hoverSubId, setHoverSubId] = useState<string | null>(null);
  const [hoverDotId, setHoverDotId] = useState<string | null>(null);

  const totalMailboxes = useMemo(
    () => d.subClients.reduce((s, c) => s + c.mailboxCount, 0),
    [d.subClients],
  );
  const totalMrr = useMemo(
    () => d.subClients.reduce((s, c) => s + c.monthlyMrrUsd, 0),
    [d.subClients],
  );
  const avgWarmth = useMemo(() => {
    const totalMbx = totalMailboxes;
    if (totalMbx === 0) return 0;
    return Math.round(
      d.subClients.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) /
        totalMbx,
    );
  }, [d.subClients, totalMailboxes]);

  const activeSub = useMemo(() => {
    if (sel.kind !== 'sub') return null;
    return positions.find((p) => p.sub.id === sel.subId) ?? null;
  }, [sel, positions]);
  const activeDot = useMemo(() => {
    if (sel.kind !== 'mbx') return null;
    return mailboxDots.find((m) => m.id === sel.dotId) ?? null;
  }, [sel, mailboxDots]);

  // The sub-client whose mini-orbit should be visually emphasised — the one
  // selected, or (when no selection) the one being hovered.
  const focusedSubId =
    sel.kind === 'sub'
      ? sel.subId
      : sel.kind === 'mbx'
        ? activeDot?.parent.sub.id ?? null
        : hoverSubId;

  const handleSelectSub = (id: string) => {
    setSel((prev) =>
      prev.kind === 'sub' && prev.subId === id ? { kind: 'none' } : { kind: 'sub', subId: id },
    );
  };
  const handleSelectDot = (id: string) => {
    setSel((prev) =>
      prev.kind === 'mbx' && prev.dotId === id ? { kind: 'none' } : { kind: 'mbx', dotId: id },
    );
  };
  const clearSelection = () => setSel({ kind: 'none' });

  return (
    <div className="space-y-5">
      {/* Page header — agency identity + summary stat chips */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
              <Network className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {d.agency.name}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 text-xs font-medium text-accent2">
              <Sparkles className="h-3 w-3" />
              {d.agency.plan}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5 text-faint" />
              {d.agency.ownerEmail || '—'}
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1">
              <Globe2 className="h-3.5 w-3.5 text-faint" />
              {d.agency.region || '—'}
            </span>
            <span className="text-text-faint">·</span>
            <span className="font-mono text-xs text-text-faint">/{d.agency.slug || '—'}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderStat
            icon={Building2}
            label="Sub-clients"
            value={String(d.subClients.length)}
            tone="default"
          />
          <HeaderStat
            icon={Mailbox}
            label="Mailboxes"
            value={String(totalMailboxes)}
            tone="default"
          />
          <HeaderStat
            icon={Flame}
            label="Avg warmth"
            value={String(avgWarmth)}
            tone="accent"
          />
          <HeaderStat
            icon={Zap}
            label="MRR"
            value={formatMoney(totalMrr)}
            tone="info"
          />
        </div>
      </motion.header>

      {/* The two-level nested constellation + right inspector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <NetworkStage
            data={d}
            positions={positions}
            mailboxDots={mailboxDots}
            selection={sel}
            focusedSubId={focusedSubId}
            hoverSubId={hoverSubId}
            hoverDotId={hoverDotId}
            totalMailboxes={totalMailboxes}
            onSelectSub={handleSelectSub}
            onSelectDot={handleSelectDot}
            onHoverSub={setHoverSubId}
            onHoverDot={setHoverDotId}
          />
          <StageLegend />
          <NestingAnnotation
            subCount={d.subClients.length}
            mailboxCount={totalMailboxes}
          />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            data={d}
            selection={sel}
            activeSub={activeSub}
            activeDot={activeDot}
            allDots={mailboxDots}
            totalMailboxes={totalMailboxes}
            avgWarmth={avgWarmth}
            onSelectSub={handleSelectSub}
            onSelectDot={handleSelectDot}
            onClose={clearSelection}
          />
        </div>
      </motion.div>

      {/* Agency-only features strip — branding, custom domain, dedicated peer pool */}
      <FeatureStrip features={d.features} />

      {/* Team / API keys / Webhooks compact tiles */}
      <IntegrationStrip
        team={d.team}
        apiKeys={d.apiKeys}
        webhooks={d.webhooks}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header stat chip — small pill at the top right of the page.
// ---------------------------------------------------------------------------

function HeaderStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'accent' | 'info' | 'default';
}) {
  const valueClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'info'
        ? 'text-accent2'
        : 'text-text';
  const iconClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'info'
        ? 'text-accent2'
        : 'text-text-dim';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs backdrop-blur-xl">
      <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
      <span className="text-text-dim">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The nested constellation stage (fixed-height SVG scene).
// ---------------------------------------------------------------------------

function NetworkStage({
  data,
  positions,
  mailboxDots,
  selection,
  focusedSubId,
  hoverSubId,
  hoverDotId,
  totalMailboxes,
  onSelectSub,
  onSelectDot,
  onHoverSub,
  onHoverDot,
}: {
  data: AgencyWorkspaceData;
  positions: SubPos[];
  mailboxDots: MailboxDot[];
  selection: Selection;
  focusedSubId: string | null;
  hoverSubId: string | null;
  hoverDotId: string | null;
  totalMailboxes: number;
  onSelectSub: (id: string) => void;
  onSelectDot: (id: string) => void;
  onHoverSub: (id: string | null) => void;
  onHoverDot: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[720px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent2}1f` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Nested network constellation: agency core, sub-client ring, mailbox mini-orbits"
      >
        <defs>
          <radialGradient id="agwks-c3-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.92} />
            <stop offset="55%" stopColor={HEX.accent2} stopOpacity={0.32} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
          {(['healthy', 'warming', 'at_risk', 'inactive'] as const).map((s) => (
            <radialGradient
              key={`agwks-c3-glow-${s}`}
              id={`agwks-c3-glow-${s}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={STATUS_HEX[s]} stopOpacity={0.45} />
              <stop offset="100%" stopColor={STATUS_HEX[s]} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Guide rings: dashed concentric circles emphasise the orbital depth. */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={SUB_ORBIT}
          fill="none"
          stroke={HEX.border}
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="2 8"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, delay: 0.1, ease: 'easeOut' }}
        />
        <circle
          cx={CX}
          cy={CY}
          r={CORE_R + 18}
          fill="none"
          stroke={HEX.border}
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="2 6"
        />

        {/* Radial spokes: agency core → each sub-client (accent2 dashed) */}
        {positions.map((p, i) => {
          const isFocused = focusedSubId === p.sub.id;
          const isDimmed = focusedSubId !== null && !isFocused;
          return (
            <motion.line
              key={`spoke-${p.sub.id}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke={HEX.accent2}
              strokeOpacity={isDimmed ? 0.1 : isFocused ? 0.85 : 0.42}
              strokeWidth={isFocused ? 2 : 1.2}
              strokeLinecap="round"
              strokeDasharray="6 6"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                duration: 0.7,
                delay: 0.25 + i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          );
        })}

        {/* Mini-orbit guide rings around each sub-client (faint dashed circles
            making the nesting structure visible at a glance) */}
        {positions.map((p) => {
          const isFocused = focusedSubId === p.sub.id;
          return (
            <motion.circle
              key={`mini-orbit-${p.sub.id}`}
              cx={p.x}
              cy={p.y}
              r={MAILBOX_ORBIT}
              fill="none"
              stroke={STATUS_HEX[p.sub.status]}
              strokeOpacity={isFocused ? 0.45 : 0.22}
              strokeWidth={1}
              strokeDasharray="2 5"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.85, ease: 'easeOut' }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            />
          );
        })}

        {/* Solid short spokes: sub-client → each of its mailbox dots. Inherit
            parent status colour at lighter alpha; an overflow slot uses a
            faint border-muted stroke so the +N pill reads as meta. */}
        {mailboxDots.map((dot) => {
          const parentColor = STATUS_HEX[dot.parent.sub.status];
          const isFocused = focusedSubId === dot.parent.sub.id;
          const isDotFocused =
            (selection.kind === 'mbx' && selection.dotId === dot.id) ||
            hoverDotId === dot.id;
          const baseAlpha = dot.overflow ? 0.18 : 0.5;
          const alpha = isDotFocused ? 0.95 : isFocused ? 0.72 : baseAlpha;
          return (
            <motion.line
              key={`m-spoke-${dot.id}`}
              x1={dot.parent.x}
              y1={dot.parent.y}
              x2={dot.x}
              y2={dot.y}
              stroke={dot.overflow ? HEX.textDim : parentColor}
              strokeOpacity={alpha}
              strokeWidth={isDotFocused ? 1.6 : 1.1}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.45, delay: 1.0, ease: 'easeOut' }}
            />
          );
        })}

        {/* Mailbox dots (drawn BEFORE sub-clients so the sub-client circles
            occlude any dot that lands inside the parent's hit area). */}
        {mailboxDots.map((dot, i) => (
          <MailboxNodeGlyph
            key={dot.id}
            dot={dot}
            index={i}
            selected={selection.kind === 'mbx' && selection.dotId === dot.id}
            hovered={hoverDotId === dot.id}
            parentFocused={focusedSubId === dot.parent.sub.id}
            onSelect={() => onSelectDot(dot.id)}
            onHover={onHoverDot}
          />
        ))}

        {/* Sub-client nodes — drawn after dots so they sit ON TOP visually */}
        {positions.map((p, i) => (
          <SubClientNodeGlyph
            key={p.sub.id}
            pos={p}
            index={i}
            selected={selection.kind === 'sub' && selection.subId === p.sub.id}
            hovered={hoverSubId === p.sub.id}
            focused={focusedSubId === p.sub.id}
            anyFocused={focusedSubId !== null}
            onSelect={() => onSelectSub(p.sub.id)}
            onHover={onHoverSub}
          />
        ))}

        {/* The agency core — drawn LAST so it overlaps spokes at the centre */}
        <AgencyCoreGlyph
          name={data.agency.name}
          subCount={data.subClients.length}
          mailboxCount={totalMailboxes}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-client node glyph (first-ring orbit, click target)
// ---------------------------------------------------------------------------

function SubClientNodeGlyph({
  pos,
  index,
  selected,
  hovered,
  focused,
  anyFocused,
  onSelect,
  onHover,
}: {
  pos: SubPos;
  index: number;
  selected: boolean;
  hovered: boolean;
  focused: boolean;
  anyFocused: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, r } = pos;
  const color = STATUS_HEX[sub.status];
  const isAtRisk = sub.status === 'at_risk';
  const lifted = selected || hovered;
  const faded = anyFocused && !focused;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: faded ? 0.34 : 1, scale: 1 }}
      transition={{
        opacity: { duration: 0.32 },
        scale: {
          duration: 0.52,
          delay: 0.5 + index * 0.06,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, ${STATUS_LABEL[sub.status]}, ${sub.mailboxCount} mailboxes, warmth ${sub.avgWarmth}`}
    >
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -2.5 : 2.5, 0] }}
        transition={{
          duration: 5.5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* Pulse halo on at-risk nodes — defining attention gesture */}
        {isAtRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* Background glow disc */}
        <circle
          cx={x}
          cy={y}
          r={r * 2}
          fill={`url(#agwks-c3-glow-${sub.status})`}
          opacity={lifted ? 1 : 0.6}
        />
        {/* Lifted lift-ring on hover/select */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 7}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
        {/* Inner soft fill */}
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill={color}
          fillOpacity={lifted ? 0.24 : 0.14}
        />
        {/* The node proper */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.4 : 1.6}
        />
        {/* Logo char */}
        <text
          x={x}
          y={y + r * 0.18}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.7,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {sub.logoChar}
        </text>
        {/* Name + meta chip beneath (foreignObject so we can use tokens) */}
        <foreignObject
          x={x - 90}
          y={y + r + 12}
          width={180}
          height={42}
          style={{ overflow: 'visible' }}
        >
          <div className="flex flex-col items-center gap-1">
            <span
              className="rounded-md bg-[rgba(13,13,20,0.78)] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-text backdrop-blur"
              style={{ border: `1px solid ${color}33` }}
            >
              {sub.name}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full border bg-[rgba(13,13,20,0.7)] px-1.5 py-0.5 text-[9px] font-medium leading-none backdrop-blur"
              style={{ borderColor: `${color}55`, color }}
            >
              <span className="tabular-nums">{sub.avgWarmth}</span>
              <span className="opacity-60">·</span>
              <span className="tabular-nums">{sub.mailboxCount} mbx</span>
            </span>
          </div>
        </foreignObject>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Mailbox node glyph — second-level orbital dot (or +N overflow pill)
// ---------------------------------------------------------------------------

function MailboxNodeGlyph({
  dot,
  index,
  selected,
  hovered,
  parentFocused,
  onSelect,
  onHover,
}: {
  dot: MailboxDot;
  index: number;
  selected: boolean;
  hovered: boolean;
  parentFocused: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const parentColor = STATUS_HEX[dot.parent.sub.status];
  const isLifted = selected || hovered;

  if (dot.overflow) {
    // The "+N more" pill in the 6th slot. Draws as a small foreignObject so
    // we can use Tailwind tokens for the pill chrome, rather than fighting
    // with raw SVG <text>.
    const pillW = 46;
    const pillH = 18;
    return (
      <motion.g
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: parentFocused || hovered ? 1 : 0.7, scale: 1 }}
        transition={{
          duration: 0.4,
          delay: 1.05 + index * 0.02,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ cursor: 'pointer' }}
        onClick={onSelect}
        onMouseEnter={() => onHover(dot.id)}
        onMouseLeave={() => onHover(null)}
        tabIndex={0}
        role="button"
        aria-label={`${dot.extra ?? 0} more mailboxes for ${dot.parent.sub.name}`}
      >
        <foreignObject
          x={dot.x - pillW / 2}
          y={dot.y - pillH / 2}
          width={pillW}
          height={pillH}
          style={{ overflow: 'visible' }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full border bg-[rgba(13,13,20,0.85)] text-[9px] font-semibold tabular-nums leading-none text-text-dim backdrop-blur"
            style={{ borderColor: HEX.border }}
          >
            +{dot.extra} more
          </div>
        </foreignObject>
      </motion.g>
    );
  }

  // Real mailbox dot — small filled circle, lifts/highlights on hover.
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: parentFocused ? 1 : isLifted ? 1 : 0.78,
        scale: 1,
      }}
      transition={{
        opacity: { duration: 0.28 },
        scale: {
          duration: 0.42,
          delay: 1.05 + index * 0.02,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(dot.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(dot.id)}
      onBlur={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Mailbox ${dot.label}, parent ${dot.parent.sub.name}`}
    >
      {isLifted && (
        <circle
          cx={dot.x}
          cy={dot.y}
          r={MAILBOX_R + 5}
          fill="none"
          stroke={parentColor}
          strokeOpacity={0.55}
          strokeWidth={1.2}
        />
      )}
      <circle
        cx={dot.x}
        cy={dot.y}
        r={MAILBOX_R + 2}
        fill={parentColor}
        fillOpacity={0.18}
      />
      <circle
        cx={dot.x}
        cy={dot.y}
        r={MAILBOX_R}
        fill={isLifted ? parentColor : HEX.surface2}
        stroke={parentColor}
        strokeWidth={1.4}
      />
      {/* On hover, surface the email address as a chip — drives the
          "I can see what I'm clicking" feedback */}
      {isLifted && (
        <foreignObject
          x={dot.x - 80}
          y={dot.y - 26}
          width={160}
          height={18}
          style={{ overflow: 'visible' }}
        >
          <div className="flex justify-center">
            <span
              className="rounded-md bg-[rgba(13,13,20,0.88)] px-1.5 py-0.5 text-[9px] font-medium leading-none text-text backdrop-blur"
              style={{ border: `1px solid ${parentColor}55` }}
            >
              {dot.label}
            </span>
          </div>
        </foreignObject>
      )}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// The AGENCY core glyph at the centre of the stage.
// ---------------------------------------------------------------------------

function AgencyCoreGlyph({
  name,
  subCount,
  mailboxCount,
}: {
  name: string;
  subCount: number;
  mailboxCount: number;
}) {
  return (
    <g>
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 3.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.85} fill="url(#agwks-c3-core)" />
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeWidth={2.5}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle
        cx={CX}
        cy={CY}
        r={CORE_R - 9}
        fill="none"
        stroke={HEX.accent2}
        strokeOpacity={0.35}
        strokeWidth={1}
        strokeDasharray="3 5"
      />
      <text
        x={CX}
        y={CY - 18}
        textAnchor="middle"
        fill={HEX.textDim}
        style={{ fontSize: 12, letterSpacing: 1.8, fontWeight: 600 }}
      >
        AGENCY
      </text>
      <text
        x={CX}
        y={CY + 4}
        textAnchor="middle"
        fill={HEX.text}
        style={{ fontSize: 16, fontWeight: 600 }}
      >
        {name}
      </text>
      <text
        x={CX}
        y={CY + 26}
        textAnchor="middle"
        fill={HEX.accent2}
        style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.6 }}
      >
        {subCount} clients · {mailboxCount} mbx
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Legend (compact, overlaid bottom-left of the stage)
// ---------------------------------------------------------------------------

function StageLegend() {
  const items: Array<{ status: SubClientStatus; label: string }> = [
    { status: 'healthy', label: 'Healthy' },
    { status: 'warming', label: 'Warming' },
    { status: 'at_risk', label: 'At risk' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 1.15 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
        <Layers className="h-3 w-3 text-accent2" />
        Nesting legend
      </span>
      {items.map((it) => (
        <span
          key={it.status}
          className="flex items-center gap-2 text-xs text-text"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_HEX[it.status] }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Circle className="h-3 w-3 text-accent2" />
        Sub-client (ring)
      </span>
      <span className="flex items-center gap-2 text-[11px] text-text-dim">
        <CircleDashed className="h-3 w-3 text-accent2" />
        Mailbox (mini-orbit)
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Top-right nesting annotation — surfaces the structural depth as raw numbers.
// ---------------------------------------------------------------------------

function NestingAnnotation({
  subCount,
  mailboxCount,
}: {
  subCount: number;
  mailboxCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 1.2 }}
      className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 font-mono text-[10px] uppercase tracking-wider backdrop-blur-xl"
    >
      <span className="text-text-faint">Depth</span>
      <span className="flex items-center gap-2 text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-accent2" />
        <span className="text-text-dim">L0</span>
        <span>AGENCY</span>
      </span>
      <span className="flex items-center gap-2 text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-text-dim">L1</span>
        <span className="tabular-nums">{subCount} clients</span>
      </span>
      <span className="flex items-center gap-2 text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-accent4" />
        <span className="text-text-dim">L2</span>
        <span className="tabular-nums">{mailboxCount} mbx · {subCount} orbits</span>
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector — three modes (overview / sub-client / mailbox)
// ---------------------------------------------------------------------------

function InspectorPanel({
  data,
  selection,
  activeSub,
  activeDot,
  allDots,
  totalMailboxes,
  avgWarmth,
  onSelectSub,
  onSelectDot,
  onClose,
}: {
  data: AgencyWorkspaceData;
  selection: Selection;
  activeSub: SubPos | null;
  activeDot: MailboxDot | null;
  allDots: MailboxDot[];
  totalMailboxes: number;
  avgWarmth: number;
  onSelectSub: (id: string) => void;
  onSelectDot: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative h-[720px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {selection.kind === 'mbx' && activeDot ? (
          <motion.div
            key={`mbx-${activeDot.id}`}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <MailboxDetail
              dot={activeDot}
              onBackToParent={() => onSelectSub(activeDot.parent.sub.id)}
              onClose={onClose}
            />
          </motion.div>
        ) : selection.kind === 'sub' && activeSub ? (
          <motion.div
            key={`sub-${activeSub.sub.id}`}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <SubClientDetail
              pos={activeSub}
              dots={allDots.filter(
                (m) => m.parent.sub.id === activeSub.sub.id,
              )}
              onSelectDot={onSelectDot}
              onClose={onClose}
            />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <NestingOverview
              data={data}
              totalMailboxes={totalMailboxes}
              avgWarmth={avgWarmth}
              onSelectSub={onSelectSub}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector mode 1: nesting overview (default, no selection)
// ---------------------------------------------------------------------------

function NestingOverview({
  data,
  totalMailboxes,
  avgWarmth,
  onSelectSub,
}: {
  data: AgencyWorkspaceData;
  totalMailboxes: number;
  avgWarmth: number;
  onSelectSub: (id: string) => void;
}) {
  // Count by status — feeds the donut summary.
  const counts = useMemo(() => {
    const acc: Record<SubClientStatus, number> = {
      healthy: 0,
      warming: 0,
      at_risk: 0,
      inactive: 0,
    };
    for (const c of data.subClients) acc[c.status] += 1;
    return acc;
  }, [data.subClients]);
  const total = data.subClients.length;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Orbit className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">Nesting overview</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          {total} sub-clients · {totalMailboxes} mailboxes across {total} mini-orbits
        </p>
      </header>

      <div className="space-y-4 p-5">
        {/* Headline metrics */}
        <div className="grid grid-cols-2 gap-3">
          <OverviewMetric
            icon={Building2}
            label="Sub-clients"
            value={String(total)}
            tone="info"
          />
          <OverviewMetric
            icon={Mailbox}
            label="Mailboxes"
            value={String(totalMailboxes)}
            tone="info"
          />
          <OverviewMetric
            icon={Flame}
            label="Avg warmth"
            value={String(avgWarmth)}
            tone="accent"
          />
          <OverviewMetric
            icon={ShieldAlert}
            label="At risk"
            value={String(counts.at_risk)}
            tone={counts.at_risk > 0 ? 'danger' : 'muted'}
          />
        </div>

        {/* Status breakdown — a thin segmented bar + legend */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-text-dim">
              Status breakdown
            </span>
            <span className="font-mono text-[10px] tabular-nums text-text-faint">
              {total} total
            </span>
          </div>
          <SegBar
            segments={[
              { value: counts.healthy, color: HEX.accent },
              { value: counts.warming, color: HEX.accent4 },
              { value: counts.at_risk, color: HEX.accent3 },
              { value: counts.inactive, color: HEX.textDim },
            ]}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <LegendRow color={HEX.accent} label="Healthy" count={counts.healthy} />
            <LegendRow color={HEX.accent4} label="Warming" count={counts.warming} />
            <LegendRow color={HEX.accent3} label="At risk" count={counts.at_risk} />
            <LegendRow color={HEX.textDim} label="Inactive" count={counts.inactive} />
          </div>
        </div>

        {/* Sub-client mini-list — clickable rows that fire the same select */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-accent2" />
            <span className="text-xs uppercase tracking-wider text-text-dim">
              Sub-clients
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-text-faint">
              {total}
            </span>
          </div>
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-border-muted bg-surface px-3 py-4 text-center text-xs text-text-dim">
              No sub-clients yet — invite your first client to get started.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.subClients.map((c) => {
                const color = STATUS_HEX[c.status];
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSub(c.id)}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-border-muted bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-accent2/40 hover:bg-surface-2/60"
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold"
                        style={{
                          background: `${color}26`,
                          color,
                          border: `1px solid ${color}55`,
                        }}
                      >
                        {c.logoChar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-text">
                          {c.name}
                        </p>
                        <p className="truncate font-mono text-[10px] text-text-faint">
                          {c.mailboxCount} mbx · {c.plan}
                        </p>
                      </div>
                      <span
                        className="font-mono text-xs font-semibold tabular-nums"
                        style={{ color }}
                      >
                        {c.avgWarmth}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            How nesting reads
          </span>
        </div>
        <p className="text-xs leading-relaxed text-text-dim">
          Each sub-client orbits the agency core, and its OWN mailboxes orbit
          it — a galaxy of mini-galaxies. Click a sub-client node to see its
          mailbox list, or click any mailbox dot to drill into the mailbox.
        </p>
      </div>
    </div>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'accent' | 'info' | 'muted' | 'danger';
}) {
  const valueClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'info'
        ? 'text-accent2'
        : tone === 'danger'
          ? 'text-accent3'
          : 'text-text-dim';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-dim">
        <Icon className={`h-3 w-3 ${valueClass}`} />
        <span>{label}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function LegendRow({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <span className="flex items-center gap-2 text-xs text-text">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-text-dim">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-text-faint">
        {count}
      </span>
    </span>
  );
}

function SegBar({
  segments,
}: {
  segments: Array<{ value: number; color: string }>;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
      {segments.map((seg, i) => {
        if (seg.value === 0) return null;
        const pct = (seg.value / total) * 100;
        return (
          <motion.span
            key={i}
            className="h-full"
            style={{ background: seg.color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.75, delay: 0.18 + i * 0.06 }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector mode 2: a SUB-CLIENT is selected (card + mailbox list)
// ---------------------------------------------------------------------------

function SubClientDetail({
  pos,
  dots,
  onSelectDot,
  onClose,
}: {
  pos: SubPos;
  dots: MailboxDot[];
  onSelectDot: (id: string) => void;
  onClose: () => void;
}) {
  const { sub } = pos;
  const color = STATUS_HEX[sub.status];
  // The mini-orbit list excludes the +N overflow slot since it isn't a real
  // mailbox; the count badge already communicates the unseen overflow.
  const realDots = dots.filter((m) => !m.overflow);
  const overflowDot = dots.find((m) => m.overflow);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-bold"
            style={{
              background: `${color}26`,
              color,
              border: `1.5px solid ${color}55`,
            }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text">
              {sub.name}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BORDER[sub.status]} ${STATUS_BG[sub.status]} ${STATUS_TEXT[sub.status]}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {STATUS_LABEL[sub.status]}
              </span>
              <span className="font-mono text-[10px] text-text-dim">
                {sub.plan}
              </span>
              <span className="text-xs text-text-faint">·</span>
              <span className="text-xs text-text-dim">{sub.lastActiveAgo}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Warmth headline + bar */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dim">
                Avg warmth
              </p>
              <p
                className="mt-0.5 text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {sub.avgWarmth}
              </p>
            </div>
            <p
              className={`text-xs font-medium ${STATUS_TEXT[sub.status]}`}
            >
              {STATUS_LABEL[sub.status]}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, sub.avgWarmth)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Three small metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <DetailMetric
            icon={Mailbox}
            label="Mailboxes"
            value={String(sub.mailboxCount)}
            color={color}
          />
          <DetailMetric
            icon={Users}
            label="Team"
            value={String(sub.teamCount)}
            color={color}
          />
          <DetailMetric
            icon={Zap}
            label="MRR"
            value={formatMoney(sub.monthlyMrrUsd)}
            color={color}
          />
        </div>

        {/* Owner + signup */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Owner
          </p>
          <p className="mt-1 truncate font-mono text-xs text-text">
            {sub.ownerEmail}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-text-dim">
            Created
          </p>
          <p className="mt-1 text-xs text-text">{sub.createdAgo}</p>
        </div>

        {/* The mailbox list — this is the "see the mini-orbit as a list"
            companion to the visual mini-orbit on the stage */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <Orbit className="h-3.5 w-3.5" style={{ color }} />
            <span className="text-xs uppercase tracking-wider text-text-dim">
              Mailboxes in this mini-orbit
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-text-faint">
              {sub.mailboxCount}
            </span>
          </div>
          {realDots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-muted bg-surface px-3 py-3 text-center text-xs text-text-dim">
              No mailboxes connected for this client yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {realDots.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelectDot(m.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border border-border-muted bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-accent2/40 hover:bg-surface-2/60"
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                      style={{
                        background: `${color}26`,
                        border: `1.5px solid ${color}55`,
                      }}
                      aria-hidden
                    >
                      <Mail className="h-3 w-3" style={{ color }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text">
                      {m.label}
                    </span>
                    {typeof m.warmth === 'number' && (
                      <span
                        className="font-mono text-[11px] font-semibold tabular-nums"
                        style={{ color }}
                      >
                        {m.warmth}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {overflowDot && (
                <li>
                  <span className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-muted bg-surface px-2.5 py-1.5 text-[11px] text-text-dim">
                    <Mail className="h-3 w-3 text-text-faint" />+
                    {overflowDot.extra} more mailboxes not shown
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-dim">
        <Icon className="h-3 w-3" style={{ color }} />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector mode 3: a single MAILBOX dot is selected — show its details
// ---------------------------------------------------------------------------

function MailboxDetail({
  dot,
  onBackToParent,
  onClose,
}: {
  dot: MailboxDot;
  onBackToParent: () => void;
  onClose: () => void;
}) {
  const color = STATUS_HEX[dot.parent.sub.status];
  const warmth = dot.warmth ?? 0;
  // TODO(post-lock): when we have real per-mailbox data, replace synthesised
  // last-active, warmth, and provider with the actual mailbox model.
  const warmthTier =
    warmth >= 75 ? 'High' : warmth >= 50 ? 'Mid' : warmth >= 25 ? 'Low' : 'Cold';

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{
              background: `${color}26`,
              border: `1.5px solid ${color}55`,
            }}
            aria-hidden
          >
            <Mail className="h-5 w-5" style={{ color }} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] font-semibold text-text">
              {dot.label}
            </p>
            <p className="mt-0.5 text-xs text-text-dim">
              child of{' '}
              <button
                type="button"
                onClick={onBackToParent}
                className="font-medium text-accent2 underline-offset-2 hover:underline"
              >
                {dot.parent.sub.name}
              </button>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Warmth headline + bar */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dim">
                Warmth
              </p>
              <p
                className="mt-0.5 text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {warmth}
              </p>
            </div>
            <p className="text-xs font-medium" style={{ color }}>
              {warmthTier}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, warmth)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Last active + provenance (synthesised) */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-dim">
                Last active
              </p>
              <p className="mt-1 text-sm font-semibold text-text">
                {dot.lastActiveAgo ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-dim">
                Parent status
              </p>
              <p
                className="mt-1 text-sm font-semibold"
                style={{ color }}
              >
                {STATUS_LABEL[dot.parent.sub.status]}
              </p>
            </div>
          </div>
        </div>

        {/* Breadcrumb / context — reinforces the nesting message */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-text-dim">
            Path
          </p>
          <ol className="space-y-1.5 text-xs">
            <li className="flex items-center gap-2 text-text">
              <span className="grid h-5 w-5 place-items-center rounded-md border border-accent2/40 bg-accent2/10 text-accent2">
                <Network className="h-3 w-3" />
              </span>
              <span className="text-text-dim">L0</span>
              <span className="font-semibold">Agency</span>
            </li>
            <li className="flex items-center gap-2 text-text">
              <span
                className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-bold"
                style={{
                  background: `${color}26`,
                  color,
                  border: `1px solid ${color}55`,
                }}
              >
                {dot.parent.sub.logoChar}
              </span>
              <span className="text-text-dim">L1</span>
              <span className="font-semibold">{dot.parent.sub.name}</span>
            </li>
            <li className="flex items-center gap-2 text-text">
              <span
                className="grid h-5 w-5 place-items-center rounded-md"
                style={{
                  background: `${color}1a`,
                  border: `1px solid ${color}55`,
                }}
              >
                <Mail className="h-3 w-3" style={{ color }} />
              </span>
              <span className="text-text-dim">L2</span>
              <span className="truncate font-mono text-[11px] font-semibold">
                {dot.label}
              </span>
            </li>
          </ol>
        </div>

        <button
          type="button"
          onClick={onBackToParent}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent2/30 bg-accent2/10 px-3 py-2 text-xs font-semibold text-accent2 transition-colors hover:bg-accent2/15"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open {dot.parent.sub.name}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Feature strip — Agency-only unlocked features (white-label / domain / pool)
// ---------------------------------------------------------------------------

function FeatureStrip({
  features,
}: {
  features: AgencyWorkspaceData['features'];
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.18 }}
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <FeatureCard
        icon={Palette}
        title="White-label branding"
        enabled={features.whiteLabel.enabled}
        primary={features.whiteLabel.brandName ?? '—'}
        secondary={
          features.whiteLabel.hasLogo
            ? 'Custom logo uploaded'
            : 'No custom logo'
        }
        cta={features.whiteLabel.enabled ? 'Manage brand' : 'Enable'}
      />
      <FeatureCard
        icon={Globe2}
        title="Custom domain"
        enabled={features.customDomain.enabled}
        primary={features.customDomain.domain ?? '—'}
        secondaryNode={
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${DOMAIN_BG[features.customDomain.status]} ${DOMAIN_TEXT[features.customDomain.status]}`}
          >
            {features.customDomain.status === 'verified' && (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {features.customDomain.status === 'pending' && (
              <Activity className="h-3 w-3" />
            )}
            {features.customDomain.status === 'failed' && (
              <AlertTriangle className="h-3 w-3" />
            )}
            {features.customDomain.status === 'not_set' && (
              <Circle className="h-3 w-3" />
            )}
            {DOMAIN_LABEL[features.customDomain.status]}
          </span>
        }
        cta={features.customDomain.enabled ? 'Manage DNS' : 'Add domain'}
      />
      <FeatureCard
        icon={Layers}
        title="Dedicated peer pool"
        enabled={features.dedicatedPool.enabled}
        primary={features.dedicatedPool.poolName ?? '—'}
        secondary={
          features.dedicatedPool.enabled
            ? `${features.dedicatedPool.memberCount} reserved peers`
            : 'Using shared default pool'
        }
        cta={features.dedicatedPool.enabled ? 'Manage pool' : 'Request pool'}
      />
    </motion.section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  enabled,
  primary,
  secondary,
  secondaryNode,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  enabled: boolean;
  primary: string;
  secondary?: string;
  secondaryNode?: ReactNode;
  cta: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-surface/60 p-4 backdrop-blur-xl ${
        enabled ? 'border-accent2/30' : 'border-border-muted'
      }`}
    >
      {/* Soft accent gradient strip */}
      {enabled && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-accent2"
        />
      )}
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${
            enabled
              ? 'border-accent2/30 bg-accent2/10 text-accent2'
              : 'border-border-muted bg-surface-2 text-text-dim'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold uppercase tracking-wider text-text-dim">
              {title}
            </p>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                enabled
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text-dim'
              }`}
            >
              {enabled ? (
                <>
                  <Eye className="h-3 w-3" /> On
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3" /> Off
                </>
              )}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-text">
            {primary}
          </p>
          <div className="mt-1.5">
            {secondaryNode ? (
              secondaryNode
            ) : (
              <p className="text-[11px] text-text-dim">{secondary}</p>
            )}
          </div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-accent2 transition-colors hover:text-accent"
          >
            {cta}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom integration strip — team / API keys / webhooks compact tiles.
// ---------------------------------------------------------------------------

function IntegrationStrip({
  team,
  apiKeys,
  webhooks,
}: {
  team: AgencyWorkspaceData['team'];
  apiKeys: AgencyWorkspaceData['apiKeys'];
  webhooks: AgencyWorkspaceData['webhooks'];
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <TeamTile team={team} />
      <ApiKeysTile keys={apiKeys} />
      <WebhooksTile hooks={webhooks} />
    </motion.section>
  );
}

function TeamTile({ team }: { team: AgencyWorkspaceData['team'] }) {
  // Order: owner first, admins next, members last. Within each, stable order
  // (no per-name sort since the mock is already curated).
  const ordered = useMemo(() => {
    const rank: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 };
    return [...team].sort((a, b) => rank[a.role] - rank[b.role]);
  }, [team]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text">
            Agency team
          </p>
          <p className="text-[11px] text-text-dim">{team.length} members</p>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-accent2/40 hover:text-text"
        >
          <Plus className="h-3 w-3" />
          Invite
        </button>
      </div>
      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted bg-surface px-3 py-4 text-center text-xs text-text-dim">
          No team members yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {ordered.slice(0, 5).map((m) => {
            const Icon = ROLE_ICON[m.role];
            return (
              <li
                key={m.id}
                className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5"
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${ROLE_BG[m.role]} ${ROLE_TEXT[m.role]}`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {ROLE_LABEL[m.role]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text">
                    {m.name}
                  </p>
                  <p className="truncate font-mono text-[10px] text-text-faint">
                    {m.email}
                  </p>
                </div>
                <span className="hidden font-mono text-[10px] text-text-dim sm:inline">
                  {m.subClientsManaged} clients
                </span>
              </li>
            );
          })}
          {ordered.length > 5 && (
            <li className="text-center text-[10px] uppercase tracking-wider text-text-faint">
              +{ordered.length - 5} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ApiKeysTile({ keys }: { keys: AgencyWorkspaceData['apiKeys'] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent4/30 bg-accent4/10 text-accent4">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text">
            API keys
          </p>
          <p className="text-[11px] text-text-dim">{keys.length} active</p>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-accent4/40 hover:text-text"
        >
          <Plus className="h-3 w-3" />
          Create
        </button>
      </div>
      {keys.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted bg-surface px-3 py-4 text-center text-xs text-text-dim">
          No API keys yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${SCOPE_BG[k.scope]} ${SCOPE_TEXT[k.scope]}`}
              >
                <Key className="h-2.5 w-2.5" />
                {k.scope}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text">
                  {k.label}
                </p>
                <p className="truncate font-mono text-[10px] text-text-faint">
                  {k.masked}
                </p>
              </div>
              <span
                className="hidden font-mono text-[10px] text-text-dim sm:inline"
                title="Last used"
              >
                {k.lastUsedAgo}
              </span>
              <button
                type="button"
                aria-label="Copy key"
                className="grid h-6 w-6 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface hover:text-text"
              >
                <Copy className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WebhooksTile({ hooks }: { hooks: AgencyWorkspaceData['webhooks'] }) {
  const live = hooks.filter((h) => h.status === 'live').length;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <Webhook className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text">
            Webhooks
          </p>
          <p className="text-[11px] text-text-dim">
            {live} live · {hooks.length} total
          </p>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface px-2 py-1 text-[11px] text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      {hooks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted bg-surface px-3 py-4 text-center text-xs text-text-dim">
          No webhooks configured.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {hooks.map((h) => (
            <li
              key={h.id}
              className="rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                    h.status === 'live'
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-border-muted bg-surface-2 text-text-dim'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      h.status === 'live' ? 'bg-accent' : 'bg-text-faint'
                    }`}
                  />
                  {h.status}
                </span>
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-text">
                  {h.url}
                </p>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {h.events.slice(0, 3).map((ev) => (
                  <span
                    key={ev}
                    className="inline-flex items-center rounded-full border border-border-muted bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-dim"
                  >
                    {ev}
                  </span>
                ))}
                {h.events.length > 3 && (
                  <span className="font-mono text-[9px] text-text-faint">
                    +{h.events.length - 3}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export — convenience so router lazy-import works without an alias.
// ---------------------------------------------------------------------------

export default AgWksC3Network;

// TODO(post-lock): replace synthesised mailbox labels / warmth / lastActive
//   in `buildMailboxDots` with real per-mailbox data when the shared shape
//   gains a `mailboxes: Array<{...}>` field on each sub-client. The +N
//   overflow pill will need a corresponding "real" tail count then.
// TODO(post-lock): wire the four CTAs in FeatureCard / IntegrationStrip
//   (Manage brand / Manage DNS / Manage pool / Invite / Create key / Add
//   webhook) to their respective routes once the workspace router is final.
// TODO(post-lock): consider replacing the 360°/n placement with a
//   weighted layout where high-MRR sub-clients sit closer to the agency
//   core (current placement is purely angular — distance is constant).
// TODO(post-lock): add an inline "edit role" affordance per team-tile row
//   (currently the row is read-only). The cleanest spot is the role pill —
//   click to open a Radix DropdownMenu of role options.
