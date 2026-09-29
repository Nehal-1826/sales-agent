import { CrmBoard } from '../components/CrmBoard';
import { PageHeader } from '../components/ui';

/** CRM page — LEADS · POTENTIAL · REPLY (mock data only). */
export function CrmPage() {
  return (
    <div className="page">
      <PageHeader
        title="CRM"
        subtitle="Fed autonomously by the pipeline: LEADS from Search, POTENTIAL from Profile, REPLY from the Responder."
      />
      <div className="panel">
        <CrmBoard />
      </div>
    </div>
  );
}
