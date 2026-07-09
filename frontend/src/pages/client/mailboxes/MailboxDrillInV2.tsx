import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  Minus,
  Pause,
  Play,
  RefreshCw,
  Reply,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type {
  ContentMode,
  Mailbox,
  MailboxProvider,
  ScheduleWindow,
} from '@/features/mailboxes/types';
// Reuse the Pro mailboxes design tokens (.mb-status, .mb-dns-cell,
// .mb-provider). These are admin-token-aligned utility classes shared
// across Pro views — same palette as the Tailwind tokens below.
import '@/pages/client-design-preview/pro-mailboxes/pro-mailboxes.css';

/**
 * MailboxDrillInV2 — redesigned mailbox editing / detail side-sheet.
 *
 * Visual + UX overhaul of `MailboxDrillIn.tsx`. Renders STANDALONE with
 * built-in mock data so it can be shown in an isolated preview harness,
 * and is structured to be wired later with the exact same props + the
 * `features/mailboxes/api.ts` mutation hooks (useUpdateMailbox,
 * usePauseMailbox, useResumeMailbox, useUpdateMailboxSchedule,
 * useDnsCheck, useDeleteMailbox) and the existing DnsStatusPanel /
 * SchedulePanel / ThreadViewer / DeleteMailboxDialog sub-panels.
 *
 * Every control that exists in the live drill-in is preserved:
 *   - Overview (hero warmth gauge + ramp ladder + KPIs + activity feed)
 *   - DNS (SPF / DKIM / DMARC status + re-check)
 *   - Schedule (timezone / active days / send-window editor)
 *   - Config (daily-target slider + content-mode picker + save)
 *   - Threads (warmup thread list)
 *   - Danger (pause/resume + delete)
 *
 * Styling uses ONLY existing Tailwind tokens (bg-bg, bg-surface,
 * bg-surface-2, border-border-muted, text-text, text-text-dim,
 * text-accent, text-accent3, text-accent4) — no new colors.
 */

// ─── Prop / mock shapes ──────────────────────────────────────────────────────

export type MailboxLike = Mailbox;

export interface ActivityRow {
  id: string;
  kind: 'sent' | 'delivered' | 'reply' | 'open' | 'star' | 'rescue';
  peer: string;
  subject: string;
  at: string;
}

export interface ThreadRow {
  id: string;
  peer_email: string;
  subject: string;
  last_action_at: string;
  messages_count: number;
  status: string;
}

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

export const MOCK_MAILBOX: MailboxLike = {
  id: 'mock-pro-2',
  email_address: 'pro+2@procorp.com',
  provider: 'smtp',
  warmup_status: 'active',
  daily_target: 50,
  current_day: 21,
  warmth_score: 78,
  content_mode: 'D',
  is_paused: false,
  spf_valid: true,
  dkim_valid: true,
  dmarc_valid: true,
  schedule_window_id: 'mock-sched-1',
  schedule_window: {
    tz: 'America/New_York',
    weekday_mask: 31, // Mon–Fri
    start_hour: 9,
    end_hour: 18,
  } satisfies ScheduleWindow,
  created_at: new Date(NOW - 21 * 86_400_000).toISOString(),
  ramp_target_today: 35,
  days_remaining_in_ramp: 7,
  last_activity_at: ago(6),
  warmth_sparkline: [54, 58, 61, 63, 67, 70, 72, 74, 76, 78],
  sent_today: 28,
};

