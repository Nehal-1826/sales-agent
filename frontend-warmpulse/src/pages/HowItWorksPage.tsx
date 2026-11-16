import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Mail,
  MailCheck,
  Moon,
  MousePointer2,
  Radar,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import './landing/hero-theme.css';

/* ============================================================================
   Theme
============================================================================ */

type Theme = 'dark' | 'light';
const THEME_KEY = 'warmpulse.theme';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, setTheme];
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div
      className="inline-flex h-9 items-center rounded-full p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
        border: '1px solid var(--wp-glass-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {(['light', 'dark'] as const).map((mode) => {
        const active = theme === mode;
        const Icon = mode === 'light' ? Sun : Moon;
        return (
          <button
            key={mode}
            onClick={() => setTheme(mode)}
            aria-label={`Switch to ${mode} theme`}
            className="relative flex h-7 w-7 items-center justify-center rounded-full"
          >
            {active && (
              <motion.span
                layoutId="hiw-theme-thumb"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--wp-accent) 22%, transparent)' }}
              />
            )}
            <Icon
              size={14}
              strokeWidth={1.8}
              className="relative z-10"
              style={{ color: active ? 'var(--wp-accent)' : 'var(--wp-text-dim)' }}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Per-step accent palette — each panel gets its own color identity
============================================================================ */

type StepAccent = {
  key: string;
  label: string;
  hex: string;          // primary accent
  hex2: string;         // secondary for gradients
};

const STEPS: StepAccent[] = [
  { key: 'connect', label: 'Connect', hex: '#F26522', hex2: '#FF9670' },  // violet
  { key: 'ramp',    label: 'Ramp',    hex: '#FF9670', hex2: '#FF9670' },  // blue → cyan
  { key: 'engage',  label: 'Engage',  hex: '#10d99e', hex2: '#3ddc97' },  // emerald
  { key: 'author',  label: 'Author',  hex: '#ffb454', hex2: '#f59e0b' },  // amber
  { key: 'monitor', label: 'Monitor', hex: '#ff5c7a', hex2: '#f43f5e' },  // rose
  { key: 'result',  label: 'Result',  hex: '#06d4d4', hex2: '#F26522' },  // teal → violet
];

/* Mobile step content — title/body for the <640px immersive stack (the desktop
   journey passes these inline to StepSection; mirrored here for the mobile view). */
type MobileStep = { key: string; n: number; label: string; title: string; accentText: string; body: string; hex: string; hex2: string; Icon: LucideIcon };
const MOBILE_STEPS: MobileStep[] = [
  { key: 'connect', n: 1, label: 'Connect', title: 'Plug in a mailbox', accentText: 'in 30 seconds.', body: 'One-click OAuth for Gmail, Outlook, Yahoo. Generic SMTP/IMAP for the rest — your password never touches our servers.', hex: '#F26522', hex2: '#FF9670', Icon: Mail },
  { key: 'ramp', n: 2, label: 'Ramp', title: 'Daily caps follow', accentText: 'a proven ladder.', body: 'Volume climbs gradually so receivers learn to trust the sender — 5 on day 1, target by day 29. Spam signals auto-throttle.', hex: '#FF9670', hex2: '#ffb454', Icon: TrendingUp },
  { key: 'engage', n: 3, label: 'Engage', title: 'A peer network', accentText: 'gets to work.', body: 'Each send hits a real peer mailbox — reputation-weighted, never repeated within 24h. Peers open, reply, star, and rescue.', hex: '#10d99e', hex2: '#3ddc97', Icon: Sparkles },
  { key: 'author', n: 4, label: 'Author', title: 'AI writes', accentText: 'plausible threads.', body: 'Every warmup email is fresh — generated by Gemini or Claude with realistic subjects, bodies, and replies.', hex: '#ffb454', hex2: '#f59e0b', Icon: Wand2 },
  { key: 'monitor', n: 5, label: 'Monitor', title: 'SPF, DKIM, DMARC', accentText: 'watched 24/7.', body: 'We continuously verify domain auth, scan 12 blacklists, and surface drift alerts before they cost a campaign.', hex: '#ff5c7a', hex2: '#f43f5e', Icon: ShieldCheck },
  { key: 'result', n: 6, label: 'Result', title: 'Warmth climbs.', accentText: 'Inbox follows.', body: 'By day 30, a typical mailbox lands at warmth 90+ with sub-1% spam placement on Gmail. The reputation is yours.', hex: '#06d4d4', hex2: '#F26522', Icon: CheckCircle2 },
];

/* Mobile immersive steps (<640px) — replaces the desktop sticky-scroll journey,
   which leaves content dimmed and overflows on phones. Giant translucent step
   number, color-shifting aurora glow, floating particles, per-step accent. */
