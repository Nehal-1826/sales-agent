import { CrmWorkspace } from './CrmWorkspace';

/**
 * /app/crm for Starter workspaces that have purchased the CRM add-on.
 *
 * Same fully-wired CRUD core as Pro / Pro Plus / Agency — the backend caps the
 * add-on at 1 campaign / 500 leads, and the header cap-chip surfaces that. The
 * "focused" emphasis keeps the styling calm to match the Starter tier.
 */
export function StarterAddonCrm() {
  return (
    <CrmWorkspace
      flavor={{
        tierLabel: 'Starter · CRM add-on',
        tagline: 'Your add-on CRM — one focused pipeline to work your leads.',
        emphasis: 'focused',
      }}
    />
  );
}

export default StarterAddonCrm;
