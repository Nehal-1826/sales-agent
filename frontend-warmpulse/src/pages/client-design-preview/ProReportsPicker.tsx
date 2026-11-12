import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { R1Library } from './pro-reports/R1Library';
import { R2Builder } from './pro-reports/R2Builder';
import { R3Calendar } from './pro-reports/R3Calendar';
import { R4Stack } from './pro-reports/R4Stack';
import { R5Dashboard } from './pro-reports/R5Dashboard';
import { R6Hub } from './pro-reports/R6Hub';
import './pro-reports/pro-reports.css';

type Code = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'R1', name: 'Report Library', sub: 'File-manager table with filters' },
  { code: 'R2', name: 'Builder Workspace', sub: 'Controls + live preview' },
  { code: 'R3', name: 'Calendar View', sub: 'Monthly grid with markers' },
  { code: 'R4', name: 'Report Stack', sub: 'Spotify-Wrapped tall cards' },
  { code: 'R5', name: 'Reports Dashboard', sub: 'KPIs + charts + recent' },
  { code: 'R6', name: 'Reports Hub', sub: 'Quick gen + schedule + library' },
];

export function ProReportsPicker() {
  const [active, setActive] = useState<Code>('R1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="prr">
      <header className="prr__topbar">
        <Link to="/client-design-preview/tools/pro" className="prr__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Tools picker
        </Link>
        <span className="prr__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Reports · design picker
        </span>
      </header>

      <section className="prr__intro">
        <span className="prr__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 7 of 10 · Pro tier
        </span>
        <h1 className="prr__title">
          Pick a Pro <em>Reports</em> direction
        </h1>
        <p className="prr__sub">
          6 layouts. Same demo data (12 generated reports + 3 scheduled digests).
          All on admin tokens.
        </p>
      </section>

      <div className="prr__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`prr__tab ${active === t.code ? 'prr__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="prr__tab-code">{t.code}</span>
            <span className="prr__tab-name">{t.name}</span>
            <span className="prr__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="prr__active-head">
        <span className="prr__active-code">{current.code}</span>
        <div>
          <h2 className="prr__active-name">{current.name}</h2>
          <p className="prr__active-sub">{current.sub}</p>
        </div>
        <div className="prr__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="prr__stage">
        {active === 'R1' && <R1Library />}
        {active === 'R2' && <R2Builder />}
        {active === 'R3' && <R3Calendar />}
        {active === 'R4' && <R4Stack />}
        {active === 'R5' && <R5Dashboard />}
        {active === 'R6' && <R6Hub />}
      </div>
    </div>
  );
}

export default ProReportsPicker;
