import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock4,
  Database,
  Download,
  Eye,
  Globe2,
  Key,
  Laptop,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  Plug,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import {
  exportWorkspaceCsv,
  useAvatarObjectUrl,
  useChangePassword,
  useDeleteAvatar,
  useDisableTotp,
  useEnableTotp,
  useRequestWorkspaceDeletion,
  useRevokeSession,
  useSessions,
  useUpdateNotificationEvent,
  useUpdateProfile,
  useUpdateWorkspaceProfile,
  useUploadAvatar,
  useVerifyTotp,
  type SessionItem,
  type TotpEnrollment,
} from '@/features/settings/api';

/**
 * ProPlusSet1Document — "Long-form Settings Document" (Pro Plus tier).
 *
 * Standalone preview-harness page rendered prop-less with built-in MOCK.
 * NO network / router / fetch / query hooks. NO required props.
 *
 * Concept (intentionally distinct from sibling /proplus/ settings designs):
 *
 *   ┌──────────── Long-form settings document ─────────────────────┐
 *   │  ┌ Sticky TOC ┐  ┌ Long-form, vertically-scrolling doc ─────┐
 *   │  │ Profile    │  │ # Profile                                │
 *   │  │ Security   │  │     fields...                            │
 *   │  │ Notifs     │  │ # Security                               │
 *   │  │ Appearance │  │     2FA + 4 sessions                     │
 *   │  │ Connected  │  │ # Notifications                          │
 *   │  │ Data       │  │     6-row × 3-channel matrix             │
 *   │  └─────────────┘  │ # Appearance                            │
 *   │                   │ # Connected accounts                    │
 *   │                   │ # Data & privacy                        │
 *   │                   └─────── prev / next chevrons ────────────┘
 *   └──────────────────────────────────────────────────────────────┘
 *
 * The TOC is sticky on the left (3 cols of a 12-col grid). The main column
 * (9 cols) is one tall scrollable document, NOT a tab strip and NOT a card
 * hub. A real `IntersectionObserver` watches each section heading; whichever
 * is closest to the top of the scroll-port is "active" — that drives the
 * TOC's `layoutId` pill (springy slide between rows). Clicking a TOC link
 * smooth-scrolls inside the document container to the target anchor.
 *
 * Distinctness vs avoid-targets:
 *   • ProSettings.tsx       — tab strip + per-tab form          [different]
 *   • StarterSettings.tsx   — card hub 3×2 grid                  [different]
 *   • AgencySettings.tsx    — chip header + shared tabs core      [different]
 *   • ProPlusSettings.tsx   — left tab rail + AnimatePresence pane[different]
 *   • SettingsTabs.tsx      — radix AppTabs                       [different]
 *
 * Distinctness vs Pro Plus Settings siblings (this is design #1 of 4):
 *   • Set1Document  — long-form doc with sticky TOC scroll-spy  [THIS FILE]
 *   • Set2Wizard    — multi-step wizard                          (sibling)
 *   • Set3Spotlight — search/spotlight palette                   (sibling)
 *   • Set4Profile   — profile-center card-hub                    (sibling)
 *
 * Styling: existing Tailwind tokens only.
 * framer-motion: TOC layoutId pill, section reveal-on-enter, control toggles.
 */

// ---------------------------------------------------------------------------
// Section model (drives both the TOC and the long-form anchors)
// ---------------------------------------------------------------------------

export type SectionId =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'connected'
  | 'data';

interface SectionDef {
  id: SectionId;
  label: string;
  Icon: typeof UserIcon;
  hint: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    label: 'Profile',
    Icon: UserIcon,
    hint: 'Name, picture, timezone',
  },
  {
    id: 'security',
    label: 'Security',
    Icon: Shield,
    hint: 'Password, 2FA, sessions',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    Icon: Bell,
    hint: 'Event x channel matrix',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    Icon: Palette,
    hint: 'Theme and density',
  },
  {
    id: 'connected',
    label: 'Connected accounts',
    Icon: Plug,
    hint: 'Google, Slack',
  },
  {
    id: 'data',
    label: 'Data & privacy',
    Icon: Database,
    hint: 'Export, retention, delete',
  },
];

// ---------------------------------------------------------------------------
// Data shape (drives every section; live adapter populates this from the API)
// ---------------------------------------------------------------------------

export interface SettingsProfile {
  displayName: string;
  email: string;
  role: string;
  timezone: string;
  /**
   * Whether the user has uploaded a profile picture. Drives the
   * image-vs-initials fallback in ProfileSection's avatar block.
   * Optional + nullable so the prop-less :35001 preview keeps rendering
   * an initials disc when SETTINGS_SKELETON is used.
   */
  hasAvatar?: boolean | null;
  /**
   * Versioned avatar URL (auth-gated). The cache-buster after `?v=` is
   * appended so the underlying `useAvatarObjectUrl` blob refetches when
   * the picture changes.
   */
  avatarUrl?: string | null;
}

export interface Session {
  id: string;
  device: string;
  detail: string;
  lastActive: string;
  current: boolean;
  Icon: typeof Laptop;
}

export type NotifChannel = 'email' | 'in_app' | 'push';

export interface NotifEvent {
  key: string;
  label: string;
  desc: string;
}

export type NotifMatrix = Record<string, Record<NotifChannel, boolean>>;

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'roomy';

export interface ConnectedAccount {
  id: string;
  name: string;
  detail: string;
  status: 'connected' | 'available';
  Icon: typeof Mail;
}

/**
 * Aggregated SettingsData shape consumed by `ProPlusSet1Document`. The live
 * adapter at `features/settings/useProPlusSettingsData.ts` maps real hooks
 * onto this shape; gaps stay as skeleton values (see SETTINGS_SKELETON).
 *
 * `notifEvents` lets the live adapter swap the displayed event list (the
 * settings API exposes 8 events; the design ships 6) without forcing a
 * design-side restructure. `timezone` is duplicated at the top level only to
 * keep the type symmetric with billing's `ReceiptData`.
 */
