import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Crown, Sparkles } from 'lucide-react';
import { B1AccountCenter } from './pro-billing/B1AccountCenter';
import { B2UsageMeters } from './pro-billing/B2UsageMeters';
import { B3PlanCompare } from './pro-billing/B3PlanCompare';
import { B4InvoiceLedger } from './pro-billing/B4InvoiceLedger';
import { B5CostBreakdown } from './pro-billing/B5CostBreakdown';
import { B6BentoHub } from './pro-billing/B6BentoHub';
import './pro-billing/pro-billing.css';

type Code = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';

const TABS: Array<{ code: Code; name: string; sub: string }> = [
  { code: 'B1', name: 'Account Center',  sub: 'Stripe-style hero + invoice table' },
  { code: 'B2', name: 'Usage Meters',    sub: 'Live cycle progress + bars' },
  { code: 'B3', name: 'Plan Compare',    sub: '3-column tier comparison' },
  { code: 'B4', name: 'Invoice Ledger',  sub: 'Chronological list w/ expand' },
  { code: 'B5', name: 'Cost Breakdown',  sub: 'Donut + 6-month trend + insights' },
  { code: 'B6', name: 'Bento Hub',       sub: 'Multi-card billing dashboard' },
];

export function ProBillingPicker() {
  const [active, setActive] = useState<Code>('B1');
  const current = TABS.find((t) => t.code === active)!;

  return (
    <div className="pbp">
      <header className="pbp__topbar">
        <Link to="/client-design-preview/workspace/pro" className="pbp__back">
          <ArrowLeft size={13} strokeWidth={2.2} />
          Back to Workspace picker
        </Link>
        <span className="pbp__brand">
          <Crown size={11} strokeWidth={2.4} />
          Pro · Billing · design picker
        </span>
      </header>

      <section className="pbp__intro">
        <span className="pbp__eyebrow">
          <Sparkles size={11} strokeWidth={2.4} />
          Section 9 of 10 · Pro tier
        </span>
        <h1 className="pbp__title">
          Pick a Pro <em>Billing</em> direction
        </h1>
        <p className="pbp__sub">
          6 layouts. Same demo data — 8 invoices (paid · pending · refunded),
          3 payment methods, 6 usage resources, ₹5,000 / mo Pro plan.
          All on admin tokens (<code>--wp-accent</code> violet, success / warning / danger).
        </p>
      </section>

      <div className="pbp__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="tab"
            aria-selected={active === t.code}
            className={`pbp__tab ${active === t.code ? 'pbp__tab--active' : ''}`}
            onClick={() => setActive(t.code)}
          >
            <span className="pbp__tab-code">{t.code}</span>
            <span className="pbp__tab-name">{t.name}</span>
            <span className="pbp__tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="pbp__active-head">
        <span className="pbp__active-code">{current.code}</span>
        <div>
          <h2 className="pbp__active-name">{current.name}</h2>
          <p className="pbp__active-sub">{current.sub}</p>
        </div>
        <div className="pbp__cta-hint">
          Like this? Say <strong>"use {current.code}"</strong> and I'll lock it in.
        </div>
      </div>

      <div className="pbp__stage">
        {active === 'B1' && <B1AccountCenter />}
        {active === 'B2' && <B2UsageMeters />}
        {active === 'B3' && <B3PlanCompare />}
        {active === 'B4' && <B4InvoiceLedger />}
        {active === 'B5' && <B5CostBreakdown />}
        {active === 'B6' && <B6BentoHub />}
      </div>
    </div>
  );
}

export default ProBillingPicker;
