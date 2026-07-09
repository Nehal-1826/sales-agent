import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Pause, Play, Trash2, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
} from '@/components/ui/AppTabs';
import { toast } from '@/components/ui/AppToast';
import {
  useMailbox,
  usePauseMailbox,
  useResumeMailbox,
  useUpdateMailbox,
} from '@/features/mailboxes/api';
import type { Mailbox, ContentMode, MailboxProvider } from '@/features/mailboxes/types';
import { cn } from '@/lib/cn';
import { DnsStatusPanel } from './DnsStatusPanel';
import { SchedulePanel } from './SchedulePanel';
import { ThreadViewer } from './ThreadViewer';
import { DeleteMailboxDialog } from './DeleteMailboxDialog';
// Reuse the Pro mailboxes design tokens (.mb-status, .mb-dns-cell, .mb-provider).
// These are admin-token-aligned utility classes shared across Pro views.
import '@/pages/client-design-preview/pro-mailboxes/pro-mailboxes.css';
import { formatDateTime } from '@/lib/format';

const CONTENT_MODE_INFO: Record<ContentMode, { title: string; body: string }> = {
  A: {
    title: 'Transactional',
    body: 'Short, neutral business threads. Highest inbox delivery baseline.',
  },
  B: {
    title: 'Conversational',
    body: 'Casual multi-message replies. Good for relationship signals.',
  },
  C: { title: 'Newsletter', body: 'Longer marketing-style content. Tests promotions folder.' },
  D: { title: 'Mixed', body: 'Rotates between modes A/B/C with human jitter.' },
};

type Tone = 'success' | 'warning' | 'danger' | 'info';

function statusTone(m: Mailbox): Tone {
  if (m.is_paused) return 'danger';
  if (m.warmup_status === 'active') return 'success';
  if (m.warmup_status === 'pending') return 'warning';
  if (m.warmup_status === 'completed') return 'info';
  return 'warning';
}

function statusLabel(m: Mailbox): string {
  if (m.is_paused) return 'Paused';
  return m.warmup_status.charAt(0).toUpperCase() + m.warmup_status.slice(1);
}

function warmthTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function providerLabel(p: MailboxProvider): string {
  switch (p) {
    case 'gmail':
      return 'Gmail';
    case 'outlook':
      return 'Outlook';
    case 'yahoo':
      return 'Yahoo';
    case 'smtp':
      return 'SMTP';
  }
}

function providerLetter(p: MailboxProvider): string {
  switch (p) {
    case 'gmail':
      return 'G';
    case 'outlook':
      return 'O';
    case 'yahoo':
      return 'Y';
    case 'smtp':
      return 'S';
  }
}

// ─── Reusable token-styled atoms ────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'var(--wp-surface)',
  border: '1px solid var(--wp-border)',
  borderRadius: 16,
  padding: 14,
};

const glassCardSoft: React.CSSProperties = {
  background: 'var(--wp-surface-2)',
  border: '1px solid var(--wp-border)',
  borderRadius: 12,
  padding: 12,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--wp-text-faint)',
  fontWeight: 700,
};

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  // info uses the violet accent (no mb-status--info exists, hand-roll it).
  if (tone === 'info') {
    return (
      <span
        className="mb-status"
        style={{
          background: 'color-mix(in srgb, var(--wp-accent) 18%, transparent)',
          color: 'var(--wp-accent-2)',
        }}
      >
        <span
          className="mb-status__dot"
          style={{
            background: 'var(--wp-accent)',
            boxShadow: '0 0 6px var(--wp-accent)',
          }}
        />
        {children}
      </span>
    );
  }
  return (
    <span className={`mb-status mb-status--${tone}`}>
      <span className={`mb-status__dot mb-status__dot--${tone}`} />
      {children}
    </span>
  );
}

