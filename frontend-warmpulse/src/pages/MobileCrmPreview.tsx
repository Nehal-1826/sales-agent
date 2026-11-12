import { useState } from 'react';
import { Kanban, Users, TrendingUp, UserPlus, Send, Reply, Handshake, Trophy, ChevronDown, type LucideIcon } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

/* ── Shared data (mirrors CRM_STAGES on the landing page) ─────────────────── */

type Tone = 'accent' | 'accent-2' | 'warning' | 'success';
type Lead = { name: string; company: string; value: string; initials: string };
type Stage = { key: string; label: string; tone: Tone; icon: LucideIcon; total: string; leads: Lead[] };

const STAGES: Stage[] = [
  { key: 'new', label: 'New', tone: 'accent-2', icon: UserPlus, total: '$4.9k', leads: [
    { name: 'Maya Chen', company: 'Northwind Labs', value: '$3.1k', initials: 'MC' },
    { name: 'Devin Park', company: 'Quanta IO', value: '$1.8k', initials: 'DP' },
  ] },
  { key: 'contacted', label: 'Contacted', tone: 'accent', icon: Send, total: '$12.0k', leads: [
    { name: 'Sara Okoye', company: 'Helio Freight', value: '$5.4k', initials: 'SO' },
    { name: 'Tom Virtanen', company: 'Brightloop', value: '$2.6k', initials: 'TV' },
    { name: 'Aria Nasser', company: 'Cedar & Co', value: '$4.0k', initials: 'AN' },
  ] },
  { key: 'replied', label: 'Replied', tone: 'warning', icon: Reply, total: '$11.1k', leads: [
    { name: 'Leo Marchetti', company: 'Vellum Studio', value: '$7.2k', initials: 'LM' },
    { name: 'Priya Rao', company: 'Stackforge', value: '$3.9k', initials: 'PR' },
  ] },
  { key: 'interested', label: 'Interested', tone: 'success', icon: Handshake, total: '$19.3k', leads: [
    { name: 'Jonas Weber', company: 'Lumen Retail', value: '$12.5k', initials: 'JW' },
    { name: 'Hana Sato', company: 'Driftwood', value: '$6.8k', initials: 'HS' },
  ] },
  { key: 'won', label: 'Won', tone: 'success', icon: Trophy, total: '$18.0k', leads: [
    { name: 'Owen Blake', company: 'Mercer Group', value: '$18.0k', initials: 'OB' },
  ] },
];

function tone(t: Tone) {
  const c = `var(--wp-${t})`;
  return { text: c, soft: `color-mix(in srgb, ${c} 12%, transparent)`, softer: `color-mix(in srgb, ${c} 8%, transparent)`, line: `color-mix(in srgb, ${c} 32%, transparent)` };
}

/* ── Phone frame ──────────────────────────────────────────────────────────── */

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
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>
        <Kanban size={12} strokeWidth={2.2} /> Then fill your pipeline
      </span>
      <h2 className="mt-3 text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">
        Warm the inbox. <span className="wp-headline-grad">Then close the deal.</span>
      </h2>
    </div>
  );
}

function LeadCard({ lead, t }: { lead: Lead; t: ReturnType<typeof tone> }) {
  return (
    <div className="wp-glass flex items-center gap-2.5 rounded-xl p-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold" style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}>{lead.initials}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>{lead.name}</div>
        <div className="truncate text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>{lead.company}</div>
      </div>
      <span className="shrink-0 font-mono text-[11px] font-bold" style={{ color: t.text }}>{lead.value}</span>
    </div>
  );
}

