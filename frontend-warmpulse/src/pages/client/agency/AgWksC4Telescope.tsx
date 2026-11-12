import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  Globe,
  Key,
  Mail,
  Network,
  Pencil,
  Plus,
  Radio,
  Send,
  Shield,
  Sparkles,
  Telescope,
  Trash2,
  UserCog,
  Users,
  Webhook,
  X,
  ZapOff,
} from 'lucide-react';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksC4Telescope — Agency-tier WORKSPACE surface, "Telescope view"
 * candidate C4 of four. NOT a sub-client overview grid — a FOCUSED
 * drill-in to one sub-client at a time. Navigation is a horizontally
 * scrolling carousel of sub-client pill-tabs at the top; the centre
 * canvas zooms in like a telescope on whichever pill is selected,
 * rendering the picked sub-client as a pulsing centre node ringed by
 * its mailbox dots, with a deep inspector panel on the right.
 *
 * Distinguishing concept from the other 3 Agency-workspace candidates:
 * the canvas is a SINGLE-account microscope, not a fleet overview. The
 * carousel is the navigation; switching pills smoothly animates the
 * centre node + orbit ring in / out via AnimatePresence.
 *
 * Layout
 *   - Page header: agency name + plan + 3 Agency feature chips
 *     (white-label / custom domain / dedicated pool — each clickable to
 *     open a config modal).
 *   - Carousel rail: horizontal scrolling list of sub-client pill-tabs,
 *     each pill shows logoChar + name + status dot + mailbox count.
 *   - Telescope canvas (lg:col-span-7): zoomed-in spatial view of the
 *     selected sub-client — pulsing centre node, faint dashed orbit ring,
 *     mailbox dots on the ring, team chip overlay.
 *   - Inspector panel (lg:col-span-5): account card with owner, plan,
 *     MRR, branding state, domain status, DNS triad, recent activity,
 *     action buttons.
 *   - Bottom strip: agency team / API keys / webhooks as compact tiles.
 *
 * Fully STANDALONE — no imports from `@/features/*`, no router, no
 * query hooks, no required props. Every value comes from the inline
 * MOCK so the preview harness can mount it prop-less. Renders only
 * page content; the app shell supplies the chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes — shared across all 4 Agency-workspace candidates.
// Keep in sync if any field shape changes.
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
// MOCK data — Northwind Agency, 8 sub-clients, 5 team members, 3 API keys,
// 2 webhooks. 5 healthy + 2 warming + 1 at_risk to give the carousel pills
// enough status-dot variety to read at a glance.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyWorkspaceData['subClients'] = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    ownerEmail: 'founder@lumen.io',
    plan: 'Pro Plus',
    mailboxCount: 14,
    teamCount: 4,
    avgWarmth: 88,
    status: 'healthy',
    monthlyMrrUsd: 720,
    createdAgo: '8 mo ago',
    lastActiveAgo: '12s ago',
  },
  {
    id: 'sc-aria',
    name: 'Aria Studio',
    logoChar: 'AR',
    ownerEmail: 'hello@aria.studio',
    plan: 'Pro Plus',
    mailboxCount: 18,
    teamCount: 6,
    avgWarmth: 91,
    status: 'healthy',
    monthlyMrrUsd: 900,
    createdAgo: '11 mo ago',
    lastActiveAgo: '24s ago',
  },
  {
    id: 'sc-acme',
    name: 'Acme Outreach',
    logoChar: 'AC',
    ownerEmail: 'success@acme.io',
    plan: 'Pro',
    mailboxCount: 9,
    teamCount: 3,
    avgWarmth: 76,
    status: 'healthy',
    monthlyMrrUsd: 450,
    createdAgo: '6 mo ago',
    lastActiveAgo: '38s ago',
  },
  {
    id: 'sc-bramble',
    name: 'Bramble & Co',
    logoChar: 'BC',
    ownerEmail: 'team@brambleco.com',
    plan: 'Pro',
    mailboxCount: 6,
    teamCount: 2,
    avgWarmth: 62,
    status: 'warming',
    monthlyMrrUsd: 300,
    createdAgo: '3 mo ago',
    lastActiveAgo: '1m ago',
  },
  {
    id: 'sc-vela',
    name: 'Vela Ventures',
    logoChar: 'VV',
    ownerEmail: 'partners@vela.vc',
    plan: 'Pro Plus',
    mailboxCount: 22,
    teamCount: 8,
    avgWarmth: 84,
    status: 'healthy',
    monthlyMrrUsd: 1080,
    createdAgo: '1 y ago',
    lastActiveAgo: '6s ago',
  },
  {
    id: 'sc-pivot',
    name: 'Pivot Sales',
    logoChar: 'PS',
    ownerEmail: 'ops@pivot-sales.io',
    plan: 'Pro',
    mailboxCount: 5,
    teamCount: 2,
    avgWarmth: 41,
    status: 'at_risk',
    monthlyMrrUsd: 200,
    createdAgo: '2 mo ago',
    lastActiveAgo: '4m ago',
  },
  {
    id: 'sc-orbit',
    name: 'Orbit Reply',
    logoChar: 'OR',
    ownerEmail: 'demo@orbit.reply',
    plan: 'Pro Plus',
    mailboxCount: 11,
    teamCount: 4,
    avgWarmth: 81,
    status: 'healthy',
    monthlyMrrUsd: 540,
    createdAgo: '7 mo ago',
    lastActiveAgo: '18s ago',
  },
  {
    id: 'sc-quill',
    name: 'Quill & Quartz',
    logoChar: 'QQ',
    ownerEmail: 'editor@quill.studio',
    plan: 'Pro',
    mailboxCount: 7,
    teamCount: 3,
    avgWarmth: 58,
    status: 'warming',
    monthlyMrrUsd: 360,
    createdAgo: '4 mo ago',
    lastActiveAgo: '52s ago',
  },
];

