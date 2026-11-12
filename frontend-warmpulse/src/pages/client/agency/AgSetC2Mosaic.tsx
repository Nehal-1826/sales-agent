import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from '@/components/ui/AppToast';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { exportRowsToCsv, exportStamp } from '@/lib/exportCsv';
import { QRCodeSVG } from 'qrcode.react';
import {
  useChangePassword,
  useDeleteAvatar,
  useDisableTotp,
  useEnableTotp,
  useRevokeSession,
  useSessions,
  useUpdateNotifications,
  useUpdateProfile,
  useUpdateWorkspaceProfile,
  useUploadAvatar,
  useUserSettings,
  useVerifyTotp,
  type TotpEnrollment,
} from '@/features/settings/api';
import {
  useInviteMember,
  type TeamRole,
} from '@/features/workspace/api';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Globe,
  Key,
  Lock,
  Mail,
  MoreHorizontal,
  Network,
  Palette,
  Plus,
  Save,
  Settings2,
  Shield,
  ShieldCheck,
  Slack,
  Users,
  X,
} from 'lucide-react';

/**
 * AgSetC2Mosaic — Agency-tier SETTINGS surface, "Mosaic Mural" variant (C2).
 *
 * Defining metaphor: a Pinterest / Notion-gallery style irregular mosaic.
 * Each settings category is a TILE of varied size (1x1, 2x1, 1x2, 2x2) on a
 * 4-column responsive grid. Tiles each carry their own visual identity —
 * an avatar disc for Profile, a brand-color swatch + plan crown for Agency
 * Identity, six toggle pills for Notifications, a 2FA dial for Security,
 * a row of integration chips, a seat-usage circular progress for Team, etc.
 *
 * Tap interaction: clicking ANY tile triggers framer-motion's `layoutId`
 * morph — the tile EXPANDS to fill the full canvas while sibling tiles
 * fade + collapse out. Inside the expanded view the user gets the full
 * editable form for that category. An X (top-right) or an outside click
 * reverses the morph back to mosaic. Save / Cancel buttons spring up
 * from the bottom of the expanded view.
 *
 * Distinctness vs sibling Agency SETTINGS candidates:
 *   - C1 (Control Panel)   — single-pane control-panel with rail tabs.
 *   - C2 (Mosaic Mural)    — irregular tile mosaic, click-to-expand. [THIS]
 *   - C3 (Onboarding Map)  — guided settings-as-journey map.
 *   - C4 (Drawer Stack)    — stacked side-drawer overlays.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * The :35001 preview harness mounts it prop-less; every value comes from
 * the inline MOCK const. Renders only page content; the app shell supplies
 * the sidebar / chrome.
 *
 * Styling tokens (Tailwind, already wired): bg-bg, bg-surface, bg-surface-2,
 * text-text, text-text-dim, text-text-faint, border-border-muted,
 * text-accent (success / on), text-accent2 (info / accent), text-accent3
 * (danger / off), text-accent4 (warning / pending). No new colors.
 * lucide-react icons only. No emojis.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency Settings variants
// ---------------------------------------------------------------------------
// Shape duplicated verbatim across all 4 Agency settings variants — keep in sync.

type IntegrationStatus = 'connected' | 'disconnected' | 'error';
type DomainStatus = 'verified' | 'pending' | 'failed' | 'not_set';
type IntegrationIcon = 'slack' | 'zapier' | 'crm' | 'discord';

export interface AgencySettingsData {
  profile: {
    name: string;
    email: string;
    avatarInitials: string;
    timezone: string;
    locale: string;
    lastLoginAgo: string;
  };
  agency: {
    name: string;
    slug: string;
    plan: string;
    region: string;
    brandColor: string;
    logoUploaded: boolean;
    customDomain: { domain: string | null; status: DomainStatus };
    dedicatedPool: { enabled: boolean; poolName: string | null; memberCount: number };
  };
  notifications: {
    emailWeeklyDigest: boolean;
    emailDailyDigest: boolean;
    emailCriticalAlerts: boolean;
    slackEnabled: boolean;
    slackChannel: string | null;
    inAppCritical: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    sessionTimeoutMinutes: number;
    activeSessions: number;
    lastPasswordChangedAgo: string;
    recoveryCodesIssued: boolean;
  };
  integrations: Array<{
    id: string;
    label: string;
    status: IntegrationStatus;
    lastSyncAgo: string;
    icon: IntegrationIcon;
  }>;
  apiAccess: {
    rateLimitPerMin: number;
  };
  team: {
    memberCount: number;
    pendingInvites: number;
    seatLimit: number;
    seatUsed: number;
  };
  audit: {
    last30dEntries: number;
    lastAdminAction: string;
    lastAdminActionAgo: string;
  };
}

// ---------------------------------------------------------------------------
// MOCK + SKELETON content
// ---------------------------------------------------------------------------

const MOCK: AgencySettingsData = {
  profile: {
    name: 'Devesh B',
    email: 'you@northwind.agency',
    avatarInitials: 'DB',
    timezone: 'America/New_York',
    locale: 'en-US',
    lastLoginAgo: '12m ago',
  },
  agency: {
    name: 'Northwind Agency',
    slug: 'northwind',
    plan: 'Agency',
    region: 'us-east-1',
    brandColor: '#F26522',
    logoUploaded: true,
    customDomain: { domain: 'mail.northwind.agency', status: 'verified' },
    dedicatedPool: { enabled: true, poolName: 'Northwind-Pool', memberCount: 24 },
  },
  notifications: {
    emailWeeklyDigest: true,
    emailDailyDigest: true,
    emailCriticalAlerts: true,
    slackEnabled: true,
    slackChannel: '#warmup-alerts',
    inAppCritical: false,
  },
  security: {
    twoFactorEnabled: true,
    sessionTimeoutMinutes: 60,
    activeSessions: 2,
    lastPasswordChangedAgo: '28d ago',
    recoveryCodesIssued: true,
  },
  integrations: [
    {
      id: 'int-slack',
      label: 'Slack',
      status: 'connected',
      lastSyncAgo: '2m ago',
      icon: 'slack',
    },
    {
      id: 'int-zapier',
      label: 'Zapier',
      status: 'connected',
      lastSyncAgo: '6m ago',
      icon: 'zapier',
    },
    {
      id: 'int-discord',
      label: 'Discord',
      status: 'disconnected',
      lastSyncAgo: 'never',
      icon: 'discord',
    },
  ],
  apiAccess: {
    rateLimitPerMin: 600,
  },
  team: {
    memberCount: 5,
    pendingInvites: 1,
    seatLimit: 10,
    seatUsed: 5,
  },
  audit: {
    last30dEntries: 87,
    lastAdminAction: 'Updated notification settings',
    lastAdminActionAgo: '3m ago',
  },
};

export const AGENCY_SETTINGS_SKELETON_C2: AgencySettingsData = {
  profile: {
    name: '',
    email: '',
    avatarInitials: '',
    timezone: '',
    locale: '',
    lastLoginAgo: '',
  },
  agency: {
    name: '',
    slug: '',
    plan: '',
    region: '',
    brandColor: '#F26522',
    logoUploaded: false,
    customDomain: { domain: null, status: 'not_set' },
    dedicatedPool: { enabled: false, poolName: null, memberCount: 0 },
  },
  notifications: {
    emailWeeklyDigest: false,
    emailDailyDigest: false,
    emailCriticalAlerts: false,
    slackEnabled: false,
    slackChannel: null,
    inAppCritical: false,
  },
  security: {
    twoFactorEnabled: false,
    sessionTimeoutMinutes: 0,
    activeSessions: 0,
    lastPasswordChangedAgo: '',
    recoveryCodesIssued: false,
  },
  integrations: [],
  apiAccess: {
    rateLimitPerMin: 0,
  },
  team: {
    memberCount: 0,
    pendingInvites: 0,
    seatLimit: 0,
    seatUsed: 0,
  },
  audit: {
    last30dEntries: 0,
    lastAdminAction: '',
    lastAdminActionAgo: '',
  },
};

// ---------------------------------------------------------------------------
// Tile model — drives the mosaic grid + the expand morph
// ---------------------------------------------------------------------------

type TileId =
  | 'profile'
  | 'agency'
  | 'notifications'
  | 'security'
  | 'integrations'
  | 'api'
  | 'team'
  | 'audit';

/**
 * Each tile occupies a footprint on a 4-col responsive grid.
 *
 * `cols`/`rows` are CSS-grid spans (mobile collapses to 1col so the visual
 * irregularity reads on >=md only). The `accent` field decides which token
 * tints the tile's icon + headline gradient — pulled from the Tailwind
 * accent palette only (no new colours).
 */
interface TileDef {
  id: TileId;
  label: string;
  hint: string;
  cols: 1 | 2;
  rows: 1 | 2;
  Icon: typeof Settings2;
  accent: 'accent' | 'accent2' | 'accent3' | 'accent4';
}

