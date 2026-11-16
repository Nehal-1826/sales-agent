import { useEffect, useRef, useState } from 'react';
import { navigate } from '../lib/router';
import type { TourStep } from '../lib/tutor';
import {
  RESUME_TOUR_EVENT,
  TOUR_STEPS,
  setTourDoneLocally,
  setTourDoneOnServer,
  tourDoneLocally,
  tourDoneOnServer,
} from '../lib/tutor';

/**
 * FIRST-LOGIN TUTOR — a small spotlight card (bottom-right, no overlay:
 * clicks outside pass straight through) walking a new operator through
 * the six places that matter. Opens by itself exactly once per user —
 * the localStorage flag AND the server flag (User.onboarding.tour_done)
 * are both set on Finish/Skip, so it never re-opens by itself. The Help
 * panel header offers "Resume tour" to walk it again on demand.
 */
export function Tutor() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const lastStep = useRef(0);
  const total = TOUR_STEPS.length;
  const current: TourStep = TOUR_STEPS[step];
  const last = step === total - 1;

  // auto-open ON FIRST LOGIN ONLY: local flag first (instant), then the
  // server's per-user flag — whichever says "already seen" wins forever
  useEffect(() => {
    if (tourDoneLocally()) return;
    let cancelled = false;
    void tourDoneOnServer().then((done) => {
      if (cancelled) return;
      if (done) setTourDoneLocally(true);
      else {
        setStep(0);
        lastStep.current = 0;
        setOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Resume tour" (Help panel header) reopens where the user left off
  useEffect(() => {
    const onResume = () => {
      setStep(lastStep.current);
      setOpen(true);
    };
    window.addEventListener(RESUME_TOUR_EVENT, onResume);
    return () => window.removeEventListener(RESUME_TOUR_EVENT, onResume);
  }, []);

  // both flags on finish/skip — the tour must never re-open by itself
  const finish = () => {
    setOpen(false);
    setTourDoneLocally(true);
    void setTourDoneOnServer(true);
  };

  const go = (next: number) => {
    lastStep.current = Math.min(next, total - 1);
    setStep(lastStep.current);
  };

  const showMe = () => {
    navigate(current.showMe!.page, current.showMe!.sub ?? '');
    if (last) finish(); // "Show me" past the last step completes the tour
    else go(step + 1);
  };

  if (!open) return null;

  return (
    <aside className="tutor-card panel" role="dialog" aria-label={`Product tour — ${current.title}`}>
      <header className="tutor-head">
        <span className="tutor-kicker">Product tour</span>
        <span className="tutor-progress" aria-live="polite">
          {step + 1}/{total}
        </span>
        <button type="button" className="icon-btn tutor-close" onClick={finish} aria-label="Skip tour" title="Skip tour">
          ×
        </button>
      </header>

      <div className="tutor-body">
        <strong className="tutor-title">{current.title}</strong>
        <p>{current.body}</p>
        {current.showMe && (
          <button type="button" className="btn btn-ghost tutor-showme" onClick={showMe}>
            Show me
          </button>
        )}
      </div>

      <footer className="tutor-foot">
        <div className="tutor-dots" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span key={s.key} className={`tutor-dot${i === step ? ' active' : ''}${i < step ? ' seen' : ''}`} />
          ))}
        </div>
        <div className="tutor-actions">
          <button type="button" className="link-btn tutor-skip" onClick={finish}>
            Skip tour
          </button>
          <button type="button" className="btn btn-sm" disabled={step === 0} onClick={() => go(step - 1)}>
            Back
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={last ? finish : () => go(step + 1)}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </footer>
    </aside>
  );
}
