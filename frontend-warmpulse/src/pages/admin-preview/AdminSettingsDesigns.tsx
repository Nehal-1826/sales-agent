import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  Grid3x3,
  Key,
  KeyRound,
  Laptop,
  LayoutList,
  Lock,
  LogOut,
  Monitor,
  Palette,
  RefreshCcw,
  Save,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import './admin-settings-designs.css';

export function AdminSettingsDesigns() {
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
    <div className="asd">
      <div className="asd__atmosphere" aria-hidden>
        <div className="asd__aurora-1" />
        <div className="asd__aurora-2" />
      </div>

      <header className="asd__head">
        <Link to="/admin/settings" className="asd__back">
          ← Back to live admin settings
        </Link>
        <div className="asd__head-row">
          <div>
            <span className="asd__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Pick an Admin-Settings design
            </span>
            <h1 className="asd__title">
              {String(index + 1).padStart(2, '0')} · {design.name}
            </h1>
            <p className="asd__sub">{design.tagline}</p>
          </div>
          <div className="asd__counter">
            <span className="asd__counter-now">{index + 1}</span>
            <span className="asd__counter-sep">/</span>
            <span className="asd__counter-total">{DESIGNS.length}</span>
          </div>
        </div>
      </header>

      <div className="asd__stage">
        <button type="button" className="asd__arrow" onClick={() => go(-1)} aria-label="Previous">
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <div className="asd__viewport">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={design.code}
              className="asd__slide"
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
        <button type="button" className="asd__arrow" onClick={() => go(1)} aria-label="Next">
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="asd__dots" role="tablist">
        {DESIGNS.map((d, i) => (
          <button
            key={d.code}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`asd__dot ${i === index ? 'asd__dot--active' : ''}`}
            onClick={() => {
              setDirection(i > index ? 1 : -1);
              setIndex(i);
            }}
          >
            <span className="asd__dot-label">{d.name}</span>
          </button>
        ))}
      </div>

      <div className="asd__bullets-row">
        <ul className="asd__bullets">
          {design.bullets.map((b) => (
            <li key={b}>
              <CheckCircle2 size={13} strokeWidth={2.4} />
              {b}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`asd__pick ${isPicked ? 'asd__pick--done' : ''}`}
          onClick={() => setPicked(design.code)}
        >
          {isPicked ? 'Selected — tell me to build it' : `Use ${design.name}`}
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {picked ? (
        <div className="asd__footer">
          You picked <strong>{DESIGNS.find((d) => d.code === picked)?.name}</strong>. Tell me
          <code> build settings-{picked}</code> and I'll wire it up at /admin/settings (with a real
          QR via the <code>qrcode</code> npm package).
        </div>
      ) : (
        <div className="asd__hint">← / → keys · click arrows · drag the slide · tap a dot</div>
      )}
    </div>
  );
}

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

type DesignCode = 'settings-hub' | 'sidebar-classic' | 'linear-stack' | 'security-wizard';

interface Design {
  code: DesignCode;
  name: string;
  tagline: string;
  bullets: string[];
  icon: typeof SettingsIcon;
  Full: () => JSX.Element;
}

// ---------------------------------------------------------------------------
// Shared 2FA building blocks (the data is identical across designs — only
// the surrounding layout differs).
// ---------------------------------------------------------------------------

const SECRET = 'JBSWY3DPEHPK3PXP4D';
const ACCOUNT = 'admin@warmpulse.app';
const ISSUER = 'WarmPulse';
const OTPAUTH = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(ACCOUNT)}?secret=${SECRET}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;

const AUTH_APPS = [
  { id: 'google',    name: 'Google Authenticator',     hint: 'iOS · Android',         color: '#F26522' },
  { id: 'microsoft', name: 'Microsoft Authenticator',  hint: 'iOS · Android',         color: '#F26522' },
  { id: 'authy',     name: 'Twilio Authy',             hint: 'iOS · Android · Desktop', color: '#ed1f24' },
  { id: '1password', name: '1Password',                hint: 'Built into the vault',  color: '#FF8A4B' },
  { id: 'bitwarden', name: 'Bitwarden',                hint: 'Premium · Auth code',    color: '#FF8A4B' },
  { id: 'duo',       name: 'Duo Mobile',               hint: 'iOS · Android',         color: '#56a82a' },
  { id: 'aegis',     name: 'Aegis Authenticator',      hint: 'Android · open source', color: '#FF8A4B' },
  { id: 'raivo',     name: 'Raivo OTP',                hint: 'iOS · open source',     color: '#fc6f6f' },
];

const RECOVERY_CODES = [
  'a7f2-9k3m-pq4z',
  'b6d1-8j2n-rt5x',
  'c5e0-7h1l-su6y',
  'd4f9-6g0k-tv7w',
  'e3a8-5d8j-uw8v',
  'f2b7-4c7i-vx9u',
  'g1c6-3b6h-wy0t',
  'h0d5-2a5g-xz1s',
];

/**
 * Static-but-realistic QR-code visual.
 *
 * Renders the three corner finder patterns + a deterministic data grid so
 * the design preview looks like a real QR. The live page will swap this
 * for a real `qrcode` render of `OTPAUTH`.
 */
