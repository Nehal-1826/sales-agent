import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Plus } from 'lucide-react';
import { DEMO_MAILBOXES, providerLabel } from '../pro-dashboards/demoData';
import { DnsCell, HeroSparkline, ProviderSwatch, StatusPill, toneFor } from './shared';

/**
 * M4 — Carousel Stage.
 * Big "now playing" hero card for the selected mailbox.
 * Thumbnail strip below — click thumb or chevrons to swap hero.
 * Best for focus-mode, one mailbox at a time.
 */
export function M4Carousel() {
  const [idx, setIdx] = useState(0);
  const m = DEMO_MAILBOXES[idx]!;
  const tone = toneFor(m);
  const sentPct = Math.round((m.sentToday / m.dailyTarget) * 100);

  const prev = () => setIdx((i) => (i - 1 + DEMO_MAILBOXES.length) % DEMO_MAILBOXES.length);
  const next = () => setIdx((i) => (i + 1) % DEMO_MAILBOXES.length);

  return (
    <div className="m4">
      {/* Hero stage */}
      <div className="m4__stage">
        <button type="button" className="m4__nav m4__nav--prev" onClick={prev} aria-label="Previous mailbox">
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>

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
              <span className="m4__hero-art-num">{m.warmth}</span>
              <span className="m4__hero-art-lbl">warmth</span>
            </div>
            <div className="m4__hero-body">
              <span className="m4__hero-eyebrow">{idx + 1} / {DEMO_MAILBOXES.length} · {providerLabel(m.provider)}</span>
              <h2 className="m4__hero-email">{m.email}</h2>
              <div className="m4__hero-meta">
                <StatusPill status={m.status} />
                <span className="m4__hero-meta-dot" />
                <span>Day {m.day} of 30</span>
                <span className="m4__hero-meta-dot" />
                <span>{m.sentToday}/{m.dailyTarget} sent today</span>
              </div>
              <div className="m4__hero-bar">
                <span style={{ width: `${sentPct}%` }} className={`m4__hero-bar-fill m4__hero-bar-fill--${tone}`} />
              </div>
              <div className="m4__hero-stats">
                <Stat label="Warmth trend" num={`+${m.spark[m.spark.length - 1]! - m.spark[0]!}`} sub="14d delta" />
                <Stat label="DNS records" num={`${[m.spfOk, m.dkimOk, m.dmarcOk].filter(Boolean).length}/3`} sub="valid" />
                <Stat label="Daily target" num={`${m.dailyTarget}`} sub="emails/day" />
              </div>
              <div className="m4__hero-actions">
                <button className="m4-btn m4-btn--ghost" type="button">
                  {m.status === 'paused' ? <><Play size={11} strokeWidth={2.4} /> Resume</> : <><Pause size={11} strokeWidth={2.4} /> Pause</>}
                </button>
                <button className="m4-btn m4-btn--primary" type="button">
                  Open mailbox
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            <div className="m4__hero-side">
              <header className="m4__hero-side-head">
                <span>14-DAY WARMTH</span>
              </header>
              <HeroSparkline data={m.spark} height={120} />
              <div className="m4__hero-dns">
                <DnsRow label="SPF" ok={m.spfOk} />
                <DnsRow label="DKIM" ok={m.dkimOk} />
                <DnsRow label="DMARC" ok={m.dmarcOk} />
              </div>
            </div>
          </motion.section>
        </AnimatePresence>

        <button type="button" className="m4__nav m4__nav--next" onClick={next} aria-label="Next mailbox">
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
      </div>

      {/* Thumbnail strip */}
      <div className="m4__strip">
        {DEMO_MAILBOXES.map((thumb, i) => (
          <button
            key={thumb.id}
            type="button"
            onClick={() => setIdx(i)}
            className={`m4__thumb ${i === idx ? 'm4__thumb--active' : ''}`}
          >
            <ProviderSwatch provider={thumb.provider} size={24} />
            <span className="m4__thumb-text">
              <span className="m4__thumb-email">{thumb.email.split('@')[0]}</span>
              <span className="m4__thumb-warmth">{thumb.warmth}</span>
            </span>
            <span className={`m4__thumb-dot m4__thumb-dot--${toneFor(thumb)}`} />
          </button>
        ))}
        <button type="button" className="m4__thumb m4__thumb--add">
          <Plus size={14} strokeWidth={2.6} />
          <span>Add mailbox</span>
        </button>
      </div>
    </div>
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

function DnsRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="m4__dns-row">
      <span>{label}</span>
      <DnsCell ok={ok} />
    </div>
  );
}
