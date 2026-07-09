import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Crown,
  DollarSign,
  Globe,
  Inbox,
  Key,
  Mail,
  MoreHorizontal,
  Network,
  Palette,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Users,
  Webhook,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksC1Federation — Agency-tier Workspace, design candidate #1, "Federation Atlas".
 *
 * This is the /app/workspace surface for Agency-tier users. They manage:
 *   - sub-clients (their customer accounts)
 *   - their own team
 *   - API keys + webhooks
 *   - three Agency-only features: white-label / custom domain / dedicated peer pool
 *
 * The visual language is the Pro-Plus "Network Constellation" family adapted to a
 * federation topology. A SINGLE RING of sub-clients orbits an AGENCY CORE. The
 * three Agency feature satellites (white-label / custom domain / dedicated pool)
 * sit on the core's HALO as tiny status chips — that's what makes C1 distinct
 * from C2 (two rings), C3 (mailbox sub-orbits), and C4 (horizontal carousel).
 *
 * Clicking a sub-client swaps the right inspector to that account's management
 * card. The bottom rail surfaces the agency's own team chips + API key /
 * webhook stat tiles.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK constant so the preview harness can
 * mount it prop-less. The future adapter will pass `data` once live.
 */

// ---------------------------------------------------------------------------
// Shared Agency workspace data shape (kept in sync across all 4 variants).
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
// Mock data — Northwind Agency, 8 sub-clients, 5 team members, etc.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyWorkspaceData['subClients'] = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    ownerEmail: 'eli@lumenlabs.io',
    plan: 'Pro Plus',
    mailboxCount: 22,
    teamCount: 6,
    avgWarmth: 91,
    status: 'healthy',
    monthlyMrrUsd: 1480,
    createdAgo: 'joined 8 months ago',
    lastActiveAgo: 'active 2m ago',
  },
  {
    id: 'sc-northwind-co',
    name: 'Northwind Co',
    logoChar: 'NC',
    ownerEmail: 'ops@northwindco.com',
    plan: 'Pro Plus',
    mailboxCount: 18,
    teamCount: 5,
    avgWarmth: 88,
    status: 'healthy',
    monthlyMrrUsd: 1180,
    createdAgo: 'joined 6 months ago',
    lastActiveAgo: 'active 5m ago',
  },
  {
    id: 'sc-acme',
    name: 'Acme Outreach',
    logoChar: 'AO',
    ownerEmail: 'amelia@acmeoutreach.io',
    plan: 'Pro',
    mailboxCount: 14,
    teamCount: 4,
    avgWarmth: 85,
    status: 'healthy',
    monthlyMrrUsd: 820,
    createdAgo: 'joined 5 months ago',
    lastActiveAgo: 'active 8m ago',
  },
  {
    id: 'sc-helio',
    name: 'Helio Sales',
    logoChar: 'HS',
    ownerEmail: 'rey@heliosales.com',
    plan: 'Pro',
    mailboxCount: 11,
    teamCount: 3,
    avgWarmth: 81,
    status: 'healthy',
    monthlyMrrUsd: 640,
    createdAgo: 'joined 4 months ago',
    lastActiveAgo: 'active 14m ago',
  },
  {
    id: 'sc-crestwood',
    name: 'Crestwood',
    logoChar: 'CW',
    ownerEmail: 'sam@crestwood.co',
    plan: 'Pro',
    mailboxCount: 9,
    teamCount: 3,
    avgWarmth: 78,
    status: 'healthy',
    monthlyMrrUsd: 520,
    createdAgo: 'joined 3 months ago',
    lastActiveAgo: 'active 22m ago',
  },
  {
    id: 'sc-vector',
    name: 'Vector',
    logoChar: 'VC',
    ownerEmail: 'mira@vector.io',
    plan: 'Starter',
    mailboxCount: 7,
    teamCount: 2,
    avgWarmth: 64,
    status: 'warming',
    monthlyMrrUsd: 320,
    createdAgo: 'joined 6 weeks ago',
    lastActiveAgo: 'active 38m ago',
  },
  {
    id: 'sc-forge',
    name: 'Forge',
    logoChar: 'FG',
    ownerEmail: 'kai@forge.team',
    plan: 'Starter',
    mailboxCount: 5,
    teamCount: 2,
    avgWarmth: 56,
    status: 'warming',
    monthlyMrrUsd: 220,
    createdAgo: 'joined 4 weeks ago',
    lastActiveAgo: 'active 1h ago',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    ownerEmail: 'jules@atlasbio.co',
    plan: 'Starter',
    mailboxCount: 5,
    teamCount: 1,
    avgWarmth: 32,
    status: 'at_risk',
    monthlyMrrUsd: 180,
    createdAgo: 'joined 11 weeks ago',
    lastActiveAgo: 'active 3h ago',
  },
];

