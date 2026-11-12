/**
 * Admin Settings — SE1 Console
 *
 * "Settings Console" — left section-nav + animated panels.
 * Sections: General, Warmup Engine, Integrations, Security, Alerts,
 *           Feature Flags, Region & Format.
 *
 * Framer-motion: AnimatePresence mode="wait" panel slide/fade,
 * layoutId active-nav indicator, spring toggles, staggered field entrance,
 * whileHover/whileTap, spring save-bar, animated counter on toggle.
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Only @/ import: @/lib/format (formatMoney, formatDate).
 * Aurora Glass dark palette — warm amber/orange only.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type ReactNode,
  type ChangeEvent,
} from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
  type Variants,
} from 'framer-motion';
import {
  Settings,
  Zap,
  Plug,
  Shield,
  Bell,
  Flag,
  Globe,
  ChevronRight,
  Check,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Mail,
  Database,
  Cpu,
  Clock,
  RefreshCw,
  Info,
  Sliders,
} from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import type { Region } from '@/stores/locale';

// ─── Fixed sample timestamp (never new Date() at module scope) ─────────────────
const SAMPLE_TS = 1748736000000; // 2026-06-01T00:00:00Z (fixed)
const SAMPLE_AMOUNT = 1234567;

// ─── Design tokens ──────────────────────────────────────────────────────────────
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
  neutral:      'rgba(255,255,255,0.28)' as const,
  neutralDim:   'rgba(255,255,255,0.07)' as const,
  glass: {
    background:           'rgba(255,255,255,0.05)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius:         16,
  } as CSSProperties,
  glassDeep: {
    background:           'rgba(255,255,255,0.08)',
    border:               '1px solid rgba(255,255,255,0.14)',
    backdropFilter:       'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius:         20,
  } as CSSProperties,
  glassInput: {
    background:           'rgba(255,255,255,0.04)',
    border:               '1px solid rgba(255,255,255,0.10)',
    backdropFilter:       'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius:         10,
  } as CSSProperties,
};

// ─── Section definitions ────────────────────────────────────────────────────────
type SectionId = 'general' | 'warmup' | 'integrations' | 'security' | 'alerts' | 'flags' | 'region';

interface NavSection {
  id:    SectionId;
  label: string;
  icon:  ReactNode;
  desc:  string;
}

const NAV_SECTIONS: NavSection[] = [
  { id: 'general',      label: 'General',          icon: <Settings size={16} />,    desc: 'Platform identity & branding' },
  { id: 'warmup',       label: 'Warmup Engine',     icon: <Zap size={16} />,         desc: 'Peer reputation, ramp, cadence' },
  { id: 'integrations', label: 'Integrations',      icon: <Plug size={16} />,        desc: 'LLM, SMTP, OAuth status' },
  { id: 'security',     label: 'Security',          icon: <Shield size={16} />,      desc: '2FA policy, sessions, passwords' },
  { id: 'alerts',       label: 'Alerts',            icon: <Bell size={16} />,        desc: 'Thresholds & notifications' },
  { id: 'flags',        label: 'Feature Flags',     icon: <Flag size={16} />,        desc: 'Experimental toggles' },
  { id: 'region',       label: 'Region & Format',   icon: <Globe size={16} />,       desc: '₹/$ and date format' },
];

// ─── Mock state shapes ───────────────────────────────────────────────────────────
interface GeneralState {
  platformName:   string;
  supportEmail:   string;
  baseUrl:        string;
  brandColor:     string;
  logoUrl:        string;
  maintenanceMode:boolean;
}

interface WarmupState {
  peerReputationMin: number;
  rampD1_3:          number;
  rampD4_7:          number;
  rampD8_14:         number;
  rampD15_21:        number;
  rampD22_28:        number;
  rampD29plus:       number;
  sendWindowStart:   string;
  sendWindowEnd:     string;
  outboundCadence:   number;
  inboundCadence:    number;
  peerDedupHours:    number;
  autoDeactivatePeers: boolean;
}

type LLMProvider = 'gemini' | 'claude' | 'static';
type ConnStatus  = 'connected' | 'misconfigured' | 'off';

interface IntegState {
  llmProvider:         LLMProvider;
  geminiKey:           string;
  claudeKey:           string;
  smtpHost:            string;
  smtpPort:            number;
  smtpUser:            string;
  smtpPass:            string;
  smtpStatus:          ConnStatus;
  googleClientId:      string;
  googleClientSecret:  string;
  googleOAuthStatus:   ConnStatus;
}

interface SecurityState {
  require2FA:         boolean;
  sessionTTLHours:    number;
  minPasswordLength:  number;
  requireSpecialChar: boolean;
  requireUppercase:   boolean;
  maxLoginAttempts:   number;
  lockoutMinutes:     number;
  adminIpWhitelist:   string;
}

interface AlertState {
  stalledMailboxHours:   number;
  peerBounceThreshold:   number;
  quotaWarningPct:       number;
  emailOnAlert:          boolean;
  alertRecipient:        string;
  beatMaxSilenceSecs:    number;
}

interface FlagState {
  enableCRM:            boolean;
  enableReports:        boolean;
  enableDNSValidator:   boolean;
  enableImpersonation:  boolean;
  enableBetaDashboard:  boolean;
  maintenanceBanner:    boolean;
  rateLimitOverride:    boolean;
}

// ─── Initial mock values ─────────────────────────────────────────────────────────
const INIT_GENERAL: GeneralState = {
  platformName:    'WarmPulse',
  supportEmail:    'support@warmpulse.io',
  baseUrl:         'https://app.warmpulse.io',
  brandColor:      '#F26522',
  logoUrl:         'https://warmpulse.io/logo.svg',
  maintenanceMode: false,
};

const INIT_WARMUP: WarmupState = {
  peerReputationMin:   0.3,
  rampD1_3:            5,
  rampD4_7:            10,
  rampD8_14:           20,
  rampD15_21:          35,
  rampD22_28:          50,
  rampD29plus:         80,
  sendWindowStart:     '08:00',
  sendWindowEnd:       '20:00',
  outboundCadence:     15,
  inboundCadence:      3,
  peerDedupHours:      24,
  autoDeactivatePeers: true,
};

const INIT_INTEG: IntegState = {
  llmProvider:        'gemini',
  geminiKey:          'AIzaSy••••••••••••••••••••••',
  claudeKey:          '',
  smtpHost:           'smtp.warmpulse.io',
  smtpPort:           587,
  smtpUser:           'transact@warmpulse.io',
  smtpPass:           '••••••••••••',
  smtpStatus:         'connected',
  googleClientId:     '4932841729-abc••••••••••••••.apps.googleusercontent.com',
  googleClientSecret: 'GOCSPX-••••••••••',
  googleOAuthStatus:  'connected',
};

const INIT_SECURITY: SecurityState = {
  require2FA:         false,
  sessionTTLHours:    24,
  minPasswordLength:  10,
  requireSpecialChar: true,
  requireUppercase:   true,
  maxLoginAttempts:   5,
  lockoutMinutes:     15,
  adminIpWhitelist:   '',
};

const INIT_ALERTS: AlertState = {
  stalledMailboxHours: 4,
  peerBounceThreshold: 0.15,
  quotaWarningPct:     85,
  emailOnAlert:        true,
  alertRecipient:      'alerts@warmpulse.io',
  beatMaxSilenceSecs:  90,
};

const INIT_FLAGS: FlagState = {
  enableCRM:           true,
  enableReports:       true,
  enableDNSValidator:  true,
  enableImpersonation: true,
  enableBetaDashboard: false,
  maintenanceBanner:   false,
  rateLimitOverride:   false,
};

// ─── Animation variants ──────────────────────────────────────────────────────────
const panelVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x:       dir > 0 ? 32 : -32,
    filter:  'blur(4px)',
  }),
  center: {
    opacity: 1,
    x:       0,
    filter:  'blur(0px)',
    transition: { type: 'spring', stiffness: 320, damping: 32, mass: 0.8 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x:       dir > 0 ? -24 : 24,
    filter:  'blur(3px)',
    transition: { duration: 0.18, ease: 'easeIn' },
  }),
};

const fieldStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055 },
  },
};

const fieldItem: Variants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
};

const saveBarVariants: Variants = {
  hidden:  { y: 80, opacity: 0, scale: 0.96 },
  visible: { y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } },
  exit:    { y: 60, opacity: 0, scale: 0.97, transition: { duration: 0.2, ease: 'easeIn' } },
};

const toastVariants: Variants = {
  hidden:  { opacity: 0, y: -16, scale: 0.94 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 28 } },
  exit:    { opacity: 0, y: -12, scale: 0.96, transition: { duration: 0.18 } },
};

// ─── Sub-components ──────────────────────────────────────────────────────────────

/** Pill-style label */
function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            4,
      padding:        '2px 9px',
      borderRadius:   99,
      fontSize:       11,
      fontWeight:     600,
      letterSpacing:  '0.04em',
      color,
      background:     bg,
    }}>
      {label}
    </span>
  );
}

