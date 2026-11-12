import { CrmWorkspace } from './CrmWorkspace';

/**
 * /app/crm for Pro Plus users.
 *
 * Pro Plus = richer. Cap is 10 campaigns — enough headroom that the summary
 * stats become the focal point rather than the cap. Same shared CRUD core.
 */
export function ProPlusCrm() {
  return (
    <CrmWorkspace
      flavor={{
        tierLabel: 'Pro Plus',
        tagline: 'Run up to ten campaigns with full lead tracking and CSV import.',
        emphasis: 'rich',
      }}
    />
  );
}

export default ProPlusCrm;
