import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText, Layers, Share2 } from 'lucide-react';
import { DEMO_REPORTS, REPORT_TYPE_META, TONE_HEX, relTime } from './demoReports';

/**
 * R4 — Report Stack. Spotify Wrapped-style vertical card stack.
 * Each report = one big editorial card.
 */
export function R4Stack() {
  return (
    <div className="r4">
      <header className="r4__head">
        <div>
          <span className="r4-eyebrow"><Layers size={11} strokeWidth={2.4} />Report stack</span>
          <h2 className="r4__head-title">Your reports, told as stories</h2>
        </div>
        <span className="r4__head-meta">{DEMO_REPORTS.length} reports · scroll to flip through</span>
      </header>

      <div className="r4__stack">
        {DEMO_REPORTS.slice(0, 8).map((r, i) => {
          const meta = REPORT_TYPE_META[r.type];
          const Icon = meta.Icon;
          return (
            <motion.section
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, delay: (i % 3) * 0.05 }}
              className={`r4__card r4__card--${meta.tone}`}
              style={{
                background: `linear-gradient(135deg, ${TONE_HEX[meta.tone]} 0%, ${TONE_HEX[meta.tone]}11 60%, var(--wp-surface) 100%)`,
              }}
            >
              <div className="r4__card-glow" aria-hidden />

              <header className="r4__card-head">
                <span className="r4__card-fmt">
                  {r.format === 'pdf' ? <FileText size={11} strokeWidth={2.4} /> : <FileSpreadsheet size={11} strokeWidth={2.4} />}
                  {r.format.toUpperCase()}
                </span>
                <span className="r4__card-no">№ {String(i + 1).padStart(2, '0')}</span>
              </header>

              <div className="r4__card-art">
                <Icon size={48} strokeWidth={1.6} />
              </div>

              <div className="r4__card-text">
                <span className="r4__card-eyebrow">{meta.label} · {r.range}</span>
                <h3 className="r4__card-title">{r.title}</h3>
                <p className="r4__card-prose">
                  In the period <strong>{r.range}</strong>, your warmup workspace
                  produced this snapshot — <strong>{r.highlight.value}</strong>{' '}
                  {r.highlight.label.toLowerCase()}. {r.scheduled
                    ? `Auto-generated as part of the ${r.scheduled} schedule.`
                    : 'Generated on-demand.'}
                </p>
              </div>

              <div className="r4__card-hero">
                <span className="r4__card-hero-num">{r.highlight.value}</span>
                <span className="r4__card-hero-lbl">{r.highlight.label}</span>
              </div>

              <footer className="r4__card-foot">
                <span className="r4__card-meta">
                  {r.format === 'pdf' && r.pages !== undefined && (
                    <>
                      <span>{r.pages} pages</span>
                      <span className="r4__card-meta-dot" />
                    </>
                  )}
                  <span>{r.sizeKb} KB</span>
                  <span className="r4__card-meta-dot" />
                  <span>{relTime(r.createdAt)}</span>
                </span>
                <div className="r4__card-actions">
                  <button type="button" className="r4__card-btn r4__card-btn--ghost">
                    <Share2 size={11} strokeWidth={2.4} />
                  </button>
                  <button type="button" className="r4__card-btn r4__card-btn--primary">
                    <Download size={11} strokeWidth={2.4} />
                    Download
                  </button>
                </div>
              </footer>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
