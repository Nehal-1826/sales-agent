import { useState } from 'react';

/**
 * DEMO BOOKING — simple and neat: heading + walkthrough form.
 * Purely front-end — the form shows a thank-you, nothing is sent.
 */
export function DemoBooking() {
  const [sent, setSent] = useState(false);

  return (
    <section className="lp-section lp-contact" id="contact">
      <div className="lp-contact-head">
        <h2>Book a demo</h2>
        <p className="lp-section-sub">
          20 minutes, your market, your leads. We'll run a live cycle for your
          industry on the call.
        </p>
      </div>

      <div className="lp-demo-wrap">
        <form
          className="lp-demo-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
            e.currentTarget.reset();
          }}
        >
          <input type="text" name="name" placeholder="Your name" required />
          <input type="email" name="email" placeholder="Work email" required />
          <button type="submit" className="lp-cta lp-cta-solid lp-demo-submit">
            Book my demo →
          </button>
        </form>
        {sent && (
          <small className="lp-demo-done">✓ Thanks — we'll reach out within 24 hours.</small>
        )}
        <div className="lp-demo-chips">
          <span>14-day free trial</span>
          <span>No credit card</span>
          <span>Cancel anytime</span>
        </div>
      </div>
    </section>
  );
}
