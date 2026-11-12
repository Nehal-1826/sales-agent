import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, LayoutDashboard, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-dashboard-designs.css';

/**
 * /client-design-preview/dashboards/starter — picker for the STARTER plan's
 * Dashboard, round 2. Four fresh directions distinct from round 1 (Focus
 * Card / Journey Path / Magazine / Vertical Story).
 *
 *   S5 — Health Companion  Mailbox as digital pet — avatar + health bar.
 *   S6 — Newspaper Almanac Front-page newspaper layout. Typography-heavy.
 *   S7 — Spotlight         ONE giant metric, supporting context tiny.
 *   S8 — Calendar Heatmap  29-day grid (GitHub-style) + side panel.
 */

type DesignCode = 'S5' | 'S6' | 'S7' | 'S8';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientDashboardDesigns() {
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
        <span className="cdp__brand">WarmPulse · Starter dashboard designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <LayoutDashboard size={11} strokeWidth={2.4} />
            Section 1 · Dashboard · Starter tier
          </span>
          <span className="cdp__round-pill">Round 2</span>
          <h1 className="cdp__title">
            Four <em>fresh directions</em>
          </h1>
          <p className="cdp__sub">
            Round 1 stayed close to the existing dashboard shape (gauge + chart + stats). These
            four take Starter's one-mailbox reality somewhere completely different — a digital
            pet, a daily newspaper, a single huge number, or a calendar heatmap.
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
              Tell me your pick (e.g. <strong>"use S7"</strong>) or ask for more directions and
              I'll do a round 3. Once Starter is picked, we move to the Pro design picker.
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
    code: 'S5',
    name: 'Health Companion',
    tagline:
      'Treats the mailbox like a digital pet. Big friendly avatar, health bar, mood cards. Playful, gamified, perfect for first-time warmup users learning the ropes.',
    bullets: [
      'Avatar with mood (cheerful / sleepy / worried)',
      'Animated health bar for warmth',
      'Mood cards: active streak, daily check-in',
      "Coach tip ribbon at the bottom",
    ],
    Preview: PreviewCompanion,
  },
  {
    code: 'S6',
    name: 'Newspaper Almanac',
    tagline:
      'Front-page newspaper layout. Date masthead at top, lead "warmth report" headline with huge number, three columns of sub-stories below. Typography-heavy, editorial.',
    bullets: [
      'Masthead with date + paper-of-record title',
      "Lead story: today's warmth score in 64pt mono",
      'Three sub-stories: DNS · Activity · Tip',
      'Serif/mono mix for editorial feel',
    ],
    Preview: PreviewPaper,
  },
  {
    code: 'S7',
    name: 'Spotlight',
    tagline:
      'ONE massive warmth number takes 60% of the view. Everything else is small supporting context. Like a fitness app today-screen — single thing matters.',
    bullets: [
      'Warmth % shown at 64pt mono, centered',
      "Delta pill below ('+4.2 · 24h')",
      '4-cell stat strip (sends/opens/replies/day-in-ramp)',
      'Quick-action chips at the very bottom',
    ],
    Preview: PreviewSpotlight,
  },
  {
    code: 'S8',
    name: 'Calendar Heatmap',
    tagline:
      'GitHub-contribution-graph style. 29-day grid showing each warmup day as a color-intensity cell. Side panel with today\'s mailbox info + activity feed. Explorable.',
    bullets: [
      '7×5 calendar grid (29-day warmup window)',
      'Color intensity = warmth score that day',
      'Side panel: today\'s mailbox status',
      'Activity feed beneath the side panel',
    ],
    Preview: PreviewCalendar,
  },
];

/* ---------- S5 Health Companion ---------- */
function PreviewCompanion() {
  return (
    <div className="mk mk--companion">
      <div className="mk-cmp__avatar" />
      <div className="mk-cmp__status">
        <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
        <span className="mk-cmp__health-bar" />
        <span className="mk-pill" style={{ width: '50%' }} />
      </div>
      <div className="mk-cmp__mood">
        <div className="mk-cmp__mood-cell">
          <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
          <span className="mk-pill" style={{ width: '80%' }} />
        </div>
        <div className="mk-cmp__mood-cell">
          <span className="mk-pill mk-pill--success" style={{ width: '60%' }} />
          <span className="mk-pill" style={{ width: '80%' }} />
        </div>
      </div>
      <div className="mk-cmp__tips">
        <span className="mk-cmp__sparkle" />
        <span className="mk-pill" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

/* ---------- S6 Newspaper Almanac ---------- */
function PreviewPaper() {
  return (
    <div className="mk mk--paper">
      <div className="mk-pp__masthead">
        <span className="mk-pp__masthead-title">The Warmpulse Daily</span>
        <span className="mk-pp__masthead-date">Vol I · Day 14</span>
      </div>
      <div className="mk-pp__lead">
        <div className="mk-pp__lead-headline">
          <span className="mk-pill" style={{ width: '85%', height: 9 }} />
          <span className="mk-pill" style={{ width: '60%' }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <span className="mk-pp__lead-num">88</span>
      </div>
      <div className="mk-pp__columns">
        <div className="mk-pp__col">
          <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '80%' }} />
        </div>
        <div className="mk-pp__col">
          <span className="mk-pill mk-pill--success" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <div className="mk-pp__col">
          <span className="mk-pill mk-pill--warn" style={{ width: '70%' }} />
          <span className="mk-pill" style={{ width: '95%' }} />
          <span className="mk-pill" style={{ width: '85%' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- S7 Spotlight ---------- */
function PreviewSpotlight() {
  return (
    <div className="mk mk--spotlight">
      <div className="mk-sp__hero">
        <span className="mk-sp__label">Warmth · 24h</span>
        <span className="mk-sp__num">88</span>
        <span className="mk-sp__delta">
          <span className="mk-sp__delta-pill">▲ 4.2</span>
        </span>
      </div>
      <div className="mk-sp__stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mk-sp__stat">
            <span className="mk-pill mk-pill--accent" style={{ width: '55%' }} />
            <span className="mk-pill" style={{ width: '75%' }} />
          </div>
        ))}
      </div>
      <div className="mk-sp__actions">
        <span className="mk-sp__chip" />
        <span className="mk-sp__chip mk-sp__chip--primary" />
        <span className="mk-sp__chip" />
      </div>
    </div>
  );
}

/* ---------- S8 Calendar Heatmap ---------- */
function PreviewCalendar() {
  // 29-day warmup window. Roughly increasing intensity to read like
  // "warmth grew over the ramp" — last cells l3/l4.
  const days = [
    1, 1, 1, 1, 1, 1, 1,
    1, 2, 2, 2, 2, 2, 2,
    2, 2, 3, 3, 3, 3, 3,
    3, 3, 3, 4, 4, 4, 4,
    4, 0, 0, 0, 0, 0, 0,
  ];
  return (
    <div className="mk mk--calendar">
      <div className="mk-cal__grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="mk-cal__day-head">
            {d}
          </span>
        ))}
        {days.map((level, i) => (
          <span
            key={i}
            className={`mk-cal__cell ${level > 0 ? `mk-cal__cell--l${level}` : ''}`}
          />
        ))}
      </div>
      <div className="mk-cal__side">
        <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
        <span className="mk-pill" style={{ width: '40%' }} />
        <span className="mk-pill" style={{ width: '85%' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-dot mk-dot--ok" />
          <span className="mk-dot mk-dot--warn" />
        </div>
      </div>
      <div className="mk-cal__feed">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span className="mk-dot mk-dot--accent" />
            <span
              className="mk-pill"
              style={{ width: `${55 + (i * 11) % 30}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
