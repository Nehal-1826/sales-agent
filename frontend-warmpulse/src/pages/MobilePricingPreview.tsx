import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

type Plan = { name: string; price: number; blurb: string; features: string[]; highlight: boolean };

const PLANS: Plan[] = [
  { name: 'Starter', price: 1500, blurb: 'For solo founders dipping into outbound.', features: ['1 email account', '30 emails / day', 'Gmail + Outlook + Custom', 'Domain check (SPF/DKIM/DMARC)', 'Smart scaling + AI content', 'Weekly report summaries', 'Email support'], highlight: false },
  { name: 'Pro', price: 5000, blurb: 'For teams running cold outreach at scale.', features: ['10 email accounts', '50 emails / day each', 'Spam Rescue + health checks', 'On-demand PDF / CSV reports', 'Real-time alerts', '90-day activity history', '10 team seats · 5 API keys', 'Priority email + chat support'], highlight: true },
  { name: 'Pro Plus', price: 8000, blurb: 'For deliverability nerds + power users.', features: ['Everything in Pro, plus:', '15 accounts · 75 emails / day', 'Google Monitor stats', 'Microsoft Monitor stats', 'Inbox Test (30 accounts)', 'Slack notifications', 'Priority 4-hr support'], highlight: false },
  { name: 'Agency', price: 15000, blurb: 'For agencies reselling to many clients.', features: ['Everything in Pro Plus, plus:', 'Unlimited accounts + sub-clients', 'White-label branding', 'Custom domain', 'Dedicated account pool', 'Slack-connect 1-hr support', 'Multi-workspace reports'], highlight: false },
];

function inr(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-accent)' }}>{label}</span>
      <div className="relative overflow-hidden" style={{ width: 390, height: 820, borderRadius: 38, border: '10px solid #111', background: 'var(--wp-bg)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 130, height: 26, background: '#111', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, zIndex: 30 }} />
        <div className="wp-grid-dots pointer-events-none absolute inset-0" />
        <div className="relative h-full w-full overflow-y-auto px-4 py-12">{children}</div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-5 text-center">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>Pricing</span>
      <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">One peer network.<br /><span className="wp-headline-grad">Four ways to grow.</span></h2>
    </div>
  );
}

