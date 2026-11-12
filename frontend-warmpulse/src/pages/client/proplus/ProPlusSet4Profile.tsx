import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AtSign,
  Bell,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Database,
  Download,
  Eye,
  Fingerprint,
  Globe2,
  KeyRound,
  Languages,
  Link2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  Phone,
  Plus,
  Rows3,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserCircle2,
  Webhook,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/**
 * ProPlusSet4Profile — Pro Plus "Settings" rendered as a **Profile Center /
 * Account at a Glance** dashboard.
 *
 * The page is built around a single oversized *user identity card* at the top,
 * flanked by an animated identity-strength gauge, and a 2-column grid of six
 * *sub-area tiles* (Security health, Notification preferences, Connected
 * accounts, Data & privacy, Recovery & contact, Appearance). Each tile shows
 * a current-state snapshot + a CTA chip and expands *inline* (AnimatePresence
 * height) to reveal a controlled mini-pane. Only one tile is expanded at a
 * time.
 *
 * Real state — the identity-strength score (0-100) is genuinely recomputed by
 * a reduce() over six derived signals (2FA enabled, password age, no other
 * sessions, recovery email set, recovery phone set, backup codes available),
 * so toggling any contributing control inside an expanded tile visibly bumps
 * the gauge and triggers a brief pulse.
 *
 * Distinctness — what this is NOT:
 *   - NOT ProSettings (S4 horizontal-tab page wired to backend hooks).
 *   - NOT StarterSettings (SE1 6-card grid that scrolls to anchored panels).
 *   - NOT AgencySettings (thin wrapper around SettingsTabs).
 *   - NOT ProPlusSettings (left tab-rail + animated pane).
 *   - NOT SettingsTabs (shared tabs core).
 *   - NOT sibling Set1 long-form doc + TOC.
 *   - NOT sibling Set2 setup wizard.
 *   - NOT sibling Set3 search/spotlight.
 *   - NOT ProPlusWks3Hub — that is a *workspace* identity hub with capacity
 *     bars + activity stream. This is a *user account* identity dashboard
 *     with a personal identity-strength score and sub-area tiles.
 *
 * Defining gestures:
 *   - Hero profile card dominates the top band with avatar (upload affordance
 *     + camera overlay on hover), name, email, role + plan + member-since
 *     badges, and a circular identity-strength gauge whose stroke sweeps in.
 *   - Six tiles in a 2×3 grid. Click a tile → it expands inline with a
 *     mini-pane of toggles / fields / pills; the tile's preview compresses.
 *   - Identity score updates in real time — enabling 2FA bumps the score,
 *     adding a recovery phone bumps it more. Score count-up animates.
 *   - Score pulse on every strengthening action (ring flashes once).
 *
 * Fully standalone — prop-less, inline MOCK, no network / router / query
 * hooks. The preview harness supplies the shell + sidebar; this component
 * renders page content only.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface MockUser {
  displayName: string;
  email: string;
  role: string;
  planSince: string;
  initials: string;
}

interface MockNotifPrefs {
  email: boolean;
  slack: boolean;
  webhookCount: number;
}

interface MockConnection {
  id: string;
  provider: string;
  account: string;
  Icon: LucideIcon;
  connectedAt: string;
  primary: boolean;
}

const MOCK_USER: MockUser = {
  displayName: 'Aanya Kapoor',
  email: 'aanya@acme.io',
  role: 'Workspace Owner',
  planSince: 'Member since Mar 2024',
  initials: 'AK',
};

const MOCK_CONNECTIONS: MockConnection[] = [
  {
    id: 'c1',
    provider: 'Google Workspace',
    account: 'aanya@acme.io',
    Icon: Mail,
    connectedAt: 'Connected · 14 months ago',
    primary: true,
  },
  {
    id: 'c2',
    provider: 'Microsoft 365',
    account: 'aanya.k@acme.onmicrosoft.com',
    Icon: AtSign,
    connectedAt: 'Connected · 4 months ago',
    primary: false,
  },
  {
    id: 'c3',
    provider: 'Slack',
    account: 'acme.slack.com / @aanya',
    Icon: MessageSquare,
    connectedAt: 'Connected · 9 days ago',
    primary: false,
  },
];

const RETENTION_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days (default)' },
  { days: 180, label: '180 days' },
  { days: 365, label: '365 days' },
];

const THEME_OPTIONS: Array<{ key: 'light' | 'dark' | 'system'; label: string; Icon: LucideIcon }> = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Monitor },
];

const DENSITY_OPTIONS: Array<{ key: 'cosy' | 'compact'; label: string }> = [
  { key: 'cosy', label: 'Cosy' },
  { key: 'compact', label: 'Compact' },
];

const LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'हिन्दी (India)' },
  { code: 'fr-FR', label: 'Français (France)' },
];

// ---------------------------------------------------------------------------
// Score model
// ---------------------------------------------------------------------------

interface ScoreState {
  twoFa: boolean;
  passwordFreshDays: number; // days since password change; <180 = good
  otherSessions: number; // count of non-current sessions; 0 = good
  recoveryEmail: string;
  recoveryPhone: string;
  backupCodes: number; // available unused codes
}

interface ScoreSignal {
  key: string;
  label: string;
  weight: number;
  pass: boolean;
}

function deriveSignals(s: ScoreState): ScoreSignal[] {
  return [
    {
      key: 'twoFa',
      label: 'Two-factor authentication enabled',
      weight: 28,
      pass: s.twoFa,
    },
    {
      key: 'passwordFresh',
      label: 'Password rotated within 180 days',
      weight: 14,
      pass: s.passwordFreshDays > 0 && s.passwordFreshDays < 180,
    },
    {
      key: 'sessionsClean',
      label: 'No stale device sessions',
      weight: 12,
      pass: s.otherSessions === 0,
    },
    {
      key: 'recoveryEmail',
      label: 'Recovery email set',
      weight: 14,
      pass: s.recoveryEmail.includes('@'),
    },
    {
      key: 'recoveryPhone',
      label: 'Recovery phone set',
      weight: 12,
      pass: s.recoveryPhone.replace(/\D/g, '').length >= 7,
    },
    {
      key: 'backupCodes',
      label: 'Backup codes available',
      weight: 20,
      pass: s.backupCodes >= 5,
    },
  ];
}

function scoreFrom(state: ScoreState): number {
  return deriveSignals(state).reduce(
    (acc, sig) => acc + (sig.pass ? sig.weight : 0),
    0,
  );
}

function tierFor(score: number): {
  label: string;
  tone: 'accent' | 'accent4' | 'accent3';
  ring: string;
  fill: string;
  text: string;
  chip: string;
} {
  if (score >= 80) {
    return {
      label: 'Strong',
      tone: 'accent',
      ring: 'stroke-accent',
      fill: 'bg-accent',
      text: 'text-accent',
      chip: 'border-accent/30 bg-accent/10 text-accent',
    };
  }
  if (score >= 55) {
    return {
      label: 'Fair',
      tone: 'accent4',
      ring: 'stroke-accent4',
      fill: 'bg-accent4',
      text: 'text-accent4',
      chip: 'border-accent4/30 bg-accent4/10 text-accent4',
    };
  }
  return {
    label: 'Weak',
    tone: 'accent3',
    ring: 'stroke-accent3',
    fill: 'bg-accent3',
    text: 'text-accent3',
    chip: 'border-accent3/30 bg-accent3/10 text-accent3',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TileKey =
  | 'security'
  | 'notifications'
  | 'connections'
  | 'data'
  | 'recovery'
  | 'appearance';

export function ProPlusSet4Profile(): JSX.Element {
  // Identity / score state — every contributing toggle below pipes into one
  // of these, so the gauge genuinely recomputes on change.
  const [twoFa, setTwoFa] = useState(true);
  const [passwordFreshDays, setPasswordFreshDays] = useState(42);
  const [otherSessions, setOtherSessions] = useState(2);
  const [recoveryEmail, setRecoveryEmail] = useState('aanya.kapoor@gmail.com');
  const [recoveryPhone, setRecoveryPhone] = useState('+91 9XXXX 4521');
  const [backupCodes, setBackupCodes] = useState(8);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<MockNotifPrefs>({
    email: true,
    slack: false,
    webhookCount: 2,
  });

  // Connected accounts (mutable for the "revoke" affordance)
  const [connections, setConnections] = useState<MockConnection[]>(MOCK_CONNECTIONS);

  // Data & privacy
  const [retention, setRetention] = useState(90);
  const [exportRequested, setExportRequested] = useState(false);

  // Appearance
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [density, setDensity] = useState<'cosy' | 'compact'>('cosy');
  const [language, setLanguage] = useState('en-US');

  // Avatar
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Expanded tile
  const [openTile, setOpenTile] = useState<TileKey | null>('security');

  // ------------------------------------------------------------------------
  // Derived score
  // ------------------------------------------------------------------------

  const scoreState: ScoreState = useMemo(
    () => ({
      twoFa,
      passwordFreshDays,
      otherSessions,
      recoveryEmail,
      recoveryPhone,
      backupCodes,
    }),
    [twoFa, passwordFreshDays, otherSessions, recoveryEmail, recoveryPhone, backupCodes],
  );

  const score = useMemo(() => scoreFrom(scoreState), [scoreState]);
  const tier = useMemo(() => tierFor(score), [score]);
  const signals = useMemo(() => deriveSignals(scoreState), [scoreState]);
  const failingCount = signals.filter((s) => !s.pass).length;

  // ------------------------------------------------------------------------
  // Score animations: count-up + ring sweep + pulse on strengthening change
  // ------------------------------------------------------------------------

  const [displayScore, setDisplayScore] = useState(score);
  const [pulse, setPulse] = useState(0);
  const prevScoreRef = useRef(score);

  useEffect(() => {
    // Count-up animation by walking displayScore towards `score`.
    if (displayScore === score) return;
    const id = window.setTimeout(() => {
      setDisplayScore((d) => {
        if (d < score) return Math.min(score, d + 2);
        if (d > score) return Math.max(score, d - 2);
        return d;
      });
    }, 16);
    return () => window.clearTimeout(id);
  }, [displayScore, score]);

  useEffect(() => {
    // Fire a pulse when the score moves up (i.e. user strengthened account).
    if (score > prevScoreRef.current) {
      setPulse((p) => p + 1);
    }
    prevScoreRef.current = score;
  }, [score]);

  // ------------------------------------------------------------------------
  // Avatar upload
  // ------------------------------------------------------------------------

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatar(URL.createObjectURL(file));
  }

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Page header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Profile center
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Your account at a glance — identity, security and the controls that
            keep it healthy.
          </p>
        </div>
      </motion.header>

      {/* Hero profile card */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut', delay: 0.05 }}
        className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface"
        style={{ minHeight: 232 }}
      >
        {/* Soft tinted backdrop band, tied to the current score tier */}
        <span
          aria-hidden
          className={`absolute inset-x-0 top-0 h-28 ${
            score >= 80
              ? 'bg-gradient-to-b from-accent/15 to-transparent'
              : score >= 55
              ? 'bg-gradient-to-b from-accent4/15 to-transparent'
              : 'bg-gradient-to-b from-accent3/15 to-transparent'
          }`}
        />

        <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-7">
          {/* Identity block */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Avatar with hover camera affordance */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group/avatar relative block h-24 w-24 overflow-hidden rounded-2xl border border-border-muted bg-surface-2"
                aria-label="Change profile picture"
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt="Your profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-full w-full items-center justify-center bg-accent/15 text-3xl font-semibold text-accent"
                  >
                    {MOCK_USER.initials}
                  </span>
                )}
                <motion.span
                  initial={false}
                  whileHover={{ opacity: 1 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-bg opacity-0 transition-opacity group-hover/avatar:opacity-100"
                >
                  <Camera className="h-5 w-5 text-white" />
                </motion.span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickAvatar}
              />
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border-muted bg-surface text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3"
                  aria-label="Remove profile picture"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Name + meta */}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-text">
                  {MOCK_USER.displayName}
                </h2>
                <Badge variant="orange">
                  <Sparkles className="h-3 w-3" />
                  Pro Plus
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-dim">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {MOCK_USER.email}
                </span>
                <span aria-hidden className="h-1 w-1 rounded-full bg-border-muted" />
                <span className="flex items-center gap-1.5">
                  <UserCircle2 className="h-3.5 w-3.5" />
                  {MOCK_USER.role}
                </span>
                <span aria-hidden className="h-1 w-1 rounded-full bg-border-muted" />
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {MOCK_USER.planSince}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tier.chip}`}
                >
                  <Fingerprint className="h-3 w-3" />
                  Identity {tier.label.toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-xs text-text-dim">
                  {failingCount === 0
                    ? 'All signals passing'
                    : `${failingCount} signal${failingCount === 1 ? '' : 's'} to harden`}
                </span>
              </div>
            </div>
          </div>

          {/* Identity-strength gauge */}
          <ScoreGauge
            score={displayScore}
            target={score}
            tier={tier}
            pulse={pulse}
          />
        </div>
      </motion.section>

      {/* Tile dashboard */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tile
          tileKey="security"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.1}
          Icon={ShieldCheck}
          title="Security health"
          summary={`${twoFa ? '2FA on' : '2FA off'} · pw ${passwordFreshDays}d · ${otherSessions} other session${otherSessions === 1 ? '' : 's'}`}
          chip={{
            label: tier.label,
            cls: tier.chip,
          }}
        >
          <SecurityPane
            twoFa={twoFa}
            setTwoFa={setTwoFa}
            passwordFreshDays={passwordFreshDays}
            setPasswordFreshDays={setPasswordFreshDays}
            otherSessions={otherSessions}
            setOtherSessions={setOtherSessions}
          />
        </Tile>

        <Tile
          tileKey="notifications"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.14}
          Icon={Bell}
          title="Notification preferences"
          summary={`Email ${notifPrefs.email ? 'Y' : 'N'} · Slack ${notifPrefs.slack ? 'Y' : 'N'} · ${notifPrefs.webhookCount} webhook${notifPrefs.webhookCount === 1 ? '' : 's'}`}
          chip={{
            label: notifPrefs.email || notifPrefs.slack || notifPrefs.webhookCount > 0 ? 'Active' : 'Silent',
            cls:
              notifPrefs.email || notifPrefs.slack || notifPrefs.webhookCount > 0
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-border-muted bg-surface-2 text-text-dim',
          }}
        >
          <NotificationsPane prefs={notifPrefs} setPrefs={setNotifPrefs} />
        </Tile>

        <Tile
          tileKey="connections"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.18}
          Icon={Link2}
          title="Connected accounts"
          summary={`${connections.length} provider${connections.length === 1 ? '' : 's'} linked · ${connections.filter((c) => c.primary).length} primary`}
          chip={{
            label: `${connections.length} linked`,
            cls: 'border-border-muted bg-surface-2 text-text-dim',
          }}
        >
          <ConnectionsPane connections={connections} setConnections={setConnections} />
        </Tile>

        <Tile
          tileKey="data"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.22}
          Icon={Database}
          title="Data & privacy"
          summary={`Retention ${retention}d · export ${exportRequested ? 'requested' : 'idle'}`}
          chip={{
            label: `${retention}d`,
            cls: 'border-border-muted bg-surface-2 text-text-dim',
          }}
        >
          <DataPane
            retention={retention}
            setRetention={setRetention}
            exportRequested={exportRequested}
            setExportRequested={setExportRequested}
          />
        </Tile>

        <Tile
          tileKey="recovery"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.26}
          Icon={KeyRound}
          title="Recovery & contact"
          summary={`${recoveryEmail ? 'Email set' : 'No email'} · ${recoveryPhone ? 'Phone set' : 'No phone'} · ${backupCodes} code${backupCodes === 1 ? '' : 's'}`}
          chip={{
            label: backupCodes >= 5 ? 'Ready' : 'Low',
            cls:
              backupCodes >= 5
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-accent3/30 bg-accent3/10 text-accent3',
          }}
        >
          <RecoveryPane
            recoveryEmail={recoveryEmail}
            setRecoveryEmail={setRecoveryEmail}
            recoveryPhone={recoveryPhone}
            setRecoveryPhone={setRecoveryPhone}
            backupCodes={backupCodes}
            setBackupCodes={setBackupCodes}
          />
        </Tile>

        <Tile
          tileKey="appearance"
          openTile={openTile}
          setOpenTile={setOpenTile}
          delay={0.3}
          Icon={Palette}
          title="Appearance"
          summary={`${capitalize(theme)} · ${capitalize(density)} · ${language}`}
          chip={{
            label: capitalize(theme),
            cls: 'border-border-muted bg-surface-2 text-text-dim',
          }}
        >
          <AppearancePane
            theme={theme}
            setTheme={setTheme}
            density={density}
            setDensity={setDensity}
            language={language}
            setLanguage={setLanguage}
          />
        </Tile>
      </div>
    </div>
  );
}

export default ProPlusSet4Profile;

// ---------------------------------------------------------------------------
// Score gauge
// ---------------------------------------------------------------------------

function ScoreGauge({
  score,
  target,
  tier,
  pulse,
}: {
  score: number;
  target: number;
  tier: ReturnType<typeof tierFor>;
  pulse: number;
}) {
  const RADIUS = 54;
  const CIRC = 2 * Math.PI * RADIUS;
  const offset = CIRC * (1 - target / 100);

  return (
    <div className="relative flex shrink-0 items-center gap-4 lg:flex-col lg:items-center">
      <div className="relative h-32 w-32">
        {/* Pulse ring (re-mounts on every pulse++ via key) */}
        <AnimatePresence>
          <motion.span
            key={pulse}
            aria-hidden
            initial={{ opacity: 0.55, scale: 0.85 }}
            animate={{ opacity: 0, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className={`pointer-events-none absolute inset-0 rounded-full ${tier.ring.replace(
              'stroke-',
              'bg-',
            )}/15`}
          />
        </AnimatePresence>

        <svg
          viewBox="0 0 128 128"
          className="absolute inset-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            className="fill-none stroke-border-muted/40"
            strokeWidth="9"
          />
          <motion.circle
            cx="64"
            cy="64"
            r={RADIUS}
            className={`fill-none ${tier.ring}`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={{ strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-semibold tabular-nums ${tier.text}`}>
            {score}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-text-dim">
            of 100
          </span>
        </div>
      </div>

      <div className="lg:text-center">
        <p className="text-xs uppercase tracking-wider text-text-dim">
          Identity strength
        </p>
        <p className={`text-sm font-semibold ${tier.text}`}>{tier.label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile shell — preview + expand-inline pane
// ---------------------------------------------------------------------------

function Tile({
  tileKey,
  openTile,
  setOpenTile,
  delay,
  Icon,
  title,
  summary,
  chip,
  children,
}: {
  tileKey: TileKey;
  openTile: TileKey | null;
  setOpenTile: (k: TileKey | null) => void;
  delay: number;
  Icon: LucideIcon;
  title: string;
  summary: string;
  chip: { label: string; cls: string };
  children: React.ReactNode;
}) {
  const open = openTile === tileKey;
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      layout
      className={`overflow-hidden rounded-xl border bg-surface transition-colors ${
        open ? 'border-accent/40' : 'border-border-muted'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpenTile(open ? null : tileKey)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            open ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-text-dim'
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{title}</p>
          <p className="truncate text-xs text-text-dim">{summary}</p>
        </div>
        <span
          className={`hidden shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${chip.cls}`}
        >
          {chip.label}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-muted bg-surface-2 text-text-dim"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="pane"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="overflow-hidden border-t border-border-muted"
          >
            <div className="space-y-3 p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Pane: Security
// ---------------------------------------------------------------------------

function SecurityPane({
  twoFa,
  setTwoFa,
  passwordFreshDays,
  setPasswordFreshDays,
  otherSessions,
  setOtherSessions,
}: {
  twoFa: boolean;
  setTwoFa: (v: boolean) => void;
  passwordFreshDays: number;
  setPasswordFreshDays: (v: number) => void;
  otherSessions: number;
  setOtherSessions: (v: number) => void;
}) {
  return (
    <>
      <RowToggle
        Icon={Lock}
        label="Two-factor authentication"
        sub={twoFa ? 'TOTP enrolled · required on sign-in' : 'Not enrolled · strongly recommended'}
        on={twoFa}
        onChange={setTwoFa}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Password age</p>
          <p className="text-xs text-text-dim">
            Last changed {passwordFreshDays} day{passwordFreshDays === 1 ? '' : 's'} ago
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPasswordFreshDays(0)}
          leftIcon={<KeyRound className="h-3.5 w-3.5" />}
        >
          Rotate password
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Active sessions</p>
          <p className="text-xs text-text-dim">
            1 current · {otherSessions} other device{otherSessions === 1 ? '' : 's'}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={otherSessions === 0}
          leftIcon={<LogOut className="h-3.5 w-3.5" />}
          onClick={() => setOtherSessions(0)}
          className="text-accent3 hover:bg-accent3/10"
        >
          Sign out others
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane: Notifications
// ---------------------------------------------------------------------------

function NotificationsPane({
  prefs,
  setPrefs,
}: {
  prefs: MockNotifPrefs;
  setPrefs: (p: MockNotifPrefs) => void;
}) {
  return (
    <>
      <RowToggle
        Icon={Mail}
        label="Email notifications"
        sub="Alerts, weekly digest, and billing receipts"
        on={prefs.email}
        onChange={(v) => setPrefs({ ...prefs, email: v })}
      />
      <RowToggle
        Icon={MessageSquare}
        label="Slack notifications"
        sub="Posts to your workspace Slack channel"
        on={prefs.slack}
        onChange={(v) => setPrefs({ ...prefs, slack: v })}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Webhooks</p>
          <p className="text-xs text-text-dim">
            {prefs.webhookCount} active endpoint{prefs.webhookCount === 1 ? '' : 's'} configured
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={prefs.webhookCount === 0}
            onClick={() =>
              setPrefs({ ...prefs, webhookCount: Math.max(0, prefs.webhookCount - 1) })
            }
            leftIcon={<X className="h-3.5 w-3.5" />}
          >
            Remove
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setPrefs({ ...prefs, webhookCount: prefs.webhookCount + 1 })
            }
            leftIcon={<Webhook className="h-3.5 w-3.5" />}
          >
            Add endpoint
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane: Connections
// ---------------------------------------------------------------------------

function ConnectionsPane({
  connections,
  setConnections,
}: {
  connections: MockConnection[];
  setConnections: (cs: MockConnection[]) => void;
}) {
  return (
    <>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {connections.map((c) => (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface text-text-dim">
                <c.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {c.provider}
                  {c.primary && (
                    <span className="ml-2 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      Primary
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-text-dim">{c.account}</p>
              </div>
              <span className="hidden shrink-0 text-xs text-text-dim sm:block">
                {c.connectedAt}
              </span>
              <button
                type="button"
                onClick={() => setConnections(connections.filter((x) => x.id !== c.id))}
                className="shrink-0 rounded-md border border-border-muted px-2 py-1 text-xs font-medium text-text-dim transition-colors hover:border-accent3/40 hover:text-accent3"
                aria-label={`Disconnect ${c.provider}`}
              >
                Disconnect
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <Button
        size="sm"
        variant="ghost"
        leftIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() =>
          setConnections([
            ...connections,
            {
              id: `c-new-${connections.length + 1}`,
              provider: 'New connection',
              account: 'pending@example.com',
              Icon: Link2,
              connectedAt: 'Just now',
              primary: false,
            },
          ])
        }
      >
        Link another account
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane: Data & privacy
// ---------------------------------------------------------------------------

function DataPane({
  retention,
  setRetention,
  exportRequested,
  setExportRequested,
}: {
  retention: number;
  setRetention: (n: number) => void;
  exportRequested: boolean;
  setExportRequested: (b: boolean) => void;
}) {
  return (
    <>
      <div className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <p className="text-sm font-medium text-text">Log retention window</p>
        <p className="mb-2 text-xs text-text-dim">
          Controls how long warmup logs are kept before pruning.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RETENTION_OPTIONS.map((opt) => {
            const active = opt.days === retention;
            return (
              <button
                key={opt.days}
                type="button"
                onClick={() => setRetention(opt.days)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-muted bg-surface text-text-dim hover:text-text'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Export workspace data</p>
          <p className="text-xs text-text-dim">
            {exportRequested
              ? 'Export queued · you will receive a download link by email'
              : 'CSV of recent warmup logs · streamed from the server'}
          </p>
        </div>
        <Button
          size="sm"
          variant={exportRequested ? 'ghost' : 'secondary'}
          leftIcon={
            exportRequested ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )
          }
          onClick={() => setExportRequested(!exportRequested)}
        >
          {exportRequested ? 'Cancel request' : 'Request export'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent3/30 bg-accent3/5 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">GDPR / DPDP request</p>
          <p className="text-xs text-text-dim">
            Erase a specific contact's data across warmup activity.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
          className="text-accent3 hover:bg-accent3/10"
        >
          Open form
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane: Recovery & contact
// ---------------------------------------------------------------------------

function RecoveryPane({
  recoveryEmail,
  setRecoveryEmail,
  recoveryPhone,
  setRecoveryPhone,
  backupCodes,
  setBackupCodes,
}: {
  recoveryEmail: string;
  setRecoveryEmail: (v: string) => void;
  recoveryPhone: string;
  setRecoveryPhone: (v: string) => void;
  backupCodes: number;
  setBackupCodes: (n: number) => void;
}) {
  return (
    <>
      <Field Icon={Mail} label="Recovery email">
        <input
          className={INPUT_CLS}
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          placeholder="you@personal.com"
          inputMode="email"
        />
      </Field>
      <Field Icon={Phone} label="Recovery phone">
        <input
          className={INPUT_CLS}
          value={recoveryPhone}
          onChange={(e) => setRecoveryPhone(e.target.value)}
          placeholder="+91 9XXXX XXXX"
          inputMode="tel"
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Backup codes</p>
          <p className="text-xs text-text-dim">
            {backupCodes} unused code{backupCodes === 1 ? '' : 's'} of 10 ·{' '}
            {backupCodes >= 5 ? 'healthy reserve' : 'regenerate recommended'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={backupCodes === 0}
            onClick={() => setBackupCodes(Math.max(0, backupCodes - 1))}
            leftIcon={<Eye className="h-3.5 w-3.5" />}
          >
            Mark used
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setBackupCodes(10)}
            leftIcon={<KeyRound className="h-3.5 w-3.5" />}
          >
            Regenerate
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pane: Appearance
// ---------------------------------------------------------------------------

function AppearancePane({
  theme,
  setTheme,
  density,
  setDensity,
  language,
  setLanguage,
}: {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  density: 'cosy' | 'compact';
  setDensity: (d: 'cosy' | 'compact') => void;
  language: string;
  setLanguage: (l: string) => void;
}) {
  return (
    <>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-text-dim">
          Theme
        </p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((t) => {
            const active = t.key === theme;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t.key)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
                }`}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-text-dim">
          Density
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DENSITY_OPTIONS.map((d) => {
            const active = d.key === density;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDensity(d.key)}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
                }`}
              >
                <Rows3 className="h-4 w-4" />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <Field Icon={Languages} label="Language">
        <select
          className={INPUT_CLS}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <option key={l.code} value={l.code} className="bg-surface text-text">
              {l.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="flex items-center gap-1.5 text-xs text-text-dim">
        <Globe2 className="h-3.5 w-3.5" />
        Appearance applies on every device you sign in from.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

const INPUT_CLS =
  'w-full rounded-md border border-border-muted bg-surface-2 px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-accent/50';

function RowToggle({
  Icon,
  label,
  sub,
  on,
  onChange,
}: {
  Icon: LucideIcon;
  label: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center gap-3 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent/30"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          on ? 'bg-accent/15 text-accent' : 'bg-surface text-text-dim'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{label}</p>
        <p className="truncate text-xs text-text-dim">{sub}</p>
      </div>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-accent' : 'bg-surface border border-border-muted'
        }`}
      >
        <motion.span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-bg shadow-sm"
          animate={{ left: on ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

function Field({
  Icon,
  label,
  children,
}: {
  Icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      {children}
    </label>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
