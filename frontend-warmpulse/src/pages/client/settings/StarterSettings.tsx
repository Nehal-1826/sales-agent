import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Crown,
  KeyRound,
  Loader2,
  Lock,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppSwitch } from '@/components/ui/AppSwitch';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { useAuthStore } from '@/stores/auth';
import {
  useChangePassword,
  useReplayTour,
  useUpdateNotifications,
  useUpdateProfile,
  useUserSettings,
} from '@/features/settings/api';
import { RegionFormatPanel } from '@/features/settings/RegionFormatPanel';
import { formatDate } from '@/lib/format';
import './starter-settings.css';

/**
 * /app/settings — STARTER tier (SE1 Card Hub).
 *
 * Layout:
 *   ┌─ 5-card grid ───────────────────────────────┐
 *   │ Profile (featured) │ Notifications │ Password │
 *   │ Tour replay        │ 2FA (Pro)     │          │
 *   ├─ Section panels (anchored, scroll target) ──┤
 *   │ # profile       editable form               │
 *   │ # notifications switches                    │
 *   │ # password      change-password form        │
 *   │ # tour          replay button               │
 *   └─────────────────────────────────────────────┘
 *
 * Clicking a card scrolls to its panel below. The locked card (2FA)
 * is Pro-only — clicking shows a toast hint and dims the action.
 *
 * Starter is intentionally single-user so we expose:
 *   ✓ Profile (display name + locale + timezone)
 *   ✓ Notifications (Slack webhook + alert toggles + email digest)
 *   ✓ Password (change inline)
 *   ✓ Tour replay (one-click)
 *   🔒 Two-factor auth — Pro+ feature
 */

type CardKey = 'profile' | 'notifications' | 'password' | 'tour' | '2fa';

interface CardDef {
  key: CardKey;
  Icon: typeof User;
  tone: 'violet' | 'cyan' | 'green' | 'yellow' | 'red';
  title: string;
  desc: string;
  featured?: boolean;
  locked?: boolean;
}

// Curated list of common IANA timezones. Covers the dominant business
// hubs across NA / EU / IN / APAC. If the user's stored timezone isn't
// in this list (e.g. legacy data, custom region) we append it at runtime
// in the ProfilePanel so the AppSelect can still display the saved value.
const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York (Eastern)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

const CARDS: CardDef[] = [
  {
    key: 'profile',
    Icon: User,
    tone: 'violet',
    title: 'Profile',
    desc: 'Display name, email, language and timezone.',
    featured: true,
  },
  {
    key: 'notifications',
    Icon: Bell,
    tone: 'cyan',
    title: 'Notifications',
    desc: 'Slack webhook, alert types and email digest.',
  },
  {
    key: 'password',
    Icon: KeyRound,
    tone: 'green',
    title: 'Password',
    desc: 'Rotate your account password.',
  },
  {
    key: 'tour',
    Icon: PlayCircle,
    tone: 'yellow',
    title: 'Tour replay',
    desc: 'Walk through the welcome tour again.',
  },
  {
    key: '2fa',
    Icon: ShieldCheck,
    tone: 'red',
    title: 'Two-factor auth',
    desc: 'Authenticator-app login (Pro upgrade required).',
    locked: true,
  },
];

export function StarterSettings() {
  const settings = useUserSettings();
  const user = useAuthStore((s) => s.user);

  // Refs to anchor scroll for each section.
  const refs = {
    profile: useRef<HTMLDivElement | null>(null),
    notifications: useRef<HTMLDivElement | null>(null),
    password: useRef<HTMLDivElement | null>(null),
    tour: useRef<HTMLDivElement | null>(null),
  };

  const handleCardClick = (card: CardDef) => {
    if (card.locked) {
      toast.info(`${card.title} is a Pro feature. Upgrade in Billing to unlock it.`);
      return;
    }
    const ref = refs[card.key as keyof typeof refs];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Briefly flash the panel to anchor the user's eye.
      ref.current.classList.add('se-panel--flash');
      window.setTimeout(() => {
        ref.current?.classList.remove('se-panel--flash');
      }, 1200);
    }
  };

  const profile = settings.data?.profile;
  const notifications = settings.data?.notifications;

  return (
    <div className="se">
      {/* ----- Header ----- */}
      <header className="se__head">
        <div>
          <span className="se__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Starter settings hub
          </span>
          <h1 className="se__title">Settings</h1>
          <p className="se__sub">
            Tune profile, notifications, password and the welcome tour. The Pro
            tool (2FA) is locked until you upgrade.
          </p>
        </div>
        <span className="se__owner">
          <User size={11} strokeWidth={2.4} />
          {user?.email ?? 'You'}
        </span>
      </header>

      {/* ----- 6-card hub ----- */}
      <div className="se-hub">
        {CARDS.map((card, idx) => (
          <CardTile key={card.key} card={card} idx={idx} onClick={() => handleCardClick(card)} />
        ))}
      </div>

      {/* ----- Section panels ----- */}
      <div ref={refs.profile} id="profile" className="se-panel">
        <ProfilePanel
          email={profile?.email ?? user?.email ?? ''}
          displayName={profile?.display_name ?? ''}
          timezone={profile?.timezone ?? ''}
          locale={profile?.locale ?? 'en-US'}
          loading={settings.isLoading}
        />
      </div>

      <div ref={refs.notifications} id="notifications" className="se-panel">
        <NotificationsPanel
          slackWebhook={notifications?.slack_webhook ?? null}
          emailDigest={notifications?.email_digest_enabled ?? true}
          alerts={notifications?.alerts ?? { warmth_drop: true, bounce_spike: true, dns_break: true }}
          loading={settings.isLoading}
        />
      </div>

      <div ref={refs.password} id="password" className="se-panel">
        <PasswordPanel />
      </div>

      <div ref={refs.tour} id="tour" className="se-panel">
        <TourPanel completedAt={settings.data?.tour.completed_at ?? null} />
      </div>

      <div id="region-format" className="se-panel">
        <RegionFormatPanel />
      </div>
    </div>
  );
}

