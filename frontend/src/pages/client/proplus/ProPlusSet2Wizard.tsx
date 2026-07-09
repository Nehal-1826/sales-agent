import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Database,
  Download,
  Eye,
  Globe2,
  Lock,
  Mail,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Shield,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * ProPlusSet2Wizard — "Pro Plus" Settings as a guided multi-step walkthrough.
 *
 * Distinct from sibling Settings designs:
 *   • ProSettings / ProPlusSettings use a tab strip / tab-rail (random access).
 *   • This is a sequential WIZARD with Next/Back, an overall % gauge, and a
 *     per-step verdict header ("Looking good · 3 of 4 checks pass" /
 *     "Action needed · 2FA not enabled"). Re-visiting a completed step shows
 *     a "Re-run check" affordance instead of pretending it's fresh.
 *
 * Standalone for the preview harness:
 *   • prop-less default export, no router / network / query hooks
 *   • inline MOCK: profile, 2FA + sessions, notification prefs, theme, retention
 *   • 5 steps × 2-4 check items each; completing the "fix" flips that check
 *     done. When every check on a step is done → step → done → progress
 *     advances → final step plays a sparkle burst.
 *
 * Animations (framer-motion):
 *   • Stepper nodes morph (accent2 glow on active → accent fill on done)
 *   • Step panels slide horizontally on Next/Back (AnimatePresence + direction)
 *   • Verdict pill pops in when the panel mounts
 *   • Progress bar fill animates
 *   • Final-step completion sparks
 */

// ---------------------------------------------------------------------------
// Step model
// ---------------------------------------------------------------------------

type StepKey = 'profile' | 'security' | 'notifications' | 'appearance' | 'data';

interface StepDef {
  key: StepKey;
  name: string;
  blurb: string;
  Icon: LucideIcon;
  /** Check ids — also used as keys in the per-step done map. */
  checks: string[];
}