/** Section header within a panel */
function PanelHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <motion.div variants={fieldItem} style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{
          width:        36,
          height:       36,
          borderRadius: 10,
          background:   T.accentDim,
          border:       `1px solid rgba(242,101,34,0.3)`,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          color:        T.accent,
          flexShrink:   0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontSize: 13, color: T.dim, marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ height: 1, background: T.hairline, marginTop: 16 }} />
    </motion.div>
  );
}

/** Labelled field row */
function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <motion.div variants={fieldItem} style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: T.dim }}>
          {label}
        </label>
        {hint && (
          <span style={{ fontSize: 11, color: T.faint, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Info size={10} style={{ flexShrink: 0 }} />
            {hint}
          </span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

/** Styled text input */
function StyledInput({
  value, onChange, type = 'text', placeholder, readOnly,
}: {
  value:        string | number;
  onChange?:    (v: string) => void;
  type?:        string;
  placeholder?: string;
  readOnly?:    boolean;
}) {
  return (
    <motion.input
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
      type={type}
      placeholder={placeholder}
      readOnly={readOnly}
      whileFocus={{ scale: 1.005 }}
      style={{
        ...T.glassInput,
        width:       '100%',
        padding:     '9px 13px',
        fontSize:    13,
        color:       readOnly ? T.faint : T.text,
        outline:     'none',
        boxSizing:   'border-box',
        fontFamily:  'inherit',
        cursor:      readOnly ? 'default' : 'text',
        transition:  'border-color 0.2s',
      }}
    />
  );
}

/** Animated spring toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.93 }}
      style={{
        width:          48,
        height:         26,
        borderRadius:   99,
        background:     checked ? T.accent : 'rgba(255,255,255,0.12)',
        border:         `1px solid ${checked ? 'rgba(242,101,34,0.4)' : 'rgba(255,255,255,0.15)'}`,
        cursor:         'pointer',
        position:       'relative',
        flexShrink:     0,
        transition:     'background 0.25s, border-color 0.25s',
        padding:        0,
        outline:        'none',
      }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        style={{
          position:     'absolute',
          top:          3,
          left:         checked ? 23 : 3,
          width:        18,
          height:       18,
          borderRadius: 99,
          background:   '#fff',
          boxShadow:    '0 1px 4px rgba(0,0,0,0.35)',
        }}
      />
    </motion.button>
  );
}

/** Integration status badge */
function ConnBadge({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { color: string; bg: string; icon: ReactNode; label: string }> = {
    connected:    { color: T.success, bg: T.successDim, icon: <CheckCircle2 size={11} />, label: 'Connected' },
    misconfigured:{ color: T.warning, bg: T.warningDim, icon: <AlertTriangle size={11} />, label: 'Misconfigured' },
    off:          { color: T.neutral, bg: T.neutralDim, icon: <XCircle size={11} />,     label: 'Off' },
  };
  const m = map[status] ?? map.off;
  return (
    <span style={{
      display:     'inline-flex',
      alignItems:  'center',
      gap:         5,
      padding:     '3px 9px',
      borderRadius:99,
      fontSize:    11,
      fontWeight:  700,
      color:       m.color,
      background:  m.bg,
    }}>
      {m.icon}
      {m.label}
    </span>
  );
}

/** Section divider */
function Divider({ label }: { label?: string }) {
  return (
    <motion.div
      variants={fieldItem}
      style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 18px' }}
    >
      {label && <span style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: T.hairline }} />
    </motion.div>
  );
}

/** Number stepper */
function NumStepper({
  value, onChange, min, max, step = 1, suffix,
}: {
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  step?:    number;
  suffix?:  string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(4)))}
        style={{
          width:        32, height: 32, borderRadius: 8,
          background:   T.neutralDim,
          border:       '1px solid rgba(255,255,255,0.10)',
          color:        T.dim, fontSize: 18, fontWeight: 700,
          cursor:       'pointer', display: 'flex',
          alignItems:   'center', justifyContent: 'center',
          outline:      'none', flexShrink: 0,
        }}
      >−</motion.button>
      <div style={{
        ...T.glassInput,
        minWidth:   72, padding: '6px 12px',
        textAlign:  'center', fontSize: 13,
        fontWeight: 600, color: T.text,
      }}>
        {value}{suffix ?? ''}
      </div>
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => onChange(Math.min(max, +(value + step).toFixed(4)))}
        style={{
          width:        32, height: 32, borderRadius: 8,
          background:   T.neutralDim,
          border:       '1px solid rgba(255,255,255,0.10)',
          color:        T.dim, fontSize: 18, fontWeight: 700,
          cursor:       'pointer', display: 'flex',
          alignItems:   'center', justifyContent: 'center',
          outline:      'none', flexShrink: 0,
        }}
      >+</motion.button>
    </div>
  );
}

