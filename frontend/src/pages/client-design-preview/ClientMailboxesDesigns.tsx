import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Inbox, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-mailboxes-designs.css';

/**
 * /client-design-preview/mailboxes/starter — picker for the STARTER plan's
 * Mailboxes section.
 *
 * Starter has exactly ONE mailbox (plan cap), so this section is a focused
 * detail / management view rather than a list. Four directions:
 *
 *   M1 — Single Detail Card  One big card with everything inside.
 *   M2 — Tabbed Inspector    Header + tab strip + swappable content area.
 *   M3 — Profile View        Profile-page hero + stacked section cards.
 *   M4 — Split Pane          Identity rail (left) + tabbed content (right).
 */

type DesignCode = 'M1' | 'M2' | 'M3' | 'M4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientMailboxesDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/mailboxes" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter mailboxes designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Inbox size={11} strokeWidth={2.4} />
            Section 2 · Mailboxes · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>Starter mailboxes view</em>
          </h1>
          <p className="cdp__sub">
            Starter caps at one mailbox, so this section isn't a list — it's a focused
            management view of that single inbox. Four directions for how that detail surface
            can feel.
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
              Tell me your pick (e.g. <strong>"use M1"</strong>) and I'll wire the chosen
              layout into <code>/app/mailboxes</code> for Starter, then we move to Section 3:
              Warmup Activity.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============================================================================
   Variant data + previews
============================================================================ */

const VARIANTS: Variant[] = [
  {
    code: 'M1',
    name: 'Single Detail Card',
    tagline:
      "Everything about the one mailbox lives in one large card — header with provider badge + status, 4 stats, DNS row, recent activity, action buttons. Feels deliberate for a single-mailbox plan.",
    bullets: [
      'Header: provider avatar + email + active pill',
      '4 stat cells (warmth · day-in-ramp · sends · opens)',
      'DNS health row (SPF · DKIM · DMARC)',
      'Inline activity feed + action buttons',
    ],
    Preview: PreviewDetail,
  },
  {
    code: 'M2',
    name: 'Tabbed Inspector',
    tagline:
      'Top identity strip, tab bar below (Overview · Schedule · DNS · Activity · Settings), content swaps within the same card. Compact, focused on one concern at a time.',
    bullets: [
      'Sticky identity header at top',
      '5-tab strip below the header',
      'Content area changes per tab',
      'Chart + cells inside Overview by default',
    ],
    Preview: PreviewInspector,
  },
  {
    code: 'M3',
    name: 'Profile View',
    tagline:
      'Profile-page style — big hero with provider avatar + email + warmth ring on the right, then four stacked section cards below (Schedule · DNS · Activity · Settings). Long-scroll narrative.',
    bullets: [
      'Hero with large provider avatar + warmth ring',
      'Stacked section cards below the hero',
      'Each section: label · summary · action',
      'Scrolls vertically, mobile-friendly',
    ],
    Preview: PreviewProfile,
  },
  {
    code: 'M4',
    name: 'Split Pane',
    tagline:
      "Inspector-style. Left rail (~40%) is the mailbox identity card with avatar, email, warmth ring, status badges, DNS dots. Right pane (~60%) is tabbed content. Like Outlook's reading pane.",
    bullets: [
      'Left rail with identity + status + DNS dots',
      'Right pane: tab bar + content area',
      'Default tab shows activity feed',
      'Best when you want side-by-side context',
    ],
    Preview: PreviewSplit,
  },
];

