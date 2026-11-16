import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { M1SplitPane } from './pro-mailboxes/M1SplitPane';
import { M2DataGrid } from './pro-mailboxes/M2DataGrid';
import { M3Kanban } from './pro-mailboxes/M3Kanban';
import { M4Carousel } from './pro-mailboxes/M4Carousel';
import { M5Heatmap } from './pro-mailboxes/M5Heatmap';
import { M6Bento } from './pro-mailboxes/M6Bento';
import './pro-mailboxes/pro-mailboxes.css';

/**
 * /client-design-preview/mailboxes/pro
 *
 * Pro Mailboxes picker — 6 distinct directions, all rendered with the same
 * demo dataset (5 mailboxes across Gmail / Outlook / Yahoo) on admin tokens.
 *
 *   M1 — Split Pane Inbox    Gmail-style sidebar + detail
 *   M2 — Data Grid           Linear/Airtable dense table
 *   M3 — Kanban Status Board Three columns (Active/Warming/Paused)
 *   M4 — Carousel Stage      Big featured + thumbnail strip
 *   M5 — Heatmap Calendar    5 mailboxes × 14 days warmth grid
 *   M6 — Bento Layout        Asymmetric mixed-size cards
 */

type Code = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'M1', name: 'Split Pane Inbox', sub: 'Sidebar + detail (Gmail-like)' },
  { code: 'M2', name: 'Data Grid', sub: 'Linear/Airtable dense table' },
  { code: 'M3', name: 'Kanban Board', sub: 'Active / Warming / Paused' },
  { code: 'M4', name: 'Carousel Stage', sub: 'Big hero + thumbnail strip' },
  { code: 'M5', name: 'Heatmap Calendar', sub: 'Mailbox × day grid' },
  { code: 'M6', name: 'Bento Layout', sub: 'Asymmetric mixed cards' },
];

export function ProMailboxPicker() {
  const [active, setActive] = useState<Code>('M1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pmp">
      <header className="pmp__topbar">
        <Link to="/client-design-preview/dashboards/pro" className="pmp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Dashboard picker
        </Link>
        <span className="pmp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Mailboxes · design picker
        </span>
      </header>

      <section className="pmp__intro">
        <span className="pmp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 2 of 10 · Pro tier
        </span>
        <h1 className="pmp__title">
          Pick a Pro <em>Mailboxes</em> direction
        </h1>
        <p className="pmp__sub">
          6 layouts, same demo dataset (5 mailboxes across Gmail / Outlook /
          Yahoo), all built on the admin color tokens
          (<code>--wp-accent</code> violet primary, success / warning / danger).
          Each tab is a complete page so you can compare how each handles
          multi-mailbox density.
        </p>
      </section>

      <div className="pmp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pmp__tab ${active === t.code ? 'pmp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pmp__tab-code">{t.code}</span>
            <span className="pmp__tab-name">{t.name}</span>
            <span className="pmp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="pmp__active-head">
        <span className="pmp__active-code">{current.code}</span>
        <div>
          <h2 className="pmp__active-name">{current.name}</h2>
          <p className="pmp__active-sub">{current.sub}</p>
        </div>
        <div className="pmp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="pmp__stage">
        {active === 'M1' && <M1SplitPane />}
        {active === 'M2' && <M2DataGrid />}
        {active === 'M3' && <M3Kanban />}
        {active === 'M4' && <M4Carousel />}
        {active === 'M5' && <M5Heatmap />}
        {active === 'M6' && <M6Bento />}
      </div>
    </div>
  );
}

export default ProMailboxPicker;
