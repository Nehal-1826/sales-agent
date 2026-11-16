import type { ReactNode } from 'react';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { COMPANY, LAST_UPDATED } from '../marketing/site';
import { useDocumentMeta } from '../marketing/seo';

/**
 * PRIVACY + TERMS — plain-language TEMPLATES. They have NOT been reviewed by
 * a lawyer. Have Indian counsel review both before relying on them, and
 * update LAST_UPDATED (src/marketing/site.ts) whenever the text changes.
 */

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MarketingLayout>
      <article className="lp-section mk-section mk-legal">
        <h1>{title}</h1>
        <p className="mk-muted">Last updated {LAST_UPDATED}</p>
        {children}
        <h2>Contact</h2>
        <p>
          {COMPANY.name}, {COMPANY.city}, {COMPANY.region}, India ·{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> · {COMPANY.phone}
        </p>
      </article>
    </MarketingLayout>
  );
}

export function PrivacyPage() {
  useDocumentMeta('/privacy');
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy explains how {COMPANY.name} (“we”, “us”), based in {COMPANY.city}, {COMPANY.region}, India, handles
        personal data in {COMPANY.product} (the “Service”) and on this website. We follow India’s Digital Personal Data
        Protection Act, 2023 (“DPDP Act”) and, where it applies, the EU/UK GDPR.
      </p>

      <h2>1. Who this covers</h2>
      <ul>
        <li>
          <b>Customers</b> — people who sign up for or use the Service.
        </li>
        <li>
          <b>Prospects</b> — business contacts that our customers find and may email using the Service.
        </li>
        <li>
          <b>Visitors</b> — people who browse this website or contact us.
        </li>
      </ul>

      <h2>2. What we collect</h2>
      <ul>
        <li>Customer account data: name, work email, company, login details, settings and billing contact.</li>
        <li>
          Prospect business data from public sources: business name, website, public business email and phone, city,
          industry, and an audit of the public website. We aim to collect business contact details, not private or
          sensitive personal data.
        </li>
        <li>Email activity: drafts, approval and send status, unsubscribes and the suppression list.</li>
        <li>Website and support messages you send us, and basic technical logs (IP address, browser, timestamps).</li>
      </ul>

      <h2>3. Why we use it (legal basis)</h2>
      <ul>
        <li>To provide the Service you asked for (contract).</li>
        <li>
          Prospect data: for business-to-business outreach under <b>legitimate interest</b> (GDPR Art. 6(1)(f)) and, in
          India, for purposes permitted under the DPDP Act for publicly available data. Every email offers a one-click
          way to opt out.
        </li>
        <li>To keep the Service secure, prevent abuse and meet legal obligations.</li>
      </ul>

      <h2>4. Roles</h2>
      <p>
        For prospect data, our customer decides whom to contact and what to send, and acts as the data fiduciary /
        controller. We act as their data processor and follow their instructions. For customer account data, we are
        the data fiduciary / controller.
      </p>

      <h2>5. Unsubscribe and suppression</h2>
      <p>
        Every email sent through the Service includes an unsubscribe link and one-click unsubscribe headers. When
        someone unsubscribes, their address is added to a suppression list and the Service blocks further emails to
        it from that workspace. To opt out of all outreach sent through the Service, email{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
      </p>

      <h2>6. Sharing</h2>
      <p>
        We do not sell personal data. We share it only with service providers that help run the Service (for example
        hosting, the customer’s own email provider, AI model providers the customer configures, and optional
        data-enrichment providers such as Apollo or Scalelist when the customer enables them), or when the law
        requires.
      </p>

      <h2>7. Where data is stored and for how long</h2>
      <p>
        Data may be processed in India and other countries where our providers operate, with appropriate safeguards.
        We keep customer data while the account is active and delete or anonymise it within a reasonable period after
        the account closes. Suppression entries are kept so the opt-out keeps working.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Under the DPDP Act and GDPR you may ask to access, correct or erase your personal data, withdraw consent,
        object to processing, or nominate someone to act for you. Email{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>; we will respond within the time the law requires. You
        may also complain to the Data Protection Board of India or, in the EU/UK, your local supervisory authority.
      </p>

      <h2>9. Security</h2>
      <p>
        We use access controls, encryption in transit and separation between customer workspaces. No system is
        perfectly secure; we will notify affected people and authorities of a personal data breach as the law
        requires.
      </p>

      <h2>10. Grievance officer</h2>
      <p>
        For privacy questions or grievances, contact our grievance officer at{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
      </p>

      <h2>11. Changes</h2>
      <p>We will update the date above when this policy changes and tell customers of significant changes.</p>
    </LegalShell>
  );
}

export function TermsPage() {
  useDocumentMeta('/terms');
  return (
    <LegalShell title="Terms of Service">
      <p>
        These terms are an agreement between you (the customer) and {COMPANY.name}, {COMPANY.city}, {COMPANY.region},
        India, for use of {COMPANY.product} (the “Service”). By using the Service you accept these terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        The Service finds businesses, audits their public websites, finds public business contact details and drafts
        emails. Emails are sent only when you approve them, from a mailbox you connect. Features marked “coming soon”
        are not part of the Service until released.
      </p>

      <h2>2. Your responsibilities</h2>
      <ul>
        <li>You decide whom to contact and you approve every email. You are responsible for its content.</li>
        <li>
          You will follow anti-spam and privacy laws that apply to you and your recipients, including the U.S.
          CAN-SPAM Act (truthful sender and subject, a valid postal address, honouring opt-outs promptly), the DPDP Act
          2023, GDPR / PECR where applicable, and the Information Technology Act, 2000.
        </li>
        <li>You will keep a valid business postal address in your email settings.</li>
        <li>You will not remove or hide the unsubscribe link, or email anyone on the suppression list.</li>
        <li>You will keep your login secure and tell us about any unauthorised use.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>
        Do not use the Service for consumer (B2C) spam, illegal products, phishing, harassment, misleading claims, or to
        contact people who have opted out. We may suspend accounts that create complaints, harm sending reputation or
        break these terms.
      </p>

      <h2>4. Plans, billing and the pilot</h2>
      <ul>
        <li>Paid plans are billed monthly or yearly in advance, as shown on the pricing page. Taxes (such as GST) are extra where applicable.</li>
        <li>You can cancel any time; the plan runs until the end of the paid period. Fees already paid are not refunded except as stated below or required by law.</li>
        <li>
          Pilot refund: if the 14-day pilot does not produce 5 positive replies or 2 booked calls, we refund the pilot
          fee when you ask within 7 days after the pilot ends.
        </li>
        <li>Founding-customer pricing stays fixed while your subscription remains active without a break.</li>
      </ul>

      <h2>5. Data</h2>
      <p>
        You own your data. We process it to run the Service as described in our <a href="/privacy">Privacy Policy</a>.
        You can export or ask us to delete it.
      </p>

      <h2>6. Third-party services</h2>
      <p>
        The Service can connect to your email provider, AI model providers and optional data providers. Their own
        terms apply to them and we are not responsible for their availability.
      </p>

      <h2>7. No guarantee of results</h2>
      <p>
        AI audits and drafts can contain mistakes — please read each draft before approving. Apart from the pilot
        refund, we do not guarantee replies, meetings or sales.
      </p>

      <h2>8. Liability</h2>
      <p>
        The Service is provided “as is”. To the extent the law allows, our total liability for any claim is limited to
        the fees you paid us in the 3 months before the claim, and we are not liable for indirect or consequential loss.
      </p>

      <h2>9. Ending the agreement</h2>
      <p>You may stop using the Service at any time. We may end or suspend access for breach of these terms.</p>

      <h2>10. Law and courts</h2>
      <p>These terms are governed by the laws of India. Courts in {COMPANY.city}, {COMPANY.region} have jurisdiction.</p>
    </LegalShell>
  );
}
