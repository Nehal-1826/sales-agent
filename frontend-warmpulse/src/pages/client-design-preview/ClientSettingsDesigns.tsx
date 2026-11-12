import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Settings, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-settings-designs.css';

/**
 * /client-design-preview/settings/starter — picker for STARTER Settings.
 *
 *   SE1 — Card Hub        6-card section grid, click to navigate
 *   SE2 — Sidebar + Panel macOS System Preferences aesthetic
 *   SE3 — Single Scroll   GitHub-settings style, all sections stacked
 *   SE4 — Search-First    Big search bar + jumpable section chips
 */

type DesignCode = 'SE1' | 'SE2' | 'SE3' | 'SE4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientSettingsDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/settings" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter settings designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Settings size={11} strokeWidth={2.4} />
            Section 10 · Settings · Starter tier · <strong style={{ color: '#facc15' }}>FINAL</strong>
          </span>
          <h1 className="cdp__title">
            Pick the <em>settings view</em>
          </h1>
          <p className="cdp__sub">
            Starter settings: Profile · Security · Notifications · Appearance · Org · Danger
            zone. API keys are locked (Pro+). Four directions for how the navigation +
            forms can feel.
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
              Tell me your pick (e.g. <strong>"use SE1"</strong>) and Starter is fully
              designed. Next we start the <strong>Pro</strong> tier — 10 sections, multi-mailbox
              reality, team features, alerts.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'SE1',
    name: 'Card Hub',
    tagline:
      "6-card grid of settings sections. Each card: icon · name · short description · arrow. Click to drill into that section. Familiar SaaS pattern (Notion, Linear, GitHub-account-settings).",
    bullets: [
      'Top-left card highlighted as Profile (featured)',
      '6 cards in 3×2 grid',
      'Locked cards (API keys, Pro) dimmed',
      'Most discoverable for new users',
    ],
    Preview: PreviewHub,
  },
  {
    code: 'SE2',
    name: 'Sidebar + Panel',
    tagline:
      'macOS System Preferences. Left rail with section list (active row highlighted), right pane with the selected section\'s form. Keyboard-navigable, power-user-friendly.',
    bullets: [
      'Left nav: 6 rows, one per section',
      'Active row highlighted with accent',
      'Right pane: avatar · fields · save',
      'Best for power users who know what they want',
    ],
    Preview: PreviewSidebar,
  },
  {
    code: 'SE3',
    name: 'Single Scroll',
    tagline:
      'GitHub-account-settings style. All sections stacked vertically on one long page. Each section has its header + form. No clicking around — just scroll to find.',
    bullets: [
      'All sections visible on one page',
      'Each section: header · field rows · toggle',
      'Top section gets accent-tinted highlight',
      'Best for "see everything at once" users',
    ],
    Preview: PreviewScroll,
  },
  {
    code: 'SE4',
    name: 'Search-First',
    tagline:
      "Big focused search bar at top + jumpable section chips below. Type to filter settings or jump to one directly. Power-user / command-palette aesthetic with ⌘K shortcut hint.",
    bullets: [
      'Hero: big search bar with ⌘K hint',
      'Live-suggestions list under the bar',
      "6-chip grid below for browsing",
      'Fastest if user knows what to find',
    ],
    Preview: PreviewSearch,
  },
];

/* ---------- SE1 Card Hub ---------- */
function PreviewHub() {
  const cards: Array<{ featured?: boolean; locked?: boolean }> = [
    { featured: true },
    {},
    {},
    {},
    {},
    { locked: true },
  ];
  return (
    <div className="mk mk--hub">
      {cards.map((c, i) => (
        <div
          key={i}
          className={`mk-hub__card ${c.featured ? 'mk-hub__card--featured' : ''} ${c.locked ? 'mk-hub__card--locked' : ''}`}
        >
          <div className="mk-hub__card-head">
            <span className="mk-icon mk-icon--lg" />
            {c.locked && <span className="mk-pro-pill">PRO</span>}
          </div>
          <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '90%' }} />
          <span className="mk-hub__arrow" />
        </div>
      ))}
    </div>
  );
}

