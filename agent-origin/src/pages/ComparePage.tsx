import { DemoBooking } from '../components/DemoBooking';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { SampleAudit } from '../marketing/TrustSections';
import { useDocumentMeta } from '../marketing/seo';

/**
 * COMPARE — honest "X alternative" pages. Rules for editing this file:
 * describe competitors only in general, publicly visible terms, say where
 * THEY are the better choice, and never quote their prices or numbers we
 * can't verify. Mark our "coming soon" items as such.
 */

type Row = { need: string; us: string; them: string };

interface Comparison {
  path: '/compare/apollo-alternative' | '/compare/leadsgorilla-alternative';
  name: string;
  h1: string;
  intro: string;
  rows: Row[];
  chooseThem: string[];
  chooseUs: string[];
}

const COMPARISONS: Record<'apollo' | 'leadsgorilla', Comparison> = {
  apollo: {
    path: '/compare/apollo-alternative',
    name: 'Apollo',
    h1: 'Shailog AI vs Apollo: an honest Apollo alternative',
    intro:
      'Apollo is a large B2B contact database with built-in email sequences — great when you know the job titles you want at mid-size and large companies. Shailog AI solves a different problem: finding local and small businesses whose website is holding them back, and telling you exactly what to pitch.',
    rows: [
      {
        need: 'Where leads come from',
        us: 'Live web and Google Maps search by industry × city, every cycle',
        them: 'A large pre-built database of companies and people',
      },
      {
        need: 'Why this lead?',
        us: 'AI reads each website and writes a gap audit with a 0–100 potential score',
        them: 'Filters on firmographics such as size, industry, title',
      },
      {
        need: 'Email copy',
        us: 'Drafted per lead, citing that business’s specific website flaws',
        them: 'Templates and AI assist; personalisation is up to you',
      },
      {
        need: 'Sending',
        us: 'Only after you approve each email, from your own mailbox',
        them: 'Automated sequences from connected mailboxes',
      },
      {
        need: 'Small local businesses in India',
        us: 'Built for it — India metros first (Chennai, Bengaluru, Mumbai …)',
        them: 'Coverage is stronger for larger, Western companies',
      },
      {
        need: 'Use Apollo inside Shailog AI',
        us: 'Yes — optional: add your own Apollo key for extra contact lookups',
        them: '—',
      },
    ],
    chooseThem: [
      'You sell to named roles (e.g. "CFOs at 200–1,000 person SaaS companies").',
      'You need millions of contacts and advanced filters.',
      'You want fully automated multi-step sequences today.',
    ],
    chooseUs: [
      'You sell websites, SEO, marketing or software to small and local businesses.',
      'You want each email to point at a real, specific problem on the prospect’s site.',
      'You want a person to approve every email before it goes out.',
    ],
  },
  leadsgorilla: {
    path: '/compare/leadsgorilla-alternative',
    name: 'LeadsGorilla',
    h1: 'Shailog AI vs LeadsGorilla: an honest LeadsGorilla alternative',
    intro:
      'LeadsGorilla and Shailog AI both help agencies find local businesses with a weak online presence. The difference is what happens next: Shailog AI has an AI read every website, write a plain-language gap audit, and draft an email citing those exact gaps — which you approve before it sends.',
    rows: [
      {
        need: 'Finding local businesses',
        us: 'Industry × city search across the web and Google Maps',
        them: 'Local business search based on listings data',
      },
      {
        need: 'Website analysis',
        us: 'AI reads the site: speed, mobile, SEO, contact options, content — scored 0–100',
        them: 'Checks for common gaps in online presence',
      },
      {
        need: 'Junk filtering',
        us: 'Directories, listing sites and competitors rejected automatically',
        them: 'Not a focus — usually reviewed by hand',
      },
      {
        need: 'Email',
        us: 'AI drafts a short email per lead citing its specific flaws; you approve; sends from your mailbox',
        them: 'Email templates you send yourself',
      },
      {
        need: 'Unsubscribe + suppression',
        us: 'On every email, automatic',
        them: 'Depends on the email tool you send from',
      },
      {
        need: 'Daily summary',
        us: 'Report every evening at 8 PM IST',
        them: '—',
      },
    ],
    chooseThem: [
      'You only need a list of local businesses and will write every email yourself.',
      'You prefer a simple lead finder you run on demand.',
    ],
    chooseUs: [
      'You want the audit and the first email written for you, per lead.',
      'You want sending, unsubscribe and suppression handled safely in one place.',
      'You target Indian cities and want results tuned for them.',
    ],
  },
};

export function ComparePage({ which }: { which: 'apollo' | 'leadsgorilla' }) {
  const c = COMPARISONS[which];
  useDocumentMeta(c.path);

  return (
    <MarketingLayout>
      <section className="lp-section mk-section mk-page-head">
        <h1>{c.h1}</h1>
        <p className="lp-section-sub">{c.intro}</p>

        <table className="mk-table mk-compare">
          <thead>
            <tr>
              <th scope="col">What you need</th>
              <th scope="col">Shailog AI</th>
              <th scope="col">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.need}>
                <th scope="row">{r.need}</th>
                <td>{r.us}</td>
                <td>{r.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mk-fine">
          Based on {c.name}’s public website as we understand it on 2026-11-06; features change, so check their site.
          {' '}
          {c.name} is a trademark of its owner. We are not affiliated with them. Spotted a mistake? Email
          shailog@gmail.com and we’ll fix it.
        </p>

        <div className="mk-grid-2 mk-gap-top">
          <article className="mk-card">
            <h2 className="mk-h3">Choose {c.name} if…</h2>
            <ul className="mk-list">
              {c.chooseThem.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </article>
          <article className="mk-card mk-card-accent">
            <h2 className="mk-h3">Choose Shailog AI if…</h2>
            <ul className="mk-list">
              {c.chooseUs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </article>
        </div>

        <p className="mk-fine mk-gap-top">
          Honest note: Shailog AI does not reply to prospects for you. Sending caps, mailbox rotation, WarmPulse warmup,
          a reply inbox and follow-up sequences are coming soon. See <a href="/pricing">pricing</a>.
        </p>
      </section>

      <SampleAudit />
      <DemoBooking />
    </MarketingLayout>
  );
}
