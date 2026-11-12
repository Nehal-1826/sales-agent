import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Crown,
  Download,
  FileText,
  Inbox,
  Info,
  Loader2,
  Receipt,
  RefreshCcw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import {
  buildInvoice,
  useCurrentUsage,
  usePaymentHistory,
  useCancelSubscription,
  useQuickUpgrade,
} from '@/features/billing/api';
import type { Payment, PaymentStatus } from '@/features/billing/types';
import { UpgradeDialog } from './UpgradeDialog';
import { formatMoney, formatDate as _fmtDate, formatNumber } from '@/lib/format';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/AppToast';
import { extractErrorMessage } from '@/lib/errors';
import './starter-billing.css';

/**
 * /app/billing — STARTER tier (B2 Subscription Card).
 *
 * Layout:
 *   ┌─ Hero subscription card ─────────────────┐
 *   │ Plan badge · ACTIVE chip                 │
 *   │ ₹1,500 / month                           │
 *   │ Next renewal · 22 Jun       [Manage]     │
 *   ├─ Usage meters (mailboxes · sends · LLM)  │
 *   ├─ Invoices ──────────────────────────────┤
 *   │ Plan · Date · Amount · Status · DL btn  │
 *   └──────────────────────────────────────────┘
 *
 * Data:
 *   useAuthStore       → current user.plan
 *   /plans (one-shot)  → price + features for the active plan
 *   usePaymentHistory  → invoice rows + next-renewal projection
 *   useCurrentUsage    → mailbox / sends / LLM token meters
 */

interface PlanRow {
  id: string;
  name: string;
  price_monthly?: number;
  price_cents?: number;
  mailbox_limit?: number;
  max_mailboxes?: number;
  features?: string[];
  capabilities?: { features?: string[] } | null;
  daily_email_cap?: number;
}

interface ResolvedPlan {
  id: string;
  name: string;
  priceMonthly: number;
  mailboxCap: number;
  dailyCap: number | null;
  features: string[];
}

const FALLBACK_PRICE: Record<string, number> = {
  free: 0,
  starter: 1500,
  pro: 5000,
  agency: 12_000,
};

