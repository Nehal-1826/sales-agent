/**
 * /app/settings — Pro tier.
 *
 * S4 horizontal-tab design, wired to real backend persistence:
 *
 *   • Profile        → useWorkspaceProfile + useUpdateWorkspaceProfile
 *   • Security       → useSessions + useRevokeSession + TOTP enrol hooks
 *   • Notifications  → useNotificationEvents + useUpdateNotificationEvent
 *   • Appearance     → localStorage("warmpulse.theme" + "warmpulse.user-settings")
 *   • Data           → exportWorkspaceCsv + GDPR + deletion request
 *
 * Visual language reuses the .s4__* classes from the preview folder; the
 * preview wrapper / banner is gone. Each tab owns its own loading + error
 * surface — there is no global "Save changes" because most mutations
 * persist on a per-field basis, but a Save button is still rendered on the
 * Profile tab where multiple fields move together.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Bell,
  Check,
  Database,
  Download,
  Globe2,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  Save,
  Shield,
  Sun,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RegionFormatPanel } from '@/features/settings/RegionFormatPanel';
import { formatDateTime, formatDate } from '@/lib/format';
import {
  applyThemeMode,
  resolveThemeMode,
  useThemeMode,
  type ThemeMode,
} from '@/lib/useThemeMode';
import {
  ACCENT_COLORS,
  DENSITIES,
  LANGUAGES,
  TIMEZONES,
} from '@/pages/client-design-preview/pro-settings/demoSettings';
import '@/pages/client-design-preview/pro-settings/pro-settings.css';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  exportWorkspaceCsv,
  useAvatarObjectUrl,
  useDeleteAvatar,
  useDisableTotp,
  useEnableTotp,
  useNotificationEvents,
  useRequestWorkspaceDeletion,
  useRevokeSession,
  useSessions,
  useSubmitGdprRequest,
  useUpdateNotificationEvent,
  useUpdateProfile,
  useUpdateWorkspaceProfile,
  useUploadAvatar,
  useUserSettings,
  useVerifyTotp,
  useWorkspaceProfile,
  type TotpEnrollment,
} from '@/features/settings/api';

type TabKey =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'appearance'
  | 'data';

interface TabDef {
  key: TabKey;
  name: string;
  Icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: 'profile', name: 'Workspace profile', Icon: UserIcon },
  { key: 'security', name: 'Security & access', Icon: Shield },
  { key: 'notifications', name: 'Notifications', Icon: Bell },
  { key: 'appearance', name: 'Appearance', Icon: Palette },
  { key: 'data', name: 'Data & privacy', Icon: Database },
];

const EVENT_DEFS: Array<{ key: string; label: string; desc: string }> = [
  {
    key: 'mailbox_paused',
    label: 'Mailbox paused',
    desc: 'When a mailbox is paused by you or by system due to issues',
  },
  {
    key: 'bounce_spike',
    label: 'Failed delivery spike detected',
    desc: 'Real-time alert when failure rate exceeds threshold',
  },
  {
    key: 'peer_failed',
    label: 'Helper inbox failures',
    desc: 'Helper inbox failing repeatedly · auto-rotated',
  },
  {
    key: 'weekly_digest',
    label: 'Weekly sender trust digest',
    desc: 'Every Monday at 9am · 7-day summary per mailbox',
  },
  {
    key: 'invoice_paid',
    label: 'Invoice paid',
    desc: 'Receipt every month after successful payment',
  },
  {
    key: 'invoice_failed',
    label: 'Payment failed',
    desc: 'Immediate alert if payment method fails',
  },
  {
    key: 'member_invited',
    label: 'Member invited / joined',
    desc: 'When a workspace member is invited or accepts',
  },
  {
    key: 'product_updates',
    label: 'Product changelog',
    desc: 'Monthly product updates · feature launches',
  },
];

const THEMES = [
  { key: 'light' as const, label: 'Light', swatch: '#f4f5f9' },
  { key: 'dark' as const, label: 'Dark', swatch: '#161823' },
  {
    key: 'system' as const,
    label: 'System',
    swatch:
      'linear-gradient(90deg, #f4f5f9 0%, #f4f5f9 50%, #161823 50%, #161823 100%)',
  },
];

type ThemeKey = 'light' | 'dark' | 'system';
type Density = (typeof DENSITIES)[number];

const THEME_STORAGE_KEY = 'warmpulse.theme';
const USER_SETTINGS_KEY = 'wp_user_settings';

interface LocalUserSettings {
  theme: ThemeKey;
  accent: string;
  density: Density;
  language: string;
}

function loadLocalSettings(): LocalUserSettings {
  const defaults: LocalUserSettings = {
    theme: 'dark',
    accent: '#F26522',
    density: 'Comfortable',
    language: 'English (India)',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) {
      // Fall back to the older theme-only key if present.
      const themeOnly = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (themeOnly === 'light' || themeOnly === 'dark') {
        return { ...defaults, theme: themeOnly };
      }
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<LocalUserSettings>;
    return {
      theme:
        parsed.theme === 'light' ||
        parsed.theme === 'dark' ||
        parsed.theme === 'system'
          ? parsed.theme
          : defaults.theme,
      accent:
        typeof parsed.accent === 'string' ? parsed.accent : defaults.accent,
      density:
        parsed.density === 'Compact' ||
        parsed.density === 'Comfortable' ||
        parsed.density === 'Spacious'
          ? parsed.density
          : defaults.density,
      language:
        typeof parsed.language === 'string'
          ? parsed.language
          : defaults.language,
    };
  } catch {
    return defaults;
  }
}

function applyTheme(theme: ThemeKey): ThemeMode {
  const resolved = resolveThemeMode(theme);
  // Single source of truth: applyThemeMode sets data-theme, the legacy
  // `.dark` class, persists `warmpulse.theme`, and broadcasts wp-theme-change
  // so the sidebar toggle re-renders in lock-step with this page.
  applyThemeMode(resolved);
  return resolved;
}

function persistLocalSettings(s: LocalUserSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(s));
}

export function ProSettings() {
  const [active, setActive] = useState<TabKey>('profile');

  return (
    <div className="s4">
      <header className="s4__head">
        <h2 className="s4__head-title">Settings</h2>
      </header>

      <nav className="s4__tabs" role="tablist">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`s4__tab ${isActive ? 's4__tab--active' : ''}`}
            >
              <Icon size={12} strokeWidth={2.4} />
              {t.name}
            </button>
          );
        })}
      </nav>

      <motion.section
        key={active}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="s4__pane"
      >
        {active === 'profile' && <ProfileTab />}
        {active === 'security' && <SecurityTab />}
        {active === 'notifications' && <NotificationsTab />}
        {active === 'appearance' && <AppearanceTab />}
        {active === 'data' && <DataTab />}
      </motion.section>
    </div>
  );
}

export default ProSettings;

// ════════════════════════════════════════════════════════════════════
// Tab: Profile
// ════════════════════════════════════════════════════════════════════

// `brand_color` is stored as a 6-digit hex string. The native colour input
// and the preset swatches always emit valid values; this guard only flags
// the case where the user types a malformed value into the text field.
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
function isHexValid(v: string): boolean {
  return HEX_PATTERN.test(v.trim());
}

function ProfileTab() {
  const wq = useWorkspaceProfile();
  const uq = useUserSettings();
  const updateWs = useUpdateWorkspaceProfile();
  const updateUser = useUpdateProfile();

  const [draft, setDraft] = useState({
    name: '',
    slug: '',
    default_sender: '',
    brand_color: '#F26522',
    timezone: '',
  });
  const [dirty, setDirty] = useState(false);

  // Display-name lives on the user (not the workspace) row, so it has its
  // own draft + save path via PATCH /workspace/settings/profile.
  const [displayName, setDisplayName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);

  // Seed the draft once data arrives; subsequent server pushes (e.g. after
  // mutation) should re-sync only when the user hasn't touched the form.
  useEffect(() => {
    if (!wq.data || !uq.data) return;
    if (dirty) return;
    setDraft({
      name: wq.data.name,
      slug: wq.data.slug,
      default_sender: wq.data.default_sender,
      brand_color: wq.data.brand_color,
      timezone: uq.data.profile.timezone,
    });
  }, [wq.data, uq.data, dirty]);

  useEffect(() => {
    if (!uq.data || nameDirty) return;
    setDisplayName(uq.data.profile.display_name ?? '');
  }, [uq.data, nameDirty]);

  const isSaving = updateWs.isPending || updateUser.isPending;

  async function onSave() {
    try {
      await updateWs.mutateAsync({
        name: draft.name,
        slug: draft.slug,
        default_sender: draft.default_sender,
        brand_color: draft.brand_color,
      });
      if (draft.timezone && draft.timezone !== uq.data?.profile.timezone) {
        await updateUser.mutateAsync({ timezone: draft.timezone });
      }
      toast.success('Workspace settings saved');
      setDirty(false);
    } catch {
      toast.error('Could not save workspace settings');
    }
  }

  async function onSaveName() {
    try {
      await updateUser.mutateAsync({ display_name: displayName });
      toast.success('Display name saved');
      setNameDirty(false);
    } catch {
      toast.error('Could not save display name');
    }
  }

  if (wq.isLoading || uq.isLoading) {
    return <LoadingPane label="Loading workspace…" />;
  }

  return (
    <>
      <Section
        title="Your profile"
        desc="Your display name and picture, shown across WarmPulse and to admins."
        action={
          <button
            type="button"
            className="s4__btn-primary"
            onClick={onSaveName}
            disabled={!nameDirty || updateUser.isPending}
          >
            {updateUser.isPending ? (
              <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Save size={11} strokeWidth={2.4} />
            )}
            Save name
          </button>
        }
      >
        <AvatarRow
          email={uq.data?.profile.email ?? ''}
          displayName={displayName}
          hasAvatar={uq.data?.profile.has_avatar}
          avatarUrl={uq.data?.profile.avatar_url ?? null}
        />
        <FormRow label="Display name">
          <input
            className="s4__input"
            value={displayName}
            placeholder="Your name"
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameDirty(true);
            }}
          />
        </FormRow>
        <FormRow label="Email">
          <div className="s4__input-icon">
            <Mail size={12} strokeWidth={2.4} />
            <input
              className="s4__input"
              value={uq.data?.profile.email ?? ''}
              disabled
            />
          </div>
        </FormRow>
      </Section>

      <Section
        title="Workspace identity"
        desc="Name + slug used in nav, reports, and outbound URLs."
        action={
          <button
            type="button"
            className="s4__btn-primary"
            onClick={onSave}
            disabled={!dirty || isSaving || !isHexValid(draft.brand_color)}
          >
            {isSaving ? (
              <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Save size={11} strokeWidth={2.4} />
            )}
            Save changes
          </button>
        }
      >
        <FormRow label="Workspace name">
          <input
            className="s4__input"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              setDirty(true);
            }}
          />
        </FormRow>
        <FormRow label="Slug">
          <div className="s4__slug">
            <span className="s4__slug-prefix">warmpulse.io /</span>
            <input
              className="s4__input s4__input--slug"
              value={draft.slug}
              onChange={(e) => {
                setDraft({ ...draft, slug: e.target.value });
                setDirty(true);
              }}
            />
          </div>
        </FormRow>
        <FormRow label="Default sender">
          <div className="s4__input-icon">
            <Mail size={12} strokeWidth={2.4} />
            <input
              className="s4__input"
              type="email"
              value={draft.default_sender}
              onChange={(e) => {
                setDraft({ ...draft, default_sender: e.target.value });
                setDirty(true);
              }}
            />
          </div>
        </FormRow>
      </Section>

      <Section
        title="Locale"
        desc="Timezone governs every schedule + report. Language lives under Appearance."
      >
        <FormRow label="Timezone">
          <div className="s4__input-icon">
            <Globe2 size={12} strokeWidth={2.4} />
            <select
              className="s4__input"
              value={draft.timezone}
              onChange={(e) => {
                setDraft({ ...draft, timezone: e.target.value });
                setDirty(true);
              }}
            >
              {/* Stable preset list + the user's current value if not in the list. */}
              {!TIMEZONES.includes(draft.timezone) && draft.timezone ? (
                <option value={draft.timezone}>{draft.timezone}</option>
              ) : null}
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </FormRow>
      </Section>

      <Section
        title="Brand"
        desc="Used as accent in white-label reports and outbound email shells."
      >
        <FormRow label="Brand color">
          {/* Three-part picker:
              1. The swatch ALSO houses a hidden native <input type="color">
                 so clicking it opens the OS colour picker (no extra UI).
              2. The hex text input is still available for users who already
                 know the value — validated against #RRGGBB.
              3. A row of preset swatches below covers the common brand
                 palette (ACCENT_COLORS, shared with the demo settings). */}
          <div className="s4__color" style={{ flexWrap: 'wrap', rowGap: 10 }}>
            <label
              className="s4__color-swatch"
              style={{
                background: isHexValid(draft.brand_color)
                  ? draft.brand_color
                  : '#F26522',
                cursor: 'pointer',
                position: 'relative',
              }}
              title="Open colour picker"
              aria-label="Open colour picker"
            >
              <input
                type="color"
                value={
                  isHexValid(draft.brand_color) ? draft.brand_color : '#F26522'
                }
                onChange={(e) => {
                  setDraft({ ...draft, brand_color: e.target.value });
                  setDirty(true);
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                }}
                aria-label="Pick brand colour"
              />
            </label>
            <input
              className="s4__input s4__input--mono"
              value={draft.brand_color}
              onChange={(e) => {
                setDraft({ ...draft, brand_color: e.target.value });
                setDirty(true);
              }}
              maxLength={7}
              spellCheck={false}
              style={{ maxWidth: 130 }}
              aria-invalid={!isHexValid(draft.brand_color)}
            />
            <div
              role="group"
              aria-label="Brand colour presets"
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}
            >
              {ACCENT_COLORS.map((c) => {
                const selected =
                  draft.brand_color.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, brand_color: c.hex });
                      setDirty(true);
                    }}
                    aria-label={`Use ${c.label}`}
                    aria-pressed={selected}
                    title={c.label}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c.hex,
                      border: selected
                        ? '2px solid var(--wp-text, #e8e8f0)'
                        : '1px solid var(--wp-border, #2a2a3a)',
                      boxShadow: selected
                        ? `0 0 0 2px color-mix(in srgb, ${c.hex} 40%, transparent)`
                        : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 0.12s ease',
                    }}
                  />
                );
              })}
            </div>
          </div>
          {!isHexValid(draft.brand_color) ? (
            <p
              style={{
                color: 'var(--wp-accent-3, #ff6b4a)',
                fontSize: 11,
                marginTop: 6,
              }}
            >
              Use a 6-digit hex colour, e.g. #F26522
            </p>
          ) : null}
        </FormRow>
      </Section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: Security