/* ── A · Snap-scroll columns ──────────────────────────────────────────────── */
function DesignA() {
  return (
    <PhoneFrame label="A · Snap-Scroll Columns">
      <SectionHeader />
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {STAGES.map((s) => {
          const t = tone(s.tone);
          return (
            <div key={s.key} className="w-[82%] shrink-0 snap-start">
              <div className="mb-2 flex items-center justify-between rounded-xl px-3 py-2" style={{ background: t.softer, border: `1px solid ${t.line}` }}>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--wp-text)' }}><s.icon size={13} style={{ color: t.text }} /> {s.label}</span>
                <span className="font-mono text-[11px] font-bold" style={{ color: t.text }}>{s.leads.length}</span>
              </div>
              <div className="space-y-2">{s.leads.map((l) => <LeadCard key={l.name} lead={l} t={t} />)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {STAGES.map((s, i) => <span key={s.key} className="h-1.5 rounded-full" style={{ width: i === 0 ? 16 : 6, background: i === 0 ? 'var(--wp-accent)' : 'var(--wp-border-strong)' }} />)}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>← swipe stages →</p>
    </PhoneFrame>
  );
}

/* ── B · Stage tabs + list ────────────────────────────────────────────────── */
function DesignB() {
  const [active, setActive] = useState(STAGES[1]!.key);
  const stage = STAGES.find((s) => s.key === active)!;
  const t = tone(stage.tone);
  return (
    <PhoneFrame label="B · Stage Tabs">
      <SectionHeader />
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {STAGES.map((s) => {
          const st = tone(s.tone);
          const on = s.key === active;
          return (
            <button key={s.key} onClick={() => setActive(s.key)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: on ? st.soft : 'transparent', border: `1px solid ${on ? st.line : 'var(--wp-border)'}`, color: on ? 'var(--wp-text)' : 'var(--wp-text-dim)' }}>
              <s.icon size={12} style={{ color: on ? st.text : 'var(--wp-text-faint)' }} /> {s.label}
              <span className="font-mono text-[10px]" style={{ color: st.text }}>{s.leads.length}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2" style={{ background: t.softer, border: `1px solid ${t.line}` }}>
        <span className="text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>{stage.label} pipeline</span>
        <span className="font-mono text-[13px] font-bold" style={{ color: t.text }}>{stage.total}</span>
      </div>
      <div className="mt-3 space-y-2">{stage.leads.map((l) => <LeadCard key={l.name} lead={l} t={t} />)}</div>
    </PhoneFrame>
  );
}

/* ── C · Vertical accordion ───────────────────────────────────────────────── */
function DesignC() {
  const [open, setOpen] = useState<string | null>(STAGES[0]!.key);
  return (
    <PhoneFrame label="C · Vertical Accordion">
      <SectionHeader />
      <div className="space-y-2">
        {STAGES.map((s) => {
          const t = tone(s.tone);
          const on = open === s.key;
          return (
            <div key={s.key} className="overflow-hidden rounded-xl" style={{ border: `1px solid ${t.line}` }}>
              <button onClick={() => setOpen(on ? null : s.key)} className="flex w-full items-center justify-between px-3 py-2.5" style={{ background: t.softer }}>
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>
                  <s.icon size={14} style={{ color: t.text }} /> {s.label}
                  <span className="font-mono text-[11px]" style={{ color: t.text }}>· {s.leads.length}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold" style={{ color: t.text }}>{s.total}</span>
                  <ChevronDown size={15} style={{ color: 'var(--wp-text-faint)', transform: on ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </span>
              </button>
              {on && <div className="space-y-2 p-2">{s.leads.map((l) => <LeadCard key={l.name} lead={l} t={t} />)}</div>}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/* ── D · Pipeline summary ─────────────────────────────────────────────────── */
function DesignD() {
  return (
    <PhoneFrame label="D · Pipeline Summary">
      <SectionHeader />
      <div className="wp-glass mb-3 flex items-center justify-between rounded-xl px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--wp-text-dim)' }}><Users size={13} style={{ color: 'var(--wp-accent)' }} /> 10 leads</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-bold" style={{ color: 'var(--wp-success)' }}><TrendingUp size={13} /> $65.3k</span>
      </div>
      <div className="space-y-2">
        {STAGES.map((s) => {
          const t = tone(s.tone);
          return (
            <div key={s.key} className="wp-glass flex items-center gap-3 rounded-xl p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: t.soft, color: t.text, border: `1px solid ${t.line}` }}><s.icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--wp-text)' }}>{s.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>{s.leads.length} lead{s.leads.length > 1 ? 's' : ''}</div>
              </div>
              <div className="flex -space-x-2">
                {s.leads.slice(0, 3).map((l) => (
                  <span key={l.name} className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-bold" style={{ background: t.soft, color: t.text, border: '1.5px solid var(--wp-bg)' }}>{l.initials}</span>
                ))}
              </div>
              <span className="shrink-0 font-mono text-[12px] font-bold" style={{ color: t.text }}>{s.total}</span>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

export function MobileCrmPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>CRM Pipeline — Mobile Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Same theme & data as the live CRM band · 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
