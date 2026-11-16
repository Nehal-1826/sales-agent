import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AtSign,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Minus,
  Newspaper,
  Plus,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { useMailboxes } from '@/features/mailboxes/api';
import { useWarmupPreview } from '@/features/tools/api';
import type { WarmupSample, ContentMode } from '@/features/tools/types';
import './warmup-preview.css';

/* ============================================================================
   Content mode catalog
============================================================================ */
const MODES: Array<{
  mode: ContentMode;
  title: string;
  short: string;
  desc: string;
  Icon: typeof FileText;
  tone: 'violet' | 'cyan' | 'green' | 'yellow';
}> = [
  {
    mode: 'A',
    title: 'Transactional',
    short: 'A',
    desc: 'Plain text, neutral — receipts and updates.',
    Icon: FileText,
    tone: 'violet',
  },
  {
    mode: 'B',
    title: 'Styled HTML',
    short: 'B',
    desc: 'Branded HTML with header, body, unsubscribe.',
    Icon: Code2,
    tone: 'cyan',
  },
  {
    mode: 'C',
    title: 'Reply thread',
    short: 'C',
    desc: 'Conversational replies within existing threads.',
    Icon: MessageCircle,
    tone: 'green',
  },
  {
    mode: 'D',
    title: 'Newsletter',
    short: 'D',
    desc: 'Multi-section newsletter layout.',
    Icon: Newspaper,
    tone: 'yellow',
  },
];

/* ============================================================================
   Ramp ladder phases (mirrors backend services/warmup/ramp.ramp_target)
============================================================================ */
const RAMP_PHASES: Array<{ label: string; days: string; cap: number }> = [
  { label: 'Day 1–3', days: '3d', cap: 5 },
  { label: 'Day 4–7', days: '4d', cap: 10 },
  { label: 'Day 8–14', days: '7d', cap: 20 },
  { label: 'Day 15–21', days: '7d', cap: 35 },
  { label: 'Day 22–28', days: '7d', cap: 50 },
  { label: 'Day 29+', days: '∞', cap: 0 /* = dailyTarget */ },
];

