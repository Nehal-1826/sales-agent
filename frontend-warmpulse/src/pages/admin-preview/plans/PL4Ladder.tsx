/**
 * Admin Plans & Pricing Design Candidate: PL4 Tier Ladder
 *
 * "Tier Ladder" — plans rendered as an ascending physical ladder: each rung
 * springs up on mount, proportional to price/tier, with animated price counters
 * and adoption bars. Click a rung to expand an editable detail drawer
 * (AnimatePresence / layout). Create / delete tiers re-flow the whole ladder
 * with spring physics. Animated KPI header. whileHover / whileTap throughout.
 *
 * Framer-motion techniques:
 *   - Staggered spring entrance (staggerChildren + childVariants)
 *   - AnimatePresence for expand/collapse detail + toast + delete confirm
 *   - useMotionValue + animate() for price counter tween (cleanup on unmount)
 *   - layout prop for smooth rung reflow on create/delete
 *   - whileHover/whileTap for micro-interactions
 *   - motion.div for animated adoption-bar fill (spring)
 *
 * Self-contained: inline style={{}} only, mock data only.
 * NO API / react-query / @/features / @/lib/api imports.
 * Warm Aurora Glass palette. NO blue/purple/teal/cyan/indigo/pink.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Plus,
  Trash2,
  Check,
  X,
  ChevronDown,
  Users,
  DollarSign,
  TrendingUp,
  Layers,
  Send,
  BarChart2,
  Zap,
  Shield,
  FileText,
  HeadphonesIcon,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.38)' as const,
  ghost: 'rgba(255,255,255,0.18)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.14)' as const,
  warning: '#FF8A4B' as const,
  glass: 'rgba(255,255,255,0.05)' as const,
  glass2: 'rgba(255,255,255,0.08)' as const,
  border: 'rgba(255,255,255,0.10)' as const,
  borderDim: 'rgba(255,255,255,0.06)' as const,
} as const;

const GLASS: CSSProperties = {
  background: T.glass,
  border: `1px solid ${T.border}`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 16,
};

const GLASS_INNER: CSSProperties = {
  background: T.glass2,
  border: `1px solid ${T.border}`,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius: 12,
};

// ─── Tier color gradient: warm amber, ascending brightness ─────────────────────
// Free (dim) → Starter → Pro → Pro Plus → Agency (bright accent)
const TIER_COLORS = [
  'rgba(180,100,30,0.75)',   // Free — muted warm
  '#C47A2E',                  // Starter — amber
  '#E08430',                  // Pro — orange-amber
  '#F26522',                  // Pro Plus — brand orange
  '#FF8A4B',                  // Agency — bright accent
] as const;

const TIER_GLOW = [
  'rgba(180,100,30,0.20)',
  'rgba(196,122,46,0.25)',
  'rgba(224,132,48,0.30)',
  'rgba(242,101,34,0.35)',
  'rgba(255,138,75,0.40)',
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FeatureFlags {
  crm: boolean;
  sequences: boolean;
  reports: boolean;
  premiumSupport: boolean;
  dnsValidator: boolean;
  premiumPool: boolean;
}

interface Tier {
  id: string;
  name: string;
  price: number;        // $/mo, 0 = free
  mailboxLimit: number; // 0 = unlimited
  dailySendTarget: number;
  features: FeatureFlags;
  subscribers: number;
  mrr: number;
}

// ─── Mock data ─────────────────────────────────────────────────────────────────
const INITIAL_TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    mailboxLimit: 1,
    dailySendTarget: 10,
    features: { crm: false, sequences: false, reports: false, premiumSupport: false, dnsValidator: true, premiumPool: false },
    subscribers: 312,
    mrr: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 19,
    mailboxLimit: 3,
    dailySendTarget: 50,
    features: { crm: false, sequences: false, reports: true, premiumSupport: false, dnsValidator: true, premiumPool: false },
    subscribers: 184,
    mrr: 3496,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    mailboxLimit: 10,
    dailySendTarget: 150,
    features: { crm: true, sequences: false, reports: true, premiumSupport: false, dnsValidator: true, premiumPool: false },
    subscribers: 97,
    mrr: 4753,
  },
  {
    id: 'proplus',
    name: 'Pro Plus',
    price: 99,
    mailboxLimit: 25,
    dailySendTarget: 350,
    features: { crm: true, sequences: true, reports: true, premiumSupport: false, dnsValidator: true, premiumPool: true },
    subscribers: 41,
    mrr: 4059,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 249,
    mailboxLimit: 0,
    dailySendTarget: 1000,
    features: { crm: true, sequences: true, reports: true, premiumSupport: true, dnsValidator: true, premiumPool: true },
    subscribers: 12,
    mrr: 2988,
  },
];

let _nextId = 100;
function genId(): string { return `tier_${++_nextId}`; }

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

// ─── Variants ──────────────────────────────────────────────────────────────────
const LADDER_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const RUNG_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 240, damping: 22 },
  },
};

const DETAIL_VARIANTS: Variants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    marginTop: 12,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] },
  },
};

const TOAST_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.94 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { opacity: 0, y: -16, scale: 0.94, transition: { duration: 0.22 } },
};

// ─── Animated counter ──────────────────────────────────────────────────────────
function AnimCounter({ value, prefix = '', suffix = '', decimals = 0 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const mv = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctrl = animate(mv, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
        }
      },
    });
    return () => ctrl.stop();
  }, [mv, value, prefix, suffix, decimals]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

// ─── Feature flag row ─────────────────────────────────────────────────────────
const FEAT_DEFS: { key: keyof FeatureFlags; label: string; icon: typeof Zap }[] = [
  { key: 'crm', label: 'CRM integration', icon: Users },
  { key: 'sequences', label: 'Email sequences', icon: Send },
  { key: 'reports', label: 'Scheduled reports', icon: FileText },
  { key: 'premiumPool', label: 'Premium peer pool', icon: Zap },
  { key: 'dnsValidator', label: 'DNS validator', icon: Shield },
  { key: 'premiumSupport', label: 'Priority support', icon: HeadphonesIcon },
];

// ─── Adoption bar ─────────────────────────────────────────────────────────────
function AdoptionBar({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  return (
    <div style={{
      height: 6,
      borderRadius: 99,
      background: T.hairline,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 20, delay }}
        style={{
          transformOrigin: 'left',
          width: `${pct}%`,
          height: '100%',
          borderRadius: 99,
          background: color,
        }}
      />
    </div>
  );
}

// ─── Toast notification ────────────────────────────────────────────────────────
interface ToastMsg { id: number; text: string; kind: 'success' | 'danger' | 'info'; }

function ToastLayer({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 999,
      display: 'flex', flexDirection: 'column-reverse', gap: 10,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            variants={TOAST_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              ...GLASS_INNER,
              background: t.kind === 'success' ? T.successDim : t.kind === 'danger' ? T.dangerDim : T.accentDim,
              border: `1px solid ${t.kind === 'success' ? T.success : t.kind === 'danger' ? T.danger : T.accent}`,
              pointerEvents: 'all',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: t.kind === 'success' ? T.success : t.kind === 'danger' ? T.danger : T.accent,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 220,
            }}
            onClick={() => onDismiss(t.id)}
          >
            {t.kind === 'success' ? <Check size={14} /> : t.kind === 'danger' ? <X size={14} /> : <Zap size={14} />}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Editable field ──────────────────────────────────────────────────────────
function EditField({ label, value, type = 'text', onChange }: {
  label: string; value: string | number; type?: string; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.faint }}>{label}</span>
      <input
        type={type}
        defaultValue={String(value)}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: T.ghost,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: '6px 10px',
          color: T.text,
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function AdmPlanPL4Ladder() {
  const [tiers, setTiers] = useState<Tier[]>(INITIAL_TIERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const toastIdRef = useRef(0);

  // Draft edits for the open rung
  const [draft, setDraft] = useState<Tier | null>(null);

  const totalMrr = tiers.reduce((s, t) => s + t.mrr, 0);
  const totalSubs = tiers.reduce((s, t) => s + t.subscribers, 0);
  const maxSubs = Math.max(...tiers.map((t) => t.subscribers), 1);

  const pushToast = useCallback((text: string, kind: ToastMsg['kind'] = 'success') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openRung = (tier: Tier) => {
    if (expandedId === tier.id) {
      setExpandedId(null);
      setDraft(null);
      setDeleteConfirm(null);
    } else {
      setExpandedId(tier.id);
      setDraft({ ...tier });
      setDeleteConfirm(null);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    setTiers((prev) => prev.map((t) => (t.id === draft.id ? { ...draft } : t)));
    pushToast(`"${draft.name}" saved`, 'success');
    setExpandedId(null);
    setDraft(null);
  };

  const deleteTier = (id: string) => {
    const tier = tiers.find((t) => t.id === id);
    setTiers((prev) => prev.filter((t) => t.id !== id));
    setExpandedId(null);
    setDraft(null);
    setDeleteConfirm(null);
    pushToast(`"${tier?.name ?? 'Tier'}" deleted`, 'danger');
  };

  const addTier = () => {
    const newTier: Tier = {
      id: genId(),
      name: 'New Tier',
      price: 0,
      mailboxLimit: 5,
      dailySendTarget: 50,
      features: { crm: false, sequences: false, reports: false, premiumSupport: false, dnsValidator: true, premiumPool: false },
      subscribers: 0,
      mrr: 0,
    };
    setTiers((prev) => [...prev, newTier]);
    setExpandedId(newTier.id);
    setDraft({ ...newTier });
    pushToast('New tier added — configure below', 'info');
  };

  const patchDraft = (field: keyof Tier, value: unknown) => {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  };

  const toggleFeature = (key: keyof FeatureFlags) => {
    setDraft((d) => d ? { ...d, features: { ...d.features, [key]: !d.features[key] } } : d);
  };

  // The "height" of each rung on the ladder is proportional to its index (tier level)
  // plus a base, giving an ascending staircase effect.
  const RUNG_BASE_H = 72;
  const RUNG_STEP = 20;

  return (
    <div style={{ minHeight: '100vh', padding: '28px 24px 80px', boxSizing: 'border-box', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      <ToastLayer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Header KPI strip ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint, marginBottom: 4 }}>
              Admin · Plans & Pricing
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.02em' }}>
              Tier Ladder
            </h1>
            <p style={{ fontSize: 13, color: T.dim, margin: '4px 0 0' }}>
              Click a rung to edit. Drag to reorder coming soon.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.04, background: `rgba(242,101,34,0.22)` }}
            whileTap={{ scale: 0.96 }}
            onClick={addTier}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: T.accentDim,
              border: `1px solid ${T.accent}`,
              borderRadius: 10, padding: '9px 16px',
              color: T.accent, fontWeight: 700, fontSize: 13,
              cursor: 'pointer', transition: 'background 0.18s',
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Add tier
          </motion.button>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { icon: DollarSign, label: 'Total MRR', value: totalMrr, prefix: '$', color: T.accent },
            { icon: Users, label: 'Subscribers', value: totalSubs, prefix: '', color: T.success },
            { icon: Layers, label: 'Active Tiers', value: tiers.length, prefix: '', color: T.accentLight },
            { icon: TrendingUp, label: 'ARPU', value: totalSubs > 0 ? Math.round(totalMrr / totalSubs) : 0, prefix: '$', color: T.warning },
          ].map(({ icon: Icon, label, value, prefix, color }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 + i * 0.06, type: 'spring', stiffness: 200, damping: 22 }}
              style={{ ...GLASS, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: T.faint, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <Icon size={12} strokeWidth={2.4} style={{ color }} />
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
                <AnimCounter value={value} prefix={prefix} />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Ladder scaffold ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>

        {/* Left: ladder visual (ascending bars) */}
        <div style={{ flexShrink: 0, width: 56, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, alignSelf: 'stretch' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.faint, textAlign: 'center', marginBottom: 8 }}>
            Tiers
          </div>
          {tiers.map((tier, i) => {
            const h = RUNG_BASE_H + i * RUNG_STEP;
            const color = TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] ?? TIER_COLORS[TIER_COLORS.length - 1]!;
            const glow = TIER_GLOW[Math.min(i, TIER_GLOW.length - 1)] ?? TIER_GLOW[TIER_GLOW.length - 1]!;
            return (
              <motion.div
                key={tier.id}
                layout
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                exit={{ scaleY: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22, delay: i * 0.07 }}
                style={{
                  width: '100%',
                  height: h,
                  borderRadius: '6px 6px 0 0',
                  background: color,
                  boxShadow: `0 0 18px ${glow}`,
                  transformOrigin: 'bottom',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onClick={() => openRung(tier)}
                whileHover={{ filter: 'brightness(1.18)' }}
                whileTap={{ scale: 0.97 }}
                title={tier.name}
              >
                {/* step label */}
                <div style={{
                  position: 'absolute', top: 6, left: 0, right: 0,
                  textAlign: 'center', fontSize: 9, fontWeight: 800,
                  color: 'rgba(255,255,255,0.85)', letterSpacing: '0.05em',
                  writingMode: 'vertical-lr', transform: 'rotate(180deg)',
                  margin: '0 auto', lineHeight: 1,
                }}>
                  {tier.name}
                </div>
              </motion.div>
            );
          })}
          {/* Ground line */}
          <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`, borderRadius: 99, marginTop: 2 }} />
        </div>

        {/* Right: rungs list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <AnimatePresence mode="popLayout">
            <motion.div
              variants={LADDER_VARIANTS}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {tiers.map((tier, i) => {
                const isExpanded = expandedId === tier.id;
                const color = TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] ?? TIER_COLORS[TIER_COLORS.length - 1]!;
                const glow = TIER_GLOW[Math.min(i, TIER_GLOW.length - 1)] ?? TIER_GLOW[TIER_GLOW.length - 1]!;
                const subsPct = (tier.subscribers / maxSubs) * 100;
                const isDeleteConfirm = deleteConfirm === tier.id;

                return (
                  <motion.div
                    key={tier.id}
                    layout
                    variants={RUNG_VARIANTS}
                    exit={{ opacity: 0, x: -40, transition: { duration: 0.25 } }}
                    style={{ borderRadius: 14 }}
                  >
                    {/* ── Rung header ── */}
                    <motion.div
                      whileHover={{ background: `rgba(255,255,255,0.08)` }}
                      onClick={() => openRung(tier)}
                      style={{
                        ...GLASS,
                        borderRadius: isExpanded ? '14px 14px 0 0' : 14,
                        border: isExpanded ? `1px solid ${color}` : `1px solid ${T.border}`,
                        boxShadow: isExpanded ? `0 0 24px ${glow}` : 'none',
                        padding: '14px 18px',
                        cursor: 'pointer',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto auto auto',
                        alignItems: 'center',
                        gap: 14,
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        userSelect: 'none',
                      }}
                    >
                      {/* Tier identity */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        {/* Color swatch / rung indicator */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: color,
                          boxShadow: `0 0 14px ${glow}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>
                            {tier.price === 0 ? 'FREE' : `$${tier.price}`}
                          </span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>
                            {tier.name}
                          </div>
                          <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>
                            {tier.mailboxLimit === 0 ? '∞ mailboxes' : `${tier.mailboxLimit} mailboxes`}
                            {' · '}
                            {tier.dailySendTarget}/day
                          </div>
                        </div>
                      </div>

                      {/* Adoption bar + count */}
                      <div style={{ width: 100 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 10, color: T.faint }}>Subscribers</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.dim }}>{tier.subscribers}</span>
                        </div>
                        <AdoptionBar pct={subsPct} color={color} delay={0.2 + i * 0.08} />
                      </div>

                      {/* MRR */}
                      <div style={{ textAlign: 'right', minWidth: 60 }}>
                        <div style={{ fontSize: 10, color: T.faint, marginBottom: 2 }}>MRR</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: tier.mrr > 0 ? T.success : T.faint }}>
                          {tier.mrr === 0 ? '—' : fmt(tier.mrr)}
                        </div>
                      </div>

                      {/* Feature pill count */}
                      <div style={{
                        background: T.ghost, borderRadius: 99, padding: '3px 9px',
                        fontSize: 11, fontWeight: 700, color: T.dim,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <BarChart2 size={10} strokeWidth={2.4} />
                        {Object.values(tier.features).filter(Boolean).length}/{FEAT_DEFS.length}
                      </div>

                      {/* Expand chevron */}
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.22 }}
                        style={{ color: T.faint }}
                      >
                        <ChevronDown size={16} strokeWidth={2.2} />
                      </motion.div>
                    </motion.div>

                    {/* ── Expanded detail ── */}
                    <AnimatePresence initial={false}>
                      {isExpanded && draft && draft.id === tier.id && (
                        <motion.div
                          variants={DETAIL_VARIANTS}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            ...GLASS,
                            borderRadius: '0 0 14px 14px',
                            border: `1px solid ${color}`,
                            borderTop: 'none',
                            padding: '18px 20px 20px',
                            boxShadow: `0 8px 32px ${glow}`,
                          }}>
                            {/* Edit fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 18 }}>
                              <EditField
                                label="Tier name"
                                value={draft.name}
                                onChange={(v) => patchDraft('name', v)}
                              />
                              <EditField
                                label="Price / mo ($)"
                                value={draft.price}
                                type="number"
                                onChange={(v) => patchDraft('price', Number(v))}
                              />
                              <EditField
                                label="Mailbox limit (0 = unlimited)"
                                value={draft.mailboxLimit}
                                type="number"
                                onChange={(v) => patchDraft('mailboxLimit', Number(v))}
                              />
                              <EditField
                                label="Daily send target"
                                value={draft.dailySendTarget}
                                type="number"
                                onChange={(v) => patchDraft('dailySendTarget', Number(v))}
                              />
                            </div>

                            {/* Feature toggles */}
                            <div style={{ marginBottom: 18 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.faint, marginBottom: 10 }}>
                                Feature flags
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                {FEAT_DEFS.map(({ key, label, icon: FIcon }) => {
                                  const on = draft.features[key];
                                  return (
                                    <motion.button
                                      key={key}
                                      onClick={() => toggleFeature(key)}
                                      whileHover={{ scale: 1.03 }}
                                      whileTap={{ scale: 0.97 }}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        background: on ? `rgba(61,220,151,0.12)` : T.ghost,
                                        border: `1px solid ${on ? T.success : T.borderDim}`,
                                        borderRadius: 9, padding: '7px 10px',
                                        cursor: 'pointer', color: on ? T.success : T.faint,
                                        fontSize: 12, fontWeight: 600,
                                        textAlign: 'left', transition: 'background 0.18s, border-color 0.18s',
                                      }}
                                    >
                                      <FIcon size={13} strokeWidth={2.2} />
                                      <span style={{ flex: 1, lineHeight: 1.2 }}>{label}</span>
                                      <motion.div
                                        animate={{ scale: on ? 1 : 0.5, opacity: on ? 1 : 0 }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                      >
                                        <Check size={12} strokeWidth={2.4} />
                                      </motion.div>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Action row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <div>
                                {isDeleteConfirm ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: T.danger, fontWeight: 600 }}>
                                      Delete "{tier.name}"?
                                    </span>
                                    <motion.button
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => deleteTier(tier.id)}
                                      style={{
                                        background: T.dangerDim, border: `1px solid ${T.danger}`,
                                        borderRadius: 7, padding: '5px 11px',
                                        color: T.danger, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                      }}
                                    >
                                      Yes, delete
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => setDeleteConfirm(null)}
                                      style={{
                                        background: T.ghost, border: `1px solid ${T.borderDim}`,
                                        borderRadius: 7, padding: '5px 11px',
                                        color: T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                      }}
                                    >
                                      Cancel
                                    </motion.button>
                                  </div>
                                ) : (
                                  <motion.button
                                    whileHover={{ background: T.dangerDim }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setDeleteConfirm(tier.id)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      background: 'transparent', border: `1px solid ${T.borderDim}`,
                                      borderRadius: 8, padding: '7px 13px',
                                      color: T.danger, fontSize: 12, fontWeight: 600,
                                      cursor: 'pointer', transition: 'background 0.18s',
                                    }}
                                  >
                                    <Trash2 size={13} strokeWidth={2.2} />
                                    Delete tier
                                  </motion.button>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: 8 }}>
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => { setExpandedId(null); setDraft(null); setDeleteConfirm(null); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: T.ghost, border: `1px solid ${T.borderDim}`,
                                    borderRadius: 8, padding: '7px 14px',
                                    color: T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                  }}
                                >
                                  <X size={12} strokeWidth={2.4} />
                                  Cancel
                                </motion.button>
                                <motion.button
                                  whileHover={{ background: `rgba(242,101,34,0.28)`, scale: 1.02 }}
                                  whileTap={{ scale: 0.96 }}
                                  onClick={saveDraft}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: T.accentDim,
                                    border: `1px solid ${T.accent}`,
                                    borderRadius: 8, padding: '7px 16px',
                                    color: T.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    transition: 'background 0.18s',
                                  }}
                                >
                                  <Check size={13} strokeWidth={2.4} />
                                  Save changes
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {/* Empty state */}
          <AnimatePresence>
            {tiers.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  ...GLASS,
                  padding: '40px 24px',
                  textAlign: 'center',
                  color: T.faint,
                  fontSize: 14,
                  borderStyle: 'dashed',
                }}
              >
                <Layers size={28} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.5 }} />
                <div>No tiers yet.</div>
                <div style={{ marginTop: 4, fontSize: 12 }}>Click "Add tier" to create your first plan.</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── MRR waterfall legend ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, type: 'spring', stiffness: 180, damping: 22 }}
        style={{ ...GLASS, marginTop: 28, padding: '18px 20px' }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.faint, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <DollarSign size={12} strokeWidth={2.4} style={{ color: T.accent }} />
          MRR distribution across tiers
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, gap: 8 }}>
          {tiers.map((tier, i) => {
            const mrrPct = totalMrr > 0 ? (tier.mrr / totalMrr) * 100 : 0;
            const color = TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] ?? TIER_COLORS[TIER_COLORS.length - 1]!;
            return (
              <div key={tier.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.dim }}>{tier.name}</span>
                  <span style={{ fontSize: 10, color: T.faint }}>{Math.round(mrrPct)}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: T.hairline, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.6 + i * 0.1 }}
                    style={{
                      transformOrigin: 'left',
                      width: `${mrrPct}%`,
                      height: '100%',
                      borderRadius: 99,
                      background: color,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: tier.mrr > 0 ? T.success : T.faint, marginTop: 5 }}>
                  {tier.mrr === 0 ? '—' : fmt(tier.mrr)}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Plan comparison summary table ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, type: 'spring', stiffness: 160, damping: 20 }}
        style={{ ...GLASS, marginTop: 16, padding: '18px 20px', overflowX: 'auto' }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: T.faint, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Layers size={12} strokeWidth={2.4} style={{ color: T.accentLight }} />
          Feature matrix comparison
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0 8px 10px 0', color: T.faint, fontWeight: 600, whiteSpace: 'nowrap' }}>Feature</th>
              {tiers.map((t, i) => {
                const color = TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] ?? TIER_COLORS[TIER_COLORS.length - 1]!;
                return (
                  <th key={t.id} style={{ padding: '0 8px 10px', color, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {t.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Limit rows */}
            {[
              { label: 'Price /mo', render: (t: Tier) => t.price === 0 ? 'Free' : `$${t.price}` },
              { label: 'Mailboxes', render: (t: Tier) => t.mailboxLimit === 0 ? '∞' : String(t.mailboxLimit) },
              { label: 'Daily sends', render: (t: Tier) => String(t.dailySendTarget) },
            ].map(({ label, render }) => (
              <tr key={label} style={{ borderTop: `1px solid ${T.borderDim}` }}>
                <td style={{ padding: '8px 8px 8px 0', color: T.dim, whiteSpace: 'nowrap' }}>{label}</td>
                {tiers.map((t) => (
                  <td key={t.id} style={{ padding: '8px', textAlign: 'center', color: T.text, fontWeight: 600 }}>
                    {render(t)}
                  </td>
                ))}
              </tr>
            ))}
            {/* Feature flag rows */}
            {FEAT_DEFS.map(({ key, label, icon: FIcon }) => (
              <tr key={key} style={{ borderTop: `1px solid ${T.borderDim}` }}>
                <td style={{ padding: '8px 8px 8px 0', color: T.dim, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <FIcon size={11} strokeWidth={2.2} style={{ color: T.faint }} />
                  {label}
                </td>
                {tiers.map((t) => (
                  <td key={t.id} style={{ padding: '8px', textAlign: 'center' }}>
                    {t.features[key] ? (
                      <Check size={14} strokeWidth={2.4} style={{ color: T.success, margin: '0 auto', display: 'block' }} />
                    ) : (
                      <X size={14} strokeWidth={2.4} style={{ color: T.faint, margin: '0 auto', display: 'block' }} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
