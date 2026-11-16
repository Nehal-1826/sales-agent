/**
 * Admin Settings Design Candidate: SE4 Control Panel / Cockpit
 *
 * "Control Panel" — a cockpit-style platform-settings dashboard:
 *   - Top row: integration health tiles (LLM / SMTP / Google OAuth / Redis / DB)
 *     with pulsing status dots + staggered framer-motion entrance
 *   - Grouped quick-toggle panels (Warmup Engine, Security, Alerts, Feature Flags)
 *     with spring switches; editing reveals an AnimatePresence save bar
 *   - Region & Format control with live ₹/$ + date format preview
 *   - whileHover / whileTap throughout; staggered entrance variants
 *   - Toast on save; full cleanup in useEffect
 *
 * Self-contained: only @/lib/format used. Inline style={{}} only. Mock data.
 * Dark Aurora Glass palette — accent #F26522/#FF8A4B, success #3ddc97,
 * danger #ff5c7a, warning #FF8A4B. No purple/violet/blue/teal/cyan/indigo/pink.
 *
 * BUILD-SAFETY: no unused imports/vars, all array accesses guarded, Variants typed,
 * animate() controls cleaned up, motion-value subscriptions cleaned up.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  AlertTriangle,
  Bell,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Database,
  Flag,
  Globe,
  Key,
  Mail,
  RefreshCcw,
  Save,
  Server,
  Settings,
  Shield,
  Sliders,
  ToggleLeft,
  Wifi,
  X,
  Zap,
  type LucideProps,
} from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import type { Region } from '@/stores/locale';

// ─── Fixed sample timestamp — NO new Date() at module scope ──────────────────
const SAMPLE_TS     = '2026-05-15T09:30:00.000Z';
const SAMPLE_AMOUNT = 1234567;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  text:        '#ffffff',
  dim:         'rgba(255,255,255,0.62)',
  faint:       'rgba(255,255,255,0.38)',
  ghost:       'rgba(255,255,255,0.16)',
  accent:      '#F26522',
  accent2:     '#FF8A4B',
  success:     '#3ddc97',
  successDim:  'rgba(61,220,151,0.13)',
  successBrd:  'rgba(61,220,151,0.28)',
  danger:      '#ff5c7a',
  dangerDim:   'rgba(255,92,122,0.13)',
  dangerBrd:   'rgba(255,92,122,0.28)',
  warning:     '#FF8A4B',
  warningDim:  'rgba(255,138,75,0.13)',
  warningBrd:  'rgba(255,138,75,0.28)',
  glass:       'rgba(255,255,255,0.05)',
  glass2:      'rgba(255,255,255,0.085)',
  glass3:      'rgba(255,255,255,0.11)',
  border:      'rgba(255,255,255,0.10)',
  borderSoft:  'rgba(255,255,255,0.06)',
} as const;

// ─── Shared style helpers ─────────────────────────────────────────────────────
const cardStyle: CSSProperties = {
  background:           C.glass,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius:         16,
};

const innerCardStyle: CSSProperties = {
  background:           C.glass2,
  border:               `1px solid ${C.border}`,
  backdropFilter:       'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius:         12,
};

// ─── Animation variants ───────────────────────────────────────────────────────
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

const staggerContainer: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.065 } },
};

const slideIn: Variants = {
  hidden: { opacity: 0, x: -12 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
};

const saveBarVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1,    transition: { type: 'spring', stiffness: 420, damping: 32 } },
  exit:   { opacity: 0, y: 8,  scale: 0.97, transition: { duration: 0.22 } },
};

const toastVariants: Variants = {
  hidden: { opacity: 0, y: -20, scale: 0.96 },
  show:   { opacity: 1, y: 0,   scale: 1,    transition: { type: 'spring', stiffness: 440, damping: 30 } },
  exit:   { opacity: 0, y: -12, scale: 0.96, transition: { duration: 0.2 } },
};

const pageStagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
};

// ─── Lucide icon type ─────────────────────────────────────────────────────────
type LucideIcon = React.FC<LucideProps>;

// ─── Animated counter hook ────────────────────────────────────────────────────
function useAnimatedCounter(target: number, decimals = 0): string {
  const mv      = useMotionValue(0);
  const [display, setDisplay] = useState(() => target.toFixed(decimals));

  useEffect(() => {
    const ctrl = animate(mv, target, {
      duration: 1.2,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v.toFixed(decimals)),
    });
    return () => ctrl.stop();
  }, [mv, target, decimals]);

  return display;
}

// ─── Integration health data ──────────────────────────────────────────────────
type IntStatus = 'connected' | 'degraded' | 'misconfigured' | 'down';

interface Integration {
  id:      string;
  label:   string;
  sub:     string;
  status:  IntStatus;
  latency: string;
  Icon:    LucideIcon;
}

const INTEGRATIONS: Integration[] = [
  { id: 'llm',   label: 'LLM Provider',  sub: 'Gemini 2.0 Flash',    status: 'connected',  latency: '142ms', Icon: BrainCircuit },
  { id: 'smtp',  label: 'SMTP',          sub: 'Transactional mail',   status: 'connected',  latency: '38ms',  Icon: Mail },
  { id: 'oauth', label: 'Google OAuth',  sub: 'Mailbox connect flow', status: 'degraded',   latency: '290ms', Icon: Key },
  { id: 'redis', label: 'Redis',         sub: 'warmpulse: prefix',    status: 'connected',  latency: '2ms',   Icon: Zap },
  { id: 'db',    label: 'Database',      sub: 'Postgres · pool 10',   status: 'connected',  latency: '4ms',   Icon: Database },
];

function intColor(s: IntStatus):  string { return s === 'connected' ? C.success : s === 'down' ? C.danger : C.warning; }
function intBg(s: IntStatus):     string { return s === 'connected' ? C.successDim : s === 'down' ? C.dangerDim : C.warningDim; }
function intBrd(s: IntStatus):    string { return s === 'connected' ? C.successBrd : s === 'down' ? C.dangerBrd : C.warningBrd; }
function intLabel(s: IntStatus):  string { return s === 'connected' ? 'Connected' : s === 'degraded' ? 'Degraded' : s === 'misconfigured' ? 'Misconfigured' : 'Down'; }

// ─── Pulsing status dot ───────────────────────────────────────────────────────
function PulseDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
      <motion.span
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: 0.35 }}
        animate={{ scale: [1, 1.9, 1], opacity: [0.35, 0, 0.35] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span style={{
        position: 'relative', zIndex: 1, width: 10, height: 10,
        borderRadius: '50%', background: color, display: 'block',
      }} />
    </span>
  );
}

// ─── Spring toggle switch ─────────────────────────────────────────────────────
function SpringToggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 12, padding: 0, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : C.ghost,
        position: 'relative', flexShrink: 0, opacity: disabled ? 0.45 : 1, outline: 'none',
        boxShadow: on ? `0 0 0 1px ${C.accent}44` : 'none',
      }}
      whileHover={disabled ? {} : { scale: 1.06 }}
      whileTap={disabled ? {} : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      aria-pressed={on}
    >
      <motion.span
        layout
        style={{
          position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
        animate={{ left: on ? 23 : 3 }}
        transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      />
    </motion.button>
  );
}

// ─── Input row ────────────────────────────────────────────────────────────────
function InputRow({ label, value, onChange, hint, mono }: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  hint?:    string;
  mono?:    boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.dim, letterSpacing: '0.04em' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: C.glass2, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.text, fontSize: 13, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
          padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
          transition: 'border-color 0.18s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = C.accent + '88'; }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = C.border; }}
      />
      {hint && <span style={{ fontSize: 10, color: C.faint }}>{hint}</span>}
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 14px', background: C.glass, border: `1px solid ${C.borderSoft}`,
        borderRadius: 10, cursor: 'pointer',
      }}
      onClick={() => onChange(!on)}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      <SpringToggle on={on} onChange={onChange} />
    </div>
  );
}

// ─── Numeric stepper ─────────────────────────────────────────────────────────
function NumericRow({ label, sub, value, min, max, step, unit, onChange }: {
  label:    string;
  sub?:     string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  unit?:    string;
  onChange: (v: number) => void;
}) {
  const displayed = useAnimatedCounter(value, step < 1 ? 1 : 0);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 14px', background: C.glass, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <motion.button
          type="button"
          style={{
            width: 26, height: 26, borderRadius: 6, background: C.glass2,
            border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer',
            fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          whileHover={{ scale: 1.12, background: C.glass3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(parseFloat(Math.max(min, value - step).toFixed(10)))}
          disabled={value <= min}
        >−</motion.button>
        <span style={{
          minWidth: 52, textAlign: 'center', fontSize: 14, fontWeight: 800, color: C.text,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {displayed}
          {unit ? <span style={{ fontSize: 11, color: C.dim, fontWeight: 400, marginLeft: 2 }}>{unit}</span> : null}
        </span>
        <motion.button
          type="button"
          style={{
            width: 26, height: 26, borderRadius: 6, background: C.glass2,
            border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer',
            fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          whileHover={{ scale: 1.12, background: C.glass3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(parseFloat(Math.min(max, value + step).toFixed(10)))}
          disabled={value >= max}
        >+</motion.button>
      </div>
    </div>
  );
}

// ─── Select row ───────────────────────────────────────────────────────────────
function SelectRow({ label, sub, value, options, onChange }: {
  label:    string;
  sub?:     string;
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 14px', background: C.glass, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            appearance: 'none', background: C.glass2, border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.text, fontSize: 12, fontWeight: 600,
            padding: '6px 28px 6px 10px', cursor: 'pointer', outline: 'none',
          }}
        >
          {options.map((o) => (
            <option key={o} value={o} style={{ background: '#1a1020' }}>{o}</option>
          ))}
        </select>
        <ChevronDown size={12} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          color: C.faint, pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

// ─── Save bar ─────────────────────────────────────────────────────────────────
function SaveBar({ sectionName, onSave, onDiscard }: { sectionName: string; onSave: () => void; onDiscard: () => void }) {
  return (
    <motion.div
      variants={saveBarVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        position: 'sticky', bottom: 12, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 18px', marginTop: 12,
        background: `linear-gradient(135deg, rgba(242,101,34,0.18), rgba(255,138,75,0.14))`,
        border: `1px solid ${C.accent}44`,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 12, zIndex: 40,
        boxShadow: `0 4px 24px rgba(242,101,34,0.22)`,
      }}
    >
      <span style={{ fontSize: 12, color: C.dim }}>
        Unsaved changes in <strong style={{ color: C.accent2 }}>{sectionName}</strong>
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.button
          type="button"
          onClick={onDiscard}
          style={{
            background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.dim, fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer',
          }}
          whileHover={{ background: C.glass2 }}
          whileTap={{ scale: 0.95 }}
        >
          Discard
        </motion.button>
        <motion.button
          type="button"
          onClick={onSave}
          style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700,
            padding: '6px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}
          whileHover={{ scale: 1.04, filter: 'brightness(1.1)' }}
          whileTap={{ scale: 0.96 }}
        >
          <Save size={12} />Save changes
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      variants={toastVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px', background: C.successDim, border: `1px solid ${C.successBrd}`,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        color: C.text, fontSize: 13, fontWeight: 600, maxWidth: 320,
      }}
    >
      <CheckCircle2 size={16} style={{ color: C.success, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <motion.button
        type="button"
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 2, display: 'flex' }}
        whileHover={{ color: C.text }}
      >
        <X size={13} />
      </motion.button>
    </motion.div>
  );
}

// ─── Integration health tile ──────────────────────────────────────────────────
function IntTile({ intg, index }: { intg: Integration; index: number }) {
  const color = intColor(intg.status);
  const bg    = intBg(intg.status);
  const brd   = intBrd(intg.status);

  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      whileHover={{ y: -3, boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}
      style={{ ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, cursor: 'default' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: bg, border: `1px solid ${brd}`, flexShrink: 0,
        }}>
          <intg.Icon size={15} style={{ color }} />
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: bg, border: `1px solid ${brd}`, borderRadius: 20, padding: '3px 8px',
        }}>
          <PulseDot color={color} />
          <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {intLabel(intg.status)}
          </span>
        </span>
      </div>
      {/* Label */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{intg.label}</div>
        <div style={{ fontSize: 11, color: C.faint }}>{intg.sub}</div>
      </div>
      {/* Latency */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 10, borderTop: `1px solid ${C.borderSoft}`,
      }}>
        <span style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Latency</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{intg.latency}</span>
      </div>
    </motion.div>
  );
}

