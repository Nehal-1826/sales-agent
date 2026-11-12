import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  Crown,
  Database,
  Eye,
  Globe2,
  Key,
  Layers,
  Mail,
  Orbit,
  Palette,
  Pause,
  Plus,
  Radio,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Telescope,
  Users,
  Webhook,
  X,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksC2Roster — Agency-tier WORKSPACE surface #2, "Roster Galaxy".
 *
 * The /app/workspace page for Agency-tier accounts. Agency users run a team-of-
 * teams: their own staff (owner + admins + members) on one orbit, their CUSTOMER
 * accounts (sub-clients) on a second, wider orbit. The point of the page is to
 * give the agency owner a single spatial read on who-owns-what, what white-label
 * / domain / pool entitlements are turned on, and which API keys / webhooks
 * power their automations.
 *
 * Stage anatomy:
 *   - CORE DISC: agency name + plan + region. Three feature SATELLITE CHIPS ride
 *     a halo around the core: white-label, custom-domain, dedicated-pool.
 *   - INNER RING (r ~170): the agency's OWN team, role-tinted (owner accent,
 *     admin accent2, member text-dim). Smaller nodes, solid connecting lines.
 *   - OUTER RING (r ~290): SUB-CLIENT accounts, status-tinted (healthy /
 *     warming / at_risk / inactive). Larger nodes, faint dashed lines.
 *   - CROSS-EDGES (hover only): when a team member manages a sub-client (per
 *     their `subClientsManaged` quota), inner→outer chord lines fade in across
 *     the gap. This is the "team-of-teams" twist that sets C2 apart from the
 *     other three workspace variants.
 *   - Three faint dashed GUIDE CIRCLES underline the orbit structure.
 *
 * Inspector panel (right-hand column):
 *   - Default: "Roster overview" — team KPI block + sub-client KPI block +
 *     feature-status strip.
 *   - Click an INNER node → team-member card with assignment list.
 *   - Click an OUTER node → sub-client account card.
 *
 * Bottom rail (inside the orbit canvas, below the rings): API keys + webhooks
 * shown as compact stat tiles — automation surface lives where the eye
 * already is, not buried in a tab.
 *
 * Distinguishing feature from the other 3 candidates: TEAM-of-TEAMS
 * stratification with TWO DIFFERENT ENTITY TYPES on the inner and outer rings.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props. The
 * harness mounts it prop-less; every value comes from the inline MOCK const.
 * Renders only page content; the shell supplies the sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency workspace variants
// ---------------------------------------------------------------------------
// Shape duplicated across all 4 Agency workspace variants — keep in sync.

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
// MOCK content — Northwind Agency on the Agency plan.
// 8 sub-clients (5 healthy, 2 warming, 1 at_risk), MRR $180 – $1480.
// 5 team members (1 owner + 2 admins + 2 members). subClientsManaged
// distributed 1–3 each so cross-edges look reasonable on hover.
// 3 API keys, 2 webhooks (1 live, 1 paused). All 3 Agency features enabled.
// ---------------------------------------------------------------------------

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind',
  },
  features: {
    whiteLabel: { enabled: true, brandName: 'Northwind Mail Lab', hasLogo: true },
    customDomain: {
      enabled: true,
      domain: 'app.northwind.agency',
      status: 'verified',
    },
    dedicatedPool: {
      enabled: true,
      poolName: 'Northwind Pool',
      memberCount: 86,
    },
  },
  subClients: [
    {
      id: 'sc-helix',
      name: 'Helix Analytics',
      logoChar: 'HA',
      ownerEmail: 'ops@helix-analytics.io',
      plan: 'Pro Plus',
      mailboxCount: 22,
      teamCount: 6,
      avgWarmth: 89,
      status: 'healthy',
      monthlyMrrUsd: 1480,
      createdAgo: '14 mo ago',
      lastActiveAgo: '3m ago',
    },
    {
      id: 'sc-nimbus',
      name: 'Nimbus Cloud',
      logoChar: 'NC',
      ownerEmail: 'team@nimbus.cloud',
      plan: 'Pro Plus',
      mailboxCount: 18,
      teamCount: 5,
      avgWarmth: 86,
      status: 'healthy',
      monthlyMrrUsd: 1120,
      createdAgo: '11 mo ago',
      lastActiveAgo: '7m ago',
    },
    {
      id: 'sc-orion',
      name: 'Orion Sales',
      logoChar: 'OS',
      ownerEmail: 'gtm@orion-sales.co',
      plan: 'Pro',
      mailboxCount: 15,
      teamCount: 4,
      avgWarmth: 91,
      status: 'healthy',
      monthlyMrrUsd: 980,
      createdAgo: '8 mo ago',
      lastActiveAgo: '14m ago',
    },
    {
      id: 'sc-vega',
      name: 'Vega Outbound',
      logoChar: 'VO',
      ownerEmail: 'hello@vega-outbound.io',
      plan: 'Pro',
      mailboxCount: 12,
      teamCount: 3,
      avgWarmth: 78,
      status: 'warming',
      monthlyMrrUsd: 740,
      createdAgo: '5 mo ago',
      lastActiveAgo: '21m ago',
    },
    {
      id: 'sc-quasar',
      name: 'Quasar Growth',
      logoChar: 'QG',
      ownerEmail: 'founders@quasar.gg',
      plan: 'Pro',
      mailboxCount: 10,
      teamCount: 3,
      avgWarmth: 82,
      status: 'healthy',
      monthlyMrrUsd: 520,
      createdAgo: '4 mo ago',
      lastActiveAgo: '34m ago',
    },
    {
      id: 'sc-lyra',
      name: 'Lyra Studio',
      logoChar: 'LS',
      ownerEmail: 'mail@lyra.studio',
      plan: 'Starter',
      mailboxCount: 8,
      teamCount: 2,
      avgWarmth: 84,
      status: 'healthy',
      monthlyMrrUsd: 360,
      createdAgo: '3 mo ago',
      lastActiveAgo: '52m ago',
    },
    {
      id: 'sc-atlas',
      name: 'Atlas Bio',
      logoChar: 'AB',
      ownerEmail: 'sales@atlas-bio.com',
      plan: 'Starter',
      mailboxCount: 6,
      teamCount: 2,
      avgWarmth: 54,
      status: 'at_risk',
      monthlyMrrUsd: 240,
      createdAgo: '2 mo ago',
      lastActiveAgo: '1h ago',
    },
    {
      id: 'sc-pixel',
      name: 'Pixel Forge',
      logoChar: 'PF',
      ownerEmail: 'team@pixel-forge.dev',
      plan: 'Starter',
      mailboxCount: 5,
      teamCount: 2,
      avgWarmth: 71,
      status: 'warming',
      monthlyMrrUsd: 180,
      createdAgo: '6 wk ago',
      lastActiveAgo: '2h ago',
    },
  ],
  team: [
    {
      id: 'tm-owner',
      name: 'Yusra Tahir',
      email: 'you@northwind.agency',
      role: 'owner',
      lastActiveAgo: 'now',
      subClientsManaged: 3,
    },
    {
      id: 'tm-admin-a',
      name: 'Mariana Castro',
      email: 'mariana@northwind.agency',
      role: 'admin',
      lastActiveAgo: '5m ago',
      subClientsManaged: 2,
    },
    {
      id: 'tm-admin-b',
      name: 'Jaime Okafor',
      email: 'jaime@northwind.agency',
      role: 'admin',
      lastActiveAgo: '18m ago',
      subClientsManaged: 2,
    },
    {
      id: 'tm-mem-a',
      name: 'Felix Berg',
      email: 'felix@northwind.agency',
      role: 'member',
      lastActiveAgo: '1h ago',
      subClientsManaged: 1,
    },
    {
      id: 'tm-mem-b',
      name: 'Priya Subramanian',
      email: 'priya@northwind.agency',
      role: 'member',
      lastActiveAgo: '2h ago',
      subClientsManaged: 2,
    },
  ],
  apiKeys: [
    {
      id: 'ak-prod',
      label: 'Production · ingestion',
      masked: 'wp_live_••••••••dF42',
      scope: 'write',
      lastUsedAgo: '4m ago',
    },
    {
      id: 'ak-readonly',
      label: 'Reporting · BI dashboards',
      masked: 'wp_live_••••••••8q1A',
      scope: 'read',
      lastUsedAgo: '32m ago',
    },
    {
      id: 'ak-mobile',
      label: 'Mobile app · admin',
      masked: 'wp_live_••••••••XzPp',
      scope: 'admin',
      lastUsedAgo: '6h ago',
    },
  ],
  webhooks: [
    {
      id: 'wh-zapier',
      url: 'https://hooks.zapier.com/hooks/catch/4218/agency-events',
      events: ['mailbox.connected', 'warmth.daily', 'alert.created'],
      status: 'live',
    },
    {
      id: 'wh-slack',
      url: 'https://hooks.slack.com/services/T05••••/B07••••/RcXcr',
      events: ['alert.created'],
      status: 'paused',
    },
  ],
};

