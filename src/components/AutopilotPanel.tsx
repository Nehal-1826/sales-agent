import { useEffect, useState } from 'react';
import { getAutopilot, setAutopilot } from '../lib/api';
import { SectionLabel, StatusDot } from './ui';
import type { AutopilotState } from '../lib/api';

/**
 * AI AUTOPILOT — the consent moment: the user explicitly accepts the AI
 * running the whole product (cycles, approvals, sending). Daily cap,
 * safety guards and a live activity log keep the human in the loop.
 */
export function AutopilotPanel() {
  const [state, setState] = useState<AutopilotState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);

  const refresh = () => getAutopilot().then((s) => s && setState(s));

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000); // live activity while autopilot works
    return () => clearInterval(t);
  }, []);

  const accept = async () => {
    setBusy(true);
    const s = await setAutopilot(true, limit);
    setBusy(false);
    setConfirming(false);
    if (s) setState(s);
  };

  const revoke = async () => {
    setBusy(true);
    const s = await setAutopilot(false);
    setBusy(false);
    if (s) setState(s);
  };

  if (state === null) return null;
  const pct = Math.min(100, Math.round((state.sentToday / Math.max(1, state.dailyLimit)) * 100));

  return (
    <section className="panel autopilot-panel">
      <div className="autopilot-head">
        <span className="agent-icon autopilot-icon">⚡</span>
        <div>
          <strong>AI Autopilot</strong>
          <small>Let the AI run the whole machine — you supervise</small>
        </div>
        <span className={`chip ${state.enabled ? 'chip-success' : ''}`}>
          <StatusDot tone={state.enabled ? 'success' : 'gray'} pulse={state.enabled} />
          {state.enabled ? 'In control' : 'You are in control'}
        </span>
      </div>

      {state.enabled ? (
        <>
          <div className="autopilot-meter">
            <div className="autopilot-meter-bar">
              <div className="autopilot-meter-fill" style={{ width: `${pct}%` }} />
            </div>
            <small>
              {state.sentToday}/{state.dailyLimit} auto-sends today (cap)
            </small>
          </div>
          <div className="autopilot-actions">
            <button className="btn" disabled={busy} onClick={revoke}>
              {busy ? 'Revoking…' : '🛑 Take back control'}
            </button>
          </div>
        </>
      ) : (
        <div className="autopilot-actions">
          <button className="btn btn-primary" onClick={() => setConfirming(true)}>
            ⚡ Accept AI control
          </button>
          <small className="inline-msg">Off by default — nothing sends without your approval.</small>
        </div>
      )}

      {state.activity.length > 0 && (
        <div className="autopilot-log">
          <SectionLabel>Autopilot activity</SectionLabel>
          {state.activity.map((a, i) => (
            <div className="autopilot-log-row" key={i}>
              <span className={`autopilot-tag tag-${a.action}`}>{a.action.replace('_', ' ')}</span>
              <span>{a.detail || '—'}</span>
              <small>{new Date(a.time).toLocaleTimeString()}</small>
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <div className="scrim autopilot-scrim" onClick={() => setConfirming(false)} aria-hidden>
          <div className="panel autopilot-modal" onClick={(e) => e.stopPropagation()}>
            <strong>⚡ Give the AI full control?</strong>
            <p>
              Once you accept, the orchestrator runs the whole product on its own:
            </p>
            <ul>
              <li>Runs pipeline cycles on your schedule</li>
              <li>
                <strong>Approves and sends cold emails itself</strong> — only to recipients
                genuinely scraped from lead websites, never guessed addresses
              </li>
              <li>Hard daily cap you set below — never exceeded</li>
              <li>Never retries addresses that bounced before</li>
              <li>Every action is logged above — visible in real time</li>
            </ul>
            <label className="check-row">
              Daily auto-send cap:
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                <option value={5}>5 emails</option>
                <option value={10}>10 emails</option>
                <option value={20}>20 emails</option>
                <option value={50}>50 emails</option>
              </select>
            </label>
            <div className="autopilot-actions">
              <button className="btn btn-primary" onClick={accept} disabled={busy}>
                {busy ? 'Enabling…' : 'I accept — enable Autopilot'}
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
            <small className="inline-msg">You can revoke control anytime with one click.</small>
          </div>
        </div>
      )}
    </section>
  );
}