export interface SettingsData {
  profile: SettingsProfile;
  twoFa: boolean;
  timezone: string;
  sessions: Session[];
  notifEvents: NotifEvent[];
  notif: NotifMatrix;
  theme: Theme;
  density: Density;
  retentionDays: number;
  connected: ConnectedAccount[];
}

const TIMEZONES = [
  'Asia/Kolkata (UTC+5:30)',
  'America/New_York (UTC-5:00)',
  'America/Los_Angeles (UTC-8:00)',
  'Europe/London (UTC+0:00)',
  'Europe/Berlin (UTC+1:00)',
  'Australia/Sydney (UTC+11:00)',
];

const SKELETON_SESSIONS: Session[] = [
  {
    id: 's1',
    device: 'MacBook Pro 16" - Chrome',
    detail: 'Bengaluru, IN - 103.21.x.x',
    lastActive: 'Active now',
    current: true,
    Icon: Laptop,
  },
  {
    id: 's2',
    device: 'iPhone 15 - Safari',
    detail: 'Bengaluru, IN - 49.36.x.x',
    lastActive: '2 hours ago',
    current: false,
    Icon: Smartphone,
  },
  {
    id: 's3',
    device: 'Windows 11 - Edge',
    detail: 'Mumbai, IN - 117.97.x.x',
    lastActive: 'Yesterday, 18:42',
    current: false,
    Icon: Monitor,
  },
  {
    id: 's4',
    device: 'iPad Air - Safari',
    detail: 'Goa, IN - 27.123.x.x',
    lastActive: '3 days ago',
    current: false,
    Icon: Monitor,
  },
];

const SKELETON_NOTIF_EVENTS: NotifEvent[] = [
  {
    key: 'mailbox_paused',
    label: 'Mailbox paused',
    desc: 'A mailbox is paused by you or by the system',
  },
  {
    key: 'bounce_spike',
    label: 'Failed-delivery spike detected',
    desc: 'Failure rate crosses the alert threshold',
  },
  {
    key: 'peer_failed',
    label: 'Helper inbox failures',
    desc: 'A helper fails repeatedly and is auto-rotated',
  },
  {
    key: 'weekly_digest',
    label: 'Weekly sender-trust digest',
    desc: 'Monday 9am summary per mailbox',
  },
  {
    key: 'invoice_paid',
    label: 'Invoice paid',
    desc: 'Receipt after each successful payment',
  },
  {
    key: 'product_updates',
    label: 'Product changelog',
    desc: 'Monthly product updates and launches',
  },
];

function defaultMatrix(events: NotifEvent[]): NotifMatrix {
  const out: NotifMatrix = {};
  for (const e of events) {
    const push = e.key === 'bounce_spike';
    out[e.key] = { email: true, in_app: true, push };
  }
  if (out.product_updates) {
    out.product_updates = { email: true, in_app: false, push: false };
  }
  if (out.weekly_digest) {
    out.weekly_digest = { email: true, in_app: false, push: false };
  }
  return out;
}

const CHANNELS: Array<{ key: NotifChannel; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'in_app', label: 'In-app' },
  { key: 'push', label: 'Push' },
];

const THEMES = [
  { key: 'light' as const, label: 'Light', Icon: Sun, swatch: '#f4f5f9' },
  { key: 'dark' as const, label: 'Dark', Icon: Moon, swatch: '#12121a' },
  {
    key: 'system' as const,
    label: 'System',
    Icon: Monitor,
    swatch:
      'linear-gradient(90deg,#f4f5f9 0%,#f4f5f9 50%,#12121a 50%,#12121a 100%)',
  },
];

const DENSITIES = [
  { key: 'compact' as const, label: 'Compact', sub: 'Tight rows, fits more' },
  { key: 'comfortable' as const, label: 'Comfortable', sub: 'Default' },
  { key: 'roomy' as const, label: 'Roomy', sub: 'Generous whitespace' },
];

// Appearance is persisted client-side and applied to <html> so the choice
// actually takes effect and survives reloads — mirroring ThemeProvider, which
// reads `warmpulse.theme` ('light'|'dark') on boot and sets data-theme + .dark.
function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  root.dataset.theme = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  // 'System' clears the stored value so the next boot re-resolves from the OS.
  if (theme === 'system') window.localStorage.removeItem('warmpulse.theme');
  else window.localStorage.setItem('warmpulse.theme', resolved);
}

function applyDensity(density: Density): void {
  if (typeof window === 'undefined') return;
  document.documentElement.dataset.density = density;
  try {
    const KEY = 'warmpulse.user-settings';
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    parsed.density = density;
    window.localStorage.setItem(KEY, JSON.stringify(parsed));
  } catch {
    /* ignore parse/quota errors — the data-attribute still applied */
  }
}

const SKELETON_CONNECTED: ConnectedAccount[] = [
  {
    id: 'google',
    name: 'Google',
    detail: 'aanya@acme.io - SSO sign-in enabled',
    status: 'connected',
    Icon: Mail,
  },
  {
    id: 'slack',
    name: 'Slack',
    detail: 'acme-warmpulse.slack.com - #alerts',
    status: 'connected',
    Icon: Plug,
  },
];

/**
 * SETTINGS_SKELETON — the prop-less default. Built from the same inline
 * constants the previous mock used, so the :35001 preview render is
 * byte-identical to the pre-prop version.
 */
