import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  Filter,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import {
  INVOICES,
  STATUS_META,
  formatDate,
  formatINR,
  relTime,
  type InvoiceStatus,
} from './demoBilling';

const STATUS_ICON = {
  paid: CheckCircle2,
  pending: Clock,
  failed: AlertTriangle,
  refunded: RefreshCw,
} as const;

type Filter = 'all' | InvoiceStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all',      label: 'All' },
  { key: 'paid',     label: 'Paid' },
  { key: 'pending',  label: 'Pending' },
  { key: 'refunded', label: 'Refunded' },
];

/**
 * B4 — Invoice Ledger. Stripe-style chronological list with expand-to-detail.
 */
export function B4InvoiceLedger() {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(INVOICES[0]?.id ?? null);

  const filtered = INVOICES.filter((i) => filter === 'all' || i.status === filter);

  const total = filtered.reduce((s, i) => (i.status === 'paid' ? s + i.amount : s), 0);

  return (
    <div className="b4">
      <header className="b4__head">
        <div>
          <span className="b4__eyebrow">
            <Receipt size={11} strokeWidth={2.4} />
            Invoice ledger
          </span>
          <h2 className="b4__head-title">Billing history</h2>
        </div>
        <div className="b4__head-stats">
          <div className="b4__stat">
            <span className="b4__stat-lbl">Showing</span>
            <span className="b4__stat-val">{filtered.length} invoices</span>
          </div>
          <div className="b4__stat">
            <span className="b4__stat-lbl">Lifetime paid</span>
            <span className="b4__stat-val">{formatINR(total)}</span>
          </div>
        </div>
      </header>

      <div className="b4__filters">
        <Filter size={11} strokeWidth={2.4} />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`b4__filter ${filter === f.key ? 'b4__filter--active' : ''}`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="b4__filter-count">
                {INVOICES.filter((i) => i.status === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <ul className="b4__list">
        {filtered.map((inv, i) => {
          const isOpen = expanded === inv.id;
          const status = STATUS_META[inv.status];
          const Icon = STATUS_ICON[inv.status];
          return (
            <motion.li
              key={inv.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className={`b4__row ${isOpen ? 'b4__row--open' : ''}`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : inv.id)}
                className="b4__row-summary"
              >
                <span className="b4__row-chev">
                  {isOpen ? <ChevronDown size={12} strokeWidth={2.4} /> : <ChevronRight size={12} strokeWidth={2.4} />}
                </span>
                <div className="b4__row-id">
                  <span className="b4__row-num">{inv.id}</span>
                  <span className="b4__row-desc">{inv.description}</span>
                </div>
                <div className="b4__row-date">
                  <span>{formatDate(inv.date)}</span>
                  <span className="b4__row-rel">{relTime(inv.date)}</span>
                </div>
                <span className={`b4__status b4__status--${status.tone}`}>
                  <Icon size={9} strokeWidth={2.4} />
                  {status.label}
                </span>
                <span className="b4__row-amount">{formatINR(inv.amount)}</span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="b4__row-detail"
                  >
                    <div className="b4__row-detail-inner">
                      <section className="b4__row-section">
                        <span className="b4__row-section-title">Line items</span>
                        <ul className="b4__row-items">
                          {inv.lineItems.map((li, j) => (
                            <li key={j}>
                              <span className="b4__row-item-label">{li.label}</span>
                              <span className="b4__row-item-qty">{li.qty}</span>
                              <span className={`b4__row-item-amount ${li.amount < 0 ? 'b4__row-item-amount--neg' : ''}`}>
                                {formatINR(li.amount)}
                              </span>
                            </li>
                          ))}
                          <li className="b4__row-items-total">
                            <span className="b4__row-item-label">Total</span>
                            <span />
                            <span className="b4__row-item-amount">{formatINR(inv.amount)}</span>
                          </li>
                        </ul>
                      </section>

                      <section className="b4__row-section">
                        <span className="b4__row-section-title">Payment</span>
                        <div className="b4__row-pay">
                          <span className="b4__row-pay-icon">
                            {inv.paymentKind === 'card' ? (
                              <CreditCard size={14} strokeWidth={2.4} />
                            ) : (
                              <Wallet size={14} strokeWidth={2.4} />
                            )}
                          </span>
                          <div>
                            <span className="b4__row-pay-label">{inv.paymentLabel}</span>
                            <span className="b4__row-pay-sub">{status.label} on {formatDate(inv.date)}</span>
                          </div>
                        </div>
                        <button type="button" className="b4__row-dl">
                          <Download size={11} strokeWidth={2.4} />
                          Download invoice PDF
                        </button>
                      </section>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
