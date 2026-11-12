import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, CreditCard, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-billing-designs.css';

/**
 * /client-design-preview/billing/starter — picker for STARTER Billing.
 *
 *   B1 — Statement View    Stripe-portal aesthetic, line-item ledger
 *   B2 — Subscription Card Spotify/Apple-style big sub card + invoices
 *   B3 — Usage Meters      Phone-bill: bars showing usage vs allowance
 *   B4 — Dashboard Grid    Multi-tile dashboard: plan · usage · pm · invoices
 */

type DesignCode = 'B1' | 'B2' | 'B3' | 'B4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientBillingDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/billing" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter billing designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <CreditCard size={11} strokeWidth={2.4} />
            Section 9 · Billing · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>billing view</em>
          </h1>
          <p className="cdp__sub">
            Starter is one simple plan at ₹1,500/mo. Billing shows: current plan + usage +
            payment method + invoice history. Four directions for how that surface can feel —
            from a bank statement to a Spotify-style subscription card.
          </p>
          <div className="cdp__plan-strip">
            <span className="cdp__plan-chip cdp__plan-chip--active">
              <span className="cdp__plan-chip-dot" style={{ background: '#f472b6' }} />
              Starter · Solo
            </span>
            <span className="cdp__plan-chip">
              <span
                className="cdp__plan-chip-dot"
                style={{ background: 'var(--wp-accent, #F26522)' }}
              />
              Pro · Team
            </span>
            <span className="cdp__plan-chip">
              <span className="cdp__plan-chip-dot" style={{ background: '#facc15' }} />
              Agency · Multi-tenant
            </span>
          </div>
        </section>

        <div className="cdp__grid">
          {VARIANTS.map((v) => (
            <button
              key={v.code}
              type="button"
              className={`cdp-tile ${picked === v.code ? 'cdp-tile--selected' : ''}`}
              onClick={() => setPicked(v.code)}
            >
              {picked === v.code && (
                <span className="cdp-tile__check">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              <div className="cdp-tile__preview">
                <v.Preview />
              </div>
              <div className="cdp-tile__body">
                <div className="cdp-tile__head">
                  <span className="cdp-tile__code">{v.code}</span>
                  <span className="cdp-tile__name">{v.name}</span>
                </div>
                <p className="cdp-tile__tag">{v.tagline}</p>
                <ul className="cdp-tile__bullets">
                  {v.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>

        <section className="cdp__verdict">
          <div className="cdp__verdict-text">
            <div>
              You picked:{' '}
              <strong>
                {picked
                  ? `${picked} — ${VARIANTS.find((v) => v.code === picked)?.name}`
                  : 'Nothing yet'}
              </strong>
            </div>
            <p>
              Tell me your pick (e.g. <strong>"use B2"</strong>) and we move to the final
              section: Settings.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'B1',
    name: 'Statement View',
    tagline:
      "Stripe-portal aesthetic. Top: month + total amount. Below: line-item ledger of charges (date · description · amount). Side panel with payment method. Bank-statement clarity.",
    bullets: [
      'Month header with total amount',
      'Ledger: date · description · amount columns',
      'Side panel with current payment method',
      'Most boring · most familiar',
    ],
    Preview: PreviewStatement,
  },
  {
    code: 'B2',
    name: 'Subscription Card',
    tagline:
      'Spotify/Apple-style big subscription card with gradient art, plan name, big price, next-renewal date, manage button. Invoices list below. Looks like a premium product.',
    bullets: [
      'Big gradient subscription card',
      'Plan name + ₹1,500/mo prominently',
      'Next-renewal date + manage button',
      'Invoices list below the card',
    ],
    Preview: PreviewSubscription,
  },
  {
    code: 'B3',
    name: 'Usage Meters',
    tagline:
      'Phone-bill style. Plan card on top with upgrade CTA. Three usage meters below — Mailboxes 1/1, Emails today 32/50, Tokens this month 12k/30k — each with a filled bar.',
    bullets: [
      'Plan summary with upgrade CTA',
      '3 usage meters with progress bars',
      'Each meter: label · value · bar fill',
      'Payment method card at bottom',
    ],
    Preview: PreviewMeters,
  },
  {
    code: 'B4',
    name: 'Dashboard Grid',
    tagline:
      "Multi-tile dashboard. 2×2 grid: Plan card · Usage card · Payment method card · Recent invoices card. Each tile self-contained. Like an account dashboard.",
    bullets: [
      '2×2 tile grid layout',
      'Plan tile (accent-tinted)',
      'Usage tile with mini bar',
      'Payment method + invoices tiles',
    ],
    Preview: PreviewDashboard,
  },
];

/* ---------- B1 Statement View ---------- */
function PreviewStatement() {
  const rows = [
    { date: '22 May', amt: '₹1,500' },
    { date: '22 Apr', amt: '₹1,500' },
    { date: '22 Mar', amt: '₹1,500' },
    { date: '22 Feb', amt: '₹1,500' },
  ];
  return (
    <div className="mk mk--statement">
      <div className="mk-st__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: 50, height: 8 }} />
          <span className="mk-pill" style={{ width: 70 }} />
        </div>
        <div className="mk-st__total">
          <span className="mk-amount" style={{ fontSize: 20 }}>₹1,500</span>
          <span className="mk-pill" style={{ width: 50, height: 5, marginTop: 3 }} />
        </div>
      </div>
      <div className="mk-st__ledger">
        <div className="mk-st__col-head">
          <span>Date</span>
          <span>Description</span>
          <span>Amount</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="mk-st__row">
            <span className="mk-st__date">{r.date}</span>
            <span className="mk-pill" style={{ width: '75%' }} />
            <span className="mk-st__amt">{r.amt}</span>
          </div>
        ))}
      </div>
      <div className="mk-st__side">
        <div className="mk-st__pm">
          <span className="mk-card-art" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
            <span className="mk-pill" style={{ width: '50%' }} />
          </div>
        </div>
        <div className="mk-st__pm">
          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--wp-accent) 35%, transparent)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill" style={{ width: '60%' }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- B2 Subscription Card ---------- */
function PreviewSubscription() {
  return (
    <div className="mk mk--sub">
      <div className="mk-sb__card">
        <span className="mk-sb__plan-name">STARTER</span>
        <span className="mk-sb__chip">ACTIVE</span>
        <div className="mk-sb__price-row">
          <span className="mk-sb__price-big">₹1,500</span>
          <span className="mk-sb__price-period">/ month</span>
        </div>
        <div className="mk-sb__foot">
          <span className="mk-sb__next">Renews 22 Jun</span>
          <span className="mk-sb__manage-btn" />
        </div>
      </div>
      <div className="mk-sb__invoices">
        {['22 May', '22 Apr', '22 Mar'].map((d, i) => (
          <div key={i} className="mk-sb__inv-row">
            <span className="mk-pill" style={{ width: '60%' }} />
            <span className="mk-sb__inv-date">{d}</span>
            <span className="mk-sb__inv-amt">₹1,500</span>
            <span className="mk-sb__inv-dl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- B3 Usage Meters ---------- */
function PreviewMeters() {
  const meters: Array<{ label: string; value: string; pct: number }> = [
    { label: 'Mailboxes', value: '1 / 1', pct: 100 },
    { label: 'Emails today', value: '32 / 50', pct: 64 },
    { label: 'Tokens · MTD', value: '12k / 30k', pct: 40 },
  ];
  return (
    <div className="mk mk--meters">
      <div className="mk-mt__plan">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: 80, height: 8 }} />
          <span className="mk-pill" style={{ width: 65 }} />
        </div>
        <span className="mk-amount" style={{ fontSize: 14 }}>₹1,500</span>
        <span
          style={{
            width: 64,
            height: 18,
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--wp-accent) 35%, var(--wp-surface))',
            border: '1px solid color-mix(in srgb, var(--wp-accent) 55%, transparent)',
          }}
        />
      </div>
      <div className="mk-mt__meters">
        {meters.map((m) => (
          <div key={m.label} className="mk-mt__meter">
            <span className="mk-mt__meter-label">{m.label}</span>
            <span className="mk-mt__meter-value">{m.value}</span>
            <span className="mk-mt__bar">
              <span className="mk-mt__bar-fill" style={{ width: `${m.pct}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="mk-mt__pm">
        <span className="mk-card-art" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
          <span className="mk-pill" style={{ width: '40%' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- B4 Dashboard Grid ---------- */
function PreviewDashboard() {
  return (
    <div className="mk mk--dashboard">
      <div className="mk-db__card mk-db__card--plan">
        <div className="mk-db__head">
          <span className="mk-db__label">CURRENT PLAN</span>
          <span style={{ width: 50, height: 12, borderRadius: 999, background: 'color-mix(in srgb, #f472b6 25%, transparent)', border: '1px solid color-mix(in srgb, #f472b6 55%, transparent)' }} />
        </div>
        <span className="mk-amount" style={{ fontSize: 22 }}>₹1,500</span>
        <span className="mk-pill" style={{ width: '70%' }} />
        <span style={{ marginTop: 'auto', height: 16, borderRadius: 999, background: 'color-mix(in srgb, var(--wp-accent) 25%, var(--wp-surface))', border: '1px solid color-mix(in srgb, var(--wp-accent) 55%, transparent)' }} />
      </div>
      <div className="mk-db__card">
        <span className="mk-db__label">USAGE · TODAY</span>
        <span className="mk-amount" style={{ fontSize: 18 }}>32<span style={{ fontSize: 10, color: 'var(--wp-text-dim)' }}>/50</span></span>
        <span className="mk-db__usage-bar" />
        <span className="mk-pill" style={{ width: '60%' }} />
      </div>
      <div className="mk-db__card">
        <span className="mk-db__label">PAYMENT METHOD</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mk-card-art" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '75%' }} />
            <span className="mk-pill" style={{ width: '55%' }} />
          </div>
        </div>
        <span style={{ marginTop: 'auto', height: 12, width: 50, borderRadius: 999, background: 'color-mix(in srgb, var(--wp-accent) 22%, var(--wp-surface))', border: '1px solid color-mix(in srgb, var(--wp-accent) 45%, transparent)' }} />
      </div>
      <div className="mk-db__card">
        <span className="mk-db__label">INVOICES</span>
        <div className="mk-db__inv-list">
          {['22 May', '22 Apr', '22 Mar', '22 Feb'].map((d, i) => (
            <div key={i} className="mk-db__inv-row">
              <span className="mk-db__inv-date">{d}</span>
              <span className="mk-pill" style={{ width: '55%' }} />
              <span style={{ flex: 1 }} />
              <span style={{ width: 16, height: 10, borderRadius: 999, background: 'color-mix(in srgb, var(--wp-accent) 22%, transparent)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
