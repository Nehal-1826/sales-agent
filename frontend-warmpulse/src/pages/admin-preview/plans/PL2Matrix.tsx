/**
 * Admin Plans & Pricing Design Candidate: PL2 Comparison Matrix
 *
 * "Comparison Matrix" — plans as columns x features/limits as rows.
 * Full CRUD: inline cell editing (price, limits, feature toggles), create a
 * plan column (animates in via AnimatePresence + layout), delete with confirm +
 * exit animation, mark-as-recommended, hover column lift with spring physics,
 * animated KPI counters, staggered entrance.
 *
 * Framer-motion techniques: staggerChildren container variants, layout animation,
 * AnimatePresence for add/remove columns, whileHover/whileTap, spring physics on
 * column lift, animated counters via useMotionValue + animate, cleanup on unmount.
 *
 * Self-contained: inline style={{}} only, mock data only, no API / react-query /
 * @/features / @/lib/api imports. Aurora Glass dark palette, warm orange only.
 * No CSS file import. No Tailwind.
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Check,
  X,
  Plus,
  Trash2,
  Star,
  Edit2,
  DollarSign,
  Users,
  TrendingUp,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  MoreHorizontal,
  Sparkles,
  Copy,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text: '#ffffff' as const,
  dim: 'rgba(255,255,255,0.62)' as const,
  faint: 'rgba(255,255,255,0.40)' as const,
  ghost: 'rgba(255,255,255,0.22)' as const,
  hairline: 'rgba(255,255,255,0.08)' as const,
  accent: '#F26522' as const,
  accentLight: '#FF8A4B' as const,
  accentDim: 'rgba(242,101,34,0.18)' as const,
  accentGlow: 'rgba(242,101,34,0.40)' as const,
  success: '#3ddc97' as const,
  successDim: 'rgba(61,220,151,0.14)' as const,
  danger: '#ff5c7a' as const,
  dangerDim: 'rgba(255,92,122,0.13)' as const,
  warning: '#FF8A4B' as const,
  glass: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 16,
  } as CSSProperties,
  glassTight: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 10,
  } as CSSProperties,
  glassDeep: {
    background: 'rgba(255,255,255,0.075)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: 22,
  } as CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type BillingCycle = 'monthly' | 'annual';
type SupportTier = 'Community' | 'Email' | 'Priority' | 'Dedicated' | 'White-glove';

interface Plan {
  id: string;
  name: string;
  price: number;           // USD/month (monthly)
  annualPrice: number;     // USD/month billed annually
  billing: BillingCycle;
  mailboxLimit: number;    // 0 = unlimited
  dailySendTarget: number; // per mailbox
  crmAccess: boolean;
  sequences: boolean;
  reports: boolean;
  support: SupportTier;
  subscribers: number;
  isRecommended: boolean;
}

// ─── Row definitions (feature rows) ──────────────────────────────────────────
interface RowDef {
  id: string;
  label: string;
  sublabel?: string;
  kind: 'price' | 'billing' | 'number' | 'boolean' | 'support' | 'subscribers' | 'mrr';
  field: keyof Plan;
}

const ROWS: RowDef[] = [
  { id: 'price',        label: 'Monthly Price',       sublabel: 'USD / workspace',    kind: 'price',       field: 'price' },
  { id: 'annualPrice',  label: 'Annual Price',         sublabel: 'USD / mo billed yearly', kind: 'price',  field: 'annualPrice' },
  { id: 'mailboxLimit', label: 'Mailbox Limit',        sublabel: 'connected mailboxes', kind: 'number',    field: 'mailboxLimit' },
  { id: 'dailySend',    label: 'Daily Send Target',    sublabel: 'per mailbox',         kind: 'number',    field: 'dailySendTarget' },
  { id: 'crm',          label: 'CRM Access',                                            kind: 'boolean',   field: 'crmAccess' },
  { id: 'sequences',    label: 'Sequences',            sublabel: 'email automation',    kind: 'boolean',   field: 'sequences' },
  { id: 'reports',      label: 'Reports',              sublabel: 'CSV / PDF export',    kind: 'boolean',   field: 'reports' },
  { id: 'support',      label: 'Support Tier',                                          kind: 'support',   field: 'support' },
  { id: 'subscribers',  label: 'Active Subscribers',  sublabel: 'live count',          kind: 'subscribers', field: 'subscribers' },
  { id: 'mrr',          label: 'MRR Contribution',    sublabel: 'this plan',           kind: 'mrr',       field: 'subscribers' },
];

const SUPPORT_TIERS: SupportTier[] = ['Community', 'Email', 'Priority', 'Dedicated', 'White-glove'];

// ─── Mock data ────────────────────────────────────────────────────────────────
const INITIAL_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    annualPrice: 0,
    billing: 'monthly',
    mailboxLimit: 1,
    dailySendTarget: 5,
    crmAccess: false,
    sequences: false,
    reports: false,
    support: 'Community',
    subscribers: 214,
    isRecommended: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    annualPrice: 23,
    billing: 'monthly',
    mailboxLimit: 3,
    dailySendTarget: 20,
    crmAccess: false,
    sequences: false,
    reports: false,
    support: 'Email',
    subscribers: 487,
    isRecommended: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    annualPrice: 63,
    billing: 'monthly',
    mailboxLimit: 10,
    dailySendTarget: 50,
    crmAccess: true,
    sequences: false,
    reports: true,
    support: 'Priority',
    subscribers: 631,
    isRecommended: true,
  },
  {
    id: 'proplus',
    name: 'Pro Plus',
    price: 149,
    annualPrice: 119,
    billing: 'monthly',
    mailboxLimit: 25,
    dailySendTarget: 100,
    crmAccess: true,
    sequences: true,
    reports: true,
    support: 'Dedicated',
    subscribers: 318,
    isRecommended: false,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 349,
    annualPrice: 279,
    billing: 'monthly',
    mailboxLimit: 0,
    dailySendTarget: 200,
    crmAccess: true,
    sequences: true,
    reports: true,
    support: 'White-glove',
    subscribers: 94,
    isRecommended: false,
  },
];

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimCounter(target: number, duration = 1.1, prefix = ''): string {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
    });
    const unsub = mv.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      ctrl.stop();
      unsub();
    };
  }, [target, duration, mv]);

  if (prefix === '$') return `$${display.toLocaleString()}`;
  return display.toLocaleString();
}

// ─── Framer-motion variants ───────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.08 },
  },
};

const columnVariants: Variants = {
  hidden: { opacity: 0, y: 40, scaleY: 0.88, originY: 0 },
  visible: {
    opacity: 1,
    y: 0,
    scaleY: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
  exit: {
    opacity: 0,
    scaleY: 0.85,
    y: -20,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -18 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 24 },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function planMRR(plan: Plan): number {
  return plan.subscribers * (plan.billing === 'annual' ? plan.annualPrice : plan.price);
}

function totalMRR(plans: Plan[]): number {
  return plans.reduce((acc, p) => acc + planMRR(p), 0);
}

function totalSubscribers(plans: Plan[]): number {
  return plans.reduce((acc, p) => acc + p.subscribers, 0);
}

function supportColor(tier: SupportTier): string {
  const map: Record<SupportTier, string> = {
    Community: 'rgba(255,255,255,0.45)',
    Email: '#FF8A4B',
    Priority: '#FF8A4B',
    Dedicated: '#F26522',
    'White-glove': '#3ddc97',
  };
  return map[tier];
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  isMoney,
  icon: Icon,
  color,
  delay,
}: {
  label: string;
  value: number;
  isMoney?: boolean;
  icon: typeof DollarSign;
  color: string;
  delay: number;
}) {
  const display = useAnimCounter(value, 1.2, isMoney ? '$' : '');
  return (
    <motion.div
      variants={kpiVariants}
      transition={{ delay }}
      style={{
        ...T.glass,
        padding: '16px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flex: 1,
        minWidth: 150,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: `${color}1a`,
          border: `1px solid ${color}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {display}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.faint, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      style={{
        position: 'fixed',
        bottom: 30,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'rgba(61,220,151,0.18)',
        border: '1px solid rgba(61,220,151,0.35)',
        borderRadius: 12,
        padding: '12px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#3ddc97',
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <CheckCircle2 size={16} />
      {msg}
    </motion.div>
  );
}

// ─── Inline editable number cell ──────────────────────────────────────────────
function EditableNumber({
  value,
  onChange,
  prefix,
  suffix,
  highlight,
  isZeroUnlimited,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  highlight?: boolean;
  isZeroUnlimited?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 0) onChange(n);
    else setDraft(String(value));
    setEditing(false);
  }, [draft, onChange, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const displayVal = isZeroUnlimited && value === 0 ? 'Unlimited' : `${prefix ?? ''}${value.toLocaleString()}${suffix ?? ''}`;
  const displayColor = isZeroUnlimited && value === 0 ? T.accentLight : highlight ? T.text : T.dim;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={0}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
        }}
        style={{
          width: '100%',
          background: 'rgba(242,101,34,0.12)',
          border: '1px solid rgba(242,101,34,0.50)',
          borderRadius: 8,
          color: T.accent,
          fontSize: 14,
          fontWeight: 700,
          padding: '4px 8px',
          outline: 'none',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: displayColor,
        fontSize: 14,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        borderRadius: 6,
        transition: 'background 0.15s',
        fontVariantNumeric: 'tabular-nums',
        width: '100%',
        justifyContent: 'center',
      }}
      title="Click to edit"
    >
      {displayVal}
      <Edit2 size={10} style={{ color: T.ghost, flexShrink: 0, opacity: 0.7 }} />
    </motion.button>
  );
}

// ─── Editable text cell (plan name) ──────────────────────────────────────────
function EditableText({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    else setDraft(value);
    setEditing(false);
  }, [draft, onChange, value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={20}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        style={{
          background: 'rgba(242,101,34,0.10)',
          border: '1px solid rgba(242,101,34,0.40)',
          borderRadius: 8,
          color: T.accent,
          fontSize: 15,
          fontWeight: 800,
          padding: '4px 10px',
          outline: 'none',
          textAlign: 'center',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => { setDraft(value); setEditing(true); }}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: T.text,
        fontSize: 15,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        justifyContent: 'center',
        padding: '4px 8px',
        borderRadius: 6,
        width: '100%',
      }}
      title="Click to rename"
    >
      {value}
      <Edit2 size={10} style={{ color: T.ghost, opacity: 0.6 }} />
    </motion.button>
  );
}

// ─── Support tier selector ────────────────────────────────────────────────────
function SupportCell({
  value,
  onChange,
}: {
  value: SupportTier;
  onChange: (v: SupportTier) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = supportColor(value);

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: `${color}14`,
          border: `1px solid ${color}40`,
          borderRadius: 8,
          color,
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
        <ChevronDown size={10} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            style={{
              position: 'absolute',
              top: '110%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 200,
              background: 'rgba(16,10,6,0.96)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 10,
              minWidth: 140,
              padding: '4px 0',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            {SUPPORT_TIERS.map((tier) => (
              <button
                key={tier}
                onClick={() => { onChange(tier); setOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: tier === value ? 'rgba(242,101,34,0.10)' : 'transparent',
                  border: 'none',
                  color: tier === value ? T.accent : T.dim,
                  fontSize: 12,
                  fontWeight: tier === value ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {tier}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Feature toggle cell ──────────────────────────────────────────────────────
function FeatureCell({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.10 }}
      whileTap={{ scale: 0.88 }}
      onClick={() => onChange(!value)}
      style={{
        background: value ? T.successDim : T.dangerDim,
        border: `1px solid ${value ? 'rgba(61,220,151,0.30)' : 'rgba(255,92,122,0.25)'}`,
        borderRadius: 8,
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
      title={value ? 'Click to disable' : 'Click to enable'}
    >
      <motion.div
        key={String(value)}
        initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        {value
          ? <Check size={16} color={T.success} />
          : <X size={16} color={T.danger} />
        }
      </motion.div>
    </motion.button>
  );
}

// ─── Animated MRR cell ────────────────────────────────────────────────────────
function MrrCell({ plan }: { plan: Plan }) {
  const mrr = planMRR(plan);
  const display = useAnimCounter(mrr, 1.0, '$');
  return (
    <span style={{ fontSize: 14, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
}

// ─── Subscriber animated cell ─────────────────────────────────────────────────
function SubsCell({ value }: { value: number }) {
  const display = useAnimCounter(value, 1.0);
  return (
    <span style={{ fontSize: 14, fontWeight: 700, color: T.dim, fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
}

// ─── Delete confirm overlay ───────────────────────────────────────────────────
function DeleteConfirm({
  planName,
  onConfirm,
  onCancel,
}: {
  planName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      <>
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onCancel}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            background: 'rgba(8,5,3,0.72)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
          }}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.90, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.90, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 910,
            ...T.glassDeep,
            padding: '32px 36px',
            textAlign: 'center',
            minWidth: 320,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: T.dangerDim,
              border: `1px solid rgba(255,92,122,0.35)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <Trash2 size={22} color={T.danger} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            Delete "{planName}"?
          </div>
          <div style={{ fontSize: 13, color: T.faint, marginBottom: 24, lineHeight: 1.5 }}>
            This removes the plan from the matrix.<br />Existing subscribers remain unaffected.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onCancel}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: T.dim,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, boxShadow: `0 0 24px rgba(255,92,122,0.35)` }}
              whileTap={{ scale: 0.96 }}
              onClick={onConfirm}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                background: T.dangerDim,
                border: `1px solid rgba(255,92,122,0.40)`,
                color: T.danger,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Delete Plan
            </motion.button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

// ─── Row label column ─────────────────────────────────────────────────────────
const ROW_COL_W = 210;
const PLAN_COL_W = 170;
const CELL_H = 62;
const HEADER_H = 160;

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmPlanPL2Matrix() {
  const [plans, setPlans] = useState<Plan[]>(INITIAL_PLANS);
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cleanup
  useEffect(() => {
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // KPI totals
  const mrr = totalMRR(plans);
  const subs = totalSubscribers(plans);
  const planCount = plans.length;

  // Update a field on a plan
  const updatePlan = useCallback(<K extends keyof Plan>(id: string, field: K, value: Plan[K]) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
    showToast('Plan updated');
  }, [showToast]);

  // Toggle recommended
  const toggleRecommended = useCallback((id: string) => {
    setPlans((prev) =>
      prev.map((p) => ({ ...p, isRecommended: p.id === id ? !p.isRecommended : false }))
    );
    showToast('Recommended plan updated');
  }, [showToast]);

  // Add plan
  const addPlan = useCallback(() => {
    const id = `plan_${Date.now()}`;
    const newPlan: Plan = {
      id,
      name: 'New Plan',
      price: 0,
      annualPrice: 0,
      billing: 'monthly',
      mailboxLimit: 5,
      dailySendTarget: 30,
      crmAccess: false,
      sequences: false,
      reports: false,
      support: 'Email',
      subscribers: 0,
      isRecommended: false,
    };
    setPlans((prev) => [...prev, newPlan]);
    showToast('New plan added');
  }, [showToast]);

  // Duplicate plan
  const duplicatePlan = useCallback((id: string) => {
    const source = plans.find((p) => p.id === id);
    if (!source) return;
    const newPlan: Plan = {
      ...source,
      id: `plan_${Date.now()}`,
      name: `${source.name} Copy`,
      subscribers: 0,
      isRecommended: false,
    };
    setPlans((prev) => [...prev, newPlan]);
    showToast(`"${source.name}" duplicated`);
  }, [plans, showToast]);

  // Delete plan
  const confirmDelete = useCallback((id: string) => {
    setDeleteTarget(id);
  }, []);

  const executeDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = plans.find((p) => p.id === deleteTarget);
    setPlans((prev) => prev.filter((p) => p.id !== deleteTarget));
    setDeleteTarget(null);
    showToast(`"${target?.name ?? 'Plan'}" deleted`);
  }, [deleteTarget, plans, showToast]);

  // Render a single cell value
  function renderCell(plan: Plan, row: RowDef): ReactNode {
    const isHovered = hoveredPlan === plan.id;

    switch (row.kind) {
      case 'price':
        return (
          <EditableNumber
            value={row.field === 'price' ? plan.price : plan.annualPrice}
            onChange={(v) => updatePlan(plan.id, row.field as 'price' | 'annualPrice', v)}
            prefix="$"
            suffix="/mo"
            highlight={isHovered}
          />
        );
      case 'number':
        return (
          <EditableNumber
            value={row.field === 'mailboxLimit' ? plan.mailboxLimit : plan.dailySendTarget}
            onChange={(v) => updatePlan(plan.id, row.field as 'mailboxLimit' | 'dailySendTarget', v)}
            highlight={isHovered}
            isZeroUnlimited={row.field === 'mailboxLimit'}
          />
        );
      case 'boolean': {
        const boolField = row.field as 'crmAccess' | 'sequences' | 'reports';
        return (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <FeatureCell
              value={plan[boolField]}
              onChange={(v) => updatePlan(plan.id, boolField, v)}
            />
          </div>
        );
      }
      case 'support':
        return (
          <SupportCell
            value={plan.support}
            onChange={(v) => updatePlan(plan.id, 'support', v)}
          />
        );
      case 'subscribers':
        return <SubsCell value={plan.subscribers} />;
      case 'mrr':
        return <MrrCell plan={plan} />;
      default:
        return null;
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 28px 80px',
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
        color: T.text,
        position: 'relative',
      }}
    >
      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: T.accentDim,
              border: `1px solid rgba(242,101,34,0.40)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={22} color={T.accent} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.text }}>Plans & Pricing</h1>
            <p style={{ fontSize: 12, color: T.faint, margin: 0, marginTop: 2 }}>
              Comparison matrix — click any cell to edit inline
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.04, boxShadow: `0 0 28px ${T.accentGlow}` }}
          whileTap={{ scale: 0.96 }}
          onClick={addPlan}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 12,
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: `0 4px 18px rgba(242,101,34,0.30)`,
          }}
        >
          <Plus size={16} />
          Add Plan
        </motion.button>
      </motion.div>

      {/* ── KPI strip ── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}
      >
        <KpiCard label="Total MRR" value={mrr} isMoney icon={DollarSign} color={T.accent} delay={0} />
        <KpiCard label="Subscribers" value={subs} icon={Users} color={T.success} delay={0.07} />
        <KpiCard label="Active Plans" value={planCount} icon={Layers} color={T.accentLight} delay={0.14} />
        <KpiCard label="Avg MRR / Plan" value={planCount > 0 ? Math.round(mrr / planCount) : 0} isMoney icon={TrendingUp} color={T.warning} delay={0.21} />
      </motion.div>

      {/* ── Comparison Matrix ── */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <div
          style={{
            minWidth: ROW_COL_W + PLAN_COL_W * plans.length + 80,
            position: 'relative',
          }}
        >
          {/* ── Matrix table ── */}
          <div style={{ display: 'flex' }}>
            {/* Row label column */}
            <div style={{ width: ROW_COL_W, flexShrink: 0 }}>
              {/* Header spacer */}
              <div style={{ height: HEADER_H }} />

              {/* Row labels */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={containerVariants}
              >
                {ROWS.map((row, i) => (
                  <motion.div
                    key={row.id}
                    variants={rowVariants}
                    style={{
                      height: CELL_H,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      padding: '0 16px 0 2px',
                      borderBottom: `1px solid ${T.hairline}`,
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.dim }}>
                      {row.label}
                    </div>
                    {row.sublabel && (
                      <div style={{ fontSize: 10, color: T.ghost, marginTop: 2 }}>
                        {row.sublabel}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Plan columns */}
            <div style={{ display: 'flex', flex: 1 }}>
              <AnimatePresence mode="popLayout">
                {plans.map((plan) => {
                  const isHovered = hoveredPlan === plan.id;
                  const isRecommended = plan.isRecommended;
                  const isDimmed = hoveredPlan !== null && !isHovered;

                  return (
                    <motion.div
                      key={plan.id}
                      layout
                      variants={columnVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      style={{
                        width: PLAN_COL_W,
                        flexShrink: 0,
                        position: 'relative',
                      }}
                    >
                      {/* Column wrapper with hover lift */}
                      <motion.div
                        onHoverStart={() => setHoveredPlan(plan.id)}
                        onHoverEnd={() => setHoveredPlan(null)}
                        animate={{
                          opacity: isDimmed ? 0.45 : 1,
                          y: isHovered ? -6 : 0,
                          scale: isHovered ? 1.012 : 1,
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        style={{
                          position: 'relative',
                        }}
                      >
                        {/* Recommended glow line */}
                        {isRecommended && (
                          <motion.div
                            layoutId={`rec-line-${plan.id}`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 8,
                              right: 8,
                              height: 3,
                              background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                              borderRadius: 3,
                              boxShadow: `0 0 12px ${T.accentGlow}`,
                              zIndex: 5,
                            }}
                          />
                        )}

                        {/* Column highlight background */}
                        <motion.div
                          animate={{
                            opacity: isHovered ? 1 : isRecommended ? 0.6 : 0,
                          }}
                          transition={{ duration: 0.2 }}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: isRecommended
                              ? `linear-gradient(180deg, rgba(242,101,34,0.10) 0%, rgba(242,101,34,0.04) 100%)`
                              : `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)`,
                            border: isHovered || isRecommended
                              ? `1px solid ${isRecommended ? 'rgba(242,101,34,0.30)' : 'rgba(255,255,255,0.14)'}`
                              : '1px solid transparent',
                            borderRadius: 14,
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }}
                        />

                        {/* ── Column header ── */}
                        <div
                          style={{
                            height: HEADER_H,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '14px 12px 10px',
                            position: 'relative',
                            zIndex: 2,
                          }}
                        >
                          {/* Recommended badge */}
                          <AnimatePresence>
                            {isRecommended && (
                              <motion.div
                                initial={{ opacity: 0, y: -8, scale: 0.88 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.88 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                                style={{
                                  position: 'absolute',
                                  top: 10,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                                  borderRadius: 20,
                                  padding: '2px 9px',
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: '#fff',
                                  letterSpacing: '0.08em',
                                  textTransform: 'uppercase',
                                  whiteSpace: 'nowrap',
                                  boxShadow: `0 2px 12px rgba(242,101,34,0.45)`,
                                }}
                              >
                                <Sparkles size={8} />
                                Popular
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Plan name */}
                          <div style={{ width: '100%', marginTop: isRecommended ? 20 : 0 }}>
                            <EditableText
                              value={plan.name}
                              onChange={(v) => updatePlan(plan.id, 'name', v)}
                            />
                          </div>

                          {/* Price display */}
                          <motion.div
                            layout
                            style={{ marginTop: 4, textAlign: 'center' }}
                          >
                            <span style={{ fontSize: 24, fontWeight: 900, color: isRecommended ? T.accent : T.text, fontVariantNumeric: 'tabular-nums' }}>
                              {plan.price === 0 ? 'Free' : `$${plan.price}`}
                            </span>
                            {plan.price > 0 && (
                              <span style={{ fontSize: 11, color: T.faint, marginLeft: 3 }}>/mo</span>
                            )}
                          </motion.div>

                          {/* Action icons */}
                          <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                            {/* Star / recommend */}
                            <motion.button
                              whileHover={{ scale: 1.14 }}
                              whileTap={{ scale: 0.88 }}
                              onClick={() => toggleRecommended(plan.id)}
                              title={isRecommended ? 'Remove recommended' : 'Mark recommended'}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: isRecommended ? T.accentDim : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${isRecommended ? 'rgba(242,101,34,0.40)' : 'rgba(255,255,255,0.10)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Star size={13} color={isRecommended ? T.accent : T.ghost} fill={isRecommended ? T.accent : 'none'} />
                            </motion.button>

                            {/* Duplicate */}
                            <motion.button
                              whileHover={{ scale: 1.14 }}
                              whileTap={{ scale: 0.88 }}
                              onClick={() => duplicatePlan(plan.id)}
                              title="Duplicate plan"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Copy size={12} color={T.ghost} />
                            </motion.button>

                            {/* Delete */}
                            <motion.button
                              whileHover={{ scale: 1.14, background: T.dangerDim }}
                              whileTap={{ scale: 0.88 }}
                              onClick={() => confirmDelete(plan.id)}
                              title="Delete plan"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={12} color={T.ghost} />
                            </motion.button>
                          </div>
                        </div>

                        {/* ── Data cells ── */}
                        {ROWS.map((row, i) => (
                          <div
                            key={row.id}
                            style={{
                              height: CELL_H,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0 12px',
                              borderBottom: `1px solid ${T.hairline}`,
                              background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                              position: 'relative',
                              zIndex: 2,
                            }}
                          >
                            <motion.div
                              layout
                              style={{ width: '100%', textAlign: 'center' }}
                            >
                              {renderCell(plan, row)}
                            </motion.div>
                          </div>
                        ))}
                      </motion.div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Add plan ghost column */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  width: 60,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingTop: HEADER_H / 2,
                }}
              >
                <motion.button
                  whileHover={{ scale: 1.12, background: T.accentDim }}
                  whileTap={{ scale: 0.94 }}
                  onClick={addPlan}
                  title="Add new plan"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px dashed rgba(255,255,255,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={18} color={T.faint} />
                </motion.button>
              </motion.div>
            </div>
          </div>

          {/* ── Legend / Divider ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, type: 'spring', stiffness: 220, damping: 24 }}
            style={{
              marginTop: 24,
              ...T.glass,
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.faint }}>
              <AlertCircle size={13} color={T.warning} />
              Hover a column to highlight it · Click any cell to edit inline · Click feature icons to toggle
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: T.successDim, border: '1px solid rgba(61,220,151,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={9} color={T.success} />
                </div>
                <span style={{ fontSize: 11, color: T.faint }}>Enabled</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: T.dangerDim, border: '1px solid rgba(255,92,122,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={9} color={T.danger} />
                </div>
                <span style={{ fontSize: 11, color: T.faint }}>Disabled</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={11} color={T.accent} fill={T.accent} />
                <span style={{ fontSize: 11, color: T.faint }}>Recommended</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirm
            key="delete-confirm"
            planName={plans.find((p) => p.id === deleteTarget)?.name ?? 'Plan'}
            onConfirm={executeDelete}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <Toast key={toast} msg={toast} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>

      {/* ── Hint FAB ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{
          position: 'fixed',
          bottom: 22,
          right: 24,
          ...T.glassTight,
          padding: '8px 14px',
          fontSize: 12,
          color: T.ghost,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <MoreHorizontal size={14} />
        Scroll right for more plans
      </motion.div>
    </div>
  );
}