const MOCK_ACTIVITY: ActivityRow[] = [
  {
    id: 'a1',
    kind: 'reply',
    peer: 'maya.s@northwind-peers.net',
    subject: 'Re: Q3 onboarding checklist',
    at: ago(6),
  },
  {
    id: 'a2',
    kind: 'open',
    peer: 'devon@brightloop-peers.io',
    subject: 'Following up on the proposal draft',
    at: ago(22),
  },
  {
    id: 'a3',
    kind: 'sent',
    peer: 'priya.k@cedarmail-peers.com',
    subject: 'Quick question about the rollout',
    at: ago(41),
  },
  {
    id: 'a4',
    kind: 'star',
    peer: 'liam@harborline-peers.net',
    subject: 'Re: Contract review timeline',
    at: ago(73),
  },
  {
    id: 'a5',
    kind: 'rescue',
    peer: 'sara.b@meadowlark-peers.io',
    subject: 'Notes from the sync',
    at: ago(96),
  },
  {
    id: 'a6',
    kind: 'delivered',
    peer: 'noah@stonebridge-peers.com',
    subject: 'Re: Welcome aboard',
    at: ago(118),
  },
];

const MOCK_THREADS: ThreadRow[] = [
  {
    id: 't1',
    peer_email: 'maya.s@northwind-peers.net',
    subject: 'Q3 onboarding checklist',
    last_action_at: ago(6),
    messages_count: 5,
    status: 'active',
  },
  {
    id: 't2',
    peer_email: 'devon@brightloop-peers.io',
    subject: 'Following up on the proposal draft',
    last_action_at: ago(22),
    messages_count: 3,
    status: 'active',
  },
  {
    id: 't3',
    peer_email: 'priya.k@cedarmail-peers.com',
    subject: 'Quick question about the rollout',
    last_action_at: ago(41),
    messages_count: 2,
    status: 'pending',
  },
  {
    id: 't4',
    peer_email: 'liam@harborline-peers.net',
    subject: 'Contract review timeline',
    last_action_at: ago(73),
    messages_count: 7,
    status: 'active',
  },
];

// ─── Display helpers ─────────────────────────────────────────────────────────

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

function statusTone(m: MailboxLike): Tone {
  if (m.is_paused) return 'danger';
  if (m.warmup_status === 'active') return 'success';
  if (m.warmup_status === 'pending') return 'warning';
  if (m.warmup_status === 'completed') return 'info';
  return 'warning';
}

function statusLabel(m: MailboxLike): string {
  if (m.is_paused) return 'Paused';
  return m.warmup_status.charAt(0).toUpperCase() + m.warmup_status.slice(1);
}

function warmthTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

const TONE_TEXT: Record<'success' | 'warning' | 'danger', string> = {
  success: 'text-accent',
  warning: 'text-accent4',
  danger: 'text-accent3',
};

const TONE_STROKE: Record<'success' | 'warning' | 'danger', string> = {
  success: 'var(--wp-accent, #F26522)',
  warning: '#ffd54f',
  danger: '#ff6b4a',
};

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

function relativeTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  if (h === 24) return 'midnight';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// 6-step warmup ramp ladder (mirrors services/warmup/ramp.ramp_target).
const RAMP_LADDER: Array<{ label: string; startDay: number; cap: number }> = [
  { label: 'D1–3', startDay: 1, cap: 5 },
  { label: 'D4–7', startDay: 4, cap: 10 },
  { label: 'D8–14', startDay: 8, cap: 20 },
  { label: 'D15–21', startDay: 15, cap: 35 },
  { label: 'D22–28', startDay: 22, cap: 50 },
  { label: 'D29+', startDay: 29, cap: 0 },
];

// ─── Atoms ───────────────────────────────────────────────────────────────────

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  if (tone === 'info') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--wp-accent,#F26522)]" />
        {children}
      </span>
    );
  }
  const cls: Record<'success' | 'warning' | 'danger', string> = {
    success: 'bg-accent/15 text-accent',
    warning: 'bg-accent4/15 text-accent4',
    danger: 'bg-accent3/15 text-accent3',
  };
  const dot: Record<'success' | 'warning' | 'danger', string> = {
    success: 'bg-accent shadow-[0_0_6px_var(--wp-accent,#F26522)]',
    warning: 'bg-accent4 shadow-[0_0_6px_#ffd54f]',
    danger: 'bg-accent3 shadow-[0_0_6px_#ff6b4a]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
        cls[tone],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} />
      {children}
    </span>
  );
}

