import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { usePublicPlans } from '@/features/plans/publicPlans';
import { APP_APK_URL } from '@/lib/appDownload';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Crown,
  FileSpreadsheet,
  GripVertical,
  Handshake,
  Inbox,
  Kanban,
  Mail,
  MailOpen,
  MessageSquare,
  Moon,
  PlayCircle,
  Plus,
  Radar,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import './hero-theme.css';
import { CountrySwitcher } from '@/components/CountrySwitcher';
import { useT } from '@/lib/i18n';
import {
  FinalCTA,
  PeerNetworkSection,
  PricingSection,
  ProductSection,
} from './HeroSections';

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
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
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
                layoutId="theme-thumb"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--wp-accent) 22%, transparent)',
                }}
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
   Sticky glass nav — compacts as you scroll past the hero
============================================================================ */

function GlassNav({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const t = useT();
  const { scrollY } = useScroll();
  // Compaction is a single boolean toggled at a scroll threshold and smoothed
  // by a CSS transition — NOT a per-frame interpolation. Animating
  // backdrop-filter / width / padding on every scroll frame re-rendered the
  // blur and reflowed the bar each frame, a major scroll-jank source. The blur
  // is now constant; only a few props cross-fade once at the threshold.
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => {
    const next = v > 80;
    setScrolled((cur) => (cur === next ? cur : next));
  });

  return (
    <motion.div
      className="fixed left-1/2 z-40 -translate-x-1/2"
      style={{
        top: scrolled ? 12 : 16,
        width: scrolled ? '92%' : '100%',
        transition: 'top 0.35s ease, width 0.35s ease',
      }}
    >
      <motion.nav
        style={{
          background: `color-mix(in srgb, var(--wp-surface) ${scrolled ? 75 : 35}%, transparent)`,
          backdropFilter: 'blur(16px) saturate(150%)',
          WebkitBackdropFilter: 'blur(16px) saturate(150%)',
          borderRadius: scrolled ? 999 : 16,
          border: '1px solid var(--wp-glass-border)',
          boxShadow: 'var(--wp-glass-shadow)',
          transition: 'background 0.35s ease, border-radius 0.35s ease',
        }}
        className="mx-auto flex h-14 max-w-6xl items-center px-3 sm:px-6"
      >
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{
              background:
                'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2))',
              boxShadow: '0 0 16px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
            }}
          >
            <Sparkles size={16} color="#fff" strokeWidth={2.2} />
          </span>
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: 'var(--wp-text)' }}
          >
            WarmPulse
          </span>
        </Link>

        {/* Center links */}
        <div className="ml-10 hidden items-center gap-7 md:flex">
          {[
            { key: 'landing.nav.product', href: '#product' },
            { key: 'landing.nav.peerNetwork', href: '#peer-network' },
            { key: 'nav.pricing', href: '#pricing' },
          ].map(({ key, href }) => (
            <a
              key={key}
              href={href}
              className="text-[13px] font-medium transition-colors hover:opacity-100"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              {t(key)}
            </a>
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="block">
            <CountrySwitcher />
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <Link
            to="/login"
            className="hidden text-[13px] font-medium md:inline-block"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            {t('nav.signin')}
          </Link>
          <Link
            to="/signup"
            className="group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold sm:px-4"
            style={{
              background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
              color: '#fff',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 20px color-mix(in srgb, var(--wp-accent) 35%, transparent)',
            }}
          >
            {t('nav.startFree')}
            <ArrowRight size={14} strokeWidth={2.2} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.nav>
    </motion.div>
  );
}

/* ============================================================================
   Atmosphere — parallax aurora + grid + grain
============================================================================ */

function Atmosphere() {
  // Static ambient layer. These aurora blobs previously ran infinite position
  // keyframes AND scroll-parallax — every move forces the browser to re-render
  // their 100–120px blur, which thrashed the compositor on every animation
  // frame + scroll tick (a major source of the "scattering / can't scroll
  // smoothly" jank). A static blur renders once and then composites for free.
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute -top-40 left-1/2 h-[800px] w-[1100px] -translate-x-1/2 rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) calc(var(--wp-aurora-1-alpha) * 100%), transparent) 0%, transparent 60%)',
            filter: 'blur(120px)',
          }}
        />
        <div
          className="absolute right-[-160px] top-[100px] h-[520px] w-[520px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--wp-accent-2) calc(var(--wp-aurora-2-alpha) * 100%), transparent) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />
        <div
          className="absolute -bottom-32 left-[-140px] h-[460px] w-[460px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) calc(var(--wp-aurora-2-alpha) * 100%), transparent) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />
      </div>

      <div
        aria-hidden
        className="wp-grid-dots pointer-events-none fixed inset-0 z-0"
      />
      <div aria-hidden className="wp-grain pointer-events-none fixed inset-0 z-0" />
      <div
        aria-hidden
        className="wp-scan pointer-events-none fixed inset-x-0 z-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--wp-accent), transparent)',
          opacity: 0.35,
        }}
      />
    </>
  );
}

/* ============================================================================
   Animated number — counts up when in view
============================================================================ */

function CountUp({
  to,
  duration = 1500,
  format = (n) => n.toLocaleString(),
}: {
  to: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return <span ref={ref}>{format(val)}</span>;
}

/* ============================================================================
   Live-activity floating cards
============================================================================ */

/* ============================================================================
   Plan-tier carousel meta — Starter / Pro / Pro Plus / Agency
   Each tier gets a DISTINCT preview component (see below). The meta below
   just drives the pill tabs / badge / which preview body to mount.

   Visibility is filtered at runtime against GET /api/plans (active+public),
   so an admin un-publishing a tier removes it from the carousel — see
   PlanTiersCarousel's `visibleTiers`. The meta array stays the full set.
============================================================================ */

type TierKey = 'starter' | 'pro' | 'pro_plus' | 'agency';

type PlanTier = {
  key: TierKey;
  pill: string;
  badgeLabel: string;
  badgeStyle: 'plain' | 'accent' | 'gradient';
};

const PLAN_TIERS: PlanTier[] = [
  { key: 'starter', pill: 'Starter', badgeLabel: 'STARTER', badgeStyle: 'plain' },
  { key: 'pro', pill: 'Pro', badgeLabel: 'PRO', badgeStyle: 'accent' },
  { key: 'pro_plus', pill: 'Pro Plus', badgeLabel: 'PRO PLUS', badgeStyle: 'gradient' },
  { key: 'agency', pill: 'Agency', badgeLabel: 'AGENCY', badgeStyle: 'gradient' },
];

/* ============================================================================
   Tier-specific badge — pill-shaped, distinct per tier
============================================================================ */

function TierBadge({ tier }: { tier: PlanTier }) {
  const baseStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 999,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: '1px solid transparent',
  };

  if (tier.badgeStyle === 'plain') {
    return (
      <span
        style={{
          ...baseStyle,
          background: 'color-mix(in srgb, var(--wp-accent) 6%, transparent)',
          border: '1px solid color-mix(in srgb, var(--wp-accent) 45%, transparent)',
          color: 'var(--wp-accent)',
        }}
      >
        {tier.badgeLabel}
      </span>
    );
  }
  if (tier.badgeStyle === 'accent') {
    return (
      <span
        style={{
          ...baseStyle,
          background:
            'color-mix(in srgb, var(--wp-accent) 22%, transparent)',
          border:
            '1px solid color-mix(in srgb, var(--wp-accent) 55%, transparent)',
          color: 'var(--wp-accent)',
        }}
      >
        {tier.badgeLabel}
      </span>
    );
  }
  // gradient
  return (
    <span
      style={{
        ...baseStyle,
        background:
          'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2))',
        color: '#fff',
        boxShadow:
          '0 0 16px color-mix(in srgb, var(--wp-accent) 40%, transparent)',
      }}
    >
      <Sparkles size={10} strokeWidth={2.4} />
      {tier.badgeLabel}
    </span>
  );
}

/* ============================================================================
   The tier dashboard body — switches per-tier so each tier shows a recognisable
   mini-preview of its actual production dashboard.

     starter   → <StarterPreview />   S1 Focus Card  (gauge + 4 corner KPIs)
     pro       → <ProPreview />       N1 Analytics cockpit (5 KPI band + combo)
     pro_plus  → <ProPlusPreview />   N4 Console (master/detail)
     agency    → <AgencyPreview />    D3 Tiered constellation (3 concentric rings)

   Each preview fits into ~880×520 of the hero glass card. Numbers / palettes
   are mirrored from the real dashboards so the previews are recognisable.
============================================================================ */

function TierDashboard({ tier }: { tier: PlanTier }) {
  return (
    <>
      {tier.key === 'starter' && <StarterPreview tier={tier} />}
      {tier.key === 'pro' && <ProPreview tier={tier} />}
      {tier.key === 'pro_plus' && <ProPlusPreview tier={tier} />}
      {tier.key === 'agency' && <AgencyPreview tier={tier} />}
    </>
  );
}

/* ============================================================================
   Shared preview chrome — every preview gets the same outer header so they
   feel like they belong to one product, even though the body layout differs
   wildly per tier.
============================================================================ */

