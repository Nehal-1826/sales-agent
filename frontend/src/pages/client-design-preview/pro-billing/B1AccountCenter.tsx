import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import {
  CURRENT_PERIOD,
  INVOICES,
  PAYMENT_METHODS,
  STATUS_META,
  formatDate,
  formatINR,
  relTime,
} from './demoBilling';

const STATUS_ICON = {
  paid: CheckCircle2,
  pending: Clock,
  failed: AlertTriangle,
  refunded: RefreshCw,
} as const;

/**
 * B1 — Account Center. Stripe-style billing home.
 * Hero strip (next charge, plan, default method) + invoices table + payment methods.
 */
export function B1AccountCenter() {
  return (
    <div className="b1">
      <div className="b1__hero">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="b1__hero-card b1__hero-card--primary"
        >
          <span className="b1__hero-eyebrow">Next charge</span>
          <div className="b1__hero-amount">
            <span className="b1__hero-currency">₹</span>
            <span className="b1__hero-num">5,000</span>
          </div>
          <span className="b1__hero-sub">on {CURRENT_PERIOD.nextChargeDate}</span>
          <div className="b1__hero-meter">
            <div
              className="b1__hero-meter-fill"
              style={{ width: `${(CURRENT_PERIOD.daysIn / CURRENT_PERIOD.daysTotal) * 100}%` }}
            />
          </div>
          <span className="b1__hero-meter-lbl">
            {CURRENT_PERIOD.daysIn} of {CURRENT_PERIOD.daysTotal} days into May billing cycle
          </span>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.05 }}
          className="b1__hero-card"
        >
          <span className="b1__hero-eyebrow">Current plan</span>
          <span className="b1__hero-plan">Pro</span>
          <span className="b1__hero-sub">₹5,000 / month · 5 mailboxes · 10 seats</span>
          <button type="button" className="b1__hero-link">
            Change plan <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="b1__hero-card"
        >
          <span className="b1__hero-eyebrow">Default method</span>
          <div className="b1__hero-method">
            <span className="b1__hero-method-icon"><CreditCard size={14} strokeWidth={2.4} /></span>
            <div>
              <span className="b1__hero-method-label">VISA · 4242</span>
              <span className="b1__hero-method-sub">expires 09 / 28</span>
            </div>
          </div>
          <button type="button" className="b1__hero-link">
            Manage methods <ArrowUpRight size={11} strokeWidth={2.4} />
          </button>
        </motion.section>
      </div>

      <div className="b1__split">
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="b1__invoices"
        >
          <header className="b1__panel-head">
            <span className="b1__panel-title">
              <Receipt size={11} strokeWidth={2.4} /> Invoices
            </span>
            <span className="b1__panel-meta">{INVOICES.length} total</span>
          </header>
          <table className="b1__table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Period</th>
                <th>Status</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv) => {
                const status = STATUS_META[inv.status];
                const Icon = STATUS_ICON[inv.status];
                return (
                  <tr key={inv.id}>
                    <td>
                      <span className="b1__inv-id">{inv.id}</span>
                      <span className="b1__inv-desc">{inv.description}</span>
                    </td>
                    <td className="b1__inv-date">
                      <span>{formatDate(inv.date)}</span>
                      <span className="b1__inv-rel">{relTime(inv.date)}</span>
                    </td>
                    <td className="b1__inv-period">{inv.period}</td>
                    <td>
                      <span className={`b1__status b1__status--${status.tone}`}>
                        <Icon size={9} strokeWidth={2.4} />
                        {status.label}
                      </span>
                    </td>
                    <td className="b1__inv-amount">{formatINR(inv.amount)}</td>
                    <td>
                      <button type="button" className="b1__inv-dl">
                        <Download size={11} strokeWidth={2.4} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          className="b1__methods"
        >
          <header className="b1__panel-head">
            <span className="b1__panel-title">
              <Wallet size={11} strokeWidth={2.4} /> Payment methods
            </span>
          </header>
          <ul className="b1__methods-list">
            {PAYMENT_METHODS.map((pm) => (
              <li key={pm.id} className={`b1__method ${pm.isDefault ? 'b1__method--default' : ''}`}>
                <span className={`b1__method-icon b1__method-icon--${pm.kind}`}>
                  {pm.kind === 'card' ? (
                    <CreditCard size={14} strokeWidth={2.4} />
                  ) : (
                    <Wallet size={14} strokeWidth={2.4} />
                  )}
                </span>
                <div className="b1__method-text">
                  <span className="b1__method-label">{pm.label}</span>
                  <span className="b1__method-sub">
                    {pm.sub}
                    {pm.expiry ? ` · exp ${pm.expiry}` : ''}
                  </span>
                </div>
                {pm.isDefault && <span className="b1__method-pill b1__method-pill--default">Default</span>}
                {pm.isBackup && <span className="b1__method-pill">Backup</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="b1__methods-add">+ Add new payment method</button>

          <div className="b1__tax-card">
            <span className="b1__tax-eyebrow">Billing address & GST</span>
            <span className="b1__tax-line">Acme Corp Pvt Ltd</span>
            <span className="b1__tax-line">29ABCDE1234F1Z5 · Bengaluru, KA</span>
            <button type="button" className="b1__hero-link">Edit details</button>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
