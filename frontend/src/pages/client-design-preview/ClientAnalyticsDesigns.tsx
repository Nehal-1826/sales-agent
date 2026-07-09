import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Check, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-analytics-designs.css';

/**
 * /client-design-preview/analytics/starter — picker for STARTER Analytics.
 *
 *   N1 — Hero Chart    One big chart on top, stats + secondary chart below
 *   N2 — Notebook      Each chart is a "note" with text explanation
 *   N3 — Tile Grid     2×2 grid of compact analytics tiles
 *   N4 — Report Print  Looks like an exportable PDF report
 */

type DesignCode = 'N1' | 'N2' | 'N3' | 'N4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientAnalyticsDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/analytics" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter analytics designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <BarChart3 size={11} strokeWidth={2.4} />
            Section 4 · Analytics · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>analytics view</em>
          </h1>
          <p className="cdp__sub">
            Starter is a one-mailbox plan with basic dashboard only — no placement testing,
            no blacklist scatter, no multi-mailbox comparison. Analytics should be focused,
            not overwhelming. Four directions for how the data can land.
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
              Tell me your pick (e.g. <strong>"use N1"</strong>) and we move to Section 5:
              Reputation & Health.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'N1',
    name: 'Hero Chart',
    tagline:
      'One big chart at the top (warmth over time) with a date-range chip in the corner. Stats row + secondary chart below. Single story, hero-driven.',
    bullets: [
      'Large warmth-trend area chart at top',
      'Date-range pill in the chart corner',
      '4-stat strip below',
      'Secondary chart (volume bars) at bottom',
    ],
    Preview: PreviewHero,
  },
  {
    code: 'N2',
    name: 'Notebook',
    tagline:
      'Notion-style. Each analysis is a "note" — a label, a chart on the right, and an explanation paragraph on the left. Stacked vertically. Educational, easy to share with a non-technical stakeholder.',
    bullets: [
      'Each chart paired with text explanation',
      'Left: label + explanation paragraph',
      'Right: chart visual',
      'Vertical stack of three notes',
    ],
    Preview: PreviewNotebook,
  },
  {
    code: 'N3',
    name: 'Tile Grid',
    tagline:
      '2×2 grid of compact analytics tiles — warmth, volume, placement, engagement — all visible at once. Filter bar across the top. Glance-friendly.',
    bullets: [
      'Filter bar at the top (mailbox · range)',
      '2×2 tile grid: 4 charts at equal weight',
      'Each tile has its own title + mini chart',
      'Glance-friendly, all visible at once',
    ],
    Preview: PreviewTileGrid,
  },
  {
    code: 'N4',
    name: 'Report Print',
    tagline:
      'Looks like a paginated PDF report. Masthead with logo + date range, section headers numbered, each section has a chart + summary text. Best for sharing or exporting.',
    bullets: [
      'Masthead: logo · date range · mailbox name',
      'Numbered sections (01 · 02 · 03)',
      'Each section: header + summary + chart',
      'Print-ready aesthetic',
    ],
    Preview: PreviewReport,
  },
];

/* ---------- N1 Hero Chart ---------- */
function PreviewHero() {
  return (
    <div className="mk mk--hero">
      <div className="mk-hero__chart">
        <div className="mk-hero__chart-header">
          <span className="mk-pill mk-pill--accent" style={{ width: '38%' }} />
          <span className="mk-hero__range">Last 30d</span>
        </div>
        <div className="mk-hero__area mk-area" />
      </div>
      <div className="mk-hero__stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mk-hero__stat">
            <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
        ))}
      </div>
      <div className="mk-hero__secondary">
        <span className="mk-pill mk-pill--accent" style={{ width: '30%' }} />
        <div className="mk-bars" style={{ flex: 1 }}>
          {[55, 70, 50, 80, 65, 45, 75, 60, 85, 50, 70, 55, 65, 75].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- N2 Notebook ---------- */
function PreviewNotebook() {
  return (
    <div className="mk mk--notebook">
      <div className="mk-note">
        <div className="mk-note__text">
          <span className="mk-note__label">Warmth · 30d</span>
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '85%' }} />
        </div>
        <div className="mk-note__chart">
          <div className="mk-note__chart-inner mk-area" />
        </div>
      </div>
      <div className="mk-note">
        <div className="mk-note__text">
          <span className="mk-note__label">Volume</span>
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '80%' }} />
        </div>
        <div className="mk-note__chart">
          <div className="mk-bars" style={{ height: '100%' }}>
            {[55, 70, 50, 80, 65, 75, 60].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="mk-note">
        <div className="mk-note__text">
          <span className="mk-note__label">Placement</span>
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <div className="mk-note__chart" style={{ display: 'grid', placeItems: 'center' }}>
          <span className="mk-donut" style={{ width: 32 }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- N3 Tile Grid ---------- */
function PreviewTileGrid() {
  return (
    <div className="mk mk--tilegrid">
      <div className="mk-tg__head">
        <span className="active" style={{ width: '20%' }} />
        <span style={{ width: '15%' }} />
        <span style={{ width: '12%' }} />
        <span style={{ flex: 1 }} />
        <span style={{ width: '18%' }} />
      </div>
      <div className="mk-tg__tile">
        <div className="mk-tg__tile-head">
          <span className="mk-pill mk-pill--accent" style={{ width: '45%' }} />
          <span className="mk-pill" style={{ width: '20%' }} />
        </div>
        <div className="mk-area" />
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-tg__tile">
        <div className="mk-tg__tile-head">
          <span className="mk-pill mk-pill--success" style={{ width: '45%' }} />
          <span className="mk-pill" style={{ width: '20%' }} />
        </div>
        <div className="mk-bars">
          {[55, 70, 50, 80, 65, 45, 75].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-tg__tile">
        <div className="mk-tg__tile-head">
          <span className="mk-pill mk-pill--warn" style={{ width: '45%' }} />
          <span className="mk-pill" style={{ width: '20%' }} />
        </div>
        <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
          <span className="mk-donut" style={{ width: '60%' }} />
        </div>
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-tg__tile">
        <div className="mk-tg__tile-head">
          <span className="mk-pill mk-pill--accent" style={{ width: '45%' }} />
          <span className="mk-pill" style={{ width: '20%' }} />
        </div>
        <div className="mk-area mk-area--success" />
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
    </div>
  );
}

/* ---------- N4 Report Print ---------- */
function PreviewReport() {
  return (
    <div className="mk mk--report">
      <div className="mk-rp__masthead">
        <div className="mk-rp__logo">
          <span className="mk-rp__logo-dot" />
          <span className="mk-pill mk-pill--accent" style={{ width: 36 }} />
        </div>
        <span className="mk-rp__date">22 May · Last 30d</span>
      </div>
      <div className="mk-rp__section">
        <div className="mk-rp__section-text">
          <div className="mk-rp__section-header">
            <span className="mk-rp__section-num">01</span>
            <span>WARMTH</span>
          </div>
          <span className="mk-pill" style={{ width: '90%' }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <div className="mk-rp__section-chart">
          <div className="mk-area" style={{ height: '100%' }} />
        </div>
      </div>
      <div className="mk-rp__section">
        <div className="mk-rp__section-text">
          <div className="mk-rp__section-header">
            <span className="mk-rp__section-num">02</span>
            <span>VOLUME</span>
          </div>
          <span className="mk-pill" style={{ width: '90%' }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <div className="mk-rp__section-chart">
          <div className="mk-bars" style={{ height: '100%' }}>
            {[55, 70, 50, 80, 65, 75, 60].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
