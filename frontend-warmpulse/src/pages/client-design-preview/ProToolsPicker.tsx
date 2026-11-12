import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { T1Launcher } from './pro-tools/T1Launcher';
import { T2Workspace } from './pro-tools/T2Workspace';
import { T3History } from './pro-tools/T3History';
import { T4Insights } from './pro-tools/T4Insights';
import { T5StatusBoard } from './pro-tools/T5StatusBoard';
import { T6Workbench } from './pro-tools/T6Workbench';
import './pro-tools/pro-tools.css';

type Code = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'T1', name: 'Tool Launcher', sub: 'App-launcher grid of 5 tiles' },
  { code: 'T2', name: 'IDE Workspace', sub: 'Sidebar + active tool pane' },
  { code: 'T3', name: 'Run History Stream', sub: 'Chronological log with filters' },
  { code: 'T4', name: 'Insight Cards', sub: 'Magazine-style per-tool cards' },
  { code: 'T5', name: 'Status Board', sub: 'NOC-style giant stat tiles' },
  { code: 'T6', name: 'Split Workbench', sub: 'Active tool + run history side pane' },
];

export function ProToolsPicker() {
  const [active, setActive] = useState<Code>('T1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="ptp">
      <header className="ptp__topbar">
        <Link to="/client-design-preview/reputation/pro" className="ptp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Reputation picker
        </Link>
        <span className="ptp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Tools · design picker
        </span>
      </header>

      <section className="ptp__intro">
        <span className="ptp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 6 of 10 · Pro tier
        </span>
        <h1 className="ptp__title">
          Pick a Pro <em>Tools</em> direction
        </h1>
        <p className="ptp__sub">
          6 layouts. All 5 tools are unlocked for Pro (no Pro-locks). Same demo
          run history (12 runs across 5 tools) on admin tokens.
        </p>
      </section>

      <div className="ptp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`ptp__tab ${active === t.code ? 'ptp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="ptp__tab-code">{t.code}</span>
            <span className="ptp__tab-name">{t.name}</span>
            <span className="ptp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="ptp__active-head">
        <span className="ptp__active-code">{current.code}</span>
        <div>
          <h2 className="ptp__active-name">{current.name}</h2>
          <p className="ptp__active-sub">{current.sub}</p>
        </div>
        <div className="ptp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="ptp__stage">
        {active === 'T1' && <T1Launcher />}
        {active === 'T2' && <T2Workspace />}
        {active === 'T3' && <T3History />}
        {active === 'T4' && <T4Insights />}
        {active === 'T5' && <T5StatusBoard />}
        {active === 'T6' && <T6Workbench />}
      </div>
    </div>
  );
}

export default ProToolsPicker;
