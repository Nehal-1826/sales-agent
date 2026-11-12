import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, FileText, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-reports-designs.css';

/**
 * /client-design-preview/reports/starter — picker for STARTER Reports.
 *
 *   R1 — Library            File-browser style list of past reports
 *   R2 — Scheduled + Past   Two-tab layout: recurring jobs · ad-hoc outputs
 *   R3 — Template Cards     Generate-from-template cards on top, recent below
 *   R4 — Cover Strip        Magazine thumbnail strip of past reports + CTA cards
 */

type DesignCode = 'R1' | 'R2' | 'R3' | 'R4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientReportsDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/reports" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter reports designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <FileText size={11} strokeWidth={2.4} />
            Section 7 · Reports · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>reports view</em>
          </h1>
          <p className="cdp__sub">
            Starter exports basic CSV/PDF reports of warmup activity. No white-label, no
            custom branding (those are Agency). Four directions differ in whether the
            section feels like an archive, a generator, or a curated catalogue.
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
              Tell me your pick (e.g. <strong>"use R3"</strong>) and we move to Section 8:
              Workspace.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'R1',
    name: 'Library',
    tagline:
      'File-browser style. Top bar with "Generate" button + search/filter. Big sortable list below: file icon · name · date · size · format pill · download. Like Google Drive for reports.',
    bullets: [
      'Action bar: Generate · search · filter',
      'Column header (Name · Date · Size · Format)',
      'Rows with PDF/CSV file icons',
      'Download button per row',
    ],
    Preview: PreviewLibrary,
  },
  {
    code: 'R2',
    name: 'Scheduled + Past',
    tagline:
      'Two-tab layout. "Scheduled" shows recurring jobs (weekly summary on Mondays etc.) with toggles. "Past" shows ad-hoc generated reports. Separates ongoing automation from one-off exports.',
    bullets: [
      'Tab bar: Scheduled · Past',
      'Scheduled cards: cadence · next-run · toggle',
      'Past tab swaps to file list',
      '"+ New schedule" button at top right',
    ],
    Preview: PreviewTabs,
  },
  {
    code: 'R3',
    name: 'Template Cards',
    tagline:
      '4 template cards on top — Weekly summary · Monthly digest · DNS health · Custom. Click a template to generate. Recent reports listed below. Most opinionated about *what* to generate.',
    bullets: [
      'Heading + "Recent" link',
      '4 template cards in a row',
      'Featured card uses accent gradient',
      'Recent reports list at the bottom',
    ],
    Preview: PreviewTemplates,
  },
  {
    code: 'R4',
    name: 'Cover Strip',
    tagline:
      'Magazine-style. Horizontal strip of past report "covers" (each shows a preview of its first page). Generation CTAs as cards below. Visual, almost editorial.',
    bullets: [
      'Heading + filter chips',
      '4 report-cover thumbnails with mini charts',
      'CTA cards below ("Generate weekly" · "Generate ad-hoc")',
      'Most visual, share-friendly aesthetic',
    ],
    Preview: PreviewCovers,
  },
];

