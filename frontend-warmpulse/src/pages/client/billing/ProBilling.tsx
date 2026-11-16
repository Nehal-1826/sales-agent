import { useState } from 'react';
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
  Eye,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  Shield,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  useCurrentUsage,
  useDownloadInvoice,
  useMonthlySpend,
  usePaymentHistory,
  usePaymentMethods,
} from '@/features/billing/api';
import { useWorkspace } from '@/features/workspace/api';
import { toast } from '@/components/ui/AppToast';
import type { Payment, PaymentStatus } from '@/features/billing/types';
import { AddPaymentMethodDialog } from './AddPaymentMethodDialog';
import { InvoiceDialog } from './InvoiceDialog';
import { UpgradeDialog } from './UpgradeDialog';
import { formatMoney, formatDate as _fmtDate, formatNumber } from '@/lib/format';
// TODO: lift pro-billing.css into pages/client/billing/ in a follow-up.
import '@/pages/client-design-preview/pro-billing/pro-billing.css';

/**
 * /app/billing for Pro tier — B6 Bento Hub with real data.
 *
 * Maps real Payment[] history → "Invoices" + "Payment methods" (derived from
 * the unique card last-4 / UPI VPAs across payments). Real CurrentUsage for
 * the meter. Real MonthlySpend for the 6-month trend.
 */

const STATUS_META: Record<PaymentStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  succeeded: { label: 'Paid', tone: 'success', Icon: CheckCircle2 },
  pending: { label: 'Pending', tone: 'warn', Icon: Clock },
  failed: { label: 'Failed', tone: 'danger', Icon: XCircle },
  refunded: { label: 'Refunded', tone: 'info', Icon: RefreshCw },
};

function formatINR(cents: number): string {
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  const formatted = formatMoney(abs);
  return sign ? `${sign}${formatted}` : formatted;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return _fmtDate(d);
}

