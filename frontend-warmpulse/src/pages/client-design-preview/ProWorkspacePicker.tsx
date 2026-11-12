import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { W1Roster } from './pro-workspace/W1Roster';
import { W2Settings } from './pro-workspace/W2Settings';
import { W3OrgChart } from './pro-workspace/W3OrgChart';
import { W4Activity } from './pro-workspace/W4Activity';
import { W5Cards } from './pro-workspace/W5Cards';
import { W6MemberDetail } from './pro-workspace/W6MemberDetail';
import { W7Hub } from './pro-workspace/W7Hub';
import './pro-workspace/pro-workspace.css';

type Code = 'W7' | 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'W7', name: 'Workspace Hub ★', sub: 'W5 bento + W6 member detail · fused' },
  { code: 'W1', name: 'Team Roster', sub: 'Notion-style member grid' },
  { code: 'W2', name: 'Settings Sidebar', sub: 'Linear-style nav + pane' },
  { code: 'W3', name: 'Org Hierarchy', sub: 'Visual org tree' },
  { code: 'W4', name: 'Activity Timeline', sub: 'Audit log with filters' },
  { code: 'W5', name: 'Overview Cards', sub: 'Multi-card hub' },
  { code: 'W6', name: 'Member Detail Split', sub: 'Rail + member profile' },
];

export function ProWorkspacePicker() {
  const [active, setActive] = useState<Code>('W7');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pwp">
      <header className="pwp__topbar">
        <Link to="/client-design-preview/reports/pro" className="pwp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Reports picker
        </Link>
        <span className="pwp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Workspace · design picker
        </span>
      </header>

      <section className="pwp__intro">
        <span className="pwp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 8 of 10 · Pro tier
        </span>
        <h1 className="pwp__title">
          Pick a Pro <em>Workspace</em> direction
        </h1>
        <p className="pwp__sub">
          6 layouts. Same demo data — 6 team members, 4 API keys, 2 webhooks,
          10 audit events. All on admin tokens.
        </p>
      </section>

      <div className="pwp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pwp__tab ${active === t.code ? 'pwp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pwp__tab-code">{t.code}</span>
            <span className="pwp__tab-name">{t.name}</span>
            <span className="pwp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="pwp__active-head">
        <span className="pwp__active-code">{current.code}</span>
        <div>
          <h2 className="pwp__active-name">{current.name}</h2>
          <p className="pwp__active-sub">{current.sub}</p>
        </div>
        <div className="pwp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="pwp__stage">
        {active === 'W7' && <W7Hub />}
        {active === 'W1' && <W1Roster />}
        {active === 'W2' && <W2Settings />}
        {active === 'W3' && <W3OrgChart />}
        {active === 'W4' && <W4Activity />}
        {active === 'W5' && <W5Cards />}
        {active === 'W6' && <W6MemberDetail />}
      </div>
    </div>
  );
}

export default ProWorkspacePicker;
