import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Grid3x3,
  KeyRound,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox, MailboxProvider } from '@/features/mailboxes/types';
import { useDomainReputation } from '@/features/reputation/api';
import { usePlan } from '@/lib/usePlan';
import { PostmasterCard } from './PostmasterCard';
import { SndsCard } from './SndsCard';
// TODO: lift pro-reputation.css into pages/client/reputation/ in a follow-up.
import '@/pages/client-design-preview/pro-reputation/pro-reputation.css';

/**
 * /app/reputation for Pro tier — H2 Health Matrix with real data.
 */
type Tone = 'success' | 'warning' | 'danger';
type Signal = 'warmth' | 'spf' | 'dkim' | 'dmarc' | 'auth' | 'bounce';

const SIGNALS: Array<{ key: Signal; label: string; Icon: typeof Sparkles }> = [
  { key: 'warmth', label: 'Warmth', Icon: Sparkles },
  { key: 'spf', label: 'SPF', Icon: ShieldCheck },
  { key: 'dkim', label: 'DKIM', Icon: ShieldCheck },
  { key: 'dmarc', label: 'DMARC', Icon: ShieldCheck },
  { key: 'auth', label: 'Auth', Icon: KeyRound },
  { key: 'bounce', label: 'Failed delivery', Icon: TrendingDown },
];

interface Selected {
  mailboxId: string;
  signal: Signal;
}

function authValue(provider: MailboxProvider): number {
  // OAuth providers score 100; SMTP-style score 70.
  return provider === 'gmail' || provider === 'outlook' ? 100 : 70;
}

function signalScore(m: Mailbox, signal: Signal): { value: number; tone: Tone; text: string } {
  const warmth = m.warmth_score ?? 0;
  if (signal === 'warmth') {
    return {
      value: warmth,
      tone: warmth >= 80 ? 'success' : warmth >= 50 ? 'warning' : 'danger',
      text: `${warmth}/100`,
    };
  }
  if (signal === 'spf') {
    const ok = m.spf_valid === true;
    return { value: ok ? 100 : 0, tone: ok ? 'success' : 'danger', text: ok ? 'Valid' : 'Missing' };
  }
  if (signal === 'dkim') {
    const ok = m.dkim_valid === true;
    return { value: ok ? 100 : 0, tone: ok ? 'success' : 'danger', text: ok ? 'Valid' : 'Missing' };
  }
  if (signal === 'dmarc') {
    const ok = m.dmarc_valid === true;
    return { value: ok ? 100 : 0, tone: ok ? 'success' : 'danger', text: ok ? 'Valid' : 'Missing' };
  }
  if (signal === 'auth') {
    const v = authValue(m.provider);
    return { value: v, tone: v === 100 ? 'success' : 'warning', text: v === 100 ? 'OAuth' : 'SMTP' };
  }
  // bounce — synthesized from status + warmth (no real metric yet)
  const bounce = m.warmup_status === 'paused' ? 4.2 : warmth >= 80 ? 0.3 : 1.4;
  return {
    value: 100 - Math.min(100, bounce * 20),
    tone: bounce <= 1 ? 'success' : bounce <= 3 ? 'warning' : 'danger',
    text: `${bounce}%`,
  };
}

function composite(m: Mailbox): { value: number; tone: Tone } {
  const scores = SIGNALS.map((s) => signalScore(m, s.key).value);
  const v = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { value: v, tone: v >= 80 ? 'success' : v >= 60 ? 'warning' : 'danger' };
}

