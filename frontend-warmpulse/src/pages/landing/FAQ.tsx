import { motion } from 'framer-motion';
import {
  AppAccordion,
  AppAccordionItem,
  AppAccordionTrigger,
  AppAccordionContent,
} from '@/components/ui/AppAccordion';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is email warmup and why do I need it?',
    a: 'Email warmup is the process of gradually building a sending reputation on a new domain or mailbox so ESPs (Gmail, Outlook, Yahoo) learn to trust your mail. Without it, cold emails from a fresh domain land in Promotions or Spam. Warmup simulates the engagement patterns of a legitimate inbox — sends, opens, replies, stars, Spam rescues — until the ESP treats you as trustworthy.',
  },
  {
    q: 'How does WarmPulse differ from Warmbox / Mailwarm / Instantly?',
    a: 'Most competitors run small pools of scripted inboxes that ESPs have long since fingerprinted. WarmPulse runs a network of over 1,000 real Google Workspace, Office 365, and Yahoo accounts that send, open, reply, and rescue from Spam on human timing (30s–5min delays). We also cover the inbound cycle — most tools only do outbound — and ESPs score bidirectional engagement.',
  },
  {
    q: 'Will warmup emails hurt my sender reputation?',
    a: 'The opposite — that is the whole point. Legitimate engagement is the single strongest positive reputation signal. We monitor your Postmaster Tools, SNDS, and blacklist status in real time and pause automatically if anything regresses, so warmup never pushes you into a worse state.',
  },
  {
    q: 'Which inbox providers do you support?',
    a: 'Google Workspace and Gmail (OAuth), Microsoft 365 and Outlook.com (OAuth), and custom SMTP/IMAP for domains on providers like Zoho, Fastmail, or self-hosted Postfix. Yahoo is supported on the peer-network side. App-password or OAuth — your choice.',
  },
  {
    q: "What's the peer inbox network?",
    a: 'It is our moat. We operate 1,000+ real mailboxes across Google Workspace, O365, and Yahoo — with real histories, real contacts, and real engagement patterns — and they interact with your warmup traffic. Spam rescue (moving a message from the Spam folder back to Inbox) is the highest-signal action in the network, and it is one we can only do because these are real accounts.',
  },
  {
    q: 'How long until my domain is warm?',
    a: 'Our adaptive ramp follows a safe curve: 5/day for the first 3 days, 10/day through day 7, 20/day through day 14, 35 through day 21, 50 through day 28, then 50–100/day after. Most domains reach a healthy Warmth Score (80+) in 14–21 days; new domains with zero history may need the full 30.',
  },
  {
    q: 'Is my mailbox password safe?',
    a: 'Yes. Every credential (SMTP/IMAP passwords, OAuth refresh tokens) is Fernet-encrypted with a key that lives only in environment variables on the server. Nothing is stored in plaintext and no WarmPulse staff can read your passwords. We prefer OAuth where supported so that no password is stored at all.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your billing page and warmup stops at the end of the current period — your mailbox credentials are purged from our encrypted store within 24 hours. During the beta all payments are dummy anyway, so there is no real card to refund.',
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative min-h-[60vh] w-full px-6 py-[120px]">
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            FAQ
          </span>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">
            Questions before you warm up.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-border-muted bg-surface px-6"
        >
          <AppAccordion type="single" collapsible>
            {FAQS.map((f, i) => (
              <AppAccordionItem key={f.q} value={`faq-${i}`}>
                <AppAccordionTrigger className="text-base">
                  {f.q}
                </AppAccordionTrigger>
                <AppAccordionContent className="text-sm leading-relaxed text-text-dim">
                  {f.a}
                </AppAccordionContent>
              </AppAccordionItem>
            ))}
          </AppAccordion>
        </motion.div>
      </div>
    </section>
  );
}