function ProviderSwatch({ provider, size = 36 }: { provider: MailboxProvider; size?: number }) {
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {providerLetter(provider)}
    </span>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function Overview({ mailbox }: { mailbox: Mailbox }) {
  const warmth = Math.round(mailbox.warmth_score);
  const tone = warmthTone(warmth);
  const rampPct = Math.min(100, Math.round((mailbox.current_day / 28) * 100));
  const sentToday = Number(mailbox.sent_today ?? 0);
  const sentPct =
    mailbox.daily_target > 0
      ? Math.min(100, Math.round((sentToday / mailbox.daily_target) * 100))
      : 0;

  return (
    <div className="space-y-4">
      {/* Warmth orb hero — echoes the M4 Carousel hero on ProMailboxes */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        style={{
          ...glassCard,
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: 16,
          alignItems: 'center',
          borderColor: 'color-mix(in srgb, var(--wp-accent) 22%, var(--wp-border))',
          background:
            'radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--wp-accent) 9%, transparent) 0%, transparent 60%), var(--wp-surface)',
        }}
      >
        <div
          className={`m4__hero-art m4__hero-art--${mailbox.provider}`}
          style={{ width: 120, height: 120, minWidth: 120 }}
        >
          <span className="m4__hero-art-num">{warmth}</span>
          <span className="m4__hero-art-lbl">warmth</span>
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ ...eyebrowStyle, color: 'var(--wp-accent-2)' }}>
            {providerLabel(mailbox.provider)} · Day {mailbox.current_day} of 28
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--wp-text-dim)' }}>
              {sentToday}/{mailbox.daily_target} sent today
            </span>
            <span
              style={{
                width: 3,
                height: 3,
                borderRadius: 999,
                background: 'var(--wp-border-strong)',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--wp-text-dim)' }}>
              target today {mailbox.ramp_target_today}
            </span>
          </div>
          <div className="m4__hero-bar" aria-hidden>
            <span
              className={`m4__hero-bar-fill m4__hero-bar-fill--${tone}`}
              style={{ width: `${sentPct}%` }}
            />
          </div>
        </div>
      </motion.div>

      {/* Stat tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}
      >
        <StatTile label="Daily target" value={String(mailbox.daily_target)} sub="emails/day" />
        <StatTile
          label="Today's target"
          value={String(mailbox.ramp_target_today)}
          sub="build-up step"
        />
        <StatTile
          label="Build-up day"
          value={`${mailbox.current_day}`}
          sub={`/ 28 (${rampPct}%)`}
        />
        <StatTile
          label="Sent today"
          value={String(sentToday)}
          sub={`${sentPct}% of target`}
        />
      </div>

      {/* Ramp progress */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.05 }}
        style={glassCard}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={eyebrowStyle}>Build-up progress</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: 'var(--wp-accent-2)',
              fontWeight: 700,
            }}
          >
            {rampPct}%
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            height: 6,
            borderRadius: 999,
            background: 'var(--wp-border)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${rampPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              height: '100%',
              borderRadius: 999,
              background:
                'linear-gradient(90deg, var(--wp-accent) 0%, var(--wp-accent-2) 100%)',
              boxShadow: '0 0 12px color-mix(in srgb, var(--wp-accent) 50%, transparent)',
            }}
          />
        </div>
        <p style={{ marginTop: 8, fontSize: 11.5, color: 'var(--wp-text-dim)' }}>
          {mailbox.days_remaining_in_ramp > 0
            ? `${mailbox.days_remaining_in_ramp} day${mailbox.days_remaining_in_ramp === 1 ? '' : 's'} remaining in build-up.`
            : 'Build-up complete — maintenance mode.'}
        </p>
      </motion.div>

      {/* Last activity row */}
      <div
        style={{
          ...glassCardSoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--wp-text-dim)' }}>Last activity</span>
        <span style={{ fontSize: 12, color: 'var(--wp-text)', fontWeight: 500 }}>
          {mailbox.last_activity_at
            ? formatDateTime(mailbox.last_activity_at)
            : 'No activity yet'}
        </span>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={glassCardSoft}
    >
      <span style={eyebrowStyle}>{label}</span>
      <div
        style={{
          marginTop: 4,
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: 'var(--wp-text)',
        }}
      >
        {value}
      </div>
      <span style={{ marginTop: 4, fontSize: 11, color: 'var(--wp-text-dim)' }}>{sub}</span>
    </motion.div>
  );
}

