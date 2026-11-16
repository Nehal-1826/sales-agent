import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { P1Command } from './pro-dashboards/P1Command';
import { P2Glass } from './pro-dashboards/P2Glass';
import { P3GridOps } from './pro-dashboards/P3GridOps';
import { P4Magazine } from './pro-dashboards/P4Magazine';
import { P5Neon } from './pro-dashboards/P5Neon';
import { P6Bento } from './pro-dashboards/P6Bento';
import './pro-dashboards/pro-dashboards.css';

/**
 * /client-design-preview/dashboards/pro — Pro Dashboard picker.
 *
 * Renders all 6 design directions with REAL (demo) data so the user can
 * see how each handles multi-mailbox density before picking the canonical
 * Pro Dashboard layout.
 */

type Code = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'P1', name: 'Command Center', sub: 'Bloomberg-terminal density' },
  { code: 'P2', name: 'Glass Studio', sub: 'Spotify Premium aesthetic' },
  { code: 'P3', name: 'Grid Ops', sub: 'Datadog/Grafana panels' },
  { code: 'P4', name: 'Editorial Magazine', sub: 'Stripe Atlas refinement' },
  { code: 'P5', name: 'Neon Synthwave', sub: 'Cyberpunk hacker' },
  { code: 'P6', name: 'Bento Layout', sub: 'Linear/Raycast cards' },
];

export function ProDashboardPicker() {
  const [active, setActive] = useState<Code>('P1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pdp">
      {/* Top bar */}
      <header className="pdp__topbar">
        <Link to="/app/dashboard" className="pdp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to client app
        </Link>
        <span className="pdp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro Dashboard · design picker
        </span>
      </header>

      {/* Intro */}
      <section className="pdp__intro">
        <span className="pdp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 1 of 10 · Pro tier
        </span>
        <h1 className="pdp__title">
          Pick a Pro <em>Dashboard</em> direction
        </h1>
        <p className="pdp__sub">
          Each tab below is a fully-rendered Pro Dashboard with the same demo
          dataset — 5 mailboxes across Gmail / Outlook / Yahoo, aggregate KPIs,
          live event feed. Switch tabs to compare how each design handles
          multi-mailbox density. Pick one and we apply that direction to the
          remaining 9 sections.
        </p>
      </section>

      {/* Tab strip */}
      <div className="pdp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pdp__tab ${active === t.code ? 'pdp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pdp__tab-code">{t.code}</span>
            <span className="pdp__tab-name">{t.name}</span>
            <span className="pdp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* Active variant header */}
      <div className="pdp__active-head">
        <span className="pdp__active-code">{current.code}</span>
        <div>
          <h2 className="pdp__active-name">{current.name}</h2>
          <p className="pdp__active-sub">{current.sub}</p>
        </div>
        <div className="pdp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll build all 10 Pro sections in this style.
        </div>
      </div>

      {/* Active variant */}
      <div className="pdp__stage">
        {active === 'P1' && <P1Command />}
        {active === 'P2' && <P2Glass />}
        {active === 'P3' && <P3GridOps />}
        {active === 'P4' && <P4Magazine />}
        {active === 'P5' && <P5Neon />}
        {active === 'P6' && <P6Bento />}
      </div>
    </div>
  );
}

export default ProDashboardPicker;
