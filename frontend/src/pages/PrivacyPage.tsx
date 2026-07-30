/**
 * Privacy Policy.
 *
 * Surfaces the data-handling commitments referenced from Google's OAuth
 * consent screen. The copy is plain and intentionally short — Google's
 * verification reviewer needs to confirm: what data we touch, why, who we
 * share it with, and how to ask for deletion.
 *
 * These pages force a dark background regardless of the active theme, so
 * they use explicit light text colors (not theme tokens, which flip in
 * light mode and would render near-invisible here).
 */
export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-300">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <a
          href="/"
          className="text-sm text-accent underline underline-offset-4 hover:text-accent/80"
        >
          ← Back to WarmPulse
        </a>

        <header className="mt-6 border-b border-white/10 pb-6">
          <h1 className="text-3xl font-semibold text-white">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-400">Last updated: 2026-07-30</p>
        </header>

        <Section title="What we collect">
          WarmPulse stores: your account email, a hashed password (only if you
          signed up with email/password), the OAuth refresh tokens for the
          mailboxes you connect, your warmup activity logs (subjects and
          timestamps — never message bodies you compose for real outreach),
          and aggregate engagement metrics (opens, replies, spam-rescues).
          Mailbox credentials are encrypted at rest using Fernet (AES-128-CBC
          + HMAC-SHA256) before they touch the database.
        </Section>

        <Section title="Why we use the Gmail scope (gmail.send)">
          When you connect a Gmail mailbox, WarmPulse requests a single,
          narrow Gmail scope:{' '}
          <code>https://www.googleapis.com/auth/gmail.send</code>. This lets
          us — and only ever this — send the automated warmup messages that
          build your sender reputation, delivered from your address to
          WarmPulse&apos;s own network of consenting warmup inboxes. We do{' '}
          <strong>not</strong> request read, modify, or delete access to your
          mailbox. We cannot open, read, label, move, or delete any message in
          your inbox, and we never read, forward, store, or transmit your real
          correspondence anywhere. Inbox-engagement steps (opens, replies,
          spam-rescues) happen entirely on WarmPulse&apos;s own warmup inboxes,
          not on yours.
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
          features, comply with law, or as part of a merger; we do not use it
          for advertising; and no humans read it except with your explicit
          consent, for security, or as required by law.
        </Section>

        <Section title="How we protect your data">
          Security procedures are in place to protect the confidentiality of
          your data. All traffic between your browser, our servers, and Google
          is encrypted in transit using TLS (HTTPS). Sensitive data —
          your Gmail OAuth refresh tokens, SMTP / IMAP passwords, and 2FA
          secrets — is encrypted at rest using Fernet (AES-128-CBC with
          HMAC-SHA256 authentication) before it is written to the database;
          the encryption keys are held only in server-side environment
          configuration, never in the database alongside the ciphertext.
          Plaintext credentials exist only transiently in server memory for
          the duration of a single send and are explicitly overwritten and
          discarded immediately afterward. Access to production systems is
          restricted to authorized personnel, every workspace&apos;s data is
          isolated from every other, and administrative and destructive
          actions are recorded in an append-only audit log.
        </Section>

        <Section title="How we share data">
          We don't sell or rent personal data. We share data only with
          sub-processors strictly required to operate the service: our cloud
          host (Hostinger), our database (PostgreSQL on the same VPS), and
          the LLM provider we call to generate warmup message content (Google
          Gemini or Anthropic Claude, depending on configuration). We never
          send your Gmail data to these providers — only prompts that generate
          generic warmup copy. Aggregate, anonymized
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
      <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      <p className="mt-3 text-sm leading-7 text-gray-300">{props.children}</p>
    </section>
  );
}
