import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ShieldCheck, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-reputation-designs.css';

/**
 * /client-design-preview/reputation/starter — picker for STARTER Reputation
 * & Health. Starter caps at SPF/DKIM/DMARC checker + basic warmth — no
 * blacklist monitoring, no SNDS deep-dives, no Postmaster API.
 *
 *   H1 — Health Score Hub  Composite score + breakdown cards
 *   H2 — Checkup Form      Row list with fix actions, medical-checkup style
 *   H3 — Health Tile Grid  Each subsystem as its own card in a 2×2 grid
 *   H4 — Status Page       status.io aesthetic with operational badge
 */

type DesignCode = 'H1' | 'H2' | 'H3' | 'H4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientReputationDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/reputation" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter reputation designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <ShieldCheck size={11} strokeWidth={2.4} />
            Section 5 · Reputation & Health · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>reputation view</em>
          </h1>
          <p className="cdp__sub">
            Starter's reputation surface is DNS (SPF/DKIM/DMARC) + warmth + provider auth —
            no blacklist monitoring, no SNDS, no Postmaster API. Four directions for how that
            mailbox-health story can feel.
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
              Tell me your pick (e.g. <strong>"use H1"</strong>) and we move to Section 6:
              Tools.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'H1',
    name: 'Health Score Hub',
    tagline:
      'Big composite "Health Score" gauge at the top — single number summarizing DNS + warmth + auth. Three breakdown cards below with the issues that drove the score.',
    bullets: [
      'Hero gauge with composite score (0–100)',
      'One-line summary alongside',
      '3 breakdown cards: DNS · Warmth · Auth',
      'Each card colored by its own status',
    ],
    Preview: PreviewHub,
  },
  {
    code: 'H2',
    name: 'Checkup Form',
    tagline:
      'Medical-checkup style. Each check is a row — icon · name · status pill · fix button. Educational, action-oriented. The user knows exactly what to do next.',
    bullets: [
      'Small hero card with overall health score',
      'Row per check (SPF/DKIM/DMARC/Warmth/Auth)',
      'Status pill: OK · WARN · FAIL',
      'Each warn/fail row has a "Fix" button',
    ],
    Preview: PreviewCheckup,
  },
  {
    code: 'H3',
    name: 'Health Tile Grid',
    tagline:
      'Each health subsystem is its own card in a 2×2 grid — DNS · Warmth gauge · Provider auth · Domain. All visible at once, glance-friendly. Top-border colored by status.',
    bullets: [
      '2×2 tile grid, equal weight',
      'DNS card with 3 record-status rows',
      'Warmth card with a small gauge',
      'Provider auth + Domain cards',
    ],
    Preview: PreviewTileGrid,
  },
  {
    code: 'H4',
    name: 'Status Page',
    tagline:
      'status.io aesthetic. Big "All systems operational" badge with pulsing dot at top. Subsystems listed below with traffic-light history bars. Incident timeline at the bottom.',
    bullets: [
      'Hero: "Operational" pill with pulsing dot',
      'Subsystem rows with 30-day history bars',
      'Bars colored per day (ok/warn/down)',
      'Incident note at the bottom',
    ],
    Preview: PreviewStatus,
  },
];