/** Password field with show/hide */
function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <StyledInput
        value={value}
        onChange={onChange}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
      />
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setShow(s => !s)}
        style={{
          position:     'absolute',
          right:        10, top: '50%',
          transform:    'translateY(-50%)',
          background:   'none', border: 'none',
          cursor:       'pointer',
          color:        T.faint, padding: 2,
          outline:      'none',
        }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </motion.button>
    </div>
  );
}

// ─── Panel: General ──────────────────────────────────────────────────────────────
function PanelGeneral({
  state, onChange,
}: {
  state:    GeneralState;
  onChange: (patch: Partial<GeneralState>) => void;
}) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Settings size={18} />}
        title="General"
        subtitle="Platform identity, branding & operational mode"
      />
      <FieldRow label="Platform Name">
        <StyledInput value={state.platformName} onChange={v => onChange({ platformName: v })} placeholder="WarmPulse" />
      </FieldRow>
      <FieldRow label="Support Email">
        <StyledInput value={state.supportEmail} onChange={v => onChange({ supportEmail: v })} placeholder="support@example.com" />
      </FieldRow>
      <FieldRow label="Base URL" hint="Used in transactional emails">
        <StyledInput value={state.baseUrl} onChange={v => onChange({ baseUrl: v })} placeholder="https://app.example.com" />
      </FieldRow>
      <FieldRow label="Logo URL">
        <StyledInput value={state.logoUrl} onChange={v => onChange({ logoUrl: v })} placeholder="https://…/logo.svg" />
      </FieldRow>
      <FieldRow label="Brand Accent Color" hint="Hex value">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            value={state.brandColor}
            onChange={(e) => onChange({ brandColor: e.target.value })}
            style={{ width: 38, height: 32, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
          />
          <StyledInput value={state.brandColor} onChange={v => onChange({ brandColor: v })} />
        </div>
      </FieldRow>
      <Divider label="Operations" />
      <motion.div variants={fieldItem}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', ...T.glassInput, borderRadius: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Maintenance Mode</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>Returns 503 for all non-admin traffic</div>
          </div>
          <Toggle checked={state.maintenanceMode} onChange={v => onChange({ maintenanceMode: v })} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Panel: Warmup Engine ────────────────────────────────────────────────────────
function PanelWarmup({
  state, onChange,
}: {
  state:    WarmupState;
  onChange: (patch: Partial<WarmupState>) => void;
}) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Zap size={18} />}
        title="Warmup Engine"
        subtitle="Peer reputation floor, ramp ladder, send windows & cadence"
      />
      <Divider label="Peer Reputation" />
      <FieldRow label="Minimum Peer Reputation Score" hint="0.0 – 1.0 · default 0.3">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <NumStepper
            value={state.peerReputationMin}
            onChange={v => onChange({ peerReputationMin: v })}
            min={0.05} max={0.95} step={0.05}
          />
          <div style={{ flex: 1, position: 'relative', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${state.peerReputationMin * 100}%` }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})` }}
            />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.accentLight, minWidth: 32, textAlign: 'right' }}>
            {state.peerReputationMin.toFixed(2)}
          </span>
        </div>
      </FieldRow>

      <FieldRow label="Auto-Deactivate Peers Below Floor">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', ...T.glassInput, borderRadius: 10 }}>
          <span style={{ fontSize: 13, color: T.dim }}>Deactivate peers scoring below {state.peerReputationMin.toFixed(2)}</span>
          <Toggle checked={state.autoDeactivatePeers} onChange={v => onChange({ autoDeactivatePeers: v })} />
        </div>
      </FieldRow>

      <Divider label="Ramp Ladder (emails / day)" />
      <motion.div variants={fieldItem}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([
            ['D1–3',   'rampD1_3',   1, 50],
            ['D4–7',   'rampD4_7',   1, 100],
            ['D8–14',  'rampD8_14',  1, 150],
            ['D15–21', 'rampD15_21', 1, 200],
            ['D22–28', 'rampD22_28', 1, 250],
            ['D29+',   'rampD29plus',1, 500],
          ] as Array<[string, keyof WarmupState, number, number]>).map(([label, key, mn, mx]) => (
            <div key={key} style={{ ...T.glassInput, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
              <NumStepper
                value={state[key] as number}
                onChange={v => onChange({ [key]: v } as Partial<WarmupState>)}
                min={mn} max={mx} step={5}
              />
            </div>
          ))}
        </div>
      </motion.div>

      <Divider label="Send Windows & Cadence" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FieldRow label="Window Start (UTC)">
          <StyledInput value={state.sendWindowStart} onChange={v => onChange({ sendWindowStart: v })} type="time" />
        </FieldRow>
        <FieldRow label="Window End (UTC)">
          <StyledInput value={state.sendWindowEnd} onChange={v => onChange({ sendWindowEnd: v })} type="time" />
        </FieldRow>
        <FieldRow label="Outbound Cadence" hint="minutes">
          <NumStepper value={state.outboundCadence} onChange={v => onChange({ outboundCadence: v })} min={5} max={60} step={5} suffix=" min" />
        </FieldRow>
        <FieldRow label="Inbound Cadence" hint="minutes">
          <NumStepper value={state.inboundCadence} onChange={v => onChange({ inboundCadence: v })} min={1} max={30} step={1} suffix=" min" />
        </FieldRow>
      </div>
      <FieldRow label="Peer 24h Dedup Window" hint="hours">
        <NumStepper value={state.peerDedupHours} onChange={v => onChange({ peerDedupHours: v })} min={1} max={72} step={1} suffix="h" />
      </FieldRow>
    </motion.div>
  );
}

