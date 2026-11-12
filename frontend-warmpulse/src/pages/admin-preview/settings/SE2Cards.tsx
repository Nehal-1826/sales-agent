/**
 * Admin Settings Design Candidate: SE2 Settings Cards Grid
 *
 * "Settings Cards Grid" — platform configuration grouped into a responsive
 * glass-card grid with inline expansion to edit. Covers General, Warmup Engine,
 * Integrations, Security, Alerts, Feature Flags, and Region & Format (India ₹
 * DD/MM/YYYY ↔ International). Each card expands in place with AnimatePresence
 * height, springs on save, and shows a persistent save bar for pending changes.
 *
 * Framer-motion: staggered grid entrance, whileHover lift + glow, AnimatePresence
 * height expansion, spring toggles, animated save bar slide-in, card state
 * transitions.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Only @/lib/format is imported from @/.
 * Aurora Glass dark palette — warm amber/orange only, no purple/blue/teal/cyan.
 */

import {
  useState,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  motion,
  AnimatePresence,
  type Variants,
} from 'framer-motion';
import {
  Settings,
  Flame,
  Plug,
  Shield,
  Bell,
  ToggleLeft,
  Globe,
  ChevronDown,
  Save,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  Mail,
  Key,
  Clock,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import type { Region } from '@/stores/locale';

// ─── Fixed sample timestamp (never new Date() at module scope) ──────────────
const SAMPLE_TS = '2026-05-31T14:30:00+05:30';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  text:         '#ffffff' as const,
  dim:          'rgba(255,255,255,0.62)' as const,
  faint:        'rgba(255,255,255,0.38)' as const,
  ghost:        'rgba(255,255,255,0.18)' as const,
  hairline:     'rgba(255,255,255,0.08)' as const,
  accent:       '#F26522' as const,
  accentLight:  '#FF8A4B' as const,
  accentDim:    'rgba(242,101,34,0.18)' as const,
  success:      '#3ddc97' as const,
  successDim:   'rgba(61,220,151,0.14)' as const,
  danger:       '#ff5c7a' as const,
  dangerDim:    'rgba(255,92,122,0.14)' as const,
  warning:      '#FF8A4B' as const,
  warningDim:   'rgba(255,138,75,0.14)' as const,
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius:         16,
  } as CSSProperties,
  glassCard: {
    background:           'rgba(255,255,255,0.055)',
    border:               '1px solid rgba(255,255,255,0.11)',
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius:         18,
  } as CSSProperties,
};

// ─── Micro-label style ────────────────────────────────────────────────────────
const MICRO: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
};

// ─── Framer Variants ──────────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.08 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

const expandVariants: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.28, ease: [0.4, 0, 1, 1] },
  },
};

const saveBarVariants: Variants = {
  hidden: { y: 80, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 420, damping: 34 },
  },
  exit: {
    y: 80,
    opacity: 0,
    transition: { duration: 0.22 },
  },
};

