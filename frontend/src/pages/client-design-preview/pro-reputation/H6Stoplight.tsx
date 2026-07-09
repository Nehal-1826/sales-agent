import { motion } from 'framer-motion';
import { Activity, Radio } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { ProviderSwatch } from '../pro-mailboxes/shared';
import { getMailboxHealth, type Tone } from './shared';

/**
 * H6 — Stoplight NOC. Network-operations-center display.
 * Big tile per mailbox showing 5 stoplight indicators (Warmth, SPF, DKIM, DMARC, Auth).
 * Aggregate worst-tone summary banner at the top.
 */

function lightFor(score: number, isBool?: boolean): Tone {
  if (isBool) return score === 100 ? 'success' : 'danger';
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export function H6Stoplight() {
  const health = DEMO_MAILBOXES.map(getMailboxHealth);
  const worst: Tone = health.some((h) => h.tone === 'danger') ? 'danger' :
                     health.some((h) => h.tone === 'warning') ? 'warning' : 'success';
  const counts = {
    success: health.filter((h) => h.tone === 'success').length,
    warning: health.filter((h) => h.tone === 'warning').length,
    danger: health.filter((h) => h.tone === 'danger').length,
  };

  return (
    <div className="h6">
      {/* Banner */}
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`h6__banner h6__banner--${worst}`}
      >
        <span className={`h6__banner-light h6__banner-light--${worst}`} aria-hidden />
        <div className="h6__banner-text">
          <span className="h6__banner-eyebrow">
            <Radio size={11} strokeWidth={2.4} />
            NOC overview
          </span>
          <h2 className="h6__banner-title">
            {worst === 'success' ? 'All mailboxes green' :
             worst === 'warning' ? 'Yellow lights — watch state' : 'Red lights — action required'}
          </h2>
        </div>
        <div className="h6__banner-counts">
          <span className="h6__banner-count h6__banner-count--success"><strong>{counts.success}</strong> green</span>
          <span className="h6__banner-count h6__banner-count--warning"><strong>{counts.warning}</strong> yellow</span>
          <span className="h6__banner-count h6__banner-count--danger"><strong>{counts.danger}</strong> red</span>
        </div>
      </motion.header>

      {/* Mailbox grid — NOC tiles */}
      <div className="h6__grid">
        {health.map((h, i) => {
          const lights: Array<{ label: string; tone: Tone; text: string }> = [
            { label: 'Warmth', tone: lightFor(h.warmth), text: `${h.warmth}/100` },
            { label: 'SPF', tone: lightFor(h.mailbox.spfOk ? 100 : 0, true), text: h.mailbox.spfOk ? 'OK' : 'FAIL' },
            { label: 'DKIM', tone: lightFor(h.mailbox.dkimOk ? 100 : 0, true), text: h.mailbox.dkimOk ? 'OK' : 'FAIL' },
            { label: 'DMARC', tone: lightFor(h.mailbox.dmarcOk ? 100 : 0, true), text: h.mailbox.dmarcOk ? 'OK' : 'FAIL' },
            { label: 'Auth', tone: lightFor(h.auth), text: h.auth === 100 ? 'OAuth' : 'SMTP' },
          ];
          return (
            <motion.section
              key={h.mailbox.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 + i * 0.04 }}
              className={`h6__tile h6__tile--${h.tone}`}
            >
              <header className="h6__tile-head">
                <ProviderSwatch provider={h.mailbox.provider} size={32} />
                <div>
                  <span className="h6__tile-email">{h.mailbox.email}</span>
                  <span className="h6__tile-sub">{providerLabel(h.mailbox.provider)} · D{h.mailbox.day}</span>
                </div>
                <div className={`h6__tile-master h6__tile-master--${h.tone}`}>
                  <span className="h6__tile-master-light" aria-hidden />
                  <span className="h6__tile-master-text">
                    {h.tone === 'success' ? 'GREEN' : h.tone === 'warning' ? 'AMBER' : 'RED'}
                  </span>
                </div>
              </header>

              <div className="h6__tile-lights">
                {lights.map((l) => (
                  <div key={l.label} className={`h6__light h6__light--${l.tone}`}>
                    <span className="h6__light-bulb" aria-hidden />
                    <span className="h6__light-label">{l.label}</span>
                    <span className="h6__light-text">{l.text}</span>
                  </div>
                ))}
              </div>

              <footer className="h6__tile-foot">
                <span className="h6__tile-foot-lbl">
                  <Activity size={9} strokeWidth={2.4} />
                  COMPOSITE
                </span>
                <span className={`h6__tile-foot-num h6__tile-foot-num--${h.tone}`}>{h.composite}<span>/100</span></span>
              </footer>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