// ---------------------------------------------------------------------------
// SKELETON — empty state shape for the live-data adapter to fall back to
// honestly. ALL features disabled, ALL arrays empty.
// ---------------------------------------------------------------------------

export const AGENCY_WORKSPACE_SKELETON_C2: AgencyWorkspaceData = {
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

const HEX = {
  accent: '#26d281', // owner / healthy / live
  accent2: '#FF9670', // galaxy cyan / admin
  accent3: '#ff6b4a', // at_risk / failed
  accent4: '#ffd54f', // warming / pending
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#9aa0b4',
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

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
  inactive: 'Inactive',
};

const ROLE_HEX: Record<TeamRole, string> = {
  owner: HEX.accent,
  admin: HEX.accent2,
  member: HEX.textDim,
};

const ROLE_TEXT: Record<TeamRole, string> = {
  owner: 'text-accent',
  admin: 'text-accent2',
  member: 'text-text-dim',
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_ICON: Record<TeamRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: Users,
};

const SCOPE_HEX: Record<ApiKeyScope, string> = {
  read: HEX.textDim,
  write: HEX.accent2,
  admin: HEX.accent3,
};

const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  read: 'Read',
  write: 'Write',
  admin: 'Admin',
};

const DOMAIN_LABEL: Record<DomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending DNS',
  failed: 'Failed',
  not_set: 'Not set',
};

const DOMAIN_TEXT: Record<DomainStatus, string> = {
  verified: 'text-accent',
  pending: 'text-accent4',
  failed: 'text-accent3',
  not_set: 'text-text-dim',
};

/** ViewBox space — fixed coordinate system the stage scales to fit. */
const VB = 800;
const CX = VB / 2;
const CY = VB / 2;
const RING_INNER = 170;
const RING_OUTER = 290;
const GUIDE_CORE = 88;
const CORE_R = 56;
/** Feature satellite halo radius (just outside the core disc). */
const FEAT_R = 116;

interface TeamPlaced {
  kind: 'team';
  id: string;
  member: AgencyWorkspaceData['team'][number];
  x: number;
  y: number;
  r: number;
}

interface SubClientPlaced {
  kind: 'sub';
  id: string;
  client: AgencyWorkspaceData['subClients'][number];
  x: number;
  y: number;
  r: number;
}

type Placed = TeamPlaced | SubClientPlaced;

/**
 * Radial placement on TWO concentric rings.
 * - Team members ride the inner ring (smaller nodes, role-tinted).
 * - Sub-clients ride the outer ring (larger nodes, status-tinted).
 *
 * Team is sorted with owner first, then admins, then members — so the OWNER
 * always lands at the top of the orbit. Sub-clients are sorted by MRR
 * descending so the biggest accounts land at the cardinal points first.
 *
 * The outer ring is angle-offset by half a step so the two rings interleave
 * visually rather than stacking radially.
 */
function placeTeam(team: AgencyWorkspaceData['team']): TeamPlaced[] {
  const roleOrder: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 };
  const sorted = [...team].sort((a, b) => {
    const ro = roleOrder[a.role] - roleOrder[b.role];
    if (ro !== 0) return ro;
    return a.name.localeCompare(b.name);
  });
  const n = Math.max(sorted.length, 1);
  return sorted.map((member, i) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    return {
      kind: 'team' as const,
      id: member.id,
      member,
      x: CX + RING_INNER * Math.cos(ang),
      y: CY + RING_INNER * Math.sin(ang),
      r: member.role === 'owner' ? 22 : member.role === 'admin' ? 20 : 18,
    };
  });
}

