import { motion } from 'framer-motion';
import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { DEMO_MAILBOXES } from '../pro-dashboards/demoData';
import { getMailboxHealth, type Tone } from './shared';

/**
 * H4 — Status Page. status.io / Vercel-status style.
 * Big "all systems operational" banner + subsystem rows with 30-day history bars
 * + incident timeline at the bottom.
 */

interface Subsystem {
  key: string;
  name: string;
  tone: Tone;
  uptime: number; // 0-100 %
  detail: string;
  history: Tone[]; // 30 days
}

function genHistory(seed: number, alertDays: number[] = []): Tone[] {
  return Array.from({ length: 30 }).map((_, i) => {
    if (alertDays.includes(i)) return 'danger';
    const v = (seed + i * 7) % 11;
    if (v === 0) return 'warning';
    return 'success';
  });
}

export function H4StatusPage() {
  const health = DEMO_MAILBOXES.map(getMailboxHealth);
  const worstTone: Tone = health.some((h) => h.tone === 'danger')
    ? 'danger'
    : health.some((h) => h.tone === 'warning') ? 'warning' : 'success';

  const subs: Subsystem[] = [
    {
      key: 'warmup',
      name: 'Warmup engine',
      tone: 'success',
      uptime: 99.97,
      detail: 'Send / open / reply pipeline operating normally',
      history: genHistory(3),
    },
    {
      key: 'dns',
      name: 'DNS authentication',
      tone: health.some((h) => !h.mailbox.spfOk || !h.mailbox.dkimOk || !h.mailbox.dmarcOk) ? 'warning' : 'success',
      uptime: 99.5,
      detail: `${health.filter((h) => h.mailbox.spfOk && h.mailbox.dkimOk && h.mailbox.dmarcOk).length} / ${health.length} mailboxes fully valid`,
      history: genHistory(7, [12]),
    },
    {
      key: 'inbox',
      name: 'Inbox placement',
      tone: 'success',
      uptime: 98.4,
      detail: 'Average inbox placement 87% over the last 30 days',
      history: genHistory(5),
    },
    {
      key: 'peers',
      name: 'Peer IMAP polling',
      tone: 'success',
      uptime: 99.9,
      detail: 'Peer network online · 47 active peers',
      history: genHistory(11),
    },
    {
      key: 'bounce',
      name: 'Bounce monitoring',
      tone: 'warning',
      uptime: 99.0,
      detail: 'dana@ exceeded the warn threshold 14d ago',
      history: genHistory(13, [16]),
    },
  ];

  const incidents = [
    { ts: '14d ago', tone: 'danger' as Tone, title: 'dana@ bounce rate spiked to 1.2%', body: 'Recipient list audit recommended. Mailbox paused for 24h, resumed automatically.' },
    { ts: '21d ago', tone: 'warning' as Tone, title: 'casey@ DMARC TTL warning', body: 'TTL was set too low (60s). Increased to 3600s automatically. No further action.' },
    { ts: '28d ago', tone: 'success' as Tone, title: 'Peer network expanded', body: 'Added 12 new peer mailboxes across Gmail and Outlook.' },
  ];

  return (
    <div className="h4">
      {/* Hero status */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`h4__hero h4__hero--${worstTone}`}
      >
        <span className={`h4__hero-icon h4__hero-icon--${worstTone}`}>
          {worstTone === 'success' ? <CheckCircle2 size={28} strokeWidth={2.4} /> :
           worstTone === 'warning' ? <TriangleAlert size={28} strokeWidth={2.4} /> :
           <ShieldAlert size={28} strokeWidth={2.4} />}
        </span>
        <div>
          <h2 className="h4__hero-title">
            {worstTone === 'success'
              ? 'All systems operational'
              : worstTone === 'warning'
                ? 'Partial degradation'
                : 'Service disruption'}
          </h2>
          <p className="h4__hero-sub">
            As of {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
            {worstTone !== 'success' && ' Check subsystems below for details.'}
          </p>
        </div>
        <span className={`h4__hero-pulse h4__hero-pulse--${worstTone}`} aria-hidden />
      </motion.section>

      {/* Subsystem rows */}
      <section className="h4__subs">
        <header className="h4-panel-head">
          <span>Subsystems</span>
          <span className="h4-panel-meta">30-day history</span>
        </header>
        {subs.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className={`h4__sub h4__sub--${s.tone}`}
          >
            <span className={`h4__sub-icon h4__sub-icon--${s.tone}`}>
              {s.tone === 'success' ? <ShieldCheck size={13} strokeWidth={2.4} /> :
               s.tone === 'warning' ? <TriangleAlert size={13} strokeWidth={2.4} /> :
               <ShieldAlert size={13} strokeWidth={2.4} />}
            </span>
            <div className="h4__sub-text">
              <span className="h4__sub-name">{s.name}</span>
              <span className="h4__sub-detail">{s.detail}</span>
            </div>
            <div className="h4__sub-history" aria-label={`${s.name} 30-day history`}>
              {s.history.map((d, j) => (
                <span key={j} className={`h4__sub-day h4__sub-day--${d}`} title={`${30 - j}d ago`} />
              ))}
            </div>
            <span className={`h4__sub-uptime h4__sub-uptime--${s.tone}`}>
              {s.uptime.toFixed(2)}%
              <span className="h4__sub-uptime-lbl">UPTIME</span>
            </span>
          </motion.div>
        ))}
      </section>

      {/* Incident timeline */}
      <section className="h4__incidents">
        <header className="h4-panel-head">
          <span><Clock size={11} strokeWidth={2.4} /> Recent incidents</span>
          <span className="h4-panel-meta">{incidents.length} entries · last 30 days</span>
        </header>
        <ul className="h4__incident-list">
          {incidents.map((inc, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.4 + i * 0.05 }}
              className="h4__incident"
            >
              <span className="h4__incident-time">{inc.ts}</span>
              <span className="h4__incident-rail">
                <span className={`h4__incident-rail-dot h4__incident-rail-dot--${inc.tone}`} />
                {i < incidents.length - 1 && <span className="h4__incident-rail-line" />}
              </span>
              <div className="h4__incident-body">
                <span className={`h4__incident-tag h4__incident-tag--${inc.tone}`}>
                  {inc.tone === 'success' ? 'INFO' : inc.tone === 'warning' ? 'NOTICE' : 'ALERT'}
                </span>
                <span className="h4__incident-title">{inc.title}</span>
                <p className="h4__incident-text">{inc.body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}
