/**
 * Terms of Service.
 *
 * Pairs with PrivacyPage. Required for Google OAuth verification — the
 * consent screen must link to a publicly reachable Terms page on the same
 * verified domain as the redirect URIs.
 */
export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-text-dim">Last updated: 2026-04-26</p>

      <Section title="Service">
        WarmPulse warms up email addresses by sending and reciprocating
        low-volume conversational mail with a peer network of inboxes
        WarmPulse operates. The goal is to improve sender reputation with
        major mailbox providers (Gmail, Outlook, Yahoo).
      </Section>

      <Section title="Acceptable use">
        You may only connect mailboxes you own or are authorized to
        operate. WarmPulse is not a bulk-sender, a phishing tool, or a
        spam appliance — using it to circumvent ESP rate limits, bypass
        complaints, or impersonate another sender will result in
        immediate suspension and may be reported to the relevant
        provider. We reserve the right to terminate accounts that abuse
        the peer network or attempt to extract its inboxes.
      </Section>

      <Section title="Plans &amp; billing">
        Plans are described on the pricing page and may change with 30
        days' notice. Subscriptions renew automatically; cancel at any
        time from the Billing page — access continues until the end of
        the paid period. Refunds are issued at our discretion for
        material outages.
      </Section>

      <Section title="No warranty">
        WarmPulse improves reputation signals but does not guarantee inbox
        placement. Mailbox providers run their own classifiers and reserve
        the right to send any message anywhere. The service is provided
        "as is" without warranty of any kind.
      </Section>

      <Section title="Liability">
        To the fullest extent permitted by law, our aggregate liability
        for any claim arising from the service is limited to the amount
        you paid in the 12 months preceding the claim.
      </Section>

      <Section title="Contact">
        Questions about these terms?{' '}
        <a className="text-accent underline" href="mailto:hello@warmpulse.tech">
          hello@warmpulse.app
        </a>
        .
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <p className="mt-3 text-sm leading-6 text-text-dim">{props.children}</p>
    </section>
  );
}
