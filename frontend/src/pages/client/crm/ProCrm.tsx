import { CrmWorkspace } from './CrmWorkspace';

/**
 * /app/crm for Pro-tier users.
 *
 * Pro = focused / clean. Cap is 3 campaigns, so the header leans on the
 * "N slots remaining" framing to keep the limit front-of-mind. The full
 * CRUD experience is shared via `CrmWorkspace`.
 */
export function ProCrm() {
  return (
    <CrmWorkspace
      flavor={{
        tierLabel: 'Pro',
        tagline: 'Manage leads alongside a warmed-up inbox.',
        emphasis: 'focused',
      }}
    />
  );
}

export default ProCrm;
