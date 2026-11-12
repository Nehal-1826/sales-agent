import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { H1Composite } from './pro-reputation/H1Composite';
import { H2Matrix } from './pro-reputation/H2Matrix';
import { H3Leaderboard } from './pro-reputation/H3Leaderboard';
import { H4StatusPage } from './pro-reputation/H4StatusPage';
import { H5Radar } from './pro-reputation/H5Radar';
import { H6Stoplight } from './pro-reputation/H6Stoplight';
import './pro-reputation/pro-reputation.css';

type Code = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'H1', name: 'Composite Hub', sub: 'Workspace gauge + per-mailbox cards' },
  { code: 'H2', name: 'Health Matrix', sub: '5 mailboxes × 6 signals grid' },
  { code: 'H3', name: 'Trust Leaderboard', sub: 'Podium + ranked rows' },
  { code: 'H4', name: 'Status Page', sub: 'status.io-style with history' },
  { code: 'H5', name: 'Radar Overlay', sub: '5 mailboxes on one radar' },
  { code: 'H6', name: 'Stoplight NOC', sub: 'Network-ops display' },
];

export function ProReputationPicker() {
  const [active, setActive] = useState<Code>('H1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="prp">
      <header className="prp__topbar">
        <Link to="/client-design-preview/analytics/pro" className="prp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Analytics picker
        </Link>
        <span className="prp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Reputation & Health · design picker
        </span>
      </header>

      <section className="prp__intro">
        <span className="prp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 5 of 10 · Pro tier
        </span>
        <h1 className="prp__title">
          Pick a Pro <em>Reputation</em> direction
        </h1>
        <p className="prp__sub">
          6 layouts. Each shows the same 5-mailbox health data (DNS · Warmth · Auth)
          on admin tokens (<code>--wp-accent</code> violet, success / warning / danger).
        </p>
      </section>

      <div className="prp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`prp__tab ${active === t.code ? 'prp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="prp__tab-code">{t.code}</span>
            <span className="prp__tab-name">{t.name}</span>
            <span className="prp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="prp__active-head">
        <span className="prp__active-code">{current.code}</span>
        <div>
          <h2 className="prp__active-name">{current.name}</h2>
          <p className="prp__active-sub">{current.sub}</p>
        </div>
        <div className="prp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="prp__stage">
        {active === 'H1' && <H1Composite />}
        {active === 'H2' && <H2Matrix />}
        {active === 'H3' && <H3Leaderboard />}
        {active === 'H4' && <H4StatusPage />}
        {active === 'H5' && <H5Radar />}
        {active === 'H6' && <H6Stoplight />}
      </div>
    </div>
  );
}

export default ProReputationPicker;
