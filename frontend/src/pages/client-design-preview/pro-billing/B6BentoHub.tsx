import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  Download,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  Shield,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  CURRENT_PERIOD,
  INVOICES,
  PAYMENT_METHODS,
  SPENDING_TREND_6MO,
  STATUS_META,
  formatDate,
  formatINR,
} from './demoBilling';

const STATUS_ICON = {
  paid: CheckCircle2,
  pending: Clock,
  failed: AlertTriangle,
  refunded: RefreshCw,
} as const;

/**
 * B6 — Bento Hub. Multi-card billing dashboard. Plan + payments + invoices
 * + tax + alerts + spending trend all in one bento grid.
 */
export function B6BentoHub() {
  const trendMax = Math.max(...SPENDING_TREND_6MO.map((s) => s.amount));

  return (
    <div className="b6">
      <header className="b6__head">
        <span className="b6__eyebrow">
          <Wallet size={11} strokeWidth={2.4} />
          Billing & payments
        </span>
        <h2 className="b6__head-title">Acme · Pro plan</h2>
        <p className="b6__head-sub">
          Everything money-related, one screen. Hover any card to drill in.
        </p>
      </header>

      <div className="b6__grid">
        {/* Subscription — large hero card */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="b6__card b6__card--hero"
        >
          <header className="b6__hero-head">
            <span className="b6__hero-badge">
              <Crown size={11} strokeWidth={2.4} />
              Pro · monthly
            </span>
            <button type="button" className="b6__hero-link">
              Manage <ArrowUpRight size={11} strokeWidth={2.4} />
            </button>
          </header>
          <div className="b6__hero-amount">
            <span className="b6__hero-currency">₹</span>
            <span className="b6__hero-num">5,000</span>
            <span className="b6__hero-period">/ month</span>
          </div>
          <span className="b6__hero-next">
            Next charge: <strong>{CURRENT_PERIOD.nextChargeDate}</strong>
          </span>
          <div className="b6__hero-meter">
            <div
              className="b6__hero-meter-fill"
              style={{ width: `${(CURRENT_PERIOD.daysIn / CURRENT_PERIOD.daysTotal) * 100}%` }}
            />
          </div>
          <span className="b6__hero-meter-lbl">
            {CURRENT_PERIOD.daysIn} of {CURRENT_PERIOD.daysTotal} days · {CURRENT_PERIOD.daysTotal - CURRENT_PERIOD.daysIn} days remaining
          </span>
        </motion.section>

        {/* Payment methods */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="b6__card"
        >
          <header className="b6__card-head">
            <span className="b6__card-icon b6__card-icon--violet">
              <CreditCard size={13} strokeWidth={2.4} />
            </span>
            <div className="b6__card-id">
              <span className="b6__card-eyebrow">Payment methods</span>
              <span className="b6__card-meta">{PAYMENT_METHODS.length} on file</span>
            </div>
            <button type="button" className="b6__card-add">
              <Plus size={11} strokeWidth={2.4} />
            </button>
          </header>
          <ul className="b6__pm-list">
            {PAYMENT_METHODS.slice(0, 3).map((pm) => (
              <li key={pm.id}>
                <span className={`b6__pm-icon b6__pm-icon--${pm.kind}`}>
                  {pm.kind === 'card' ? <CreditCard size={11} strokeWidth={2.4} /> : <Wallet size={11} strokeWidth={2.4} />}
                </span>
                <div className="b6__pm-text">
                  <span className="b6__pm-label">{pm.label}</span>
                  <span className="b6__pm-sub">{pm.sub}</span>
                </div>
                {pm.isDefault && <span className="b6__pill b6__pill--default">Default</span>}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Recent invoices */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="b6__card"
        >
          <header className="b6__card-head">
            <span className="b6__card-icon b6__card-icon--green">
              <Receipt size={13} strokeWidth={2.4} />
            </span>
            <div className="b6__card-id">
              <span className="b6__card-eyebrow">Recent invoices</span>
              <span className="b6__card-meta">{INVOICES.length} total</span>
            </div>
            <button type="button" className="b6__card-link">View all</button>
          </header>
          <ul className="b6__inv-list">
            {INVOICES.slice(0, 3).map((inv) => {
              const s = STATUS_META[inv.status];
              const Icon = STATUS_ICON[inv.status];
              return (
                <li key={inv.id}>
                  <div className="b6__inv-text">
                    <span className="b6__inv-id">{inv.id}</span>
                    <span className="b6__inv-date">{formatDate(inv.date)}</span>
                  </div>
                  <span className={`b6__status b6__status--${s.tone}`}>
                    <Icon size={8} strokeWidth={2.4} />
                    {s.label}
                  </span>
                  <span className="b6__inv-amount">{formatINR(inv.amount)}</span>
                  <button type="button" className="b6__inv-dl">
                    <Download size={10} strokeWidth={2.4} />
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.section>

        {/* Spending trend */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="b6__card b6__card--wide"
        >
          <header className="b6__card-head">
            <span className="b6__card-icon b6__card-icon--cyan">
              <TrendingUp size={13} strokeWidth={2.4} />
            </span>
            <div className="b6__card-id">
              <span className="b6__card-eyebrow">6-month spending</span>
              <span className="b6__card-meta">Avg ₹5,108 / mo</span>
            </div>
            <span className="b6__trend-pill">+2.1% vs Apr</span>
          </header>
          <div className="b6__trend">
            {SPENDING_TREND_6MO.map((m, i) => {
              const h = (m.amount / trendMax) * 100;
              const isCurrent = i === SPENDING_TREND_6MO.length - 1;
              return (
                <div key={m.month} className="b6__trend-col">
                  <div className="b6__trend-bar-track">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.06 }}
                      className={`b6__trend-bar ${isCurrent ? 'b6__trend-bar--current' : ''}`}
                    />
                  </div>
                  <span className="b6__trend-month">{m.month}</span>
                  <span className="b6__trend-amount">{formatINR(m.amount)}</span>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Tax / GST */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          className="b6__card"
        >
          <header className="b6__card-head">
            <span className="b6__card-icon b6__card-icon--yellow">
              <FileText size={13} strokeWidth={2.4} />
            </span>
            <div className="b6__card-id">
              <span className="b6__card-eyebrow">Tax & legal</span>
              <span className="b6__card-meta">India · GST registered</span>
            </div>
          </header>
          <ul className="b6__list">
            <li>
              <span className="b6__list-lbl">Legal name</span>
              <span className="b6__list-val">Acme Corp Pvt Ltd</span>
            </li>
            <li>
              <span className="b6__list-lbl">GSTIN</span>
              <span className="b6__list-val b6__mono">29ABCDE1234F1Z5</span>
            </li>
            <li>
              <span className="b6__list-lbl">Billing address</span>
              <span className="b6__list-val">Bengaluru, KA</span>
            </li>
          </ul>
          <button type="button" className="b6__card-cta">Edit billing details</button>
        </motion.section>

        {/* Alerts */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.25 }}
          className="b6__card"
        >
          <header className="b6__card-head">
            <span className="b6__card-icon b6__card-icon--pink">
              <Bell size={13} strokeWidth={2.4} />
            </span>
            <div className="b6__card-id">
              <span className="b6__card-eyebrow">Billing alerts</span>
              <span className="b6__card-meta">2 active</span>
            </div>
          </header>
          <ul className="b6__alerts">
            <li className="b6__alert b6__alert--warn">
              <AlertTriangle size={11} strokeWidth={2.4} />
              <div>
                <span className="b6__alert-title">Mailbox cap reached</span>
                <span className="b6__alert-sub">5 / 5 used · next mailbox triggers ₹450 overage</span>
              </div>
            </li>
            <li className="b6__alert b6__alert--info">
              <Shield size={11} strokeWidth={2.4} />
              <div>
                <span className="b6__alert-title">Card expires soon</span>
                <span className="b6__alert-sub">VISA · 4242 expires 09 / 28 · update before then</span>
              </div>
            </li>
          </ul>
        </motion.section>
      </div>
    </div>
  );
}
