import { isDemo } from '../lib/api';
import { elapsedClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useWorkspaceStatus } from '../lib/status';

/** "Find leads now" — becomes a live "Searching… 1:42" while a cycle runs. */
export function CycleButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { pipeline, startCycle } = useWorkspaceStatus();
  const running = !!pipeline?.cycleRunning;
  const now = useNow(running);
  return (
    <button
      className={`btn btn-primary${size === 'sm' ? ' btn-sm' : ''}${running ? ' is-running' : ''}`}
      onClick={() => void startCycle()}
      disabled={running || !pipeline || isDemo()}
      aria-live="polite"
    >
      {running ? `Searching… ${elapsedClock(pipeline?.cycleStartedAt, now)}` : 'Find leads now'}
    </button>
  );
}