const TEAM: AgencyWorkspaceData['team'] = [
  {
    id: 'tm-1',
    name: 'Nora Vance',
    email: 'nora@northwind.agency',
    role: 'owner',
    lastActiveAgo: '2m ago',
    subClientsManaged: 8,
  },
  {
    id: 'tm-2',
    name: 'Felix Park',
    email: 'felix@northwind.agency',
    role: 'admin',
    lastActiveAgo: '11m ago',
    subClientsManaged: 5,
  },
  {
    id: 'tm-3',
    name: 'Indira Sato',
    email: 'indira@northwind.agency',
    role: 'admin',
    lastActiveAgo: '38m ago',
    subClientsManaged: 3,
  },
  {
    id: 'tm-4',
    name: 'Mateo Reyes',
    email: 'mateo@northwind.agency',
    role: 'member',
    lastActiveAgo: '1h ago',
    subClientsManaged: 2,
  },
  {
    id: 'tm-5',
    name: 'Priya Khatri',
    email: 'priya@northwind.agency',
    role: 'member',
    lastActiveAgo: '3h ago',
    subClientsManaged: 2,
  },
];

const API_KEYS: AgencyWorkspaceData['apiKeys'] = [
  {
    id: 'ak-1',
    label: 'CRM sync — Hubspot',
    masked: 'wp_live_••••_8a92',
    scope: 'read',
    lastUsedAgo: '4m ago',
  },
  {
    id: 'ak-2',
    label: 'Internal automation',
    masked: 'wp_live_••••_42f1',
    scope: 'write',
    lastUsedAgo: '1h ago',
  },
  {
    id: 'ak-3',
    label: 'Provisioning bot',
    masked: 'wp_live_••••_d77c',
    scope: 'admin',
    lastUsedAgo: '11h ago',
  },
];

const WEBHOOKS: AgencyWorkspaceData['webhooks'] = [
  {
    id: 'wh-1',
    url: 'https://api.northwind.agency/hooks/warmup-events',
    events: ['mailbox.connected', 'mailbox.paused', 'peer.replaced'],
    status: 'live',
  },
  {
    id: 'wh-2',
    url: 'https://hooks.zapier.com/hooks/catch/0421/u4Xp',
    events: ['alert.critical', 'subclient.created'],
    status: 'paused',
  },
];

export const AGENCY_WORKSPACE_SKELETON_C4: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind',
  },
  features: {
    whiteLabel: {
      enabled: true,
      brandName: 'Northwind Mailcraft',
      hasLogo: true,
    },
    customDomain: {
      enabled: true,
      domain: 'app.northwind.agency',
      status: 'verified',
    },
    dedicatedPool: {
      enabled: true,
      poolName: 'northwind-private-pool',
      memberCount: 1240,
    },
  },
  subClients: SUB_CLIENTS,
  team: TEAM,
  apiKeys: API_KEYS,
  webhooks: WEBHOOKS,
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers — inline SVG fills must match the className tokens.
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522', // brand violet
  accent2: '#FF8A4B', // cyan — live / motion
  accent3: '#ff6b4a', // red — at-risk / failed
  accent4: '#ffd54f', // amber — warming / pending
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#8888a0',
  text: '#e8e8f0',
} as const;

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
  inactive: HEX.textDim,
};

const STATUS_TEXT_CLASS: Record<SubClientStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
  inactive: 'text-text-dim',
};

const STATUS_BORDER_CLASS: Record<SubClientStatus, string> = {
  healthy: 'border-accent/40',
  warming: 'border-accent4/40',
  at_risk: 'border-accent3/40',
  inactive: 'border-border-muted',
};

const STATUS_BG_CLASS: Record<SubClientStatus, string> = {
  healthy: 'bg-accent/10',
  warming: 'bg-accent4/10',
  at_risk: 'bg-accent3/10',
  inactive: 'bg-surface-2/30',
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
  inactive: 'Inactive',
};

const DOMAIN_LABEL: Record<DomainStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  failed: 'Failed',
  not_set: 'Not set',
};

const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const ROLE_TEXT_CLASS: Record<TeamRole, string> = {
  owner: 'text-accent2',
  admin: 'text-accent',
  member: 'text-text',
};

const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  read: 'Read',
  write: 'Write',
  admin: 'Admin',
};

const SCOPE_BG_CLASS: Record<ApiKeyScope, string> = {
  read: 'bg-accent2/10 text-accent2 border-accent2/30',
  write: 'bg-accent/10 text-accent border-accent/30',
  admin: 'bg-accent3/10 text-accent3 border-accent3/30',
};

// SVG geometry — fixed-coordinate viewbox the canvas scales to fit.
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_R = 320;
const CORE_R = 110;
// Mailbox dot radius
const DOT_R = 12;

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

interface MailboxDot {
  index: number;
  x: number;
  y: number;
  /** 0..1 warmth shading factor for individual dot — derived deterministically
   *  from index + parent avgWarmth so each render is stable. */
  warmthFactor: number;
}

/** Place N mailbox dots evenly around the ring, starting from the top. */
function placeMailboxDots(count: number, parentWarmth: number): MailboxDot[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const ang = (-90 + (360 / Math.max(count, 1)) * i) * (Math.PI / 180);
    // Per-dot warmth wobble around parent avgWarmth, deterministic on index.
    const wobble = ((i * 17) % 11) - 5; // -5..+5
    const w = Math.max(0, Math.min(100, parentWarmth + wobble));
    return {
      index: i,
      x: CX + RING_R * Math.cos(ang),
      y: CY + RING_R * Math.sin(ang),
      warmthFactor: w / 100,
    };
  });
}

/** Pick the colour for a mailbox dot based on its derived warmth tier. */
function dotColor(factor: number): string {
  if (factor >= 0.75) return HEX.accent;
  if (factor >= 0.5) return HEX.accent4;
  return HEX.accent3;
}

/**
 * Pulse cadence: bigger fleets pulse faster (more activity).
 * At-risk overrides cadence to a faster, more urgent beat so the
 * eye lands on it first regardless of fleet size.
 */
function pulseDurationFor(sub: AgencyWorkspaceData['subClients'][number]): number {
  if (sub.status === 'at_risk') return 1.4;
  if (sub.status === 'inactive') return 4.4;
  const vol = Math.min(1, sub.mailboxCount / 22);
  return 3.6 - vol * 1.6; // 2.0–3.6s
}

/**
 * Synthesised sends-per-minute for the focused sub-client — proportional
 * to mailbox count, weighted by status. Used in the inspector activity rail.
 */
function sendsPerMinute(sub: AgencyWorkspaceData['subClients'][number]): number {
  const weight =
    sub.status === 'healthy'
      ? 1.0
      : sub.status === 'warming'
        ? 0.55
        : sub.status === 'at_risk'
          ? 0.25
          : 0.05;
  return Math.max(1, Math.round(sub.mailboxCount * 1.4 * weight));
}

