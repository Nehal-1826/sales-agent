import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Check,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { useDnsCheck, useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';
import './starter-reputation.css';

/**
 * /app/reputation — STARTER tier (H1 Health Score Hub).
 *
 * Layout:
 *   ┌─ Hero ────────────────────────────────┐
 *   │  ◯ composite gauge   summary text     │
 *   ├─ DNS  ─────┬─ Warmth ─┬─ Auth  ───────┤
 *   │ 3-record   │ gauge +  │ provider +    │
 *   │ status     │ ramp     │ creds         │
 *   └────────────┴──────────┴───────────────┘
 *
 * Composite Score = mean of three sub-scores:
 *   - DNS:    33/66/100 from how many of SPF/DKIM/DMARC are valid
 *   - Warmth: mailbox.warmth_score (0-100, server-side)
 *   - Auth:   100 for OAuth providers (gmail/outlook), 70 for raw SMTP
 *
 * Each breakdown card is colored by its own sub-score's tier:
 *   ok    ≥ 80 (green)
 *   warn  ≥ 50 (yellow)
 *   err   <  50 (red)
 *
 * Starter is single-mailbox so we read from useMailboxes()[0] rather than
 * the workspace-level reputation rollup endpoints.
 */

type StatusTone = 'ok' | 'warn' | 'err';

const TONE_LABEL: Record<StatusTone, string> = {
  ok: 'Healthy',
  warn: 'Needs attention',
  err: 'Critical',
};

export function StarterReputation() {
  const mailboxesQuery = useMailboxes();
  const mailbox = mailboxesQuery.data?.items?.[0];
  const dnsCheck = useDnsCheck();

  // ---- Empty / loading states ----
  if (!mailboxesQuery.isLoading && !mailbox) {
    return (
      <div className="sr">
        <header className="sr__head">
          <h1 className="sr__title">Sender trust & Health</h1>
          <p className="sr__sub">Inbox delivery signals for your warmup mailbox.</p>
        </header>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailbox connected"
          description="Finish onboarding to start measuring inbox delivery health."
        />
      </div>
    );
  }

  if (!mailbox) {
    return (
      <div className="sr">
        <header className="sr__head">
          <h1 className="sr__title">Sender trust & Health</h1>
          <p className="sr__sub">Loading health…</p>
        </header>
      </div>
    );
  }

  return <ReputationHub mailbox={mailbox} onRecheckDns={() => dnsCheck.mutate(mailbox.id, {
    onSuccess: () => toast.success('DNS re-checked.'),
    onError: () => toast.error('DNS check failed.'),
  })} isChecking={dnsCheck.isPending} />;
}

function ReputationHub({
  mailbox,
  onRecheckDns,
  isChecking,
}: {
  mailbox: Mailbox;
  onRecheckDns: () => void;
  isChecking: boolean;
}) {
  // Compute the three sub-scores + composite.
  const dnsScore = useMemo(() => scoreDns(mailbox), [mailbox]);
  const warmthScore = Math.round(mailbox.warmth_score ?? 0);
  const authScore = scoreAuth(mailbox);
  const composite = Math.round((dnsScore + warmthScore + authScore) / 3);

  const dnsTone = toneFor(dnsScore);
  const warmthTone = toneFor(warmthScore);
  const authTone = toneFor(authScore);
  const compositeTone = toneFor(composite);

  // Build the issues list for the hero summary.
  const issues = useMemo(() => {
    const out: string[] = [];
    if (mailbox.spf_valid !== true) out.push('SPF not valid');
    if (mailbox.dkim_valid !== true) out.push('DKIM not valid');
    if (mailbox.dmarc_valid !== true) out.push('DMARC not valid');
    if (warmthScore < 50) out.push('Warmth still building');
    if (authScore < 80) out.push('Generic SMTP auth (consider OAuth)');
    return out;
  }, [mailbox, warmthScore, authScore]);

  return (
    <div className="sr">
      <header className="sr__head">
        <div>
          <h1 className="sr__title">Sender trust &amp; Health</h1>
          <p className="sr__sub">
            Single health score for {mailbox.email_address}, made up of DNS, warmth, and
            authentication.
          </p>
        </div>
      </header>

      {/* ---------- Hero — composite gauge + summary ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`sr-hero sr-hero--${compositeTone}`}
      >
        <CompositeGauge value={composite} tone={compositeTone} />
        <div className="sr-hero__text">
          <span className={`sr-hero__pill sr-hero__pill--${compositeTone}`}>
            {compositeTone === 'ok' ? (
              <ShieldCheck size={11} strokeWidth={2.4} />
            ) : compositeTone === 'warn' ? (
              <TriangleAlert size={11} strokeWidth={2.4} />
            ) : (
              <ShieldAlert size={11} strokeWidth={2.4} />
            )}
            {TONE_LABEL[compositeTone]}
          </span>
          <h2 className="sr-hero__headline">
            {compositeTone === 'ok'
              ? 'Your sender trust is in good shape.'
              : compositeTone === 'warn'
                ? 'A few signals could use attention.'
                : 'Sender trust needs immediate attention.'}
          </h2>
          <p className="sr-hero__detail">
            {issues.length === 0 ? (
              <>
                Every signal we measure is healthy — keep the warmup running and your
                domain trust will continue to climb.
              </>
            ) : (
              <>
                We found <span className="sr-hero__detail-em">{issues.length}</span>{' '}
                {issues.length === 1 ? 'issue' : 'issues'}:{' '}
                {issues.slice(0, 3).join(' · ')}
                {issues.length > 3 && ` · +${issues.length - 3} more`}
              </>
            )}
          </p>
          <div className="sr-hero__sub-scores">
            <SubScore label="DNS" score={dnsScore} tone={dnsTone} />
            <span className="sr-hero__sub-divider" />
            <SubScore label="Warmth" score={warmthScore} tone={warmthTone} />
            <span className="sr-hero__sub-divider" />
            <SubScore label="Auth" score={authScore} tone={authTone} />
          </div>
        </div>
      </motion.section>

      {/* ---------- Breakdown — 3 cards ---------- */}
      <div className="sr-cards">
        <DnsCard
          mailbox={mailbox}
          tone={dnsTone}
          score={dnsScore}
          onRecheck={onRecheckDns}
          isChecking={isChecking}
        />
        <WarmthCard mailbox={mailbox} tone={warmthTone} score={warmthScore} />
        <AuthCard mailbox={mailbox} tone={authTone} score={authScore} />
      </div>
    </div>
  );
}

/* ============================================================================
   Composite gauge — conic-gradient ring with score in the middle
============================================================================ */
function CompositeGauge({ value, tone }: { value: number; tone: StatusTone }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`sr-gauge sr-gauge--${tone}`}
      style={{ ['--pct' as string]: String(pct) } as React.CSSProperties}
      aria-label={`Health score ${pct} out of 100`}
    >
      <div className="sr-gauge__inner">
        <span className="sr-gauge__num">{pct}</span>
        <span className="sr-gauge__label">Health</span>
      </div>
    </div>
  );
}