function PreviewShell({
  tier,
  title,
  subtitle,
  ambient,
  children,
}: {
  tier: PlanTier;
  title: string;
  subtitle: string;
  ambient: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative"
      style={{ minHeight: 520 }}
    >
      {/* per-tier ambient wash inside the glass card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: ambient }}
      />
      <div className="relative px-5 pb-5 pt-4">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {subtitle}
            </div>
            <div
              className="mt-0.5 text-[18px] font-semibold tracking-tight"
              style={{ color: 'var(--wp-text)' }}
            >
              {title}
            </div>
          </div>
          <TierBadge tier={tier} />
        </header>
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   STARTER PREVIEW — S1 Focus Card
   Big centred warmth gauge + 4 corner KPIs + DNS row + sparkline strip.
---------------------------------------------------------------------------- */

const STARTER_TREND = [60, 61, 60, 62, 64, 64, 65, 66, 68, 68, 70, 70, 71, 72, 71, 72, 73, 73, 74];

function StarterPreview({ tier }: { tier: PlanTier }) {
  const warmth = 74;
  const delta = 3;
  const surface = { background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' } as const;
  const inset = {
    background: 'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)',
    border: '1px solid var(--wp-border)',
  } as const;
  const pill = (tint: 'accent' | 'accent-2') => ({
    background: `color-mix(in srgb, var(--wp-${tint}) 10%, transparent)`,
    border: `1px solid color-mix(in srgb, var(--wp-${tint}) 30%, transparent)`,
    color: `var(--wp-${tint})`,
  });

  return (
    <PreviewShell
      tier={tier}
      subtitle="Dashboard / S1 Focus"
      title="alex@lumen-labs.com"
      ambient="radial-gradient(ellipse at center top, color-mix(in srgb, var(--wp-accent) 14%, transparent) 0%, transparent 65%)"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="rounded-2xl p-5"
        style={surface}
      >
        {/* provider + day pills */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold" style={pill('accent')}>
              <Mail size={10} strokeWidth={2.4} />
              Gmail
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold" style={pill('accent-2')}>
              <Calendar size={10} strokeWidth={2.4} />
              Day 12
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>
            Single mailbox
          </span>
        </div>

        {/* gauge grid: 4 corner KPIs around a centred gauge */}
        <div
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: '1fr auto 1fr', gridTemplateRows: 'auto auto' }}
        >
          <StarterKpi icon={<Send size={11} strokeWidth={2.4} />} label="Sent today" value="28" foot="of 30 target" delay={0.08} align="end" />
          <StarterGauge value={warmth} delta={delta} />
          <StarterKpi icon={<MailOpen size={11} strokeWidth={2.4} />} label="Opens" value="22" foot="79% open rate" delay={0.12} align="start" />
          <StarterKpi icon={<MessageSquare size={11} strokeWidth={2.4} />} label="Replies" value="9" foot="32% reply rate" delay={0.16} align="end" />
          <span aria-hidden />
          <StarterKpi icon={<ShieldCheck size={11} strokeWidth={2.4} />} label="Spam rescues" value="3" foot="Pulled from spam" delay={0.2} align="start" />
        </div>

        {/* 30-day sparkline strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.24, ease: 'easeOut' }}
          className="mt-4 rounded-xl p-3"
          style={inset}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>
              <TrendingUp size={11} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
              Warmth · last 30 days
            </span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--wp-success)' }}>+14 pts</span>
          </div>
          <StarterSparkline points={STARTER_TREND} />
        </motion.div>

        {/* DNS row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3, ease: 'easeOut' }}
          className="mt-3 flex items-center justify-between rounded-xl px-3 py-2.5"
          style={inset}
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>
            <Sparkles size={11} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
            DNS health
          </span>
          <div className="flex items-center gap-2.5">
            {(['SPF', 'DKIM', 'DMARC'] as const).map((rec, idx) => {
              const c = idx === 1 ? 'var(--wp-warning)' : 'var(--wp-success)';
              return (
                <span key={rec} className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold" style={{ color: c }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                  {rec}
                </span>
              );
            })}
          </div>
          <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>View health →</span>
        </motion.div>
      </motion.div>
    </PreviewShell>
  );
}

function StarterKpi({
  icon,
  label,
  value,
  foot,
  delay,
  align,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  delay: number;
  align: 'start' | 'end';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className={`flex flex-col gap-0.5 ${align === 'end' ? 'items-end text-right' : 'items-start text-left'}`}
    >
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        <span style={{ color: 'var(--wp-accent)' }}>{icon}</span>
        {label}
      </span>
      <span
        className="font-mono text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: 'var(--wp-text)' }}
      >
        {value}
      </span>
      <span className="text-[10px]" style={{ color: 'var(--wp-text-dim)' }}>{foot}</span>
    </motion.div>
  );
}

function StarterGauge({ value, delta }: { value: number; delta: number }) {
  // Conic-gradient gauge with 4 ticks (0/25/50/75) around the outside, big
  // centred number, delta pill underneath. Mirrors S1 Focus's gauge.
  const pct = Math.max(0, Math.min(100, value));
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.05, ease: 'easeOut' }}
      className="relative mx-auto"
      style={{ width: 168, height: 168 }}
    >
      {[0, 25, 50, 75].map((stop) => {
        const angle = stop * 3.6 - 90;
        const reached = stop <= pct;
        const tickColor = reached ? 'var(--wp-accent)' : 'var(--wp-border-strong)';
        const numColor = reached ? 'var(--wp-accent)' : 'var(--wp-text-faint)';
        return (
          <div
            key={stop}
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
          >
            <div
              style={{
                position: 'absolute', left: 0, top: -84, transform: 'translateX(-50%)',
                width: 6, height: 6, borderRadius: 999, background: tickColor,
                boxShadow: reached ? '0 0 6px color-mix(in srgb, var(--wp-accent) 80%, transparent)' : 'none',
              }}
            />
            <div
              style={{
                position: 'absolute', left: 0, top: -98,
                transform: `translateX(-50%) rotate(${-angle}deg)`,
                fontSize: 9, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: numColor,
              }}
            >
              {stop}
            </div>
          </div>
        );
      })}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="absolute inset-2 rounded-full"
        style={{
          background: `conic-gradient(var(--wp-accent) 0deg, var(--wp-accent-2) ${pct * 3.6}deg, color-mix(in srgb, var(--wp-text-faint) 22%, transparent) ${pct * 3.6}deg)`,
          padding: 6,
        }}
      >
        <div
          className="flex h-full w-full flex-col items-center justify-center rounded-full"
          style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: 'var(--wp-text-faint)' }}>
            Warmth
          </span>
          <span className="font-mono text-[42px] font-bold leading-none tabular-nums" style={{ color: 'var(--wp-text)' }}>
            {value}
          </span>
          <span
            className="mt-1 inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold"
            style={{ color: 'var(--wp-success)' }}
          >
            <ArrowUpRight size={10} strokeWidth={2.4} />
            +{delta} · 24h
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StarterSparkline({ points }: { points: number[] }) {
  const w = 720;
  const h = 48;
  const max = 100;
  const min = 40;
  const usableH = h - 6;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => 3 + (1 - (v - min) / (max - min)) * usableH;
  const path = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${h} ${path} ${x(points.length - 1).toFixed(1)},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[48px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="starter-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wp-accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--wp-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polygon
        points={area}
        fill="url(#starter-spark-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      />
      <motion.polyline
        points={path}
        fill="none"
        stroke="var(--wp-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   PRO PREVIEW — N1 Analytics cockpit
   5-tile KPI band + combo chart (warmth line over volume bars) +
   2-col placement/provider + engagement bars + leaderboard table.
---------------------------------------------------------------------------- */

const PRO_KPIS: Array<{ label: string; value: string; delta: string; progress: number; tone: string }> = [
  { label: 'Inbox placement', value: '92.1%', delta: '+3.2 pts', progress: 92, tone: 'var(--wp-accent)' },
  { label: 'Bounce rate', value: '0.6%', delta: '−0.3 pts', progress: 6, tone: 'var(--wp-success)' },
  { label: 'Spam rate', value: '2.0%', delta: '−1.1 pts', progress: 20, tone: 'var(--wp-accent-2)' },
  { label: 'Reply rate', value: '24.8%', delta: '+1.9 pts', progress: 25, tone: 'var(--wp-warning)' },
  { label: 'Avg warmth', value: '82', delta: '+2.4', progress: 82, tone: 'var(--wp-accent)' },
];

// 30-day warmth + volume — ramp 58 → 84 with matching volume bars.
const PRO_COMBO = Array.from({ length: 30 }, (_, i) => {
  const t = i / 29;
  return {
    warmth: Math.round(58 + t * 26 + Math.sin(i * 0.8) * 2.2),
    volume: Math.round(70 + t * 68 + Math.sin(i * 1.3) * 9),
  };
});

const PRO_LEADERBOARD = [
  { letter: 'G', email: 'founder@acme.io', warmth: 88, color: 'var(--wp-accent)' },
  { letter: 'O', email: 'sales@acme.io', warmth: 82, color: 'var(--wp-accent)' },
  { letter: 'G', email: 'success@acme.io', warmth: 79, color: 'var(--wp-accent)' },
  { letter: 'S', email: 'hello@acme.co', warmth: 71, color: 'var(--wp-warning)' },
];

function ProPreview({ tier }: { tier: PlanTier }) {
  return (
    <PreviewShell
      tier={tier}
      subtitle="Analytics cockpit · N1"
      title="Workspace warmth · 4 mailboxes"
      ambient="radial-gradient(ellipse at top, color-mix(in srgb, var(--wp-accent) 16%, transparent) 0%, transparent 65%)"
    >
      {/* 5-tile KPI band */}
      <div className="mb-3 grid grid-cols-5 gap-2">
        {PRO_KPIS.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.04 * i, ease: 'easeOut' }}
            className="rounded-lg p-2.5"
            style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
          >
            <div className="truncate font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>
              {k.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[18px] font-semibold tabular-nums leading-none" style={{ color: 'var(--wp-text)' }}>
                {k.value}
              </span>
              <span className="font-mono text-[9px]" style={{ color: 'var(--wp-success)' }}>{k.delta}</span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full"
              style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: k.tone }}
                initial={{ width: 0 }}
                animate={{ width: `${k.progress}%` }}
                transition={{ duration: 0.9, delay: 0.2 + 0.04 * i, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* combo chart card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.22, ease: 'easeOut' }}
        className="mb-3 rounded-lg p-3"
        style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>
            <Activity size={11} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
            Workspace warmth · last 30 days
          </span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9px]"
            style={{ background: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)', color: 'var(--wp-accent)' }}
          >
            30D
          </span>
        </div>
        <ProComboChart />
      </motion.div>

      {/* 2-col: placement stacked area + provider donut */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.32, ease: 'easeOut' }}
          className="rounded-lg p-2.5"
          style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
        >
          <div className="mb-1 text-[10px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>
            Placement (Inbox / Promo / Spam)
          </div>
          <ProPlacementChart />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.38, ease: 'easeOut' }}
          className="flex items-center gap-3 rounded-lg p-2.5"
          style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
        >
          <ProProviderDonut />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-[10px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>Providers</div>
            {[
              { label: 'Gmail', n: 2, c: 'var(--wp-accent)' },
              { label: 'Outlook', n: 1, c: 'var(--wp-accent-2)' },
              { label: 'SMTP', n: 1, c: 'var(--wp-warning)' },
            ].map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1.5 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.c }} />
                <span style={{ color: 'var(--wp-text-dim)' }}>{p.label}</span>
                <span className="ml-auto font-mono tabular-nums" style={{ color: 'var(--wp-text)' }}>{p.n}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* leaderboard row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.46, ease: 'easeOut' }}
        className="mt-3 rounded-lg p-0"
        style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--wp-border)' }}>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--wp-text-dim)' }}>
            <BarChart3 size={11} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
            Top mailboxes by warmth
          </span>
          <span className="font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>4 active</span>
        </div>
        <div>
          {PRO_LEADERBOARD.map((row, i) => (
            <motion.div
              key={row.email}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.04 }}
              className="flex items-center gap-2 px-3 py-1.5"
              style={{ borderTop: i === 0 ? '0' : '1px solid color-mix(in srgb, var(--wp-border) 60%, transparent)' }}
            >
              <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--wp-text-faint)', width: 12 }}>
                {i + 1}
              </span>
              <span
                className="grid h-6 w-6 place-items-center rounded-md text-[10px] font-semibold"
                style={{ background: row.color, color: 'var(--wp-bg)' }}
              >
                {row.letter}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--wp-text)' }}>
                {row.email}
              </span>
              <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: row.color }}>
                {row.warmth}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </PreviewShell>
  );
}

function ProComboChart() {
  const w = 800, h = 110, padL = 4, padR = 4, padT = 6, padB = 6;
  const usableW = w - padL - padR;
  const usableH = h - padT - padB;
  const x = (i: number) => padL + (i / (PRO_COMBO.length - 1)) * usableW;
  const yWarm = (v: number) => padT + (1 - v / 100) * usableH;
  const yVol = (v: number) => padT + (1 - v / 160) * usableH;
  const linePts = PRO_COMBO.map((p, i) => `${x(i).toFixed(1)},${yWarm(p.warmth).toFixed(1)}`).join(' ');
  const barW = usableW / PRO_COMBO.length - 1.5;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[110px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pro-line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wp-accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--wp-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={padL} y1={padT + g * usableH} x2={w - padR} y2={padT + g * usableH}
          stroke="var(--wp-border)" strokeDasharray="2 3"
        />
      ))}
      {PRO_COMBO.map((p, i) => (
        <motion.rect
          key={i}
          x={x(i) - barW / 2} y={yVol(p.volume)}
          width={barW} height={h - padB - yVol(p.volume)}
          fill="var(--wp-accent-2)" opacity={0.32}
          initial={{ scaleY: 0, originY: 1 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.5, delay: 0.05 + i * 0.012, ease: 'easeOut' }}
          style={{ transformOrigin: `${x(i)}px ${h - padB}px` }}
        />
      ))}
      <motion.polygon
        points={`${x(0).toFixed(1)},${h - padB} ${linePts} ${x(PRO_COMBO.length - 1).toFixed(1)},${h - padB}`}
        fill="url(#pro-line-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      />
      <motion.polyline
        points={linePts}
        fill="none" stroke="var(--wp-accent)" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.4 }}
      />
    </svg>
  );
}