/**
 * Deterministic recent-activity feed for a sub-client. Mocked, internally
 * consistent — uses the sub-client name + index parity to vary kinds so
 * each pill click produces a fresh-looking inspector.
 */
type ActivityKind = 'send' | 'reply' | 'engagement' | 'alert' | 'connection';

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  message: string;
  ago: string;
}

function recentActivity(
  sub: AgencyWorkspaceData['subClients'][number],
): ActivityRow[] {
  const isAtRisk = sub.status === 'at_risk';
  const isWarming = sub.status === 'warming';
  const localEmail = sub.ownerEmail;
  const base: ActivityRow[] = [
    {
      id: 'a1',
      kind: 'send',
      message: `${localEmail} → peer pool · thread "Q3 intro" started`,
      ago: '12s ago',
    },
    {
      id: 'a2',
      kind: 'reply',
      message: 'peer reply landed inbox — engagement +3',
      ago: '38s ago',
    },
    {
      id: 'a3',
      kind: 'engagement',
      message: 'peer starred thread "Demo follow-up"',
      ago: '1m ago',
    },
    {
      id: 'a4',
      kind: 'send',
      message: `${localEmail} → peer pool · thread "Catch-up" started`,
      ago: '2m ago',
    },
    {
      id: 'a5',
      kind: 'reply',
      message: 'spam-rescue triggered · returned to inbox',
      ago: '6m ago',
    },
    {
      id: 'a6',
      kind: 'connection',
      message: `${sub.mailboxCount} mailboxes connected · ramp day 18`,
      ago: '24m ago',
    },
  ];
  if (isAtRisk) {
    return [
      {
        id: 'a-risk',
        kind: 'alert',
        message: '2 mailboxes paused — bounce-rate ceiling tripped',
        ago: '4m ago',
      },
      {
        id: 'a-risk-2',
        kind: 'alert',
        message: 'DMARC failing on outbound.pivot-sales.io',
        ago: '11m ago',
      },
      ...base.slice(0, 4),
    ];
  }
  if (isWarming) {
    return [
      {
        id: 'a-warm',
        kind: 'engagement',
        message: 'warmth climbing — +8 over last 7 days',
        ago: '3m ago',
      },
      ...base,
    ];
  }
  return base;
}

const ACTIVITY_ICON: Record<ActivityKind, typeof Send> = {
  send: Send,
  reply: Mail,
  engagement: Sparkles,
  alert: AlertTriangle,
  connection: Network,
};

