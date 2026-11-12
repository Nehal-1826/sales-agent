import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { A1LiveStream } from './pro-activity/A1LiveStream';
import { A2Channels } from './pro-activity/A2Channels';
import { A3Heatmap } from './pro-activity/A3Heatmap';
import { A4StackedChart } from './pro-activity/A4StackedChart';
import { A5Lanes } from './pro-activity/A5Lanes';
import { A6Threads } from './pro-activity/A6Threads';
import './pro-activity/pro-activity.css';

type Code = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'A1', name: 'Live Stream', sub: 'Slack/Twitter-style feed' },
  { code: 'A2', name: 'Mailbox Channels', sub: 'Slack channels per mailbox' },
  { code: 'A3', name: 'Heatmap Activity', sub: 'GitHub-style 5×24h grid' },
  { code: 'A4', name: 'Stacked Chart', sub: 'Datadog hourly stacked bars' },
  { code: 'A5', name: 'Action Lanes', sub: 'Swim-lanes by action type' },
  { code: 'A6', name: 'Conversation Threads', sub: 'Gmail-style threads' },
];

export function ProActivityPicker() {
  const [active, setActive] = useState<Code>('A1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pap">
      <header className="pap__topbar">
        <Link to="/client-design-preview/mailboxes/pro" className="pap__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Mailboxes picker
        </Link>
        <span className="pap__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Activity · design picker
        </span>
      </header>

      <section className="pap__intro">
        <span className="pap__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 3 of 10 · Pro tier
        </span>
        <h1 className="pap__title">
          Pick a Pro <em>Activity</em> direction
        </h1>
        <p className="pap__sub">
          6 layouts. Same 30-event demo dataset across 5 mailboxes. All on admin
          color tokens (<code>--wp-accent</code> violet, success / warning / danger).
          Each tab is a complete page so you can compare how each handles
          higher event density than Starter.
        </p>
      </section>

      <div className="pap__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pap__tab ${active === t.code ? 'pap__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pap__tab-code">{t.code}</span>
            <span className="pap__tab-name">{t.name}</span>
            <span className="pap__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="pap__active-head">
        <span className="pap__active-code">{current.code}</span>
        <div>
          <h2 className="pap__active-name">{current.name}</h2>
          <p className="pap__active-sub">{current.sub}</p>
        </div>
        <div className="pap__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="pap__stage">
        {active === 'A1' && <A1LiveStream />}
        {active === 'A2' && <A2Channels />}
        {active === 'A3' && <A3Heatmap />}
        {active === 'A4' && <A4StackedChart />}
        {active === 'A5' && <A5Lanes />}
        {active === 'A6' && <A6Threads />}
      </div>
    </div>
  );
}

export default ProActivityPicker;