/* ---------- SE2 Sidebar + Panel ---------- */
function PreviewSidebar() {
  return (
    <div className="mk mk--sidebar">
      <div className="mk-sb__list">
        <div className="mk-sb__row mk-sb__row--active">
          <span className="mk-icon" />
          <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
        </div>
        <div className="mk-sb__row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '50%' }} />
        </div>
        <div className="mk-sb__row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '65%' }} />
        </div>
        <div className="mk-sb__row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '55%' }} />
        </div>
        <div className="mk-sb__row" style={{ opacity: 0.55 }}>
          <span className="mk-icon" style={{ filter: 'grayscale(0.6)' }} />
          <span className="mk-pill" style={{ width: '45%' }} />
          <span className="mk-pro-pill" style={{ marginLeft: 'auto' }}>PRO</span>
        </div>
        <div className="mk-sb__row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '55%' }} />
        </div>
      </div>
      <div className="mk-sb__panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mk-sb__avatar" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '60%', height: 8 }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
        </div>
        <div className="mk-sb__field">
          <span className="mk-pill" style={{ width: '25%' }} />
          <span className="mk-sb__input" />
        </div>
        <div className="mk-sb__field">
          <span className="mk-pill" style={{ width: '20%' }} />
          <span className="mk-sb__input" />
        </div>
        <div className="mk-sb__field">
          <span className="mk-pill" style={{ width: '30%' }} />
          <span className="mk-sb__input" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
          <span
            style={{
              width: 60, height: 16, borderRadius: 999,
              background: 'color-mix(in srgb, var(--wp-accent) 35%, var(--wp-surface))',
              border: '1px solid color-mix(in srgb, var(--wp-accent) 55%, transparent)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- SE3 Single Scroll ---------- */
function PreviewScroll() {
  return (
    <div className="mk mk--scroll">
      <div className="mk-sc__section mk-sc__section--accent">
        <div className="mk-sc__head">
          <span className="mk-icon" />
          <span className="mk-pill mk-pill--accent" style={{ width: '20%', height: 8 }} />
        </div>
        <div className="mk-sc__row">
          <span className="mk-sc__label">Name</span>
          <span className="mk-sc__input" />
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 25%, transparent)' }} />
        </div>
        <div className="mk-sc__row">
          <span className="mk-sc__label">Email</span>
          <span className="mk-sc__input" />
          <span style={{ width: 8, height: 8, borderRadius: 2, background: 'color-mix(in srgb, var(--wp-text) 25%, transparent)' }} />
        </div>
      </div>
      <div className="mk-sc__section">
        <div className="mk-sc__head">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '25%', height: 8 }} />
        </div>
        <div className="mk-sc__row">
          <span className="mk-sc__label">2FA</span>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-sc__toggle" />
        </div>
      </div>
      <div className="mk-sc__section">
        <div className="mk-sc__head">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '30%', height: 8 }} />
        </div>
        <div className="mk-sc__row">
          <span className="mk-sc__label">Digest</span>
          <span className="mk-pill" style={{ width: '70%' }} />
          <span className="mk-sc__toggle" />
        </div>
      </div>
    </div>
  );
}

/* ---------- SE4 Search-First ---------- */
function PreviewSearch() {
  return (
    <div className="mk mk--search">
      <div className="mk-sr__bar">
        <span className="mk-sr__bar-icon" />
        <span className="mk-sr__bar-q" />
        <span className="mk-sr__kbd">⌘K</span>
      </div>
      <div className="mk-sr__suggest">
        <div className="mk-sr__suggest-row mk-sr__suggest-row--active">
          <span className="mk-icon" />
          <span className="mk-pill mk-pill--accent" style={{ width: '40%' }} />
          <span className="mk-sr__suggest-path">Settings › Profile</span>
        </div>
        <div className="mk-sr__suggest-row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '45%' }} />
          <span className="mk-sr__suggest-path">Settings › Security</span>
        </div>
        <div className="mk-sr__suggest-row">
          <span className="mk-icon" />
          <span className="mk-pill" style={{ width: '35%' }} />
          <span className="mk-sr__suggest-path">Settings › Notifications</span>
        </div>
      </div>
      <div className="mk-sr__grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mk-sr__chip">
            <span className="mk-icon" />
            <span className="mk-pill" style={{ width: '60%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