function ProPlacementChart() {
  // 14-day stacked area: inbox, promo, spam
  const days = 14;
  const data = Array.from({ length: days }, (_, i) => {
    const t = i / (days - 1);
    const spam = Math.max(1.4, 7.5 - t * 5.4 + Math.sin(i * 1.1) * 0.5);
    const promo = Math.max(3.5, 9 - t * 3.4 + Math.cos(i * 0.9) * 0.6);
    return { spam, promo, inbox: 100 - spam - promo };
  });
  const w = 280;
  const h = 80;
  const xAt = (i: number) => (i / (days - 1)) * w;
  const yAt = (v: number) => (1 - v / 100) * h;
  // top edges
  const inboxTop = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.spam + d.promo + d.inbox).toFixed(1)}`).join(' ');
  const promoTop = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.spam + d.promo).toFixed(1)}`).join(' ');
  const spamTop = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.spam).toFixed(1)}`).join(' ');
  const bottom = `${xAt(days - 1).toFixed(1)},${h} ${xAt(0).toFixed(1)},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[80px] w-full" preserveAspectRatio="none">
      {[
        { pts: `${inboxTop} ${bottom}`, fill: 'var(--wp-accent)', op: '0.55', d: 0.4 },
        { pts: `${promoTop} ${bottom}`, fill: 'var(--wp-warning)', op: '0.6', d: 0.5 },
        { pts: `${spamTop} ${bottom}`, fill: 'var(--wp-danger)', op: '0.75', d: 0.6 },
      ].map((p, i) => (
        <motion.polygon
          key={i}
          points={p.pts} fill={p.fill} fillOpacity={p.op}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: p.d }}
        />
      ))}
    </svg>
  );
}

function ProProviderDonut() {
  const slices = [
    { v: 2, c: 'var(--wp-accent)' },
    { v: 1, c: 'var(--wp-accent-2)' },
    { v: 1, c: 'var(--wp-warning)' },
  ];
  const total = slices.reduce((s, x) => s + x.v, 0);
  const r = 24, cx = 32, cy = 32;
  let a0 = -Math.PI / 2;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      {slices.map((s, i) => {
        const a1 = a0 + (s.v / total) * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
        const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
        const path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
        const node = (
          <motion.path
            key={i}
            d={path} fill={s.c}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        );
        a0 = a1;
        return node;
      })}
      <circle cx={cx} cy={cy} r={14} fill="var(--wp-surface)" />
      <text
        x={cx} y={cy + 3} textAnchor="middle"
        fontFamily="ui-monospace, monospace" fontSize="11" fontWeight="700" fill="var(--wp-text)"
      >
        {total}
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   PRO PLUS PREVIEW — N4 Console (master/detail)
   LEFT: vertical list of mailbox cards with provider letter + warmth bar.
   RIGHT: selected mailbox detail — big warmth + 4 mini-KPIs + sparkline + feed.
---------------------------------------------------------------------------- */

type PPStatus = 'active' | 'warming' | 'paused';
type PPMailbox = {
  id: string;
  letter: string;
  email: string;
  warmth: number;
  status: PPStatus;
  delta: number;
  day: number;
  sends: number;
  target: number;
  spark: number[];
  feed: Array<{ kind: 'replied' | 'opened' | 'sent' | 'starred'; peer: string; ago: string }>;
};

/** Compact spec rows: id, letter, email, warmth, status, delta, day, sends, target.
 *  spark + feed are derived (spark = ramp ending at warmth, feed = synthesised). */
const PP_SPECS: Array<[string, string, string, number, PPStatus, number, number, number, number]> = [
  ['mb-1', 'G', 'founder@acme.io', 92, 'active', 1.3, 29, 70, 75],
  ['mb-2', 'O', 'sales@acme.io', 90, 'active', 2.0, 28, 66, 72],
  ['mb-3', 'G', 'success@acme.io', 87, 'active', 1.7, 26, 60, 68],
  ['mb-4', 'O', 'partnerships@acme.io', 85, 'active', 2.9, 23, 48, 50],
  ['mb-5', 'S', 'hello@acme.co', 82, 'warming', 2.3, 20, 33, 35],
  ['mb-6', 'Y', 'support@acme.co', 78, 'warming', 1.9, 17, 31, 35],
  ['mb-7', 'G', 'growth@acme.io', 71, 'warming', -1.1, 13, 18, 20],
  ['mb-8', 'S', 'billing@acme.co', 64, 'warming', 2.7, 8, 9, 10],
  ['mb-9', 'G', 'team@northwind.dev', 89, 'active', 1.5, 27, 64, 70],
  ['mb-10', 'O', 'ops@northwind.dev', 86, 'active', 2.1, 24, 47, 50],
  ['mb-11', 'G', 'newsletter@northwind.dev', 75, 'warming', 1.4, 15, 30, 35],
  ['mb-12', 'G', 'founder@brightloop.app', 88, 'active', 1.8, 25, 60, 65],
];

const PP_FEEDS: Record<string, PPMailbox['feed']> = {
  'mb-1': [
    { kind: 'replied', peer: 'maya.r@hubspot-peer.net', ago: '1m' },
    { kind: 'opened', peer: 'devon@peer-inbox.io', ago: '6m' },
    { kind: 'sent', peer: 'lina.k@peernet.co', ago: '14m' },
    { kind: 'starred', peer: 'omar@peer-inbox.io', ago: '27m' },
  ],
  'mb-2': [
    { kind: 'opened', peer: 'devon@peer-inbox.io', ago: '2m' },
    { kind: 'replied', peer: 'priya@peernet.co', ago: '18m' },
  ],
  'mb-3': [{ kind: 'sent', peer: 'lina.k@peernet.co', ago: '4m' }],
  'mb-4': [{ kind: 'replied', peer: 'raj.p@peer-inbox.io', ago: '3m' }],
  'mb-5': [{ kind: 'starred', peer: 'omar@peer-inbox.io', ago: '5m' }],
};

const PP_MAILBOXES: PPMailbox[] = PP_SPECS.map(
  ([id, letter, email, warmth, status, delta, day, sends, target]) => ({
    id,
    letter,
    email,
    warmth,
    status,
    delta,
    day,
    sends,
    target,
    // Synthesise a 14-point ramp ending at `warmth`, jittered.
    spark: Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      return Math.round(warmth - 10 + 10 * t + Math.sin(i * 1.1 + warmth) * 1.6);
    }),
    feed: PP_FEEDS[id] ?? [],
  }),
);

const FEED_META = {
  replied: { Icon: Reply, color: 'var(--wp-accent)', label: 'replied by' },
  opened: { Icon: MailOpen, color: 'var(--wp-warning)', label: 'opened by' },
  sent: { Icon: Send, color: 'var(--wp-text-dim)', label: 'sent to' },
  starred: { Icon: Star, color: 'var(--wp-accent-2)', label: 'starred by' },
} as const;

const PP_STATUS = {
  active: { dot: 'var(--wp-accent)', label: 'Active' },
  warming: { dot: 'var(--wp-warning)', label: 'Warming' },
  paused: { dot: 'var(--wp-text-dim)', label: 'Paused' },
} as const;

function ppWarmthColor(w: number): string {
  if (w >= 75) return 'var(--wp-accent)';
  if (w >= 50) return 'var(--wp-warning)';
  return 'var(--wp-danger)';
}

function ProPlusPreview({ tier }: { tier: PlanTier }) {
  const [selectedId, setSelectedId] = useState('mb-1');
  const selected = useMemo(
    () => PP_MAILBOXES.find((m) => m.id === selectedId) ?? PP_MAILBOXES[0]!,
    [selectedId],
  );
  const selColor = ppWarmthColor(selected.warmth);

  const detailKpis = [
    { l: 'Sends', v: `${selected.sends}`, s: `of ${selected.target}` },
    { l: 'Opens', v: `${Math.round(selected.sends * 0.78)}`, s: '78% rate' },
    { l: 'Replies', v: `${Math.round(selected.sends * 0.28)}`, s: '28% rate' },
    { l: 'Inbox', v: `${(94 - (100 - selected.warmth) * 0.2).toFixed(1)}%`, s: 'placement' },
  ];

  const surfaceCard = { background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' } as const;
  const innerCard = {
    background: 'color-mix(in srgb, var(--wp-surface-2) 75%, transparent)',
    border: '1px solid var(--wp-border)',
  } as const;

  return (
    <PreviewShell
      tier={tier}
      subtitle="Console · master/detail · N4"
      title={`Mailbox console · ${PP_MAILBOXES.length} mailboxes`}
      ambient="radial-gradient(ellipse at center top, color-mix(in srgb, var(--wp-accent) 18%, transparent) 0%, transparent 70%)"
    >
      <div className="grid gap-2" style={{ gridTemplateColumns: '260px 1fr', minHeight: 380 }}>
        {/* MASTER RAIL */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
          className="flex flex-col overflow-hidden rounded-xl"
          style={surfaceCard}
        >
          {/* Search + add */}
          <div className="flex items-center gap-1.5 border-b p-2" style={{ borderColor: 'var(--wp-border)' }}>
            <div
              className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1"
              style={{
                background: 'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)',
                border: '1px solid var(--wp-border)',
              }}
            >
              <Search size={10} strokeWidth={2.4} style={{ color: 'var(--wp-text-faint)' }} />
              <span className="text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
                Search mailboxes…
              </span>
            </div>
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 40%, transparent)',
                color: 'var(--wp-accent)',
              }}
            >
              <Plus size={9} strokeWidth={2.4} />
              Add
            </button>
          </div>

          {/* mailbox rows */}
          <div className="flex-1 overflow-hidden" style={{ maxHeight: 320 }}>
            <div className="p-1.5">
              {PP_MAILBOXES.slice(0, 6).map((m, i) => (
                <ProPlusRailRow
                  key={m.id}
                  mailbox={m}
                  active={m.id === selectedId}
                  index={i}
                  onSelect={() => setSelectedId(m.id)}
                />
              ))}
              <div className="mt-1.5 text-center font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>
                + 6 more…
              </div>
            </div>
          </div>
        </motion.div>

        {/* DETAIL PANE */}
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
          className="flex flex-col overflow-hidden rounded-xl"
          style={surfaceCard}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28 }}
              className="flex flex-col gap-3 p-3"
            >
              {/* header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-md font-mono text-[11px] font-bold"
                    style={{ background: selColor, color: 'var(--wp-bg)' }}
                  >
                    {selected.letter}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold" style={{ color: 'var(--wp-text)' }}>
                      {selected.email}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: PP_STATUS[selected.status].dot }} />
                      {PP_STATUS[selected.status].label} · Day {selected.day} / 28
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1 rounded-md px-2 font-mono text-[9px]"
                  style={{
                    background: 'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)',
                    border: '1px solid var(--wp-border)',
                    color: 'var(--wp-text-dim)',
                  }}
                >
                  <RefreshCw size={9} strokeWidth={2.4} />
                  Sync
                </button>
              </div>

              {/* big warmth + 4 mini-KPIs */}
              <div className="grid items-center gap-3" style={{ gridTemplateColumns: '110px 1fr' }}>
                <div className="rounded-xl p-3 text-center" style={innerCard}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-faint)' }}>
                    Warmth
                  </span>
                  <div className="font-mono text-[34px] font-bold leading-none tabular-nums" style={{ color: selColor }}>
                    {selected.warmth}
                  </div>
                  <span
                    className="inline-flex items-center gap-0.5 font-mono text-[9px]"
                    style={{ color: selected.delta >= 0 ? 'var(--wp-success)' : 'var(--wp-danger)' }}
                  >
                    <ArrowUpRight size={9} strokeWidth={2.4} />
                    {selected.delta >= 0 ? '+' : ''}{selected.delta.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {detailKpis.map((k, i) => (
                    <motion.div
                      key={k.l}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.18 + i * 0.04 }}
                      className="rounded-md p-2"
                      style={innerCard}
                    >
                      <div className="font-mono text-[8px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{k.l}</div>
                      <div className="font-mono text-[14px] font-semibold tabular-nums leading-tight" style={{ color: 'var(--wp-text)' }}>{k.v}</div>
                      <div className="text-[9px]" style={{ color: 'var(--wp-text-dim)' }}>{k.s}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* mini trend line + feed */}
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="rounded-md p-2" style={innerCard}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>14d trend</span>
                    <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color: selColor }}>{selected.warmth}</span>
                  </div>
                  <ProPlusMiniLine points={selected.spark} color={selColor} />
                </div>
                <div className="rounded-md p-2" style={innerCard}>
                  <div className="mb-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>
                    <Activity size={9} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
                    Recent peer net
                  </div>
                  <div className="flex flex-col gap-1">
                    {(selected.feed.length > 0
                      ? selected.feed
                      : [{ kind: 'sent' as const, peer: 'awaiting peer events…', ago: '' }]
                    )
                      .slice(0, 3)
                      .map((f, i) => {
                        const meta = FEED_META[f.kind];
                        const Icon = meta.Icon;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: 4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: 0.3 + i * 0.05 }}
                            className="flex items-center gap-1.5"
                          >
                            <Icon size={9} strokeWidth={2.2} style={{ color: meta.color }} />
                            <span className="min-w-0 flex-1 truncate text-[9px]" style={{ color: 'var(--wp-text-dim)' }}>
                              {meta.label} <span style={{ color: 'var(--wp-text)' }}>{f.peer}</span>
                            </span>
                            <span className="font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>{f.ago}</span>
                          </motion.div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </PreviewShell>
  );
}