function ConfigTab({ mailbox }: { mailbox: Mailbox }) {
  const update = useUpdateMailbox();
  const [dailyTarget, setDailyTarget] = useState(mailbox.daily_target);
  const [mode, setMode] = useState<ContentMode>(mailbox.content_mode);
  const dirty = dailyTarget !== mailbox.daily_target || mode !== mailbox.content_mode;

  useEffect(() => {
    setDailyTarget(mailbox.daily_target);
    setMode(mailbox.content_mode);
  }, [mailbox.daily_target, mailbox.content_mode]);

  const save = () => {
    update.mutate(
      { id: mailbox.id, payload: { daily_target: dailyTarget, content_mode: mode } },
      {
        onSuccess: () => toast.success('Saved'),
        onError: () => toast.error('Failed to save'),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Daily target slider */}
      <div style={glassCard}>
        <label
          htmlFor="daily-target"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span style={{ fontSize: 13, color: 'var(--wp-text)', fontWeight: 600 }}>
            Daily target
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              color: 'var(--wp-accent-2)',
              fontWeight: 700,
            }}
          >
            {dailyTarget} /day
          </span>
        </label>
        <input
          id="daily-target"
          type="range"
          min={1}
          max={200}
          value={dailyTarget}
          onChange={(e) => setDailyTarget(Number(e.target.value))}
          style={{
            marginTop: 10,
            width: '100%',
            accentColor: 'var(--wp-accent)',
          }}
        />
        <p style={{ marginTop: 6, fontSize: 11.5, color: 'var(--wp-text-dim)' }}>
          The daily build-up will gradually approach this cap over 28 days.
        </p>
      </div>

      {/* Content mode picker */}
      <div style={glassCard}>
        <p style={{ fontSize: 13, color: 'var(--wp-text)', fontWeight: 600, marginBottom: 10 }}>
          Content mode
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 8,
          }}
        >
          {(['A', 'B', 'C', 'D'] as const).map((m) => {
            const info = CONTENT_MODE_INFO[m];
            const active = mode === m;
            return (
              <label
                key={m}
                style={{
                  display: 'flex',
                  cursor: 'pointer',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: 12,
                  borderRadius: 12,
                  background: active
                    ? 'color-mix(in srgb, var(--wp-accent) 10%, var(--wp-surface-2))'
                    : 'var(--wp-surface-2)',
                  border: `1px solid ${active ? 'color-mix(in srgb, var(--wp-accent) 45%, var(--wp-border))' : 'var(--wp-border)'}`,
                  transition: 'background 160ms, border-color 160ms',
                }}
              >
                <input
                  type="radio"
                  name="content-mode"
                  value={m}
                  checked={active}
                  onChange={() => setMode(m)}
                  style={{ marginTop: 2, accentColor: 'var(--wp-accent)' }}
                />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--wp-text)', fontWeight: 600 }}>
                    Mode {m} — {info.title}
                  </p>
                  <p style={{ marginTop: 2, fontSize: 11.5, color: 'var(--wp-text-dim)' }}>
                    {info.body}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Schedule hint */}
      <div
        style={{
          ...glassCardSoft,
          fontSize: 11.5,
          color: 'var(--wp-text-dim)',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--wp-text)', fontWeight: 600 }}>Schedule window</p>
        <p style={{ marginTop: 4 }}>
          Customize the timezone, weekdays, and start/end hours from the{' '}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--wp-accent-2)',
              fontWeight: 600,
            }}
          >
            Schedule
          </span>{' '}
          tab. The warmup engine only sends inside this window.
        </p>
      </div>

      {/* Save action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || update.isPending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 10,
            border: 'none',
            cursor: !dirty || update.isPending ? 'not-allowed' : 'pointer',
            background:
              !dirty || update.isPending
                ? 'var(--wp-surface-2)'
                : 'linear-gradient(135deg, var(--wp-accent) 0%, var(--wp-accent-2) 100%)',
            color: !dirty || update.isPending ? 'var(--wp-text-faint)' : '#fff',
            fontSize: 13,
            fontWeight: 700,
            boxShadow:
              !dirty || update.isPending
                ? 'none'
                : '0 4px 18px color-mix(in srgb, var(--wp-accent) 32%, transparent)',
            transition: 'transform 140ms',
          }}
        >
          {update.isPending ? (
            <>
              <Loader2 size={14} strokeWidth={2.4} className="animate-spin" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </button>
      </div>
    </div>
  );
}

function DangerTab({ mailbox, onDelete }: { mailbox: Mailbox; onDelete: () => void }) {
  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const busy = pause.isPending || resume.isPending;

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        style={glassCard}
      >
        <p style={{ fontSize: 13, color: 'var(--wp-text)', fontWeight: 700 }}>
          Pause or resume warmup
        </p>
        <p style={{ marginTop: 4, fontSize: 11.5, color: 'var(--wp-text-dim)' }}>
          Pausing stops all outbound warmup immediately. Inbox providers may lower your sender trust after 24h
          of inactivity.
        </p>
        <div style={{ marginTop: 12 }}>
          {mailbox.is_paused ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                resume.mutate(mailbox.id, {
                  onSuccess: () => toast.success('Resumed'),
                })
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 10,
                border: '1px solid var(--wp-border)',
                background: 'var(--wp-surface-2)',
                color: 'var(--wp-text)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <Play size={13} strokeWidth={2.4} />
              Resume warmup
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                pause.mutate(mailbox.id, {
                  onSuccess: () => toast.success('Paused'),
                })
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 10,
                border: '1px solid var(--wp-border)',
                background: 'var(--wp-surface-2)',
                color: 'var(--wp-text)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <Pause size={13} strokeWidth={2.4} />
              Pause warmup
            </button>
          )}
        </div>
      </motion.div>

      {/* Danger zone — uses --wp-danger token but stays in the glass-card family */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.05 }}
        style={{
          ...glassCard,
          borderColor: 'color-mix(in srgb, var(--wp-danger) 35%, var(--wp-border))',
          background:
            'radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--wp-danger) 8%, transparent) 0%, transparent 60%), var(--wp-surface)',
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--wp-danger)', fontWeight: 700 }}>
          Delete mailbox
        </p>
        <p style={{ marginTop: 4, fontSize: 11.5, color: 'var(--wp-text-dim)' }}>
          Permanently removes this mailbox and its warmup history. Cannot be undone.
        </p>
        <button
          type="button"
          onClick={onDelete}
          style={{
            marginTop: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 10,
            border: 'none',
            background: 'var(--wp-danger)',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow:
              '0 4px 18px color-mix(in srgb, var(--wp-danger) 30%, transparent)',
          }}
        >
          <Trash2 size={13} strokeWidth={2.4} />
          Delete mailbox
        </button>
      </motion.div>
    </div>
  );
}