export const SETTINGS_SKELETON: SettingsData = {
  profile: {
    displayName: 'Aanya Kapoor',
    email: 'aanya@acme.io',
    role: 'Workspace owner',
    timezone: 'Asia/Kolkata (UTC+5:30)',
    hasAvatar: false,
    avatarUrl: null,
  },
  twoFa: true,
  timezone: 'Asia/Kolkata (UTC+5:30)',
  sessions: SKELETON_SESSIONS,
  notifEvents: SKELETON_NOTIF_EVENTS,
  notif: defaultMatrix(SKELETON_NOTIF_EVENTS),
  theme: 'dark',
  density: 'comfortable',
  retentionDays: 90,
  connected: SKELETON_CONNECTED,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string, email: string): string {
  const src = name || email;
  return (
    src
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

// Client-side avatar guard — keep in sync with `services/avatar_service.py`.
// The server rejects anything larger / outside this allow-list, but we mirror
// the limits here so the user gets an immediate inline error instead of
// shipping a 500KB PNG over the network just to see it bounce.
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

const INPUT_CLS =
  'w-full rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent/50';

// ---------------------------------------------------------------------------
// Scroll-spy hook — real IntersectionObserver inside our scroll container.
// ---------------------------------------------------------------------------

function useScrollSpy(
  sectionIds: SectionId[],
  scrollRef: RefObject<HTMLDivElement>,
): SectionId {
  const [active, setActive] = useState<SectionId>(sectionIds[0]!);
  const lastActive = useRef<SectionId>(sectionIds[0]!);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    // Track which section IDs are currently intersecting; pick the topmost.
    const visible = new Map<SectionId, number>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.sectionId as
            | SectionId
            | undefined;
          if (!id) continue;
          if (e.isIntersecting) {
            visible.set(id, e.boundingClientRect.top);
          } else {
            visible.delete(id);
          }
        }
        if (visible.size === 0) return;
        // Topmost intersecting heading wins.
        let best: SectionId | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const [id, top] of visible) {
          if (top < bestTop) {
            bestTop = top;
            best = id;
          }
        }
        if (best && best !== lastActive.current) {
          lastActive.current = best;
          setActive(best);
        }
      },
      {
        root,
        // Trigger when the heading crosses the upper third of the viewport.
        rootMargin: '0px 0px -65% 0px',
        threshold: [0, 1],
      },
    );

    const els = root.querySelectorAll<HTMLElement>('[data-section-id]');
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionIds, scrollRef]);

  return active;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusSet1Document({
  data,
}: { data?: SettingsData } = {}): JSX.Element {
  const d = data ?? SETTINGS_SKELETON;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionIds = useMemo<SectionId[]>(
    () => SECTIONS.map((s) => s.id),
    [],
  );
  const active = useScrollSpy(sectionIds, scrollRef);

  const scrollTo = useCallback((id: SectionId) => {
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-section-id="${id}"]`,
    );
    if (!target) return;
    // offsetTop is relative to the scroll container.
    root.scrollTo({
      top: target.offsetTop - 12,
      behavior: 'smooth',
    });
  }, []);

  const activeIndex = SECTIONS.findIndex((s) => s.id === active);
  const prev: SectionDef | null =
    activeIndex > 0 ? SECTIONS[activeIndex - 1] ?? null : null;
  const next: SectionDef | null =
    activeIndex >= 0 && activeIndex < SECTIONS.length - 1
      ? SECTIONS[activeIndex + 1] ?? null
      : null;

  return (
    <div className="space-y-5">
      {/* Page header (NOT a tab strip / NOT a search bar) */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Settings
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Everything you can configure, written out as a long-form document.
            Use the table of contents on the left to jump.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-dim">
          <Bookmark className="h-3.5 w-3.5 text-accent" />
          <span className="font-medium text-text">
            {SECTIONS[activeIndex]?.label ?? 'Profile'}
          </span>
          <span aria-hidden>-</span>
          <span>
            section {activeIndex + 1} of {SECTIONS.length}
          </span>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ───── Sticky TOC ───── */}
        <motion.aside
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
          className="lg:col-span-3"
        >
          <nav
            aria-label="Settings table of contents"
            className="rounded-xl border border-border-muted bg-surface/60 p-3 backdrop-blur-sm lg:sticky lg:top-4"
          >
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim">
              On this page
            </p>
            <ul className="space-y-0.5">
              {SECTIONS.map((s, i) => {
                const isActive = s.id === active;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`relative flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'text-text'
                          : 'text-text-dim hover:bg-surface-2 hover:text-text'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="proplus-set1-toc-pill"
                          className="absolute inset-0 -z-[1] rounded-lg border border-accent/30 bg-accent/10"
                          transition={{
                            type: 'spring',
                            stiffness: 320,
                            damping: 30,
                          }}
                        />
                      )}
                      <span
                        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
                          isActive
                            ? 'bg-accent/20 text-accent'
                            : 'bg-surface-2 text-text-dim'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block font-medium ${
                            isActive ? 'text-text' : ''
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="block truncate text-[11px] text-text-dim">
                          {s.hint}
                        </span>
                      </span>
                      <s.Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isActive ? 'text-accent' : 'text-text-dim'
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 border-t border-border-muted/70 pt-3">
              <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-text-dim">
                <span>Reading position</span>
                <span className="font-mono text-text">
                  {activeIndex + 1}/{SECTIONS.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.span
                  className="block h-full rounded-full bg-accent"
                  animate={{
                    width: `${((activeIndex + 1) / SECTIONS.length) * 100}%`,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 240,
                    damping: 30,
                  }}
                />
              </div>
            </div>
          </nav>
        </motion.aside>

        {/* ───── Long-form scrolling document ───── */}
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
          className="lg:col-span-9"
        >
          <div
            ref={scrollRef}
            className="relative max-h-[calc(100vh-220px)] min-h-[480px] overflow-y-auto overscroll-contain rounded-xl border border-border-muted bg-surface/40 px-5 py-5 backdrop-blur-sm sm:px-7 sm:py-6"
          >
            <ProfileSection profile={d.profile} />
            <SecuritySection
              initialTwoFa={d.twoFa}
              initialSessions={d.sessions}
            />
            <NotificationsSection
              email={d.profile.email}
              events={d.notifEvents}
              initialMatrix={d.notif}
            />
            <AppearanceSection
              initialTheme={d.theme}
              initialDensity={d.density}
            />
            <ConnectedSection initialAccounts={d.connected} />
            <DataSection retentionDays={d.retentionDays} />

            {/* Prev / Next chevrons at the bottom (linear reading hint) */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-4">
              <PrevNextButton
                dir="prev"
                section={prev}
                onClick={() => prev && scrollTo(prev.id)}
              />
              <span className="text-[11px] text-text-dim">
                End of document - last updated 2 days ago by {d.profile.displayName}
              </span>
              <PrevNextButton
                dir="next"
                section={next}
                onClick={() => next && scrollTo(next.id)}
              />
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  );
}

export default ProPlusSet1Document;

// ---------------------------------------------------------------------------
// Section shell (each becomes an IntersectionObserver target)
// ---------------------------------------------------------------------------

function DocSection({
  id,
  index,
  Icon,
  title,
  kicker,
  children,
}: {
  id: SectionId;
  index: number;
  Icon: typeof UserIcon;
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      data-section-id={id}
      id={`doc-${id}`}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -120px 0px' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="scroll-mt-4 py-6 first:pt-2 [&+section]:border-t [&+section]:border-border-muted"
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Section {index} - {kicker}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-text">
            {title}
          </h2>
        </div>
      </header>
      <div className="space-y-4 pl-0 sm:pl-12">{children}</div>
    </motion.section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[170px_1fr] sm:items-start sm:gap-4">
      <div className="pt-2">
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && (
          <span className="block text-[11px] text-text-dim">{hint}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border-l-2 border-accent/30 bg-surface-2/40 px-3 py-2 text-[13px] leading-relaxed text-text-dim">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Section: Profile
// ---------------------------------------------------------------------------

function ProfileSection({ profile }: { profile: SettingsProfile }) {
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(profile.displayName);
  const [tz, setTz] = useState(profile.timezone);

  // Reflect updates to the parent payload (real adapter pushes user.name /
  // timezone here once /auth/me resolves) without trampling unsaved edits —
  // re-sync only when the prop changes identity.
  useEffect(() => {
    setName(profile.displayName);
  }, [profile.displayName]);
  useEffect(() => {
    setTz(profile.timezone);
  }, [profile.timezone]);

  const dirty = name !== profile.displayName || tz !== profile.timezone;

  const handleSave = () => {
    updateProfile.mutate(
      // The select stores display strings ("Asia/Kolkata (UTC+5:30)"); the
      // backend wants the bare IANA name — strip the parenthetical offset.
      { display_name: name.trim(), timezone: tz.split(' (')[0]!.trim() },
      {
        onSuccess: () => toast.success('Profile updated'),
        onError: () => toast.error('Could not save profile'),
      },
    );
  };

  // Build the timezone select list so the current value is always present
  // (the live adapter may report any IANA name, not just the 6 presets).
  const tzOptions = useMemo(() => {
    const set = new Set<string>(TIMEZONES);
    if (profile.timezone) set.add(profile.timezone);
    if (tz) set.add(tz);
    return Array.from(set);
  }, [profile.timezone, tz]);

  // ── Avatar upload ────────────────────────────────────────────────────
  // The endpoint is auth-gated so we can't put it in an <img src>; mirror
  // the proven AvatarRow pattern from ProSettings: pick the cache-buster
  // version off `avatar_url`, fetch the blob via the shared axios instance
  // (`useAvatarObjectUrl`), and fall back to the colored initials disc
  // when no avatar is stored. The :35001 design-preview reaches this code
  // too — `useUploadAvatar`'s mutation will just no-op against a fake
  // backend, which is fine for visual review.
  const upload = useUploadAvatar();
  const removeAvatar = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAvatar = !!profile.hasAvatar;
  const avatarVersion = profile.avatarUrl?.includes('v=')
    ? profile.avatarUrl.split('v=')[1] ?? ''
    : '';
  const objectUrl = useAvatarObjectUrl(hasAvatar, avatarVersion);
  const avatarBusy = upload.isPending || removeAvatar.isPending;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
      toast.error('Use a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be 512KB or smaller');
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success('Profile picture updated'),
      onError: () => toast.error('Could not upload picture'),
    });
  };

  const onRemoveAvatar = () => {
    removeAvatar.mutate(undefined, {
      onSuccess: () => toast.success('Profile picture removed'),
      onError: () => toast.error('Could not remove picture'),
    });
  };

  return (
    <DocSection id="profile" index={1} Icon={UserIcon} kicker="Identity" title="Profile">
      <Prose>
        Your profile is shown next to comments, audit-log entries, and to
        workspace admins. The email address is the unique identifier and is
        immutable - everything else can be edited inline below.
      </Prose>

      <div className="flex flex-col gap-4 rounded-lg border border-border-muted bg-surface-2 px-4 py-3 sm:flex-row sm:items-center">
        {/* Avatar with hover-camera overlay — click anywhere on the disc
            to open the file picker. The hidden <input> below carries the
            real `accept` and `onChange`. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label={hasAvatar ? 'Replace profile picture' : 'Upload profile picture'}
          className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-muted bg-accent/15 text-base font-semibold text-accent transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-wait disabled:opacity-60"
        >
          {hasAvatar && objectUrl ? (
            <img
              src={objectUrl}
              alt={`${name || profile.email}'s profile picture`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden>{initials(name, profile.email)}</span>
          )}
          {/* Camera overlay — only visible on hover/focus so the disc
              still reads as a portrait at rest. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {upload.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-text" />
            ) : (
              <Camera className="h-4 w-4 text-text" />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          <p className="truncate text-xs text-text-dim">
            {profile.email} - {profile.role}
          </p>
          {/* Inline upload affordance — discoverable next to the avatar
              for users who don't think to click the disc itself. PNG /
              JPEG / WebP, ≤ 512 KB (matches `avatar_service.py`). */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface px-2.5 py-1 text-xs font-medium text-text transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-wait disabled:opacity-60"
            >
              {upload.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {hasAvatar ? 'Replace' : 'Upload picture'}
            </button>
            {hasAvatar ? (
              <button
                type="button"
                onClick={onRemoveAvatar}
                disabled={avatarBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface px-2.5 py-1 text-xs font-medium text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3 disabled:cursor-wait disabled:opacity-60"
              >
                {removeAvatar.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                Remove
              </button>
            ) : null}
            <span className="text-[10px] text-text-dim">
              PNG, JPEG or WebP - up to 512 KB
            </span>
          </div>
        </div>

        <Badge variant="green">
          <ShieldCheck className="h-3 w-3" />
          Verified
        </Badge>

        {/* Hidden file input — opened programmatically by either button
            above. `accept` is doubly-enforced by `ALLOWED_AVATAR_MIME`
            in onPickFile so we still reject mis-typed files. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>

      <Field label="Display name" hint="Visible to teammates">
        <input
          className={INPUT_CLS}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field label="Email" hint="Used for sign-in. Immutable.">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            className={`${INPUT_CLS} cursor-not-allowed pl-9 opacity-70`}
            value={profile.email}
            disabled
          />
        </div>
      </Field>

      <Field
        label="Timezone"
        hint="Affects schedules and daily report timestamps"
      >
        <div className="relative">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <select
            className={`${INPUT_CLS} cursor-pointer pl-9`}
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            {tzOptions.map((z) => (
              <option key={z} value={z} className="bg-surface text-text">
                {z}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setName(profile.displayName);
              setTz(profile.timezone);
            }}
            disabled={updateProfile.isPending}
            className="rounded-lg border border-border-muted px-3 py-1.5 text-sm font-medium text-text-dim transition-colors hover:text-text disabled:opacity-50"
          >
            Discard
          </button>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={handleSave}
          disabled={!dirty || updateProfile.isPending}
          leftIcon={
            updateProfile.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : undefined
          }
        >
          {updateProfile.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </DocSection>
  );
}

// ---------------------------------------------------------------------------
// Section: Security (password + 2FA + sessions)
// ---------------------------------------------------------------------------

function SecuritySection({
  initialTwoFa,
  initialSessions,
}: {
  initialTwoFa: boolean;
  initialSessions: Session[];
}) {
  // ── Password change (real) ───────────────────────────────────────────
  const changePassword = useChangePassword();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const newPwValid = newPw.length >= 12;
  const pwReady = currentPw.length > 0 && newPwValid;

  const submitPassword = () => {
    if (!pwReady) return;
    changePassword.mutate(
      { current_password: currentPw, new_password: newPw },
      {
        onSuccess: () => {
          toast.success('Password updated');
          setCurrentPw('');
          setNewPw('');
        },
        onError: () =>
          toast.error('Could not change password - check your current one'),
      },
    );
  };

  // ── 2FA enrol / verify / disable (real) ──────────────────────────────
  // `twoFa` is server truth via the adapter (security.totp_enabled). Enrol
  // opens a dialog (QR + secret + recovery codes + verify); disable opens a
  // password re-auth dialog. Mutations invalidate the settings cache, so the
  // adapter re-derives `initialTwoFa` and the prop flips on success.
  const enrolTotp = useEnableTotp();
  const verifyTotp = useVerifyTotp();
  const disableTotp = useDisableTotp();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePw, setDisablePw] = useState('');

  const startEnroll = async () => {
    setEnrollOpen(true);
    setTotpCode('');
    try {
      const enrol = await enrolTotp.mutateAsync();
      setEnrollment(enrol);
    } catch {
      toast.error('Could not start 2FA enrolment');
      setEnrollOpen(false);
    }
  };

  const finishEnroll = async () => {
    if (totpCode.trim().length < 6) return;
    try {
      await verifyTotp.mutateAsync({ code: totpCode.trim() });
      toast.success('Two-factor authentication enabled');
      setEnrollOpen(false);
      setEnrollment(null);
      setTotpCode('');
    } catch {
      toast.error('Invalid code - try again');
    }
  };

  const submitDisable = async () => {
    if (!disablePw) return;
    try {
      await disableTotp.mutateAsync({ password: disablePw });
      toast.success('Two-factor authentication disabled');
      setDisableOpen(false);
      setDisablePw('');
    } catch {
      toast.error('Could not disable 2FA - check your password');
    }
  };

  const onToggle2fa = () => {
    if (initialTwoFa) setDisableOpen(true);
    else void startEnroll();
  };

  const onRecoveryCodes = () => {
    if (initialTwoFa) {
      // Codes are only shown once during enrolment; there's no re-fetch
      // endpoint. Point the user at the documented path rather than faking
      // a list here.
      toast.info(
        'Recovery codes are shown once during setup. Disable and re-enable 2FA to regenerate them.',
      );
    } else {
      void startEnroll();
    }
  };

  // ── Sessions (real) ──────────────────────────────────────────────────
  // Live device list straight from /workspace/settings/sessions. When the
  // endpoint returns nothing we fall back to the skeleton rows the adapter
  // passed in (same behaviour as useProPlusSettingsData) so the section
  // still renders populated — but those skeleton rows are not revocable.
  const sessionsQ = useSessions();
  const revoke = useRevokeSession();
  const apiSessions = sessionsQ.data ?? [];
  const live = apiSessions.length > 0;
  const fallbackIcon = initialSessions[0]?.Icon ?? Laptop;
  const rows: Session[] = live
    ? apiSessions.map((s: SessionItem) => ({
        id: s.id,
        device: s.label,
        detail: s.detail,
        lastActive: relSessionTime(s.last_active),
        current: s.is_current,
        Icon: fallbackIcon,
      }))
    : initialSessions;
  const otherCount = rows.filter((s) => !s.current).length;

  const revokeOne = async (id: string) => {
    if (!live) return; // skeleton rows aren't real sessions
    const ok = await confirm({
      title: 'Sign out session?',
      description: 'This session will be revoked immediately.',
      danger: true,
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(id);
      toast.success('Session revoked');
    } catch {
      toast.error('Could not revoke session');
    }
  };

  const revokeOthers = async () => {
    if (!live) return;
    const others = apiSessions.filter((s) => !s.is_current);
    if (others.length === 0) return;
    const ok = await confirm({
      title: 'Sign out other sessions?',
      description: `Revoke ${others.length} session(s). Your current browser stays signed in.`,
      danger: true,
      confirmLabel: 'Sign out all',
    });
    if (!ok) return;
    let failed = 0;
    for (const s of others) {
      try {
        await revoke.mutateAsync(s.id);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) toast.success('Other sessions signed out');
    else toast.error(`${failed} session(s) could not be revoked`);
  };

  return (
    <DocSection id="security" index={2} Icon={Shield} kicker="Account safety" title="Security">
      <Prose>
        WarmPulse stores every login detail encrypted at rest. Strengthen this
        account with a strong password, two-factor authentication, and by
        revoking sessions you no longer recognise.
      </Prose>

      {/* Password */}
      <div className="rounded-lg border border-border-muted bg-surface-2 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Key className="h-4 w-4 text-text-dim" />
          <h3 className="text-sm font-semibold text-text">Password</h3>
        </div>
        <Field label="Current password">
          <input
            type="password"
            className={INPUT_CLS}
            value={currentPw}
            autoComplete="current-password"
            placeholder="Enter your current password"
            onChange={(e) => setCurrentPw(e.target.value)}
          />
        </Field>
        <div className="mt-3">
          <Field label="New password" hint="At least 12 characters">
            <input
              type="password"
              className={INPUT_CLS}
              value={newPw}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              onChange={(e) => setNewPw(e.target.value)}
            />
            {newPw.length > 0 && !newPwValid && (
              <span className="mt-1 block text-[11px] text-accent3">
                Must be at least 12 characters.
              </span>
            )}
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={submitPassword}
            disabled={!pwReady || changePassword.isPending}
            leftIcon={
              changePassword.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : undefined
            }
          >
            {changePassword.isPending ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </div>

      {/* 2FA */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              initialTwoFa
                ? 'bg-accent/15 text-accent'
                : 'bg-surface text-text-dim'
            }`}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-text">
              Two-factor authentication
            </p>
            <p className="text-xs text-text-dim">
              {initialTwoFa
                ? 'Authenticator app enrolled - TOTP required on sign-in'
                : 'Not enrolled - recommended'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Toggle on={initialTwoFa} onClick={onToggle2fa} label="2FA" />
          <Button size="sm" variant="ghost" onClick={onRecoveryCodes}>
            Recovery codes
          </Button>
        </div>
      </div>

      {/* Sessions */}
      <div className="rounded-lg border border-border-muted bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock4 className="h-4 w-4 text-text-dim" />
            <h3 className="text-sm font-semibold text-text">
              Active sessions
            </h3>
            <span className="rounded-full border border-border-muted bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-dim">
              {rows.length}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-accent3 hover:bg-accent3/10"
            leftIcon={<LogOut className="h-3.5 w-3.5" />}
            disabled={!live || otherCount === 0 || revoke.isPending}
            onClick={revokeOthers}
          >
            Sign out others
          </Button>
        </div>
        <ul className="divide-y divide-border-muted/60">
          {rows.map((s) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface text-text-dim">
                <s.Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {s.device}
                  {s.current && (
                    <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      This device
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-text-dim">
                  {s.detail} - {s.lastActive}
                </p>
              </div>
              {!s.current && live && (
                <button
                  type="button"
                  onClick={() => void revokeOne(s.id)}
                  disabled={revoke.isPending}
                  className="rounded-lg border border-border-muted px-2 py-1 text-[11px] font-medium text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3 disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </motion.li>
          ))}
        </ul>
      </div>

      {/* 2FA enrol dialog — QR + secret + recovery codes + verify */}
      <AppDialog
        open={enrollOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEnrollOpen(false);
            setEnrollment(null);
            setTotpCode('');
          }
        }}
      >
        <AppDialogContent description="Set up two-factor authentication">
          <AppDialogHeader>
            <AppDialogTitle>Enable two-factor authentication</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            {enrollment ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <div className="shrink-0 rounded-md bg-white p-2.5">
                    <QRCodeSVG
                      value={enrollment.qr_url}
                      size={132}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#0a0a0f"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">
                      Scan in your authenticator app
                    </p>
                    <p className="mt-0.5 text-xs text-text-dim">
                      Google Authenticator, 1Password, Authy, etc.
                    </p>
                    <p className="mt-2 text-xs text-text-dim">
                      Or enter this secret manually:
                    </p>
                    <code className="mt-1 inline-block break-all rounded bg-bg px-1.5 py-1 text-xs text-text">
                      {enrollment.secret}
                    </code>
                  </div>
                </div>

                {enrollment.recovery_codes.length > 0 && (
                  <div className="mt-1">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text">
                        Recovery codes - save these somewhere safe
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          className="rounded-md border border-border-muted px-2 py-1 text-[11px] font-medium text-text-dim transition-colors hover:text-text"
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              enrollment.recovery_codes.join('\n'),
                            );
                            toast.success('Recovery codes copied');
                          }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-border-muted px-2 py-1 text-[11px] font-medium text-text-dim transition-colors hover:text-text"
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
                        >
                          Download
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 rounded bg-bg p-2 font-mono text-xs text-text sm:grid-cols-4">
                      {enrollment.recovery_codes.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                <Field label="Confirm code">
                  <Input
                    inputMode="numeric"
                    placeholder="123456"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <div className="flex items-center gap-2 py-6 text-sm text-text-dim">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing your authenticator secret…
              </div>
            )}
          </AppDialogBody>
          <AppDialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEnrollOpen(false);
                setEnrollment(null);
                setTotpCode('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void finishEnroll()}
              disabled={
                !enrollment || verifyTotp.isPending || totpCode.trim().length < 6
              }
              leftIcon={
                verifyTotp.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : undefined
              }
            >
              {verifyTotp.isPending ? 'Verifying…' : 'Confirm'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      {/* 2FA disable dialog — password re-auth */}
      <AppDialog
        open={disableOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDisableOpen(false);
            setDisablePw('');
          }
        }}
      >
        <AppDialogContent description="Disable two-factor authentication">
          <AppDialogHeader>
            <AppDialogTitle>Disable two-factor authentication</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogBody>
            <p className="text-sm text-text-dim">
              To disable 2FA, confirm your account password.
            </p>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={disablePw}
                onChange={(e) => setDisablePw(e.target.value)}
              />
            </Field>
          </AppDialogBody>
          <AppDialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDisableOpen(false);
                setDisablePw('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void submitDisable()}
              disabled={!disablePw || disableTotp.isPending}
              leftIcon={
                disableTotp.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : undefined
              }
            >
              {disableTotp.isPending ? 'Disabling…' : 'Disable 2FA'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </DocSection>
  );
}

/** Relative-time label for a session's last-active timestamp. */
function relSessionTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 1) return 'Active now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Section: Notifications matrix
// ---------------------------------------------------------------------------

function NotificationsSection({
  email,
  events,
  initialMatrix,
}: {
  email: string;
  events: NotifEvent[];
  initialMatrix: NotifMatrix;
}) {
  const updateEvent = useUpdateNotificationEvent();
  const [matrix, setMatrix] = useState<NotifMatrix>(initialMatrix);

  useEffect(() => {
    setMatrix(initialMatrix);
  }, [initialMatrix]);

  function toggle(event: string, ch: NotifChannel) {
    const prevRow =
      matrix[event] ?? { email: false, in_app: false, push: false };
    const nextEnabled = !prevRow[ch];
    // Optimistic local flip for the design's toggle animation…
    setMatrix((prev) => {
      const row = prev[event] ?? { email: false, in_app: false, push: false };
      return { ...prev, [event]: { ...row, [ch]: nextEnabled } };
    });
    // …then persist. The channel keys line up 1:1 with the API enum.
    updateEvent.mutate(
      { key: event, channel: ch, enabled: nextEnabled },
      {
        onError: () => {
          toast.error('Could not save notification preference');
          // Roll the local state back to match the server.
          setMatrix((prev) => {
            const row =
              prev[event] ?? { email: false, in_app: false, push: false };
            return { ...prev, [event]: { ...row, [ch]: prevRow[ch] } };
          });
        },
      },
    );
  }

  const enabled = useMemo(
    () =>
      Object.values(matrix).reduce(
        (acc, row) =>
          acc + (row.email ? 1 : 0) + (row.in_app ? 1 : 0) + (row.push ? 1 : 0),
        0,
      ),
    [matrix],
  );

  return (
    <DocSection
      id="notifications"
      index={3}
      Icon={Bell}
      kicker="Reach you"
      title="Notifications"
    >
      <Prose>
        Choose how each event reaches you across three channels. Push uses
        your device's native notifier when available; in-app shows in the
        inbox bell; email goes to {email}. Currently{' '}
        <span className="font-semibold text-text">{enabled}</span> channels
        enabled.
      </Prose>

      <div className="overflow-x-auto rounded-lg border border-border-muted bg-surface-2">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 border-b border-border-muted px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim">
            <span>Event</span>
            {CHANNELS.map((c) => (
              <span key={c.key} className="text-center">
                {c.label}
              </span>
            ))}
          </div>
          {events.map((e) => {
            const row =
              matrix[e.key] ?? { email: false, in_app: false, push: false };
            return (
              <div
                key={e.key}
                className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 border-b border-border-muted/60 px-4 py-3 last:border-0"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-medium text-text">{e.label}</p>
                  <p className="truncate text-[11px] text-text-dim">{e.desc}</p>
                </div>
                {CHANNELS.map((c) => (
                  <div key={c.key} className="flex justify-center">
                    <Toggle
                      on={row[c.key]}
                      onClick={() => toggle(e.key, c.key)}
                      label={`${e.label} - ${c.label}`}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </DocSection>
  );
}

// ---------------------------------------------------------------------------
// Section: Appearance (theme + density)
// ---------------------------------------------------------------------------

function AppearanceSection({
  initialTheme,
  initialDensity,
}: {
  initialTheme: Theme;
  initialDensity: Density;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [density, setDensity] = useState<Density>(initialDensity);

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);
  useEffect(() => {
    setDensity(initialDensity);
  }, [initialDensity]);

  return (
    <DocSection
      id="appearance"
      index={4}
      Icon={Palette}
      kicker="How it looks"
      title="Appearance"
    >
      <Prose>
        Appearance is per-user and applies on every device you sign in from.
        Picking System mirrors your operating-system preference.
      </Prose>

      <Field label="Theme">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {THEMES.map((t) => {
            const isCurrent = t.key === theme;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTheme(t.key);
                  applyTheme(t.key);
                }}
                className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-colors ${
                  isCurrent
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-border-muted bg-surface-2 hover:border-border-muted/80'
                }`}
              >
                <span
                  className="mb-2 block h-12 w-full rounded-md border border-border-muted"
                  style={{ background: t.swatch }}
                />
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                    <t.Icon className="h-4 w-4 text-text-dim" />
                    {t.label}
                  </span>
                  {isCurrent && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="h-2 w-2 rounded-full bg-accent"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Density" hint="Row height across tables and lists">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {DENSITIES.map((d) => {
            const isCurrent = d.key === density;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setDensity(d.key);
                  applyDensity(d.key);
                }}
                className={`relative rounded-xl border p-3 text-left transition-colors ${
                  isCurrent
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-border-muted bg-surface-2 hover:border-border-muted/80'
                }`}
              >
                <p className="text-sm font-medium text-text">{d.label}</p>
                <p className="mt-0.5 text-[11px] text-text-dim">{d.sub}</p>
                {isCurrent && (
                  <motion.span
                    layoutId="proplus-set1-density-pill"
                    className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Field>
    </DocSection>
  );
}

// ---------------------------------------------------------------------------
// Section: Connected accounts
// ---------------------------------------------------------------------------

function ConnectedSection({
  initialAccounts,
}: {
  initialAccounts: ConnectedAccount[];
}) {
  // Read-only: this build has no OAuth-connections endpoint to drive
  // connect/disconnect, so we surface the current status without inert
  // action buttons. Render the adapter's accounts directly.
  return (
    <DocSection
      id="connected"
      index={5}
      Icon={Plug}
      kicker="Integrations"
      title="Connected accounts"
    >
      <Prose>
        Connected accounts unlock SSO sign-in, alert routing, and one-click
        export destinations. Statuses below reflect how you signed in to this
        workspace.
      </Prose>
      <ul className="space-y-2.5">
        {initialAccounts.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-text-dim">
              <a.Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{a.name}</p>
              <p className="truncate text-[11px] text-text-dim">{a.detail}</p>
            </div>
            {a.status === 'connected' ? (
              <Badge variant="green">
                <ShieldCheck className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="neutral">Available</Badge>
            )}
          </li>
        ))}
      </ul>
    </DocSection>
  );
}

// ---------------------------------------------------------------------------
// Section: Data & privacy
// ---------------------------------------------------------------------------

function DataSection({ retentionDays }: { retentionDays: number }) {
  const updateWorkspace = useUpdateWorkspaceProfile();
  const requestDeletion = useRequestWorkspaceDeletion();
  const [exporting, setExporting] = useState(false);

  // Toggle between the two preset windows. Both 90 and 180 sit inside the
  // backend's allowed 30–730 range (WorkspaceProfileUpdate.retention_days).
  const nextRetention = retentionDays === 90 ? 180 : 90;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportWorkspaceCsv();
      toast.success('Export started - check your downloads');
    } catch {
      toast.error('Could not export workspace data');
    } finally {
      setExporting(false);
    }
  };

  const handleRetention = () => {
    updateWorkspace.mutate(
      { retention_days: nextRetention },
      {
        onSuccess: () =>
          toast.success(`Log retention set to ${nextRetention} days`),
        onError: () => toast.error('Could not update retention'),
      },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this workspace?',
      description:
        'This permanently deletes the workspace and all of its data after a 30-day grace period. This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete workspace',
    });
    if (!ok) return;
    requestDeletion.mutate(undefined, {
      onSuccess: () =>
        toast.success('Workspace deletion scheduled - 30-day grace period started'),
      onError: () => toast.error('Could not schedule deletion'),
    });
  };

  return (
    <DocSection
      id="data"
      index={6}
      Icon={Database}
      kicker="Compliance"
      title="Data & privacy"
    >
      <Prose>
        Download a copy of your workspace data, configure retention, or
        permanently delete this workspace. Deletions have a 30-day grace
        period before destruction.
      </Prose>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text">Export workspace data</p>
          <p className="text-[11px] text-text-dim">
            CSV of recent warmup logs - streamed from the server
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void handleExport()}
          disabled={exporting}
          leftIcon={
            exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )
          }
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text">Log retention</p>
          <p className="text-[11px] text-text-dim">
            Currently {retentionDays} days - controls how long warmup logs are
            kept
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRetention}
          disabled={updateWorkspace.isPending}
          leftIcon={
            updateWorkspace.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )
          }
        >
          {updateWorkspace.isPending
            ? 'Saving…'
            : `Change to ${nextRetention} days`}
        </Button>
      </div>

      <div className="rounded-lg border border-accent3/30 bg-accent3/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent3/15 text-accent3">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-accent3">Danger zone</p>
            <p className="text-[11px] text-text-dim">
              Permanently delete this workspace and all of its data. Owner only.
            </p>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={requestDeletion.isPending}
            leftIcon={
              requestDeletion.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )
            }
          >
            {requestDeletion.isPending ? 'Scheduling…' : 'Delete workspace'}
          </Button>
        </div>
      </div>
    </DocSection>
  );
}

// ---------------------------------------------------------------------------
// Shared atoms (Toggle + Prev/Next)
// ---------------------------------------------------------------------------

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-surface-2 border border-border-muted'
      }`}
    >
      <motion.span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-bg shadow-sm"
        animate={{ left: on ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

function PrevNextButton({
  dir,
  section,
  onClick,
}: {
  dir: 'prev' | 'next';
  section: SectionDef | null;
  onClick: () => void;
}) {
  const disabled = !section;
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  const label = dir === 'prev' ? 'Previous' : 'Next';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { x: dir === 'prev' ? -3 : 3 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
      className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-border-muted/40 opacity-40'
          : 'border-border-muted bg-surface-2 hover:border-accent/40 hover:bg-surface-2/80'
      }`}
    >
      {dir === 'prev' && (
        <Icon className="h-4 w-4 text-text-dim group-hover:text-accent" />
      )}
      <div className={`${dir === 'next' ? 'text-right' : 'text-left'}`}>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
        <span className="block text-sm font-semibold text-text">
          {section ? section.label : '-'}
        </span>
      </div>
      {dir === 'next' && (
        <Icon className="h-4 w-4 text-text-dim group-hover:text-accent" />
      )}
    </motion.button>
  );
}
