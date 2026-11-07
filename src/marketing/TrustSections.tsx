import { CASE_STUDIES, TESTIMONIALS } from './proof';
import { COMPANY } from './site';

/**
 * Honest trust content. No invented customers, logos, ratings or metrics:
 * - <SafetyPromises/> states what the product really enforces.
 * - <SampleAudit/> is a clearly labelled SAMPLE for a fictional business.
 * - <Proof/> renders real case studies from proof.ts and hides when empty.
 * - <BuiltBy/> is who we are and how to reach us.
 */

const PROMISES = [
  {
    title: 'Nothing sends without your approval',
    text: 'The AI writes drafts. A person on your team reads each one and presses Approve. No approval, no email.',
  },
  {
    title: 'Your mailbox, your domain',
    text: 'Emails go out from your own mailbox, so replies come straight to your inbox and your sender name stays yours.',
  },
  {
    title: 'Unsubscribe + suppression on every email',
    text: 'Each email has a one-click unsubscribe link and headers. Anyone who opts out is blocked from future sends, permanently.',
  },
  {
    title: 'Only real businesses',
    text: 'Directories, listing sites and competitors are rejected automatically. Contacts come from the business’s own site or public listings — never guessed.',
  },
];

export function SafetyPromises() {
  return (
    <section className="lp-section mk-section" id="trust" aria-labelledby="trust-h">
      <h2 id="trust-h">Safe by design</h2>
      <p className="lp-section-sub">Plain rules the product enforces for you, on every lead and every email.</p>
      <div className="mk-grid-4">
        {PROMISES.map((p) => (
          <article className="mk-card" key={p.title}>
            <span className="mk-check" aria-hidden>
              ✓
            </span>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const SAMPLE_FINDINGS = [
  { area: 'Mobile', note: 'Appointment button is below the fold on phones; text needs zooming.' },
  { area: 'Speed', note: 'Home page loads three uncompressed photos (about 6 MB).' },
  { area: 'Google', note: 'No page title or description — shows as "Home" in search results.' },
  { area: 'Contact', note: 'No WhatsApp or click-to-call; only a contact form.' },
  { area: 'Trust', note: 'No reviews, doctor profiles or clinic timings on the site.' },
];

export function SampleAudit() {
  return (
    <section className="lp-section mk-section" aria-labelledby="sample-h">
      <h2 id="sample-h">What a website-gap audit looks like</h2>
      <p className="lp-section-sub">
        For every lead, the AI reads the website and writes a short audit with a 0–100 potential score. The higher
        the score, the more the business could gain from your help.
      </p>
      <div className="mk-audit" role="figure" aria-label="Sample website-gap audit for a fictional business">
        <div className="mk-audit-head">
          <span className="mk-sample-tag">Sample report · fictional business</span>
          <div>
            <h3>Example Dental Clinic, Chennai</h3>
            <small>example-dental-clinic.test · Dentist</small>
          </div>
          <div className="mk-score" aria-label="Potential score 78 out of 100">
            <strong>78</strong>
            <span>/ 100 potential</span>
          </div>
        </div>
        <ul className="mk-findings">
          {SAMPLE_FINDINGS.map((f) => (
            <li key={f.area}>
              <b>{f.area}</b>
              <span>{f.note}</span>
            </li>
          ))}
        </ul>
        <div className="mk-audit-draft">
          <small>Draft email opening (waiting for your approval)</small>
          <p>
            “Hi Dr. Priya — I opened your clinic’s site on my phone and the Book Appointment button only appears after
            a long scroll. On Google it also shows up simply as ‘Home’…”
          </p>
        </div>
      </div>
    </section>
  );
}

/** Real proof only — renders nothing until proof.ts has entries. */
export function Proof() {
  if (CASE_STUDIES.length === 0 && TESTIMONIALS.length === 0) return null;
  return (
    <section className="lp-section mk-section" aria-labelledby="proof-h">
      <h2 id="proof-h">Results from customers</h2>
      {CASE_STUDIES.length > 0 && (
        <div className="mk-grid-3">
          {CASE_STUDIES.map((c) => (
            <article className="mk-card" key={c.company}>
              <h3>{c.company}</h3>
              <small className="mk-muted">
                {c.industry} · {c.city} · {c.period}
              </small>
              <p>{c.summary}</p>
              <ul className="mk-list">
                {c.results.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
      {TESTIMONIALS.length > 0 && (
        <div className="mk-grid-3 mk-gap-top">
          {TESTIMONIALS.map((t) => (
            <figure className="mk-card mk-quote" key={t.name + t.company}>
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                <b>{t.name}</b> · {t.role}, {t.company}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

export function BuiltBy() {
  return (
    <section className="lp-section mk-section" aria-labelledby="built-h">
      <div className="mk-built">
        <div>
          <h2 id="built-h">
            Built in {COMPANY.city}, {COMPANY.region}
          </h2>
          <p>
            Shailog AI is made by {COMPANY.name}, a small team in {COMPANY.city}. We are early, and we say so: we set up
            every account ourselves and you can talk to the people who build it.
          </p>
        </div>
        <ul className="mk-contact-list">
          <li>
            <span>Email</span>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </li>
          <li>
            <span>Phone</span>
            <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
          </li>
          <li>
            <span>Company</span>
            <a href={COMPANY.website} target="_blank" rel="noreferrer">
              shailog.com
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
