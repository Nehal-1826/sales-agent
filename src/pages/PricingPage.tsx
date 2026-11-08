import { useEffect, useState } from 'react';
import { DemoBooking } from '../components/DemoBooking';
import { fetchPlans } from '../lib/billing';
import type { ApiPlan } from '../lib/billing';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { Proof, SafetyPromises } from '../marketing/TrustSections';
import {
  BONUS_DAYS,
  FAQ,
  REFUND_WINDOW_DAYS,
  STACK,
  STACK_TOTAL_USD,
  TIERS,
  detectCurrency,
  formatMoney,
  formatUsd,
  signupHref,
} from '../marketing/pricing';
import type { Currency, Interval, Tier } from '../marketing/pricing';
import { useDocumentMeta } from '../marketing/seo';

/** Overlay live plan prices (minor units) on the static fallback tiers. */
function mergeLive(live: ApiPlan[] | null): Tier[] {
  if (!live) return TIERS;
  return TIERS.map((t) => {
    const p = live.find((x) => x.code === t.id);
    if (!p) return t;
    return {
      ...t,
      name: p.name || t.name,
      inr: p.price_inr_month / 100,
      usd: p.price_usd_month / 100,
      inrYear: p.price_inr_year / 100,
      usdYear: p.price_usd_year / 100,
    };
  });
}

/** PRICING — /pricing. Static plans first, live prices when the API answers. */
export function PricingPage() {
  useDocumentMeta('/pricing');
  const [interval, setInterval_] = useState<Interval>('month');
  // prerender has no window: start INR, correct after mount
  const [currency, setCurrency] = useState<Currency>('INR');
  const [live, setLive] = useState<ApiPlan[] | null>(null);

  useEffect(() => {
    setCurrency(detectCurrency());
    fetchPlans().then(setLive).catch(() => undefined);
  }, []);

  const tiers = mergeLive(live);
  const yearly = interval === 'year';

  return (
    <MarketingLayout>
      <section className="lp-section mk-section mk-page-head">
        <h1>Simple pricing</h1>
        <p className="lp-section-sub">
          Sign up and pay online. Your first payment includes {BONUS_DAYS} bonus days, and if it is not for you,
          cancel within {REFUND_WINDOW_DAYS} days for a partial refund. Every plan: you approve every email, it
          sends from your own mailbox.
        </p>

        <div className="mk-toggle" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!yearly} onClick={() => setInterval_('month')}>
            Monthly
          </button>
          <button type="button" aria-pressed={yearly} onClick={() => setInterval_('year')}>
            Yearly <em>2 months free</em>
          </button>
        </div>
        <div className="mk-toggle" role="group" aria-label="Currency">
          <button type="button" aria-pressed={currency === 'INR'} onClick={() => setCurrency('INR')}>
            INR ₹
          </button>
          <button type="button" aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>
            USD $
          </button>
        </div>

        <div className="mk-tiers">
          {tiers.map((t) => {
            const amount =
              currency === 'INR' ? (yearly ? t.inrYear : t.inr) : yearly ? t.usdYear : t.usd;
            return (
              <article key={t.id} className={`mk-tier ${t.popular ? 'mk-tier-pop' : ''}`}>
                {t.popular && <span className="mk-pop-badge">Most popular</span>}
                <h2>{t.name}</h2>
                <p className="mk-muted">{t.blurb}</p>
                <div className="mk-price">
                  <strong>{formatMoney(amount, currency)}</strong>
                  <span>/ {yearly ? 'year' : 'month'}</span>
                </div>
                <div className="mk-price-usd">+{BONUS_DAYS} bonus days on your first payment</div>
                <ul className="mk-list">
                  {t.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <a
                  className={`lp-cta ${t.popular ? 'lp-cta-solid' : 'lp-cta-ghost'} mk-tier-cta`}
                  href={signupHref(t.id, interval)}
                >
                  Start now
                </a>
              </article>
            );
          })}
        </div>
        <p className="mk-fine">
          {currency === 'INR' && 'Prices exclude 18% GST. '}
          Cancel within {REFUND_WINDOW_DAYS} days of your first payment for a partial refund of the unused period
          (minus a small non-refundable fee). After that, cancel any time to stop renewal.
        </p>
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
              <td>Shailog AI Business</td>
              <td>find, audit, enrich, draft, approve & send</td>
              <td>{formatUsd(99)}</td>
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
