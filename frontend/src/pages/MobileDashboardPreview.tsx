import { useState } from 'react';
import { Sparkles, TrendingUp, Search } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

type Tone = 'accent' | 'accent-2' | 'warning' | 'success';

type Tier = {
  key: string;
  label: string;
  badge: 'plain' | 'accent' | 'gradient';
  tagline: string;
  sub: string;
  headline: string;
  warmth: number;
  delta: number;
  kpis: [string, string][];
};

const TIERS: Tier[] = [
  { key: 'starter', label: 'Starter', badge: 'plain', tagline: 'One mailbox, dialed in.', sub: 'Dashboard / S1 Focus', headline: 'alex@lumen-labs.com', warmth: 74, delta: 3, kpis: [['Sends', '18/20'], ['Opens', '82%'], ['Inbox', '91.0%']] },
  { key: 'pro', label: 'Pro', badge: 'accent', tagline: 'Analytics across mailboxes.', sub: 'Analytics cockpit · N1', headline: 'Workspace warmth · 4 mailboxes', warmth: 86, delta: 2, kpis: [['Mailboxes', '4'], ['Avg warmth', '86'], ['Inbox', '93.1%']] },
  { key: 'pro_plus', label: 'Pro Plus', badge: 'gradient', tagline: 'Master/detail console.', sub: 'Console · master/detail · N4', headline: 'Mailbox console · 12 mailboxes', warmth: 92, delta: 1.3, kpis: [['Sends', '70/75'], ['Opens', '78%'], ['Inbox', '92.4%']] },
  { key: 'agency', label: 'Agency', badge: 'gradient', tagline: 'Every client in one orbit.', sub: 'Tiered constellation · D3', headline: 'Northwind Agency · 8 sub-clients', warmth: 89, delta: 2, kpis: [['Clients', '8'], ['Mailboxes', '37'], ['Inbox', '94.0%']] },
];

const MAILBOXES: [string, string, string, number, Tone][] = [
  ['G', 'founder@acme.io', 'Active · D29', 92, 'accent'],
  ['O', 'sales@acme.io', 'Active · D28', 90, 'accent'],
  ['G', 'success@acme.io', 'Active · D26', 87, 'accent'],
  ['O', 'partnerships@acme.io', 'Active · D23', 85, 'accent-2'],
  ['S', 'hello@acme.co', 'Warming · D20', 82, 'warning'],
  ['Y', 'support@acme.co', 'Warming · D17', 78, 'warning'],
];

function tone(t: Tone) {
  const c = `var(--wp-${t})`;
  return { text: c, soft: `color-mix(in srgb, ${c} 12%, transparent)`, softer: `color-mix(in srgb, ${c} 8%, transparent)`, line: `color-mix(in srgb, ${c} 32%, transparent)` };
}

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-accent)' }}>{label}</span>
      <div className="relative overflow-hidden" style={{ width: 390, height: 720, borderRadius: 38, border: '10px solid #111', background: 'var(--wp-bg)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 130, height: 26, background: '#111', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, zIndex: 30 }} />
        <div className="wp-grid-dots pointer-events-none absolute inset-0" />
        <div className="relative h-full w-full overflow-y-auto px-4 py-12">{children}</div>
      </div>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="mb-5 text-center">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>One platform · every tier</span>
      <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">
        See it <span className="wp-headline-grad">in action.</span>
      </h2>
    </div>
  );
}

function Badge({ tier }: { tier: Tier }) {
  if (tier.badge === 'gradient') {
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.14em]" style={{ background: 'linear-gradient(135deg, var(--wp-accent), var(--wp-accent-2))', color: '#fff' }}><Sparkles size={9} strokeWidth={2.4} />{tier.label.toUpperCase()}</span>;
  }
  const strong = tier.badge === 'accent';
  return <span className="inline-flex rounded-full px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.14em]" style={{ background: `color-mix(in srgb, var(--wp-accent) ${strong ? 22 : 6}%, transparent)`, border: `1px solid color-mix(in srgb, var(--wp-accent) ${strong ? 55 : 45}%, transparent)`, color: 'var(--wp-accent)' }}>{tier.label.toUpperCase()}</span>;
}

function Gauge({ value, size = 96 }: { value: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - value / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--wp-border)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--wp-accent)" strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[22px] font-bold leading-none" style={{ color: 'var(--wp-text)' }}>{value}</span>
        <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>warmth</span>
      </div>
    </div>
  );
}

