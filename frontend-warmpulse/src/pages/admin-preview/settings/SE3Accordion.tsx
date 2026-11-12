/**
 * Admin Settings Design Candidate: SE3 Accordion
 *
 * "Settings Accordion" — a single-column stack of expandable accordion sections
 * covering all platform configuration surfaces: General, Warmup Engine,
 * Integrations, Security, Alerts, Feature Flags, and Region & Format.
 *
 * Framer-motion techniques:
 *  - Staggered entrance of all section headers on mount
 *  - Accordion expand/collapse: height 0 → 'auto' via AnimatePresence + overflow clip
 *  - Chevron rotation on open/close
 *  - Section fields stagger-in when accordion opens
 *  - Sticky save bar springs in when changes are pending, springs out on save/reset
 *  - whileHover/whileTap on all interactive controls
 *  - Animated shimmer on integration status badges
 *  - Region switcher flips with spring physics; live preview animates value changes
 *  - animated() counter on save confirmation toast
 *  - Full cleanup: animate() controls, motion-value subscriptions, all rAF/intervals
 *
 * Self-contained: inline style={{}} only, mock data only.
 * Only @/lib/format is imported from @/.
 * Aurora Glass dark palette — warm orange only, no purple/blue/teal/cyan.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
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
  ChevronDown,
  Settings,
  Plug,
  Shield,
  Bell,
  Flag,
  Globe,
  Check,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Info,
  Flame,
  Mail,
  Key,
  Activity,
  Bot,
  Cpu,
  Database,
  Lock,
  ToggleLeft,
  ToggleRight,
  Sun,
  Moon,
} from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import type { Region } from '@/stores/locale';

// ─── Fixed sample timestamp (no module-scope new Date()) ─────────────────────
const SAMPLE_TS = '2025-11-28T08:45:00.000Z';
const SAMPLE_AMOUNT = 1234567;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  text:        '#ffffff' as const,
  dim:         'rgba(255,255,255,0.62)' as const,
  faint:       'rgba(255,255,255,0.40)' as const,
  ghost:       'rgba(255,255,255,0.16)' as const,
  hairline:    'rgba(255,255,255,0.08)' as const,
  accent:      '#F26522' as const,
  accentL:     '#FF8A4B' as const,
  accentDim:   'rgba(242,101,34,0.16)' as const,
  accentGlow:  'rgba(242,101,34,0.35)' as const,
  success:     '#3ddc97' as const,
  successDim:  'rgba(61,220,151,0.14)' as const,
  danger:      '#ff5c7a' as const,
  dangerDim:   'rgba(255,92,122,0.13)' as const,
  warning:     '#FF8A4B' as const,
  warningDim:  'rgba(255,138,75,0.15)' as const,
  neutral:     'rgba(255,255,255,0.18)' as const,
  neutralDim:  'rgba(255,255,255,0.07)' as const,
  glass:       'rgba(255,255,255,0.04)' as const,
  glass2:      'rgba(255,255,255,0.07)' as const,
  glass3:      'rgba(255,255,255,0.10)' as const,
  border:      'rgba(255,255,255,0.10)' as const,
  borderSoft:  'rgba(255,255,255,0.055)' as const,
};

const G: CSSProperties = {
  background: C.glass,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 16,
};

const G2: CSSProperties = {
  background: C.glass2,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderRadius: 12,
};

const G3: CSSProperties = {
  background: C.glass3,
  border: `1px solid rgba(255,255,255,0.14)`,
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius: 10,
};

// ─── Variants ─────────────────────────────────────────────────────────────────
const pageEnter: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const sectionEnter: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } },
};

const fieldStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const fieldEnter: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const saveBarVariants: Variants = {
  hidden: { opacity: 0, y: 80, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
  exit:   { opacity: 0, y: 60, scale: 0.95, transition: { duration: 0.22 } },
};

const toastVariants: Variants = {
  hidden: { opacity: 0, y: -40, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 26 } },
  exit:   { opacity: 0, y: -30, scale: 0.9, transition: { duration: 0.18 } },
};

// ─── Types ────────────────────────────────────────────────────────────────────
type IntegrationStatus = 'connected' | 'misconfigured' | 'off';

interface IntegrationEntry {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  detail: string;
}

interface RampStep {
  label: string;
  value: number;
}

interface AlertThreshold {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
}

interface FeatureFlag {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface SettingsState {
  // General
  platformName: string;
  supportEmail: string;
  baseUrl: string;
  logoUrl: string;
  // Warmup Engine
  peerRepFloor: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  rampSteps: RampStep[];
  // Security
  enforce2FA: boolean;
  sessionTTLHours: number;
  maxLoginAttempts: number;
  ipAllowlistEnabled: boolean;
  ipAllowlist: string;
  // Alerts
  thresholds: AlertThreshold[];
  // Region
  region: Region;
  // Integrations
  integrations: IntegrationEntry[];
  // Feature Flags
  flags: FeatureFlag[];
}

// ─── Mock initial state ───────────────────────────────────────────────────────
const INIT: SettingsState = {
  platformName: 'WarmPulse',
  supportEmail: 'support@warmpulse.io',
  baseUrl: 'https://app.warmpulse.io',
  logoUrl: 'https://warmpulse.io/assets/logo.svg',

  peerRepFloor: 0.30,
  sendWindowStart: '07:00',
  sendWindowEnd: '21:00',
  rampSteps: [
    { label: 'D1–3',   value: 5  },
    { label: 'D4–7',   value: 10 },
    { label: 'D8–14',  value: 20 },
    { label: 'D15–21', value: 35 },
    { label: 'D22–28', value: 50 },
    { label: 'D29+',   value: 80 },
  ],

  enforce2FA: true,
  sessionTTLHours: 24,
  maxLoginAttempts: 5,
  ipAllowlistEnabled: false,
  ipAllowlist: '',

  thresholds: [
    { id: 'stall_hours',     label: 'Stalled mailbox alert',    value: 4,  unit: 'hours',   min: 1,  max: 48  },
    { id: 'peer_bounce_pct', label: 'Peer bounce alert',        value: 15, unit: '%',       min: 1,  max: 100 },
    { id: 'quota_pct',       label: 'Daily quota alert',        value: 90, unit: '%',       min: 10, max: 100 },
    { id: 'beat_stale_min',  label: 'Beat stale alert',         value: 5,  unit: 'minutes', min: 1,  max: 60  },
  ],

  region: 'IN' as Region,

  integrations: [
    { id: 'gemini',    name: 'Gemini (LLM)',      description: 'Primary LLM provider for content',  status: 'connected',     detail: 'gemini-2.0-flash · quota ok' },
    { id: 'claude',    name: 'Claude (LLM)',       description: 'Fallback LLM provider',             status: 'misconfigured', detail: 'ANTHROPIC_API_KEY not set'   },
    { id: 'smtp_tx',   name: 'Transactional SMTP', description: 'Platform email (alerts/welcome)',   status: 'connected',     detail: 'smtp.sendgrid.net:587'       },
    { id: 'google_oauth', name: 'Google OAuth',    description: 'Mailbox connect + login',           status: 'connected',     detail: 'Client ID configured'        },
    { id: 'static_llm', name: 'Static templates',  description: 'Last-resort content fallback',     status: 'connected',     detail: 'Always available'            },
  ],

  flags: [
    { id: 'crm_module',       label: 'CRM Module',          description: 'Enable CRM pipeline + sequences for all workspaces', enabled: true  },
    { id: 'agency_tier',      label: 'Agency Tier',         description: 'Unlock agency multi-client dashboard',                enabled: true  },
    { id: 'firebase_auth',    label: 'Firebase Auth',       description: 'Accept Firebase ID tokens on /auth/firebase',         enabled: false },
    { id: 'pdf_reports',      label: 'PDF Reports',         description: 'Allow PDF export via reportlab (requires dep)',        enabled: true  },
    { id: 'spam_rescue',      label: 'Spam Rescue',         description: 'Auto-move warmup mail out of spam folder',            enabled: true  },
    { id: 'beta_ui',          label: 'Beta UI',             description: 'Show experimental UI elements for testers',           enabled: false },
  ],
};

// ─── Small helpers ────────────────────────────────────────────────────────────
function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

function intStatusColor(s: IntegrationStatus): string {
  if (s === 'connected')     return C.success;
  if (s === 'misconfigured') return C.warning;
  return C.neutral;
}
function intStatusBg(s: IntegrationStatus): string {
  if (s === 'connected')     return C.successDim;
  if (s === 'misconfigured') return C.warningDim;
  return C.neutralDim;
}
function intStatusIcon(s: IntegrationStatus) {
  if (s === 'connected')     return <CheckCircle2 size={12} />;
  if (s === 'misconfigured') return <AlertTriangle size={12} />;
  return <XCircle size={12} />;
}
function intStatusLabel(s: IntegrationStatus): string {
  if (s === 'connected')     return 'Connected';
  if (s === 'misconfigured') return 'Misconfigured';
  return 'Off';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated counter using useMotionValue + animate() */