function QrCode({ size = 180 }: { size?: number }) {
  const N = 33;
  const cellSize = size / (N + 4); // 2-cell quiet zone on each side
  const offset = cellSize * 2;
  const totalSize = size;

  // Deterministic "data" cells — looks random but stable.
  const isData = (x: number, y: number): boolean => {
    // Skip finder regions
    if (isFinder(x, y)) return false;
    if (isAlignment(x, y)) return false;
    // Timing strips at row/col 6
    if (x === 6 || y === 6) return (x + y) % 2 === 0;
    // Deterministic noise
    const v = (x * 41 + y * 31 + x * y * 7 + 13) % 23;
    return v < 11;
  };

  const cells: Array<{ x: number; y: number; type: 'finder' | 'data' | 'align' }> = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (isFinderInner(x, y)) cells.push({ x, y, type: 'finder' });
      else if (isAlignmentInner(x, y)) cells.push({ x, y, type: 'align' });
      else if (isData(x, y)) cells.push({ x, y, type: 'data' });
    }
  }

  function isFinder(x: number, y: number): boolean {
    return (
      (x < 8 && y < 8) ||
      (x >= N - 8 && y < 8) ||
      (x < 8 && y >= N - 8)
    );
  }
  function isFinderInner(x: number, y: number): boolean {
    const inOuter = (cx: number, cy: number) =>
      (x >= cx && x < cx + 7 && y >= cy && y < cy + 7) &&
      ((x === cx) || (x === cx + 6) || (y === cy) || (y === cy + 6) ||
        (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    return inOuter(0, 0) || inOuter(N - 7, 0) || inOuter(0, N - 7);
  }
  function isAlignment(x: number, y: number): boolean {
    return x >= N - 9 && x <= N - 5 && y >= N - 9 && y <= N - 5;
  }
  function isAlignmentInner(x: number, y: number): boolean {
    const cx = N - 9;
    const cy = N - 9;
    return (x >= cx && x < cx + 5 && y >= cy && y < cy + 5) &&
      ((x === cx) || (x === cx + 4) || (y === cy) || (y === cy + 4) ||
        (x === cx + 2 && y === cy + 2));
  }

  return (
    <svg
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      width={totalSize}
      height={totalSize}
      className="qr"
      role="img"
      aria-label="2FA QR code"
    >
      <rect x="0" y="0" width={totalSize} height={totalSize} fill="#ffffff" rx="6" />
      {cells.map((c, i) => (
        <rect
          key={i}
          x={offset + c.x * cellSize}
          y={offset + c.y * cellSize}
          width={cellSize}
          height={cellSize}
          fill="#0a0a14"
          rx="0.6"
        />
      ))}
    </svg>
  );
}

function AppGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`apps-grid ${compact ? 'apps-grid--compact' : ''}`}>
      {AUTH_APPS.map((app, i) => (
        <motion.div
          key={app.id}
          className="app-chip"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.04 }}
        >
          <span
            className="app-chip__logo"
            style={{ background: `linear-gradient(135deg, ${app.color}, ${app.color}aa)` }}
          >
            {app.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div className="app-chip__id">
            <div className="app-chip__name">{app.name}</div>
            <div className="app-chip__hint">{app.hint}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function RecoveryCodes({ inline = false }: { inline?: boolean }) {
  return (
    <div className={`rc ${inline ? 'rc--inline' : ''}`}>
      <div className="rc__h">
        <span className="asd__eyebrow">
          <KeyRound size={11} />Recovery codes
        </span>
        <span className="rc__note">Save these · each works once</span>
      </div>
      <div className="rc__grid">
        {RECOVERY_CODES.map((c) => (
          <span key={c} className="rc__code">{c}</span>
        ))}
      </div>
      <div className="rc__actions">
        <button className="btn btn--ghost"><Copy size={11} />Copy all</button>
        <button className="btn btn--ghost"><Download size={11} />Download .txt</button>
        <button className="btn btn--ghost"><RefreshCcw size={11} />Regenerate</button>
      </div>
    </div>
  );
}

function TwoFactorBlock({ variant }: { variant: 'card' | 'panel' | 'wizard' | 'split' }) {
  const [showSecret, setShowSecret] = useState(false);
  return (
    <div className={`tfa tfa--${variant}`}>
      <div className="tfa__intro">
        <span className="tfa__step">Step 1</span>
        <h3 className="tfa__title">
          <ShieldCheck size={15} strokeWidth={2.4} />
          Scan the QR with your authenticator
        </h3>
        <p className="tfa__sub">
          Open any TOTP-compatible app and add the WarmPulse account. The same code works
          everywhere — no vendor lock-in.
        </p>
      </div>

      <div className="tfa__qr-row">
        <div className="tfa__qr-wrap">
          <QrCode size={196} />
          <span className="tfa__qr-badge">
            <Lock size={10} strokeWidth={2.4} />
            6 digit · 30s
          </span>
        </div>
        <div className="tfa__manual">
          <span className="asd__eyebrow">
            <Key size={11} />Or enter the key manually
          </span>
          <div className="tfa__secret">
            <code className="tfa__secret-code">
              {showSecret ? SECRET : '••••-••••-••••-••••'}
            </code>
            <button
              type="button"
              className="tfa__icon-btn"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button type="button" className="tfa__icon-btn" aria-label="Copy secret">
              <Copy size={13} />
            </button>
          </div>
          <div className="tfa__uri">
            <span className="tfa__uri-label">otpauth URI</span>
            <code className="tfa__uri-code" title={OTPAUTH}>{OTPAUTH}</code>
          </div>

          <div className="tfa__bullets">
            <li><Check size={11} />SHA-1 · 6 digits · 30-second window</li>
            <li><Check size={11} />Works with any RFC-6238 authenticator</li>
            <li><Check size={11} />Stored encrypted at rest (Fernet · MultiFernet rotation)</li>
          </div>
        </div>
      </div>

      <div className="tfa__verify">
        <span className="tfa__step">Step 2</span>
        <h4 className="tfa__verify-title">Verify the 6-digit code</h4>
        <div className="tfa__code-input">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              maxLength={1}
              className="tfa__digit"
              defaultValue={i <= 3 ? String(i + 2) : ''}
              aria-label={`Digit ${i}`}
            />
          ))}
        </div>
        <button type="button" className="btn btn--solid">
          <ShieldCheck size={12} />Activate 2FA
        </button>
      </div>

      <div className="tfa__apps">
        <span className="tfa__step">Step 3</span>
        <h4 className="tfa__apps-title">Works with all major authenticator apps</h4>
        <AppGrid compact={variant === 'card' || variant === 'wizard'} />
      </div>

      <RecoveryCodes inline={variant === 'card'} />
    </div>
  );
}