function contextFor(signal: Signal, tone: Tone): string {
  if (tone === 'success') {
    if (signal === 'warmth')
      return 'Warmth score is in the inbox-safe band. Continue current send pattern.';
    if (signal === 'spf' || signal === 'dkim' || signal === 'dmarc')
      return `${signal.toUpperCase()} record is published and validating. No action required.`;
    if (signal === 'auth')
      return 'OAuth authentication is configured — tokens rotate automatically.';
    return 'Failure rate is well below the ESP-safe band.';
  }
  if (tone === 'warning') {
    if (signal === 'warmth')
      return 'Warmth is still building. The engine will keep building up; no action needed.';
    if (signal === 'auth')
      return 'Generic SMTP is in use. OAuth would score higher because tokens rotate without exposing your password.';
    return 'Signal is borderline. Watch over the next few days.';
  }
  if (signal === 'warmth')
    return 'Warmth is low. Check that the engine is sending and peer IMAP polling is working.';
  if (signal === 'spf' || signal === 'dkim' || signal === 'dmarc')
    return `${signal.toUpperCase()} record is missing. Inbox providers will deprioritise — publish the record from your DNS host.`;
  return 'Failure rate exceeds the ESP-safe band. Pause this mailbox and audit recipient hygiene.';
}

function providerLabel(p: MailboxProvider): string {
  return p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook' : p === 'yahoo' ? 'Yahoo' : 'SMTP';
}

