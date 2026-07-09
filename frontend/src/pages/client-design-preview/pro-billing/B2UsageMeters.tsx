import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  Database,
  Gauge,
  Mail,
  TrendingUp,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import { CURRENT_PERIOD, USAGE, formatINR } from './demoBilling';

/**
 * B2 — Usage Meters. Datadog-style live usage dashboard.
 * Donut of cycle progress + per-resource bars + projected end-of-month bill.
 */
const ICON_MAP: Record<string, typeof Mail> = {
  mb: Mail,
  seats: Users,
  sends: Zap,
  storage: Database,
  api: Gauge,
  webhooks: Webhook,
};

export function B2UsageMeters() {
  const cyclePct = (CURRENT_PERIOD.daysIn / CURRENT_PERIOD.daysTotal) * 100;
  const donutR = 56;
  const donutC = 2 * Math.PI * donutR;
  const donutDash = (cyclePct / 100) * donutC;

  return (
    <div className="b2">
      <header className="b2__head">
        <div className="b2__head-text">
          <span className="b2__eyebrow">
            <Gauge size={11} strokeWidth={2.4} />
            Current cycle · usage live
          </span>
          <h2 className="b2__head-title">
            {CURRENT_PERIOD.start} → {CURRENT_PERIOD.end}
          </h2>
          <p className="b2__head-sub">
            Resource consumption against your Pro entitlements. Projected bill
            updates as usage grows.
          </p>
        </div>
        <div className="b2__head-projected">
          <span className="b2__head-projected-lbl">Projected bill</span>
          <span className="b2__head-projected-amount">{formatINR(CURRENT_PERIOD.projectedAmount)}</span>
          <span className="b2__head-projected-sub">
            <TrendingUp size={10} strokeWidth={2.4} />
            +₹450 over base · 1 mailbox overage trending
          </span>
        </div>
      </header>

      <div className="b2__main">
        {/* Cycle donut */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="b2__donut-card"
        >
          <span className="b2__donut-eyebrow">Billing cycle</span>
          <div className="b2__donut-wrap">
            <svg viewBox="0 0 140 140" className="b2__donut">
              <circle
                cx="70" cy="70" r={donutR}
                fill="none"
                stroke="var(--wp-border)"
                strokeWidth="11"
              />
              <circle
                cx="70" cy="70" r={donutR}
                fill="none"
                stroke="var(--wp-accent)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${donutDash} ${donutC}`}
                transform="rotate(-90 70 70)"
              />
            </svg>
            <div className="b2__donut-center">
              <span className="b2__donut-num">{Math.round(cyclePct)}%</span>
              <span className="b2__donut-lbl">elapsed</span>
            </div>
          </div>
          <div className="b2__donut-meta">
            <span><strong>{CURRENT_PERIOD.daysIn}d</strong> in</span>
            <span><strong>{CURRENT_PERIOD.daysTotal - CURRENT_PERIOD.daysIn}d</strong> remaining</span>
          </div>
        </motion.section>

        {/* Resource meters */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="b2__meters"
        >
          {USAGE.map((u, i) => {
            const Icon = ICON_MAP[u.key] ?? Mail;
            const pct = Math.min(100, (u.used / u.total) * 100);
            return (
              <motion.div
                key={u.key}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0.1 + i * 0.04 }}
                className="b2__meter"
              >
                <div className={`b2__meter-icon b2__meter-icon--${u.tone}`}>
                  <Icon size={14} strokeWidth={2.4} />
                </div>
                <div className="b2__meter-body">
                  <div className="b2__meter-head">
                    <span className="b2__meter-label">{u.label}</span>
                    <span className={`b2__meter-val b2__meter-val--${u.tone}`}>
                      <strong>{u.used.toLocaleString('en-IN')}</strong>
                      <span className="b2__meter-total">
                        / {u.total.toLocaleString('en-IN')}{u.unit}
                      </span>
                    </span>
                  </div>
                  <div className="b2__meter-bar">
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, delay: 0.15 + i * 0.04 }}
                      className={`b2__meter-fill b2__meter-fill--${u.tone}`}
                    />
                  </div>
                  <span className="b2__meter-sub">
                    {pct >= 100 ? (
                      <span className="b2__meter-warn">
                        <AlertTriangle size={9} strokeWidth={2.4} />
                        At entitlement cap · overage will charge
                      </span>
                    ) : (
                      <>{Math.round(pct)}% used · {(u.total - u.used).toLocaleString('en-IN')}{u.unit} left</>
                    )}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.section>
      </div>

      {/* Overage breakdown */}
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.3 }}
        className="b2__overages"
      >
        <header className="b2__panel-head">
          <span className="b2__panel-title">
            <Bot size={11} strokeWidth={2.4} /> Pay-as-you-go overages
          </span>
          <span className="b2__panel-meta">trend · last 6 hours</span>
        </header>
        <div className="b2__overage-grid">
          <div className="b2__overage">
            <span className="b2__overage-lbl">Extra mailboxes</span>
            <span className="b2__overage-amount">₹450 / mo each</span>
            <span className="b2__overage-curr">0 active</span>
          </div>
          <div className="b2__overage">
            <span className="b2__overage-lbl">LLM content generation</span>
            <span className="b2__overage-amount">₹2 / 100 chars</span>
            <span className="b2__overage-curr">₹320 used</span>
          </div>
          <div className="b2__overage">
            <span className="b2__overage-lbl">Extra log storage</span>
            <span className="b2__overage-amount">₹15 / GB / mo</span>
            <span className="b2__overage-curr">0 GB over</span>
          </div>
          <div className="b2__overage">
            <span className="b2__overage-lbl">White-label add-on</span>
            <span className="b2__overage-amount">₹50 / month</span>
            <span className="b2__overage-curr">Active</span>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
