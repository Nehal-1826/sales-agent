import { useEffect, useState } from 'react';
import { getAgentsLive, runPipeline } from '../lib/api';
import { AGENTS } from '../lib/mockData';
import { iconForAgent, IconLoop, IconOrchestrator, IconUser } from './icons';
import { StatusDot } from './ui';
import type { AgentMeta } from '../lib/types';

/** Animated vertical connector (dashed line + arrowhead). */
function Connector({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`connector${tall ? ' tall' : ''}`} aria-hidden>
      <svg viewBox="0 0 14 44" width="14" height={tall ? 56 : 44}>
        <line className="flow-line" x1="7" y1="2" x2="7" y2="32" />
        <polygon className="flow-arrow" points="7,42 2.5,31.5 11.5,31.5" />
      </svg>
    </div>
  );
}

/**
 * The autonomous pipeline from the handwritten notes:
 *
 *   USER → ORCHESTRATOR → SEARCH (SCRAPE) → PROFILE → COPYWRIGHT
 *        → RESPONDER (CHATBOT) → LOOP back to SEARCH
 *
 * Agent stats come from the backend when it is live. "Run cycle" triggers
 * one orchestrator loop (POST /api/pipeline/run/).
 */
export function PipelineFlow({ live, onRunComplete }: { live: boolean; onRunComplete?: () => void }) {
  const [agents, setAgents] = useState<AgentMeta[]>(AGENTS);
  const [running, setRunning] = useState(false);
  const [runNotes, setRunNotes] = useState<string[]>([]);

  useEffect(() => {
    getAgentsLive().then(setAgents);
  }, []);

  const triggerRun = async () => {
    if (running) return;
    setRunning(true);
    setRunNotes([]);
    const result = await runPipeline();
    if (result) {
      setRunNotes(result.notes);
      setAgents(await getAgentsLive());
      onRunComplete?.();
    } else {
      setRunNotes(['Backend not running — start Django to trigger a live cycle.']);
    }
    setRunning(false);
  };

  return (
    <div className="pipeline panel">
      <div className="panel-head">
        <span className="section-label">Autonomous pipeline</span>
        <div className="panel-head-actions">
          <span className="chip chip-accent">
            <IconLoop size={12} /> continuous loop
          </span>
          <button className="btn btn-primary btn-sm" onClick={triggerRun} disabled={running}>
            {running ? 'Running…' : 'Run cycle'}
          </button>
        </div>
      </div>

      <div className="pipeline-body">
        {/* USER → ORCHESTRATOR axis, centered on the agent column */}
        <div className="pipeline-axis">
          <div className="p-user">
            <span className="p-user-node">
              <IconUser size={14} />
              USER
            </span>
            <span className="p-user-cap">goal / query</span>
          </div>

          <Connector />

          <div className="orchestrator">
            <div className="orch-head">
              <span className="orch-icon">
                <IconOrchestrator size={20} />
              </span>
              <span className="orch-title">ORCHESTRATOR</span>
            </div>
            <p className="orch-sub">Autonomous control — plans, routes and schedules every agent run</p>
            <div className="orch-chips">
              <span>Pipeline control</span>
              <span>Scheduling</span>
              <span>Loop supervision</span>
            </div>
          </div>
        </div>

        <Connector tall />

        {/* Agents + control spine + loop rail */}
        <div className="pipeline-agents-wrap">
          <div className="pipeline-agents">
            {agents.map((agent, i) => {
              const Icon = iconForAgent[agent.key];
              return (
                <div className="agent-block" key={agent.key}>
                  <div className="agent-row">
                    <span className="spine-tick" aria-hidden />
                    <div className="agent-card">
                      <span className="agent-icon">
                        <Icon size={18} />
                      </span>
                      <div className="agent-info">
                        <span className="agent-name">{agent.name}</span>
                        <span className="agent-role">{agent.role}</span>
                      </div>
                      <div className="agent-meta">
                        <span className="agent-status">
                          <StatusDot tone={agent.status === 'Active' ? 'success' : 'gray'} pulse={agent.status === 'Active'} />
                          {agent.status}
                        </span>
                        <span className="agent-last">{agent.lastAction}</span>
                      </div>
                    </div>
                  </div>
                  {i < agents.length - 1 && <Connector />}
                </div>
              );
            })}
            <div className="loop-mobile" aria-hidden>
              <IconLoop size={13} /> LOOP — Responder feeds results back into Search
            </div>
          </div>

          {/* Continuous feedback loop: RESPONDER ↩ SEARCH */}
          <div className="loop-rail" aria-hidden>
            <svg className="loop-svg" viewBox="0 0 76 800" preserveAspectRatio="none">
              <path
                className="flow-line loop-path"
                vectorEffect="non-scaling-stroke"
                d="M 6 762 C 70 762, 70 38, 6 38"
              />
            </svg>
            <span className="loop-arrowhead" />
            <span className="loop-arrowhead loop-arrowhead-bottom" />
            <span className="loop-label">
              LOOP <em>continuous feedback</em>
            </span>
          </div>
        </div>
      </div>

      {runNotes.length > 0 && (
        <div className="run-result">
          <span className="section-label">Last cycle</span>
          <ul>
            {runNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
