import { CrmWorkspace } from './CrmWorkspace';

/**
 * /app/crm for Agency users.
 *
 * Agency = command center. Leads are unlimited, so the header surfaces
 * the "Unlimited leads" emphasis and the copy leans into running an
 * entire book of business. Same shared CRUD core as Pro / Pro Plus.
 */
export function AgencyCrm() {
  return (
    <CrmWorkspace
      flavor={{
        tierLabel: 'Agency',
        tagline: 'Your command center — unlimited leads across every client.',
        emphasis: 'command',
      }}
    />
  );
}

export default AgencyCrm;