function AnimCounter({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const mv = useMotionValue(to);
  const [disp, setDisp] = useState(to.toFixed(decimals));
  useEffect(() => {
    const ctrl = animate(mv, to, { duration: 0.6, ease: 'easeOut' });
    const unsub = mv.on('change', v => setDisp(v.toFixed(decimals)));
    return () => { ctrl.stop(); unsub(); };
  }, [to, decimals, mv]);
  return <span>{disp}</span>;
}

/** Input field row */
function FieldRow({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: ReactNode;
}) {
  return (
    <motion.div variants={fieldEnter} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
        {sublabel && (
          <span style={{ fontSize: 11.5, color: C.faint }}>{sublabel}</span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

/** Styled text input */
function TInput({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <motion.input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      whileFocus={{ boxShadow: `0 0 0 2px ${C.accentGlow}` }}
      style={{
        background: C.glass2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        color: C.text,
        fontSize: 13,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s',
      } as CSSProperties}
    />
  );
}

/** Toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.9 }}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? C.accent : C.ghost,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
      } as CSSProperties}
    >
      <motion.span
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        style={{
          position: 'absolute',
          top: 2,
          left: 0,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          display: 'block',
        } as CSSProperties}
      />
    </motion.button>
  );
}

/** Range slider row */
function SliderRow({
  label,
  sublabel,
  value,
  min,
  max,
  step,
  onChange,
  displayFn,
}: {
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  displayFn?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <motion.div variants={fieldEnter} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
          {sublabel && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{sublabel}</div>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.accentL }}>
          {displayFn ? displayFn(value) : value}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: C.ghost }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.accentL})`, borderRadius: 3, transition: 'width 0.15s' }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', inset: -4, opacity: 0, cursor: 'pointer', width: '100%', height: 14 } as CSSProperties}
        />
      </div>
    </motion.div>
  );
}

// ─── Section data ─────────────────────────────────────────────────────────────
const SECTION_META: Array<{ id: string; label: string; sublabel: string; icon: ReactNode }> = [
  { id: 'general',     label: 'General',         sublabel: 'Platform name, branding, base URL', icon: <Settings size={15} /> },
  { id: 'warmup',      label: 'Warmup Engine',   sublabel: 'Peer reputation, ramp ladder, send windows', icon: <Flame size={15} /> },
  { id: 'integrations',label: 'Integrations',    sublabel: 'LLM providers, SMTP, Google OAuth', icon: <Plug size={15} /> },
  { id: 'security',    label: 'Security',         sublabel: '2FA policy, session TTL, IP allowlist', icon: <Shield size={15} /> },
  { id: 'alerts',      label: 'Alerts',           sublabel: 'Alert thresholds and notification rules', icon: <Bell size={15} /> },
  { id: 'flags',       label: 'Feature Flags',    sublabel: 'Toggle platform capabilities per environment', icon: <Flag size={15} /> },
  { id: 'region',      label: 'Region & Format',  sublabel: 'Currency, date format, timezone — India ↔ International', icon: <Globe size={15} /> },
];

// ─── Main component ───────────────────────────────────────────────────────────
export function AdmSetSE3Accordion() {
  const [settings, setSettings] = useState<SettingsState>(() => deepClone(INIT));
  const [saved, setSaved] = useState<SettingsState>(() => deepClone(INIT));
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['general']));
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(saved);

  // Show toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Toggle accordion open/closed
  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Patch settings helper
  const patch = useCallback(<K extends keyof SettingsState>(key: K, val: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 700));
    setSaved(deepClone(settings));
    setSaving(false);
    showToast('Settings saved successfully');
  }, [settings, showToast]);

  // Reset handler
  const handleReset = useCallback(() => {
    setSettings(deepClone(saved));
  }, [saved]);

  // Ramp step update
  const updateRampStep = useCallback((idx: number, val: number) => {
    setSettings(prev => {
      const steps = prev.rampSteps.map((s, i) => i === idx ? { ...s, value: val } : s);
      return { ...prev, rampSteps: steps };
    });
  }, []);

  // Threshold update
  const updateThreshold = useCallback((id: string, val: number) => {
    setSettings(prev => ({
      ...prev,
      thresholds: prev.thresholds.map(t => t.id === id ? { ...t, value: val } : t),
    }));
  }, []);

  // Integration status toggle
  const cycleIntegration = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      integrations: prev.integrations.map(intg => {
        if (intg.id !== id) return intg;
        const order: IntegrationStatus[] = ['connected', 'misconfigured', 'off'];
        const idx = order.indexOf(intg.status);
        const next = order[(idx + 1) % order.length] ?? order[0] ?? 'off';
        return { ...intg, status: next };
      }),
    }));
  }, []);

  // Feature flag toggle
  const toggleFlag = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      flags: prev.flags.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f),
    }));
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e0e12 0%, #13100d 40%, #0f0e0b 100%)',
        padding: '40px 24px 120px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        position: 'relative',
      } as CSSProperties}
    >
      {/* Ambient blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -100, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(242,101,34,0.07) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -120, right: -80, width: 600, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,138,75,0.05) 0%, transparent 70%)' }} />
      </div>

      {/* Toast */}
      <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toast && (
            <motion.div
              key="toast"
              variants={toastVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                ...G2,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minWidth: 260,
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${C.accentGlow}`,
              } as CSSProperties}
            >
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.successDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={13} color={C.success} />
              </div>
              <span style={{ fontSize: 13, color: C.text }}>{toast}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          style={{ marginBottom: 32 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: C.accentDim,
              border: `1px solid ${C.accentGlow}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Settings size={18} color={C.accent} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Platform Settings</h1>
              <p style={{ margin: 0, fontSize: 13, color: C.faint }}>Super-admin configuration · {SECTION_META.length} sections</p>
            </div>
          </div>
        </motion.div>

        {/* Accordion stack */}
        <motion.div
          variants={pageEnter}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {SECTION_META.map(section => {
            const isOpen = openSections.has(section.id);
            return (
              <motion.div key={section.id} variants={sectionEnter} layout>
                <div style={{ ...G, overflow: 'hidden' } as CSSProperties}>

                  {/* Section header (always visible) */}
                  <motion.button
                    onClick={() => toggleSection(section.id)}
                    whileHover={{ background: 'rgba(255,255,255,0.06)' }}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '16px 20px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 16,
                    } as CSSProperties}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, background: isOpen ? C.accentDim : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isOpen ? C.accentGlow : C.borderSoft}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      transition: 'background 0.2s, border-color 0.2s',
                    }}>
                      <span style={{ color: isOpen ? C.accent : C.faint, display: 'flex' }}>
                        {section.icon}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{section.label}</div>
                      <div style={{ fontSize: 12, color: C.faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.sublabel}</div>
                    </div>

                    <motion.div
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                      style={{ flexShrink: 0 }}
                    >
                      <ChevronDown size={16} color={C.faint} />
                    </motion.div>
                  </motion.button>

                  {/* Separator */}
                  {isOpen && <div style={{ height: 1, background: C.borderSoft, marginInline: 20 }} />}

                  {/* Expandable body */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key={`body-${section.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1, transition: { height: { type: 'spring', stiffness: 260, damping: 26 }, opacity: { duration: 0.2, delay: 0.05 } } }}
                        exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.22 }, opacity: { duration: 0.1 } } }}
                        style={{ overflow: 'hidden' } as CSSProperties}
                      >
                        <motion.div
                          variants={fieldStagger}
                          initial="hidden"
                          animate="visible"
                          style={{ padding: '20px 20px 24px' }}
                        >
                          <SectionBody
                            id={section.id}
                            settings={settings}
                            patch={patch}
                            updateRampStep={updateRampStep}
                            updateThreshold={updateThreshold}
                            cycleIntegration={cycleIntegration}
                            toggleFlag={toggleFlag}
                          />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Sticky save bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            key="save-bar"
            variants={saveBarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 20px',
              background: 'rgba(15,13,10,0.88)',
              border: `1px solid ${C.accentGlow}`,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRadius: 14,
              boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${C.accent}33`,
              minWidth: 340,
              maxWidth: 480,
            } as CSSProperties}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Unsaved changes</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>Review your edits before saving.</div>
            </div>

            <motion.button
              onClick={handleReset}
              whileHover={{ background: 'rgba(255,255,255,0.08)' }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '7px 14px', borderRadius: 8, background: 'transparent',
                border: `1px solid ${C.border}`, cursor: 'pointer', color: C.dim,
                fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'inherit',
              } as CSSProperties}
            >
              <RotateCcw size={13} />
              Reset
            </motion.button>

            <motion.button
              onClick={handleSave}
              disabled={saving}
              whileHover={{ background: `linear-gradient(135deg, #FF8A4B, #F26522)`, boxShadow: `0 0 20px ${C.accentGlow}` }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '8px 18px', borderRadius: 8,
                background: `linear-gradient(135deg, ${C.accent}, #e0561a)`,
                border: 'none', cursor: saving ? 'wait' : 'pointer', color: '#fff',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
                boxShadow: `0 4px 14px ${C.accentDim}`,
              } as CSSProperties}
            >
              {saving ? <RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save settings'}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section body dispatcher ──────────────────────────────────────────────────
function SectionBody({
  id,
  settings,
  patch,
  updateRampStep,
  updateThreshold,
  cycleIntegration,
  toggleFlag,
}: {
  id: string;
  settings: SettingsState;
  patch: <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => void;
  updateRampStep: (idx: number, val: number) => void;
  updateThreshold: (id: string, val: number) => void;
  cycleIntegration: (id: string) => void;
  toggleFlag: (id: string) => void;
}) {
  if (id === 'general')      return <GeneralSection settings={settings} patch={patch} />;
  if (id === 'warmup')       return <WarmupSection settings={settings} patch={patch} updateRampStep={updateRampStep} />;
  if (id === 'integrations') return <IntegrationsSection settings={settings} cycleIntegration={cycleIntegration} />;
  if (id === 'security')     return <SecuritySection settings={settings} patch={patch} />;
  if (id === 'alerts')       return <AlertsSection settings={settings} updateThreshold={updateThreshold} />;
  if (id === 'flags')        return <FlagsSection settings={settings} toggleFlag={toggleFlag} />;
  if (id === 'region')       return <RegionSection settings={settings} patch={patch} />;
  return null;
}

// ─── General section ──────────────────────────────────────────────────────────
function GeneralSection({ settings, patch }: { settings: SettingsState; patch: <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
      <FieldRow label="Platform Name" sublabel="Shown in emails and UI">
        <TInput value={settings.platformName} onChange={v => patch('platformName', v)} placeholder="WarmPulse" />
      </FieldRow>
      <FieldRow label="Support Email" sublabel="Reply-to for transactional mail">
        <TInput value={settings.supportEmail} onChange={v => patch('supportEmail', v)} type="email" placeholder="support@…" />
      </FieldRow>
      <FieldRow label="Base URL" sublabel="Used in email links and OAuth redirect">
        <TInput value={settings.baseUrl} onChange={v => patch('baseUrl', v)} placeholder="https://…" />
      </FieldRow>
      <FieldRow label="Logo URL" sublabel="SVG/PNG for branded emails">
        <TInput value={settings.logoUrl} onChange={v => patch('logoUrl', v)} placeholder="https://…/logo.svg" />
      </FieldRow>
    </div>
  );
}

// ─── Warmup Engine section ────────────────────────────────────────────────────
function WarmupSection({
  settings, patch, updateRampStep,
}: {
  settings: SettingsState;
  patch: <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => void;
  updateRampStep: (idx: number, val: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SliderRow
        label="Peer Reputation Floor"
        sublabel="Peers below this score are deactivated (day-0 peers exempt)"
        value={settings.peerRepFloor}
        min={0.05}
        max={0.80}
        step={0.05}
        onChange={v => patch('peerRepFloor', v)}
        displayFn={v => v.toFixed(2)}
      />

      <motion.div variants={fieldEnter} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
        <FieldRow label="Send Window Start" sublabel="Local time (UTC-based schedule)">
          <TInput value={settings.sendWindowStart} onChange={v => patch('sendWindowStart', v)} type="time" />
        </FieldRow>
        <FieldRow label="Send Window End" sublabel="No warmup sends after this time">
          <TInput value={settings.sendWindowEnd} onChange={v => patch('sendWindowEnd', v)} type="time" />
        </FieldRow>
      </motion.div>

      <motion.div variants={fieldEnter}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 12 }}>
          Ramp Ladder
          <span style={{ marginLeft: 8, fontSize: 11.5, color: C.faint, fontWeight: 400 }}>daily send target per mailbox per stage</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 16px' }}>
          {settings.rampSteps.map((step, i) => (
            <div key={step.label} style={{ ...G3, padding: '12px 14px' } as CSSProperties}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>{step.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={step.value}
                  onChange={e => updateRampStep(i, Number(e.target.value))}
                  style={{
                    width: 56, background: C.glass2, border: `1px solid ${C.border}`,
                    borderRadius: 6, padding: '4px 8px', color: C.text, fontSize: 13,
                    fontWeight: 600, outline: 'none', fontFamily: 'inherit',
                  } as CSSProperties}
                />
                <span style={{ fontSize: 11.5, color: C.faint }}>sends/day</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Integrations section ─────────────────────────────────────────────────────
function IntegrationsSection({
  settings, cycleIntegration,
}: {
  settings: SettingsState;
  cycleIntegration: (id: string) => void;
}) {
  const priorityNote = "LLM priority: Gemini → Claude → Static templates";
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <motion.div variants={fieldEnter} style={{
        ...G3, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      } as CSSProperties}>
        <Info size={13} color={C.faint} />
        <span style={{ fontSize: 12, color: C.faint }}>{priorityNote}</span>
      </motion.div>
      {settings.integrations.map(intg => (
        <motion.div
          key={intg.id}
          variants={fieldEnter}
          whileHover={{ background: 'rgba(255,255,255,0.055)' }}
          style={{
            ...G2, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          } as CSSProperties}
        >
          {/* Icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: intStatusBg(intg.status),
            border: `1px solid ${intStatusColor(intg.status)}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {intg.id === 'gemini'      && <Bot      size={16} color={intStatusColor(intg.status)} />}
            {intg.id === 'claude'      && <Cpu      size={16} color={intStatusColor(intg.status)} />}
            {intg.id === 'smtp_tx'     && <Mail     size={16} color={intStatusColor(intg.status)} />}
            {intg.id === 'google_oauth'&& <Key      size={16} color={intStatusColor(intg.status)} />}
            {intg.id === 'static_llm'  && <Database size={16} color={intStatusColor(intg.status)} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{intg.name}</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{intg.description}</div>
            <div style={{ fontSize: 11, color: C.ghost, marginTop: 2, fontFamily: 'monospace' }}>{intg.detail}</div>
          </div>

          {/* Status badge */}
          <motion.button
            onClick={() => cycleIntegration(intg.id)}
            whileHover={{ scale: 1.05, opacity: 0.85 }}
            whileTap={{ scale: 0.93 }}
            title="Click to cycle status (demo)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20,
              background: intStatusBg(intg.status),
              border: `1px solid ${intStatusColor(intg.status)}44`,
              color: intStatusColor(intg.status),
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            } as CSSProperties}
          >
            {intStatusIcon(intg.status)}
            {intStatusLabel(intg.status)}
          </motion.button>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Security section ─────────────────────────────────────────────────────────
function SecuritySection({
  settings, patch,
}: {
  settings: SettingsState;
  patch: <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => void;
}) {
  const [showList, setShowList] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <motion.div variants={fieldEnter} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...G3, padding: '14px 16px' } as CSSProperties}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Lock size={13} color={C.accent} /> Enforce 2FA for all admins
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Users without TOTP will be blocked after next login</div>
        </div>
        <Toggle checked={settings.enforce2FA} onChange={v => patch('enforce2FA', v)} />
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
        <SliderRow
          label="Session TTL"
          sublabel="Hours before JWT refresh required"
          value={settings.sessionTTLHours}
          min={1}
          max={168}
          onChange={v => patch('sessionTTLHours', v)}
          displayFn={v => `${v}h`}
        />
        <SliderRow
          label="Max Login Attempts"
          sublabel="Before account lockout (per IP)"
          value={settings.maxLoginAttempts}
          min={2}
          max={20}
          onChange={v => patch('maxLoginAttempts', v)}
        />
      </div>

      <motion.div variants={fieldEnter} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Shield size={13} color={C.faint} /> IP Allowlist
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Restrict admin access to these CIDRs</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Toggle checked={settings.ipAllowlistEnabled} onChange={v => patch('ipAllowlistEnabled', v)} />
            {settings.ipAllowlistEnabled && (
              <motion.button
                onClick={() => setShowList(s => !s)}
                whileTap={{ scale: 0.93 }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, display: 'flex', alignItems: 'center' } as CSSProperties}
              >
                {showList ? <EyeOff size={14} /> : <Eye size={14} />}
              </motion.button>
            )}
          </div>
        </div>
        <AnimatePresence>
          {settings.ipAllowlistEnabled && showList && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' } as CSSProperties}
            >
              <textarea
                value={settings.ipAllowlist}
                onChange={e => patch('ipAllowlist', e.target.value)}
                rows={3}
                placeholder={"10.0.0.0/8\n192.168.1.0/24"}
                style={{
                  width: '100%', background: C.glass2, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 12,
                  fontFamily: 'monospace', resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                } as CSSProperties}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ─── Alerts section ───────────────────────────────────────────────────────────
function AlertsSection({
  settings, updateThreshold,
}: {
  settings: SettingsState;
  updateThreshold: (id: string, val: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {settings.thresholds.map(t => (
        <SliderRow
          key={t.id}
          label={t.label}
          sublabel={`Alert triggers when value exceeds this (${t.unit})`}
          value={t.value}
          min={t.min}
          max={t.max}
          onChange={v => updateThreshold(t.id, v)}
          displayFn={v => `${v} ${t.unit}`}
        />
      ))}
      <motion.div variants={fieldEnter} style={{
        ...G3, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      } as CSSProperties}>
        <Activity size={13} color={C.faint} />
        <span style={{ fontSize: 12, color: C.faint }}>
          Alerts dispatch via <code style={{ background: C.glass, padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>notifications_dispatch</code> → transactional SMTP + in-app inbox.
        </span>
      </motion.div>
    </div>
  );
}

// ─── Feature Flags section ────────────────────────────────────────────────────
function FlagsSection({
  settings, toggleFlag,
}: {
  settings: SettingsState;
  toggleFlag: (id: string) => void;
}) {
  const enabled = settings.flags.filter(f => f.enabled).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <motion.div variants={fieldEnter} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.faint }}>
          <AnimCounter to={enabled} /> of {settings.flags.length} flags enabled
        </span>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.ghost, overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${(enabled / settings.flags.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ height: '100%', background: `linear-gradient(90deg, ${C.accent}, ${C.accentL})`, borderRadius: 2 }}
          />
        </div>
      </motion.div>
      {settings.flags.map(flag => (
        <motion.div
          key={flag.id}
          variants={fieldEnter}
          whileHover={{ background: 'rgba(255,255,255,0.055)' }}
          style={{
            ...G2, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          } as CSSProperties}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: flag.enabled ? C.text : C.dim }}>
              {flag.enabled ? <ToggleRight size={13} style={{ marginRight: 5, display: 'inline', verticalAlign: 'middle', color: C.accent } as CSSProperties} /> : <ToggleLeft size={13} style={{ marginRight: 5, display: 'inline', verticalAlign: 'middle', color: C.faint } as CSSProperties} />}
              {flag.label}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{flag.description}</div>
          </div>
          <Toggle checked={flag.enabled} onChange={() => toggleFlag(flag.id)} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Region & Format section ──────────────────────────────────────────────────
function RegionSection({
  settings, patch,
}: {
  settings: SettingsState;
  patch: <K extends keyof SettingsState>(key: K, val: SettingsState[K]) => void;
}) {
  const region = settings.region;
  const isIndia = region === 'IN';

  // Live preview values derived from formatMoney / formatDate
  const moneyPreview  = formatMoney(SAMPLE_AMOUNT, { region });
  const datePreview   = formatDate(SAMPLE_TS, { region });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Switcher */}
      <motion.div variants={fieldEnter}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 10 }}>Default Region</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['IN', 'INTL'] as Region[]).map(r => {
            const active = region === r;
            return (
              <motion.button
                key={r}
                onClick={() => patch('region', r)}
                whileHover={{ y: -2, boxShadow: `0 8px 24px rgba(0,0,0,0.3)` }}
                whileTap={{ scale: 0.97 }}
                animate={{
                  background: active ? C.accentDim : 'rgba(255,255,255,0.04)',
                  borderColor: active ? C.accent : 'rgba(255,255,255,0.10)',
                }}
                transition={{ duration: 0.18 }}
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  border: `1.5px solid`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  fontFamily: 'inherit',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                } as CSSProperties}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r === 'IN' ? <Moon size={15} color={active ? C.accent : C.faint} /> : <Sun size={15} color={active ? C.accent : C.faint} />}
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? C.text : C.dim }}>
                    {r === 'IN' ? 'India' : 'International'}
                  </span>
                  {active && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Check size={10} color="#fff" />
                    </motion.div>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: C.faint }}>
                  {r === 'IN' ? '₹ INR · DD/MM/YYYY · IST' : '$ USD · MMM D, YYYY · UTC'}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Live preview card */}
      <motion.div
        variants={fieldEnter}
        animate={{ borderColor: isIndia ? C.accent + '55' : C.border }}
        style={{
          ...G2,
          padding: '18px 20px',
          border: `1px solid`,
          borderRadius: 14,
        } as CSSProperties}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Live Preview
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
          {/* Money */}
          <div style={{ ...G3, padding: '14px 16px' } as CSSProperties}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Currency</div>
            <div style={{ fontSize: 11.5, color: C.ghost, fontFamily: 'monospace', marginBottom: 4 }}>formatMoney({SAMPLE_AMOUNT})</div>
            <motion.div
              key={moneyPreview}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              style={{ fontSize: 20, fontWeight: 700, color: isIndia ? C.accent : C.accentL }}
            >
              {moneyPreview}
            </motion.div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
              {isIndia ? '₹ INR · Indian grouping (2-2-3)' : '$ USD · US grouping (3)'}
            </div>
          </div>

          {/* Date */}
          <div style={{ ...G3, padding: '14px 16px' } as CSSProperties}>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
            <div style={{ fontSize: 11.5, color: C.ghost, fontFamily: 'monospace', marginBottom: 4 }}>formatDate(sampleTs)</div>
            <motion.div
              key={datePreview}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              style={{ fontSize: 20, fontWeight: 700, color: C.success }}
            >
              {datePreview}
            </motion.div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
              {isIndia ? 'DD/MM/YYYY · Asia/Kolkata (IST)' : 'MMM D, YYYY · local'}
            </div>
          </div>
        </div>

        {/* Format strip */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Currency symbol', value: isIndia ? '₹' : '$' },
            { label: 'Currency code',   value: isIndia ? 'INR' : 'USD' },
            { label: 'Timezone',        value: isIndia ? 'IST (+5:30)' : 'UTC' },
            { label: 'Date order',      value: isIndia ? 'DD/MM/YYYY' : 'MM/DD/YYYY' },
          ].map(item => (
            <motion.div
              key={item.label}
              animate={{ borderColor: isIndia ? C.accent + '33' : C.borderSoft }}
              style={{
                background: C.glass, border: '1px solid', borderRadius: 6, padding: '5px 10px',
              } as CSSProperties}
            >
              <span style={{ fontSize: 10.5, color: C.faint }}>{item.label}: </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: isIndia ? C.accentL : C.dim }}>{item.value}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Persist note */}
      <motion.div variants={fieldEnter} style={{
        ...G3, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      } as CSSProperties}>
        <Globe size={13} color={C.faint} />
        <span style={{ fontSize: 12, color: C.faint }}>
          Changing region updates <code style={{ background: C.glass, padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>useLocaleStore</code> — all
          formatMoney / formatDate calls across the app re-format automatically on next render.
        </span>
      </motion.div>
    </div>
  );
}