// ─── General section ──────────────────────────────────────────────────────────
function GeneralSection({ onDirty }: { onDirty: () => void }) {
  const [platformName, setPlatformName] = useState('WarmPulse');
  const [supportEmail, setSupportEmail] = useState('support@warmpulse.app');
  const [baseUrl,      setBaseUrl]      = useState('https://warmpulse.app');
  const [logoUrl,      setLogoUrl]      = useState('https://warmpulse.app/logo.svg');

  const wrap = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
    (v: T) => { setter(v); onDirty(); }, [onDirty]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <motion.div variants={slideIn}>
          <InputRow label="Platform name"  value={platformName} onChange={wrap(setPlatformName)} hint="Shown in emails + browser tab" />
        </motion.div>
        <motion.div variants={slideIn}>
          <InputRow label="Support email"  value={supportEmail} onChange={wrap(setSupportEmail)} hint="Reply-to for all platform mail" mono />
        </motion.div>
        <motion.div variants={slideIn}>
          <InputRow label="Base URL"        value={baseUrl}      onChange={wrap(setBaseUrl)}      hint="Canonical URL used in email links" mono />
        </motion.div>
        <motion.div variants={slideIn}>
          <InputRow label="Logo URL"        value={logoUrl}      onChange={wrap(setLogoUrl)}      hint="PNG or SVG · min 512×512px" mono />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Warmup Engine section ────────────────────────────────────────────────────
function WarmupSection({ onDirty }: { onDirty: () => void }) {
  const [repFloor,   setRepFloor]   = useState(0.3);
  const [maxSends,   setMaxSends]   = useState(150);
  const [ladder,     setLadder]     = useState('Standard');
  const [winFrom,    setWinFrom]    = useState('08:00');
  const [winTo,      setWinTo]      = useState('20:00');

  const mark = useCallback(() => onDirty(), [onDirty]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <motion.div variants={slideIn}>
        <NumericRow label="Peer reputation floor" sub="Peers below this are deactivated (hourly rotation)"
          value={repFloor} min={0.1} max={0.9} step={0.1}
          onChange={(v) => { setRepFloor(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <NumericRow label="Max sends per mailbox / day" sub="Hard ceiling regardless of ramp stage"
          value={maxSends} min={10} max={500} step={10}
          onChange={(v) => { setMaxSends(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <SelectRow label="Ramp ladder" sub="D1–3=5, D4–7=10, D8–14=20 … or custom"
          value={ladder} options={['Standard', 'Aggressive', 'Conservative', 'Custom']}
          onChange={(v) => { setLadder(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: '10px 14px', background: C.glass, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.dim }}>Send window · from (UTC)</label>
            <input type="time" value={winFrom}
              onChange={(e) => { setWinFrom(e.target.value); mark(); }}
              style={{ display: 'block', marginTop: 4, width: '100%', background: 'transparent', border: 'none', color: C.text, fontSize: 14, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
            />
          </div>
          <div style={{ padding: '10px 14px', background: C.glass, border: `1px solid ${C.borderSoft}`, borderRadius: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.dim }}>Send window · to (UTC)</label>
            <input type="time" value={winTo}
              onChange={(e) => { setWinTo(e.target.value); mark(); }}
              style={{ display: 'block', marginTop: 4, width: '100%', background: 'transparent', border: 'none', color: C.text, fontSize: 14, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Security section ─────────────────────────────────────────────────────────
function SecuritySection({ onDirty }: { onDirty: () => void }) {
  const [require2fa,      setRequire2fa]      = useState(true);
  const [sessionTtl,      setSessionTtl]      = useState(24);
  const [ipAllowlist,     setIpAllowlist]     = useState(false);
  const [auditRetain,     setAuditRetain]     = useState(730);
  const [superAdminAudit, setSuperAdminAudit] = useState(true);

  const mark = useCallback(() => onDirty(), [onDirty]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <motion.div variants={slideIn}>
        <ToggleRow label="Require 2FA for all admins" sub="New admins must enrol TOTP before accessing the panel"
          on={require2fa} onChange={(v) => { setRequire2fa(v); mark(); }} />
      </motion.div>
      <motion.div variants={slideIn}>
        <ToggleRow label="IP allowlist" sub="Only permit logins from the configured CIDR blocks"
          on={ipAllowlist} onChange={(v) => { setIpAllowlist(v); mark(); }} />
      </motion.div>
      <motion.div variants={slideIn}>
        <ToggleRow label="Audit super-admin actions" sub="Write an audit row for every destructive super-admin op"
          on={superAdminAudit} onChange={(v) => { setSuperAdminAudit(v); mark(); }} />
      </motion.div>
      <motion.div variants={slideIn}>
        <NumericRow label="Session TTL" sub="Admin sessions expire after this many hours of inactivity"
          value={sessionTtl} min={1} max={168} step={1} unit="h"
          onChange={(v) => { setSessionTtl(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <NumericRow label="Audit log retention" sub="Rows older than this are purged in the nightly sweep"
          value={auditRetain} min={30} max={1825} step={30} unit="d"
          onChange={(v) => { setAuditRetain(v); mark(); }}
        />
      </motion.div>
    </motion.div>
  );
}

// ─── Alerts section ───────────────────────────────────────────────────────────
function AlertsSection({ onDirty }: { onDirty: () => void }) {
  const [stalledHours,  setStalledHours]  = useState(6);
  const [quotaPct,      setQuotaPct]      = useState(80);
  const [emailAlerts,   setEmailAlerts]   = useState(true);
  const [slackAlerts,   setSlackAlerts]   = useState(false);

  const mark = useCallback(() => onDirty(), [onDirty]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <motion.div variants={slideIn}>
        <NumericRow label="Stalled mailbox threshold" sub="Fire alert if no warmup activity for this many hours"
          value={stalledHours} min={1} max={48} step={1} unit="h"
          onChange={(v) => { setStalledHours(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <NumericRow label="Quota usage warning" sub="Alert when a mailbox hits this % of its daily quota"
          value={quotaPct} min={50} max={99} step={5} unit="%"
          onChange={(v) => { setQuotaPct(v); mark(); }}
        />
      </motion.div>
      <motion.div variants={slideIn}>
        <ToggleRow label="Email alerts" sub="Send to support@warmpulse.app"
          on={emailAlerts} onChange={(v) => { setEmailAlerts(v); mark(); }} />
      </motion.div>
      <motion.div variants={slideIn}>
        <ToggleRow label="Slack alerts" sub="#ops-alerts webhook"
          on={slackAlerts} onChange={(v) => { setSlackAlerts(v); mark(); }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Feature flags section ────────────────────────────────────────────────────
const FLAG_ROWS: Array<{ key: string; label: string; sub: string; defaultOn: boolean }> = [
  { key: 'crmSequences',  label: 'CRM Sequences',       sub: 'Email automation sequences for CRM contacts',       defaultOn: true },
  { key: 'impersonation', label: 'Admin impersonation',  sub: 'Super-admin can act as any workspace user',         defaultOn: true },
  { key: 'reportsExport', label: 'Reports export',       sub: 'CSV/PDF export on all report types',                defaultOn: true },
  { key: 'agencyMode',    label: 'Agency mode (beta)',   sub: 'Multi-workspace management tier',                   defaultOn: false },
  { key: 'betaDashboard', label: 'Beta dashboard',       sub: 'Serve E-set dashboard candidates to all admins',    defaultOn: false },
  { key: 'devLogs',       label: 'Verbose dev logs',     sub: 'Extra Celery + SMTP logs in prod (caution)',        defaultOn: false },
];

function FlagsSection({ onDirty }: { onDirty: () => void }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(FLAG_ROWS.map((r) => [r.key, r.defaultOn])),
  );

  const toggle = useCallback((k: string) => {
    setFlags((f) => ({ ...f, [k]: !f[k] }));
    onDirty();
  }, [onDirty]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {FLAG_ROWS.map((r, i) => (
        <motion.div key={r.key} variants={slideIn} custom={i}>
          <ToggleRow label={r.label} sub={r.sub} on={flags[r.key] ?? false} onChange={() => toggle(r.key)} />
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Region & Format section ──────────────────────────────────────────────────
function RegionSection({ onDirty }: { onDirty: () => void }) {
  const [region, setRegion] = useState<Region>('IN');

  const handleChange = (r: Region) => { setRegion(r); onDirty(); };

  const moneyPreview = formatMoney(SAMPLE_AMOUNT, { region });
  const datePreview  = formatDate(SAMPLE_TS, { region });

  const infoPills = region === 'IN'
    ? [
        { label: 'Currency',    value: '₹ INR' },
        { label: 'Grouping',    value: 'Indian lakh/crore' },
        { label: 'Timezone',    value: 'Asia/Kolkata (IST)' },
        { label: 'Date format', value: 'DD/MM/YYYY' },
      ]
    : [
        { label: 'Currency',    value: '$ USD' },
        { label: 'Grouping',    value: 'US thousands' },
        { label: 'Timezone',    value: 'User local time' },
        { label: 'Date format', value: 'MMM D, YYYY' },
      ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* Toggle */}
      <motion.div variants={slideIn}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['IN', 'INTL'] as Region[]).map((r) => {
            const active = region === r;
            return (
              <motion.button
                key={r}
                type="button"
                onClick={() => handleChange(r)}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 12, cursor: 'pointer',
                  background: active ? `linear-gradient(135deg, ${C.accent}28, ${C.accent2}20)` : C.glass,
                  border: active ? `1.5px solid ${C.accent}55` : `1px solid ${C.border}`,
                  color: active ? C.text : C.dim, fontWeight: active ? 700 : 500,
                  fontSize: 13, textAlign: 'center',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{r === 'IN' ? '🇮🇳' : '🌍'}</div>
                <div>{r === 'IN' ? 'India (₹ / DD/MM/YYYY)' : 'International ($ / MMM D, YYYY)'}</div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Live preview card */}
      <motion.div variants={slideIn}
        style={{ ...innerCardStyle, padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
      >
        <div>
          <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Money preview
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={moneyPreview}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 22, fontWeight: 800, color: C.accent, letterSpacing: '-0.02em' }}
            >
              {moneyPreview}
            </motion.div>
          </AnimatePresence>
          <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>Input: {SAMPLE_AMOUNT.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Date preview
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={datePreview}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 22, fontWeight: 800, color: C.accent2, letterSpacing: '-0.02em' }}
            >
              {datePreview}
            </motion.div>
          </AnimatePresence>
          <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>
            {region === 'IN' ? 'IST · DD/MM/YYYY' : 'MMM D, YYYY'}
          </div>
        </div>
      </motion.div>

      {/* Info pills */}
      <motion.div variants={slideIn} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {infoPills.map((item) => (
          <div key={item.label} style={{
            background: C.glass, border: `1px solid ${C.borderSoft}`,
            borderRadius: 8, padding: '6px 12px', display: 'flex', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: C.faint }}>{item.label}:</span>
            <span style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>{item.value}</span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Collapsible section wrapper ──────────────────────────────────────────────
interface CollapsibleSectionProps {
  Icon:         LucideIcon;
  title:        string;
  sub?:         string;
  pill?:        string;
  pillColor?:   string;
  children:     React.ReactNode;
  sectionKey:   string;
  dirty:        boolean;
  onSave:       () => void;
  onDiscard:    () => void;
  defaultOpen?: boolean;
}

function CollapsibleSection({
  Icon, title, sub, pill, pillColor, children, sectionKey,
  dirty, onSave, onDiscard, defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.div variants={fadeUp} style={{ ...cardStyle, overflow: 'hidden' }}>
      {/* Clickable header */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          textAlign: 'left',
        }}
        whileHover={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${C.accent}22, ${C.accent2}18)`,
            border: `1px solid ${C.accent}33`, flexShrink: 0,
          }}>
            <Icon size={14} style={{ color: C.accent }} />
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
              {pill && (
                <span style={{
                  background: (pillColor ?? C.accent) + '20', color: pillColor ?? C.accent,
                  border: `1px solid ${(pillColor ?? C.accent)}38`,
                  borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                }}>
                  {pill}
                </span>
              )}
              {dirty && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, display: 'inline-block' }}
                />
              )}
            </div>
            {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{sub}</div>}
          </div>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{ display: 'flex', flexShrink: 0 }}
        >
          <ChevronDown size={16} style={{ color: C.faint }} />
        </motion.span>
      </motion.button>

      {/* Animated content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={`${sectionKey}-content`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 22px 18px' }}>
              {children}
              <AnimatePresence>
                {dirty && (
                  <SaveBar key="savebar" sectionName={title} onSave={onSave} onDiscard={onDiscard} />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export function AdmSetSE4Cockpit() {
  const [dirtyGeneral,  setDirtyGeneral]  = useState(false);
  const [dirtyWarmup,   setDirtyWarmup]   = useState(false);
  const [dirtySecurity, setDirtySecurity] = useState(false);
  const [dirtyAlerts,   setDirtyAlerts]   = useState(false);
  const [dirtyFlags,    setDirtyFlags]    = useState(false);
  const [dirtyRegion,   setDirtyRegion]   = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  // Stable dirty-setters via ref so child memo keys never change
  const markDirtyGeneral  = useRef(() => setDirtyGeneral(true));
  const markDirtyWarmup   = useRef(() => setDirtyWarmup(true));
  const markDirtySecurity = useRef(() => setDirtySecurity(true));
  const markDirtyAlerts   = useRef(() => setDirtyAlerts(true));
  const markDirtyFlags    = useRef(() => setDirtyFlags(true));
  const markDirtyRegion   = useRef(() => setDirtyRegion(true));

  const makeSave = (label: string, clearDirty: () => void) => () => {
    clearDirty();
    setToast(`${label} saved successfully`);
  };

  const statusItems: Array<{ Icon: LucideIcon; label: string; color: string; sub: string }> = [
    { Icon: CheckCircle2, label: '5 integrations',  color: C.success,  sub: '4 healthy · 1 degraded' },
    { Icon: Server,       label: 'Beat alive',       color: C.success,  sub: '3s ago' },
    { Icon: AlertTriangle, label: '1 alert',         color: C.warning,  sub: 'OAuth latency ↑' },
  ];

  return (
    <div style={{
      minHeight: '100vh', background: 'transparent', color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px 28px 60px', boxSizing: 'border-box', position: 'relative',
    }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast key="toast" message={toast} onClose={closeToast} />}
      </AnimatePresence>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ fontSize: 11, color: C.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
          Admin · Platform Settings
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: C.text,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              boxShadow: `0 4px 16px ${C.accent}44`,
            }}>
              <Settings size={18} style={{ color: '#fff' }} />
            </span>
            Control Panel
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, color: C.faint, background: C.glass, border: `1px solid ${C.borderSoft}`,
              borderRadius: 7, padding: '4px 10px',
            }}>
              v2.4.1 · prod
            </span>
            <motion.button
              type="button"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, background: C.glass,
                border: `1px solid ${C.border}`, borderRadius: 9, color: C.dim,
                fontSize: 12, fontWeight: 600, padding: '7px 14px', cursor: 'pointer',
              }}
              whileHover={{ background: C.glass2 }}
              whileTap={{ scale: 0.96 }}
            >
              <RefreshCcw size={12} />Reload config
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Integration health tiles */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        style={{ marginBottom: 28 }}
      >
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.faint, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Wifi size={11} style={{ color: C.accent, opacity: 0.8 }} />
          Integration Health
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {INTEGRATIONS.map((it, i) => (
            <IntTile key={it.id} intg={it} index={i} />
          ))}
        </div>
      </motion.div>

      {/* Collapsible settings sections */}
      <motion.div variants={pageStagger} initial="hidden" animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >

        <CollapsibleSection
          Icon={Settings} title="General" sub="Platform identity, support contact, branding"
          sectionKey="general" dirty={dirtyGeneral}
          onSave={makeSave('General', () => setDirtyGeneral(false))}
          onDiscard={() => setDirtyGeneral(false)}
          defaultOpen
        >
          <GeneralSection onDirty={markDirtyGeneral.current} />
        </CollapsibleSection>

        <CollapsibleSection
          Icon={Sliders} title="Warmup Engine" sub="Peer reputation floor, ramp ladder, daily send caps, windows"
          pill="7 active jobs" pillColor={C.success}
          sectionKey="warmup" dirty={dirtyWarmup}
          onSave={makeSave('Warmup Engine', () => setDirtyWarmup(false))}
          onDiscard={() => setDirtyWarmup(false)}
          defaultOpen
        >
          <WarmupSection onDirty={markDirtyWarmup.current} />
        </CollapsibleSection>

        <CollapsibleSection
          Icon={Shield} title="Security" sub="2FA policy, session TTL, audit log retention"
          sectionKey="security" dirty={dirtySecurity}
          onSave={makeSave('Security', () => setDirtySecurity(false))}
          onDiscard={() => setDirtySecurity(false)}
        >
          <SecuritySection onDirty={markDirtySecurity.current} />
        </CollapsibleSection>

        <CollapsibleSection
          Icon={Bell} title="Alerts" sub="Thresholds, notification channels, quiet hours"
          sectionKey="alerts" dirty={dirtyAlerts}
          onSave={makeSave('Alerts', () => setDirtyAlerts(false))}
          onDiscard={() => setDirtyAlerts(false)}
        >
          <AlertsSection onDirty={markDirtyAlerts.current} />
        </CollapsibleSection>

        <CollapsibleSection
          Icon={Flag} title="Feature Flags" sub="Runtime kill-switches for platform capabilities"
          pill="3 on"
          sectionKey="flags" dirty={dirtyFlags}
          onSave={makeSave('Feature Flags', () => setDirtyFlags(false))}
          onDiscard={() => setDirtyFlags(false)}
        >
          <FlagsSection onDirty={markDirtyFlags.current} />
        </CollapsibleSection>

        <CollapsibleSection
          Icon={Globe} title="Region & Format" sub="₹ INR / DD-MM-YYYY ↔ $ USD / MMM D, YYYY — live preview"
          pill="India active" pillColor={C.success}
          sectionKey="region" dirty={dirtyRegion}
          onSave={makeSave('Region & Format', () => setDirtyRegion(false))}
          onDiscard={() => setDirtyRegion(false)}
          defaultOpen
        >
          <RegionSection onDirty={markDirtyRegion.current} />
        </CollapsibleSection>

      </motion.div>

      {/* Bottom status bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        style={{
          marginTop: 28, padding: '12px 18px', background: C.glass,
          border: `1px solid ${C.borderSoft}`,
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {statusItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <item.Icon size={12} style={{ color: item.color }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.dim }}>{item.label}</span>
              <span style={{ fontSize: 10, color: C.faint }}>· {item.sub}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ToggleLeft size={12} style={{ color: C.faint }} />
          <span style={{ fontSize: 10, color: C.faint }}>Config hot-reload · last sync 00:02 ago</span>
        </div>
      </motion.div>

    </div>
  );
}
