import { leadFetchBlock, searchCooldownOf, useWorkspaceStatus, waitWords } from '../lib/status';
import type { RunFrequency } from '../lib/types';

export const FREQUENCY_LABEL: Record<RunFrequency, string> = {
  '15m': 'every 15 min',
  '1h': 'every hour',
  '6h': 'every 6 hours',
  daily: 'once a day',
};

type Tone = 'success' | 'accent' | 'warn' | 'gray' | 'danger';

/** One honest sentence about the robot: running now / on / paused / off / offline. */
export function useAutopilotSummary(demo = false): { tone: Tone; label: string; detail: string; pulse: boolean } {
  const { pipeline, error } = useWorkspaceStatus();
  if (demo) return { tone: 'gray', label: 'Demo data', detail: 'Offline demo: nothing here is real.', pulse: false };
  if (error && !pipeline) return { tone: 'danger', label: 'Status unavailable', detail: error, pulse: false };
  if (!pipeline) return { tone: 'gray', label: 'Checking…', detail: '', pulse: false };
  if (pipeline.cycleRunning)
    return { tone: 'accent', label: 'Searching now', detail: 'Finding and researching new companies.', pulse: true };
  // the setup has no proper data yet: nothing can fetch leads, not even autopilot
  const gate = leadFetchBlock(pipeline);
  if (gate) return { tone: 'warn', label: 'Lead finding off', detail: gate.message, pulse: false };
  // the last search found nothing: every search engine was rate-limiting us
  // and they are still resting — say so, and roughly for how long
  const cooldown = searchCooldownOf(pipeline);
  if (cooldown)
    return {
      tone: 'warn',
      label: 'Search paused',
      detail: `The search engines are rate-limiting us. We can try again ${waitWords(cooldown.inMinutes)}.`,
      pulse: false,
    };
  if (!pipeline.autopilot)
    return { tone: 'gray', label: 'Autopilot paused', detail: 'Searches only run when you start one.', pulse: false };
  if (!pipeline.workerOnline)
    return {
      tone: 'warn',
      label: 'Autopilot on',
      detail: 'The background scheduler is not running, so automatic searches are on hold.',
      pulse: false,
    };
  const next = pipeline.nextRunInMinutes;
  return {
    tone: 'success',
    label: 'Autopilot on',
    detail: `Searches ${FREQUENCY_LABEL[pipeline.frequency]}${next != null ? ` · next in ${next} min` : ' · starting soon'}`,
    pulse: true,
  };
}

export function AutopilotPill({ demo = false, compact = false }: { demo?: boolean; compact?: boolean }) {
  const s = useAutopilotSummary(demo);
  return (
    <span className={`status-pill tone-${s.tone}`} title={s.detail || undefined}>
      <span className={`status-dot dot-${s.tone}${s.pulse ? ' dot-pulse' : ''}`} aria-hidden />
      <span>{s.label}</span>
      {!compact && s.detail && <span className="status-pill-detail">{s.detail}</span>}
    </span>
  );
}