const STEPS: StepDef[] = [
  {
    key: 'profile',
    name: 'Profile',
    blurb: 'Make sure your identity is set so reports + audits attribute correctly.',
    Icon: UserIcon,
    checks: ['display-name', 'timezone', 'avatar'],
  },
  {
    key: 'security',
    name: 'Security',
    blurb: 'Lock the workspace down — 2FA + active session hygiene.',
    Icon: Shield,
    checks: ['totp', 'sessions', 'recovery-codes', 'session-timeout'],
  },
  {
    key: 'notifications',
    name: 'Notifications',
    blurb: 'Tune what reaches your inbox vs. what stays in-app only.',
    Icon: Bell,
    checks: ['weekly-digest', 'bounce-spike', 'invoice-failed'],
  },
  {
    key: 'appearance',
    name: 'Appearance',
    blurb: 'Theme + density. Cosmetic, but it sticks across devices.',
    Icon: Palette,
    checks: ['theme', 'density'],
  },
  {
    key: 'data',
    name: 'Data',
    blurb: 'Retention window and export — Pro Plus keeps 180 days by default.',
    Icon: Database,
    checks: ['retention', 'export'],
  },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK = {
  workspace: 'Acme Outbound',
  plan: 'Pro Plus',
  user: {
    displayName: 'Aanya Kapoor',
    email: 'aanya@acme.io',
    timezone: 'Asia/Kolkata (UTC+5:30)',
    avatarUploaded: false,
  },
  security: {
    totpEnabled: false,
    recoveryCodesSaved: false,
    sessionTimeoutMinutes: 30,
    sessions: [
      {
        id: 'sess-1',
        device: 'MacBook Pro · Chrome 121',
        location: 'Bengaluru, IN',
        lastActive: 'now',
        current: true,
      },
      {
        id: 'sess-2',
        device: 'iPhone 15 · Safari',
        location: 'Bengaluru, IN',
        lastActive: '4 hours ago',
        current: false,
      },
      {
        id: 'sess-3',
        device: 'Unknown · Firefox 119',
        location: 'Lisbon, PT',
        lastActive: '6 days ago',
        current: false,
      },
    ],
  },
  notifications: {
    weeklyDigest: { email: true, inApp: true, push: false },
    bounceSpike: { email: false, inApp: true, push: false },
    invoiceFailed: { email: true, inApp: true, push: false },
  },
  appearance: {
    theme: 'dark' as 'light' | 'dark' | 'system',
    density: 'comfortable' as 'compact' | 'comfortable' | 'spacious',
  },
  data: {
    retentionDays: 90,
    lastExportAt: '2026-04-29',
  },
};

const TIMEZONES = [
  'Asia/Kolkata (UTC+5:30)',
  'America/New_York (UTC-5:00)',
  'America/Los_Angeles (UTC-8:00)',
  'Europe/London (UTC+0:00)',
  'Europe/Berlin (UTC+1:00)',
  'Australia/Sydney (UTC+11:00)',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Notif {
  email: boolean;
  inApp: boolean;
  push: boolean;
}

type DoneMap = Record<string, Record<string, boolean>>;

function makeInitialDone(): DoneMap {
  const init: DoneMap = {};
  for (const step of STEPS) {
    init[step.key] = {};
    for (const c of step.checks) init[step.key]![c] = false;
  }
  return init;
}

export function ProPlusSet2Wizard(): JSX.Element {
  // Navigation state
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [sparked, setSparked] = useState(false);

  // Per-check done flags (the "fix" actions flip these)
  const [done, setDone] = useState<DoneMap>(makeInitialDone);

  // Per-step form state — completing an action flips the matching check done.
  const [displayName, setDisplayName] = useState(MOCK.user.displayName);
  const [timezone, setTimezone] = useState(MOCK.user.timezone);
  const [avatarUploaded, setAvatarUploaded] = useState(MOCK.user.avatarUploaded);

  const [totpEnabled, setTotpEnabled] = useState(MOCK.security.totpEnabled);
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(
    MOCK.security.recoveryCodesSaved,
  );
  const [sessions, setSessions] = useState(MOCK.security.sessions);
  const [sessionTimeoutOk, setSessionTimeoutOk] = useState(false);

  const [notif, setNotif] = useState<{
    weeklyDigest: Notif;
    bounceSpike: Notif;
    invoiceFailed: Notif;
  }>({
    weeklyDigest: MOCK.notifications.weeklyDigest,
    bounceSpike: MOCK.notifications.bounceSpike,
    invoiceFailed: MOCK.notifications.invoiceFailed,
  });

  const [theme, setTheme] = useState(MOCK.appearance.theme);
  const [density, setDensity] = useState(MOCK.appearance.density);

  const [retention, setRetention] = useState(MOCK.data.retentionDays);
  const [lastExportAt, setLastExportAt] = useState(MOCK.data.lastExportAt);

  const currentStep = STEPS[stepIndex]!;

  // ── derived: completion / verdicts ──────────────────────────────────────
  const stepCompletion = useMemo(() => {
    return STEPS.map((s) => {
      const checks = done[s.key] ?? {};
      const pass = s.checks.filter((c) => checks[c]).length;
      return { key: s.key, pass, total: s.checks.length };
    });
  }, [done]);

  const overallPct = useMemo(() => {
    const totalChecks = STEPS.reduce((acc, s) => acc + s.checks.length, 0);
    const passed = stepCompletion.reduce((a, c) => a + c.pass, 0);
    return Math.round((passed / totalChecks) * 100);
  }, [stepCompletion]);

  const currentVerdict = useMemo(() => {
    const c = stepCompletion[stepIndex]!;
    if (c.pass === c.total) {
      return {
        kind: 'pass' as const,
        text: `All ${c.total} checks pass`,
      };
    }
    if (c.pass === 0) {
      return {
        kind: 'action' as const,
        text: `Action needed · ${c.total} checks to run`,
      };
    }
    return {
      kind: 'partial' as const,
      text: `Looking good · ${c.pass} of ${c.total} checks pass`,
    };
  }, [stepCompletion, stepIndex]);

  function markDone(stepKey: StepKey, checkId: string, value: boolean = true) {
    setDone((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], [checkId]: value },
    }));
  }

  function rerunCheck(stepKey: StepKey, checkId: string) {
    // Re-running clears + sets — the brief tick gives a "checked" feel.
    setDone((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], [checkId]: false },
    }));
    window.setTimeout(() => {
      setDone((prev) => ({
        ...prev,
        [stepKey]: { ...prev[stepKey], [checkId]: true },
      }));
    }, 280);
  }

  function goNext() {
    if (stepIndex >= STEPS.length - 1) {
      // Final step + everything done → sparkle. Idempotent.
      if (overallPct === 100 && !sparked) setSparked(true);
      return;
    }
    setDirection(1);
    setStepIndex((i) => i + 1);
  }
  function goBack() {
    if (stepIndex <= 0) return;
    setDirection(-1);
    setStepIndex((i) => i - 1);
  }
  function jumpTo(idx: number) {
    if (idx === stepIndex) return;
    setDirection(idx > stepIndex ? 1 : -1);
    setStepIndex(idx);
  }

  const isLast = stepIndex === STEPS.length - 1;
  const allDone = overallPct === 100;

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-bg text-text flex h-full min-h-[760px] flex-col">
      {/* Header strip — overall % + workspace context */}
      <header className="border-border-muted border-b px-8 pt-6 pb-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-text-dim flex items-center gap-2 text-[11px] tracking-wider uppercase">
              <Sparkles size={12} strokeWidth={2.2} className="text-accent" />
              Pro Plus account walk-through
            </div>
            <h1 className="mt-2 text-[22px] leading-tight font-semibold">
              Tune {MOCK.workspace} in 5 steps
            </h1>
            <p className="text-text-dim mt-1 text-sm">
              We'll walk every Settings area and flag the bits worth fixing
              before you hand the workspace to your team.
            </p>
          </div>
          <ProgressGauge pct={overallPct} sparked={sparked} />
        </div>

        {/* Stepper */}
        <nav className="mt-6" aria-label="Setup steps">
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const c = stepCompletion[i]!;
              const isActive = i === stepIndex;
              const stepDone = c.pass === c.total;
              return (
                <li key={s.key} className="flex flex-1 items-center gap-2">
                  <StepperNode
                    index={i}
                    label={s.name}
                    Icon={s.Icon}
                    isActive={isActive}
                    isDone={stepDone}
                    pass={c.pass}
                    total={c.total}
                    onClick={() => jumpTo(i)}
                  />
                  {i < STEPS.length - 1 && (
                    <div className="flex-1">
                      <div className="bg-surface-2 border-border-muted relative h-[2px] rounded-full border-y">
                        <motion.div
                          initial={false}
                          animate={{
                            scaleX: stepDone ? 1 : isActive ? 0.5 : 0,
                          }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          style={{ transformOrigin: 'left' }}
                          className="bg-accent absolute inset-0 rounded-full"
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      {/* Center — verdict + active panel */}
      <main className="flex-1 overflow-hidden px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {/* Verdict pill row */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <VerdictPill verdict={currentVerdict} key={`v-${stepIndex}-${currentVerdict.kind}`} />
            <div className="text-text-dim text-xs">
              Step {stepIndex + 1} of {STEPS.length} · {currentStep.name}
            </div>
          </div>

          {/* Panel — slide on Next/Back */}
          <div className="bg-surface border-border-muted relative overflow-hidden rounded-2xl border">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={currentStep.key}
                custom={direction}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
                className="p-6"
              >
                <div className="mb-5 flex items-start gap-3">
                  <div className="bg-surface-2 border-border-muted text-accent flex h-9 w-9 items-center justify-center rounded-xl border">
                    <currentStep.Icon size={16} strokeWidth={2.2} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">
                      {currentStep.name}
                    </h2>
                    <p className="text-text-dim text-sm">{currentStep.blurb}</p>
                  </div>
                </div>

                {currentStep.key === 'profile' && (
                  <ProfilePanel
                    displayName={displayName}
                    setDisplayName={(v) => {
                      setDisplayName(v);
                      if (v.trim().length >= 2) markDone('profile', 'display-name');
                    }}
                    timezone={timezone}
                    setTimezone={(v) => {
                      setTimezone(v);
                      markDone('profile', 'timezone');
                    }}
                    avatarUploaded={avatarUploaded}
                    onUploadAvatar={() => {
                      setAvatarUploaded(true);
                      markDone('profile', 'avatar');
                    }}
                    done={done.profile ?? {}}
                    onRerun={(id) => rerunCheck('profile', id)}
                  />
                )}

                {currentStep.key === 'security' && (
                  <SecurityPanel
                    totpEnabled={totpEnabled}
                    onEnableTotp={() => {
                      setTotpEnabled(true);
                      markDone('security', 'totp');
                    }}
                    recoveryCodesSaved={recoveryCodesSaved}
                    onSaveCodes={() => {
                      setRecoveryCodesSaved(true);
                      markDone('security', 'recovery-codes');
                    }}
                    sessions={sessions}
                    onRevokeSession={(id) => {
                      setSessions((prev) => prev.filter((s) => s.id !== id));
                      markDone('security', 'sessions');
                    }}
                    sessionTimeoutOk={sessionTimeoutOk}
                    onTrimSessionTimeout={() => {
                      setSessionTimeoutOk(true);
                      markDone('security', 'session-timeout');
                    }}
                    done={done.security ?? {}}
                    onRerun={(id) => rerunCheck('security', id)}
                  />
                )}

                {currentStep.key === 'notifications' && (
                  <NotificationsPanel
                    notif={notif}
                    onToggle={(eventKey, channel) => {
                      setNotif((prev) => {
                        const next = {
                          ...prev,
                          [eventKey]: {
                            ...prev[eventKey],
                            [channel]: !prev[eventKey][channel],
                          },
                        };
                        // Each event is "configured" as soon as the user
                        // touches any channel — completes its check.
                        const checkMap: Record<
                          keyof typeof prev,
                          string
                        > = {
                          weeklyDigest: 'weekly-digest',
                          bounceSpike: 'bounce-spike',
                          invoiceFailed: 'invoice-failed',
                        };
                        markDone('notifications', checkMap[eventKey]);
                        return next;
                      });
                    }}
                    done={done.notifications ?? {}}
                    onRerun={(id) => rerunCheck('notifications', id)}
                  />
                )}

                {currentStep.key === 'appearance' && (
                  <AppearancePanel
                    theme={theme}
                    setTheme={(t) => {
                      setTheme(t);
                      markDone('appearance', 'theme');
                    }}
                    density={density}
                    setDensity={(d) => {
                      setDensity(d);
                      markDone('appearance', 'density');
                    }}
                    done={done.appearance ?? {}}
                    onRerun={(id) => rerunCheck('appearance', id)}
                  />
                )}

                {currentStep.key === 'data' && (
                  <DataPanel
                    retention={retention}
                    setRetention={(r) => {
                      setRetention(r);
                      markDone('data', 'retention');
                    }}
                    lastExportAt={lastExportAt}
                    onExport={() => {
                      setLastExportAt(new Date().toISOString().slice(0, 10));
                      markDone('data', 'export');
                    }}
                    done={done.data ?? {}}
                    onRerun={(id) => rerunCheck('data', id)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer controls */}
      <footer className="border-border-muted bg-surface/40 flex items-center justify-between border-t px-8 py-4">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0}
          className="border-border-muted text-text hover:bg-surface-2 inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={14} strokeWidth={2.2} />
          Back
        </button>

        <div className="flex items-center gap-2">
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              className="text-text-dim hover:text-text inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              <SkipForward size={13} strokeWidth={2.2} />
              Skip for now
            </button>
          )}

          {isLast ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!allDone}
              className="bg-accent text-bg shadow-glow inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allDone ? (
                <>
                  Finish setup
                  <Check size={14} strokeWidth={2.4} />
                </>
              ) : (
                <>Complete remaining checks</>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="bg-accent text-bg shadow-glow inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Next
              <ArrowRight size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </footer>

      {/* Sparkle burst — final step, all done */}
      {sparked && <SparkleBurst onDone={() => setSparked(false)} />}
    </div>
  );
}

export default ProPlusSet2Wizard;

// ---------------------------------------------------------------------------
// Stepper / progress UI
// ---------------------------------------------------------------------------

const panelVariants = {
  enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: 1 | -1) => ({ opacity: 0, x: dir * -28 }),
};