const ACTIVITY_COLOR_CLASS: Record<ActivityKind, string> = {
  send: 'text-accent2',
  reply: 'text-accent',
  engagement: 'text-accent4',
  alert: 'text-accent3',
  connection: 'text-text-dim',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksC4Telescope({
  data,
}: {
  data?: AgencyWorkspaceData;
} = {}): JSX.Element {
  const d = data ?? AGENCY_WORKSPACE_SKELETON_C4;
  const firstId = d.subClients[0]?.id ?? null;
  const [selectedSubClientId, setSelectedSubClientId] = useState<string | null>(
    firstId,
  );
  const [featureModal, setFeatureModal] = useState<
    'whiteLabel' | 'customDomain' | 'dedicatedPool' | null
  >(null);

  const selected = useMemo(
    () => d.subClients.find((s) => s.id === selectedSubClientId) ?? null,
    [d.subClients, selectedSubClientId],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        d={d}
        onOpenFeature={setFeatureModal}
      />

      <Carousel
        subClients={d.subClients}
        selectedId={selectedSubClientId}
        onSelect={setSelectedSubClientId}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-7">
          <TelescopeCanvas selected={selected} d={d} />
        </div>
        <div className="lg:col-span-5">
          <Inspector selected={selected} d={d} />
        </div>
      </motion.div>

      <BottomStrip d={d} />

      <FeatureModal
        open={featureModal}
        d={d}
        onClose={() => setFeatureModal(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header — agency name + plan badge + 3 Agency feature chips.
// Feature chips are clickable buttons that open the FeatureModal.
// ---------------------------------------------------------------------------

function PageHeader({
  d,
  onOpenFeature,
}: {
  d: AgencyWorkspaceData;
  onOpenFeature: (
    f: 'whiteLabel' | 'customDomain' | 'dedicatedPool' | null,
  ) => void;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
              <Telescope className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {d.agency.name}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2.5 py-0.5 text-[11px] font-medium text-accent2">
              <Crown className="h-3 w-3" />
              {d.agency.plan}
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Telescope view — pick a sub-client below to zoom in. Owner{' '}
            <span className="font-mono text-text">{d.agency.ownerEmail}</span>{' '}
            · region{' '}
            <span className="font-mono text-text">{d.agency.region}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FeatureChip
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="White-label"
            enabled={d.features.whiteLabel.enabled}
            hint={d.features.whiteLabel.brandName ?? 'Not configured'}
            onClick={() => onOpenFeature('whiteLabel')}
          />
          <FeatureChip
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Custom domain"
            enabled={d.features.customDomain.enabled}
            hint={d.features.customDomain.domain ?? 'No domain assigned'}
            onClick={() => onOpenFeature('customDomain')}
          />
          <FeatureChip
            icon={<Network className="h-3.5 w-3.5" />}
            label="Dedicated pool"
            enabled={d.features.dedicatedPool.enabled}
            hint={
              d.features.dedicatedPool.poolName ?? 'Shared pool'
            }
            onClick={() => onOpenFeature('dedicatedPool')}
          />
        </div>
      </div>
    </motion.header>
  );
}

function FeatureChip({
  icon,
  label,
  enabled,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  hint: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={`group flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-left text-xs backdrop-blur-xl transition-colors ${
        enabled
          ? 'border-accent2/30 bg-accent2/5 hover:bg-accent2/10'
          : 'border-border-muted bg-surface/60 hover:bg-surface-2/60'
      }`}
      aria-label={`${label} — ${enabled ? 'enabled' : 'disabled'}, ${hint}`}
    >
      <span
        className={
          enabled ? 'text-accent2' : 'text-text-dim group-hover:text-text'
        }
      >
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-text">{label}</span>
        <span
          className={`max-w-[14ch] truncate font-mono text-[10px] ${
            enabled ? 'text-accent2' : 'text-text-dim'
          }`}
        >
          {hint}
        </span>
      </span>
      <ChevronRight className="h-3 w-3 text-text-dim transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Carousel — horizontal scrolling pill-tabs for sub-clients
// ---------------------------------------------------------------------------

function Carousel({
  subClients,
  selectedId,
  onSelect,
}: {
  subClients: AgencyWorkspaceData['subClients'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollerHover, setScrollerHover] = useState(false);

  const scrollBy = (delta: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/60 p-3 backdrop-blur-xl"
      onMouseEnter={() => setScrollerHover(true)}
      onMouseLeave={() => setScrollerHover(false)}
    >
      {/* Dot-grid bg motif so the carousel feels of-a-piece with the canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(113, 113, 122,0.18) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 pr-2">
          <Building2 className="h-3.5 w-3.5 text-accent2" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            Sub-clients · {subClients.length}
          </span>
        </div>

        {/* Scroll buttons */}
        <AnimatePresence>
          {scrollerHover && (
            <motion.button
              key="left-btn"
              type="button"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.2 }}
              onClick={() => scrollBy(-280)}
              className="absolute left-32 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border-muted bg-surface-2/90 text-text-dim shadow-sm backdrop-blur hover:text-text"
              aria-label="Scroll carousel left"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {scrollerHover && (
            <motion.button
              key="right-btn"
              type="button"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.2 }}
              onClick={() => scrollBy(280)}
              className="absolute right-3 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border-muted bg-surface-2/90 text-text-dim shadow-sm backdrop-blur hover:text-text"
              aria-label="Scroll carousel right"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>

        <div
          ref={scrollerRef}
          className="relative flex flex-1 items-center gap-2 overflow-x-auto pb-1 pr-8 scrollbar-thin"
          style={{ scrollbarWidth: 'thin' }}
        >
          {subClients.length === 0 ? (
            <div className="flex w-full items-center justify-center py-2 text-xs text-text-dim">
              No sub-clients yet — add one to get started.
            </div>
          ) : (
            subClients.map((sub) => (
              <PillTab
                key={sub.id}
                sub={sub}
                selected={sub.id === selectedId}
                onClick={() => onSelect(sub.id)}
              />
            ))
          )}

          {/* "+ Add sub-client" terminal action */}
          {subClients.length > 0 && (
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-muted bg-surface-2/40 px-3.5 py-2 text-xs text-text-dim transition-colors hover:border-accent2/40 hover:text-accent2"
              // TODO: wire to /admin/users sub-client provisioning flow once
              // the workspace -> sub-client mutation is hooked up.
              aria-label="Add sub-client"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PillTab({
  sub,
  selected,
  onClick,
}: {
  sub: AgencyWorkspaceData['subClients'][number];
  selected: boolean;
  onClick: () => void;
}) {
  const dotColorHex = STATUS_HEX[sub.status];
  const isAtRisk = sub.status === 'at_risk';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`relative flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs transition-colors ${
        selected
          ? `${STATUS_BG_CLASS[sub.status]} ${STATUS_BORDER_CLASS[sub.status]}`
          : 'border-border-muted bg-surface-2/40 hover:bg-surface-2/70'
      }`}
      aria-pressed={selected}
      aria-label={`${sub.name} — ${sub.mailboxCount} mailboxes, ${STATUS_LABEL[sub.status]}`}
    >
      {/* Logo char */}
      <span
        className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[10px] font-bold ${
          selected ? '' : 'opacity-90'
        }`}
        style={{
          background: `${dotColorHex}1f`,
          color: dotColorHex,
          border: `1px solid ${dotColorHex}66`,
        }}
        aria-hidden
      >
        {sub.logoChar}
      </span>

      {/* Name */}
      <span
        className={`whitespace-nowrap font-medium ${
          selected ? 'text-text' : 'text-text'
        }`}
      >
        {sub.name}
      </span>

      {/* Status dot — pulses for at-risk so attention lands. */}
      <span className="relative ml-1 inline-flex h-2 w-2 items-center justify-center">
        <span
          className="block h-2 w-2 rounded-full"
          style={{ background: dotColorHex }}
          aria-hidden
        />
        {isAtRisk && (
          <motion.span
            className="absolute inset-0 block rounded-full"
            style={{ background: dotColorHex }}
            animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </span>

      {/* Mailbox count */}
      <span className="font-mono text-[10px] text-text-dim">
        {sub.mailboxCount}
      </span>

      {/* Active underline */}
      {selected && (
        <motion.span
          layoutId="pill-active-underline"
          className="absolute inset-x-3 -bottom-px h-px"
          style={{ background: dotColorHex }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Telescope canvas — focused single-account spatial view.
// ---------------------------------------------------------------------------

function TelescopeCanvas({
  selected,
  d,
}: {
  selected: AgencyWorkspaceData['subClients'][number] | null;
  d: AgencyWorkspaceData;
}) {
  const _ = d; // not currently consumed but kept for future overlays.
  void _;
  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(rgba(113, 113, 122,0.18) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Telescope vignette — radial mask that "frames" the focused subject */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(10,10,15,0.55) 75%, rgba(10,10,15,0.85) 100%)',
        }}
      />

      {/* Canvas-corner ornaments — telescope "viewfinder" tick marks */}
      <ViewfinderTicks />

      {/* Soft bloom behind the focused subject */}
      {selected && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: `${STATUS_HEX[selected.status]}1c` }}
        />
      )}

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          selected
            ? `Telescope view of ${selected.name} — ${selected.mailboxCount} mailboxes on orbit`
            : 'Telescope canvas — empty state'
        }
      >
        <defs>
          <radialGradient id="c4t-core-glow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor={selected ? STATUS_HEX[selected.status] : HEX.accent2}
              stopOpacity={0.85}
            />
            <stop
              offset="55%"
              stopColor={selected ? STATUS_HEX[selected.status] : HEX.accent2}
              stopOpacity={0.28}
            />
            <stop
              offset="100%"
              stopColor={selected ? STATUS_HEX[selected.status] : HEX.accent2}
              stopOpacity={0}
            />
          </radialGradient>
          <radialGradient id="c4t-empty-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.18} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
        </defs>

        <AnimatePresence mode="wait">
          {selected ? (
            <FocusedSubject key={selected.id} sub={selected} />
          ) : (
            <EmptyTelescope key="empty" />
          )}
        </AnimatePresence>
      </svg>

      {/* Bottom-left overlay legend */}
      {selected && <CanvasLegend selected={selected} />}
    </div>
  );
}

function ViewfinderTicks() {
  // Corner tick marks that suggest a telescope viewfinder — purely cosmetic.
  const positions: Array<[string, string, string]> = [
    ['top-3', 'left-3', 'origin-top-left'],
    ['top-3', 'right-3', 'origin-top-right'],
    ['bottom-3', 'left-3', 'origin-bottom-left'],
    ['bottom-3', 'right-3', 'origin-bottom-right'],
  ];
  return (
    <>
      {positions.map(([v, h], i) => (
        <div
          key={i}
          aria-hidden
          className={`pointer-events-none absolute ${v} ${h}`}
        >
          <div className="h-3 w-3 border-l border-t border-accent2/30" />
        </div>
      ))}
    </>
  );
}

function EmptyTelescope() {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Faint placeholder ring */}
      <circle
        cx={CX}
        cy={CY}
        r={RING_R}
        fill="none"
        stroke={HEX.border}
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray="2 7"
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.65} fill="url(#c4t-empty-glow)" />

      {/* Empty core placeholder */}
      <circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.border}
        strokeWidth={1.5}
        strokeDasharray="3 5"
      />

      <text
        x={CX}
        y={CY - 14}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 14, letterSpacing: 2, fontWeight: 600 }}
      >
        NO ACCOUNT SELECTED
      </text>
      <text
        x={CX}
        y={CY + 14}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 16, fontWeight: 500 }}
      >
        Pick an account above
      </text>
      <text
        x={CX}
        y={CY + 38}
        textAnchor="middle"
        className="fill-text-dim"
        style={{
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        the telescope will zoom in
      </text>
    </motion.g>
  );
}

function FocusedSubject({
  sub,
}: {
  sub: AgencyWorkspaceData['subClients'][number];
}) {
  const color = STATUS_HEX[sub.status];
  const isAtRisk = sub.status === 'at_risk';
  const pulse = pulseDurationFor(sub);
  const dots = useMemo(
    () => placeMailboxDots(sub.mailboxCount, sub.avgWarmth),
    [sub.mailboxCount, sub.avgWarmth],
  );

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: `${CX}px ${CY}px`, transformBox: 'fill-box' }}
    >
      {/* Dashed orbit ring */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={RING_R}
        fill="none"
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="3 8"
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 80, ease: 'linear', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Subtle inner orbit guide */}
      <circle
        cx={CX}
        cy={CY}
        r={RING_R * 0.55}
        fill="none"
        stroke={HEX.border}
        strokeOpacity={0.5}
        strokeWidth={1}
        strokeDasharray="1 9"
      />

      {/* Faint connection lines core->mailbox dots */}
      {dots.map((dot) => (
        <line
          key={`l-${dot.index}`}
          x1={CX}
          y1={CY}
          x2={dot.x}
          y2={dot.y}
          stroke={color}
          strokeOpacity={0.08}
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}

      {/* Mailbox dots — small status-tinted circles on the ring */}
      {dots.map((dot, i) => (
        <MailboxDotGlyph
          key={`d-${dot.index}`}
          dot={dot}
          index={i}
          parentColor={color}
        />
      ))}

      {/* Centre core */}
      <CenterCore sub={sub} pulse={pulse} isAtRisk={isAtRisk} />
    </motion.g>
  );
}

function MailboxDotGlyph({
  dot,
  index,
  parentColor,
}: {
  dot: MailboxDot;
  index: number;
  parentColor: string;
}) {
  const c = dotColor(dot.warmthFactor);
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: 0.25 + index * 0.035,
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
    >
      {/* Glow halo */}
      <circle cx={dot.x} cy={dot.y} r={DOT_R + 3} fill={c} fillOpacity={0.18} />
      {/* The dot */}
      <circle
        cx={dot.x}
        cy={dot.y}
        r={DOT_R}
        fill={HEX.surface2}
        stroke={c}
        strokeWidth={1.6}
      />
      {/* Inner dot */}
      <circle cx={dot.x} cy={dot.y} r={DOT_R * 0.4} fill={c} />
      {/* Tiny tether-tick connecting to the inner orbit */}
      <line
        x1={CX + RING_R * 0.55 * Math.cos(Math.atan2(dot.y - CY, dot.x - CX))}
        y1={CY + RING_R * 0.55 * Math.sin(Math.atan2(dot.y - CY, dot.x - CX))}
        x2={dot.x - DOT_R * Math.cos(Math.atan2(dot.y - CY, dot.x - CX))}
        y2={dot.y - DOT_R * Math.sin(Math.atan2(dot.y - CY, dot.x - CX))}
        stroke={parentColor}
        strokeOpacity={0.06}
        strokeWidth={1}
        strokeLinecap="round"
      />
    </motion.g>
  );
}

function CenterCore({
  sub,
  pulse,
  isAtRisk,
}: {
  sub: AgencyWorkspaceData['subClients'][number];
  pulse: number;
  isAtRisk: boolean;
}) {
  const color = STATUS_HEX[sub.status];
  return (
    <g>
      {/* Outermost continuous pulse ring */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={color}
        strokeWidth={isAtRisk ? 2.4 : 1.8}
        initial={{ scale: 1, opacity: 0.55 }}
        animate={{ scale: isAtRisk ? 1.9 : 1.7, opacity: 0 }}
        transition={{ duration: pulse, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Second offset pulse — double beat */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={color}
        strokeWidth={isAtRisk ? 1.8 : 1.4}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={{ scale: isAtRisk ? 1.6 : 1.5, opacity: 0 }}
        transition={{
          duration: pulse,
          ease: 'easeOut',
          repeat: Infinity,
          delay: pulse * 0.5,
        }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />

      {/* Soft radial glow under the core */}
      <circle cx={CX} cy={CY} r={CORE_R * 1.65} fill="url(#c4t-core-glow)" />

      {/* The disc */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={2.4}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />

      {/* Logo char in the centre */}
      <text
        x={CX}
        y={CY - 12}
        textAnchor="middle"
        fill={color}
        style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1 }}
      >
        {sub.logoChar}
      </text>

      {/* Status label */}
      <text
        x={CX}
        y={CY + 22}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 15, fontWeight: 600 }}
      >
        {sub.name}
      </text>
      <text
        x={CX}
        y={CY + 42}
        textAnchor="middle"
        fill={color}
        style={{
          fontSize: 11,
          letterSpacing: 1.4,
          fontWeight: 600,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {STATUS_LABEL[sub.status].toUpperCase()} · {sub.avgWarmth}
      </text>

      {/* Team chip overlay — bottom-right corner of the core */}
      <TeamChipOverlay teamCount={sub.teamCount} />
    </g>
  );
}

function TeamChipOverlay({ teamCount }: { teamCount: number }) {
  // Sits at ~4 o'clock around the core
  const ang = Math.PI * 0.32;
  const r = CORE_R + 16;
  const x = CX + r * Math.cos(ang);
  const y = CY + r * Math.sin(ang);
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.5 }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <rect
        x={x - 30}
        y={y - 13}
        width={60}
        height={26}
        rx={13}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeOpacity={0.55}
        strokeWidth={1.2}
      />
      {/* Tiny users icon — drawn as 2 overlapping circles + chevron */}
      <circle
        cx={x - 14}
        cy={y - 2}
        r={3}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={1.2}
      />
      <path
        d={`M ${x - 19} ${y + 5} Q ${x - 14} ${y + 1} ${x - 9} ${y + 5}`}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <text
        x={x + 8}
        y={y + 4}
        textAnchor="middle"
        fill={HEX.accent2}
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {teamCount}
      </text>
    </motion.g>
  );
}

function CanvasLegend({
  selected,
}: {
  selected: AgencyWorkspaceData['subClients'][number];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Eye className="h-3 w-3 text-accent2" />
        Focus
      </span>
      <span className="flex items-center gap-2 text-xs text-text">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: STATUS_HEX[selected.status] }}
          aria-hidden
        />
        {selected.name}
      </span>
      <span className="text-[11px] text-text-dim">
        {selected.mailboxCount} mailbox{selected.mailboxCount === 1 ? '' : 'es'}{' '}
        · {selected.teamCount} team
      </span>
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Activity className="h-3 w-3 text-accent2" />
        Pulse cadence = activity
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel — right side, replaces on selection change.
// ---------------------------------------------------------------------------

function Inspector({
  selected,
  d,
}: {
  selected: AgencyWorkspaceData['subClients'][number] | null;
  d: AgencyWorkspaceData;
}) {
  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <InspectorContent selected={selected} d={d} />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col items-center justify-center px-6 text-center"
          >
            <Telescope className="h-7 w-7 text-text-dim" />
            <p className="mt-3 text-sm font-medium text-text">
              No account selected
            </p>
            <p className="mt-1 max-w-[28ch] text-xs text-text-dim">
              Pick a sub-client pill above to inspect their workspace, plan,
              MRR, branding and DNS health.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InspectorContent({
  selected,
  d,
}: {
  selected: AgencyWorkspaceData['subClients'][number];
  d: AgencyWorkspaceData;
}) {
  const color = STATUS_HEX[selected.status];
  const activity = useMemo(() => recentActivity(selected), [selected]);
  const sendsMin = sendsPerMinute(selected);

  // DNS triad — deterministic stub. Healthy = all pass; warming = mixed;
  // at-risk = at least one fail. Used purely for visual variety.
  const dns: { spf: 'pass' | 'warn' | 'fail'; dkim: 'pass' | 'warn' | 'fail'; dmarc: 'pass' | 'warn' | 'fail' } =
    selected.status === 'healthy'
      ? { spf: 'pass', dkim: 'pass', dmarc: 'pass' }
      : selected.status === 'warming'
        ? { spf: 'pass', dkim: 'warn', dmarc: 'pass' }
        : { spf: 'pass', dkim: 'fail', dmarc: 'fail' };

  // Whether this sub-client uses agency's custom domain (mocked rule:
  // Pro Plus tier accounts use the agency custom domain when set).
  const usesCustomDomain =
    d.features.customDomain.enabled &&
    d.features.customDomain.status === 'verified' &&
    selected.plan === 'Pro Plus';

  return (
    <>
      {/* Header */}
      <header
        className={`flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4 ${STATUS_BG_CLASS[selected.status]}`}
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl font-mono text-sm font-bold"
            style={{
              background: `${color}1f`,
              color: color,
              border: `1px solid ${color}55`,
            }}
          >
            {selected.logoChar}
          </span>
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-text">
              {selected.name}
            </h2>
            <p className="font-mono text-[11px] text-text-dim">
              {selected.ownerEmail}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TEXT_CLASS[selected.status]} ${STATUS_BORDER_CLASS[selected.status]}`}
          >
            <Circle
              className="h-2 w-2 fill-current"
              fill="currentColor"
              strokeWidth={0}
            />
            {STATUS_LABEL[selected.status]}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            {selected.plan}
          </span>
        </div>
      </header>

      {/* Quick stats — MRR, mailboxes, team, warmth */}
      <div className="grid grid-cols-2 gap-2 px-5 py-4">
        <Stat
          label="MRR"
          value={formatMoney(selected.monthlyMrrUsd)}
          hint="monthly"
          accent="text-text"
        />
        <Stat
          label="Warmth"
          value={String(selected.avgWarmth)}
          hint="fleet avg"
          accent={STATUS_TEXT_CLASS[selected.status]}
        />
        <Stat
          label="Mailboxes"
          value={String(selected.mailboxCount)}
          hint={`${selected.teamCount} team`}
          accent="text-text"
        />
        <Stat
          label="Sends/min"
          value={String(sendsMin)}
          hint="estimated"
          accent="text-accent2"
          live
        />
      </div>

      {/* Branding / domain block */}
      <div className="space-y-2 px-5 pb-4">
        <SectionLabel icon={<Sparkles className="h-3 w-3" />}>
          Branding & domain
        </SectionLabel>
        <div className="space-y-1.5 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5">
          <InspectorRow
            label="White-label"
            value={
              d.features.whiteLabel.enabled
                ? d.features.whiteLabel.brandName ?? 'Enabled'
                : 'Off'
            }
            tone={d.features.whiteLabel.enabled ? 'on' : 'off'}
          />
          <InspectorRow
            label="Custom domain"
            value={
              usesCustomDomain
                ? d.features.customDomain.domain ?? '—'
                : 'Default app domain'
            }
            tone={usesCustomDomain ? 'on' : 'off'}
            mono
          />
          <InspectorRow
            label="Domain status"
            value={DOMAIN_LABEL[d.features.customDomain.status]}
            tone={
              d.features.customDomain.status === 'verified'
                ? 'on'
                : d.features.customDomain.status === 'pending'
                  ? 'pending'
                  : d.features.customDomain.status === 'failed'
                    ? 'fail'
                    : 'off'
            }
          />
        </div>
      </div>

      {/* DNS triad */}
      <div className="space-y-2 px-5 pb-4">
        <SectionLabel icon={<Shield className="h-3 w-3" />}>
          DNS triad
        </SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <DnsChip label="SPF" state={dns.spf} />
          <DnsChip label="DKIM" state={dns.dkim} />
          <DnsChip label="DMARC" state={dns.dmarc} />
        </div>
      </div>

      {/* Recent activity */}
      <div className="space-y-2 px-5 pb-4">
        <div className="flex items-center justify-between">
          <SectionLabel icon={<Radio className="h-3 w-3" />}>
            Recent activity
          </SectionLabel>
          <span className="font-mono text-[10px] text-text-dim">
            last {activity.length}
          </span>
        </div>
        <ul className="space-y-1.5">
          {activity.slice(0, 6).map((row) => {
            const Icon = ACTIVITY_ICON[row.kind];
            return (
              <li
                key={row.id}
                className="flex items-start gap-2.5 rounded-lg border border-transparent px-2 py-1.5 hover:border-border-muted hover:bg-surface-2/40"
              >
                <Icon
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ACTIVITY_COLOR_CLASS[row.kind]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-text">
                    {row.message}
                  </p>
                  <p className="font-mono text-[10px] text-text-dim">
                    {row.ago}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Provisioning metadata */}
      <div className="space-y-2 px-5 pb-4">
        <SectionLabel icon={<Building2 className="h-3 w-3" />}>
          Account
        </SectionLabel>
        <div className="space-y-1.5 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5">
          <InspectorRow label="Created" value={selected.createdAgo} />
          <InspectorRow label="Last active" value={selected.lastActiveAgo} />
          <InspectorRow label="Plan" value={selected.plan} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t border-white/5 bg-surface/70 px-5 py-3 backdrop-blur-xl">
        <ActionBtn
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          label="Open"
          primary
          // TODO: wire to /admin/users?workspace=<id> deep-link once routing
          // for the workspace-impersonation flow is finalized.
        />
        <ActionBtn
          icon={<Pencil className="h-3.5 w-3.5" />}
          label="Rename"
        />
        <ActionBtn
          icon={<UserCog className="h-3.5 w-3.5" />}
          label="Invite"
        />
        <ActionBtn
          icon={<ZapOff className="h-3.5 w-3.5" />}
          label="Suspend"
          danger
        />
      </div>
    </>
  );
}

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
      {icon}
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
  live,
}: {
  label: string;
  value: string;
  hint: string;
  accent: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {live && (
          <motion.span
            className="block h-1.5 w-1.5 rounded-full bg-accent2"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <p className={`font-mono text-lg font-semibold tabular-nums ${accent}`}>
        {value}
      </p>
      <p className="text-[10px] text-text-dim">{hint}</p>
    </div>
  );
}

function InspectorRow({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: 'on' | 'off' | 'pending' | 'fail';
  mono?: boolean;
}) {
  const toneClass =
    tone === 'on'
      ? 'text-accent'
      : tone === 'pending'
        ? 'text-accent4'
        : tone === 'fail'
          ? 'text-accent3'
          : 'text-text';
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      <span className="text-text-dim">{label}</span>
      <span
        className={`${toneClass} max-w-[18ch] truncate ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function DnsChip({
  label,
  state,
}: {
  label: string;
  state: 'pass' | 'warn' | 'fail';
}) {
  const cls =
    state === 'pass'
      ? 'border-accent/30 bg-accent/10 text-accent'
      : state === 'warn'
        ? 'border-accent4/30 bg-accent4/10 text-accent4'
        : 'border-accent3/30 bg-accent3/10 text-accent3';
  const Icon = state === 'pass' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono text-[10px] font-bold tracking-wider">
        {label}
      </span>
      <span className="font-mono text-[9px] uppercase">
        {state === 'pass' ? 'pass' : state === 'warn' ? 'warn' : 'fail'}
      </span>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  primary,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  const base =
    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors';
  const variant = primary
    ? 'border-accent2/40 bg-accent2/10 text-accent2 hover:bg-accent2/20'
    : danger
      ? 'border-accent3/30 text-accent3 hover:bg-accent3/10'
      : 'border-border-muted text-text hover:bg-surface-2/60';
  return (
    <button type="button" className={`${base} ${variant}`} aria-label={label}>
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bottom strip — team / API keys / webhooks
// ---------------------------------------------------------------------------

function BottomStrip({ d }: { d: AgencyWorkspaceData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.16 }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
    >
      <TeamTile team={d.team} />
      <ApiKeysTile keys={d.apiKeys} />
      <WebhooksTile webhooks={d.webhooks} />
    </motion.div>
  );
}

function TeamTile({ team }: { team: AgencyWorkspaceData['team'] }) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Users className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-text">Agency team</h3>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-border-muted px-2 py-0.5 text-[10px] text-text-dim hover:text-text"
        >
          <Plus className="h-3 w-3" />
          Invite
        </button>
      </div>
      <ul className="space-y-1.5">
        {team.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border-muted py-4 text-center text-[11px] text-text-dim">
            No team members yet.
          </li>
        ) : (
          team.slice(0, 5).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border-muted hover:bg-surface-2/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                  {m.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-text">{m.name}</p>
                  <p className="truncate font-mono text-[10px] text-text-dim">
                    {m.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={`font-mono text-[10px] uppercase tracking-wide ${ROLE_TEXT_CLASS[m.role]}`}
                >
                  {ROLE_LABEL[m.role]}
                </span>
                <span className="font-mono text-[9px] text-text-dim">
                  {m.lastActiveAgo}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ApiKeysTile({ keys }: { keys: AgencyWorkspaceData['apiKeys'] }) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Key className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-text">API keys</h3>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-border-muted px-2 py-0.5 text-[10px] text-text-dim hover:text-text"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>
      <ul className="space-y-1.5">
        {keys.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border-muted py-4 text-center text-[11px] text-text-dim">
            No keys issued yet.
          </li>
        ) : (
          keys.map((k) => (
            <li
              key={k.id}
              className="rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-text">{k.label}</span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${SCOPE_BG_CLASS[k.scope]}`}
                >
                  {SCOPE_LABEL[k.scope]}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-text-dim">
                  {k.masked}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="grid h-5 w-5 place-items-center rounded-md text-text-dim hover:text-text"
                    aria-label={`Copy ${k.label}`}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="grid h-5 w-5 place-items-center rounded-md text-text-dim hover:text-accent3"
                    aria-label={`Revoke ${k.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <span className="font-mono text-[9px] text-text-dim">
                last used {k.lastUsedAgo}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function WebhooksTile({
  webhooks,
}: {
  webhooks: AgencyWorkspaceData['webhooks'];
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent4/30 bg-accent4/10 text-accent4">
            <Webhook className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-text">Webhooks</h3>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-border-muted px-2 py-0.5 text-[10px] text-text-dim hover:text-text"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
      <ul className="space-y-1.5">
        {webhooks.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border-muted py-4 text-center text-[11px] text-text-dim">
            No webhooks configured.
          </li>
        ) : (
          webhooks.map((w) => (
            <li
              key={w.id}
              className="rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10.5px] text-text">
                  {w.url}
                </p>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                    w.status === 'live'
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-text-dim/30 bg-surface-2/30 text-text-dim'
                  }`}
                >
                  {w.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {w.events.slice(0, 3).map((e) => (
                  <span
                    key={e}
                    className="rounded-full border border-border-muted bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-dim"
                  >
                    {e}
                  </span>
                ))}
                {w.events.length > 3 && (
                  <span className="font-mono text-[9px] text-text-dim">
                    +{w.events.length - 3} more
                  </span>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature modal — opens when a feature chip is clicked.
// Stub config panel; the real action lives in the dedicated *_tab pages
// composed by AgencyWorkspace.tsx — this modal is a preview of state.
// ---------------------------------------------------------------------------

function FeatureModal({
  open,
  d,
  onClose,
}: {
  open: 'whiteLabel' | 'customDomain' | 'dedicatedPool' | null;
  d: AgencyWorkspaceData;
  onClose: () => void;
}) {
  // TODO: replace with AppDialog from `@/components/ui/AppDialog` once this
  // candidate is locked — using a hand-rolled overlay here to keep the file
  // self-contained per the candidate file conventions.
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border-muted bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
              <div className="flex items-center gap-2">
                {open === 'whiteLabel' && (
                  <Sparkles className="h-4 w-4 text-accent2" />
                )}
                {open === 'customDomain' && (
                  <Globe className="h-4 w-4 text-accent2" />
                )}
                {open === 'dedicatedPool' && (
                  <Network className="h-4 w-4 text-accent2" />
                )}
                <h2 className="text-sm font-semibold text-text">
                  {open === 'whiteLabel'
                    ? 'White-label'
                    : open === 'customDomain'
                      ? 'Custom domain'
                      : 'Dedicated peer pool'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-7 w-7 place-items-center rounded-md text-text-dim hover:bg-surface-2/60 hover:text-text"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-3 p-5">
              {open === 'whiteLabel' && (
                <>
                  <ModalRow
                    label="Enabled"
                    value={
                      d.features.whiteLabel.enabled
                        ? 'Yes'
                        : 'No — upgrade Agency tier'
                    }
                    tone={d.features.whiteLabel.enabled ? 'on' : 'off'}
                  />
                  <ModalRow
                    label="Brand name"
                    value={d.features.whiteLabel.brandName ?? 'Not set'}
                  />
                  <ModalRow
                    label="Logo uploaded"
                    value={d.features.whiteLabel.hasLogo ? 'Yes' : 'No'}
                    tone={d.features.whiteLabel.hasLogo ? 'on' : 'off'}
                  />
                  <p className="text-[11px] text-text-dim">
                    White-label rewrites the product chrome (logo, name,
                    transactional mail "from") for your sub-clients.
                  </p>
                </>
              )}
              {open === 'customDomain' && (
                <>
                  <ModalRow
                    label="Domain"
                    value={d.features.customDomain.domain ?? 'Not assigned'}
                    mono
                  />
                  <ModalRow
                    label="Status"
                    value={DOMAIN_LABEL[d.features.customDomain.status]}
                    tone={
                      d.features.customDomain.status === 'verified'
                        ? 'on'
                        : d.features.customDomain.status === 'pending'
                          ? 'pending'
                          : d.features.customDomain.status === 'failed'
                            ? 'fail'
                            : 'off'
                    }
                  />
                  <p className="text-[11px] text-text-dim">
                    Verified custom domain replaces the default app domain in
                    sub-client logins, in-app links, and outbound transactional
                    mail.
                  </p>
                </>
              )}
              {open === 'dedicatedPool' && (
                <>
                  <ModalRow
                    label="Enabled"
                    value={d.features.dedicatedPool.enabled ? 'Yes' : 'No'}
                    tone={d.features.dedicatedPool.enabled ? 'on' : 'off'}
                  />
                  <ModalRow
                    label="Pool name"
                    value={d.features.dedicatedPool.poolName ?? '—'}
                    mono
                  />
                  <ModalRow
                    label="Peer count"
                    value={formatNumber(d.features.dedicatedPool.memberCount)}
                  />
                  <p className="text-[11px] text-text-dim">
                    Dedicated pools route your sub-clients' warmup mail only to
                    peer inboxes inside the pool — no shared signal with other
                    agencies.
                  </p>
                </>
              )}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border-muted px-3 py-1.5 text-xs text-text hover:bg-surface-2/60"
              >
                Close
              </button>
              <button
                type="button"
                className="rounded-full border border-accent2/40 bg-accent2/10 px-3 py-1.5 text-xs text-accent2 hover:bg-accent2/20"
              >
                Configure
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalRow({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: 'on' | 'off' | 'pending' | 'fail';
  mono?: boolean;
}) {
  const toneClass =
    tone === 'on'
      ? 'text-accent'
      : tone === 'pending'
        ? 'text-accent4'
        : tone === 'fail'
          ? 'text-accent3'
          : tone === 'off'
            ? 'text-text-dim'
            : 'text-text';
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <span
        className={`${toneClass} max-w-[24ch] truncate ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