function ProPlusRailRow({
  mailbox: m,
  active,
  index,
  onSelect,
}: {
  mailbox: PPMailbox;
  active: boolean;
  index: number;
  onSelect: () => void;
}) {
  const color = ppWarmthColor(m.warmth);
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: 0.1 + index * 0.04 }}
      onClick={onSelect}
      className="relative mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
      style={{
        background: active ? 'color-mix(in srgb, var(--wp-accent) 12%, transparent)' : 'transparent',
      }}
    >
      {active && (
        <span
          className="absolute inset-y-1 left-0 w-0.5 rounded-full"
          style={{ background: 'var(--wp-accent)' }}
        />
      )}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold"
        style={{ background: color, color: 'var(--wp-bg)' }}
      >
        {m.letter}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[10px] font-medium"
          style={{ color: active ? 'var(--wp-text)' : 'var(--wp-text-dim)' }}
        >
          {m.email}
        </div>
        <div
          className="flex items-center gap-1 font-mono text-[9px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: PP_STATUS[m.status].dot }} />
          {PP_STATUS[m.status].label} · D{m.day}
        </div>
      </div>
      <span
        className="font-mono text-[11px] font-semibold tabular-nums"
        style={{ color }}
      >
        {m.warmth}
      </span>
    </motion.button>
  );
}

function ProPlusMiniLine({ points, color }: { points: number[]; color: string }) {
  const w = 260;
  const h = 44;
  const max = Math.max(...points);
  const min = Math.min(...points) - 2;
  const usableH = h - 4;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => 2 + (1 - (v - min) / (max - min || 1)) * usableH;
  const pts = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${h} ${pts} ${x(points.length - 1).toFixed(1)},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[44px] w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pp-mini-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polygon
        points={area}
        fill="url(#pp-mini-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
      <motion.polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut', delay: 0.25 }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   AGENCY PREVIEW — D3 Tiered Status Constellation
   Three concentric rings (Healthy inner / Warming middle / At-risk outer)
   with sub-client nodes placed around each ring. Centre = agency hub.
---------------------------------------------------------------------------- */

type AgencyNode = {
  id: string;
  ring: 'healthy' | 'warming' | 'at_risk';
  angleDeg: number;
  label: string;
  warmth: number;
  mailboxes: number;
};

// 28 sub-clients distributed: 18 healthy / 7 warming / 3 at-risk.
const AGENCY_NAMES = ['Helix', 'Nimbus', 'Orion', 'Quasar', 'Lyra', 'Vega', 'Pixel', 'Atlas', 'Aero', 'Polaris', 'Nova', 'Spectra', 'Hyper', 'Loop', 'Cipher', 'Echo', 'Drift', 'Forge', 'Glide', 'Halo', 'Iris', 'Jolt', 'Kite', 'Lumen', 'Mint', 'Nest', 'Oak', 'Pyx'] as const;
const AGENCY_NODES: AgencyNode[] = (() => {
  const tiers: Array<{ ring: AgencyNode['ring']; n: number; offset: number; base: number; jitter: number; mbBase: number; mbMod: number }> = [
    { ring: 'healthy', n: 18, offset: 0, base: 78, jitter: 12, mbBase: 8, mbMod: 12 },
    { ring: 'warming', n: 7, offset: 25, base: 62, jitter: 8, mbBase: 4, mbMod: 8 },
    { ring: 'at_risk', n: 3, offset: 60, base: 38, jitter: 12, mbBase: 3, mbMod: 5 },
  ];
  let nameIdx = 0;
  const out: AgencyNode[] = [];
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      out.push({
        id: `${t.ring}-${i}`,
        ring: t.ring,
        angleDeg: -90 + (360 / t.n) * i + t.offset,
        label: AGENCY_NAMES[nameIdx++] ?? `Acct ${i}`,
        warmth: t.base + Math.round(Math.sin(i * 1.3 + t.base) * (t.jitter / 2) + t.jitter / 2),
        mailboxes: t.mbBase + (i % t.mbMod),
      });
    }
  }
  return out;
})();

const RING_RADII = { healthy: 92, warming: 142, at_risk: 188 } as const;
const RING_COLOR = {
  healthy: 'var(--wp-success)',
  warming: 'var(--wp-warning)',
  at_risk: 'var(--wp-danger)',
} as const;

function AgencyPreview({ tier }: { tier: PlanTier }) {
  const counts = useMemo(() => ({
    healthy: AGENCY_NODES.filter((n) => n.ring === 'healthy').length,
    warming: AGENCY_NODES.filter((n) => n.ring === 'warming').length,
    at_risk: AGENCY_NODES.filter((n) => n.ring === 'at_risk').length,
  }), []);
  const totalMailboxes = useMemo(() => AGENCY_NODES.reduce((s, n) => s + n.mailboxes, 0), []);
  const [hoveredNode, setHoveredNode] = useState<AgencyNode | null>(null);

  return (
    <PreviewShell
      tier={tier}
      subtitle="Tiered constellation · D3"
      title={`Northwind Agency · ${AGENCY_NODES.length} sub-clients`}
      ambient="radial-gradient(ellipse at top, color-mix(in srgb, var(--wp-accent) 22%, transparent) 0%, transparent 70%), radial-gradient(ellipse at bottom right, color-mix(in srgb, var(--wp-accent-2) 14%, transparent) 0%, transparent 60%)"
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 200px' }}>
        {/* CONSTELLATION CANVAS */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl"
          style={{ height: 380, background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle, color-mix(in srgb, var(--wp-text-faint) 50%, transparent) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 18%, transparent) 0%, transparent 70%)',
              filter: 'blur(20px)',
            }}
          />
          <AgencyConstellationSvg onHover={setHoveredNode} />

          {/* ring tier labels overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.9 }}
            className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg px-2.5 py-2"
            style={{
              background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
              border: '1px solid var(--wp-border)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: 'var(--wp-text-faint)' }}>
              Ring tiers
            </span>
            {(['healthy', 'warming', 'at_risk'] as const).map((ring) => (
              <span key={ring} className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: RING_COLOR[ring] }} />
                <span className="font-semibold" style={{ color: RING_COLOR[ring] }}>
                  {ring === 'at_risk' ? 'AT-RISK' : ring.toUpperCase()}
                </span>
              </span>
            ))}
          </motion.div>

          {/* "closer = safer" annotation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 1 }}
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
              border: '1px solid var(--wp-border)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Radar size={10} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-dim)' }}>
              Closer = safer
            </span>
          </motion.div>
        </motion.div>

        {/* RIGHT INSPECTOR */}
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-2"
        >
          {(['healthy', 'warming', 'at_risk'] as const).map((ring, i) => (
            <AgencyCountChip
              key={ring}
              ring={ring}
              count={counts[ring]}
              total={AGENCY_NODES.length}
              delay={0.3 + i * 0.06}
            />
          ))}

          {/* alert card */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.55 }}
            className="rounded-lg p-2.5"
            style={{
              background: 'color-mix(in srgb, var(--wp-danger) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-danger) 30%, transparent)',
            }}
          >
            <div className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-danger)' }}>
              <AlertTriangle size={10} strokeWidth={2.4} />
              Live alert
            </div>
            <div className="mt-1 text-[10px] font-medium" style={{ color: 'var(--wp-text)' }}>
              {hoveredNode?.label ?? 'Atlas'} — bounce 7.4% on outreach domain (24h)
            </div>
            <div className="mt-0.5 font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>
              38m ago · drill in to triage
            </div>
          </motion.div>

          {/* portfolio summary */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.65 }}
            className="rounded-lg p-2.5"
            style={{ background: 'var(--wp-surface)', border: '1px solid var(--wp-border)' }}
          >
            <div className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>
              <Target size={9} strokeWidth={2.4} style={{ color: 'var(--wp-accent)' }} />
              Portfolio
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-[16px] font-bold tabular-nums leading-none" style={{ color: 'var(--wp-text)' }}>
                {totalMailboxes}
              </span>
              <span className="text-[9px]" style={{ color: 'var(--wp-text-dim)' }}>
                mailboxes
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </PreviewShell>
  );
}