// ─── Panel: Integrations ─────────────────────────────────────────────────────────
function PanelIntegrations({
  state, onChange,
}: {
  state:    IntegState;
  onChange: (patch: Partial<IntegState>) => void;
}) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Plug size={18} />}
        title="Integrations"
        subtitle="LLM provider priority, transactional SMTP & Google OAuth"
      />

      {/* LLM Provider */}
      <Divider label="LLM Provider" />
      <motion.div variants={fieldItem}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {(['gemini', 'claude', 'static'] as LLMProvider[]).map(p => {
            const labels: Record<LLMProvider, string> = { gemini: 'Gemini', claude: 'Claude', static: 'Static Templates' };
            const icons:  Record<LLMProvider, ReactNode> = { gemini: <Cpu size={14} />, claude: <Database size={14} />, static: <Mail size={14} /> };
            const active  = state.llmProvider === p;
            return (
              <motion.button
                key={p}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => onChange({ llmProvider: p })}
                style={{
                  flex:         1,
                  padding:      '10px 12px',
                  borderRadius: 12,
                  background:   active ? T.accentDim : T.neutralDim,
                  border:       `1px solid ${active ? 'rgba(242,101,34,0.35)' : 'rgba(255,255,255,0.10)'}`,
                  color:        active ? T.accent : T.dim,
                  cursor:       'pointer',
                  outline:      'none',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  gap:          6,
                  fontWeight:   600,
                  fontSize:     12,
                  transition:   'background 0.2s, border-color 0.2s, color 0.2s',
                }}
              >
                {icons[p]}{labels[p]}
                {active && <Check size={12} style={{ marginLeft: 2 }} />}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
      <FieldRow label="Gemini API Key">
        <PasswordField value={state.geminiKey} onChange={v => onChange({ geminiKey: v })} placeholder="AIzaSy…" />
      </FieldRow>
      <FieldRow label="Claude (Anthropic) API Key">
        <PasswordField value={state.claudeKey} onChange={v => onChange({ claudeKey: v })} placeholder="sk-ant-…" />
      </FieldRow>

      {/* Transactional SMTP */}
      <Divider label="Transactional SMTP" />
      <motion.div variants={fieldItem} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: T.dim }}>Connection status</span>
          <ConnBadge status={state.smtpStatus} />
        </div>
      </motion.div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 14 }}>
        <FieldRow label="SMTP Host">
          <StyledInput value={state.smtpHost} onChange={v => onChange({ smtpHost: v })} placeholder="smtp.example.com" />
        </FieldRow>
        <FieldRow label="Port">
          <StyledInput value={state.smtpPort} onChange={v => onChange({ smtpPort: parseInt(v, 10) || 587 })} type="number" />
        </FieldRow>
      </div>
      <FieldRow label="SMTP User">
        <StyledInput value={state.smtpUser} onChange={v => onChange({ smtpUser: v })} />
      </FieldRow>
      <FieldRow label="SMTP Password">
        <PasswordField value={state.smtpPass} onChange={v => onChange({ smtpPass: v })} />
      </FieldRow>

      {/* Google OAuth */}
      <Divider label="Google OAuth" />
      <motion.div variants={fieldItem} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: T.dim }}>OAuth connection status</span>
          <ConnBadge status={state.googleOAuthStatus} />
        </div>
      </motion.div>
      <FieldRow label="Client ID">
        <StyledInput value={state.googleClientId} onChange={v => onChange({ googleClientId: v })} />
      </FieldRow>
      <FieldRow label="Client Secret">
        <PasswordField value={state.googleClientSecret} onChange={v => onChange({ googleClientSecret: v })} placeholder="GOCSPX-…" />
      </FieldRow>
    </motion.div>
  );
}

