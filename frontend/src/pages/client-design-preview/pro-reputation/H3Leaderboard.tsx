import { motion } from 'framer-motion';
import { Award, ChevronDown, ChevronUp, Crown, Medal, Trophy } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { MiniSpark, ProviderSwatch } from '../pro-mailboxes/shared';
import { getMailboxHealth } from './shared';

/**
 * H3 — Trust Leaderboard. Mailboxes ranked by composite score, podium for top 3.
 */
export function H3Leaderboard() {
  const ranked = DEMO_MAILBOXES.map(getMailboxHealth).sort((a, b) => b.composite - a.composite);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="h3">
      <header className="h3__head">
        <span className="h3-eyebrow">
          <Trophy size={11} strokeWidth={2.4} />
          Trust leaderboard
        </span>
        <span className="h3__head-meta">Ranked by composite health (warmth + DNS + auth)</span>
      </header>

      {/* Podium for top 3 — arranged 2 / 1 / 3 visually */}
      <div className="h3__podium">
        {[1, 0, 2].map((rankIdx) => {
          const h = top3[rankIdx];
          if (!h) return <div key={rankIdx} className="h3__podium-empty" />;
          const place = rankIdx + 1;
          return (
            <motion.section
              key={h.mailbox.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * rankIdx }}
              className={`h3__podium-card h3__podium-card--p${place} h3__podium-card--${h.tone}`}
            >
              <span className={`h3__podium-medal h3__podium-medal--p${place}`}>
                {place === 1 ? <Crown size={18} strokeWidth={2.4} fill="currentColor" /> :
                 place === 2 ? <Medal size={16} strokeWidth={2.4} /> :
                 <Award size={16} strokeWidth={2.4} />}
              </span>
              <span className="h3__podium-rank">#{place}</span>
              <ProviderSwatch provider={h.mailbox.provider} size={place === 1 ? 44 : 36} />
              <span className="h3__podium-email">{h.mailbox.email.split('@')[0]}</span>
              <span className="h3__podium-provider">{providerLabel(h.mailbox.provider)}</span>
              <div className="h3__podium-score">
                <span className={`h3__podium-score-num h3__podium-score-num--${h.tone}`}>{h.composite}</span>
                <span className="h3__podium-score-lbl">/ 100</span>
              </div>
              <div className="h3__podium-subs">
                <SubChip label="DNS" value={h.dns} />
                <SubChip label="Warmth" value={h.warmth} />
                <SubChip label="Auth" value={h.auth} />
              </div>
            </motion.section>
          );
        })}
      </div>

      {/* Rest of the leaderboard as rows */}
      {rest.length > 0 && (
        <section className="h3__rest">
          <header className="h3__rest-head">
            <span>Rank</span>
            <span>Mailbox</span>
            <span>Composite</span>
            <span>14d trend</span>
            <span>DNS</span>
            <span>Warmth</span>
            <span>Auth</span>
          </header>
          {rest.map((h, i) => {
            const place = i + 4;
            return (
              <motion.div
                key={h.mailbox.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: 0.2 + i * 0.04 }}
                className="h3__rest-row"
              >
                <span className="h3__rest-rank">#{place}</span>
                <span className="h3__rest-mb">
                  <ProviderSwatch provider={h.mailbox.provider} size={24} />
                  <span className="h3__rest-email">{h.mailbox.email.split('@')[0]}</span>
                </span>
                <span className={`h3__rest-num h3__rest-num--${h.tone}`}>{h.composite}</span>
                <MiniSpark data={h.mailbox.spark} tone={h.tone === 'success' ? 'success' : h.tone === 'warning' ? 'warning' : 'danger'} width={80} height={22} />
                <SubChip label="DNS" value={h.dns} compact />
                <SubChip label="Warmth" value={h.warmth} compact />
                <SubChip label="Auth" value={h.auth} compact />
              </motion.div>
            );
          })}
        </section>
      )}

      {/* Workspace summary at the bottom */}
      <footer className="h3__summary">
        <div className="h3__summary-stat">
          <span className="h3__summary-lbl">Workspace average</span>
          <span className="h3__summary-num">{Math.round(ranked.reduce((s, h) => s + h.composite, 0) / ranked.length)}</span>
        </div>
        <span className="h3__summary-divider" />
        <div className="h3__summary-stat">
          <span className="h3__summary-lbl">Top performer</span>
          <span className="h3__summary-num h3__summary-num--accent">{ranked[0]?.mailbox.email.split('@')[0]}</span>
        </div>
        <span className="h3__summary-divider" />
        <div className="h3__summary-stat">
          <span className="h3__summary-lbl">Needs attention</span>
          <span className="h3__summary-num h3__summary-num--danger">{ranked.filter((h) => h.tone === 'danger').length}</span>
        </div>
        <span className="h3__summary-divider" />
        <div className="h3__summary-stat">
          <span className="h3__summary-lbl">Spread</span>
          <span className="h3__summary-num">
            <ChevronUp size={11} strokeWidth={2.6} style={{ verticalAlign: 'middle' }} />
            {ranked[0]?.composite} – {ranked[ranked.length - 1]?.composite}
            <ChevronDown size={11} strokeWidth={2.6} style={{ verticalAlign: 'middle' }} />
          </span>
        </div>
      </footer>
    </div>
  );
}

function SubChip({ label, value, compact }: { label: string; value: number; compact?: boolean }) {
  const tone = value >= 80 ? 'success' : value >= 50 ? 'warning' : 'danger';
  return (
    <span className={`h3-sub h3-sub--${tone} ${compact ? 'h3-sub--compact' : ''}`}>
      {!compact && <span className="h3-sub-lbl">{label}</span>}
      <span className="h3-sub-val">{value}</span>
    </span>
  );
}
