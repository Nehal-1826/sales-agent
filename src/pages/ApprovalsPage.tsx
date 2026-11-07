import { ApprovalQueue } from '../components/ApprovalQueue';
import { PageHeader } from '../components/ui';
import { WhatsAppApprovals } from '../components/WhatsAppApprovals';

/** APPROVALS — every email written for you, waiting for a yes before it leaves. */
export function ApprovalsPage() {
  return (
    <div className="page">
      <PageHeader
        title="Approvals"
        subtitle="Emails, follow-ups and WhatsApp messages written for your leads. Read, edit if you like, then approve. Nothing is sent without you."
      />
      <section className="panel">
        <ApprovalQueue />
      </section>
      <WhatsAppApprovals />
    </div>
  );
}