function AgencyCountChip({
  ring,
  count,
  total,
  delay,
}: {
  ring: AgencyNode['ring'];
  count: number;
  total: number;
  delay: number;
}) {
  const color = RING_COLOR[ring];
  const label = ring === 'at_risk' ? 'At-risk' : ring === 'healthy' ? 'Healthy' : 'Warming';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-lg p-2.5"
      style={{
        background: 'var(--wp-surface)',
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="font-mono text-[22px] font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {count}
        </span>
        <span className="text-[9px]" style={{ color: 'var(--wp-text-dim)' }}>accounts</span>
      </div>
      <div
        className="mt-1.5 h-0.5 overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${(count / total) * 100}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2 }}
        />
      </div>
    </motion.div>
  );
}

function AgencyConstellationSvg({ onHover }: { onHover: (n: AgencyNode | null) => void }) {
  return (
    <svg
      viewBox="-220 -200 440 400"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id="agency-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--wp-accent)" stopOpacity="0.9" />
          <stop offset="60%" stopColor="var(--wp-accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--wp-accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="zone-healthy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--wp-success)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--wp-success)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="zone-warming" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="var(--wp-warning)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--wp-warning)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="zone-risk" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="var(--wp-danger)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--wp-danger)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={0} cy={0} r={RING_RADII.at_risk + 25} fill="url(#zone-risk)" />
      <circle cx={0} cy={0} r={RING_RADII.warming + 20} fill="url(#zone-warming)" />
      <circle cx={0} cy={0} r={RING_RADII.healthy + 15} fill="url(#zone-healthy)" />

      {/* rotating ring scaffold */}
      <motion.g
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 80, ease: 'linear', repeat: Infinity }}
        style={{ transformOrigin: '0px 0px' }}
      >
        {(['at_risk', 'warming', 'healthy'] as const).map((ring) => (
          <g key={ring}>
            <circle
              cx={0} cy={0} r={RING_RADII[ring]}
              fill="none" stroke={RING_COLOR[ring]} strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="2 5"
            />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (-90 + i * 45) * (Math.PI / 180);
              const r0 = RING_RADII[ring] - 4;
              const r1 = RING_RADII[ring] + 4;
              return (
                <line
                  key={i}
                  x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)}
                  x2={r1 * Math.cos(a)} y2={r1 * Math.sin(a)}
                  stroke={RING_COLOR[ring]} strokeOpacity={0.4} strokeWidth={0.8} strokeLinecap="round"
                />
              );
            })}
          </g>
        ))}
      </motion.g>

      {AGENCY_NODES.filter((n) => n.ring === 'at_risk').map((n, i) => {
        const a = (n.angleDeg * Math.PI) / 180;
        const r0 = 38;
        const r1 = RING_RADII[n.ring] - 9;
        return (
          <motion.line
            key={`spoke-${n.id}`}
            x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)}
            x2={r1 * Math.cos(a)} y2={r1 * Math.sin(a)}
            stroke={RING_COLOR[n.ring]} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: 0.6 + i * 0.08 }}
          />
        );
      })}

      {AGENCY_NODES.map((n, i) => {
        const a = (n.angleDeg * Math.PI) / 180;
        const r = RING_RADII[n.ring];
        const cx = r * Math.cos(a);
        const cy = r * Math.sin(a);
        const color = RING_COLOR[n.ring];
        const nodeR = n.ring === 'at_risk' ? 8 : n.ring === 'warming' ? 6.5 : 5.5;
        return (
          <g key={n.id}>
            {n.ring === 'at_risk' && (
              <motion.circle
                cx={cx} cy={cy} r={nodeR}
                fill="none" stroke={color} strokeWidth={1}
                animate={{ scale: [1, 1.6, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            )}
            <motion.circle
              cx={cx} cy={cy} r={nodeR}
              fill={color} fillOpacity={0.85}
              stroke="var(--wp-bg)" strokeWidth={1.2}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 + Math.min(i, 28) * 0.025, ease: 'easeOut' }}
              style={{
                filter: `drop-shadow(0 0 4px ${color})`,
                cursor: 'pointer',
                transformOrigin: `${cx}px ${cy}px`,
              }}
              onMouseEnter={() => onHover(n)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}

      {/* central core */}
      <motion.circle
        cx={0} cy={0} r={36}
        fill="none" stroke="var(--wp-accent)" strokeWidth={1.5}
        animate={{ scale: [1, 2.4, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeOut' }}
        style={{ transformOrigin: '0px 0px' }}
      />
      <circle cx={0} cy={0} r={56} fill="url(#agency-core)" />
      <motion.circle
        cx={0} cy={0} r={36}
        fill="var(--wp-surface)" stroke="var(--wp-accent)" strokeWidth={1.5}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ transformOrigin: '0px 0px' }}
      />
      <text
        x={0} y={-12} textAnchor="middle" fill="var(--wp-accent)"
        style={{ fontSize: 7, letterSpacing: 1.6, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}
      >
        AGENCY
      </text>
      <text x={0} y={4} textAnchor="middle" fill="var(--wp-text)" style={{ fontSize: 14, fontWeight: 700 }}>
        {AGENCY_NODES.length}
      </text>
      <text
        x={0} y={18} textAnchor="middle" fill="var(--wp-text-dim)"
        style={{ fontSize: 7, fontFamily: 'ui-monospace, monospace' }}
      >
        sub-clients
      </text>
    </svg>
  );
}

/* ============================================================================
   H4 Immersive — signal chips that drift around the device
============================================================================ */

type SignalChipData = {
  id: string;
  icon: 'reply' | 'inbox' | 'star' | 'shield' | 'send' | 'rescue' | 'zap' | 'check';
  text: string;
  color: string;
};

const SIGNAL_POOL: SignalChipData[] = [
  { id: 's1', icon: 'reply',  text: 'Reply received',      color: 'var(--wp-success)' },
  { id: 's2', icon: 'inbox',  text: 'Moved to inbox',      color: 'var(--wp-accent)'  },
  { id: 's3', icon: 'shield', text: 'Reputation 98',       color: 'var(--wp-success)' },
  { id: 's4', icon: 'star',   text: 'Starred by peer',     color: 'var(--wp-accent-2)'},
  { id: 's5', icon: 'send',   text: '24 sent today',       color: 'var(--wp-accent-2)'},
  { id: 's6', icon: 'rescue', text: 'Spam rescued',        color: 'var(--wp-warning)' },
  { id: 's7', icon: 'reply',  text: 'Thread replied',      color: 'var(--wp-success)' },
  { id: 's8', icon: 'check',  text: 'Inbox placement 97%', color: 'var(--wp-accent)'  },
];

/* Positions for each slot — avoid center, hug the left/right edges */
const CHIP_POSITIONS: React.CSSProperties[] = [
  { top: '7%',  left:  '2%'  },
  { top: '26%', left:  '1%'  },
  { top: '56%', left:  '1%'  },
  { top: '74%', left:  '3%'  },
  { top: '9%',  right: '2%'  },
  { top: '32%', right: '1%'  },
  { top: '61%', right: '2%'  },
  { top: '77%', right: '3%'  },
];

const chipV: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: 8 },
  show:   { opacity: 1, scale: 1,   y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 22 } },
  exit:   { opacity: 0, scale: 0.6, y: -6,
    transition: { duration: 0.35 } },
};

function signalChipIcon(kind: SignalChipData['icon']): React.ReactNode {
  const s: React.CSSProperties = { width: 12, height: 12, flexShrink: 0 };
  switch (kind) {
    case 'reply':   return <MessageSquare style={s} />;
    case 'inbox':   return <Inbox style={s} />;
    case 'star':    return <Star style={s} />;
    case 'shield':  return <ShieldCheck style={s} />;
    case 'send':    return <Send style={s} />;
    case 'rescue':  return <AlertTriangle style={s} />;
    case 'check':   return <CheckCircle2 style={s} />;
    default:        return <Zap style={s} />;
  }
}

function SignalChipsLayer() {
  const [visible, setVisible] = useState<number[]>([0, 3, 6]);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible((prev) => {
        const next = [...prev];
        const removeIdx = Math.floor(Math.random() * next.length);
        next.splice(removeIdx, 1);
        const candidates = SIGNAL_POOL.map((_, i) => i).filter((i) => !next.includes(i));
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          if (pick !== undefined) next.push(pick);
        }
        return next;
      });
    }, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {visible.map((chipIdx) => {
        const chip = SIGNAL_POOL[chipIdx];
        const pos = CHIP_POSITIONS[chipIdx % CHIP_POSITIONS.length];
        if (!chip || !pos) return null;
        return (
          <AnimatePresence key={`chip-${chipIdx}`}>
            <motion.div
              variants={chipV}
              initial="hidden"
              animate="show"
              exit="exit"
              className="pointer-events-none absolute hidden md:flex"
              style={{
                ...pos,
                alignItems: 'center',
                gap: 6,
                background: 'var(--wp-glass-bg)',
                border: `1px solid color-mix(in srgb, ${chip.color} 40%, transparent)`,
                borderRadius: 20,
                padding: '5px 10px',
                fontSize: 11,
                color: chip.color,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                whiteSpace: 'nowrap',
                zIndex: 20,
                boxShadow: `0 0 10px color-mix(in srgb, ${chip.color} 20%, transparent)`,
              }}
            >
              {signalChipIcon(chip.icon)}
              {chip.text}
            </motion.div>
          </AnimatePresence>
        );
      })}
    </>
  );
}

/* ============================================================================
   H4 Immersive plan pill switcher — layoutId pill indicator
============================================================================ */

