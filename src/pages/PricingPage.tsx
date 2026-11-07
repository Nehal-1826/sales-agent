import { useState } from 'react';
import { DemoBooking } from '../components/DemoBooking';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { Proof, SafetyPromises } from '../marketing/TrustSections';
import {
  FAQ,
  PILOT,
  STACK,
  STACK_TOTAL_USD,
  TIERS,
  formatInr,
  formatUsd,
  monthly,
} from '../marketing/pricing';
import { useDocumentMeta } from '../marketing/seo';

/** PRICING — /pricing. No payment integration: every CTA books a demo. */
export function PricingPage() {
  useDocumentMeta('/pricing');
  const [annual, setAnnual] = useState(false);

  return (
    <MarketingLayout>
      <section className="lp-section mk-section mk-page-head">
        <h1>Simple pricing, in rupees</h1>
        <p className="lp-section-sub">
          Pay monthly, stop any time. Prices in INR, with USD for customers outside India. Every plan: you approve
          every email, it sends from your own mailbox.
        </p>

        <div className="mk-toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>
            Monthly
          </button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>
            Yearly <em>save 20%</em>
          </button>
        </div>

        <div className="mk-tiers">
          {TIERS.map((t) => (
            <article key={t.id} className={`mk-tier ${t.popular ? 'mk-tier-pop' : ''}`}>
              {t.popular && <span className="mk-pop-badge">Most popular</span>}
              <h2>{t.name}</h2>
              <p className="mk-muted">{t.blurb}</p>
              <div className="mk-price">
                <strong>{formatInr(monthly(t.inr, annual))}</strong>
                <span>/ month</span>
              </div>
              <div className="mk-price-usd">
                {formatUsd(monthly(t.usd, annual))} / month{annual && t.inr > 0 ? ', billed yearly' : ''}
              </div>
              <ul className="mk-list">
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a className={`lp-cta ${t.popular ? 'lp-cta-solid' : 'lp-cta-ghost'} mk-tier-cta`} href="#contact">
                {t.inr === 0 ? 'Start free — book a setup call' : 'Book a demo'}
              </a>
            </article>
          ))}
        </div>

        <div className="mk-offers">
          <article className="mk-offer">
            <span className="mk-sample-tag">Founding customer</span>
            <h3>Price locked for life</h3>
            <p>
              The first 25 agencies that join keep the price they signed up at for as long as they stay subscribed —
              even if list prices go up.
            </p>
          </article>
          <article className="mk-offer mk-offer-pilot">
            <span className="mk-sample-tag">{PILOT.days}-day pilot</span>
            <h3>{formatInr(PILOT.inr)} pilot, with a refund promise</h3>
            <p>
              We set it up for your market. If you don’t get <b>5 positive replies</b> or <b>2 booked calls</b> in{' '}
              {PILOT.days} days, we refund the {formatInr(PILOT.inr)}.
            </p>
            <a className="lp-cta lp-cta-solid" href="#contact">
              Ask for a pilot
            </a>
          </article>
        </div>
      </section>

      <section className="lp-section mk-section" aria-labelledby="stack-h">
        <h2 id="stack-h">The stack it replaces</h2>
        <p className="lp-section-sub">
          Doing this by hand usually means four tools stitched together. Approximate entry-level list prices, per month.
        </p>
        <table className="mk-table">
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">Used for</th>
              <th scope="col">Approx. / month</th>
            </tr>
          </thead>
          <tbody>
            {STACK.map((s) => (
              <tr key={s.tool}>
                <td>{s.tool}</td>
                <td>{s.job}</td>
                <td>{formatUsd(s.usd)}</td>
              </tr>
            ))}
            <tr className="mk-table-total">
              <td>Together</td>
              <td>4 logins, copy-paste between them</td>
              <td>≈ {formatUsd(STACK_TOTAL_USD)}</td>
            </tr>
            <tr className="mk-table-us">
              <td>Shailog AI Growth</td>
              <td>find, audit, enrich, draft, approve & send</td>
              <td>{formatUsd(79)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mk-fine">
          Third-party prices are approximate, change often and depend on plan and usage. Check each vendor’s site. Tool
          names are trademarks of their owners; we are not affiliated with them.
        </p>
      </section>

      <Proof />

      <section className="lp-section mk-section" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions</h2>
        <div className="mk-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <SafetyPromises />
      <DemoBooking />
    </MarketingLayout>
  );
}