function KpiRow({ kpis }: { kpis: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {kpis.map(([l, v]) => (
        <div key={l} className="rounded-xl px-2 py-2 text-center" style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)', border: '1px solid var(--wp-border)' }}>
          <div className="font-mono text-[14px] font-bold" style={{ color: 'var(--wp-accent)' }}>{v}</div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function TierPills({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  return (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {TIERS.map((t, i) => {
        const on = i === active;
        return (
          <button key={t.key} onClick={() => onSelect(i)} className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: on ? 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))' : 'transparent', border: `1px solid ${on ? 'transparent' : 'var(--wp-border)'}`, color: on ? '#fff' : 'var(--wp-text-dim)' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── A · Phone app, tier switcher ─────────────────────────────────────────── */
function DesignA() {
  const [active, setActive] = useState(2);
  const tier = TIERS[active]!;
  return (
    <PhoneFrame label="A · App Mockup">
      <SectionHeader />
      <TierPills active={active} onSelect={setActive} />
      <div className="wp-glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: '1px solid var(--wp-border)' }}>
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--wp-danger)' }} />
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--wp-warning)' }} />
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--wp-success)' }} />
          <span className="ml-2 font-mono text-[9px]" style={{ color: 'var(--wp-text-faint)' }}>app.warmpulse.io</span>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-faint)' }}>{tier.sub}</span>
            <Badge tier={tier} />
          </div>
          <div className="text-[14px] font-semibold" style={{ color: 'var(--wp-text)' }}>{tier.headline}</div>
          <div className="flex items-center gap-4">
            <Gauge value={tier.warmth} />
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: 'color-mix(in srgb, var(--wp-success) 12%, transparent)' }}>
              <TrendingUp size={12} style={{ color: 'var(--wp-success)' }} />
              <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--wp-success)' }}>+{tier.delta}</span>
            </div>
          </div>
          <KpiRow kpis={tier.kpis} />
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ── B · Stacked tier cards ───────────────────────────────────────────────── */
function DesignB() {
  return (
    <PhoneFrame label="B · Stacked Cards">
      <SectionHeader />
      <div className="space-y-3">
        {TIERS.map((tier) => (
          <div key={tier.key} className="wp-glass rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <Badge tier={tier} />
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold" style={{ color: 'var(--wp-success)' }}><TrendingUp size={11} />+{tier.delta}</span>
            </div>
            <div className="text-[14px] font-semibold" style={{ color: 'var(--wp-text)' }}>{tier.tagline}</div>
            <div className="mb-3 text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>{tier.headline}</div>
            <KpiRow kpis={tier.kpis} />
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

/* ── C · Tabs + KPI summary ───────────────────────────────────────────────── */
function DesignC() {
  const [active, setActive] = useState(1);
  const tier = TIERS[active]!;
  return (
    <PhoneFrame label="C · KPI Summary">
      <SectionHeader />
      <TierPills active={active} onSelect={setActive} />
      <div className="wp-glass flex flex-col items-center gap-4 rounded-2xl p-5">
        <Badge tier={tier} />
        <Gauge value={tier.warmth} size={120} />
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'color-mix(in srgb, var(--wp-success) 12%, transparent)' }}>
          <TrendingUp size={12} style={{ color: 'var(--wp-success)' }} />
          <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--wp-success)' }}>+{tier.delta} this week</span>
        </div>
        <div className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)' }}>{tier.headline}</div>
        <div className="w-full"><KpiRow kpis={tier.kpis} /></div>
      </div>
    </PhoneFrame>
  );
}

/* ── D · Mailbox console (master/detail) ──────────────────────────────────── */
function DesignD() {
  const [sel, setSel] = useState(0);
  const m = MAILBOXES[sel]!;
  return (
    <PhoneFrame label="D · Mailbox Console">
      <SectionHeader />
      {/* detail strip */}
      <div className="wp-glass mb-3 flex items-center gap-4 rounded-2xl p-4">
        <Gauge value={m[3]} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>{m[1]}</div>
          <div className="text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>{m[2]}</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[['Sends', '70'], ['Opens', '78%'], ['Inbox', '92%']].map(([l, v]) => (
              <div key={l} className="text-center">
                <div className="font-mono text-[12px] font-bold" style={{ color: 'var(--wp-accent)' }}>{v}</div>
                <div className="text-[8px] uppercase" style={{ color: 'var(--wp-text-faint)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* search */}
      <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)', border: '1px solid var(--wp-border)' }}>
        <Search size={13} style={{ color: 'var(--wp-text-faint)' }} />
        <span className="text-[12px]" style={{ color: 'var(--wp-text-faint)' }}>Search mailboxes…</span>
      </div>
      {/* mailbox list */}
      <div className="space-y-1.5">
        {MAILBOXES.map((mb, i) => {
          const mt = tone(mb[4]);
          const on = i === sel;
          return (
            <button key={mb[1]} onClick={() => setSel(i)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ background: on ? mt.softer : 'transparent', border: `1px solid ${on ? mt.line : 'var(--wp-border)'}` }}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold" style={{ background: mt.soft, color: mt.text, border: `1px solid ${mt.line}` }}>{mb[0]}</span>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[12px] font-semibold" style={{ color: 'var(--wp-text)' }}>{mb[1]}</div>
                <div className="text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>{mb[2]}</div>
              </div>
              <span className="font-mono text-[13px] font-bold" style={{ color: mt.text }}>{mb[3]}</span>
            </button>
          );
        })}
        <div className="pt-1 text-center text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>+ 6 more…</div>
      </div>
    </PhoneFrame>
  );
}

export function MobileDashboardPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>Dashboard Showcase — Mobile Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Tier dashboards on mobile · same theme & data · 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