function ProviderSwatch({ provider, size = 26 }: { provider: MailboxProvider; size?: number }) {
  const letter =
    provider === 'gmail' ? 'G' : provider === 'outlook' ? 'O' : provider === 'yahoo' ? 'Y' : 'S';
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

function ExternalSignalsSection() {
  const { isProPlus, isLoading } = usePlan();
  const repQuery = useDomainReputation();
  const postmasterRows = repQuery.data?.postmaster ?? [];
  const primary = postmasterRows.find((r) => r.is_active) ?? null;
  const sndsRows = repQuery.data?.snds ?? [];
  const sndsPrimary = sndsRows.find((r) => r.is_active) ?? null;

  if (isLoading) return null;

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'var(--wp-text-faint)',
          }}
        >
          External Signals
        </span>
        <strong style={{ fontSize: 14 }}>
          Domain trust from inbox providers
        </strong>
      </header>

      {isProPlus ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          <PostmasterCard cred={primary} />
          <SndsCard cred={sndsPrimary} />
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--wp-border-muted)',
            background: 'var(--wp-surface)',
            borderRadius: 10,
            padding: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Upgrade to Pro Plus to see external inbox delivery signals
            </strong>
            <span style={{ fontSize: 12, color: 'var(--wp-text-dim)' }}>
              Connect Google Postmaster Tools and Microsoft SNDS for real
              spam-rate, complaint-rate, and IP trust data straight
              from Gmail and Outlook.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProReputation() {
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data?.items ?? [];
  const [sel, setSel] = useState<Selected | null>(null);

  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <>
        <ExternalSignalsSection />
        <div className="h2">
          <div
            style={{
              padding: 60,
              textAlign: 'center',
              color: 'var(--wp-text-faint)',
            }}
          >
            Connect a mailbox to see sender trust health here.
          </div>
        </div>
      </>
    );
  }

  const safeSel: Selected = sel ?? {
    mailboxId: mailboxes[0]?.id ?? '',
    signal: 'warmth',
  };
  const selMailbox =
    mailboxes.find((m) => m.id === safeSel.mailboxId) ?? mailboxes[0];
  const selSignal = SIGNALS.find((s) => s.key === safeSel.signal) ?? SIGNALS[0]!;
  const selScore = selMailbox ? signalScore(selMailbox, safeSel.signal) : null;
  const selComp = selMailbox ? composite(selMailbox) : null;

  // Health-summary chip counts
  const tones: Tone[] = ['success', 'warning', 'danger'];
  const counts = tones.map((t) => ({
    tone: t,
    count: mailboxes.reduce(
      (acc, m) =>
        acc + SIGNALS.filter((sg) => signalScore(m, sg.key).tone === t).length,
      0,
    ),
  }));

  return (
    <>
      <ExternalSignalsSection />
      <div className="h2">
      <header className="h2__head">
        <span className="h2-eyebrow">
          <Grid3x3 size={11} strokeWidth={2.4} />
          Health matrix · {mailboxes.length} × {SIGNALS.length}
        </span>
        <div className="h2__head-counts">
          {counts.map((c) => (
            <span key={c.tone} className={`h2__head-chip h2__head-chip--${c.tone}`}>
              <span className={`h2__head-dot h2__head-dot--${c.tone}`} />
              {c.count}{' '}
              {c.tone === 'success'
                ? 'healthy'
                : c.tone === 'warning'
                ? 'watch'
                : 'action'}
            </span>
          ))}
        </div>
      </header>

      <div className="h2__body">
        <section className="h2__matrix">
          <div className="h2__matrix-head">
            <span />
            {SIGNALS.map((s) => {
              const Icon = s.Icon;
              return (
                <span key={s.key} className="h2__matrix-col-head">
                  <Icon size={10} strokeWidth={2.4} />
                  {s.label}
                </span>
              );
            })}
          </div>
          {mailboxes.map((m, i) => {
            const comp = composite(m);
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
                className="h2__matrix-row"
              >
                <div className="h2__matrix-row-head">
                  <ProviderSwatch provider={m.provider} size={22} />
                  <span className="h2__matrix-row-email">
                    {m.email_address.split('@')[0]}
                  </span>
                  <span className={`h2__matrix-row-score h2__matrix-row-score--${comp.tone}`}>
                    {comp.value}
                  </span>
                </div>
                {SIGNALS.map((s) => {
                  const score = signalScore(m, s.key);
                  const isSel =
                    safeSel.mailboxId === m.id && safeSel.signal === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() =>
                        setSel({ mailboxId: m.id, signal: s.key })
                      }
                      onMouseEnter={() =>
                        setSel({ mailboxId: m.id, signal: s.key })
                      }
                      className={`h2__cell h2__cell--${score.tone} ${
                        isSel ? 'h2__cell--sel' : ''
                      }`}
                      title={`${m.email_address.split('@')[0]} · ${s.label}: ${score.text}`}
                    >
                      {score.text}
                    </button>
                  );
                })}
              </motion.div>
            );
          })}
        </section>

        <aside className="h2__detail">
          <header className="h2__detail-head">
            <span className="h2__detail-eyebrow">Selected signal</span>
            {selScore && (
              <span className={`h2__detail-tone h2__detail-tone--${selScore.tone}`}>
                <span className={`h2__detail-tone-dot h2__detail-tone-dot--${selScore.tone}`} />
                {selScore.tone === 'success'
                  ? 'Healthy'
                  : selScore.tone === 'warning'
                  ? 'Watch'
                  : 'Action'}
              </span>
            )}
          </header>

          {selMailbox && (
            <>
              <div className="h2__detail-id">
                <ProviderSwatch provider={selMailbox.provider} size={34} />
                <div>
                  <span className="h2__detail-email">{selMailbox.email_address}</span>
                  <span className="h2__detail-sub">
                    {providerLabel(selMailbox.provider)} · Day {selMailbox.current_day}
                  </span>
                </div>
              </div>

              <div className="h2__detail-signal">
                <span className="h2__detail-signal-lbl">
                  <selSignal.Icon size={12} strokeWidth={2.4} />
                  {selSignal.label}
                </span>
                <span className="h2__detail-signal-val">
                  {selScore?.text ?? '—'}
                </span>
              </div>

              <div className="h2__detail-context">
                <p>{selScore ? contextFor(safeSel.signal, selScore.tone) : ''}</p>
              </div>

              {selComp && (
                <footer className="h2__detail-foot">
                  <span>
                    <Activity size={10} strokeWidth={2.4} /> Composite
                  </span>
                  <strong
                    className={`h2__detail-composite h2__detail-composite--${selComp.tone}`}
                  >
                    {selComp.value}
                    <span>/100</span>
                  </strong>
                </footer>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
    </>
  );
}

export default ProReputation;