function H4PlanPills({
  tiers,
  activeIdx,
  onSelect,
}: {
  tiers: PlanTier[];
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className="inline-flex gap-1 rounded-full p-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        border: '1px solid var(--wp-glass-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {tiers.map((t, i) => {
        const active = i === activeIdx;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={active}
            className="relative rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
            style={{
              color: active ? 'var(--wp-text)' : 'var(--wp-text-dim)',
              zIndex: 2,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {active && (
              <motion.span
                layoutId="h4-pill-bg"
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2))',
                  boxShadow: '0 2px 16px color-mix(in srgb, var(--wp-accent) 45%, transparent)',
                  zIndex: -1,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            {t.key === 'pro_plus' && (
              <Sparkles size={11} strokeWidth={2.2} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
            )}
            {t.pill}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Plan-tier carousel — H4 Immersive: perspective device + mouse parallax + float
============================================================================ */

const AUTOPLAY_INTERVAL = 5500;

function PlanTiersCarousel({
  scaleMV,
  yMV,
}: {
  scaleMV: MotionValue<number>;
  yMV: MotionValue<number>;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Visibility is admin-driven: GET /api/plans only returns active + public
  // plans, so un-publishing a tier on /admin/plans drops it from the carousel
  // too. FAIL-OPEN: if the API is unreachable / empty we show every tier so the
  // hero never renders blank.
  const { data: publicPlans } = usePublicPlans();

  const visibleTiers = useMemo<PlanTier[]>(() => {
    if (!publicPlans || publicPlans.length === 0) return PLAN_TIERS;
    const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().trim();
    const publicIds = new Set<string>();
    for (const p of publicPlans) {
      publicIds.add(norm(p.name));
      publicIds.add(norm(p.slug));
    }
    const filtered = PLAN_TIERS.filter(
      (t) => publicIds.has(norm(t.key)) || publicIds.has(norm(t.pill)),
    );
    // Defensive fail-open: if nothing matched (e.g. API names diverged from our
    // hard-coded tiers) keep the full set rather than blanking the hero.
    return filtered.length > 0 ? filtered : PLAN_TIERS;
  }, [publicPlans]);

  // Clamp the active index when the visible set shrinks (e.g. a tier is
  // un-published while the carousel is mid-cycle).
  useEffect(() => {
    if (activeIdx >= visibleTiers.length) setActiveIdx(0);
  }, [activeIdx, visibleTiers.length]);

  // Mouse parallax motion values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    mouseX.set(((e.clientX - cx) / rect.width) * 8);
    mouseY.set(((e.clientY - cy) / rect.height) * 6);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  // Gentle float loop
  const floatY = useMotionValue(0);
  const floatSpring = useSpring(floatY, { stiffness: 40, damping: 14 });

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = (ts - start) / 1000;
      floatY.set(Math.sin(t * 0.55) * 7);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floatY]);

  // Auto-cycle plans
  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % visibleTiers.length);
    }, AUTOPLAY_INTERVAL);
    return () => window.clearInterval(id);
  }, [visibleTiers.length]);

  const activeTier = visibleTiers[activeIdx % visibleTiers.length]!;

  return (
    <motion.div
      ref={sectionRef}
      style={{ scale: scaleMV, y: yMV }}
      className="relative mx-auto w-full max-w-[1100px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Plan pills above device */}
      <div className="mb-6 flex items-center justify-center">
        <H4PlanPills tiers={visibleTiers} activeIdx={activeIdx} onSelect={setActiveIdx} />
      </div>

      {/* Perspective wrapper for 3D tilt */}
      <div style={{ perspective: 1400, perspectiveOrigin: '50% 50%' }}>
        <motion.div
          style={{
            rotateX: springY,
            rotateY: springX,
            y: floatSpring,
            transformStyle: 'preserve-3d',
          }}
          // Entrance on mount — NOT whileInView (Lenis smooth-scroll breaks the
          // IntersectionObserver, which left the whole dashboard stuck invisible).
          // Animate ONLY opacity + scale here: this element's `style` already
          // drives y/rotateX via spring MotionValues, and animating the same
          // transform keys collides with them and can suppress the entire
          // animation (incl. opacity). opacity + scale don't collide, so the
          // device reliably fades in regardless of scroll position.
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          {/* Glass device */}
          <div
            className="wp-glass relative overflow-hidden rounded-2xl"
            style={{
              boxShadow: 'var(--wp-glass-shadow), 0 0 60px color-mix(in srgb, var(--wp-accent) 12%, transparent)',
            }}
          >
            {/* Window chrome bar */}
            <div
              className="flex items-center gap-1.5 border-b px-4 py-2.5"
              style={{ borderColor: 'var(--wp-border)', background: 'color-mix(in srgb, var(--wp-surface) 80%, transparent)' }}
            >
              {['var(--wp-danger)', 'var(--wp-warning)', 'var(--wp-success)'].map((c, i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.75 }} />
              ))}
              <div className="ml-3 flex-1 text-center">
                <span
                  className="inline-block rounded px-2.5 py-0.5 font-mono text-[10px]"
                  style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)', color: 'var(--wp-text-faint)', border: '1px solid var(--wp-border)' }}
                >
                  app.warmpulse.io · dashboard
                </span>
              </div>
            </div>

            {/* Ambient glow behind content */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--wp-accent) 12%, transparent) 0%, transparent 60%)',
              }}
            />

            {/* Cycling tier dashboard */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeTier.key}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="relative"
              >
                <TierDashboard tier={activeTier} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Signal chips floating around the device */}
      <SignalChipsLayer />

      {/* Soft glow under the device */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 left-[15%] -z-10 h-16 w-[70%] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, color-mix(in srgb, var(--wp-accent) 18%, transparent) 0%, transparent 70%)',
          filter: 'blur(24px)',
        }}
      />

      {/* Dot indicators */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {visibleTiers.map((t, i) => {
          const active = i === activeIdx;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`Show ${t.pill} dashboard`}
              className="rounded-full transition-all"
              style={{
                width: active ? 22 : 6,
                height: 6,
                background: active
                  ? 'var(--wp-accent)'
                  : 'color-mix(in srgb, var(--wp-text-faint) 50%, transparent)',
                boxShadow: active
                  ? '0 0 10px color-mix(in srgb, var(--wp-accent) 60%, transparent)'
                  : 'none',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

/* ============================================================================
   CRM FEATURE BAND — "Then fill your pipeline"

   The second half of the two-in-one story: once warmup lands your mail in the
   inbox, the built-in CRM turns replies into pipeline. This band mirrors the
   visual language of the plan-tier previews above — same glass card recipe,
   same orange-family palette, same motion grammar — but showcases a Kanban
   pipeline instead of a deliverability dashboard.

   Internal components:
     CrmFeatureBand     section wrapper (eyebrow + headline + preview + tiles)
     CrmPipelinePreview glass "screenshot" holding the Kanban board
     CrmStageColumn     one pipeline stage (header + stacked lead cards)
     CrmLeadCard        a single lead (name, company, deal-value chip)

   All data is synthetic + inline — this is a public marketing surface with no
   backend hooks.
============================================================================ */

type CrmTone = 'accent' | 'accent-2' | 'warning' | 'success';

type CrmLead = {
  name: string;
  company: string;
  /** Pre-formatted deal-value chip, e.g. "$4.2k". */
  value: string;
  /** Two-letter initials for the avatar token. */
  initials: string;
};

type CrmStage = {
  key: string;
  label: string;
  tone: CrmTone;
  icon: typeof Kanban;
  leads: CrmLead[];
};

const CRM_STAGES: CrmStage[] = [
  {
    key: 'new',
    label: 'New',
    tone: 'accent-2',
    icon: UserPlus,
    leads: [
      { name: 'Maya Chen', company: 'Northwind Labs', value: '$3.1k', initials: 'MC' },
      { name: 'Devin Park', company: 'Quanta IO', value: '$1.8k', initials: 'DP' },
    ],
  },
  {
    key: 'contacted',
    label: 'Contacted',
    tone: 'accent',
    icon: Send,
    leads: [
      { name: 'Sara Okoye', company: 'Helio Freight', value: '$5.4k', initials: 'SO' },
      { name: 'Tom Virtanen', company: 'Brightloop', value: '$2.6k', initials: 'TV' },
      { name: 'Aria Nasser', company: 'Cedar & Co', value: '$4.0k', initials: 'AN' },
    ],
  },
  {
    key: 'replied',
    label: 'Replied',
    tone: 'warning',
    icon: Reply,
    leads: [
      { name: 'Leo Marchetti', company: 'Vellum Studio', value: '$7.2k', initials: 'LM' },
      { name: 'Priya Rao', company: 'Stackforge', value: '$3.9k', initials: 'PR' },
    ],
  },
  {
    key: 'interested',
    label: 'Interested',
    tone: 'success',
    icon: Handshake,
    leads: [
      { name: 'Jonas Weber', company: 'Lumen Retail', value: '$12.5k', initials: 'JW' },
      { name: 'Hana Sato', company: 'Driftwood', value: '$6.8k', initials: 'HS' },
    ],
  },
  {
    key: 'won',
    label: 'Won',
    tone: 'success',
    icon: Trophy,
    leads: [
      { name: 'Owen Blake', company: 'Mercer Group', value: '$18.0k', initials: 'OB' },
    ],
  },
];

/** Resolve a tone key to its themed surface/border/text triplet. */
function crmTone(tone: CrmTone) {
  const c = `var(--wp-${tone})`;
  return {
    text: c,
    soft: `color-mix(in srgb, ${c} 12%, transparent)`,
    softer: `color-mix(in srgb, ${c} 8%, transparent)`,
    line: `color-mix(in srgb, ${c} 32%, transparent)`,
  };
}

/* ----------------------------------------------------------------------------
   CRM band motion variants — one IntersectionObserver per logical group drives
   everything below via staggerChildren. Children are variant-only (NO per-child
   whileInView/viewport), so they can never mis-fire or get stuck on fast scroll.
---------------------------------------------------------------------------- */

// Container variants: empty hidden state, staggered reveal on `show`.
const crmContainerV = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
// The preview "screenshot" fades up AND orchestrates its column cascade — one
// observer for the whole group. Columns are variant children (no own observer).
const crmPreviewV = {
  hidden: { opacity: 0, y: 36 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.08, delayChildren: 0.2 },
  },
};
// A column reveals its own cards with a tighter, column-scoped stagger.
const crmColumnV = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.08, delayChildren: 0.12 },
  },
};
const crmCardV = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
// Text cluster (eyebrow / headline / intro): one observer, staggered lines.
const crmTextV = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
// Feature tiles: one observer, staggered tiles.
const crmTileV = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};


/* ----------------------------------------------------------------------------
   CrmLeadCard — a single draggable-looking lead. Name + company + value chip,
   with an initials avatar and a faint grip affordance on hover.
---------------------------------------------------------------------------- */

function CrmLeadCard({ lead, tone }: { lead: CrmLead; tone: CrmTone }) {
  const t = crmTone(tone);
  return (
    <motion.div
      variants={crmCardV}
      whileHover={{ y: -3 }}
      className="group/card relative rounded-xl p-3"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid var(--wp-border)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.16)',
      }}
    >
      {/* tone accent rail */}
      <span
        aria-hidden
        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
        style={{ background: t.line }}
      />
      <div className="flex items-center gap-2 pl-1.5">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
          style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}
        >
          {lead.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12.5px] font-semibold leading-tight"
            style={{ color: 'var(--wp-text)' }}
          >
            {lead.name}
          </div>
          <div className="flex items-center gap-1 truncate">
            <Building2 size={9} strokeWidth={1.8} style={{ color: 'var(--wp-text-faint)' }} />
            <span
              className="truncate text-[10.5px] leading-tight"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              {lead.company}
            </span>
          </div>
        </div>
        <GripVertical
          size={13}
          strokeWidth={1.8}
          className="shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100"
          style={{ color: 'var(--wp-text-faint)' }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between pl-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
          style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}
        >
          <CircleDollarSign size={10} strokeWidth={2.2} />
          {lead.value}
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          #{lead.initials}-{(lead.value.replace(/\D/g, '') || '0').padStart(3, '0')}
        </span>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
   CrmStageColumn — a pipeline stage: tinted header with count + total, then a
   stack of lead cards. Whole column fades up; cards stagger inside.
---------------------------------------------------------------------------- */