// ════════════════════════════════════════════════════════════════════
function SecurityTab() {
  const settings = useUserSettings();
  const sessionsQ = useSessions();
  const revoke = useRevokeSession();
  const enrolTotp = useEnableTotp();
  const verifyTotp = useVerifyTotp();
  const disableTotp = useDisableTotp();

  const totpEnabled = settings.data?.security.totp_enabled ?? false;
  const sessions = sessionsQ.data ?? [];

  // Full enrol → QR/secret → verify → recovery-codes flow (ported from the
  // Starter SettingsTabs panel, restyled with the s4__* classes).
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  async function startTotp() {
    try {
      const enrol = await enrolTotp.mutateAsync();
      setEnrollment(enrol);
    } catch {
      toast.error('Could not start 2FA enrolment');
    }
  }

  async function finishTotp() {
    if (code.trim().length < 6) return;
    try {
      await verifyTotp.mutateAsync({ code: code.trim() });
      toast.success('Two-factor authentication enabled');
      setEnrollment(null);
      setCode('');
    } catch {
      toast.error('Invalid code — try again');
    }
  }

  async function doDisable() {
    if (!disablePw) return;
    try {
      await disableTotp.mutateAsync({ password: disablePw });
      toast.success('Two-factor authentication disabled');
      setDisablePw('');
      setShowDisable(false);
    } catch {
      toast.error('Could not disable 2FA — check your password');
    }
  }

  async function revokeOne(id: string) {
    const ok = await confirm({
      title: 'Sign out session?',
      description: 'The session will be revoked immediately.',
      danger: true,
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(id);
      toast.success('Session revoked');
    } catch {
      toast.error('Could not revoke session');
    }
  }

  async function revokeAllOthers() {
    const other = sessions.filter((s) => !s.is_current);
    if (other.length === 0) return;
    const ok = await confirm({
      title: 'Sign out other sessions?',
      description: `Revoke ${other.length} session(s). Your current browser stays signed in.`,
      danger: true,
      confirmLabel: 'Sign out all',
    });
    if (!ok) return;
    let failed = 0;
    for (const s of other) {
      try {
        await revoke.mutateAsync(s.id);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) toast.success('Other sessions signed out');
    else toast.error(`${failed} session(s) could not be revoked`);
  }

  return (
    <>
      <Section
        title="Authentication"
        desc="How you sign in to WarmPulse."
      >
        <div className="s4__sec-row">
          <div className="s4__sec-text">
            <span className="s4__sec-label">Two-factor authentication</span>
            <span className="s4__sec-detail">
              {totpEnabled
                ? 'Enabled · authenticator app required on sign-in'
                : 'Not enabled · authenticator app recommended'}
            </span>
          </div>
          <span
            className={`s4__pill s4__pill--${totpEnabled ? 'enabled' : 'disabled'}`}
          >
            {totpEnabled ? 'enabled' : 'disabled'}
          </span>
          {totpEnabled ? (
            <button
              type="button"
              className="s4__btn-ghost"
              onClick={() => setShowDisable((v) => !v)}
            >
              Manage
            </button>
          ) : (
            <button
              type="button"
              className="s4__btn-primary"
              onClick={() => void startTotp()}
              disabled={enrolTotp.isPending || !!enrollment}
            >
              {enrolTotp.isPending ? 'Preparing…' : 'Enable'}
            </button>
          )}
        </div>

        {/* Enrolment: QR + manual secret + recovery codes + verify step. */}
        {enrollment ? (
          <div
            style={{
              border: '1px solid var(--wp-border-muted, #2a2d3a)',
              borderRadius: 6,
              padding: 14,
              marginTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div
                style={{
                  background: '#fff',
                  padding: 10,
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                <QRCodeSVG
                  value={enrollment.qr_url}
                  size={132}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0f"
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  Scan in your authenticator app
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--wp-text-dim)',
                    marginTop: 2,
                  }}
                >
                  Google Authenticator, 1Password, Authy, etc.
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--wp-text-dim)',
                    marginTop: 8,
                  }}
                >
                  Or enter this secret manually:
                </div>
                <code
                  style={{
                    display: 'inline-block',
                    marginTop: 4,
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: 'var(--wp-bg, #161823)',
                    fontSize: 12,
                    wordBreak: 'break-all',
                  }}
                >
                  {enrollment.secret}
                </code>
              </div>
            </div>

            {enrollment.recovery_codes.length > 0 ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Recovery codes — save these somewhere safe
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="s4__btn-ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          enrollment.recovery_codes.join('\n'),
                        );
                        toast.success('Recovery codes copied');
                      }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="s4__btn-ghost"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            'WarmPulse 2FA recovery codes\n',
                            'Each code can be used once if you lose your authenticator.\n',
                            `Generated: ${new Date().toISOString()}\n\n`,
                            ...enrollment.recovery_codes.map((c) => `${c}\n`),
                          ],
                          { type: 'text/plain;charset=utf-8' },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'warmpulse-recovery-codes.txt';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 6,
                    padding: 8,
                    borderRadius: 4,
                    background: 'var(--wp-bg, #161823)',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {enrollment.recovery_codes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <FormRow label="Enter a code to confirm">
                <input
                  className="s4__input"
                  placeholder="123456"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </FormRow>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="s4__btn-primary"
                  onClick={() => void finishTotp()}
                  disabled={verifyTotp.isPending || code.trim().length < 6}
                >
                  {verifyTotp.isPending ? 'Verifying…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="s4__btn-ghost"
                  onClick={() => {
                    setEnrollment(null);
                    setCode('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Disable: re-auth with password (only when enabled + Manage open). */}
        {totpEnabled && showDisable ? (
          <div
            style={{
              border: '1px solid var(--wp-border-muted, #2a2d3a)',
              borderRadius: 6,
              padding: 14,
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              To disable 2FA, confirm your password.
            </div>
            <FormRow label="Password">
              <input
                className="s4__input"
                type="password"
                value={disablePw}
                onChange={(e) => setDisablePw(e.target.value)}
              />
            </FormRow>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="s4__btn-danger"
                onClick={() => void doDisable()}
                disabled={disableTotp.isPending || !disablePw}
              >
                {disableTotp.isPending ? 'Disabling…' : 'Disable 2FA'}
              </button>
              <button
                type="button"
                className="s4__btn-ghost"
                onClick={() => {
                  setShowDisable(false);
                  setDisablePw('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="s4__sec-row">
          <div className="s4__sec-text">
            <span className="s4__sec-label">Single sign-on (SAML)</span>
            <span className="s4__sec-detail">Available on Agency tier</span>
          </div>
          <span className="s4__pill s4__pill--disabled">disabled</span>
        </div>
      </Section>

      <Section
        title="Network"
        desc="Session lifetime governs how long sign-ins stay valid."
      >
        <div className="s4__sec-row">
          <div className="s4__sec-text">
            <span className="s4__sec-label">Session timeout</span>
            <span className="s4__sec-detail">
              Access tokens expire after ~30 minutes; refresh tokens after 30
              days
            </span>
          </div>
          <span className="s4__pill s4__pill--enabled">enabled</span>
        </div>
      </Section>

      <Section
        title="Active sessions"
        desc={`${sessions.length} session(s) currently signed in`}
        action={
          <button
            type="button"
            className="s4__btn-danger"
            onClick={revokeAllOthers}
            disabled={sessions.filter((s) => !s.is_current).length === 0}
          >
            <LogOut size={11} strokeWidth={2.4} />
            Sign out other sessions
          </button>
        }
      >
        <div className="s4__sessions">
          {sessionsQ.isLoading ? (
            <div className="s4__placeholder">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="s4__placeholder">
              <strong>No active sessions.</strong>
            </div>
          ) : (
            <ul className="s4__sessions-list">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={`s4__session ${s.is_current ? 's4__session--current' : ''}`}
                >
                  <div className="s4__session-id">
                    <span className="s4__session-device">{s.label}</span>
                    <span className="s4__session-sub">{s.detail}</span>
                  </div>
                  <span className="s4__session-time">
                    {s.last_active
                      ? formatDateTime(s.last_active)
                      : '—'}
                  </span>
                  {s.is_current ? (
                    <span className="s4__session-pill">This device</span>
                  ) : (
                    <button
                      type="button"
                      className="s4__session-revoke"
                      onClick={() => {
                        void revokeOne(s.id);
                      }}
                    >
                      Sign out
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: Notifications
// ════════════════════════════════════════════════════════════════════
function NotificationsTab() {
  const eventsQ = useNotificationEvents();
  const update = useUpdateNotificationEvent();

  const events = eventsQ.data?.events ?? {};

  function toggle(key: string, channel: 'email' | 'in_app' | 'push') {
    const current = events[key]?.[channel] ?? false;
    update.mutate({ key, channel, enabled: !current });
  }

  return (
    <>
      <Section
        title="Delivery channels"
        desc="Choose how each event reaches you. Push uses your device's native notifier."
      >
        <div className="s4__notif">
          <header className="s4__notif-head">
            <span>Event</span>
            <span>Email</span>
            <span>In-app</span>
            <span>Push</span>
          </header>
          {EVENT_DEFS.map((n) => {
            const row = events[n.key] ?? {
              email: false,
              in_app: false,
              push: false,
            };
            return (
              <div key={n.key} className="s4__notif-row">
                <div className="s4__notif-event">
                  <span className="s4__notif-label">{n.label}</span>
                  <span className="s4__notif-desc">{n.desc}</span>
                </div>
                <Toggle
                  on={row.email}
                  onToggle={() => toggle(n.key, 'email')}
                />
                <Toggle
                  on={row.in_app}
                  onToggle={() => toggle(n.key, 'in_app')}
                />
                <Toggle
                  on={row.push}
                  onToggle={() => toggle(n.key, 'push')}
                />
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: Appearance  (pure localStorage)
// ════════════════════════════════════════════════════════════════════
function AppearanceTab() {
  const [local, setLocal] = useState<LocalUserSettings>(() =>
    loadLocalSettings(),
  );

  // Live theme from the shared store — driven by the sidebar toggle (and any
  // other surface). `appliedRef` records the theme THIS tab last pushed, so we
  // can tell our own broadcast apart from a genuine external toggle and only
  // react to the latter (otherwise mounting would silently convert a stored
  // "system" preference into a concrete light/dark).
  const { theme: liveTheme } = useThemeMode();
  // Seed with the resolved initial preference so the first sync pass treats
  // the already-applied DOM theme as "ours" and doesn't clobber a stored
  // "system" choice into a concrete light/dark on mount.
  const appliedRef = useRef<ThemeMode>(resolveThemeMode(local.theme));
  useEffect(() => {
    if (liveTheme === appliedRef.current) return; // our own change — ignore
    appliedRef.current = liveTheme;
    // An external toggle is an explicit light/dark choice; drop "system".
    setLocal((l) => (l.theme === liveTheme ? l : { ...l, theme: liveTheme }));
  }, [liveTheme]);

  // Apply on every change. Theme + accent both take effect immediately;
  // accent is mirrored as a CSS custom property so the existing tokens
  // pick it up without a full design-token swap. applyTheme is idempotent,
  // so syncing from `liveTheme` above can't trigger a feedback loop.
  useEffect(() => {
    appliedRef.current = applyTheme(local.theme);
    document.documentElement.style.setProperty('--wp-accent', local.accent);
    persistLocalSettings(local);
  }, [local]);

  return (
    <>
      <Section
        title="Theme"
        desc="Choose how WarmPulse looks. System matches your OS."
      >
        <div className="s4__theme-grid">
          {THEMES.map((t) => {
            const Icon =
              t.key === 'light' ? Sun : t.key === 'dark' ? Moon : Monitor;
            const isCurrent = t.key === local.theme;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setLocal({ ...local, theme: t.key })}
                className={`s4__theme ${isCurrent ? 's4__theme--current' : ''}`}
              >
                <span
                  className="s4__theme-preview"
                  style={{ background: t.swatch }}
                />
                <span className="s4__theme-label">
                  <Icon size={11} strokeWidth={2.4} />
                  {t.label}
                </span>
                {isCurrent && (
                  <span className="s4__theme-check">
                    <Check size={10} strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Accent color"
        desc="Used for buttons, links, and chart accents."
      >
        <div className="s4__accent-row">
          {ACCENT_COLORS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setLocal({ ...local, accent: a.hex })}
              className={`s4__accent ${a.hex === local.accent ? 's4__accent--current' : ''}`}
              style={{ background: a.hex }}
              title={a.label}
            >
              {a.hex === local.accent && (
                <Check size={10} strokeWidth={2.6} />
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Density" desc="How tightly packed the UI feels.">
        <div className="s4__seg">
          {DENSITIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setLocal({ ...local, density: d })}
              className={`s4__seg-btn ${d === local.density ? 's4__seg-btn--active' : ''}`}
            >
              {d}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Language"
        desc="UI language and date / number formatting."
      >
        <select
          className="s4__select"
          value={local.language}
          onChange={(e) => setLocal({ ...local, language: e.target.value })}
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Section>

      <Section
        title="Region &amp; Format"
        desc="Controls currency, number grouping, and date format across your account."
      >
        <RegionFormatPanel />
      </Section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab: Data & Privacy
// ════════════════════════════════════════════════════════════════════
function DataTab() {
  const wq = useWorkspaceProfile();
  const update = useUpdateWorkspaceProfile();
  const gdpr = useSubmitGdprRequest();
  const requestDelete = useRequestWorkspaceDeletion();

  const [exporting, setExporting] = useState(false);
  const [gdprEmail, setGdprEmail] = useState('');

  const retention = wq.data?.retention_days ?? 90;
  const nextRetention = retention === 90 ? 180 : 90;

  async function onExport() {
    try {
      setExporting(true);
      await exportWorkspaceCsv();
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function onChangeRetention() {
    try {
      await update.mutateAsync({ retention_days: nextRetention });
      toast.success(`Retention window set to ${nextRetention} days`);
    } catch {
      toast.error('Could not update retention window');
    }
  }

  async function onSubmitGdpr() {
    if (!gdprEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    try {
      await gdpr.mutateAsync({ subject_email: gdprEmail });
      toast.success('GDPR request received');
      setGdprEmail('');
    } catch {
      toast.error('Could not submit request');
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete workspace?',
      description:
        'This queues a deletion request. Our team permanently erases all data within 30 days. This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete workspace',
    });
    if (!ok) return;
    try {
      const res = await requestDelete.mutateAsync();
      toast.success(
        `Deletion queued · expected completion ${formatDate(res.expected_completion)}`,
      );
    } catch {
      toast.error('Could not submit deletion request');
    }
  }

  return (
    <>
      <Section
        title="Export & retention"
        desc="Download a copy of your workspace data or tune retention."
      >
        <div className="s4__data-row">
          <div className="s4__data-text">
            <span className="s4__data-label">Export workspace data</span>
            <span className="s4__data-desc">
              CSV of recent warmup logs · streams from the server
            </span>
          </div>
          <button
            type="button"
            className="s4__btn-ghost"
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Download size={11} strokeWidth={2.4} />
            )}
            {exporting ? 'Preparing…' : 'Export CSV'}
          </button>
        </div>
        <div className="s4__data-row">
          <div className="s4__data-text">
            <span className="s4__data-label">Log retention window</span>
            <span className="s4__data-desc">
              Currently {retention} days · controls how long warmup_logs are
              kept
            </span>
          </div>
          <button
            type="button"
            className="s4__btn-ghost"
            onClick={onChangeRetention}
            disabled={update.isPending}
          >
            Change to {nextRetention} days
          </button>
        </div>
      </Section>

      <Section
        title="Privacy requests"
        desc="Tools for GDPR / DPDP compliance."
      >
        <div className="s4__data-row">
          <div className="s4__data-text">
            <span className="s4__data-label">GDPR data request</span>
            <span className="s4__data-desc">
              Erase a specific contact's data from all warmup activity.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="s4__input min-w-0 sm:min-w-[220px]"
              placeholder="contact@example.com"
              value={gdprEmail}
              onChange={(e) => setGdprEmail(e.target.value)}
            />
            <button
              type="button"
              className="s4__btn-warn"
              onClick={onSubmitGdpr}
              disabled={gdpr.isPending || !gdprEmail}
            >
              Submit request
            </button>
          </div>
        </div>
      </Section>

      <Section
        title="Danger zone"
        desc="Permanent destructive actions. Owner-only."
        variant="danger"
        action={
          <span className="s4__danger-pill">
            <AlertTriangle size={11} strokeWidth={2.4} />
            Cannot be undone
          </span>
        }
      >
        <div className="s4__danger-row">
          <div className="s4__data-text">
            <span className="s4__data-label">Delete workspace</span>
            <span className="s4__data-desc">
              Permanently delete this workspace and all data · 30-day grace
              period.
            </span>
          </div>
          <button
            type="button"
            className="s4__btn-danger"
            onClick={onDelete}
            disabled={requestDelete.isPending}
          >
            <Trash2 size={11} strokeWidth={2.4} />
            Delete workspace
          </button>
        </div>
      </Section>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Shared section primitives + tiny helpers.
// ════════════════════════════════════════════════════════════════════
function Section({
  title,
  desc,
  action,
  variant,
  children,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  variant?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <section className={`s4__section ${variant ? `s4__section--${variant}` : ''}`}>
      <header className="s4__section-head">
        <div className="s4__section-head-text">
          <h3 className="s4__section-title">{title}</h3>
          <p className="s4__section-desc">{desc}</p>
        </div>
        {action ? <div className="s4__section-head-action">{action}</div> : null}
      </header>
      <div className="s4__section-body">{children}</div>
    </section>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="s4__formrow">
      <span className="s4__formrow-label">{label}</span>
      <div className="s4__formrow-control">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`s4__toggle ${on ? 's4__toggle--on' : ''}`}
    >
      <span className="s4__toggle-thumb" />
    </button>
  );
}

// Client-side avatar guard — keep in sync with avatar_service.py.
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

function avatarInitials(s: string): string {
  return (
    s
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  );
}

function avatarHue(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 56%), hsl(${(h + 40) % 360} 65% 48%))`;
}

function AvatarRow({
  email,
  displayName,
  hasAvatar,
  avatarUrl,
}: {
  email: string;
  displayName: string;
  hasAvatar: boolean | undefined;
  avatarUrl: string | null;
}) {
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  // Extract the ?v=… cache-buster from avatar_url so the blob refetches when
  // the picture changes (the URL itself is auth-gated, so we fetch a blob).
  const version = avatarUrl?.includes('v=')
    ? avatarUrl.split('v=')[1] ?? ''
    : '';
  const objectUrl = useAvatarObjectUrl(hasAvatar, version);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
      toast.error('Use a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image must be 512KB or smaller');
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast.success('Profile picture updated');
    } catch {
      toast.error('Could not upload picture');
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      toast.success('Profile picture removed');
    } catch {
      toast.error('Could not remove picture');
    }
  }

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="s4__formrow">
      <span className="s4__formrow-label">Profile picture</span>
      <div
        className="s4__formrow-control"
        style={{ display: 'flex', alignItems: 'center', gap: 16 }}
      >
        {hasAvatar && objectUrl ? (
          <img
            src={objectUrl}
            alt="Your profile"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid var(--wp-border-muted, #2a2d3a)',
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 600,
              color: '#fff',
              background: avatarHue(email || displayName || 'user'),
            }}
          >
            {avatarInitials(displayName || email)}
          </span>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            style={{ display: 'none' }}
            onChange={onPick}
          />
          <button
            type="button"
            className="s4__btn-primary"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {upload.isPending ? (
              <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
            ) : (
              <Upload size={11} strokeWidth={2.4} />
            )}
            {hasAvatar ? 'Replace' : 'Upload'}
          </button>
          {hasAvatar ? (
            <button
              type="button"
              className="s4__btn-ghost"
              onClick={onRemove}
              disabled={busy}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadingPane({ label }: { label: string }) {
  return (
    <div className="s4__placeholder">
      <Loader2
        size={14}
        strokeWidth={2.4}
        className="animate-spin"
        style={{ verticalAlign: 'middle', marginRight: 8 }}
      />
      {label}
    </div>
  );
}

