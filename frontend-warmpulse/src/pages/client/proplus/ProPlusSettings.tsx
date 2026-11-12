import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Check,
  Database,
  Download,
  Globe2,
  Laptop,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
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
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  applyThemeMode,
  resolveThemeMode,
  useThemeMode,
  type ThemeMode,
} from '@/lib/useThemeMode';

/**
 * ProPlusSettings — "Pro Plus" tier settings hub.
 *
 * Standalone preview-harness page: renders prop-less with built-in MOCK data,
 * no network/router/query hooks. The harness supplies the shell + sidebar, so
 * this renders ONLY page content (no nav / chrome).
 *
 * Layout: a left tab-rail + animated pane (AnimatePresence on tab switch).
 * Tabs:
 *   1. Profile        — display name, email, timezone, avatar uploader
 *                        (preview / initials fallback + Upload / Remove, visual)
 *   2. Security        — 2FA enrolled state (manage / disable),
 *                        active sessions list with revoke
 *   3. Notifications   — 8-event × 3-channel toggle matrix (local state)
 *   4. Appearance      — theme picker (local state)
 *   5. Data            — export CSV / GDPR / delete account affordances
 *
 * Styling: existing Tailwind tokens only (bg-bg / bg-surface / bg-surface-2 /
 * text-text / text-text-dim / border-border-muted / text-accent / text-accent3
 * / text-accent4). framer-motion entrance + micro-interactions.
 */

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabKey =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'data';

const TABS: Array<{ key: TabKey; name: string; Icon: typeof UserIcon }> = [
  { key: 'profile', name: 'Profile', Icon: UserIcon },
  { key: 'security', name: 'Security', Icon: Shield },
  { key: 'notifications', name: 'Notifications', Icon: Bell },
  { key: 'appearance', name: 'Appearance', Icon: Palette },
  { key: 'data', name: 'Data & privacy', Icon: Database },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PROFILE = {
  displayName: 'Aanya Kapoor',
  email: 'aanya@acme.io',
  timezone: 'Asia/Kolkata (UTC+5:30)',
};

const TIMEZONES = [
  'Asia/Kolkata (UTC+5:30)',
  'America/New_York (UTC−5:00)',
  'America/Los_Angeles (UTC−8:00)',
  'Europe/London (UTC+0:00)',
  'Europe/Berlin (UTC+1:00)',
  'Australia/Sydney (UTC+11:00)',
];

interface SessionRow {
  id: string;
  device: string;
  detail: string;
  lastActive: string;
  current: boolean;
  Icon: typeof Laptop;
}

const SESSIONS: SessionRow[] = [
  {
    id: 's1',
    device: 'MacBook Pro · Chrome',
    detail: 'Bengaluru, IN · 103.21.x.x',
    lastActive: 'Active now',
    current: true,
    Icon: Laptop,
  },
  {
    id: 's2',
    device: 'iPhone 15 · Safari',
    detail: 'Bengaluru, IN · 49.36.x.x',
    lastActive: '2 hours ago',
    current: false,
    Icon: Smartphone,
  },
  {
    id: 's3',
    device: 'Windows 11 · Edge',
    detail: 'Mumbai, IN · 117.97.x.x',
    lastActive: 'Yesterday, 18:42',
    current: false,
    Icon: Monitor,
  },
];

const EVENT_DEFS: Array<{ key: string; label: string; desc: string }> = [
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
    desc: 'A helper inbox fails repeatedly · auto-rotated',
  },
  {
    key: 'weekly_digest',
    label: 'Weekly sender-trust digest',
    desc: 'Monday 9am · 7-day summary per mailbox',
  },
  {
    key: 'invoice_paid',
    label: 'Invoice paid',
    desc: 'Receipt after each successful payment',
  },
  {
    key: 'invoice_failed',
    label: 'Payment failed',
    desc: 'Immediate alert if a payment method fails',
  },
  {
    key: 'member_invited',
    label: 'Member invited / joined',
    desc: 'A workspace member is invited or accepts',
  },
  {
    key: 'product_updates',
    label: 'Product changelog',
    desc: 'Monthly product updates · feature launches',
  },
];

type Channel = 'email' | 'in_app' | 'push';
type Matrix = Record<string, Record<Channel, boolean>>;