/* ---------- R1 Library ---------- */
function PreviewLibrary() {
  const rows = [
    { kind: 'pdf', date: '22 May', size: '184 kb', fmt: 'PDF' },
    { kind: 'csv', date: '15 May', size: '12 kb', fmt: 'CSV' },
    { kind: 'pdf', date: '08 May', size: '176 kb', fmt: 'PDF' },
    { kind: 'csv', date: '01 May', size: '11 kb', fmt: 'CSV' },
    { kind: 'pdf', date: '24 Apr', size: '162 kb', fmt: 'PDF' },
  ] as const;
  return (
    <div className="mk mk--library">
      <div className="mk-lib__bar">
        <span className="mk-lib__btn" />
        <span className="mk-lib__search" />
      </div>
      <div className="mk-lib__head">
        <span></span>
        <span>Name</span>
        <span>Date</span>
        <span>Size</span>
        <span></span>
      </div>
      <div className="mk-lib__list">
        {rows.map((r, i) => (
          <div key={i} className="mk-lib__row">
            <span className={`mk-file-icon mk-file-icon--${r.kind}`} />
            <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
            <span className="mk-lib__date">{r.date}</span>
            <span className="mk-lib__size">{r.size}</span>
            <span className="mk-lib__dl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- R2 Scheduled + Past ---------- */
function PreviewTabs() {
  return (
    <div className="mk mk--tabs">
      <div className="mk-tabs__bar">
        <span className="mk-tabs__tab mk-tabs__tab--active" />
        <span className="mk-tabs__tab" />
      </div>
      <div className="mk-tabs__action-row">
        <span className="mk-tabs__new-btn" />
      </div>
      <div className="mk-tabs__sched-list">
        <div className="mk-tabs__sched-card">
          <span className="mk-tabs__cadence">Weekly</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '70%' }} />
          </div>
          <span className="mk-tabs__next">Mon 26 May</span>
          <span className="mk-tabs__toggle" />
        </div>
        <div className="mk-tabs__sched-card">
          <span className="mk-tabs__cadence">Monthly</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '60%' }} />
          </div>
          <span className="mk-tabs__next">01 Jun</span>
          <span className="mk-tabs__toggle" />
        </div>
        <div className="mk-tabs__sched-card">
          <span className="mk-tabs__cadence">Daily</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
          <span className="mk-tabs__next" style={{ opacity: 0.5 }}>Paused</span>
          <span
            className="mk-tabs__toggle"
            style={{ background: 'color-mix(in srgb, var(--wp-text) 10%, transparent)' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- R3 Template Cards ---------- */
function PreviewTemplates() {
  return (
    <div className="mk mk--templates">
      <div className="mk-tpl__heading">
        <span className="mk-pill mk-pill--accent" style={{ width: '25%' }} />
        <span className="mk-pill" style={{ width: '10%' }} />
      </div>
      <div className="mk-tpl__cards">
        <div className="mk-tpl__card mk-tpl__card--featured">
          <span className="mk-tpl__card-icon" />
          <span className="mk-pill mk-pill--accent" style={{ width: '80%' }} />
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-tpl__card-btn" />
        </div>
        <div className="mk-tpl__card">
          <span className="mk-tpl__card-icon" />
          <span className="mk-pill" style={{ width: '80%' }} />
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-tpl__card-btn" />
        </div>
        <div className="mk-tpl__card">
          <span className="mk-tpl__card-icon" />
          <span className="mk-pill" style={{ width: '80%' }} />
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-tpl__card-btn" />
        </div>
        <div className="mk-tpl__card">
          <span className="mk-tpl__card-icon" />
          <span className="mk-pill" style={{ width: '80%' }} />
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-tpl__card-btn" />
        </div>
      </div>
      <div className="mk-tpl__recent">
        {(
          [
            { kind: 'pdf', date: '22 May', fmt: 'PDF' },
            { kind: 'csv', date: '15 May', fmt: 'CSV' },
            { kind: 'pdf', date: '08 May', fmt: 'PDF' },
          ] as const
        ).map((r, i) => (
          <div key={i} className="mk-tpl__recent-row">
            <span className={`mk-file-icon mk-file-icon--${r.kind}`} />
            <div className="mk-tpl__recent-meta">
              <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
              <span className="mk-tpl__recent-date">{r.date}</span>
            </div>
            <span className={`mk-fmt-pill mk-fmt-pill--${r.kind}`}>{r.fmt}</span>
            <span className="mk-tpl__dl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- R4 Cover Strip ---------- */
function PreviewCovers() {
  return (
    <div className="mk mk--covers">
      <div className="mk-cv__heading">
        <span className="mk-pill mk-pill--accent" style={{ width: '25%' }} />
        <span className="mk-pill" style={{ width: '15%' }} />
      </div>
      <div className="mk-cv__row">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mk-cv__cover">
            <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
            <span className="mk-cv__cover-line" />
            <div className="mk-cv__cover-bars">
              {[55, 70, 50, 80, 65, 75, 60].map((h, j) => (
                <span key={j} style={{ height: `${h - i * 3}%` }} />
              ))}
            </div>
            <span className="mk-pill" style={{ width: '60%' }} />
            <span className="mk-pill" style={{ width: '40%' }} />
            <div className="mk-cv__cover-foot">
              <span>{['22 May', '15 May', '08 May', '01 May'][i]}</span>
              <span style={{ flex: 1 }} />
              <span className={`mk-fmt-pill ${i % 2 ? 'mk-fmt-pill--csv' : 'mk-fmt-pill--pdf'}`}>
                {i % 2 ? 'CSV' : 'PDF'}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mk-cv__cta">
        <div className="mk-cv__cta-card">
          <span className="mk-cv__cta-icon" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
            <span className="mk-pill" style={{ width: '80%' }} />
          </div>
        </div>
        <div className="mk-cv__cta-card">
          <span className="mk-cv__cta-icon" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
            <span className="mk-pill" style={{ width: '80%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