// ===========================================================================
// 1) SETTINGS HUB — card grid + drill-in
// ===========================================================================
function FullSettingsHub() {
  const [active, setActive] = useState<HubKey>('security');
  return (
    <div className="page page--hub">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Settings · Hub</div>
        <div className="page__count">
          <SettingsIcon size={11} strokeWidth={2.4} />
          7 sections · drill-in to edit
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Settings</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Discard</button>
          <button className="btn btn--solid"><Save size={12} />Save changes</button>
        </div>
      </div>

      {/* Card grid */}
      <div className="hub-grid">
        {HUB_CARDS.map((c, i) => (
          <motion.button
            key={c.key}
            type="button"
            className={`hub-card ${active === c.key ? 'hub-card--active' : ''}`}
            onClick={() => setActive(c.key)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.04 }}
          >
            <span className="hub-card__icon">
              <c.icon size={14} strokeWidth={2.2} />
            </span>
            <div className="hub-card__id">
              <div className="hub-card__name">{c.label}</div>
              <div className="hub-card__status">{c.status}</div>
            </div>
            <ChevronRight size={13} strokeWidth={2.4} className="hub-card__arrow" />
          </motion.button>
        ))}
      </div>

      {/* Drill-in panel */}
      <motion.div
        key={active}
        className="hub-panel"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <HubPanel section={active} />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section detail panels (Settings Hub drill-in content)
// ---------------------------------------------------------------------------

function HubPanel({ section }: { section: HubKey }) {
  switch (section) {
    case 'profile':       return <ProfilePanel />;
    case 'security':      return <TwoFactorBlock variant="card" />;
    case 'sessions':      return <SessionsPanel />;
    case 'api':           return <ApiKeysPanel />;
    case 'notifications': return <NotificationsPanel />;
    case 'org':           return <OrgPanel />;
    case 'appearance':    return <AppearancePanel />;
  }
}

// ----- Profile --------------------------------------------------------------

function ProfilePanel() {
  return (
    <div className="hp">
      <div className="hp__head">
        <div className="hp__avatar">DV</div>
        <div className="hp__id">
          <div className="hp__name">Devesh · Super Admin</div>
          <div className="hp__email">admin@warmpulse.app</div>
          <div className="hp__meta">
            <span className="hp__pill hp__pill--accent">super_admin</span>
            <span className="hp__sep">·</span>
            <span>Joined 2026-01-12</span>
            <span className="hp__sep">·</span>
            <span>Last login 2 min ago</span>
          </div>
        </div>
        <div className="hp__head-actions">
          <button className="btn btn--ghost">Upload avatar</button>
          <button className="btn btn--ghost">Remove</button>
        </div>
      </div>

      <div className="hp__grid">
        <HpField label="Display name" value="Devesh · Super Admin" />
        <HpField label="Email" value="admin@warmpulse.app" mono lock="Verified · used for login" />
        <HpField label="Phone (recovery)" value="+91 ••• ••• 4421" mono />
        <HpField label="Time zone" value="Asia/Kolkata · UTC+5:30" />
        <HpField label="Default currency" value="USD ($)" />
        <HpField label="Language" value="English (US)" />
        <HpField label="Slack handle" value="@devesh" mono />
        <HpField label="Job title" value="Founder / Platform Admin" />
      </div>

      <div className="hp__danger">
        <div>
          <div className="hp__danger-title">Sign out everywhere</div>
          <div className="hp__danger-sub">Revokes all 3 active sessions and forces re-login.</div>
        </div>
        <button className="btn btn--ghost">Sign out all</button>
      </div>
    </div>
  );
}

function HpField({
  label,
  value,
  mono,
  lock,
}: {
  label: string;
  value: string;
  mono?: boolean;
  lock?: string;
}) {
  return (
    <div className="hp-field">
      <span className="hp-field__label">{label}</span>
      <input
        className={`hp-field__input ${mono ? 'hp-field__input--mono' : ''}`}
        defaultValue={value}
      />
      {lock && <span className="hp-field__lock"><Lock size={9} />{lock}</span>}
    </div>
  );
}

// ----- Sessions -------------------------------------------------------------

const HUB_SESSIONS = [
  { device: 'MacBook Pro · Chrome 126', location: 'Bengaluru, India', ip: '49.32.21.144',  last: 'now',          icon: Laptop,     current: true,  os: 'macOS 14.4' },
  { device: 'iPhone 15 Pro · Safari',    location: 'Bengaluru, India', ip: '49.32.21.144',  last: '2h ago',       icon: Smartphone, current: false, os: 'iOS 17.4' },
  { device: 'iPad Air · Safari',         location: 'Pune, India',      ip: '157.49.86.142', last: 'yesterday',    icon: Smartphone, current: false, os: 'iPadOS 17.4' },
  { device: 'Linux · Firefox 124',       location: 'New York, USA',    ip: '54.234.12.88',  last: '5 days ago',   icon: Monitor,    current: false, os: 'Ubuntu 24.04' },
];

function SessionsPanel() {
  return (
    <div className="hp">
      <div className="hp__strip">
        <div className="hp__stat">
          <span className="hp__stat-num">{HUB_SESSIONS.length}</span>
          <span className="hp__stat-label">Active sessions</span>
        </div>
        <div className="hp__stat">
          <span className="hp__stat-num">{new Set(HUB_SESSIONS.map((s) => s.ip)).size}</span>
          <span className="hp__stat-label">Distinct IPs</span>
        </div>
        <div className="hp__stat">
          <span className="hp__stat-num">2</span>
          <span className="hp__stat-label">Countries</span>
        </div>
        <div className="hp__stat">
          <span className="hp__stat-num hp__stat-num--ok">all green</span>
          <span className="hp__stat-label">Anomaly score</span>
        </div>
      </div>

      <div className="hp-sessions">
        {HUB_SESSIONS.map((s, i) => (
          <motion.div
            key={i}
            className="hp-session"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.04 }}
          >
            <span className="hp-session__icon">
              <s.icon size={15} strokeWidth={2.2} />
            </span>
            <div className="hp-session__id">
              <div className="hp-session__device">{s.device}</div>
              <div className="hp-session__meta">
                {s.os} · {s.location} · <span className="hp-session__ip">{s.ip}</span>
              </div>
            </div>
            <div className="hp-session__time">{s.last}</div>
            {s.current ? (
              <span className="hp-session__current">This device</span>
            ) : (
              <button className="hp-session__revoke">Revoke</button>
            )}
          </motion.div>
        ))}
      </div>

      <div className="hp__danger">
        <div>
          <div className="hp__danger-title">Sign out of every device</div>
          <div className="hp__danger-sub">Revokes all 3 non-current sessions immediately.</div>
        </div>
        <button className="btn btn--ghost">Revoke all others</button>
      </div>
    </div>
  );
}

