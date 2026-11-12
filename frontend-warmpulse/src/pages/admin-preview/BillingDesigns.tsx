import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  Globe,
  Landmark,
  LineChart,
  Receipt,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import './billing-designs.css';

export function BillingDesigns() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [picked, setPicked] = useState<DesignCode | null>(null);

  const go = (dir: 1 | -1) => {
    setDirection(dir);
    setIndex((i) => (i + dir + DESIGNS.length) % DESIGNS.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 80) go(-1);
    else if (info.offset.x < -80) go(1);
  };

  const design = DESIGNS[index]!;
  const isPicked = picked === design.code;

  return (
    <div className="bld">
      <div className="bld__atmosphere" aria-hidden>
        <div className="bld__aurora-1" />
        <div className="bld__aurora-2" />
      </div>

      <header className="bld__head">
        <Link to="/admin/payments" className="bld__back">
          ← Back (Billing is a new section — once you pick, it lives at /admin/billing)
        </Link>
        <div className="bld__head-row">
          <div>
            <span className="bld__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Billing design
            </span>
            <h1 className="bld__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="bld__sub">{design.tagline}</p>
          </div>
          <div className="bld__counter">
            <span className="bld__counter-now">{index + 1}</span>
            <span className="bld__counter-sep">/</span>
            <span className="bld__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="bld__stage">
        <button type="button" className="bld__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="bld__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="bld__slide"
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={onDragEnd}
            >
              <design.Full />
            </motion.div>
          </AnimatePresence>
        </div>
        <button type="button" className="bld__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="bld__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`bld__dot ${i === index ? 'bld__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="bld__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="bld__bullets-row">
        <ul className="bld__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`bld__pick ${isPicked ? 'bld__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="bld__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build billing-{picked}</code> and I'll wire it up at /admin/billing
          (route + sidebar nav entry).
        </div>
      ) : (
        <div className="bld__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'revenue-cockpit' | 'customer-ledger' | 'transaction-stream' | 'currency-matrix';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Wallet;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock paid users + payments
// ---------------------------------------------------------------------------

interface PaidUser {
  email: string;
  workspace: string;
  plan: 'Starter' | 'Growth' | 'Scale' | 'Enterprise';
  currency: 'USD' | 'INR' | 'EUR' | 'GBP';
  method: 'card' | 'upi' | 'wire' | 'paypal';
  monthly: number;          // amount in their currency
  monthlyUsd: number;       // FX-converted for the overview
  lifetime: number;         // total paid in USD
  lastPaymentAt: string;
  nextRenewalAt: string;
  status: 'active' | 'past_due' | 'cancelled';
  hue: number;
}

const PAID_USERS: PaidUser[] = [
  { email: 'alex@acme.co',        workspace: 'Acme',        plan: 'Scale',      currency: 'USD', method: 'card', monthly: 249,    monthlyUsd: 249,   lifetime: 4980,  lastPaymentAt: 'May 04', nextRenewalAt: 'Jun 04', status: 'active',   hue: 260 },
  { email: 'tk@beacon.app',       workspace: 'Beacon',      plan: 'Scale',      currency: 'EUR', method: 'wire', monthly: 229,    monthlyUsd: 248,   lifetime: 4960,  lastPaymentAt: 'May 02', nextRenewalAt: 'Jun 02', status: 'active',   hue: 140 },
  { email: 'priya@northwind.io',  workspace: 'Northwind',   plan: 'Growth',     currency: 'USD', method: 'card', monthly: 89,     monthlyUsd: 89,    lifetime: 1602,  lastPaymentAt: 'May 06', nextRenewalAt: 'Jun 06', status: 'active',   hue: 320 },
  { email: 'mei@hibou.co',        workspace: 'Hibou',       plan: 'Scale',      currency: 'GBP', method: 'card', monthly: 199,    monthlyUsd: 252,   lifetime: 5040,  lastPaymentAt: 'May 09', nextRenewalAt: 'Jun 09', status: 'active',   hue: 220 },
  { email: 'devika@parable.in',   workspace: 'Parable',     plan: 'Growth',     currency: 'INR', method: 'upi',  monthly: 7400,   monthlyUsd: 89,    lifetime: 1424,  lastPaymentAt: 'May 11', nextRenewalAt: 'Jun 11', status: 'active',   hue: 280 },
  { email: 'sofia@vendio.io',     workspace: 'Vendio',      plan: 'Growth',     currency: 'USD', method: 'card', monthly: 89,     monthlyUsd: 89,    lifetime: 712,   lastPaymentAt: 'May 08', nextRenewalAt: 'Jun 08', status: 'active',   hue: 30 },
  { email: 'el@oxenstudio.com',   workspace: 'Oxen',        plan: 'Growth',     currency: 'EUR', method: 'paypal', monthly: 79,   monthlyUsd: 86,    lifetime: 1032,  lastPaymentAt: 'May 03', nextRenewalAt: 'Jun 03', status: 'past_due', hue: 160 },
  { email: 'marcus@lumenlabs.dev',workspace: 'Lumen Labs',  plan: 'Starter',    currency: 'USD', method: 'card', monthly: 29,     monthlyUsd: 29,    lifetime: 232,   lastPaymentAt: 'May 12', nextRenewalAt: 'Jun 12', status: 'active',   hue: 200 },
  { email: 'sales@globex.io',     workspace: 'Globex',      plan: 'Enterprise', currency: 'USD', method: 'wire', monthly: 1700,   monthlyUsd: 1700,  lifetime: 20400, lastPaymentAt: 'May 01', nextRenewalAt: 'Jun 01', status: 'active',   hue: 90 },
  { email: 'rk@kavach.co.in',     workspace: 'Kavach',      plan: 'Starter',    currency: 'INR', method: 'upi',  monthly: 2400,   monthlyUsd: 29,    lifetime: 174,   lastPaymentAt: 'May 10', nextRenewalAt: 'Jun 10', status: 'active',   hue: 40 },
];

const CURRENCIES: Record<PaidUser['currency'], { symbol: string; flag: string; label: string; color: string }> = {
  USD: { symbol: '$', flag: '🇺🇸', label: 'US Dollar',     color: '#FF8A4B' },
  INR: { symbol: '₹', flag: '🇮🇳', label: 'Indian Rupee',  color: '#f472b6' },
  EUR: { symbol: '€', flag: '🇪🇺', label: 'Euro',          color: 'var(--wp-accent)' },
  GBP: { symbol: '£', flag: '🇬🇧', label: 'British Pound', color: '#fbbf24' },
};

const METHODS: Record<PaidUser['method'], { label: string; icon: typeof CreditCard }> = {
  card:    { label: 'Card',   icon: CreditCard },
  upi:     { label: 'UPI',    icon: BadgeDollarSign },
  wire:    { label: 'Wire',   icon: Landmark },
  paypal:  { label: 'PayPal', icon: Wallet },
};

function totalMrrUsd() {
  return PAID_USERS.reduce((a, u) => a + (u.status === 'active' ? u.monthlyUsd : 0), 0);
}
function totalLifetimeUsd() {
  return PAID_USERS.reduce((a, u) => a + u.lifetime, 0);
}
function activeCount() {
  return PAID_USERS.filter((u) => u.status === 'active').length;
}

function Avatar({ hue, label }: { hue: number; label: string }) {
  return (
    <span
      className="bld-avatar"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 56%), hsl(${hue + 40} 65% 48%))` }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ===========================================================================
// 1) REVENUE COCKPIT — multi-chart revenue overview
// ===========================================================================
function FullRevenueCockpit() {
  const mrr = totalMrrUsd();
  const lifetime = totalLifetimeUsd();
  const active = activeCount();
  const arpu = Math.round(mrr / active);

  return (
    <div className="page page--cockpit">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Billing · Revenue</div>
        <div className="page__count">
          <Wallet size={11} strokeWidth={2.4} />
          {active} paying workspaces · MTD
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Revenue cockpit</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--ghost"><Download size={12} />Invoice CSV</button>
          <button className="btn btn--solid">Reconcile</button>
        </div>
      </div>

      {/* Top stats */}
      <div className="rev-strip">
        {[
          { label: 'MRR (USD)', value: `$${mrr.toLocaleString()}`, delta: '+6.4%', up: true },
          { label: 'Lifetime collected', value: `$${lifetime.toLocaleString()}`, delta: '+$1.4k', up: true },
          { label: 'Paying users', value: active, delta: '+3', up: true },
          { label: 'ARPU', value: `$${arpu}`, delta: '+$2.10', up: true },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="rev-stat"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <span className="rev-stat__label">{s.label}</span>
            <span className="rev-stat__num">{s.value}</span>
            <span className={`rev-stat__delta rev-stat__delta--${s.up ? 'up' : 'down'}`}>
              {s.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{s.delta}
            </span>
          </motion.div>
        ))}
      </div>

      <div className="rev-grid">
        {/* Big revenue chart */}
        <div className="rev-card rev-card--big">
          <div className="rev-card__head">
            <span className="bld__eyebrow"><LineChart size={11} />MRR growth · 12 weeks</span>
            <span className="bld__pill bld__pill--ok">+12% qtr</span>
          </div>
          <svg viewBox="0 0 480 160" preserveAspectRatio="none" className="rev-card__chart">
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wp-accent)" stopOpacity="0.55" />
                <stop offset="1" stopColor="var(--wp-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {(() => {
              const series = [4800, 5200, 5400, 5800, 6200, 6400, 6800, 7100, 7400, 7800, 8200, 8800];
              const max = Math.max(...series);
              const stepX = 480 / (series.length - 1);
              const pts = series.map((v, i) => `${i * stepX},${160 - (v / max) * 140 - 8}`).join(' ');
              const area = `0,160 ${pts} ${(series.length - 1) * stepX},160`;
              return (
                <>
                  <motion.polygon points={area} fill="url(#rev-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }} />
                  <motion.polyline points={pts} fill="none" stroke="var(--wp-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeOut' }} />
                </>
              );
            })()}
          </svg>
        </div>

        {/* Currency donut */}
        <div className="rev-card">
          <div className="rev-card__head">
            <span className="bld__eyebrow"><Globe size={11} />By currency (USD eq.)</span>
          </div>
          <div className="rev-donut">
            <svg viewBox="0 0 60 60">
              {(() => {
                const totals: Record<string, number> = {};
                for (const u of PAID_USERS) {
                  if (u.status !== 'active') continue;
                  totals[u.currency] = (totals[u.currency] ?? 0) + u.monthlyUsd;
                }
                const all = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
                const r = 22;
                const c = 2 * Math.PI * r;
                let offset = 0;
                return (Object.keys(totals) as PaidUser['currency'][]).map((cur, i) => {
                  const share = totals[cur]! / all;
                  const len = share * c;
                  const el = (
                    <motion.circle
                      key={cur}
                      cx="30" cy="30" r={r}
                      stroke={CURRENCIES[cur].color}
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${len} ${c - len}`}
                      strokeDashoffset={-offset}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.45, delay: 0.1 + i * 0.12 }}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                  );
                  offset += len;
                  return el;
                });
              })()}
            </svg>
            <div className="rev-donut__center">
              <span className="rev-donut__num">${mrr.toLocaleString()}</span>
              <span className="rev-donut__label">MRR</span>
            </div>
          </div>
          <div className="rev-legend">
            {(Object.keys(CURRENCIES) as PaidUser['currency'][]).map((c) => (
              <span key={c}>
                <span className="rev-sw" style={{ background: CURRENCIES[c].color }} />
                {CURRENCIES[c].flag} {c}
              </span>
            ))}
          </div>
        </div>

        {/* Top payers */}
        <div className="rev-card rev-card--wide">
          <div className="rev-card__head">
            <span className="bld__eyebrow"><Users size={11} />Top payers (lifetime)</span>
            <span className="bld__pill">{PAID_USERS.length} workspaces</span>
          </div>
          <div className="rev-clients">
            {[...PAID_USERS].sort((a, b) => b.lifetime - a.lifetime).slice(0, 6).map((u, i) => (
              <motion.div
                key={u.email} className="rev-client"
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
              >
                <span className="rev-client__rank">#{i + 1}</span>
                <Avatar hue={u.hue} label={u.workspace} />
                <div className="rev-client__id">
                  <div className="rev-client__ws">{u.workspace}</div>
                  <div className="rev-client__email">{u.email}</div>
                </div>
                <span className={`u-plan u-plan--${u.plan.toLowerCase()}`}>{u.plan}</span>
                <span className="rev-client__cur">
                  {CURRENCIES[u.currency].flag} {CURRENCIES[u.currency].symbol}{u.monthly.toLocaleString()}
                </span>
                <span className="rev-client__bar">
                  <motion.span className="rev-client__fill"
                    initial={{ width: 0 }} animate={{ width: `${(u.lifetime / PAID_USERS[0]!.lifetime) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.3 + i * 0.05 }}
                  />
                </span>
                <span className="rev-client__amount">${u.lifetime.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2) CUSTOMER LEDGER — paid-users-centric roster with payment history
// ===========================================================================
function FullCustomerLedger() {
  return (
    <div className="page page--ledger">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Billing · Customers</div>
        <div className="page__count">
          <Users size={11} strokeWidth={2.4} />
          {PAID_USERS.length} paying workspaces · {activeCount()} active
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Customer ledger</h2>
        <div className="page__actions">
          <div className="srch">
            <Search size={13} strokeWidth={2.4} />
            <input className="srch__input" placeholder="Find a customer…" />
          </div>
          <button className="btn btn--ghost">Status <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Download size={12} />Export ledger</button>
        </div>
      </div>

      <div className="led">
        <div className="led__row led__row--head">
          <span>Customer</span>
          <span>Plan</span>
          <span>Currency · method</span>
          <span className="led__num">Monthly</span>
          <span className="led__num">Lifetime (USD)</span>
          <span>Status</span>
          <span>Next renewal</span>
          <span />
        </div>
        {PAID_USERS.map((u, i) => (
          <motion.div
            key={u.email}
            className="led__row"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.04 }}
          >
            <span className="led__cust">
              <Avatar hue={u.hue} label={u.workspace} />
              <div className="led__cust-id">
                <div className="led__cust-ws">{u.workspace}</div>
                <div className="led__cust-email">{u.email}</div>
              </div>
            </span>
            <span><span className={`u-plan u-plan--${u.plan.toLowerCase()}`}>{u.plan}</span></span>
            <span className="led__method">
              <span className="led__cur">{CURRENCIES[u.currency].flag} {u.currency}</span>
              <span className="led__sep">·</span>
              <span className="led__mthd">{METHODS[u.method].label}</span>
            </span>
            <span className="led__num">
              {CURRENCIES[u.currency].symbol}{u.monthly.toLocaleString()}
              {u.currency !== 'USD' && (
                <span className="led__num-sub">≈ ${u.monthlyUsd}</span>
              )}
            </span>
            <span className="led__num led__num--big">${u.lifetime.toLocaleString()}</span>
            <span><StatusPill status={u.status} /></span>
            <span className="led__renewal">
              <CalendarClock size={11} strokeWidth={2.4} />
              {u.nextRenewalAt}
            </span>
            <button className="led__more" title="Open invoice history">→</button>
          </motion.div>
        ))}
        <div className="led__foot">
          <div>
            <span className="led__foot-label">Showing</span>
            <strong>{PAID_USERS.length} of {PAID_USERS.length}</strong>
          </div>
          <div>
            <span className="led__foot-label">Lifetime total</span>
            <strong>${totalLifetimeUsd().toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PaidUser['status'] }) {
  return <span className={`bld-pill bld-pill--${status}`}>{status.replace('_', ' ')}</span>;
}

// ===========================================================================
// 3) TRANSACTION STREAM — chronological payments feed
// ===========================================================================
function FullTransactionStream() {
  const events = [
    { t: '2 min ago', user: PAID_USERS[8]!, amount: 1700, status: 'succeeded' as const, kind: 'renewal' },
    { t: '14 min ago', user: PAID_USERS[5]!, amount: 89, status: 'succeeded' as const, kind: 'renewal' },
    { t: '38 min ago', user: PAID_USERS[2]!, amount: 89, status: 'succeeded' as const, kind: 'renewal' },
    { t: '1 hr ago', user: PAID_USERS[6]!, amount: 79, status: 'failed' as const, kind: 'auto-retry' },
    { t: '2 hr ago', user: PAID_USERS[9]!, amount: 2400, status: 'succeeded' as const, kind: 'new' },
    { t: '4 hr ago', user: PAID_USERS[0]!, amount: 249, status: 'succeeded' as const, kind: 'renewal' },
    { t: '6 hr ago', user: PAID_USERS[3]!, amount: 199, status: 'succeeded' as const, kind: 'renewal' },
    { t: 'yesterday', user: PAID_USERS[7]!, amount: 29, status: 'succeeded' as const, kind: 'new' },
    { t: 'yesterday', user: PAID_USERS[1]!, amount: 229, status: 'succeeded' as const, kind: 'renewal' },
  ];
  const succeeded = events.filter((e) => e.status === 'succeeded');
  return (
    <div className="page page--stream">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Billing · Transactions</div>
        <div className="page__count">
          <Receipt size={11} strokeWidth={2.4} />
          live transaction feed
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Transaction stream</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">All statuses <ChevronDown size={11} /></button>
          <button className="btn btn--ghost">All methods <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Download size={12} />Export</button>
        </div>
      </div>

      <div className="page__chips">
        {['All', 'Succeeded', 'Pending', 'Failed', 'Refunded'].map((c, i) => (
          <span key={c} className={`tm-chip ${i === 0 ? 'tm-chip--active' : ''}`}>{c}</span>
        ))}
      </div>

      <div className="tx">
        <div className="tx__live">
          <span className="tx__live-dot" />
          live · {succeeded.length} successful · ${succeeded.reduce((a, e) => a + e.amount, 0).toLocaleString()} in last 24h
        </div>
        {events.map((e, i) => (
          <motion.div
            key={i}
            className={`tx-row tx-row--${e.status}`}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.04 }}
          >
            <span className="tx-row__t">
              <Clock size={11} strokeWidth={2.4} />
              {e.t}
            </span>
            <span className="tx-row__rail">
              <span className={`tx-row__dot tx-row__dot--${e.status}`} />
              {i !== events.length - 1 && <span className="tx-row__line" />}
            </span>
            <div className="tx-row__body">
              <div className="tx-row__head">
                <span className={`tx-row__status tx-row__status--${e.status}`}>{e.status}</span>
                <span className={`tx-row__kind tx-row__kind--${e.kind}`}>{e.kind}</span>
                <span className="tx-row__user">
                  <Avatar hue={e.user.hue} label={e.user.workspace} />
                  <strong>{e.user.workspace}</strong>
                  <span className="tx-row__email">{e.user.email}</span>
                </span>
              </div>
              <div className="tx-row__meta">
                <span><span className="tx-row__label">Method</span> {METHODS[e.user.method].label}</span>
                <span><span className="tx-row__label">Currency</span> {CURRENCIES[e.user.currency].flag} {e.user.currency}</span>
                <span><span className="tx-row__label">Plan</span> {e.user.plan}</span>
              </div>
            </div>
            <div className="tx-row__amount">
              {CURRENCIES[e.user.currency].symbol}{e.amount.toLocaleString()}
              {e.user.currency !== 'USD' && (
                <span className="tx-row__amount-sub">≈ ${e.user.monthlyUsd}</span>
              )}
            </div>
            {e.status === 'failed' && (
              <div className="tx-row__alert">
                <AlertTriangle size={11} />
                Will auto-retry in 24h
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 4) CURRENCY MATRIX — multi-currency overview, one card per currency
// ===========================================================================
function FullCurrencyMatrix() {
  const totals: Record<string, { collected: number; usd: number; count: number; users: PaidUser[] }> = {};
  for (const u of PAID_USERS) {
    if (u.status !== 'active') continue;
    const e = totals[u.currency] ?? { collected: 0, usd: 0, count: 0, users: [] as PaidUser[] };
    e.collected += u.monthly;
    e.usd += u.monthlyUsd;
    e.count += 1;
    e.users.push(u);
    totals[u.currency] = e;
  }

  return (
    <div className="page page--currency">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Billing · Currencies</div>
        <div className="page__count">
          <Globe size={11} strokeWidth={2.4} />
          4 currencies tracked · auto-FX to USD
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Currency matrix</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">FX rates <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Download size={12} />Export</button>
        </div>
      </div>

      <div className="cur-grid">
        {(Object.keys(CURRENCIES) as PaidUser['currency'][]).map((cur, idx) => {
          const t = totals[cur] ?? { collected: 0, usd: 0, count: 0, users: [] };
          const share = totalMrrUsd() > 0 ? Math.round((t.usd / totalMrrUsd()) * 100) : 0;
          return (
            <motion.div
              key={cur}
              className="cur-card"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + idx * 0.08 }}
              style={{ ['--cur-tone' as string]: CURRENCIES[cur].color }}
            >
              <div className="cur-card__h">
                <span className="cur-card__flag">{CURRENCIES[cur].flag}</span>
                <div>
                  <div className="cur-card__code">{cur}</div>
                  <div className="cur-card__label">{CURRENCIES[cur].label}</div>
                </div>
              </div>
              <div className="cur-card__num">
                {CURRENCIES[cur].symbol}{t.collected.toLocaleString()}
              </div>
              <div className="cur-card__sub">≈ ${t.usd.toLocaleString()} USD · {t.count} subscriber{t.count === 1 ? '' : 's'}</div>
              <div className="cur-card__bar-h">
                <span>Share of MRR</span>
                <strong>{share}%</strong>
              </div>
              <span className="cur-card__bar">
                <motion.span
                  className="cur-card__fill"
                  initial={{ width: 0 }} animate={{ width: `${share}%` }}
                  transition={{ duration: 0.9, delay: 0.3 + idx * 0.06 }}
                />
              </span>
              <div className="cur-card__users">
                {t.users.slice(0, 3).map((u) => (
                  <div key={u.email} className="cur-card__user">
                    <Avatar hue={u.hue} label={u.workspace} />
                    <div className="cur-card__user-id">
                      <div className="cur-card__user-ws">{u.workspace}</div>
                      <div className="cur-card__user-amt">
                        {CURRENCIES[cur].symbol}{u.monthly.toLocaleString()}/mo
                      </div>
                    </div>
                  </div>
                ))}
                {t.users.length > 3 && (
                  <div className="cur-card__more">+{t.users.length - 3} more</div>
                )}
                {t.users.length === 0 && (
                  <div className="cur-card__empty">No active subscribers in {cur}</div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="cur-fx">
        <div className="cur-fx__h">
          <span className="bld__eyebrow"><Landmark size={11} />FX rates · used for USD conversion</span>
          <span className="cur-fx__updated">updated 8 min ago · openexchangerates.org</span>
        </div>
        <div className="cur-fx__rows">
          <FxRow code="USD" rate="1.000" delta="—" />
          <FxRow code="INR" rate="83.18" delta="+0.4%" />
          <FxRow code="EUR" rate="0.924" delta="−0.2%" />
          <FxRow code="GBP" rate="0.789" delta="+0.1%" />
        </div>
      </div>
    </div>
  );
}

function FxRow({ code, rate, delta }: { code: string; rate: string; delta: string }) {
  return (
    <div className="cur-fx__row">
      <span className="cur-fx__code">{code}</span>
      <span className="cur-fx__rate">1 USD = {rate} {code}</span>
      <span className="cur-fx__delta">{delta}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'revenue-cockpit',
    name: 'Revenue Cockpit',
    tagline: 'Multi-chart overview — MRR trend, currency donut, top-payers leaderboard.',
    bullets: [
      'KPI strip (MRR · Lifetime · Paying users · ARPU) with deltas',
      'Big 12-week MRR area chart + +qtr pill',
      'Currency donut showing USD-equivalent shares per currency',
      'Animated top-payers leaderboard ranked by lifetime spend',
    ],
    icon: LineChart,
    Full: FullRevenueCockpit,
  },
  {
    code: 'customer-ledger',
    name: 'Customer Ledger',
    tagline: 'Paid-users roster — one row per workspace with payment context.',
    bullets: [
      'Columns: Customer · Plan · Currency+method · Monthly · Lifetime (USD) · Status · Next renewal',
      'Local-currency amounts with ≈ USD equivalent inline',
      'Status pills (active · past_due · cancelled)',
      'Lifetime total summarised in the footer',
    ],
    icon: Users,
    Full: FullCustomerLedger,
  },
  {
    code: 'transaction-stream',
    name: 'Transaction Stream',
    tagline: 'Chronological payment feed — every charge with status + method.',
    bullets: [
      'Filter chips: Succeeded / Pending / Failed / Refunded',
      'Each row: time · status pill · kind tag (new/renewal/auto-retry) · workspace · method',
      'Amount column with ≈ USD inline for non-USD currencies',
      'Inline alert when a payment fails — "will auto-retry in 24h"',
    ],
    icon: Receipt,
    Full: FullTransactionStream,
  },
  {
    code: 'currency-matrix',
    name: 'Currency Matrix',
    tagline: 'Multi-currency overview — one card per currency + FX rate panel.',
    bullets: [
      'Card per currency (USD · INR · EUR · GBP) with flag + local total + USD eq.',
      'Share-of-MRR bar tinted to the currency brand color',
      'Top-3 subscribers inline per currency card',
      'FX rate panel at the bottom with delta vs previous',
    ],
    icon: Globe,
    Full: FullCurrencyMatrix,
  },
];
