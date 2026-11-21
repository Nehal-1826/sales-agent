import { useEffect, useMemo, useRef, useState } from 'react';
import { DemoBooking } from '../components/DemoBooking';
import DepthCarousel from '../components/reactbits/DepthCarousel';
import { OptionWheel } from '../components/reactbits/OptionWheel';
import { SpecularButton } from '../components/SpecularButton';
import { fetchPlans } from '../lib/billing';
import type { ApiPlan } from '../lib/billing';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { planCardDataUri } from '../marketing/planCards';
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

/**
 * Plan picker — an OptionWheel of plan names beside a DepthCarousel of
 * branded plan cards (the old static three-card grid). Wheel and carousel
 * are synced both ways; card prices and the CTA re-render with the page's
 * currency/interval toggles.
 */
function PlanPicker({ tiers, currency, interval }: { tiers: Tier[]; currency: Currency; interval: Interval }) {
  const yearly = interval === 'year';
  const defaultIdx = Math.max(0, tiers.findIndex((t) => t.popular));
  const [selected, setSelected] = useState(defaultIdx);
  const selectedRef = useRef(defaultIdx);
  // OptionWheel is uncontrolled, so a carousel-driven selection remounts it
  // (key) at the new position; wheel-driven changes never touch the key and
  // keep their animation.
  const [wheelSync, setWheelSync] = useState(0);

  const idx = Math.min(selected, tiers.length - 1);
  const plan = tiers[idx] ?? tiers[0];

  const cards = useMemo(
    () => tiers.map((t) => ({ image: planCardDataUri(t, currency, yearly), alt: `${t.name} plan` })),
    [tiers, currency, yearly]
  );

  const pickFromWheel = (i: number) => {
    if (i === selectedRef.current) return;
    selectedRef.current = i;
    setSelected(i);
  };
  const pickFromCarousel = (i: number) => {
    if (i === selectedRef.current) return;
    selectedRef.current = i;
    setSelected(i);
    setWheelSync((n) => n + 1);
  };

  return (
    <div className="mk-picker">
      <h2>Spin to a plan</h2>
      <p className="lp-section-sub">Turn the wheel or scroll the cards — one plan at a time.</p>
      <div className="mk-picker-grid">
        <div className="mk-picker-wheel">
          <OptionWheel
            key={`wheel-${wheelSync}`}
            items={tiers.map((t) => t.name)}
            defaultSelected={idx}
            onChange={pickFromWheel}
            textColor="#8a8580"
            activeColor="#fb923c"
            side="right"
            fontSize={2.4}
            blur={1.5}
            inset={28}
            aria-label="Plan"
          />
        </div>
        <div className="mk-picker-stage">
          <DepthCarousel
            items={cards}
            index={idx}
            onChange={pickFromCarousel}
            loop={false}
            cardWidth={300}
            cardHeight={400}
            depth={110}
            spread={110}
            tilt={22}
            tiltDirection="right"
            perspective={1200}
            visibleCards={3}
            falloff={0.16}
            blur={3}
            tint="#14100c"
            duration={550}
            showControls
            showIndicators
          />
        </div>
      </div>
      <div className="mk-picker-cta">
        <SpecularButton
          href={signupHref(plan.id, interval)}
          size="md"
          radius={999}
          tint="#f97316"
          tintOpacity={0.9}
          blur={14}
          textColor="#ffffff"
          lineColor="#ffffff"
          baseColor="#fb923c"
          idleIntensity={0.5}
          className="mk-tier-cta"
        >
          Get Started — {plan.name}
        </SpecularButton>
      </div>
    </div>
  );
}

/** MOBILE-ONLY fallback: the plain stacked cards (the wheel + 3D carousel are
 *  desktop-only by owner order — CSS swaps the two blocks at 760px). */
function MobilePlanCards({ tiers, currency, interval }: { tiers: Tier[]; currency: Currency; interval: Interval }) {
  const yearly = interval === 'year';
  return (
    <div className="mk-tiers mk-tiers-mobile" aria-label="Plans">
      {tiers.map((t) => {
        const amount = currency === 'INR' ? (yearly ? t.inrYear : t.inr) : yearly ? t.usdYear : t.usd;
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
            <SpecularButton
              href={signupHref(t.id, interval)}
              size="md"
              radius={999}
              tint={t.popular ? '#f97316' : '#181512'}
              tintOpacity={t.popular ? 0.9 : 0.78}
              blur={14}
              textColor={t.popular ? '#ffffff' : '#fff7ed'}
              lineColor={t.popular ? '#ffffff' : '#fb923c'}
              baseColor={t.popular ? '#fb923c' : '#57534e'}
              idleIntensity={t.popular ? 0.5 : 0.35}
              className="mk-tier-cta"
            >
              Get Started
            </SpecularButton>
          </article>
        );
      })}
    </div>
  );
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

  return (
    <MarketingLayout>
      <section className="lp-section mk-section mk-page-head">
        <h1>Simple pricing</h1>
        <p className="lp-section-sub">
          Sign up and pay online. Your first payment includes {BONUS_DAYS} bonus days, and if it is not for you,
          cancel within {REFUND_WINDOW_DAYS} days for a partial refund. Every plan: you approve every email, it
          sends from your own mailbox.
        </p>

        <div className="mk-toggles">
          <div className="mk-toggle" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={interval === 'month'} onClick={() => setInterval_('month')}>
              Monthly
            </button>
            <button type="button" aria-pressed={interval === 'year'} onClick={() => setInterval_('year')}>
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
        </div>

        {/* wheel + 3D carousel on desktop; plain stacked cards on mobile
            (owner order) — the 760px media query swaps the two blocks */}
        <PlanPicker tiers={tiers} currency={currency} interval={interval} />
        <MobilePlanCards tiers={tiers} currency={currency} interval={interval} />

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
              <td>WarmPulse Business</td>
              <td>warmup, find, audit, enrich, draft, approve & send</td>
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