// ----- API Keys -------------------------------------------------------------

const API_KEYS = [
  { name: 'Reporting export',     prefix: 'wp_live_a4f9',  scopes: ['reports.read', 'analytics.read'],                         lastUsed: '12 min ago', createdBy: 'admin@warmpulse.app', createdAt: '2026-03-04', expiresAt: '2026-06-04' },
  { name: 'Zapier integration',   prefix: 'wp_live_b6d1',  scopes: ['mailboxes.read', 'warmup.read', 'webhooks.write'],         lastUsed: '4 hours ago', createdBy: 'ops@warmpulse.app',   createdAt: '2026-02-18', expiresAt: 'never' },
  { name: 'CI smoke test',        prefix: 'wp_test_c5e0',  scopes: ['health.read'],                                              lastUsed: 'yesterday',   createdBy: 'admin@warmpulse.app', createdAt: '2026-01-30', expiresAt: '2026-05-30' },
];

function ApiKeysPanel() {
  return (
    <div className="hp">
      <div className="hp__head hp__head--simple">
        <div>
          <div className="hp__h-title">API keys</div>
          <div className="hp__h-sub">
            Tokens that authenticate machine-to-machine calls. Treat them like passwords — revoke
            immediately on suspected compromise.
          </div>
        </div>
        <button className="btn btn--solid"><Key size={12} />Create key</button>
      </div>

      <div className="hp-keys">
        <div className="hp-keys__row hp-keys__row--head">
          <span>Name</span>
          <span>Prefix</span>
          <span>Scopes</span>
          <span>Last used</span>
          <span>Expires</span>
          <span />
        </div>
        {API_KEYS.map((k, i) => (
          <motion.div
            key={k.prefix}
            className="hp-keys__row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 + i * 0.04 }}
          >
            <div className="hp-keys__name">
              <div>{k.name}</div>
              <div className="hp-keys__sub">created {k.createdAt} by {k.createdBy}</div>
            </div>
            <div className="hp-keys__prefix">
              <code>{k.prefix}…</code>
              <button className="hp__icon-btn" aria-label="Copy prefix"><Copy size={11} /></button>
            </div>
            <div className="hp-keys__scopes">
              {k.scopes.map((s) => (
                <span key={s} className="hp-scope">{s}</span>
              ))}
            </div>
            <div className="hp-keys__used">{k.lastUsed}</div>
            <div className="hp-keys__exp">
              {k.expiresAt === 'never' ? (
                <span className="hp-pill hp-pill--warn">never</span>
              ) : (
                k.expiresAt
              )}
            </div>
            <div className="hp-keys__act">
              <button className="hp-keys__rotate">Rotate</button>
              <button className="hp-keys__revoke">Revoke</button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="hp__danger">
        <div>
          <div className="hp__danger-title">Revoke all keys</div>
          <div className="hp__danger-sub">Use only if a leak is suspected · breaks every integration immediately.</div>
        </div>
        <button className="btn btn--ghost">Revoke everything</button>
      </div>
    </div>
  );
}

// ----- Notifications --------------------------------------------------------

const NOTIF_CHANNELS = [
  { id: 'email', label: 'Email',         hint: 'admin@warmpulse.app' },
  { id: 'slack', label: 'Slack',         hint: '#ops alerts' },
  { id: 'push',  label: 'Browser push',  hint: 'enabled · 1 device' },
];

const NOTIF_EVENTS: Array<{ id: string; label: string; defaults: Record<string, boolean> }> = [
  { id: 'signups',  label: 'New signups',           defaults: { email: true, slack: true,  push: false } },
  { id: 'payments', label: 'Payment events',        defaults: { email: true, slack: true,  push: true } },
  { id: 'alerts',   label: 'System alerts',         defaults: { email: true, slack: true,  push: true } },
  { id: 'security', label: 'Security events',       defaults: { email: true, slack: true,  push: true } },
  { id: 'digest',   label: 'Daily digest',          defaults: { email: true, slack: false, push: false } },
  { id: 'support',  label: 'Support replies',       defaults: { email: true, slack: false, push: false } },
];

function NotificationsPanel() {
  const [grid, setGrid] = useState<Record<string, Record<string, boolean>>>(
    Object.fromEntries(NOTIF_EVENTS.map((e) => [e.id, { ...e.defaults }])),
  );
  const toggle = (event: string, channel: string) => {
    setGrid((g) => ({
      ...g,
      [event]: { ...g[event], [channel]: !g[event]?.[channel] },
    }));
  };
  return (
    <div className="hp">
      <div className="hp__head hp__head--simple">
        <div>
          <div className="hp__h-title">Notifications</div>
          <div className="hp__h-sub">Choose which events reach you, and where. Channels are stacked left-to-right.</div>
        </div>
        <button className="btn btn--ghost">Reset to defaults</button>
      </div>

      <div className="hp-notif">
        <div className="hp-notif__head">
          <span />
          {NOTIF_CHANNELS.map((c) => (
            <div key={c.id} className="hp-notif__channel">
              <div className="hp-notif__channel-name">{c.label}</div>
              <div className="hp-notif__channel-hint">{c.hint}</div>
            </div>
          ))}
        </div>
        {NOTIF_EVENTS.map((e, i) => (
          <motion.div
            key={e.id}
            className="hp-notif__row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 + i * 0.04 }}
          >
            <span className="hp-notif__event">{e.label}</span>
            {NOTIF_CHANNELS.map((c) => {
              const on = grid[e.id]?.[c.id] ?? false;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`hp-notif__toggle ${on ? 'hp-notif__toggle--on' : ''}`}
                  onClick={() => toggle(e.id, c.id)}
                  aria-pressed={on}
                  aria-label={`${e.label} via ${c.label}`}
                >
                  <span className="hp-notif__knob" />
                </button>
              );
            })}
          </motion.div>
        ))}
      </div>

      <div className="hp-quiet">
        <div className="hp-quiet__h">
          <span className="asd__eyebrow"><Bell size={11} />Quiet hours</span>
          <span className="hp-quiet__sub">Mute non-critical notifications during this window.</span>
        </div>
        <div className="hp-quiet__row">
          <HpField label="From" value="22:00" mono />
          <HpField label="To" value="07:00" mono />
          <HpField label="Time zone" value="Asia/Kolkata" />
        </div>
      </div>
    </div>
  );
}

// ----- Organisation ---------------------------------------------------------

const ORG_ADMINS = [
  { email: 'admin@warmpulse.app', role: 'super_admin', joined: 'Jan 12', hue: 260 },
  { email: 'ops@warmpulse.app',   role: 'admin',       joined: 'Feb 03', hue: 200 },
  { email: 'mei@warmpulse.app',   role: 'admin',       joined: 'Mar 30', hue: 320 },
  { email: 'pri@warmpulse.app',   role: 'support',     joined: 'Apr 22', hue: 30 },
];

function OrgPanel() {
  return (
    <div className="hp">
      <div className="hp__head hp__head--simple">
        <div>
          <div className="hp__h-title">Organisation</div>
          <div className="hp__h-sub">Workspace-wide settings that apply across every admin.</div>
        </div>
      </div>

      <div className="hp__grid">
        <HpField label="Workspace name" value="WarmPulse" />
        <HpField label="Workspace slug" value="warmpulse" mono />
        <HpField label="Primary domain" value="warmpulse.app" mono />
        <HpField label="Billing email" value="billing@warmpulse.app" mono />
        <HpField label="Support email" value="support@warmpulse.app" mono />
        <HpField label="Public status page" value="status.warmpulse.app" mono />
      </div>

      <div className="hp-admins">
        <div className="hp-admins__h">
          <span className="asd__eyebrow"><Building2 size={11} />Admins ({ORG_ADMINS.length})</span>
          <button className="btn btn--ghost">+ Invite admin</button>
        </div>
        {ORG_ADMINS.map((a, i) => (
          <motion.div
            key={a.email}
            className="hp-admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 + i * 0.04 }}
          >
            <span
              className="hp-admin__avatar"
              style={{ background: `linear-gradient(135deg, hsl(${a.hue} 70% 56%), hsl(${a.hue + 40} 65% 48%))` }}
            >
              {a.email.slice(0, 2).toUpperCase()}
            </span>
            <div className="hp-admin__id">
              <div className="hp-admin__email">{a.email}</div>
              <div className="hp-admin__joined">joined {a.joined}</div>
            </div>
            <span className={`hp-pill hp-pill--${a.role.replace('_', '')}`}>{a.role}</span>
            <button className="hp-admin__menu">⋯</button>
          </motion.div>
        ))}
      </div>

      <div className="hp-bill">
        <div className="hp-bill__h">
          <span className="asd__eyebrow"><Globe size={11} />Compliance &amp; data</span>
        </div>
        <div className="hp__grid">
          <HpField label="Data region" value="EU (Frankfurt)" />
          <HpField label="Retention · audit log" value="2 years" />
          <HpField label="Retention · warmup logs" value="180 days" />
          <HpField label="GDPR DPO email" value="dpo@warmpulse.app" mono />
        </div>
      </div>
    </div>
  );
}

// ----- Appearance -----------------------------------------------------------

function AppearancePanel() {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [accent, setAccent] = useState<string>('violet');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  return (
    <div className="hp">
      <div className="hp__head hp__head--simple">
        <div>
          <div className="hp__h-title">Appearance</div>
          <div className="hp__h-sub">How the admin app looks — saved per-user.</div>
        </div>
      </div>

      <div className="hp-app__row">
        <div className="hp-app__label">Theme</div>
        <div className="hp-app__choices">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`hp-app__choice ${theme === t ? 'hp-app__choice--on' : ''}`}
              onClick={() => setTheme(t)}
            >
              <span className={`hp-app__chip hp-app__chip--${t}`} />
              {t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Match system'}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-app__row">
        <div className="hp-app__label">Accent color</div>
        <div className="hp-app__choices">
          {[
            { id: 'violet',  color: '#F26522' },
            { id: 'blue',    color: '#FF8A4B' },
            { id: 'pink',    color: '#f472b6' },
            { id: 'emerald', color: '#10b981' },
            { id: 'amber',   color: '#fbbf24' },
            { id: 'rose',    color: '#fb7185' },
          ].map((a) => (
            <button
              key={a.id}
              type="button"
              className={`hp-app__swatch ${accent === a.id ? 'hp-app__swatch--on' : ''}`}
              style={{ background: a.color }}
              onClick={() => setAccent(a.id)}
              aria-label={a.id}
            >
              {accent === a.id && <Check size={12} strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-app__row">
        <div className="hp-app__label">Density</div>
        <div className="hp-app__choices">
          {(['comfortable', 'compact'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`hp-app__choice ${density === d ? 'hp-app__choice--on' : ''}`}
              onClick={() => setDensity(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-app__row">
        <div className="hp-app__label">Motion</div>
        <div className="hp-app__choices">
          <label className="hp-app__check">
            <input type="checkbox" defaultChecked /> Reduce animations
          </label>
          <label className="hp-app__check">
            <input type="checkbox" /> Auto-play live updates
          </label>
        </div>
      </div>

      <div className="hp-preview">
        <div className="hp-preview__h">
          <span className="asd__eyebrow">Live preview</span>
          <span className="hp-preview__note">applies instantly</span>
        </div>
        <div className={`hp-preview__demo hp-preview__demo--${theme}`}>
          <div className="hp-preview__btn-ghost">Cancel</div>
          <div
            className="hp-preview__btn-solid"
            style={{ background: accentColor(accent) }}
          >
            Confirm
          </div>
          <div className="hp-preview__pill" style={{ background: `color-mix(in srgb, ${accentColor(accent)} 22%, transparent)`, color: accentColor(accent) }}>
            Active
          </div>
        </div>
      </div>
    </div>
  );
}

function accentColor(id: string): string {
  switch (id) {
    case 'blue':    return '#FF8A4B';
    case 'pink':    return '#f472b6';
    case 'emerald': return '#10b981';
    case 'amber':   return '#fbbf24';
    case 'rose':    return '#fb7185';
    default:        return '#F26522';
  }
}

type HubKey = 'profile' | 'security' | 'sessions' | 'api' | 'notifications' | 'org' | 'appearance';

const HUB_CARDS: Array<{ key: HubKey; label: string; status: string; icon: typeof User }> = [
  { key: 'profile',       label: 'Profile',       status: 'admin@warmpulse.app',  icon: User },
  { key: 'security',      label: 'Security & 2FA', status: 'Enabled · TOTP',      icon: ShieldCheck },
  { key: 'sessions',      label: 'Active sessions', status: '3 devices',          icon: Monitor },
  { key: 'api',           label: 'API keys',       status: '2 active',            icon: Key },
  { key: 'notifications', label: 'Notifications', status: 'Email · Slack',       icon: Bell },
  { key: 'org',           label: 'Organisation',  status: 'WarmPulse · 4 admins', icon: Building2 },
  { key: 'appearance',    label: 'Appearance',    status: 'Dark · violet',       icon: Palette },
];

// ===========================================================================
// 2) SIDEBAR CLASSIC — fixed nav + content pane
// ===========================================================================
function FullSidebarClassic() {
  return (
    <div className="page page--sidebar">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Settings · Security</div>
        <div className="page__count">
          <Shield size={11} strokeWidth={2.4} />
          changes auto-save · last 4s ago
        </div>
      </div>

      <div className="sb">
        <aside className="sb__nav">
          {SIDEBAR_ITEMS.map((it, i) => (
            <motion.button
              key={it.key}
              type="button"
              className={`sb__item ${it.key === 'security' ? 'sb__item--active' : ''}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.06 + i * 0.04 }}
            >
              <span className="sb__item-icon">
                <it.icon size={13} strokeWidth={2.2} />
              </span>
              <span className="sb__item-label">{it.label}</span>
              {it.badge ? <span className="sb__item-badge">{it.badge}</span> : null}
            </motion.button>
          ))}
          <div className="sb__nav-foot">
            <button className="sb__sign-out">
              <LogOut size={12} strokeWidth={2.2} />Sign out everywhere
            </button>
          </div>
        </aside>

        <main className="sb__main">
          <div className="sb__main-head">
            <h2 className="sb__main-title">Security &amp; 2FA</h2>
            <p className="sb__main-sub">
              Two-factor authentication adds a 6-digit code to every login. Works with any TOTP
              authenticator app.
            </p>
            <div className="sb__status">
              <span className="sb__status-pill sb__status-pill--ok">
                <CheckCircle2 size={11} />2FA enabled
              </span>
              <span className="sb__status-meta">TOTP · enrolled 2026-01-22</span>
            </div>
          </div>

          <TwoFactorBlock variant="panel" />
        </main>
      </div>
    </div>
  );
}

const SIDEBAR_ITEMS: Array<{ key: string; label: string; icon: typeof User; badge?: string }> = [
  { key: 'profile',       label: 'Profile',         icon: User },
  { key: 'security',      label: 'Security & 2FA',   icon: ShieldCheck, badge: 'New' },
  { key: 'sessions',      label: 'Active sessions',  icon: Monitor,     badge: '3' },
  { key: 'api',           label: 'API keys',         icon: Key },
  { key: 'notifications', label: 'Notifications',    icon: Bell },
  { key: 'integrations',  label: 'Integrations',     icon: Globe },
  { key: 'org',           label: 'Organisation',     icon: Building2 },
  { key: 'appearance',    label: 'Appearance',       icon: Palette },
  { key: 'audit',         label: 'My audit log',     icon: ScrollText },
];

// ===========================================================================
// 3) LINEAR STACK — single scrollable page with stacked sections
// ===========================================================================
function FullLinearStack() {
  return (
    <div className="page page--linear">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Settings · Linear</div>
        <div className="page__count">
          <LayoutList size={11} strokeWidth={2.4} />
          scroll · jump-to from the rail
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Account settings</h2>
        <div className="page__actions">
          <span className="ln__saved">Last saved 4s ago</span>
          <button className="btn btn--solid"><Save size={12} />Save</button>
        </div>
      </div>

      <div className="ln">
        <aside className="ln__rail">
          {LINEAR_SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`ln__rail-item ${i === 1 ? 'ln__rail-item--active' : ''}`}
            >
              <s.icon size={12} strokeWidth={2.2} />
              {s.label}
            </a>
          ))}
        </aside>

        <div className="ln__sections">
          <section className="ln-section" id="profile">
            <div className="ln-section__h">
              <span className="asd__eyebrow"><User size={11} />Profile</span>
              <h3 className="ln-section__title">Identity</h3>
            </div>
            <div className="ln-fields">
              <Field label="Display name" value="Devesh · Super Admin" />
              <Field label="Email" value="admin@warmpulse.app" mono />
              <Field label="Time zone" value="Asia/Kolkata · UTC+5:30" />
              <Field label="Default currency" value="USD ($)" />
            </div>
          </section>

          <section className="ln-section ln-section--featured" id="security">
            <div className="ln-section__h">
              <span className="asd__eyebrow"><ShieldCheck size={11} />Security · 2FA</span>
              <h3 className="ln-section__title">Two-factor authentication</h3>
              <div className="ln-section__status">
                <span className="sb__status-pill sb__status-pill--ok">
                  <CheckCircle2 size={11} />Active
                </span>
                <span className="sb__status-meta">TOTP · enrolled 2026-01-22</span>
              </div>
            </div>
            <TwoFactorBlock variant="split" />
          </section>

          <section className="ln-section" id="sessions">
            <div className="ln-section__h">
              <span className="asd__eyebrow"><Monitor size={11} />Active sessions</span>
              <h3 className="ln-section__title">3 devices · this account</h3>
            </div>
            <div className="ln-sessions">
              {SESSIONS.map((s, i) => (
                <div key={i} className="ln-session">
                  <span className="ln-session__icon">
                    <s.icon size={14} strokeWidth={2.2} />
                  </span>
                  <div className="ln-session__id">
                    <div className="ln-session__device">{s.device}</div>
                    <div className="ln-session__meta">
                      {s.location} · {s.ip} · {s.last}
                    </div>
                  </div>
                  {s.current ? (
                    <span className="ln-session__current">This device</span>
                  ) : (
                    <button className="ln-session__revoke">Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="ln-section ln-section--danger" id="danger">
            <div className="ln-section__h">
              <span className="asd__eyebrow"><AlertTriangle size={11} />Danger zone</span>
              <h3 className="ln-section__title">Irreversible actions</h3>
            </div>
            <div className="ln-danger">
              <div className="ln-danger__row">
                <div>
                  <div className="ln-danger__title">Sign out of every device</div>
                  <div className="ln-danger__sub">Revokes all sessions · forces re-login</div>
                </div>
                <button className="btn btn--ghost">Sign out all</button>
              </div>
              <div className="ln-danger__row">
                <div>
                  <div className="ln-danger__title">Transfer ownership</div>
                  <div className="ln-danger__sub">Hand the admin role to another user</div>
                </div>
                <button className="btn btn--ghost">Transfer</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const LINEAR_SECTIONS = [
  { id: 'profile',  label: 'Profile',          icon: User },
  { id: 'security', label: 'Security & 2FA',    icon: ShieldCheck },
  { id: 'sessions', label: 'Active sessions',   icon: Monitor },
  { id: 'danger',   label: 'Danger zone',       icon: AlertTriangle },
];

const SESSIONS = [
  { device: 'MacBook Pro · Chrome', location: 'Bengaluru · IN', ip: '49.32.21.144',  last: 'now',     icon: Laptop,     current: true },
  { device: 'iPhone 15 · Safari',    location: 'Bengaluru · IN', ip: '49.32.21.144',  last: '2h ago',  icon: Smartphone, current: false },
  { device: 'iPad · Safari',         location: 'Pune · IN',      ip: '157.49.86.142', last: 'yesterday', icon: Smartphone, current: false },
];

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ln-field">
      <label className="ln-field__label">{label}</label>
      <input
        className={`ln-field__input ${mono ? 'ln-field__input--mono' : ''}`}
        defaultValue={value}
      />
    </div>
  );
}

// ===========================================================================
// 4) SECURITY WIZARD — guided step-by-step hardening flow
// ===========================================================================
function FullSecurityWizard() {
  const [step, setStep] = useState(2);
  return (
    <div className="page page--wizard">
      <div className="page__topbar">
        <div className="page__crumb">Admin · Settings · Wizard</div>
        <div className="page__count">
          <Wand2 size={11} strokeWidth={2.4} />
          guided · 5 steps
        </div>
      </div>

      <div className="page__header">
        <h2 className="page__title">Security hardening</h2>
        <div className="page__actions">
          <button className="btn btn--ghost">Skip wizard</button>
          <button className="btn btn--ghost">Finish later</button>
        </div>
      </div>

      <div className="wz-steps">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`wz-step ${i === step ? 'wz-step--active' : ''} ${i < step ? 'wz-step--done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="wz-step__dot">
              {i < step ? <Check size={12} strokeWidth={2.8} /> : i + 1}
            </span>
            <div className="wz-step__id">
              <div className="wz-step__label">{s.label}</div>
              <div className="wz-step__sub">{s.sub}</div>
            </div>
            {i < WIZARD_STEPS.length - 1 && <span className="wz-step__connector" />}
          </button>
        ))}
      </div>

      <motion.div
        key={step}
        className="wz-body"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {step === 2 ? (
          <>
            <div className="wz-body__head">
              <span className="asd__eyebrow">
                <ShieldCheck size={11} />Step 3 of 5
              </span>
              <h3 className="wz-body__title">Add two-factor authentication</h3>
              <p className="wz-body__sub">
                We strongly recommend pairing your account with a TOTP authenticator. This adds
                a 6-digit one-time code on every login — even if your password leaks, the
                attacker still needs the code from your phone.
              </p>
            </div>
            <TwoFactorBlock variant="wizard" />
          </>
        ) : (
          (() => {
            const current = WIZARD_STEPS[step]!;
            const Icon = current.icon;
            return (
              <div className="placeholder">
                <span className="placeholder__icon">
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <div className="placeholder__title">{current.label}</div>
                <div className="placeholder__sub">{current.sub}</div>
              </div>
            );
          })()
        )}
      </motion.div>

      <div className="wz-foot">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ← Previous
        </button>
        <div className="wz-foot__progress">
          Step <strong>{step + 1}</strong> of {WIZARD_STEPS.length}
        </div>
        <button
          type="button"
          className="btn btn--solid"
          onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
        >
          {step === WIZARD_STEPS.length - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

const WIZARD_STEPS = [
  { label: 'Profile',        sub: 'Identity & timezone',          icon: User },
  { label: 'Strong password', sub: 'Re-verify your password',     icon: Lock },
  { label: '2FA',             sub: 'TOTP via authenticator app',  icon: ShieldCheck },
  { label: 'Recovery codes',  sub: 'Stash 8 backup codes',         icon: KeyRound },
  { label: 'Done',            sub: 'Account is hardened',          icon: CheckCircle2 },
];

// ---------------------------------------------------------------------------
const DESIGNS: Design[] = [
  {
    code: 'settings-hub',
    name: 'Settings Hub',
    tagline: 'Card grid + drill-in — pick a section to expand its full editor.',
    bullets: [
      '7 setting cards with status preview (e.g. "2FA: Enabled · TOTP")',
      'Selected card stays violet-rimmed · clicking drills into a panel below',
      '2FA panel: QR + manual key (with show/hide) + 6-digit verify + recovery codes',
      'Best when admins land on the page and want to scan everything at once',
    ],
    icon: Grid3x3,
    Full: FullSettingsHub,
  },
  {
    code: 'sidebar-classic',
    name: 'Sidebar Settings',
    tagline: 'Classic left-nav + right-content pane — works at any size.',
    bullets: [
      'Persistent left nav with section labels and counters (Sessions · 3)',
      'Right pane: rich 2FA layout — QR · manual key · otpauth URI · 8 auth apps · 6 codes',
      '"2FA enabled · enrolled 2026-01-22" status pill in the header',
      'Bottom "Sign out everywhere" button on the nav',
    ],
    icon: LayoutList,
    Full: FullSidebarClassic,
  },
  {
    code: 'linear-stack',
    name: 'Linear Stack',
    tagline: 'Everything on one scrollable page · sticky jump-to rail.',
    bullets: [
      'Sticky left rail with Profile · Security · Sessions · Danger zone',
      'Security section is featured (violet glow) with the full 2FA flow inline',
      'Sessions list with device icon, IP, last seen + Revoke button',
      'Danger zone at the bottom with destructive actions',
    ],
    icon: LayoutList,
    Full: FullLinearStack,
  },
  {
    code: 'security-wizard',
    name: 'Security Wizard',
    tagline: 'Step-by-step hardening · 5 guided steps with progress.',
    bullets: [
      'Numbered step strip: Profile → Password → 2FA → Recovery → Done',
      'Active step (2FA by default) gets the full QR + apps + verify treatment',
      'Previous / Next buttons + "Step X of 5" progress',
      'Best when onboarding a brand-new admin or rotating after a breach',
    ],
    icon: Wand2,
    Full: FullSecurityWizard,
  },
];

export default AdminSettingsDesigns;