function CrmStageColumn({ stage }: { stage: CrmStage }) {
  const t = crmTone(stage.tone);
  const Icon = stage.icon;
  // sum of deal values shown in the column footer (synthetic, pre-parsed)
  const total = stage.leads.reduce(
    (sum, l) => sum + parseFloat(l.value.replace(/[^0-9.]/g, '')),
    0,
  );

  return (
    <motion.div
      variants={crmColumnV}
      className="flex w-[180px] shrink-0 flex-col rounded-2xl p-2.5 md:w-auto md:flex-1"
      style={{
        background: 'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
        border: '1px solid var(--wp-border)',
      }}
    >
      {/* column header */}
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-md"
            style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}
          >
            <Icon size={11} strokeWidth={2} />
          </span>
          <span
            className="text-[12px] font-semibold"
            style={{ color: 'var(--wp-text)' }}
          >
            {stage.label}
          </span>
        </div>
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-bold tabular-nums"
          style={{ background: t.softer, color: t.text }}
        >
          {stage.leads.length}
        </span>
      </div>

      {/* lead cards — cascade via the column's own staggerChildren */}
      <div className="flex flex-col gap-2">
        {stage.leads.map((lead) => (
          <CrmLeadCard key={lead.name} lead={lead} tone={stage.tone} />
        ))}
      </div>

      {/* column total footer */}
      <div
        className="mt-2.5 flex items-center justify-between rounded-lg px-2 py-1.5"
        style={{ background: 'color-mix(in srgb, var(--wp-surface) 70%, transparent)' }}
      >
        <span
          className="font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          Pipeline
        </span>
        <span
          className="font-mono text-[11px] font-semibold tabular-nums"
          style={{ color: t.text }}
        >
          ${total.toFixed(1)}k
        </span>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
   CrmMobileBoard — mobile (<640px) rendition of the Kanban board: a vertical
   accordion. Each stage is a tinted header (icon · label · count · $ total)
   that expands to reveal its lead cards. Replaces the horizontal-scroll board
   on small screens; the desktop board stays untouched at ≥640px.
---------------------------------------------------------------------------- */

function CrmMobileBoard() {
  const [open, setOpen] = useState<string | null>(CRM_STAGES[0]!.key);
  return (
    <div className="space-y-2 sm:hidden">
      {CRM_STAGES.map((stage) => {
        const t = crmTone(stage.tone);
        const Icon = stage.icon;
        const isOpen = open === stage.key;
        const total = stage.leads.reduce(
          (sum, l) => sum + parseFloat(l.value.replace(/[^0-9.]/g, '')),
          0,
        );
        return (
          <div
            key={stage.key}
            className="overflow-hidden rounded-xl"
            style={{ border: `1px solid ${t.line}` }}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : stage.key)}
              className="flex w-full items-center justify-between px-3 py-2.5"
              style={{ background: t.softer }}
            >
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md" style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}>
                  <Icon size={12} strokeWidth={2} />
                </span>
                {stage.label}
                <span className="font-mono text-[11px]" style={{ color: t.text }}>· {stage.leads.length}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: t.text }}>${total.toFixed(1)}k</span>
                <ChevronDown size={15} style={{ color: 'var(--wp-text-faint)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 p-2">
                    {stage.leads.map((lead) => (
                      <CrmLeadCard key={lead.name} lead={lead} tone={stage.tone} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   CrmPipelinePreview — the glass "product screenshot". Window header (board
   switcher + summary chips), then the horizontally-scrollable Kanban board.
   A subtle looping toast advertises a lead advancing a stage.
---------------------------------------------------------------------------- */

function CrmPipelinePreview() {
  const totalLeads = CRM_STAGES.reduce((n, s) => n + s.leads.length, 0);
  const reduce = useReducedMotion();

  return (
    <motion.div
      variants={crmPreviewV}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      className="wp-glass relative overflow-hidden rounded-2xl"
    >
      {/* ambient orange wash inside the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-16"
        style={{
          background:
            'radial-gradient(ellipse at center top, color-mix(in srgb, var(--wp-accent) 16%, transparent) 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative px-4 pb-4 pt-3.5 md:px-5 md:pb-5">
        {/* window header */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                color: 'var(--wp-accent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)',
              }}
            >
              <Kanban size={16} strokeWidth={1.9} />
            </span>
            <div>
              <div
                className="font-mono text-[9.5px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                CRM / Pipeline
              </div>
              <div
                className="text-[15px] font-semibold tracking-tight"
                style={{ color: 'var(--wp-text)' }}
              >
                Q2 Outreach Board
              </div>
            </div>
          </div>

          {/* summary chips */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 28%, transparent)',
                color: 'var(--wp-accent)',
              }}
            >
              <Users size={11} strokeWidth={2} />
              {totalLeads} leads
            </span>
            <span
              className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold sm:inline-flex"
              style={{
                background: 'color-mix(in srgb, var(--wp-success) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-success) 30%, transparent)',
                color: 'var(--wp-success)',
              }}
            >
              <TrendingUp size={11} strokeWidth={2.2} />
              $85.6k pipeline
            </span>
          </div>
        </header>

        {/* Mobile (<640px): vertical accordion. */}
        <CrmMobileBoard />

        {/* Kanban board — horizontal scroll on small screens, 5-col grid on lg.
            Hidden below `sm`, where the accordion takes over. Variant child of
            the preview: inherits `show`, then staggers columns. */}
        <motion.div
          variants={crmContainerV}
          className="-mx-1 hidden gap-2.5 overflow-x-auto px-1 pb-1 sm:flex md:grid md:grid-cols-5 md:overflow-visible"
        >
          {CRM_STAGES.map((stage) => (
            <CrmStageColumn key={stage.key} stage={stage} />
          ))}
        </motion.div>

        {/* looping "lead advanced" toast — tasteful, low-frequency. Honors
            reduced-motion by rendering the static settled state (no loop). */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={
            reduce
              ? { opacity: 1, y: 0 }
              : { opacity: [0, 0, 1, 1, 0], y: [10, 10, 0, 0, -6] }
          }
          transition={
            reduce
              ? { duration: 0 }
              : {
                  duration: 6,
                  times: [0, 0.35, 0.45, 0.85, 1],
                  repeat: Infinity,
                  repeatDelay: 1.5,
                  ease: 'easeInOut',
                }
          }
          className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 sm:flex"
          style={{
            background: 'var(--wp-glass-bg)',
            border: '1px solid color-mix(in srgb, var(--wp-success) 32%, transparent)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          }}
        >
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              background: 'color-mix(in srgb, var(--wp-success) 18%, transparent)',
              color: 'var(--wp-success)',
            }}
          >
            <Check size={11} strokeWidth={2.6} />
          </span>
          <span className="text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>
            <strong style={{ color: 'var(--wp-text)' }}>Jonas Weber</strong> moved to{' '}
            <strong style={{ color: 'var(--wp-success)' }}>Interested</strong>
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
   CRM feature tiles + tier-availability note — small supporting rows beneath
   the pipeline preview.
---------------------------------------------------------------------------- */

const CRM_FEATURES = [
  {
    icon: Kanban,
    titleKey: 'landing.crm.kanban.title',
    bodyKey: 'landing.crm.kanban.body',
  },
  {
    icon: Users,
    titleKey: 'landing.crm.leadMgmt.title',
    bodyKey: 'landing.crm.leadMgmt.body',
  },
  {
    icon: CircleDollarSign,
    titleKey: 'landing.crm.dealTracking.title',
    bodyKey: 'landing.crm.dealTracking.body',
  },
  {
    icon: FileSpreadsheet,
    titleKey: 'landing.crm.csvImport.title',
    bodyKey: 'landing.crm.csvImport.body',
  },
];

const CRM_TIERS = [
  { label: 'Starter', noteKey: 'landing.crm.tier.addon', tone: 'accent-2' as CrmTone, icon: ArrowRight },
  { label: 'Pro', noteKey: 'landing.crm.tier.campaigns3', tone: 'accent' as CrmTone, icon: Check },
  { label: 'Pro Plus', noteKey: 'landing.crm.tier.campaigns10', tone: 'warning' as CrmTone, icon: Check },
  { label: 'Agency', noteKey: 'landing.crm.tier.unlimited', tone: 'success' as CrmTone, icon: Crown },
];

function CrmFeatureBand() {
  const t = useT();
  return (
    <section
      id="crm"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-32"
    >
      {/* eyebrow + headline + intro (mirrors HeroSections.SectionHeader).
          One observer on the cluster; lines cascade via staggerChildren. */}
      <motion.div
        variants={crmContainerV}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="mb-14 max-w-3xl text-center md:mx-auto"
      >
        <motion.span
          variants={crmTextV}
          className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-accent)' }}
        >
          <Kanban size={13} strokeWidth={2.2} />
          {t('landing.crm.eyebrow')}
        </motion.span>
        <motion.h2
          variants={crmTextV}
          className="mt-4 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[52px]"
          style={{ color: 'var(--wp-text)' }}
        >
          {t('landing.crm.headline1')}{' '}
          <span className="wp-headline-grad">{t('landing.crm.headline2')}</span>
        </motion.h2>
        <motion.p
          variants={crmTextV}
          className="mt-5 text-[17px] leading-[1.55]"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          {t('landing.crm.intro')}
        </motion.p>
      </motion.div>

      {/* pipeline preview */}
      <CrmPipelinePreview />

      {/* feature tiles — one observer on the row; tiles cascade via stagger */}
      <motion.div
        variants={crmContainerV}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {CRM_FEATURES.map((f) => (
          <motion.div
            key={f.titleKey}
            variants={crmTileV}
            whileHover={{ y: -4 }}
            className="wp-glass group relative overflow-hidden rounded-2xl p-5"
          >
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 22%, transparent), transparent 70%)',
                filter: 'blur(20px)',
              }}
            />
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                color: 'var(--wp-accent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)',
              }}
            >
              <f.icon size={18} strokeWidth={1.8} />
            </span>
            <h3
              className="mt-4 text-[15px] font-semibold tracking-tight"
              style={{ color: 'var(--wp-text)' }}
            >
              {t(f.titleKey)}
            </h3>
            <p
              className="mt-1.5 text-[13px] leading-[1.5]"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              {t(f.bodyKey)}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* tier-availability note — single observer (no nested children) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 flex flex-col items-center gap-3 text-center"
      >
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {t('landing.crm.includedOn')}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {CRM_TIERS.map((tier) => {
            const ct = crmTone(tier.tone);
            const TierIcon = tier.icon;
            return (
              <span
                key={tier.label}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
                style={{
                  background: ct.softer,
                  border: `1px solid ${ct.line}`,
                  color: 'var(--wp-text)',
                }}
              >
                <TierIcon size={12} strokeWidth={2.2} style={{ color: ct.text }} />
                {tier.label}
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.1em]"
                  style={{ color: ct.text }}
                >
                  {t(tier.noteKey)}
                </span>
              </span>
            );
          })}
        </div>
        <p className="text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>
          {t('landing.crm.starterNote')}{' '}
          <Link
            to="/signup?plan=pro"
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--wp-accent)' }}
          >
            {t('landing.crm.goProCta')}
          </Link>
        </p>
      </motion.div>
    </section>
  );
}

/* ============================================================================
   Mobile hero band (Design D — Bold Minimal)

   Shown only below the `sm` breakpoint (<640px); the desktop immersive hero
   is hidden on mobile. Oversized gradient headline, inline trust metrics,
   primary + secondary CTA pinned toward the bottom. Uses the same copy,
   tokens and gradient treatment as the desktop hero.
============================================================================ */

function MobileHeroBand() {
  const t = useT();
  const metrics: [string, string, string][] = [
    ['+42%', t('landing.hero.metricOpenRate'), 'openRate'],
    ['94%', t('landing.hero.metricInbox'), 'inbox'],
    ['4.8', t('landing.hero.metricG2'), 'g2'],
  ];
  return (
    <section className="relative z-10 flex min-h-screen flex-col px-6 pb-14 pt-28 sm:hidden">
      {/* Live announcement pill */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="wp-glass inline-flex h-8 w-fit items-center gap-2 rounded-full px-3"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full" style={{ background: 'var(--wp-success)', opacity: 0.7 }} />
          <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: 'var(--wp-success)' }} />
        </span>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-success)' }}>
          {t('landing.hero.live')}
        </span>
        <span className="h-3 w-px" style={{ background: 'var(--wp-border-strong)' }} />
        <span className="text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>
          <span className="font-mono" style={{ color: 'var(--wp-accent)' }}>2,841</span> {t('landing.hero.engagingNow')}
        </span>
      </motion.div>

      {/* Headline block — vertically centered in the remaining space */}
      <div className="flex flex-1 flex-col justify-center">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--wp-accent)' }}
        >
          {t('landing.hero.eyebrow')}
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 font-sans text-[52px] font-bold leading-[0.98] tracking-[-0.045em]"
        >
          <span style={{ color: 'var(--wp-text)', display: 'block' }}>{t('landing.hero.headline1a')}</span>
          <span style={{ color: 'var(--wp-text)', display: 'block' }}>{t('landing.hero.headline1b')}</span>
          <span className="wp-headline-grad block">{t('landing.hero.headline2')}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.28 }}
          className="mt-5 text-[15px] leading-[1.6]"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          {t('landing.hero.subtitleMobile')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 flex items-center gap-4"
        >
          {metrics.map(([v, l, k]) => (
            <div key={k} className="flex items-center gap-1.5">
              <TrendingUp size={14} style={{ color: 'var(--wp-success)' }} />
              <span className="font-mono text-[16px] font-bold" style={{ color: 'var(--wp-text)' }}>{v}</span>
              <span className="text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>{l}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* CTAs pinned toward the bottom */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="flex flex-col gap-3"
      >
        <Link
          to="/signup"
          className="wp-cta-pulse group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
          style={{
            background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
            color: '#fff',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 28px color-mix(in srgb, var(--wp-accent) 40%, transparent)',
          }}
        >
          {t('hero.startWarmingFree')}
          <ArrowRight size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          to="/how-it-works"
          className="wp-glass inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium"
          style={{ color: 'var(--wp-text)' }}
        >
          <PlayCircle size={16} strokeWidth={1.8} />
          {t('hero.seeHowItWorks')}
        </Link>
        <a
          href={APP_APK_URL}
          download
          className="wp-glass inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium"
          style={{ color: 'var(--wp-text)' }}
        >
          <Smartphone size={16} strokeWidth={1.8} />
          {t('hero.downloadApp')}
        </a>
        <div className="mt-1 flex items-center justify-center gap-2 text-[12px]" style={{ color: 'var(--wp-text-faint)' }}>
          <Check size={14} strokeWidth={2} style={{ color: 'var(--wp-success)' }} />
          {t('hero.trustLine')}
        </div>
      </motion.div>
    </section>
  );
}

/* ============================================================================
   Mobile dashboard showcase (Design C — KPI Summary)

   The desktop hero's tilted device carousel is hidden below `sm`. This is its
   mobile stand-in: tier pills (auto-cycling, same 5.5s cadence) over a single
   centered warmth gauge + "this week" delta + a 3-KPI summary row. Numbers
   mirror each tier's real dashboard so the showcase stays recognisable.
============================================================================ */

type MobileTierContent = {
  key: string;
  warmth: number;
  delta: number;
  headline: string;
  kpis: [string, string][];
};

const MOBILE_TIER_CONTENT: MobileTierContent[] = [
  { key: 'starter', warmth: 74, delta: 3, headline: 'alex@lumen-labs.com', kpis: [['Sends', '18/20'], ['Opens', '82%'], ['Inbox', '91.0%']] },
  { key: 'pro', warmth: 86, delta: 2, headline: 'Workspace warmth · 4 mailboxes', kpis: [['Mailboxes', '4'], ['Avg warmth', '86'], ['Inbox', '93.1%']] },
  { key: 'pro_plus', warmth: 92, delta: 1.3, headline: 'Mailbox console · 12 mailboxes', kpis: [['Sends', '70/75'], ['Opens', '78%'], ['Inbox', '92.4%']] },
  { key: 'agency', warmth: 89, delta: 2, headline: 'Northwind Agency · 8 sub-clients', kpis: [['Clients', '8'], ['Mailboxes', '37'], ['Inbox', '94.0%']] },
];

function MobileWarmthGauge({ value, size = 120 }: { value: number; size?: number }) {
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - value / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--wp-border)" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--wp-accent)" strokeWidth={7} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[28px] font-bold leading-none" style={{ color: 'var(--wp-text)' }}>{value}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>warmth</span>
      </div>
    </div>
  );
}