function MobileStepsImmersive() {
  const t = useT();
  return (
    <div className="space-y-5 px-5 sm:hidden">
      {MOBILE_STEPS.map((s) => (
        <motion.div
          key={s.n}
          className="relative overflow-hidden rounded-3xl p-6"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            minHeight: 230,
            background: 'color-mix(in srgb, var(--wp-surface) 55%, transparent)',
            backdropFilter: 'blur(22px) saturate(160%)',
            WebkitBackdropFilter: 'blur(22px) saturate(160%)',
            border: `1px solid color-mix(in srgb, ${s.hex} 24%, var(--wp-glass-border))`,
            boxShadow: `0 24px 60px color-mix(in srgb, ${s.hex} 16%, transparent)`,
          }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full"
            style={{ background: `radial-gradient(circle, color-mix(in srgb, ${s.hex} 30%, transparent), transparent 65%)`, filter: 'blur(40px)' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 select-none font-mono text-[120px] font-black leading-none" style={{ color: `color-mix(in srgb, ${s.hex} 10%, transparent)`, WebkitTextStroke: `1px color-mix(in srgb, ${s.hex} 16%, transparent)` }}>
            0{s.n}
          </span>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{ left: `${12 + i * 22}%`, bottom: '8%', width: 4, height: 4, background: s.hex }}
              animate={{ y: ['0%', '-260%'], opacity: [0, 0.7, 0] }}
              transition={{ duration: 4 + i, repeat: Infinity, delay: i * 0.8, ease: 'linear' }}
            />
          ))}
          <div className="relative">
            <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `linear-gradient(135deg, ${s.hex}, ${s.hex2})`, color: '#fff', boxShadow: `0 0 20px color-mix(in srgb, ${s.hex} 50%, transparent)` }}>
              <s.Icon size={20} strokeWidth={2} />
            </span>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: s.hex }}>{t(`hiw.step.${s.key}.label`)}</div>
            <h3 className="mt-1 text-[24px] font-bold leading-[1.05]" style={{ color: 'var(--wp-text)' }}>
              {t(`hiw.mob.${s.key}.title`)} <span style={{ color: s.hex }}>{t(`hiw.mob.${s.key}.accent`)}</span>
            </h3>
            <p className="mt-3 text-[12.5px] leading-[1.5]" style={{ color: 'var(--wp-text-dim)' }}>{t(`hiw.mob.${s.key}.body`)}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ============================================================================
   Top scroll progress + sticky header
============================================================================ */

function ScrollProgressBar({ accent }: { accent: MotionValue<string> }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 130, damping: 22, restDelta: 0.001 });
  const bg = useTransform(accent, (c) => `linear-gradient(90deg, ${c}, var(--wp-accent-2), ${c})`);
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left"
      style={{
        scaleX,
        background: bg,
        boxShadow: useTransform(accent, (c) => `0 0 12px color-mix(in srgb, ${c} 60%, transparent)`),
      }}
    />
  );
}

function StickyHeader({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const t = useT();
  const { scrollY } = useScroll();
  const filterStr = useTransform(scrollY, [0, 200], ['blur(12px)', 'blur(24px)']);
  const bgStr = useTransform(
    scrollY,
    [0, 200],
    [
      'color-mix(in srgb, var(--wp-surface) 45%, transparent)',
      'color-mix(in srgb, var(--wp-surface) 78%, transparent)',
    ],
  );
  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-40"
      style={{
        background: bgStr,
        backdropFilter: filterStr,
        WebkitBackdropFilter: filterStr,
        borderBottom: '1px solid var(--wp-glass-border)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
        <Link
          to="/"
          className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium"
          style={{
            color: 'var(--wp-text-dim)',
            background: 'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
            border: '1px solid var(--wp-border)',
          }}
        >
          <ArrowLeft size={14} strokeWidth={2} className="transition-transform group-hover:-translate-x-0.5" />
          {t('hiw.nav.back')}
        </Link>
        <Link to="/" className="mx-auto flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2))',
              boxShadow: '0 0 14px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
            }}
          >
            <Sparkles size={14} color="#fff" strokeWidth={2.2} />
          </span>
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>
            WarmPulse
          </span>
          <span className="ml-2 hidden font-mono text-[10px] uppercase tracking-[0.18em] md:inline" style={{ color: 'var(--wp-text-faint)' }}>
            {t('hiw.nav.subtitle')}
          </span>
        </Link>
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </motion.header>
  );
}

/* ============================================================================
   ScrollVelocity speed lines — only visible when user scrolls fast
============================================================================ */