function CycleToggle({ cycle, setCycle }: { cycle: string; setCycle: (c: 'monthly' | 'yearly') => void }) {
  return (
    <div className="mb-5 flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--wp-surface-2)', border: '1px solid var(--wp-border-strong)' }}>
        {(['monthly', 'yearly'] as const).map((c) => {
          const on = cycle === c;
          return (
            <button key={c} onClick={() => setCycle(c)} className="relative rounded-full px-4 py-1.5 text-[12px] font-semibold" style={{ color: on ? '#fff' : 'var(--wp-text-dim)' }}>
              {on && <motion.span layoutId="cyc" className="absolute inset-0 -z-10 rounded-full" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} />}
              {c === 'monthly' ? 'Monthly' : 'Yearly'}
              {c === 'yearly' && <span className="ml-1.5 font-mono text-[9px]" style={{ color: on ? '#fff' : 'var(--wp-success)' }}>−17%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function price(p: Plan, cycle: string) { return inr(cycle === 'yearly' ? Math.round(p.price * 10 / 12) : p.price); }

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="mt-4 flex-1 space-y-2">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>
          <Check size={13} strokeWidth={2.4} style={{ color: 'var(--wp-success)', marginTop: 2, flexShrink: 0 }} />
          {f}
        </li>
      ))}
    </ul>
  );
}

function PriceBlock({ p, cycle }: { p: Plan; cycle: string }) {
  return (
    <div className="mt-4">
      <span className="font-mono text-[32px] font-bold leading-none" style={{ color: 'var(--wp-text)' }}>{price(p, cycle)}</span>
      <span className="ml-1.5 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>/ mo</span>
    </div>
  );
}

function CtaButton({ highlight }: { highlight: boolean }) {
  return (
    <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold" style={highlight ? { background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px color-mix(in srgb, var(--wp-accent) 35%, transparent)' } : { background: 'var(--wp-surface-2)', color: 'var(--wp-text)', border: '1px solid var(--wp-border-strong)' }}>
      Get started <ArrowRight size={14} strokeWidth={2.2} />
    </button>
  );
}

/* A · Stacked glass cards — highlighted card gets aura glow + badge */
function DesignA() {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  return (
    <PhoneFrame label="A · Stacked Glass">
      <Header />
      <CycleToggle cycle={cycle} setCycle={setCycle} />
      <div className="space-y-7 pt-2">
        {PLANS.map((p) => (
          <motion.div key={p.name} className="relative" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            {p.highlight && <motion.div aria-hidden className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 22%, transparent), transparent 70%)', filter: 'blur(28px)' }} animate={{ opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }} />}
            <div className="wp-glass flex flex-col rounded-2xl p-6" style={p.highlight ? { border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)' } : undefined}>
              {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff', boxShadow: '0 6px 20px color-mix(in srgb, var(--wp-accent) 40%, transparent)' }}>Most popular</span>}
              <h3 className="text-[19px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>{p.name}</h3>
              <p className="mt-1 text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>{p.blurb}</p>
              <PriceBlock p={p} cycle={cycle} />
              <FeatureList features={p.features} />
              <CtaButton highlight={p.highlight} />
            </div>
          </motion.div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* B · Snap carousel — one card per view, swipe horizontally */
function DesignB() {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  return (
    <PhoneFrame label="B · Swipe Carousel">
      <Header />
      <CycleToggle cycle={cycle} setCycle={setCycle} />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
        {PLANS.map((p) => (
          <div key={p.name} className="w-[80%] shrink-0 snap-center">
            <div className="wp-glass relative flex h-full flex-col rounded-2xl p-5" style={p.highlight ? { border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)', boxShadow: '0 24px 60px rgba(242,101,34,0.18)' } : undefined}>
              {p.highlight && <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff' }}><Sparkles size={9} /> Popular</span>}
              <h3 className="text-[18px] font-semibold" style={{ color: 'var(--wp-text)' }}>{p.name}</h3>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>{p.blurb}</p>
              <PriceBlock p={p} cycle={cycle} />
              <FeatureList features={p.features} />
              <CtaButton highlight={p.highlight} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>← swipe plans →</p>
    </PhoneFrame>
  );
}

/* C · Tabbed plan selector — pills pick a plan, single detailed card */
function DesignC() {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [active, setActive] = useState(1);
  const p = PLANS[active]!;
  return (
    <PhoneFrame label="C · Tabbed Selector">
      <Header />
      <CycleToggle cycle={cycle} setCycle={setCycle} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {PLANS.map((pl, i) => {
          const on = i === active;
          return (
            <button key={pl.name} onClick={() => setActive(i)} className="relative shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold" style={{ color: on ? '#fff' : 'var(--wp-text-dim)', border: `1px solid ${on ? 'transparent' : 'var(--wp-border)'}` }}>
              {on && <motion.span layoutId="pricing-tab" className="absolute inset-0 -z-10 rounded-full" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} />}
              {pl.name}
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={p.name} className="relative" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
          {p.highlight && <motion.div aria-hidden className="pointer-events-none absolute -inset-3 -z-10 rounded-3xl" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 22%, transparent), transparent 70%)', filter: 'blur(28px)' }} animate={{ opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 3.4, repeat: Infinity }} />}
          <div className="wp-glass flex flex-col rounded-2xl p-6" style={p.highlight ? { border: '1px solid color-mix(in srgb, var(--wp-accent) 50%, transparent)' } : undefined}>
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-semibold" style={{ color: 'var(--wp-text)' }}>{p.name}</h3>
              {p.highlight && <span className="rounded-full px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff' }}>Popular</span>}
            </div>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>{p.blurb}</p>
            <PriceBlock p={p} cycle={cycle} />
            <FeatureList features={p.features} />
            <CtaButton highlight={p.highlight} />
          </div>
        </motion.div>
      </AnimatePresence>
    </PhoneFrame>
  );
}

/* D · Compact rows — price-forward list, tap to expand features */
function DesignD() {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [open, setOpen] = useState<string | null>(PLANS[1]!.name);
  return (
    <PhoneFrame label="D · Compact Rows">
      <Header />
      <CycleToggle cycle={cycle} setCycle={setCycle} />
      <div className="space-y-2.5">
        {PLANS.map((p) => {
          const on = open === p.name;
          return (
            <div key={p.name} className="wp-glass overflow-hidden rounded-2xl" style={p.highlight ? { border: '1px solid color-mix(in srgb, var(--wp-accent) 45%, transparent)' } : undefined}>
              <button onClick={() => setOpen(on ? null : p.name)} className="flex w-full items-center justify-between px-4 py-3.5">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold" style={{ color: 'var(--wp-text)' }}>{p.name}</span>
                    {p.highlight && <span className="rounded-full px-2 py-0.5 font-mono text-[8px] font-semibold uppercase" style={{ background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))', color: '#fff' }}>Popular</span>}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>{p.blurb}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[18px] font-bold leading-none" style={{ color: 'var(--wp-accent)' }}>{price(p, cycle)}</div>
                  <div className="font-mono text-[9px] uppercase" style={{ color: 'var(--wp-text-faint)' }}>/ mo</div>
                </div>
              </button>
              {on && <div className="px-4 pb-4"><FeatureList features={p.features} /><CtaButton highlight={p.highlight} /></div>}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

export function MobilePricingPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>Pricing — Animated Glass Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Glassmorphism · effects · 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