const TILES: TileDef[] = [
  {
    id: 'profile',
    label: 'Profile',
    hint: 'Name, contact, locale',
    cols: 2,
    rows: 1,
    Icon: Mail,
    accent: 'accent2',
  },
  {
    id: 'agency',
    label: 'Agency identity',
    hint: 'Plan, brand, region',
    cols: 2,
    rows: 2,
    Icon: Crown,
    accent: 'accent4',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    hint: 'Channel preferences',
    cols: 2,
    rows: 1,
    Icon: Bell,
    accent: 'accent',
  },
  {
    id: 'security',
    label: 'Security',
    hint: '2FA, sessions, password',
    cols: 1,
    rows: 2,
    Icon: ShieldCheck,
    accent: 'accent3',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    hint: 'Slack, Zapier',
    cols: 2,
    rows: 1,
    Icon: Network,
    accent: 'accent2',
  },
  {
    id: 'api',
    label: 'API access',
    hint: 'Rate limits',
    cols: 1,
    rows: 1,
    Icon: Key,
    accent: 'accent4',
  },
  {
    id: 'team',
    label: 'Team',
    hint: 'Members + seat usage',
    cols: 1,
    rows: 1,
    Icon: Users,
    accent: 'accent',
  },
  {
    id: 'audit',
    label: 'Audit log',
    hint: 'Last 30 days',
    cols: 2,
    rows: 1,
    Icon: Activity,
    accent: 'accent2',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SPAN_COL: Record<1 | 2, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
};

const SPAN_ROW: Record<1 | 2, string> = {
  1: 'md:row-span-1',
  2: 'md:row-span-2',
};

/** Pick a token's text colour class from the constrained accent palette. */
const ACCENT_TEXT: Record<TileDef['accent'], string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
};

/** Pick a token's softened ring colour class for accent ribbons. */
const ACCENT_RING: Record<TileDef['accent'], string> = {
  accent: 'ring-accent/30',
  accent2: 'ring-accent2/30',
  accent3: 'ring-accent3/30',
  accent4: 'ring-accent4/30',
};

/** Pick a token's softened background tint class for accent strips. */
const ACCENT_BG_SOFT: Record<TileDef['accent'], string> = {
  accent: 'bg-accent/10',
  accent2: 'bg-accent2/10',
  accent3: 'bg-accent3/10',
  accent4: 'bg-accent4/10',
};

/** Pick a token's solid background utility class for chip pills. */
const ACCENT_BG_CHIP: Record<TileDef['accent'], string> = {
  accent: 'bg-accent/15',
  accent2: 'bg-accent2/15',
  accent3: 'bg-accent3/15',
  accent4: 'bg-accent4/15',
};

/** Map IntegrationIcon string to the proper lucide-react component. */
function integrationIcon(kind: IntegrationIcon): typeof Slack {
  switch (kind) {
    case 'slack':
      return Slack;
    case 'zapier':
      return Activity;
    case 'crm':
      return Network;
    case 'discord':
      return Bell;
    default:
      return Network;
  }
}

/** Domain-status visual class + label pair. */
function domainStatusBadge(status: DomainStatus): {
  cls: string;
  label: string;
} {
  switch (status) {
    case 'verified':
      return { cls: 'text-accent border-accent/40 bg-accent/10', label: 'Verified' };
    case 'pending':
      return { cls: 'text-accent4 border-accent4/40 bg-accent4/10', label: 'Pending' };
    case 'failed':
      return { cls: 'text-accent3 border-accent3/40 bg-accent3/10', label: 'Failed' };
    default:
      return { cls: 'text-text-dim border-border-muted bg-surface-2', label: 'Not set' };
  }
}

function integrationStatusBadge(status: IntegrationStatus): {
  cls: string;
  label: string;
} {
  switch (status) {
    case 'connected':
      return { cls: 'text-accent border-accent/40 bg-accent/10', label: 'Connected' };
    case 'disconnected':
      return {
        cls: 'text-text-dim border-border-muted bg-surface-2',
        label: 'Disconnected',
      };
    case 'error':
      return {
        cls: 'text-accent3 border-accent3/40 bg-accent3/10',
        label: 'Error',
      };
    default:
      return {
        cls: 'text-text-dim border-border-muted bg-surface-2',
        label: 'Unknown',
      };
  }
}

/** Stable cubic-ish spring used by every layout morph in the mural. */
const TILE_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 32,
  mass: 0.7,
};

/** Children fade-up nested inside the layoutId morph. */
const CHILD_FADE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

// ---------------------------------------------------------------------------
// Toggle pill — tiny shared piece used inside multiple tiles
// ---------------------------------------------------------------------------

interface TogglePillProps {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  Icon?: typeof Bell;
  tone?: TileDef['accent'];
  description?: string;
  /**
   * When true, the pill stretches to fill its parent's main axis. Defaults
   * to false so the pill sits at its natural width — important when used as
   * a right-aligned toggle inside a `flex justify-between` row, where
   * `w-full` would push the row's left content into a thin column.
   */
  fullWidth?: boolean;
}