// ─── Toast ────────────────────────────────────────────────────────────────────
interface ToastData { id: number; msg: string; ok: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Row({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label style={{ fontSize: 11, color: T.dim, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  mono,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '9px 13px',
        fontSize: mono ? 12 : 13,
        color: T.text,
        fontFamily: mono ? 'monospace' : 'inherit',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step ?? 1}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '9px 13px',
        fontSize: 13,
        color: T.text,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    />
  );
}

function Toggle({
  on,
  onChange,
  accent,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const col = accent ?? T.accent;
  return (
    <motion.button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: on ? col : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.22s',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}
      />
    </motion.button>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '9px 13px',
        fontSize: 13,
        color: T.text,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        appearance: 'none',
      }}
    >
      {options.map((o) => (
        <option key={o} value={o} style={{ background: '#1a1a28' }}>{o}</option>
      ))}
    </select>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
interface CardProps {
  id: string;
  icon: typeof Settings;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  dirty: boolean;
  children: ReactNode;
  accent?: string;
  tag?: ReactNode;
}

function SettingsCard({
  icon: Icon,
  title,
  summary,
  expanded,
  onToggle,
  onSave,
  dirty,
  children,
  accent,
  tag,
}: CardProps) {
  const col = accent ?? T.accent;

  return (
    <motion.div
      variants={cardVariants}
      whileHover={expanded ? {} : { y: -3, boxShadow: `0 8px 32px rgba(0,0,0,0.28), 0 0 0 1px ${col}44` }}
      transition={{ duration: 0.2 }}
      style={{
        ...T.glassCard,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glow accent line */}
      <motion.div
        aria-hidden
        animate={{ opacity: expanded ? 1 : 0 }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${col}, transparent)`,
          borderRadius: '18px 18px 0 0',
        }}
      />

      {/* Card header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          padding: '18px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: `${col}22`,
            border: `1px solid ${col}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={17} strokeWidth={2} style={{ color: col }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
            {tag}
            {dirty && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: T.warning,
                  flexShrink: 0,
                }}
              />
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: T.dim,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {summary}
          </div>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          style={{ color: T.faint, flexShrink: 0 }}
        >
          <ChevronDown size={16} strokeWidth={2.2} />
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expand"
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="exit"
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.07)',
                padding: '20px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {children}

              {/* Per-card save row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  paddingTop: 6,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: T.dim,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={onToggle}
                >
                  Close
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={onSave}
                  style={{
                    padding: '7px 18px',
                    borderRadius: 9,
                    background: dirty
                      ? `linear-gradient(135deg, ${col}, ${T.accentLight})`
                      : 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: dirty ? '#fff' : T.faint,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: dirty ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Save size={12} />
                  Save
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Card field grid ──────────────────────────────────────────────────────────
function FieldGrid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
      <span style={{ ...MICRO, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );
}

// ─── Integration status badge ─────────────────────────────────────────────────
type IntStatus = 'connected' | 'misconfigured' | 'off';

function StatusBadge({ status }: { status: IntStatus }) {
  const map: Record<IntStatus, { color: string; dim: string; label: string }> = {
    connected:     { color: T.success,  dim: T.successDim,  label: 'Connected' },
    misconfigured: { color: T.warning,  dim: T.warningDim,  label: 'Misconfigured' },
    off:           { color: T.faint,    dim: 'rgba(255,255,255,0.06)', label: 'Off' },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        background: s.dim,
        border: `1px solid ${s.color}44`,
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: s.color,
          boxShadow: status === 'connected' ? `0 0 4px ${s.color}` : 'none',
        }}
      />
      {s.label}
    </span>
  );
}

// ─── Integration row ──────────────────────────────────────────────────────────
function IntRow({
  label,
  sub,
  status,
  icon: Icon,
}: {
  label: string;
  sub: string;
  status: IntStatus;
  icon: typeof Settings;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
      }}
    >
      <Icon size={15} strokeWidth={2} style={{ color: T.faint, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

// ─── Feature-flag row ─────────────────────────────────────────────────────────
function FlagRow({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

// ─── Ramp ladder display ──────────────────────────────────────────────────────
const RAMP_STEPS = [
  { range: 'D1–3',   sends: 5 },
  { range: 'D4–7',   sends: 10 },
  { range: 'D8–14',  sends: 20 },
  { range: 'D15–21', sends: 35 },
  { range: 'D22–28', sends: 50 },
  { range: 'D29+',   sends: null },
];

function RampLadder({ dailyTarget }: { dailyTarget: number }) {
  const max = dailyTarget;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {RAMP_STEPS.map((s) => {
        const val = s.sends ?? dailyTarget;
        const pct = Math.round((val / Math.max(max, 1)) * 100);
        return (
          <div key={s.range} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: T.faint, width: 46, flexShrink: 0 }}>{s.range}</span>
            <div
              style={{
                flex: 1,
                height: 6,
                background: 'rgba(255,255,255,0.07)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
                style={{
                  height: '100%',
                  background: s.sends === null
                    ? `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`
                    : T.accentLight,
                  borderRadius: 999,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: s.sends === null ? T.accent : T.dim,
                width: 42,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {s.sends === null ? `${dailyTarget}` : `${s.sends}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

export function AdmSetSE2Cards() {
  // Track which card is expanded
  const [openCard, setOpenCard] = useState<string | null>(null);
  const toggle = useCallback((id: string) => {
    setOpenCard((c) => (c === id ? null : id));
  }, []);

  // Global toast
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // ── Card 1: General ──────────────────────────────────────────────────────
  const [general, setGeneral] = useState({
    platformName: 'WarmPulse',
    supportEmail: 'support@warmpulse.app',
    baseUrl: 'https://warmpulse.app',
    logoUrl: 'https://warmpulse.app/logo.svg',
  });
  const [generalClean] = useState({ ...general });
  const generalDirty = JSON.stringify(general) !== JSON.stringify(generalClean);

  // ── Card 2: Warmup Engine ────────────────────────────────────────────────
  const [engine, setEngine] = useState({
    peerRepMin: 0.3,
    dailyTarget: 75,
    sendWindowStart: '07:00',
    sendWindowEnd: '20:00',
    inboundCadenceMin: 3,
    outboundCadenceMin: 15,
    maxDailyPerPeer: 12,
    day0Exempt: true,
  });
  const [engineClean] = useState({ ...engine });
  const engineDirty = JSON.stringify(engine) !== JSON.stringify(engineClean);

  // ── Card 3: Integrations ─────────────────────────────────────────────────
  const [integrations, setIntegrations] = useState({
    llmProvider: 'Gemini',
    smtpHost: 'smtp.warmpulse.app',
    smtpPort: '587',
    smtpUser: 'tx@warmpulse.app',
    googleClientId: 'wp-oauth-123456789.apps.googleusercontent.com',
  });
  const [integrationsClean] = useState({ ...integrations });
  const integrationsDirty = JSON.stringify(integrations) !== JSON.stringify(integrationsClean);

  // ── Card 4: Security ─────────────────────────────────────────────────────
  const [security, setSecurity] = useState({
    require2FA: true,
    sessionTtlHours: 24,
    maxFailedLogins: 5,
    lockoutMinutes: 15,
    ipAllowlist: '',
    bcryptRounds: 12,
  });
  const [securityClean] = useState({ ...security });
  const securityDirty = JSON.stringify(security) !== JSON.stringify(securityClean);

  // ── Card 5: Alerts ───────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState({
    stalledMailboxHours: 4,
    peerRepDrop: 0.3,
    bounceRatePct: 5,
    quotaUsedPct: 90,
    alertEmail: 'admin@warmpulse.app',
    slackWebhook: 'https://hooks.slack.com/services/T…',
  });
  const [alertsClean] = useState({ ...alerts });
  const alertsDirty = JSON.stringify(alerts) !== JSON.stringify(alertsClean);

  // ── Card 6: Feature Flags ────────────────────────────────────────────────
  const [flags, setFlags] = useState({
    enableCrm: true,
    enableReports: true,
    enableBeta: false,
    enableImpersonation: true,
    enableDnsTools: true,
    enableUpiPayments: true,
    enableTrials: false,
  });
  const [flagsClean] = useState({ ...flags });
  const flagsDirty = JSON.stringify(flags) !== JSON.stringify(flagsClean);

  // ── Card 7: Region & Format ──────────────────────────────────────────────
  const [region, setRegion] = useState<Region>('IN');
  const [regionClean] = useState<Region>('IN');
  const regionDirty = region !== regionClean;

  // Any card dirty → show global save bar
  const anyDirty = generalDirty || engineDirty || integrationsDirty || securityDirty || alertsDirty || flagsDirty || regionDirty;

  const handleSaveAll = () => {
    toast('All settings saved', true);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 4px 120px',
        color: T.text,
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      {/* Background aurora blobs */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-5%',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(242,101,34,0.07) 0%, transparent 65%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '5%',
            left: '-8%',
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,138,75,0.05) 0%, transparent 65%)',
          }}
        />
      </div>

      {/* Page header */}
      <div style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <Settings size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span style={{ ...MICRO, color: T.accent }}>Admin · Platform Configuration</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.025em',
                margin: 0,
                lineHeight: 1.15,
                color: T.text,
              }}
            >
              Settings
            </h1>
            <p style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
              7 configuration groups · click a card to expand and edit inline
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {anyDirty && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  fontSize: 11,
                  color: T.warning,
                  background: T.warningDim,
                  border: `1px solid ${T.warning}44`,
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontWeight: 600,
                }}
              >
                Unsaved changes
              </motion.span>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={handleSaveAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 20px',
                borderRadius: 11,
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: `0 4px 18px rgba(242,101,34,0.32)`,
              }}
            >
              <Save size={14} />
              Save all
            </motion.button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(520px, 1fr))',
          gap: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* ── 1 · General ─────────────────────────────────────────────────── */}
        <SettingsCard
          id="general"
          icon={Settings}
          title="General"
          summary={`Platform: ${general.platformName} · ${general.baseUrl}`}
          expanded={openCard === 'general'}
          onToggle={() => toggle('general')}
          onSave={() => toast('General settings saved')}
          dirty={generalDirty}
        >
          <FieldGrid cols={2}>
            <Row label="Platform name">
              <TextInput value={general.platformName} onChange={(v) => setGeneral((g) => ({ ...g, platformName: v }))} />
            </Row>
            <Row label="Support email">
              <TextInput value={general.supportEmail} onChange={(v) => setGeneral((g) => ({ ...g, supportEmail: v }))} mono />
            </Row>
            <Row label="Base URL">
              <TextInput value={general.baseUrl} onChange={(v) => setGeneral((g) => ({ ...g, baseUrl: v }))} mono />
            </Row>
            <Row label="Logo URL">
              <TextInput value={general.logoUrl} onChange={(v) => setGeneral((g) => ({ ...g, logoUrl: v }))} mono />
            </Row>
          </FieldGrid>
        </SettingsCard>

        {/* ── 2 · Warmup Engine ────────────────────────────────────────────── */}
        <SettingsCard
          id="engine"
          icon={Flame}
          title="Warmup Engine"
          summary={`Peer rep floor ${engine.peerRepMin} · D29+ target ${engine.dailyTarget} sends/day`}
          expanded={openCard === 'engine'}
          onToggle={() => toggle('engine')}
          onSave={() => toast('Warmup engine settings saved')}
          dirty={engineDirty}
          accent={T.accentLight}
        >
          <Divider label="Peer reputation" />
          <FieldGrid cols={2}>
            <Row label="Reputation floor (PEER_REPUTATION_MIN)">
              <NumberInput
                value={engine.peerRepMin}
                onChange={(v) => setEngine((e) => ({ ...e, peerRepMin: v }))}
                min={0.1}
                max={0.9}
                step={0.05}
              />
            </Row>
            <Row label="Max sends/peer/day">
              <NumberInput
                value={engine.maxDailyPerPeer}
                onChange={(v) => setEngine((e) => ({ ...e, maxDailyPerPeer: v }))}
                min={1}
                max={50}
              />
            </Row>
          </FieldGrid>

          <Divider label="Ramp ladder" />
          <Row label="D29+ daily target">
            <NumberInput
              value={engine.dailyTarget}
              onChange={(v) => setEngine((e) => ({ ...e, dailyTarget: v }))}
              min={5}
              max={500}
            />
          </Row>
          <RampLadder dailyTarget={engine.dailyTarget} />

          <Divider label="Send windows" />
          <FieldGrid cols={2}>
            <Row label="Window start (UTC)">
              <TextInput value={engine.sendWindowStart} onChange={(v) => setEngine((e) => ({ ...e, sendWindowStart: v }))} mono />
            </Row>
            <Row label="Window end (UTC)">
              <TextInput value={engine.sendWindowEnd} onChange={(v) => setEngine((e) => ({ ...e, sendWindowEnd: v }))} mono />
            </Row>
            <Row label="Outbound cadence (min)">
              <NumberInput
                value={engine.outboundCadenceMin}
                onChange={(v) => setEngine((e) => ({ ...e, outboundCadenceMin: v }))}
                min={5}
                max={60}
              />
            </Row>
            <Row label="Inbound cadence (min)">
              <NumberInput
                value={engine.inboundCadenceMin}
                onChange={(v) => setEngine((e) => ({ ...e, inboundCadenceMin: v }))}
                min={1}
                max={30}
              />
            </Row>
          </FieldGrid>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Day-0 peer exemption</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>Skip new peers until they've received signal</div>
            </div>
            <Toggle on={engine.day0Exempt} onChange={(v) => setEngine((e) => ({ ...e, day0Exempt: v }))} />
          </div>
        </SettingsCard>

        {/* ── 3 · Integrations ────────────────────────────────────────────── */}
        <SettingsCard
          id="integrations"
          icon={Plug}
          title="Integrations"
          summary="LLM: Gemini → Claude → static · SMTP connected · OAuth active"
          expanded={openCard === 'integrations'}
          onToggle={() => toggle('integrations')}
          onSave={() => toast('Integration settings saved')}
          dirty={integrationsDirty}
        >
          <Divider label="LLM provider" />
          <IntRow label="Google Gemini" sub="Primary content generation · gemini-1.5-flash" status="connected" icon={Cpu} />
          <IntRow label="Anthropic Claude" sub="Fallback · claude-sonnet-4-6" status="connected" icon={Cpu} />
          <IntRow label="Static templates" sub="Last-resort fallback · always available" status="connected" icon={Cpu} />

          <Row label="Active provider">
            <SelectInput
              value={integrations.llmProvider}
              options={['Gemini', 'Claude', 'Static templates']}
              onChange={(v) => setIntegrations((i) => ({ ...i, llmProvider: v }))}
            />
          </Row>

          <Divider label="Transactional SMTP" />
          <IntRow
            label="Platform SMTP"
            sub={`${integrations.smtpHost}:${integrations.smtpPort} · ${integrations.smtpUser}`}
            status="connected"
            icon={Mail}
          />
          <FieldGrid cols={2}>
            <Row label="SMTP host">
              <TextInput value={integrations.smtpHost} onChange={(v) => setIntegrations((i) => ({ ...i, smtpHost: v }))} mono />
            </Row>
            <Row label="SMTP port">
              <TextInput value={integrations.smtpPort} onChange={(v) => setIntegrations((i) => ({ ...i, smtpPort: v }))} mono />
            </Row>
            <Row label="SMTP user">
              <TextInput value={integrations.smtpUser} onChange={(v) => setIntegrations((i) => ({ ...i, smtpUser: v }))} mono />
            </Row>
          </FieldGrid>

          <Divider label="Google OAuth" />
          <IntRow label="Google OAuth 2.0" sub="Mailbox-connect · Firebase ID verification" status="connected" icon={Key} />
          <Row label="Google Client ID">
            <TextInput value={integrations.googleClientId} onChange={(v) => setIntegrations((i) => ({ ...i, googleClientId: v }))} mono />
          </Row>
        </SettingsCard>

        {/* ── 4 · Security ─────────────────────────────────────────────────── */}
        <SettingsCard
          id="security"
          icon={Shield}
          title="Security"
          summary={`2FA ${security.require2FA ? 'required' : 'optional'} · Session TTL ${security.sessionTtlHours}h · bcrypt ${security.bcryptRounds}`}
          expanded={openCard === 'security'}
          onToggle={() => toggle('security')}
          onSave={() => toast('Security settings saved')}
          dirty={securityDirty}
          accent={T.success}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Require 2FA for all admins</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>
                TOTP enforced on every super-admin login
              </div>
            </div>
            <Toggle on={security.require2FA} onChange={(v) => setSecurity((s) => ({ ...s, require2FA: v }))} accent={T.success} />
          </div>

          <FieldGrid cols={2}>
            <Row label="Session TTL (hours)">
              <NumberInput
                value={security.sessionTtlHours}
                onChange={(v) => setSecurity((s) => ({ ...s, sessionTtlHours: v }))}
                min={1}
                max={168}
              />
            </Row>
            <Row label="bcrypt rounds">
              <NumberInput
                value={security.bcryptRounds}
                onChange={(v) => setSecurity((s) => ({ ...s, bcryptRounds: v }))}
                min={10}
                max={16}
              />
            </Row>
            <Row label="Max failed logins">
              <NumberInput
                value={security.maxFailedLogins}
                onChange={(v) => setSecurity((s) => ({ ...s, maxFailedLogins: v }))}
                min={3}
                max={20}
              />
            </Row>
            <Row label="Lockout duration (min)">
              <NumberInput
                value={security.lockoutMinutes}
                onChange={(v) => setSecurity((s) => ({ ...s, lockoutMinutes: v }))}
                min={5}
                max={1440}
              />
            </Row>
          </FieldGrid>

          <Row label="IP allowlist (comma-separated, empty = any)">
            <TextInput
              value={security.ipAllowlist}
              onChange={(v) => setSecurity((s) => ({ ...s, ipAllowlist: v }))}
              mono
              placeholder="e.g. 49.32.0.0/16, 157.49.0.0/16"
            />
          </Row>

          {/* Security status summary */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              padding: '12px 14px',
              background: T.successDim,
              border: `1px solid ${T.success}33`,
              borderRadius: 12,
            }}
          >
            <CheckCircle2 size={15} strokeWidth={2.2} style={{ color: T.success, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>Security posture: Strong</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                2FA on · short sessions · Fernet credential encryption · MultiFernet rotation ready
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* ── 5 · Alerts ───────────────────────────────────────────────────── */}
        <SettingsCard
          id="alerts"
          icon={Bell}
          title="Alerts"
          summary={`Stalled > ${alerts.stalledMailboxHours}h · Bounce > ${alerts.bounceRatePct}% · Quota > ${alerts.quotaUsedPct}%`}
          expanded={openCard === 'alerts'}
          onToggle={() => toggle('alerts')}
          onSave={() => toast('Alert thresholds saved')}
          dirty={alertsDirty}
          accent={T.warning}
        >
          <Divider label="Thresholds" />
          <FieldGrid cols={2}>
            <Row label="Stalled mailbox (hours)">
              <NumberInput
                value={alerts.stalledMailboxHours}
                onChange={(v) => setAlerts((a) => ({ ...a, stalledMailboxHours: v }))}
                min={1}
                max={48}
              />
            </Row>
            <Row label="Peer rep drop floor">
              <NumberInput
                value={alerts.peerRepDrop}
                onChange={(v) => setAlerts((a) => ({ ...a, peerRepDrop: v }))}
                min={0.1}
                max={0.9}
                step={0.05}
              />
            </Row>
            <Row label="Bounce rate % trigger">
              <NumberInput
                value={alerts.bounceRatePct}
                onChange={(v) => setAlerts((a) => ({ ...a, bounceRatePct: v }))}
                min={1}
                max={50}
              />
            </Row>
            <Row label="Quota utilisation % alert">
              <NumberInput
                value={alerts.quotaUsedPct}
                onChange={(v) => setAlerts((a) => ({ ...a, quotaUsedPct: v }))}
                min={50}
                max={99}
              />
            </Row>
          </FieldGrid>

          <Divider label="Dispatch channels" />
          <FieldGrid cols={1}>
            <Row label="Alert email">
              <TextInput value={alerts.alertEmail} onChange={(v) => setAlerts((a) => ({ ...a, alertEmail: v }))} mono />
            </Row>
            <Row label="Slack webhook URL">
              <TextInput value={alerts.slackWebhook} onChange={(v) => setAlerts((a) => ({ ...a, slackWebhook: v }))} mono />
            </Row>
          </FieldGrid>

          {/* Warning note */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              padding: '11px 13px',
              background: T.warningDim,
              border: `1px solid ${T.warning}33`,
              borderRadius: 11,
            }}
          >
            <AlertTriangle size={14} strokeWidth={2.2} style={{ color: T.warning, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: T.dim }}>
              Transactional SMTP dry-run mode is active when <code style={{ color: T.warning }}>TRANSACTIONAL_SMTP_HOST</code> is empty — alerts log at INFO, not sent.
            </div>
          </div>
        </SettingsCard>

        {/* ── 6 · Feature Flags ────────────────────────────────────────────── */}
        <SettingsCard
          id="flags"
          icon={ToggleLeft}
          title="Feature Flags"
          summary={`${Object.values(flags).filter(Boolean).length}/${Object.keys(flags).length} enabled`}
          expanded={openCard === 'flags'}
          onToggle={() => toggle('flags')}
          onSave={() => toast('Feature flags saved')}
          dirty={flagsDirty}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FlagRow label="CRM module" sub="Cross-workspace CRM management + sequences" on={flags.enableCrm} onChange={(v) => setFlags((f) => ({ ...f, enableCrm: v }))} />
            <FlagRow label="Reports module" sub="CSV / PDF export for all tiers" on={flags.enableReports} onChange={(v) => setFlags((f) => ({ ...f, enableReports: v }))} />
            <FlagRow label="DNS tools" sub="SPF / DKIM / DMARC lookup at /tools" on={flags.enableDnsTools} onChange={(v) => setFlags((f) => ({ ...f, enableDnsTools: v }))} />
            <FlagRow label="UPI payments" sub="Indian UPI gateway (dummy — no real PSP)" on={flags.enableUpiPayments} onChange={(v) => setFlags((f) => ({ ...f, enableUpiPayments: v }))} />
            <FlagRow label="Super-admin impersonation" sub="One-click impersonate any workspace" on={flags.enableImpersonation} onChange={(v) => setFlags((f) => ({ ...f, enableImpersonation: v }))} />
            <FlagRow label="Trials" sub="14-day trial flow for new Agency signups" on={flags.enableTrials} onChange={(v) => setFlags((f) => ({ ...f, enableTrials: v }))} />
            <FlagRow label="Beta features" sub="Exposes unreleased features to all workspaces" on={flags.enableBeta} onChange={(v) => setFlags((f) => ({ ...f, enableBeta: v }))} />
          </div>

          {flags.enableBeta && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                gap: 10,
                padding: '11px 13px',
                background: T.dangerDim,
                border: `1px solid ${T.danger}33`,
                borderRadius: 11,
              }}
            >
              <XCircle size={14} strokeWidth={2.2} style={{ color: T.danger, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: T.dim }}>
                Beta features are exposed to <strong style={{ color: T.danger }}>all workspaces</strong>. Disable before production deployments.
              </div>
            </motion.div>
          )}
        </SettingsCard>

        {/* ── 7 · Region & Format ──────────────────────────────────────────── */}
        <SettingsCard
          id="region"
          icon={Globe}
          title="Region & Format"
          summary={region === 'IN' ? 'India · ₹ INR · DD/MM/YYYY · IST' : 'International · $ USD · MMM D, YYYY'}
          expanded={openCard === 'region'}
          onToggle={() => toggle('region')}
          onSave={() => toast('Region settings saved')}
          dirty={regionDirty}
          accent={T.success}
          tag={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                background: T.accentDim,
                border: `1px solid ${T.accent}44`,
                borderRadius: 6,
                padding: '2px 7px',
                color: T.accent,
              }}
            >
              {region === 'IN' ? 'India' : 'Intl'}
            </span>
          }
        >
          {/* Toggle switcher */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              padding: 4,
              gap: 4,
            }}
          >
            {(['IN', 'INTL'] as const).map((r) => (
              <motion.button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                whileTap={{ scale: 0.97 }}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 9,
                  border: 'none',
                  background: region === r ? `linear-gradient(135deg, ${T.accent}, ${T.accentLight})` : 'transparent',
                  color: region === r ? '#fff' : T.dim,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.22s, color 0.22s',
                }}
              >
                {r === 'IN' ? '🇮🇳 India' : '🌐 International'}
              </motion.button>
            ))}
          </div>

          {/* Live preview */}
          <div
            style={{
              ...T.glass,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ ...MICRO }}>Live preview · updates instantly</div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {/* Money preview */}
              <div>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>Currency</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[1234567, 89900, 149].map((amt) => (
                    <div key={amt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.faint, width: 56, fontVariantNumeric: 'tabular-nums' }}>
                        {amt.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: T.accent,
                          fontVariantNumeric: 'tabular-nums',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatMoney(amt, { region })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Date preview */}
              <div>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>Date format</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: T.success,
                      fontFamily: 'monospace',
                    }}
                  >
                    {formatDate(SAMPLE_TS, { region })}
                  </div>
                  <div style={{ fontSize: 11, color: T.dim }}>
                    {region === 'IN' ? 'DD/MM/YYYY · Asia/Kolkata' : 'MMM D, YYYY · local'}
                  </div>
                </div>
              </div>
            </div>

            {/* Region detail chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(region === 'IN'
                ? ['₹ INR', 'en-IN grouping', 'DD/MM/YYYY', 'IST UTC+5:30', 'Indian number system']
                : ['$ USD', 'en-US grouping', 'MMM D, YYYY', 'Local timezone', 'Western number system']
              ).map((chip) => (
                <span
                  key={chip}
                  style={{
                    fontSize: 11,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: T.dim,
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              padding: '11px 14px',
              background: T.accentDim,
              border: `1px solid ${T.accent}33`,
              borderRadius: 11,
            }}
          >
            <RefreshCw size={13} strokeWidth={2.2} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: T.dim }}>
              Region applies to all formatMoney / formatDate calls platform-wide.
              Super-admins can override per-session via the locale store.
            </div>
          </div>
        </SettingsCard>
      </motion.div>

      {/* ── Global floating save bar ──────────────────────────────────────── */}
      <AnimatePresence>
        {anyDirty && (
          <motion.div
            key="save-bar"
            variants={saveBarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position: 'fixed',
              bottom: 28,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '14px 24px',
              background: 'rgba(18,18,28,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 16,
              boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
              minWidth: 340,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: T.warning,
                boxShadow: `0 0 8px ${T.warning}`,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, fontSize: 13, color: T.dim }}>
              You have <strong style={{ color: T.text }}>unsaved changes</strong> across settings
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleSaveAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 20px',
                borderRadius: 10,
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: `0 4px 16px rgba(242,101,34,0.35)`,
                whiteSpace: 'nowrap',
              }}
            >
              <Save size={13} />
              Save all changes
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast notifications ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 16px',
                background: 'rgba(18,18,28,0.94)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${t.ok ? T.success : T.danger}44`,
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.38)',
                fontSize: 13,
                color: T.text,
                pointerEvents: 'auto',
                minWidth: 220,
              }}
            >
              {t.ok
                ? <Check size={14} strokeWidth={2.4} style={{ color: T.success, flexShrink: 0 }} />
                : <X size={14} strokeWidth={2.4} style={{ color: T.danger, flexShrink: 0 }} />}
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Engine summary strip ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5 }}
        style={{
          ...T.glass,
          marginTop: 20,
          padding: '16px 20px',
          display: 'flex',
          gap: 0,
          flexWrap: 'wrap',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {[
          { icon: Zap,        label: 'Beat alive',      value: '42s ago',    color: T.success },
          { icon: Clock,      label: 'Next outbound',   value: 'in 8 min',   color: T.accentLight },
          { icon: RefreshCw,  label: 'Ramp advance',    value: '00:00 UTC',  color: T.dim },
          { icon: Bell,       label: 'Alert check',     value: ':10 hourly', color: T.dim },
          { icon: Flame,      label: 'Active mailboxes', value: '1,284',     color: T.accent },
          { icon: Mail,       label: 'Sends today',     value: '71,540',     color: T.accent },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '8px 16px',
                borderRight: i < 5 ? '1px solid rgba(255,255,255,0.07)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={12} strokeWidth={2.2} style={{ color: item.color }} />
                <span style={{ ...MICRO }}>{item.label}</span>
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: item.color,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default AdmSetSE2Cards;
