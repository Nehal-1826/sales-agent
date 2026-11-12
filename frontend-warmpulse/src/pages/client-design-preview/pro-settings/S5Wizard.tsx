import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Mail,
  Plug,
} from 'lucide-react';
import {
  CATEGORIES,
  INTEGRATIONS,
  PROFILE,
  TIMEZONES,
  type CatKey,
} from './demoSettings';

/**
 * S5 — Wizard Steps.
 * Numbered vertical step rail (1 → 2 → … → 6) + right pane.
 * Best for onboarding flows or when settings have a natural order.
 */
export function S5Wizard() {
  const [stepIdx, setStepIdx] = useState(0);
  const completedSet = new Set<CatKey>(['profile']);
  const step = CATEGORIES[stepIdx]!;

  const canPrev = stepIdx > 0;
  const canNext = stepIdx < CATEGORIES.length - 1;

  return (
    <div className="s5">
      {/* Left step rail */}
      <aside className="s5__rail">
        <header className="s5__rail-head">
          <span className="s5__rail-eyebrow">Set up your workspace</span>
          <h3 className="s5__rail-title">{stepIdx + 1} of {CATEGORIES.length}</h3>
          <div className="s5__rail-progress">
            <div
              className="s5__rail-progress-fill"
              style={{ width: `${((stepIdx + 1) / CATEGORIES.length) * 100}%` }}
            />
          </div>
        </header>
        <ol className="s5__steps">
          {CATEGORIES.map((c, i) => {
            const isCurrent = i === stepIdx;
            const isDone = completedSet.has(c.key) && !isCurrent;
            const isPast = i < stepIdx;
            return (
              <li key={c.key} className="s5__step-row">
                <span
                  className={`s5__step-dot ${
                    isCurrent
                      ? 's5__step-dot--current'
                      : isDone || isPast
                        ? 's5__step-dot--done'
                        : ''
                  }`}
                >
                  {isDone || isPast ? <Check size={9} strokeWidth={2.6} /> : i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={`s5__step-btn ${isCurrent ? 's5__step-btn--active' : ''}`}
                >
                  <span className="s5__step-name">{c.name}</span>
                  <span className="s5__step-desc">{c.desc}</span>
                </button>
                {i < CATEGORIES.length - 1 && <span className="s5__step-line" />}
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Right pane */}
      <motion.section
        key={stepIdx}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22 }}
        className="s5__pane"
      >
        <header className="s5__pane-head">
          <span className="s5__pane-step">Step {stepIdx + 1}</span>
          <h2 className="s5__pane-title">{step.name}</h2>
          <p className="s5__pane-sub">{step.desc}</p>
        </header>

        <div className="s5__pane-body">
          {step.key === 'profile' && (
            <>
              <Row label="Workspace name">
                <input className="s5__input" defaultValue={PROFILE.workspaceName} />
              </Row>
              <Row label="Workspace URL slug">
                <div className="s5__slug">
                  <span>warmpulse.io /</span>
                  <input className="s5__input s5__input--slug" defaultValue={PROFILE.slug} />
                </div>
              </Row>
              <Row label="Default sender">
                <div className="s5__input-icon">
                  <Mail size={12} strokeWidth={2.4} />
                  <input className="s5__input" defaultValue={PROFILE.defaultSender} />
                </div>
              </Row>
              <Row label="Timezone">
                <div className="s5__input-icon">
                  <Globe2 size={12} strokeWidth={2.4} />
                  <select className="s5__input" defaultValue={PROFILE.timezone}>
                    {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                  </select>
                </div>
              </Row>
            </>
          )}

          {step.key === 'integrations' && (
            <div className="s5__integ-list">
              {INTEGRATIONS.map((i) => (
                <div key={i.key} className="s5__integ">
                  <div className={`s5__integ-logo s5__integ-logo--${i.brand}`}>{i.brand[0]!.toUpperCase()}</div>
                  <div className="s5__integ-text">
                    <span className="s5__integ-name">{i.name}</span>
                    <span className="s5__integ-desc">{i.desc}</span>
                  </div>
                  <button type="button" className={`s5__integ-btn s5__integ-btn--${i.status}`}>
                    {i.status === 'connected' ? 'Connected' : i.status === 'beta' ? 'Request beta' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {step.key !== 'profile' && step.key !== 'integrations' && (
            <div className="s5__hint">
              <Plug size={16} strokeWidth={2.4} />
              <p>
                This step would configure <strong>{step.name}</strong>. Switch to step 1 or 4 to see populated forms.
              </p>
            </div>
          )}
        </div>

        <footer className="s5__pane-foot">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => canPrev && setStepIdx(stepIdx - 1)}
            className="s5__nav-btn s5__nav-btn--ghost"
          >
            <ChevronLeft size={11} strokeWidth={2.4} />
            Previous
          </button>
          <span className="s5__foot-dots">
            {CATEGORIES.map((_, i) => (
              <span key={i} className={`s5__foot-dot ${i === stepIdx ? 's5__foot-dot--active' : ''}`} />
            ))}
          </span>
          {canNext ? (
            <button type="button" onClick={() => setStepIdx(stepIdx + 1)} className="s5__nav-btn s5__nav-btn--primary">
              Next
              <ChevronRight size={11} strokeWidth={2.4} />
            </button>
          ) : (
            <button type="button" className="s5__nav-btn s5__nav-btn--primary">
              Finish
              <Check size={11} strokeWidth={2.4} />
            </button>
          )}
        </footer>
      </motion.section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="s5__row">
      <span className="s5__row-label">{label}</span>
      <div className="s5__row-control">{children}</div>
    </div>
  );
}