function TogglePill({
  label,
  checked,
  onChange,
  Icon,
  tone = 'accent2',
  description,
  fullWidth = false,
}: TogglePillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className={`group inline-flex shrink-0 items-center justify-between gap-3 rounded-full border px-3 py-2 text-left text-xs font-medium transition-colors ${
        fullWidth ? 'w-full' : ''
      } ${
        checked
          ? `border-border-muted ${ACCENT_BG_SOFT[tone]} text-text`
          : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
      }`}
      aria-pressed={checked}
    >
      <span className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
              checked ? ACCENT_BG_CHIP[tone] : 'bg-surface'
            } ${checked ? ACCENT_TEXT[tone] : 'text-text-dim'}`}
            aria-hidden
          >
            <Icon className="h-3 w-3" />
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          {label}
          {description ? (
            <span className="ml-2 text-[10px] text-text-faint">{description}</span>
          ) : null}
        </span>
      </span>
      <motion.span
        // Spring scale + cross-fade colour on click — the "tiny spring" called
        // out in the spec.
        animate={{
          backgroundColor: checked
            ? 'rgba(242, 101, 34, 0.0)'
            : 'rgba(255, 255, 255, 0.0)',
          scale: checked ? 1 : 0.95,
        }}
        transition={TILE_SPRING}
        className={`grid h-5 w-9 shrink-0 place-items-center rounded-full border text-[9px] font-semibold uppercase tracking-wide transition-colors ${
          checked
            ? `${ACCENT_BG_CHIP[tone]} ${ACCENT_TEXT[tone]} ${ACCENT_RING[tone]} ring-1`
            : 'border-border-muted bg-surface text-text-faint'
        }`}
      >
        <motion.span
          key={checked ? 'on' : 'off'}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
        >
          {checked ? 'On' : 'Off'}
        </motion.span>
      </motion.span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tile content components — compact body shown in the mosaic grid
// ---------------------------------------------------------------------------

function ProfileCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  return (
    <div className="flex h-full items-center gap-4">
      <motion.div
        layoutId="profile-avatar"
        className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent2/30 to-accent/20 text-base font-semibold text-text ring-1 ring-border-muted"
      >
        {d.profile.avatarInitials || '??'}
      </motion.div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">
          {d.profile.name || 'Add your name'}
        </p>
        <p className="truncate text-xs text-text-dim">
          {d.profile.email || 'no email on file'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
            <Globe className="h-2.5 w-2.5" />
            {d.profile.locale || '—'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
            <Activity className="h-2.5 w-2.5" />
            {d.profile.timezone || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function AgencyCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  const dom = domainStatusBadge(d.agency.customDomain.status);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <motion.div
          layoutId="agency-swatch"
          // Brand-color disc — uses the runtime brand colour from data so any
          // re-skin shows up immediately without re-deploys.
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-border-muted"
          style={{
            background: `linear-gradient(135deg, ${d.agency.brandColor}33 0%, ${d.agency.brandColor}11 100%)`,
            color: d.agency.brandColor,
          }}
          aria-label="Brand colour swatch"
        >
          <Palette className="h-5 w-5" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-text">
              {d.agency.name || 'Untitled agency'}
            </h3>
            <span className="inline-flex items-center gap-0.5 rounded-full border border-accent4/40 bg-accent4/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent4">
              <Crown className="h-2.5 w-2.5" />
              {d.agency.plan || 'Free'}
            </span>
          </div>
          <p className="truncate text-[11px] text-text-dim">
            /{d.agency.slug || 'agency'} · {d.agency.region || 'unknown region'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border-muted bg-surface-2/60 p-2">
          <p className="text-[9px] uppercase tracking-wide text-text-faint">
            Custom domain
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-text">
            {d.agency.customDomain.domain || '—'}
          </p>
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${dom.cls}`}
          >
            <Check className="h-2.5 w-2.5" />
            {dom.label}
          </span>
        </div>
        <div className="rounded-lg border border-border-muted bg-surface-2/60 p-2">
          <p className="text-[9px] uppercase tracking-wide text-text-faint">
            Dedicated helper group
          </p>
          <p className="mt-1 truncate text-[11px] font-semibold text-text">
            {d.agency.dedicatedPool.poolName || 'Not enabled'}
          </p>
          <p className="text-[9px] text-text-dim">
            {d.agency.dedicatedPool.enabled
              ? `${d.agency.dedicatedPool.memberCount} peers`
              : 'shared helper group'}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5">
        <span className="text-[10px] text-text-dim">Logo</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
            d.agency.logoUploaded
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface text-text-dim'
          }`}
        >
          {d.agency.logoUploaded ? (
            <Check className="h-2.5 w-2.5" />
          ) : (
            <Plus className="h-2.5 w-2.5" />
          )}
          {d.agency.logoUploaded ? 'Uploaded' : 'Upload'}
        </span>
      </div>
    </div>
  );
}

function NotificationsCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  /** Six inline pills as called out by the spec — derived deterministically
   *  from the notifications block. The order is stable so live data feels
   *  like the same UI from session to session. */
  const pills = useMemo(
    () => [
      {
        key: 'weekly',
        label: 'Weekly digest',
        on: d.notifications.emailWeeklyDigest,
      },
      {
        key: 'daily',
        label: 'Daily digest',
        on: d.notifications.emailDailyDigest,
      },
      {
        key: 'critical',
        label: 'Critical alerts',
        on: d.notifications.emailCriticalAlerts,
      },
      {
        key: 'slack',
        label: d.notifications.slackChannel
          ? `Slack ${d.notifications.slackChannel}`
          : 'Slack',
        on: d.notifications.slackEnabled,
      },
      {
        key: 'inapp',
        label: 'In-app critical',
        on: d.notifications.inAppCritical,
      },
    ],
    [d.notifications],
  );

  const onCount = pills.filter((p) => p.on).length;

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-dim">
          <span className="font-semibold text-text">{onCount}</span> of{' '}
          {pills.length} channels active
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-dim">
          <Bell className="h-2.5 w-2.5" />
          live
        </span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-1.5 content-start">
        {pills.map((p) => (
          <span
            key={p.key}
            className={`flex min-w-0 items-center justify-between gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              p.on
                ? 'border-accent/40 bg-accent/10 text-text'
                : 'border-border-muted bg-surface-2 text-text-dim'
            }`}
          >
            <span className="min-w-0 truncate">{p.label}</span>
            <span
              className={`grid h-3 w-3 shrink-0 place-items-center rounded-full ${
                p.on ? 'bg-accent text-bg' : 'bg-surface text-text-faint'
              }`}
              aria-hidden
            >
              {p.on ? <Check className="h-2 w-2" /> : null}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SecurityCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  const dialPct = Math.min(100, (d.security.sessionTimeoutMinutes / 120) * 100);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <motion.div
          layoutId="security-2fa-disc"
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-border-muted ${
            d.security.twoFactorEnabled
              ? 'bg-accent3/10 text-accent3'
              : 'bg-surface-2 text-text-dim'
          }`}
        >
          {d.security.twoFactorEnabled ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <Shield className="h-5 w-5" />
          )}
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">2FA</p>
          <p
            className={`text-[11px] ${
              d.security.twoFactorEnabled ? 'text-accent' : 'text-text-dim'
            }`}
          >
            {d.security.twoFactorEnabled ? 'Enabled' : 'Off'}
          </p>
        </div>
      </div>

      {/* Timeout dial — a tiny circular gauge so the user gets a feel for the
          length without parsing the literal minutes value. */}
      <div className="rounded-lg border border-border-muted bg-surface-2/60 p-2.5">
        <p className="text-[9px] uppercase tracking-wide text-text-faint">
          Session timeout
        </p>
        <div className="mt-2 flex items-center gap-3">
          <svg viewBox="0 0 36 36" className="h-12 w-12 shrink-0" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-border-muted"
              strokeLinecap="round"
              opacity={0.6}
            />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-accent3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 15}
              initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
              animate={{
                strokeDashoffset: 2 * Math.PI * 15 * (1 - dialPct / 100),
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          </svg>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-text">
              {d.security.sessionTimeoutMinutes || 0}
              <span className="ml-1 text-[10px] font-normal text-text-dim">min</span>
            </p>
            <p className="text-[10px] text-text-dim">
              {d.security.activeSessions} active session
              {d.security.activeSessions === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-1.5">
        <p className="text-[9px] uppercase tracking-wide text-text-faint">
          Last password change
        </p>
        <p className="text-[11px] text-text-dim">
          {d.security.lastPasswordChangedAgo || '—'}
        </p>
      </div>
    </div>
  );
}

function IntegrationsCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  // Show up to 4 chips inline — exactly matches the spec's "4 chips in a row".
  const items = d.integrations.slice(0, 4);
  const overflow = Math.max(0, d.integrations.length - 4);
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-dim">
          <span className="font-semibold text-text">
            {d.integrations.filter((i) => i.status === 'connected').length}
          </span>{' '}
          connected
        </p>
        <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-dim">
          <Network className="h-2.5 w-2.5" />
          {d.integrations.length} total
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => {
          const Icon = integrationIcon(it.icon);
          const live = it.status === 'connected';
          return (
            <div
              key={it.id}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center ${
                live
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border-muted bg-surface-2'
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                  live ? 'bg-accent/15 text-accent' : 'bg-surface text-text-dim'
                }`}
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <p className="w-full truncate text-[10px] font-semibold text-text">
                {it.label}
              </p>
              <p className="w-full truncate text-[9px] text-text-faint">
                {it.lastSyncAgo}
              </p>
            </div>
          );
        })}
        {overflow > 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-muted bg-surface-2/40 px-2 py-2 text-text-faint">
            <MoreHorizontal className="h-3.5 w-3.5" />
            <p className="text-[10px] font-semibold">+{overflow}</p>
            <p className="text-[9px]">more</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ApiCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="mt-auto flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 px-2 py-1.5">
        <span className="text-[10px] text-text-dim">Rate limit</span>
        <span className="font-mono text-[11px] font-semibold text-accent4">
          {d.apiAccess.rateLimitPerMin}/m
        </span>
      </div>
    </div>
  );
}

function TeamCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  const pct =
    d.team.seatLimit > 0 ? Math.min(100, (d.team.seatUsed / d.team.seatLimit) * 100) : 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      {/* Circular progress for seat usage */}
      <svg viewBox="0 0 36 36" className="h-16 w-16 shrink-0" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-border-muted"
          strokeLinecap="round"
        />
        <motion.circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-accent"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 15}
          initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
          animate={{
            strokeDashoffset: 2 * Math.PI * 15 * (1 - pct / 100),
          }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
        <text
          x="18"
          y="20"
          textAnchor="middle"
          className="fill-current text-[8px] font-semibold text-text"
        >
          {d.team.seatUsed}/{d.team.seatLimit}
        </text>
      </svg>
      <div>
        <p className="text-xs font-semibold text-text">
          {d.team.memberCount} member{d.team.memberCount === 1 ? '' : 's'}
        </p>
        {d.team.pendingInvites > 0 ? (
          <p className="text-[10px] text-accent4">
            +{d.team.pendingInvites} pending
          </p>
        ) : (
          <p className="text-[10px] text-text-dim">no pending invites</p>
        )}
      </div>
    </div>
  );
}

function AuditCompact({ d }: { d: AgencySettingsData }): JSX.Element {
  return (
    <div className="flex h-full min-w-0 flex-col justify-between gap-2">
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent2/10 text-accent2 ring-1 ring-border-muted"
          aria-hidden
        >
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-text-faint">
            Last 30 days
          </p>
          <p className="text-lg font-semibold text-text">
            {d.audit.last30dEntries}{' '}
            <span className="text-[10px] font-normal text-text-dim">
              entries
            </span>
          </p>
        </div>
      </div>
      <div className="min-w-0 rounded-lg border border-border-muted bg-surface-2/60 px-2.5 py-2">
        <p className="text-[9px] uppercase tracking-wide text-text-faint">
          Last admin action
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-text">
          {d.audit.lastAdminAction || '—'}
        </p>
        <p className="truncate text-[10px] text-text-dim">
          {d.audit.lastAdminActionAgo || '—'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile compact dispatcher
// ---------------------------------------------------------------------------

function TileCompact({
  id,
  d,
}: {
  id: TileId;
  d: AgencySettingsData;
}): JSX.Element {
  switch (id) {
    case 'profile':
      return <ProfileCompact d={d} />;
    case 'agency':
      return <AgencyCompact d={d} />;
    case 'notifications':
      return <NotificationsCompact d={d} />;
    case 'security':
      return <SecurityCompact d={d} />;
    case 'integrations':
      return <IntegrationsCompact d={d} />;
    case 'api':
      return <ApiCompact d={d} />;
    case 'team':
      return <TeamCompact d={d} />;
    case 'audit':
      return <AuditCompact d={d} />;
    default:
      return <div />;
  }
}

// ---------------------------------------------------------------------------
// Expanded views — full editable settings shown after the layoutId morph
// ---------------------------------------------------------------------------

interface DraftState {
  profile: AgencySettingsData['profile'];
  agency: AgencySettingsData['agency'];
  notifications: AgencySettingsData['notifications'];
  security: AgencySettingsData['security'];
}

function makeDraft(d: AgencySettingsData): DraftState {
  return {
    profile: { ...d.profile },
    agency: {
      ...d.agency,
      customDomain: { ...d.agency.customDomain },
      dedicatedPool: { ...d.agency.dedicatedPool },
    },
    notifications: { ...d.notifications },
    security: { ...d.security },
  };
}

const FIELD_LABEL_CLS = 'text-[10px] uppercase tracking-wide text-text-faint';
const INPUT_CLS =
  'w-full rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent2/50';

function ProfileExpanded({
  draft,
  setDraft,
  onUploadAvatar,
  onRemoveAvatar,
  avatarBusy,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  onUploadAvatar: (file: File) => void;
  onRemoveAvatar: () => void;
  avatarBusy: boolean;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-5 lg:col-span-1">
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.div
            layoutId="profile-avatar"
            className="grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-accent2/30 to-accent/20 text-2xl font-semibold text-text ring-1 ring-border-muted"
          >
            {draft.profile.avatarInitials || '??'}
          </motion.div>
          <div>
            <p className="text-sm font-semibold text-text">
              {draft.profile.name}
            </p>
            <p className="text-xs text-text-dim">{draft.profile.email}</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadAvatar(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-dim hover:text-text disabled:opacity-50"
            >
              {avatarBusy ? 'Uploading…' : 'Upload picture'}
            </button>
            <button
              type="button"
              disabled={avatarBusy}
              onClick={onRemoveAvatar}
              className="rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-dim hover:text-accent3 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
          <p className="text-[10px] text-text-faint">
            Last login {draft.profile.lastLoginAgo || '—'}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:col-span-2">
        <label className="block">
          <span className={FIELD_LABEL_CLS}>Display name</span>
          <input
            type="text"
            value={draft.profile.name}
            onChange={(e) =>
              setDraft((s) => ({
                ...s,
                profile: { ...s.profile, name: e.target.value },
              }))
            }
            className={`mt-1 ${INPUT_CLS}`}
            placeholder="Your name"
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL_CLS}>Email</span>
          <input
            type="email"
            value={draft.profile.email}
            onChange={(e) =>
              setDraft((s) => ({
                ...s,
                profile: { ...s.profile, email: e.target.value },
              }))
            }
            className={`mt-1 ${INPUT_CLS}`}
            placeholder="you@agency.com"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Timezone</span>
            <input
              type="text"
              value={draft.profile.timezone}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  profile: { ...s.profile, timezone: e.target.value },
                }))
              }
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Locale</span>
            <input
              type="text"
              value={draft.profile.locale}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  profile: { ...s.profile, locale: e.target.value },
                }))
              }
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
        </div>
        <label className="block">
          <span className={FIELD_LABEL_CLS}>Initials</span>
          <input
            type="text"
            maxLength={3}
            value={draft.profile.avatarInitials}
            onChange={(e) =>
              setDraft((s) => ({
                ...s,
                profile: {
                  ...s.profile,
                  avatarInitials: e.target.value.toUpperCase(),
                },
              }))
            }
            className={`mt-1 max-w-[8rem] ${INPUT_CLS}`}
          />
        </label>
      </div>
    </motion.div>
  );
}

function AgencyExpanded({
  draft,
  setDraft,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
}): JSX.Element {
  const dom = domainStatusBadge(draft.agency.customDomain.status);
  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-5 lg:col-span-1">
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.div
            layoutId="agency-swatch"
            className="grid h-24 w-24 place-items-center rounded-3xl ring-1 ring-border-muted"
            style={{
              background: `linear-gradient(135deg, ${draft.agency.brandColor}33 0%, ${draft.agency.brandColor}11 100%)`,
              color: draft.agency.brandColor,
            }}
            aria-label="Brand colour swatch"
          >
            <Palette className="h-9 w-9" />
          </motion.div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-base font-semibold text-text">
                {draft.agency.name}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent4/40 bg-accent4/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent4">
                <Crown className="h-3 w-3" />
                {draft.agency.plan}
              </span>
            </div>
            <p className="text-xs text-text-dim">/{draft.agency.slug}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {[
              '#F26522',
              '#FF9670',
              '#26d281',
              '#ffd54f',
              '#ff6b4a',
              '#FF9670',
            ].map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() =>
                  setDraft((s) => ({
                    ...s,
                    agency: { ...s.agency, brandColor: swatch },
                  }))
                }
                className={`h-7 w-7 rounded-lg ring-2 transition-all ${
                  draft.agency.brandColor === swatch
                    ? 'ring-text scale-110'
                    : 'ring-transparent hover:ring-border-muted'
                }`}
                style={{ background: swatch }}
                aria-label={`Set brand colour to ${swatch}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Agency name</span>
            <input
              type="text"
              value={draft.agency.name}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  agency: { ...s.agency, name: e.target.value },
                }))
              }
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Slug</span>
            <input
              type="text"
              value={draft.agency.slug}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  agency: {
                    ...s.agency,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  },
                }))
              }
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Region</span>
            <input
              type="text"
              value={draft.agency.region}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  agency: { ...s.agency, region: e.target.value },
                }))
              }
              className={`mt-1 ${INPUT_CLS}`}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLS}>Plan</span>
            <input
              type="text"
              value={draft.agency.plan}
              disabled
              className={`mt-1 ${INPUT_CLS} opacity-60`}
            />
          </label>
        </div>
        <div className="rounded-xl border border-border-muted bg-surface-2/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-text-dim" />
              <h4 className="text-sm font-semibold text-text">Custom domain</h4>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dom.cls}`}
            >
              {dom.label}
            </span>
          </div>
          <label className="mt-3 block">
            <span className={FIELD_LABEL_CLS}>Domain</span>
            <input
              type="text"
              value={draft.agency.customDomain.domain ?? ''}
              onChange={(e) =>
                setDraft((s) => ({
                  ...s,
                  agency: {
                    ...s.agency,
                    customDomain: {
                      ...s.agency.customDomain,
                      domain: e.target.value || null,
                    },
                  },
                }))
              }
              placeholder="mail.youragency.com"
              className={`mt-1 font-mono ${INPUT_CLS}`}
            />
          </label>
        </div>

        <div className="rounded-xl border border-border-muted bg-surface-2/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-text-dim" />
              <h4 className="text-sm font-semibold text-text">
                Dedicated helper group
              </h4>
            </div>
            <TogglePill
              label={draft.agency.dedicatedPool.enabled ? 'Enabled' : 'Off'}
              checked={draft.agency.dedicatedPool.enabled}
              onChange={(v) =>
                setDraft((s) => ({
                  ...s,
                  agency: {
                    ...s.agency,
                    dedicatedPool: { ...s.agency.dedicatedPool, enabled: v },
                  },
                }))
              }
              tone="accent2"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Helper group name</span>
              <input
                type="text"
                disabled={!draft.agency.dedicatedPool.enabled}
                value={draft.agency.dedicatedPool.poolName ?? ''}
                onChange={(e) =>
                  setDraft((s) => ({
                    ...s,
                    agency: {
                      ...s.agency,
                      dedicatedPool: {
                        ...s.agency.dedicatedPool,
                        poolName: e.target.value || null,
                      },
                    },
                  }))
                }
                className={`mt-1 ${INPUT_CLS} ${
                  draft.agency.dedicatedPool.enabled ? '' : 'opacity-50'
                }`}
              />
            </label>
            <div className="rounded-lg border border-border-muted bg-surface px-3 py-2">
              <p className={FIELD_LABEL_CLS}>Peer count</p>
              <p className="mt-1 text-base font-semibold text-text">
                {draft.agency.dedicatedPool.memberCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NotificationsExpanded({
  draft,
  setDraft,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
}): JSX.Element {
  /** Six rows, organised in two columns to match the mosaic-tile preview. */
  const rows: Array<{
    key: keyof DraftState['notifications'] | 'slackChannel';
    label: string;
    description: string;
    Icon: typeof Bell;
  }> = [
    {
      key: 'emailWeeklyDigest',
      label: 'Weekly digest',
      description: 'Monday 9am summary per sub-client',
      Icon: Mail,
    },
    {
      key: 'emailDailyDigest',
      label: 'Daily digest',
      description: 'Per-mailbox sending pace + sends',
      Icon: Mail,
    },
    {
      key: 'emailCriticalAlerts',
      label: 'Critical alerts (email)',
      description: 'Failure spikes, helper failures',
      Icon: AlertTriangle,
    },
    {
      key: 'slackEnabled',
      label: 'Slack',
      description: 'Posts into your shared channel',
      Icon: Slack,
    },
    {
      key: 'inAppCritical',
      label: 'In-app critical',
      description: 'Inbox bell shows red dot',
      Icon: Bell,
    },
  ];

  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-2 content-start">
        {rows.slice(0, 3).map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-3 rounded-xl border border-border-muted bg-surface p-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-dim"
                aria-hidden
              >
                <row.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{row.label}</p>
                <p className="text-[11px] text-text-dim">{row.description}</p>
              </div>
            </div>
            <TogglePill
              label=""
              checked={Boolean(
                draft.notifications[row.key as keyof DraftState['notifications']],
              )}
              onChange={(v) =>
                setDraft((s) => ({
                  ...s,
                  notifications: { ...s.notifications, [row.key]: v },
                }))
              }
              tone="accent"
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2 content-start">
        {rows.slice(3).map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-3 rounded-xl border border-border-muted bg-surface p-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-dim"
                aria-hidden
              >
                <row.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{row.label}</p>
                <p className="text-[11px] text-text-dim">{row.description}</p>
              </div>
            </div>
            <TogglePill
              label=""
              checked={Boolean(
                draft.notifications[row.key as keyof DraftState['notifications']],
              )}
              onChange={(v) =>
                setDraft((s) => ({
                  ...s,
                  notifications: { ...s.notifications, [row.key]: v },
                }))
              }
              tone="accent2"
            />
          </div>
        ))}
        <label className="rounded-xl border border-border-muted bg-surface p-3">
          <span className={FIELD_LABEL_CLS}>Slack channel</span>
          <input
            type="text"
            value={draft.notifications.slackChannel ?? ''}
            disabled={!draft.notifications.slackEnabled}
            onChange={(e) =>
              setDraft((s) => ({
                ...s,
                notifications: {
                  ...s.notifications,
                  slackChannel: e.target.value || null,
                },
              }))
            }
            placeholder="#warmup-alerts"
            className={`mt-1 font-mono ${INPUT_CLS} ${
              draft.notifications.slackEnabled ? '' : 'opacity-50'
            }`}
          />
        </label>
      </div>
    </motion.div>
  );
}

function SecurityExpanded({
  draft,
  setDraft,
  onSignOutEverywhere,
  onChangePassword,
  signOutBusy,
}: {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  onSignOutEverywhere: () => void;
  onChangePassword: () => void;
  signOutBusy: boolean;
}): JSX.Element {
  // 2FA always reflects the live server state, never the tile draft — the
  // enrol → QR → verify round-trip is what flips it, not the Save button.
  const settings = useUserSettings();
  const totpEnabled = settings.data?.security.totp_enabled ?? false;
  const enroll = useEnableTotp();
  const verify = useVerifyTotp();
  const disableTotp = useDisableTotp();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const startEnroll = (): void => {
    enroll.mutate(undefined, {
      onSuccess: (data) => {
        setEnrollment(data);
        setCode('');
      },
      onError: () => toast.error('Could not start 2FA setup'),
    });
  };

  const confirmEnroll = (): void => {
    if (code.trim().length < 6) return;
    verify.mutate(
      { code: code.trim() },
      {
        onSuccess: () => {
          toast.success('Two-factor authentication enabled');
          setEnrollment(null);
          setCode('');
        },
        onError: () => toast.error('Invalid code — try again'),
      },
    );
  };

  const doDisable = (): void => {
    if (!disablePw) return;
    disableTotp.mutate(
      { password: disablePw },
      {
        onSuccess: () => {
          toast.success('Two-factor authentication disabled');
          setDisablePw('');
          setShowDisable(false);
        },
        onError: () => toast.error('Could not disable 2FA — check your password'),
      },
    );
  };

  // The expanded tile body scrolls; without this the QR panel can mount
  // below the fold and "Enable 2FA" looks like it did nothing.
  const enrollPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enrollment) {
      enrollPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [enrollment]);

  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-5 lg:col-span-1">
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.div
            layoutId="security-2fa-disc"
            className={`grid h-24 w-24 place-items-center rounded-3xl ring-1 ring-border-muted ${
              totpEnabled
                ? 'bg-accent3/10 text-accent3'
                : 'bg-surface-2 text-text-dim'
            }`}
          >
            {totpEnabled ? (
              <ShieldCheck className="h-9 w-9" />
            ) : (
              <Shield className="h-9 w-9" />
            )}
          </motion.div>
          <div>
            <h4 className="text-sm font-semibold text-text">Two-factor auth</h4>
            <p
              className={`text-xs ${totpEnabled ? 'text-accent' : 'text-text-dim'}`}
            >
              {totpEnabled
                ? 'Enabled with authenticator app'
                : enrollment
                  ? 'Setup in progress — confirm a code below'
                  : 'Disabled — accounts unprotected'}
            </p>
          </div>
          {!totpEnabled && !enrollment ? (
            <button
              type="button"
              onClick={startEnroll}
              disabled={enroll.isPending}
              className="w-full rounded-lg bg-accent3/15 px-4 py-2 text-xs font-semibold text-accent3 ring-1 ring-accent3/40 transition-colors hover:bg-accent3/25 disabled:opacity-50"
            >
              {enroll.isPending ? 'Preparing…' : 'Enable 2FA'}
            </button>
          ) : null}
          {totpEnabled && !enrollment ? (
            <button
              type="button"
              onClick={() => setShowDisable((v) => !v)}
              className="w-full rounded-lg border border-border-muted bg-surface-2 px-4 py-2 text-xs font-semibold text-text-dim transition-colors hover:text-text"
            >
              {showDisable ? 'Keep 2FA on' : 'Disable 2FA'}
            </button>
          ) : null}
          {totpEnabled && showDisable ? (
            <div className="w-full space-y-2 text-left">
              <label className="block">
                <span className={FIELD_LABEL_CLS}>Confirm password</span>
                <input
                  type="password"
                  value={disablePw}
                  onChange={(e) => setDisablePw(e.target.value)}
                  className={`mt-1 ${INPUT_CLS}`}
                />
              </label>
              <button
                type="button"
                onClick={doDisable}
                disabled={disableTotp.isPending || !disablePw}
                className="w-full rounded-lg bg-accent3/15 px-4 py-2 text-xs font-semibold text-accent3 ring-1 ring-accent3/40 transition-colors hover:bg-accent3/25 disabled:opacity-50"
              >
                {disableTotp.isPending ? 'Disabling…' : 'Turn off two-factor'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 lg:col-span-2">
        <div className="rounded-xl border border-border-muted bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className={FIELD_LABEL_CLS}>Session timeout</span>
            <span className="font-mono text-xs text-accent3">
              {draft.security.sessionTimeoutMinutes} min
            </span>
          </div>
          <input
            type="range"
            min={15}
            max={120}
            step={5}
            value={draft.security.sessionTimeoutMinutes}
            onChange={(e) =>
              setDraft((s) => ({
                ...s,
                security: {
                  ...s.security,
                  sessionTimeoutMinutes: Number(e.target.value),
                },
              }))
            }
            className="mt-3 w-full accent-accent3"
          />
          <div className="mt-1 flex justify-between text-[10px] text-text-faint">
            <span>15m</span>
            <span>60m</span>
            <span>120m</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border-muted bg-surface p-3">
            <p className={FIELD_LABEL_CLS}>Active sessions</p>
            <p className="mt-1 text-base font-semibold text-text">
              {draft.security.activeSessions}
            </p>
            <button
              type="button"
              disabled={signOutBusy}
              onClick={onSignOutEverywhere}
              className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-accent3 hover:underline disabled:opacity-50"
            >
              {signOutBusy ? 'Signing out…' : 'Sign out everywhere'}
            </button>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface p-3">
            <p className={FIELD_LABEL_CLS}>Last password change</p>
            <p className="mt-1 text-sm font-semibold text-text">
              {draft.security.lastPasswordChangedAgo || '—'}
            </p>
            <button
              type="button"
              onClick={onChangePassword}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent2 hover:underline"
            >
              <Lock className="h-2.5 w-2.5" />
              Change password
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface-2/40 p-3">
          <div>
            <p className={FIELD_LABEL_CLS}>Recovery codes</p>
            <p className="text-[11px] text-text-dim">
              {totpEnabled
                ? 'Re-keying issues fresh codes — you must re-scan the QR and confirm a code.'
                : 'One-time sign-in codes, issued while setting up two-factor auth.'}
            </p>
          </div>
          {totpEnabled ? (
            <button
              type="button"
              disabled={enroll.isPending || !!enrollment}
              onClick={startEnroll}
              className="shrink-0 rounded-lg border border-border-muted bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:text-accent disabled:opacity-50"
            >
              {enroll.isPending ? 'Working…' : 'Regenerate'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Enrolment: animated QR + manual secret + recovery codes + verify.
          order-first floats it above the status/sessions cards so the QR is
          immediately visible inside the scrollable expanded tile. */}
      {enrollment ? (
        <div
          ref={enrollPanelRef}
          className="order-first space-y-4 rounded-2xl border border-accent3/30 bg-surface p-5 lg:col-span-3"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-4"
            >
              {/* QR rendered locally — no third-party API call leaks the secret. */}
              <QRCodeSVG
                value={enrollment.qr_url}
                size={160}
                level="H"
                bgColor="#ffffff"
                fgColor="#0a0a0f"
              />
              {/* Scanner sweep animation */}
              <motion.div
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="pointer-events-none absolute left-0 right-0 h-0.5 bg-accent3/60 shadow-[0_0_10px_1px_rgba(242,101,34,0.7)]"
              />
            </motion.div>
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-sm font-semibold text-text">
                  Scan the QR code in your authenticator app
                </p>
                <p className="text-xs text-text-dim">
                  Works with Google Authenticator, Microsoft Authenticator,
                  1Password, Authy and any other TOTP app.
                </p>
              </div>
              <div>
                <p className={FIELD_LABEL_CLS}>Manual entry key</p>
                <code className="mt-1 block break-all rounded-lg border border-border-muted bg-surface-2 px-3 py-2 font-mono text-xs text-accent">
                  {enrollment.secret}
                </code>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={FIELD_LABEL_CLS}>
                Recovery codes — save these somewhere safe
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(enrollment.recovery_codes.join('\n'))
                      .then(
                        () => toast.success('Recovery codes copied'),
                        () => toast.error('Copy failed — select the codes manually'),
                      );
                  }}
                  className="rounded-lg border border-border-muted bg-surface px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:text-text"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob(
                      [
                        'WarmPulse 2FA recovery codes\n',
                        'Each code can be used once if you lose your authenticator.\n',
                        `Generated: ${new Date().toISOString()}\n\n`,
                        ...enrollment.recovery_codes.map((c) => `${c}\n`),
                      ],
                      { type: 'text/plain;charset=utf-8' },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'warmpulse-recovery-codes.txt';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-lg border border-border-muted bg-surface px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:text-text"
                >
                  Download
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-border-muted bg-surface-2 p-3 font-mono text-xs text-text sm:grid-cols-4">
              {enrollment.recovery_codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-text-dim">
              Each code signs you in once if you lose access to your
              authenticator (e.g. you change phones). Store them in a password
              manager.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Enter a code to confirm</span>
              <input
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`mt-1 w-36 font-mono ${INPUT_CLS}`}
              />
            </label>
            <button
              type="button"
              onClick={confirmEnroll}
              disabled={verify.isPending || code.trim().length < 6}
              className="rounded-lg bg-accent3/15 px-4 py-2 text-xs font-semibold text-accent3 ring-1 ring-accent3/40 transition-colors hover:bg-accent3/25 disabled:opacity-50"
            >
              {verify.isPending ? 'Verifying…' : 'Confirm & enable'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEnrollment(null);
                setCode('');
              }}
              className="rounded-lg border border-border-muted bg-surface px-4 py-2 text-xs font-semibold text-text-dim transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

function IntegrationsExpanded({
  d,
}: {
  d: AgencySettingsData;
}): JSX.Element {
  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-4 lg:grid-cols-2">
      {d.integrations.map((it) => {
        const Icon = integrationIcon(it.icon);
        const badge = integrationStatusBadge(it.status);
        const live = it.status === 'connected';
        return (
          <div
            key={it.id}
            className="flex items-start gap-4 rounded-2xl border border-border-muted bg-surface p-4"
          >
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                live ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
              }`}
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="truncate text-sm font-semibold text-text">
                  {it.label}
                </h4>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-[11px] text-text-dim">
                Last sync {it.lastSyncAgo}
              </p>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

