import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  CreditCard,
  Edit3,
  Grid3x3,
  Layout,
  LineChart,
  Plus,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import './plans-designs.css';

/**
 * /admin/plans design picker.
 */
export function PlansDesigns() {
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
    <div className="pld">
      <div className="pld__atmosphere" aria-hidden>
        <div className="pld__aurora-1" />
        <div className="pld__aurora-2" />
      </div>

      <header className="pld__head">
        <Link to="/admin/plans" className="pld__back">
          ← Back to live plans
        </Link>
        <div className="pld__head-row">
          <div>
            <span className="pld__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick a Plans design
            </span>
            <h1 className="pld__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="pld__sub">{design.tagline}</p>
          </div>
          <div className="pld__counter">
            <span className="pld__counter-now">{index + 1}</span>
            <span className="pld__counter-sep">/</span>
            <span className="pld__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="pld__stage">
        <button type="button" className="pld__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="pld__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="pld__slide"
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
        <button type="button" className="pld__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="pld__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`pld__dot ${i === index ? 'pld__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="pld__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="pld__bullets-row">
        <ul className="pld__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`pld__pick ${isPicked ? 'pld__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="pld__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build plans-{picked}</code> and I'll wire it up against /admin/plans.
        </div>
      ) : (
        <div className="pld__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'pricing-cards' | 'feature-matrix' | 'plan-workshop' | 'subscription-snapshot';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof Layout;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Mock plans
// ---------------------------------------------------------------------------

interface MockPlan {
  slug: 'starter' | 'growth' | 'scale' | 'enterprise';
  name: string;
  price: number;
  highlight?: boolean;
  tagline: string;
  mailboxes: number;
  dailyCap: number;
  tokens: number;
  features: Array<{ label: string; included: boolean; note?: string }>;
  subscribers: number;
  mrr: number;
  churn30d: number;
  color: string;
}

const FEATURE_LIST = [
  'Mailbox connect (Gmail / O365 / Yahoo / SMTP)',
  'Warmup engine — daily ramp ladder',
  'Peer-network access — default pool',
  'Peer-network access — premium pool',
  'LLM-generated content (Gemini)',
  'LLM-generated content (Claude)',
  'DNS validator (SPF / DKIM / DMARC)',
  'Inbox-placement tester',
  'Scheduled reports (CSV + PDF)',
  'Audit log retention',
  'Priority support',
  'Custom SLA',
];

const PLANS: MockPlan[] = [
  {
    slug: 'starter', name: 'Starter', price: 29, tagline: 'Pilot the platform with a single mailbox.',
    mailboxes: 1, dailyCap: 50, tokens: 250_000, subscribers: 38, mrr: 1102, churn30d: 2,
    color: '#f472b6',
    features: [
      { label: FEATURE_LIST[0]!, included: true },
      { label: FEATURE_LIST[1]!, included: true },
      { label: FEATURE_LIST[2]!, included: true },
      { label: FEATURE_LIST[3]!, included: false },
      { label: FEATURE_LIST[4]!, included: true },
      { label: FEATURE_LIST[5]!, included: false },
      { label: FEATURE_LIST[6]!, included: true },
      { label: FEATURE_LIST[7]!, included: false, note: 'Add-on' },
      { label: FEATURE_LIST[8]!, included: false },
      { label: FEATURE_LIST[9]!, included: true, note: '30 days' },
      { label: FEATURE_LIST[10]!, included: false },
      { label: FEATURE_LIST[11]!, included: false },
    ],
  },
  {
    slug: 'growth', name: 'Growth', price: 89, highlight: true, tagline: 'Scale outbound across a team.',
    mailboxes: 5, dailyCap: 200, tokens: 1_500_000, subscribers: 104, mrr: 9256, churn30d: 3,
    color: '#FF8A4B',
    features: [
      { label: FEATURE_LIST[0]!, included: true },
      { label: FEATURE_LIST[1]!, included: true },
      { label: FEATURE_LIST[2]!, included: true },
      { label: FEATURE_LIST[3]!, included: true },
      { label: FEATURE_LIST[4]!, included: true },
      { label: FEATURE_LIST[5]!, included: true },
      { label: FEATURE_LIST[6]!, included: true },
      { label: FEATURE_LIST[7]!, included: true },
      { label: FEATURE_LIST[8]!, included: true },
      { label: FEATURE_LIST[9]!, included: true, note: '90 days' },
      { label: FEATURE_LIST[10]!, included: false },
      { label: FEATURE_LIST[11]!, included: false },
    ],
  },
  {
    slug: 'scale', name: 'Scale', price: 249, tagline: 'High-volume programmes with priority pools.',
    mailboxes: 25, dailyCap: 500, tokens: 5_000_000, subscribers: 52, mrr: 12_948, churn30d: 1,
    color: 'var(--wp-accent)',
    features: [
      { label: FEATURE_LIST[0]!, included: true },
      { label: FEATURE_LIST[1]!, included: true },
      { label: FEATURE_LIST[2]!, included: true },
      { label: FEATURE_LIST[3]!, included: true, note: 'Enterprise pool' },
      { label: FEATURE_LIST[4]!, included: true },
      { label: FEATURE_LIST[5]!, included: true },
      { label: FEATURE_LIST[6]!, included: true },
      { label: FEATURE_LIST[7]!, included: true },
      { label: FEATURE_LIST[8]!, included: true },
      { label: FEATURE_LIST[9]!, included: true, note: '1 year' },
      { label: FEATURE_LIST[10]!, included: true },
      { label: FEATURE_LIST[11]!, included: false },
    ],
  },
  {
    slug: 'enterprise', name: 'Enterprise', price: 0, tagline: 'Custom — talk to sales.',
    mailboxes: 9999, dailyCap: 9999, tokens: 50_000_000, subscribers: 4, mrr: 6800, churn30d: 0,
    color: '#facc15',
    features: FEATURE_LIST.map((label, i) => ({
      label,
      included: true,
      note: i === 9 ? 'unlimited' : i === 11 ? 'Custom SLA' : undefined,
    })),
  },
];

// ===========================================================================
// 1) PRICING CARDS — marketing-style cards in a row
// ===========================================================================
function FullPricingCards() {
  return (
    <div className="page page--pricing">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Plans · Pricing</div>
        <div className="page__count">
          <CreditCard size={11} strokeWidth={2.4} />
          {PLANS.length} active plans
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Pricing tiers</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Currency · USD <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Plus size={12} />New plan</button>
        </div>
      </div>

      <div className="pricing-row">
        {PLANS.map((p, i) => (
          <motion.article
            key={p.slug}
            className={`price-card ${p.highlight ? 'price-card--featured' : ''}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.08, duration: 0.4 }}
            style={{ ['--card-tone' as string]: p.color }}
          >
            {p.highlight && (
              <span className="price-card__badge">
                <Star size={11} strokeWidth={2.4} />
                Most popular
              </span>
            )}
            <div className="price-card__name">{p.name}</div>
            <p className="price-card__tag">{p.tagline}</p>
            <div className="price-card__price">
              {p.price === 0 ? (
                <span className="price-card__price-num">Custom</span>
              ) : (
                <>
                  <span className="price-card__currency">$</span>
                  <span className="price-card__price-num">{p.price}</span>
                  <span className="price-card__period">/mo</span>
                </>
              )}
            </div>
            <ul className="price-card__features">
              {p.features.slice(0, 8).map((f) => (
                <li key={f.label} className={f.included ? '' : 'price-card__feat--off'}>
                  {f.included ? (
                    <CheckCircle2 size={12} strokeWidth={2.4} />
                  ) : (
                    <X size={12} strokeWidth={2.4} />
                  )}
                  {f.label}
                  {f.note && <span className="price-card__note">{f.note}</span>}
                </li>
              ))}
            </ul>
            <div className="price-card__actions">
              <button className="price-card__btn price-card__btn--ghost">
                <Copy size={12} strokeWidth={2.4} />Duplicate
              </button>
              <button className="price-card__btn price-card__btn--solid">
                <Edit3 size={12} strokeWidth={2.4} />Edit
              </button>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 2) FEATURE MATRIX — spreadsheet of features × plans
// ===========================================================================
function FullFeatureMatrix() {
  return (
    <div className="page page--matrix">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Plans · Matrix</div>
        <div className="page__count">
          <Grid3x3 size={11} strokeWidth={2.4} />
          {FEATURE_LIST.length} features × {PLANS.length} plans
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Feature matrix</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Show inactive</button>
          <button className="btn btn--solid"><Plus size={12} />Add feature</button>
        </div>
      </div>

      <div className="fm">
        <div className="fm__row fm__row--head">
          <span className="fm__cell fm__cell--feat">Feature</span>
          {PLANS.map((p) => (
            <span key={p.slug} className="fm__cell fm__cell--plan">
              <span className="fm__plan-dot" style={{ background: p.color }} />
              <span className="fm__plan-name">{p.name}</span>
              {p.price > 0 ? (
                <span className="fm__plan-price">${p.price}/mo</span>
              ) : (
                <span className="fm__plan-price">Custom</span>
              )}
            </span>
          ))}
        </div>

        {/* Numeric limits row */}
        <div className="fm__row fm__row--limit">
          <span className="fm__cell fm__cell--feat">Mailboxes included</span>
          {PLANS.map((p) => (
            <span key={p.slug} className="fm__cell fm__cell--num">
              {p.mailboxes >= 9999 ? '∞' : p.mailboxes}
            </span>
          ))}
        </div>
        <div className="fm__row fm__row--limit">
          <span className="fm__cell fm__cell--feat">Daily warmup cap</span>
          {PLANS.map((p) => (
            <span key={p.slug} className="fm__cell fm__cell--num">
              {p.dailyCap >= 9999 ? '∞' : p.dailyCap}
            </span>
          ))}
        </div>
        <div className="fm__row fm__row--limit">
          <span className="fm__cell fm__cell--feat">LLM tokens / mo</span>
          {PLANS.map((p) => (
            <span key={p.slug} className="fm__cell fm__cell--num">
              {abbrev(p.tokens)}
            </span>
          ))}
        </div>

        {/* Feature rows */}
        {FEATURE_LIST.map((feat, i) => (
          <motion.div
            key={feat}
            className="fm__row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.03 }}
          >
            <span className="fm__cell fm__cell--feat">{feat}</span>
            {PLANS.map((p) => {
              const f = p.features.find((x) => x.label === feat);
              return (
                <span
                  key={p.slug}
                  className={`fm__cell fm__cell--check ${f?.included ? 'fm__cell--yes' : 'fm__cell--no'}`}
                >
                  {f?.included ? (
                    <CheckCircle2 size={14} strokeWidth={2.4} />
                  ) : (
                    <X size={14} strokeWidth={2.4} />
                  )}
                  {f?.note && <span className="fm__note">{f.note}</span>}
                </span>
              );
            })}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// 3) PLAN WORKSHOP — master-detail editor with live preview
// ===========================================================================
function FullPlanWorkshop() {
  const [activeSlug, setActiveSlug] = useState<MockPlan['slug']>('growth');
  const active = PLANS.find((p) => p.slug === activeSlug)!;

  return (
    <div className="page page--workshop">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Plans · Workshop</div>
        <div className="page__count">
          <Edit3 size={11} strokeWidth={2.4} />
          {PLANS.length} plans · live preview
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Plan workshop</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Revert</button>
          <button className="btn btn--solid">Save changes</button>
        </div>
      </div>

      <div className="ws">
        {/* Plan list */}
        <aside className="ws__list">
          <div className="ws__list-h">Plans</div>
          {PLANS.map((p) => (
            <button
              key={p.slug}
              type="button"
              className={`ws__item ${p.slug === activeSlug ? 'ws__item--active' : ''}`}
              onClick={() => setActiveSlug(p.slug)}
              style={{ ['--ws-tone' as string]: p.color }}
            >
              <span className="ws__dot" style={{ background: p.color }} />
              <div className="ws__id">
                <div className="ws__name">{p.name}</div>
                <div className="ws__price">{p.price > 0 ? `$${p.price}/mo` : 'Custom'}</div>
              </div>
              <span className="ws__subs">{p.subscribers}</span>
            </button>
          ))}
          <button className="ws__add">
            <Plus size={13} strokeWidth={2.4} />New plan
          </button>
        </aside>

        {/* Editor */}
        <div className="ws__editor">
          <motion.div
            key={active.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="ws__editor-inner"
          >
            <div className="ws__editor-h">
              <div>
                <span className="pld__eyebrow">Editing</span>
                <h3 className="ws__editor-name">
                  <span className="ws__editor-swatch" style={{ background: active.color }} />
                  {active.name}
                </h3>
              </div>
              <div className="ws__editor-actions">
                <button className="btn btn--ghost"><Copy size={12} />Duplicate</button>
              </div>
            </div>

            <div className="ws__fields">
              <Field label="Name" value={active.name} />
              <Field label="Slug" value={active.slug} mono />
              <Field
                label="Price / month"
                value={active.price > 0 ? `$${active.price}` : 'Custom'}
                mono
              />
              <Field
                label="Mailboxes included"
                value={active.mailboxes >= 9999 ? '∞' : String(active.mailboxes)}
                mono
              />
              <Field
                label="Daily warmup cap"
                value={active.dailyCap >= 9999 ? '∞' : String(active.dailyCap)}
                mono
              />
              <Field label="LLM token cap" value={abbrev(active.tokens)} mono />
            </div>

            <div className="ws__feats">
              <div className="ws__feats-h">
                <span className="pld__eyebrow">Features</span>
                <span className="ws__feats-count">
                  {active.features.filter((f) => f.included).length} of {active.features.length}
                </span>
              </div>
              <div className="ws__feats-grid">
                {active.features.map((f) => (
                  <label key={f.label} className="ws__feat">
                    <span className={`ws__check ${f.included ? 'ws__check--on' : ''}`}>
                      {f.included && <CheckCircle2 size={12} strokeWidth={2.4} />}
                    </span>
                    <span className="ws__feat-label">{f.label}</span>
                    {f.note && <span className="ws__feat-note">{f.note}</span>}
                  </label>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Live preview */}
        <aside className="ws__preview">
          <div className="ws__preview-h">
            <span className="pld__eyebrow">Live preview</span>
            <span className="ws__preview-sub">what customers see</span>
          </div>
          <div
            className="ws__preview-card"
            style={{ ['--ws-tone' as string]: active.color }}
          >
            <div className="ws__preview-name">{active.name}</div>
            <p className="ws__preview-tag">{active.tagline}</p>
            <div className="ws__preview-price">
              {active.price === 0 ? 'Custom' : `$${active.price}`}
              {active.price > 0 && <span className="ws__preview-period">/mo</span>}
            </div>
            <ul className="ws__preview-feats">
              {active.features.filter((f) => f.included).slice(0, 5).map((f) => (
                <li key={f.label}>
                  <CheckCircle2 size={11} strokeWidth={2.4} />
                  {f.label}
                </li>
              ))}
            </ul>
            <button className="ws__preview-cta">Choose {active.name}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ws__field">
      <span className="ws__field-label">{label}</span>
      <span className={`ws__field-value ${mono ? 'ws__field-value--mono' : ''}`}>{value}</span>
    </div>
  );
}

// ===========================================================================
// 4) SUBSCRIPTION SNAPSHOT — analytics overlay on plan cards
// ===========================================================================
function FullSubscriptionSnapshot() {
  const totalMrr = PLANS.reduce((a, p) => a + p.mrr, 0);
  const totalSubs = PLANS.reduce((a, p) => a + p.subscribers, 0);
  const totalChurn = PLANS.reduce((a, p) => a + p.churn30d, 0);

  return (
    <div className="page page--snapshot">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Plans · Snapshot</div>
        <div className="page__count">
          <LineChart size={11} strokeWidth={2.4} />
          revenue · subscribers · churn · 30d
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Subscription snapshot</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Last 30 days <ChevronDown size={11} /></button>
          <button className="btn btn--solid"><Plus size={12} />New plan</button>
        </div>
      </div>

      <div className="snap-summary">
        <div className="snap-stat">
          <span className="snap-stat__label">Total MRR</span>
          <span className="snap-stat__num">${totalMrr.toLocaleString()}</span>
          <span className="snap-stat__delta snap-stat__delta--up">
            <TrendingUp size={11} />+6.4% vs prev
          </span>
        </div>
        <div className="snap-stat">
          <span className="snap-stat__label">Subscribers</span>
          <span className="snap-stat__num">{totalSubs}</span>
          <span className="snap-stat__delta snap-stat__delta--up">
            <TrendingUp size={11} />+12
          </span>
        </div>
        <div className="snap-stat">
          <span className="snap-stat__label">Churn · 30d</span>
          <span className="snap-stat__num">{totalChurn}</span>
          <span className="snap-stat__delta snap-stat__delta--down">
            <TrendingDown size={11} />+1
          </span>
        </div>
        <div className="snap-stat">
          <span className="snap-stat__label">ARPU</span>
          <span className="snap-stat__num">${Math.round(totalMrr / totalSubs)}</span>
          <span className="snap-stat__delta snap-stat__delta--up">
            <TrendingUp size={11} />+$3.10
          </span>
        </div>
      </div>

      <div className="snap-grid">
        {PLANS.map((p, i) => {
          const mrrPct = (p.mrr / totalMrr) * 100;
          return (
            <motion.div
              key={p.slug}
              className="snap-card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.4 }}
              style={{ ['--snap-tone' as string]: p.color }}
            >
              <div className="snap-card__h">
                <div>
                  <div className="snap-card__name">{p.name}</div>
                  <div className="snap-card__price">
                    {p.price > 0 ? `$${p.price}/mo` : 'Custom'}
                  </div>
                </div>
                <button className="snap-card__edit"><Edit3 size={11} /></button>
              </div>

              <div className="snap-card__stats">
                <div>
                  <span className="snap-card__num">{p.subscribers}</span>
                  <span className="snap-card__sub">
                    <Users size={9} strokeWidth={2.4} />subscribers
                  </span>
                </div>
                <div>
                  <span className="snap-card__num">${p.mrr.toLocaleString()}</span>
                  <span className="snap-card__sub">MRR</span>
                </div>
                <div>
                  <span className={`snap-card__num ${p.churn30d > 1 ? 'snap-card__num--warn' : ''}`}>
                    {p.churn30d}
                  </span>
                  <span className="snap-card__sub">churn 30d</span>
                </div>
              </div>

              <div className="snap-card__bar-h">
                <span>Share of MRR</span>
                <strong>{Math.round(mrrPct)}%</strong>
              </div>
              <span className="snap-card__bar">
                <motion.span
                  className="snap-card__fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${mrrPct}%` }}
                  transition={{ duration: 0.9, delay: 0.4 + i * 0.06, ease: 'easeOut' }}
                />
              </span>

              <div className="snap-card__features">
                {p.features.filter((f) => f.included).slice(0, 3).map((f) => (
                  <div key={f.label} className="snap-card__feat">
                    <CheckCircle2 size={11} strokeWidth={2.4} />
                    {f.label}
                  </div>
                ))}
                {p.features.filter((f) => f.included).length > 3 && (
                  <div className="snap-card__more">
                    +{p.features.filter((f) => f.included).length - 3} more features
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'pricing-cards',
    name: 'Pricing Cards',
    tagline: 'Marketing-style pricing tiles — the most common pricing-page pattern.',
    bullets: [
      '4 vertical cards in a row, "Most popular" badge on the featured plan',
      'Each card: name · tagline · price · 8 feature lines with check/x',
      'Brand-tinted accent bar at the top of every card',
      'Duplicate + Edit actions inline',
    ],
    icon: Layout,
    Full: FullPricingCards,
  },
  {
    code: 'feature-matrix',
    name: 'Feature Matrix',
    tagline: 'Spreadsheet — features × plans, checkmarks at every intersection.',
    bullets: [
      '12 feature rows across 4 plan columns',
      'Top row has plan name + price; numeric-limit rows for mailboxes / cap / tokens',
      'Tick/cross per cell with optional inline note ("Add-on", "30 days")',
      'Best when comparing what each plan includes is the primary task',
    ],
    icon: Grid3x3,
    Full: FullFeatureMatrix,
  },
  {
    code: 'plan-workshop',
    name: 'Plan Workshop',
    tagline: 'Master-detail editor with a live customer preview on the right.',
    bullets: [
      'Plan list on the left with subscriber counts',
      'Field editor in the middle (price, mailboxes, cap, tokens, features)',
      'Live "what customers see" preview card on the right',
      'Best when admins iterate plans frequently',
    ],
    icon: Edit3,
    Full: FullPlanWorkshop,
  },
  {
    code: 'subscription-snapshot',
    name: 'Subscription Snapshot',
    tagline: 'Analytics overlay — pricing + MRR + churn on every card.',
    bullets: [
      'Top strip: total MRR · subscribers · churn · ARPU with deltas',
      'Each plan card carries subscribers / MRR / churn metrics',
      'Animated share-of-MRR bar per plan',
      'Best for revenue-led plan decisions',
    ],
    icon: LineChart,
    Full: FullSubscriptionSnapshot,
  },
];