function ProgressGauge({ pct, sparked }: { pct: number; sparked: boolean }) {
  return (
    <div className="bg-surface border-border-muted relative w-[240px] shrink-0 rounded-xl border px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-text-dim text-[10px] tracking-wider uppercase">
          Overall completion
        </span>
        <motion.span
          key={pct}
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="text-text text-xl font-semibold tabular-nums"
        >
          {pct}%
        </motion.span>
      </div>
      <div className="bg-surface-2 border-border-muted relative mt-2 h-2 overflow-hidden rounded-full border">
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="bg-accent absolute inset-y-0 left-0 rounded-full"
        />
        {sparked && (
          <motion.div
            initial={{ x: '-30%', opacity: 0 }}
            animate={{ x: '130%', opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="bg-accent/40 absolute inset-y-0 w-1/3 blur-md"
          />
        )}
      </div>
      <div className="text-text-dim mt-1.5 text-[11px]">
        {pct === 100 ? 'Walkthrough complete' : `${100 - pct}% to go`}
      </div>
    </div>
  );
}

function StepperNode({
  index,
  label,
  Icon,
  isActive,
  isDone,
  pass,
  total,
  onClick,
}: {
  index: number;
  label: string;
  Icon: LucideIcon;
  isActive: boolean;
  isDone: boolean;
  pass: number;
  total: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex shrink-0 flex-col items-center gap-1.5 outline-none"
      aria-current={isActive ? 'step' : undefined}
    >
      <motion.div
        initial={false}
        animate={{
          backgroundColor: isDone
            ? 'rgb(var(--color-accent) / 1)'
            : isActive
              ? 'rgb(var(--color-surface-2) / 1)'
              : 'rgb(var(--color-surface) / 1)',
          scale: isActive ? 1.05 : 1,
        }}
        transition={{ duration: 0.28 }}
        className={[
          'relative flex h-10 w-10 items-center justify-center rounded-full border',
          isDone
            ? 'border-accent'
            : isActive
              ? 'border-accent'
              : 'border-border-muted',
        ].join(' ')}
      >
        {isActive && !isDone && (
          <motion.span
            aria-hidden
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="border-accent absolute inset-0 rounded-full border"
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {isDone ? (
            <motion.span
              key="check"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 20 }}
              className="text-bg"
            >
              <Check size={16} strokeWidth={3} />
            </motion.span>
          ) : (
            <motion.span
              key="icon"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                color: isActive
                  ? 'rgb(var(--color-accent) / 1)'
                  : 'rgb(var(--color-text-dim) / 1)',
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Icon size={15} strokeWidth={2.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <div className="flex flex-col items-center leading-tight">
        <span
          className={[
            'text-[11px] font-medium',
            isActive ? 'text-text' : isDone ? 'text-text' : 'text-text-dim',
          ].join(' ')}
        >
          {String(index + 1).padStart(2, '0')} · {label}
        </span>
        <span className="text-text-dim text-[10px] tabular-nums">
          {pass}/{total}
        </span>
      </div>
    </button>
  );
}

function VerdictPill({
  verdict,
}: {
  verdict: { kind: 'pass' | 'partial' | 'action'; text: string };
}) {
  const palette =
    verdict.kind === 'pass'
      ? 'text-accent border-accent/40 bg-accent/10'
      : verdict.kind === 'action'
        ? 'text-accent4 border-accent4/40 bg-accent4/10'
        : 'text-accent3 border-accent3/40 bg-accent3/10';
  const Icon =
    verdict.kind === 'pass'
      ? ShieldCheck
      : verdict.kind === 'action'
        ? AlertTriangle
        : Sparkles;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
        palette,
      ].join(' ')}
    >
      <Icon size={12} strokeWidth={2.4} />
      {verdict.text}
    </motion.div>
  );
}

function SparkleBurst({ onDone }: { onDone: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: [0, 1, 0], scale: [0.7, 1.1, 1.3] }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        onAnimationComplete={onDone}
        className="border-accent text-accent flex items-center gap-2 rounded-full border-2 bg-bg/90 px-5 py-3 text-sm font-semibold backdrop-blur"
      >
        <Sparkles size={16} strokeWidth={2.4} />
        Workspace ready for the team
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-usable inner bits
// ---------------------------------------------------------------------------

function CheckItem({
  label,
  detail,
  isDone,
  onRerun,
  action,
}: {
  label: string;
  detail?: string;
  isDone: boolean;
  onRerun?: () => void;
  action?: ReactNode;
}) {
  return (
    <div
      className={[
        'border-border-muted flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
        isDone ? 'bg-surface-2/40' : 'bg-bg',
      ].join(' ')}
    >
      <motion.span
        initial={false}
        animate={{
          backgroundColor: isDone
            ? 'rgb(var(--color-accent) / 1)'
            : 'rgb(var(--color-surface-2) / 1)',
          borderColor: isDone
            ? 'rgb(var(--color-accent) / 1)'
            : 'rgb(var(--color-border-muted) / 1)',
        }}
        transition={{ duration: 0.22 }}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
      >
        <AnimatePresence mode="wait">
          {isDone && (
            <motion.span
              key="tick"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 22 }}
              className="text-bg"
            >
              <Check size={11} strokeWidth={3.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-text text-sm font-medium">{label}</div>
          {isDone && onRerun && (
            <button
              type="button"
              onClick={onRerun}
              className="text-text-dim hover:text-text inline-flex items-center gap-1 text-[11px]"
            >
              <RefreshCw size={10} strokeWidth={2.4} />
              Re-run check
            </button>
          )}
        </div>
        {detail && (
          <div className="text-text-dim mt-0.5 text-xs">{detail}</div>
        )}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

function MiniButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  const tone =
    variant === 'primary'
      ? 'bg-accent text-bg shadow-glow font-semibold'
      : variant === 'danger'
        ? 'bg-accent3/15 text-accent3 border border-accent3/30'
        : 'bg-surface-2 text-text border border-border-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        tone,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step panels
// ---------------------------------------------------------------------------

function ProfilePanel({
  displayName,
  setDisplayName,
  timezone,
  setTimezone,
  avatarUploaded,
  onUploadAvatar,
  done,
  onRerun,
}: {
  displayName: string;
  setDisplayName: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  avatarUploaded: boolean;
  onUploadAvatar: () => void;
  done: Record<string, boolean>;
  onRerun: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <CheckItem
        label="Display name set"
        detail="Used in audit rows and on transactional emails."
        isDone={done['display-name'] ?? false}
        onRerun={() => onRerun('display-name')}
        action={
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Aanya Kapoor"
              className="bg-surface-2 border-border-muted text-text placeholder:text-text-dim/60 focus:border-accent flex-1 rounded-md border px-2.5 py-1.5 text-sm outline-none"
            />
          </div>
        }
      />

      <CheckItem
        label="Timezone matches your team"
        detail="Daily-rollup runs in UTC, but every chart axis is local."
        isDone={done['timezone'] ?? false}
        onRerun={() => onRerun('timezone')}
        action={
          <div className="flex items-center gap-2">
            <Globe2 size={13} className="text-text-dim" />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="bg-surface-2 border-border-muted text-text focus:border-accent flex-1 rounded-md border px-2.5 py-1.5 text-sm outline-none"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </div>
        }
      />

      <CheckItem
        label="Avatar uploaded"
        detail="Optional — helps teammates spot your activity on the audit log."
        isDone={done['avatar'] ?? false}
        onRerun={() => onRerun('avatar')}
        action={
          <div className="flex items-center gap-2">
            {avatarUploaded ? (
              <span className="text-text-dim inline-flex items-center gap-1 text-xs">
                <Check size={11} className="text-accent" strokeWidth={2.6} />
                Picture set
              </span>
            ) : (
              <MiniButton onClick={onUploadAvatar}>
                <UserIcon size={11} strokeWidth={2.4} />
                Upload picture
              </MiniButton>
            )}
          </div>
        }
      />
    </div>
  );
}

function SecurityPanel({
  totpEnabled,
  onEnableTotp,
  recoveryCodesSaved,
  onSaveCodes,
  sessions,
  onRevokeSession,
  sessionTimeoutOk,
  onTrimSessionTimeout,
  done,
  onRerun,
}: {
  totpEnabled: boolean;
  onEnableTotp: () => void;
  recoveryCodesSaved: boolean;
  onSaveCodes: () => void;
  sessions: Array<{
    id: string;
    device: string;
    location: string;
    lastActive: string;
    current: boolean;
  }>;
  onRevokeSession: (id: string) => void;
  sessionTimeoutOk: boolean;
  onTrimSessionTimeout: () => void;
  done: Record<string, boolean>;
  onRerun: (id: string) => void;
}) {
  const otherSessions = sessions.filter((s) => !s.current);
  return (
    <div className="flex flex-col gap-2.5">
      <CheckItem
        label="Two-factor authentication enabled"
        detail="Authenticator app required on every sign-in."
        isDone={done['totp'] ?? false}
        onRerun={() => onRerun('totp')}
        action={
          totpEnabled ? (
            <span className="text-accent inline-flex items-center gap-1 text-xs font-medium">
              <ShieldCheck size={12} strokeWidth={2.4} />
              Enabled
            </span>
          ) : (
            <MiniButton onClick={onEnableTotp}>
              <Lock size={11} strokeWidth={2.4} />
              Enable 2FA now
            </MiniButton>
          )
        }
      />

      <CheckItem
        label="Recovery codes saved"
        detail="One-time codes for when you lose your authenticator."
        isDone={done['recovery-codes'] ?? false}
        onRerun={() => onRerun('recovery-codes')}
        action={
          recoveryCodesSaved ? (
            <span className="text-text-dim inline-flex items-center gap-1 text-xs">
              <Check size={11} className="text-accent" strokeWidth={2.6} />
              Codes downloaded
            </span>
          ) : (
            <MiniButton onClick={onSaveCodes} disabled={!totpEnabled}>
              <Download size={11} strokeWidth={2.4} />
              {totpEnabled ? 'Download codes' : 'Enable 2FA first'}
            </MiniButton>
          )
        }
      />

      <CheckItem
        label="No stale sign-ins"
        detail={
          otherSessions.length === 0
            ? 'Only this device is signed in.'
            : `${otherSessions.length} other session(s) currently signed in`
        }
        isDone={done['sessions'] ?? false}
        onRerun={() => onRerun('sessions')}
        action={
          otherSessions.length === 0 ? (
            <span className="text-text-dim inline-flex items-center gap-1 text-xs">
              <Check size={11} className="text-accent" strokeWidth={2.6} />
              Clean
            </span>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {otherSessions.map((s) => (
                <li
                  key={s.id}
                  className="bg-surface-2 border-border-muted flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {s.device}
                    </div>
                    <div className="text-text-dim text-[10px]">
                      {s.location} · {s.lastActive}
                    </div>
                  </div>
                  <MiniButton
                    onClick={() => onRevokeSession(s.id)}
                    variant="danger"
                  >
                    Revoke
                  </MiniButton>
                </li>
              ))}
            </ul>
          )
        }
      />

      <CheckItem
        label="Session timeout sensible"
        detail="Pro Plus default — refresh tokens expire after 30 days."
        isDone={done['session-timeout'] ?? false}
        onRerun={() => onRerun('session-timeout')}
        action={
          sessionTimeoutOk ? (
            <span className="text-text-dim inline-flex items-center gap-1 text-xs">
              <Check size={11} className="text-accent" strokeWidth={2.6} />
              Verified
            </span>
          ) : (
            <MiniButton onClick={onTrimSessionTimeout} variant="ghost">
              <Eye size={11} strokeWidth={2.4} />
              Verify timeout policy
            </MiniButton>
          )
        }
      />
    </div>
  );
}

function NotificationsPanel({
  notif,
  onToggle,
  done,
  onRerun,
}: {
  notif: {
    weeklyDigest: Notif;
    bounceSpike: Notif;
    invoiceFailed: Notif;
  };
  onToggle: (
    eventKey: 'weeklyDigest' | 'bounceSpike' | 'invoiceFailed',
    channel: 'email' | 'inApp' | 'push',
  ) => void;
  done: Record<string, boolean>;
  onRerun: (id: string) => void;
}) {
  const events: Array<{
    key: 'weeklyDigest' | 'bounceSpike' | 'invoiceFailed';
    label: string;
    detail: string;
    checkId: string;
  }> = [
    {
      key: 'weeklyDigest',
      label: 'Weekly sender-trust digest',
      detail: 'Monday 9am · 7-day sender-trust summary per mailbox.',
      checkId: 'weekly-digest',
    },
    {
      key: 'bounceSpike',
      label: 'Failed-delivery spike alerts',
      detail: 'Real-time when failure ratio breaks threshold.',
      checkId: 'bounce-spike',
    },
    {
      key: 'invoiceFailed',
      label: 'Payment failed',
      detail: 'Immediate alert when a card / UPI charge fails.',
      checkId: 'invoice-failed',
    },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {events.map((ev) => {
        const row = notif[ev.key];
        const channelCount = (row.email ? 1 : 0) + (row.inApp ? 1 : 0) + (row.push ? 1 : 0);
        return (
          <CheckItem
            key={ev.key}
            label={ev.label}
            detail={
              channelCount === 0
                ? `${ev.detail} · no channels — you'll miss it.`
                : `${ev.detail} · ${channelCount} channel(s) on`
            }
            isDone={done[ev.checkId] ?? false}
            onRerun={() => onRerun(ev.checkId)}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <ChannelPill
                  label="Email"
                  Icon={Mail}
                  on={row.email}
                  onClick={() => onToggle(ev.key, 'email')}
                />
                <ChannelPill
                  label="In-app"
                  Icon={Bell}
                  on={row.inApp}
                  onClick={() => onToggle(ev.key, 'inApp')}
                />
                <ChannelPill
                  label="Push"
                  Icon={BellOff}
                  on={row.push}
                  onClick={() => onToggle(ev.key, 'push')}
                />
              </div>
            }
          />
        );
      })}
    </div>
  );
}

function ChannelPill({
  label,
  Icon,
  on,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        on
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'bg-surface-2 text-text-dim border-border-muted hover:text-text',
      ].join(' ')}
    >
      <Icon size={11} strokeWidth={2.4} />
      {label}
    </button>
  );
}

function AppearancePanel({
  theme,
  setTheme,
  density,
  setDensity,
  done,
  onRerun,
}: {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  density: 'compact' | 'comfortable' | 'spacious';
  setDensity: (d: 'compact' | 'comfortable' | 'spacious') => void;
  done: Record<string, boolean>;
  onRerun: (id: string) => void;
}) {
  const themes: Array<{
    key: 'light' | 'dark' | 'system';
    label: string;
    Icon: LucideIcon;
  }> = [
    { key: 'light', label: 'Light', Icon: Sun },
    { key: 'dark', label: 'Dark', Icon: Moon },
    { key: 'system', label: 'System', Icon: Monitor },
  ];
  const densities: Array<'compact' | 'comfortable' | 'spacious'> = [
    'compact',
    'comfortable',
    'spacious',
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <CheckItem
        label="Theme picked"
        detail="Light reduces eyestrain in daylight; Dark wins everywhere else."
        isDone={done['theme'] ?? false}
        onRerun={() => onRerun('theme')}
        action={
          <div className="grid grid-cols-3 gap-2">
            {themes.map((t) => {
              const active = theme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTheme(t.key)}
                  className={[
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors',
                    active
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border-muted bg-surface-2 text-text-dim hover:text-text',
                  ].join(' ')}
                >
                  <t.Icon size={14} strokeWidth={2.2} />
                  {t.label}
                  {active && (
                    <motion.span
                      layoutId="theme-dot"
                      className="bg-accent mt-0.5 h-1 w-1 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      <CheckItem
        label="Density chosen"
        detail="Affects row heights and gutter padding across the app."
        isDone={done['density'] ?? false}
        onRerun={() => onRerun('density')}
        action={
          <div className="bg-surface-2 border-border-muted inline-flex rounded-full border p-0.5">
            {densities.map((d) => {
              const active = density === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDensity(d)}
                  className={[
                    'relative rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    active ? 'text-bg' : 'text-text-dim hover:text-text',
                  ].join(' ')}
                >
                  {active && (
                    <motion.span
                      layoutId="density-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      className="bg-accent absolute inset-0 -z-10 rounded-full"
                    />
                  )}
                  <span className="capitalize">{d}</span>
                </button>
              );
            })}
          </div>
        }
      />
    </div>
  );
}

function DataPanel({
  retention,
  setRetention,
  lastExportAt,
  onExport,
  done,
  onRerun,
}: {
  retention: number;
  setRetention: (r: number) => void;
  lastExportAt: string;
  onExport: () => void;
  done: Record<string, boolean>;
  onRerun: (id: string) => void;
}) {
  const options = [30, 90, 180, 365];
  return (
    <div className="flex flex-col gap-2.5">
      <CheckItem
        label="Retention window chosen"
        detail="Pro Plus default is 180 days. Affects warmup_logs storage."
        isDone={done['retention'] ?? false}
        onRerun={() => onRerun('retention')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setRetention(opt)}
                className={[
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  retention === opt
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-muted bg-surface-2 text-text-dim hover:text-text',
                ].join(' ')}
              >
                {opt} days
              </button>
            ))}
          </div>
        }
      />

      <CheckItem
        label="Recent export downloaded"
        detail={`Last export: ${lastExportAt}. Streams a CSV of all warmup logs.`}
        isDone={done['export'] ?? false}
        onRerun={() => onRerun('export')}
        action={
          <div className="flex items-center gap-2">
            <MiniButton onClick={onExport}>
              <Download size={11} strokeWidth={2.4} />
              Export workspace CSV
            </MiniButton>
            <span className="text-text-dim inline-flex items-center gap-1 text-[11px]">
              <ChevronRight size={10} className="text-text-dim" />
              Optional, recommended quarterly
            </span>
          </div>
        }
      />

      <div className="bg-accent3/10 border-accent3/30 text-accent3 mt-1 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs">
        <Trash2 size={13} strokeWidth={2.2} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">Danger zone</span> · workspace
          deletion lives in the full Settings page, not the wizard — it has a
          30-day grace period and requires re-auth.
        </span>
      </div>
    </div>
  );
}