// ─── Panel: Security ─────────────────────────────────────────────────────────────
function PanelSecurity({
  state, onChange,
}: {
  state:    SecurityState;
  onChange: (patch: Partial<SecurityState>) => void;
}) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Shield size={18} />}
        title="Security"
        subtitle="Two-factor policy, session TTL & password requirements"
      />
      <Divider label="Two-Factor Authentication" />
      <motion.div variants={fieldItem}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', ...T.glassInput, borderRadius: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Require 2FA for all users</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>Enforces TOTP on next login; existing sessions unaffected</div>
          </div>
          <Toggle checked={state.require2FA} onChange={v => onChange({ require2FA: v })} />
        </div>
      </motion.div>

      <Divider label="Sessions" />
      <FieldRow label="Access Token TTL" hint="hours">
        <NumStepper value={state.sessionTTLHours} onChange={v => onChange({ sessionTTLHours: v })} min={1} max={168} step={1} suffix="h" />
      </FieldRow>

      <Divider label="Password Policy" />
      <FieldRow label="Minimum Length">
        <NumStepper value={state.minPasswordLength} onChange={v => onChange({ minPasswordLength: v })} min={6} max={32} step={1} />
      </FieldRow>
      {([
        ['Require Uppercase Letter',  'requireUppercase',   'At least one A–Z'],
        ['Require Special Character', 'requireSpecialChar', 'e.g. !@#$%^&*'],
      ] as Array<[string, keyof SecurityState, string]>).map(([lbl, key, sub]) => (
        <motion.div key={key} variants={fieldItem} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', ...T.glassInput, borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{lbl}</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{sub}</div>
            </div>
            <Toggle checked={state[key] as boolean} onChange={v => onChange({ [key]: v } as Partial<SecurityState>)} />
          </div>
        </motion.div>
      ))}

      <Divider label="Login Protection" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FieldRow label="Max Login Attempts">
          <NumStepper value={state.maxLoginAttempts} onChange={v => onChange({ maxLoginAttempts: v })} min={3} max={20} step={1} />
        </FieldRow>
        <FieldRow label="Lockout Duration" hint="minutes">
          <NumStepper value={state.lockoutMinutes} onChange={v => onChange({ lockoutMinutes: v })} min={5} max={1440} step={5} suffix=" min" />
        </FieldRow>
      </div>

      <FieldRow label="Admin IP Whitelist" hint="comma-separated CIDRs, blank = all">
        <StyledInput
          value={state.adminIpWhitelist}
          onChange={v => onChange({ adminIpWhitelist: v })}
          placeholder="203.0.113.0/24, 198.51.100.10"
        />
      </FieldRow>
    </motion.div>
  );
}

// ─── Panel: Alerts ───────────────────────────────────────────────────────────────
function PanelAlerts({
  state, onChange,
}: {
  state:    AlertState;
  onChange: (patch: Partial<AlertState>) => void;
}) {
  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Bell size={18} />}
        title="Alerts"
        subtitle="Stall / bounce / quota thresholds & notification routing"
      />
      <Divider label="Thresholds" />
      <FieldRow label="Stalled Mailbox Threshold" hint="hours of no sends">
        <NumStepper value={state.stalledMailboxHours} onChange={v => onChange({ stalledMailboxHours: v })} min={1} max={48} step={1} suffix="h" />
      </FieldRow>
      <FieldRow label="Peer Bounce Rate Threshold" hint="0.0 – 1.0">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <NumStepper value={state.peerBounceThreshold} onChange={v => onChange({ peerBounceThreshold: v })} min={0.01} max={0.5} step={0.01} />
          <div style={{ flex: 1, position: 'relative', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${state.peerBounceThreshold * 200}%` }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${T.success}, ${T.warning})` }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.warning }}>{(state.peerBounceThreshold * 100).toFixed(0)}%</span>
        </div>
      </FieldRow>
      <FieldRow label="Quota Warning Threshold" hint="% of daily quota used">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <NumStepper value={state.quotaWarningPct} onChange={v => onChange({ quotaWarningPct: v })} min={50} max={99} step={5} suffix="%" />
          <div style={{ flex: 1, position: 'relative', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${state.quotaWarningPct}%` }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${T.accent}, ${T.danger})` }}
            />
          </div>
        </div>
      </FieldRow>
      <FieldRow label="Beat Max Silence" hint="seconds before 'beat dead' alert">
        <NumStepper value={state.beatMaxSilenceSecs} onChange={v => onChange({ beatMaxSilenceSecs: v })} min={30} max={600} step={10} suffix="s" />
      </FieldRow>

      <Divider label="Notification Delivery" />
      <motion.div variants={fieldItem} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', ...T.glassInput, borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Email on Alert</div>
            <div style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>Send transactional email for every alert fired</div>
          </div>
          <Toggle checked={state.emailOnAlert} onChange={v => onChange({ emailOnAlert: v })} />
        </div>
      </motion.div>
      <FieldRow label="Alert Recipient Email">
        <StyledInput value={state.alertRecipient} onChange={v => onChange({ alertRecipient: v })} placeholder="ops@example.com" />
      </FieldRow>
    </motion.div>
  );
}

