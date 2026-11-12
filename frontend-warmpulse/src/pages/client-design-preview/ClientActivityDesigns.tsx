import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, Check, Sparkles } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-activity-designs.css';

/**
 * /client-design-preview/activity/starter — picker for the STARTER plan's
 * Warmup Activity section.
 *
 *   A1 — Live Stream         Slack/Twitter-style chronological feed, "LIVE" pulse
 *   A2 — Day Buckets         Gmail-style date-grouped collapsible sections
 *   A3 — Chart + Drilldown   Stacked area chart on top, click-to-filter list below
 *   A4 — Conversation Thread Events grouped by warmup conversation, expandable
 */

type DesignCode = 'A1' | 'A2' | 'A3' | 'A4';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientActivityDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/activity" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter activity designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Activity size={11} strokeWidth={2.4} />
            Section 3 · Warmup Activity · Starter tier
          </span>
          <h1 className="cdp__title">
            Pick the <em>activity view</em>
          </h1>
          <p className="cdp__sub">
            Starter sends ~50 emails/day from one mailbox — modest volume, but each event
            matters. Four directions for how the warmup activity feed can feel.
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
              Tell me your pick (e.g. <strong>"use A3"</strong>) and we move to
              Section 4: Analytics.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'A1',
    name: 'Live Stream',
    tagline:
      'Slack/Twitter-style chronological feed with a pulsing LIVE indicator. Newest at top, compact rows: time · action pill · peer · short text. Real-time feel.',
    bullets: [
      'Animated LIVE pill at the top',
      'Filter strip below (mailbox · action · date)',
      'Compact rows with action-type pills',
      'Auto-scroll on new events',
    ],
    Preview: PreviewStream,
  },
  {
    code: 'A2',
    name: 'Day Buckets',
    tagline:
      'Gmail-inbox style. Events grouped by day — Today, Yesterday, dates older than that. Each section collapsible. Day header shows event count + dominant action mix.',
    bullets: [
      'Day-grouped collapsible sections',
      'Section header: date · count · action mix',
      'Inside: event rows with action pill',
      'Calm, organized, easy to scan',
    ],
    Preview: PreviewBuckets,
  },
  {
    code: 'A3',
    name: 'Chart + Drilldown',
    tagline:
      'Visual-first. Stacked area chart on top shows daily activity by action type. Click a day to filter the events list below. Best when you want overview + detail in one view.',
    bullets: [
      'Stacked area chart (sends · opens · replies)',
      'Click a column to filter events below',
      'Selected-date strip between chart and list',
      'List shows filtered events for that day',
    ],
    Preview: PreviewChart,
  },
  {
    code: 'A4',
    name: 'Conversation Threads',
    tagline:
      'Each warmup conversation is a thread card showing peer email, message count, last activity, outcome. Expand a thread to see the full back-and-forth. Like Gmail conversation view.',
    bullets: [
      'Filter strip at top (status · peer)',
      'Each thread = one expandable card',
      'Card head: avatar · peer · count · outcome',
      'Expand to see full thread inline',
    ],
    Preview: PreviewThreads,
  },
];

