import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  Pause,
  Play,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { useMailboxes, usePauseMailbox, useResumeMailbox } from '@/features/mailboxes/api';
import type { Mailbox, MailboxProvider, MailboxStatus } from '@/features/mailboxes/types';
import { AddMailboxDialog } from './AddMailboxDialog';
// TODO: lift pro-mailboxes.css into pages/client/mailboxes/ during a future
// cleanup pass — production code shouldn't import from /client-design-preview/.
import '@/pages/client-design-preview/pro-mailboxes/pro-mailboxes.css';

/**
 * /app/mailboxes for Pro tier — locked M4 Carousel design with real data.
 * Carousel stage shows one mailbox at a time, thumbnail strip below.
 */
export function ProMailboxes() {
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data?.items ?? [];
  const [idx, setIdx] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const pause = usePauseMailbox();
  const resume = useResumeMailbox();

  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mailboxes</h1>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailboxes connected"
          description="Pro plan supports up to 10 mailboxes. Connect your first to start warming up."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Connect a mailbox
            </Button>
          }
        />
        <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  // Skeleton while loading
  if (mailboxesQuery.isLoading) {
    return (
      <div className="m4">
        <div className="m4__stage">
          <div className="h-80 w-full animate-pulse rounded-2xl bg-surface-2/60" />
        </div>
      </div>
    );
  }

  const safeIdx = Math.min(idx, mailboxes.length - 1);
  const m = mailboxes[safeIdx]!;
  const tone = toneFor(m);
  const sentToday = Number(m.sent_today ?? 0);
  const sentPct =
    m.daily_target > 0
      ? Math.min(100, Math.round((sentToday / m.daily_target) * 100))
      : 0;

  const prev = () =>
    setIdx((i) => (i - 1 + mailboxes.length) % mailboxes.length);
  const next = () => setIdx((i) => (i + 1) % mailboxes.length);

  const togglePending = pause.isPending || resume.isPending;
  const handlePauseToggle = () => {
    // Mirror the button's own label branch (paused → Resume, else Pause)
    // so the action always matches what the user sees.
    if (m.warmup_status === 'paused') {
      resume.mutate(m.id, {
        onSuccess: () => toast.success('Mailbox resumed'),
        onError: () => toast.error('Failed to resume'),
      });
    } else {
      pause.mutate(m.id, {
        onSuccess: () => toast.success('Mailbox paused'),
        onError: () => toast.error('Failed to pause'),
      });
    }
  };

  const spark = m.warmth_sparkline ?? [];

  return (
    <div className="m4">
      {/* Hero stage */}
      <div className="m4__stage">
        {mailboxes.length > 1 && (
          <button
            type="button"
            className="m4__nav m4__nav--prev"
            onClick={prev}
            aria-label="Previous mailbox"
          >
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.section
            key={m.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
            className="m4__hero"
          >
            <div className={`m4__hero-art m4__hero-art--${m.provider}`}>
              <span className="m4__hero-art-num">{m.warmth_score ?? 0}</span>
              <span className="m4__hero-art-lbl">warmth</span>
            </div>
            <div className="m4__hero-body">
              <span className="m4__hero-eyebrow">
                {safeIdx + 1} / {mailboxes.length} · {providerLabel(m.provider)}
              </span>
              <h2 className="m4__hero-email">{m.email_address}</h2>
              <div className="m4__hero-meta">
                <StatusPill status={m.warmup_status} />
                <span className="m4__hero-meta-dot" />
                <span>
                  Day {m.current_day} of 30
                </span>
                <span className="m4__hero-meta-dot" />
                <span>
                  {sentToday}/{m.daily_target} sent today
                </span>
              </div>
              <div className="m4__hero-bar">
                <span
                  style={{ width: `${sentPct}%` }}
                  className={`m4__hero-bar-fill m4__hero-bar-fill--${tone}`}
                />
              </div>
              <div className="m4__hero-stats">
                <Stat
                  label="Warmth trend"
                  num={
                    spark.length >= 2
                      ? `${spark[spark.length - 1]! - spark[0]! >= 0 ? '+' : ''}${spark[spark.length - 1]! - spark[0]!}`
                      : '—'
                  }
                  sub={spark.length >= 2 ? `${spark.length}d delta` : 'no data'}
                />
                <Stat
                  label="Domain records (DNS)"
                  num={`${[m.spf_valid, m.dkim_valid, m.dmarc_valid].filter((v) => v === true).length}/3`}
                  sub="valid"
                />
                <Stat label="Daily target" num={`${m.daily_target}`} sub="emails/day" />
              </div>
              <div className="m4__hero-actions">
                <button
                  className="m4-btn m4-btn--ghost"
                  type="button"
                  onClick={handlePauseToggle}
                  disabled={togglePending}
                >
                  {m.warmup_status === 'paused' ? (
                    <>
                      <Play size={11} strokeWidth={2.4} /> Resume
                    </>
                  ) : (
                    <>
                      <Pause size={11} strokeWidth={2.4} /> Pause
                    </>
                  )}
                </button>
                <Link
                  to={`/app/mailboxes/${m.id}`}
                  className="m4-btn m4-btn--primary"
                >
                  Open mailbox
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </Link>
              </div>
            </div>
            <div className="m4__hero-side">
              <header className="m4__hero-side-head">
                <span>{spark.length}-DAY WARMTH</span>
              </header>
              <HeroSparkline data={spark} height={120} />
              <div className="m4__hero-dns">
                <DnsRow label="SPF" ok={!!m.spf_valid} />
                <DnsRow label="DKIM" ok={!!m.dkim_valid} />
                <DnsRow label="DMARC" ok={!!m.dmarc_valid} />
              </div>
            </div>
          </motion.section>
        </AnimatePresence>

        {mailboxes.length > 1 && (
          <button
            type="button"
            className="m4__nav m4__nav--next"
            onClick={next}
            aria-label="Next mailbox"
          >
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="m4__strip">
        {mailboxes.map((thumb, i) => (
          <button
            key={thumb.id}
            type="button"
            onClick={() => setIdx(i)}
            className={`m4__thumb ${i === safeIdx ? 'm4__thumb--active' : ''}`}
          >
            <ProviderSwatch provider={thumb.provider} size={24} />
            <span className="m4__thumb-text">
              <span className="m4__thumb-email">
                {thumb.email_address.split('@')[0]}
              </span>
              <span className="m4__thumb-warmth">{thumb.warmth_score ?? 0}</span>
            </span>
            <span className={`m4__thumb-dot m4__thumb-dot--${toneFor(thumb)}`} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="m4__thumb m4__thumb--add"
        >
          <Plus size={14} strokeWidth={2.6} />
          <span>Add mailbox</span>
        </button>
      </div>
      <AddMailboxDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

// ─── Inline helpers (production-typed against real Mailbox) ─────────

function toneFor(m: Mailbox): 'success' | 'warning' | 'danger' {
  if (m.warmup_status === 'paused') return 'danger';
  if ((m.warmth_score ?? 0) >= 80) return 'success';
  return 'warning';
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

const STATUS_META: Record<MailboxStatus, { lbl: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
  active: { lbl: 'Active', tone: 'success' },
  pending: { lbl: 'Warming', tone: 'warning' },
  paused: { lbl: 'Paused', tone: 'danger' },
  completed: { lbl: 'Done', tone: 'info' },
};

function StatusPill({ status }: { status: MailboxStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`mb-status mb-status--${meta.tone}`}>
      <span className={`mb-status__dot mb-status__dot--${meta.tone}`} />
      {meta.lbl}
    </span>
  );
}

function DnsRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="m4__dns-row">
      <span>{label}</span>
      <span className={`mb-dns-cell mb-dns-cell--${ok ? 'ok' : 'err'}`}>
        {ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
      </span>
    </div>
  );
}

function ProviderSwatch({ provider, size = 26 }: { provider: MailboxProvider; size?: number }) {
  const letter =
    provider === 'gmail'
      ? 'G'
      : provider === 'outlook'
      ? 'O'
      : provider === 'yahoo'
      ? 'Y'
      : 'S';
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

function Stat({ label, num, sub }: { label: string; num: string; sub: string }) {
  return (
    <div className="m4__stat">
      <span className="m4__stat-lbl">{label}</span>
      <span className="m4__stat-num">{num}</span>
      <span className="m4__stat-sub">{sub}</span>
    </div>
  );
}

function HeroSparkline({ data, height = 60 }: { data: number[]; height?: number }) {
  if (data.length < 2) {
    return (
      <div
        style={{ height, display: 'grid', placeItems: 'center', color: 'var(--wp-text-faint)', fontSize: 11 }}
      >
        Not enough data yet
      </div>
    );
  }
  const width = 600;
  const PAD = 4;
  const max = 100;
  const min = 0;
  const step = (width - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: PAD + i * step,
    y: height - PAD - ((v - min) / (max - min)) * (height - PAD * 2),
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${path} L ${last.x} ${height - PAD} L ${first.x} ${height - PAD} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
    >
      <defs>
        <linearGradient id="pro-mb-hero-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity={0.4} />
          <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#pro-mb-hero-spark)" />
      <path
        d={path}
        fill="none"
        stroke="#FF9670"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill="#FF9670" />
    </svg>
  );
}

export default ProMailboxes;
