import { ArrowRight, PlayCircle, Check, Sparkles, TrendingUp } from 'lucide-react';
import '@/pages/landing/hero-theme.css';

/* Shared atoms reused across the 4 mobile hero variations ------------------ */

function LivePill() {
  return (
    <div className="wp-glass inline-flex h-8 items-center gap-2 rounded-full px-3">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full" style={{ background: 'var(--wp-success)', opacity: 0.7 }} />
        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: 'var(--wp-success)' }} />
      </span>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-success)' }}>Live</span>
      <span className="h-3 w-px" style={{ background: 'var(--wp-border-strong)' }} />
      <span className="text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>
        <span className="font-mono" style={{ color: 'var(--wp-accent)' }}>2,841</span> engaging now
      </span>
    </div>
  );
}

function Eyebrow() {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--wp-accent)' }}>
      Email warmup · Peer Network
    </span>
  );
}

function PrimaryCta({ full = false }: { full?: boolean }) {
  return (
    <button
      className={`wp-cta-pulse group inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold ${full ? 'w-full' : ''}`}
      style={{
        background: 'linear-gradient(180deg, var(--wp-accent), var(--wp-accent-hover))',
        color: '#fff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 28px color-mix(in srgb, var(--wp-accent) 40%, transparent)',
      }}
    >
      Start warming free
      <ArrowRight size={16} strokeWidth={2.2} />
    </button>
  );
}

function SecondaryCta({ full = false }: { full?: boolean }) {
  return (
    <button className={`wp-glass inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium ${full ? 'w-full' : ''}`} style={{ color: 'var(--wp-text)' }}>
      <PlayCircle size={16} strokeWidth={1.8} />
      See how it works
    </button>
  );
}

function TrustLine() {
  return (
    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--wp-text-faint)' }}>
      <Check size={13} strokeWidth={2} style={{ color: 'var(--wp-success)' }} />
      Connect a mailbox in 30s — no card required
    </div>
  );
}

const STATS = [
  { value: '2,841', label: 'Peer mailboxes' },
  { value: '94.2%', label: 'Inbox placement' },
  { value: '12.4k', label: 'Mailboxes warmed' },
  { value: '4.8', label: 'G2 rating' },
];

/* Phone frame wrapper ------------------------------------------------------- */

function PhoneFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--wp-accent)' }}>{label}</span>
      <div
        className="relative overflow-hidden"
        style={{
          width: 390,
          height: 760,
          borderRadius: 38,
          border: '10px solid #111',
          background: 'var(--wp-bg)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* notch */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 130, height: 26, background: '#111', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, zIndex: 30 }} />
        {/* grid dots backdrop */}
        <div className="wp-grid-dots pointer-events-none absolute inset-0" />
        <div className="relative h-full w-full overflow-y-auto px-6 py-12">{children}</div>
      </div>
    </div>
  );
}

