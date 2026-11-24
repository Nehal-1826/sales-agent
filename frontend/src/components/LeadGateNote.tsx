import { Banner } from './feedback';
import { navigate } from '../lib/router';
import { leadFetchFixSection, useLeadFetchBlock } from '../lib/status';

/**
 * "Lead finding is off" — why, in plain words, and the way to fix it. Shown
 * on the pages where leads are expected; Home's status tile says it there.
 * Nothing is rendered once the setup has proper data.
 */
export function LeadGateNote() {
  const gate = useLeadFetchBlock();
  if (!gate) return null;
  return (
    <div className="lead-gate-note">
      <Banner
        tone="warn"
        title="Lead finding is off"
        action={
          <button className="btn btn-primary btn-sm" onClick={() => navigate('settings', leadFetchFixSection(gate))}>
            Add what's missing
          </button>
        }
      >
        {gate.message}
      </Banner>
    </div>
  );
}
