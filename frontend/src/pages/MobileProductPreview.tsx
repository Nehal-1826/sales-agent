import { useState } from 'react';
import { Network, Gauge, ShieldCheck, Bot, BarChart3, Zap, ChevronDown, type LucideIcon } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

type Feature = { icon: LucideIcon; title: string; body: string; stat: string };

const FEATURES: Feature[] = [
  { icon: Network, title: 'Real Test Accounts', body: '2,800+ Gmail, Outlook, and Yahoo accounts — rotated hourly to keep interactions natural and safe.', stat: '14 Email Providers' },
  { icon: Gauge, title: 'Smart 30-day scaling', body: 'Daily sends naturally increase over 30 days (5 → 10 → 20 → 35 → 50+). Auto-pauses on delivery issues.', stat: 'D1 → D29 scaling' },
  { icon: ShieldCheck, title: 'Domain Health Monitored', body: 'Continuous domain setup checks (SPF/DKIM/DMARC) and monitoring across 12 different blacklists.', stat: 'Checks every 6h' },
  { icon: Bot, title: 'AI-written emails', body: 'Advanced AI generates realistic email threads with actual replies and follow-ups — never two alike.', stat: 'Human-like content' },
  { icon: BarChart3, title: 'Inbox Stats', body: 'Health scores, inbox delivery %, engagement stats, and daily summaries for every email account.', stat: '7 · 30 · 90-day' },
  { icon: Zap, title: 'Spam Rescue', body: 'Test accounts detect if your emails land in spam and automatically move them to the inbox.', stat: 'Automatic recovery' },
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
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>What's inside</span>
      <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">Everything to <span className="wp-headline-grad">land in inbox.</span></h2>
    </div>
  );
}

function IconChip({ Icon, size = 40 }: { Icon: LucideIcon; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)', color: 'var(--wp-accent)', border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)' }}>
      <Icon size={size * 0.45} strokeWidth={1.8} />
    </span>
  );
}

/* A · Full cards (current live layout) */
function DesignA() {
  return (
    <PhoneFrame label="A · Full Cards (current)">
      <Header />
      <div className="space-y-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="wp-glass rounded-2xl p-5">
            <IconChip Icon={f.icon} />
            <h3 className="mt-4 text-[16px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>{f.title}</h3>
            <p className="mt-2 text-[13px] leading-[1.55]" style={{ color: 'var(--wp-text-dim)' }}>{f.body}</p>
            <span className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--wp-text-faint)' }}>{f.stat}</span>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* B · Compact 2-col tiles */
function DesignB() {
  return (
    <PhoneFrame label="B · 2-Col Tiles">
      <Header />
      <div className="grid grid-cols-2 gap-2.5">
        {FEATURES.map((f) => (
          <div key={f.title} className="wp-glass rounded-2xl p-3.5">
            <IconChip Icon={f.icon} size={34} />
            <h3 className="mt-3 text-[13px] font-semibold leading-tight tracking-tight" style={{ color: 'var(--wp-text)' }}>{f.title}</h3>
            <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--wp-text-faint)' }}>{f.stat}</span>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* C · Icon-left list rows */
function DesignC() {
  return (
    <PhoneFrame label="C · List Rows">
      <Header />
      <div className="space-y-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="wp-glass flex items-start gap-3 rounded-xl p-3.5">
            <IconChip Icon={f.icon} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>{f.title}</h3>
              </div>
              <p className="mt-1 text-[12px] leading-[1.5]" style={{ color: 'var(--wp-text-dim)' }}>{f.body}</p>
              <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--wp-text-faint)' }}>{f.stat}</span>
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* D · Accordion */
function DesignD() {
  const [open, setOpen] = useState<string | null>(FEATURES[0]!.title);
  return (
    <PhoneFrame label="D · Accordion">
      <Header />
      <div className="space-y-2">
        {FEATURES.map((f) => {
          const on = open === f.title;
          return (
            <div key={f.title} className="wp-glass overflow-hidden rounded-xl">
              <button type="button" onClick={() => setOpen(on ? null : f.title)} className="flex w-full items-center gap-3 px-3.5 py-3">
                <IconChip Icon={f.icon} size={34} />
                <span className="flex-1 text-left text-[14px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>{f.title}</span>
                <ChevronDown size={16} style={{ color: 'var(--wp-text-faint)', transform: on ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
              </button>
              {on && (
                <div className="px-3.5 pb-3.5" style={{ marginTop: -4 }}>
                  <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--wp-text-dim)' }}>{f.body}</p>
                  <span className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: 'var(--wp-text-faint)' }}>{f.stat}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

export function MobileProductPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>Product Section — Mobile Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Same theme & copy · 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
