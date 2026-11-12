import { motion } from 'framer-motion';
import { Columns3 } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { MiniSpark, ProviderSwatch, StatusPill, toneFor } from '../pro-mailboxes/shared';

/**
 * N3 — Compare Mailboxes. Side-by-side 5-column comparison.
 * Each column = one mailbox, same metrics down each column.
 * Inline horizontal bars compare values across all 5.
 */
export function N3Compare() {
  // Compute maxes for relative bar widths
  const maxSent = Math.max(...DEMO_MAILBOXES.map((m) => m.sentToday));
  const fakeOpenRates = DEMO_MAILBOXES.map((_, i) => 40 + ((i * 7) % 30));
  const fakeReplyRates = DEMO_MAILBOXES.map((_, i) => 8 + ((i * 5) % 12));

  return (
    <div className="n3">
      <header className="n3__head">
        <span className="n3-eyebrow"><Columns3 size={11} strokeWidth={2.4} />Mailbox comparison · same metrics down each column</span>
        <span className="n3__head-meta">{DEMO_MAILBOXES.length} mailboxes</span>
      </header>

      <div className="n3__grid">
        {DEMO_MAILBOXES.map((m, i) => {
          const tone = toneFor(m);
          const openRate = fakeOpenRates[i]!;
          const replyRate = fakeReplyRates[i]!;
          return (
            <motion.section
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`n3__col n3__col--${tone}`}
            >
              <header className="n3__col-head">
                <ProviderSwatch provider={m.provider} size={32} />
                <div>
                  <span className="n3__col-email">{m.email.split('@')[0]}</span>
                  <span className="n3__col-sub">{providerLabel(m.provider)}</span>
                </div>
                <StatusPill status={m.status} compact />
              </header>

              <div className="n3__col-warmth">
                <span className="n3__col-warmth-num">{m.warmth}</span>
                <span className="n3__col-warmth-lbl">warmth · day {m.day}</span>
              </div>

              <div className="n3__col-spark">
                <MiniSpark data={m.spark} tone={tone} width={200} height={40} />
                <span className="n3__col-spark-lbl">14-day warmth</span>
              </div>

              {/* Comparable metric bars */}
              <ul className="n3__col-metrics">
                <li>
                  <span className="n3__metric-lbl">Sent today</span>
                  <span className="n3__metric-row">
                    <span className="n3__metric-track">
                      <span className={`n3__metric-fill n3__metric-fill--${tone}`} style={{ width: `${(m.sentToday / maxSent) * 100}%` }} />
                    </span>
                    <span className="n3__metric-val">{m.sentToday}<span className="n3__metric-dim">/{m.dailyTarget}</span></span>
                  </span>
                </li>
                <li>
                  <span className="n3__metric-lbl">Open rate</span>
                  <span className="n3__metric-row">
                    <span className="n3__metric-track">
                      <span className="n3__metric-fill n3__metric-fill--success" style={{ width: `${openRate}%` }} />
                    </span>
                    <span className="n3__metric-val">{openRate}%</span>
                  </span>
                </li>
                <li>
                  <span className="n3__metric-lbl">Reply rate</span>
                  <span className="n3__metric-row">
                    <span className="n3__metric-track">
                      <span className="n3__metric-fill n3__metric-fill--warning" style={{ width: `${replyRate * 5}%` }} />
                    </span>
                    <span className="n3__metric-val">{replyRate}%</span>
                  </span>
                </li>
                <li>
                  <span className="n3__metric-lbl">DNS valid</span>
                  <span className="n3__metric-row">
                    <span className="n3__metric-dns">
                      <span className={`n3__dns-cell n3__dns-cell--${m.spfOk ? 'ok' : 'err'}`}>SPF</span>
                      <span className={`n3__dns-cell n3__dns-cell--${m.dkimOk ? 'ok' : 'err'}`}>DKIM</span>
                      <span className={`n3__dns-cell n3__dns-cell--${m.dmarcOk ? 'ok' : 'err'}`}>DMARC</span>
                    </span>
                  </span>
                </li>
              </ul>

              {/* Footer rank */}
              <footer className="n3__col-foot">
                <span className="n3__col-foot-lbl">Rank by warmth</span>
                <span className="n3__col-foot-rank">#{[...DEMO_MAILBOXES].sort((a, b) => b.warmth - a.warmth).findIndex((x) => x.id === m.id) + 1}</span>
              </footer>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