function SubScore({ label, score, tone }: { label: string; score: number; tone: StatusTone }) {
  return (
    <span className="sr-hero__sub-score">
      <span className={`sr-hero__sub-dot sr-hero__sub-dot--${tone}`} />
      <span className="sr-hero__sub-label">{label}</span>
      <span className="sr-hero__sub-num">{score}</span>
    </span>
  );
}

/* ============================================================================
   DNS breakdown card — SPF / DKIM / DMARC rows + re-check button
============================================================================ */
function DnsCard({
  mailbox,
  tone,
  score,
  onRecheck,
  isChecking,
}: {
  mailbox: Mailbox;
  tone: StatusTone;
  score: number;
  onRecheck: () => void;
  isChecking: boolean;
}) {
  const records: Array<{ name: 'SPF' | 'DKIM' | 'DMARC'; valid: boolean | null }> = [
    { name: 'SPF', valid: mailbox.spf_valid },
    { name: 'DKIM', valid: mailbox.dkim_valid },
    { name: 'DMARC', valid: mailbox.dmarc_valid },
  ];
  const validCount = records.filter((r) => r.valid === true).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.05 }}
      className={`sr-card sr-card--${tone}`}
    >
      <header className="sr-card__head">
        <span className={`sr-card__icon sr-card__icon--${tone}`}>
          <ShieldCheck size={13} strokeWidth={2.4} />
        </span>
        <div className="sr-card__title-wrap">
          <span className="sr-card__title">Domain records (DNS) authentication</span>
          <span className={`sr-card__status sr-card__status--${tone}`}>
            {validCount}/3 records valid · {score}/100
          </span>
        </div>
      </header>

      <div className="sr-card__body">
        {records.map((r) => {
          const state: StatusTone = r.valid === true ? 'ok' : r.valid === false ? 'err' : 'warn';
          return (
            <div key={r.name} className="sr-dns-row">
              <span className={`sr-dns-row__icon sr-dns-row__icon--${state}`}>
                {state === 'ok' ? (
                  <Check size={11} strokeWidth={3} />
                ) : state === 'err' ? (
                  <X size={11} strokeWidth={3} />
                ) : (
                  <TriangleAlert size={11} strokeWidth={3} />
                )}
              </span>
              <span className="sr-dns-row__name">{r.name}</span>
              <span className={`sr-dns-row__pill sr-dns-row__pill--${state}`}>
                {state === 'ok' ? 'Valid' : state === 'err' ? 'Missing' : 'Unknown'}
              </span>
            </div>
          );
        })}
      </div>

      <footer className="sr-card__foot">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRecheck}
          disabled={isChecking}
          leftIcon={
            isChecking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )
          }
        >
          {isChecking ? 'Checking…' : 'Re-check DNS'}
        </Button>
        <Link to="/app/mailboxes" className="sr-card__link">
          Open mailbox DNS tab
          <ArrowRight size={11} strokeWidth={2.4} />
        </Link>
      </footer>
    </motion.section>
  );
}

