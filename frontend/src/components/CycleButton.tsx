import { isDemo } from '../lib/api';
import { elapsedClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { leadFetchBlock, useWorkspaceStatus } from '../lib/status';

/**
 * "Find leads now" — becomes a live "Searching… 1:42" while a cycle runs.
 * Switched off, with the reason on hover, while the setup has no proper data
 * (core.lead_gate: company name, what you sell and who to find must be saved).
 */
export function CycleButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { pipeline, startCycle } = useWorkspaceStatus();
  const running = !!pipeline?.cycleRunning;
  const gate = leadFetchBlock(pipeline);
  const now = useNow(running);
  return (
    <button
      className={`btn btn-primary${size === 'sm' ? ' btn-sm' : ''}${running ? ' is-running' : ''}`}
      onClick={() => void startCycle()}
      disabled={running || !pipeline || isDemo() || !!gate}
      title={gate ? gate.message : undefined}
      aria-live="polite"
    >
      {running ? `Searching… ${elapsedClock(pipeline?.cycleStartedAt, now)}` : 'Find leads now'}
    </button>
  );
}