function defaultMatrix(): Matrix {
  const out: Matrix = {};
  for (const e of EVENT_DEFS) {
    // Sensible defaults: email + in-app on, push mostly off.
    const push = e.key === 'bounce_spike' || e.key === 'invoice_failed';
    out[e.key] = { email: true, in_app: true, push };
  }
  // A couple of opinionated off-by-default rows for realism.
  out.product_updates = { email: true, in_app: false, push: false };
  out.weekly_digest = { email: true, in_app: false, push: false };
  return out;
}

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
type ThemeKey = (typeof THEMES)[number]['key'];

// Theme preference is shared with ProSettings (same `wp_user_settings` blob
// and the legacy `warmpulse.theme` key) so the choice is consistent no matter
// which plan's Settings page rendered it.
const USER_SETTINGS_KEY = 'wp_user_settings';

function readThemePref(): ThemeKey {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: string };
      if (
        parsed.theme === 'light' ||
        parsed.theme === 'dark' ||
        parsed.theme === 'system'
      ) {
        return parsed.theme;
      }
    }
    const legacy = window.localStorage.getItem('warmpulse.theme');
    if (legacy === 'light' || legacy === 'dark') return legacy;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function persistThemePref(theme: ThemeKey): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    obj.theme = theme;
    window.localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

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

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusSettings(): JSX.Element {
  const [active, setActive] = useState<TabKey>('profile');

  return (
    <div className="space-y-5">
      <motion.header
        {...fade(0)}
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
            Profile, security, notifications and data — for your workspace.
          </p>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Tab rail */}
        <motion.nav
          {...fade(0.05)}
          role="tablist"
          aria-label="Settings sections"
          className="lg:col-span-3"
        >
          <Card noShimmer>
            <CardContent className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
              {TABS.map((t) => {
                const isActive = t.key === active;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(t.key)}
                    className={`relative flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-text'
                        : 'text-text-dim hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="settings-tab-pill"
                        className="absolute inset-0 -z-[1] rounded-lg border border-accent/30 bg-accent/10"
                        transition={{
                          type: 'spring',
                          stiffness: 320,
                          damping: 28,
                        }}
                      />
                    )}
                    <t.Icon
                      className={`h-4 w-4 ${isActive ? 'text-accent' : ''}`}
                    />
                    {t.name}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </motion.nav>

        {/* Pane */}
        <motion.div {...fade(0.1)} className="lg:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-4"
            >
              {active === 'profile' && <ProfileTab />}
              {active === 'security' && <SecurityTab />}
              {active === 'notifications' && <NotificationsTab />}
              {active === 'appearance' && <AppearanceTab />}
              {active === 'data' && <DataTab />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

export default ProPlusSettings;

// ---------------------------------------------------------------------------
// Shared section shell
// ---------------------------------------------------------------------------

function Section({
  title,
  desc,
  action,
  danger,
  children,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      noShimmer
      className={danger ? 'border-accent3/30' : undefined}
    >
      <CardContent className="space-y-4 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h3
              className={`text-base font-semibold ${
                danger ? 'text-accent3' : 'text-text'
              }`}
            >
              {title}
            </h3>
            <p className="text-sm text-text-dim">{desc}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <span className="text-sm font-medium text-text-dim">{label}</span>
      <div>{children}</div>
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent/50';

// ---------------------------------------------------------------------------
// Tab: Profile
// ---------------------------------------------------------------------------

function ProfileTab() {
  const [name, setName] = useState(MOCK_PROFILE.displayName);
  const [tz, setTz] = useState(MOCK_PROFILE.timezone);
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Visual-only: read into an object URL for the live preview.
    setAvatar(URL.createObjectURL(file));
  }

  return (
    <Section
      title="Profile"
      desc="Your name, email and picture, shown across WarmPulse and to admins."
      action={
        <Button size="sm" leftIcon={<Check className="h-3.5 w-3.5" />}>
          Save changes
        </Button>
      }
    >
      <Field label="Profile picture">
        <div className="flex items-center gap-4">
          {avatar ? (
            <img
              src={avatar}
              alt="Your profile"
              className="h-16 w-16 rounded-full border border-border-muted object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-lg font-semibold text-accent"
            >
              {initials(name, MOCK_PROFILE.email)}
            </span>
          )}
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPick}
            />
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => fileRef.current?.click()}
            >
              {avatar ? 'Replace' : 'Upload'}
            </Button>
            {avatar && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<X className="h-3.5 w-3.5" />}
                onClick={() => setAvatar(null)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </Field>

      <Field label="Display name">
        <input
          className={INPUT_CLS}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </Field>

      <Field label="Email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <input
            className={`${INPUT_CLS} cursor-not-allowed pl-9 opacity-70`}
            value={MOCK_PROFILE.email}
            disabled
          />
        </div>
      </Field>

      <Field label="Timezone">
        <div className="relative">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <select
            className={`${INPUT_CLS} cursor-pointer pl-9`}
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            {TIMEZONES.map((z) => (
              <option key={z} value={z} className="bg-surface text-text">
                {z}
              </option>
            ))}
          </select>
        </div>
      </Field>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Security
// ---------------------------------------------------------------------------

function SecurityTab() {
  const [twoFa, setTwoFa] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>(SESSIONS);

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <>
      <Section
        title="Two-factor authentication"
        desc="An authenticator app is required on every sign-in."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                twoFa
                  ? 'bg-accent/15 text-accent'
                  : 'bg-surface text-text-dim'
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-text">
                Authenticator app
              </p>
              <p className="text-xs text-text-dim">
                {twoFa
                  ? 'Enrolled · TOTP required on sign-in'
                  : 'Not enrolled · recommended'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                twoFa
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text-dim'
              }`}
            >
              {twoFa ? 'Enabled' : 'Disabled'}
            </span>
            {twoFa ? (
              <>
                <Button size="sm" variant="secondary">
                  Manage
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-accent3 hover:bg-accent3/10"
                  onClick={() => setTwoFa(false)}
                >
                  Disable
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setTwoFa(true)}>
                Enable
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-text-dim">
          Recovery codes were issued at enrolment and can be regenerated from
          here.
        </p>
      </Section>

      <Section
        title="Active sessions"
        desc={`${sessions.length} session(s) currently signed in.`}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="text-accent3 hover:bg-accent3/10"
            leftIcon={<LogOut className="h-3.5 w-3.5" />}
            disabled={otherCount === 0}
            onClick={() =>
              setSessions((prev) => prev.filter((s) => s.current))
            }
          >
            Sign out others
          </Button>
        }
      >
        <ul className="divide-y divide-border-muted/60">
          <AnimatePresence initial={false}>
            {sessions.map((s) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12, height: 0 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim">
                  <s.Icon className="h-4 w-4" />
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
                  <p className="truncate text-xs text-text-dim">{s.detail}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-text-dim sm:block">
                  {s.lastActive}
                </span>
                {s.current ? (
                  <span className="w-[68px] shrink-0 text-right text-xs text-text-dim">
                    —
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setSessions((prev) =>
                        prev.filter((x) => x.id !== s.id),
                      )
                    }
                    className="w-[68px] shrink-0 rounded-lg border border-border-muted px-2 py-1 text-right text-xs font-medium text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3"
                  >
                    Revoke
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notifications — 8-event × 3-channel matrix
// ---------------------------------------------------------------------------

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'in_app', label: 'In-app' },
  { key: 'push', label: 'Push' },
];

function NotificationsTab() {
  const [matrix, setMatrix] = useState<Matrix>(() => defaultMatrix());

  const enabledCount = useMemo(
    () =>
      Object.values(matrix).reduce(
        (acc, row) =>
          acc + (row.email ? 1 : 0) + (row.in_app ? 1 : 0) + (row.push ? 1 : 0),
        0,
      ),
    [matrix],
  );

  function toggle(event: string, ch: Channel) {
    setMatrix((prev) => ({
      ...prev,
      [event]: { ...prev[event]!, [ch]: !prev[event]![ch] },
    }));
  }

  return (
    <Section
      title="Notification channels"
      desc="Choose how each event reaches you. Push uses your device's native notifier."
      action={
        <span className="rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
          {enabledCount} channels on
        </span>
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[1fr_72px_72px_72px] items-center gap-2 border-b border-border-muted px-1 pb-2 text-xs uppercase tracking-wider text-text-dim">
            <span>Event</span>
            {CHANNELS.map((c) => (
              <span key={c.key} className="text-center">
                {c.label}
              </span>
            ))}
          </div>
          {EVENT_DEFS.map((e, i) => {
            const row = matrix[e.key]!;
            return (
              <motion.div
                key={e.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: 0.04 * i }}
                className="grid grid-cols-[1fr_72px_72px_72px] items-center gap-2 border-b border-border-muted/60 px-1 py-3 last:border-0"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-medium text-text">{e.label}</p>
                  <p className="truncate text-xs text-text-dim">{e.desc}</p>
                </div>
                {CHANNELS.map((c) => (
                  <div key={c.key} className="flex justify-center">
                    <Toggle
                      on={row[c.key]}
                      onClick={() => toggle(e.key, c.key)}
                      label={`${e.label} · ${c.label}`}
                    />
                  </div>
                ))}
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

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

// ---------------------------------------------------------------------------
// Tab: Appearance
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const { theme: liveTheme } = useThemeMode();
  const [theme, setTheme] = useState<ThemeKey>(() => readThemePref());
  // Seeded with the resolved initial preference so the mount sync is a no-op
  // (preserves a stored "system" choice). See ProSettings for the rationale.
  const appliedRef = useRef<ThemeMode>(resolveThemeMode(theme));

  // React to external toggles (the sidebar switch) — reflect them in the
  // selected swatch. Idempotent applyThemeMode means no feedback loop.
  useEffect(() => {
    if (liveTheme === appliedRef.current) return;
    appliedRef.current = liveTheme;
    setTheme((t) => (t === liveTheme ? t : liveTheme));
  }, [liveTheme]);

  // Apply + persist whenever the selection changes (this is what actually
  // switches the theme — previously these buttons only set local state).
  useEffect(() => {
    const resolved = resolveThemeMode(theme);
    appliedRef.current = resolved;
    applyThemeMode(resolved);
    persistThemePref(theme);
  }, [theme]);

  return (
    <Section
      title="Theme"
      desc="Choose how WarmPulse looks. System matches your OS preference."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => {
          const isCurrent = t.key === theme;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTheme(t.key)}
              className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-colors ${
                isCurrent
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-border-muted bg-surface-2 hover:border-border-muted/80'
              }`}
            >
              <span
                className="mb-3 block h-16 w-full rounded-lg border border-border-muted"
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
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg"
                  >
                    <Check className="h-3 w-3" />
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-dim">
        Appearance is a per-user preference and applies on every device you
        sign in from.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Tab: Data & privacy
// ---------------------------------------------------------------------------

function DataTab() {
  return (
    <>
      <Section
        title="Export & retention"
        desc="Download a copy of your workspace data."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">
              Export workspace data
            </p>
            <p className="text-xs text-text-dim">
              CSV of recent warmup logs · streamed from the server
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Download className="h-3.5 w-3.5" />}
          >
            Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">
              Log retention window
            </p>
            <p className="text-xs text-text-dim">
              Currently 90 days · controls how long warmup logs are kept
            </p>
          </div>
          <Button size="sm" variant="ghost">
            Change to 180 days
          </Button>
        </div>
      </Section>

      <Section
        title="Privacy requests"
        desc="Tools for GDPR / DPDP compliance."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">GDPR data request</p>
            <p className="text-xs text-text-dim">
              Erase a specific contact's data from all warmup activity
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className={`${INPUT_CLS} w-auto min-w-[200px]`}
              placeholder="contact@example.com"
            />
            <Button
              size="sm"
              variant="secondary"
              className="text-accent4 hover:bg-accent4/10"
            >
              Submit
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Danger zone"
        desc="Permanent destructive actions. Owner-only."
        danger
        action={
          <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-1 text-xs font-medium text-accent3">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cannot be undone
          </span>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent3/30 bg-accent3/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">Delete account</p>
            <p className="text-xs text-text-dim">
              Permanently delete this workspace and all data · 30-day grace
              period
            </p>
          </div>
          <Button
            size="sm"
            variant="danger"
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Delete account
          </Button>
        </div>
      </Section>
    </>
  );
}
