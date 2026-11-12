import { motion } from 'framer-motion';
import { Sparkles, Mail, Check } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

type Provider = { short: string; color: string };
const PROVIDERS: Provider[] = [
  { short: '@gmail', color: 'var(--wp-accent)' },
  { short: '@outlook', color: 'var(--wp-accent-2)' },
  { short: '@yahoo', color: 'var(--wp-warning)' },
  { short: '@proton', color: 'var(--wp-success)' },
  { short: '@zoho', color: 'var(--wp-accent)' },
  { short: '@fastmail', color: 'var(--wp-accent-2)' },
  { short: '@aol', color: 'var(--wp-warning)' },
  { short: '@icloud', color: 'var(--wp-success)' },
];

const STATS: [string, string][] = [
  ['Gmail', '1,420'],
  ['Outlook', '962'],
  ['Yahoo', '274'],
  ['Other', '185'],
];
const MAXV = 1420;

const BULLETS = [
  'Smart account matching for every email',
  '24-hour limit — no account over-mailed',
  'Hourly checks drop weak accounts',
  'Dedicated pools for premium plans',
];

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-accent)' }}>{label}</span>
      <div className="relative overflow-hidden" style={{ width: 390, height: 760, borderRadius: 38, border: '10px solid #111', background: 'var(--wp-bg)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
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
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>The email network</span>
      <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">2,841 real accounts.<br /><span className="wp-headline-grad">Talking to yours.</span></h2>
    </div>
  );
}

function Bullets() {
  return (
    <motion.ul className="mt-4 space-y-2.5" variants={stagger} initial="hidden" animate="show">
      {BULLETS.map((b) => (
        <motion.li key={b} variants={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: 'var(--wp-text-dim)' }}>
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--wp-success) 18%, transparent)', color: 'var(--wp-success)' }}>
            <Check size={11} strokeWidth={2.4} />
          </span>
          {b}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function Hub({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center rounded-2xl" style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))', boxShadow: '0 0 40px color-mix(in srgb, var(--wp-accent) 50%, transparent)' }}>
      <Sparkles size={size * 0.42} color="#fff" strokeWidth={2} />
      <motion.span
        className="absolute inset-0 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-hover))' }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
      />
    </div>
  );
}

/* A · Compact contained orbit — rotating ring, nodes counter-rotate upright */
function DesignA() {
  const box = 300;
  const radius = 118;
  return (
    <PhoneFrame label="A · Compact Orbit">
      <Header />
      <div className="relative mx-auto" style={{ width: box, height: box }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="absolute rounded-full" style={{ inset: `${i * 14}%`, border: '1px dashed var(--wp-border-strong)', opacity: 0.5 - i * 0.1 }} />
        ))}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {PROVIDERS.map((_, i) => {
            const a = (i / PROVIDERS.length) * Math.PI * 2;
            return <line key={i} x1="50" y1="50" x2={50 + Math.cos(a) * 39} y2={50 + Math.sin(a) * 39} stroke="var(--wp-accent)" strokeOpacity="0.18" strokeWidth="0.3" strokeDasharray="0.5 0.8" />;
          })}
        </svg>
        <motion.div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <Hub />
        </motion.div>
        {/* rotating orbit */}
        <motion.div className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
          {PROVIDERS.map((p, i) => {
            const a = (i / PROVIDERS.length) * Math.PI * 2;
            const x = box / 2 + Math.cos(a) * radius;
            const y = box / 2 + Math.sin(a) * radius;
            return (
              <motion.div key={p.short} className="absolute" style={{ left: x, top: y, transform: 'translate(-50%,-50%)' }} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}>
                <motion.div className="wp-glass flex h-9 w-9 items-center justify-center rounded-full" animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}>
                  <Mail size={13} style={{ color: p.color }} strokeWidth={2} />
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
      <p className="mt-3 text-center font-mono text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>2,841 accounts · 14 providers</p>
      <Bullets />
    </PhoneFrame>
  );
}

/* B · Provider chip grid + stat cards */
function DesignB() {
  return (
    <PhoneFrame label="B · Provider Grid">
      <Header />
      <motion.div className="grid grid-cols-2 gap-2" variants={stagger} initial="hidden" animate="show">
        {PROVIDERS.map((p) => (
          <motion.div key={p.short} variants={item} className="wp-glass flex items-center gap-2 rounded-xl px-3 py-2.5">
            <Mail size={13} style={{ color: p.color }} strokeWidth={2} />
            <span className="font-mono text-[12px]" style={{ color: 'var(--wp-text)' }}>{p.short}</span>
          </motion.div>
        ))}
      </motion.div>
      <motion.div className="mt-3 grid grid-cols-2 gap-2" variants={stagger} initial="hidden" animate="show">
        {STATS.map(([l, v]) => (
          <motion.div key={l} variants={item} className="wp-glass rounded-xl p-3">
            <div className="font-mono text-[22px] font-bold tabular-nums" style={{ color: 'var(--wp-text)' }}>{v}</div>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>{l} accounts</div>
          </motion.div>
        ))}
      </motion.div>
      <Bullets />
    </PhoneFrame>
  );
}

/* C · Hub + provider bars */
function DesignC() {
  return (
    <PhoneFrame label="C · Hub + Bars">
      <Header />
      <div className="mb-5 flex flex-col items-center gap-2">
        <Hub size={72} />
        <span className="font-mono text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>2,841 across 14 providers</span>
      </div>
      <motion.div className="space-y-2.5" variants={stagger} initial="hidden" animate="show">
        {STATS.map(([l, v], i) => {
          const pct = (parseInt(v.replace(/,/g, '')) / MAXV) * 100;
          const colors = ['var(--wp-accent)', 'var(--wp-accent-2)', 'var(--wp-warning)', 'var(--wp-success)'];
          return (
            <motion.div key={l} variants={item} className="wp-glass rounded-xl p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>
                  <Mail size={13} style={{ color: colors[i] }} strokeWidth={2} /> {l}
                </span>
                <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--wp-text)' }}>{v}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--wp-surface-2)' }}>
                <motion.div className="h-full rounded-full" style={{ background: colors[i] }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <Bullets />
    </PhoneFrame>
  );
}

/* D · Big total + sub-stats + chip strip */
function DesignD() {
  return (
    <PhoneFrame label="D · Stat Forward">
      <Header />
      <motion.div className="wp-glass mb-3 flex flex-col items-center gap-1 rounded-2xl py-6" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
        <span className="font-mono text-[44px] font-bold leading-none tabular-nums" style={{ color: 'var(--wp-accent)' }}>2,841</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-faint)' }}>peer mailboxes engaging</span>
      </motion.div>
      <motion.div className="grid grid-cols-4 gap-1.5" variants={stagger} initial="hidden" animate="show">
        {STATS.map(([l, v]) => (
          <motion.div key={l} variants={item} className="rounded-lg px-1 py-2 text-center" style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)', border: '1px solid var(--wp-border)' }}>
            <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--wp-text)' }}>{v}</div>
            <div className="text-[8px] uppercase" style={{ color: 'var(--wp-text-faint)' }}>{l}</div>
          </motion.div>
        ))}
      </motion.div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {PROVIDERS.map((p) => (
          <span key={p.short} className="wp-glass inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5">
            <Mail size={11} style={{ color: p.color }} strokeWidth={2} />
            <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text)' }}>{p.short}</span>
          </span>
        ))}
      </div>
      <Bullets />
    </PhoneFrame>
  );
}

export function MobilePeerPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>Peer Network — Mobile Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Same theme & data · 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