/* ============================================================================
   Warmth breakdown card — warmth gauge + day-in-ramp + progress
============================================================================ */
function WarmthCard({
  mailbox,
  tone,
  score,
}: {
  mailbox: Mailbox;
  tone: StatusTone;
  score: number;
}) {
  const day = mailbox.current_day ?? 0;
  const remaining = mailbox.days_remaining_in_ramp ?? 0;
  const target = mailbox.daily_target ?? 0;
  const rampTarget = mailbox.ramp_target_today ?? 0;
  const rampPct = target > 0 ? Math.min(100, Math.round((rampTarget / target) * 100)) : 0;

  const label =
    score >= 80 ? 'Healthy sender' : score >= 50 ? 'Warming up' : score >= 20 ? 'Early days' : 'Just starting';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.1 }}
      className={`sr-card sr-card--${tone}`}
    >
      <header className="sr-card__head">
        <span className={`sr-card__icon sr-card__icon--${tone}`}>
          <Gauge size={13} strokeWidth={2.4} />
        </span>
        <div className="sr-card__title-wrap">
          <span className="sr-card__title">Warmth Score</span>
          <span className={`sr-card__status sr-card__status--${tone}`}>
            {label} · {score}/100
          </span>
        </div>
      </header>

      <div className="sr-card__body sr-card__body--center">
        <div
          className={`sr-mini-gauge sr-mini-gauge--${tone}`}
          style={{ ['--pct' as string]: String(score) } as React.CSSProperties}
          aria-label={`Warmth score ${score}`}
        >
          <span className="sr-mini-gauge__num">{score}</span>
        </div>

        <div className="sr-warmth-meta">
          <div className="sr-warmth-meta__row">
            <span className="sr-warmth-meta__label">Day in build-up</span>
            <span className="sr-warmth-meta__val">{day}</span>
          </div>
          <div className="sr-warmth-meta__row">
            <span className="sr-warmth-meta__label">Days remaining</span>
            <span className="sr-warmth-meta__val">{remaining}</span>
          </div>
          <div className="sr-warmth-meta__row">
            <span className="sr-warmth-meta__label">Today's ceiling</span>
            <span className="sr-warmth-meta__val">
              {rampTarget}<span className="sr-warmth-meta__val-dim"> / {target}</span>
            </span>
          </div>
          <div className="sr-mini-track">
            <motion.div
              className={`sr-mini-track__fill sr-mini-track__fill--${tone}`}
              initial={{ width: 0 }}
              animate={{ width: `${rampPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      <footer className="sr-card__foot">
        <Link to="/app/activity" className="sr-card__link">
          <Activity size={11} strokeWidth={2.4} />
          View activity
          <ArrowRight size={11} strokeWidth={2.4} />
        </Link>
      </footer>
    </motion.section>
  );
}

/* ============================================================================
   Auth breakdown card — provider + connection method
============================================================================ */
function AuthCard({
  mailbox,
  tone,
  score,
}: {
  mailbox: Mailbox;
  tone: StatusTone;
  score: number;
}) {
  const isOAuth = mailbox.provider === 'gmail' || mailbox.provider === 'outlook';
  const providerLabel = prettyProvider(mailbox.provider);
  const methodLabel = isOAuth ? 'OAuth 2.0' : 'SMTP + App Password';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.15 }}
      className={`sr-card sr-card--${tone}`}
    >
      <header className="sr-card__head">
        <span className={`sr-card__icon sr-card__icon--${tone}`}>
          <KeyRound size={13} strokeWidth={2.4} />
        </span>
        <div className="sr-card__title-wrap">
          <span className="sr-card__title">Provider Authentication</span>
          <span className={`sr-card__status sr-card__status--${tone}`}>
            {isOAuth ? 'OAuth' : 'SMTP'} · {score}/100
          </span>
        </div>
      </header>

      <div className="sr-card__body">
        <div className="sr-auth-row">
          <span className="sr-auth-row__label">Provider</span>
          <span className="sr-auth-row__val">{providerLabel}</span>
        </div>
        <div className="sr-auth-row">
          <span className="sr-auth-row__label">Method</span>
          <span className="sr-auth-row__val">
            {isOAuth ? <Lock size={11} strokeWidth={2.4} /> : <KeyRound size={11} strokeWidth={2.4} />}
            {methodLabel}
          </span>
        </div>
        <div className="sr-auth-row">
          <span className="sr-auth-row__label">Login details</span>
          <span className="sr-auth-row__val">
            <Check size={11} strokeWidth={3} style={{ color: 'rgb(242, 101, 34)' }} />
            Encrypted at rest
          </span>
        </div>

        {!isOAuth && (
          <p className="sr-auth-hint">
            <Sparkles size={11} strokeWidth={2.4} />
            OAuth providers (Gmail, Outlook) score higher than raw SMTP because tokens
            rotate without exposing your password.
          </p>
        )}
      </div>

      <footer className="sr-card__foot">
        <Link to="/app/mailboxes" className="sr-card__link">
          Open mailbox settings
          <ArrowRight size={11} strokeWidth={2.4} />
        </Link>
      </footer>
    </motion.section>
  );
}

/* ============================================================================
   Helpers
============================================================================ */
function scoreDns(mailbox: Mailbox): number {
  let valid = 0;
  if (mailbox.spf_valid === true) valid++;
  if (mailbox.dkim_valid === true) valid++;
  if (mailbox.dmarc_valid === true) valid++;
  // 0 → 30 (penalize unknown but not 0), 1 → 60, 2 → 80, 3 → 100
  return [30, 60, 80, 100][valid] ?? 0;
}

function scoreAuth(mailbox: Mailbox): number {
  return mailbox.provider === 'gmail' || mailbox.provider === 'outlook' ? 100 : 70;
}

function toneFor(score: number): StatusTone {
  if (score >= 80) return 'ok';
  if (score >= 50) return 'warn';
  return 'err';
}

function prettyProvider(p: string): string {
  const lower = String(p).toLowerCase();
  if (lower.includes('gmail') || lower.includes('google')) return 'Gmail / Google Workspace';
  if (lower.includes('outlook') || lower.includes('365')) return 'Outlook / Microsoft 365';
  if (lower.includes('yahoo')) return 'Yahoo Mail';
  if (lower.includes('zoho')) return 'Zoho Mail';
  if (lower === 'smtp') return 'Generic SMTP';
  return String(p).toUpperCase();
}

export default StarterReputation;
