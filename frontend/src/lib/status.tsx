import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from '../components/feedback';
import { errorMessage, getOutreachStatus, getPipelineStatus, runPipeline } from './api';
import type { LeadFetchStatus, OutreachStatus, PipelineStatus, SettingsSection } from './types';

/**
 * One live picture of the workspace for the whole shell (sidebar, top bar,
 * Home, Activity): autopilot on/off, whether a cycle is running right now,
 * worker heartbeat and the approval queue size. Polls every 15 s, every 3 s
 * while a cycle runs, and pauses while the tab is hidden.
 */

interface WorkspaceStatus {
  pipeline: PipelineStatus | null;
  outreach: OutreachStatus | null;
  error: string | null;
  /** increments whenever a cycle finishes — pages put it in their reload deps */
  cycleVersion: number;
  refresh: () => Promise<void>;
  /** Start a cycle in the background; resolves once the server accepted it. */
  startCycle: () => Promise<boolean>;
}

const Ctx = createContext<WorkspaceStatus | null>(null);

const IDLE_MS = 15_000;
const RUNNING_MS = 3_000;

export function WorkspaceStatusProvider({ children }: { children: ReactNode }) {
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [outreach, setOutreach] = useState<OutreachStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cycleVersion, setCycleVersion] = useState(0);
  const wasRunning = useRef(false);
  /** the latest status, for callers that act between two polls (startCycle) */
  const latest = useRef<PipelineStatus | null>(null);
  latest.current = pipeline;
  /** newest run id seen while idle — a finish only counts if a NEWER run shows up */
  const baseRunId = useRef(0);
  /** when we first saw "not running" while still waiting for the new run's record */
  const idleSince = useRef<number | null>(null);
  const kick = useRef<() => void>(() => undefined);

  const refresh = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([getPipelineStatus(), getOutreachStatus()]);
      setPipeline(p);
      setOutreach(o);
      setError(null);
      const r = p.lastRun;
      if (!wasRunning.current) baseRunId.current = r?.id ?? 0;
      if (wasRunning.current && !p.cycleRunning) {
        if (r && r.id > baseRunId.current) {
          // a cycle just finished — tell the user what it produced
          setCycleVersion((v) => v + 1);
          toast.success(
            `Search finished: ${r.leadsCreated} new compan${r.leadsCreated === 1 ? 'y' : 'ies'}, ${r.draftsCreated} email${r.draftsCreated === 1 ? '' : 's'} written.`,
          );
          wasRunning.current = false;
          idleSince.current = null;
        } else {
          // "not running" with no new run record is a stale poll (or the run failed
          // before saving one): keep waiting briefly, never report the previous run's numbers
          idleSince.current ??= Date.now();
          if (Date.now() - idleSince.current > 60_000) {
            wasRunning.current = false;
            idleSince.current = null;
          }
        }
      } else {
        if (p.cycleRunning) idleSince.current = null;
        wasRunning.current = p.cycleRunning;
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    // ONE scheduler: every schedule() bumps the generation, so a tick that was
    // already awaiting a poll can't add a second timer after kick() replaced it
    let generation = 0;
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      const mine = ++generation;
      timer = window.setTimeout(() => void tick(mine), ms);
    };
    const tick = async (mine: number) => {
      if (mine !== generation || stopped) return;
      if (!document.hidden) await refresh();
      if (mine !== generation || stopped) return;
      schedule(wasRunning.current ? RUNNING_MS : IDLE_MS);
    };
    // restart the timer now (e.g. right after a cycle starts → fast polling)
    kick.current = () => {
      if (!stopped) schedule(RUNNING_MS);
    };
    schedule(0);
    // back on the tab, or another page inside the app (the router announces
    // both as popstate): the picture is refreshed at once — a setting fixed
    // on one page must show on the next, not 15 s later
    const onResume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('popstate', onResume);
    return () => {
      stopped = true;
      generation += 1;
      window.clearTimeout(timer);
      kick.current = () => undefined;
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('popstate', onResume);
    };
  }, [refresh]);

  const startCycle = useCallback(async () => {
    // lead finding is off until the setup has proper data (core.lead_gate).
    // The server refuses the run anyway (422) — this keeps the click honest
    // without a round trip, with the same words everywhere.
    const gate = leadFetchBlock(latest.current);
    if (gate) {
      toast.error(gate.message);
      return false;
    }
    const res = await runPipeline();
    if (!res.ok) {
      toast.error(res.error);
      await refresh();
      return false;
    }
    wasRunning.current = true;
    toast.info('Searching for new companies. This usually takes 2 to 5 minutes.');
    await refresh();
    kick.current();
    return true;
  }, [refresh]);

  return (
    <Ctx.Provider value={{ pipeline, outreach, error, cycleVersion, refresh, startCycle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspaceStatus(): WorkspaceStatus {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceStatus must be used inside WorkspaceStatusProvider');
  return ctx;
}

/** The lead-finding gate of a live status: what still blocks lead finding,
 *  or null when nothing does (ready, not loaded yet, or an older server). */
export function leadFetchBlock(pipeline: PipelineStatus | null | undefined): LeadFetchStatus | null {
  const gate = pipeline?.leadFetch;
  return gate && !gate.ready ? gate : null;
}

/** Same, from the live status — use it wherever "Find leads now" lives. */
export function useLeadFetchBlock(): LeadFetchStatus | null {
  const { pipeline } = useWorkspaceStatus();
  return leadFetchBlock(pipeline);
}

/** Where the person fixes what is missing: the first Settings section named
 *  by the gate (the business profile covers the name and what you sell). */
export function leadFetchFixSection(gate: LeadFetchStatus): SettingsSection {
  return gate.missing.length === 1 && gate.missing[0] === 'who' ? 'targeting' : 'business';
}
