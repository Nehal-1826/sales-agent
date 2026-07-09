import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { useCurrency } from '@/lib/currency';
import { useT } from '@/lib/i18n';
import { usePublicPlans, planSlug, type PublicPlan } from '@/features/plans/publicPlans';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Code2,
  Gauge,
  Mail,
  Network,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  Zap,
} from 'lucide-react';

/* ============================================================================
   Section header — reusable eyebrow + h2 + intro
============================================================================ */

function SectionHeader({
  eyebrow,
  title,
  intro,
  align = 'center',
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
  align?: 'center' | 'left';
}) {
  const alignClass = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <div className={`mb-16 max-w-3xl ${alignClass}`}>
      <motion.span
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.5 }}
        className="inline-block font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: 'var(--wp-accent)' }}
      >
        {eyebrow}
      </motion.span>
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.6, delay: 0.08 }}
        className="mt-4 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[52px]"
        style={{ color: 'var(--wp-text)' }}
      >
        {title}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.6, delay: 0.18 }}
        className="mt-5 text-[17px] leading-[1.55]"
        style={{ color: 'var(--wp-text-dim)' }}
      >
        {intro}
      </motion.p>
    </div>
  );
}

/* ============================================================================
   PRODUCT — 3 feature cards, stagger-up on scroll
============================================================================ */

const PRODUCT_FEATURES = [
  { icon: Network, keyBase: 'sections.feature.realTestAccounts' },
  { icon: Gauge, keyBase: 'sections.feature.smartScaling' },
  { icon: ShieldCheck, keyBase: 'sections.feature.domainHealth' },
  { icon: Bot, keyBase: 'sections.feature.aiEmails' },
  { icon: BarChart3, keyBase: 'sections.feature.inboxStats' },
  { icon: Zap, keyBase: 'sections.feature.spamRescue' },
];