const TEAM: AgencyWorkspaceData['team'] = [
  {
    id: 't-owner',
    name: 'You',
    email: 'you@northwind.agency',
    role: 'owner',
    lastActiveAgo: 'now',
    subClientsManaged: 8,
  },
  {
    id: 't-admin-1',
    name: 'Priya Anand',
    email: 'priya@northwind.agency',
    role: 'admin',
    lastActiveAgo: '12m ago',
    subClientsManaged: 3,
  },
  {
    id: 't-admin-2',
    name: 'Marc Hollis',
    email: 'marc@northwind.agency',
    role: 'admin',
    lastActiveAgo: '34m ago',
    subClientsManaged: 3,
  },
  {
    id: 't-member-1',
    name: 'Lia Soto',
    email: 'lia@northwind.agency',
    role: 'member',
    lastActiveAgo: '1h ago',
    subClientsManaged: 2,
  },
  {
    id: 't-member-2',
    name: 'Theo Park',
    email: 'theo@northwind.agency',
    role: 'member',
    lastActiveAgo: '4h ago',
    subClientsManaged: 1,
  },
];

const API_KEYS: AgencyWorkspaceData['apiKeys'] = [
  {
    id: 'ak-1',
    label: 'Production · Backend',
    masked: 'wp_live_••••_8Fk2',
    scope: 'admin',
    lastUsedAgo: '4m ago',
  },
  {
    id: 'ak-2',
    label: 'Reporting CRON',
    masked: 'wp_live_••••_Lp93',
    scope: 'read',
    lastUsedAgo: '38m ago',
  },
  {
    id: 'ak-3',
    label: 'Internal Dashboard',
    masked: 'wp_live_••••_Qx41',
    scope: 'write',
    lastUsedAgo: '2h ago',
  },
];

const WEBHOOKS: AgencyWorkspaceData['webhooks'] = [
  {
    id: 'wh-1',
    url: 'hooks.northwind.agency/warmpulse/events',
    events: ['mailbox.paused', 'warmth.alert', 'bounce.spike'],
    status: 'live',
  },
  {
    id: 'wh-2',
    url: 'ops.northwind.agency/slack/relay',
    events: ['peer.failed', 'dns.break'],
    status: 'paused',
  },
];

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind-agency',
  },
  features: {
    whiteLabel: {
      enabled: true,
      brandName: 'Northwind Mail Ops',
      hasLogo: true,
    },
    customDomain: {
      enabled: true,
      domain: 'mail.northwind.agency',
      status: 'verified',
    },
    dedicatedPool: {
      enabled: true,
      poolName: 'Northwind Premium Pool',
      memberCount: 412,
    },
  },
  subClients: SUB_CLIENTS,
  team: TEAM,
  apiKeys: API_KEYS,
  webhooks: WEBHOOKS,
};

