import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { S1Sidebar } from './pro-settings/S1Sidebar';
import { S2CardGrid } from './pro-settings/S2CardGrid';
import { S3Command } from './pro-settings/S3Command';
import { S4Tabs } from './pro-settings/S4Tabs';
import { S5Wizard } from './pro-settings/S5Wizard';
import { S6Inspector } from './pro-settings/S6Inspector';
import './pro-settings/pro-settings.css';

type Code = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'S1', name: 'Linear Sidebar',    sub: 'Left nav + scrollable form' },
  { code: 'S2', name: 'Card Grid',         sub: 'Apple-style 3×2 launcher' },
  { code: 'S3', name: 'Command Search',    sub: 'Cmd-K search-first' },
  { code: 'S4', name: 'Horizontal Tabs',   sub: 'Stripe/Vercel-style' },
  { code: 'S5', name: 'Wizard Steps',      sub: 'Numbered step rail' },
  { code: 'S6', name: 'Three-Pane',        sub: 'macOS Mail-style inspector' },
];

export function ProSettingsPicker() {
  const [active, setActive] = useState<Code>('S1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="psp">
      <header className="psp__topbar">
        <Link to="/client-design-preview/billing/pro" className="psp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Billing picker
        </Link>
        <span className="psp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Settings · design picker
        </span>
      </header>

      <section className="psp__intro">
        <span className="psp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 10 of 10 · Pro tier · final section
        </span>
        <h1 className="psp__title">
          Pick a Pro <em>Settings</em> direction
        </h1>
        <p className="psp__sub">
          6 layouts. Same demo data — 6 categories (Profile · Security · Notifications · Integrations · Appearance · Data),
          34 individual settings, 4 active sessions, 6 integrations.
          All on admin tokens (<code>--wp-accent</code> violet, success / warning / danger).
        </p>
      </section>

      <div className="psp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`psp__tab ${active === t.code ? 'psp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="psp__tab-code">{t.code}</span>
            <span className="psp__tab-name">{t.name}</span>
            <span className="psp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="psp__active-head">
        <span className="psp__active-code">{current.code}</span>
        <div>
          <h2 className="psp__active-name">{current.name}</h2>
          <p className="psp__active-sub">{current.sub}</p>
        </div>
        <div className="psp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="psp__stage">
        {active === 'S1' && <S1Sidebar />}
        {active === 'S2' && <S2CardGrid />}
        {active === 'S3' && <S3Command />}
        {active === 'S4' && <S4Tabs />}
        {active === 'S5' && <S5Wizard />}
        {active === 'S6' && <S6Inspector />}
      </div>
    </div>
  );
}

export default ProSettingsPicker;