/* ── Design A — Faithful centered port ───────────────────────────────────── */
function DesignA() {
  return (
    <PhoneFrame label="A · Classic Centered">
      <div className="flex flex-col items-center text-center">
        <LivePill />
        <div className="mt-5"><Eyebrow /></div>
        <h1 className="mt-4 font-sans text-[40px] font-bold leading-[1.04] tracking-[-0.04em]">
          <span style={{ color: 'var(--wp-text)', display: 'block' }}>Land in the inbox.</span>
          <span className="wp-headline-grad block">Every time.</span>
        </h1>
        <p className="mt-5 text-[15px] leading-[1.6]" style={{ color: 'var(--wp-text-dim)' }}>
          A real peer-inbox network that trains ESPs to trust your domain — so outreach lands in inbox, not Spam.
        </p>
        <div className="mt-7 flex w-full flex-col gap-3">
          <PrimaryCta full />
          <SecondaryCta full />
        </div>
        <div className="mt-5"><TrustLine /></div>
        <div className="mt-8 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl" style={{ background: 'var(--wp-border)', border: '1px solid var(--wp-border)' }}>
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 px-3 py-4" style={{ background: 'var(--wp-bg)' }}>
              <span className="font-mono text-[20px] font-bold" style={{ color: 'var(--wp-accent)' }}>{s.value}</span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ── Design B — Stats-forward cards ──────────────────────────────────────── */
function DesignB() {
  return (
    <PhoneFrame label="B · Stats Forward">
      <div className="flex flex-col items-start text-left">
        <LivePill />
        <h1 className="mt-6 font-sans text-[42px] font-bold leading-[1.02] tracking-[-0.04em]">
          <span style={{ color: 'var(--wp-text)', display: 'block' }}>Land in the</span>
          <span className="wp-headline-grad block">inbox. Every time.</span>
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6]" style={{ color: 'var(--wp-text-dim)' }}>
          Peer-inbox warmup that builds sender reputation automatically.
        </p>
        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="wp-glass flex flex-col gap-1 rounded-2xl px-4 py-4">
              <span className="font-mono text-[24px] font-bold" style={{ color: 'var(--wp-accent)' }}>{s.value}</span>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 w-full"><PrimaryCta full /></div>
        <div className="mt-4 self-center"><TrustLine /></div>
      </div>
    </PhoneFrame>
  );
}

/* ── Design C — Dashboard preview ────────────────────────────────────────── */
function DesignC() {
  return (
    <PhoneFrame label="C · Device Preview">
      <div className="flex flex-col items-center text-center">
        <Eyebrow />
        <h1 className="mt-4 font-sans text-[38px] font-bold leading-[1.04] tracking-[-0.04em]">
          <span style={{ color: 'var(--wp-text)', display: 'block' }}>Land in the inbox.</span>
          <span className="wp-headline-grad block">Every time.</span>
        </h1>
        <p className="mt-4 text-[14px] leading-[1.6]" style={{ color: 'var(--wp-text-dim)' }}>
          Watch your reputation climb in real time.
        </p>
        <div className="mt-6 w-full"><PrimaryCta full /></div>
        {/* mini dashboard card */}
        <div className="wp-glass mt-7 w-full overflow-hidden rounded-2xl text-left">
          <div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--wp-border)' }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#febc2e' }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#28c840' }} />
            <span className="ml-2 font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>app.warmpulse.io</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--wp-text-dim)' }}>Inbox placement</span>
              <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--wp-success)' }}>94.2%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--wp-surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: '94%', background: 'linear-gradient(90deg, var(--wp-accent), var(--wp-accent-2))' }} />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[['Sent', '5,210'], ['Opened', '4,890'], ['Replied', '1,204']].map(([l, v]) => (
                <div key={l} className="rounded-xl px-2 py-2" style={{ background: 'var(--wp-surface)' }}>
                  <div className="font-mono text-[14px] font-bold" style={{ color: 'var(--wp-accent)' }}>{v}</div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--wp-text-faint)' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5"><TrustLine /></div>
      </div>
    </PhoneFrame>
  );
}

/* ── Design D — Bold minimal ─────────────────────────────────────────────── */
function DesignD() {
  return (
    <PhoneFrame label="D · Bold Minimal">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: 'var(--wp-accent)' }} />
          <span className="text-[15px] font-semibold">WarmPulse</span>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <Eyebrow />
          <h1 className="mt-4 font-sans text-[52px] font-bold leading-[0.98] tracking-[-0.045em]">
            <span style={{ color: 'var(--wp-text)', display: 'block' }}>Land in</span>
            <span style={{ color: 'var(--wp-text)', display: 'block' }}>the inbox.</span>
            <span className="wp-headline-grad block">Every time.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-[1.6]" style={{ color: 'var(--wp-text-dim)' }}>
            Peer-inbox warmup. Trusted by 12k+ senders.
          </p>
          <div className="mt-6 flex items-center gap-4">
            {[['+42%', 'open rate'], ['94%', 'inbox'], ['4.8', 'G2']].map(([v, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <TrendingUp size={14} style={{ color: 'var(--wp-success)' }} />
                <span className="font-mono text-[16px] font-bold" style={{ color: 'var(--wp-text)' }}>{v}</span>
                <span className="text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 pb-2">
          <PrimaryCta full />
          <div className="self-center"><TrustLine /></div>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function MobileHeroPreview() {
  return (
    <div style={{ background: 'var(--wp-bg)', color: 'var(--wp-text)', minHeight: '100vh', padding: '3rem 1rem' }}>
      <h1 className="text-center text-[22px] font-bold" style={{ marginBottom: '0.5rem' }}>Mobile Hero — 4 Premium Designs</h1>
      <p className="text-center text-[13px]" style={{ color: 'var(--wp-text-dim)', marginBottom: '3rem' }}>Same theme & copy as the live hero · viewed at 390px</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem', justifyContent: 'center' }}>
        <DesignA />
        <DesignB />
        <DesignC />
        <DesignD />
      </div>
    </div>
  );
}