function SpeedLines() {
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smoothVel = useSpring(velocity, { stiffness: 200, damping: 40 });
  const opacity = useTransform(smoothVel, [-3000, -500, 0, 500, 3000], [0.5, 0, 0, 0, 0.5]);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ opacity }}
    >
      {[...Array(8)].map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-px w-[40vw]"
          style={{
            top: `${10 + i * 11}%`,
            left: `${(i * 17) % 60}%`,
            background:
              'linear-gradient(90deg, transparent, color-mix(in srgb, var(--wp-accent) 60%, transparent), transparent)',
          }}
          animate={{ x: ['-50%', '120%'] }}
          transition={{ duration: 0.8 + (i % 3) * 0.2, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </motion.div>
  );
}

/* ============================================================================
   Atmosphere — aurora that follows current step accent
============================================================================ */

function Atmosphere({ stepAccent }: { stepAccent: MotionValue<string> }) {
  const { scrollY } = useScroll();
  const auroraY = useTransform(scrollY, [0, 5000], [0, -260]);
  const bg1 = useTransform(stepAccent, (c) => `radial-gradient(circle, color-mix(in srgb, ${c} 24%, transparent) 0%, transparent 60%)`);

  return (
    <>
      {/* Aurora blob (color-shifting per step) */}
      <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ y: auroraY }}>
        <motion.div
          className="absolute -top-40 left-1/2 h-[840px] w-[1200px] -translate-x-1/2 rounded-full"
          style={{ background: bg1, filter: 'blur(120px)' }}
          animate={{ x: ['-50%', '-46%', '-54%', '-50%'] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      <div aria-hidden className="wp-grid-dots pointer-events-none fixed inset-0 z-0" />
      <div aria-hidden className="wp-grain pointer-events-none fixed inset-0 z-0" />
    </>
  );
}

/* ============================================================================
   Floating particles — color tinted per step
============================================================================ */

function FloatingGlyphs({ count = 14, color }: { count?: number; color: string }) {
  const glyphs = Array.from({ length: count }, (_, i) => ({
    left: (i * 173) % 100,
    delay: (i * 0.7) % 6,
    duration: 8 + (i % 5),
    size: 4 + (i % 4) * 2,
    id: i,
  }));
  return (
    <>
      {glyphs.map((g) => (
        <motion.span
          key={g.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${g.left}%`,
            bottom: '-5%',
            width: g.size,
            height: g.size,
            background: color,
            filter: 'blur(1.5px)',
            opacity: 0.4,
          }}
          animate={{ y: ['0%', '-1400%'], opacity: [0, 0.5, 0] }}
          transition={{ duration: g.duration, repeat: Infinity, delay: g.delay, ease: 'linear' }}
        />
      ))}
    </>
  );
}

/* ============================================================================
   Floating step indicator (bottom-right)
============================================================================ */

function FloatingStepIndicator({ panelIndex }: { panelIndex: MotionValue<number> }) {
  const t = useT();
  const [step, setStep] = useState(1);
  useEffect(() => {
    const u = panelIndex.on('change', (v) => {
      setStep(Math.max(1, Math.min(STEPS.length, Math.round(v) + 1)));
    });
    return () => u();
  }, [panelIndex]);
  const meta = STEPS[step - 1];
  // `step` is clamped to [1, STEPS.length], so `meta` is always defined at
  // runtime; this guard only narrows the type for noUncheckedIndexedAccess.
  if (!meta) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 hidden md:block">
      <div
        className="flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5"
        style={{
          background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
          backdropFilter: 'blur(20px) saturate(160%)',
          border: `1px solid color-mix(in srgb, ${meta.hex} 30%, var(--wp-glass-border))`,
          boxShadow: `0 8px 24px color-mix(in srgb, ${meta.hex} 18%, transparent)`,
          transition: 'border-color 300ms ease, box-shadow 300ms ease',
        }}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-bold tabular-nums"
          style={{
            background: `linear-gradient(135deg, ${meta.hex}, ${meta.hex2})`,
            color: '#fff',
            boxShadow: `0 0 14px color-mix(in srgb, ${meta.hex} 70%, transparent)`,
          }}
        >
          {step}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: 'var(--wp-text-faint)' }}>
            {step} / {STEPS.length}
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={meta.label}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="text-[12.5px] font-semibold"
              style={{ color: 'var(--wp-text)' }}
            >
              {t(`hiw.step.${meta.key}.label`)}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Vertical rail with per-step color dots
============================================================================ */

function VerticalRail({ panelIndex }: { panelIndex: MotionValue<number> }) {
  return (
    <div className="pointer-events-none fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
      <div className="flex flex-col items-center gap-1.5">
        {STEPS.map((s, i) => {
          const scale = useTransform(panelIndex, [i - 0.5, i, i + 0.5], [0.55, 1.6, 0.55]);
          const opacity = useTransform(panelIndex, [i - 0.6, i, i + 0.6], [0.3, 1, 0.3]);
          return (
            <div key={s.key} className="flex flex-col items-center">
              <motion.span style={{ scale, opacity }} className="block h-2 w-2 rounded-full">
                <span
                  className="block h-full w-full rounded-full"
                  style={{
                    background: s.hex,
                    boxShadow: `0 0 10px color-mix(in srgb, ${s.hex} 70%, transparent)`,
                  }}
                />
              </motion.span>
              {i < STEPS.length - 1 && (
                <span
                  className="h-7 w-px"
                  style={{
                    background:
                      'linear-gradient(to bottom, var(--wp-border-strong), transparent)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   Magnetic mouse-tilt wrapper — visual cards "lean" toward cursor
============================================================================ */

function MagneticCard({
  children,
  intensity = 8,
}: {
  children: React.ReactNode;
  intensity?: number;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-200, 200], [intensity, -intensity]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(x, [-200, 200], [-intensity, intensity]), {
    stiffness: 120,
    damping: 18,
  });
  return (
    <motion.div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left - r.width / 2);
        y.set(e.clientY - r.top - r.height / 2);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ rotateX, rotateY, transformPerspective: 1200, transformStyle: 'preserve-3d' }}
      className="h-full w-full"
    >
      {children}
    </motion.div>
  );
}

/* ============================================================================
   Background morphing step number — huge translucent digit behind each panel
============================================================================ */

function GiantStepNumber({ panelIndex }: { panelIndex: MotionValue<number> }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    const u = panelIndex.on('change', (v) => setN(Math.max(1, Math.min(STEPS.length, Math.round(v) + 1))));
    return () => u();
  }, [panelIndex]);
  // `n` is clamped to [1, STEPS.length], so this is always defined at runtime;
  // the guard only narrows the type for noUncheckedIndexedAccess.
  const stepMeta = STEPS[n - 1];
  if (!stepMeta) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-0 hidden items-center justify-center overflow-hidden md:flex">
      <AnimatePresence mode="wait">
        <motion.span
          key={n}
          initial={{ opacity: 0, scale: 0.85, filter: 'blur(20px)' }}
          animate={{ opacity: 0.06, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="select-none font-mono text-[26vh] font-black tabular-nums leading-none"
          style={{
            background: `linear-gradient(180deg, ${stepMeta.hex}, transparent 85%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextStroke: '1px color-mix(in srgb, var(--wp-text) 10%, transparent)',
          }}
        >
          0{n}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ============================================================================
   StepSection — sticky 100vh, owns its scroll progress, per-step accent
============================================================================ */

function StepSection({
  step,
  title,
  body,
  bullets,
  align = 'left',
  render,
}: {
  step: StepAccent;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  align?: 'left' | 'right';
  render: (progress: MotionValue<number>, accent: StepAccent) => React.ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  // Show only while section is sticky-pinned in viewport
  const opacity = useTransform(scrollYProgress, [0.18, 0.34, 0.66, 0.82], [0, 1, 1, 0]);
  const visualScale = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0.94, 1, 0.96]);
  const visualY = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [24, 0, -20]);

  const copyOrder = align === 'right' ? 'lg:order-2' : 'lg:order-1';
  const visualOrder = align === 'right' ? 'lg:order-1' : 'lg:order-2';

  return (
    <section ref={ref} className="relative" style={{ height: '170vh' }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden px-6 py-16">
        <motion.div style={{ opacity }} className="relative z-10 grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* COPY */}
          <div className={copyOrder}>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ duration: 0.5 }}
              className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: `color-mix(in srgb, ${step.hex} 14%, transparent)`,
                color: step.hex,
                border: `1px solid color-mix(in srgb, ${step.hex} 30%, transparent)`,
              }}
            >
              <motion.span
                animate={{ rotate: [0, 12, -8, 0] }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              >
                0{STEPS.findIndex((s) => s.key === step.key) + 1}
              </motion.span>
              · {t(`hiw.step.${step.key}.label`)}
            </motion.div>
            <h2
              className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[48px]"
              style={{ color: 'var(--wp-text)' }}
            >
              {title}
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-[1.6] md:text-[17px]" style={{ color: 'var(--wp-text-dim)' }}>
              {body}
            </p>
            <ul className="mt-5 space-y-2.5">
              {bullets.map((b, i) => (
                <motion.li
                  key={b}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ duration: 0.4, delay: 0.05 + i * 0.05 }}
                  className="flex items-start gap-2.5 text-[13px]"
                  style={{ color: 'var(--wp-text-dim)' }}
                >
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `color-mix(in srgb, ${step.hex} 20%, transparent)`,
                      color: step.hex,
                    }}
                  >
                    <CheckCircle2 size={10} strokeWidth={2.6} />
                  </span>
                  {b}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* VISUAL — sizes to its content, magnetic mouse-tilt + scale/lift */}
          <motion.div
            style={{ scale: visualScale, y: visualY }}
            className={`${visualOrder} mx-auto w-full max-w-[460px]`}
          >
            <MagneticCard intensity={6}>
              <div className="relative w-full">
                {/* Ambient soft glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-12 -z-20 rounded-full"
                  style={{
                    background: `radial-gradient(circle at center, color-mix(in srgb, ${step.hex} 22%, transparent), transparent 65%)`,
                    filter: 'blur(48px)',
                  }}
                />
                {/* Rotating bright-spot ring */}
                <motion.div
                  aria-hidden
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  className="pointer-events-none absolute -inset-16 -z-10 rounded-full"
                  style={{
                    background: `conic-gradient(from 0deg,
                      transparent 0deg,
                      color-mix(in srgb, ${step.hex} 42%, transparent) 50deg,
                      transparent 130deg,
                      color-mix(in srgb, ${step.hex2} 32%, transparent) 220deg,
                      transparent 320deg,
                      transparent 360deg)`,
                    filter: 'blur(38px)',
                    WebkitMask: 'radial-gradient(circle, transparent 38%, black 50%, black 80%, transparent 95%)',
                    mask: 'radial-gradient(circle, transparent 38%, black 50%, black 80%, transparent 95%)',
                  }}
                />
                {/* Counter-rotating thin highlight */}
                <motion.div
                  aria-hidden
                  animate={{ rotate: -360 }}
                  transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
                  className="pointer-events-none absolute -inset-10 -z-10 rounded-full"
                  style={{
                    background: `conic-gradient(from 90deg,
                      transparent 0deg,
                      color-mix(in srgb, ${step.hex2} 60%, transparent) 8deg,
                      transparent 35deg,
                      transparent 360deg)`,
                    filter: 'blur(8px)',
                    WebkitMask: 'radial-gradient(circle, transparent 48%, black 52%, black 56%, transparent 60%)',
                    mask: 'radial-gradient(circle, transparent 48%, black 52%, black 56%, transparent 60%)',
                  }}
                />
                {render(scrollYProgress, step)}
              </div>
            </MagneticCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ============================================================================
   Step-tinted glass shell — used inside each visual
============================================================================ */

function TintedGlass({
  accent,
  className = '',
  children,
}: {
  accent: StepAccent;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background: `color-mix(in srgb, var(--wp-surface) 70%, transparent)`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: `1px solid color-mix(in srgb, ${accent.hex} 26%, var(--wp-glass-border))`,
        boxShadow: `0 24px 60px color-mix(in srgb, ${accent.hex} 18%, transparent), 0 4px 12px color-mix(in srgb, ${accent.hex} 10%, transparent), inset 0 1px 0 color-mix(in srgb, ${accent.hex} 16%, transparent)`,
      }}
    >
      {/* top hairline glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent.hex}, transparent)`,
          opacity: 0.6,
        }}
      />
      {children}
    </div>
  );
}

/* ============================================================================
   VISUALS — each panel uses its accent
============================================================================ */

function VisualConnect({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const t = useT();
  const cursorX = useTransform(progress, [0.2, 0.45, 0.55, 0.85], ['62%', '32%', '32%', '32%']);
  const cursorY = useTransform(progress, [0.2, 0.45, 0.55, 0.85], ['64%', '34%', '34%', '34%']);
  const clickScale = useTransform(progress, [0.42, 0.5, 0.58], [1, 0.86, 1]);
  const tileGlow = useTransform(progress, [0.42, 0.6, 0.85], [0, 1, 1]);
  const ringBox = useTransform(tileGlow, (g) =>
    `0 0 ${22 + g * 18}px color-mix(in srgb, ${accent.hex} ${20 + g * 30}%, transparent)`,
  );
  const ringBorder = useTransform(tileGlow, (g) =>
    g > 0.5
      ? `color-mix(in srgb, ${accent.hex} 60%, transparent)`
      : 'var(--wp-border)',
  );

  return (
    <TintedGlass accent={accent} className="w-full p-5">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>
        {t('hiw.vc.header')}
      </div>
      <div className="mb-4 text-[17px] font-semibold" style={{ color: 'var(--wp-text)' }}>
        {t('hiw.vc.pickProvider')}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { name: 'Gmail', sub: t('hiw.vc.gmail.sub'), color: '#ea4335', selected: true },
          { name: 'Outlook', sub: 'Microsoft OAuth', color: '#F26522' },
          { name: 'Yahoo', sub: 'OAuth', color: '#F26522' },
          { name: 'Other', sub: 'SMTP / IMAP', color: 'var(--wp-text-dim)' },
        ].map((tile, i) => (
          <motion.div
            key={tile.name}
            style={
              tile.selected
                ? { scale: clickScale, boxShadow: ringBox, borderColor: ringBorder, borderWidth: '1px', borderStyle: 'solid' }
                : { borderColor: 'var(--wp-border)', borderWidth: '1px', borderStyle: 'solid' }
            }
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: '-20%' }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
            className="rounded-xl bg-[var(--wp-surface-2)] p-3"
            {...(tile.selected ? {} : { whileHover: { y: -2 } })}
          >
            <span
              className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-md"
              style={{ background: `color-mix(in srgb, ${tile.color} 16%, transparent)`, color: tile.color }}
            >
              <Mail size={13} strokeWidth={2.2} />
            </span>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>
              {tile.name}
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
              {tile.sub}
            </div>
            {tile.selected && (
              <motion.div style={{ opacity: tileGlow }} className="mt-2 flex items-center gap-1 font-mono text-[10px]">
                <CheckCircle2 size={11} style={{ color: accent.hex }} strokeWidth={2.4} />
                <span style={{ color: accent.hex }}>{t('hiw.vc.connected')}</span>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>

      <motion.span
        style={{ left: cursorX, top: cursorY }}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      >
        <motion.span
          animate={{ scale: [1, 0.9, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
          className="flex"
        >
          <MousePointer2
            size={22}
            fill={accent.hex}
            style={{
              color: accent.hex,
              filter: `drop-shadow(0 0 8px color-mix(in srgb, ${accent.hex} 70%, transparent))`,
            }}
          />
        </motion.span>
      </motion.span>

      <motion.div
        style={{ opacity: tileGlow }}
        className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2"
      >
        <div
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: `color-mix(in srgb, ${accent.hex} 12%, transparent)`,
            color: accent.hex,
            border: `1px solid color-mix(in srgb, ${accent.hex} 22%, transparent)`,
          }}
        >
          <CheckCircle2 size={12} strokeWidth={2.4} />
          <span className="text-[11px]">{t('hiw.vc.tokenMsg')}</span>
        </div>
      </motion.div>
    </TintedGlass>
  );
}

function VisualRamp({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const t = useT();
  const ladder = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    let cap = 5;
    if (day >= 4 && day <= 7) cap = 10;
    else if (day >= 8 && day <= 14) cap = 20;
    else if (day >= 15 && day <= 21) cap = 35;
    else if (day >= 22 && day <= 28) cap = 50;
    else if (day >= 29) cap = 75;
    return { day, cap };
  });
  const cursor = useTransform(progress, [0.15, 0.85], [1, 30]);
  const cursorPct = useTransform(cursor, (v) => `${((v - 1) / 29) * 100}%`);
  const dayLabel = useTransform(cursor, (v) => `Day ${Math.max(1, Math.min(30, Math.round(v)))}`);
  const capLabel = useTransform(cursor, (v) => {
    const d = Math.max(1, Math.min(30, Math.round(v)));
    // `d` is clamped to [1, 30] and `ladder` has exactly 30 entries, so the
    // lookup is always defined; the `?? 5` (day-1 cap) only satisfies the type
    // checker under noUncheckedIndexedAccess and is unreachable at runtime.
    return `${ladder[d - 1]?.cap ?? 5} sends`;
  });
  return (
    <TintedGlass accent={accent} className="w-full p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>
            {t('hiw.vr.header')}
          </div>
          <motion.div className="font-mono text-[26px] font-bold tabular-nums" style={{ color: accent.hex }}>
            {dayLabel}
          </motion.div>
        </div>
        <motion.div
          className="rounded-lg px-3 py-1.5 font-mono text-[12px] font-semibold"
          style={{
            background: `color-mix(in srgb, ${accent.hex} 14%, transparent)`,
            color: accent.hex,
            border: `1px solid color-mix(in srgb, ${accent.hex} 30%, transparent)`,
          }}
        >
          {capLabel}
        </motion.div>
      </div>
      <div className="relative h-[190px]">
        <motion.div
          className="absolute top-0 z-10 h-full w-px"
          style={{
            left: cursorPct,
            background: accent.hex,
            boxShadow: `0 0 14px ${accent.hex}`,
          }}
        >
          <motion.span
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full"
            style={{ background: accent.hex, boxShadow: `0 0 12px ${accent.hex}` }}
          />
        </motion.div>
        <div className="flex h-full items-end gap-[3px]">
          {ladder.map((d) => {
            const lit = useTransform(cursor, (v) => (d.day <= v ? 1 : 0.18));
            return (
              <motion.div
                key={d.day}
                className="flex-1 origin-bottom rounded-t-sm"
                style={{
                  height: `${(d.cap / 75) * 100}%`,
                  background: `linear-gradient(180deg, ${accent.hex}, color-mix(in srgb, ${accent.hex2} 50%, transparent))`,
                  opacity: lit,
                }}
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: false, margin: '-25%' }}
                transition={{ duration: 0.5, delay: d.day * 0.012 }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1 font-mono text-[8.5px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>
        {[
          { l: 'D1–3', v: '5/d' },
          { l: 'D4–7', v: '10/d' },
          { l: 'D8–14', v: '20/d' },
          { l: 'D15–21', v: '35/d' },
          { l: 'D22–28', v: '50/d' },
          { l: 'D29+', v: 'target' },
        ].map((s) => (
          <div key={s.l} className="text-center">
            <div>{s.l}</div>
            <div style={{ color: accent.hex }}>{s.v}</div>
          </div>
        ))}
      </div>
    </TintedGlass>
  );
}

function VisualEngage({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const orbitRotate = useTransform(progress, [0, 1], [0, 60]);
  const NODES = [
    { angle: 0, label: 'peer-2841@outlook' },
    { angle: 51, label: 'peer-1003@gmail' },
    { angle: 102, label: 'peer-0521@outlook' },
    { angle: 153, label: 'peer-2294@yahoo' },
    { angle: 204, label: 'peer-0917@gmail' },
    { angle: 256, label: 'peer-2233@gmail' },
    { angle: 307, label: 'peer-1184@outlook' },
  ];
  return (
    <div className="relative w-full">
      <FloatingGlyphs count={14} color={`color-mix(in srgb, ${accent.hex} 70%, transparent)`} />
      <TintedGlass accent={accent} className="flex w-full items-center justify-center p-4">
        <div className="relative aspect-square w-full max-w-[380px]">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="absolute rounded-full"
              style={{
                top: `${i * 7}%`,
                left: `${i * 7}%`,
                right: `${i * 7}%`,
                bottom: `${i * 7}%`,
                border: `1px dashed color-mix(in srgb, ${accent.hex} 30%, var(--wp-border-strong))`,
                opacity: 0.45 - i * 0.1,
              }}
            />
          ))}

          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${accent.hex}, ${accent.hex2})`,
                boxShadow: `0 0 60px color-mix(in srgb, ${accent.hex} 55%, transparent)`,
              }}
            >
              <Sparkles size={24} color="#fff" strokeWidth={2} />
            </div>
            <motion.span
              animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${accent.hex}, ${accent.hex2})` }}
            />
          </motion.div>

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            {NODES.map((n, i) => {
              const rad = (n.angle * Math.PI) / 180;
              const x = 50 + Math.cos(rad) * 38;
              const y = 50 + Math.sin(rad) * 38;
              return (
                <g key={i}>
                  <line
                    x1="50"
                    y1="50"
                    x2={x}
                    y2={y}
                    stroke={accent.hex}
                    strokeOpacity="0.22"
                    strokeWidth="0.25"
                    strokeDasharray="0.6 0.8"
                  />
                  <motion.circle
                    r="0.7"
                    fill={accent.hex}
                    animate={{ cx: [50, x, 50], cy: [50, y, 50], opacity: [0, 1, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
                  />
                </g>
              );
            })}
          </svg>

          <motion.div style={{ rotate: orbitRotate }} className="absolute inset-0">
            {NODES.map((n, i) => {
              const rad = (n.angle * Math.PI) / 180;
              const x = 50 + Math.cos(rad) * 38;
              const y = 50 + Math.sin(rad) * 38;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: false, margin: '-20%' }}
                  transition={{ duration: 0.45, delay: 0.2 + i * 0.06 }}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <motion.div
                    style={{
                      rotate: useTransform(orbitRotate, (v) => -v),
                      background: 'color-mix(in srgb, var(--wp-surface) 60%, transparent)',
                      backdropFilter: 'blur(12px)',
                      border: `1px solid color-mix(in srgb, ${accent.hex} 30%, transparent)`,
                    }}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5"
                  >
                    <Mail size={10} style={{ color: accent.hex }} strokeWidth={2.2} />
                    <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text)' }}>
                      {n.label}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </TintedGlass>
    </div>
  );
}

function VisualAuthor({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const t = useT();
  const text =
    "Wanted to follow up on what we discussed last week about the Q2 launch plan — did the revised numbers from the deck make sense, or is it worth jumping on a quick call? No urgency.";
  const chars = useTransform(progress, [0.2, 0.85], [0, text.length]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const u = chars.on('change', (v) => setShown(Math.floor(v)));
    return () => u();
  }, [chars]);
  return (
    <TintedGlass accent={accent} className="w-full">
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--wp-border)' }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff5f57' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#febc2e' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28c840' }} />
        <span className="ml-3 font-mono text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>
          llm-content-gen · stream
        </span>
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="ml-auto flex items-center gap-1.5 font-mono text-[10px]"
          style={{ color: accent.hex }}
        >
          <Wand2 size={11} strokeWidth={2} />
          {t('hiw.va.generating')}
        </motion.span>
      </div>
      <div className="p-5">
        <div className="mb-3 space-y-0.5 font-mono text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>
          <div>From: <span style={{ color: 'var(--wp-text)' }}>alex@lumen-labs.com</span></div>
          <div>To:   <span style={{ color: 'var(--wp-text)' }}>peer-2841@outlook.com</span></div>
          <div>Re:   <span style={{ color: 'var(--wp-text)' }}>Q2 launch plan check-in</span></div>
        </div>
        <p className="min-h-[140px] text-[13px] leading-[1.6]" style={{ color: 'var(--wp-text-dim)' }}>
          Hey,
          <br />
          <br />
          {text.slice(0, shown)}
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-block w-[2px] align-middle"
            style={{ background: accent.hex, height: '1em', marginLeft: 2 }}
          />
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--wp-border)' }}>
          {['Gemini Pro', 'Claude Sonnet', 'Templates'].map((p, i) => (
            <span
              key={p}
              className="rounded-full px-2 py-0.5 font-mono text-[10px]"
              style={{
                background: i === 0 ? `color-mix(in srgb, ${accent.hex} 16%, transparent)` : 'var(--wp-surface-2)',
                color: i === 0 ? accent.hex : 'var(--wp-text-dim)',
                border:
                  i === 0
                    ? `1px solid color-mix(in srgb, ${accent.hex} 30%, transparent)`
                    : '1px solid var(--wp-border)',
              }}
            >
              {i === 0 ? '✓ ' : ''}{p}
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
            ~340 ms
          </span>
        </div>
      </div>
    </TintedGlass>
  );
}

function VisualMonitor({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const t = useT();
  const fill = useTransform(progress, [0.2, 0.85], [0, 1]);
  const checks = [
    { label: 'SPF', target: 100 },
    { label: 'DKIM', target: 100 },
    { label: 'DMARC', target: 96 },
    { label: 'Bounce rate', target: 99 },
    { label: 'Blacklists', target: 100 },
  ];
  return (
    <TintedGlass accent={accent} className="w-full p-5">
      <div className="flex items-center gap-2">
        <Radar size={14} strokeWidth={2} style={{ color: accent.hex }} />
        <div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>
          {t('hiw.vm.header')}
        </div>
      </div>
      <div
        className="relative mt-3 h-[140px] w-full overflow-hidden rounded-xl"
        style={{ background: 'var(--wp-surface-2)', border: '1px solid var(--wp-border)' }}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
          {[20, 40, 60, 80].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--wp-border)" strokeWidth="0.4" />
          ))}
          <line x1="0" y1="100" x2="200" y2="100" stroke="var(--wp-border)" strokeWidth="0.4" />
          <motion.path
            d="M 100 100 L 200 100 A 100 100 0 0 0 196 80 Z"
            fill={`url(#sweep-${accent.key})`}
            style={{ transformOrigin: '100px 100px' }}
            animate={{ rotate: -180 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          />
          <defs>
            <linearGradient id={`sweep-${accent.key}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent.hex} stopOpacity="0.55" />
              <stop offset="100%" stopColor={accent.hex} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[{ x: 140, y: 70 }, { x: 60, y: 80 }, { x: 165, y: 95 }, { x: 90, y: 65 }].map((b, i) => (
            <motion.circle
              key={i}
              cx={b.x}
              cy={b.y}
              r="1"
              fill={accent.hex2}
              animate={{ opacity: [0, 1, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, delay: i * 1, ease: 'easeOut' }}
            />
          ))}
        </svg>
      </div>
      <div className="mt-4 space-y-2.5">
        {checks.map((c, i) => {
          const v = useTransform(fill, (f) => Math.round(f * c.target));
          const w = useTransform(fill, (f) => `${f * c.target}%`);
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, x: 8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, margin: '-20%' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span style={{ color: 'var(--wp-text-dim)' }}>{c.label}</span>
                <motion.span className="font-mono tabular-nums" style={{ color: c.target >= 99 ? accent.hex : 'var(--wp-warning)' }}>
                  <motion.span>{useTransform(v, (n) => `${n}%`)}</motion.span>
                </motion.span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--wp-surface-2)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${accent.hex}, ${accent.hex2})`,
                    width: w,
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </TintedGlass>
  );
}

function VisualResult({ progress, accent }: { progress: MotionValue<number>; accent: StepAccent }) {
  const t = useT();
  const score = useTransform(progress, [0.15, 0.85], [0, 92]);
  const r = 80;
  const c = 2 * Math.PI * r;
  const offset = useTransform(score, (v) => c - (v / 100) * c);
  return (
    <div className="relative w-full">
      <FloatingGlyphs count={20} color={`color-mix(in srgb, ${accent.hex} 70%, transparent)`} />
      <TintedGlass accent={accent} className="flex w-full flex-col items-center justify-center p-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-20"
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, ${accent.hex} 32%, transparent), transparent 60%)`,
            filter: 'blur(60px)',
          }}
        />
        <div className="relative">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--wp-text-faint)' }}>
            {t('hiw.vres.after30')}
          </div>
          <div className="relative mx-auto h-[180px] w-[180px]">
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
              <defs>
                <linearGradient id={`gauge-${accent.key}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={accent.hex} />
                  <stop offset="100%" stopColor={accent.hex2} />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r={r} fill="none" stroke="var(--wp-border-strong)" strokeWidth="10" opacity="0.4" />
              <motion.circle
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke={`url(#gauge-${accent.key})`}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={c}
                style={{
                  strokeDashoffset: offset,
                  filter: `drop-shadow(0 0 10px color-mix(in srgb, ${accent.hex} 65%, transparent))`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span className="font-mono text-[44px] font-bold tabular-nums leading-none" style={{ color: 'var(--wp-text)' }}>
                <motion.span>{useTransform(score, (v) => Math.round(v).toString())}</motion.span>
              </motion.span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-faint)' }}>
                {t('hiw.vres.warmth')}
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: t('hiw.vres.inbox'), value: '94.2%', icon: Inbox },
              { label: t('hiw.vres.bounce'), value: '0.4%', icon: MailCheck },
              { label: t('hiw.vres.spam'), value: '1.1%', icon: ShieldCheck },
            ].map((m) => (
              <motion.div
                key={m.label}
                whileHover={{ y: -2 }}
                className="rounded-xl p-2.5"
                style={{ background: 'var(--wp-surface-2)', border: '1px solid var(--wp-border)' }}
              >
                <m.icon size={12} strokeWidth={2} style={{ color: accent.hex }} />
                <div className="mt-1 font-mono text-[16px] font-bold tabular-nums" style={{ color: 'var(--wp-text)' }}>
                  {m.value}
                </div>
                <div className="font-mono text-[8.5px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>
                  {m.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </TintedGlass>
    </div>
  );
}

/* ============================================================================
   Page
============================================================================ */

export function HowItWorksPage() {
  const t = useT();
  const [theme, setTheme] = useTheme();
  const journeyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: journeyProgress } = useScroll({
    target: journeyRef,
    offset: ['start start', 'end end'],
  });
  const panelIndex = useTransform(journeyProgress, [0, 1], [0, STEPS.length - 1]);

  // Interpolated accent color across step boundaries.
  const stepAccent = useTransform(panelIndex, STEPS.map((_, i) => i), STEPS.map((s) => s.hex));

  // STEPS is a fixed 6-entry constant, so every element is defined at runtime;
  // this destructure + guard only narrows the types for noUncheckedIndexedAccess.
  const [s0, s1, s2, s3, s4, s5] = STEPS;
  if (!s0 || !s1 || !s2 || !s3 || !s4 || !s5) return null;

  return (
    <div
      className="wp-hero relative w-full overflow-x-hidden"
      style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)' }}
    >
      <ScrollProgressBar accent={stepAccent} />
      <Atmosphere stepAccent={stepAccent} />
      <SpeedLines />
      <StickyHeader theme={theme} setTheme={setTheme} />
      <VerticalRail panelIndex={panelIndex} />
      <FloatingStepIndicator panelIndex={panelIndex} />

      {/* ---------- Intro ---------- */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-8 pt-28 text-center md:pt-32">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-block font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-accent)' }}
        >
          {t('hiw.intro.eyebrow')}
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="mt-4 text-[40px] font-bold leading-[1.02] tracking-[-0.035em] md:text-[60px]"
        >
          {t('hiw.intro.h1.line1')}<br />
          <span className="wp-headline-grad">{t('hiw.intro.h1.line2')}</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14 }}
          className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.6] md:text-[17px]"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          {t('hiw.intro.subtitle')}
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-7 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {t('hiw.intro.scroll')}
          <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            ↓
          </motion.span>
        </motion.div>
      </section>

      {/* ---------- Steps (mobile <640px): immersive stack ---------- */}
      <MobileStepsImmersive />

      {/* ---------- Steps (desktop ≥640px): sticky-scroll journey ---------- */}
      <div ref={journeyRef} className="relative hidden overflow-hidden sm:block">
        <GiantStepNumber panelIndex={panelIndex} />
        <StepSection
          step={s0}
          title={<>{t('hiw.s0.title.main')} <span style={{ background: `linear-gradient(90deg, ${s0.hex}, ${s0.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s0.title.accent')}</span></>}
          body={t('hiw.s0.body')}
          bullets={[
            t('hiw.s0.b1'),
            t('hiw.s0.b2'),
            t('hiw.s0.b3'),
          ]}
          align="left"
          render={(p, a) => <VisualConnect progress={p} accent={a} />}
        />
        <StepSection
          step={s1}
          title={<>{t('hiw.s1.title.main')} <span style={{ background: `linear-gradient(90deg, ${s1.hex}, ${s1.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s1.title.accent')}</span></>}
          body={t('hiw.s1.body')}
          bullets={[
            t('hiw.s1.b1'),
            t('hiw.s1.b2'),
            t('hiw.s1.b3'),
          ]}
          align="right"
          render={(p, a) => <VisualRamp progress={p} accent={a} />}
        />
        <StepSection
          step={s2}
          title={<>{t('hiw.s2.title.main')} <span style={{ background: `linear-gradient(90deg, ${s2.hex}, ${s2.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s2.title.accent')}</span></>}
          body={t('hiw.s2.body')}
          bullets={[
            t('hiw.s2.b1'),
            t('hiw.s2.b2'),
            t('hiw.s2.b3'),
          ]}
          align="left"
          render={(p, a) => <VisualEngage progress={p} accent={a} />}
        />
        <StepSection
          step={s3}
          title={<>{t('hiw.s3.title.main')} <span style={{ background: `linear-gradient(90deg, ${s3.hex}, ${s3.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s3.title.accent')}</span></>}
          body={t('hiw.s3.body')}
          bullets={[
            t('hiw.s3.b1'),
            t('hiw.s3.b2'),
            t('hiw.s3.b3'),
          ]}
          align="right"
          render={(p, a) => <VisualAuthor progress={p} accent={a} />}
        />
        <StepSection
          step={s4}
          title={<>{t('hiw.s4.title.main')} <span style={{ background: `linear-gradient(90deg, ${s4.hex}, ${s4.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s4.title.accent')}</span></>}
          body={t('hiw.s4.body')}
          bullets={[
            t('hiw.s4.b1'),
            t('hiw.s4.b2'),
            t('hiw.s4.b3'),
          ]}
          align="left"
          render={(p, a) => <VisualMonitor progress={p} accent={a} />}
        />
        <StepSection
          step={s5}
          title={<>{t('hiw.s5.title.main')} <span style={{ background: `linear-gradient(90deg, ${s5.hex}, ${s5.hex2})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{t('hiw.s5.title.accent')}</span></>}
          body={t('hiw.s5.body')}
          bullets={[
            t('hiw.s5.b1'),
            t('hiw.s5.b2'),
            t('hiw.s5.b3'),
          ]}
          align="right"
          render={(p, a) => <VisualResult progress={p} accent={a} />}
        />
      </div>

      {/* ---------- Outro CTA ---------- */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl px-6 py-10 md:px-12"
          style={{
            background: 'color-mix(in srgb, var(--wp-surface) 55%, transparent)',
            backdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid var(--wp-glass-border)',
            boxShadow: 'var(--wp-glass-shadow)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-24"
            style={{
              background:
                'radial-gradient(ellipse at center, color-mix(in srgb, var(--wp-accent) 22%, transparent) 0%, transparent 60%)',
              filter: 'blur(60px)',
            }}
          />
          <div className="relative">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--wp-accent)' }}>
              {t('hiw.outro.eyebrow')}
            </span>
            <h2 className="mt-2 text-[30px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[44px]" style={{ color: 'var(--wp-text)' }}>
              {t('hiw.outro.h2.line1')}<br />
              <span className="wp-headline-grad">{t('hiw.outro.h2.line2')}</span>
            </h2>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="group inline-flex h-11 items-center gap-2 rounded-full px-6 text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                  color: '#fff',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 32px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
                }}
              >
                {t('hiw.outro.cta')}
                <ArrowRight size={15} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/"
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium"
                style={{
                  background: 'var(--wp-surface-2)',
                  color: 'var(--wp-text)',
                  border: '1px solid var(--wp-border-strong)',
                }}
              >
                <ArrowLeft size={13} strokeWidth={1.8} />
                {t('hiw.outro.back')}
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
