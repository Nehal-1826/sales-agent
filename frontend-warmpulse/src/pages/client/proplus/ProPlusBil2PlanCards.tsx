import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Download,
  FileText,
  Minus,
  Plus,
  Scale,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatMoney, formatNumber, formatDate as _fmtDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProPlusBil2PlanCards — "Plan Cards / Tier Compare" billing design.
 *
 * Standalone preview-harness page. Renders ONLY page content; no nav/chrome,
 * no network/router/query hooks, no required props. All data is inline MOCK.
 *
 * Concept (distinct from sibling Bil1/Bil3/Bil4 designs):
 *   A horizontal side-by-side tier card-stack (Starter $18 / Pro $60 /
 *   Pro Plus $96 [current, raised] / Agency $180). The current tier is glowing,
 *   raised, and labelled "Current plan". Selecting any other tier expands an
 *   AnimatePresence "Delta panel" beneath the cards that shows the real diff
 *   computed from feature lists + caps:
 *       · price delta (vs current)
 *       · gained features (green +)
 *       · lost features (red −)
 *       · cap deltas (mailboxes / sends-per-day / peers)
 *   A compact payment-method + invoice rail sits below.
 *
 * Real `useState`: `selectedTierId` drives the delta panel via `useMemo`.
 */

// ---------------------------------------------------------------------------
// Mock shapes
// ---------------------------------------------------------------------------

interface Tier {
  id: 'starter' | 'pro' | 'pro_plus' | 'agency';
  name: string;
  /** USD per month */
  price: number;
  /** Short pitch under the title. */
  tagline: string;
  /** Hard caps used to render the chip strip + diff. */
  caps: {
    mailboxes: number; // -1 = unlimited
    sendsPerDay: number;
    peers: number;
  };
  /** Feature bullets — match the canonical PlanPicker fallback list. */
  features: string[];
}