// ─── Panel: Feature Flags ────────────────────────────────────────────────────────
function PanelFlags({
  state, onChange,
}: {
  state:    FlagState;
  onChange: (patch: Partial<FlagState>) => void;
}) {
  const flags: Array<{ key: keyof FlagState; label: string; desc: string; tag?: string }> = [
    { key: 'enableCRM',           label: 'CRM Module',             desc: 'Contacts, sequences & open tracking',       tag: 'Stable' },
    { key: 'enableReports',       label: 'Reports Export',         desc: 'CSV + PDF report generation for all tiers', tag: 'Stable' },
    { key: 'enableDNSValidator',  label: 'DNS Validator',          desc: 'SPF / DKIM / DMARC lookup tools page',      tag: 'Stable' },
    { key: 'enableImpersonation', label: 'Admin Impersonation',    desc: 'One-click workspace entry with audit trail', tag: 'Stable' },
    { key: 'enableBetaDashboard', label: 'Beta Dashboard V2',      desc: 'Experimental bento-grid admin dashboard',   tag: 'Beta' },
    { key: 'maintenanceBanner',   label: 'Maintenance Banner',     desc: 'Show sticky banner to all logged-in users', tag: 'Ops' },
    { key: 'rateLimitOverride',   label: 'Rate-Limit Override',    desc: 'Disable per-IP rate limits (dev only)',      tag: 'Dev' },
  ];

  const tagColor: Record<string, string> = {
    Stable: T.success,
    Beta:   T.accent,
    Ops:    T.warning,
    Dev:    T.danger,
  };
  const tagBg: Record<string, string> = {
    Stable: T.successDim,
    Beta:   T.accentDim,
    Ops:    T.warningDim,
    Dev:    T.dangerDim,
  };

  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Flag size={18} />}
        title="Feature Flags"
        subtitle="Enable or disable platform capabilities without redeploying"
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flags.map(f => (
          <motion.div key={f.key} variants={fieldItem}>
            <motion.div
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              style={{
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'space-between',
                padding:      '13px 16px',
                borderRadius: 12,
                ...T.glassInput,
                transition:   'background 0.2s',
                cursor:       'default',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{f.label}</span>
                  {f.tag && (
                    <Pill
                      color={tagColor[f.tag] ?? T.neutral}
                      bg={tagBg[f.tag] ?? T.neutralDim}
                      label={f.tag}
                    />
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.faint }}>{f.desc}</div>
              </div>
              <Toggle
                checked={state[f.key] as boolean}
                onChange={v => onChange({ [f.key]: v } as Partial<FlagState>)}
              />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Panel: Region & Format ───────────────────────────────────────────────────────
function PanelRegion({
  region, onChange,
}: {
  region:   Region;
  onChange: (r: Region) => void;
}) {
  const previewDate   = formatDate(SAMPLE_TS, { region });
  const previewMoney  = formatMoney(SAMPLE_AMOUNT, { region });
  const previewMoney2 = formatMoney(4999, { region, decimals: 2 });

  return (
    <motion.div variants={fieldStagger} initial="hidden" animate="visible">
      <PanelHeader
        icon={<Globe size={18} />}
        title="Region & Format"
        subtitle="Controls currency symbol, number grouping & date display platform-wide"
      />

      {/* Region toggle */}
      <motion.div variants={fieldItem}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {(['IN', 'INTL'] as Region[]).map(r => {
            const active = region === r;
            const labels: Record<Region, string> = { IN: '🇮🇳 India (₹ · DD/MM/YYYY · IST)', INTL: '🌐 International ($ · MMM D, YYYY)' };
            return (
              <motion.button
                key={r}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: active ? 1 : 1.015 }}
                onClick={() => onChange(r)}
                style={{
                  flex:         1,
                  padding:      '14px 18px',
                  borderRadius: 14,
                  background:   active ? T.accentDim : T.neutralDim,
                  border:       `2px solid ${active ? T.accent : 'rgba(255,255,255,0.12)'}`,
                  color:        active ? T.text : T.dim,
                  cursor:       'pointer',
                  outline:      'none',
                  fontSize:     14,
                  fontWeight:   active ? 700 : 500,
                  transition:   'background 0.22s, border-color 0.22s, color 0.22s',
                  textAlign:    'left',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'space-between',
                  gap:          8,
                }}
              >
                {labels[r]}
                <AnimatePresence>
                  {active && (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      style={{
                        width:          22, height: 22,
                        borderRadius:   99,
                        background:     T.accent,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexShrink:     0,
                      }}
                    >
                      <Check size={13} color="#fff" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Live preview card */}
      <motion.div variants={fieldItem}>
        <div style={{
          ...T.glassDeep,
          padding:    24,
          borderRadius: 18,
          marginBottom: 24,
          border:     `1px solid rgba(242,101,34,0.22)`,
          background: 'rgba(242,101,34,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.accentLight, marginBottom: 16 }}>
            Live Preview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: T.faint, marginBottom: 5 }}>Large amount</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`money-${region}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}
                >
                  {previewMoney}
                </motion.div>
              </AnimatePresence>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.faint, marginBottom: 5 }}>Small amount</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`money2-${region}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.03 }}
                  style={{ fontSize: 22, fontWeight: 800, color: T.accentLight, letterSpacing: '-0.02em' }}
                >
                  {previewMoney2}
                </motion.div>
              </AnimatePresence>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.faint, marginBottom: 5 }}>Date (1 Jun 2026)</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`date-${region}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.06 }}
                  style={{ fontSize: 22, fontWeight: 800, color: T.success, letterSpacing: '-0.02em' }}
                >
                  {previewDate}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Format details table */}
      <motion.div variants={fieldItem}>
        <div style={{ ...T.glassInput, borderRadius: 14, overflow: 'hidden' }}>
          {([
            ['Currency Symbol',     region === 'IN' ? '₹ (INR)'     : '$ (USD)'],
            ['Number Grouping',     region === 'IN' ? 'en-IN (12,34,567)' : 'en-US (1,234,567)'],
            ['Date Format',         region === 'IN' ? 'DD/MM/YYYY (en-GB)' : 'MMM D, YYYY (en-US)'],
            ['Timezone',            region === 'IN' ? 'Asia/Kolkata (IST +5:30)' : 'Browser local'],
            ['Time Display',        region === 'IN' ? '24-hour (HH:mm)' : '12-hour (h:mm AM/PM)'],
          ]).map(([label, value], i) => (
            <div
              key={label}
              style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'space-between',
                padding:         '11px 16px',
                borderBottom:    i < 4 ? `1px solid ${T.hairline}` : 'none',
              }}
            >
              <span style={{ fontSize: 13, color: T.faint }}>{label}</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={`${label}-${region}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.18 }}
                  style={{ fontSize: 13, fontWeight: 600, color: T.text }}
                >
                  {value}
                </motion.span>
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.div>

      <Divider label="Scope" />
      <motion.div variants={fieldItem}>
        <div style={{ ...T.glassInput, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Info size={14} style={{ color: T.accentLight, marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.55 }}>
            This setting applies platform-wide to all admin views, exported reports, invoices, and
            transactional emails. Individual workspace owners can override their own display preferences
            from their workspace Settings → Region.
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────────
interface ToastMsg { id: number; text: string; kind: 'success' | 'error' }

function Toast({ msg, onDone }: { msg: ToastMsg; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      variants={toastVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         10,
        padding:     '12px 18px',
        borderRadius: 12,
        background:   msg.kind === 'success' ? T.successDim : T.dangerDim,
        border:       `1px solid ${msg.kind === 'success' ? T.success : T.danger}30`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color:        msg.kind === 'success' ? T.success : T.danger,
        fontSize:     13,
        fontWeight:   600,
        boxShadow:    '0 4px 24px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      }}
    >
      {msg.kind === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {msg.text}
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────────
export function AdmSetSE1Console() {
  const [activeId,    setActiveId]    = useState<SectionId>('general');
  const [general,     setGeneral]     = useState<GeneralState>(INIT_GENERAL);
  const [warmup,      setWarmup]      = useState<WarmupState>(INIT_WARMUP);
  const [integ,       setInteg]       = useState<IntegState>(INIT_INTEG);
  const [security,    setSecurity]    = useState<SecurityState>(INIT_SECURITY);
  const [alerts,      setAlerts]      = useState<AlertState>(INIT_ALERTS);
  const [flags,       setFlags]       = useState<FlagState>(INIT_FLAGS);
  const [region,      setRegion]      = useState<Region>('IN');
  const [pending,     setPending]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toasts,      setToasts]      = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  // Track section order for slide direction
  const sectionOrder = NAV_SECTIONS.map(s => s.id);

  const directionRef = useRef(0);

  const navigateTo = useCallback((id: SectionId) => {
    const from = sectionOrder.indexOf(activeId);
    const to   = sectionOrder.indexOf(id);
    directionRef.current = to > from ? 1 : -1;
    setActiveId(id);
  }, [activeId, sectionOrder]);

  // Mark pending on any state change
  const patchGeneral  = useCallback((p: Partial<GeneralState>)  => { setGeneral(s  => ({ ...s,  ...p })); setPending(true); }, []);
  const patchWarmup   = useCallback((p: Partial<WarmupState>)   => { setWarmup(s   => ({ ...s,  ...p })); setPending(true); }, []);
  const patchInteg    = useCallback((p: Partial<IntegState>)    => { setInteg(s    => ({ ...s,  ...p })); setPending(true); }, []);
  const patchSecurity = useCallback((p: Partial<SecurityState>) => { setSecurity(s => ({ ...s,  ...p })); setPending(true); }, []);
  const patchAlerts   = useCallback((p: Partial<AlertState>)    => { setAlerts(s   => ({ ...s,  ...p })); setPending(true); }, []);
  const patchFlags    = useCallback((p: Partial<FlagState>)     => { setFlags(s    => ({ ...s,  ...p })); setPending(true); }, []);
  const patchRegion   = useCallback((r: Region) => { setRegion(r); setPending(true); }, []);

  const addToast = useCallback((text: string, kind: 'success' | 'error') => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, text, kind }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    const tid = setTimeout(() => {
      setSaving(false);
      setPending(false);
      addToast('Settings saved successfully', 'success');
    }, 1100);
    return () => clearTimeout(tid);
  }, [addToast]);

  const handleReset = useCallback(() => {
    setGeneral(INIT_GENERAL);
    setWarmup(INIT_WARMUP);
    setInteg(INIT_INTEG);
    setSecurity(INIT_SECURITY);
    setAlerts(INIT_ALERTS);
    setFlags(INIT_FLAGS);
    setRegion('IN');
    setPending(false);
    addToast('Changes discarded', 'error');
  }, [addToast]);

  // Animated bg gradient using motion value
  const gradientMv = useMotionValue(0);
  const ctrlRef    = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = animate(gradientMv, 360, {
      duration:   30,
      repeat:     Infinity,
      ease:       'linear',
    });
    return () => { ctrlRef.current?.stop(); };
  }, [gradientMv]);

  // Active nav indicator section index
  const activeIdx = sectionOrder.indexOf(activeId);

  return (
    <div style={{
      minHeight:    '100vh',
      background:   'linear-gradient(135deg, #0f0f0f 0%, #1a0d00 50%, #0f0f0f 100%)',
      fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position:   'absolute',
        top:        -200,
        right:      -200,
        width:      600,
        height:     600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(242,101,34,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position:   'absolute',
        bottom:     -150,
        left:       -150,
        width:      500,
        height:     500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,138,75,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{
          padding:     '28px 32px 20px',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${T.hairline}`,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sliders size={20} style={{ color: T.accent }} />
            Platform Settings
          </div>
          <div style={{ fontSize: 13, color: T.faint, marginTop: 3 }}>
            Super-admin configuration console · WarmPulse v2.4.1
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Pill color={T.success} bg={T.successDim} label="All systems nominal" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', ...T.glassInput, borderRadius: 10 }}>
            <Clock size={12} style={{ color: T.faint }} />
            <span style={{ fontSize: 12, color: T.faint }}>Saved {formatDate(SAMPLE_TS, { region })} · 14:32</span>
          </div>
        </div>
      </motion.div>

      {/* Body: nav + panel */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 90px)', position: 'relative' }}>

        {/* Left nav */}
        <motion.nav
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.1 }}
          style={{
            width:       240,
            flexShrink:  0,
            padding:     '24px 16px',
            borderRight: `1px solid ${T.hairline}`,
            position:    'relative',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: T.faint, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 10 }}>
            Sections
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
            {NAV_SECTIONS.map((sec, i) => {
              const active = sec.id === activeId;
              return (
                <motion.button
                  key={sec.id}
                  onClick={() => navigateTo(sec.id)}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.97 }}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.04, type: 'spring', stiffness: 280, damping: 26 }}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            10,
                    padding:        '10px 12px',
                    borderRadius:   10,
                    background:     active ? T.accentDim : 'transparent',
                    border:         'none',
                    cursor:         'pointer',
                    color:          active ? T.accent : T.dim,
                    fontWeight:     active ? 700 : 500,
                    fontSize:       13,
                    textAlign:      'left',
                    width:          '100%',
                    position:       'relative',
                    outline:        'none',
                    transition:     'background 0.2s, color 0.2s',
                  }}
                >
                  {/* Active indicator with layoutId */}
                  {active && (
                    <motion.div
                      layoutId="nav-indicator"
                      style={{
                        position:     'absolute',
                        left:         0,
                        top:          '50%',
                        transform:    'translateY(-50%)',
                        width:        3,
                        height:       22,
                        borderRadius: 99,
                        background:   T.accent,
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  <span style={{ color: active ? T.accent : T.faint, flexShrink: 0 }}>{sec.icon}</span>
                  <div>
                    <div>{sec.label}</div>
                    {active && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ fontSize: 11, color: T.accentLight, fontWeight: 400, marginTop: 1 }}
                      >
                        {sec.desc}
                      </motion.div>
                    )}
                  </div>
                  {active && <ChevronRight size={12} style={{ marginLeft: 'auto', color: T.accentLight }} />}
                </motion.button>
              );
            })}
          </div>

          {/* Nav progress indicator */}
          <div style={{ marginTop: 24, padding: '0 10px' }}>
            <div style={{ fontSize: 11, color: T.faint, marginBottom: 8 }}>
              {activeIdx + 1} of {NAV_SECTIONS.length}
            </div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${((activeIdx + 1) / NAV_SECTIONS.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})` }}
              />
            </div>
          </div>
        </motion.nav>

        {/* Panel content */}
        <div style={{ flex: 1, padding: '28px 36px 120px', minWidth: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 90px)' }}>
          <AnimatePresence mode="wait" custom={directionRef.current}>
            <motion.div
              key={activeId}
              custom={directionRef.current}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ maxWidth: 720 }}
            >
              {activeId === 'general'      && <PanelGeneral      state={general}   onChange={patchGeneral}  />}
              {activeId === 'warmup'       && <PanelWarmup        state={warmup}    onChange={patchWarmup}   />}
              {activeId === 'integrations' && <PanelIntegrations  state={integ}     onChange={patchInteg}    />}
              {activeId === 'security'     && <PanelSecurity      state={security}  onChange={patchSecurity} />}
              {activeId === 'alerts'       && <PanelAlerts        state={alerts}    onChange={patchAlerts}   />}
              {activeId === 'flags'        && <PanelFlags         state={flags}     onChange={patchFlags}    />}
              {activeId === 'region'       && <PanelRegion        region={region}   onChange={patchRegion}   />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Save bar */}
      <AnimatePresence>
        {pending && (
          <motion.div
            variants={saveBarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position:   'fixed',
              bottom:     28,
              left:       '50%',
              transform:  'translateX(-50%)',
              display:    'flex',
              alignItems: 'center',
              gap:        12,
              padding:    '12px 18px',
              ...T.glassDeep,
              border:     `1px solid rgba(242,101,34,0.30)`,
              boxShadow:  '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(242,101,34,0.12)',
              zIndex:     100,
              whiteSpace: 'nowrap',
            }}
          >
            <AlertTriangle size={15} style={{ color: T.warning }} />
            <span style={{ fontSize: 13, color: T.dim }}>You have unsaved changes</span>
            <div style={{ width: 1, height: 18, background: T.hairline }} />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleReset}
              style={{
                display:    'flex', alignItems: 'center', gap: 6,
                padding:    '7px 14px', borderRadius: 8,
                background: T.neutralDim,
                border:     '1px solid rgba(255,255,255,0.12)',
                color:      T.dim,
                cursor:     'pointer', fontSize: 13, fontWeight: 600,
                outline:    'none',
              }}
            >
              <RotateCcw size={13} /> Discard
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, background: '#FF8A4B' }}
              whileTap={{ scale: 0.96 }}
              onClick={handleSave}
              disabled={saving}
              style={{
                display:    'flex', alignItems: 'center', gap: 6,
                padding:    '7px 18px', borderRadius: 8,
                background: saving ? T.accentDim : T.accent,
                border:     'none',
                color:      '#fff',
                cursor:     saving ? 'default' : 'pointer',
                fontSize:   13, fontWeight: 700,
                outline:    'none',
                transition: 'background 0.2s',
              }}
            >
              {saving ? <RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div style={{
        position:   'fixed',
        top:        24,
        right:      24,
        display:    'flex',
        flexDirection: 'column',
        gap:        8,
        zIndex:     200,
        pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} msg={t} onDone={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Spin keyframe for saving spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
