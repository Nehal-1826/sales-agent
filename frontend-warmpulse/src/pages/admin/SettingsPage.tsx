/**
 * Admin Settings page — SE2 Settings Cards design (live, real data).
 *
 * Visual target: SE2 Settings Cards grid from admin-preview/settings/SE2Cards.tsx
 *
 * Cards → real data mapping:
 *
 *  1. General            — display-only (no dedicated admin-settings API for
 *                          platformName / supportEmail / baseUrl)
 *  2. Platform Defaults  — REAL via useAdminSettings + useUpdateDefaults
 *                          (ramp_day1/7, human_delay, from_name, reply_to)
 *  3. LLM Provider       — REAL via useAdminSettings + useUpdateLlmSettings +
 *                          useTestLlmConnection
 *  4. Google OAuth       — REAL via useAdminSettings + useUpdateOauthSettings +
 *                          useTestOauthConnection
 *  5. Security           — display-only (no editable platform security API)
 *  6. Danger Zone        — REAL via useToggleMaintenance, useRotateLlmKey,
 *                          useResetPeerPool (confirms via dialog)
 *  7. Region & Format    — REAL via RegionFormatPanel → useLocaleStore
 *
 * Palette: warm aurora glass — orange #F26522 → #FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. NO purple/blue/teal/cyan.
 *
 * Motion: framer-motion ^11 — staggered entrance, whileHover lift+glow,
 * AnimatePresence height expansion, spring save bar, cleanup on all effects.
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  Cpu,
  Shield,
  AlertTriangle,
  Globe,
  ChevronDown,
  Save,
  Check,
  X,
  CheckCircle2,
  Key,
  PlugZap,
  KeyRound,
  Loader2,
  PowerOff,
  RotateCcw,
  RefreshCw,
  Zap,
  Clock,
  Bell,
  Mail,
} from 'lucide-react';
import {
  useAdminSettings,
  useUpdateDefaults,
  useUpdateLlmSettings,
  useUpdateOauthSettings,
  useUpdateSmtpSettings,
  useTestLlmConnection,
  useTestOauthConnection,
  useTestSmtpConnection,
  useToggleMaintenance,
  useRotateLlmKey,
  useResetPeerPool,
} from '@/features/admin/settings/api';
import { RegionFormatPanel } from '@/features/settings/RegionFormatPanel';
import { TwoFactorPanel } from '@/features/settings/TwoFactorPanel';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { ExportButton } from '@/components/ui/ExportButton';
import { exportStamp, type CsvColumn } from '@/lib/exportCsv';

// ─── Settings snapshot CSV (non-secret config only) ─────────────────────────────
interface SettingSnapshotRow {
  setting: string;
  value: string;
}

const SETTINGS_SNAPSHOT_COLUMNS: CsvColumn<SettingSnapshotRow>[] = [
  { header: 'Setting', value: (r) => r.setting },
  { header: 'Value', value: (r) => r.value },
];

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

// ─── Small primitives ─────────────────────────────────────────────────────────

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
  type,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        background: readOnly ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '9px 13px',
        fontSize: mono ? 12 : 13,
        color: readOnly ? T.faint : T.text,
        fontFamily: mono ? 'monospace' : 'inherit',
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        cursor: readOnly ? 'default' : 'text',
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

function FieldGrid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
      <span style={{ ...MICRO, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );
}

type IntStatus = 'connected' | 'misconfigured' | 'off';

function StatusBadge({ status }: { status: IntStatus }) {
  const map: Record<IntStatus, { color: string; dim: string; label: string }> = {
    connected:     { color: T.success,  dim: T.successDim,  label: 'Connected' },
    misconfigured: { color: T.warning,  dim: T.warningDim,  label: 'Misconfigured' },
    off:           { color: T.faint,    dim: 'rgba(255,255,255,0.06)', label: 'Off' },
  };
  const s = map[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      background: s.dim, border: `1px solid ${s.color}44`,
      fontSize: 11, fontWeight: 600, color: s.color, flexShrink: 0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: s.color,
        boxShadow: status === 'connected' ? `0 0 4px ${s.color}` : 'none',
      }} />
      {s.label}
    </span>
  );
}

function IntRow({
  label, sub, status, icon: Icon,
}: {
  label: string; sub: string; status: IntStatus; icon: typeof Settings;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
    }}>
      <Icon size={15} strokeWidth={2} style={{ color: T.faint, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <StatusBadge status={status} />
    </div>
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
  onSave?: () => void;
  dirty?: boolean;
  children: ReactNode;
  accent?: string;
  tag?: ReactNode;
  savePending?: boolean;
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
  savePending,
}: CardProps) {
  const col = accent ?? T.accent;

  return (
    <motion.div
      variants={cardVariants}
      whileHover={expanded ? {} : { y: -3, boxShadow: `0 8px 32px rgba(0,0,0,0.28), 0 0 0 1px ${col}44` }}
      transition={{ duration: 0.2 }}
      style={{ ...T.glassCard, overflow: 'hidden', position: 'relative' }}
    >
      {/* Glow accent line */}
      <motion.div
        aria-hidden
        animate={{ opacity: expanded ? 1 : 0 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${col}, transparent)`,
          borderRadius: '18px 18px 0 0',
        }}
      />

      {/* Card header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          width: '100%', padding: '18px 20px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 38, height: 38, borderRadius: 11,
          background: `${col}22`, border: `1px solid ${col}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={17} strokeWidth={2} style={{ color: col }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
            {tag}
            {dirty && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: T.warning, flexShrink: 0,
              }} />
            )}
          </div>
          <div style={{
            fontSize: 12, color: T.dim, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
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
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.07)',
              padding: '20px 20px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {children}

              {/* Per-card save row */}
              {onSave && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 10,
                  paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    style={{
                      padding: '7px 16px', borderRadius: 9,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: T.dim, fontSize: 12, cursor: 'pointer',
                    }}
                    onClick={onToggle}
                  >
                    Close
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={onSave}
                    disabled={savePending}
                    style={{
                      padding: '7px 18px', borderRadius: 9,
                      background: dirty
                        ? `linear-gradient(135deg, ${col}, ${T.accentLight})`
                        : 'rgba(255,255,255,0.08)',
                      border: 'none',
                      color: dirty ? '#fff' : T.faint,
                      fontSize: 12, fontWeight: 600,
                      cursor: dirty && !savePending ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: savePending ? 0.7 : 1,
                    }}
                  >
                    {savePending
                      ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Save size={12} />}
                    {savePending ? 'Saving…' : 'Save'}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Ramp ladder ──────────────────────────────────────────────────────────────
function RampLadder({ rampDay1, rampDay7 }: { rampDay1: number; rampDay7: number }) {
  const steps = [
    { range: 'D1',       value: rampDay1 },
    { range: 'D4–7',     value: Math.round(rampDay1 + (rampDay7 - rampDay1) * 0.5) },
    { range: 'D7 target', value: rampDay7 },
  ];
  const max = Math.max(rampDay7, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((s) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <div key={s.range} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: T.faint, width: 60, flexShrink: 0 }}>{s.range}</span>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${T.accent}, ${T.accentLight})`,
                  borderRadius: 999,
                }}
              />
            </div>
            <span style={{
              fontSize: 11, color: T.dim, width: 36, textAlign: 'right',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>
              {s.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Danger confirm dialog ────────────────────────────────────────────────────
interface DangerActionRowProps {
  title: string;
  description: string;
  actionLabel: string;
  pending: boolean;
  onConfirm: () => void;
  icon: ReactNode;
}

function DangerActionRow({ title, description, actionLabel, pending, onConfirm, icon }: DangerActionRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (!confirming) { setConfirming(true); return; }
    if (text !== 'CONFIRM') return;
    onConfirm();
    setConfirming(false);
    setText('');
  }

  function handleCancel() {
    setConfirming(false);
    setText('');
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '12px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: T.faint }}>{description}</div>
        <AnimatePresence>
          {confirming && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginTop: 10 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='Type "CONFIRM" to enable'
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${T.danger}44`,
                    borderRadius: 8, padding: '6px 10px',
                    fontSize: 12, color: T.text, outline: 'none', flex: 1,
                    fontFamily: 'monospace',
                  }}
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClick}
                  disabled={text !== 'CONFIRM' || pending}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: text === 'CONFIRM' ? T.danger : 'rgba(255,255,255,0.07)',
                    color: text === 'CONFIRM' ? '#fff' : T.faint,
                    fontSize: 11, fontWeight: 600, cursor: text === 'CONFIRM' ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {pending ? <Loader2 size={11} /> : icon}
                  {pending ? 'Working…' : 'Confirm'}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCancel}
                  style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: T.dim, fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!confirming && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => setConfirming(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 9,
            background: T.dangerDim, border: `1px solid ${T.danger}44`,
            color: T.danger, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {icon}
          {actionLabel}
        </motion.button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

export function AdminSettingsPage() {
  const { data: adminSettings, isLoading } = useAdminSettings();
  const updateDefaults = useUpdateDefaults();
  const updateLlm = useUpdateLlmSettings();
  const updateOauth = useUpdateOauthSettings();
  const updateSmtp = useUpdateSmtpSettings();
  const testLlm = useTestLlmConnection();
  const testOauth = useTestOauthConnection();
  const testSmtp = useTestSmtpConnection();
  const toggleMaintenance = useToggleMaintenance();
  const rotateLlmKey = useRotateLlmKey();
  const resetPeerPool = useResetPeerPool();
  const { money, date } = useLocaleFormat();

  // Flatten the non-secret settings into a CSV snapshot. Masked secret fields
  // (api_key_masked, client_id_masked) are intentionally excluded.
  const snapshotRows = useMemo<SettingSnapshotRow[]>(() => {
    if (!adminSettings) return [];
    const { defaults, llm, google_oauth, danger } = adminSettings;
    return [
      { setting: 'defaults.ramp_day1', value: String(defaults.ramp_day1) },
      { setting: 'defaults.ramp_day7_target', value: String(defaults.ramp_day7_target) },
      { setting: 'defaults.human_delay_min_s', value: String(defaults.human_delay_min_s) },
      { setting: 'defaults.human_delay_max_s', value: String(defaults.human_delay_max_s) },
      { setting: 'defaults.email_from_display_name', value: defaults.email_from_display_name },
      { setting: 'defaults.reply_to', value: defaults.reply_to },
      { setting: 'defaults.warmup_log_retention_days', value: String(defaults.warmup_log_retention_days) },
      { setting: 'llm.default_cap_tokens', value: String(llm.default_cap_tokens) },
      { setting: 'llm.spend_mtd_usd', value: String(llm.spend_mtd_usd) },
      { setting: 'llm.configured', value: String(llm.configured) },
      { setting: 'google_oauth.configured', value: String(google_oauth.configured) },
      { setting: 'transactional_smtp.mode', value: adminSettings.transactional_smtp.mode },
      { setting: 'transactional_smtp.host', value: adminSettings.transactional_smtp.host },
      { setting: 'danger.maintenance_mode', value: String(danger.maintenance_mode) },
    ];
  }, [adminSettings]);

  // Track which card is expanded
  const [openCard, setOpenCard] = useState<string | null>(null);
  const toggle = useCallback((id: string) => {
    setOpenCard((c) => (c === id ? null : id));
  }, []);

  // Toast system
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toast = useCallback((msg: string, ok = true) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, ok }]);
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    return () => clearTimeout(timer);
  }, []);

  // ── Card 1: General (display-only, no backend API) ────────────────────────
  // No dirty state — no API to persist to.

  // ── Card 2: Platform Defaults (real API) ─────────────────────────────────
  const defaultsData = adminSettings?.defaults;
  const [defaults, setDefaults] = useState({
    ramp_day1: defaultsData?.ramp_day1 ?? 5,
    ramp_day7_target: defaultsData?.ramp_day7_target ?? 10,
    human_delay_min_s: defaultsData?.human_delay_min_s ?? 30,
    human_delay_max_s: defaultsData?.human_delay_max_s ?? 300,
    email_from_display_name: defaultsData?.email_from_display_name ?? '',
    reply_to: defaultsData?.reply_to ?? '',
  });
  const [defaultsClean, setDefaultsClean] = useState({ ...defaults });
  const defaultsDirty = JSON.stringify(defaults) !== JSON.stringify(defaultsClean);

  // Hydrate defaults when API data loads
  useEffect(() => {
    if (!defaultsData) return;
    const fresh = {
      ramp_day1: defaultsData.ramp_day1 ?? 5,
      ramp_day7_target: defaultsData.ramp_day7_target ?? 10,
      human_delay_min_s: defaultsData.human_delay_min_s ?? 30,
      human_delay_max_s: defaultsData.human_delay_max_s ?? 300,
      email_from_display_name: defaultsData.email_from_display_name ?? '',
      reply_to: defaultsData.reply_to ?? '',
    };
    setDefaults(fresh);
    setDefaultsClean(fresh);
  }, [
    defaultsData?.ramp_day1,
    defaultsData?.ramp_day7_target,
    defaultsData?.human_delay_min_s,
    defaultsData?.human_delay_max_s,
    defaultsData?.email_from_display_name,
    defaultsData?.reply_to,
  ]);

  async function saveDefaults() {
    try {
      await updateDefaults.mutateAsync(defaults);
      setDefaultsClean({ ...defaults });
      toast('Platform defaults saved');
    } catch {
      toast('Failed to save defaults', false);
    }
  }

  // ── Card 3: LLM Provider (real API) ──────────────────────────────────────
  const llmData = adminSettings?.llm;
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmCapTokens, setLlmCapTokens] = useState(llmData?.default_cap_tokens ?? 100_000);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const llmDirty = llmApiKey.length > 0 || llmCapTokens !== (llmData?.default_cap_tokens ?? 100_000);

  useEffect(() => {
    setLlmCapTokens(llmData?.default_cap_tokens ?? 100_000);
  }, [llmData?.default_cap_tokens]);

  async function saveLlm() {
    const payload: { api_key?: string; default_cap_tokens?: number } = {
      default_cap_tokens: llmCapTokens,
    };
    if (llmApiKey) payload.api_key = llmApiKey;
    try {
      await updateLlm.mutateAsync(payload);
      setLlmApiKey('');
      setLlmTestResult(null);
      toast('AI settings saved');
    } catch {
      toast('Failed to save AI settings', false);
    }
  }

  async function testLlmHandler() {
    setLlmTestResult(null);
    try {
      const res = await testLlm.mutateAsync();
      setLlmTestResult(res);
      if (res.ok) toast('AI key is valid');
      else toast(res.error ?? 'AI test failed', false);
    } catch {
      setLlmTestResult({ ok: false, error: 'network_error' });
      toast('AI test failed', false);
    }
  }

  // ── Card 4: Google OAuth (real API) ──────────────────────────────────────
  const oauthData = adminSettings?.google_oauth;
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthTestResult, setOauthTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const oauthDirty = oauthClientId.length > 0 || oauthClientSecret.length > 0;

  async function saveOauth() {
    const payload: { client_id?: string; client_secret?: string } = {};
    if (oauthClientId) payload.client_id = oauthClientId;
    if (oauthClientSecret) payload.client_secret = oauthClientSecret;
    if (Object.keys(payload).length === 0) {
      toast('Nothing to update — enter a new client id or secret first', false);
      return;
    }
    try {
      await updateOauth.mutateAsync(payload);
      setOauthClientId('');
      setOauthClientSecret('');
      setOauthTestResult(null);
      toast('Google OAuth login details saved');
    } catch {
      toast('Failed to save OAuth login details', false);
    }
  }

  async function testOauthHandler() {
    setOauthTestResult(null);
    try {
      const res = await testOauth.mutateAsync();
      setOauthTestResult(res);
      if (res.ok) toast('Google OAuth reachable');
      else toast(res.error ?? 'OAuth test failed', false);
    } catch {
      setOauthTestResult({ ok: false, error: 'network_error' });
      toast('OAuth test failed', false);
    }
  }

  // ── Card 5: Transactional SMTP (real API) ────────────────────────────────
  const smtpData = adminSettings?.transactional_smtp;
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpStarttls, setSmtpStarttls] = useState(true);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; error?: string; detail?: string } | null>(null);

  // Hydrate non-secret fields when API data loads; password stays write-only.
  useEffect(() => {
    if (!smtpData) return;
    setSmtpHost(smtpData.host ?? '');
    setSmtpPort(smtpData.port ?? 587);
    setSmtpUsername(smtpData.username ?? '');
    setSmtpFrom(smtpData.from_addr ?? '');
    setSmtpStarttls(smtpData.starttls ?? true);
  }, [
    smtpData?.host,
    smtpData?.port,
    smtpData?.username,
    smtpData?.from_addr,
    smtpData?.starttls,
  ]);

  const smtpDirty =
    smtpPassword.length > 0 ||
    smtpHost !== (smtpData?.host ?? '') ||
    smtpPort !== (smtpData?.port ?? 587) ||
    smtpUsername !== (smtpData?.username ?? '') ||
    smtpFrom !== (smtpData?.from_addr ?? '') ||
    smtpStarttls !== (smtpData?.starttls ?? true);

  async function saveSmtp() {
    const payload: {
      host?: string; port?: number; username?: string;
      password?: string; from_addr?: string; starttls?: boolean;
    } = {
      host: smtpHost,
      port: smtpPort,
      username: smtpUsername,
      from_addr: smtpFrom,
      starttls: smtpStarttls,
    };
    if (smtpPassword) payload.password = smtpPassword;
    try {
      await updateSmtp.mutateAsync(payload);
      setSmtpPassword('');
      setSmtpTestResult(null);
      toast('Transactional SMTP saved');
    } catch {
      toast('Failed to save SMTP settings', false);
    }
  }

  async function testSmtpHandler() {
    setSmtpTestResult(null);
    try {
      const res = await testSmtp.mutateAsync();
      setSmtpTestResult(res);
      if (res.ok) toast(res.detail ?? 'Test email sent');
      else toast(res.error ?? 'SMTP test failed', false);
    } catch {
      setSmtpTestResult({ ok: false, error: 'network_error' });
      toast('SMTP test failed', false);
    }
  }

  // ── Card: Security (display-only) ─────────────────────────────────────────
  // No editable API fields for admin platform security.

  // ── Card 6: Danger Zone (real API) ───────────────────────────────────────
  const maintenanceOn = Boolean(adminSettings?.danger?.maintenance_mode);

  // ── Global dirty for save bar ─────────────────────────────────────────────
  const anyDirty = defaultsDirty || llmDirty || oauthDirty || smtpDirty;

  // Money/date preview
  const _money = money;
  const _date = date;
  void _money; void _date; // ensure hooks are used (referenced in Region card via RegionFormatPanel)

  // ── Summary strip mock-free: show what we can from real data ─────────────
  const llmConfigured = Boolean(llmData?.configured);
  const oauthConfigured = Boolean(oauthData?.configured);
  const smtpMode = smtpData?.mode ?? 'dry_run';
  const smtpLive = smtpMode !== 'dry_run';

  return (
    <div style={{
      width: '100%', maxWidth: 1200,
      margin: '0 auto', padding: '0 4px 120px',
      color: T.text, fontFamily: 'inherit', position: 'relative',
    }}>
      {/* Background aurora blobs */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,101,34,0.07) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '5%', left: '-8%',
          width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,138,75,0.05) 0%, transparent 65%)',
        }} />
      </div>

      {/* Page header */}
      <div style={{ marginBottom: 28, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <Settings size={14} strokeWidth={2.4} style={{ color: T.accent }} />
          <span style={{ ...MICRO, color: T.accent }}>Admin · Platform Configuration</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em',
              margin: 0, lineHeight: 1.15, color: T.text,
            }}>
              Settings
            </h1>
            <p style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>
              {isLoading ? 'Loading…' : '8 configuration groups · click a card to expand and edit inline'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              rows={snapshotRows}
              columns={SETTINGS_SNAPSHOT_COLUMNS}
              filename={`admin-settings-${exportStamp()}`}
            />
            {anyDirty && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  fontSize: 11, color: T.warning,
                  background: T.warningDim,
                  border: `1px solid ${T.warning}44`,
                  borderRadius: 8, padding: '4px 10px', fontWeight: 600,
                }}
              >
                Unsaved changes
              </motion.span>
            )}
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
          gap: 16, position: 'relative', zIndex: 1,
        }}
      >
        {/* ── 1 · General (display-only) ──────────────────────────────────── */}
        <SettingsCard
          id="general"
          icon={Settings}
          title="General"
          summary="WarmPulse · warmpulse.app · read-only"
          expanded={openCard === 'general'}
          onToggle={() => toggle('general')}
        >
          <FieldGrid cols={2}>
            <Row label="Platform name">
              <TextInput value="WarmPulse" readOnly />
            </Row>
            <Row label="Support email">
              <TextInput value="support@warmpulse.app" readOnly mono />
            </Row>
            <Row label="Base URL">
              <TextInput value="https://warmpulse.app" readOnly mono />
            </Row>
            <Row label="Logo URL">
              <TextInput value="https://warmpulse.app/logo.svg" readOnly mono />
            </Row>
          </FieldGrid>
          <div style={{
            display: 'flex', gap: 10, padding: '11px 13px',
            background: T.accentDim, border: `1px solid ${T.accent}33`,
            borderRadius: 11,
          }}>
            <RefreshCw size={13} strokeWidth={2.2} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: T.dim }}>
              Platform name and URLs are set via environment variables at deploy time.
              Edit <code style={{ color: T.accent }}>backend/.env.docker</code> to change them.
            </div>
          </div>
        </SettingsCard>

        {/* ── 2 · Platform Defaults (real API) ─────────────────────────────── */}
        <SettingsCard
          id="defaults"
          icon={Flame}
          title="Platform Defaults"
          summary={`Build-up D1: ${defaults.ramp_day1} · D7 target: ${defaults.ramp_day7_target} · Delay: ${defaults.human_delay_min_s}–${defaults.human_delay_max_s}s`}
          expanded={openCard === 'defaults'}
          onToggle={() => toggle('defaults')}
          onSave={saveDefaults}
          dirty={defaultsDirty}
          savePending={updateDefaults.isPending}
          accent={T.accentLight}
        >
          <Divider label="Daily build-up settings" />
          <FieldGrid cols={2}>
            <Row label="Day 1 sends (ramp_day1)">
              <NumberInput
                value={defaults.ramp_day1}
                onChange={(v) => setDefaults((d) => ({ ...d, ramp_day1: v }))}
                min={1} max={100}
              />
            </Row>
            <Row label="Day 7 target (ramp_day7_target)">
              <NumberInput
                value={defaults.ramp_day7_target}
                onChange={(v) => setDefaults((d) => ({ ...d, ramp_day7_target: v }))}
                min={1} max={200}
              />
            </Row>
          </FieldGrid>
          <RampLadder rampDay1={defaults.ramp_day1} rampDay7={defaults.ramp_day7_target} />

          <Divider label="Human delay" />
          <FieldGrid cols={2}>
            <Row label="Min delay (seconds)">
              <NumberInput
                value={defaults.human_delay_min_s}
                onChange={(v) => setDefaults((d) => ({ ...d, human_delay_min_s: v }))}
                min={1} max={3600}
              />
            </Row>
            <Row label="Max delay (seconds)">
              <NumberInput
                value={defaults.human_delay_max_s}
                onChange={(v) => setDefaults((d) => ({ ...d, human_delay_max_s: v }))}
                min={1} max={3600}
              />
            </Row>
          </FieldGrid>

          <Divider label="Email identity" />
          <FieldGrid cols={1}>
            <Row label="Default from-name">
              <TextInput
                value={defaults.email_from_display_name}
                onChange={(v) => setDefaults((d) => ({ ...d, email_from_display_name: v }))}
                placeholder="Jane from WarmPulse"
              />
            </Row>
            <Row label="Reply-to address">
              <TextInput
                value={defaults.reply_to}
                onChange={(v) => setDefaults((d) => ({ ...d, reply_to: v }))}
                placeholder="reply@warmpulse.io"
                mono
              />
            </Row>
          </FieldGrid>
        </SettingsCard>

        {/* ── 3 · LLM Provider (real API) ──────────────────────────────────── */}
        <SettingsCard
          id="llm"
          icon={Cpu}
          title="AI Provider"
          summary={llmConfigured
            ? `Key: ${llmData?.api_key_masked ?? '…'} · Cap: ${(llmCapTokens).toLocaleString()} tokens/mo`
            : 'API key not configured'}
          expanded={openCard === 'llm'}
          onToggle={() => toggle('llm')}
          onSave={saveLlm}
          dirty={llmDirty}
          savePending={updateLlm.isPending}
          tag={
            <StatusBadge status={llmConfigured ? 'connected' : 'misconfigured'} />
          }
        >
          <IntRow label="Google Gemini" sub="Primary content generation" status={llmConfigured ? 'connected' : 'misconfigured'} icon={Cpu} />
          <IntRow label="Anthropic Claude" sub="Fallback provider" status={llmConfigured ? 'connected' : 'off'} icon={Cpu} />
          <IntRow label="Static templates" sub="Last-resort fallback · always available" status="connected" icon={Cpu} />

          <Divider label="API key" />
          <FieldGrid cols={2}>
            <Row label="API key">
              <TextInput
                value={llmApiKey}
                onChange={setLlmApiKey}
                type="password"
                placeholder={llmData?.api_key_masked ? `Current: ${llmData.api_key_masked}` : 'Paste Anthropic / Gemini API key'}
                mono
              />
            </Row>
            <Row label="Default cap (tokens/month)">
              <NumberInput
                value={llmCapTokens}
                onChange={setLlmCapTokens}
                min={1000}
                step={1000}
              />
            </Row>
          </FieldGrid>

          {/* LLM spend */}
          {llmData && (
            <div style={{
              padding: '11px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>Month-to-date spend</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
                ${(llmData.spend_mtd_usd ?? 0).toFixed(2)}
              </div>
            </div>
          )}

          {/* Test result */}
          <AnimatePresence>
            {llmTestResult && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex', gap: 10, padding: '10px 13px',
                  background: llmTestResult.ok ? T.successDim : T.dangerDim,
                  border: `1px solid ${llmTestResult.ok ? T.success : T.danger}33`,
                  borderRadius: 11,
                }}
              >
                {llmTestResult.ok
                  ? <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: T.success, flexShrink: 0 }} />
                  : <X size={14} strokeWidth={2.2} style={{ color: T.danger, flexShrink: 0 }} />}
                <div style={{ fontSize: 11, color: T.dim }}>
                  {llmTestResult.ok
                    ? 'AI key accepted — ready for content generation.'
                    : `Test failed: ${llmTestResult.error ?? 'unknown error'}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={testLlmHandler}
              disabled={testLlm.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: T.dim, fontSize: 12, cursor: 'pointer',
                opacity: testLlm.isPending ? 0.6 : 1,
              }}
            >
              {testLlm.isPending ? <Loader2 size={12} /> : <PlugZap size={12} />}
              {testLlm.isPending ? 'Testing…' : 'Test key'}
            </motion.button>
          </div>
        </SettingsCard>

        {/* ── 4 · Google OAuth (real API) ───────────────────────────────────── */}
        <SettingsCard
          id="oauth"
          icon={Key}
          title="Google OAuth"
          summary={oauthConfigured
            ? `Client ID: ${oauthData?.client_id_masked ?? '…'}`
            : 'Not configured — mailbox connect will fail'}
          expanded={openCard === 'oauth'}
          onToggle={() => toggle('oauth')}
          onSave={saveOauth}
          dirty={oauthDirty}
          savePending={updateOauth.isPending}
          accent={T.success}
          tag={
            <StatusBadge status={oauthConfigured ? 'connected' : 'misconfigured'} />
          }
        >
          <IntRow
            label="Google OAuth 2.0"
            sub="Mailbox-connect · Firebase ID verification"
            status={oauthConfigured ? 'connected' : 'misconfigured'}
            icon={Key}
          />

          <Divider label="Login details" />
          <FieldGrid cols={2}>
            <Row label="Client ID">
              <TextInput
                value={oauthClientId}
                onChange={setOauthClientId}
                placeholder={oauthData?.client_id_masked || '1234567890-abc.apps.googleusercontent.com'}
                mono
              />
            </Row>
            <Row label="Client secret">
              <TextInput
                value={oauthClientSecret}
                onChange={setOauthClientSecret}
                type="password"
                placeholder="••••••••••••"
                mono
              />
            </Row>
          </FieldGrid>

          {/* Test result */}
          <AnimatePresence>
            {oauthTestResult && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex', gap: 10, padding: '10px 13px',
                  background: oauthTestResult.ok ? T.successDim : T.dangerDim,
                  border: `1px solid ${oauthTestResult.ok ? T.success : T.danger}33`,
                  borderRadius: 11,
                }}
              >
                {oauthTestResult.ok
                  ? <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: T.success, flexShrink: 0 }} />
                  : <X size={14} strokeWidth={2.2} style={{ color: T.danger, flexShrink: 0 }} />}
                <div style={{ fontSize: 11, color: T.dim }}>
                  {oauthTestResult.ok
                    ? 'Google OAuth login details look healthy.'
                    : `Test failed: ${oauthTestResult.error ?? 'unknown error'}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={testOauthHandler}
              disabled={testOauth.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: T.dim, fontSize: 12, cursor: 'pointer',
                opacity: testOauth.isPending ? 0.6 : 1,
              }}
            >
              {testOauth.isPending ? <Loader2 size={12} /> : <PlugZap size={12} />}
              {testOauth.isPending ? 'Testing…' : 'Test connection'}
            </motion.button>
          </div>
        </SettingsCard>

        {/* ── 5 · Transactional SMTP (real API) ─────────────────────────────── */}
        <SettingsCard
          id="smtp"
          icon={Mail}
          title="Transactional Email (SMTP)"
          summary={
            smtpMode === 'admin'
              ? `Live · ${smtpData?.host ?? ''}`
              : smtpMode === 'env'
                ? `Live via env · ${smtpData?.env_host ?? ''}`
                : 'Dry-run — emails are logged, not delivered'
          }
          expanded={openCard === 'smtp'}
          onToggle={() => toggle('smtp')}
          onSave={saveSmtp}
          dirty={smtpDirty}
          savePending={updateSmtp.isPending}
          accent={smtpLive ? T.success : T.warning}
          tag={<StatusBadge status={smtpLive ? 'connected' : 'misconfigured'} />}
        >
          <IntRow
            label="Welcome · alerts · 2FA · billing emails"
            sub={
              smtpMode === 'admin'
                ? 'Sending via the server configured below'
                : smtpMode === 'env'
                  ? 'Sending via TRANSACTIONAL_SMTP_* env vars — settings below override them'
                  : 'No SMTP server — every send is logged and skipped'
            }
            status={smtpLive ? 'connected' : 'misconfigured'}
            icon={Mail}
          />

          <Divider label="Server" />
          <FieldGrid cols={2}>
            <Row label="Host">
              <TextInput
                value={smtpHost}
                onChange={setSmtpHost}
                placeholder="smtp.zoho.in"
                mono
              />
            </Row>
            <Row label="Port">
              <NumberInput value={smtpPort} onChange={setSmtpPort} min={1} max={65535} />
            </Row>
            <Row label="Username">
              <TextInput
                value={smtpUsername}
                onChange={setSmtpUsername}
                placeholder="alerts@yourdomain.com"
                mono
              />
            </Row>
            <Row label="Password">
              <TextInput
                value={smtpPassword}
                onChange={setSmtpPassword}
                type="password"
                placeholder={smtpData?.password_masked || '••••••••••••'}
                mono
              />
            </Row>
            <Row label="From address">
              <TextInput
                value={smtpFrom}
                onChange={setSmtpFrom}
                placeholder="WarmPulse <alerts@yourdomain.com>"
                mono
              />
            </Row>
            <Row label="STARTTLS">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setSmtpStarttls((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 13px', borderRadius: 10, width: '100%',
                  background: smtpStarttls ? T.successDim : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${smtpStarttls ? `${T.success}55` : 'rgba(255,255,255,0.12)'}`,
                  color: smtpStarttls ? T.success : T.dim,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                <Shield size={13} strokeWidth={2.2} />
                {smtpStarttls ? 'Enabled (recommended)' : 'Disabled'}
              </motion.button>
            </Row>
          </FieldGrid>

          {/* Test result */}
          <AnimatePresence>
            {smtpTestResult && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  display: 'flex', gap: 10, padding: '10px 13px',
                  background: smtpTestResult.ok ? T.successDim : T.dangerDim,
                  border: `1px solid ${smtpTestResult.ok ? T.success : T.danger}33`,
                  borderRadius: 11,
                }}
              >
                {smtpTestResult.ok
                  ? <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: T.success, flexShrink: 0 }} />
                  : <X size={14} strokeWidth={2.2} style={{ color: T.danger, flexShrink: 0 }} />}
                <div style={{ fontSize: 11, color: T.dim }}>
                  {smtpTestResult.ok
                    ? (smtpTestResult.detail ?? 'Test email sent — check your inbox.')
                    : `Test failed: ${smtpTestResult.error ?? 'unknown error'}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={testSmtpHandler}
              disabled={testSmtp.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: T.dim, fontSize: 12, cursor: 'pointer',
                opacity: testSmtp.isPending ? 0.6 : 1,
              }}
            >
              {testSmtp.isPending ? <Loader2 size={12} /> : <PlugZap size={12} />}
              {testSmtp.isPending ? 'Sending…' : 'Send test email to me'}
            </motion.button>
          </div>
        </SettingsCard>

        {/* ── 6 · Security (display-only) ───────────────────────────────────── */}
        <SettingsCard
          id="security"
          icon={Shield}
          title="Security"
          summary="Enable 2FA · Fernet credential encryption · MultiFernet rotation"
          expanded={openCard === 'security'}
          onToggle={() => toggle('security')}
          accent={T.success}
        >
          {/* Your-account 2FA enrol — the actual working control (was missing). */}
          <Divider label="Your account · two-factor authentication" />
          <TwoFactorPanel />

          {/* Security posture summary */}
          <div style={{
            display: 'flex', gap: 10, padding: '12px 14px',
            background: T.successDim, border: `1px solid ${T.success}33`,
            borderRadius: 12,
          }}>
            <CheckCircle2 size={15} strokeWidth={2.2} style={{ color: T.success, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, color: T.success, fontWeight: 600 }}>Security posture: Strong</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                2FA on · short sessions · Fernet credential encryption · MultiFernet rotation ready
              </div>
            </div>
          </div>

          <Divider label="Credential encryption" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'At-rest encryption', value: 'Fernet (AES-128-CBC + HMAC-SHA256)', ok: true },
              { label: 'Key rotation', value: 'MultiFernet · comma-separated FERNET_KEY', ok: true },
              { label: 'Plaintext lifetime', value: 'Local variable only · explicitly cleared after use', ok: true },
              { label: 'JWT secret', value: 'JWT_SECRET env var · 64-byte random', ok: true },
              { label: 'TOTP', value: 'RFC-6238 · 6-digit · 30s window · per-user QR enrollment', ok: true },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle2 size={13} strokeWidth={2.2} style={{ color: item.ok ? T.success : T.warning, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: T.faint }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: T.faint, padding: '6px 0' }}>
            Security parameters (bcrypt rounds, session TTL, lockout thresholds) are set via
            environment variables. Use <code style={{ color: T.accentLight }}>JWT_SECRET</code> and <code style={{ color: T.accentLight }}>FERNET_KEY</code> in{' '}
            <code style={{ color: T.accentLight }}>backend/.env.docker</code>.
          </div>
        </SettingsCard>

        {/* ── 6 · Danger Zone (real API) ────────────────────────────────────── */}
        <SettingsCard
          id="danger"
          icon={AlertTriangle}
          title="Danger Zone"
          summary={maintenanceOn
            ? 'MAINTENANCE MODE ON · warmup paused'
            : 'Destructive ops · each action requires CONFIRM'}
          expanded={openCard === 'danger'}
          onToggle={() => toggle('danger')}
          accent={T.danger}
          tag={maintenanceOn ? (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: T.dangerDim, border: `1px solid ${T.danger}44`,
              borderRadius: 6, padding: '2px 7px', color: T.danger,
            }}>
              Maintenance
            </span>
          ) : undefined}
        >
          <div style={{
            display: 'flex', gap: 10, padding: '11px 13px',
            background: T.dangerDim, border: `1px solid ${T.danger}33`,
            borderRadius: 11, marginBottom: 4,
          }}>
            <AlertTriangle size={14} strokeWidth={2.2} style={{ color: T.danger, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: T.dim }}>
              Every action below is audited. Type <code style={{ color: T.danger }}>CONFIRM</code> inline before it will execute.
            </div>
          </div>

          <DangerActionRow
            title={maintenanceOn ? 'Leave maintenance mode' : 'Enter maintenance mode'}
            description={maintenanceOn
              ? 'Resumes the API, Celery worker, and warmup cycles for all customers.'
              : 'Puts the API into read-only mode, pauses Celery workers and halts all outbound warmup sends.'}
            actionLabel={maintenanceOn ? 'Leave maintenance' : 'Enter maintenance'}
            pending={toggleMaintenance.isPending}
            icon={<PowerOff size={11} />}
            onConfirm={() => {
              toggleMaintenance.mutate(!maintenanceOn, {
                onSuccess: () => toast(maintenanceOn ? 'Maintenance mode disabled' : 'Maintenance mode enabled'),
                onError: () => toast('Failed to toggle maintenance mode', false),
              });
            }}
          />

          <DangerActionRow
            title="Rotate AI API key"
            description="Generates a new key, replaces the encrypted key in the DB, and invalidates pending jobs."
            actionLabel="Rotate key"
            pending={rotateLlmKey.isPending}
            icon={<KeyRound size={11} />}
            onConfirm={() => {
              rotateLlmKey.mutate(undefined, {
                onSuccess: () => toast('AI key rotated'),
                onError: () => toast('Key rotation failed', false),
              });
            }}
          />

          <DangerActionRow
            title="Reset account group health counters"
            description="Zeroes trust scores, send counters, and last-used timestamps on every test account."
            actionLabel="Reset counters"
            pending={resetPeerPool.isPending}
            icon={<RotateCcw size={11} />}
            onConfirm={() => {
              resetPeerPool.mutate(undefined, {
                onSuccess: () => toast('Account group counters reset'),
                onError: () => toast('Reset failed', false),
              });
            }}
          />
        </SettingsCard>

        {/* ── 7 · Region & Format (real locale store) ───────────────────────── */}
        <SettingsCard
          id="region"
          icon={Globe}
          title="Region & Format"
          summary="Controls ₹/$ + DD/MM/YYYY format across the admin UI"
          expanded={openCard === 'region'}
          onToggle={() => toggle('region')}
          accent={T.success}
        >
          {/*
            RegionFormatPanel is the EXISTING shared component wired to useLocaleStore.
            It persists region to localStorage (key: 'wp-locale') and re-renders
            every component using useLocaleFormat() when region changes.
            We inject inline styles to match the SE2 dark glass palette.
          */}
          <div style={{
            '--rfp-bg': 'transparent',
            '--rfp-card-bg': 'rgba(255,255,255,0.04)',
            '--rfp-border': 'rgba(255,255,255,0.10)',
            '--rfp-text': '#ffffff',
            '--rfp-text-dim': 'rgba(255,255,255,0.62)',
            '--rfp-accent': T.accent,
          } as CSSProperties}>
            <RegionFormatPanel />
          </div>

          <div style={{
            display: 'flex', gap: 10, padding: '11px 14px',
            background: T.accentDim, border: `1px solid ${T.accent}33`,
            borderRadius: 11,
          }}>
            <RefreshCw size={13} strokeWidth={2.2} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: T.dim }}>
              Region applies to all <code style={{ color: T.accent }}>money()</code> / <code style={{ color: T.accent }}>date()</code> calls platform-wide via{' '}
              <code style={{ color: T.accent }}>useLocaleFormat()</code>.
              Persists to <code style={{ color: T.accent }}>localStorage</code> key <code style={{ color: T.accent }}>wp-locale</code>.
            </div>
          </div>
        </SettingsCard>
      </motion.div>

      {/* ── Engine summary strip ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5 }}
        style={{
          ...T.glass, marginTop: 20, padding: '16px 20px',
          display: 'flex', gap: 0, flexWrap: 'wrap',
          position: 'relative', zIndex: 1,
        }}
      >
        {([
          { icon: Cpu,      label: 'AI',            value: llmConfigured ? 'Configured' : 'Missing key',  color: llmConfigured ? T.success : T.warning },
          { icon: Key,      label: 'OAuth',          value: oauthConfigured ? 'Configured' : 'Not set',   color: oauthConfigured ? T.success : T.warning },
          { icon: Shield,   label: 'Encryption',     value: 'Fernet on',    color: T.success },
          { icon: Bell,     label: 'Alerts',         value: ':10 hourly',   color: T.dim },
          { icon: Zap,      label: 'Beat',           value: 'Heartbeat',    color: T.accentLight },
          { icon: Clock,    label: 'Next outbound',  value: 'Every 15 min', color: T.dim },
          {
            icon: Mail,
            label: 'SMTP',
            value: smtpMode === 'dry_run' ? 'Dry-run' : smtpMode === 'env' ? 'Live · env' : 'Live',
            color: smtpLive ? T.success : T.warning,
          },
        ] as const).map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={{
              flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 6,
              padding: '8px 16px',
              borderRight: i < 6 ? '1px solid rgba(255,255,255,0.07)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={12} strokeWidth={2.2} style={{ color: item.color }} />
                <span style={{ ...MICRO }}>{item.label}</span>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700, color: item.color,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {item.value}
              </div>
            </div>
          );
        })}
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
              position: 'fixed', bottom: 28, left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 24px',
              background: 'rgba(18,18,28,0.92)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
              minWidth: 340,
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: T.warning, boxShadow: `0 0 8px ${T.warning}`, flexShrink: 0,
            }} />
            <span style={{ flex: 1, fontSize: 13, color: T.dim }}>
              You have <strong style={{ color: T.text }}>unsaved changes</strong> across settings
            </span>
            <span style={{ fontSize: 11, color: T.faint }}>
              Save each card individually
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast notifications ───────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 24, right: 24,
        zIndex: 200,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px',
                background: 'rgba(18,18,28,0.94)',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: `1px solid ${t.ok ? T.success : T.danger}44`,
                borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.38)',
                fontSize: 13, color: T.text, pointerEvents: 'auto', minWidth: 220,
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

      {/* Inline spinner keyframes — only for button loading states */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AdminSettingsPage;