interface InvoiceTile {
  id: string;
  invoiceNo: string;
  date: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// MOCK — pricing matches frontend/src/pages/onboarding/PlanPicker.tsx
// ---------------------------------------------------------------------------

const TIERS: Tier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 18,
    tagline: 'Solo sender · low volume',
    caps: { mailboxes: 1, sendsPerDay: 30, peers: 50 },
    features: [
      '1 mailbox',
      '30 warmup emails / day',
      'Gmail + Outlook + SMTP',
      'Domain records (DNS) validation (SPF/DKIM/DMARC)',
      'Daily build-up ladder + AI content',
      'Weekly digest reports',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 60,
    tagline: 'Growing teams · multi-mailbox',
    caps: { mailboxes: 10, sendsPerDay: 50, peers: 250 },
    features: [
      '10 mailboxes',
      '50 sends / day each',
      'Spam recovery + helper health-check',
      'On-demand PDF / CSV reports',
      'Webhook + Slack alerts',
      '90-day activity history',
      '10 team seats · 5 API keys',
      'Priority email + chat support',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 96,
    tagline: 'Power users · postmaster ingest',
    caps: { mailboxes: 15, sendsPerDay: 75, peers: 500 },
    features: [
      'Everything in Pro, plus:',
      '15 mailboxes · 75 sends / day',
      'Google Postmaster ingest',
      'Microsoft SNDS ingest',
      'Inbox tester (30 seeds)',
      'Slack Block Kit notifications',
      'Priority 4-hr support SLA',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 180,
    tagline: 'White-label · unlimited mailboxes',
    caps: { mailboxes: -1, sendsPerDay: 100, peers: 1500 },
    features: [
      'Everything in Pro Plus, plus:',
      'Unlimited mailboxes + sub-clients',
      'White-label branding',
      'Custom domain (your URL, your brand)',
      'Dedicated helper group',
      'Slack-connect 1-hr SLA',
      'Multi-workspace audit & reports',
    ],
  },
];

const CURRENT_ID: Tier['id'] = 'pro_plus';

const NEXT_RENEWAL = new Date('2026-06-04');

const RECENT_INVOICES: InvoiceTile[] = [
  { id: 'i1', invoiceNo: 'INV-2026-04812', date: '2026-05-01', amount: 96 },
  { id: 'i2', invoiceNo: 'INV-2026-04655', date: '2026-04-01', amount: 96 },
  { id: 'i3', invoiceNo: 'INV-2026-04498', date: '2026-03-01', amount: 96 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usd(n: number): string {
  return formatMoney(n);
}

function signed(n: number): string {
  if (n > 0) return `+${formatMoney(n)}`;
  if (n < 0) return `−${formatMoney(Math.abs(n))}`;
  return formatMoney(0);
}

function capLabel(n: number, unit: 'mailbox' | 'sends/day' | 'peers'): string {
  if (n === -1) return `Unlimited ${unit}`;
  if (unit === 'mailbox') return `${n} mailbox${n === 1 ? '' : 'es'}`;
  if (unit === 'sends/day') return `${n} / day`;
  return `${formatNumber(n)} helpers`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return _fmtDate(d);
}

interface CapDelta {
  label: string;
  from: string;
  to: string;
  direction: 'up' | 'down' | 'flat';
}

interface Diff {
  priceDelta: number;
  direction: 'upgrade' | 'downgrade' | 'same';
  gained: string[];
  lost: string[];
  caps: CapDelta[];
}

function diffTier(from: Tier, to: Tier): Diff {
  const a = new Set(from.features);
  const b = new Set(to.features);
  const gained = to.features.filter((f) => !a.has(f));
  const lost = from.features.filter((f) => !b.has(f));
  const priceDelta = to.price - from.price;
  const direction: Diff['direction'] =
    priceDelta > 0 ? 'upgrade' : priceDelta < 0 ? 'downgrade' : 'same';

  const cmpCap = (
    label: string,
    f: number,
    t: number,
    unit: 'mailbox' | 'sends/day' | 'peers',
  ): CapDelta => {
    // Unlimited (−1) wins over any finite cap.
    const fNorm = f === -1 ? Number.POSITIVE_INFINITY : f;
    const tNorm = t === -1 ? Number.POSITIVE_INFINITY : t;
    const dir: CapDelta['direction'] =
      tNorm > fNorm ? 'up' : tNorm < fNorm ? 'down' : 'flat';
    return { label, from: capLabel(f, unit), to: capLabel(t, unit), direction: dir };
  };

  return {
    priceDelta,
    direction,
    gained,
    lost,
    caps: [
      cmpCap('Mailbox cap', from.caps.mailboxes, to.caps.mailboxes, 'mailbox'),
      cmpCap('Sends / mailbox / day', from.caps.sendsPerDay, to.caps.sendsPerDay, 'sends/day'),
      cmpCap('Helper-group reach', from.caps.peers, to.caps.peers, 'peers'),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tier card
// ---------------------------------------------------------------------------

interface TierCardProps {
  tier: Tier;
  isCurrent: boolean;
  isSelected: boolean;
  position: 'lower' | 'current' | 'higher';
  onSelect: () => void;
  delay: number;
}

function TierCard({ tier, isCurrent, isSelected, position, onSelect, delay }: TierCardProps) {
  const ringCls = isCurrent
    ? 'ring-2 ring-accent2/60 shadow-[0_0_36px_-8px_rgba(242, 101, 34,0.55)]'
    : isSelected
    ? 'ring-2 ring-accent/60'
    : 'ring-0';

  const actionLabel =
    position === 'current'
      ? 'Current plan'
      : position === 'higher'
      ? `Switch to ${tier.name}`
      : `Downgrade to ${tier.name}`;

  const ActionIcon =
    position === 'current' ? Check : position === 'higher' ? ArrowUpRight : ArrowDownLeft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: isCurrent ? -6 : 0 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
      whileHover={position === 'current' ? undefined : { y: -4, scale: 1.012 }}
      className={`relative flex h-full min-w-[260px] flex-col rounded-xl border ${
        isCurrent ? 'border-accent2/50' : 'border-border-muted'
      } bg-surface/70 backdrop-blur-xl transition-colors ${ringCls}`}
    >
      {isCurrent ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[1] rounded-xl"
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(242, 101, 34,0)',
              '0 0 24px 4px rgba(242, 101, 34,0.35)',
              '0 0 0 0 rgba(242, 101, 34,0)',
            ],
          }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}

      {isCurrent ? (
        <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-accent2/50 bg-bg px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent2">
          <Crown className="h-3 w-3" />
          Current plan
        </span>
      ) : null}

      <div className="flex flex-col gap-3 p-5">
        <div>
          <h3 className="text-base font-semibold text-text">{tier.name}</h3>
          <p className="mt-0.5 text-xs text-text-dim">{tier.tagline}</p>
        </div>

        <div className="flex items-end gap-1.5">
          <span className="text-sm font-medium text-text-dim">$</span>
          <span className="text-4xl font-semibold leading-none tabular-nums text-text">
            {tier.price}
          </span>
          <span className="mb-1 text-xs text-text-dim">/ mo</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
            {capLabel(tier.caps.mailboxes, 'mailbox')}
          </span>
          <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
            {tier.caps.sendsPerDay} / day
          </span>
          <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[10px] text-text-dim">
            {formatNumber(tier.caps.peers)} helpers
          </span>
        </div>
      </div>

      <div className="flex-1 border-t border-border-muted/60 px-5 py-4">
        <ul className="space-y-1.5 text-xs text-text-dim">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
              <span className="leading-snug">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border-muted/60 p-3">
        <button
          type="button"
          onClick={onSelect}
          disabled={position === 'current'}
          className={`group inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
            position === 'current'
              ? 'cursor-default border-accent2/30 bg-accent2/10 text-accent2'
              : isSelected
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border-muted bg-surface-2 text-text hover:border-accent/40 hover:text-accent'
          }`}
        >
          <ActionIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          {actionLabel}
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Lookup by id — keeps TS happy under `noUncheckedIndexedAccess` and avoids
 *  the `Array.find` / index-access `T | undefined` widening. */
const TIERS_BY_ID: Record<Tier['id'], Tier> = TIERS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<Tier['id'], Tier>,
);

export function ProPlusBil2PlanCards(): JSX.Element {
  const currentTier = TIERS_BY_ID[CURRENT_ID];
  const [selectedTierId, setSelectedTierId] = useState<Tier['id']>(CURRENT_ID);

  const selectedTier = TIERS_BY_ID[selectedTierId];

  const showDelta = selectedTier.id !== currentTier.id;
  const diff = useMemo(
    () => diffTier(currentTier, selectedTier),
    [currentTier, selectedTier],
  );

  const currentIdx = TIERS.findIndex((t) => t.id === currentTier.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Plan & tier
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Compare tiers side-by-side. Hover or select a card to see exactly
            what changes vs your current plan.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <Shield className="h-3.5 w-3.5 text-accent4" />
          <span>
            Switching is instant — <strong className="text-text">prorated</strong>{' '}
            at the next renewal
          </span>
        </div>
      </motion.header>

      {/* Tier card stack */}
      <section aria-label="Available plans">
        <div className="-mx-1 overflow-x-auto px-1 pt-3 pb-2">
          <div className="grid min-w-[1040px] grid-cols-4 items-stretch gap-4">
            {TIERS.map((tier, i) => {
              const position: TierCardProps['position'] =
                tier.id === currentTier.id
                  ? 'current'
                  : i > currentIdx
                  ? 'higher'
                  : 'lower';
              return (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  isCurrent={tier.id === currentTier.id}
                  isSelected={tier.id === selectedTierId}
                  position={position}
                  onSelect={() => setSelectedTierId(tier.id)}
                  delay={0.05 + i * 0.08}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Delta panel — animates in/out as a different tier gets selected */}
      <AnimatePresence initial={false} mode="wait">
        {showDelta ? (
          <motion.section
            key={selectedTier.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="overflow-hidden"
            aria-label="Tier comparison delta"
          >
            <Card noShimmer>
              <CardContent className="space-y-5 p-6">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-accent" />
                    <div>
                      <h2 className="text-base font-semibold text-text">
                        <span className="text-text-dim">{currentTier.name}</span>
                        <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-text-dim" />
                        {selectedTier.name}
                      </h2>
                      <p className="text-xs text-text-dim">
                        {diff.direction === 'upgrade'
                          ? 'You would gain capacity and features.'
                          : diff.direction === 'downgrade'
                          ? 'You would give up capacity and features.'
                          : 'No price change at this tier.'}
                      </p>
                    </div>
                  </div>
                  <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
                      diff.direction === 'upgrade'
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : diff.direction === 'downgrade'
                        ? 'border-accent3/40 bg-accent3/10 text-accent3'
                        : 'border-border-muted bg-surface-2 text-text-dim'
                    }`}
                  >
                    {diff.direction === 'upgrade' ? (
                      <Plus className="h-3.5 w-3.5" />
                    ) : diff.direction === 'downgrade' ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : null}
                    {signed(diff.priceDelta)} / mo
                  </motion.span>
                </header>

                {/* Cap delta strip */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {diff.caps.map((c, i) => {
                    const toneCls =
                      c.direction === 'up'
                        ? 'text-accent border-accent/30 bg-accent/5'
                        : c.direction === 'down'
                        ? 'text-accent3 border-accent3/30 bg-accent3/5'
                        : 'text-text-dim border-border-muted bg-surface-2';
                    const Arrow =
                      c.direction === 'up'
                        ? ArrowUpRight
                        : c.direction === 'down'
                        ? ArrowDownLeft
                        : ArrowRight;
                    return (
                      <motion.div
                        key={c.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.08 + i * 0.05 }}
                        className={`rounded-lg border px-3 py-2 ${toneCls}`}
                      >
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                          {c.label}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-text-dim">{c.from}</span>
                          <Arrow className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-text">{c.to}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Gained / lost lists */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                      <Plus className="h-3 w-3" />
                      You gain ({diff.gained.length})
                    </p>
                    {diff.gained.length === 0 ? (
                      <p className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs text-text-dim">
                        No new features at this tier.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {diff.gained.map((f, i) => (
                          <motion.li
                            key={f}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: 0.12 + i * 0.04 }}
                            className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs text-text"
                          >
                            <Plus className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                            <span className="leading-snug">{f}</span>
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent3">
                      <Minus className="h-3 w-3" />
                      You lose ({diff.lost.length})
                    </p>
                    {diff.lost.length === 0 ? (
                      <p className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs text-text-dim">
                        Nothing is removed at this tier.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {diff.lost.map((f, i) => (
                          <motion.li
                            key={f}
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: 0.12 + i * 0.04 }}
                            className="flex items-start gap-2 rounded-lg border border-accent3/20 bg-accent3/5 px-3 py-1.5 text-xs text-text"
                          >
                            <Minus className="mt-0.5 h-3 w-3 shrink-0 text-accent3" />
                            <span className="leading-snug line-through decoration-accent3/40">
                              {f}
                            </span>
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted/60 pt-4">
                  <p className="text-xs text-text-dim">
                    Selected:{' '}
                    <strong className="text-text">{selectedTier.name}</strong>{' '}
                    · {usd(selectedTier.price)} / mo · effective{' '}
                    {fmtDate(NEXT_RENEWAL.toISOString())}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedTierId(currentTier.id)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant={diff.direction === 'upgrade' ? 'primary' : 'secondary'}
                      leftIcon={
                        diff.direction === 'upgrade' ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      Confirm {diff.direction === 'upgrade' ? 'upgrade' : 'change'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* Payment method + invoice rail */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card noShimmer>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Card on file */}
              <div className="lg:col-span-4">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                  <CreditCard className="h-3 w-3 text-accent" />
                  Card on file
                </p>
                <div className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface-2/70 p-3">
                  <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent2/30 to-accent/20 text-[10px] font-bold tracking-wider text-text">
                    VISA
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-text">·· ·· ·· 4242</p>
                    <p className="text-[11px] text-text-dim">Exp 09 / 28 · auto-renew on</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-border-muted px-2 py-1 text-[11px] font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Upcoming renewal */}
              <div className="lg:col-span-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                  <CalendarClock className="h-3 w-3 text-accent4" />
                  Next renewal
                </p>
                <div className="rounded-lg border border-border-muted bg-surface-2/70 p-3">
                  <p className="text-sm font-semibold text-text">
                    {fmtDate(NEXT_RENEWAL.toISOString())}
                  </p>
                  <p className="text-[11px] text-text-dim">
                    {usd(currentTier.price)} · Pro Plus · monthly
                  </p>
                </div>
              </div>

              {/* Last 3 invoices */}
              <div className="lg:col-span-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                    <FileText className="h-3 w-3 text-accent" />
                    Recent invoices
                  </p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-text-dim transition-colors hover:text-accent"
                  >
                    View all
                  </button>
                </div>
                <ul className="grid grid-cols-3 gap-2">
                  {RECENT_INVOICES.map((inv, i) => (
                    <motion.li
                      key={inv.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.35 + i * 0.05 }}
                      className="group flex flex-col gap-1 rounded-lg border border-border-muted bg-surface-2/70 p-2.5 transition-colors hover:border-accent/40"
                    >
                      <p className="truncate font-mono text-[10px] text-text-dim">
                        {inv.invoiceNo.split('-').slice(-1)[0]}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-text">
                        {usd(inv.amount)}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-dim">
                          {fmtDate(inv.date)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Download ${inv.invoiceNo}`}
                          className="flex h-5 w-5 items-center justify-center rounded text-text-dim transition-colors hover:text-accent"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}

export default ProPlusBil2PlanCards;
