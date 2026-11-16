/**
 * Admin Plans & Pricing Design Candidate: PL1 Pricing Studio
 *
 * "Pricing Studio" — a rich, editable plan-management surface where the super-admin
 * can create, edit inline, and delete subscription plans. Animated counters in the
 * KPI header, staggered card entrance, smooth per-card inline-edit expansion with
 * AnimatePresence, layout-animated card grid for create/delete re-flow, and a
 * monthly/annual billing toggle that re-animates price displays.
 *
 * Self-contained: inline style={{}} only, mock data only, no API / react-query /
 * @/features / @/lib/api imports. Aurora Glass dark palette, warm amber/orange only.
 * No CSS file import. No Tailwind.
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
  DollarSign,
  Users,
  CreditCard,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronRight,
  Inbox,
  Mail,
  BarChart3,
  PhoneCall,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Star,
  Zap,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.20)' as const,
  accentGlow: 'rgba(242,101,34,0.35)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.15)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.15)' as const,
  warning: '#FF8A4B' as const,
  warningDim: 'rgba(255,138,75,0.15)' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
  } as CSSProperties,
  glassCard: {
    background: 'rgba(255,255,255,0.055)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 18,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  } as CSSProperties,
};

// ─── Types ──────────────────────────────────────────────────────────────────────
type BillingPeriod = 'monthly' | 'annual';

interface PlanFeatures {
  crmAccess: boolean;
  sequences: boolean;
  reports: boolean;
  prioritySupport: boolean;
  apiAccess: boolean;
  customDomain: boolean;
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  mailboxLimit: number;
  dailySendTarget: number;
  features: PlanFeatures;
  subscribers: number;
  mrrContribution: number;
  isPopular: boolean;
  color: string;
  tier: 0 | 1 | 2 | 3 | 4;
}

interface EditDraft {
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  mailboxLimit: string;
  dailySendTarget: string;
  features: PlanFeatures;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning';
}

// ─── Mock data ──────────────────────────────────────────────────────────────────
const INITIAL_PLANS: Plan[] = [
  {
    id: 'pl-free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    mailboxLimit: 1,
    dailySendTarget: 10,
    features: { crmAccess: false, sequences: false, reports: false, prioritySupport: false, apiAccess: false, customDomain: false },
    subscribers: 312,
    mrrContribution: 0,
    isPopular: false,
    color: T.ghost,
    tier: 0,
  },
  {
    id: 'pl-starter',
    name: 'Starter',
    priceMonthly: 19,
    priceAnnual: 15,
    mailboxLimit: 3,
    dailySendTarget: 30,
    features: { crmAccess: false, sequences: false, reports: true, prioritySupport: false, apiAccess: false, customDomain: false },
    subscribers: 487,
    mrrContribution: 9253,
    isPopular: false,
    color: T.success,
    tier: 1,
  },
  {
    id: 'pl-pro',
    name: 'Pro',
    priceMonthly: 49,
    priceAnnual: 39,
    mailboxLimit: 10,
    dailySendTarget: 150,
    features: { crmAccess: true, sequences: false, reports: true, prioritySupport: false, apiAccess: true, customDomain: false },
    subscribers: 362,
    mrrContribution: 17738,
    isPopular: true,
    color: T.accentLight,
    tier: 2,
  },
  {
    id: 'pl-proplus',
    name: 'Pro Plus',
    priceMonthly: 99,
    priceAnnual: 79,
    mailboxLimit: 25,
    dailySendTarget: 400,
    features: { crmAccess: true, sequences: true, reports: true, prioritySupport: false, apiAccess: true, customDomain: true },
    subscribers: 184,
    mrrContribution: 18216,
    isPopular: false,
    color: T.accent,
    tier: 3,
  },
  {
    id: 'pl-agency',
    name: 'Agency',
    priceMonthly: 249,
    priceAnnual: 199,
    mailboxLimit: 100,
    dailySendTarget: 2000,
    features: { crmAccess: true, sequences: true, reports: true, prioritySupport: true, apiAccess: true, customDomain: true },
    subscribers: 97,
    mrrContribution: 24153,
    isPopular: false,
    color: '#ff5c7a',
    tier: 4,
  },
];

const TIER_ICONS = [Star, Zap, Sparkles, BarChart3, PhoneCall] as const;

// ─── Animation variants ─────────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 320, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: -16,
    transition: { duration: 0.22, ease: 'easeOut' },
  },
};

const editPanelVariants: Variants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    marginTop: 14,
    transition: { type: 'spring', stiffness: 260, damping: 26 },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    transition: { duration: 0.18, ease: 'easeInOut' },
  },
};

const toastVariants: Variants = {
  hidden: { opacity: 0, x: 80, scale: 0.92 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 28 } },
  exit: { opacity: 0, x: 80, scale: 0.88, transition: { duration: 0.2 } },
};

// ─── Animated counter hook ──────────────────────────────────────────────────────
function useAnimatedNumber(target: number, prefix = '', suffix = '') {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);
  const ctrlRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(mv, target, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = mv.on('change', (v) => {
      const rounded = Math.round(v);
      const formatted = rounded >= 1000
        ? rounded.toLocaleString()
        : String(rounded);
      setDisplay(`${prefix}${formatted}${suffix}`);
    });
    return () => {
      ctrlRef.current?.stop();
      unsub();
    };
  }, [target, prefix, suffix, mv]);

  return display;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function FeatureToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: `1px solid ${T.hairline}`,
      }}
    >
      <span style={{ fontSize: 13, color: T.dim }}>{label}</span>
      <motion.button
        onClick={() => onChange(!value)}
        whileTap={{ scale: 0.88 }}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 'none',
          cursor: 'pointer',
          background: value
            ? `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`
            : 'rgba(255,255,255,0.12)',
          position: 'relative',
          transition: 'background 0.22s',
          flexShrink: 0,
        }}
      >
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
          }}
        />
      </motion.button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase' }}>
        {label}
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '6px 10px',
        }}
      >
        {prefix && <span style={{ color: T.faint, fontSize: 13 }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: T.text,
            fontSize: 14,
            fontWeight: 600,
            minWidth: 0,
          }}
        />
        {suffix && <span style={{ color: T.faint, fontSize: 13 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  billing,
  onEdit,
  onDelete,
  onSave,
  isEditing,
  editDraft,
  setEditDraft,
  onCancelEdit,
}: {
  plan: Plan;
  billing: BillingPeriod;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (draft: EditDraft) => void;
  isEditing: boolean;
  editDraft: EditDraft | null;
  setEditDraft: (d: EditDraft) => void;
  onCancelEdit: () => void;
}) {
  const displayPrice = billing === 'monthly' ? plan.priceMonthly : plan.priceAnnual;
  const TierIcon = TIER_ICONS[plan.tier] ?? Star;

  const featureLabels: Array<{ key: keyof PlanFeatures; label: string }> = [
    { key: 'crmAccess', label: 'CRM Access' },
    { key: 'sequences', label: 'Sequences' },
    { key: 'reports', label: 'Reports' },
    { key: 'prioritySupport', label: 'Priority Support' },
    { key: 'apiAccess', label: 'API Access' },
    { key: 'customDomain', label: 'Custom Domain' },
  ];

  const activeFeatures = featureLabels.filter(f => plan.features[f.key]);
  const mrrFmt = plan.mrrContribution >= 1000
    ? `$${(plan.mrrContribution / 1000).toFixed(1)}k`
    : `$${plan.mrrContribution}`;

  return (
    <motion.div
      layout
      variants={cardVariants}
      whileHover={{ y: isEditing ? 0 : -4, boxShadow: isEditing ? 'none' : `0 8px 32px rgba(0,0,0,0.32), 0 0 0 1px ${plan.color}28` }}
      whileTap={{ scale: isEditing ? 1 : 0.99 }}
      style={{
        ...T.glassCard,
        position: 'relative',
        overflow: 'hidden',
        border: isEditing
          ? `1px solid ${plan.color}70`
          : '1px solid rgba(255,255,255,0.10)',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: plan.name === 'Free'
            ? 'rgba(255,255,255,0.18)'
            : `linear-gradient(90deg, ${plan.color}, ${plan.color}88)`,
          borderRadius: '18px 18px 0 0',
        }}
      />

      {/* Popular badge */}
      {plan.isPopular && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: '#fff',
            textTransform: 'uppercase',
          }}
        >
          Most Popular
        </div>
      )}

      <div style={{ padding: '22px 22px 18px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: `${plan.color}20`,
              border: `1px solid ${plan.color}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TierIcon size={17} color={plan.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 2 }}>
              {plan.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <motion.span
                key={`price-${plan.id}-${billing}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                style={{ fontSize: 26, fontWeight: 800, color: T.text }}
              >
                {displayPrice === 0 ? 'Free' : `$${displayPrice}`}
              </motion.span>
              {displayPrice > 0 && (
                <span style={{ fontSize: 12, color: T.faint }}>/mo</span>
              )}
              {billing === 'annual' && displayPrice > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: T.success,
                    background: T.successDim,
                    borderRadius: 4,
                    padding: '1px 5px',
                    marginLeft: 4,
                  }}
                >
                  ANNUAL
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Limits row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div style={{ ...T.glassTight, padding: '9px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 3 }}>
              Mailboxes
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {plan.mailboxLimit >= 100 ? '100+' : plan.mailboxLimit}
            </div>
          </div>
          <div style={{ ...T.glassTight, padding: '9px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 3 }}>
              Daily Sends
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {plan.dailySendTarget >= 1000
                ? `${(plan.dailySendTarget / 1000).toFixed(1)}k`
                : plan.dailySendTarget}
            </div>
          </div>
        </div>

        {/* Active features */}
        <div style={{ marginBottom: 14 }}>
          {activeFeatures.length === 0 ? (
            <div style={{ fontSize: 12, color: T.faint, fontStyle: 'italic' }}>No premium features</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeFeatures.map(f => (
                <div
                  key={f.key}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: T.dim,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 5,
                    padding: '3px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircle2 size={10} color={T.success} />
                  {f.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adoption metrics */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              padding: '8px 12px',
              borderRight: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 2 }}>
              Subscribers
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
              {plan.subscribers.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              padding: '8px 12px',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 2 }}>
              MRR
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: plan.mrrContribution > 0 ? T.success : T.faint,
              }}
            >
              {plan.mrrContribution > 0 ? mrrFmt : '—'}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.button
            whileHover={{ scale: 1.04, background: `${T.accent}22` }}
            whileTap={{ scale: 0.96 }}
            onClick={onEdit}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px 0',
              borderRadius: 9,
              border: `1px solid rgba(255,255,255,0.12)`,
              background: 'rgba(255,255,255,0.06)',
              color: T.dim,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.18s, color 0.18s',
            }}
          >
            <Pencil size={13} />
            Edit
          </motion.button>
          {plan.name !== 'Free' && (
            <motion.button
              whileHover={{ scale: 1.04, background: `${T.danger}22` }}
              whileTap={{ scale: 0.96 }}
              onClick={onDelete}
              style={{
                width: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 9,
                border: `1px solid rgba(255,92,122,0.20)`,
                background: 'transparent',
                color: T.danger,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.18s',
              }}
            >
              <Trash2 size={14} />
            </motion.button>
          )}
        </div>

        {/* Edit panel */}
        <AnimatePresence>
          {isEditing && editDraft && (
            <motion.div
              key="edit-panel"
              variants={editPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  marginTop: 14,
                  padding: '16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${plan.color}30`,
                  borderRadius: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 14 }}>
                  Edit Plan
                </div>

                {/* Name */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Plan Name
                  </label>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      padding: '7px 10px',
                      color: T.text,
                      fontSize: 14,
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Prices */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <NumberInput
                    label="$/mo"
                    value={editDraft.priceMonthly}
                    onChange={(v) => setEditDraft({ ...editDraft, priceMonthly: v })}
                    prefix="$"
                  />
                  <NumberInput
                    label="$/mo (annual)"
                    value={editDraft.priceAnnual}
                    onChange={(v) => setEditDraft({ ...editDraft, priceAnnual: v })}
                    prefix="$"
                  />
                </div>

                {/* Limits */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <NumberInput
                    label="Mailboxes"
                    value={editDraft.mailboxLimit}
                    onChange={(v) => setEditDraft({ ...editDraft, mailboxLimit: v })}
                  />
                  <NumberInput
                    label="Daily Sends"
                    value={editDraft.dailySendTarget}
                    onChange={(v) => setEditDraft({ ...editDraft, dailySendTarget: v })}
                  />
                </div>

                {/* Feature toggles */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 8 }}>
                    Feature Flags
                  </div>
                  <FeatureToggle
                    label="CRM Access"
                    value={editDraft.features.crmAccess}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, crmAccess: v } })}
                  />
                  <FeatureToggle
                    label="Sequences"
                    value={editDraft.features.sequences}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, sequences: v } })}
                  />
                  <FeatureToggle
                    label="Reports"
                    value={editDraft.features.reports}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, reports: v } })}
                  />
                  <FeatureToggle
                    label="Priority Support"
                    value={editDraft.features.prioritySupport}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, prioritySupport: v } })}
                  />
                  <FeatureToggle
                    label="API Access"
                    value={editDraft.features.apiAccess}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, apiAccess: v } })}
                  />
                  <FeatureToggle
                    label="Custom Domain"
                    value={editDraft.features.customDomain}
                    onChange={(v) => setEditDraft({ ...editDraft, features: { ...editDraft.features, customDomain: v } })}
                  />
                </div>

                {/* Save / Cancel */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onSave(editDraft)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '9px 0',
                      borderRadius: 9,
                      border: 'none',
                      background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Check size={14} />
                    Save Changes
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={onCancelEdit}
                    style={{
                      padding: '9px 14px',
                      borderRadius: 9,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.06)',
                      color: T.dim,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Delete confirm modal ────────────────────────────────────────────────────────
function DeleteConfirmModal({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: Plan;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...T.glassCard,
          background: 'rgba(20,16,12,0.92)',
          border: `1px solid ${T.danger}40`,
          maxWidth: 380,
          width: '100%',
          padding: '28px 28px 24px',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: T.dangerDim,
            border: `1px solid ${T.danger}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <AlertTriangle size={20} color={T.danger} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          Delete "{plan.name}" plan?
        </div>
        <div style={{ fontSize: 14, color: T.dim, lineHeight: 1.6, marginBottom: 24 }}>
          {plan.subscribers} subscriber{plan.subscribers !== 1 ? 's' : ''} are currently on this plan.
          They will need to be migrated before deletion completes.
          This action cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 10,
              border: 'none',
              background: T.danger,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Delete Plan
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: T.dim,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── New Plan Modal ──────────────────────────────────────────────────────────────
function NewPlanModal({
  onSave,
  onCancel,
}: {
  onSave: (draft: EditDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EditDraft>({
    name: '',
    priceMonthly: '0',
    priceAnnual: '0',
    mailboxLimit: '5',
    dailySendTarget: '50',
    features: {
      crmAccess: false,
      sequences: false,
      reports: false,
      prioritySupport: false,
      apiAccess: false,
      customDomain: false,
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 30 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...T.glassCard,
          background: 'rgba(18,14,10,0.94)',
          border: `1px solid ${T.accent}40`,
          maxWidth: 460,
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: '28px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: T.accentDim,
                border: `1px solid ${T.accent}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={18} color={T.accent} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>New Plan</div>
              <div style={{ fontSize: 12, color: T.faint }}>Configure subscription tier</div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={onCancel}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.dim,
              cursor: 'pointer',
            }}
          >
            <X size={15} />
          </motion.button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
            Plan Name
          </label>
          <input
            placeholder="e.g. Business"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 9,
              padding: '9px 12px',
              color: T.text,
              fontSize: 14,
              fontWeight: 600,
              outline: 'none',
            }}
          />
        </div>

        {/* Prices */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <NumberInput
            label="Monthly price ($)"
            value={draft.priceMonthly}
            onChange={(v) => setDraft({ ...draft, priceMonthly: v })}
            prefix="$"
            suffix="/mo"
          />
          <NumberInput
            label="Annual price ($)"
            value={draft.priceAnnual}
            onChange={(v) => setDraft({ ...draft, priceAnnual: v })}
            prefix="$"
            suffix="/mo"
          />
        </div>

        {/* Limits */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <NumberInput
            label="Mailbox limit"
            value={draft.mailboxLimit}
            onChange={(v) => setDraft({ ...draft, mailboxLimit: v })}
          />
          <NumberInput
            label="Daily send target"
            value={draft.dailySendTarget}
            onChange={(v) => setDraft({ ...draft, dailySendTarget: v })}
          />
        </div>

        {/* Features */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase', marginBottom: 10 }}>
            Feature Flags
          </div>
          <FeatureToggle label="CRM Access" value={draft.features.crmAccess} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, crmAccess: v } })} />
          <FeatureToggle label="Sequences" value={draft.features.sequences} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, sequences: v } })} />
          <FeatureToggle label="Reports" value={draft.features.reports} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, reports: v } })} />
          <FeatureToggle label="Priority Support" value={draft.features.prioritySupport} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, prioritySupport: v } })} />
          <FeatureToggle label="API Access" value={draft.features.apiAccess} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, apiAccess: v } })} />
          <FeatureToggle label="Custom Domain" value={draft.features.customDomain} onChange={(v) => setDraft({ ...draft, features: { ...draft.features, customDomain: v } })} />
        </div>

        {/* Create */}
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: `0 0 24px ${T.accentGlow}` }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            if (draft.name.trim()) onSave(draft);
          }}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 10,
            border: 'none',
            background: draft.name.trim()
              ? `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`
              : 'rgba(255,255,255,0.10)',
            color: draft.name.trim() ? '#fff' : T.faint,
            fontSize: 14,
            fontWeight: 700,
            cursor: draft.name.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.2s',
          }}
        >
          <Plus size={16} />
          Create Plan
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  display,
  icon: Icon,
  sub,
  accent,
}: {
  label: string;
  display: string;
  icon: typeof DollarSign;
  sub?: string;
  accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: `0 8px 24px rgba(0,0,0,0.28)` }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      style={{
        ...T.glass,
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          background: accent ? `${accent}18` : 'rgba(255,255,255,0.08)',
          border: `1px solid ${accent ?? 'rgba(255,255,255,0.10)'}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={19} color={accent ?? T.dim} />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: T.faint, textTransform: 'uppercase', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1 }}>
          {display}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────────
export function AdmPlanPL1Studio() {
  const [plans, setPlans] = useState<Plan[]>(INITIAL_PLANS);
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── KPI computed values ──────────────────────────────────────────────────────
  const totalMRR = plans.reduce((s, p) => s + p.mrrContribution, 0);
  const totalSubs = plans.reduce((s, p) => s + p.subscribers, 0);
  const activePlans = plans.length;
  const arpu = totalSubs > 0 ? Math.round(totalMRR / totalSubs) : 0;

  // ── Animated counters ────────────────────────────────────────────────────────
  const mrrDisplay = useAnimatedNumber(totalMRR, '$');
  const subsDisplay = useAnimatedNumber(totalSubs);
  const plansDisplay = useAnimatedNumber(activePlans);
  const arpuDisplay = useAnimatedNumber(arpu, '$');

  // ── Toast helpers ────────────────────────────────────────────────────────────
  const pushToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  // ── Edit handlers ────────────────────────────────────────────────────────────
  const handleEdit = useCallback((plan: Plan) => {
    setEditingId(plan.id);
    setEditDrafts(d => ({
      ...d,
      [plan.id]: {
        name: plan.name,
        priceMonthly: String(plan.priceMonthly),
        priceAnnual: String(plan.priceAnnual),
        mailboxLimit: String(plan.mailboxLimit),
        dailySendTarget: String(plan.dailySendTarget),
        features: { ...plan.features },
      },
    }));
  }, []);

  const handleSave = useCallback((planId: string, draft: EditDraft) => {
    setPlans(prev => prev.map(p =>
      p.id !== planId ? p : {
        ...p,
        name: draft.name || p.name,
        priceMonthly: Math.max(0, Number(draft.priceMonthly) || 0),
        priceAnnual: Math.max(0, Number(draft.priceAnnual) || 0),
        mailboxLimit: Math.max(1, Number(draft.mailboxLimit) || 1),
        dailySendTarget: Math.max(1, Number(draft.dailySendTarget) || 1),
        features: { ...draft.features },
      }
    ));
    setEditingId(null);
    pushToast(`"${draft.name || 'Plan'}" saved successfully`, 'success');
  }, [pushToast]);

  const handleDelete = useCallback((plan: Plan) => {
    setDeleteTarget(plan);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setPlans(prev => prev.filter(p => p.id !== deleteTarget.id));
    pushToast(`"${deleteTarget.name}" plan deleted`, 'danger');
    setDeleteTarget(null);
  }, [deleteTarget, pushToast]);

  const handleCreate = useCallback((draft: EditDraft) => {
    const newPlan: Plan = {
      id: `pl-${Date.now()}`,
      name: draft.name,
      priceMonthly: Math.max(0, Number(draft.priceMonthly) || 0),
      priceAnnual: Math.max(0, Number(draft.priceAnnual) || 0),
      mailboxLimit: Math.max(1, Number(draft.mailboxLimit) || 1),
      dailySendTarget: Math.max(1, Number(draft.dailySendTarget) || 1),
      features: { ...draft.features },
      subscribers: 0,
      mrrContribution: 0,
      isPopular: false,
      color: T.warning,
      tier: 2,
    };
    setPlans(prev => [...prev, newPlan]);
    setShowNewModal(false);
    pushToast(`"${newPlan.name}" plan created`, 'success');
  }, [pushToast]);

  // ── Guard against stale editing state ────────────────────────────────────────
  useEffect(() => {
    if (editingId && !plans.find(p => p.id === editingId)) {
      setEditingId(null);
    }
  }, [plans, editingId]);

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 28px 40px',
        maxWidth: 1280,
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        position: 'relative',
      }}
    >
      {/* ── Background aurora ───────────────────────────────────────────────── */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '10%',
          left: '60%',
          width: 600,
          height: 600,
          background: `radial-gradient(ellipse, ${T.accentDim} 0%, transparent 68%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: '50%',
          left: '-5%',
          width: 500,
          height: 500,
          background: `radial-gradient(ellipse, rgba(61,220,151,0.06) 0%, transparent 70%)`,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                  boxShadow: `0 0 10px ${T.accentGlow}`,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: T.faint, textTransform: 'uppercase' }}>
                Plans & Pricing Studio
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: T.text, margin: 0, lineHeight: 1.15 }}>
              Subscription Plans
            </h1>
            <p style={{ fontSize: 14, color: T.dim, margin: '6px 0 0', lineHeight: 1.5 }}>
              Manage pricing tiers, limits, features, and adoption metrics.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Billing toggle */}
            <div
              style={{
                ...T.glass,
                display: 'flex',
                borderRadius: 10,
                padding: 3,
                gap: 2,
              }}
            >
              {(['monthly', 'annual'] as BillingPeriod[]).map(b => (
                <motion.button
                  key={b}
                  onClick={() => setBilling(b)}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: billing === b
                      ? `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`
                      : 'transparent',
                    color: billing === b ? '#fff' : T.faint,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {b === 'monthly' ? 'Monthly' : 'Annual'}
                  {b === 'annual' && (
                    <span style={{ marginLeft: 5, fontSize: 10, color: billing === 'annual' ? 'rgba(255,255,255,0.8)' : T.success }}>
                      −20%
                    </span>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Create plan button */}
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: `0 0 20px ${T.accentGlow}` }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowNewModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 18px',
                borderRadius: 10,
                border: `1px solid ${T.accent}50`,
                background: `linear-gradient(90deg, ${T.accent}22, ${T.accentLight}18)`,
                color: T.accentLight,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              New Plan
            </motion.button>
          </div>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
            marginBottom: 32,
          }}
        >
          <KpiCard label="Total MRR" display={mrrDisplay} icon={DollarSign} sub="across all paid plans" accent={T.success} />
          <KpiCard label="Subscribers" display={subsDisplay} icon={Users} sub="total plan holders" accent={T.accent} />
          <KpiCard label="Active Plans" display={plansDisplay} icon={Layers} sub="configured tiers" accent={T.accentLight} />
          <KpiCard label="ARPU" display={arpuDisplay} icon={CreditCard} sub="avg revenue per user" accent={T.warning} />
        </div>

        {/* ── Summary bar ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            ...T.glass,
            padding: '14px 20px',
            marginBottom: 24,
            display: 'flex',
            gap: 0,
            alignItems: 'center',
            flexWrap: 'wrap',
            overflow: 'hidden',
          }}
        >
          {plans.map((plan, i) => {
            const pct = totalSubs > 0 ? (plan.subscribers / totalSubs) * 100 : 0;
            const isLast = i === plans.length - 1;
            return (
              <div
                key={plan.id}
                style={{
                  flex: '1 1 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '0 16px',
                  borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  minWidth: 100,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: plan.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: '0.07em' }}>
                    {plan.name}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 + i * 0.08 }}
                    style={{ height: '100%', background: plan.color, borderRadius: 2 }}
                  />
                </div>
                <div style={{ fontSize: 12, color: T.dim, fontWeight: 600 }}>
                  {plan.subscribers} subs · {pct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* ── Plan cards grid ──────────────────────────────────────────────────── */}
        <motion.div
          layout
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 18,
          }}
        >
          <AnimatePresence mode="popLayout">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                billing={billing}
                isEditing={editingId === plan.id}
                editDraft={editDrafts[plan.id] ?? null}
                setEditDraft={(d) => setEditDrafts(prev => ({ ...prev, [plan.id]: d }))}
                onEdit={() => handleEdit(plan)}
                onSave={(draft) => handleSave(plan.id, draft)}
                onDelete={() => handleDelete(plan)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* ── Empty state ──────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {plans.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              style={{
                textAlign: 'center',
                padding: '60px 0',
                color: T.faint,
              }}
            >
              <Layers size={40} color={T.faint} style={{ marginBottom: 14 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: T.dim, marginBottom: 6 }}>No plans configured</div>
              <div style={{ fontSize: 14 }}>Create your first subscription tier to get started.</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Legend / table view ──────────────────────────────────────────────── */}
        {plans.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={{ marginTop: 32 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: T.faint, textTransform: 'uppercase', marginBottom: 14 }}>
              Plan Comparison Table
            </div>
            <div
              style={{
                ...T.glass,
                overflow: 'hidden',
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr repeat(6, 1fr)',
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  gap: 8,
                }}
              >
                {['Plan', 'Monthly', 'Annual', 'Mailboxes', 'Daily Sends', 'Subscribers', 'MRR'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.faint, textTransform: 'uppercase' }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Table rows */}
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.05 }}
                  whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr repeat(6, 1fr)',
                    padding: '13px 20px',
                    borderBottom: i < plans.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    gap: 8,
                    alignItems: 'center',
                    cursor: 'default',
                    transition: 'background 0.18s',
                  }}
                >
                  {/* Plan name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: plan.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{plan.name}</span>
                    {plan.isPopular && (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: '0.10em',
                          color: T.accent,
                          background: T.accentDim,
                          borderRadius: 4,
                          padding: '1px 5px',
                          textTransform: 'uppercase',
                        }}
                      >
                        Popular
                      </div>
                    )}
                  </div>

                  {/* Monthly */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.dim }}>
                    {plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}`}
                  </div>

                  {/* Annual */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: plan.priceAnnual > 0 ? T.success : T.faint }}>
                    {plan.priceAnnual === 0 ? '—' : `$${plan.priceAnnual}`}
                  </div>

                  {/* Mailboxes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Inbox size={12} color={T.faint} />
                    <span style={{ fontSize: 13, color: T.dim, fontWeight: 600 }}>
                      {plan.mailboxLimit >= 100 ? '100+' : plan.mailboxLimit}
                    </span>
                  </div>

                  {/* Daily sends */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={12} color={T.faint} />
                    <span style={{ fontSize: 13, color: T.dim, fontWeight: 600 }}>
                      {plan.dailySendTarget >= 1000
                        ? `${(plan.dailySendTarget / 1000).toFixed(1)}k`
                        : plan.dailySendTarget}
                    </span>
                  </div>

                  {/* Subscribers */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.dim }}>
                    {plan.subscribers.toLocaleString()}
                  </div>

                  {/* MRR */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: plan.mrrContribution > 0 ? T.success : T.faint,
                      }}
                    >
                      {plan.mrrContribution > 0
                        ? `$${plan.mrrContribution >= 1000
                          ? `${(plan.mrrContribution / 1000).toFixed(1)}k`
                          : plan.mrrContribution}`
                        : '—'}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleEdit(plan)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.10)',
                        background: 'rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: T.faint,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <ChevronRight size={11} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Toast stack ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 200,
        }}
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              variants={toastVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 12,
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                background:
                  toast.type === 'success'
                    ? 'rgba(61,220,151,0.14)'
                    : toast.type === 'danger'
                    ? 'rgba(255,92,122,0.14)'
                    : 'rgba(255,138,75,0.14)',
                border: `1px solid ${
                  toast.type === 'success'
                    ? 'rgba(61,220,151,0.30)'
                    : toast.type === 'danger'
                    ? 'rgba(255,92,122,0.30)'
                    : 'rgba(255,138,75,0.30)'
                }`,
                minWidth: 220,
                maxWidth: 320,
                boxShadow: '0 4px 20px rgba(0,0,0,0.32)',
              }}
            >
              {toast.type === 'success' && <CheckCircle2 size={15} color={T.success} />}
              {toast.type === 'danger' && <AlertTriangle size={15} color={T.danger} />}
              {toast.type === 'warning' && <AlertTriangle size={15} color={T.warning} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>
                {toast.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Delete confirm modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            plan={deleteTarget}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── New plan modal ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNewModal && (
          <NewPlanModal
            onSave={handleCreate}
            onCancel={() => setShowNewModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