export function StarterBilling() {
  const user = useAuthStore((s) => s.user);
  const planSlug = (user?.plan ?? 'starter').toLowerCase();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Plan catalogue — cheap one-shot; cached for 5 min by the global default.
  const plans = useQuery<PlanRow[]>({
    queryKey: ['public', 'plans'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get<PlanRow[] | { plans: PlanRow[] }>('/plans');
      const data = res.data;
      return Array.isArray(data) ? data : Array.isArray(data?.plans) ? data.plans : [];
    },
  });

  const resolvedPlan: ResolvedPlan = useMemo(() => {
    const row = plans.data?.find((p) => p.name.toLowerCase() === planSlug);
    const fallbackPrice = FALLBACK_PRICE[planSlug] ?? 0;
    if (!row) {
      return {
        id: planSlug,
        name: planSlug,
        priceMonthly: fallbackPrice,
        mailboxCap: planSlug === 'starter' ? 1 : 5,
        dailyCap: planSlug === 'starter' ? 50 : null,
        features: [],
      };
    }
    const price = row.price_monthly ?? (typeof row.price_cents === 'number' ? row.price_cents / 100 : fallbackPrice);
    return {
      id: row.id,
      name: row.name,
      priceMonthly: price,
      mailboxCap: row.mailbox_limit ?? row.max_mailboxes ?? 1,
      dailyCap: row.daily_email_cap ?? null,
      features: row.features ?? row.capabilities?.features ?? [],
    };
  }, [plans.data, planSlug]);

  const payments = usePaymentHistory();
  const usage = useCurrentUsage();
  const cancel = useCancelSubscription();
  const quickUpgrade = useQuickUpgrade();

  const handleQuickUpgrade = async (planId: string) => {
    try {
      await quickUpgrade.mutateAsync(planId);
      toast.success('Plan updated successfully.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to update plan.'));
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel Subscription?',
      description: 'Are you sure you want to cancel your subscription? Your mailboxes will be paused.',
      confirmLabel: 'Cancel plan',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync();
      toast.success('Subscription cancelled.');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to cancel subscription.'));
    }
  };

  // Renewal projection — most recent succeeded payment + 30 days.
  const renewalDate = useMemo(() => {
    const lastSucceeded = (payments.data ?? [])
      .filter((p) => p.status === 'succeeded')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!lastSucceeded) return null;
    const d = new Date(lastSucceeded.created_at);
    d.setDate(d.getDate() + 30);
    return d;
  }, [payments.data]);

  const isRefreshing = payments.isFetching || usage.isFetching || plans.isFetching;

  return (
    <div className="sb">
      {/* ----- Header ----- */}
      <header className="sb__head">
        <div>
          <h1 className="sb__title">Billing</h1>
          <p className="sb__sub">
            Your subscription, usage meters, and invoice history. Payments are
            dummy — no card is ever charged.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            payments.refetch();
            usage.refetch();
            plans.refetch();
          }}
          disabled={isRefreshing}
          leftIcon={
            isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )
          }
        >
          Refresh
        </Button>
      </header>

      {/* Dummy-payments banner */}
      <div className="sb-banner">
        <Info size={13} strokeWidth={2.4} />
        <span>
          Dummy payments are active in this environment — your card was never
          charged.
        </span>
      </div>

      {/* ----- Hero subscription card ----- */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="sb-hero"
      >
        <div className="sb-hero__head">
          <span className="sb-hero__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Current subscription
          </span>
          <span className="sb-hero__status">
            <span className="sb-hero__status-dot" />
            Active
          </span>
        </div>

        <div className="sb-hero__plan-row">
          <span className="sb-hero__plan-icon" aria-hidden>
            <Crown size={18} strokeWidth={2.4} />
          </span>
          <h2 className="sb-hero__plan-name">{prettyPlan(resolvedPlan.name)}</h2>
        </div>

        <div className="sb-hero__price-row">
          <span className="sb-hero__currency">₹</span>
          <span className="sb-hero__price">
            {plans.isLoading ? '—' : formatPrice(resolvedPlan.priceMonthly)}
          </span>
          <span className="sb-hero__period">/ month</span>
        </div>

        <div className="sb-hero__meta">
          <span className="sb-hero__meta-item">
            <Calendar size={11} strokeWidth={2.4} />
            {renewalDate
              ? <>Renews <strong>{formatDate(renewalDate)}</strong></>
              : <>No active renewal — your first cycle starts on first payment</>}
          </span>
          <span className="sb-hero__meta-divider" />
          <span className="sb-hero__meta-item">
            <Inbox size={11} strokeWidth={2.4} />
            {resolvedPlan.mailboxCap} {resolvedPlan.mailboxCap === 1 ? 'mailbox' : 'mailboxes'} included
          </span>
          {resolvedPlan.dailyCap && (
            <>
              <span className="sb-hero__meta-divider" />
              <span className="sb-hero__meta-item">
                <Send size={11} strokeWidth={2.4} />
                {resolvedPlan.dailyCap}/day per mailbox
              </span>
            </>
          )}
        </div>

        <div className="sb-hero__actions">
          <div className="flex items-center gap-3">
            <select
              value={planSlug}
              onChange={(e) => handleQuickUpgrade(e.target.value)}
              disabled={quickUpgrade.isPending}
              className="rounded-lg border border-border-muted bg-surface px-3 py-2 text-sm font-semibold focus-ring"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="pro_plus">Pro Plus</option>
              <option value="agency">Agency</option>
            </select>
            {quickUpgrade.isPending && <Loader2 size={16} className="animate-spin text-accent" />}
          </div>
          <button
            onClick={handleCancel}
            disabled={cancel.isPending}
            className="sb-hero__cancel"
            style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {cancel.isPending && <Loader2 size={12} className="animate-spin" />}
            Cancel subscription
          </button>
        </div>
      </motion.section>

      {/* ----- Usage meters ----- */}
      <div className="sb-meters">
        <UsageMeter
          label="Mailboxes"
          Icon={Inbox}
          tone="violet"
          value={usage.data?.mailboxes_used ?? 0}
          cap={usage.data?.mailboxes_cap ?? resolvedPlan.mailboxCap}
          unit="connected"
        />
        <UsageMeter
          label="Sends · this month"
          Icon={Send}
          tone="cyan"
          value={usage.data?.warmup_emails_sent_mtd ?? 0}
          cap={
            resolvedPlan.dailyCap
              ? resolvedPlan.dailyCap * 30
              : (usage.data?.warmup_emails_sent_mtd ?? 0) + 100
          }
          unit="emails"
        />
        <UsageMeter
          label="AI tokens · MTD"
          Icon={Sparkles}
          tone="yellow"
          value={usage.data?.llm_tokens_used_mtd ?? 0}
          cap={usage.data?.llm_tokens_cap ?? 50_000}
          unit="tokens"
          formatValue={fmtCompact}
        />
      </div>

      {/* ----- Invoices ----- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="sb-invoices"
      >
        <header className="sb-invoices__head">
          <div>
            <span className="sb-invoices__eyebrow">
              <Receipt size={11} strokeWidth={2.4} />
              Invoices & receipts
            </span>
            <h3 className="sb-invoices__title">Past payments</h3>
          </div>
          <span className="sb-invoices__count">
            {(payments.data ?? []).length} {((payments.data ?? []).length === 1) ? 'record' : 'records'}
          </span>
        </header>

        {payments.isLoading ? (
          <SkeletonList />
        ) : (payments.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No invoices yet"
            description="Your first payment will appear here once you upgrade."
          />
        ) : (
          <ul className="sb-inv__list" role="list">
            {(payments.data ?? []).map((p, i) => (
              <InvoiceRow key={p.id} payment={p} idx={i} />
            ))}
          </ul>
        )}
      </motion.section>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}

/* ============================================================================
   Usage meter
============================================================================ */
function UsageMeter({
  label,
  Icon,
  tone,
  value,
  cap,
  unit,
  formatValue,
}: {
  label: string;
  Icon: typeof Inbox;
  tone: 'violet' | 'cyan' | 'yellow';
  value: number;
  cap: number;
  unit: string;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue ?? ((n: number) => formatNumber(n));
  const safeCap = Math.max(1, cap);
  const pct = Math.min(100, Math.round((value / safeCap) * 100));
  const danger = pct >= 90;
  return (
    <div className={`sb-meter sb-meter--${tone}`}>
      <span className={`sb-meter__icon sb-meter__icon--${tone}`}>
        <Icon size={13} strokeWidth={2.4} />
      </span>
      <div className="sb-meter__body">
        <div className="sb-meter__head">
          <span className="sb-meter__label">{label}</span>
          <span className={`sb-meter__val ${danger ? 'sb-meter__val--danger' : ''}`}>
            {fmt(value)} <span className="sb-meter__cap">/ {fmt(cap)}</span>
          </span>
        </div>
        <div className="sb-meter__track">
          <motion.div
            className={`sb-meter__fill sb-meter__fill--${tone} ${danger ? 'sb-meter__fill--danger' : ''}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <span className="sb-meter__foot">{pct}% of {unit} cap</span>
      </div>
    </div>
  );
}

/* ============================================================================
   Invoice row
============================================================================ */
function InvoiceRow({ payment, idx }: { payment: Payment; idx: number }) {
  const invoice = useMemo(() => buildInvoice(payment), [payment]);

  const handleDownload = () => {
    // Client-side text invoice for the dummy flow — keeps a record without
    // hitting the backend invoice endpoint (which doesn't always exist).
    const lines = [
      `WarmPulse — Invoice ${invoice.invoice_number}`,
      `Date: ${formatDate(new Date(invoice.date))}`,
      `Plan: ${invoice.plan_name}`,
      `Amount: ₹${(invoice.amount_cents / 100).toFixed(2)}`,
      `Tax: ₹${(invoice.tax_cents / 100).toFixed(2)}`,
      `Total: ₹${(invoice.total_cents / 100).toFixed(2)}`,
      ``,
      `Billed to: ${invoice.billing_address}`,
      `Issued by: ${invoice.issuer_address}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoice_number}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: idx * 0.04 }}
      className="sb-inv__row"
    >
      <span className="sb-inv__icon" aria-hidden>
        <FileText size={13} strokeWidth={2.2} />
      </span>
      <div className="sb-inv__main">
        <span className="sb-inv__plan">{prettyPlan(payment.plan_name)}</span>
        <span className="sb-inv__num">{invoice.invoice_number}</span>
      </div>
      <span className="sb-inv__date">{formatDate(new Date(payment.created_at))}</span>
      <span className="sb-inv__amount">₹{(payment.amount_cents / 100).toFixed(0)}</span>
      <StatusPill status={payment.status} />
      <button
        type="button"
        className="sb-inv__dl"
        onClick={handleDownload}
        aria-label="Download invoice"
        title="Download invoice"
      >
        <Download size={12} strokeWidth={2.4} />
      </button>
    </motion.li>
  );
}

function StatusPill({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
    succeeded: { label: 'Paid', tone: 'ok', Icon: CheckCircle2 },
    pending: { label: 'Pending', tone: 'warn', Icon: Loader2 },
    failed: { label: 'Failed', tone: 'err', Icon: XCircle },
    refunded: { label: 'Refunded', tone: 'warn', Icon: ArrowRight },
  };
  const info = map[status];
  const Icon = info.Icon;
  return (
    <span className={`sb-inv__status sb-inv__status--${info.tone}`}>
      <Icon size={10} strokeWidth={2.6} />
      {info.label}
    </span>
  );
}

function SkeletonList() {
  return (
    <ul className="sb-inv__list" role="list" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="sb-inv__row sb-inv__row--skeleton">
          <span className="sb-inv__icon sb-inv__icon--dim" />
          <div className="sb-inv__main">
            <span className="sb-skel sb-skel--w-24" />
            <span className="sb-skel sb-skel--w-32" />
          </div>
          <span className="sb-skel sb-skel--w-16" />
          <span className="sb-skel sb-skel--w-12" />
          <span className="sb-skel sb-skel--w-12" />
          <span className="sb-skel sb-skel--w-10" />
        </li>
      ))}
    </ul>
  );
}

/* ============================================================================
   Helpers
============================================================================ */
function prettyPlan(p: string): string {
  if (!p) return 'Free';
  const lower = p.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatPrice(p: number): string {
  if (!p) return '0';
  return formatMoney(p);
}

function formatDate(d: Date): string {
  return _fmtDate(d);
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return formatNumber(n);
}

export default StarterBilling;