/* ---------- A1 Live Stream ---------- */
function PreviewStream() {
  const rows = [
    { time: '14:22', action: 'reply', tone: 'reply', w: 70 },
    { time: '14:18', action: 'open', tone: 'open', w: 60 },
    { time: '14:11', action: 'sent', tone: 'send', w: 75 },
    { time: '14:02', action: 'star', tone: 'star', w: 55 },
    { time: '13:55', action: 'open', tone: 'open', w: 65 },
    { time: '13:41', action: 'sent', tone: 'send', w: 70 },
    { time: '13:30', action: 'open', tone: 'open', w: 60 },
  ];
  return (
    <div className="mk mk--stream">
      <span className="mk-stream__live">LIVE</span>
      <div className="mk-filters">
        <span className="active" style={{ width: '20%' }} />
        <span style={{ width: '18%' }} />
        <span style={{ width: '15%' }} />
        <span style={{ width: '12%' }} />
      </div>
      <div className="mk-stream__feed">
        {rows.map((r, i) => (
          <div key={i} className="mk-stream__row">
            <span className="mk-stream__time">{r.time}</span>
            <span className={`mk-action mk-action--${r.tone}`}>{r.action}</span>
            <span className="mk-pill" style={{ width: `${r.w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- A2 Day Buckets ---------- */
function PreviewBuckets() {
  return (
    <div className="mk mk--buckets">
      <div className="mk-filters">
        <span className="active" style={{ width: '22%' }} />
        <span style={{ width: '18%' }} />
        <span style={{ width: '15%' }} />
      </div>
      <div className="mk-buckets__list">
        <div className="mk-buckets__day">
          <div className="mk-buckets__day-head">
            <span className="mk-buckets__day-label">Today</span>
            <span style={{ flex: 1 }} />
            <span className="mk-buckets__day-count">14 events</span>
            <span className="mk-dot mk-dot--accent" />
            <span className="mk-dot mk-dot--ok" />
            <span className="mk-dot mk-dot--warn" />
          </div>
          <div className="mk-buckets__rows">
            {['send', 'open', 'reply', 'open'].map((tone, i) => (
              <div key={i} className="mk-buckets__row">
                <span className={`mk-action mk-action--${tone}`}>{tone}</span>
                <span className="mk-pill" style={{ width: `${55 + (i * 9) % 30}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="mk-buckets__day">
          <div className="mk-buckets__day-head">
            <span className="mk-buckets__day-label">Yesterday</span>
            <span style={{ flex: 1 }} />
            <span className="mk-buckets__day-count">22 events</span>
            <span className="mk-dot mk-dot--accent" />
            <span className="mk-dot mk-dot--ok" />
          </div>
          <div className="mk-buckets__rows">
            {['send', 'open', 'star'].map((tone, i) => (
              <div key={i} className="mk-buckets__row">
                <span className={`mk-action mk-action--${tone}`}>{tone}</span>
                <span className="mk-pill" style={{ width: `${55 + (i * 7) % 30}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- A3 Chart + Drilldown ---------- */
function PreviewChart() {
  return (
    <div className="mk mk--chart">
      <div className="mk-chart__top">
        <div className="mk-chart__area" />
        <span className="mk-chart__selected" />
      </div>
      <div className="mk-chart__date-bar">Wed 22 May · 14 events</div>
      <div className="mk-chart__list">
        {['send', 'open', 'reply', 'open', 'send'].map((tone, i) => (
          <div key={i} className="mk-chart__row">
            <span className={`mk-action mk-action--${tone}`}>{tone}</span>
            <span className="mk-pill" style={{ width: `${55 + (i * 11) % 35}%` }} />
            <span style={{ flex: 1 }} />
            <span className="mk-pill" style={{ width: '12%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- A4 Conversation Threads ---------- */
function PreviewThreads() {
  return (
    <div className="mk mk--threads">
      <div className="mk-threads__head">
        <span className="active" style={{ width: '22%' }} />
        <span style={{ width: '18%' }} />
        <span style={{ width: '15%' }} />
      </div>
      <div className="mk-threads__list">
        <div className="mk-thread mk-thread--expanded">
          <span className="mk-thread__avatar" />
          <div className="mk-thread__id">
            <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
            <span className="mk-pill" style={{ width: '50%' }} />
          </div>
          <span className="mk-thread__count">5 msg</span>
          <span className="mk-thread__outcome mk-thread__outcome--win">replied</span>
        </div>
        <div className="mk-thread">
          <span className="mk-thread__avatar" />
          <div className="mk-thread__id">
            <span className="mk-pill mk-pill--accent" style={{ width: '60%' }} />
            <span className="mk-pill" style={{ width: '40%' }} />
          </div>
          <span className="mk-thread__count">3 msg</span>
          <span className="mk-dot mk-dot--ok" />
        </div>
        <div className="mk-thread">
          <span className="mk-thread__avatar" />
          <div className="mk-thread__id">
            <span className="mk-pill mk-pill--accent" style={{ width: '65%' }} />
            <span className="mk-pill" style={{ width: '45%' }} />
          </div>
          <span className="mk-thread__count">2 msg</span>
          <span className="mk-dot mk-dot--warn" />
        </div>
      </div>
    </div>
  );
}