function ProviderSwatch({ provider, size = 40 }: { provider: MailboxProvider; size?: number }) {
  // SMTP has no .mb-provider gradient — fall back to a token-styled tile.
  if (provider === 'smtp') {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-xl border border-border-muted bg-surface-2 font-extrabold text-text-dim"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {providerLetter(provider)}
      </span>
    );
  }
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42, borderRadius: 12 }}
    >
      {providerLetter(provider)}
    </span>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-bold uppercase tracking-[0.14em] text-text-faint',
        className,
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      className={cn(
        'rounded-2xl border border-border-muted bg-surface p-4',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all',
        disabled
          ? 'cursor-not-allowed bg-surface-2 text-text-faint'
          : 'bg-accent text-bg shadow-[0_4px_18px_-4px_var(--wp-accent,#F26522)] hover:brightness-110',
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  active,
  title,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border-muted bg-surface-2 text-text-dim hover:border-accent/40 hover:text-text',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function SheetHeader({
  mb,
  paused,
  busy,
  onTogglePause,
  onRecheckDns,
  dnsBusy,
  onClose,
}: {
  mb: MailboxLike;
  paused: boolean;
  busy: boolean;
  onTogglePause: () => void;
  onRecheckDns: () => void;
  dnsBusy: boolean;
  onClose: () => void;
}) {
  const dnsValid =
    [mb.spf_valid, mb.dkim_valid, mb.dmarc_valid].filter((v) => v === true).length;

  return (
    <header className="relative border-b border-border-muted px-5 py-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(70% 60% at 100% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent) 0%, transparent 70%)',
        }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderSwatch provider={mb.provider} size={44} />
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-bold tracking-tight text-text">
              {mb.email_address}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
              <Eyebrow>{providerLabel(mb.provider)}</Eyebrow>
              <StatusPill tone={statusTone(mb)}>{statusLabel(mb)}</StatusPill>
              <span className="h-[3px] w-[3px] rounded-full bg-border-muted" />
              <span className="font-mono">Day {mb.current_day} / 28</span>
              <span className="h-[3px] w-[3px] rounded-full bg-border-muted" />
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-accent" />
                DNS {dnsValid}/3
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GhostButton
            onClick={onTogglePause}
            disabled={busy}
            aria-label={paused ? 'Resume warmup' : 'Pause warmup'}
            title={paused ? 'Resume warmup' : 'Pause warmup'}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{paused ? 'Resume' : 'Pause'}</span>
          </GhostButton>
          <GhostButton
            onClick={onRecheckDns}
            disabled={dnsBusy}
            aria-label="Re-check DNS"
            title="Re-check DNS records"
          >
            {dnsBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">DNS</span>
          </GhostButton>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-border-muted bg-surface-2 p-1.5 text-text-dim transition-colors hover:border-accent/40 hover:text-text"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function WarmthGauge({ score }: { score: number }) {
  const tone = warmthTone(score);
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--wp-border, #2a2a3a)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${TONE_STROKE[tone]})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            'font-sans text-[40px] font-black leading-none tracking-tight tabular-nums',
            TONE_TEXT[tone],
          )}
        >
          {score}
        </span>
        <Eyebrow className="mt-1">Warmth</Eyebrow>
      </div>
    </div>
  );
}

function DeltaChip({ spark }: { spark: number[] }) {
  if (spark.length < 2) {
    return <span className="text-xs text-text-faint">No trend data</span>;
  }
  const delta = spark[spark.length - 1]! - spark[0]!;
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        flat
          ? 'bg-surface-2 text-text-dim'
          : up
            ? 'bg-accent/15 text-accent'
            : 'bg-accent3/15 text-accent3',
      )}
    >
      {flat ? (
        <Minus className="h-3 w-3" />
      ) : up ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {up ? '+' : ''}
      {delta} over {spark.length}d
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 240;
  const h = 44;
  const pad = 3;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: pad + i * step,
    y: h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2),
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${path} L ${last.x} ${h - pad} L ${first.x} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full">
      <defs>
        <linearGradient id="mbv2-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--wp-accent, #F26522)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--wp-accent, #F26522)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mbv2-spark)" />
      <path
        d={path}
        fill="none"
        stroke="var(--wp-accent, #F26522)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.6} fill="var(--wp-accent, #F26522)" />
    </svg>
  );
}

