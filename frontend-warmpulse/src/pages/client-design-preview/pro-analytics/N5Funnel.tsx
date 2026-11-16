import { motion } from 'framer-motion';
import { ChevronDown, ListFilter as Funnel } from 'lucide-react';
import { DEMO_AGGREGATE, DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';

/**
 * N5 — Deliverability Funnel.
 * Big top-down funnel: Sent → Delivered → Inbox → Opened → Replied.
 * Per-mailbox cohort table below.
 */
export function N5Funnel() {
  const sent = DEMO_AGGREGATE.totalSentToday;
  const delivered = sent - DEMO_AGGREGATE.bouncesToday;
  const inbox = Math.round(delivered * 0.87);
  const opened = DEMO_AGGREGATE.opensToday;
  const replied = DEMO_AGGREGATE.repliesToday;

  const steps = [
    { lbl: 'Sent', val: sent, pct: 100, tone: 'violet-soft' },
    { lbl: 'Delivered', val: delivered, pct: Math.round((delivered / sent) * 100), tone: 'violet' },
    { lbl: 'Reached inbox', val: inbox, pct: Math.round((inbox / sent) * 100), tone: 'success' },
    { lbl: 'Opened', val: opened, pct: Math.round((opened / sent) * 100), tone: 'success' },
    { lbl: 'Replied', val: replied, pct: Math.round((replied / sent) * 100), tone: 'warning' },
  ];

  return (
    <div className="n5">
      <header className="n5__head">
        <span className="n5-eyebrow"><Funnel size={11} strokeWidth={2.4} />Deliverability funnel · today</span>
        <span className="n5__head-meta">{sent} → {replied} conversions</span>
      </header>

      {/* Funnel */}
      <div className="n5__funnel">
        {steps.map((s, i) => {
          const width = 100 - i * 14;
          return (
            <motion.div
              key={s.lbl}
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className={`n5__step n5__step--${s.tone}`}
              style={{ width: `${width}%` }}
            >
              <span className="n5__step-lbl">{s.lbl}</span>
              <span className="n5__step-num">{s.val}</span>
              <span className="n5__step-pct">{s.pct}% of sent</span>
              {i < steps.length - 1 && (
                <span className="n5__step-arrow"><ChevronDown size={14} strokeWidth={2.4} /></span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Conversion chips */}
      <div className="n5__rates">
        {steps.slice(1).map((s, i) => {
          const prev = steps[i]!;
          const conv = Math.round((s.val / prev.val) * 1000) / 10;
          return (
            <div key={`${prev.lbl}-${s.lbl}`} className="n5__rate">
              <span className="n5__rate-from">{prev.lbl}</span>
              <span className="n5__rate-arrow">→</span>
              <span className="n5__rate-to">{s.lbl}</span>
              <strong className="n5__rate-pct">{conv}%</strong>
            </div>
          );
        })}
      </div>

      {/* Per-mailbox cohort table */}
      <section className="n5__cohort">
        <header className="n5-panel-head">
          <span>Per-mailbox cohort</span>
          <span className="n5-panel-meta">5 mailboxes · today</span>
        </header>
        <div className="n5__cohort-table">
          <div className="n5__cohort-th">
            <span>Mailbox</span>
            <span>Sent</span>
            <span>Inbox %</span>
            <span>Open %</span>
            <span>Reply %</span>
            <span>Bounce</span>
            <span>Verdict</span>
          </div>
          {DEMO_MAILBOXES.map((m, i) => {
            const inbox = 75 + ((i * 5) % 22);
            const open = 35 + ((i * 9) % 30);
            const reply = 8 + ((i * 4) % 12);
            const bounce = i === 3 ? 1.2 : 0.3 + (i % 3) * 0.2;
            const verdict = inbox >= 85 ? 'success' : inbox >= 70 ? 'warning' : 'danger';
            return (
              <div key={m.id} className="n5__cohort-row">
                <span className="n5__cohort-mb">
                  <ProviderSwatch provider={m.provider} size={20} />
                  {m.email.split('@')[0]}
                </span>
                <span className="n5__cohort-num">{m.sentToday}</span>
                <span className="n5__cohort-num">{inbox}%</span>
                <span className="n5__cohort-num">{open}%</span>
                <span className="n5__cohort-num">{reply}%</span>
                <span className="n5__cohort-num">{bounce}%</span>
                <span className={`n5__cohort-verdict n5__cohort-verdict--${verdict}`}>
                  {inbox >= 85 ? 'Healthy' : inbox >= 70 ? 'Watch' : 'Action'}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
