import { DemoBooking } from '../components/DemoBooking';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { SafetyPromises, SampleAudit } from '../marketing/TrustSections';
import { useDocumentMeta } from '../marketing/seo';

/** HOW IT WORKS — /how-it-works. Static, plain-language walk-through. */

const STEPS = [
  {
    title: 'You pick the market',
    text: 'Choose industries and cities — for example "dentists in Chennai" or "real-estate agents in Dubai". India metros are covered first; any city worldwide works.',
  },
  {
    title: 'It finds real businesses',
    text: 'Shailog AI searches the web and Google Maps for matching businesses. Directories, listing sites and competitors of yours are rejected automatically.',
  },
  {
    title: 'AI reads each website',
    text: 'For every business it reads the site and writes a short audit: speed, mobile, Google visibility, contact options and content. It gives a 0–100 potential score — how much that business could gain.',
  },
  {
    title: 'It finds the contact',
    text: 'Email and phone come from the business’s own site and Google Maps, with optional Apollo or Scalelist lookups if you add those keys. If there is no real email, it does not invent one.',
  },
  {
    title: 'It drafts the email',
    text: 'A short, personal cold email that points to the specific gaps on that business’s site — not a generic template.',
  },
  {
    title: 'You approve, it sends',
    text: 'You read each draft and press Approve. It sends from your own mailbox, with an unsubscribe link. Replies come to your normal inbox.',
  },
  {
    title: 'You get a daily report',
    text: 'Every evening at 8 PM IST you get a summary of new leads, drafts and sends. Agencies can run separate workspaces per client.',
  },
];

const SOON = [
  'Sending caps, mailbox rotation and warmup via WarmPulse',
  'A reply inbox inside the app',
  'Follow-up sequences',
  'WhatsApp and LinkedIn assisted steps',
];

export function HowItWorksPage() {
  useDocumentMeta('/how-it-works');
  return (
    <MarketingLayout>
      <section className="lp-section mk-section mk-page-head">
        <h1>How Shailog AI works</h1>
        <p className="lp-section-sub">
          Seven plain steps from “which market?” to an email in your prospect’s inbox. You stay in control of the only
          step that matters: what gets sent.
        </p>
        <ol className="mk-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="mk-step-num" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h2 className="mk-h3">{s.title}</h2>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mk-card mk-soon">
          <h2 className="mk-h3">Coming soon</h2>
          <ul className="mk-list">
            {SOON.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mk-fine">
            Shailog AI reads replies, sorts them and suggests an answer — but it never answers a prospect by itself. You approve every answer before it goes out.
          </p>
        </div>
      </section>

      <SampleAudit />
      <SafetyPromises />
      <DemoBooking />
    </MarketingLayout>
  );
}