// Skeleton fallback for the future live adapter — used when the API hasn't
// loaded yet (or has failed) so we don't render mock data the user might
// mistake for their own. Every collection is empty and features are off.
export const AGENCY_WORKSPACE_SKELETON_C1: AgencyWorkspaceData = {
  agency: {
    name: 'Your agency',
    plan: 'Agency',
    ownerEmail: '',
    region: 'us-east-1',
    slug: 'your-agency',
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
  accent: '#F26522', // healthy / high-trust
  accent4: '#ffd54f', // warming / caution
  accent3: '#ff6b4a', // at-risk / danger
  accent2: '#FF8A4B', // info / MRR pulse
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
  inactive: HEX.textFaint,
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
  inactive: 'Inactive',
};

const STATUS_BG: Record<SubClientStatus, string> = {
  healthy: 'bg-accent/10 border-accent/30 text-accent',
  warming: 'bg-accent4/10 border-accent4/30 text-accent4',
  at_risk: 'bg-accent3/10 border-accent3/30 text-accent3',
  inactive: 'bg-surface-2 border-border-muted text-text-faint',
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

const ROLE_RING: Record<TeamRole, string> = {
  owner: 'border-accent4/40 bg-accent4/10',
  admin: 'border-accent/30 bg-accent/10',
  member: 'border-border-muted bg-surface-2',
};

const DOMAIN_LABEL: Record<DomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending DNS',
  failed: 'DNS failed',
  not_set: 'Not configured',
};

const DOMAIN_TINT: Record<DomainStatus, string> = {
  verified: 'text-accent',
  pending: 'text-accent4',
  failed: 'text-accent3',
  not_set: 'text-text-dim',
};

/** SVG viewBox space — coordinate system the stage scales to fit. */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_PRIMARY = 308;
const RING_GUIDE_A = 188;
const RING_GUIDE_B = 408;
const CORE_R = 124;
/** Where the feature satellites ride on the core halo. */
const SATELLITE_R = CORE_R + 14;

interface PlacedNode {
  sub: AgencyWorkspaceData['subClients'][number];
  x: number;
  y: number;
  /** Outer node radius in viewBox units — scales with mailbox count. */
  r: number;
}

/**
 * Deterministic radial placement on a SINGLE ring.
 *
 * Nodes are spread evenly with angle = -90deg + index * (360 / count) so the
 * first node sits at the top of the ring and the rest walk clockwise. Node
 * radius scales linearly with mailbox count (clamped 26..50 in viewBox units).
 */
function place(subs: AgencyWorkspaceData['subClients']): PlacedNode[] {
  if (subs.length === 0) return [];
  const maxMb = Math.max(...subs.map((s) => s.mailboxCount), 1);
  const minMb = Math.min(...subs.map((s) => s.mailboxCount), 1);
  const span = Math.max(maxMb - minMb, 1);
  return subs.map((sub, i) => {
    const ang = (-90 + (360 / subs.length) * i) * (Math.PI / 180);
    const t = (sub.mailboxCount - minMb) / span; // 0..1
    const r = 26 + t * 24; // 26..50 in viewBox space
    return {
      sub,
      x: CX + RING_PRIMARY * Math.cos(ang),
      y: CY + RING_PRIMARY * Math.sin(ang),
      r,
    };
  });
}

// ---------------------------------------------------------------------------
// Small shared bits
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
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksC1Federation(
  { data }: { data?: AgencyWorkspaceData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const placed = useMemo(() => place(d.subClients), [d.subClients]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.sub.id === activeId)?.sub ?? null,
    [placed, activeId],
  );

  const healthyCount = useMemo(
    () => d.subClients.filter((sc) => sc.status === 'healthy').length,
    [d.subClients],
  );
  const totalSubs = d.subClients.length;
  const mrrTotal = useMemo(
    () => d.subClients.reduce((acc, sc) => acc + sc.monthlyMrrUsd, 0),
    [d.subClients],
  );
  const mailboxTotal = useMemo(
    () => d.subClients.reduce((acc, sc) => acc + sc.mailboxCount, 0),
    [d.subClients],
  );
  const liveWebhookCount = useMemo(
    () => d.webhooks.filter((w) => w.status === 'live').length,
    [d.webhooks],
  );

  return (
    <div className="space-y-5">
      {/* Page header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Network className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {d.agency.name}
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              {d.agency.plan}
            </Badge>
            <span className="rounded-full border border-border-muted bg-surface/60 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
              {d.agency.region}
            </span>
          </div>
          <p className="text-sm text-text-dim">
            {totalSubs} sub-clients · {d.team.length} team members ·{' '}
            <span className="font-mono text-text">
              {mailboxTotal}
            </span>{' '}
            mailboxes under management
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Healthy" value={`${healthyCount}/${totalSubs}`} accent />
          <StatChip label="MRR" value={formatMoney(mrrTotal)} />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Invite sub-client
          </button>
        </div>
      </motion.header>

      {/* Constellation canvas + inspector panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <FederationStage
            data={d}
            placed={placed}
            activeId={activeId}
            hoverId={hoverId}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <Legend />
          {/* Bottom rail INSIDE the stage card — team chips + API/webhook stat tiles */}
          <BottomRail
            data={d}
            liveWebhookCount={liveWebhookCount}
          />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            data={d}
            active={active}
            mrrTotal={mrrTotal}
            mailboxTotal={mailboxTotal}
            healthyCount={healthyCount}
            onClose={() => setActiveId(null)}
          />
        </div>
      </motion.div>
    </div>
  );
}

export default AgWksC1Federation;

// ---------------------------------------------------------------------------
// Federation stage (single-ring orbital SVG scene with feature satellites)
// ---------------------------------------------------------------------------

function FederationStage({
  data,
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: AgencyWorkspaceData;
  placed: PlacedNode[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Faint radar-screen dot grid */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
      >
        <defs>
          <pattern
            id="agwksc1-dotgrid"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill={HEX.border} fillOpacity={0.55} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agwksc1-dotgrid)" />
      </svg>

      {/* Soft accent bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent}1f` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Agency federation atlas: agency core with sub-client nodes in orbit and feature satellites on the core halo"
      >
        <defs>
          <radialGradient id="agwksc1-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.55} />
            <stop offset="55%" stopColor={HEX.accent2} stopOpacity={0.22} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="agwksc1-core-disc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22223a" stopOpacity={1} />
            <stop offset="100%" stopColor={HEX.surface2} stopOpacity={1} />
          </radialGradient>
          <linearGradient id="agwksc1-scan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.45} />
          </linearGradient>
        </defs>

        {/* Three concentric guide rings (dashed, low opacity) */}
        {[RING_GUIDE_A, RING_PRIMARY, RING_GUIDE_B].map((r, i) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={HEX.border}
            strokeOpacity={i === 1 ? 0.5 : 0.32}
            strokeWidth={i === 1 ? 1.2 : 1}
            strokeDasharray={i === 1 ? '3 9' : '2 10'}
          />
        ))}

        {/* Sweeping radar scan arc — slow continuous rotation */}
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - RING_GUIDE_B}
            stroke="url(#agwksc1-scan)"
            strokeWidth={3}
          />
        </motion.g>

        {/* Connecting lines: core → each sub-client node (drawn-in via pathLength) */}
        {placed.map((p, i) => {
          const focused = activeId === p.sub.id || hoverId === p.sub.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          const stroke = STATUS_HEX[p.sub.status];
          // stroke width encodes mailbox count
          const w = 1 + (p.sub.mailboxCount / 22) * 3;
          return (
            <g key={`l-${p.sub.id}`}>
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0.06 : focused ? 0.78 : 0.25}
                strokeWidth={focused ? w + 1.2 : w}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 0.9, delay: 0.18 + i * 0.06, ease: 'easeOut' },
                  opacity: { duration: 0.4, delay: 0.18 + i * 0.06 },
                }}
              />
              {/* Activity-flux dash travelling outward along the wire */}
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : 0.85}
                strokeWidth={focused ? 3 : 1.9}
                strokeLinecap="round"
                strokeDasharray="3 60"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -126 }}
                transition={{
                  duration: 2.8 + (i % 5) * 0.45,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Sub-client nodes (orbiting discs) */}
        {placed.map((p, i) => (
          <SubClientNode
            key={p.sub.id}
            placed={p}
            index={i}
            active={activeId === p.sub.id}
            hovered={hoverId === p.sub.id}
            faded={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.sub.id &&
              hoverId !== p.sub.id
            }
            onSelect={() => onSelect(p.sub.id === activeId ? null : p.sub.id)}
            onHover={onHover}
          />
        ))}

        {/* The agency core (centre of the federation) */}
        <CoreGlyph data={data} />

        {/* Feature satellites — three tiny chips orbiting the core halo */}
        <FeatureSatellites features={data.features} />
      </svg>

      {/* Empty-state overlay if no sub-clients exist */}
      {placed.length === 0 && (
        <div className="absolute inset-x-6 bottom-[120px] top-6 grid place-items-center">
          <div className="max-w-sm rounded-2xl border border-border-muted bg-surface-2/60 px-6 py-8 text-center backdrop-blur-xl">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent mx-auto">
              <Building2 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text">
              No sub-clients yet
            </p>
            <p className="mt-1 text-xs text-text-dim">
              Invite your first sub-client to start managing their warmup from
              this constellation.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-3.5 py-1.5 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Invite sub-client
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (centre — the "AGENCY" disc)
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyWorkspaceData }) {
  const planUpper = data.agency.plan.toUpperCase();
  return (
    <g>
      {/* Outer expanding pulse halo */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 4.2, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Outer soft bloom */}
      <circle cx={CX} cy={CY} r={CORE_R * 1.5} fill="url(#agwksc1-core)" />
      {/* Core disc */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="url(#agwksc1-core-disc)"
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Halo where feature satellites ride */}
      <circle
        cx={CX}
        cy={CY}
        r={SATELLITE_R}
        fill="none"
        stroke={HEX.accent}
        strokeOpacity={0.18}
        strokeWidth={1}
        strokeDasharray="2 6"
      />
      {/* Inner thin ring */}
      <circle
        cx={CX}
        cy={CY}
        r={CORE_R - 12}
        fill="none"
        stroke={HEX.accent}
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      {/* Crown glyph above name */}
      <foreignObject
        x={CX - 12}
        y={CY - 64}
        width={24}
        height={24}
      >
        <div className="flex h-full w-full items-center justify-center text-accent4">
          <Crown className="h-4 w-4" />
        </div>
      </foreignObject>
      {/* Eyebrow plan */}
      <text
        x={CX}
        y={CY - 34}
        textAnchor="middle"
        fill={HEX.textDim}
        style={{
          fontSize: 11,
          letterSpacing: 3,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {planUpper}
      </text>
      {/* Workspace name */}
      <text
        x={CX}
        y={CY - 10}
        textAnchor="middle"
        fill="#e8e8f0"
        style={{ fontSize: 19, fontWeight: 600 }}
      >
        {data.agency.name}
      </text>
      {/* Region pill (rendered as foreignObject so we can use Tailwind) */}
      <foreignObject
        x={CX - 70}
        y={CY + 6}
        width={140}
        height={26}
      >
        <div className="flex h-full w-full items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/80 px-2.5 py-0.5 font-mono text-[10px] text-text-dim">
            <Globe className="h-2.5 w-2.5" />
            {data.agency.region}
          </span>
        </div>
      </foreignObject>
      {/* Owner email */}
      <text
        x={CX}
        y={CY + 52}
        textAnchor="middle"
        fill={HEX.textFaint}
        style={{
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: 0.4,
        }}
      >
        {data.agency.ownerEmail || '—'}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Feature satellites — three small chips overlaid on the core halo.
// White-label · Custom domain · Dedicated pool. Distinctive feature of C1.
// ---------------------------------------------------------------------------

function FeatureSatellites({
  features,
}: {
  features: AgencyWorkspaceData['features'];
}) {
  // Place 3 chips at angles -135deg, -90deg-ish... actually we want them on the
  // top half of the halo so they read as "crown jewels" of the agency. Use
  // -150, -90, -30 (in degrees, where 0 = right, -90 = top).
  const chips: Array<{
    id: 'whiteLabel' | 'customDomain' | 'dedicatedPool';
    angleDeg: number;
    icon: typeof Palette;
    label: string;
    sub: string;
    enabled: boolean;
    tone: 'accent' | 'accent2' | 'accent4' | 'text-dim';
  }> = [
    {
      id: 'whiteLabel',
      angleDeg: -150,
      icon: Palette,
      label: 'White-label',
      sub: features.whiteLabel.enabled
        ? (features.whiteLabel.brandName ?? 'Branded')
        : 'Off',
      enabled: features.whiteLabel.enabled,
      tone: features.whiteLabel.enabled ? 'accent' : 'text-dim',
    },
    {
      id: 'customDomain',
      angleDeg: -90,
      icon: Globe,
      label: 'Custom domain',
      sub: features.customDomain.enabled
        ? (features.customDomain.domain ?? 'Pending')
        : 'Off',
      enabled: features.customDomain.enabled,
      tone:
        features.customDomain.status === 'verified'
          ? 'accent'
          : features.customDomain.status === 'pending'
            ? 'accent4'
            : features.customDomain.status === 'failed'
              ? 'accent2' // info-ish — domain failures route the user to fix DNS rather than alarm
              : 'text-dim',
    },
    {
      id: 'dedicatedPool',
      angleDeg: -30,
      icon: Shield,
      label: 'Dedicated pool',
      sub: features.dedicatedPool.enabled
        ? `${formatNumber(features.dedicatedPool.memberCount)} peers`
        : 'Off',
      enabled: features.dedicatedPool.enabled,
      tone: features.dedicatedPool.enabled ? 'accent2' : 'text-dim',
    },
  ];

  const TONE_HEX: Record<typeof chips[number]['tone'], string> = {
    accent: HEX.accent,
    accent2: HEX.accent2,
    accent4: HEX.accent4,
    'text-dim': HEX.textFaint,
  };

  return (
    <g>
      {chips.map((chip, i) => {
        const ang = chip.angleDeg * (Math.PI / 180);
        const sx = CX + SATELLITE_R * Math.cos(ang);
        const sy = CY + SATELLITE_R * Math.sin(ang);
        const color = TONE_HEX[chip.tone];
        return (
          <motion.g
            key={chip.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.5,
              delay: 0.55 + i * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ transformOrigin: `${sx}px ${sy}px` }}
          >
            {/* outer halo glow */}
            <circle
              cx={sx}
              cy={sy}
              r={26}
              fill={color}
              fillOpacity={0.12}
            />
            <circle
              cx={sx}
              cy={sy}
              r={20}
              fill={HEX.surface2}
              stroke={color}
              strokeOpacity={chip.enabled ? 0.7 : 0.3}
              strokeWidth={1.6}
            />
            <foreignObject
              x={sx - 12}
              y={sy - 12}
              width={24}
              height={24}
            >
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ color }}
              >
                <chip.icon className="h-3.5 w-3.5" />
              </div>
            </foreignObject>
            {/* status dot — verified = filled, pending = ring */}
            <circle
              cx={sx + 14}
              cy={sy - 14}
              r={4}
              fill={chip.enabled ? color : HEX.surface2}
              stroke={color}
              strokeWidth={1}
            />
            {/* Label sitting just outside the satellite, away from core */}
            <foreignObject
              x={sx - 64}
              y={sy + 22}
              width={128}
              height={36}
            >
              <div className="flex flex-col items-center text-center">
                <span
                  className="text-[10px] font-semibold uppercase leading-tight tracking-[0.18em]"
                  style={{ color }}
                >
                  {chip.label}
                </span>
                <span className="mt-0.5 truncate font-mono text-[10px] leading-tight text-text-dim">
                  {chip.sub}
                </span>
              </div>
            </foreignObject>
          </motion.g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-client node glyph (single-ring orbit nodes)
// ---------------------------------------------------------------------------

function SubClientNode({
  placed,
  index,
  active,
  hovered,
  faded,
  onSelect,
  onHover,
}: {
  placed: PlacedNode;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, r } = placed;
  const color = STATUS_HEX[sub.status];
  const lifted = active || hovered;
  const isAtRisk = sub.status === 'at_risk';

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: faded ? 0.3 : 1,
        scale: 1,
        // gentle outward lift toward the viewer on focus
        x: lifted ? (x - CX) * 0.035 : 0,
        y: lifted ? (y - CY) * 0.035 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: { duration: 0.5, delay: 0.3 + index * 0.06, ease: [0.22, 1, 0.36, 1] },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, ${sub.mailboxCount} mailboxes, status ${STATUS_LABEL[sub.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      {/* gentle vertical bob — alternates phase per node so the ring "breathes" */}
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -4 : 4, 0] }}
        transition={{
          duration: 5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* at-risk pulse ring — only fires for at_risk nodes */}
        {isAtRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={HEX.accent3}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{
              duration: 2.2,
              ease: 'easeOut',
              repeat: Infinity,
            }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* outer focus halo (only on hover/active) */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 10}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
        {/* soft inner glow */}
        <circle
          cx={x}
          cy={y}
          r={r + 5}
          fill={color}
          fillOpacity={lifted ? 0.24 : 0.14}
        />
        {/* avatar disc */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.6 : 1.7}
        />
        {/* logoChar — centred avatar text */}
        <text
          x={x}
          y={y + r * 0.28}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.7,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {sub.logoChar}
        </text>
        {/* name label below the disc */}
        <text
          x={x}
          y={y + r + 22}
          textAnchor="middle"
          fill={lifted ? '#e8e8f0' : HEX.textDim}
          style={{
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {sub.name}
        </text>
        {/* mailbox + team chip — pill shape under the name */}
        <g>
          <rect
            x={x - 36}
            y={y + r + 30}
            width={72}
            height={18}
            rx={9}
            fill={HEX.surface2}
            stroke={color}
            strokeOpacity={lifted ? 0.55 : 0.32}
            strokeWidth={1}
          />
          <text
            x={x}
            y={y + r + 43}
            textAnchor="middle"
            fill={color}
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: 0.4,
            }}
          >
            {sub.mailboxCount}mb · {sub.teamCount}usr
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
  const items: Array<{ status: SubClientStatus; label: string }> = [
    { status: 'healthy', label: 'Healthy' },
    { status: 'warming', label: 'Warming' },
    { status: 'at_risk', label: 'At risk' },
    { status: 'inactive', label: 'Inactive' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.95 }}
      className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        <Activity className="h-3 w-3 text-accent" />
        Sub-client status
      </span>
      {items.map((it) => (
        <span key={it.status} className="flex items-center gap-2 text-xs text-text">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_HEX[it.status] }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Users className="h-3 w-3 text-accent" />
        Node size = mailbox count
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — team chips + API key / webhook stat tiles INSIDE the canvas
// ---------------------------------------------------------------------------

function BottomRail({
  data,
  liveWebhookCount,
}: {
  data: AgencyWorkspaceData;
  liveWebhookCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.55 }}
      className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border-muted bg-surface/85 px-3.5 py-2.5 backdrop-blur-xl md:flex-nowrap"
    >
      {/* Team chips */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          <Users className="h-3 w-3 text-accent" />
          Team
        </span>
        {data.team.length === 0 ? (
          <span className="text-xs text-text-dim">
            No team members yet.
          </span>
        ) : (
          data.team.map((member) => (
            <TeamPill key={member.id} member={member} />
          ))
        )}
      </div>
      <div className="hidden h-9 w-px shrink-0 bg-border-muted md:block" aria-hidden />
      {/* API keys + webhooks mini stats */}
      <div className="flex shrink-0 items-center gap-2">
        <MiniStatTile
          icon={Key}
          label="API keys"
          value={String(data.apiKeys.length)}
        />
        <MiniStatTile
          icon={Webhook}
          label="Webhooks"
          value={`${liveWebhookCount}/${data.webhooks.length}`}
          sub="live"
        />
      </div>
    </motion.div>
  );
}

function TeamPill({
  member,
}: {
  member: AgencyWorkspaceData['team'][number];
}) {
  const ring = ROLE_RING[member.role];
  const tint = ROLE_TINT[member.role];
  // last active dot: <30m green, <2h yellow, otherwise faint
  const ago = member.lastActiveAgo;
  const dot = ago === 'now' || ago.endsWith('m ago')
    ? 'bg-accent'
    : ago.startsWith('1h') || ago.startsWith('2h') || ago.includes('h ago')
      ? 'bg-accent4'
      : 'bg-text-faint';
  const initials = member.name
    .split(' ')
    .map((s) => s.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`group relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${ring}`}
      title={`${member.name} (${ROLE_LABEL[member.role]}) · ${member.email} · last active ${member.lastActiveAgo} · manages ${member.subClientsManaged} sub-clients`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-muted bg-surface-2 font-mono text-[9px] font-semibold ${tint}`}
      >
        {initials}
      </span>
      <span className="font-medium text-text">{member.name}</span>
      <span className={`font-mono text-[10px] ${tint}`}>
        {ROLE_LABEL[member.role]}
      </span>
      <span
        className={`h-1.5 w-1.5 rounded-full ${dot}`}
        aria-label={`last active ${member.lastActiveAgo}`}
      />
    </span>
  );
}

function MiniStatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Key;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2/70 px-3 py-1.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-text">
          {value}
          {sub && (
            <span className="ml-1 text-[10px] font-normal text-text-dim">
              {sub}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel (right column — empty state OR selected sub-client detail)
// ---------------------------------------------------------------------------

function InspectorPanel({
  data,
  active,
  mrrTotal,
  mailboxTotal,
  healthyCount,
  onClose,
}: {
  data: AgencyWorkspaceData;
  active: AgencyWorkspaceData['subClients'][number] | null;
  mrrTotal: number;
  mailboxTotal: number;
  healthyCount: number;
  onClose: () => void;
}) {
  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            // overflow-y-auto inside an overflow-hidden shell: the inner content
            // scrolls while the slide-in/out animation still clips cleanly at
            // the panel edge. overscroll-contain stops page rubber-banding.
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <SubClientCard
              sub={active}
              data={data}
              onClose={onClose}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <PortfolioOverview
              data={data}
              mrrTotal={mrrTotal}
              mailboxTotal={mailboxTotal}
              healthyCount={healthyCount}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — empty state ("Portfolio overview" with KPI strip)
// ---------------------------------------------------------------------------

function PortfolioOverview({
  data,
  mrrTotal,
  mailboxTotal,
  healthyCount,
}: {
  data: AgencyWorkspaceData;
  mrrTotal: number;
  mailboxTotal: number;
  healthyCount: number;
}) {
  const warmingCount = data.subClients.filter((sc) => sc.status === 'warming').length;
  const atRiskCount = data.subClients.filter((sc) => sc.status === 'at_risk').length;
  const inactiveCount = data.subClients.filter((sc) => sc.status === 'inactive').length;
  // Top 3 sub-clients by MRR for the leaderboard preview
  const topByMrr = useMemo(
    () =>
      [...data.subClients]
        .sort((a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd)
        .slice(0, 3),
    [data.subClients],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">
            Portfolio overview
          </h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Select any sub-client node to manage their account.
        </p>
      </header>

      <div className="space-y-3 p-5">
        <OverviewRow
          icon={Building2}
          label="Sub-clients"
          value={String(data.subClients.length)}
          sub={`${healthyCount} healthy · ${warmingCount} warming · ${atRiskCount} at risk${
            inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ''
          }`}
        />
        <OverviewRow
          icon={Inbox}
          label="Mailboxes under management"
          value={String(mailboxTotal)}
          sub="across the whole portfolio"
        />
        <OverviewRow
          icon={DollarSign}
          label="Portfolio MRR"
          value={formatMoney(mrrTotal)}
          sub="combined monthly recurring"
          tone="accent2"
        />
      </div>

      {/* Top sub-clients by MRR */}
      <div className="border-t border-white/5 px-5 py-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-accent4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Top accounts by MRR
          </span>
        </div>
        {topByMrr.length === 0 ? (
          <p className="rounded-xl border border-border-muted bg-surface-2/40 px-4 py-6 text-center text-xs text-text-dim">
            No sub-clients yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {topByMrr.map((sc, i) => {
              const color = STATUS_HEX[sc.status];
              return (
                <li
                  key={sc.id}
                  className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
                >
                  <span className="font-mono text-[11px] text-text-faint w-3">
                    {i + 1}
                  </span>
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold text-bg"
                    style={{ background: color }}
                    aria-hidden
                  >
                    {sc.logoChar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text">
                      {sc.name}
                    </p>
                    <p className="font-mono text-[10px] text-text-dim">
                      {sc.plan} · {sc.mailboxCount} mailboxes
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums text-accent2">
                    {formatMoney(sc.monthlyMrrUsd)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Agency features summary */}
      <div className="mt-auto border-t border-white/5 px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Agency features
            </span>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2/60 px-2 py-1 text-[10px] text-text-dim transition-colors hover:text-text"
          >
            <Settings className="h-3 w-3" />
            Manage
          </button>
        </div>
        <FeatureSummary features={data.features} />
      </div>
    </div>
  );
}

function FeatureSummary({
  features,
}: {
  features: AgencyWorkspaceData['features'];
}) {
  return (
    <ul className="space-y-2">
      <FeatureRow
        icon={Palette}
        label="White-label"
        enabled={features.whiteLabel.enabled}
        detail={
          features.whiteLabel.enabled
            ? `Branded as ${features.whiteLabel.brandName ?? '—'}${
                features.whiteLabel.hasLogo ? ' · custom logo' : ''
              }`
            : 'Replace WarmPulse branding with yours'
        }
      />
      <FeatureRow
        icon={Globe}
        label="Custom domain"
        enabled={features.customDomain.enabled}
        detail={
          features.customDomain.enabled
            ? `${features.customDomain.domain ?? '—'} · ${
                DOMAIN_LABEL[features.customDomain.status]
              }`
            : 'Serve the portal on your own host'
        }
        statusTone={
          features.customDomain.enabled
            ? DOMAIN_TINT[features.customDomain.status]
            : undefined
        }
      />
      <FeatureRow
        icon={Shield}
        label="Dedicated peer pool"
        enabled={features.dedicatedPool.enabled}
        detail={
          features.dedicatedPool.enabled
            ? `${features.dedicatedPool.poolName ?? 'Private pool'} · ${formatNumber(features.dedicatedPool.memberCount)} peers`
            : 'Isolate your sub-clients from the shared pool'
        }
      />
    </ul>
  );
}

function FeatureRow({
  icon: Icon,
  label,
  enabled,
  detail,
  statusTone,
}: {
  icon: typeof Palette;
  label: string;
  enabled: boolean;
  detail: string;
  statusTone?: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          enabled ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-text-faint'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text">{label}</span>
          {enabled ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <Check className="h-3 w-3" />
              On
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              <X className="h-3 w-3" />
              Off
            </span>
          )}
        </div>
        <p
          className={`mt-0.5 text-xs ${statusTone ?? 'text-text-dim'}`}
        >
          {detail}
        </p>
      </div>
    </li>
  );
}

function OverviewRow({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  sub: string;
  tone?: 'text' | 'accent' | 'accent2';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-text';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface-2/40 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-dim">{label}</p>
        <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${valueTone}`}>
          {value}
        </p>
        <p className="text-xs text-text-dim">{sub}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — selected sub-client management card
// ---------------------------------------------------------------------------

function SubClientCard({
  sub,
  data,
  onClose,
}: {
  sub: AgencyWorkspaceData['subClients'][number];
  data: AgencyWorkspaceData;
  onClose: () => void;
}) {
  const color = STATUS_HEX[sub.status];
  const inviteUrl = `https://app.warmpulse.io/invite/${data.agency.slug}/${sub.id}`;
  // Which team members manage this sub-client. The shape only tracks the
  // count per member so we surface a heuristic: the top N owners/admins by
  // subClientsManaged are the most likely to be on this account.
  const likelyManagers = useMemo(
    () =>
      [...data.team]
        .filter((m) => m.subClientsManaged > 0)
        .sort((a, b) => b.subClientsManaged - a.subClientsManaged)
        .slice(0, 3),
    [data.team],
  );

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl font-mono text-base font-bold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{sub.name}</p>
            <p className="truncate font-mono text-[11px] text-text-dim">
              {sub.ownerEmail}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="More actions"
            className="grid h-7 w-7 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="grid h-7 w-7 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {/* Top badge row: plan + status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-0.5 text-[11px] font-medium text-accent3">
            <Sparkles className="h-3 w-3" />
            {sub.plan}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BG[sub.status]}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            {STATUS_LABEL[sub.status]}
          </span>
          <span className="ml-auto font-mono text-[10px] text-text-faint">
            {sub.createdAgo}
          </span>
        </div>

        {/* Warmth headline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                Avg warmth
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold leading-none tabular-nums"
                style={{ color }}
              >
                {sub.avgWarmth}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-text-dim">
                {sub.lastActiveAgo}
              </p>
              <p className="mt-0.5 text-[10px] text-text-faint">
                last activity
              </p>
            </div>
          </div>
          {/* Warmth progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${sub.avgWarmth}%` }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Mailbox + team + MRR cells */}
        <div className="grid grid-cols-3 gap-2.5">
          <MetricCell
            icon={Inbox}
            label="Mailboxes"
            value={String(sub.mailboxCount)}
          />
          <MetricCell
            icon={Users}
            label="Team"
            value={String(sub.teamCount)}
          />
          <MetricCell
            icon={DollarSign}
            label="MRR"
            value={formatMoney(sub.monthlyMrrUsd)}
            tone="accent2"
          />
        </div>

        {/* Actions row */}
        <div className="grid grid-cols-2 gap-2.5">
          <ActionButton icon={Mail} label="View mailboxes" primary />
          <ActionButton icon={Users} label="View team" />
          <ActionButton icon={Settings} label="Rename account" />
          <ActionButton icon={Copy} label="Copy invite link" />
        </div>

        {/* Invite link preview */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Invite URL
          </p>
          <p className="truncate font-mono text-[11px] text-text-dim">
            {inviteUrl}
          </p>
        </div>

        {/* Team managers chip */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              <Users className="h-3.5 w-3.5 text-accent" />
              Custom team
            </span>
            <span className="font-mono text-[10px] text-text-faint">
              {likelyManagers.length} assigned
            </span>
          </div>
          {likelyManagers.length === 0 ? (
            <p className="rounded-lg border border-border-muted bg-surface px-3 py-3 text-center text-xs text-text-dim">
              No managers assigned yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {likelyManagers.map((m) => {
                const tint = ROLE_TINT[m.role];
                const initials = m.name
                  .split(' ')
                  .map((s) => s.charAt(0))
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <span
                    key={m.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${ROLE_RING[m.role]}`}
                    title={`${m.name} — ${ROLE_LABEL[m.role]}`}
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full bg-surface-2 font-mono text-[8px] font-semibold ${tint}`}
                    >
                      {initials}
                    </span>
                    <span className="text-text">{m.name.split(' ')[0] ?? m.name}</span>
                    <span className={`font-mono text-[10px] ${tint}`}>
                      {ROLE_LABEL[m.role]}
                    </span>
                  </span>
                );
              })}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-muted px-2 py-1 text-[11px] text-text-dim transition-colors hover:text-text"
                aria-label="Add manager"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          )}
        </div>

        {/* At-risk callout — only renders for at_risk sub-clients */}
        {sub.status === 'at_risk' && (
          <div className="rounded-xl border border-accent3/30 bg-accent3/10 p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent3/15 text-accent3">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-accent3">
                  Account at risk
                </p>
                <p className="mt-0.5 text-xs text-text-dim">
                  Warmth has dropped below the safe threshold. Review their
                  mailboxes and DNS configuration before scheduling more sends.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent3/40 bg-accent3/15 px-2 py-1 text-[11px] font-medium text-accent3 transition-colors hover:bg-accent3/25"
              >
                Investigate
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function MetricCell({
  icon: Icon,
  label,
  value,
  tone = 'text',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  tone?: 'text' | 'accent' | 'accent2';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-text';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`font-mono text-base font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  primary,
}: {
  icon: typeof Mail;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        primary
          ? 'border-accent/30 bg-accent/15 text-accent hover:bg-accent/25'
          : 'border-border-muted bg-surface-2/60 text-text hover:bg-surface-2'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// API key / webhook detail rows are not used at the page top-level — the
// inspector panel is the right home for them, and the bottom rail surfaces
// only the COUNT. The eventual /app/workspace/api and /workspace/webhooks
// sub-pages will render scope pills + event lists; this surface intentionally
// stays focused on the federation overview.
// ---------------------------------------------------------------------------