/* ---------- M1 Single Detail Card ---------- */
function PreviewDetail() {
  return (
    <div className="mk mk--detail">
      <div className="mk-detail__card">
        <div className="mk-detail__header">
          <span className="mk-avatar" />
          <div className="mk-detail__header-text">
            <span className="mk-pill mk-pill--accent" style={{ width: '60%', height: 9 }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
          <span className="mk-detail__status">
            <span className="mk-dot mk-dot--ok" />
            ACTIVE
          </span>
        </div>
        <div className="mk-detail__stats">
          <div className="mk-detail__stat">
            <span className="mk-pill mk-pill--accent" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
          <div className="mk-detail__stat">
            <span className="mk-pill mk-pill--success" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
          <div className="mk-detail__stat">
            <span className="mk-pill" style={{ width: '50%', background: 'color-mix(in srgb, var(--wp-accent) 55%, transparent)' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
          <div className="mk-detail__stat">
            <span className="mk-pill mk-pill--warn" style={{ width: '50%' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
        </div>
        <div className="mk-detail__dns">
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-pill" style={{ width: '14%' }} />
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-pill" style={{ width: '14%' }} />
          <span className="mk-dot mk-dot--warn" />
          <span className="mk-pill" style={{ width: '14%' }} />
          <span style={{ flex: 1 }} />
          <span className="mk-pill mk-pill--accent" style={{ width: '14%' }} />
        </div>
        <div className="mk-detail__feed">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span className="mk-dot mk-dot--accent" />
              <span
                className="mk-pill"
                style={{ width: `${55 + (i * 13) % 30}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mk-detail__actions">
          <span className="mk-detail__btn mk-detail__btn--primary" />
          <span className="mk-detail__btn" />
          <span className="mk-detail__btn mk-detail__btn--danger" />
        </div>
      </div>
    </div>
  );
}

/* ---------- M2 Tabbed Inspector ---------- */
function PreviewInspector() {
  return (
    <div className="mk mk--inspector">
      <div className="mk-ins__header">
        <span className="mk-avatar mk-avatar--lg" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="mk-pill mk-pill--accent" style={{ width: '50%', height: 9 }} />
          <span className="mk-pill" style={{ width: '35%' }} />
        </div>
        <span className="mk-dot mk-dot--ok" />
      </div>
      <div className="mk-ins__tabs">
        <span className="mk-ins__tab mk-ins__tab--active" />
        <span className="mk-ins__tab" />
        <span className="mk-ins__tab" />
        <span className="mk-ins__tab" />
        <span className="mk-ins__tab" />
      </div>
      <div className="mk-ins__content">
        <div className="mk-ins__cell mk-ins__cell--chart">
          <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
          <span className="mk-ins__chart-area" />
        </div>
        <div className="mk-ins__cell">
          <span className="mk-pill mk-pill--success" style={{ width: '55%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <div className="mk-ins__cell">
          <span className="mk-pill mk-pill--warn" style={{ width: '55%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- M3 Profile View ---------- */
function PreviewProfile() {
  return (
    <div className="mk mk--profile">
      <div className="mk-pr__hero">
        <span className="mk-avatar mk-avatar--xl" />
        <div className="mk-pr__identity">
          <span className="mk-pill mk-pill--accent" style={{ width: '65%', height: 9 }} />
          <span className="mk-pill" style={{ width: '45%' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <span className="mk-dot mk-dot--ok" />
            <span className="mk-pill" style={{ width: '20%' }} />
          </div>
        </div>
        <span className="mk-ring mk-ring--lg" />
      </div>
      <div className="mk-pr__section">
        <span className="mk-pr__section-label">Schedule</span>
        <div className="mk-pr__section-content">
          <span className="mk-pill mk-pill--accent" style={{ width: '55%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <span className="mk-dot mk-dot--accent" />
      </div>
      <div className="mk-pr__section">
        <span className="mk-pr__section-label">DNS</span>
        <div className="mk-pr__section-content">
          <span className="mk-pill mk-pill--success" style={{ width: '55%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <span className="mk-dot mk-dot--ok" />
      </div>
      <div className="mk-pr__section">
        <span className="mk-pr__section-label">Activity</span>
        <div className="mk-pr__section-content">
          <span className="mk-pill mk-pill--warn" style={{ width: '55%' }} />
          <span className="mk-pill" style={{ width: '75%' }} />
        </div>
        <span className="mk-dot mk-dot--warn" />
      </div>
    </div>
  );
}

/* ---------- M4 Split Pane ---------- */
function PreviewSplit() {
  return (
    <div className="mk mk--split">
      <div className="mk-sp__left">
        <span className="mk-avatar mk-avatar--xl" />
        <span className="mk-pill mk-pill--accent" style={{ width: '85%', height: 9 }} />
        <span className="mk-pill" style={{ width: '70%' }} />
        <span className="mk-ring" />
        <span className="mk-sp__left-divider" />
        <div className="mk-sp__left-row">
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-dot mk-dot--warn" />
        </div>
      </div>
      <div className="mk-sp__right">
        <div className="mk-sp__tabs">
          <span className="mk-sp__tab mk-sp__tab--active" />
          <span className="mk-sp__tab" />
          <span className="mk-sp__tab" />
          <span className="mk-sp__tab" />
        </div>
        <div className="mk-sp__content">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span className="mk-dot mk-dot--accent" />
              <span
                className="mk-pill"
                style={{ width: `${55 + (i * 9) % 35}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