/* ---------- H1 Health Score Hub ---------- */
function PreviewHub() {
  return (
    <div className="mk mk--hub">
      <div className="mk-hub__hero">
        <span className="mk-hub__gauge" />
        <div className="mk-hub__hero-text">
          <span className="mk-pill mk-pill--accent" style={{ width: '60%', height: 9 }} />
          <span className="mk-pill" style={{ width: '80%' }} />
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
      </div>
      <div className="mk-hub__cards">
        <div className="mk-hub__card">
          <div className="mk-hub__card-head">
            <span className="mk-check" />
            DNS
          </div>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
        <div className="mk-hub__card mk-hub__card--warn">
          <div className="mk-hub__card-head">
            <span className="mk-warn-ic" />
            WARMTH
          </div>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
        <div className="mk-hub__card">
          <div className="mk-hub__card-head">
            <span className="mk-check" />
            AUTH
          </div>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- H2 Checkup Form ---------- */
function PreviewCheckup() {
  const checks: Array<{
    icon: 'ok' | 'warn' | 'err';
    name: string;
    status: 'ok' | 'warn' | 'err';
    statusText: string;
    fix: boolean;
  }> = [
    { icon: 'ok', name: 'SPF', status: 'ok', statusText: 'OK', fix: false },
    { icon: 'ok', name: 'DKIM', status: 'ok', statusText: 'OK', fix: false },
    { icon: 'err', name: 'DMARC', status: 'err', statusText: 'MISSING', fix: true },
    { icon: 'ok', name: 'Warmth', status: 'ok', statusText: 'HEALTHY', fix: false },
    { icon: 'warn', name: 'Provider auth', status: 'warn', statusText: 'CHECK', fix: true },
  ];
  return (
    <div className="mk mk--checkup">
      <div className="mk-cu__hero">
        <span className="mk-check" style={{ width: 24, height: 24 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: '40%', height: 9 }} />
          <span className="mk-pill" style={{ width: '60%' }} />
        </div>
      </div>
      <div className="mk-cu__list">
        {checks.map((c, i) => (
          <div key={i} className="mk-cu__row">
            {c.icon === 'ok' ? <span className="mk-check" /> : c.icon === 'warn' ? <span className="mk-warn-ic" /> : <span className="mk-cross" />}
            <span className="mk-cu__name">{c.name}</span>
            <span className={`mk-cu__status mk-cu__status--${c.status}`}>{c.statusText}</span>
            {c.fix ? <span className="mk-cu__fix">Fix</span> : <span style={{ width: 28 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- H3 Health Tile Grid ---------- */
function PreviewTileGrid() {
  return (
    <div className="mk mk--htilegrid">
      <div className="mk-htg__tile" style={{ borderTop: '2px solid var(--wp-success, #3ddc97)' }}>
        <div className="mk-htg__tile-head">
          <span className="mk-htg__tile-title">DNS</span>
          <span className="mk-check" />
        </div>
        <div className="mk-htg__dns-rows">
          <div className="mk-htg__dns-row">
            <span className="mk-dot mk-dot--ok" />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
          <div className="mk-htg__dns-row">
            <span className="mk-dot mk-dot--ok" />
            <span className="mk-pill" style={{ width: '45%' }} />
          </div>
          <div className="mk-htg__dns-row">
            <span className="mk-dot mk-dot--warn" />
            <span className="mk-pill" style={{ width: '55%' }} />
          </div>
        </div>
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-htg__tile" style={{ borderTop: '2px solid var(--wp-accent)' }}>
        <div className="mk-htg__tile-head">
          <span className="mk-htg__tile-title">WARMTH</span>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <span className="mk-htg__gauge" />
        </div>
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-htg__tile" style={{ borderTop: '2px solid var(--wp-success, #3ddc97)' }}>
        <div className="mk-htg__tile-head">
          <span className="mk-htg__tile-title">AUTH</span>
          <span className="mk-check" />
        </div>
        <div className="mk-htg__provider-logos">
          <span className="mk-htg__provider-logo" />
          <span className="mk-htg__provider-logo" />
        </div>
        <span className="mk-pill" style={{ width: '60%' }} />
      </div>
      <div className="mk-htg__tile" style={{ borderTop: '2px solid var(--wp-warning, #ffb454)' }}>
        <div className="mk-htg__tile-head">
          <span className="mk-htg__tile-title">DOMAIN</span>
          <span className="mk-warn-ic" />
        </div>
        <span className="mk-pill mk-pill--accent" style={{ width: '70%', height: 9 }} />
        <span className="mk-pill" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

/* ---------- H4 Status Page ---------- */
function PreviewStatus() {
  // Each subsystem has a 30-day bars history (most ok, occasional warn).
  const systems: Array<{ name: string; bars: Array<'ok' | 'warn'> }> = [
    {
      name: 'SPF',
      bars: Array.from({ length: 30 }, () => 'ok'),
    },
    {
      name: 'DKIM',
      bars: Array.from({ length: 30 }, () => 'ok'),
    },
    {
      name: 'DMARC',
      bars: Array.from({ length: 30 }, (_, i) => (i > 25 ? 'warn' : 'ok')),
    },
    {
      name: 'Warmth',
      bars: Array.from({ length: 30 }, (_, i) => (i === 12 ? 'warn' : 'ok')),
    },
  ];
  return (
    <div className="mk mk--status">
      <div className="mk-st__hero">
        <span className="mk-st__pulse" />
        <div className="mk-st__hero-text">
          <span className="mk-st__operational">ALL SYSTEMS OPERATIONAL</span>
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
      </div>
      <div className="mk-st__list">
        {systems.map((s) => (
          <div key={s.name} className="mk-st__sys">
            <span className="mk-st__sys-name">{s.name}</span>
            <div className="mk-st__bars">
              {s.bars.map((status, i) => (
                <span key={i} className={status === 'warn' ? 'warn' : ''} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mk-st__incident">
        <span className="mk-dot mk-dot--warn" />
        <span className="mk-pill" style={{ width: '65%' }} />
      </div>
    </div>
  );
}