function placeSubClients(
  subs: AgencyWorkspaceData['subClients'],
): SubClientPlaced[] {
  const sorted = [...subs].sort((a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd);
  const n = Math.max(sorted.length, 1);
  const maxMrr = Math.max(...sorted.map((c) => c.monthlyMrrUsd), 1);
  const phase = 360 / n / 2;
  return sorted.map((client, i) => {
    const ang = (-90 + phase + (360 / n) * i) * (Math.PI / 180);
    const vol = client.monthlyMrrUsd / maxMrr;
    return {
      kind: 'sub' as const,
      id: client.id,
      client,
      x: CX + RING_OUTER * Math.cos(ang),
      y: CY + RING_OUTER * Math.sin(ang),
      r: 26 + vol * 9, // 26..35
    };
  });
}

/**
 * Cross-edges: a team member "manages" the first `subClientsManaged`
 * sub-clients in the ordered list. Deterministic by team-member index so
 * hover-reveal feels stable — we shift each member by their own index so
 * different members highlight different accounts and the chord pattern
 * isn't a single fan from one node.
 */
function chordTargets(
  member: AgencyWorkspaceData['team'][number],
  memberIdx: number,
  subs: SubClientPlaced[],
): SubClientPlaced[] {
  if (subs.length === 0 || member.subClientsManaged === 0) return [];
  const out: SubClientPlaced[] = [];
  for (let k = 0; k < member.subClientsManaged; k++) {
    const idx = (memberIdx * 2 + k) % subs.length;
    const target = subs[idx];
    if (target) out.push(target);
  }
  return out;
}

function fmtUsd(n: number): string {
  if (n >= 1000) return formatMoney(n);
  return formatMoney(n);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Role-pretty rendering with icon. */
function RolePill({ role }: { role: TeamRole }) {
  const Icon = ROLE_ICON[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_TEXT[role]}`}
      style={{
        borderColor: `${ROLE_HEX[role]}55`,
        background: `${ROLE_HEX[role]}14`,
      }}
    >
      <Icon className="h-2.5 w-2.5" />
      {ROLE_LABEL[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksC2Roster({
  data,
}: { data?: AgencyWorkspaceData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const placedTeam = useMemo(() => placeTeam(d.team), [d.team]);
  const placedSubs = useMemo(() => placeSubClients(d.subClients), [d.subClients]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active: Placed | null = useMemo(() => {
    if (!activeId) return null;
    const t = placedTeam.find((p) => p.id === activeId);
    if (t) return t;
    const s = placedSubs.find((p) => p.id === activeId);
    return s ?? null;
  }, [activeId, placedTeam, placedSubs]);

  // Cross-edges for hover/select: which sub-clients does the hovered member own?
  const hoveredMemberIdx = placedTeam.findIndex((p) => p.id === hoverId);
  const hoveredMember =
    hoveredMemberIdx >= 0 ? placedTeam[hoveredMemberIdx] : null;
  const hoverChords = useMemo(() => {
    if (!hoveredMember) return [] as SubClientPlaced[];
    return chordTargets(hoveredMember.member, hoveredMemberIdx, placedSubs);
  }, [hoveredMember, hoveredMemberIdx, placedSubs]);

  const activeMemberIdx = placedTeam.findIndex((p) => p.id === activeId);
  const activeMember =
    activeMemberIdx >= 0 ? placedTeam[activeMemberIdx] : null;
  const activeChords = useMemo(() => {
    if (!activeMember) return [] as SubClientPlaced[];
    return chordTargets(activeMember.member, activeMemberIdx, placedSubs);
  }, [activeMember, activeMemberIdx, placedSubs]);

  // Aggregates
  const totalMailboxes = d.subClients.reduce((s, c) => s + c.mailboxCount, 0);
  const totalMrr = d.subClients.reduce((s, c) => s + c.monthlyMrrUsd, 0);
  const avgWarmth = totalMailboxes
    ? Math.round(
        d.subClients.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) /
          totalMailboxes,
      )
    : 0;
  const healthyCount = d.subClients.filter((c) => c.status === 'healthy').length;
  const warmingCount = d.subClients.filter((c) => c.status === 'warming').length;
  const atRiskCount = d.subClients.filter((c) => c.status === 'at_risk').length;
  const liveWebhooks = d.webhooks.filter((w) => w.status === 'live').length;

  return (
    <div className="space-y-5">
      {/* Slim global stat header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
              <Telescope className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {d.agency.name}
            </h1>
            <Badge variant="blue">
              <Sparkles className="h-3 w-3" />
              {d.agency.plan}
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Inner orbit: your team ({d.team.length}) · outer orbit:{' '}
            {d.subClients.length} sub-client{d.subClients.length === 1 ? '' : 's'}{' '}
            · click any node to inspect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip
            label="Sub-clients"
            value={String(d.subClients.length)}
            accent
          />
          <StatChip label="Team" value={String(d.team.length)} />
          <StatChip label="MRR" value={fmtUsd(totalMrr)} />
          <StatChip label="Mailboxes" value={String(totalMailboxes)} />
        </div>
      </motion.header>

      {/* Roster stage + side inspector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <RosterStage
            data={d}
            placedTeam={placedTeam}
            placedSubs={placedSubs}
            activeId={activeId}
            hoverId={hoverId}
            hoverChords={hoverChords}
            activeChords={activeChords}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <Legend />
          <StageAnnotation
            teamCount={d.team.length}
            subCount={d.subClients.length}
          />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            placed={active}
            data={d}
            onClose={() => setActiveId(null)}
            placedTeam={placedTeam}
            placedSubs={placedSubs}
            avgWarmth={avgWarmth}
            totalMailboxes={totalMailboxes}
            totalMrr={totalMrr}
            healthyCount={healthyCount}
            warmingCount={warmingCount}
            atRiskCount={atRiskCount}
          />
        </div>
      </motion.div>

      {/* Bottom rail — API keys + webhooks (the automation surface) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.18 }}
        className="grid grid-cols-1 gap-3 lg:grid-cols-12"
      >
        <ApiKeysTile keys={d.apiKeys} />
        <WebhooksTile webhooks={d.webhooks} liveCount={liveWebhooks} />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header stat chip
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs backdrop-blur-xl">
      <span className="text-text-dim">{label}</span>
      <span
        className={`font-mono font-semibold tabular-nums ${
          accent ? 'text-accent2' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Top-of-stage annotation chip
// ---------------------------------------------------------------------------

function StageAnnotation({
  teamCount,
  subCount,
}: {
  teamCount: number;
  subCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.8 }}
      className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-border-muted bg-surface/70 px-3 py-1.5 backdrop-blur-xl"
    >
      <CircleDot className="h-3 w-3 text-accent2" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
        Inner: team ({teamCount}) · Outer: sub-clients ({subCount})
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The roster stage (fixed-height SVG scene)
// ---------------------------------------------------------------------------

interface RosterStageProps {
  data: AgencyWorkspaceData;
  placedTeam: TeamPlaced[];
  placedSubs: SubClientPlaced[];
  activeId: string | null;
  hoverId: string | null;
  hoverChords: SubClientPlaced[];
  activeChords: SubClientPlaced[];
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

function RosterStage({
  data,
  placedTeam,
  placedSubs,
  activeId,
  hoverId,
  hoverChords,
  activeChords,
  onSelect,
  onHover,
}: RosterStageProps) {
  // Cross-edges: union of hovered + active member's managed sub-clients.
  const chordIds = useMemo(() => {
    const ids = new Set<string>();
    hoverChords.forEach((p) => ids.add(p.id));
    activeChords.forEach((p) => ids.add(p.id));
    return ids;
  }, [hoverChords, activeChords]);
  const chordSourceId = hoverId ?? (placedTeam.some((p) => p.id === activeId) ? activeId : null);
  const chordSource = useMemo(
    () => placedTeam.find((p) => p.id === chordSourceId) ?? null,
    [chordSourceId, placedTeam],
  );

  return (
    <div className="relative h-[720px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(140,140,160,0.35) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent2}1f` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Roster galaxy for ${data.agency.name}: ${data.team.length} team members on the inner ring, ${data.subClients.length} sub-clients on the outer ring`}
      >
        <defs>
          <radialGradient id="rost-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.9} />
            <stop offset="60%" stopColor={HEX.accent2} stopOpacity={0.32} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="rost-team-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Guide rings */}
        <circle
          cx={CX}
          cy={CY}
          r={GUIDE_CORE}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray="2 6"
          opacity={0.55}
        />
        <circle
          cx={CX}
          cy={CY}
          r={RING_INNER}
          fill="none"
          stroke={HEX.accent2}
          strokeOpacity={0.22}
          strokeWidth={1.2}
          strokeDasharray="3 7"
        />
        <circle
          cx={CX}
          cy={CY}
          r={RING_OUTER}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray="2 9"
          opacity={0.7}
        />

        {/* Drifting outer halo */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={RING_OUTER + 30}
          fill="none"
          stroke={HEX.accent2}
          strokeOpacity={0.14}
          strokeWidth={1.5}
          strokeDasharray="3 22"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 110, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* Cross-edges (chords) inner-team → outer-sub on hover/select */}
        {chordSource &&
          [...hoverChords, ...activeChords].map((target, i) => {
            // Deduplicate visually
            const key = `${chordSource.id}-${target.id}-${i}`;
            return (
              <motion.line
                key={key}
                x1={chordSource.x}
                y1={chordSource.y}
                x2={target.x}
                y2={target.y}
                stroke={HEX.accent2}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                strokeDasharray="4 6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.55 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            );
          })}

        {/* Inner-ring spoke lines: core → each team member */}
        {placedTeam.map((p, i) => {
          const focused = activeId === p.id || hoverId === p.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          const stroke = ROLE_HEX[p.member.role];
          return (
            <g key={`tl-${p.id}`}>
              <line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0.08 : focused ? 0.78 : 0.36}
                strokeWidth={focused ? 2.4 : 1.5}
                strokeLinecap="round"
              />
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : 0.7}
                strokeWidth={focused ? 2.4 : 1.6}
                strokeLinecap="round"
                strokeDasharray="2.5 48"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -101 }}
                transition={{
                  duration: 3.0 + (i % 4) * 0.4,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Outer-ring spoke lines: core → each sub-client (faint, dashed) */}
        {placedSubs.map((p, i) => {
          const focused = activeId === p.id || hoverId === p.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused && !chordIds.has(p.id);
          const stroke = STATUS_HEX[p.client.status];
          return (
            <g key={`sl-${p.id}`}>
              <line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={
                  dimmed ? 0.05 : focused ? 0.62 : chordIds.has(p.id) ? 0.42 : 0.18
                }
                strokeWidth={focused ? 1.6 : 1.0}
                strokeDasharray="2 6"
                strokeLinecap="round"
              />
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : 0.45}
                strokeWidth={focused ? 2.0 : 1.2}
                strokeLinecap="round"
                strokeDasharray="2 60"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -124 }}
                transition={{
                  duration: 4.0 + (i % 5) * 0.5,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Outer ring: sub-client nodes (render first so inner ring sits on top) */}
        {placedSubs.map((p, i) => (
          <SubClientNode
            key={p.id}
            placed={p}
            index={i}
            active={activeId === p.id}
            hovered={hoverId === p.id}
            highlighted={chordIds.has(p.id)}
            faded={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.id &&
              hoverId !== p.id &&
              !chordIds.has(p.id)
            }
            onSelect={() => onSelect(p.id === activeId ? null : p.id)}
            onHover={onHover}
          />
        ))}

        {/* Inner ring: team nodes */}
        {placedTeam.map((p, i) => (
          <TeamNode
            key={p.id}
            placed={p}
            index={i}
            active={activeId === p.id}
            hovered={hoverId === p.id}
            faded={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.id &&
              hoverId !== p.id
            }
            onSelect={() => onSelect(p.id === activeId ? null : p.id)}
            onHover={onHover}
          />
        ))}

        {/* The agency core */}
        <CoreGlyph data={data} />

        {/* Three feature satellites on the halo just outside the core */}
        <FeatureSatellites features={data.features} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (centre of the galaxy) — agency identity
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyWorkspaceData }) {
  return (
    <g>
      {/* Expanding pulse halo */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 3.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.8} fill="url(#rost-core)" />
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <text
        x={CX}
        y={CY - 22}
        textAnchor="middle"
        className="fill-text-dim"
        style={{
          fontSize: 9,
          letterSpacing: 1.8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        AGENCY CORE
      </text>
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {truncate(data.agency.name, 18)}
      </text>
      <text
        x={CX}
        y={CY + 14}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 11 }}
      >
        {data.agency.plan} · {data.agency.region || '—'}
      </text>
      <text
        x={CX}
        y={CY + 32}
        textAnchor="middle"
        fill="#5a5a72"
        style={{
          fontSize: 9,
          letterSpacing: 1.2,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {data.agency.slug ? `/${data.agency.slug}` : 'unconfigured'}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Three feature satellite chips on a halo around the core
// ---------------------------------------------------------------------------

interface FeatureSat {
  key: 'whiteLabel' | 'customDomain' | 'dedicatedPool';
  label: string;
  shortLabel: string;
  enabled: boolean;
  detail: string;
  Icon: typeof Palette;
  angleDeg: number;
}

function FeatureSatellites({
  features,
}: {
  features: AgencyWorkspaceData['features'];
}) {
  const sats: FeatureSat[] = [
    {
      key: 'whiteLabel',
      label: 'White-label',
      shortLabel: 'White-label',
      enabled: features.whiteLabel.enabled,
      detail: features.whiteLabel.brandName ?? 'not configured',
      Icon: Palette,
      angleDeg: -90, // top
    },
    {
      key: 'customDomain',
      label: 'Custom domain',
      shortLabel: 'Domain',
      enabled: features.customDomain.enabled,
      detail: features.customDomain.domain ?? 'not configured',
      Icon: Globe2,
      angleDeg: 30, // lower right
    },
    {
      key: 'dedicatedPool',
      label: 'Dedicated pool',
      shortLabel: 'Pool',
      enabled: features.dedicatedPool.enabled,
      detail: features.dedicatedPool.poolName ?? 'shared',
      Icon: Database,
      angleDeg: 150, // lower left
    },
  ];

  return (
    <g>
      {sats.map((sat, i) => {
        const a = (sat.angleDeg * Math.PI) / 180;
        const x = CX + FEAT_R * Math.cos(a);
        const y = CY + FEAT_R * Math.sin(a);
        const stroke = sat.enabled ? HEX.accent2 : HEX.border;
        const tint = sat.enabled ? HEX.accent2 : HEX.textDim;
        const detailFmt = truncate(sat.detail, 14);

        return (
          <motion.g
            key={sat.key}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.55,
              delay: 0.4 + i * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* Tether line back to the core */}
            <line
              x1={CX + (CORE_R + 2) * Math.cos(a)}
              y1={CY + (CORE_R + 2) * Math.sin(a)}
              x2={x}
              y2={y}
              stroke={stroke}
              strokeOpacity={sat.enabled ? 0.5 : 0.25}
              strokeWidth={1}
              strokeDasharray="1 3"
            />
            {/* Chip background */}
            <rect
              x={x - 56}
              y={y - 16}
              width={112}
              height={32}
              rx={16}
              fill={HEX.surface2}
              stroke={stroke}
              strokeOpacity={sat.enabled ? 0.6 : 0.35}
              strokeWidth={1.2}
            />
            {sat.enabled && (
              <rect
                x={x - 56}
                y={y - 16}
                width={112}
                height={32}
                rx={16}
                fill={tint}
                fillOpacity={0.08}
              />
            )}
            {/* Icon dot on the left */}
            <circle
              cx={x - 44}
              cy={y}
              r={7}
              fill={tint}
              fillOpacity={sat.enabled ? 0.18 : 0.08}
              stroke={tint}
              strokeOpacity={sat.enabled ? 0.6 : 0.35}
              strokeWidth={1}
            />
            <text
              x={x - 30}
              y={y - 2}
              fill={tint}
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {sat.shortLabel.toUpperCase()}
            </text>
            <text
              x={x - 30}
              y={y + 11}
              fill={sat.enabled ? '#cdd4e6' : HEX.textDim}
              style={{
                fontSize: 9,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {sat.enabled ? detailFmt : 'disabled'}
            </text>
            {/* Tiny on/off LED on the right edge */}
            <circle
              cx={x + 48}
              cy={y}
              r={3.2}
              fill={sat.enabled ? HEX.accent : HEX.textDim}
              fillOpacity={sat.enabled ? 0.95 : 0.4}
            />
            {sat.enabled && (
              <motion.circle
                cx={x + 48}
                cy={y}
                r={3.2}
                fill="none"
                stroke={HEX.accent}
                strokeWidth={1}
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{
                  duration: 2,
                  ease: 'easeOut',
                  repeat: Infinity,
                  delay: i * 0.4,
                }}
                style={{ transformOrigin: `${x + 48}px ${y}px` }}
              />
            )}

            {/* Icon visual on top-left of the chip's dot */}
            <g transform={`translate(${x - 49} ${y - 5})`}>
              <SvgIcon Icon={sat.Icon} tint={tint} />
            </g>
          </motion.g>
        );
      })}
    </g>
  );
}

/**
 * Tiny inline icon renderer for SVG context — we approximate the lucide stroke
 * with a 10px square, matching the satellite icon footprint.
 */
function SvgIcon({
  Icon,
  tint,
}: {
  Icon: typeof Palette;
  tint: string;
}) {
  return (
    <foreignObject x={0} y={0} width={10} height={10}>
      <Icon
        width={10}
        height={10}
        color={tint}
        strokeWidth={2}
        aria-hidden
      />
    </foreignObject>
  );
}

// ---------------------------------------------------------------------------
// Team-member node (inner ring)
// ---------------------------------------------------------------------------

function TeamNode({
  placed,
  index,
  active,
  hovered,
  faded,
  onSelect,
  onHover,
}: {
  placed: TeamPlaced;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { id, member, x, y, r } = placed;
  const color = ROLE_HEX[member.role];
  const lifted = active || hovered;
  const isOwner = member.role === 'owner';

  const baseOpacity = faded ? 0.3 : 1;

  // Avatar initials
  const initials = useMemo(() => {
    const parts = member.name.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
  }, [member.name]);

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: baseOpacity,
        scale: 1,
        x: lifted ? (x - CX) * 0.05 : 0,
        y: lifted ? (y - CY) * 0.05 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.5,
          delay: 0.25 + index * 0.04,
          ease: [0.22, 1, 0.36, 1],
        },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${member.name}, ${ROLE_LABEL[member.role]}, manages ${member.subClientsManaged} sub-client${member.subClientsManaged === 1 ? '' : 's'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -2 : 2, 0] }}
        transition={{
          duration: 5 + (index % 3),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* Owner crown pulse */}
        {isOwner && (
          <motion.circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 2.4, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* Hover ring */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 8}
            fill="none"
            stroke={color}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        )}
        {/* Disc background tint */}
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill={color}
          fillOpacity={lifted ? 0.22 : 0.12}
        />
        {/* Main avatar disc */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.4 : isOwner ? 2.2 : 1.8}
        />
        {/* Initials */}
        <text
          x={x}
          y={y + r * 0.28}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.66,
            fontWeight: 700,
            letterSpacing: -0.4,
          }}
        >
          {initials}
        </text>
        {/* Crown tab for owner */}
        {isOwner && (
          <g>
            <circle
              cx={x + r * 0.72}
              cy={y - r * 0.72}
              r={6}
              fill={HEX.surface2}
              stroke={color}
              strokeWidth={1.2}
            />
            <foreignObject
              x={x + r * 0.72 - 4}
              y={y - r * 0.72 - 4}
              width={8}
              height={8}
            >
              <Crown width={8} height={8} color={color} strokeWidth={2.4} />
            </foreignObject>
          </g>
        )}
        {/* Name below */}
        <text
          x={x}
          y={y + r + 14}
          textAnchor="middle"
          className="fill-text"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {truncate(member.name, 14)}
        </text>
        {/* Role label */}
        <text
          x={x}
          y={y + r + 25}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {ROLE_LABEL[member.role].toUpperCase()}
        </text>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Sub-client node (outer ring)
// ---------------------------------------------------------------------------

function SubClientNode({
  placed,
  index,
  active,
  hovered,
  highlighted,
  faded,
  onSelect,
  onHover,
}: {
  placed: SubClientPlaced;
  index: number;
  active: boolean;
  hovered: boolean;
  highlighted: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { id, client, x, y, r } = placed;
  const color = STATUS_HEX[client.status];
  const lifted = active || hovered;
  const atRisk = client.status === 'at_risk';
  const inactive = client.status === 'inactive';

  const baseOpacity = faded ? 0.28 : highlighted ? 1 : 0.86;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: baseOpacity,
        scale: 1,
        x: lifted ? (x - CX) * 0.04 : 0,
        y: lifted ? (y - CY) * 0.04 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.55,
          delay: 0.3 + index * 0.05,
          ease: [0.22, 1, 0.36, 1],
        },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${client.name}, status ${STATUS_LABEL[client.status]}, ${client.mailboxCount} mailboxes, MRR ${fmtUsd(client.monthlyMrrUsd)}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -3 : 3, 0] }}
        transition={{
          duration: 5.5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* At-risk pulse */}
        {atRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* Hover ring */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 9}
            fill="none"
            stroke={color}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        )}
        {/* Chord-highlighted halo */}
        {highlighted && !lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={HEX.accent2}
            strokeOpacity={0.4}
            strokeWidth={1.2}
            strokeDasharray="3 4"
          />
        )}
        {/* Disc background tint */}
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill={color}
          fillOpacity={lifted ? 0.2 : inactive ? 0.06 : 0.12}
        />
        {/* Main disc */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.4 : 1.8}
          strokeDasharray={inactive ? '4 4' : undefined}
        />
        {/* Subtle inner highlight */}
        <circle
          cx={x}
          cy={y - r * 0.25}
          r={r * 0.65}
          fill="url(#rost-team-glow)"
        />
        {/* Logo char */}
        <text
          x={x}
          y={y + r * 0.28}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.74,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          {client.logoChar}
        </text>
        {/* Name */}
        <text
          x={x}
          y={y + r + 15}
          textAnchor="middle"
          className="fill-text"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {truncate(client.name, 14)}
        </text>
        {/* Mailbox count chip */}
        <g>
          <rect
            x={x - 30}
            y={y + r + 22}
            width={60}
            height={14}
            rx={7}
            fill={HEX.surface2}
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={1}
          />
          <text
            x={x}
            y={y + r + 32}
            textAnchor="middle"
            fill={color}
            style={{
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {client.mailboxCount}mbx · {fmtUsd(client.monthlyMrrUsd)}
          </text>
        </g>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Legend (compact, overlaid bottom-left)
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2.5 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Orbit className="h-3 w-3 text-accent2" />
        Roster legend
      </span>

      <div className="space-y-1.5">
        <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-text-dim">
          Inner — team
        </span>
        {(['owner', 'admin', 'member'] as TeamRole[]).map((role) => (
          <span
            key={role}
            className="flex items-center gap-2 text-xs text-text"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: ROLE_HEX[role] }}
              aria-hidden
            />
            {ROLE_LABEL[role]}
          </span>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-border-muted pt-2">
        <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-text-dim">
          Outer — sub-clients
        </span>
        {(['healthy', 'warming', 'at_risk'] as SubClientStatus[]).map(
          (status) => (
            <span
              key={status}
              className="flex items-center gap-2 text-xs text-text"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: STATUS_HEX[status] }}
                aria-hidden
              />
              {STATUS_LABEL[status]}
            </span>
          ),
        )}
      </div>

      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Eye className="h-3 w-3 text-accent2" />
        Hover a team node to see chords
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Side inspector panel — empty state = roster overview
// ---------------------------------------------------------------------------

interface InspectorPanelProps {
  placed: Placed | null;
  data: AgencyWorkspaceData;
  onClose: () => void;
  placedTeam: TeamPlaced[];
  placedSubs: SubClientPlaced[];
  avgWarmth: number;
  totalMailboxes: number;
  totalMrr: number;
  healthyCount: number;
  warmingCount: number;
  atRiskCount: number;
}

function InspectorPanel({
  placed,
  data,
  onClose,
  placedTeam,
  placedSubs,
  avgWarmth,
  totalMailboxes,
  totalMrr,
  healthyCount,
  warmingCount,
  atRiskCount,
}: InspectorPanelProps) {
  return (
    <div className="relative h-[720px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {placed === null && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <RosterOverview
              data={data}
              placedTeam={placedTeam}
              placedSubs={placedSubs}
              avgWarmth={avgWarmth}
              totalMailboxes={totalMailboxes}
              totalMrr={totalMrr}
              healthyCount={healthyCount}
              warmingCount={warmingCount}
              atRiskCount={atRiskCount}
            />
          </motion.div>
        )}
        {placed?.kind === 'team' && (
          <motion.div
            key={`team-${placed.id}`}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <TeamMemberDetail
              member={placed.member}
              data={data}
              placedTeam={placedTeam}
              placedSubs={placedSubs}
              onClose={onClose}
            />
          </motion.div>
        )}
        {placed?.kind === 'sub' && (
          <motion.div
            key={`sub-${placed.id}`}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <SubClientDetail
              client={placed.client}
              data={data}
              onClose={onClose}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-state: roster overview
// ---------------------------------------------------------------------------

function RosterOverview({
  data,
  placedTeam,
  placedSubs,
  avgWarmth,
  totalMailboxes,
  totalMrr,
  healthyCount,
  warmingCount,
  atRiskCount,
}: {
  data: AgencyWorkspaceData;
  placedTeam: TeamPlaced[];
  placedSubs: SubClientPlaced[];
  avgWarmth: number;
  totalMailboxes: number;
  totalMrr: number;
  healthyCount: number;
  warmingCount: number;
  atRiskCount: number;
}) {
  const ownerCount = placedTeam.filter((p) => p.member.role === 'owner').length;
  const adminCount = placedTeam.filter((p) => p.member.role === 'admin').length;
  const memberCount = placedTeam.filter((p) => p.member.role === 'member').length;
  const subTotal = placedSubs.length;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Telescope className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">Roster overview</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Select any node to inspect the member or sub-client.
        </p>
      </header>

      <div className="space-y-4 p-5">
        {/* Team KPI block */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Users className="h-3 w-3 text-accent2" />
              Inner ring — team
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {placedTeam.length} member{placedTeam.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <RoleStat
                role="owner"
                count={ownerCount}
                Icon={Crown}
              />
              <RoleStat
                role="admin"
                count={adminCount}
                Icon={Shield}
              />
              <RoleStat
                role="member"
                count={memberCount}
                Icon={Users}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-text-dim">
              <span>Owner</span>
              <span className="truncate text-right text-text">
                {data.agency.ownerEmail || '—'}
              </span>
            </div>
          </div>
        </section>

        {/* Sub-client KPI block */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Building2 className="h-3 w-3 text-accent2" />
              Outer ring — sub-clients
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {subTotal} account{subTotal === 1 ? '' : 's'}
            </span>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                  Monthly recurring
                </p>
                <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-text">
                  {fmtUsd(totalMrr)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-dim">Mailboxes</p>
                <p className="font-mono text-base font-semibold tabular-nums text-text">
                  {totalMailboxes}
                </p>
              </div>
            </div>
            {/* Status split bar */}
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
              {subTotal > 0 && (
                <>
                  <motion.div
                    className="h-full"
                    style={{ background: HEX.accent }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(healthyCount / subTotal) * 100}%`,
                    }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="h-full"
                    style={{ background: HEX.accent4 }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(warmingCount / subTotal) * 100}%`,
                    }}
                    transition={{
                      duration: 0.8,
                      ease: 'easeOut',
                      delay: 0.1,
                    }}
                  />
                  <motion.div
                    className="h-full"
                    style={{ background: HEX.accent3 }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(atRiskCount / subTotal) * 100}%`,
                    }}
                    transition={{
                      duration: 0.8,
                      ease: 'easeOut',
                      delay: 0.2,
                    }}
                  />
                </>
              )}
            </div>
            <div className="mt-2 flex justify-between text-[11px]">
              <span className="text-accent">{healthyCount} healthy</span>
              <span className="text-accent4">{warmingCount} warming</span>
              <span className="text-accent3">{atRiskCount} at-risk</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border-muted pt-2.5 text-[11px] text-text-dim">
              <span className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-accent2" />
                Avg warmth
              </span>
              <span className="font-mono text-text">{avgWarmth}</span>
            </div>
          </div>
        </section>

        {/* Feature entitlements strip */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Sparkles className="h-3 w-3 text-accent2" />
              Agency features
            </span>
          </div>
          <ul className="space-y-1.5">
            <FeatureRow
              Icon={Palette}
              label="White-label"
              enabled={data.features.whiteLabel.enabled}
              detail={
                data.features.whiteLabel.enabled
                  ? `${data.features.whiteLabel.brandName ?? '—'}${data.features.whiteLabel.hasLogo ? ' · logo uploaded' : ' · no logo'}`
                  : 'disabled'
              }
            />
            <FeatureRow
              Icon={Globe2}
              label="Custom domain"
              enabled={data.features.customDomain.enabled}
              detail={
                data.features.customDomain.enabled
                  ? `${data.features.customDomain.domain ?? '—'} · ${DOMAIN_LABEL[data.features.customDomain.status]}`
                  : 'disabled'
              }
              detailClass={
                data.features.customDomain.enabled
                  ? DOMAIN_TEXT[data.features.customDomain.status]
                  : 'text-text-dim'
              }
            />
            <FeatureRow
              Icon={Database}
              label="Dedicated peer pool"
              enabled={data.features.dedicatedPool.enabled}
              detail={
                data.features.dedicatedPool.enabled
                  ? `${data.features.dedicatedPool.poolName ?? '—'} · ${formatNumber(data.features.dedicatedPool.memberCount)} peers`
                  : 'shared default pool'
              }
            />
          </ul>
        </section>
      </div>

      {/* Bottom action strip */}
      <div className="mt-auto border-t border-white/5 p-5">
        <div className="grid grid-cols-2 gap-2">
          <ActionTile Icon={Plus} label="Invite teammate" />
          <ActionTile Icon={Building2} label="Add sub-client" />
        </div>
      </div>
    </div>
  );
}

function RoleStat({
  role,
  count,
  Icon,
}: {
  role: TeamRole;
  count: number;
  Icon: typeof Crown;
}) {
  return (
    <div
      className="rounded-lg border bg-surface/40 p-2.5"
      style={{ borderColor: `${ROLE_HEX[role]}33` }}
    >
      <Icon
        className="mx-auto h-4 w-4"
        style={{ color: ROLE_HEX[role] }}
        aria-hidden
      />
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${ROLE_TEXT[role]}`}>
        {count}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-text-dim">
        {ROLE_LABEL[role]}
      </p>
    </div>
  );
}

function FeatureRow({
  Icon,
  label,
  enabled,
  detail,
  detailClass,
}: {
  Icon: typeof Palette;
  label: string;
  enabled: boolean;
  detail: string;
  detailClass?: string;
}) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
      style={{
        borderColor: enabled ? `${HEX.accent2}33` : undefined,
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${enabled ? 'bg-accent2/15 text-accent2' : 'bg-surface text-text-dim'}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text">{label}</p>
          <p
            className={`truncate text-[11px] ${detailClass ?? (enabled ? 'text-text-dim' : 'text-text-dim')}`}
          >
            {detail}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${enabled ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border-muted bg-surface text-text-dim'}`}
      >
        {enabled ? 'On' : 'Off'}
      </span>
    </li>
  );
}

function ActionTile({
  Icon,
  label,
}: {
  Icon: typeof Plus;
  label: string;
}) {
  return (
    <button
      type="button"
      // TODO(live-data): wire onClick to invite-teammate / add-sub-client flows
      className="group flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:border-accent2/40 hover:bg-accent2/5"
    >
      <span className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent2/15 text-accent2">
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-xs font-medium text-text">{label}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-text-dim transition-colors group-hover:text-accent2" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Team-member detail (when an inner-ring node is selected)
// ---------------------------------------------------------------------------

function TeamMemberDetail({
  member,
  data,
  placedTeam,
  placedSubs,
  onClose,
}: {
  member: AgencyWorkspaceData['team'][number];
  data: AgencyWorkspaceData;
  placedTeam: TeamPlaced[];
  placedSubs: SubClientPlaced[];
  onClose: () => void;
}) {
  const color = ROLE_HEX[member.role];
  const Icon = ROLE_ICON[member.role];

  // Map this member's chord targets back to their full sub-client records.
  const idx = placedTeam.findIndex((p) => p.id === member.id);
  const targets = useMemo(() => chordTargets(member, idx, placedSubs), [member, idx, placedSubs]);

  const initials = useMemo(() => {
    const parts = member.name.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
  }, [member.name]);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">
                {member.name}
              </p>
              <RolePill role={member.role} />
            </div>
            <p className="truncate text-xs text-text-dim">{member.email}</p>
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
        {/* Role + activity summary */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                Sub-clients managed
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {member.subClientsManaged}
              </p>
              <p className="mt-1 text-xs text-text-dim">
                of {data.subClients.length} agency account
                {data.subClients.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Icon className="h-3.5 w-3.5" style={{ color }} />
                <span
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color }}
                >
                  {ROLE_LABEL[member.role]}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-dim">
                Last active {member.lastActiveAgo}
              </p>
            </div>
          </div>
          {data.subClients.length > 0 && (
            <>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(member.subClientsManaged / data.subClients.length) * 100}%`,
                  }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-text-dim">
                {Math.round(
                  (member.subClientsManaged / data.subClients.length) * 100,
                )}
                % of book
              </p>
            </>
          )}
        </div>

        {/* Assignment list */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Building2 className="h-3 w-3 text-accent2" />
              Assignments
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {targets.length} sub-client{targets.length === 1 ? '' : 's'}
            </span>
          </div>
          {targets.length > 0 ? (
            <ul className="space-y-1.5">
              {targets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
                  style={{
                    borderColor: `${STATUS_HEX[p.client.status]}40`,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-bg"
                      style={{ background: STATUS_HEX[p.client.status] }}
                      aria-hidden
                    >
                      {p.client.logoChar}
                    </span>
                    <span className="truncate text-xs font-medium text-text">
                      {p.client.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-text">
                      {fmtUsd(p.client.monthlyMrrUsd)}
                    </span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${STATUS_TEXT[p.client.status]}`}
                    >
                      W{p.client.avgWarmth}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border-muted bg-surface-2/30 px-3 py-3 text-center text-xs text-text-dim">
              No sub-clients assigned yet.
            </p>
          )}
        </section>

        {/* Permissions block */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            <Shield className="h-3 w-3 text-accent2" />
            Permissions
          </div>
          <ul className="space-y-1.5">
            <PermRow
              label="Manage sub-clients"
              granted={member.role !== 'member'}
            />
            <PermRow
              label="Manage team"
              granted={member.role === 'owner' || member.role === 'admin'}
            />
            <PermRow
              label="Manage billing"
              granted={member.role === 'owner'}
            />
            <PermRow
              label="Rotate API keys"
              granted={member.role === 'owner' || member.role === 'admin'}
            />
            <PermRow
              label="Configure white-label"
              granted={member.role === 'owner'}
            />
          </ul>
        </section>
      </div>

      <div className="border-t border-white/5 p-5">
        <button
          type="button"
          // TODO(live-data): wire to /app/team/:id route or open member-settings modal
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5 text-left text-xs font-medium text-text transition-colors hover:border-accent2/40 hover:bg-accent2/5"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-accent2" />
            Manage member
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-text-dim" />
        </button>
      </div>
    </>
  );
}

function PermRow({ label, granted }: { label: string; granted: boolean }) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 ${granted ? 'border-accent/30 bg-accent/5' : 'border-border-muted bg-surface-2/40'}`}
    >
      <span className="text-[11px] text-text">{label}</span>
      <span
        className={`flex items-center gap-1 text-[10px] font-semibold ${granted ? 'text-accent' : 'text-text-dim'}`}
      >
        {granted ? (
          <>
            <CheckCircle2 className="h-3 w-3" /> Granted
          </>
        ) : (
          <>
            <X className="h-3 w-3" /> Denied
          </>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sub-client detail (when an outer-ring node is selected)
// ---------------------------------------------------------------------------

function SubClientDetail({
  client,
  data,
  onClose,
}: {
  client: AgencyWorkspaceData['subClients'][number];
  data: AgencyWorkspaceData;
  onClose: () => void;
}) {
  const color = STATUS_HEX[client.status];
  const fleetMrr = data.subClients.reduce((s, c) => s + c.monthlyMrrUsd, 0);
  const fleetPct = fleetMrr ? Math.round((client.monthlyMrrUsd / fleetMrr) * 100) : 0;
  const totalMailboxes = data.subClients.reduce((s, c) => s + c.mailboxCount, 0);
  const mailboxPct = totalMailboxes
    ? Math.round((client.mailboxCount / totalMailboxes) * 100)
    : 0;

  // Reverse-lookup: which team members manage this sub-client? Mirrors the
  // chordTargets() distribution from the stage layer.
  const managedBy = useMemo(() => {
    const ownerSet = new Set<string>();
    data.team.forEach((m, mIdx) => {
      for (let k = 0; k < m.subClientsManaged; k++) {
        const targetIdx = (mIdx * 2 + k) % data.subClients.length;
        const sorted = [...data.subClients].sort(
          (a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd,
        );
        const target = sorted[targetIdx];
        if (target && target.id === client.id) {
          ownerSet.add(m.id);
        }
      }
    });
    return data.team.filter((m) => ownerSet.has(m.id));
  }, [data.team, data.subClients, client.id]);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {client.logoChar}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">
                {client.name}
              </p>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TEXT[client.status]}`}
                style={{ borderColor: `${color}55`, background: `${color}14` }}
              >
                {STATUS_LABEL[client.status]}
              </span>
            </div>
            <p className="text-xs text-text-dim">
              {client.plan} · {client.mailboxCount} mailbox
              {client.mailboxCount === 1 ? '' : 'es'} · {client.lastActiveAgo}
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
        {/* MRR contribution */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                Monthly contribution
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {fmtUsd(client.monthlyMrrUsd)}
              </p>
              <p className="mt-1 text-xs text-text-dim">
                {fleetPct}% of fleet MRR
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-text-dim" />
                <span className="font-mono text-sm tabular-nums text-text">
                  {client.mailboxCount}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-dim">
                mailboxes ({mailboxPct}%)
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${fleetPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Account meta */}
        <div className="grid grid-cols-2 gap-2">
          <MetaTile
            Icon={Mail}
            label="Owner"
            value={truncate(client.ownerEmail, 22)}
          />
          <MetaTile Icon={Users} label="Team" value={`${client.teamCount}`} />
          <MetaTile
            Icon={Activity}
            label="Avg warmth"
            value={String(client.avgWarmth)}
            tint={color}
          />
          <MetaTile
            Icon={Sparkles}
            label="Plan"
            value={client.plan}
          />
        </div>

        {/* Managed by */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            <Users className="h-3 w-3 text-accent2" />
            Managed by
          </div>
          {managedBy.length > 0 ? (
            <ul className="space-y-1.5">
              {managedBy.map((m) => {
                const initials = (
                  (m.name.split(/\s+/)[0]?.[0] ?? '') +
                  (m.name.split(/\s+/).slice(-1)[0]?.[0] ?? '')
                ).toUpperCase();
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
                    style={{ borderColor: `${ROLE_HEX[m.role]}33` }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-bg"
                        style={{ background: ROLE_HEX[m.role] }}
                        aria-hidden
                      >
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-text">
                          {m.name}
                        </p>
                        <p className="truncate text-[10px] text-text-dim">
                          {m.email}
                        </p>
                      </div>
                    </div>
                    <RolePill role={m.role} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border-muted bg-surface-2/30 px-3 py-3 text-center text-xs text-text-dim">
              Unassigned · pick a team member
            </p>
          )}
        </section>

        {/* Created / last active timeline */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            <Layers className="h-3 w-3 text-accent2" />
            Activity
          </div>
          <ul className="space-y-1.5">
            <ActivityRow
              Icon={Plus}
              label="Created"
              value={client.createdAgo}
            />
            <ActivityRow
              Icon={Radio}
              label="Last active"
              value={client.lastActiveAgo}
              tint={color}
            />
          </ul>
        </section>
      </div>

      <div className="border-t border-white/5 p-5">
        <button
          type="button"
          // TODO(live-data): wire to /app/sub-clients/:id route in the agency shell
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5 text-left text-xs font-medium text-text transition-colors hover:border-accent2/40 hover:bg-accent2/5"
        >
          <span className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-accent2" />
            Open sub-client
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-text-dim" />
        </button>
      </div>
    </>
  );
}

function MetaTile({
  Icon,
  label,
  value,
  tint,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-text-dim">
        <Icon className="h-3 w-3 text-accent2" />
        {label}
      </div>
      <p
        className="mt-1 font-mono text-sm font-semibold tabular-nums text-text"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function ActivityRow({
  Icon,
  label,
  value,
  tint,
}: {
  Icon: typeof Plus;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
      <span className="flex items-center gap-2 text-[11px] text-text">
        <Icon className="h-3 w-3 text-accent2" />
        {label}
      </span>
      <span
        className="font-mono text-[11px] tabular-nums text-text"
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — API keys tile
// ---------------------------------------------------------------------------

function ApiKeysTile({
  keys,
}: {
  keys: AgencyWorkspaceData['apiKeys'];
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl lg:col-span-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent2/15 text-accent2">
            <Key className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">API keys</p>
            <p className="text-[11px] text-text-dim">
              {keys.length} key{keys.length === 1 ? '' : 's'} active
            </p>
          </div>
        </div>
        <button
          type="button"
          // TODO(live-data): wire to POST /api/agency/keys via key-mint dialog
          className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text transition-colors hover:border-accent2/40 hover:bg-accent2/5"
        >
          <Plus className="h-3 w-3 text-accent2" />
          Mint key
        </button>
      </div>
      {keys.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted bg-surface-2/30 px-3 py-4 text-center text-xs text-text-dim">
          No keys yet · mint a key to enable the public API.
        </p>
      ) : (
        <ul className="grid gap-2">
          {keys.map((k) => (
            <ApiKeyRow key={k.id} entry={k} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApiKeyRow({
  entry,
}: {
  entry: AgencyWorkspaceData['apiKeys'][number];
}) {
  const scopeHex = SCOPE_HEX[entry.scope];
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
          style={{ background: `${scopeHex}1f`, color: scopeHex }}
          aria-hidden
        >
          <Key className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text">
            {entry.label}
          </p>
          <p className="truncate font-mono text-[11px] text-text-dim">
            {entry.masked}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: scopeHex,
            borderColor: `${scopeHex}55`,
            background: `${scopeHex}14`,
          }}
        >
          {SCOPE_LABEL[entry.scope]}
        </span>
        <span className="hidden font-mono text-[10px] tabular-nums text-text-dim sm:inline">
          {entry.lastUsedAgo}
        </span>
        <button
          type="button"
          aria-label="Copy key"
          // TODO(live-data): copy entry.masked.replace mask with real prefix retrieval
          className="grid h-6 w-6 place-items-center rounded-md border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — Webhooks tile
// ---------------------------------------------------------------------------

function WebhooksTile({
  webhooks,
  liveCount,
}: {
  webhooks: AgencyWorkspaceData['webhooks'];
  liveCount: number;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl lg:col-span-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent2/15 text-accent2">
            <Webhook className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">Webhooks</p>
            <p className="text-[11px] text-text-dim">
              {liveCount} live · {webhooks.length - liveCount} paused
            </p>
          </div>
        </div>
        <button
          type="button"
          // TODO(live-data): wire to POST /api/agency/webhooks
          className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5 text-[11px] font-medium text-text transition-colors hover:border-accent2/40 hover:bg-accent2/5"
        >
          <Plus className="h-3 w-3 text-accent2" />
          Add webhook
        </button>
      </div>
      {webhooks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-muted bg-surface-2/30 px-3 py-4 text-center text-xs text-text-dim">
          No webhooks · subscribe to platform events.
        </p>
      ) : (
        <ul className="grid gap-2">
          {webhooks.map((w) => (
            <WebhookRow key={w.id} entry={w} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WebhookRow({
  entry,
}: {
  entry: AgencyWorkspaceData['webhooks'][number];
}) {
  const isLive = entry.status === 'live';
  const tone = isLive ? HEX.accent : HEX.textDim;
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2.5"
      style={{ borderColor: isLive ? `${HEX.accent}33` : undefined }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
          style={{ background: `${tone}1f`, color: tone }}
          aria-hidden
        >
          {isLive ? (
            <Send className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-medium text-text">
            {entry.url}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {entry.events.slice(0, 4).map((ev) => (
              <span
                key={ev}
                className="rounded border border-border-muted bg-surface px-1 py-0.5 text-[9px] font-medium text-text-dim"
              >
                {ev}
              </span>
            ))}
            {entry.events.length > 4 && (
              <span className="rounded border border-border-muted bg-surface px-1 py-0.5 text-[9px] font-medium text-text-dim">
                +{entry.events.length - 4}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            color: tone,
            borderColor: `${tone}55`,
            background: `${tone}14`,
          }}
        >
          {isLive ? (
            <>
              <CheckCircle2 className="h-2.5 w-2.5" />
              Live
            </>
          ) : (
            <>
              <Pause className="h-2.5 w-2.5" />
              Paused
            </>
          )}
        </span>
        <button
          type="button"
          aria-label={isLive ? 'Pause webhook' : 'Resume webhook'}
          // TODO(live-data): PATCH /api/agency/webhooks/:id { status: ... }
          className="grid h-6 w-6 place-items-center rounded-md border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          {isLive ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </button>
      </div>
    </li>
  );
}
