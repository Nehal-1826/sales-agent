import { TierShell, ToolLauncher, TIER_CONFIG } from '@/features/tools/tier';

/**
 * /app/tools — Agency tier. Premium "Workbench": gradient hero with glow,
 * glass tiles with hover glow, ⌘K hint, spring motion. The richest tier.
 */
export function AgencyTools() {
  return (
    <TierShell config={TIER_CONFIG.agency}>
      <ToolLauncher config={TIER_CONFIG.agency} />
    </TierShell>
  );
}

export default AgencyTools;