/* ============================================================================
   Card tile
============================================================================ */
function CardTile({ card, idx, onClick }: { card: CardDef; idx: number; onClick: () => void }) {
  const Icon = card.Icon;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: idx * 0.04 }}
      className={`se-card se-card--${card.tone} ${card.featured ? 'se-card--featured' : ''} ${card.locked ? 'se-card--locked' : ''}`}
      aria-label={card.title}
    >
      <span className={`se-card__icon se-card__icon--${card.tone}`}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <div className="se-card__body">
        <span className="se-card__title">
          {card.title}
          {card.locked && (
            <span className="se-card__pro-pill">
              <Crown size={9} strokeWidth={2.6} />
              Pro
            </span>
          )}
        </span>
        <span className="se-card__desc">{card.desc}</span>
      </div>
      <span className={`se-card__arrow ${card.locked ? 'se-card__arrow--locked' : ''}`}>
        {card.locked ? <Lock size={12} strokeWidth={2.4} /> : <ArrowRight size={12} strokeWidth={2.4} />}
      </span>
    </motion.button>
  );
}

/* ============================================================================
   Profile panel
============================================================================ */
function ProfilePanel({
  email,
  displayName,
  timezone,
  locale,
  loading,
}: {
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  loading: boolean;
}) {
  const update = useUpdateProfile();
  const [name, setName] = useState(displayName);
  const [tz, setTz] = useState(timezone);
  const [loc, setLoc] = useState(locale);

  // Re-sync local state if the server-side value changes (e.g. user updated
  // from another device).
  const syncedRef = useRef<string | null>(null);
  if (syncedRef.current !== `${displayName}|${timezone}|${locale}` && !loading) {
    setName(displayName);
    setTz(timezone);
    setLoc(locale);
    syncedRef.current = `${displayName}|${timezone}|${locale}`;
  }

  const dirty = name !== displayName || tz !== timezone || loc !== locale;

  // If the saved tz isn't in the curated list, append it so AppSelect can
  // render the current value without dropping it from the trigger.
  const tzOptions = useMemo(() => {
    const known = new Set(TIMEZONE_OPTIONS.map((o) => o.value));
    if (tz && !known.has(tz)) {
      return [...TIMEZONE_OPTIONS, { value: tz, label: tz }];
    }
    return TIMEZONE_OPTIONS;
  }, [tz]);

  const handleSave = () => {
    update.mutate(
      { display_name: name, timezone: tz, locale: loc },
      {
        onSuccess: () => toast.success('Profile updated.'),
        onError: () => toast.error('Could not save profile.'),
      },
    );
  };

  return (
    <PanelShell
      Icon={User}
      tone="violet"
      title="Profile"
      sub="Identity that shows up on reports, invites and audit trails."
    >
      <div className="se-form">
        <div className="se-form__row">
          <label className="se-form__label">Display name</label>
          <Input
            value={name}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="se-form__row">
          <label className="se-form__label">Email</label>
          <Input value={email} disabled readOnly />
          <span className="se-form__hint">Email is the login identifier and can't be changed here.</span>
        </div>
        <div className="se-form__grid">
          <div className="se-form__row">
            <label className="se-form__label">Timezone</label>
            <AppSelect value={tz || ''} onValueChange={setTz} disabled={loading}>
              <AppSelectTrigger>
                <AppSelectValue placeholder="Select timezone" />
              </AppSelectTrigger>
              <AppSelectContent>
                {tzOptions.map((opt) => (
                  <AppSelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
          <div className="se-form__row">
            <label className="se-form__label">Locale</label>
            <AppSelect value={loc} onValueChange={setLoc}>
              <AppSelectTrigger>
                <AppSelectValue placeholder="en-US" />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="en-US">English (US)</AppSelectItem>
                <AppSelectItem value="en-GB">English (UK)</AppSelectItem>
                <AppSelectItem value="en-IN">English (India)</AppSelectItem>
                <AppSelectItem value="hi-IN">Hindi (India)</AppSelectItem>
                <AppSelectItem value="es-ES">Español</AppSelectItem>
                <AppSelectItem value="fr-FR">Français</AppSelectItem>
                <AppSelectItem value="de-DE">Deutsch</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>
      </div>
      {dirty && (
        <div className="se-form__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={update.isPending}
            leftIcon={update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
          >
            {update.isPending ? 'Saving…' : 'Save profile'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              setName(displayName);
              setTz(timezone);
              setLoc(locale);
            }}
          >
            Discard
          </Button>
        </div>
      )}
    </PanelShell>
  );
}

/* ============================================================================
   Notifications panel
============================================================================ */
function NotificationsPanel({
  slackWebhook,
  emailDigest,
  alerts,
  loading,
}: {
  slackWebhook: string | null;
  emailDigest: boolean;
  alerts: { warmth_drop: boolean; bounce_spike: boolean; dns_break: boolean };
  loading: boolean;
}) {
  const update = useUpdateNotifications();
  const [slack, setSlack] = useState(slackWebhook ?? '');
  const [digest, setDigest] = useState(emailDigest);
  const [a, setA] = useState(alerts);

  // Re-sync on server-side changes.
  const syncedRef = useRef<string | null>(null);
  const syncKey = `${slackWebhook ?? ''}|${emailDigest}|${alerts.warmth_drop}|${alerts.bounce_spike}|${alerts.dns_break}`;
  if (syncedRef.current !== syncKey && !loading) {
    setSlack(slackWebhook ?? '');
    setDigest(emailDigest);
    setA(alerts);
    syncedRef.current = syncKey;
  }

  const dirty =
    slack !== (slackWebhook ?? '') ||
    digest !== emailDigest ||
    a.warmth_drop !== alerts.warmth_drop ||
    a.bounce_spike !== alerts.bounce_spike ||
    a.dns_break !== alerts.dns_break;

  const handleSave = () => {
    update.mutate(
      {
        slack_webhook: slack.trim() === '' ? null : slack.trim(),
        email_digest_enabled: digest,
        alerts: a,
      },
      {
        onSuccess: () => toast.success('Notification preferences saved.'),
        onError: () => toast.error('Could not save notifications.'),
      },
    );
  };

  return (
    <PanelShell
      Icon={Bell}
      tone="cyan"
      title="Notifications"
      sub="Where we ping you when sender trust, failed deliveries or domain records (DNS) need attention."
    >
      <div className="se-form">
        <div className="se-form__row">
          <label className="se-form__label">Slack webhook</label>
          <Input
            value={slack}
            placeholder="https://hooks.slack.com/services/…"
            onChange={(e) => setSlack(e.target.value)}
            disabled={loading}
          />
          <span className="se-form__hint">
            Optional. Leave blank to disable Slack alerts.
          </span>
        </div>

        <ToggleRow
          title="Email digest"
          desc="Weekly summary of warmth, sends and opens & replies."
          value={digest}
          onChange={setDigest}
          disabled={loading}
        />
        <ToggleRow
          title="Warmth drop alert"
          desc="Notify me when the warmth score drops more than 10 points."
          value={a.warmth_drop}
          onChange={(v) => setA((p) => ({ ...p, warmth_drop: v }))}
          disabled={loading}
        />
        <ToggleRow
          title="Failed delivery spike alert"
          desc="Notify me when failure rate crosses the ESP-safe band."
          value={a.bounce_spike}
          onChange={(v) => setA((p) => ({ ...p, bounce_spike: v }))}
          disabled={loading}
        />
        <ToggleRow
          title="Domain records (DNS) break alert"
          desc="Notify me when SPF/DKIM/DMARC stops validating."
          value={a.dns_break}
          onChange={(v) => setA((p) => ({ ...p, dns_break: v }))}
          disabled={loading}
        />
      </div>
      {dirty && (
        <div className="se-form__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={update.isPending}
            leftIcon={update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
          >
            {update.isPending ? 'Saving…' : 'Save preferences'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              setSlack(slackWebhook ?? '');
              setDigest(emailDigest);
              setA(alerts);
            }}
          >
            Discard
          </Button>
        </div>
      )}
    </PanelShell>
  );
}

function ToggleRow({
  title,
  desc,
  value,
  onChange,
  disabled,
}: {
  title: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="se-toggle">
      <div className="se-toggle__text">
        <span className="se-toggle__title">{title}</span>
        <span className="se-toggle__desc">{desc}</span>
      </div>
      <AppSwitch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ============================================================================
   Password panel
============================================================================ */
function PasswordPanel() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showAll, setShowAll] = useState(false);

  const validNext = next.length >= 12;
  const matches = next === confirm;
  const ready = current.length > 0 && validNext && matches;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          toast.success('Password updated.');
          setCurrent('');
          setNext('');
          setConfirm('');
        },
        onError: () => toast.error('Could not change password — check your current one.'),
      },
    );
  };

  return (
    <PanelShell
      Icon={KeyRound}
      tone="green"
      title="Password"
      sub="Rotate your account password. Use 12+ characters with a mix of letters, numbers and symbols."
    >
      <form className="se-form" onSubmit={handleSubmit}>
        <div className="se-form__row">
          <label className="se-form__label">Current password</label>
          <Input
            type={showAll ? 'text' : 'password'}
            value={current}
            placeholder="Enter your current password"
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="se-form__grid">
          <div className="se-form__row">
            <label className="se-form__label">New password</label>
            <Input
              type={showAll ? 'text' : 'password'}
              value={next}
              placeholder="At least 12 characters"
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            {!validNext && next.length > 0 && (
              <span className="se-form__hint se-form__hint--err">
                Must be 12+ characters.
              </span>
            )}
          </div>
          <div className="se-form__row">
            <label className="se-form__label">Confirm new password</label>
            <Input
              type={showAll ? 'text' : 'password'}
              value={confirm}
              placeholder="Re-enter to confirm"
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {!matches && confirm.length > 0 && (
              <span className="se-form__hint se-form__hint--err">
                Doesn't match.
              </span>
            )}
          </div>
        </div>
        <ToggleRow
          title="Show characters"
          desc="Temporarily reveal what you're typing."
          value={showAll}
          onChange={setShowAll}
        />
        <div className="se-form__actions">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!ready || change.isPending}
            leftIcon={change.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
          >
            {change.isPending ? 'Updating…' : 'Change password'}
          </Button>
        </div>
      </form>
    </PanelShell>
  );
}

