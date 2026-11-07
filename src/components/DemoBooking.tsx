import { useState } from 'react';
import { COMPANY } from '../marketing/site';

/**
 * DEMO BOOKING — heading + walkthrough form.
 * No backend: submitting opens the visitor's own email app with a prefilled
 * request to the Shailog address, so a request is never silently dropped.
 * The phone number is shown as a fallback.
 */
export function DemoBooking() {
  const [opened, setOpened] = useState(false);

  return (
    <section className="lp-section lp-contact" id="contact">
      <div className="lp-contact-head">
        <h2>Book a demo</h2>
        <p className="lp-section-sub">
          20 minutes, your market, your leads. We'll run a live search for your industry and city on the call.
        </p>
      </div>

      <div className="lp-demo-wrap">
        <form
          className="lp-demo-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const name = String(data.get('name') || '').trim();
            const email = String(data.get('email') || '').trim();
            const market = String(data.get('market') || '').trim();
            const subject = `Demo request — ${name || 'Shailog AI'}`;
            const body = [
              `Name: ${name}`,
              `Email: ${email}`,
              `Industry / city I want leads in: ${market}`,
              '',
              'Please send me a time for a 20-minute demo.',
            ].join('\n');
            window.location.href = `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            setOpened(true);
          }}
        >
          <label className="mk-sr" htmlFor="demo-name">
            Your name
          </label>
          <input id="demo-name" type="text" name="name" placeholder="Your name" required />
          <label className="mk-sr" htmlFor="demo-email">
            Work email
          </label>
          <input id="demo-email" type="email" name="email" placeholder="Work email" required />
          <label className="mk-sr" htmlFor="demo-market">
            Industry and city you want leads in
          </label>
          <input id="demo-market" type="text" name="market" placeholder="e.g. Dentists in Chennai" />
          <button type="submit" className="lp-cta lp-cta-solid lp-demo-submit">
            Book my demo →
          </button>
        </form>
        {opened && (
          <small className="lp-demo-done" role="status">
            Your email app should open with the request ready to send. Nothing opened? Write to{' '}
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> or call{' '}
            <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>.
          </small>
        )}
        <p className="mk-demo-alt">
          Prefer to call? <a href={COMPANY.phoneHref}>{COMPANY.phone}</a> ·{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        </p>
        <div className="lp-demo-chips">
          <span>Free plan, no card</span>
          <span>Monthly, cancel anytime</span>
          <span>You approve every email</span>
        </div>
      </div>
    </section>
  );
}
