/**
 * Privacy Policy.
 *
 * Surfaces the data-handling commitments referenced from Google's OAuth
 * consent screen. The copy is plain and intentionally short — Google's
 * verification reviewer needs to confirm: what data we touch, why, who we
 * share it with, and how to ask for deletion.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-text-dim">Last updated: 2026-04-26</p>

      <Section title="What we collect">
        WarmPulse stores: your account email, a hashed password (only if you
        signed up with email/password), the OAuth refresh tokens for the
        mailboxes you connect, your warmup activity logs (subjects and
        timestamps — never message bodies you compose for real outreach),
        and aggregate engagement metrics (opens, replies, spam-rescues).
        Mailbox credentials are encrypted at rest using Fernet (AES-128-CBC
        + HMAC-SHA256) before they touch the database.
      </Section>

      <Section title="Why we use Gmail / Outlook scopes">
        We only request scopes needed for warmup: SMTP send, IMAP read,
        and label / important / spam-folder modification on your own
        mailbox. We never read messages outside the warmup threads we
        ourselves create (subject prefix <code>[wp]</code>), and we never
        forward, store, or transmit your real correspondence anywhere.
      </Section>

      <Section title="Limited Use of Google user data">
        WarmPulse's use and transfer to any other app of information received
        from Google APIs will adhere to the{' '}
        <a
          className="text-accent underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We use Gmail data solely to
        provide the user-facing warmup features described above; we do not
        transfer it to others except as needed to provide or improve those
        features, comply with law, or as part of a merger; we do not use it for
        advertising; and no humans read it except with your explicit consent,
        for security, or as required by law.
      </Section>

      <Section title="How we share data">
        We don't sell or rent personal data. We share data only with
        sub-processors strictly required to operate the service: our cloud
        host (Hostinger), our database (PostgreSQL on the same VPS), and
        the LLM providers we call to generate warmup content (Gemini or
        Google Gemini, depending on configuration). Aggregate, anonymized
        analytics may be shared in marketing material — never tied to you.
      </Section>

      <Section title="Retention &amp; deletion">
        Mailbox credentials and refresh tokens are deleted immediately
        when you disconnect a mailbox or delete your account. Activity
        logs older than 13 months are purged on a rolling basis. Email{' '}
        <a className="text-accent underline" href="mailto:privacy@warmpulse.tech">
          privacy@warmpulse.tech
        </a>{' '}
        for an export or full-account deletion request — we respond within
        7 days.
      </Section>

      <Section title="Children">
        WarmPulse is a B2B product and isn't directed at anyone under 16.
      </Section>

      <Section title="Updates">
        Material changes will appear on this page with an updated
        timestamp. Continued use after a change constitutes acceptance.
      </Section>
    </div>
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
