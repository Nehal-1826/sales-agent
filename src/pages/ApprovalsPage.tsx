import { ApprovalQueue } from '../components/ApprovalQueue';
import { PageHeader } from '../components/ui';

/** APPROVALS — every email written for you, waiting for a yes before it leaves. */
export function ApprovalsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Approvals"
        subtitle="Emails written for your leads. Read, edit if you like, then approve. Nothing is sent without you."
      />
      <section className="panel">
        <ApprovalQueue />
      </section>
    </div>
  );
}
