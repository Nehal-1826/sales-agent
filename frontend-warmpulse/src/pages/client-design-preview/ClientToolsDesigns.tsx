import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles, Wrench } from 'lucide-react';
import '@/pages/landing/hero-theme.css';
import './client-tools-designs.css';

/**
 * /client-design-preview/tools/starter — picker for STARTER Tools, round 2.
 *
 * Data-first variants. Each surfaces tool *results / history / metrics*,
 * not just buttons to launch tools.
 *
 *   T5 — Run History Stream   CI/CD-style log of past tool runs
 *   T6 — Insights Dashboard   Each tool's key metric as a dashboard card
 *   T7 — Comparison Table     Table: tool · last run · result · 7d trend
 *   T8 — Status Board         Big board showing every check's latest result
 */

type DesignCode = 'T5' | 'T6' | 'T7' | 'T8';

interface Variant {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  Preview: () => JSX.Element;
}

export function ClientToolsDesigns() {
  const [picked, setPicked] = useState<DesignCode | null>(null);

  return (
    <div className="cdp">
      <div className="cdp__atmosphere" aria-hidden>
        <div className="cdp__aurora-1" />
        <div className="cdp__aurora-2" />
      </div>

      <header className="cdp__topbar">
        <Link to="/app/tools" className="cdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="cdp__brand">WarmPulse · Starter tools designs</span>
      </header>

      <main className="cdp__main">
        <section className="cdp__hero">
          <span className="cdp__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            <Wrench size={11} strokeWidth={2.4} />
            Section 6 · Tools · Starter tier
          </span>
          <span className="cdp__round-pill">Round 2 · Data-first</span>
          <h1 className="cdp__title">
            Tools that <em>show their work</em>
          </h1>
          <p className="cdp__sub">
            Round 1 was four ways to show tool launchers. This round is the opposite — each
            variant leads with the data the tools have produced (run history, key metrics,
            trends, latest results) so the section earns its own page rather than just being
            a launch pad.
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
              Tell me your pick (e.g. <strong>"use T6"</strong>) and we move to Section 7:
              Reports. Round 1's T1–T4 are still in the picker history if you want to revisit.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

const VARIANTS: Variant[] = [
  {
    code: 'T5',
    name: 'Run History Stream',
    tagline:
      "CI/CD-style log of every tool run, newest first. Each row: time · tool · status pill · key result · re-run action. Like GitHub Actions runs view.",
    bullets: [
      'Chronological log of past runs',
      'Each row: time · tool · status · result',
      "Rolling 'last 24h' counter at top",
      'Click any row to re-run that tool',
    ],
    Preview: PreviewStream,
  },
  {
    code: 'T6',
    name: 'Insights Dashboard',
    tagline:
      "Each tool surfaces its KEY METRIC as a dashboard card — not just a launch button. Big DNS-pass-rate number, spam-score with sparkline, deliverability % with trend.",
    bullets: [
      'Hero card: deliverability % with sparkline',
      '4 smaller cards: DNS · Spam · Inbox · Auth',
      'Each card has its number prominent',
      'Tools become metrics you watch over time',
    ],
    Preview: PreviewInsights,
  },
  {
    code: 'T7',
    name: 'Comparison Table',
    tagline:
      "Spreadsheet-like data table — one row per tool, columns for tool · last run · status · 7-day trend sparkline · action button. Glance-friendly for power users.",
    bullets: [
      'Column header strip (tool · last · status · trend · action)',
      'Per-tool row with trend sparkline',
      'Sortable / filterable in production',
      'Best for users with many tool runs to compare',
    ],
    Preview: PreviewTable,
  },
  {
    code: 'T8',
    name: 'Status Board',
    tagline:
      "Big sysadmin-style board. Each tool's latest result rendered as a tile with the result up front — DNS 3/3, Spam 2.3/10, Inbox 87%, with mini sparkline. Glance everything at once.",
    bullets: [
      '6-cell grid (2 rows × 3 cells)',
      'Each cell: tool name · big number · mini trend',
      'Left border colored by status',
      "Like a NOC display, 'is everything green?' view",
    ],
    Preview: PreviewBoard,
  },
];

/* ---------- T5 Run History Stream ---------- */
function PreviewStream() {
  const rows = [
    { time: '14:22', tool: 'dns.check', status: 'ok', res: '3 records OK' },
    { time: '13:08', tool: 'preview', status: 'info', res: '2 templates' },
    { time: '11:55', tool: 'dns.check', status: 'warn', res: 'DMARC TTL warn' },
    { time: '09:14', tool: 'spam.scan', status: 'err', res: 'Locked · Pro' },
    { time: '08:32', tool: 'dns.check', status: 'ok', res: '3 records OK' },
    { time: '08:00', tool: 'preview', status: 'info', res: '2 templates' },
  ];
  return (
    <div className="mk mk--stream">
      <div className="mk-stream__head">
        <span className="mk-stream__title">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: 'var(--wp-success, #3ddc97)' }} />
          Tool runs · 24h
        </span>
        <span className="mk-stream__rolling">12 runs · 1 warn</span>
      </div>
      <div className="mk-stream__list">
        {rows.map((r, i) => (
          <div key={i} className="mk-stream__row">
            <span className="mk-stream__time">{r.time}</span>
            <span className={`mk-stat mk-stat--${r.status}`}>
              {r.status === 'ok' ? 'OK' : r.status === 'warn' ? 'WARN' : r.status === 'err' ? 'FAIL' : 'INFO'}
            </span>
            <span className="mk-stream__tool-name">{r.tool}</span>
            <span className="mk-pill" style={{ width: '90%' }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--wp-text) 25%, transparent)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- T6 Insights Dashboard ---------- */
function PreviewInsights() {
  return (
    <div className="mk mk--insights">
      <div className="mk-ins__head">
        <span className="mk-pill mk-pill--accent" style={{ width: '25%' }} />
        <span style={{ flex: 1 }} />
        <span className="mk-stat mk-stat--info">7D</span>
      </div>
      <div className="mk-ins__grid">
        <div className="mk-ins__card mk-ins__card--hero">
          <span className="mk-pill" style={{ width: '55%' }} />
          <span className="mk-ins__num-big">87<span style={{ fontSize: 14, color: 'var(--wp-text-dim)' }}>%</span></span>
          <span className="mk-pill" style={{ width: '70%' }} />
          <div className="mk-spark mk-spark--success" style={{ marginTop: 'auto' }} />
        </div>
        <div className="mk-ins__card">
          <div className="mk-ins__row">
            <span className="mk-pill" style={{ width: '50%' }} />
            <span className="mk-stat mk-stat--ok">OK</span>
          </div>
          <span className="mk-ins__num-mid">3<span style={{ fontSize: 9, color: 'var(--wp-text-dim)' }}>/3</span></span>
          <div className="mk-spark" />
        </div>
        <div className="mk-ins__card">
          <div className="mk-ins__row">
            <span className="mk-pill" style={{ width: '50%' }} />
            <span className="mk-stat mk-stat--warn">WARN</span>
          </div>
          <span className="mk-ins__num-mid">2.3</span>
          <div className="mk-spark mk-spark--warn" />
        </div>
        <div className="mk-ins__card">
          <div className="mk-ins__row">
            <span className="mk-pill" style={{ width: '50%' }} />
            <span className="mk-stat mk-stat--ok">OK</span>
          </div>
          <span className="mk-ins__num-mid">14<span style={{ fontSize: 9, color: 'var(--wp-text-dim)' }}>d</span></span>
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
        <div className="mk-ins__card">
          <div className="mk-ins__row">
            <span className="mk-pill" style={{ width: '50%' }} />
            <span className="mk-stat mk-stat--info">INFO</span>
          </div>
          <span className="mk-ins__num-mid">2</span>
          <span className="mk-pill" style={{ width: '70%' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- T7 Comparison Table ---------- */
function PreviewTable() {
  const rows: Array<{
    name: string;
    last: string;
    status: 'ok' | 'warn' | 'err' | 'info';
    statusLabel: string;
    sparkClass: string;
  }> = [
    { name: 'DNS check', last: '12m ago', status: 'ok', statusLabel: '3/3', sparkClass: 'mk-spark mk-spark--success' },
    { name: 'Warmup preview', last: '1h ago', status: 'info', statusLabel: '2 saved', sparkClass: 'mk-spark' },
    { name: 'Template design', last: 'yesterday', status: 'ok', statusLabel: '5 templates', sparkClass: 'mk-spark mk-spark--success' },
    { name: 'Spam scan', last: '—', status: 'err', statusLabel: 'PRO', sparkClass: 'mk-spark mk-spark--warn' },
    { name: 'Placement', last: '—', status: 'err', statusLabel: 'PRO', sparkClass: 'mk-spark mk-spark--warn' },
  ];
  return (
    <div className="mk mk--table">
      <div className="mk-tb__head">
        <span>Tool</span>
        <span>Last run</span>
        <span>Status</span>
        <span>7d trend</span>
        <span></span>
      </div>
      <div className="mk-tb__body">
        {rows.map((r, i) => (
          <div key={i} className="mk-tb__row">
            <div className="mk-tb__row-name">
              <span className="mk-tb__icon" />
              <span className="mk-pill mk-pill--accent" style={{ width: '70%' }} />
            </div>
            <span className="mk-tb__last">{r.last}</span>
            <span className={`mk-stat mk-stat--${r.status}`}>{r.statusLabel}</span>
            <span className={r.sparkClass} />
            <span className="mk-tb__action" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- T8 Status Board ---------- */
function PreviewBoard() {
  const cells: Array<{
    name: string;
    value: string;
    suffix?: string;
    detail: string;
    status: 'ok' | 'warn' | 'err' | 'accent';
    sparkClass?: string;
  }> = [
    { name: 'DNS', value: '3', suffix: '/3', detail: 'SPF · DKIM · DMARC', status: 'ok', sparkClass: 'mk-spark mk-spark--success' },
    { name: 'Spam score', value: '2.3', suffix: '/10', detail: 'Last scan · 12m ago', status: 'warn', sparkClass: 'mk-spark mk-spark--warn' },
    { name: 'Inbox %', value: '87', suffix: '%', detail: 'Last 7d avg', status: 'accent', sparkClass: 'mk-spark' },
    { name: 'Auth', value: '✓', detail: 'Gmail · Outlook', status: 'ok' },
    { name: 'Domain age', value: '14', suffix: 'd', detail: 'Healthy', status: 'ok' },
    { name: 'Placement', value: '—', detail: 'Pro feature', status: 'err' },
  ];
  return (
    <div className="mk mk--board">
      <div className="mk-bd__head">
        <span className="mk-pill mk-pill--accent" style={{ width: '20%' }} />
        <span className="mk-stat mk-stat--ok">All OK</span>
      </div>
      <div className="mk-bd__grid">
        {cells.map((c, i) => (
          <div key={i} className={`mk-bd__cell mk-bd__cell--${c.status}`}>
            <div className="mk-bd__cell-head">
              <span className="mk-bd__name">{c.name}</span>
            </div>
            <div>
              <span className="mk-bd__value">{c.value}</span>
              {c.suffix && <span className="mk-bd__value-suffix">{c.suffix}</span>}
            </div>
            <div className="mk-bd__detail">
              {c.sparkClass ? <span className={c.sparkClass} style={{ flex: 1, height: 10 }} /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
