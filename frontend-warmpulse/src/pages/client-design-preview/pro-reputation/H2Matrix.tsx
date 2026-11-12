import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Grid3x3, KeyRound, ShieldCheck, Sparkles, TrendingDown } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { getMailboxHealth, type Tone } from './shared';

/**
 * H2 — Health Matrix.
 * 5 mailboxes × 6 signals. Each cell is a colored health chip.
 */

type Signal = 'warmth' | 'spf' | 'dkim' | 'dmarc' | 'auth' | 'bounce';

const SIGNALS: Array<{ key: Signal; label: string; Icon: typeof Sparkles }> = [
  { key: 'warmth', label: 'Warmth', Icon: Sparkles },
  { key: 'spf', label: 'SPF', Icon: ShieldCheck },
  { key: 'dkim', label: 'DKIM', Icon: ShieldCheck },
  { key: 'dmarc', label: 'DMARC', Icon: ShieldCheck },
  { key: 'auth', label: 'Auth', Icon: KeyRound },
  { key: 'bounce', label: 'Bounce', Icon: TrendingDown },
];

interface Selected {
  mailboxId: string;
  signal: Signal;
}

function signalScore(mb: ReturnType<typeof getMailboxHealth>, signal: Signal): { value: number; tone: Tone; text: string } {
  const m = mb.mailbox;
  if (signal === 'warmth') return { value: m.warmth, tone: m.warmth >= 80 ? 'success' : m.warmth >= 50 ? 'warning' : 'danger', text: `${m.warmth}/100` };
  if (signal === 'spf') return { value: m.spfOk ? 100 : 0, tone: m.spfOk ? 'success' : 'danger', text: m.spfOk ? 'Valid' : 'Missing' };
  if (signal === 'dkim') return { value: m.dkimOk ? 100 : 0, tone: m.dkimOk ? 'success' : 'danger', text: m.dkimOk ? 'Valid' : 'Missing' };
  if (signal === 'dmarc') return { value: m.dmarcOk ? 100 : 0, tone: m.dmarcOk ? 'success' : 'danger', text: m.dmarcOk ? 'Valid' : 'Missing' };
  if (signal === 'auth') return { value: mb.auth, tone: mb.auth === 100 ? 'success' : 'warning', text: mb.auth === 100 ? 'OAuth' : 'SMTP' };
  // bounce — synthesize from index
  const bounce = m.status === 'paused' ? 4.2 : m.warmth >= 80 ? 0.3 : 1.4;
  return { value: 100 - Math.min(100, bounce * 20), tone: bounce <= 1 ? 'success' : bounce <= 3 ? 'warning' : 'danger', text: `${bounce}%` };
}