function MobileDashboardShowcase() {
  const t = useT();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % MOBILE_TIER_CONTENT.length);
    }, AUTOPLAY_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  const content = MOBILE_TIER_CONTENT[active]!;
  const planTier = PLAN_TIERS.find((pt) => pt.key === content.key) ?? PLAN_TIERS[0]!;

  return (
    <section className="relative z-10 px-6 pb-16 sm:hidden">
      <div className="mb-6 text-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>
          {t('landing.mobile.onePlatform')}
        </span>
        <h2 className="mt-3 text-[28px] font-bold leading-[1.1] tracking-[-0.03em]">
          {t('landing.mobile.seeIt')} <span className="wp-headline-grad">{t('landing.mobile.inAction')}</span>
        </h2>
      </div>

      {/* tier pills */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {MOBILE_TIER_CONTENT.map((c, i) => {
          const on = i === active;
          const pt = PLAN_TIERS.find((tier) => tier.key === c.key)!;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive(i)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                background: on ? 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))' : 'transparent',
                border: `1px solid ${on ? 'transparent' : 'var(--wp-border)'}`,
                color: on ? '#fff' : 'var(--wp-text-dim)',
              }}
            >
              {pt.pill}
            </button>
          );
        })}
      </div>

      {/* summary card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={content.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="wp-glass flex flex-col items-center gap-4 rounded-2xl p-6"
        >
          <TierBadge tier={planTier} />
          <MobileWarmthGauge value={content.warmth} />
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'color-mix(in srgb, var(--wp-success) 12%, transparent)' }}>
            <TrendingUp size={12} style={{ color: 'var(--wp-success)' }} />
            <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--wp-success)' }}>+{content.delta} this week</span>
          </div>
          <div className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)' }}>{content.headline}</div>
          <div className="grid w-full grid-cols-3 gap-2">
            {content.kpis.map(([l, v]) => (
              <div key={l} className="rounded-xl px-2 py-2.5 text-center" style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)', border: '1px solid var(--wp-border)' }}>
                <div className="font-mono text-[15px] font-bold" style={{ color: 'var(--wp-accent)' }}>{v}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{l}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* dot indicators */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {MOBILE_TIER_CONTENT.map((c, i) => {
          const on = i === active;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${c.key} dashboard`}
              className="rounded-full transition-all"
              style={{ width: on ? 22 : 6, height: 6, background: on ? 'var(--wp-accent)' : 'color-mix(in srgb, var(--wp-text-faint) 50%, transparent)' }}
            />
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================================
   Main hero
============================================================================ */

export function NewHero() {
  const t = useT();
  const [theme, setTheme] = useTheme();
  const heroRef = useRef<HTMLElement>(null);

  const { scrollY } = useScroll();

  // Scroll-driven scale/offset passed into the carousel
  const { scrollYProgress: carouselProgress } = useScroll({
    target: heroRef,
    offset: ['start end', 'center center'],
  });
  const carouselScale = useTransform(carouselProgress, [0, 1], [0.88, 1]);
  const carouselY = useTransform(carouselProgress, [0, 1], [80, 0]);

  // Headline parallax-ish fade
  const headlineOpacity = useTransform(scrollY, [0, 400], [1, 0.2]);
  const headlineY = useTransform(scrollY, [0, 400], [0, -60]);

  return (
    <div
      className="wp-hero relative min-h-[200vh] w-full overflow-x-hidden"
      style={{
        background: 'var(--wp-bg)',
        color: 'var(--wp-text)',
      }}
    >
      <Atmosphere />
      <GlassNav theme={theme} setTheme={setTheme} />

      {/* Mobile hero (Design D) — shown only <640px. */}
      <MobileHeroBand />

      {/* Mobile dashboard showcase (Design C) — stand-in for the desktop
          device carousel, shown only <640px. */}
      <MobileDashboardShowcase />

      {/* ============================================================
          HERO BAND — H4 Immersive layout (desktop / ≥640px)
          Announcement pill → eyebrow → headline → subcopy → CTAs →
          trust line → plan device (tilted + parallax + signal chips) →
          stats strip
      ============================================================ */}
      <section
        ref={heroRef}
        className="relative z-10 mx-auto hidden max-w-6xl flex-col items-center px-6 pb-20 pt-36 text-center sm:flex md:pt-44"
      >
        {/* Announcement pill */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="wp-glass mb-7 inline-flex h-9 items-center gap-2 rounded-full px-3"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: 'var(--wp-success)', opacity: 0.7 }}
            />
            <span
              className="relative h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--wp-success)' }}
            />
          </span>
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: 'var(--wp-success)' }}
          >
            {t('landing.hero.live')}
          </span>
          <span className="h-3.5 w-px" style={{ background: 'var(--wp-border-strong)' }} />
          <span className="text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>
            <span className="font-mono" style={{ color: 'var(--wp-accent)' }}>2,841</span>{' '}
            {t('landing.hero.engagingRightNow')}
          </span>
        </motion.div>

        {/* Eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-5 font-mono text-[12px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--wp-accent)' }}
        >
          {t('landing.hero.eyebrow')}
        </motion.span>

        {/* Headline */}
        <motion.h1
          style={{ opacity: headlineOpacity, y: headlineY }}
          className="font-sans text-[44px] font-bold leading-[1.02] tracking-[-0.04em] md:text-[68px] lg:text-[84px]"
        >
          <motion.span
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ color: 'var(--wp-text)', display: 'block' }}
          >
            {t('landing.hero.headline1')}
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="wp-headline-grad block"
          >
            {t('landing.hero.headline2')}
          </motion.span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.36 }}
          className="mt-7 max-w-2xl text-[17px] leading-[1.6] md:text-[19px]"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.46 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/signup"
            className="wp-cta-pulse group inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
              color: '#fff',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 28px color-mix(in srgb, var(--wp-accent) 40%, transparent)',
            }}
          >
            {t('hero.startWarmingFree')}
            <ArrowRight size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/how-it-works"
            className="wp-glass inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium"
            style={{ color: 'var(--wp-text)' }}
          >
            <PlayCircle size={16} strokeWidth={1.8} />
            {t('hero.seeHowItWorks')}
          </Link>
          <a
            href={APP_APK_URL}
            download
            className="wp-glass inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium"
            style={{ color: 'var(--wp-text)' }}
          >
            <Smartphone size={16} strokeWidth={1.8} />
            {t('hero.downloadApp')}
          </a>
        </motion.div>

        {/* Trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="mt-5 flex items-center gap-2 text-[12px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          <Check size={14} strokeWidth={2} style={{ color: 'var(--wp-success)' }} />
          {t('hero.trustLine')}
        </motion.div>

        {/* ── PLAN DEVICE (H4 Immersive centerpiece) ── */}
        <div className="mt-14 w-full px-0 md:mt-16">
          <PlanTiersCarousel scaleMV={carouselScale} yMV={carouselY} />
        </div>

        {/* Stats strip — below the device */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-16 grid w-full max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl md:grid-cols-4"
          style={{
            background: 'var(--wp-border)',
            border: '1px solid var(--wp-border)',
          }}
        >
          {[
            { value: 2841,  format: (n: number) => n.toLocaleString(), labelKey: 'landing.stats.peerMailboxes'   },
            { value: 94.2,  format: (n: number) => `${n.toFixed(1)}%`, labelKey: 'landing.stats.inboxPlacement'  },
            { value: 12400, format: (n: number) => `${(n / 1000).toFixed(1)}k`, labelKey: 'landing.stats.mailboxesWarmed' },
            { value: 4.8,   format: (n: number) => n.toFixed(1),       labelKey: 'landing.stats.g2Rating'        },
          ].map((s) => (
            <div
              key={s.labelKey}
              className="flex flex-col items-center justify-center p-6"
              style={{ background: 'var(--wp-bg)' }}
            >
              <span
                className="font-mono text-[28px] font-bold tabular-nums md:text-[36px]"
                style={{ color: 'var(--wp-text)' }}
              >
                <CountUp to={s.value} format={s.format} />
              </span>
              <span
                className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                {t(s.labelKey)}
              </span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ---------- CRM half — "then fill your pipeline" ---------- */}
      <CrmFeatureBand />

      {/* ---------- additional sections (Product / Peer / Pricing) ---------- */}
      <ProductSection />
      <PeerNetworkSection />
      <PricingSection />
      <FinalCTA />

      {/* ---------- Footer with legal links ---------- */}
      <footer
        className="relative z-10 mx-auto mt-20 max-w-6xl border-t px-6 py-10 text-center"
        style={{ borderColor: 'var(--wp-border)' }}
      >
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={2} style={{ color: 'var(--wp-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--wp-text-dim)' }}>
              © {new Date().getFullYear()} WarmPulse. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link to="/privacy" style={{ color: 'var(--wp-text-dim)' }} className="hover:opacity-100 transition-opacity">
              Privacy Policy
            </Link>
            <Link to="/terms" style={{ color: 'var(--wp-text-dim)' }} className="hover:opacity-100 transition-opacity">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