export function ProBilling() {
  const paymentsQuery = usePaymentHistory();
  const methodsQuery = usePaymentMethods();
  const usageQuery = useCurrentUsage();
  const spendQuery = useMonthlySpend();
  const workspaceQuery = useWorkspace();
  const download = useDownloadInvoice();

  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [invoicePayment, setInvoicePayment] = useState<Payment | null>(null);

  const payments = paymentsQuery.data ?? [];
  const methods = methodsQuery.data ?? [];
  const usage = usageQuery.data;
  const spend = spendQuery.data ?? [];
  const ws = workspaceQuery.data;

  // Method registrations are zero-amount rows tagged with ``method_*``;
  // they're useful for the methods card but shouldn't appear as "real"
  // paid invoices.
  const realPayments = payments.filter((p) => {
    const m = p.payment_method ?? '';
    return !m.startsWith('method_');
  });
  const succeededPayments = realPayments.filter(
    (p) => p.status === 'succeeded',
  );
  const latestPayment = succeededPayments[0];
  const monthlyAmount = latestPayment?.amount_cents ?? 0;

  const handleDownloadInvoice = (p: Payment) => {
    download.mutate(
      { paymentId: p.id, format: 'pdf' },
      {
        onSuccess: () => toast.success('Invoice downloaded.'),
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: unknown } } })
            .response?.data?.detail;
          toast.error(
            typeof detail === 'string'
              ? detail
              : 'Could not download invoice.',
          );
        },
      },
    );
  };

  // Next charge: 30 days after latest succeeded payment.
  const nextChargeDate = latestPayment
    ? (() => {
        const d = new Date(latestPayment.created_at);
        d.setDate(d.getDate() + 30);
        return formatDate(d.toISOString());
      })()
    : '—';
  const cycleProgress = latestPayment
    ? (() => {
        const created = new Date(latestPayment.created_at).getTime();
        const elapsed = Date.now() - created;
        return Math.min(100, Math.max(0, (elapsed / (30 * 86400000)) * 100));
      })()
    : 0;
  const daysRemaining = latestPayment
    ? Math.max(
        0,
        30 -
          Math.floor(
            (Date.now() - new Date(latestPayment.created_at).getTime()) / 86400000,
          ),
      )
    : 0;

  const spendForChart = spend.length > 0 ? spend.slice(-6) : [];
  const trendMax = Math.max(...spendForChart.map((s) => s.amount_cents), 1);

  return (
    <div className="b6">
      <header className="b6__head">
        <span className="b6__eyebrow">
          <Wallet size={11} strokeWidth={2.4} />
          Billing & payments
        </span>
        <h2 className="b6__head-title">
          {ws?.name ?? 'Workspace'} · {(ws?.plan ?? 'pro').toUpperCase()} plan
        </h2>
        <p className="b6__head-sub">
          Everything money-related, one screen.
        </p>
      </header>

      <div className="b6__grid">
        {/* Subscription hero */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="b6__card b6__card--hero"
        >
          <header className="b6__hero-head">
            <span className="b6__hero-badge">
              <Crown size={11} strokeWidth={2.4} />
              {(ws?.plan ?? 'pro').toUpperCase()} · monthly
            </span>
            <button
              type="button"
              className="b6__hero-link"
              onClick={() => setManageOpen(true)}
            >
              Manage <ArrowUpRight size={11} strokeWidth={2.4} />
            </button>
          </header>
          <div className="b6__hero-amount">
            <span className="b6__hero-currency">₹</span>
            <span className="b6__hero-num">
              {monthlyAmount > 0
                ? formatMoney(monthlyAmount / 100)
                : '—'}
            </span>
            <span className="b6__hero-period">/ month</span>
          </div>
          <span className="b6__hero-next">
            Next charge: <strong>{nextChargeDate}</strong>
          </span>
          <div className="b6__hero-meter">
            <div
              className="b6__hero-meter-fill"
              style={{ width: `${cycleProgress}%` }}
            />
          </div>
          <span className="b6__hero-meter-lbl">
            {Math.round(cycleProgress)}% of 30-day cycle · {daysRemaining} days remaining
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
              <span className="b6__card-meta">{methods.length} on file</span>
            </div>
            <button
              type="button"
              className="b6__card-add"
              onClick={() => setAddOpen(true)}
              aria-label="Add payment method"
            >
              <Plus size={11} strokeWidth={2.4} />
            </button>
          </header>
          <ul className="b6__pm-list">
            {methods.length === 0 ? (
              <li
                style={{
                  padding: 10,
                  color: 'var(--wp-text-faint)',
                  fontSize: 11,
                  fontStyle: 'italic',
                }}
              >
                No payment methods yet.
              </li>
            ) : (
              methods.slice(0, 3).map((pm) => (
                <li key={pm.id}>
                  <span className={`b6__pm-icon b6__pm-icon--${pm.kind}`}>
                    {pm.kind === 'card' ? (
                      <CreditCard size={11} strokeWidth={2.4} />
                    ) : (
                      <Wallet size={11} strokeWidth={2.4} />
                    )}
                  </span>
                  <div className="b6__pm-text">
                    <span className="b6__pm-label">{pm.label}</span>
                    <span className="b6__pm-sub">{pm.sub}</span>
                  </div>
                  {pm.is_default && (
                    <span className="b6__pill b6__pill--default">Default</span>
                  )}
                </li>
              ))
            )}
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
              <span className="b6__card-meta">{realPayments.length} total</span>
            </div>
          </header>
          <ul className="b6__inv-list">
            {realPayments.length === 0 ? (
              <li
                style={{
                  padding: 10,
                  color: 'var(--wp-text-faint)',
                  fontSize: 11,
                  fontStyle: 'italic',
                }}
              >
                No payments yet.
              </li>
            ) : (
              realPayments.slice(0, 3).map((p) => {
                const s = STATUS_META[p.status];
                const Icon = s.Icon;
                return (
                  <li key={p.id}>
                    <div className="b6__inv-text">
                      <span className="b6__inv-id">
                        {p.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="b6__inv-date">
                        {formatDate(p.created_at)}
                      </span>
                    </div>
                    <span className={`b6__status b6__status--${s.tone}`}>
                      <Icon size={8} strokeWidth={2.4} />
                      {s.label}
                    </span>
                    <span className="b6__inv-amount">
                      {formatINR(p.amount_cents)}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button
                        type="button"
                        className="b6__inv-dl"
                        onClick={() => setInvoicePayment(p)}
                        aria-label={`View invoice ${p.id.slice(0, 8)}`}
                        title="View invoice"
                      >
                        <Eye size={10} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        className="b6__inv-dl"
                        onClick={() => handleDownloadInvoice(p)}
                        disabled={download.isPending}
                        aria-label={`Download invoice ${p.id.slice(0, 8)}`}
                        title="Download invoice"
                      >
                        <Download size={10} strokeWidth={2.4} />
                      </button>
                    </span>
                  </li>
                );
              })
            )}
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
              <span className="b6__card-eyebrow">Monthly spending</span>
              <span className="b6__card-meta">
                {spendForChart.length} month{spendForChart.length === 1 ? '' : 's'} of data
              </span>
            </div>
          </header>
          {spendForChart.length === 0 ? (
            <div className="b6__empty" style={{ padding: 24, fontSize: 11, color: 'var(--wp-text-faint)', fontStyle: 'italic' }}>
              Spending history will appear after your first payment.
            </div>
          ) : (
            <div className="b6__trend">
              {spendForChart.map((m, i) => {
                const h = (m.amount_cents / trendMax) * 100;
                const isCurrent = i === spendForChart.length - 1;
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
                    <span className="b6__trend-month">{m.month.slice(-2)}</span>
                    <span className="b6__trend-amount">{formatINR(m.amount_cents)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* Tax & legal — placeholder until backend exposes billing address */}
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
              <span className="b6__card-meta">India</span>
            </div>
          </header>
          <ul className="b6__list">
            <li>
              <span className="b6__list-lbl">Workspace</span>
              <span className="b6__list-val">{ws?.name ?? '—'}</span>
            </li>
            <li>
              <span className="b6__list-lbl">GSTIN</span>
              <span className="b6__list-val b6__mono">— add in Settings</span>
            </li>
            <li>
              <span className="b6__list-lbl">Currency</span>
              <span className="b6__list-val">INR</span>
            </li>
          </ul>
        </motion.section>

        {/* Alerts — derived from usage */}
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
              <span className="b6__card-meta">
                {usage ? 'live' : 'no data'}
              </span>
            </div>
          </header>
          <ul className="b6__alerts">
            {usage && usage.mailboxes_used >= usage.mailboxes_cap && (
              <li className="b6__alert b6__alert--warn">
                <AlertTriangle size={11} strokeWidth={2.4} />
                <div>
                  <span className="b6__alert-title">Mailbox cap reached</span>
                  <span className="b6__alert-sub">
                    {usage.mailboxes_used} / {usage.mailboxes_cap} used
                  </span>
                </div>
              </li>
            )}
            {usage &&
              usage.llm_tokens_used_mtd >= usage.llm_tokens_cap * 0.8 && (
                <li className="b6__alert b6__alert--info">
                  <Shield size={11} strokeWidth={2.4} />
                  <div>
                    <span className="b6__alert-title">AI token usage high</span>
                    <span className="b6__alert-sub">
                      {formatNumber(usage.llm_tokens_used_mtd)} /{' '}
                      {formatNumber(usage.llm_tokens_cap)} this month
                    </span>
                  </div>
                </li>
              )}
            {(!usage ||
              (usage.mailboxes_used < usage.mailboxes_cap &&
                usage.llm_tokens_used_mtd < usage.llm_tokens_cap * 0.8)) && (
              <li
                style={{
                  padding: 10,
                  color: 'var(--wp-text-faint)',
                  fontSize: 11,
                  fontStyle: 'italic',
                }}
              >
                No alerts — usage is within plan limits.
              </li>
            )}
          </ul>
        </motion.section>
      </div>

      <AddPaymentMethodDialog open={addOpen} onOpenChange={setAddOpen} />
      <UpgradeDialog open={manageOpen} onOpenChange={setManageOpen} />
      <InvoiceDialog
        open={invoicePayment !== null}
        payment={invoicePayment}
        onOpenChange={(o) => !o && setInvoicePayment(null)}
      />
    </div>
  );
}

export default ProBilling;
