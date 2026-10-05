import { PipelineFlow } from '../components/PipelineFlow';
import { StatusStrip } from '../components/StatusStrip';
import { AutopilotPanel } from '../components/AutopilotPanel';

/**
 * Pipeline — the orchestrator view from the handwritten sketch:
 *   USER → ORCHESTRATOR → SEARCH → PROFILE → COPYWRIGHT → RESPONDER
 *   with the continuous LOOP rail and backend-readiness strip,
 *   plus AI Autopilot (full machine control after user consent).
 */
export function PipelinePage({ live }: { live: boolean }) {
  return (
    <div className="page">
      <PipelineFlow live={live} />
      <StatusStrip live={live} />
      <AutopilotPanel />
    </div>
  );
}