export function H2Matrix() {
  const health = DEMO_MAILBOXES.map(getMailboxHealth);
  const [sel, setSel] = useState<Selected>({ mailboxId: health[0]!.mailbox.id, signal: 'warmth' });

  const selHealth = health.find((h) => h.mailbox.id === sel.mailboxId) ?? health[0]!;
  const selSignal = SIGNALS.find((s) => s.key === sel.signal) ?? SIGNALS[0]!;
  const selScore = signalScore(selHealth, sel.signal);

  return (
    <div className="h2">
      <header className="h2__head">
        <span className="h2-eyebrow">
          <Grid3x3 size={11} strokeWidth={2.4} />
          Health matrix · {DEMO_MAILBOXES.length} × {SIGNALS.length}
        </span>
        <div className="h2__head-counts">
          {(['success', 'warning', 'danger'] as Tone[]).map((t) => {
            const count = health.reduce((s, h) =>
              s + SIGNALS.filter((sg) => signalScore(h, sg.key).tone === t).length, 0,
            );
            return (
              <span key={t} className={`h2__head-chip h2__head-chip--${t}`}>
                <span className={`h2__head-dot h2__head-dot--${t}`} />
                {count} {t === 'success' ? 'healthy' : t === 'warning' ? 'watch' : 'action'}
              </span>
            );
          })}
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
          {health.map((h, i) => (
            <motion.div
              key={h.mailbox.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="h2__matrix-row"
            >
              <div className="h2__matrix-row-head">
                <ProviderSwatch provider={h.mailbox.provider} size={22} />
                <span className="h2__matrix-row-email">{h.mailbox.email.split('@')[0]}</span>
                <span className={`h2__matrix-row-score h2__matrix-row-score--${h.tone}`}>{h.composite}</span>
              </div>
              {SIGNALS.map((s) => {
                const score = signalScore(h, s.key);
                const isSel = sel.mailboxId === h.mailbox.id && sel.signal === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSel({ mailboxId: h.mailbox.id, signal: s.key })}
                    onMouseEnter={() => setSel({ mailboxId: h.mailbox.id, signal: s.key })}
                    className={`h2__cell h2__cell--${score.tone} ${isSel ? 'h2__cell--sel' : ''}`}
                    title={`${h.mailbox.email.split('@')[0]} · ${s.label}: ${score.text}`}
                  >
                    {score.text}
                  </button>
                );
              })}
            </motion.div>
          ))}
        </section>

        {/* Selected cell drill-in */}
        <aside className="h2__detail">
          <header className="h2__detail-head">
            <span className="h2__detail-eyebrow">Selected signal</span>
            <span className={`h2__detail-tone h2__detail-tone--${selScore.tone}`}>
              <span className={`h2__detail-tone-dot h2__detail-tone-dot--${selScore.tone}`} />
              {selScore.tone === 'success' ? 'Healthy' : selScore.tone === 'warning' ? 'Watch' : 'Action'}
            </span>
          </header>

          <div className="h2__detail-id">
            <ProviderSwatch provider={selHealth.mailbox.provider} size={34} />
            <div>
              <span className="h2__detail-email">{selHealth.mailbox.email}</span>
              <span className="h2__detail-sub">{providerLabel(selHealth.mailbox.provider)} · Day {selHealth.mailbox.day}</span>
            </div>
          </div>

          <div className="h2__detail-signal">
            <span className="h2__detail-signal-lbl">
              <selSignal.Icon size={12} strokeWidth={2.4} />
              {selSignal.label}
            </span>
            <span className="h2__detail-signal-val">{selScore.text}</span>
          </div>

          <div className="h2__detail-context">
            <p>{contextFor(sel.signal, selScore.tone)}</p>
          </div>

          <footer className="h2__detail-foot">
            <span><Activity size={10} strokeWidth={2.4} /> Composite</span>
            <strong className={`h2__detail-composite h2__detail-composite--${selHealth.tone}`}>
              {selHealth.composite}<span>/100</span>
            </strong>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function contextFor(signal: Signal, tone: Tone): string {
  if (tone === 'success') {
    if (signal === 'warmth') return 'Warmth score is in the inbox-safe band. Continue current send pattern.';
    if (signal === 'spf' || signal === 'dkim' || signal === 'dmarc') return `${signal.toUpperCase()} record is published and validating. No action required.`;
    if (signal === 'auth') return 'OAuth authentication is configured — tokens rotate automatically.';
    return 'Bounce rate is well below the ESP-safe band.';
  }
  if (tone === 'warning') {
    if (signal === 'warmth') return 'Warmth is still building. The engine will keep ramping; no action needed.';
    if (signal === 'auth') return 'Generic SMTP is in use. OAuth would score higher because tokens rotate without exposing your password.';
    return 'Signal is borderline. Watch over the next few days.';
  }
  if (signal === 'warmth') return 'Warmth is low. Check that the engine is sending and peer IMAP polling is working.';
  if (signal === 'spf' || signal === 'dkim' || signal === 'dmarc') return `${signal.toUpperCase()} record is missing. Inbox providers will deprioritise — publish the record from your DNS host.`;
  return 'Bounce rate exceeds the ESP-safe band. Pause this mailbox and audit recipient hygiene.';
}