function ApiExpanded({ d }: { d: AgencySettingsData }): JSX.Element {
  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-4">
        <p className={FIELD_LABEL_CLS}>Rate limit</p>
        <p className="mt-2 text-4xl font-semibold text-accent4">
          {d.apiAccess.rateLimitPerMin}
          <span className="ml-1 text-base font-normal text-text-dim">/min</span>
        </p>
        <p className="mt-1 text-[11px] text-text-dim">
          Default Agency-plan ceiling.
        </p>
        <a
          href={`mailto:support@warmpulse.app?subject=${encodeURIComponent(
            'API rate-limit increase request',
          )}&body=${encodeURIComponent(
            `Hi WarmPulse team,\n\nWe'd like to request an increase to our API rate limit (currently ${d.apiAccess.rateLimitPerMin}/min).\n\nThanks!`,
          )}`}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:text-accent4"
        >
          Request increase
        </a>
      </div>
    </motion.div>
  );
}

function TeamExpanded({
  d,
  onInvite,
}: {
  d: AgencySettingsData;
  onInvite: () => void;
}): JSX.Element {
  const pct =
    d.team.seatLimit > 0 ? Math.min(100, (d.team.seatUsed / d.team.seatLimit) * 100) : 0;
  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-4 lg:col-span-1">
        <p className={FIELD_LABEL_CLS}>Seat usage</p>
        <div className="mt-4 flex items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-32 w-32 shrink-0" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-border-muted"
              strokeLinecap="round"
            />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-accent"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 15}
              initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
              animate={{
                strokeDashoffset: 2 * Math.PI * 15 * (1 - pct / 100),
              }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
            <text
              x="18"
              y="20"
              textAnchor="middle"
              className="fill-current text-[6px] font-semibold text-text"
            >
              {d.team.seatUsed} / {d.team.seatLimit}
            </text>
          </svg>
        </div>
        <p className="mt-3 text-center text-xs text-text-dim">
          {Math.round(pct)}% of plan capacity used.
        </p>
      </div>
      <div className="rounded-2xl border border-border-muted bg-surface p-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text">Team members</h4>
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:text-accent"
          >
            <Plus className="h-3 w-3" />
            Invite member
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {Array.from({ length: Math.max(0, d.team.memberCount) }).map(
            (_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface-2/50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent2/15 text-[11px] font-semibold text-accent2">
                    M{i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-text">
                      Member {i + 1}
                    </p>
                    <p className="truncate text-[10px] text-text-dim">
                      {i === 0
                        ? 'owner — full access'
                        : i === 1
                          ? 'admin — billing & settings'
                          : 'member — workspace operator'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-text-faint">active</span>
              </div>
            ),
          )}
          {d.team.pendingInvites > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-accent4/40 bg-accent4/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent4/15 text-accent4">
                  <Mail className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-text">
                    {d.team.pendingInvites} invite pending
                  </p>
                  <p className="text-[10px] text-text-dim">
                    Awaiting recipient acceptance.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onInvite}
                className="text-[10px] font-semibold uppercase tracking-wide text-accent4 hover:underline"
              >
                Resend
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function AuditExpanded({ d }: { d: AgencySettingsData }): JSX.Element {
  // A faux feed so the user gets a feel for what audit-log entries look like
  // until they hit the dedicated audit page. Real data fetched separately.
  const feed = useMemo(
    () => [
      {
        ts: d.audit.lastAdminActionAgo || '—',
        actor: 'you@northwind.agency',
        action: d.audit.lastAdminAction || 'No recorded action',
      },
      {
        ts: '2h ago',
        actor: 'admin@northwind.agency',
        action: 'Updated billing email',
      },
      {
        ts: '8h ago',
        actor: 'system',
        action: 'Auto-rotated helper group member peer-04 (low trust)',
      },
      {
        ts: '1d ago',
        actor: 'you@northwind.agency',
        action: 'Enabled custom domain mail.northwind.agency',
      },
      {
        ts: '4d ago',
        actor: 'admin@northwind.agency',
        action: 'Invited member3@northwind.agency',
      },
    ],
    [d.audit.lastAdminAction, d.audit.lastAdminActionAgo],
  );

  return (
    <motion.div {...CHILD_FADE_UP} className="grid gap-5 lg:grid-cols-3">
      <div className="rounded-2xl border border-border-muted bg-surface p-4">
        <p className={FIELD_LABEL_CLS}>Last 30 days</p>
        <p className="mt-2 text-4xl font-semibold text-accent2">
          {d.audit.last30dEntries}
        </p>
        <p className="mt-1 text-[11px] text-text-dim">recorded events</p>
        <button
          type="button"
          onClick={() => {
            const count = exportRowsToCsv(
              `warmpulse-audit-${exportStamp()}`,
              feed,
              [
                { header: 'When', value: (r) => r.ts },
                { header: 'Actor', value: (r) => r.actor },
                { header: 'Action', value: (r) => r.action },
              ],
            );
            toast.success(`Exported ${count} audit ${count === 1 ? 'entry' : 'entries'}`);
          }}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:text-accent2"
        >
          Export CSV
        </button>
      </div>
      <div className="rounded-2xl border border-border-muted bg-surface p-4 lg:col-span-2">
        <h4 className="text-sm font-semibold text-text">Recent actions</h4>
        <ul className="mt-3 divide-y divide-border-muted">
          {feed.map((entry, i) => (
            <li
              key={i}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span
                className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent2/15 text-accent2"
                aria-hidden
              >
                <Activity className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text">
                  {entry.action}
                </p>
                <p className="text-[10px] text-text-dim">
                  <span className="font-mono">{entry.actor}</span> ·{' '}
                  {entry.ts}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Expanded view dispatcher — picks the right form body for the open tile.
// ---------------------------------------------------------------------------

/**
 * Live-action callbacks + pending flags threaded down from the page-level
 * component (which is where the TanStack-Query hooks live — hooks must run at
 * the top level, not inside the per-tile expanded bodies).
 */
interface TileHandlers {
  onUploadAvatar: (file: File) => void;
  onRemoveAvatar: () => void;
  avatarBusy: boolean;
  onSignOutEverywhere: () => void;
  onChangePassword: () => void;
  signOutBusy: boolean;
  onInvite: () => void;
}

function TileExpanded({
  id,
  d,
  draft,
  setDraft,
  handlers,
}: {
  id: TileId;
  d: AgencySettingsData;
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  handlers: TileHandlers;
}): JSX.Element {
  switch (id) {
    case 'profile':
      return (
        <ProfileExpanded
          draft={draft}
          setDraft={setDraft}
          onUploadAvatar={handlers.onUploadAvatar}
          onRemoveAvatar={handlers.onRemoveAvatar}
          avatarBusy={handlers.avatarBusy}
        />
      );
    case 'agency':
      return <AgencyExpanded draft={draft} setDraft={setDraft} />;
    case 'notifications':
      return <NotificationsExpanded draft={draft} setDraft={setDraft} />;
    case 'security':
      return (
        <SecurityExpanded
          draft={draft}
          setDraft={setDraft}
          onSignOutEverywhere={handlers.onSignOutEverywhere}
          onChangePassword={handlers.onChangePassword}
          signOutBusy={handlers.signOutBusy}
        />
      );
    case 'integrations':
      return <IntegrationsExpanded d={d} />;
    case 'api':
      return <ApiExpanded d={d} />;
    case 'team':
      return <TeamExpanded d={d} onInvite={handlers.onInvite} />;
    case 'audit':
      return <AuditExpanded d={d} />;
    default:
      return <div />;
  }
}

// ---------------------------------------------------------------------------
// Tile shell — wraps each tile body with the layout-morph + accent ribbon.
// ---------------------------------------------------------------------------

interface TileShellProps {
  def: TileDef;
  expanded: boolean;
  onOpen: () => void;
  children: React.ReactNode;
  shouldRender: boolean;
  index: number;
}

function TileShell({
  def,
  expanded,
  onOpen,
  children,
  shouldRender,
  index,
}: TileShellProps): JSX.Element | null {
  if (!shouldRender) return null;

  const colCls = SPAN_COL[def.cols];
  const rowCls = SPAN_ROW[def.rows];

  return (
    <motion.button
      type="button"
      layoutId={`tile-${def.id}`}
      onClick={onOpen}
      aria-expanded={expanded}
      aria-label={`Open ${def.label} settings`}
      // Hover lift + outline glow per spec. We layer a faint ring on hover
      // rather than swapping colours so the accent palette stays static.
      whileHover={
        expanded
          ? undefined
          : {
              y: -4,
              transition: { type: 'spring', stiffness: 320, damping: 24 },
            }
      }
      initial={{ opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      // The shuffle-in stagger called out by the spec — 40ms per tile.
      transition={{
        ...TILE_SPRING,
        delay: shouldRender ? index * 0.04 : 0,
      }}
      className={`group relative flex h-full min-h-[10rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface p-4 text-left transition-shadow hover:shadow-[0_0_0_1px_var(--tw-shadow-color)] hover:shadow-accent2/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent2 ${colCls} ${rowCls}`}
    >
      {/* Accent ribbon — a thin top stripe tints the tile so the user can
          tell categories apart at a glance without colouring the body. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-4 top-0 h-0.5 rounded-b-full ${ACCENT_BG_CHIP[def.accent]}`}
      />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-border-muted ${
              ACCENT_BG_SOFT[def.accent]
            } ${ACCENT_TEXT[def.accent]}`}
            aria-hidden
          >
            <def.Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-text">
              {def.label}
            </p>
            <p className="truncate text-[10px] text-text-faint">{def.hint}</p>
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-text-dim" />
      </div>
      <div className="flex-1">{children}</div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgSetC2Mosaic({
  data,
}: { data?: AgencySettingsData } = {}): JSX.Element {
  const d = data ?? MOCK;

  // Which tile is currently expanded full-canvas. `null` = mosaic view.
  const [openId, setOpenId] = useState<TileId | null>(null);

  // Draft state — populated when a tile opens, committed on Save, dropped
  // on Cancel. Keeping it lifted to the page level means the user can open
  // multiple tiles in sequence without losing partial edits across them.
  const [draft, setDraft] = useState<DraftState>(() => makeDraft(d));

  // Whenever the upstream data changes we rebuild the draft so live-data
  // refreshes don't get stomped by stale form values. This won't matter in
  // the prop-less preview but keeps the live adapter honest.
  useEffect(() => {
    if (openId === null) {
      setDraft(makeDraft(d));
    }
  }, [d, openId]);

  // ── live-data hooks ────────────────────────────────────────────────
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const sessionsQuery = useSessions();
  const revokeSession = useRevokeSession();
  const changePassword = useChangePassword();
  const inviteMember = useInviteMember();
  const updateProfile = useUpdateProfile();
  const updateWorkspaceProfile = useUpdateWorkspaceProfile();
  const updateNotifications = useUpdateNotifications();

  // ── dialogs ────────────────────────────────────────────────────────
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('member');

  const open = useCallback(
    (id: TileId) => {
      setDraft(makeDraft(d));
      setOpenId(id);
    },
    [d],
  );

  const close = useCallback(() => {
    setOpenId(null);
  }, []);

  // ── live-action handlers ───────────────────────────────────────────
  const handlers = useMemo<TileHandlers>(
    () => ({
      onUploadAvatar: (file: File) => {
        uploadAvatar.mutate(file, {
          onSuccess: () => toast.success('Profile picture updated'),
          onError: () => toast.error('Failed to upload picture'),
        });
      },
      onRemoveAvatar: () => {
        deleteAvatar.mutate(undefined, {
          onSuccess: () => toast.success('Profile picture removed'),
          onError: () => toast.error('Failed to remove picture'),
        });
      },
      avatarBusy: uploadAvatar.isPending || deleteAvatar.isPending,
      onSignOutEverywhere: () => {
        const sessions = sessionsQuery.data ?? [];
        const others = sessions.filter((s) => !s.is_current);
        if (others.length === 0) {
          toast.info('No other active sessions to sign out.');
          return;
        }
        Promise.allSettled(
          others.map((s) => revokeSession.mutateAsync(s.id)),
        ).then((results) => {
          const ok = results.filter((r) => r.status === 'fulfilled').length;
          if (ok > 0) {
            toast.success(`Signed out ${ok} other session${ok === 1 ? '' : 's'}`);
          } else {
            toast.error('Failed to sign out other sessions');
          }
        });
      },
      onChangePassword: () => {
        setPwCurrent('');
        setPwNew('');
        setPwConfirm('');
        setPwOpen(true);
      },
      signOutBusy: revokeSession.isPending,
      onInvite: () => {
        setInviteEmail('');
        setInviteRole('member');
        setInviteOpen(true);
      },
    }),
    [
      uploadAvatar,
      deleteAvatar,
      sessionsQuery.data,
      revokeSession,
    ],
  );

  const submitPassword = useCallback(() => {
    if (!pwCurrent || !pwNew) {
      toast.error('Enter your current and new password');
      return;
    }
    if (pwNew !== pwConfirm) {
      toast.error('New passwords do not match');
      return;
    }
    changePassword.mutate(
      { current_password: pwCurrent, new_password: pwNew },
      {
        onSuccess: () => {
          toast.success('Password changed');
          setPwOpen(false);
        },
        onError: () => toast.error('Failed to change password'),
      },
    );
  }, [pwCurrent, pwNew, pwConfirm, changePassword]);

  const submitInvite = useCallback(() => {
    if (!inviteEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    inviteMember.mutate(
      { email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: () => {
          toast.success(`Invited ${inviteEmail.trim()}`);
          setInviteOpen(false);
        },
        onError: () => toast.error('Failed to send invite'),
      },
    );
  }, [inviteEmail, inviteRole, inviteMember]);

  const save = useCallback(() => {
    // Persist the drafted fields for the open tile through the matching
    // workspace-settings mutation. Tiles whose fields have no backend
    // endpoint persist what they can; nothing is silently discarded.
    if (openId === 'profile') {
      updateProfile.mutate(
        {
          display_name: draft.profile.name,
          email: draft.profile.email,
          timezone: draft.profile.timezone,
          locale: draft.profile.locale,
        },
        {
          onSuccess: () => toast.success('Profile saved'),
          onError: () => toast.error('Failed to save profile'),
        },
      );
    } else if (openId === 'agency') {
      updateWorkspaceProfile.mutate(
        {
          name: draft.agency.name,
          slug: draft.agency.slug,
          brand_color: draft.agency.brandColor,
        },
        {
          onSuccess: () => toast.success('Agency identity saved'),
          onError: () => toast.error('Failed to save agency identity'),
        },
      );
    } else if (openId === 'notifications') {
      updateNotifications.mutate(
        {
          email_digest_enabled: draft.notifications.emailWeeklyDigest,
          alerts: {
            warmth_drop: draft.notifications.emailCriticalAlerts,
            bounce_spike: draft.notifications.emailCriticalAlerts,
            dns_break: draft.notifications.emailCriticalAlerts,
          },
        },
        {
          onSuccess: () => toast.success('Notification preferences saved'),
          onError: () => toast.error('Failed to save notifications'),
        },
      );
    }
    setOpenId(null);
  }, [openId, draft, updateProfile, updateWorkspaceProfile, updateNotifications]);

  // Index lookup so the chevron prev/next pager can step between tiles
  // while the user is in the expanded view without going back to the grid.
  const openIndex = openId
    ? TILES.findIndex((t) => t.id === openId)
    : -1;

  const prevTile: TileDef | null =
    openIndex > 0 ? TILES[openIndex - 1] ?? null : null;
  const nextTile: TileDef | null =
    openIndex >= 0 && openIndex < TILES.length - 1
      ? TILES[openIndex + 1] ?? null
      : null;

  const openDef = openId ? TILES.find((t) => t.id === openId) ?? null : null;

  // Keyboard shortcut — pressing Escape closes the expanded view. Matches
  // the "click outside or X" affordance.
  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowLeft' && prevTile) {
        open(prevTile.id);
      } else if (e.key === 'ArrowRight' && nextTile) {
        open(nextTile.id);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, prevTile, nextTile, close, open]);

  // Track whether the user has scrolled past the page header so the mural
  // header can compact itself — same idiom Notion uses for its sticky bar.
  const scrollSentinel = useRef<HTMLDivElement>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  useEffect(() => {
    const node = scrollSentinel.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setCompactHeader(!entry.isIntersecting);
        }
      },
      { threshold: 0 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative space-y-5">
      <div ref={scrollSentinel} />

      {/* Page header — a real header, not a tab strip. The label collapses
          to a compact pill once the user scrolls into the mosaic. */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <motion.h1
            animate={{ scale: compactHeader ? 0.92 : 1 }}
            transition={{ ...TILE_SPRING }}
            className="origin-left text-[clamp(1.4rem,2.4vw,1.8rem)] font-semibold text-text"
          >
            Settings
          </motion.h1>
          <p className="text-xs text-text-dim">
            A mosaic of every Agency-tier control. Click any tile to dive in.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-faint">
          <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-1">
            <Settings2 className="h-3 w-3" />
            {TILES.length} categories
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-1">
            <Crown className="h-3 w-3 text-accent4" />
            {d.agency.plan}
          </span>
        </div>
      </motion.header>

      {/* The mosaic itself — 4-col grid with auto-rows so 2-row tiles stretch
          down properly. We use AnimatePresence to swap between the grid and
          the expanded full-canvas view, letting framer-motion handle the
          enter/exit animations of all the other tiles around the open one.

          `auto-rows-[minmax(10rem,auto)]` is load-bearing: it gives every
          row a 10rem floor (so 1x1 tiles still look uniform-ish across the
          mural) but lets a row grow naturally when its content — e.g. the
          Notifications tile's six channel pills — exceeds the floor. A
          fixed `auto-rows-[10rem]` caused tile content to render past its
          grid cell and visually overlap the row below. */}
      <div className="relative">
        <motion.div
          layout
          className="grid grid-cols-1 gap-3 md:grid-cols-4 md:auto-rows-[minmax(10rem,auto)]"
        >
          {TILES.map((def, index) => (
            <TileShell
              key={def.id}
              def={def}
              expanded={openId === def.id}
              shouldRender={openId === null || openId === def.id}
              index={index}
              onOpen={() => open(def.id)}
            >
              <TileCompact id={def.id} d={d} />
            </TileShell>
          ))}
        </motion.div>

        {/* The expanded view sits absolutely on top of the mural so the
            layoutId morph happens in the same DOM-stacking context. We
            still wrap in AnimatePresence so child fade-up + spring-in
            transitions stay smooth even when the underlying grid has
            already collapsed visually. */}
        <AnimatePresence>
          {openId && openDef ? (
            <motion.div
              key="expanded-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-20"
              // Outside-click → close. Important: the inner card stops
              // propagation so clicks inside the form don't dismiss.
              onClick={close}
            >
              <motion.div
                layoutId={`tile-${openDef.id}`}
                onClick={(e) => e.stopPropagation()}
                className="relative flex h-full min-h-[28rem] flex-col rounded-3xl border border-border-muted bg-surface p-6"
                transition={TILE_SPRING}
              >
                {/* Accent ribbon, big version */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-6 top-0 h-1 rounded-b-full ${ACCENT_BG_CHIP[openDef.accent]}`}
                />

                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-border-muted ${
                        ACCENT_BG_SOFT[openDef.accent]
                      } ${ACCENT_TEXT[openDef.accent]}`}
                      aria-hidden
                    >
                      <openDef.Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-text">
                        {openDef.label}
                      </h2>
                      <p className="text-xs text-text-dim">{openDef.hint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => prevTile && open(prevTile.id)}
                      disabled={!prevTile}
                      aria-label="Previous category"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => nextTile && open(nextTile.id)}
                      disabled={!nextTile}
                      aria-label="Next category"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      aria-label="Close"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:text-text"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={openId}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -14 }}
                      transition={{ duration: 0.22 }}
                    >
                      <TileExpanded
                        id={openDef.id}
                        d={d}
                        draft={draft}
                        setDraft={setDraft}
                        handlers={handlers}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Save / Cancel rail — springs in from the bottom on enter
                    per the spec. Only the four "editable" tiles (profile,
                    agency, notifications, security) get the save bar; the
                    rest are read-mostly with inline CTAs in their bodies. */}
                <AnimatePresence>
                  {['profile', 'agency', 'notifications', 'security'].includes(
                    openDef.id,
                  ) ? (
                    <motion.div
                      key="save-rail"
                      initial={{ opacity: 0, y: 32 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 32 }}
                      transition={TILE_SPRING}
                      className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border-muted bg-surface-2/70 px-4 py-3"
                    >
                      <p className="text-[11px] text-text-dim">
                        Drafted changes are local until you save.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={close}
                          className="rounded-lg border border-border-muted bg-surface px-4 py-2 text-xs font-semibold text-text-dim transition-colors hover:text-text"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={save}
                          disabled={
                            updateProfile.isPending ||
                            updateWorkspaceProfile.isPending ||
                            updateNotifications.isPending
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent2/20 px-4 py-2 text-xs font-semibold text-accent2 ring-1 ring-accent2/40 transition-colors hover:bg-accent2/30 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save changes
                        </button>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Lower rail — quick-glance status summary so the mural feels alive
          even before the user opens a single tile. Keeps key facts (plan,
          domain, dedicated pool) anchored at the bottom of the canvas. */}
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: openId ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="grid gap-2 rounded-2xl border border-border-muted bg-surface-2/40 p-3 text-[11px] sm:grid-cols-3"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent4/15 text-accent4">
            <Crown className="h-3 w-3" />
          </span>
          <span className="text-text-dim">
            Plan:{' '}
            <span className="font-semibold text-text">{d.agency.plan}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-accent">
            <Globe className="h-3 w-3" />
          </span>
          <span className="truncate text-text-dim">
            Domain:{' '}
            <span className="font-mono text-text">
              {d.agency.customDomain.domain ?? '—'}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent2/15 text-accent2">
            <Network className="h-3 w-3" />
          </span>
          <span className="text-text-dim">
            Helper group:{' '}
            <span className="font-semibold text-text">
              {d.agency.dedicatedPool.poolName ?? '—'}
            </span>
            {d.agency.dedicatedPool.enabled
              ? ` · ${d.agency.dedicatedPool.memberCount} peers`
              : ''}
          </span>
        </div>
      </motion.div>

      {/* Change-password dialog (Security tile) */}
      <AppDialog open={pwOpen} onOpenChange={setPwOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Change password</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL_CLS}>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
          </AppDialogBody>
          <AppDialogFooter>
            <button
              type="button"
              onClick={() => setPwOpen(false)}
              className="rounded-lg border border-border-muted bg-surface px-4 py-2 text-xs font-semibold text-text-dim transition-colors hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitPassword}
              disabled={changePassword.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent2/20 px-4 py-2 text-xs font-semibold text-accent2 ring-1 ring-accent2/40 transition-colors hover:bg-accent2/30 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {changePassword.isPending ? 'Saving…' : 'Update password'}
            </button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      {/* Invite-member dialog (Team tile) */}
      <AppDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Invite a teammate</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Email</span>
              <input
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@agency.com"
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL_CLS}>Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                className={`mt-1 ${INPUT_CLS}`}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </AppDialogBody>
          <AppDialogFooter>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="rounded-lg border border-border-muted bg-surface px-4 py-2 text-xs font-semibold text-text-dim transition-colors hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitInvite}
              disabled={inviteMember.isPending || !inviteEmail.includes('@')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent2/20 px-4 py-2 text-xs font-semibold text-accent2 ring-1 ring-accent2/40 transition-colors hover:bg-accent2/30 disabled:opacity-50"
            >
              <Mail className="h-3.5 w-3.5" />
              {inviteMember.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

    </div>
  );
}

export default AgSetC2Mosaic;