export function WarmupPreview() {
  const mailboxesQ = useMailboxes();
  const mut = useWarmupPreview();
  const [mailboxId, setMailboxId] = useState('');
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<ContentMode>('A');
  const [index, setIndex] = useState(0);
  const [samples, setSamples] = useState<WarmupSample[]>([]);

  const mailboxes = mailboxesQ.data?.items ?? [];
  const selected = mailboxes.find((m) => m.id === mailboxId);
  const dailyTarget = selected?.daily_target ?? 50;

  // Sync count bounds (1–20).
  const incCount = () => setCount((c) => Math.min(20, c + 1));
  const decCount = () => setCount((c) => Math.max(1, c - 1));

  const run = async () => {
    if (!mailboxId) {
      toast.error('Select a mailbox first');
      return;
    }
    try {
      const res = await mut.mutateAsync({ mailbox_id: mailboxId, count, mode });
      setSamples(res.samples);
      setIndex(0);
    } catch {
      toast.error('Preview failed');
    }
  };

  const prev = () => setIndex((i) => (i - 1 + samples.length) % samples.length);
  const next = () => setIndex((i) => (i + 1) % samples.length);

  const noMailboxes = mailboxes.length === 0 && !mailboxesQ.isLoading;
  const currentMode = MODES.find((m) => m.mode === mode);

  return (
    <div className="wp">
      {/* ====================================================================
          Two-column split: inputs (left) + output (right)
      ==================================================================== */}
      <div className="wp-split">
        {/* ---------- Left rail — inputs ---------- */}
        <aside className="wp-rail">
          <header className="wp-rail__head">
            <span className="wp-rail__eyebrow">
              <Sparkles size={11} strokeWidth={2.4} />
              Sandbox
            </span>
            <h2 className="wp-rail__title">Warmup preview</h2>
            <p className="wp-rail__sub">
              Generate sample messages from the content engine without sending anything.
            </p>
          </header>

          {noMailboxes ? (
            <EmptyState
              icon={<Mail className="h-5 w-5" />}
              title="No mailboxes"
              description="Connect a mailbox first."
            />
          ) : (
            <>
              {/* Mailbox picker */}
              <div className="wp-field">
                <label className="wp-field__label">
                  <AtSign size={11} strokeWidth={2.4} />
                  Mailbox
                  <span className="wp-field__req" aria-hidden>*</span>
                </label>
                <AppSelect value={mailboxId} onValueChange={setMailboxId}>
                  <AppSelectTrigger>
                    <AppSelectValue placeholder="Choose…" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {mailboxes.map((m) => (
                      <AppSelectItem key={m.id} value={m.id}>
                        {m.email_address}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>

              {/* Sample count stepper */}
              <div className="wp-field">
                <label className="wp-field__label">
                  <Mail size={11} strokeWidth={2.4} />
                  Sample count
                </label>
                <div className="wp-stepper" role="group" aria-label="Sample count">
                  <button
                    type="button"
                    className="wp-stepper__btn"
                    onClick={decCount}
                    disabled={count <= 1}
                    aria-label="Decrease"
                  >
                    <Minus size={13} strokeWidth={2.6} />
                  </button>
                  <span className="wp-stepper__val">{count}</span>
                  <button
                    type="button"
                    className="wp-stepper__btn"
                    onClick={incCount}
                    disabled={count >= 20}
                    aria-label="Increase"
                  >
                    <Plus size={13} strokeWidth={2.6} />
                  </button>
                </div>
                <span className="wp-field__hint">1–20 samples per run</span>
              </div>

              {/* Content mode tiles */}
              <div className="wp-field">
                <label className="wp-field__label">
                  <Wand2 size={11} strokeWidth={2.4} />
                  Content mode
                </label>
                <div className="wp-modes">
                  {MODES.map((m) => {
                    const Icon = m.Icon;
                    const active = mode === m.mode;
                    return (
                      <button
                        key={m.mode}
                        type="button"
                        className={`wp-mode wp-mode--${m.tone} ${active ? 'wp-mode--active' : ''}`}
                        onClick={() => setMode(m.mode)}
                        aria-pressed={active}
                      >
                        <span className={`wp-mode__icon wp-mode__icon--${m.tone}`}>
                          <Icon size={13} strokeWidth={2.4} />
                        </span>
                        <span className="wp-mode__head">
                          <span className="wp-mode__short">{m.short}</span>
                          <span className="wp-mode__title">{m.title}</span>
                        </span>
                        <span className="wp-mode__desc">{m.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                onClick={run}
                disabled={mut.isPending || !mailboxId}
                leftIcon={
                  mut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )
                }
                className="w-full"
              >
                {mut.isPending ? 'Generating…' : 'Generate samples'}
              </Button>
            </>
          )}

          {/* Ramp ladder mini-card */}
          <div className="wp-ramp">
            <header className="wp-ramp__head">
              <span className="wp-ramp__title">30-day ramp ladder</span>
              <span className="wp-ramp__sub">
                {selected ? selected.email_address : 'Daily target'} · {dailyTarget}/day
              </span>
            </header>
            <RampLadder dailyTarget={dailyTarget} />
          </div>
        </aside>

        {/* ---------- Right pane — output ---------- */}
        <section className="wp-stage">
          {samples.length === 0 ? (
            <EmptyStage modeLabel={currentMode?.title ?? 'Transactional'} isPending={mut.isPending} />
          ) : (
            <SampleCarousel
              samples={samples}
              index={index}
              onPrev={prev}
              onNext={next}
              onJump={setIndex}
              modeTone={currentMode?.tone ?? 'violet'}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================================================================
   Empty stage (right pane, no samples yet)
============================================================================ */
function EmptyStage({ modeLabel, isPending }: { modeLabel: string; isPending: boolean }) {
  return (
    <div className="wp-empty">
      <div className="wp-empty__icon">
        {isPending ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : (
          <Wand2 className="h-7 w-7" />
        )}
      </div>
      <h3 className="wp-empty__title">
        {isPending ? 'Generating samples…' : 'Preview is empty'}
      </h3>
      <p className="wp-empty__sub">
        {isPending
          ? 'Calling the content engine, this usually takes a few seconds.'
          : `Pick a mailbox, choose how many samples and which mode (${modeLabel}), then hit Generate.`}
      </p>
    </div>
  );
}

/* ============================================================================
   Sample carousel — main preview card + thumbnail strip
============================================================================ */
function SampleCarousel({
  samples,
  index,
  onPrev,
  onNext,
  onJump,
  modeTone,
}: {
  samples: WarmupSample[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (i: number) => void;
  modeTone: string;
}) {
  const sample = samples[index];
  if (!sample) return null;

  return (
    <>
      <header className="wp-stage__head">
        <div>
          <span className={`wp-stage__pill wp-stage__pill--${modeTone}`}>
            Sample {index + 1} / {samples.length}
          </span>
          <h2 className="wp-stage__title">{sample.subject}</h2>
          <p className="wp-stage__meta">
            <AtSign size={11} strokeWidth={2.4} />
            To {sample.peer_email_mock}
            <span className="wp-stage__sep">·</span>
            <span className="wp-stage__format">
              {sample.is_html ? 'HTML' : 'Plain text'}
            </span>
          </p>
        </div>
        <div className="wp-stage__nav">
          <button
            type="button"
            className="wp-stage__nav-btn"
            onClick={onPrev}
            disabled={samples.length <= 1}
            aria-label="Previous sample"
          >
            <ChevronLeft size={14} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            className="wp-stage__nav-btn"
            onClick={onNext}
            disabled={samples.length <= 1}
            aria-label="Next sample"
          >
            <ChevronRight size={14} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.22 }}
          className="wp-sample"
        >
          {sample.is_html ? (
            <iframe
              title="Sample body"
              srcDoc={sample.body}
              sandbox=""
              className="wp-sample__iframe"
            />
          ) : (
            <pre className="wp-sample__plain">{sample.body}</pre>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Thumbnail strip — click to jump. Hidden when there's only 1 sample. */}
      {samples.length > 1 && (
        <div className="wp-thumbs" role="tablist">
          {samples.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`wp-thumb ${i === index ? 'wp-thumb--active' : ''}`}
              onClick={() => onJump(i)}
              title={s.subject}
            >
              <span className="wp-thumb__num">{i + 1}</span>
              <span className="wp-thumb__title">{s.subject}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ============================================================================
   Ramp ladder — 6 phase bars, increasing height (no chart library)
============================================================================ */
function RampLadder({ dailyTarget }: { dailyTarget: number }) {
  const phases = useMemo(
    () =>
      RAMP_PHASES.map((p) => ({
        ...p,
        // Phase D29+ uses the full daily target; others are capped to their
        // ladder cap unless the daily target is even smaller.
        effective: p.cap === 0 ? dailyTarget : Math.min(p.cap, dailyTarget),
      })),
    [dailyTarget],
  );
  const max = Math.max(1, ...phases.map((p) => p.effective));

  return (
    <div className="wp-ramp__chart">
      {phases.map((p, i) => {
        const heightPct = Math.max(8, (p.effective / max) * 100);
        return (
          <div key={i} className="wp-ramp__col" title={`${p.label}: ${p.effective}/day`}>
            <span className="wp-ramp__cap">{p.effective}</span>
            <div className="wp-ramp__bar-wrap">
              <motion.div
                className="wp-ramp__bar"
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: 'easeOut' }}
              />
            </div>
            <span className="wp-ramp__label">{p.label.replace('Day ', '')}</span>
          </div>
        );
      })}
    </div>
  );
}

export default WarmupPreview;