/* ============================================================================
   Tour panel
============================================================================ */
function TourPanel({ completedAt }: { completedAt: string | null }) {
  const replay = useReplayTour();
  const done = useMemo(() => {
    if (!completedAt) return null;
    const d = new Date(completedAt);
    if (Number.isNaN(d.getTime())) return null;
    return formatDate(d);
  }, [completedAt]);

  const handleReplay = () => {
    replay.mutate(undefined, {
      onSuccess: () => toast.success('Tour will replay on your next dashboard visit.'),
      onError: () => toast.error('Could not reset tour.'),
    });
  };

  return (
    <PanelShell
      Icon={PlayCircle}
      tone="yellow"
      title="Tour replay"
      sub="Walk through the welcome tour again. Useful after onboarding tweaks or for new team members later."
    >
      <div className="se-tour">
        <div className="se-tour__status">
          <span className="se-tour__label">Welcome tour</span>
          <span className={`se-tour__pill ${done ? 'se-tour__pill--done' : 'se-tour__pill--pending'}`}>
            {done ? `Completed ${done}` : 'Not completed yet'}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReplay}
          disabled={replay.isPending}
          leftIcon={replay.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
        >
          {replay.isPending ? 'Resetting…' : done ? 'Replay tour' : 'Start tour now'}
        </Button>
      </div>
    </PanelShell>
  );
}

/* ============================================================================
   Panel shell — shared title + chrome
============================================================================ */
function PanelShell({
  Icon,
  tone,
  title,
  sub,
  children,
}: {
  Icon: typeof User;
  tone: 'violet' | 'cyan' | 'green' | 'yellow';
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`se-panel-card se-panel-card--${tone}`}>
      <header className="se-panel-card__head">
        <span className={`se-panel-card__icon se-panel-card__icon--${tone}`}>
          <Icon size={14} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="se-panel-card__title">{title}</h2>
          <p className="se-panel-card__sub">{sub}</p>
        </div>
        <span className="se-panel-card__chev">
          <ChevronDown size={13} strokeWidth={2.4} />
        </span>
      </header>
      <div className="se-panel-card__body">{children}</div>
    </section>
  );
}

export default StarterSettings;
