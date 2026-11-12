import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-dashboard-designs.css'; // re-use the picker chrome
import './pro-design-picker.css';

/**
 * /client-design-preview/pro — Pro tier design picker.
 *
 * Unlike the Starter pickers (one design per section), this picker chooses
 * a complete visual language that will be applied across all 10 Pro sections.
 *
 * Six distinct directions:
 *   P1 — Command Center      Bloomberg/Linear-palette terminal density
 *   P2 — Glass Studio        Spotify Premium frosted-glass premium feel
 *   P3 — Grid Ops            Datadog/Grafana modular panel grid
 *   P4 — Editorial Magazine  Stripe Atlas magazine-spread refinement
 *   P5 — Neon Synthwave      Cyberpunk hot-pink + electric-cyan
 *   P6 — Bento Layout        Linear/Raycast asymmetric bento cards
 */

type DesignCode = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ProDesignPicker() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/dashboard" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Pro tier design picker</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Crown size={11} strokeWidth={2.4} />
            Pro tier · choose ONE direction for ALL 10 sections
          </span>
          <h1 className="cdp__title">
            Pick the <em>Pro design language</em>
          </h1>
          <p className="cdp__sub">
            Each direction is a complete visual system that will be applied across
            every Pro section — Dashboard, Mailboxes, Activity, Analytics,
            Reputation, Tools, Reports, Workspace, Billing, Settings.
            <br />
            Pro has 5 mailboxes, team members, and higher daily caps — the
            design has to handle more density than Starter without feeling cluttered.
          </p>
          <div className="cdp__plan-strip">
            <span className="cdp__plan-chip">
              <span className="cdp__plan-chip-dot" style={{ background: '#f472b6' }} />
              Starter · Solo · DONE
            </span>
            <span className="cdp__plan-chip cdp__plan-chip--active">
              <span
                className="cdp__plan-chip-dot"
                style={{ background: 'var(--wp-accent, #F26522)' }}
              />
              Pro · Team · CHOOSING NOW
            </span>
            <span className="cdp__plan-chip">
              <span className="cdp__plan-chip-dot" style={{ background: '#facc15' }} />
              Agency · Multi-tenant
            </span>
          </div>
        </section>

        <div className="cdp__grid pro-grid">
          {VARIANTS.map((v) => (
            <button
              key={v.code}
              type="button"
              className={`cdp-tile pro-tile ${picked === v.code ? 'cdp-tile--selected' : ''}`}
              onClick={() => setPicked(v.code)}
            >
              {picked === v.code && (
                <span className="cdp-tile__check">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              <div className="cdp-tile__preview pro-tile__preview">
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

        <section className="cdp__cta">
          <p>
            {picked
              ? <>You picked <strong>{picked}</strong>. Tell me your pick (e.g. <strong>"use {picked}"</strong>) and I'll start building all 10 Pro sections in that style.</>
              : <>Click a tile to preview your selection, then tell me your pick (e.g. <strong>"use P3"</strong>) and we'll build all 10 Pro sections in that direction.</>}
          </p>
        </section>
      </main>
    </div>
  );
}

/* ============================================================================
   Variants
============================================================================ */
const VARIANTS: Variant[] = [
  {
    code: 'P1',
    name: 'Command Center',
    tagline:
      'Bloomberg-terminal density. Pure black, monospace numerics, amber accents, top status ticker, Cmd-K command palette. For SDR managers who live in the dashboard.',
    bullets: [
      'Top status ticker — 5 mailboxes always visible',
      'Monospace data, tight tables, inline sparklines',
      'Cmd-K palette replaces nav menu',
      'Live tick + flash-on-change for every number',
    ],
    Preview: PreviewCommand,
  },
  {
    code: 'P2',
    name: 'Glass Studio',
    tagline:
      'Spotify Premium aesthetic. Frosted-glass panels, magenta→cyan gradients, big hero artwork per section, 56px display typography. Looks like a paid product.',
    bullets: [
      'Frosted-glass cards over animated gradient',
      'Album-tile horizontal scroll for mailboxes',
      'Big play/pause-style action buttons',
      'Section-hero artwork (provider logo on gradient)',
    ],
    Preview: PreviewGlass,
  },
  {
    code: 'P3',
    name: 'Grid Ops',
    tagline:
      'Datadog/Grafana modular dashboard. Customizable panel grid, dense data, drag-to-rearrange feel. Every panel its own micro-chart. Ops-heavy and functional.',
    bullets: [
      'Modular drag-friendly panel grid',
      'Cyan / pink / yellow tagged data series',
      'Live mini-charts in every panel',
      'Status traffic-light icons across the top',
    ],
    Preview: PreviewGridOps,
  },
  {
    code: 'P4',
    name: 'Editorial Magazine',
    tagline:
      'Stripe Atlas/Linear changelog refinement. Magazine-spread layouts, narrative copy alongside data, big typography, branded section dividers. Polished and brand-forward.',
    bullets: [
      'Magazine-spread two-column flows',
      'Drop-cap intros + pull-quote insights',
      'Heavy use of Outfit-display + IBM Plex Serif',
      'Section dividers as visual artwork',
    ],
    Preview: PreviewMagazine,
  },
  {
    code: 'P5',
    name: 'Neon Synthwave',
    tagline:
      'Cyberpunk hacker aesthetic. Neon hot-pink + electric-cyan + acid-green glows on black. Animated scanlines, retro-future grid background. Distinctive and bold.',
    bullets: [
      'Hot-pink + cyan + green neon outlines',
      'Retro-grid background with motion',
      'CRT scanlines + glow shadows on cards',
      'Pulsing accents on every active state',
    ],
    Preview: PreviewSynthwave,
  },
  {
    code: 'P6',
    name: 'Bento Layout',
    tagline:
      'Linear/Raycast asymmetric bento cards. Mixed-size rounded cards in a clever grid. Deliberate negative space. Each card has its own role. Modern and discoverable.',
    bullets: [
      'Asymmetric bento grid — cards of different sizes',
      'Each card has a distinct role/tone',
      'Generous corner rounding + negative space',
      'Mobile-first feature-page polish',
    ],
    Preview: PreviewBento,
  },
];

/* ============================================================================
   P1 — Command Center preview
============================================================================ */
function PreviewCommand() {
  return (
    <div className="prv prv--cmd">
      <div className="prv-cmd__ticker">
        {['SDR-01', 'OPS', 'GRO', 'BIZ', 'INF'].map((m, i) => (
          <span key={i} className="prv-cmd__tick">
            <span className={`prv-cmd__dot prv-cmd__dot--${i < 3 ? 'ok' : i === 3 ? 'warn' : 'err'}`} />
            <span className="prv-cmd__tick-name">{m}</span>
            <span className="prv-cmd__tick-num">{80 - i * 4}</span>
          </span>
        ))}
      </div>
      <div className="prv-cmd__cmdk">
        <span className="prv-cmd__caret">›</span>
        <span className="prv-cmd__cmdk-text">switch mailbox</span>
        <span className="prv-cmd__kbd">⌘K</span>
      </div>
      <div className="prv-cmd__table">
        {['warmup.send', 'imap.poll', 'dns.check', 'spam.scan'].map((row, i) => (
          <div key={row} className="prv-cmd__row">
            <span className="prv-cmd__col-time">14:2{i}</span>
            <span className="prv-cmd__col-cmd">{row}</span>
            <span className="prv-cmd__col-num">{[847, 12, 3, 1.4][i]}</span>
            <span className={`prv-cmd__col-status prv-cmd__col-status--${i === 3 ? 'warn' : 'ok'}`}>
              {i === 3 ? 'WATCH' : 'OK'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   P2 — Glass Studio preview
============================================================================ */
function PreviewGlass() {
  return (
    <div className="prv prv--glass">
      <div className="prv-glass__atmosphere" />
      <div className="prv-glass__hero">
        <div className="prv-glass__hero-art" />
        <div className="prv-glass__hero-text">
          <span className="prv-glass__pill">NOW WARMING</span>
          <div className="prv-glass__hero-num">94</div>
          <span className="prv-glass__hero-sub">warmth · 5 mailboxes</span>
        </div>
      </div>
      <div className="prv-glass__row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`prv-glass__chip prv-glass__chip--${i}`} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   P3 — Grid Ops preview
============================================================================ */
function PreviewGridOps() {
  return (
    <div className="prv prv--ops">
      <div className="prv-ops__top">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`prv-ops__led prv-ops__led--${i < 3 ? 'ok' : i === 3 ? 'warn' : 'err'}`} />
        ))}
        <span className="prv-ops__sysname">5 / 5 systems</span>
      </div>
      <div className="prv-ops__grid">
        <div className="prv-ops__panel">
          <span className="prv-ops__panel-title">SENDS</span>
          <div className="prv-ops__panel-bars">
            {[60, 80, 50, 70, 90, 65, 75].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} className="prv-ops__bar prv-ops__bar--cyan" />
            ))}
          </div>
        </div>
        <div className="prv-ops__panel">
          <span className="prv-ops__panel-title">OPENS</span>
          <div className="prv-ops__panel-area prv-ops__panel-area--pink" />
        </div>
        <div className="prv-ops__panel">
          <span className="prv-ops__panel-title">BOUNCE</span>
          <div className="prv-ops__panel-spark prv-ops__panel-spark--yellow" />
        </div>
        <div className="prv-ops__panel">
          <span className="prv-ops__panel-title">DOMAINS</span>
          <div className="prv-ops__panel-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={`prv-ops__cell prv-ops__cell--${(i * 3) % 4}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   P4 — Editorial Magazine preview
============================================================================ */
function PreviewMagazine() {
  return (
    <div className="prv prv--mag">
      <div className="prv-mag__masthead">
        <span className="prv-mag__masthead-no">№ 042</span>
        <span className="prv-mag__masthead-title">WARMPULSE</span>
        <span className="prv-mag__masthead-date">22 MAY</span>
      </div>
      <div className="prv-mag__divider" />
      <div className="prv-mag__cols">
        <div className="prv-mag__col">
          <span className="prv-mag__drop">A</span>
          <span className="prv-mag__line" style={{ width: '92%' }} />
          <span className="prv-mag__line" style={{ width: '88%' }} />
          <span className="prv-mag__line" style={{ width: '70%' }} />
          <span className="prv-mag__line" style={{ width: '85%' }} />
          <span className="prv-mag__line" style={{ width: '60%' }} />
        </div>
        <div className="prv-mag__col">
          <div className="prv-mag__quote">
            <span className="prv-mag__quote-mark">"</span>
            <span className="prv-mag__line" style={{ width: '90%' }} />
            <span className="prv-mag__line" style={{ width: '75%' }} />
          </div>
          <div className="prv-mag__stat">
            <span className="prv-mag__stat-num">94</span>
            <span className="prv-mag__stat-label">/ 100 WARMTH</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   P5 — Neon Synthwave preview
============================================================================ */
function PreviewSynthwave() {
  return (
    <div className="prv prv--neon">
      <div className="prv-neon__grid" aria-hidden />
      <div className="prv-neon__scanlines" aria-hidden />
      <div className="prv-neon__top">
        <span className="prv-neon__chip prv-neon__chip--pink">SDR.01</span>
        <span className="prv-neon__chip prv-neon__chip--cyan">ONLINE</span>
      </div>
      <div className="prv-neon__hero">
        <span className="prv-neon__hero-num">94</span>
        <span className="prv-neon__hero-label">WARMTH</span>
      </div>
      <div className="prv-neon__bars">
        {[40, 70, 50, 90, 60, 80, 65, 75, 55].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className={`prv-neon__bar prv-neon__bar--${i % 3 === 0 ? 'pink' : i % 3 === 1 ? 'cyan' : 'green'}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   P6 — Bento Layout preview
============================================================================ */
function PreviewBento() {
  return (
    <div className="prv prv--bento">
      <div className="prv-bento__a">
        <span className="prv-bento__a-num">94</span>
        <span className="prv-bento__a-lbl">WARMTH</span>
      </div>
      <div className="prv-bento__b">
        <span className="prv-bento__b-lbl">SENDS</span>
        <div className="prv-bento__b-bars">
          {[55, 70, 60, 85, 75, 90, 65].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} className="prv-bento__b-bar" />
          ))}
        </div>
      </div>
      <div className="prv-bento__c">
        <span className="prv-bento__c-dot" />
        <span className="prv-bento__c-lbl">5/5</span>
      </div>
      <div className="prv-bento__d">
        <span className="prv-bento__d-line" style={{ width: '70%' }} />
        <span className="prv-bento__d-line" style={{ width: '55%' }} />
        <span className="prv-bento__d-line" style={{ width: '40%' }} />
      </div>
      <div className="prv-bento__e">
        <span className="prv-bento__e-spark" />
      </div>
    </div>
  );
}

export default ProDesignPicker;