export function MailboxDrillIn() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useMailbox(id);
  const [confirmDelete, setConfirmDelete] = useState<Mailbox | null>(null);

  const close = () => navigate('/app/mailboxes');

  // Close on escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'color-mix(in srgb, var(--wp-bg) 78%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={close}
        aria-hidden
      />
      <motion.aside
        key="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Mailbox details"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={cn('fixed right-0 top-0 z-50 flex h-full w-full flex-col', 'md:w-[80vw] md:max-w-3xl')}
        style={{
          background: 'var(--wp-surface)',
          // Subtle violet glow on the left edge — the "Pro" tier signal
          borderLeft:
            '1px solid color-mix(in srgb, var(--wp-accent) 25%, var(--wp-border))',
          boxShadow:
            '-24px 0 80px -20px color-mix(in srgb, var(--wp-accent) 18%, transparent), -8px 0 32px -8px rgba(0,0,0,0.45)',
          color: 'var(--wp-text)',
          fontFamily: "'Outfit', system-ui, sans-serif",
          // Ambient gradient orb in the top-right — the "warmth orb" motif
          backgroundImage:
            'radial-gradient(60% 40% at 100% 0%, color-mix(in srgb, var(--wp-accent) 12%, transparent) 0%, transparent 70%), radial-gradient(50% 35% at 0% 100%, color-mix(in srgb, var(--wp-accent-2) 8%, transparent) 0%, transparent 70%)',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: 20,
            borderBottom: '1px solid var(--wp-border)',
          }}
        >
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            {isLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : data ? (
              <>
                <ProviderSwatch provider={data.provider} size={40} />
                <div style={{ minWidth: 0 }}>
                  <h2
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      color: 'var(--wp-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 380,
                    }}
                  >
                    {data.email_address}
                  </h2>
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11,
                      color: 'var(--wp-text-dim)',
                    }}
                  >
                    <span style={eyebrowStyle}>{providerLabel(data.provider)}</span>
                    <StatusPill tone={statusTone(data)}>{statusLabel(data)}</StatusPill>
                    <span
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: 999,
                        background: 'var(--wp-border-strong)',
                      }}
                    />
                    <span>Day {data.current_day}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              padding: 6,
              borderRadius: 8,
              border: '1px solid var(--wp-border)',
              background: 'var(--wp-surface-2)',
              color: 'var(--wp-text-dim)',
              cursor: 'pointer',
              transition: 'color 160ms, background 160ms, border-color 160ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--wp-text)';
              e.currentTarget.style.borderColor = 'var(--wp-accent-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--wp-text-dim)';
              e.currentTarget.style.borderColor = 'var(--wp-border)';
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </header>

        <div
          style={{ flex: 1, overflowY: 'auto', padding: 20 }}
          data-lenis-prevent
        >
          {isError || (!isLoading && !data) ? (
            <EmptyState title="Mailbox not found" description="It may have been deleted." />
          ) : isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <AppTabs defaultValue="overview">
              <AppTabsList className="flex-wrap">
                <AppTabsTrigger value="overview">Overview</AppTabsTrigger>
                <AppTabsTrigger value="dns">Domain (DNS)</AppTabsTrigger>
                <AppTabsTrigger value="schedule">Schedule</AppTabsTrigger>
                <AppTabsTrigger value="config">Config</AppTabsTrigger>
                <AppTabsTrigger value="threads">Threads</AppTabsTrigger>
                <AppTabsTrigger value="danger">Danger</AppTabsTrigger>
              </AppTabsList>

              <AppTabsContent value="overview">
                <Overview mailbox={data} />
              </AppTabsContent>
              <AppTabsContent value="dns">
                <DnsStatusPanel mailbox={data} />
              </AppTabsContent>
              <AppTabsContent value="schedule">
                <SchedulePanel mailbox={data} />
              </AppTabsContent>
              <AppTabsContent value="config">
                <ConfigTab mailbox={data} />
              </AppTabsContent>
              <AppTabsContent value="threads">
                <ThreadViewer mailboxId={data.id} />
              </AppTabsContent>
              <AppTabsContent value="danger">
                <DangerTab mailbox={data} onDelete={() => setConfirmDelete(data)} />
              </AppTabsContent>
            </AppTabs>
          )}
        </div>
      </motion.aside>

      <DeleteMailboxDialog
        mailbox={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onDeleted={close}
      />
    </AnimatePresence>
  );
}
