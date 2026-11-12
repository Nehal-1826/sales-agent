import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { N1KpiDashboard } from './pro-analytics/N1KpiDashboard';
import { N2ChartWall } from './pro-analytics/N2ChartWall';
import { N3Compare } from './pro-analytics/N3Compare';
import { N4Report } from './pro-analytics/N4Report';
import { N5Funnel } from './pro-analytics/N5Funnel';
import { N6Timeline } from './pro-analytics/N6Timeline';
import './pro-analytics/pro-analytics.css';

type Code = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'N1', name: 'KPI Dashboard', sub: 'Executive Bloomberg view' },
  { code: 'N2', name: 'Multi-Chart Wall', sub: 'Grafana 6-panel grid' },
  { code: 'N3', name: 'Compare Mailboxes', sub: '5-column side-by-side' },
  { code: 'N4', name: 'Stacked Report', sub: 'Vertical scroll narrative' },
  { code: 'N5', name: 'Deliverability Funnel', sub: 'Funnel + cohort table' },
  { code: 'N6', name: 'Trend Timeline', sub: 'Annotated time-series' },
];

export function ProAnalyticsPicker() {
  const [active, setActive] = useState<Code>('N1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pnp">
      <header className="pnp__topbar">
        <Link to="/client-design-preview/activity/pro" className="pnp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Activity picker
        </Link>
        <span className="pnp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Analytics · design picker
        </span>
      </header>

      <section className="pnp__intro">
        <span className="pnp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 4 of 10 · Pro tier
        </span>
        <h1 className="pnp__title">
          Pick a Pro <em>Analytics</em> direction
        </h1>
        <p className="pnp__sub">
          6 layouts. Same workspace dataset (5 mailboxes, aggregate KPIs, 30-day
          trend series). All on admin color tokens
          (<code>--wp-accent</code> violet, success / warning / danger).
        </p>
      </section>

      <div className="pnp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pnp__tab ${active === t.code ? 'pnp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pnp__tab-code">{t.code}</span>
            <span className="pnp__tab-name">{t.name}</span>
            <span className="pnp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="pnp__active-head">
        <span className="pnp__active-code">{current.code}</span>
        <div>
          <h2 className="pnp__active-name">{current.name}</h2>
          <p className="pnp__active-sub">{current.sub}</p>
        </div>
        <div className="pnp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="pnp__stage">
        {active === 'N1' && <N1KpiDashboard />}
        {active === 'N2' && <N2ChartWall />}
        {active === 'N3' && <N3Compare />}
        {active === 'N4' && <N4Report />}
        {active === 'N5' && <N5Funnel />}
        {active === 'N6' && <N6Timeline />}
      </div>
    </div>
  );
}

export default ProAnalyticsPicker;
