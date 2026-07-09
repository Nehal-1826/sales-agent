import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Atom,
  Beaker,
  Bell,
  CircleDot,
  ClipboardList,
  Filter,
  Flame,
  FlaskConical,
  Globe,
  Layers,
  Mail,
  Microscope,
  Orbit,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

/**
 * AgRepC3Periodic — Agency-tier Reputation candidate #3, "Periodic Table of Domains".
 *
 * The agency owner runs a fleet of sending domains across many sub-clients. To
 * read reputation *across the portfolio at a glance*, this variant arranges each
 * domain as an "element" on a chemistry-grade periodic table:
 *
 *   - Each ROW is a "period" representing reputation TIER. The top period holds
 *     the stable "noble" domains (healthy). The middle period holds the
 *     "transition" domains (warming). The bottom period holds the "reactive"
 *     domains (at-risk).
 *   - Each COLUMN is a "group" — provider concentration / sub-client cluster.
 *   - Each tile carries an atomic-number-style reputation score in the top-left,
 *     a 2-letter symbol mid-tile, a property icon (DNS-pass shield) top-right,
 *     and the domain name underneath.
 *   - Tiles fade in left-to-right, row-by-row, with a 40ms stagger.
 *   - Hover: tile LIFTS, gets a glow halo, and the symbol rotates subtly.
 *   - Click: shimmer + an electron-cloud SVG ring expands outward; the detail
 *     card slides up from the bottom of the canvas with the full domain card.
 *   - At-risk tiles continuously pulse with an accent3 ring.
 *
 * Right-side rail: provider-mix bar chart + a live ticker of recent alerts.
 *
 * Distinct from sibling Agency Reputation candidates: this one is a SCIENTIFIC
 * grid in periodic-table form. Not a radar (C1), not a hospital monitor (C2),
 * not a weather forecast (C4). The "chemistry / atom" motif is load-bearing —
 * the click animation is an electron cloud, the icon set is FlaskConical /
 * Beaker / Atom / Microscope, the tier names are "noble / transition /
 * reactive", and the symbol on each tile is rendered like an element glyph.
 *
 * Fully STANDALONE: no router, no query hooks, no external feature imports.
 * The harness mounts it prop-less; every value comes from the inline MOCK
 * unless the caller passes `data`. Renders ONLY page content; the shell
 * supplies the sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency Reputation variants
// ---------------------------------------------------------------------------

type DomainStatus = 'healthy' | 'warming' | 'at_risk';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'bounce_spike' | 'spam_complaint' | 'dns_break' | 'peer_failed';

export interface AgencyReputationData {
  agency: { name: string; region: string };
  summary: {
    overallScore: number;
    trend7dDelta: number;
    domainsHealthy: number;
    domainsWarming: number;
    domainsAtRisk: number;
    totalSends24h: number;
    bouncePct24h: number;
    spamComplaintPct24h: number;
  };
  domains: Array<{
    id: string;
    domain: string;
    subClientId: string;
    subClientName: string;
    reputationScore: number;
    status: DomainStatus;
    spfPass: boolean;
    dkimPass: boolean;
    dmarcPass: boolean;
    mailboxCount: number;
    inboxRatePct: number;
    spamFolderPct: number;
    last7dScores: number[];
    lastIncidentAgo: string | null;
    lastIncidentKind: AlertKind | null;
  }>;
  providers: Array<{
    id: string;
    label: string;
    inboxPct: number;
    spamPct: number;
    blockedPct: number;
    last24hSends: number;
  }>;
  recentAlerts: Array<{
    id: string;
    domain: string;
    kind: AlertKind;
    message: string;
    ago: string;
    severity: AlertSeverity;
  }>;
}

// ---------------------------------------------------------------------------
// MOCK content
// ---------------------------------------------------------------------------

const MOCK: AgencyReputationData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  summary: {
    overallScore: 78,
    trend7dDelta: 2.4,
    domainsHealthy: 5,
    domainsWarming: 2,
    domainsAtRisk: 1,
    totalSends24h: 14820,
    bouncePct24h: 1.8,
    spamComplaintPct24h: 0.4,
  },
  domains: [
    {
      id: 'dom_helix',
      domain: 'helix-labs.io',
      subClientId: 'sc_helix',
      subClientName: 'Helix Labs',
      reputationScore: 92,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 14,
      inboxRatePct: 96,
      spamFolderPct: 1,
      last7dScores: [88, 89, 90, 90, 91, 92, 92],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'dom_nimbus',
      domain: 'nimbuscloud.app',
      subClientId: 'sc_nimbus',
      subClientName: 'Nimbus Cloud',
      reputationScore: 88,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 22,
      inboxRatePct: 94,
      spamFolderPct: 2,
      last7dScores: [85, 85, 86, 87, 87, 88, 88],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'dom_orbital',
      domain: 'orbital-stack.co',
      subClientId: 'sc_orbital',
      subClientName: 'Orbital Stack',
      reputationScore: 85,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 18,
      inboxRatePct: 92,
      spamFolderPct: 3,
      last7dScores: [82, 83, 84, 84, 85, 85, 85],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'dom_vora',
      domain: 'voracom.net',
      subClientId: 'sc_vora',
      subClientName: 'Voracom',
      reputationScore: 82,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 11,
      inboxRatePct: 90,
      spamFolderPct: 3,
      last7dScores: [80, 80, 81, 81, 82, 82, 82],
      lastIncidentAgo: '3d ago',
      lastIncidentKind: 'bounce_spike',
    },
    {
      id: 'dom_quasar',
      domain: 'quasargrid.io',
      subClientId: 'sc_quasar',
      subClientName: 'Quasar Grid',
      reputationScore: 81,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 9,
      inboxRatePct: 89,
      spamFolderPct: 4,
      last7dScores: [78, 79, 79, 80, 80, 81, 81],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'dom_lumen',
      domain: 'lumensphere.co',
      subClientId: 'sc_lumen',
      subClientName: 'Lumensphere',
      reputationScore: 68,
      status: 'warming',
      spfPass: true,
      dkimPass: true,
      dmarcPass: false,
      mailboxCount: 7,
      inboxRatePct: 78,
      spamFolderPct: 8,
      last7dScores: [62, 63, 64, 65, 66, 67, 68],
      lastIncidentAgo: '12h ago',
      lastIncidentKind: 'dns_break',
    },
    {
      id: 'dom_atlas',
      domain: 'atlas-bio.com',
      subClientId: 'sc_atlas',
      subClientName: 'Atlas Bio',
      reputationScore: 41,
      status: 'at_risk',
      spfPass: false,
      dkimPass: true,
      dmarcPass: false,
      mailboxCount: 5,
      inboxRatePct: 48,
      spamFolderPct: 22,
      last7dScores: [55, 52, 50, 48, 46, 43, 41],
      lastIncidentAgo: '38m ago',
      lastIncidentKind: 'spam_complaint',
    },
    {
      id: 'dom_pulse',
      domain: 'pulsefab.io',
      subClientId: 'sc_pulse',
      subClientName: 'PulseFab',
      reputationScore: 66,
      status: 'warming',
      spfPass: true,
      dkimPass: false,
      dmarcPass: true,
      mailboxCount: 6,
      inboxRatePct: 75,
      spamFolderPct: 10,
      last7dScores: [60, 61, 62, 63, 64, 65, 66],
      lastIncidentAgo: '4h ago',
      lastIncidentKind: 'peer_failed',
    },
  ],
  providers: [
    {
      id: 'gmail',
      label: 'Gmail',
      inboxPct: 88,
      spamPct: 6,
      blockedPct: 6,
      last24hSends: 7240,
    },
    {
      id: 'outlook',
      label: 'Outlook',
      inboxPct: 81,
      spamPct: 11,
      blockedPct: 8,
      last24hSends: 5180,
    },
    {
      id: 'yahoo',
      label: 'Yahoo',
      inboxPct: 74,
      spamPct: 18,
      blockedPct: 8,
      last24hSends: 2400,
    },
  ],
  recentAlerts: [
    {
      id: 'al_1',
      domain: 'atlas-bio.com',
      kind: 'spam_complaint',
      message: 'Spam complaint rate 0.9% (>0.3% threshold) on Gmail',
      ago: '38m ago',
      severity: 'critical',
    },
    {
      id: 'al_2',
      domain: 'lumensphere.co',
      kind: 'dns_break',
      message: 'DMARC record mismatch — quarantine policy not enforced',
      ago: '12h ago',
      severity: 'warn',
    },
    {
      id: 'al_3',
      domain: 'pulsefab.io',
      kind: 'peer_failed',
      message: 'Peer pool member dropped — 2/8 peers below 0.3 reputation',
      ago: '4h ago',
      severity: 'warn',
    },
    {
      id: 'al_4',
      domain: 'voracom.net',
      kind: 'bounce_spike',
      message: 'Hard-bounce spike 2.1% on Outlook (baseline 0.4%)',
      ago: '3d ago',
      severity: 'warn',
    },
  ],
};

// ---------------------------------------------------------------------------
// SKELETON — zero-state, used by the agency-rep adapter before first fetch
// ---------------------------------------------------------------------------

export const AGENCY_REPUTATION_SKELETON_C3: AgencyReputationData = {
  agency: { name: 'Your agency', region: 'us-east-1' },
  summary: {
    overallScore: 0,
    trend7dDelta: 0,
    domainsHealthy: 0,
    domainsWarming: 0,
    domainsAtRisk: 0,
    totalSends24h: 0,
    bouncePct24h: 0,
    spamComplaintPct24h: 0,
  },
  domains: [],
  providers: [],
  recentAlerts: [],
};

// ---------------------------------------------------------------------------
// Periodic-table layout
// ---------------------------------------------------------------------------
//
// Tiles are laid out on a (row, col) grid. We map status -> row ("period"):
//
//   period 1 (top, "noble"):       healthy domains
//   period 2 (middle, "transition"): warming domains
//   period 3 (bottom, "reactive"):   at-risk domains
//
// Within each period, we keep the table's iconic 18-group width by spreading
// the tiles across "groups" (columns). A real periodic table has gaps; we
// preserve that look by placing the first/last tiles on the outer columns
// (group 1 and group 18) so the centre breathes when there are few elements.
// ---------------------------------------------------------------------------

const GROUPS = 18;

interface TileSlot {
  row: 1 | 2 | 3;
  col: number; // 1..18
}

function slotForIndex(status: DomainStatus, indexInPeriod: number, periodCount: number): TileSlot {
  const row: 1 | 2 | 3 = status === 'healthy' ? 1 : status === 'warming' ? 2 : 3;
  if (periodCount === 1) return { row, col: 9 };
  if (periodCount === 2) return { row, col: indexInPeriod === 0 ? 1 : GROUPS };
  // For 3+ tiles, anchor first to group 1 and last to group 18, fan the rest
  // evenly across 3..15.
  if (indexInPeriod === 0) return { row, col: 1 };
  if (indexInPeriod === periodCount - 1) return { row, col: GROUPS };
  const innerSlots = periodCount - 2;
  const step = (15 - 3) / Math.max(1, innerSlots);
  return { row, col: Math.round(3 + (indexInPeriod - 1) * step) };
}

// ---------------------------------------------------------------------------
// Symbol-derivation helper
// ---------------------------------------------------------------------------
//
// We use the agreed-upon two-letter symbols from the spec, indexed by domain
// id. Falling back to first two letters of the bare domain keeps the visual
// stable when the harness hands us live data.
// ---------------------------------------------------------------------------

const DOMAIN_SYMBOLS: Record<string, string> = {
  dom_helix: 'He',
  dom_nimbus: 'Nc',
  dom_orbital: 'Os',
  dom_vora: 'Vo',
  dom_quasar: 'Qg',
  dom_lumen: 'Ls',
  dom_atlas: 'Ab',
  dom_pulse: 'Pf',
};

function symbolFor(d: AgencyReputationData['domains'][number]): string {
  if (DOMAIN_SYMBOLS[d.id]) return DOMAIN_SYMBOLS[d.id]!;
  const bare = d.domain.replace(/^https?:\/\//, '').split('.')[0] ?? d.domain;
  const initial = (bare[0] ?? '?').toUpperCase();
  const second = (bare[1] ?? '').toLowerCase();
  return `${initial}${second}`;
}

// ---------------------------------------------------------------------------
// Status tokens
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<DomainStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At-risk',
};

const STATUS_TEXT: Record<DomainStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
};

const STATUS_BORDER: Record<DomainStatus, string> = {
  healthy: 'border-accent/40',
  warming: 'border-accent4/40',
  at_risk: 'border-accent3/40',
};

const STATUS_BG: Record<DomainStatus, string> = {
  healthy: 'bg-accent/10',
  warming: 'bg-accent4/10',
  at_risk: 'bg-accent3/10',
};

const STATUS_DOT: Record<DomainStatus, string> = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
};

// Period header — "noble / transition / reactive". The icon and copy reinforce
// the chemistry conceit so the user reads rows as tiers, not arbitrary lists.

const PERIOD_META: Record<DomainStatus, { label: string; subtitle: string; Icon: typeof ShieldCheck }> = {
  healthy: {
    label: 'Period I — Noble',
    subtitle: 'Stable. Strong inbox placement, full DNS auth.',
    Icon: ShieldCheck,
  },
  warming: {
    label: 'Period II — Transition',
    subtitle: 'Climbing. Mixed signals, partial auth coverage.',
    Icon: Beaker,
  },
  at_risk: {
    label: 'Period III — Reactive',
    subtitle: 'Volatile. Auth failure or complaint spike — intervene now.',
    Icon: FlaskConical,
  },
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'Bounce spike',
  spam_complaint: 'Spam complaint',
  dns_break: 'DNS break',
  peer_failed: 'Peer failed',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  bounce_spike: TrendingDown,
  spam_complaint: Flame,
  dns_break: ShieldX,
  peer_failed: Radio,
};

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

function nf(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function pct(n: number): string {
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

function delta(n: number): { text: string; cls: string; Icon: typeof TrendingUp } {
  if (n > 0) return { text: `+${n.toFixed(1)}`, cls: 'text-accent', Icon: TrendingUp };
  if (n < 0) return { text: `${n.toFixed(1)}`, cls: 'text-accent3', Icon: TrendingDown };
  return { text: '0.0', cls: 'text-text-dim', Icon: Activity };
}

// ---------------------------------------------------------------------------
// Sparkline — tiny SVG, no charting library
// ---------------------------------------------------------------------------

function Sparkline({
  values,
  color,
  width = 220,
  height = 56,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}): JSX.Element {
  if (values.length === 0) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L ${(pts[pts.length - 1]?.[0] ?? 0).toFixed(1)} ${height} L 0 ${height} Z`;
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.4} fill={color} />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KPI tile (used in the agency header bar)
// ---------------------------------------------------------------------------

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  Icon: typeof Atom;
  accentCls: string;
}

function KpiTile({ label, value, hint, Icon, accentCls }: KpiTileProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex min-w-[180px] flex-1 items-center gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 ${accentCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-col">
        <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">{label}</div>
        <div className="font-mono text-xl font-semibold leading-tight text-text">{value}</div>
        {hint && <div className="text-[11px] text-text-dim">{hint}</div>}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DNS chip — three little badges; pass / fail tints by token color
// ---------------------------------------------------------------------------

interface DnsChipProps {
  label: string;
  pass: boolean;
  compact?: boolean;
}

function DnsChip({ label, pass, compact = false }: DnsChipProps): JSX.Element {
  const cls = pass
    ? 'border-accent/40 bg-accent/10 text-accent'
    : 'border-accent3/40 bg-accent3/10 text-accent3';
  const Icon = pass ? ShieldCheck : ShieldX;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] uppercase tracking-wide ${cls} ${
        compact ? 'py-0.5' : 'py-1'
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Element tile — the periodic-table cell
// ---------------------------------------------------------------------------

interface ElementTileProps {
  domain: AgencyReputationData['domains'][number];
  slot: TileSlot;
  index: number; // global index across all tiles, for stagger
  selected: boolean;
  onSelect: () => void;
}

function ElementTile({ domain, slot, index, selected, onSelect }: ElementTileProps): JSX.Element {
  const symbol = symbolFor(domain);
  const allPass = domain.spfPass && domain.dkimPass && domain.dmarcPass;
  const tintBg = STATUS_BG[domain.status];
  const tintBorder = STATUS_BORDER[domain.status];
  const tintText = STATUS_TEXT[domain.status];
  const dotCls = STATUS_DOT[domain.status];

  // ----- Continuous pulse for at-risk tiles -----
  // We attach a motion animation that loops scale 1 -> 1.04 -> 1 every 2s,
  // gated to status === 'at_risk' so healthy tiles stay still. The accent3
  // ring is rendered as a sibling absolute layer to avoid layout shifts.

  const pulseAnim = domain.status === 'at_risk'
    ? {
        scale: [1, 1.04, 1],
      }
    : { scale: 1 };

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{
        opacity: 1,
        y: 0,
        ...(pulseAnim as Record<string, unknown>),
      }}
      transition={{
        opacity: { delay: index * 0.04, duration: 0.32, ease: 'easeOut' },
        y: { delay: index * 0.04, duration: 0.32, ease: 'easeOut' },
        scale:
          domain.status === 'at_risk'
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.04 + 0.4 }
            : { delay: index * 0.04, duration: 0.32, ease: 'easeOut' },
      }}
      whileHover={{ y: -4, scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      style={{
        gridRow: slot.row,
        gridColumn: slot.col,
      }}
      className={`group relative aspect-square w-full overflow-hidden rounded-lg border ${tintBorder} ${tintBg} text-left transition-shadow ${
        selected
          ? 'ring-2 ring-accent2 shadow-[0_0_24px_-4px_rgba(255, 138, 75,0.5)]'
          : 'hover:shadow-[0_8px_24px_-8px_rgba(255,255,255,0.18)]'
      }`}
      aria-label={`${domain.domain} — score ${domain.reputationScore}, ${STATUS_LABEL[domain.status]}`}
    >
      {/* At-risk pulsing accent3 ring as a sibling layer (no layout shift). */}
      {domain.status === 'at_risk' && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg border border-accent3/60"
          animate={{ opacity: [0.6, 0.15, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Selected shimmer — diagonal sheen sweep that fires once per click. */}
      <AnimatePresence>
        {selected && (
          <motion.span
            key="shimmer"
            initial={{ x: '-120%', opacity: 0.6 }}
            animate={{ x: '220%', opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
        )}
      </AnimatePresence>

      {/* Score (atomic number) — top left, monospaced, dim */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 font-mono text-[11px] font-medium text-text-dim">
        {domain.reputationScore}
      </span>

      {/* DNS shield (property icon) — top right */}
      <span
        className={`pointer-events-none absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-md ${
          allPass ? 'text-accent' : 'text-accent3'
        }`}
        title={allPass ? 'SPF + DKIM + DMARC pass' : 'DNS issue detected'}
      >
        {allPass ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
      </span>

      {/* Element symbol — centred, large, mono. Rotates subtly on hover. */}
      <span className="absolute inset-0 flex items-center justify-center">
        <motion.span
          className={`font-mono text-2xl font-semibold tracking-tight ${tintText}`}
          whileHover={{ rotate: 4 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        >
          {symbol}
        </motion.span>
      </span>

      {/* Domain name — bottom, faint, ellipsised */}
      <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center gap-1">
        <span className={`h-1 w-1 rounded-full ${dotCls}`} aria-hidden="true" />
        <span className="truncate text-[10px] text-text-dim">{domain.domain}</span>
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Electron-cloud — SVG expansion that fires when a tile is selected
// ---------------------------------------------------------------------------
//
// We render this as a portal-like absolute layer pinned to the selected tile's
// grid slot. It's a circle that grows scale 0 -> 3 and fades 0.6 -> 0 over
// 0.8s. To keep the layout calm we don't track tile positions in JS; we sit
// the cloud inside the tile's own grid cell using the same row/column and let
// CSS do the math. Pointer events are disabled so it can't intercept clicks.

function ElectronCloud({ slot, fireKey }: { slot: TileSlot; fireKey: number }): JSX.Element {
  return (
    <div
      className="pointer-events-none flex items-center justify-center"
      style={{ gridRow: slot.row, gridColumn: slot.col }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={fireKey}
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 3, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="block aspect-square w-full rounded-full border border-accent2/60 bg-accent2/10"
        />
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period row label — left rail
// ---------------------------------------------------------------------------

function PeriodLabel({
  meta,
  rowIndex,
  count,
}: {
  meta: { label: string; subtitle: string; Icon: typeof ShieldCheck };
  rowIndex: 1 | 2 | 3;
  count: number;
}): JSX.Element {
  const Icon = meta.Icon;
  return (
    <div
      style={{ gridRow: rowIndex, gridColumn: 'period-rail' }}
      className="flex h-full flex-col justify-center border-r border-border-muted pr-3"
    >
      <div className="flex items-center gap-2 text-text">
        <Icon className="h-4 w-4 text-text-dim" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>
      <p className="mt-1 max-w-[180px] text-[11px] leading-snug text-text-dim">{meta.subtitle}</p>
      <div className="mt-1.5 font-mono text-[10px] text-text-faint">
        {count} {count === 1 ? 'element' : 'elements'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group axis — column numbers across the top of the table
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Provider mix bar — small stacked-bar element on the right rail
// ---------------------------------------------------------------------------

function ProviderBar({
  provider,
  delay,
}: {
  provider: AgencyReputationData['providers'][number];
  delay: number;
}): JSX.Element {
  const { inboxPct, spamPct, blockedPct } = provider;
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-text">{provider.label}</span>
        <span className="font-mono text-text-dim">{nf(provider.last24hSends)} sends</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className="bg-accent" style={{ width: `${inboxPct}%` }} />
        <span className="bg-accent4" style={{ width: `${spamPct}%` }} />
        <span className="bg-accent3" style={{ width: `${blockedPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-text-dim">
        <span className="text-accent">Inbox {pct(inboxPct)}</span>
        <span className="text-accent4">Spam {pct(spamPct)}</span>
        <span className="text-accent3">Blocked {pct(blockedPct)}</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Recent-alert row — ticker item
// ---------------------------------------------------------------------------

function AlertRow({
  alert,
  delay,
}: {
  alert: AgencyReputationData['recentAlerts'][number];
  delay: number;
}): JSX.Element {
  const Icon = ALERT_KIND_ICON[alert.kind];
  const sev = alert.severity === 'critical' ? 'text-accent3' : 'text-accent4';
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface px-3 py-2.5"
    >
      <span className={`mt-0.5 ${sev}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-text">{alert.domain}</span>
          <span className="font-mono text-[10px] text-text-faint">{alert.ago}</span>
        </div>
        <div className="text-[11px] text-text-dim">{ALERT_KIND_LABEL[alert.kind]}</div>
        <p className="mt-1 text-[11px] leading-snug text-text-dim">{alert.message}</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Detail card — slides up from bottom on selection
// ---------------------------------------------------------------------------

function DetailCard({
  domain,
  onClose,
}: {
  domain: AgencyReputationData['domains'][number];
  onClose: () => void;
}): JSX.Element {
  const symbol = symbolFor(domain);
  const tintText = STATUS_TEXT[domain.status];
  const tintBorder = STATUS_BORDER[domain.status];
  const tintBg = STATUS_BG[domain.status];
  const sparkColor =
    domain.status === 'healthy'
      ? 'rgb(242, 101, 34)'
      : domain.status === 'warming'
        ? 'rgb(255, 213, 79)'
        : 'rgb(255, 107, 74)';

  // Stagger children — each row of the card fades up in sequence so the eye
  // reads "title -> dns -> stats -> sparkline -> incident" rather than the
  // whole block popping at once.
  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.08 + i * 0.05, duration: 0.32 },
    }),
  };

  return (
    <motion.div
      key={domain.id}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className={`relative overflow-hidden rounded-xl border ${tintBorder} bg-surface`}
    >
      {/* Tinted corner halo so each status reads instantly */}
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${tintBg.replace('/10', '/40')}`}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-stretch gap-6 px-5 py-4">
        {/* Element badge — a mini periodic-table tile, big and proud */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className={`relative flex h-[112px] w-[112px] shrink-0 flex-col items-center justify-center rounded-xl border ${tintBorder} ${tintBg}`}
        >
          <span className="absolute left-2 top-1.5 font-mono text-[11px] text-text-dim">
            {domain.reputationScore}
          </span>
          <span className="absolute right-2 top-1.5 text-text-dim">
            {domain.spfPass && domain.dkimPass && domain.dmarcPass ? (
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-accent3" />
            )}
          </span>
          <span className={`font-mono text-4xl font-semibold ${tintText}`}>{symbol}</span>
          <span className="mt-1 text-[10px] text-text-dim">{STATUS_LABEL[domain.status]}</span>
        </motion.div>

        {/* Identity + DNS row */}
        <div className="flex min-w-[260px] flex-1 flex-col gap-3">
          <motion.div custom={1} initial="hidden" animate="visible" variants={itemVariants}>
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-text-dim" />
              <span className="font-mono text-[13px] font-medium text-text">{domain.domain}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-text-dim">
              <span>Sub-client:</span>
              <span className="text-text">{domain.subClientName}</span>
              <span className="text-text-faint">•</span>
              <span>{domain.mailboxCount} mailboxes</span>
            </div>
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={itemVariants}
            className="flex flex-wrap items-center gap-1.5"
          >
            <DnsChip label="SPF" pass={domain.spfPass} />
            <DnsChip label="DKIM" pass={domain.dkimPass} />
            <DnsChip label="DMARC" pass={domain.dmarcPass} />
          </motion.div>

          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={itemVariants}
            className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4"
          >
            <DetailStat label="Reputation" value={`${domain.reputationScore}`} tint={tintText} />
            <DetailStat label="Inbox rate" value={pct(domain.inboxRatePct)} tint="text-text" />
            <DetailStat label="Spam folder" value={pct(domain.spamFolderPct)} tint="text-text" />
            <DetailStat
              label="Mailboxes"
              value={nf(domain.mailboxCount)}
              tint="text-text"
            />
          </motion.div>
        </div>

        {/* Sparkline + incident column */}
        <div className="flex min-w-[260px] flex-col gap-3">
          <motion.div custom={4} initial="hidden" animate="visible" variants={itemVariants}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-text">Reputation 7d</span>
              <span className="font-mono text-text-dim">
                {domain.last7dScores[0]} → {domain.last7dScores[domain.last7dScores.length - 1]}
              </span>
            </div>
            <div className="rounded-lg border border-border-muted bg-surface-2 px-2 py-1">
              <Sparkline values={domain.last7dScores} color={sparkColor} width={240} height={56} />
            </div>
          </motion.div>

          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={itemVariants}
            className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2"
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Last incident
            </div>
            {domain.lastIncidentAgo && domain.lastIncidentKind ? (
              <div className="mt-1 flex items-center gap-2">
                {(() => {
                  const Icon = ALERT_KIND_ICON[domain.lastIncidentKind];
                  return <Icon className="h-3.5 w-3.5 text-accent3" />;
                })()}
                <span className="text-[12px] text-text">
                  {ALERT_KIND_LABEL[domain.lastIncidentKind]}
                </span>
                <span className="font-mono text-[10px] text-text-faint">
                  {domain.lastIncidentAgo}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-[12px] text-accent">No recent incidents</div>
            )}
          </motion.div>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text"
          aria-label="Close detail card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Recommended actions strip — sits below the main card body so the
          owner gets a "what should I do?" answer without leaving the page. */}
      <div className="border-t border-border-muted bg-surface-2/40 px-5 py-4">
        <motion.div
          custom={6}
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          className="flex items-center gap-2"
        >
          <Wand2 className="h-3.5 w-3.5 text-accent2" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text">
            Recommended actions
          </span>
          <span className="font-mono text-[10px] text-text-faint">
            generated from current DNS + placement
          </span>
        </motion.div>
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {actionsFor(domain).map((action, i) => (
            <ActionRow key={action.id} action={action} delay={0.16 + i * 0.05} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function DetailStat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className={`mt-0.5 font-mono text-[15px] font-semibold ${tint}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-state for the skeleton path
// ---------------------------------------------------------------------------

function EmptyTable(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border-muted bg-surface px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-text-dim">
        <Atom className="h-7 w-7" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-text">No domains observed yet</h3>
        <p className="text-sm text-text-dim">
          Connect sending domains for your sub-clients. As DNS, send volume, and provider feedback
          arrive, each domain takes its place on the periodic table — top rows are healthy, bottom
          rows are at-risk.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier summary card — one card per period, sits in a strip below the table
// ---------------------------------------------------------------------------
//
// Each card mirrors the period rail on the left of the table — same icon,
// same tint — and surfaces the period's aggregate KPI plus a chip-list of the
// element symbols in that period. Clicking a chip selects that domain so the
// keyboard / screen-reader path doesn't strictly need to traverse the grid.
// ---------------------------------------------------------------------------

interface TierSummaryCardProps {
  status: DomainStatus;
  domains: AgencyReputationData['domains'];
  selectedDomainId: string | null;
  onSelect: (id: string) => void;
  delay: number;
}

function TierSummaryCard({
  status,
  domains,
  selectedDomainId,
  onSelect,
  delay,
}: TierSummaryCardProps): JSX.Element {
  const meta = PERIOD_META[status];
  const Icon = meta.Icon;
  const tintText = STATUS_TEXT[status];
  const tintBorder = STATUS_BORDER[status];
  const tintBg = STATUS_BG[status];
  // Aggregate stats for the period
  const avgScore =
    domains.length === 0
      ? 0
      : Math.round(domains.reduce((acc, x) => acc + x.reputationScore, 0) / domains.length);
  const totalMailboxes = domains.reduce((acc, x) => acc + x.mailboxCount, 0);
  const incidentsCount = domains.filter((x) => x.lastIncidentAgo !== null).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={`relative overflow-hidden rounded-xl border ${tintBorder} bg-surface px-4 py-3`}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 w-0.5 ${tintBg.replace('/10', '/40')}`}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 ${tintText}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text">
            {meta.label}
          </span>
        </div>
        <span className={`font-mono text-lg font-semibold ${tintText}`}>{avgScore}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-text-dim">{meta.subtitle}</p>
      <div className="mt-2 flex items-center gap-3 text-[10px] font-mono text-text-faint">
        <span>
          {domains.length} {domains.length === 1 ? 'element' : 'elements'}
        </span>
        <span className="text-text-faint">•</span>
        <span>{nf(totalMailboxes)} mailboxes</span>
        <span className="text-text-faint">•</span>
        <span>
          {incidentsCount} {incidentsCount === 1 ? 'incident' : 'incidents'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {domains.length === 0 && (
          <span className="text-[11px] italic text-text-faint">No elements in this period</span>
        )}
        {domains.map((domain) => {
          const sym = symbolFor(domain);
          const sel = selectedDomainId === domain.id;
          return (
            <button
              key={domain.id}
              type="button"
              onClick={() => onSelect(domain.id)}
              className={`group inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                sel
                  ? `${tintBorder} ${tintBg} ${tintText}`
                  : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
              }`}
              title={`${domain.domain} — score ${domain.reputationScore}`}
            >
              <span className={tintText}>{sym}</span>
              <span className="text-text-faint group-hover:text-text-dim">
                {domain.reputationScore}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Recommended actions — generated from the selected domain's DNS + score
// ---------------------------------------------------------------------------
//
// We don't reach the network for these — they're deterministic rules driven by
// the same fields the periodic-table tile shows. The intent is to give the
// agency owner a 1-2 step "what should I do next?" without leaving the page.
// ---------------------------------------------------------------------------

interface ActionItem {
  id: string;
  label: string;
  detail: string;
  Icon: typeof Wand2;
  severity: 'info' | 'warn' | 'critical';
}

function actionsFor(domain: AgencyReputationData['domains'][number]): ActionItem[] {
  const out: ActionItem[] = [];
  if (!domain.spfPass) {
    out.push({
      id: 'a_spf',
      label: 'Repair SPF record',
      detail:
        'SPF lookup failed for the sending domain. Add the WarmPulse include directive to your DNS provider and re-validate from Tools.',
      Icon: ShieldX,
      severity: 'critical',
    });
  }
  if (!domain.dkimPass) {
    out.push({
      id: 'a_dkim',
      label: 'Re-publish DKIM key',
      detail:
        'DKIM key not resolved. Re-run the mailbox setup wizard to fetch a fresh selector and TXT record, then publish to DNS.',
      Icon: ShieldX,
      severity: 'critical',
    });
  }
  if (!domain.dmarcPass) {
    out.push({
      id: 'a_dmarc',
      label: 'Tighten DMARC policy',
      detail:
        'DMARC record missing or set to p=none. Move to p=quarantine after one week of clean reports to harden alignment.',
      Icon: ShieldAlert,
      severity: 'warn',
    });
  }
  if (domain.spamFolderPct >= 10) {
    out.push({
      id: 'a_spam',
      label: 'Cool down outbound volume',
      detail: `Spam folder rate ${pct(domain.spamFolderPct)}. Reduce daily target on hot mailboxes by 25% for 48h to let placement recover.`,
      Icon: Flame,
      severity: 'warn',
    });
  }
  if (domain.status === 'at_risk') {
    out.push({
      id: 'a_pool',
      label: 'Pin a dedicated peer pool',
      detail:
        'Move this sub-client to a dedicated peer pool with vetted reputable peers to reset engagement signal quality.',
      Icon: Orbit,
      severity: 'warn',
    });
  }
  if (out.length === 0) {
    out.push({
      id: 'a_ok',
      label: 'No interventions needed',
      detail:
        'DNS authentication is complete and placement metrics are within healthy bounds. Continue normal warmup cadence.',
      Icon: ShieldCheck,
      severity: 'info',
    });
  }
  return out;
}

function ActionRow({ action, delay }: { action: ActionItem; delay: number }): JSX.Element {
  const sev =
    action.severity === 'critical'
      ? 'text-accent3'
      : action.severity === 'warn'
        ? 'text-accent4'
        : 'text-accent';
  const Icon = action.Icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.32 }}
      className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-2"
    >
      <span className={`mt-0.5 ${sev}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-text">{action.label}</div>
        <p className="mt-0.5 text-[11px] leading-snug text-text-dim">{action.detail}</p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Domain index — a small searchable list, sits below the right rail
// ---------------------------------------------------------------------------
//
// On wide screens the periodic table is plenty, but on dense data (or for
// keyboard-first users) an alphabetical / score-ordered list is faster. The
// filter input is local-state; it does not touch the network. The list is
// rendered as little rows with a status dot, score, symbol, and sub-client.
// ---------------------------------------------------------------------------

interface DomainIndexProps {
  domains: AgencyReputationData['domains'];
  selectedDomainId: string | null;
  onSelect: (id: string) => void;
}

type IndexSort = 'score-desc' | 'score-asc' | 'name';

function DomainIndex({ domains, selectedDomainId, onSelect }: DomainIndexProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<IndexSort>('score-desc');
  const [statusFilter, setStatusFilter] = useState<DomainStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = domains.filter((d) =>
      statusFilter === 'all' ? true : d.status === statusFilter,
    );
    if (q.length > 0) {
      rows = rows.filter(
        (d) =>
          d.domain.toLowerCase().includes(q) ||
          d.subClientName.toLowerCase().includes(q) ||
          symbolFor(d).toLowerCase().includes(q),
      );
    }
    if (sort === 'score-desc') rows = [...rows].sort((a, b) => b.reputationScore - a.reputationScore);
    if (sort === 'score-asc') rows = [...rows].sort((a, b) => a.reputationScore - b.reputationScore);
    if (sort === 'name') rows = [...rows].sort((a, b) => a.domain.localeCompare(b.domain));
    return rows;
  }, [domains, query, sort, statusFilter]);

  const sortLabels: Record<IndexSort, string> = {
    'score-desc': 'High score',
    'score-asc': 'Low score',
    name: 'A → Z',
  };

  const filterOptions: Array<{ value: DomainStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'healthy', label: 'Noble' },
    { value: 'warming', label: 'Transition' },
    { value: 'at_risk', label: 'Reactive' },
  ];

  return (
    <section className="rounded-2xl border border-border-muted bg-surface px-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Element index</h3>
        <ClipboardList className="h-3.5 w-3.5 text-text-faint" />
      </div>
      <p className="mt-0.5 text-[11px] text-text-dim">
        Searchable / sortable list of every element on the table.
      </p>

      {/* Search box */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-text-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by domain or symbol"
          className="w-full bg-transparent text-[12px] text-text placeholder:text-text-faint focus:outline-none"
          aria-label="Filter domains"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-text-faint hover:text-text-dim"
            aria-label="Clear filter"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {filterOptions.map((opt) => {
          const active = statusFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                active
                  ? 'border-accent2/40 bg-accent2/10 text-accent2'
                  : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
              }`}
            >
              <Filter className="h-2.5 w-2.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Sort toggle */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-faint">
        <span>Sort</span>
        <div className="flex gap-1">
          {(['score-desc', 'score-asc', 'name'] as IndexSort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                sort === s
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
              }`}
            >
              {sortLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Result list */}
      <div className="mt-3 flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-muted bg-surface-2 px-3 py-4 text-center text-[11px] text-text-dim">
            No domains match this filter.
          </div>
        ) : (
          filtered.map((d) => {
            const sel = selectedDomainId === d.id;
            const tint = STATUS_TEXT[d.status];
            const dot = STATUS_DOT[d.status];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect(d.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  sel
                    ? 'border-accent2/40 bg-accent2/10'
                    : 'border-border-muted bg-surface-2 hover:border-border-muted hover:bg-surface'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
                <span className={`w-7 shrink-0 font-mono text-[11px] font-semibold ${tint}`}>
                  {symbolFor(d)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-text">{d.domain}</span>
                  <span className="block truncate text-[10px] text-text-faint">
                    {d.subClientName}
                  </span>
                </span>
                <span className="font-mono text-[12px] text-text-dim">{d.reputationScore}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="mt-2 text-right text-[10px] font-mono text-text-faint">
        Showing {filtered.length} of {domains.length}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgRepC3Periodic({
  data,
}: { data?: AgencyReputationData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  // electronFireKey is used to remount the electron-cloud SVG on every click
  // so the AnimatePresence enter animation re-runs (even if the same tile is
  // clicked twice in a row).
  const [electronFireKey, setElectronFireKey] = useState<number>(0);

  // Group domains by status so each "period" can be laid out left-to-right.
  const periods = useMemo(() => {
    const healthy = d.domains.filter((x) => x.status === 'healthy');
    const warming = d.domains.filter((x) => x.status === 'warming');
    const atRisk = d.domains.filter((x) => x.status === 'at_risk');
    return { healthy, warming, atRisk };
  }, [d.domains]);

  // Build a flat list of tiles with their slot and a global stagger index.
  // The global index is used for the entrance stagger so the visual flow is
  // strictly left-to-right, row-by-row — i.e. healthy row first, then warming,
  // then at-risk.
  const tilesWithSlots = useMemo(() => {
    const out: Array<{
      domain: AgencyReputationData['domains'][number];
      slot: TileSlot;
      staggerIndex: number;
    }> = [];
    let g = 0;
    periods.healthy.forEach((domain, i) => {
      out.push({
        domain,
        slot: slotForIndex('healthy', i, periods.healthy.length),
        staggerIndex: g++,
      });
    });
    periods.warming.forEach((domain, i) => {
      out.push({
        domain,
        slot: slotForIndex('warming', i, periods.warming.length),
        staggerIndex: g++,
      });
    });
    periods.atRisk.forEach((domain, i) => {
      out.push({
        domain,
        slot: slotForIndex('at_risk', i, periods.atRisk.length),
        staggerIndex: g++,
      });
    });
    return out;
  }, [periods]);

  const selectedDomain = useMemo(
    () => d.domains.find((x) => x.id === selectedDomainId) ?? null,
    [d.domains, selectedDomainId],
  );

  const selectedSlot = useMemo(() => {
    if (!selectedDomainId) return null;
    const found = tilesWithSlots.find((t) => t.domain.id === selectedDomainId);
    return found ? found.slot : null;
  }, [tilesWithSlots, selectedDomainId]);

  function handleSelect(id: string): void {
    if (selectedDomainId === id) {
      // Toggle off, but still re-fire the electron cloud so the visual feedback
      // is consistent.
      setSelectedDomainId(null);
      setElectronFireKey((k) => k + 1);
    } else {
      setSelectedDomainId(id);
      setElectronFireKey((k) => k + 1);
    }
  }

  const trendInfo = delta(d.summary.trend7dDelta);
  const TrendIcon = trendInfo.Icon;

  return (
    <div className="flex w-full flex-col gap-6 px-4 pb-12 pt-6 lg:px-6">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-muted bg-surface text-accent2 shadow-[0_0_24px_-12px_rgba(255, 138, 75,0.6)]">
            <Atom className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              <span>Reputation</span>
              <span className="text-text-faint">/</span>
              <span>Periodic Table</span>
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold text-text">{d.agency.name}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-text-dim">
              <Microscope className="h-3.5 w-3.5" />
              <span>Portfolio reputation laid out as elements</span>
              <span className="text-text-faint">•</span>
              <span className="font-mono">{d.agency.region}</span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid w-full flex-1 grid-cols-2 gap-3 sm:grid-cols-2 lg:max-w-[820px] lg:grid-cols-4">
          <KpiTile
            label="Healthy"
            value={`${d.summary.domainsHealthy}`}
            hint="Stable noble tier"
            Icon={ShieldCheck}
            accentCls="text-accent"
          />
          <KpiTile
            label="Warming"
            value={`${d.summary.domainsWarming}`}
            hint="Transition tier"
            Icon={Beaker}
            accentCls="text-accent4"
          />
          <KpiTile
            label="At-risk"
            value={`${d.summary.domainsAtRisk}`}
            hint="Reactive — intervene"
            Icon={FlaskConical}
            accentCls="text-accent3"
          />
          <KpiTile
            label="Overall score"
            value={`${d.summary.overallScore}`}
            hint={`${trendInfo.text} 7d`}
            Icon={Atom}
            accentCls="text-accent2"
          />
        </div>
      </header>

      {/* Sub-summary row — three more chips with secondary KPIs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px]">
          <Mail className="h-3.5 w-3.5 text-text-dim" />
          <span className="text-text-dim">Sends 24h</span>
          <span className="font-mono text-text">{nf(d.summary.totalSends24h)}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px]">
          <TrendingDown className="h-3.5 w-3.5 text-text-dim" />
          <span className="text-text-dim">Bounce</span>
          <span className="font-mono text-text">{pct(d.summary.bouncePct24h)}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px]">
          <Flame className="h-3.5 w-3.5 text-text-dim" />
          <span className="text-text-dim">Spam complaints</span>
          <span className="font-mono text-text">{pct(d.summary.spamComplaintPct24h)}</span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px] ${trendInfo.cls}`}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          <span className="font-mono">{trendInfo.text}</span>
          <span className="text-text-dim">7-day delta</span>
        </div>
      </div>

      {/* Main canvas — table + right rail */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface px-4 py-4 lg:px-6 lg:py-5">
          {/* Caption */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text">Portfolio periodic table</h2>
              <p className="mt-0.5 max-w-[640px] text-[11px] text-text-dim">
                Each tile is a sending domain. Rows are reputation tiers — Period I (noble) is
                healthy, II (transition) is warming, III (reactive) is at-risk. Click an element to
                read its full card below.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-faint">
              <Layers className="h-3.5 w-3.5" />
              <span>
                {d.domains.length} elements · {GROUPS} groups · 3 periods
              </span>
            </div>
          </div>

          {d.domains.length === 0 ? (
            <EmptyTable />
          ) : (
            <>
              {/* Group axis (column numbers, with a gutter for the period-rail) */}
              <div
                className="grid items-end pb-1"
                style={{
                  gridTemplateColumns: `200px repeat(${GROUPS}, minmax(0, 1fr))`,
                  columnGap: '0.5rem',
                }}
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-text-faint">
                  Group / Cluster
                </div>
                {Array.from({ length: GROUPS }, (_, i) => (
                  <div
                    key={i}
                    className="text-center font-mono text-[10px] text-text-faint"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* The periodic grid itself. We use a named "period-rail" track on
                  the left for the period label so each row labels itself. */}
              <div
                className="relative grid gap-2"
                style={{
                  gridTemplateColumns: `[period-rail] 200px repeat(${GROUPS}, minmax(0, 1fr))`,
                  gridTemplateRows: 'repeat(3, minmax(72px, 1fr))',
                }}
              >
                {/* Period rails (rows) */}
                <PeriodLabel
                  meta={PERIOD_META.healthy}
                  rowIndex={1}
                  count={periods.healthy.length}
                />
                <PeriodLabel
                  meta={PERIOD_META.warming}
                  rowIndex={2}
                  count={periods.warming.length}
                />
                <PeriodLabel
                  meta={PERIOD_META.at_risk}
                  rowIndex={3}
                  count={periods.atRisk.length}
                />

                {/* The element tiles, each in its (row, col) cell */}
                {tilesWithSlots.map(({ domain, slot, staggerIndex }) => (
                  <ElementTile
                    key={domain.id}
                    domain={domain}
                    slot={slot}
                    index={staggerIndex}
                    selected={selectedDomainId === domain.id}
                    onSelect={() => handleSelect(domain.id)}
                  />
                ))}

                {/* Electron cloud sits in the same cell as the selected tile */}
                {selectedSlot && (
                  <ElectronCloud slot={selectedSlot} fireKey={electronFireKey} />
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 border-t border-border-muted pt-3 text-[11px] text-text-dim">
                <span className="text-text-faint">Legend:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                  Healthy
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent4" aria-hidden="true" />
                  Warming
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent3" aria-hidden="true" />
                  At-risk
                </span>
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-accent" /> SPF + DKIM + DMARC
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3 text-accent3" /> DNS issue
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-text-faint">
                  <Sparkles className="h-3 w-3" />
                  Click any element for its detail card
                </span>
              </div>

              {/* Detail card — bottom of the table canvas */}
              <AnimatePresence>
                {selectedDomain && (
                  <DetailCard
                    domain={selectedDomain}
                    onClose={() => setSelectedDomainId(null)}
                  />
                )}
              </AnimatePresence>

              {/* Tier summary strip — three cards mirroring the period rails.
                  Surfaces aggregate stats + a chip list of element symbols so
                  the table also works as a navigable index for screen-readers
                  and keyboard users. */}
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                <TierSummaryCard
                  status="healthy"
                  domains={periods.healthy}
                  selectedDomainId={selectedDomainId}
                  onSelect={handleSelect}
                  delay={0.05}
                />
                <TierSummaryCard
                  status="warming"
                  domains={periods.warming}
                  selectedDomainId={selectedDomainId}
                  onSelect={handleSelect}
                  delay={0.12}
                />
                <TierSummaryCard
                  status="at_risk"
                  domains={periods.atRisk}
                  selectedDomainId={selectedDomainId}
                  onSelect={handleSelect}
                  delay={0.19}
                />
              </div>
            </>
          )}
        </section>

        {/* Right rail — provider mix + alerts ticker + element index */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border-muted bg-surface px-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Provider mix</h3>
              <Orbit className="h-3.5 w-3.5 text-text-faint" />
            </div>
            <p className="mt-0.5 text-[11px] text-text-dim">
              Inbox / spam / blocked share by mailbox provider, last 24h.
            </p>

            <div className="mt-4 flex flex-col gap-4">
              {d.providers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-muted bg-surface-2 px-3 py-6 text-center text-[11px] text-text-dim">
                  No provider signal yet.
                </div>
              ) : (
                d.providers.map((p, i) => (
                  <ProviderBar key={p.id} provider={p} delay={0.1 + i * 0.08} />
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border-muted bg-surface px-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Recent alerts</h3>
              <Bell className="h-3.5 w-3.5 text-text-faint" />
            </div>
            <p className="mt-0.5 text-[11px] text-text-dim">
              Live ticker — most recent across the portfolio.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {d.recentAlerts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-muted bg-surface-2 px-3 py-6 text-center text-[11px] text-text-dim">
                  No alerts in the last 24h.
                </div>
              ) : (
                d.recentAlerts.map((a, i) => (
                  <AlertRow key={a.id} alert={a} delay={0.12 + i * 0.06} />
                ))
              )}
            </div>
          </section>

          {/* Element index — searchable / sortable list of every domain. Drops
              out of view entirely when the periodic table is empty. */}
          {d.domains.length > 0 && (
            <DomainIndex
              domains={d.domains}
              selectedDomainId={selectedDomainId}
              onSelect={handleSelect}
            />
          )}

          {/* Subtle agent footer — the chemistry-language explainer card. */}
          <section className="rounded-2xl border border-border-muted bg-surface-2 px-4 py-4">
            <div className="flex items-center gap-2">
              <CircleDot className="h-3.5 w-3.5 text-accent2" />
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text">
                Reading the table
              </h3>
            </div>
            <ul className="mt-2 space-y-1.5 text-[11px] text-text-dim">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3 w-3 text-accent" />
                <span>
                  <span className="text-text">Period I (top)</span> — noble. Stable inbox
                  placement, full DNS auth.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Beaker className="mt-0.5 h-3 w-3 text-accent4" />
                <span>
                  <span className="text-text">Period II (middle)</span> — transition. Climbing,
                  not yet noble.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FlaskConical className="mt-0.5 h-3 w-3 text-accent3" />
                <span>
                  <span className="text-text">Period III (bottom)</span> — reactive. DNS or
                  complaint break, pulses on the table.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="mt-0.5 h-3 w-3 text-accent2" />
                <span>
                  Click any element to surface its full card at the bottom of the canvas.
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default AgRepC3Periodic;