function KpiTile({
  label,
  value,
  sub,
  delay = 0,
}: {
  label: string;
  value: string;
  sub: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      className="rounded-xl border border-border-muted bg-surface-2 p-3"
    >
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 font-sans text-[22px] font-extrabold leading-none tracking-tight tabular-nums text-text">
        {value}
      </div>
      <span className="mt-1 block text-[11px] text-text-dim">{sub}</span>
    </motion.div>
  );
}

function RampLadder({ currentDay }: { currentDay: number }) {
  const rampPct = Math.min(100, Math.round((currentDay / 28) * 100));
  return (
    <Panel delay={0.05}>
      <div className="flex items-center justify-between">
        <Eyebrow>Build-up progress</Eyebrow>
        <span className="font-mono text-xs font-bold text-accent">{rampPct}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border-muted">
        <motion.div
          className="h-full rounded-full bg-accent"
          style={{ boxShadow: '0 0 12px color-mix(in srgb, var(--wp-accent, #F26522) 50%, transparent)' }}
          initial={{ width: 0 }}
          animate={{ width: `${rampPct}%` }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {RAMP_LADDER.map((rung) => {
          const reached = currentDay >= rung.startDay;
          const active =
            currentDay >= rung.startDay &&
            (RAMP_LADDER[RAMP_LADDER.indexOf(rung) + 1]
              ? currentDay < RAMP_LADDER[RAMP_LADDER.indexOf(rung) + 1]!.startDay
              : true);
          return (
            <div
              key={rung.label}
              className={cn(
                'rounded-lg border px-1.5 py-2 text-center transition-colors',
                active
                  ? 'border-accent/50 bg-accent/10'
                  : reached
                    ? 'border-border-muted bg-surface-2'
                    : 'border-border-muted bg-surface',
              )}
            >
              <div
                className={cn(
                  'text-[10px] font-bold',
                  active ? 'text-accent' : reached ? 'text-text-dim' : 'text-text-faint',
                )}
              >
                {rung.label}
              </div>
              <div
                className={cn(
                  'mt-0.5 font-mono text-[11px] font-bold tabular-nums',
                  active ? 'text-text' : 'text-text-faint',
                )}
              >
                {rung.cap === 0 ? 'cap' : rung.cap}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const ACTIVITY_META: Record<
  ActivityRow['kind'],
  { icon: typeof Mail; label: string; tint: string }
> = {
  sent: { icon: Mail, label: 'Sent', tint: 'text-text-dim' },
  delivered: { icon: MailCheck, label: 'Delivered', tint: 'text-accent' },
  reply: { icon: Reply, label: 'Replied', tint: 'text-accent' },
  open: { icon: Inbox, label: 'Opened', tint: 'text-accent4' },
  star: { icon: Star, label: 'Starred', tint: 'text-accent4' },
  rescue: { icon: ShieldCheck, label: 'Spam recovery', tint: 'text-accent3' },
};

function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <Panel delay={0.1}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-text-faint">
          <Activity className="h-3 w-3" />
          Recent activity
        </span>
        <span className="font-mono text-[11px] text-text-dim">{rows.length} events</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-dim">
            <Activity className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-text">No activity yet</p>
          <p className="text-xs text-text-dim">
            Opens and replies appear here once warmup starts.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const meta = ACTIVITY_META[r.kind];
            const Icon = meta.icon;
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2',
                    meta.tint,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text">
                    <span className={meta.tint}>{meta.label}</span>{' '}
                    <span className="text-text-dim">·</span> {r.subject}
                  </p>
                  <p className="truncate text-[11px] text-text-dim">with {r.peer}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-text-faint">
                  {relativeTs(r.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Overview({ mb, activity }: { mb: MailboxLike; activity: ActivityRow[] }) {
  const warmth = Math.round(mb.warmth_score);
  const spark = mb.warmth_sparkline ?? [];
  const sentToday = Number(mb.sent_today ?? 0);
  const sentPct =
    mb.daily_target > 0 ? Math.min(100, Math.round((sentToday / mb.daily_target) * 100)) : 0;
  const rampPct = Math.min(100, Math.round((mb.current_day / 28) * 100));
  const delta = spark.length >= 2 ? spark[spark.length - 1]! - spark[0]! : 0;

  return (
    <div className="space-y-3">
      {/* Hero: warmth gauge + trend */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-2xl border border-accent/25 p-5"
        style={{
          backgroundImage:
            'radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 9%, transparent) 0%, transparent 60%)',
          backgroundColor: 'var(--wp-surface, #12121a)',
        }}
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <WarmthGauge score={warmth} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow className="text-accent">
                {providerLabel(mb.provider)} · Day {mb.current_day} of 28
              </Eyebrow>
              <DeltaChip spark={spark} />
            </div>
            <p className="mt-2 text-sm text-text-dim">
              {warmth >= 80
                ? 'Strong sender trust — maintaining steady opens and replies.'
                : warmth >= 50
                  ? 'Sender trust climbing on schedule. Keep the build-up uninterrupted.'
                  : 'Early build-up. Sender trust builds as helpers engage your mail.'}
            </p>
            <div className="mt-3">
              <Sparkline data={spark} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-dim">
              <span>
                <span className="font-semibold text-text">{sentToday}</span>/
                {mb.daily_target} sent today
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-border-muted" />
              <span>
                today's target{' '}
                <span className="font-semibold text-text">{mb.ramp_target_today}</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiTile
          label="Daily target"
          value={String(mb.daily_target)}
          sub="emails / day"
        />
        <KpiTile
          label="Today's sends"
          value={`${sentToday}/${mb.daily_target}`}
          sub={`${sentPct}% of target`}
          delay={0.04}
        />
        <KpiTile
          label="Build-up day"
          value={String(mb.current_day)}
          sub={`/ 28 (${rampPct}%)`}
          delay={0.08}
        />
        <KpiTile
          label="Warmth delta"
          value={`${delta >= 0 ? '+' : ''}${delta}`}
          sub={spark.length >= 2 ? `over ${spark.length}d` : 'no data'}
          delay={0.12}
        />
      </div>

      <RampLadder currentDay={mb.current_day} />
      <ActivityFeed rows={activity} />
    </div>
  );
}

// ─── DNS (standalone mock) ───────────────────────────────────────────────────

const DNS_ROWS: Array<{ key: 'spf' | 'dkim' | 'dmarc'; label: string; hint: string }> = [
  { key: 'spf', label: 'SPF', hint: 'Authorizes which servers can send on your behalf.' },
  { key: 'dkim', label: 'DKIM', hint: 'Cryptographically signs each message.' },
  { key: 'dmarc', label: 'DMARC', hint: 'Tells receivers how to handle failures.' },
];

function DnsTabMock({
  mb,
  onRecheck,
  busy,
}: {
  mb: MailboxLike;
  onRecheck: () => void;
  busy: boolean;
}) {
  const values = { spf: mb.spf_valid, dkim: mb.dkim_valid, dmarc: mb.dmarc_valid };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-dim">
          Your domain records (DNS) decide inbox delivery. Re-check after updating records at your DNS provider.
        </p>
        <GhostButton onClick={onRecheck} disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {busy ? 'Checking…' : 'Re-check'}
        </GhostButton>
      </div>
      <div className="space-y-2">
        {DNS_ROWS.map((row) => {
          const v = values[row.key];
          const ok = v === true;
          return (
            <div
              key={row.key}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3',
                ok
                  ? 'border-accent/30 bg-accent/5'
                  : v === false
                    ? 'border-accent3/30 bg-accent3/5'
                    : 'border-border-muted bg-surface-2/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-bg',
                  ok ? 'bg-accent' : v === false ? 'bg-accent3' : 'bg-text-dim/40',
                )}
              >
                {ok ? (
                  <Check className="h-3.5 w-3.5" />
                ) : v === false ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  '?'
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{row.label}</p>
                <p className="text-xs text-text-dim">{row.hint}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  ok
                    ? 'bg-accent/10 text-accent'
                    : v === false
                      ? 'bg-accent3/10 text-accent3'
                      : 'bg-surface-2 text-text-dim',
                )}
              >
                {ok ? 'Valid' : v === false ? 'Failing' : 'Unknown'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Schedule (standalone mock) ──────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function daysFromMask(mask: number): boolean[] {
  return WEEKDAYS.map((_, i) => (mask & (1 << i)) !== 0);
}
function maskFromDays(active: boolean[]): number {
  return active.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0);
}

function ScheduleTabMock({ mb }: { mb: MailboxLike }) {
  const initial = mb.schedule_window ?? {
    tz: 'UTC',
    weekday_mask: 31,
    start_hour: 9,
    end_hour: 17,
  };
  const [days, setDays] = useState<boolean[]>(daysFromMask(initial.weekday_mask));
  const [startHour, setStartHour] = useState(initial.start_hour);
  const [endHour, setEndHour] = useState(initial.end_hour);

  const mask = maskFromDays(days);
  const activeCount = days.filter(Boolean).length;
  const span = Math.max(1, endHour - startHour);
  const perHour = Math.max(1, Math.round(mb.daily_target / span));
  const dayPart =
    activeCount === 7
      ? 'Every day'
      : mask === 31
        ? 'Mon–Fri'
        : mask === 96
          ? 'Sat–Sun'
          : days.flatMap((on, i) => (on ? [WEEKDAYS[i]] : [])).join(', ') || 'Never';

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold text-text">Send window</p>
        </div>
        <p className="mt-2 text-xs text-text-dim">
          Warmup sends only fire during this window in the mailbox's timezone. Outside the
          window the engine waits for the next valid hour.
        </p>
        <p className="mt-3 text-sm font-medium text-text">
          {dayPart} · {fmtHour(startHour)}–{fmtHour(endHour)} {initial.tz} · ~{perHour}{' '}
          sends/hr (target {mb.daily_target}/day)
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">Timezone</p>
        <div className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-sm text-text">
          {initial.tz}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">Active days</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, i) => {
            const active = days[i];
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const next = [...days];
                  next[i] = !next[i];
                  setDays(next);
                }}
                className={cn(
                  'h-9 rounded-md border px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-muted bg-surface text-text-dim hover:bg-surface-2',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text">
          Hours ({fmtHour(startHour)} – {fmtHour(endHour)})
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-text-dim">Start</span>
            <input
              type="range"
              min={0}
              max={23}
              value={startHour}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStartHour(v);
                if (v >= endHour) setEndHour(Math.min(24, v + 1));
              }}
              className="h-2 flex-1 cursor-pointer accent-accent"
              aria-label="Start hour"
            />
            <span className="w-16 text-right text-xs tabular-nums text-text">
              {fmtHour(startHour)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-text-dim">End</span>
            <input
              type="range"
              min={1}
              max={24}
              value={endHour}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEndHour(v);
                if (v <= startHour) setStartHour(Math.max(0, v - 1));
              }}
              className="h-2 flex-1 cursor-pointer accent-accent"
              aria-label="End hour"
            />
            <span className="w-16 text-right text-xs tabular-nums text-text">
              {fmtHour(endHour)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <PrimaryButton>
          <Save className="h-4 w-4" />
          Save schedule
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── Config ──────────────────────────────────────────────────────────────────

function ConfigTab({ mb }: { mb: MailboxLike }) {
  const [dailyTarget, setDailyTarget] = useState(mb.daily_target);
  const [mode, setMode] = useState<ContentMode>(mb.content_mode);
  const dirty = dailyTarget !== mb.daily_target || mode !== mb.content_mode;

  useEffect(() => {
    setDailyTarget(mb.daily_target);
    setMode(mb.content_mode);
  }, [mb.daily_target, mb.content_mode]);

  return (
    <div className="space-y-3">
      <Panel>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">Daily target</span>
          <span className="font-mono text-sm font-bold text-accent">{dailyTarget} /day</span>
        </div>
        <input
          type="range"
          min={1}
          max={200}
          value={dailyTarget}
          onChange={(e) => setDailyTarget(Number(e.target.value))}
          className="mt-3 w-full cursor-pointer accent-accent"
          aria-label="Daily target"
        />
        <p className="mt-2 text-[11px] text-text-dim">
          The daily build-up gradually approaches this cap over 28 days.
        </p>
      </Panel>

      <Panel delay={0.04}>
        <p className="mb-3 text-sm font-semibold text-text">Content mode</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['A', 'B', 'C', 'D'] as const).map((m) => {
            const info = CONTENT_MODE_INFO[m];
            const active = mode === m;
            return (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  active
                    ? 'border-accent/45 bg-accent/10'
                    : 'border-border-muted bg-surface-2 hover:border-accent/30',
                )}
              >
                <input
                  type="radio"
                  name="content-mode-v2"
                  value={m}
                  checked={active}
                  onChange={() => setMode(m)}
                  className="mt-0.5 accent-accent"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text">
                    Mode {m} — {info.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-dim">{info.body}</p>
                </div>
              </label>
            );
          })}
        </div>
      </Panel>

      <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
        <p className="text-xs font-semibold text-text">Schedule window</p>
        <p className="mt-1 text-[11px] text-text-dim">
          Customize timezone, weekdays, and start/end hours from the{' '}
          <span className="font-mono text-accent">Schedule</span> tab. The engine only sends
          inside that window.
        </p>
      </div>

      <div className="flex justify-end">
        <PrimaryButton disabled={!dirty}>Save changes</PrimaryButton>
      </div>
    </div>
  );
}

// ─── Threads (standalone mock) ───────────────────────────────────────────────

function ThreadsTabMock({ threads }: { threads: ThreadRow[] }) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-dim">
          <MessageSquare className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-text">No threads yet</p>
        <p className="text-xs text-text-dim">Threads appear once warmup starts.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-muted overflow-hidden rounded-xl border border-border-muted bg-surface">
      {threads.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{t.subject}</p>
            <p className="truncate text-xs text-text-dim">with {t.peer_email}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-dim">
              {t.messages_count} msgs
            </span>
            <span className="font-mono text-[11px] text-text-faint">
              {relativeTs(t.last_action_at)}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-faint" />
        </li>
      ))}
    </ul>
  );
}

// ─── Danger ──────────────────────────────────────────────────────────────────

function DangerTab({
  paused,
  busy,
  onTogglePause,
  onDelete,
}: {
  paused: boolean;
  busy: boolean;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <Panel>
        <p className="text-sm font-bold text-text">Pause or resume warmup</p>
        <p className="mt-1 text-[11px] text-text-dim">
          Pausing stops all outbound warmup immediately. Inbox providers may lower your sender trust after
          24h of inactivity.
        </p>
        <div className="mt-3">
          <GhostButton onClick={onTogglePause} disabled={busy}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            {paused ? 'Resume warmup' : 'Pause warmup'}
          </GhostButton>
        </div>
      </Panel>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.05 }}
        className="rounded-2xl border border-accent3/35 p-4"
        style={{
          backgroundImage:
            'radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, #ff6b4a 8%, transparent) 0%, transparent 60%)',
          backgroundColor: 'var(--wp-surface, #12121a)',
        }}
      >
        <p className="text-sm font-bold text-accent3">Delete mailbox</p>
        <p className="mt-1 text-[11px] text-text-dim">
          Permanently removes this mailbox and its warmup history. Cannot be undone.
        </p>
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-accent3 px-3 py-2 text-xs font-bold text-bg shadow-[0_4px_18px_-4px_#ff6b4a] transition-all hover:brightness-110"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete mailbox
        </button>
      </motion.div>
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'dns' | 'schedule' | 'config' | 'threads' | 'danger';

const TABS: Array<{ id: TabId; label: string; icon: typeof Mail }> = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'dns', label: 'Domain (DNS)', icon: ShieldCheck },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'config', label: 'Config', icon: Activity },
  { id: 'threads', label: 'Threads', icon: MessageSquare },
  { id: 'danger', label: 'Danger', icon: Trash2 },
];

function TabBar({ value, onChange }: { value: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border-muted bg-surface-2 p-1">
      {TABS.map((t) => {
        const active = value === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              active
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-dim hover:text-text',
              t.id === 'danger' && active && 'text-accent3',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export function MailboxDrillInV2({
  mailbox,
  open = true,
  onClose,
}: {
  mailbox?: MailboxLike;
  open?: boolean;
  onClose?: () => void;
}) {
  const mb = mailbox ?? MOCK_MAILBOX;
  const [tab, setTab] = useState<TabId>('overview');

  // Local optimistic state — in the wired version these map to
  // usePauseMailbox / useResumeMailbox / useDnsCheck / useDeleteMailbox.
  const [paused, setPaused] = useState(mb.is_paused);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [dnsBusy, setDnsBusy] = useState(false);

  useEffect(() => {
    setPaused(mb.is_paused);
  }, [mb.is_paused]);

  const close = () => onClose?.();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const headerMb = useMemo<MailboxLike>(
    () => ({ ...mb, is_paused: paused, warmup_status: paused ? 'paused' : mb.warmup_status }),
    [mb, paused],
  );

  const togglePause = () => {
    setPauseBusy(true);
    window.setTimeout(() => {
      setPaused((p) => !p);
      setPauseBusy(false);
    }, 450);
  };

  const recheckDns = () => {
    setDnsBusy(true);
    window.setTimeout(() => setDnsBusy(false), 700);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={close}
        aria-hidden
        className="fixed inset-0 z-40"
        style={{
          background: 'color-mix(in srgb, var(--wp-bg, #0a0a0f) 78%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
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
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full flex-col font-sans text-text',
          'md:w-[80vw] md:max-w-3xl',
        )}
        style={{
          background: 'var(--wp-surface, #12121a)',
          borderLeft: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 25%, var(--wp-border, #2a2a3a))',
          boxShadow:
            '-24px 0 80px -20px color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent), -8px 0 32px -8px rgba(0,0,0,0.45)',
          backgroundImage:
            'radial-gradient(60% 40% at 100% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent) 0%, transparent 70%), radial-gradient(50% 35% at 0% 100%, color-mix(in srgb, var(--wp-accent, #F26522) 8%, transparent) 0%, transparent 70%)',
        }}
      >
        <SheetHeader
          mb={headerMb}
          paused={paused}
          busy={pauseBusy}
          onTogglePause={togglePause}
          onRecheckDns={recheckDns}
          dnsBusy={dnsBusy}
          onClose={close}
        />

        <div className="flex-1 overflow-y-auto p-5" data-lenis-prevent>
          <TabBar value={tab} onChange={setTab} />
          <div className="mt-4">
            {tab === 'overview' && <Overview mb={mb} activity={MOCK_ACTIVITY} />}
            {tab === 'dns' && (
              <DnsTabMock mb={mb} onRecheck={recheckDns} busy={dnsBusy} />
            )}
            {tab === 'schedule' && <ScheduleTabMock mb={mb} />}
            {tab === 'config' && <ConfigTab mb={mb} />}
            {tab === 'threads' && <ThreadsTabMock threads={MOCK_THREADS} />}
            {tab === 'danger' && (
              <DangerTab
                paused={paused}
                busy={pauseBusy}
                onTogglePause={togglePause}
                onDelete={() => {
                  /* wired version opens DeleteMailboxDialog */
                }}
              />
            )}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

export default MailboxDrillInV2;
