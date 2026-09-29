import { PipelineFlow } from '../components/PipelineFlow';
import { StatusStrip } from '../components/StatusStrip';

/**
 * Pipeline — the orchestrator view from the handwritten sketch:
 *   USER → ORCHESTRATOR → SEARCH → PROFILE → COPYWRIGHT → RESPONDER
 *   with the continuous LOOP rail and backend-readiness strip.
 * Lives on its own menu item (moved off the Dashboard).
 */
export function PipelinePage({ live }: { live: boolean }) {
  return (
    <div className="page">
      <PipelineFlow live={live} />
      <StatusStrip live={live} />
    </div>
  );
}