export function ProductSection() {
  const t = useT();
  return (
    <section
      id="product"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-32"
    >
      <SectionHeader
        eyebrow={t('sections.product.eyebrow')}
        title={
          <>
            {t('sections.product.title1')}{' '}
            <span className="wp-headline-grad">{t('sections.product.title2')}</span>
          </>
        }
        intro={t('sections.product.intro')}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRODUCT_FEATURES.map((f, i) => (
          <motion.div
            key={f.keyBase}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            className="wp-glass group relative overflow-hidden rounded-2xl p-6"
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
              className="mt-5 text-[18px] font-semibold tracking-tight"
              style={{ color: 'var(--wp-text)' }}
            >
              {t(`${f.keyBase}.title`)}
            </h3>
            <p
              className="mt-2 text-[14px] leading-[1.55]"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              {t(`${f.keyBase}.body`)}
            </p>
            <span
              className="mt-5 inline-block font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {t(`${f.keyBase}.stat`)}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================================
   PEER NETWORK — sticky pinned reveal with orbiting mailbox nodes
============================================================================ */

const PEER_NODES = [
  { label: 'gmail', short: '@gmail', r: 0, color: 'var(--wp-accent)' },
  { label: 'outlook', short: '@outlook', r: 51, color: 'var(--wp-accent-2)' },
  { label: 'yahoo', short: '@yahoo', r: 102, color: 'var(--wp-warning)' },
  { label: 'protonmail', short: '@proton', r: 153, color: 'var(--wp-success)' },
  { label: 'zoho', short: '@zoho', r: 204, color: 'var(--wp-accent)' },
  { label: 'fastmail', short: '@fastmail', r: 256, color: 'var(--wp-accent-2)' },
  { label: 'aol', short: '@aol', r: 307, color: 'var(--wp-warning)' },
  { label: 'icloud', short: '@icloud', r: 358, color: 'var(--wp-success)' },
];

/* Mobile (<640px) peer orbit — contained, icon-only dots, continuous rotation.
   Replaces the desktop orbital diagram whose labelled pills overflow on phones. */
function PeerOrbitMobile() {
  return (
    <div className="sm:hidden">
      <div className="relative mx-auto aspect-square w-full max-w-[300px]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="absolute rounded-full" style={{ inset: `${i * 14}%`, border: '1px dashed var(--wp-border-strong)', opacity: 0.5 - i * 0.1 }} />
        ))}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {PEER_NODES.map((_, i) => {
            const a = (i / PEER_NODES.length) * Math.PI * 2;
            return <line key={i} x1="50" y1="50" x2={50 + Math.cos(a) * 39} y2={50 + Math.sin(a) * 39} stroke="var(--wp-accent)" strokeOpacity="0.18" strokeWidth="0.3" strokeDasharray="0.5 0.8" />;
          })}
        </svg>
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))', boxShadow: '0 0 40px color-mix(in srgb, var(--wp-accent) 50%, transparent)' }}>
            <Sparkles size={26} color="#fff" strokeWidth={2} />
            <motion.span className="absolute inset-0 rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))' }} animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
          </div>
        </motion.div>
        <motion.div className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
          {PEER_NODES.map((node, i) => {
            const a = (i / PEER_NODES.length) * Math.PI * 2;
            const x = 50 + Math.cos(a) * 39;
            const y = 50 + Math.sin(a) * 39;
            return (
              <motion.div
                key={node.label}
                className="absolute"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
              >
                <motion.div className="wp-glass flex h-9 w-9 items-center justify-center rounded-full" animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
                  <Mail size={13} style={{ color: node.color }} strokeWidth={2} />
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
      <p className="mt-3 text-center font-mono text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>2,841 accounts · 14 providers</p>
    </div>
  );
}

export function PeerNetworkSection() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const orbitRotate = useTransform(scrollYProgress, [0, 1], [0, 360]);

  return (
    <section
      id="peer-network"
      ref={ref}
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-32"
    >
      <SectionHeader
        eyebrow={t('sections.peer.eyebrow')}
        title={
          <>
            {t('sections.peer.title1')}<br />
            <span className="wp-headline-grad">{t('sections.peer.title2')}</span>
          </>
        }
        intro={t('sections.peer.intro')}
      />

      <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Mobile (<640px): contained animated orbit. */}
        <PeerOrbitMobile />

        {/* Left: orbital diagram — desktop / ≥640px (pills overflow on phones). */}
        <div className="relative mx-auto hidden aspect-square w-full max-w-[520px] sm:block">
          {/* concentric rings */}
          {[1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.7, delay: i * 0.08 }}
              className="absolute rounded-full"
              style={{
                top: `${i * 8}%`,
                left: `${i * 8}%`,
                right: `${i * 8}%`,
                bottom: `${i * 8}%`,
                border: '1px dashed var(--wp-border-strong)',
                opacity: 0.5 - i * 0.08,
              }}
            />
          ))}

          {/* center: WarmPulse hub */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))',
                boxShadow:
                  '0 0 60px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
              }}
            >
              <Sparkles size={28} color="#fff" strokeWidth={2} />
            </div>
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))',
              }}
            />
          </motion.div>

          {/* rotating orbit container */}
          <motion.div
            style={{ rotate: orbitRotate }}
            className="absolute inset-0"
          >
            {PEER_NODES.map((node, i) => {
              const angle = (i / PEER_NODES.length) * Math.PI * 2;
              const radius = 38; // % of container
              const x = 50 + Math.cos(angle) * radius;
              const y = 50 + Math.sin(angle) * radius;
              return (
                <motion.div
                  key={node.label}
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
                  className="absolute"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <motion.div
                    style={{ rotate: useTransform(orbitRotate, (v) => -v) }}
                    className="wp-glass flex items-center gap-2 rounded-full px-3 py-1.5"
                  >
                    <Mail size={11} style={{ color: node.color }} strokeWidth={2} />
                    <span
                      className="font-mono text-[10px] font-medium"
                      style={{ color: 'var(--wp-text)' }}
                    >
                      peer-{(node.r + 1000).toString().padStart(4, '0')}{node.short}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* connection lines (svg overlay) */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {PEER_NODES.map((_, i) => {
              const angle = (i / PEER_NODES.length) * Math.PI * 2;
              const x = 50 + Math.cos(angle) * 38;
              const y = 50 + Math.sin(angle) * 38;
              return (
                <line
                  key={i}
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  stroke="var(--wp-accent)"
                  strokeOpacity="0.15"
                  strokeWidth="0.2"
                  strokeDasharray="0.5 0.8"
                />
              );
            })}
          </svg>
        </div>

        {/* Right: stats + bullets */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { labelKey: 'sections.peer.stat.gmail', value: '1,420' },
              { labelKey: 'sections.peer.stat.outlook', value: '962' },
              { labelKey: 'sections.peer.stat.yahoo', value: '274' },
              { labelKey: 'sections.peer.stat.other', value: '185' },
            ].map((s, i) => (
              <motion.div
                key={s.labelKey}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="wp-glass rounded-xl p-4"
              >
                <div
                  className="font-mono text-[26px] font-bold tabular-nums"
                  style={{ color: 'var(--wp-text)' }}
                >
                  {s.value}
                </div>
                <div
                  className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  {t(s.labelKey)}
                </div>
              </motion.div>
            ))}
          </div>

          <ul className="space-y-3">
            {[
              'sections.peer.bullet.0',
              'sections.peer.bullet.1',
              'sections.peer.bullet.2',
              'sections.peer.bullet.3',
            ].map((bulletKey, i) => (
              <motion.li
                key={bulletKey}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-10%' }}
                transition={{ duration: 0.5, delay: 0.35 + i * 0.08 }}
                className="flex items-start gap-3 text-[14px]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-success) 18%, transparent)',
                    color: 'var(--wp-success)',
                  }}
                >
                  <Check size={11} strokeWidth={2.4} />
                </span>
                {t(bulletKey)}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   PRICING — fallback-only marketing copy + prices. Live price/features come
   from /api/plans (admin Plans page) via usePublicPlans; this array is the
   name-keyed overlay (blurb/CTA/highlight) and the fallback shown only when the
   API is unreachable. Prices are INR/month (the stored + charged base); the
   currency switcher localizes to USD/EUR/etc.
============================================================================ */

const PLANS = [
  {
    name: 'Starter',
    price: 1500,
    blurb: 'For solo founders dipping into outbound.',
    features: [
      '1 email account',
      '30 emails / day',
      'Gmail + Outlook + Custom',
      'Domain check (SPF/DKIM/DMARC)',
      'Smart scaling + AI content',
      'Weekly report summaries',
      'Email support',
    ],
    cta: 'Get started',
    href: '/signup?plan=starter',
    external: false,
    highlight: false,
  },
  {
    name: 'Pro',
    price: 5000,
    blurb: 'For teams running cold outreach at scale.',
    features: [
      '10 email accounts',
      '50 emails / day each',
      'Spam Rescue + health checks',
      'On-demand PDF / CSV reports',
      'Real-time alerts',
      '90-day activity history',
      '10 team seats · 5 API keys',
      'Priority email + chat support',
    ],
    cta: 'Get started',
    href: '/signup?plan=pro',
    external: false,
    highlight: true,
  },
  {
    name: 'Pro Plus',
    price: 8000,
    blurb: 'For deliverability nerds + power users.',
    features: [
      'Everything in Pro, plus:',
      '15 email accounts · 75 emails / day',
      'Google Monitor stats',
      'Microsoft Monitor stats',
      'Inbox Test (30 accounts)',
      'Slack notifications',
      'Priority 4-hr support',
    ],
    cta: 'Get started',
    href: '/signup?plan=pro_plus',
    external: false,
    highlight: false,
  },
  {
    name: 'Agency',
    price: 15000,
    blurb: 'For agencies reselling to many clients.',
    features: [
      'Everything in Pro Plus, plus:',
      'Unlimited accounts + sub-clients',
      'White-label branding',
      'Custom domain (your URL, your brand)',
      'Dedicated account pool',
      'Slack-connect 1-hr support',
      'Multi-workspace reports',
    ],
    cta: 'Get started',
    href: '/signup?plan=agency',
    external: false,
    highlight: false,
  },
];

type PricingPlanLite = {
  name: string;
  price: number;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  external: boolean;
  highlight: boolean;
};

/* Mobile (<768px) tabbed plan selector — pills pick a plan, one detailed glass
   card cross-fades in. Shares the section's cycle toggle + live API plans. */
function PricingMobile({
  plans,
  cycle,
  yearlyDiscount,
  format,
  currency,
  activeTab,
  setActiveTab,
}: {
  plans: PricingPlanLite[];
  cycle: 'monthly' | 'yearly';
  yearlyDiscount: number;
  format: (n: number) => string;
  currency: { code: string };
  activeTab: number;
  setActiveTab: (i: number) => void;
}) {
  const t = useT();
  const idx = Math.min(activeTab, plans.length - 1);
  const p = plans[idx];
  if (!p) return null;
  const ctaClass =
    'mt-6 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold';
  const ctaStyle: React.CSSProperties = p.highlight
    ? {
        background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
        color: '#fff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px color-mix(in srgb, var(--wp-accent) 35%, transparent)',
      }
    : { background: 'var(--wp-surface-2)', color: 'var(--wp-text)', border: '1px solid var(--wp-border-strong)' };

  return (
    <div className="md:hidden">
      {/* plan pills */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {plans.map((pl, i) => {
          const on = i === idx;
          return (
            <button
              key={pl.name}
              type="button"
              onClick={() => setActiveTab(i)}
              className="relative shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
              style={{ color: on ? '#fff' : 'var(--wp-text-dim)', border: `1px solid ${on ? 'transparent' : 'var(--wp-border)'}` }}
            >
              {on && (
                <motion.span
                  layoutId="pricing-mobile-tab"
                  className="absolute inset-0 -z-10 rounded-full"
                  style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))' }}
                  transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                />
              )}
              {pl.name}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={p.name}
          className="relative"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {p.highlight && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl"
              style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 22%, transparent), transparent 70%)', filter: 'blur(28px)' }}
              animate={{ opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <div
            className="wp-glass flex flex-col rounded-2xl p-6"
            style={p.highlight ? { border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)' } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>{p.name}</h3>
              {p.highlight && (
                <span className="rounded-full px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff' }}>
                  {t('sections.pricing.mostPopular')}
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>{t(`sections.plan.${planSlug(p.name)}.blurb`)}</p>
            <div className="mt-5 flex flex-col gap-1">
              <span className="font-mono text-[32px] font-bold tabular-nums leading-none" style={{ color: 'var(--wp-text)' }}>
                {format(cycle === 'yearly' ? p.price * yearlyDiscount : p.price)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>
                <span style={{ color: 'var(--wp-accent)', background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)', padding: '2px 7px', borderRadius: 999, fontSize: 10 }}>{currency.code}</span>
                <span>{t('sections.pricing.perMonth')}</span>
              </span>
              {cycle === 'yearly' && p.price > 0 && (
                <span className="mt-1 font-mono text-[10.5px]" style={{ color: 'var(--wp-text-faint)' }}>
                  {t('sections.pricing.billedYearly')} · {format(p.price * 12 * yearlyDiscount)}/yr
                </span>
              )}
            </div>
            <ul className="mt-5 space-y-2.5">
              {p.features.map((feat) => (
                <li key={feat} className="flex items-start gap-2.5 text-[13px]" style={{ color: 'var(--wp-text-dim)' }}>
                  <Check size={14} strokeWidth={2.4} style={{ color: 'var(--wp-success)', marginTop: 2, flexShrink: 0 }} />
                  {feat}
                </li>
              ))}
            </ul>
            {p.external ? (
              <a href={p.href} className={ctaClass} style={ctaStyle}>{t('sections.pricing.getStarted')}<ArrowRight size={14} strokeWidth={2.2} /></a>
            ) : (
              <Link to={p.href} className={ctaClass} style={ctaStyle}>{t('sections.pricing.getStarted')}<ArrowRight size={14} strokeWidth={2.2} /></Link>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function PricingSection() {
  const t = useT();
  const { format, currency } = useCurrency();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  // Mobile (<768px) tabbed plan selector — index into `plans`.
  const [activeTab, setActiveTab] = useState(0);
  // Yearly = pay for 10 months, get 12. 16.7% off ≈ "2 months free".
  const YEARLY_DISCOUNT = 10 / 12;

  // Price, features, mailbox limits, and which tiers show are ALL driven by the
  // backend: GET /api/plans returns active + public plans straight from the DB,
  // so editing a plan in /admin/plans updates this section live. Only the
  // marketing copy below (blurb / CTA label / "most popular" highlight) is
  // hand-authored — it's name-keyed and merged onto the API data. If the API is
  // unreachable we fall back to the hard-coded PLANS so pricing never goes blank.
  const { data: apiPlans } = usePublicPlans();

  const overlayBySlug = new Map(PLANS.map((p) => [planSlug(p.name), p]));
  const plans =
    apiPlans && apiPlans.length > 0
      ? apiPlans.map((p: PublicPlan) => {
          const o = overlayBySlug.get(p.slug);
          return {
            name: p.name,
            price: p.priceMonthly,
            blurb: o?.blurb ?? '',
            features: p.features.length > 0 ? p.features : o?.features ?? [],
            cta: o?.cta ?? 'Get started',
            href: o?.href ?? `/signup?plan=${p.slug}`,
            external: o?.external ?? false,
            highlight: o?.highlight ?? false,
          };
        })
      : PLANS;
  const lgCols =
    plans.length >= 4 ? 'lg:grid-cols-4' : plans.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <section
      id="pricing"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-32"
    >
      <SectionHeader
        eyebrow={t('sections.pricing.eyebrow')}
        title={
          <>
            {t('sections.pricing.title1')}<br />
            <span className="wp-headline-grad">{t('sections.pricing.title2')}</span>
          </>
        }
        intro={t('sections.pricing.intro')}
      />

      {/* Monthly / Yearly toggle */}
      <div className="mb-10 flex items-center justify-center">
        <div
          className="inline-flex items-center gap-1 rounded-full p-1"
          style={{
            background: 'var(--wp-surface-2)',
            border: '1px solid var(--wp-border-strong)',
          }}
          role="tablist"
          aria-label={t('sections.pricing.billingCycle')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === 'monthly'}
            onClick={() => setCycle('monthly')}
            className="rounded-full px-5 py-2 text-[13px] font-semibold transition-colors"
            style={
              cycle === 'monthly'
                ? {
                    background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                    color: '#fff',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                  }
                : { color: 'var(--wp-text-dim)' }
            }
          >
            {t('sections.pricing.monthly')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === 'yearly'}
            onClick={() => setCycle('yearly')}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold transition-colors"
            style={
              cycle === 'yearly'
                ? {
                    background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                    color: '#fff',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                  }
                : { color: 'var(--wp-text-dim)' }
            }
          >
            {t('sections.pricing.yearly')}
            <span
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
              style={{
                background: cycle === 'yearly' ? 'rgba(255,255,255,0.2)' : 'color-mix(in srgb, var(--wp-success) 22%, transparent)',
                color: cycle === 'yearly' ? '#fff' : 'var(--wp-success)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              −17%
            </span>
          </button>
        </div>
      </div>

      {/* Mobile (<768px): tabbed plan selector. */}
      <PricingMobile
        plans={plans}
        cycle={cycle}
        yearlyDiscount={YEARLY_DISCOUNT}
        format={format}
        currency={currency}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Desktop (≥768px): full card grid. */}
      <div className={`hidden items-stretch gap-5 md:grid md:grid-cols-2 ${lgCols}`}>
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6 }}
            className="wp-glass relative flex h-full flex-col rounded-2xl p-7"
            style={
              plan.highlight
                ? {
                    border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)',
                    boxShadow:
                      '0 0 0 1px color-mix(in srgb, var(--wp-accent) 30%, transparent), 0 24px 60px rgba(242, 101, 34,0.18)',
                  }
                : undefined
            }
          >
            {plan.highlight && (
              <span
                className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap"
                style={{
                  background:
                    'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                  color: '#fff',
                  boxShadow:
                    '0 6px 20px color-mix(in srgb, var(--wp-accent) 40%, transparent)',
                }}
              >
                {t('sections.pricing.mostPopular')}
              </span>
            )}
            <h3
              className="text-[20px] font-semibold tracking-tight"
              style={{ color: 'var(--wp-text)' }}
            >
              {plan.name}
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--wp-text-dim)' }}>
              {t(`sections.plan.${planSlug(plan.name)}.blurb`)}
            </p>
            <div className="mt-6 flex flex-col gap-1">
              <span
                className="block font-mono text-[34px] font-bold tabular-nums leading-none"
                style={{ color: 'var(--wp-text)' }}
              >
                {format(cycle === 'yearly' ? plan.price * YEARLY_DISCOUNT : plan.price)}
              </span>
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--wp-text-faint)' }}
              >
                <span
                  style={{
                    color: 'var(--wp-accent)',
                    background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)',
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontSize: 10,
                  }}
                  aria-label={`Currency: ${currency.name}`}
                >
                  {currency.code}
                </span>
                <span>{t('sections.pricing.perMonth')}</span>
              </span>
            </div>
            {/* Fixed-height caption slot — stays same height in both cycles so
                cards don't jump when the user toggles. Text only renders on
                yearly + paid plans. */}
            <span
              className="mt-1 block min-h-[16px] truncate font-mono text-[10.5px] tracking-tight"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {cycle === 'yearly' && plan.price > 0
                ? `${t('sections.pricing.billedYearly')} · ${format(plan.price * 12 * YEARLY_DISCOUNT)}/yr`
                : ' '}
            </span>
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-2.5 text-[13px]"
                  style={{ color: 'var(--wp-text-dim)' }}
                >
                  <Check
                    size={14}
                    strokeWidth={2.4}
                    style={{ color: 'var(--wp-success)', marginTop: 2 }}
                  />
                  {feat}
                </li>
              ))}
            </ul>
            {plan.external ? (
              <a
                href={plan.href}
                className="mt-7 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                style={
                  plan.highlight
                    ? {
                        background:
                          'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                        color: '#fff',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px color-mix(in srgb, var(--wp-accent) 35%, transparent)',
                      }
                    : {
                        background: 'var(--wp-surface-2)',
                        color: 'var(--wp-text)',
                        border: '1px solid var(--wp-border-strong)',
                      }
                }
              >
                {t('sections.pricing.getStarted')}
                <ArrowRight size={14} strokeWidth={2.2} />
              </a>
            ) : (
              <Link
                to={plan.href}
                className="mt-7 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                style={
                  plan.highlight
                    ? {
                        background:
                          'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                        color: '#fff',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px color-mix(in srgb, var(--wp-accent) 35%, transparent)',
                      }
                    : {
                        background: 'var(--wp-surface-2)',
                        color: 'var(--wp-text)',
                        border: '1px solid var(--wp-border-strong)',
                      }
                }
              >
                {t('sections.pricing.getStarted')}
                <ArrowRight size={14} strokeWidth={2.2} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>

      {/* Free-tier footnote */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-10 flex flex-col items-center gap-3 text-center"
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {t('sections.pricing.justExploring')}
        </span>
        <p className="text-[14px]" style={{ color: 'var(--wp-text-dim)' }}>
          {t('sections.pricing.freeTierPre')}<strong style={{ color: 'var(--wp-text)' }}>{t('sections.pricing.freeForever')}</strong>{t('sections.pricing.freeTierPost')}{' '}
          <Link
            to="/signup?plan=free"
            className="font-semibold underline-offset-4 hover:underline"
            style={{ color: 'var(--wp-accent)' }}
          >
            {t('sections.pricing.startFree')}
          </Link>
        </p>
        <span
          className="mt-3 font-mono text-[11px]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {t('sections.pricing.footerNote')}
        </span>
      </motion.div>
    </section>
  );
}

/* ============================================================================
   DOCS — code-snippet style preview with side bullets
============================================================================ */

const DOCS_LINKS = [
  { icon: Zap, keyBase: 'sections.docs.quickstart', href: '/signup' },
  { icon: Code2, keyBase: 'sections.docs.restApi', href: '/signup' },
  { icon: TerminalSquare, keyBase: 'sections.docs.webhooks', href: '/signup' },
  { icon: Users, keyBase: 'sections.docs.teamSso', href: '/signup' },
];

export function DocsSection() {
  const t = useT();
  return (
    <section
      id="docs"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-32"
    >
      <SectionHeader
        eyebrow={t('sections.docs.eyebrow')}
        title={
          <>
            {t('sections.docs.title1')}{' '}
            <span className="wp-headline-grad">{t('sections.docs.title2')}</span>
          </>
        }
        intro={t('sections.docs.intro')}
      />

      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: code window */}
        <motion.div
          initial={{ opacity: 0, x: -32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="wp-glass overflow-hidden rounded-2xl"
        >
          {/* window chrome */}
          <div
            className="flex items-center gap-2 border-b px-4 py-3"
            style={{ borderColor: 'var(--wp-border)' }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: '#ff5f57' }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: '#febc2e' }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: '#28c840' }}
            />
            <span
              className="ml-3 font-mono text-[11px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              curl · warmpulse api v1
            </span>
          </div>
          <pre
            className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7]"
            style={{ color: 'var(--wp-text)' }}
          >
{`$ curl https://api.warmpulse.com/v1/mailboxes \\
    -H "Authorization: Bearer wp_live_••••••••" \\
    -H "Content-Type: application/json" \\
    -d '{
      "email": "alex@lumen-labs.com",
      "provider": "gmail",
      "daily_target": 50,
      "pool": "workspace_default"
    }'

`}
            <span style={{ color: 'var(--wp-success)' }}>
{`{
  "id": "mb_4f12a8c1",
  "status": "ramping",
  "ramp_day": 1,
  "warmth_score": 0,
  "next_send_at": "2025-04-28T09:42:18Z"
}`}
            </span>
          </pre>
        </motion.div>

        {/* Right: docs link cards */}
        <div className="space-y-3">
          {DOCS_LINKS.map((d, i) => (
            <motion.a
              key={d.keyBase}
              href={d.href}
              initial={{ opacity: 0, x: 32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ x: 4 }}
              className="wp-glass group flex items-start gap-4 rounded-xl p-5"
            >
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background:
                    'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                  color: 'var(--wp-accent)',
                  border: '1px solid color-mix(in srgb, var(--wp-accent) 25%, transparent)',
                }}
              >
                <d.icon size={16} strokeWidth={1.8} />
              </span>
              <div className="flex-1">
                <div
                  className="flex items-center gap-2 text-[15px] font-semibold"
                  style={{ color: 'var(--wp-text)' }}
                >
                  {t(`${d.keyBase}.title`)}
                  <ArrowRight
                    size={14}
                    strokeWidth={2}
                    className="opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
                    style={{ color: 'var(--wp-accent)' }}
                  />
                </div>
                <p
                  className="mt-1 text-[13px]"
                  style={{ color: 'var(--wp-text-dim)' }}
                >
                  {t(`${d.keyBase}.body`)}
                </p>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   CHANGELOG — vertical timeline, entries slide in left
============================================================================ */

const CHANGELOG = [
  { date: 'Apr 28, 2025', color: 'success', keyBase: 'sections.changelog.spamRescue' },
  { date: 'Apr 22, 2025', color: 'accent', keyBase: 'sections.changelog.peerRotation' },
  { date: 'Apr 14, 2025', color: 'success', keyBase: 'sections.changelog.zohoDetect' },
  { date: 'Apr 08, 2025', color: 'warning', keyBase: 'sections.changelog.imapProbe' },
];

function tagStyle(color: string) {
  const c = `var(--wp-${color})`;
  return {
    background: `color-mix(in srgb, ${c} 15%, transparent)`,
    color: c,
    border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
  };
}

export function ChangelogSection() {
  const t = useT();
  return (
    <section
      id="changelog"
      className="relative z-10 mx-auto max-w-4xl scroll-mt-24 px-6 py-32"
    >
      <SectionHeader
        eyebrow={t('sections.changelog.eyebrow')}
        title={
          <>
            <span className="wp-headline-grad">{t('sections.changelog.title1')}</span> {t('sections.changelog.title2')}
          </>
        }
        intro={t('sections.changelog.intro')}
      />

      <div className="relative pl-8 md:pl-12">
        {/* vertical line */}
        <div
          className="absolute bottom-0 left-3 top-0 w-px md:left-5"
          style={{
            background:
              'linear-gradient(to bottom, transparent, var(--wp-border-strong) 12%, var(--wp-border-strong) 88%, transparent)',
          }}
        />

        <div className="space-y-10">
          {CHANGELOG.map((entry, i) => (
            <motion.div
              key={entry.keyBase}
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* dot */}
              <span
                className="absolute -left-[28px] top-1.5 inline-flex h-3.5 w-3.5 items-center justify-center md:-left-[40px]"
              >
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      'color-mix(in srgb, var(--wp-accent) 30%, transparent)',
                    filter: 'blur(4px)',
                  }}
                />
                <span
                  className="relative h-2.5 w-2.5 rounded-full"
                  style={{
                    background: 'var(--wp-accent)',
                    boxShadow:
                      '0 0 0 3px var(--wp-bg), 0 0 0 4px var(--wp-border-strong)',
                  }}
                />
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  {entry.date}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider"
                  style={tagStyle(entry.color)}
                >
                  {t(`${entry.keyBase}.tag`)}
                </span>
              </div>
              <h3
                className="mt-2 text-[18px] font-semibold tracking-tight"
                style={{ color: 'var(--wp-text)' }}
              >
                {t(`${entry.keyBase}.title`)}
              </h3>
              <p
                className="mt-1.5 text-[14px] leading-[1.55]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                {t(`${entry.keyBase}.body`)}
              </p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

/* ============================================================================
   FINAL CTA — bottom band with strong glow
============================================================================ */

export function FinalCTA() {
  const t = useT();
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 py-20 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="wp-glass relative overflow-hidden rounded-3xl px-6 py-14 text-center md:px-16 md:py-16"
      >
        {/* Pulsing aura glow */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-32"
          style={{
            background:
              'radial-gradient(ellipse at center, color-mix(in srgb, var(--wp-accent) 25%, transparent) 0%, transparent 60%)',
            filter: 'blur(80px)',
          }}
          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Top hairline glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--wp-accent), transparent)', opacity: 0.6 }}
        />
        {/* Shimmer sweep */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-12deg]"
          style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--wp-accent) 12%, transparent), transparent)' }}
          animate={{ x: ['0%', '520%'] }}
          transition={{ duration: 5, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
        />
        {/* Floating particles */}
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{ left: `${10 + i * 19}%`, bottom: '6%', width: 4, height: 4, background: 'var(--wp-accent)' }}
            animate={{ y: ['0%', '-700%'], opacity: [0, 0.7, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, delay: i * 0.9, ease: 'linear' }}
          />
        ))}
        <div className="relative">
          <span
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-accent)' }}
          >
            {t('sections.finalCta.eyebrow')}
          </span>
          <h2
            className="mt-4 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[40px] md:text-[54px]"
            style={{ color: 'var(--wp-text)' }}
          >
            {t('sections.finalCta.title1')}<br />
            <span className="wp-headline-grad">{t('sections.finalCta.title2')}</span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] md:text-[16px]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            {t('sections.finalCta.intro')}
          </p>
          <div className="mt-9 flex items-center justify-center">
            <Link
              to="/signup"
              className="wp-cta-pulse group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 sm:w-auto"
              style={{
                background:
                  'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
                color: '#fff',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 40px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
              }}
            >
              {t('sections.finalCta.cta')}
              <ArrowRight
                size={16}
                strokeWidth={2.2}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
